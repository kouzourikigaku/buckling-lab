import { useEffect, useMemo, useRef, useState } from 'react';
import { solveColumn, viewAtLoad, dohshiOld } from '../physics/column.ts';
import type { ColumnPath } from '../physics/column.ts';
import { Stage3D, DEFL_AMP } from '../three/stage.ts';
import type { CameraPose } from '../three/stage.ts';
import { Section3D } from '../three/section.ts';
import { FitTex, Tex } from '../ui/Tex.tsx';
import { ClipBar, ClipLabel, SceneDots, ViewControls, isPaused, setPaused, updateClip } from '../ui/Story.tsx';
import { Rich, Term } from '../ui/glossary.tsx';

const E_OVER_FY = 200000 / 355; // E = 2.0×10^5 N/mm²、σy = 355 N/mm²(SM490Y 相当)
const IMP_CHOICES = [0, 5000, 2000, 1000, 500, 250]; // 初期たわみ L/n(0 は無し)
const DEFAULTS = { lambda: 0.9, resid: 0.3, impIdx: 3 };

const pct = (x: number) => `${Math.round(x * 100)}%`;

interface Ctx {
  ideal: ColumnPath;
  real: ColumnPath;
  loadMax: number;
}

interface SceneDef {
  kicker: string;
  head: (c: Ctx) => string;
  body: (c: Ctx) => string;
  /** 応力の色で見るか */
  stress: boolean;
  /** この場面で押す力(P/Py)の行き先 */
  target: (c: Ctx) => number;
  /** 押す速さ(P/Py 毎秒) */
  speed: number;
  pose: CameraPose;
  /** 断面の表示を出すか */
  section: boolean;
  /** バネの束で説明する場面 */
  explain?: 'spring' | 'weld' | 'lever' | 'domino';
  /** 右上の断面の応力図に出す柱(既定は現実の柱) */
  sec?: SecMode;
  /** 行き先まで押し終えて一言説明したあと、このカメラへ寄る */
  zoomTo?: CameraPose;
}
type SecMode = 'ideal' | 'real' | 'both';

