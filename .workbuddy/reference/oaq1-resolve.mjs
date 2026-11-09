import fs from 'node:fs';

const B = 'C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/';
const files = [
  B + 'wordbox-harmony-delivery/ARCHITECTURE.md',
  B + 'wordbox-harmony-delivery/TASK_BREAKDOWN.md',
  B + '.workbuddy/reference/ENGINEER_FINAL_BRIEF.md',
  B + '.workbuddy/reference/QA_FINAL_BRIEF.md',
];

const rules = [
  ['；若把 `SM2_SECOND_INTERVAL_DAYS` 改为 6 则得到经典 SM-2 的 `1 → 6 → 15 → 38`', '；交付总监已裁决采用经典 SM-2 值 6（与 PRD F-04 一致）'],
  ['（见 §12 OAQ-1 与 PRD F-04 示例的差异说明，单一常量可切换为经典 SM-2 的 6）', '（交付总监裁决：按 PRD F-04 采用经典 SM-2 值 6）'],
  ['（见 `ARCHITECTURE.md` OAQ-1；改此常量即可切到经典 SM-2 的 6）', '（交付总监裁决：采用经典 SM-2 值 6）'],
  ['**架构默认 `SM2_SECOND_INTERVAL_DAYS = 3`（以唯一有效任务书为准）**', '**交付总监裁决 `SM2_SECOND_INTERVAL_DAYS = 6`（与 PRD F-04 一致）**'],
  ['10. **OAQ-1 需确认**：SM-2 第 2 次间隔按任务书取 `3`（`SM2_SECOND_INTERVAL_DAYS`），PRD F-04 示例为 `6`；交付前与 team-lead / PM 确认一次，如需切换**只改这一个常量**，算法与测试夹具不动，并在测试报告中写明取值。', '10. **OAQ-1 已裁决（2026-11-09，交付总监）**：`SM2_SECOND_INTERVAL_DAYS = 6`，采用经典 SM-2 序列 `1→6→15→38`，与 PRD F-04「1/6/…」一致；算法与测试断言必须基于该常量推导，禁止硬编码序列。测试报告须写明取值。'],
  ['建议交付前由 team-lead 与 PM 确认一次并写入测试报告说明', '【交付总监裁决 2026-11-09】取 6（经典 SM-2），与 PRD F-04 一致；全库常量、示例与测试断言已同步，测试报告须写明取值'],
  ['`1→3→×EF`', '`1→6→×EF`'],
  ['SM2_SECOND_INTERVAL_DAYS=3', 'SM2_SECOND_INTERVAL_DAYS=6'],
  ['SM2_SECOND_INTERVAL_DAYS = 3', 'SM2_SECOND_INTERVAL_DAYS = 6'],
  ['| `SM2_SECOND_INTERVAL_DAYS` | **`3`** |', '| `SM2_SECOND_INTERVAL_DAYS` | **`6`** |'],
  ['| `SM2_SECOND_INTERVAL_DAYS` | `3` |', '| `SM2_SECOND_INTERVAL_DAYS` | `6` |'],
  ['1→3→8→19→48', '1→6→15→38'],
  ['1 → 3 → 8 → 19 → 48', '1 → 6 → 15 → 38'],
  ['interval = 3', 'interval = 6'],
  ['interval=3', 'interval=6'],
];

const hits = rules.map(() => 0);
for (const f of files) {
  if (!fs.existsSync(f)) { console.log('MISSING FILE: ' + f); continue; }
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  rules.forEach(([a, b], i) => {
    let n = 0;
    let pos = 0;
    while ((pos = s.indexOf(a, pos)) !== -1) { n++; pos += a.length; }
    if (n > 0) { s = s.split(a).join(b); hits[i] += n; }
  });
  if (s !== before) { fs.writeFileSync(f, s, 'utf8'); console.log('UPDATED: ' + f.split('/').pop()); }
  else console.log('no change: ' + f.split('/').pop());
}

console.log('\n--- rule hit counts ---');
rules.forEach(([a], i) => console.log(String(hits[i]).padStart(3) + '  ' + a.slice(0, 70)));

// QA brief: add phased execution note
const qa = files[3];
let q = fs.readFileSync(qa, 'utf8');
const note = '\n\n---\n\n## 7. 分阶段执行（交付总监补充，优先级最高）\n\n本轮与工程师**并行**开工，`core/src` 源码此刻可能尚不存在。请严格分两阶段：\n\n- **阶段 A（本轮）**：写完 `tests/unit/` 与 `tests/integration/` 下全部测试文件、测试配置与 `package.json` 测试脚本。**不要因为 import 暂时找不到模块就放弃、删用例或改用 stub**；按 `ARCHITECTURE.md` / `TASK_BREAKDOWN.md` 已固化的接口签名编写即可。完成后 SendMessage 回传「测试文件已就绪 + 文件清单 + 用例数」，**不要提前编造任何测试结果或通过率**。\n- **阶段 B（等 team-lead 的 `代码已就绪` 通知）**：再执行 `npm install && npm test`、做智能路由判定、最多 2 轮回归、落盘 `TEST_REPORT.md`，并回传真实数据。\n\n**OAQ-1 已裁决**：`SM2_SECOND_INTERVAL_DAYS = 6`（经典 SM-2，与 PRD F-04 一致），间隔序列 `1→6→15→38`。调度测试断言必须**基于 `constants.ts` 的常量推导**，禁止硬编码序列数字；测试报告须写明该取值。\n';
if (!q.includes('## 7. 分阶段执行')) { fs.writeFileSync(qa, q + note, 'utf8'); console.log('\nAPPENDED phased note to QA_FINAL_BRIEF.md'); }
