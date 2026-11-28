import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { plateState, plateStrength, plateTheory, plateWinter, sigmaEl } from '../physics/plate.ts';
import { BT1, SIGMA_Y, Stage5Show, labR } from '../three/stage5.ts';
import type { Lab5 } from '../three/stage5.ts';
import { Card, LabSlider, Steps, StoryShell, useShow } from '../ui/Story.tsx';
import type { SceneText } from '../ui/Story.tsx';
import { FitTex, Tex } from '../ui/Tex.tsx';


const SCENES: SceneText[] = [
  {
    kicker: '現象',
    head: '柱はまっすぐなのに、板が波打つ',
    body: '薄い板でできた箱形の柱を押すと、柱はまっすぐなのに、板が波打ちます。これが局部座屈。壁を1枚取り出して押すと、ある応力で突然波打つ。その応力が、弾性局部座屈応力 σel です。柱の座屈と同じ順番で見ていきます。',
  },
  {
    kicker: '綱引き',
    head: '押し出す力と、戻す力の綱引き',
    body: '板が少し波打ったとして、真ん中で切ってみます。断面は曲がった柱と同じ形で、ふくらみの高さ w が柱のずれ y にあたります。押す力 σt が w の腕で波を押し出し(オレンジ)、板の曲げにくさ D が戻そうとします(青)。どちらも w に比例するので、比べるのは w の前。σ が板で決まる σel に追いついた所で波打ちます。',
  },
  {
    kicker: '幅と厚み',
    head: '幅が半分なら、4倍の応力まで耐える',
    body: 'σel の式の b は板の幅(紫の寸法)です。幅の狭い板ほど、きつく曲がらないと波打てないので、戻す力が強い。幅が半分なら (t/b)² が4倍で、戻す力も σel も4倍。厚みが2倍でも4倍です。柱の「長さ半分で4倍」と同じ形です。',
  },
  {
    kicker: '支え方',
    head: '支え方の効果は、係数 k に入る',
    body: 'σel の式の k は、縁の支え方で決まる係数です。片側の縁が自由な板は支えが片側だけなので、同じだけ波打っても戻す力が弱く、ずっと低い応力で波打ちます。k は両縁支持の 4 に対して 0.43、約9分の1。柱の有効座屈長 le にあたるのが、板の k です。',
  },
  {
    kicker: 'R の導出',
    head: '物差し R = √(σy/σel)',
    body: `厚みだけが違う板を10枚並べました。横軸は幅厚比パラメータ R = √(σy/σel)。柱の λ と同じ作り方で、R = 1 は σel がちょうど σy になる板です。左ほど厚い板、右ほど薄い板。`,
  },
  {
    kicker: '厚い板',
    head: '厚い板は、波打つ前につぶれる',
    body: '厚い板(R < 1)は、σel が σy より高いので、波打つ前に板全体が降伏します。強さは σy で頭打ち。これが降伏の天井 1.0 です。柱の「短い柱はつぶれる」と同じです。',
  },
  {
    kicker: '薄い板',
    head: '薄い板は、σy より低い応力で波打つ',
    body: '薄い板(R > 1)は、σy に届く前に σel で波打ちます。薄いほど、低い応力で波打つ。柱の「長い柱は曲がって逃げる」と同じです。',
  },
  {
    kicker: 'σel の線',
    head: '厚みが半分なら、σel は4分の1',
    body: 'σel/σy = 1/R²。厚みが半分なら R は2倍、σel は4分の1です。柱のオイラーの線と同じ形の線になります。',
  },
  {
    kicker: '理想の板',
    head: '理想の板の強さは、2本の線の低い方',
    body: '降伏の天井 1.0 と、σel の線 1/R²。理想の板の強さは、その低い方 min(1, 1/R²) です。柱とまったく同じ形です。',
  },
  {
    kicker: '現実の板',
    head: '現実の板: R = 1 付近で下がり、薄い板は余力がある',
    body: '現実の板で押すと、R = 1 の付近では柱と同じく理想より下がります。ところが薄い板は逆で、波打ったあとも理想の線より上まで耐えます(深緑の点)。ここが柱との大きな違いです。理由を次の2つで見ます。',
  },
  {
    kicker: 'なぜ下がる',
    head: '溶接のゆがみと残留応力で、早めに崩れる',
    body: '板は溶接で組み立てるので、中央側には圧縮の残留応力と、わずかな反りが残ります。押すと、もともと押されている中央側が先に限界に近づいて反りがふくらみ、ふくらんだ中央は力を受けにくくなります。増えた力は縁側へ寄り、縁側が降伏した所が限界。だから R = 1 の付近で、理想の線より下がります。',
  },
  {
    kicker: 'なぜ σy まで使えない',
    head: '波打つと、中央が働かず、縁に力が寄る',
    body: '波打つと、ふくらんだ中央は力を受けなくなり、増えた力は縁に寄ります。縁が σy に届いた所が限界。平均すると σy に届かないので、板には「σy × 低減率」までしか認めません(応力の並びは簡単なモデルによる模式図)。',
  },
  {
    kicker: '設計式',
    head: '設計式: R ≦ 0.7 で 1.0、R > 0.7 で 0.5/R²',
    body: '設計の線(青)は、R ≦ 0.7 なら低減なし、それより薄い板は 0.5/R²。これは「波打ち始める応力 σel の半分」です。R = 1 付近の低下を見込み、薄い板の余力は当てにしない、安全側の線と読めます(道路橋示方書・平成24年版までの式)。',
  },
  {
    kicker: '実験室',
    head: '幅・厚み・支え方を変えて、押してみる',
    body: '幅・厚み・支え方を変えると、R が変わり、板が横軸の上を動きます。厚い板はそのまま降伏し、薄い板は波打ってから限界に達します。',
  },
];

