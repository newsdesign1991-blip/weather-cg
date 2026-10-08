// 틸트 미리보기 WebGL 렌더러(js/tilt-gl.js)·진입 게이트·다시 굽기 조건(js/view-camera.js applyTilt·tiltWant·rasterTiltCanvas,
// js/anim.js renderAnimFrame·animMapKey) — 브라우저 없이 vm에서 가짜 DOM·가짜 WebGL로 본다.
// 실제 화면(반짝임·프레임 시간·첫 진입 빈 프레임)은 boot-check 점검으로 따로 쟀다(커밋 메시지·보고).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로(MODULES.md)

const html = appSource(path.join(__dirname, '..', 'index.html'));

// 이름으로 최상위 정의 하나를 잘라낸다(괄호 균형 — typhoon-cluster-c.test.cjs와 같은 방식)
function pick(name) {
  const heads = [`async function ${name}(`, `function ${name}(`, `const ${name} = `, `let ${name} = `];
  let s = -1;
  for (const h of heads) { const re = new RegExp('^' + h.replace(/[$()]/g, '\\$&'), 'm'); const m = re.exec(html); if (m) { s = m.index; break; } }
  assert.ok(s >= 0, 'not found: ' + name);
  const isFn = html.startsWith('function', s) || html.startsWith('async function', s);
  let i = s, depth = 0, q = null, seenBody = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '/' && html[i + 1] === '/') { i = html.indexOf('\n', i); continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') { depth++; if (ch === '{') seenBody = true; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth--; if (isFn && depth === 0 && ch === '}' && seenBody) { i++; break; } continue; }
    if (!isFn && depth === 0 && ch === ';') { i++; break; }
  }
  return html.slice(s, i);
}

// ---------- 가짜 WebGL2 ----------
function fakeGL(opt) {
  opt = opt || {};
  const calls = []; let lost = false, n = 0;
  const C = new Proxy({}, { get: (t, k) => (typeof k === 'string' && /^[A-Z0-9_]+$/.test(k) ? (k === 'NO_ERROR' ? 0 : 1000 + k.length) : undefined) });
  const impl = {
    getShaderParameter: () => !opt.badShader, getProgramParameter: () => true, getShaderInfoLog: () => 'bad', getProgramInfoLog: () => '',
    getParameter: () => (opt.maxTex || 16384), getExtension: (e) => (e === 'EXT_texture_filter_anisotropic' ? { TEXTURE_MAX_ANISOTROPY_EXT: 1, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 2 } : null),
    isContextLost: () => lost, getError: () => (opt.err ? 1 : 0), getAttribLocation: () => 0, getUniformLocation: () => ({}),
  };
  const gl = new Proxy({}, {
    get: (t, k) => {
      if (k === '__calls') return calls;
      if (k === '__lose') return (v) => { lost = v; };
      if (typeof k === 'string' && /^[A-Z0-9_]+$/.test(k)) return C[k];
      if (impl[k]) return (...a) => { calls.push(k); return impl[k](...a); };
      return (...a) => { calls.push(k); if (k === 'texImage2D') calls.push(['tex', a.length === 6 ? a[5] : null]); return { id: ++n }; };
    },
  });
  return gl;
}
function fakeCanvas(gl) {
  const ls = {};
  return { width: 1, height: 1, style: {}, getContext: (t) => (t === 'webgl2' ? gl : null), addEventListener: (ev, f) => { ls[ev] = f; }, fire: (ev) => ls[ev] && ls[ev]({ preventDefault() {} }) };
}
function glCtx(extra) {
  const timers = [];
  const ctx = Object.assign({ console, CAM_BLEED: 1.0, CAM_EDGE_FADE: 26, S: { map3d: { on: 1, rx: 30, ry: 0, rz: -10, persp: 2.2 } }, localStorage: { getItem: () => null },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {}, __timers: timers }, extra || {});
  vm.createContext(ctx);
  const names = ['TGL_VS', 'TGL_FS', 'tglEnabled', 'tglCreate', 'tglInit', 'tglOk', 'tglUpload', 'tglFree', 'tglQuad', 'tglDraw', '_tglExp', 'tglWarp'];
  vm.runInContext(names.map(pick).join('\n') + '\nglobalThis.__t = { tglEnabled, tglCreate, tglOk, tglUpload, tglFree, tglQuad, tglDraw, tglWarp, exp: () => _tglExp };', ctx);
  return ctx;
}

