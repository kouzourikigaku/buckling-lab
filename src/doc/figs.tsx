import { useEffect, useRef, useState } from 'react';
import { solveColumn } from '../physics/column.ts';
import { dohshiOld, eurocode } from '../physics/curves.ts';
import { plateStrength, plateWinter } from '../physics/plate.ts';
import { edgeParts, edgeYieldMoment, etaFromImp, idealColumn, idealPlate, perry } from '../physics/theory.ts';
import { FitTex } from '../ui/Tex.tsx';
import { Legend, Plot } from './Plot.tsx';
import { C, Fig, Knob, Seg, useNarrow } from './ui.tsx';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const E = 200000;

/* ================= 図: 照査の流れ ================= */

function Node(props: { k: string; tex?: string; tone?: 'in' | 'mid' | 'out' }) {
  const t = props.tone ?? 'mid';
  const cls = t === 'in' ? 'border-studio-600 bg-studio-800' : t === 'out' ? 'border-comp bg-comp text-white' : 'border-studio-600 bg-studio-900';
  return (
    <div className={`min-w-0 rounded-lg border-2 px-2 py-1.5 text-center ${cls}`}>
      <p className="text-[11px] font-bold leading-tight opacity-80">{props.k}</p>
      {props.tex && (
        <FitTex className="text-sm">{props.tex}</FitTex>
      )}
    </div>
  );
}
const Arrow = () => <span className="self-center text-lg font-bold text-ink-dim">→</span>;

export function FigFlow({ onJump }: { onJump?: (id: string) => void }) {
  const row = (no: string, title: string, id: string, nodes: React.ReactNode[]) => (
    <button onClick={() => onJump?.(id)} className="block w-full rounded-xl border border-studio-600 bg-studio-950/60 p-2 text-left">
      <p className="text-sm font-bold text-comp">
        {no} {title}
      </p>
      <div className="mt-1 flex flex-wrap items-stretch gap-1.5">
        {nodes.flatMap((n, i) => (i ? [<Arrow key={`a${i}`} />, n] : [n]))}
      </div>
    </button>
  );
  return (
    <Fig n="1-1" title="3つの照査のつながり(押すと、その節へ)">
      <div className="space-y-2">
        {row('①', '局部座屈(軸力のみ)', 'ov-local', [
          <Node key="1" k="板の寸法・材料" tex="b,\,t,\,k,\,\sigma_y" tone="in" />,
          <Node key="2" k="幅厚比パラメータ" tex="R" />,
          <Node key="3" k="低減率" tex="1.0\ /\ 0.5/R^2" />,
          <Node key="4" k="局部座屈の許容値" tex="\sigma_{cl}" tone="out" />,
        ])}
        <p className="pl-4 text-xs font-bold text-violet-700">↓ σcl/σy(使える断面の割合)を ② に掛ける</p>
        {row('②', '全体座屈(軸力のみ)', 'ov-global', [
          <Node key="1" k="細長比・材料" tex="l/r,\,\sigma_y" tone="in" />,
          <Node key="2" k="細長比パラメータ" tex="\lambda" />,
          <Node key="3" k="全体座屈応力" tex="\sigma_{cg}" />,
          <Node key="4" k="全体座屈の許容値" tex="\sigma_{cz}=\sigma_{cg}\tfrac{\sigma_{cl}}{\sigma_y}" tone="out" />,
        ])}
        <p className="pl-4 text-xs font-bold text-violet-700">↓ σcz を ③ の第1項の分母に使う</p>
        {row('③', '複合座屈(軸力+曲げ)', 'ov-comb', [
          <Node key="1" k="発生応力" tex="\sigma_c,\,\sigma_{bc}" tone="in" />,
          <Node key="2" k="付加曲げの係数" tex="\alpha" />,
          <Node key="3" k="使用割合の合計" tex="U" />,
          <Node key="4" k="安全率" tex="1/U" tone="out" />,
        ])}
      </div>
    </Fig>
  );
}

/* ================= 図: 曲がった柱の釣合い ================= */

