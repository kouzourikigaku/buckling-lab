import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Formulas from './stages/Formulas.tsx';
import Stage1 from './stages/Stage1.tsx';
import Stage2 from './stages/Stage2.tsx';
import Stage3 from './stages/Stage3.tsx';
import Stage4 from './stages/Stage4.tsx';
import Stage5 from './stages/Stage5.tsx';
import Stage6 from './stages/Stage6.tsx';

const STAGES = [
  { no: 1, title: '曲げとテコ', sub: 'なぜ H形なのか' },
  { no: 2, title: 'オイラー座屈', sub: '全体座屈の式' },
  { no: 3, title: '理想と現実', sub: '理論より早い理由' },
  { no: 4, title: '設計曲線', sub: 'λ と設計式' },
  { no: 5, title: '板の座屈', sub: '局部座屈の式と R' },
  { no: 6, title: '座屈の照査', sub: '軸力・曲げ・安全率' },
];

const KEY = 'buckling-lab-progress';
function loadBest(): Record<number, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function saveBest(v: Record<number, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* 保存できなくても動く */
  }
}
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function App() {
  // メインは映像。「式と Q&A」は補足として開き、閉じると映像の同じ場面・同じ位置へ戻る
  const [view, setView] = useState<'movie' | 'doc'>('movie');
  const [stage, setStage] = useState(1);
  const [tab, setTab] = useState({ name: '3つの照査', n: 0 });
  const [cur, setCur] = useState({ scene: 0, total: 1 });
  const [best, setBest] = useState<Record<number, number>>(loadBest);
  const scroll = useRef({ movie: 0, doc: 0 });
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const viewRef = useRef(view);
  viewRef.current = view;

  const openStage = (n: number) => {
    if (viewRef.current === 'doc') scroll.current.doc = window.scrollY;
    const same = n === stageRef.current;
    setView('movie');
    setStage(n);
    const y = same && viewRef.current === 'doc' ? scroll.current.movie : 0;
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  };
  const openDoc = (tabName?: string, id?: string) => {
    if (viewRef.current === 'movie') scroll.current.movie = window.scrollY;
    if (tabName) setTab((t) => ({ name: tabName, n: t.n + 1 }));
    setView('doc');
    const y = tabName ? 0 : scroll.current.doc;
    requestAnimationFrame(() => window.scrollTo({ top: y }));
    // 節を指定されたら、描き終わってからその節へ
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 120);
  };
  const back = () => openStage(stageRef.current);

  // 映像のページから「式と Q&A」の指定のタブを開く
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ tab: string; id?: string }>).detail;
      openDoc(d.tab, d.id);
    };
    window.addEventListener('open-formulas', on);
    return () => window.removeEventListener('open-formulas', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 映像の場面が進んだら、進み具合を記録する(映像ごとに、いちばん先まで見た割合)。
  // 子の useEffect より先に受け取りを始めるため useLayoutEffect
  useLayoutEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ scene: number; total: number }>).detail;
      setCur(d);
      const f = (d.scene + 1) / d.total;
      setBest((b) => {
        const k = stageRef.current;
        if ((b[k] ?? 0) >= f) return b;
        const next = { ...b, [k]: f };
        saveBest(next);
        return next;
      });
    };
    window.addEventListener('scene-change', on);
    return () => window.removeEventListener('scene-change', on);
  }, []);

  const movie = view === 'movie';
  const all = STAGES.reduce((a, s) => a + (best[s.no] ?? 0), 0) / STAGES.length;
  const st = STAGES[stage - 1];
  return (
    <div className="mx-auto max-w-7xl px-3 pb-12 sm:px-4">
      <header className="pt-3 pb-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="whitespace-nowrap text-lg font-bold tracking-wide sm:text-xl">座屈ラボ</h1>
          <button
            onClick={() => openStage(stage)}
            aria-current={movie ? 'page' : undefined}
            className={`rounded-xl border-2 px-4 py-1.5 text-left transition-colors ${movie ? 'border-comp bg-comp text-white' : 'border-comp bg-studio-900 text-comp'}`}
          >
            <span className="block text-[15px] font-bold leading-tight">映像で学ぶ</span>
            <span className="block text-[11px] leading-tight opacity-80">6本・全体 {pct(all)}</span>
          </button>
          <button
            onClick={() => (movie ? openDoc() : undefined)}
            aria-current={!movie ? 'page' : undefined}
            className={`rounded-lg border px-3 py-1.5 text-left text-ink transition-colors ${!movie ? 'border-ink bg-studio-800' : 'border-studio-600 bg-studio-900'}`}
          >
            <span className="block text-[13px] font-bold leading-tight">式と Q&amp;A</span>
            <span className="block text-[10px] leading-tight opacity-70">補足</span>
          </button>
        </div>
        {movie && (
          <nav className="mt-2 -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1" aria-label="映像">
            {STAGES.map((s) => {
              const on = s.no === stage;
              const b = best[s.no] ?? 0;
              return (
                <button
                  key={s.no}
                  onClick={() => openStage(s.no)}
                  aria-current={on ? 'page' : undefined}
                  className={`shrink-0 rounded-lg border px-3 pt-1.5 pb-1 text-left transition-colors ${
                    on ? 'border-comp bg-studio-700 text-ink' : 'border-studio-600 bg-studio-900 text-ink-dim hover:border-ink-dim'
                  }`}
                >
                  <span className="block text-[15px] font-bold leading-tight">
                    <span className="mr-1 text-xs opacity-60">{s.no}</span>
                    {s.title}
                  </span>
                  <span className="block text-[11px] leading-tight opacity-70">{s.sub}</span>
                  <span className="mt-1 flex items-center gap-1.5" aria-label={`見た割合 ${pct(b)}`}>
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-studio-600">
                      <span className="block h-full rounded-full bg-comp" style={{ width: pct(b) }} />
                    </span>
                    <span className="num text-[10px] leading-none">{b >= 1 ? '✓' : pct(b)}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        )}
      </header>
      <div hidden={!movie}>
        {stage === 1 ? (
          <Stage1 />
        ) : stage === 2 ? (
          <Stage2 />
        ) : stage === 3 ? (
          <Stage3 />
        ) : stage === 4 ? (
          <Stage4 />
        ) : stage === 5 ? (
          <Stage5 />
        ) : (
          <Stage6 />
        )}
      </div>
      <div hidden={movie} className="pb-20">
        <Formulas key={tab.n} initial={tab.name} onStage={openStage} />
      </div>
      {!movie && (
        <button
          onClick={back}
          className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-comp px-4 py-2.5 text-left text-white shadow-lg shadow-black/20"
        >
          <span className="text-lg font-bold">◀</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold leading-tight">映像に戻る</span>
            <span className="block truncate text-[11px] leading-tight opacity-90">
              映像{stage}「{st.title}」 場面 {cur.scene + 1} / {cur.total} の続きから
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