const SCENES: SceneDef[] = [
  {
    kicker: '実験',
    head: () => '同じ2本の柱を、同じ力で押す',
    body: () =>
      '長さも太さも同じ H形鋼。左は傷ひとつない「理想の柱」、右は溶接して作った「現実の柱」。先に耐えられなくなるのは、どちらでしょう。',
    stress: false,
    target: () => 0,
    speed: 0.2,
    pose: { az: 24, el: 9, focus: 'both' },
    section: false,
  },
  {
    kicker: 'そもそも',
    head: () => '鋼の中は、バネの束だと思えばいい',
    body: () =>
      '鋼も、押せばわずかに縮んで押し返し、引けばわずかに伸びて引き戻します。この中の力が応力。押し返すのが圧縮(青)、引き戻すのが引張(オレンジ)。限界に達すると降伏(赤)です。',
    stress: false,
    target: () => 0,
    speed: 0.2,
    pose: { az: 24, el: 9, focus: 'both' },
    section: false,
    explain: 'spring',
  },
  {
    kicker: '溶接',
    head: () => '溶接が、柱の中に力を閉じ込める',
    body: () =>
      '溶接部は、冷えると縮もうとします。でもまわりとつながっているので縮めず、引っ張られたまま(引張)。そのぶん、離れた先端は押し縮められます(圧縮)。外から押していないので、2つは打ち消し合います。(バネの絵は模式図)',
    stress: false,
    target: () => 0,
    speed: 0.2,
    pose: { az: 24, el: 9, focus: 'both' },
    section: false,
    explain: 'weld',
  },
  {
    kicker: '透視',
    head: () => '現実の柱には、押す前から力が潜んでいる',
    body: () =>
      '応力が見える目に切り替えました。右の柱は、押す前から色がついています。溶接部がオレンジの引張、先端が青の圧縮。これが残留応力です。右上は、断面の場所ごとの応力です。',
    stress: true,
    target: () => 0,
    speed: 0.2,
    pose: { az: 32, el: 10, focus: 'real' },
    section: true,
    sec: 'both',
  },
  {
    kicker: '載荷',
    head: (c) => `降伏の ${pct(c.real.Pfy * 0.85)} まで押す`,
    body: () =>
      '理想の柱は、断面のどこも同じだけ押されています(右上の左)。現実の柱は、先端だけ残留応力が上乗せされ、もう降伏のすぐ手前です(右上の右)。柱の中ほどの矢印は、曲げる力(橙)と、それと釣り合う戻す力(青)。濃い青の点線の輪が、柱が持つ本来の戻す力(上限)です。',
    stress: true,
    target: (c) => c.real.Pfy * 0.85,
    speed: 0.12,
    pose: { az: 20, el: 8, focus: 'both' },
    section: true,
    sec: 'both',
  },
  {
    kicker: '異変',
    head: (c) => `まだ ${pct(c.real.Pfy)}。なのに、先端が降伏した`,
    body: () =>
      'さらに押していくと、平均ではまだ余裕があるのに、現実の柱の先端が降伏して赤くなりました。ここから塑性化が始まります。輪切りにしてのぞくと、赤い部分はもう押し返せません。降伏が広がると、やがて戻す力の上限が削られ始めます。',
    stress: true,
    target: (c) => c.real.Pfy + 0.012,
    speed: 0.03,
    // 載荷と同じアングルで押していき、降伏が始まった所で一言説明してから、輪切りへ寄る
    pose: { az: 20, el: 8, focus: 'both' },
    zoomTo: { az: 40, el: 38, focus: 'realMid' },
    section: true,
  },
  {
    kicker: 'なぜ痛い',
    head: () => '踏ん張りは、端のバネほどよく効く',
    body: () =>
      '曲げへの踏ん張りは、端のバネほどよく効きます(映像1 のテコ)。先に降伏するのが端というのは、最悪の順番。7本のうち端の1本を失うだけで、踏ん張りは約4割減ります。(バネの絵は模式図)',
    stress: false,
    target: (c) => c.real.Pfy + 0.012,
    speed: 0.05,
    pose: { az: 24, el: 9, focus: 'both' },
    section: false,
    explain: 'lever',
  },
  {
    kicker: '連鎖',
    head: () => '赤が広がる。踏ん張りが落ちる。さらに曲がる',
    body: (c) =>
      `本物の柱に戻ります。曲げる力と戻す力(青)は、まだ釣り合っています。ところがその陰で、降伏した部分の分だけ、柱が持つ本来の戻す力(上限)が赤く削られ、管が短くなっていく。青が管の先に届いた所が限界、降伏の ${pct(c.real.Pu)} です。`,
    stress: true,
    target: (c) => c.real.Pu - 0.002,
    speed: 0.018,
    pose: { az: 30, el: 7, focus: 'real' },
    section: true,
  },
  {
    kicker: '座屈',
    head: (c) => `現実の柱が座屈した。理想の柱の ${pct(c.real.Pu / c.ideal.Pu)}`,
    body: () =>
      '戻す力が、削られた上限に届きました。もうこれ以上は戻せず、曲げる力(橙)が勝って一気に曲がります。管はさらに削られていく。理想の柱は降伏していないので、管は削られず、まだまっすぐです。',
    stress: true,
    target: (c) => c.real.Pu + 0.08,
    speed: 0.03,
    pose: { az: 16, el: 9, focus: 'both' },
    section: true,
  },
  {
    kicker: '理論値',
    head: (c) => `理想の柱は ${pct(c.ideal.Pu)} まで耐えた`,
    body: (c) =>
      `右上は理想の柱の断面。残留応力がないので全体が均一に押され、先に降伏する所がありません。だから管が削られず、戻す力が本来の上限(100%。この長さではオイラーの ${pct(c.ideal.Pe)} より降伏が低い)に届いた瞬間に座屈しました。現実の柱は、管が削られた分だけ早く、理想の ${pct(
        c.real.Pu / c.ideal.Pu,
      )}。設計の線が理論より下にあるのは、この差のためです。`,
    stress: true,
    target: (c) => c.loadMax,
    speed: 0.06,
    pose: { az: 24, el: 9, focus: 'both' },
    section: true,
    sec: 'ideal',
  },
];
const LAB = SCENES.length; // 最後は実験室

