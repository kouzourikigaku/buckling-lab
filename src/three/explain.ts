import * as THREE from 'three';
import { writeStressColor } from './common.ts';
import { arrow, label, line, ramp, setArrow, setLine, tintArrow } from './kit.ts';

/**
 * 説明用の場面(模式図)。鋼をバネの束に置きかえて見せる。
 *  spring: 圧縮・引張・降伏とは
 *  weld:   溶接でなぜ先端が圧縮になるか
 *  lever:  踏ん張り(曲げへの抵抗)は端のバネほど効く
 *  domino: 曲がると、押す力がさらに曲げにかかる
 */
export type ExplainMode = 'spring' | 'weld' | 'lever' | 'domino';

const N = 7;
const L0 = 2.4; // バネのもとの長さ
const GAP = 0.56;
const X = Array.from({ length: N }, (_, i) => (i - (N - 1) / 2) * GAP);
const NEUTRAL = new THREE.Color('#8794a8');
const HOT = new THREE.Color('#f59e0b');
const RED = new THREE.Color('#e11d48');
// 溶接の熱で縮もうとする量(真ん中ほど大きい)
const SHRINK = [0, 0.1, 0.55, 1, 0.55, 0.1, 0];
const SHRINK_MAX = 0.5;
const SHRINK_MEAN = SHRINK.reduce((a, b) => a + b, 0) / N;
// 踏ん張り(Σ 距離²)。端の1本が働かなくなると、残り6本の中心まわりで 17.5/28 = 62.5%
const K_LOST = 17.5 / 28;
const BAR_H = 3.2;
// 溶接の場面の導入(H形鋼のどこを溶接するか)。手前のフランジ = バネの束と同じ位置・大きさ
const H_W = N * GAP + 0.3; // フランジの幅
const H_D = 3.9; // 柱の奥行き(ウェブの長さ + フランジの厚み)
const H_TF = 0.14; // フランジの厚み
const H_TW = 0.1; // ウェブの厚み
const WELD_INTRO = 8; // 導入の秒数
/** 場面の1回分の長さ(秒) */
type ExplainCam = { az: number; el: number; tz: number; scale: number; cy: number };
const cycleOf = (mode: ExplainMode) => (mode === 'spring' ? 17 : mode === 'weld' ? 23 + WELD_INTRO : 23);

export function springGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const turns = 9;
  for (let i = 0; i <= 260; i++) {
    const u = i / 260;
    const a = u * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.17, u, Math.sin(a) * 0.17));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 320, 0.036, 8);
}

