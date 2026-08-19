# PublicCard 归档（2026-08-20）

8 张 PublicCard 已下线归档，不再作为 knowledge 路由的查询目标。

## 为什么下线

- 8 卡对 19 个真实问题（Owner 9 题 + 微信 10 题）正式 loader 结果为 `ALLOW 0 / MISS 19`。
- AB 测试显示：裸模型核心判断与人工批准卡重合约 80-90%，卡片增量主要是结构化边界/验证步骤/来源链接/版本，不是知识本身。
- 结论：知识库与检索问题不靠卡片形式解决，改走「语料 → 原子化 → BM25 检索」路线。

## 归档内容

- `cards/AIHD-PC-000001.json` ~ `AIHD-PC-000008.json`：8 张卡片正文（历史证据，字节不变）
- `index.json`：原 8 卡索引（绑定 revision/hash/scope_hint）

## 保留原因

- G12/G13b/Phase 6 逐卡批准的治理历史
- v0.9.0 release 包含这 8 卡，归档保留可审计回滚路径
- 未物理删除（trash > rm），未来如需恢复可整体迁回

## 当前路线

knowledge 路由改为：BM25 检索候选池（`ai-native-knowledge-base` 的 `candidates.jsonl`），返回相关对话摘录并标注「非已验证答案」。MISS 时明确 `UNKNOWN` + 最小下一步。
