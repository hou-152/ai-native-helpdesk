import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateRecord } from "../scripts/knowledge-production.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "knowledge-production.mjs");
const CANARY = "PRIVATE_CANARY_93A6F1";

function ordinary(overrides = {}) {
  return {
    schema_version: "1.0",
    record_id: "AIHD-KC-TEST-001",
    source_lane: "ORDINARY_AUTHORIZED_CANDIDATE",
    candidate_authorization: "APPROVED",
    feedback_level: "NOT_APPLICABLE",
    answer_candidate_status: "NOT_APPLICABLE",
    human_distillation: "NOT_APPLICABLE",
    answer_status: "READY",
    applicability_status: "READY",
    next_action_status: "READY",
    verification_method_status: "READY",
    machine_structure: "PASS",
    human_qa: "PENDING_G12",
    editorial: "HOLD",
    verification: "HOLD",
    privacy_gate: "HOLD",
    publication: "HOLD",
    owner_publication_decision: "PENDING_G12",
    ...overrides
  };
}

function miss(overrides = {}) {
  return ordinary({
    source_lane: "MISS_REVIEWED_ANSWER_CANDIDATE",
    feedback_level: "ADOPTED",
    answer_candidate_status: "APPROVED",
    human_distillation: "PASS",
    ...overrides
  });
}

function publicReady(overrides = {}) {
  return ordinary({
    human_qa: "PASS",
    editorial: "APPROVED",
    verification: "PASS",
    privacy_gate: "PASS",
    publication: "READY",
    owner_publication_decision: "APPROVED",
    ...overrides
  });
}

function runCli(t, record, target = "private-card") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aihd-production-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, "receipt.json");
  fs.writeFileSync(input, JSON.stringify(record), { mode: 0o600 });
  const result = spawnSync(process.execPath, [SCRIPT, "--input", input, "--target", target], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { PATH: process.env.PATH }
  });
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim().split("\n").length, 1);
  return { ...result, body: JSON.parse(result.stdout) };
}

test("authorized ordinary candidate can become a private KnowledgeCard receipt", () => {
  assert.deepEqual(evaluateRecord(ordinary(), "private-card"), {
    status: "READY",
    reason_code: "PRIVATE_CARD_READY",
    record_id: "AIHD-KC-TEST-001"
  });
});

test("ordinary candidate without Owner authorization stays HOLD", () => {
  assert.equal(
    evaluateRecord(ordinary({ candidate_authorization: "PENDING_G12" }), "private-card").reason_code,
    "CANDIDATE_AUTHORIZATION_REQUIRED"
  );
});

test("ordinary lane cannot smuggle MISS feedback state", () => {
  assert.equal(
    evaluateRecord(ordinary({ feedback_level: "ADOPTED" }), "private-card").reason_code,
    "LANE_STATE_INVALID"
  );
});

for (const feedbackLevel of ["MISS", "ACKNOWLEDGED"]) {
  test(`MISS lane cannot promote ${feedbackLevel} feedback`, () => {
    assert.equal(
      evaluateRecord(miss({ feedback_level: feedbackLevel }), "private-card").reason_code,
      "MISS_FEEDBACK_NOT_ADOPTED"
    );
  });
}

test("MISS lane requires a reviewed answer candidate", () => {
  assert.equal(
    evaluateRecord(miss({ answer_candidate_status: "DRAFT" }), "private-card").reason_code,
    "ANSWER_CANDIDATE_REVIEW_REQUIRED"
  );
});

test("MISS lane requires human distillation", () => {
  assert.equal(
    evaluateRecord(miss({ human_distillation: "PENDING" }), "private-card").reason_code,
    "HUMAN_DISTILLATION_REQUIRED"
  );
});

test("reviewed ADOPTED MISS can become a private KnowledgeCard receipt", () => {
  assert.equal(evaluateRecord(miss(), "private-card").reason_code, "PRIVATE_CARD_READY");
});

test("reviewed OUTCOME_REPORTED MISS can become a private KnowledgeCard receipt", () => {
  assert.equal(
    evaluateRecord(miss({ feedback_level: "OUTCOME_REPORTED" }), "private-card").reason_code,
    "PRIVATE_CARD_READY"
  );
});

for (const field of ["answer_status", "applicability_status", "next_action_status", "verification_method_status"]) {
  test(`private card requires actionable content field ${field}`, () => {
    assert.equal(
      evaluateRecord(ordinary({ [field]: "MISSING" }), "private-card").reason_code,
      "ACTIONABLE_CONTENT_INCOMPLETE"
    );
  });
}

test("machine structure failure blocks private card generation", () => {
  assert.equal(
    evaluateRecord(ordinary({ machine_structure: "FAIL" }), "private-card").reason_code,
    "MACHINE_STRUCTURE_FAILED"
  );
});

test("G12-pending candidate cannot become a public projection", () => {
  const result = evaluateRecord(ordinary({ candidate_authorization: "PENDING_G12" }), "public-projection");
  assert.deepEqual(result, {
    status: "HOLD",
    reason_code: "CANDIDATE_AUTHORIZATION_REQUIRED",
    record_id: "AIHD-KC-TEST-001"
  });
});

test("machine PASS cannot replace full human QA", () => {
  assert.equal(evaluateRecord(ordinary(), "public-projection").reason_code, "HUMAN_QA_REQUIRED");
});

for (const [field, value, reason] of [
  ["editorial", "HOLD", "EDITORIAL_APPROVAL_REQUIRED"],
  ["verification", "HOLD", "VERIFICATION_REQUIRED"],
  ["privacy_gate", "HOLD", "PRIVACY_APPROVAL_REQUIRED"],
  ["publication", "HOLD", "PUBLICATION_GATE_REQUIRED"]
]) {
  test(`public projection requires exact ${field} gate`, () => {
    assert.equal(evaluateRecord(publicReady({ [field]: value }), "public-projection").reason_code, reason);
  });
}

test("four machine gates cannot replace the Owner publication decision", () => {
  assert.equal(
    evaluateRecord(publicReady({ owner_publication_decision: "PENDING_G12" }), "public-projection").reason_code,
    "OWNER_PUBLICATION_REQUIRED"
  );
});

test("fully reviewed receipt may declare a public projection ready", () => {
  assert.deepEqual(evaluateRecord(publicReady(), "public-projection"), {
    status: "READY",
    reason_code: "PUBLIC_PROJECTION_READY",
    record_id: "AIHD-KC-TEST-001"
  });
});

test("CLI rejects unknown fields without echoing private content", (t) => {
  const result = runCli(t, ordinary({ private_note: CANARY }));
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.body, { status: "DENY", reason_code: "RECORD_SCHEMA_INVALID" });
  assert.equal(`${result.stdout}${result.stderr}`.includes(CANARY), false);
});

test("CLI returns only stable receipt metadata", (t) => {
  const result = runCli(t, ordinary(), "private-card");
  assert.equal(result.status, 0);
  assert.deepEqual(Object.keys(result.body).sort(), ["reason_code", "record_id", "status"]);
});