const SIDE: Record<number, React.ReactNode> = {
  0: <Steps title="弾性局部座屈応力" steps={[['', String.raw`\sigma_{el}=\dfrac{k\pi^2E}{12(1-\nu^2)}\left(\dfrac{t}{b}\right)^2`, 'd3']]} note="柱の σe にあたる値。" />,
  1: (
    <Steps
      title="綱引き(柱の P × y と EI × 1/R と同じ形)"
      steps={[
        ['押し出す力', String.raw`\sigma t\times w`],
        ['戻す力', String.raw`D\times\dfrac{1}{R}=\dfrac{k\pi^2D}{b^2}\times w`],
        ['くらべる', String.raw`\sigma t\quad\text{と}\quad\dfrac{k\pi^2D}{b^2}`],
        ['t で割る', String.raw`\sigma_{el}=\dfrac{k\pi^2D}{t\,b^2}=\dfrac{k\pi^2E}{12(1-\nu^2)}\left(\dfrac{t}{b}\right)^2`, 'd3'],
      ]}
      note="w = 波の高さ(柱の y)、σt = 幅1あたりの押す力(柱の P)、D = Et³/{12(1−ν²)} = 板の曲げにくさ(柱の EI にあたる)。わずかな波の範囲の話。D と k の出どころは「導き方」で。"
    />
  ),
  2: (
    <Steps
      title="幅と厚みの効き方"
      steps={[
        ['板', String.raw`\sigma_{el}=\dfrac{k\pi^2E}{12(1-\nu^2)}\times\left(\dfrac{t}{b}\right)^2`, 'd3'],
        ['柱では', String.raw`\sigma_e=\pi^2E\times\left(\dfrac{1}{l/r}\right)^2`, 'd2'],
      ]}
      note="(t/b)² の前は、材料と支え方で決まる数。だから σel は (t/b)² に比例する(t/b が2倍なら4倍)。"
    />
  ),
  3: (
    <Steps
      title="支え方と k(長い板)"
      steps={[
        ['両縁 支持', 'k = 4.0'],
        ['両縁 固定', 'k = 6.97'],
        ['一縁 支持・一縁 自由', 'k = 0.425(設計では 0.43)'],
      ]}
      note="柱の有効座屈長にあたる。k が大きいほど強い。"
    />
  ),
  4: (
    <Steps
      title="R の導出(λ と同じ作り方)"
      steps={[
        ['定義', String.raw`R=\sqrt{\dfrac{\sigma_y}{\sigma_{el}}}`],
        ['σel を代入', String.raw`\dfrac{\sigma_y}{\sigma_{el}}=\dfrac{12(1-\nu^2)\,\sigma_y}{k\pi^2E}\left(\dfrac{b}{t}\right)^2`],
        ['平方根', String.raw`R=\dfrac{b}{t}\sqrt{\dfrac{12(1-\nu^2)\,\sigma_y}{k\pi^2E}}`, 'd5'],
        ['柱では', String.raw`\lambda=\dfrac{l}{r}\cdot\dfrac{1}{\pi}\sqrt{\dfrac{\sigma_y}{E}}`],
      ]}
      note="R は幅厚比 b/t に比例する。R = 1 が、降伏と波打ちの分かれ目。"
    />
  ),
  5: (
    <Steps
      title="厚い板(R < 1)"
      steps={[
        ['σel と σy', String.raw`\sigma_{el}>\sigma_y\ \Rightarrow\ \text{波打つ前に降伏}`],
        ['強さ', String.raw`\dfrac{\sigma_{cr}}{\sigma_y}=1.0`],
      ]}
      note="柱の「短い柱はつぶれる」にあたる。"
    />
  ),
  6: (
    <Steps
      title="薄い板(R > 1)"
      steps={[
        ['σel と σy', String.raw`\sigma_{el}<\sigma_y\ \Rightarrow\ \text{降伏の前に波打つ}`],
        ['強さ', String.raw`\dfrac{\sigma_{cr}}{\sigma_y}=\dfrac{\sigma_{el}}{\sigma_y}`],
      ]}
      note="柱の「長い柱は曲がって逃げる」にあたる。"
    />
  ),
  7: (
    <Steps
      title="σel の線"
      steps={[
        ['R の定義から', String.raw`\dfrac{\sigma_{el}}{\sigma_y}=\dfrac{1}{R^2}`, 'd5'],
        ['厚みが半分', String.raw`R\times 2\ \Rightarrow\ \sigma_{el}\times\dfrac{1}{4}`],
        ['柱では', String.raw`\dfrac{\sigma_e}{\sigma_y}=\dfrac{1}{\lambda^2}`],
      ]}
    />
  ),
  8: <Steps title="理想の板\" steps={[['', String.raw`\dfrac{\sigma_{cr}}{\sigma_y}=\min\left(1,\ \dfrac{\sigma_{el}}{\sigma_y}\right)=\min\left(1,\ \dfrac{1}{R^2}\right)`, 'ds-p1']]} />,
  9: <Steps title="現実の板の強さの目安(両縁支持)" steps={[['Winter', String.raw`\dfrac{\sigma_u}{\sigma_y}=\dfrac{R-0.22}{R^2}\quad(R>0.673)`, 'ds-p2']]} note="有効幅の考え方による目安(Eurocode 3 の両縁支持板と同じ形)。" />,
  10: (
    <Steps
      title="初期たわみは、押すと増える(柱と同じ)"
      steps={[
        ['はじめの反り', String.raw`w_0`],
        ['押したとき', String.raw`w=\dfrac{w_0}{1-\sigma/\sigma_{el}}`, 'ds-c3'],
        ['ふくらんだ中央', String.raw`\text{力を受けにくい}\ \to\ \text{縁側へ寄る}`],
        ['縁側が σy', String.raw`\text{限界}\ \approx 0.78\,\sigma_y\quad(R=1)`, 'ds-p2'],
      ]}
      note="中央側は残留応力でもともと押されているので、先に反りがふくらむ。0.78 は Winter の式の R = 1 の値(目安)。"
    />
  ),
  11: (
    <Steps
      title="縁に寄る応力と、有効幅"
      steps={[
        ['有効幅', String.raw`\dfrac{b_{\text{有効}}}{b}=\dfrac{\sigma_{\text{平均}}}{\sigma_{\text{縁}}}`, 'ds-p2'],
        ['縁が σy で限界', String.raw`\dfrac{\sigma_u}{\sigma_y}\approx\dfrac{1}{R}\quad(\text{von Kármán})`],
        ['この板 R = 1.6', String.raw`\dfrac{1}{1.6}=0.63`],
      ]}
      note="映像の応力の並びは、中央を σel で頭打ちにした簡単なモデル(限界の平均は 0.61σy)。"
    />
  ),
  12: (
    <Steps
      title="設計式(道路橋示方書・平成24年版まで)"
      steps={[
        ['R ≦ 0.7', String.raw`\dfrac{\sigma_{cl}}{\sigma_y}=1.0`],
        ['R > 0.7', String.raw`\dfrac{\sigma_{cl}}{\sigma_y}=\dfrac{0.5}{R^2}=0.5\,\dfrac{\sigma_{el}}{\sigma_y}`, 'ds-p3'],
      ]}
      note="0.7 は 0.5/R² が 1.0 になる √0.5 ≒ 0.707 を丸めた値。0.5 は試験・解析と安全余裕から決めた係数(根拠は基準の解説で要確認)。"
    />
  ),
};

