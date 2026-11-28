import type { ReactNode } from 'react';
import { Tex } from '../ui/Tex.tsx';
import { P, Table } from './ui.tsx';

function H({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-10 scroll-mt-28 border-l-4 border-comp pl-3 text-[22px] font-bold leading-snug first:mt-6 sm:text-2xl">
      {children}
    </h2>
  );
}
function Sub({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[16px] font-bold text-ink">{children}</p>;
}
/* ---------- 記号 ---------- */

export default function Symbols() {
  const T = (s: string) => <Tex>{s}</Tex>;
  return (
    <div>
      <H>記号一覧</H>
      <P>ここは式に出てくる記号の一覧です。言葉の意味(降伏、残留応力、有効幅など)は、映像のページで点線の付いた言葉を押すと説明が出ます。</P>
      <P>応力は N/mm²、長さは mm。R・λ・低減率・α・U は無次元です。添え字 c = 圧縮、t = 引張。y・z は曲げ・座屈を評価する軸(y = 強軸、z = 弱軸)。</P>
      <Sub>共通・局部座屈</Sub>
      <Table
        head={['記号', '意味', '補足']}
        rows={[
          [T('\\sigma_y'), '降伏応力。永久変形が生じ始める応力', '鋼種で決まる'],
          [T('E'), '弾性係数(ヤング係数)。弾性変形のしにくさ', '鋼で約 2.0〜2.06×10⁵ N/mm²'],
          [T('\\nu'), 'ポアソン比。縦と横のひずみの比', '鋼で 0.3'],
          [T('b,\;t'), '板の幅(自由突出板では突出幅)、板厚', 't は腐食があれば腐食後の厚さ'],
          [T('k'), '板の座屈係数。支え方と波の形で決まる', '自由突出板 0.43、両縁支持板 4.0。安全率ではない'],
          [T('\\sigma_{el}'), '弾性局部座屈応力(理想の平板の理論値)', T('k\\pi^2E/\\{12(1-\\nu^2)\\}\\times(t/b)^2')],
          [T('R'), '幅厚比パラメータ。板の座屈しやすさ', T('\\sqrt{\\sigma_y/\\sigma_{el}}')],
          [T('\\sigma_{cl}'), '局部座屈の許容応力', 'σy × 低減率(R ≦ 0.7 で 1.0、R > 0.7 で 0.5/R²)'],
        ]}
      />
      <Sub>全体座屈</Sub>
      <Table
        head={['記号', '意味', '補足']}
        rows={[
          [T('l,\;L,\;\\beta'), '有効座屈長、部材長、有効座屈長係数', T('l=\\beta L') ],
          [T('r'), '断面二次半径。断面の曲げにくさの指標', T('\\sqrt{I/A}')],
          [T('I,\;A'), '断面二次モーメント、断面積', ''],
          [T('l/r'), '細長比', 'λ(細長比パラメータ)とは別の量。取り違えに注意'],
          [T('\\sigma_e'), 'オイラー座屈応力', T('\\pi^2E/(l/r)^2')],
          [T('\\lambda'), '細長比パラメータ', T('\\sqrt{\\sigma_y/\\sigma_e}=\\frac{1}{\\pi}\\sqrt{\\sigma_y/E}\\times l/r')],
          [T('\\sigma_{cg}'), '局部座屈を考慮しない全体座屈応力', 'σy × 低減率(λ の区分式)'],
          [T('\\sigma_{c0}'), 'σcg の上限値', '= σy'],
          [T('\\sigma_{cz}'), '局部座屈を考慮した全体座屈の許容値', T('\\sigma_{cg}\\times\\sigma_{cl}/\\sigma_{c0}')],
        ]}
      />
      <Sub>複合座屈(軸力+曲げ)</Sub>
      <Table
        head={['記号', '意味', '補足']}
        rows={[
          [T('\\sigma_c'), '平均の軸方向圧縮応力', '軸力を断面積で割った値'],
          [T('\\sigma_{bcy},\;\\sigma_{bcz}'), 'y 軸・z 軸まわりの曲げによる圧縮側の縁応力', '断面の端の応力'],
          [T('\\sigma_{bgy}'), '局部座屈を考慮しない横倒れ座屈の許容応力', '横にねじれて倒れる座屈'],
          [T('\\sigma_{b0}'), 'σbgy の上限となる曲げの基準応力', '= σy'],
          [T('\\sigma_{ey},\;\\sigma_{ez}'), 'y 軸・z 軸のオイラー座屈応力', T('\\pi^2E/(l/r)^2')],
          [T('\\alpha_y,\;\\alpha_z'), '軸力による付加曲げの影響を表す係数', T('1-\\sigma_c/(0.8\\sigma_e)')],
          ['0.8', 'オイラー座屈応力に掛ける係数', '安全側に評価するための係数'],
          [T('U'), '使用割合の合計(3項の和)', 'U ≦ 1 で OK。安全率 = 1/U'],
        ]}
      />
    </div>
  );
}
