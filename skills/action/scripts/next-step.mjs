#!/usr/bin/env node
/**
 * Minimal, dependency-free decision skeleton for aihd-action.
 *
 * Usage:
 *   node next-step.mjs --input '{"action":{"available":true,"observable":true,"reversible":true}}'
 *
 * Success writes one JSON object to stdout. Input failures write one JSON
 * object to stderr and exit 64, so callers can distinguish an unusable input
 * from the normal UNKNOWN outcome of an empty object.
 */

const INPUT_ERROR_EXIT_CODE = 64;

const BOOLEAN_FIELDS = new Set([
  "safety_red_line",
  "requires_stop",
  "requires_escalation",
  "no_action_needed",
  "missing_path_fact",
  "external_condition_pending",
  "requires_verification",
  "evidence_insufficient",
  "new_pattern_observed"
]);

const ALLOWED_FIELDS = new Set([...BOOLEAN_FIELDS, "action"]);
const ACTION_FIELDS = new Set(["available", "observable", "reversible"]);

class InputError extends Error {
  constructor(reasonCode, message) {
    super(message);
    this.reasonCode = reasonCode;
  }
}

function writeJson(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`);
}

function usage() {
  return {
    status: "USAGE",
    validation_signal: {
      status: "UNKNOWN",
      detail: "No decision input was processed."
    },
    persistence_candidate: {
      status: "NO",
      detail: "No decision input was processed."
    },
    usage: "node next-step.mjs --input '<JSON>'",
    input: {
      safety_red_line: "boolean (optional)",
      requires_stop: "boolean (optional)",
      requires_escalation: "boolean (optional)",
      no_action_needed: "boolean (optional)",
      missing_path_fact: "boolean (optional)",
      external_condition_pending: "boolean (optional)",
      requires_verification: "boolean (optional)",
      evidence_insufficient: "boolean (optional)",
      new_pattern_observed: "boolean (optional)",
      action: {
        available: "boolean (optional)",
        observable: "boolean (optional)",
        reversible: "boolean (optional)"
      }
    }
  };
}

function readInput(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (argv.length !== 2 || argv[0] !== "--input") {
    throw new InputError(
      "INPUT_REQUIRED",
      "Pass exactly one JSON object with --input '<JSON>'; run --help for the schema."
    );
  }

  try {
    return { value: JSON.parse(argv[1]) };
  } catch {
    throw new InputError("INVALID_JSON", "--input must contain valid JSON.");
  }
}

function readBoolean(input, field) {
  if (!(field in input)) return false;
  if (typeof input[field] !== "boolean") {
    throw new InputError("INVALID_FIELD_TYPE", `${field} must be a boolean.`);
  }
  return input[field];
}

function validateInput(value) {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new InputError("INPUT_NOT_OBJECT", "--input must be a JSON object.");
  }

  for (const field of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(field)) {
      throw new InputError("UNKNOWN_FIELD", `Unsupported input field: ${field}.`);
    }
  }

  const input = Object.fromEntries(
    [...BOOLEAN_FIELDS].map((field) => [field, readBoolean(value, field)])
  );

  const action = { available: false, observable: false, reversible: false };
  if ("action" in value) {
    if (value.action === null || Array.isArray(value.action) || typeof value.action !== "object") {
      throw new InputError("INVALID_ACTION", "action must be a JSON object.");
    }
    for (const field of Object.keys(value.action)) {
      if (!ACTION_FIELDS.has(field)) {
        throw new InputError("UNKNOWN_ACTION_FIELD", `Unsupported action field: ${field}.`);
      }
      if (typeof value.action[field] !== "boolean") {
        throw new InputError("INVALID_ACTION_FIELD_TYPE", `action.${field} must be a boolean.`);
      }
      action[field] = value.action[field];
    }
  }

  return { ...input, action };
}

function decide(input) {
  // Priority is intentionally fail-closed: a stop or escalation condition
  // wins before a potentially executable action is considered.
  if (input.safety_red_line || input.requires_stop) {
    return ["STOP", "SAFETY_OR_STOP_CONDITION"];
  }
  if (input.requires_escalation) return ["ESCALATE", "AUTHORITY_OR_EXPERT_REQUIRED"];
  if (input.no_action_needed) return ["NO_ACTION_NEEDED", "CURRENT_UNDERSTANDING_SUFFICIENT"];
  if (input.missing_path_fact) return ["NEEDS_INPUT", "PATH_CHANGING_FACT_MISSING"];
  if (input.external_condition_pending) return ["WAIT", "EXTERNAL_CONDITION_PENDING"];
  if (input.requires_verification) return ["VERIFY", "FACT_OR_RESULT_REQUIRES_CHECK"];
  if (input.evidence_insufficient) return ["UNKNOWN", "EVIDENCE_INSUFFICIENT"];

  if (input.action.available && input.action.observable && input.action.reversible) {
    return ["DO", "SAFE_OBSERVABLE_REVERSIBLE_ACTION"];
  }
  if (input.action.available && (!input.action.observable || !input.action.reversible)) {
    return ["VERIFY", "ACTION_NOT_YET_OBSERVABLE_OR_REVERSIBLE"];
  }
  return ["UNKNOWN", "NO_SAFE_ACTION_SIGNAL"];
}

function resultFor(input) {
  const [status, reasonCode] = decide(input);
  return {
    status,
    reason_code: reasonCode,
    validation_signal: {
      status: "UNKNOWN",
      detail: "This skeleton selected a direction; execution evidence has not been observed."
    },
    persistence_candidate: {
      status: input.new_pattern_observed ? "YES" : "NO",
      detail: input.new_pattern_observed
        ? "A new pattern was observed; mark it for later human review only."
        : "No new reusable pattern was supplied."
    }
  };
}

function main() {
  const parsed = readInput(process.argv.slice(2));
  if (parsed.help) {
    writeJson(process.stdout, usage());
    return;
  }
  writeJson(process.stdout, resultFor(validateInput(parsed.value)));
}

try {
  main();
} catch (error) {
  if (error instanceof InputError) {
    writeJson(process.stderr, {
      status: "INPUT_ERROR",
      reason_code: error.reasonCode,
      message: error.message
    });
    process.exitCode = INPUT_ERROR_EXIT_CODE;
  } else {
    writeJson(process.stderr, {
      status: "INTERNAL_ERROR",
      reason_code: "UNEXPECTED_FAILURE",
      message: "The decision skeleton could not complete."
    });
    process.exitCode = 1;
  }
}
