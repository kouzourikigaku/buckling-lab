import * as THREE from 'three';
import { plateR, plateStrength, plateTheory, plateWinter } from '../physics/plate.ts';
import { writeStressColor } from './common.ts';
import { ShowBase, aimArrow, arrow, drawTube, label, line, placeArrow, ramp, setLine, tube, axisGuide } from './kit.ts';

const STEEL = new THREE.Color('#8a98ae');
const DARK = () => new THREE.MeshStandardMaterial({ color: '#6f7d94', metalness: 0.45, roughness: 0.5 });
const INK = '#1f2a44';
const OUT = '#ea580c';
const BACK = '#0284c7';
const EDGE = '#16a34a';

function tag(text: string, color: string, size = 0.7, wide = 1) {
  const s = label(text, color, wide);
  s.scale.multiplyScalar(size);
  return s;
}

/** 板の表面に引く格子の線。波の形に沿って動くので、ふくらみが立体に見える */
export class SurfGrid {
  lines: THREE.LineSegments;
  private uv: number[] = [];
  constructor(private b: number, private a: number, nu: number, nv: number) {
    const seg = 36;
    for (let k = 0; k <= nu; k++) for (let i = 0; i < seg; i++) this.uv.push(k / nu, i / seg, k / nu, (i + 1) / seg);
    for (let j = 0; j <= nv; j++) for (let i = 0; i < seg; i++) this.uv.push(i / seg, j / nv, (i + 1) / seg, j / nv);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((this.uv.length / 2) * 3), 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#33415c', transparent: true, opacity: 0.6 }));
    this.lines.frustumCulled = false;
  }
  /** z: 面から出る向きのずれ。dx・dy: 面の中でのずれ(柱ごと曲がるときに使う) */
  update(z: (u: number, v: number) => number, dx?: (u: number, v: number) => number, dy?: (u: number, v: number) => number) {
    const p = this.lines.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.uv.length / 2; i++) {
      const u = this.uv[i * 2];
      const v = this.uv[i * 2 + 1];
      p.setXYZ(i, (u - 0.5) * this.b + (dx ? dx(u, v) : 0), (v - 0.5) * this.a + (dy ? dy(u, v) : 0), z(u, v));
    }
    p.needsUpdate = true;
  }
}


export interface PlateLook {
  /** 波の高さ(絵の単位)と、押す向きの波の数 */
  A?: number;
  m?: number;
  /** 押す力の矢印の長さ(0〜1.2)。上が外力、下が反力 */
  load?: number;
  /** 応力の色: level = 一様な応力/σy、pattern = 波打った後の「縁に偏る」分布の度合い、edge = 縁の応力/σy */
  level?: number;
  pattern?: number;
  edge?: number;
  /** 波の山での、押し出す力(外力による)と戻す力(回復力)の矢印の長さ */
  fOut?: number;
  fBack?: number;
  /** 幅方向の応力 σ/σy(u = 0〜1、圧縮を正)。指定すると level・pattern より優先する */
  stressAt?: (u: number) => number;
  /** 周りを薄くして、真ん中の帯を見せる(0〜1)。帯のたわみ */
  ghost?: number;
  strip?: number;
  /** 支えられた縁を緑に光らせる(0〜1) */
  railGlow?: number;
  /** 札を出すか */
  tags?: boolean;
}

/**
 * 押す向き(縦)に圧縮される板。左右の縁は支え(free なら右の縁は自由)。
 * 板の厚みを持つ箱で描き、面の外へ波打たせる。
 */
export class Plate {
  group = new THREE.Group();
  private mesh: THREE.Mesh;
  private base: Float32Array;
  private grid: SurfGrid;
  /** 裏面の格子(裏から見ても曲がりが分かるように) */
  private gridB: SurfGrid;
  private mat: THREE.MeshStandardMaterial;
  /** 板の縁の面(厚みが見えるよう濃い色) */
  private edgeMat: THREE.MeshStandardMaterial;
  private others: THREE.Material[] = [];
  private strip: THREE.Mesh;
  private stripBase: Float32Array;
  private railMat: THREE.MeshStandardMaterial;
  private top: THREE.Mesh;
  private loadT: THREE.Group[] = [];
  private loadB: THREE.Group[] = [];
  private out: THREE.Group;
  private back: THREE.Group;
  private tags: Record<string, THREE.Sprite> = {};
  private c = new THREE.Color();
  private tmp = new Float32Array(3);

