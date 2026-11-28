import * as THREE from 'three';
import { dohshiOld } from '../physics/curves.ts';
import { alpha, loadFactor2 } from '../physics/beamcolumn.ts';
import { plateStrength } from '../physics/plate.ts';
import { SurfGrid } from './stage5.ts';
import { ShowBase, aimArrow, arrow, label, line, placeArrow, ramp, setLine, tube, axisGuide } from './kit.ts';

const DARK = () => new THREE.MeshStandardMaterial({ color: '#6f7d94', metalness: 0.45, roughness: 0.5 });

function tag(text: string, color: string, size = 0.7, wide = 1) {
  const s = label(text, color, wide);
  s.scale.multiplyScalar(size);
  return s;
}

interface BoxState {
  /** 柱ごと曲がるずれ。Dx = 断面の狭い向き(弱軸まわりの曲げ・座屈)、Dz = 広い向き(強軸まわりの曲げ) */
  Dx: number;
  Dz?: number;
  /** 板の波の高さ(局部座屈) */
  Al: number;
  /** 縦の波の数 */
  m: number;
  /** panel: 板の幅に波を2つ。plate: 1つ */
  mode: 'panel' | 'plate';
  load: number;
}

/** 4枚の板でできた長方形の箱形の柱。x の向きが狭い(弱軸)、z の向きが広い(強軸) */
class Box6 {
  group = new THREE.Group();
  private walls: { mesh: THREE.Mesh; base: Float32Array; grid: SurfGrid; cos: number; sin: number; sgn: number; w: number; off: number }[] = [];
  private top: THREE.Mesh;
  private arrow: THREE.Group;

  constructor(private a: number, wx: number, wz: number) {
    const wallMat = new THREE.MeshStandardMaterial({ color: '#9aa7ba', metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const th = (i * Math.PI) / 2;
      g.rotation.y = th;
      // 0・2 番は z の向きを向く壁(幅 wx)、1・3 番は x の向きを向く壁(幅 wz)
      const w = i % 2 ? wz : wx;
      const off = i % 2 ? wx / 2 : wz / 2;
      const geo = new THREE.PlaneGeometry(w, a, 32, 96);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(0, a / 2, off);
      mesh.frustumCulled = false;
      const grid = new SurfGrid(w, a, Math.max(4, Math.round(w * 7)), Math.round((a / w) * Math.max(4, Math.round(w * 7))));
      mesh.add(grid.lines);
      g.add(mesh);
      this.walls.push({ mesh, base: new Float32Array(geo.attributes.position.array as Float32Array), grid, cos: Math.cos(th), sin: Math.sin(th), sgn: i % 2 ? -1 : 1, w, off });
      this.group.add(g);
    }
    const dark = DARK();
    const bot = new THREE.Mesh(new THREE.BoxGeometry(wx + 0.7, 0.18, wz + 0.7), dark);
    bot.position.y = -0.09;
    this.top = new THREE.Mesh(new THREE.BoxGeometry(wx + 0.7, 0.18, wz + 0.7), dark);
    this.arrow = arrow('#1f2a44');
    this.arrow.scale.set(2, 1, 2);
    this.group.add(bot, this.top, this.arrow);
  }

  update(o: BoxState) {
    const { a } = this;
    const n = o.mode === 'panel' ? 2 : 1;
    const Dz = o.Dz ?? 0;
    const sx = (o.Dx * Math.PI) / a;
    const sz = (Dz * Math.PI) / a;
    const shorten = (Math.PI * Math.PI * (o.Dx * o.Dx + Dz * Dz)) / (4 * a);
    for (const w of this.walls) {
      // 板の中の点(面内 x、面外 z)を、柱ごとのずれ(x・z の2方向)+板の波で動かす
      const wave = (u: number, v: number) => w.sgn * o.Al * Math.sin(o.m * Math.PI * v) * Math.sin(n * Math.PI * u);
      const gx = (v: number) => o.Dx * Math.sin(Math.PI * v);
      const gz = (v: number) => Dz * Math.sin(Math.PI * v);
      const dx = (_u: number, v: number) => gx(v) * w.cos - gz(v) * w.sin;
      const dz = (u: number, v: number) => wave(u, v) + gx(v) * w.sin + gz(v) * w.cos;
      // 柱が傾く分: 柱の軸から離れた点ほど上下に動く
      const dy = (u: number, v: number) => {
        const xl = (u - 0.5) * w.w;
        const X0 = xl * w.cos + w.off * w.sin;
        const Z0 = -xl * w.sin + w.off * w.cos;
        return -(X0 * sx + Z0 * sz) * Math.cos(Math.PI * v) - shorten * v;
      };
      const p = w.mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) {
        const u = w.base[k * 3] / w.w + 0.5;
        const v = w.base[k * 3 + 1] / a + 0.5;
        p.setXYZ(k, w.base[k * 3] + dx(u, v), w.base[k * 3 + 1] + dy(u, v), dz(u, v));
      }
      p.needsUpdate = true;
      w.mesh.geometry.computeVertexNormals();
      w.grid.update(dz, dx, dy);
    }
    this.top.position.y = a + 0.09 - shorten;
    const len = 0.3 + 0.8 * Math.min(1.2, o.load);
    placeArrow(this.arrow, 0, a + 0.24 - shorten + len, 0, 0, o.load > 0.005 ? -len : 0);
  }
}

