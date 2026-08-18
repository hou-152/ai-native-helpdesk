#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
export const DEFAULT_POLICY_PATH = path.join(REPO_ROOT, "policies", "external-sources.v1.json");

export const TURN_DESTINATIONS = Object.freeze([
  "DO",
  "VERIFY",
  "WAIT",
  "STOP",
  "NO_ACTION_NEEDED",
  "NEEDS_INPUT",
  "UNKNOWN",
  "ESCALATE"
]);

const SOURCE_KINDS = Object.freeze(["PUBLIC_CARD", "EXTERNAL_VERIFIED", "MODEL_REASONING"]);
const RISK_CLASSES = Object.freeze(["LOW", "MEDIUM", "HIGH"]);
const RETRIEVAL_STATUSES = Object.freeze(["ALLOW", "MISS", "DENY", "CANDIDATE", "CLARIFY"]);
const AMBIGUITY_STAGES = Object.freeze(["NONE", "INITIAL_ASKED", "REFRAME_ASKED"]);
const TURN_KEYS = Object.freeze([
  "schema_version",
  "turn_id",
  "turn_started_at",
  "safety_gate",
  "privacy_gate",
  "retrieval_status",
  "separate_external_route_authorized",
  "external_query_sent",
  "context",
  "proposed"
]);
const CONTEXT_KEYS = Object.freeze([
  "missing_changes_path",
  "candidate_paths_differ",
  "ambiguity_stage",
  "unresolved",
  "previous_question",
  "question"
]);
const PROPOSED_KEYS = Object.freeze(["destination", "destination_detail", "claims"]);
const CLAIM_KEYS = Object.freeze([
  "claim_id",
  "text",
  "risk",
  "dynamic",
  "versioned",
  "definitive",
  "source_kind",
  "card_id",
  "evidence"
]);
const EVIDENCE_KEYS = Object.freeze(["source_id", "url", "retrieved_at", "version"]);
const POLICY_KEYS = Object.freeze([
  "schema_version",
  "policy_id",
  "revision",
  "owner",
  "effective_at",
  "expires_at",
  "sources"
]);
const POLICY_SOURCE_KEYS = Object.freeze([
  "source_id",
  "owner",
  "status",
  "allowed_risks",
  "url_prefixes",
  "stable_max_age_hours",
  "dynamic_max_age_hours",
  "invalidation_conditions"
]);
const MACHINE_LABEL_PATTERN = new RegExp(`(?:^|[^A-Z_])(?:${TURN_DESTINATIONS.join("|")})(?:$|[^A-Z_])`);

export class ContractError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.reasonCode = reasonCode;
  }
}

function fail(reasonCode) {
  throw new ContractError(reasonCode);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, reasonCode) {
  if (!isRecord(value)) fail(reasonCode);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(reasonCode);
}

function nonEmptyString(value, maxLength, reasonCode) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) fail(reasonCode);
}

function nullableString(value, maxLength, reasonCode) {
  if (value === null) return;
  nonEmptyString(value, maxLength, reasonCode);
}

function enumValue(value, allowed, reasonCode) {
  if (!allowed.includes(value)) fail(reasonCode);
}

function booleanValue(value, reasonCode) {
  if (typeof value !== "boolean") fail(reasonCode);
}

function dateValue(value, reasonCode) {
  nonEmptyString(value, 64, reasonCode);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) fail(reasonCode);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) fail(reasonCode);
  return parsed;
}

function positiveInteger(value, maximum, reasonCode) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) fail(reasonCode);
}

function uniqueStrings(value, { min, max, itemMax, pattern, reasonCode }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(reasonCode);
  const seen = new Set();
  for (const item of value) {
    nonEmptyString(item, itemMax, reasonCode);
    if (pattern && !pattern.test(item)) fail(reasonCode);
    if (seen.has(item)) fail(reasonCode);
    seen.add(item);
  }
}

