import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EVENT_TYPES,
  LedgerError,
  appendEvent,
  loadLedger,
  replayChain,
  verifyEvents
} from "../scripts/feedback-ledger.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");
const SCRIPT = path.join(REPO_ROOT, "scripts/feedback-ledger.mjs");
const HASH_A = crypto.createHash("sha256").update("source-a").digest("hex");
const HASH_B = crypto.createHash("sha256").update("reviewer-b").digest("hex");

function tempLedger(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aihd-feedback-ledger-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "feedback.jsonl");
}

function event({ id, chain, type, payload, sourceKind, evidenceClass = "SYNTHETIC_MECHANISM" }) {
  const kind = sourceKind ?? ({
    DEMAND_GAP: "HELPDESK_TURN",
    FEEDBACK: "USER_FOLLOWUP",
    ANSWER_CANDIDATE: "HUMAN_REVIEW",
    HUMAN_DISTILLATION: "HUMAN_REVIEW",
    PUBLICATION_DECISION: "PUBLICATION_SYSTEM",
    INDEX_RESULT: "INDEX_SYSTEM",
    ALLOW_RESULT: "LOADER",
    VERIFICATION_RESULT: "HUMAN_REVIEW",
    WITHDRAWAL: "PUBLICATION_SYSTEM",
    EXPIRY: "PUBLICATION_SYSTEM",
    CORRECTION: "HUMAN_REVIEW"
  })[type];
  return {
    schema_version: "1.0",
    event_id: id,
    chain_id: chain,
    event_type: type,
    occurred_at: "2026-08-18T05:30:00+08:00",
    source: {
      kind,
      reference_hash: HASH_A,
      evidence_class: evidenceClass
    },
    privacy: {
      classification: evidenceClass === "REAL_USER_FEEDBACK" ? "PRIVATE_CONTROLLED" : "PUBLIC_SAFE_SYNTHETIC",
      redaction: evidenceClass === "REAL_USER_FEEDBACK" ? "MINIMIZED" : "NOT_APPLICABLE",
      public_projection_allowed: false
    },
    payload
  };
}

function demand(chain, id = "EVT-DG-001") {
  return event({
    id,
    chain,
    type: "DEMAND_GAP",
    payload: {
      demand_summary: "虚构的未命中需求摘要",
      feedback_level: "MISS",
      handling_source: "MODEL_REASONING",
      contains_raw_user_text: false
    }
  });
}

function feedback(chain, level = "ADOPTED", id = "EVT-FB-001") {
  const signal = {
    ACKNOWLEDGED: "THANKS_ONLY",
    ADOPTED: "EXPLICIT_ADOPTION",
    OUTCOME_REPORTED: "SELF_REPORTED_ACTION_AND_RESULT"
  }[level];
  return event({
    id,
    chain,
    type: "FEEDBACK",
    payload: {
      evidence_signal: signal,
      feedback_level: level,
      classification_basis: "虚构测试中的明确反馈信号",
      objective_effect_claimed: false,
      human_override: { applied: false }
    }
  });
}

function answerCandidate(chain, options = {}) {
  const action = options.action ?? "NEW_CARD";
  const payload = {
    candidate_id: options.candidateId ?? "AC-NEW-001",
    asset_action: action,
    source_feedback_event_id: options.feedbackEventId ?? "EVT-FB-001",
    content_transfer: "HUMAN_DISTILLATION_REQUIRED",
    contains_answer_text: false,
    proposed_revision: options.proposedRevision ?? "1.0.0"
  };
  if (action === "NEW_CARD") {
    payload.proposed_card_id = options.cardId ?? "AIHD-PC-000099";
  } else {
    payload.target_card_id = options.cardId ?? "AIHD-PC-000001";
    payload.current_revision = options.currentRevision ?? "1.1.0";
  }
  return event({ id: options.id ?? "EVT-AC-001", chain, type: "ANSWER_CANDIDATE", payload });
}

function distillation(chain, candidateId = "AC-NEW-001") {
  return event({
    id: "EVT-HD-001",
    chain,
    type: "HUMAN_DISTILLATION",
    payload: {
      candidate_id: candidateId,
      reviewer_hash: HASH_B,
      verdict: "PASS",
      private_source_retained: true,
      public_text_in_ledger: false
    }
  });
}