/** 点 (px, py) のまわりの円弧の矢印。角度は度(右=0、上=90)。ccw: 左回り */
function ArcArrow(props: { px: number; py: number; r: number; from: number; to: number; ccw: boolean; color: string; w?: number }) {
  const { px, py, r, from, to, ccw, color } = props;
  const rad = (d: number) => (d * Math.PI) / 180;
  const pt = (d: number) => [px + r * Math.cos(rad(d)), py - r * Math.sin(rad(d))];
  const [x0, y0] = pt(from);
  const [x1, y1] = pt(to);
  const span = Math.abs(to - from);
  // 終点での進む向き(画面座標)
  const t = rad(to);
  const dir = ccw ? [-Math.sin(t), -Math.cos(t)] : [Math.sin(t), Math.cos(t)];
  const nx = -dir[1];
  const ny = dir[0];
  const hl = 11;
  const hw = 6;
  const tip = [x1 + dir[0] * 4, y1 + dir[1] * 4];
  const head = `${tip[0]},${tip[1]} ${tip[0] - dir[0] * hl + nx * hw},${tip[1] - dir[1] * hl + ny * hw} ${tip[0] - dir[0] * hl - nx * hw},${tip[1] - dir[1] * hl - ny * hw}`;
  return (
    <g>
      <path d={`M ${x0} ${y0} A ${r} ${r} 0 ${span > 180 ? 1 : 0} ${ccw ? 0 : 1} ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={props.w ?? 3.5} />
      <polygon points={head} fill={color} />
    </g>
  );
}

/** まっすぐな矢印(x1,y1 が先端) */
function Arr(props: { x0: number; y0: number; x1: number; y1: number; color: string; w?: number }) {
  const { x0, y0, x1, y1, color } = props;
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 3) return null;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const hl = Math.min(10, len * 0.6);
  const hw = 5;
  return (
    <g>
      <line x1={x0} y1={y0} x2={x1 - ux * hl * 0.8} y2={y1 - uy * hl * 0.8} stroke={color} strokeWidth={props.w ?? 3} />
      <polygon points={`${x1},${y1} ${x1 - ux * hl - uy * hw},${y1 - uy * hl + ux * hw} ${x1 - ux * hl + uy * hw},${y1 - uy * hl - ux * hw}`} fill={color} />
    </g>
  );
}

const EQ_STEPS: [number, string][] = [
  [0, '① 切り出す'],
  [1, '② 外力が回す'],
  [2, '③ 柱が踏ん張る'],
  [3, '④ 釣り合う'],
];

export function FigColumnEq() {
  const [xr, setXr] = useState(0.4);
  const [step, setStep] = useState(0);
  const narrow = useNarrow();
  const W = narrow ? 360 : 560;
  const H = 400;
  const top = 50;
  const bot = H - 34;
  const L = bot - top;
  const cx = narrow ? 70 : 170;
  const A = narrow ? 76 : 86;
  const X = (r: number) => cx + A * Math.sin(Math.PI * r);
  const Y = (r: number) => bot - L * r;
  const path = (r0: number, r1: number) =>
    Array.from({ length: 41 }, (_, i) => {
      const r = r0 + ((r1 - r0) * i) / 40;
      return `${X(r)},${Y(r)}`;
    }).join(' ');
  const px = X(xr);
  const py = Y(xr);
  const sinv = Math.sin(Math.PI * xr);
  const ratio = sinv; // ずれ y・曲がり具合 1/R とも、最大の何割か
  // 曲がりの円(曲率中心は左=内側)
  const d1 = ((A * Math.PI) / L) * Math.cos(Math.PI * xr);
  const kap = ((A * Math.PI * Math.PI) / (L * L)) * sinv / (1 + d1 * d1) ** 1.5;
  const R = 1 / Math.max(kap, 1e-6);
  const tx = -d1;
  const tn = Math.hypot(1, d1);
  // 曲線の接線(上向き): (d1, -1)/tn。内側の法線: (-1, -d1)/tn
  const nX = -1 / tn;
  const nY = -d1 / tn;
  void tx;
  const ccx = px + nX * R;
  const ccy = py + nY * R;
  const arcHalf = Math.min(0.9, 70 / R);
  const a0 = Math.atan2(py - ccy, px - ccx);
  const arcPts = Array.from({ length: 31 }, (_, i) => {
    const a = a0 - arcHalf + (2 * arcHalf * i) / 30;
    return `${ccx + R * Math.cos(a)},${ccy + R * Math.sin(a)}`;
  }).join(' ');
  const arcEnd = [ccx + R * Math.cos(a0 - arcHalf), ccy + R * Math.sin(a0 - arcHalf)];
  const mag = 0.35 + 0.65 * ratio; // 回す矢印の大きさ(見やすさのため下限あり)
  const fs = narrow ? 12 : 13;
  const s1 = step >= 1;
  const s2 = step >= 2;
  const s3 = step >= 3;
  const springs = [-28, -14, 14, 28];

  const texts = [
    <>
      高さ x で柱を輪切りにして、<b>上の部分だけ</b>を取り出します。柱は止まっているので、取り出した上の部分も止まっている。つまり、上の部分にかかる力は、押す・回すの両方で釣り合っているはずです。
    </>,
    <>
      上の部分には、上端で外力 <b>P が真下</b>に(濃紺)、切り口で下の部分から <b>P が真上</b>に(灰)かかります。同じ大きさ・逆向きなので、押す力は打ち消し合う。ところが2本は横に <b>y</b> だけずれているので、上の部分を<b style={{ color: C.orange }}>左回りに回そうとします</b>(オレンジ)。回す強さは「力 × ずれ」で <b>P × y</b>。これが外力のモーメントです。
    </>,
    <>
      切り口では、押す力による一様な縮みに上乗せして、曲がりの<b>内側(左)の鉄はさらに縮んで押し返し</b>、<b>外側(右)の鉄は縮みが減って(伸びる向きに)引き戻します</b>(青の小さな矢印。曲げの分だけを描いています)。左が上向き、右が下向きの力の組なので、上の部分を<b style={{ color: C.blue }}>右回りに回そうとします</b>(青)。強さは「硬さ × 断面の形 × 曲がり具合」で <b>EI × 1/R</b>(R は紫の円の半径。きつく曲がるほど R が小さく、踏ん張りが大きい)。
    </>,
    <>
      上の部分が回らない = <b style={{ color: C.orange }}>左回り</b>と<b style={{ color: C.blue }}>右回り</b>が同じ強さ。だから <b>P × y = EI × 1/R</b>。「逆方向に釣り合う」とは、この2つの回す向きが逆で、大きさが等しいことです。
      式の <b>−</b> は向きを表す記号ではなく、y″ の符号を直すためのものです。このカーブは右へ膨らんで戻る山なりなので、y″(y を高さで2回微分した値)はマイナス。曲がり具合 1/R はプラスの量なので <b>1/R = −y″</b>。こうして <b>P·y = −EI·y″</b> になります。
    </>,
  ];

  return (
    <Fig
      n="2-1"
      title="曲がった柱を輪切りにして、上の部分の釣合いを見る"
      caption="両端ピンの柱が、座屈荷重でわずかに曲がった状態(サインカーブ)。曲がりの大きさは見やすく誇張しています。切り口の灰の矢印は、P を支える一様な押し返し(断面全体の合計)を中心に1本で描いたもの。青の小さな矢印は、そこに上乗せされる曲げの分だけを描いています。"
    >
      <Seg value={step} options={EQ_STEPS} onChange={setStep} />
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block w-full" role="img" aria-label="曲がった柱の上の部分の釣合い">
        {/* 元の軸 */}
        <line x1={cx} y1={top} x2={cx} y2={bot} stroke={C.gray} strokeDasharray="4 4" />
        {/* 下の部分(外す) */}
        <polyline points={path(0, xr)} fill="none" stroke={C.blue} strokeWidth={6} strokeLinecap="round" opacity={0.18} />
        <polygon points={`${cx},${bot} ${cx - 10},${bot + 16} ${cx + 10},${bot + 16}`} fill={C.ink} opacity={0.25} />
        <text x={cx + 16} y={bot - 4} fontSize={fs} fill={C.dim}>
          下の部分(外す)
        </text>
        {/* 上の部分 */}
        <polyline points={path(xr, 1)} fill="none" stroke={C.blue} strokeWidth={7} strokeLinecap="round" />
        <polygon points={`${cx},${top} ${cx - 10},${top - 14} ${cx + 10},${top - 14}`} fill={C.ink} />
        {/* 切り口 */}
        <line x1={px - 32} y1={py} x2={px + 32} y2={py} stroke={C.violet} strokeWidth={3} />
        {!s1 && (
          <text x={px + 32} y={py + 4} fontSize={fs} fill={C.violet} fontWeight={700}>
            ここで輪切り(高さ x)
          </text>
        )}
        {/* ② 外力 P と、切り口で支える P、腕 y */}
        {s1 && (
          <g>
            <Arr x0={cx} y0={4} x1={cx} y1={top - 16} color={C.navy} w={4} />
            <text x={cx + 10} y={20} fontSize={fs + 1} fill={C.navy} fontWeight={700}>
              外力 P
            </text>
            <Arr x0={px} y0={py + 33} x1={px} y1={py + 3} color={C.gray} w={4} />
            <text x={px + 40} y={py + 94} fontSize={fs} fill={C.dim} fontWeight={700}>
              ↑ 下から支える P(灰)
            </text>
            <line x1={cx} y1={py} x2={px} y2={py} stroke={C.orange} strokeWidth={3} />
            <line x1={cx} y1={py - 7} x2={cx} y2={py + 7} stroke={C.orange} strokeWidth={2} />
            <text x={(cx + px) / 2} y={py - 9} fontSize={fs + 1} fill={C.orange} fontWeight={700} textAnchor="middle">
              y
            </text>
            <ArcArrow px={px} py={py} r={40} from={-55} to={55 * mag} ccw color={C.orange} />
            <text x={px + 22} y={py - 52} fontSize={fs + 1} fill={C.orange} fontWeight={700}>
              左回り P × y
            </text>
          </g>
        )}
        {/* ③ 切り口の踏ん張り(曲げの分)と曲がりの円 */}
        {s2 && (
          <g>
            {springs.map((o) => {
              const l = Math.abs(o) * 1.4 * (0.3 + 0.7 * ratio);
              const x = px + o;
              return o < 0 ? <Arr key={o} x0={x} y0={py + l + 4} x1={x} y1={py + 2} color={C.blue} w={2.5} /> : <Arr key={o} x0={x} y0={py - 2} x1={x} y1={py + l + 2} color={C.blue} w={2.5} />;
            })}
            <ArcArrow px={px} py={py} r={62} from={55 * mag} to={-55} ccw={false} color={C.blue} />
            <text x={px + 40} y={py + 72} fontSize={fs + 1} fill={C.blue} fontWeight={700}>
              右回り EI × 1/R
            </text>
            {['内側:さらに', '縮んで押す', '外側:縮みが', '減って引く'].map((t, i) => (
              <text key={t} x={px - 38} y={py + 20 + i * (fs + 3)} fontSize={fs - 1} fill={C.blue} textAnchor="end">
                {t}
              </text>
            ))}
            <polyline points={arcPts} fill="none" stroke={C.violet} strokeWidth={2} strokeDasharray="5 4" />
            <text x={arcEnd[0] + 6} y={arcEnd[1] - 4} fontSize={fs} fill={C.violet} fontWeight={700}>
              曲がりの円(半径 R)
            </text>
          </g>
        )}
        {/* ④ 釣合い */}
        {s3 && (
          <g fontSize={fs + 1} fontWeight={700}>
            <rect x={W - (narrow ? 172 : 250)} y={top - 4} width={narrow ? 166 : 240} height={58} rx={10} fill="#ffffff" stroke={C.ink} />
            <text x={W - (narrow ? 89 : 130)} y={top + 18} textAnchor="middle">
              <tspan fill={C.orange}>P × y</tspan>
              <tspan fill={C.ink}> = </tspan>
              <tspan fill={C.blue}>EI × 1/R</tspan>
            </text>
            <text x={W - (narrow ? 89 : 130)} y={top + 42} textAnchor="middle" fill={C.ink}>
              = −EI × y″
            </text>
          </g>
        )}
      </svg>
      <p className="mt-1 text-[15px] leading-relaxed">{texts[step]}</p>
      {s3 && (
        <div className="mt-2 space-y-1 text-sm">
          <p className="font-bold">この高さでの大きさ(柱の真ん中を 100% とする)</p>
          {[
            ['外力が回す P × y', C.orange],
            ['柱が踏ん張る EI × 1/R', C.blue],
          ].map(([t, c]) => (
            <div key={t} className="flex items-center gap-2">
              <span className="w-40 shrink-0" style={{ color: c }}>
                {t}
              </span>
              <span className="h-3 rounded" style={{ width: `${ratio * 45}%`, background: c }} />
              <span className="num">{pct(ratio)}</span>
            </div>
          ))}
          <p className="text-[13px] text-ink-dim">
            ずれ y も曲がり具合 1/R も、サインカーブでは高さによって同じ割合で変わる。だから座屈荷重のときは、どの高さで切っても2つが等しい。荷重がそれより小さいと右回り(踏ん張り)が勝って、まっすぐに戻る。
          </p>
        </div>
      )}
      <Knob label="輪切りにする高さ x / l" value={xr} min={0.1} max={0.9} step={0.01} show={xr.toFixed(2)} color={C.violet} onChange={setXr} />
    </Fig>
  );
}

/* ================= 図: 座屈の形と荷重 ================= */

export function FigModes() {
  const W = 520;
  const H = 230;
  const shape = (cx: number, n: number) =>
    Array.from({ length: 81 }, (_, i) => `${cx + 26 * Math.sin((n * Math.PI * i) / 80)},${H - 34 - (150 * i) / 80}`).join(' ');
  return (
    <Fig n="2-2" title="曲がったまま釣り合える形は、波の数 n ごとに決まる" caption="kl = nπ のときだけ、曲がった形でも釣り合える。荷重は n² に比例し、いちばん小さい n = 1 が座屈荷重になる。n = 2 以上は、途中を横から押さえない限り現れない。">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="座屈の形">
        {[1, 2, 3].map((n, i) => {
          const cx = 100 + i * 160;
          return (
            <g key={n}>
              <line x1={cx} y1={H - 34} x2={cx} y2={H - 184} stroke={C.gray} strokeDasharray="4 4" />
              <polyline points={shape(cx, n)} fill="none" stroke={n === 1 ? C.blue : C.gray} strokeWidth={4} />
              <text x={cx} y={H - 12} fontSize={14} textAnchor="middle" fontWeight={700} fill={n === 1 ? C.blue : C.dim}>
                n = {n}:{n === 1 ? ' Pe' : ` ${n * n}Pe`}
              </text>
              <text x={cx} y={24} fontSize={12} textAnchor="middle" fill={C.dim}>
                半波 {n} つ
              </text>
            </g>
          );
        })}
      </svg>
    </Fig>
  );
}

/* ================= 図: 板を帯の集まりとみなす ================= */

export function FigStrip() {
  const W = 520;
  const H = 230;
  const x0 = 60;
  const x1 = 380;
  const y0 = 40;
  const y1 = 190;
  const strips = 10;
  return (
    <Fig n="2-3" title="長い板を、押す向きに並んだ「帯(細い柱)」の集まりとみなす" caption="帯1本は、幅1・厚さ t の長方形断面の柱。波1つの長さ(≒ 板の幅 b)を柱の長さとみなすと、オイラー式から出発できる。ただし帯は隣とつながっていて横向きに自由に変形できず(ポアソン効果が抑えられる。× 1/(1−ν²))、両側の縁が支えられている(× k)。">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="板と帯">
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="#eef2f8" stroke={C.axis} />
        {Array.from({ length: strips - 1 }, (_, i) => (
          <line key={i} x1={x0} y1={y0 + ((i + 1) * (y1 - y0)) / strips} x2={x1} y2={y0 + ((i + 1) * (y1 - y0)) / strips} stroke={C.grid} />
        ))}
        <rect x={x0} y={y0 + (4 * (y1 - y0)) / strips} width={x1 - x0} height={(y1 - y0) / strips} fill={C.blue} opacity={0.35} />
        <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={C.green} strokeWidth={5} />
        <line x1={x0} y1={y1} x2={x1} y2={y1} stroke={C.green} strokeWidth={5} />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <polygon points={`${x0 - 26},${y0 + 30 + i * 45} ${x0 - 6},${y0 + 38 + i * 45} ${x0 - 26},${y0 + 46 + i * 45}`} fill={C.red} />
            <polygon points={`${x1 + 26},${y0 + 30 + i * 45} ${x1 + 6},${y0 + 38 + i * 45} ${x1 + 26},${y0 + 46 + i * 45}`} fill={C.red} />
          </g>
        ))}
        <path
          d={Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${x0 + ((x1 - x0) * i) / 40},${y0 + (y1 - y0) / 2 - 18 * Math.sin((2 * Math.PI * i) / 40)}`).join(' ')}
          fill="none"
          stroke={C.red}
          strokeDasharray="5 4"
          strokeWidth={2}
        />
        <g fontSize={13} fontWeight={700}>
          <text x={x1 + 34} y={y0 + 4} fill={C.green}>
            縁: 支えられている
          </text>
          <text x={x1 + 34} y={y0 + 22} fill={C.green}>
            (係数 k に入る)
          </text>
          <text x={x1 + 34} y={y0 + 92} fill={C.blue}>
            帯1本 = 柱
          </text>
          <text x={x1 + 34} y={y0 + 110} fill={C.dim}>
            I = t³/12、A = t
          </text>
          <text x={x1 + 34} y={y0 + 128} fill={C.dim}>
            r = t/√12
          </text>
          <text x={(x0 + x1) / 2} y={y1 + 30} fill={C.red} textAnchor="middle">
            赤い破線: 波打ち(波1つの長さ ≒ b)
          </text>
          <line x1={x0 - 40} y1={y0} x2={x0 - 40} y2={y1} stroke={C.ink} />
          <text x={x0 - 46} y={(y0 + y1) / 2 + 4} fill={C.ink} textAnchor="end">
            b
          </text>
        </g>
      </svg>
    </Fig>
  );
}

