/* [모듈] js/pointer-drag.js — 캔버스 포인터(칠·선택), 브러쉬 커서, dragLoop·스냅 가이드, 항목/그룹/인셋/지도 드래그·리사이즈, 키보드 단축키, delSel·setMode */
'use strict';

svg.addEventListener('pointerdown', (e) => {
  if (e.button === 2 || e.button === 1) return;

  // 타임라인으로 애니메이션을 미리보던 중(Stop·Numpad0·스크럽)이면 화면이 애니 프레임 상태로
  // 남아 브러쉬·색칠이 안 먹는다. 편집을 시작하는 순간 편집 화면으로 되돌린 뒤 진행한다.
  if (animT != null) { animStop(); animOff(); }

  // Alt+클릭 = 스포이드: 그 자리 색을 팔레트 색으로 집는다 (색이 있으면 그걸로, 없으면 그냥 진행)
  if (e.altKey) { const col = colorAtPoint(e); if (col) { setActive(col); revealSecFor('paint', null, 'soft'); status('스포이드 · ' + col + ' 선택', true); return; } }

  // 선택된 글자·라벨·산 크기 손잡이 — 하나만 잡혀 있으면 그 섹션(놓을 때 열림, select()와 같은 연결)
  if (e.target.closest('.selGrip')) { if (sel.length === 1) revealSecFor(sel[0].kind === 'text' || sel[0].kind === 'mtn' ? sel[0].kind : 'label'); startResizeSel(e); return; }
  if (e.target.closest('#legendGrip')) { startLegendResize(e); revealSecFor('legend'); return; }   // 범례 크기 핸들 (어느 모드에서나)

  // 태풍 경로·아이콘·반경(비교 지도면 그 예보선) — 그 태풍 섹션을 연다. 끌어도 하는 일이 없는 곳이라 '딱 클릭'일 때만.
  // (아래 모드별 동작은 그대로 이어간다)
  if (e.target.closest('#L_typhoon')) { const cg = e.target.closest('[data-cmp]'); revealSecFor('typhoon', cg && cg.dataset.cmp, 'click'); }

  const d = e.target.closest('.drag');
  if (d) {
    if (d.dataset.kind === 'legend') { startLegendMove(e); revealSecFor('legend'); return; }   // 범례는 통째로 이동
    // 산은 칠하기 모드에선 팔레트 색으로 칠하고, 이동 모드에서만 움직인다.
    if (d.dataset.kind === 'mtn' && mode === 'paint') {
      const m = itemOf({ kind: 'mtn', id: d.dataset.id });
      if (m) {
        pushUndo();
        m.col = activeColor;
        renderMtns(); buildMtnList();
        revealSecFor('paint', null, 'soft');
      }
      return;
    }
    startDragItem(e, d);
    return;
  }

  if (mode === 'move') {
    if (e.target.closest('#vfScaleGrip')) { startVfScaleResize(e); revealSecFor('vfBar'); return; } // VF 전체 크기
    if (e.target.closest('#vfBarGrip')) { startVfBarResize(e); revealSecFor('vfBar'); return; }   // 제목 바 크기
    if (e.target.closest('#vfBarHit')) { startVfBarMove(e); revealSecFor('vfBar'); return; }      // 제목 바 이동
    if (e.target.closest('[data-mapgrip]')) { if (S.mapLock) { status('지도가 잠겨 있습니다', true); return; } revealSecFor('map'); startScaleMap(e); return; }
    // 도서 박스 끌기·크기 / 지도 끌기 → 지도 위치(좌표 칸) — 실제로 끌었을 때만, 접혀 있을 때만('drag')
    const grip = e.target.closest('.insetGrip');
    if (grip && grip.dataset.inset) { revealSecFor('map', null, 'drag'); startResizeInset(e, grip.dataset.inset); return; }
    // 박스든 그 안의 섬이든 집으면 박스째 움직인다
    const box = e.target.closest('.zone[data-inset]') || e.target.closest('.insetHit');
    if (box) { revealSecFor('map', null, 'drag'); startDragInset(e, box.dataset.inset); return; }
    if (e.target.closest('.zone') || e.target.closest('#L_bg')) {
      if (sel.length) deselect();   // 빈 곳(지도/배경) 클릭 = 선택 해제
      // 배경 그림(#bgImg)을 딱 클릭 → 배경 · 가이드. 태풍 지도의 바다·광역 육지(#L_bg 안 #typhoonOcean·#bgMapT)는 '지도'라서 제외
      if (e.target.id === 'bgImg' && !isTyphoon()) revealSecFor('bg', null, 'click');
      if (S.mapLock) { status('지도가 잠겨 있습니다', true); return; }   // 지도 잠금: 이동 모드 드래그도 차단
      revealSecFor('map', null, 'drag');   // 끌어서 옮기면 → 지도 위치(놓을 때)
      startDragMap(e);
      return;
    }
    return;
  }

  if (mode === 'brush') {
    // 브러쉬 그림·라벨 등이 위에 겹쳐 e.target이 존이 아닐 수 있으니 커서 아래 존을 찾아 폴백한다.
    const zb = e.target.closest('.zone') || zoneUnder(e);
    if (e.shiftKey) { if (zb) toggleBrushRegion(zb); return; }   // SHIFT+클릭 = 그 시도 선택/해제 (존 위에서만)
    // 칠하기: 마우스 중앙이 지도 밖(바다)이어도 시작할 수 있다 — 큰 브러쉬 끄트머리로 칠하게. 선택 시도로 클립되니 안전.
    const space = zb ? (zb.dataset.inset || 'main') : brushSpaceAt(e);
    const keys = brushKeysIn(space);
    if (!keys.length) { flash('SHIFT+클릭으로 칠할 시도를 먼저 고르세요'); if (sel.length) deselect(); return; }
    startBrush(e, keys, space, brushErase || e.ctrlKey || e.metaKey);   // Ctrl = 임시 지우개
    revealSecFor('paint', null, 'soft');   // 브러쉬 설정(크기·진하기)은 색 팔레트 안 — 접혀 있을 때만 펴 준다
    if (sel.length) deselect();
    return;
  }

  const z = e.target.closest('.zone');
  if (z) {
    pushUndo(); // 한 획(드래그) 전체를 한 번에 되돌린다
    painting = true;
    // 색을 칠하기 시작하면 색 팔레트를 펴 준다 (접혀 있을 때만 — 매번 깜빡이면 성가시다. 끌어 칠하는 중엔 놓을 때 한 번)
    revealSecFor('paint', null, 'soft');
    // 이미 같은 색이면 지우기 (한 번 더 누르면 취소). Alt는 항상 지우기.
    paintErase = e.altKey || fillOf(z) === activeColor;
    paint(z, paintErase);
    deselect();
    return;
  }
  deselect();
});

