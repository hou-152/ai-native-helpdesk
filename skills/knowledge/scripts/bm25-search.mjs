#!/usr/bin/env node

/**
 * 显式输入、无依赖的 BM25 候选检索器。
 *
 * 用法：
 *   node skills/knowledge/scripts/bm25-search.mjs --input '{"query":"...","corpus":[...]}'
 *
 * 本脚本不会猜测来源路径、调用外部 Skill 或访问网络；只检索 --input 显式提供的 corpus。
 */

import process from "node:process";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const K1 = 1.2;
const B = 0.75;

class InputError extends Error {
  constructor(reasonCode, message) {
    super(message);
    this.name = "InputError";
    this.reasonCode = reasonCode;
  }
}

function writeJson(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`);
}

function failure(reasonCode, message, exitCode = 64) {
  writeJson(process.stderr, {
    status: "INVALID_INPUT",
    reason_code: reasonCode,
    message
  });
  process.exitCode = exitCode;
}

function usage() {
  return {
    status: "USAGE",
    usage: "node skills/knowledge/scripts/bm25-search.mjs --input '<JSON>'",
    input_schema: {
      query: "字符串；缺失时返回结构化 UNKNOWN",
      corpus: "含 id 和可检索文本的记录数组",
      limit: `可选整数，范围 1 至 ${MAX_LIMIT}`,
      new_pattern_observed: "可选布尔值；只标记落库候选，不写入"
    },
    validation_signal: {
      confirmed: ["已返回输入 schema，尚未读取 corpus。"],
      excluded: ["未执行检索。"],
      unknown: ["实际 query 与 corpus"]
    },
    persistence_candidate: { status: "NO", write_executed: false, reason: "USAGE_ONLY" }
  };
}

function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return { help: true };
  if (argv.length !== 2 || argv[0] !== "--input") {
    throw new InputError("INPUT_REQUIRED", "必须使用 --input 传入一个 JSON 对象。");
  }
  if (!argv[1]) throw new InputError("INPUT_REQUIRED", "--input 需要一个 JSON 对象。");

  let input;
  try {
    input = JSON.parse(argv[1]);
  } catch {
    throw new InputError("INPUT_INVALID_JSON", "--input 不是可解析的 JSON。");
  }
  if (!input || Array.isArray(input) || typeof input !== "object") {
    throw new InputError("INPUT_NOT_OBJECT", "--input 必须是 JSON 对象。");
  }
  return { input };
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickText(record, fields) {
  for (const field of fields) {
    const value = text(record[field]);
    if (value) return value;
  }
  return "";
}

function normalizeId(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function tokenize(value) {
  return (value.normalize("NFKC").toLocaleLowerCase("und").match(/[\p{Script=Han}]|[\p{L}\p{N}_]+/gu) ?? []);
}

function normalizeCorpus(corpus) {
  if (!Array.isArray(corpus)) {
    throw new InputError("CORPUS_NOT_ARRAY", "corpus 必须是 JSON 数组。");
  }

  return corpus.map((record, index) => {
    if (!record || Array.isArray(record) || typeof record !== "object") {
      throw new InputError("CORPUS_RECORD_INVALID", `corpus 第 ${index + 1} 条不是对象。`);
    }
    const id = normalizeId(record.id);
    const question = pickText(record, ["question", "title", "prompt"]);
    const excerpt = pickText(record, ["excerpt", "content", "text", "answer"]);
    const source = pickText(record, ["source", "citation", "provenance"]);
    const terms = tokenize(`${question}\n${excerpt}`);

    if (!id || terms.length === 0) {
      throw new InputError(
        "CORPUS_RECORD_INVALID",
        `corpus 第 ${index + 1} 条必须有 id 和可检索文本。`
      );
    }

    return { id, question, excerpt, source, terms, order: index };
  });
}

function normalizeLimit(value) {
  if (value === undefined) return DEFAULT_LIMIT;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_LIMIT) {
    throw new InputError("LIMIT_INVALID", `limit 必须是 1 到 ${MAX_LIMIT} 的整数。`);
  }
  return number;
}

function signal(confirmed, excluded, unknown) {
  return { confirmed, excluded, unknown };
}

function persistenceCandidate(input, unmarkedStatus = "UNKNOWN") {
  if (Object.hasOwn(input, "new_pattern_observed")) {
    return input.new_pattern_observed
      ? { status: "YES", write_executed: false, reason: "CALLER_MARKED_NEW_PATTERN" }
      : { status: "NO", write_executed: false, reason: "CALLER_MARKED_NO_NEW_PATTERN" };
  }
  return {
    status: unmarkedStatus,
    write_executed: false,
    reason: unmarkedStatus === "NO" ? "NO_PROCESSING_RESULT" : "NOT_ASSESSED"
  };
}

function informationalResult(input) {
  const hasQuery = Object.hasOwn(input, "query") && text(input.query).length > 0;
  const hasCorpus = Object.hasOwn(input, "corpus");

  if (!hasQuery && !hasCorpus) {
    return {
      status: "UNKNOWN",
      reason_code: "QUERY_AND_CORPUS_REQUIRED",
      query: null,
      result_count: 0,
      results: [],
      validation_signal: signal(
        ["未读取任何 corpus。"],
        ["未执行检索。"],
        ["query", "corpus"]
      ),
      persistence_candidate: persistenceCandidate(input, "NO")
    };
  }

  if (!hasQuery) {
    return {
      status: "UNKNOWN",
      reason_code: "QUERY_REQUIRED",
      query: null,
      result_count: 0,
      results: [],
      validation_signal: signal(
        ["corpus 已显式提供但 query 缺失。"],
        ["未执行检索。"],
        ["query"]
      ),
      persistence_candidate: persistenceCandidate(input, "NO")
    };
  }

  return {
    status: "SOURCE_UNAVAILABLE",
    reason_code: "CORPUS_REQUIRED",
    query: text(input.query),
    result_count: 0,
    results: [],
    validation_signal: signal(
      ["未调用外部 Skill、API 或网络来源。"],
      ["未检索未提供的 corpus。"],
      ["corpus"]
    ),
    persistence_candidate: persistenceCandidate(input)
  };
}

function validateInputTypes(input) {
  if (Object.hasOwn(input, "query") && typeof input.query !== "string") {
    throw new InputError("QUERY_NOT_STRING", "query 必须是字符串。");
  }
  if (Object.hasOwn(input, "corpus") && !Array.isArray(input.corpus)) {
    throw new InputError("CORPUS_NOT_ARRAY", "corpus 必须是 JSON 数组。");
  }
  if (Object.hasOwn(input, "limit")) normalizeLimit(input.limit);
  if (Object.hasOwn(input, "new_pattern_observed") && typeof input.new_pattern_observed !== "boolean") {
    throw new InputError("NEW_PATTERN_FLAG_INVALID", "new_pattern_observed 必须是布尔值。");
  }
}

function bm25(documents, queryTerms, limit) {
  if (documents.length === 0) return [];
  const averageLength = documents.reduce((sum, document) => sum + document.terms.length, 0) / documents.length;
  const querySet = [...new Set(queryTerms)];
  const documentFrequency = new Map(querySet.map((term) => [term, 0]));

  for (const document of documents) {
    const terms = new Set(document.terms);
    for (const term of querySet) {
      if (terms.has(term)) documentFrequency.set(term, documentFrequency.get(term) + 1);
    }
  }

  return documents
    .map((document) => {
      const frequencies = new Map();
      for (const term of document.terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
      let score = 0;
      const matchedTerms = [];

      for (const term of querySet) {
        const frequency = frequencies.get(term) ?? 0;
        if (frequency === 0) continue;
        matchedTerms.push(term);
        const frequencyInCorpus = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (documents.length - frequencyInCorpus + 0.5) / (frequencyInCorpus + 0.5));
        const normalization = frequency + K1 * (1 - B + B * (document.terms.length / averageLength));
        score += idf * ((frequency * (K1 + 1)) / normalization);
      }

      return { document, score, matchedTerms };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.document.order - right.document.order)
    .slice(0, limit)
    .map(({ document, score, matchedTerms }) => ({
      id: document.id,
      question: document.question || null,
      excerpt: document.excerpt || null,
      source: document.source || null,
      score: Number(score.toFixed(6)),
      matched_terms: matchedTerms
    }));
}

function search(input) {
  validateInputTypes(input);
  const hasQuery = Object.hasOwn(input, "query") && text(input.query).length > 0;
  const hasCorpus = Object.hasOwn(input, "corpus");
  if (!hasQuery || !hasCorpus) return informationalResult(input);
  const query = text(input.query);
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    return {
      status: "UNKNOWN",
      reason_code: "QUERY_NO_TERMS",
      query,
      result_count: 0,
      results: [],
      validation_signal: signal(
        ["corpus 未被读取，因为 query 没有可检索词。"],
        ["未执行检索。"],
        ["可检索的 query"]
      ),
      persistence_candidate: persistenceCandidate(input, "NO")
    };
  }

  const documents = normalizeCorpus(input.corpus);
  const results = bm25(documents, queryTerms, normalizeLimit(input.limit));
  if (results.length === 0) {
    return {
      status: "MISS",
      reason_code: "NO_LEXICAL_MATCH",
      query,
      result_count: 0,
      results: [],
      validation_signal: signal(
        ["已在显式提供的 corpus 中完成 BM25 检索。"],
        ["没有任何条目取得正分；MISS 不等于问题不存在。"],
        ["同义表达、语料覆盖与原始上下文"]
      ),
      persistence_candidate: persistenceCandidate(input)
    };
  }

  return {
    status: "HIT",
    reason_code: "BM25_MATCH",
    query,
    result_count: results.length,
    results,
    validation_signal: signal(
      [`已在显式提供的 corpus 中完成 BM25 检索并命中 ${results.length} 条候选。`],
      ["候选命中不等于原始上下文、适用性、时效或问题已解决。"],
      ["候选是否足以支持最终回答"]
    ),
    persistence_candidate: persistenceCandidate(input)
  };
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) return usage();
  return search(options.input);
}

try {
  writeJson(process.stdout, main(process.argv.slice(2)));
} catch (error) {
  if (error instanceof InputError) {
    failure(error.reasonCode, error.message);
  } else {
    failure("UNEXPECTED_ERROR", "检索器无法处理本次输入。", 70);
  }
}
