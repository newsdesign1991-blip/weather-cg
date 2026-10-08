/* [모듈] js/view-camera.js — 작업창 줌·맞춤(sizeFit·applyView)·틸트 래스터, 더블클릭 인라인 편집, Alt 카메라 조작(팬·줌·휠) */
'use strict';

// ===================== 작업창 줌 (출력물과 무관, 보기 전용) =====================
const fit = document.querySelector('.fit');
const stage = $('#stage');
const view = { z: 1, x: 0, y: 0 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// .fit 박스를 스테이지 안에 '정확히 해상도 비율'로 레터박스한다 (CSS aspect-ratio가 좁고 낮은 영역에서 가로로 왜곡되는 문제 해결).
function sizeFit() {
  if (!fit) return;
  const st = $('#stage'); if (!st) return;
  const cs = getComputedStyle(st);
  const availW = st.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const availH = st.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
  if (availW <= 0 || availH <= 0) return;
  const sz = (typeof RES !== 'undefined' && RES[S.res] && RES[S.res].size) || [1920, 1080];
  const ar = sz[0] / sz[1];
  let w = availW, h = w / ar;
  if (h > availH) { h = availH; w = h * ar; }
  fit.style.width = w.toFixed(2) + 'px';
  fit.style.height = h.toFixed(2) + 'px';
}
function applyView() {
  brushViewRev++;   // 화면 확대·이동이 바뀌면 칠하는 중 화면→지도 좌표 변환을 다시 구하게
  sizeFit();
  fit.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  $('#zoomV').textContent = Math.round(view.z * 100) + '%';
  applyTilt();
}
// 프레임 가이드 라벨을 '실제 출력 해상도'로. .fit 박스 비율도 그 해상도에 맞춘다(가이드=실제 렌더영역).
function updateFrameGuideLabel() {
  const fg = document.querySelector('#frameGuide'); if (!fg) return;
  const sz = (typeof RES !== 'undefined' && RES[S.res] && RES[S.res].size) || [1920, 1080];
  fg.dataset.label = `${sz[0]} × ${sz[1]} 프레임`;
  sizeFit();   // 해상도 비율로 박스 다시 잡는다
}
// 카메라 3D 회전(미리보기) — '지도만' 기울인다. 지도 레이어를 #camCanvas에 래스터해 CSS로 기울이고,
// #cg의 지도 레이어는 숨겨(뒤 캔버스가 비침) 제목·범례는 평면으로 위에 남긴다. 추출은 drawExportFrame가 같은 원근으로 합성.
let _tiltRasterSig = null, _camRasterToken = 0, _exportingFrames = false;
let _camRasterBusy = false, _camDragging = false;   // 재래스터 동시 1개(coalesce) · 드래그 중 저해상 플래그
let _tiltPanCanvas = null, _tiltPanBase = null;     // 틸트 팬: 시작 때 캔버스 텍스처를 얼려 두고 드래그 중엔 즉시 이동(재래스터 지연 제거)
let _wheelZoomTimer = 0, _wheelZoomBase = null;     // 휠 줌 GPU: 휠 도는 동안 CSS transform, 멈추면 1회 확정
let _wheelUndoArmed = true, _wheelUndoTimer = 0;    // 휠 줌 undo: 한 번 도는 동안(연속 휠) undo는 1회만 쌓는다
const camActive3d = () => { const m = S.map3d || {}; return !!m.on && (Math.abs(+m.rx || 0) > 0.05 || Math.abs(+m.ry || 0) > 0.05 || Math.abs(+m.rz || 0) > 0.05); };
// 회전만 바뀔 때(드래그) — 캔버스 CSS transform만 갱신. 래스터·리렌더 없음 → 아주 가볍고 부드럽다.
function updateCamCanvasTransform() {
  const m = S.map3d || {}, cv = document.querySelector('#camCanvas');
  if (cv) cv.style.transform = `rotateX(${+m.rx || 0}deg) rotateY(${+m.ry || 0}deg) rotateZ(${+m.rz || 0}deg)`;
}
function applyTilt() {
  if (_exportingFrames) return;   // 추출은 drawExportFrame가 직접 합성한다 — 미리보기 캔버스는 건드리지 않음
  const m = S.map3d || {};
  const on = camActive3d();
  const cg = document.querySelector('#cg'), cv = document.querySelector('#camCanvas');
  if (cg) cg.style.transform = '';                 // 전체 SVG는 절대 안 기울인다
  fit.classList.toggle('mapTilt', on);
  if (typeof updatePlaceMarkers === 'function') updatePlaceMarkers();   // 지명표시를 현재 틸트/회전에 맞춤(토글·각도변경 포함)
  const pv = document.querySelector('#camClip') || fit;   // 원근은 캔버스의 부모(클립 래퍼)에 건다
  if (!on) { pv.style.perspective = ''; if (cv) { cv.style.display = 'none'; cv.style.transform = ''; cv.style.maskImage = cv.style.webkitMaskImage = ''; } _tiltRasterSig = null; return; }
  const P = (m.persp == null ? 2.2 : +m.persp) * (cg ? cg.clientWidth || 1920 : 1920);
  pv.style.perspective = P + 'px';
  pv.style.perspectiveOrigin = 'center center';
  if (!cv) return;
  cv.style.display = '';
  // 캔버스를 프레임보다 크게(중앙 정렬) — 밖의 여백(블리드)이 기울임·축소 때 채워지게. clip-path가 프레임으로 자른다.
  cv.style.left = (-100 * CAM_BLEED) + '%'; cv.style.top = (-100 * CAM_BLEED) + '%';
  cv.style.width = (100 * (1 + 2 * CAM_BLEED)) + '%'; cv.style.height = (100 * (1 + 2 * CAM_BLEED)) + '%';
  // 가장자리(블리드) 부드러운 페이드 — 기울였을 때 지도 끝(특히 북쪽 육지)이 '딱' 잘리지 않고 바다색으로 스르륵 사라지게.
  // 프레임(가운데 1/(1+2B))은 완전 불투명, 바깥 블리드만 페이드. 두 방향 그라디언트를 교집합(intersect)해 4변 모두 부드럽게.
  { const F = CAM_EDGE_FADE, g = `linear-gradient(to right, transparent 0, #000 ${F}%, #000 ${100 - F}%, transparent 100%), linear-gradient(to bottom, transparent 0, #000 ${F}%, #000 ${100 - F}%, transparent 100%)`;
    cv.style.webkitMaskImage = cv.style.maskImage = g;
    cv.style.webkitMaskComposite = 'source-in'; cv.style.maskComposite = 'intersect'; }
  updateCamCanvasTransform();
  // 지도 위치(S.map)·재생 프레임(animT)·내용 리비전(칠·태풍·되돌리기)이 바뀔 때만 다시 래스터. 회전만 바뀌면 CSS transform만 갱신(부드럽게).
  // 드래그 중(',d')엔 저해상으로 굽고, 놓으면 사인이 바뀌어 고해상으로 다시 굽는다.
  const sig = Math.round(S.map.x) + ',' + Math.round(S.map.y) + ',' + (+S.map.s).toFixed(4) + ',' + ((_camVfScale() || {}).k || 1) + (animT != null ? ',' + animT.toFixed(2) : '') + (_camDragging ? ',d' : '') + ',' + _mapContentRev;   // VF 전체 크기·지도 내용 리비전도 래스터에 들어가므로 사인에 포함
  if (sig !== _tiltRasterSig) { _tiltRasterSig = sig; if (!_camRasterBusy) rasterTiltCanvas(cv); }
}
// 틸트 미리보기 캔버스 재래스터 — 동시 1개만(coalesce). 드래그 중엔 저해상(0.5)으로 가볍게, 놓으면 고해상.
// 굽는 사이 더 최신 요청(_tiltRasterSig 변경)이 오면 끝난 뒤 한 번 더 → 항상 최신으로 수렴, 큐가 안 쌓임.
function rasterTiltCanvas(cv) {
  if (!cv) return;
  _camRasterBusy = true;
  const doing = _tiltRasterSig;
  const q = _camDragging ? 0.5 : 1;
  const exW = Math.round(1920 * (1 + 2 * CAM_BLEED) * q), exH = Math.round(1080 * (1 + 2 * CAM_BLEED) * q);
  svgToImage(exW, exH, CAM_MAP_LAYERS, camBleedViewBox()).then((img) => {
    if (cv.width !== exW) cv.width = exW; if (cv.height !== exH) cv.height = exH;
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, exW, exH); ctx.drawImage(img, 0, 0, exW, exH);
    _camRasterBusy = false;
    if (_tiltRasterSig !== doing && camActive3d()) rasterTiltCanvas(cv);
  }).catch(() => { _camRasterBusy = false; });
}
function zoomFit() { view.z = 1; view.x = 0; view.y = 0; applyView(); }

