// boot-check --eval 본문(async 함수 본문, return 으로 결과). tests/gl-basemap.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 'Mapbox 실시간 타일'도 WebGL(10-12) — 실제 앱(숨은 Electron)·실제 MapLibre, 토큰 없이: 가짜 Mapbox 주소(Studio Share → Third party → CARTO 꼴, pk.TEST)를 넣고
// 그 그림 타일은 우리 받기(tileFetch — wcgtile:// 길)에서 합성 그림(보라 바탕 + 정해 둔 경위도의 빨간 선)으로 준다(실제 Mapbox 요청 없음).
// 주소 없음 → 파란 지도 + 안내(엔진·타일 안 받음)·주소 안내 펼침, 못 알아보는 주소 → 까닭 한 줄·파란 지도, 주소 [적용] → WebGL 준비(그림 타일만 — 벡터·TileJSON 안 받음),
// 정렬(끌기·휠·재생 프레임 — MapLibre 투영 = 앱 typhoonXY, 실제 GPU 픽셀), 추출(평면·틸트 미리보기·틸트 프레임·AE 블리드)·캔버스 오염 없음,
// 카메라 키 2개 렌더 전 미리 받기 뒤 프레임 렌더 중 미리 받은 것 밖 요청 0, 가벼운 지도 ↔ Mapbox 바꾸기·되돌리기, 타일 401 → 파란 지도(벡터로 안 바꿈)·다시 시도,
// 일부 실패 → 받은 데까지, WebGL 못 씀 → 파란 지도, 노말 VF → 파란 지도, 저장·옛 작업(basemap 'mapbox') 열기, 다른 3모드 흔적 없음.
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
const FAKE = 'https://api.mapbox.com/styles/v1/wcgtest/fakembx/tiles/256/{z}/{x}/{y}@2x?access_token=pk.TEST';   // CARTO 꼴 → Static Tiles 512 @2x
const MB_RE = /^https:\/\/api\.mapbox\.com\/styles\/v1\/wcgtest\/fakembx\/tiles\/(\d+)\/(\d+)\/(\d+)\/(\d+)@2x\?access_token=pk\.TEST/;
const inv = (x, y) => { const s = S.map.s, P = MAP.proj; const mx = (x - S.map.x) / s / P.scale + P.cx0, my = P.cy0 - (y - S.map.y) / s / P.scale; return [mx * 180 / Math.PI, (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180 / Math.PI]; };
const [LON, LAT] = inv(1400, 300).map((v) => Math.round(v * 10) / 10 + 0.03);
const SYN = { calls: [], fail: null };
const yt = (lat, n) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };
async function synTile(z, x, y, size) {
  const c = new OffscreenCanvas(size, size), g = c.getContext('2d'), n = 2 ** z;
  g.fillStyle = '#5a3a7a'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#ff0000';
  const px = ((LON + 180) / 360 * n - x) * size, py = (yt(LAT, n) - y) * size;
  if (px > -8 && px < size + 8) g.fillRect(px - 3, 0, 6, size);
  if (py > -8 && py < size + 8) g.fillRect(0, py - 3, size, 6);
  const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  return { data: new Uint8Array(await b.arrayBuffer()), type: 'image/jpeg' };
}
const origTF = window.tileFetch;
window.tileFetch = async function (u) {
  SYN.calls.push(u);
  const m = MB_RE.exec(u);
  if (m) {
    const [, ts, z, x, y] = m.map(Number);
    if (SYN.fail && SYN.fail(z, x, y, u)) throw new Error('tile http 401');
    return synTile(z, x, y, ts * 2);
  }
  if (/^https:\/\/api\.mapbox\.com\//.test(u)) throw new Error('tile http 404');   // 그 밖 Mapbox 주소는 실제로 안 받는다
  return origTF(u);
};
const inl = [];
const origInl = window.glbInlineClone;
window.glbInlineClone = async function (...a) { const r = await origInl.apply(this, a); inl.push(r); return r; };
const opened = [];
const origOpen = window.open;
window.open = (u) => { opened.push(String(u)); return null; };   // [열기](Mapbox Studio) — 점검이 실제 브라우저를 띄우지 않게
const warns = [];
const origSt = window.status;
window.status = function (msg, a, kind) { if (kind === 'warn') warns.push(String(msg)); return origSt.apply(this, arguments); };
const openPop = async () => { if (q('#basemapPop').style.display === 'none') { q('#basemapBtn').click(); await sleep(150); } };
const pickBm = async (bm) => { await openPop(); q(`#basemapPop .bmOpt[data-bm="${bm}"]`).click(); await sleep(250); };
const closePop = () => { q('#basemapPop').style.display = 'none'; };
const waitGl = async (ms) => { const t0 = performance.now(); while ((_glb.state === 'loading' || _glb.state === 'off') && performance.now() - t0 < ms) await sleep(100); };
const waitTiles = async (m, ms) => { const t0 = performance.now(); for (;;) { try { m.redraw(); if (m.loaded() && m.areTilesLoaded()) return true; } catch (e) { /* 스타일 전 */ } if (performance.now() - t0 > ms) return false; await sleep(60); } };
const [W, H] = RES[S.res].size;
const frame = async () => { clearExportCache(); const c = document.createElement('canvas'); c.width = W; c.height = H; await drawExportFrame(c.getContext('2d'), W, H); return c; };
const avg = (c, fx, fy) => { const d = c.getContext('2d').getImageData(Math.round(W * fx) - 3, Math.round(H * fy) - 3, 7, 7).data; const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } return s.map((v) => Math.round(v / (d.length / 4))); };
const dist = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const PURPLE = [90, 58, 122];
const corners = (c) => [avg(c, 0.93, 0.06), avg(c, 0.93, 0.94)];
const blueShown = () => q('#typhoonOcean').style.display !== 'none' && q('#typhoonLand').style.display !== 'none';
const glHidden = () => q('#glMap').style.display === 'none' || getComputedStyle(q('#glMap')).visibility === 'hidden';
const ui = () => ({ box: q('#bmMbxBox').style.display, glBox: q('#bmGlBox').style.display, stText: q('#bmMbxState').textContent, stShown: q('#bmMbxState').style.display, retry: q('#bmMbxRetry').style.display,
  whyLine: q('#bmMbxWhy').style.display === 'none' ? '' : q('#bmMbxWhy').textContent, help: !q('#bmMbxHelp').hidden, helpExp: q('#bmMbxHelpBtn').getAttribute('aria-expanded') });
