// 理論式から設計式へ: 柱と板の「理想」「現実の理論」「設計式」を同じ物差し(降伏に対する割合)で並べるための式。

/** 理想の柱(まっすぐ・残留応力なし): 降伏とオイラー座屈の低い方。σcr/σy = min(1, 1/λ²) */
export const idealColumn = (lam: number) => Math.min(1, 1 / (lam * lam));

/**
 * 初期たわみのある柱で、縁の応力がちょうど降伏に達するときの平均応力 σ/σy(ペリー・ロバートソンの式)。
 * 縁の応力 = σ + σ·η/(1 − σ/σe) = σy、η = v0·c/r²(初期たわみ v0、縁までの距離 c、断面二次半径 r)。
 * 整理すると λ²s² − (1 + η + λ²)s + 1 = 0 の小さい方の根: s = 1/(Φ + √(Φ² − λ²))、Φ = (1 + η + λ²)/2。
 */
export function perry(lam: number, eta: number): number {
  if (lam < 1e-9) return 1 / (1 + eta);
  const phi = 0.5 * (1 + eta + lam * lam);
  return 1 / (phi + Math.sqrt(phi * phi - lam * lam));
}

/**
 * 初期たわみ L/n の柱の η。η = (L/n)·c/r² = (L/r)·(c/r)/n、L/r = λ·π·√(E/σy)。
 * cr は c/r(長方形断面で √3、H形鋼の弱軸でおよそ 2)。
 */
export const etaFromImp = (lam: number, n: number, eOverFy: number, cr = Math.sqrt(3)) => (lam * Math.PI * Math.sqrt(eOverFy) * cr) / n;

/** 縁の応力の内訳(σy に対する割合): 平均応力、初期たわみによる曲げ(増幅前・増幅分) */
export function edgeParts(s: number, lam: number, eta: number) {
  const amp = 1 / (1 - s * lam * lam);
  return { axial: s, bend: s * eta, extra: s * eta * (amp - 1), amp };
}

/** 理想の板: min(1, 1/R²) */
export const idealPlate = (R: number) => Math.min(1, 1 / (R * R));

/**
 * 軸力と曲げを受ける、初期たわみのある柱の、縁の応力が降伏に達する条件(理論の形)。
 * n = σc/σy、m = σbc/σy、pe = σe/σy として n + (n·η + m)/(1 − n/pe) ≦ 1。
 * この境界で、軸力 n のとき許される曲げ m(負になる所では 0)。m = 0 の端点はペリー・ロバートソンの式 (perry) になる。
 */
export const edgeYieldMoment = (n: number, pe: number, eta = 0) => (n >= pe ? 0 : Math.max(0, (1 - n) * (1 - n / pe) - n * eta));
