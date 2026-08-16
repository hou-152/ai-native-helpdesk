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