test('GL 렌더러: WebGL2가 없거나 끄기 설정·셰이더 실패면 null(→ CSS·메시 경로), 잃음·되찾음 이벤트를 알린다', () => {
  const c0 = glCtx();
  assert.equal(c0.__t.tglCreate({ getContext: () => null, addEventListener() {} }), null, 'WebGL2 없음 → null');
  assert.equal(glCtx({ localStorage: { getItem: (k) => (k === 'wcg_tiltgl' ? '0' : null) } }).__t.tglCreate(fakeCanvas(fakeGL())), null, '끄기 설정');
  assert.equal(c0.__t.tglCreate(fakeCanvas(fakeGL({ badShader: true }))), null, '셰이더 실패');
  const gl = fakeGL(), cv = fakeCanvas(gl), ev = [];
  const r = c0.__t.tglCreate(cv, (rr, restored) => ev.push(restored));
  assert.ok(r && c0.__t.tglOk(r));
  assert.equal(c0.__t.tglUpload(r, {}, 5760, 3240), true);
  assert.ok(gl.__calls.includes('generateMipmap'), '밉맵을 만든다');
  assert.ok(gl.__calls.includes('texParameterf'), '비등방 필터');
  assert.equal(r.has, true);
  gl.__lose(true); cv.fire('webglcontextlost');
  assert.equal(c0.__t.tglOk(r), false); assert.equal(r.has, false); assert.deepEqual(ev, [false]);
  assert.equal(c0.__t.tglUpload(r, {}, 10, 10), false, '잃은 동안은 못 올림');
  gl.__lose(false); cv.fire('webglcontextrestored');
  assert.equal(c0.__t.tglOk(r), true); assert.deepEqual(ev, [false, true]);
  assert.equal(r.has, false, '되찾으면 그림을 다시 올려야 한다');
  // 섞어 바꾸기: 앞 그림을 tex2로 남기고, 그리기는 앞 그림(불투명) → 새 그림(a만큼, premultiplied over) 두 번
  assert.equal(c0.__t.tglUpload(r, {}, 100, 100), true);
  assert.equal(c0.__t.tglUpload(r, {}, 200, 200, true), true);
  assert.equal(r.has2, true);
  const n0 = gl.__calls.filter((x) => x === 'drawArrays').length;
  c0.__t.tglDraw(r, 640, 360, { rx: 30, rz: 5, a: 0.4, prev: { k: null } });
  assert.equal(gl.__calls.filter((x) => x === 'drawArrays').length - n0, 2);
  assert.ok(gl.__calls.includes('blendFunc'));
  c0.__t.tglDraw(r, 640, 360, { rx: 30, rz: 5 });
  assert.equal(gl.__calls.filter((x) => x === 'drawArrays').length - n0, 3, '섞기 없으면 한 번');
  // 텍스처 한도를 넘으면 false(→ 부르는 쪽이 CSS로)
  const r2 = c0.__t.tglCreate(fakeCanvas(fakeGL({ maxTex: 4096 })));
  assert.equal(c0.__t.tglUpload(r2, {}, 5760, 3240), false);
  // 첫 업로드 오류(getError)도 false
  const r3 = c0.__t.tglCreate(fakeCanvas(fakeGL({ err: true })));
  assert.equal(c0.__t.tglUpload(r3, {}, 100, 100), false);
});

test('GL 투영 = _camProjectRaw(warpTilt3D·CSS와 같은 식) — 회전·원근·카메라 보정(r배·이동)까지', () => {
  const ctx = glCtx();
  vm.runInContext(pick('_camProjectRaw') + '\nglobalThis.__proj = _camProjectRaw;', ctx);
  const B = 1.0, hw = 960 * (1 + 2 * B), hh = 540 * (1 + 2 * B);
  const corners = [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]];
  for (const [rx, ry, rz, persp, k] of [[30, 0, -10, 2.2, null], [55, 0, -20, 2.2, null], [72, 5, 140, 1.6, null], [40, 0, 25, 2.2, { r: 1.3, tx: 120, ty: -80 }], [0.5, 0, 0, 3, { r: 0.7, tx: -300, ty: 40 }]]) {
    ctx.S.map3d = { on: 1, rx, ry, rz, persp };
    const q = ctx.__t.tglQuad({ rx, ry, rz, persp, k });
    corners.forEach(([X0, Y0], i) => {
      const [x, y, , w] = q.slice(i * 6, i * 6 + 4);
      const kk = k || { r: 1, tx: 0, ty: 0 };
      const [ex, ey] = ctx.__proj(960 + kk.r * X0 + kk.tx, 540 + kk.r * Y0 + kk.ty);
      const sx = 960 + 960 * (x / w), sy = 540 - 540 * (y / w);
      assert.ok(Math.abs(sx - ex) < 0.05 && Math.abs(sy - ey) < 0.05, `${rx},${ry},${rz} 모서리 ${i}: ${sx},${sy} ≠ ${ex},${ey}`);
    });
    assert.deepEqual([...q].filter((_, j) => j % 6 >= 4), [0, 0, 1, 0, 0, 1, 1, 1], 'UV');
  }
});

