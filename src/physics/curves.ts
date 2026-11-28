// 各国の柱の耐荷力曲線(公称強度 σcr/σy。安全率・抵抗係数は含まない)。lam は細長比パラメータ λ̄。

/** 理想の柱: 降伏とオイラー座屈の低い方 */
export const idealCurve = (lam: number) => Math.min(1, 1 / (lam * lam));

/** 道路橋示方書(平成24年版まで)の基準耐荷力曲線 */
export function dohshiOld(lam: number): number {
  if (lam <= 0.2) return 1;
  if (lam <= 1) return 1.109 - 0.545 * lam;
  return 1 / (0.773 + lam * lam);
}

/** 米国 AISC 360 (E3) */
export function aisc(lam: number): number {
  return lam <= 1.5 ? Math.pow(0.658, lam * lam) : 0.877 / (lam * lam);
}

/** 欧州 Eurocode 3 (EN 1993-1-1 6.3.1)。alpha: 曲線 a=0.21, b=0.34, c=0.49, d=0.76 */
export function eurocode(lam: number, alpha: number): number {
  if (lam <= 0.2) return 1;
  const phi = 0.5 * (1 + alpha * (lam - 0.2) + lam * lam);
  return Math.min(1, 1 / (phi + Math.sqrt(phi * phi - lam * lam)));
}

/** 日本建築学会 鋼構造設計規準の許容圧縮応力度から、安全率 ν を除いた値 */
export function aij(lam: number): number {
  // λ/Λ = λ̄·√0.6(Λ = π√(E/0.6F))
  const x2 = 0.6 * lam * lam;
  return x2 <= 1 ? 1 - 0.4 * x2 : 0.6 / x2;
}
