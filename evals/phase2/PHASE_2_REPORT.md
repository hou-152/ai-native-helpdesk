# Phase 2 结果与 Owner G11 决策包

生成时间：`2026-08-18 +08:00`

## 结论

推荐 Owner 选择 **G11-A：通过 Phase 2，进入 Phase 3**。

Phase 2 冻结的正反验收已全部通过：追问门、一次重述上限、8 种内部去向与自然语言表达、`MISS / DENY / QUERY_PRIVACY_DENY` 路由、版本化外部来源政策、时效／风险复验和逐 claim 来源都已有可执行合同与失败测试。完整测试为 `104／104 PASS`，fail／cancelled／skipped／todo 均为 0。

这只证明本分支的合同机制通过，不证明真实多卡、外部独立人审、社区端到端、用户接受或用户问题已解决。

## 决策与实现绑定

- Owner G10 回执：`按推荐通过 G10，进入 Phase 2。`
- Phase 1 输入：`bm25_expansion_keyword@0.8449460370411592 / top_k=3`。
- Phase 1 基线：`96527479fd1b0465d172400e2b9245bb084c8c03`。
- Phase 2 协议 commit：`320ca37`。
- Phase 2 实现 commit：`8dd9ec09a0278671126547ce3442f4c455861d40`。
- 分支：`codex/phase2-context-fallback`；本地，未 push、未开 PR、未 merge。

## 已实现行为

### 1. 追问与候选歧义

- 缺失语境不改变答案、边界、风险或下一步：直接回答，例行追问会失败。
- 缺失语境改变路径：本轮必须恰好 1 个区分问题；不问或打包多个问题都会失败。
- 候选处理路径相同：不因表述差异追问。
- 候选处理路径不同：只问 1 个区分问题。
- 用户首次回答不知道：允许把同一歧义重述 1 次，重述必须实质不同。
- 重述后仍不知道：`UNKNOWN` 且 `question = null`；继续追问会失败。
- 安全升级优先于普通追问；隐私拒绝只允许一个安全重述问题，不外发原 query。

### 2. 8 种回合去向

内部保存：

```text
DO / VERIFY / WAIT / STOP / NO_ACTION_NEEDED / NEEDS_INPUT / UNKNOWN / ESCALATE
```

合同为每种状态生成自然语言说明。用户文案出现上述机器标签会失败；等待、停止和无需行动不被强制改写成执行。

### 3. G6 外部回退

- `MISS` 可在独立安全／隐私门通过后使用外部证据。
- `DENY` 不自动回退；只有显式建立并通过独立外部路由才允许继续。
- `QUERY_PRIVACY_DENY` 后不得外发原 query 或使用外部证据。
- 策略缺失、重复键、JSON 损坏、schema 漂移或过期均 fail-closed。
- allowlist 外 URL、inactive 来源、未来时间、证据过期、版本事实未绑定版本均 fail-closed。
- 动态或高风险外部事实必须在同一回合取得证据。
- 高风险或动态 `MODEL_REASONING` 不得给确定性结论，且去向只能是验证、升级或未知。

### 4. 逐 claim 来源

每个 claim 独立保存：

- `PUBLIC_CARD`：必须绑定 `card_id`，不接受外部 evidence。
- `EXTERNAL_VERIFIED`：必须绑定 allowlist `source_id`、HTTPS URL、`retrieved_at` 和必要版本。
- `MODEL_REASONING`：不得绑定卡片或外部 evidence，也不得越过高风险／动态事实门。

输出自动生成三类自然语言来源说明。schema 禁止 `overall_source_kind`，防止组合答案整体伪装成知识库命中。

## 初始外部来源策略候选

策略 ID：`AIHD-EXTERNAL-SOURCES@1.0.0`；Policy Owner：`AI Native Helpdesk Owner`；有效期到 `2026-11-18 00:00 +08:00`，到期未更新即 fail-closed。

| source_id | 来源 Owner | 获准根路径 | 风险 | 稳定／动态最大时效 |
|---|---|---|---|---|
| `OPENAI_OFFICIAL_DOCS` | OpenAI | `developers.openai.com`、`help.openai.com`、`learn.chatgpt.com`、`platform.openai.com` | LOW／MEDIUM／HIGH | 720h／24h |
| `OPENAI_OFFICIAL_GITHUB` | OpenAI | `github.com/openai/` | LOW／MEDIUM／HIGH | 720h／24h |
| `OPENCLAW_OFFICIAL_DOCS` | OpenClaw | `docs.openclaw.ai` | LOW／MEDIUM／HIGH | 720h／24h |
| `OPENCLAW_OFFICIAL_GITHUB` | OpenClaw | `github.com/openclaw/openclaw/` | LOW／MEDIUM／HIGH | 720h／24h |

