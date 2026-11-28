import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { FitTex, Tex } from '../ui/Tex.tsx';
import { openDerivation } from '../ui/Story.tsx';

/** 色(画面全体と同じ意味で使う) */
export const C = {
  ink: '#1b2740',
  dim: '#55637b',
  grid: '#d5dce8',
  axis: '#64748b',
  blue: '#0b6fc2',
  red: '#e11d48',
  violet: '#6d28d9',
  orange: '#ea580c',
  green: '#16a34a',
  gray: '#94a3b8',
  navy: '#1e3a8a',
};

/** 幅の狭い画面(スマホ)か */
export function useNarrow(px = 640): boolean {
  const q = `(max-width: ${px}px)`;
  const [n, setN] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setN(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return n;
}

/** 前提の節へのボタン(同じタブでも別のタブでも、その節へ飛ぶ) */
export function NeedChip({ id, label }: { id: string; label: string }) {
  return (
    <button onClick={() => openDerivation(id)} className="rounded-full border border-comp/50 bg-studio-900 px-2.5 py-0.5 text-xs font-bold text-comp">
      {label} ›
    </button>
  );
}

/**
 * 節。no は「柱1」などの番号。
 * goal = この節で導く式(冒頭に枠で示す)、needs = 先に読んでおく節 [id, 名前]。
 * 映像の「導き方」リンクはこの節の頭へ飛ぶので、途中から読まなくて済むようにここで前提を示す。
 */
export function Section(props: {
  id: string;
  no?: string;
  title: string;
  lead?: ReactNode;
  goal?: string;
  goalNote?: string;
  needs?: [string, string][];
  children: ReactNode;
}) {
  return (
    <section id={props.id} className="mt-12 scroll-mt-28 first:mt-6">
      {props.no && <p className="text-xs font-bold tracking-[0.2em] text-comp">{props.no}</p>}
      <h2 className="mt-0.5 border-l-4 border-comp pl-3 text-[22px] font-bold leading-snug sm:text-2xl">{props.title}</h2>
      {(props.goal || props.needs) && (
        <div className="mt-3 rounded-xl border-2 border-comp/60 bg-comp/5 px-3 py-2">
          {props.goal && (
            <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
              <span className="shrink-0 rounded bg-comp px-1.5 py-0.5 text-xs font-bold text-white">この節で導く式</span>
              <FitTex className="w-full flex-1 text-[17px]">{props.goal}</FitTex>
            </div>
          )}
          {props.goalNote && <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{props.goalNote}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-dim">
            <span className="font-bold">使う式:</span>
            {props.needs && props.needs.length ? props.needs.map(([id, l]) => <NeedChip key={id} id={id} label={l} />) : <span>なし(ここから読める)</span>}
          </p>
        </div>
      )}
      {props.lead && <p className="mt-3 rounded-xl bg-ink px-4 py-3 text-[15px] font-bold leading-relaxed text-white sm:text-base">{props.lead}</p>}
      {props.children}
    </section>
  );
}

export function P({ children, id }: { children: ReactNode; id?: string }) {
  return <p id={id} className="mt-3 scroll-mt-28 text-[15px] leading-[1.9] sm:text-base">{children}</p>;
}

/** 番号付きの式 */
export function Eq(props: { n?: string; tex: string; note?: ReactNode; key?: string; strong?: boolean }) {
  return (
    <div className={`mt-3 rounded-xl border-2 bg-studio-900 px-3 py-2 ${props.strong ? 'border-comp' : 'border-studio-700'}`}>
      <div className="flex items-center gap-2">
        <FitTex block className="flex-1 text-[17px] sm:text-lg">{props.tex}</FitTex>
        {props.n && <span className="num shrink-0 text-xs font-bold text-ink-dim">({props.n})</span>}
      </div>
      {props.note && <p className="border-t border-studio-700 pt-1.5 text-[13px] leading-relaxed text-ink-dim">{props.note}</p>}
    </div>
  );
}

/** 文中の短い式 */
export const M = ({ children }: { children: string }) => <Tex>{children}</Tex>;

/** 番号付きの段 */
export function Step(props: { n: string | number; title: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div id={props.id} className="mt-5 flex scroll-mt-28 gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-comp text-sm font-bold text-white">{props.n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-bold leading-snug">{props.title}</p>
        <div className="text-[15px] leading-[1.85]">{props.children}</div>
      </div>
    </div>
  );
}

/** 番号付きの図。children に SVG と操作部品を入れる */
export function Fig(props: { n: string; title: string; children: ReactNode; caption?: ReactNode }) {
  return (
    <figure className="mt-5 rounded-2xl border border-studio-600 bg-studio-900 p-3 sm:p-4">
      <figcaption className="mb-2 text-sm font-bold">
        <span className="mr-2 rounded bg-ink px-1.5 py-0.5 text-xs text-white">図{props.n}</span>
        {props.title}
      </figcaption>
      {props.children}
      {props.caption && <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">{props.caption}</p>}
    </figure>
  );
}

/** 要点・注意・確認待ちの囲み */
export function Callout(props: { tone?: 'point' | 'warn' | 'check'; title: string; children: ReactNode }) {
  const tone = props.tone ?? 'point';
  const cls = tone === 'point' ? 'border-comp bg-comp/5' : tone === 'warn' ? 'border-yield bg-yield/5' : 'border-gold bg-gold/5';
  const tag = tone === 'point' ? 'ここが要点' : tone === 'warn' ? '注意' : '要確認';
  const tcls = tone === 'point' ? 'bg-comp' : tone === 'warn' ? 'bg-yield' : 'bg-gold';
  return (
    <div className={`mt-4 rounded-xl border-l-4 px-4 py-3 ${cls}`}>
      <p className="text-[15px] font-bold">
        <span className={`mr-2 rounded px-1.5 py-0.5 text-xs text-white ${tcls}`}>{tag}</span>
        {props.title}
      </p>
      <div className="mt-1 text-[15px] leading-[1.85]">{props.children}</div>
    </div>
  );
}

export function Table({ head, rows, note }: { head: ReactNode[]; rows: ReactNode[][]; note?: ReactNode }) {
  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} className="border border-studio-600 bg-ink px-2 py-1.5 text-left font-bold text-white">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 ? 'bg-studio-800' : 'bg-studio-900'}>
                {r.map((c, j) => (
                  <td key={j} className="border border-studio-600 px-2 py-1.5 align-top leading-relaxed">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="mt-1 text-xs text-ink-dim">{note}</p>}
    </div>
  );
}

export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-[1.8]">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

/** 図の下の小さなスライダー */
export function Knob(props: { label: ReactNode; value: number; min: number; max: number; step: number; show: string; color?: string; onChange: (v: number) => void }) {
  return (
    <label className="mt-2 block">
      <span className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-bold">{props.label}</span>
        <span className="num text-base font-bold" style={{ color: props.color ?? C.ink }}>
          {props.show}
        </span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        style={{ ['--thumb' as string]: props.color ?? C.blue }}
      />
    </label>
  );
}

/** 切り替えボタンの列 */
export function Seg<T extends string | number | boolean>(props: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {props.options.map(([v, label]) => (
        <button
          key={String(v)}
          onClick={() => props.onChange(v)}
          aria-pressed={props.value === v}
          className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${props.value === v ? 'border-comp bg-comp text-white' : 'border-studio-600 bg-studio-900 text-ink-dim'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** ページ内の目次(節へ飛ぶ) */
export function Toc({ items }: { items: [string, string][] }) {
  return (
    <nav className="mt-3 rounded-xl border border-studio-600 bg-studio-900 p-3" aria-label="この章の目次">
      <p className="text-xs font-bold text-ink-dim">この章の流れ</p>
      <ol className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {items.map(([id, t], i) => (
          <li key={id}>
            <a href={`#${id}`} className="font-bold text-comp">
              <span className="num mr-1 text-ink-dim">{i + 1}.</span>
              {t}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** 映像へのリンク */
export function MovieLink(props: { n: number; label: string; onStage: (n: number) => void }) {
  return (
    <button onClick={() => props.onStage(props.n)} className="mt-3 mr-2 inline-flex items-center gap-2 rounded-lg border border-comp bg-studio-900 px-3 py-2 text-sm font-bold text-comp">
      ▶ 映像{props.n}で見る: {props.label}
    </button>
  );
}

/** 章(タブ)へのリンク */
export function TabLink(props: { to: string; label: ReactNode; go: (t: string) => void; primary?: boolean }) {
  return (
    <button
      onClick={() => props.go(props.to)}
      className={`mt-3 mr-2 inline-flex items-center rounded-lg px-3 py-2 text-sm font-bold ${props.primary ? 'bg-comp text-white' : 'border border-comp bg-studio-900 text-comp'}`}
    >
      {props.label}
    </button>
  );
}