test('추출: GL을 못 쓰면 warpTilt3D가 2D 메시로(이음매 부풀림·smoothing high), 되면 GL 한 번으로', () => {
  const tri = [];
  const ctx = glCtx({ document: { createElement: () => ({ getContext: () => null, addEventListener() {} }) } });
  vm.runInContext([pick('fadeEdgesCanvas'), pick('drawTexTri'), pick('warpTilt3D')].join('\n') + '\nglobalThis.__warp = warpTilt3D; globalThis.__tri = drawTexTri;', ctx);
  // 가짜 2D 캔버스(도형 클립 좌표·smoothing 기록)
  const mk = () => { const o = { ops: [], save() {}, restore() {}, beginPath() {}, closePath() {}, clip() { o.ops.push('clip'); }, moveTo(x, y) { o.ops.push(['m', x, y]); }, lineTo(x, y) { o.ops.push(['l', x, y]); }, setTransform() {}, drawImage() { o.ops.push(['img', o.imageSmoothingQuality]); }, createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, globalCompositeOperation: '' }; return o; };
  ctx.document.createElement = () => ({ width: 0, height: 0, getContext: (t) => (t === '2d' ? mk() : null), addEventListener() {} });
  const cx = mk();
  ctx.__warp(cx, { width: 300, height: 300 }, 100, 100);
  assert.equal(ctx.__t.exp(), false, 'WebGL2 없음 → 추출 렌더러 없음');
  const imgs = cx.ops.filter((o) => o[0] === 'img');
  assert.equal(imgs.length, 24 * 24 * 2, '메시 삼각형 수');
  assert.ok(imgs.every((o) => o[1] === 'high'), "축소 샘플링 'high'");
  // 클립 삼각형은 세 변을 바깥으로 0.75px씩(이웃과 겹쳐 이음매 없음) — 직각 꼭짓점 (0,0)은 두 변이 0.75씩 밀려 (-0.75,-0.75)
  const c2 = mk(); ctx.__tri(c2, {}, [0, 0], [10, 0], [0, 10], [0, 0], [30, 0], [0, 30]);
  const m = c2.ops.find((o) => o[0] === 'm');
  assert.ok(Math.abs(m[1] + 0.75) < 1e-9 && Math.abs(m[2] + 0.75) < 1e-9, JSON.stringify(m));
  // 원근으로 납작해진 가는 삼각형(먼 쪽 칸 — 꼭짓점 7°)도 세 변이 모두 0.75px 밀린다(무게중심 식은 빗변이 0.1px쯤밖에 안 밀려 틈이 남았다)
  const c3 = mk(); ctx.__tri(c3, {}, [0, 0], [10, 0], [0, 10], [0, 0], [80, 0], [0, 10]);
  const T3 = c3.ops.filter((o) => o[0] === 'm' || o[0] === 'l').map((o) => [o[1], o[2]]);
  const inTri = (p) => { const s = (a, b) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); const d = [s(T3[0], T3[1]), s(T3[1], T3[2]), s(T3[2], T3[0])]; return d.every((x) => x >= -1e-9) || d.every((x) => x <= 1e-9); };
  const hn = [10 / Math.hypot(80, 10), 80 / Math.hypot(80, 10)];   // 빗변 (80,0)–(0,10)의 바깥 법선
  for (const f of [0.1, 0.5, 0.9]) {
    const mx = 80 * (1 - f), my = 10 * f;
    assert.ok(inTri([mx + hn[0] * 0.74, my + hn[1] * 0.74]), '빗변 ' + f + ' 지점 0.74 바깥도 덮는다 ' + JSON.stringify(T3));
    assert.ok(inTri([80 * f, -0.74]) && inTri([-0.74, 10 * f]), '밑변·옆변도');
  }
  // GL이 되면 메시 없이 한 번에 그리고 텍스처는 바로 비운다
  const gl = fakeGL();
  const ctx2 = glCtx({ document: { createElement: () => fakeCanvas(gl) } });
  vm.runInContext([pick('fadeEdgesCanvas'), pick('drawTexTri'), pick('warpTilt3D')].join('\n') + '\nglobalThis.__warp = warpTilt3D;', ctx2);
  const cx2 = mk();
  ctx2.__warp(cx2, { width: 5760, height: 3240 }, 1920, 1080);
  assert.deepEqual(cx2.ops.filter((o) => o[0] === 'img').length, 1, 'GL 결과를 한 번 얹는다');
  assert.ok(gl.__calls.includes('drawArrays') && gl.__calls.includes('generateMipmap'));
  const texs = () => gl.__calls.filter((c) => Array.isArray(c) && c[0] === 'tex');
  assert.notEqual(texs()[texs().length - 1][1], null, '영상 프레임마다 같은 텍스처를 이어 쓴다');
  ctx2.__timers.splice(0).forEach((fn) => fn());
  assert.equal(texs()[texs().length - 1][1], null, '마지막 사용 뒤 텍스처 메모리 반납(1×1)');
});

