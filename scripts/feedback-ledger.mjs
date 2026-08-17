#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

export const EVENT_TYPES = Object.freeze([
  "DEMAND_GAP",
  "FEEDBACK",
  "ANSWER_CANDIDATE",
  "HUMAN_DISTILLATION",
  "PUBLICATION_DECISION",
  "INDEX_RESULT",
  "ALLOW_RESULT",
  "VERIFICATION_RESULT",
  "WITHDRAWAL",
  "EXPIRY",
  "CORRECTION"
]);

const SOURCE_KINDS = new Set([
  "HELPDESK_TURN",
  "USER_FOLLOWUP",
  "HUMAN_REVIEW",
  "PUBLICATION_SYSTEM",
  "INDEX_SYSTEM",
  "LOADER"
]);
const EVIDENCE_CLASSES = new Set(["REAL_USER_FEEDBACK", "SYNTHETIC_MECHANISM", "CONTROL_RECEIPT"]);
const FEEDBACK_LEVELS = new Set(["ACKNOWLEDGED", "ADOPTED", "OUTCOME_REPORTED"]);
const FEEDBACK_RANK = Object.freeze({ MISS: 0, ACKNOWLEDGED: 1, ADOPTED: 2, OUTCOME_REPORTED: 3 });
const HASH_RE = /^[a-f0-9]{64}$/;
const EVENT_ID_RE = /^EVT-[A-Z0-9][A-Z0-9._-]{2,63}$/;
const CHAIN_ID_RE = /^CHAIN-[A-Z0-9][A-Z0-9._-]{2,63}$/;
const CANDIDATE_ID_RE = /^AC-[A-Z0-9][A-Z0-9._-]{2,63}$/;
const CARD_ID_RE = /^AIHD-PC-\d{6}$/;
const REVISION_RE = /^\d+\.\d+\.\d+$/;
const REASON_RE = /^[A-Z][A-Z0-9_]{2,63}$/;

export class LedgerError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "LedgerError";
    this.reason_code = reasonCode;
  }
}

function fail(reasonCode) {
  throw new LedgerError(reasonCode);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertObject(value, reasonCode) {
  if (!isPlainObject(value)) fail(reasonCode);
}

function assertExactKeys(value, required, optional, reasonCode) {
  assertObject(value, reasonCode);
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    fail(reasonCode);
  }
}

function assertString(value, reasonCode, { min = 1, max = 240, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    fail(reasonCode);
  }
}

function assertEnum(value, allowed, reasonCode) {
  if (!allowed.has(value)) fail(reasonCode);
}

function assertBoolean(value, expected, reasonCode) {
  if (typeof value !== "boolean" || (expected !== undefined && value !== expected)) fail(reasonCode);
}

function assertHash(value, reasonCode) {
  assertString(value, reasonCode, { min: 64, max: 64, pattern: HASH_RE });
}

function assertDateTime(value, reasonCode) {
  assertString(value, reasonCode, { max: 64 });
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) fail(reasonCode);
}

function assertReason(value, reasonCode) {
  assertString(value, reasonCode, { max: 64, pattern: REASON_RE });
}

function assertCardRevision(cardId, revision, reasonCode) {
  assertString(cardId, reasonCode, { max: 32, pattern: CARD_ID_RE });
  assertString(revision, reasonCode, { max: 32, pattern: REVISION_RE });
}

function validateSource(source) {
  assertExactKeys(source, ["kind", "reference_hash", "evidence_class"], [], "INVALID_SOURCE");
  assertEnum(source.kind, SOURCE_KINDS, "INVALID_SOURCE_KIND");
  assertHash(source.reference_hash, "INVALID_SOURCE_REFERENCE_HASH");
  assertEnum(source.evidence_class, EVIDENCE_CLASSES, "INVALID_EVIDENCE_CLASS");
}

function validatePrivacy(privacy) {
  assertExactKeys(
    privacy,
    ["classification", "redaction", "public_projection_allowed"],
    [],
    "INVALID_PRIVACY_BOUNDARY"
  );
  assertEnum(privacy.classification, new Set(["PRIVATE_CONTROLLED", "PUBLIC_SAFE_SYNTHETIC"]), "INVALID_PRIVACY_CLASSIFICATION");
  assertEnum(privacy.redaction, new Set(["MINIMIZED", "NOT_APPLICABLE"]), "INVALID_REDACTION_STATE");
  assertBoolean(privacy.public_projection_allowed, false, "LEDGER_PUBLIC_PROJECTION_FORBIDDEN");
}

