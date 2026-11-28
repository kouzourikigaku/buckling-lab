import * as THREE from 'three';
import { ShowBase, arrow, label, line, placeArrow, ramp, setLine, tintArrow, tube } from './kit.ts';

/** 支え方。pp=両端ピン、ff=両端固定、cf=根元固定・先端自由(片持ち)、fp=根元固定・先端ピン */
export type Support = 'pp' | 'ff' | 'cf' | 'fp';

const KFP = 4.493409457909064; // tan(k) = k の最初の根
const fpRaw = (x: number) => Math.sin(KFP * x) - KFP * x - Math.tan(KFP) * (Math.cos(KFP * x) - 1);
let fpMax = 0;
for (let i = 0; i <= 400; i++) fpMax = Math.max(fpMax, Math.abs(fpRaw(i / 400)));
const fpSign = fpRaw(0.6) > 0 ? 1 : -1;

/** 座屈の形(最大のずれを 1 にそろえる)、強さ(両端ピンの何倍か)、有効座屈長/長さ、サインカーブ半分にあたる範囲 */
export const SUPPORTS: Record<Support, { name: string; w: (x: number) => number; gain: number; le: number; wave: [number, number] }> = {
  cf: { name: '根元だけ固定(片持ち)', w: (x) => 1 - Math.cos((Math.PI * x) / 2), gain: 0.25, le: 2, wave: [-1, 1] },
  pp: { name: '両端ピン', w: (x) => Math.sin(Math.PI * x), gain: 1, le: 1, wave: [0, 1] },
  fp: { name: '片方固定・片方ピン', w: (x) => (fpSign * fpRaw(x)) / fpMax, gain: (Math.PI / KFP) ** -2 * 1, le: Math.PI / KFP, wave: [1 - Math.PI / KFP, 1] },
  ff: { name: '両端固定', w: (x) => (1 - Math.cos(2 * Math.PI * x)) / 2, gain: 4, le: 0.5, wave: [0.25, 0.75] },
};
// fp: Pcr = k²EI/L² = (k/π)²·Pe
SUPPORTS.fp.gain = (KFP / Math.PI) ** 2;

const DARK = () => new THREE.MeshStandardMaterial({ color: '#6f7d94', metalness: 0.45, roughness: 0.5 });
const BRIGHT = () => new THREE.MeshStandardMaterial({ color: '#c9d3e3', metalness: 0.9, roughness: 0.25 });

/** 細い棒1本(下端が原点)。支え方に合わせた形で横にずれる */
class Bar {
  group = new THREE.Group();
  private mesh: THREE.Mesh;
  private base: Float32Array;
  private short: Float32Array; // ずれ 1 のときの縮み(下からの累積)
  private topGroup = new THREE.Group();
  private arrow: THREE.Group;
  private wave: THREE.Mesh | null = null;
  private react: THREE.Group;
  private fOut: THREE.Group;
  private fBack: THREE.Group;
  private tagsF: THREE.Sprite[] = [];
  private xiMax = 0.5;
  /** 反力と、曲げる力・戻す力の矢印を出すか。札も出すか */
  forces = true;
  tags = false;
  D = 0;
  topX = 0;
  topY = 0;

