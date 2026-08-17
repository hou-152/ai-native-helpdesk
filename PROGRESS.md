# v0.3 发布门进度

## 开工回执

- 目标：只让四门精确通过的 PublicCard 正文进入模型。
- 顺序：冻结基线 → 建 schema／门禁 → 接入 Skill → 测试 → 反向验证 → 推送功能分支。
- 基线：`main@5b6e492ff0938cac03212762943e57f1e01d12c9`，8 个跟踪文件，工作树干净。
- 实现边界：只建门和空公开知识包，不发布任何真实知识卡。
- 最大风险：先读后判导致被拒正文或敏感 canary 泄露。
- 次要风险：社区包路径越界、同问题多卡冲突、文档绕过加载器。

## 已完成

- 任务 0：基线、Node `v24.15.0` 和 4 个保护文件 SHA 核对通过。
- 任务 1：严格 schema、空公共索引和“先判状态、后暴露正文”脚本完成。
- 任务 2：README、入口与 knowledge contract 已接入唯一加载路径，版本为 `0.3.0-gate-trial`。
- 任务 3：canonical `node --check` 通过；`node --test` 为 61／61，fail／cancelled／skipped／todo 均为 0。
- 独立终审：白名单、保护 SHA、0 张真实卡、路径／隐私／schema／状态门均通过；未发现新的可复现高风险阻断项。

## 等价镜像反向证明

- 方法：用 `rsync -a --exclude=.git` 复制当前工作树到新建系统临时目录；`diff -qr --exclude=.git` exit 0。
- 关键文件在 canonical 与镜像中的 SHA-256 分别相同：脚本 `e7d598625a8daaea1ace51d66b57bf5d842ebc6c0ab0574a9ddd7dd58d82bd78`；schema `40779ff9c0a97d0fbb574d9d2951f002b0eeb36b6d6775a1993a4287282e31a2`；测试 `855dae20bca585a7b9da6ff8953a90e80a8b8b199390b318e981f5abb7570a10`；空索引 `87b2650aa05656a31e54d1a49740cf00421dc3124aae16f85ec8ad22950c6132`。
- 破坏前镜像：exit 0；61 tests／61 pass，其余全 0。
- 唯一破坏：把 `card[key] !== expectedValue` 改为 `key !== "editorial" && card[key] !== expectedValue`，仅放宽 editorial 门。
- 破坏后镜像：exit 1；预定测试 `non-exact gate editorial is denied` 变红；60 pass／1 fail，其余全 0；不是语法、导入、路径或 fixture 故障。
- 镜像已移出活动临时目录并放入系统废纸篓，可恢复；canonical 未被破坏。

## Git 交付边界

- 变更只允许进入 `codex/v0.3-publication-gate`；禁止直接推送或合并 `main`。
- 本文件不自写提交 SHA 或远端 SHA，避免回执修改自身；最终一致性由仓库外的 `git ls-remote --heads` 结果证明。
- 首次推送被 GitHub Push Protection 拒绝：合成测试使用了完整供应商 token 形状。它不是真凭证，但仍已换成明确的非供应商 fixture；交付分支从原 `main` 生成干净历史，不绕过保护。

## 2026-08-18 v0.3.2 contracts trial

> `v0.3.2-contracts-trial` 是本次工作标签；`SKILL.md` 的有效版本仍为 `0.3.0-gate-trial`。

### 开工回执

- 基线：公开仓库 `main`，工作树干净；本次只改 4 个文件：3 个 contract + SKILL.md 修订记录。
- 背景：外部独立评估按“离可用差多远”给合同计分——action 8/10、thinking 7/10、good-question 5.5/10、safety 6/10；本轮修得分最低的两项和 action 缺失的闭环。
- 实现边界：只改合同内容，不改 schema、不改脚本、不改 PublicCard、不改发布门行为。

### 改动与理由

| 文件 | 改动 | 理由 |
|---|---|---|
| `contracts/good-question.md` | 固定 5 选 1 菜单改为 2-3 个基于当前缺口的自然选项；用户回复后重新守门判模，不做机械映射 | 场景类别（信息管家/工作助理等）描述的是用户角色，不是本轮认知动作，两者不一一对应；固定菜单让对话变填表 |
| `contracts/safety.md` | “想死但没迫近不算红线”改为分级评估（普通情绪→无计划自杀表达→有具体计划→正在行动）；服务地区不明时先问地区+建议联系身边人 | 不迫近 ≠ 不需要关注；不能因用户没主动说计划就默认没有计划 |
| `contracts/action.md` | 新增“最小闭环”节：最小动作→回传结果→判断实际卡点→下一步；没回传时最多追问 1 次 | 没有结果回传，action 会退化成“说一句正确的话就结束”，价值在于让用户真的动一次 |
| `SKILL.md` | 修订记录加 v0.3.2-contracts-trial 行 | 版本纪律 |

### 验证

- 文档类改动，无代码变更；`node --test` 仍应 64／64 全绿（未改任何测试与脚本）。
- 人工审查：三个合同与新 SKILL.md 主路由表、失败规则一致，无互相矛盾。

### 已知边界

- 合同内容仍是“设计良好但未经过真实对话验证”；需要通过真实对话盲测才能证明有效。
- 未改 thinking（已含反模式清单，7/10 可接受）；下一步优先做 20 个真实对话盲测，而不是继续改文档。

### Git 交付边界

- 本次变更只进入 `codex/v0.3.2-contracts-trial`，禁止直接推送或合并 `main`。
- 本文件不自写最终提交 SHA；最终一致性由仓库外的远端分支和 GitHub PR 读回证明。