svg.addEventListener('pointerover', (e) => {
  if (!painting) return;
  const z = e.target.closest('.zone');
  // 획 도중에는 처음 정한 동작을 유지한다 — 안 그러면 끌 때마다 칠했다 지웠다 한다
  if (z) paint(z, paintErase);
});
window.addEventListener('pointerup', () => { painting = false; });
// 브러쉬 커서: 칠하기=붓 모양+크기 원+'브러쉬 모드', SHIFT=손 모양+'선택 모드' (마우스 옆 꼬다리 배지)
const _brushSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"><path d="M16 3l5 5-8 8-5-5z" fill="#4a94ff" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 11l5 5-2 1c-2.2 1.1-5.5 2.2-6.5 1.2S3.9 13.1 5 11l1-1z" fill="#fff" stroke="#4a94ff" stroke-width="1"/></svg>`;
const BRUSH_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(_brushSvg)}") 4 22, crosshair`;
let brushLastPt = null, brushWasPaint = false, swooshStart = 0, swooshRAF = 0;
function hideBrushCursor() { $('#brushCursor').style.display = 'none'; $('#brushTag').style.display = 'none'; svg.style.cursor = ''; brushWasPaint = false; cancelAnimationFrame(swooshRAF); swooshRAF = 0; }
// 커서 원이 시계방향으로 슈욱 그려지며 나타난다 (내가 준 스피드 그래프 = easeOut). 12시부터 시계방향.
// dasharray 는 항상 유지(제거하지 않음)하고, 시작 상태(가려짐)를 동기로 잡아 시작·끝의 '두둑' 튐을 없앤다.
function swooshCursor() {
  const cur = $('#brushCursor');
  const r = +cur.getAttribute('r') || S.brush.size, C = 2 * Math.PI * r;
  cur.setAttribute('stroke-dasharray', C.toFixed(1));
  cur.setAttribute('stroke-dashoffset', C.toFixed(1));   // 처음엔 아무것도 안 보이게 (동기로)
  swooshStart = performance.now();
  cancelAnimationFrame(swooshRAF);
  const tick = () => {
    if (mode !== 'brush' || cur.style.display === 'none') { swooshRAF = 0; return; }
    const rr = +cur.getAttribute('r') || S.brush.size, CC = 2 * Math.PI * rr;
    const el = performance.now() - swooshStart, dur = 420;
    if (el >= dur) { cur.setAttribute('stroke-dashoffset', '0'); swooshRAF = 0; return; }   // 끝: 꽉 찬 원(제거 안 함 → 안 튐)
    const p = easeOut(el / dur);   // EASE_BEZIER (첨부한 스피드 그래프)
    cur.setAttribute('stroke-dasharray', CC.toFixed(1));
    cur.setAttribute('stroke-dashoffset', (CC * (1 - p)).toFixed(1));
    swooshRAF = requestAnimationFrame(tick);
  };
  swooshRAF = requestAnimationFrame(tick);
}
function updateBrushCursor(cx, cy, shiftKey) {
  const cur = $('#brushCursor'), tag = $('#brushTag');
  if (mode !== 'brush') { hideBrushCursor(); return; }
  svg.style.cursor = shiftKey ? 'pointer' : BRUSH_CURSOR;
  const nowPaint = !shiftKey;
  if (shiftKey) cur.style.display = 'none';
  else {
    const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
    const u = p.matrixTransform(svg.getScreenCTM().inverse());
    // 12시부터 시계방향으로 그려지게 회전 (원 stroke 시작점이 3시라 -90°)
    cur.setAttribute('cx', u.x); cur.setAttribute('cy', u.y); cur.setAttribute('r', S.brush.size);
    cur.setAttribute('transform', `rotate(-90 ${u.x} ${u.y})`);
    cur.setAttribute('stroke', brushErase ? '#ff5a5a' : '#4a94ff');
    cur.setAttribute('stroke-dasharray', (2 * Math.PI * S.brush.size).toFixed(1));   // 항상 켜둠(제거 안 함)
    if (!swooshRAF) cur.setAttribute('stroke-dashoffset', '0');                       // 슈욱 중 아니면 꽉 찬 원
    cur.style.display = '';
    if (!brushWasPaint) swooshCursor();   // 브러쉬 커서가 처음 뜰 때(브러쉬 모드 켜기 / shift 뗐을 때) 슈욱
  }
  brushWasPaint = nowPaint;
  tag.textContent = shiftKey ? '선택 모드' : (brushErase ? '지우개 모드' : '브러쉬 모드');
  tag.style.left = (cx + 18) + 'px'; tag.style.top = (cy + 16) + 'px'; tag.style.display = 'block';
}
svg.addEventListener('pointermove', (e) => { brushLastPt = { x: e.clientX, y: e.clientY }; updateBrushCursor(e.clientX, e.clientY, e.shiftKey); });
svg.addEventListener('pointerleave', hideBrushCursor);
// SHIFT 누르고/떼는 순간 커서·배지 즉시 전환
for (const ev of ['keydown', 'keyup']) window.addEventListener(ev, (e) => { if (e.key === 'Shift' && mode === 'brush' && brushLastPt) updateBrushCursor(brushLastPt.x, brushLastPt.y, e.shiftKey); });
svg.addEventListener('contextmenu', (e) => {
  if ((e.altKey && camMoveActive()) || performance.now() < _altGestureUntil) { e.preventDefault(); return; }   // Alt 줌 제스처 — 지우기·메뉴 없음
  const z = e.target.closest('.zone');
  if (z) { e.preventDefault(); pushUndo(); paint(z, true); }
});

