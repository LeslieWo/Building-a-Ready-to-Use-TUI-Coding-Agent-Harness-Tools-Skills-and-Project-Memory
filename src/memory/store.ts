import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  FactSchema,
  ScopeSchema,
  type MemoryStore,
  type MemoryScope,
  type Fact,
} from "../contracts";

const DocumentSchema = z
  .object({
    version: z.literal(1),
    scope: ScopeSchema,
    facts: z.array(FactSchema).max(256),
  })
  .strict();
const isMissing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** Trusted application-data directory, never an agent-editable benchmark workspace. */
export class JsonMemoryStore implements MemoryStore {
  private readonly root: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(root: string) {
    this.root = resolve(root);
  }
  private file(scope: MemoryScope): string {
    return join(
      this.root,
      createHash("sha256").update(JSON.stringify(scope)).digest("hex") +
        ".json",
    );
  }
  private async read(scope: MemoryScope): Promise<Fact[]> {
    try {
      const path = this.file(scope);
      if ((await stat(path)).size > 2_500_000)
        throw new Error("memory_size_limit");
      const document = DocumentSchema.parse(
        JSON.parse(await readFile(path, "utf8")),
      );
      if (JSON.stringify(document.scope) !== JSON.stringify(scope))
        throw new Error("memory_scope_mismatch");
      if (document.facts.some((f) => f.sourceRevision !== scope.revision))
        throw new Error("memory_revision_mismatch");
      return document.facts;
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }
  async list(input: MemoryScope): Promise<Fact[]> {
    const scope = ScopeSchema.parse(input);
    await this.queue;
    const baseline = await this.read({ ...scope, trialId: "baseline" });
    const own = scope.trialId === "baseline" ? [] : await this.read(scope);
    return [
      ...new Map([...baseline, ...own].map((f) => [f.id, f])).values(),
    ].sort((a, b) => a.id.localeCompare(b.id));
  }
  async upsert(input: MemoryScope, inputFact: Fact): Promise<void> {
    const scope = ScopeSchema.parse(input);
    const fact = FactSchema.parse(inputFact);
    if (fact.sourceRevision !== scope.revision)
      throw new Error("memory_revision_mismatch");
    const operation = this.queue.then(async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const destination = this.file(scope);
      // Cross-instance/process contention fails explicitly. Never steal a stale lock.
      const lock = await open(destination + ".lock", "wx", 0o600);
      const temporary = destination + "." + randomUUID() + ".tmp";
      try {
        const facts = new Map((await this.read(scope)).map((f) => [f.id, f]));
        const previous = facts.get(fact.id);
        if (previous && previous.updatedAt > fact.updatedAt)
          throw new Error("stale_fact_update");
        facts.set(fact.id, fact);
        const document = DocumentSchema.parse({
          version: 1,
          scope,
          facts: [...facts.values()],
        });
        const content = JSON.stringify(document) + "\n";
        if (Buffer.byteLength(content) > 2_500_000)
          throw new Error("memory_size_limit");
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.writeFile(content);
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, destination);
      } finally {
        await unlink(temporary).catch((error) => {
          if (!isMissing(error)) throw error;
        });
        await lock.close();
        await unlink(destination + ".lock");
      }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
