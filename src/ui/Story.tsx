import { useEffect, useRef, useState } from 'react';
import { panView, resetView, zoomView } from '../three/view.ts';
import type { ReactNode, RefObject } from 'react';
import type { ShowBase } from '../three/kit.ts';
import { Rich, Term } from './glossary.tsx';
import { FitTex } from './Tex.tsx';

/**
 * 映像の視点の調整(全映像で共通・保存される)。右上の「視点」を押すと、平行移動・寄り/引き・元に戻すのボタンが出る。
 * 回り込みは映像を横になぞる。
 */
export function ViewControls() {
  const [open, setOpen] = useState(false);
  const btn = 'flex h-9 w-9 items-center justify-center rounded-lg border border-studio-600 bg-studio-950/90 text-base font-bold text-ink active:bg-studio-800';
  return (
    <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-14 rounded-lg border border-studio-600 bg-studio-950/90 py-1 text-xs font-bold text-comp"
      >
        {open ? '閉じる' : '視点'}
      </button>
      <button
        onClick={resetView}
        title="既定の視点に戻す(移動・拡大縮小・回転)"
        className="w-14 rounded-lg border border-studio-600 bg-studio-950/90 py-1 text-xs font-bold text-ink-dim"
      >
        初期値
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-studio-600 bg-studio-900/90 p-1.5 shadow">
          <button className={btn} onClick={() => zoomView(1 / 1.15)} aria-label="寄る">＋</button>
          <button className={btn} onClick={() => panView(0, 0.15)} aria-label="上へ">↑</button>
          <button className={btn} onClick={() => zoomView(1.15)} aria-label="引く">－</button>
          <button className={btn} onClick={() => panView(-0.15, 0)} aria-label="左へ">←</button>
          <button className={btn} onClick={resetView} aria-label="元に戻す" title="元に戻す">⟲</button>
          <button className={btn} onClick={() => panView(0.15, 0)} aria-label="右へ">→</button>
          <span />
          <button className={btn} onClick={() => panView(0, -0.15)} aria-label="下へ">↓</button>
          <span />
        </div>
      )}
    </div>
  );
}

/** 「式と Q&A」のページを、指定のタブで開く(App が受け取る) */
export function openFormulas(tab: string, id?: string) {
  window.dispatchEvent(new CustomEvent('open-formulas', { detail: { tab, id } }));
}

/** 「式と Q&A」の節の id から、その節のあるタブを開いて節へ飛ぶ */
export function openDerivation(id: string) {
  const tab = id.startsWith('ds-')
    ? '理論から設計式へ'
    : id.startsWith('ov-')
      ? '3つの照査'
      : id.startsWith('ax')
        ? '強軸と弱軸'
        : id.startsWith('q')
          ? '質問と回答'
          : '式の導出';
  openFormulas(tab, id);
}

/** 式の横に置く「導き方」へのリンク */
export function DeriveLink({ id, label = '導き方' }: { id: string; label?: string }) {
  return (
    <button onClick={() => openDerivation(id)} className="shrink-0 rounded-md border border-comp/40 px-1.5 py-0.5 text-[11px] font-bold leading-none text-comp">
      {label} ›
    </button>
  );
}

export type Clip = { p: number; done: boolean; loop: boolean } | null;

/**
 * 場面の動きの進み具合を画面に書く(毎フレーム呼ぶ)。root は data-shell を付けた枠。
 * 上端のバー(data-clip-bar)、テロップの札(data-clip-label)、見終えたら「次へ」(data-next)を光らせる。
 */
