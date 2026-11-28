import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveColumn, viewAtLoad, dohshiOld } from './column.ts';

const E_FY = 200000 / 355;

test('弾性のうちは P = Pe·v/(v0+v) に一致する', () => {
  const p = solveColumn({ lambda: 1.5, resid: 0, imp: 1 / 1000, eOverFy: E_FY });
  let checked = 0;
  for (const s of p.steps.slice(1)) {
    if (s.yieldFrac > 0) break;
    const exact = (p.Pe * s.v) / (p.v0 + s.v);
    assert.ok(Math.abs(s.P - exact) < 1e-9 + 1e-7 * exact, `v=${s.v} P=${s.P} exact=${exact}`);
    checked++;
  }
  assert.ok(checked > 100);
});

test('理想の柱(不整なし)は min(Py, Pe) に届く', () => {
  for (const lam of [0.3, 0.7, 1.2, 1.8]) {
    const p = solveColumn({ lambda: lam, resid: 0, imp: 0, eOverFy: E_FY });
    const ideal = Math.min(1, 1 / (lam * lam));
    assert.ok(p.Pu <= ideal + 1e-6, `λ=${lam} Pu=${p.Pu}`);
    assert.ok(p.Pu > ideal * 0.97, `λ=${lam} Pu=${p.Pu} ideal=${ideal}`);
  }
});

test('初期たわみだけの柱は、縁が降伏する荷重(ペリー・ロバートソン)より強く、理想より弱い', () => {
  for (const lam of [0.5, 0.9, 1.3, 1.8]) {
    const p = solveColumn({ lambda: lam, resid: 0, imp: 1 / 1000, eOverFy: E_FY });
    const eta = (p.v0 * 0.5) / p.r2; // v0·c/r²
    const pe = p.Pe;
    const a = (1 + (1 + eta) * pe) / 2;
    const firstYield = a - Math.sqrt(a * a - pe);
    assert.ok(p.Pu >= firstYield - 1e-4, `λ=${lam} Pu=${p.Pu} PR=${firstYield}`);
    assert.ok(Math.abs(p.Pfy - firstYield) < 0.02, `λ=${lam} Pfy=${p.Pfy} PR=${firstYield}`);
    assert.ok(p.Pu < Math.min(1, pe), `λ=${lam}`);
  }
});

test('残留応力だけの柱は接線係数荷重か、それより少し上で最大になる', () => {
  const resid = 0.3;
  for (const lam of [0.7, 0.9, 1.1]) {
    const p = solveColumn({ lambda: lam, resid, imp: 0, eOverFy: E_FY, nFlange: 201, nWeb: 61 });
    // まっすぐ押したとき、平均応力 P(e) と弾性の芯の Ie(e) を求め、P = Pe·Ie/I になる荷重を探す
    const n = p.z.length;
    const at = (e: number) => {
      let P = 0;
      let ie = 0;
      for (let i = 0; i < n; i++) {
        const s = Math.min(1, e + p.sigR[i]);
        P += s * p.w[i];
        if (s < 1) ie += p.w[i] * p.z[i] * p.z[i];
      }
      return { P, limit: (p.Pe * ie) / p.r2 };
    };
    let lo = 0;
    let hi = 2;
    for (let i = 0; i < 80; i++) {
      const m = (lo + hi) / 2;
      const r = at(m);
      if (r.P < r.limit) lo = m;
      else hi = m;
    }
    const pt = at(lo).P;
    // シャンリーの理論: 曲がり始めは接線係数荷重、そこから少し上がって最大になる
    assert.ok(p.Pu > pt - 0.01 && p.Pu < pt + 0.06, `λ=${lam} Pu=${p.Pu} Pt=${pt}`);
  }
});

test('不整を大きくすると強度は下がる', () => {
  const base = { lambda: 0.9, eOverFy: E_FY };
  const a = solveColumn({ ...base, resid: 0, imp: 1 / 1000 }).Pu;
  const b = solveColumn({ ...base, resid: 0.3, imp: 1 / 1000 }).Pu;
  const c = solveColumn({ ...base, resid: 0.3, imp: 1 / 500 }).Pu;
  assert.ok(a > b && b > c, `${a} ${b} ${c}`);
});

