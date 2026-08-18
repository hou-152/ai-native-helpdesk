const SAFE_CANDIDATE_KEYS = Object.freeze(["card_id", "public_question", "scope_hint"]);
export const ALGORITHMS = Object.freeze([
  "char_ngram",
  "bm25",
  "apple_nl_embedding_zh",
  "hybrid"
]);
export const TOP_K = 3;
export const HYBRID_WEIGHTS = Object.freeze({ bm25: 0.35, embedding: 0.65 });

export function normalizeText(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, " ");
}

function compactText(value) {
  return normalizeText(value).replace(/[^\p{L}\p{N}._-]+/gu, "");
}

function frequencyMap(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function cosine(left, right) {
  if (left.size === 0 || right.size === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const value of left.values()) leftNorm += value * value;
  for (const value of right.values()) rightNorm += value * value;
  for (const [key, value] of left.entries()) dot += value * (right.get(key) ?? 0);
  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / Math.sqrt(leftNorm * rightNorm);
}

export function charNgrams(value, minimum = 2, maximum = 4) {
  const normalized = compactText(value);
  const result = [];
  for (let size = minimum; size <= maximum; size += 1) {
    for (let index = 0; index + size <= normalized.length; index += 1) {
      result.push(`${size}:${normalized.slice(index, index + size)}`);
    }
  }
  if (result.length === 0 && normalized.length > 0) result.push(`1:${normalized}`);
  return result;
}

export function bm25Tokens(value) {
  const normalized = normalizeText(value);
  const result = [];
  for (const match of normalized.matchAll(/[a-z0-9]+(?:[._/-][a-z0-9]+)*/g)) {
    result.push(`a:${match[0]}`);
    for (const part of match[0].split(/[._/-]+/)) {
      if (part && part !== match[0]) result.push(`a:${part}`);
    }
  }
  for (const match of normalized.matchAll(/\p{Script=Han}+/gu)) {
    const run = match[0];
    if (run.length === 1) result.push(`h1:${run}`);
    for (let index = 0; index + 2 <= run.length; index += 1) {
      result.push(`h2:${run.slice(index, index + 2)}`);
    }
    for (let index = 0; index + 3 <= run.length; index += 1) {
      result.push(`h3:${run.slice(index, index + 3)}`);
    }
  }
  return result;
}

function cardTexts(card) {
  return [card.public_question, card.scope_hint, ...card.retrieval_aliases];
}

function explicitFileIdentifiers(value) {
  const normalized = normalizeText(value);
  const identifiers = new Set();
  for (const match of normalized.matchAll(/\b[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+\b/g)) {
    identifiers.add(match[0]);
  }
  for (const special of ["agents", "readme"]) {
    if (new RegExp(`\\b${special}\\b`).test(normalized)) identifiers.add(special);
  }
  return identifiers;
}

function fileIdentifiersCompatible(query, card) {
  const queryIdentifiers = explicitFileIdentifiers(query);
  if (queryIdentifiers.size === 0) return true;
  const documentIdentifiers = explicitFileIdentifiers(cardTexts(card).join(" "));
  for (const identifier of queryIdentifiers) {
    const stem = identifier.split(".")[0];
    const compatible = [...documentIdentifiers].some((candidate) =>
      candidate === identifier || candidate.split(".")[0] === stem
    );
    if (!compatible) return false;
  }
  return true;
}

function scoreCharNgram(query, card) {
  if (!fileIdentifiersCompatible(query, card)) return 0;
  const queryMap = frequencyMap(charNgrams(query));
  return Math.max(...cardTexts(card).map((text) => cosine(queryMap, frequencyMap(charNgrams(text)))));
}

function scoreBm25(query, cards) {
  const documents = cards.map((card) => bm25Tokens(cardTexts(card).join(" ")));
  const queryTerms = [...new Set(bm25Tokens(query))];
  const averageLength = documents.reduce((sum, terms) => sum + terms.length, 0) / documents.length;
  const frequencies = documents.map((terms) => frequencyMap(terms));
  const documentFrequency = new Map();
  for (const term of queryTerms) {
    documentFrequency.set(term, frequencies.filter((values) => values.has(term)).length);
  }
  const k1 = 1.2;
  const b = 0.75;
  return cards.map((card, index) => {
    if (!fileIdentifiersCompatible(query, card)) return { card_id: card.card_id, score: 0 };
    let raw = 0;
    for (const term of queryTerms) {
      const count = frequencies[index].get(term) ?? 0;
      if (count === 0) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (cards.length - df + 0.5) / (df + 0.5));
      const normalization = count + k1 * (1 - b + b * (documents[index].length / averageLength));
      raw += idf * ((count * (k1 + 1)) / normalization);
    }
    return { card_id: card.card_id, score: raw / (raw + 1) };
  });
}

function requireFixture(fixture) {
  if (fixture?.schema_version !== "1.0" || !Array.isArray(fixture.cards) || fixture.cards.length < 2) {
    throw new Error("RETRIEVAL_FIXTURE_INVALID");
  }
  const seen = new Set();
  for (const card of fixture.cards) {
    const keys = Object.keys(card).sort();
    const expected = [
      "card_id",
      "fixture_origin",
      "public_card_id",
      "public_question",
      "retrieval_aliases",
      "scope_hint"
    ].sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      throw new Error("RETRIEVAL_FIXTURE_CARD_INVALID");
    }
    if (seen.has(card.card_id) || !Array.isArray(card.retrieval_aliases)) {
      throw new Error("RETRIEVAL_FIXTURE_CARD_INVALID");
    }
    seen.add(card.card_id);
  }
  return fixture;
}

