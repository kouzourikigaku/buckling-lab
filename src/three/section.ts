import * as THREE from 'three';
import { SECTION } from '../physics/column.ts';
import type { ColumnPath, ColumnStep } from '../physics/column.ts';
import { BG, addStudioEnvironment, makeGlowMaterial, makeRenderer, writeStressColor } from './common.ts';

const S = 1 / 100; // mm → 絵の単位
const HS = 1.45; // σy あたりの高さ
const STEEL = new THREE.Color('#b9c3d2');

/** 輪切りにした H 形断面の上に、応力の柱を立てて見せる(上=圧縮、下=引張、金色の枠=降伏の天井) */
export class Section3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private bars: THREE.InstancedMesh | null = null;
  private residLines: THREE.Line[] = [];
  private glow = { value: 1 };
  private mat: THREE.Material;
  private w = 1;
  private h = 1;
  private n = 0;
  private dummy = new THREE.Object3D();
  private colors: Float32Array = new Float32Array(0);

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = makeRenderer(canvas);
    this.scene.background = BG;
    addStudioEnvironment(this.renderer, this.scene, 0.35);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c5cfdd', 0.9));
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(3, 6, 4);
    this.scene.add(key);
    this.mat = makeGlowMaterial(this.glow, { metalness: 0.2, roughness: 0.5 });

    const { b, tf, hw, tw } = SECTION;
    const zf = ((hw + tf) / 2) * S;
    // H 形の外形(板3枚)。y の高さごとに枠を作る
    const rects: [number, number, number, number][] = [
      [0, zf, b * S, tf * S],
      [0, -zf, b * S, tf * S],
      [0, 0, tw * S, hw * S],
    ];
    const outline = (y: number, color: string, opacity: number) => {
      const pts: THREE.Vector3[] = [];
      for (const [cx, cz, sx, sz] of rects) {
        const x0 = cx - sx / 2;
        const x1 = cx + sx / 2;
        const z0 = cz - sz / 2;
        const z1 = cz + sz / 2;
        const c = [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x0, z1],
        ];
        for (let i = 0; i < 4; i++) {
          pts.push(new THREE.Vector3(c[i][0], y, c[i][1]), new THREE.Vector3(c[(i + 1) % 4][0], y, c[(i + 1) % 4][1]));
        }
      }
      const l = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
      );
      this.scene.add(l);
    };
    const plates = (y: number, color: string, opacity: number) => {
      for (const [cx, cz, sx, sz] of rects) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(sx, sz),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(cx, y, cz);
        this.scene.add(m);
      }
    };
    outline(0, '#1f2a44', 0.9);
    outline(HS, '#e11d48', 1);
    plates(HS, '#e11d48', 0.12);
    outline(-HS, '#ea580c', 0.35);
    // 天井と床をつなぐ柱(四隅)
    const posts: THREE.Vector3[] = [];
    for (const x of [-b * S * 0.5, b * S * 0.5])
      for (const z of [-zf, zf]) posts.push(new THREE.Vector3(x, -HS, z), new THREE.Vector3(x, HS, z));
    this.scene.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(posts),
        new THREE.LineBasicMaterial({ color: '#b4c0d2', transparent: true, opacity: 0.8 }),
      ),
    );
  }

  private build(path: ColumnPath) {
    if (this.bars) {
      this.scene.remove(this.bars);
      this.bars.dispose();
    }
    for (const l of this.residLines) {
      this.scene.remove(l);
      l.geometry.dispose();
    }
    this.residLines = [];
    const { nf, nw } = path;
    this.n = 2 * nf + nw;
    this.bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.mat, this.n);
    this.bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.n * 3), 3);
    this.bars.frustumCulled = false;
    this.colors = this.bars.instanceColor.array as Float32Array;
    this.scene.add(this.bars);
    // 残留応力(押す前から入っている応力)の線
    const { b, tf, hw } = SECTION;
    const zf = ((hw + tf) / 2) * S;
    const mk = (pts: THREE.Vector3[]) => {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: '#1f2a44', transparent: true, opacity: 0.75 }),
      );
      l.visible = path.params.resid > 0;
      this.scene.add(l);
      this.residLines.push(l);
    };
    for (const z of [zf + tf * S * 0.6, -zf - tf * S * 0.6]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < nf; i++) pts.push(new THREE.Vector3(-path.z[i] * b * S, path.sigR[i] * HS, z));
      mk(pts);
    }
  }

  private path: ColumnPath | null = null;

  update(path: ColumnPath, st: ColumnStep, time: number) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // 隠れている(両方を出していない)ときは描かない
    if (!w || !h) return;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (path !== this.path) {
      this.path = path;
      this.build(path);
    }
    const bars = this.bars!;
    const { b, tf, hw, tw } = SECTION;
    const { nf, nw } = path;
    const zf = ((hw + tf) / 2) * S;
    const d = this.dummy;
    let k = 0;
    const put = (x: number, z: number, sx: number, sz: number, s: number) => {
      const hgt = s * HS;
      d.position.set(x, hgt / 2, z);
      d.scale.set(sx, Math.max(0.012, Math.abs(hgt)), sz);
      d.updateMatrix();
      bars.setMatrixAt(k, d.matrix);
      writeStressColor(this.colors, k * 3, s, 1, STEEL);
      k++;
    };
    const fw = (b * S) / nf;
    for (const z of [zf, -zf]) for (let i = 0; i < nf; i++) put(-path.z[i] * b * S, z, fw * 0.92, tf * S, st.sig[i]);
    const ww = (hw * S) / nw;
    for (let i = 0; i < nw; i++) put(0, path.u[nf + i] * hw * S, tw * S, ww * 0.92, st.sig[nf + i]);
    bars.instanceMatrix.needsUpdate = true;
    bars.instanceColor!.needsUpdate = true;

    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(2.55 / tan, 2.75 / (tan * this.camera.aspect));
    const az = THREE.MathUtils.degToRad(28 + Math.sin(time * 0.3) * 7);
    const el = THREE.MathUtils.degToRad(24);
    this.camera.position.set(dist * Math.sin(az) * Math.cos(el), 0.05 + dist * Math.sin(el), dist * Math.cos(az) * Math.cos(el));
    this.camera.lookAt(0, 0.05, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
