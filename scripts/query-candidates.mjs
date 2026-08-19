#!/usr/bin/env node
/**
 * query-candidates.mjs — BM25 检索候选池（ai-native-knowledge-base）
 *
 * knowledge 路由的新查询目标：从 candidates.jsonl 检索相关对话摘录。
 * 输出带边界标注（非已验证答案），MISS 时明确 UNKNOWN + 最小下一步。
 *
 * 用法：
 *   node scripts/query-candidates.mjs --query "<用户问题>" [--candidates <candidates.jsonl>] [--top-k 3]
 *
 * 默认候选池路径：../ai-native-knowledge-base/data/candidates.jsonl（相对本脚本）
 * 或环境变量 AIHD_CANDIDATES_PATH。
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const DEFAULT_CANDIDATES = process.env.AIHD_CANDIDATES_PATH
  || path.resolve(SCRIPT_DIR, "..", "..", "ai-native-knowledge-base", "data", "candidates.jsonl");

const MAX_QUERY_CHARS = 500;
const MAX_TOP_K = 10;

class GateError extends Error {
  constructor(reasonCode, exitCode) {
    super(reasonCode);
    this.reasonCode = reasonCode;
    this.exitCode = exitCode;
  }
}

function deny(reasonCode, exitCode = 64) {
  throw new GateError(reasonCode, exitCode);
}

function normalizeTerm(value) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function tokenize(text) {
  const value = normalizeTerm(text);
  const english = value.match(/[a-z][a-z0-9_\-]{1,}/g) || [];
  const chinese = value.match(/[\u4e00-\u9fff]/g) || [];
  return [...english, ...chinese];
}

function buildBm25(docs) {
  const N = docs.length;
  if (N === 0) return { search: () => [] };
  const avgdl = docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / N;
  const k1 = 1.5;
  const b = 0.75;

  const df = new Map();
  for (const doc of docs) {
    for (const term of new Set(doc.tokens)) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  function score(queryTokens, docTokens) {
    let score = 0;
    const tf = new Map();
    for (const term of docTokens) tf.set(term, (tf.get(term) || 0) + 1);
    for (const term of new Set(queryTokens)) {
      const docFreq = df.get(term);
      if (!docFreq) continue;
      const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
      const freq = tf.get(term) || 0;
      score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + (b * docTokens.length) / avgdl)));
    }
    return score;
  }

  function search(queryTokens, topK) {
    const scored = docs
      .map((doc) => ({ score: score(queryTokens, doc.tokens), doc }))
      .sort((left, right) => right.score - left.score || left.doc.id.localeCompare(right.doc.id));
    return scored.slice(0, topK);
  }

  return { search };
}

function loadCandidates(candidatesPath) {
  let stat;
  try {
    stat = fs.lstatSync(candidatesPath);
  } catch {
    deny("CANDIDATES_UNAVAILABLE", 66);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) deny("CANDIDATES_PATH_UNSAFE", 66);
  if (stat.size > 512 * 1024 * 1024) deny("CANDIDATES_PATH_UNSAFE", 66);

  const text = fs.readFileSync(candidatesPath, "utf8");
  const lines = text.split("\n").filter((line) => line.trim());
  const candidates = [];
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      deny("CANDIDATES_JSON_INVALID", 65);
    }
    if (!record || typeof record !== "object" || !record.id || typeof record["原文摘录"] !== "string") {
      deny("CANDIDATES_JSON_INVALID", 65);
    }
    candidates.push(record);
  }
  return candidates;
}

function parseArguments(argv) {
  const result = { query: null, candidates: DEFAULT_CANDIDATES, topK: 3 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--query" || argument === "--candidates" || argument === "--top-k") {
      const value = argv[index + 1];
      if (typeof value !== "string" || value.length === 0) deny("ARGUMENT_INVALID", 64);
      index += 1;
      if (argument === "--query") {
        if (result.query !== null) deny("ARGUMENT_INVALID", 64);
        result.query = value;
      } else if (argument === "--candidates") {
        result.candidates = value;
      } else {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TOP_K) deny("ARGUMENT_INVALID", 64);
        result.topK = parsed;
      }
      continue;
    }
    deny("ARGUMENT_INVALID", 64);
  }
  if (result.query === null || result.query.length > MAX_QUERY_CHARS || normalizeTerm(result.query).length === 0) {
    deny("ARGUMENT_INVALID", 64);
  }
  return result;
}

function queryCandidates(options) {
  const candidates = loadCandidates(options.candidates);
  if (candidates.length === 0) {
    return { status: "MISS", reason_code: "NO_CANDIDATES" };
  }

  const docs = candidates.map((candidate) => ({
    id: candidate.id,
    tokens: tokenize(`${candidate["问题"] || ""} ${candidate["原文摘录"] || ""}`),
    candidate,
  }));

  const { search } = buildBm25(docs);
  const queryTokens = tokenize(options.query);
  const querySet = new Set(queryTokens);
  const hits = search(queryTokens, options.topK);

  // 中文按单字切分时任意查询都有字符重合；要求共享词元达到 min(4, 查询词元数)
  const minShared = Math.min(4, querySet.size);
  const usable = hits.filter((hit) => {
    if (!(hit.score > 0)) return false;
    const docSet = new Set(hit.doc.tokens);
    let shared = 0;
    for (const term of docSet) {
      if (querySet.has(term)) shared += 1;
    }
    return shared >= minShared;
  });
  if (usable.length === 0) {
    return {
      status: "MISS",
      reason_code: "NO_RELEVANT_MATCH",
      note: "候选池没有命中相关对话摘录；不编造答案。",
    };
  }

  return {
    status: "HIT",
    reason_code: "OK",
    boundary: "CANDIDATE_ONLY / UNVERIFIED：以下为群聊对话摘录，不是已验证答案；内容可能过时、不完整或含上下文依赖。",
    results: usable.map((hit) => ({
      score: Number(hit.score.toFixed(4)),
      id: hit.doc.id,
      question: hit.doc.candidate["问题"] || "",
      excerpt: hit.doc.candidate["原文摘录"],
      source: {
        snapshot_sha256: hit.doc.candidate["引用"]?.snapshot_sha256 || null,
        question_message_id: hit.doc.candidate["引用"]?.question_message_id || null,
        answer_message_id: hit.doc.candidate["引用"]?.answer_message_id || null,
        question_sender: hit.doc.candidate["引用"]?.question_sender || null,
        create_time: hit.doc.candidate["引用"]?.create_time || null,
      },
      lifecycle: hit.doc.candidate.lifecycle || "CANDIDATE",
    })),
  };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = queryCandidates(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const reasonCode = error instanceof GateError ? error.reasonCode : "INTERNAL_ERROR";
    const exitCode = error instanceof GateError ? error.exitCode : 70;
    process.stdout.write(`${JSON.stringify({ status: "DENY", reason_code: reasonCode })}\n`);
    process.exitCode = exitCode;
  }
}

export { GateError, buildBm25, loadCandidates, normalizeTerm, queryCandidates, tokenize };

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(SCRIPT_PATH)) {
  await main();
}