function dragLoop(e, onMove, onDone) {
  const p0 = toUser(e);
  const move = (ev) => { const p = toUser(ev); onMove(p.x - p0.x, p.y - p0.y); };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (onDone) onDone();
    syncPanelFromState();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  e.preventDefault();
}

// 드래그 중인 요소와 나머지 텍스트/라벨의 정렬 가이드
const SNAP = 6; // 이 거리(SVG 유닛) 안이면 딱 붙는다

// 화면상 실제 사각형 (text-anchor·라벨 중심정렬까지 반영된 값)
function itemRect(kind, id) {
  const n = svg.querySelector(`[data-kind="${kind}"][data-id="${id}"]`);
  if (!n) return null;
  // 라벨은 유리(뒷배경 use)가 그룹 bbox를 지도 전체로 부풀리므로 '카드 rect'만 측정한다.
  const cardR = kind === 'label' ? [...n.children].find((c) => c.tagName === 'rect') : null;
  const b = (cardR || n).getBBox();
  const it = itemOf({ kind, id });
  if (!it) return null;
  // 라벨·산은 그룹을 translate로 옮겨 그리므로 getBBox()가 그룹 안 좌표로 나온다.
  // 텍스트는 x/y 속성을 직접 쓰니 이미 절대좌표다.
  const g = kind === 'label' || kind === 'mtn';
  let ox = g ? it.x : 0, oy = g ? it.y : 0;
  // 태풍 라벨은 틸트 시 지도평면 좌표(it.x/it.y)를 카메라로 투영해 '표시'되므로, 선택박스·정렬가이드도 투영 위치로 맞춘다.
  if (kind === 'label' && isTyphoon() && camTiltOn()) { const p = camProjectXY(it.x, it.y); ox = p[0]; oy = p[1]; }
  return { x0: ox + b.x, y0: oy + b.y, x1: ox + b.x + b.width, y1: oy + b.y + b.height };
}