function parseStrictJson(text, reasonCode) {
  if (typeof text !== "string" || text.length === 0 || text.charCodeAt(0) === 0xfeff || text.includes("\0")) {
    fail(reasonCode);
  }
  let cursor = 0;
  const skip = () => {
    while (cursor < text.length && /[\t\n\r ]/.test(text[cursor])) cursor += 1;
  };
  const parseString = () => {
    if (text[cursor] !== '"') fail(reasonCode);
    const start = cursor;
    cursor += 1;
    while (cursor < text.length) {
      if (text[cursor] === '"') {
        cursor += 1;
        try {
          return JSON.parse(text.slice(start, cursor));
        } catch {
          fail(reasonCode);
        }
      }
      if (text[cursor] === "\\") {
        cursor += 1;
        if (cursor >= text.length) fail(reasonCode);
        if (text[cursor] === "u") {
          if (!/^[0-9A-Fa-f]{4}$/.test(text.slice(cursor + 1, cursor + 5))) fail(reasonCode);
          cursor += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(text[cursor])) fail(reasonCode);
        cursor += 1;
        continue;
      }
      if (text.charCodeAt(cursor) < 0x20) fail(reasonCode);
      cursor += 1;
    }
    fail(reasonCode);
  };
  const parseNumber = () => {
    const match = text.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) fail(reasonCode);
    cursor += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) fail(reasonCode);
    return number;
  };
  const parseArray = () => {
    const output = [];
    cursor += 1;
    skip();
    if (text[cursor] === "]") {
      cursor += 1;
      return output;
    }
    while (cursor < text.length) {
      output.push(parseValue());
      skip();
      if (text[cursor] === "]") {
        cursor += 1;
        return output;
      }
      if (text[cursor] !== ",") fail(reasonCode);
      cursor += 1;
      skip();
    }
    fail(reasonCode);
  };
  const parseObject = () => {
    const output = Object.create(null);
    const seen = new Set();
    cursor += 1;
    skip();
    if (text[cursor] === "}") {
      cursor += 1;
      return output;
    }
    while (cursor < text.length) {
      const key = parseString();
      if (seen.has(key)) fail(reasonCode);
      seen.add(key);
      skip();
      if (text[cursor] !== ":") fail(reasonCode);
      cursor += 1;
      skip();
      output[key] = parseValue();
      skip();
      if (text[cursor] === "}") {
        cursor += 1;
        return output;
      }
      if (text[cursor] !== ",") fail(reasonCode);
      cursor += 1;
      skip();
    }
    fail(reasonCode);
  };
  const parseValue = () => {
    skip();
    const character = text[cursor];
    if (character === '"') return parseString();
    if (character === "{") return parseObject();
    if (character === "[") return parseArray();
    if (character === "-" || /\d/.test(character || "")) return parseNumber();
    for (const [literal, value] of [["true", true], ["false", false], ["null", null]]) {
      if (text.startsWith(literal, cursor)) {
        cursor += literal.length;
        return value;
      }
    }
    fail(reasonCode);
  };
  const result = parseValue();
  skip();
  if (cursor !== text.length) fail(reasonCode);
  return result;
}

function normalizeQuestion(value) {
  return value.normalize("NFKC").trim().replace(/[?？。！!\s]+/gu, "").toLowerCase();
}

function questionCount(value) {
  if (typeof value !== "string") return 0;
  return (value.match(/[?？]/gu) || []).length;
}

function validateEvidenceShape(evidence) {
  exactKeys(evidence, EVIDENCE_KEYS, "TURN_EVIDENCE_SHAPE_INVALID");
  nonEmptyString(evidence.source_id, 64, "TURN_EVIDENCE_SOURCE_INVALID");
  nonEmptyString(evidence.url, 2048, "TURN_EVIDENCE_URL_INVALID");
  dateValue(evidence.retrieved_at, "TURN_EVIDENCE_TIME_INVALID");
  nullableString(evidence.version, 120, "TURN_EVIDENCE_VERSION_INVALID");
}

