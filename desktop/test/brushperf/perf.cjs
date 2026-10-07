// 브러쉬 성능 측정기 — 앱을 '보이는' Electron 창(포커스 안 뺏음)으로 띄우고 CDP 실제 입력(Input.dispatchMouseEvent)으로
// 브러쉬 모드 진입·영역 선택·덧칠·지우개를 재현, 계측(instr.js)·LoAF·Event Timing·CPU 프로파일·트레이스를 모은다.
// 사용: node perf.cjs [--app=<앱 폴더>] [--out=<결과 폴더>] --res=1920x1080|2158x1214|1920x1080-vf --style=sgg|sido|warn|seoul --strokes=0|50|300
//        [--profile] [--trace=strokeLong,select] [--only=시나리오,...] [--size=1920x1080] [--noshadow] [--tag=이름]
//        [--bench [--benchfile=bench2.js] [--bn=50]]  [--proto=img,blob,fo]  [--protoshot]
// 창이 화면에 잠깐 뜬다(포커스는 안 뺏음) — 숨김 창은 rAF/프레임이 안 돌아 렌더 비용을 못 잰다.
// 결과 표: node table.cjs --out=<결과 폴더> [태그...] / 상세: node show.cjs <결과.json> [시나리오,...]
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); if (!a) return d; return a.includes('=') ? a.slice(k.length + 3) : true; };
const APP = path.resolve(opt('app', path.resolve(__dirname, '..', '..', '..')));   // 기본: 이 파일 기준 앱 폴더
const DESK = path.resolve(__dirname, '..', '..');   // 일렉트론·main.js 는 이 작업트리 것, 앱 파일만 APP(--app)에서
const ELECTRON = path.join(DESK, 'node_modules', 'electron', 'dist', 'electron.exe');
const HERE = __dirname;
const RES = opt('res', '1920x1080'), STYLE = opt('style', 'sgg'), NSTROKES = +opt('strokes', 0);
const SIZE = opt('size', '1920x1080'), PROFILE = !!opt('profile', false), TRACE = opt('trace', '');
const ONLY = opt('only', '');   // 쉼표로 시나리오 골라 돌리기
const TAG = opt('tag', `${STYLE}_${RES}_${NSTROKES}`);
const OUT = path.resolve(opt('out', path.join(require('os').tmpdir(), 'wcg-brushperf'))); fs.mkdirSync(OUT, { recursive: true });   // 결과는 저장소 밖(기본: 임시 폴더)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const log = (...a) => console.error('[perf]', ...a);

async function waitUntil(t) { while (true) { const d = t - performance.now(); if (d <= 0) return; if (d > 3) await sleep(d - 2); else await new Promise((r) => setImmediate(r)); } }