export function updateClip(root: Element | null, clip: Clip) {
  if (!root) return;
  const track = root.querySelector<HTMLElement>('[data-clip-track]');
  const bar = root.querySelector<HTMLElement>('[data-clip-bar]');
  const label = root.querySelector<HTMLElement>('[data-clip-label]');
  const next = root.querySelector<HTMLElement>('[data-next]');
  const knob = root.querySelector<HTMLElement>('[data-clip-knob]');
  if (!clip) {
    if (track) track.style.opacity = '0';
    if (track) track.style.pointerEvents = 'none';
    if (label) label.style.visibility = 'hidden';
    next?.setAttribute('data-done', '0');
    return;
  }
  if (track) {
    track.style.opacity = '1';
    track.style.pointerEvents = 'auto';
  }
  const w = `${(clip.done && !clip.loop ? 1 : clip.p) * 100}%`;
  if (bar) {
    bar.style.width = w;
    bar.style.background = clip.done ? '#16a34a' : '';
  }
  if (knob) {
    knob.style.left = w;
    knob.style.borderColor = clip.done ? '#16a34a' : '';
    // 押すとどうなるかを記号で: 再生中は ❚❚(止める)、一時停止中は ▶(再生)
    const icon = PAUSED ? '▶' : '❚❚';
    if (knob.textContent !== icon) knob.textContent = icon;
  }
  if (label) {
    label.style.visibility = 'visible';
    const text = PAUSED
      ? `❚❚ 一時停止中 ${Math.round((clip.done && !clip.loop ? 1 : clip.p) * 100)}%`
      : clip.done
        ? clip.loop
          ? '✓ 見終わり ↻ くり返し中'
          : '✓ 見終わり ↻ もう一度'
        : `▶ 再生中 ${Math.round(clip.p * 100)}%`;
    if (label.textContent !== text) label.textContent = text;
    label.dataset.done = clip.done ? '1' : '0';
  }
  next?.setAttribute('data-done', clip.done ? '1' : '0');
}

/** 一時停止(全映像で共通)。場面が変わったり最初から再生したりすると再生に戻る */
let PAUSED = false;
export const isPaused = () => PAUSED;
export function setPaused(v: boolean) {
  PAUSED = v;
}

// 映像(data-shell の中のキャンバス)を押すと 一時停止 ⇄ 再生。真ん中に記号を一瞬出す
window.addEventListener('canvas-tap', (e) => {
  const c = (e as CustomEvent<HTMLCanvasElement>).detail;
  if (!c?.closest('[data-shell]')) return;
  setPaused(!PAUSED);
  const box = c.parentElement;
  if (!box) return;
  const f = document.createElement('div');
  f.textContent = PAUSED ? '❚❚' : '▶';
  f.setAttribute('aria-hidden', 'true');
  f.className =
    'pointer-events-none absolute left-1/2 top-1/2 z-[6] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink/55 text-2xl text-white transition-all duration-500';
  box.appendChild(f);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      f.style.opacity = '0';
      f.style.transform = 'translate(-50%, -50%) scale(1.4)';
    }),
  );
  setTimeout(() => f.remove(), 600);
});

/** 場面の中の再生位置を移す(p は 0〜1)。映像の部品(useShow・Stage3)が受け取る */
export function seekScene(p: number) {
  window.dispatchEvent(new CustomEvent('seek-scene', { detail: p }));
}

/**
 * 場面の番号ボタン(戻る・次へ の間)。押すとその場面へ飛ぶ。
 * いまの場面は塗りつぶし、見た場面は薄い色、まだの場面は枠だけ。lab を渡すと最後の場面をその字で(実験室は「実」、計算へは「計」)。
 */