export default function Stage3() {
  const [scene, setScene] = useState(0);
  const [params, setParams] = useState(DEFAULTS);
  const [stressOn, setStressOn] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [secMode, setSecMode] = useState<SecMode>('real');
  const focusReal = secMode !== 'ideal';
  const [hud, setHud] = useState({ s: 0, ie: 1, limit: 1, yf: 0, pR: 0, pI: 0, cR: false, cI: false });

  const isLab = scene === LAB;
  const ideal = useMemo(
    () => solveColumn({ lambda: params.lambda, resid: 0, imp: 0, eOverFy: E_OVER_FY }),
    [params.lambda],
  );
  const real = useMemo(() => {
    const n = IMP_CHOICES[params.impIdx];
    return solveColumn({ lambda: params.lambda, resid: params.resid, imp: n ? 1 / n : 0, eOverFy: E_OVER_FY });
  }, [params]);
  const loadMax = Math.ceil((ideal.Pu + 0.1) * 100) / 100;
  const ctx: Ctx = useMemo(() => ({ ideal, real, loadMax }), [ideal, real, loadMax]);

  const mainRef = useRef<HTMLCanvasElement>(null);
  const secRef = useRef<HTMLCanvasElement>(null);
  const secRef2 = useRef<HTMLCanvasElement>(null);
  const labelRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const capRef = useRef<HTMLParagraphElement>(null);
  const stageRef = useRef<Stage3D | null>(null);
  // 毎フレーム読む値(React の再描画を待たずに使う)
  const live = useRef({
    load: 0,
    from: 0,
    target: 0,
    speed: 0.1,
    mix: 0,
    mixTarget: 0,
    ctx,
    auto: true,
    playing,
    slow,
    secMode,
    // 押し終えてから寄る場面の進み具合(t: 押し終えてからの秒、after: 寄ってからの秒)
    zoom: null as null | { to: CameraPose; t: number; done: boolean; after: number },
    pose: null as null | CameraPose,
  });
  live.current.ctx = ctx;
  live.current.playing = playing;
  live.current.slow = slow;
  live.current.secMode = secMode;

  // 場面が変わったら、行き先・カメラ・見え方を切り替える
  useEffect(() => {
    const L = live.current;
    if (isLab) {
      L.auto = false;
      L.mixTarget = stressOn ? 1 : 0;
      stageRef.current?.setExplain(null);
      stageRef.current?.setPose({ az: 24, el: 9, focus: 'both' });
    } else {
      const sc = SCENES[scene];
      L.auto = true;
      L.from = L.load;
      L.target = sc.target(ctx);
      L.speed = sc.speed;
      L.mixTarget = sc.stress ? 1 : 0;
      L.zoom = sc.zoomTo ? { to: sc.zoomTo, t: 0, done: false, after: 0 } : null;
      L.pose = sc.pose;
      stageRef.current?.setPose(sc.pose);
      stageRef.current?.setExplain(sc.explain ?? null);
    }
  }, [scene, isLab, ctx, stressOn]);

  useEffect(() => {
    stageRef.current?.setPaths([ideal, real]);
  }, [ideal, real]);

  // 3D の用意と、毎フレームの更新
  useEffect(() => {
    const stage = new Stage3D(mainRef.current!);
    const section = new Section3D(secRef.current!);
    const section2 = new Section3D(secRef2.current!);
    stageRef.current = stage;
    stage.setPaths([live.current.ctx.ideal, live.current.ctx.real]);
    stage.setPose(SCENES[0].pose);
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let lastHud = '';
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // 隠れているあいだ(「式と Q&A」を開いている間)は描かない
      if (!mainRef.current?.clientWidth) {
        raf = requestAnimationFrame(tick);
        return;
      }
      t += dt;
      const L = live.current;
      const c = L.ctx;
      const paused = isPaused();
      if (L.auto && paused) {
        // 一時停止中は押す力を動かさない
      } else if (L.auto) {
        const d = L.target - L.load;
        const stepMax = dt * (d < 0 ? 0.6 : L.speed);
        L.load += Math.max(-stepMax, Math.min(stepMax, d));
      } else if (L.playing) {
        L.load = Math.min(c.loadMax, L.load + dt * (L.slow ? 0.012 : 0.08));
      }
      L.load = Math.max(0, Math.min(c.loadMax, L.load));
      L.mix += (L.mixTarget - L.mix) * (1 - Math.exp(-dt * 3));
      const vI = viewAtLoad(c.ideal, L.load);
      const vR = viewAtLoad(c.real, L.load);
      // 押し終えてから寄る場面: 降伏が始まった所で一言 → 少し置いて輪切りへ寄る
      const Z = L.zoom;
      let note = '';
      if (L.auto && Z) {
        const arrived = Math.abs(L.target - L.load) < 0.002;
        if (!Z.done) {
          if (arrived && !paused) Z.t += dt;
          note = arrived ? '現実の柱の先端が降伏した(赤)。ここから塑性化が始まる' : 'さらに押していく。現実の柱の縁に注目';
          if (Z.t > 3.2) {
            Z.done = true;
            stage.setPose(Z.to, false);
          }
        } else {
          if (!paused) Z.after += dt;
          if (Z.after < 3.5) note = '輪切りにして、中をのぞく';
        }
      }
      stage.note = note;
      stage.update([c.ideal, c.real], [vI, vR], L.mix, t, dt, paused);
      const real = L.secMode !== 'ideal';
      const fp = real ? c.real : c.ideal;
      const fv = real ? vR : vI;
      // 両方を出すときは、左に理想・右に現実
      if (L.secMode === 'both') {
        section.update(c.ideal, vI.step, t);
        section2.update(c.real, vR.step, t);
      } else section.update(fp, fv.step, t);
      labelRefs.forEach((r, i) => {
        const p = stage.labelPos(i);
        const el = r.current;
        if (!el) return;
        el.style.opacity = p ? '1' : '0';
        if (p) el.style.transform = `translate(-50%, 0) translate(${p.x}px, ${p.y}px)`;
      });
      if (capRef.current && capRef.current.textContent !== stage.caption) {
        capRef.current.textContent = stage.caption;
        capRef.current.style.opacity = stage.caption ? '1' : '0';
      }
      const h = {
        s: L.load,
        ie: fv.step.ieRatio,
        limit: Math.min(1, fp.Pe * fv.step.ieRatio),
        yf: fv.step.yieldFrac,
        pR: vR.step.P,
        pI: vI.step.P,
        cR: vR.collapsed,
        cI: vI.collapsed,
      };
      const key = `${h.s.toFixed(3)}|${h.ie.toFixed(3)}|${h.pR.toFixed(3)}|${h.pI.toFixed(3)}|${h.cR}|${h.cI}|${L.secMode}`;
      if (key !== lastHud) {
        lastHud = key;
        setHud(h);
      }
      if (!L.auto && L.playing && L.load >= c.loadMax) setPlaying(false);
      // 場面の動きの進み具合: 説明用の場面はくり返しの周期、試験機は荷重が行き先に着くまで
      const ex = stage.explainClip();
      let clip: { p: number; done: boolean; loop: boolean } | null = null;
      if (ex) clip = ex;
      else if (L.auto) {
        const span = Math.abs(L.target - L.from);
        const left = Math.abs(L.target - L.load);
        clip = span < 0.003 ? { p: 1, done: true, loop: false } : { p: Math.min(1, 1 - left / span), done: left < 0.003, loop: false };
        // 寄る場面は、寄り終えるまで見終わりにしない
        if (Z && !Z.done) clip = { p: Math.min(0.95, clip.p * 0.8 + (Z.t / 3.2) * 0.15), done: false, loop: false };
      }
      updateClip(mainRef.current?.closest('[data-shell]') ?? null, clip);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // 上端のバーのつまみで再生位置を移す: 説明用の場面は時計、試験機の場面は押す力の位置
    const onSeek = (e: Event) => {
      const p = (e as CustomEvent<number>).detail;
      const L = live.current;
      if (stage.explainClip()) {
        stage.seekExplain(p);
        return;
      }
      if (!L.auto) return;
      L.load = L.from + p * (L.target - L.from);
      // 寄る場面を手前に戻したら、寄る前のアングルからやり直す
      if (L.zoom && p < 0.995) {
        if (L.zoom.done && L.pose) stage.setPose(L.pose, false);
        L.zoom = { ...L.zoom, t: 0, done: false, after: 0 };
      }
    };
    window.addEventListener('seek-scene', onSeek);
    return () => {
      window.removeEventListener('seek-scene', onSeek);
      cancelAnimationFrame(raf);
      stage.dispose();
      section.dispose();
      section2.dispose();
      stageRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 場面の札を押したら、その場面を最初から
  const replay = () => {
    const L = live.current;
    if (stageRef.current?.explainClip()) stageRef.current.replayExplain();
    else if (L.auto) {
      L.load = Math.max(0, L.from);
      if (L.zoom) {
        L.zoom = { ...L.zoom, t: 0, done: false, after: 0 };
        if (!isLab) stageRef.current?.setPose(SCENES[scene].pose);
      }
    }
  };
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('scene-change', { detail: { scene, total: LAB + 1 } }));
  }, [scene]);

  const go = (n: number) => {
    const next = Math.max(0, Math.min(LAB, n));
    if (next < LAB && params !== DEFAULTS) setParams(DEFAULTS);
    if (next === 0) live.current.load = 0;
    setPlaying(false);
    setSecMode(next < LAB ? SCENES[next].sec ?? 'real' : 'real');
    setPaused(false);
    setScene(next);
  };
  const setLoad = (v: number) => {
    setPlaying(false);
    live.current.load = v;
  };
  const changeParam = (p: Partial<typeof DEFAULTS>) => {
    setParams((old) => ({ ...old, ...p }));
    setLoad(0);
  };

  const sc = isLab ? null : SCENES[scene];
  const showSection = isLab || sc!.section;

  const head = sc ? sc.head(ctx) : '条件を変えて、自分で押してみる';
  const body = sc
    ? sc.body(ctx)
    : '柱の細長さ、残留応力、初期たわみを変えると、座屈のしかたと限界が変わります。理想と現実の差は、細長さが 1 のあたりでいちばん大きく、ずっと短い柱でも、ずっと長い柱でも小さくなります。';
  const kicker = sc ? sc.kicker : '実験室';

  return (
    <div className="mt-1 pb-20 lg:pb-0" data-shell>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-3">
        {/* 3D の舞台。見出しのテロップは映像に重ねる */}
        <div className="relative overflow-hidden rounded-2xl border border-studio-600 bg-studio-950">
          <canvas ref={mainRef} className="block h-[37dvh] min-h-[280px] w-full lg:h-[72dvh]" />
          <ClipBar />
          <ViewControls />
          <ColumnLabel refEl={labelRefs[0]} name="理想の柱" term="ideal" load={hud.pI} buckled={hud.cI} color="#16a34a" />
          <ColumnLabel refEl={labelRefs[1]} name="現実の柱" term="real" load={hud.pR} buckled={hud.cR} color="#1f2a44" />
          <p
            ref={capRef}
            className="pointer-events-none absolute inset-x-14 top-3 text-center text-base font-bold leading-snug text-ink drop-shadow-[0_2px_4px_rgba(255,255,255,0.95)] transition-opacity duration-300 sm:top-5 sm:text-2xl"
            style={{ opacity: 0 }}
          />
          <div
            key={scene}
            className="telop pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-studio-950 via-studio-950/85 to-transparent px-3 pb-2.5 pt-10 sm:px-5 sm:pb-4"
            aria-live="polite"
          >
            <p className="flex items-center justify-between gap-2 text-[11px] font-bold tracking-[0.25em] text-comp sm:text-xs">
              <span className="min-w-0 truncate">
                {String(scene + 1).padStart(2, '0')}
                <span className="opacity-60"> / {String(LAB + 1).padStart(2, '0')}</span> — {kicker}
              </span>
              <ClipLabel onReplay={replay} />
            </p>
            <p className="mt-0.5 border-l-4 border-comp pl-2.5 text-[19px] font-bold leading-snug drop-shadow-[0_2px_4px_rgba(255,255,255,0.95)] sm:text-3xl">
              {head}
            </p>
          </div>
        </div>

        {/* PC では映像と同じ高さの欄にし、進行のボタンをその下端に固定する */}
        <div className="flex min-w-0 flex-col gap-2 lg:h-[72dvh] lg:gap-3 lg:overflow-y-auto lg:pr-1">
          {/* 語り */}
          <p key={`b${scene}`} className="telop rounded-xl bg-studio-800/70 px-3 py-2 text-[14px] leading-relaxed text-ink sm:px-4 sm:py-3 sm:text-base lg:order-2">
            <Rich text={body} />
          </p>

          {/* 断面 */}
          <div
            className={`relative shrink-0 overflow-hidden rounded-2xl border border-studio-600 bg-studio-950 transition-opacity duration-700 lg:order-1 ${
              showSection ? 'opacity-100' : 'opacity-30'
            }`}
          >
            {/* 断面の応力図。両方を出すときは左に理想・右に現実 */}
            <div className={`grid ${secMode === 'both' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="relative">
                <canvas ref={secRef} className="block h-[21dvh] min-h-[170px] w-full lg:h-[36dvh]" />
                {secMode === 'both' && <p className="pointer-events-none absolute bottom-1 left-2 text-xs font-bold" style={{ color: '#16a34a' }}>理想の柱</p>}
              </div>
              <div className={`relative border-l border-studio-700 ${secMode === 'both' ? '' : 'hidden'}`}>
                <canvas ref={secRef2} className="block h-[21dvh] min-h-[170px] w-full lg:h-[36dvh]" />
                <p className="pointer-events-none absolute bottom-1 left-2 text-xs font-bold">現実の柱</p>
              </div>
            </div>
            <div className="pointer-events-none absolute left-3 top-2">
              <p className="text-[11px] font-bold tracking-wider text-ink-dim">
                <Term id="section">柱の中央を輪切り(図の見方)</Term>
              </p>
              <p className="text-sm font-bold">{secMode === 'both' ? '2本' : secMode === 'real' ? '現実の柱' : '理想の柱'}の断面の応力</p>
            </div>
            <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
              <p className="pointer-events-none text-right text-xs font-bold text-yield">
                <Term id="yield">赤い天井 = 降伏</Term>
              </p>
              <div className="flex overflow-hidden rounded-lg border border-studio-600 text-xs font-bold" role="group" aria-label="断面図に出す柱">
                {(
                  [
                    ['ideal', '理想'],
                    ['real', '現実'],
                    ['both', '両方'],
                  ] as const
                ).map(([m, t]) => (
                  <button
                    key={m}
                    onClick={() => setSecMode(m)}
                    aria-pressed={secMode === m}
                    className={`px-2.5 py-1 ${secMode === m ? 'bg-comp text-white' : 'bg-studio-900/90 text-comp'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-studio-700 bg-studio-900/60 px-3 py-2">
              <Meter label="押す力" term="load" value={focusReal ? hud.pR : hud.pI} color="#0284c7" marker={hud.limit} />
              <Meter label="残っている踏ん張り" term="ie" value={hud.ie} color={hud.ie < 0.999 ? '#e11d48' : '#16a34a'} />
            </div>
          </div>

          {/* 柱の中ほどの力の見方(試験機の場面だけ) */}
          {sc && !sc.explain && scene >= 4 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-studio-700 px-3 py-2 text-xs lg:order-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#ea580c' }} />
                曲げる力
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#0284c7' }} />
                <Term id="exert">戻す力</Term>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm border border-sky-500 bg-sky-200/60" />
                <Term id="limit">いまの上限</Term>(管)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm border border-dashed border-rose-500 bg-rose-200/60" />
                削られた分・<Term id="capOrig">柱が持つ本来の戻す力(上限)</Term>(輪)
              </span>
              <span className="text-ink-dim">どれも曲がりに比例するので、曲がり1あたりの大きさで描いています</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-ink-dim lg:order-3">
            <Legend />
            <span>
              <Term id="amp">たわみは {DEFL_AMP} 倍に誇張</Term>・なぞると回転・2本指で移動と拡大縮小(PC は右ドラッグ・ホイール)
            </span>
          </div>

          {/* 進行(スマホでは画面の下に固定) */}
          <div className="fixed inset-x-0 bottom-0 z-20 mt-auto flex items-center gap-2 border-t border-studio-700 bg-studio-950/95 px-3 py-2 backdrop-blur lg:sticky lg:z-10 lg:border-t-0 lg:order-4 lg:mx-0 lg:px-0 lg:pt-2 lg:pb-0">
            <button
              onClick={() => go(scene - 1)}
              disabled={scene === 0}
              className="h-12 whitespace-nowrap rounded-xl border border-studio-600 px-4 text-sm font-bold text-ink-dim disabled:opacity-30"
            >
              ◀ 戻る
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <SceneDots total={LAB + 1} scene={scene} onScene={go} lab="実" />
              <span className="num text-[11px] font-bold leading-none text-ink-dim">
                {scene + 1} / {LAB + 1} ・ {Math.round(((scene + 1) / (LAB + 1)) * 100)}%
              </span>
            </div>
            {isLab ? (
              <button onClick={() => go(0)} className="h-12 whitespace-nowrap rounded-xl border border-studio-600 px-4 text-sm font-bold">
                最初から見る
              </button>
            ) : (
              <button
                data-next
                onClick={() => go(scene + 1)}
                className="h-12 whitespace-nowrap rounded-xl bg-comp px-6 text-base font-bold text-studio-950"
              >
                {scene === LAB - 1 ? '実験室へ ▶' : '次へ ▶'}
              </button>
            )}
          </div>
        </div>
      </div>

      {isLab && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="rounded-2xl border border-studio-600 bg-studio-900 p-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (hud.s >= loadMax - 1e-6) live.current.load = 0;
                    setPlaying((p) => !p);
                  }}
                  className="h-11 min-w-20 whitespace-nowrap rounded-lg bg-comp px-3 text-base font-bold text-studio-950"
                >
                  {playing ? '一時停止' : hud.s >= loadMax - 1e-6 ? 'もう一度' : '押す ▶'}
                </button>
                <ToggleBtn on={slow} onClick={() => setSlow((v) => !v)} label="スロー" />
                <button onClick={() => setLoad(Math.max(0, live.current.load - 0.005))} className="h-11 w-11 rounded-lg border border-studio-600 text-lg" aria-label="1コマ戻す">
                  ◀
                </button>
                <button onClick={() => setLoad(Math.min(loadMax, live.current.load + 0.005))} className="h-11 w-11 rounded-lg border border-studio-600 text-lg" aria-label="1コマ進める">
                  ▶
                </button>
                <span className="ml-auto" />
                <ToggleBtn on={stressOn} onClick={() => setStressOn((v) => !v)} label="応力の色" />
              </div>
              <label className="mt-2 block">
                <span className="flex items-baseline justify-between text-sm text-ink-dim">
                  <span>押す力(降伏荷重に対する割合)</span>
                  <span className="num text-xl font-bold text-ink">{pct(hud.s)}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={loadMax}
                  step={0.001}
                  value={Math.min(hud.s, loadMax)}
                  onChange={(e) => setLoad(Number(e.target.value))}
                  style={{ ['--thumb' as string]: '#0284c7' }}
                  aria-label="押す力"
                />
              </label>
            </div>
            <LoadGraph ideal={ideal} real={real} s={hud.s} />
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-studio-600 bg-studio-900 p-4">
              <h3 className="text-base font-bold">条件を変える</h3>
              <Slider
                label="細長比パラメータ"
                term="lambda"
                symbol="\bar{\lambda}"
                hint="「降伏」と「座屈」の勝負指標。1 より大きいと座屈が先。大きいほど細長い柱"
                value={params.lambda}
                min={0.2}
                max={2}
                step={0.05}
                show={params.lambda.toFixed(2)}
                color="#6d28d9"
                onChange={(v) => changeParam({ lambda: v })}
              />
              <Slider
                label="残留応力"
                term="resid"
                symbol="\sigma_{rc}"
                hint="溶接で閉じ込められた力。押す前から先端にかかっている圧縮"
                value={params.resid}
                min={0}
                max={0.4}
                step={0.05}
                show={`${pct(params.resid)} σy`}
                color="#e11d48"
                onChange={(v) => changeParam({ resid: v })}
              />
              <Slider
                label="初期たわみ"
                term="imp"
                symbol="v_0"
                hint="作ったときからある、わずかな曲がり"
                value={params.impIdx}
                min={0}
                max={IMP_CHOICES.length - 1}
                step={1}
                show={IMP_CHOICES[params.impIdx] ? `L/${IMP_CHOICES[params.impIdx]}` : 'なし'}
                color="#ea580c"
                onChange={(v) => changeParam({ impIdx: v })}
              />
              <p className="mt-2 text-xs text-ink-dim">
                柱の長さ <span className="num text-ink">{(real.Lmm / 1000).toFixed(1)} m</span>(断面 H-300×300×10×16)
              </p>
            </div>

            <div className="rounded-2xl border border-studio-600 bg-studio-900 p-4">
              <h3 className="text-base font-bold">この条件での限界</h3>
              <dl className="mt-2 space-y-2">
                <ResultRow label="理想の柱(理論値)" value={ideal.Pu} color="#16a34a" />
                <ResultRow label="現実の柱" value={real.Pu} color="#1f2a44" />
              </dl>
              <p className="mt-3 text-base">
                現実の柱は理論値の <strong className="num text-2xl text-gold">{pct(real.Pu / ideal.Pu)}</strong>
              </p>
              <p className="mt-2 text-sm text-ink-dim">
                参考: 道路橋示方書(平成24年版まで)の設計曲線は{' '}
                <span className="num text-ink">{pct(dohshiOld(params.lambda))}</span>
                。設計曲線は、多くの実験・解析の下側に引いた線です。
              </p>
            </div>

            <div className="rounded-2xl border border-studio-600 bg-studio-900 p-4">
              <h3 className="text-base font-bold">ドミノ倒しの式</h3>
              <FitTex block className="mt-2 text-lg">{String.raw`P_{cr} \approx \dfrac{\pi^2 E\, I_e}{L^2}`}</FitTex>
              <p className="text-sm text-ink-dim">
                降伏した(赤い)部分はもう踏ん張れない。残った健全な部分の <Tex>{'I_e'}</Tex>
                (断面の踏ん張りやすさ)だけで支えるので、赤が広がるほど限界が下がる。
              </p>
            </div>
          </div>
        </div>
      )}

      <details className="mt-4 px-1 text-xs leading-relaxed text-ink-dim">
        <summary className="cursor-pointer py-1 text-sm font-bold">計算の前提を見る</summary>
        両端ピンの溶接 H形鋼(H-300×300×10×16)が弱軸まわりに座屈する場合。断面を繊維に分け(フランジ 41 本、ウェブ 15 本)、
        完全弾塑性、E = 2.0×10⁵ N/mm²、σy = 355 N/mm²。残留応力は板ごとに直線分布(フランジ先端とウェブ中央が圧縮、溶接部が引張)。実際の溶接 H形鋼では、溶接部の引張は降伏点近くに達して狭い範囲に集中し、板の切り方によっては先端が引張になることもあります。ここでは仕組みを見やすくするため、大きさをそろえた直線分布に単純化しています。
        たわみは正弦波の形とし、柱の中央の断面で力のつり合いを解く。柱の色は、各断面でその位置の軸力と曲げにつり合う応力を解いた値。
        理想の柱は、残留応力なし・初期たわみ L/1,000,000。
      </details>
    </div>
  );
}

