# Phase 1 v2 Packet：BM25 稳健阈值与确定性扩展

> 状态：`PROTOCOL_FROZEN_BEFORE_V2_IMPLEMENTATION`
> 冻结时间：2026-08-18 04:07 +08:00
> Owner 决策：G10-A；认可 v1 证据，禁止接入 Phase 2，授权在 Phase 1 内做 v2
> 下一停点：G10 复审；本 packet 不授权进入 Phase 2

## 1. 结论与目标

v1 不覆盖、不重标、不重跑成“新 blind”。v2 只解决 v1 已暴露的两个问题：

1. BM25 的阈值靠近自然改写和第二候选分数，缺少稳健间隔；
2. 英中混合、同义表达和并列歧义会压低目标候选，但不能用降低 MISS／hard-negative 安全门来补召回。

v2 比较 `bm25_v1 / bm25_expansion / bm25_keyword / bm25_expansion_keyword`。只有某方案先在全部已观察 v1 数据上形成正负分数安全区间，再在提交后生成的全新 holdout 上通过，才可提交 G10 复审。

## 2. 基线、真源与权限

- 远端运行真源：`origin/main@2667fdc30599700310fd3f9ca47c7e1d590b0e70`
- 本地分支基线：`codex/phase1-retrieval-eval@1a0f7bc783d3fe3d8452b74dabfaae058d63a3d4`
- v1 数据冻结：`80732aab2d77b947e12c94c8c9418a72651b64f4`
- v1 实现／阈值冻结：`7cfe6a8ea292df488d82f9a1081b9f0329229f39`
- v1 盲测报告：`1a0f7bc783d3fe3d8452b74dabfaae058d63a3d4`，状态 `HOLD_AT_G10`
- 输入权限：只使用公开仓库材料、v1 的公开安全／合成数据和 v2 合成生成规范；不读取原始群聊、私域候选或成员信息

## 3. v1 不可变保护

下列文件是 v2 的受保护输入；任一 hash 漂移即停止：

| 文件 | SHA-256 |
|---|---|
| `evals/retrieval/golden.v1.json` | `7b37a9a301b6b570e7c87578694df5dbef90b3720e62fb6b1dbdd0531965b51c` |
| `evals/retrieval/fixture-index.v1.json` | `3c00560b888b013621d54c7ee55a977e3c5b2a9bcb9464b190a06aa4aada06fe` |
| `evals/retrieval/frozen-config.json` | `8e1575a2ef277cb5a328d0f6f76447eeb927e6db54122452ca7d18a4c5bab235` |
| `evals/retrieval/blind-report.json` | `43a45e08970a343ead846013e40f734fc183dcdbf5f355b3050bbe9877fce47b` |
| `evals/retrieval/retrieval.mjs` | `e451c4ece1b28c4a92fd718033c14bbd701ae27413cbb89b474271d4dec93fdf` |
| `evals/retrieval/run-eval.mjs` | `d68176eb433d9b0392558896aecac9c1c514dac17e5dbf9befd89996f7c606c2` |

v1 的 DESIGN 40 条和旧 BLIND 20 条在 v2 中统一标为 `OBSERVED_REGRESSION`。旧 BLIND 可用于定位已知失败，但永久失去 blind 身份。

## 4. 文件白名单与非目标

允许新增或修改：

- `evals/retrieval/v2/**`
- `schemas/retrieval-eval-v2.schema.json`
- `tests/retrieval-v2.test.mjs`
- `PROGRESS.md` 中 Phase 1 v2 的事实状态

禁止修改：第 3 节全部 v1 文件、`knowledge/public/**`、`schemas/public-card.schema.json`、`scripts/query-public-card.mjs`、`contracts/**`、`SKILL.md`、`README.md`。

本 Phase 不发布卡片、不接生产路由、不触达社区、不 push／开 PR／merge，也不实现 Phase 2 合同。

## 5. 冻结算法边界

四个方案共享：v1 NFKC 规范化、显式文件标识相容约束、BM25 主分数、top 3、安全候选投影和召回前 DENY 旁路。

