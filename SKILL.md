---
name: ai-native-helpdesk
description: 面向 AI／Agent／OpenClaw 社区的薄入口 Helpdesk Skill。负责守门、判模、按需加载合同，并只通过确定性发布门读取 PublicCard。
version: 0.6.1-phase4-staging
status: G13A_APPROVED / 本地正式三卡包 / Phase 4 机制完成 / 等待合格真实问题 / G13b 未开启
author: 减
license: internal
---

# ai-native-helpdesk v0.6.1-phase4-staging

> 当前已实现 PublicCard 机器发布门，本地功能分支有 3 张经 G12 逐卡批准的正式卡。三卡本地可用不等于远端已发布、完整知识库上线，也不等于已经完成真实社区端到端验证或解决了用户问题。

## 这是什么

用于 AI／Agent／OpenClaw 相关社区的薄入口 Skill。AI Native 社区可以提供经过筛选的共同知识来源，但任何群聊原文、成员标识和内部审核材料都不得进入公开运行包。

只做 6 件事：

1. 守门：识别安全、隐私、不可逆和动态事实风险。
2. 判模：选择 1 个主路由。
3. 按需加载对应 contract。
4. knowledge 路由只通过确定性脚本查询已发布 PublicCard。
5. 用 Phase 2 回合合同复验追问次数、自然语言去向和外部来源证据；用 Phase 3 生产门阻断未授权 Candidate。
6. 在公开仓库外用 Phase 4 追加式账本记录 MISS 与反馈；没有真实有效反馈时不生成候选。

## 这不是什么

- 不是个人 Agent 记忆。
- 不是群聊原文搜索器。
- 不是全量加载的诊断框架。
- 不是已经有内容的成熟知识库。
- 不是用测试通过代替人工发布批准的自动发布器。

## 目录

```text
ai-native-helpdesk/
├── SKILL.md
├── contracts/
│   ├── good-question.md
│   ├── thinking.md
│   ├── action.md
│   ├── knowledge.md
│   ├── public-card.md
│   └── safety.md
├── schemas/public-card.schema.json
├── schemas/knowledge-production.schema.json
├── schemas/feedback-event.schema.json
├── scripts/query-public-card.mjs
├── scripts/knowledge-production.mjs
├── scripts/feedback-ledger.mjs
├── policies/external-sources.v1.json
├── schemas/helpdesk-turn-contract.schema.json
├── schemas/external-source-policy.schema.json
├── scripts/helpdesk-turn-contract.mjs
└── knowledge/public/index.json
```

## 主路由

| 用户问题类型 | 主路由 | 加载合同 |
|---|---|---|
| 缺失语境会改变答案／边界／风险／下一步 | good-question | `contracts/good-question.md` |
| 有假设／逻辑／原因要分析 | thinking | `contracts/thinking.md` |
| 知道该做但做不动 | action | `contracts/action.md` |
| 查询 AI／Agent／OpenClaw 事实 | knowledge | `contracts/knowledge.md` |
| 触发安全红线 | safety | `contracts/safety.md` |

混合信号可以记录多个标签，但本轮只执行 1 个主路由。

默认直接回答。只有能明确指出一个缺失事实会改变处理路径时才加载 good-question；通过追问门后只问 1 个区分问题。同一歧义允许重述 1 次，再不知道就保留未知。

## 守门

每次触发依次检查：

1. 安全红线：迫近的自伤、他伤或违法实施意图直接转 safety。
2. 隐私红线：出现他人隐私时先脱敏。
3. 不可逆行动：删除、转账、全量发送等必须暂停确认。
4. 动态事实：当前价格、政策、版本、官方号码必须核验官方来源。
5. 个人信息保存：必须获得用户明确同意。

优先级：安全 > 隐私 > 不可逆 > 动态事实 > 个人信息。

## 合同加载 fail-closed

入口只按需读取对应 contract。合同不存在或读取失败时：

- 禁止根据入口摘要模拟合同输出。
- 明确告知模块暂不可用。
- 不跨到另一个模块假装完成。

入口只负责路由和一句理由；被加载的 contract 负责完整回答与一个最小下一步。