// ---------- 미리보기: 게이트·다시 굽기 조건 ----------
function viewCtx(opt) {
  opt = opt || {};
  const cls = () => { const s = new Set(); return { toggle: (c, on) => { if (on) s.add(c); else s.delete(c); }, contains: (c) => s.has(c), add: (c) => s.add(c), remove: (c) => s.delete(c) }; };
  const R = { rasters: [], gl: null, draws: 0, uploads: 0, glOk: opt.gl !== false, bufLost: false, ls: {}, timers: [] };
  const els = {
    '#cg': { style: {}, clientWidth: 1000 }, '#camClip': { style: {}, appendChild() {} },
    // 그림 버퍼 2D — GPU 리셋 흉내(R.bufLost·contextlost/contextrestored 이벤트)
    '#camCanvas': { style: {}, width: 1, height: 1, getContext: () => ({ clearRect() {}, drawImage() {}, setTransform() {}, isContextLost: () => R.bufLost }), addEventListener: (ev, f) => { R.ls[ev] = f; } },
    '#camGL': { style: {}, width: 1, height: 1 }, '#timeline': { classList: cls() },
  };
  els['#timeline'].classList.add('on');
  const ctx = {
    console, Math, performance: { now: () => R.now }, window: { devicePixelRatio: 1 },
    // opt.timers: 예약을 기록(예열 예약 순서 검사) — 아니면 아무것도 안 함
    setTimeout: opt.timers ? (fn, ms) => { R.timers.push({ fn, ms, live: true }); return R.timers.length; } : () => 0,
    clearTimeout: opt.timers ? (id) => { if (id && R.timers[id - 1]) R.timers[id - 1].live = false; } : () => {},
    document: { querySelector: (q) => els[q] || null, createElement: () => ({ width: 1, height: 1, getContext: () => ({ drawImage() {} }) }) }, $: (q) => els[q] || null,
    isTyphoon: () => !!R.ty,
    S: { map: { x: 100, y: 50, s: 1 }, map3d: { on: 0, rx: 0, ry: 0, rz: 0, persp: 2.2 } }, view: { z: 1 },
    CAM_BLEED: 1.0, CAM_EDGE_FADE: 26, CAM_MAP_LAYERS: [], camBleedViewBox: () => '', _camVfScale: () => null,
    updatePlaceMarkers() {}, suiteFontCss: () => Promise.resolve(''), camKeysRotate: () => true,
    svgToImage: (W, H, layers) => new Promise((res) => { R.rasters.push({ res, at: R.now, layers }); }),
    tglCreate: () => (R.glOk ? (R.gl = { has: false, lost: false }) : null), tglOk: (r) => !!(r && !r.lost),
    tglUpload: (r, src, w, h, keep) => { R.uploads++; if (keep && r.has) r.has2 = true; r.has = true; return true; }, tglDraw: (r, W, H, v) => { R.draws++; R.lastV = v; return true; },
    tglDropPrev: (r) => { r.has2 = false; R.dropped = (R.dropped || 0) + 1; }, requestAnimationFrame: () => 0,
    tglFree: (r) => { r.has = false; R.freed = (R.freed || 0) + 1; },
  };
  ctx.R = R; R.now = 1000;
  vm.createContext(ctx);
  const names = ['_tiltRasterSig', '_camRasterBusy', '_tiltSess', 'TILT_LITE_Q', 'TILT_BASE_LAYERS', '_tiltBase', 'tiltDrifted', '_tiltFade', 'TILT_FADE_MS', 'tiltFadeTick', 'camActive3d', 'tiltContentSig', 'tiltCamSig', 'tiltComp', 'tiltGLView', 'tiltGLLive', 'tiltGLUpload', 'tiltGLPaint',
    'updateCamCanvasTransform', 'tiltReady', 'tiltWant', 'applyTilt', 'rasterTiltCanvas', 'tiltPrewarmSoon', 'tiltPrewarm', 'camEditActive', 'tiltInvalidate', 'tiltBufLost'];
  const src = names.map(pick).join('\n') + `
    const fit = { classList: (${cls.toString()})(), clientWidth: 1000, clientHeight: 562 };
    let _mapContentRev = 0, _mapAnimRev = 0, _animFast = null;
    globalThis.T = {
      applyTilt, tiltWant, rasterTiltCanvas, tiltPrewarm, tiltPrewarmSoon, tiltInvalidate, fit,
      set lite(v) { _animFast = v ? {} : null; }, bump() { _mapContentRev++; }, animBump() { _mapAnimRev++; }, get base() { return _tiltBase; },
      get tex() { return _tiltTex; }, get busy() { return _camRasterBusy; }, get sess() { return _tiltSess; },
      forceNull() { _tiltRasterSig = null; }, setGL(v) { _tglView = v; }, drag(v) { _camDragging = v; },
    };`;
  vm.runInContext(src, ctx);
  ctx.els = els;
  return ctx;
}
const flush = () => new Promise((r) => setImmediate(r));
// 굽는 중인 것 모두 끝내기(태풍은 바탕·경로 두 장) — 끝낸 레이어 목록을 돌려준다
async function finishRaster(ctx) { const rs = ctx.R.rasters.splice(0); rs.forEach((r) => r.res({})); await flush(); await flush(); return rs.map((r) => r.layers); }