function alignTargets(skipId) {
  const out = [];
  for (const t of S.texts) if (t.id !== skipId) { const r = itemRect('text', t.id); if (r) out.push(r); }
  for (const b of labelList()) if (b.id !== skipId) { const r = itemRect('label', b.id); if (r) out.push(r); }
  for (const m of (S.mtns || [])) if (m.id !== skipId) { const r = itemRect('mtn', m.id); if (r) out.push(r); }
  return out;
}

function renderGuides(lines) {
  const L = $('#L_guides');
  L.textContent = '';
  for (const g of lines) {
    L.append(el('line', { class: 'alignLine', x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 }));
  }
}

// 여러 개 선택 시: 선택한 것들을 통째로 키운다 (기준은 그룹 박스의 왼쪽 위)
function startResizeSel(e) {
  const b = selBBox();
  if (!b) return;
  const items = selItems();
  const orig = items.map(({ s, it }) => ({ s, it, snap: JSON.parse(JSON.stringify(it)) }));
  const w0 = Math.max(b.x1 - b.x0, 1);
  pushUndo();
  dragLoop(e, (dx) => {
    const k = clamp((w0 + dx) / w0, 0.2, 8);
    for (const { s, it, snap } of orig) {
      it.x = Math.round(b.x0 + (snap.x - b.x0) * k);
      it.y = Math.round(b.y0 + (snap.y - b.y0) * k);
      it.size = Math.max(4, Math.round(snap.size * k));
      if (s.kind === 'text') it.track = +(snap.track * k).toFixed(1);
      if (s.kind === 'label') {
        it.track = +((snap.track == null ? -1 : snap.track) * k).toFixed(1);
        it.padX = Math.round(snap.padX * k);
        it.padY = Math.round(snap.padY * k);
        it.strokeW = +(snap.strokeW * k).toFixed(1);
        it.radius = Math.round(snap.radius * k);
      }
      if (s.kind === 'mtn') it.txtSize = Math.max(4, Math.round(snap.txtSize * k));
    }
    renderTexts(); renderLabels(); renderMtns(); renderSel();
    status(`${sel.length}개 ${Math.round(k * 100)}%`, true);
  }, () => { refreshPanel(); status(''); });
}