## PublicCard 发布门

knowledge 路由必须先读取 `contracts/public-card.md`，再调用 `scripts/query-public-card.mjs`。禁止直接 `read_file` 任何知识卡正文。

只有四门精确通过才可能返回正文：

```text
editorial = APPROVED
verification = PASS
privacy_gate = PASS
publication = READY
```

- `ALLOW`：使用脚本返回的安全字段；动态事实仍需当前核验。
- `MISS`：可以进入获准外部回退或低风险、非动态模型推理，不假装命中。
- `DENY`：说明知识卡分支暂不可用，不读取、不模拟、不自动回退成被拒卡答案。

公共包随 Skill 分发；社区本地包必须由调用者显式给出路径。同一问题命中多卡时拒绝，不设置静默覆盖顺序。

Phase 1 已由 Owner G10 选择 `bm25_expansion_keyword@0.8449460370411592 / top_k=3` 作为候选召回方案，并通过 synthetic holdout 与 G12 后真实三卡观察回归。它仍不能从分数直接触发 `ALLOW` 或正文读取；宽召回必须先经过适用性裁决。

PublicCard schema B 为 `0.4`，新增安全 `scope_hint`、判断框架、常见错误、行动原则和验证方法。index 同时绑定 revision、完整文件 hash 和 scope_hint；任一漂移均 `DENY`。G12 已批准 000001 v1.1.0、000002 v1.0.0、000003 v1.0.0，本地正式 index 精确绑定这三张卡。

## Phase 3 生产门

`scripts/knowledge-production.mjs` 只处理不含正文的控制收据：普通路径要求 Owner-authorized Candidate；`MISS` 路径额外要求 `ADOPTED / OUTCOME_REPORTED`、获批答案候选与人工提炼。公开投影还要求 100% 人工 QA、四门和逐卡 Owner 发布决定。机器 `PASS`、G11 或候选内容都不能代签 G12。

## Phase 4 反馈账本

`scripts/feedback-ledger.mjs` 只向公开仓库外的受控路径追加 hash-chain 事件。反馈等级、候选、人工提炼、发布、索引、后续 ALLOW、验证失败、撤回、过期和更正均通过重放计算；历史事件不能原地修改。

CLI 不回显 payload。`ACKNOWLEDGED`、无反馈模型答案和包含原回答正文的候选会 fail-closed。只有真实 `ADOPTED / OUTCOME_REPORTED` 才能开启实际候选链；synthetic 完整测试最多声明 `mechanism_loop_complete`，不能声明 `real_loop_complete`。G13a 已授权 1 个真实用户／1 个真实问题的受控采集；当前尚未收到明确纳入本轮的 Helpdesk turn，因此 G13b 未开启。

G13b 前的完整 rehearsal 使用隔离的 `STAGING_DECISION / STAGING_INDEX_RESULT / STAGING_ALLOW_RESULT`。隔离链只能产生 `isolated_*` 状态，不能设置正式 `publication_state / index_state / allow_state / serving_eligible`；staging 明确保留 `g13b_status = PENDING`。只有 G13b 逐项批准后，才能写正式 `PUBLICATION_DECISION` 并重新验证正式 index 与 loader。

## Phase 2 回合合同

合同裁决器：

```bash
node scripts/helpdesk-turn-contract.mjs \
  --input "/path/to/turn.json" \
  --policy policies/external-sources.v1.json
```

外部检索器只负责取得证据；本脚本复验：

- 是否只有缺失语境改变路径时才追问，且本轮恰好 1 问；
- 同一歧义是否已达到一次重述上限；
- 8 种内部去向是否有不含机器标签的自然语言说明；
- `MISS`／`DENY`／隐私拒绝是否遵守独立路由边界；
- 外部来源是否在有效 allowlist、时效和风险范围内；
- 高风险／动态事实是否禁止纯模型确定性结论；
- 混合答案是否保留逐 claim 的 `PUBLIC_CARD / EXTERNAL_VERIFIED / MODEL_REASONING`。