test('게이트: 기울기 진입 뒤 첫 그림이 준비될 때까지 평면 지도 유지(.mapTilt 없음) → 준비되면 GL로 기울인 지도', async () => {
  const c = viewCtx(), T = c.T;
  c.S.map3d = { on: 1, rx: 2, ry: 0, rz: 0, persp: 2.2 };
  T.applyTilt();
  assert.equal(T.fit.classList.contains('mapTilt'), false, '그림 전 = 평면 유지(빈 바다 프레임 없음)');
  assert.equal(c.R.rasters.length, 1, '진입하자마자 굽기 시작');
  assert.equal(c.els['#camGL'].style.display, 'none');
  T.applyTilt(); T.applyTilt();
  assert.equal(c.R.rasters.length, 1, '굽는 중엔 더 안 쌓는다');
  await finishRaster(c);
  assert.equal(T.fit.classList.contains('mapTilt'), true, '첫 그림이 오면 기울인 지도로');
  assert.equal(c.els['#camGL'].style.display, '');
  assert.equal(c.els['#camCanvas'].style.display, 'none', 'GL이면 #camCanvas는 그림 버퍼만');
  assert.equal(c.R.uploads, 1);
  // 평면으로 나갔다가 같은 내용으로 다시 들어오면 기다림 없이 바로(앞 그림 재사용)
  c.S.map3d = { on: 0, rx: 0, ry: 0, rz: 0 }; T.applyTilt();
  assert.equal(T.fit.classList.contains('mapTilt'), false);
  c.S.map3d = { on: 1, rx: 3, ry: 0, rz: 0, persp: 2.2 }; T.applyTilt();
  assert.equal(T.fit.classList.contains('mapTilt'), true, '내용이 같으면 바로');
  assert.equal(c.R.rasters.length, 0, '다시 굽지도 않는다');
  // 평면에 있는 동안 내용이 바뀌었으면 새 진입은 다시 게이트
  c.S.map3d = { on: 0, rx: 0, ry: 0, rz: 0 }; T.applyTilt(); T.bump();
  c.S.map3d = { on: 1, rx: 3, ry: 0, rz: 0, persp: 2.2 }; T.applyTilt();
  assert.equal(T.fit.classList.contains('mapTilt'), false);
  await finishRaster(c);
  assert.equal(T.fit.classList.contains('mapTilt'), true);
});

test('예열: 평면에서 미리 구운 그림(같은 내용)이면 진입 첫 프레임부터 기울인 지도', async () => {
  const c = viewCtx(), T = c.T;
  T.tiltPrewarm(); await flush(); await flush();
  assert.equal(c.R.rasters.length, 1, '평면에서 미리 굽는다');
  await finishRaster(c);
  assert.equal(T.fit.classList.contains('mapTilt'), false, '예열은 화면을 안 바꾼다');
  c.S.map3d = { on: 1, rx: 0.5, ry: 0, rz: 0, persp: 2.2 }; T.lite = true; T.applyTilt();
  assert.equal(T.fit.classList.contains('mapTilt'), true, '진입 첫 프레임부터');
  assert.equal(c.R.rasters.length, 0, '다시 굽지 않는다');
  // 그 뒤 내용이 바뀌면(재생 끝 정확 프레임 등) 새 그림이 올 때까지 예열 그림을 그대로 보인다 — 평면으로 깜빡이지 않게
  T.lite = false; T.bump(); T.applyTilt();
  assert.equal(T.fit.classList.contains('mapTilt'), true, '내용이 바뀌어도 기울인 지도 유지');
  assert.equal(c.R.rasters.length, 1);
  await finishRaster(c);
  assert.equal(T.fit.classList.contains('mapTilt'), true);
});

test('예열 예약: 타임라인을 열 때 잡은 예열(sticky)은 곧이은 정지 프레임 예약(0.7초)에 안 밀리고, 정지 프레임끼리는 뒤 예약이 앞 것을 민다(스크럽 사이엔 안 굽게)', () => {
  const c = viewCtx({ timers: true }), T = c.T;
  const live = () => c.R.timers.filter((x) => x.live).map((x) => x.ms);
  T.tiltPrewarmSoon(250, true); T.tiltPrewarmSoon(700);
  assert.deepEqual(live(), [250], '열 때 예열이 그대로');
  { const t = c.R.timers.find((x) => x.live); t.live = false; t.fn(); }   // 예열 실행(타이머 한 번) → sticky 풀림
  T.tiltPrewarmSoon(700); T.tiltPrewarmSoon(700);
  assert.deepEqual(live(), [700], '정지 프레임끼리는 뒤 것 하나만(앞 것은 밀림)');
  assert.equal(c.R.timers.filter((x) => x.ms === 700).length, 2);
});