function validateHumanOverride(value) {
  assertExactKeys(value, ["applied"], ["reviewer_hash", "reason_code"], "INVALID_HUMAN_OVERRIDE");
  assertBoolean(value.applied, undefined, "INVALID_HUMAN_OVERRIDE");
  if (value.applied) {
    if (!Object.hasOwn(value, "reviewer_hash") || !Object.hasOwn(value, "reason_code")) fail("INCOMPLETE_HUMAN_OVERRIDE");
    assertHash(value.reviewer_hash, "INVALID_REVIEWER_HASH");
    assertReason(value.reason_code, "INVALID_OVERRIDE_REASON");
  } else if (Object.hasOwn(value, "reviewer_hash") || Object.hasOwn(value, "reason_code")) {
    fail("UNAPPLIED_OVERRIDE_HAS_REVIEW_DATA");
  }
}

function validateDemandGap(payload) {
  assertExactKeys(
    payload,
    ["demand_summary", "feedback_level", "handling_source", "contains_raw_user_text"],
    [],
    "INVALID_DEMAND_GAP_PAYLOAD"
  );
  assertString(payload.demand_summary, "INVALID_DEMAND_SUMMARY", { max: 240 });
  if (payload.feedback_level !== "MISS") fail("DEMAND_GAP_MUST_START_AS_MISS");
  assertEnum(payload.handling_source, new Set(["PUBLIC_CARD_MISS", "EXTERNAL_VERIFIED", "MODEL_REASONING"]), "INVALID_HANDLING_SOURCE");
  assertBoolean(payload.contains_raw_user_text, false, "RAW_USER_TEXT_FORBIDDEN");
}

function validateFeedback(payload) {
  assertExactKeys(
    payload,
    ["evidence_signal", "feedback_level", "classification_basis", "objective_effect_claimed", "human_override"],
    [],
    "INVALID_FEEDBACK_PAYLOAD"
  );
  const mapping = new Map([
    ["THANKS_ONLY", "ACKNOWLEDGED"],
    ["EXPLICIT_ADOPTION", "ADOPTED"],
    ["SELF_REPORTED_ACTION_AND_RESULT", "OUTCOME_REPORTED"]
  ]);
  assertEnum(payload.evidence_signal, new Set(mapping.keys()), "INVALID_FEEDBACK_SIGNAL");
  assertEnum(payload.feedback_level, FEEDBACK_LEVELS, "INVALID_FEEDBACK_LEVEL");
  if (mapping.get(payload.evidence_signal) !== payload.feedback_level) fail("FEEDBACK_SIGNAL_LEVEL_MISMATCH");
  assertString(payload.classification_basis, "INVALID_CLASSIFICATION_BASIS", { max: 240 });
  assertBoolean(payload.objective_effect_claimed, false, "OBJECTIVE_EFFECT_CLAIM_FORBIDDEN");
  validateHumanOverride(payload.human_override);
}

function validateAnswerCandidate(payload) {
  assertExactKeys(
    payload,
    ["candidate_id", "asset_action", "source_feedback_event_id", "content_transfer", "contains_answer_text", "proposed_revision"],
    ["proposed_card_id", "target_card_id", "current_revision"],
    "INVALID_ANSWER_CANDIDATE_PAYLOAD"
  );
  assertString(payload.candidate_id, "INVALID_CANDIDATE_ID", { max: 67, pattern: CANDIDATE_ID_RE });
  assertEnum(payload.asset_action, new Set(["NEW_CARD", "REVISE_CARD"]), "INVALID_ASSET_ACTION");
  assertString(payload.source_feedback_event_id, "INVALID_SOURCE_FEEDBACK_EVENT", { max: 67, pattern: EVENT_ID_RE });
  if (payload.content_transfer !== "HUMAN_DISTILLATION_REQUIRED") fail("HUMAN_DISTILLATION_REQUIRED");
  assertBoolean(payload.contains_answer_text, false, "ANSWER_TEXT_IN_CANDIDATE_FORBIDDEN");
  assertString(payload.proposed_revision, "INVALID_PROPOSED_REVISION", { max: 32, pattern: REVISION_RE });

  if (payload.asset_action === "NEW_CARD") {
    if (!Object.hasOwn(payload, "proposed_card_id") || Object.hasOwn(payload, "target_card_id") || Object.hasOwn(payload, "current_revision")) {
      fail("INVALID_NEW_CARD_TARGET");
    }
    assertCardRevision(payload.proposed_card_id, payload.proposed_revision, "INVALID_NEW_CARD_TARGET");
  } else {
    if (!Object.hasOwn(payload, "target_card_id") || !Object.hasOwn(payload, "current_revision") || Object.hasOwn(payload, "proposed_card_id")) {
      fail("INVALID_REVISION_TARGET");
    }
    assertCardRevision(payload.target_card_id, payload.current_revision, "INVALID_REVISION_TARGET");
    if (payload.current_revision === payload.proposed_revision) fail("REVISION_MUST_CHANGE");
  }
}

