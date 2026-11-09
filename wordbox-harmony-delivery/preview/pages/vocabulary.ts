/**
 * F-03 vocabulary — search, 8-scene filter, word list (meaning + travel
 * example + next review date + "需重学" marker), manual add and delete.
 * All reads/writes go through the shared kernel services; the page holds only
 * transient filter state, never a second copy of any business rule.
 */
import {
  ALL_SCENES, DAILY_GOAL_SECONDS, SCENE_LABELS, SCENE_ICONS,
  Scene, Word, WordFilter, WordSource, WordStatus, StudyRecord,
  AccountSession, DEFAULT_GUEST_SESSION, NewWordInput,
} from '@core';
import { AppCtx, PageView, esc } from '../context';

type SceneFilter = Scene | 'ALL';
type StatusFilter = WordStatus | 'ALL';

let vocabScene: SceneFilter = 'ALL';
let vocabStatus: StatusFilter = 'ALL';
let vocabKeyword: string = '';
let vocabAddOpen: boolean = false;

const STATUS_LABELS: Readonly<Record<string, string>> = {
  ALL: '全部状态',
  [WordStatus.New]: '未学',
  [WordStatus.Learning]: '学习中',
  [WordStatus.Relearning]: '需重学',
  [WordStatus.Mastered]: '已掌握',
};

const STATUS_ORDER: readonly StatusFilter[] = [
  'ALL', WordStatus.New, WordStatus.Learning, WordStatus.Relearning, WordStatus.Mastered,
];

/** Reset transient filter state (called by the FakeClock "重置演示" action). */
export function resetVocabulary(): void {
  vocabScene = 'ALL';
  vocabStatus = 'ALL';
  vocabKeyword = '';
  vocabAddOpen = false;
}

function sceneOptions(): string {
  const out: string[] = [];
  out.push('<option value="ALL"' + (vocabScene === 'ALL' ? ' selected' : '') + '>全部场景</option>');
  for (const scene of ALL_SCENES) {
    const selected: string = vocabScene === scene ? ' selected' : '';
    out.push('<option value="' + scene + '"' + selected + '>' + SCENE_ICONS[scene] + ' ' + esc(SCENE_LABELS[scene]) + '</option>');
  }
  return out.join('');
}

function statusOptions(): string {
  const out: string[] = [];
  for (const status of STATUS_ORDER) {
    const label: string = STATUS_LABELS[status] ?? status;
    const selected: string = vocabStatus === status ? ' selected' : '';
    out.push('<option value="' + status + '"' + selected + '>' + esc(label) + '</option>');
  }
  return out.join('');
}

function addSceneOptions(): string {
  const out: string[] = [];
  for (const scene of ALL_SCENES) {
    out.push('<option value="' + scene + '"' + (scene === Scene.AIRPORT ? ' selected' : '') + '>'
      + SCENE_ICONS[scene] + ' ' + esc(SCENE_LABELS[scene]) + '</option>');
  }
  return out.join('');
}

function wordRow(word: Word, record: StudyRecord | undefined, session: AccountSession): string {
  const statusText: string = record !== undefined ? (STATUS_LABELS[record.status] ?? record.status) : '未学';
  const due: string = record !== undefined ? record.dueYMD : '—';
  const relearn: string = record !== undefined && record.status === WordStatus.Relearning
    ? '<span class="wb-tag wb-tag-warn">需重学</span>' : '';
  const sourceTag: string = word.source === WordSource.Seed
    ? '<span class="wb-tag">内置</span>'
    : '<span class="wb-tag wb-tag-ok">我的</span>';
  const del: string = word.source !== WordSource.Seed
    ? '<button class="wb-mini wb-mini-danger" data-del="' + esc(word.id) + '">删除</button>' : '';
  void session;
  return '<article class="wb-word">'
    + '<div class="wb-word-head"><b>' + esc(word.text) + '</b>'
    + (word.phonetic.length > 0 ? '<small>' + esc(word.phonetic) + '</small>' : '')
    + '<span class="wb-word-scene">' + SCENE_ICONS[word.scene] + ' ' + esc(SCENE_LABELS[word.scene]) + '</span>'
    + sourceTag + relearn + del + '</div>'
    + '<div class="wb-word-meaning">' + esc(word.meaningZh) + '</div>'
    + (word.exampleInScene.length > 0 ? '<div class="wb-word-example">“' + esc(word.exampleInScene) + '”</div>' : '')
    + '<div class="wb-word-meta">状态 ' + esc(statusText) + ' · 下次复习 ' + esc(due) + '</div>'
    + '</article>';
}

