import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { writeStressColor } from './common.ts';
import { springGeometry } from './explain.ts';
import { ShowBase, arrow, label, line, ramp, setArrow, setLine, tintArrow } from './kit.ts';

const NEUTRAL = new THREE.Color('#8794a8');
const DARK = () => new THREE.MeshStandardMaterial({ color: '#6f7d94', metalness: 0.45, roughness: 0.5 });

/** 曲がる棒(中央が原点、両端が下がる向きに円弧で曲がる。上側が伸びる) */
export class BendBeam {
  group = new THREE.Group();
  mesh: THREE.Mesh;
  private base: Float32Array = new Float32Array(0);
  private lines: THREE.LineSegments;
  private linePts: [number, number, number][] = [];
  L: number;
  h = 1;
  w = 1;

  constructor(L: number, h: number, w: number, withLines: boolean, steel = true) {
    this.L = L;
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, metalness: steel ? 0.4 : 0.1, roughness: 0.5 }),
    );
    this.mesh.frustumCulled = false;
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
    this.lines.frustumCulled = false;
    this.lines.visible = withLines;
    this.group.add(this.mesh, this.lines);
    this.setSize(h, w);
  }

  setSize(h: number, w: number) {
    if (h === this.h && w === this.w && this.base.length) return;
    this.h = h;
    this.w = w;
    const geo = new THREE.BoxGeometry(this.L, h, w, 48, 8, 1);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.base = new Float32Array(geo.attributes.position.array as Float32Array);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    // 表面に引く線: 長手の線7本(真ん中は白)と、輪切りの線
    const pts: [number, number, number][] = [];
    const cols: number[] = [];
    const z = w / 2 + 0.004;
    for (let k = 0; k < 7; k++) {
      const y = (k / 6 - 0.5) * h * 0.96;
      for (let i = 0; i < 48; i++) {
        pts.push([(i / 48 - 0.5) * this.L, y, z], [((i + 1) / 48 - 0.5) * this.L, y, z]);
        const c = k === 3 ? [1, 1, 1] : [0.05, 0.08, 0.16];
        cols.push(...c, ...c);
      }
    }
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12 - 0.5) * this.L;
      pts.push([x, -h / 2, z], [x, h / 2, z]);
      cols.push(0.05, 0.08, 0.16, 0.05, 0.08, 0.16);
    }
    this.linePts = pts;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
    this.lines.geometry.dispose();
    this.lines.geometry = lg;
  }

  /** 断面を長方形の組み合わせにする(H形など)。parts: [幅(奥行き方向), 高さ, 中心の高さ, 奥行き方向の中心]。表面の線は引かない */
  setSection(parts: ([number, number, number] | [number, number, number, number])[]) {
    const geos = parts.map(([w, h, yc, zc = 0]) => {
      const g = new THREE.BoxGeometry(this.L, h, w, 48, 2, 1);
      g.translate(0, yc, zc);
      return g;
    });
    const geo = mergeGeometries(geos)!;
    geos.forEach((g) => g.dispose());
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.base = new Float32Array(geo.attributes.position.array as Float32Array);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.lines.visible = false;
    let top = 0;
    let wMax = 0;
    for (const [w, h, yc, zc = 0] of parts) {
      top = Math.max(top, yc + h / 2);
      wMax = Math.max(wMax, 2 * Math.abs(zc) + w);
    }
    this.h = top * 2;
    this.w = wMax;
  }

  private map(x: number, y: number, k: number, out: number[]) {
    if (Math.abs(k) < 1e-5) {
      out[0] = x;
      out[1] = y;
      return;
    }
    const R = 1 / k;
    out[0] = (R + y) * Math.sin(x * k);
    out[1] = (R + y) * Math.cos(x * k) - R;
  }

  /** k: 曲率(絵の単位)。sAt(y): 高さ y の応力/σy(圧縮を正)。mix: 色の濃さ */
  update(k: number, sAt: (y: number) => number, mix: number) {
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.mesh.geometry.attributes.color as THREE.BufferAttribute;
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    const o = [0, 0];
    for (let i = 0; i < pos.count; i++) {
      const y = this.base[i * 3 + 1];
      this.map(this.base[i * 3], y, k, o);
      pa[i * 3] = o[0];
      pa[i * 3 + 1] = o[1];
      writeStressColor(ca, i * 3, sAt(y), mix, NEUTRAL);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    if (this.lines.visible) {
      const lp = this.lines.geometry.attributes.position as THREE.BufferAttribute;
      this.linePts.forEach((p, i) => {
        this.map(p[0], p[1], k, o);
        lp.setXYZ(i, o[0], o[1], p[2]);
      });
      lp.needsUpdate = true;
    }
  }

  /** 端(x = ±L/2)の上面の位置 */
  end(k: number, side: number): [number, number] {
    const o = [0, 0];
    this.map((side * this.L) / 2, this.h / 2, k, o);
    return [o[0], o[1]];
  }
}

/** バネの束(横向き)。左の板が固定、右の板が傾く。上のバネほど伸びる向きを正の傾きとする */
class Bank {
  group = new THREE.Group();
  inner = new THREE.Group();
  xs: number[] = [];
  private springs: THREE.Mesh[] = [];
  private mats: THREE.MeshStandardMaterial[] = [];
  private plate: THREE.Mesh;
  private arrows: THREE.Group[] = [];
  private col = new Float32Array(3);