合同 `CONTRACT_PASS` 只证明这些结构化行为通过，不替代 PublicCard loader、来源内容判断、Owner 批准或用户结果。策略缺失、过期、解析失败或证据越界时返回 `FAIL_CLOSED`，清空 claims，并自然语言转向核验、升级、补信息或未知。

## 状态维度

每次输出仍保持四个独立维度：

| 维度 | 取值 |
|---|---|
| `brief_state` | `NEEDS_INPUT` / `READY` |
| `task_mode` | `ANSWER` / `ROUTE` / `AUTOMATION_ASSESS` |
| `automation_level` | `AUTO_HIGH` / `AUTO_SEMI` / `AUTO_ASSIST` / `AUTO_NOT_READY` |
| `destination` | `DO` / `VERIFY` / `WAIT` / `STOP` / `NO_ACTION_NEEDED` / `NEEDS_INPUT` / `UNKNOWN` / `ESCALATE` |

`brief_state = READY` 必须对应可执行的问题说明书，不能把半成品标成 READY。

## 失败规则

| 场景 | 动作 |
|---|---|
| Contract 缺失 | 明确不可用，不模拟 |
| PublicCard 门返回 `DENY` | 不读正文，不模拟卡片 |
| PublicCard 门返回 `MISS` | 按外部回退合同继续，不伪装成命中 |
| 多个主路由 | 本轮只执行 1 个 |
| 信息不足但不改变路径 | 直接回答，不例行追问 |
| 信息不足且改变路径 | good-question 只问 1 个 |
| 同一歧义重述后仍不知道 | `UNKNOWN`，停止追问 |
| 外部策略或证据门失败 | `VERIFY / ESCALATE / UNKNOWN`，不继续确定性结论 |
| 用户补充信息 | 重新守门、判模、加载合同 |

## 当前状态

- 发布门代码和合成测试：已建立。
- Phase 1 召回选择：Owner G10 已通过；synthetic holdout 与 G12 后真实三卡观察回归均通过，仍须在 loader 前做适用性裁决。
- Phase 2 回合与外部来源合同：G11 已通过；当前仍是本地分支能力。
- Phase 3 schema B、生产门与正式三卡错配：G12 已通过，本地验证通过。
- 公开 PublicCard：本地功能分支 3 张，尚未进入远端 `main`。
- 两张新卡：已按 G12 指定 revision 进入本地正式 index。
- Phase 4 反馈账本与回滚：机制完成；23 项定向测试通过，包含 G13b 前 staging／formal 状态隔离。
- Phase 4 真实闭环：`G13A_APPROVED / AWAITING_QUALIFIED_HELPDESK_TURN`；没有实际查询、候选／修订／撤回清单，G13b 未开启。
- 社区真实端到端验证：未完成。
- 群聊候选、内部证据和审核材料：不属于公开仓库。

## 修订记录

| 版本 | 状态 | 改动 |
|---|---|---|
| v0.1—v0.2.2 | 已废弃 | 历史设计 |
| v0.2.3-trial | TRIAL | 薄入口和 5 个子合同 |
| v0.3.0-gate-trial | GATE_TRIAL | PublicCard schema、确定性发布门、公共／社区包边界 |
| v0.4.0-phase2-candidate | PHASE_2_CANDIDATE | 追问门、8 种回合去向、G6 外部来源政策与逐 claim 来源合同 |
| v0.5.0-phase3-candidate | PHASE_3_CANDIDATE | schema B、index 完整性绑定、双生产路径、首批 100% QA 与 G12 停点 |
| v0.5.1-phase3-published | G12_APPROVED | 首批三卡本地正式投影、loader 后验收与真实卡错配回归 |
| v0.6.0-phase4-mechanism | REAL_LOOP_HOLD | 追加式反馈账本、候选门、状态重放与回滚；无真实反馈时停止 |
| v0.6.1-phase4-staging | G13A_APPROVED | G13b 前隔离 rehearsal 与正式发布／服务状态分离 |
| G13a control receipt | AWAITING_REAL_TURN | Owner 授权 1 用户／1 问题受控采集；不自动纳入工程讨论 |

后续 PublicCard 仍须逐张独立完成内容修正、真实验证、隐私审查和 Owner 发布批准；首张卡通过不能让其他候选自动晋级。
