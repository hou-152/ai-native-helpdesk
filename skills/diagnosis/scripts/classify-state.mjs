#!/usr/bin/env node
/**
 * Minimal, dependency-free state machine for aihd-diagnosis.
 *
 * Usage:
 *   node classify-state.mjs --input '{"psychological_or_motivation_signal":true}'
 *
 * Success writes one JSON object to stdout. Input failures write one JSON
 * object to stderr and exit 64, keeping normal UNKNOWN separate from invalid
 * or absent input.
 */

const INPUT_ERROR_EXIT_CODE = 64;

const BOOLEAN_FIELDS = new Set([
  "safety_red_line",
  "direct_action_request",
  "psychological_or_motivation_signal",
  "emotional_only",
  "execution_block",
  "new_pattern_observed"
]);

const STATE_TABLE = Object.freeze([
  {
    matches: (input) => input.safety_red_line,
    result: ["SAFETY_GATE", "SAFETY_RED_LINE", "SAFETY"]
  },
  {
    matches: (input) => input.direct_action_request,
    result: ["ACTION_REQUEST", "USER_REQUESTED_ACTION_WITHOUT_ANALYSIS", "ACTION"]
  },
  {
    matches: (input) => input.psychological_or_motivation_signal && input.execution_block,
    result: ["MIXED_SIGNAL", "MOTIVATION_AND_EXECUTION_SIGNALS", "ACTION"]
  },
  {
    matches: (input) => input.psychological_or_motivation_signal,
    result: ["MOTIVATION_SIGNAL", "OBSERVED_MOTIVATION_OR_AVOIDANCE_SIGNAL", "ACTION"]
  },
  {
    matches: (input) => input.emotional_only,
    result: ["EMOTIONAL_BOUNDARY", "EMOTION_WITHOUT_CONCRETE_TASK", "BOUNDARY"]
  },
  {
    matches: (input) => input.execution_block,
    result: ["EXECUTION_BLOCK", "RESOURCE_METHOD_OR_PERMISSION_CONSTRAINT", "ACTION"]
  },
  {
    matches: () => true,
    result: ["UNKNOWN", "NO_CLASSIFICATION_SIGNAL", "MAIN_FLOW"]
  }
]);

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
      detail: "No diagnosis input was processed."
    },
    persistence_candidate: {
      status: "NO",
      detail: "No diagnosis input was processed."
    },
    usage: "node classify-state.mjs --input '<JSON>'",
    input: Object.fromEntries(
      [...BOOLEAN_FIELDS].map((field) => [field, "boolean (optional)"])
    )
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

function validateInput(value) {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new InputError("INPUT_NOT_OBJECT", "--input must be a JSON object.");
  }

  const input = {};
  for (const field of Object.keys(value)) {
    if (!BOOLEAN_FIELDS.has(field)) {
      throw new InputError("UNKNOWN_FIELD", `Unsupported input field: ${field}.`);
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (!(field in value)) {
      input[field] = false;
      continue;
    }
    if (typeof value[field] !== "boolean") {
      throw new InputError("INVALID_FIELD_TYPE", `${field} must be a boolean.`);
    }
    input[field] = value[field];
  }
  return input;
}

function classify(input) {
  // Ordered table keeps the safety -> request -> signal priority auditable.
  // It labels observable signals only; it never infers a psychological cause.
  return STATE_TABLE.find(({ matches }) => matches(input)).result;
}

function resultFor(input) {
  const [status, reasonCode, nextState] = classify(input);
  return {
    status,
    reason_code: reasonCode,
    next_state: nextState,
    validation_signal: {
      status: "UNKNOWN",
      detail: "This state labels supplied signals only; no clinical conclusion is confirmed."
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
      message: "The diagnosis state machine could not complete."
    });
    process.exitCode = 1;
  }
}
