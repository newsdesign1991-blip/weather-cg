// 타임라인 측정 페이지 도우미 — 부팅 뒤 Runtime.evaluate로 넣는다(앱 전역 이름 S·anim·animT 등은 읽기만 하고,
// 작업은 '파일 끌어다 놓기'로 연다). 앱 함수는 window.이름 을 감싸 호출 횟수·시간만 잰다(동작은 그대로).
(() => {
  if (window.__tl) return true;
  const T = window.__tl = {};
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  T.sleep = sleep;
  T.closePopups = async () => {
    for (let i = 0; i < 16; i++) {
      if ($('#tourWrap.on')) $('#tourClose') && $('#tourClose').click();
      const x = document.querySelector('#tossOv .tossX'); if (x) x.click();
      await sleep(150);
      if (!$('#tourWrap.on') && !document.getElementById('tossOv')) break;
    }
    const so = $('#startOverlay'); if (so && so.classList.contains('on')) { so.classList.remove('on'); try { localStorage.setItem('wcg_started', '1'); } catch (e) {} }
    return true;
  };
  T.openWork = async (work) => {
    const f = new File([JSON.stringify(work)], 'tl.json', { type: 'application/json' });
    const dt = new DataTransfer(); dt.items.add(f);
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await sleep(1500);
    await T.closePopups();
    return { style: S.style, res: S.res, tracks: anim().tracks.length, cam: camKeys().length };
  };
  // ---- 작업 만들기 ----
  const COLS = ['#FFE7E3', '#FDB9B1', '#FA9A8C', '#FB7264', '#F9483A', '#FA2E1E', '#C81306', '#8A0A02'];
  const LBL = { title: '', titleRatio: 0.75, divider: 1, txtCol: '#FFFFFF', stroke: '#FFFFFF', strokeW: 1.5, size: 40, w: 500, track: -1, padX: 20, padY: 12, radius: 0, fillOp: 1 };
  const ANIM = () => ({ dur: 6, fps: 29.97, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [] });
  const CAM = (k) => ({ keys: [
    { id: 'c901', t: 0.4, x: 1160, y: 545, s: 1.02, rx: 0, ry: 0, rz: 0 },
    { id: 'c902', t: 3.6, x: 1060, y: 600, s: 1.35, rx: k ? 28 : 0, ry: 0, rz: k ? 8 : 0 },
  ] });
  T.normalWork = (opt = {}) => {
    const style = opt.style || 'sgg';
    const zones = (MAP.styles[style].zones || []).map((z) => z.id);
    const F = {}; zones.forEach((id, i) => { if (i % 3 !== 2) F[id] = COLS[i % COLS.length]; });
    const labels = []; for (let i = 0; i < (opt.labels == null ? 16 : opt.labels); i++) labels.push(Object.assign({}, LBL, { id: 'l' + (100 + i), txt: String(10 + i * 5), x: 700 + (i % 4) * 220, y: 250 + Math.floor(i / 4) * 170, fill: COLS[(i * 3) % 8], style: i % 5 === 0 ? 'leader' : 'plain', ax: 760 + (i % 4) * 220, ay: 330 + Math.floor(i / 4) * 170 }));
    const mtns = []; for (let i = 0; i < 4; i++) mtns.push({ id: 'm' + (100 + i), x: 900 + i * 120, y: 300 + i * 90, size: 60, col: COLS[i * 2], op: 100, txt: '산' + i, txtSize: 22, txtCol: '#FFFFFF' });
    const w = { res: opt.res || '1920x1080', style, map: { x: 1160, y: 545, s: 1.02 }, fillsByStyle: { [style]: F }, labels, mtns, anim: ANIM() };
    if (opt.brush) w.brushByStyle = { [style]: opt.brush };
    if (opt.cam) w.anim.cam = CAM(opt.cam === 'tilt');
    if (opt.reveal) w.anim.reveal = opt.reveal;
    return w;
  };
  const TY_PTS = [];
  for (let i = 0; i < 14; i++) TY_PTS.push({ lon: 140 - i * 1.1, lat: 15 + i * 1.5, label: (20 + Math.floor(i / 2)) + '일 ' + (i % 2 ? '15' : '03') + '시', ws: 18 + i * 2, r15: 180 + i * 10, r25: i > 4 ? 60 + i * 5 : 0, r70: i > 6 ? 90 + i * 6 : 0, fcst: i > 6, tmef: '' });
  T.typhoonWork = (opt = {}) => {
    const labs = [3, 7, 10, 13].map((idx, k) => Object.assign({}, LBL, { id: 'tl' + (100 + k), idx, txt: TY_PTS[idx].label, x: 700 + k * 260, y: 260 + k * 120, fill: '#0C295F' }));
    const w = { res: opt.res || '1920x1080', style: 'typhoon', map: { x: 1160, y: 545, s: 1.02 }, labels: [],
      typhoon: { name: '측정', issues: [{ tmfc: '', label: 't', points: TY_PTS }], sel: 0, places: [{ id: 'p1', name: '서울', lon: 126.98, lat: 37.57, color: '#009afa' }], nowIdx: 6, trackMode: opt.line ? 'line' : 'full', lineWidth: 6, iconCol: '#E5231E', iconScale: 1, labels: labs },
      anim: ANIM() };
    if (opt.cam) w.anim.cam = CAM(opt.cam === 'tilt');
    return w;
  };
  T.compareWork = (opt = {}) => {
    const mk = (id, name, color, dl) => ({ id, name, color, show: 1, dotIcon: 0, iconScale: 1, lineW: 3, points: TY_PTS.map((p) => ({ lon: p.lon + dl, lat: p.lat + dl * 0.3, label: p.label })), labels: [{ idx: 5, txt: name + ' A', x: 900 + dl * 80, y: 400 }, { idx: 11, txt: name + ' B', x: 1300 + dl * 60, y: 300 }] });
    const w = { res: opt.res || '1920x1080', style: 'typhoonCompare', map: { x: 1160, y: 545, s: 1.02 }, labels: [],
      typhoon: { name: '비교', issues: [{ tmfc: '', label: 't', points: TY_PTS }], sel: 0, places: [], labels: [], compare: [mk('c1', 'KMA', '#FF5A5A', 0), mk('c2', 'JTWC', '#5AC8FF', 1.2), mk('c3', 'JMA', '#FFD24A', -1.2)] },
      anim: ANIM() };
    if (opt.cam) w.anim.cam = CAM(opt.cam === 'tilt');
    return w;
  };
  // ---- 앱 함수 계측(감싸기) ----
  T.acc = {}; T.on = false;
  const FN = ['renderAnimFrame', 'renderAnimFrameBody', 'applyTilt', 'rasterTiltCanvas', 'svgToImage', 'renderTyphoon', 'drawTyphoonTrack', 'drawCompareTracks', 'drawCompareLabels', 'drawTyphoonPlaces', 'typhoonBandInto', 'fillLabelBox',
    'renderMapTransform', 'renderSea', 'renderMtns', 'renderLabels', 'renderAll', 'buildTimeline', 'animSeek', 'applyCam', 'ensureTyphoonKeys', 'syncTyphoonSpan', 'timelineSnapTimes',
    'brushFinalize', 'applyVfEnter', 'pushUndo', 'saveWork', 'teardownBlind', 'ensureBlind', 'paintBlindClip', 'updatePlaceMarkers', 'scheduleMapboxTiles', 'renderRefImg', 'syncMapPosUI', 'bumpMapContent', 'tlPxPerSec', 'tlFrame', 'tlSync', 'tlLayoutBars', 'tlDrawRuler', 'tlPlaceHead', 'buildTimeline', 'tlLayerPlan', 'animFastOn', 'animFastOff'];
  T.wrapped = [];
  for (const name of FN) {
    const o = window[name]; if (typeof o !== 'function' || o.__tlw) continue;
    const w = function (...a) {
      if (!T.on) return o.apply(this, a);
      const t = performance.now();
      try { return o.apply(this, a); } finally { const d = performance.now() - t; const r = T.acc[name] || (T.acc[name] = { n: 0, t: 0, max: 0 }); r.n++; r.t += d; if (d > r.max) r.max = d; }
    };
    w.__tlw = 1;
    try { window[name] = w; if (window[name] === w) T.wrapped.push(name); } catch (e) {}
  }
  T.begin = () => { T.acc = {}; T.on = true; return true; };
  T.end = () => { T.on = false; const r2 = (x) => Math.round(x * 100) / 100; return Object.entries(T.acc).sort((a, b) => b[1].t - a[1].t).map(([n, r]) => ({ fn: n, n: r.n, t: r2(r.t), avg: r2(r.t / r.n), max: r2(r.max) })); };
  // ---- 화면 좌표 ----
  const ctr = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  T.rect = (sel, i = 0) => ctr(document.querySelectorAll(sel)[i]);
  T.ruler = () => ctr($('#tlRuler'));
  T.state = () => ({ animT, tlHeadT, playing: animPlaying, dur: anim().dur, fps: anim().fps, tracks: anim().tracks.length, cam: camKeys().length, head: $('#tlHead').style.left || $('#tlHead').style.transform, pps: tlPxPerSec(), undo: undoStack.length, time: $('#tlTime').textContent, tlOn: $('#timeline').classList.contains('on'), tilt: fit.classList.contains('mapTilt') });
  return true;
})();
