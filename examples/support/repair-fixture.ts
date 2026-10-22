import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { ToolRegistry, ToolResult } from "../../src/contracts";

const initialSource = `def clamp(value, lower, upper):
    """Clamp to inclusive bounds. Reversed bounds must raise ValueError."""
    return min(lower, max(value, upper))
`;
const preamble = `import sys, unittest, ast, pathlib
sys.dont_write_bytecode = True
workspace = sys.argv.pop(1)
tree = ast.parse((pathlib.Path(workspace) / "solution.py").read_text())
allowed = (ast.Module, ast.FunctionDef, ast.arguments, ast.arg, ast.Expr, ast.Constant,
           ast.Return, ast.If, ast.IfExp, ast.Raise, ast.Compare, ast.Lt, ast.LtE,
           ast.Gt, ast.GtE, ast.Eq, ast.NotEq, ast.Name, ast.Load, ast.Call,
           ast.BoolOp, ast.And, ast.Or, ast.UnaryOp, ast.USub, ast.UAdd, ast.Not)
names = {"value", "lower", "upper", "min", "max", "ValueError"}
valid = len(tree.body) == 1 and isinstance(tree.body[0], ast.FunctionDef)
if valid:
    fn = tree.body[0]
    valid = (fn.name == "clamp" and not fn.decorator_list and fn.returns is None
             and [a.arg for a in fn.args.args] == ["value", "lower", "upper"]
             and not fn.args.defaults and not fn.args.vararg and not fn.args.kwarg
             and not fn.args.kwonlyargs and not fn.args.posonlyargs
             and sum(isinstance(n, ast.FunctionDef) for n in ast.walk(tree)) == 1)
for node in ast.walk(tree):
    valid = valid and isinstance(node, allowed)
    if isinstance(node, ast.Name): valid = valid and node.id in names
    if isinstance(node, ast.Call):
        valid = valid and isinstance(node.func, ast.Name) and node.func.id in {"min", "max", "ValueError"}
if not valid: raise RuntimeError("Candidate rejected by fixture AST policy")
sys.path.insert(0, workspace)
from solution import clamp
`;
const visibleTests =
  preamble +
  `class Visible(unittest.TestCase):
    def test_inside(self): self.assertEqual(clamp(5, 0, 10), 5)
    def test_below(self): self.assertEqual(clamp(-2, 0, 10), 0)
    def test_above(self): self.assertEqual(clamp(12, 0, 10), 10)
if __name__ == '__main__': unittest.main()
`;
const heldOutTests =
  preamble +
  `class HeldOut(unittest.TestCase):
    def test_equal_bounds(self): self.assertEqual(clamp(9, 3, 3), 3)
    def test_negative(self): self.assertEqual(clamp(-4, -10, -2), -4)
    def test_float(self): self.assertEqual(clamp(0.25, 0.0, 1.0), 0.25)
    def test_reversed(self):
        with self.assertRaises(ValueError): clamp(5, 10, 0)
if __name__ == '__main__': unittest.main()
`;

/** Acceptance fixture only. Restricted tool surface, NOT an OS security sandbox. */
export async function createRepairFixture() {
  const root = await mkdtemp(join(tmpdir(), "agent-repair-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const sourcePath = join(workspace, "solution.py");
  await writeFile(sourcePath, initialSource);
  await writeFile(join(root, "visible.py"), visibleTests);
  await writeFile(join(root, "heldout.py"), heldOutTests);
  const source = () => readFile(sourcePath, "utf8");
  const check = async (
    hidden: boolean,
    signal: AbortSignal,
  ): Promise<{ passed: boolean; output: string }> => {
    signal.throwIfAborted();
    return new Promise((resolve) => {
      execFile(
        "python3",
        ["-I", join(root, hidden ? "heldout.py" : "visible.py"), workspace],
        {
          cwd: workspace,
          signal,
          timeout: 10000,
          killSignal: "SIGKILL",
          maxBuffer: 128000,
          env: {
            PATH: "/usr/bin:/bin:/opt/homebrew/bin",
            HOME: root,
            TMPDIR: root,
            LANG: "C.UTF-8",
          },
        },
        (error, stdout, stderr) =>
          resolve({
            passed: !error,
            output: (
              stdout +
              stderr +
              (error && !stderr ? "Test process failed or was cancelled." : "")
            )
              .replaceAll(root, "$FIXTURE")
              .slice(0, 8000),
          }),
      );
    });
  };
  const tools: ToolRegistry = {
    describe: () => [
      {
        name: "read_source",
        description: "Read solution.py.",
        inputSchema: z.object({}).strict(),
      },
      {
        name: "read_tests",
        description: "Read the visible tests.",
        inputSchema: z.object({}).strict(),
      },
      {
        name: "replace_source",
        description:
          "Replace one exact occurrence in solution.py. Requires approval.",
        inputSchema: z
          .object({
            old: z.string().min(1).max(16000),
            replacement: z.string().max(16000),
          })
          .strict(),
      },
      {
        name: "run_tests",
        description: "Run the fixed visible Python tests.",
        inputSchema: z.object({}).strict(),
      },
    ],
    async execute(call, context): Promise<ToolResult> {
      context.signal.throwIfAborted();
      const result = (
        status: ToolResult["status"],
        output: string,
      ): ToolResult => ({ callId: call.id, status, output, truncated: false });
      if (context.workspace !== workspace)
        return result("error", "Workspace mismatch.");
      if (call.name === "read_source") return result("success", await source());
      if (call.name === "read_tests") return result("success", visibleTests);
      if (call.name === "replace_source") {
        const args = z
          .object({
            old: z.string().min(1).max(16000),
            replacement: z.string().max(16000),
          })
          .strict()
          .parse(call.arguments);
        const before = await source();
        if (before.split(args.old).length !== 2)
          return result("error", "Replacement must match exactly once.");
        if (
          !(await context.approval.request(
            {
              callId: call.id,
              description:
                "Modify solution.py in the disposable acceptance fixture.",
            },
            context.signal,
          ))
        )
          return result("denied", "Write denied.");
        context.signal.throwIfAborted();
        const after = before.replace(args.old, () => args.replacement);
        if (after.length > 20000)
          return result("error", "Source size limit exceeded.");
        await writeFile(sourcePath, after);
        return result("success", "Updated solution.py.");
      }
      if (call.name === "run_tests") {
        const outcome = await check(false, context.signal);
        return result(
          context.signal.aborted
            ? "cancelled"
            : outcome.passed
              ? "success"
              : "error",
          outcome.output,
        );
      }
      return result("error", "Unknown fixture tool.");
    },
  };
  return {
    workspace,
    tools,
    source,
    check,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
