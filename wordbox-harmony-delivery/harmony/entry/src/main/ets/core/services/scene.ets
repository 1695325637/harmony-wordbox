// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/services/scene.ts

/**
 * `SceneService` — read-only metadata over the built-in seed library.
 * Pure and deterministic; no persistence, no network.
 */
import { Scene, SceneMeta, Settings, Word } from '../models/types';
import { ALL_SCENES, SCENE_LABELS, SCENE_AI_ROLES, SCENE_ICONS } from '../models/constants';
import { seedWordsOf } from '../data/seedWords';

export interface SceneService {
  all(): readonly SceneMeta[];
  wordsOf(scene: Scene): readonly Word[];
  rolePrompt(scene: Scene): string;
  suggestedScenes(settings: Settings, todayYMD: string): readonly Scene[];
  labels(): Readonly<Record<Scene, string>>;
}

/** Create the canonical scene service. */
export function createSceneService(): SceneService {
  const metas: SceneMeta[] = [];
  for (const scene of ALL_SCENES) {
    const meta: SceneMeta = {
      scene: scene,
      labelZh: SCENE_LABELS[scene],
      icon: SCENE_ICONS[scene],
      aiRole: SCENE_AI_ROLES[scene],
      seedCount: seedWordsOf(scene).length,
    };
    metas.push(meta);
  }

  const service: SceneService = {
    all(): readonly SceneMeta[] {
      return metas;
    },
    wordsOf(scene: Scene): readonly Word[] {
      return seedWordsOf(scene);
    },
    rolePrompt(scene: Scene): string {
      return '你是' + SCENE_AI_ROLES[scene] + '，正在「' + SCENE_LABELS[scene]
        + '」的真实旅行场景中与旅客用简单英语对话。';
    },
    suggestedScenes(settings: Settings, todayYMD: string): readonly Scene[] {
      // Deterministic rotation anchored on the local date, restricted to the
      // user's preferred scenes. Kept pure so FakeClock tests are reproducible.
      const preferred: readonly Scene[] = settings.preferredScenes.length > 0
        ? settings.preferredScenes
        : ALL_SCENES;
      if (preferred.length === 0) return ALL_SCENES;
      const anchor: number = todayYMD.length > 0 ? todayYMD.charCodeAt(todayYMD.length - 1) : 0;
      const out: Scene[] = [];
      const start: number = anchor % preferred.length;
      for (let i: number = 0; i < preferred.length; i++) {
        out.push(preferred[(start + i) % preferred.length]);
      }
      return out;
    },
    labels(): Readonly<Record<Scene, string>> {
      return SCENE_LABELS;
    },
  };
  return service;
}
