# Phase 3 冻结执行包：受控 KnowledgeCard 生产与 G12 停点

状态：`FROZEN_BEFORE_IMPLEMENTATION`

基线：`441fffadc0771172d6e305ab4d576ebc058cbf51`

Owner 前置回执：`按推荐通过 G11，进入 Phase 3。`

## 1. 本阶段只证明什么

Phase 3 建立两条互不自动晋级的 private KnowledgeCard 生产路径、PublicCard schema B、确定性发布门和首批逐卡 QA 包。它不把当前 192 类私域问题追溯晋级，也不把候选、机器 `PASS`、本地 commit 或 G11 当成逐卡发布批准。

本阶段停在 Owner G12：Owner 必须逐项审查 schema、QA rubric、实际首批清单以及每张卡的发布决定。G12 前，两张新卡只能是公开来源编辑候选，不得进入 `knowledge/public/index.json`；候选生产器必须返回 `HOLD / OWNER_PUBLICATION_REQUIRED`。

## 2. MVP 首批冻结清单

| 序号 | card_id | 状态 | 主题 | 与其他卡关系 |
|---|---|---|---|---|
| 1 | `AIHD-PC-000001` | 已发布卡的 schema B 迁移候选 | 如何验证 `AGENTS.md` 普通行为规则被发现并触发 | 与 000002 同属 Codex 配置排障，但下一步不同 |
| 2 | `AIHD-PC-000002` | `PENDING_G12` | Codex 已读规则但命令仍被沙箱／审批阻断时如何定位 | 与 000001 易混淆；下一步是检查技术边界，不是继续改写规则 |
| 3 | `AIHD-PC-000003` | `PENDING_G12` | OpenClaw Gateway 安装后如何确认服务与 RPC 健康 | 明显不同域内子主题 |

000002、000003 仅使用本轮现场核验的公开官方来源起草，不使用私域原文、当前 192 类问题或私密候选。Owner 在 G12 的逐卡批准同时承担候选授权和发布决定；在此之前它们保持 `PENDING_G12`。

## 3. Schema B 与完整性冻结项

PublicCard schema 从 `0.3` 迁移到 `0.4`，在既有字段上新增：

- `scope_hint`：经过编辑和隐私审核、可在正文加载前展示的安全范围提示。
- `judgment_framework`：用户可复用的判断框架。
- `common_mistakes`：常见误判或错误动作。
- `action_principles`：稳定的行动原则。
- `verification_method`：怎样判定本次动作真的有效。

公共 index 项新增 `revision`、`content_sha256` 和 `scope_hint`。loader 必须同时核对 index 与卡片的 revision、规范字节 SHA-256、question、aliases 和 scope_hint；任一漂移返回 `DENY`，候选分数不能授予 `ALLOW`。

保护项同步更新：schema SHA、loader 精确字段白名单、fixture、首张卡和三态回归。schema、index 或卡片发生非预期漂移时 fail-closed。

## 4. 两条 private KnowledgeCard 路径

### 4.1 普通语料路径

```text
QuestionCluster
→ Owner-authorized KnowledgeCandidate
→ 可行动答案四要素齐全
→ private KnowledgeCard
→ 逐卡 QA
→ 四门与 Owner 发布决定
→ PublicCard 投影
```

`candidate_authorization != APPROVED` 时不得生成 private KnowledgeCard。

### 4.2 MISS 反馈路径

```text
DEMAND_GAP
→ ADOPTED / OUTCOME_REPORTED
→ ANSWER_CANDIDATE
→ human_distillation = PASS
→ private KnowledgeCard
→ 逐卡 QA
→ 四门与 Owner 发布决定
→ PublicCard 投影
```

仅有 `MISS`、`ACKNOWLEDGED` 或模型草稿不得进入 private KnowledgeCard；两条路径只在 private KnowledgeCard 之后汇合。

## 5. 首批 QA 冻结规则

首批 3 张全部逐卡审查，不抽样。每张卡必须分别记录：

1. 答案正确性；
2. 适用边界；
3. 来源可追溯性与时效；
4. 最小下一步；
5. 验证方法；
6. 隐私；
7. 不可公开内容；
8. 是否改义；
9. Owner 候选授权；
10. Owner 发布决定。

机器预检只能写 `MACHINE_PASS`；Owner 未逐卡确认时人工 QA 与发布状态必须为 `PENDING_G12`。

任一隐私、来源、发布边界或改义重大失败：整批 `HOLD`、停止自动生成并对同一生成版本 100% 复查。普通质量失败：返工该卡并扩展为整批 100% 复查。只有修复、复验和 Owner 解锁后才能恢复。

## 6. 正反验收

正向：

- schema B、index 完整性绑定、首张卡迁移和 loader 三态回归通过；
- 普通与 MISS 两条路径分别有正反测试，不能交叉自动晋级；
- 000002、000003 候选有公开来源、机器预检和逐项 Owner QA 表；
- 候选三卡 fixture 可验证同域错配、异域错配和安全元数据输出；
- G12 前正式公共 index 仍只有 000001，候选投影被确定性拒绝。

负向：

- 当前 192 类私域问题任一项被批量或追溯晋级；
- 未授权 Candidate、单次 `MISS`、`ACKNOWLEDGED` 或模型草稿生成 private KnowledgeCard；
- `PENDING_G12` 候选进入正式 index 或被 loader 返回正文；
- schema／结构 `PASS` 被表述为内容正确、人工 QA 或发布批准；
- 未绑定 revision／hash 的 index 项被读取；
- 只测试选中的卡，未覆盖三卡错配和负例。

## 7. G12 必交材料与停点

G12 包必须包含：schema 差异、保护 SHA、两条生产路径测试、首批实际清单、逐卡内容、逐项 QA、来源核验日期、候选三卡错配报告、正式 index 未扩张证据和每张卡的推荐发布决定。

在 Owner 明确批准 G12 前：

- 不把 000002、000003 写入正式公共 index；
- 不把 `PENDING_G12` 改成四门通过；
- 不声称已有 3 张真实已发布卡；
- 不进入 Phase 4。

## 8. 本阶段文件白名单

允许修改：

- `schemas/public-card.schema.json`
- `schemas/knowledge-production.schema.json`
- `scripts/query-public-card.mjs`
- `scripts/knowledge-production.mjs`
- `tests/public-card-gate.test.mjs`
- `tests/public-card-live-pack.test.mjs`
- `tests/knowledge-production.test.mjs`
- `knowledge/public/cards/AIHD-PC-000001.json`
- `knowledge/public/index.json`
- `contracts/public-card.md`
- `governance/internal-card-qa-rubric.v1.json`
- `evals/phase3/**`
- 与本阶段状态同步直接相关的 `README.md`、`SKILL.md`、`PROGRESS.md`、`BLOCKED.md`

任何原始聊天、成员标识、私域候选、审核原文、`.env`、凭证、本机路径或 evidence 不得写入公开仓库。
