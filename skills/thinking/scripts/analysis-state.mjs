#!/usr/bin/env node
/**
 * Minimal state machine for aihd-thinking's draft-to-user-review protocol.
 *
 * Usage:
 *   node skills/thinking/scripts/analysis-state.mjs --input '{"phenomenon":"job failed","hypotheses":[{"id":"network"}]}'
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = "aihd-thinking/analysis-state";
const ACCEPTANCE = new Set(["PENDING", "ADOPTED", "REJECTED", "UNKNOWN"]);
const VERIFICATION = new Set(["CONFIRMED", "EXCLUDED", "UNKNOWN"]);

function inputError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readBoolean(input, key, defaultValue = false) {
  if (!(key in input)) return defaultValue;
  if (typeof input[key] !== "boolean") {
    throw inputError("INPUT_INVALID", `${key} must be a boolean`);
  }
  return input[key];
}

function readEnum(input, key, values, defaultValue) {
  if (!(key in input)) return defaultValue;
  if (typeof input[key] !== "string" || !values.has(input[key])) {
    throw inputError("INPUT_INVALID", `${key} must be one of: ${[...values].join(", ")}`);
  }
  return input[key];
}

function readPhenomenon(input) {
  if (!("phenomenon" in input)) return "";
  if (typeof input.phenomenon !== "string") {
    throw inputError("INPUT_INVALID", "phenomenon must be a string");
  }
  return input.phenomenon.trim();
}

function readHypotheses(input) {
  if (!("hypotheses" in input)) return [];
  if (!Array.isArray(input.hypotheses) || input.hypotheses.length > 3) {
    throw inputError("INPUT_INVALID", "hypotheses must be an array with at most 3 items");
  }
  return input.hypotheses.map((hypothesis, index) => {
    if (!isRecord(hypothesis) || typeof hypothesis.id !== "string" || hypothesis.id.trim() === "") {
      throw inputError("INPUT_INVALID", `hypotheses[${index}].id must be a non-empty string`);
    }
    return {
      id: hypothesis.id.trim(),
      conflicts_with_known_fact: readBoolean(hypothesis, "conflicts_with_known_fact")
    };
  });
}

function outcome({
  state,
  nextAction,
  candidateIds,
  validationSignal,
  persistenceCandidate,
  reasonCode
}) {
  return {
    status: "OK",
    script: SCRIPT,
    state,
    next_action: nextAction,
    candidate_count: candidateIds.length,
    active_candidate_ids: candidateIds,
    validation_signal: validationSignal,
    persistence_candidate: persistenceCandidate,
    reason_code: reasonCode
  };
}

/**
 * Evaluate analysis state only. This helper never chooses a final diagnosis,
 * calls another skill, or writes a persistence candidate.
 */