export function SceneDots(props: { total: number; scene: number; onScene: (n: number) => void; lab?: string }) {
  const { total, scene } = props;
  return (
    <div className="flex flex-wrap items-center justify-center gap-0.5 sm:gap-1">
      {Array.from({ length: total }, (_, i) => {
        const isLab = !!props.lab && i === total - 1;
        const cls =
          i === scene
            ? 'border-comp bg-comp text-white'
            : i < scene
              ? 'border-comp/30 bg-comp/15 text-comp'
              : 'border-studio-600 bg-studio-950 text-ink-dim';
        return (
          <button
            key={i}
            type="button"
            onClick={() => props.onScene(i)}
            aria-current={i === scene ? 'step' : undefined}
            aria-label={isLab ? (props.lab === '計' ? '計算へ' : '実験室へ') : `場面 ${i + 1} へ`}
            className={`num flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold leading-none sm:h-6 sm:w-6 sm:text-[11px] ${cls}`}
          >
            {isLab ? props.lab : i + 1}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 映像の上端の、場面の動きの進み具合のバー(映像の枠の中に置く)。
 * 丸いつまみを押す = 一時停止と再生の切り替え。つまみをドラッグ = 再生位置を移して、離した所で一時停止。
 * バーのほかの所を押す = そこへ飛ぶ(再生・停止はそのまま)。
 */
export function ClipBar() {
  const g = useRef<{ x: number; moved: boolean; onKnob: boolean } | null>(null);
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
  };
  return (
    <div
      data-clip-track
      role="slider"
      aria-label="この場面の再生位置(つまみを押すと一時停止・再生)"
      className="absolute inset-x-0 top-0 z-[5] h-7 cursor-pointer touch-none transition-opacity"
      style={{ opacity: 0, pointerEvents: 'none' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const knob = e.currentTarget.querySelector<HTMLElement>('[data-clip-knob]');
        const kr = knob?.getBoundingClientRect();
        const onKnob = !!kr && Math.abs(e.clientX - (kr.left + kr.width / 2)) < 18;
        g.current = { x: e.clientX, moved: false, onKnob };
      }}
      onPointerMove={(e) => {
        const st = g.current;
        if (!st) return;
        if (!st.moved && Math.abs(e.clientX - st.x) > 5) {
          st.moved = true;
          setPaused(true);
        }
        if (st.moved) seekScene(at(e));
      }}
      onPointerUp={(e) => {
        const st = g.current;
        g.current = null;
        if (!st || st.moved) return; // ドラッグは離した所で一時停止のまま
        if (st.onKnob) setPaused(!isPaused());
        else seekScene(at(e));
      }}
      onPointerCancel={() => (g.current = null)}
    >
      <div className="absolute inset-x-0 top-0 h-1.5 bg-studio-700/60">
        <div data-clip-bar className="h-full bg-comp" style={{ width: '0%' }} />
      </div>
      <div
        data-clip-knob
        className="pointer-events-none absolute top-[4px] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-comp bg-white text-[9px] font-bold leading-none text-comp shadow"
        style={{ left: '0%' }}
      />
    </div>
  );
}

/** テロップの右に出す札。押すとその場面を最初から再生する */
export function ClipLabel({ onReplay }: { onReplay?: () => void }) {
  return (
    <button
      type="button"
      data-clip-label
      onClick={() => {
        setPaused(false);
        onReplay?.();
      }}
      className="pointer-events-auto shrink-0 rounded-full border border-studio-600 bg-white/90 px-2 py-0.5 text-[11px] font-bold tracking-normal text-ink-dim data-[done=1]:border-green-600 data-[done=1]:text-green-700"
      style={{ visibility: 'hidden' }}
    />
  );
}

export interface SceneText {
  kicker: string;
  head: string;
  body: string;
}

/**
 * 3D の舞台を作って毎フレーム動かす。canvasRef を <canvas> に、capRef を説明文の <p> に付ける。
 * onFrame は描いた直後に呼ばれる(画面の数字を更新するのに使う)。
 */
export function useShow<T extends ShowBase>(make: (c: HTMLCanvasElement) => T, onFrame?: (show: T) => void) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capRef = useRef<HTMLParagraphElement>(null);
  const show = useRef<T | null>(null);
  const cb = useRef(onFrame);
  cb.current = onFrame;
  useEffect(() => {
    const s = make(canvasRef.current!);
    show.current = s;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // 隠れているあいだ(「式と Q&A」を開いている間)は描かない
      if (!canvasRef.current?.clientWidth) {
        raf = requestAnimationFrame(tick);
        return;
      }
      s.paused = PAUSED;
      s.frame(dt);
      const el = capRef.current;
      if (el && el.textContent !== s.caption) {
        el.textContent = s.caption;
        el.style.opacity = s.caption ? '1' : '0';
      }
      cb.current?.(s);
      updateClip(canvasRef.current?.closest('[data-shell]') ?? null, s.clip());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onReplay = () => {
      s.clock = 0;
    };
    const onSeek = (e: Event) => {
      // 見えている映像だけ(補足ページの図などは動かさない)
      if (canvasRef.current?.closest('[data-shell]')) s.seek((e as CustomEvent<number>).detail);
    };
    window.addEventListener('replay-scene', onReplay);
    window.addEventListener('seek-scene', onSeek);
    return () => {
      window.removeEventListener('replay-scene', onReplay);
      window.removeEventListener('seek-scene', onSeek);
      cancelAnimationFrame(raf);
      s.dispose();
      show.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { canvasRef, capRef, show };
}

/** 番組仕立ての枠: 映像+見出しのテロップ、語り、横の欄、進行のボタン、最後の実験室 */
export function StoryShell(props: {
  scene: number;
  /** 場面の数(実験室を含む) */
  total: number;
  text: SceneText;
  onScene: (n: number) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  capRef: RefObject<HTMLParagraphElement | null>;
  /** 映像の上に重ねる物 */
  overlay?: ReactNode;
  /** 語りの下に置く欄 */
  side?: ReactNode;
  /** 最後の場面(実験室)で下に出す操作 */
  lab?: ReactNode;
  hint?: string;
  note?: string;
  /** 最後の場面へ進むボタンの文(既定は「実験室へ ▶」) */
  labLabel?: string;
}) {
  const { scene, total, text } = props;
  const isLab = scene === total - 1;
  const labRef = useRef<HTMLDivElement>(null);
  const frac = (scene + 1) / total;
  // 場面の札を押したら、その場面を最初から再生する(ShowBase の時計を 0 に戻す)
  const replay = () => window.dispatchEvent(new CustomEvent('replay-scene'));
  // 場面が変わったら再生に戻す
  useEffect(() => setPaused(false), [scene]);
  // 進み具合を App に知らせる(ナビのメーターと「映像に戻る」の表示に使う)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('scene-change', { detail: { scene, total } }));
  }, [scene, total]);
  return (
    <div className="mt-1 pb-20 lg:pb-0" data-shell>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-3">
        <div className="relative overflow-hidden rounded-2xl border border-studio-600 bg-studio-950">
          <canvas ref={props.canvasRef} className="block h-[44dvh] min-h-[300px] w-full lg:h-[72dvh]" />
          <ClipBar />
          <ViewControls />
          <p
            ref={props.capRef}
            className="pointer-events-none absolute inset-x-14 top-3 text-center text-base font-bold leading-snug text-ink drop-shadow-[0_2px_4px_rgba(255,255,255,0.95)] transition-opacity duration-300 sm:top-5 sm:text-2xl"
            style={{ opacity: 0 }}
          />
          {props.overlay}
          <div
            key={scene}
            className="telop pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-studio-950 via-studio-950/85 to-transparent px-3 pb-2.5 pt-10 sm:px-5 sm:pb-4"
            aria-live="polite"
          >
            <p className="flex items-center justify-between gap-2 text-[11px] font-bold tracking-[0.25em] text-comp sm:text-xs">
              <span className="min-w-0 truncate">
                {String(scene + 1).padStart(2, '0')}
                <span className="opacity-60"> / {String(total).padStart(2, '0')}</span> — {text.kicker}
              </span>
              <ClipLabel onReplay={replay} />
            </p>
            <p className="mt-0.5 border-l-4 border-comp pl-2.5 text-[19px] font-bold leading-snug drop-shadow-[0_2px_4px_rgba(255,255,255,0.95)] sm:text-3xl">
              {text.head}
            </p>
          </div>
        </div>

        {/* PC では映像と同じ高さの欄にし、進行のボタンをその下端に固定する(中身が長ければ欄の中で送る) */}
        <div className="flex min-w-0 flex-col gap-2 lg:h-[72dvh] lg:gap-3 lg:overflow-y-auto lg:pr-1">
          <p key={`b${scene}`} className="telop rounded-xl bg-studio-800/70 px-3 py-2 text-[14px] leading-relaxed text-ink sm:px-4 sm:py-3 sm:text-base">
            <Rich text={text.body} />
          </p>
          {isLab && props.lab && (
            <button
              onClick={() => labRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="h-12 rounded-xl bg-gold px-4 text-base font-bold text-white"
            >
              {props.labLabel ? '▼ 下のボタンから、式と計算へ' : '▼ 下のスライダーで実験する'}
            </button>
          )}
          {props.side}
          {props.hint && (
            <p className="px-1 text-[11px] text-ink-dim">
              {props.hint}(<Term id="amp">誇張について</Term>)
            </p>
          )}
          {!isLab && (
            <p className="px-1 text-xs">
              <button onClick={() => openFormulas('式の導出')} className="font-bold text-comp underline">
                式の導出・質問と回答を読む(補足)
              </button>
              <span className="text-ink-dim"> … 読んだら「映像に戻る」でこの場面へ</span>
            </p>
          )}
          <div className="fixed inset-x-0 bottom-0 z-20 mt-auto flex items-center gap-2 border-t border-studio-700 bg-studio-950/95 px-3 py-2 backdrop-blur lg:sticky lg:z-10 lg:border-t-0 lg:mx-0 lg:px-0 lg:pt-2 lg:pb-0">
            <button
              onClick={() => props.onScene(scene - 1)}
              disabled={scene === 0}
              className="h-12 whitespace-nowrap rounded-xl border border-studio-600 px-4 text-sm font-bold text-ink-dim disabled:opacity-30"
            >
              ◀ 戻る
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1" aria-label={`場面 ${scene + 1} / ${total}(${Math.round(frac * 100)}%)`}>
              <SceneDots total={total} scene={scene} onScene={props.onScene} lab={props.lab === undefined ? undefined : props.labLabel?.startsWith('計算') ? '計' : '実'} />
              <span className="num text-[11px] font-bold leading-none text-ink-dim">
                {scene + 1} / {total} ・ {Math.round(frac * 100)}%
              </span>
            </div>
            {isLab ? (
              <button onClick={() => props.onScene(0)} className="h-12 whitespace-nowrap rounded-xl border border-studio-600 px-4 text-sm font-bold">
                最初から見る
              </button>
            ) : (
              <button data-next onClick={() => props.onScene(scene + 1)} className="h-12 whitespace-nowrap rounded-xl bg-comp px-6 text-base font-bold text-studio-950">
                {scene === total - 2 ? (props.labLabel ?? '実験室へ ▶') : '次へ ▶'}
              </button>
            )}
          </div>
        </div>
      </div>
      {isLab && props.lab && (
        <div ref={labRef} className="mt-3 scroll-mt-3">
          {props.lab}
        </div>
      )}
      {props.note && (
        <details className="mt-4 px-1 text-xs leading-relaxed text-ink-dim">
          <summary className="cursor-pointer py-1 text-sm font-bold">計算の前提を見る</summary>
          {props.note}
        </details>
      )}
    </div>
  );
}

/** 実験室のスライダー */
export function LabSlider(props: {
  label: string;
  /** 押すと説明が出る用語の id */
  term?: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  show: string;
  color: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-3 block first:mt-0">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold">{props.term ? <Term id={props.term}>{props.label}</Term> : props.label}</span>
        <span className="num text-lg font-bold" style={{ color: props.color }}>
          {props.show}
        </span>
      </span>
      {props.hint && <span className="block text-xs text-ink-dim">{props.hint}</span>}
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        style={{ ['--thumb' as string]: props.color }}
      />
    </label>
  );
}

export function Card(props: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-studio-600 bg-studio-900 p-4">
      {props.title && <h3 className="mb-2 text-base font-bold">{props.title}</h3>}
      {props.children}
    </div>
  );
}

/** 映像の横に出す、式の積み上げ(導出の段) */
/** 式の積み上げの札。各行の3つ目は「式と Q&A」の節の id(式の横に「導き方」のリンクを出す) */
export function Steps(props: { title: string; steps: ([string, string] | [string, string, string])[]; note?: string }) {
  return (
    <div className="rounded-xl border border-studio-700 bg-studio-900 px-3 py-2">
      <p className="text-xs font-bold text-ink-dim">{props.title}</p>
      <ol className="mt-1 space-y-1">
        {props.steps.map(([lab, tex, id], i) => (
          <li key={i} className="flex items-center gap-2">
            {lab && <span className="w-20 shrink-0 text-[11px] font-bold leading-tight text-comp">{lab}</span>}
            <FitTex className="flex-1 text-[15px]">{tex}</FitTex>
            {id && <DeriveLink id={id} />}
          </li>
        ))}
      </ol>
      {props.note && <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">{props.note}</p>}
    </div>
  );
}
