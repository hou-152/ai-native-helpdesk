#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const DEFAULT_COMMON_PACK = path.join(REPO_ROOT, "knowledge", "public");
const SCHEMA_PATH = path.join(REPO_ROOT, "schemas", "public-card.schema.json");

const MAX_QUERY_CHARS = 500;
const MAX_INDEX_BYTES = 512 * 1024;
const MAX_CARD_BYTES = 128 * 1024;
const MAX_INDEX_ENTRIES = 1000;
const EXPECTED_SCHEMA_SHA256 = "4d8bbfb1526645410afad4468e9925e4d78491d40d2a7a2daa30f0ddf8ee8d2a";
const CARD_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,63}$/;
const REVISION_PATTERN = /^\d+\.\d+\.\d+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CARD_KEYS = Object.freeze([
  "schema_version",
  "card_id",
  "domain",
  "revision",
  "question",
  "aliases",
  "scope_hint",
  "applies_to",
  "not_for",
  "answer",
  "judgment_framework",
  "common_mistakes",
  "action_principles",
  "next_action",
  "verification_method",
  "verification_steps",
  "public_sources",
  "supported_versions",
  "last_verified",
  "editorial",
  "verification",
  "privacy_gate",
  "publication"
]);
const SOURCE_KEYS = Object.freeze(["title", "url", "checked_at"]);
const INDEX_KEYS = Object.freeze(["schema_version", "cards"]);
const INDEX_ENTRY_KEYS = Object.freeze([
  "card_id",
  "file",
  "revision",
  "content_sha256",
  "question",
  "aliases",
  "scope_hint"
]);
const REQUIRED_STATUS = Object.freeze({
  editorial: "APPROVED",
  verification: "PASS",
  privacy_gate: "PASS",
  publication: "READY"
});
const SENSITIVE_QUERY_KEY_PATTERN = /^(?:api[_-]?key|access[_-]?token|token|key|secret|password|credential|signature|sig|auth|authorization|x-amz-signature)$/i;
const INVISIBLE_FORMAT_PATTERN = /\p{Cf}/u;
const DISALLOWED_TEXT_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const CONTROL_OR_FORMAT_PATTERN = /[\p{Cc}\p{Cf}]/u;

const PRIVATE_FIELD_PATTERN = /(?:^|_)(?:source_message_id|original_quote|raw_quote|quote|context|evidence|sender|sender_id|member|member_id|message_id|thread_id|root_id|parent_id|session_id|chat_id|group_id|receipt|private_source_candidate|internal_reason|local_path|credential|api_key|access_token|secret|password)(?:$|_)/i;
const SENSITIVE_TEXT_PATTERNS = Object.freeze([
  /(?:\/Users\/|\/home\/|\/tmp\/|\/private\/var\/|~\/|[A-Za-z]:[\\/]Users[\\/])/im,
  /(?:\/var\/folders\/|\/root\/|\.work[\\/]|\.ssh[\\/])/m,
  /\b(?:ou|om|oc|on|ot|oi|omt|msg|thread|root|parent|member|sender|session|chat|user)_[A-Za-z0-9]{8,}\b/i,
  /\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{16,}\b/i,
  /\b(?:xox[baprs]-)[A-Za-z0-9-]{10,}\b/i,
  /\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|npm_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,})\b/,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~-]{8,}\b/i,
  /\b(?:api[_-]?key|access[_-]?token|token|secret|password|credential|signature|authorization)\s*[:=]\s*\S+/i,
  /\b(?:source_message_id|original_quote|raw_quote|sender_id|member_id|message_id|thread_id|root_id|parent_id|session_id|chat_id|group_id)\b["'`]?\s*[:=]/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /https?:\/\/[^\s/]*feishu\.cn\/docx\//i,
  /(?:^|\n)\s*>\s+/,
  /(?:群聊原话|群成员说|某群成员)/
]);

class GateError extends Error {
  constructor(reasonCode, exitCode) {
    super(reasonCode);
    this.reasonCode = reasonCode;
    this.exitCode = exitCode;
  }
}

function deny(reasonCode, exitCode = 65) {
  throw new GateError(reasonCode, exitCode);
}

