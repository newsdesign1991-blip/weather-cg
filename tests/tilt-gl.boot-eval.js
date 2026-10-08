// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/tilt-gl.boot.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 실제 앱: 틸트 미리보기가 WebGL(밉맵)로 그려지는지, 타임라인을 열면 틸트 그림을 미리 굽는지(예열), 재생 중 회전만 바뀔 땐 다시 안 굽는지,
// 기울기 진입 프레임에 빈 지도가 없는지(.mapTilt는 그림이 있을 때만), 컨텍스트를 잃으면 CSS로·되찾으면 GL로, 추출도 GL인지.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const $q = (s) => document.querySelector(s);
for (let i = 0; i < 12; i++) { if ($q('#tourWrap.on') && $q('#tourClose')) $q('#tourClose').click(); const x = $q('#tossOv .tossX'); if (x) x.click(); await sleep(150); }
{ const so = $q('#startOverlay'); if (so && so.classList.contains('on')) so.classList.remove('on'); }
const openWork = async (w) => {
  if ($q('#timeline').classList.contains('on')) $q('#tlClose').click();
  const f = new File([JSON.stringify(w)], 'tilt-gl.json', { type: 'application/json' }); const dt = new DataTransfer(); dt.items.add(f);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await sleep(1300);
  for (let i = 0; i < 6; i++) { const x = $q('#tossOv .tossX'); if (x) x.click(); await sleep(100); }
};
const COLS = ['#FFE7E3', '#FDB9B1', '#FA9A8C', '#FB7264', '#F9483A', '#FA2E1E', '#C81306', '#8A0A02'];
const zones = (MAP.styles.sgg.zones || []).map((z) => z.id); const F = {}; zones.forEach((id, i) => { if (i % 3 !== 2) F[id] = COLS[i % 8]; });
const map = { x: 1160, y: 545, s: 1.02 };
const keys = [{ id: 'c0', t: 0, ...map, rx: 0, ry: 0, rz: 0 }, { id: 'c1', t: 1.5, ...map, rx: 55, ry: 0, rz: -20 }, { id: 'c2', t: 3, ...map, rx: 55, ry: 0, rz: 25 }];
const sgg = { res: '1920x1080', style: 'sgg', map, fillsByStyle: { sgg: F }, labels: [], mtns: [], anim: { dur: 3.2, fps: 29.97, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [], cam: { keys } } };
const out = {};
// 래스터(틸트 그림 굽기) 횟수 — svgToImage를 지도 레이어로 부른 횟수
const rasters = [];
const origSvgToImage = window.svgToImage;
window.svgToImage = function (...a) { if (a[2] === CAM_MAP_LAYERS && !_exportingFrames) rasters.push({ t: performance.now(), playing: animPlaying }); return origSvgToImage.apply(this, a); };
try {
  await openWork(sgg);
  $q('#tlToggle').click();
  // 1) 예열: 타임라인을 열면(평면) 글꼴·틸트 그림을 미리 굽는다
  for (let i = 0; i < 80 && !(_tiltTex && !_camRasterBusy); i++) await sleep(100);
  await sleep(200);
  out.pre = { tex: !!_tiltTex, q: _tiltTex && _tiltTex.q, mapTilt: fit.classList.contains('mapTilt'), rasters: rasters.length, gl: !!tiltGLLive() };
  // 2) 재생: 회전만(내용 그대로) — 진입 프레임부터 기울인 지도, 다시 굽기 없음
  const r0 = rasters.length, frames = [];
  animPlay();
  const t0 = performance.now(); let tEnd = Infinity;
  while (performance.now() - t0 < 3600) {
    await raf();
    const m = S.map3d || {};
    if (!animPlaying && tEnd === Infinity) tEnd = performance.now();   // 재생 끝(끝 프레임은 정확 경로로 다시 굽는다 — 재생 중 굽기만 센다)
    frames.push({ rx: +m.rx || 0, tilt: fit.classList.contains('mapTilt'), gl: $q('#camGL').style.display !== 'none', cv: $q('#camCanvas').style.display !== 'none' });
  }
  const on = frames.filter((f) => f.rx > 0.05);
  out.play = { frames: frames.length, tiltFrames: on.length, flatWhileTilted: on.filter((f) => !f.tilt).length, glFrames: on.filter((f) => f.tilt && f.gl && !f.cv).length, rasters: rasters.slice(r0).filter((x) => x.playing).length, ended: tEnd !== Infinity };
  // 멈추면(정확 경로) 고해상으로 다시 굽는다
  animStop(); for (let i = 0; i < 40 && (_camRasterBusy || tlSettleTimer); i++) await sleep(100); await sleep(500);
  for (let i = 0; i < 40 && _camRasterBusy; i++) await sleep(100);
  out.settle = { q: _tiltTex && _tiltTex.q, tilt: fit.classList.contains('mapTilt') };
  // 3) 컨텍스트 잃음 → CSS 경로로(그림 버퍼를 기울임), 되찾음 → 다시 GL
  const ext = _tglView && _tglView.gl.getExtension('WEBGL_lose_context');
  out.lost = { ext: !!ext };
  if (ext) {
    ext.loseContext(); await sleep(400); await raf();
    out.lost.gl = $q('#camGL').style.display !== 'none'; out.lost.cv = $q('#camCanvas').style.display !== 'none';
    out.lost.css = /rotateX\(/.test($q('#camCanvas').style.transform); out.lost.tilt = fit.classList.contains('mapTilt');
    ext.restoreContext(); await sleep(600); await raf();
    out.lost.gl2 = $q('#camGL').style.display !== 'none'; out.lost.cv2 = $q('#camCanvas').style.display !== 'none'; out.lost.has2 = !!(_tglView && _tglView.has);
  }
  // 4) 추출(영상 프레임)도 같은 GL 렌더러로
  {
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
    _exportingFrames = true;
    try { await drawExportFrame(c.getContext('2d', { alpha: false }), 1920, 1080); } finally { _exportingFrames = false; clearExportCache(); }
    const d = c.getContext('2d').getImageData(960, 700, 1, 1).data;
    out.export = { gl: !!_tglExp, px: [...d] };
  }
} catch (e) { out.error = String(e && e.stack || e); }
finally { window.svgToImage = origSvgToImage; }
return out;