function validateHumanDistillation(payload) {
  assertExactKeys(
    payload,
    ["candidate_id", "reviewer_hash", "verdict", "private_source_retained", "public_text_in_ledger"],
    [],
    "INVALID_HUMAN_DISTILLATION_PAYLOAD"
  );
  assertString(payload.candidate_id, "INVALID_CANDIDATE_ID", { max: 67, pattern: CANDIDATE_ID_RE });
  assertHash(payload.reviewer_hash, "INVALID_REVIEWER_HASH");
  assertEnum(payload.verdict, new Set(["PASS", "FAIL"]), "INVALID_DISTILLATION_VERDICT");
  assertBoolean(payload.private_source_retained, true, "PRIVATE_SOURCE_RECEIPT_REQUIRED");
  assertBoolean(payload.public_text_in_ledger, false, "PUBLIC_TEXT_IN_LEDGER_FORBIDDEN");
}

function validatePublicationDecision(payload) {
  assertExactKeys(
    payload,
    ["candidate_id", "asset_action", "card_id", "target_revision", "editorial", "verification", "privacy_gate", "publication", "owner_decision"],
    ["current_revision"],
    "INVALID_PUBLICATION_DECISION_PAYLOAD"
  );
  assertString(payload.candidate_id, "INVALID_CANDIDATE_ID", { max: 67, pattern: CANDIDATE_ID_RE });
  assertEnum(payload.asset_action, new Set(["NEW_CARD", "REVISE_CARD"]), "INVALID_ASSET_ACTION");
  assertCardRevision(payload.card_id, payload.target_revision, "INVALID_PUBLICATION_TARGET");
  if (payload.asset_action === "REVISE_CARD") {
    if (!Object.hasOwn(payload, "current_revision")) fail("CURRENT_REVISION_REQUIRED");
    assertString(payload.current_revision, "INVALID_CURRENT_REVISION", { max: 32, pattern: REVISION_RE });
    if (payload.current_revision === payload.target_revision) fail("REVISION_MUST_CHANGE");
  } else if (Object.hasOwn(payload, "current_revision")) {
    fail("NEW_CARD_CANNOT_HAVE_CURRENT_REVISION");
  }
  assertEnum(payload.editorial, new Set(["APPROVED", "REJECTED"]), "INVALID_EDITORIAL_GATE");
  assertEnum(payload.verification, new Set(["PASS", "FAIL"]), "INVALID_VERIFICATION_GATE");
  assertEnum(payload.privacy_gate, new Set(["PASS", "FAIL"]), "INVALID_PRIVACY_GATE");
  assertEnum(payload.publication, new Set(["READY", "HOLD"]), "INVALID_PUBLICATION_GATE");
  assertEnum(payload.owner_decision, new Set(["APPROVED", "DENIED"]), "INVALID_OWNER_DECISION");
}

function validateCardResult(payload, eventType) {
  const allowedResults = {
    INDEX_RESULT: new Set(["SUCCESS", "FAIL"]),
    ALLOW_RESULT: new Set(["ALLOW", "DENY", "MISS"]),
    VERIFICATION_RESULT: new Set(["PASS", "FAIL"])
  };
  assertExactKeys(payload, ["card_id", "revision", "result", "reason_code"], [], `INVALID_${eventType}_PAYLOAD`);
  assertCardRevision(payload.card_id, payload.revision, `INVALID_${eventType}_TARGET`);
  assertEnum(payload.result, allowedResults[eventType], `INVALID_${eventType}_RESULT`);
  assertReason(payload.reason_code, `INVALID_${eventType}_REASON`);
}

