// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/export-render.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// '이미지로 추출' 항목마다 '딱 그것만' 나오는지 실제 앱(숨김 창)에서 픽셀로 잰다 — 숫자만 돌려준다(그림 전송 없음).
//  R1 편집용 레이어 다시 쌓기 = 전체 화면 · R2 항목 vs 화이트리스트 기준(섞인 것 0) · R3 색칠만(선 0·이음새) · R4 미리보기 상태 ·
//  R5 3D 기울기 · R6 태풍 · R7 크기·가장자리 · R8 저장 흐름(가짜 폴더 나무·ZIP) · R9 팝업
// 개발용: window.__XR_ONLY = ['n_sgg', …] 면 그 묶음만, window.__XR_DUMP = true 면 그림을 window.__XR_FILES 에 담는다(점검 드라이버가 받아 감).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const ONLY = window.__XR_ONLY || null, DUMP = !!window.__XR_DUMP;
const FILES = (window.__XR_FILES = []);
const want = (id) => !ONLY || ONLY.includes(id);
const t0 = performance.now();
const LOG = (window.__XR_LOG = []);
const log = (m) => LOG.push(Math.round(performance.now() - t0) + 'ms ' + m);   // 진행 기록(점검 드라이버가 읽어 보여 준다)
// 부팅 팝업(둘러보기·공지) 닫고, 시작 화면이면 CG 구성으로 제작 시작
for (let i = 0; i < 12; i++) {
  if (q('#tourWrap.on')) q('#tourClose').click();
  const x = q('#tossOv .tossX'); if (x) x.click();
  await sleep(150);
  if (!q('#tourWrap.on') && !document.getElementById('tossOv')) break;
}
if (q('#startOverlay.on')) {
  if (!q('#cgSetupOv.on')) q('#startSetup').click();
  await sleep(400);
  q('#resBtns [data-res="1920x1080"]').click(); q('#styleBtns [data-style="sgg"]').click(); await sleep(50);
  q('#cgsDone').click(); await sleep(900);
}
if (q('#cgSetupOv.on')) { q('#cgsX').click(); await sleep(400); }
log('부팅 정리 끝');

