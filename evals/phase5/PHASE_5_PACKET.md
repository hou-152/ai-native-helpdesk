# Phase 5 冻结执行包：安装解耦、Apache 2.0 与 G14 前置验收

日期：2026-08-18

状态：`FROZEN_BEFORE_IMPLEMENTATION`

基线：`9cee4e5fb6cf48555174e50e1e6386fbf7f43b26`

Owner 前置回执：`按推荐通过 G13b：批准 AC-G13A-20260818-001 → AIHD-PC-000004 v1.0.0 作为 NEW_CARD 正式发布；无修订、无撤回。完成正式投影、index 与 loader 回归后进入 Phase 5。`

G13b 后置证据：本地正式四卡包、正式 index、正式 loader 和 184／184 全量回归通过；私密反馈链 `real_loop_complete = true`。

## 1. 本阶段只证明什么

Phase 5 在 G14 前只完成本地工程验收：消除运行合同中的本机安装路径假设；落地 Apache License 2.0；提供显式、可验证、可回滚的安装生命周期；在与源码目录隔离的临时目标中完成安装读回；冻结社区试跑的参与者、范围、隐私、日志、公开表述和失败处置候选。

本地安装通过不等于社区试跑、远端发布、用户问题解决或跨平台支持。G14 前禁止触达社区参与者。

## 2. 安装合同

- 运行时只从当前 Skill 根目录解析 contracts、schemas、policies、scripts 和 public knowledge pack。
- 安装命令必须显式接收目标路径；不得扫描用户目录或猜测 `~/.agents/skills`。
- 只复制版本化 release allowlist；`.git`、evals、tests、私密 evidence、memory、日志和本机状态不得进入安装包。
- 安装先在目标同级 staging 目录生成并逐文件校验，再原子切换。
- 目标已存在时先重命名为可恢复 backup；安装失败必须恢复原目标。
- verify 必须检查 manifest 文件集合、字节 hash、额外文件和符号链接。
- uninstall／rollback 不直接删除安装目录；把当前安装移到可恢复路径，并在存在旧目标时恢复旧目标。
- 状态收据位于调用者指定或目标同级路径，记录本机路径只属于本地控制面，不进入公开仓库。

## 3. 冻结安装矩阵

机器可读矩阵见 `INSTALL_MATRIX.v1.json`。本轮必须完成：

1. 隔离 fresh target，目标路径含空格；从无关 cwd 调用安装、verify 和查询。
2. 在安装包内分别查询至少两张独立批准卡；标准问题 `ALLOW`，不适用近邻保持 `MISS`。
3. pre-existing target 安装：旧目标进入 backup；rollback 后旧 sentinel byte-identical 恢复。
4. fresh target uninstall：当前安装移到可恢复 removed 路径；目标不再可见，收据可读回。
5. 篡改安装卡片后 verify fail-closed；不得把失败写成通过。
6. release allowlist 不含 `.git`、evals、tests、evidence、memory、`.env`、日志或私密 ledger。

当前机器只有 macOS arm64／Node.js 24 运行时，无可用 Docker／Podman；因此不声明 Linux、Windows 或其他 Node major 已验证。跨平台状态保持 `NOT_VERIFIED`，不阻断本轮明确限定的 macOS 陌生目录验收。

## 4. Apache 2.0

- 仓库根目录新增标准 Apache License 2.0 全文。
- `SKILL.md` frontmatter 使用 SPDX 标识 `Apache-2.0`。
- README 明示代码、contracts、schema、公开 PublicCard 与文档的许可边界；私密语料、证据和未公开候选从未进入公开包，不由该 LICENSE 授权。

## 5. G14 前置包

必须给 Owner 提交：

- 参与者：人数、身份类别、是否已经取得明确同意；G14 前一律未触达。
- 范围：安装、至少两张独立批准卡、一个歧义／不适用反例、卸载或回滚。
- 隐私：不采集原始群聊、凭证、用户目录、成员身份或未最小化原问句。
- 日志：只保存安装状态、稳定 reason code、card ID／revision、时间和 hash；不保存卡片以外的用户正文。
- 公开表述：只能称“受控试跑观察”，不得称已解决、已部署网站、完整知识库或普遍有效。
- 失败处置：安装失败立即回滚；`DENY` 不读取正文；隐私异常停止；参与者撤回即停止并保留最小化收据。

## 6. 正反验收

正向：release allowlist 安装、verify、两卡查询、近邻 MISS、旧目标 rollback、fresh uninstall 和状态读回全部通过。

反向：绝对路径残留；目标或 state 软链；包内多余文件；安装内容 drift；失败后旧目标丢失；未获 G14 即外联；把临时目录 fixture 写成真实社区验收。

## 7. 文件白名单

允许新增或修改：

- `LICENSE`
- `README.md`
- `SKILL.md`
- `contracts/**`
- `docs/INSTALL.md`
- `release-files.v1.json`
- `scripts/manage-install.mjs`
- `tests/install-lifecycle.test.mjs`
- `evals/phase5/**`
- 状态同步直接相关的 `PROGRESS.md`、`BLOCKED.md`

禁止修改正式四张 PublicCard 正文、正式 index、Phase 0—4 不可变收据或任何私密材料。

## 8. 停点

本地矩阵、LICENSE 读回或回滚任一失败，停在 Phase 5 修复。全部通过后提交 G14；没有 G14 逐项批准参与者和试跑范围时，只报告本地工程完成，不触达社区。
