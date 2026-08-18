# Phase 1 Packet：黄金评测集与召回选型

> 状态：`FROZEN_BEFORE_IMPLEMENTATION`
> 冻结时间：2026-08-18 03:48 +08:00
> Owner 授权：G0—G9 已于 2026-08-18 通过；允许进入 Phase 1
> 下一停点：G10；本 packet 不授权进入 Phase 2

## 1. 目标与基线

本 Phase 只回答一个问题：在不读取 PublicCard 正文、不把分数当发布权的前提下，哪一种召回方案最适合把自然语言查询缩小为安全候选集合。

- 公开远端真源：`origin/main@2667fdc30599700310fd3f9ca47c7e1d590b0e70`
- 本地实现分支：`codex/phase1-retrieval-eval@2667fdc30599700310fd3f9ca47c7e1d590b0e70`
- 开工回归：`node --test` 为 64／64 PASS，fail／cancelled／skipped／todo 均为 0
- 规范真源：控制面 `docs/PROJECT.md` 的 G0—G9 决策；领域 ADR 只记录决策历史；公开 `main` 是运行时事实
- 输入权限：只使用公开仓库已有 PublicCard／测试中的公开安全问法，以及本目录明确标记的纯合成 fixture；不读取原始群聊、私域候选或成员信息

## 2. 文件白名单与非目标

Phase 1 允许新增或修改：

- `evals/retrieval/**`
- `schemas/retrieval-eval.schema.json`
- `tests/retrieval-eval.test.mjs`
- `PROGRESS.md` 中 Phase 1 的事实状态

受保护且本 Phase 不修改：

- `knowledge/public/**`
- `schemas/public-card.schema.json`
- `scripts/query-public-card.mjs`
- `contracts/**`
- `SKILL.md`、`README.md`

本 Phase 不发布新卡、不改变精确 loader、不接入生产路由、不触达社区、不 push／开 PR／merge，也不选择 Phase 2 的语境裁决合同。

## 3. 证据分层

- `observed_public_safe`：问法来自当前公开卡、公开索引或现有公开测试；可以证明对现有单卡的召回表现。
- `synthetic_fixture`：纯虚构多卡、歧义、负例或安全条件；只证明机制，不证明真实跨卡效果。
- 当前只有 1 张独立批准 PublicCard。只有 Phase 3 至少再批准 2 张真实 PublicCard 后，才允许声称真实跨卡行为。

## 4. 评测对象与状态语义

数据集固定为 60 条：设计集 40 条，盲测集 20 条。每条至少含 `case_id / query / expected_status / expected_candidates / risk_class / provenance / rationale`。

`expected_status` 是召回阶段的 oracle，不是 loader 的最终状态：

| 值 | 含义 | 成功条件 |
|---|---|---|
| `CANDIDATE` | 应产生一个候选集合 | 目标 ID 位于阈值后的 top 3 |
| `CLARIFY` | 至少两个候选都合理，后续应问一次区分问题 | 所有目标 ID 位于阈值后的 top 3 |
| `MISS` | 不应建议任何 fixture 候选 | 阈值后的候选集合为空 |
| `DENY` | 上游安全／完整性条件已失败 | 不运行召回，候选集合为空 |

`CANDIDATE` 绝不等于 `ALLOW`。只有后续候选适用性裁决完成、且确定性 loader 复验通过，才可能返回 PublicCard 正文。

## 5. 冻结的比较协议

比较四类实现：

1. `char_ngram`：Unicode NFKC 规范化后的 2—4 字符 n-gram 余弦相似度。
2. `bm25`：对 public question、内部 aliases 和 scope hint 建索引；中文字符 bigram 与 ASCII token 共同参与。
3. `apple_nl_embedding_zh`：当前 macOS 的 Apple NaturalLanguage 中文句向量；仅作为本机 embedding 基线，并明确记录平台限制。
4. `hybrid`：冻结为 `0.35 × bm25_normalized + 0.65 × embedding_similarity`；不因盲测结果改权重。

每个算法的候选按分数降序、`card_id` 升序稳定排序，最多 3 个。输出白名单固定为：

```text
card_id / public_question / scope_hint
```

aliases、内部 revision、索引文本、分数、正文、来源和发布状态均不得进入候选输出。

## 6. 阈值选择与盲测隔离

1. 先提交本 packet、schema、fixture 和完整黄金集，形成不可变 Git 基线。
2. 实现只可使用 `split = DESIGN` 的 40 条选择阈值；代码路径不得读取 BLIND 标签参与选择。
3. 每个算法的阈值候选由设计集实际分数、边界值 0／1 生成；先满足硬门，再按以下顺序选择：
   - `DENY` 旁路率 100%；
   - README 同词、天气、候选晋级、来源追问等 hard-negative 假阳性为 0；
   - 设计集 `MISS` 假阳性为 0；
   - 最大化 `CANDIDATE hit@3`；
   - 最大化 `CLARIFY full-coverage@3`；
   - 同分取更高阈值，再取名称字典序靠前的方案。
4. 将算法、权重、top-k 和设计阈值写入独立 `frozen-config.json` 并提交后，才允许执行一次 BLIND 评测。
5. BLIND 执行后禁止调参；若失败，只能如实报告，另起数据集版本和新 Owner 决策，不覆盖 v1。

## 7. G10 前冻结的验收门

盲测推荐算法必须同时满足：

- `DENY` 旁路 100%；
- 候选输出白名单合规 100%，无分数或正文泄露；
- hard-negative 假阳性 0；
- `MISS` 假阳性 0；
- `CANDIDATE hit@3 ≥ 80%`；
- `CLARIFY full-coverage@3 ≥ 2/3`；
- 现有精确 loader 64 项回归全绿；
- fixture 结果只写成机制证据。

若 embedding 不可用或不满足门槛，回退推荐 `bm25`；若 `bm25` 仍未过门，Phase 1 保持 `HOLD`，不通过提高假阳性率换召回。

## 8. 正反验收

正验收：自然改写可召回目标；歧义保留全部必要候选；安全候选元数据可序列化；盲测只运行一次；报告可从冻结输入复跑。

反验收：

- `README.md` 同词问题、天气问题、无上下文的“给来源”、要求自动晋级知识库等被推荐；
- 注入、敏感输入或 index-card drift 仍进入召回；
- 任意分数直接触发 `ALLOW`、读取正文或暴露 aliases；
- 把合成 fixture 写成真实多卡证据；
- 盲测后改阈值、权重、标签或查询。

## 9. 风险、回滚与停止条件

- Apple embedding 是 macOS 平台能力，不得默认为跨平台依赖；不可用时结果记 `UNAVAILABLE`，不伪造 embedding 分数。
- 中文分词与小样本都可能过拟合；保留每类逐案结果，而非只报聚合分数。
- 任一硬不变量失败，停止推荐并回到本 Phase 基线；不改 loader 即可完整回滚。
- 完成报告后只提交 G10 决策包，等待 Owner 选择评测协议、阈值与算法；未经 G10 不进入 Phase 2。