function startDragItem(e, node) {
  const kind = node.dataset.kind, id = node.dataset.id;
  select(kind, id, e.shiftKey);
  if (e.shiftKey) return; // Shift+클릭은 선택만 (끌지 않음)

  // 여러 개면 통째로 옮긴다
  if (sel.length > 1) { startDragGroup(e); return; }

  const it = itemOf({ kind, id });
  const ox = it.x, oy = it.y;
  pushUndo();

  const targets = alignTargets(id);
  const r0 = itemRect(kind, id);
  // 기준점이 x/y에서 얼마나 떨어져 있는지 (text-anchor에 따라 다르다)
  const off = { x0: r0.x0 - ox, x1: r0.x1 - ox, cx: (r0.x0 + r0.x1) / 2 - ox,
                y0: r0.y0 - oy, y1: r0.y1 - oy, cy: (r0.y0 + r0.y1) / 2 - oy };
  const w = r0.x1 - r0.x0, h = r0.y1 - r0.y0;

  const tiltLabel = isTyphoon() && kind === 'label' && camTiltOn();   // 틸트 상태의 태풍 라벨: 지도평면 좌표로 이동(화면은 마우스와 1:1)
  const [sx0, sy0] = tiltLabel ? camProjectXY(ox, oy) : [0, 0];       // 잡을 때의 박스 화면위치(투영)

  dragLoop(e, (dx, dy) => {
    // 틸트 라벨: 마우스를 따라간 화면점을 역투영해 '지도평면' 좌표로 저장 → 틸트가 바뀌어도 지도에 붙어있음. (스냅 가이드는 생략)
    if (tiltLabel) {
      const [nxp, nyp] = camUnprojectXY(sx0 + dx, sy0 + dy);
      const nx = Math.round(nxp), ny = Math.round(nyp);
      if (it.anchor) delete it.anchor;
      it.x = nx; it.y = ny;
      node.setAttribute('transform', `translate(${Math.round(sx0 + dx)} ${Math.round(sy0 + dy)})`);   // 화면표시는 투영점(=마우스 위치)
      updateLabelGlass(node, nx, ny);
      updateTyphoonLeaders();
      renderSel();
      return;
    }
    let nx = Math.round(ox + dx), ny = Math.round(oy + dy);
    const lines = [];

    // 세로 가이드 (좌/중앙/우 맞춤)
    let best = null;
    for (const edge of ['x0', 'cx', 'x1']) {
      const mine = nx + off[edge];
      for (const t of targets) {
        for (const v of [t.x0, (t.x0 + t.x1) / 2, t.x1]) {
          const d = Math.abs(mine - v);
          if (d <= SNAP && (!best || d < best.d)) best = { d, adj: v - off[edge], v, t };
        }
      }
    }
    if (best) {
      nx = Math.round(best.adj);
      const ys = targets.concat([{ y0: ny + off.y0, y1: ny + off.y1 }]);
      lines.push({ x1: best.v, x2: best.v, y1: Math.min(...ys.map((t) => t.y0)) - 14, y2: Math.max(...ys.map((t) => t.y1)) + 14 });
    }

    // 가로 가이드 (위/중앙/아래 맞춤)
    best = null;
    for (const edge of ['y0', 'cy', 'y1']) {
      const mine = ny + off[edge];
      for (const t of targets) {
        for (const v of [t.y0, (t.y0 + t.y1) / 2, t.y1]) {
          const d = Math.abs(mine - v);
          if (d <= SNAP && (!best || d < best.d)) best = { d, adj: v - off[edge], v };
        }
      }
    }
    if (best) {
      ny = Math.round(best.adj);
      const xs = targets.concat([{ x0: nx + off.x0, x1: nx + off.x1 }]);
      lines.push({ y1: best.v, y2: best.v, x1: Math.min(...xs.map((t) => t.x0)) - 14, x2: Math.max(...xs.map((t) => t.x1)) + 14 });
    }

    if (it.anchor) delete it.anchor; // 손으로 끌면 지도 고정을 풀어 자유 위치로
    it.x = nx; it.y = ny;
    if (kind === 'text') { node.setAttribute('x', nx); node.setAttribute('y', ny); }
    else node.setAttribute('transform', `translate(${nx} ${ny})`);
    if (kind === 'label') updateLabelGlass(node, nx, ny);
    if (kind === 'label') { if (isTyphoon()) updateTyphoonLeaders(); else updateForecastLeaders(); }
    renderGuides(lines);
    renderSel();
  }, () => renderGuides([]));
}

