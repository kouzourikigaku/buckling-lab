import { useState } from 'react';
import type { ReactNode } from 'react';
import { check, loadFactor } from '../physics/check.ts';
import type { CheckInput } from '../physics/check.ts';
import { Tex } from '../ui/Tex.tsx';
import { CurvesPair } from './figs.tsx';
import { P } from './ui.tsx';

function H({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-10 scroll-mt-28 border-l-4 border-comp pl-3 text-[22px] font-bold leading-snug first:mt-6 sm:text-2xl">
      {children}
    </h2>
  );
}
/* ---------- 計算してみる ---------- */

const DEFAULT: CheckInput = { sy: 235, E: 200000, nu: 0.3, b: 200, t: 12, k: 0.43, slenderY: 40, slenderZ: 70, sc: 40, sbcy: 30, sbcz: 20, sbgy: 140 };

function Num(props: { label: ReactNode; unit?: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-sm">{props.label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(props.value) ? props.value : ''}
          step={props.step ?? 1}
          onChange={(e) => props.onChange(Number(e.target.value))}
          className="num w-24 rounded-lg border border-studio-600 bg-white px-2 py-1.5 text-right text-base font-bold"
        />
        <span className="w-14 text-xs text-ink-dim">{props.unit}</span>
      </span>
    </label>
  );
}
function Out({ label, value, big, bad }: { label: ReactNode; value: string; big?: boolean; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-sm">{label}</span>
      <span className={`num font-bold ${big ? 'text-2xl' : 'text-base'} ${bad ? 'text-yield' : big ? 'text-comp' : ''}`}>{value}</span>
    </div>
  );
}