function validateWithdrawal(payload) {
  assertExactKeys(payload, ["card_id", "revision", "owner_decision", "reason_code"], [], "INVALID_WITHDRAWAL_PAYLOAD");
  assertCardRevision(payload.card_id, payload.revision, "INVALID_WITHDRAWAL_TARGET");
  if (payload.owner_decision !== "APPROVED") fail("WITHDRAWAL_OWNER_APPROVAL_REQUIRED");
  assertReason(payload.reason_code, "INVALID_WITHDRAWAL_REASON");
}

function validateExpiry(payload) {
  assertExactKeys(payload, ["card_id", "revision", "expires_at", "reason_code"], [], "INVALID_EXPIRY_PAYLOAD");
  assertCardRevision(payload.card_id, payload.revision, "INVALID_EXPIRY_TARGET");
  assertDateTime(payload.expires_at, "INVALID_EXPIRY_TIME");
  assertReason(payload.reason_code, "INVALID_EXPIRY_REASON");
}

function validateCorrection(payload) {
  assertExactKeys(
    payload,
    ["target_event_id", "corrected_feedback_level", "reviewer_hash", "reason_code", "history_rewrite"],
    [],
    "INVALID_CORRECTION_PAYLOAD"
  );
  assertString(payload.target_event_id, "INVALID_CORRECTION_TARGET", { max: 67, pattern: EVENT_ID_RE });
  assertEnum(payload.corrected_feedback_level, FEEDBACK_LEVELS, "INVALID_CORRECTED_FEEDBACK_LEVEL");
  assertHash(payload.reviewer_hash, "INVALID_REVIEWER_HASH");
  assertReason(payload.reason_code, "INVALID_CORRECTION_REASON");
  assertBoolean(payload.history_rewrite, false, "HISTORY_REWRITE_FORBIDDEN");
}

const PAYLOAD_VALIDATORS = Object.freeze({
  DEMAND_GAP: validateDemandGap,
  FEEDBACK: validateFeedback,
  ANSWER_CANDIDATE: validateAnswerCandidate,
  HUMAN_DISTILLATION: validateHumanDistillation,
  PUBLICATION_DECISION: validatePublicationDecision,
  INDEX_RESULT: (payload) => validateCardResult(payload, "INDEX_RESULT"),
  ALLOW_RESULT: (payload) => validateCardResult(payload, "ALLOW_RESULT"),
  VERIFICATION_RESULT: (payload) => validateCardResult(payload, "VERIFICATION_RESULT"),
  WITHDRAWAL: validateWithdrawal,
  EXPIRY: validateExpiry,
  CORRECTION: validateCorrection
});

export function validateEventInput(input) {
  assertExactKeys(
    input,
    ["schema_version", "event_id", "chain_id", "event_type", "occurred_at", "source", "privacy", "payload"],
    [],
    "INVALID_EVENT_SHAPE"
  );
  if (input.schema_version !== "1.0") fail("UNSUPPORTED_SCHEMA_VERSION");
  assertString(input.event_id, "INVALID_EVENT_ID", { max: 67, pattern: EVENT_ID_RE });
  assertString(input.chain_id, "INVALID_CHAIN_ID", { max: 69, pattern: CHAIN_ID_RE });
  assertEnum(input.event_type, new Set(EVENT_TYPES), "UNKNOWN_EVENT_TYPE");
  assertDateTime(input.occurred_at, "INVALID_OCCURRED_AT");
  validateSource(input.source);
  validatePrivacy(input.privacy);
  PAYLOAD_VALIDATORS[input.event_type](input.payload);

  if (input.source.evidence_class === "REAL_USER_FEEDBACK" && input.privacy.classification !== "PRIVATE_CONTROLLED") {
    fail("REAL_FEEDBACK_MUST_STAY_PRIVATE");
  }
  if (input.source.evidence_class === "SYNTHETIC_MECHANISM" && input.privacy.classification !== "PUBLIC_SAFE_SYNTHETIC") {
    fail("SYNTHETIC_EVENT_PRIVACY_MISMATCH");
  }
  return JSON.parse(JSON.stringify(input));
}