const CARD = 'rounded-xl border bg-white/92 px-2.5 py-1.5 shadow-sm backdrop-blur-sm';
const BOX = 'pointer-events-none absolute left-2 top-16 flex w-[44%] max-w-[290px] flex-col gap-1.5 sm:left-4';
/** σel の式(b は紫、k は赤で強調できる) */
const EL = (b = 'b', k = 'k') => String.raw`\sigma_{el}=\dfrac{${k}\,\pi^2E}{12(1-\nu^2)}\left(\dfrac{t}{${b}}\right)^2`;

/** スマホ(狭い画面)では、いちばん新しいカードだけを出す。古いカードに付ける */
const OLD = 'hidden sm:block';

/**
 * 綱引きの場面で映像の左に重ねる式のカード(映像2 の綱引きと同じ筋。柱の P → σt、y → w、EI → D)。
 *  0 w = 波の高さ → 1 押し出す力 = σt × w → 2 戻す力 = D × 1/R → 3 = kπ²D/b² × w → 4 w は両方に同じ
 *  → 5 天秤: σt と kπ²D/b²(t で割ると σ と σel)。傾き・%・状態は毎フレーム ref で書く → 6 超えた
 */
function PlateTugOverlay(props: { phase: number; pRef: RefObject<HTMLSpanElement | null>; beamRef: RefObject<SVGGElement | null>; stateRef: RefObject<HTMLParagraphElement | null> }) {
  const { phase } = props;
  if (phase < 0) return null;
  const cut = phase >= 4;
  const w = cut ? String.raw`\;\textcolor{#e11d48}{\cancel{\textcolor{#1b2740}{\times\, \textcolor{#6d28d9}{w}}}}` : String.raw`\times \textcolor{#6d28d9}{w}`;
  return (
    <div className={BOX}>
      {phase === 0 && (
        <div className={`${CARD} border-violet-300`}>
          <p className="text-[11px] font-bold" style={{ color: '#6d28d9' }}>w = 波の高さ</p>
          <p className="text-[10px] leading-tight text-ink-dim">真ん中で切った断面のふくらみ。柱のずれ y にあたる</p>
        </div>
      )}
      {phase >= 1 && (
        <div className={`${CARD} border-orange-300 ${phase === 1 || phase === 4 ? '' : OLD}`}>
          <p className="text-[11px] font-bold" style={{ color: '#ea580c' }}>押し出す力</p>
          <FitTex className="text-[17px] sm:text-xl">{String.raw`\sigma t ${w}`}</FitTex>
          {phase <= 3 && <p className="text-[10px] leading-tight text-ink-dim">σt = 幅1あたりの押す力(柱の P)。w = 波の高さ(柱の y)</p>}
        </div>
      )}
      {phase >= 2 && (
        <div className={`${CARD} border-sky-300 ${phase <= 4 ? '' : OLD}`}>
          <p className="text-[11px] font-bold" style={{ color: '#0284c7' }}>戻す力</p>
          {phase === 2 ? (
            <>
              <FitTex className="text-[17px] sm:text-xl">{String.raw`D \times \dfrac{1}{R}`}</FitTex>
              <p className="text-[10px] leading-tight text-ink-dim">D = 板の曲げにくさ(柱の EI にあたる)。1/R = 曲がり具合</p>
            </>
          ) : (
            <>
              <FitTex className="text-[17px] sm:text-xl">{String.raw`\dfrac{k\pi^2 D}{b^2} ${w}`}</FitTex>
              {phase === 3 && <p className="text-[10px] leading-tight text-ink-dim">曲がり具合は w に比例(同じ形のまま膨らむ)。k = 縁の支えの効果</p>}
            </>
          )}
        </div>
      )}
      {phase === 4 && <p className="rounded-lg bg-white/90 px-2 py-1 text-[11px] font-bold text-rose-600">w は両方に同じだけ。大小には効かない</p>}
      {phase >= 5 && (
        <div className={`${CARD} border-studio-600`}>
          <p className="text-[11px] font-bold text-ink">重さ比べ(天秤)</p>
          <svg viewBox="0 0 200 96" className="block w-full">
            <path d="M100 46 L88 84 L112 84 Z" fill="#94a3b8" />
            <rect x="76" y="84" width="48" height="6" rx="2" fill="#64748b" />
            <g ref={props.beamRef} style={{ transformOrigin: '100px 46px', transition: 'transform 0.15s linear' }}>
              <rect x="18" y="43" width="164" height="6" rx="3" fill="#475569" />
              {/* 左の皿: 押す側 σt(変えられる) */}
              <line x1="30" y1="49" x2="30" y2="60" stroke="#475569" strokeWidth="1.5" />
              <rect x="8" y="60" width="44" height="22" rx="6" fill="#fff7ed" stroke="#ea580c" strokeWidth="2" />
              <text x="30" y="76" textAnchor="middle" fontSize="15" fontWeight="700" fill="#ea580c">σt</text>
              {/* 右の皿: 板で決まる kπ²D/b²(一定) */}
              <line x1="170" y1="49" x2="170" y2="60" stroke="#475569" strokeWidth="1.5" />
              <rect x="134" y="60" width="64" height="22" rx="6" fill="#f0f9ff" stroke="#0284c7" strokeWidth="2" />
              <text x="166" y="76" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0284c7">kπ²D/b²</text>
            </g>
            <text x="44" y="18" textAnchor="middle" fontSize="10" fill="#9a3412">押す側(変えられる)</text>
            <text x="156" y="18" textAnchor="middle" fontSize="10" fill="#075985">板で決まる(一定)</text>
          </svg>
          <p className="text-[10px] leading-tight text-ink-dim">両方を t で割ると σ と σel = kπ²D/(t b²)</p>
          <p className="mt-0.5 flex items-baseline justify-between text-[11px]">
            <span>
              σ = <span ref={props.pRef} className="num font-bold">50%</span>
            </span>
            <span className="text-ink-dim">σel = 100%</span>
          </p>
          <p ref={props.stateRef} className="mt-0.5 text-[11px] font-bold leading-snug" />
        </div>
      )}
    </div>
  );
}