export function validateDataset(dataset, fixture) {
  requireFixture(fixture);
  if (
    dataset?.schema_version !== "1.0" ||
    dataset?.dataset_id !== "aihd-retrieval-golden-v1" ||
    !Array.isArray(dataset.cases) ||
    dataset.cases.length < 50
  ) {
    throw new Error("RETRIEVAL_DATASET_INVALID");
  }
  const ids = new Set();
  const cardIds = new Set(fixture.cards.map((card) => card.card_id));
  const exactKeys = [
    "case_id",
    "expected_candidates",
    "expected_status",
    "precondition",
    "provenance",
    "query",
    "rationale",
    "risk_class",
    "split",
    "tags"
  ].sort();
  for (const item of dataset.cases) {
    const keys = Object.keys(item).sort();
    if (keys.length !== exactKeys.length || keys.some((key, index) => key !== exactKeys[index])) {
      throw new Error(`RETRIEVAL_CASE_INVALID:${item?.case_id ?? "UNKNOWN"}`);
    }
    if (ids.has(item.case_id)) throw new Error(`RETRIEVAL_CASE_DUPLICATE:${item.case_id}`);
    ids.add(item.case_id);
    if (!Array.isArray(item.expected_candidates) || !Array.isArray(item.tags)) {
      throw new Error(`RETRIEVAL_CASE_INVALID:${item.case_id}`);
    }
    for (const cardId of item.expected_candidates) {
      if (!cardIds.has(cardId)) throw new Error(`RETRIEVAL_CASE_UNKNOWN_CARD:${item.case_id}`);
    }
    const isDeny = item.expected_status === "DENY";
    if (isDeny !== item.precondition.startsWith("DENY_")) {
      throw new Error(`RETRIEVAL_CASE_PRECONDITION_INVALID:${item.case_id}`);
    }
    if (["MISS", "DENY"].includes(item.expected_status) && item.expected_candidates.length !== 0) {
      throw new Error(`RETRIEVAL_CASE_EXPECTATION_INVALID:${item.case_id}`);
    }
    if (item.expected_status === "CANDIDATE" && item.expected_candidates.length !== 1) {
      throw new Error(`RETRIEVAL_CASE_EXPECTATION_INVALID:${item.case_id}`);
    }
    if (item.expected_status === "CLARIFY" && item.expected_candidates.length < 2) {
      throw new Error(`RETRIEVAL_CASE_EXPECTATION_INVALID:${item.case_id}`);
    }
  }
  return dataset;
}