  constructor(public sup: Support, public H: number, private Dfin = 0.42) {
    const geo = new THREE.BoxGeometry(0.13, H, 0.13, 1, 56, 1);
    this.base = new Float32Array(geo.attributes.position.array as Float32Array);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#9aa8bd', metalness: 0.7, roughness: 0.3 }));
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh, this.topGroup);
    const w = SUPPORTS[sup].w;
    this.short = new Float32Array(201);
    for (let i = 1; i <= 200; i++) {
      const d = (w(i / 200) - w((i - 1) / 200)) * 200;
      this.short[i] = this.short[i - 1] + (d * d) / (2 * H) / 200;
    }
    // 下の支え
    if (sup === 'pp') {
      const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.3, 0.34, 4), DARK());
      tri.rotation.y = Math.PI / 4;
      tri.position.y = -0.2;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), BRIGHT());
      this.group.add(tri, ball);
    } else {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.7), DARK());
      block.position.y = -0.12;
      this.group.add(block);
    }
    // 上の支え
    if (sup === 'pp' || sup === 'fp') {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), BRIGHT());
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.07, 0.5), DARK());
      plate.position.y = 0.13;
      this.topGroup.add(ball, plate);
    } else if (sup === 'ff') {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.6), DARK());
      block.position.y = 0.02;
      this.topGroup.add(block);
    }
    this.arrow = arrow('#1f2a44');
    this.arrow.scale.set(1.6, 1, 1.6);
    this.group.add(this.arrow);
    // サインカーブ半分(有効座屈長)の目印
    const [a, b] = SUPPORTS[sup].wave;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const x = a + ((b - a) * i) / 40;
      pts.push(new THREE.Vector3(Dfin * w(Math.abs(x)), x * H, 0.12));
    }
    this.wave = tube(pts, 0.035, '#e11d48', 0.9);
    this.wave.visible = false;
    this.group.add(this.wave);
    // 反力(下の支えから上向き)、曲げる力(外力 P × ずれ)と戻す力(回復力)
    this.react = arrow('#64748b');
    this.react.scale.set(1.4, 1, 1.4);
    this.fOut = arrow('#ea580c');
    this.fBack = arrow('#0284c7');
    for (const a of [this.fOut, this.fBack]) a.scale.set(1.3, 1, 1.3);
    this.group.add(this.react, this.fOut, this.fBack);
    for (const [t, c] of [['外力 P', '#1f2a44'], ['反力', '#64748b'], ['曲げる力', '#ea580c'], ['戻す力', '#0284c7']] as const) {
      const sp = label(t, c);
      sp.scale.multiplyScalar(0.6);
      sp.visible = false;
      this.group.add(sp);
      this.tagsF.push(sp);
    }
    let best = 0;
    for (let i = 0; i <= 100; i++) {
      const v = Math.abs(w(i / 100));
      if (v > best) {
        best = v;
        this.xiMax = i / 100;
      }
    }
  }

  /** D: いちばんずれる所のずれ。load: 矢印の長さ(0〜1 くらい)。wave: 赤い目印を出すか */
  /** ratio: 押す力 ÷ 座屈荷重(曲げる力と戻す力の比)。省略すると、その矢印は出さない */
  /** stiff: この棒の座屈荷重 ÷ 基準の座屈荷重。同じずれでも、戻す力(青)はこの倍率で長さが変わる(曲げる力は 押す力 × ずれ なので ratio × stiff) */
  update(D: number, load: number, showWave = false, ratio?: number, stiff = 1) {
    this.D = D;
    const w = SUPPORTS[this.sup].w;
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const pa = pos.array as Float32Array;
    const H = this.H;
    for (let i = 0; i < pos.count; i++) {
      const xi = this.base[i * 3 + 1] / H + 0.5;
      const slope = (D * (w(Math.min(1, xi + 0.005)) - w(Math.max(0, xi - 0.005)))) / (0.01 * H);
      const sh = D * D * this.short[Math.round(xi * 200)];
      pa[i * 3] = this.base[i * 3] + D * w(xi);
      pa[i * 3 + 1] = xi * H - this.base[i * 3] * slope - sh;
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.topX = D * w(1);
    this.topY = H - D * D * this.short[200];
    this.topGroup.position.set(this.topX, this.topY, 0);
    const len = 0.25 + 0.7 * Math.min(1.3, load);
    placeArrow(this.arrow, this.topX, this.topY + 0.22 + len, 0, 0, load > 0.005 ? -len : 0);
    if (this.wave) this.wave.visible = showWave && D > this.Dfin * 0.9;
    const base = this.sup === 'pp' ? -0.4 : -0.34;
    const rl = load > 0.005 ? len : 0;
    placeArrow(this.react, 0, base - rl, 0, 0, this.forces ? rl : 0);
    const on = this.forces && ratio !== undefined && D > 0.04;
    const xi = this.xiMax;
    const x = D * w(xi);
    const y = xi * H - D * D * this.short[Math.round(xi * 200)];
    // いちばんずれる所で 戻す力 = 座屈荷重 × ずれ、曲げる力 = 押す力 × ずれ
    const k = 2.4 * Math.abs(D) * stiff;
    placeArrow(this.fOut, x + 0.12, y + 0.15, 0.15, on ? k * (ratio ?? 0) : 0, 0);
    placeArrow(this.fBack, x - 0.12, y - 0.15, 0.15, on ? -k : 0, 0);
    const tg = this.tags;
    this.tagsF[0].visible = tg && load > 0.005;
    this.tagsF[0].position.set(this.topX + 0.55, this.topY + 0.5, 0.2);
    this.tagsF[1].visible = tg && this.forces && load > 0.005;
    this.tagsF[1].position.set(0.45, base - 0.35, 0.2);
    this.tagsF[2].visible = tg && on;
    this.tagsF[2].position.set(x + 0.12 + k * (ratio ?? 0) + 0.45, y + 0.15, 0.25);
    this.tagsF[3].visible = tg && on;
    this.tagsF[3].position.set(x - 0.12 - k - 0.4, y - 0.15, 0.25);
  }

  /** 高さ xi(0〜1)の位置 */
  at(xi: number): [number, number] {
    return [this.D * SUPPORTS[this.sup].w(xi), xi * this.H];
  }
}

