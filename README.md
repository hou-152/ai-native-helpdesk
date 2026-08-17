# ai-native-helpdesk v0.4.0-phase2-candidate

> 当前状态：发布门代码与 1 张试运行 PublicCard 保持不变；Owner 已通过 Phase 1 召回选择，本分支新增 Phase 2 追问、回合去向和外部来源合同。Phase 2 仍待 G11，不代表完整知识库上线，也不代表已完成真实社区端到端验收。

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
├── scripts/query-public-card.mjs
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

加载器还会检查 `domain = AI_AGENT_OPENCLAW`、严格 schema、索引一致性、路径和软链边界、重复 JSON 键、敏感字段／模式以及公共包与社区包冲突。所有检查完成前不输出正文。

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

脚本不会自动扫描当前目录、用户目录、环境变量或个人资料。当前公共索引只有 1 张试运行卡；命中该卡才返回 `ALLOW`，其他问题仍返回 `MISS`。

## Phase 1 召回边界

Owner G10 已选择 `bm25_expansion_keyword@0.8449460370411592 / top_k=3`。它在冻结的 synthetic observed／holdout 门上通过，但尚未接入确定性 loader；召回只允许返回候选 ID 和安全元数据，分数不能触发 `ALLOW`、正文读取或用户语境裁决。当前 1 张正式卡也不足以声称真实跨卡验收。

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

测试使用纯虚构临时卡片和回合，不包含真实社区数据。覆盖四道门、严格 schema、重复键、敏感内容、路径穿越、软链越界、跨包冲突、拒绝内容不泄露，以及 Phase 2 追问上限、8 种去向、来源 allowlist、时效、风险和逐 claim 来源。

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
| 公共知识卡 | `1` |
| 第一张真实 PublicCard | `PUBLISHED_TRIAL` |
| Phase 1 召回选择 | `G10_APPROVED / SYNTHETIC_ONLY / NOT_LOADER_INTEGRATED` |
| Phase 2 回合合同 | `CANDIDATE / AWAITING_G11` |
| 真实社区端到端验证 | `NOT_VERIFIED` |

首张卡仅验证了它声明支持的 Codex 版本和加载路径。后续卡片仍须逐张经过内容修正、真实环境验证、隐私审查和 Owner 发布批准，不能因首张卡通过而自动晋级。
