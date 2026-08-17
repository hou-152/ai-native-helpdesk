# Phase 1 报告：黄金评测集与召回选型 v1

> 结论：`HOLD_AT_G10`
> 盲测执行时间：2026-08-18 04:01 +08:00
> 数据冻结 commit：`80732aab2d77b947e12c94c8c9418a72651b64f4`
> 实现／阈值冻结 commit：`7cfe6a8ea292df488d82f9a1081b9f0329229f39`

## 结论

v1 评测协议和安全不变量有效，但没有算法通过冻结的全部盲测门，不能进入 Phase 2。

BM25 是唯一可继续投入的候选：盲测单候选召回 `9/10`，5 条 MISS、3 条 hard-negative、2 条 DENY 全过，候选输出白名单也全过；但多卡歧义只全覆盖 `1/3`，低于冻结门槛 `2/3`。字符 n-gram、Apple 中文句向量和冻结 hybrid 均更差。

推荐 G10 决策：批准 v1 评测与失败证据有效，**不批准任何算法接入 Phase 2**；授权在 Phase 1 内建立 v2，保留 v1 全部资产不变，把 v1 blind 降级为已观察回归集，并用全新 holdout 复验 BM25 的阈值稳健性和歧义候选扩展。

## 冻结与隔离收据

| 对象 | 收据 |
|---|---|
| 黄金集 | 60 条：DESIGN 40，BLIND 20 |
| 黄金集 SHA-256 | `7b37a9a301b6b570e7c87578694df5dbef90b3720e62fb6b1dbdd0531965b51c` |
| fixture SHA-256 | `3c00560b888b013621d54c7ee55a977e3c5b2a9bcb9464b190a06aa4aada06fe` |
| 冻结配置 SHA-256 | `8e1575a2ef277cb5a328d0f6f76447eeb927e6db54122452ca7d18a4c5bab235` |
| 设计集提交 | `80732aa` 先冻结数据；`7cfe6a8` 再提交实现、设计结果和阈值 |
| 盲测隔离 | 只有 `7cfe6a8` 提交存在后才执行 BLIND；盲测后未修改数据、算法、权重或阈值 |
| 证据边界 | 1 张现有 PublicCard 的公开安全问法 + 4 张纯合成 fixture；不是实际多卡验收 |

## 算法与阈值

| 算法 | 冻结阈值 | DESIGN 单候选 | DESIGN 歧义全覆盖 | BLIND 单候选 | BLIND 歧义全覆盖 | BLIND 门 |
|---|---:|---:|---:|---:|---:|---|
| char n-gram | 0.354392 | 90% | 25% | 30% | 0% | FAIL |
| BM25 | 0.787516 | 100% | 75% | 90% | 33.3% | FAIL |
| Apple NL embedding zh | 0.827149 | 60% | 0% | 20% | 0% | FAIL |
| hybrid（0.35 BM25 + 0.65 embedding） | 0.801233 | 85% | 25% | 80% | 0% | FAIL |

四种算法在 BLIND 上均满足：MISS 假阳性 0、hard-negative 假阳性 0、DENY 旁路 100%、安全候选输出 100%。失败集中在自然改写和多候选覆盖，不是通过放宽安全门换来的。

Apple baseline 使用 macOS NaturalLanguage `NLEmbedding.sentenceEmbedding(for: .simplifiedChinese)`，并把 distance 转为 `max(0, min(1, 1 - distance))`。它是本机平台基线，不是跨平台依赖；能力依据见 [Apple NLEmbedding 官方文档](https://developer.apple.com/documentation/naturallanguage/nlembedding)。

## BM25 盲测失败分析

BM25 只失败 3 条：

| case | 预期 | 关键分数 | 原因 |
|---|---|---|---|
| `RET-B-006` | sandbox 单候选 | sandbox `0.759539` | 英中混合 `approval / sandbox policy` 低于阈值 |
| `RET-B-011` | AGENTS + instruction-scope | scope `0.930839`；AGENTS `0.762437` | 主候选通过，第二候选低于阈值 |
| `RET-B-012` | AGENTS + sandbox | sandbox `0.785920`；AGENTS `0.759925` | 两个合理候选都略低于 `0.787516` |

事实：这 3 条的目标分数都集中在 `0.759—0.786`，而冻结阈值是 `0.787516`。观点：当前阈值对自然改写和第二候选过于脆弱；但盲测后直接降阈值会污染 holdout，因此 v1 不做这种修改。

## 安全不变量验收

- 召回候选只投影 `card_id / public_question / scope_hint`；测试确认不含 score、aliases、正文或来源。
- `DENY_PRIVACY / DENY_INJECTION / DENY_INDEX_DRIFT` 在召回前旁路；即使精确语义命中也不执行召回。
- 显式文件标识必须相容：查询点名 `README.md` 时，AGENTS-only 候选分数为 0。
- 现有精确 loader 未改动；完整 `node --test` 为 72／72 PASS，其中原有 64 项全绿。
- 分数从未触发 `ALLOW` 或正文读取；`CANDIDATE` 仍只是候选集合。

## G10 决策选项

### A. 保留 HOLD，在 Phase 1 做 v2（推荐）

- 批准 v1 数据、协议、实现和失败报告为有效证据。
- 不批准当前算法进入 Phase 2。
- v1 blind 从此只作已观察回归集，不再宣称 blind。
- v2 在实现前冻结新的 holdout、阈值稳健性规则和歧义扩展规则；比较 BM25、BM25 + 确定性 query expansion／keyword fallback，并保持 0 MISS／hard-negative 假阳性。
- v2 通过后重新提交 G10，不自动降低门槛。

### B. 接受 BM25 `0.787516` 进入 Phase 2（不推荐）

风险是合成歧义盲测有 `2/3` 漏召回，后续语境裁决拿不到必要候选。它虽然安全保守，但不满足已冻结的正验收。

### C. 用本次 blind 直接下调阈值（拒绝）

这会把 holdout 变成调参集，得到的“通过”不再是盲测证据。若要采用更低阈值，必须进入 v2 并使用全新 holdout。

## 停点

当前状态保持 `HOLD_AT_G10`。未修改运行时 loader、PublicCard、schema 或合同；未 push、开 PR、merge、发布或触达社区。Owner 未书面选择 G10-A／B 前，不进入 Phase 2。