function publication(chain, options = {}) {
  const action = options.action ?? "NEW_CARD";
  const payload = {
    candidate_id: options.candidateId ?? "AC-NEW-001",
    asset_action: action,
    card_id: options.cardId ?? "AIHD-PC-000099",
    target_revision: options.targetRevision ?? "1.0.0",
    editorial: "APPROVED",
    verification: "PASS",
    privacy_gate: "PASS",
    publication: "READY",
    owner_decision: "APPROVED"
  };
  if (action === "REVISE_CARD") payload.current_revision = options.currentRevision ?? "1.1.0";
  return event({ id: "EVT-PD-001", chain, type: "PUBLICATION_DECISION", payload });
}

function indexResult(chain, result = "SUCCESS", options = {}) {
  return event({
    id: options.id ?? "EVT-IX-001",
    chain,
    type: "INDEX_RESULT",
    payload: {
      card_id: options.cardId ?? "AIHD-PC-000099",
      revision: options.revision ?? "1.0.0",
      result,
      reason_code: result === "SUCCESS" ? "INDEX_WRITE_OK" : "INDEX_WRITE_FAILED"
    }
  });
}

function allowResult(chain, options = {}) {
  return event({
    id: options.id ?? "EVT-AL-001",
    chain,
    type: "ALLOW_RESULT",
    payload: {
      card_id: options.cardId ?? "AIHD-PC-000099",
      revision: options.revision ?? "1.0.0",
      result: "ALLOW",
      reason_code: "LOADER_ALLOW_OBSERVED"
    }
  });
}

function appendAll(ledger, events) {
  return events.map((item) => appendEvent(ledger, item));
}

function syntheticNewCardChain(chain) {
  return [
    demand(chain),
    feedback(chain),
    answerCandidate(chain),
    distillation(chain),
    publication(chain),
    indexResult(chain),
    allowResult(chain)
  ];
}

function assertReason(fn, reasonCode) {
  assert.throws(fn, (error) => error instanceof LedgerError && error.reason_code === reasonCode);
}

test("feedback event schema exposes the exact implementation event types without duplicate defs", () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, "schemas/feedback-event.schema.json"), "utf8");
  const schema = JSON.parse(text);
  assert.deepEqual(schema.properties.event_type.enum, EVENT_TYPES);
  assert.equal(text.match(/"\$defs"\s*:/g).length, 1);
});

test("synthetic full loop replays but never claims a real feedback loop", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-NEW-001";
  appendAll(ledger, syntheticNewCardChain(chain));
  const events = loadLedger(ledger);
  const state = replayChain(events, chain);

  assert.equal(state.lifecycle_state, "ALLOW_OBSERVED");
  assert.equal(state.serving_eligible, true);
  assert.equal(state.mechanism_loop_complete, true);
  assert.equal(state.real_loop_complete, false);
  assert.equal(verifyEvents(events).event_count, 7);
});

test("thanks-only feedback remains ACKNOWLEDGED and cannot create an answer candidate", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-ACK-001";
  appendAll(ledger, [demand(chain), feedback(chain, "ACKNOWLEDGED")]);
  assertReason(() => appendEvent(ledger, answerCandidate(chain)), "ANSWER_CANDIDATE_REQUIRES_ADOPTED_FEEDBACK");
  assert.equal(replayChain(loadLedger(ledger), chain).effective_feedback_level, "ACKNOWLEDGED");
});

test("a model answer without user feedback cannot create an answer candidate", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-NOFB-001";
  appendEvent(ledger, demand(chain));
  assertReason(() => appendEvent(ledger, answerCandidate(chain)), "ANSWER_CANDIDATE_REQUIRES_ADOPTED_FEEDBACK");
});

test("self-reported outcome cannot be recorded as objective effect", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-OUT-001";
  appendEvent(ledger, demand(chain));
  const invalid = feedback(chain, "OUTCOME_REPORTED");
  invalid.payload.objective_effect_claimed = true;
  assertReason(() => appendEvent(ledger, invalid), "OBJECTIVE_EFFECT_CLAIM_FORBIDDEN");
});

test("a claimed human override requires an auditable reviewer and reason", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-OVR-001";
  appendEvent(ledger, demand(chain));
  const invalid = feedback(chain);
  invalid.payload.human_override = { applied: true };
  assertReason(() => appendEvent(ledger, invalid), "INCOMPLETE_HUMAN_OVERRIDE");

  const valid = feedback(chain);
  valid.payload.human_override = {
    applied: true,
    reviewer_hash: HASH_B,
    reason_code: "EXPLICIT_SIGNAL_REVIEWED"
  };
  appendEvent(ledger, valid);
  assert.equal(replayChain(loadLedger(ledger), chain).effective_feedback_level, "ADOPTED");
});