export async function vocabularyPage(ctx: AppCtx): Promise<PageView> {
  const sessionR = await ctx.kernel.services.account.current();
  const session: AccountSession = sessionR.ok && sessionR.value !== undefined ? sessionR.value : DEFAULT_GUEST_SESSION;
  const filter: WordFilter = { scene: vocabScene, keyword: vocabKeyword, status: vocabStatus };
  const listR = await ctx.kernel.services.wordBook.list(session, filter);
  const words: readonly Word[] = listR.ok && listR.value !== undefined ? listR.value : [];

  const recordsR = await ctx.kernel.services.repository.loadRecords(session);
  const recordById: Map<string, StudyRecord> = new Map<string, StudyRecord>();
  if (recordsR.ok && recordsR.value !== undefined) {
    for (const record of recordsR.value) recordById.set(record.wordId, record);
  }

  const countsR = await ctx.kernel.services.wordBook.byScene(session);
  const counts: string[] = [];
  if (countsR.ok && countsR.value !== undefined) {
    for (const item of countsR.value) {
      counts.push('<span class="wb-chip">' + SCENE_ICONS[item.scene] + ' ' + esc(SCENE_LABELS[item.scene])
        + ' <b>' + String(item.count) + '</b></span>');
    }
  }

  const rows: string[] = [];
  for (const word of words) rows.push(wordRow(word, recordById.get(word.id), session));
  const listHtml: string = rows.length > 0
    ? '<div class="wb-word-list">' + rows.join('') + '</div>'
    : '<div class="wb-empty">没有匹配的词条。换个关键词或场景试试。</div>';

  const addHtml: string = vocabAddOpen
    ? '<section class="wb-card"><h3>手动添加生词</h3>'
      + '<div class="wb-form">'
      + '<input id="wb-add-text" type="text" placeholder="英文单词 / 短语（必填）" />'
      + '<input id="wb-add-meaning" type="text" placeholder="中文释义" />'
      + '<select id="wb-add-scene">' + addSceneOptions() + '</select>'
      + '<input id="wb-add-example" type="text" placeholder="旅行情景例句（可选）" />'
      + '<div class="wb-form-actions"><button class="wb-btn wb-btn-primary" data-action="add-submit">加入生词本</button>'
      + '<button class="wb-mini" data-action="add-cancel">取消</button></div>'
      + '</div></section>'
    : '';

  const html = '<section class="wb-card">'
    + '<h3>生词本 <small>' + String(words.length) + ' 条</small></h3>'
    + '<div class="wb-filter-row">'
    + '<input id="wb-vocab-q" type="text" placeholder="搜索单词 / 释义 / 例句" value="' + esc(vocabKeyword) + '" />'
    + '<button class="wb-mini" data-action="search">搜索</button>'
    + '<button class="wb-mini" data-action="add-open">+ 添加</button>'
    + '</div>'
    + '<div class="wb-filter-row">'
    + '<select id="wb-vocab-scene">' + sceneOptions() + '</select>'
    + '<select id="wb-vocab-status">' + statusOptions() + '</select>'
    + '</div>'
    + '<div class="wb-chip-row">' + counts.join('') + '</div>'
    + '<p class="wb-hint">8 个旅行场景分组；新增词自动进入 SM-2 复习队列（今日上限 '
    + String(DAILY_GOAL_SECONDS) + ' 秒打卡目标独立计算）。</p>'
    + '</section>'
    + addHtml
    + listHtml;

  const view: PageView = {
    html: html,
    bind: (root: HTMLElement): void => {
      const q: HTMLInputElement | null = root.querySelector('#wb-vocab-q');
      if (q !== null) {
        q.addEventListener('input', () => { vocabKeyword = q.value; });
        q.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') void ctx.refresh();
        });
      }
      const searchBtn: HTMLButtonElement | null = root.querySelector('[data-action="search"]');
      if (searchBtn !== null) searchBtn.addEventListener('click', () => void ctx.refresh());

      const sceneSel: HTMLSelectElement | null = root.querySelector('#wb-vocab-scene');
      if (sceneSel !== null) {
        sceneSel.addEventListener('change', () => {
          const value: string = sceneSel.value;
          let next: SceneFilter = 'ALL';
          for (const candidate of ALL_SCENES) if (candidate === value) next = candidate;
          vocabScene = next;
          void ctx.refresh();
        });
      }
      const statusSel: HTMLSelectElement | null = root.querySelector('#wb-vocab-status');
      if (statusSel !== null) {
        statusSel.addEventListener('change', () => {
          const value: string = statusSel.value;
          let next: StatusFilter = 'ALL';
          for (const candidate of STATUS_ORDER) if (candidate !== 'ALL' && candidate === value) next = candidate;
          vocabStatus = next;
          void ctx.refresh();
        });
      }

      const openBtn: HTMLButtonElement | null = root.querySelector('[data-action="add-open"]');
      if (openBtn !== null) {
        openBtn.addEventListener('click', () => { vocabAddOpen = true; void ctx.refresh(); });
      }
      const cancelBtn: HTMLButtonElement | null = root.querySelector('[data-action="add-cancel"]');
      if (cancelBtn !== null) {
        cancelBtn.addEventListener('click', () => { vocabAddOpen = false; void ctx.refresh(); });
      }
      const submitBtn: HTMLButtonElement | null = root.querySelector('[data-action="add-submit"]');
      if (submitBtn !== null) {
        submitBtn.addEventListener('click', async () => {
          const textEl: HTMLInputElement | null = root.querySelector('#wb-add-text');
          const meaningEl: HTMLInputElement | null = root.querySelector('#wb-add-meaning');
          const sceneEl: HTMLSelectElement | null = root.querySelector('#wb-add-scene');
          const exampleEl: HTMLInputElement | null = root.querySelector('#wb-add-example');
          const text: string = textEl !== null ? textEl.value.trim() : '';
          if (text.length === 0) { ctx.toast('请先填写英文单词 / 短语'); return; }
          const sceneValue: string = sceneEl !== null ? sceneEl.value : Scene.AIRPORT;
          let scene: Scene = Scene.AIRPORT;
          for (const candidate of ALL_SCENES) if (candidate === sceneValue) scene = candidate;
          const input: NewWordInput = {
            text: text,
            meaningZh: meaningEl !== null ? meaningEl.value.trim() : '',
            scene: scene,
            exampleInScene: exampleEl !== null ? exampleEl.value.trim() : '',
          };
          const added = await ctx.app.addWord(input, ctx.clock);
          if (added.ok) {
            vocabAddOpen = false;
            ctx.toast('已加入生词本，并自动进入复习队列');
          } else {
            ctx.toast('添加失败：' + String(added.error?.message ?? '未知错误'));
          }
          await ctx.refresh();
        });
      }

      const delButtons: NodeListOf<HTMLButtonElement> = root.querySelectorAll('[data-del]');
      delButtons.forEach((btn: HTMLButtonElement) => {
        btn.addEventListener('click', async () => {
          const id: string | null = btn.getAttribute('data-del');
          if (id === null) return;
          const removed = await ctx.kernel.services.wordBook.remove(session, id);
          ctx.toast(removed.ok ? '已删除该词条及其复习记录' : '删除失败');
          await ctx.refresh();
        });
      });
    },
  };
  return view;
}