/** 幅の場面: σel の式の b(紫)= 板の幅 → 幅 b/2 なら4倍 → 厚み2倍でも4倍 */
function WidthOverlay({ phase }: { phase: number }) {
  if (phase < 0) return null;
  const B = String.raw`\textcolor{#6d28d9}{b}`;
  return (
    <div className={BOX}>
      <div className={`${CARD} border-sky-300 ${phase >= 1 ? OLD : ''}`}>
        <p className="text-[11px] font-bold" style={{ color: '#0284c7' }}>板の強さ(戻す力の大きさ)</p>
        <FitTex className="text-[16px] sm:text-lg">{EL(B)}</FitTex>
        <p className="text-[11px] font-bold leading-tight" style={{ color: '#6d28d9' }}>b = 板の幅(紫の寸法)・t = 厚さ</p>
      </div>
      {phase >= 1 && (
        <div className={`${CARD} border-violet-300 ${phase >= 3 ? OLD : ''}`}>
          <p className="text-[11px] font-bold" style={{ color: '#6d28d9' }}>幅が b/2 なら</p>
          <FitTex className="text-[15px] sm:text-lg">{String.raw`\left(\dfrac{t}{\textcolor{#6d28d9}{b/2}}\right)^2=4\left(\dfrac{t}{${B}}\right)^2`}</FitTex>
          <p className="text-[10px] leading-tight text-ink-dim">σel も、戻す力(青)も 4倍</p>
        </div>
      )}
      {phase >= 3 && (
        <div className={`${CARD} border-studio-600`}>
          <p className="text-[11px] font-bold text-ink">厚みが 2t でも 4倍</p>
          <FitTex className="text-[15px] sm:text-lg">{String.raw`\left(\dfrac{2t}{${B}}\right)^2=4\left(\dfrac{t}{${B}}\right)^2`}</FitTex>
          <p className="text-[10px] leading-tight text-ink-dim">柱の「長さ半分で4倍」と同じ形</p>
        </div>
      )}
    </div>
  );
}