function stableRanking(cards, scores) {
  const scoreById = new Map(scores.map((item) => [item.card_id, item.score]));
  return cards
    .map((card) => ({
      card_id: card.card_id,
      public_question: card.public_question,
      scope_hint: card.scope_hint,
      score: Math.max(0, Math.min(1, scoreById.get(card.card_id) ?? 0))
    }))
    .sort((left, right) => right.score - left.score || left.card_id.localeCompare(right.card_id));
}

export function rankCandidates({ query, fixture, algorithm, embeddingScores }) {
  requireFixture(fixture);
  if (!ALGORITHMS.includes(algorithm)) throw new Error(`RETRIEVAL_ALGORITHM_UNKNOWN:${algorithm}`);
  const cards = fixture.cards;
  if (algorithm === "char_ngram") {
    return stableRanking(cards, cards.map((card) => ({ card_id: card.card_id, score: scoreCharNgram(query, card) })));
  }
  const bm25Scores = scoreBm25(query, cards);
  if (algorithm === "bm25") return stableRanking(cards, bm25Scores);
  if (!embeddingScores) throw new Error("RETRIEVAL_EMBEDDING_UNAVAILABLE");
  const embedding = cards.map((card) => ({
    card_id: card.card_id,
    score: fileIdentifiersCompatible(query, card) ? Number(embeddingScores[card.card_id] ?? 0) : 0
  }));
  if (algorithm === "apple_nl_embedding_zh") return stableRanking(cards, embedding);
  const bm25ById = new Map(bm25Scores.map((item) => [item.card_id, item.score]));
  const embeddingById = new Map(embedding.map((item) => [item.card_id, item.score]));
  return stableRanking(cards, cards.map((card) => ({
    card_id: card.card_id,
    score:
      HYBRID_WEIGHTS.bm25 * (bm25ById.get(card.card_id) ?? 0) +
      HYBRID_WEIGHTS.embedding * (embeddingById.get(card.card_id) ?? 0)
  })));
}

export function projectSafeCandidate(candidate) {
  return {
    card_id: candidate.card_id,
    public_question: candidate.public_question,
    scope_hint: candidate.scope_hint
  };
}