test('다시 굽기: 재생 중 회전만 바뀌면 안 굽고(그리기만), 내용이 바뀌면 300ms에 한 번, 카메라는 많이 움직였을 때만', async () => {
  const c = viewCtx(), T = c.T;
  c.S.map3d = { on: 1, rx: 10, ry: 0, rz: 0, persp: 2.2 }; T.applyTilt(); await finishRaster(c);
  T.lite = true;
  const d0 = c.R.draws;
  for (let i = 0; i < 30; i++) { c.S.map3d.rx = 10 + i; c.S.map3d.rz = -i; c.R.now += 16; T.applyTilt(); }
  assert.equal(c.R.rasters.length, 0, '회전만 → 다시 안 굽는다');
  assert.ok(c.R.draws - d0 >= 30, '회전마다 다시 그리기만');
  // 내용 변경(칠 진행) → 굽는다(저해상). 곧바로 또 바뀌면 간격(300ms)이 차야 굽는다
  T.bump(); c.R.now += 16; T.applyTilt();
  assert.equal(c.R.rasters.length, 1, '내용이 바뀌면 굽는다');
  await finishRaster(c);
  assert.equal(T.tex.q, 1, '재생 중에도 선명하게(굽는 시간은 해상도 배율과 거의 무관 — SVG 해석이 대부분)');
  T.bump(); c.R.now += 16; T.applyTilt();
  assert.equal(c.R.rasters.length, 0, '직전 굽기에서 300ms 안');
  c.R.now += 400; T.applyTilt();
  assert.equal(c.R.rasters.length, 1);
  await finishRaster(c);
  // 카메라 조금 이동(보정으로 메움) → 안 굽는다 / 많이(1.25배 넘게) → 굽는다
  c.R.now += 400; c.S.map.x += 40; T.applyTilt();
  assert.equal(c.R.rasters.length, 0, '조금 움직이면 GPU 보정만');
  c.S.map.s *= 1.4; T.applyTilt();
  assert.equal(c.R.rasters.length, 1, '많이 확대하면 다시 굽는다');
  await finishRaster(c);
  // 멈춰도(정확 경로) 같은 그림(같은 카메라·내용·해상도)이면 다시 안 굽는다
  T.lite = false; T.applyTilt();
  assert.equal(c.R.rasters.length, 0);
  // Alt 줌 드래그(저해상 0.5) → 놓으면 고해상 — 같은 장면을 선명하게 바꿀 땐 앞 그림과 짧게 섞는다(GL)
  T.drag(true); T.applyTilt();
  assert.equal(c.R.rasters.length, 1); await finishRaster(c);
  assert.equal(T.tex.q, 0.5);
  T.drag(false); T.applyTilt();
  assert.equal(c.R.rasters.length, 1); await finishRaster(c);
  assert.equal(T.tex.q, 1);
  assert.ok(c.R.lastV.prev && c.R.lastV.a < 0.5, '교체 직후 = 앞 그림 위에 새 그림이 막 덮이기 시작');
  c.R.now += 1000; T.applyTilt();
  assert.equal(c.R.lastV.prev, null); assert.equal(c.R.lastV.a, 1); assert.ok(c.R.dropped >= 1, '섞기가 끝나면 앞 그림 반납');
  // 멈춘 화면은 카메라가 조금만 달라도 정확히
  c.S.map.x += 3; T.applyTilt();
  assert.equal(c.R.rasters.length, 1);
  await finishRaster(c);
  // _tiltRasterSig = null(타일 도착·불러오기) → 꼭 다시
  T.forceNull(); T.applyTilt();
  assert.equal(c.R.rasters.length, 1);
  assert.equal(T.fit.classList.contains('mapTilt'), true, '다시 굽는 동안에도 앞 그림을 보인다(같은 진입)');
});

test('태풍: 무거운 바탕은 한 번 굽고, 재생 중 경로 진행이 바뀌면 경로 레이어만 다시 굽는다(바탕은 내용·VF·많이 움직였을 때만)', async () => {
  const c = viewCtx(), T = c.T; c.R.ty = true;
  c.S.map3d = { on: 1, rx: 20, ry: 0, rz: 0, persp: 2.2 }; T.applyTilt();
  assert.equal(JSON.stringify(await finishRaster(c)), JSON.stringify([['L_bg', 'L_sea', 'L_map', 'L_boxes', 'L_mtn'], ['L_typhoon']]), '처음 = 바탕 + 경로');
  assert.ok(T.base);
  T.lite = true;
  T.animBump(); c.R.now += 400; T.applyTilt();
  assert.equal(JSON.stringify(await finishRaster(c)), JSON.stringify([['L_typhoon']]), '경로 진행만 바뀜 → 경로 레이어만');
  c.S.map.x += 30; T.animBump(); c.R.now += 400; T.applyTilt();
  assert.equal(JSON.stringify(await finishRaster(c)), JSON.stringify([['L_typhoon']]), '카메라 조금 이동 → 바탕은 옮겨 그리고 경로만');
  c.S.map.s *= 1.5; T.animBump(); c.R.now += 400; T.applyTilt();
  assert.equal(JSON.stringify(await finishRaster(c)), JSON.stringify([['L_bg', 'L_sea', 'L_map', 'L_boxes', 'L_mtn'], ['L_typhoon']]), '많이 확대 → 바탕도 다시');
  T.bump(); c.R.now += 400; T.applyTilt();
  assert.equal(JSON.stringify(await finishRaster(c)), JSON.stringify([['L_bg', 'L_sea', 'L_map', 'L_boxes', 'L_mtn'], ['L_typhoon']]), '바탕 내용이 바뀜(편집) → 바탕도 다시');
  // 시도군 지도는 나누지 않는다(칠이 바탕 레이어에 있다)
  c.R.ty = false; T.animBump(); c.R.now += 400; T.applyTilt();
  assert.equal((await finishRaster(c)).length, 1);
  assert.equal(T.base, null, '태풍이 아니면 바탕 그림 반납');
});

