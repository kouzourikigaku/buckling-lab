import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** 応力/σy(圧縮を正、-1〜1)→ 色(リニア RGB)の表。圧縮=シアン、引張=オレンジ、降伏=クリムゾン */
const LUT_N = 512;
const LUT = new Float32Array(LUT_N * 3);
{
  // 0 → 0.5 → 0.9 の3段で色を変え、応力の大小が見分けられるようにする
  const neutral = new THREE.Color('#b9c3d2');
  const compMid = new THREE.Color('#60a5fa');
  const comp = new THREE.Color('#1d4ed8');
  const tensMid = new THREE.Color('#fdba74');
  const tens = new THREE.Color('#ea580c');
  const yld = new THREE.Color('#e11d48');
  const c = new THREE.Color();
  for (let i = 0; i < LUT_N; i++) {
    const s = (i / (LUT_N - 1)) * 2 - 1;
    const a = Math.abs(s);
    const mid = s >= 0 ? compMid : tensMid;
    const hi = s >= 0 ? comp : tens;
    if (a < 0.5) c.copy(neutral).lerp(mid, a / 0.5);
    else c.copy(mid).lerp(hi, Math.min(1, (a - 0.5) / 0.45));
    // 降伏の手前 3% から赤へ
    const t = Math.min(1, Math.max(0, (a - 0.965) / 0.03));
    c.lerp(yld, t * t * (3 - 2 * t));
    LUT[i * 3] = c.r;
    LUT[i * 3 + 1] = c.g;
    LUT[i * 3 + 2] = c.b;
  }
}

/** out[o..o+2] に応力 s の色を書く。mix=0 で鋼の地色、1 で応力の色 */
export function writeStressColor(out: Float32Array, o: number, s: number, mix: number, steel: THREE.Color) {
  const i = Math.max(0, Math.min(LUT_N - 1, Math.round(((s + 1) / 2) * (LUT_N - 1)))) * 3;
  out[o] = steel.r + (LUT[i] - steel.r) * mix;
  out[o + 1] = steel.g + (LUT[i + 1] - steel.g) * mix;
  out[o + 2] = steel.b + (LUT[i + 2] - steel.b) * mix;
}

/** 頂点の色(または個体ごとの色)がそのまま光って見える鋼の材質。glow.value で光の強さ */
export function makeGlowMaterial(glow: { value: number }, opts: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({ metalness: 0.5, roughness: 0.45, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = glow;
    // 応力の色で見るときは、照明の当たり方を弱めて色そのものを光らせる(白飛びを防ぐ)
    sh.fragmentShader =
      'uniform float uGlow;\n' +
      sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n#ifdef USE_COLOR\n diffuseColor.rgb *= (1.0 - 0.7 * uGlow);\n#endif')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance += vColor.rgb * uGlow * 0.62;\n#endif',
        );
  };
  return m;
}

export function makeRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.localClippingEnabled = true;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

export function addStudioEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, intensity: number) {
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = intensity;
  pm.dispose();
}

export const BG = new THREE.Color('#eef2f8');
