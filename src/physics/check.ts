// 許容応力度の形で書いた3つの座屈照査(局部座屈 → 全体座屈 → 軸力と曲げの組合せ)。
// 式の形は、道路橋示方書(平成24年版まで)の流儀: 降伏応力 × 低減率。応力は N/mm²、長さは mm。

import { dohshiOld } from './curves.ts';
import { plateStrength, sigmaEl } from './plate.ts';

export { sigmaEl };
/** 幅厚比パラメータ R = √(σy/σel) = (b/t)·√{12(1−ν²)σy / (kπ²E)} */
export const paramR = (b: number, t: number, k: number, E: number, sy: number, nu = 0.3) => Math.sqrt(sy / sigmaEl(b, t, k, E, nu));
/** 局部座屈の低減率: R ≦ 0.7 で 1.0、R > 0.7 で 0.5/R²(式どおりだと R = 0.7 のすぐ上で 1.02 になるので 1.0 で頭打ち) */
export const localRatio = plateStrength;

/** オイラー座屈応力 σe = π²E / (l/r)² */
export const sigmaE = (slender: number, E: number) => (Math.PI ** 2 * E) / (slender * slender);
/** 細長比パラメータ λ = (1/π)·√(σy/E)·(l/r) = √(σy/σe) */
export const paramLambda = (slender: number, E: number, sy: number) => (Math.sqrt(sy / E) * slender) / Math.PI;
/** 全体座屈の低減率: λ ≦ 0.2 で 1.0、0.2 < λ ≦ 1.0 で 1.109 − 0.545λ、1.0 < λ で 1/(0.773 + λ²) */
export const globalRatio = dohshiOld;

export interface CheckInput {
  sy: number;
  E: number;
  nu: number;
  /** 板の幅・厚さ・座屈係数 */
  b: number;
  t: number;
  k: number;
  /** 細長比 l/r(強軸 y まわり、弱軸 z まわり) */
  slenderY: number;
  slenderZ: number;
  /** 発生応力: 軸方向圧縮、y 軸・z 軸まわりの曲げによる圧縮縁応力 */
  sc: number;
  sbcy: number;
  sbcz: number;
  /** 横倒れ座屈の許容値 σbgy(局部座屈を考慮しない値)。曲げの基準値 σb0 は σy とする */
  sbgy: number;
}

export interface CheckResult {
  sel: number;
  R: number;
  ratioL: number;
  scl: number;
  /** 座屈する軸(細長比の大きい方)の値 */
  slender: number;
  lam: number;
  ratioG: number;
  scg: number;
  scz: number;
  sey: number;
  sez: number;
  alphaY: number;
  alphaZ: number;
  /** 使用割合の各項と合計。α ≦ 0 のときは適用範囲外で NaN */
  u1: number;
  u2: number;
  u3: number;
  U: number;
  /** 安全率 = 許容値 ÷ 発生応力(軸力だけの照査)と、1/U(組合せ) */
  sfLocal: number;
  sfGlobal: number;
  sfCombined: number;
  valid: boolean;
}

export function check(i: CheckInput): CheckResult {
  const sel = sigmaEl(i.b, i.t, i.k, i.E, i.nu);
  const R = Math.sqrt(i.sy / sel);
  const ratioL = localRatio(R);
  const scl = i.sy * ratioL;
  const slender = Math.max(i.slenderY, i.slenderZ);
  const lam = paramLambda(slender, i.E, i.sy);
  const ratioG = globalRatio(lam);
  const scg = i.sy * ratioG;
  const scz = (scg * scl) / i.sy;
  const sey = sigmaE(i.slenderY, i.E);
  const sez = sigmaE(i.slenderZ, i.E);
  const alphaY = 1 - i.sc / (0.8 * sey);
  const alphaZ = 1 - i.sc / (0.8 * sez);
  const valid = alphaY > 0 && alphaZ > 0;
  const u1 = i.sc / scz;
  const u2 = valid ? i.sbcy / (i.sbgy * alphaY) : NaN;
  const u3 = valid ? i.sbcz / (i.sy * alphaZ) : NaN;
  const U = u1 + u2 + u3;
  return {
    sel, R, ratioL, scl, slender, lam, ratioG, scg, scz, sey, sez, alphaY, alphaZ, u1, u2, u3, U,
    sfLocal: i.sc > 0 ? scl / i.sc : Infinity,
    sfGlobal: i.sc > 0 ? scz / i.sc : Infinity,
    sfCombined: valid && U > 0 ? 1 / U : NaN,
    valid,
  };
}

/**
 * 発生応力(軸力と曲げ)を同じ割合で増やしたとき、U = 1 に達する倍率。
 * α が軸力とともに小さくなるので、1/U とは一致しない(1/U より小さい)。
 */
export function loadFactor(i: CheckInput): number {
  const at = (g: number) => check({ ...i, sc: i.sc * g, sbcy: i.sbcy * g, sbcz: i.sbcz * g });
  if (i.sc <= 0 && i.sbcy <= 0 && i.sbcz <= 0) return Infinity;
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 60; n++) {
    const r = at(hi);
    if (!r.valid || r.U >= 1) break;
    lo = hi;
    hi *= 2;
  }
  for (let n = 0; n < 60; n++) {
    const mid = (lo + hi) / 2;
    const r = at(mid);
    if (r.valid && r.U < 1) lo = mid;
    else hi = mid;
  }
  return lo;
}