`HIGH` 出现在 allowlist 只表示来源类别可用于核验；运行时仍强制同一回合证据，不代表自动批准高风险动作。其他厂商、社区二手材料和任意 GitHub 仓库当前都不在 allowlist。

## 正反测试结果

新增 `24` 项 Phase 2 测试：

| 门 | 正验收 | 反验收／失败注入 | 结果 |
|---|---|---|---|
| 默认直接答 | 不改变路径时 `DO` | 例行追问 | PASS |
| 一次区分问题 | 需要时恰好 1 问 | 0 问、2 问 | PASS |
| 一次重述 | 不同场景重述 | 原问题原样重复、第二次后继续问 | PASS |
| 候选歧义 | 路径不同才问 | 路径相同仍问 | PASS |
| 8 种去向 | 全部生成自然语言 | 文案倾倒机器标签 | PASS |
| 独立外部路由 | `MISS`／显式 `DENY` 新路由 | 未授权外部证据、`DENY` 自动回退 | PASS |
| 隐私 | 安全重述且不外发 | 原 query 已外发 | PASS |
| 来源策略 | 有效官方 allowlist | missing／malformed／duplicate-key／expired／inactive | PASS |
| 时效与版本 | 本轮动态／高风险证据 | 过期、未来、非本轮、缺版本 | PASS |
| 风险 | 高风险非确定模型推理转验证 | 高风险／动态纯模型确定结论 | PASS |
| 逐 claim 来源 | 三种来源并存 | `overall_source_kind` 覆盖 | PASS |
| CLI | 合法输入退出 0 | fail-closed 退出 65 且只输出一个 JSON 结果 | PASS |
| 字节绑定 | policy／两个 schema／实现 hash 固定 | 任一漂移使测试失败 | PASS |

全量 `node --test`：`104／104 PASS`。其中 Phase 2 `24` 项，原有 PublicCard loader／首卡 live pack／Phase 1 v1／v2 共 `80` 项，全部保持通过。

## 冻结 hash

| 文件 | SHA-256 |
|---|---|
| `policies/external-sources.v1.json` | `56bed9938193c7a567f212b81e86f440c84bfe33bb47be450efdd0bfdc52599c` |
| `schemas/external-source-policy.schema.json` | `e20dc3cfa1079930060f31477230ffdaf896da7fa797ff04abf202aca966f2b2` |
| `schemas/helpdesk-turn-contract.schema.json` | `3bbdd955537f01239c0452e81c9400edb143e9cbc52749c8638fe4ba1e5d0230` |
| `scripts/helpdesk-turn-contract.mjs` | `a393972cf6f21cfea8a49bbcdfca0a0f987f170eecfa13154956f42b2af1175f` |
| `tests/helpdesk-turn-contract.test.mjs` | `1a49e51f7c2c87b8edd3120ccdbf20411d37ba15365a5aea95d3dfdb0bbcf974` |

## 保持不变与未知

- PublicCard schema、正式卡片、公共索引和确定性 loader 未修改。
- Phase 1 召回器尚未接入 loader；Phase 2 裁决器接收结构化候选状态，不从分数授予正文权限。
- 初始 allowlist 是 G11 待批准候选，不是长期无限期授权；策略到期会自动关门。
- 当前仍只有 1 张正式 PublicCard；真实跨卡、私域 Candidate、3 张 MVP 卡、社区真实闭环和用户效果均未完成。
- `CONTRACT_PASS` 不是内容正确、Owner 批准、发布、运行集成或用户问题解决。

## Owner G11

### G11-A（推荐）

批准本报告中的合同行为、初始外部来源策略和正反测试，进入 Phase 3。Phase 3 仍须遵守：MVP 共 3 张正式卡、首批内部卡 100% 人工 QA、当前 192 类私域候选不自动晋级。

### G11-B

保持 `HOLD_AT_G11`，明确要修改的合同规则、allowlist 项或测试门；不进入 Phase 3。