test('どの断面でも、応力の合力は軸力 P と曲げ P·(v0+v)·sin につり合う', () => {
  for (const lam of [0.4, 0.9, 1.6]) {
    const p = solveColumn({ lambda: lam, resid: 0.3, imp: 1 / 1000, eOverFy: E_FY });
    const n = p.z.length;
    const last = Math.min(p.steps.length - 1, p.peak + 40);
    for (let k = 1; k <= last; k += 7) {
      const s = p.steps[k];
      for (let j = 0; j < p.ns; j++) {
        let N = 0;
        let M = 0;
        for (let i = 0; i < n; i++) {
          N += s.sigS[j * n + i] * p.w[i];
          M += s.sigS[j * n + i] * p.w[i] * p.z[i];
        }
        const sn = Math.sin((Math.PI * j) / (2 * (p.ns - 1)));
        assert.ok(Math.abs(N - s.P) < 2e-4, `λ=${lam} k=${k} j=${j} N=${N} P=${s.P}`);
        assert.ok(Math.abs(M - s.P * (p.v0 + s.v) * sn) < 2e-4, `λ=${lam} k=${k} j=${j} M=${M}`);
      }
    }
  }
});

test('荷重から状態を引ける', () => {
  const p = solveColumn({ lambda: 0.9, resid: 0.3, imp: 1 / 1000, eOverFy: E_FY });
  const v = viewAtLoad(p, p.Pu * 0.5);
  assert.ok(Math.abs(v.step.P - p.Pu * 0.5) < 1e-3);
  assert.equal(v.collapsed, false);
  assert.equal(viewAtLoad(p, p.Pu + 0.05).collapsed, true);
});

test('道示の旧式は区間の境目でつながる', () => {
  assert.ok(Math.abs(dohshiOld(0.2) - 1) < 1e-9);
  assert.ok(Math.abs(dohshiOld(1) - 1 / 1.773) < 1e-3);
});

test('各国の曲線: 区間の境目でつながり、理想の線を超えない', async () => {
  const c = await import('./curves.ts');
  assert.ok(Math.abs(c.aisc(1.5) - 0.877 / 2.25) < 2e-3);
  assert.ok(Math.abs(c.aij(Math.sqrt(1 / 0.6) - 1e-9) - c.aij(Math.sqrt(1 / 0.6) + 1e-9)) < 1e-6);
  assert.ok(Math.abs(c.eurocode(0.2, 0.34) - 1) < 1e-9);
  for (let l = 0.05; l <= 2.5; l += 0.05) {
    for (const v of [c.dohshiOld(l), c.aisc(l), c.eurocode(l, 0.34), c.eurocode(l, 0.49), c.aij(l)]) {
      assert.ok(v <= c.idealCurve(l) + 1e-9 && v > 0, `λ=${l} v=${v}`);
    }
  }
});

test('板の局部座屈: 幅が半分で弾性座屈応力は4倍、強さは降伏で頭打ち', async () => {
  const p = await import('./plate.ts');
  assert.ok(Math.abs(p.sigmaEl(500, 10) / p.sigmaEl(1000, 10) - 4) < 1e-9);
  assert.ok(Math.abs(p.sigmaEl(1000, 20) / p.sigmaEl(1000, 10) - 4) < 1e-9);
  // σel = 4π²E/(12(1-ν²))·(t/b)² ≈ 723,000·(t/b)²
  assert.ok(Math.abs(p.sigmaEl(1000, 10) - 72.3) < 0.1);
  const R = p.plateR(1000, 10, 355);
  assert.ok(Math.abs(p.plateR(500, 10, 355) - R / 2) < 1e-9);
  assert.equal(p.plateStrength(0.5), 1);
  assert.ok(p.plateStrength(0.7001) <= 1);
  assert.ok(Math.abs(p.plateStrength(1.4) - 0.5 / 1.96) < 1e-9);
  for (let r = 0.1; r < 3; r += 0.1) assert.ok(p.plateStrength(r) <= Math.min(1, p.plateTheory(r)) + 1e-9);
});