test("candidate payload cannot contain answer text or bypass human distillation", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-RAW-001";
  appendAll(ledger, [demand(chain), feedback(chain)]);
  const invalid = answerCandidate(chain);
  invalid.payload.answer_text = "不允许进入账本的原回答";
  assertReason(() => appendEvent(ledger, invalid), "INVALID_ANSWER_CANDIDATE_PAYLOAD");

  const invalidTransfer = answerCandidate(chain);
  invalidTransfer.payload.content_transfer = "COPY_RAW_ANSWER";
  assertReason(() => appendEvent(ledger, invalidTransfer), "HUMAN_DISTILLATION_REQUIRED");
});

test("index failure blocks ALLOW and cannot retain a success claim", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-IXFAIL-001";
  appendAll(ledger, syntheticNewCardChain(chain).slice(0, 5));
  appendEvent(ledger, indexResult(chain, "FAIL"));
  assertReason(() => appendEvent(ledger, allowResult(chain)), "ALLOW_WITHOUT_CURRENT_INDEX");
  const state = replayChain(loadLedger(ledger), chain);
  assert.equal(state.index_state, "INDEX_FAILED");
  assert.equal(state.serving_eligible, false);
  assert.equal(state.mechanism_loop_complete, false);
});

test("existing-card revision path binds current and target revisions", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-REV-001";
  appendAll(ledger, [
    demand(chain),
    feedback(chain),
    answerCandidate(chain, {
      action: "REVISE_CARD",
      candidateId: "AC-REV-001",
      cardId: "AIHD-PC-000001",
      currentRevision: "1.1.0",
      proposedRevision: "1.2.0"
    }),
    distillation(chain, "AC-REV-001"),
    publication(chain, {
      action: "REVISE_CARD",
      candidateId: "AC-REV-001",
      cardId: "AIHD-PC-000001",
      currentRevision: "1.1.0",
      targetRevision: "1.2.0"
    }),
    indexResult(chain, "SUCCESS", { cardId: "AIHD-PC-000001", revision: "1.2.0" })
  ]);
  const state = replayChain(loadLedger(ledger), chain);
  assert.equal(state.asset_action, "REVISE_CARD");
  assert.equal(state.current_revision, "1.1.0");
  assert.equal(state.target_revision, "1.2.0");
  assert.equal(state.index_state, "INDEXED");
});

test("approved withdrawal makes an indexed revision ineligible to serve", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-WD-001";
  appendAll(ledger, syntheticNewCardChain(chain).slice(0, 6));
  appendEvent(ledger, event({
    id: "EVT-WD-001",
    chain,
    type: "WITHDRAWAL",
    payload: {
      card_id: "AIHD-PC-000099",
      revision: "1.0.0",
      owner_decision: "APPROVED",
      reason_code: "OWNER_WITHDRAWAL_APPROVED"
    }
  }));
  const state = replayChain(loadLedger(ledger), chain);
  assert.equal(state.lifecycle_state, "WITHDRAWN");
  assert.equal(state.serving_eligible, false);
  assertReason(() => appendEvent(ledger, allowResult(chain)), "ALLOW_WITHOUT_CURRENT_INDEX");
});

test("verification failure blocks a previously indexed revision", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-VF-001";
  appendAll(ledger, syntheticNewCardChain(chain));
  appendEvent(ledger, event({
    id: "EVT-VF-001",
    chain,
    type: "VERIFICATION_RESULT",
    payload: {
      card_id: "AIHD-PC-000099",
      revision: "1.0.0",
      result: "FAIL",
      reason_code: "RUNTIME_BEHAVIOR_DRIFT"
    }
  }));
  const state = replayChain(loadLedger(ledger), chain);
  assert.equal(state.lifecycle_state, "VERIFICATION_FAILED");
  assert.equal(state.index_state, "INDEXED_BUT_BLOCKED");
  assert.equal(state.serving_eligible, false);
  assert.equal(state.mechanism_loop_complete, false);
});

