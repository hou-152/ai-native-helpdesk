# PP 历史记录

> 本页只记录 2026-08-18 的 PublicCard／Phase 0—6 历史收尾，不是当前运行入口，也不授予新的发布、召回、制卡或反馈操作权限。

## 历史状态

- 远端 `main@4c066af7` 和 `v0.9.0` 保留 8 张已发布 PublicCard。
- 当时的 `198／198 PASS`、32 文件可逆安装和 PR #5 merge 只证明那一版的工程与发布状态。
- 这些历史对象没有被删除或改写；迁移候选把它们从 active manifest 移出，并在本机日期化回收目录保留 30 天。

## 当前入口

当前未发布候选是 `codex/knowledge-source-migration`。它只保留：

```text
守门
→ 判模
→ 按需加载 contract
→ knowledge：宿主调用 $dbs-knowledge
→ 显式 source 的 SOT → locator → raw/context 复核
→ 回答或 UNKNOWN／HOLD
```

候选 active PublicCard 为 `0`，不含公共 index、卡片 loader、Phase 1—4 运行代码或反馈账本。候选没有 push、PR、merge、tag 或 Release 授权；宿主无法调用 `dbs-knowledge` 或调用者未提供显式 source 时，结果必须是 `SOURCE_UNAVAILABLE`。

## 证据边界

历史卡片可加载不等于当前候选可用；机器测试通过不等于私域内容正确、用户接受或问题已解决。30 人产品验证仍为 `0／30 / OUTCOME_UNKNOWN`。

详细历史收据保留在 Git 历史和本机回收目录；不在本页复制私域原文、成员／消息标识、凭证或私密 ledger。