function validateClaimShape(claim) {
  exactKeys(claim, CLAIM_KEYS, "TURN_CLAIM_SHAPE_INVALID");
  nonEmptyString(claim.claim_id, 64, "TURN_CLAIM_ID_INVALID");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(claim.claim_id)) fail("TURN_CLAIM_ID_INVALID");
  nonEmptyString(claim.text, 2000, "TURN_CLAIM_TEXT_INVALID");
  enumValue(claim.risk, RISK_CLASSES, "TURN_CLAIM_RISK_INVALID");
  booleanValue(claim.dynamic, "TURN_CLAIM_DYNAMIC_INVALID");
  booleanValue(claim.versioned, "TURN_CLAIM_VERSIONED_INVALID");
  booleanValue(claim.definitive, "TURN_CLAIM_DEFINITIVE_INVALID");
  enumValue(claim.source_kind, SOURCE_KINDS, "TURN_CLAIM_SOURCE_KIND_INVALID");
  nullableString(claim.card_id, 64, "TURN_CLAIM_CARD_ID_INVALID");
  if (claim.card_id !== null && !/^[A-Z0-9][A-Z0-9._-]{2,63}$/.test(claim.card_id)) fail("TURN_CLAIM_CARD_ID_INVALID");
  if (!Array.isArray(claim.evidence) || claim.evidence.length > 20) fail("TURN_EVIDENCE_LIST_INVALID");
  for (const evidence of claim.evidence) validateEvidenceShape(evidence);
}

export function validateTurnShape(turn) {
  exactKeys(turn, TURN_KEYS, "TURN_SHAPE_INVALID");
  if (turn.schema_version !== "1.0.0") fail("TURN_SCHEMA_VERSION_INVALID");
  nonEmptyString(turn.turn_id, 128, "TURN_ID_INVALID");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(turn.turn_id)) fail("TURN_ID_INVALID");
  dateValue(turn.turn_started_at, "TURN_STARTED_AT_INVALID");
  enumValue(turn.safety_gate, ["PASS", "ESCALATE"], "TURN_SAFETY_GATE_INVALID");
  enumValue(turn.privacy_gate, ["PASS", "QUERY_PRIVACY_DENY"], "TURN_PRIVACY_GATE_INVALID");
  enumValue(turn.retrieval_status, RETRIEVAL_STATUSES, "TURN_RETRIEVAL_STATUS_INVALID");
  booleanValue(turn.separate_external_route_authorized, "TURN_EXTERNAL_AUTH_INVALID");
  booleanValue(turn.external_query_sent, "TURN_EXTERNAL_QUERY_STATE_INVALID");

  exactKeys(turn.context, CONTEXT_KEYS, "TURN_CONTEXT_SHAPE_INVALID");
  booleanValue(turn.context.missing_changes_path, "TURN_CONTEXT_PATH_FLAG_INVALID");
  booleanValue(turn.context.candidate_paths_differ, "TURN_CONTEXT_CANDIDATE_FLAG_INVALID");
  enumValue(turn.context.ambiguity_stage, AMBIGUITY_STAGES, "TURN_CONTEXT_STAGE_INVALID");
  booleanValue(turn.context.unresolved, "TURN_CONTEXT_UNRESOLVED_INVALID");
  nullableString(turn.context.previous_question, 500, "TURN_PREVIOUS_QUESTION_INVALID");
  nullableString(turn.context.question, 500, "TURN_QUESTION_INVALID");

  exactKeys(turn.proposed, PROPOSED_KEYS, "TURN_PROPOSED_SHAPE_INVALID");
  enumValue(turn.proposed.destination, TURN_DESTINATIONS, "TURN_DESTINATION_INVALID");
  nonEmptyString(turn.proposed.destination_detail, 500, "TURN_DESTINATION_DETAIL_INVALID");
  if (!Array.isArray(turn.proposed.claims) || turn.proposed.claims.length > 50) fail("TURN_CLAIM_LIST_INVALID");
  const claimIds = new Set();
  for (const claim of turn.proposed.claims) {
    validateClaimShape(claim);
    if (claimIds.has(claim.claim_id)) fail("TURN_CLAIM_ID_DUPLICATE");
    claimIds.add(claim.claim_id);
  }
  return turn;
}