export function hasOnlySafeCandidateKeys(candidate) {
  const keys = Object.keys(candidate).sort();
  const expected = [...SAFE_CANDIDATE_KEYS].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

export function selectCandidates(ranking, threshold, topK = TOP_K) {
  return ranking
    .filter((candidate) => candidate.score >= threshold)
    .slice(0, topK)
    .map(projectSafeCandidate);
}

function predictionForCase(item, ranking, threshold, topK) {
  if (item.precondition !== "ELIGIBLE") {
    return { predicted_status: "DENY", candidates: [], retrieval_invoked: false };
  }
  const candidates = selectCandidates(ranking, threshold, topK);
  return {
    predicted_status: candidates.length === 0 ? "MISS" : candidates.length === 1 ? "CANDIDATE" : "CLARIFY",
    candidates,
    retrieval_invoked: true
  };
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

export function evaluateAtThreshold(cases, rankingsByCase, threshold, topK = TOP_K) {
  const rows = [];
  for (const item of cases) {
    const ranking = rankingsByCase.get(item.case_id) ?? [];
    const prediction = predictionForCase(item, ranking, threshold, topK);
    const selectedIds = prediction.candidates.map((candidate) => candidate.card_id);
    const expected = new Set(item.expected_candidates);
    const selected = new Set(selectedIds);
    const targetCovered = item.expected_candidates.every((cardId) => selected.has(cardId));
    const exactSet = targetCovered && selectedIds.length === item.expected_candidates.length;
    const passed =
      item.expected_status === "DENY"
        ? prediction.predicted_status === "DENY" && !prediction.retrieval_invoked
        : item.expected_status === "MISS"
          ? selectedIds.length === 0
          : targetCovered;
    rows.push({
      case_id: item.case_id,
      expected_status: item.expected_status,
      predicted_status: prediction.predicted_status,
      expected_candidates: [...expected],
      selected_candidate_ids: selectedIds,
      passed,
      exact_set: exactSet,
      retrieval_invoked: prediction.retrieval_invoked,
      safe_output: prediction.candidates.every(hasOnlySafeCandidateKeys),
      hard_negative: item.tags.includes("hard-negative")
    });
  }

  const candidates = rows.filter((row) => row.expected_status === "CANDIDATE");
  const clarifies = rows.filter((row) => row.expected_status === "CLARIFY");
  const misses = rows.filter((row) => row.expected_status === "MISS");
  const denies = rows.filter((row) => row.expected_status === "DENY");
  const hardNegatives = rows.filter((row) => row.hard_negative);
  const falsePositive = (row) => row.selected_candidate_ids.length > 0;
  return {
    threshold,
    counts: {
      total: rows.length,
      candidate: candidates.length,
      clarify: clarifies.length,
      miss: misses.length,
      deny: denies.length,
      hard_negative: hardNegatives.length
    },
    candidate_hit_at_3: rate(candidates.filter((row) => row.passed).length, candidates.length),
    candidate_exact_set_rate: rate(candidates.filter((row) => row.exact_set).length, candidates.length),
    clarify_full_coverage_at_3: rate(clarifies.filter((row) => row.passed).length, clarifies.length),
    clarify_exact_set_rate: rate(clarifies.filter((row) => row.exact_set).length, clarifies.length),
    miss_false_positive_count: misses.filter(falsePositive).length,
    miss_false_positive_rate: rate(misses.filter(falsePositive).length, misses.length),
    hard_negative_false_positive_count: hardNegatives.filter(falsePositive).length,
    hard_negative_false_positive_rate: rate(hardNegatives.filter(falsePositive).length, hardNegatives.length),
    deny_bypass_rate: rate(denies.filter((row) => row.passed).length, denies.length),
    safe_output_rate: rate(rows.filter((row) => row.safe_output).length, rows.length),
    passed_count: rows.filter((row) => row.passed).length,
    failed_case_ids: rows.filter((row) => !row.passed).map((row) => row.case_id),
    rows
  };
}

function thresholdCandidates(rankingsByCase) {
  const values = new Set([0, 1 + Number.EPSILON]);
  for (const ranking of rankingsByCase.values()) {
    for (const candidate of ranking) values.add(candidate.score);
  }
  const sorted = [...values].sort((left, right) => left - right);
  for (let index = 0; index + 1 < sorted.length; index += 1) {
    values.add((sorted[index] + sorted[index + 1]) / 2);
  }
  return [...values].sort((left, right) => left - right);
}

function isBetterThreshold(left, right) {
  if (!right) return true;
  const dimensions = [
    [left.metrics.candidate_hit_at_3, right.metrics.candidate_hit_at_3],
    [left.metrics.clarify_full_coverage_at_3, right.metrics.clarify_full_coverage_at_3],
    [left.metrics.candidate_exact_set_rate, right.metrics.candidate_exact_set_rate],
    [left.threshold, right.threshold]
  ];
  for (const [leftValue, rightValue] of dimensions) {
    if (leftValue !== rightValue) return leftValue > rightValue;
  }
  return false;
}

export function tuneThreshold(designCases, rankingsByCase, topK = TOP_K) {
  let best = null;
  for (const threshold of thresholdCandidates(rankingsByCase)) {
    const metrics = evaluateAtThreshold(designCases, rankingsByCase, threshold, topK);
    const hardGates =
      metrics.deny_bypass_rate === 1 &&
      metrics.safe_output_rate === 1 &&
      metrics.hard_negative_false_positive_count === 0 &&
      metrics.miss_false_positive_count === 0;
    if (!hardGates) continue;
    const candidate = { threshold, metrics };
    if (isBetterThreshold(candidate, best)) best = candidate;
  }
  if (!best) throw new Error("RETRIEVAL_THRESHOLD_NOT_FOUND");
  return best;
}

export function passesBlindGate(metrics) {
  return (
    metrics.deny_bypass_rate === 1 &&
    metrics.safe_output_rate === 1 &&
    metrics.hard_negative_false_positive_count === 0 &&
    metrics.miss_false_positive_count === 0 &&
    metrics.candidate_hit_at_3 >= 0.8 &&
    metrics.clarify_full_coverage_at_3 >= 2 / 3
  );
}