// グラフ(横: 柱の細長さ λ̄、縦: 強さ)
const GX = (l: number) => 0.4 + l * 1.7;
const GY = (s: number) => 0.9 + s * 2.3;
const GZ = -0.3;
function curvePts(f: (l: number) => number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 70; i++) {
    const l = 0.01 + (2.1 * i) / 70;
    pts.push(new THREE.Vector3(GX(l), GY(f(l)), GZ));
  }
  return pts;
}

/** 局部座屈を考慮しない強さ(全体座屈だけ)と、考慮した強さ(掛け算)。旧道示の考え方 */
export const strengthG = (lam: number) => dohshiOld(lam);
export const strengthGL = (lam: number, R: number) => dohshiOld(lam) * plateStrength(R);
/** 場面で使う例 */
export const EX = { lam: 0.8, R: 1.0, n: 0.2, m: 0.3 };
/**
 * 軸力と2方向の曲げの場面の例。lamY・lamZ = 強軸・弱軸まわりの細長比パラメータ(弱軸の方が細長い)。
 * n = σc/σy、my = σbcy/σbgy、mz = σbcz/σb0(α で割る前の曲げの使用割合)
 */
export const EXB = { lamY: 0.7, lamZ: 1.3, R: 0.6, n: 0.16, my: 0.2, mz: 0.13 };
/** 例の柱の値: pu = σcz/σy(細長い弱軸で決まる)、pey・pez = σe/σy */
export function exbValues(e = EXB) {
  return { pu: strengthGL(Math.max(e.lamY, e.lamZ), e.R), pey: 1 / (e.lamY * e.lamY), pez: 1 / (e.lamZ * e.lamZ) };
}

// 3軸のグラフ: 横(x)= 強軸の曲げ、縦(y)= 軸力、奥行き(z、手前向き)= 弱軸の曲げ。どれも使用割合
const O3 = new THREE.Vector3(0.3, 0.85, -0.9);
const L3 = { x: 2.6, y: 2.5, z: 2.1 };
const P3 = (my: number, nr: number, mz: number) => new THREE.Vector3(O3.x + my * L3.x, O3.y + nr * L3.y, O3.z + mz * L3.z);

function dotMesh(color: string, r = 0.085) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }));
}

