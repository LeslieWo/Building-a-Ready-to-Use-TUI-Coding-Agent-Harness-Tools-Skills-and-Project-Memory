import { test, expect, afterEach } from "bun:test";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonMemoryStore } from "../src/memory/store";
const dirs: string[] = [];
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "agent-memory-"));
  dirs.push(dir);
  return { dir, store: new JsonMemoryStore(dir) };
}
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
const scope = {
  projectId: "p",
  revision: "rev1",
  baselineId: "orientation",
  trialId: "trial1",
};
const fact = {
  id: "test-command",
  content: "bun test",
  source: "package.json",
  sourceRevision: "rev1",
  updatedAt: "2026-10-21T00:00:00.000Z",
};
test("memory survives reopening and includes frozen baseline", async () => {
  const { dir, store } = await fixture();
  await store.upsert({ ...scope, trialId: "baseline" }, fact);
  expect(await new JsonMemoryStore(dir).list(scope)).toEqual([fact]);
});
test("trial writes cannot leak to other trials, baselines, projects or revisions", async () => {
  const { store } = await fixture();
  await store.upsert(scope, fact);
  expect(await store.list({ ...scope, trialId: "trial2" })).toEqual([]);
  expect(await store.list({ ...scope, trialId: "baseline" })).toEqual([]);
  expect(await store.list({ ...scope, projectId: "other" })).toEqual([]);
  expect(await store.list({ ...scope, revision: "rev2" })).toEqual([]);
});
test("revision mismatch is rejected", async () => {
  const { store } = await fixture();
  await expect(
    store.upsert(scope, { ...fact, sourceRevision: "rev2" }),
  ).rejects.toThrow("revision");
});
test("corrupt memory does not silently become empty", async () => {
  const { dir, store } = await fixture();
  await store.upsert(scope, fact);
  const name = (await readdir(dir)).find((n) => n.endsWith(".json"))!;
  await writeFile(join(dir, name), "broken");
  await expect(store.list(scope)).rejects.toThrow();
});
test("same-process concurrent writes preserve both facts", async () => {
  const { store } = await fixture();
  await Promise.all([
    store.upsert(scope, fact),
    store.upsert(scope, { ...fact, id: "other" }),
  ]);
  expect(await store.list(scope)).toHaveLength(2);
});
