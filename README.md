# 单词盒子 WordBox · 鸿蒙 7 旅行英语学习 App

> 面向「准备出国旅游」人群的鸿蒙 7（HarmonyOS NEXT / API 12+）移动端 App：
> 每天 10 分钟 AI 对话学单词 + 艾宾浩斯复习曲线 + 生词本 + 每日打卡 + 打卡日历 + 学习统计。

本仓库是该项目的 **0→1 完整交付仓库**，包含产品文档、架构设计、任务拆解、可运行工程代码、测试用例与测试报告，以及开发过程中的协作文档。

---

## 仓库结构

```
.
├── wordbox-harmony-delivery/          # 交付主体（代码 + 6 份文档）
│   ├── PRD.md                         # 产品需求文档
│   ├── ARCHITECTURE.md                # 系统架构设计
│   ├── TASK_BREAKDOWN.md              # 任务拆解清单 + API Spec
│   ├── TEST_REPORT.md                 # 测试报告（231/231 通过）
│   ├── DELIVERY_SUMMARY.md            # 项目交付说明（入口文档，建议先读）
│   ├── README.md                      # 工程运行说明
│   ├── core/src/                      # 轨 A：纯 TS 领域内核（唯一事实源）
│   ├── preview/                       # 轨 C：Vite + 原生 TS 的 H5 预览
│   ├── harmony/                       # 轨 B：鸿蒙 ArkTS 工程（镜像内核）
│   ├── adapters/preview/              # H5 侧端口适配器
│   ├── tests/                         # 18 个测试文件 / 231 个用例
│   └── scripts/                       # core 镜像同步与校验脚本
│
├── HANDOFF.md                         # 上下文交接记录（任务全过程）
└── .workbuddy/                        # 开发过程文件
    ├── memory/                        # 项目记忆与工作日志
    └── reference/                     # 各角色任务书与早期文档快照
```

## 三轨同源架构

`core/src/**` 是**唯一事实源**（纯 TypeScript，零平台依赖），另外三条消费路径共用它：

| 轨道 | 目录 | 复用方式 |
| --- | --- | --- |
| A 领域内核 | `core/src/**` | 唯一事实源，Vitest 直接测试 |
| B 鸿蒙 App | `harmony/entry/src/main/ets/**` | `npm run sync:core` 机械镜像（禁止手改） |
| C H5 预览 | `preview/**` | Vite alias `@core` 直接 import 源文件，零拷贝 |

镜像一致性由 `core-manifest.json` 的 sha256 账本 + `npm run check:core-sync` 校验，手工改镜像会 exit 1。

## 快速开始

```bash
cd wordbox-harmony-delivery
npm install

npm test              # 231 个用例全量通过（已固化为串行执行）
npm run typecheck     # 内核严格门禁 + 预览工程类型检查
npm run dev           # H5 预览 http://localhost:5173
npm run check:core-sync   # 校验鸿蒙内核镜像与源码一致
```

轨 B 需要在 DevEco Studio（API 12）中打开 `harmony/` 目录编译运行；本仓库的测试与预览不依赖鸿蒙 SDK。

## 质量现状

| 项 | 结果 |
| --- | --- |
| 测试 | 18 文件 / 231 用例 / 231 通过 / 0 失败 / 0 跳过 |
| 覆盖率 | 语句 94.14% · 分支 82.64% · 函数 88.8% · 行 94.14% |
| 类型检查 | 内核与预览双配置 `tsc --noEmit` 通过 |
| 内核镜像 | 32 ↔ 32 一致 |

已知限制详见 `wordbox-harmony-delivery/DELIVERY_SUMMARY.md` §8：鸿蒙轨未在本环境编译（缺 SDK）、H5 无自动化 UI/E2E 测试、`coverage/html` 未产出。

## 关键设计决策

- **SM-2 间隔序列**：`1 → 6 → 15 → 38` 天（`SM2_SECOND_INTERVAL_DAYS = 6`，采用经典 SM-2），掌握阈值 30 天。
- **AI 能力**：鸿蒙端侧推理为主（`OnDeviceAI` + `InferenceEngine` 端口），离线降级 `ScriptedAI`，测试用 `MockAI`。
- **游客模式**：数据照常落盘，但进度统计在**数据读取层**门禁（不靠 UI 隐藏）；游客数据仅保留 7 天滑动窗口。
- **登录引导**：第 5、7 天提示；第 7 天后每天提示一次，弹窗内提供「不再提示」。
- **游客进度迁移**：登录成功后弹窗由用户选择是否合并，合并只取 7 天窗口内数据，写入为单次原子 `batchWrite` + 幂等账本。
