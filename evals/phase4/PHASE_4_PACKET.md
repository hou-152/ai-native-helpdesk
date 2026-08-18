# Phase 4 冻结执行包：MISS 反馈账本、状态回滚与真实证据停点

状态：`FROZEN_BEFORE_IMPLEMENTATION`

基线：`40b20919d97ccd81d2788291da3aa91e6c0b2dd3`

Owner 前置回执：`按推荐通过 G12：批准 schema B、QA rubric 和首批 000001／000002／000003；批准 000001 v1.1.0、000002 v1.0.0、000003 v1.0.0 逐卡发布。先完成正式三卡投影与真实错配回归，通过后进入 Phase 4。`

G12 后置证据：本地正式三卡包和 15 条真实卡观察回归通过；全量测试 155／155 PASS。

## 1. 本阶段只证明什么

Phase 4 建立私密受控位置使用的追加式 MISS 反馈账本、反馈等级边界、候选生成门、卡片更新／撤回／过期／验证失败／索引失败的状态迁移和可重放证据。公开仓库只保存合同、实现、虚构测试与聚合收据，不保存真实用户原话、成员标识、私域引用或真实反馈账本。

本阶段不能用模型判断、G12 批准、测试 fixture、礼貌回应或当前工程对话冒充真实 Helpdesk 反馈。只有可追溯的真实 `ADOPTED / OUTCOME_REPORTED` 事件，才允许开启实际 `ANSWER_CANDIDATE` 链。

## 2. 事件合同

账本使用 JSON Lines；每行是完整事件，绑定上一事件 hash 和自身 hash。事件只能追加，不能原地改写。更正必须新增 `CORRECTION` 并指向旧事件；重放结果同时保留历史等级和当前有效等级。

事件类型冻结为：

- `DEMAND_GAP`：记录真实 MISS、最小必要需求摘要、来源引用 hash 与隐私边界。
- `FEEDBACK`：只按可观察信号记录 `ACKNOWLEDGED / ADOPTED / OUTCOME_REPORTED`。
- `ANSWER_CANDIDATE`：只在有效等级为 `ADOPTED / OUTCOME_REPORTED` 后生成控制收据；禁止包含原回答正文。
- `HUMAN_DISTILLATION`：记录人工提炼是否通过，不保存私域正文。
- `PUBLICATION_DECISION`：记录新卡或既有卡修订的指定 revision、四门和 Owner 决定。
- `INDEX_RESULT`：记录索引成功或失败；失败后不得沿用旧成功声明。
- `ALLOW_RESULT`：记录后续 loader 的真实 `ALLOW` 观察，不等于用户目标解决。
- `VERIFICATION_RESULT`：验证失败时撤销 serving eligibility，历史成功仍保留但不再有效。
- `WITHDRAWAL`：显式撤回指定 revision。
- `EXPIRY`：显式标记指定 revision 过期。
- `CORRECTION`：追加更正反馈等级；不得删除或覆盖旧事件。

每个事件至少保存：`event_id`、`chain_id`、`event_type`、`occurred_at`、`source`、`privacy`、`payload`、`previous_event_hash` 和 `event_hash`。CLI 只输出稳定 ID、hash、状态与 reason code，不回显需求摘要或私密 payload。

## 3. 反馈等级与候选门

| 可观察信号 | 原始等级 | 能否生成候选 |
|---|---|---|
| 只有“谢谢／懂了／有道理” | `ACKNOWLEDGED` | 否 |
| 用户明确选择该判断或下一步 | `ADOPTED` | 是；仍不证明执行 |
| 用户自述实际动作与结果 | `OUTCOME_REPORTED` | 是；仍不等于客观效果 |
| 没有后续反馈 | 无新增等级 | 否 |

人工 override 必须记录 reviewer hash 与 reason code；override 也不能把 `ACKNOWLEDGED` 改写成客观效果。`ANSWER_CANDIDATE` 只保存来源、等级、候选 action 和控制引用；原问答正文必须留在私域证据系统并由人工提炼。

## 4. 状态迁移与回滚

### 新卡

```text
DEMAND_GAP
→ ADOPTED / OUTCOME_REPORTED
→ ANSWER_CANDIDATE
→ HUMAN_DISTILLATION PASS
→ PUBLICATION_DECISION 四门＋Owner APPROVED
→ INDEX_RESULT SUCCESS
→ ALLOW_RESULT ALLOW
```

### 既有卡修订

修订链必须声明 `asset_action = REVISE_CARD`、现有 revision 与目标 revision；索引成功前旧 revision 的当前状态不被静默重写。成功后重放结果才把目标 revision 标为 serving eligible。

### 失败与回滚

- `VERIFICATION_RESULT FAIL`：状态转为 `VERIFICATION_FAILED`，serving eligibility 为 false，要求修复或撤回。
- `INDEX_RESULT FAIL`：状态转为 `INDEX_FAILED`，不得报告 `INDEXED` 或继续追加有效 `ALLOW_RESULT`。
- `WITHDRAWAL`：状态转为 `WITHDRAWN`，后续 `ALLOW_RESULT` 无效。
- `EXPIRY`：状态转为 `EXPIRED`，后续必须重新验证和新 revision 审批。
- `CORRECTION` 将有效反馈降到 `ACKNOWLEDGED` 时，依赖该反馈的候选与后续发布链转为 `INVALIDATED_BY_CORRECTION`；历史事件仍可读回。

## 5. 正反验收

正向机制测试：

- 一条完全虚构的 `MISS → ADOPTED → ANSWER_CANDIDATE → 人工提炼 → 四门 → indexed → ALLOW` 链可重放；证据类必须写 `SYNTHETIC_MECHANISM`。
- 既有卡修订和撤回各有一条受控测试。
- 验证失败、过期、索引失败和反馈更正均有状态回滚测试。
- hash 链篡改、重复 ID、跨链引用、乱序和非法字段 fail-closed。

负向：

- “谢谢”晋级；
- 无反馈的模型答案生成候选；
- 用户自述被写成客观效果；
- 候选 payload 保存原回答正文；
- 索引失败后仍声明 indexed／ALLOW；
- 撤回或过期后继续 serving；
- 静默修改旧反馈等级；
- 私密 ledger 写入公开仓库。

## 6. 真实反馈停点

实施前只读检索范围：项目长期真源与状态文档、公开仓库 contracts／schemas／scripts／tests／evals，以及领域模型 accepted ADR；未读取或复制原始群聊、成员信息、私密 evidence 或未授权候选正文。

在上述合规范围内没有找到可复跑的真实 `ADOPTED / OUTCOME_REPORTED` 反馈。因此：

- 本阶段只实现合同、账本、状态机、虚构机制测试和 `NO_REAL_FEEDBACK` 聚合收据；
- 不生成真实 `ANSWER_CANDIDATE`，不修改三张正式卡，不扩 index；
- 不开启 G13 的实际候选晋级／修订／撤回清单；
- 真实反馈到达后必须另建受控私密 ledger，再重放完整链并提交逐项 G13 包。

## 7. 文件白名单

允许修改：

- `schemas/feedback-event.schema.json`
- `scripts/feedback-ledger.mjs`
- `tests/feedback-ledger.test.mjs`
- `evals/phase4/**`
- 与本阶段状态同步直接相关的 `README.md`、`SKILL.md`、`PROGRESS.md`、`BLOCKED.md`

禁止修改正式 PublicCard 正文和 `knowledge/public/index.json`。任何真实反馈账本、原始话术、私密引用、成员标识、`.env`、凭证或 evidence 不得写入公开仓库。
