#!/usr/bin/env node
/**
 * Minimal state machine for the aihd-good-question clarification gate.
 *
 * Usage:
 *   node skills/good-question/scripts/clarify-gate.mjs --input '{"missing_fact":true,"changes_path":true}'
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = "aihd-good-question/clarify-gate";
const STAGES = new Set(["NONE", "INITIAL_ASKED", "REFRAME_ASKED"]);
const RESPONSES = new Set(["PENDING", "ANSWERED", "UNKNOWN", "DECLINED"]);

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

function readQuestionCount(input) {
  if (!("question_count" in input)) return 0;
  if (!Number.isInteger(input.question_count) || input.question_count < 0) {
    throw inputError("INPUT_INVALID", "question_count must be a non-negative integer");
  }
  return input.question_count;
}

function outcome({
  decision,
  nextStage,
  questionAllowed,
  validationSignal,
  persistenceCandidate,
  reasonCode
}) {
  return {
    status: "OK",
    script: SCRIPT,
    decision,
    next_ambiguity_stage: nextStage,
    question_allowed: questionAllowed,
    validation_signal: validationSignal,
    persistence_candidate: persistenceCandidate,
    reason_code: reasonCode
  };
}

/**
 * Evaluate only the clarification state. It does not write a candidate or
 * generate the natural-language question.
 */
export function evaluateClarifyGate(input) {
  if (!isRecord(input)) throw inputError("INPUT_INVALID", "input must be a JSON object");

  const missingFact = readBoolean(input, "missing_fact");
  const changesPath = readBoolean(input, "changes_path");
  const safetyOrPrivacy = readBoolean(input, "safety_or_privacy");
  const stage = readEnum(input, "ambiguity_stage", STAGES, "NONE");
  const response = readEnum(input, "user_response", RESPONSES, "PENDING");
  const questionCount = readQuestionCount(input);
  const persistenceCandidate = readBoolean(input, "new_experience");

  if (safetyOrPrivacy) {
    return outcome({
      decision: "STOP_FOR_GUARDRAIL",
      nextStage: stage,
      questionAllowed: false,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "GUARDRAIL_PRECEDES_CLARIFICATION"
    });
  }

  if (!missingFact || !changesPath) {
    return outcome({
      decision: "DO_NOT_ASK",
      nextStage: stage,
      questionAllowed: false,
      validationSignal: "EXCLUDED",
      persistenceCandidate,
      reasonCode: !missingFact ? "NO_MATERIAL_FACT_GAP" : "GAP_DOES_NOT_CHANGE_PATH"
    });
  }

  if (questionCount >= 3) {
    return outcome({
      decision: "STOP_UNKNOWN",
      nextStage: "REFRAME_ASKED",
      questionAllowed: false,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "QUESTION_LIMIT_REACHED"
    });
  }

  if (stage === "NONE") {
    return outcome({
      decision: "ASK_INITIAL",
      nextStage: "INITIAL_ASKED",
      questionAllowed: true,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "MATERIAL_GAP_CHANGES_PATH"
    });
  }

  if (response === "PENDING") {
    return outcome({
      decision: "WAIT_FOR_RESPONSE",
      nextStage: stage,
      questionAllowed: false,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "DISTINGUISHING_QUESTION_ALREADY_ASKED"
    });
  }

  if (response === "ANSWERED") {
    return outcome({
      decision: "REASSESS_WITH_NEW_FACTS",
      nextStage: stage,
      questionAllowed: false,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "USER_FACT_REQUIRES_REASSESSMENT"
    });
  }

  if (stage === "INITIAL_ASKED") {
    return outcome({
      decision: "ASK_REFRAME",
      nextStage: "REFRAME_ASKED",
      questionAllowed: true,
      validationSignal: "UNKNOWN",
      persistenceCandidate,
      reasonCode: "ONE_REFRAME_ALLOWED"
    });
  }

  return outcome({
    decision: "STOP_UNKNOWN",
    nextStage: "REFRAME_ASKED",
    questionAllowed: false,
    validationSignal: "UNKNOWN",
    persistenceCandidate,
    reasonCode: "REFRAME_DID_NOT_RESOLVE_AMBIGUITY"
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
    throw inputError("USAGE_INVALID", "usage: node clarify-gate.mjs --input '<JSON object>'");
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
        usage: "node clarify-gate.mjs --input '<JSON object>'",
        validation_signal: "UNKNOWN",
        persistence_candidate: false
      })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(evaluateClarifyGate(parsed.input))}\n`);
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
