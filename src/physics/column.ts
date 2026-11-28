// 圧縮を受ける両端ピンの溶接 H 形鋼柱(弱軸まわりの座屈)の繊維モデル。
//
// 仮定
//  - 断面: 溶接 H 形鋼 H-300×300×10×16(SECTION)。弱軸(ウェブに平行な軸)まわりに曲がる。
//    フランジの幅方向に繊維を並べ(上下のフランジは同じ応力なので1組で2枚分)、
//    ウェブは曲げの中心(z=0)にあるので軸方向の力だけを受け持つ繊維として入れる。
//  - 材料: 完全弾塑性(降伏後の硬化なし)。除荷は弾性(繊維ごとに塑性ひずみを持つ)。
//  - 残留応力: 板ごとに直線分布でつり合う形。フランジは先端で圧縮 σrc・溶接部(中央)で引張 σrc、
//    ウェブは溶接部(両端)で引張 σrc・中央で圧縮 σrc。
//  - たわみ: 初期たわみ v0·sin(πx/L)、追加たわみ v·sin(πx/L)。
//    つり合いは柱の中央の断面で満たす(古典的な近似解法)。
//  - 中央以外の断面(stations)の応力は、その位置の軸力 P と曲げ P·(v0+v)·sin(πx/L) に
//    つり合う状態を、断面ごとの塑性の履歴つきで解く(表示用。全体の解には使わない)。
//
// 無次元化(圧縮を正)
//  - 応力は σy、ひずみは εy = σy/E、長さはフランジ幅 b、力は Py = σy·A で割る。
//  - 細長比パラメータ λ̄ = (L/πr)·√(σy/E)、r は弱軸の断面二次半径。
//  - 中央の曲率(ひずみ/εy で表す) φ = v/(λ̄²·r²)。
//  - 弾性のとき P/Py = (1/λ̄²)·v/(v0+v)(オイラー荷重 Pe/Py = 1/λ̄²)。

/** 断面寸法 (mm) */
export const SECTION = { b: 300, tf: 16, hw: 268, tw: 10 };

export interface ColumnParams {
  /** 細長比パラメータ λ̄ */
  lambda: number;
  /** 残留応力の大きさ σrc/σy (0〜0.4 程度) */
  resid: number;
  /** 初期たわみ v0/L (例 1/1000)。0 のときはごく小さい乱れ(L/10^6)を入れる */
  imp: number;
  /** E/σy (例 200000/355) */
  eOverFy: number;
  /** フランジの繊維の数 */
  nFlange?: number;
  /** ウェブの繊維の数 */
  nWeb?: number;
  /** 載荷の刻みの数 */
  nStep?: number;
}

export interface ColumnStep {
  /** 追加たわみ(中央)/b */
  v: number;
  /** 荷重 P/Py */
  P: number;
  /** 中央断面の繊維の応力/σy(圧縮を正)。前半 nf 本がフランジ、後半 nw 本がウェブ */
  sig: Float32Array;
  /** 端から中央までの各断面の応力/σy。[断面 j][繊維 i] = sigS[j*n + i]。最後の断面が中央 */
  sigS: Float32Array;
  /** 降伏していない部分の断面二次モーメント(その部分の中心まわり)/ 元の I。中央断面 */
  ieRatio: number;
  /** 降伏した部分の面積の割合(中央断面) */
  yieldFrac: number;
}

export interface ColumnPath {
  params: ColumnParams;
  /** フランジ・ウェブの繊維の数、断面の数 */
  nf: number;
  nw: number;
  ns: number;
  /** 繊維の位置 z/b(フランジ: -0.5〜0.5、ウェブ: 0) */
  z: Float64Array;
  /** ウェブの繊維のウェブ高さ方向の位置(-0.5〜0.5)。フランジは 0 */
  u: Float64Array;
  /** 繊維の面積 / A */
  w: Float64Array;
  /** 残留応力/σy(圧縮を正) */
  sigR: Float64Array;
  steps: ColumnStep[];
  /** 最大荷重の刻みの番号 */
  peak: number;
  /** 最大荷重 Pu/Py */
  Pu: number;
  /** はじめて降伏する繊維が出る荷重 P/Py(最大荷重までに降伏しなければ Pu) */
  Pfy: number;
  /** オイラー荷重 Pe/Py */
  Pe: number;
  /** 柱の長さ L/b と mm */
  L: number;
  Lmm: number;
  /** 初期たわみ v0/b */
  v0: number;
  /** 断面二次半径の2乗 / b² */
  r2: number;
}

const YIELD_TOL = 1e-9;

