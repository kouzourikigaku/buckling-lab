import type { ReactNode } from 'react';
import { C, useNarrow } from './ui.tsx';

export interface Series {
  f?: (x: number) => number;
  pts?: [number, number][];
  /** f を描く範囲(既定は x の範囲全体) */
  from?: number;
  to?: number;
  color: string;
  width?: number;
  dash?: string;
  opacity?: number;
  label?: string;
  /** 線の右端に置く文字の位置(x)。省略で置かない */
  labelAt?: number;
  labelDy?: number;
}

export interface PlotProps {
  x: [number, number];
  y: [number, number];
  xTicks: number[];
  yTicks: number[];
  xLabel: string;
  yLabel: string;
  /** 横軸の左右の意味(例: ['← 太く短い柱', '細く長い柱 →']) */
  xHint?: [string, string];
  /** 縦軸の意味(縦書き。例: '耐えられる力 →') */
  yHint?: string;
  series: Series[];
  /** 点: [x, y, 色, 半径] */
  dots?: [number, number, string, number?][];
  /** 縦の線: [x, 色, 文字] */
  vlines?: [number, string, string?][];
  /** 塗り分け: [x0, x1, 色, 文字] */
  bands?: [number, number, string, string?][];
  /** 図の上の自由な文字: [x, y, 文字, 色, 寄せ] */
  notes?: [number, number, string, string?, ('start' | 'middle' | 'end')?][];
  yFmt?: (v: number) => string;
  xFmt?: (v: number) => string;
  aria: string;
  /** 描画の後に重ねる SVG(座標変換 X・Y を受け取る) */
  extra?: (X: (v: number) => number, Y: (v: number) => number) => ReactNode;
  height?: number;
}