// 아트보드 고정 — 작업창(아트보드) 휠 확대·가운데버튼 이동은 끈다(항상 화면 맞춤 z=1). 지도 확대/이동은 Alt+휠·이동 모드로.
// 휠은 막지 않는다(메뉴 드롭다운·타임라인 스크롤이 살아야 함). Ctrl+휠 브라우저 확대만 막는다.
stage.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
// 가운데 버튼(휠 클릭): 브라우저 자동 스크롤만 막는다(작업창 이동 없음)
stage.addEventListener('pointerdown', (e) => { if (e.button === 1) e.preventDefault(); });

// ===================== 더블클릭 인라인 편집 =====================
function inlineEdit(kind, id) {
  const it = itemOf({ kind, id });
  if (!it) return;
  const node = svg.querySelector(`[data-kind="${kind}"][data-id="${id}"]`);
  // 라벨 유리(뒷배경 use)가 그룹 bbox를 부풀리므로 '카드 rect'로 위치·크기를 잰다(글꼴 폭주 방지).
  const cardR = kind === 'label' ? [...node.children].find((c) => c.tagName === 'rect') : null;
  const r = (cardR || node).getBoundingClientRect();
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = it.txt;
  const fs = Math.max(12, r.height * 0.8);
  inp.style.cssText = `position:fixed; left:${r.left - 6}px; top:${r.top - 4}px;
    width:${Math.max(r.width + 40, 120)}px; height:${r.height + 8}px;
    font-family:'SUITE CG','Malgun Gothic',sans-serif; font-size:${fs}px; font-weight:${it.w == null ? 500 : it.w};
    color:#fff !important; background:rgba(12,18,34,.96) !important; border:2px solid #3b82f6; border-radius:4px;
    padding:0 6px; z-index:9999; outline:none;`;
  document.body.append(inp);
  inp.focus(); inp.select();

  const orig = it.txt;
  pushUndo();
  let done = false;
  const finish = (keep) => {
    if (done) return;
    done = true;
    it.txt = keep ? inp.value : orig;
    if (!keep) undoStack.pop(); // 취소했으면 되돌리기 기록도 남기지 않는다
    renderTexts(); renderLabels(); renderMtns(); renderSel(); refreshPanel(); updateUndoBtns();
    inp.remove();
  };
  inp.oninput = () => { it.txt = inp.value; renderTexts(); renderLabels(); renderMtns(); renderSel(); };
  inp.onblur = () => finish(true);
  inp.onkeydown = (ev) => {
    ev.stopPropagation(); // 방향키/Delete가 캔버스 단축키로 새는 것 방지
    if (ev.key === 'Enter') finish(true);
    if (ev.key === 'Escape') finish(false);
  };
}