/* ---------- 3D の上に重ねる表示 ---------- */

function ColumnLabel(props: {
  refEl: React.RefObject<HTMLDivElement | null>;
  name: string;
  term: string;
  load: number;
  buckled: boolean;
  color: string;
}) {
  return (
    <div
      ref={props.refEl}
      className="pointer-events-none absolute left-0 top-0 whitespace-nowrap text-center transition-opacity duration-300"
      style={{ opacity: 0 }}
    >
      <p className="text-sm font-bold drop-shadow-[0_1px_3px_rgba(255,255,255,0.95)] sm:text-base" style={{ color: props.color }}>
        <Term id={props.term}>{props.name}</Term>
      </p>
      <p className="num text-xl font-bold leading-tight drop-shadow-[0_1px_3px_rgba(255,255,255,0.95)] sm:text-2xl">
        {pct(props.load)}
      </p>
      {props.buckled && (
        <span className="flash-yield mt-0.5 inline-block rounded bg-yield px-2 py-0.5 text-xs font-bold text-white">座屈</span>
      )}
    </div>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-tens">
        <Term id="tens">引張</Term>
      </span>
      <span
        className="h-2 w-24 rounded-full"
        style={{ background: 'linear-gradient(90deg,#ea580c,#fdba74 25%,#b9c3d2 50%,#60a5fa 75%,#1d4ed8 96%)' }}
      />
      <span className="text-comp">
        <Term id="comp">圧縮</Term>
      </span>
      <span className="ml-1 font-bold text-yield">
        ■ <Term id="yield">降伏</Term>
      </span>
    </span>
  );
}