function validatePolicySource(source, seenIds) {
  exactKeys(source, POLICY_SOURCE_KEYS, "POLICY_SOURCE_SHAPE_INVALID");
  nonEmptyString(source.source_id, 64, "POLICY_SOURCE_ID_INVALID");
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(source.source_id) || seenIds.has(source.source_id)) {
    fail("POLICY_SOURCE_ID_INVALID");
  }
  seenIds.add(source.source_id);
  nonEmptyString(source.owner, 120, "POLICY_SOURCE_OWNER_INVALID");
  enumValue(source.status, ["ACTIVE", "INACTIVE"], "POLICY_SOURCE_STATUS_INVALID");
  uniqueStrings(source.allowed_risks, {
    min: 1,
    max: 3,
    itemMax: 6,
    pattern: /^(?:LOW|MEDIUM|HIGH)$/,
    reasonCode: "POLICY_SOURCE_RISK_INVALID"
  });
  uniqueStrings(source.url_prefixes, {
    min: 1,
    max: 20,
    itemMax: 2048,
    reasonCode: "POLICY_SOURCE_URL_INVALID"
  });
  for (const prefix of source.url_prefixes) {
    let parsed;
    try {
      parsed = new URL(prefix);
    } catch {
      fail("POLICY_SOURCE_URL_INVALID");
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      fail("POLICY_SOURCE_URL_INVALID");
    }
  }
  positiveInteger(source.stable_max_age_hours, 8760, "POLICY_STABLE_AGE_INVALID");
  positiveInteger(source.dynamic_max_age_hours, 168, "POLICY_DYNAMIC_AGE_INVALID");
  uniqueStrings(source.invalidation_conditions, {
    min: 1,
    max: 20,
    itemMax: 240,
    reasonCode: "POLICY_INVALIDATION_INVALID"
  });
}

export function validatePolicy(policy, now = new Date()) {
  exactKeys(policy, POLICY_KEYS, "POLICY_SHAPE_INVALID");
  if (policy.schema_version !== "1.0.0" || policy.policy_id !== "AIHD-EXTERNAL-SOURCES") {
    fail("POLICY_IDENTITY_INVALID");
  }
  nonEmptyString(policy.revision, 32, "POLICY_REVISION_INVALID");
  if (!/^\d+\.\d+\.\d+$/.test(policy.revision)) fail("POLICY_REVISION_INVALID");
  nonEmptyString(policy.owner, 120, "POLICY_OWNER_INVALID");
  const effectiveAt = dateValue(policy.effective_at, "POLICY_EFFECTIVE_AT_INVALID");
  const expiresAt = dateValue(policy.expires_at, "POLICY_EXPIRES_AT_INVALID");
  if (expiresAt <= effectiveAt) fail("POLICY_WINDOW_INVALID");
  if (!(now instanceof Date) || Number.isNaN(now.valueOf())) fail("EVALUATION_TIME_INVALID");
  if (now < effectiveAt) fail("POLICY_NOT_EFFECTIVE");
  if (now >= expiresAt) fail("POLICY_EXPIRED");
  if (!Array.isArray(policy.sources) || policy.sources.length < 1 || policy.sources.length > 100) {
    fail("POLICY_SOURCE_LIST_INVALID");
  }
  const seenIds = new Set();
  for (const source of policy.sources) validatePolicySource(source, seenIds);
  return policy;
}

export function loadPolicy(policyPath = DEFAULT_POLICY_PATH, now = new Date()) {
  let text;
  try {
    text = fs.readFileSync(policyPath, "utf8");
  } catch {
    fail("POLICY_MISSING");
  }
  const policy = parseStrictJson(text, "POLICY_MALFORMED");
  return validatePolicy(policy, now);
}

function matchesApprovedPrefix(rawUrl, prefixes) {
  let candidate;
  try {
    candidate = new URL(rawUrl);
  } catch {
    return false;
  }
  if (candidate.protocol !== "https:" || candidate.username || candidate.password) return false;
  return prefixes.some((rawPrefix) => {
    const prefix = new URL(rawPrefix);
    return candidate.origin === prefix.origin && candidate.pathname.startsWith(prefix.pathname);
  });
}

