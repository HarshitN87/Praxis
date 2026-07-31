import type { CalibrationBin } from '../domain/calibration';
import { pct } from '../domain/stats';

/**
 * The calibration curve.
 *
 * The dashed diagonal is perfect calibration. Each point is a probability
 * bin: x = what you said, y = what actually happened. Bins that have not
 * reached MIN_N.perBin are drawn faintly and carry no error bar — they are
 * shown so the shape of your data is visible, not so they can be read.
 */
export function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const W = 320;
  const H = 320;
  const pad = 34;
  const x = (p: number) => pad + p * (W - pad * 2);
  const y = (p: number) => H - pad - p * (H - pad * 2);

  const plotted = bins.filter((b) => b.n > 0 && isFinite(b.observed));
  const solid = plotted.filter((b) => b.sufficient);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Calibration curve">
        {/* grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={x(0)} y1={y(g)} x2={x(1)} y2={y(g)} stroke="var(--border)" strokeWidth="1" />
            <line x1={x(g)} y1={y(0)} x2={x(g)} y2={y(1)} stroke="var(--border)" strokeWidth="1" />
          </g>
        ))}

        {/* perfect calibration */}
        <line
          x1={x(0)}
          y1={y(0)}
          x2={x(1)}
          y2={y(1)}
          stroke="var(--border-strong)"
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />

        {/* error bars */}
        {solid.map((b, i) => (
          <line
            key={`ci${i}`}
            x1={x(b.meanProbability)}
            y1={y(b.ci.low)}
            x2={x(b.meanProbability)}
            y2={y(b.ci.high)}
            stroke="#cbd8d2"
            strokeWidth="6"
            strokeLinecap="round"
          />
        ))}

        {/* connecting line through sufficient bins only */}
        {solid.length > 1 ? (
          <polyline
            points={solid.map((b) => `${x(b.meanProbability)},${y(b.observed)}`).join(' ')}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {/* points */}
        {plotted.map((b, i) => (
          <circle
            key={`p${i}`}
            cx={x(b.meanProbability)}
            cy={y(b.observed)}
            r={b.sufficient ? 4.5 : 3}
            fill={b.sufficient ? 'var(--text-primary)' : 'transparent'}
            stroke={b.sufficient ? 'none' : 'var(--border-strong)'}
            strokeWidth="1.5"
          />
        ))}

        {/* axes */}
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">
          What you said
        </text>
        <text
          x={12}
          y={H / 2}
          textAnchor="middle"
          fontSize="11"
          fill="var(--text-secondary)"
          transform={`rotate(-90 12 ${H / 2})`}
        >
          What happened
        </text>
        <text x={x(0)} y={H - pad + 14} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">
          0%
        </text>
        <text x={x(1)} y={H - pad + 14} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">
          100%
        </text>
        <text x={x(0) - 8} y={y(1) + 3} textAnchor="end" fontSize="10" fill="var(--text-secondary)">
          100%
        </text>
        <text x={x(0) - 8} y={y(0) + 3} textAnchor="end" fontSize="10" fill="var(--text-secondary)">
          0%
        </text>
      </svg>

      <div className="chart-legend">
        <span className="key">
          <i style={{ background: 'var(--border-strong)' }} /> perfect calibration
        </span>
        <span className="key">
          <i style={{ background: 'var(--accent)' }} /> you
        </span>
        <span className="key">
          <i style={{ background: '#cbd8d2', height: 6 }} /> 95% interval
        </span>
      </div>
      <p className="hint">
        Points above the dashed line mean it happened more often than you said — you were
        underconfident there. Below the line means overconfident. Hollow points do not yet have
        enough data to read.
      </p>
    </div>
  );
}

/** Rolling-Brier trend. Falling is improving. */
export function Sparkline({
  points,
  height = 60,
  invertGood = true,
}: {
  points: number[];
  height?: number;
  invertGood?: boolean;
}) {
  if (points.length < 2) return null;
  const W = 320;
  const pad = 6;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Trend">
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p)}`).join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1]!)} r="3" fill="var(--text-primary)" />
      </svg>
      <p className="hint" style={{ marginTop: 0 }}>
        {invertGood ? 'Lower is better. ' : ''}
        Each point is a rolling window of 20 resolved predictions.
      </p>
    </div>
  );
}

/** Simple horizontal bars for counts, used in the systems and agency views. */
export function BarList({
  items,
}: {
  items: { label: string; value: number; caption?: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="stack-sm">
      {items.map((it) => (
        <div key={it.label}>
          <div className="row-between">
            <span style={{ fontSize: 14 }}>{it.label}</span>
            <span className="mono" style={{ fontSize: 14 }}>
              {it.value}
            </span>
          </div>
          <div className="ci" style={{ marginBottom: 2 }}>
            <div
              className="ci-range"
              style={{ left: 0, width: `${(it.value / max) * 100}%`, background: 'var(--accent)', opacity: 0.55 }}
            />
          </div>
          {it.caption ? <div className="stat-note">{it.caption}</div> : null}
        </div>
      ))}
    </div>
  );
}

/** Attainment strip for quantified intentions — shows partial credit. */
export function AttainmentBar({ attainment }: { attainment: number }) {
  const capped = Math.min(1.5, Math.max(0, attainment));
  return (
    <div>
      <div className="ci" style={{ height: 8 }}>
        <div
          className="ci-range"
          style={{
            left: 0,
            width: `${(capped / 1.5) * 100}%`,
            background: attainment >= 1 ? 'var(--accent)' : 'var(--border-strong)',
          }}
        />
        <div className="ci-point" style={{ left: `${(1 / 1.5) * 100}%`, top: -2, height: 12 }} />
      </div>
      <div className="ci-scale">
        <span>0</span>
        <span>target</span>
        <span>{pct(1.5, 0)}</span>
      </div>
    </div>
  );
}
