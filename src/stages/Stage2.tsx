import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { SUPPORTS, Stage2Show } from '../three/stage2.ts';
import type { Lab2, Support } from '../three/stage2.ts';
import { Card, LabSlider, Steps, StoryShell, useShow } from '../ui/Story.tsx';
import type { SceneText } from '../ui/Story.tsx';
import { FitTex, Tex } from '../ui/Tex.tsx';

const SIDE2: Record<number, React.ReactNode> = {
  1: (
    <Steps
      title="真ん中の綱引き"
      steps={[
        ['曲げる力', String.raw`P\times y`],
        ['戻す力', String.raw`EI\times\dfrac{1}{R}=\dfrac{\pi^2EI}{l^2}\times y`, 'd1'],
        ['くらべる', String.raw`P\quad\text{と}\quad \dfrac{\pi^2EI}{l^2}`],
        ['座屈荷重', String.raw`P_e=\dfrac{\pi^2EI}{l^2}`, 'd1'],
      ]}
      note="どちらにも y が掛かるので、y では勝負がつかない。式の横の「導き方」で、1/R が y に比例する理由と π の出どころを読めます。"
    />
  ),
  2: <Steps title="長さの効き方" steps={[['座屈荷重', String.raw`P_e=\dfrac{\pi^2EI}{l^2}`, 'd1'], ['長さ2倍なら', String.raw`\dfrac{1}{4}`]]} note="長さの2乗に反比例。3倍なら 1/9。" />,
  3: (
    <Steps
      title="支え方 → 有効座屈長 le"
      steps={[
        ['両端ピン', 'le = 1.0 l', 'd2'],
        ['片方固定・片方ピン', 'le ≒ 0.7 l'],
        ['両端固定', 'le = 0.5 l'],
        ['片持ち', 'le = 2.0 l'],
        ['応力で書くと', String.raw`\sigma_e=\dfrac{\pi^2E}{(l_e/r)^2}`, 'd2'],
      ]}
      note="σe = Pe ÷ 断面積。r = √(I/A) は断面二次半径。"
    />
  ),
};

/**
 * 支え方の場面で映像の左側に重ねる式のカード。l(紫)は柱の長さ、実際は支え方の係数を掛けた le(赤)で評価する。
 *  0 両端ピンで導いた π²EI/l² → 1 実際は l の代わりに le = K × l → 2 Pe = π²EI/le² と K の表
 */