export class Stage6Show extends ShowBase {
  private gOne = new THREE.Group();
  private box: Box6;
  private side: THREE.Group;
  private sideTag: THREE.Sprite;
  private sideZ: THREE.Group;
  private sideZTag: THREE.Sprite;
  private gPair = new THREE.Group();
  private thick: Box6;
  private thin: Box6;
  private gGraph = new THREE.Group();
  private cG: THREE.Mesh;
  private cGL: THREE.Mesh | null = null;
  private lastR = -1;
  private probe: THREE.Mesh[] = [];
  private loadLine: THREE.Line;
  private loadTag: THREE.Sprite;
  private g3 = new THREE.Group();
  private surf: THREE.Mesh;
  private surfMat: THREE.MeshStandardMaterial;
  private edges: THREE.Mesh[] = [];
  private planeEdge: THREE.Line;
  private plane: THREE.Mesh;
  private surfKey = '';
  private pt: THREE.Mesh;
  private hit: THREE.Mesh;
  private ray: THREE.Line;
  private drops: THREE.Line[] = [];
  private tags3: THREE.Sprite[] = [];

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.addFloor(-0.2);
    this.scene.add(this.gOne, this.gPair, this.gGraph, this.g3);
    // x の向きが狭い(弱軸)、z の向きが広い(強軸)
    this.box = new Box6(4.4, 0.8, 1.3);
    this.gOne.add(this.box.group);
    // 横から押す力(曲げを生む)。x の向き = 弱軸まわりの曲げ、z の向き = 強軸まわりの曲げ
    this.side = arrow('#ea580c');
    this.side.scale.set(2, 1, 2);
    this.sideTag = tag('弱軸の曲げ', '#ea580c', 1.9, 1.4);
    this.sideZ = arrow('#ea580c');
    this.sideZ.scale.set(2, 1, 2);
    this.sideZTag = tag('強軸の曲げ', '#ea580c', 1.9, 1.4);
    this.gOne.add(this.side, this.sideTag, this.sideZ, this.sideZTag);

    this.thick = new Box6(4.4, 0.8, 1.3);
    this.thick.group.position.x = -1.7;
    this.thin = new Box6(4.4, 0.8, 1.3);
    this.thin.group.position.x = 1.7;
    this.gPair.add(this.thick.group, this.thin.group);
    for (const [t, x] of [['板が厚い柱', -1.7], ['板が薄い柱', 1.7]] as const) {
      const s = tag(t, '#1f2a44', 0.8);
      s.position.set(x, -0.6, 0.9);
      this.gPair.add(s);
    }

