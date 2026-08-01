import type { CalibrationBin } from '../domain/calibration';
import { pct } from '../domain/stats';

/**
 * The calibration curve.
 *
 * The dashed diagonal is perfect calibration. Each point is a probability
 * bin: x = what you said, y = what actually happened.
 *
 * The shaded area between your curve and the diagonal is the miscalibration
 * itself, drawn rather than described — the eye reads "how far off, and in
 * which direction" from the shape long before it parses the numbers. It is
 * deliberately a single neutral tint: being overconfident is not styled as
 * worse-looking than being underconfident, because the app does not scold
 * (fault F11).
 *
 * Bins that have not reached MIN_N.perBin are drawn hollow and carry no
 * error bar. They are shown so the shape of your data is visible, not so
 * they can be read.
 */
export function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const W = 340;
  const H = 340;
  // padL leaves room for the tick labels AND the rotated axis title beside
  // them without the two colliding.
  const padL = 58;
  const padR = 16;
  const padT = 14;
  const padB = 44;

  const x = (p: number) => padL + p * (W - padL - padR);
  const y = (p: number) => H - padB - p * (H - padT - padB);

  const plotted = bins.filter((b) => b.n > 0 && isFinite(b.observed));
  const solid = plotted.filter((b) => b.sufficient);

  const areaPath =
    solid.length > 1
      ? [
          `M ${x(solid[0]!.meanProbability)} ${y(solid[0]!.observed)}`,
          ...solid.slice(1).map((b) => `L ${x(b.meanProbability)} ${y(b.observed)}`),
          ...[...solid]
            .reverse()
            .map((b) => `L ${x(b.meanProbability)} ${y(b.meanProbability)}`),
          'Z',
        ].join(' ')
      : null;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Calibration curve">
        <defs>
          <clipPath id="cal-clip">
            <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} />
          </clipPath>
        </defs>

        {/* plot field */}
        <rect
          x={padL}
          y={padT}
          width={W - padL - padR}
          height={H - padT - padB}
          fill="var(--paper)"
          stroke="var(--line)"
          strokeWidth="1"
          rx="4"
        />

        {/* quarter grid, kept very light */}
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g} opacity="0.6">
            <line x1={x(0)} y1={y(g)} x2={x(1)} y2={y(g)} stroke="var(--line)" strokeWidth="1" />
            <line x1={x(g)} y1={y(0)} x2={x(g)} y2={y(1)} stroke="var(--line)" strokeWidth="1" />
          </g>
        ))}

        {/* the miscalibration area */}
        {areaPath ? (
          <path d={areaPath} fill="var(--accent)" opacity="0.1" clipPath="url(#cal-clip)" />
        ) : null}

        {/* perfect calibration */}
        <line
          x1={x(0)}
          y1={y(0)}
          x2={x(1)}
          y2={y(1)}
          stroke="var(--ink-3)"
          strokeWidth="1.25"
          strokeDasharray="1 5"
          strokeLinecap="round"
        />

        {/* 95% intervals */}
        {solid.map((b, i) => (
          <line
            key={`ci${i}`}
            x1={x(b.meanProbability)}
            y1={y(b.ci.low)}
            x2={x(b.meanProbability)}
            y2={y(b.ci.high)}
            stroke="var(--accent-line)"
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.75"
          />
        ))}

        {/* your curve */}
        {solid.length > 1 ? (
          <polyline
            points={solid.map((b) => `${x(b.meanProbability)},${y(b.observed)}`).join(' ')}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.25"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {/* points */}
        {plotted.map((b, i) =>
          b.sufficient ? (
            <circle
              key={`p${i}`}
              cx={x(b.meanProbability)}
              cy={y(b.observed)}
              r="4.5"
              fill="var(--ink)"
              stroke="var(--paper)"
              strokeWidth="1.5"
            />
          ) : (
            <circle
              key={`p${i}`}
              cx={x(b.meanProbability)}
              cy={y(b.observed)}
              r="3"
              fill="var(--paper)"
              stroke="var(--line-2)"
              strokeWidth="1.5"
            />
          ),
        )}

        {/* axis ticks — the end labels are anchored inward so the origin
            labels of the two axes cannot overlap each other */}
        {([0, 0.5, 1] as const).map((t, i) => (
          <text
            key={`xt${t}`}
            x={x(t)}
            y={H - padB + 18}
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            fontSize="10"
            fill="var(--ink-3)"
            fontFamily="var(--mono)"
          >
            {pct(t, 0)}
          </text>
        ))}
        {[0, 0.5, 1].map((t) => (
          <text
            key={`yt${t}`}
            x={padL - 10}
            y={y(t) + 3.5}
            textAnchor="end"
            fontSize="10"
            fill="var(--ink-3)"
            fontFamily="var(--mono)"
          >
            {pct(t, 0)}
          </text>
        ))}

        {/* axis titles */}
        <text
          x={padL + (W - padL - padR) / 2}
          y={H - 5}
          textAnchor="middle"
          fontSize="10.5"
          fill="var(--ink-2)"
          letterSpacing="0.05em"
        >
          WHAT YOU SAID
        </text>
        <text
          x={11}
          y={padT + (H - padT - padB) / 2}
          textAnchor="middle"
          fontSize="10.5"
          fill="var(--ink-2)"
          letterSpacing="0.05em"
          transform={`rotate(-90 11 ${padT + (H - padT - padB) / 2})`}
        >
          WHAT HAPPENED
        </text>
      </svg>

      <div className="chart-legend">
        <span className="key">
          <i style={{ background: 'var(--ink-3)' }} /> perfect calibration
        </span>
        <span className="key">
          <i style={{ background: 'var(--accent)', height: 2.5 }} /> you
        </span>
        <span className="key">
          <i style={{ background: 'var(--accent-line)', height: 6, borderRadius: 3 }} /> 95%
          interval
        </span>
      </div>
      <p className="hint">
        Above the dashed line means it happened more often than you said — underconfident there.
        Below means overconfident. Hollow points do not yet have enough data to read.
      </p>
    </div>
  );
}

