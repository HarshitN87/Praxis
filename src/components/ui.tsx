import type { CSSProperties, ReactNode } from 'react';
import { formatRate, pct, type Interval, type Rate } from '../domain/stats';

/* ---------------------------------------------------------------- */
/* Layout                                                            */
/* ---------------------------------------------------------------- */

export function ScreenHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="screen-head row-between">
      <div>
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="section">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

export function Card({
  children,
  className = '',
  onClick,
  style,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  if (onClick) {
    return (
      <button type="button" className={`card ${className}`} onClick={onClick} style={style}>
        {children}
      </button>
    );
  }
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2 style={{ marginBottom: 8 }}>{title}</h2>
      <p className="prose">{body}</p>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Fields                                                            */
/* ---------------------------------------------------------------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  autoFocus,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NumberField({
  value,
  onChange,
  placeholder,
  step = 'any',
  min,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: string | number;
  min?: number;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={value === null ? '' : String(value)}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : Number(v));
      }}
    />
  );
}

export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  wide,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  wide?: boolean;
}) {
  return (
    <div className="pills">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`pill${wide ? ' wide' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="row-between" style={{ padding: '10px 0' }}>
      <div className="grow">
        <div style={{ fontSize: 15 }}>{label}</div>
        {hint ? <p className="hint" style={{ marginTop: 2 }}>{hint}</p> : null}
      </div>
      <button
        type="button"
        className="pill"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        style={{ minWidth: 64 }}
      >
        {checked ? 'On' : 'Off'}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Notices                                                           */
/* ---------------------------------------------------------------- */

export function Notice({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'warn' | 'block' | 'plain';
  title?: string;
  children: ReactNode;
}) {
  const cls = kind === 'plain' ? 'notice' : `notice ${kind}`;
  return (
    <div className={cls}>
      {title ? <strong className="notice-title">{title}</strong> : null}
      {children}
    </div>
  );
}

/**
 * The "not enough data yet" state. A first-class citizen of this product.
 *
 * The v2.0 spec's weekly digest printed a calibration verdict from seven
 * data points. An instrument that says "not enough data yet" is worth more
 * than one that always has an answer, so this component exists and is used
 * everywhere a threshold is not met.
 */
export function NotEnoughData({
  have,
  need,
  what,
  why,
}: {
  have: number;
  need: number;
  what: string;
  why?: string;
}) {
  return (
    <div className="insufficient">
      <div className="progress">
        {Math.min(have, need)} of {need}
      </div>
      <div style={{ marginTop: 4 }}>
        Not enough resolved {what} yet to say anything that would not be noise.
      </div>
      {why ? <div style={{ marginTop: 6, opacity: 0.85 }}>{why}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Stats                                                             */
/* ---------------------------------------------------------------- */

export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="row-between">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
      </div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}

/**
 * Every rate in this application is rendered through here, with its 95%
 * interval. This is the enforcement point for fault F4 — the single change
 * that stops the app confidently telling you things about yourself that are
 * pure noise.
 */
export function RateBar({ rate, label }: { rate: Rate; label?: string }) {
  if (rate.n === 0) {
    return <div className="stat-note">No data.</div>;
  }
  const lo = rate.ci.low * 100;
  const hi = rate.ci.high * 100;
  return (
    <div>
      {label ? <div className="stat-label">{label}</div> : null}
      <div className="stat-value">{formatRate(rate)}</div>
      <div className="ci" aria-hidden>
        <div className="ci-range" style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 1)}%` }} />
        <div className="ci-point" style={{ left: `${rate.point * 100}%` }} />
      </div>
      <div className="ci-scale">
        <span>0%</span>
        <span>
          {rate.hits} of {rate.n}
        </span>
        <span>100%</span>
      </div>
    </div>
  );
}

export function IntervalText({ ci, digits = 2 }: { ci: Interval; digits?: number }) {
  if (!isFinite(ci.low) || !isFinite(ci.high)) return <span className="muted">—</span>;
  return (
    <span className="mono">
      {ci.low.toFixed(digits)} to {ci.high.toFixed(digits)}
    </span>
  );
}

export function PercentPair({ a, b, aLabel, bLabel }: { a: number; b: number; aLabel: string; bLabel: string }) {
  return (
    <div className="row" style={{ gap: 24 }}>
      <div>
        <div className="stat-label">{aLabel}</div>
        <div className="stat-value">{pct(a)}</div>
      </div>
      <div>
        <div className="stat-label">{bLabel}</div>
        <div className="stat-value">{pct(b)}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Modal & stepper                                                   */
/* ---------------------------------------------------------------- */

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h2>{title}</h2>
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stepper({ total, current }: { total: number; current: number }) {
  return (
    <div className="steps" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`step-dot${i < current ? ' done' : i === current ? ' current' : ''}`}
        />
      ))}
    </div>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}
