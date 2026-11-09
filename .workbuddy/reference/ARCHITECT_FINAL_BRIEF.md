# 架构师最终任务书（ARCHITECT_FINAL_BRIEF）— 正式 START

> **本文件是唯一有效指令**，覆盖此前所有输入。
> 1. **作废**产品经理 `software-product-manager` 直接发给你的全部 3 份「影响清单」（未经主理人中转，且含已推翻的旧 Q11 结论）。一切以本文件为准。
> 2. **现在正式 START，可以立即动笔写文件**，无需等待 PRD 补修完成。`PRD.md` 当前为 510 行版本，第三/四封修订正在进行；若你读到其中缺少 `F-22 / A12 / Q13 / 滑动窗口 / 不再提示`，属于正常状态，**不要等待、不要回退，以本文件第 2 节决议总表为准**。
> 3. 后续只接受来自 `team-lead` 的工作指令。

---

## 1. 项目与工程现实约束

- 产品：`wordbox_harmony` /「单词盒子」，**鸿蒙 7（HarmonyOS 7 / NEXT，API 12+）原生 ArkTS + ArkUI App**
- 用户：**准备出国旅游的人**；核心：**每天 10 分钟通过 AI 旅行情景对话学单词**
- 工程根目录：`C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/wordbox-harmony-delivery/`
- 上游 PRD：同目录 `PRD.md`（v1.1，11 章）
- **构建环境只有 Node 22.22.2 + npm 10.9.7，无 DevEco Studio / 鸿蒙 SDK / 真机**。用户要求「可运行的工程代码」+「完整的单元/集成测试用例及测试报告」，测试报告必须是**真实实跑结果**，不得虚构。

### 三轨架构（必须由你在文档中明确设计并固化复用边界，避免工程师写出三份互相矛盾的实现）

| 轨 | 职责 | 可运行性 |
|----|------|---------|
| **A. 纯 TypeScript 领域内核** | models / utils / services 全部零平台依赖；SM-2 调度、打卡、统计、账号会话态、7 天窗口策略、弹窗判定、迁移合并**全部在此**；纯函数、不可变更新、可注入 `clock` 与 `StorageService` | Node 下被测试框架直接 import 并实跑单测 + 集成测试；须兼容 ArkTS 严格子集（禁 `any`、禁 DOM/Node 专有 API、禁动态类型技巧） |
| **B. 鸿蒙 7 原生工程** | ArkTS + ArkUI 声明式页面（5+ 页面）、`@ohos.data.preferences` 或等效本地存储、端侧推理 `OnDeviceAI`、华为账号 `AccountKit` 实现、`ScriptedAI` 降级 | DevEco Studio 工程结构（AppScope / entry / build-profile / oh-package / module.json5 等），在装有 SDK 的机器上可编译 |
| **C. H5 可运行预览** | 复用**同一套领域内核** + 浏览器 localStorage 适配 + AI/账号对接层；5 个页面真实可交互 | **当前环境即可真实运行**（建议 Vite + 原生 TS，或零依赖静态页）；须支持 FakeClock 模拟 D1→D8 以演示全部游客态流程 |

- 测试框架建议 **Vitest**（对纯 TS 内核零配置友好），由你最终决定并在 `package.json` 写清脚本（`npm test` / `test:unit` / `test:integration` / `test:coverage` 必须能实跑）。
- 必须明确三轨的**代码复用边界与映射关系**，以及哪些实现只在哪一轨落地。

---

## 2. 用户最终决议总表（Q1~Q13，强输入，不得违背）

| # | 决议 |
|---|------|
| **Q1** | **鸿蒙端侧推理**：本地模型随包/首启内置、推理全程不出端、无需 INTERNET 生成情景对话、NPU 加速 + CPU 回退、失败/超时/模型未就绪降级 `ScriptedAI`；`AIService` 抽象保留，`OnDeviceAI`(主) / `ScriptedAI`(兜底) / `MockAI`(测试) 三类实装，**`CloudAI` 不实现仅预留扩展**；UI 层禁硬编码厂商 SDK；保留 `[[QUALITY:n]]` 解析回写调度。**不再调用云侧 HTTP 大模型 API** |
| **Q2** | **MVP 直接接入华为账号（Account Kit）一键登录** + 可选游客模式；**游客不提供进度统计**，仅登录态可查看 F-07 打卡日历与 F-08 学习统计 |
| **Q3~Q9** | 保持 MVP 默认：自建 8 场景 × 约 30 词 ≈ 240 词内置随包；**600 秒**有效交互（前台对话页累计、后台/锁屏暂停）自动打卡；**本地时间 00:00 日切**；语音 P1；休息日 P1 默认关闭；仅手机竖屏 |
| **Q10** | **解释 A（已确认）**：游客**数据照常落盘**（保证 F-06/F-07/F-08 数据源零误差一致、不破坏 A8），仅 F-07/F-08 **页面在游客态门禁不展示进度数据**；门禁 must 放在**数据读取层（Service/Repository）**，不得仅 UI 隐藏 |
| **Q11** | **游客登录账号后弹出「是否迁移合并未登录时的学习进度」对话框，由用户选择**；「不做迁移合并」已作废。触发：授权成功后、进入首页前，**仅检测到游客进度才弹**；选项 `合并进度` / `不合并，保留账号已有进度`，可取消＝暂不处理且可再触发；选择结果持久化；合并后首页/日历/统计立即刷新 |
| **Q12** | 选「不合并」时：**仅窗口内**游客数据保留、不删除、不展示，「我的/设置」可再次发起合并；窗口外按 7 天策略清理 |
| **Q13** | **采用滑动窗口（用户已确认）**：游客数据仅保留 `[today-6, today]` 共 **7 个自然日**，按本地 00:00 日切滚动清理窗口外数据；**合并也只合并窗口内进度**，窗口外不合并、不回灌、不计入统计重算 |