test('폴백: GL을 못 쓰면 #camCanvas를 CSS 3D로(예전 경로), 컨텍스트를 잃으면 그 자리에서 CSS로', async () => {
  const c = viewCtx({ gl: false }), T = c.T;
  c.S.map3d = { on: 1, rx: 20, ry: 0, rz: 5, persp: 2.2 }; T.applyTilt();
  assert.equal(c.els['#camCanvas'].style.display, 'none', '그림 전엔 숨김(게이트)');
  await finishRaster(c);
  assert.equal(c.els['#camCanvas'].style.display, '');
  assert.match(c.els['#camCanvas'].style.transform, /^rotateX\(20deg\) rotateY\(0deg\) rotateZ\(5deg\)$/);
  assert.ok(String(c.els['#camClip'].style.perspective).endsWith('px'));
  assert.equal(c.els['#camGL'].style.display, 'none');
  // GL로 그리다가 잃으면 → CSS
  const g = viewCtx(), U = g.T;
  g.S.map3d = { on: 1, rx: 20, ry: 0, rz: 5, persp: 2.2 }; U.applyTilt(); await finishRaster(g);
  assert.equal(g.els['#camGL'].style.display, '');
  g.R.gl.lost = true; U.applyTilt();
  assert.equal(g.els['#camGL'].style.display, 'none');
  assert.equal(g.els['#camCanvas'].style.display, '', '잃으면 그림 버퍼를 CSS로 바로 보인다');
  assert.equal(U.fit.classList.contains('mapTilt'), true);
  g.R.gl.lost = false; g.R.gl.has = false; U.applyTilt();
  assert.equal(g.els['#camGL'].style.display, '', '되찾으면 다시 GL');
  assert.equal(g.R.gl.has, true, '그림 버퍼에서 다시 올린다');
});

test('GPU 리셋: 그림 버퍼(2D)를 잃으면 빈 그림 대신 평면 지도, 잃은 동안 안 굽고 되찾으면 다시 굽는다 / 타일 도착은 태풍 바탕도 다시 / 타임라인을 닫으면 GL 텍스처 반납', async () => {
  const c = viewCtx(), T = c.T;
  c.S.map3d = { on: 1, rx: 20, ry: 0, rz: 5, persp: 2.2 }; T.applyTilt(); await finishRaster(c);
  assert.equal(T.fit.classList.contains('mapTilt'), true);
  assert.ok(c.R.ls.contextlost && c.R.ls.contextrestored, '그림 버퍼의 잃음·되찾음을 듣는다');
  // GPU 프로세스가 죽음 → 2D 그림 버퍼 내용이 사라진다(실측) → 빈 바다 대신 평면 지도, 굽지 않음
  c.R.bufLost = true; c.R.ls.contextlost();
  assert.equal(T.fit.classList.contains('mapTilt'), false, '빈 그림을 기울여 보이지 않는다(평면 지도)');
  assert.equal(c.R.rasters.length, 0, '잃은 동안은 안 굽는다');
  T.applyTilt(); assert.equal(c.R.rasters.length, 0);
  // 되찾음 → 다시 굽고, 오면 기울인 지도
  c.R.bufLost = false; c.R.ls.contextrestored();
  assert.equal(c.R.rasters.length, 1, '되찾으면 다시 굽는다');
  await finishRaster(c);
  assert.equal(T.fit.classList.contains('mapTilt'), true);
  // 굽는 사이에 잃으면 그 그림은 그림으로 치지 않는다
  T.bump(); T.applyTilt(); assert.equal(c.R.rasters.length, 1);
  const before = T.tex; c.R.bufLost = true; await finishRaster(c);
  assert.equal(T.tex, before, '잃은 버퍼에 구운 그림은 버림');
  c.R.bufLost = false;
  // 굽는 사이 작업을 바꾸면(불러오기·새로 시작 = tiltInvalidate(true)) 옛 작업 그림은 버리고 새로 굽는다 — 그동안은 평면 지도
  T.bump(); T.applyTilt(); assert.equal(c.R.rasters.length, 1);
  T.tiltInvalidate(true); T.applyTilt();
  assert.equal(T.fit.classList.contains('mapTilt'), false, '옛 작업 그림을 기울여 보이지 않는다');
  c.R.rasters.splice(0).forEach((r) => r.res({})); await flush(); await flush();
  assert.equal(T.tex, null, '옛 작업 그림은 버림');
  assert.equal(c.R.rasters.length, 1, '새 작업으로 다시 굽는다');
  await finishRaster(c);
  assert.equal(T.fit.classList.contains('mapTilt'), true);
  // 태풍: 늦게 온 위성 타일(tiltInvalidate) → 바탕까지 다시
  const t = viewCtx(), U = t.T; t.R.ty = true;
  t.S.map3d = { on: 1, rx: 20, ry: 0, rz: 0, persp: 2.2 }; U.applyTilt(); await finishRaster(t);
  U.tiltInvalidate(); U.applyTilt();
  assert.equal(JSON.stringify(await finishRaster(t)), JSON.stringify([['L_bg', 'L_sea', 'L_map', 'L_boxes', 'L_mtn'], ['L_typhoon']]), '타일이 든 바탕을 다시 굽는다');
  // 평면에서 버린 그림은 다음 진입에 쓰지 않는다(게이트)
  t.S.map3d = { on: 0, rx: 0, ry: 0, rz: 0 }; U.applyTilt(); U.tiltInvalidate();
  t.S.map3d = { on: 1, rx: 5, ry: 0, rz: 0, persp: 2.2 }; U.applyTilt();
  assert.equal(U.fit.classList.contains('mapTilt'), false);
  await finishRaster(t);
  // 타임라인을 닫고 평면이면 GL 텍스처(약 100MB) 반납 → 다시 기울이면 그림 버퍼에서 다시 올린다
  const up0 = t.R.uploads;
  t.els['#timeline'].classList.remove('on'); t.S.map3d = { on: 0, rx: 0, ry: 0, rz: 0 }; U.applyTilt();
  assert.equal(t.R.freed, 1); assert.equal(t.R.gl.has, false); assert.equal(U.base, null);
  U.applyTilt(); assert.equal(t.R.freed, 1, '한 번만');
  t.els['#timeline'].classList.add('on'); t.S.map3d = { on: 1, rx: 5, ry: 0, rz: 0, persp: 2.2 }; U.applyTilt();
  assert.equal(U.fit.classList.contains('mapTilt'), true);
  assert.equal(t.R.uploads, up0 + 1, '그림 버퍼에서 다시 올림');
});

