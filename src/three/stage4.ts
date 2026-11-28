import * as THREE from 'three';
import { solveColumn, viewAtDeflection, viewAtLoad } from '../physics/column.ts';
import type { ColumnPath } from '../physics/column.ts';
import { aij, aisc, dohshiOld, eurocode, idealCurve } from '../physics/curves.ts';
import { HColumn } from './hcolumn.ts';
import { ShowBase, arrow, drawTube, label, line, placeArrow, ramp, setArrow, setLine, tube, axisGuide } from './kit.ts';

const E_OVER_FY = 200000 / 355;
export const LAMS = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
const N = LAMS.length;
/** たわみの誇張と、柱の太さの誇張 */
export const S4_AMP = 12;
export const S4_FAT = 2.5;
const ZC = 0.7; // 柱の列の奥行き位置
const ZG = -0.4; // グラフの壁の奥行き位置
const X = (lam: number) => (lam - 1.1) * 3.1;
const Y = (s: number) => 4.2 + s * 2.5;
const HGT = (lam: number) => 1.45 * lam;
/** 不整の大きさを変えた組(残留応力/σy、初期たわみ L/n) */
const VARIANTS: [number, number][] = [
  [0.2, 2000],
  [0.3, 1000],
  [0.4, 1000],
];

export type CurveKey = 'dohshi' | 'aisc' | 'ecb' | 'ecc' | 'aij';
export const CURVES: { key: CurveKey; name: string; color: string; f: (l: number) => number }[] = [
  { key: 'dohshi', name: '道路橋示方書(平成24年版まで)', color: '#0284c7', f: dohshiOld },
  { key: 'aisc', name: '米国 AISC 360', color: '#0d9488', f: aisc },
  { key: 'ecb', name: '欧州 Eurocode 3 曲線 b', color: '#db2777', f: (l) => eurocode(l, 0.34) },
  { key: 'ecc', name: '欧州 Eurocode 3 曲線 c', color: '#9f1239', f: (l) => eurocode(l, 0.49) },
  { key: 'aij', name: '日本建築学会(安全率を除いた値)', color: '#a16207', f: aij },
];

function curveTube(f: (l: number) => number, l0: number, l1: number, r: number, color: string) {
  const pts: THREE.Vector3[] = [];
  const n = 90;
  for (let i = 0; i <= n; i++) {
    const l = l0 + ((l1 - l0) * i) / n;
    pts.push(new THREE.Vector3(X(l), Y(f(l)), ZG));
  }
  return tube(pts, r, color);
}

function dot(r: number, color: string) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 20, 14),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.4 }),
  );
  m.scale.setScalar(0.001);
  return m;
}

export class Stage4Show extends ShowBase {
  private ideal: ColumnPath[];
  private real: ColumnPath[];
  private cols: HColumn[] = [];
  private caps: THREE.Mesh[] = [];
  private arrows: THREE.Group[] = [];
  private key: string[] = [];
  private dotI: THREE.Mesh[] = [];
  private dotR: THREE.Mesh[] = [];
  private dotC: THREE.Mesh[] = [];
  private drops: THREE.Line[] = [];
  private popI = new Array(N).fill(0);
  private popR = new Array(N).fill(0);
  private popC = 0;
  private cEuler: THREE.Mesh;
  private cYield: THREE.Mesh;
  private cIdeal: THREE.Mesh;
  private extra = new Map<CurveKey, THREE.Mesh>();
  private mark1: THREE.Group;
  private probe: THREE.Line;
  private reacts: THREE.Group[] = [];
  private outs: THREE.Group[] = [];
  private backs: THREE.Group[] = [];
  private ftags: THREE.Sprite[] = [];
  /** 実験室: 見ている細長さ、重ねる曲線、押している柱 */
  labLam = 0.9;
  overlays: Record<CurveKey, boolean> = { dohshi: true, aisc: false, ecb: false, ecc: false, aij: false };
  private pressAt = -1;
  private pressIdx = 0;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.addFloor(-0.12);
    const quick = { eOverFy: E_OVER_FY, nStep: 240 };
    this.ideal = LAMS.map((l) => solveColumn({ lambda: l, resid: 0, imp: 0, ...quick }));
    this.real = LAMS.map((l) => solveColumn({ lambda: l, resid: 0.3, imp: 1 / 1000, ...quick }));