function startDragGroup(e) {
  const orig = selItems().map(({ it }) => ({ it, x: it.x, y: it.y }));
  pushUndo();
  dragLoop(e, (dx, dy) => {
    for (const o of orig) { if (o.it.anchor) delete o.it.anchor; o.it.x = Math.round(o.x + dx); o.it.y = Math.round(o.y + dy); }
    renderTexts(); renderLabels(); renderMtns(); renderSel();
  });
}

// 울릉/독도처럼 같은 박스를 쓰는 인셋들 (항상 한 덩어리로 움직이고 커진다)
const twinsOf = (key) =>
  Object.keys(S.insets).filter((k) => k !== key && S.insets[k].box.join() === S.insets[key].box.join());

// 박스와 그 안의 섬은 늘 같이 움직인다 (섬만 따로 집히지 않음)
function startDragInset(e, key) {
  const group = [key, ...twinsOf(key)];
  const orig = group.map((k) => ({ k, x: S.insets[k].box[0], y: S.insets[k].box[1] }));
  pushUndo();
  dragLoop(e, (dx, dy) => {
    for (const o of orig) {
      S.insets[o.k].box[0] = Math.round(o.x + dx);
      S.insets[o.k].box[1] = Math.round(o.y + dy);
    }
    renderInsets();
  });
}

// 크기 핸들: 박스와 섬이 같은 비율로 커진다 (왼쪽 위 모서리 고정)
function startResizeInset(e, key) {
  const group = [key, ...twinsOf(key)];
  const orig = group.map((k) => {
    const c = S.insets[k];
    return { k, box: [...c.box], s: c.s, ox: c.ox, oy: c.oy };
  });
  const w0 = S.insets[key].box[2];
  pushUndo();
  dragLoop(e, (dx) => {
    // 균일 배율만 — 가로세로를 따로 늘리면 섬이 박스를 못 따라간다
    const k = clamp((w0 + dx) / w0, 0.25, 6);
    for (const o of orig) {
      const c = S.insets[o.k];
      c.box[2] = Math.round(o.box[2] * k);
      c.box[3] = Math.round(o.box[3] * k);
      c.s = Math.round(o.s * k * 1000) / 1000;
      c.ox = Math.round(o.ox * k);
      c.oy = Math.round(o.oy * k);
    }
    renderInsets();
    status(`${S.insets[key].label} ${Math.round(k * 100)}%`, true);
  });
}

// 지도 전체 크기. 오른쪽 아래로 끌면 커진다 (중심은 지도 기준점 그대로)
function startScaleMap(e) {
  const o = S.map.s;
  const h = MAP.mainH / 2;
  const d0 = Math.hypot(h * 0.62 * o, h * o) || 1;
  pushUndo();
  dragLoop(e, (dx, dy) => {
    const k = clamp((d0 + (dx * 0.62 + dy) / 1.62) / d0, 0.15, 5);
    S.map.s = Math.round(o * k * 1000) / 1000;
    renderMapTransform(); renderFills(); renderSea();
    status(`지도 배율 ${S.map.s}`, true);
  }, () => { syncPanelFromState(); status(''); });
}

function startDragMap(e) {
  const o = [S.map.x, S.map.y];
  pushUndo();
  dragLoop(e, (dx, dy) => {
    const px = S.map.x, py = S.map.y;
    S.map.x = Math.round(o[0] + dx); S.map.y = Math.round(o[1] + dy);
    shiftMapAttached(S.map.x - px, S.map.y - py, 1);   // 태풍 라벨도 지도에 붙은 채(Alt 팬과 같게) — 이번 증분만
    renderMapTransform(); renderSea();
  });
}