/* ================= 図: λ の目盛り ================= */

export function FigLambdaRuler() {
  const [lr, setLr] = useState(80);
  const [sy, setSy] = useState(235);
  const base = Math.PI * Math.sqrt(E / sy);
  const lam = lr / base;
  const narrow = useNarrow();
  const W = narrow ? 360 : 600;
  const H = 120;
  const X = (v: number) => 20 + (Math.min(2.2, v) / 2.2) * (W - 40);
  return (
    <Fig n="2-4" title="λ は「σe = σy になる基準の柱」の何倍細長いか" caption="基準の柱の細長比は π√(E/σy)。鋼が強い(σy が大きい)ほど基準の柱は太く短くなり、同じ l/r でも λ は大きくなる。">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="λ の目盛り">
        <rect x={X(0)} y={34} width={X(1) - X(0)} height={26} fill="#fde7c8" />
        <rect x={X(1)} y={34} width={X(2.2) - X(1)} height={26} fill="#dbeafe" />
        <text x={(X(0) + X(1)) / 2} y={52} fontSize={13} textAnchor="middle" fontWeight={700} fill={C.orange}>
          λ &lt; 1: 先に降伏
        </text>
        <text x={(X(1) + X(2.2)) / 2} y={52} fontSize={13} textAnchor="middle" fontWeight={700} fill={C.blue}>
          λ &gt; 1: 先に弾性座屈
        </text>
        <line x1={X(0)} y1={74} x2={X(2.2)} y2={74} stroke={C.ink} strokeWidth={1.5} />
        {[0, 0.5, 1, 1.5, 2].map((v) => (
          <g key={v}>
            <line x1={X(v)} y1={70} x2={X(v)} y2={78} stroke={C.ink} />
            <text x={X(v)} y={94} fontSize={12} textAnchor="middle" fill={C.dim}>
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        <circle cx={X(lam)} cy={74} r={8} fill={C.red} stroke="#fff" strokeWidth={2} />
        <text x={X(lam)} y={24} fontSize={14} textAnchor="middle" fontWeight={700} fill={C.red}>
          λ = {lam.toFixed(2)}
        </text>
        <text x={X(1)} y={112} fontSize={12} textAnchor="middle" fill={C.dim}>
          基準の柱(l/r = {base.toFixed(1)})
        </text>
      </svg>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Knob label="細長比 l/r" value={lr} min={10} max={200} step={1} show={String(lr)} color={C.red} onChange={setLr} />
        <Knob label="降伏応力 σy" value={sy} min={205} max={450} step={5} show={`${sy} N/mm²`} color={C.orange} onChange={setSy} />
      </div>
    </Fig>
  );
}

/* ================= 図: σy で割ると1本になる ================= */

const STEELS = [
  { sy: 235, name: 'σy = 235', color: C.blue },
  { sy: 355, name: 'σy = 355', color: C.violet },
  { sy: 450, name: 'σy = 450', color: C.orange },
];

export function FigCollapse({ n }: { n: string }) {
  const [norm, setNorm] = useState(false);
  const [t, setT] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const goal = norm ? 1 : 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((v) => {
        const nv = v + Math.sign(goal - v) * dt * 1.1;
        if ((goal - nv) * (goal - v) <= 0) return goal;
        raf.current = requestAnimationFrame(tick);
        return nv;
      });
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [norm]);
  const narrow = useNarrow();
  const W = narrow ? 360 : 600;
  const H = narrow ? 270 : 320;
  const fs = narrow ? 12 : 13;
  const m = { l: narrow ? 44 : 54, r: 12, t: 20, b: 42 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const ease = t * t * (3 - 2 * t);
  const sx = (lr: number, lam: number) => m.l + pw * ((1 - ease) * (lr / 250) + ease * (lam / 2.5));
  const sy = (sig: number, s: number) => H - m.b - ph * ((1 - ease) * (sig / 500) + ease * (s / 1.2));
  return (
    <Fig
      n={n}
      title="鋼の強さが違うと線も違う。σy で割ると、1本の線になる"
      caption="理想の柱の強さ = min(σy, σe)。左のままでは、鋼の種類ごとに別の線が要る。縦を σy で割り、横を λ = √(σy/σe) にすると、どの鋼も σcr/σy = min(1, 1/λ²) の同じ線に重なる。これが、座屈の式が「σy × 低減率(λ)」の形をしている理由。"
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="鋼種による座屈曲線と無次元化">
        {[0, 100, 200, 300, 400, 500].map((v) => (
          <g key={`p${v}`} opacity={1 - ease}>
            <line x1={m.l} y1={H - m.b - ph * (v / 500)} x2={W - m.r} y2={H - m.b - ph * (v / 500)} stroke={C.grid} />
            <text x={m.l - 6} y={H - m.b - ph * (v / 500) + 4} fontSize={fs} textAnchor="end" fill={C.dim}>
              {v}
            </text>
          </g>
        ))}
        {[0, 50, 100, 150, 200, 250].map((v) => (
          <text key={`px${v}`} x={m.l + pw * (v / 250)} y={H - m.b + fs + 4} fontSize={fs} textAnchor="middle" fill={C.dim} opacity={1 - ease}>
            {v}
          </text>
        ))}
        {[0, 0.5, 1].map((v) => (
          <g key={`n${v}`} opacity={ease}>
            <line x1={m.l} y1={H - m.b - ph * (v / 1.2)} x2={W - m.r} y2={H - m.b - ph * (v / 1.2)} stroke={C.grid} />
            <text x={m.l - 6} y={H - m.b - ph * (v / 1.2) + 4} fontSize={fs} textAnchor="end" fill={C.dim}>
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {[0, 0.5, 1, 1.5, 2, 2.5].map((v) => (
          <text key={`nx${v}`} x={m.l + pw * (v / 2.5)} y={H - m.b + fs + 4} fontSize={fs} textAnchor="middle" fill={C.dim} opacity={ease}>
            {v}
          </text>
        ))}
        <line x1={m.l} y1={H - m.b} x2={W - m.r} y2={H - m.b} stroke={C.axis} />
        <line x1={m.l} y1={m.t - 8} x2={m.l} y2={H - m.b} stroke={C.axis} />
        <text x={m.l + 4} y={m.t - 8} fontSize={fs} fontWeight={700} fill={C.ink}>
          {ease < 0.5 ? '座屈する応力 σcr(N/mm²)' : '降伏に対する割合 σcr/σy'}
        </text>
        <text x={(m.l + W - m.r) / 2} y={H - 6} fontSize={fs} fontWeight={700} textAnchor="middle" fill={C.ink}>
          {ease < 0.5 ? '細長比 l/r' : '細長比パラメータ λ'}
        </text>
        {STEELS.map((s, k) => {
          const base = Math.PI * Math.sqrt(E / s.sy);
          const pts = Array.from({ length: 200 }, (_, i) => {
            const lr = 1 + (249 * i) / 199;
            const lam = lr / base;
            const sig = Math.min(s.sy, (Math.PI ** 2 * E) / (lr * lr));
            if (lam > 2.5 && ease > 0.98) return null;
            return `${sx(lr, Math.min(lam, 2.6)).toFixed(1)},${sy(sig, sig / s.sy).toFixed(1)}`;
          }).filter(Boolean);
          return <polyline key={k} points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={ease > 0.98 ? 3.5 - k * 0.8 : 2.6} opacity={ease > 0.98 && k > 0 ? 0.9 : 1} />;
        })}
        {ease < 0.3 &&
          STEELS.map((s, k) => (
            <text key={k} x={m.l + pw * 0.04} y={H - m.b - ph * (s.sy / 500) - 6} fontSize={fs} fontWeight={700} fill={s.color}>
              {s.name}
            </text>
          ))}
        {ease > 0.98 && (
          <text x={m.l + pw * (1.5 / 2.5)} y={H - m.b - ph * (0.62 / 1.2)} fontSize={fs} fontWeight={700} fill={C.ink}>
            3本が重なる: min(1, 1/λ²)
          </text>
        )}
      </svg>
      <Seg value={norm} options={[[false, 'そのまま(N/mm²)'], [true, 'σy で割る(無次元)']]} onChange={setNorm} />
    </Fig>
  );
}

/* ================= 図: 初期たわみの柱(ペリー・ロバートソン) ================= */

const IMPS: [number, string][] = [
  [0, 'なし'],
  [5000, 'L/5000'],
  [1000, 'L/1000'],
  [500, 'L/500'],
  [250, 'L/250'],
];

export function FigPerry({ n }: { n: string }) {
  const [imp, setImp] = useState(1000);
  const [lam, setLam] = useState(1);
  const [design, setDesign] = useState(false);
  const eOverFy = E / 235;
  const f = (l: number) => (imp ? perry(l, etaFromImp(l, imp, eOverFy)) : idealColumn(l));
  const s = f(lam);
  const eta = imp ? etaFromImp(lam, imp, eOverFy) : 0;
  const parts = edgeParts(s, lam, eta);
  let gap = 0;
  let gapAt = 1;
  for (let l = 0.05; l < 2.5; l += 0.01) {
    const d = idealColumn(l) - f(l);
    if (d > gap) {
      gap = d;
      gapAt = l;
    }
  }
  const seg = (w: number, color: string, label: string) => (
    <div className="flex h-full items-center justify-center overflow-hidden text-[11px] font-bold text-white" style={{ width: `${Math.max(0, w) * 100}%`, background: color }} title={label}>
      {w > 0.12 ? label : ''}
    </div>
  );
  return (
    <Fig
      n={n}
      title="初期たわみのある柱: 縁が降伏する平均応力(ペリー・ロバートソンの式)"
      caption="橙の破線が理想の柱、紫が初期たわみを入れた理論値。曲がりのない理想の柱との差は λ = 1 の付近でいちばん大きい。計算は σy = 235 N/mm²、E = 2.0×10⁵ N/mm²、長方形断面(c/r = √3)とした例。"
    >
      <Plot
        aria="ペリー・ロバートソンの式"
        x={[0, 2.5]}
        y={[0, 1.15]}
        xTicks={[0, 0.5, 1, 1.5, 2, 2.5]}
        yTicks={[0, 0.25, 0.5, 0.75, 1]}
        xLabel="細長比パラメータ λ"
        yLabel="σcr/σy"
        xHint={['← 太く短い柱', '細く長い柱 →']}
        yHint="耐えられる力(強さ)→"
        yFmt={(v) => v.toFixed(2)}
        series={[
          { f: idealColumn, color: C.orange, dash: '6 5', width: 2.2 },
          ...(design ? [{ f: dohshiOld, color: C.navy, width: 2.6 }] : []),
          { f, color: C.violet, width: 3 },
        ]}
        vlines={[[lam, C.red]]}
        dots={[
          [lam, s, C.red, 6],
          ...(imp ? ([[gapAt, f(gapAt), C.violet, 4]] as [number, number, string, number][]) : []),
        ]}
        notes={imp ? [[gapAt - 0.08, f(gapAt) - 0.12, `理想との差が最大(λ≒${gapAt.toFixed(2)})`, C.violet, 'end']] : []}
      />
      <Legend items={[[C.orange, '理想の柱 min(1, 1/λ²)', '6 5'], [C.violet, '初期たわみを入れた理論値'], ...(design ? ([[C.navy, '設計式(道示・平成24年版まで)']] as [string, string][]) : [])]} />
      <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-bold">初期たわみ v₀</p>
          <Seg value={imp} options={IMPS} onChange={setImp} />
          <Seg value={design} options={[[false, '理論だけ'], [true, '設計式も重ねる']]} onChange={setDesign} />
        </div>
        <Knob label="見る柱の細長比パラメータ λ" value={lam} min={0.1} max={2.4} step={0.01} show={lam.toFixed(2)} color={C.red} onChange={setLam} />
      </div>
      <div className="mt-3 rounded-lg border border-studio-600 p-2">
        <p className="text-sm font-bold">
          λ = {lam.toFixed(2)} の柱の縁の応力(限界のとき、合計 = σy)
        </p>
        <div className="mt-1 flex h-7 w-full overflow-hidden rounded">
          {seg(parts.axial, C.blue, `平均応力 ${pct(parts.axial)}`)}
          {seg(parts.bend, '#fb923c', `たわみの曲げ ${pct(parts.bend)}`)}
          {seg(parts.extra, C.orange, `増幅分 ${pct(parts.extra)}`)}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-dim">
          平均応力 {pct(parts.axial)} + 初期たわみによる曲げ {pct(parts.bend)} + 軸力による増幅分 {pct(parts.extra)} = 100%(増幅の倍率 {Number.isFinite(parts.amp) ? parts.amp.toFixed(2) : '—'})。η = v₀c/r² = {eta.toFixed(3)}。
        </p>
      </div>
    </Fig>
  );
}

/* ================= 図: 計算の点の群れと設計式 ================= */

const BAND: [number, number, string][] = [
  [0.2, 2000, '#93c5fd'],
  [0.3, 1000, C.blue],
  [0.4, 1000, C.navy],
];

export function FigBand({ n }: { n: string }) {
  const [pts, setPts] = useState<[number, number, string][]>([]);
  const [ec, setEc] = useState(false);
  useEffect(() => {
    let alive = true;
    const lams = Array.from({ length: 19 }, (_, i) => 0.2 + i * 0.1);
    const jobs = lams.flatMap((l) => BAND.map((b) => [l, b] as const));
    let k = 0;
    const out: [number, number, string][] = [];
    const step = () => {
      if (!alive) return;
      const until = performance.now() + 12;
      while (k < jobs.length && performance.now() < until) {
        const [l, [r, imp, color]] = jobs[k++];
        const p = solveColumn({ lambda: l, resid: r, imp: 1 / imp, eOverFy: 200000 / 355, nStep: 200, nFlange: 31, nWeb: 9 });
        out.push([l, p.Pu, color]);
      }
      setPts([...out]);
      if (k < jobs.length) setTimeout(step, 0);
    };
    const id = setTimeout(step, 50);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, []);
  return (
    <Fig
      n={n}
      title="現実の柱の計算結果(点)と、設計式(線)"
      caption="点は、この教材の柱の計算(溶接 H形鋼、σy = 355 N/mm²、残留応力と初期たわみを入れた繊維モデル。映像3 と同じ計算)。設計式(紺)は、λ ≧ 0.3 ではこれらの点の下側を通る。λ = 0.2 の点はわずかに下(約 98%)だが、これはこの計算が降伏後のひずみ硬化を入れていないため。λ ≦ 0.2 で平ら、λ = 1 で2つの式がつながり、λ が大きいとオイラーの線に近づく。実際の設計式は、多数の座屈実験と解析に基づいて決められたとされている。"
    >
      <Plot
        aria="計算の点と設計式"
        x={[0, 2.1]}
        y={[0, 1.15]}
        xTicks={[0, 0.2, 0.5, 1, 1.5, 2]}
        yTicks={[0, 0.25, 0.5, 0.75, 1]}
        xLabel="細長比パラメータ λ"
        yLabel="σcr/σy"
        xHint={['← 太く短い柱', '細く長い柱 →']}
        yHint="耐えられる力(強さ)→"
        yFmt={(v) => v.toFixed(2)}
        series={[
          { f: idealColumn, color: C.orange, dash: '6 5', width: 2 },
          ...(ec ? [{ f: (l: number) => eurocode(l, 0.34), color: '#db2777', width: 2, dash: '3 3' }, { f: (l: number) => eurocode(l, 0.49), color: '#9f1239', width: 2, dash: '3 3' }] : []),
          { f: dohshiOld, color: C.navy, width: 3 },
        ]}
        vlines={[
          [0.2, C.dim, 'λ=0.2'],
          [1, C.dim, 'λ=1.0'],
        ]}
        dots={pts.map(([x, y, c]) => [x, y, c, 4] as [number, number, string, number])}
      />
      <Legend
        items={[
          [C.orange, '理想の柱', '6 5'],
          [C.navy, '設計式(道示・平成24年版まで)'],
          ...(ec ? ([['#db2777', 'Eurocode 3 曲線 b', '3 3'], ['#9f1239', '同 曲線 c', '3 3']] as [string, string, string][]) : []),
        ]}
      />
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs">
        {BAND.map(([r, imp, c]) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
            残留応力 {r * 100}%・初期たわみ L/{imp}
          </span>
        ))}
        {pts.length < 57 && <span className="text-ink-dim">計算中… {pts.length}/57</span>}
      </p>
      <Seg value={ec} options={[[false, '道示だけ'], [true, 'Eurocode 3 も重ねる']]} onChange={setEc} />
    </Fig>
  );
}

/* ================= 図: 板の理想・現実・設計式 ================= */

export function FigPlate({ n }: { n: string }) {
  const [R, setR] = useState(1.4);
  const cross = 1.22;
  return (
    <Fig
      n={n}
      title="板: 理想の線、実際の強さの目安、設計式"
      caption="橙の破線が理想の板 min(1, 1/R²)。緑は、波打った後も縁で耐える分(有効幅)を見込んだ実際の強さの目安(Winter の式。Eurocode 3 の両縁支持板と同じ形)。紺が設計式。柱と違い、薄い板(R が大きい)では実際の強さが理想の線を上回る。設計式はその余力を当てにしない。"
    >
      <Plot
        aria="板の座屈曲線"
        x={[0, 2.5]}
        y={[0, 1.15]}
        xTicks={[0, 0.5, 0.7, 1, 1.5, 2, 2.5]}
        yTicks={[0, 0.25, 0.5, 0.75, 1]}
        xLabel="幅厚比パラメータ R"
        yLabel="σcr/σy"
        xHint={['← 厚い板', '薄い板 →']}
        yHint="耐えられる力(強さ)→"
        xFmt={(v) => (v === 0.7 ? '0.7' : String(v))}
        yFmt={(v) => v.toFixed(2)}
        bands={[
          [0.673, cross, 'rgba(225,29,72,0.07)', '理想より下'],
          [cross, 2.5, 'rgba(22,163,74,0.07)', '理想より上(余力)'],
        ]}
        series={[
          { f: idealPlate, color: C.orange, dash: '6 5', width: 2.2 },
          { f: plateWinter, color: C.green, width: 2.6 },
          { f: plateStrength, color: C.navy, width: 3 },
        ]}
        vlines={[[R, C.red]]}
        dots={[
          [R, plateWinter(R), C.green, 5],
          [R, plateStrength(R), C.navy, 5],
          [R, idealPlate(R), C.orange, 5],
        ]}
      />
      <Legend items={[[C.orange, '理想の板 min(1, 1/R²)', '6 5'], [C.green, '実際の強さの目安(有効幅)'], [C.navy, '設計式 0.5/R²(R > 0.7)']]} />
      <Knob label="見る板の R" value={R} min={0.3} max={2.4} step={0.01} show={R.toFixed(2)} color={C.red} onChange={setR} />
      <p className="text-sm">
        理想 <b className="num">{pct(idealPlate(R))}</b> ・ 実際の目安 <b className="num text-green-700">{pct(plateWinter(R))}</b> ・ 設計式 <b className="num" style={{ color: C.navy }}>{pct(plateStrength(R))}</b>
        {R > 0.7 && <span className="text-ink-dim">(設計式 = 波打ち始める応力 σel の 50%。理想の強さ min(σy, σel) に対しては {pct(plateStrength(R) / idealPlate(R))})</span>}
      </p>
    </Fig>
  );
}

/* ================= 図: 軸力と曲げの相関 ================= */

export function FigInteraction({ n, initial = 3, point }: { n: string; initial?: 1 | 2 | 3; point?: [number, number] }) {
  const [step, setStep] = useState<1 | 2 | 3>(initial);
  const [lam, setLam] = useState(1.2);
  // 初期たわみ L/1000、σy = 235、長方形断面(図3-2 と同じ条件)
  const eta = etaFromImp(lam, 1000, E / 235);
  const [pb, setPb] = useState(0.8);
  const pe = 1 / (lam * lam);
  const pu = dohshiOld(lam);
  const designM = (nn: number) => (nn >= pu || nn >= 0.8 * pe ? 0 : pb * (1 - nn / pu) * (1 - nn / (0.8 * pe)));
  const curve = (g: (nn: number) => number, top: number) => Array.from({ length: 121 }, (_, i) => [g((top * i) / 120), (top * i) / 120] as [number, number]);
  const [n0, m0] = point ?? [0.18, 0.3];
  const U = n0 / pu + m0 / (pb * (1 - n0 / (0.8 * pe)));
  return (
    <Fig
      n={n}
      title="軸力と曲げ: 理論の形から、設計式へ"
      caption="縦は軸力、横は曲げ(どちらも σy に対する割合)。① 増幅を考えない足し算。② (19) の理論の形(初期たわみ L/1000、σy = 235、長方形断面。軸力だけの端点はペリー・ロバートソンの式の値)。③ 設計式 (21): 軸力だけの端点を全体座屈の許容値 σcz に、曲げだけの端点を曲げの許容値に置き換え、σe を 0.8 倍したもの。ここでは局部座屈の低減なし(R ≦ 0.7)とした。"
    >
      <Plot
        aria="軸力と曲げの相関"
        x={[0, 1.1]}
        y={[0, 1.1]}
        xTicks={[0, 0.25, 0.5, 0.75, 1]}
        yTicks={[0, 0.25, 0.5, 0.75, 1]}
        xLabel="曲げ σbc/σy"
        yLabel="軸力 σc/σy"
        xHint={['', '曲げが大きい →']}
        yHint="押す力が大きい →"
        xFmt={(v) => v.toFixed(2)}
        yFmt={(v) => v.toFixed(2)}
        series={[
          { pts: [[0, 1], [1, 0]], color: C.gray, width: step === 1 ? 3 : 1.8, dash: step === 1 ? undefined : '5 4' },
          ...(step >= 2 ? [{ pts: curve((nn) => edgeYieldMoment(nn, pe, eta), perry(lam, eta)), color: C.orange, width: step === 2 ? 3 : 1.8, dash: step === 2 ? undefined : '5 4' }] : []),
          ...(step >= 3 ? [{ pts: curve(designM, Math.min(pu, 0.8 * pe)), color: C.violet, width: 3.2 }] : []),
        ]}
        dots={step === 3 ? [[m0, n0, C.ink, 6], [0, pu, C.violet, 5], [pb, 0, C.violet, 5]] : []}
        notes={
          step === 3
            ? [
                [0.03, pu + 0.04, `σcz/σy = ${pu.toFixed(2)}`, C.violet],
                [pb, 0.05, 'σb/σy', C.violet, 'middle'],
                [m0 + 0.03, n0 + 0.04, `U = ${U.toFixed(2)}`, C.ink],
              ]
            : []
        }
      />
      <Legend items={[[C.gray, '① 足し算だけ'], ...(step >= 2 ? ([[C.orange, '② 縁の降伏+増幅(理論の形)']] as [string, string][]) : []), ...(step >= 3 ? ([[C.violet, '③ 設計式(U = 1 の線)']] as [string, string][]) : [])]} />
      <Seg value={step} options={[[1, '① 足し算'], [2, '② 理論の形'], [3, '③ 設計式']]} onChange={setStep} />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Knob label="柱の細長比パラメータ λ" value={lam} min={0.3} max={1.7} step={0.01} show={lam.toFixed(2)} color={C.violet} onChange={setLam} />
        <Knob label="曲げの許容値 σb/σy" value={pb} min={0.4} max={1} step={0.01} show={pb.toFixed(2)} color={C.violet} onChange={setPb} />
      </div>
    </Fig>
  );
}

/* ================= 図: 2回の割り引き(Q8) ================= */

export function FigBars({ n }: { n: string }) {
  const bars: [string, number, string][] = [
    ['降伏応力 σy(天井)', 250, '#64748b'],
    ['全体座屈応力 σcg', 200, C.blue],
    ['全体座屈の許容値 σcz', 120, C.red],
  ];
  const W = 520;
  const H = 210;
  const sc = 140 / 250;
  return (
    <Fig n={n} title="天井 σy から、2回割り引く(説明用の仮定値)" caption="σcg = 250 × 0.8(λ による低減)= 200。σcz = 200 × (150 ÷ 250)= 120。2回目に掛けているのは「使える断面の割合」で、安全率ではない。">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="2回の割り引き">
        {bars.map(([label, v, c], i) => {
          const x = 40 + i * 165;
          const h = v * sc;
          return (
            <g key={label}>
              <rect x={x} y={170 - h} width={90} height={h} fill={c} rx={3} />
              <text x={x + 45} y={162 - h} fontSize={16} fontWeight={700} textAnchor="middle" fill={C.ink}>
                {v}
              </text>
              <text x={x + 45} y={190} fontSize={12} textAnchor="middle" fill={C.ink}>
                {label}
              </text>
              {i > 0 && (
                <text x={x - 38} y={110} fontSize={12} fontWeight={700} textAnchor="middle" fill={C.violet}>
                  {i === 1 ? '× 0.8(λ)' : '× 150/250'}
                </text>
              )}
              {i > 0 && <text x={x - 38} y={128} fontSize={16} textAnchor="middle" fill={C.violet}>→</text>}
            </g>
          );
        })}
      </svg>
    </Fig>
  );
}

/* ================= 図: 低減率の2本の曲線(計算ツール・Q&A で使う) ================= */

export function CurvesPair({ lam, R, n }: { lam?: number; R?: number; n?: string }) {
  const mk = (title: string, xl: string, f: (v: number) => number, ideal: (v: number) => number, edges: number[], mark?: number) => (
    <div className="min-w-0">
      <p className="text-sm font-bold">{title}</p>
      <Plot
        aria={title}
        x={[0, 2]}
        y={[0, 1.15]}
        xTicks={[0, 0.5, 1, 1.5, 2]}
        yTicks={[0, 0.5, 1]}
        xLabel={xl}
        yLabel="低減率"
        xHint={xl.includes('R') ? ['← 厚い板', '薄い板 →'] : ['← 太く短い柱', '細く長い柱 →']}
        yHint="使える割合 →"
        yFmt={(v) => v.toFixed(1)}
        height={250}
        series={[
          { f: ideal, color: C.orange, dash: '6 5', width: 2 },
          { f, color: C.navy, width: 3 },
        ]}
        vlines={edges.map((e) => [e, C.dim, String(e)] as [number, string, string])}
        dots={mark !== undefined ? [[Math.min(2, mark), f(Math.min(2, mark)), C.red, 7]] : []}
      />
    </div>
  );
  const body = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {mk('全体座屈(柱): σcg/σy', '細長比パラメータ λ', dohshiOld, idealColumn, [0.2, 1], lam)}
        {mk('局部座屈(板): σcl/σy', '幅厚比パラメータ R', plateStrength, idealPlate, [0.7], R)}
      </div>
      <Legend items={[[C.navy, '設計式'], [C.orange, '弾性座屈 1/λ²・1/R²(上限 1.0)', '6 5']]} />
    </>
  );
  if (!n) return body;
  return (
    <Fig n={n} title="低減率の曲線" caption={lam !== undefined ? '赤い点が、いまの入力の位置。' : undefined}>
      {body}
    </Fig>
  );
}


/* ================= 図: 波打った板の、幅方向の応力 ================= */

/**
 * 板の幅方向に並ぶ応力の模式図。波打つまでは一様。波打った後は、中央を σel のまま頭打ちにし、
 * 増えた分を縁に寄せる(分布の形 1 − sin(πy/b)、平均がちょうど σ平均 になる)。縁が σy に届いたところが限界。
 */
export function FigPlateStress({ n }: { n: string }) {
  const R = 1.6;
  const el = 1 / (R * R); // σel/σy
  const shape = 1 - 2 / Math.PI; // 1 − sin(πy/b) の幅方向の平均
  const ult = el + (1 - el) * shape; // 縁が σy に届く平均応力
  const [avg, setAvg] = useState(0.3);
  const narrow = useNarrow();
  const W = narrow ? 360 : 560;
  const H = 300;
  const x0 = 40;
  const x1 = W - 20;
  const base = 250;
  const sc = 170; // σy の高さ
  const N = 24;
  const over = Math.max(0, avg - el);
  const sAt = (u: number) => (avg <= el ? avg : el + (over * (1 - Math.sin(Math.PI * u))) / shape);
  const edge = sAt(0);
  const be = avg / edge; // 有効幅の割合
  const amp = Math.min(26, over * 90);
  const wave = Array.from({ length: 41 }, (_, i) => {
    const u = i / 40;
    return `${x0 + (x1 - x0) * u},${44 - amp * Math.sin(Math.PI * u)}`;
  }).join(' ');
  const yOf = (s: number) => base - s * sc;
  const state = avg < el ? 0 : avg < ult - 0.005 ? 1 : 2;
  return (
    <Fig
      n={n}
      title="波打った板は、中央が力を受けなくなり、縁に力が寄る"
      caption={`R = ${R} の両縁支持板(σel = σy/R² ≒ ${el.toFixed(2)}σy)を、幅方向に輪切りにした模式図。上は板の断面の形、下は幅方向に並ぶ圧縮応力。波打った後の分布は、中央を σel のままとした簡単なモデルで、形は模式的です(実際は中央もやや下がる)。このモデルで縁が σy に届く平均応力は ${ult.toFixed(2)}σy で、von Kármán の有効幅の式 1/R = ${(1 / R).toFixed(2)} に近い値になります。`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="波打った板の応力分布">
        {/* 板の断面(上から見た形ではなく、押す向きに見た輪切り) */}
        <text x={x0} y={16} fontSize={12} fill={C.dim}>
          板の輪切り(両縁は支えられている)
        </text>
        <polyline points={wave} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
        {[x0, x1].map((x) => (
          <polygon key={x} points={`${x},${44} ${x - 8},${58} ${x + 8},${58}`} fill={C.green} />
        ))}
        {/* 応力の柱 */}
        {Array.from({ length: N }, (_, i) => {
          const u = (i + 0.5) / N;
          const s = sAt(u);
          const bw = ((x1 - x0) / N) * 0.8;
          const x = x0 + (x1 - x0) * u - bw / 2;
          return <rect key={i} x={x} y={yOf(s)} width={bw} height={s * sc} fill={s >= 0.999 ? C.red : C.blue} opacity={0.75} />;
        })}
        {/* 有効幅 */}
        {state > 0 && (
          <g fill="none" stroke={C.green} strokeWidth={2} strokeDasharray="5 4">
            <rect x={x0} y={yOf(edge)} width={((x1 - x0) * be) / 2} height={edge * sc} />
            <rect x={x1 - ((x1 - x0) * be) / 2} y={yOf(edge)} width={((x1 - x0) * be) / 2} height={edge * sc} />
          </g>
        )}
        <line x1={x0} y1={base} x2={x1} y2={base} stroke={C.axis} />
        <line x1={x0 - 6} y1={yOf(1)} x2={x1} y2={yOf(1)} stroke={C.red} strokeWidth={2} />
        <text x={x0 - 8} y={yOf(1) + 4} fontSize={12} fill={C.red} textAnchor="end" fontWeight={700}>
          σy
        </text>
        <line x1={x0 - 6} y1={yOf(el)} x2={x1} y2={yOf(el)} stroke={C.violet} strokeWidth={1.5} strokeDasharray="5 4" />
        <text x={x0 - 8} y={yOf(el) + 4} fontSize={12} fill={C.violet} textAnchor="end" fontWeight={700}>
          σel
        </text>
        <line x1={x0 - 6} y1={yOf(avg)} x2={x1} y2={yOf(avg)} stroke={C.ink} strokeWidth={1} strokeDasharray="2 3" />
        <text x={(x0 + x1) / 2} y={yOf(avg) - 4} fontSize={12} fill={C.ink} textAnchor="middle" fontWeight={700}>
          平均 {avg.toFixed(2)}σy
        </text>
        <text x={(x0 + x1) / 2} y={base + 18} fontSize={12} fill={C.dim} textAnchor="middle">
          縁 ← 板の幅 b → 縁
        </text>
      </svg>
      <Knob label="押す力(板の平均応力 / σy)" value={avg} min={0.05} max={ult} step={0.005} show={avg.toFixed(2)} color={C.ink} onChange={setAvg} />
      <p className="mt-1 text-[15px] leading-relaxed">
        {state === 0 && <>まだ波打っていない(平均 &lt; σel)。幅のどこでも同じ応力で受けている。</>}
        {state === 1 && (
          <>
            σel を超えて波打った。ふくらんだ中央は逃げるので、それ以上の力を受けない。増えた分は、支えられてまっすぐな縁が受け持つ。緑の点線は「縁の応力で受けるとしたら何割の幅で足りるか」= 有効幅 <b className="num">{pct(be)}</b>。
          </>
        )}
        {state === 2 && (
          <>
            縁が σy に届いた。ここがこの板の限界で、平均すると <b className="num">{pct(avg)}</b> の σy しか受けられない。断面の全部を σy まで使えるという前提が、ここで崩れる。
          </>
        )}
      </p>
    </Fig>
  );
}
