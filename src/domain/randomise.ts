/**
 * Within-subject randomisation.
 *
 * Faults F9 and F28. The v2.0 spec proposed two validation metrics that
 * cannot work as specified:
 *
 *  - "Hit rate on days with an implementation intention vs. days without."
 *    The prompt was optional, so you fill it in on the days you are already
 *    most committed. The comparison measures your motivation, not
 *    Gollwitzer's technique. It would show a large fake effect and you would
 *    believe it.
 *
 *  - Reframing had `reframe_shown TEXT NOT NULL`, meaning every entry gets a
 *    reframe. With no control arm, `mean(actual - predicted)` can never
 *    distinguish "the reframe worked" from "I am simply bad at predicting
 *    difficulty". The module's validation metric could not validate the
 *    module.
 *
 * Both are fixed the same way: the app flips a coin. You may always add an
 * implementation intention yourself — those are tagged `user_initiated` and
 * analysed separately, never pooled into the randomised comparison.
 */

import type { IIAssignment, ReframeCondition } from './types';

export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

export function coinFlip(rng: Rng = defaultRng): boolean {
  return rng() < 0.5;
}

export function assignImplementationIntention(rng: Rng = defaultRng): IIAssignment {
  return coinFlip(rng) ? 'prompted' : 'not_prompted';
}

export function assignReframeCondition(rng: Rng = defaultRng): ReframeCondition {
  return coinFlip(rng) ? 'reframe' : 'control';
}

/**
 * A fixed library of reappraisal prompts (§4.5). Deliberately a fixed list
 * rather than generated text: the claim being tested is that conscious
 * reappraisal shifts the experience, and a stable set of prompts is the only
 * way the before/after gap means anything across entries.
 *
 * These are reappraisal, not denial. None of them tell you the task is easy,
 * and none of them tell you a real signal is not real.
 */
export const REFRAME_LIBRARY: string[] = [
  'The tightness you feel before starting is your body preparing to work, not evidence that the work will go badly.',
  'You are about to do a hard thing. Difficulty is the cost of the thing being worth doing, not a sign you have chosen wrong.',
  'You have done things in this range before. Bring to mind one, specifically, and how it actually went.',
  'The first ten minutes are usually the worst part. You are estimating the whole task from its hardest moment.',
  'Fatigue and reluctance feel identical from the inside. This may be the second one.',
  'Nothing about this requires you to feel ready. Readiness tends to arrive after starting, not before.',
  'Notice the difference between "this is hard" and "this is going badly". Only one of those is information.',
  'You are allowed to do this imperfectly. A worse version that exists beats a better version that does not.',
];

export function pickReframe(rng: Rng = defaultRng): string {
  const i = Math.floor(rng() * REFRAME_LIBRARY.length);
  return REFRAME_LIBRARY[Math.min(i, REFRAME_LIBRARY.length - 1)]!;
}

/**
 * Crisis resources. Shown on every screen of the reframing module,
 * unconditionally and non-dismissibly.
 *
 * F29: the spec's "detection of distress signals suppresses the reframing
 * prompt" is deleted. With no LLM in the core loop it would be a keyword
 * matcher — over-inclusive ("this is killing me" about a spreadsheet) and
 * under-inclusive (real distress that does not use keywords) — and it would
 * silently change the UI with no explanation. Unreliable detection is worse
 * than none, because it creates a false impression that something is
 * watching. What actually helps is the always-visible resource, plus a
 * manual, user-controlled, reversible switch to turn reframing off.
 */
export const CRISIS_RESOURCES = [
  { region: 'International', name: 'Find a helpline', detail: 'findahelpline.com' },
  { region: 'India', name: 'Tele-MANAS', detail: '14416' },
  { region: 'India', name: 'AASRA', detail: '+91 98204 66726' },
  { region: 'US / Canada', name: 'Suicide & Crisis Lifeline', detail: '988' },
  { region: 'UK', name: 'Samaritans', detail: '116 123' },
];

export const NOT_A_MEDICAL_TOOL =
  'Praxis does not diagnose stress, anxiety or fatigue, and these prompts are not a substitute for medical or mental-health care.';
