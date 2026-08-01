import { useState } from 'react';
import {
  EXTREME_WARNING,
  formatAsFrequency,
  formatProbability,
  isExtreme,
  outOfTenToProbability,
  probabilityToOutOfTen,
} from '../domain/probability';
import { Notice } from './ui';

/**
 * The one probability control, used at every tier (fault F1).
 *
 * The v2.0 spec had two scales — probability 0..1 for decisions, an integer
 * 1..10 "confidence" for daily intentions, with no defined mapping between
 * them. Here there is one scale and one input method:
 *
 *   "Out of 10 times in a situation like this, how many go this way?"
 *
 * Frequency format is easier to reason about than a percentage, and it is
 * already the right instinct in §4.1 of the spec — the correction is
 * applying it everywhere rather than inventing a second scale for the module
 * that produces 98% of the data.
 */
export function ProbabilityInput({
  value,
  onChange,
  question,
  autoFocus,
}: {
  value: number;
  onChange: (p: number) => void;
  question: string;
  autoFocus?: boolean;
}) {
  const [fine, setFine] = useState(false);
  const k = probabilityToOutOfTen(value);

  return (
    <div className="prob">
      <div>
        <label className="label" style={{ marginBottom: 4 }}>
          {question}
        </label>
        <p className="hint" style={{ marginTop: 0 }}>
          Out of 10 times in a situation like this, how many go this way?
        </p>
      </div>

      {!fine ? (
        <div className="prob-track" role="group" aria-label="Out of ten">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              className={`prob-seg${n === k ? ' selected' : n < k ? ' filled' : ''}`}
              aria-pressed={k === n}
              aria-label={`${n} out of 10`}
              autoFocus={autoFocus && n === 5}
              onClick={() => onChange(outOfTenToProbability(n))}
            >
              {n}
            </button>
          ))}
        </div>
      ) : (
        <input
          type="range"
          className="prob-range"
          min={0}
          max={100}
          step={1}
          value={Math.round(value * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          aria-label="Probability percent"
        />
      )}

      <div className="prob-readout">
        <div>
          <span className="prob-value">{formatProbability(value)}</span>{' '}
          <span className="prob-gloss">— about {formatAsFrequency(value)}</span>
        </div>
        <button type="button" className="btn ghost sm" onClick={() => setFine((f) => !f)}>
          {fine ? 'Tenths' : 'Finer'}
        </button>
      </div>

      {isExtreme(value) ? (
        <Notice kind="warn" title="That is a claim of certainty">
          {EXTREME_WARNING}
        </Notice>
      ) : null}
    </div>
  );
}

/**
 * The outside view, revealed only AFTER the user has committed their own
 * estimate (fault F10).
 *
 * §4.7 of the spec correctly implemented an outside-view-first prompt for
 * big decisions, but daily intentions — where you have hundreds of directly
 * relevant past cases of the identical question, already sitting in your own
 * database — got no base rate at all. That is backwards. The reference class
 * here is perfect, free, and specific to you.
 *
 * Order matters: showing the base rate before the estimate would just anchor
 * you. Showing it after makes it information.
 */
export function BaseRateReveal({
  hits,
  n,
  stated,
  onRevise,
  onKeep,
  label,
}: {
  hits: number;
  n: number;
  stated: number;
  onRevise: (p: number) => void;
  onKeep: () => void;
  label: string;
}) {
  const observed = n === 0 ? NaN : hits / n;
  const [revised, setRevised] = useState(stated);

  return (
    <div className="card stack">
      <div>
        <span className="label">Your own track record</span>
        <p className="prose" style={{ marginTop: 0 }}>
          Your last {n} {label} intentions: you hit <strong>{hits}</strong> of{' '}
          <strong>{n}</strong> ({formatProbability(observed)}). You just said{' '}
          <strong>{formatProbability(stated)}</strong>.
        </p>
        <p className="hint">
          This is shown after you commit, not before, so it informs your estimate rather than
          anchoring it. Both versions are kept — Praxis later checks whether revising actually
          made you more accurate.
        </p>
      </div>

      <ProbabilityInput
        value={revised}
        onChange={setRevised}
        question="Want to revise?"
      />

      <div className="btn-row">
        <button type="button" className="btn" onClick={onKeep}>
          Keep {formatProbability(stated)}
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => onRevise(revised)}
          disabled={Math.abs(revised - stated) < 0.001}
        >
          Revise to {formatProbability(revised)}
        </button>
      </div>
    </div>
  );
}
