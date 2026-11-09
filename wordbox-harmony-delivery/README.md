# 单词盒子 WordBox · 旅行情景英语

三轨同源工程：`core/src/**` 是**唯一事实源**（纯 TypeScript 领域内核），H5 预览（Vite）直接 import 它，鸿蒙工程（DevEco / ArkTS）通过机械镜像复用它，Vitest 直接测试它。

```
                    ┌──────────────────────────┐
                    │  core/src/**  (唯一事实源) │
                    │  纯 TS · 零平台依赖        │
                    └────────────┬─────────────┘
            ┌───────────────────┼───────────────────┐
            │                   │                   │
     alias @core          sync:core 镜像      Node 直接 import
            │                   │                   │
   ┌────────▼────────┐  ┌───────▼────────┐  ┌──────▼───────┐
   │ 轨 C: preview/  │  │ 轨 B: harmony/ │  │ tests/**     │
   │ Vite + 原生 TS  │  │ ArkTS / ArkUI  │  │ Vitest       │
   │ npm run dev     │  │ DevEco Studio  │  │ npm test     │
   └─────────────────┘  └────────────────┘  └──────────────┘
```

---

## 1. 环境要求

| 项 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | >= 22 | 本工程在 Node 22.22.2 / npm 10.9.7 上验证 |
| DevEco Studio | API 12 / HarmonyOS 5.0.0(12) | **仅轨 B 需要**；本交付环境没有安装，故轨 B 只落盘、不编译、不声称实跑 |

轨 A / C / 测试完全不依赖 DevEco、鸿蒙 SDK、真机或任何网络服务。

---

## 2. 快速开始

```bash
npm install

npm run typecheck     # 内核严格门禁 + 预览工程类型检查（必须通过）
npm test              # Vitest 全量单测 / 集成测试
npm run dev           # H5 预览 http://localhost:5173
npm run build         # 预览工程生产构建（vite build）
```

核心同步（改动 `core/src/**` 后必跑）：

```bash
npm run gen:manifest   # 重算 core-manifest.json（sha256）
npm run sync:core      # core/src/**/*.ts -> harmony/.../ets/core/**/*.ets
npm run check:core-sync  # 校验镜像与源码一致；手工改镜像会 exit 1
```

> `sync:core` 是**机械复制 + 固定头注释**，不会改写任何业务字节，可重复执行（幂等）。
> 镜像文件头部标有 `AUTO-GENERATED FILE — DO NOT EDIT BY HAND`。

---

## 3. npm scripts

| 命令 | 作用 |
| --- | --- |
| `npm test` | `vitest run`（全量） |
| `npm run test:unit` | 仅 `tests/unit/**` |
| `npm run test:integration` | 仅 `tests/integration/**` |
| `npm run test:coverage` | v8 覆盖率，`core/src/**` |
| `npm run test:watch` | 监听模式 |
| `npm run typecheck` | `tsc` 内核严格配置 + 预览配置 |
| `npm run typecheck:core` | 仅内核（`lib: ["ES2022"]`，零 DOM / 零 Node 类型） |
| `npm run dev` | Vite 预览开发服务器 |
| `npm run build` | Vite 生产构建 |
| `npm run preview` | 本地预览构建产物 |
| `npm run gen:manifest` | 生成 `core-manifest.json` |
| `npm run sync:core` | 同步鸿蒙内核镜像 |
| `npm run check:core-sync` | 校验镜像一致性 |

---

## 4. 目录结构

