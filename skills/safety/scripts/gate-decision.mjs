#!/usr/bin/env node

const REDLINES = new Set([
  "self_harm_imminent",
  "harm_to_others_imminent",
  "illegal_implementation_intent",
  "irreversible_action_imminent",
  "none",
  "unknown"
]);

function writeJson(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`);
}

function usage() {
  return {
    status: "USAGE",
    command: "node skills/safety/scripts/gate-decision.mjs --input '<JSON>'",
    input: {
      redline: [...REDLINES],
      service_region_known: "optional boolean",
      official_resource_verified: "optional boolean",
      discussion_or_help_seeking: "optional boolean",
      new_learning_candidate: "optional boolean"
    }
  };
}

function fail(reason_code, message) {
  writeJson(process.stderr, { status: "ERROR", reason_code, message });
  process.exitCode = 64;
}

function parseInput(argv) {
  if (argv.length === 1 && argv[0] === "--help") {
    writeJson(process.stdout, usage());
    return null;
  }
  if (argv.length === 0) {
    fail("INPUT_REQUIRED", "Pass one JSON object with --input.");
    return null;
  }
  if (argv.length !== 2 || argv[0] !== "--input") {
    fail("ARGUMENT_INVALID", "Use --input '<JSON>' or --help.");
    return null;
  }

  try {
    const input = JSON.parse(argv[1]);
    if (!input || Array.isArray(input) || typeof input !== "object") {
      fail("INPUT_NOT_OBJECT", "--input must decode to one JSON object.");
      return null;
    }
    return input;
  } catch {
    fail("INPUT_JSON_INVALID", "--input must contain valid JSON.");
    return null;
  }
}

function persistenceCandidate(input) {
  if (input.new_learning_candidate === true) {
    return {
      status: "CANDIDATE",
      write_executed: false,
      reason: "The caller marked a possible new pattern; this script does not write a lesson store or candidate pool."
    };
  }
  if (input.new_learning_candidate === false) {
    return {
      status: "NOT_CANDIDATE",
      write_executed: false,
      reason: "The caller did not identify a new pattern to retain."
    };
  }
  return {
    status: "UNKNOWN",
    write_executed: false,
    reason: "No learning-candidate assessment was supplied."
  };
}

function result(input, {
  status,
  reason_code,
  decision,
  next_action,
  resource_status = "NOT_APPLICABLE",
  confirmed = [],
  excluded = [],
  unknown = []
}) {
  return {
    status,
    reason_code,
    route: "safety",
    decision,
    next_action,
    resource_status,
    contact_details: "NOT_EMITTED_BY_SCRIPT",
    validation_signal: { confirmed, excluded, unknown },
    persistence_candidate: persistenceCandidate(input)
  };
}

function needsInput(input, reason_code, unknown) {
  return result(input, {
    status: "NEEDS_INPUT",
    reason_code,
    decision: "REQUEST_SAFETY_GATE_CLASSIFICATION",
    next_action: "COLLECT_STRUCTURED_GATE_INPUT",
    unknown
  });
}

function invalidOptionalBooleans(input) {
  return [
    "service_region_known",
    "official_resource_verified",
    "discussion_or_help_seeking",
    "new_learning_candidate"
  ].filter((field) => field in input && typeof input[field] !== "boolean");
}

function decide(input) {
  const invalidFields = invalidOptionalBooleans(input);
  if (invalidFields.length > 0) {
    return needsInput(input, "BOOLEAN_FIELD_INVALID", invalidFields);
  }
  if (!("redline" in input)) {
    return needsInput(input, "REDLINE_REQUIRED", ["redline"]);
  }
  if (typeof input.redline !== "string" || !REDLINES.has(input.redline)) {
    return needsInput(input, "REDLINE_UNRECOGNIZED", ["redline"]);
  }

  const { redline } = input;
  if (redline === "unknown") {
    return needsInput(input, "SAFETY_CLASSIFICATION_UNKNOWN", ["redline"]);
  }
  if (redline === "none") {
    return result(input, {
      status: "OUT_OF_SCOPE",
      reason_code: "NO_SAFETY_REDLINE",
      decision: "RETURN_TO_ENTRY_ROUTER",
      next_action: "ROUTE_WITH_ENTRY_SKILL",
      confirmed: ["no_safety_redline"],
      excluded: ["safety_response"]
    });
  }
  if (redline === "self_harm_imminent" || redline === "harm_to_others_imminent") {
    const localResourceVerified = input.service_region_known === true && input.official_resource_verified === true;
    return result(input, {
      status: "SAFETY_TRIGGERED",
      reason_code: redline.toUpperCase(),
      decision: "SUPPORT_REFER_CONNECT",
      next_action: localResourceVerified
        ? "CONNECT_TO_VERIFIED_LOCAL_HUMAN_RESOURCE"
        : "ASK_FOR_LOCAL_PROFESSIONAL_RESOURCE",
      resource_status: localResourceVerified
        ? "VERIFIED_LOCAL_RESOURCE_AVAILABLE"
        : "REGION_OR_RESOURCE_UNVERIFIED",
      confirmed: [redline],
      excluded: ["diagnosis", "motive_attribution", "contact_details_from_unverified_source"],
      unknown: localResourceVerified
        ? []
        : [
            ...(input.service_region_known === true ? [] : ["service_region"]),
            ...(input.official_resource_verified === true ? [] : ["official_local_resource"])
          ]
    });
  }
  if (redline === "illegal_implementation_intent") {
    if (input.discussion_or_help_seeking === true) {
      return result(input, {
        status: "ROUTE_REQUIRED",
        reason_code: "DISCUSSION_OR_HELP_SEEKING",
        decision: "ROUTE_TO_GOOD_QUESTION_OR_THINKING",
        next_action: "HAND_OFF_WITHOUT_IMPLEMENTATION_GUIDANCE",
        confirmed: ["discussion_or_help_seeking"],
        excluded: ["illegal_implementation_guidance"]
      });
    }
    return result(input, {
      status: "SAFETY_TRIGGERED",
      reason_code: "ILLEGAL_IMPLEMENTATION_INTENT",
      decision: "REFUSE_ILLEGAL_IMPLEMENTATION",
      next_action: "STATE_NON_ASSISTANCE_BOUNDARY",
      confirmed: ["illegal_implementation_intent"],
      excluded: ["implementation_guidance", "motive_attribution"]
    });
  }
  return result(input, {
    status: "SAFETY_TRIGGERED",
    reason_code: "IRREVERSIBLE_ACTION_IMMINENT",
    decision: "PAUSE_AND_CONFIRM",
    next_action: "WAIT_FOR_EXPLICIT_CONFIRMATION",
    confirmed: ["irreversible_action_imminent"],
    excluded: ["execution_instruction"]
  });
}

try {
  const input = parseInput(process.argv.slice(2));
  if (input) writeJson(process.stdout, decide(input));
} catch {
  fail("UNEXPECTED_RUNTIME_ERROR", "The safety gate could not complete.");
}
