# ai-native-helpdesk v0.7.0-phase5-g14-ready

> 项目当前推进位置、完成度和发布边界以 [`docs/PP.md`](docs/PP.md) 为唯一入口。摘要：Phase 0—4 已关闭，Phase 5 处于发布待完成状态；4 张卡已进入远端功能分支，但尚未进入 `main`。

## 目标

为 AI／Agent／OpenClaw 相关社区提供一个薄入口 Helpdesk：先守门和路由，再按需加载合同；知识问答只能读取已经通过编辑、验证、隐私和发布四道门的 PublicCard。

AI Native 社区可以作为共同知识的高质量来源，但私密群聊、成员信息、原话和内部审核材料不进入本仓库。未来其他社区可以显式挂载自己的本地知识包，不与公共包混写。

## 运行结构

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
├── governance/internal-card-qa-rubric.v1.json
├── policies/external-sources.v1.json
├── schemas/helpdesk-turn-contract.schema.json
├── schemas/external-source-policy.schema.json
├── scripts/helpdesk-turn-contract.mjs
├── knowledge/public/index.json
└── tests/
```

## 发布门

PublicCard 必须精确满足：

```text
editorial = APPROVED
verification = PASS
privacy_gate = PASS
publication = READY
```

加载器还会检查 `domain = AI_AGENT_OPENCLAW`、严格 schema、索引与卡片的 revision／hash／安全 scope_hint 绑定、路径和软链边界、重复 JSON 键、敏感字段／模式以及公共包与社区包冲突。所有检查完成前不输出正文。

三种结果：

- `ALLOW`：唯一命中且全部检查通过，返回白名单卡片字段。
- `MISS`：没有命中，Helpdesk 回到普通事实检索。
- `DENY`：坏包、坏卡、冲突或状态不通过，不返回正文。

## 使用

默认公共包：

```bash
node scripts/query-public-card.mjs --query "用户问题"
```

显式增加社区本地包：

```bash
node scripts/query-public-card.mjs \
  --query "用户问题" \
  --community-pack "/path/to/community-pack"
```

脚本不会自动扫描当前目录、用户目录、环境变量或个人资料。当前本地分支的正式公共索引包含 4 张逐卡批准卡；精确命中且通过全部门时才返回 `ALLOW`，其他问题仍返回 `MISS`。

安装、验证、卸载与回滚使用显式目标路径和可读回 state；完整步骤见 [`docs/INSTALL.md`](docs/INSTALL.md)。运行时只从 `SKILL.md` 所在目录解析资源，不依赖固定的用户目录。

## LICENSE

本公开仓库中的代码、contracts、schema、公开 PublicCard 和文档按 Apache License 2.0 提供，见 [`LICENSE`](LICENSE)。私密群聊、证据、未公开候选、安装 state 和本机日志不属于公开 release 包，也不因本 LICENSE 获得再发布授权。

## Phase 3 生产门

普通语料与 `MISS` 反馈使用独立收据进入 private KnowledgeCard：

```bash
node scripts/knowledge-production.mjs \
  --input "/path/to/production-receipt.json" \
  --target private-card
```

- 普通路径必须先有 Owner-authorized Candidate。
- `MISS` 路径必须到 `ADOPTED / OUTCOME_REPORTED`，答案候选获批并完成人工提炼。
- 公开投影还必须经过首批 100% 人工 QA、四门和逐卡 Owner 发布决定。
- 历史 `PENDING_G12` 收据在 private 与 public 目标仍返回 `HOLD`，不会因后续批准而被静默改写。

首批清单固定为 3 张：现有卡的 schema B 迁移，以及 2 张只使用公开官方来源起草的新卡。G12 已逐卡批准指定 revision；正式 index 的扩张和真实三卡回归均有独立收据。

## Phase 1 召回边界

Owner G10 已选择 `bm25_expansion_keyword@0.8449460370411592 / top_k=3`。它在冻结的 synthetic observed／holdout 门和 G12 后真实三卡观察回归上通过，但仍只允许返回候选 ID 和安全元数据；分数不能触发 `ALLOW`、正文读取或用户语境裁决。回归保留一条 Codex 宽召回，要求 loader 前完成 applicability 裁决。

## Phase 4 反馈账本

反馈事件只能写入公开仓库外的受控私密路径：

```bash
node scripts/feedback-ledger.mjs append \
  --ledger "/private/control/feedback.jsonl" \
  --event "/private/control/next-event.json"

node scripts/feedback-ledger.mjs verify \
  --ledger "/private/control/feedback.jsonl"

node scripts/feedback-ledger.mjs replay \
  --ledger "/private/control/feedback.jsonl" \
  --chain "CHAIN-..."