function parseStrictJson(text, malformedCode) {
  if (typeof text !== "string" || text.length === 0 || text.charCodeAt(0) === 0xfeff || text.includes("\0")) {
    deny(malformedCode, 65);
  }

  let cursor = 0;

  function skipWhitespace() {
    while (cursor < text.length && /[\t\n\r ]/.test(text[cursor])) cursor += 1;
  }

  function parseString() {
    if (text[cursor] !== '"') deny(malformedCode, 65);
    const start = cursor;
    cursor += 1;
    while (cursor < text.length) {
      const character = text[cursor];
      if (character === '"') {
        cursor += 1;
        try {
          return JSON.parse(text.slice(start, cursor));
        } catch {
          deny(malformedCode, 65);
        }
      }
      if (character === "\\") {
        cursor += 1;
        if (cursor >= text.length) deny(malformedCode, 65);
        const escape = text[cursor];
        if (escape === "u") {
          const digits = text.slice(cursor + 1, cursor + 5);
          if (!/^[0-9A-Fa-f]{4}$/.test(digits)) deny(malformedCode, 65);
          cursor += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(escape)) deny(malformedCode, 65);
        cursor += 1;
        continue;
      }
      if (text.charCodeAt(cursor) < 0x20) deny(malformedCode, 65);
      cursor += 1;
    }
    deny(malformedCode, 65);
  }

  function parseNumber() {
    const match = text.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) deny(malformedCode, 65);
    cursor += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) deny(malformedCode, 65);
    return value;
  }

  function parseArray() {
    const value = [];
    cursor += 1;
    skipWhitespace();
    if (text[cursor] === "]") {
      cursor += 1;
      return value;
    }
    while (cursor < text.length) {
      value.push(parseValue());
      skipWhitespace();
      if (text[cursor] === "]") {
        cursor += 1;
        return value;
      }
      if (text[cursor] !== ",") deny(malformedCode, 65);
      cursor += 1;
      skipWhitespace();
    }
    deny(malformedCode, 65);
  }

  function parseObject() {
    const value = Object.create(null);
    const keys = new Set();
    cursor += 1;
    skipWhitespace();
    if (text[cursor] === "}") {
      cursor += 1;
      return value;
    }
    while (cursor < text.length) {
      const key = parseString();
      if (keys.has(key)) deny("JSON_DUPLICATE_KEY", 65);
      keys.add(key);
      skipWhitespace();
      if (text[cursor] !== ":") deny(malformedCode, 65);
      cursor += 1;
      skipWhitespace();
      value[key] = parseValue();
      skipWhitespace();
      if (text[cursor] === "}") {
        cursor += 1;
        return value;
      }
      if (text[cursor] !== ",") deny(malformedCode, 65);
      cursor += 1;
      skipWhitespace();
    }
    deny(malformedCode, 65);
  }

  function parseValue() {
    skipWhitespace();
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
    deny(malformedCode, 65);
  }

  const result = parseValue();
  skipWhitespace();
  if (cursor !== text.length) deny(malformedCode, 65);
  return result;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, requiredKeys, reasonCode) {
  if (!isRecord(value)) deny(reasonCode, 65);
  const actual = Object.keys(value).sort();
  const expected = [...requiredKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    deny(reasonCode, 65);
  }
}

function requireString(value, maxLength, reasonCode) {
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    value.trim().length === 0 ||
    INVISIBLE_FORMAT_PATTERN.test(value) ||
    DISALLOWED_TEXT_CONTROL_PATTERN.test(value)
  ) {
    deny(reasonCode, 65);
  }
}

function requireStringArray(value, { min = 0, max, itemMax, reasonCode }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) deny(reasonCode, 65);
  const seen = new Set();
  for (const item of value) {
    requireString(item, itemMax, reasonCode);
    const normalized = normalizeTerm(item);
    if (seen.has(normalized)) deny(reasonCode, 65);
    seen.add(normalized);
  }
}

function requireDate(value, reasonCode) {
  requireString(value, 10, reasonCode);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) deny(reasonCode, 65);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) deny(reasonCode, 65);
}