// ===== 픽셀 도우미 =====
const b64 = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const dump = async (rel, blob) => { if (DUMP && blob) FILES.push({ rel, b64: await b64(blob) }); };
async function pix(blob) {
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0);
  return { w: bmp.width, h: bmp.height, d: x.getImageData(0, 0, bmp.width, bmp.height).data };
}
const hexRgb = (h) => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
// T(뽑은 것) vs R(기준): out = 기준이 완전히 투명한 곳에 생긴 픽셀(섞여 들어온 것), extra/miss = 알파 차, col = 색 차(둘 다 불투명에 가까울 때)
function cmp(T, R, mask) {
  if (T.w !== R.w || T.h !== R.h) return { size: [T.w, T.h, R.w, R.h] };
  const t = T.d, r = R.d, n = T.w * T.h;
  let out = 0, outMax = 0, extra = 0, miss = 0, missBig = 0, col = 0, colBig = 0, colMax = 0, tNZ = 0, rNZ = 0;
  for (let i = 0; i < n; i++) {
    if (mask && mask[i]) continue;
    const ta = t[i * 4 + 3], ra = r[i * 4 + 3];
    if (ta) tNZ++; if (ra) rNZ++;
    if (ra === 0 && ta > 8) { out++; if (ta > outMax) outMax = ta; }
    const dA = ta - ra;
    if (dA > 2) extra++;
    else if (dA < -2) { miss++; if (-dA > 64) missBig++; }
    if (ta > 96 && ra > 96) {
      const dc = Math.max(Math.abs(t[i * 4] - r[i * 4]), Math.abs(t[i * 4 + 1] - r[i * 4 + 1]), Math.abs(t[i * 4 + 2] - r[i * 4 + 2]));
      if (dc > 24) { col++; if (dc > 64) colBig++; if (dc > colMax) colMax = dc; }
    }
  }
  return { out, outMax, extra, miss, missBig, col, colBig, colMax, tNZ, rNZ };
}
async function diffPng(T, R) {   // 개발용 — 빨강 = 더 있음, 파랑 = 빠짐, 노랑 = 색 다름
  const c = new OffscreenCanvas(T.w, T.h), x = c.getContext('2d'), im = x.createImageData(T.w, T.h), o = im.data, t = T.d, r = R.d;
  for (let i = 0; i < T.w * T.h; i++) {
    const ta = t[i * 4 + 3], ra = r[i * 4 + 3], dA = ta - ra, b = ra * 0.22; let R_ = b, G_ = b, B_ = b;
    if (dA > 2) { R_ = Math.min(255, 90 + dA * 8); G_ = 20; B_ = 20; } else if (dA < -2) { R_ = 0; G_ = 120; B_ = Math.min(255, 90 - dA * 8); }
    else if (ta > 96 && ra > 96 && Math.max(Math.abs(t[i * 4] - r[i * 4]), Math.abs(t[i * 4 + 1] - r[i * 4 + 1]), Math.abs(t[i * 4 + 2] - r[i * 4 + 2])) > 24) { R_ = 255; G_ = 220; B_ = 0; }
    o[i * 4] = R_; o[i * 4 + 1] = G_; o[i * 4 + 2] = B_; o[i * 4 + 3] = 255;
  }
  x.putImageData(im, 0, 0); return c.convertToBlob({ type: 'image/png' });
}
// 허용 색과 먼(> 40) 색의 픽셀 수 — 색칠만에 회색 선이 섞였는지 등.
// 허용 색 둘이 맞닿은 곳의 안티에일리어싱(두 색 사이 섞인 색)은 허용 — 두 색을 잇는 선분과의 거리로 본다
function foreign(T, allowed, minA) {
  const al = [...new Set(allowed.map((c) => String(c).toUpperCase()))].map(hexRgb), d = T.d; let N = 0, maxA = 0; const hist = {};
  const dist = (p, c) => Math.max(Math.abs(p[0] - c[0]), Math.abs(p[1] - c[1]), Math.abs(p[2] - c[2]));
  const seg = (p, a, b) => { const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2]; let t = vv ? ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1] + (p[2] - a[2]) * v[2]) / vv : 0; t = Math.max(0, Math.min(1, t)); return dist(p, [a[0] + t * v[0], a[1] + t * v[1], a[2] + t * v[2]]); };
  for (let i = 0; i < T.w * T.h; i++) {
    const a = d[i * 4 + 3]; if (a <= (minA || 0)) continue;
    const p = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
    let best = 1e9; for (const c of al) best = Math.min(best, dist(p, c));
    if (best > 40) for (let x = 0; x < al.length && best > 40; x++) for (let y = x + 1; y < al.length; y++) best = Math.min(best, seg(p, al[x], al[y]));
    if (best > 40) { N++; if (a > maxA) maxA = a; const k = '#' + p.map((v) => (v >> 4).toString(16)).join(''); hist[k] = (hist[k] || 0) + 1; }
  }
  return { N, maxA, top: Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 3) };
}
// 이 색들(칠한 색) 근처의 불투명 픽셀 수 — '지도만'·'바탕 지도'에 칠한 색이 섞였는지
function nearColors(T, cols, minA) {
  const al = cols.map(hexRgb), d = T.d; let N = 0;
  for (let i = 0; i < T.w * T.h; i++) { if (d[i * 4 + 3] <= (minA || 128)) continue; for (const c of al) if (Math.max(Math.abs(d[i * 4] - c[0]), Math.abs(d[i * 4 + 1] - c[1]), Math.abs(d[i * 4 + 2] - c[2])) <= 20) { N++; break; } }
  return N;
}
function edge(T) {   // 가장자리 1px 줄(위·아래·왼·오) 알파
  const { w, h, d } = T, a = (x, y) => d[(y * w + x) * 4 + 3];
  let rowTopMin = 255, rowBotMin = 255, nz = 0;
  for (let x = 0; x < w; x++) { rowTopMin = Math.min(rowTopMin, a(x, 0)); rowBotMin = Math.min(rowBotMin, a(x, h - 1)); if (a(x, 0) || a(x, h - 1)) nz++; }
  for (let y = 0; y < h; y++) if (a(0, y) || a(w - 1, y)) nz++;
  return { rowTopMin, rowBotMin, nz };
}
function opaqueFrac(T) { let n = 0; for (let i = 0; i < T.w * T.h; i++) if (T.d[i * 4 + 3] === 255) n++; return +(n / (T.w * T.h)).toFixed(4); }
// 이음새 — 불투명 사이에 낀 1~2px 반투명 픽셀 수(영상 위에 얹으면 희미한 선)
function seams(T, thr) {
  const { w, h, d } = T; thr = thr || 250; let n = 0;
  const a = (x, y) => d[(y * w + x) * 4 + 3];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    if (a(x, y) >= thr) continue;
    const h1 = a(x - 1, y) >= thr && a(x + 1, y) >= thr, v1 = a(x, y - 1) >= thr && a(x, y + 1) >= thr;
    const h2 = a(x - 2, y) >= thr && a(x + 2, y) >= thr && ((a(x - 1, y) < thr) !== (a(x + 1, y) < thr));
    const v2 = a(x, y - 2) >= thr && a(x, y + 2) >= thr && ((a(x, y - 1) < thr) !== (a(x, y + 1) < thr));
    if (h1 || v1 || h2 || v2) n++;
  }
  return n;
}
// 글자 자리(전체 화면은 캔버스 글꼴, 라벨 장은 SVG 글꼴 — 글자 가장자리만 다르다) — 다시 쌓기 비교에서 뺀다
function textMask(W, H) {
  const m = new Uint8Array(W * H), sr = svg.getBoundingClientRect(), kx = W / sr.width, ky = H / sr.height, pad = 5;
  for (const t of qa('#cg text')) {
    if (!t.textContent.trim()) continue;
    const r = t.getBoundingClientRect(); if (!r.width) continue;
    const x0 = Math.max(0, Math.floor((r.left - sr.left) * kx) - pad), x1 = Math.min(W - 1, Math.ceil((r.right - sr.left) * kx) + pad);
    const y0 = Math.max(0, Math.floor((r.top - sr.top) * ky) - pad), y1 = Math.min(H - 1, Math.ceil((r.bottom - sr.top) * ky) + pad);
    for (let y = y0; y <= y1; y++) m.fill(1, y * W + x0, y * W + x1 + 1);
  }
  return m;
}
// 화이트리스트 기준 — 지정한 요소(와 조상·defs)만 남기고 나머지는 전부 지운다(내보내기 코드의 '빼기'와 독립)
function keepOnly(c, els) {
  const K = new Set(els), anc = new Set();
  for (const n of K) { let p = n.parentNode; while (p && p !== c) { anc.add(p); p = p.parentNode; } }
  const walk = (node) => { for (const ch of [...node.children]) { if (K.has(ch)) continue; const tag = ch.tagName.toLowerCase(); if (tag === 'defs' || tag === 'style') continue; if (anc.has(ch)) walk(ch); else ch.remove(); } };
  walk(c);
}
const Q = (c, s) => [...c.querySelectorAll(s)];
function refOf(key, labelId) {
  const typh = isTyphoon(), F = fills(), bgSel = typh ? '#typhoonOcean, #bgMapT' : '#bgImg';
  const zonesBase = (c, stroke) => Q(c, '#gMain .zone, #gInsets .zone').forEach((z) => { z.setAttribute('fill', S.base); z.setAttribute('stroke', stroke); });
  switch (key) {
    case 'bg': return [false, (c) => keepOnly(c, Q(c, bgSel))];
    case 'bgtext': return [true, (c) => keepOnly(c, Q(c, bgSel + ', #L_title'))];
    case 'map': return [false, (c) => { keepOnly(c, Q(c, '#bgMapT, #L_sea, #L_map .zone, #L_map .zoneLine, #L_map .sidoLine, #L_boxes, #seoulRiver')); zonesBase(c, S.sggOn ? S.stroke : 'none'); Q(c, '#seaT .sea').forEach((p) => { p.setAttribute('fill', 'none'); p.removeAttribute('mask'); }); }];
    case 'base': return [false, (c) => { keepOnly(c, Q(c, '#bgMapT, #L_sea, #L_map .zone, #L_boxes, #seoulRiver')); zonesBase(c, 'none'); Q(c, '#seaT .sea').forEach((p) => { p.setAttribute('fill', S.seaBase); p.setAttribute('fill-opacity', S.seaBaseOp / 100); p.setAttribute('stroke', 'none'); }); }];
    case 'fills': return [false, (c) => {
      const zs = Q(c, '#gMain .zone, #gInsets .zone').filter((z) => F[z.dataset.id]), ss = Q(c, '#seaT .sea').filter((p) => S.seaFills[p.dataset.id]);
      keepOnly(c, [...zs, ...ss, ...Q(c, '#gMainSoft, image.brushLayer, #seoulPaintTop')]);
      zs.forEach((z) => { z.setAttribute('fill', F[z.dataset.id]); z.setAttribute('stroke', 'none'); });
      ss.forEach((p) => { p.setAttribute('fill', S.seaFills[p.dataset.id]); p.setAttribute('stroke', 'none'); p.removeAttribute('mask'); p.removeAttribute('opacity'); });
      c.querySelector('#L_map')?.removeAttribute('filter');
    }];
    case 'lines': return [false, (c) => { keepOnly(c, Q(c, '#L_map .zone, #L_map .zoneLine, #L_map .sidoLine, #seaT .sea')); Q(c, '#L_map .zone, #seaT .sea').forEach((z) => z.setAttribute('fill', 'none')); c.querySelector('#L_map')?.removeAttribute('filter'); }];
    case 'sidoline': return [false, (c) => { keepOnly(c, Q(c, '#L_map .sidoLine')); c.querySelector('#L_map')?.removeAttribute('filter'); }];
    case 'mtn': return [true, (c) => keepOnly(c, Q(c, '#L_mtn'))];
    case 'legend': return [true, (c) => keepOnly(c, Q(c, '#L_legend'))];
    case 'title': return [true, (c) => keepOnly(c, Q(c, '#L_title'))];
    case 'vfbar': return [false, (c) => keepOnly(c, Q(c, '#L_vfBar'))];
    case 'typhoon': return [true, (c) => keepOnly(c, Q(c, '#L_typhoon, #L_typhoonLabels'))];
    case 'labels': return [false, (c) => keepOnly(c, Q(c, '#L_labels > *').filter((n) => (n.dataset && n.dataset.id === labelId) || n.getAttribute('data-fleader-id') === labelId || n.getAttribute('data-fanchor-id') === labelId))];
  }
  return null;
}