function Meter(props: { label: string; term: string; value: number; color: string; marker?: number }) {
  const w = Math.max(0, Math.min(1, props.value)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-ink-dim">
        <span>
          <Term id={props.term}>{props.label}</Term>
          {props.marker !== undefined && (
            <span className="ml-1.5 text-gold">
              <Term id="limit">┃いまの限界</Term>
            </span>
          )}
        </span>
        <span className="num text-sm font-bold text-ink">{pct(props.value)}</span>
      </div>
      <div className="relative h-2 rounded-full bg-studio-700">
        <div className="h-2 rounded-full" style={{ width: `${w}%`, background: props.color }} />
        {props.marker !== undefined && (
          <div className="absolute -top-1 h-4 w-0.5 bg-gold" style={{ left: `${Math.max(0, Math.min(1, props.marker)) * 100}%` }} />
        )}
      </div>
    </div>
  );
}

function ToggleBtn(props: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={props.onClick}
      aria-pressed={props.on}
      className={`h-11 whitespace-nowrap rounded-lg border px-3 text-sm font-bold ${
        props.on ? 'border-gold bg-gold/15 text-gold' : 'border-studio-600 text-ink-dim'
      }`}
    >
      {props.label}
    </button>
  );
}

/* ---------- 実験室の部品 ---------- */