function normalizeTerm(value) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function scanSensitive(value, reasonCode) {
  if (Array.isArray(value)) {
    for (const item of value) scanSensitive(item, reasonCode);
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_FIELD_PATTERN.test(key)) deny(reasonCode, 68);
      scanSensitive(item, reasonCode);
    }
    return;
  }
  if (typeof value !== "string") return;
  const normalized = value.normalize("NFKC");
  const candidates = new Set([value, normalized, normalized.replace(/[\p{Cc}\p{Cf}]/gu, "")]);
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    const decoded = decodePercentLayers(value, reasonCode, 68);
    const decodedNormalized = decoded.normalize("NFKC");
    candidates.add(decoded);
    candidates.add(decodedNormalized);
    candidates.add(decodedNormalized.replace(/[\p{Cc}\p{Cf}]/gu, ""));
  }
  for (const candidate of candidates) {
    if (SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(candidate))) deny(reasonCode, 68);
  }
}

function isPrivateSourceHost(rawHostname) {
  const hostname = rawHostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa")
  ) {
    return true;
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    const octets = hostname.split(".").map(Number);
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  if (ipVersion === 6) {
    return (
      hostname === "::" ||
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      /^fe[89ab]/.test(hostname) ||
      hostname.startsWith("::ffff:")
    );
  }
  return false;
}

function decodePercentLayers(value, reasonCode, exitCode = 65) {
  let decoded = value;
  for (let depth = 0; depth < 16; depth += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      deny(reasonCode, exitCode);
    }
    if (next === decoded) {
      if (CONTROL_OR_FORMAT_PATTERN.test(decoded)) deny("CARD_PRIVACY_DENY", 68);
      return decoded;
    }
    decoded = next;
  }
  deny(reasonCode, exitCode);
}

function validateSchemaContract(schema) {
  if (!isRecord(schema) || schema.additionalProperties !== false) deny("SCHEMA_CONTRACT_INVALID", 65);
  const required = Array.isArray(schema.required) ? [...schema.required].sort() : [];
  const keys = isRecord(schema.properties) ? Object.keys(schema.properties).sort() : [];
  const expected = [...CARD_KEYS].sort();
  if (required.length !== expected.length || keys.length !== expected.length) deny("SCHEMA_CONTRACT_INVALID", 65);
  if (required.some((key, index) => key !== expected[index]) || keys.some((key, index) => key !== expected[index])) {
    deny("SCHEMA_CONTRACT_INVALID", 65);
  }
  for (const [key, expectedValue] of Object.entries(REQUIRED_STATUS)) {
    if (schema.properties[key]?.const !== expectedValue) deny("SCHEMA_CONTRACT_INVALID", 65);
  }
  if (schema.properties.schema_version?.const !== "0.4") deny("SCHEMA_CONTRACT_INVALID", 65);
  if (schema.properties.domain?.const !== "AI_AGENT_OPENCLAW") deny("SCHEMA_CONTRACT_INVALID", 65);
}