  constructor(public n: number, public gap: number, public L0: number, geo: THREE.BufferGeometry) {
    // 中では「縦のバネ・水平の板」で作り、全体を90度回して横向きにする
    this.inner.rotation.z = -Math.PI / 2;
    this.group.add(this.inner);
    const w = n * gap + 0.25;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.6), DARK());
    base.position.y = -0.06;
    this.plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: '#b9c3d2', metalness: 0.7, roughness: 0.45 }));
    this.inner.add(base, this.plate);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * gap;
      this.xs.push(x);
      const m = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.35 });
      const s = new THREE.Mesh(geo, m);
      s.position.x = x;
      s.scale.set(gap / 0.56, 1, gap / 0.56);
      this.inner.add(s);
      this.springs.push(s);
      this.mats.push(m);
      const a = arrow('#1f2a44');
      a.scale.set(0.8, 1, 0.8);
      this.inner.add(a);
      this.arrows.push(a);
    }
  }

  /** 絵の上で、バネ i の高さ(束の中心からの上下の位置) */
  rowY(i: number) {
    return -this.xs[i];
  }

  /** tilt: 傾き(正で上が伸びる)。force: 矢印の出し具合 0〜1。stiff: バネの硬さの見せ方(矢印の長さに掛ける) */
  update(tilt: number, force: number, stiff = 1) {
    const half = ((this.n - 1) / 2) * this.gap;
    for (let i = 0; i < this.n; i++) {
      const len = this.L0 - tilt * this.xs[i];
      const s = (this.L0 - len) / Math.max(0.2, half * 0.2 * 1.3);
      this.springs[i].scale.y = len;
      writeStressColor(this.col, 0, Math.max(-1, Math.min(0.95, s)), Math.min(1, Math.abs(s) * 6), NEUTRAL);
      const m = this.mats[i];
      m.color.setRGB(this.col[0], this.col[1], this.col[2]);
      m.emissive.copy(m.color);
      m.emissiveIntensity = 0.25 + 0.5 * Math.min(1, Math.abs(s) * 2);
      const f = Math.abs(len - this.L0) * 3.2 * force * stiff;
      const a = this.arrows[i];
      if (f < 0.05) a.visible = false;
      else if (len > this.L0) setArrow(a, this.xs[i], len + 0.14 + f + 0.2, -(f + 0.2), 0.34);
      else setArrow(a, this.xs[i], len + 0.14, f + 0.2, 0.34);
      tintArrow(a, len > this.L0 ? '#ea580c' : '#0284c7');
    }
    this.plate.position.y = this.L0 + 0.06;
    this.plate.rotation.z = Math.atan(-tilt);
  }
}

export function gauge(color: string) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.16, 0.3),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 }),
  );
  return m;
}
/** 左端を x0 にそろえて長さ len の棒にする */
export function setGauge(m: THREE.Mesh, x0: number, y: number, len: number, z = 0) {
  m.visible = len > 0.01;
  m.scale.x = Math.max(0.01, len);
  m.position.set(x0 + len / 2, y, z);
}
export function tag(text: string, color: string, size = 0.7, wide = 1) {
  const s = label(text, color, wide);
  s.scale.multiplyScalar(size);
  return s;
}

// H形(H-300×300×10×16、強軸まわり)と、同じ面積の長方形(幅100)
export const H = { b: 300, tf: 16, hw: 268, tw: 10 };
const AREA = 2 * H.b * H.tf + H.hw * H.tw;
const RECT = { b: 100, h: AREA / 100 };
const I_RECT = (RECT.b * RECT.h ** 3) / 12;
export const iOf = (bf: number, tf: number, hw: number, tw: number) => 2 * ((bf * tf ** 3) / 12 + bf * tf * ((hw + tf) / 2) ** 2) + (tw * hw ** 3) / 12;
/** 同じ量の鉄を H形にしたとき、踏ん張り(断面二次モーメント)が長方形の何倍になるか */
export const H_GAIN = iOf(H.b, H.tf, H.hw, H.tw) / I_RECT;
/** 式の場面の I の比べ: 同じ量の鉄の長方形の棒(幅100)を 1 とした倍率(上下に曲げる) */
const BOX_IN = Math.sqrt(300 ** 2 - AREA); // 外 300 の角鋼管の内のり(同じ量の鉄。厚さ ≒ 10.6 mm)
export const I_CMP = {
  hStrong: H_GAIN,
  hWeak: (2 * (H.tf * H.b ** 3) / 12 + (H.hw * H.tw ** 3) / 12) / I_RECT,
  box: (300 ** 4 - BOX_IN ** 4) / 12 / I_RECT,
};
/** 式の場面の E の比べ(N/mm²、目安)。曲がりは E に反比例 */
export const E_CMP = [
  { name: '鉄(鋼)', e: 200000, text: '約20万', color: '#9aa7ba', metal: 0.55, rough: 0.4, opacity: 1 },
  { name: 'アルミ', e: 70000, text: '約7万', color: '#e3e8ef', metal: 0.75, rough: 0.3, opacity: 1 },
  { name: 'ダイヤモンド', e: 1000000, text: '約100万', color: '#a5ecfa', metal: 0.05, rough: 0.05, opacity: 0.7 },
];

// 曲げ比べの棒の長さ・置き場所・支点の高さ(絵の単位)
const BEND_L = 6;
const BEND_Z = { rect: 1.3, h: -1.3 };
const FUL_H = 0.55;
/** 長方形の棒の曲率(絵の上で誇張)。H形は同じ力なので 1/H_GAIN */
const BEND_K = 0.13;

export interface LabState {
  b: number; // mm
  h: number; // mm
  k: number; // 曲率 1/m
}

