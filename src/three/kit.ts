import * as THREE from 'three';
import { VIEW, applyView, bindCamera, smoothView } from './view.ts';
import { BG, addStudioEnvironment, makeRenderer } from './common.ts';

export const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
/** 時刻 t が a〜b の間で 0→1 */
export const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));

export function arrow(color: string): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 16), m);
  shaft.position.y = 0.5;
  shaft.name = 'shaft';
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 20), m);
  head.name = 'head';
  g.add(shaft, head);
  return g;
}
/** 矢印を根元 y0 から長さ len(負なら下向き)で置く */
export function setArrow(g: THREE.Group, x: number, y0: number, len: number, z = 0) {
  const a = Math.abs(len);
  g.visible = a > 0.04;
  if (!g.visible) return;
  g.position.set(x, y0, z);
  g.rotation.z = len < 0 ? Math.PI : 0;
  const shaft = g.getObjectByName('shaft')!;
  const head = g.getObjectByName('head')!;
  const sl = Math.max(0.01, a - 0.26);
  shaft.scale.y = sl;
  shaft.position.y = sl / 2;
  head.position.y = sl + 0.13;
}
export function tintArrow(g: THREE.Group, color: string) {
  const m = (g.getObjectByName('head') as THREE.Mesh).material as THREE.MeshStandardMaterial;
  m.color.set(color);
  m.emissive.copy(m.color);
}

/** 文字の札(常にカメラを向く)。wide は長い文用 */
export function label(text: string, color: string, wide = 1): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 512 * wide;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.font = 'bold 76px "Hiragino Sans","Noto Sans JP","Yu Gothic UI",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, cv.width / 2, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false, fog: false }));
  sp.scale.set(1.5 * wide, 0.375, 1);
  return sp;
}

export function line(color: string, dashed = false): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.09, gapSize: 0.06 })
    : new THREE.LineBasicMaterial({ color });
  return new THREE.Line(geo, mat);
}
export function setLine(l: THREE.Line, x0: number, y0: number, x1: number, y1: number, z = 0.42) {
  const p = l.geometry.attributes.position as THREE.BufferAttribute;
  p.setXYZ(0, x0, y0, z);
  p.setXYZ(1, x1, y1, z);
  p.needsUpdate = true;
  l.computeLineDistances();
}


/** 線を太く見せたいときの管。pts をなめらかにつなぐ */
export function tube(pts: THREE.Vector3[], radius: number, color: string, glow = 0.6): THREE.Mesh {
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Math.max(8, pts.length * 3), radius, 8);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: glow, roughness: 0.5 });
  return new THREE.Mesh(geo, mat);
}
/** 管を根元から frac(0〜1)まで描く */
export function drawTube(m: THREE.Mesh, frac: number) {
  const idx = m.geometry.index!;
  m.geometry.setDrawRange(0, Math.floor((idx.count / 6) * Math.max(0, Math.min(1, frac))) * 6);
  m.visible = frac > 0.001;
}

/**
 * 各ステージの 3D の土台。場面(番号)ごとの時計、カメラの寄せ、横になぞる回り込み、
 * 画面に重ねる説明文(caption)を持つ。継承して tick() で中身を動かす。
 */
export abstract class ShowBase {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  caption = '';
  /** いまの場面と、その場面に入ってからの秒 */
  sceneIndex = 0;
  clock = 0;
  /** いまの場面の動き1回分の長さ(秒)と、くり返すかどうか。0 は長さなし(実験室など)。tick の中で cyc・once で決める */
  dur = 0;
  loop = false;
  private durSet = false;
  time = 0;
  protected aspect = 1;
  private w = 0;
  private h = 0;
  private tgt = { cx: 0, cy: 1.5, hw: 3, hh: 3, az: 10, el: 8 };
  private cur = { cx: 0, cy: 1.5, hw: 3, hh: 3, az: 10, el: 8 };
  private first = true;
  /** 一時停止中は場面の時計と動きを止める(カメラの操作は効く) */
  paused = false;
  private view = { ...VIEW };

