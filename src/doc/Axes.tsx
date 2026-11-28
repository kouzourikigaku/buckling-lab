import { useState } from 'react';
import { AREA, AxesShow, I_STRONG, I_WEAK, RATIO } from '../three/axes.ts';
import { useShow } from '../ui/Story.tsx';
import { Callout, Eq, MovieLink, NeedChip, P, Section, Step, Table } from './ui.tsx';

/** 補足「なぜ H形鋼には強軸と弱軸があるのか」。映像1「だから H形」と同じ見た目の 3D で、バネの考え方から説明する */

const STEPS = ['① 2つの向きに曲げる', '② 強軸まわりをバネで', '③ 弱軸まわりをバネで', '④ 並べて比べる'];

function AxesFigure() {
  const [step, setStep] = useState(0);
  const { canvasRef, capRef, show } = useShow((c) => new AxesShow(c));
  const pick = (i: number) => {
    setStep(i);
    show.current?.setScene(i);
  };
  return (
    <figure className="mt-5 overflow-hidden rounded-2xl border border-studio-600 bg-studio-900">
      <figcaption className="px-3 pt-3 text-sm font-bold">
        <span className="mr-2 rounded bg-ink px-1.5 py-0.5 text-xs text-white">図A-1</span>
        同じ H形鋼を、2つの向きに曲げる
      </figcaption>
      <div className="relative mt-2 h-[52dvh] min-h-[300px] w-full">
        <canvas ref={canvasRef} className="block h-full w-full" />
        <p ref={capRef} className="pointer-events-none absolute inset-x-3 top-2 text-center text-[15px] font-bold leading-snug text-ink transition-opacity sm:text-lg" />
      </div>
      <div className="flex flex-wrap gap-1.5 px-3 py-2">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => pick(i)}
            className={`rounded-full border px-3 py-1.5 text-sm font-bold ${step === i ? 'border-comp bg-comp text-white' : 'border-studio-600 bg-studio-950 text-comp'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="px-3 pb-3 text-[13px] leading-relaxed text-ink-dim">
        断面は H-300×300×10×16(このサイトの柱と同じ)。曲がりとバネの伸び縮みは見やすく誇張しています(曲がりの比 約{RATIO.toFixed(1)} 倍は計算値)。バネ1本は、同じ量の鉄(約 400 mm²)を表します。なぞると回転・2本指で移動と拡大縮小(PC は右ドラッグ・ホイール)。
      </p>
    </figure>
  );
}

const cm4 = (v: number) => Math.round(v / 1e4).toLocaleString();

export default function Axes({ onStage }: { onStage: (n: number) => void }) {
  return (
    <div>
      <Section
        id="ax"
        no="補足"
        title="なぜ H形鋼には、強軸と弱軸があるのか"
        lead="同じ断面でも、曲げる向きで踏ん張りが約2.9倍違う。理由は、鉄が「曲げの中心線」からどれだけ遠くにあるか。"
      >
        <P>
          映像1 で、曲げへの踏ん張りはバネの束で考えられること、遠いバネほどよく効くことを見ました。同じ考え方で、H形鋼を2つの向きに曲げ比べます。下の図のボタンを ① から順に押してください。
        </P>
        <AxesFigure />
        <MovieLink n={1} label="曲げとテコ(バネの束と、だから H形)" onStage={onStage} />
      </Section>

      <Section id="ax-1" no="A-1" title="踏ん張りは「中心線からの距離の2乗」で数える" goal={String.raw`I=\int z^2\,dA`} needs={[['d0', '導出0 M = EI/R']]}>
        <Step n={1} title="バネ1本の効き目は、距離 × 距離">
          曲げると、中心線から z の所のバネは z に比例して伸び縮みし、z に比例した力を出します。その力が面を回す腕も z。だから効き目は z²。断面のすべての鉄について z² × 面積を足したものが、断面二次モーメント I(踏ん張りやすさ)です。
          <Eq tex={String.raw`I=\int z^2\,dA\qquad(z:\ \text{曲げの中心線からの距離})`} />
        </Step>
        <Step n={2} title="「曲げの中心線」は、曲げる向きで変わる">
          中心線は、曲げても伸び縮みしない線(中立軸)です。上下に曲げれば横の線、左右に曲げれば縦の線。H形鋼では、どちらの向きに曲げるかで、鉄と中心線の位置関係がまるで変わります。
        </Step>
      </Section>

      <Section id="ax-2" no="A-2" title="強軸まわり: 鉄の大半が、中心線から遠い" goal={String.raw`I_{\text{強}}=${cm4(I_STRONG)}\ \text{cm}^4`}>
        <P>
          ウェブを縦にして上下に曲げると、中心線はウェブの真ん中を横切ります。2枚のフランジは中心線から 142 mm の所にあり、その鉄はどれも「遠いバネ」。図の ② です。
        </P>
        <Eq tex={String.raw`\text{フランジ: }2\left(\dfrac{300\times16^3}{12}+4800\times142^2\right)`} note="4800 mm² は フランジ1枚の面積(300 × 16)。第1項(フランジ自身の厚みの分)はわずかで、ほとんどが 面積 × 距離 142 mm の2乗(第2項)。全体の約 92%。" />
        <Eq tex={String.raw`\text{ウェブ: }\dfrac{10\times268^3}{12}\qquad(\text{全体の約 8\%})`} />
      </Section>

      <Section id="ax-3" no="A-3" title="弱軸まわり: 中心線の近くに鉄が多い" goal={String.raw`I_{\text{弱}}=${cm4(I_WEAK)}\ \text{cm}^4`}>
        <P>
          同じ断面を横に倒して曲げると(左右に曲げるのと同じ)、中心線はウェブの上を通ります。図の ③ です。
        </P>
        <Step n={1} title="ウェブは中心線の上にあって、ほとんど効かない">ウェブのバネは伸び縮みしません。ウェブの分は全体の約 0.03%。</Step>
        <Step n={2} title="フランジも、中心線の近くから端まで広がっている">
          フランジは中心線をまたいで ±150 mm に広がっています。端の鉄はよく効きますが、中心に近い鉄はほとんど効きません。平均すると、効きの距離は 150 ÷ √3 ≒ 87 mm。強軸のフランジ(142 mm)よりずっと近い所にあるのと同じです。
          <Eq tex={String.raw`I_{\text{弱}}=\underbrace{2\times\dfrac{16\times300^3}{12}}_{\text{フランジ}}+\underbrace{\dfrac{268\times10^3}{12}}_{\text{ウェブ ほぼ 0}}`} />
        </Step>
      </Section>

      <Section id="ax-4" no="A-4" title="比べると、約2.9倍。細長さの物差し r も変わる" needs={[['ax-1', 'A-1 I の数え方']]}>
        <Table
          head={['', '強軸まわり', '弱軸まわり']}
          rows={[
            ['断面二次モーメント I', `${cm4(I_STRONG)} cm⁴`, `${cm4(I_WEAK)} cm⁴`],
            ['同じ力での曲がり', '1', `約 ${RATIO.toFixed(1)} 倍`],
            ['断面二次半径 r = √(I/A)', `${(Math.sqrt(I_STRONG / AREA) / 10).toFixed(2)} cm`, `${(Math.sqrt(I_WEAK / AREA) / 10).toFixed(2)} cm`],
          ]}
          note={`断面積 A = ${(AREA / 100).toFixed(1)} cm²。フィレット(圧延 H形鋼の角の丸み)のない溶接 H形鋼として計算。`}
        />
        <P>鉄の量(断面積)も形も同じです。違うのは、曲げる向きに対して鉄がどこにあるかだけ。映像1 の「同じ量の鉄で H形は約14倍」と、まったく同じ理屈です。</P>
        <Callout title="形によって、差はもっと大きくなる">
          H-300×300 は幅と高さが同じ「広幅」の H形なので、差は約2.9倍で済みます。幅の狭い H-600×200×11×17 なら、強軸は約 74,400 cm⁴、弱軸は約 2,270 cm⁴ で、約33倍の差です(同じくフィレットなしで計算)。
        </Callout>
      </Section>

      <Section id="ax-5" no="A-5" title="座屈とのつながり: 柱は、弱い向きに曲がって逃げる" needs={[['d2', '導出2 σe'], ['d4', '導出4 λ']]}>
        <P>
          座屈応力は σe = π²E/(l/r)²。r が小さい向きほど細長く、低い応力で座屈します。両端の支え方が2つの向きで同じなら、柱は弱軸まわりに座屈します。映像3・4 の柱が、弱軸まわりに曲がっているのはこのためです(r = 7.66 cm)。
        </P>
        <P>
          複合座屈の照査(映像6)で、強軸まわりと弱軸まわりの曲げを別々の項にするのも同じ理由です。向きごとに踏ん張り(曲げの許容値)も、軸力による増幅(σe と α)も違うからです。
        </P>
        <p className="mt-3 flex flex-wrap gap-2">
          <NeedChip id="ds-b2" label="照査式 U(2方向の曲げ)" />
        </p>
        <MovieLink n={6} label="座屈の照査(強軸・弱軸の曲げと、3軸のグラフ)" onStage={onStage} />
      </Section>
    </div>
  );
}