  constructor(public b: number, public a: number, public t: number, private o: { free?: boolean; nx?: number; ny?: number; loads?: number; arrowScale?: number } = {}) {
    const nx = o.nx ?? 24;
    const ny = o.ny ?? 24;
    const geo = new THREE.BoxGeometry(b, a, t, nx, ny, 1);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.base = new Float32Array(geo.attributes.position.array as Float32Array);
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.5, transparent: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide });
    this.edgeMat = new THREE.MeshStandardMaterial({ color: '#2b3a55', metalness: 0.2, roughness: 0.6, transparent: true, side: THREE.DoubleSide });
    // BoxGeometry の面の順: +x, −x, +y, −y(= 板の縁 4つ)、+z, −z(= 表と裏)
    this.mesh = new THREE.Mesh(geo, [this.edgeMat, this.edgeMat, this.edgeMat, this.edgeMat, this.mat, this.mat]);
    this.mesh.position.y = a / 2;
    this.mesh.frustumCulled = false;
    const gu = Math.max(4, Math.round(b / 0.12));
    const gv = Math.max(4, Math.round(a / 0.12));
    this.grid = new SurfGrid(b, a, gu, gv);
    this.gridB = new SurfGrid(b, a, gu, gv);
    this.mesh.add(this.grid.lines, this.gridB.lines);
    this.group.add(this.mesh);

    const sg = new THREE.BoxGeometry(b / 8, a, t * 1.4, 1, 32, 1);
    this.stripBase = new Float32Array(sg.attributes.position.array as Float32Array);
    this.strip = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: '#7c3aed', emissive: '#7c3aed', emissiveIntensity: 0.35, roughness: 0.45 }));
    this.strip.position.y = a / 2;
    this.strip.visible = false;
    this.strip.frustumCulled = false;
    this.group.add(this.strip);

    const dark = DARK();
    // 支え(縁の棒・上下の板)は、板の厚みに沿わせる(厚い板ほど厚く見える)
    const d = t + 0.04;
    this.railMat = new THREE.MeshStandardMaterial({ color: '#6f7d94', metalness: 0.4, roughness: 0.5, emissive: EDGE, emissiveIntensity: 0 });
    for (const side of o.free ? [-1] : [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, a, d), this.railMat);
      r.position.set(side * (b / 2 + 0.025), a / 2, 0);
      this.group.add(r);
    }
    const bot = new THREE.Mesh(new THREE.BoxGeometry(b + 0.12, 0.06, d), dark);
    bot.position.y = -0.03;
    this.top = new THREE.Mesh(new THREE.BoxGeometry(b + 0.12, 0.06, d), dark);
    this.top.position.y = a + 0.03;
    this.group.add(bot, this.top);
    this.others.push(dark, this.railMat);

    const n = o.loads ?? 3;
    const sc = o.arrowScale ?? 0.7;
    for (let i = 0; i < n; i++) {
      const at = arrow(INK);
      at.scale.set(sc, 1, sc);
      const ab = arrow('#64748b');
      ab.scale.set(sc, 1, sc);
      this.group.add(at, ab);
      this.loadT.push(at);
      this.loadB.push(ab);
    }
    this.out = arrow(OUT);
    this.back = arrow(BACK);
    for (const g of [this.out, this.back]) g.scale.set(1.3, 1, 1.3);
    this.group.add(this.out, this.back);
    const mk = (k: string, text: string, color: string, wide = 1) => {
      const s = tag(text, color, 0.55, wide);
      s.visible = false;
      this.group.add(s);
      this.tags[k] = s;
    };
    mk('load', '外力(押す力)', INK);
    mk('react', '反力', '#64748b');
    mk('out', '押し出す力', OUT);
    mk('back', '戻す力', BACK);
    mk('edge', '縁の支え', EDGE);
  }

  /** 切断面(ワールド座標の平面)。null で切らない。板・格子・支えを切る */
  setClip(planes: THREE.Plane[] | null) {
    for (const m of [this.mat, this.edgeMat, ...this.others, this.grid.lines.material as THREE.Material, this.gridB.lines.material as THREE.Material]) {
      m.clippingPlanes = planes;
    }
  }

  private shape(u: number, v: number, m: number) {
    return this.o.free ? u * Math.sin(Math.PI * v) : Math.sin(Math.PI * u) * Math.sin(m * Math.PI * v);
  }

  update(o: PlateLook) {
    const { a, b, t } = this;
    const A = o.A ?? 0;
    const m = o.m ?? 1;
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.mesh.geometry.attributes.color as THREE.BufferAttribute;
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const u = this.base[i * 3] / b + 0.5;
      const v = this.base[i * 3 + 1] / a + 0.5;
      const w = this.shape(u, v, m);
      pa[i * 3 + 2] = this.base[i * 3 + 2] + A * w;
      if (o.stressAt) {
        writeStressColor(this.tmp, 0, Math.max(-1, Math.min(1, o.stressAt(u))), 1, STEEL);
        this.c.setRGB(this.tmp[0], this.tmp[1], this.tmp[2]);
      } else if (o.level === undefined) {
        this.c.copy(STEEL).offsetHSL(0, 0, A > 0.001 ? w * 0.2 * Math.min(1, A / 0.06) : 0);
      } else {
        const e = this.o.free ? 1 - u : Math.abs(Math.cos(Math.PI * u));
        const pat = o.pattern ?? 0;
        const sv = o.level * (1 - pat) + (0.05 + 0.95 * (o.edge ?? 1) * e ** 2.6) * pat;
        writeStressColor(this.tmp, 0, Math.min(1, sv), 1, STEEL);
        this.c.setRGB(this.tmp[0], this.tmp[1], this.tmp[2]);
      }
      ca[i * 3] = this.c.r;
      ca[i * 3 + 1] = this.c.g;
      ca[i * 3 + 2] = this.c.b;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.grid.update((u, v) => A * this.shape(u, v, m) + t / 2 + 0.004);
    this.gridB.update((u, v) => A * this.shape(u, v, m) - t / 2 - 0.004);
    const ghost = o.ghost ?? 0;
    this.mat.opacity = 1 - 0.82 * ghost;
    this.edgeMat.opacity = 1 - 0.82 * ghost;
    (this.grid.lines.material as THREE.LineBasicMaterial).opacity = 0.6 * (1 - 0.8 * ghost);
    (this.gridB.lines.material as THREE.LineBasicMaterial).opacity = 0.6 * (1 - 0.8 * ghost);
    this.mat.depthWrite = ghost < 0.5;
    this.edgeMat.depthWrite = ghost < 0.5;

    // 真ん中の帯(柱とみなす)
    this.strip.visible = o.strip !== undefined;
    if (this.strip.visible) {
      const sp = this.strip.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sp.count; i++) {
        const v = this.stripBase[i * 3 + 1] / a + 0.5;
        sp.setZ(i, this.stripBase[i * 3 + 2] + (o.strip ?? 0) * Math.sin(Math.PI * v));
      }
      sp.needsUpdate = true;
      this.strip.geometry.computeVertexNormals();
    }
    this.railMat.emissiveIntensity = 0.9 * (o.railGlow ?? 0);

    // 外力と反力
    const L = o.load ?? 0;
    const n = this.loadT.length;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n - 0.5) * b;
      const len = L > 0.005 ? 0.12 + 0.3 * Math.min(1.2, L) : 0;
      placeArrow(this.loadT[i], x, a + 0.08 + len, 0, 0, -len);
      placeArrow(this.loadB[i], x, -0.08 - len, 0, 0, len);
    }
    // 波の山での、押し出す力と戻す力
    const uc = this.o.free ? 1 : 0.5;
    const vc = this.o.free ? 0.5 : 1 / (2 * m);
    const xc = (uc - 0.5) * b - (this.o.free ? 0.08 : 0);
    const yc = vc * a;
    const zs = A * this.shape(uc, vc, m) + t / 2 + 0.03;
    const fo = o.fOut ?? 0;
    const fb = o.fBack ?? 0;
    aimArrow(this.out, xc, yc + 0.17, zs, 0, 0, fo);
    aimArrow(this.back, xc, yc - 0.17, zs + fb, 0, 0, -fb);
    const show = !!o.tags;
    this.tags.load.visible = show && L > 0.01;
    this.tags.load.position.set(b / 2 + 0.5, a + 0.3, 0);
    this.tags.react.visible = show && L > 0.01;
    this.tags.react.position.set(b / 2 + 0.3, -0.2, 0);
    this.tags.out.visible = show && fo > 0.06;
    this.tags.out.position.set(xc, yc + 0.36, zs + fo + 0.15);
    this.tags.back.visible = show && fb > 0.06;
    this.tags.back.position.set(xc, yc - 0.36, zs + fb + 0.15);
    this.tags.edge.visible = show && (o.railGlow ?? 0) > 0.3;
    this.tags.edge.position.set(-b / 2 - 0.45, a * 0.8, 0.1);
  }
}

/** 薄い板4枚でできた箱形の柱。押すと板が交互に波打つ */
class BoxCol {
  group = new THREE.Group();
  private walls: { mesh: THREE.Mesh; base: Float32Array; grid: SurfGrid; gridB: SurfGrid }[] = [];
  /** 壁の厚さ(絵)。厚みが見えるよう、縁の面は濃い色 */
  private T = 0.06;
  private top: THREE.Mesh;
  private arrow: THREE.Group;

