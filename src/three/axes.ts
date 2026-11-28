import * as THREE from 'three';
import { writeStressColor } from './common.ts';
import { springGeometry } from './explain.ts';
import { ShowBase, arrow, line, ramp, setArrow, setLine } from './kit.ts';
import { BendBeam, H, gauge, setGauge, tag } from './stage1.ts';

/**
 * 補足ページ「強軸と弱軸」の 3D(映像1 の「だから H形」と同じ見た目)。
 * 場面 0: 同じ H形鋼を、強軸まわり・弱軸まわりに同じ力で曲げる
 * 場面 1: 強軸まわり。輪切りの断面を、同じ量の鉄 = バネ1本で表す
 * 場面 2: 弱軸まわり。同じ断面を横に倒して曲げる
 * 場面 3: 2つを並べて、踏ん張り(断面二次モーメント)を比べる
 * 断面は H-300×300×10×16(このサイトの柱と同じ)。曲がりとバネの伸び縮みは誇張。
 */

/** 強軸・弱軸まわりの断面二次モーメント(mm⁴) */
export const I_STRONG = 2 * ((H.b * H.tf ** 3) / 12 + H.b * H.tf * ((H.hw + H.tf) / 2) ** 2) + (H.tw * H.hw ** 3) / 12;
export const I_WEAK = 2 * ((H.tf * H.b ** 3) / 12) + (H.hw * H.tw ** 3) / 12;
export const AREA = 2 * H.b * H.tf + H.hw * H.tw;
export const RATIO = I_STRONG / I_WEAK;

const NEUTRAL = new THREE.Color('#8794a8');
const DARK = () => new THREE.MeshStandardMaterial({ color: '#6f7d94', metalness: 0.45, roughness: 0.5 });
const LIGHT = () => new THREE.MeshStandardMaterial({ color: '#b9c3d2', metalness: 0.7, roughness: 0.45 });

/** 断面の点(mm)。バネ1本 = 同じ量の鉄(約 400 mm²)。強軸の向き: x = 幅方向、y = 高さ方向 */
function samplePoints(): [number, number][] {
  const pts: [number, number][] = [];
  const yf = (H.hw + H.tf) / 2;
  for (let i = 0; i < 12; i++) {
    const x = -H.b / 2 + (H.b / 12) * (i + 0.5);
    pts.push([x, yf], [x, -yf]);
  }
  for (let i = 0; i < 7; i++) pts.push([0, -H.hw / 2 + (H.hw / 7) * (i + 0.5)]);
  return pts;
}

/** 輪切りの断面と、そこに並ぶバネ。断面は x-y 面、バネは手前(+z)へ伸びる。曲げの中心線は y = 0 の横線 */
class Slice {
  group = new THREE.Group();
  private springs: THREE.Mesh[] = [];
  private mats: THREE.MeshStandardMaterial[] = [];
  private ys: number[] = [];
  private front = new THREE.Group();
  private col = new Float32Array(3);
  readonly S = 1 / 115;
  readonly L0 = 1.5;
  axis: THREE.Line;

  constructor(weak: boolean, geo: THREE.BufferGeometry) {
    const S = this.S;
    // 板(奥の固定の板と、手前の傾く板)
    const yf = (H.hw + H.tf) / 2;
    const parts: [number, number, number, number][] = weak
      ? [
          [H.tf, H.b, yf, 0],
          [H.tf, H.b, -yf, 0],
          [H.hw, H.tw, 0, 0],
        ]
      : [
          [H.b, H.tf, 0, yf],
          [H.b, H.tf, 0, -yf],
          [H.tw, H.hw, 0, 0],
        ];
    // parts: [x 方向の幅, y 方向の高さ, x の中心, y の中心]
    const back = new THREE.Group();
    for (const [w, h, xc, yc] of parts) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, 0.08), DARK());
      a.position.set(xc * S, yc * S, -0.04);
      back.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, 0.08), LIGHT());
      b.position.set(xc * S, yc * S, 0.04);
      this.front.add(b);
    }
    this.group.add(back, this.front);
    for (const [px, py] of samplePoints()) {
      const [x, y] = weak ? [py, px] : [px, py];
      const m = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.35 });
      const s = new THREE.Mesh(geo, m);
      s.rotation.x = Math.PI / 2;
      s.position.set(x * S, y * S, 0);
      s.scale.set(0.42, this.L0, 0.42);
      this.group.add(s);
      this.springs.push(s);
      this.mats.push(m);
      this.ys.push(y * S);
    }
    this.axis = line('#6d28d9', true);
    setLine(this.axis, -2.0, 0, 2.0, 0, this.L0 / 2);
    this.group.add(this.axis);
  }

  /** tilt: 傾き(正で上側が伸びる) */
  update(tilt: number) {
    const half = 1.4;
    this.springs.forEach((s, i) => {
      const y = this.ys[i];
      const len = this.L0 + tilt * y;
      s.scale.y = len;
      // 色の濃さは伸び縮みの大きさ(最大でも降伏の赤にはしない)
      const st = ((this.L0 - len) / (0.32 * half)) * 0.8;
      writeStressColor(this.col, 0, Math.max(-1, Math.min(0.95, st)), Math.min(1, Math.abs(st) * 6), NEUTRAL);
      const m = this.mats[i];
      m.color.setRGB(this.col[0], this.col[1], this.col[2]);
      m.emissive.copy(m.color);
      m.emissiveIntensity = 0.25 + 0.5 * Math.min(1, Math.abs(st) * 2);
    });
    this.front.position.z = this.L0;
    this.front.rotation.x = Math.atan(tilt);
  }
}