  constructor(protected canvas: HTMLCanvasElement) {
    this.renderer = makeRenderer(canvas);
    this.scene.background = BG;
    addStudioEnvironment(this.renderer, this.scene, 0.5);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c5cfdd', 0.9));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(3, 7, 7);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#0284c7', 1.0);
    rim.position.set(-6, 4, -5);
    this.scene.add(rim);
    // 左ドラッグ = 回転、右ドラッグ = 平行移動、ホイール = 寄る・引く(指は横になぞると回り込み)
    this.unbind = bindCamera(canvas, this.rot, 70);
  }
  private unbind: () => void;
  /** 見る人が回した向き(度)。場面が変わると元に戻す */
  private rot = { az: 0, el: 0 };

  /** 床と目盛り(必要なステージだけ呼ぶ) */
  protected addFloor(y = 0) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: '#e4eaf2', metalness: 0.2, roughness: 0.75 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = y;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(80, 80, '#bfcada', '#d3dbe6');
    grid.position.y = y + 0.002;
    this.scene.add(grid);
    this.scene.fog = new THREE.Fog(BG, 18, 60);
  }

  /** 画面に収めたい範囲(中心と半分の幅・高さ)と向き */
  protected look(cx: number, cy: number, hw: number, hh: number, az = 10, el = 8) {
    this.tgt = { cx, cy, hw, hh, az, el };
  }

  setScene(i: number) {
    if (i === this.sceneIndex && !this.first) return;
    this.sceneIndex = i;
    this.clock = 0;
    this.rot.az = 0;
    this.rot.el = 0;
    this.onScene(i);
  }
  protected onScene(_i: number) {}
  protected abstract tick(dt: number): void;

  /** T 秒でくり返す動き。c を T で割った余りを返し、場面の長さを記録する(最初に呼んだものが有効) */
  protected cyc(T: number, c = this.clock) {
    if (!this.durSet) {
      this.dur = T;
      this.loop = true;
      this.durSet = true;
    }
    return c % T;
  }
  /** 一度だけ流れる動き(T 秒で終わる)。c をそのまま返し、場面の長さを記録する */
  protected once(T: number, c = this.clock) {
    if (!this.durSet) {
      this.dur = T;
      this.loop = false;
      this.durSet = true;
    }
    return c;
  }
  /** 場面の中の再生位置を p(0〜1)へ移す。くり返しの場面は、見終えていれば見終わりのまま */
  seek(p: number) {
    if (this.dur <= 0) return;
    const q = Math.max(0, Math.min(this.loop ? 0.999 : 1, p));
    this.clock = (this.loop && this.clock >= this.dur ? this.dur : 0) + q * this.dur;
  }

  /** 場面の動きの進み具合: p = 1回分のうちどこまで(0〜1)、done = 1回分を見終えたか。長さがなければ null */
  clip(): { p: number; done: boolean; loop: boolean } | null {
    if (this.dur <= 0) return null;
    const k = this.clock / this.dur;
    return { p: this.loop ? k % 1 : Math.min(1, k), done: k >= 1, loop: this.loop };
  }

  frame(dt: number) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w && h && (w !== this.w || h !== this.h)) {
      this.w = w;
      this.h = h;
      this.aspect = w / h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = this.aspect;
      this.camera.updateProjectionMatrix();
    }
    const adv = this.paused ? 0 : dt;
    this.clock += adv;
    this.time += adv;
    this.durSet = false;
    this.dur = 0;
    this.tick(adv);
    const k = this.first ? 1 : 1 - Math.exp(-dt * 2.4);
    const kAz = this.first ? 1 : 1 - Math.exp(-dt * 5);
    this.first = false;
    const c = this.cur;
    const t = this.tgt;
    c.cx += (t.cx - c.cx) * k;
    c.cy += (t.cy - c.cy) * k;
    c.hw += (t.hw - c.hw) * k;
    c.hh += (t.hh - c.hh) * k;
    c.el += (t.el + this.rot.el - c.el) * kAz;
    c.az += (t.az + this.rot.az - c.az) * kAz;
    // 見る人の調整(平行移動・引き)を上乗せ
    const vw = applyView(c, c.az, smoothView(this.view, this.first ? 1e3 : dt));
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(vw.hh / tan, vw.hw / (tan * this.aspect));
    const az = THREE.MathUtils.degToRad(c.az + Math.sin(this.time * 0.25) * 1.5);
    const el = THREE.MathUtils.degToRad(c.el);
    this.camera.position.set(vw.tx + dist * Math.sin(az) * Math.cos(el), vw.ty + dist * Math.sin(el), vw.tz + dist * Math.cos(az) * Math.cos(el));
    this.camera.lookAt(vw.tx, vw.ty, vw.tz);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.unbind();
    this.renderer.dispose();
  }
}

/** 矢印を (x, y) から (dx, dy) の向き・長さで置く(紙面内の好きな向き) */
export function placeArrow(g: THREE.Group, x: number, y: number, z: number, dx: number, dy: number) {
  const a = Math.hypot(dx, dy);
  g.visible = a > 0.04;
  if (!g.visible) return;
  g.position.set(x, y, z);
  g.rotation.z = Math.atan2(-dx, dy);
  const shaft = g.getObjectByName('shaft')!;
  const head = g.getObjectByName('head')!;
  const sl = Math.max(0.01, a - 0.26);
  shaft.scale.y = sl;
  shaft.position.y = sl / 2;
  head.position.y = sl + 0.13;
}