function validateCard(card, expectedId, expectedQuestion, expectedAliases, expectedRevision, expectedScopeHint) {
  requireExactKeys(card, CARD_KEYS, "CARD_SCHEMA_INVALID");
  if (card.schema_version !== "0.4") deny("CARD_SCHEMA_INVALID", 65);
  if (typeof card.card_id !== "string" || !CARD_ID_PATTERN.test(card.card_id) || card.card_id !== expectedId) {
    deny("CARD_ID_MISMATCH", 65);
  }
  if (card.domain !== "AI_AGENT_OPENCLAW") deny("CARD_DOMAIN_DENY", 68);
  if (typeof card.revision !== "string" || !REVISION_PATTERN.test(card.revision)) deny("CARD_SCHEMA_INVALID", 65);
  requireString(card.question, 500, "CARD_SCHEMA_INVALID");
  requireStringArray(card.aliases, { max: 20, itemMax: 500, reasonCode: "CARD_SCHEMA_INVALID" });
  requireString(card.scope_hint, 300, "CARD_SCHEMA_INVALID");
  requireStringArray(card.applies_to, { min: 1, max: 20, itemMax: 300, reasonCode: "CARD_SCHEMA_INVALID" });
  requireStringArray(card.not_for, { max: 20, itemMax: 300, reasonCode: "CARD_SCHEMA_INVALID" });
  requireString(card.answer, 12000, "CARD_SCHEMA_INVALID");
  requireStringArray(card.judgment_framework, { min: 1, max: 12, itemMax: 1000, reasonCode: "CARD_SCHEMA_INVALID" });
  requireStringArray(card.common_mistakes, { min: 1, max: 12, itemMax: 1000, reasonCode: "CARD_SCHEMA_INVALID" });
  requireStringArray(card.action_principles, { min: 1, max: 12, itemMax: 1000, reasonCode: "CARD_SCHEMA_INVALID" });
  requireString(card.next_action, 1000, "CARD_SCHEMA_INVALID");
  requireString(card.verification_method, 2000, "CARD_SCHEMA_INVALID");
  requireStringArray(card.verification_steps, { min: 1, max: 20, itemMax: 1000, reasonCode: "CARD_SCHEMA_INVALID" });
  requireStringArray(card.supported_versions, { max: 20, itemMax: 100, reasonCode: "CARD_SCHEMA_INVALID" });
  requireDate(card.last_verified, "CARD_SCHEMA_INVALID");
  if (!Array.isArray(card.public_sources) || card.public_sources.length < 1 || card.public_sources.length > 20) {
    deny("CARD_SCHEMA_INVALID", 65);
  }
  for (const source of card.public_sources) {
    requireExactKeys(source, SOURCE_KEYS, "CARD_SCHEMA_INVALID");
    requireString(source.title, 300, "CARD_SCHEMA_INVALID");
    requireString(source.url, 2000, "CARD_SCHEMA_INVALID");
    requireDate(source.checked_at, "CARD_SCHEMA_INVALID");
    if (!source.url.startsWith("https://")) deny("CARD_SCHEMA_INVALID", 65);
    let parsedUrl;
    try {
      parsedUrl = new URL(source.url);
    } catch {
      deny("CARD_SCHEMA_INVALID", 65);
    }
    if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) deny("CARD_SCHEMA_INVALID", 65);
    if (isPrivateSourceHost(parsedUrl.hostname)) deny("CARD_PRIVACY_DENY", 68);
    const decodedPathname = decodePercentLayers(parsedUrl.pathname, "CARD_SCHEMA_INVALID");
    const sourceHostname = parsedUrl.hostname.toLowerCase().replace(/\.$/, "");
    if (
      (sourceHostname === "feishu.cn" || sourceHostname.endsWith(".feishu.cn")) &&
      /^\/docx(?:\/|$)/i.test(decodedPathname)
    ) {
      deny("CARD_PRIVACY_DENY", 68);
    }
    const decodedComponents = [
      decodedPathname,
      decodePercentLayers(parsedUrl.hash, "CARD_SCHEMA_INVALID")
    ];
    for (const [key, value] of parsedUrl.searchParams.entries()) {
      const decodedKey = decodePercentLayers(key, "CARD_SCHEMA_INVALID");
      if (
        SENSITIVE_QUERY_KEY_PATTERN.test(key.normalize("NFKC")) ||
        SENSITIVE_QUERY_KEY_PATTERN.test(decodedKey.normalize("NFKC"))
      ) {
        deny("CARD_PRIVACY_DENY", 68);
      }
      decodedComponents.push(decodedKey);
      decodedComponents.push(decodePercentLayers(value, "CARD_SCHEMA_INVALID"));
    }
    scanSensitive(decodedComponents, "CARD_PRIVACY_DENY");
  }
  for (const [key, expectedValue] of Object.entries(REQUIRED_STATUS)) {
    if (card[key] !== expectedValue) deny("CARD_GATE_DENY", 68);
  }
  if (normalizeTerm(card.question) !== normalizeTerm(expectedQuestion)) deny("CARD_INDEX_MISMATCH", 65);
  if (card.revision !== expectedRevision || normalizeTerm(card.scope_hint) !== normalizeTerm(expectedScopeHint)) {
    deny("CARD_INDEX_MISMATCH", 65);
  }
  const actualAliases = card.aliases.map(normalizeTerm).sort();
  const indexAliases = expectedAliases.map(normalizeTerm).sort();
  if (actualAliases.length !== indexAliases.length || actualAliases.some((alias, index) => alias !== indexAliases[index])) {
    deny("CARD_INDEX_MISMATCH", 65);
  }
  scanSensitive(card, "CARD_PRIVACY_DENY");
}

