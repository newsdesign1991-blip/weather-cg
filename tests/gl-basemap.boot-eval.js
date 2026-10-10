// boot-check --eval 본문(async 함수 본문, return 으로 결과). tests/gl-basemap.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 실제 앱(숨은 Electron, 실제 OpenFreeMap 타일): 가벼운 지도(WebGL · 시험) 고르기·준비, 화면 정렬(끌기·휠·재생 프레임·아트보드 크기),
// 추출(평면 프레임·틸트 미리보기·틸트 프레임·AE 블리드 영역), 저장·불러오기, 대체(오프라인·그림 실패·노말 VF), 다른 4모드에 GL 흔적 없음.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => document.querySelector(s);
try { closeTossModal(); } catch (e) { /* 없음 */ } try { closeCgSetup(); } catch (e) { /* 없음 */ }
for (let i = 0; i < 8; i++) { if (q('#tourWrap.on') && q('#tourClose')) q('#tourClose').click(); const x = q('#tossOv .tossX'); if (x) x.click(); await sleep(100); }
const st = Object.keys(MAP.styles).find((k) => MAP.styles[k].typhoon && !MAP.styles[k].compare);
setStyle(st); await sleep(800);
{ const so = q('#startOverlay'); if (so) so.classList.remove('on'); }
S.showGuide = 0; renderBg();
const out = {};
// 추출이 GL 그림을 넣었는지 — glbInlineClone 결과를 센다(true = 넣음, false = 파란 지도로 되돌림)
const inl = [];
const origInl = window.glbInlineClone;
window.glbInlineClone = async function (...a) { const r = await origInl.apply(this, a); inl.push(r); return r; };
const pickBm = async (bm) => { q('#basemapBtn').click(); await sleep(120); if (q('#basemapPop').style.display === 'none') { q('#basemapBtn').click(); await sleep(120); } q(`#basemapPop .bmOpt[data-bm="${bm}"]`).click(); await sleep(250); };
const closePop = () => { q('#basemapPop').style.display = 'none'; };
const waitGl = async (ms) => { const t0 = performance.now(); while ((_glb.state === 'loading' || _glb.state === 'off') && performance.now() - t0 < ms) await sleep(100); };
const [W, H] = RES[S.res].size;
const frame = async () => { clearExportCache(); const c = document.createElement('canvas'); c.width = W; c.height = H; await drawExportFrame(c.getContext('2d'), W, H); return c; };
const avg = (c, fx, fy) => { const d = c.getContext('2d').getImageData(Math.round(W * fx) - 3, Math.round(H * fy) - 3, 7, 7).data; const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } return s.map((v) => v / (d.length / 4)); };
const seaOf = (c) => { const t = avg(c, 0.93, 0.06), b = avg(c, 0.93, 0.94); const sea = [11, 34, 64]; return { top: t.map(Math.round), bottom: b.map(Math.round), topBottom: Math.max(...t.map((v, i) => Math.abs(v - b[i]))), diff: Math.max(...t.map((v, i) => Math.abs(v - sea[i])), ...b.map((v, i) => Math.abs(v - sea[i]))) }; };
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
try {
  // 1) 오프라인이고 이 PC에 받아 둔 타일도 없으면: (데스크톱 디스크 캐시 길은 한 번 해 본 뒤) 파란 지도로 + 까닭 + 다시 시도 단추
  //    받기(tileFetch)를 전부 실패로 — 점검 창은 실제로는 온라인이라 그대로 두면 받아 버린다
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  const origTF = window.tileFetch;
  window.tileFetch = async () => { throw new Error('net'); };
  try {
    await pickBm('gl');
    await waitGl(30000);
    out.offline = { state: _glb.state, why: _glb.why, blue: q('#typhoonOcean').style.display !== 'none' && q('#typhoonLand').style.display !== 'none',
      glHidden: q('#glMap').style.display === 'none', retryBtn: q('#bmGlRetry').style.display !== 'none', ui: q('#bmGlState').textContent, status: q('#status').textContent, proto: _glb.proto };
  } finally { window.tileFetch = origTF; delete navigator.onLine; }   // 원래 값으로
  // 2) 다시 시도 → 엔진·타일을 받아 준비
  const t0 = performance.now();
  q('#bmGlRetry').click();
  out.pick = { popOpen: q('#basemapPop').style.display !== 'none' };
  await waitGl(30000);
  out.net = _glb.state === 'ready'; out.netWhy = _glb.why;
  if (out.net) {
    out.ready = { state: _glb.state, ms: Math.round(_glb.readyMs), wall: Math.round(performance.now() - t0), dataGlb: q('#bgMapT').getAttribute('data-glb'),
      hidden: ['#typhoonOcean', '#typhoonLand', '#typhoonKrBase', '#typhoonRelief'].map((s) => s + ':' + (q(s).style.display || 'show') + ':' + q(s).getAttribute('data-glbhid')) };
    // 위성 사진(기본)을 골랐는데 Mapbox 주소도 기본 토큰도 없음(점검 = 토큰 안 줌) → 벡터만 + 까닭 한 줄·주소 칸·흐린 위성 칸·알림
    glbUi();
    out.ready.noSrc = { note: q('#bmGlSatNote').textContent, mbxBox: q('#bmMbxBox').style.display, miss: q('#bmGlSat button[data-glsat="1"]').classList.contains('miss'),
      status: q('#status').textContent, sat: _glb.live.__sat, basemap: S.typhoon.basemap, tok: typeof wcgDesktop.mapboxToken === 'function' ? wcgDesktop.mapboxToken() : null };
    closePop();
    // 3) 정렬 — 앱 typhoonXY(아트보드 px)와 MapLibre 화면 투영. 끌기·휠은 그 호출 직후(같은 프레임) 바로 잰다
    out.align = { live: alignNow() };
    { setFlatPanLOD(true); const base = { x: S.map.x, y: S.map.y, s: S.map.s }; S.map.x += 137; S.map.y -= 41; lightPanZoom(base); out.align.drag = alignNow(); out.align.sameFrame = out.align.drag < 0.5;
      { const r = S.map.s / (base.s || 1); shiftMapAttached(S.map.x - base.x * r, S.map.y - base.y * r, r); } renderMapTransform(); setFlatPanLOD(false); }
    { setFlatPanLOD(true); const base = { x: S.map.x, y: S.map.y, s: S.map.s }; zoomMapAbout(960, 540, S.map.s * 1.3); lightPanZoom(base); out.align.zoom = alignNow();
      { const r = S.map.s / (base.s || 1); shiftMapAttached(S.map.x - base.x * r, S.map.y - base.y * r, r); } renderMapTransform(); renderStrokeScale(); setFlatPanLOD(false); }
    { const m0 = { x: S.map.x, y: S.map.y, s: S.map.s }; S.map.x += 60; S.map.s *= 0.9; _tyLiteDraw = true;   // 카메라 키 재생(anim.js animFastCam)과 같은 꼴
      try { renderTyphoon(); out.align.anim = alignNow(); } finally { _tyLiteDraw = false; S.map.x = m0.x; S.map.y = m0.y; S.map.s = m0.s; } renderMapTransform(); }
    { q('#tlToggle').click(); await sleep(900); out.align.resize = alignNow(); out.align.fitW = Math.round(_fitCssW); if (q('#timeline').classList.contains('on')) q('#tlClose').click(); await sleep(700); }
    // 4) 추출 — 평면 프레임(영상 프레임과 같은 함수)
    inl.length = 0;
    { const c = await frame(); const s = seaOf(c); out.exp = { flat: { inl: inl.includes(true) && !inl.includes(false), seaTopBottom: +s.topBottom.toFixed(1), seaDiff: +s.diff.toFixed(1), top: s.top, bottom: s.bottom } }; }
    // 틸트 — 미리보기 그림 굽기(블리드)·기울이면 평면 캔버스 숨김·틸트 프레임
    inl.length = 0;
    S.map3d = { on: 1, rx: 40, ry: 0, rz: -12, persp: 2.2 }; applyTilt();
    for (let i = 0; i < 150 && !fit.classList.contains('mapTilt'); i++) await sleep(100);
    for (let i = 0; i < 100 && _camRasterBusy; i++) await sleep(100);
    out.exp.tiltPreview = inl.includes(true); out.exp.tiltHidden = getComputedStyle(q('#glMap')).visibility;
    inl.length = 0; await frame(); out.exp.tiltFrame = inl.includes(true) && !inl.includes(false);
    S.map3d = { on: 0, rx: 0, ry: 0, rz: 0, persp: 2.2 }; applyTilt(); await sleep(300);
    // AE 블리드 영역(svgBlob box)
    inl.length = 0; await svgBlob((c) => keepLayers(c, ['L_bg']), false, { box: { x: -300, y: -150, w: 2520, h: 1380 } }); out.exp.box = inl[0] === true;
    // 그림을 못 얻으면(타일 실패 흉내) → 그 그림만 파란 지도 + 알림
    { const orig = window.glbSnap; window.glbSnap = async () => null; inl.length = 0;
      try { const c = await frame(); const s = seaOf(c); out.exp.failInl = inl[0]; out.exp.failStatus = q('#status').textContent; out.exp.failSeaTopBottom = +s.topBottom.toFixed(1); } finally { window.glbSnap = orig; } }
    // 4-1) 실제 GPU 픽셀 정렬 — 시험 선(경도 150.3°·위도 30.3°, 빨강 1px)을 그려 그 픽셀 무게중심 = 앱 typhoonXY 자리(화면 캔버스 기기 px·추출 그림 출력 px)
    {
      const LON = 150.3, LAT = 30.3;
      const gj = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[LON, -10], [LON, 70]] }, properties: {} }, { type: 'Feature', geometry: { type: 'LineString', coordinates: [[90, LAT], [200, LAT]] }, properties: {} }] };
      const addT = (m) => { m.addSource('glbtest', { type: 'geojson', data: gj }); m.addLayer({ id: 'glbtest', type: 'line', source: 'glbtest', paint: { 'line-color': '#ff0000', 'line-width': 1 } }); };
      const dropT = (m) => { try { m.removeLayer('glbtest'); m.removeSource('glbtest'); } catch (e) { /* 없음 */ } };
      const centroid = (get, n) => { let s = 0, w = 0; for (let i = 0; i < n; i++) { const [r, g, b] = get(i); const v = Math.max(0, r - Math.max(g, b) - 40); s += v * (i + 0.5); w += v; } return w ? s / w : NaN; };
      const errs = (at, W, Hh, kx, ky, oy) => {
        const e = [];
        for (const lat of [10, 20, 45]) { const [ax, ay] = typhoonXY(LON, lat); e.push(Math.abs(centroid((i) => at(i, Math.round(ay * ky - oy)), W) - ax * kx)); }
        for (const lon of [120, 135, 170]) { const [ax, ay] = typhoonXY(lon, LAT); e.push(Math.abs(centroid((i) => at(Math.round(ax * kx), i), Hh) - (ay * ky - oy))); }
        return +Math.max(...e).toFixed(3);
      };
      out.pix = {};
      { const m = _glb.live; addT(m); for (let i = 0; i < 40 && !(m.loaded() && m.areTilesLoaded()); i++) { m.redraw(); await sleep(50); } m.redraw();
        const gl = m.painter.context.gl, cv = m.getCanvas(), Wc = cv.width, Hc = cv.height, px = new Uint8Array(Wc * Hc * 4); gl.readPixels(0, 0, Wc, Hc, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const dpr = Wc / parseFloat(cv.style.width), k = (_fitCssW || fit.clientWidth) / 1920 * dpr, top = (q('#glMapIn').__t || 0) * dpr;
        out.pix.live = errs((x, y) => { const i = ((Hc - 1 - y) * Wc + x) * 4; return [px[i], px[i + 1], px[i + 2]]; }, Wc, Hc, k, k, top);
        dropT(m); m.redraw(); }
      { const cam = { x: S.map.x, y: S.map.y, s: S.map.s }, vb = { x: 0, y: 0, w: 1920, h: 1080 };
        await glbSnap(cam, vb, W, H, false); const m = _glb.exp; addT(m);
        const url = await glbSnap(cam, vb, W, H, false); dropT(m);
        const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = W; c.height = H; const x2 = c.getContext('2d'); x2.drawImage(im, 0, 0);
        const d = x2.getImageData(0, 0, W, H).data;
        out.pix.export = errs((x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; }, W, H, W / 1920, H / 1080, 0); }
    }
    // 5) 저장·불러오기(작업 자동 저장·프로젝트) — 옛 작업은 그 배경 그대로
    const saved = JSON.parse(JSON.stringify(stateForSave()));
    out.save = { state: saved.typhoon.basemap };
    saveWork(); out.save.work = (localStorage.getItem('wcg_work') || '').includes('"basemap":"gl"');
    await pickBm('blue'); closePop();
    loadProjectData(JSON.parse(JSON.stringify(saved)), null); await sleep(800);
    out.save.reload = S.typhoon.basemap; out.save.reloadReady = glbShowing() && q('#glMap').style.display !== 'none';
    { const old = JSON.parse(JSON.stringify(saved)); old.typhoon.basemap = 'satdark'; loadProjectData(old, null); await sleep(800); out.save.old = S.typhoon.basemap; out.save.oldGl = q('#glMap').style.display; }
    loadProjectData(JSON.parse(JSON.stringify(saved)), null); await sleep(800);
    // 6) 노말 VF는 파란 지도로(패널 자르기·진입 슬라이드가 SVG 래퍼에 걸려 뒤 캔버스로는 못 맞춘다)
    { const r0 = S.res; S.res = '1920x1080-vf';
      try { renderTyphoon(); glbUi(); out.vf = { blue: q('#typhoonOcean').style.display !== 'none', glHidden: q('#glMap').style.display === 'none' || q('#glMap').style.visibility === 'hidden', ui: q('#bmGlState').textContent }; }
      finally { S.res = r0; renderTyphoon(); glbUi(); } }
  }
  // 7) 다른 4모드 — GL을 쓴 뒤에도 흔적 없음(캔버스 숨김·표시 없음·추출이 GL을 안 부름)
  out.old = {};
  for (const bm of ['blue', 'satellite', 'satdark', 'mapbox']) {
    await pickBm(bm); closePop(); await sleep(200);
    inl.length = 0; await frame();
    out.old[bm] = { glMap: q('#glMap').style.display, marks: q('#L_bg').querySelectorAll('[data-glb],[data-glbhid],[data-glbimg]').length, img: inl.length };
  }
  if (out.net) {
    // 8) 다시 고르기(엔진·캐시 따뜻함) → 새 지도로 다시 받기, 파란 지도로 돌아가기
    await pickBm('gl'); glbRetry(); await waitGl(20000); closePop();
    out.warm = { state: _glb.state, ms: Math.round(_glb.readyMs) };
    await pickBm('blue'); closePop();
    out.back = { glMap: q('#glMap').style.display, marks: q('#L_bg').querySelectorAll('[data-glb],[data-glbhid],[data-glbimg]').length, ocean: q('#typhoonOcean').style.display };
  }
} finally { window.glbInlineClone = origInl; }
return out;
