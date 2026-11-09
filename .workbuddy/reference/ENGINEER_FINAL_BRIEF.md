# 工程师最终任务书（ENGINEER_FINAL_BRIEF）

> **本文件是唯一有效指令**，由交付总监下发。
> **优先级**：`ARCHITECTURE.md` 与 `TASK_BREAKDOWN.md`（架构师产出）中的目录树、接口签名、文件清单**优先于本文件**；本文件负责补充不可妥协的业务规则、可运行性与验收要求。两者冲突时以架构文档为准，但本文件第 3 节业务规则为硬门禁，不得因架构文档简化而遗漏。
> **所有产出只回传 `team-lead`**，禁止直接给其他成员发消息。

---

## 1. 项目与最终决议

`wordbox_harmony` /「单词盒子」：**鸿蒙 7（HarmonyOS 7 / NEXT，API 12+）原生 ArkTS + ArkUI App**，服务**准备出国旅游的人**，**每天 10 分钟通过 AI 旅行情景对话学单词**。

工程根目录：`C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/wordbox-harmony-delivery/`
上游文档（同目录）：`PRD.md`（v1.1，579 行）、`ARCHITECTURE.md`、`TASK_BREAKDOWN.md`

| 决议 | 内容 |
|------|------|
| Q1 | **鸿蒙端侧推理**：`OnDeviceAI`(主) / `ScriptedAI`(降级与离线) / `MockAI`(测试) 三类实装；`CloudAI` 不实现仅预留；数据零出端、无 AI 网络请求；`[[QUALITY:n]]` 解析回写调度；UI 不绑实现 |
| Q2 | **接入华为账号（Account Kit）** + 可选游客模式；游客不提供进度统计 |
| Q10 | 游客**数据照常落盘**，但 F-07 打卡日历 / F-08 学习统计**页面在游客态门禁不展示进度**，门禁放**数据读取层** |
| Q11 | 登录后**弹窗由用户选择是否合并游客进度**（仅检测到游客进度才弹、可取消、选择持久化、合并后三页立即刷新） |
| Q12 | 选「不合并」：仅窗口内游客数据保留不删、可再次合并；窗口外按 7 天策略清理 |
| Q13 | **滑动窗口**（已确认）：游客数据仅保留 `[today-6, today]` 共 7 个自然日，本地 00:00 日切滚动清理；**合并只合并窗口内进度** |
| Q3~Q9 | 自建 8 场景 × 约 30 词 ≈ 240 词内置随包；**600 秒**有效交互自动打卡；本地 00:00 日切；语音 P1；休息日 P1 关闭；手机竖屏 |

**P0 12 项**：F-01 首页 / F-02 AI 情景对话 / F-03 生词本 / F-04 艾宾浩斯调度 / F-05 本地存储 / F-06 每日打卡 / F-07 打卡日历 / F-08 学习统计 / F-19 华为账号登录 / F-20 进度统计门禁 / F-21 游客进度迁移合并 / F-22 游客数据 7 天窗口与登录引导。

---

## 2. 三轨交付结构（必须同时成立）

| 轨 | 必须落地 |
|----|---------|
| **A. 纯 TypeScript 领域内核** | 零平台依赖，可在 Node 下被测试框架直接 import；全部业务规则在此实现；纯函数、不可变更新、可注入 `clock` 与 `StorageService`；**兼容 ArkTS 严格子集**（禁 `any`、禁 DOM/Node 专有 API、禁动态类型技巧） |
| **B. 鸿蒙 7 原生工程** | DevEco Studio 工程结构（`AppScope/app.json5`、`build-profile.json5`、`oh-package.json5`、`entry/src/main/module.json5`、`EntryAbility.ets` 等）；ArkUI 声明式 5+ 页面；`OnDeviceAI` 端侧推理适配；华为账号 `AccountKit` 适配；`ScriptedAI` 降级；`@ohos.data.preferences` 或等效本地存储 |
| **C. H5 可运行预览** | **复用同一套内核** + 浏览器 localStorage 适配 + AI/账号对接层；5 个页面真实可交互；**当前环境即可真实运行**；须支持 FakeClock 模拟 D1→D8 演示全部游客态流程 |

