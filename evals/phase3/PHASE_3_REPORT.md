# Phase 3 实现报告

核验时间：`2026-08-18 05:01 +08:00`

状态：`AWAITING_G12_OWNER_APPROVAL`

## 结论

Phase 3 的本地实现与候选包已完成，工程验收 `PASS`；Owner G12 尚未完成，因此两张新卡仍为 `PENDING_G12`，正式公共 index 仍只有 000001，不得声称已有 3 张真实发布卡，也不得进入 Phase 4。

## 提交链

- 基线：`441fffadc0771172d6e305ab4d576ebc058cbf51`
- 协议冻结：`c384a664633736ff54a5adfc6aa7cb1023397c4c`
- 实现：`53d5f4b75fb5d490ddb9540c3782043430337f40`
- 分支：`codex/phase3-knowledge-production`
- 外部状态：未 push、未开 PR、未 merge；本地 branch 不是公开发布面。

## 交付结果

### 1. PublicCard schema B

- schema 从 `0.3` 升为 `0.4`。
- 新增 `scope_hint`、`judgment_framework`、`common_mistakes`、`action_principles`、`verification_method`。
- index 新增 `revision`、`content_sha256`、`scope_hint`。
- loader 精确核对 index 与卡片的 revision、完整文件 SHA-256、question、aliases 和 scope_hint；漂移返回 `DENY`。
- 首张卡迁移到 schema B／revision `1.1.0`，仍只存在于本地候选 branch，待 G12 确认该 revision。

### 2. 两条 private KnowledgeCard 生产门

- 普通路径：没有 Owner-authorized Candidate 时返回 `HOLD / CANDIDATE_AUTHORIZATION_REQUIRED`。
- `MISS` 路径：只接受 `ADOPTED / OUTCOME_REPORTED`；还必须有获批的 ANSWER_CANDIDATE 与 `human_distillation = PASS`。
- 两条路径都要求答案、适用边界、下一步、验证方法和机器结构齐全，才能声明 `PRIVATE_CARD_READY`。
- public projection 另行要求全量人工 QA、编辑、验证、隐私、发布四门和逐卡 Owner 决定。机器 `PASS` 不能代签任何人工门。

### 3. 首批实际清单

| card_id | 内容 | 当前状态 | 私域 192 类使用 |
|---|---|---|---|
| `AIHD-PC-000001` | `AGENTS.md` 规则发现／读取／触发验证 | schema B revision 待 G12 | 无新增使用 |
| `AIHD-PC-000002` | 规则已读但被 Sandbox／Rules／审批阻断 | `PENDING_G12` | 无 |
| `AIHD-PC-000003` | OpenClaw Gateway 服务与 RPC 健康验收 | `PENDING_G12` | 无 |

两张新卡只使用本轮现场核验的 OpenAI／OpenClaw 官方公开来源起草；当前 192 类私域问题仍未获批量 Candidate 授权。

### 4. QA

- rubric 固定 10 个维度：答案正确性、适用边界、来源、下一步、验证、隐私、不可公开内容、改义、Candidate 授权、逐卡发布决定。
- 首批策略为 `ALL_CARDS / sample_rate = 1 / human_qa_required = true`。
- 3 张卡均完成机器预检；3 张卡的人工 QA 仍精确保持 `PENDING_G12`，没有用 Codex 自评冒充 Owner 人审。
- 重大隐私、来源、发布边界或改义失败会触发整批 `HOLD`、停止自动生成并 100% 复查。

### 5. 候选三卡错配

使用 G10 选中的 `bm25_expansion_keyword@0.8449460370411592 / top_k=3`，只在候选 projection fixture 上运行：

| 查询 | 候选结果 | 判定 |
|---|---|---|
| 写进 AGENTS.md 的规则怎样确认生效 | 只返回 000001 映射 | 通过 |
| AGENTS.md 已读取但命令仍被 sandbox 拒绝 | 返回 000002＋000001 映射 | 保留两张，进入适用性裁决，不读正文 |
| AGENTS.md 规则没生效还是 sandbox 拒绝 | 返回 000001＋000002 映射 | 正确保留歧义 |
| 怎样用 `--require-rpc` 验证 OpenClaw Gateway | 只返回 000003 映射 | 通过 |
| Gateway 显示 running 但连不上 | 只返回 000003 映射 | 通过 |
| 完全无关的烘焙问题 | 空 | `MISS` |

候选输出 100% 只含 `card_id / public_question / scope_hint`，不含 answer 或 sources。该证据仍是 candidate projection，不是 G12 后的真实三卡公共 index 验收。

## 现场来源与运行核验

- OpenAI AGENTS、Rules、Sandbox 官方页于 `2026-08-18` 现场可访问。
- OpenClaw Gateway CLI 与 health 官方页于 `2026-08-18` 现场可访问。
- 本机 `Codex CLI 0.148.0-alpha.9`：`codex execpolicy check --help` exit 0。
- 本机 `OpenClaw 2026.7.1-2 (0790d9f)`：`openclaw gateway status --require-rpc` exit 0；命令正文未写入报告。

这些收据只支持卡片声明的命令与当前版本，不证明所有用户环境均相同。

## 机器验证

```text
node --check scripts/query-public-card.mjs       PASS
node --check scripts/knowledge-production.mjs   PASS
node --test                                     144 / 144 PASS
fail / cancelled / skipped / todo               0 / 0 / 0 / 0
```

其中 Phase 3 新增 40 项：knowledge production 24 项、候选／错配 13 项、index 完整性 3 项；原有 104 项保持通过。

## 保护 SHA-256

| 对象 | SHA-256 |
|---|---|
| `schemas/public-card.schema.json` | `4d8bbfb1526645410afad4468e9925e4d78491d40d2a7a2daa30f0ddf8ee8d2a` |
| `schemas/knowledge-production.schema.json` | `dd9ceb2dc494ef541b5e9962c505e941268a7aadba6a5767c11bcb195d1b9548` |
| `scripts/query-public-card.mjs` | `3bc63f813860a50bde3e71648acead191e6b898ebffa9e5be3309a86a2bb6d13` |
| `scripts/knowledge-production.mjs` | `a4c0e409b478fd66d4801c0c1bf6a90696a78e251bb7382075c1927fdbde6dc8` |
| `knowledge/public/cards/AIHD-PC-000001.json` | `ca26a3c3d41768ecc9d7e5b9a85a2fcb9e49244d1e8a089d2762fde5834cec6a` |
| `knowledge/public/index.json` | `02ef3d98c5500277835d8f33b8e42dd5f914609e4b3814e45a5c592841409b48` |
| `governance/internal-card-qa-rubric.v1.json` | `78e93d5b7f747e092611978a866d777085b85a2418dce1098e2e6eebe80d87c8` |
| `evals/phase3/FIRST_BATCH_MANIFEST.json` | `1d56aee11a15a676184434afbebcbc0eb556793211472dfe1e843dde3d20d881` |
| `AIHD-PC-000002.candidate.json` | `ddadfe6337d23ba6a67f65f8d13485ad02662b7f8d520830a2ed49929db3981c` |
| `AIHD-PC-000003.candidate.json` | `c6dd3c292e43801640ce37dbd774feb57210e9f67b742637f421fa4ad6903a76` |

## 尚未通过

- G12 Owner 100% 人工 QA 与逐卡发布决定：`PENDING_G12`。
- 两张新卡进入正式公共 index：未发生。
- 3 张真实 PublicCard 的发布后跨卡验收：未开始。
- push／PR／merge／远端读回：未发生。
- Phase 4 真实反馈闭环：未开始。