function eventBase(storedEvent) {
  return {
    schema_version: storedEvent.schema_version,
    event_id: storedEvent.event_id,
    chain_id: storedEvent.chain_id,
    event_type: storedEvent.event_type,
    occurred_at: storedEvent.occurred_at,
    source: storedEvent.source,
    privacy: storedEvent.privacy,
    payload: storedEvent.payload,
    previous_event_hash: storedEvent.previous_event_hash
  };
}

function hashEventBase(base) {
  return crypto.createHash("sha256").update(JSON.stringify(base), "utf8").digest("hex");
}

function validateStoredEvent(event) {
  assertExactKeys(
    event,
    [
      "schema_version",
      "event_id",
      "chain_id",
      "event_type",
      "occurred_at",
      "source",
      "privacy",
      "payload",
      "previous_event_hash",
      "event_hash"
    ],
    [],
    "INVALID_STORED_EVENT_SHAPE"
  );
  validateEventInput({
    schema_version: event.schema_version,
    event_id: event.event_id,
    chain_id: event.chain_id,
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    source: event.source,
    privacy: event.privacy,
    payload: event.payload
  });
  if (event.previous_event_hash !== null) assertHash(event.previous_event_hash, "INVALID_PREVIOUS_EVENT_HASH");
  assertHash(event.event_hash, "INVALID_EVENT_HASH");
}

export function verifyEvents(events) {
  if (!Array.isArray(events)) fail("LEDGER_NOT_AN_ARRAY");
  const eventIds = new Set();
  let previousHash = null;
  for (const event of events) {
    validateStoredEvent(event);
    if (eventIds.has(event.event_id)) fail("DUPLICATE_EVENT_ID");
    if (event.previous_event_hash !== previousHash) fail("HASH_CHAIN_PREDECESSOR_MISMATCH");
    if (hashEventBase(eventBase(event)) !== event.event_hash) fail("EVENT_HASH_MISMATCH");
    eventIds.add(event.event_id);
    previousHash = event.event_hash;
  }
  return {
    status: "VERIFIED",
    event_count: events.length,
    chain_count: new Set(events.map((event) => event.chain_id)).size,
    last_event_hash: previousHash
  };
}

function initialState(chainId) {
  return {
    chain_id: chainId,
    demand_gap_logged: false,
    demand_evidence_class: null,
    feedback_history: [],
    effective_feedback_level: "MISS",
    qualifying_feedback_is_real: false,
    candidate_status: "NONE",
    candidate_id: null,
    asset_action: null,
    card_id: null,
    current_revision: null,
    target_revision: null,
    human_distillation: "NOT_STARTED",
    publication_state: "NOT_REVIEWED",
    index_state: "NOT_INDEXED",
    allow_state: "NOT_OBSERVED",
    verification_state: "NOT_RECORDED",
    lifecycle_state: "EMPTY",
    serving_eligible: false,
    mechanism_loop_complete: false,
    real_loop_complete: false,
    last_event_hash: null
  };
}

function assertSameCard(state, payload) {
  if (state.card_id !== payload.card_id || state.target_revision !== payload.revision) fail("CARD_REVISION_STATE_MISMATCH");
}

function publicationApproved(payload) {
  return payload.editorial === "APPROVED" && payload.verification === "PASS" &&
    payload.privacy_gate === "PASS" && payload.publication === "READY" &&
    payload.owner_decision === "APPROVED";
}