三者复用边界已在 `ARCHITECTURE.md` 定义，严格遵循，**禁止为三轨各写一套互相矛盾的业务逻辑**。

另需交付：`package.json`（含 `npm test` / `test:unit` / `test:integration` / `test:coverage` 脚本）、`tsconfig.json`、测试框架配置、`index.html`、`README.md`（运行指南：如何跑测试、如何开预览、如何用 DevEco Studio 打开鸿蒙工程）。

---

## 3. 硬性业务规则（QA 会逐条实跑验证，不得简化）

### 3.1 艾宾浩斯 SM-2 改进算法（纯函数）
- 初始 `EF = 2.5`，下限 `1.3`；`quality ∈ {0,1,2,3,4,5}`
- `quality < 3` → `repetition = 0`、`interval = 1`
- `quality >= 3` → `repetition == 0 ? interval = 1 : (repetition == 1 ? interval = 6 : interval = round(interval * EF))`，随后 `repetition += 1`
- `EF = max(1.3, EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02)))`
- `nextReviewAt = now + interval * 86400000`；`interval >= 30` → `status = 'mastered'`
- 今日队列 = 到期复习池（`nextReviewAt <= now`）∪ 新词池（前 `DEFAULT_NEW_CAP` 个），按到期时间升序、新词置后
- 断更 > 7 天 100% 降级「需重学」并重排

### 3.2 打卡 `DAILY_GOAL_SECONDS = 600`
- 仅前台对话页有效交互累计；后台/锁屏暂停；达 600s 自动打卡
- 每日仅记 1 次；本地 00:00 日切；连续天数、日历、统计与打卡数据源**误差 0**

### 3.3 7 天滑动窗口 `GUEST_RETENTION_DAYS = 7`
- `isWithinWindow(dateYMD, now)` / `filterWithinWindow(records, now)` / `pruneOutsideWindow(records, now)` 均为纯函数
- 窗口 `[today-6, today]` 共 7 个自然日；清理**幂等**、不误删窗口内数据
- 对游客生词本 / StudyRecord / CheckIn / 连续天数一律一致

### 3.4 登录引导弹窗状态机（`LoginPromptPolicy`）
- `D1` = 游客首次产生学习数据的自然日（本地 00:00 日切）
- **D1~D4 不弹 / D5 弹 1 次 / D6 不弹 / D7 弹 1 次 / D8 起若仍未登录则每天弹 1 次，直到登录 / 已登录不弹 / 空窗口（无游客进度）不弹**
- 每天最多 1 次（日切重置）
- 三动作：`去登录`（→ 华为账号授权 → 成功后触发类型 B）/ `暂不`（当日不再弹、次日继续）/ `不再提示`（持久化 `neverPrompt = true`，往后永久不弹）
- `不再提示` **只关闭类型 A 登录引导，不影响类型 B 合并选择弹窗**
- 持久化 `neverPrompt: boolean` 与 `lastPromptDate: 'YYYY-MM-DD'`
- 常量 `LOGIN_PROMPT_DAYS = [5, 7]`、`PROMPT_DAILY_AFTER_DAY = 7`
- `shouldPromptLogin(guestFirstStudyDateYMD, now, promptState, session)` 返回「是否弹 + 弹窗类型」，纯函数、可 FakeClock 单测

### 3.5 两类弹窗严格分离
- 类型 A = 游客态登录引导（F-22，打开 App 时）
- 类型 B = 登录成功后「是否合并游客进度」（Q11 / F-21）
- 时序 **A → 点去登录 → 授权成功 → B**，不得合并成一个弹窗
- 弹窗内进度摘要属引导性提示，不是统计页，不触发 F-20 门禁放行

