import React from 'react';

/* ============================================================
   Shared helpers
   ============================================================ */
const PALETTE = {
  blue:   '#3b82f6',
  cyan:   '#06b6d4',
  emerald:'#10b981',
  amber:  '#f59e0b',
  rose:   '#f43f5e',
  violet: '#8b5cf6',
  grid:   'rgba(148, 163, 184, 0.12)',
  axis:   'rgba(148, 163, 184, 0.5)',
  text:   '#94a3b8',
};

/* ============================================================
   Time-series line chart with gradient area
   Power BI style: grid, axis labels, current-value dot
   ============================================================ */
export function LineChart({
  series = [],          // [{ name, color, points: [nums] }]
  labels = [],          // time labels (same length as points)
  height = 220,
  yMax = 100,
  ySuffix = '%',
  showLegend = true,
}) {
  const W = 600, H = 220, padL = 36, padR = 12, padT = 12, padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const allEmpty = series.every(s => s.points.length < 2);

  if (allEmpty) {
    return (
      <div className="flex items-center justify-center text-xs text-slate-600" style={{ height }}>
        collecting samples…
      </div>
    );
  }

  const maxLen = Math.max(...series.map(s => s.points.length), 2);

  const x = (i) => padL + (i / Math.max(maxLen - 1, 1)) * innerW;
  const y = (v) => padT + innerH - (Math.min(v, yMax) / yMax) * innerH;

  const yTicks = [0, 25, 50, 75, 100].map(p => (p / 100) * yMax);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`grad-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* horizontal grid */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL} x2={W - padR}
              y1={y(t)} y2={y(t)}
              stroke={PALETTE.grid} strokeWidth="1"
            />
            <text
              x={padL - 6} y={y(t)}
              fontSize="9" fill={PALETTE.text}
              textAnchor="end" dominantBaseline="middle"
            >
              {Math.round(t)}{ySuffix}
            </text>
          </g>
        ))}

        {/* vertical grid (time) */}
        {Array.from({ length: 6 }).map((_, i) => {
          const px = padL + (i / 5) * innerW;
          return <line key={i} x1={px} x2={px} y1={padT} y2={H - padB} stroke={PALETTE.grid} strokeWidth="1" />;
        })}

        {/* series */}
        {series.map((s, si) => {
          if (s.points.length < 2) return null;
          const pts = s.points.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          const area = `${x(0)},${H - padB} ${pts} ${x(s.points.length - 1)},${H - padB}`;
          const last = s.points[s.points.length - 1];
          return (
            <g key={si}>
              <polygon points={area} fill={`url(#grad-${si})`} />
              <polyline
                points={pts}
                fill="none"
                stroke={s.color}
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {/* current value marker */}
              <circle
                cx={x(s.points.length - 1)}
                cy={y(last)}
                r="3.5"
                fill={s.color}
                stroke="#0f172a"
                strokeWidth="1.5"
              />
            </g>
          );
        })}

        {/* x labels */}
        {labels.length > 1 &&
          labels.map((lbl, i) => {
            if (i % Math.ceil(labels.length / 6) !== 0) return null;
            return (
              <text
                key={i}
                x={x(i)} y={H - 6}
                fontSize="9" fill={PALETTE.text}
                textAnchor="middle"
              >
                {lbl}
              </text>
            );
          })}
      </svg>

      {showLegend && (
        <div className="flex flex-wrap gap-4 mt-2 px-1">
          {series.map((s, si) => (
            <div key={si} className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Horizontal bar chart — "top N by CPU"
   ============================================================ */
export function BarChart({ data = [], max = 100, suffix = '%' }) {
  if (!data.length) return <EmptyChart />;
  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const pct = Math.min((d.value / max) * 100, 100);
        const color = d.color || (pct > 80 ? PALETTE.rose : pct > 50 ? PALETTE.amber : PALETTE.blue);
        return (
          <div key={d.label} className="flex items-center gap-3 text-xs">
            <span className="w-32 truncate text-slate-300 font-mono" title={d.label}>{d.label}</span>
            <div className="flex-1 bg-slate-800/60 h-4 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            <span className="w-12 text-right text-slate-200 font-mono">
              {d.value}{suffix}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Donut chart — health distribution
   ============================================================ */
export function DonutChart({ segments = [], size = 180, thickness = 26 }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const radius = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * radius;

  if (!total) return <EmptyChart />;

  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const len = frac * circ;
          const el = (
            <circle
              key={i}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="20" fontWeight="700" fill="#f1f5f9">
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill="#94a3b8" letterSpacing="1">
          SERVICES
        </text>
      </svg>
      <div className="space-y-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-slate-300">{s.label}</span>
            <span className="ml-auto text-slate-100 font-mono font-semibold">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Sparkline (small, per-card / per-KPI)
   ============================================================ */
export function Sparkline({ values = [], color = PALETTE.blue, height = 32, fill = true }) {
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');
  const areaPts = `0,100 ${pts} 100,100`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} className="w-full">
      {fill && <polygon points={areaPts} fill={color} opacity="0.15" />}
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ============================================================
   Heatmap — CPU per service over time
   ============================================================ */
export function Heatmap({ rows = [], cols = 20 }) {
  if (!rows.length) return <EmptyChart />;
  const max = Math.max(...rows.flatMap(r => r.values), 1);

  return (
    <div className="space-y-1.5 overflow-x-auto">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-[10px]">
          <span className="w-28 truncate text-slate-400 font-mono" title={r.label}>{r.label}</span>
          <div className="flex gap-[2px]">
            {Array.from({ length: cols }).map((_, i) => {
              const v = r.values[i];
              const t = v == null ? 0 : v / max;
              const bg = v == null
                ? 'rgba(148,163,184,0.08)'
                : `rgba(244, 63, 94, ${0.15 + t * 0.85})`;
              return (
                <div
                  key={i}
                  className="w-3 h-4 rounded-sm"
                  style={{ background: bg }}
                  title={v == null ? '—' : `${v}%`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Empty helper
   ============================================================ */
function EmptyChart() {
  return <div className="h-32 flex items-center justify-center text-xs text-slate-600">no data</div>;
}

export { PALETTE };