function replayChainUnchecked(chainEvents, chainId) {
  const state = initialState(chainId);
  const eventById = new Map();

  for (const event of chainEvents) {
    const payload = event.payload;
    switch (event.event_type) {
      case "DEMAND_GAP": {
        if (state.demand_gap_logged || chainEvents[0] !== event) fail("CHAIN_MUST_START_WITH_ONE_DEMAND_GAP");
        state.demand_gap_logged = true;
        state.demand_evidence_class = event.source.evidence_class;
        state.lifecycle_state = "DEMAND_GAP_LOGGED";
        break;
      }
      case "FEEDBACK": {
        if (!state.demand_gap_logged) fail("FEEDBACK_WITHOUT_DEMAND_GAP");
        if (FEEDBACK_RANK[payload.feedback_level] < FEEDBACK_RANK[state.effective_feedback_level]) {
          fail("FEEDBACK_DOWNGRADE_REQUIRES_CORRECTION");
        }
        state.feedback_history.push({
          event_id: event.event_id,
          recorded_level: payload.feedback_level,
          effective_level: payload.feedback_level,
          corrected_by: null
        });
        state.effective_feedback_level = payload.feedback_level;
        state.qualifying_feedback_is_real = FEEDBACK_RANK[payload.feedback_level] >= FEEDBACK_RANK.ADOPTED &&
          event.source.evidence_class === "REAL_USER_FEEDBACK";
        state.lifecycle_state = `FEEDBACK_${payload.feedback_level}`;
        break;
      }
      case "ANSWER_CANDIDATE": {
        if (FEEDBACK_RANK[state.effective_feedback_level] < FEEDBACK_RANK.ADOPTED) fail("ANSWER_CANDIDATE_REQUIRES_ADOPTED_FEEDBACK");
        const sourceFeedback = eventById.get(payload.source_feedback_event_id);
        if (!sourceFeedback || sourceFeedback.event_type !== "FEEDBACK") fail("ANSWER_CANDIDATE_FEEDBACK_REFERENCE_INVALID");
        const authentic = sourceFeedback.source.evidence_class === "REAL_USER_FEEDBACK" ||
          sourceFeedback.source.evidence_class === "SYNTHETIC_MECHANISM";
        if (!authentic) fail("ANSWER_CANDIDATE_REQUIRES_USER_OR_SYNTHETIC_FEEDBACK");
        if (state.candidate_status !== "NONE") fail("DUPLICATE_ANSWER_CANDIDATE");
        state.candidate_status = "ANSWER_CANDIDATE";
        state.candidate_id = payload.candidate_id;
        state.asset_action = payload.asset_action;
        state.card_id = payload.asset_action === "NEW_CARD" ? payload.proposed_card_id : payload.target_card_id;
        state.current_revision = payload.current_revision ?? null;
        state.target_revision = payload.proposed_revision;
        state.lifecycle_state = "ANSWER_CANDIDATE_CREATED";
        break;
      }
      case "HUMAN_DISTILLATION": {
        if (state.candidate_status !== "ANSWER_CANDIDATE" || state.candidate_id !== payload.candidate_id) {
          fail("HUMAN_DISTILLATION_WITHOUT_MATCHING_CANDIDATE");
        }
        state.human_distillation = payload.verdict;
        state.candidate_status = payload.verdict === "PASS" ? "HUMAN_DISTILLED" : "DISTILLATION_FAILED";
        state.lifecycle_state = state.candidate_status;
        break;
      }
      case "PUBLICATION_DECISION": {
        if (state.candidate_status !== "HUMAN_DISTILLED" || state.candidate_id !== payload.candidate_id) {
          fail("PUBLICATION_WITHOUT_HUMAN_DISTILLATION");
        }
        if (state.asset_action !== payload.asset_action || state.card_id !== payload.card_id || state.target_revision !== payload.target_revision) {
          fail("PUBLICATION_CANDIDATE_MISMATCH");
        }
        if (state.asset_action === "REVISE_CARD" && state.current_revision !== payload.current_revision) {
          fail("PUBLICATION_REVISION_MISMATCH");
        }
        if (publicationApproved(payload)) {
          state.publication_state = "APPROVED_NOT_INDEXED";
          state.lifecycle_state = "PUBLICATION_APPROVED";
        } else {
          state.publication_state = "DENIED";
          state.lifecycle_state = "PUBLICATION_DENIED";
          state.serving_eligible = false;
        }
        break;
      }
      case "INDEX_RESULT": {
        if (state.publication_state !== "APPROVED_NOT_INDEXED") fail("INDEX_WITHOUT_APPROVED_PUBLICATION");
        if (!new Set(["PUBLICATION_APPROVED", "INDEX_FAILED"]).has(state.lifecycle_state)) {
          fail("INDEX_REACTIVATION_REQUIRES_NEW_PUBLICATION");
        }
        assertSameCard(state, payload);
        if (payload.result === "SUCCESS") {
          state.index_state = "INDEXED";
          state.lifecycle_state = "INDEXED";
          state.serving_eligible = true;
        } else {
          state.index_state = "INDEX_FAILED";
          state.lifecycle_state = "INDEX_FAILED";
          state.serving_eligible = false;
        }
        break;
      }
      case "ALLOW_RESULT": {
        assertSameCard(state, payload);
        if (state.index_state !== "INDEXED" || !state.serving_eligible) fail("ALLOW_WITHOUT_CURRENT_INDEX");
        state.allow_state = payload.result === "ALLOW" ? "ALLOW_OBSERVED" : payload.result;
        if (payload.result === "ALLOW") state.lifecycle_state = "ALLOW_OBSERVED";
        break;
      }
      case "VERIFICATION_RESULT": {
        assertSameCard(state, payload);
        state.verification_state = payload.result;
        if (payload.result === "FAIL") {
          state.lifecycle_state = "VERIFICATION_FAILED";
          state.serving_eligible = false;
          if (state.index_state === "INDEXED") state.index_state = "INDEXED_BUT_BLOCKED";
        }
        break;
      }
      case "WITHDRAWAL": {
        assertSameCard(state, payload);
        state.lifecycle_state = "WITHDRAWN";
        state.index_state = "WITHDRAWN";
        state.serving_eligible = false;
        break;
      }
      case "EXPIRY": {
        assertSameCard(state, payload);
        state.lifecycle_state = "EXPIRED";
        state.index_state = "EXPIRED";
        state.serving_eligible = false;
        break;
      }
      case "CORRECTION": {
        const target = eventById.get(payload.target_event_id);
        if (!target || target.event_type !== "FEEDBACK") fail("CORRECTION_TARGET_MUST_BE_FEEDBACK");
        const history = state.feedback_history.find((item) => item.event_id === payload.target_event_id);
        if (!history) fail("CORRECTION_TARGET_NOT_IN_CHAIN");
        history.effective_level = payload.corrected_feedback_level;
        history.corrected_by = event.event_id;
        state.effective_feedback_level = payload.corrected_feedback_level;
        state.qualifying_feedback_is_real = FEEDBACK_RANK[payload.corrected_feedback_level] >= FEEDBACK_RANK.ADOPTED &&
          target.source.evidence_class === "REAL_USER_FEEDBACK";
        if (FEEDBACK_RANK[payload.corrected_feedback_level] < FEEDBACK_RANK.ADOPTED && state.candidate_status !== "NONE") {
          state.candidate_status = "INVALIDATED_BY_CORRECTION";
          state.publication_state = "INVALIDATED_BY_CORRECTION";
          state.index_state = "INVALIDATED_BY_CORRECTION";
          state.lifecycle_state = "INVALIDATED_BY_CORRECTION";
          state.serving_eligible = false;
          state.allow_state = "INVALIDATED_BY_CORRECTION";
        } else {
          state.lifecycle_state = "FEEDBACK_CORRECTED";
        }
        break;
      }
      default:
        fail("UNKNOWN_EVENT_TYPE");
    }

    eventById.set(event.event_id, event);
    state.last_event_hash = event.event_hash;
  }

  state.mechanism_loop_complete = state.allow_state === "ALLOW_OBSERVED" && state.serving_eligible;
  state.real_loop_complete = state.mechanism_loop_complete && state.demand_evidence_class === "REAL_USER_FEEDBACK" &&
    state.qualifying_feedback_is_real;
  return state;
}

