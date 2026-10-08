/* [모듈] js/export-image.js — 이미지 추출 공통: 출력 글꼴 임베드, 카메라 레이어·가장자리, 텍스트 오버레이, svgToImage, 3D 틸트 워프, drawExportFrame */
'use strict';

// 추출용 폰트 CSS — CG 텍스트는 전부 'SUITE CG'(FontNew OTF)로 그린다. 그런데 추출은 SVG를 <img>로 래스터하는데,
// <img> 안의 SVG는 보안상 외부 폰트 URL(FontNew/*.otf)을 못 불러온다 → data:base64로 '심어야' 정확히 나온다.
// (예전엔 여기에 Wanted를 심었지만 CG 텍스트는 Wanted를 안 써서 폰트가 Malgun으로 대체돼 렌더가 달라졌음.)
let _suiteFontCss = null;
let _suiteFontsReady = false;
// 굵기별 @font-face 한 줄(미리보기 래스터가 쓰는 굵기만 넣을 때 — suiteFontCssFor)
const _suiteFontRules = {};
async function suiteFontCss() {
  if (_suiteFontCss != null) { await ensureSuiteFontsLoaded(); return _suiteFontCss; }
  const W = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold'], [900, 'Heavy']];
  const bufs = [];
  const rules = await Promise.all(W.map(async ([wt, name]) => {
    try {
      const buf = await (await fetch('FontNew/SUITE-' + name + '.otf')).arrayBuffer();
      const b = new Uint8Array(buf); let bin = '';
      for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      bufs.push([wt, buf]);
      const rule = "@font-face{font-family:'SUITE CG';font-style:normal;font-weight:" + wt + ";src:url(data:font/otf;base64," + btoa(bin) + ") format('opentype');}";
      _suiteFontRules[wt] = rule;
      return rule;
    } catch (e) { return ''; }
  }));
  _suiteFontCss = rules.join('\n');
  _suiteFontBufs = bufs;
  await ensureSuiteFontsLoaded();
  return _suiteFontCss;
}
// 미리보기 래스터(틸트 캔버스)용 — 복제본 <text>가 실제로 쓰는 굵기의 글꼴만 넣는다(7굵기 ≈ 2.9MB를 매번 직렬화·디코드하던 비용).
// 쓰지 않는 글꼴만 빠지므로 그림은 같다. 굵기를 못 읽는 글자가 하나라도 있으면 전부 넣는다. 추출(svgToImage 기본)은 늘 전부.
async function suiteFontCssFor(root) {
  const all = await suiteFontCss();
  const ws = new Set();
  for (const t of root.querySelectorAll('text')) { const w = parseInt(t.getAttribute('font-weight') || '', 10); if (!_suiteFontRules[w]) return all; ws.add(w); }
  return [...ws].sort().map((w) => _suiteFontRules[w]).join('\n');
}
// 같은 base64 폰트를 브라우저 폰트시스템(document.fonts)에도 올려 둔다.
// <img> 안 SVG는 폰트를 이 캐시에서 찾으므로, 미리 로드해 두면 export 첫 렌더부터 SUITE가 확실히 적용된다(폴백 레이스 방지).
let _suiteFontBufs = null;
async function ensureSuiteFontsLoaded() {
  if (_suiteFontsReady || !_suiteFontBufs || !window.FontFace) return;
  try {
    await Promise.all(_suiteFontBufs.map(async ([wt, buf]) => {
      const ff = new FontFace('SUITE CG', buf, { weight: String(wt), style: 'normal' });
      await ff.load(); document.fonts.add(ff);
    }));
    // <img> 안 SVG의 base64 폰트 캐시를 미리 데운다 — 첫 export/MP4 프레임이 폴백 폰트로 새는 레이스 방지.
    try {
      const warm = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><style>${_suiteFontCss}</style><text x='0' y='12' font-family='"SUITE CG"' font-weight='700' font-size='12'>가</text></svg>`;
      const u = URL.createObjectURL(new Blob([warm], { type: 'image/svg+xml;charset=utf-8' }));
      const im = new Image(); im.src = u; await im.decode().catch(() => {});
      const cc = document.createElement('canvas'); cc.width = 16; cc.height = 16; cc.getContext('2d').drawImage(im, 0, 0);
      setTimeout(() => URL.revokeObjectURL(u), 500);
    } catch (e) { /* noop */ }
    _suiteFontsReady = true;
  } catch (e) { /* 실패해도 base64 임베드가 있으니 계속 진행 */ }
}

// 3D 카메라 회전이 '지도만' 적용되도록 레이어를 두 묶음으로 나눈다.
// 지도(기울어짐): 배경·바다·지도·도서·산·태풍.  오버레이(고정): 제목바·라벨·제목·범례.
const CAM_MAP_LAYERS = ['L_bg', 'L_sea', 'L_map', 'L_boxes', 'L_mtn', 'L_typhoon'];
const CAM_OVERLAY_LAYERS = ['L_typhoonLabels', 'L_vfBar', 'L_labels', 'L_title', 'L_legend'];
// 3D 회전 시 프레임 밖 여백(블리드) — 축소·기울임에 지도/바다가 더 나오게. 프레임 대비 좌우·상하 30%씩.
const CAM_BLEED = 1.0;   // 3D 기울임 시 프레임 밖(특히 북쪽)까지 지도를 더 렌더 — 기울여도 북쪽 끝이 하드컷(마스킹)되지 않게. (0.55→1.0)
const CAM_EDGE_FADE = 26;   // 틸트 지도 가장자리 페이드 폭(캔버스 %). 바깥 블리드가 이 폭만큼 바다색으로 부드럽게 사라진다(하드컷 방지). 프레임(가운데)은 안 건드림.
const CAM_VOID_COL = '#0e2a4e';   // 3D 회전 시 지도 밖(먼 거리)을 채우는 색 = 바다 그라디언트 '가장 북쪽' 색과 동일 → 이음새 안 보임
const camBleedViewBox = () => `${-1920 * CAM_BLEED} ${-1080 * CAM_BLEED} ${1920 * (1 + 2 * CAM_BLEED)} ${1080 * (1 + 2 * CAM_BLEED)}`;
// 조상에 걸린 clip-path(노말 VF 패널 vfClip·블라인드 슬랫 bclipN/bclipHide 등)를 캔버스 클립으로 옮긴다.
// 글자는 래스터에서 빼고 캔버스에 따로 그리므로, 이걸 안 하면 SVG에선 잘린 글자가 추출물에만 찍힌다.
// clips = [[참조노드, 클립id], ...]. 빈 클립(도형 없음 = 다 가림)이면 false → 그 글자는 건너뛴다.
const _EXPORT_FONT_DEF = '"SUITE CG", "Malgun Gothic", sans-serif';
function applyExportTextClips(cx, clips, rootInv, sx, sy) {
  for (const [n, id] of clips) {
    const cp = document.getElementById(id);
    if (!cp || (cp.getAttribute('clipPathUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') continue;   // 앱 클립은 전부 userSpaceOnUse
    const kids = [...cp.children].filter((k) => /^(rect|path|circle)$/.test(k.tagName));
    if (!kids.length) return false;
    let cm; try { cm = rootInv ? rootInv.multiply(n.getScreenCTM()) : n.getCTM(); } catch (e) { cm = null; } if (!cm) continue;
    cx.setTransform(sx * cm.a, sy * cm.b, sx * cm.c, sy * cm.d, sx * cm.e, sy * cm.f);   // 클립 좌표 = 참조 노드의 유저 좌표계
    const P = new Path2D(); let rule = 'nonzero';
    for (const k of kids) {
      const num = (a) => parseFloat(k.getAttribute(a)) || 0;
      let sub = new Path2D();
      if (k.tagName === 'rect') sub.rect(num('x'), num('y'), num('width'), num('height'));
      else if (k.tagName === 'circle') sub.arc(num('cx'), num('cy'), num('r'), 0, Math.PI * 2);
      else sub = new Path2D(k.getAttribute('d') || '');
      let tm = null; try { const c = k.transform && k.transform.baseVal && k.transform.baseVal.consolidate(); if (c) { const q = c.matrix; tm = new DOMMatrix([q.a, q.b, q.c, q.d, q.e, q.f]); } } catch (e) { tm = null; }
      if (tm) P.addPath(sub, tm); else P.addPath(sub);   // 블라인드 슬랫은 rotate가 걸려 있다
      if (kids.length === 1 && k.getAttribute('clip-rule') === 'evenodd') rule = 'evenodd';
    }
    cx.clip(P, rule);
  }
  return true;
}
// 추출 글자를 '캔버스에 직접' SUITE로 그린다 — 크롬에서 <img> 안 SVG의 임베드 폰트가 안 먹는 문제를 확실히 우회.
// 라이브 SVG의 각 <text>의 실제 위치(getCTM)를 읽어 그대로 캔버스에 옮긴다. 폰트는 document.fonts에 올려둔 SUITE.
// 글자에 지정된 서체(font-family)·외곽선(stroke·paint-order)·fill-opacity와 조상 clip-path도 화면처럼 반영한다.
function solidFill(f) { if (!f || f === 'none') return '#FFFFFF'; if (String(f).indexOf('url') === 0) return '#FFFFFF'; return f; }
function drawExportTextOverlay(cx, keep, W, H) {
  const vb = (svg.viewBox && svg.viewBox.baseVal) || null;
  const vbw = (vb && vb.width) || 1920, vbh = (vb && vb.height) || 1080;
  const sx = W / vbw, sy = H / vbh;
  const sel = (keep && keep.length) ? keep.map((k) => '#' + k + ' text').join(',') : 'text';
  let els; try { els = svg.querySelectorAll(sel); } catch (e) { return; }
  // getCTM()은 브라우저에 따라 '화면 표시 스케일'을 포함해 어긋난다 → 루트 화면행렬의 역행렬로 정규화해 '뷰박스 유저단위' 좌표로.
  let rootInv = null; try { rootInv = svg.getScreenCTM().inverse(); } catch (e) { rootInv = null; }
  for (const t of els) {
    const txt = t.textContent; if (!txt || !txt.trim()) continue;
    // 숨김(레이어/요소) 스킵 + 조상 그룹 opacity 누적(라벨 등장 애니 = 그룹 opacity. 이걸 반영해야 숫자도 박스와 같이 페이드인 — 안 그러면 텍스트만 처음부터 100%로 찍힘)
    let hide = false, op = 1; const clips = [];
    for (let n = t; n && n !== svg; n = n.parentNode) {
      if (!n.getAttribute) continue;
      if (n.getAttribute('display') === 'none') { hide = true; break; }
      const st = n.style;
      if (st && (st.display === 'none' || st.visibility === 'hidden')) { hide = true; break; }
      const so = (st && st.opacity !== '' && st.opacity != null) ? st.opacity : n.getAttribute('opacity');   // style 우선, 없으면 속성
      if (so != null && so !== '') { const v = parseFloat(so); if (!isNaN(v)) op *= v; }
      const cpa = n.getAttribute('clip-path'); const cm = cpa && /url\(\s*['"]?#([^'")\s]+)/.exec(cpa);
      if (cm) clips.push([n, cm[1]]);
    }
    if (hide || op <= 0.001) continue;
    let m; try { m = rootInv ? rootInv.multiply(t.getScreenCTM()) : t.getCTM(); } catch (e) { m = null; } if (!m) continue;
    const cs = getComputedStyle(t);
    const fs = parseFloat(t.getAttribute('font-size')) || parseFloat(cs.fontSize) || 40;
    const fw = t.getAttribute('font-weight') || cs.fontWeight || '400';
    const anchor = t.getAttribute('text-anchor') || cs.textAnchor || 'start';
    const ls = parseFloat(t.getAttribute('letter-spacing')) || parseFloat(cs.letterSpacing) || 0;
    const domB = t.getAttribute('dominant-baseline') || cs.dominantBaseline || '';
    const x = parseFloat(t.getAttribute('x')) || 0, y = parseFloat(t.getAttribute('y')) || 0;
    const fam = t.getAttribute('font-family') || _EXPORT_FONT_DEF;   // 지정 서체(예: 비교 이름표 Wanted Sans) — 없으면 SUITE
    const setFont = (w) => { cx.font = `${w} ${fs}px ${_EXPORT_FONT_DEF}`; cx.font = `${w} ${fs}px ${fam}`; };   // 지정값이 이상하면 SUITE로 남는다
    const fOp = parseFloat(t.getAttribute('fill-opacity')); const fillA = op * (isNaN(fOp) ? 1 : fOp);
    const stCol = t.getAttribute('stroke'), stW = parseFloat(t.getAttribute('stroke-width')) || 0;
    const sOp = parseFloat(t.getAttribute('stroke-opacity')); const strokeA = op * (isNaN(sOp) ? 1 : sOp);
    const hasStroke = !!stCol && stCol !== 'none' && stW > 0;
    const strokeFirst = /^\s*stroke/.test(t.getAttribute('paint-order') || '');
    // 한 조각 그리기 — paint-order가 stroke면 외곽선 먼저(글자 위를 안 덮음), 아니면 채움 먼저
    const paint = (s, px, py, fill) => {
      const doStroke = () => { if (!hasStroke) return; cx.globalAlpha = strokeA; cx.strokeStyle = solidFill(stCol); cx.lineWidth = stW; cx.lineJoin = t.getAttribute('stroke-linejoin') || 'miter'; cx.strokeText(s, px, py); };
      const doFill = () => { cx.globalAlpha = fillA; cx.fillStyle = solidFill(fill); cx.fillText(s, px, py); };
      if (strokeFirst) { doStroke(); doFill(); } else { doFill(); doStroke(); }
    };
    cx.save();
    if (clips.length && !applyExportTextClips(cx, clips, rootInv, sx, sy)) { cx.restore(); continue; }   // 클립에 완전히 가려진 글자
    cx.globalAlpha = op;   // 그룹 등장 opacity를 텍스트에도 적용
    cx.setTransform(sx * m.a, sy * m.b, sx * m.c, sy * m.d, sx * m.e, sy * m.f);   // local → canvas
    setFont(fw);
    cx.textAlign = anchor === 'middle' ? 'center' : (anchor === 'end' ? 'right' : 'left');
    cx.textBaseline = /central|middle/.test(domB) ? 'middle' : 'alphabetic';
    try { cx.letterSpacing = ls + 'px'; } catch (e) {}
    const tspans = t.querySelectorAll('tspan');
    if (tspans.length) {   // 부분 색/굵기 — 각 tspan을 이어서 그린다
      const segs = []; let total = 0;
      for (const ts of tspans) { const s = ts.textContent || ''; setFont(ts.getAttribute('font-weight') || fw); const w = cx.measureText(s).width; segs.push({ s, w, fill: ts.getAttribute('fill') || t.getAttribute('fill'), fw: ts.getAttribute('font-weight') || fw }); total += w; }
      let startX = x; if (cx.textAlign === 'center') startX = x - total / 2; else if (cx.textAlign === 'right') startX = x - total;
      cx.textAlign = 'left';
      let px = startX;
      for (const seg of segs) { setFont(seg.fw); paint(seg.s, px, y, seg.fill); px += seg.w; }
    } else {
      paint(txt, x, y, t.getAttribute('fill') || cs.fill);
    }
    cx.restore();
  }
  cx.setTransform(1, 0, 0, 1, 0, 0);
}
// 추출용 복제본에서 편집 UI(선택·가이드·핸들·VF 가짜영상·브러쉬 커서·브러쉬 영역 강조·참고 이미지(대고 그리기용, 편집 핸들 포함)) 제거.
// <img> 안 SVG엔 문서 CSS가 없어 남기면 검게 찍힌다. (svgToImage·svgBlob·previewPng 공용 — 목록을 한 곳에서 관리)
const EXPORT_STRIP = ['#L_sel', '#L_guides', '#L_grips', '#L_insetHits', '#L_guide', '#L_vfPreview', '#brushCursor', '#L_refImg'];
function stripExportUi(clone) {
  for (const s of EXPORT_STRIP) clone.querySelector(s)?.remove();
  clone.querySelectorAll('.brushSelHi, .brushLive').forEach((n) => n.remove());   // 브러쉬 라이브 캔버스(드래그 중 전용)도 뺀다
}
// 서울: 레이어 분리(mutate)로 존 칠을 비우거나 베이스로 되돌렸으면 한강 위 칠 오버레이(#seoulPaintTop)도 그 존을 따른다
// (안 그러면 베이스·시도선·브러쉬·경계선 레이어에 모든 칠 색이 처음부터 찍힌다). 칠한 존이 하나도 안 남은 투명 레이어엔 한강도 뺀다.
function syncSeoulExport(clone) {
  const top = clone.querySelector('#seoulPaintTop');
  if (!top || !isSeoul()) return;
  const zf = new Map();
  clone.querySelectorAll('#gMain .zone').forEach((z) => zf.set(z.dataset.id, z.getAttribute('fill') || 'none'));
  const base = (S.base || '').toUpperCase();
  for (const p of [...top.children]) {
    const f = zf.get(p.dataset.id);
    if (!f || f === 'none' || f.toUpperCase() === base) p.remove(); else p.setAttribute('fill', f);
  }
  if (![...zf.values()].some((f) => f !== 'none')) clone.querySelector('#seoulRiver')?.remove();
}
// 실시간 Mapbox 타일: 외부 URL은 래스터(<img> 안 SVG)에서 안 뜨므로 캐시된 data URI로 바꿔 끼운다. 없으면 제거(빈 참조 방지).
// 영상 프레임(svgToImage)과 이미지·AE 추출(svgBlob)이 같이 쓴다 — 렌더 전에 awaitMapboxTilesReady()로 캐시를 채워 둔다.
function inlineMapboxTiles(clone) {
  clone.querySelectorAll('#typhoonTiles image[data-url]').forEach((im) => {
    const durl = _tileData[im.getAttribute('data-url')];
    if (durl) { im.setAttribute('href', durl); try { im.removeAttribute('crossorigin'); } catch (e) {} }
    else im.remove();
  });
}
// 지금 SVG를 그림 한 장으로. 영상 추출이 프레임마다 부른다. keep 주면 그 레이어만, viewBox 주면 그 영역으로.
// stripText=true면 <text>를 빼고 래스터(글자는 drawExportTextOverlay가 캔버스에 직접 그린다).
async function svgToImage(W, H, keep, viewBox, stripText, fontsUsedOnly) {
  brushFinalize();   // 브러쉬 이미지 갱신이 남았으면 먼저 끝낸다(복제본에 최신 그림)
  const clone = svg.cloneNode(true);
  if (stripText) clone.querySelectorAll('text').forEach((n) => n.remove());
  clone.setAttribute('width', W);
  clone.setAttribute('height', H);
  // 뷰박스(16:9)를 출력 크기에 꽉 채운다 — 터치(2158×1214)는 가로·세로 배율이 1.12396 대 1.12407로 달라,
  // 기본값(xMidYMid meet)이면 위·아래에 0.06px 빈칸이 생겨 맨 위·아래 줄이 반투명(알파 239)이 된다.
  clone.setAttribute('preserveAspectRatio', 'none');
  if (viewBox) clone.setAttribute('viewBox', viewBox);
  stripExportUi(clone);
  if (keep) for (const k of ALL_LAYERS) if (!keep.includes(k)) clone.querySelector('#' + k)?.remove();
  if (keep && !keep.includes('L_map')) clone.querySelector('#L_mapBase')?.remove();   // 블라인드 베이스 지도는 L_map과 같이 빠진다(3D 오버레이·정적 캐시)
  inlineMapboxTiles(clone);
  clone.querySelector('#fontStyle').textContent = fontsUsedOnly ? await suiteFontCssFor(clone) : await suiteFontCss();   // fontsUsedOnly = 미리보기 래스터(쓰는 굵기만)
  const xml = new XMLSerializer().serializeToString(clone);
  // data: URL로 렌더 — blob: URL은 브라우저에 따라 <img> 안 SVG의 base64 @font-face(SUITE)가 첫 렌더에 안 먹어 폴백 폰트로 새는 일이 있다. data:는 자체완결이라 폰트까지 확실히 적용된다.
  const img = new Image();
  img.decoding = 'sync';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  await img.decode();
  return img;
}

// 텍스처 삼각형 — src 삼각형을 dst 삼각형으로 어파인 매핑해 이미지 조각을 그린다(메시 워프용).
function drawTexTri(cx, img, s0, s1, s2, d0, d1, d2) {
  cx.save();
  cx.beginPath(); cx.moveTo(d0[0], d0[1]); cx.lineTo(d1[0], d1[1]); cx.lineTo(d2[0], d2[1]); cx.closePath(); cx.clip();
  const x0 = s0[0], y0 = s0[1], x1 = s1[0], y1 = s1[1], x2 = s2[0], y2 = s2[1];
  const u0 = d0[0], v0 = d0[1], u1 = d1[0], v1 = d1[1], u2 = d2[0], v2 = d2[1];
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) > 1e-6) {
    const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / det;
    const b = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / det;
    const c = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det;
    const d = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / det;
    cx.setTransform(a, c, b, d, u0 - a * x0 - b * y0, v0 - c * x0 - d * y0);
    cx.drawImage(img, 0, 0);
    cx.setTransform(1, 0, 0, 1, 0, 0);
  }
  cx.restore();
}
// 이미지 가장자리를 바깥으로 갈수록 투명하게(가로·세로 그라디언트 교집합) — 틸트 때 지도 끝이 딱 잘리지 않고 부드럽게 사라지게.
function fadeEdgesCanvas(img, w, h, f) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, w, h);
  x.globalCompositeOperation = 'destination-in';
  const grad = (x0, y0, x1, y1) => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(f, '#000'); g.addColorStop(1 - f, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; };
  x.fillStyle = grad(0, 0, w, 0); x.fillRect(0, 0, w, h);   // 좌우 페이드
  x.fillStyle = grad(0, 0, 0, h); x.fillRect(0, 0, w, h);   // 상하 페이드(destination-in 두 번 = 교집합 = 4변 박스 페이드)
  x.globalCompositeOperation = 'source-over';
  return c;
}
// 확장 지도 이미지(블리드 포함, 프레임보다 큼)를 임의 3D 회전(rx,ry,rz)+원근으로 메시 워프. 프레임(W×H) 중앙 기준.
function warpTilt3D(cx, img, W, H) {
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;   // 확장 이미지 크기(프레임px 단위)
  img = fadeEdgesCanvas(img, iw, ih, CAM_EDGE_FADE / 100);   // 가장자리 부드럽게(미리보기 #camCanvas 마스크와 동일)
  const m = S.map3d || {};
  const rx = (+m.rx || 0) * Math.PI / 180, ry = (+m.ry || 0) * Math.PI / 180, rz = (+m.rz || 0) * Math.PI / 180;
  const P = (m.persp == null ? 2.2 : +m.persp) * W;
  const cx0 = W / 2, cy0 = H / 2;
  const cxr = Math.cos(rx), sxr = Math.sin(rx), cyr = Math.cos(ry), syr = Math.sin(ry), czr = Math.cos(rz), szr = Math.sin(rz);
  const proj = (X, Y) => {                                       // X,Y = 프레임px, 프레임 중앙 기준
    let x = X * czr - Y * szr, y = X * szr + Y * czr;           // Rz(방위)
    let x2 = x * cyr, z2 = -x * syr;                            // Ry
    let y3 = y * cxr - z2 * sxr, z3 = y * sxr + z2 * cxr;       // Rx(기울임)
    const f = P / (P - z3);
    return [cx0 + x2 * f, cy0 + y3 * f];
  };
  const N = 24, sw = iw / N, sh = ih / N;
  const D = (px, py) => proj(px - iw / 2, py - ih / 2);         // 이미지 중앙(=프레임 중앙) 기준
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const ax = i * sw, ay = j * sh, bx = ax + sw, by = ay + sh;
    const s00 = [ax, ay], s10 = [bx, ay], s11 = [bx, by], s01 = [ax, by];
    const d00 = D(ax, ay), d10 = D(bx, ay), d11 = D(bx, by), d01 = D(ax, by);
    drawTexTri(cx, img, s00, s10, s11, d00, d10, d11);
    drawTexTri(cx, img, s00, s11, s01, d00, d11, d01);
  }
}
// 추출 정적 레이어 캐시 — 카메라 애니가 없으면 지도·제목·범례는 프레임마다 동일하므로 1회만 래스터해 재사용(빠름).
let _expBaseBelow = null, _expBaseAbove = null;
function clearExportCache() { _expBaseBelow = _expBaseAbove = null; }
async function _rasterCanvasLayers(W, H, layers) {
  const img = await svgToImage(W, H, layers, null, true);   // 글자 빼고 래스터
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, W, H);
  drawExportTextOverlay(cx, layers, W, H);   // 글자는 캔버스에 SUITE로 직접
  return c;
}
// 추출 한 프레임을 캔버스에 그린다. 카메라 3D 회전이 있으면 '지도 레이어만'(블리드 포함) 워프하고 오버레이(제목·범례)는 평면으로 덮는다.
// 렌더 전 Mapbox 실시간 타일을 data URI로 확보(현재 뷰). 준비될 때까지 대기 → 타일 미로딩 채로 렌더되는 것 방지.
async function awaitMapboxTilesReady(timeout = 8000) {
  const T = S.typhoon;
  if (!(isTyphoon() && T && T.basemap === 'mapbox' && mapboxTileTemplate())) return;
  updateMapboxTiles();   // 디바운스 우회 — 현재 뷰 타일 즉시 채움
  const g = $('#typhoonTiles'); if (!g) return;
  const urls = [...g.querySelectorAll('image[data-url]')].map((im) => im.getAttribute('data-url'));
  urls.forEach((u) => fetchTileData(u));
  const t0 = performance.now();
  while (urls.some((u) => _tileData[u] == null)) {   // null(진행중)·undefined(미시작) 둘 다
    if (performance.now() - t0 > timeout) break;
    await new Promise((r) => setTimeout(r, 50));
  }
}
async function drawExportFrame(cx, W, H) {
  await awaitMapboxTilesReady();   // 실시간 타일이면 그 프레임 뷰의 타일이 로드된 뒤 캡처
  cx.clearRect(0, 0, W, H);
  if (!camActive3d()) {
    // 카메라 애니(지도 이동)가 없으면 지도·제목·범례는 매 프레임 동일 → 1회만 굽고, 변하는 태풍 레이어만 프레임마다 합성(전체 재래스터 ~100ms → ~40ms).
    // 노말 VF는 래퍼(L_vfWrap)에 진입 슬라이드·페이드가 프레임마다 걸리므로 캐시하면 첫 프레임(투명) 상태로 굳는다 → 매 프레임 전체 래스터.
    if (isTyphoon() && !camKeys().length && S.res !== '1920x1080-vf') {
      if (!_expBaseBelow) _expBaseBelow = await _rasterCanvasLayers(W, H, ['L_bg', 'L_sea', 'L_map', 'L_boxes', 'L_mtn']);
      if (!_expBaseAbove) _expBaseAbove = await _rasterCanvasLayers(W, H, ['L_vfBar', 'L_labels', 'L_title', 'L_legend']);
      cx.drawImage(_expBaseBelow, 0, 0);
      const typh = await svgToImage(W, H, ['L_typhoon', 'L_typhoonLabels'], null, true);   // 글자 빼고
      cx.drawImage(typh, 0, 0, W, H);
      drawExportTextOverlay(cx, ['L_typhoon'], W, H);   // 아이콘 안 글자('저'·강도 숫자) — 위에서 글자를 뺐으니 다시 그린다(제목·범례보다 아래)
      cx.drawImage(_expBaseAbove, 0, 0);
      drawExportTextOverlay(cx, ['L_typhoonLabels'], W, H);   // 태풍 라벨 글자는 캔버스에 SUITE로 (제목·범례는 _expBaseAbove에 이미 그려짐)
      return;
    }
    const img = await svgToImage(W, H, null, null, true); cx.drawImage(img, 0, 0, W, H);   // 글자 빼고
    drawExportTextOverlay(cx, null, W, H); return;   // 모든 글자 캔버스에 SUITE로
  }
  if (S.res !== '1920x1080-vf') { cx.fillStyle = CAM_VOID_COL; cx.fillRect(0, 0, W, H); }   // 회전 시 지도 밖은 바다색으로(투명 방지 · 미리보기와 동일). 노말 VF는 알파 출력이라 패널 밖은 투명 유지
  const exW = Math.round(W * (1 + 2 * CAM_BLEED)), exH = Math.round(H * (1 + 2 * CAM_BLEED));
  const mapImg = await svgToImage(exW, exH, CAM_MAP_LAYERS, camBleedViewBox());   // 프레임 밖 여백까지 렌더(지도만 — 글자 없음)
  warpTilt3D(cx, mapImg, W, H);                        // 지도(+태풍)만 3D 회전(밖 여백은 CAM_VOID_COL=바다 북쪽색으로 이어짐)
  const ov = await svgToImage(W, H, CAM_OVERLAY_LAYERS, null, true);   // 오버레이(글자 빼고)
  cx.drawImage(ov, 0, 0, W, H);                          // 제목·범례·가이드는 평면으로 위에
  drawExportTextOverlay(cx, CAM_OVERLAY_LAYERS, W, H);   // 오버레이 글자 캔버스에 SUITE로
}
