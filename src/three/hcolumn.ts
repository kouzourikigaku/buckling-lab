import * as THREE from 'three';
import { SECTION } from '../physics/column.ts';
import type { ColumnPath, ColumnStep } from '../physics/column.ts';
import { makeGlowMaterial, writeStressColor } from './common.ts';

const STEEL = new THREE.Color('#7c8aa0');

interface Plate {
  mesh: THREE.Mesh;
  base: Float32Array;
  fib: Float32Array;
  fibMax: number;
}

/** H形の柱1本(下端が原点)。たわみと応力の色を、計算結果から毎回つける */
export class HColumn {
  group = new THREE.Group();
  private plates: Plate[] = [];
  private mat: THREE.Material;
  glow = { value: 0 };
  height = 1;
  /** 絵の上でのたわみと、上端の下がり */
  D = 0;
  topY = 1;

  constructor() {
    this.mat = makeGlowMaterial(this.glow, { vertexColors: true });
  }

  /** height: 絵の上の長さ。wScale: 太さだけを何倍に見せるか */
  build(path: ColumnPath, height: number, wScale = 1) {
    for (const p of this.plates) {
      this.group.remove(p.mesh);
      p.mesh.geometry.dispose();
    }
    this.plates = [];
    this.height = height;
    const sc = (height / path.Lmm) * wScale;
    const bw = SECTION.b * sc;
    const tf = SECTION.tf * sc;
    const hw = SECTION.hw * sc;
    const tw = SECTION.tw * sc;
    const { nf, nw } = path;
    const add = (geo: THREE.BufferGeometry, z0: number, flange: boolean) => {
      geo.translate(0, 0, z0);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const base = new Float32Array(pos.array as Float32Array);
      const fib = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        if (flange) fib[i] = Math.max(0, Math.min(nf - 1, (-base[i * 3] / bw + 0.5) * nf - 0.5));
        else fib[i] = nf + Math.max(0, Math.min(nw - 1, (base[i * 3 + 2] / hw + 0.5) * nw - 0.5));
      }
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.plates.push({ mesh, base, fib, fibMax: flange ? nf - 1 : nf + nw - 1 });
    };
    add(new THREE.BoxGeometry(bw, height, tf, 10, 32, 1), (hw + tf) / 2, true);
    add(new THREE.BoxGeometry(bw, height, tf, 10, 32, 1), -(hw + tf) / 2, true);
    add(new THREE.BoxGeometry(tw, height, hw, 1, 32, 4), 0, false);
  }

  /** amp: たわみの誇張。squash: つぶれの見せ方(0〜1。縮みとふくらみを誇張して足す) */
  update(path: ColumnPath, st: ColumnStep, mix: number, amp: number, squash = 0) {
    const H = this.height;
    const D = Math.min(0.42 * H, amp * (path.v0 + st.v) * SECTION.b * (H / path.Lmm));
    const theta = (D * Math.PI) / H;
    const shorten = (Math.PI * Math.PI * D * D) / (4 * H) + squash * 0.07 * H;
    const fat = 1 + 0.1 * squash;
    this.D = D;
    this.topY = H - shorten;
    this.glow.value = mix;
    const n = path.nf + path.nw;
    const ns = path.ns;
    const sig = st.sigS;
    for (const p of this.plates) {
      const pos = p.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const col = p.mesh.geometry.attributes.color as THREE.BufferAttribute;
      const pa = pos.array as Float32Array;
      const ca = col.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const x0 = p.base[i * 3];
        const xi = p.base[i * 3 + 1] / H + 0.5;
        const sn = Math.sin(Math.PI * xi);
        pa[i * 3] = x0 * (1 + (fat - 1) * sn) + D * sn;
        pa[i * 3 + 1] = xi * H - x0 * theta * Math.cos(Math.PI * xi) - shorten * xi;
        pa[i * 3 + 2] = p.base[i * 3 + 2] * (1 + (fat - 1) * sn);
        const sj = Math.min(xi, 1 - xi) * 2 * (ns - 1);
        const j0 = Math.min(ns - 2, Math.floor(sj));
        const tj = sj - j0;
        const f0 = Math.floor(p.fib[i]);
        const f1 = Math.min(p.fibMax, f0 + 1);
        const tf = p.fib[i] - f0;
        const a = sig[j0 * n + f0] + (sig[j0 * n + f1] - sig[j0 * n + f0]) * tf;
        const b = sig[(j0 + 1) * n + f0] + (sig[(j0 + 1) * n + f1] - sig[(j0 + 1) * n + f0]) * tf;
        writeStressColor(ca, i * 3, a + (b - a) * tj, mix, STEEL);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      p.mesh.geometry.computeVertexNormals();
    }
  }
}