/** 正確な軸と目盛りの付いたグラフ。スマホでは文字が小さくならないよう、描く幅を変える */
export function Plot(p: PlotProps) {
  const narrow = useNarrow();
  const W = narrow ? 360 : 600;
  const H = p.height ?? (narrow ? 270 : 330);
  const fs = narrow ? 12 : 13;
  const m = { l: (narrow ? 42 : 52) + (p.yHint ? 16 : 0), r: 12, t: 18, b: (narrow ? 40 : 44) + (p.xHint ? 18 : 0) };
  const X = (v: number) => m.l + ((v - p.x[0]) / (p.x[1] - p.x[0])) * (W - m.l - m.r);
  const Y = (v: number) => H - m.b - ((v - p.y[0]) / (p.y[1] - p.y[0])) * (H - m.t - m.b);
  const clipY = (v: number) => Math.max(p.y[0] - 0.02 * (p.y[1] - p.y[0]), Math.min(p.y[1] + 0.02 * (p.y[1] - p.y[0]), v));
  const path = (s: Series) => {
    let pts: [number, number][] = s.pts ?? [];
    if (s.f) {
      const a = s.from ?? p.x[0];
      const b = s.to ?? p.x[1];
      const n = 240;
      pts = Array.from({ length: n + 1 }, (_, i) => {
        const x = a + ((b - a) * i) / n;
        return [x, s.f!(x)] as [number, number];
      });
    }
    return pts
      .filter(([, y]) => Number.isFinite(y))
      .map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(clipY(y)).toFixed(1)}`)
      .join(' ');
  };
  const yf = p.yFmt ?? ((v: number) => String(v));
  const xf = p.xFmt ?? ((v: number) => String(v));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={p.aria}>
      <defs>
        <clipPath id={`clip-${p.aria.length}-${W}`}>
          <rect x={m.l} y={m.t - 6} width={W - m.l - m.r} height={H - m.t - m.b + 6} />
        </clipPath>
      </defs>
      {(p.bands ?? []).map(([a, b, c, t], i) => (
        <g key={`b${i}`}>
          <rect x={X(a)} y={m.t} width={X(b) - X(a)} height={H - m.t - m.b} fill={c} />
          {t && (
            <text x={(X(a) + X(b)) / 2} y={m.t + fs + 2} fontSize={fs - 1} textAnchor="middle" fill={C.dim} fontWeight={700}>
              {t}
            </text>
          )}
        </g>
      ))}
      {p.yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={m.l} y1={Y(v)} x2={W - m.r} y2={Y(v)} stroke={C.grid} />
          <text x={m.l - 6} y={Y(v) + fs / 3} fontSize={fs} textAnchor="end" fill={C.dim} className="num">
            {yf(v)}
          </text>
        </g>
      ))}
      {p.xTicks.map((v) => (
        <g key={`x${v}`}>
          <line x1={X(v)} y1={H - m.b} x2={X(v)} y2={H - m.b + 4} stroke={C.axis} />
          <text x={X(v)} y={H - m.b + fs + 4} fontSize={fs} textAnchor="middle" fill={C.dim} className="num">
            {xf(v)}
          </text>
        </g>
      ))}
      <line x1={m.l} y1={H - m.b} x2={W - m.r} y2={H - m.b} stroke={C.axis} strokeWidth={1.2} />
      <line x1={m.l} y1={m.t - 6} x2={m.l} y2={H - m.b} stroke={C.axis} strokeWidth={1.2} />
      <text x={(m.l + W - m.r) / 2} y={H - 6 - (p.xHint ? 18 : 0)} fontSize={fs} textAnchor="middle" fill={C.ink} fontWeight={700}>
        {p.xLabel}
      </text>
      {p.xHint && (
        <g fontSize={fs - 1} fill={C.dim} fontWeight={700}>
          <text x={m.l} y={H - 6}>{p.xHint[0]}</text>
          <text x={W - m.r} y={H - 6} textAnchor="end">
            {p.xHint[1]}
          </text>
          <line x1={m.l + 2} y1={H - 2} x2={W - m.r - 2} y2={H - 2} stroke={C.grid} strokeWidth={2} />
        </g>
      )}
      {p.yHint && (
        <text
          x={12}
          y={(m.t + H - m.b) / 2}
          fontSize={fs - 1}
          fill={C.dim}
          fontWeight={700}
          textAnchor="middle"
          transform={`rotate(-90 12 ${(m.t + H - m.b) / 2})`}
        >
          {p.yHint}
        </text>
      )}
      <text x={m.l + 4} y={m.t - 6} fontSize={fs} fill={C.ink} fontWeight={700}>
        {p.yLabel}
      </text>
      {(p.vlines ?? []).map(([x, c, t], i) => (
        <g key={`v${i}`}>
          <line x1={X(x)} y1={m.t} x2={X(x)} y2={H - m.b} stroke={c} strokeDasharray="4 4" strokeWidth={1.2} />
          {t && (
            <text x={X(x) + 4} y={H - m.b - 6} fontSize={fs - 1} fill={c} fontWeight={700}>
              {t}
            </text>
          )}
        </g>
      ))}
      <g clipPath={`url(#clip-${p.aria.length}-${W})`}>
        {p.series.map((s, i) => (
          <path key={i} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.5} strokeDasharray={s.dash} opacity={s.opacity ?? 1} strokeLinejoin="round" />
        ))}
      </g>
      {p.series
        .filter((s) => s.label && s.labelAt !== undefined)
        .map((s, i) => {
          const x = s.labelAt!;
          const y = s.f ? s.f(x) : 0;
          return (
            <text key={`l${i}`} x={X(x)} y={Y(clipY(y)) + (s.labelDy ?? -8)} fontSize={fs} fill={s.color} fontWeight={700} textAnchor="middle" opacity={s.opacity ?? 1}>
              {s.label}
            </text>
          );
        })}
      {(p.dots ?? []).map(([x, y, c, r], i) => (
        <circle key={`d${i}`} cx={X(x)} cy={Y(y)} r={r ?? 5} fill={c} stroke="#fff" strokeWidth={1.5} />
      ))}
      {(p.notes ?? []).map(([x, y, t, c, a], i) => (
        <text key={`n${i}`} x={X(x)} y={Y(y)} fontSize={fs} fill={c ?? C.ink} fontWeight={700} textAnchor={a ?? 'start'}>
          {t}
        </text>
      ))}
      {p.extra?.(X, Y)}
    </svg>
  );
}

/** 凡例 */
export function Legend({ items }: { items: [string, string, string?][] }) {
  return (
    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map(([color, label, dash]) => (
        <span key={label} className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth="3" strokeDasharray={dash} />
          </svg>
          {label}
        </span>
      ))}
    </p>
  );
}