function validateIndex(index) {
  requireExactKeys(index, INDEX_KEYS, "INDEX_SCHEMA_INVALID");
  if (index.schema_version !== "0.4" || !Array.isArray(index.cards) || index.cards.length > MAX_INDEX_ENTRIES) {
    deny("INDEX_SCHEMA_INVALID", 65);
  }
  const ids = new Set();
  const files = new Set();
  const terms = new Map();
  for (const entry of index.cards) {
    requireExactKeys(entry, INDEX_ENTRY_KEYS, "INDEX_SCHEMA_INVALID");
    if (typeof entry.card_id !== "string" || !CARD_ID_PATTERN.test(entry.card_id)) deny("INDEX_SCHEMA_INVALID", 65);
    if (entry.file !== `cards/${entry.card_id}.json`) deny("CARD_PATH_INVALID", 66);
    if (typeof entry.revision !== "string" || !REVISION_PATTERN.test(entry.revision)) deny("INDEX_SCHEMA_INVALID", 65);
    if (typeof entry.content_sha256 !== "string" || !SHA256_PATTERN.test(entry.content_sha256)) {
      deny("INDEX_SCHEMA_INVALID", 65);
    }
    requireString(entry.question, 500, "INDEX_SCHEMA_INVALID");
    requireStringArray(entry.aliases, { max: 20, itemMax: 500, reasonCode: "INDEX_SCHEMA_INVALID" });
    requireString(entry.scope_hint, 300, "INDEX_SCHEMA_INVALID");
    scanSensitive(entry, "INDEX_PRIVACY_DENY");
    if (ids.has(entry.card_id) || files.has(entry.file)) deny("INDEX_DUPLICATE_CARD", 67);
    ids.add(entry.card_id);
    files.add(entry.file);
    const entryTerms = new Set([entry.question, ...entry.aliases].map(normalizeTerm));
    for (const term of entryTerms) {
      if (terms.has(term) && terms.get(term) !== entry.card_id) deny("INDEX_QUERY_CONFLICT", 67);
      terms.set(term, entry.card_id);
    }
  }
  return terms;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function readUtf8NoFollow(filePath, maxBytes, malformedCode, pathCode, expectedStat = null) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) deny(pathCode, 66);
    if (expectedStat && !sameFileIdentity(stat, expectedStat)) deny(pathCode, 66);
    const buffer = await handle.readFile();
    if (buffer.length !== stat.size) deny(pathCode, 66);
    const currentStat = await fs.promises.lstat(filePath);
    if (currentStat.isSymbolicLink() || !sameFileIdentity(stat, currentStat)) deny(pathCode, 66);
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      deny(malformedCode, 65);
    }
    return text;
  } catch (error) {
    if (error instanceof GateError) throw error;
    deny(pathCode, 66);
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

async function openPack(packPath) {
  const absoluteRoot = path.resolve(packPath);
  let rootStat;
  try {
    rootStat = await fs.promises.lstat(absoluteRoot);
  } catch {
    deny("PACK_UNAVAILABLE", 66);
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) deny("PACK_PATH_UNSAFE", 66);
  const realRoot = await fs.promises.realpath(absoluteRoot).catch(() => deny("PACK_PATH_UNSAFE", 66));
  const indexPath = path.join(realRoot, "index.json");
  let indexStat;
  try {
    indexStat = await fs.promises.lstat(indexPath);
  } catch {
    deny("INDEX_UNAVAILABLE", 66);
  }
  if (!indexStat.isFile() || indexStat.isSymbolicLink()) deny("INDEX_PATH_UNSAFE", 66);
  const indexText = await readUtf8NoFollow(
    indexPath,
    MAX_INDEX_BYTES,
    "INDEX_JSON_INVALID",
    "INDEX_UNAVAILABLE",
    indexStat
  );
  const index = parseStrictJson(indexText, "INDEX_JSON_INVALID");
  const terms = validateIndex(index);
  return { realRoot, index, terms };
}

async function readMatchedCard(pack, entry) {
  const cardsDirectory = path.join(pack.realRoot, "cards");
  let directoryStat;
  try {
    directoryStat = await fs.promises.lstat(cardsDirectory);
  } catch {
    deny("CARD_PATH_UNSAFE", 66);
  }
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) deny("CARD_PATH_UNSAFE", 66);
  const cardPath = path.resolve(pack.realRoot, entry.file);
  if (!isContained(pack.realRoot, cardPath)) deny("CARD_PATH_ESCAPE", 66);
  let cardStat;
  try {
    cardStat = await fs.promises.lstat(cardPath);
  } catch {
    deny("CARD_UNAVAILABLE", 66);
  }
  if (!cardStat.isFile() || cardStat.isSymbolicLink()) deny("CARD_PATH_UNSAFE", 66);
  const realCardPath = await fs.promises.realpath(cardPath).catch(() => deny("CARD_PATH_UNSAFE", 66));
  if (!isContained(pack.realRoot, realCardPath)) deny("CARD_PATH_ESCAPE", 66);
  if (path.basename(realCardPath) !== `${entry.card_id}.json`) deny("CARD_ID_MISMATCH", 65);
  const cardText = await readUtf8NoFollow(
    realCardPath,
    MAX_CARD_BYTES,
    "CARD_JSON_INVALID",
    "CARD_UNAVAILABLE",
    cardStat
  );
  const card = parseStrictJson(cardText, "CARD_JSON_INVALID");
  validateCard(card, entry.card_id, entry.question, entry.aliases, entry.revision, entry.scope_hint);
  const contentDigest = crypto.createHash("sha256").update(cardText, "utf8").digest("hex");
  if (contentDigest !== entry.content_sha256) deny("CARD_INDEX_HASH_MISMATCH", 65);
  return Object.fromEntries(CARD_KEYS.map((key) => [key, card[key]]));
}

