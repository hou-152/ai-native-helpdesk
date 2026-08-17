import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  V2_ALGORITHMS,
  buildRankings,
  calibrateObserved,
  expandQuery,
  keywordScore,
  rankCandidatesV2
} from "../evals/retrieval/v2/retrieval-v2.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const dataset = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/retrieval/golden.v1.json"), "utf8"));
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/retrieval/fixture-index.v1.json"), "utf8"));
const holdoutSpec = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/retrieval/v2/holdout-spec.v2.json"), "utf8"));

function sha256(relativePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, relativePath))).digest("hex");
}

test("Phase 1 v1 protected inputs remain byte-identical", () => {
  assert.deepEqual({
    dataset: sha256("evals/retrieval/golden.v1.json"),
    fixture: sha256("evals/retrieval/fixture-index.v1.json"),
    config: sha256("evals/retrieval/frozen-config.json"),
    blind: sha256("evals/retrieval/blind-report.json"),
    retrieval: sha256("evals/retrieval/retrieval.mjs"),
    runner: sha256("evals/retrieval/run-eval.mjs")
  }, {
    dataset: "7b37a9a301b6b570e7c87578694df5dbef90b3720e62fb6b1dbdd0531965b51c",
    fixture: "3c00560b888b013621d54c7ee55a977e3c5b2a9bcb9464b190a06aa4aada06fe",
    config: "8e1575a2ef277cb5a328d0f6f76447eeb927e6db54122452ca7d18a4c5bab235",
    blind: "43a45e08970a343ead846013e40f734fc183dcdbf5f355b3050bbe9877fce47b",
    retrieval: "e451c4ece1b28c4a92fd718033c14bbd701ae27413cbb89b474271d4dec93fdf",
    runner: "d68176eb433d9b0392558896aecac9c1c514dac17e5dbf9befd89996f7c606c2"
  });
});

test("v2 holdout generator spec freezes 30 valid template cases", () => {
  assert.equal(holdoutSpec.families.reduce((sum, family) => sum + family.count, 0), 30);
  const counts = Object.fromEntries(["CANDIDATE", "CLARIFY", "MISS", "DENY"].map((status) => [
    status,
    holdoutSpec.families
      .filter((family) => family.expected_status === status)
      .reduce((sum, family) => sum + family.count, 0)
  ]));
  assert.deepEqual(counts, { CANDIDATE: 15, CLARIFY: 6, MISS: 6, DENY: 3 });
  for (const family of holdoutSpec.families) {
    for (const template of family.templates) {
      for (const match of template.matchAll(/\{\{([a-z_]+)\}\}/g)) {
        assert.ok(Array.isArray(family.slots[match[1]]) && family.slots[match[1]].length > 0);
      }
    }
  }
});

test("deterministic expansion handles the v1 bilingual and ambiguity failures", () => {
  assert.match(expandQuery("网络请求总要 approval，是哪种 sandbox policy 在控制？"), /审批/);
  assert.match(expandQuery("网络请求总要 approval，是哪种 sandbox policy 在控制？"), /沙箱/);
  assert.match(expandQuery("规则写了也读到了，但操作仍被拒绝"), /权限/);
  assert.match(expandQuery("换会话后状态都不见了"), /记忆/);
});

test("keyword score requires two semantic groups", () => {
  assert.equal(keywordScore("运行 OpenClaw 应该买哪款迷你主机", "FIX-OPENCLAW-MEMORY"), 0);
  assert.ok(keywordScore("OpenClaw 换会话后忘了长期记忆", "FIX-OPENCLAW-MEMORY") >= 0.84);
  assert.equal(keywordScore("只是写了一条规则", "FIX-CODEX-AGENTS"), 0);
  assert.ok(keywordScore("规则已经读取但没有生效", "FIX-CODEX-AGENTS") >= 0.84);
});

test("README hard negative remains incompatible for every v2 algorithm", () => {
  for (const algorithm of V2_ALGORITHMS) {
    const ranking = rankCandidatesV2({
      query: "怎样确认 README.md 的规则在 Codex 中生效？",
      fixture,
      algorithm
    });
    assert.equal(ranking.every((candidate) => candidate.score === 0), true, algorithm);
  }
});

test("combined v2 algorithm forms the frozen observed safety interval", () => {
  const rankings = buildRankings(dataset.cases, fixture, "bm25_expansion_keyword");
  const calibrated = calibrateObserved(dataset.cases, rankings);
  assert.equal(calibrated.metrics.candidate_hit_at_3, 1);
  assert.equal(calibrated.metrics.clarify_full_coverage_at_3, 1);
  assert.ok(calibrated.metrics.candidate_exact_set_rate >= 2 / 3);
  assert.equal(calibrated.metrics.miss_false_positive_count, 0);
  assert.equal(calibrated.metrics.deny_bypass_rate, 1);
  assert.ok(calibrated.separation >= 0.05);
  assert.equal(calibrated.qualified, true);
});