export function evaluateAnalysisState(input) {
  if (!isRecord(input)) throw inputError("INPUT_INVALID", "input must be a JSON object");

  const safetyOrPrivacy = readBoolean(input, "safety_or_privacy");
  const dynamicFact = readBoolean(input, "dynamic_fact");
  const phenomenon = readPhenomenon(input);
  const hypotheses = readHypotheses(input);
  const acceptance = readEnum(input, "acceptance", ACCEPTANCE, "PENDING");
  const verification = readEnum(input, "verification_result", VERIFICATION, "UNKNOWN");
  const persistenceCandidate = readBoolean(input, "new_experience");
  const activeCandidateIds = hypotheses
    .filter((hypothesis) => !hypothesis.conflicts_with_known_fact)
    .map((hypothesis) => hypothesis.id);

  if (safetyOrPrivacy) {
    return outcome({
      state: "HOLD_FOR_GUARDRAIL",
      nextAction: "STOP_AND_APPLY_GUARDRAIL",
      candidateIds: activeCandidateIds,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "GUARDRAIL_PRECEDES_ANALYSIS"
    });
  }

  if (dynamicFact) {
    return outcome({
      state: "VERIFY_DYNAMIC_FACT",
      nextAction: "VERIFY_CURRENT_SOURCE",
      candidateIds: activeCandidateIds,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "DYNAMIC_FACT_REQUIRES_CURRENT_EVIDENCE"
    });
  }

  if (!phenomenon) {
    return outcome({
      state: "NEEDS_INPUT",
      nextAction: "REQUEST_ONE_DISCRIMINATING_FACT",
      candidateIds: activeCandidateIds,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "PHENOMENON_MISSING"
    });
  }

  if (hypotheses.length === 0) {
    return outcome({
      state: "NEEDS_INPUT",
      nextAction: "FORM_CANDIDATE_EXPLANATIONS",
      candidateIds: activeCandidateIds,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "HYPOTHESES_MISSING"
    });
  }

  if (activeCandidateIds.length === 0) {
    return outcome({
      state: "ALL_CANDIDATES_EXCLUDED",
      nextAction: "KEEP_UNKNOWN_AND_REVISE_HYPOTHESES",
      candidateIds: activeCandidateIds,
      validationSignal: "EXCLUDED",
      persistenceCandidate,
      reasonCode: "ALL_CANDIDATES_CONFLICT_WITH_KNOWN_FACTS"
    });
  }

  if (verification === "EXCLUDED") {
    return outcome({
      state: "DRAFT_EXCLUDED",
      nextAction: "REVISE_HYPOTHESES",
      candidateIds: activeCandidateIds,
      validationSignal: "EXCLUDED",
      persistenceCandidate,
      reasonCode: "OBSERVABLE_SIGNAL_EXCLUDED_DRAFT"
    });
  }

  if (acceptance === "REJECTED") {
    return outcome({
      state: "DRAFT_REJECTED_BY_USER",
      nextAction: "KEEP_UNKNOWN_AND_REASSESS",
      candidateIds: activeCandidateIds,
      validationSignal: "EXCLUDED",
      persistenceCandidate,
      reasonCode: "USER_REJECTED_DRAFT"
    });
  }

  if (verification === "CONFIRMED" && acceptance === "ADOPTED") {
    return outcome({
      state: "CONCLUSION_CONFIRMED",
      nextAction: "TAKE_ONE_MINIMAL_NEXT_STEP",
      candidateIds: activeCandidateIds,
      validationSignal: "CONFIRMED",
      persistenceCandidate,
      reasonCode: "USER_ACCEPTED_AND_SIGNAL_CONFIRMED"
    });
  }

  if (acceptance === "ADOPTED") {
    return outcome({
      state: "DRAFT_ACCEPTED_PENDING_VERIFICATION",
      nextAction: "RUN_MINIMAL_VERIFICATION",
      candidateIds: activeCandidateIds,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "USER_ACCEPTED_DRAFT_EVIDENCE_PENDING"
    });
  }

  if (verification === "CONFIRMED") {
    return outcome({
      state: "EVIDENCE_CONFIRMED_AWAITING_USER_REVIEW",
      nextAction: "ASK_ONE_ACCEPTANCE_QUESTION",
      candidateIds: activeCandidateIds,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "USER_ACCEPTANCE_PENDING"
    });
  }

  return outcome({
    state: "DRAFT_READY_FOR_USER_REVIEW",
    nextAction: "ASK_ONE_ACCEPTANCE_QUESTION",
    candidateIds: activeCandidateIds,
    validationSignal: "UNKNOWN",
    persistenceCandidate,
    reasonCode: "DRAFT_NOT_YET_ACCEPTED"
  });
}

function parseInput(args) {
  if (args.length === 1 && args[0] === "--help") {
    return { help: true };
  }
  if (args.length === 0) {
    throw inputError("INPUT_REQUIRED", "provide --input '<JSON object>'");
  }
  if (args.length !== 2 || args[0] !== "--input") {
    throw inputError("USAGE_INVALID", "usage: node analysis-state.mjs --input '<JSON object>'");
  }
  try {
    return { input: JSON.parse(args[1]) };
  } catch {
    throw inputError("INPUT_INVALID", "--input must be valid JSON");
  }
}

function main(args) {
  try {
    const parsed = parseInput(args);
    if (parsed.help) {
      process.stdout.write(`${JSON.stringify({
        status: "HELP",
        script: SCRIPT,
        usage: "node analysis-state.mjs --input '<JSON object>'",
        validation_signal: "UNKNOWN",
        persistence_candidate: false
      })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(evaluateAnalysisState(parsed.input))}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: "ERROR",
      script: SCRIPT,
      code: error.code ?? "UNEXPECTED_ERROR",
      message: error.message
    })}\n`);
    process.exitCode = 64;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