test('最大荷重のとき、押す力は「残っている踏ん張りで計算した座屈荷重」とほぼ一致する', () => {
  for (const lam of [0.7, 0.9, 1.2]) {
    const p = solveColumn({ lambda: lam, resid: 0.3, imp: 1 / 1000, eOverFy: E_FY });
    const limit = Math.min(1, p.Pe * p.steps[p.peak].ieRatio);
    assert.ok(Math.abs(limit - p.Pu) < 0.06, `λ=${lam} Pu=${p.Pu} limit=${limit}`);
  }
});

test('各国の曲線の値(手計算との照合)', async () => {
  const c = await import('./curves.ts');
  assert.ok(Math.abs(c.dohshiOld(1) - 0.564) < 1e-3);
  assert.ok(Math.abs(c.aisc(1) - 0.658) < 1e-9);
  assert.ok(Math.abs(c.eurocode(1, 0.49) - 0.54) < 1e-3);
  assert.ok(Math.abs(c.eurocode(1, 0.34) - 0.597) < 1e-3);
  // 建築学会の式は、長い柱では安全率を除くとオイラーの式そのもの
  assert.ok(Math.abs(c.aij(1.4) - 1 / 1.96) < 1e-9);
});

test('板: 有効幅を見込んだ強さは、理論値と降伏の間にあり、設計値より大きい。状態の判定に抜けがない', async () => {
  const p = await import('./plate.ts');
  assert.ok(Math.abs(p.plateWinter(1.4) - 0.602) < 1e-3);
  assert.equal(p.plateWinter(0.5), 1);
  for (let r = 0.75; r < 3; r += 0.05) {
    assert.ok(p.plateWinter(r) > p.plateStrength(r), `R=${r}`);
    assert.ok(p.plateWinter(r) <= 1);
    // R が 1.22 より大きい薄い板では、波打った後の余力で理論値(弾性座屈)を上回る
    if (r > 1.25) assert.ok(p.plateWinter(r) > p.plateTheory(r), `R=${r}`);
  }
  // R = 1.85(実験室の初期値): 設計 15%、理論 29%、有効幅 48%
  assert.equal(p.plateState(0.1, 1.85), 'ok');
  assert.equal(p.plateState(0.2, 1.85), 'overDesign');
  assert.equal(p.plateState(0.35, 1.85), 'buckled');
  assert.equal(p.plateState(0.6, 1.85), 'ultimate');
  assert.equal(p.plateState(0.9, 0.5), 'ok');
  assert.equal(p.plateState(1.0, 0.5), 'ultimate');
});

