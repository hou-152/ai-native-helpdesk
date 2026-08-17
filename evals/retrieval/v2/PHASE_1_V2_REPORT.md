# Phase 1 v2 报告：G10 复审包

> 结论：`PASS_CANDIDATE_AWAITING_G10_OWNER_APPROVAL`
> 实现／阈值冻结 commit：`573cc1c0b16364db4a65e59221aa8f74c3b259a7`
> holdout seed：`113934ff03946cec75b58070abb0da0f187943b7d34a52e21701c46659e4fa49`
> 推荐算法：`bm25_expansion_keyword`
> 推荐阈值：`0.8449460370411592`

## 结论

推荐通过 G10，批准 `bm25_expansion_keyword@0.8449460370411592 / top_k=3` 作为 Phase 2 的召回选型输入。

该方案先在 v1 全部 60 条已观察回归上形成 `0.175681` 的正负安全间隔，再在绑定实现 commit 后生成的 30 条全新 holdout 上通过全部冻结门。它不修改确定性 loader，不读取正文，不输出 score／aliases，只返回 G5 白名单候选元数据。

批准 G10 仍不等于生产接入、真实多卡验收、PublicCard 发布或用户问题已解决。当前跨卡材料包含 4 张 synthetic fixture，只证明合成机制。

## 提交与不可变收据

| 层 | 收据 |
|---|---|
| v2 协议先冻结 | `1182bd632f27752a15a22fbff7549b348f9eb27d` |
| v2 实现／阈值后冻结 | `573cc1c0b16364db4a65e59221aa8f74c3b259a7` |
| holdout spec SHA-256 | `6e5a054fef65db1777d8b6582e86b56763bda2b4c9719b3936ab3139bafde82d` |
| frozen config SHA-256 | `3da70dc360811ec368b72977c7249c38f8be4c2087f21402336a501a452a3a71` |
| implementation-bound seed | `113934ff03946cec75b58070abb0da0f187943b7d34a52e21701c46659e4fa49` |
| holdout SHA-256 | `2a021b68328a4a5a07da48aa7c7217ca2f140d351cc4efd1c28f2559ec090b80` |
| holdout report SHA-256 | `db2f788497acd0c6308f5654275b7ab83cb0c01877887a001be6c4e311d5da89` |

顺序是：先提交协议 → 只用旧数据实现并冻结算法／阈值 → 由实现 commit 生成 seed 和 30 条 query → 首次执行 holdout → 固化结果。holdout 生成后没有修改算法、阈值、扩展表、keyword 规则、spec、query 或标签。

## 已观察回归结果（60 条）

| 方案 | 正例最低分 | 负例最高分 | 间隔 | 单候选 | 单候选 exact | 歧义覆盖 | MISS FP | 资格 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `bm25_v1` | 0.728002 | 0.757105 | -0.029103 | 30/30 | 18/30 | 6/7 | 1/17 | FAIL |
| `bm25_expansion` | 0.759925 | 0.757105 | 0.002820 | 30/30 | 19/30 | 7/7 | 0/17 | FAIL：间隔不足 |
| `bm25_keyword` | 0.728002 | 0.757105 | -0.029103 | 30/30 | 18/30 | 6/7 | 1/17 | FAIL |
| `bm25_expansion_keyword` | 0.932787 | 0.757105 | 0.175681 | 30/30 | 26/30 | 7/7 | 0/17 | PASS |

只有 combined 方案达到预注册的 `separation ≥ 0.05`。query expansion 单独看似 60/60 通过，但安全间隔只有 `0.002820`，因此没有资格进入 holdout 选型；这避免重演 v1 的贴线阈值问题。

## 全新 holdout 结果（30 条）

| 方案 | 单候选 hit | exact-set | 歧义覆盖 | 歧义 exact | MISS FP | hard-negative FP | DENY | holdout 门 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `bm25_v1` | 15/15 | 8/15 | 6/6 | 4/6 | 1/6 | 1/5 | 3/3 | FAIL |
| `bm25_expansion` | 15/15 | 8/15 | 6/6 | 4/6 | 0/6 | 0/5 | 3/3 | FAIL：observed 未获资格 |
| `bm25_keyword` | 15/15 | 8/15 | 6/6 | 4/6 | 1/6 | 1/5 | 3/3 | FAIL |
| `bm25_expansion_keyword` | 15/15 | 11/15 | 6/6 | 5/6 | 0/6 | 0/5 | 3/3 | PASS |

四个方案的安全候选输出率均为 100%。`bm25_v1` 和 keyword-only 的假阳性来自同产品硬负例；combined 在不降低阈值的情况下拒绝该用例。

## 推荐配置

```json
{
  "algorithm": "bm25_expansion_keyword",
  "threshold": 0.8449460370411592,
  "top_k": 3,
  "explicit_file_identifier_compatibility": "required",
  "candidate_output": ["card_id", "public_question", "scope_hint"]
}
```

确定性 query expansion 只追加规范词；keyword 必须命中一张卡的两个不同语义组才加分。二者都只是内部召回证据，不授予卡片适用性、发布资格或正文读取权。

## G10 推荐裁决

建议 Owner 书面批准：

1. Phase 1 v2 的协议、阈值、holdout 和证据边界通过；
2. 召回选型为 `bm25_expansion_keyword@0.8449460370411592 / top_k=3`；
3. 允许进入 Phase 2，按 G3 顺序实现语境裁决、一次区分问题、自然语言去向和 G6 外部回退合同；
4. Phase 2 不得把本算法直接接成 `ALLOW`，不得声称真实多卡或社区验收；
5. 若后续真实卡索引分布使正负间隔消失，必须重新评测，不沿用 fixture 阈值冒充生产阈值。

## 当前停点

状态为 `AWAITING_G10_OWNER_APPROVAL`。运行时 loader、PublicCard、公开 schema、contracts 均未修改；没有 push、PR、merge、发布或社区触达。Owner 通过 G10 前不进入 Phase 2。