export class Stage1Show extends ShowBase {
  private gRuler = new THREE.Group();
  private rulerFlat: BendBeam;
  private rulerEdge: BendBeam;
  private rulerArrows: THREE.Group[] = [];
  private gBlock = new THREE.Group();
  private block: BendBeam;
  private blockTags: THREE.Sprite[] = [];
  private radius: THREE.Line;
  private gBank = new THREE.Group();
  /** 太い棒から一切れを取り出して、バネの束に見立てる導入(場面3 の冒頭) */
  private gSlice = new THREE.Group();
  private stripes: THREE.Mesh[] = [];
  private sliceBox: THREE.LineSegments;
  private bank7: Bank;
  private bars: THREE.Mesh[] = [];
  private barTags: THREE.Sprite[] = [];
  private arm: THREE.Line;
  private armTag: THREE.Sprite;
  private gPair = new THREE.Group();
  private bank4: Bank;
  private bank8: Bank;
  private gA: THREE.Mesh;
  private gB: THREE.Mesh;
  private pairTags: THREE.Sprite[] = [];
  private gBend = new THREE.Group();
  private bendRect: BendBeam;
  private bendH: BendBeam;
  private bendArrows: THREE.Group[] = [];
  private bendTags: THREE.Sprite[] = [];
  private bendGauges: THREE.Mesh[] = [];
  private bendGTags: THREE.Sprite[] = [];
  private morphKey = -1;
  // 式の場面: E = 3つの材料の同じ形の棒、I = 同じ量の鉄の4つの断面
  private gE = new THREE.Group();
  private eBeams: BendBeam[] = [];
  private eArrows: THREE.Group[] = [];
  private eTags: THREE.Sprite[] = [];
  private gI = new THREE.Group();
  private iBars: THREE.Mesh[] = [];
  private iTags: THREE.Sprite[] = [];
  private iCells: THREE.Group[] = [];
  private iFoot!: THREE.Sprite;
  /** 式の場面で注目する記号(-1 で自動で順に) */
  focus = -1;
  lab: LabState = { b: 100, h: 150, k: 0.006 };

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.addFloor(-0.05);
    const geo = springGeometry();
    this.scene.add(this.gRuler, this.gBlock, this.gBank, this.gPair, this.gBend, this.gSlice, this.gE, this.gI);
    this.buildE();
    this.buildI();
    // 一切れ: 鋼の細い筋7本(上ほど伸び = オレンジ、下ほど縮み = 青)と、切り取る所を示す紫の枠
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.45, transparent: true }),
      );
      this.gSlice.add(m);
      this.stripes.push(m);
    }
    this.sliceBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.26, 1.14, 0.84)),
      new THREE.LineBasicMaterial({ color: '#6d28d9', transparent: true }),
    );
    this.gSlice.add(this.sliceBox);

    // 定規
    // 幅 30 mm・厚み 2 mm の定規と同じ比率(15:1)
    this.rulerFlat = new BendBeam(4.4, 0.04, 0.6, false, false);
    this.rulerEdge = new BendBeam(4.4, 0.6, 0.04, false, false);
    const ful = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.32, 0.55, 4), DARK());
    ful.rotation.y = Math.PI / 4;
    ful.position.y = 1.1;
    this.gRuler.add(this.rulerFlat.group, this.rulerEdge.group, ful);
    for (let i = 0; i < 2; i++) {
      const a = arrow('#1f2a44');
      a.scale.set(1.6, 1, 1.6);
      this.gRuler.add(a);
      this.rulerArrows.push(a);
    }

    // 太い棒
    this.block = new BendBeam(4.2, 1.0, 0.7, true);
    this.block.group.position.y = 1.55;
    this.gBlock.add(this.block.group);
    for (const [t, c] of [['伸びる', '#ea580c'], ['縮む', '#0284c7'], ['変わらない', '#1f2a44']] as const) {
      const s = tag(t, c, 0.75);
      this.gBlock.add(s);
      this.blockTags.push(s);
    }
    this.radius = line('#6d28d9', true);
    this.gBlock.add(this.radius);

    // バネの束(7本)
    this.bank7 = new Bank(7, 0.4, 1.9, geo);
    this.bank7.group.position.set(-2.6, 1.6, 0);
    this.gBank.add(this.bank7.group);
    for (let i = 0; i < 7; i++) {
      const b = gauge('#6d28d9');
      this.gBank.add(b);
      this.bars.push(b);
      const d = Math.abs(i - 3);
      const s = tag(d === 0 ? '0' : `${d * d}`, '#6d28d9', 0.6);
      this.gBank.add(s);
      this.barTags.push(s);
    }
    this.arm = line('#6d28d9');
    this.armTag = tag('腕', '#6d28d9', 0.7);
    this.gBank.add(this.arm, this.armTag);

    // 高さ1倍と2倍
    this.bank4 = new Bank(4, 0.36, 1.5, geo);
    this.bank4.group.position.set(-3.5, 1.95, 0);
    this.bank8 = new Bank(8, 0.36, 1.5, geo);
    this.bank8.group.position.set(0.3, 1.95, 0);
    this.gA = gauge('#6d28d9');
    this.gB = gauge('#6d28d9');
    this.gPair.add(this.bank4.group, this.bank8.group, this.gA, this.gB);
    for (const [t, x] of [['高さ 1', -2.7], ['高さ 2', 1.1], ['踏ん張り 1', -2.2], ['踏ん張り 8', 2.3]] as const) {
      const s = tag(t, t.startsWith('踏') ? '#6d28d9' : '#1f2a44', 0.7);
      s.position.set(x, t.startsWith('踏') ? -0.02 : 3.75, 0.3);
      this.gPair.add(s);
      this.pairTags.push(s);
    }

    // 同じ量の鉄の長方形の棒と H形鋼を、同じ力で曲げる(断面は同じ縮尺、曲がりは誇張)
    const SB = 1 / 250;
    this.bendRect = new BendBeam(BEND_L, RECT.h * SB, RECT.b * SB, false);
    this.bendRect.setSection([[RECT.b * SB, RECT.h * SB, 0]]);
    this.bendH = new BendBeam(BEND_L, H.hw * SB, H.b * SB, false);
    const yf = ((H.hw + H.tf) / 2) * SB;
    this.bendH.setSection([
      [H.b * SB, H.tf * SB, yf],
      [H.tw * SB, H.hw * SB, 0],
      [H.b * SB, H.tf * SB, -yf],
    ]);
    for (const [b, z] of [[this.bendRect, BEND_Z.rect], [this.bendH, BEND_Z.h]] as const) {
      b.group.position.set(0, FUL_H + b.h / 2, z);
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.32, FUL_H, 4), DARK());
      f.rotation.y = Math.PI / 4;
      f.position.set(0, FUL_H / 2, z);
      this.gBend.add(b.group, f);
      for (let i = 0; i < 2; i++) {
        const a = arrow('#1f2a44');
        a.scale.set(1.3, 1, 1.3);
        this.gBend.add(a);
        this.bendArrows.push(a);
      }
    }
    for (const [t, c] of [['長方形', '#1f2a44'], ['H形', '#1f2a44'], ['曲がり 1', '#6d28d9'], [`曲がり 約1/${Math.round(H_GAIN)}`, '#6d28d9']] as const) {
      const s = tag(t, c, 1.0);
      this.gBend.add(s);
      this.bendTags.push(s);
    }
    for (let i = 0; i < 2; i++) {
      const g = gauge('#6d28d9');
      this.gBend.add(g);
      this.bendGauges.push(g);
    }
    for (const t of ['踏ん張り 1', `踏ん張り 約${Math.round(H_GAIN)}倍`]) {
      const s = tag(t, '#6d28d9', 0.95);
      this.gBend.add(s);
      this.bendGTags.push(s);
    }
    this.setScene(0);
  }

  private showOnly(...gs: THREE.Group[]) {
    for (const g of [this.gRuler, this.gBlock, this.gBank, this.gPair, this.gBend, this.gSlice, this.gE, this.gI]) g.visible = gs.includes(g);
    if (!gs.includes(this.gSlice)) this.fadeBlock(1);
  }

  private tickRuler(c: number) {
    const t = this.cyc(17, c);
    const push = ramp(t, 1, 3.5) - ramp(t, 5, 6.3);
    const roll = ramp(t, 6.5, 8.5) - ramp(t, 16, 17);
    const push2 = ramp(t, 9, 11) - ramp(t, 15, 16);
    const edge = roll > 0.999;
    this.rulerFlat.group.visible = !edge;
    this.rulerEdge.group.visible = edge;
    const kFlat = 0.4 * push;
    // 立てた向きは (幅/厚み)² = 225倍 曲がりにくい
    const kEdge = (0.4 * push2) / 15 ** 2;
    this.rulerFlat.update(kFlat, () => 0, 0);
    this.rulerFlat.group.rotation.x = (roll * Math.PI) / 2;
    this.rulerEdge.update(kEdge, () => 0, 0);
    const y0 = 1.375 + (edge ? 0.3 : 0.02 + 0.28 * roll);
    this.rulerFlat.group.position.y = y0;
    this.rulerEdge.group.position.y = 1.375 + 0.3;
    const b = edge ? this.rulerEdge : this.rulerFlat;
    const k = edge ? kEdge : kFlat;
    const f = Math.max(push, push2);
    for (let i = 0; i < 2; i++) {
      const [ex, ey] = b.end(k, i ? 1 : -1);
      const top = b.group.position.y + ey;
      setArrow(this.rulerArrows[i], ex * 0.96, top + 0.08 + 0.75 * f, -0.75 * f);
    }
    this.caption =
      t < 1
        ? 'プラスチックの定規。両端を同じ力で押し下げる'
        : t < 6.5
          ? '平らな向きなら、簡単にしなる'
          : t < 9
            ? '同じ定規を、立てる'
            : t < 13
              ? '同じ力では、びくともしない'
              : '材料も量も同じ。違うのは向きだけ。なぜ?';
    this.look(0, 1.5, 3.0, 2.3, 16, 14);
  }

  private tickBlock(c: number, kMax = 0.36, cap = true) {
    const t = this.cyc(16, c);
    const k = kMax * (ramp(t, 1, 4) - ramp(t, 15, 16));
    const hh = this.block.h / 2;
    this.block.update(k, (y) => (-k * y) / (kMax * hh) * 0.8, Math.min(1, (k / kMax) * 3));
    const y0 = this.block.group.position.y;
    const pos: [number, number][] = [
      [0, y0 + hh + 0.3],
      [0, y0 - hh - 0.3],
      [2.75, y0 - (k ? (1 / k) * (1 - Math.cos(2.1 * k)) : 0)],
    ];
    this.blockTags.forEach((s, i) => {
      s.position.set(pos[i][0], pos[i][1], 0.5);
      s.visible = cap && k > 0.1 && (i < 2 || t > 6);
    });
    this.radius.visible = false;
    if (cap)
      this.caption =
        t < 1
          ? '太い棒に、線を引いておく'
          : t < 6
            ? '曲げると、外側の線は伸び、内側の線は縮む'
            : t < 10.5
              ? '真ん中の線だけは、長さが変わらない'
              : '伸び縮みは、真ん中から離れるほど大きい';
    return k;
  }

  /** 太い棒の透明度(導入で一切れだけを残すとき) */
  private fadeBlock(a: number) {
    this.block.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m) return;
      const tr = a < 0.999;
      if (m.transparent !== tr) {
        m.transparent = tr;
        m.needsUpdate = true; // 透明の切り替えは描き方の作り直しが要る
      }
      m.opacity = a;
      m.depthWrite = a > 0.5;
    });
  }

  /**
   * 場面3 の導入(8 秒): 映像の2番目と同じ太い棒を曲げる → 真ん中の一切れを紫の枠で囲んで寄る →
   * 一切れを鋼の細い筋7本として取り出す → 筋1本ずつがバネの束の位置へ動いて、バネに置きかわる
   */
  private tickSliceIntro(t: number) {
    this.showOnly(this.gBlock, this.gSlice);
    this.block.setSize(1.0, 0.7);
    const kMax = 0.25;
    const k = kMax * ramp(t, 0.3, 2);
    const hh = this.block.h / 2;
    this.block.update(k, (y) => (-k * y) / (0.36 * hh) * 0.8, Math.min(1, (k / kMax) * 3));
    for (const tg of this.blockTags) tg.visible = false;
    this.radius.visible = false;
    // 棒を薄くして、一切れだけを残す
    this.fadeBlock(1 - 0.92 * ramp(t, 4, 5));
    const y0 = this.block.group.position.y;
    // 枠: 2.3 秒から出て、取り出し始めたら消える
    (this.sliceBox.material as THREE.LineBasicMaterial).opacity = ramp(t, 2.3, 2.8) * (1 - ramp(t, 5.2, 5.8));
    this.sliceBox.position.set(0, y0, 0);
    this.sliceBox.visible = t > 2.2 && t < 5.8;
    // 筋: 棒の中の位置 → バネの束の位置(同じ高さの順)。6.8〜8 秒で消えてバネが出る
    const b = this.bank7;
    const bx = b.group.position.x;
    const by = b.group.position.y;
    const p = ramp(t, 5, 6.8);
    const ease = p * p * (3 - 2 * p);
    const show = t > 4 && t < 8;
    const col = new Float32Array(3);
    this.stripes.forEach((m, i) => {
      const yb = (3 - i) / 7; // 上から順に +3/7 … −3/7(棒の高さ 1.0 の中の位置)
      const from = { x: 0, y: y0 + yb * this.block.h, w: 0.24, h: (this.block.h / 7) * 0.92, d: 0.7 };
      const to = { x: bx + b.L0 / 2, y: by + b.rowY(i), w: b.L0, h: b.gap * 0.42, d: 0.42 };
      const L = (a: number, z: number) => a + (z - a) * ease;
      m.visible = show;
      m.position.set(L(from.x, to.x), L(from.y, to.y), 0);
      m.scale.set(L(from.w, to.w), L(from.h, to.h), L(from.d, to.d));
      // 伸び縮みの色(上ほど伸び = オレンジ)
      writeStressColor(col, 0, -yb * 1.4 * Math.min(1, k / kMax), 1, NEUTRAL);
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.color.setRGB(col[0], col[1], col[2]);
      mat.opacity = 1 - ramp(t, 6.8, 7.8);
    });
    // バネの束が、筋と入れかわりに出てくる
    if (t > 6.8) {
      this.gBank.visible = true;
      b.update(0, 0);
      for (const g of this.bars) g.visible = false;
      for (const g of this.barTags) g.visible = false;
      this.arm.visible = false;
      this.armTag.visible = false;
    }
    this.caption =
      t < 2.3
        ? 'さっきの太い棒。曲げると、上は伸び、下は縮む'
        : t < 4
          ? '真ん中の、薄い一切れに注目'
          : t < 5.2
            ? '一切れを取り出す。中の鋼は、上ほど伸び、下ほど縮んでいる'
            : '鋼の細い1本1本を、バネに見立てる';
    if (t < 2.3) this.look(0, 1.35, 3.2, 2.4, 10, 8);
    else if (t < 5) this.look(0, 1.5, 1.7, 1.35, 22, 10);
    else this.look(-0.9, 1.6, 2.6, 2.4, 10, 8);
  }

  private tickBank(c: number, lever: boolean) {
    const t = this.cyc((lever ? 20 : 15), c);
    const tilt = 0.15 * (lever ? 1 : ramp(t, 1, 3.5));
    this.bank7.update(tilt, lever ? 1 : ramp(t, 7, 8.5));
    const bx = this.bank7.group.position.x;
    const by = this.bank7.group.position.y;
    const x0 = bx + this.bank7.L0 + 1.35;
    const grow = lever ? ramp(t, 10.5, 12.5) : 0;
    for (let i = 0; i < 7; i++) {
      const d = Math.abs(i - 3);
      const y = by + this.bank7.rowY(i);
      const len = 0.24 * d * d * grow;
      setGauge(this.bars[i], x0, y, len, 0.2);
      this.barTags[i].visible = grow > 0.9;
      this.barTags[i].position.set(x0 + len + 0.3, y, 0.3);
    }
    const armOn = lever && t > 5;
    this.arm.visible = armOn;
    this.armTag.visible = armOn;
    if (armOn) {
      const xa = bx + this.bank7.L0 + 0.95;
      setLine(this.arm, xa, by, xa, by + this.bank7.rowY(0), 0.35);
      this.armTag.position.set(xa + 0.25, by + this.bank7.rowY(0) / 2, 0.35);
    }
    if (!lever)
      this.caption =
        t < 1
          ? '棒を薄く輪切りにした1枚を、バネの束で表す'
          : t < 7
            ? '曲がる = 輪切りの面が傾く。上のバネは伸び、下は縮む'
            : '伸びたバネは引き戻し、縮んだバネは押し返す。傾きを戻そうとする';
    else
      this.caption =
        t < 5
          ? 'バネの力は、真ん中から遠いほど大きい(大きく伸び縮みするから)'
          : t < 10.5
            ? '面を回す効き目は、力 × 腕の長さ。腕も、真ん中からの距離'
            : '効き目は 距離 × 距離。3倍遠いバネは、9倍効く';
    this.look(lever ? 0.3 : -0.9, 1.6, lever ? 3.4 : 2.6, 2.4, 10, 8);
  }

  private tickPair(c: number) {
    const t = this.cyc(22, c);
    const tilt = 0.13 * ramp(t, 1, 3);
    this.bank4.update(tilt, 1);
    this.bank8.update(tilt, 1);
    const step = t < 3.5 ? 1 : t < 8 ? 2 : t < 12.5 ? 4 : 8;
    const k = 0.34;
    setGauge(this.gA, -3.4, 0.3, k * ramp(t, 3, 3.5), 0.3);
    const cur = this.gB.scale.x;
    const goal = k * step * ramp(t, 3, 3.5);
    setGauge(this.gB, 0.4, 0.3, cur + (goal - cur) * 0.12, 0.3);
    this.pairTags[2].visible = t > 3.5;
    this.pairTags[3].visible = t > 17.5;
    this.caption =
      t < 3.5
        ? '高さが2倍の断面と比べる(同じ角度だけ傾ける)'
        : t < 8
          ? '① バネの数が 2倍'
          : t < 12.5
            ? '② 端のバネの伸び縮みが 2倍(だから力も 2倍)'
            : t < 17.5
              ? '③ 端のバネの腕の長さが 2倍'
              : '2 × 2 × 2 = 8倍。踏ん張りは、高さの3乗で効く';
    this.look(0, 1.75, 4.0, 2.75, 8, 7);
  }

  /** 長い棒のまま、右(奥)の棒の断面を長方形から H形へ変える。p: 0〜1。戻り値は踏ん張りの倍率 */
  private morphBend(p: number) {
    const q = Math.round(p * 60) / 60;
    const third = RECT.h / 3;
    const lerp = (a: number, b: number) => a + (b - a) * q;
    const tf = lerp(third, H.tf);
    const bf = lerp(RECT.b, H.b);
    const hw = lerp(third, H.hw);
    const tw = lerp(RECT.b, H.tw);
    if (q !== this.morphKey) {
      this.morphKey = q;
      const SB = 1 / 250;
      this.bendH.setSection([
        [bf * SB, tf * SB, ((hw + tf) / 2) * SB],
        [tw * SB, hw * SB, 0],
        [bf * SB, tf * SB, (-(hw + tf) / 2) * SB],
      ]);
    }
    this.bendH.group.position.y = FUL_H + this.bendH.h / 2;
    return iOf(bf, tf, hw, tw) / I_RECT;
  }

  /**
   * 「だから H形」の場面(30 秒)。最初から長い棒2本を見せる:
   * 0〜2.5 同じ量の鉄の長い棒 → 2.5〜8 奥の棒の断面を全長にわたって H形へ → 8〜13 踏ん張り約14倍 → 13〜 同じ力で曲げ比べ
   */
  private tickBend(t: number) {
    const gain = this.morphBend(ramp(t, 2.5, 7.5));
    const push = ramp(t, 14, 16.5) - ramp(t, 28, 29.5);
    const kR = BEND_K * push;
    const kH = kR / H_GAIN;
    const beams: [BendBeam, number, number][] = [
      [this.bendRect, kR, BEND_Z.rect],
      [this.bendH, kH, BEND_Z.h],
    ];
    // 踏ん張りのゲージ(棒の上に浮かべる)。曲げ始めたら消す
    const gShow = t > 0.5 && t < 14;
    const GK = 3.6 / H_GAIN;
    beams.forEach(([b, k, z], j) => {
      b.update(k, () => 0, 0);
      for (let i = 0; i < 2; i++) {
        const [ex, ey] = b.end(k, i ? 1 : -1);
        const top = b.group.position.y + ey;
        // 同じ力 = 同じ長さの矢印
        setArrow(this.bendArrows[j * 2 + i], ex * 0.96, top + 0.08 + 0.8 * push, -0.8 * push, z);
        this.bendArrows[j * 2 + i].visible = push > 0.02;
      }
      const [lx, ly] = b.end(k, -1);
      const ty = b.group.position.y + ly + 0.55 + 0.8 * push;
      this.bendTags[j].position.set(lx + 0.9, ty + 0.2, z);
      // 奥の棒は、H形になってから名前を出す
      this.bendTags[j].visible = j === 0 || t > 7.5;
      this.bendTags[j + 2].position.set(lx + 0.9, ty - 0.22, z);
      this.bendTags[j + 2].visible = t > 17.5 && t < 28;
      const gy = FUL_H + 1.55;
      setGauge(this.bendGauges[j], 0.3, gy, j === 0 ? GK : GK * gain, z);
      this.bendGauges[j].visible = gShow;
      this.bendGTags[j].position.set(1.4, gy + 0.42, z);
      this.bendGTags[j].visible = gShow && (j === 0 || t > 8);
    });
    this.caption =
      t < 2.5
        ? '同じ量の鉄でできた、2本の長い棒'
        : t < 8
          ? '奥の棒の鉄を、全長にわたって上下の端へ移していく'
          : t < 13.5
            ? `同じ量の鉄で、踏ん張りは約${Math.round(H_GAIN)}倍`
            : t < 17.5
              ? '両端を、同じ力で押し下げる'
              : t < 23
                ? `H形の曲がりは約1/${Math.round(H_GAIN)}(曲がりは誇張)`
                : '鉄の量は同じ。違うのは、鉄の置き場所だけ';
    if (t < 13) this.look(0.4, 1.0, 3.6, 2.2, 52, 20);
    else this.look(-0.2, 1.1, 4.1, 2.4, 34, 18);
  }

  /** E: 同じ形の棒を3つの材料で作り、真ん中で支えて両端を同じ力で押し下げる */
  private buildE() {
    const SB = 1 / 250;
    E_CMP.forEach((m, j) => {
      const z = (1 - j) * 2.6;
      const b = new BendBeam(BEND_L, RECT.h * SB, RECT.b * SB, false, true);
      b.setSection([[RECT.b * SB, RECT.h * SB, 0]]);
      const mat = b.mesh.material as THREE.MeshStandardMaterial;
      mat.vertexColors = false;
      mat.color.set(m.color);
      mat.metalness = m.metal;
      mat.roughness = m.rough;
      if (m.opacity < 1) {
        mat.transparent = true;
        mat.opacity = m.opacity;
        mat.emissive.set('#67e8f9');
        mat.emissiveIntensity = 0.25;
      }
      mat.needsUpdate = true;
      b.group.position.set(0, FUL_H + b.h / 2, z);
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.32, FUL_H, 4), DARK());
      f.rotation.y = Math.PI / 4;
      f.position.set(0, FUL_H / 2, z);
      this.gE.add(b.group, f);
      this.eBeams.push(b);
      for (let i = 0; i < 2; i++) {
        const a = arrow('#1f2a44');
        a.scale.set(1.3, 1, 1.3);
        this.gE.add(a);
        this.eArrows.push(a);
      }
      const rel = 200000 / m.e;
      const bend = j === 0 ? '曲がり 1' : rel > 1 ? `曲がり 約${rel.toFixed(1)}倍` : `曲がり 約1/${Math.round(1 / rel)}`;
      for (const [t, c, sz] of [[`${m.name}  E ${m.text} N/mm²`, '#1f2a44', 0.95], [bend, '#6d28d9', 0.95]] as const) {
        const s = tag(t, c, sz, 2.4);
        this.gE.add(s);
        this.eTags.push(s);
      }
    });
  }

  /** I: 同じ量の鉄の4つの断面(長方形・H形の強軸・H形の弱軸・角鋼管)と、踏ん張りの柱 */
  private buildI() {
    const S = 1.2 / 300;
    const Y = 0.85;
    const steel = () => new THREE.MeshStandardMaterial({ color: '#9aa7ba', metalness: 0.55, roughness: 0.4 });
    const yf = ((H.hw + H.tf) / 2) * S;
    const tb = (300 - BOX_IN) / 2;
    // [幅, 高さ, 中心の横, 中心の高さ](mm を絵の単位に)
    const shapes: [number, number, number, number][][] = [
      [[RECT.b * S, RECT.h * S, 0, 0]],
      [[H.b * S, H.tf * S, 0, yf], [H.tw * S, H.hw * S, 0, 0], [H.b * S, H.tf * S, 0, -yf]],
      [[H.tf * S, H.b * S, yf, 0], [H.hw * S, H.tw * S, 0, 0], [H.tf * S, H.b * S, -yf, 0]],
      [[300 * S, tb * S, 0, (150 - tb / 2) * S], [300 * S, tb * S, 0, -(150 - tb / 2) * S], [tb * S, BOX_IN * S, (150 - tb / 2) * S, 0], [tb * S, BOX_IN * S, -(150 - tb / 2) * S, 0]],
    ];
    const vals = [1, I_CMP.hStrong, I_CMP.hWeak, I_CMP.box];
    const names = ['長方形(基準)', 'H形鋼(強軸)', 'H形鋼(弱軸)', '角鋼管'];
    shapes.forEach((parts, i) => {
      // 1つの断面 = 1つの入れ物(断面・中心線・踏ん張りの柱・札)。並べ方は画面の形で変える(tickI)
      const cell = new THREE.Group();
      this.gI.add(cell);
      this.iCells.push(cell);
      const geos = parts.map(([w, h, xc, yc]) => {
        const g = new THREE.BoxGeometry(w, h, 0.9);
        g.translate(xc, yc, 0);
        return g;
      });
      const mesh = new THREE.Mesh(mergeGeometries(geos)!, steel());
      geos.forEach((g) => g.dispose());
      mesh.position.set(0, Y, 0);
      // 曲げの中心線(上下に曲げるので、どれも真ん中の横の線)
      const axis = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.03, 0.03),
        new THREE.MeshBasicMaterial({ color: '#6d28d9', transparent: true, opacity: 0.75, fog: false, toneMapped: false }),
      );
      axis.position.set(0, Y, 0.46);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 1, 0.42),
        new THREE.MeshStandardMaterial({ color: '#6d28d9', emissive: '#6d28d9', emissiveIntensity: 0.55, roughness: 0.4 }),
      );
      bar.userData.v = vals[i];
      cell.add(mesh, axis, bar);
      this.iBars.push(bar);
      const v = vals[i];
      const vt = i === 0 ? '1倍' : `約${v >= 10 ? Math.round(v) : v.toFixed(1)}倍`;
      for (const [t, c, sz] of [[names[i], '#1f2a44', 0.9], [vt, '#6d28d9', 1.15]] as const) {
        const s = tag(t, c, sz, 1.6);
        cell.add(s);
        this.iTags.push(s);
      }
      if (i === 0) {
        const s = tag('中心線', '#6d28d9', 0.6);
        s.position.set(-0.75, Y + 0.22, 0.5);
        cell.add(s);
      }
    });
    this.iFoot = tag('どれも同じ量の鉄・上下に曲げる', '#6d28d9', 0.75, 2.6);
    this.gI.add(this.iFoot);
  }

  private tickE(t: number) {
    const push = ramp(t, 1.0, 2.8) - ramp(t, 7.0, 7.8);
    const K0 = 0.042; // 鉄の棒の曲率(絵の上で誇張)。ほかは E に反比例
    this.eBeams.forEach((b, j) => {
      const k = K0 * (200000 / E_CMP[j].e) * push;
      const z = (1 - j) * 2.6;
      b.update(k, () => 0, 0);
      for (let i = 0; i < 2; i++) {
        const [ex, ey] = b.end(k, i ? 1 : -1);
        const top = b.group.position.y + ey;
        setArrow(this.eArrows[j * 2 + i], ex * 0.96, top + 0.08 + 0.8 * push, -0.8 * push, z);
        this.eArrows[j * 2 + i].visible = push > 0.02;
      }
      const ty = FUL_H + 0.95;
      this.eTags[j * 2].position.set(0, ty + 0.3, z);
      this.eTags[j * 2 + 1].position.set(0, ty - 0.12, z);
      this.eTags[j * 2 + 1].visible = push > 0.7;
    });
    this.caption = t < 2.8 ? 'E = 材料の硬さ。同じ形の棒を、3つの材料で作る' : '同じ力で押すと、E が小さい材料ほど大きく曲がる(曲がりは誇張)';
    this.look(0, 1.0, 4.0, 2.7, 12, 32);
  }

  private tickI(t: number) {
    // スマホの縦長に近い画面では、間を詰めて柱を低くする
    const wide = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight) >= 1.2;
    const GK = (wide ? 2.3 : 1.7) / I_CMP.hStrong;
    this.iCells.forEach((cell, i) => {
      cell.position.set((i - 1.5) * (wide ? 2.5 : 2.05), 0, 0);
      const bar = this.iBars[i];
      const g = ramp(t, 0.8 + 1.1 * i, 1.8 + 1.1 * i);
      const h = Math.max(0.001, GK * bar.userData.v * g);
      bar.visible = g > 0;
      bar.scale.y = h;
      bar.position.set(0, 1.75 + h / 2, -0.1);
      this.iTags[i * 2].position.set(0, -0.4, 0.5);
      const vt = this.iTags[i * 2 + 1];
      vt.position.set(0, 1.75 + h + 0.35, 0);
      vt.visible = g > 0.95;
    });
    this.iFoot.position.set(0, -1.05, 0.5);
    this.caption =
      t < 5.5 ? 'I = 断面の踏ん張りやすさ。同じ量の鉄でも、並べ方で変わる' : '中心線から遠くに鉄があるほど大きい。H形も向きで約3倍違う';
    if (wide) this.look(0, 1.65, 5.4, 2.9, 0, 10);
    else this.look(0, 1.25, 4.3, 3.0, 0, 10);
  }

  protected tick() {
    const s = this.sceneIndex;
    const c = this.clock;
    if (s === 0) {
      this.showOnly(this.gRuler);
      this.tickRuler(c);
    } else if (s === 1) {
      this.showOnly(this.gBlock);
      this.block.setSize(1.0, 0.7);
      this.tickBlock(c);
      this.look(0, 1.35, 3.2, 2.4, 10, 8);
    } else if (s === 2) {
      // 導入(太い棒から一切れを取り出してバネに見立てる 8 秒)→ バネの束の説明(15 秒)
      const t = this.cyc(23, c);
      if (t < 8) this.tickSliceIntro(t);
      else {
        this.showOnly(this.gBank);
        this.tickBank(t - 8, false);
      }
    } else if (s === 3) {
      this.showOnly(this.gBank);
      this.tickBank(c, true);
    } else if (s === 4) {
      this.showOnly(this.gPair);
      this.tickPair(c);
    } else if (s === 5) {
      // 長い棒のまま断面を H形へ(0〜13 秒)→ 同じ力で曲げ比べ(13〜30 秒)
      const t = this.cyc(30, c);
      this.showOnly(this.gBend);
      this.tickBend(t);
    } else if (s === 6) {
      this.cyc(24);
      // 式の記号を1つずつ絵で見せる(1つ 8 秒)
      const f = this.focus >= 0 ? this.focus : Math.floor(c / 8) % 3;
      const tl = c % 8;
      if (f === 0) {
        this.showOnly(this.gE);
        this.tickE(tl);
      } else if (f === 1) {
        this.showOnly(this.gI);
        this.tickI(tl);
      } else {
        this.showOnly(this.gBlock);
        this.block.setSize(1.0, 0.7);
        const k = 0.2 + 0.16 * Math.sin(c * 0.9);
        this.block.update(k, (y) => (-k * y) / (0.36 * 0.5) * 0.8, 1);
        for (const t of this.blockTags) t.visible = false;
        this.caption = '曲率 = 曲がり具合。きつく曲げるほど、抵抗する力も大きい';
        this.look(0, 1.35, 3.2, 2.4, 10, 8);
      }
    } else {
      // 実験室: 断面の幅・高さ・曲げ具合
      this.showOnly(this.gBlock);
      const { b, h, k } = this.lab;
      const S = 1 / 150;
      this.block.setSize(h * S, b * S);
      const kv = k * 30; // 絵の上の曲率(誇張)
      const ey = 355 / 200000;
      this.block.update(kv, (y) => (-(k / 1000) * (y / S)) / ey, 1);
      for (const t of this.blockTags) t.visible = false;
      this.caption = '';
      this.look(0, 1.35, 3.2, 2.4, 18, 12);
    }
  }
}
