// boot-check --eval 본문(async 함수 본문, return 으로 결과). tests/gl-basemap.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 가벼운 지도(WebGL · 시험)의 위성 사진(10-10) — 실제 앱(숨은 Electron)·실제 MapLibre, 토큰 없이: 가짜 Mapbox 주소(pk.TEST)를 넣고
// 그 그림 타일은 우리 받기(tileFetch — wcgtile:// 길)에서 합성 그림(초록 바탕 + 정해 둔 경위도의 빨간 선)으로 준다.
// 고르기·준비(위성 타일만 — 벡터 타일 안 받음)·격자 기본값·출처·실제 GPU 픽셀 정렬(화면·추출 그림, 합성 선 = 앱 좌표)·추출 그림에 위성,
// [벡터만]·되돌리기, 카메라 키 2개 렌더 전 미리 받기 뒤 프레임 렌더 중 미리 받은 것 밖 요청 0, 전부 실패 → 벡터만 + 알림, 일부 실패 → 받은 데까지, 주소 없음 안내, 다른 4모드 흔적 없음.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => document.querySelector(s);
try { closeTossModal(); } catch (e) { /* 없음 */ } try { closeCgSetup(); } catch (e) { /* 없음 */ }
for (let i = 0; i < 8; i++) { if (q('#tourWrap.on') && q('#tourClose')) q('#tourClose').click(); const x = q('#tossOv .tossX'); if (x) x.click(); await sleep(100); }
const st = Object.keys(MAP.styles).find((k) => MAP.styles[k].typhoon && !MAP.styles[k].compare);
setStyle(st); await sleep(800);
{ const so = q('#startOverlay'); if (so) so.classList.remove('on'); }
S.showGuide = 0; renderBg();
S.map.x = 860; S.map.y = 377; S.map.s = 0.307; renderMapTransform(); renderAll();   // 힌남노 샘플 첫 화면(한반도)
const out = {};
const FAKE = 'https://api.mapbox.com/styles/v1/wcgtest/fakesat/wmts?access_token=pk.TEST';
const SAT_RE = /^https:\/\/api\.mapbox\.com\/styles\/v1\/wcgtest\/fakesat\/tiles\/(\d+)\/(\d+)\/(\d+)\/(\d+)@2x\?access_token=pk\.TEST/;
// 합성 위성 그림의 빨간 선 — 지금 화면(1400, 300) 근처의 경도·위도(앱 좌표 역변환)
const inv = (x, y) => { const s = S.map.s, P = MAP.proj; const mx = (x - S.map.x) / s / P.scale + P.cx0, my = P.cy0 - (y - S.map.y) / s / P.scale; return [mx * 180 / Math.PI, (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180 / Math.PI]; };
const [LON, LAT] = inv(1400, 300).map((v) => Math.round(v * 10) / 10 + 0.03);
const SYN = { calls: [], fail: null, made: 0 };
const yt = (lat, n) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };
async function synTile(z, x, y, size) {
  const c = new OffscreenCanvas(size, size), g = c.getContext('2d'), n = 2 ** z;
  g.fillStyle = '#2a5a3a'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#ff0000';
  const px = ((LON + 180) / 360 * n - x) * size, py = (yt(LAT, n) - y) * size;
  if (px > -8 && px < size + 8) g.fillRect(px - 3, 0, 6, size);
  if (py > -8 && py < size + 8) g.fillRect(0, py - 3, size, 6);
  const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 });   // Mapbox처럼 JPEG
  SYN.made++;
  return { data: new Uint8Array(await b.arrayBuffer()), type: 'image/jpeg' };
}
const origTF = window.tileFetch;
window.tileFetch = async function (u) {
  SYN.calls.push(u);
  const m = SAT_RE.exec(u);
  if (m) {
    const [, ts, z, x, y] = m.map(Number);
    if (SYN.fail && SYN.fail(z, x, y)) throw new Error('tile http 401');
    return synTile(z, x, y, ts * 2);
  }
  return origTF(u);
};
const inl = [];
const origInl = window.glbInlineClone;
window.glbInlineClone = async function (...a) { const r = await origInl.apply(this, a); inl.push(r); return r; };
const pickBm = async (bm) => { q('#basemapBtn').click(); await sleep(120); if (q('#basemapPop').style.display === 'none') { q('#basemapBtn').click(); await sleep(120); } q(`#basemapPop .bmOpt[data-bm="${bm}"]`).click(); await sleep(250); };
const closePop = () => { q('#basemapPop').style.display = 'none'; };
const waitGl = async (ms) => { const t0 = performance.now(); while ((_glb.state === 'loading' || _glb.state === 'off') && performance.now() - t0 < ms) await sleep(100); };
const waitTiles = async (m, ms) => { const t0 = performance.now(); for (;;) { try { m.redraw(); if (m.loaded() && m.areTilesLoaded()) return true; } catch (e) { /* 스타일 전 */ } if (performance.now() - t0 > ms) return false; await sleep(60); } };
const [W, H] = RES[S.res].size;
const frame = async () => { clearExportCache(); const c = document.createElement('canvas'); c.width = W; c.height = H; await drawExportFrame(c.getContext('2d'), W, H); return c; };
const avg = (c, fx, fy) => { const d = c.getContext('2d').getImageData(Math.round(W * fx) - 3, Math.round(H * fy) - 3, 7, 7).data; const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } return s.map((v) => Math.round(v / (d.length / 4))); };
const dist = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const GREEN = [42, 90, 58], SEA = [11, 34, 64];
const corners = (c) => [avg(c, 0.93, 0.06), avg(c, 0.93, 0.94)];
// 빨간 선 무게중심(빨강 − max(초록, 파랑) − 40) — tests/gl-basemap.boot-eval.js 4-1과 같은 잣대
const centroid = (get, n) => { let s = 0, w = 0; for (let i = 0; i < n; i++) { const [r, g, b] = get(i); const v = Math.max(0, r - Math.max(g, b) - 40); s += v * (i + 0.5); w += v; } return w ? s / w : NaN; };
const errs = (at, Wd, Hd, kx, ky, oy) => {
  const e = [];
  // 세로 선(경도 LON)은 가로 선과 안 겹치는 줄들에서, 가로 선(위도 LAT)은 세로 선과 안 겹치는 칸들에서
  for (const dy of [-160, -70, 130]) { const [ax, ay] = typhoonXY(LON, LAT); const yy = ay + dy; e.push(Math.abs(centroid((i) => at(i, Math.round(yy * ky - oy)), Wd) - ax * kx)); }
  for (const dx of [-300, -120, 200]) { const [ax, ay] = typhoonXY(LON, LAT); const xx = ax + dx; e.push(Math.abs(centroid((i) => at(Math.round(xx * kx), i), Hd) - (ay * ky - oy))); }
  return +Math.max(...e).toFixed(3);
};
try {
  localStorage.setItem('wcg_mapbox_url', FAKE);
  out.line = [LON, LAT];
  // 1) 고르기 → 위성 그림 타일만 받아 준비(벡터 타일·TileJSON 안 받음)
  await pickBm('gl');
  await waitGl(30000);
  const m = _glb.live;
  out.ready = { state: _glb.state, why: _glb.why, proto: _glb.proto, ms: Math.round(_glb.readyMs), sat: !!(m && m.__sat), okSat: m ? m.__okS.sat : -1, errSat: m ? m.__errS.sat : -1,
    ofm: SYN.calls.filter((u) => u.includes('openfreemap')).length, satCalls: SYN.calls.filter((u) => SAT_RE.test(u)).length, z: [...new Set(SYN.calls.map((u) => (SAT_RE.exec(u) || [])[2]).filter(Boolean))],
    ui: q('#bmGlState').textContent, seg: [...document.querySelectorAll('#bmGlSat button.on')].map((b) => b.dataset.glsat), note: q('#bmGlSatNote').style.display,
    attr: q('#glMapAttr').textContent, bmAttr: q('#bmGlAttr').textContent, grid: typhoonGridOn(S.typhoon), eyeOff: q('#typGridEye') ? q('#typGridEye').classList.contains('off') : null,
    hidden: ['#typhoonOcean', '#typhoonLand', '#typhoonKrBase', '#typhoonRelief'].map((s) => (q(s).style.display || 'show')), glVis: getComputedStyle(q('#glMap')).visibility };
  closePop();
  if (_glb.state === 'ready' && m && m.__sat) {
    // 2) 실제 GPU 픽셀 정렬 — 합성 그림의 빨간 선(타일 좌표로 그림) = 앱 typhoonXY(화면 캔버스 기기 px · 추출 그림 출력 px)
    out.pix = {};
    { await waitTiles(m, 8000); m.redraw();
      const gl = m.painter.context.gl, cv = m.getCanvas(), Wc = cv.width, Hc = cv.height, px = new Uint8Array(Wc * Hc * 4); gl.readPixels(0, 0, Wc, Hc, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const dpr = Wc / parseFloat(cv.style.width), k = (_fitCssW || fit.clientWidth) / 1920 * dpr, top = (q('#glMapIn').__t || 0) * dpr;
      out.pix.live = errs((x, y) => { const i = ((Hc - 1 - y) * Wc + x) * 4; return [px[i], px[i + 1], px[i + 2]]; }, Wc, Hc, k, k, top);
      const ci = ((Hc - 1 - Math.round(Hc * 0.8)) * Wc + Math.round(Wc * 0.2)) * 4; out.pix.liveCol = [px[ci], px[ci + 1], px[ci + 2]]; }
    { const cam = { x: S.map.x, y: S.map.y, s: S.map.s }, vb = { x: 0, y: 0, w: 1920, h: 1080 };
      const url = await glbSnap(cam, vb, W, H, false);
      out.pix.snapOk = !!url;
      if (url) { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = W; c.height = H; const x2 = c.getContext('2d'); x2.drawImage(im, 0, 0);
        const d = x2.getImageData(0, 0, W, H).data;
        out.pix.export = errs((x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; }, W, H, W / 1920, H / 1080, 0); } }
    // 3) 추출(영상 프레임과 같은 함수) — 그림에 위성(합성 초록), 캔버스 오염 없음(toDataURL)
    inl.length = 0;
    { const c = await frame(); const [a, b] = corners(c); let durl = ''; try { durl = c.toDataURL('image/jpeg', 0.5); } catch (e) { durl = 'ERR ' + e.message; }
      out.exp = { inl: inl.includes(true) && !inl.includes(false), a, b, green: Math.max(dist(a, GREEN), dist(b, GREEN)), dataUrl: durl.slice(0, 22) }; }
    // 틸트 프레임(블리드 — 4096으로 줄여 굽기)
    inl.length = 0;
    S.map3d = { on: 1, rx: 40, ry: 0, rz: -12, persp: 2.2 }; applyTilt();
    for (let i = 0; i < 150 && !fit.classList.contains('mapTilt'); i++) await sleep(100);
    for (let i = 0; i < 100 && _camRasterBusy; i++) await sleep(100);
    out.exp.tiltPreview = inl.includes(true);
    inl.length = 0; await frame(); out.exp.tiltFrame = inl.includes(true) && !inl.includes(false);
    S.map3d = { on: 0, rx: 0, ry: 0, rz: 0, persp: 2.2 }; applyTilt(); await sleep(300);
    // 4) [벡터만] — 자체 스타일(OpenFreeMap 벡터 타일)로, 격자 기본 켬, 출처 OpenFreeMap. 되돌리기 → 위성 사진
    { const ofm0 = SYN.calls.filter((u) => u.includes('openfreemap')).length;
      q('#basemapBtn').click(); await sleep(150);
      q('#bmGlSat button[data-glsat="0"]').click(); await sleep(150);
      await waitTiles(_glb.live, 15000);
      out.vec = { glSat: S.typhoon.glSat, sat: _glb.live.__sat, okOmt: _glb.live.__okS.omt, ofm: SYN.calls.filter((u) => u.includes('openfreemap')).length - ofm0, grid: typhoonGridOn(S.typhoon),
        eyeOff: q('#typGridEye') ? q('#typGridEye').classList.contains('off') : null, attr: q('#glMapAttr').textContent, seg: [...document.querySelectorAll('#bmGlSat button.on')].map((b) => b.dataset.glsat), state: _glb.state };
      closePop();
      if (_glb.live.__okS.omt > 0) { inl.length = 0; const c = await frame(); const [a, b] = corners(c); out.vec.inl = inl.includes(true); out.vec.sea = Math.max(dist(a, SEA), dist(b, SEA)); }
      undo(); await sleep(200); await waitTiles(_glb.live, 8000);
      out.undo = { glSat: S.typhoon.glSat, sat: _glb.live.__sat, grid: typhoonGridOn(S.typhoon) }; }
    // 5) 렌더 전 미리 받기 + 프레임 — 카메라 키 2개(첫 화면 → 한반도 127.5E·36N을 (960,540)에 s 1.25)
    { const m0 = { x: S.map.x, y: S.map.y, s: S.map.s };
      const [kx, ky] = projLL(127.5, 36);
      const keys = camKeys(); keys.length = 0;
      keys.push({ id: 'gs1', t: 0, x: m0.x, y: m0.y, s: m0.s, rx: 0, ry: 0, rz: 0 }, { id: 'gs2', t: 2, x: 960 - kx * 1.25, y: 540 - ky * 1.25, s: 1.25, rx: 0, ry: 0, rz: 0 });
      out.keys = keys.map((k) => [Math.round(k.x), Math.round(k.y), k.s]);
      const fps = 30, n = 90;
      const c0 = SYN.calls.length;
      const tP = performance.now();
      _exportingFrames = true;
      try {
        await prefetchRenderTiles(n, fps);
        const pre = SYN.calls.slice(c0); const P = new Set(pre);
        out.pre = { n: pre.length, uniq: P.size, ms: Math.round(performance.now() - tP), z: [...new Set(pre.map((u) => +(SAT_RE.exec(u) || [])[2]))].sort((a, b) => a - b) };
        const c1 = SYN.calls.length; inl.length = 0;
        const tF = performance.now();
        for (const i of [0, 15, 30, 45, 60, 75, 90]) { renderAnimFrame(i / fps); await frame(); }
        const during = SYN.calls.slice(c1);
        out.frames = { calls: during.length, extra: during.filter((u) => !P.has(u)).length, extraZ: [...new Set(during.filter((u) => !P.has(u)).map((u) => (SAT_RE.exec(u) || ['', '', '?'])[2] + '/' + ((SAT_RE.exec(u) || [])[3] || '') + '/' + ((SAT_RE.exec(u) || [])[4] || '')))].slice(0, 8),
          inl: inl.filter((v) => v === true).length, fail: inl.filter((v) => v === false).length, ms: Math.round(performance.now() - tF) };
      } finally { animOff(); keys.length = 0; }
      S.map.x = m0.x; S.map.y = m0.y; S.map.s = m0.s; renderMapTransform(); renderAll(); await sleep(200); }
    // 6) 위성 타일 전부 실패(토큰·URL 제한 흉내 — 401) → 벡터만 + 알림 + 까닭 한 줄. 다시 '위성 사진' → 다시 받음
    { SYN.fail = () => true;
      glbRetry(); await waitGl(30000); await sleep(300);
      out.allFail = { state: _glb.state, why: _glb.why, satBad: !!_glb.satBad, sat: _glb.live ? _glb.live.__sat : null, status: q('#status').textContent, note: (glbUi(), q('#bmGlSatNote').textContent), grid: typhoonGridOn(S.typhoon), attr: q('#glMapAttr').textContent };
      if (_glb.state === 'ready') { inl.length = 0; const c = await frame(); const [a, b] = corners(c); out.allFail.inl = inl.includes(true); out.allFail.sea = Math.max(dist(a, SEA), dist(b, SEA)); }
      SYN.fail = null;
      q('#basemapBtn').click(); await sleep(150); q('#bmGlSat button[data-glsat="1"]').click(); await sleep(200); closePop();
      for (let i = 0; i < 100 && !(_glb.live && _glb.live.__sat && _glb.live.__okS.sat > 0); i++) await sleep(100);
      out.reSat = { sat: _glb.live ? _glb.live.__sat : null, ok: _glb.live ? _glb.live.__okS.sat : 0, satBad: _glb.satBad, state: _glb.state }; }
    // 7) 일부 실패(바둑판 칸 하나 걸러) → 화면은 받은 데까지, 추출은 다시 해 보고 받은 데까지(바다색 칸 + 알림) — 파란 지도로 안 튄다
    { SYN.fail = (z, x, y) => (x + y) % 2 === 1;
      glbRetry(); await waitGl(30000);
      out.part = { state: _glb.state, sat: _glb.live ? _glb.live.__sat : null, ok: _glb.live ? _glb.live.__okS.sat : 0, err: _glb.live ? _glb.live.__errS.sat : 0 };
      inl.length = 0; const c = await frame(); out.part.inl = inl.includes(true) && !inl.includes(false); out.part.status = q('#status').textContent;
      SYN.fail = null; glbRetry(); await waitGl(30000); }
    // 8) Mapbox 주소 없음 → 벡터만 + 안내(격자 기본 켬)
    { localStorage.removeItem('wcg_mapbox_url'); renderTyphoon(); glbUi(); await sleep(200);
      out.noUrl = { sat: _glb.live ? _glb.live.__sat : null, note: q('#bmGlSatNote').textContent, noteShown: q('#bmGlSatNote').style.display !== 'none', grid: typhoonGridOn(S.typhoon), attr: q('#glMapAttr').textContent };
      localStorage.setItem('wcg_mapbox_url', FAKE); renderTyphoon(); await sleep(200); }
    // 9) 저장·불러오기 — glSat이 작업에 함께
    { S.typhoon.glSat = 0; const saved = JSON.parse(JSON.stringify(stateForSave())); out.save = { glSat: saved.typhoon.glSat };
      S.typhoon.glSat = 1; loadProjectData(saved, null); await sleep(800); out.save.reload = S.typhoon.glSat; out.save.sat = _glb.live ? _glb.live.__sat : null;
      const old = JSON.parse(JSON.stringify(saved)); delete old.typhoon.glSat; loadProjectData(old, null); await sleep(800);
      out.save.old = glbSatPref(S.typhoon); out.save.oldSat = _glb.live ? _glb.live.__sat : null; }
  }
  // 10) 다른 4모드 — GL 흔적 없음, 격자 규칙 그대로(위성 둘 = 끔 칸)
  out.old = {};
  for (const bm of ['blue', 'satellite', 'satdark', 'mapbox']) {
    await pickBm(bm); closePop(); await sleep(250);
    inl.length = 0; await frame();
    out.old[bm] = { glMap: q('#glMap').style.display, marks: q('#L_bg').querySelectorAll('[data-glb],[data-glbhid],[data-glbimg]').length, img: inl.length, gridSat: typhoonGridIsSat(S.typhoon) };
  }
} finally { window.tileFetch = origTF; window.glbInlineClone = origInl; try { localStorage.removeItem('wcg_mapbox_url'); } catch (e) { /* 없음 */ } }
return out;