export function solveColumn(params: ColumnParams): ColumnPath {
  const nf = params.nFlange ?? 41;
  const nw = params.nWeb ?? 15;
  const n = nf + nw;
  const ns = 9;
  const nStep = params.nStep ?? 420;
  const lam = params.lambda;
  const { b, tf, hw, tw } = SECTION;
  const A = 2 * b * tf + hw * tw;

  const z = new Float64Array(n);
  const u = new Float64Array(n);
  const w = new Float64Array(n);
  const sigR = new Float64Array(n);
  for (let i = 0; i < nf; i++) {
    z[i] = (i + 0.5) / nf - 0.5;
    w[i] = (2 * b * tf) / A / nf;
    sigR[i] = params.resid * (4 * Math.abs(z[i]) - 1);
  }
  for (let i = 0; i < nw; i++) {
    u[nf + i] = (i + 0.5) / nw - 0.5;
    w[nf + i] = (hw * tw) / A / nw;
    sigR[nf + i] = params.resid * (1 - 4 * Math.abs(u[nf + i]));
  }
  // 離散化しても板ごとに残留応力の合力が 0 になるようにそろえる
  const balance = (i0: number, i1: number) => {
    let m = 0;
    for (let i = i0; i < i1; i++) m += sigR[i];
    m /= i1 - i0;
    for (let i = i0; i < i1; i++) sigR[i] -= m;
  };
  balance(0, nf);
  balance(nf, n);

  let r2 = 0;
  for (let i = 0; i < n; i++) r2 += w[i] * z[i] * z[i];
  const L = lam * Math.PI * Math.sqrt(r2) * Math.sqrt(params.eOverFy);
  const v0 = Math.max(params.imp, 1e-6) * L;
  const Pe = 1 / (lam * lam);

  // 断面ごとの塑性ひずみ(最後の断面 = 中央)
  const ep = new Float64Array(ns * n);
  const mid = (ns - 1) * n;
  const eS = new Float64Array(ns);
  const kS = new Float64Array(ns);
  const sn = new Float64Array(ns);
  for (let j = 0; j < ns; j++) sn[j] = Math.sin((Math.PI * j) / (2 * (ns - 1)));
  const sig = new Float64Array(n);

  // 断面 off の塑性ひずみで、eps0・phi を与えたときの応力と合力
  const evalSection = (off: number, eps0: number, phi: number) => {
    let N = 0;
    let M = 0;
    let At = 0;
    let St = 0;
    let It = 0;
    for (let i = 0; i < n; i++) {
      let s = eps0 + phi * z[i] - ep[off + i] + sigR[i];
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      else {
        At += w[i];
        St += w[i] * z[i];
        It += w[i] * z[i] * z[i];
      }
      sig[i] = s;
      N += s * w[i];
      M += s * z[i] * w[i];
    }
    return { N, M, At, St, It };
  };
  const commit = (off: number, eps0: number, phi: number) => {
    for (let i = 0; i < n; i++) {
      const trial = eps0 + phi * z[i] - ep[off + i] + sigR[i];
      if (trial > 1) ep[off + i] += trial - 1;
      else if (trial < -1) ep[off + i] += trial + 1;
    }
  };

  const steps: ColumnStep[] = [];
  const first = new Float32Array(n);
  const firstS = new Float32Array(ns * n);
  for (let j = 0; j < ns; j++) firstS.set(sigR, j * n);
  first.set(sigR);
  steps.push({ v: 0, P: 0, sig: first, sigS: firstS, ieRatio: 1, yieldFrac: 0 });

  const vMin = v0 * 1e-3;
  const vMax = Math.max(1.2, 0.06 * L);
  let Pfy = -1;
  for (let k = 1; k <= nStep; k++) {
    const v = vMin * Math.pow(vMax / vMin, (k - 1) / (nStep - 1));
    const phi = v / (lam * lam * r2);
    const arm = v0 + v;
    const g = (e: number) => {
      const { N, M } = evalSection(mid, e, phi);
      return M - N * arm;
    };
    // g は eps0 について減少。前の刻みの値のまわりで符号の変わる区間を探す
    let lo = eS[ns - 1] - 0.05;
    let hi = eS[ns - 1] + 0.05;
    let guard = 0;
    while (g(lo) < 0 && guard++ < 60) lo -= hi - lo;
    guard = 0;
    while (g(hi) > 0 && guard++ < 60) hi += hi - lo;
    for (let it = 0; it < 60; it++) {
      const m = 0.5 * (lo + hi);
      if (g(m) > 0) lo = m;
      else hi = m;
    }
    const eps0 = 0.5 * (lo + hi);
    const P = evalSection(mid, eps0, phi).N;
    const sigS = new Float32Array(ns * n);
    const sMid = new Float32Array(n);
    // 降伏していない部分だけの面積 At・一次モーメント St・二次モーメント It
    let At = 0;
    let St = 0;
    let It = 0;
    let yf = 0;
    for (let i = 0; i < n; i++) {
      sMid[i] = sig[i];
      if (Math.abs(sig[i]) >= 1 - YIELD_TOL) yf += w[i];
      else {
        At += w[i];
        St += w[i] * z[i];
        It += w[i] * z[i] * z[i];
      }
    }
    // 軸力を保ったまま曲げたときの踏ん張り = 残った部分の中心まわりの値(降伏が片側から進むと中心が動く)
    const ie = At > 1e-12 ? It - (St * St) / At : 0;
    sigS.set(sMid, mid);
    commit(mid, eps0, phi);
    eS[ns - 1] = eps0;
    kS[ns - 1] = phi;

    // 中央以外の断面: N = P、M = P·arm·sin にニュートン法で合わせる
    for (let j = 0; j < ns - 1; j++) {
      const off = j * n;
      const Mt = P * arm * sn[j];
      let e = eS[j];
      let c = kS[j];
      for (let it = 0; it < 40; it++) {
        const r = evalSection(off, e, c);
        const R1 = r.N - P;
        const R2 = r.M - Mt;
        if (Math.abs(R1) + Math.abs(R2) < 1e-11) break;
        const det = r.At * r.It - r.St * r.St;
        const damp = it > 20 ? 0.5 : 1;
        if (det > 1e-12) {
          e -= (damp * (r.It * R1 - r.St * R2)) / det;
          c -= (damp * (-r.St * R1 + r.At * R2)) / det;
        } else if (r.At > 1e-9) {
          e -= (damp * R1) / r.At;
        } else break;
      }
      evalSection(off, e, c);
      for (let i = 0; i < n; i++) sigS[off + i] = sig[i];
      commit(off, e, c);
      eS[j] = e;
      kS[j] = c;
    }

    if (Pfy < 0 && yf > 0) Pfy = P;
    steps.push({ v, P, sig: sMid, sigS, ieRatio: ie / r2, yieldFrac: yf });
  }

  let peak = 0;
  for (let k = 1; k < steps.length; k++) if (steps[k].P > steps[peak].P) peak = k;
  const Pu = steps[peak].P;
  if (Pfy < 0 || Pfy > Pu) Pfy = Pu;

  return { params, nf, nw, ns, z, u, w, sigR, steps, peak, Pu, Pfy, Pe, L, Lmm: L * b, v0, r2 };
}