function useNarrow(): boolean {
  const q = '(max-width: 640px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

function LoadGraph(props: { ideal: ColumnPath; real: ColumnPath; s: number }) {
  const { ideal, real, s } = props;
  const narrow = useNarrow();
  const W = narrow ? 360 : 640;
  const Hh = narrow ? 240 : 250;
  const m = { l: 42, r: 8, t: 16, b: 36 };
  const xMax = 1 / 40;
  const yMax = Math.max(1.1, Math.min(1.3, ideal.Pu + 0.15));
  const X = (d: number) => m.l + (Math.min(d, xMax) / xMax) * (W - m.l - m.r);
  const Y = (p: number) => Hh - m.b - (p / yMax) * (Hh - m.t - m.b);
  const line = (path: ColumnPath) => {
    const pts: string[] = [];
    for (const st of path.steps) {
      const d = (path.v0 + st.v) / path.L;
      if (d > xMax) break;
      pts.push(`${X(d).toFixed(1)},${Y(st.P).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  const dot = (path: ColumnPath, color: string) => {
    const st = viewAtLoad(path, s).step;
    return <circle cx={X((path.v0 + st.v) / path.L)} cy={Y(st.P)} r={6} fill={color} stroke="#ffffff" strokeWidth={2} />;
  };
  return (
    <div className="rounded-2xl border border-studio-600 bg-studio-900 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="text-base font-bold">押す力と、たわみ</h3>
        <p className="text-sm">
          <span style={{ color: '#16a34a' }}>● 理想の柱</span>
          <span className="ml-3" style={{ color: '#1f2a44' }}>
            ● 現実の柱
          </span>
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${Hh}`} className="mt-1 block w-full" role="img" aria-label="荷重とたわみの関係">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={m.l} y1={Y(t)} x2={W - m.r} y2={Y(t)} stroke="#d5dce8" strokeWidth={1} />
            <text x={m.l - 6} y={Y(t) + 4} fill="#64748b" fontSize={12} textAnchor="end" className="num">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        <line x1={m.l} y1={Y(1)} x2={W - m.r} y2={Y(1)} stroke="#e11d48" strokeWidth={1.2} strokeDasharray="6 4" />
        <text x={W - m.r - 4} y={Y(1) - 5} fill="#e11d48" fontSize={12} textAnchor="end">
          {narrow ? '降伏荷重 Py' : '降伏荷重 Py(全断面が降伏)'}
        </text>
        {ideal.Pe < yMax && Math.abs(ideal.Pe - 1) > 0.06 && (
          <>
            <line x1={m.l} y1={Y(ideal.Pe)} x2={W - m.r} y2={Y(ideal.Pe)} stroke="#6d28d9" strokeWidth={1.2} strokeDasharray="6 4" />
            <text x={W - m.r - 4} y={Y(ideal.Pe) - 5} fill="#6d28d9" fontSize={12} textAnchor="end">
              {narrow ? 'オイラー荷重 Pe' : 'オイラー荷重 Pe(弾性の理論値)'}
            </text>
          </>
        )}
        <polyline points={line(ideal)} fill="none" stroke="#16a34a" strokeWidth={2.2} opacity={0.9} />
        <polyline points={line(real)} fill="none" stroke="#1f2a44" strokeWidth={2.2} />
        {dot(ideal, '#16a34a')}
        {dot(real, '#1f2a44')}
        <text x={(W + m.l) / 2} y={Hh - 8} fill="#64748b" fontSize={12} textAnchor="middle">
          {narrow ? '中央のたわみ → 右端で L/40' : '中央のたわみ(柱の長さ L に対する割合)→ 右端で L/40'}
        </text>
      </svg>
    </div>
  );
}

function Slider(props: {
  label: string;
  term: string;
  symbol: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  show: string;
  color: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-3 block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold">
          <Term id={props.term}>{props.label}</Term> <Tex>{props.symbol}</Tex>
        </span>
        <span className="num text-lg font-bold" style={{ color: props.color }}>
          {props.show}
        </span>
      </span>
      <span className="block text-xs text-ink-dim">{props.hint}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        style={{ ['--thumb' as string]: props.color }}
      />
    </label>
  );
}

function ResultRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <dt className="text-sm" style={{ color }}>
          {label}
        </dt>
        <dd className="num text-lg font-bold">降伏荷重の {pct(value)}</dd>
      </div>
      <div className="mt-1 h-2 rounded-full bg-studio-700">
        <div className="h-2 rounded-full" style={{ width: `${Math.min(1, value) * 100}%`, background: color }} />
      </div>
    </div>
  );
}