export class ExplainScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  /** いまの段階の説明(画面に重ねて出す) */
  caption = '';
  // バネの束
  private bundle = new THREE.Group();
  private springs: THREE.Mesh[] = [];
  private mats: THREE.MeshStandardMaterial[] = [];
  private top: THREE.Mesh;
  private topMat: THREE.MeshStandardMaterial;
  private big: THREE.Group[] = [];
  private small: THREE.Group[] = [];
  private ref: THREE.Line;
  private torch: THREE.Mesh;
  private torchLight: THREE.PointLight;
  private weldLabels = new THREE.Group();
  // 溶接の導入: H形鋼(手前のフランジ・ウェブ・奥のフランジ)、溶接ビード4本、トーチ2つ
  private hGroup = new THREE.Group();
  private hFront: THREE.MeshStandardMaterial;
  private hRest: THREE.MeshStandardMaterial;
  private beads: THREE.Mesh[] = [];
  private beadFront: boolean[] = [];
  private hTorches: THREE.Mesh[] = [];
  private hLabels: THREE.Sprite[] = [];
  /** 導入の間だけ使うカメラ(null なら いつものカメラ) */
  private cam: ExplainCam | null = null;
  private armLong: THREE.Line;
  private armShort: THREE.Line;
  private armLabels = new THREE.Group();
  // 1本の柱(ドミノの場面)
  private barGroup = new THREE.Group();
  private bar: THREE.Mesh;
  private barBase: Float32Array;
  private barTop = new THREE.Group();
  private forceLine: THREE.Line;
  private offLine: THREE.Line;
  private offLabel: THREE.Sprite;
  private clock = 0;
  private col = new Float32Array(3);
  private c = new THREE.Color();

  constructor(env: THREE.Texture | null, bg: THREE.Color) {
    this.scene.background = bg;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.5;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c5cfdd', 0.9));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(3, 6, 7);
    this.scene.add(key);
    this.scene.add(this.bundle, this.barGroup, this.hGroup);
    // 溶接の導入の H形鋼。手前のフランジは z = 0(バネの束と重なる位置)、ウェブは奥(−z)へ
    this.hFront = new THREE.MeshStandardMaterial({ color: '#8794a8', metalness: 0.55, roughness: 0.4, transparent: true });
    this.hRest = new THREE.MeshStandardMaterial({ color: '#8794a8', metalness: 0.55, roughness: 0.4, transparent: true });
    const fFront = new THREE.Mesh(new THREE.BoxGeometry(H_W, L0, H_TF), this.hFront);
    fFront.position.set(0, L0 / 2, 0);
    const fBack = new THREE.Mesh(new THREE.BoxGeometry(H_W, L0, H_TF), this.hRest);
    fBack.position.set(0, L0 / 2, -H_D);
    const web = new THREE.Mesh(new THREE.BoxGeometry(H_TW, L0, H_D - H_TF), this.hRest);
    web.position.set(0, L0 / 2, -H_D / 2);
    this.hGroup.add(fFront, fBack, web);
    // 溶接ビード: フランジとウェブのつなぎ目(ウェブの両側 × 手前・奥のフランジ = 4本)。長さ方向(y)に伸びる
    const r = 0.055;
    for (const front of [true, false])
      for (const side of [-1, 1]) {
        const b = new THREE.Mesh(
          new THREE.CylinderGeometry(r, r, 1, 10),
          new THREE.MeshStandardMaterial({ color: '#6b7280', emissive: '#f59e0b', emissiveIntensity: 0, transparent: true }),
        );
        b.position.set(side * (H_TW / 2 + r), 0, front ? -(H_TF / 2 + r) : -H_D + H_TF / 2 + r);
        this.hGroup.add(b);
        this.beads.push(b);
        this.beadFront.push(front);
      }
    // トーチ(手前のつなぎ目2本を進む光)
    for (let i = 0; i < 2; i++) {
      const tch = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: '#fde68a' }));
      const lt = new THREE.PointLight('#ffb347', 6, 4, 1.5);
      tch.add(lt);
      this.hGroup.add(tch);
      this.hTorches.push(tch);
    }
    for (const [text, color] of [
      ['フランジ', '#1f2a44'],
      ['ウェブ', '#1f2a44'],
      ['溶接するつなぎ目', '#d97706'],
    ] as const) {
      const sp = label(text, color, text.length > 5 ? 1.6 : 1);
      sp.scale.multiplyScalar(0.7);
      this.hGroup.add(sp);
      this.hLabels.push(sp);
    }
    this.hLabels[0].position.set(-H_W / 2 + 0.6, L0 + 0.35, 0.1);
    this.hLabels[1].position.set(0.5, L0 + 0.35, -H_D * 0.55);
    this.hLabels[2].position.set(1.3, L0 * 0.45, -0.4);
    this.hGroup.visible = false;

    const plate = new THREE.MeshStandardMaterial({ color: '#6f7d94', metalness: 0.45, roughness: 0.5 });
    const bright = new THREE.MeshStandardMaterial({ color: '#c9d3e3', metalness: 0.9, roughness: 0.25 });
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(N * GAP + 0.3, 0.16, 0.8), plate);
    bottom.position.y = -0.08;
    this.bundle.add(bottom);
    this.topMat = new THREE.MeshStandardMaterial({ color: '#b9c3d2', metalness: 0.7, roughness: 0.45, transparent: true });
    this.top = new THREE.Mesh(new THREE.BoxGeometry(N * GAP + 0.3, 0.16, 0.8), this.topMat);
    this.bundle.add(this.top);

    const geo = springGeometry();
    for (let i = 0; i < N; i++) {
      const m = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.35 });
      const s = new THREE.Mesh(geo, m);
      s.position.x = X[i];
      this.bundle.add(s);
      this.springs.push(s);
      this.mats.push(m);
      const a = arrow('#1f2a44');
      this.bundle.add(a);
      this.small.push(a);
    }
    for (let i = 0; i < 2; i++) {
      const a = arrow('#1f2a44');
      a.scale.set(2.2, 1, 2.2);
      this.scene.add(a);
      this.big.push(a);
    }

    // もとの長さの目印
    const w = (N * GAP) / 2 + 0.35;
    this.ref = line('#6d28d9', true);
    setLine(this.ref, -w, L0, w, L0);
    this.bundle.add(this.ref);

    // 溶接の場面の札
    for (const [text, x] of [['先端', X[0]], ['溶接部', 0], ['先端', X[N - 1]]] as const) {
      const sp = label(text, text === '溶接部' ? '#f59e0b' : '#1f2a44');
      sp.position.set(x, -0.42, 0.5);
      this.weldLabels.add(sp);
    }
    this.bundle.add(this.weldLabels);
    this.torch = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshBasicMaterial({ color: '#fde68a' }));
    this.torchLight = new THREE.PointLight('#ffb347', 0, 5, 1.5);
    this.torch.add(this.torchLight);
    this.bundle.add(this.torch);

    // テコの腕(中心からの距離)
    this.armLong = line('#6d28d9');
    this.armShort = line('#6d28d9');
    setLine(this.armLong, 0, -0.32, X[N - 1], -0.32, 0.5);
    setLine(this.armShort, 0, -0.62, X[4], -0.62, 0.5);
    const l1 = label('腕が長い', '#6d28d9');
    l1.position.set(X[N - 1] + 0.95, -0.32, 0.5);
    const l2 = label('腕が短い', '#6d28d9');
    l2.position.set(X[4] + 0.95, -0.62, 0.5);
    // 中心の目印
    const tick = line('#6d28d9');
    setLine(tick, 0, -0.2, 0, -0.74, 0.5);
    const l0 = label('中心', '#6d28d9');
    l0.position.set(-0.6, -0.47, 0.5);
    this.armLabels.add(this.armLong, this.armShort, l1, l2, tick, l0);
    this.bundle.add(this.armLabels);

    // 1本の柱
    const barGeo = new THREE.BoxGeometry(0.2, BAR_H, 0.2, 1, 48, 1);
    barGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(barGeo.attributes.position.count * 3), 3));
    this.barBase = new Float32Array(barGeo.attributes.position.array as Float32Array);
    this.bar = new THREE.Mesh(barGeo, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.35 }));
    this.bar.position.y = BAR_H / 2;
    this.bar.frustumCulled = false;
    this.barGroup.add(this.bar);
    const pinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.5, 20).rotateX(Math.PI / 2);
    const pinB = new THREE.Mesh(pinGeo, bright);
    pinB.position.y = -0.11;
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.8), plate);
    ped.position.y = -0.3;
    this.barGroup.add(pinB, ped);
    const pinT = new THREE.Mesh(pinGeo, bright);
    pinT.position.y = 0.11;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.7), plate);
    head.position.y = 0.29;
    this.barTop.add(pinT, head);
    this.barGroup.add(this.barTop);
    this.forceLine = line('#6d28d9', true);
    this.offLine = line('#6d28d9');
    this.offLabel = label('ずれ', '#6d28d9');
    this.barGroup.add(this.forceLine, this.offLine, this.offLabel);
  }

  reset() {
    this.clock = 0;
  }

  /** 再生位置を p(0〜1)へ移す。見終えていれば見終わりのまま */
  seek(mode: ExplainMode, p: number) {
    const T = cycleOf(mode);
    const q = Math.max(0, Math.min(0.999, p));
    this.clock = (this.clock >= T ? T : 0) + q * T;
  }

  /** 場面の動きの進み具合(1回分は spring が 17 秒、weld が 31 秒(導入 8 秒 + 23 秒)、ほかは 23 秒でくり返す) */
  clip(mode: ExplainMode) {
    const T = cycleOf(mode);
    const k = this.clock / T;
    return { p: k % 1, done: k >= 1, loop: true };
  }

  /**
   * 溶接の場面の導入(8 秒): H形鋼を斜め上から見せる → フランジとウェブのつなぎ目4か所を、トーチが長さ方向に溶接していく
   * → 手前のフランジへ回り込み、ウェブと奥のフランジを消す → 手前のフランジが透けて、中のバネ7本に置きかわる
   */
  private weldIntro(tw: number) {
    this.hGroup.visible = true;
    const grow = ramp(tw, 1.6, 4.6); // ビードの伸び
    const cool = ramp(tw, 4.8, 6.2); // 光が冷める
    const restA = 1 - ramp(tw, 5.4, 6.4); // ウェブ・奥のフランジ
    const frontA = 1 - ramp(tw, 6.4, 7.8); // 手前のフランジ(透けてバネが見える)
    this.hRest.opacity = restA;
    this.hRest.depthWrite = restA > 0.5;
    this.hFront.opacity = 0.15 + 0.85 * frontA;
    this.hFront.depthWrite = frontA > 0.5;
    this.beads.forEach((b, i) => {
      const len = Math.max(0.001, grow * L0);
      b.scale.y = len;
      b.position.y = len / 2;
      const m = b.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 1.6 * (1 - cool);
      m.opacity = this.beadFront[i] ? frontA : restA;
      b.visible = grow > 0.01 && m.opacity > 0.02;
    });
    this.hTorches.forEach((tc, i) => {
      tc.visible = tw > 1.6 && tw < 4.6;
      tc.position.set((i ? 1 : -1) * (H_TW / 2 + 0.1), grow * L0, -(H_TF / 2 + 0.1));
    });
    this.hLabels[0].visible = this.hLabels[1].visible = tw < 5.4;
    this.hLabels[2].visible = tw > 2 && tw < 6.2;
    // バネの束は、手前のフランジが透け始めたら中から見せる
    this.bundle.visible = tw > 6.4;
    this.weldLabels.visible = tw > 6.4;
    // カメラ: 斜め上から H の形が見える向き → 手前のフランジの正面へ
    const u = ramp(tw, 5.0, 7.4);
    const e = u * u * (3 - 2 * u);
    this.cam = { az: 48 + (14 - 48) * e, el: 30 + (12 - 30) * e, tz: -H_D / 2 + (H_D / 2) * e, scale: 1.45 + (1 - 1.45) * e, cy: 1.2 + 0.1 * e };
    this.caption =
      tw < 1.6
        ? '柱の H形鋼は、3枚の板を溶接して作る'
        : tw < 4.8
          ? 'フランジとウェブのつなぎ目(4か所)を、長さ全体にわたって溶接する'
          : tw < 6.4
            ? '手前のフランジに注目。溶接したのは、その真ん中'
            : 'このフランジを、バネ7本で表す。真ん中のバネが溶接した所';
  }

  /** バネ i の長さ・色を決める。s は応力(圧縮を正、-1〜1)、hot は熱、dead は降伏して働かない度合い */
  private setSpring(i: number, len: number, s: number, hot: number, dead = 0) {
    this.springs[i].scale.y = len;
    writeStressColor(this.col, 0, s, Math.min(1, Math.abs(s) * 6), NEUTRAL);
    this.c.setRGB(this.col[0], this.col[1], this.col[2]).lerp(HOT, hot).lerp(RED, dead);
    const m = this.mats[i];
    m.color.copy(this.c);
    m.emissive.copy(this.c);
    m.emissiveIntensity = 0.25 + 0.55 * Math.min(1, Math.abs(s) * 2) + 1.4 * hot + 0.6 * dead;
  }

  update(mode: ExplainMode, dt: number, aspect: number) {
    this.clock += dt;
    const t0 = this.clock;
    let topY = L0;
    let tilt = 0;
    let topOpacity = 1;
    this.torch.visible = false;
    this.torchLight.intensity = 0;
    for (const a of this.small) a.visible = false;
    for (const a of this.big) a.visible = false;
    this.bundle.visible = mode !== 'domino';
    this.hGroup.visible = false;
    this.cam = null;
    this.barGroup.visible = mode === 'domino';
    this.weldLabels.visible = mode === 'weld';
    this.armLabels.visible = false;

    if (mode === 'spring') {
      const t = t0 % 17;
      // 縮み(正)・伸び(負)の量
      let d = 0;
      if (t < 2.5) {
        this.caption = '鋼は、目に見えない小さなバネの束';
      } else if (t < 7) {
        d = 0.42 * (ramp(t, 2.5, 4) - ramp(t, 6.2, 7));
        this.caption = '押す → 縮んで、押し返す = 圧縮(青)';
      } else if (t < 11.5) {
        d = -0.42 * (ramp(t, 7, 8.5) - ramp(t, 10.7, 11.5));
        this.caption = '引く → 伸びて、引き戻す = 引張(オレンジ)';
      } else {
        d = 0.68 * (ramp(t, 11.5, 13.5) - ramp(t, 16.2, 17));
        this.caption = d > 0.62 ? '限界。これ以上は押し返せない = 降伏(赤)' : 'もっと強く押すと…';
      }
      topY = L0 - d;
      const s = Math.max(-1, Math.min(1, d / 0.64));
      for (let i = 0; i < N; i++) this.setSpring(i, topY, s, 0);
      // 外から押す・引く力
      if (d > 0) setArrow(this.big[0], 0, topY + 0.1 + 0.5 + d * 1.6, -(0.5 + d * 1.6));
      else if (d < 0) setArrow(this.big[0], 0, topY + 0.1, 0.5 - d * 1.6);
    } else if (mode === 'weld') {
      const tw = t0 % cycleOf('weld');
      // 導入(H形鋼のどこを溶接するか)のあいだは、バネは最初の状態のまま
      const t = Math.max(0, tw - WELD_INTRO);
      const heat = ramp(t, 2.5, 5) - ramp(t, 6.5, 9.5);
      const cool = ramp(t, 6.5, 9.5); // 縮みの進み
      const join = ramp(t, 11.5, 14); // つなげる
      const free = ramp(t, 6.2, 7.2) * (1 - join); // 切り離して見せている度合い
      const Lf = L0 - SHRINK_MEAN * SHRINK_MAX;
      topY = L0 + 0.32 * free - (L0 - Lf) * join;
      topOpacity = 1 - 0.7 * free;
      if (t < 2.5) this.caption = 'フランジをバネ7本で表す。真ん中が溶接される所';
      else if (t < 6.5) this.caption = '溶接。真ん中だけが、溶けるほど熱くなる';
      else if (t < 11.5) this.caption = '冷えると縮む。切り離せたなら、真ん中だけ短くなる';
      else if (t < 15) this.caption = 'でも鋼はひとつながり。同じ長さにそろえられる';
      else this.caption = '真ん中は引き伸ばされ(引張)、先端は押し縮められる(圧縮)';
      for (let i = 0; i < N; i++) {
        const nat = L0 - SHRINK[i] * SHRINK_MAX * cool;
        const len = nat + (Lf - nat) * join;
        // 自然な長さより長ければ引張(負)、短ければ圧縮(正)
        const s = (-(len - nat) / (SHRINK_MAX * (1 - SHRINK_MEAN))) * 0.85;
        this.setSpring(i, len, s, heat * SHRINK[i]);
        if (t >= 15) {
          const k = ramp(t, 15, 16);
          // 引っ張られたバネは板を下へ引き、押されたバネは板を上へ押す
          if (s < -0.05) setArrow(this.small[i], X[i], topY + 0.08 + 0.9 * -s * k + 0.3, -(0.9 * -s * k + 0.3), 0.45);
          else if (s > 0.05) setArrow(this.small[i], X[i], topY + 0.08, 1.6 * s * k + 0.3, 0.45);
          tintArrow(this.small[i], s < 0 ? '#ea580c' : '#0284c7');
        }
      }
      if (tw >= WELD_INTRO && t > 2.5 && t < 5.2) {
        this.torch.visible = true;
        this.torch.position.set(0, ((t - 2.5) / 2.7) * L0, 0.25);
        this.torchLight.intensity = 8;
      }
      if (tw < WELD_INTRO) this.weldIntro(tw);
    } else if (mode === 'lever') {
      const t = t0 % 23;
      const lost = ramp(t, 14, 16); // 左端のバネが降伏して働かなくなる
      const th0 = 0.15 * (ramp(t, 2.5, 4.5) - ramp(t, 21.8, 23));
      // 同じ「曲げようとする力」でも、踏ん張りが減った分だけ大きく傾く
      tilt = th0 / (1 - (1 - K_LOST) * lost);
      const pivot = 0.5 * GAP * lost; // 残ったバネの中心へ回転の中心が移る
      if (t < 2.5) this.caption = '柱が曲がろうとすると、断面は傾こうとする';
      else if (t < 7) this.caption = '片側は縮み、反対側は伸びる。端のバネほど大きく';
      else if (t < 10.5) this.caption = 'バネは傾きを戻す向きに力を出す。これが「踏ん張り」';
      else if (t < 14) this.caption = '端のバネは力が大きいうえに、中心から遠くテコもよく効く';
      else this.caption = '端の1本が限界に達すると、踏ん張りは約4割減。大きく傾く';
      const show = ramp(t, 7, 8);
      for (let i = 0; i < N; i++) {
        const len = L0 + tilt * (X[i] - pivot);
        const s = (L0 - len) / 0.5;
        const dead = i === 0 ? lost : 0;
        this.setSpring(i, len, s, 0, dead);
        const f = s * (1 - dead) * show;
        if (f > 0.03) setArrow(this.small[i], X[i], len + 0.2, 2.0 * f + 0.25, 0.45);
        else if (f < -0.03) setArrow(this.small[i], X[i], len + 0.2 + 2.0 * -f + 0.25, -(2.0 * -f + 0.25), 0.45);
        tintArrow(this.small[i], s < 0 ? '#ea580c' : '#0284c7');
      }
      topY = L0 - tilt * pivot;
      // 曲げようとする力(左を押し下げ、右を持ち上げる)
      const k = ramp(t, 2.5, 4.5) - ramp(t, 21.8, 23);
      const xe = X[N - 1] + 0.62;
      if (k > 0.05) {
        setArrow(this.big[0], -xe, L0 - tilt * (xe + pivot) + 0.2 + 0.9 * k, -0.9 * k);
        setArrow(this.big[1], xe, L0 + tilt * (xe - pivot) - 0.25 - 0.9 * k, 0.9 * k);
      }
      this.armLabels.visible = t >= 10.5 && t < 14;
    } else {
      const t = t0 % 23;
      let D = 0;
      let yielded = 0;
      if (t < 2.5) {
        this.caption = 'まっすぐな柱なら、押す力はまっすぐ下へ抜ける';
      } else if (t < 5.5) {
        D = 0.3 * ramp(t, 2.5, 4.5);
        this.caption = '少しでも曲がると、柱の中央が力の通り道からずれる';
      } else if (t < 9) {
        D = 0.3;
        this.caption = 'ずれ × 押す力 = 柱をさらに曲げようとする力';
      } else if (t < 12.5) {
        D = 0.3 - 0.2 * ramp(t, 9, 11);
        this.caption = '踏ん張りが十分なら、押し戻して止まる';
      } else {
        yielded = ramp(t, 12.5, 14);
        D = Math.min(1.15, 0.1 * Math.exp((t - 12.5) * 0.44));
        this.caption = '踏ん張りが落ちると止められない。曲がる → ずれが増える → さらに曲がる';
      }
      D *= 1 - ramp(t, 22, 23);
      const shorten = (Math.PI * Math.PI * D * D) / (4 * BAR_H);
      const pos = this.bar.geometry.attributes.position as THREE.BufferAttribute;
      const colr = this.bar.geometry.attributes.color as THREE.BufferAttribute;
      const pa = pos.array as Float32Array;
      const ca = colr.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const y0 = this.barBase[i * 3 + 1];
        const xi = y0 / BAR_H + 0.5;
        const sn = Math.sin(Math.PI * xi);
        pa[i * 3] = this.barBase[i * 3] + D * sn;
        pa[i * 3 + 1] = y0 - this.barBase[i * 3] * ((D * Math.PI) / BAR_H) * Math.cos(Math.PI * xi) - shorten * xi;
        // 曲がりの内側(左)の中央付近が降伏して赤くなる
        const inner = this.barBase[i * 3] < 0 ? 1 : 0.35;
        this.c.copy(NEUTRAL).lerp(RED, yielded * inner * Math.pow(sn, 3));
        ca[i * 3] = this.c.r;
        ca[i * 3 + 1] = this.c.g;
        ca[i * 3 + 2] = this.c.b;
      }
      pos.needsUpdate = true;
      colr.needsUpdate = true;
      this.bar.geometry.computeVertexNormals();
      const yTop = BAR_H - shorten;
      this.barTop.position.y = yTop;
      setArrow(this.big[0], 0, yTop + 0.36 + 0.75, -0.75);
      setLine(this.forceLine, 0, 0, 0, yTop, 0.2);
      const ym = BAR_H / 2 - shorten / 2;
      const on = D > 0.06;
      this.offLine.visible = on;
      this.offLabel.visible = on;
      setLine(this.offLine, 0, ym, D, ym, 0.2);
      this.offLabel.position.set(D + 0.75, ym, 0.3);
    }
    if (mode !== 'domino') {
      this.top.position.y = topY + 0.08;
      this.top.rotation.z = Math.atan(tilt);
      this.topMat.opacity = topOpacity;
      this.ref.visible = mode !== 'lever';
    }

    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // 導入のカメラは weldIntro が入れる(update の冒頭で null に戻すので、型を明示して読む)
    const C = this.cam as ExplainCam | null;
    const cy = C ? C.cy : mode === 'domino' ? 1.6 : 1.3;
    const tz = C ? C.tz : 0;
    const dist = Math.max((mode === 'domino' ? 3.0 : 2.95) / tan, 2.45 / (tan * aspect)) * (C ? C.scale : 1);
    const az = THREE.MathUtils.degToRad(C ? C.az : mode === 'domino' ? 8 : 14);
    const el = THREE.MathUtils.degToRad(C ? C.el : mode === 'domino' ? 6 : 12);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(dist * Math.sin(az) * Math.cos(el), cy + dist * Math.sin(el), tz + dist * Math.cos(az) * Math.cos(el));
    this.camera.lookAt(0, cy, tz);
  }
}