(async () => {
  const port = await freePort();
  const proc = spawn(ELECTRON, [path.join(HERE, 'perf-main.js'), `--remote-debugging-port=${port}`], {
    cwd: DESK, env: { ...process.env, WCG_MAIN: path.join(DESK, 'main.js'), WCG_APP_DIR: APP, WCG_TEST: '1', WCG_TEST_SIZE: SIZE }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false,
  });
  let mainLog = '';
  proc.stdout.on('data', (d) => { mainLog += d; }); proc.stderr.on('data', (d) => { mainLog += d; });
  const kill = () => { try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {} };
  process.on('exit', kill);
  let page = null;
  for (let i = 0; i < 80 && !page; i++) {
    await sleep(400);
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = list.find((p) => p.type === 'page' && p.url.startsWith('app://weathercg')); } catch (e) {}
  }
  if (!page) { log('no page', mainLog.slice(-800)); kill(); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const errors = []; const listeners = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push('EXC ' + ((d.exception && d.exception.description) || d.text).slice(0, 300)); }
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(HERE, 'instr.js'), 'utf8') });
  const helpers = fs.readFileSync(path.join(HERE, 'helpers.js'), 'utf8');
  const reload = async (extra = 7000) => { const w = waitLoad(); await send('Page.reload', { ignoreCache: false }); await w; await sleep(extra); await evaluate(helpers); };
  await reload(8000);
  const info = { tag: TAG, res: RES, style: STYLE, strokes: NSTROKES, size: SIZE, errors };
  info.setup = await evaluate(`__h.setupCG(${JSON.stringify(RES)}, ${JSON.stringify(STYLE)})`);
  log('setup', JSON.stringify(info.setup));
  // 영역(시도) 고르기
  let A, B;
  if (STYLE === 'seoul') { const l = await evaluate('__h.sidoList()'); A = l[0]; B = l[1]; }
  else { A = '경기'; B = '강원'; }
  info.regions = [A, B];
  if (NSTROKES > 0) {
    info.inject = await evaluate(`__h.injectStrokes(${JSON.stringify(STYLE)}, ${JSON.stringify([A, B])}, ${NSTROKES}, { runLen: 25, eraseEvery: 40 })`);
    log('inject', JSON.stringify(info.inject));
    await reload(9000);
    await evaluate('__h.closePopups()');
  }
  if (opt('noshadow', false)) info.noshadow = await evaluate(`(() => { document.querySelector('#L_map').removeAttribute('filter'); return true; })()`);   // 실험: 지도 그림자 필터 끔
  // 부팅(새로고침) 때 브러쉬 그림이 다 들어온 시각과 그동안의 긴 작업 — 처음부터 굽기 비용
  info.boot = await evaluate('(() => ({ brushReadyMs: __perf.lastHref == null ? null : Math.round(__perf.lastHref), longTaskMs: Math.round(__perf.lt.filter((e) => e.startTime < 20000).reduce((a, e) => a + e.duration, 0)), longTaskMax: Math.round(Math.max(0, ...__perf.lt.filter((e) => e.startTime < 20000).map((e) => e.duration))) }))()');
  info.state0 = await evaluate('__h.state()');
  log('state', JSON.stringify(info.state0));

  // ---- 입력 도우미 ----
  const mouse = (type, x, y, o = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: o.button || (o.buttons ? 'left' : 'none'), buttons: o.buttons || 0, clickCount: o.clickCount || 0, modifiers: o.modifiers || 0 });
  const movePath = async (pts, o = {}, hz = 125) => {
    const dt = 1000 / hz; let t = performance.now(); const ps = [];
    for (const p of pts) { t += dt; await waitUntil(t); ps.push(mouse('mouseMoved', p.x, p.y, o)); }
    await Promise.all(ps);
  };
  const click = async (x, y, modifiers = 0) => {
    await mouse('mouseMoved', x, y, { modifiers });
    await sleep(30);
    await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1, modifiers });
    await sleep(60);
    await mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1, modifiers });
  };
  const stroke = async (pts, modifiers = 0) => {
    await mouse('mouseMoved', pts[0].x, pts[0].y, { modifiers }); await sleep(40);
    await mouse('mousePressed', pts[0].x, pts[0].y, { button: 'left', buttons: 1, clickCount: 1, modifiers });
    await movePath(pts.slice(1), { button: 'left', buttons: 1, modifiers });
    await mouse('mouseReleased', pts[pts.length - 1].x, pts[pts.length - 1].y, { button: 'left', buttons: 0, clickCount: 1, modifiers });
  };

  // ---- 프로파일·트레이스 ----
  const summarizeProfile = (prof) => {
    const nodes = new Map(prof.nodes.map((n) => [n.id, n])); const parent = new Map();
    for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const key = (n) => { const cf = n.callFrame; const u = (cf.url || '').split('/').pop(); return `${cf.functionName || '(anonymous)'}${u ? ' ' + u + ':' + (cf.lineNumber + 1) : ''}`; };
    const self = new Map(), total = new Map(); let all = 0;
    for (let i = 0; i < prof.samples.length; i++) {
      const dt = (prof.timeDeltas[i] || 0) / 1000; all += dt;
      let nid = prof.samples[i]; const n = nodes.get(nid); const k = key(n);
      self.set(k, (self.get(k) || 0) + dt);
      const seen = new Set();
      while (nid != null) { const kk = key(nodes.get(nid)); if (!seen.has(kk)) { seen.add(kk); total.set(kk, (total.get(kk) || 0) + dt); } nid = parent.get(nid); }
    }
    const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, t]) => ({ fn: n, ms: Math.round(t * 10) / 10, pct: Math.round((t / all) * 1000) / 10 }));
    return { totalMs: Math.round(all), self: top(self, 22), total: top(total, 30).filter((x) => !/^\((root|program|idle)\)/.test(x.fn)) };
  };
  const traceEvents = [];
  const startTrace = async () => {
    traceEvents.length = 0;
    listeners.push(traceL);
    await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,gpu,viz,toplevel,blink', options: 'sampling-frequency=10000', transferMode: 'ReportEvents' });
  };
  function traceL(m) { if (m.method === 'Tracing.dataCollected') traceEvents.push(...m.params.value); }
  const stopTrace = async () => {
    const done = new Promise((r) => { const f = (m) => { if (m.method === 'Tracing.tracingComplete') { listeners.splice(listeners.indexOf(f), 1); r(); } }; listeners.push(f); });
    await send('Tracing.end'); await done; listeners.splice(listeners.indexOf(traceL), 1);
    if (opt('rawtrace', false)) fs.writeFileSync(path.join(OUT, `${TAG}_${Date.now()}.trace.json`), JSON.stringify(traceEvents));   // 원 트레이스(chrome://tracing·Perfetto로 열기)
    const tn = new Map(); const pn = new Map();
    for (const e of traceEvents) { if (e.ph === 'M' && e.name === 'thread_name') tn.set(e.pid + ':' + e.tid, e.args.name); if (e.ph === 'M' && e.name === 'process_name') pn.set(e.pid, e.args.name); }
    const agg = new Map(); const open = new Map();
    const addA = (e, d) => { const th = (pn.get(e.pid) || e.pid) + '/' + (tn.get(e.pid + ':' + e.tid) || e.tid); const k = th + ' :: ' + e.name; const r = agg.get(k) || { n: 0, ms: 0, max: 0 }; r.n++; r.ms += d; r.max = Math.max(r.max, d); agg.set(k, r); };
    for (const e of traceEvents) {
      if (e.ph === 'X' && e.dur != null) addA(e, e.dur / 1000);
      else if (e.ph === 'B') { const k = e.pid + ':' + e.tid; (open.get(k) || open.set(k, []).get(k)).push(e); }
      else if (e.ph === 'E') { const st = open.get(e.pid + ':' + e.tid); const b = st && st.pop(); if (b) addA(b, (e.ts - b.ts) / 1000); }
    }
    const NAMES = /^(Paint|PaintImage|Layout|UpdateLayoutTree|PrePaint|Layerize|Commit|RasterTask|GPUTask|ImageDecodeTask|Decode Image|Decode LazyPixelRef|ScheduledAction|DrawFrame|HitTest|EventDispatch|FunctionCall|TimerFire|FireAnimationFrame|RunTask|ThreadControllerImpl::RunTask|ProxyMain::BeginMainFrame|BeginMainFrame|LayerTreeHostImpl::PrepareToDraw|Graphics.Pipeline|DisplayScheduler::DrawAndSwap|SkiaOutputSurfaceImplOnGpu::SwapBuffers|TileManager::AssignGpuMemoryToTiles|RasterBufferProvider::|GpuImageDecodeCache|PaintArtifactCompositor::Update|LocalFrameView::RunPaintLifecyclePhase|ParseHTML|v8.execute|V8.GC|MinorGC|MajorGC|BlinkGC.*|CanvasResource.*|Canvas.*|.*Raster.*|.*toDataURL.*|ImageDecoder.*|.*Decode.*)$/;
    const rows = [...agg.entries()].filter(([k]) => NAMES.test(k.split(' :: ')[1])).sort((a, b) => b[1].ms - a[1].ms).slice(0, 40).map(([k, r]) => ({ ev: k, n: r.n, ms: Math.round(r.ms * 10) / 10, max: Math.round(r.max * 10) / 10 }));
    return { events: traceEvents.length, top: rows };
  };

  const results = [];
  // ---- 미세 측정 / 라이브 미리보기 시제품 모드 ----
  const runBody = (file) => evaluate(`(async () => { ${fs.readFileSync(path.join(HERE, file), 'utf8')}\n})()`);
  if (opt('bench', false)) {
    await evaluate(`window.__bench = { A: ${JSON.stringify(A)}, B: ${JSON.stringify(B)}, n: ${+opt('bn', 50)} }`);
    const r = await runBody(opt('benchfile', 'bench.js'));
    const file = path.join(OUT, `${TAG}_bench.json`); fs.writeFileSync(file, JSON.stringify({ info, bench: r }, null, 1));
    log('bench saved', file); console.log(JSON.stringify(r, null, 1)); ws.close(); kill(); process.exit(0);
  }
  if (opt('proto', false)) {
    const out = [];
    for (const v of String(opt('proto')).split(',')) {
      for (const shadow of [true, false]) {
        await evaluate(`(() => { const m = document.querySelector('#L_map'); if (${shadow}) m.setAttribute('filter', 'url(#shadowF)'); else m.removeAttribute('filter'); return true; })()`);
        await sleep(400);
        await startTrace();
        await evaluate(`window.__proto = { variant: ${JSON.stringify(v)}, ms: 2000, A: ${JSON.stringify(A)}, B: ${JSON.stringify(B)} }`);
        const r = await runBody('proto.js');
        r.shadow = shadow; r.trace = await stopTrace();
        out.push(r); log('proto', v, shadow, JSON.stringify({ ...r, trace: undefined }));
        await sleep(500);
      }
    }
    const file = path.join(OUT, `${TAG}_proto.json`); fs.writeFileSync(file, JSON.stringify({ info, proto: out }, null, 1));
    log('proto saved', file); ws.close(); kill(); process.exit(0);
  }
  if (opt('protoshot', false)) {   // 미리보기 방식별 화면 픽셀 비교(img vs fo)
    const shots = {};
    const rect = await evaluate(`(() => { const r = document.querySelector('#zoneLineMain').getBoundingClientRect(); return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: r.width, height: r.height, scale: 1 }; })()`);
    for (const v of ['img', 'fo', 'img']) {
      await evaluate(`window.__proto = { variant: ${JSON.stringify(v)}, ms: 60000, maxPts: 400, keep: true, A: ${JSON.stringify(A)}, B: ${JSON.stringify(B)} }`);
      const r = await runBody('proto.js'); await sleep(800);
      const s = await send('Page.captureScreenshot', { format: 'png', clip: rect });
      const key = shots[v] ? v + '2' : v;
      shots[key] = 'data:image/png;base64,' + s.result.data;
      fs.writeFileSync(path.join(OUT, `${TAG}_${key}.png`), Buffer.from(s.result.data, 'base64'));
      await evaluate(`(() => { window.__protoEl && window.__protoEl.remove(); return true; })()`); await sleep(300);
      log('shot', key, JSON.stringify({ ...r }));
    }
    const cmp = (a, b) => evaluate(`(async () => { const ld = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
      const [a, b] = await Promise.all([ld(${JSON.stringify(shots[a])}), ld(${JSON.stringify(shots[b])})]);
      const c = document.createElement('canvas'); c.width = a.width; c.height = a.height; const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(a, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data; x.clearRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
      let mx = 0, sum = 0, o8 = 0, o24 = 0; for (let i = 0; i < da.length; i++) { if ((i & 3) === 3) continue; const d = Math.abs(da[i] - db[i]); if (d > mx) mx = d; sum += d; if (d > 8) o8++; if (d > 24) o24++; }
      return { w: c.width, h: c.height, maxAbs: mx, meanAbs: Math.round(sum / (da.length * 0.75) * 1000) / 1000, chOver8: o8, chOver24: o24 }; })()`);
    const res = { rect, imgVsImg: await cmp('img', 'img2'), imgVsFo: await cmp('img', 'fo') };
    fs.writeFileSync(path.join(OUT, `${TAG}_protoshot.json`), JSON.stringify(res, null, 1));
    log('protoshot', JSON.stringify(res)); ws.close(); kill(); process.exit(0);
  }
  const scen = async (name, fn) => {
    if (ONLY && !ONLY.split(',').includes(name)) return;
    const doTrace = TRACE && TRACE.split(',').includes(name);
    if (PROFILE) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); }
    if (doTrace) await startTrace();
    await evaluate(`__perf.begin(${JSON.stringify(name)})`);
    const t0 = performance.now();
    const extra = await fn();
    const wall = performance.now() - t0;
    const r = await evaluate('__perf.end()');
    r.wallMs = Math.round(wall); if (extra) r.extra = extra;
    if (doTrace) { r.trace = await stopTrace(); }
    if (PROFILE) { const p = await send('Profiler.stop'); fs.writeFileSync(path.join(OUT, `${TAG}_${name}.cpuprofile`), JSON.stringify(p.result.profile)); r.profile = summarizeProfile(p.result.profile); }
    results.push(r);
    log(name, 'frames', JSON.stringify(r.frames), 'events', JSON.stringify(r.events));
    await sleep(600);
  };

  const ptA = await evaluate(`__h.pointIn(${JSON.stringify(A)}, 1)`), ptB = await evaluate(`__h.pointIn(${JSON.stringify(B)}, 2)`);
  info.points = { ptA, ptB };
  const btn = await evaluate(`(() => { const r = document.querySelector('#mBrush').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), vis: r.width > 0 }; })()`);
  // 1) 브러쉬 모드 진입(버튼 클릭)
  await scen('modeEnter', async () => { if (btn.vis) await click(btn.x, btn.y); else await evaluate(`document.querySelector('#mBrush').click()`); await sleep(500); });
  await evaluate(`(() => { if (!document.querySelector('#mBrush').classList.contains('on')) document.querySelector('#mBrush').click(); return true; })()`);
  // 2) 칠하지 않고 마우스만 움직이기(커서 원)
  const hoverPts = await evaluate(`__h.strokePath(${JSON.stringify(A)}, 120, 3)`);
  await scen('hover', async () => { await movePath(hoverPts, {}, 125); await sleep(200); });
  // 3) 영역 선택: SHIFT+클릭 A, B, B(해제), B(다시)
  await scen('select', async () => {
    for (const p of [ptA, ptB, ptB, ptB]) { if (p) { await click(p.x, p.y, 8); await sleep(350); } }
    await mouse('mouseMoved', ptA.x, ptA.y, {});   // shift 떼기
    await sleep(200);
  });
  info.afterSelect = await evaluate('__h.state()');
  // 4) 짧은 획
  const pShort = await evaluate(`__h.strokePath(${JSON.stringify(A)}, 26, 1)`);
  await scen('strokeShort', async () => { await stroke(pShort); await sleep(700); });
  // 5) 긴 획 (2초)
  const pLong = await evaluate(`__h.strokePath(${JSON.stringify(A)}, 251, 2)`);
  await scen('strokeLong', async () => { await stroke(pLong); await sleep(900); });
  // 6) 지우개(Ctrl)
  const pErase = await evaluate(`__h.strokePath(${JSON.stringify(A)}, 61, 4)`);
  await scen('erase', async () => { await stroke(pErase, 2); await sleep(700); });
  // 7) 부드럽게 100 + 큰 브러쉬 150
  await evaluate(`__h.setRange('#brSoft', 100) && __h.setRange('#brSize', 150)`);
  const pSoft = await evaluate(`__h.strokePath(${JSON.stringify(B)}, 61, 5)`);
  await scen('softBig', async () => { await stroke(pSoft); await sleep(700); });
  await evaluate(`__h.setRange('#brSoft', 70) && __h.setRange('#brSize', 55)`);
  // 7-1) 되돌리기 1번(마지막 획) — 버튼 클릭 처리(동기) 시간
  await scen('undo', async () => evaluate(`(async () => { let tImg = null; const t = performance.now(); const mo = new MutationObserver((ms) => { if (tImg == null && ms.some((m) => m.target.classList && m.target.classList.contains('brushLayer'))) tImg = performance.now() - t; }); mo.observe(document.querySelector('#cg'), { subtree: true, attributes: true, attributeFilter: ['href'] }); document.querySelector('#undo').click(); const sync = performance.now() - t; await new Promise((r) => setTimeout(r, 900)); mo.disconnect(); return { syncMs: Math.round(sync * 10) / 10, imgMs: tImg == null ? null : Math.round(tImg * 10) / 10 }; })()`));
  // 8) 가만히 3.2초(자동저장 주기)
  await scen('idle', async () => { await sleep(3200); });
  info.stateEnd = await evaluate('__h.state()');
  const file = path.join(OUT, `${TAG}.json`);
  fs.writeFileSync(file, JSON.stringify({ info, results }, null, 1));
  log('saved', file, 'errors', errors.length);
  const disp = /\[perf\] display (.*)/.exec(mainLog); if (disp) log('display', disp[1]);
  ws.close(); kill();
  process.exit(0);
})().catch((e) => { console.error('perf error', e); process.exit(2); });