function parseArguments(argv) {
  const result = { query: null, commonPack: DEFAULT_COMMON_PACK, communityPacks: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--query" || argument === "--common-pack" || argument === "--community-pack") {
      const value = argv[index + 1];
      if (typeof value !== "string" || value.length === 0) deny("ARGUMENT_INVALID", 64);
      index += 1;
      if (argument === "--query") {
        if (result.query !== null) deny("ARGUMENT_INVALID", 64);
        result.query = value;
      } else if (argument === "--common-pack") {
        result.commonPack = value;
      } else {
        result.communityPacks.push(value);
      }
      continue;
    }
    deny("ARGUMENT_INVALID", 64);
  }
  if (result.query === null || result.query.length > MAX_QUERY_CHARS || normalizeTerm(result.query).length === 0) {
    deny("ARGUMENT_INVALID", 64);
  }
  scanSensitive(result.query, "QUERY_PRIVACY_DENY");
  return result;
}

async function loadSchema() {
  const text = await readUtf8NoFollow(SCHEMA_PATH, MAX_CARD_BYTES, "SCHEMA_JSON_INVALID", "SCHEMA_UNAVAILABLE");
  const digest = crypto.createHash("sha256").update(text, "utf8").digest("hex");
  if (digest !== EXPECTED_SCHEMA_SHA256) deny("SCHEMA_CONTRACT_INVALID", 65);
  const schema = parseStrictJson(text, "SCHEMA_JSON_INVALID");
  validateSchemaContract(schema);
}

async function queryPublicCard(options) {
  await loadSchema();
  const packPaths = [options.commonPack, ...options.communityPacks];
  const packs = [];
  for (const packPath of packPaths) packs.push(await openPack(packPath));
  const query = normalizeTerm(options.query);
  const matches = [];
  for (const pack of packs) {
    const matchedId = pack.terms.get(query);
    if (!matchedId) continue;
    const entry = pack.index.cards.find((candidate) => candidate.card_id === matchedId);
    matches.push({ pack, entry });
  }
  if (matches.length === 0) return { status: "MISS", reason_code: "NO_MATCH" };
  if (matches.length > 1) deny("QUERY_CONFLICT", 67);
  const card = await readMatchedCard(matches[0].pack, matches[0].entry);
  return { status: "ALLOW", reason_code: "OK", card };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = await queryPublicCard(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const reasonCode = error instanceof GateError ? error.reasonCode : "INTERNAL_ERROR";
    const exitCode = error instanceof GateError ? error.exitCode : 70;
    process.stdout.write(`${JSON.stringify({ status: "DENY", reason_code: reasonCode })}\n`);
    process.exitCode = exitCode;
  }
}

export {
  CARD_KEYS,
  GateError,
  normalizeTerm,
  parseStrictJson,
  queryPublicCard,
  validateCard,
  validateIndex
};

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(SCRIPT_PATH);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  await main();
}