/** 載荷装置の荷重 s (P/Py) に対する柱の状態。最大荷重を超えたら崩壊の過程を進める */
export interface ColumnView {
  step: ColumnStep;
  /** 最大荷重を超えて崩壊しているか */
  collapsed: boolean;
  /** 崩壊の進み具合 0〜1 */
  collapse: number;
}

export function viewAtLoad(path: ColumnPath, s: number, collapseSpan = 0.08): ColumnView {
  const { steps, peak, Pu } = path;
  if (s >= Pu) {
    const t = Math.min(1, (s - Pu) / collapseSpan);
    // 崩壊後は たわみが柱の長さの 1/40 になる所まで進める
    let end = peak;
    const vEnd = path.L / 40;
    while (end < steps.length - 1 && steps[end].v + path.v0 < vEnd) end++;
    return { step: lerpStep(steps, peak + t * (end - peak)), collapsed: s > Pu, collapse: t };
  }
  let lo = 0;
  let hi = peak;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (steps[m].P <= s) lo = m;
    else hi = m;
  }
  const a = steps[lo];
  const b = steps[hi];
  const t = b.P > a.P ? (s - a.P) / (b.P - a.P) : 0;
  return { step: lerpStep(steps, lo + Math.min(1, Math.max(0, t))), collapsed: false, collapse: 0 };
}

/** 中央のたわみ(初期たわみ込み)/L が d になる状態。最大荷重までの範囲で探す */
export function viewAtDeflection(path: ColumnPath, d: number): ColumnView {
  const { steps, peak, v0, L } = path;
  const target = d * L - v0;
  if (target <= 0) return { step: steps[0], collapsed: false, collapse: 0 };
  let i = 1;
  while (i < peak && steps[i].v < target) i++;
  const a = steps[i - 1];
  const b = steps[i];
  const t = b.v > a.v ? Math.min(1, (target - a.v) / (b.v - a.v)) : 0;
  return { step: lerpStep(steps, i - 1 + t), collapsed: false, collapse: 0 };
}

function lerpArr(a: Float32Array, b: Float32Array, t: number): Float32Array {
  const o = new Float32Array(a.length);
  for (let k = 0; k < a.length; k++) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}

function lerpStep(steps: ColumnStep[], idx: number): ColumnStep {
  const i = Math.max(0, Math.min(steps.length - 2, Math.floor(idx)));
  const t = idx - i;
  const a = steps[i];
  const b = steps[i + 1];
  if (t <= 0) return a;
  if (t >= 1) return b;
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    v: m(a.v, b.v),
    P: m(a.P, b.P),
    sig: lerpArr(a.sig, b.sig, t),
    sigS: lerpArr(a.sigS, b.sigS, t),
    ieRatio: m(a.ieRatio, b.ieRatio),
    yieldFrac: m(a.yieldFrac, b.yieldFrac),
  };
}

export { dohshiOld } from './curves.ts';
