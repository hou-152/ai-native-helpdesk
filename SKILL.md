---
name: ai-native-helpdesk
description: 面向 AI／Agent／OpenClaw 社区的薄入口 Helpdesk Skill。负责守门、判模、按需加载合同，并通过 BM25 检索候选池对话摘录提供相关上下文。
version: 0.10.0
status: KNOWLEDGE_ROUTE_SWITCHED_TO_CANDIDATE_POOL / PUBLIC_CARDS_ARCHIVED
author: 减
license: Apache-2.0
---

# ai-native-helpdesk v0.10.0-knowledge-pool

> knowledge 路由已从 PublicCard 切换到候选池 BM25 检索：8 张 PublicCard 已下线归档（保留历史，不物理删除），检索目标改为 `ai-native-knowledge-base` 的 2,153 条对话摘录候选池。摘录是 `CANDIDATE_ONLY / UNVERIFIED`，输出必须标注边界；MISS 时明确 `UNKNOWN` + 最小下一步。

运行时把本文件所在目录作为唯一 Skill 根目录；所有 contract、schema、policy、script 和候选池路径都相对于该目录解析，不猜测用户目录或固定全局安装路径。

## 这是什么

用于 AI／Agent／OpenClaw 相关社区的薄入口 Skill。AI Native 社区可以提供经过筛选的共同知识来源，但任何群聊原文、成员标识和内部审核材料都不得进入公开运行包（候选池已脱敏发送者 ID）。

只做 6 件事：

1. 守门：识别安全、隐私、不可逆和动态事实风险。
2. 判模：选择 1 个主路由。
3. 按需加载对应 contract。
4. knowledge 路由通过 BM25 检索候选池对话摘录，返回相关上下文并标注边界。
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
├── scripts/query-candidates.mjs
├── scripts/query-public-card.mjs（已归档，仅历史）
├── scripts/knowledge-production.mjs
├── scripts/feedback-ledger.mjs
├── policies/external-sources.v1.json
├── schemas/helpdesk-turn-contract.schema.json
├── schemas/external-source-policy.schema.json
├── scripts/helpdesk-turn-contract.mjs
└── knowledge/archive/（8 张 PublicCard 已下线归档）
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

## 候选池检索（knowledge 路由）

knowledge 路由先调用 `scripts/query-candidates.mjs` 检索候选池对话摘录：

```bash
node scripts/query-candidates.mjs --query "<用户问题>" [--candidates <candidates.jsonl>] [--top-k 3]
```

候选池来源：`ai-native-knowledge-base` 仓库的 `data/candidates.jsonl`（2,153 条对话摘录，发送者已脱敏）。通过 `AIHD_CANDIDATES_PATH` 环境变量或 `--candidates` 参数指定。

- `HIT`：返回相关摘录，**必须**标注边界“这是相关对话摘录，不是已验证答案”，给来源引用和一个最小下一步。
- `MISS`：明确 `UNKNOWN`，给最小核验或升级动作，不编造命中；可进入获准外部回退。
- `DENY`：说明知识检索分支暂不可用，不读取、不模拟、不自动回退。

## PublicCard 发布门（已归档，仅历史）

8 张 PublicCard 已于 2026-08-20 下线归档到 `knowledge/archive/`。原发布门机制（四门 `editorial/verification/privacy_gate/publication`）保留为历史代码，不再作为 knowledge 路由的查询目标。

历史：8 卡对 19 个真实问题正式 loader 为 `ALLOW 0 / MISS 19`，AB 测试显示裸模型核心判断与人工批准卡重合约 80-90%——卡片形式覆盖不了开放需求，因此切换为候选池检索。

## Phase 3 生产门

`scripts/knowledge-production.mjs` 只处理不含正文的控制收据：普通路径要求 Owner-authorized Candidate；`MISS` 路径额外要求 `ADOPTED / OUTCOME_REPORTED`、获批答案候选与人工提炼。公开投影还要求 100% 人工 QA、四门和逐卡 Owner 发布决定。机器 `PASS`、G11 或候选内容都不能代签 G12。

## Phase 4 反馈账本

`scripts/feedback-ledger.mjs` 只向公开仓库外的受控路径追加 hash-chain 事件。反馈等级、候选、人工提炼、发布、索引、后续 ALLOW、验证失败、撤回、过期和更正均通过重放计算；历史事件不能原地修改。