```
wordbox-harmony-delivery/
├── core-manifest.json              # 内核源码 + 镜像字节的 sha256 账本
├── index.html                      # 轨 C 入口
├── package.json / tsconfig*.json
├── vite.config.ts / vitest.config.ts
│
├── core/src/                       # 轨 A：唯一事实源（纯 TS）
│   ├── models/                     # errors.ts / types.ts / constants.ts
│   ├── utils/                      # date.ts / id.ts / collection.ts
│   ├── data/                       # seedWords.ts (240 词) / scriptTemplates.ts (24 套脚本)
│   ├── ports/                      # ports.ts / keys.ts / codec.ts
│   ├── adapters/                   # memoryStorage.ts / systemClock.ts
│   ├── services/                   # 20 个 Service（见下）
│   └── index.ts                    # @core barrel + createKernel(ports)
│
├── adapters/preview/               # 轨 C 平台适配
│   ├── localStorage.ts             # DOM API 唯一落点
│   ├── fakeClock.ts                # 可推进时间（D1→D8 / 跨月）
│   ├── offlineAccountProvider.ts   # 模拟华为账号成功/取消/网络错误/Kit 不可用
│   └── previewAI.ts                # primary 可强制失败，fallback 恒为 ScriptedAI
│
├── preview/
│   ├── main.ts                     # createKernel 装配 + 全局上下文
│   ├── context.ts / router.ts / style.css
│   ├── components/                 # modal / typeADialog / typeBDialog / gateView / shell / clockPanel
│   └── pages/                      # home / chat / vocabulary / calendar / stats / account
│
├── harmony/                        # 轨 B：DevEco Studio 工程（不在此环境编译）
│   ├── AppScope/ build-profile.json5 / oh-package.json5 / hvigorfile.ts
│   └── entry/src/main/
│       ├── module.json5 / resources/
│       └── ets/
│           ├── core/               # ← sync:core 生成的机械镜像
│           ├── adapters/           # Preferences / Clock / InferenceEngine / AccountKit
│           ├── app/                # AppState (@Observed) / AppBootstrap
│           ├── entryability/       # EntryAbility
│           ├── components/         # LoginGuideDialog(A) / MergeChoiceDialog(B) / GateView / DialogLayer
│           └── pages/              # 6 个 @Entry 页面
│
├── scripts/                        # gen-core-manifest.mjs / sync-core.mjs / check-core-sync.mjs
├── tests/                          # QA 单测与集成测试
└── docs/                           # 架构师产出的类图 / 时序图
```

### `core/src/services/` 清单

`scheduler` · `quality` · `prompt` · `scriptedAI` · `mockAI` · `onDeviceAI` · `aiRouter` · `scene` · `progressGate` · `repository` · `retention` · `account` · `checkin` · `stats` · `wordbook` · `loginPrompt` · `migration` · `appFacade`。

所有外部依赖（`StorageService` / `Clock` / `AIService` / `AccountProvider` / `InferenceEngine`）都通过 `createKernel(ports)` 注入；内核中**没有** `fetch` / HTTP / socket / DOM / Node 专有 API / `@ohos.*`，Service 内也没有 `Date.now()`。`Result<T>` 统一错误信封，Service 方法不抛异常。

---

## 5. 不可妥协的业务口径

| 规则 | 常量 / 实现位置 | 值 |
| --- | --- | --- |
| 每日打卡目标 | `DAILY_GOAL_SECONDS` | `600` |
| 游客保留窗口 | `GUEST_RETENTION_DAYS` | `7`，窗口 `[today-6, today]` |
| 登录引导触发日 | `LOGIN_PROMPT_DAYS` | `[5, 7]` |
| D8 起每日弹 | `PROMPT_DAILY_AFTER_DAY` | `7` |
| SM-2 初始 EF / 下限 | `SM2_INITIAL_EF` / `SM2_MIN_EF` | `2.5` / `1.3` |
| **SM-2 第二次间隔** | `SM2_SECOND_INTERVAL_DAYS` | **`6`**（OAQ-1 裁决，间隔序列 `1 → 6 → 15 → 38`，由常量推导，禁止硬编码） |
| 掌握阈值 | `SM2_MASTERED_INTERVAL_DAYS` | `30` |
| AI 主 provider 重试 | `AI_MAX_RETRY` | `1`（总尝试 ≤ 2） |