let labelClip = [];   // Ctrl+C 로 복사한 라벨/텍스트
window.addEventListener('keydown', (e) => {
  if (penMode && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); if (e.key === 'Enter') finishPen(); else cancelPen(); return; }   // 펜툴: Enter 완료 · Esc 취소
  if (penExtendId && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); finishExtend(); return; }   // 이어그리기: Enter/Esc 완료
  // Ctrl+S = 저장(처음엔 위치 선택, 이후 같은 파일) / Ctrl+Shift+S = 다른 이름으로.
  // 입력창에서도 브라우저 기본 저장 대화상자를 막고 프로젝트를 저장한다.
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if ($('#tourWrap')?.classList.contains('on')) return;   // 투어 중 ←/→는 단계 넘기기 전용(지도·선택 이동 금지)
  if (cgSetupIsOpen() || exportIsOpen()) return;   // CG 구성 창·이미지로 추출 팝업이 떠 있는 동안엔 뒤의 지도 단축키(되돌리기·삭제·이동 등)를 막는다
  // 브러쉬 크기: [ 줄이기, ] 키우기
  if (mode === 'brush' && (e.key === '[' || e.key === ']')) {
    e.preventDefault();
    S.brush.size = Math.max(4, Math.min(400, S.brush.size + (e.key === ']' ? 4 : -4)));
    $('#brSize').value = S.brush.size; $('#brSizeV').textContent = S.brush.size;
    if (brushLastPt) updateBrushCursor(brushLastPt.x, brushLastPt.y, e.shiftKey);
    status('브러쉬 크기 ' + S.brush.size, true);
    return;
  }
  // 타임라인이 열려 있으면: 스페이스=재생/멈춤, 숫자패드 0=처음으로
  if ($('#timeline')?.classList.contains('on')) {
    if (e.code === 'Space') { e.preventDefault(); animPlay(); return; }
    if (e.code === 'Numpad0') { e.preventDefault(); animStop(); animSeek(0); return; }
  }
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  // Ctrl+C / Ctrl+V — 라벨(과 제목 텍스트) 복사·붙여넣기
  if ((e.ctrlKey || e.metaKey) && k === 'c') {
    const items = sel.filter((s) => s.kind === 'label' || s.kind === 'text').map((s) => ({ kind: s.kind, data: JSON.parse(JSON.stringify(itemOf(s) || {})) })).filter((c) => c.data.id != null);
    if (items.length) { labelClip = items; e.preventDefault(); status(`${items.length}개 복사됨 — Ctrl+V로 붙여넣기`, true); }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && k === 'v') {
    if (!labelClip.length) return;
    e.preventDefault(); pushUndo();
    const ns = [];
    for (const c of labelClip) {
      const d = { ...c.data }; delete d.id; delete d.bul; d.x = (d.x || 0) + 26; d.y = (d.y || 0) + 26;
      if (c.kind === 'label') { const nl = newLabel(d); labelList().push(nl); ns.push({ kind: 'label', id: nl.id }); }
      else if (c.kind === 'text') { const nt = { ...d, id: 'x' + seq++ }; S.texts.push(nt); ns.push({ kind: 'text', id: nt.id }); }   // #addText와 같은 방식(새 id)
    }
    // 다음 붙여넣기가 겹치지 않게 클립보드 위치도 조금 민다
    for (const c of labelClip) { c.data.x = (c.data.x || 0) + 26; c.data.y = (c.data.y || 0) + 26; }
    sel = ns;
    renderLabels(); renderTexts(); renderTyphoon(); renderSel(); refreshPanel(); saveWork();
    status(`${ns.length}개 붙여넣음`, true);
    return;
  }

  const step = e.shiftKey ? 10 : 1;
  const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
  const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
  if (dx || dy) {
    e.preventDefault();
    if (!sel.length && S.mapLock) { status('지도가 잠겨 있습니다', true); return; }   // 잠금 시 화살표 지도이동 차단(라벨 선택 이동은 허용)
    pushUndo('arrow');
    if (sel.length) {
      for (const { s, it } of selItems()) { it.x += dx; it.y += dy; if (s.kind === 'mtn' && it.anchor) delete it.anchor; }   // 산은 드래그처럼 앵커를 풀어야 옮긴 자리가 유지된다
      renderTexts(); renderLabels(); renderMtns(); if (isTyphoon()) renderTyphoon(); renderSel(); refreshPanel();
    } else {
      S.map.x += dx; S.map.y += dy;
      shiftMapAttached(dx, dy, 1);   // 태풍 라벨도 지도에 붙은 채
      renderMapTransform(); renderSea();
    }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (sel.length) { e.preventDefault(); delSel(); return; }
    if (isTyphoonCompare() && S.typhoon && refImgs().length) { e.preventDefault(); pushUndo(); const a = refImgs(), i = refSelIdx(); if (i >= 0) a.splice(i, 1); S.typhoon.refSel = a.length - 1; if (typeof clearRefImgLayer === 'function') clearRefImgLayer(); buildCompareSection(); renderRefImg(); status('참고 이미지 삭제 (Ctrl+Z로 되돌리기)', true); return; }   // 선택된 참고 이미지 Delete로 삭제
  }
});

