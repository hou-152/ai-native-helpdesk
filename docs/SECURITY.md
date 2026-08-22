# 运行脚本安全复验

## 授权边界

本仓库采用“已审核字节”边界：`tools/security_scan.py` 内的 `EXPECTED_SCRIPT_SHA256` 是人工维护的授权清单，不是可自动刷新或仅凭机器结果更新的缓存。运行脚本的任意字节变化都会先因 hash 不匹配而失败；若 PR 同时修改运行脚本和批准 hash，非作者 Reviewer 必须审阅精确脚本 diff，批准该次 hash 更新。Reviewer 的批准才授予新字节进入授权清单的权限。

AST 与文本规则只做纵深防御，**不是**通用 JavaScript 验证器，也不承诺对 Proxy、getter／setter、iterator 或所有跨过程数据流做完备建模。机器 `PASS` 不能单独证明任意新脚本安全，更不能替代上述字节审查。

## 可复现门

仓库内 6 个子 Skill 运行脚本使用下面的确定性检查：

```bash
python3 tools/security_scan.py
```

该检查固定覆盖：

- GitHub Actions 在任何会执行子 Skill 运行脚本的快验或测试之前先运行本安全门；
- 6 个运行脚本全部存在、字节匹配安全门内显式批准的 SHA-256，并通过 `node --check`；未获授权的新字节不会仅因 AST 规则漏报而放行；
- 用 Node.js 内置解析器按 AST 读取 import／re-export，允许项仅为 `node:path`、`node:process` 和 `node:url`；注释、换行不能绕过 allowlist，`node:process` 不能整体、默认或按禁用属性转出；
- 禁止网络模块和网络客户端；禁用调用目标不能通过变量别名、sequence、成员引用或 global 对象逃逸；
- 纵深规则检查子进程、动态代码执行、反射式属性／原型访问、无法静态解析的解构 key、已建模的计算值传播与可执行 constructor 链、环境变量读取和文件写入；`process` 只允许直接访问 `argv`、`stdout`、`stderr`、`exitCode`，并检查已建模的别名逃逸、计算属性和禁用 re-export；
- 每个通过项输出 SHA-256，便于把结果绑定到精确字节。

这个门证明的是“字节匹配已批准清单，且指定静态规则在这些字节上通过”；不证明业务语义正确、没有所有类型的漏洞或第三方供应链安全。

## skills.sh／Socket 外部审计边界

2026-08-22 现场读回的 skills.sh 审计时间早于 PR #11 合并；子 Skill 摘要仍把相关目录描述为“无代码”。因此这些 `PASS`／`WARN` 没有覆盖 PR #11 新增的 6 个脚本，外部 Socket FOLLOW_UP 不能据此关闭。

只有同时满足以下条件，才把外部复扫记为完成：

1. skills.sh／Socket 的 `auditedAt` 晚于包含 6 个脚本的目标提交；
2. 审计详情的 package snapshot 或文件清单可以证明 6 个脚本均被纳入；
3. 新结果逐项审阅，`WARN` 有明确处置或保留理由。

skills CLI 只读取 `https://add-skill.vercel.sh/audit` 的既有结果，没有公开的本仓库分支重扫参数。仓库内检查负责补齐 PR 级代码覆盖；第三方重扫仍是独立的外部证据门。
