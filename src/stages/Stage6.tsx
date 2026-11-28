import { useState } from 'react';
import { loadFactor2, terms2 } from '../physics/beamcolumn.ts';
import { EX, EXB, Stage6Show, exbValues, strengthGL } from '../three/stage6.ts';
import { Card, DeriveLink, Steps, StoryShell, openFormulas, useShow } from '../ui/Story.tsx';
import type { SceneText } from '../ui/Story.tsx';
import { FitTex, Tex } from '../ui/Tex.tsx';
import { Term } from '../ui/glossary.tsx';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const exStr = strengthGL(EX.lam, EX.R);
const exb = exbValues();
const exTerms = terms2(EXB.n, EXB.my, EXB.mz, exb.pu, exb.pey, exb.pez);
const exU = exTerms[0] + exTerms[1] + exTerms[2];
const exLF = loadFactor2(EXB.n, EXB.my, EXB.mz, exb.pu, exb.pey, exb.pez);

const SCENES: SceneText[] = [
  {
    kicker: '地図',
    head: '座屈の照査は、3段でつながっている',
    body: '柱が座屈しないことを、計算で確かめる。これが照査です。① 局部座屈(板の波打ち)、② 全体座屈(柱ごと曲がる)、③ 複合座屈(軸力と曲げを同時に)。①の結果が②へ、②の結果が③へ入ります。',
  },
  {
    kicker: '② 全体座屈',
    head: '全体座屈。柱が、柱ごと曲がる',
    body: '柱全体が弓なりに曲がる座屈です。決め手は細長比パラメータ λ。λ から低減率を選び、全体座屈応力 σcg = σy × 低減率 を出します(映像2〜4)。',
  },
  {
    kicker: '① 局部座屈',
    head: '局部座屈。板だけが波打つ',
    body: '柱はまっすぐのまま、断面の板が波打つ座屈です。決め手は幅厚比パラメータ R。R から低減率を選び、局部座屈の許容値 σcl = σy × 低減率 を出します(映像5)。',
  },
  {
    kicker: '① と ②',
    head: '局部座屈と全体座屈は、影響し合う',
    body: '板が先に波打つと、その板は力を受けにくくなり、柱の踏ん張りが落ちます。すると柱ごとの座屈も早まる。別々に計算するだけでは、強さを過大に見積もることがあります。',
  },
  {
    kicker: '② の許容値',
    head: 'σcz = σcg × σcl/σy',
    body: '設計では、この影響を掛け算で見込みます。σcg に、局部座屈で使える割合 σcl/σy を掛けたものが、全体座屈の許容値 σcz。連成を直接計算した値ではなく、設計上の低減の考え方です。',
  },
  {
    kicker: '軸力だけの安全率',
    head: '安全率 = 許容値 ÷ 発生応力',
    body: `発生する応力 σc が、許容値より小さいことを確かめます。その余裕が安全率で、1.0 以上なら OK。この例では σcz が降伏の ${pct(exStr)}、σc が ${pct(EX.n)} なので、安全率は ${(exStr / EX.n).toFixed(1)}。`,
  },
  {
    kicker: '③ 複合座屈',
    head: '曲げは2方向。軸力・強軸・弱軸で余力を分け合う',
    body: '実際の柱は、横からの力で曲げられもします。向きは2つ。断面の広い向きの「強軸」と、狭い向きの「弱軸」です。軸力・強軸の曲げ・弱軸の曲げが、それぞれ許容値の何割を使うか(使用割合)を足し、合計 1 以下なら OK。三角の面の内側が、耐えられる範囲です。',
  },
  {
    kicker: '③ 複合座屈',
    head: '軸力は曲げを増幅する。弱軸まわりほど大きく',
    body: '曲がった柱を上から押すと、押す力が曲げる力に化け、曲がりが増えます。照査式では、曲げの使用割合を α = 1 − σc/(0.8σe) で割って見込みます。弱軸は σe が小さいので増幅が大きい。耐えられる範囲は内側へへこみ、弱軸の側ほど大きくへこみます。',
  },
  {
    kicker: '③ 複合座屈',
    head: '使用割合の合計 U と、安全率 1/U',
    body: 'ここまでを1行にしたのが下の照査式です。合計 U が 1 以下なら OK、安全率は 1/U。黒い点がいまの柱で、紫の面までの余裕の目安が 1/U です(α が軸力で変わるので、面までの倍率とは少し違います)。α が 0 以下になると、この式は使えません。',
  },
  {
    kicker: '計算へ',
    head: '数字を入れて、3つの照査を通してみる',
    body: '実際の数字を入れると、R・σcl・λ・σcg・σcz・α・U と安全率が順に出ます。「式と Q&A」の計算ツールで確かめてください。導出と、よくある質問への回答も同じページにあります。',
  },
];

