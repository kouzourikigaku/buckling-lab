import { useMemo, useState } from 'react';
import { solveColumn } from '../physics/column.ts';
import { idealCurve } from '../physics/curves.ts';
import { CURVES, S4_AMP, S4_FAT, Stage4Show } from '../three/stage4.ts';
import type { CurveKey } from '../three/stage4.ts';
import { Card, DeriveLink, LabSlider, Steps, StoryShell, useShow } from '../ui/Story.tsx';
import type { SceneText } from '../ui/Story.tsx';
import { FitTex } from '../ui/Tex.tsx';
import { Rich } from '../ui/glossary.tsx';

const pct = (x: number) => `${Math.round(x * 100)}%`;

const SIDE4: Record<number, React.ReactNode> = {
  3: (
    <Steps
      title="オイラーの線を σy で割る"
      steps={[
        ['オイラー座屈応力', String.raw`\sigma_e=\dfrac{\pi^2E}{(l/r)^2}`, 'd2'],
        ['σy で割る', String.raw`\dfrac{\sigma_e}{\sigma_y}=\dfrac{1}{\lambda^2}\quad(\lambda\text{ は次の場面で})`],
      ]}
    />
  ),
  4: (
    <Steps
      title="λ の導出"
      steps={[
        ['定義', String.raw`\lambda=\sqrt{\dfrac{\sigma_y}{\sigma_e}}`, 'd4'],
        ['σe を代入', String.raw`\dfrac{\sigma_y}{\sigma_e}=\dfrac{\sigma_y\,(l/r)^2}{\pi^2E}`],
        ['平方根', String.raw`\lambda=\dfrac{1}{\pi}\sqrt{\dfrac{\sigma_y}{E}}\cdot\dfrac{l}{r}`],
        ['理想の柱', String.raw`\dfrac{\sigma_{cr}}{\sigma_y}=\min\left(1,\ \dfrac{1}{\lambda^2}\right)`, 'ds-c2'],
      ]}
      note="λ は細長比 l/r に比例する。λ = 1 が、降伏と座屈の分かれ目。"
    />
  ),
  6: (
    <Steps
      title="設計曲線(道路橋示方書・平成24年版まで)"
      steps={[
        ['λ ≦ 0.2', String.raw`\sigma_{cg}/\sigma_y=1.0`, 'ds-c5'],
        ['0.2 < λ ≦ 1.0', String.raw`1.109-0.545\lambda`],
        ['1.0 < λ', String.raw`1/(0.773+\lambda^2)`],
      ]}
    />
  ),
};

const SCENES: SceneText[] = [
  {
    kicker: '実験',
    head: '長さだけが違う柱を、10本並べる',
    body: '同じ H形鋼を、短いものから長いものまで10本並べました。強さは長さでどう変わるのか。奥の壁が、結果を書き込むグラフです。',
  },
  {
    kicker: 'ずんぐり',
    head: '短い柱は、つぶれる',
    body: '短い柱は曲がりません。断面全体が同時に降伏します。強さは材料の強さそのもの、グラフの 100% です。',
  },
  {
    kicker: 'ひょろ長',
    head: '長い柱は、曲がって逃げる',
    body: '長い柱は、材料の強さの4分の1で横へ曲がります。どこも降伏していないので、力を抜けば元に戻る。壊れたのではなく、形として踏ん張れなくなったのです。',
  },
  {
    kicker: 'オイラーの線',
    head: '長さが2倍なら、強さは4分の1',
    body: '長い柱の点は、オイラーの線 σe = π²E/(l/r)² に乗ります。長さ2倍で強さは4分の1。ただしこの線は、短い柱の側で空高く伸びていきます。',
  },
  {
    kicker: '天井',
    head: '理想の柱の強さは、2本の線の低い方',
    body: '材料の降伏は超えられません。これが天井です。理想の柱の強さは、天井とオイラーの線の低い方。2本がぶつかる所を 1 にした物差しが、細長比パラメータ λ です。1 より小さければ降伏が先、大きければ座屈が先。',
  },
  {
    kicker: '現実',
    head: '現実の柱は、理想の線に届かない',
    body: '残留応力と初期たわみのある現実の柱では、点が緑の線より下に落ちます。いちばん下がるのは λ = 1 のあたり。降伏と座屈が重なる所です。',
  },
  {
    kicker: '設計曲線',
    head: '設計の線は、点の群れの下側に引く',
    body: '不整の大きさは柱ごとに違うので、点は帯に散らばります。設計の線(水色)は、その下側に引かれています。いちばん短い柱だけは、計算(98%)が線をわずかに下回ります。降伏後に鋼が少し強くなる性質を、この計算に入れていないためです。',
  },
  {
    kicker: '実験室',
    head: '細長さを変えて、線を見比べる',
    body: '細長さを動かすと、理想・現実・設計の強さが出ます。各国の設計曲線も重ねられます。どの線も、理想の線は超えません。',
  },
];

