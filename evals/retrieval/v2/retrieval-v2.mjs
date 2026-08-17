import {
  TOP_K,
  evaluateAtThreshold,
  rankCandidates,
  selectCandidates
} from "../retrieval.mjs";

export const V2_ALGORITHMS = Object.freeze([
  "bm25_v1",
  "bm25_expansion",
  "bm25_keyword",
  "bm25_expansion_keyword"
]);

const EXPANSION_RULES = Object.freeze([
  [/(?:\bapproval\b|审批)/giu, ["审批", "权限"]],
  [/(?:\bsandbox\s+policy\b|沙箱策略)/giu, ["沙箱", "策略", "权限"]],
  [/(?:\bpermission\s+denied\b|权限拒绝)/giu, ["权限", "拒绝"]],
  [/(?:\bapproval\s+required\b|需要\s*approval)/giu, ["审批", "权限", "拒绝"]],
  [/(?:\bsandbox\s+restriction\b|沙箱限制)/giu, ["沙箱", "权限", "限制"]],
  [/(?:没吃到|吃到了|没有吃到)/gu, ["读取", "加载", "生效"]],
  [/(?:不听话|不遵守|没按规则)/gu, ["规则", "遵守", "生效"]],
  [/(?:打架|不一致|冲突)/gu, ["冲突", "覆盖", "优先级"]],
  [/(?:继承|哪一层|哪一份|哪条指令链)/gu, ["作用域", "覆盖", "优先级"]],
  [/(?:写不了|不能写|无法写)/gu, ["文件", "权限", "沙箱"]],
  [/(?:执行不了|命令.{0,8}(?:拒绝|挡住|拦下))/gu, ["命令", "权限", "沙箱"]],
  [/(?:操作.{0,8}(?:拒绝|挡住|拦下)|仍被拒绝)/gu, ["操作", "权限", "沙箱"]],
  [/(?:不读文件|读不了文件|不能读文件)/gu, ["文件", "权限", "沙箱"]],
  [/(?:换会话|新对话|新\s*session|重启)/giu, ["会话", "session"]],
  [/(?:忘了|不记得|状态.{0,8}(?:不见|没了|丢)|没带上.{0,8}(?:事实|状态))/gu, ["记忆", "memory", "读回"]],
  [/(?:投影|工具.{0,8}(?:没有|看不到|不可用)|tool.{0,8}(?:missing|unavailable))/giu, ["工具", "可见", "连接"]],
  [/\bserver\b/giu, ["服务"]],
  [/\btool\b/giu, ["工具"]],
  [/\bmemory\b/giu, ["记忆"]],
  [/\bsession\b/giu, ["会话"]]
]);

const KEYWORD_GROUPS = Object.freeze({
  "FIX-CODEX-AGENTS": Object.freeze([
    Object.freeze(["agents.md", "规则", "指令", "项目说明"]),
    Object.freeze(["读取", "加载", "吃到", "生效", "遵守", "行动", "探针", "对照", "触发", "验证"])
  ]),
  "FIX-CODEX-INSTRUCTION-SCOPE": Object.freeze([
    Object.freeze(["全局", "根目录", "上层", "子目录", "更近", "仓库", "项目"]),
    Object.freeze(["作用域", "覆盖", "继承", "层级", "位置", "指令链", "优先级", "冲突", "打架", "哪一层", "采用"])
  ]),
  "FIX-CODEX-SANDBOX": Object.freeze([
    Object.freeze(["沙箱", "sandbox", "权限", "permission", "approval", "审批", "系统", "隔离"]),
    Object.freeze(["拒绝", "挡住", "拦下", "执行不了", "写不了", "不能写", "网络", "命令", "文件", "访问", "放行", "restriction", "required", "denied"])
  ]),
  "FIX-CODEX-MCP": Object.freeze([
    Object.freeze(["mcp", "server", "服务"]),
    Object.freeze(["连接", "工具", "tool", "配置", "注册", "投影", "可见", "列表", "doctor", "健康"])
  ]),
  "FIX-OPENCLAW-MEMORY": Object.freeze([
    Object.freeze(["openclaw", "小龙虾", "memory", "记忆"]),
    Object.freeze(["会话", "session", "重启", "新对话", "忘", "长期", "持久", "写入", "读回", "保存", "上一轮", "项目事实"])
  ])
});

function normalize(value) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

export function expandQuery(query) {
  const additions = new Set();
  for (const [pattern, terms] of EXPANSION_RULES) {
    pattern.lastIndex = 0;
    if (pattern.test(query)) for (const term of terms) additions.add(term);
  }
  return additions.size === 0 ? query : `${query} ${[...additions].join(" ")}`;
}