function tag(text: string, color: string, size = 0.7, wide = 1) {
  const s = label(text, color, wide);
  s.scale.multiplyScalar(size);
  return s;
}

/**
 * 回す力(モーメント)の矢印: 点のまわりの、右側の円弧と矢じり。ccw = 左回り(右側では上向き)。
 * 半径 1 で作り、scale で大きさを表す
 */
function curvedArrow(color: string, ccw: boolean) {
  const g = new THREE.Group();
  const a0 = -0.95;
  const a1 = 0.95;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 30; i++) {
    const a = a0 + ((a1 - a0) * i) / 30;
    pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
  }
  g.add(tube(pts, 0.05, color, 0.7));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 16), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }));
  const end = ccw ? a1 : a0;
  head.position.set(Math.cos(end), Math.sin(end), 0);
  // 円の接線の向き(ccw なら角度が増える向き)
  const dir = ccw ? new THREE.Vector3(-Math.sin(end), Math.cos(end), 0) : new THREE.Vector3(Math.sin(end), -Math.cos(end), 0);
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.add(head);
  return g;
}

const ORDER: Support[] = ['cf', 'pp', 'fp', 'ff'];

export interface Lab2 {
  sup: Support;
  L: number; // m
  load: number; // P / (座屈荷重と降伏荷重の小さい方)
  /** 座屈荷重が降伏荷重を超える(オイラーの式が使えない)長さか */
  yieldFirst: boolean;
}

export class Stage2Show extends ShowBase {
  private g0 = new THREE.Group(); // 1本(両端ピン)
  private main: Bar;
  private hOut: THREE.Group;
  private hBack: THREE.Group;
  private tOut: THREE.Sprite;
  private tBack: THREE.Sprite;
  private offLine: THREE.Line;
  /** 場面「綱引き」: 真ん中の断面にかかる2つのモーメント(回す力)と、ずれ y、比べるゲージ、きっかけの指 */
  private g1 = new THREE.Group();
  private mBend: THREE.Group;
  private mBack: THREE.Group;
  private yArrow: THREE.Group;
  private poke: THREE.Group;
  private gauge: THREE.Mesh[] = [];
  private t1: Record<string, THREE.Sprite> = {};
  private ghost: THREE.Line;
  private kArc: THREE.Mesh | null = null;
  private kKey = '';
  private g2 = new THREE.Group(); // 長さ1倍と2倍
  private short: Bar;
  private long: Bar;
  private tags2: THREE.Sprite[] = [];
  /** 長さの場面: 青い矢印の横の「戻す力 1」「戻す力 1/4」 */
  private backTags: THREE.Sprite[] = [];
  /** 長さの場面: 柱の横の紫の寸法線(式の l がこの長さだと示す) */
  private dims: { g: THREE.Group; v: THREE.Mesh; t0: THREE.Mesh; t1: THREE.Mesh; tag: THREE.Sprite; H: number }[] = [];
  private dims5: { g: THREE.Group; v: THREE.Mesh; t0: THREE.Mesh; t1: THREE.Mesh; tag: THREE.Sprite; H: number }[] = [];
  /** 長さの場面の段階(Stage2.tsx が式のカードに使う)。-1 = ほかの場面 */
  lenInfo = { phase: -1 };
  private g5 = new THREE.Group(); // 支え方4種
  private four: Bar[] = [];
  private tags5: THREE.Sprite[][] = [];
  private gLab = new THREE.Group();
  private labBar: Bar | null = null;
  private labKey = '';
  private dyn = [0, 0, 0, 0];
  lab: Lab2 = { sup: 'pp', L: 8, load: 0.5, yieldFirst: false };

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.scene.add(this.g0, this.g2, this.g5, this.gLab);

    this.main = new Bar('pp', 3.0, 0.5);
    this.main.tags = true;
    this.g0.add(this.main.group);
    this.hOut = arrow('#ea580c');
    this.hBack = arrow('#0284c7');
    for (const a of [this.hOut, this.hBack]) a.scale.set(1.5, 1, 1.5);
    tintArrow(this.hOut, '#ea580c');
    tintArrow(this.hBack, '#0284c7');
    this.tOut = tag('曲げる力', '#ea580c', 0.75);
    this.tBack = tag('戻す力', '#0284c7', 0.75);
    this.offLine = line('#6d28d9', true);
    this.g0.add(this.hOut, this.hBack, this.tOut, this.tBack, this.offLine);