### SM-2（`scheduler.ts`）

纯函数、不可变、入参 `Object.freeze` 可测。`q < 3` → `repetitions = 0`、`intervalDays = 1`；`q >= 3` → 第 1 次 `1` 天、第 2 次 `SM2_SECOND_INTERVAL_DAYS`、之后 `max(1, round(旧 interval × EF))`；`interval >= 30` 置 `Mastered`；断更 `> 7` 天 `rebaseAfterGap()` 降级重排。非法 `quality` 原样返回，不写调度。

### 两类时间口径

- `Clock.todayYMD()`：本地年月日，负责 00:00 日切（唯一允许 `new Date()` 的是 `systemClock.ts`）。
- `addDays` / `diffDays` / `dayIndexOf` / `windowFrom` / `monthStartYMD`：纯整数 Gregorian UTC 日序号，免疫 DST 与本地时区偏移。

### 登录引导类型 A（`loginPrompt.ts`）

`decide()` 的 8 分支短路顺序：

1. 已登录 → 不弹
2. 无游客数据 → 不弹
3. 7 天窗口为空 → 不弹
4. `neverPrompt` → 不弹
5. 当日已弹（`lastPromptDate`）→ 不弹
6. `d ∈ [5, 7]` → **弹**（D5 / D7）
7. `d > 7` → **弹**（D8 起每天最多 1 次）
8. 其余（D1~D4 / D6）→ 不弹

三动作：`去登录` / `暂不` / `不再提示`。`applyAction()` 不修改 `firstStudyYMD`；`onShown()` 持久化 `lastPromptDate`。

### 两类弹窗严格分离

- **类型 A**：仅 `LoginPromptService.decide()` 在游客态冷启动产出。
- **类型 B**：仅 `onAuthSucceeded()` / `MigrationService.detect()` 在**授权成功后**产出。类型 B 链路不读取 `neverPrompt`。
- 时序：A → 授权成功 → B。

### 迁移合并（`migration.ts`）八步

1. 登录态校验
2. `loadGuestSnapshot()`（内含 `[today-6, today]` 窗口过滤，窗口外仅计 `skippedOutsideWindowCount`）
3. 快照为空 → 零写入
4. 幂等账本命中 → 零写入
5. 冲突裁决：同日 CheckIn 取较大 `activeSeconds` **不相加**；StudyRecord 取 `progressRank` 较大且禁止 Mastered 回退；生词本按 `Word.id` / 归一化 key 去重
6. 单次原子 `batchWrite` + 写账本（**游客分区不删除**）
7. `rebuildStreak()` + `recomputeAfterMerge()`
8. 调用方刷新首页 / 日历 / 统计三页

### 读取层门禁 F-20

`StatsService.summary()` / `calendar()` 内部先 `gate.require(session)`；游客态返回 `Gated<T>{ allowed: false, data: undefined }`。UI 不得自行判断会话态后偷读数据。CheckIn / StudyRecord / Word / ChatMessage **照常落盘**。

### QUALITY 协议（`quality.ts`）

确定性字符串扫描取最后一个合法 `[[QUALITY:n]]`；越界 / 缺失 / 非整数 → `quality = -1`，该轮**不回写调度、不弹错、不中断计时**。`ScriptedAI` 与 `AIProviderRouter` 降级路径保证产出合法标签。

---

## 6. H5 预览演示路径（`npm run dev`）

右侧 / 顶部 **FakeClock 面板**可推进时间：