export default function Calc() {
  const [i, setI] = useState<CheckInput>(DEFAULT);
  const set = (p: Partial<CheckInput>) => setI((o) => ({ ...o, ...p }));
  const r = check(i);
  const lf = loadFactor(i);
  const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const T = (s: string) => <Tex>{s}</Tex>;
  return (
    <div>
      <H>数字を入れて、3つの照査を通してみる</H>
      <P>初めの値は説明用の仮定値です。応力は N/mm²、長さは mm。式の形は「3つの照査」のとおりです。</P>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-xl border border-studio-600 bg-studio-900 p-3">
            <p className="font-bold">材料</p>
            <Num label={<>降伏応力 {T('\\sigma_y')}</>} unit="N/mm²" value={i.sy} onChange={(v) => set({ sy: v })} />
            <Num label={<>弾性係数 {T('E')}</>} unit="N/mm²" value={i.E} step={1000} onChange={(v) => set({ E: v })} />
          </div>
          <div className="rounded-xl border border-studio-600 bg-studio-900 p-3">
            <p className="font-bold">① 板(局部座屈)</p>
            <Num label={<>板の幅 {T('b')}</>} unit="mm" value={i.b} onChange={(v) => set({ b: v })} />
            <Num label={<>板厚 {T('t')}(腐食後)</>} unit="mm" value={i.t} onChange={(v) => set({ t: v })} />
            <div className="mt-1 grid grid-cols-2 gap-2">
              {[
                [0.43, '自由突出板 k = 0.43'],
                [4, '両縁支持板 k = 4.0'],
              ].map(([k, t]) => (
                <button
                  key={k}
                  onClick={() => set({ k: k as number })}
                  aria-pressed={i.k === k}
                  className={`rounded-lg border px-2 py-2 text-sm font-bold ${i.k === k ? 'border-comp bg-studio-700' : 'border-studio-600 text-ink-dim'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-studio-600 bg-studio-900 p-3">
            <p className="font-bold">② 柱(全体座屈)</p>
            <Num label={<>細長比 {T('l_y/r_y')}(強軸)</>} value={i.slenderY} onChange={(v) => set({ slenderY: v })} />
            <Num label={<>細長比 {T('l_z/r_z')}(弱軸)</>} value={i.slenderZ} onChange={(v) => set({ slenderZ: v })} />
          </div>
          <div className="rounded-xl border border-studio-600 bg-studio-900 p-3">
            <p className="font-bold">③ 発生応力と、曲げの許容値</p>
            <Num label={<>軸方向圧縮応力 {T('\\sigma_c')}</>} unit="N/mm²" value={i.sc} onChange={(v) => set({ sc: v })} />
            <Num label={<>強軸まわりの曲げ {T('\\sigma_{bcy}')}</>} unit="N/mm²" value={i.sbcy} onChange={(v) => set({ sbcy: v })} />
            <Num label={<>弱軸まわりの曲げ {T('\\sigma_{bcz}')}</>} unit="N/mm²" value={i.sbcz} onChange={(v) => set({ sbcz: v })} />
            <Num label={<>横倒れ座屈の許容値 {T('\\sigma_{bgy}')}</>} unit="N/mm²" value={i.sbgy} onChange={(v) => set({ sbgy: v })} />
            <p className="text-xs text-ink-dim">曲げの基準値 σb0 は σy とします。σbgy は別途求めた値を入れてください。</p>
          </div>
          <button onClick={() => setI(DEFAULT)} className="rounded-lg border border-studio-600 px-3 py-2 text-sm text-ink-dim">
            初めの値に戻す
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border-2 border-studio-600 bg-studio-900 p-3">
            <p className="font-bold text-comp">① 局部座屈</p>
            <Out label={<>幅厚比 {T('b/t')}</>} value={f(i.b / i.t)} />
            <Out label={<>弾性局部座屈応力 {T('\\sigma_{el}')}</>} value={f(r.sel)} />
            <Out label={<>幅厚比パラメータ {T('R')}</>} value={f(r.R, 3)} />
            <Out label={<>低減率({r.R <= 0.7 ? 'R ≦ 0.7: 1.0' : 'R > 0.7: 0.5/R²'})</>} value={f(r.ratioL, 3)} />
            <Out label={<>局部座屈の許容値 {T('\\sigma_{cl}')}</>} value={f(r.scl)} big />
            <Out label={<>安全率 {T('\\sigma_{cl}/\\sigma_c')}</>} value={f(r.sfLocal, 2)} bad={r.sfLocal < 1} />
          </div>
          <div className="rounded-xl border-2 border-studio-600 bg-studio-900 p-3">
            <p className="font-bold text-comp">② 全体座屈</p>
            <Out label={<>細長比パラメータ {T('\\lambda')}(細長比の大きい軸)</>} value={f(r.lam, 3)} />
            <Out label={<>低減率({r.lam <= 0.2 ? 'λ ≦ 0.2' : r.lam <= 1 ? '0.2 < λ ≦ 1.0' : '1.0 < λ'})</>} value={f(r.ratioG, 3)} />
            <Out label={<>局部座屈を考慮しない {T('\\sigma_{cg}')}</>} value={f(r.scg)} />
            <Out label={<>× {T('\\sigma_{cl}/\\sigma_y')}(使える断面の割合)</>} value={`× ${f(r.ratioL, 3)}`} />
            <Out label={<>全体座屈の許容値 {T('\\sigma_{cz}')}</>} value={f(r.scz)} big />
            <Out label={<>安全率 {T('\\sigma_{cz}/\\sigma_c')}</>} value={f(r.sfGlobal, 2)} bad={r.sfGlobal < 1} />
          </div>
          <div className={`rounded-xl border-2 bg-studio-900 p-3 ${r.valid ? 'border-studio-600' : 'border-yield'}`}>
            <p className="font-bold text-comp">③ 複合座屈(軸力+曲げ)</p>
            <Out label={<>オイラー座屈応力 {T('\\sigma_{ey}')} / {T('\\sigma_{ez}')}</>} value={`${f(r.sey, 0)} / ${f(r.sez, 0)}`} />
            <Out label={<>{T('\\alpha_y')} / {T('\\alpha_z')}</>} value={`${f(r.alphaY, 3)} / ${f(r.alphaZ, 3)}`} bad={!r.valid} />
            {r.valid ? (
              <>
                <Out label="第1項 軸力の使用割合" value={f(r.u1, 3)} />
                <Out label="第2項 強軸まわりの曲げ" value={f(r.u2, 3)} />
                <Out label="第3項 弱軸まわりの曲げ" value={f(r.u3, 3)} />
                <Out label={<>使用割合の合計 {T('U')}(1 以下で OK)</>} value={f(r.U, 3)} big bad={r.U > 1} />
                <Out label={<>安全率 {T('1/U')}</>} value={f(r.sfCombined, 2)} bad={r.U > 1} />
                <Out label="参考: 荷重を同じ割合で増やせる倍率" value={f(lf, 2)} />
                <p className="mt-1 text-xs text-ink-dim">軸力が増えると α が小さくなるので、余裕があるとき「増やせる倍率」は 1/U より小さくなります(質問と回答 Q11)。</p>
              </>
            ) : (
              <p className="mt-1 text-sm font-bold text-yield">α が 0 以下です(σc が 0.8σe 以上)。この照査式の適用範囲外で、安全率は解釈しません(質問と回答 Q10)。</p>
            )}
          </div>
        </div>
      </div>
      <CurvesPair n="計" lam={r.lam} R={r.R} />
    </div>
  );
}

