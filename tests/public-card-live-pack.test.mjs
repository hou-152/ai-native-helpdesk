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

test("the approved AGENTS discovery PublicCard is loadable by its question", () => {
  const result = queryPublicPack("写进 AGENTS.md 的规则，怎样确认在 Codex 中生效？");

  assert.equal(result.status, "ALLOW");
  assert.equal(result.reason_code, "OK");
  assert.equal(result.card.card_id, "AIHD-PC-000001");
  assert.equal(result.card.editorial, "APPROVED");
  assert.equal(result.card.verification, "PASS");
  assert.equal(result.card.privacy_gate, "PASS");
  assert.equal(result.card.publication, "READY");
});

test("the approved AGENTS discovery PublicCard is loadable by an alias", () => {
  const result = queryPublicPack("怎样验证 Codex 已读取项目规则？");

  assert.equal(result.status, "ALLOW");
  assert.equal(result.card.card_id, "AIHD-PC-000001");
});

test("the approved Codex sandbox PublicCard is loadable by its question", () => {
  const result = queryPublicPack("Codex 已读取 AGENTS.md，但命令仍被沙箱或审批阻断，应该怎么排查？");

  assert.equal(result.status, "ALLOW");
  assert.equal(result.card.card_id, "AIHD-PC-000002");
  assert.equal(result.card.revision, "1.0.0");
});

test("the approved Codex sandbox PublicCard is loadable by an alias", () => {
  const result = queryPublicPack("命令被 sandbox 拒绝该怎么查？");

  assert.equal(result.status, "ALLOW");
  assert.equal(result.card.card_id, "AIHD-PC-000002");
});

test("the approved OpenClaw Gateway PublicCard is loadable by its question", () => {
  const result = queryPublicPack("OpenClaw Gateway 安装后，怎样确认服务真的运行并且 RPC 可用？");

  assert.equal(result.status, "ALLOW");
  assert.equal(result.card.card_id, "AIHD-PC-000003");
  assert.equal(result.card.revision, "1.0.0");
});

test("the approved OpenClaw Gateway PublicCard is loadable by an alias", () => {
  const result = queryPublicPack("怎样用 --require-rpc 验证 OpenClaw Gateway？");

  assert.equal(result.status, "ALLOW");
  assert.equal(result.card.card_id, "AIHD-PC-000003");
});

test("the G13b-approved OpenClaw self-iteration PublicCard is loadable by its question", () => {
  const result = queryPublicPack("怎样让 OpenClaw Agent 形成受控自迭代闭环？");

  assert.equal(result.status, "ALLOW");
  assert.equal(result.reason_code, "OK");
  assert.equal(result.card.card_id, "AIHD-PC-000004");
  assert.equal(result.card.revision, "1.0.0");
});

test("the G13b-approved OpenClaw self-iteration PublicCard is loadable by an alias", () => {
  const result = queryPublicPack("怎样让我的小龙虾自迭代？");

  assert.equal(result.status, "ALLOW");
  assert.equal(result.card.card_id, "AIHD-PC-000004");
});

test("model-weight training remains outside the self-iteration card scope", () => {
  const result = queryPublicPack("怎样训练 OpenClaw 的模型权重？");

  assert.deepEqual(result, { status: "MISS", reason_code: "NO_MATCH" });
});

test("an unrelated query still misses the four-card public pack", () => {
  const result = queryPublicPack("完全无关的问题");

  assert.deepEqual(result, { status: "MISS", reason_code: "NO_MATCH" });
});