// ===== 작업 꾸미기 =====
const COLS = ['#FA2E1E', '#3A6FEE', '#FFC800'], BRUSH_COL = '#00E81E', SEA_COL = '#0C46DC';
function rootPt(node) { const bb = node.getBBox(); const m = svg.getScreenCTM().inverse().multiply(node.getScreenCTM()); const p = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2).matrixTransform(m); return [p.x, p.y, bb]; }
const frameRect = () => (S.res === '1920x1080-vf' && _vfPanelRect) ? _vfPanelRect : { x: 0, y: 0, w: 1920, h: 1080 };
const onFrame = (p, pad) => { const r = frameRect(); return p[0] > r.x + pad && p[0] < r.x + r.w - pad && p[1] > r.y + pad && p[1] < r.y + r.h - pad; };
async function setup(cfg) {
  if (animT != null) { animStop(); animOff(); }
  S.map3d = Object.assign({}, S.map3d || {}, { on: 0 });
  if (S.res !== cfg.res) q(`#resBtns button[data-res="${cfg.res}"]`)._apply();
  if (S.style !== cfg.style) setStyle(cfg.style);
  if (!!S.cgLight !== !!cfg.light) setCgMode(cfg.light ? 1 : 0);
  S.sggOn = 1; S.realOn = 1; S.sidoOn = 1; S.showBg = 1;
  (S.anim ||= {}).reveal = 'dissolve'; S.anim.tracks = [];
  const typh = isTyphoon();
  const F = fills(); for (const k of Object.keys(F)) delete F[k];
  S.seaFills = {};
  brushStrokes().length = 0;
  S.softFill = 0;
  const zs = curZones();
  if (!typh) {
    if (cfg.paint === 'mono') zs.forEach((z) => { F[z.id] = COLS[0]; });
    else if (cfg.paint === 'tri') zs.forEach((z, i) => { F[z.id] = COLS[i % 3]; });
    else {
      let n = 0;
      zs.forEach((z, i) => { if (i % 3 === 0) F[z.id] = COLS[n++ % 3]; });
      if (!curStyle().noInsets) for (const key of Object.keys(S.insets)) { const z = zs.find((x) => x.inset === key); if (z) F[z.id] = COLS[1]; }
      if (curStyle().sea) (MAP.sea || []).forEach((z, i) => { if (i % 4 === 0) S.seaFills[z.id] = SEA_COL; });
    }
  }
  S.texts = [
    { id: 't1', txt: '내일~모레', x: 128, y: 300, size: 66, w: 700, col: '#FFFFFF', track: -2, align: 'start' },
    { id: 't2', txt: '예상 강수량', x: 128, y: 388, size: 66, w: 700, col: '#5BC5F2', track: -2, align: 'start' },
  ];
  if (S.res === '1920x1080-vf') {   // 패널 범위(비동기)를 먼저 — 제목이 패널 밖이면 잘려 빈 그림
    await new Promise((ok) => computeVfPanelRect(ok));
    const r = frameRect(); S.texts.forEach((t, i) => { t.x = Math.round(r.x + 40); t.y = Math.round(r.y + 90 + i * 70); }); (S.vfBar ||= {}).on = 1;
  }
  S.legend = Object.assign(S.legend || {}, { on: 1, auto: 0 });
  if (!S.legend.items || !S.legend.items.length) S.legend.items = [{ col: '#FA2E1E', txt: '폭염특보' }, { col: '#FFC400', txt: '폭염주의보' }];
  S.labels = []; S.mtns = [];
  renderAll(); await sleep(150);
  if (!typh && !cfg.paint) {
    const mainEls = qa('#gMain > .zone');
    const withPt = mainEls.map((e) => ({ e, id: e.dataset.id, p: rootPt(e) })).filter((o) => onFrame(o.p, 150) && o.p[2].width * o.p[2].height > 30);
    const fr = frameRect(), cx = fr.x + fr.w * 0.55, cy = fr.y + fr.h * 0.5;
    withPt.sort((a, b) => Math.hypot(a.p[0] - cx, a.p[1] - cy) - Math.hypot(b.p[0] - cx, b.p[1] - cy));
    const painted = withPt.filter((o) => F[o.id]), unpainted = withPt.filter((o) => !F[o.id]);
    if (unpainted.length) {   // 브러쉬 한 획(안 칠한 구역 위)
      const z = unpainted[0], bb = z.p[2], r = Math.max(4, 40 / brushLocalScale('main')), dabs = [], y = bb.y + bb.height / 2;
      for (let x = bb.x + bb.width * 0.1; x <= bb.x + bb.width * 0.9; x += r * 0.3) dabs.push([x, y]);
      brushStrokes().push({ space: 'main', keys: [regionKey('main', z.id)], col: BRUSH_COL, r, op: 80, soft: 50, erase: false, dabs });
      renderBrush(); brushFinalize();
    }
    if (painted.length >= 3) {   // 라벨: 일반·지시선(2단)·같은 글
      const [a, b, c] = [painted[0], painted[Math.min(4, painted.length - 1)], painted[Math.min(8, painted.length - 1)]];
      S.labels.push(newLabel({ txt: '120', x: Math.round(a.p[0]), y: Math.round(a.p[1]), fill: F[a.id] }));
      S.labels.push(newLabel({ txt: '80~100', title: '강원', style: 'leader', x: Math.round(b.p[0] + 170), y: Math.round(b.p[1] - 120), ax: Math.round(b.p[0]), ay: Math.round(b.p[1]), fill: F[b.id] }));
      S.labels.push(newLabel({ txt: '120', x: Math.round(c.p[0] - 60), y: Math.round(c.p[1] + 60), fill: '#FFC800', txtCol: '#000000' }));
    }
    S.mtns.push(newMtn({ anchor: { lon: 128.38, lat: 37.70 }, size: 90, col: '#12A62B', txt: '설악산' }));
    if (!curStyle().noInsets) S.mtns.push(newMtn({ anchor: { inset: 'jeju' }, size: 71, col: '#FA2E1E' }));
  }
  if (typh) { S.labels.push(newLabel({ txt: '120', x: 900, y: 500 })); if (S.typhoon) S.typhoon.places = [{ id: 'pA', name: '서울', lon: 126.98, lat: 37.57, color: '#009afa' }]; }
  renderAll(); brushFinalize(); await sleep(400); brushFinalize();
}

