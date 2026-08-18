# Phase 2 冻结执行包：语境裁决、回合去向与外部回退

冻结时间：`2026-08-18 04:26:40 +08:00`

## 开工授权与基线

- Owner G10 回执：`按推荐通过 G10，进入 Phase 2。`
- Phase 1 基线：`96527479fd1b0465d172400e2b9245bb084c8c03`。
- 远端 `main` 基线：`2667fdc30599700310fd3f9ca47c7e1d590b0e70`。
- 获批召回器：`bm25_expansion_keyword`，阈值 `0.8449460370411592`，`top_k = 3`。
- 获批边界：召回器只返回候选 ID 和安全元数据；分数不能触发 `ALLOW`、正文读取或用户语境裁决。
- 实现分支：`codex/phase2-context-fallback`；本阶段不 push、不开 PR、不 merge。

Phase 1 的 30 条 holdout 是 synthetic mechanism 证据，不是实际多卡、外部独立人审、社区端到端或用户效果证据。

## Phase 2 目标

把以下行为从原则变为可执行、可失败的合同：

1. 默认直接回答；只有缺失语境会改变答案、适用边界、风险或下一步时才问。
2. 每轮最多提出 1 个结构化区分问题；同一歧义只允许重述 1 次，再不知进入 `UNKNOWN`。
3. 内部保存 `DO / VERIFY / WAIT / STOP / NO_ACTION_NEEDED / NEEDS_INPUT / UNKNOWN / ESCALATE`，对用户只输出可理解的自然语言去向。
4. `MISS` 可进入获准外部回退；`DENY` 不自动回退；隐私拒绝后不得外发原查询。
5. 外部回退绑定版本化 allowlist、来源 Owner、允许风险、最大时效、检索时间和失效条件。
6. 组合答案按 claim 保存 `PUBLIC_CARD / EXTERNAL_VERIFIED / MODEL_REASONING`；高风险或动态事实不得由未验证模型推理给出确定性结论。

## 冻结接口

新增一个独立的 Phase 2 合同裁决器。输入只包含当前回合的结构化事实、候选状态、追问历史、来源证据和待输出 claim；输出包含：

- `contract_status`：合同可执行或 fail-closed；
- `internal_destination`：8 种内部去向之一；
- `user_destination`：不含机器标签的自然语言去向；
- `question`：`null` 或恰好 1 个区分问题；
- `claims`：逐 claim 来源保留，不生成整段统一来源；
- `reason_codes`：机器可审计的失败原因。

裁决器不代替 PublicCard loader，不读取私域语料，不发起网络请求，不把候选分数当授权。外部检索执行器必须把本轮证据及检索时间交给本合同复验。

## 冻结状态规则

### 追问门

| 输入事实 | 必须结果 |
|---|---|
| 缺失语境不改变路径 | 直接回答；不得进入 `NEEDS_INPUT` |
| 缺失语境改变路径，尚未问过 | `NEEDS_INPUT`；本轮恰好 1 问 |
| 初问后仍不知道 | 可重述 1 次；本轮恰好 1 问 |
| 重述后仍不知道 | `UNKNOWN`；不得继续追问 |
| 候选处理路径相同 | 不为表述差异追问 |
| 候选处理路径不同且无法排除 | 进入上述一次区分问题流程 |

### 外部回退

| 场景 | 必须结果 |
|---|---|
| `MISS` 且独立安全／隐私门通过 | 可使用 allowlist 内有效来源 |
| `DENY` 且没有独立外部路由授权 | 不回退 |
| `QUERY_PRIVACY_DENY` | 不外发原查询；`NEEDS_INPUT` |
| 策略缺失、过期、不可解析 | fail-closed 到 `VERIFY / ESCALATE / UNKNOWN` |
| 非 allowlist 或来源已失效 | 不得标为 `EXTERNAL_VERIFIED` |
| 动态或高风险证据不是本回合取得 | 不得给确定性结论 |
| 高风险／动态 `MODEL_REASONING` | 不得给确定性结论 |
| 混合来源 | 逐 claim 保留来源，不得整体标成知识库命中 |

## 冻结验收矩阵

正验收至少覆盖：

- 不需要语境时直接答；需要时只问 1 个问题；重述后停止追问。
- 8 个去向均能生成自然语言说明，用户文案不含机器标签。
- `MISS` 使用有效 allowlist 来源；稳定事实在允许时效内可用。
- 动态／高风险事实使用同一回合取得的有效官方证据。
- `PUBLIC_CARD + EXTERNAL_VERIFIED + MODEL_REASONING` 混合回答仍保留逐 claim 来源。

反验收与失败注入至少覆盖：

- 例行追问、从不追问、一次输出多个问题、第二次重述后继续问。
- 用 `DO` 等标签代替自然语言去向。
- `DENY` 自动回退、隐私拒绝后外发原查询。
- 策略文件缺失、JSON 解析失败、schema 不合、过期。
- 非 allowlist URL、inactive 来源、过期证据、未来时间、版本事实未绑定版本。
- 高风险／动态事实由纯模型推理给出确定性结论。
- 只写“建议核实”但 claim 仍标为确定、组合答案整体冒充 `PUBLIC_CARD`。

所有原有 loader 和 Phase 1 测试必须保持通过。新增测试使用虚构输入和公开 URL，不含真实群聊、成员、凭证或私域证据。

## 计划文件白名单

- `evals/phase2/**`
- `policies/external-sources.v1.json`
- `schemas/helpdesk-turn-contract.schema.json`
- `schemas/external-source-policy.schema.json`
- `scripts/helpdesk-turn-contract.mjs`
- `tests/helpdesk-turn-contract.test.mjs`
- `contracts/good-question.md`
- `contracts/thinking.md`
- `contracts/action.md`
- `contracts/knowledge.md`
- `SKILL.md`
- `README.md`

PublicCard 卡片、公共索引、PublicCard schema 和确定性 loader 不在本阶段修改范围。

## 停点与回滚

- 任一冻结反验收无法变红再恢复为绿，Phase 2 保持 `HOLD`。
- 新合同不满足时保留 Phase 1 基线，不改 PublicCard loader 或正式卡片。
- 完成实现、失败注入、全量回归和报告后停在 Owner 门 G11；未经 G11 不进入 Phase 3。