svg.addEventListener('dblclick', (e) => {
  const d = e.target.closest('.drag');
  if (!d) return;
  const s = { kind: d.dataset.kind, id: d.dataset.id };
  if (!s.kind || !itemOf(s)) return;   // 범례·지명 이름표 등 편집 불가 항목은 선택을 건드리지 않음
  e.preventDefault();
  sel = [s]; // 인라인 편집은 하나만
  refreshPanel(); renderSel();
  inlineEdit(s.kind, s.id);
});

// ===== 카메라 조작 (영상 추출 모드 · Alt + 마우스) — 지도+태풍만 움직인다(제목·범례 고정) =====
const camEditActive = () => $('#timeline') && $('#timeline').classList.contains('on');
function zoomMapAbout(cx, cy, news) {
  news = Math.max(0.02, Math.min(4, news));
  const pcx = (cx - S.map.x) / S.map.s, pcy = (cy - S.map.y) / S.map.s;
  S.map.s = news; S.map.x = cx - pcx * news; S.map.y = cy - pcy * news;
}
let _altGestureUntil = 0;   // Alt+오른쪽 줌 직후 시각 — 이때 오는 contextmenu는 무시
const camMoveActive = () => camEditActive() || isTyphoon();   // 팬/줌은 작업창(태풍 지도)에서도, 3D 회전은 영상 추출 모드에서만
// 카메라 조작 안내(#camGuide)를 타임라인 '바로 위'(좌하단)에 놓는다 — 타임라인 높이가 바뀌면 따라 올라간다.
function syncCamGuidePos() {
  const g = $('#camGuide'); if (!g) return;
  const tl = $('#timeline');
  const h = (tl && tl.classList.contains('on')) ? tl.getBoundingClientRect().height : 0;
  g.style.top = 'auto';
  g.style.bottom = (h + 10) + 'px';
  // 타임라인을 높이 끌어 올려 안내가 맨 위 제목줄까지 닿으면 숨긴다(제목줄 메뉴를 가리지 않게) — 다시 내리면 보인다
  const fits = window.innerHeight - h - 10 - g.offsetHeight >= titleBarH() + 8;
  g.style.visibility = fits ? '' : 'hidden';
}
// 좌하단 조작법 힌트에 'Alt 지도 조작법'을 보인다 — Alt 조작이 실제로 되는 태풍/추출 모드에서만. 3D회전은 추출 모드에서만.
function syncMapAltHint() {
  const h = $('#mapAltHint'); if (!h) return;
  h.style.display = camMoveActive() ? '' : 'none';
  const rot = $('#mapAltRot'), rd = $('#mapAltRotDot'), showRot = camEditActive() ? '' : 'none';
  if (rot) rot.style.display = showRot; if (rd) rd.style.display = showRot;
}
svg.addEventListener('pointerdown', (e) => {
  if (!e.altKey) return;
  const btn = e.button;                 // 0 왼쪽=3D회전(XYZ, 타임라인에서만), 1 휠클릭=팬, 2 오른쪽=줌
  if (btn === 0 && !camEditActive()) return;             // 3D 회전은 영상 추출 모드에서만
  if ((btn === 1 || btn === 2) && !camMoveActive()) return;
  if ((btn === 1 || btn === 2) && S.mapLock) {   // 지도 잠금: 팬/줌 차단
    e.preventDefault(); e.stopPropagation(); status('지도가 잠겨 있습니다 — 잠금을 풀어야 이동·확대됩니다', true);
    if (btn === 2) window.addEventListener('pointerup', () => { _altGestureUntil = performance.now() + 400; }, { once: true });   // 놓을 때 우클릭 메뉴·지우기 막기
    return;
  }
  e.preventDefault(); e.stopPropagation();
  const p0 = toUser(e), sx = e.clientX, sy = e.clientY;
  const m0 = { x: S.map.x, y: S.map.y, s: S.map.s }, r0 = camRot();
  if ((btn === 1 || btn === 2) && camActive3d()) _camDragging = true;   // 틸트 팬/줌 드래그: 저해상으로 가볍게
  if (btn === 1 && camActive3d()) {   // 틸트 팬: 현재 캔버스 텍스처를 얼려 둔다(드래그 중 즉시 이동용)
    const cv = $('#camCanvas');
    if (cv && cv.width) { _tiltPanCanvas = document.createElement('canvas'); _tiltPanCanvas.width = cv.width; _tiltPanCanvas.height = cv.height; _tiltPanCanvas.getContext('2d').drawImage(cv, 0, 0); _tiltPanBase = { x: S.map.x, y: S.map.y }; }
  }
  if ((btn === 1 || btn === 2) && !camActive3d()) setFlatPanLOD(true);  // 평면 팬/줌 드래그: 무거운 지형음영 숨기고 레이어 GPU 승격 → 빠르게
  let rotReady = false, rotOn = false, panRAF = 0, moved = false;
  const move = (ev) => {
    if ((btn === 1 || btn === 2) && !moved) pushUndo('mapmove');   // 팬/줌 제스처당 undo 1회(실수 이동 되돌리기)
    if (btn === 1) {                    // 팬 — 지도+태풍만
      const p = toUser(ev); S.map.x = m0.x + (p.x - p0.x); S.map.y = m0.y + (p.y - p0.y); moved = true;
      if (!panRAF) panRAF = requestAnimationFrame(() => { panRAF = 0; lightPanZoom(m0); });
    } else if (btn === 2) {             // 줌 — 화면 중심 기준
      zoomMapAbout(960, 540, m0.s * Math.exp((ev.clientX - sx) * 0.006)); moved = true;
      if (!panRAF) panRAF = requestAnimationFrame(() => { panRAF = 0; lightPanZoom(m0); });
    } else {                            // 3D 회전(구글지도식) — 위=기울임, 좌우=방위. 초경량: 캔버스 transform만.
      const tilt = Math.max(0, Math.min(72, r0.rx + (sy - ev.clientY) * 0.22));
      const bearing = r0.rz + (ev.clientX - sx) * 0.3;
      setCamRot(tilt, 0, bearing);
      const on = camActive3d();   // 평면↔틸트가 바뀔 때마다 applyTilt(캔버스 표시·mapTilt), 아니면 CSS 회전만
      if (!rotReady || on !== rotOn) { applyTilt(); rotReady = true; rotOn = on; } else updateCamCanvasTransform();
      updateTyphoonLeaders();   // 회전 중에도 지시선이 지점을 따라오게(라벨 박스는 화면 고정)
    }
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    if (panRAF) cancelAnimationFrame(panRAF);
    _camDragging = false;   // 드래그 끝 → 다음 applyTilt는 고해상으로 다시 굽는다(사인에서 ',d' 빠짐)
    _tiltPanCanvas = null; _tiltPanBase = null;   // 얼린 텍스처 해제 → 아래 applyTilt가 정확히 다시 굽는다
    if (btn === 2) _altGestureUntil = performance.now() + 400;   // 오른쪽 줌을 놓으며 오는 contextmenu는 무시(구역 지우기·브라우저 메뉴 방지)
    if (moved && (btn === 1 || btn === 2)) {
      // 평면 팬/줌: 라벨 박스를 이동량만큼 실제로 옮겨 '지도에 붙은 채' 유지(놓을 때 원위치로 튀지 않게). 틸트는 빌보드라 제외.
      { const r = S.map.s / (m0.s || 1); shiftMapAttached(S.map.x - m0.x * r, S.map.y - m0.y * r, r); }   // 비교 라벨도 함께(팬 시 이름표 튐 방지)
      if (btn === 2) renderStrokeScale();   // 줌: 경계선 굵기 보정(÷배율) 다시
      renderMapTransform();   // 최종 위치를 속성 transform(#bgMapT/#mapT)으로 확정 + 태풍 재구성(내부에서 renderTyphoon)
      applyTilt();
    }  // 끝날 때만 정확히 재구성
    if (btn === 0 && rotReady) applyTilt();   // 회전을 놓을 때 최종 상태로 한 번 더 확정
    setFlatPanLOD(false);   // 지형음영 복원 + GPU(CSS) transform 해제 — 속성이 이미 최종값이라 안 튐
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}, true);
// 평면 팬/줌 드래그 성능 — 무거운 지형음영(필터+클립 이미지)을 잠깐 숨기고, 움직이는 레이어를 GPU 레이어로 승격.
// 드래그 끝 up()에서 다시 렌더하며 원복. (틸트 팬은 캔버스 저해상 coalesce가 따로 처리)
function setFlatPanLOD(on) {
  // GPU 합성이라 지형음영을 켠 채로도 부드러움(깜빡임 없음). #bgMapT/#mapT는 renderTyphoon이 태풍모드 내내 GPU로 데워두니 여기선 안 건드리고,
  // 경로·라벨 레이어만 드래그 동안 승격. 끝나면 transform만 해제(#bgMapT will-change는 유지).
  for (const id of ['L_typhoon', 'L_typhoonLabels', 'L_refImg']) {
    const n = document.querySelector('#' + id); if (!n) continue;
    if (on) { n.style.willChange = 'transform'; n.style.transformBox = 'view-box'; n.style.transformOrigin = '0 0'; }
    else { n.style.willChange = ''; n.style.transformBox = ''; n.style.transformOrigin = ''; n.style.transform = ''; }
  }
  if (!on) {
    const bg = document.querySelector('#bgMapT'), mt = document.querySelector('#mapT'), mb = document.querySelector('#L_mapBase [data-blindmapt]'), se = document.querySelector('#seaT');
    if (bg) bg.style.transform = ''; if (mt) mt.style.transform = ''; if (mb) mb.style.transform = ''; if (se) se.style.transform = '';
  }
}
// 틸트 팬: 시작 때 얼려둔 #camCanvas 텍스처(블리드 포함, 평면)를 팬량만큼 즉시 옮겨 그린다 — SVG 재래스터가 없어 지연이 사라진다.
// (평면 텍스처를 옮긴 뒤 CSS가 틸트를 입히므로 결과는 정확한 평면 팬. 놓을 때 up()에서 정확히 다시 굽는다.)
function tiltPanShift() {
  const cv = $('#camCanvas'); if (!cv || !_tiltPanCanvas || !_tiltPanBase) { applyTilt(); return; }
  const q = cv.width / (1920 * (1 + 2 * CAM_BLEED));   // 캔버스 px / 프레임(viewBox) 단위
  const dx = (S.map.x - _tiltPanBase.x) * q, dy = (S.map.y - _tiltPanBase.y) * q;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(_tiltPanCanvas, dx, dy);
}
// 드래그 중 초경량 팬/줌 — #bgMapT는 renderMapTransform(속성만), #L_typhoon은 변환으로만 이동(리렌더 없음). 틸트면 캔버스만 갱신.
function lightPanZoom(base) {
  const bg = $('#bgMapT'), mt = $('#mapT'), se = $('#seaT');   // 해상 구역도 지도와 함께
  const mb = document.querySelector('#L_mapBase [data-blindmapt]');   // 블라인드 베이스 지도도 같이(재생 중 지도 이동 시 어긋남 방지)
  if (camActive3d()) {   // 틸트: 캔버스 렌더 기준이라 속성 transform 유지
    const t = `translate(${S.map.x} ${S.map.y}) scale(${S.map.s})`;
    if (bg) bg.setAttribute('transform', t); if (mt) mt.setAttribute('transform', t); if (mb) mb.setAttribute('transform', t); if (se) se.setAttribute('transform', t);
    if (_tiltPanCanvas) tiltPanShift();   // 팬: 얼린 텍스처를 즉시 이동(재래스터 지연 없음)
    else applyTilt();                      // 줌 등: 기존대로 재래스터
    updateTyphoonLeaders(); return;
  }
  // 평면 팬/줌: CSS transform(GPU 합성) — 거대한 path를 매 프레임 리페인트 안 하고 GPU 텍스처를 이동/스케일(초경량·부드러움).
  const t = `translate(${S.map.x}px, ${S.map.y}px) scale(${S.map.s})`;
  if (bg) bg.style.transform = t; if (mt) mt.style.transform = t; if (mb) mb.style.transform = t; if (se) se.style.transform = t;
  const r = S.map.s / (base.s || 1), tr = `translate(${S.map.x - base.x * r}px, ${S.map.y - base.y * r}px) scale(${r})`;
  const L = $('#L_typhoon'), LB = $('#L_typhoonLabels'), RI = $('#L_refImg');   // 지도·라벨·참고이미지 모두 지도와 함께 rigid 이동
  if (L) L.style.transform = tr;
  if (LB) LB.style.transform = tr;
  if (RI) RI.style.transform = tr;   // 대고 그리는 참고 이미지도 팬 중 실시간으로 붙어 이동
}
svg.addEventListener('wheel', (e) => {
  if (!e.altKey || !camMoveActive()) return;
  e.preventDefault(); e.stopPropagation();
  if (S.mapLock) { status('지도가 잠겨 있습니다 — 잠금을 풀어야 확대됩니다', true); return; }   // 지도 잠금: 휠 줌 차단
  if (_wheelUndoArmed) { pushUndo('mapzoom'); _wheelUndoArmed = false; }   // 연속 휠은 undo 1회만
  clearTimeout(_wheelUndoTimer); _wheelUndoTimer = setTimeout(() => { _wheelUndoArmed = true; }, 500);
  if (camActive3d()) {   // 틸트: 기존 방식(캔버스 재래스터)
    zoomMapAbout(960, 540, S.map.s * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    renderMapTransform(); renderStrokeScale(); if (isTyphoon()) renderTyphoon(); applyTilt();
    return;
  }
  // 평면: GPU CSS transform으로 즉시 확대(리페인트 없음), 휠 멈추면(180ms) 1회만 확정.
  if (!_wheelZoomBase) { _wheelZoomBase = { x: S.map.x, y: S.map.y, s: S.map.s }; setFlatPanLOD(true); }
  zoomMapAbout(960, 540, S.map.s * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  lightPanZoom(_wheelZoomBase);   // CSS transform(GPU)
  clearTimeout(_wheelZoomTimer);
  _wheelZoomTimer = setTimeout(() => {
    const base = _wheelZoomBase; _wheelZoomBase = null;
    if (base) {   // 라벨·비교 라벨·참고이미지를 지도에 붙은 채 유지(확대량만큼 위치·크기 갱신)
      const r = S.map.s / (base.s || 1); shiftMapAttached(S.map.x - base.x * r, S.map.y - base.y * r, r);
    }
    renderMapTransform(); renderStrokeScale(); applyTilt(); setFlatPanLOD(false);
  }, 180);
}, { passive: false, capture: true });