    const dark = new THREE.MeshStandardMaterial({ color: '#6f7d94', metalness: 0.45, roughness: 0.5 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.12, 1.0), dark);
    slab.position.set(0, -0.06, ZC);
    this.scene.add(slab);
    for (let i = 0; i < N; i++) {
      const c = new HColumn();
      c.build(this.ideal[i], HGT(LAMS[i]), S4_FAT);
      c.group.position.set(X(LAMS[i]), 0, ZC);
      this.scene.add(c.group);
      this.cols.push(c);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.4), dark);
      this.scene.add(cap);
      this.caps.push(cap);
      const a = arrow('#1f2a44');
      a.scale.set(1.3, 1, 1.3);
      this.scene.add(a);
      this.arrows.push(a);
      this.key.push('');
    }

    // グラフの壁
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(9.3, 5.6),
      new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false }),
    );
    board.position.set(-0.45, Y(0.56) - 0.6, ZG - 0.12);
    this.scene.add(board);
    const axis = (x0: number, y0: number, x1: number, y1: number, color = '#64748b') => {
      const l = line(color);
      setLine(l, x0, y0, x1, y1, ZG - 0.02);
      this.scene.add(l);
    };
    axis(X(0), Y(0), X(2.25), Y(0));
    axis(X(0), Y(0), X(0), Y(1.3));
    const put = (text: string, x: number, y: number, color = '#64748b', size = 0.5, wide = 1) => {
      const sp = label(text, color, wide);
      sp.scale.multiplyScalar(size);
      sp.position.set(x, y, ZG);
      this.scene.add(sp);
      return sp;
    };
    for (const l of [0.5, 1, 1.5, 2]) {
      axis(X(l), Y(0), X(l), Y(0) - 0.07);
      put(l.toFixed(1), X(l), Y(0) - 0.22, '#1f2a44', 0.85);
    }
    for (const s of [0.5, 1]) {
      axis(X(0), Y(s), X(2.25), Y(s), '#d5dce8');
      put(s.toFixed(1), X(0) - 0.32, Y(s), '#1f2a44', 0.85);
    }
    put('σcr/σy', X(0) + 0.1, Y(1.32), '#1f2a44', 0.8);
    // 軸の意味: 右ほど細く長い柱、上ほど耐えられる力が大きい
    this.scene.add(
      axisGuide({ x0: X(0), x1: X(2.25), y0: Y(0), y1: Y(1.2), z: ZG, below: 0.98, left: 0.72, xLeft: '← 太く短い柱', xRight: '細く長い柱 →', xName: '細長比パラメータ λ', yText: '耐えられる力(強さ)→', glyph: 'column' }),
    );

    this.cEuler = curveTube((l) => 1 / (l * l), 0.878, 2.25, 0.022, '#6d28d9');
    this.cYield = curveTube(() => 1, 0, 2.25, 0.022, '#e11d48');
    this.cIdeal = curveTube(idealCurve, 0.01, 2.25, 0.034, '#16a34a');
    this.scene.add(this.cEuler, this.cYield, this.cIdeal);
    for (const c of CURVES) {
      const t = curveTube(c.f, 0.01, 2.25, c.key === 'dohshi' ? 0.04 : 0.026, c.color);
      t.position.z = 0.03;
      this.extra.set(c.key, t);
      this.scene.add(t);
    }
    for (let i = 0; i < N; i++) {
      const a = dot(0.075, '#16a34a');
      a.position.set(X(LAMS[i]), Y(this.ideal[i].Pu), ZG + 0.06);
      const b = dot(0.075, '#1f2a44');
      b.position.set(X(LAMS[i]), Y(this.real[i].Pu), ZG + 0.1);
      const d = line('#e11d48');
      setLine(d, X(LAMS[i]), Y(this.ideal[i].Pu), X(LAMS[i]), Y(this.real[i].Pu), ZG + 0.05);
      d.visible = false;
      this.scene.add(a, b, d);
      this.dotI.push(a);
      this.dotR.push(b);
      this.drops.push(d);
    }
    // 不整の大きさを変えた点の群れ
    for (const [resid, n] of VARIANTS) {
      for (const l of LAMS) {
        const pu = solveColumn({ lambda: l, resid, imp: 1 / n, eOverFy: E_OVER_FY, nStep: 200, nFlange: 31, nWeb: 9 }).Pu;
        const c = dot(0.045, '#64748b');
        c.position.set(X(l), Y(pu), ZG + 0.08);
        this.scene.add(c);
        this.dotC.push(c);
      }
    }
    // λ̄ = 1 の目印
    this.mark1 = new THREE.Group();
    const m = line('#1f2a44', true);
    setLine(m, X(1), Y(0), X(1), Y(1.25), ZG + 0.02);
    const ml = label('λ̄ = 1', '#1f2a44');
    ml.scale.multiplyScalar(0.8);
    ml.position.set(X(1), Y(1.33), ZG);
    const la = label('降伏が先', '#e11d48');
    la.scale.multiplyScalar(0.75);
    la.position.set(X(0.5), Y(1.18), ZG);
    const lb = label('座屈が先', '#6d28d9');
    lb.scale.multiplyScalar(0.75);
    lb.position.set(X(1.6), Y(1.18), ZG);
    this.mark1.add(m, ml, la, lb);
    this.scene.add(this.mark1);
    this.probe = line('#6d28d9');
    this.scene.add(this.probe);
    // 反力と、曲げる力・戻す力
    for (let i = 0; i < N; i++) {
      const r = arrow('#64748b');
      r.scale.set(1.1, 1, 1.1);
      const o = arrow('#ea580c');
      const b = arrow('#0284c7');
      this.scene.add(r, o, b);
      this.reacts.push(r);
      this.outs.push(o);
      this.backs.push(b);
    }
    for (const [t, c] of [['外力 P', '#1f2a44'], ['反力', '#64748b'], ['曲げる力 P×y', '#ea580c'], ['戻す力', '#0284c7']] as const) {
      const sp = label(t, c, t.length > 5 ? 2 : 1);
      sp.scale.multiplyScalar(0.55);
      sp.visible = false;
      this.scene.add(sp);
      this.ftags.push(sp);
    }
    this.setScene(0);
  }

  /** 実験室: いちばん近い柱を押して座屈させる */
  pressNearest() {
    let best = 0;
    for (let i = 1; i < N; i++) if (Math.abs(LAMS[i] - this.labLam) < Math.abs(LAMS[best] - this.labLam)) best = i;
    this.pressIdx = best;
    this.pressAt = this.clock;
  }

  protected onScene() {
    this.pressAt = -1;
  }

  protected tick(dt: number) {
    const s = this.sceneIndex;
    const c = this.clock;
    const mix = s === 0 ? 0 : 1;
    const load = new Array(N).fill(0);
    const defl: (number | null)[] = new Array(N).fill(null);
    const squash = new Array(N).fill(0);
    const useReal = s >= 5;
    const pI = new Array(N).fill(0);
    const pR = new Array(N).fill(0);
    let cloud = 0;
    let fe = 0;
    let fy = 0;
    let fi = 0;
    let mark = false;
    const hold = (i: number) => 0.997 * (useReal ? this.real : this.ideal)[i].Pu;
    // 全体(柱の列+グラフ)と、グラフだけ。上は説明文、下はテロップの分をあける
    const WHOLE: [number, number, number, number, number, number] = [0.05, 3.2, 4.3, 5.2, 8, 6];
    const GRAPH: [number, number, number, number, number, number] = [0.05, Y(0.5), 4.2, 2.9, 5, 3];

    if (s === 0) {
      this.once(8);
      this.caption = c < 4 ? '同じ H形鋼で、長さだけが違う柱を10本' : '短い柱と長い柱。耐えられなくなるしくみは同じでしょうか';
      this.look(0, 1.45, 4.0, 2.1, 14, 10);
    } else if (s === 1) {
      this.once(10);
      load[0] = hold(0) * ramp(c, 1, 5);
      squash[0] = ramp(c, 4, 6);
      pI[0] = c > 7 ? 1 : 0;
      this.caption =
        c < 1.2 ? 'いちばん短い柱を押す' : c < 5 ? '曲がらない。全体が同じ色のまま、力を受けていく' : c < 7 ? '全体が限界に達した(降伏)。つぶれるだけ' : '強さは、材料の強さそのもの。100%';
      if (c < 7) this.look(X(0.2), 0.2, 1.1, 1.15, 22, 12);
      else this.look(...WHOLE);
    } else if (s === 2) {
      const cc = this.cyc(13, c);
      defl[9] = (1 / 150) * (ramp(cc, 1, 4) - ramp(cc, 8.5, 11));
      squash[0] = 1;
      load[0] = hold(0);
      pI[0] = 1;
      pI[9] = c > 4.5 ? 1 : 0;
      this.caption =
        cc < 1.2
          ? 'いちばん長い柱を押す'
          : cc < 8.5
            ? '降伏の 25% で、ぐにゃり。どこも赤くない = 材料はまだ元気'
            : '力を抜くと、元に戻る。壊れたのではなく、曲がって逃げただけ';
      this.look(X(2.0) - 0.1, 1.5, 1.6, 2.7, 16, 6);
    } else {
      this.look(...(s >= 6 ? GRAPH : WHOLE));
      squash[0] = 1;
      // これまでの場面で済んだこと
      const done = (i: number) => {
        load[i] = hold(i);
        pI[i] = 1;
      };
      done(0);
      done(9);
      if (s === 3) {
        this.once(13);
        for (let j = 8; j >= 4; j--) {
          const t0 = 1 + (8 - j) * 0.8;
          load[j] = hold(j) * ramp(c, t0, t0 + 0.7);
          pI[j] = c > t0 + 0.7 ? 1 : 0;
        }
        fe = ramp(c, 5.8, 8.2);
        this.caption =
          c < 5.8
            ? '長い柱から順に押して、強さを点で打つ'
            : c < 10
              ? '点は1本の曲線に乗る。長さが2倍なら、強さは 1/4'
              : 'でも短い柱では、線が天井知らずに伸びる。そんなはずはない';
      } else {
        for (let j = 4; j <= 8; j++) done(j);
        fe = 1;
        if (s === 4) {
          this.once(13);
          fy = ramp(c, 0.6, 2.6);
          for (let j = 3; j >= 1; j--) {
            const t0 = 3 + (3 - j) * 0.8;
            load[j] = hold(j) * ramp(c, t0, t0 + 0.7);
            pI[j] = c > t0 + 0.7 ? 1 : 0;
          }
          fi = ramp(c, 6.2, 8.6);
          mark = c > 9.5;
          this.caption =
            c < 6.2
              ? '短い柱は、座屈する前に材料の限界(降伏)が来る'
              : c < 9.5
                ? '理想の柱の強さ = 2本の線の、低い方'
                : '境目が λ̄ = 1。左は降伏が先、右は座屈が先';
        } else {
          for (let j = 1; j <= 3; j++) done(j);
          fy = 1;
          fi = 1;
          if (s === 5) {
            this.once(12);
            for (let j = N - 1; j >= 0; j--) {
              const t0 = 1.2 + (N - 1 - j) * 0.65;
              load[j] = hold(j) * ramp(c, t0, t0 + 0.55);
              pR[j] = c > t0 + 0.55 ? 1 : 0;
            }
            this.caption =
              c < 8.2 ? '現実の柱(残留応力+初期たわみ)で、同じ実験をする' : '点は理想の線の下に落ちる。落ち込みが大きいのは、境目のあたり';
          } else {
            for (let j = 0; j < N; j++) {
              load[j] = hold(j);
              pR[j] = 1;
            }
            if (s === 6) {
              this.once(9);
              cloud = ramp(c, 0.6, 2.4);
              this.caption = c < 4.2 ? '不整の大きさを変えると、点は帯になって散らばる' : '設計曲線は、この群れの下側を通るように引かれている';
            } else {
              cloud = 1;
              this.caption = '';
              if (this.pressAt >= 0) {
                const t = c - this.pressAt;
                const i = this.pressIdx;
                load[i] = (this.real[i].Pu + 0.085) * ramp(t, 0, 4.5);
                if (t > 7.5) this.pressAt = -1;
              }
            }
          }
        }
      }
    }

    // 柱
    for (let i = 0; i < N; i++) {
      const path = (useReal ? this.real : this.ideal)[i];
      const k = `${useReal}|${load[i].toFixed(4)}|${defl[i] ?? 'x'}|${squash[i].toFixed(3)}|${mix}`;
      const col = this.cols[i];
      if (k !== this.key[i]) {
        this.key[i] = k;
        const v = defl[i] !== null ? viewAtDeflection(path, defl[i]!) : viewAtLoad(path, load[i]);
        col.update(path, v.step, mix, S4_AMP, squash[i] * Math.min(1, load[i] / (0.9 * path.Pu)));
        const x = X(LAMS[i]);
        this.caps[i].position.set(x, col.topY + 0.04, ZC);
        const p = v.step.P;
        setArrow(this.arrows[i], x, col.topY + 0.1 + 0.12 + 0.5 * p, p > 0.01 ? -(0.12 + 0.5 * p) : 0, ZC);
        setArrow(this.reacts[i], x, -0.14 - (0.12 + 0.5 * p), p > 0.01 ? 0.12 + 0.5 * p : 0, ZC + 0.32);
        const D = col.D;
        const kk = 1.6 * D;
        const ratio = Math.min(1.25, p / Math.max(1e-6, path.Pu));
        const y = col.topY / 2;
        const on = D > 0.06;
        placeArrow(this.outs[i], x + D + 0.12, y + 0.12, ZC + 0.2, on ? kk * ratio : 0, 0);
        placeArrow(this.backs[i], x + D - 0.12, y - 0.12, ZC + 0.2, on ? -kk : 0, 0);
      }
    }
    // 札は、映像の主役の柱(長い柱)だけに
    {
      const i = 9;
      const col = this.cols[i];
      const x = X(LAMS[i]);
      const on = s === 2 && col.D > 0.06;
      const kk = 1.6 * col.D;
      this.ftags[0].visible = s === 2;
      this.ftags[0].position.set(x + 0.5, col.topY + 0.75, ZC + 0.3);
      this.ftags[1].visible = s === 2;
      this.ftags[1].position.set(x + 0.45, -0.45, ZC + 0.4);
      this.ftags[2].visible = on;
      this.ftags[2].position.set(x + col.D + 0.12 + kk + 0.55, col.topY / 2 + 0.12, ZC + 0.3);
      this.ftags[3].visible = on;
      this.ftags[3].position.set(x + col.D - 0.12 - kk - 0.4, col.topY / 2 - 0.12, ZC + 0.3);
    }
    // 点
    const pop = 1 - Math.exp(-dt * 10);
    for (let i = 0; i < N; i++) {
      this.popI[i] += (pI[i] - this.popI[i]) * pop;
      this.popR[i] += (pR[i] - this.popR[i]) * pop;
      this.dotI[i].scale.setScalar(Math.max(0.001, this.popI[i]));
      this.dotR[i].scale.setScalar(Math.max(0.001, this.popR[i]));
      this.drops[i].visible = this.popR[i] > 0.5;
    }
    this.popC += (cloud - this.popC) * pop;
    for (const d of this.dotC) d.scale.setScalar(Math.max(0.001, this.popC));
    // 線
    drawTube(this.cEuler, fe);
    drawTube(this.cYield, fy);
    drawTube(this.cIdeal, fi);
    for (const cv of CURVES) {
      const t = this.extra.get(cv.key)!;
      if (s === 6) drawTube(t, cv.key === 'dohshi' ? ramp(c, 4.2, 7) : 0);
      else drawTube(t, s === 7 && this.overlays[cv.key] ? 1 : 0);
    }
    this.mark1.visible = mark || s >= 5;
    this.probe.visible = s === 7;
    if (s === 7) setLine(this.probe, X(this.labLam), Y(0), X(this.labLam), Y(1.25), ZG + 0.12);
  }
}
