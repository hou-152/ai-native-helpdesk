# ai-native-helpdesk v1.0.0-private-source

这是一个未发布的减法实现：Helpdesk 不再随包分发标准答案，而是先守门、判模、按需加载合同；knowledge 路由调用用户显式授权的私域知识库，定位相关对话后回读原始内容和必要上下文。

旧 8 卡公开面已撤销：当前源树和 release manifest 不再包含 PublicCard、公共 index 或卡片 loader；`v0.9.0` tag 与 GitHub Release 已删除。本次撤销不重写 Git 历史，旧提交仍可追溯。

## 双仓库架构

本项目由两个 GitHub 仓库组成，分工不同：

| 仓库 | 角色 | 内容 |
|------|------|------|
| **[ai-native-helpdesk](https://github.com/hou-152/ai-native-helpdesk)**（本仓库） | 入口 / 路由 / 合同 | 守门、判模、按需加载合同；knowledge 路由调用 `$dbs-knowledge` 定位私域原始对话 |
| **[ai-native-knowledge-base](https://github.com/hou-152/ai-native-knowledge-base)** | 公开数据面 | 脱敏聊天语料（6,032 条）、候选池（2,153 条对话摘录）、管道脚本、知识原子化方法文档 |

`ai-native-knowledge-base` 是本项目公开的数据参考面：发送者 ID 已脱敏，可供群成员检索历史对话、查看知识原子化方法与管道。helpdesk 的 knowledge 路由在私域侧使用 `$dbs-knowledge` 定位原始对话；公开数据面提供可分享、可审计的脱敏版本。

## 运行结构

```text
用户问题
→ 安全／隐私／不可逆／动态事实守门
→ 选择 1 个主路由
→ 按需加载 1 个 contract
→ knowledge：调用 $dbs-knowledge
→ 先读 SOURCE_OF_TRUTH.md
→ 按知识库导航定位派生文件
→ 回读导航指定的原始文件＋必要上下文
→ 回答＋1 个最小下一步
```

当前 release manifest 只包含：

```text
ai-native-helpdesk/
├── LICENSE
├── README.md
├── SKILL.md
├── contracts/
│   ├── action.md
│   ├── good-question.md
│   ├── knowledge.md
│   ├── safety.md
│   └── thinking.md
├── docs/INSTALL.md
└── scripts/manage-install.mjs
```

active PublicCard、公共索引、卡片 loader、Phase 1–4 运行代码和测试均为 `0`。退役文件仅保留在执行控制面的日期化 `.trash` 回收目录中，用于 30 天内恢复，不进入 Git 或安装包。

## 依赖

- Node.js 20 或更高版本，用于安装、验证、卸载和回滚。
- 宿主可发现的 `$dbs-knowledge`。它是外部 Agent Skill 合同，不是 CLI，也不随本仓库复制。
- 当前实现验证的上游锚点为 `dontbesilent2025/dbskill@7e770e54aaaa8f43cac344b536d3adce095ead8f`（tag `v2.18.24`）；该锚点只用于依赖复核，不代表上游提供固定 API 或状态枚举。
- 调用者显式提供的私域知识库根目录和读取权限。
- 知识库根目录内可读的 `SOURCE_OF_TRUTH.md`，以及导航绑定的原始来源、派生定位文件和完整性收据。

依赖或知识源不可用时，knowledge 路由返回 `SOURCE_UNAVAILABLE`；不得猜本机路径、模拟调用或用模型记忆冒充知识库。

## knowledge 结果

| 内部结果 | 含义 |
|---|---|
| `HIT` | 派生文件定位后，已按同一来源标识回读原始消息与必要上下文 |
| `MISS` | 当前知识源没有可复核候选 |
| `SOURCE_UNAVAILABLE` | Skill、路径、权限或导航不可用 |
| `HOLD` | hash、原始记录、附件、线程或冲突门未通过 |
| `VERIFY` | 动态或高风险事实需要当前权威来源核验 |
| `ESCALATE` | 需要专业资格或更高权限 |
| `STOP` | 安全或不可逆门未通过 |
| `UNKNOWN` | 当前证据不足 |

`MISS` 不会统一变成“试试就知道了”。只有风险低、可逆、可观察，并且不涉及隐私、凭证、安全、动态事实或生产不可逆操作时，才给一个写明成功信号、停止条件和恢复方法的最小实验。

## 隐私与来源边界

- 公开包不内置私域绝对路径、私域 hash、消息／成员标识或原始正文。
- 公开数据面（`ai-native-knowledge-base`）只含脱敏语料：发送者已映射为 `USER_NNN`，邮箱／手机号／路径／凭证等 7 类敏感模式 0 残留。
- 派生定位命中只证明找到候选位置，不证明原话正确或问题已经解决。
- 回答区分原始事实、跨消息归纳、模型推测和未知。
- 默认不输出成员身份、消息／线程标识、群名、凭证或大段逐字原文；引用必须脱敏并缩到必要片段。
- 动态事实必须在同一回合核验当前官方或权威来源；历史聊天不能替代。

## 安装

安装、验证、覆盖旧版本、卸载和回滚见 [docs/INSTALL.md](docs/INSTALL.md)。安装器使用显式 source、target 和 state，verify 会拒绝文件集合漂移和字节漂移。

## 验证

```bash
node --test
```

测试使用运行时生成的脱敏临时语料，不包含真实社区消息、成员信息、消息标识或私域路径。覆盖：

- `HIT → raw/context`；
- `MISS`；
- `SOURCE_UNAVAILABLE`；
- source hash drift；
- 定位命中但原始记录缺失；
- 隐私、动态事实、不可逆动作和低风险最小实验边界；
- 清洁安装、旧 8 卡覆盖、精确文件集 verify、回滚和软链拒绝。

机器测试只证明合同与安装边界，不证明私域内容正确、用户接受、已经发布或产生效果。

## LICENSE

本版本保留的代码、contracts 和文档按 Apache License 2.0 提供，见 [LICENSE](LICENSE)。`$dbs-knowledge` 是未打包的外部依赖，适用其上游许可证；本仓库没有复制其正文。

## 历史边界

- `v0.9.0`：已撤销；tag、GitHub Release 和当前树中的 8 卡发布面已删除，Git 历史未重写。
- `v1.0.0-private-source`：当前未发布实现，active PublicCard 为 0，产品效果仍为 `UNKNOWN`。
- 知识包／标签方向：已冻结（2026-08-20 验证：关键词分类合理率 40-50%，未达 80% 阈值；不上 LLM 方案 B，等真实使用痛点再重启）。