const SIDE6: Record<number, React.ReactNode> = {
  1: <Steps title="② 全体座屈" steps={[['全体座屈応力', String.raw`\sigma_{cg}=\sigma_y\times\text{低減率}(\lambda)`, 'ds-c5']]} />,
  2: <Steps title="① 局部座屈" steps={[['許容値', String.raw`\sigma_{cl}=\sigma_y\times\text{低減率}(R)`, 'ds-p3']]} />,
  4: <Steps title="② の許容値" steps={[['掛け算', String.raw`\sigma_{cz}=\sigma_{cg}\times\dfrac{\sigma_{cl}}{\sigma_y}`, 'ds-g1']]} />,
  5: <Steps title="軸力だけの照査" steps={[['安全率', String.raw`\dfrac{\sigma_{cz}}{\sigma_c}\ \ge\ 1.0`, 'ov-global']]} />,
};

export default function Stage6() {
  const [scene, setScene] = useState(0);
  const { canvasRef, capRef, show } = useShow((c) => new Stage6Show(c));
  const go = (n: number) => {
    const next = Math.max(0, Math.min(SCENES.length - 1, n));
    setScene(next);
    // 3D の場面3(補剛板の全体座屈)は使わないので、3 以降は1つ先の番号を渡す
    show.current?.setScene(next >= 3 ? next + 1 : next);
  };

  return (
    <StoryShell
      scene={scene}
      total={SCENES.length}
      text={SCENES[scene]}
      onScene={go}
      canvasRef={canvasRef}
      capRef={capRef}
      labLabel="計算へ ▶"
      hint="柱の絵は、しくみを示す模式図です(曲がりと波は見やすく誇張)・なぞると回転・2本指で移動と拡大縮小(PC は右ドラッグ・ホイール)"
      side={
        scene >= 6 ? (
          <div className="rounded-xl border border-studio-700 bg-studio-900 px-3 py-2 text-sm">
            <p className="text-xs font-bold text-ink-dim">
              <Term id="beamcol">複合座屈</Term>の<Term id="check">照査</Term>式(軸力 + 強軸・弱軸の2方向の曲げ)
            </p>
            <FitTex block className="text-base">{String.raw`U=\dfrac{\sigma_c}{\sigma_{cz}}+\dfrac{\sigma_{bcy}}{\sigma_{bgy}\,\alpha_y}+\dfrac{\sigma_{bcz}}{\sigma_{b0}\,\alpha_z}\le 1`}</FitTex>
            <FitTex block className="text-base">{String.raw`\alpha_y=1-\dfrac{\sigma_c}{0.8\,\sigma_{ey}},\qquad \alpha_z=1-\dfrac{\sigma_c}{0.8\,\sigma_{ez}}`}</FitTex>
            <div className="flex justify-end">
              <DeriveLink id="ds-b1" />
            </div>
            <ul className="space-y-0.5 text-xs leading-relaxed">
              <li>
                <Tex>{'\\sigma_c'}</Tex> … 発生する軸方向圧縮応力。<Tex>{'\\sigma_{cz}'}</Tex> … 全体座屈の許容値(<Tex>{'\\sigma_{cg}\\times\\sigma_{cl}/\\sigma_y'}</Tex>)
              </li>
              <li>
                <Tex>{'\\sigma_{bcy}'}</Tex>、<Tex>{'\\sigma_{bcz}'}</Tex> … 強軸(y)・弱軸(z)まわりの曲げによる圧縮縁応力
              </li>
              <li>
                <Tex>{'\\sigma_{bgy}'}</Tex> … 強軸まわりの曲げの許容値(横倒れ座屈を考慮。H形などで下がり、箱形では通常ほとんど下がらない)。<Tex>{'\\sigma_{b0}'}</Tex> … 横倒れ座屈を考えない曲げの許容値(弱軸まわりは横倒れしない)
              </li>
              <li>
                <Tex>{'\\sigma_{ey}'}</Tex>、<Tex>{'\\sigma_{ez}'}</Tex> … 強軸・弱軸まわりの<Term id="pe">オイラー座屈応力</Term>。<Term id="safety">安全率</Term> = <Tex>{'1/U'}</Tex>
              </li>
            </ul>
            {scene >= 8 && (
              <div className="mt-2 border-t border-studio-700 pt-2 text-xs">
                <p className="font-bold">例の柱の使用割合(黒い点)</p>
                <div className="mt-1 flex h-4 w-full overflow-hidden rounded bg-studio-800">
                  {exTerms.map((v, i) => (
                    <span key={i} style={{ width: `${Math.min(100, v * 100)}%`, background: ['#1f2a44', '#ea580c', '#0284c7'][i] }} />
                  ))}
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3">
                  <span>軸力 {exTerms[0].toFixed(2)}</span>
                  <span style={{ color: '#ea580c' }}>強軸 {exTerms[1].toFixed(2)}</span>
                  <span style={{ color: '#0284c7' }}>弱軸 {exTerms[2].toFixed(2)}</span>
                  <b>U = {exU.toFixed(2)}、安全率 1/U = {(1 / exU).toFixed(2)}</b>
                  <span>面までの倍率 {exLF.toFixed(2)}</span>
                </p>
                <p className="text-ink-dim">
                  細長比パラメータ 強軸 {EXB.lamY}・弱軸 {EXB.lamZ}、板は厚い(R ≦ 0.7)。αy = {(1 - EXB.n / (0.8 * exb.pey)).toFixed(2)}、αz = {(1 - EXB.n / (0.8 * exb.pez)).toFixed(2)}
                </p>
              </div>
            )}
            <p className="mt-1 flex flex-wrap gap-x-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gold" />U = 1 の面(α あり)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#94a3b8' }} />α を考えない三角の面
              </span>
            </p>
          </div>
        ) : (
          <>
          {SIDE6[scene]}
          <div className="rounded-xl border border-studio-700 bg-studio-900 px-3 py-2 text-sm">
            <p className="text-xs font-bold text-ink-dim">軸力だけを受ける柱の座屈(押すと説明)</p>
            <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              <li>
                <Term id="global" /> … 柱ごと
              </li>
              <li>
                <Term id="local" /> … 板が波打つ
              </li>
            </ul>
            {scene >= 4 && (
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-studio-700 pt-2 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-comp" />
                  σcg(局部座屈を考慮しない)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-gold" />
                  σcz(局部座屈を考慮した許容値)
                </span>
              </p>
            )}
          </div>
          </>
        )
      }
      lab={
        <Card title="式と数字で確かめる">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => openFormulas('計算してみる')} className="h-12 rounded-xl bg-comp px-5 text-base font-bold text-white">
              計算してみる(3つの照査を通す)
            </button>
            <button onClick={() => openFormulas('式の導出')} className="h-12 rounded-xl border border-comp px-5 text-base font-bold text-comp">
              式の導出を読む
            </button>
            <button onClick={() => openFormulas('質問と回答')} className="h-12 rounded-xl border border-comp px-5 text-base font-bold text-comp">
              質問と回答を読む
            </button>
          </div>
        </Card>
      }
      note="柱の絵は模式図で、曲がりや波の形・大きさは計算結果ではありません。式は「式と Q&A」のページと同じです(道路橋示方書・平成24年版までの流儀。局部座屈 R ≦ 0.7 で 1.0、それより大きいと 0.5/R²。全体座屈は λ の区分式。複合座屈は使用割合の和で、α = 1 − σc/(0.8σe))。柱は長方形の箱形で、断面の広い向きへの曲げを強軸まわり、狭い向きへの曲げを弱軸まわりとしています。3軸のグラフの使用割合は α で割る前の値で、面の形は例の柱(強軸 λ = 0.7、弱軸 λ = 1.3、板は厚い)の値です。「複合座屈」という言葉は、文献によっては、複数の座屈が影響し合うこと(局部座屈と全体座屈の連成など)を指して使われることもあります。"
    />
  );
}