    // λ のグラフ
    const board = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 4.7), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false }));
    board.position.set(GX(1.05) - 0.35, GY(0.55) - 0.42, GZ - 0.1);
    this.gGraph.add(board);
    const axis = (x0: number, y0: number, x1: number, y1: number, c = '#64748b') => {
      const l = line(c);
      setLine(l, x0, y0, x1, y1, GZ - 0.02);
      this.gGraph.add(l);
    };
    axis(GX(0), GY(0), GX(2.15), GY(0));
    axis(GX(0), GY(0), GX(0), GY(1.25));
    const put = (t: string, x: number, y: number, c = '#44536e', size = 0.7, wide = 1) => {
      const s = tag(t, c, size, wide);
      s.position.set(x, y, GZ);
      this.gGraph.add(s);
    };
    for (const l of [0.5, 1, 1.5, 2]) put(l.toFixed(1), GX(l), GY(0) - 0.22);
    for (const [y, t] of [[GY(1), '1.0'], [GY(0.5), '0.5']] as const) {
      put(t, GX(0) - 0.36, y);
      axis(GX(0), y, GX(2.15), y, '#d5dce8');
    }
    put('σ/σy', GX(0) + 0.35, GY(1.33), '#1f2a44', 0.75, 2);
    this.gGraph.add(
      axisGuide({ x0: GX(0), x1: GX(2.15), y0: GY(0), y1: GY(1.2), z: GZ, below: 0.62, left: 0.62, xLeft: '← 太く短い', xRight: '細く長い →', xName: '細長比パラメータ λ', yText: '耐えられる力 →', glyph: 'column', size: 0.75 }),
    );
    this.cG = tube(curvePts(strengthG), 0.036, '#0284c7');
    this.gGraph.add(this.cG);
    for (const c of ['#0284c7', '#6d28d9']) {
      const d = dotMesh(c);
      this.gGraph.add(d);
      this.probe.push(d);
    }
    this.loadLine = line('#ea580c');
    this.loadTag = tag('発生応力', '#ea580c', 0.7);
    this.gGraph.add(this.loadLine, this.loadTag);

    // 3軸のグラフ
    const ax3 = (to: THREE.Vector3, text: string, tagAt: THREE.Vector3, wide = 2) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([O3, to]), new THREE.LineBasicMaterial({ color: '#1f2a44' }));
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 14), new THREE.MeshBasicMaterial({ color: '#1f2a44' }));
      head.position.copy(to);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(O3).normalize());
      const t = tag(text, '#1f2a44', 0.95, wide);
      t.position.copy(tagAt);
      this.g3.add(l, head, t);
    };
    ax3(P3(1.18, 0, 0), '強軸の曲げ', P3(0.78, -0.17, 0), 1.4);
    ax3(P3(0, 1.18, 0), '軸力', P3(0.12, 1.25, 0), 1);
    ax3(P3(0, 0, 1.25), '弱軸の曲げ', P3(0.18, -0.16, 1.2), 1.4);
    for (const [p, t] of [
      [P3(1, -0.06, 0), '1.0'],
      [P3(-0.08, 1, 0), '1.0'],
      [P3(-0.06, -0.05, 1), '1.0'],
      [P3(0.5, -0.06, 0), '0.5'],
      [P3(-0.08, 0.5, 0), '0.5'],
      [P3(-0.06, -0.05, 0.5), '0.5'],
    ] as const) {
      const s = tag(t, '#44536e', 0.8);
      s.position.copy(p);
      this.g3.add(s);
    }
    // 床の格子(強軸と弱軸の面)
    const grid: THREE.Vector3[] = [];
    for (let i = 0; i <= 4; i++) {
      grid.push(P3(i / 4, 0, 0), P3(i / 4, 0, 1));
      grid.push(P3(0, 0, i / 4), P3(1, 0, i / 4));
    }
    const gl = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid), new THREE.LineBasicMaterial({ color: '#cbd5e1' }));
    this.g3.add(gl);
    // 増幅を考えない平面(3つの使用割合の和 = 1)
    const tri = new THREE.BufferGeometry().setFromPoints([P3(1, 0, 0), P3(0, 1, 0), P3(0, 0, 1)]);
    tri.computeVertexNormals();
    this.plane = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    this.planeEdge = new THREE.Line(new THREE.BufferGeometry().setFromPoints([P3(1, 0, 0), P3(0, 1, 0), P3(0, 0, 1), P3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: '#64748b' }));
    this.g3.add(this.plane, this.planeEdge);
    // U = 1 の面(α あり)
    this.surfMat = new THREE.MeshStandardMaterial({ color: '#7c3aed', transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6 });
    this.surf = new THREE.Mesh(new THREE.BufferGeometry(), this.surfMat);
    this.surf.frustumCulled = false;
    this.g3.add(this.surf);
    this.pt = dotMesh('#1f2a44', 0.075);
    this.hit = dotMesh('#6d28d9', 0.07);
    this.ray = line('#1f2a44');
    this.g3.add(this.pt, this.hit, this.ray);
    for (let i = 0; i < 3; i++) {
      const l = line('#64748b', true);
      this.drops.push(l);
      this.g3.add(l);
    }
    for (const [t, c] of [['和 = 1(増幅なし)', '#64748b'], ['U = 1(α あり)', '#6d28d9']] as const) {
      const s = tag(t, c, 0.85, 1.6);
      this.g3.add(s);
      this.tags3.push(s);
    }
    this.tags3[0].position.copy(P3(0.62, 0.62, 0.05));
    // 3軸のグラフの読み方: 原点 = 力なし。原点から遠いほど力が大きく、面の内側なら耐えられる
    const hint = tag('原点から遠いほど 力が大きい', '#475569', 0.7, 2.2);
    hint.position.copy(P3(0.62, 1.12, 0));
    this.g3.add(hint);
    this.tags3[1].position.copy(P3(0.55, 0.32, 0.55));
    this.setScene(0);
  }

  private setR(R: number) {
    if (Math.abs(R - this.lastR) < 0.004) return;
    this.lastR = R;
    if (this.cGL) {
      this.gGraph.remove(this.cGL);
      this.cGL.geometry.dispose();
    }
    this.cGL = tube(curvePts((l) => strengthGL(l, R)), 0.03, '#6d28d9');
    this.cGL.position.z = 0.03;
    this.gGraph.add(this.cGL);
  }

  /**
   * U = 1 の面を作る。軸力 n ごとに、2方向の曲げの限界は直線 my/αy + mz/αz = 1 − n/pu(三角形の切り口)。
   * amp: 0 で増幅なし(平面)、1 で α あり
   */
  private setSurface(pu: number, pey: number, pez: number, amp: number) {
    const key = `${pu.toFixed(3)}|${pey.toFixed(3)}|${pez.toFixed(3)}|${amp.toFixed(2)}`;
    if (key === this.surfKey) return;
    this.surfKey = key;
    const al = (n: number, pe: number) => 1 - (amp * n) / (0.8 * pe);
    // 軸力の上限: 許容値か、どちらかの α が 0 になる所
    const nTop = Math.min(pu, 0.8 * Math.min(pey, pez) / Math.max(amp, 1e-6)) * 0.999;
    const NI = 40;
    const NJ = 16;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= NI; i++) {
      const n = (nTop * i) / NI;
      const rest = Math.max(0, 1 - n / pu);
      const ay = Math.max(0, al(n, pey));
      const az = Math.max(0, al(n, pez));
      for (let j = 0; j <= NJ; j++) {
        const sj = j / NJ;
        const p = P3(sj * ay * rest, n / pu, (1 - sj) * az * rest);
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < NI; i++)
      for (let j = 0; j < NJ; j++) {
        const a = i * (NJ + 1) + j;
        const b = a + NJ + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.surf.geometry.dispose();
    this.surf.geometry = g;
    // 面の縁: 強軸だけ(mz = 0)・弱軸だけ(my = 0)の限界の線と、軸力 0 の線
    for (const e of this.edges) {
      this.g3.remove(e);
      e.geometry.dispose();
    }
    const curveY: THREE.Vector3[] = [];
    const curveZ: THREE.Vector3[] = [];
    for (let i = 0; i <= NI; i++) {
      const n = (nTop * i) / NI;
      const rest = Math.max(0, 1 - n / pu);
      curveY.push(P3(Math.max(0, al(n, pey)) * rest, n / pu, 0));
      curveZ.push(P3(0, n / pu, Math.max(0, al(n, pez)) * rest));
    }
    this.edges = [tube(curveY, 0.026, '#6d28d9'), tube(curveZ, 0.026, '#6d28d9'), tube([P3(1, 0, 0), P3(0, 0, 1)], 0.02, '#6d28d9')];
    for (const e of this.edges) this.g3.add(e);
  }

  private show(g: THREE.Group | null, graph: 'none' | 'lam' | '3d' = 'none') {
    this.gOne.visible = g === this.gOne;
    this.gPair.visible = g === this.gPair;
    this.gGraph.visible = graph === 'lam';
    this.g3.visible = graph === '3d';
  }

  /** 横からの力の矢印。x の向き(弱軸)は柱の左から、z の向き(強軸)は手前から、中ほどの高さを押す */
  private sideArrows(lx: number, lz: number, Dx: number, Dz: number) {
    placeArrow(this.side, -0.55 - lx + Dx, 2.2, 0, lx, 0);
    this.sideTag.visible = lx > 0.05;
    this.sideTag.position.set(-1.1 + Dx, 3.1, 0);
    aimArrow(this.sideZ, Dx, 2.2, 0.8 + lz + Dz, 0, 0, -lz);
    this.sideZTag.visible = lz > 0.05;
    this.sideZTag.position.set(0.6 + Dx, 1.2, 1.2 + Dz);
  }

  protected tick() {
    const s = this.sceneIndex;
    const c = this.clock;
    this.gOne.position.set(0, 0, 0);
    this.gOne.scale.setScalar(1);
    this.gOne.rotation.y = 0;
    this.sideArrows(0, 0, 0, 0);
    this.loadLine.visible = false;
    this.loadTag.visible = false;
    const still: BoxState = { Dx: 0, Al: 0, m: 4, mode: 'plate', load: 0 };
    if (s === 0) {
      this.show(this.gOne);
      const t = this.cyc(24, c);
      this.box.update(still);
      this.caption =
        t < 8
          ? '箱形の柱。薄い板を4枚、溶接して作る'
          : t < 16
            ? '柱ごと曲がる全体座屈と、板が波打つ局部座屈'
            : '①局部座屈 → ②全体座屈 → ③複合座屈 の順に照査する';
      this.look(0, 2.3, 2.6, 3.4, 28 + Math.sin(c * 0.3) * 10, 12);
    } else if (s === 1) {
      this.show(this.gOne);
      const t = this.cyc(14, c);
      const p = ramp(t, 1, 5) * (1 - ramp(t, 13, 14));
      const D = 0.95 * ramp(t, 4.6, 6) * (1 - ramp(t, 13, 14));
      this.box.update({ ...still, Dx: D, load: p });
      this.caption = t < 4.6 ? '柱を上から押していく(軸力だけ)' : t < 9.5 ? '全体座屈: 柱が、柱ごと弓なりに曲がる(断面の狭い向きへ)' : '断面の形は変わらない。決め手は、柱の細長さ';
      this.look(0.4, 2.3, 2.9, 3.4, 20, 8);
    } else if (s === 2) {
      this.show(this.gOne);
      const t = this.cyc(16, c);
      const p = ramp(t, 1, 5) * (1 - ramp(t, 15, 16));
      const A = 0.15 * ramp(t, 4.6, 6) * (1 - ramp(t, 15, 16));
      this.box.update({ ...still, Al: A, load: p });
      this.caption =
        t < 4.6
          ? '同じように押しても、板が薄いと…'
          : t < 10.5
            ? '局部座屈: 柱はまっすぐのまま、板だけが波打つ'
            : '角は動かない。その間の板が波打つ。決め手は R(映像5)';
      this.look(0, 2.3, 2.4, 3.2, 34, 12);
    } else if (s === 4) {
      this.show(this.gPair);
      const t = this.cyc(30, c);
      const fade = 1 - ramp(t, 29, 30);
      const p = ramp(t, 2.5, 24) * fade;
      const Al = 0.075 * ramp(p, 0.3, 0.37) * fade;
      const DgThin = 0.9 * ramp(p, 0.52, 0.6) * fade;
      const DgThick = 0.9 * ramp(p, 0.93, 1.0) * fade;
      this.thick.update({ Dx: DgThick, Al: 0, m: 4, mode: 'plate', load: Math.min(p, 1) });
      this.thin.update({ Dx: DgThin, Al, m: 4, mode: 'plate', load: Math.min(p, 0.6) });
      this.caption =
        t < 2.5
          ? '外形も長さも同じ2本。違うのは、板の厚みだけ'
          : p < 0.3
            ? '同じ力で押していく'
            : p < 0.52
              ? '右の柱: 先に板が波打った(局部座屈)'
              : p < 0.93
                ? '波打った板は働きが落ちる。柱の踏ん張りも落ち、柱ごと座屈した'
                : '左の柱は、もっと大きな力まで耐えた。右は、局部座屈と全体座屈の連成';
      this.look(0.4, 2.2, 4.0, 3.5, 22, 9);
    } else if (s === 5 || s === 6) {
      // 柱の絵を左に小さく置き、右に λ のグラフ
      this.gOne.position.set(-2.3, 0.75, 0);
      this.gOne.scale.setScalar(0.62);
      this.look(0.55, 2.2, 4.1, 3.0, 12, 7);
      const t12 = c % 12;
      this.show(this.gOne, 'lam');
      let R: number;
      if (s === 5) {
        const t = Math.min(this.once(28, c), 40);
        R = t < 12 ? 0.6 : t < 22 ? 0.6 + 0.4 * ramp(t, 12, 14) : 1.0 + 0.4 * ramp(t, 22, 24);
        this.caption =
          t < 5
            ? '青の線 = 全体座屈応力 σcg(映像4 の設計曲線)'
            : t < 12
              ? '板が厚い(R ≦ 0.7)と低減なし。線は重なる'
              : t < 22
                ? '板が薄い(R = 1.0)と × 0.5。線が丸ごと下がる'
                : 'もっと薄い(R = 1.4)と × 0.26。これが σcz';
        for (const d of this.probe) d.visible = false;
      } else {
        // 軸力だけの照査と安全率: 例の柱(λ̄ = 0.8、R = 1.0)
        R = EX.R;
        const t = Math.min(this.once(27, c), 30);
        const str = strengthGL(EX.lam, R);
        this.probe[0].visible = false;
        this.probe[1].visible = true;
        this.probe[1].position.set(GX(EX.lam), GY(str), GZ + 0.14);
        const on = t > 6;
        this.loadLine.visible = on;
        this.loadTag.visible = on;
        setLine(this.loadLine, GX(0), GY(EX.n), GX(2.15), GY(EX.n), GZ + 0.05);
        this.loadTag.position.set(GX(1.75), GY(EX.n) - 0.2, GZ + 0.05);
        this.caption =
          t < 6
            ? `この柱の許容値 σcz は降伏の ${Math.round(str * 100)}%(紫の点)`
            : t < 13
              ? `発生する応力 σc は ${Math.round(EX.n * 100)}%(オレンジの線)`
              : t < 21
                ? `安全率 = 許容値 σcz ÷ 発生応力 σc = ${Math.round(str * 100)} ÷ ${Math.round(EX.n * 100)} = ${(str / EX.n).toFixed(1)}`
                : '1.0 以上なら OK。あと何倍の力まで耐えるか';
      }
      this.setR(R);
      const p = ramp(t12, 1, 7) * (1 - ramp(t12, 11, 12));
      const thin = Math.max(0, Math.min(1, (R - 0.7) / 0.7));
      const Al = 0.08 * thin * ramp(p, 0.35, 0.5) * (1 - ramp(t12, 11, 12));
      const Dx = s === 5 ? 0.85 * ramp(p, 0.85, 1) * (1 - ramp(t12, 11, 12)) : 0;
      this.box.update({ Dx, Al: s === 5 ? Al : 0, m: 8, mode: 'panel', load: s === 5 ? p * (1 - 0.6 * thin) : 0.45 });
    } else {
      // 軸力と2方向の曲げを同時に受ける柱。左に柱、右に3軸のグラフ
      this.gOne.position.set(-2.7, 0.55, 0.2);
      this.gOne.scale.setScalar(0.58);
      this.look(0.0, 2.0, 3.9, 2.7, 30, 16);
      this.show(this.gOne, '3d');
      const { pu, pey, pez } = exbValues();
      let n = EXB.n;
      let my = EXB.my;
      let mz = EXB.mz;
      let amp = 1;
      let showPt = true;
      let showRay = false;
      let showSurf = true;
      if (s === 7) {
        // 余力を分け合う(増幅なし)
        const t = this.cyc(26, c);
        amp = 0;
        showSurf = false;
        n = EXB.n * ramp(t, 2, 5);
        my = EXB.my * ramp(t, 7, 10);
        mz = EXB.mz * ramp(t, 12, 15);
        showPt = t > 2;
        this.caption =
          t < 2
            ? '柱は、上から押されるだけではない'
            : t < 7
              ? '上から押す力(軸力)。グラフの縦'
              : t < 12
                ? '断面の広い向きへ曲げる力 = 強軸まわりの曲げ。グラフの横'
                : t < 18
                  ? '狭い向きへ曲げる力 = 弱軸まわりの曲げ。グラフの奥行き'
                  : '3つの使用割合の和 = 1 の面。内側なら OK';
      } else if (s === 8) {
        // 軸力が曲げを増幅する(弱軸ほど大きく)
        const t = this.cyc(26, c);
        amp = ramp(t, 12, 16);
        n = EXB.n * ramp(t, 2, 9);
        const ay = alpha(n, pey);
        const az = alpha(n, pez);
        this.caption =
          t < 2
            ? '横から曲げられた柱'
            : t < 12
              ? `押すと曲がりが増える(強軸 ${(1 / ay).toFixed(2)} 倍、弱軸 ${(1 / az).toFixed(2)} 倍)`
              : t < 19
                ? '耐えられる範囲は、三角の面から内側へへこむ(紫の面)'
                : '弱軸の側ほど、大きくへこむ';
      } else if (s === 9) {
        const t = this.cyc(22, c);
        showRay = t > 5;
        this.caption =
          t < 5
            ? '黒い点 = いまの軸力と、2方向の曲げ(点線で各軸の値)'
            : t < 12
              ? '3つを同じ割合で増やしていくと、紫の面にぶつかる'
              : '面までの倍率は、安全率 1/U とほぼ同じ(少し小さい)';
      } else {
        showRay = true;
        this.caption = '';
      }
      this.setSurface(pu, pey, pez, Math.max(amp, 0.001));
      this.surf.visible = showSurf && amp > 0.01;
      for (const e of this.edges) e.visible = this.surf.visible;
      this.tags3[1].visible = this.surf.visible && amp > 0.9;
      this.tags3[0].visible = s === 7 || (s === 8 && amp < 0.9);
      this.plane.visible = true;
      // 柱の絵: 横からの力でたわみ、軸力で増幅される(見やすく誇張)
      const ay = amp > 0 || s === 8 ? alpha(n, pey) : 1;
      const az = amp > 0 || s === 8 ? alpha(n, pez) : 1;
      const ky = ay > 0.05 ? 1 / ay : 20;
      const kz = az > 0.05 ? 1 / az : 20;
      const Dx = Math.min(0.9, 1.6 * mz * kz);
      const Dz = -Math.min(0.9, 1.2 * my * ky);
      this.box.update({ Dx, Dz, Al: 0, m: 8, mode: 'panel', load: n * 2.5 });
      this.sideArrows(mz > 0.005 ? 0.3 + 2.4 * mz : 0, my > 0.005 ? 0.3 + 2.4 * my : 0, Dx, Dz);
      // 点(使用割合: 軸力 n/pu、曲げは α で割る前の値)
      const ptPos = P3(my, n / pu, mz);
      this.pt.visible = showPt;
      this.pt.position.copy(ptPos);
      const dropPts: [THREE.Vector3, THREE.Vector3][] = [
        [ptPos, P3(my, 0, mz)],
        [P3(my, 0, mz), P3(my, 0, 0)],
        [P3(my, 0, mz), P3(0, 0, mz)],
      ];
      this.drops.forEach((l, i) => {
        l.visible = showPt && n + my + mz > 0.01;
        (l.geometry as THREE.BufferGeometry).setFromPoints(dropPts[i]);
        l.computeLineDistances();
      });
      const g = loadFactor2(n, my, mz, pu, pey, pez);
      const ok = showRay && Number.isFinite(g) && g > 0;
      this.ray.visible = ok;
      this.hit.visible = ok;
      if (ok) {
        const h = P3(g * my, (g * n) / pu, g * mz);
        (this.ray.geometry as THREE.BufferGeometry).setFromPoints([O3, h]);
        this.hit.position.copy(h);
      }
    }
  }
}
