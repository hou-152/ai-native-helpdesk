#!/usr/bin/env node

const LABELS = Object.freeze({
  USER_ADMITS: "USER_ADMITS",
  BEHAVIORAL_CONTRADICTION: "BEHAVIORAL_CONTRADICTION",
  SUSPECTED: "SUSPECTED",
  NONE: "NONE"
});

const CONFIDENCES = Object.freeze({ HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" });

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validContradiction(signal) {
  return (
    isObject(signal) &&
    signal.same_goal === true &&
    signal.same_time_range === true &&
    signal.criterion_met === true &&
    signal.reasonable_constraint !== true
  );
}

function classifyPsychLabel(input = {}) {
  if (!isObject(input)) throw new TypeError("INPUT_OBJECT_REQUIRED");

  if (input.safety_red_flag === true) {
    return { route: "SAFETY", label: null, confidence: null };
  }

  const contradiction = validContradiction(input.behavioral_contradiction);
  if (contradiction) {
    return {
      route: "AUXILIARY",
      label: LABELS.BEHAVIORAL_CONTRADICTION,
      confidence: input.explicit_admission === true ? CONFIDENCES.HIGH : CONFIDENCES.MEDIUM
    };
  }

  if (input.explicit_admission === true) {
    return { route: "AUXILIARY", label: LABELS.USER_ADMITS, confidence: CONFIDENCES.HIGH };
  }

  if (input.hedged_self_attribution === true || input.other_behavior_signal === true) {
    return { route: "AUXILIARY", label: LABELS.SUSPECTED, confidence: CONFIDENCES.LOW };
  }

  return { route: "AUXILIARY", label: LABELS.NONE, confidence: CONFIDENCES.LOW };
}

function persistenceDecision({ consent, revoked = false } = {}) {
  const allowed = consent === true && revoked !== true;
  return {
    persist: allowed,
    schedule_follow_up: allowed,
    reason_code: allowed ? "EXPLICIT_OPT_IN" : revoked === true ? "CONSENT_REVOKED" : "NO_EXPLICIT_OPT_IN"
  };
}

export { CONFIDENCES, LABELS, classifyPsychLabel, persistenceDecision };
