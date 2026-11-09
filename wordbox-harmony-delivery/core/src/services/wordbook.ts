/**
 * `WordBookService` — built-in seed words + user/chat words, 8-scene filter,
 * case-insensitive search and automatic SM-2 enrollment for every new word.
 */
import {
  AccountSession, NewWordInput, Scene, SceneWordCount, StudyRecord,
  Word, WordEntry, WordFilter, WordSource, WordStatus,
} from '../models/types';
import { Result, ok, fail, ErrorCode } from '../models/errors';
import { Clock } from '../ports/ports';
import { ALL_SCENES, SCENE_AI_ROLES } from '../models/constants';
import { SEED_WORDS } from '../data/seedWords';
import { wordIdOf } from '../utils/id';
import { partitionOf, wordsKey, recordKey } from '../ports/keys';
import { EbbinghausScheduler } from './scheduler';
import { SceneService } from './scene';
import { ScopedRepository } from './repository';

export interface WordBookService {
  list(session: AccountSession, filter: WordFilter): Promise<Result<readonly Word[]>>;
  add(session: AccountSession, input: NewWordInput, clock: Clock): Promise<Result<WordEntry>>;
  addFromChat(session: AccountSession, word: Word, clock: Clock): Promise<Result<WordEntry>>;
  remove(session: AccountSession, wordId: string): Promise<Result<boolean>>;
  search(session: AccountSession, keyword: string, filter: WordFilter): Promise<Result<readonly Word[]>>;
  byScene(session: AccountSession): Promise<Result<readonly SceneWordCount[]>>;
}

export interface WordBookDeps {
  readonly repository: ScopedRepository;
  readonly scheduler: EbbinghausScheduler;
  readonly scenes: SceneService;
}

function defaultFilter(): WordFilter {
  const filter: WordFilter = { scene: 'ALL', keyword: '', status: 'ALL' };
  return filter;
}

/** Create the canonical word-book service. */
export function createWordBookService(deps: WordBookDeps): WordBookService {
  const repository: ScopedRepository = deps.repository;
  const scheduler: EbbinghausScheduler = deps.scheduler;

  async function allWords(session: AccountSession): Promise<readonly Word[]> {
    const storedR = await repository.loadWords(session);
    const stored: readonly Word[] = storedR.ok && storedR.value !== undefined ? storedR.value : [];
    const known: Set<string> = new Set<string>();
    const out: Word[] = [];
    for (const w of SEED_WORDS) {
      known.add(w.id);
      out.push(w);
    }
    for (const w of stored) {
      if (!known.has(w.id)) {
        known.add(w.id);
        out.push(w);
      }
    }
    return out;
  }

  async function persistNewWord(session: AccountSession, word: Word, clock: Clock): Promise<Result<WordEntry>> {
    const record: StudyRecord = scheduler.createRecord(word.id, clock.todayYMD());
    const w = await repository.saveWord(session, word);
    if (!w.ok) return fail<WordEntry>(ErrorCode.STORAGE_WRITE_FAILED, 'word write failed');
    const r = await repository.saveRecord(session, record);
    if (!r.ok) return fail<WordEntry>(ErrorCode.STORAGE_WRITE_FAILED, 'record write failed');
    const entry: WordEntry = { word: word, record: record };
    return ok<WordEntry>(entry);
  }

  const service: WordBookService = {
    async list(session: AccountSession, filter: WordFilter): Promise<Result<readonly Word[]>> {
      const words: readonly Word[] = await allWords(session);
      const keyword: string = filter.keyword.trim().toLowerCase();
      let recordsR: Result<readonly StudyRecord[]> | undefined = undefined;
      if (filter.status !== 'ALL') {
        recordsR = await repository.loadRecords(session);
      }
      const statusById: Map<string, WordStatus> = new Map<string, WordStatus>();
      if (recordsR !== undefined && recordsR.ok && recordsR.value !== undefined) {
        for (const r of recordsR.value) statusById.set(r.wordId, r.status);
      }
      const out: Word[] = [];
      for (const w of words) {
        if (filter.scene !== 'ALL' && w.scene !== filter.scene) continue;
        if (keyword.length > 0) {
          const hay: string = (w.text + ' ' + w.meaningZh + ' ' + w.exampleInScene).toLowerCase();
          if (hay.indexOf(keyword) < 0) continue;
        }
        if (filter.status !== 'ALL') {
          const status: WordStatus = statusById.get(w.id) ?? WordStatus.New;
          if (status !== filter.status) continue;
        }
        out.push(w);
      }
      return ok<readonly Word[]>(out);
    },

    async add(session: AccountSession, input: NewWordInput, clock: Clock): Promise<Result<WordEntry>> {
      const text: string = input.text.trim();
      if (text.length === 0) return fail<WordEntry>(ErrorCode.INVALID_ARGUMENT, 'word text is empty');
      const word: Word = {
        id: wordIdOf(text, input.scene, WordSource.User),
        text: text,
        phonetic: '',
        meaningZh: input.meaningZh.trim(),
        scene: input.scene,
        locale: 'en-US',
        exampleInScene: input.exampleInScene.trim(),
        aiRolePrompt: 'You are a ' + SCENE_AI_ROLES[input.scene] + '; use this phrase in a real travel conversation.',
        source: WordSource.User,
        createdAtYMD: clock.todayYMD(),
      };
      return persistNewWord(session, word, clock);
    },

    async addFromChat(session: AccountSession, word: Word, clock: Clock): Promise<Result<WordEntry>> {
      const normalized: Word = {
        id: word.id.length > 0 ? word.id : wordIdOf(word.text, word.scene, WordSource.Chat),
        text: word.text,
        phonetic: word.phonetic,
        meaningZh: word.meaningZh,
        scene: word.scene,
        locale: word.locale,
        exampleInScene: word.exampleInScene,
        aiRolePrompt: word.aiRolePrompt,
        source: WordSource.Chat,
        createdAtYMD: clock.todayYMD(),
      };
      return persistNewWord(session, normalized, clock);
    },

    async remove(session: AccountSession, wordId: string): Promise<Result<boolean>> {
      if (wordId.length === 0) return fail<boolean>(ErrorCode.INVALID_ARGUMENT, 'wordId is empty');
      const p: string = partitionOf(session);
      const keys: string[] = [wordsKey(p, wordId), recordKey(p, wordId)];
      return repository.batchRemove(p, keys);
    },

    async search(session: AccountSession, keyword: string, filter: WordFilter): Promise<Result<readonly Word[]>> {
      const combined: WordFilter = {
        scene: filter.scene,
        keyword: keyword,
        status: filter.status,
      };
      return service.list(session, combined);
    },

    async byScene(session: AccountSession): Promise<Result<readonly SceneWordCount[]>> {
      const listR = await service.list(session, defaultFilter());
      const words: readonly Word[] = listR.ok && listR.value !== undefined ? listR.value : [];
      const counts: Map<string, number> = new Map<string, number>();
      for (const scene of ALL_SCENES) counts.set(scene, 0);
      for (const w of words) {
        const prev: number = counts.get(w.scene) ?? 0;
        counts.set(w.scene, prev + 1);
      }
      const out: SceneWordCount[] = [];
      for (const scene of ALL_SCENES) {
        out.push({ scene: scene, count: counts.get(scene) ?? 0 });
      }
      return ok<readonly SceneWordCount[]>(out);
    },
  };
  return service;
}
