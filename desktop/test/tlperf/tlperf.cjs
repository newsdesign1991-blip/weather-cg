// 타임라인 성능 측정기 — 앱을 '보이는' Electron 창(포커스 안 뺏음)으로 띄우고 CDP 실제 마우스 입력으로
// 타임라인 열기·자동 구성·재생·스크럽·클립/키 끌기를 재현해 rAF 간격·긴 작업·LoAF·이벤트 처리 시간·앱 함수별 시간(·CPU 프로파일)을 모은다.
// 계측·진입점은 ../brushperf/instr.js · ../brushperf/perf-main.js 를 그대로 쓴다(앱 코드 무변경).
// 사용: node tlperf.cjs [--app=<앱 폴더>] [--out=<결과 폴더>] --map=sgg|sggBrush|warn|typhoon|typhoonLine|cmp [--res=1920x1080|2158x1214|1920x1080-vf]
//        [--cam=0|flat|tilt] [--reveal=dissolve|blinds] [--profile] [--only=시나리오,...] [--size=1920x1080] [--tag=이름] [--play=3000]
// 결과: <out>/<tag>.json (시나리오별 frames·events·longTasks·loaf·app 함수 시간)
const { spawn, execFileSync } = require('child_process');
const { rmTestProfile } = require('../test-profile.cjs');
const fs = require('fs');
const net = require('net');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); if (!a) return d; return a.includes('=') ? a.slice(k.length + 3) : true; };
const APP = path.resolve(opt('app', path.resolve(__dirname, '..', '..', '..')));
const DESK = path.resolve(__dirname, '..', '..');
const ELECTRON = path.join(DESK, 'node_modules', 'electron', 'dist', 'electron.exe');
const BP = path.join(__dirname, '..', 'brushperf');
const MAPK = opt('map', 'sgg'), RES = opt('res', '1920x1080'), CAM = opt('cam', '0'), REVEAL = opt('reveal', 'dissolve');
const SIZE = opt('size', '1920x1080'), PROFILE = !!opt('profile', false), ONLY = opt('only', ''), PLAY = +opt('play', 3000);
const TAG = opt('tag', `${MAPK}_${RES}_cam${CAM}_${REVEAL}`);
const OUT = path.resolve(opt('out', path.join(require('os').tmpdir(), 'wcg-tlperf'))); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const log = (...a) => console.error('[tlperf]', ...a);
async function waitUntil(t) { while (true) { const d = t - performance.now(); if (d <= 0) return; if (d > 3) await sleep(d - 2); else await new Promise((r) => setImmediate(r)); } }