export class AxesShow extends ShowBase {
  private gBeams = new THREE.Group();
  private strong: BendBeam;
  private weak: BendBeam;
  private arrows: THREE.Group[] = [];
  private beamTags: THREE.Sprite[] = [];
  private gSlices = new THREE.Group();
  private sStrong: Slice;
  private sWeak: Slice;
  private sliceTags: THREE.Sprite[] = [];
  private gauges: THREE.Mesh[] = [];
  private dist: THREE.Line[] = [];

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.addFloor(-0.05);
    this.scene.add(this.gBeams, this.gSlices);
    const SB = 1 / 250;
    const yf = ((H.hw + H.tf) / 2) * SB;
    this.strong = new BendBeam(6, 1, 1, false);
    this.strong.setSection([
      [H.b * SB, H.tf * SB, yf],
      [H.tw * SB, H.hw * SB, 0],
      [H.b * SB, H.tf * SB, -yf],
    ]);
    // 弱軸まわり: 同じ断面を横に倒す(フランジが縦、ウェブが横)
    this.weak = new BendBeam(6, 1, 1, false);
    this.weak.setSection([
      [H.tf * SB, H.b * SB, 0, yf],
      [H.hw * SB, H.tw * SB, 0, 0],
      [H.tf * SB, H.b * SB, 0, -yf],
    ]);
    const FUL = 0.55;
    for (const [b, z] of [[this.strong, -1.8], [this.weak, 1.8]] as const) {
      b.group.position.set(0, FUL + b.h / 2, z);
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.32, FUL, 4), DARK());
      f.rotation.y = Math.PI / 4;
      f.position.set(0, FUL / 2, z);
      this.gBeams.add(b.group, f);
      for (let i = 0; i < 2; i++) {
        const a = arrow('#1f2a44');
        a.scale.set(1.3, 1, 1.3);
        this.gBeams.add(a);
        this.arrows.push(a);
      }
    }
    for (const [t, c] of [
      ['強軸まわり(ウェブが縦)', '#1f2a44'],
      ['弱軸まわり(ウェブが横)', '#1f2a44'],
      ['曲がり 1', '#6d28d9'],
      [`曲がり 約${RATIO.toFixed(1)}倍`, '#6d28d9'],
    ] as const) {
      const s = tag(t, c, 0.95, t.length > 8 ? 1.6 : 1);
      this.gBeams.add(s);
      this.beamTags.push(s);
    }

    // 輪切りとバネ
    const geo = springGeometry();
    this.sStrong = new Slice(false, geo);
    this.sWeak = new Slice(true, geo);
    this.gSlices.add(this.sStrong.group, this.sWeak.group);
    for (const [t, c] of [
      ['強軸まわり', '#1f2a44'],
      ['弱軸まわり', '#1f2a44'],
      ['曲げの中心線', '#6d28d9'],
      ['曲げの中心線', '#6d28d9'],
      ['遠い: よく効く', '#ea580c'],
      ['ウェブは中心線の上', '#0284c7'],
      ['踏ん張り 1', '#6d28d9'],
      [`踏ん張り 1/${RATIO.toFixed(1)}`, '#6d28d9'],
    ] as const) {
      const s = tag(t, c, 0.75, t.length > 7 ? 1.5 : 1);
      this.gSlices.add(s);
      this.sliceTags.push(s);
    }
    for (let i = 0; i < 2; i++) {
      const g = gauge('#6d28d9');
      this.gSlices.add(g);
      this.gauges.push(g);
      const d = line('#ea580c');
      this.gSlices.add(d);
      this.dist.push(d);
    }
    this.setScene(0);
  }

  private tickBeams(c: number) {
    const t = this.cyc(16, c);
    const push = ramp(t, 1.5, 4) - ramp(t, 14, 15.5);
    const kS = 0.03 * push;
    const kW = kS * RATIO;
    ([[this.strong, kS, -1.8], [this.weak, kW, 1.8]] as const).forEach(([b, k, z], j) => {
      b.update(k, () => 0, 0);
      for (let i = 0; i < 2; i++) {
        const [ex, ey] = b.end(k, i ? 1 : -1);
        const top = b.group.position.y + ey;
        setArrow(this.arrows[j * 2 + i], ex * 0.96, top + 0.08 + 0.8 * push, -0.8 * push, z);
        this.arrows[j * 2 + i].visible = push > 0.02;
      }
      const [lx, ly] = b.end(k, -1);
      const ty = b.group.position.y + ly + 0.6 + 0.8 * push;
      const tx = j === 0 ? 1.4 : lx + 1.4;
      this.beamTags[j].position.set(tx, ty + 0.25, z);
      this.beamTags[j + 2].position.set(tx, ty - 0.2, z);
      this.beamTags[j + 2].visible = t > 5 && t < 14;
    });
    this.caption =
      t < 1.5
        ? '同じ H形鋼を2本。奥は強軸まわり、手前は弱軸まわりに置く'
        : t < 5
          ? '両端を、同じ力で押し下げる'
          : t < 10
            ? `弱軸まわりは、約${RATIO.toFixed(1)}倍曲がる(曲がりは誇張)`
            : '鉄の量も形も同じ。違うのは、曲げる向きだけ';
    this.look(0, 1.6, 4.6, 3.0, 28, 22);
  }

  /** 輪切りの場面。which: 0 = 強軸だけ、1 = 弱軸だけ、2 = 並べる */
  private tickSlices(c: number, which: 0 | 1 | 2) {
    const T = which === 2 ? 16 : 18;
    const t = this.cyc(T, c);
    const tilt = 0.26 * (ramp(t, 2, 4.5) - ramp(t, T - 1.5, T));
    const both = which === 2;
    const xs = both ? [-2.1, 2.1] : [0, 0];
    const Y = 1.95;
    [this.sStrong, this.sWeak].forEach((sl, i) => {
      sl.group.visible = both || which === i;
      sl.group.position.set(xs[i], Y, -0.6);
      sl.update(tilt);
      sl.axis.visible = t > 1;
    });
    const tg = this.sliceTags;
    tg.forEach((s) => (s.visible = false));
    // 見出し
    if (which !== 1) {
      tg[0].visible = true;
      tg[0].position.set(xs[0], Y + 2.0, 0.4);
    }
    if (which !== 0) {
      tg[1].visible = true;
      tg[1].position.set(xs[1], Y + 2.0, 0.4);
    }
    // 中心線の札
    if (!both && t > 1) {
      const k = which === 0 ? 2 : 3;
      tg[k].visible = true;
      tg[k].position.set(xs[which] + 2.35, Y, 0.4);
    }
    // 強軸: フランジまでの距離。弱軸: ウェブは中心線の上
    const S = this.sStrong.S;
    const yf = ((H.hw + H.tf) / 2) * S;
    this.dist.forEach((d) => (d.visible = false));
    if (which === 0 && t > 6) {
      this.dist[0].visible = true;
      setLine(this.dist[0], xs[0] - 1.95, Y, xs[0] - 1.95, Y + yf, 0.2);
      tg[4].visible = true;
      tg[4].position.set(xs[0] - 2.4, Y + yf + 0.35, 0.4);
    }
    if (which === 1 && t > 6) {
      tg[5].visible = true;
      tg[5].position.set(xs[1] - 2.3, Y - 0.35, 0.4);
    }
    // 踏ん張りのゲージ(並べる場面)
    const GK = 2.4;
    this.gauges.forEach((g, i) => {
      setGauge(g, xs[i] - 1.2, 0.3, i === 0 ? GK : GK / RATIO, 0.6);
      g.visible = both && t > 5;
      tg[6 + i].visible = g.visible;
      tg[6 + i].position.set(xs[i] - 0.2, 0.68, 0.6);
    });
    if (which === 0)
      this.caption =
        t < 2
          ? '強軸まわり: H形を輪切りにし、鉄をバネで表す(1本 = 同じ量の鉄)'
          : t < 6
            ? '曲げると、中心線より上は伸び、下は縮む'
            : t < 12
              ? 'フランジのバネは、どれも中心線から遠い(142 mm)'
              : '遠いバネは大きく伸び縮みし、腕も長い。全部がよく効く';
    else if (which === 1)
      this.caption =
        t < 2
          ? '弱軸まわり: 同じ断面を、横に倒して曲げる'
          : t < 6
            ? '同じ角度だけ傾けても、伸び縮みが小さいバネが多い'
            : t < 12
              ? 'ウェブのバネは中心線の上。伸び縮みせず、効かない'
              : 'フランジのバネも、中心線の近くから端まで広がっている';
    else
      this.caption =
        t < 5
          ? '同じ鉄・同じ傾きで、並べて比べる'
          : `踏ん張りは、弱軸まわりが約 1/${RATIO.toFixed(1)}。鉄の置き場所(中心線からの距離)の違い`;
    if (both) this.look(0, 1.7, 4.4, 2.4, 22, 14);
    else this.look(xs[which], 1.9, 3.0, 2.2, 28, 14);
  }

  protected tick() {
    const s = this.sceneIndex;
    const c = this.clock;
    this.gBeams.visible = s === 0;
    this.gSlices.visible = s > 0;
    if (s === 0) this.tickBeams(c);
    else this.tickSlices(c, s === 1 ? 0 : s === 2 ? 1 : 2);
  }
}
