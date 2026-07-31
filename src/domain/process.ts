/**
 * Process quality, and the measurement of hindsight contamination.
 *
 * F18. The spec's two-stage review hid `actual_outcome_label` at Stage 1 and
 * asked for a process score. But you already know the outcome — you lived
 * it. Hiding a text field in the UI does not create independence from
 * hindsight. Duke's mechanism requires the process judgment to be made
 * BEFORE the outcome is known, and that design cannot deliver it.
 *
 * Two fixes:
 *   1. Capture a process score AT COMMIT TIME, when the outcome genuinely is
 *      unknown.
 *   2. Add an OBJECTIVE checklist score computed by the app from the record
 *      itself. A checklist is far more hindsight-resistant than any
 *      self-rating, and it is free.
 *
 * F19. The spec's success metric was `corr(process_score,
 * outcome_favorability) -> 0`. That is wrong. If your process is genuinely
 * good, better process SHOULD correlate — weakly and noisily — with better
 * outcomes. That is the entire reason to have a process. A correlation of
 * exactly zero would mean your process has no value whatsoever; the metric,
 * taken seriously, targets uselessness. Duke's actual claim is that the
 * JUDGMENT is contaminated by outcomes, not that the true correlation is
 * zero. So we measure the contamination directly — see hindsightDelta().
 */

import type { FullCommitment, Resolution } from './types';
import { mean } from './stats';

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  /** Not every item applies to every decision. */
  applicable: boolean;
}

/**
 * The objective process checklist. Every item is a fact about the record,
 * not an opinion about the decision — which is exactly why it survives
 * hindsight.
 */
export function processChecklist(full: FullCommitment): ChecklistItem[] {
  const { commitment: c, options, predictions, premortems } = full;
  const hardToReverse =
    c.reversibility === 'hard_to_reverse' || c.reversibility === 'irreversible';
  const working = predictions.find((p) => p.isWorkingForecast) ?? null;

  return [
    {
      id: 'three_options',
      label: 'Generated three or more real options',
      done: options.length >= 3,
      applicable: true,
    },
    {
      id: 'vanishing',
      label: 'Ran the vanishing-options test',
      done: options.some((o) => o.isVanishingOptionAnswer),
      applicable: hardToReverse,
    },
    {
      id: 'premortem',
      label: 'Named two or more concrete failure mechanisms',
      done: premortems.length >= 2,
      applicable: true,
    },
    {
      id: 'premortem_tagged',
      label: 'Tagged each failure path reversible or not',
      done: premortems.length > 0,
      applicable: true,
    },
    {
      id: 'reference_class',
      label: 'Anchored on a reference class before the inside view',
      done: !!working?.referenceClass && working.referenceClassRate !== null,
      applicable: true,
    },
    {
      id: 'criterion',
      label: 'Wrote the resolution criterion before the outcome',
      done: c.resolutionCriterion.trim().length > 0,
      applicable: true,
    },
    {
      id: 'second_pass',
      label: 'Took a second independent estimate and averaged it',
      done: predictions.some((p) => p.pass === 'second'),
      applicable: hardToReverse,
    },
    {
      id: 'margin',
      label: 'Recorded a margin of safety and defined "enough"',
      done: (c.marginOfSafetyNote ?? '').trim().length > 0 && c.definesEnough !== null,
      applicable: c.isFinancial && hardToReverse,
    },
    {
      id: 'commit_score',
      label: 'Rated your own process before knowing the outcome',
      done: c.processScoreAtCommit !== null,
      applicable: true,
    },
  ];
}

export function checklistScore(full: FullCommitment): number {
  const items = processChecklist(full).filter((i) => i.applicable);
  if (items.length === 0) return 1;
  return items.filter((i) => i.done).length / items.length;
}

/* ---------------------------------------------------------------- */
/* Hindsight contamination — the corrected resulting metric (F19)    */
/* ---------------------------------------------------------------- */

export interface HindsightRecord {
  delta: number;
  favorability: number;
}

export function hindsightRecords(fulls: FullCommitment[]): HindsightRecord[] {
  const out: HindsightRecord[] = [];
  for (const f of fulls) {
    const r: Resolution | null = f.resolution;
    if (!r || r.status !== 'resolved') continue;
    if (f.commitment.processScoreAtCommit === null) continue;
    if (r.processScoreAtReview === null) continue;
    if (r.outcomeFavorability === null) continue;
    out.push({
      delta: r.processScoreAtReview - f.commitment.processScoreAtCommit,
      favorability: r.outcomeFavorability,
    });
  }
  return out;
}

export interface HindsightContamination {
  n: number;
  goodOutcomeDelta: number;
  badOutcomeDelta: number;
  /** The spread between them. Near zero = you are not resulting. */
  spread: number;
  nGood: number;
  nBad: number;
}

/**
 * If good outcomes get systematic upward revisions to the process score and
 * bad outcomes get downward ones, that is resulting — quantified, in your
 * own data, with no assumption that process does not matter.
 */
export function hindsightContamination(records: HindsightRecord[]): HindsightContamination {
  const good = records.filter((r) => r.favorability > 0).map((r) => r.delta);
  const bad = records.filter((r) => r.favorability < 0).map((r) => r.delta);
  const g = good.length ? mean(good) : NaN;
  const b = bad.length ? mean(bad) : NaN;
  return {
    n: records.length,
    goodOutcomeDelta: g,
    badOutcomeDelta: b,
    spread: g - b,
    nGood: good.length,
    nBad: bad.length,
  };
}