test("expiry blocks serving without deleting historical success", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-EX-001";
  appendAll(ledger, syntheticNewCardChain(chain));
  appendEvent(ledger, event({
    id: "EVT-EX-001",
    chain,
    type: "EXPIRY",
    payload: {
      card_id: "AIHD-PC-000099",
      revision: "1.0.0",
      expires_at: "2026-09-18T00:00:00+08:00",
      reason_code: "SOURCE_REVIEW_EXPIRED"
    }
  }));
  const state = replayChain(loadLedger(ledger), chain);
  assert.equal(state.lifecycle_state, "EXPIRED");
  assert.equal(state.allow_state, "ALLOW_OBSERVED");
  assert.equal(state.serving_eligible, false);
});

test("feedback correction appends history and invalidates dependent promotion", (t) => {
  const ledger = tempLedger(t);
  const chain = "CHAIN-COR-001";
  appendAll(ledger, syntheticNewCardChain(chain));
  appendEvent(ledger, event({
    id: "EVT-CR-001",
    chain,
    type: "CORRECTION",
    payload: {
      target_event_id: "EVT-FB-001",
      corrected_feedback_level: "ACKNOWLEDGED",
      reviewer_hash: HASH_B,
      reason_code: "FEEDBACK_OVERCLASSIFIED",
      history_rewrite: false
    }
  }));
  const state = replayChain(loadLedger(ledger), chain);
  assert.equal(state.feedback_history[0].recorded_level, "ADOPTED");
  assert.equal(state.feedback_history[0].effective_level, "ACKNOWLEDGED");
  assert.equal(state.feedback_history[0].corrected_by, "EVT-CR-001");
  assert.equal(state.candidate_status, "INVALIDATED_BY_CORRECTION");
  assert.equal(state.serving_eligible, false);
});

test("hash-chain tampering is detected on readback", (t) => {
  const ledger = tempLedger(t);
  appendAll(ledger, [demand("CHAIN-HASH-001"), feedback("CHAIN-HASH-001")]);
  const lines = fs.readFileSync(ledger, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
  lines[0].payload.demand_summary = "被篡改的摘要";
  fs.writeFileSync(ledger, `${lines.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  assertReason(() => loadLedger(ledger), "EVENT_HASH_MISMATCH");
});

test("duplicate event IDs fail closed", (t) => {
  const ledger = tempLedger(t);
  const first = demand("CHAIN-DUP-001");
  appendEvent(ledger, first);
  const duplicate = feedback("CHAIN-DUP-001");
  duplicate.event_id = first.event_id;
  assertReason(() => appendEvent(ledger, duplicate), "DUPLICATE_EVENT_ID");
});

test("correction cannot point across chains", (t) => {
  const ledger = tempLedger(t);
  appendAll(ledger, [demand("CHAIN-A-001"), feedback("CHAIN-A-001")]);
  appendEvent(ledger, demand("CHAIN-B-001", "EVT-DG-002"));
  const correction = event({
    id: "EVT-CR-002",
    chain: "CHAIN-B-001",
    type: "CORRECTION",
    payload: {
      target_event_id: "EVT-FB-001",
      corrected_feedback_level: "ACKNOWLEDGED",
      reviewer_hash: HASH_B,
      reason_code: "CROSS_CHAIN_TEST",
      history_rewrite: false
    }
  });
  assertReason(() => appendEvent(ledger, correction), "CORRECTION_TARGET_MUST_BE_FEEDBACK");
});

test("ledger path inside the public repository is refused", () => {
  const forbidden = path.join(REPO_ROOT, "evals/phase4/private-feedback.jsonl");
  assertReason(() => appendEvent(forbidden, demand("CHAIN-PATH-001")), "PUBLIC_REPOSITORY_LEDGER_FORBIDDEN");
  assert.equal(fs.existsSync(forbidden), false);
});

test("CLI returns only stable receipt metadata and never echoes the demand summary", (t) => {
  const ledger = tempLedger(t);
  const dir = path.dirname(ledger);
  const eventPath = path.join(dir, "event.json");
  const canary = "SYNTHETIC_PRIVATE_CANARY_DO_NOT_ECHO";
  const input = demand("CHAIN-CLI-001");
  input.payload.demand_summary = canary;
  fs.writeFileSync(eventPath, JSON.stringify(input), { encoding: "utf8", mode: 0o600 });

  const result = spawnSync(process.execPath, [SCRIPT, "append", "--ledger", ledger, "--event", eventPath], {
    cwd: REPO_ROOT,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes(canary), false);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "APPENDED");
  assert.equal(receipt.event_type, "DEMAND_GAP");
  assert.equal(Object.hasOwn(receipt, "payload"), false);
});