(async () => {
  const port = await freePort();
  const proc = spawn(ELECTRON, [path.join(BP, 'perf-main.js'), `--remote-debugging-port=${port}`], {
    cwd: DESK, env: { ...process.env, WCG_MAIN: path.join(DESK, 'main.js'), WCG_APP_DIR: APP, WCG_TEST: '1', WCG_TEST_SIZE: SIZE }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false,
  });
  let mainLog = '';
  proc.stdout.on('data', (d) => { mainLog += d; }); proc.stderr.on('data', (d) => { mainLog += d; });
  const kill = () => { try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {} rmTestProfile(proc.pid); };
  process.on('exit', kill);
  let page = null;
  for (let i = 0; i < 80 && !page; i++) {
    await sleep(400);
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = list.find((p) => p.type === 'page' && p.url.startsWith('app://weathercg')); } catch (e) {}
  }
  if (!page) { log('no page', mainLog.slice(-800)); kill(); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const errors = []; const consoleErr = []; const listeners = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push('EXC ' + ((d.exception && d.exception.description) || d.text).slice(0, 400)); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErr.push(m.params.args.map((a) => (a.value !== undefined ? a.value : a.description)).join(' ').slice(0, 300));
    for (const l of listeners) l(m);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.error) throw new Error(JSON.stringify(r.error));
    if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  const waitLoad = () => new Promise((r) => { const f = (m) => { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(f), 1); r(); } }; listeners.push(f); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(BP, 'instr.js'), 'utf8') });
  { const w = waitLoad(); await send('Page.reload', { ignoreCache: false }); await w; await sleep(8000); }
  await evaluate(fs.readFileSync(path.join(BP, 'helpers.js'), 'utf8'));
  await evaluate(fs.readFileSync(path.join(__dirname, 'tl-helpers.js'), 'utf8'));
  await evaluate('__tl.closePopups()');
  const info = { tag: TAG, map: MAPK, res: RES, cam: CAM, reveal: REVEAL, size: SIZE, errors, consoleErr };
  info.wrapped = await evaluate('__tl.wrapped.length');
  // 작업 열기
  let workExpr;
  const camArg = CAM === '0' ? 'false' : JSON.stringify(CAM);
  if (MAPK === 'typhoon' || MAPK === 'typhoonLine') workExpr = `__tl.typhoonWork({ res: ${JSON.stringify(RES)}, cam: ${camArg}, line: ${MAPK === 'typhoonLine'} })`;
  else if (MAPK === 'cmp') workExpr = `__tl.compareWork({ res: ${JSON.stringify(RES)}, cam: ${camArg} })`;
  else if (MAPK === 'sggBrush') workExpr = `(() => { const g = __h.genStrokes(['경기', '강원'], 300, { runLen: 25, eraseEvery: 40 }); return __tl.normalWork({ res: ${JSON.stringify(RES)}, cam: ${camArg}, reveal: ${JSON.stringify(REVEAL)}, brush: g.strokes }); })()`;
  else workExpr = `__tl.normalWork({ style: ${JSON.stringify(MAPK === 'warn' ? 'warn' : 'sgg')}, res: ${JSON.stringify(RES)}, cam: ${camArg}, reveal: ${JSON.stringify(REVEAL)} })`;
  info.open = await evaluate(`(async () => __tl.openWork(${workExpr}))()`);
  await sleep(1200);
  info.workKB = await evaluate('Math.round(JSON.stringify(S).length / 1024)');
  if (opt('noshadow', false)) info.noshadow = await evaluate(`(() => { document.querySelectorAll('[filter]').forEach((n) => n.removeAttribute('filter')); return true; })()`);   // 실험: 모든 SVG 필터(그림자) 끔 — 재생 중 다시 붙는 것도 있음
  info.dom = await evaluate(`({ svgNodes: document.querySelectorAll('#cg *').length, zones: document.querySelectorAll('.zone').length, brushImgs: document.querySelectorAll('image.brushLayer').length, dpr: devicePixelRatio, win: [innerWidth, innerHeight] })`);
  log('open', JSON.stringify(info.open), 'KB', info.workKB, JSON.stringify(info.dom));

  // ---- 입력 ----
  const mouse = (type, x, y, o = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: o.button || (o.buttons ? 'left' : 'none'), buttons: o.buttons || 0, clickCount: o.clickCount || 0, modifiers: o.modifiers || 0 });
  const click = async (p, modifiers = 0) => { await mouse('mouseMoved', p.x, p.y, { modifiers }); await sleep(30); await mouse('mousePressed', p.x, p.y, { button: 'left', buttons: 1, clickCount: 1, modifiers }); await sleep(50); await mouse('mouseReleased', p.x, p.y, { button: 'left', buttons: 0, clickCount: 1, modifiers }); };
  const drag = async (a, b, ms, hz = 125, modifiers = 0) => {
    await mouse('mouseMoved', a.x, a.y, { modifiers }); await sleep(40);
    await mouse('mousePressed', a.x, a.y, { button: 'left', buttons: 1, clickCount: 1, modifiers });
    const n = Math.max(2, Math.round(ms / (1000 / hz))); const dt = 1000 / hz; let t = performance.now(); const ps = [];
    for (let i = 1; i <= n; i++) { t += dt; await waitUntil(t); const k = i / n; ps.push(mouse('mouseMoved', Math.round(a.x + (b.x - a.x) * k), Math.round(a.y + (b.y - a.y) * k), { button: 'left', buttons: 1, modifiers })); }
    await Promise.all(ps);
    await mouse('mouseReleased', b.x, b.y, { button: 'left', buttons: 0, clickCount: 1, modifiers });
  };
  const key = async (code, k, modifiers = 0, vk) => { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: k, modifiers, windowsVirtualKeyCode: vk }); await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, modifiers, windowsVirtualKeyCode: vk }); };
  const btn = (sel) => evaluate(`__tl.rect(${JSON.stringify(sel)})`);

  // ---- 프로파일 요약(brushperf와 같은 방식) ----
  const summarizeProfile = (prof) => {
    const nodes = new Map(prof.nodes.map((n) => [n.id, n])); const parent = new Map();
    for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const keyOf = (n) => { const cf = n.callFrame; const u = (cf.url || '').split('/').pop().split('?')[0]; return `${cf.functionName || '(anonymous)'}${u ? ' ' + u + ':' + (cf.lineNumber + 1) : ''}`; };
    const self = new Map(), total = new Map(); let all = 0;
    for (let i = 0; i < prof.samples.length; i++) {
      const dt = (prof.timeDeltas[i] || 0) / 1000; all += dt;
      let nid = prof.samples[i]; const k = keyOf(nodes.get(nid));
      self.set(k, (self.get(k) || 0) + dt);
      const seen = new Set();
      while (nid != null) { const kk = keyOf(nodes.get(nid)); if (!seen.has(kk)) { seen.add(kk); total.set(kk, (total.get(kk) || 0) + dt); } nid = parent.get(nid); }
    }
    const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, t]) => ({ fn: n, ms: Math.round(t * 10) / 10, pct: Math.round((t / all) * 1000) / 10 }));
    return { totalMs: Math.round(all), self: top(self, 22), total: top(total, 30).filter((x) => !/^\((root|program|idle)\)/.test(x.fn)) };
  };
  // ---- 트레이스(렌더 파이프라인: 페인트·래스터·GPU) — brushperf와 같은 방식 ----
  const TRACE = opt('trace', '');
  const traceEvents = [];
  function traceL(m) { if (m.method === 'Tracing.dataCollected') traceEvents.push(...m.params.value); }
  const startTrace = async () => {
    traceEvents.length = 0; listeners.push(traceL);
    await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,gpu,viz,toplevel,blink', options: 'sampling-frequency=10000', transferMode: 'ReportEvents' });
  };
  const stopTrace = async () => {
    const done = new Promise((r) => { const f = (m) => { if (m.method === 'Tracing.tracingComplete') { listeners.splice(listeners.indexOf(f), 1); r(); } }; listeners.push(f); });
    await send('Tracing.end'); await done; listeners.splice(listeners.indexOf(traceL), 1);
    const tn = new Map(); const pn = new Map();
    for (const e of traceEvents) { if (e.ph === 'M' && e.name === 'thread_name') tn.set(e.pid + ':' + e.tid, e.args.name); if (e.ph === 'M' && e.name === 'process_name') pn.set(e.pid, e.args.name); }
    const agg = new Map(); const open = new Map();
    const addA = (e, d) => { const th = (pn.get(e.pid) || e.pid) + '/' + (tn.get(e.pid + ':' + e.tid) || e.tid); const k = th + ' :: ' + e.name; const r = agg.get(k) || { n: 0, ms: 0, max: 0 }; r.n++; r.ms += d; r.max = Math.max(r.max, d); agg.set(k, r); };
    for (const e of traceEvents) {
      if (e.ph === 'X' && e.dur != null) addA(e, e.dur / 1000);
      else if (e.ph === 'B') { const k = e.pid + ':' + e.tid; (open.get(k) || open.set(k, []).get(k)).push(e); }
      else if (e.ph === 'E') { const st = open.get(e.pid + ':' + e.tid); const b = st && st.pop(); if (b) addA(b, (e.ts - b.ts) / 1000); }
    }
    const NAMES = /^(Paint|PaintImage|Layout|UpdateLayoutTree|PrePaint|Layerize|Commit|RasterTask|GPUTask|ImageDecodeTask|Decode Image|ScheduledAction|DrawFrame|HitTest|EventDispatch|FunctionCall|FireAnimationFrame|RunTask|ProxyMain::BeginMainFrame|BeginMainFrame|LayerTreeHostImpl::PrepareToDraw|Graphics.Pipeline|DisplayScheduler::DrawAndSwap|SkiaOutputSurfaceImplOnGpu::SwapBuffers|TileManager::AssignGpuMemoryToTiles|PaintArtifactCompositor::Update|LocalFrameView::RunPaintLifecyclePhase|V8.GC|MinorGC|MajorGC|.*Raster.*|.*Decode.*|.*Filter.*|.*Composit.*)$/;
    const rows = [...agg.entries()].filter(([k]) => NAMES.test(k.split(' :: ')[1])).sort((a, b) => b[1].ms - a[1].ms).slice(0, 40).map(([k, r]) => ({ ev: k, n: r.n, ms: Math.round(r.ms * 10) / 10, max: Math.round(r.max * 10) / 10 }));
    return { events: traceEvents.length, top: rows };
  };
  const results = [];
  const scen = async (name, fn) => {
    if (ONLY && !ONLY.split(',').includes(name)) return;
    const doTrace = TRACE && TRACE.split(',').includes(name);
    log(name, 'start');   // 멈춤(행) 진단용
    if (doTrace) await startTrace();
    if (PROFILE) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); }
    await evaluate(`__perf.begin(${JSON.stringify(name)}) && __tl.begin()`);
    const t0 = performance.now();
    let extra = null; try { extra = await fn(); } catch (e) { extra = { err: String(e && e.message || e) }; }
    const wall = performance.now() - t0;
    const r = await evaluate('__perf.end()');
    r.app = await evaluate('__tl.end()');
    r.wallMs = Math.round(wall); if (extra) r.extra = extra;
    r.after = await evaluate('__tl.state()');
    if (PROFILE) { const p = await send('Profiler.stop'); fs.writeFileSync(path.join(OUT, `${TAG}_${name}.cpuprofile`), JSON.stringify(p.result.profile)); r.profile = summarizeProfile(p.result.profile); }
    if (doTrace) r.trace = await stopTrace();
    results.push(r);
    log(name, 'frames', JSON.stringify(r.frames), 'lt', JSON.stringify(r.longTasks), 'app', JSON.stringify(r.app.slice(0, 4)));
    await sleep(500);
  };

  // 1) 타임라인 열기
  await scen('open', async () => { await click(await btn('#tlToggle')); await sleep(600); return evaluate('__tl.state()'); });
  if (!(await evaluate(`document.querySelector('#timeline').classList.contains('on')`))) await evaluate(`document.querySelector('#tlToggle').click()`);
  // 2) 자동 구성
  await scen('auto', async () => { await click(await btn('#tlAuto')); await sleep(600); await evaluate(`(() => { const x = document.querySelector('#tossOv [data-act="all"]'); if (x) x.click(); return 1; })()`); return evaluate(`({ tracks: anim().tracks.length, rows: document.querySelectorAll('#tlTracks > *').length, dur: anim().dur })`); });
  const NEWUI = await evaluate(`!!document.querySelector('#tlScroll')`);
  const pick = async (a, b, i = 0) => { if (NEWUI) { const r = await evaluate(`(() => { const e = document.querySelectorAll(${JSON.stringify(a)})[${i}]; if (e) e.scrollIntoView({ block: 'nearest' }); return 1; })()`); } return evaluate(`__tl.rect(${JSON.stringify(NEWUI ? a : b)}, ${i})`); };
  // --proto=app,imgLayers,svgGroups,cssCam,attrCam : 재생 방식 시제품 비교(측정 전용, proto-layers.js) 후 종료
  if (opt('proto', false)) {
    const out = [];
    const body = fs.readFileSync(path.join(__dirname, 'proto-layers.js'), 'utf8');
    for (const v of String(opt('proto')).split(',')) {
      const [variant, wc] = v.split(':');
      const doTrace = !!opt('prototrace', false);
      if (doTrace) await startTrace();
      await evaluate(`window.__proto = { variant: ${JSON.stringify(variant)}, ms: ${PLAY}, wc: ${wc === 'wc'} }; true`);
      let r; try { r = await evaluate(`(async () => { ${body}\n})()`); } catch (e) { r = { variant: v, err: String(e.message || e).slice(0, 400) }; }
      if (doTrace) { const tr = await stopTrace(); r.gpuRaster = (tr.top.find((x) => /CrGpuMain :: RendererRasterWorker/.test(x.ev)) || {}).ms; r.trace = tr.top.slice(0, 14); }
      out.push(r); log('proto', v, JSON.stringify({ ...r, trace: undefined }));
      await sleep(600);
    }
    fs.writeFileSync(path.join(OUT, `${TAG}_proto.json`), JSON.stringify({ info, proto: out }, null, 1));
    ws.close(); kill(); process.exit(0);
  }
  // 3) 재생(처음부터)
  await evaluate(`(animStop(), animSeek(0), true)`);
  await scen('play', async () => { await click(await btn('#tlPlay')); await sleep(PLAY); const st = await evaluate('__tl.state()'); if (st.playing) await click(await btn('#tlPlay')); return st; });
  await evaluate(`(animStop(), true)`);
  // 4) 눈금자 스크럽(왼쪽 → 오른쪽, 2초, 125Hz)
  const ru = await evaluate('__tl.ruler()');
  await scen('scrub', async () => { await drag({ x: ru.l + 6, y: ru.y }, { x: ru.r - 8, y: ru.y }, 2000); await sleep(300); return evaluate('__tl.state()'); });
  // 5) 클립/키 끌기
  const isTy = MAPK === 'typhoon' || MAPK === 'typhoonLine' || MAPK === 'cmp';
  if (!isTy || MAPK === 'cmp') {
    const c = await pick('.tlLane:not(.prop) .tlClip:not(.static):not(.cam):not(.none):not(.lock):not(.implicit)', '.tlClip', 0);
    if (c) await scen('clipDrag', async () => { await drag({ x: c.x, y: c.y }, { x: c.x + 220, y: c.y }, 1500); await sleep(300); return evaluate(`({ tracks: anim().tracks.slice(0, 3).map((t) => [t.kind, t.start, t.len]), head: __tl.state() })`); });
    const c2 = await pick('.tlLane:not(.prop) .tlClip .tlEdge.r', '.tlClip .rz', 1);
    if (c2) await scen('clipResize', async () => { await drag({ x: c2.x, y: c2.y }, { x: c2.x + 150, y: c2.y }, 1200); await sleep(300); return evaluate(`({ lens: anim().tracks.slice(0, 3).map((t) => t.len) })`); });
  }
  if (isTy && MAPK !== 'cmp') {
    const k = await pick('.tlLane[data-id="typ:path"] .tlEdge.r', '.tlTypKey.path.kEnd', 0);
    if (k) await scen('typKeyDrag', async () => { await drag({ x: k.x, y: k.y }, { x: k.x + 200, y: k.y }, 1500); await sleep(300); return evaluate(`({ ps: anim().tracks[0].ps, pe: anim().tracks[0].pe })`); });
    const b = await pick('.tlLane[data-id^="typ:lab:"] .tlClip', '.tlTypBarGrab.label', 0);
    if (b) await scen('typBarDrag', async () => { await drag({ x: b.x, y: b.y }, { x: b.x - 150, y: b.y }, 1200); await sleep(300); return null; });
  }
  if (CAM !== '0') {
    if (!NEWUI) await evaluate(`(() => { const k = document.querySelectorAll('.tlCamRow.tlCamHead .tlCamKey')[1]; if (k) k.scrollIntoView({ block: 'center' }); return 1; })()`);   // 트랙이 많으면 카메라 행이 그리드 아래로 가려져 있다
    await sleep(200);
    const ck = await pick('.tlLane.prop .tlKey', '.tlCamRow.tlCamHead .tlCamKey', 1);
    if (ck) await scen('camKeyDrag', async () => { await drag({ x: ck.x, y: ck.y }, { x: ck.x - 160, y: ck.y }, 1500); await sleep(400); return evaluate(`camKeys().map((k) => k.t)`); });
  }
  // 6) 정지 상태로 가만히(자동 저장 주기 포함)
  await scen('idle', async () => { await sleep(1700); return null; });
  info.consoleErrCount = consoleErr.length;
  const file = path.join(OUT, `${TAG}.json`);
  fs.writeFileSync(file, JSON.stringify({ info, results }, null, 1));
  log('saved', file, 'errors', errors.length);
  const disp = /\[perf\] display (.*)/.exec(mainLog); if (disp) log('display', disp[1]);
  ws.close(); kill();
  process.exit(0);
})().catch((e) => { console.error('tlperf error', e); process.exit(2); });