// ===== 항목 점검(R2·R7) =====
const BG_KEYS = new Set(['full', 'bg', 'bgtext']);
async function checkItems(scn, keys) {
  const [W, H] = RES[S.res].size, out = {};
  const F = fills();
  const fillCols = [...new Set([...Object.values(F), ...Object.values(S.seaFills || {}), BRUSH_COL].map((c) => c.toUpperCase()))];
  const lineCols = [S.stroke, S.realCol, S.sidoCol, S.seaCol].concat(S.cgLight ? fillCols : []);
  for (const p of exportPlan(keys)) {
    log(scn + ' · ' + p.file);
    const blob = await p.bake(), T = await pix(blob);
    const r = { size: T.w === W && T.h === H, edge: edge(T) };
    if (p.key !== 'full') {
      const [ov, m] = refOf(p.key, p.id);
      const Rb = await svgBlob(m, ov, { tilt: true }), Rp = await pix(Rb);
      r.cmp = cmp(T, Rp);
      if (r.cmp.out) { await dump(`${scn}/${p.file}`, blob); await dump(`${scn}/${p.file.replace('.png', '')}__ref.png`, Rb); }
    }
    if (p.key === 'fills' && !isSeoul()) r.foreign = foreign(T, fillCols, 16);
    if (p.key === 'lines') r.foreign = foreign(T, lineCols, 16);
    if (p.key === 'sidoline') r.foreign = foreign(T, [S.sidoCol], 16);
    if (p.key === 'map' || p.key === 'base') r.paintLeak = nearColors(T, fillCols.filter((c) => c !== String(S.base).toUpperCase()), 128);
    if (BG_KEYS.has(p.key)) r.opaque = opaqueFrac(T);
    if (DUMP && !r.cmp?.out) await dump(`${scn}/${p.file}`, blob);
    out[p.key === 'labels' ? p.file : p.key] = r;
  }
  return out;
}
// R1 — 편집용 레이어(EXPORT_STACK 순서)를 쌓은 것 vs 전체 화면. 글자 자리는 빼고 센다
async function recompose(scn) {
  const [W, H] = RES[S.res].size;
  const plan = exportPlan(EXPORT_STACK).sort((a, b) => EXPORT_STACK.indexOf(a.key) - EXPORT_STACK.indexOf(b.key));
  const c = new OffscreenCanvas(W, H), x = c.getContext('2d');
  for (const p of plan) x.drawImage(await createImageBitmap(await p.bake()), 0, 0);
  const comp = await c.convertToBlob({ type: 'image/png' }), full = await exportBake('full');
  const Tc = await pix(comp), Rf = await pix(full), r = cmp(Tc, Rf, textMask(W, H));
  if (DUMP) await dump(`${scn}/recompose__diff.png`, await diffPng(Tc, Rf));
  r.keys = [...new Set(plan.map((p) => p.key))];
  await dump(`${scn}/recompose.png`, comp);
  return r;
}