export default function Stage4() {
  const [scene, setScene] = useState(0);
  const [lam, setLam] = useState(0.9);
  const [on, setOn] = useState<Record<CurveKey, boolean>>({ dohshi: true, aisc: false, ecb: false, ecc: false, aij: false });
  const { canvasRef, capRef, show } = useShow((c) => new Stage4Show(c));
  const go = (n: number) => {
    const next = Math.max(0, Math.min(SCENES.length - 1, n));
    setScene(next);
    show.current?.setScene(next);
  };
  const real = useMemo(() => solveColumn({ lambda: lam, resid: 0.3, imp: 1 / 1000, eOverFy: 200000 / 355, nStep: 240 }), [lam]);
  const changeLam = (v: number) => {
    setLam(v);
    if (show.current) show.current.labLam = v;
  };
  const toggle = (k: CurveKey) => {
    const next = { ...on, [k]: !on[k] };
    setOn(next);
    if (show.current) show.current.overlays = next;
  };
  const regime = lam < 0.35 ? 'ほぼ降伏で決まる(つぶれる)' : lam < 1.3 ? '部分的な降伏が引き金の座屈(非弾性座屈)' : 'ほぼ弾性のまま座屈(曲がって逃げる)';

  return (
    <StoryShell
      scene={scene}
      total={SCENES.length}
      text={SCENES[scene]}
      onScene={go}
      canvasRef={canvasRef}
      capRef={capRef}
      hint={`たわみは ${S4_AMP} 倍、柱の太さは ${S4_FAT} 倍に誇張・なぞると回転・2本指で移動と拡大縮小(PC は右ドラッグ・ホイール)`}
      side={
        <>
        {SIDE4[scene]}
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-studio-700 px-3 py-2 text-xs">
          <Chip color="#16a34a" text="理想の柱" />
          <Chip color="#1f2a44" text="現実の柱" />
          <Chip color="#6d28d9" text="オイラーの線" />
          <Chip color="#e11d48" text="降伏の天井" />
          <Chip color="#0284c7" text="設計曲線" />
        </div>
        </>
      }
      lab={
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="細長さを選ぶ">
            <LabSlider
              label="細長比パラメータ λ̄"
              term="lambda"
              hint="「降伏」と「座屈」の勝負指標。1 より大きいと座屈が先"
              value={lam}
              min={0.2}
              max={2}
              step={0.05}
              show={lam.toFixed(2)}
              color="#6d28d9"
              onChange={changeLam}
            />
            <p className="mt-1 text-sm text-ink-dim">
              柱の長さ <span className="num text-ink">{(real.Lmm / 1000).toFixed(1)} m</span>(H-300×300×10×16、弱軸まわり)
            </p>
            <p className="mt-2 text-base font-bold text-gold">{regime}</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="理想の柱" value={idealCurve(lam)} color="#16a34a" />
              <Row label="現実の柱(残留応力 30%・初期たわみ L/1000)" value={real.Pu} color="#1f2a44" />
              {CURVES.filter((c) => on[c.key]).map((c) => (
                <Row key={c.key} label={c.name} value={c.f(lam)} color={c.color} />
              ))}
            </dl>
            <button onClick={() => show.current?.pressNearest()} className="mt-3 h-11 rounded-lg bg-comp px-4 text-base font-bold text-studio-950">
              いちばん近い柱を押す ▶
            </button>
          </Card>
          <Card title="重ねる設計曲線">
            <div className="space-y-2">
              {CURVES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => toggle(c.key)}
                  aria-pressed={on[c.key]}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm font-bold ${
                    on[c.key] ? 'border-ink-dim bg-studio-700' : 'border-studio-600 text-ink-dim'
                  }`}
                >
                  <span className="h-3 w-6 rounded-full" style={{ background: on[c.key] ? c.color : '#b4c0d2' }} />
                  {c.name}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
            <FitTex block className="flex-1 text-sm">{String.raw`\bar{\lambda}=\sqrt{\dfrac{\sigma_y}{\sigma_e}}=\dfrac{1}{\pi}\sqrt{\dfrac{\sigma_y}{E}}\cdot\dfrac{l_e}{r}`}</FitTex>
            <DeriveLink id="d4" />
            </div>
            <p className="text-xs leading-relaxed text-ink-dim">
              どの線も、安全率や抵抗係数を掛ける前の値(公称強度)にそろえています。日本建築学会の式は、不整の影響を安全率(1.5〜2.17)の側に含めているので、安全率を除くと長い柱では理想の線に重なります(甘いわけではありません)。道路橋示方書は平成24年版までの式(λ̄≦0.2 で 1.0、0.2〜1.0 で 1.109−0.545λ̄、1.0 より上で
              1/(0.773+λ̄²))。断面の種類によっては別の式が使われます。平成29年版の式は出典で確認できていないため載せていません。
            </p>
          </Card>
        </div>
      }
      note="計算の前提: 映像3 と同じ(両端ピンの溶接 H形鋼 H-300×300×10×16、弱軸まわり、完全弾塑性、E = 2.0×10⁵ N/mm²、σy = 355 N/mm²)。理想の柱は残留応力なし・初期たわみ L/1,000,000。紺色の点は残留応力 30%・初期たわみ L/1000。点の群れは(20%, L/2000)(30%, L/1000)(40%, L/1000)の3組。この計算は降伏後の硬化を考えないので、いちばん短い柱(λ̄=0.2)では計算値(98%)が設計曲線(100%)をわずかに下回ります。"
    />
  );
}

function Chip({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span>
        <Rich text={text} />
      </span>
    </span>
  );
}

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <Rich text={label} />
      </dt>
      <dd className="num text-base font-bold">{pct(value)}</dd>
    </div>
  );
}
