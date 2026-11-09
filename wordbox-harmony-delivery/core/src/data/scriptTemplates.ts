/**
 * Fully offline scripted dialogues used by `ScriptedAI` (the降级 / fallback
 * provider). Every scene ships 3 script variants × 6 turns = 18 authored
 * templates per scene (24 bundles in total). All content is local; there is
 * no network, SDK or model dependency anywhere in this file.
 */
import { Scene } from '../models/types';
import { ALL_SCENES, SCENE_LABELS } from '../models/constants';
import { fnv1a } from '../utils/id';

/** One authored AI turn. */
export interface ScriptTurn {
  readonly aiText: string;
  readonly mustUseWordIndexes: readonly number[];
  readonly qualityRule: string;
}

/** A complete 6-turn offline script for a scene. */
export interface ScriptBundle {
  readonly scene: Scene;
  readonly variant: number;
  readonly turns: readonly ScriptTurn[];
}

const TURNS_PER_BUNDLE: number = 6;
const VARIANTS_PER_SCENE: number = 3;

/** One opening line per variant, used to make the 3 scripts distinguishable. */
const OPENERS: readonly string[] = [
  'Welcome! Let us practise some real travel English together.',
  'Great to see you again. Shall we keep going with this situation?',
  'No problem, take your time. Let us try this another way.',
];

/** Scene-specific conversational scaffolding, 6 turns each. */
const SCENE_TURNS: Readonly<Record<Scene, readonly string[]>> = {
  [Scene.AIRPORT]: [
    'Welcome to the check-in desk. May I see your passport and booking reference?',
    'Would you like a window seat or an aisle seat for this flight?',
    'Your bag is slightly over the baggage allowance; shall we check it in?',
    'Here is your boarding pass. Your gate number and boarding time are printed on it.',
    'Please go through security check, then wait in the departure lounge.',
    'Have a pleasant flight! Remember to keep your boarding pass handy.',
  ],
  [Scene.CUSTOMS]: [
    'Next, please. May I see your passport and arrival card?',
    'What is the purpose of your visit, and how long is your stay?',
    'Do you have anything to declare, such as food or expensive goods?',
    'If you have nothing to declare, please take the green channel.',
    'Keep your receipt and customs declaration in case of inspection.',
    'Everything is in order. Here is your entry stamp, enjoy your trip.',
  ],
  [Scene.HOTEL]: [
    'Good evening, welcome to the front desk. Do you have a reservation?',
    'I found your booking: a double room for three nights, breakfast included.',
    'Here is your room card. Would you like a wake-up call tomorrow?',
    'The Wi-Fi password is on this card, and the safe box is in the wardrobe.',
    'Check-out is at 11 am, but late checkout can be arranged.',
    'Enjoy your stay! Please call the front desk if you need anything.',
  ],
  [Scene.DINING]: [
    'Good evening! Here is the menu. Can I get you something to drink first?',
    'Are you ready to order, or shall I recommend today\'s chef\'s special?',
    'Certainly. Would you like the main course spicy or mild?',
    'I will bring your starter and a bottle of sparkling water right away.',
    'Everything alright with the food? Can I offer you the dessert menu?',
    'Here is the bill. Thank you, and have a lovely evening!',
  ],
  [Scene.DIRECTIONS]: [
    'Excuse me, you look a bit lost. Where would you like to go?',
    'Go straight for two blocks, then turn left at the traffic light.',
    'You will see a big landmark on the corner; the station is opposite it.',
    'If you prefer the subway, the nearest subway station is one block away.',
    'Do not take the one-way street; it is a dead end for pedestrians.',
    'You cannot miss it. Have a nice walk!',
  ],
  [Scene.SHOPPING]: [
    'Hello! Can I help you find something, or are you just browsing?',
    'This one is very popular. Would you like to try it in the fitting room?',
    'The price tag shows the VAT. Tourists can claim a tax refund.',
    'Sure, I will write up a refund form and attach the original receipt.',
    'You will need a customs stamp at the refund counter before departure.',
    'Here is your shopping bag. Enjoy your purchase!',
  ],
  [Scene.TRANSPORT]: [
    'Next, please. Where are you travelling today?',
    'A one-way ticket or a round-trip? The round-trip is better value.',
    'The express train leaves from platform 5 in twenty minutes.',
    'Would you like a seat reservation in first class or second class?',
    'There is a short delay, but your connection is still guaranteed.',
    'Here is your ticket. Mind the gap, and have a good journey!',
  ],
  [Scene.EMERGENCY]: [
    'Please stay calm. Tell me slowly what happened.',
    'Are you hurt? Do you feel any pain, dizziness or fever?',
    'I will call an ambulance and the police right away.',
    'Do you have travel insurance or a prescription with you?',
    'Let me contact your embassy and your emergency contact.',
    'Help is on the way. Stay with me and breathe slowly.',
  ],
};

function buildBundles(): readonly ScriptBundle[] {
  const bundles: ScriptBundle[] = [];
  for (const scene of ALL_SCENES) {
    const sceneTurns: readonly string[] = SCENE_TURNS[scene];
    for (let variant: number = 0; variant < VARIANTS_PER_SCENE; variant++) {
      const turns: ScriptTurn[] = [];
      for (let i: number = 0; i < TURNS_PER_BUNDLE; i++) {
        const base: string = sceneTurns[i];
        const opener: string = i === 0 ? OPENERS[variant] + ' ' : '';
        const turn: ScriptTurn = {
          aiText: opener + base + ' [' + SCENE_LABELS[scene] + ']',
          mustUseWordIndexes: [i % 3, (i + 1) % 3],
          qualityRule: 'targetHit',
        };
        turns.push(turn);
      }
      const bundle: ScriptBundle = { scene: scene, variant: variant, turns: turns };
      bundles.push(bundle);
    }
  }
  return bundles;
}

/** 8 scenes × 3 variants = 24 bundles, each with 6 turns. */
export const SCRIPT_BUNDLES: readonly ScriptBundle[] = buildBundles();

/**
 * Deterministically pick a turn for `(scene, turnIndex, seed)`.
 * `seed` (usually the sessionId) selects one of the 3 variants; `turnIndex`
 * is taken modulo 6 so an arbitrarily long conversation never runs out.
 */
export function scriptFor(scene: Scene, turnIndex: number, seed: string): ScriptTurn {
  const variantHash: number = parseInt(fnv1a(seed + '|' + scene).slice(0, 8), 16);
  const variant: number = variantHash % VARIANTS_PER_SCENE;
  const index: number = Math.abs(Math.trunc(turnIndex)) % TURNS_PER_BUNDLE;
  const bundlesOfScene: ScriptBundle[] = [];
  for (const bundle of SCRIPT_BUNDLES) {
    if (bundle.scene === scene) bundlesOfScene.push(bundle);
  }
  const chosen: ScriptBundle = bundlesOfScene[variant];
  return chosen.turns[index];
}