const alignNow = () => {
  const m = _glb.live; if (!m) return 999;
  const k = (_fitCssW || fit.clientWidth) / 1920, top = q('#glMapIn').__t || 0;
  let worst = 0;
  for (const [lo, la] of [[127, 37.5], [140, 35], [120, 23], [150, 10], [110, 45], [175, 30], [100, 5]]) {
    const p = m.project([lo, la]), [x, y] = typhoonXY(lo, la);
    worst = Math.max(worst, Math.hypot(p.x - x * k, p.y + top - y * k));
  }
  return +worst.toFixed(4);
};
const centroid = (get, n) => { let s = 0, w = 0; for (let i = 0; i < n; i++) { const [r, g, b] = get(i); const v = Math.max(0, r - Math.max(g, b) - 40); s += v * (i + 0.5); w += v; } return w ? s / w : NaN; };
const errs = (at, Wd, Hd, kx, ky, oy) => {
  const e = [];
  for (const dy of [-160, -70, 130]) { const [ax, ay] = typhoonXY(LON, LAT); const yy = ay + dy; e.push(Math.abs(centroid((i) => at(i, Math.round(yy * ky - oy)), Wd) - ax * kx)); }
  for (const dx of [-300, -120, 200]) { const [ax, ay] = typhoonXY(LON, LAT); const xx = ax + dx; e.push(Math.abs(centroid((i) => at(Math.round(xx * kx), i), Hd) - (ay * ky - oy))); }
  return +Math.max(...e).toFixed(3);
};
try {
  localStorage.removeItem('wcg_mapbox_url');
  out.libBefore = !!window.maplibregl;
  // 1) 주소 없음 → 엔진·타일 안 받고 곧바로 파란 지도 + 안내, 주소 칸·안내 펼침(다시 시도 단추 없음)
  { const c0 = SYN.calls.length; warns.length = 0;
    await pickBm('mapbox'); await sleep(200);
    out.noUrl = { state: _glb.state, why: _glb.why, mode: _glb.mode, blue: blueShown(), glHidden: glHidden(), calls: SYN.calls.length - c0, lib: !!window.maplibregl, warn: warns.slice(-1)[0] || '',
      dataGlb: q('#bgMapT').getAttribute('data-glb'), ...ui() };
    { const p = q('#basemapPop'), rr = p.getBoundingClientRect(); out.noUrl.popFits = rr.bottom <= window.innerHeight + 0.5; out.noUrl.popScroll = p.scrollHeight > p.clientHeight; }   // 안내를 펼쳐도 창 안(넘치면 안에서 스크롤)
    // [?] 접기·펼치기(사용자가 고른 대로), Studio [열기]
    q('#bmMbxHelpBtn').click(); await sleep(50); out.noUrl.helpToggled = !q('#bmMbxHelp').hidden;
    q('#bmMbxHelpBtn').click(); await sleep(50); out.noUrl.helpBack = !q('#bmMbxHelp').hidden;
    q('#bmMbxStudio').click(); out.noUrl.opened = opened.slice(); }
  // 2) 못 알아보는 주소 — 고치는 동안 까닭 한 줄, [적용]하면 파란 지도 + 까닭
  { const urlIn = q('#bmMbxUrl'), c0 = SYN.calls.length; warns.length = 0;
    const typed = {};
    for (const [k, v] of [['noTok', 'https://api.mapbox.com/styles/v1/wcgtest/fakembx/wmts'], ['sk', 'https://api.mapbox.com/styles/v1/wcgtest/fakembx/wmts?access_token=sk.SECRET'],
      ['studio', 'https://studio.mapbox.com/styles/wcgtest/fakembx/edit/'], ['ok', FAKE], ['empty', '']]) { urlIn.value = v; urlIn.dispatchEvent(new Event('input')); typed[k] = ui().whyLine; }
    urlIn.value = 'https://api.mapbox.com/styles/v1/wcgtest/fakembx/wmts'; urlIn.dispatchEvent(new Event('input'));
    q('#bmMbxApply').click(); await sleep(300);
    out.bad = { typed, state: _glb.state, why: _glb.why, blue: blueShown(), calls: SYN.calls.length - c0, warn: warns.slice(-1)[0] || '', stored: localStorage.getItem('wcg_mapbox_url'), ...ui() }; }
  // 3) 쓸 수 있는 주소 [적용] → WebGL 준비(그림 타일만 — 벡터 타일·TileJSON 안 받음), 파란 지도 숨김, 출처, 격자 규칙(옛 Mapbox 모드 그대로 — 켬)
  { const urlIn = q('#bmMbxUrl'), c0 = SYN.calls.length;
    urlIn.value = FAKE; urlIn.dispatchEvent(new Event('input'));
    q('#bmMbxApply').click(); await sleep(100);
    out.applyLoading = { state: _glb.state, blue: blueShown() };
    await waitGl(30000); await sleep(150);
    const m = _glb.live, calls = SYN.calls.slice(c0);
    out.ready = { state: _glb.state, why: _glb.why, mode: _glb.mode, basemap: S.typhoon.basemap, proto: _glb.proto, ms: Math.round(_glb.readyMs), sat: !!(m && m.__sat), okSat: m ? m.__okS.sat : -1, errSat: m ? m.__errS.sat : -1,
      ofm: calls.filter((u) => u.includes('openfreemap')).length, mbx: calls.filter((u) => MB_RE.test(u)).length, ts: [...new Set(calls.map((u) => (MB_RE.exec(u) || [])[1]).filter(Boolean))],
      cb: calls.filter((u) => MB_RE.test(u)).every((u) => /&_cb=\d+$/.test(u)),
      hidden: ['#typhoonOcean', '#typhoonLand', '#typhoonKrBase', '#typhoonRelief'].map((s) => (q(s).style.display || 'show') + ':' + q(s).getAttribute('data-glbhid')),
      dataGlb: q('#bgMapT').getAttribute('data-glb'), glVis: getComputedStyle(q('#glMap')).visibility, attr: q('#glMapAttr').textContent, attrShown: q('#glMapAttr').style.display,
      grid: typhoonGridOn(S.typhoon), gridSat: typhoonGridIsSat(S.typhoon), btnSat: q('#basemapBtn').classList.contains('sat'), warns: warns.length, ...ui() }; }
  closePop();
  if (_glb.state === 'ready') {
    const m = _glb.live;
    // 4) 정렬 — MapLibre 투영 = 앱 typhoonXY(화면·끌기·휠·재생 프레임 같은 프레임), 실제 GPU 픽셀(합성 그림의 빨간 선)
    out.align = { live: alignNow() };
    { setFlatPanLOD(true); const base = { x: S.map.x, y: S.map.y, s: S.map.s }; S.map.x += 137; S.map.y -= 41; lightPanZoom(base); out.align.drag = alignNow();
      { const r = S.map.s / (base.s || 1); shiftMapAttached(S.map.x - base.x * r, S.map.y - base.y * r, r); } renderMapTransform(); setFlatPanLOD(false); }
    { setFlatPanLOD(true); const base = { x: S.map.x, y: S.map.y, s: S.map.s }; zoomMapAbout(960, 540, S.map.s * 1.3); lightPanZoom(base); out.align.zoom = alignNow();
      { const r = S.map.s / (base.s || 1); shiftMapAttached(S.map.x - base.x * r, S.map.y - base.y * r, r); } renderMapTransform(); renderStrokeScale(); setFlatPanLOD(false); }
    { const m0 = { x: S.map.x, y: S.map.y, s: S.map.s }; S.map.x += 60; S.map.s *= 0.9; _tyLiteDraw = true;
      try { renderTyphoon(); out.align.anim = alignNow(); } finally { _tyLiteDraw = false; S.map.x = m0.x; S.map.y = m0.y; S.map.s = m0.s; } renderMapTransform(); }
    S.map.x = 860; S.map.y = 377; S.map.s = 0.307; renderMapTransform(); renderAll(); await sleep(200);
    out.pix = {};
    { await waitTiles(m, 8000); m.redraw();
      const gl = m.painter.context.gl, cv = m.getCanvas(), Wc = cv.width, Hc = cv.height, px = new Uint8Array(Wc * Hc * 4); gl.readPixels(0, 0, Wc, Hc, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const dpr = Wc / parseFloat(cv.style.width), k = (_fitCssW || fit.clientWidth) / 1920 * dpr, top = (q('#glMapIn').__t || 0) * dpr;
      out.pix.live = errs((x, y) => { const i = ((Hc - 1 - y) * Wc + x) * 4; return [px[i], px[i + 1], px[i + 2]]; }, Wc, Hc, k, k, top); }
    { const cam = { x: S.map.x, y: S.map.y, s: S.map.s }, vb = { x: 0, y: 0, w: 1920, h: 1080 };
      const url = await glbSnap(cam, vb, W, H, false);
      out.pix.snapOk = !!url;
      if (url) { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = W; c.height = H; const x2 = c.getContext('2d'); x2.drawImage(im, 0, 0);
        const d = x2.getImageData(0, 0, W, H).data;
        out.pix.export = errs((x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; }, W, H, W / 1920, H / 1080, 0); } }
    // 5) 추출 — 평면 프레임(영상 프레임과 같은 함수)·캔버스 오염 없음, 틸트 미리보기·틸트 프레임, AE 블리드 영역
    inl.length = 0;
    { const c = await frame(); const [a, b] = corners(c); let durl = ''; try { durl = c.toDataURL('image/jpeg', 0.5); } catch (e) { durl = 'ERR ' + e.message; }
      out.exp = { inl: inl.includes(true) && !inl.includes(false), a, b, purple: Math.max(dist(a, PURPLE), dist(b, PURPLE)), dataUrl: durl.slice(0, 22) }; }
    inl.length = 0;
    S.map3d = { on: 1, rx: 40, ry: 0, rz: -12, persp: 2.2 }; applyTilt();
    for (let i = 0; i < 150 && !fit.classList.contains('mapTilt'); i++) await sleep(100);
    for (let i = 0; i < 100 && _camRasterBusy; i++) await sleep(100);
    out.exp.tiltPreview = inl.includes(true); out.exp.tiltHidden = getComputedStyle(q('#glMap')).visibility;
    inl.length = 0; await frame(); out.exp.tiltFrame = inl.includes(true) && !inl.includes(false);
    S.map3d = { on: 0, rx: 0, ry: 0, rz: 0, persp: 2.2 }; applyTilt(); await sleep(300);
    inl.length = 0; await svgBlob((c) => keepLayers(c, ['L_bg']), false, { box: { x: -300, y: -150, w: 2520, h: 1380 } }); out.exp.box = inl[0] === true;
    // 6) 렌더 전 미리 받기 + 프레임 — 카메라 키 2개(첫 화면 → 한반도 127.5E·36N을 (960,540)에 s 1.25), 미리 받은 것 밖 요청 0
    { const m0 = { x: S.map.x, y: S.map.y, s: S.map.s };
      const [kx, ky] = projLL(127.5, 36);
      const keys = camKeys(); keys.length = 0;
      keys.push({ id: 'gm1', t: 0, x: m0.x, y: m0.y, s: m0.s, rx: 0, ry: 0, rz: 0 }, { id: 'gm2', t: 2, x: 960 - kx * 1.25, y: 540 - ky * 1.25, s: 1.25, rx: 0, ry: 0, rz: 0 });
      const fps = 30, n = 90, c0 = SYN.calls.length;
      _exportingFrames = true;
      try {
        await prefetchRenderTiles(n, fps);
        const pre = SYN.calls.slice(c0); const P = new Set(pre);
        out.pre = { n: pre.length, uniq: P.size, mbx: pre.filter((u) => MB_RE.test(u)).length, z: [...new Set(pre.map((u) => +(MB_RE.exec(u) || [])[2]))].sort((a, b) => a - b) };
        const c1 = SYN.calls.length; inl.length = 0;
        for (const i of [0, 15, 30, 45, 60, 75, 90]) { renderAnimFrame(i / fps); await frame(); }
        const during = SYN.calls.slice(c1);
        out.frames = { calls: during.length, extra: during.filter((u) => !P.has(u)).length, inl: inl.filter((v) => v === true).length, fail: inl.filter((v) => v === false).length };
      } finally { animOff(); keys.length = 0; }
      S.map.x = m0.x; S.map.y = m0.y; S.map.s = m0.s; renderMapTransform(); renderAll(); await sleep(200); }
    // 7) 가벼운 지도로 바꾸기 → 지도를 새로 만들어(배경 종류가 바뀜) 위성 사진으로 준비, 되돌리기 → 다시 Mapbox 실시간 타일
    { await pickBm('gl'); out.toGl = { loadingBlue: blueShown(), stateNow: _glb.state }; closePop();
      await waitGl(30000);
      out.toGl = { ...out.toGl, state: _glb.state, mode: _glb.mode, sat: _glb.live ? _glb.live.__sat : null, attr: q('#glMapAttr').textContent, box: q('#bmMbxBox').style.display, glBox: q('#bmGlBox').style.display, stShown: q('#bmMbxState').style.display };
      undo(); await sleep(150); out.undo = { basemap: S.typhoon.basemap, loadingBlue: blueShown() };
      await waitGl(30000); await sleep(100);
      out.undo = { ...out.undo, state: _glb.state, mode: _glb.mode, attr: q('#glMapAttr').textContent, dataGlb: q('#bgMapT').getAttribute('data-glb') }; }
    // 8) 타일을 한 장도 못 받음(401 — 토큰·URL 제한 흉내) → 벡터로 안 바꾸고 파란 지도 + 까닭 + 다시 시도, 그 뒤 다시 시도 → 준비
    { SYN.fail = () => true; warns.length = 0; const c0 = SYN.calls.length;
      glbRetry(); await waitGl(30000); await sleep(200); await openPop();
      out.fail = { state: _glb.state, why: _glb.why, blue: blueShown(), glHidden: glHidden(), ofm: SYN.calls.slice(c0).filter((u) => u.includes('openfreemap')).length, warn: warns.slice(-1)[0] || '', nWarn: warns.length,
        dataGlb: q('#bgMapT').getAttribute('data-glb'), ...ui() };
      inl.length = 0; await frame(); out.fail.inl = inl.length;
      SYN.fail = null; q('#bmMbxRetry').click(); await sleep(100); closePop(); await waitGl(30000);
      out.retry = { state: _glb.state, ok: _glb.live ? _glb.live.__okS.sat : 0 }; }
    // 9) 일부 실패(바둑판 칸 하나 걸러) → 화면은 받은 데까지, 추출도 받은 데까지(파란 지도로 안 튐)
    { SYN.fail = (z, x, y) => (x + y) % 2 === 1;
      glbRetry(); await waitGl(30000);
      out.part = { state: _glb.state, ok: _glb.live ? _glb.live.__okS.sat : 0, err: _glb.live ? _glb.live.__errS.sat : 0 };
      inl.length = 0; await frame(); out.part.inl = inl.includes(true) && !inl.includes(false);
      SYN.fail = null; glbRetry(); await waitGl(30000); }
    // 10) WebGL을 못 쓰는 PC(지도 만들기 실패 흉내) → 파란 지도 + 까닭
    { const origMake = window.glbMake; window.glbMake = () => { throw new Error('WebGL 없음(흉내)'); }; warns.length = 0;
      try { glbRetry(); await waitGl(10000); await sleep(100); out.webgl = { state: _glb.state, why: _glb.why, blue: blueShown(), warn: warns.slice(-1)[0] || '' }; }
      finally { window.glbMake = origMake; }
      glbRetry(); await waitGl(30000); }
    // 11) 노말 VF → 파란 지도
    { const r0 = S.res; S.res = '1920x1080-vf';
      try { renderTyphoon(); glbUi(); out.vf = { blue: blueShown(), glHidden: glHidden(), stText: q('#bmMbxState').textContent }; }
      finally { S.res = r0; renderTyphoon(); glbUi(); } await sleep(200); }
    // 12) 저장·불러오기 — 작업에는 basemap 'mapbox'만(주소·토큰은 작업에 안 들어간다), 옛 작업(glSat 없음)도 같은 배경(WebGL)으로
    { const saved = JSON.parse(JSON.stringify(stateForSave()));
      out.save = { basemap: saved.typhoon.basemap, noUrl: !JSON.stringify(saved).includes('pk.TEST') && !JSON.stringify(saved).includes('api.mapbox.com') };
      saveWork(); out.save.work = (localStorage.getItem('wcg_work') || '').includes('"basemap":"mapbox"');
      await pickBm('blue'); closePop(); await sleep(200);
      const old = JSON.parse(JSON.stringify(saved)); delete old.typhoon.glSat; loadProjectData(old, null); await sleep(300); await waitGl(30000); await sleep(100);
      out.save.reload = S.typhoon.basemap; out.save.state = _glb.state; out.save.mode = _glb.mode; out.save.shown = glbShowing() && q('#glMap').style.display !== 'none'; }
  }
  // 13) 다른 3모드 — GL 흔적 없음
  out.old = {};
  for (const bm of ['blue', 'satellite', 'satdark']) {
    await pickBm(bm); closePop(); await sleep(250);
    inl.length = 0; await frame();
    out.old[bm] = { glMap: q('#glMap').style.display, marks: q('#L_bg').querySelectorAll('[data-glb],[data-glbhid],[data-glbimg]').length, img: inl.length, gridSat: typhoonGridIsSat(S.typhoon) };
  }
} finally {
  window.tileFetch = origTF; window.glbInlineClone = origInl; window.open = origOpen; window.status = origSt;
  try { localStorage.removeItem('wcg_mapbox_url'); } catch (e) { /* 없음 */ }
}
return out;