```

- ledger 和输入事件路径位于本仓库内时，脚本 fail-closed。
- CLI 只返回稳定 ID、hash、状态和 reason code，不回显需求摘要或 payload。
- “谢谢”只能记为 `ACKNOWLEDGED`；`ADOPTED / OUTCOME_REPORTED` 才有候选资格，且仍需人工提炼、四门与 Owner 逐项批准。
- G13b 前用 `STAGING_DECISION → STAGING_INDEX_RESULT → STAGING_ALLOW_RESULT` 记录隔离候选投影；它可以证明 rehearsal，但正式 `publication_state / index_state / allow_state / serving_eligible` 保持未批准、未索引、未服务。
- staging 必须保留 `g13b_status = PENDING` 和 `isolation = ISOLATED_CANDIDATE`；不能借隔离 ALLOW 伪造 Owner 批准。G13b 通过后仍须另写正式 `PUBLICATION_DECISION` 并重新执行正式 index 与 loader。
- 索引失败、验证失败、撤回、过期或反馈更正会取消 serving eligibility，不能沿用旧成功声明。
- G13a 的真实隔离链已经完成；公开仓库只保留聚合收据和 hash 指针，不保存原问句、反馈原文、候选正文或私密 ledger。该链仍只有 `ADOPTED`，不证明用户执行或客观效果。
- G13b 已逐项批准唯一候选；正式第四张卡、index 和 loader 后验收均已本地完成。该结果不等于远端发布、社区试跑或用户效果。

## Phase 2 回合合同

结构化回合可以通过独立脚本复验：

```bash
node scripts/helpdesk-turn-contract.mjs \
  --input "/path/to/turn.json" \
  --policy policies/external-sources.v1.json
```

合同执行以下门：

- 默认直接回答；只有缺失语境会改变答案、边界、风险或下一步时才允许问 1 个问题。
- 同一歧义最多重述 1 次，再无法判断就停止追问并保留未知。
- 内部保存执行、验证、等待、停止、无需行动、补信息、未知或升级 8 种去向；对用户生成自然语言，不倾倒机器标签。
- `MISS` 可以进入独立外部回退；`DENY` 不自动回退；隐私拒绝后不外发原查询。
- 外部证据必须通过版本化 allowlist、Owner、风险、时效、检索时间和失效检查。
- 组合答案逐 claim 保存 `PUBLIC_CARD / EXTERNAL_VERIFIED / MODEL_REASONING`；高风险或动态事实不得由纯模型推理给出确定性结论。

合同脚本不发起网络请求，也不替代 PublicCard loader。外部检索器取得证据后再把 `source_id`、URL、`retrieved_at` 和必要版本交给本合同复验。策略缺失、过期、不可解析或证据越界时，合同清空 claims 并 fail-closed 到核验、升级、补信息或未知。

## 验证

```bash
node --test
```

测试使用纯虚构临时卡片、公开来源卡片和结构化回合，不包含真实社区数据。覆盖四道门、严格 schema、revision／hash 漂移、重复键、敏感内容、路径穿越、软链越界、跨包冲突、拒绝内容不泄露，Phase 2 合同、Phase 3 双生产路径与正式三卡错配，以及 Phase 4 反馈等级、追加式 hash 链和状态回滚。

## 隐私与能力边界

- Git 仓库不接收群聊导出、候选报告、证据、`.work`、memory、凭证或本机日志。
- 公共包只能包含已经生成的 PublicCard；私密编辑真源必须留在其他受控位置。
- 程序能做结构和敏感模式检查，但不能证明普通文本从未逐字取自私域语料；语义脱敏仍由人工 `privacy_gate` 负责。
- 测试通过只证明发布门的机器行为，不证明卡片答案正确、用户接受、已经发布或产生效果。

## 当前完成度

| 项目 | 状态 |
|---|---|
| 薄入口与 5 个原有合同 | `TRIAL` |
| PublicCard schema | `CODE_READY` |
| 确定性发布门 | `CODE_READY` |
| 公共知识卡 | `4 / LOCAL_BRANCH` |
| 首批真实 PublicCard | `G12_APPROVED / LOCAL_INDEXED` |
| Phase 1 召回选择 | `G10_APPROVED / REAL_THREE_CARD_OBSERVED_REGRESSION_PASS` |
| Phase 2 回合合同 | `G11_APPROVED / LOCAL_ONLY` |
| Phase 3 schema B 与生产门 | `G12_APPROVED / TESTED` |
| Phase 3 两张新卡 | `G12_APPROVED / LOCAL_INDEXED` |
| Phase 4 反馈账本与回滚 | `MECHANISM_COMPLETE / 23 TESTS` |
| Phase 4 真实反馈闭环 | `G13B_APPROVED / LOCAL_FORMAL_LOOP_COMPLETE` |
| Phase 5 安装与发布工程 | `ENGINEERING_ACCEPTANCE_PASS / G14_AUTHORIZED` |
| 真实社区端到端验证 | `NOT_STARTED / EXECUTOR_SMOKE_PASS_ONLY` |

四张卡只覆盖各自声明的窄 scope。后续卡片仍须逐张经过内容修正、真实环境验证、隐私审查和 Owner 发布批准，不能因现有卡片通过而自动晋级。
