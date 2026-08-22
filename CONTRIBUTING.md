# 贡献与交付追踪

本仓库把实现、审查、合并、发布和用户结果视为不同状态。机器测试通过不自动授权合并或关闭 Issue。

## 功能变更

1. 从最新 `main` 创建功能分支，不直接向 `main` 推送功能提交。
2. 每项功能通过 Pull Request 进入 `main`；PR 正文使用 `Closes #<issue>` 或 `Fixes #<issue>` 关联对应 Issue。
3. 合并前必须通过仓库 CI，并由非作者完成代码审查。没有可用审查者时保持 PR 打开，不用作者自审冒充独立 review。
4. 只提交任务白名单内的公开文件。私域证据、凭证、`.env`、prompt、memory、本机日志和绝对路径不得进入公开仓库。

## Issue 关闭

- 功能 Issue 只能在交付物已进入目标分支且验收结果可复现后关闭。
- 关闭引用必须指向对应 PR；历史上没有 PR 的交付，至少要在关闭评论中列出完整 commit URL、验证命令、结果和已知边界。
- PR 创建、commit 存在、CI `PASS`、合并、发布和用户问题解决分别记账，不互相替代。

## 本地验证

```bash
python3 tools/quick_validate.py
python3 tools/security_scan.py
node --test
npm pack --dry-run
```

`tools/security_scan.py` 是覆盖 6 个随包 Node.js 运行脚本的确定性静态门。它不冒充 skills.sh／Socket 的第三方审计；第三方结果只有在审计元数据绑定包含当前脚本的快照时，才能作为当前安全收据。
