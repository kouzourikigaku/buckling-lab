import type { ReactNode } from 'react';
import { FigColumnEq, FigLambdaRuler, FigModes, FigStrip } from './figs.tsx';
import { Eq, MovieLink, P, Section, Step, TabLink, Table } from './ui.tsx';
import { FitTex } from '../ui/Tex.tsx';

function Lead({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-xl bg-ink px-4 py-3 text-[15px] font-bold leading-relaxed text-white sm:text-base">{children}</p>;
}
/* ---------- 式の導出 ---------- */

/** 導出の地図: どの式をどの順に導くか。押すとその節へ */
const MAP: { id: string; no: string; name: string; tex: string; from: string }[] = [
  { id: 'd0', no: '0', name: '曲げの基本式', tex: String.raw`M=EI\times\dfrac{1}{R}`, from: '' },
  { id: 'd1', no: '1', name: '座屈荷重', tex: String.raw`P_e=\dfrac{\pi^2EI}{l^2}`, from: '0' },
  { id: 'd2', no: '2', name: '座屈応力・有効座屈長', tex: String.raw`\sigma_e=\dfrac{\pi^2E}{(l_e/r)^2}`, from: '1' },
  { id: 'd3', no: '3', name: '板の座屈応力', tex: String.raw`\sigma_{el}=\dfrac{k\pi^2E}{12(1-\nu^2)}\left(\dfrac{t}{b}\right)^2`, from: '2' },
  { id: 'd4', no: '4', name: '柱の物差し λ', tex: String.raw`\lambda=\sqrt{\sigma_y/\sigma_e}`, from: '2' },
  { id: 'd5', no: '5', name: '板の物差し R', tex: String.raw`R=\sqrt{\sigma_y/\sigma_{el}}`, from: '3・4' },
];
function DeriveMap() {
  return (
    <div className="mt-4 rounded-2xl border border-studio-600 bg-studio-900 p-3">
      <p className="text-sm font-bold">この章の地図: 6つの導出を、0 から順に積み上げる</p>
      <p className="mt-0.5 text-xs text-ink-dim">各節の冒頭に「この節で導く式」と「使う式」を書いています。押すとその節へ。</p>
      <ol className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {MAP.map((m) => (
          <li key={m.id}>
            <a href={`#${m.id}`} className="flex items-center gap-2 rounded-xl border border-studio-700 bg-studio-950 px-2 py-1.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-comp text-sm font-bold text-white">{m.no}</span>
              <span className="w-24 shrink-0 text-xs font-bold leading-tight">
                {m.name}
                {m.from && <span className="block font-normal text-ink-dim">← 導出 {m.from}</span>}
              </span>
              <FitTex className="flex-1 text-[15px]">{m.tex}</FitTex>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Derive({ onStage, go }: { onStage: (n: number) => void; go: (t: string) => void }) {
  return (
    <div>
      <DeriveMap />

      <Section
        id="d0"
        no="導出 0"
        title="曲げの基本式: 曲げに抵抗する力 = EI × 曲がり具合"
        goal={String.raw`M=EI\times\dfrac{1}{R}`}
        needs={[]}
      >
        <P>映像1 で、バネの束とテコで見た話を式にします。ここから先の導出は、すべてこの式の上に立っています。</P>
        <Step n={1} title="伸び縮みは、真ん中からの距離に比例する">
          半径 R で曲げた棒の、中立軸から z だけ外側の線を考えます。中心角 θ の区間で、中立軸の長さは Rθ、外側の線は (R + z)θ。伸びの割合(ひずみ)は、その差を元の長さで割ったものです。
          <Eq tex={String.raw`\varepsilon=\dfrac{(R+z)\theta-R\theta}{R\theta}=\dfrac{z}{R}`} note="内側(z が負)は縮む。真ん中(z = 0)は伸び縮みしない = 中立軸。" />
        </Step>
        <Step n={2} title="応力も、距離に比例する(バネの力)">
          鋼は弾性の範囲では、応力 = ヤング係数 × ひずみ(フックの法則。バネ1本の硬さが E)。
          <Eq tex={String.raw`\sigma=E\,\varepsilon=E\,\dfrac{z}{R}`} />
        </Step>
        <Step n={3} title="回す力は、力 × 腕。腕も距離なので、距離の2乗で効く">
          面積 dA の部分が出す力は σ·dA、その腕は z。断面全体で足し合わせると、曲げに抵抗する回す力(曲げモーメント)になります。
          <Eq tex={String.raw`M=\int\sigma\,z\,dA=\dfrac{E}{R}\int z^2\,dA`} />
          <Eq n="0" strong tex={String.raw`M=EI\times\dfrac{1}{R},\qquad I=\int z^2\,dA`} note="I は断面二次モーメント(断面の形で決まる踏ん張りやすさ)。長方形なら I = 幅 × 高さ³ ÷ 12。" />
          z² が「距離の2乗で効く」(映像1 のテコ)の正体です。長方形の高さを2倍にすると I は8倍になります。
        </Step>
        <MovieLink n={1} label="曲げとテコ(バネの束で見る M = EI/R)" onStage={onStage} />
      </Section>

      <Section
        id="d1"
        no="導出 1"
        title="オイラー座屈: 曲がった柱の釣合いから、座屈荷重へ"
        goal={String.raw`P_e=\dfrac{\pi^2EI}{l^2}`}
        goalNote="途中で、曲がり具合が ずれ に比例すること(1/R = (π/l)² × y)も出てくる(手順6)。映像2 の綱引きを式にしたもの。"
        needs={[['d0', '導出0 M = EI/R']]}
      >
      <p className="mt-4 text-[17px] font-bold">まず: 座屈は「釣合いの分かれ道」</p>
      <Lead>座屈は、「まっすぐ」と「曲がったまま」の両方で釣り合える荷重に達した瞬間に起こる</Lead>
      <Table
        head={['① 荷重が小さいうち', '② 座屈荷重に達する', '③ それを超えると']}
        rows={[['横から少し押して曲げても、手を離すと元に戻る。まっすぐな状態が安定。', '曲がった形のままでも力が釣り合う。まっすぐ/曲がる、の分かれ道。', 'わずかな曲がりが戻らず、どんどん大きくなる。これが座屈。']]}
      />
      <P>
        導出の方針は、柱も板も同じです。「少しだけ曲がった状態」を考え、その状態で力が釣り合う条件を式にします。曲がったまま釣り合える荷重のうち、最も小さいものが座屈荷重です。前提は、柱が完全にまっすぐで、荷重は断面の中心にかかり、材料はどこまでも弾性(力と変形が比例)であること。
      </P>

      <MovieLink n={2} label="オイラー座屈(曲げる力と戻す力の綱引き)" onStage={onStage} />
      <P>まず図2-1 のボタンを ① から順に押して、2つの「回す力」が逆向きに釣り合う様子を見てください。下の手順1〜3 は、それを式で書いたものです。</P>
      <FigColumnEq />
      <Step id="d1-m" n={1} title="外力が曲げようとする力(モーメント)">
        位置 x で柱が y だけ横にずれると、軸力 P は「腕の長さ y」で柱を回そうとします。
        <Eq tex={String.raw`M=P\times y`} />
      </Step>
      <Step id="d1-r" n={2} title="柱が曲げに抵抗する力">
        導出0 の基本式「抵抗モーメント = EI × 曲がり具合 1/R」を使います(E は材料の硬さ、I は断面の曲げにくさ、R は曲がりの半径)。ここでは、この 1/R を、ずれ y の式で書き直します。
        <Eq tex={String.raw`M_{\text{抵抗}}=EI\times\dfrac{1}{R}`} />
        <P>
          <b>1/R と y″ のつながり</b>: 曲がり具合とは「傾きが、進むにつれてどれだけ変わるか」です。傾きは y を1回微分した y′、その変わり方は2回微分した y″。半径 R の円の頂上付近は y ≒ −x²/(2R) と書けるので、y′ = −x/R、y″ = −1/R になります。つまり、たわみが小さい(傾きがわずかな)柱では、曲がり具合 1/R は y″ の大きさそのもので、山なり(上に凸)のカーブでは y″ が負なので 1/R = −y″ です。
        </P>
        <Eq tex={String.raw`\dfrac{1}{R}=-y''\quad\Longrightarrow\quad M_{\text{抵抗}}=-EI\,y''`} note="正確には 1/R = −y″ ÷ (1 + y′²) の 3/2 乗。柱のたわみは長さの数百分の1ほどで y′² はごく小さいので、分母を 1 とみなす。" />
      </Step>
      <Step id="d1-eq" n={3} title="2つが釣り合う条件">
        外力は左回り、柱の踏ん張りは右回りに回そうとし、その大きさが等しい(図2-1 の④)。マイナスは、山なりのカーブで y″ が負になるのを、正の量(曲がり具合 1/R)に直すためのものです。移項すると、柱の釣合い式になります。
                  <Eq n="1" strong tex={String.raw`P\,y=-EI\,y''\quad\Longrightarrow\quad EI\,y''+P\,y=0`} note="柱の釣合い式" />
              </Step>
      <Step n={4} title="式を整理して、解の形を見つける">
        両辺を EI で割り、k² = P/EI とおくと y″ + k²y = 0。これを y″ = −k²y と読むと、「曲がり具合は、ずれ y に比例して逆向き」。ずれが大きい所ほど強く元に戻る向きに曲がる形は、波(sin・cos)です。
        <Eq tex={String.raw`y=A\sin kx+B\cos kx`} note="確かめ: (sin kx)″ = −k² sin kx。2回微分すると −k² 倍の自分に戻る。" />
      </Step>
      <Step n={5} title="両端の条件(両端ピン)を入れる">
        両端は横に動けないので、x = 0 と x = l で y = 0。
        <Eq tex={String.raw`x=0:\;B=0\qquad x=l:\;A\sin kl=0`} />
      </Step>
      <Step id="d1-pe" n={6} title="分かれ道">
        A = 0 なら、まっすぐのまま(どんな荷重でも成り立つ)。A ≠ 0 で成り立つのは sin kl = 0、つまり kl = nπ(n = 1, 2, 3…)のときだけ。これが「曲がったまま釣り合える」荷重です。曲がりの大きさ A は決まらず、形だけが決まります。いちばん小さい n = 1 をとると、
        <Eq tex={String.raw`kl=\pi\;\to\;k^2=\dfrac{\pi^2}{l^2}\;\to\;\dfrac{P}{EI}=\dfrac{\pi^2}{l^2}`} />
                  <Eq n="2" strong tex={String.raw`P_e=\dfrac{\pi^2EI}{l^2}`} note="オイラーの座屈荷重" />
                n = 2 は半波が2つの形で、荷重は4倍。π は、座屈の形がサインカーブであることから来ています。
        <P id="d1-k">
          <b>曲がり具合 1/R は、ずれ y に比例する</b>: 形 y = A sin(πx/l) を2回微分すると y″ = −(π/l)² × y。だから 1/R = −y″ = (π/l)² × y です。曲がりを大きくしても(A が増えても)形は同じまま膨らむので、どの高さでも曲がり具合はずれと同じ割合で増えます。係数 (π/l)² の π は、形がサインカーブであることから来ています。
        </P>
        <Eq tex={String.raw`y=A\sin\dfrac{\pi x}{l}\;\to\;\dfrac{1}{R}=-y''=\left(\dfrac{\pi}{l}\right)^2y`} />
        <Eq tex={String.raw`\text{戻す力 }EI\times\dfrac{1}{R}=\dfrac{\pi^2EI}{l^2}\times y`} />
        <P>
          <b>言葉で言い直すと</b>: 曲げる側は P × y、戻す側は EI × 1/R = EI(π/l)² × y(サインカーブでは、曲がり具合 1/R がずれ y に比例し、その係数が (π/l)²)。どちらにも y が掛かっているので、y では勝負がつかない。比べるのは y の前の係数で、P は外力なので上げられ、EI(π/l)² は材料・断面・長さで決まって動かない。P が EI(π/l)² = π²EI/l² に追いついた所が座屈荷重です(映像2 の綱引き)。
        </P>
      </Step>

      <FigModes />

      </Section>

      <Section
        id="d2"
        no="導出 2"
        title="応力の形にする(σe)と、支え方(有効座屈長)"
        goal={String.raw`\sigma_e=\dfrac{\pi^2E}{(l_e/r)^2}`}
        needs={[['d1', '導出1 Pe']]}
      >
      <Step id="d2-s" n={1} title="荷重を応力に直す">
        応力 = 荷重 ÷ 断面積。まず (2) を A で割ると σe = π²EI/(A·l²)。I と A が分かれば、この形のまま計算できます。次に、断面二次半径 r = √(I/A)(断面の踏ん張りやすさ I を面積あたりにして平方根をとった長さ)を使うと I = A·r² なので、A が消えて (3) になります。2つは同じ式で、同じ値になります。
        <Eq tex={String.raw`\sigma_e=\dfrac{P_e}{A}=\dfrac{\pi^2EI}{A\,l^2}=\dfrac{\pi^2E\,(A\,r^2)}{A\,l^2}`} note="例: H-300×300×10×16 の弱軸は I = 7,202 cm⁴、A = 122.8 cm² なので r = √(7,202 ÷ 122.8) ≒ 7.66 cm。鋼材表には r(表によっては i)が載っている。" />
                  <Eq n="3" strong tex={String.raw`\sigma_e=\dfrac{\pi^2E}{(l/r)^2}`} note="オイラー座屈応力" />
                l/r が細長比。細長比が2倍になると σe は 1/4。E と形(l/r)だけで決まり、σy は入りません。設計基準は柱の細長さを l/r で整理する(λ の式も l/r で書く)ので、(3) の形がよく使われます。なお、断面二次半径の r(小文字)は、曲がりの半径 R や、板の幅厚比パラメータ R とは別の記号です。
      </Step>
      <Step id="d2-le" n={2} title="端部の拘束は「有効座屈長」で表す">
        l を le に置き換えるだけです。拘束が強いほど曲がる区間が短くなり、σe が上がります。板では、この「支え方の効果」が係数 k に入ります。
        <Table
          head={['端部の条件', 'le', 'σe(両端ピン比)']}
          rows={[
            ['両端ピン', '1.0 l', '1 倍'],
            ['一端固定・他端ピン', '0.7 l', '約 2 倍'],
            ['両端固定', '0.5 l', '4 倍'],
            ['一端固定・他端自由', '2.0 l', '1/4 倍'],
          ]}
        />
      </Step>

      </Section>

      <Section
        id="d3"
        no="導出 3"
        title="柱から板へ: 弾性局部座屈応力 σel"
        goal={String.raw`\sigma_{el}=\dfrac{k\pi^2E}{12(1-\nu^2)}\left(\dfrac{t}{b}\right)^2`}
        needs={[['d2', '導出2 σe']]}
      >
      <Lead>長い板は「長さ b の帯(柱)」が並んだもの。オイラー式に2つの補正を掛けるだけで σel になる</Lead>
      <FigStrip />
      <Step n={0} title="出発点">
        <Eq tex={String.raw`\sigma_e=\dfrac{\pi^2E}{(l/r)^2},\qquad r=\sqrt{I/A}`} />
      </Step>
      <Step n={1} title="板の帯を、柱とみなす">
        幅 1・厚さ t の帯は長方形断面なので I = t³/12、A = t、r = t/√12。波1つの長さを b とすると (l/r)² = 12(b/t)²。
        <Eq tex={String.raw`\sigma=\dfrac{\pi^2E}{12}\left(\dfrac{t}{b}\right)^2`} />
      </Step>
      <Step n={2} title="板は横に自由に変形できない(ポアソン効果)">
        帯1本だけなら、曲げたときに幅方向へも自由に伸び縮みできます(ポアソン効果)。板の中の帯は隣の帯とつながっているので、その横向きの変形が抑えられ、そのぶん少し硬くなります(ν = 0.3 で 1/(1−ν²) ≒ 1.1 倍)。
        <Eq tex={String.raw`\times\dfrac{1}{1-\nu^2}`} />
      </Step>
      <Step n={3} title="縁端の支え">
        両側の支えが波打ちを抑えます。その効果を係数 k で表します。
        <Eq tex={String.raw`\times k`} />
                  <Eq n="4" strong tex={String.raw`\sigma_{el}=\dfrac{k\pi^2E}{12(1-\nu^2)}\left(\dfrac{t}{b}\right)^2`} note="弾性局部座屈応力" />
                板の曲げ剛性 D = Et³/{'{'}12(1−ν²){'}'} で書くと σel = kπ²D/(b²t) で、同じ式です。
      </Step>
      <Table
        head={['縁端の支え方', 'k', '例']}
        rows={[
          ['両縁 単純支持', '4.0', '箱形断面の板など'],
          ['両縁 固定', '6.97', '理論上の上限側'],
          ['一縁 固定・一縁 自由', '1.28', '—'],
          ['一縁 単純支持・一縁 自由', '0.425(設計では 0.43)', '自由突出板(フランジの突出部など)'],
        ]}
      />
      <Table
        head={['要素', '柱(オイラー座屈)', '板(局部座屈)']}
        rows={[
          ['細長さ', 'l/r', 'b/t'],
          ['支え方', '有効座屈長 le', '係数 k(縁端支持+波の形)'],
          ['ポアソン比', 'なし', '1/(1−ν²)(約 1.1 倍)'],
          ['基本の形', 'π²E × (1/細長比)²', 'π²E × (t/b)² × 係数'],
        ]}
      />
      <P>片側が自由になるだけで k は約 1/9(0.425 ÷ 4)。同じ b/t でも σel は約 1/9 になります。</P>
      <MovieLink n={5} label="板の座屈(σel と R の導き方、設計式)" onStage={onStage} />

      </Section>

      <Section
        id="d4"
        no="導出 4"
        title="柱の物差し: 細長比パラメータ λ"
        goal={String.raw`\lambda=\sqrt{\dfrac{\sigma_y}{\sigma_e}}=\dfrac{1}{\pi}\sqrt{\dfrac{\sigma_y}{E}}\times\dfrac{l}{r}`}
        needs={[['d2', '導出2 σe']]}
      >
      <Lead>λ は「降伏応力 σy」と「オイラー座屈応力 σe」の比の平方根。σe の式を代入すると、照査で使う λ の式になる</Lead>
      <Step n={1} title="定義">
        降伏が先か、座屈が先かを測る物差しです。
        <Eq tex={String.raw`\lambda=\sqrt{\dfrac{\sigma_y}{\sigma_e}}`} />
      </Step>
      <Step n={2} title="オイラー式を代入">
        <Eq tex={String.raw`\dfrac{\sigma_y}{\sigma_e}=\sigma_y\div\dfrac{\pi^2E}{(l/r)^2}=\dfrac{\sigma_y\,(l/r)^2}{\pi^2E}`} />
      </Step>
      <Step n={3} title="平方根をとって、並べ替える">
                  <Eq n="5" strong tex={String.raw`\lambda=\dfrac{1}{\pi}\sqrt{\dfrac{\sigma_y}{E}}\times\dfrac{l}{r}`} note="細長比パラメータ" />
                材料で決まる部分 √(σy/E) × 形で決まる細長比 l/r。
      </Step>
      <P>
        <strong>読み方</strong>: λ &lt; 1 なら σe &gt; σy で先に降伏(短く太い柱)。λ = 1 で座屈と降伏が同時。λ &gt; 1 なら先に弾性座屈(長く細い柱)。言いかえると、λ は「σe = σy になる基準の柱の、何倍細長いか」です。基準の柱の細長比は π√(E/σy)(σy = 235、E = 2.0×10⁵ N/mm² なら約 92)。
      </P>
      <P>
        <strong>なぜ √ をとるのか</strong>: 比べたいのは σy と σe(1 が境目)です。σe は細長比の2乗で効くので、比のままだと「面積の比」のような量になります。√ をとると判定は変えずに、「細長さ(辺の長さ)の比」の目盛りに直せます。面積が4倍の正方形の辺が2倍なのと同じです。
      </P>

      <FigLambdaRuler />
      <MovieLink n={4} label="設計曲線(λ の物差しをグラフで作る)" onStage={onStage} />

      </Section>

      <Section
        id="d5"
        no="導出 5"
        title="板の物差し: 幅厚比パラメータ R"
        goal={String.raw`R=\sqrt{\dfrac{\sigma_y}{\sigma_{el}}}=\dfrac{b}{t}\sqrt{\dfrac{12(1-\nu^2)\,\sigma_y}{k\pi^2E}}`}
        needs={[['d3', '導出3 σel'], ['d4', '導出4 λ(作り方が同じ)']]}
      >
      <Lead>R も λ と同じく「σy と σel の比」。σel の式を代入すると、照査で使う R の式になる</Lead>
      <Step n={1} title="定義">
        <Eq tex={String.raw`R=\sqrt{\dfrac{\sigma_y}{\sigma_{el}}}`} />
      </Step>
      <Step n={2} title="σel を代入">
        <Eq tex={String.raw`\dfrac{\sigma_y}{\sigma_{el}}=\dfrac{12(1-\nu^2)\,\sigma_y\,(b/t)^2}{k\pi^2E}`} />
      </Step>
      <Step n={3} title="平方根をとる">
                  <Eq n="6" strong tex={String.raw`R=\dfrac{b}{t}\times\sqrt{\dfrac{12(1-\nu^2)\,\sigma_y}{k\pi^2E}}`} note="幅厚比パラメータ" />
              </Step>
      <Step n={4} title="λ と比べる">
        <Eq tex={String.raw`R=\dfrac{1}{\pi}\sqrt{\dfrac{\sigma_y}{E}}\times\dfrac{b}{t}\times\sqrt{\dfrac{12(1-\nu^2)}{k}}`} />
        λ と同じ形です。l/r が b/t に替わり、補正 √{'{'}12(1−ν²)/k{'}'} が付くだけ。
      </Step>
      <P>
        <strong>読み方</strong>: R = 1 になる b/t が基準です(σy = 205、E = 2.06×10⁵ N/mm² のとき、自由突出板 k = 0.43 で約 19.8、両縁支持板 k = 4.0 で約 60)。R &gt; 1 なら降伏する前に弾性座屈。b/t だけでは鋼種や支え方の違う板を比べられませんが、R にすれば「R ≦ 0.7 なら低減なし」の1本の基準で判定できます。
      </P>

      </Section>

      <div className="mt-8 rounded-xl border-2 border-comp bg-studio-900 p-4">
        <p className="text-lg font-bold">この先: 理論値から設計式へ</p>
        <p className="mt-1 text-[15px] leading-relaxed">
          ここまでで、理想の部材が座屈する応力(σe、σel)と、物差し(λ、R)がそろいました。現実の部材の弱さを入れて設計式に落とし込む流れ(初期たわみの理論、0.5/R² の意味、α と照査式の成り立ち)は、次の章にまとめています。
        </p>
        <TabLink to="理論から設計式へ" label="理論から設計式へ を読む" go={go} primary />
      </div>
    </div>
  );
}