/** 支え方の場面: σel の式の k(赤)= 支え方の係数。柱の有効座屈長にあたる */
function KOverlay({ phase }: { phase: number }) {
  if (phase < 0) return null;
  const K = String.raw`\textcolor{#e11d48}{k}`;
  return (
    <div className={BOX}>
      <div className={`${CARD} border-sky-300 ${phase >= 1 ? OLD : ''}`}>
        <p className="text-[11px] font-bold" style={{ color: '#0284c7' }}>板の強さ(戻す力の大きさ)</p>
        <FitTex className="text-[16px] sm:text-lg">{EL('b', K)}</FitTex>
        <p className="text-[11px] font-bold leading-tight" style={{ color: '#e11d48' }}>k = 縁の支え方で決まる係数</p>
      </div>
      {phase >= 1 && (
        <div className={`${CARD} border-rose-300 ${phase >= 2 ? OLD : ''}`}>
          <table className="w-full text-[11px] leading-snug">
            <tbody>
              <tr>
                <td className="pr-1 text-ink-dim">両縁支持(左)</td>
                <td className="whitespace-nowrap text-right font-bold" style={{ color: '#e11d48' }}>k = 4.0</td>
              </tr>
              <tr>
                <td className="pr-1 text-ink-dim">片側の縁が自由(右)</td>
                <td className="whitespace-nowrap text-right font-bold" style={{ color: '#e11d48' }}>k = 0.43</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-0.5 text-[10px] leading-tight text-ink-dim">0.43 ÷ 4 ≒ 1/9。同じ板でも σel と戻す力(青)は約1/9</p>
        </div>
      )}
      {phase >= 2 && (
        <div className={`${CARD} border-studio-600`}>
          <p className="text-[11px] font-bold text-ink">柱の有効座屈長にあたる</p>
          <FitTex className="text-[14px] sm:text-base">{String.raw`\text{柱 } \dfrac{\pi^2EI}{l_e^{\,2}}\ \leftrightarrow\ \text{板 } ${K}`}</FitTex>
        </div>
      )}
    </div>
  );
}