CLI 不回显 payload。`ACKNOWLEDGED`、无反馈模型答案和包含原回答正文的候选会 fail-closed。只有真实 `ADOPTED / OUTCOME_REPORTED` 才能开启实际候选链；synthetic 完整测试最多声明 `mechanism_loop_complete`，不能声明 `real_loop_complete`。G13a 的 1 用户／1 问题受控采集已经完成，实际 `MISS` 后获得 `ADOPTED` 并跑通隔离候选闭环；该结果不证明执行效果，也没有修改正式发布状态。

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
| PublicCard 门返回 `DENY` | 历史代码（已归档），不读正文，不模拟卡片 |
| PublicCard 门返回 `MISS` | 历史代码（已归档），当前路由已切换为候选池检索 |
| 多个主路由 | 本轮只执行 1 个 |
| 信息不足但不改变路径 | 直接回答，不例行追问 |
| 信息不足且改变路径 | good-question 只问 1 个 |
| 同一歧义重述后仍不知道 | `UNKNOWN`，停止追问 |
| 外部策略或证据门失败 | `VERIFY / ESCALATE / UNKNOWN`，不继续确定性结论 |
| 用户补充信息 | 重新守门、判模、加载合同 |

## 当前状态

- PP 机制：`COMPLETE / CLOSED / DECLARABLE`；证据为 8 卡、198／198、可逆安装和逐卡 Owner 批准。
- merge：`COMPLETE`（PR #5 → `main`，`430b34b`）。tag／GitHub Release：`NOT_STARTED / PENDING_OWNER_AUTHORIZATION`，分别授权。
- 30 人产品验证：`POST_RELEASE / NOT_STARTED / OUTCOME_UNKNOWN`；目标至少 15／30，当前没有冻结查询集或真人实测。
- 发布门代码和合成测试：已建立。
- Phase 1 召回选择：Owner G10 已通过；synthetic holdout 与 G12 后真实三卡观察回归均通过，仍须在 loader 前做适用性裁决。
- Phase 2 回合与外部来源合同：G11 已通过；当前是远端功能分支能力，尚未进入 `main`。
- Phase 3 schema B、生产门与正式三卡错配：G12 已通过，功能分支验证通过。
- 公开 PublicCard：远端 `main` 8 张（经 PR #5 merge，`430b34b`）。
- 两张新卡：已按 G12 指定 revision 进入功能分支正式 index。
- Phase 4 反馈账本与回滚：机制完成；23 项定向测试通过，包含 G13b 前 staging／formal 状态隔离。
- Phase 4 真实闭环：`G13B_APPROVED / FEATURE_BRANCH_FORMAL_LOOP_COMPLETE`；第四张卡正式 index／ALLOW 已通过。
- Phase 6 首批知识规模化：000005—000008 已逐卡通过人工 QA 与发布决定；远端 `main` 8 卡 index、41 条 loader 检查、25／25 观察错配回归和 198／198 全量测试通过；已 merge，tag／Release 未创建。
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
| v0.6.2-phase4-g13b-candidate | AWAITING_G13B | 真实 `MISS → ADOPTED` 隔离闭环完成；正式发布状态保持未改变 |
| v0.6.3-phase4-g13b-published | PHASE5_READY | G13b 批准第四张卡；本地正式 index／loader 与真实反馈链闭合 |
| v0.8.0-phase6-eight-card-local | HISTORICAL_STOP_BEFORE_PR | Phase 6 逐卡批准新增 4 卡；该冻结时点的本地 8 卡 index／loader／错配／安装与全量回归通过 |
| v0.8.1-phase6-eight-card-branch | HISTORICAL_STOP_BEFORE_PR | 8 卡提交已 push 到远端功能分支；该冻结时点尚未创建 PR，后续已由 v0.8.2 取代 |
| v0.8.2-phase6-eight-card-pr | HISTORICAL_DRAFT_PR_OPEN | Draft PR #5 已创建；该冻结点未 merge，后续已 merge `main` |
| v0.9.0 | PP_MECHANISM_COMPLETE + MERGE_MAIN_COMPLETE | Owner 以 8 卡、198／198、可逆安装关门；PR #5 已 merge `main`（`430b34b`）；发布与产品验证分账 |
| G13a control receipt | COMPLETED | Owner 授权的 1 用户／1 问题受控采集已完成；公开仓库只留聚合收据 |

后续 PublicCard 仍须逐张独立完成内容修正、真实验证、隐私审查和 Owner 发布批准；首张卡通过不能让其他候选自动晋级。