function validateExternalClaim(claim, policy, turnStartedAt, now) {
  if (claim.evidence.length === 0 || claim.card_id !== null) fail("EXTERNAL_EVIDENCE_REQUIRED");
  const sourceMap = new Map(policy.sources.map((source) => [source.source_id, source]));
  for (const evidence of claim.evidence) {
    const source = sourceMap.get(evidence.source_id);
    if (!source) fail("EXTERNAL_SOURCE_NOT_ALLOWLISTED");
    if (source.status !== "ACTIVE") fail("EXTERNAL_SOURCE_INACTIVE");
    if (!source.allowed_risks.includes(claim.risk)) fail("EXTERNAL_SOURCE_RISK_DENIED");
    if (!matchesApprovedPrefix(evidence.url, source.url_prefixes)) fail("EXTERNAL_URL_NOT_ALLOWLISTED");
    const retrievedAt = new Date(evidence.retrieved_at);
    if (retrievedAt > now) fail("EXTERNAL_EVIDENCE_FROM_FUTURE");
    const maxAge = claim.dynamic ? source.dynamic_max_age_hours : source.stable_max_age_hours;
    if ((now - retrievedAt) / 3_600_000 > maxAge) fail("EXTERNAL_EVIDENCE_EXPIRED");
    if ((claim.dynamic || claim.risk === "HIGH") && retrievedAt < turnStartedAt) {
      fail("EXTERNAL_SAME_TURN_VERIFICATION_REQUIRED");
    }
    if (claim.versioned && evidence.version === null) fail("EXTERNAL_VERSION_BINDING_REQUIRED");
  }
}

function validateClaimSemantics(claim, policy, turnStartedAt, now) {
  if (claim.source_kind === "PUBLIC_CARD") {
    if (claim.card_id === null || claim.evidence.length !== 0) fail("PUBLIC_CARD_PROVENANCE_INVALID");
    return;
  }
  if (claim.source_kind === "MODEL_REASONING") {
    if (claim.card_id !== null || claim.evidence.length !== 0) fail("MODEL_REASONING_PROVENANCE_INVALID");
    if (claim.definitive && (claim.risk === "HIGH" || claim.dynamic)) {
      fail("MODEL_REASONING_DEFINITIVE_FORBIDDEN");
    }
    return;
  }
  validateExternalClaim(claim, policy, turnStartedAt, now);
}

function requiresPolicy(turn) {
  return turn.proposed.claims.some((claim) => claim.source_kind === "EXTERNAL_VERIFIED") ||
    ((turn.retrieval_status === "MISS" || turn.retrieval_status === "DENY") && turn.separate_external_route_authorized);
}

function expectedClarification(turn) {
  if (!turn.context.unresolved) return null;
  if (!turn.context.missing_changes_path && !turn.context.candidate_paths_differ) return null;
  if (turn.context.ambiguity_stage === "REFRAME_ASKED") return "UNKNOWN";
  return "NEEDS_INPUT";
}

function validateClarification(turn) {
  const expected = expectedClarification(turn);
  const { context, proposed } = turn;
  if (turn.safety_gate === "ESCALATE") {
    if (context.question !== null) fail("SAFETY_QUESTION_FORBIDDEN");
    return;
  }
  if (turn.privacy_gate === "QUERY_PRIVACY_DENY") {
    if (proposed.destination !== "NEEDS_INPUT" || context.question === null || questionCount(context.question) !== 1) {
      fail("PRIVACY_SAFE_RESTATEMENT_REQUIRED");
    }
    return;
  }
  if (expected === "NEEDS_INPUT") {
    if (proposed.destination !== "NEEDS_INPUT" || context.question === null || questionCount(context.question) !== 1) {
      fail("CLARIFICATION_EXACTLY_ONE_REQUIRED");
    }
    if (context.ambiguity_stage === "INITIAL_ASKED") {
      if (context.previous_question === null || normalizeQuestion(context.previous_question) === normalizeQuestion(context.question)) {
        fail("CLARIFICATION_REFRAME_REQUIRED");
      }
    }
    return;
  }
  if (expected === "UNKNOWN") {
    if (proposed.destination !== "UNKNOWN" || context.question !== null) fail("CLARIFICATION_LIMIT_EXCEEDED");
    return;
  }
  if (context.question !== null) fail("CLARIFICATION_NOT_JUSTIFIED");
  if (proposed.destination === "NEEDS_INPUT" && turn.privacy_gate !== "QUERY_PRIVACY_DENY") {
    fail("CLARIFICATION_NOT_JUSTIFIED");
  }
}

