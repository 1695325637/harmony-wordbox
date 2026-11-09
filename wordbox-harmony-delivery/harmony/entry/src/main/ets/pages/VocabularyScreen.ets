/**
 * F-03 vocabulary (ArkUI). 8-scene filter + search + detail + manual add +
 * delete. Reads go through `WordBookService` / `ScopedRepository` in the
 * mirrored kernel; adding a word automatically enrolls it into the SM-2 queue.
 */
import {
  ALL_SCENES, SCENE_LABELS, SCENE_ICONS, Scene, Word, WordFilter,
  WordStatus, WordSource, StudyRecord, NewWordInput, AccountSession,
  DEFAULT_GUEST_SESSION,
} from '../core/index';
import { appState } from '../app/AppState';

interface WordRow {
  readonly id: string;
  readonly text: string;
  readonly phonetic: string;
  readonly meaningZh: string;
  readonly exampleInScene: string;
  readonly sceneLabel: string;
  readonly icon: string;
  readonly source: WordSource;
  readonly statusText: string;
  readonly dueYMD: string;
  readonly relearn: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  new: '未学', learning: '学习中', relearning: '需重学', mastered: '已掌握',
};

@Entry
@Component
struct VocabularyScreen {
  @State rows: WordRow[] = [];
  @State keyword: string = '';
  @State sceneFilter: string = 'ALL';
  @State showAdd: boolean = false;
  @State newText: string = '';
  @State newMeaning: string = '';
  @State newExample: string = '';
  @State sceneCounts: string[] = [];

  async aboutToAppear(): Promise<void> {
    await this.load();
  }

  private async session(): Promise<AccountSession> {
    const kernel = appState.kernel;
    if (kernel === undefined) return DEFAULT_GUEST_SESSION;
    const r = await kernel.services.account.current();
    return r.ok && r.value !== undefined ? r.value : DEFAULT_GUEST_SESSION;
  }

  private async load(): Promise<void> {
    const kernel = appState.kernel;
    if (kernel === undefined) return;
    const session: AccountSession = await this.session();
    let scene: Scene | 'ALL' = 'ALL';
    for (const candidate of ALL_SCENES) {
      if (candidate === this.sceneFilter) scene = candidate;
    }
    const filter: WordFilter = { scene: scene, keyword: this.keyword, status: 'ALL' };
    const listR = await kernel.services.wordBook.list(session, filter);
    const words: readonly Word[] = listR.ok && listR.value !== undefined ? listR.value : [];
    const recordsR = await kernel.services.repository.loadRecords(session);
    const recordById: Map<string, StudyRecord> = new Map<string, StudyRecord>();
    if (recordsR.ok && recordsR.value !== undefined) {
      for (const record of recordsR.value) recordById.set(record.wordId, record);
    }
    const rows: WordRow[] = [];
    for (const word of words) {
      const record: StudyRecord | undefined = recordById.get(word.id);
      const status: WordStatus = record !== undefined ? record.status : WordStatus.New;
      rows.push({
        id: word.id, text: word.text, phonetic: word.phonetic,
        meaningZh: word.meaningZh, exampleInScene: word.exampleInScene,
        sceneLabel: SCENE_LABELS[word.scene], icon: SCENE_ICONS[word.scene],
        source: word.source,
        statusText: STATUS_LABELS[status] ?? status,
        dueYMD: record !== undefined ? record.dueYMD : '—',
        relearn: status === WordStatus.Relearning,
      });
    }
    this.rows = rows;

    const countsR = await kernel.services.wordBook.byScene(session);
    const counts: string[] = [];
    if (countsR.ok && countsR.value !== undefined) {
      for (const item of countsR.value) {
        counts.push(SCENE_ICONS[item.scene] + ' ' + SCENE_LABELS[item.scene] + ' ' + String(item.count));
      }
    }
    this.sceneCounts = counts;
  }

  private async add(): Promise<void> {
    const kernel = appState.kernel;
    if (kernel === undefined) return;
    const text: string = this.newText.trim();
    if (text.length === 0) return;
    const input: NewWordInput = {
      text: text, meaningZh: this.newMeaning.trim(),
      scene: Scene.AIRPORT, exampleInScene: this.newExample.trim(),
    };
    const added = await kernel.app.addWord(input, kernel.clock);
    if (added.ok) {
      this.showAdd = false;
      this.newText = '';
      this.newMeaning = '';
      this.newExample = '';
    }
    await this.load();
  }

  private async remove(id: string): Promise<void> {
    const kernel = appState.kernel;
    if (kernel === undefined) return;
    const session: AccountSession = await this.session();
    await kernel.services.wordBook.remove(session, id);
    await this.load();
  }

  build() {
    Column({ space: 10 }) {
      Text('生词本').fontSize(22).fontWeight(FontWeight.Bold)

      Row({ space: 8 }) {
        TextInput({ text: this.keyword, placeholder: '搜索单词 / 释义 / 例句' })
          .layoutWeight(1)
          .onChange((value: string) => { this.keyword = value; })
        Button('搜索').onClick(() => { void this.load(); })
        Button('+ 添加').onClick(() => { this.showAdd = !this.showAdd; })
      }.width('100%')

      Row() {
        ForEach(this.sceneCounts, (label: string) => {
          Text(label).fontSize(11).padding(5).backgroundColor('#EEF2F9').borderRadius(12)
        })
      }.width('100%')

      if (this.showAdd) {
        Column({ space: 8 }) {
          TextInput({ text: this.newText, placeholder: '英文单词 / 短语（必填）' })
            .onChange((value: string) => { this.newText = value; })
          TextInput({ text: this.newMeaning, placeholder: '中文释义' })
            .onChange((value: string) => { this.newMeaning = value; })
          TextInput({ text: this.newExample, placeholder: '旅行情景例句（可选）' })
            .onChange((value: string) => { this.newExample = value; })
          Button('加入生词本').width('100%').onClick(() => { void this.add(); })
        }.width('100%').padding(12).backgroundColor('#FFFFFF').borderRadius(12)
      }

      List({ space: 8 }) {
        ForEach(this.rows, (row: WordRow) => {
          ListItem() {
            Column({ space: 4 }) {
              Row({ space: 6 }) {
                Text(row.text).fontSize(16).fontWeight(FontWeight.Bold)
                Text(row.icon + ' ' + row.sceneLabel).fontSize(11).fontColor('#6B7280')
                if (row.relearn) {
                  Text('需重学').fontSize(11).fontColor('#D97706')
                }
              }.width('100%')
              Text(row.meaningZh).fontSize(14)
              if (row.exampleInScene.length > 0) {
                Text('“' + row.exampleInScene + '”').fontSize(12).fontColor('#6B7280')
              }
              Text('状态 ' + row.statusText + ' · 下次复习 ' + row.dueYMD)
                .fontSize(11).fontColor('#6B7280')
              if (row.source !== WordSource.Seed) {
                Button('删除').fontSize(12).backgroundColor('#FFFFFF').fontColor('#DC2626')
                  .onClick(() => { void this.remove(row.id); })
              }
            }
            .width('100%')
            .padding(12)
            .backgroundColor('#FFFFFF')
            .borderRadius(12)
          }
        })
      }
      .layoutWeight(1)
      .width('100%')
    }
    .width('100%')
    .height('100%')
    .padding(14)
    .backgroundColor('#F4F6FB')
  }
}
