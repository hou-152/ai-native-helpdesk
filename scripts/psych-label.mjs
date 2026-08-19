#!/usr/bin/env node

const LABELS = Object.freeze({
  USER_ADMITS: "USER_ADMITS",
  BEHAVIORAL_CONTRADICTION: "BEHAVIORAL_CONTRADICTION",
  SUSPECTED: "SUSPECTED",
  NONE: "NONE"
});

const CONFIDENCES = Object.freeze({ HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" });

const ROUTES = Object.freeze({
  AUXILIARY: "AUXILIARY",
  SAFETY: "SAFETY",
  FAIL_CLOSED: "FAIL_CLOSED"
});

const CONTRADICTION_CRITERIA = Object.freeze({
  TIME_CONTRADICTION: "TIME_CONTRADICTION",
  CONSUMPTION_CONTRADICTION: "CONSUMPTION_CONTRADICTION",
  ACTION_CONTRADICTION: "ACTION_CONTRADICTION",
  DIRECTION_CONTRADICTION: "DIRECTION_CONTRADICTION",
  LEARNING_CONTRADICTION: "LEARNING_CONTRADICTION"
});

const EVIDENCE_SOURCE = "USER_CURRENT_TURN";
const CONSENT_SCOPES = Object.freeze({
  FEEDBACK_PERSISTENCE: "FEEDBACK_PERSISTENCE",
  SEVEN_DAY_FOLLOW_UP: "SEVEN_DAY_FOLLOW_UP"
});

const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
  return isObject(value) && Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isOpaqueReference(value) {
  return typeof value === "string" && OPAQUE_REFERENCE.test(value);
}

function isFiniteNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isIsoDateTime(value) {
  return typeof value === "string" && ISO_DATE_TIME.test(value) && Number.isFinite(Date.parse(value));
}

function failClosed(reasonCode) {
  return {
    route: ROUTES.FAIL_CLOSED,
    label: null,
    confidence: null,
    reason_code: reasonCode
  };
}

function auxiliary(label, confidence, reasonCode, evidence) {
  return {
    route: ROUTES.AUXILIARY,
    label,
    confidence,
    reason_code: reasonCode,
    evidence_ref: evidence?.reference ?? null
  };
}

function validFacts(criterion, facts) {
  if (!isObject(facts)) return false;

  switch (criterion) {
    case CONTRADICTION_CRITERIA.TIME_CONTRADICTION:
      return (
        hasOnlyKeys(facts, ["claims_no_time", "entertainment_minutes_per_day"]) &&
        facts.claims_no_time === true &&
        isFiniteNonNegativeNumber(facts.entertainment_minutes_per_day)
      );
    case CONTRADICTION_CRITERIA.CONSUMPTION_CONTRADICTION:
      return (
        hasOnlyKeys(facts, ["claims_learning_goal", "courses_bought", "completion_rate_percent"]) &&
        facts.claims_learning_goal === true &&
        Number.isInteger(facts.courses_bought) &&
        facts.courses_bought >= 0 &&
        facts.completion_rate_percent === 0
      );
    case CONTRADICTION_CRITERIA.ACTION_CONTRADICTION:
      return (
        hasOnlyKeys(facts, ["claims_want_change", "days_since_related_action"]) &&
        facts.claims_want_change === true &&
        Number.isInteger(facts.days_since_related_action) &&
        facts.days_since_related_action >= 0
      );
    case CONTRADICTION_CRITERIA.DIRECTION_CONTRADICTION:
      return (
        hasOnlyKeys(facts, ["claims_stable_direction", "direction_durations_days"]) &&
        facts.claims_stable_direction === true &&
        Array.isArray(facts.direction_durations_days) &&
        facts.direction_durations_days.length > 3 &&
        facts.direction_durations_days.every(
          (days) => isFiniteNonNegativeNumber(days) && days > 0 && days < 14
        )
      );
    case CONTRADICTION_CRITERIA.LEARNING_CONTRADICTION:
      return (
        hasOnlyKeys(facts, ["claims_learning", "activity_counts"]) &&
        facts.claims_learning === true &&
        isObject(facts.activity_counts) &&
        hasOnlyKeys(facts.activity_counts, ["questions", "practice", "outputs"]) &&
        ["questions", "practice", "outputs"].every(
          (key) => Number.isInteger(facts.activity_counts[key]) && facts.activity_counts[key] >= 0
        )
      );
    default:
      return false;
  }
}

function criterionMet(criterion, facts) {
  if (!validFacts(criterion, facts)) return false;

  switch (criterion) {
    case CONTRADICTION_CRITERIA.TIME_CONTRADICTION:
      return facts.entertainment_minutes_per_day > 60;
    case CONTRADICTION_CRITERIA.CONSUMPTION_CONTRADICTION:
      return facts.courses_bought > 3 && facts.completion_rate_percent === 0;
    case CONTRADICTION_CRITERIA.ACTION_CONTRADICTION:
      return facts.days_since_related_action > 7;
    case CONTRADICTION_CRITERIA.DIRECTION_CONTRADICTION:
      return true;
    case CONTRADICTION_CRITERIA.LEARNING_CONTRADICTION:
      return Object.values(facts.activity_counts).every((count) => count === 0);
    default:
      return false;
  }
}

function validContradictionShape(signal) {
  return (
    hasOnlyKeys(signal, [
      "criterion",
      "same_goal",
      "same_time_range",
      "goal_ref",
      "time_range_ref",
      "reasonable_constraint",
      "facts"
    ]) &&
    Object.values(CONTRADICTION_CRITERIA).includes(signal.criterion) &&
    typeof signal.same_goal === "boolean" &&
    typeof signal.same_time_range === "boolean" &&
    isOpaqueReference(signal.goal_ref) &&
    isOpaqueReference(signal.time_range_ref) &&
    typeof signal.reasonable_constraint === "boolean" &&
    validFacts(signal.criterion, signal.facts)
  );
}

function validContradiction(signal) {
  return (
    validContradictionShape(signal) &&
    signal.same_goal === true &&
    signal.same_time_range === true &&
    signal.reasonable_constraint === false &&
    criterionMet(signal.criterion, signal.facts)
  );
}

function validEvidenceEnvelope(evidence) {
  if (
    !hasOnlyKeys(evidence, [
      "source",
      "reference",
      "explicit_admission",
      "hedged_self_attribution",
      "other_behavior_signal",
      "other_behavior_kind",
      "behavioral_contradiction"
    ]) ||
    evidence.source !== EVIDENCE_SOURCE ||
    !isOpaqueReference(evidence.reference)
  ) {
    return false;
  }

  for (const key of ["explicit_admission", "hedged_self_attribution", "other_behavior_signal"]) {
    if (evidence[key] !== undefined && typeof evidence[key] !== "boolean") return false;
  }

  if (evidence.other_behavior_signal === true && evidence.other_behavior_kind !== "EXECUTION_RESISTANCE") {
    return false;
  }

  if (
    evidence.behavioral_contradiction !== undefined &&
    !validContradictionShape(evidence.behavioral_contradiction)
  ) {
    return false;
  }

  return true;
}

function classifyPsychLabel(input = {}) {
  if (!isObject(input)) return failClosed("INPUT_OBJECT_REQUIRED");

  if (input.safety_red_flag !== undefined && typeof input.safety_red_flag !== "boolean") {
    return failClosed("INVALID_SAFETY_FLAG_TYPE");
  }

  if (input.safety_red_flag === true) {
    return { route: ROUTES.SAFETY, label: null, confidence: null, reason_code: "SAFETY_RED_FLAG" };
  }

  if (!hasOnlyKeys(input, ["main_route_completed", "safety_red_flag", "evidence"])) {
    return failClosed("UNKNOWN_INPUT_FIELD");
  }

  if (input.main_route_completed !== true) {
    return failClosed("MAIN_ROUTE_NOT_COMPLETED");
  }

  if (input.evidence === undefined) {
    return auxiliary(LABELS.NONE, CONFIDENCES.LOW, "NO_SUFFICIENT_EVIDENCE", null);
  }

  if (!validEvidenceEnvelope(input.evidence)) {
    return failClosed("INVALID_CURRENT_TURN_EVIDENCE");
  }

  const evidence = input.evidence;
  if (validContradiction(evidence.behavioral_contradiction)) {
    return auxiliary(
      LABELS.BEHAVIORAL_CONTRADICTION,
      evidence.explicit_admission === true ? CONFIDENCES.HIGH : CONFIDENCES.MEDIUM,
      "BOUNDED_CRITERION_MET",
      evidence
    );
  }

  if (evidence.explicit_admission === true) {
    return auxiliary(LABELS.USER_ADMITS, CONFIDENCES.HIGH, "EXPLICIT_CURRENT_TURN_ADMISSION", evidence);
  }

  if (evidence.hedged_self_attribution === true || evidence.other_behavior_signal === true) {
    return auxiliary(LABELS.SUSPECTED, CONFIDENCES.LOW, "INSUFFICIENT_CONFIRMATION", evidence);
  }

  return auxiliary(LABELS.NONE, CONFIDENCES.LOW, "NO_SUFFICIENT_EVIDENCE", evidence);
}

function displayText(value, fallback) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function formatPsychLabelOutput(result, { evidence, suggestion } = {}) {
  if (!isObject(result)) return "心理层标注未执行：结果无效。";
  if (result.route === ROUTES.SAFETY) return "心理层标注未执行：已转安全路由。";
  if (result.route === ROUTES.FAIL_CLOSED) {
    return `心理层标注未执行：${result.reason_code || "FAIL_CLOSED"}。`;
  }

  const evidenceText = displayText(evidence, "当前没有足够证据");
  const lines = [
    "## 心理层标注",
    `${result.label} (置信度: ${result.confidence})`,
    `- 证据：${evidenceText}`
  ];
  if (result.label !== LABELS.NONE) {
    lines.push(`- 建议：${displayText(suggestion, "如果你愿意，可以先做一个最小、可验证的下一步。")}`);
  }
  return lines.join("\n");
}

function validConsentReceipt(consent) {
  return (
    hasOnlyKeys(consent, ["decision", "receipt_ref", "granted_at", "expires_at", "revoked_at", "scopes"]) &&
    consent.decision === "GRANTED" &&
    isOpaqueReference(consent.receipt_ref) &&
    isIsoDateTime(consent.granted_at) &&
    isIsoDateTime(consent.expires_at) &&
    Date.parse(consent.expires_at) > Date.parse(consent.granted_at) &&
    Array.isArray(consent.scopes) &&
    consent.scopes.length > 0 &&
    new Set(consent.scopes).size === consent.scopes.length &&
    consent.scopes.every((scope) => Object.values(CONSENT_SCOPES).includes(scope)) &&
    (consent.revoked_at === null || isIsoDateTime(consent.revoked_at))
  );
}

function persistenceDecision(request = {}) {
  if (!isObject(request)) {
    return {
      persist: false,
      schedule_follow_up: false,
      revoke_existing_follow_up: false,
      reason_code: "INVALID_CONSENT_REQUEST",
      side_effects: "DECISION_ONLY"
    };
  }

  if (!hasOnlyKeys(request, ["consent", "follow_up_at", "follow_up_days", "now"])) {
    return {
      persist: false,
      schedule_follow_up: false,
      revoke_existing_follow_up: false,
      reason_code: "UNKNOWN_CONSENT_REQUEST_FIELD",
      side_effects: "DECISION_ONLY"
    };
  }

  if (!validConsentReceipt(request.consent)) {
    return {
      persist: false,
      schedule_follow_up: false,
      revoke_existing_follow_up: false,
      reason_code: "INVALID_CONSENT_RECEIPT",
      side_effects: "DECISION_ONLY"
    };
  }

  const now = request.now ?? new Date().toISOString();
  if (!isIsoDateTime(now)) {
    return {
      persist: false,
      schedule_follow_up: false,
      revoke_existing_follow_up: false,
      reason_code: "INVALID_CONSENT_CLOCK",
      side_effects: "DECISION_ONLY"
    };
  }

  const nowMs = Date.parse(now);
  const revoked = request.consent.revoked_at !== null && Date.parse(request.consent.revoked_at) <= nowMs;
  const expired = Date.parse(request.consent.expires_at) <= nowMs;
  const active = !revoked && !expired;
  const persist = active && request.consent.scopes.includes(CONSENT_SCOPES.FEEDBACK_PERSISTENCE);

  const followUpAt = request.follow_up_at;
  const followUpDateValid = isIsoDateTime(followUpAt);
  const followUpWindowValid =
    followUpDateValid &&
    request.follow_up_days === 7 &&
    Math.abs(Date.parse(followUpAt) - nowMs - 7 * DAY_MS) <= 5 * 60 * 1000 &&
    Date.parse(followUpAt) <= Date.parse(request.consent.expires_at);
  const scheduleFollowUp =
    active &&
    request.consent.scopes.includes(CONSENT_SCOPES.SEVEN_DAY_FOLLOW_UP) &&
    followUpWindowValid;

  let reasonCode = "EXPLICIT_OPT_IN_SCOPED";
  if (revoked) reasonCode = "CONSENT_REVOKED";
  else if (expired) reasonCode = "CONSENT_EXPIRED";

  return {
    persist,
    schedule_follow_up: scheduleFollowUp,
    revoke_existing_follow_up: revoked || expired,
    reason_code: reasonCode,
    persist_reason_code: persist ? "FEEDBACK_SCOPE_GRANTED" : "FEEDBACK_SCOPE_NOT_GRANTED",
    follow_up_reason_code: scheduleFollowUp
      ? "SEVEN_DAY_SCOPE_GRANTED"
      : request.consent.scopes.includes(CONSENT_SCOPES.SEVEN_DAY_FOLLOW_UP)
        ? "FOLLOW_UP_WINDOW_NOT_VALID"
        : "FOLLOW_UP_SCOPE_NOT_GRANTED",
    consent_ref: request.consent.receipt_ref,
    side_effects: "DECISION_ONLY"
  };
}

export {
  CONFIDENCES,
  CONSENT_SCOPES,
  CONTRADICTION_CRITERIA,
  LABELS,
  ROUTES,
  classifyPsychLabel,
  formatPsychLabelOutput,
  persistenceDecision
};