function validateRouting(turn) {
  if (turn.safety_gate === "ESCALATE" && turn.proposed.destination !== "ESCALATE") {
    fail("SAFETY_ESCALATION_REQUIRED");
  }
  if (turn.privacy_gate === "QUERY_PRIVACY_DENY") {
    if (turn.external_query_sent || turn.proposed.destination !== "NEEDS_INPUT") fail("PRIVACY_QUERY_MUST_NOT_LEAVE");
    if (turn.proposed.claims.some((claim) => claim.source_kind === "EXTERNAL_VERIFIED")) {
      fail("PRIVACY_QUERY_MUST_NOT_LEAVE");
    }
  }
  if (turn.retrieval_status === "DENY" && !turn.separate_external_route_authorized) {
    if (turn.external_query_sent || turn.proposed.claims.some((claim) => claim.source_kind === "EXTERNAL_VERIFIED")) {
      fail("DENY_AUTOMATIC_FALLBACK_FORBIDDEN");
    }
  }
  if (turn.external_query_sent && !turn.separate_external_route_authorized) fail("EXTERNAL_ROUTE_NOT_AUTHORIZED");
  if (
    turn.proposed.claims.some((claim) => claim.source_kind === "EXTERNAL_VERIFIED") &&
    !turn.separate_external_route_authorized
  ) {
    fail("EXTERNAL_ROUTE_NOT_AUTHORIZED");
  }
  if (turn.separate_external_route_authorized && (turn.safety_gate !== "PASS" || turn.privacy_gate !== "PASS")) {
    fail("EXTERNAL_ROUTE_GATE_NOT_PASSED");
  }
}

function destinationMessage(destination, detail, question) {
  const messages = {
    DO: `下一步先做这一件事：${detail}`,
    VERIFY: `先核实这一点再下结论：${detail}`,
    WAIT: `现在先等这个条件出现：${detail}`,
    STOP: `先停下当前动作：${detail}`,
    NO_ACTION_NEEDED: `这一步不用继续行动：${detail}`,
    NEEDS_INPUT: `还差一个会改变处理路径的信息：${question}`,
    UNKNOWN: `目前证据不足，先保留未知：${detail}`,
    ESCALATE: `这需要交给有权限或专业资格的人处理：${detail}`
  };
  return messages[destination];
}

function provenanceNotices(claims) {
  const kinds = new Set(claims.map((claim) => claim.source_kind));
  const notices = [];
  if (kinds.has("PUBLIC_CARD")) notices.push("其中有结论来自已通过发布门的公共知识卡。");
  if (kinds.has("EXTERNAL_VERIFIED")) notices.push("其中有结论来自本轮或有效期内核验的获准官方来源。");
  if (kinds.has("MODEL_REASONING")) notices.push("其中有结论是模型推理，不等同于知识库或外部事实。");
  return notices;
}

function failDestination(turn, reasonCode) {
  if (turn?.safety_gate === "ESCALATE") return "ESCALATE";
  if (turn?.privacy_gate === "QUERY_PRIVACY_DENY") return "NEEDS_INPUT";
  if (reasonCode === "CLARIFICATION_LIMIT_EXCEEDED" || turn?.context?.ambiguity_stage === "REFRAME_ASKED") {
    return "UNKNOWN";
  }
  const highRisk = turn?.proposed?.claims?.some((claim) => claim?.risk === "HIGH");
  if (highRisk) return "ESCALATE";
  if (reasonCode.startsWith("POLICY_") || reasonCode.startsWith("EXTERNAL_") || reasonCode === "MODEL_REASONING_DEFINITIVE_FORBIDDEN") {
    return "VERIFY";
  }
  return "UNKNOWN";
}

