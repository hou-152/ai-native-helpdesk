# ai-native-helpdesk 安装教程

本教程带你从零开始：拿到仓库 → 安装 → 验证 → 绑定知识源 → 首次查询 → 覆盖旧版本 → 卸载与回滚。全部命令都是显式路径，不依赖固定的 Skill 目录。

适用版本：`v1.0.0-private-source`。旧 8 卡公开面已撤销，本教程不涉及 PublicCard。

---

## 0. 前置检查

安装前确认 4 件事：

| 检查项 | 要求 | 怎么确认 |
|---|---|---|
| Node.js | 20 或更高 | `node --version` |
| 安装目标目录 | 存在、可写、**不是软链** | `ls -ld /path/to/target` |
| state 文件路径 | 位于安装目标**之外** | 建议放在私密控制目录，如 `~/private-control/` |
| `$dbs-knowledge` | 宿主可发现的外部 Agent Skill | 在宿主会话中触发一次，能返回知识库导航 |

> ⚠️ state 文件包含本机目标与 backup 路径，**不得提交到公开仓库**。

以下变量贯穿全文，请替换为你机器上的真实路径：

```bash
SOURCE_ROOT="/absolute/path/to/ai-native-helpdesk"          # 仓库 checkout
TARGET_ROOT="/absolute/path/to/installed-skill"              # 安装目标
STATE_FILE="/absolute/path/to/private-control/aihd-state.json"  # state 收据（目标外）
```

---

## 1. 获取代码

```bash
git clone https://github.com/hou-152/ai-native-helpdesk.git
cd ai-native-helpdesk
```

也可以直接复用已有 checkout，只要它包含 `skills/ai-native-helpdesk/SKILL.md`、`release-files.v1.json` 和 `scripts/manage-install.mjs`。

---

## 2. 安装

```bash
node "$SOURCE_ROOT/scripts/manage-install.mjs" install \
  --source "$SOURCE_ROOT" \
  --target "$TARGET_ROOT" \
  --state "$STATE_FILE"
```

安装器会：

1. 只读取 `release-files.v1.json` 白名单；
2. 在目标同级创建隔离 staging 目录，逐文件校验；
3. 目标已存在时先改名为可恢复 backup（**不是增量覆盖**）；
4. 写入权限为 `0600` 的 state 收据；
5. 返回稳定状态和 manifest SHA-256，不输出私域内容。

安装成功会返回 `INSTALLED` 类状态。任何字节漂移、软链、state 已存在或文件集合不符都会 fail-closed，不会留下半成品。

---

## 3. 验证安装

从**与源码无关的工作目录**调用安装后的脚本：

```bash
node "$TARGET_ROOT/scripts/manage-install.mjs" verify \
  --target "$TARGET_ROOT" \
  --state "$STATE_FILE"
```

期望结果：`VERIFIED / OK`。

`VERIFIED` 只证明安装文件集合和字节与安装收据一致。它**不**证明知识源可用或用户问题已解决。

**常见失败：**

| reason code | 含义 | 处理 |
|---|---|---|
| `INSTALL_FILE_SET_DRIFT` | 安装目录多文件／少文件／残留旧运行面 | 检查目标里是否有多余的旧卡或旧 loader |
| `INSTALL_BYTE_DRIFT` | 文件字节与 state 不一致 | 重新 install 到新 target |
| `TARGET_PARENT_UNSAFE` / `STATE_PATH_UNSAFE` | 路径是软链或非普通目录 | 换普通目录 |

---

## 4. 绑定知识源（默认：公开知识库，clone 即用）

本版本没有内置答案。knowledge 路由**默认检索公开知识库** `ai-native-knowledge-base`：

```text
clone 知识库（公开，无需授权）
→ 用其随附的 BM25 检索脚本检索候选池（candidates-clean.jsonl）
→ HIT：带来源引用的摘录 → 回答 + 最小下一步
→ MISS：按低风险最小实验条件处理，不编造
```

```bash
git clone https://github.com/hou-152/ai-native-knowledge-base.git
cd ai-native-knowledge-base
# 检索用法见该仓库 data/README.md（node scripts/<bm25脚本> --query "..."）
```

要求：

- 知识库已 clone 到本机，候选池文件可读；
- 调用者只需提供知识库在本机的路径，**不需要私域根目录或读取授权**；
- 公开摘录不足以回答时，如实返回 `MISS`／`UNKNOWN`，不得用模型记忆冒充私域原文。

**可选增强（仅当需要回读私域原始对话补全上下文时）：**

- 宿主能发现并调用 `$dbs-knowledge`（外部 Agent Skill，不随本包复制）；
- 调用者显式提供私域知识库根目录和本轮读取权限；
- 知识库根目录内有可读的 `SOURCE_OF_TRUTH.md` 导航；
- 导航声明的原始来源、派生定位文件和完整性收据都可读。