test('複合座屈(映像用の無次元の形): check.ts と同じ式で、限界の線・安全率がつじつまが合う', async () => {
  const b = await import('./beamcolumn.ts');
  const c = await import('./check.ts');
  // α = 1 − σc/(0.8σe): 軸力が 0.8σe の半分なら 0.5
  assert.ok(Math.abs(b.alpha(0.4, 1) - 0.5) < 1e-12);
  // 限界の線の上では U = 1
  for (const n of [0.05, 0.2, 0.35]) assert.ok(Math.abs(b.usage(n, b.momentLimit(n, 0.5, 1.2), 0.5, 1.2) - 1) < 1e-9);
  // 荷重を同じ割合で増やす倍率を掛けると U = 1
  for (const [n, m, pu, pe] of [
    [0.25, 0.25, 0.673, 1.5625],
    [0.1, 0.6, 0.4, 0.5],
    [0.02, 0.3, 0.9, 6],
  ]) {
    const g = b.loadFactor(n, m, pu, pe);
    assert.ok(Math.abs(b.usage(g * n, g * m, pu, pe) - 1) < 1e-9, `γ=${g}`);
    // U < 1 のとき(余裕がある)は 1/U より小さく、U > 1 のときは 1/U より大きい(どちらも 1 に近い側)
    const sf = b.safety(n, m, pu, pe);
    assert.ok(sf >= 1 ? g <= sf + 1e-9 && g >= 1 : g >= sf - 1e-9 && g <= 1, `g=${g} 1/U=${sf}`);
  }
  // 曲げがなければ、安全率 = 許容値 ÷ 発生応力
  assert.ok(Math.abs(b.safety(0.2, 0, 0.336, 1.5625) - 0.336 / 0.2) < 1e-9);
  // check.ts の式(1方向の曲げ)と同じ値になる
  const sy = 235;
  const E = 200000;
  const i = { sy, E, nu: 0.3, b: 100, t: 12, k: 0.43, slenderY: 10, slenderZ: 70, sc: 40, sbcy: 0, sbcz: 30, sbgy: sy };
  const r = c.check(i);
  const U = b.usage(i.sc / sy, i.sbcz / sy, r.scz / sy, r.sez / sy);
  assert.ok(Math.abs(U - r.U) < 1e-9, `${U} ${r.U}`);
  // 2方向の曲げ: check.ts と同じ値になり、倍率を掛けると U = 1
  const i2 = { ...i, slenderY: 45, sbcy: 25, sbgy: 180 };
  const r2 = c.check(i2);
  const args = [i2.sc / sy, i2.sbcy / i2.sbgy, i2.sbcz / sy, r2.scz / sy, r2.sey / sy, r2.sez / sy] as const;
  assert.ok(Math.abs(b.usage2(...args) - r2.U) < 1e-9, `${b.usage2(...args)} ${r2.U}`);
  const g2 = b.loadFactor2(...args);
  assert.ok(Math.abs(b.usage2(g2 * args[0], g2 * args[1], g2 * args[2], args[3], args[4], args[5]) - 1) < 1e-9);
});

test('許容応力度の形の照査: 式どうしのつながりと、手計算との照合', async () => {
  const c = await import('./check.ts');
  // R の式の係数: k = 0.43、ν = 0.3、E = 2.06×10⁵、σy = 205 で √{12(1−ν²)σy/(kπ²E)} ≒ 0.0506
  assert.ok(Math.abs(c.paramR(1, 1, 0.43, 206000, 205) - 0.0506) < 1e-4);
  // R = 1 になる幅厚比: 自由突出板 約 19.8、両縁支持板 約 60
  assert.ok(Math.abs(1 / c.paramR(1, 1, 0.43, 206000, 205) - 19.8) < 0.1);
  assert.ok(Math.abs(1 / c.paramR(1, 1, 4, 206000, 205) - 60.3) < 0.2);
  // λ の式の係数: √(σy/E)/π ≒ 0.01004
  assert.ok(Math.abs(c.paramLambda(1, 206000, 205) - 0.01004) < 1e-5);
  // R > 0.7 では σcl = 0.5·σel(σy が打ち消し合う)
  const R = 1.5;
  assert.ok(Math.abs(205 * c.localRatio(R) - 0.5 * (205 / (R * R))) < 1e-9);
  assert.ok(Math.abs(c.localRatio(1.5) - 0.2222) < 1e-4);
  // 区分式の境目
  assert.ok(Math.abs(c.globalRatio(0.2) - 1) < 1e-9);
  assert.ok(Math.abs(c.globalRatio(1) - 1 / 1.773) < 1e-3);
  assert.ok(Math.abs(c.globalRatio(0.889) - 0.6245) < 1e-3);
  // 説明用の仮定値: σy 250、σcg 200、σcl 150 → σcz = 200 × 150/250 = 120
  const sy = 250;
  const E = 200000;
  const slender = (((1.109 - 0.8) / 0.545) * Math.PI) / Math.sqrt(sy / E); // σcg/σy = 0.8 になる細長比
  const t = 10;
  const b = t / c.paramR(1, 1, 0.43, E, sy) * Math.sqrt(0.5 / 0.6); // σcl/σy = 0.6 になる幅
  const r = c.check({ sy, E, nu: 0.3, b, t, k: 0.43, slenderY: 20, slenderZ: slender, sc: 60, sbcy: 30, sbcz: 20, sbgy: 200 });
  assert.ok(Math.abs(r.scg - 200) < 1e-6 && Math.abs(r.scl - 150) < 1e-6 && Math.abs(r.scz - 120) < 1e-6);
  assert.ok(Math.abs(r.sfGlobal - 2) < 1e-9);
  // 使用割合: 各項の和、α = 1 − σc/(0.8σe)、安全率 = 1/U
  assert.ok(Math.abs(r.alphaZ - (1 - 60 / (0.8 * r.sez))) < 1e-12);
  assert.ok(Math.abs(r.U - (60 / 120 + 30 / (200 * r.alphaY) + 20 / (250 * r.alphaZ))) < 1e-12);
  assert.ok(Math.abs(r.sfCombined * r.U - 1) < 1e-12);
  // σc が 0.8σe 以上なら適用範囲外
  const bad = c.check({ sy, E, nu: 0.3, b, t, k: 0.43, slenderY: 20, slenderZ: 200, sc: 60, sbcy: 30, sbcz: 20, sbgy: 200 });
  assert.equal(bad.valid, false);
});

