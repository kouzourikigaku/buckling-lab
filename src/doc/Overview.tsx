import { FigFlow } from './figs.tsx';
import { Callout, Eq, MovieLink, P, Section, Step, TabLink, Table } from './ui.tsx';

/** 3つの照査: 手順と式だけを、上から順に並べる。理由は「理論から設計式へ」、数字は「計算してみる」へ */
export default function Overview({ go, onStage }: { go: (t: string) => void; onStage: (n: number) => void }) {
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div>
      <Section id="ov-top" title="座屈の照査は、3段でつながっている" lead="① 局部座屈の許容値 σcl が ② 全体座屈の許容値 σcz に入り、σcz が ③ 複合座屈の照査に入る。">
        <FigFlow onJump={jump} />
        <P>
          この章は、照査の手順と式だけを、使う順に並べたものです。それぞれの式がなぜその形なのかは「理論から設計式へ」、数字を入れた確かめは「計算してみる」にあります。
        </P>
      </Section>

      <Section id="ov-local" no="①" title="局部座屈: 薄い板の波打ち(軸力のみ)">
        <Step n={1} title="幅厚比パラメータ R を求める">
          <Eq n="1" tex={String.raw`R=\sqrt{\dfrac{\sigma_y}{\sigma_{el}}}=\dfrac{b}{t}\sqrt{\dfrac{12(1-\nu^2)\,\sigma_y}{k\,\pi^2E}}`} note="b: 板の幅(自由突出板では突出幅)、t: 板厚(腐食があれば腐食後)、k: 座屈係数(自由突出板 0.43、両縁支持板 4.0)。" />
        </Step>
        <Step n={2} title="R から低減率を選び、局部座屈の許容値 σcl を出す">
          <Table
            head={['R の範囲', '低減率 σcl/σy']}
            rows={[
              ['R ≦ 0.7', '1.0(低減なし)'],
              ['R > 0.7', '0.5 / R²'],
            ]}
          />
          <Eq n="2" strong tex={String.raw`\sigma_{cl}=\sigma_y\times\text{低減率}`} />
        </Step>
        <Step n={3} title="安全率">
          <Eq n="3" tex={String.raw`\text{安全率}=\dfrac{\sigma_{cl}}{\sigma_c}\ \ge 1.0`} note="σc: 発生する平均の圧縮応力。" />
        </Step>
        <TabLink to="理論から設計式へ" label="なぜ 0.5/R² なのか" go={go} />
        <MovieLink n={5} label="板の座屈" onStage={onStage} />
      </Section>

      <Section id="ov-global" no="②" title="全体座屈: 柱全体の曲がり(軸力のみ)">
        <Step n={1} title="有効座屈長 l と、細長比パラメータ λ を求める">
          <Eq n="4" tex={String.raw`l=\beta L,\qquad r=\sqrt{I/A},\qquad \lambda=\dfrac{1}{\pi}\sqrt{\dfrac{\sigma_y}{E}}\cdot\dfrac{l}{r}`} note="β: 端部の支え方で決まる有効座屈長係数。強軸・弱軸のうち、細長比の大きい方で決まる。" />
        </Step>
        <Step n={2} title="λ から低減率を選び、全体座屈応力 σcg を出す(局部座屈は考慮しない値)">
          <Table
            head={['λ の範囲', '低減率 σcg/σy', '傾向']}
            rows={[
              ['λ ≦ 0.2', '1.0(低減なし)', '降伏で決まる'],
              ['0.2 < λ ≦ 1.0', '1.109 − 0.545λ', '降伏と座屈の両方が効く'],
              ['1.0 < λ', '1 / (0.773 + λ²)', 'オイラー座屈に近い'],
            ]}
          />
        </Step>
        <Step n={3} title="局部座屈の分を掛けて、全体座屈の許容値 σcz にする">
          <Eq n="5" strong tex={String.raw`\sigma_{cz}=\sigma_{cg}\times\dfrac{\sigma_{cl}}{\sigma_{c0}}\qquad(\sigma_{c0}=\sigma_y)`} />
        </Step>
        <Step n={4} title="安全率">
          <Eq n="6" tex={String.raw`\text{安全率}=\dfrac{\sigma_{cz}}{\sigma_c}\ \ge 1.0`} />
        </Step>
        <TabLink to="理論から設計式へ" label="区分式の成り立ちと、なぜ掛けるのか" go={go} />
        <MovieLink n={4} label="設計曲線" onStage={onStage} />
      </Section>

      <Section id="ov-comb" no="③" title="複合座屈: 軸力と曲げの組合せ" lead="軸力と2方向の曲げの「使用割合」を足し、合計が 1 以下であることを確かめる。">
        <Eq n="7" strong tex={String.raw`U=\dfrac{\sigma_c}{\sigma_{cz}}+\dfrac{\sigma_{bcy}}{\sigma_{bgy}\,\alpha_y}+\dfrac{\sigma_{bcz}}{\sigma_{b0}\,\alpha_z}\le 1`} />
        <Eq n="8" tex={String.raw`\alpha_y=1-\dfrac{\sigma_c}{0.8\,\sigma_{ey}},\quad \alpha_z=1-\dfrac{\sigma_c}{0.8\,\sigma_{ez}},\quad \sigma_e=\dfrac{\pi^2E}{(l/r)^2}`} />
        <Table
          head={['項', '意味', '分母']}
          rows={[
            ['第1項', '軸力の使用割合', '全体座屈の許容値 σcz(② の答え)'],
            ['第2項', '強軸 y まわりの曲げの使用割合', '横倒れ座屈の許容値 σbgy × αy'],
            ['第3項', '弱軸 z まわりの曲げの使用割合', '曲げの基準値 σb0(= σy)× αz'],
          ]}
        />
        <Eq n="9" tex={String.raw`\text{安全率}=\dfrac{1}{U}`} />
        <Callout tone="warn" title="適用条件">
          αy &gt; 0、αz &gt; 0(σc が 0.8σe より小さいこと)。引張の軸力や局部座屈の照査は、別の式で確かめます。軸力が増えると α が小さくなり、曲げの使用割合が大きくなります。
        </Callout>
        <TabLink to="理論から設計式へ" label="この式の成り立ち(縁の応力と増幅)" go={go} />
        <MovieLink n={6} label="座屈の照査" onStage={onStage} />
      </Section>

      <div className="mt-8 flex flex-wrap">
        <TabLink to="計算してみる" label="数字を入れて確かめる" go={go} primary />
        <TabLink to="式の導出" label="理論式の導出から読む" go={go} />
      </div>
    </div>
  );
}