### 3.6 游客进度迁移合并 `MigrationService` / `ProgressMergeService`
- **纯函数、幂等**、可注入 `clock` 与 `StorageService`、离线可完成
- **合并前必须先按 7 天窗口过滤**，窗口外数据不合并、不回灌、不计入统计重算
- 冲突规则：同日打卡取「已打卡 / 学习时长较大」者且不重复累计；同词 StudyRecord 取进度更新的一条且**不得回退到更差状态**；生词本按词条去重
- 合并后连续天数与 7/30/90 日统计重算，与 F-06 数据源误差 0
- 分区 `guest:` 与 `user:{uid}:` 双命名空间，`guest:` 带日期索引

### 3.7 统计门禁 F-20
- 判定放在**数据读取层（Service / Repository）的内核纯逻辑**，不得仅 UI 隐藏
- 游客态 F-07/F-08 不渲染任何进度数字 / 曲线 / 热力；登录态展示全量

### 3.8 AI 与降级
- `AIService.chat(messages, opts)` 统一接口；`[[QUALITY:n]]` 正则解析，缺失/越界默认 3；`stripQualityTag`
- `ScriptedAI` 每场景 ≥ 3 套离线脚本；端侧模型未就绪 / 推理超时 / 低内存时自动降级且不阻断 600s 打卡闭环
- Prompt 注入 8 大旅行场景角色（机场值机 / 过海关 / 酒店入住 / 餐厅点餐 / 问路导航 / 购物退税 / 交通购票 / 紧急求助）

### 3.9 数据
- 内置 8 场景种子词库（每场景 ≥ 6 个可用词条，含 `scene` / `locale` / `exampleInScene` / `aiRolePrompt`），随包、首启零下载
- `StorageService` 接口 + 内存实现（测试）+ 鸿蒙实现 + 浏览器 localStorage 实现

---

## 4. 可运行性验收（硬门禁）

1. `npm install && npm test` **必须能在本机真实跑通**，输出真实测试数与通过数；`npm run test:coverage` 可用
2. H5 预览可在浏览器真实打开并完成一条完整路径：**游客学习 → 打卡 → D5/D7 引导弹窗 → D8+ 每日弹窗 → 不再提示 → 模拟登录 → 合并选择 → 仅带入窗口内进度 → 统计解锁**
3. 鸿蒙工程目录结构完整、无缺失配置文件，可在装有 SDK 的 DevEco Studio 中打开
4. **代码中不得出现 TODO / stub / 空实现 / 假返回值**；所有 Service 有真实逻辑
5. TypeScript strict；所有 Service 支持依赖注入 `clock`；外部依赖通过构造函数注入

---

## 5. 全局一致性审查（IS_PASS）

全部文件写完后，必须自行做一次全局审查并给出 `IS_PASS: YES/NO`：
- 三轨是否复用了同一套内核、业务规则是否一致
- 接口签名是否与 `ARCHITECTURE.md` / `TASK_BREAKDOWN.md` 完全一致
- 常量口径是否统一（600 / 7 / [5,7] / 7 / 2.5 / 1.3）
- 类型是否自洽、有无循环依赖、有无 `any`
- `IS_PASS: NO` → 修复后重审，最多 2 轮

---

## 6. 交付方式

1. 在 `wordbox-harmony-delivery/` 下按 `TASK_BREAKDOWN.md` 的文件清单**批量写完所有源文件**（不要一个一个挤），完成后执行第 5 节全局一致性审查。
2. 自己先跑一次 `npm test` / 类型检查，把结果写进回传（这是第一层验证，QA 会独立做第二层）。
3. 用 **SendMessage 只回传给 `team-lead`**：全部文件路径清单、`IS_PASS` 结论、自跑测试结果、代码摘要、以及给 QA 的测试重点提示。
4. 用 TaskUpdate 把任务 #3 标记 completed，保持待命等待后续 shutdown_request。