export function replayChain(events, chainId) {
  verifyEvents(events);
  assertString(chainId, "INVALID_CHAIN_ID", { max: 69, pattern: CHAIN_ID_RE });
  const chainEvents = events.filter((event) => event.chain_id === chainId);
  if (chainEvents.length === 0) fail("CHAIN_NOT_FOUND");
  return replayChainUnchecked(chainEvents, chainId);
}

export function replayAll(events) {
  verifyEvents(events);
  const states = {};
  for (const chainId of new Set(events.map((event) => event.chain_id))) {
    states[chainId] = replayChainUnchecked(events.filter((event) => event.chain_id === chainId), chainId);
  }
  return states;
}

export function buildStoredEvent(input, previousEventHash = null) {
  const normalized = validateEventInput(input);
  if (previousEventHash !== null) assertHash(previousEventHash, "INVALID_PREVIOUS_EVENT_HASH");
  const base = { ...normalized, previous_event_hash: previousEventHash };
  return { ...base, event_hash: hashEventBase(base) };
}

function parseLedgerText(text) {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.some((line) => line.length === 0)) fail("BLANK_LEDGER_LINE");
  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      fail("MALFORMED_LEDGER_JSON");
    }
  });
}

export function loadLedger(ledgerPath, { allowMissing = false } = {}) {
  if (!fs.existsSync(ledgerPath)) {
    if (allowMissing) return [];
    fail("LEDGER_NOT_FOUND");
  }
  const stat = fs.lstatSync(ledgerPath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("LEDGER_MUST_BE_REGULAR_FILE");
  const events = parseLedgerText(fs.readFileSync(ledgerPath, "utf8"));
  verifyEvents(events);
  return events;
}

function canonicalProspectivePath(targetPath) {
  const absolute = path.resolve(targetPath);
  const parent = path.dirname(absolute);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) fail("LEDGER_PARENT_NOT_FOUND");
  return path.join(fs.realpathSync(parent), path.basename(absolute));
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

export function assertPrivateControlPath(targetPath) {
  const canonical = canonicalProspectivePath(targetPath);
  if (isWithin(fs.realpathSync(REPO_ROOT), canonical)) fail("PUBLIC_REPOSITORY_LEDGER_FORBIDDEN");
  return canonical;
}

function readPrivateEventInput(eventPath) {
  const canonical = assertPrivateControlPath(eventPath);
  if (!fs.existsSync(canonical)) fail("EVENT_INPUT_NOT_FOUND");
  const stat = fs.lstatSync(canonical);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("EVENT_INPUT_MUST_BE_REGULAR_FILE");
  try {
    return JSON.parse(fs.readFileSync(canonical, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) fail("MALFORMED_EVENT_INPUT_JSON");
    throw error;
  }
}

function publicState(state) {
  return {
    chain_id: state.chain_id,
    effective_feedback_level: state.effective_feedback_level,
    candidate_status: state.candidate_status,
    publication_state: state.publication_state,
    index_state: state.index_state,
    allow_state: state.allow_state,
    lifecycle_state: state.lifecycle_state,
    serving_eligible: state.serving_eligible,
    mechanism_loop_complete: state.mechanism_loop_complete,
    real_loop_complete: state.real_loop_complete,
    last_event_hash: state.last_event_hash
  };
}

export function appendEvent(ledgerPath, input) {
  const canonicalLedger = assertPrivateControlPath(ledgerPath);
  const lockPath = `${canonicalLedger}.lock`;
  let lockFd;
  try {
    lockFd = fs.openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") fail("LEDGER_LOCKED");
    throw error;
  }

  try {
    const events = loadLedger(canonicalLedger, { allowMissing: true });
    if (events.some((event) => event.event_id === input.event_id)) fail("DUPLICATE_EVENT_ID");
    const stored = buildStoredEvent(input, events.at(-1)?.event_hash ?? null);
    const candidateEvents = [...events, stored];
    verifyEvents(candidateEvents);
    const state = replayChainUnchecked(candidateEvents.filter((event) => event.chain_id === stored.chain_id), stored.chain_id);
    fs.appendFileSync(canonicalLedger, `${JSON.stringify(stored)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(canonicalLedger, 0o600);
    return {
      status: "APPENDED",
      event_id: stored.event_id,
      chain_id: stored.chain_id,
      event_type: stored.event_type,
      event_hash: stored.event_hash,
      state: publicState(state)
    };
  } finally {
    if (lockFd !== undefined) fs.closeSync(lockFd);
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined) fail("INVALID_CLI_ARGUMENTS");
    options[flag.slice(2)] = value;
  }
  return { command, options };
}

function emit(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = exitCode;
}

function runCli() {
  try {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (!new Set(["append", "verify", "replay"]).has(command) || !options.ledger) fail("INVALID_CLI_ARGUMENTS");
    const ledgerPath = assertPrivateControlPath(options.ledger);

    if (command === "append") {
      if (!options.event || options.chain) fail("INVALID_CLI_ARGUMENTS");
      const input = readPrivateEventInput(options.event);
      emit(appendEvent(ledgerPath, input));
      return;
    }

    const events = loadLedger(ledgerPath);
    if (command === "verify") {
      if (options.event || options.chain) fail("INVALID_CLI_ARGUMENTS");
      emit(verifyEvents(events));
      return;
    }

    if (!options.chain || options.event) fail("INVALID_CLI_ARGUMENTS");
    emit({ status: "REPLAYED", state: publicState(replayChain(events, options.chain)) });
  } catch (error) {
    const reasonCode = error instanceof LedgerError ? error.reason_code : "UNEXPECTED_LEDGER_ERROR";
    emit({ status: "FAIL_CLOSED", reason_code: reasonCode }, 1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
