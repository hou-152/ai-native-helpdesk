# 安装、验证、覆盖与回滚

本页适用于 `v1.0.0-private-source`。安装包不含 PublicCard、公共索引、卡片 loader 或私域知识源；knowledge 路由依赖宿主可发现的 `$dbs-knowledge` 和调用者显式授权的知识库根目录。

## 前提

1. Node.js 20 或更高版本。
2. 一个明确、可写且不是软链的安装目标目录。
3. 一个位于安装目标之外的 state 文件路径。
4. 宿主已经可以发现 `$dbs-knowledge`。
5. 私域知识库有可读的 `SOURCE_OF_TRUTH.md`，并且调用者拥有本轮所需的读取权限。

`$dbs-knowledge` 是外部 Agent Skill 合同，不是本仓库提供的 CLI。本包不复制其正文，也不把任何私域路径写进安装文件。本候选验证的上游锚点为 `dontbesilent2025/dbskill@7e770e54aaaa8f43cac344b536d3adce095ead8f`（tag `v2.18.24`）；上游没有固定 API 或状态枚举，宿主 wrapper 必须自行完成结果归一化。

## 安装

从当前 checkout 运行：

```bash
node scripts/manage-install.mjs install \
  --source "/absolute/path/to/checkout" \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"
```

安装器会：

- 只读取 `release-files.v1.json` 白名单；
- 在目标同级目录创建隔离 staging；
- 对已存在目标先做可恢复 backup；
- 用全新目录替换目标，不在旧目录上增量覆盖；
- 写入权限为 `0600` 的 state；
- 返回稳定状态和 manifest SHA-256，不输出私域内容。

## 验证

```bash
node "/absolute/path/to/installed-skill/scripts/manage-install.mjs" verify \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"
```

`VERIFIED / OK` 只表示安装文件集合和字节与 state 一致。多出旧卡、旧 loader 或其他残留文件时，verify 返回 `INSTALL_FILE_SET_DRIFT`；任一文件字节改变时返回 `INSTALL_BYTE_DRIFT`。

## 覆盖旧 8 卡安装

对旧 8 卡目标使用同一个 target、一个新的 state 路径执行 install。安装器会把整个旧目标移到 backup，再放入全新包。

覆盖后检查：

1. verify 返回 `VERIFIED / OK`；
2. active target 中没有 `knowledge/public/`；
3. active target 中没有 `knowledge/archive/`；
4. active target 中没有 `query-public-card.mjs` 或 `query-candidates.mjs`；
5. manifest 只列入口、5 个合同、安装文档、许可证和安装器；
6. state 的 `previous_target.backup` 指向可恢复旧目标。

不要手工删除 backup。确认不再需要恢复后，再按组织的 30 天保留规则处理。

## 知识源绑定

安装完成后，在新的宿主会话中显式触发 `$dbs-knowledge`，并把本轮获准的私域知识库根目录交给 Helpdesk。运行顺序必须是：

```text
知识库根目录与权限
→ SOURCE_OF_TRUTH.md
→ 完整性收据
→ 按导航定位派生文件
→ 同一来源标识回读导航指定的原始文件和必要上下文
```

不要把知识库根目录写进公开包、release manifest 或普通日志。宿主无法发现 Skill、根目录未提供、权限不足或导航不可读时，正确结果是 `SOURCE_UNAVAILABLE`。

## 回滚

install 覆盖过旧目标时：

```bash
node "/absolute/path/to/installed-skill/scripts/manage-install.mjs" rollback \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"
```

rollback 会把当前候选移到可恢复目录，并把旧目标 byte-identical 恢复到原 target。state 更新为 `ROLLED_BACK`。

## 卸载

```bash
node "/absolute/path/to/installed-skill/scripts/manage-install.mjs" uninstall \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"
```

uninstall 不直接删除当前包，而是移动到返回的 `recoverable_copy`。如果 install 前有旧目标，卸载会恢复旧目标。state 更新为 `UNINSTALLED`。

## fail-closed 状态

| reason code | 含义 |
|---|---|
| `MANIFEST_UNAVAILABLE / MANIFEST_INVALID` | 发布白名单不存在或格式无效 |
| `RELEASE_FILE_PATH_FORBIDDEN` | 白名单试图包含私密、开发或危险路径 |
| `INSTALL_FILE_SET_DRIFT` | 安装目录多文件、少文件或残留旧运行面 |
| `INSTALL_BYTE_DRIFT` | 安装字节与 state 不一致 |
| `EXISTING_TARGET_UNSAFE` | 目标不是普通目录或是软链 |
| `STATE_PATH_UNSAFE` | state 不是普通文件路径或是软链 |
| `SOURCE_UNAVAILABLE` | knowledge 的外部 Skill、私域路径、权限或导航不可用；这是对话合同状态，不是安装器 reason code |

失败时先保留 state、backup 和命令输出，不要用手工复制覆盖现场。