const UP = new THREE.Vector3(0, 1, 0);
const DIR = new THREE.Vector3();
/** 矢印を (x, y, z) から (dx, dy, dz) の向き・長さで置く(3次元の好きな向き) */
export function aimArrow(g: THREE.Group, x: number, y: number, z: number, dx: number, dy: number, dz: number) {
  const a = Math.hypot(dx, dy, dz);
  g.visible = a > 0.04;
  if (!g.visible) return;
  g.position.set(x, y, z);
  g.quaternion.setFromUnitVectors(UP, DIR.set(dx / a, dy / a, dz / a));
  const shaft = g.getObjectByName('shaft')!;
  const head = g.getObjectByName('head')!;
  const sl = Math.max(0.01, a - 0.26);
  shaft.scale.y = sl;
  shaft.position.y = sl / 2;
  head.position.y = sl + 0.13;
}

/**
 * グラフの壁に付ける「軸の意味」の案内。
 *  横: 目盛りの下に、左右の向きの矢印と言葉(例: ← 太く短い柱 ・ 細く長い柱 →)と、小さな形の絵
 *  縦: 縦軸の左に、上向きの矢印と言葉(例: 耐えられる力 →。縦に書く)
 * x0・x1・y0・y1 はグラフの左端・右端・下端・上端(絵の座標)、z は壁の手前の位置
 */
export function axisGuide(o: {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z: number;
  /** 横の案内の矢印を置く高さ(下端からの距離) */
  below: number;
  /** 縦の案内を置く位置(左端からの距離) */
  left: number;
  xLeft: string;
  xRight: string;
  yText: string;
  /** 横の案内の真ん中に置く軸の名前 */
  xName?: string;
  /** 横の両端に置く形の絵: column = 太短い柱/細長い柱、plate = 厚い板/薄い板 */
  glyph?: 'column' | 'plate';
  size?: number;
}): THREE.Group {
  const g = new THREE.Group();
  const sz = o.size ?? 1;
  const col = '#475569';
  const lineMat = new THREE.LineBasicMaterial({ color: '#94a3b8', toneMapped: false, fog: false });
  const headMat = new THREE.MeshBasicMaterial({ color: '#94a3b8', toneMapped: false, fog: false });
  const glyphMat = new THREE.MeshBasicMaterial({ color: '#8794a8', toneMapped: false, fog: false });
  const yx = o.y0 - o.below;
  const shaft = (x0: number, y0: number, x1: number, y1: number) => {
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y0, o.z), new THREE.Vector3(x1, y1, o.z)]), lineMat));
  };
  const head = (x: number, y: number, rotZ: number) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.06 * sz, 0.18 * sz, 12), headMat);
    c.position.set(x, y, o.z);
    c.rotation.z = rotZ;
    g.add(c);
  };
  /** 文字。wide は札の横幅(文字数に合わせる) */
  const t = (text: string, x: number, y: number, color: string, wide: number, rot = 0, k = 1) => {
    const s = label(text, color, wide);
    s.scale.multiplyScalar(sz * k);
    s.position.set(x, y, o.z);
    (s.material as THREE.SpriteMaterial).rotation = rot;
    g.add(s);
    return s;
  };
  const wOf = (text: string) => Math.max(1, (text.length * 76 + 40) / 512);
  // 横: 両向きの矢印。左右の端に意味、真ん中に軸の名前
  const gl = o.glyph ? 0.5 * sz : 0;
  const xa = o.x0 + gl;
  const xb = o.x1 - gl;
  shaft(xa + 0.1, yx, xb - 0.1, yx);
  head(xa + 0.04, yx, Math.PI / 2);
  head(xb - 0.04, yx, -Math.PI / 2);
  const half = (text: string) => (1.5 * sz * (text.length * 76)) / 512 / 2;
  t(o.xLeft, xa + 0.05 + half(o.xLeft), yx + 0.25 * sz, col, wOf(o.xLeft));
  t(o.xRight, xb - 0.05 - half(o.xRight), yx + 0.25 * sz, col, wOf(o.xRight));
  if (o.xName) t(o.xName, (o.x0 + o.x1) / 2, yx - 0.26 * sz, '#1f2a44', wOf(o.xName), 0, 1.05);
  // 両端の形の絵(太く短い柱/細く長い柱、厚い板/薄い板)
  if (o.glyph) {
    const box = (w: number, h: number, x: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w * sz, h * sz), glyphMat);
      m.position.set(x, yx + ((h - 0.1) * sz) / 2, o.z);
      g.add(m);
    };
    if (o.glyph === 'column') {
      box(0.16, 0.22, o.x0 + 0.2 * sz);
      box(0.05, 0.5, o.x1 - 0.2 * sz);
    } else {
      box(0.34, 0.12, o.x0 + 0.22 * sz);
      box(0.34, 0.03, o.x1 - 0.22 * sz);
    }
  }
  // 縦: 上向きの矢印と、縦書きの言葉(下から上へ読む)
  const xv = o.x0 - o.left;
  shaft(xv, o.y0 + 0.05, xv, o.y1);
  head(xv, o.y1 + 0.06, 0);
  t(o.yText, xv - 0.22 * sz, (o.y0 + o.y1) / 2, col, wOf(o.yText), Math.PI / 2);
  return g;
}
