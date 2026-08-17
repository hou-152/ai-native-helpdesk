# Phase 5 本地工程验收报告

日期：2026-08-18

状态：`ENGINEERING_ACCEPTANCE_PASS_AWAITING_G14`

实现 commit：`c8ace8a25a7e8663d41816f97e60304f6f763201`

冻结矩阵：`INSTALL_MATRIX.v1.json`

结果矩阵：`INSTALL_MATRIX_REPORT.v1.json`

## 已证实事实

- 运行合同不再依赖预设全局安装目录或本机用户绝对路径；资源只相对于当前 `SKILL.md` 根目录解析。
- 标准 Apache License 2.0 已进入仓库，`SKILL.md` 使用 `Apache-2.0` SPDX 标识；私密语料、证据、候选和安装 state 明确不在公开 release 包内。
- 安装器只复制版本化 allowlist。本轮安装为 28 个文件，隔离目标路径含空格，并从与源码无关的 cwd 完成 install 与 verify。
- 安装包内 `AIHD-PC-000001 v1.1.0` 和 `AIHD-PC-000004 v1.0.0` 均实际返回 `ALLOW`；模型权重训练近邻保持 `MISS / NO_MATCH`。
- fresh uninstall 后目标不存在，当前安装被移动到可恢复目录，state 为普通 0600 文件并可读回。
- pre-existing target 的 rollback 恢复 sentinel 原始字节；在旧目标已备份后注入 state 写入失败，也会自动恢复旧目标。
- 篡改安装卡片后 verify 返回 `INSTALL_BYTE_DRIFT`；目标软链和 state 软链分别 fail-closed。
- `node --test` 为 192／192 PASS，fail／cancelled／skipped／todo 均为 0。

## 没有被证实的状态

- Linux、Windows 和其他 Node major 均为 `NOT_VERIFIED`。
- 本轮只是本地陌生目录工程验收，不是陌生参与者或真实社区试跑。
- 分支没有 push、开 PR 或 merge；远端 `main` 仍不是本轮实现。
- 安装成功与 PublicCard `ALLOW` 都不等于用户问题已解决、网站已部署、完整知识库上线或普遍有效。

## 隐私与证据

公开结果文件只保存稳定状态、card ID／revision、hash 和聚合计数。包含本机路径的安装 state 与实际读回收据留在私密控制面；公开文件只登记 receipt ID 与 SHA-256，不登记本机路径、原始用户问题、凭证或参与者身份。

## 下一停点

提交 `G14_OWNER_DECISION_PACKET.md`。没有 Owner 对邀请对象、试跑范围、隐私、日志、公开表述和失败处置的逐项授权，不触达社区、不传递试跑包，也不把 Phase 5 写成完整社区验收。
