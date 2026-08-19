import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildBm25, loadCandidates, normalizeTerm, queryCandidates, tokenize } from "../scripts/query-candidates.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function makeFixture(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aihd-candidates-"));
  const file = path.join(dir, "candidates.jsonl");
  fs.writeFileSync(file, records.map((record) => JSON.stringify(record)).join("\n"));
  return file;
}

const SAMPLE = [
  {
    id: "AIHD-CAND-TEST-00001",
    问题: "怎么样去构建一个使用 Agent 的元技能？",
    原文摘录: "元技能不是塞满知识的大提示词，而是把一类项目稳定推进到可验收结果的控制器：识别目标和现状，选择路径，按需加载资料，调用工具，验证产物，失败时停下或回滚。",
    引用: { snapshot_sha256: "a".repeat(64), question_message_id: "om_test_1", answer_message_id: "om_test_2", question_sender: "USER_001", create_time: "1782277154797" },
    lifecycle: "CANDIDATE",
  },
  {
    id: "AIHD-CAND-TEST-00002",
    问题: "如何搭建一个产品的知识库？",
    原文摘录: "第一步不是选向量库，而是把三种对象拆开：知识库存可复用事实，Memory 存用户上下文，Skill 存怎么做。",
    引用: { snapshot_sha256: "a".repeat(64), question_message_id: "om_test_3", answer_message_id: "om_test_4", question_sender: "USER_002", create_time: "1782277154798" },
    lifecycle: "CANDIDATE",
  },
  {
    id: "AIHD-CAND-TEST-00003",
    问题: "今天天气怎么样？",
    原文摘录: "今天天气很好，适合出门。",
    引用: { snapshot_sha256: "a".repeat(64), question_message_id: "om_test_5", answer_message_id: "om_test_6", question_sender: "USER_003", create_time: "1782277154799" },
    lifecycle: "CANDIDATE",
  },
];

test("normalizeTerm lowercases and normalizes", () => {
  assert.equal(normalizeTerm("  Hello  世界 "), "hello 世界");
  assert.equal(normalizeTerm("ＡＢＣ"), "abc");
});

test("tokenize splits Chinese and English", () => {
  const tokens = tokenize("构建 Agent 元技能");
  assert.ok(tokens.includes("agent"));
  assert.ok(tokens.includes("构"));
  assert.ok(tokens.includes("建"));
});

test("buildBm25 ranks relevant doc higher", () => {
  const docs = SAMPLE.map((c) => ({ id: c.id, tokens: tokenize(`${c.问题} ${c.原文摘录}`) }));
  const { search } = buildBm25(docs);
  const hits = search(tokenize("怎么构建 Agent 元技能"), 3);
  assert.ok(hits.length > 0);
  assert.equal(hits[0].doc.id, "AIHD-CAND-TEST-00001");
});

test("loadCandidates parses jsonl and rejects invalid", () => {
  const file = makeFixture(SAMPLE);
  const loaded = loadCandidates(file);
  assert.equal(loaded.length, 3);
  assert.equal(loaded[0].id, "AIHD-CAND-TEST-00001");

  const badFile = makeFixture([{ id: "X" }]);
  assert.throws(() => loadCandidates(badFile));
});

test("queryCandidates returns HIT with boundary for relevant query", () => {
  const file = makeFixture(SAMPLE);
  const result = queryCandidates({ query: "怎么构建 Agent 元技能", candidates: file, topK: 3 });
  assert.equal(result.status, "HIT");
  assert.ok(result.boundary.includes("不是已验证答案"));
  assert.ok(result.results.length >= 1);
  assert.equal(result.results[0].id, "AIHD-CAND-TEST-00001");
  assert.equal(result.results[0].lifecycle, "CANDIDATE");
  assert.ok(result.results[0].source.snapshot_sha256);
});

test("queryCandidates returns MISS for out-of-pool query", () => {
  const file = makeFixture(SAMPLE);
  const result = queryCandidates({ query: "量子物理弦理论", candidates: file, topK: 3 });
  assert.equal(result.status, "MISS");
  assert.ok(result.note);
});

test("queryCandidates returns MISS when pool empty", () => {
  const file = makeFixture([]);
  const result = queryCandidates({ query: "anything", candidates: file, topK: 3 });
  assert.equal(result.status, "MISS");
  assert.equal(result.reason_code, "NO_CANDIDATES");
});

test("queryCandidates with custom topK bounds results", () => {
  const file = makeFixture(SAMPLE);
  const result = queryCandidates({ query: "知识库", candidates: file, topK: 1 });
  assert.equal(result.status, "HIT");
  assert.ok(result.results.length <= 1);
});