test('理論から設計式へ: ペリー・ロバートソンの式と、各国の式・数値例の照合', async () => {
  const t = await import('./theory.ts');
  const c = await import('./curves.ts');
  // 解は「縁の応力 = 降伏」を満たす
  for (const [lam, eta] of [
    [0.5, 0.1],
    [1, 0.3],
    [1.6, 0.2],
  ]) {
    const s = t.perry(lam, eta);
    const p = t.edgeParts(s, lam, eta);
    assert.ok(Math.abs(p.axial + p.bend + p.extra - 1) < 1e-9, `λ=${lam}`);
  }
  // Eurocode 3 の式は、η = α(λ − 0.2) としたペリー・ロバートソンの式そのもの
  for (let lam = 0.25; lam < 2.5; lam += 0.05) {
    for (const a of [0.21, 0.34, 0.49]) assert.ok(Math.abs(c.eurocode(lam, a) - t.perry(lam, a * (lam - 0.2))) < 1e-12);
  }
  // 不整なしなら理想の線(λ ≦ 1 で 1、λ > 1 で 1/λ²)
  for (const lam of [0.5, 0.99, 1.5, 2]) assert.ok(Math.abs(t.perry(lam, 0) - t.idealColumn(lam)) < 1e-9);
  // 理想との差は λ = 1 付近で最大(η = 0.3 で λ = 0.95〜1.05 の範囲に最大)
  let best = 0;
  let at = 0;
  for (let lam = 0.2; lam < 2.5; lam += 0.01) {
    const d = t.idealColumn(lam) - t.perry(lam, 0.3);
    if (d > best) {
      best = d;
      at = lam;
    }
  }
  assert.ok(at > 0.9 && at < 1.1, `最大の差の位置 λ=${at}`);
  // 道示の曲線は λ → 大で 1/λ² に近づく(λ = 5 で比 0.97 以上)
  assert.ok(c.dohshiOld(5) / t.idealColumn(5) > 0.97);
  // 縁降伏の相関: 曲げだけなら 1。初期たわみがあると、曲げ 0 の端点はペリー・ロバートソンの式になる
  assert.equal(t.edgeYieldMoment(0, 2), 1);
  assert.equal(t.edgeYieldMoment(1, 2), 0);
  for (const [lam, eta] of [[0.8, 0.15], [1.2, 0.3]]) {
    const s = t.perry(lam, eta);
    assert.ok(t.edgeYieldMoment(s, 1 / (lam * lam), eta) < 1e-9 && t.edgeYieldMoment(s - 0.01, 1 / (lam * lam), eta) > 0);
  }
});