const R = { ver: 1 };
// ===== 지도·해상도 묶음 =====
const ALL = EXPORT_TARGETS.map((t) => t.key);
const SCN = [
  ['n_sgg', { res: '1920x1080', style: 'sgg' }],
  ['n_warnsea', { res: '1920x1080', style: 'warnsea' }],
  ['n_seoul', { res: '1920x1080', style: 'seoul' }],
  ['n_typhoon', { res: '1920x1080', style: 'typhoon' }],
  ['t_sgg', { res: '2158x1214', style: 'sgg' }],
  ['v_warn', { res: '1920x1080-vf', style: 'warn' }],
  ['n_sgg_light', { res: '1920x1080', style: 'sgg', light: 1 }],
];
R.scn = {};
for (const [id, cfg] of SCN) {
  if (!want(id)) continue;
  log(id + ' 꾸미기');
  await setup(cfg);
  log(id + ' 꾸미기 끝');
  const s = R.scn[id] = { res: S.res, style: S.style, why: {}, count: {} };
  for (const k of ALL) { s.why[k] = exportWhyNot(k); s.count[k] = exportCount(k); }
  s.items = await checkItems(id, ALL);
  log(id + ' 다시 쌓기');
  s.recompose = await recompose(id);
  if (S.res === '2158x1214') {   // R7 — 영상 한 프레임도 터치 가장자리 255
    const [W, H] = RES[S.res].size, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    clearExportCache(); await drawExportFrame(cv.getContext('2d'), W, H); clearExportCache();
    s.videoEdge = edge(await pix(await new Promise((r) => cv.toBlob(r, 'image/png'))));
  }
}