// ---------- renderAnimFrame: 재생 중 지도 내용이 바뀐 프레임만 리비전 ----------
function animCtx() {
  const ctx = {
    console, Math, S: { res: '1920x1080', base: '#888888', anim: { dur: 6, fps: 29.97, reveal: 'dissolve', tracks: [] } },
    document: { querySelectorAll: () => [] }, fit: { classList: { contains: () => true } },
    typhoonProg: null, typhoonCmpProg: null, typhoonHeadFade: 1, isTy: false,
  };
  vm.createContext(ctx);
  const names = ['anim', 'clamp01', 'cubicBezier', 'EASE_VF', 'easeVf', 'trackProg', 'camKeys', 'ANIM_START', 'ANIM_VF_ENTER_LEN', 'ANIM_FILL_LEN', '_animMapKeyLast', 'animMapKey', 'renderAnimFrame'];
  vm.runInContext(names.map(pick).join('\n') + `
    let _animFast = null, _exportingFrames = false, _mapContentRev = 0, _mapAnimRev = 0, tilts = 0;
    const isTyphoon = () => isTy;
    function brushFinalize() {} function animFastOff() { _animFast = null; } function animFastCam(t, d) { d(); }
    function renderAnimFrameBody() { _mapContentRev += 3; }   // 그리기가 렌더 함수로 리비전을 올리는 것(태풍·바다·산)
    function camActive3d() { return true; } function applyTilt() { tilts++; } function tiltPrewarmSoon() {}
    globalThis.A = { renderAnimFrame, animMapKey, get rev() { return _mapContentRev + _mapAnimRev; }, get crev() { return _mapContentRev; }, set lite(v) { _animFast = v ? {} : null; }, get tilts() { return tilts; } };`, ctx);
  return ctx;
}

test('재생 중(가속): 회전만 바뀐 프레임은 지도 리비전이 안 오른다 → 다시 안 굽는다. 칠·태풍·VF 진행은 오른다', () => {
  const c = animCtx(), A = c.A;
  A.lite = true;
  A.renderAnimFrame(0.1); const r0 = A.rev;
  const c0 = A.crev;
  for (const t of [0.13, 0.17, 0.2, 0.5, 0.9]) A.renderAnimFrame(t);
  assert.equal(A.rev, r0, '트랙 없는 구간 = 지도 그림 그대로');
  assert.equal(A.crev, c0, '그리기가 올린 바탕 리비전은 되돌린다(태풍 바탕 그림을 다시 쓰게)');
  assert.equal(A.tilts, 6, '틸트 그리기(회전)는 매 프레임');
  c.S.anim.tracks.push({ kind: 'fill', key: '#FF0000', start: 1, len: 0.8 });
  A.renderAnimFrame(0.95); const r1 = A.rev;
  A.renderAnimFrame(0.97); assert.equal(A.rev, r1, '칠 시작 전');
  A.renderAnimFrame(1.2); assert.equal(A.rev, r1 + 1, '칠 진행 중 → 다시 굽기');
  A.renderAnimFrame(1.25); assert.equal(A.rev, r1 + 2);
  A.renderAnimFrame(2.0); A.renderAnimFrame(2.5); assert.equal(A.rev, r1 + 3, '칠 끝난 뒤 그대로');
  c.S.anim.reveal = 'blinds'; A.renderAnimFrame(2.6); assert.equal(A.rev, r1 + 4, '드러내기 방식이 바뀌면 다시');
  // 태풍: 경로 진행도
  c.isTy = true; c.typhoonProg = 2.5; A.renderAnimFrame(3); const r2 = A.rev;
  A.renderAnimFrame(3.1); assert.equal(A.rev, r2, '태풍 진행도 그대로 → 그대로');
  c.typhoonProg = 2.6; A.renderAnimFrame(3.2); assert.equal(A.rev, r2 + 1);
  // 노말 VF 진입(래퍼가 지도까지 감싼다)
  c.isTy = false; c.S.res = '1920x1080-vf'; c.S.anim.tracks = []; A.renderAnimFrame(1.1); const r3 = A.rev;
  A.renderAnimFrame(1.3); assert.equal(A.rev, r3 + 1, 'VF 진입 중');
  A.renderAnimFrame(3); A.renderAnimFrame(3.5); assert.equal(A.rev, r3 + 2, 'VF 진입 끝 → 그대로');
  // 정확 경로(멈춘 프레임·추출)는 늘 다시
  A.lite = false; const r4 = A.rev; A.renderAnimFrame(3.5); assert.ok(A.rev > r4);
});