  constructor(private a: number, private b: number) {
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.rotation.y = (i * Math.PI) / 2;
      // 隣の壁と角で重なるよう、厚み分だけ幅を広げる
      const geo = new THREE.BoxGeometry(b + this.T, a, this.T, 32, 64, 1);
      const face = new THREE.MeshStandardMaterial({ color: '#8a98ae', metalness: 0.35, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const edge = new THREE.MeshStandardMaterial({ color: '#2b3a55', metalness: 0.2, roughness: 0.6 });
      const mesh = new THREE.Mesh(geo, [edge, edge, edge, edge, face, face]);
      mesh.position.set(0, a / 2, b / 2);
      mesh.frustumCulled = false;
      g.add(mesh);
      this.group.add(g);
      const grid = new SurfGrid(b, a, 6, 15);
      const gridB = new SurfGrid(b, a, 6, 15);
      mesh.add(grid.lines, gridB.lines);
      this.walls.push({ mesh, base: new Float32Array(geo.attributes.position.array as Float32Array), grid, gridB });
    }
    const dark = DARK();
    const bot = new THREE.Mesh(new THREE.BoxGeometry(b + 0.6, 0.18, b + 0.6), dark);
    bot.position.y = -0.09;
    this.top = new THREE.Mesh(new THREE.BoxGeometry(b + 0.6, 0.18, b + 0.6), dark);
    this.arrow = arrow('#1f2a44');
    this.arrow.scale.set(2, 1, 2);
    this.group.add(bot, this.top, this.arrow);
  }

  update(A: number, m: number, load: number) {
    const { a, b } = this;
    this.walls.forEach((w, i) => {
      const p = w.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const sgn = i % 2 ? -1 : 1;
      const T = this.T;
      for (let k = 0; k < p.count; k++) {
        const u = Math.max(0, Math.min(1, w.base[k * 3] / b + 0.5));
        const v = w.base[k * 3 + 1] / a + 0.5;
        p.setZ(k, w.base[k * 3 + 2] + sgn * A * Math.sin(m * Math.PI * v) * Math.sin(Math.PI * u));
      }
      p.needsUpdate = true;
      w.mesh.geometry.computeVertexNormals();
      w.grid.update((u, v) => sgn * A * Math.sin(m * Math.PI * v) * Math.sin(Math.PI * u) + T / 2 + 0.004);
      w.gridB.update((u, v) => sgn * A * Math.sin(m * Math.PI * v) * Math.sin(Math.PI * u) - T / 2 - 0.004);
    });
    this.top.position.y = a + 0.09;
    const len = 0.3 + 0.8 * Math.min(1.2, load);
    placeArrow(this.arrow, 0, a + 0.24 + len, 0, 0, load > 0.005 ? -len : 0);
  }
}


/* ---------- 板を並べた列と、奥のグラフの壁 ---------- */

/** 並べる板の R(左ほど厚い板) */
export const RS = [0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.5, 1.7, 1.9, 2.1];
const N = RS.length;
const X = (R: number) => (R - 1.2) * 3.4;
const Y = (s: number) => 1.95 + s * 2.3;
const ZP = 0.6;
const ZG = -0.5;
/** 両縁支持(k = 4)、σy = 355、E = 2.0×10⁵、ν = 0.3 で R = 1 になる幅厚比 */
export const BT1 = 1 / plateR(1, 1, 355, 4);
const PB = 0.5; // 並べる板の幅(絵)
// 応力の柱(場面「縁に寄る」): 下端の高さ、σy の高さ、この板の σel/σy(R = 1.6)、分布の形 1 − sin(πu) の平均
const NB = 18;
const BAR0 = 2.0;
const BARH = 0.9;
const EDGE_EL = 1 / (1.6 * 1.6);
const SHAPE = 1 - 2 / Math.PI;
/** 並べる板の厚み(絵): 本当の t/b(両縁支持・σy = 355 で b/t = BT1 × R)を、どの板も同じ 3 倍に誇張する。厚みの比は正しい */
const thick = (R: number) => Math.max(0.012, (3 * PB) / (BT1 * R));

function curve(f: (R: number) => number, r0: number, r1: number, rad: number, color: string) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 90; i++) {
    const R = r0 + ((r1 - r0) * i) / 90;
    pts.push(new THREE.Vector3(X(R), Y(Math.min(1.25, f(R))), ZG));
  }
  return tube(pts, rad, color);
}
function dot(r: number, color: string) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.4 }));
  m.scale.setScalar(0.001);
  return m;
}

export interface Lab5 {
  b: number; // mm
  t: number; // mm
  /** 座屈係数: 4(両縁支持)か 0.43(自由突出) */
  k: number;
  load: number; // σ/σy
}
export const SIGMA_Y = 355;
export const labR = (l: Lab5) => plateR(l.b, l.t, SIGMA_Y, l.k);

