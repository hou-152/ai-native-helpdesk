# 运行脚本安全复验

## 可复现门

仓库内 6 个子 Skill 运行脚本使用下面的确定性检查：

```bash
python3 tools/security_scan.py
```

该检查固定覆盖：

- 6 个运行脚本全部存在，并通过 `node --check`；
- 用 Node.js 内置解析器按 AST 读取 import，允许项仅为 `node:path`、`node:process` 和 `node:url`；注释、换行不能绕过 allowlist；
- 禁止网络模块和网络客户端；禁用调用目标不能通过变量别名、sequence、成员引用或 global 对象逃逸；
- 禁止子进程、动态代码执行、可执行 constructor 链、环境变量读取和文件写入；`process` 只允许直接访问 `argv`、`stdout`、`stderr`、`exitCode`，禁止别名逃逸和计算属性；
- 每个通过项输出 SHA-256，便于把结果绑定到精确字节。

这个门证明的是指定静态规则在指定脚本字节上通过，不证明业务语义正确、没有所有类型的漏洞或第三方供应链安全。

## skills.sh／Socket 外部审计边界

2026-08-22 现场读回的 skills.sh 审计时间早于 PR #11 合并；子 Skill 摘要仍把相关目录描述为“无代码”。因此这些 `PASS`／`WARN` 没有覆盖 PR #11 新增的 6 个脚本，外部 Socket FOLLOW_UP 不能据此关闭。

只有同时满足以下条件，才把外部复扫记为完成：

1. skills.sh／Socket 的 `auditedAt` 晚于包含 6 个脚本的目标提交；
2. 审计详情的 package snapshot 或文件清单可以证明 6 个脚本均被纳入；
3. 新结果逐项审阅，`WARN` 有明确处置或保留理由。

skills CLI 只读取 `https://add-skill.vercel.sh/audit` 的既有结果，没有公开的本仓库分支重扫参数。仓库内检查负责补齐 PR 级代码覆盖；第三方重扫仍是独立的外部证据门。