1. 首次冷启动 = D1。在「情景对话」页发若干条消息、`+600 秒` 触发打卡。
2. 依次「+1 天」推进，每天产生少量学习数据（否则 7 天窗口滑走后游客数据为空，按状态机正确地不弹窗）。
3. **D5** 冷启动 → 弹出**类型 A**「登录以保存学习进度」。
4. **D6** → 不弹；**D7** → 弹；**D8** 起 → 每天最多弹 1 次。
5. 在类型 A 点「不再提示」→ 类型 A 永久关闭；但授权成功后的**类型 B 仍会出现**。
6. 「跨月 +40 天」验证窗口清理与跨月日期运算；「重新冷启动」验证 D1 与 prune 幂等。
7. 「我的」页选授权结果（成功 / 取消 / 网络错误 / Kit 不可用）→ 模拟华为账号登录。
8. 授权成功 → **类型 B**「是否合并游客进度」→ 选「合并」→ 仅窗口内进度带入账号，日历 / 统计门禁解锁。
9. 「故障降级」开关：primary `AI_MODEL_NOT_READY` → 最多重试 1 次 → fallback `ScriptedAI`，对话仍推进且带合法 QUALITY 标签。
10. 游客态访问「日历」「统计」→ 整页 `GateView`，无任何进度数字。

浏览器数据存于 `localStorage`（`wordbox:` 前缀），「重置演示」清空。

---

## 7. 轨 B（鸿蒙）说明

```text
DevEco Studio → File > Open → 选择 harmony/ 目录 → Sync → Run
```

- `harmony/entry/src/main/ets/core/**` **不要手工编辑**：改 `core/src/**`，再跑 `npm run sync:core`。
- `npm run check:core-sync` 会逐文件比对 `core-manifest.json` 中的 sha256；手工改镜像一定失败（已实测：追加一行注释即 `exit 1`，还原后 `exit 0`）。
- 四个平台适配：`HarmonyPreferencesStorage`（`@ohos.data.preferences`）、`HarmonyClock`（本地日切）、`HarmonyInferenceEngine`（端侧 NPU/CPU 探测 + 无 SDK 时 `UNAVAILABLE` 降级）、`HuaweiAccountProvider`（`@kit.AccountKit`）。
- `AppBootstrap` 用**同一个** `createKernel(ports)` 装配，primary = `OnDeviceAI`，fallback = `ScriptedAI`；UI 页面不 import 任何厂商 Kit。
- `AppState` 是 `@Observed` 单例，`DialogLayer` 统一渲染类型 A / 类型 B；合并完成 `bump()` 驱动三页刷新。

> 本交付环境无 DevEco / 鸿蒙 SDK / 真机，轨 B **只落盘，未编译、未实跑**。请勿把 H5 预览的通过结果等同于鸿蒙端编译通过。

---

## 8. 内核纯净性约束（CI 可复查）

- `tsconfig.json` / `tsconfig.core.json`：`lib: ["ES2022"]`、`types: []`，内核目录不含 DOM / Node 类型。
- `tsconfig.preview.json`：仅轨 C 启用 `DOM` / `DOM.Iterable` 与 `@core` / `@adapters` alias。
- 禁 `any`；`unknown` 仅出现在 `ARCHITECTURE.md §825` 逐字规定的 `isIdempotent` 签名处。
- 唯一 `as T` 断言点是 `core/src/ports/codec.ts` 的 `decode<T>()`，且必须紧跟字段校验器。
- 禁 TODO / stub / 假返回值；禁循环依赖；内核禁 `fetch` / `XMLHttpRequest` / `WebSocket` / `process` / `Buffer` / `require`。
- `ports/keys.ts` 是 Storage Key 唯一拼接点：`guest:` / `user:{uid}:` / `global:` 三分区。

---

## 9. 文档索引

| 文件 | 内容 |
| --- | --- |
| `PRD.md` | 产品验收基线（P0 12 项） |
| `ARCHITECTURE.md` | 三轨架构、TS interface、SM-2 公式、Storage Key、3 张时序图 |
| `TASK_BREAKDOWN.md` | 逐文件清单、完整 API Spec、Shared Knowledge |
| `docs/class-diagram.mermaid` | 类图 |
| `docs/sequence-diagram.mermaid` | 时序图 |
| `core-manifest.json` | 内核源码 / 镜像 sha256 账本 |
