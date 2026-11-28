import { useState } from 'react';
import Axes from '../doc/Axes.tsx';
import Calc from '../doc/Calc.tsx';
import Derive from '../doc/Derive.tsx';
import Design from '../doc/Design.tsx';
import Overview from '../doc/Overview.tsx';
import QandA from '../doc/QandA.tsx';
import Symbols from '../doc/Symbols.tsx';

/** 章。順に読むと「手順 → 理論式 → 設計式への落とし込み → 質問 → 計算」になる */
const TABS: { name: string; sub: string }[] = [
  { name: '3つの照査', sub: '手順と式' },
  { name: '式の導出', sub: '理論式はどこから' },
  { name: '強軸と弱軸', sub: 'H形鋼の向き' },
  { name: '理論から設計式へ', sub: '理想 → 現実 → 設計' },
  { name: '質問と回答', sub: 'Q1〜Q11' },
  { name: '計算してみる', sub: '数字で確かめる' },
  { name: '記号', sub: '一覧' },
];

export default function Formulas({ onStage, initial }: { onStage: (n: number) => void; initial?: string }) {
  const [tab, setTab] = useState(TABS.some((t) => t.name === initial) ? initial! : TABS[0].name);
  const go = (t: string) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };
  const idx = TABS.findIndex((t) => t.name === tab);
  return (
    <div className="mx-auto mt-1 max-w-4xl">
      <div className="sticky top-0 z-20 -mx-3 border-b border-studio-600 bg-studio-950/95 px-3 py-2 backdrop-blur">
        <div className="flex gap-1.5 overflow-x-auto">
          {TABS.map((t, i) => (
            <button
              key={t.name}
              onClick={() => go(t.name)}
              aria-current={tab === t.name ? 'page' : undefined}
              className={`shrink-0 rounded-xl border px-3 py-1.5 text-left ${tab === t.name ? 'border-comp bg-comp text-white' : 'border-studio-600 bg-studio-900 text-ink'}`}
            >
              <span className="block text-[14px] font-bold leading-tight">
                <span className="num mr-1 text-[11px] opacity-70">{i + 1}</span>
                {t.name}
              </span>
              <span className="block text-[10px] leading-tight opacity-75">{t.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === '3つの照査' && <Overview go={go} onStage={onStage} />}
      {tab === '式の導出' && <Derive go={go} onStage={onStage} />}
      {tab === '強軸と弱軸' && <Axes onStage={onStage} />}
      {tab === '理論から設計式へ' && <Design go={go} onStage={onStage} />}
      {tab === '質問と回答' && <QandA go={go} onStage={onStage} />}
      {tab === '計算してみる' && <Calc />}
      {tab === '記号' && <Symbols />}

      <div className="mt-10 flex items-center justify-between gap-2 border-t border-studio-600 pt-4">
        {idx > 0 ? (
          <button onClick={() => go(TABS[idx - 1].name)} className="rounded-xl border border-studio-600 bg-studio-900 px-4 py-3 text-left text-sm">
            <span className="block text-xs text-ink-dim">◀ 前の章</span>
            <span className="font-bold">{TABS[idx - 1].name}</span>
          </button>
        ) : (
          <span />
        )}
        {idx < TABS.length - 1 && (
          <button onClick={() => go(TABS[idx + 1].name)} className="rounded-xl bg-comp px-4 py-3 text-right text-sm text-white">
            <span className="block text-xs opacity-80">次の章 ▶</span>
            <span className="font-bold">{TABS[idx + 1].name}</span>
          </button>
        )}
      </div>
      <p className="mt-6 px-1 text-xs leading-relaxed text-ink-dim">
        このページの式は、道路橋示方書(鋼橋。平成24年版まで)の流儀で書かれた、許容応力度の形の照査式です(局部座屈 R ≦ 0.7 で 1.0・それより大きいと 0.5/R²、全体座屈は λ の区分式、複合座屈は使用割合の和)。実際の設計では、採用する基準の版と条文を必ず確認してください。数値例はすべて説明用の仮定値です。
      </p>
    </div>
  );
}
