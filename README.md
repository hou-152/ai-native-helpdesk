# ai-native-helpdesk v0.3.0-gate-trial

> 当前状态：发布门代码已建立，首张经单独加工、验证、隐私审查和发布批准的 PublicCard 已进入公共包。当前仍是单卡试运行，不代表完整知识库上线，也不代表已完成真实社区端到端验收。

## 目标

为 AI／Agent／OpenClaw 相关社区提供一个薄入口 Helpdesk：先守门和路由，再按需加载合同；知识问答只能读取已经通过编辑、验证、隐私和发布四道门的 PublicCard。

AI Native 社区可以作为共同知识的高质量来源，但私密群聊、成员信息、原话和内部审核材料不进入本仓库。未来其他社区可以显式挂载自己的本地知识包，不与公共包混写。

## 哪些情况会被查询发布门 `DENY`

以下是代表性机器拒绝项，不是可替代代码的穷举清单。打开知识包时会验证 schema 和全部索引项；卡片正文只在精确命中后读取并验证。脚本不是全包静态 lint 工具，未命中或未索引的卡片正文不会被预扫描。最终以 `scripts/query-public-card.mjs` 和固定 hash 的 schema 为准。

| 类别 | 代表性触发条件 | 原因码族／示例 |
|---|---|---|
| 参数／查询 | 查询参数重复、必需参数缺失、查询为空或过长、查询含本机路径／凭证等敏感形状 | `ARGUMENT_INVALID`／`QUERY_PRIVACY_DENY` |
| 包与索引 | 包／索引不可用或使用软链、JSON 非严格、重复键、未知字段、索引项超限 | `PACK_*`／`INDEX_*`／`JSON_DUPLICATE_KEY` |
| 卡片结构 | 精确命中的卡片缺字段或多字段、ID／文件名／索引不一致、`domain ≠ AI_AGENT_OPENCLAW` | `CARD_SCHEMA_INVALID`／`CARD_ID_MISMATCH`／`CARD_DOMAIN_DENY` |
| 四道门 | `editorial`／`verification`／`privacy_gate`／`publication` 任一值不精确满足要求 | `CARD_GATE_DENY` |
| 隐私与凭证 | 私密字段／成员消息标识、本机路径、私网或本地域名、URL 凭证或敏感 query key、凭证形状、私钥头、飞书 `docx` 内链、显式群聊引文标记 | `INDEX_PRIVACY_DENY`／`CARD_PRIVACY_DENY` |
| 路径边界 | 包、索引、`cards/` 或卡片使用软链，路径越界，索引文件名与 `card_id` 不一致 | `*_PATH_UNSAFE`／`CARD_PATH_ESCAPE`／`CARD_PATH_INVALID` |
| 查询冲突 | 同包索引中一个规范化 term 指向多卡，或公共包与社区包同时精确命中 | `INDEX_QUERY_CONFLICT`／`QUERY_CONFLICT` |

`DENY` 回包只含 `status` 与稳定 `reason_code`，不返回 query、绝对路径、异常正文、凭证或逐字段错误位置。正则形状存在长度和上下文约束；请勿把上表当成正则副本。

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
├── knowledge/public/index.json
└── tests/public-card-gate.test.mjs
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
- `MISS`：没有精确命中。可能附最多 3 个公共索引 `suggestions`，但仍不含卡片正文；没有用户补充时，Helpdesk 回到普通事实检索。
- `DENY`：坏包、坏卡、冲突或状态不通过，不返回正文。

`suggestions` 只含 `card_id` 和 `score`。它们来自 common 包索引，不来自显式 community 包；默认 common 包是仓库公共包，调用者覆盖 `--common-pack` 时必须自行保证索引元数据允许暴露。`score` 是查询词覆盖排序值，不是置信度或发布证明，且不得被自动改写成精确查询。

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

脚本不会自动扫描当前目录、用户目录、环境变量或个人资料。默认公共索引只有 1 张试运行卡；在未挂载社区包、查询合法且包完整时，精确命中该卡才返回 `ALLOW`，其他普通问题返回 `MISS`；敏感查询或坏包仍会 `DENY`。

## 验证

```bash
node --test
```

门禁测试主要使用纯虚构临时卡片，并用当前公共包做最小行为回归；不引入真实社区私密数据。覆盖四道门、严格 schema、重复键、敏感内容、路径穿越、软链越界、跨包冲突、候选边界和拒绝内容不泄露。

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
| 真实社区端到端验证 | `NOT_VERIFIED` |

首张卡仅验证了它声明支持的 Codex 版本和加载路径。后续卡片仍须逐张经过内容修正、真实环境验证、隐私审查和 Owner 发布批准，不能因首张卡通过而自动晋级。