export class Stage5Show extends ShowBase {
  private gBox = new THREE.Group();
  private box: BoxCol;
  private gOne = new THREE.Group();
  private one: Plate;
  private gPair = new THREE.Group();
  private wide: Plate;
  private narrow: Plate;
  private pairTags: THREE.Sprite[] = [];
  private gSup = new THREE.Group();
  private both: Plate;
  private free: Plate;
  private supTags: THREE.Sprite[] = [];
  /** 幅の場面: 板の下の紫の寸法線(b と b/2) */
  private bDims: { g: THREE.Group; v: THREE.Mesh; t0: THREE.Mesh; t1: THREE.Mesh; tag: THREE.Sprite; W: number }[] = [];
  /** 幅・支え方の場面: 戻す力(青)の倍率の札 */
  private backTags: THREE.Sprite[] = [];
  /** 綱引きの場面: 板を真ん中で切った断面(ふくらみの形・元の平らな面・波の高さ w) */
  private cut = new THREE.Group();
  private cutPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10);
  private cutRef: THREE.Line;
  private cutProf: THREE.Mesh | null = null;
  private cutKey = -1;
  private wBar: THREE.Mesh;
  private wTag: THREE.Sprite;
  private cutTag: THREE.Sprite;
  /** 綱引き・幅・支え方の場面の段階と押す応力(Stage5.tsx が式のカードに使う)。-1 = ほかの場面 */
  info = { phase: -1, p: 0 };
  private gLine = new THREE.Group();
  private plates: Plate[] = [];
  private keys: string[] = [];
  private gWall = new THREE.Group();
  private cYield: THREE.Mesh;
  private cEl: THREE.Mesh;
  private cIdeal: THREE.Mesh;
  private cReal: THREE.Mesh;
  private cDesign: THREE.Mesh;
  private dotI: THREE.Mesh[] = [];
  private dotR: THREE.Mesh[] = [];
  private popI = new Array(N).fill(0);
  private popR = new Array(N).fill(0);
  private mark1: THREE.Group;
  private probe: THREE.Mesh;
  private gLab = new THREE.Group();
  private labPlates: Record<string, Plate> = {};
  private amp = [0, 0, 0];
  private gBars = new THREE.Group();
  private bars: THREE.Mesh[] = [];
  private barTags: THREE.Sprite[] = [];
  private barY = new THREE.Group();
  private barEl = new THREE.Group();
  lab: Lab5 = { b: 900, t: 12, k: 4, load: 0.3 };

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.addFloor(-0.2);
    this.scene.add(this.gBox, this.gOne, this.gPair, this.gSup, this.gLine, this.gWall, this.gLab, this.gBars);
    this.box = new BoxCol(3.3, 1.35);
    this.gBox.add(this.box.group);

    this.one = new Plate(1.4, 1.4, 0.06, { loads: 3 });
    this.gOne.add(this.one.group);

    // 板の上に、幅方向に並ぶ応力の柱(波打つと縁に寄る様子を見せる)
    for (let i = 0; i < NB; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.05), new THREE.MeshStandardMaterial({ color: BACK, emissive: BACK, emissiveIntensity: 0.4 }));
      this.gBars.add(m);
      this.bars.push(m);
    }
    const hline = (g: THREE.Group, color: string, dashed: boolean, y: number, text: string) => {
      const l = line(color, dashed);
      setLine(l, -0.78, y, 0.78, y, 0.03);
      const s2 = tag(text, color, 0.55);
      s2.position.set(-0.98, y, 0.03);
      g.add(l, s2);
      this.gBars.add(g);
    };
    hline(this.barY, '#e11d48', false, BAR0 + BARH, 'σy');
    hline(this.barEl, '#6d28d9', true, BAR0 + BARH * EDGE_EL, 'σel');
    for (const [t, c] of [['幅方向に並ぶ応力', INK], ['縁', EDGE], ['縁', EDGE], ['中央', INK]] as const) {
      const s2 = tag(t, c, 0.55, t.length > 4 ? 2 : 1);
      this.gBars.add(s2);
      this.barTags.push(s2);
    }
    this.barTags[0].position.set(0, BAR0 + BARH + 0.28, 0.03);
    this.barTags[1].position.set(-0.7, BAR0 - 0.14, 0.03);
    this.barTags[2].position.set(0.7, BAR0 - 0.14, 0.03);
    this.barTags[3].position.set(0, BAR0 - 0.14, 0.03);

    this.wide = new Plate(1.4, 1.4, 0.06, { loads: 3 });
    this.wide.group.position.x = -1.15;
    this.narrow = new Plate(0.7, 1.4, 0.06, { loads: 2 });
    this.narrow.group.position.x = 1.25;
    this.gPair.add(this.wide.group, this.narrow.group);
    for (const [t, x, y, c] of [['幅 b', -1.15, -0.5, INK], ['幅 b/2', 1.25, -0.5, INK], ['σel で波打つ', -1.15, 2.05, '#6d28d9'], ['4σel で波打つ', 1.25, 2.05, '#6d28d9']] as const) {
      const s = tag(t, c, 0.7);
      s.position.set(x, y, 0.3);
      this.gPair.add(s);
      this.pairTags.push(s);
    }

    // 綱引きの断面の絵(板 one の真ん中、x = 0 の面に描く)
    this.cutRef = line('#1f2a44', true);
    setLine(this.cutRef, 0.004, 0, 0.004, 1.4, 0);
    this.wBar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1), new THREE.MeshBasicMaterial({ color: '#6d28d9', fog: false, toneMapped: false }));
    this.wTag = tag('w(波の高さ)', '#6d28d9', 0.75, 1.4);
    this.cutTag = tag('切った断面', '#6d28d9', 0.6, 1.2);
    this.cut.add(this.cutRef, this.wBar, this.wTag, this.cutTag);
    this.cut.visible = false;
    this.gOne.add(this.cut);

    // 紫の寸法線(板の下)。σel の式の b = この幅
    for (const [pl, text] of [[this.wide, '幅 b'], [this.narrow, '幅 b/2']] as const) {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: '#6d28d9', fog: false, toneMapped: false });
      const v = new THREE.Mesh(new THREE.BoxGeometry(1, 0.025, 0.025), mat);
      const t0 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.025), mat);
      const t1 = t0.clone();
      const tg = tag(text, '#6d28d9', 0.95);
      g.add(v, t0, t1, tg);
      g.position.set(pl.group.position.x, -0.22, 0.15);
      this.gPair.add(g);
      this.bDims.push({ g, v, t0, t1, tag: tg, W: pl.b });
    }
    for (const [t, parent] of [['戻す力 1', this.gPair], ['戻す力 4', this.gPair], ['戻す力 1', this.gSup], ['戻す力 約1/9', this.gSup]] as const) {
      const s2 = tag(t, BACK, 0.6);
      s2.visible = false;
      parent.add(s2);
      this.backTags.push(s2);
    }

    this.both = new Plate(1.2, 1.4, 0.06, { loads: 3 });
    this.both.group.position.x = -1.1;
    this.free = new Plate(1.2, 1.4, 0.06, { loads: 3, free: true });
    this.free.group.position.x = 1.15;
    this.gSup.add(this.both.group, this.free.group);
    for (const [t, x, y, c] of [['両縁支持 k = 4', -1.1, -0.5, INK], ['自由突出 k = 0.43', 1.15, -0.5, INK], ['自由な縁', 2.15, 1.65, OUT]] as const) {
      const s = tag(t, c, 0.65, t.length > 6 ? 2 : 1);
      s.position.set(x, y, 0.3);
      this.gSup.add(s);
      this.supTags.push(s);
    }

    // 並べる板
    RS.forEach((R) => {
      const p = new Plate(PB, PB, thick(R), { nx: 12, ny: 12, loads: 1, arrowScale: 0.8 });
      p.group.position.set(X(R), 0, ZP);
      this.gLine.add(p.group);
      this.plates.push(p);
      this.keys.push('');
    });

    // グラフの壁
    const board = new THREE.Mesh(new THREE.PlaneGeometry(10.3, 5.0), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false }));
    board.position.set(-0.4, Y(0.6) - 0.55, ZG - 0.12);
    this.gWall.add(board);
    const ax = (x0: number, y0: number, x1: number, y1: number, c = '#64748b') => {
      const l = line(c);
      setLine(l, x0, y0, x1, y1, ZG - 0.02);
      this.gWall.add(l);
    };
    const put = (t: string, x: number, y: number, c = '#44536e', size = 0.7, wide = 1) => {
      const s = tag(t, c, size, wide);
      s.position.set(x, y, ZG);
      this.gWall.add(s);
      return s;
    };
    ax(X(0), Y(0), X(2.4), Y(0));
    ax(X(0), Y(0), X(0), Y(1.25));
    for (const R of [0.5, 1, 1.5, 2]) {
      ax(X(R), Y(0), X(R), Y(0) - 0.07);
      put(R.toFixed(1), X(R), Y(0) - 0.2, '#1f2a44', 0.75);
    }
    for (const s of [0.5, 1]) {
      ax(X(0), Y(s), X(2.4), Y(s), '#d5dce8');
      put(s.toFixed(1), X(0) - 0.3, Y(s), '#1f2a44', 0.75);
    }
    put('σcr/σy', X(0) + 0.15, Y(1.33), INK, 0.8);
    // 軸の意味: 右ほど薄い板、上ほど耐えられる応力が大きい
    this.gWall.add(
      axisGuide({ x0: X(0), x1: X(2.4), y0: Y(0), y1: Y(1.2), z: ZG, below: 0.95, left: 0.66, xLeft: '← 厚い板', xRight: '薄い板 →', xName: '幅厚比パラメータ R', yText: '耐えられる力(強さ)→', glyph: 'plate' }),
    );
    this.cYield = curve(() => 1, 0, 2.4, 0.022, '#e11d48');
    this.cEl = curve(plateTheory, 0.89, 2.4, 0.02, '#6d28d9');
    this.cIdeal = curve((R) => Math.min(1, plateTheory(R)), 0.01, 2.4, 0.034, '#16a34a');
    this.cReal = curve(plateWinter, 0.01, 2.4, 0.03, '#0f766e');
    this.cReal.position.z = 0.02;
    this.cDesign = curve(plateStrength, 0.01, 2.4, 0.04, '#0284c7');
    this.cDesign.position.z = 0.04;
    this.gWall.add(this.cYield, this.cEl, this.cIdeal, this.cReal, this.cDesign);
    RS.forEach((R) => {
      const a = dot(0.075, '#16a34a');
      a.position.set(X(R), Y(Math.min(1, plateTheory(R))), ZG + 0.08);
      const b = dot(0.075, '#0f766e');
      b.position.set(X(R), Y(plateWinter(R)), ZG + 0.12);
      this.gWall.add(a, b);
      this.dotI.push(a);
      this.dotR.push(b);
    });
    this.mark1 = new THREE.Group();
    const ml = line(INK, true);
    setLine(ml, X(1), Y(0), X(1), Y(1.22), ZG + 0.02);
    const t1 = tag('R = 1(σel = σy)', INK, 0.65, 2);
    t1.position.set(X(1), Y(1.3), ZG);
    const ta = tag('降伏が先', '#e11d48', 0.7);
    ta.position.set(X(0.5), Y(1.14), ZG);
    const tb = tag('波打ちが先', '#6d28d9', 0.7);
    tb.position.set(X(1.7), Y(1.14), ZG);
    this.mark1.add(ml, t1, ta, tb);
    this.gWall.add(this.mark1);
    this.probe = dot(0.1, '#e11d48');
    this.probe.scale.setScalar(1);
    this.gWall.add(this.probe);

    // 実験室の板(両縁支持・自由突出)
    for (const k of ['both', 'free']) {
      const p = new Plate(1.0, 1.0, 0.05, { loads: 3, free: k === 'free', nx: 18, ny: 18 });
      p.group.position.z = ZP;
      this.gLab.add(p.group);
      this.labPlates[k] = p;
    }
    this.setScene(0);
  }

  /** 縦長に近い狭い画面か(スマホ)。式のカードを重ねる場面で少し引く */
  private isNarrow() {
    return this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight) < 1.2;
  }

  /** 左に式のカードを重ねる場面で、絵を画面の右へ d だけ寄せる(カメラの向き az 度に合わせる) */
  private shiftRight(g: THREE.Group, d: number, az: number) {
    const r = (az * Math.PI) / 180;
    g.position.set(d * Math.cos(r), 0, -d * Math.sin(r));
  }

  private show(...gs: THREE.Group[]) {
    for (const g of [this.gOne, this.gPair, this.gSup]) g.position.set(0, 0, 0);
    this.info.phase = -1;
    this.cut.visible = false;
    this.one.setClip(null);
    for (const g of [this.gBox, this.gOne, this.gPair, this.gSup, this.gLine, this.gWall, this.gLab, this.gBars]) g.visible = gs.includes(g);
  }

  /** 幅方向の応力の柱。sAt(u) = σ/σy */
  private setBars(sAt: (u: number) => number) {
    const w = 1.4 / NB;
    this.bars.forEach((m, i) => {
      const u = (i + 0.5) / NB;
      const v = Math.max(0.002, sAt(u));
      m.scale.set(w * 0.8, v * BARH, 1);
      m.position.set((u - 0.5) * 1.4, BAR0 + (v * BARH) / 2, 0);
      const mat = m.material as THREE.MeshStandardMaterial;
      // 縁(いちばん外側の柱)が σy に届いたら赤
      const col = sAt(0) >= 0.995 && (i === 0 || i === NB - 1) ? '#e11d48' : BACK;
      mat.color.set(col);
      mat.emissive.set(col);
    });
  }

  /** 溶接のゆがみと残留応力(現実の板が R = 1 付近で弱くなる理由) */
  private tickWeld(c: number) {
    // 現実の板①(26 秒): 残留応力と初期たわみ → 押すと、残留圧縮のある中央側が先に σel 付近に達して反りがふくらむ
    // → ふくらんだ中央は力を受けにくくなり、増えた力は縁側へ → 縁側が σy に届いて限界(理想の σy より早い)
    this.show(this.gOne);
    const t = this.cyc(26, c);
    const fade = 1 - ramp(t, 25, 26);
    const res = ramp(t, 1, 3) * fade;
    const A0 = 0.035 * ramp(t, 6, 8) * fade;
    // 押す応力 σ/σy(この板は R ≒ 1 = σel ≒ σy の板として描く)。限界は約 0.78(Winter の式の R = 1 の値)
    const p = 0.78 * ramp(t, 10, 21) * fade;
    // 初期たわみは、押すと 1/(1 − σ/σel) 倍に増える(柱の初期たわみと同じ)。絵では増えすぎないよう頭打ち
    const A = Math.min(0.2, A0 / (1 - 0.9 * p));
    // 反りがふくらむほど、押す力の受け持ちが縁側へ寄る(0 = 一様、1 = 縁に寄った分布)
    const shift = ramp(p, 0.35, 0.78);
    // 縁に寄った分布(幅で平均すると 1): 中央 0.3、縁 1.8 くらい
    const share = (u: number) => {
      const e = 1 - 0.85 * Math.sin(Math.PI * u);
      return (1 - shift) + (shift * e) / (1 - (0.85 * 2) / Math.PI);
    };
    // 残留応力: 溶接した縁のごく近くは引張、中央側は圧縮(幅で平均すると0)
    const resid = (u: number) => res * (0.25 - 1.0 * Math.abs(Math.cos(Math.PI * u)) ** 10);
    this.one.update({ A, load: p, stressAt: (u) => resid(u) * 0.8 + p * share(u), railGlow: 0.6, tags: t > 10 });
    this.caption =
      t < 6
        ? '溶接した縁のごく近くには引張(オレンジ)、中央側には圧縮(青)の残留応力が残る'
        : t < 10
          ? 'さらに、溶接で縮んだ分、板はわずかに反っている(初期たわみ)'
          : t < 14.5
            ? '押すと、もともと押されている中央側が先に限界に近づき、反りがふくらむ'
            : t < 19.5
              ? 'ふくらんだ中央は力を受けにくくなり、増えた力は縁側へ寄る'
              : '縁側が降伏(赤)して限界。理想(σy まで)より早い';
    this.look(0, 0.75, 1.6, 1.35, 30, 14);
  }

  /** 波打った板は、中央が力を受けず、縁に力が寄る(板の低減率が要る、板だけの理由) */
  private tickEdge(c: number) {
    this.show(this.gOne, this.gBars);
    const t = this.cyc(24, c);
    const fade = 1 - ramp(t, 23, 24);
    const el = EDGE_EL;
    const ult = el + (1 - el) * SHAPE;
    // 平均応力 σ/σy
    const avg = (t < 7 ? el * ramp(t, 1, 6.5) : el + (ult - el) * ramp(t, 7, 14)) * fade;
    const over = Math.max(0, avg - el);
    const sAt = (u: number) => (avg <= el ? avg : el + (over * (1 - Math.sin(Math.PI * u))) / SHAPE);
    this.setBars(sAt);
    const A = 0.16 * Math.min(1, over / Math.max(0.01, ult - el)) + (avg >= el * 0.999 ? 0.04 : 0);
    this.one.update({ A: A * fade, load: avg / ult, stressAt: sAt, railGlow: 1, tags: false });
    this.barEl.visible = true;
    this.caption =
      t < 7
        ? `押していく(平均 ${Math.round(avg * 100)}%)。波打つまでは、どこも同じ応力`
        : t < 15
          ? `波打った(平均 ${Math.round(avg * 100)}%)。増えた力は縁が受ける`
          : `縁が σy に届いて限界。平均は σy の ${Math.round(ult * 100)}%`;
    this.look(0, 1.75, 1.6, 2.25, 18, 8);
  }

  private wall(fy: number, fe: number, fi: number, fr: number, fd: number, mark: boolean, probe: number | null) {
    drawTube(this.cYield, fy);
    drawTube(this.cEl, fe);
    drawTube(this.cIdeal, fi);
    drawTube(this.cReal, fr);
    drawTube(this.cDesign, fd);
    this.mark1.visible = mark;
    this.probe.visible = probe !== null;
    if (probe !== null) this.probe.position.set(X(Math.min(2.4, probe)), Y(plateStrength(probe)), ZG + 0.16);
  }

  protected tick(dt: number) {
    const raw = this.sceneIndex;
    const c0 = this.clock;
    // 場面の並び(柱の説明と同じ順): 0 現象 → 1 綱引き → 2 幅と厚み → 3 支え方 → 4 10枚並べる → 5 厚い板 → 6 薄い板
    // → 7 σel の線 → 8 理想の板 → 9 現実の板(点)→ 10 なぜ下がる(溶接)→ 11 なぜ σy まで使えない(縁に寄る)→ 12 設計式 → 13 実験室
    if (raw === 10) return this.tickWeld(c0);
    if (raw === 11) return this.tickEdge(c0);
    // 中で使う番号(0 現象・2 綱引き・3 幅・5 支え方・6 R・61 厚い板・62 薄い板・63 σel の線・7 理想・8 現実・9 設計・10 実験室)
    const MAP = [0, 2, 3, 5, 6, 61, 62, 63, 7, 8, -1, -1, 9, 10];
    const s = MAP[Math.min(raw, MAP.length - 1)];
    const c = this.clock;
    const k6 = 1 - Math.exp(-dt * 6);
    if (s === 0) {
      // 現象(28 秒): 箱形の柱の板が波打つ(0〜12 秒)→ 壁を1枚取り出して押す → 突然波打つ = σel(12〜28 秒)
      const T = this.cyc(28, c);
      if (T < 12) {
        this.show(this.gBox);
        const t = T;
        const p = ramp(t, 1, 6);
        const A = 0.2 * ramp(t, 5, 6.5);
        this.box.update(A, 3, p);
        this.caption = t < 1 ? '薄い板でできた、箱形の柱を押す' : t < 5 ? '柱はまっすぐ立っている…' : t < 10 ? '柱はまっすぐなのに、板が波打った = 局部座屈' : 'この壁を1枚取り出して、押してみる';
        this.look(0, 1.75, 2.6, 3.0, 32, 14);
      } else {
        this.show(this.gOne);
        const t = T - 12;
        const p = Math.min(1, ramp(t, 2, 9)) * (1 - ramp(t, 14.5, 16));
        const A = 0.2 * (ramp(t, 8.9, 9.6) - ramp(t, 14.5, 16));
        this.one.update({ A, load: p, level: 0.5 * p, pattern: A > 0.02 ? 0.4 : 0, edge: 0.6, railGlow: ramp(t, 0.5, 2), tags: true });
        this.caption =
          t < 2 ? '箱の壁を1枚。両側の縁は、隣の板に支えられている(緑)' : t < 8.9 ? `押す力 ${Math.round(p * 100)}%。板は平らなまま` : '突然波打った。この応力が σel(弾性局部座屈応力)';
        this.look(0, 0.75, 1.6, 1.35, 32, 14);
      }
    } else if (s === 2) {
      this.show(this.gOne);
      // 映像2 の綱引きと同じ筋(44 秒): もし波打ったら → 真ん中で切って w を見せる → 押し出す力 σt × w → 戻す力 D × 1/R = kπ²D/b² × w
      // → w は両方に同じ → σt と kπ²D/b²(t で割ると σ と σel)を比べる → 超えた瞬間に波打つ
      const t = this.cyc(44, c);
      let p = 0.5;
      let A = 0.13;
      if (t < 3) A = 0.13 * ramp(t, 1.2, 2.8);
      else if (t >= 20 && t < 25) A = 0.13 + 0.09 * ramp(t, 20.5, 23);
      else if (t >= 25 && t < 36) {
        A = 0.22 - 0.09 * ramp(t, 25, 26);
        p = 0.5 + 0.5 * ramp(t, 26.5, 34);
      } else if (t >= 36) {
        p = 1.1;
        A = Math.min(0.3, 0.13 * Math.exp((t - 36) * 0.15)) * (1 - ramp(t, 42.5, 44));
      }
      this.info.phase = t < 7 ? 0 : t < 13 ? 1 : t < 16.5 ? 2 : t < 20 ? 3 : t < 25 ? 4 : t < 36 ? 5 : 6;
      this.info.p = p;
      this.caption =
        t < 3
          ? '押している板が、もし少し波打ったら?'
          : t < 7
            ? '真ん中で切ると、断面は曲がった柱と同じ形。ふくらみの高さが w'
            : t < 13
              ? '押す力 σt が、腕 w で波を押し出す(柱の P × y と同じ)'
              : t < 20
                ? '板の曲げにくさ D が、波を戻そうとする(柱の EI × 1/R と同じ)'
                : t < 25
                  ? '波を大きくしても、2つは同じ割合で増える'
                  : t < 34
                    ? `押す応力を上げる(σel の ${Math.round(p * 100)}%)。まだ戻す方が強い`
                    : t < 36
                      ? '追いついた。これが σel'
                      : '超えた瞬間、波が大きくなって止まらない';
      const fb = 1.6 * A;
      this.one.update({ A, load: p, fOut: t >= 7 ? fb * p : 0, fBack: t >= 13 ? fb : 0, railGlow: 1, tags: true });
      // 左に式のカードを重ねるので、板は右寄せに
      this.shiftRight(this.gOne, 0.75, 72);
      // 断面: 手前の半分(x > 0)を切り取る。3〜5.5 秒で切り進める
      const cutP = ramp(t, 3, 5.5) * (1 - ramp(t, 42.5, 44));
      const X0 = this.gOne.position.x;
      if (cutP > 0.001) {
        this.cutPlane.constant = X0 + 0.8 * (1 - cutP);
        this.one.setClip([this.cutPlane]);
      }
      this.cut.visible = cutP > 0.98;
      if (this.cut.visible) {
        const a = this.one.a;
        const key = Math.round(A * 400);
        if (key !== this.cutKey) {
          this.cutKey = key;
          if (this.cutProf) {
            this.cut.remove(this.cutProf);
            this.cutProf.geometry.dispose();
          }
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 40; i++) pts.push(new THREE.Vector3(0.01, (i / 40) * a, A * Math.sin((Math.PI * i) / 40) + 0.035));
          this.cutProf = tube(pts, 0.014, '#6d28d9', 0.6);
          this.cut.add(this.cutProf);
        }
        // 波の高さ w の寸法(元の平らな面 → ふくらみの頂上)。矢印はふくらみの外側に出るので、内側に引く
        const yw = a * 0.5;
        const wz = A + 0.03;
        this.wBar.scale.z = Math.max(0.001, wz);
        this.wBar.position.set(0.02, yw, wz / 2);
        // 札は板の右側(カメラから見て奥 = −z)に置く
        this.wTag.position.set(0.02, yw, -0.42);
        this.cutTag.position.set(0.02, 0.12, -0.55);
        this.cutTag.visible = t < 13;
      }
      const zw = this.isNarrow() ? 1.25 : 1;
      this.look(0.15, 0.8, 1.45 * zw, 1.25 * zw, 72, 10);
    } else if (s === 3) {
      // 幅(36 秒): σel の式の b = 板の幅(紫の寸法線)→ 同じだけ波打たせて戻す力(青)を比べる → 同じ応力で押す
      this.show(this.gPair);
      const T = this.cyc(36, c);
      const grow = ramp(T, 0.4, 2.2);
      this.bDims.forEach((d) => {
        const w = Math.max(0.001, d.W * grow);
        d.v.scale.x = w;
        d.t0.position.x = -d.W / 2;
        d.t1.position.x = -d.W / 2 + w;
        d.v.position.x = -d.W / 2 + w / 2;
        d.tag.position.set(0, -0.2, 0);
        d.tag.visible = grow > 0.95;
      });
      // 戻す力の長さ = その板の σel の比(広い板 1、狭い板 4)。曲げる力(押し出す力)= 押す応力 × 波の高さ
      const FB = 4.0;
      const trial = T >= 3.5 && T < 10 ? 0.12 * ramp(T, 4, 5.5) * (1 - ramp(T, 9, 10)) : -1;
      const t = Math.max(0, T - 10);
      const fade = 1 - ramp(t, 25, 26);
      const p = T < 10 ? 0 : 4.2 * ramp(t, 1.5, 15) * fade;
      if (trial >= 0) {
        this.amp[0] = trial;
        this.amp[1] = trial;
      } else {
        this.amp[0] += ((p >= 1 ? 0.2 : 0) * fade - this.amp[0]) * k6;
        this.amp[1] += ((p >= 4 ? 0.12 : 0) * fade - this.amp[1]) * k6;
      }
      const bw = FB * this.amp[0] * 0.25;
      const bn = FB * this.amp[1];
      this.wide.update({ A: this.amp[0], m: 1, load: Math.min(p, 1.05) / 2 + 0.03, fBack: bw, fOut: trial >= 0 ? 0 : bw * Math.min(p, 1.02) });
      this.narrow.update({ A: this.amp[1], m: 2, load: p / 4 + 0.03, fBack: bn, fOut: trial >= 0 ? 0 : (bn * Math.min(p, 4.08)) / 4 });
      // 幅の札は紫の寸法線の札に置きかえた
      this.pairTags[0].visible = false;
      this.pairTags[1].visible = false;
      this.pairTags[2].visible = trial < 0 && this.amp[0] > 0.12;
      this.pairTags[3].visible = trial < 0 && this.amp[1] > 0.07;
      const showBack = trial > 0.1;
      this.backTags[0].visible = showBack;
      this.backTags[0].position.set(-1.15, 0.35, 0.25);
      this.backTags[1].visible = showBack;
      this.backTags[1].position.set(1.25, 0.2, 0.25);
      this.info.phase = T < 3.5 ? 0 : T < 10 ? 1 : t < 16.5 ? 2 : 3;
      this.caption =
        T < 3.5
          ? 'σel の式の b は、この板の幅'
          : T < 10
            ? '同じだけ波打たせると、狭い板の戻す力(青)は4倍'
            : t < 1.5
              ? '同じ応力で押していく(厚みは同じ)'
              : p < 1
                ? `同じ応力で押していく(σel の ${p.toFixed(1)} 倍)`
                : p < 4
                  ? `広い板が波打った。狭い板はまだ平ら(${p.toFixed(1)} 倍)`
                  : t < 18
                    ? '幅が半分なら、4倍の応力まで耐える'
                    : '厚みを2倍にしても4倍。σel は (t/b)² に比例する';
      // 試しに波打たせる間は横寄りから見て、戻す力(青)の長さを見せる
      const az = T >= 3.5 && T < 10 ? 58 : 30;
      this.shiftRight(this.gPair, 0.95, az);
      const zw = this.isNarrow() ? 1.15 : 1;
      this.look(0.05, 0.8, 2.9 * zw, 1.75 * zw, az, 12);
    } else if (s === 5) {
      // 支え方(32 秒): σel の式の k = 支え方の係数 → 同じだけ波打たせて戻す力(青)を比べる → 同じ応力で押す
      this.show(this.gSup);
      const T = this.cyc(32, c);
      const kr = 0.43 / 4;
      const FB = 4.0;
      const trial = T >= 3 && T < 9.5 ? 0.12 * ramp(T, 3.5, 5) * (1 - ramp(T, 8.5, 9.5)) : -1;
      const t = Math.max(0, T - 8);
      const fade = 1 - ramp(t, 23, 24);
      const p = T < 9.5 ? 0 : 1.05 * ramp(t, 2, 17) * fade;
      if (trial >= 0) {
        this.amp[0] = trial;
        this.amp[1] = trial;
      } else {
        this.amp[0] += ((p >= 1 ? 0.2 : 0) * fade - this.amp[0]) * k6;
        this.amp[1] += ((p >= kr ? 0.22 : 0) * fade - this.amp[1]) * k6;
      }
      // 戻す力の長さ = σel の比(両縁支持 1、自由突出 0.43/4)
      const bb = FB * this.amp[0];
      const bf = FB * this.amp[1] * kr;
      this.both.update({ A: this.amp[0], load: Math.min(p, 1.05) * 0.8 + 0.03, railGlow: 1, fBack: bb, fOut: trial >= 0 ? 0 : bb * Math.min(p, 1.02) });
      this.free.update({ A: this.amp[1], load: Math.min(p, kr * 1.05) * 6 + 0.03, railGlow: 1, fBack: bf, fOut: trial >= 0 ? 0 : (bf * Math.min(p, kr * 1.02)) / kr });
      this.supTags[2].visible = true;
      const showBack = trial > 0.1;
      this.backTags[2].visible = showBack;
      this.backTags[2].position.set(-1.1, 0.35, 0.25);
      this.backTags[3].visible = showBack;
      this.backTags[3].position.set(1.75, 0.35, 0.25);
      this.info.phase = T < 3 ? 0 : T < 9.5 ? 1 : t <= 17 ? 1 : 2;
      this.caption =
        T < 3
          ? '右の板は、片側の縁が自由(フランジの突き出した部分など)'
          : T < 9.5
            ? '同じだけ波打たせても、自由な縁のある板の戻す力(青)は約1/9'
            : p < kr
              ? `同じ応力で押していく(${p.toFixed(2)} 倍)`
              : p < 1
                ? `自由な縁のある板が先に波打った(${p.toFixed(2)} 倍)`
                : 'k は支え方の効果。柱の「有効座屈長」にあたる';
      const az = T >= 3 && T < 9.5 ? 58 : 28;
      this.shiftRight(this.gSup, 0.65, az);
      const zw = this.isNarrow() ? 1.15 : 1;
      this.look(0.05, 0.8, 2.9 * zw, 1.75 * zw, az, 12);
    } else if ((s >= 6 && s <= 9) || s > 60) {
      this.show(this.gLine, this.gWall);
      // 板の厚み(濃い色の縁)が見えるよう、少し斜め上から
      this.look(0, 2.05, 4.4, 3.3, 16, 15);
      const DUR: Record<number, number> = { 6: 15, 61: 12, 62: 14, 63: 12, 7: 9, 8: 17, 9: 15 };
      const t = this.once(DUR[s], c);
      // 板ごとの押す力と、波の大きさ
      const loads = new Array(N).fill(0);
      const amps = new Array(N).fill(0);
      const levels = new Array(N).fill(0);
      const pats = new Array(N).fill(0);
      const edges = new Array(N).fill(1);
      const pI = new Array(N).fill(0);
      const pR = new Array(N).fill(0);
      let fy = 0;
      let fe = 0;
      let fi = 0;
      let fr = 0;
      let fd = 0;
      let mark = false;
      const doneIdeal = (i: number, k: number) => {
        const R = RS[i];
        const el = plateTheory(R);
        const lim = Math.min(1, el);
        loads[i] = lim * k;
        levels[i] = lim * k;
        if (el < 1 && k >= 1) {
          amps[i] = 0.07;
          pats[i] = 0.5;
          edges[i] = el;
        }
        pI[i] = k >= 1 ? 1 : 0;
      };
      const doneReal = (i: number, k: number) => {
        const R = RS[i];
        const lim = plateWinter(R);
        const el = plateTheory(R);
        loads[i] = lim * k;
        levels[i] = lim * k;
        if (R > 0.673 && k * lim >= Math.min(el, lim) * 0.98) {
          amps[i] = 0.08;
          pats[i] = 1;
          edges[i] = 1;
        }
        pR[i] = k >= 1 ? 1 : 0;
      };
      if (s === 6) {
        this.caption =
          t < 4
            ? '同じ幅で、厚みだけが違う板を10枚(左ほど厚い)'
            : t < 10
              ? '横軸は R = √(σy/σel)。R = 1 は、σel = σy になる板'
              : 'R = 1 より左は厚い板、右は薄い板';
      } else if (s === 61) {
        // 厚い板(R < 1)だけ押す: 波打つ前に降伏する
        for (let i = 0; i < N; i++) if (RS[i] < 1) doneIdeal(i, ramp(t, 1.5 + i * 1.1, 2.8 + i * 1.1));
        fy = ramp(t, 6.5, 8.5);
        this.caption = t < 6 ? '厚い板(R < 1)を押す。波打たずに、全体が降伏する(赤)' : '強さは σy で頭打ち。これが降伏の天井 1.0';
      } else if (s === 62) {
        // 薄い板(R > 1)も押す: σy より低い σel で波打つ
        for (let i = 0; i < N; i++) {
          if (RS[i] < 1) doneIdeal(i, 1);
          else {
            const j = i - 4;
            doneIdeal(i, ramp(t, 1 + j * 1.1, 2.2 + j * 1.1));
          }
        }
        fy = 1;
        this.caption = t < 8.5 ? '薄い板(R > 1)は、σy に届く前に σel で波打つ' : '薄いほど、低い応力で波打つ';
      } else if (s === 63) {
        for (let i = 0; i < N; i++) doneIdeal(i, 1);
        fy = 1;
        fe = ramp(t, 1, 5);
        mark = t > 5;
        this.caption = t < 6 ? '波打つ応力の線: σel/σy = 1/R²' : '厚みが半分なら R は2倍、σel は 1/4。柱のオイラーの線と同じ形';
      } else if (s === 7) {
        for (let i = 0; i < N; i++) doneIdeal(i, 1);
        fy = 1;
        fe = 1;
        fi = ramp(t, 1, 4);
        mark = true;
        this.caption = t < 5 ? '理想の板の強さ = 2本の線の低い方' : '理想の板 = min(1, 1/R²)。柱と同じ形';
      } else {
        for (let i = 0; i < N; i++) doneIdeal(i, 1);
        fy = 1;
        fe = 1;
        fi = 1;
        mark = true;
        if (s === 8) {
          for (let i = 0; i < N; i++) {
            const t0 = 1 + (N - 1 - i) * 0.6;
            const k = ramp(t, t0, t0 + 0.5);
            if (k > 0) doneReal(i, k);
          }
          fr = ramp(t, 8, 11);
          this.caption =
            t < 7.5
              ? '現実の板(溶接の残留応力・わずかな反りあり)で押す'
              : t < 13
                ? 'R = 1 の付近は、理想の線より下がる(柱と同じ)'
                : '薄い板は逆に、理想の線より上まで耐える。理由は次の2つ';
        } else {
          for (let i = 0; i < N; i++) doneReal(i, 1);
          fr = 1;
          fd = ramp(t, 1, 4);
          this.caption =
            t < 5
              ? '設計式(青): R ≦ 0.7 で 1.0、R > 0.7 で 0.5/R²'
              : t < 11
                ? '0.5/R² = 0.5 × σel/σy。波打ち始める応力の半分'
                : '薄い板の余力(緑)は当てにせず、安全側に引いた線';
        }
      }
      const pop = 1 - Math.exp(-dt * 10);
      for (let i = 0; i < N; i++) {
        this.popI[i] += (pI[i] - this.popI[i]) * pop;
        this.popR[i] += (pR[i] - this.popR[i]) * pop;
        this.dotI[i].scale.setScalar(Math.max(0.001, this.popI[i]));
        this.dotR[i].scale.setScalar(Math.max(0.001, this.popR[i]));
        const key = `${loads[i].toFixed(3)}|${amps[i]}|${pats[i]}|${edges[i].toFixed(2)}`;
        if (key !== this.keys[i]) {
          this.keys[i] = key;
          this.plates[i].update({ A: amps[i], load: loads[i], level: levels[i], pattern: pats[i], edge: edges[i] });
        }
      }
      this.wall(fy, fe, fi, fr, fd, mark, null);
    } else {
      // 実験室
      this.show(this.gWall, this.gLab);
      this.look(0, 2.05, 4.4, 3.3, 16, 15);
      for (let i = 0; i < N; i++) {
        this.dotI[i].scale.setScalar(0.001);
        this.dotR[i].scale.setScalar(0.001);
      }
      const L = this.lab;
      const R = labR(L);
      const isFree = L.k < 1;
      const p = this.labPlates[isFree ? 'free' : 'both'];
      this.labPlates.both.group.visible = !isFree;
      this.labPlates.free.group.visible = isFree;
      p.group.position.x = X(Math.min(2.3, Math.max(0.1, R)));
      const el = plateTheory(R);
      const ult = isFree ? Math.min(1, el) : plateWinter(R);
      const onset = Math.min(el, ult);
      const waving = R > 0.673 && L.load >= onset && el < 1.05;
      const goal = waving ? 0.06 + 0.12 * Math.min(1, (L.load - onset) / Math.max(0.05, ult - onset + 0.1)) : 0;
      this.amp[2] += (goal - this.amp[2]) * k6;
      p.update({ A: this.amp[2], load: L.load, level: Math.min(1, L.load), pattern: waving ? 1 : 0, edge: Math.min(1, L.load / Math.max(0.01, ult)) });
      this.wall(1, 1, 1, isFree ? 0 : 1, 1, true, R);
      this.caption = '';
    }
  }
}
