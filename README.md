# ai-native-helpdesk v0.3.0-gate-trial

> 当前状态：发布门代码已建立，首张经单独加工、验证、隐私审查和发布批准的 PublicCard 已进入公共包。当前仍是单卡试运行，不代表完整知识库上线，也不代表已完成真实社区端到端验收。

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

## 验证

```bash
node --test
```

测试使用纯虚构临时卡片，不包含真实社区数据。覆盖四道门、严格 schema、重复键、敏感内容、路径穿越、软链越界、跨包冲突和拒绝内容不泄露。

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
