## 关联 Issue

Closes #

## 变更

- （填写变更摘要）

## 验证

- [ ] `python3 tools/quick_validate.py`
- [ ] `python3 tools/security_scan.py`（涉及运行脚本时）
- [ ] `node --test`
- [ ] `npm pack --dry-run`（涉及发布面时）

## 审查边界

- [ ] 本 PR 只含本任务文件，没有私域证据、凭证、`.env`、prompt、memory 或本机路径。
- [ ] 机器 `PASS` 没有被写成内容正确、Owner 批准、已经发布或用户问题已解决。
- [ ] 若运行脚本或 `EXPECTED_SCRIPT_SHA256` 有变化，非作者 Reviewer 已审阅精确脚本 diff，并把 hash 更新视为新字节授权；否则标记 N/A。
- [ ] 没有把 AST／文本规则描述为通用 JavaScript 验证器；未建模的 Proxy、getter／setter、iterator 和跨过程流由字节审查边界承接。
- [ ] 已说明对 README、release manifest、安装行为和项目状态文档的影响。
