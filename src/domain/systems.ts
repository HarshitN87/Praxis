/**
 * Systems map — stocks, flows, delay-aware alerting, leverage.
 *
 * F25. The spec's alerting rule was: "require at least 2xD days of history;
 * alert if today > rolling_avg + 1.5 * SD". With `typical_delay_days = 1` —
 * the common case — that computes a standard deviation from TWO data points.
 * Beyond that, daily self-report data is strongly autocorrelated, bounded,
 * non-normal and lumpy. A 1.5 SD threshold on a 1-5 slider fires constantly,
 * and every false alarm trains you to ignore the next one.
 *
 * Corrected: a hard floor of 21 days, robust statistics (median + 2 x MAD
 * rather than mean + 1.5 x SD), and — more importantly — a shift from
 * point-alerting to TREND comparison, requiring a sustained departure of
 * three consecutive days before anything is said. Plus the spec's own
 * well-judged >30% missing-data suppression, and a cap of one alert per
 * stock per week.
 *
 * F26. Meadows' bands are restored to five, in his ordering, with goals and
 * paradigms — his two strongest leverage points — no longer dropped. And the
 * validation metric changes: the spec wanted interventions to "shift toward
 * higher leverage bands over time", which is a bad goal, because most
 * interventions genuinely SHOULD be parameters and optimising the metric
 * just means misclassifying your own work upward. Instead we ask the
 * falsifiable question: did the stock actually move?
 */

import type { FlowLog, Intervention, LeverageBand } from './types';
import { addDays, daysBetween, type LocalDate } from './dates';
import { median, rate, robustSpread, type Rate } from './stats';
import { MIN_N } from './calibration';

export const MIN_ALERT_WINDOW_DAYS = MIN_N.systemsWindow; // 21
export const MAX_MISSING_FRACTION = 0.3;
export const SUSTAINED_DAYS = 3;
export const MAD_THRESHOLD = 2;
export const ALERT_COOLDOWN_DAYS = 7;

export interface FlowAlert {
  flowId: string;
  direction: 'high' | 'low';
  /** Days in the trailing window that breached, most recent first. */
  breachedDates: LocalDate[];
  baseline: number;
  spread: number;
  recentMedian: number;
  delayDays: number;
  message: string;
}

export interface AlertContext {
  flowId: string;
  flowLabel: string;
  stockName: string;
  direction: 'inflow' | 'outflow';
  typicalDelayDays: number;
  logs: FlowLog[];
  today: LocalDate;
  lastAlertedOn: LocalDate | null;
}

/**
 * Returns an alert only when a departure is both large (relative to a robust
 * spread) and sustained. Silence is the correct output almost all the time.
 */
export function evaluateFlowAlert(ctx: AlertContext): FlowAlert | null {
  const D = Math.max(0, ctx.typicalDelayDays);
  const windowDays = Math.max(MIN_ALERT_WINDOW_DAYS, Math.ceil(2 * D));
  const from = addDays(ctx.today, -(windowDays - 1));

  const inWindow = ctx.logs.filter((l) => l.localDate >= from && l.localDate <= ctx.today);
  if (inWindow.length < MIN_ALERT_WINDOW_DAYS) return null;

  const missingFraction = 1 - inWindow.length / windowDays;
  if (missingFraction > MAX_MISSING_FRACTION) return null;

  if (ctx.lastAlertedOn && daysBetween(ctx.lastAlertedOn, ctx.today) < ALERT_COOLDOWN_DAYS) {
    return null;
  }

  // Baseline excludes the most recent SUSTAINED_DAYS so the recent stretch is
  // compared against history rather than against itself.
  const sorted = [...inWindow].sort((a, b) => a.localDate.localeCompare(b.localDate));
  const recent = sorted.slice(-SUSTAINED_DAYS);
  const baselineLogs = sorted.slice(0, -SUSTAINED_DAYS);
  if (recent.length < SUSTAINED_DAYS || baselineLogs.length < MIN_ALERT_WINDOW_DAYS - SUSTAINED_DAYS) {
    return null;
  }

  const values = baselineLogs.map((l) => l.value);
  const baseline = median(values);
  // robustSpread rather than a bare MAD: on discrete daily logs the MAD is
  // zero whenever more than half the values are identical, which is the
  // normal case here and would stop this function ever firing.
  const spread = robustSpread(values);
  if (!isFinite(spread) || spread === 0) return null;

  const hi = baseline + MAD_THRESHOLD * spread;
  const lo = baseline - MAD_THRESHOLD * spread;

  const allHigh = recent.every((l) => l.value > hi);
  const allLow = recent.every((l) => l.value < lo);
  if (!allHigh && !allLow) return null;

  const dir: 'high' | 'low' = allHigh ? 'high' : 'low';
  const recentMedian = median(recent.map((l) => l.value));
  const delayPhrase =
    D >= 1
      ? ` Based on the delay you recorded, ${ctx.stockName} tends to show it about ${Math.round(D)} day${Math.round(D) === 1 ? '' : 's'} later.`
      : '';

  return {
    flowId: ctx.flowId,
    direction: dir,
    breachedDates: recent.map((l) => l.localDate).reverse(),
    baseline,
    spread,
    recentMedian,
    delayDays: D,
    message: `"${ctx.flowLabel}" has been running ${dir} for ${SUSTAINED_DAYS} days running (median ${round2(recentMedian)} against a usual ${round2(baseline)}).${delayPhrase}`,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/* ---------------------------------------------------------------- */
/* Intervention effectiveness by leverage band (F26)                 */
/* ---------------------------------------------------------------- */

export interface BandEffectiveness {
  band: LeverageBand;
  checked: number;
  asIntended: number;
  noChange: number;
  opposite: number;
  tooNoisy: number;
  rate: Rate;
  sufficient: boolean;
}

export function effectivenessByBand(interventions: Intervention[]): BandEffectiveness[] {
  const bands: LeverageBand[] = [
    'parameters',
    'feedback_and_delays',
    'information_flows',
    'rules',
    'goals_and_paradigms',
  ];
  return bands.map((band) => {
    const inBand = interventions.filter((i) => i.leverageBand === band && i.effectObserved);
    // "too noisy to tell" is excluded from the denominator — it is an honest
    // non-answer, not a failure.
    const judged = inBand.filter((i) => i.effectObserved !== 'too_noisy_to_tell');
    const asIntended = judged.filter((i) => i.effectObserved === 'as_intended').length;
    return {
      band,
      checked: inBand.length,
      asIntended,
      noChange: judged.filter((i) => i.effectObserved === 'no_change').length,
      opposite: judged.filter((i) => i.effectObserved === 'opposite').length,
      tooNoisy: inBand.filter((i) => i.effectObserved === 'too_noisy_to_tell').length,
      rate: rate(asIntended, judged.length),
      sufficient: judged.length >= MIN_N.leverageBand,
    };
  });
}

/**
 * When an intervention's effect should be checked: 2x the delay of the
 * slowest flow on the stock, floored so it is never an instant "did it work?"
 */
export function effectCheckDate(today: LocalDate, maxFlowDelayDays: number): LocalDate {
  const days = Math.max(14, Math.ceil(2 * maxFlowDelayDays));
  return addDays(today, days);
}