function explicitFileIdentifiers(value) {
  const normalized = normalize(value);
  const identifiers = new Set();
  for (const match of normalized.matchAll(/\b[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+\b/g)) {
    identifiers.add(match[0]);
  }
  for (const special of ["agents", "readme"]) {
    if (new RegExp(`\\b${special}\\b`).test(normalized)) identifiers.add(special);
  }
  return identifiers;
}

function cardTexts(card) {
  return [card.public_question, card.scope_hint, ...card.retrieval_aliases].join(" ");
}

function fileIdentifiersCompatible(query, card) {
  const queryIdentifiers = explicitFileIdentifiers(query);
  if (queryIdentifiers.size === 0) return true;
  const documentIdentifiers = explicitFileIdentifiers(cardTexts(card));
  for (const identifier of queryIdentifiers) {
    const stem = identifier.split(".")[0];
    const compatible = [...documentIdentifiers].some((candidate) =>
      candidate === identifier || candidate.split(".")[0] === stem
    );
    if (!compatible) return false;
  }
  return true;
}

function termMatches(text, term) {
  if (/^[a-z0-9_.-]+$/.test(term)) {
    return new RegExp(`(?:^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i").test(text);
  }
  return text.includes(term);
}

export function keywordScore(query, cardId) {
  const groups = KEYWORD_GROUPS[cardId];
  if (!groups) return 0;
  const text = normalize(query);
  const counts = groups.map((terms) => terms.filter((term) => termMatches(text, term)).length);
  if (counts.some((count) => count === 0)) return 0;
  const evidenceCount = counts.reduce((sum, count) => sum + Math.min(count, 4), 0);
  return Math.min(0.96, 0.84 + 0.02 * (evidenceCount - 2));
}

function rerankWithKeywords(query, fixture, ranking) {
  const cardById = new Map(fixture.cards.map((card) => [card.card_id, card]));
  return ranking
    .map((candidate) => {
      const card = cardById.get(candidate.card_id);
      const keyword = keywordScore(query, candidate.card_id);
      const score = fileIdentifiersCompatible(query, card)
        ? keyword > 0
          ? 1 - (1 - candidate.score) * (1 - keyword)
          : candidate.score
        : 0;
      return { ...candidate, score };
    })
    .sort((left, right) => right.score - left.score || left.card_id.localeCompare(right.card_id));
}

export function rankCandidatesV2({ query, fixture, algorithm }) {
  if (!V2_ALGORITHMS.includes(algorithm)) throw new Error(`RETRIEVAL_V2_ALGORITHM_UNKNOWN:${algorithm}`);
  const usesExpansion = algorithm === "bm25_expansion" || algorithm === "bm25_expansion_keyword";
  const usesKeyword = algorithm === "bm25_keyword" || algorithm === "bm25_expansion_keyword";
  const retrievalQuery = usesExpansion ? expandQuery(query) : query;
  const ranking = rankCandidates({ query: retrievalQuery, fixture, algorithm: "bm25" });
  return usesKeyword ? rerankWithKeywords(retrievalQuery, fixture, ranking) : ranking;
}

function scoreFor(ranking, cardId) {
  const candidate = ranking.find((item) => item.card_id === cardId);
  if (!candidate) throw new Error(`RETRIEVAL_V2_TARGET_MISSING:${cardId}`);
  return candidate.score;
}

export function calibrateObserved(cases, rankingsByCase, topK = TOP_K) {
  const negativeRows = [];
  const positiveRows = [];
  for (const item of cases) {
    if (item.precondition !== "ELIGIBLE") continue;
    const ranking = rankingsByCase.get(item.case_id);
    if (!ranking) throw new Error(`RETRIEVAL_V2_RANKING_MISSING:${item.case_id}`);
    if (item.expected_status === "MISS") {
      negativeRows.push({ case_id: item.case_id, score: ranking[0]?.score ?? 0 });
      continue;
    }
    for (const cardId of item.expected_candidates) {
      positiveRows.push({ case_id: item.case_id, card_id: cardId, score: scoreFor(ranking, cardId) });
    }
  }
  const negativeCeiling = Math.max(...negativeRows.map((row) => row.score));
  const positiveFloor = Math.min(...positiveRows.map((row) => row.score));
  const separation = positiveFloor - negativeCeiling;
  const threshold = (positiveFloor + negativeCeiling) / 2;
  const metrics = evaluateAtThreshold(cases, rankingsByCase, threshold, topK);
  const qualified =
    separation >= 0.05 &&
    metrics.counts.candidate === 30 &&
    metrics.counts.clarify === 7 &&
    metrics.counts.miss === 17 &&
    metrics.counts.deny === 6 &&
    metrics.candidate_hit_at_3 === 1 &&
    metrics.clarify_full_coverage_at_3 === 1 &&
    metrics.miss_false_positive_count === 0 &&
    metrics.hard_negative_false_positive_count === 0 &&
    metrics.deny_bypass_rate === 1 &&
    metrics.safe_output_rate === 1;
  return {
    threshold,
    positive_floor: positiveFloor,
    negative_ceiling: negativeCeiling,
    separation,
    positive_floor_rows: positiveRows.filter((row) => row.score === positiveFloor),
    negative_ceiling_rows: negativeRows.filter((row) => row.score === negativeCeiling),
    qualified,
    metrics
  };
}

export function buildRankings(cases, fixture, algorithm) {
  const rankings = new Map();
  for (const item of cases) {
    if (item.precondition === "ELIGIBLE") {
      rankings.set(item.case_id, rankCandidatesV2({ query: item.query, fixture, algorithm }));
    }
  }
  return rankings;
}

export function holdoutGate(metrics) {
  return (
    metrics.counts.candidate === 15 &&
    metrics.counts.clarify === 6 &&
    metrics.counts.miss === 6 &&
    metrics.counts.deny === 3 &&
    metrics.candidate_hit_at_3 >= 13 / 15 &&
    metrics.candidate_exact_set_rate >= 10 / 15 &&
    metrics.clarify_full_coverage_at_3 >= 5 / 6 &&
    metrics.miss_false_positive_count === 0 &&
    metrics.hard_negative_false_positive_count === 0 &&
    metrics.deny_bypass_rate === 1 &&
    metrics.safe_output_rate === 1
  );
}

export function safeCandidatesFor(ranking, threshold) {
  return selectCandidates(ranking, threshold, TOP_K);
}