// ===== R3 — 이음새(다 칠한 지도) =====
if (want('seams')) {
  R.seams = {};
  for (const [id, cfg] of [['n_sgg_mono', { res: '1920x1080', style: 'sgg', paint: 'mono' }], ['n_sgg_tri', { res: '1920x1080', style: 'sgg', paint: 'tri' }], ['v_warn_tri', { res: '1920x1080-vf', style: 'warn', paint: 'tri' }]]) {
    await setup(cfg);
    const F = fills();
    const noEdge = await svgBlob((c) => { keepLayers(c, ['L_sea', 'L_map']); c.querySelector('#L_map')?.removeAttribute('filter'); c.querySelectorAll('.zoneLine, .sidoLine').forEach((n) => n.remove()); c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => { z.setAttribute('fill', F[z.dataset.id] || 'none'); z.setAttribute('stroke', 'none'); }); });
    const merged = await svgBlob((c) => {   // 같은 색 한 path(기준선 — 남는 것은 해협 등 실제 틈)
      keepLayers(c, ['L_sea', 'L_map']); c.querySelector('#L_map')?.removeAttribute('filter'); c.querySelectorAll('.zoneLine, .sidoLine').forEach((n) => n.remove());
      const g = new Map();
      c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => { z.setAttribute('stroke', 'none'); const col = F[z.dataset.id]; z.setAttribute('fill', col || 'none'); if (!col) return; const k = col + '|' + (z.parentNode.id || ''); if (!g.has(k)) g.set(k, []); g.get(k).push(z); });
      for (const zs of g.values()) { zs[0].setAttribute('d', zs.map((z) => z.getAttribute('d')).join(' ')); zs.slice(1).forEach((z) => z.remove()); }
    });
    const T = await exportBake('fills');
    R.seams[id] = { fills: seams(await pix(T)), noEdge: seams(await pix(noEdge)), merged: seams(await pix(merged)), grow: cmp(await pix(T), await pix(noEdge)).out };
    await dump(`seams/${id}_fills.png`, T); await dump(`seams/${id}_noEdge.png`, noEdge);
  }
}

// ===== R4 — 타임라인 미리보기 상태에서 뽑기 =====
if (want('anim')) {
  await setup({ res: '1920x1080', style: 'sgg' });
  const keys = ['full', 'fills', 'map', 'base', 'lines', 'sidoline', 'labels', 'mtn', 'title'];
  const bake = async () => { const o = {}; for (const p of exportPlan(keys)) o[p.file] = await pix(await p.bake()); return o; };
  const base = await bake();
  if (!q('#timeline').classList.contains('on')) { q('#tlToggle').click(); await sleep(400); }
  R.anim = {};
  for (const [nm, reveal, frac] of [['blindsEnd', 'blinds', 1], ['blindsMid', 'blinds', 0.3], ['dissolveMid', 'dissolve', 0.25]]) {
    S.anim.reveal = reveal; autoTracks();
    const t = +(anim().dur * frac).toFixed(3);
    animSeek(t); await sleep(120);
    const st = { t, before: { animT, mapBase: !!document.getElementById('L_mapBase') } };
    if (nm === 'blindsEnd') {   // 안전망만(정지 화면으로 안 돌리고 굽기) — 블라인드 베이스 지도가 안 섞인다
      const raw = await pix(await exportBake('fills'));
      st.rawFillsOut = cmp(raw, base['색칠만.png']).out;
    }
    let got = null;
    await withStaticFrame(async () => { got = await bake(); });
    st.diff = {};
    for (const f of Object.keys(base)) { const c = cmp(got[f], base[f]); st.diff[f] = c.out + c.extra + c.miss + c.col; }
    st.after = { animT, mapBase: !!document.getElementById('L_mapBase'), head: q('#tlTime').textContent };
    R.anim[nm] = st;
  }
  animStop(); animOff(); S.anim.tracks = []; renderAll();
  if (q('#timeline').classList.contains('on')) { q('#tlToggle').click(); await sleep(300); }
}