/** Rolling-Brier trend. Falling is improving. */
export function Sparkline({
  points,
  height = 72,
  invertGood = true,
}: {
  points: number[];
  height?: number;
  invertGood?: boolean;
}) {
  if (points.length < 2) return null;
  const W = 340;
  const padX = 4;
  const padY = 10;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - min) / span) * (height - padY * 2);

  const line = points.map((p, i) => `${x(i)},${y(p)}`).join(' ');
  const area = `${x(0)},${height} ${line} ${x(points.length - 1)},${height}`;
  const last = points[points.length - 1]!;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Trend">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#spark-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={x(points.length - 1)}
          cy={y(last)}
          r="3.5"
          fill="var(--ink)"
          stroke="var(--paper)"
          strokeWidth="1.5"
        />
      </svg>
      <p className="hint" style={{ marginTop: 2 }}>
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
        <div key={it.label} style={{ padding: '5px 0' }}>
          <div className="row-between" style={{ marginBottom: 5 }}>
            <span style={{ fontSize: 14 }}>{it.label}</span>
            <span className="mono" style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              {it.value}
            </span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: 'var(--paper-3)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(it.value / max) * 100}%`,
                background: 'var(--accent)',
                opacity: 0.65,
                borderRadius: 3,
                transition: 'width 0.4s var(--ease)',
              }}
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
  const hit = attainment >= 1;
  return (
    <div>
      <div
        style={{
          position: 'relative',
          height: 8,
          borderRadius: 4,
          background: 'var(--paper-3)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${(capped / 1.5) * 100}%`,
            /* Met and missed use the same hue at different weights. A miss is
               not coloured as a failure. */
            background: hit ? 'var(--accent)' : 'var(--line-2)',
            opacity: hit ? 0.8 : 1,
            borderRadius: 4,
            transition: 'width 0.4s var(--ease)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${(1 / 1.5) * 100}%`,
            top: -3,
            width: 2,
            height: 14,
            borderRadius: 1,
            background: 'var(--ink-2)',
          }}
        />
      </div>
      <div className="ci-scale" style={{ marginTop: 4 }}>
        <span>0</span>
        <span>target</span>
        <span>150%</span>
      </div>
    </div>
  );
}