export default function Stage5() {
  const [scene, setScene] = useState(0);
  const [lab, setLab] = useState<Lab5>({ b: 900, t: 12, k: 4, load: 0.3 });
  const [phase, setPhase] = useState(-1);
  const pRef = useRef<HTMLSpanElement>(null);
  const beamRef = useRef<SVGGElement>(null);
  const stateRef = useRef<HTMLParagraphElement>(null);
  const { canvasRef, capRef, show } = useShow(
    (c) => new Stage5Show(c),
    (sh) => {
      const ph = sh.info.phase;
      setPhase((old) => (old === ph ? old : ph));
      const p = sh.info.p;
      if (pRef.current) pRef.current.textContent = `${Math.round(p * 100)}%`;
      // 天秤: σt が kπ²D/b² より軽ければ右(板の側)が下がる。重ければ左が下がる
      if (beamRef.current) beamRef.current.style.transform = `rotate(${(-Math.max(-12, Math.min(12, (p - 1) * 60))).toFixed(2)}deg)`;
      if (stateRef.current) {
        const [txt, col] =
          p < 0.995 ? ['板の側が重い → 波打っても戻る', '#0284c7'] : p < 1.005 ? ['釣り合い = σel', '#6d28d9'] : ['押す側が重い → 戻せない(局部座屈)', '#e11d48'];
        if (stateRef.current.textContent !== txt) {
          stateRef.current.textContent = txt;
          stateRef.current.style.color = col;
        }
      }
    },
  );
  const go = (n: number) => {
    const next = Math.max(0, Math.min(SCENES.length - 1, n));
    setScene(next);
    show.current?.setScene(next);
  };
  const change = (p: Partial<Lab5>) => {
    const next = { ...lab, ...p };
    setLab(next);
    if (show.current) show.current.lab = next;
  };
  const R = labR(lab);
  const free = lab.k < 1;
  const design = plateStrength(R);
  const ps = plateState(lab.load, R);
  const state = free
    ? lab.load >= Math.min(1, plateTheory(R))
      ? R <= 1
        ? '降伏した'
        : '波打った(σel に達した)'
      : '平らなまま耐えている'
    : ps === 'ok'
      ? '設計で認める範囲。板は平らなまま'
      : ps === 'overDesign'
        ? '設計で認める強さは超えた(板はまだ平ら)'
        : ps === 'buckled'
          ? '波打っているが、縁で耐えている'
          : R <= 0.673
            ? '限界。波打つ前に、板全体が降伏した'
            : '限界。縁が降伏した';

  return (
    <StoryShell
      scene={scene}
      total={SCENES.length}
      text={SCENES[scene]}
      onScene={go}
      canvasRef={canvasRef}
      capRef={capRef}
      overlay={
        scene === 1 ? <PlateTugOverlay phase={phase} pRef={pRef} beamRef={beamRef} stateRef={stateRef} /> : scene === 2 ? <WidthOverlay phase={phase} /> : scene === 3 ? <KOverlay phase={phase} /> : undefined
      }
      hint="板の厚みと波の高さは見やすく誇張しています(10枚並べた板の厚みは、どれも本当の 3 倍。厚みの比は正しい)・なぞると回転・2本指で移動と拡大縮小(PC は右ドラッグ・ホイール)"
      side={
        <>
          {SIDE[scene]}
          {((scene >= 5 && scene <= 9) || scene >= 12) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-studio-700 px-3 py-2 text-xs">
              <Chip color="#e11d48" text="降伏の天井 1.0" />
              {scene >= 7 && <Chip color="#6d28d9" text="σel/σy = 1/R²" />}
              {scene >= 8 && <Chip color="#16a34a" text="理想の板" />}
              {scene >= 9 && <Chip color="#0f766e" text="現実の板(目安)" />}
              {scene >= 12 && <Chip color="#0284c7" text="設計式" />}
            </div>
          )}
          {scene === 10 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-studio-700 px-3 py-2 text-xs">
              <Chip color="#0284c7" text="圧縮(残留応力+押す力)" />
              <Chip color="#e11d48" text="降伏(縁側から)" />
              <Chip color="#ea580c" text="引張(溶接した縁の近く)" />
            </div>
          )}
          {scene === 11 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-studio-700 px-3 py-2 text-xs">
              <Chip color="#0284c7" text="幅方向の応力(板の上の柱)" />
              <Chip color="#e11d48" text="σy に届いた所" />
              <Chip color="#6d28d9" text="σel(波打ち始める応力)" />
            </div>
          )}
          {scene <= 3 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-studio-700 px-3 py-2 text-xs">
              <Chip color="#1f2a44" text="外力(押す力)" />
              <Chip color="#64748b" text="反力" />
              <Chip color="#ea580c" text="押し出す力" />
              <Chip color="#0284c7" text="戻す力(回復力)" />
              <Chip color="#16a34a" text="縁の支え" />
            </div>
          )}
        </>
      }
      lab={
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="板と支え方">
            <LabSlider label="板の幅 b" term="bt" value={lab.b} min={200} max={2000} step={50} show={`${lab.b} mm`} color="#6d28d9" onChange={(v) => change({ b: v })} />
            <LabSlider label="板の厚み t" value={lab.t} min={6} max={40} step={1} show={`${lab.t} mm`} color="#0284c7" onChange={(v) => change({ t: v })} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                [4, '両縁支持 k = 4.0'],
                [0.43, '自由突出 k = 0.43'],
              ].map(([k, t]) => (
                <button
                  key={k}
                  onClick={() => change({ k: k as number })}
                  aria-pressed={lab.k === k}
                  className={`h-11 rounded-lg border text-sm font-bold ${lab.k === k ? 'border-gold bg-gold/15 text-gold' : 'border-studio-600 text-ink-dim'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <LabSlider label="押す応力 σ/σy" term="load" value={lab.load} min={0} max={1.05} step={0.01} show={lab.load.toFixed(2)} color="#1f2a44" onChange={(v) => change({ load: v })} />
            </div>
            <p className="mt-1 text-base font-bold text-gold">{state}</p>
          </Card>
          <Card title="この板の数値">
            <dl className="space-y-2 text-sm">
              <Row label="幅厚比 b/t" value={(lab.b / lab.t).toFixed(1)} />
              <Row label={<>弾性局部座屈応力 <Tex>{'\\sigma_{el}'}</Tex></>} value={`${Math.round(sigmaEl(lab.b, lab.t, lab.k))} N/mm²`} />
              <Row label={<>幅厚比パラメータ <Tex>{'R=\\sqrt{\\sigma_y/\\sigma_{el}}'}</Tex></>} value={R.toFixed(2)} big />
              <Row label={<>理想 <Tex>{'\\min(1,1/R^2)'}</Tex></>} value={Math.min(1, plateTheory(R)).toFixed(2)} />
              {!free && <Row label="現実の板の目安(Winter)" value={plateWinter(R).toFixed(2)} />}
              <Row label={<>設計式 <Tex>{'\\sigma_{cl}/\\sigma_y'}</Tex></>} value={design.toFixed(2)} big />
            </dl>
            <p className="mt-2 text-xs leading-relaxed text-ink-dim">
              σy = {SIGMA_Y} N/mm²、E = 2.0×10⁵ N/mm²、ν = 0.3。グラフの赤い点が、いまの板の設計式の値です。{free ? '自由突出板では、現実の板の目安(深緑)は表示していません(別の式になるため)。' : ''}
            </p>
          </Card>
        </div>
      }
      note={`計算の前提: 一様な圧縮を受ける長い板。σel = kπ²E/{12(1−ν²)} × (t/b)²(両縁支持 k = 4、自由突出 k = 0.43)。並べた板は R = 0.3〜2.1(両縁支持・σy = 355 N/mm² で b/t ≒ ${Math.round(BT1 * 0.3)}〜${Math.round(BT1 * 2.1)})。現実の板の点は Winter の有効幅の式(R ≦ 0.673 で 1.0、それより大きいと (R−0.22)/R²)による目安で、実験値ではありません。設計式は道路橋示方書(平成24年版まで)の形(R ≦ 0.7 で 1.0、それより大きいと 0.5/R²)。式どおりだと R = 0.7 のすぐ上で 1.02 になるため、1.0 で頭打ちにして描いています。平成29年版の式は出典で確認できていないため載せていません。板の色は応力の大きさ(波打った後の、縁に偏った分布は模式図)。`}
    />
  );
}

function Chip({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {text}
    </span>
  );
}

function Row({ label, value, big }: { label: React.ReactNode; value: string; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd className={`num font-bold ${big ? 'text-2xl text-gold' : 'text-lg'}`}>{value}</dd>
    </div>
  );
}