// ===== R5 — 3D 기울기 =====
if (want('tilt')) {
  await setup({ res: '1920x1080', style: 'sgg' });
  const [W, H] = RES[S.res].size;
  const flatFills = await pix(await exportBake('fills')), flatLab = exportPlan(['labels']);
  const flatLab0 = flatLab.length ? await pix(await flatLab[0].bake()) : null;
  S.map3d = Object.assign({}, S.map3d || {}, { on: 1, rx: 28, ry: 0, rz: 6 });
  renderAll(); applyTilt(); await sleep(500);
  const full = await pix(await exportBake('full'));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  clearExportCache(); await drawExportFrame(cv.getContext('2d'), W, H); clearExportCache();
  const frame = await pix(await new Promise((r) => cv.toBlob(r, 'image/png')));
  const fc = cmp(full, frame);
  const tiltFillsBlob = await exportBake('fills'), tiltFills = await pix(tiltFillsBlob);
  // 기울인 '색칠만'의 칠한 픽셀이 기울인 '전체 화면'에서도 같은 색인가(평평한 것은 어긋난다)
  const agree = (A) => { let n = 0, ok = 0; for (let i = 0; i < W * H; i++) { if (A.d[i * 4 + 3] < 220) continue; n++; const dc = Math.max(Math.abs(A.d[i * 4] - full.d[i * 4]), Math.abs(A.d[i * 4 + 1] - full.d[i * 4 + 1]), Math.abs(A.d[i * 4 + 2] - full.d[i * 4 + 2])); if (dc <= 48) ok++; } return n ? +(ok / n).toFixed(3) : 0; };
  const lab = exportPlan(['labels']);
  const [rov, rm] = refOf('fills'), refTilt = cmp(tiltFills, await pix(await svgBlob(rm, rov, { tilt: true })));   // 기울인 화이트리스트 기준과도 '그것만'
  R.tilt = { active: camActive3d(), fullVsFrame: fc.out + fc.extra + fc.miss + fc.col, tiltFillsAgree: agree(tiltFills), flatFillsAgree: agree(flatFills), fillsVsRefOut: refTilt.out, fillsNZ: refTilt.tNZ, labelsFlat: null };
  if (lab.length && flatLab0) { const c = cmp(await pix(await lab[0].bake()), flatLab0); R.tilt.labelsFlat = c.out + c.extra + c.miss + c.col; }   // 라벨은 기울지 않는다(영상과 같게)
  await dump('tilt/fills.png', tiltFillsBlob);
  S.map3d = Object.assign({}, S.map3d, { on: 0 }); renderAll(); applyTilt();
}

// ===== R8 — 저장 흐름(가짜 폴더 나무) =====
if (want('save')) {
  await setup({ res: '1920x1080', style: 'sgg' });
  const writes = [];
  const fakeDir = (name) => {
    const files = new Map(), dirs = new Map(), calls = [];
    return { kind: 'directory', name, files, dirs, calls,
      async getDirectoryHandle(n, o) { calls.push([n, !!(o && o.create)]); if (!dirs.has(n)) { if (!(o && o.create)) throw new DOMException('없음', 'NotFoundError'); dirs.set(n, fakeDir(n)); } return dirs.get(n); },
      async getFileHandle(n, o) {
        if (!files.has(n) && !(o && o.create)) throw new DOMException('없음', 'NotFoundError');
        return { name: n, createWritable: async () => { const parts = []; return { write: async (b) => { parts.push(b); }, close: async () => { files.set(n, new Blob(parts)); writes.push(n); } }; } };
      } };
  };
  const root = fakeDir('Upload'), pick = [];
  const origPicker = window.showDirectoryPicker, origDl = window.download;
  let pickerMode = 'ok';
  window.showDirectoryPicker = async (o) => { pick.push(o); if (pickerMode === 'abort') throw new DOMException('사용자 취소', 'AbortError'); return root; };
  const dl = []; window.download = (blob, filename) => { dl.push({ blob, filename }); };
  // 렌더 중 겹침 확인창이 뜨면 그 버튼을 누른다
  const renderAnd = async (answer) => {
    const p = renderExport();
    if (answer) { for (let i = 0; i < 100 && !q('#tossOv .exDupMsg'); i++) await sleep(50); const msg = q('#tossOv .exDupMsg')?.textContent || ''; q(`#tossOv [data-${answer}]`)?.click(); await p; await sleep(400); return msg; }
    await p; return null;
  };
  const S8 = R.save = {};
  try {
    q('#exportBtn').click(); await sleep(400);
    exPick = new Set(['full', 'fills', 'labels']); exSavePick(); syncExport();
    const folder = exportFolderName();
    S8.folder = folder;
    S8.plan = exportPlan(['full', 'fills', 'labels']).map((p) => p.file);
    await renderAnd(null);
    const dir = root.dirs.get(folder);
    S8.first = { pickerOpt: { id: pick[0] && pick[0].id, mode: pick[0] && pick[0].mode, startIn: !!(pick[0] && pick[0].startIn) }, getDir: root.calls.slice(), files: dir ? [...dir.files.keys()] : [], nfc: dir ? [...dir.files.keys()].every((n) => n === n.normalize('NFC')) : null, summary: q('#exSummary').textContent };
    if (dir) { const f = dir.files.get('색칠만.png'); if (f) { const T = await pix(f); S8.first.fillsSize = [T.w, T.h]; } }
    let w0 = writes.length;
    S8.over = { msg: await renderAnd('over'), startInIsFirst: pick[1] && pick[1].startIn === root, files: dir ? dir.files.size : 0, newWrites: writes.length - w0 };
    w0 = writes.length;
    await renderAnd('num');
    S8.num = { files: dir ? [...dir.files.keys()].sort() : [], newWrites: writes.length - w0 };
    w0 = writes.length;
    await renderAnd('cancel');
    S8.cancel = { newWrites: writes.length - w0, summary: q('#exSummary').textContent };
    // 폴더 창 취소(바탕화면·다운로드 자체를 골랐을 때도 같은 AbortError) → 안내 + ZIP 받기 버튼
    pickerMode = 'abort'; w0 = writes.length;
    await renderAnd(null);
    const zipBtn = q('#exToast .exToastBtn');
    S8.abort = { newWrites: writes.length - w0, toast: q('#exToast').textContent, zipBtn: !!zipBtn };
    if (zipBtn) { zipBtn.click(); for (let i = 0; i < 200 && !dl.length; i++) await sleep(50); for (let i = 0; i < 100 && _exBusy; i++) await sleep(50); }
    // 폴더 고르기가 없는 브라우저 → ZIP
    window.showDirectoryPicker = undefined;
    await renderAnd(null);
    const parseZip = async (blob) => {
      const u8 = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(u8.buffer), outz = []; let p = 0; const dec = new TextDecoder();
      while (p + 30 <= u8.length && dv.getUint32(p, true) === 0x04034b50) { const flag = dv.getUint16(p + 6, true), time = dv.getUint16(p + 10, true), date = dv.getUint16(p + 12, true), size = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true), xl = dv.getUint16(p + 28, true); outz.push({ name: dec.decode(u8.subarray(p + 30, p + 30 + nl)), utf8: !!(flag & 0x800), time, date, size }); p += 30 + nl + xl + size; }
      return outz;
    };
    S8.zip = [];
    for (const d of dl) S8.zip.push({ filename: d.filename, entries: await parseZip(d.blob) });
    // 영상 추출 중엔 막는다
    window.showDirectoryPicker = async (o) => { pick.push(o); return root; };
    const nPick = pick.length;
    _exportingFrames = true;
    await renderExport();
    _exportingFrames = false;
    S8.videoBusy = { pickerCalls: pick.length - nPick, toast: q('#exToast').textContent };
  } finally {
    window.showDirectoryPicker = origPicker; window.download = origDl; _exportingFrames = false;
    closeExport(); await sleep(300);
  }
}

