import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loader = path.join(repoRoot, "scripts", "query-public-card.mjs");

function queryPublicPack(query) {
  const result = spawnSync(process.execPath, [loader, "--query", query], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

test("the approved first PublicCard is loadable by its question", () => {
  const result = queryPublicPack("写进 AGENTS.md 的规则，怎样确认在 Codex 中生效？");

  assert.equal(result.status, "ALLOW");
  assert.equal(result.reason_code, "OK");
  assert.equal(result.card.card_id, "AIHD-PC-000001");
  assert.equal(result.card.editorial, "APPROVED");
  assert.equal(result.card.verification, "PASS");
  assert.equal(result.card.privacy_gate, "PASS");
  assert.equal(result.card.publication, "READY");
});

test("the approved first PublicCard is loadable by an alias", () => {
  const result = queryPublicPack("怎样验证 Codex 已读取项目规则？");

  assert.equal(result.status, "ALLOW");
  assert.equal(result.card.card_id, "AIHD-PC-000001");
});

test("an unrelated query still misses the one-card public pack", () => {
  const result = queryPublicPack("完全无关的问题");

  assert.deepEqual(result, { status: "MISS", reason_code: "NO_MATCH" });
});
