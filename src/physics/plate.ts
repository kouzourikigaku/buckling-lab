// 一様な圧縮を受ける板(両側の縁が支えられた長い板)の局部座屈。

export const E = 200000; // N/mm²
export const NU = 0.3;
/** 座屈係数。両縁が単純支持の長い板で 4 */
export const K_PLATE = 4;

/** 弾性座屈応力 σel (N/mm²)。b: 板幅、t: 板厚 */
export function sigmaEl(b: number, t: number, k = K_PLATE, e = E, nu = NU): number {
  return ((k * Math.PI ** 2 * e) / (12 * (1 - nu ** 2))) * (t / b) ** 2;
}

/** 幅厚比パラメータ R = √(σy/σel) */
export function plateR(b: number, t: number, sigmaY: number, k = K_PLATE): number {
  return Math.sqrt(sigmaY / sigmaEl(b, t, k));
}

/** 理論値(弾性座屈)σel/σy = 1/R² */
export const plateTheory = (R: number) => 1 / (R * R);

/**
 * 道路橋示方書(平成24年版まで)の両縁支持板の、設計で認める強さ σcr/σy(波打った後の余力は見込まない安全側の値)。
 * R ≦ 0.7 で 1.0、それより大きいと 0.5/R²。式どおりだと R = 0.7 のすぐ上で 1.02 になるので 1.0 で頭打ちにする。
 */
export function plateStrength(R: number): number {
  return R <= 0.7 ? 1 : Math.min(1, 0.5 / (R * R));
}

/** 等間隔の縦リブ n 本(十分に硬い)で分けたときの、1枚あたりの板幅 */
export const panelWidth = (b: number, ribs: number) => b / (ribs + 1);

/**
 * 波打った後も縁で耐える分(有効幅)を見込んだ、板の強さの目安 σu/σy。
 * Winter の有効幅の式(Eurocode 3 EN 1993-1-5 の、一様圧縮を受ける両縁支持板と同じ形): R ≦ 0.673 で 1、それより大きいと (R − 0.22)/R²。
 */
export function plateWinter(R: number): number {
  return R <= 0.673 ? 1 : (R - 0.22) / (R * R);
}

/** 実験室の板の状態。load・design・theory・ultimate はどれも降伏に対する割合 */
export type PlateState = 'ok' | 'overDesign' | 'buckled' | 'ultimate';
export function plateState(load: number, R: number): PlateState {
  const design = plateStrength(R);
  const theory = plateTheory(R);
  const ult = plateWinter(R);
  if (load >= ult) return 'ultimate';
  if (theory < 1 && load >= theory) return 'buckled';
  if (load >= design) return 'overDesign';
  return 'ok';
}