// ===== R9 — 팝업 =====
if (want('popup')) {
  await setup({ res: '1920x1080', style: 'sgg' });
  const P = R.popup = {};
  const pressed = (k) => q(`.exItemCard[data-key="${k}"]`).getAttribute('aria-pressed');
  q('#exportBtn').focus(); q('#exportBtn').click(); await sleep(450);
  P.open = { on: q('#exportOv').classList.contains('on'), focusIn: q('#exportOv').contains(document.activeElement), drop: q('#menuDrop').classList.contains('on') };
  q('[data-quick="none"]').click();
  P.none = { renderDisabled: q('#exRender').disabled, summary: q('#exSummary').textContent };
  q('.exItemCard[data-key="typhoon"]').click();   // 이 지도엔 없는 항목
  P.disabledClick = { pressed: pressed('typhoon'), ariaDisabled: q('.exItemCard[data-key="typhoon"]').getAttribute('aria-disabled'), sub: q('.exItemCard[data-key="typhoon"] small').textContent };
  q('.exItemCard[data-key="fills"]').click();
  P.pick = { fills: pressed('fills'), renderDisabled: q('#exRender').disabled };
  q('[data-quick="layers"]').click();
  P.layers = qa('.exItemCard[aria-pressed="true"]').map((b) => b.dataset.key);
  q('.exPaneMark .exPanePick').click();   // 묶음 알약 — 모두 골랐으면 모두 풀기
  P.paneToggle = qa('.exPaneMark .exItemCard[aria-pressed="true"]').map((b) => b.dataset.key);
  q('[data-quick="final"]').click(); q('.exItemCard[data-key="fills"]').click();
  P.counts = { labelsBadge: q('.exItemCard[data-key="labels"] .exCount').textContent, labelsBadgeShown: !q('.exItemCard[data-key="labels"] .exCount').hidden };
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(400);
  P.esc = { on: q('#exportOv').classList.contains('on'), focusBack: document.activeElement && document.activeElement.id };
  q('#exportBtn').click(); await sleep(400);
  P.remember = { full: pressed('full'), fills: pressed('fills'), stored: localStorage.getItem('wcg_export_pick') };
  q('#exportOv').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); q('#exportOv').dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(400);
  P.outside = { on: q('#exportOv').classList.contains('on') };
  // 굽는 중 Esc = 중지(닫히지 않음)
  q('#exportBtn').click(); await sleep(400);
  q('[data-quick="layers"]').click();
  const root = { kind: 'directory', name: 'T', async getDirectoryHandle() { return { async getFileHandle(n, o) { if (!(o && o.create)) throw new DOMException('x', 'NotFoundError'); return { createWritable: async () => ({ write: async () => {}, close: async () => {} }) }; } }; } };
  const orig = window.showDirectoryPicker; window.showDirectoryPicker = async () => root;
  const total = exportPlan(exPickedKeys()).length;
  const pr = renderExport();
  for (let i = 0; i < 100 && !_exBusy; i++) await sleep(20);
  P.busy = { renderLabel: q('#exRender .exRenderLbl').textContent, ring: getComputedStyle(q('#exRender .exRing')).display, tbBusy: q('#exportBtn').classList.contains('fx-on') };
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await pr; window.showDirectoryPicker = orig;
  P.stop = { on: q('#exportOv').classList.contains('on'), total, summary: q('#exSummary').textContent, tbBusyAfter: q('#exportBtn').classList.contains('fx-on') };
  closeExport(); await sleep(300);
}
R.ms = Math.round(performance.now() - t0);
return R;