    // 綱引きの場面の部品
    this.g0.add(this.g1);
    this.mBend = curvedArrow('#ea580c', true);
    this.mBack = curvedArrow('#0284c7', false);
    this.yArrow = arrow('#1f2a44');
    this.yArrow.scale.set(0.5, 1, 0.5);
    this.poke = arrow('#64748b');
    this.poke.scale.set(1.2, 1, 1.2);
    this.g1.add(this.mBend, this.mBack, this.yArrow, this.poke);
    for (const c of ['#ea580c', '#0284c7']) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: c, toneMapped: false, fog: false }));
      this.gauge.push(m);
      this.g1.add(m);
    }
    const mk = (k: string, text: string, color: string, size = 0.62) => {
      const sp = tag(text, color, size, Math.max(1, (text.length * 76 + 60) / 512));
      this.g1.add(sp);
      this.t1[k] = sp;
    };
    mk('y', 'ずれ y(腕の長さ)', '#1f2a44');
    mk('path', '押す力の通り道', '#6d28d9', 0.55);
    mk('ghost', 'もし少し曲がったら(点線)', '#64748b', 0.55);
    mk('k', '曲がり具合 1/R(紫の円)', '#6d28d9', 0.55);
    mk('pp', 'P = 50%', '#1f2a44', 0.7);
    mk('even', '互角', '#e11d48', 0.75);
    // 試しに曲げた形(点線のサインカーブ)。まっすぐのまま、もし曲げたらどうなるかを比べるのに使う
    const gp: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) gp.push(new THREE.Vector3(Math.sin((Math.PI * i) / 40), (3.0 * i) / 40, 0.2));
    this.ghost = new THREE.Line(new THREE.BufferGeometry().setFromPoints(gp), new THREE.LineDashedMaterial({ color: '#64748b', dashSize: 0.08, gapSize: 0.06 }));
    this.ghost.computeLineDistances();
    this.g1.add(this.ghost);
    mk('bend', '曲げる力 P × y', '#ea580c');
    mk('back', '戻す力 EI × 1/R', '#0284c7');
    mk('poke', '横から少し押す(きっかけ)', '#64748b');
    mk('gb', '曲げる側 P(押す力)', '#ea580c', 0.55);
    mk('gk', '戻す側 π²EI/l²(柱で決まる)', '#0284c7', 0.55);
    mk('gt', 'くらべる', '#1f2a44', 0.55);
    this.g1.visible = false;

    this.short = new Bar('pp', 1.6, 0.4);
    this.short.group.position.x = -1.5;
    this.long = new Bar('pp', 3.2, 0.4);
    this.long.group.position.x = 1.0;
    this.g2.add(this.short.group, this.long.group);
    // 紫の寸法線(棒の左)。式の分母の l = この長さ
    for (const [bar, text] of [[this.short, 'l'], [this.long, '2l']] as const) this.dims.push(this.dimLine(this.g2, bar, text, -0.42));
    for (const text of ['戻す力 1', '戻す力 1/4']) {
      const t = tag(text, '#0284c7', 0.62);
      this.g2.add(t);
      this.backTags.push(t);
    }
    for (const [t, x, y, c] of [['長さ l', -1.5, -0.75, '#1f2a44'], ['長さ 2l', 1.0, -0.75, '#1f2a44'], ['限界 100%', -0.35, 1.0, '#e11d48'], ['限界 25%', 2.35, 1.9, '#e11d48']] as const) {
      const s = tag(t, c, 0.75);
      s.position.set(x, y, 0.3);
      this.g2.add(s);
      this.tags2.push(s);
    }

    ORDER.forEach((sup, i) => {
      const b = new Bar(sup, 2.3, 0.36);
      b.group.position.x = (i - 1.5) * 1.75 - 0.15;
      this.g5.add(b.group);
      this.four.push(b);
      const info = SUPPORTS[sup];
      const gain = info.gain < 1 ? '1/4 倍' : info.gain === 1 ? '1 倍(基準)' : `${info.gain < 3 ? '約 2' : '4'} 倍`;
      const t1 = tag(gain, '#6d28d9', 0.75);
      t1.position.set(b.group.position.x + 0.15, 3.55, 0.3);
      const t2 = tag(`le ${info.le === 1 ? '= 1.0' : info.le < 0.6 ? '= 0.5' : info.le > 1.5 ? '= 2.0' : '≒ 0.7'} l`, '#e11d48', 0.72);
      t2.position.set(b.group.position.x + 0.15, 3.2, 0.3);
      this.g5.add(t1, t2);
      this.tags5.push([t1, t2]);
      this.dims5.push(this.dimLine(this.g5, b, 'l', -0.36, 1.0));
    });
    this.setScene(0);
  }

  /** 棒の横の紫の寸法線(長さ l)。dx: 棒からの横の位置 */
  private dimLine(parent: THREE.Group, bar: Bar, text: string, dx: number, size = 1.25) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#6d28d9', fog: false, toneMapped: false });
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1, 0.03), mat);
    const t0 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.03), mat);
    const t1 = t0.clone();
    const tg = tag(text, '#6d28d9', size);
    g.add(v, t0, t1, tg);
    g.position.set(bar.group.position.x + dx, 0, 0.2);
    parent.add(g);
    return { g, v, t0, t1, tag: tg, H: bar.H };
  }
  /** 寸法線を grow(0〜1)まで伸ばす */
  private growDim(d: { v: THREE.Mesh; t1: THREE.Mesh; tag: THREE.Sprite; H: number }, grow: number, tx = -0.3) {
    const h = Math.max(0.001, d.H * grow);
    d.v.scale.y = h;
    d.v.position.y = h / 2;
    d.t1.position.y = h;
    d.tag.position.set(tx, h / 2, 0);
    d.tag.visible = grow > 0.95;
  }

  private only(g: THREE.Group) {
    for (const x of [this.g0, this.g2, this.g5, this.gLab]) x.visible = x === g;
    this.g1.visible = false;
  }

  private forces(D: number, p: number, on: boolean) {
    const [x, y] = this.main.at(0.5);
    const out = 2.6 * D * p;
    const back = 2.6 * D;
    const vis = on && D > 0.05;
    placeArrow(this.hOut, x + 0.12, y + 0.22, 0.2, vis ? out : 0, 0);
    placeArrow(this.hBack, x - 0.12, y - 0.22, 0.2, vis ? -back : 0, 0);
    this.tOut.visible = vis;
    this.tBack.visible = vis;
    this.tOut.position.set(x + 0.12 + out + 0.75, y + 0.22, 0.3);
    this.tBack.position.set(x - 0.12 - back - 0.6, y - 0.22, 0.3);
    this.offLine.visible = vis;
    setLine(this.offLine, 0, 0, 0, this.main.topY, 0.05);
  }

  /**
   * 綱引きの場面: 真ん中の断面で、曲げるモーメント P·y(オレンジ、左回り)と戻すモーメント EI/R(青、右回り)を描く。
   * p = P/Pe。両端ピンのサインカーブでは EI/R = Pe·y なので、2つの比は p だけで決まる(y によらない)
   */
  /** 綱引きの場面で、いま見せる物(段階ごとに1つずつ足していく) */
  private tugMask = { bend: true, back: true, k: true };
  /** 綱引きの場面の段階と押す力(画面に重ねる式のカードと天秤が読む)。綱引き以外は phase = -1 */
  tugInfo = { phase: -1, p: 0 };

  private tug(D: number, p: number, show: boolean, pokeLen: number, ghost = 0) {
    this.g1.visible = true;
    const M = this.tugMask;
    // 回す力は、実際のずれ D か、試しに曲げた形のずれ ghost のどちらかで比べる
    const useGhost = ghost > 0.01 && D < ghost;
    const Dm = ghost > 0.01 ? Math.max(D, ghost) : D;
    const [x0, y] = this.main.at(0.5);
    const x = useGhost ? ghost : x0;
    this.ghost.visible = useGhost;
    this.ghost.scale.x = ghost;
    this.t1.ghost.visible = useGhost;
    this.t1.ghost.position.set(ghost + 0.95, 2.55, 0.25);
    // 真ん中の曲がり具合(紫の円の一部)。半径 R = l²/(π²·ずれ)(絵の上の値)
    const kOn = show && M.k && Dm > 0.05;
    const kKey = kOn ? Dm.toFixed(3) : '';
    if (kKey !== this.kKey) {
      this.kKey = kKey;
      if (this.kArc) {
        this.g1.remove(this.kArc);
        this.kArc.geometry.dispose();
        this.kArc = null;
      }
      if (kOn) {
        const H = this.main.H;
        const R = (H * H) / (Math.PI * Math.PI * Dm);
        const cx = Dm - R;
        const half = Math.min(0.9, 1.1 / R);
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 30; i++) {
          const a = -half + (2 * half * i) / 30;
          pts.push(new THREE.Vector3(cx + R * Math.cos(a), H / 2 + R * Math.sin(a), 0.3));
        }
        this.kArc = tube(pts, 0.02, '#6d28d9', 0.8);
        this.g1.add(this.kArc);
      }
    }
    this.t1.k.visible = kOn;
    this.t1.k.position.set(Dm - 1.05, this.main.H / 2 - 0.85, 0.3);
    // 押す力の割合
    const pText = `P = ${Math.round(p * 100)}%`;
    if (this.t1.pp.userData.t !== pText) {
      const sp = tag(pText, p >= 0.995 ? '#e11d48' : '#1f2a44', 0.7, 1.2);
      sp.position.copy(this.t1.pp.position);
      this.g1.remove(this.t1.pp);
      const old = this.t1.pp.material as THREE.SpriteMaterial;
      old.map?.dispose();
      old.dispose();
      this.t1.pp = sp;
      sp.userData.t = pText;
      this.g1.add(sp);
    }
    this.t1.pp.visible = true;
    this.t1.pp.position.set(this.main.topX + 1.0, this.main.topY + 0.12, 0.25);
    const z = 0.25;
    // 押す力の通り道(上下のピンを結ぶ点線)と、ずれ y: 通り道から真ん中までの横の距離
    this.offLine.visible = show;
    setLine(this.offLine, 0, -0.1, 0, this.main.topY + 0.1, 0.2);
    this.t1.path.visible = show;
    this.t1.path.position.set(-0.75, this.main.topY * 0.82, z);
    placeArrow(this.yArrow, 0, y, z, x, 0);
    this.yArrow.visible = show && x > 0.06;
    this.t1.y.visible = this.yArrow.visible;
    this.t1.y.position.set(x / 2 - 0.15, y - 0.28, z);
    // 回す力の大きさ(絵の上): どちらも y に比例。曲げる方は p 倍
    const kM = 2.2;
    const mb = kM * p * Dm;
    const mk = kM * Dm;
    const on = show && Dm > 0.03;
    this.mBend.visible = on && M.bend && mb > 0.02;
    this.mBack.visible = on && M.back;
    this.mBend.position.set(x, y, z);
    this.mBack.position.set(x, y, z);
    // 円弧の半径を回す力に比例させる。互角(p = 1)なら同じ円に重なり、矢じりだけが逆を向く
    const rb = 0.12 + 1.7 * p * Dm;
    const rk = 0.18 + 1.7 * Dm;
    this.mBend.scale.setScalar(rb);
    this.mBack.scale.setScalar(rk);
    this.mBend.position.z = z + 0.04;
    this.t1.bend.visible = this.mBend.visible;
    this.t1.bend.position.set(x + rb * 0.6 + 0.95, y + rb * 0.85 + 0.15, z);
    this.t1.back.visible = on && M.back;
    this.t1.back.position.set(x + rk * 0.6 + 1.0, y - rk * 0.85 - 0.15, z);
    // 比べるゲージ(左上)
    const gx = -2.75;
    const gy = 2.9;
    const L = 1.5;
    const set = (m: THREE.Mesh, len: number, yy: number) => {
      m.visible = show && len > 0.01;
      m.scale.x = Math.max(0.01, len);
      m.position.set(gx + len / 2, yy, 0.1);
    };
    // ゲージは「戻す方を 1」とした比。曲げる方は P/Pe(ずれ y によらない)
    void mb;
    void mk;
    // 比べるゲージは使わない(P と π²EI/l² の比べは、画面に重ねる天秤で見せる)
    set(this.gauge[0], 0, gy);
    set(this.gauge[1], 0, gy - 0.36);
    void L;
    this.t1.gt.visible = false;
    this.t1.gb.visible = false;
    this.t1.gk.visible = false;
    this.t1.even.visible = false;
    this.t1.even.position.set(gx + L * 1.3 + 0.45, gy - 0.18, 0.1);
    // きっかけの指(横から押す)
    placeArrow(this.poke, x - 0.1 - pokeLen, y + 0.35, z, pokeLen, 0);
    this.poke.visible = pokeLen > 0.05;
    this.t1.poke.visible = this.poke.visible;
    this.t1.poke.position.set(x - 0.4 - pokeLen, y + 0.7, z);
  }

  protected tick(dt: number) {
    this.tugInfo.phase = -1;
    this.lenInfo.phase = -1;
    // 場面 3 以降は旧番号(サインカーブ・式にするの2場面を除いた。導出は「式と Q&A」)
    const s = this.sceneIndex >= 3 ? this.sceneIndex + 2 : this.sceneIndex;
    const c = this.clock;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    if (s === 0) {
      this.only(this.g0);
      const t = this.cyc(15, c);
      const p = Math.min(1, ramp(t, 1, 8) * 1.0) * (1 - ramp(t, 13.5, 15));
      const D = 0.5 * (ramp(t, 7.9, 8.6) - ramp(t, 13.5, 15));
      // 現象の場面は、押す力と反力だけ(曲げる力・戻す力は次の綱引きで)
      this.main.update(D, p, false);
      this.forces(0, 0, false);
      this.caption =
        t < 1
          ? '細い棒を、ゆっくり押していく'
          : t < 7.9
            ? `押す力 ${pct(p)}。まっすぐのまま耐えている`
            : '限界の力に達した瞬間、突然ぐにゃり。これが座屈';
      this.look(0, 1.45, 2.4, 2.75, 12, 6);
    } else if (s === 1) {
      this.only(this.g0);
      // 綱引き(46 秒、行ったり来たりしない1本の流れ)。式のカードと天秤は画面に重ねる(Stage2.tsx が tugInfo を読む)
      //  0 もし少し曲がったら(ずれ y)→ 1 曲げる力 P × y → 2 戻す力 EI × 1/R → 3 1/R は y に比例(円が小さくなる)
      //  → 4 戻す力 = π²EI/l² × y → 5 × y は両方に同じ = 大小に効かない → 6 天秤: P を上げて π²EI/l² と比べる
      const t = this.cyc(46, c);
      const phase = t < 4 ? 0 : t < 10 ? 1 : t < 16 ? 2 : t < 23 ? 3 : t < 29 ? 4 : t < 33 ? 5 : 6;
      let p = 0.5;
      let D = 0;
      let ghost = 0.32 * ramp(t, 1, 3);
      if (phase === 3) ghost = 0.32 + 0.3 * (ramp(t, 17, 19.5) - ramp(t, 20.5, 22.5));
      if (phase === 6) {
        p = 0.5 + 0.5 * ramp(t, 34, 40) + 0.1 * ramp(t, 42, 43);
        if (t > 42.5) D = Math.min(0.62, 0.02 * Math.exp((t - 42.5) * 1.6));
      }
      this.tugMask.bend = phase >= 1;
      this.tugMask.back = phase >= 2;
      this.tugMask.k = phase >= 2;
      this.tugInfo.phase = phase;
      this.tugInfo.p = p;
      this.caption =
        phase === 0
          ? '押している柱が、もし少し曲がったら?(点線)'
          : phase === 1
            ? '曲げる力: 押す力 P が、ずれ y を腕にして回す'
            : phase === 2
              ? '戻す力: 曲がった柱が戻ろうとする。EI × 1/R(映像1)'
              : phase === 3
                ? '曲がりを大きくすると、1/R も同じ割合で大きくなる'
                : phase === 4
                  ? 'だから 戻す力も、ずれ y に比例する'
                  : phase === 5
                    ? 'y は両方に同じだけ掛かる。大小には効かない'
                    : t < 40
                      ? `残るのは P と π²EI/l² の重さ比べ。P を上げる(${Math.round(p * 100)}%)`
                      : t < 42.5
                        ? '釣り合った。これが座屈荷重 P = π²EI/l²'
                        : '超えると、もう戻せない。曲がり出して止まらない';
      this.main.update(D, p);
      this.forces(0, 0, false);
      this.tug(D, p, true, 0, ghost);
      // 左側に式のカードと天秤を重ねるので、柱は右寄せに
      this.look(-1.5, 1.55, 3.5, 2.85, 10, 6);
    } else if (s === 2) {
      // 長さ(28 秒): 式の l = 柱の長さ を寸法線で示す → 同じだけずらして比べる → 同じ力で押す
      this.only(this.g2);
      const t = this.cyc(28, c);
      let dS = 0;
      let dL = 0;
      let p = 0;
      const grow = ramp(t, 0.4, 2.2);
      this.dims.forEach((d) => {
        const h = Math.max(0.001, d.H * grow);
        d.v.scale.y = h;
        d.v.position.y = h / 2;
        d.t1.position.y = h;
        d.tag.position.set(-0.3, h / 2, 0);
        d.tag.visible = grow > 0.95;
      });
      if (t < 3.5) {
        this.lenInfo.phase = 0;
        this.caption = '式の分母の l は、この柱の長さ';
      } else if (t < 13.5) {
        this.lenInfo.phase = 1;
        const u = t - 3.5;
        dS = dL = 0.4 * ramp(u, 1, 3) * (1 - ramp(u, 9, 10));
        this.caption = u < 5 ? '長さ 2l の棒と比べる。同じだけ横にずらすと…' : '長い棒の戻す力(青)は 1/4。l が2倍で l² が4倍だから';
      } else {
        this.lenInfo.phase = 2;
        const u = t - 3.5;
        p = 1.05 * ramp(u, 11, 20) * (1 - ramp(u, 23, 24));
        dL = 0.4 * ramp(p, 0.245, 0.27);
        dS = 0.4 * ramp(p, 0.99, 1.02);
        this.caption = p < 0.25 ? `2本を同じ力で押す。押す力 ${pct(p)}` : p < 0.99 ? `押す力 ${pct(p)}。長い棒は 25% で座屈した` : '長さが2倍なら、座屈する力は 1/4(長さの2乗に反比例)';
      }
      // 長い棒は座屈荷重が 1/4 なので、同じずれでも戻す力(青)は 1/4 の長さ
      this.short.update(dS, p, false, Math.min(1.02, p));
      this.long.update(dL, p, false, Math.min(1.02, p / 0.25), 0.25);
      // 試しに同じだけずらしている間だけ、青い矢印の下に倍率の札
      const showBack = t >= 3.5 && t < 13.5 && dS > 0.3;
      [this.short, this.long].forEach((bar, i) => {
        const [x, y] = bar.at(0.5);
        this.backTags[i].position.set(bar.group.position.x + x - (i ? 0.45 : 0.75), y - 0.5, 0.3);
        this.backTags[i].visible = showBack;
      });
      this.tags2[2].visible = dS > 0.3 && t >= 13.5;
      this.tags2[3].visible = dL > 0.3 && t >= 13.5;
      // 左側に式のカードを重ねるので、棒は右寄せに
      this.look(-1.6, 1.45, 3.3, 2.8, 10, 6);
    } else if (s === 5) {
      // 支え方(43 秒): 4本とも長さは l(紫の寸法線)→ 同じ力で押す → 赤い線 = 有効座屈長 le = K × l
      this.only(this.g5);
      const T = this.cyc(43, c);
      // 4〜10 秒: 4本を同じだけ試しに曲げて、戻す力(青)を比べる。10 秒から押していく
      const trial = T < 10 ? 0.36 * ramp(T, 4.5, 6) * (1 - ramp(T, 9, 10)) : -1;
      const t = Math.max(0, T - 10);
      // 座屈した形(赤い線 = le)は、式のカードを読めるよう長めに残す
      const p = T < 10 ? 0 : 4.25 * ramp(t, 2, 19) * (1 - ramp(t, 31, 32));
      const fade = 1 - ramp(t, 31, 32);
      const grow = ramp(T, 0.4, 2.2) * fade;
      this.dims5.forEach((d) => this.growDim(d, grow, -0.24));
      let cap = '同じ棒が4本。違うのは、両端の支え方だけ';
      this.four.forEach((b, i) => {
        const g = SUPPORTS[b.sup].gain;
        const goal = p >= g ? 0.36 : 0;
        if (trial >= 0) this.dyn[i] = trial;
        else this.dyn[i] += (goal * fade - this.dyn[i]) * (1 - Math.exp(-dt * 6));
        // 戻す力の長さ = 座屈荷重の倍率(両端ピン = 1)。16 倍の幅があるので全体を 1/3 に縮める
        b.update(this.dyn[i], Math.min(p, g * 1.02) / 4.2 + 0.05 * Math.min(1, p), true, Math.min(p, g * 1.02) / g, g / 3);
        const on = this.dyn[i] > 0.3;
        this.tags5[i][0].visible = on;
        this.tags5[i][1].visible = on;
        if (p >= g) cap = `${SUPPORTS[b.sup].name}が座屈(基準の ${g < 1 ? '1/4' : g === 1 ? '1' : g < 3 ? '約2' : '4'} 倍の力)`;
      });
      if (T < 4) cap = '4本とも長さは同じ l。違うのは、両端の支え方だけ';
      else if (T < 10) cap = '同じだけ曲げても、戻す力(青)は支え方で違う。le が短いほど強い';
      else if (t > 21) cap = '赤い線 = 有効座屈長 le。式の l の代わりに使う';
      else if (t >= 2 && p < 0.25) cap = `4本を同じ力で押していく(基準の ${p.toFixed(2)} 倍)`;
      this.lenInfo.phase = T < 4 ? 0 : T < 10 || t <= 21 ? 1 : 2;
      this.caption = cap;
      // 左側に式のカードを重ねるので、棒は右寄せに
      this.look(-1.9, 1.0, 4.6, 3.6, 8, 5);
    } else {
      this.only(this.gLab);
      const { sup, L, load } = this.lab;
      const key = `${sup}|${L}`;
      if (key !== this.labKey) {
        this.labKey = key;
        if (this.labBar) this.gLab.remove(this.labBar.group);
        this.labBar = new Bar(sup, 0.24 * L, 0.06 * L);
        this.gLab.add(this.labBar.group);
        this.dyn[0] = 0;
      }
      const b = this.labBar!;
      // 降伏が先に来る長さでは、弾性座屈の形には曲げない
      const goal = load >= 1 && !this.lab.yieldFirst ? b.H * 0.24 * Math.min(1, 0.6 + (load - 1) * 2) : 0;
      this.dyn[0] += (goal - this.dyn[0]) * (1 - Math.exp(-dt * 5));
      b.update(this.dyn[0], load * 0.8, true, this.lab.yieldFirst ? undefined : Math.min(1.1, load));
      this.caption = '';
      this.look(0, 1.4, 2.8, 3.4, 10, 6);
    }
  }
}