function delSel() {
  if (!sel.length) return;
  pushUndo();
  const gone = (kind) => new Set(sel.filter((s) => s.kind === kind).map((s) => s.id));
  const t = gone('text'), l = gone('label'), m = gone('mtn');
  S.texts = S.texts.filter((v) => !t.has(v.id));
  setLabelList(labelList().filter((v) => !l.has(v.id)));
  S.mtns = (S.mtns || []).filter((v) => !m.has(v.id));
  sel = []; refreshPanel(); renderAll();
}

// 모드(칠하기·브러쉬·이동)에 따라 달라지는 것만 맞춘다 — renderInsets·renderMapTransform 중 mode 를 보는 부분과 같다.
// (예전엔 모드를 바꿀 때마다 두 함수를 통째로 불러 모든 존 칠·경계선·인셋을 다시 넣었고, 그림자 필터 걸린 지도 전체를 다시 그렸다)
function syncModeHandles() {
  const off = !!curStyle().noInsets;
  for (const key of Object.keys(S.insets)) {
    const grip = $('#grip-' + key);
    if (grip) grip.style.display = !off && mode === 'move' ? '' : 'none';
    const hit = $('#hit-' + key);
    if (hit) { const pe = mode === 'move' ? 'all' : 'none'; if (hit.getAttribute('pointer-events') !== pe) hit.setAttribute('pointer-events', pe); }
  }
  const g = $('#mapGrip');
  if (g) g.style.display = (mode === 'move' && !S.mapLock) ? '' : 'none';
}
function setMode(m) {
  mode = m;
  $('#mPaint').classList.toggle('on', m === 'paint');
  $('#mBrush').classList.toggle('on', m === 'brush');
  $('#mMove').classList.toggle('on', m === 'move');
  svg.classList.toggle('paintmode', m === 'paint' || m === 'brush');
  svg.classList.toggle('movemode', m === 'move');
  svg.classList.toggle('brushmode', m === 'brush');
  $('#ctrlHint').style.display = m === 'brush' ? 'none' : '';
  $('#brushHint').style.display = m === 'brush' ? '' : 'none';
  syncMapAltHint();   // 부팅·모드전환 때도 Alt 조작법 표시 갱신
  if (m !== 'brush') { clearBrushRegions(); hideBrushCursor(); }
  else revealSecFor('paint', null, 'soft');   // 브러쉬 모드 켜면 색 팔레트 펴 준다(접혀 있을 때만)
  syncModeHandles();   // 모드에 따라 바뀌는 핸들만(인셋·지도 크기 핸들) — 지도를 통째로 다시 칠하지 않는다(브러쉬 버튼이 무거웠던 원인)
  if (S.res === '1920x1080-vf') renderVfBar();   // 이동 모드 전환에 맞춰 제목 바 핸들 표시/숨김(VF에서만 — 그 밖엔 범례를 통째로 다시 만들 뿐이라 생략)
  renderVfScale(); // 이동 모드에서만 VF 전체 외곽선·핸들 표시
  status(m === 'move' ? '이동 모드 — 끌어서 이동, 파란 핸들로 크기 조절 (지도 전체 / 도서 박스)'
    : m === 'brush' ? '브러쉬 모드 — 한 영역을 끌어서 그 안에만 부드럽게 덧칠' : '칠하기 모드');
}
