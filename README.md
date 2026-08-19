# ai-native-helpdesk v0.10.0

面向 AI／Agent／OpenClaw 社区的薄入口 Helpdesk：**先守门和路由，再按需加载合同；知识问答通过 BM25 检索候选池对话摘录，返回相关上下文并标注边界。**

## 双仓库架构

本项目由两个 GitHub 仓库组成，分工不同：

| 仓库 | 角色 | 内容 |
|------|------|------|
| **[ai-native-helpdesk](https://github.com/hou-152/ai-native-helpdesk)**（本仓库） | 入口 / 路由 / 合同 | 守门、判模、按需加载合同；knowledge 路由通过 BM25 检索候选池 |
| **[ai-native-knowledge-base](https://github.com/hou-152/ai-native-knowledge-base)** | 数据源 | 候选池（2,153 条对话摘录）、脱敏聊天语料（6,032 条）、管道脚本、方法文档 |

```text
用户问题
  → helpdesk 守门（安全/隐私/不可逆/动态事实）
  → 路由判模（good-question / thinking / action / knowledge / safety）
  → knowledge 路由 → BM25 检索 knowledge-base 候选池
  → HIT：相关对话摘录 + 边界标注（非已验证答案）+ 来源引用
  → MISS：UNKNOWN + 最小下一步，不编造命中
```

## knowledge 路由（当前主线）

knowledge 路由调用 `scripts/query-candidates.mjs` 检索候选池：

```bash
node scripts/query-candidates.mjs --query "<用户问题>" \
  --candidates <ai-native-knowledge-base>/data/candidates.jsonl \
  --top-k 3
```

- **`HIT`**：返回相关摘录，**必须**标注边界“这是相关对话摘录，不是已验证答案”，给来源引用和一个最小下一步。
- **`MISS`**：明确 `UNKNOWN`，给最小核验或升级动作，不编造命中；可进入获准外部回退。
- **`DENY`**：说明知识检索分支暂不可用，不读取、不模拟、不自动回退。

候选池数据（发送者 ID 已脱敏）与管道脚本都在 `ai-native-knowledge-base` 仓库，通过 `AIHD_CANDIDATES_PATH` 环境变量或 `--candidates` 参数指定。

## 运行结构

```text
ai-native-helpdesk/
├── SKILL.md
├── contracts/
│   ├── good-question.md
│   ├── thinking.md
│   ├── action.md
│   ├── knowledge.md
│   ├── public-card.md（已归档，仅历史）
│   └── safety.md
├── schemas/
├── scripts/
│   ├── query-candidates.mjs      ← 当前 knowledge 检索入口
│   ├── query-public-card.mjs     ← 已归档，仅历史
│   ├── knowledge-production.mjs
│   ├── feedback-ledger.mjs
│   └── helpdesk-turn-contract.mjs
├── policies/external-sources.v1.json
├── governance/
├── knowledge/archive/            ← 8 张 PublicCard 已下线归档（保留历史不删除）
└── tests/
```

## 合同

入口只负责路由和一句理由；被加载的 contract 负责完整回答与一个最小下一步。合同不存在或读取失败时 fail-closed：明确告知模块暂不可用，不模拟、不跨模块。

- `good-question`：问题模糊、缺失语境会改变路径时，只问 1 个区分问题。
- `thinking`：有假设／逻辑／原因要分析。
- `action`：知道该做但做不动。
- `knowledge`：查询 AI／Agent／OpenClaw 事实（走候选池 BM25 检索）。
- `safety`：安全红线。

## 守门

每次触发依次检查：安全红线 → 隐私红线 → 不可逆行动 → 动态事实 → 个人信息保存。优先级：安全 > 隐私 > 不可逆 > 动态事实 > 个人信息。

## 外部回退与来源合同

- `MISS` 可以进入独立外部回退；`DENY` 不自动回退；隐私拒绝后不外发原查询。
- 外部证据必须通过版本化 allowlist、Owner、风险、时效、检索时间和失效检查。
- 组合答案逐 claim 保存 `CANDIDATE_EXCERPT / EXTERNAL_VERIFIED / MODEL_REASONING`；高风险或动态事实不得由纯模型推理给出确定性结论。

## 验证

```bash
node --test
```

当前 **206/206 PASS**（原 198 项 + 候选池检索 8 项）。测试覆盖守门、schema、路径安全、敏感内容、回合合同、反馈账本、安装生命周期和候选池 BM25 检索（含中文单字切分误判防护）。

## 历史：PublicCard 归档说明

8 张 PublicCard 已于 2026-08-20 下线归档到 `knowledge/archive/`（保留历史不删除）。原因：对 19 个真实问题正式 loader 为 `ALLOW 0 / MISS 19`，AB 测试显示裸模型核心判断与人工批准卡重合约 80-90%——卡片形式覆盖不了开放需求，因此切换为候选池 BM25 检索。原发布门机制保留为历史代码。

## LICENSE

代码、contracts、schema 和文档按 Apache License 2.0 提供，见 [`LICENSE`](LICENSE)。私密群聊、证据、未公开候选、安装 state 和本机日志不属于公开 release 包。

## 隐私与能力边界

- Git 仓库不接收群聊导出、候选报告、证据、`.work`、memory、凭证或本机日志。
- 候选池已脱敏发送者 ID；检索命中 ≠ 答案正确，摘录是 `CANDIDATE / UNVERIFIED`。
- 程序能做结构和敏感模式检查，但不能证明普通文本从未逐字取自私域语料；语义脱敏仍由人工负责。
- 测试通过只证明机器行为，不证明答案正确、用户接受或产生效果。

## 当前完成度

| 项目 | 状态 |
|---|---|
| 双仓库架构 | ✅ helpdesk（入口）+ knowledge-base（数据）已链接 |
| knowledge 路由 | ✅ 候选池 BM25 检索，206/206 测试 |
| 脱敏语料公开 | ✅ 6,032 条（knowledge-base data/chat-corpus-sanitized.jsonl） |
| 标签/知识包 | 🛑 FROZEN（关键词分类合理率 40-50%，验证不通过） |
| 8 张 PublicCard | 🛑 ARCHIVED（knowledge/archive/，下线不删除） |
| 30 人产品验证 | ⛔ POST_RELEASE / NOT_STARTED / OUTCOME_UNKNOWN |