### 2.1 登录引导弹窗最终规则（第四封决议，务必设计进架构）
- `D1` = 游客首次产生学习数据的自然日（本地 00:00 日切）
- **D5 弹 1 次 / D6 不弹 / D7 弹 1 次 / D8 起若仍未登录则每天弹 1 次，直到登录**；已登录一律不弹
- **每天最多弹 1 次**，按日切重置；`暂不` 当日不再弹、次日继续
- 弹窗三动作：`去登录`（→ 华为账号授权 → 成功后触发类型 B 合并弹窗）/ `暂不` / **`不再提示`**（持久化 `neverPrompt = true`，往后永久不弹）
- `不再提示` **只关闭类型 A 登录引导，不影响 Q11 / F-21 合并选择弹窗**
- 持久化：`neverPrompt: boolean`、`lastPromptDate: 'YYYY-MM-DD'`
- **两类弹窗严格区分**：类型 A = 登录引导（游客态、打开 App 时）；类型 B = 合并选择（登录成功后）。时序 **A → 登录成功 → B**
- 弹窗内「未登录期间已累计 X 天 / Y 词 / Z 分钟」属引导性摘要，不是统计页，不违反 F-20 门禁

---

## 3. 功能与约束清单

**P0（12 项，must）**：F-01 每日学习首页 / F-02 AI 情景对话学习 / F-03 生词本 / F-04 艾宾浩斯调度 / F-05 本地存储 / F-06 每日打卡(600s) / F-07 打卡日历 / F-08 学习统计 / **F-19 华为账号登录** / **F-20 进度统计门禁** / **F-21 游客进度迁移合并** / **F-22 游客数据 7 天窗口与登录引导**。
P1：F-09 场景词书切换 / F-10 语音 / F-11 休息日 / F-12 导入导出 / F-13 离线脚本库。P2：OCR / 云同步 / 分享 / 订阅付费 / 多语种。

**架构约束 A1~A12**：A1 600s + clock 可注入；A2 AIService 可替换三类实装 + `[[QUALITY:n]]`；A3 离线优先为默认形态；A4 StorageService 接口 + 鸿蒙实现 + 内存实现；A5 鸿蒙 7 原生 ArkTS + ArkUI、禁 RN/WebView 混合、权限最小化；A6 8 大旅行场景词库（词条含 `scene` / `locale` / `exampleInScene` / `aiRolePrompt`）；A7 调度纯函数化；A8 本地 00:00 日切；**A9 AccountService 与会话态 + `guest:` / `user:{uid}:` 双分区 + 门禁放读取层**；**A10 端侧推理约束**（模型包体、内存上限、NPU 探测与 CPU 回退、首 token ≤2s、推理超时 ≤10s、降级）；**A11 MigrationService 纯函数/幂等/可注入/100% 单测/离线**；**A12 7 天滑动窗口与登录引导判定纯函数化、可注入 clock、清理幂等**。

**NFR 要点**：端侧首 token ≤2s 且无网络依赖；全功能离线闭环；对话与学习数据**零出端、无 AI 网络请求**（如实区分「AI 推理无网络请求」与「华为账号授权/令牌刷新需网络」）；`INTERNET` 权限仅归账号授权（should）；端侧模型只读应用自有存储、算力不单独申请权限；游客数据按最小必要原则仅保留最近 7 天；窗口清理与合并异常中断可恢复、幂等、不误删窗口内数据。

---

## 4. 文档一：`ARCHITECTURE.md` 必须包含的章节