function LeOverlay({ phase }: { phase: number }) {
  if (phase < 0) return null;
  const card = 'rounded-xl border bg-white/92 px-2.5 py-1.5 shadow-sm backdrop-blur-sm';
  const L = String.raw`\textcolor{#6d28d9}{l}`;
  const LE = String.raw`\textcolor{#e11d48}{l_e}`;
  const rows: [string, string][] = [
    ['片持ち', '2.0'],
    ['両端ピン', '1.0'],
    ['片方固定・片方ピン', '0.7'],
    ['両端固定', '0.5'],
  ];
  return (
    <div className="pointer-events-none absolute left-2 top-16 flex w-[42%] max-w-[270px] flex-col gap-1.5 sm:left-4">
      <div className={`${card} border-sky-300 ${phase >= 2 ? 'hidden sm:block' : ''}`}>
        <p className="text-[11px] font-bold" style={{ color: '#0284c7' }}>
          戻す力<span className="font-normal text-ink-dim">(両端ピンで導いた式)</span>
        </p>
        <FitTex className="text-[16px] sm:text-xl">{String.raw`\dfrac{\pi^2EI}{${L}^{\,2}} \times y`}</FitTex>
        <p className="text-[11px] font-bold leading-tight" style={{ color: '#6d28d9' }}>l = 柱の長さ(紫の寸法)</p>
      </div>
      {phase >= 1 && (
        <div className={`${card} border-rose-300 ${phase >= 2 ? 'hidden sm:block' : ''}`}>
          <p className="text-[11px] font-bold" style={{ color: '#e11d48' }}>実際は、l の代わりに有効座屈長 le</p>
          <FitTex className="text-[16px] sm:text-xl">{String.raw`${LE} = K \times ${L}`}</FitTex>
          <p className="text-[10px] leading-tight text-ink-dim">le = 曲がった形のサインカーブ半分の長さ(赤い線)。K は端の固定のしかたで決まる係数(有効座屈長係数)</p>
        </div>
      )}
      {phase >= 2 && (
        <div className={`${card} border-studio-600`}>
          <FitTex className="text-[16px] sm:text-xl">{String.raw`P_e=\dfrac{\pi^2EI}{${LE}^{\,2}}`}</FitTex>
          <FitTex className="text-[14px] sm:hidden">{String.raw`${LE} = K \times ${L}`}</FitTex>
          <table className="mt-0.5 w-full text-[10.5px] leading-snug">
            <tbody>
              {rows.map(([n, k]) => (
                <tr key={n}>
                  <td className="pr-1 text-ink-dim">{n}</td>
                  <td className="whitespace-nowrap text-right font-bold" style={{ color: '#e11d48' }}>
                    K = {k}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] leading-tight text-ink-dim">le が半分なら Pe は4倍(両端固定)</p>
        </div>
      )}
    </div>
  );
}

/**
 * 長さの場面で映像の左側に重ねる式のカード。分母の l(紫)が、図の紫の寸法線 = 柱の長さだと示す。
 *  0 戻す力 = π²EI/l² × y と「l = 柱の長さ」→ 1 長さ 2l なら 1/4 → 2 座屈荷重も 1/4
 */
function LenOverlay({ phase }: { phase: number }) {
  if (phase < 0) return null;
  const card = 'rounded-xl border bg-white/92 px-2.5 py-1.5 shadow-sm backdrop-blur-sm';
  const L = String.raw`\textcolor{#6d28d9}{l}`;
  return (
    <div className="pointer-events-none absolute left-2 top-16 flex w-[47%] max-w-[300px] flex-col gap-1.5 sm:left-4">
      <div className={`${card} border-sky-300`}>
        <p className="text-[11px] font-bold" style={{ color: '#0284c7' }}>
          戻す力<span className="font-normal text-ink-dim">(映像2 の綱引き)</span>
        </p>
        <FitTex className="text-[17px] sm:text-xl">{String.raw`\dfrac{\pi^2EI}{${L}^{\,2}} \times y`}</FitTex>
        <p className="mt-0.5 text-[11px] font-bold leading-tight" style={{ color: '#6d28d9' }}>
          l = 柱の長さ(図の紫の寸法)
        </p>
      </div>
      {phase >= 1 && (
        <div className={`${card} border-violet-300 ${phase >= 2 ? 'hidden sm:block' : ''}`}>
          <p className="text-[11px] font-bold" style={{ color: '#6d28d9' }}>長さが 2l なら</p>
          <FitTex className="text-[15px] sm:text-lg">{String.raw`\dfrac{\pi^2EI}{(\textcolor{#6d28d9}{2l})^2}=\dfrac{1}{4}\times\dfrac{\pi^2EI}{${L}^{\,2}}`}</FitTex>
          <p className="text-[10px] leading-tight text-ink-dim">l² が4倍になるので、戻す力は 1/4</p>
        </div>
      )}
      {phase >= 2 && (
        <div className={`${card} border-studio-600`}>
          <p className="text-[11px] font-bold text-ink">座屈荷重も 1/4</p>
          <FitTex className="text-[15px] sm:text-lg">{String.raw`P_e=\dfrac{\pi^2EI}{${L}^{\,2}}`}</FitTex>
        </div>
      )}
    </div>
  );
}

/**
 * 綱引きの場面で映像の左側に重ねる「式のカード」と「天秤」。段階(phase)は Stage2Show.tugInfo から読む。
 *  1 曲げる力 = P × y → 2 戻す力 = EI × 1/R → 3 1/R = (π/l)² × y → 4 戻す力 = π²EI/l² × y
 *  → 5 両方の × y を消す → 6 天秤: P と π²EI/l²(傾きと % は毎フレーム ref で書く)
 */
function TugOverlay(props: { phase: number; beamRef: RefObject<SVGGElement | null>; pRef: RefObject<HTMLSpanElement | null>; stateRef: RefObject<HTMLParagraphElement | null> }) {
  const { phase } = props;
  if (phase < 1) return null;
  const card = 'rounded-xl border bg-white/92 px-2.5 py-1.5 shadow-sm backdrop-blur-sm';
  const cut = phase >= 5;
  const yOut = cut ? String.raw`\;\textcolor{#e11d48}{\cancel{\textcolor{#1b2740}{\times\, y}}}` : String.raw`\times y`;
  return (
    <div className="pointer-events-none absolute left-2 top-16 flex w-[47%] max-w-[300px] flex-col gap-1.5 sm:left-4">
      <div className={`${card} border-orange-300 ${phase >= 6 ? 'hidden sm:block' : ''}`}>
        <p className="text-[11px] font-bold" style={{ color: '#ea580c' }}>曲げる力</p>
        <FitTex className="text-[17px] sm:text-xl">{String.raw`P ${yOut}`}</FitTex>
      </div>
      {phase >= 2 && (
        <div className={`${card} border-sky-300 ${phase >= 6 ? 'hidden sm:block' : ''}`}>
          <p className="text-[11px] font-bold" style={{ color: '#0284c7' }}>
            戻す力{phase === 2 && <span className="font-normal text-ink-dim">(映像1 の式)</span>}
          </p>
          {phase <= 3 ? (
            <FitTex className="text-[17px] sm:text-xl">{String.raw`EI \times \dfrac{1}{R}`}</FitTex>
          ) : (
            <FitTex className="text-[17px] sm:text-xl">{String.raw`\dfrac{\pi^2EI}{l^2} ${yOut}`}</FitTex>
          )}
          {phase === 3 && (
            <div className="mt-1 border-t border-studio-700 pt-1">
              <FitTex className="text-[15px]">{String.raw`\dfrac{1}{R} = \left(\dfrac{\pi}{l}\right)^2 \times y`}</FitTex>
              <p className="text-[10px] leading-tight text-ink-dim">曲がり具合は ずれ y に比例(同じ形のまま膨らむ)</p>
            </div>
          )}
        </div>
      )}
      {phase === 5 && <p className="rounded-lg bg-white/90 px-2 py-1 text-[11px] font-bold leading-snug text-ink">y は両方に同じだけ。大小には効かない</p>}
      {phase >= 6 && (
        <div className={`${card} border-studio-600`}>
          <p className="text-[11px] font-bold text-ink">重さ比べ(天秤)</p>
          <svg viewBox="0 0 200 104" className="block w-full">
            {/* 支点 */}
            <path d="M100 52 L88 92 L112 92 Z" fill="#94a3b8" />
            <rect x="76" y="92" width="48" height="6" rx="2" fill="#64748b" />
            <g ref={props.beamRef} style={{ transformOrigin: '100px 52px', transition: 'transform 0.15s linear' }}>
              <rect x="18" y="49" width="164" height="6" rx="3" fill="#475569" />
              {/* 左の皿: 押す力 P(外力・変えられる) */}
              <line x1="30" y1="55" x2="30" y2="68" stroke="#475569" strokeWidth="1.5" />
              <rect x="8" y="68" width="44" height="22" rx="6" fill="#fff7ed" stroke="#ea580c" strokeWidth="2" />
              <text x="30" y="84" textAnchor="middle" fontSize="16" fontWeight="700" fill="#ea580c">P</text>
              {/* 右の皿: 柱で決まる π²EI/l²(一定) */}
              <line x1="170" y1="55" x2="170" y2="68" stroke="#475569" strokeWidth="1.5" />
              <rect x="138" y="68" width="60" height="22" rx="6" fill="#f0f9ff" stroke="#0284c7" strokeWidth="2" />
              <text x="168" y="84" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0284c7">π²EI/l²</text>
            </g>
            <text x="48" y="22" textAnchor="middle" fontSize="10" fill="#9a3412">押す力(変えられる)</text>
            <text x="152" y="22" textAnchor="middle" fontSize="10" fill="#075985">柱で決まる(一定)</text>
          </svg>
          <p className="flex items-baseline justify-between text-[11px]">
            <span>
              P = <span ref={props.pRef} className="num font-bold">50%</span>
            </span>
            <span className="text-ink-dim">π²EI/l² = 100%</span>
          </p>
          <p ref={props.stateRef} className="mt-0.5 text-[11px] font-bold leading-snug" />
        </div>
      )}
    </div>
  );
}

const SCENES: SceneText[] = [
  {
    kicker: '現象',
    head: '細い棒は、ある力で突然曲がる',
    body: '細い棒を上から押すと、しばらくはまっすぐ耐えます。ところが、ある力に達した瞬間、突然横へ曲がる。これが座屈。その力を「座屈荷重」と呼びます。',
  },
  {
    kicker: '綱引き',
    head: '曲げる力と、戻す力の綱引き',
    body: '柱がもし少し曲がったら(ずれ y)。曲げる力は P × y、戻す力は EI × 1/R です。曲がり具合 1/R は y に比例するので、戻す力は π²EI/l² × y。どちらにも × y が付くので、y は勝負に効きません。残るのは、押す力 P と柱で決まる π²EI/l² の重さ比べ。P が追いついた所が座屈荷重です。',
  },
  {
    kicker: '長さ',
    head: '長さが2倍なら、座屈する力は4分の1',
    body: '綱引きで出した戻す力 π²EI/l² の l は、柱の長さ(図の紫の寸法)です。長さが2倍なら l² は4倍で、戻す力は4分の1。だから座屈荷重も4分の1、3倍なら9分の1です。',
  },
  {
    kicker: '支え方',
    head: '支え方で、強さは16倍も変わる',
    body: '綱引きの式 π²EI/l² は、両端ピンの柱で導いたものです。端を固定すると曲がる形が変わり、サインカーブ半分の長さ(赤い線)が変わります。これが有効座屈長 le = K × l で、実際は式の l の代わりに le を使います。両端ピンに比べて、両端固定(le = 0.5 l)は4倍、片持ち(le = 2 l)は4分の1です。',
  },
  {
    kicker: '実験室',
    head: '支え方と長さを変えて、押してみる',
    body: '支え方と長さを選び、押す力を 100% まで上げると座屈します。短い柱では、先に材料が降伏してオイラーの式は使えません。その先は映像3・4 で。',
  },
];

// H-300×300×10×16、弱軸まわり
const E = 200000;
const I = (2 * 16 * 300 ** 3 + 268 * 10 ** 3) / 12;
const PY = (355 * (2 * 300 * 16 + 268 * 10)) / 1000; // kN

export default function Stage2() {
  const [scene, setScene] = useState(0);
  const [lab, setLab] = useState<Lab2>({ sup: 'pp', L: 8, load: 0.5, yieldFirst: false });
  // 綱引きの場面: 段階が変わったら式のカードを描き直し、天秤の傾き・% は毎フレーム直接書く
  const [phase, setPhase] = useState(-1);
  const [lenPhase, setLenPhase] = useState(-1);
  const beamRef = useRef<SVGGElement>(null);
  const pRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<HTMLParagraphElement>(null);
  const { canvasRef, capRef, show } = useShow(
    (c) => new Stage2Show(c),
    (sh) => {
      const { phase: ph, p } = sh.tugInfo;
      setPhase((old) => (old === ph ? old : ph));
      const lp = sh.lenInfo.phase;
      setLenPhase((old) => (old === lp ? old : lp));
      if (ph >= 6) {
        // P が π²EI/l² より軽ければ右(戻す側)が下がる。重ければ左(P)が下がる
        const a = -Math.max(-12, Math.min(12, (p - 1) * 60));
        if (beamRef.current) beamRef.current.style.transform = `rotate(${a.toFixed(2)}deg)`;
        if (pRef.current) pRef.current.textContent = `${Math.round(p * 100)}%`;
        if (stateRef.current) {
          const [txt, col] =
            p < 0.995 ? ['戻す方が重い → 曲がっても戻る', '#0284c7'] : p < 1.005 ? ['釣り合い = 座屈荷重', '#6d28d9'] : ['曲げる方が重い → 戻せない(座屈)', '#e11d48'];
          if (stateRef.current.textContent !== txt) {
            stateRef.current.textContent = txt;
            stateRef.current.style.color = col;
          }
        }
      }
    },
  );
  const go = (n: number) => {
    const next = Math.max(0, Math.min(SCENES.length - 1, n));
    setScene(next);
    show.current?.setScene(next);
  };
  const peOf = (sup: Support, L: number) => (Math.PI ** 2 * E * I) / (SUPPORTS[sup].le * L * 1000) ** 2 / 1000; // kN
  const change = (p: Partial<Lab2>) => {
    const next = { ...lab, ...p };
    next.yieldFirst = peOf(next.sup, next.L) > PY;
    setLab(next);
    if (show.current) show.current.lab = next;
  };
  const info = SUPPORTS[lab.sup];
  const le = info.le * lab.L;
  const pe = peOf(lab.sup, lab.L);
  const cap = Math.min(pe, PY); // 理想の柱が耐えられる上限

  return (
    <StoryShell
      scene={scene}
      total={SCENES.length}
      text={SCENES[scene]}
      onScene={go}
      canvasRef={canvasRef}
      capRef={capRef}
      overlay={
        scene === 1 ? <TugOverlay phase={phase} beamRef={beamRef} pRef={pRef} stateRef={stateRef} /> : scene === 2 ? <LenOverlay phase={lenPhase} /> : scene === 3 ? <LeOverlay phase={lenPhase} /> : undefined
      }
      hint="曲がり方は見やすく誇張しています・なぞると回転・2本指で移動と拡大縮小(PC は右ドラッグ・ホイール)"
      side={
        <>
          {SIDE2[scene]}
          {scene <= 3 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-studio-700 px-3 py-2 text-xs">
              <Chip2 color="#1f2a44" text="外力(押す力 P)" />
              <Chip2 color="#64748b" text="反力" />
              {scene >= 1 && <Chip2 color="#ea580c" text="曲げる力 P × y" />}
              {scene >= 1 && <Chip2 color="#0284c7" text="戻す力 EI × 1/R" />}
            </div>
          )}
        </>
      }
      lab={
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="支え方と長さ">
            <div className="grid grid-cols-2 gap-2">
              {(['cf', 'pp', 'fp', 'ff'] as Support[]).map((k) => (
                <button
                  key={k}
                  onClick={() => change({ sup: k })}
                  aria-pressed={lab.sup === k}
                  className={`rounded-lg border px-2 py-2 text-sm font-bold ${
                    lab.sup === k ? 'border-comp bg-studio-700' : 'border-studio-600 text-ink-dim'
                  }`}
                >
                  {SUPPORTS[k].name}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <LabSlider label="柱の長さ L" value={lab.L} min={4} max={16} step={0.5} show={`${lab.L.toFixed(1)} m`} color="#6d28d9" onChange={(v) => change({ L: v })} />
              <LabSlider
                label="押す力"
                term="pe"
                hint={lab.yieldFirst ? '降伏荷重に対する割合(この長さでは降伏が上限)' : '座屈荷重に対する割合。100% で座屈'}
                value={lab.load}
                min={0}
                max={1.2}
                step={0.01}
                show={`${Math.round(lab.load * 100)}%(${Math.round(cap * Math.min(lab.load, 1.2)).toLocaleString()} kN)`}
                color="#0284c7"
                onChange={(v) => change({ load: v })}
              />
            </div>
          </Card>
          <Card title="この柱の座屈荷重">
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between">
                <dt>
                  有効座屈長 <Tex>{'l_e'}</Tex>(サインカーブ半分の長さ)
                </dt>
                <dd className="num text-lg font-bold">
                  {info.le.toFixed(info.le === 1 || info.le === 2 ? 1 : 2)} L = {le.toFixed(2)} m
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt>両端ピンに比べた強さ</dt>
                <dd className="num text-2xl font-bold text-gold">{info.gain.toFixed(2)} 倍</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt>
                  座屈荷重 <Tex>{String.raw`P_e=\pi^2EI/l_e^2`}</Tex>
                </dt>
                <dd className="num text-lg font-bold">{Math.round(pe).toLocaleString()} kN</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt>降伏荷重(材料の限界)</dt>
                <dd className="num text-lg font-bold">{Math.round(PY).toLocaleString()} kN</dd>
              </div>
            </dl>
            <p className={`mt-2 text-sm font-bold ${pe > PY ? 'text-yield' : 'text-ideal'}`} style={{ color: pe > PY ? undefined : '#16a34a' }}>
              {pe > PY
                ? `オイラーの式が使えない長さです。計算上の座屈荷重は降伏荷重を超えますが、理想の柱でも降伏荷重 ${Math.round(PY).toLocaleString()} kN が上限。現実の柱は、さらに手前で座屈します(映像3・4)。`
                : '座屈荷重が降伏荷重より小さいので、理想の柱の強さは座屈で決まります。現実の柱は、これより少し手前で座屈します(映像3・4)。'}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-dim">
              断面は H-300×300×10×16(弱軸まわり、I = {(I / 1e4).toLocaleString(undefined, { maximumFractionDigits: 0 })} cm⁴)、E = 2.0×10⁵ N/mm²、σy = 355 N/mm²。
              ここでの座屈荷重は、傷のない理想の柱の値です。
            </p>
          </Card>
        </div>
      }
      note="支え方ごとの強さ: 片持ち 1/4 倍、両端ピン 1 倍、片方固定・片方ピン 2.05 倍(有効座屈長 0.699L)、両端固定 4 倍。座屈の形は、片持ち 1−cos(πx/2L)、両端ピン sin(πx/L)、両端固定 (1−cos(2πx/L))/2、片方固定・片方ピンは tan(kL)=kL の解(kL=4.493)から。"
    />
  );
}

function Chip2({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {text}
    </span>
  );
}