| 方案 | 允许增加的能力 |
|---|---|
| `bm25_v1` | 无；原实现对照 |
| `bm25_expansion` | 冻结的确定性中英词／短语扩展，只追加规范词，不删除用户原词 |
| `bm25_keyword` | 每张 fixture 的确定性意图词组匹配；至少命中两个不同语义组才可加分 |
| `bm25_expansion_keyword` | 同时使用上述两层；显式文件不相容仍强制为 0 |

扩展和 keyword 只改变内部排序分数，不输出规则、词表或 score，不授予 `ALLOW`，也不能绕过 loader、DENY 或 index-card drift。

## 6. v2 阈值协议

每个方案只用 60 条 `OBSERVED_REGRESSION` 计算：

- `negative_ceiling`：所有 ELIGIBLE／MISS 用例的最高候选分数最大值；
- `positive_floor`：所有 CANDIDATE 目标分数，以及所有 CLARIFY 预期候选分数的最小值；
- `separation = positive_floor - negative_ceiling`；
- 只有 `separation ≥ 0.05` 才有资格冻结；
- `threshold = (positive_floor + negative_ceiling) / 2`，禁止取贴近某一侧的极值阈值。

冻结前必须同时满足：CANDIDATE `30/30`、CLARIFY `7/7` 全候选覆盖、MISS 假阳性 `0/17`、hard-negative 假阳性 0、DENY 旁路 `6/6`、安全投影 100%。这里的 60 条包含 v1 全部已观察用例，不再分 design／blind。

若没有方案形成 0.05 安全间隔，不生成新 holdout，v2 直接 HOLD。

## 7. 全新 holdout 的预注册生成

生成规范真源是 `holdout-spec.v2.json`，生成器是 `generate-holdout.mjs`。两者必须先于算法实现提交。

算法与 `frozen-config.v2.json` 提交后：

1. 以该实现 commit 的完整 SHA、规范 hash 和固定 namespace 计算 seed；
2. 生成器从预注册 family／template／slot 组合中确定性选择 30 条查询；
3. 使用排他创建生成 `holdout.v2.json`，文件已存在时拒绝覆盖；
4. 生成后不改 query、标签、阈值、扩展词表或 keyword 规则；
5. 只执行一次初始 holdout，并提交原始逐案报告。

30 条分布固定为：CANDIDATE 15、CLARIFY 6、MISS 6、DENY 3。组合词汇在规范中公开，因此它是“commit-seeded prospective synthetic holdout”，不是外部独立人审；只证明合成机制稳健性。

## 8. v2 holdout 门与推荐顺序

必须同时满足：

- CANDIDATE hit@3 ≥ `13/15`；
- CANDIDATE exact-set ≥ `10/15`；
- CLARIFY full-coverage@3 ≥ `5/6`；
- MISS 假阳性 `0/6`；
- hard-negative 假阳性 0；
- DENY 旁路 `3/3`；
- 安全候选输出 100%；
- 原有 loader 与 v1／v2 测试全绿；
- fixture 结果仍只表述为机制证据。

通过方案按以下冻结顺序选机械 front runner：CLARIFY 覆盖更高 → CANDIDATE 命中更高 → CANDIDATE exact-set 更高 → 实现更简单，简单度顺序为 `bm25_v1 > bm25_expansion > bm25_keyword > bm25_expansion_keyword`。

## 9. 提交顺序、回滚与停点

1. commit A：本 packet、schema、holdout spec 和生成器；不得包含生成后的 holdout。
2. commit B：v2 算法、测试、observed report 和冻结阈值；此时尚无 holdout。
3. commit C：生成的 holdout、一次性报告和 G10 复审包。

任一 v1 hash 漂移、无安全间隔、holdout 已存在、seed／implementation commit 不一致、MISS／DENY／安全门失败，立即停止。删除 v2 新文件即可回滚；v1 和运行时始终不变。

完成后停在 G10 复审。只有 Owner 书面批准算法、阈值和证据边界，才允许进入 Phase 2。