1. 技术选型表（分层 × 选型 × 理由）：鸿蒙平台侧 / 领域内核侧 / H5 预览侧 / 测试侧
2. 总体分层架构图（Mermaid）+ **三轨复用关系与边界说明**
3. 模块划分：完整目录树 + 每模块/文件职责
4. 核心数据结构（完整 TypeScript interface，逐字段注释）：`Word`（含 scene/locale/exampleInScene/aiRolePrompt）、`StudyRecord`（SM-2 字段）、`CheckIn`、`ChatMessage`、`StatsSummary`、`AccountSession`、`GuestPromptState`、`MergeResult`、`Settings`、`Scene` 枚举等
5. 接口定义（完整 TS 签名）：`AIService`、`StorageService`、`EbbinghausScheduler`、`CheckInService`、`StatsService`、`WordBookService`、`SceneService`、`Clock`、**`AccountService`**、**`MigrationService` / `ProgressMergeService`**、**`RetentionService` / `GuestRetentionPolicy`**、**`LoginPromptPolicy`**
6. **SM-2 改进算法**详细公式与伪代码（初始 EF 2.5、下限 1.3、quality<3 重置、interval 1→3→×EF、≥30 天 mastered、断更>7 天降级重排），以及 600s 打卡阈值与调度如何协同
7. 本地持久化 Key 规约表（含 `guest:` / `user:{uid}:` 双分区与日期索引）
8. **Mermaid 时序图至少 3 张**：① 一次完整学习流程（打开→今日队列→端侧 AI 情景对话→quality 解析→调度回写→持久化→600s 打卡→统计更新）；② 端侧推理失败/模型未就绪的离线降级流程；③ **游客登录 → 合并选择 → 7 天窗口过滤 → 数据合并 → 连续天数与统计重算**（含类型 A / 类型 B 两类弹窗判定分支与 D5/D7/D8+ 规则）
9. **Mermaid 类图** + 调度算法流程图
10. AI 对话服务抽象层设计（Provider 可替换、旅行场景角色 Prompt 策略、`[[QUALITY:n]]` 标签协议、超时/重试/降级）
11. 错误处理、日期约定、隐私与权限
12. 待明确事项 Open Architecture Questions（≥5 条，含建议）
13. 文末注明「本文档与 TASK_BREAKDOWN.md 一并作为工程师下一阶段的输入」

---

## 5. 文档二：`TASK_BREAKDOWN.md` 必须包含的章节

1. Required Packages：鸿蒙侧依赖 + Node 侧 devDependencies（可直接用的 `package.json` 片段，含 Vitest/Jest 与 `npm test` 等脚本）
2. **按依赖顺序排序的任务清单**（建议 L0 模型 → L1 工具/种子 → L2 调度算法 → L3 存储抽象与数据分区 → L4 业务服务（含账号/合并/窗口/弹窗策略）→ L5 预览与鸿蒙 UI 组件 → L6 页面 → L7 入口装配 → L8 测试）。逐文件给出：路径、所属层、依赖、**逻辑分析**（要实现的函数/类/关键分支，工程师照此写码）、验收要点
3. Mermaid 任务依赖图
4. **完整 API Spec**：所有内部 Service 每个方法的签名 + 入参/出参/异常；`shouldPromptLogin` 状态机的输入/输出与全部分支；`MigrationService.merge` 的冲突规则与幂等约定；外部接口（华为账号授权、端侧推理调用）的契约说明与错误码
5. **Shared Knowledge**：常量（`SM2_INITIAL_EF` / `SM2_MIN_EF` / `DAILY_GOAL_SECONDS = 600` / `DEFAULT_NEW_CAP` / `MS_PER_DAY` / `GUEST_RETENTION_DAYS = 7` / `LOGIN_PROMPT_DAYS = [5,7]` / `PROMPT_DAILY_AFTER_DAY = 7` / 8 场景枚举）、Storage Key 规约、日期约定、错误约定、测试约定、**ArkTS 兼容性编码规约**（禁 `any` / 禁 DOM 依赖等）
6. 交付顺序、总任务数与预估代码量
7. 文末注明「本文档作为工程师下一阶段的输入」

---

## 6. 通用要求

- 全中文；大量使用表格 / Mermaid / TypeScript 代码块，避免纯叙述；所有 Mermaid 语法必须正确可渲染
- 接口签名必须自洽、前后一致（工程师严格按此实现，QA 按此写测试）
- **不要写任何 TODO / stub 占位**
- 测试可实跑是硬门禁：文档中必须明确哪些模块由内核覆盖、哪些只能靠预览验证、哪些需 DevEco Studio 编译验证

---

## 7. 交付方式

1. 用 Write 工具落盘：
   - `C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/wordbox-harmony-delivery/ARCHITECTURE.md`
   - `C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/wordbox-harmony-delivery/TASK_BREAKDOWN.md`
2. 完成后用 **SendMessage 只回传给 `team-lead`**：两份文件绝对路径与行数、三轨架构核心决策、完整目录树、全部 Service 接口签名摘要、任务总数与分层统计、以及给工程师的 5~8 条实现注意事项（尤其如何避免三轨实现漂移、如何保证测试可实跑、两类弹窗与 7 天窗口如何落地）。
3. 用 TaskUpdate 把任务 #2 标记 completed，保持待命等待 shutdown_request。
4. **不要接受或响应其他成员直接发来的需求/清单。**