**不要**把私域知识库根目录写进公开包、release manifest 或普通日志。宿主无法发现 Skill、根目录未提供、权限不足或导航不可读时，正确结果是 `SOURCE_UNAVAILABLE`，不是猜测路径或假装查询成功。

---

## 5. 首次查询

在宿主会话中，把知识路由交给 Helpdesk，例如问：

> "怎样让 OpenClaw Agent 形成受控自迭代闭环？"

期望看到知识结果之一：

| 结果 | 含义 | 下一步 |
|---|---|---|
| `HIT` | 公开候选池命中（或已回读原始对话） | 基于摘录回答 + 1 个最小下一步 |
| `MISS` | 知识源没有可复核候选 | 按合同给低风险最小实验，或如实说不知道 |
| `SOURCE_UNAVAILABLE` | 知识库或 Skill／路径／权限不可用 | 检查第 4 步 |
| `HOLD` | hash 或原始记录门未通过 | 检查知识库完整性收据 |

`MISS` 不等于"试试就知道了"：只有低风险、可逆、可观察且不涉隐私／凭证／安全／动态事实／生产不可逆操作时，才给带成功信号和停止条件的最小实验。

---

## 6. 覆盖旧 8 卡安装（从 v0.9.x 升级）

旧目标使用同一个 `--target`、**新的 state 路径**执行 install：

```bash
node "$SOURCE_ROOT/scripts/manage-install.mjs" install \
  --source "$SOURCE_ROOT" \
  --target "$TARGET_ROOT" \
  --state "/absolute/path/to/private-control/aihd-state-v1.json"
```

整个旧目标会被移到 backup，再放入全新包。覆盖后检查：

1. `verify` 返回 `VERIFIED / OK`；
2. active target 中没有 `knowledge/public/`；
3. active target 中没有 `knowledge/archive/`；
4. active target 中没有 `query-public-card.mjs` 或 `query-candidates.mjs`；
5. manifest 只列入口、6 个子 skill、安装文档、教程、许可证和安装器；
6. state 的 `previous_target.backup` 指向可恢复旧目标。

**不要手工删除 backup。** 确认不再需要恢复后，按组织的 30 天保留规则处理。

---

## 7. 卸载

```bash
node "$TARGET_ROOT/scripts/manage-install.mjs" uninstall \
  --target "$TARGET_ROOT" \
  --state "$STATE_FILE"
```

卸载**不会删除**当前安装：它把安装目录移动到收据返回的 `recoverable_copy`；若 install 前有旧目标，则同时恢复旧目标。state 更新为 `UNINSTALLED`，保留动作时间、恢复状态和可恢复副本路径。

---

## 8. 回滚

```bash
node "$TARGET_ROOT/scripts/manage-install.mjs" rollback \
  --target "$TARGET_ROOT" \
  --state "$STATE_FILE"
```

rollback 把当前候选移到可恢复目录，并把旧目标 byte-identical 恢复到原 target。state 更新为 `ROLLED_BACK`。

---

## 9. 跑测试（可选，源码树内）

```bash
cd "$SOURCE_ROOT"
node --test
```

测试使用运行时生成的脱敏临时语料，不包含真实社区消息、成员信息或私域路径。21 项测试覆盖安装生命周期和 knowledge 来源合同。测试通过只证明机器行为正确，不证明知识库内容正确或问题已解决。

---

## 10. 常见问题

**Q：安装时报 `MANIFEST_UNAVAILABLE`？**
仓库 checkout 缺 `release-files.v1.json`。确认 `--source` 指向完整 checkout。

**Q：`$dbs-knowledge` 是什么？我在哪装？**
它是外部 Agent Skill 合同（上游 `dontbesilent2025/dbskill`），不随本包分发。宿主侧先安装并验证该 Skill 可发现、可调用，再回来做第 4 步。

**Q：verify 报文件集漂移，但我没动过安装目录？**
可能残留了旧 8 卡文件或旧 loader。按第 6 步覆盖重装，或清掉多余文件后重新 install 到新 target。

**Q：查询总是 `SOURCE_UNAVAILABLE`？**
按顺序查：公开知识库已 clone 且候选池可读？BM25 检索脚本可用？（可选增强路径才需继续查）`$dbs-knowledge` 可发现？私域根目录已显式提供？读取权限有效？`SOURCE_OF_TRUTH.md` 存在且可读？

**Q：能直接用当前目录当知识源吗？**
不能。知识源必须显式提供；禁止把当前目录、用户目录、环境变量或历史会话猜成知识源。

---

## 完成清单

- [ ] Node.js ≥ 20
- [ ] `$dbs-knowledge` 可发现
- [ ] install 成功
- [ ] verify 返回 `VERIFIED / OK`
- [ ] 知识库已 clone（公开库默认即可；私域回读需额外授权）
- [ ] 首次查询得到 `HIT`（或合理的 `MISS`／`HOLD`）
- [ ] state 文件在安装目标外，未提交到公开仓库