function failClosed(turn, reasonCode) {
  const destination = failDestination(turn, reasonCode);
  const detail = destination === "VERIFY"
    ? "当前来源、时效或风险门没有通过"
    : destination === "ESCALATE"
      ? "当前风险需要人工或专业权限复核"
      : destination === "NEEDS_INPUT"
        ? "请先把敏感信息移除后安全重述"
        : "当前合同证据不足，不能继续下结论";
  return {
    contract_status: "FAIL_CLOSED",
    internal_destination: destination,
    user_destination: destinationMessage(destination, detail, null),
    question: destination === "NEEDS_INPUT" ? "你能否移除敏感信息后重新描述问题？" : null,
    claims: [],
    provenance_notices: [],
    reason_codes: [reasonCode]
  };
}

export function evaluateTurn(turn, { policy = null, now = new Date() } = {}) {
  try {
    validateTurnShape(turn);
    if (!(now instanceof Date) || Number.isNaN(now.valueOf())) fail("EVALUATION_TIME_INVALID");
    const turnStartedAt = new Date(turn.turn_started_at);
    if (turnStartedAt > now) fail("TURN_STARTED_IN_FUTURE");
    validateRouting(turn);
    validateClarification(turn);
    if (MACHINE_LABEL_PATTERN.test(turn.proposed.destination_detail)) fail("MACHINE_LABEL_IN_USER_TEXT");
    if (requiresPolicy(turn)) {
      if (policy === null) fail("POLICY_MISSING");
      validatePolicy(policy, now);
    }
    for (const claim of turn.proposed.claims) validateClaimSemantics(claim, policy, turnStartedAt, now);
    if (
      turn.proposed.claims.some((claim) =>
        claim.source_kind === "MODEL_REASONING" && (claim.risk === "HIGH" || claim.dynamic)
      ) && !["VERIFY", "ESCALATE", "UNKNOWN"].includes(turn.proposed.destination)
    ) {
      fail("MODEL_REASONING_DESTINATION_INVALID");
    }
    const userDestination = destinationMessage(
      turn.proposed.destination,
      turn.proposed.destination_detail,
      turn.context.question
    );
    if (MACHINE_LABEL_PATTERN.test(userDestination)) fail("MACHINE_LABEL_IN_USER_TEXT");
    return {
      contract_status: "CONTRACT_PASS",
      internal_destination: turn.proposed.destination,
      user_destination: userDestination,
      question: turn.context.question,
      claims: turn.proposed.claims,
      provenance_notices: provenanceNotices(turn.proposed.claims),
      reason_codes: []
    };
  } catch (error) {
    if (!(error instanceof ContractError)) throw error;
    return failClosed(turn, error.reasonCode);
  }
}

export function evaluateTurnWithPolicyFile(turn, { policyPath = DEFAULT_POLICY_PATH, now = new Date() } = {}) {
  try {
    validateTurnShape(turn);
    if (!requiresPolicy(turn)) return evaluateTurn(turn, { now });
    const policy = loadPolicy(policyPath, now);
    return evaluateTurn(turn, { policy, now });
  } catch (error) {
    if (!(error instanceof ContractError)) throw error;
    return failClosed(turn, error.reasonCode);
  }
}

function parseArguments(argv) {
  const output = { inputPath: null, policyPath: DEFAULT_POLICY_PATH, now: new Date() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") output.inputPath = argv[++index];
    else if (argument === "--policy") output.policyPath = argv[++index];
    else if (argument === "--now") output.now = new Date(argv[++index]);
    else fail("CLI_ARGUMENT_INVALID");
  }
  if (!output.inputPath || Number.isNaN(output.now.valueOf())) fail("CLI_ARGUMENT_INVALID");
  return output;
}

function runCli() {
  try {
    const options = parseArguments(process.argv.slice(2));
    let inputText;
    try {
      inputText = fs.readFileSync(options.inputPath, "utf8");
    } catch {
      fail("TURN_INPUT_MISSING");
    }
    const turn = parseStrictJson(inputText, "TURN_INPUT_MALFORMED");
    const result = evaluateTurnWithPolicyFile(turn, options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.contract_status === "CONTRACT_PASS" ? 0 : 65;
  } catch (error) {
    const reasonCode = error instanceof ContractError ? error.reasonCode : "UNEXPECTED_ERROR";
    process.stdout.write(`${JSON.stringify(failClosed(null, reasonCode), null, 2)}\n`);
    process.exitCode = 65;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) runCli();
