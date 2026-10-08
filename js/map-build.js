/* [모듈] js/map-build.js — 실행 취소(pushUndo·undo/redo·applyState) + SVG 뼈대 구성(buildFrame·buildZones), 지도 스타일 전환(setStyle)·CG 종류/배경 버튼 */
'use strict';

// ===================== 실행 취소 =====================
const undoStack = [], redoStack = [];
let lastTag = '', lastT = -1e9;
const snap = () => JSON.parse(JSON.stringify(S));

// tag를 주면 600ms 안의 같은 조작(슬라이더 드래그 등)은 한 번으로 묶는다. tag가 없으면 항상 기록.
function pushUndo(tag) {
  const t = performance.now();
  if (tag && tag === lastTag && t - lastT < 600) { lastT = t; return; }
  lastTag = tag || ''; lastT = t;
  undoStack.push(snap());
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  updateUndoBtns();
}
// 지도 내용 리비전 — 틸트 미리보기 캔버스가 칠·태풍·되돌리기 같은 '내용' 변경도 다시 굽게 서명에 넣는다
let _mapContentRev = 0, _tiltContentTimer = 0;
// 지도 레이어를 다시 그렸다 — 리비전을 올리고, 기울인 미리보기 중이면 잠깐 뒤 한 번 다시 굽는다(연속 변경은 1회로 묶음)
function bumpMapContent() {
  _mapContentRev++;
  if (!document.querySelector('.fit.mapTilt')) return;
  clearTimeout(_tiltContentTimer);
  _tiltContentTimer = setTimeout(() => { if (typeof applyTilt === 'function') applyTilt(); }, 60);
}
function applyState(next) {
  const styleChanged = S.style !== next.style;
  const resChanged = S.res !== next.res;
  S = next; normStyle(); sel = []; lastTag = '';
  // 타임라인이 닫혀 있으면 편집은 평면 — 타임라인에서 기울인 채 쌓인 기록을 되돌려도 틸트로 돌아가지 않게
  if (!$('#timeline')?.classList.contains('on') && S.map3d && (+S.map3d.rx || +S.map3d.ry || +S.map3d.rz)) S.map3d = { on: 0, rx: 0, ry: 0, rz: 0, persp: S.map3d.persp || 2.2 };
  if (styleChanged) { buildZones(); markStyleBtns(); }
  buildBgBtns();   // 배경 목록은 해상도·교체 배경마다 다르다(VF 배경은 VF에서만)
  syncRuntimeListsFromState();   // 특보·예보 목록(런타임)도 되돌린 상태에 맞춘다
  syncPanelFromState(); renderAll(); updateUndoBtns();
  if (resChanged) {   // 해상도 적용(_apply)과 같은 해상도별 UI도 되돌린다
    markResBtns();
    if (typeof tlNote === 'function') tlNote();
    updateFrameGuideLabel();
  }
  if (typeof applyTilt === 'function') applyTilt();   // 되돌린 S.map3d·내용에 맞춰 틸트 클래스·캔버스도 갱신
}
// 불러오기·새로 시작 경계 스냅샷에 저장 대상 파일(projFileHandle) 전/후를 붙여 둔다 — 되돌리면 파일도 같이 되돌려
// 불러온 파일 B를 옛 작업 A로 묻지 않고 덮어쓰지 않게.
const _undoFileMark = new WeakMap();
function markUndoFileSwap(before, after) { const top = undoStack[undoStack.length - 1]; if (top) _undoFileMark.set(top, { before, after }); }
function undo() { if (!undoStack.length) return; const cur = snap(), prev = undoStack.pop(), m = _undoFileMark.get(prev); if (m) { _undoFileMark.set(cur, m); projFileHandle = m.before; } redoStack.push(cur); applyState(prev); status('되돌림'); }
function redo() { if (!redoStack.length) return; const cur = snap(), next = redoStack.pop(), m = _undoFileMark.get(next); if (m) { _undoFileMark.set(cur, m); projFileHandle = m.after; } undoStack.push(cur); applyState(next); status('다시 실행'); }
function updateUndoBtns() { $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; }

// ===================== SVG 구성 =====================
const svg = $('#cg');
const gMain = $('#gMain'), gInsets = $('#gInsets'), gBoxes = $('#L_boxes');
const zoneEls = new Map(); // id -> [{el, inset}]
const addZoneEl = (id, node, inset) => {
  if (!zoneEls.has(id)) zoneEls.set(id, []);
  zoneEls.get(id).push({ el: node, inset });
};

// 한 번만 만드는 뼈대 (인셋 그룹, 클립, 박스, 핸들)
function buildFrame() {
  $('#nbrNW').setAttribute('d', MAP.nbrNW);
  $('#nbrJP').setAttribute('d', MAP.nbrJP);

  // 해상 특보구역 (지도 종류와 무관하게 항상 같은 것)
  const st = $('#seaT');
  for (const z of MAP.sea || []) {
    const p = tip(el('path', { class: 'zone sea', d: z.d, 'data-id': z.id, 'data-sea': '1' }), z.zone);
    st.append(p);
  }

  for (const key of Object.keys(S.insets)) {
    const clip = el('clipPath', { id: 'clip-' + key });
    clip.append(el('rect', { id: 'cliprect-' + key }));
    svg.querySelector('defs').append(clip);

    const wrap = el('g', { id: 'inset-' + key, 'clip-path': 'url(#clip-' + key + ')' });
    const inner = el('g', { id: 'insetT-' + key });
    // 인셋의 경계선들도 같은 transform 안에서 덧그린다 (d는 buildZones에서 채운다)
    inner.append(el('path', { class: 'zoneLine', 'data-zoneline': key }));
    inner.append(el('path', { class: 'sidoLine', 'data-sido-inset': key }));
    wrap.append(inner);
    gInsets.append(wrap);

    gBoxes.append(el('rect', { id: 'box-' + key, fill: 'none', 'pointer-events': 'none' }));
    // 히트 영역은 박스를 소유한(테두리를 그리는) 인셋에만. 울릉/독도처럼 박스를
    // 공유하면 둘 다 만들 경우 어느 쪽이 잡힐지 알 수 없어진다.
    if (S.insets[key].show) {
      $('#L_insetHits').append(el('rect', { id: 'hit-' + key, class: 'insetHit', 'data-inset': key, fill: 'transparent', 'pointer-events': 'none' }));
      const grip = el('g', { id: 'grip-' + key, class: 'insetGrip', 'data-inset': key });
      grip.append(el('circle', { r: 11 }), el('path', { class: 'gripArrow', d: 'M-4 4 L4 -4 M4 -4 L4 0 M4 -4 L0 -4' }));
      tip(grip, '끌어서 박스+섬 크기 조절');
      $('#L_grips').append(grip);
    }
  }
}

// 지도 종류가 바뀌면 조각만 갈아끼운다 (뼈대는 그대로)
function buildZones() {
  brushZonesChanged();   // 지도 종류 바뀌면 존 id가 달라져 선택 초기화(+브러쉬 클립·bbox 캐시 비움)
  zoneEls.clear();
  gMain.textContent = '';
  // 시도선도 지도 종류에 맞는 것으로 갈아끼운다
  const SL = curSidoLines();
  $('#sidoMain').setAttribute('d', SL.main || '');
  // 실제 구역선 = 그 지도 조각들의 윤곽을 그룹별로 이어붙인 것
  const ZL = {};
  for (const z of curZones()) { const g = z.inset || 'main'; ZL[g] = (ZL[g] || '') + z.d; }
  $('#zoneLineMain').setAttribute('d', ZL.main || '');
  $('#landClipMainP')?.setAttribute('d', ZL.main || '');   // 아사모사 블러를 육지로만 자르는 클립
  for (const key of Object.keys(S.insets)) {
    const inner = $('#insetT-' + key);
    // 경계선 path는 남기고 조각만 지운다
    inner.querySelectorAll('.zone, .brushSelHi').forEach((n) => n.remove());   // 인셋의 브러쉬 선택 강조도 같이(선택은 위에서 비움)
    inner.querySelector('.sidoLine').setAttribute('d', SL[key] || '');
    inner.querySelector('.zoneLine').setAttribute('d', ZL[key] || '');
  }

  for (const z of curZones()) {
    // 서울 지도(동 단위)는 '구 이름 + 동 이름'(예: 관악구 대학동). 그 외는 '시도 + 구역'.
    const label = z.gu ? z.gu + ' ' + z.zone : (z.sido === z.zone ? z.zone : z.sido + ' ' + z.zone);
    if (!z.inset) {
      const p = tip(el('path', { class: 'zone', d: z.d, 'data-id': z.id }), label);
      gMain.append(p);
      addZoneEl(z.id, p, null);
    } else {
      const inner = $('#insetT-' + z.inset);
      if (!inner) continue;
      const p = tip(el('path', { class: 'zone', d: z.d, 'data-id': z.id, 'data-inset': z.inset }), label);
      inner.insertBefore(p, inner.firstChild); // 시도 경계선보다 아래
      addZoneEl(z.id, p, z.inset);
    }
  }
  // 서울 지도: 한강(파란 물)을 서울 실루엣으로 클립해 경계선 아래에 그린다.
  const rv = $('#seoulRiver'), rc = $('#seoulClipP');
  if (rv) {
    if (isSeoul() && window.SEOUL_MAP && SEOUL_MAP.river) {
      rv.setAttribute('d', SEOUL_MAP.river);
      rv.setAttribute('fill', '#2E6FB0');
      rv.setAttribute('fill-rule', 'evenodd');
      rv.setAttribute('fill-opacity', '0.92');   // 한강 자체는 진하게(안 칠한 동 위로 선명)
      if (rc) rc.setAttribute('d', ZL.main || '');   // 서울 밖으로 새지 않게 도시 실루엣으로 클립
      rv.style.display = '';
    } else {
      rv.style.display = 'none';
    }
  }
  syncSeoulPaintTop();   // 칠한 동 색을 한강 위로 올리는 오버레이 갱신
}
// 서울 지도: 칠한 동의 색을 '한강 위'로 다시 그리는 오버레이(강이 뒤에 살짝 비치게 약간 반투명).
function syncSeoulPaintTop() {
  const layer = $('#seoulPaintTop'); if (!layer) return;
  layer.textContent = '';
  // 브러쉬 덧칠(#L_brush)은 칠 위에 와야 한다 — 서울에선 이 오버레이·한강 위로, 다른 지도에선 원래 자리(#gMain 바로 뒤)로.
  const lb = $('#L_brush');
  if (lb) { const want = isSeoul() ? layer : $('#gMain'); if (want.nextElementSibling !== lb) want.after(lb); }
  if (!isSeoul()) { layer.style.display = 'none'; return; }
  layer.style.display = '';
  const F = fills();
  for (const z of curZones()) {
    const c = F[z.id];
    if (!c) continue;
    layer.append(el('path', { d: z.d, 'data-id': z.id, fill: c, 'fill-opacity': 0.85, 'pointer-events': 'none' }));
  }
}

// 자동 색칠 사이드바 표시: 기상특보 색칠은 특보용 지도(특보구역·특보+해상)에서만,
// 기상예보 색칠은 예보용 지도(시도군·시도)에서만 — 그 지도에서만 실제로 쓰므로 헷갈리지 않게 숨긴다.
// 지도 종류에 따라 숨길 카드인가 — updateAutoPaintSecs·renderSea와 창 닫기·도킹·기본 배치가 같은 기준을 쓴다.
function secModeHidden(s) {
  const isWarn = S.style === 'warn' || S.style === 'warnsea';
  const isFct = S.style === 'sgg' || S.style === 'sido';
  const isTy = isTyphoon(), isTyCmp = isTyphoonCompare();
  switch (s) {
    case 'wrn': return !isWarn;
    case 'fct': return !isFct;
    case 'legend': return !((isWarn || isTy) && !isTyCmp);   // 범례 탭: 특보용·단일 태풍. 비교 지도에선 숨김(각 태풍 탭 안에 범례 토글)
    case 'label': return isTyCmp;                             // 기본 수치라벨 탭: 비교 지도에선 숨김(각 태풍 탭 안에 수치라벨)
    case 'typhoon': case 'typhoonPlaces': return !(isTy && !isTyCmp);   // 단일 태풍 메뉴·지명표시는 단일 태풍 지도에서만
    case 'typhoonCompare': return !isTyCmp;
    case 'mtn': return isTy;                                  // 태풍 지도에선 산 표시 메뉴 숨김
    case 'sea': return !(MAP.styles[S.style] && MAP.styles[S.style].sea);
  }
  return false;
}
// 카드 표시값 — 지도 종류로 숨김이거나, 떼어낸 창의 비활성 탭이면 'none'(창 탭이 겹쳐 보이지 않게)
function secDisplay(s, n) {
  if (secModeHidden(s)) return 'none';
  const win = n && n.closest('.win');
  if (win) { const on = win.querySelector('.wintab.on'); if (on && on.dataset.sec !== s) return 'none'; }
  return '';
}
function updateAutoPaintSecs() {
  const isTy = isTyphoon();
  const isTyCmp = isTyphoonCompare();
  // 카드 노드만(.sec) — 창 탭(.wintab)도 data-sec를 가져서 그냥 [data-sec]로 찾으면 탭을 집는다
  const secEl = (s) => document.querySelector(`.sec[data-sec="${s}"]`);
  for (const s of ['wrn', 'fct', 'legend', 'label', 'typhoon', 'typhoonPlaces', 'typhoonCompare']) { const n = secEl(s); if (n) n.style.display = secDisplay(s, n); }
  if (!isTyCmp) { const panel = document.querySelector('#panel'); if (panel) panel.querySelectorAll('.sec[data-cmpsec]').forEach((n) => n.remove()); if (typeof clearRefImgLayer === 'function') clearRefImgLayer(); }   // 비교 지도 벗어나면 동적 태풍 탭·참고이미지 제거
  { const n = secEl('mtn'); if (n) n.style.display = secDisplay('mtn', n); }
  // 지도 위치·수치 라벨 섹션: 태풍이면 한국용 감추고 태풍용 컨트롤을 보인다 (컨트롤 자체를 옮겨 담았다)
  const swap = (secSel, korSel, tySel) => { const s = $(secSel); if (!s) return; s.querySelectorAll(korSel).forEach((k) => k.style.display = isTy ? 'none' : ''); s.querySelectorAll(tySel).forEach((t) => t.style.display = isTy ? '' : 'none'); };
  swap('.sec[data-sec="map"]', '.korMap', '.tyMap');
  swap('.sec[data-sec="label"]', '.korLabel', '.tyLabel');
  swap('.sec[data-sec="legend"]', '.lgWarnOnly', '.lgTyOnly');   // 범례: 특보용 목록 ↔ 태풍 강도/반경 선택 목록
  if (isTy) { buildTyphoonPanel(); buildTyphoonLegendList(); }
  if (isTy && !isTyCmp) buildTyphoonPlacesPanel();   // 지명표시 목록/입력 배선
  if (isTyCmp) buildCompareSection();
  if (typeof syncFctMapBtn === 'function') syncFctMapBtn();   // 시도군↔서울 지도종류 아이콘 버튼 표시/틴트
}
// 아트보드의 '지도 종류'(전국/서울) 아이콘 버튼 — 시도군(sgg)·서울(seoul) 지도일 때만 표시.
function syncFctMapBtn() {
  const btn = $('#fctMapBtn'); if (!btn) return;
  const show = S.style === 'sgg' || S.style === 'seoul';
  btn.style.display = show ? '' : 'none';
  btn.classList.toggle('sat', S.style === 'seoul');   // 서울일 때 초록 틴트(basemap 버튼과 동일 상태색)
  if (!show) { const p = $('#fctMapPop'); if (p) p.style.display = 'none'; }
}

// VF 화면 기본 크기: 라벨 92% · 산 70%. 내가 직접 저장한 배치가 없을 때만 강제한다
// (통보문·특보로 새로 생성하거나 지도 종류를 바꿔도 이 크기로 나오게 — 배포 프리셋의 옛 값이 덮지 않도록).
function applyVfDefaults() {
  if (S.res !== '1920x1080-vf') return false;
  if (isTyphoon()) return false;   // 태풍은 라벨 전체 크기를 강제하지 않음 — 저장·굽기한 값 존중
  S.labScale = 92; S.mtnScale = 70;   // 노말 VF는 항상 라벨 92%·산 70% (저장된 옛 값 128 등이 있어도 강제)
  return true;
}
// 태풍에 '처음 진입'하는 applyPreset 동안만 true. 이때는 태풍 배치의 라벨/산 크기를 그대로 적용한다
// (평소 태풍은 해상도끼리 라벨크기를 '공유'하려고 skip하는데, 진입 때까지 skip하면 직전 지도(예: 특보 128%)의
//  값이 그대로 남아 태풍 기본 100%가 안 먹었다).
let _enterTyphoonApply = false;
let _presetUsedKey = '';   // applyPreset이 실제로 쓴 배치 키(태풍은 다른 키를 빌려 올 수 있다)
function setStyle(name) {
  if (!MAP.styles[name] || name === S.style) return;
  pushUndo();
  // 배치 그룹이 바뀌면(예: 특보 -> 특보+해상) 지금 배치를 그 그룹에 넣어두고,
  // 새 그룹에 저장된 배치를 불러온다. 그래야 '특보+해상'의 줄인 지도와
  // 나머지의 배치가 서로를 덮어쓰지 않는다.
  const before = presetKey();
  const after = presetKey(S.res, name);
  const enteringTyphoon = isTyphoon(name) && !isTyphoon(S.style);
  S.style = name;
  if (isTyphoon(name)) { initTyphoonData(); applyTyphoonStyle(); (S.legend ||= {}).on = (MAP.styles[name] && MAP.styles[name].compare) ? 0 : 1; }   // 단일 태풍은 범례 기본 표시, 비교 지도는 기본 숨김(토글로 켬)
  updateAutoPaintSecs();
  buildZones();
  renderInsets(); // 지도 종류마다 박스를 쓰기도 안 쓰기도 한다
  renderFills();
  renderBrush();   // 브러쉬 획은 지도 종류별 — 같은 배치 그룹끼리 바꿔도(renderAll 안 탐) 이전 지도 브러쉬가 남지 않게
  markStyleBtns(); syncEyes(); syncMapAltHint();   // 태풍↔다른 지도 전환 시 Alt 조작법 표시 갱신
  // 특보 ↔ 특보 + 해상: 보이는 칠 구역 수(바다 포함 여부)가 달라진다 — 목록 아래 안내와 결과 카드 숫자를 새 지도 기준으로 다시 센다
  if (name === 'warn' || name === 'warnsea') {
    if (wrnRows.length && $('#wrnInfo').textContent) syncWrnInfo();
    wrnRefreshResult();
  }
  let applied = true;
  if (before !== after) {
    _enterTyphoonApply = enteringTyphoon;   // 진입 때만 태풍 배치의 라벨/산 크기를 적용(직전 지도값 안 물려받게)
    applied = applyPreset();
    _enterTyphoonApply = false;
    // 비교 지도에 자기 배치가 없어 단일 태풍 배치를 빌려 썼으면, 범례는 비교 지도 기본(숨김)을 지킨다
    // (비교 지도 자기 배치면 다른 CG 모드 것이어도 그대로 둔다)
    if (applied && MAP.styles[name].compare && _presetUsedKey.split('|')[1] !== layoutGroup(name) && S.legend && S.legend.on) {
      S.legend.on = 0; syncPanelFromState(); renderAll();
    }
  }
  if (before !== after && !applied) {
    // 새 그룹에 저장된 게 없으면 지금 배치를 그대로 이어 쓴다
    if (enteringTyphoon) setTyphoonDefaultView();   // 태풍 첫 진입 — 광역이 화면에 들어오게
    if (name === 'seoul') setSeoulDefaultView();     // 서울 첫 진입 — 서울이 화면에 꽉 차게
    applyVfDefaults();   // VF면 라벨·산 기본크기(92%·70%)
    renderAll();
    status(`${MAP.styles[name].label} — 이 배치는 아직 저장 안 됨`);
    return;
  }
  // 태풍인데 저장된 배치가 한국 축척(넓은 지도가 아님)이면 광역 기본배치로 강제 + 다시 그린다
  if (enteringTyphoon && S.map.s > 0.5) { setTyphoonDefaultView(); renderAll(); }
  if (applyVfDefaults()) { syncPanelFromState(); renderAll(); }   // 배치 적용 뒤에도 VF면 기본크기 강제(배포 프리셋의 옛 라벨/산 크기 덮어쓰기)
  renderSea();
  status(MAP.styles[name].label);
  // 읽어둔 예보가 있으면 새 지도 단위에 맞춰 다시 칠한다.
  // (시도군 <-> 시도는 칠하는 단위가 달라서 그대로 두면 새 지도가 텅 빈다)
  // 단 그 지도가 비어 있거나 마지막 칠이 예보였을 때만 — 통보문·손칠·불러온 작업의 칠은 덮지 않는다.
  if (fctRows.length && (name === 'sgg' || name === 'sido') && fctOwnsFills(name)) paintFct();
}
function markStyleBtns() {
  // 서울 지도는 시도군 지도의 변형(목록엔 숨김) — 고른 게 서울이면 '시도군 구분' 카드를 켜 보인다
  const shown = (pendingStyle && isSeoul(pendingStyle)) ? 'sgg' : pendingStyle;   // (isSeoul(null)은 지금 지도를 보므로 null 먼저 거른다)
  document.querySelectorAll('#styleBtns button').forEach((b) => {
    const on = b.dataset.style === shown;
    b.classList.toggle('choicePending', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
// 어느 지도가 무엇에 쓰는 것인지. 이름만으론 특보용/예보용 구분이 안 된다.
const STYLE_USE = { sgg: '날씨 예보용', sido: '날씨 예보용', warn: '기상특보용', warnsea: '기상특보용', typhoon: '태풍 예상경로', typhoonCompare: '여러 기관 예보선 겹쳐 비교' };
// CG 구성 창의 선택 카드 아이콘(24x24, 선 아이콘). 없는 키는 겹친 지도 아이콘.
const CGS_ICON = {
  '2158x1214': '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M9 20.5h6M12 16.5v4"/><circle cx="12" cy="10.2" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="10.2" r="4.2" opacity=".55"/>',
  '1920x1080': '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M9 20.5h6M12 16.5v4"/>',
  '1920x1080-vf': '<rect x="2.5" y="4" width="19" height="12.5" rx="2" stroke-dasharray="3 2.4"/><path d="M9 20.5h6M12 16.5v4"/><rect x="12.5" y="9.5" width="6.5" height="4.5" rx="1" fill="currentColor" stroke="none"/>',
  '1920x1080-team': '<circle cx="9" cy="8.6" r="3"/><circle cx="16.6" cy="9.6" r="2.4"/><path d="M3.4 19.2c.6-3.1 2.8-4.8 5.6-4.8s5 1.7 5.6 4.8M15 14.9c2.6-.3 4.9 1 5.6 4"/>',
  sgg: '<path d="M3.5 6.2l5.3-2.2 6.4 2.2 5.3-2.2v13.8l-5.3 2.2-6.4-2.2-5.3 2.2z"/><path d="M8.8 4v13.8M15.2 6.2V20M3.5 11.6l5.3-1.6 6.4 2 5.3-1.8"/>',
  sido: '<path d="M3.5 6.2l5.3-2.2 6.4 2.2 5.3-2.2v13.8l-5.3 2.2-6.4-2.2-5.3 2.2z"/><path d="M8.8 4v13.8M15.2 6.2V20"/>',
  warn: '<path d="M12 3.6l9.2 16H2.8z" stroke-linejoin="round"/><path d="M12 10v4.2M12 16.8v.3" stroke-width="2.2"/>',
  warnsea: '<path d="M12 2.8l7 12.1H5z" stroke-linejoin="round"/><path d="M12 7.6v3.4M12 12.8v.2" stroke-width="2.1"/><path d="M2.5 19.2c1.6 0 1.6-1.3 3.2-1.3s1.6 1.3 3.2 1.3 1.6-1.3 3.1-1.3 1.6 1.3 3.2 1.3 1.6-1.3 3.2-1.3 1.6 1.3 3.1 1.3"/>',
  typhoon: '<path d="M12 4.2c4.4 0 7.3 2.1 7.3 4.9 0 2-1.6 3.3-3.6 3.3M12 19.8c-4.4 0-7.3-2.1-7.3-4.9 0-2 1.6-3.3 3.6-3.3"/><circle cx="12" cy="12" r="2.6"/>',
  typhoonCompare: '<path d="M10 4.6c3.6 0 6 1.7 6 4 0 1.6-1.3 2.7-2.9 2.7M10 17.4c-3.6 0-6-1.7-6-4 0-1.6 1.3-2.7 2.9-2.7"/><circle cx="10" cy="11" r="2.1"/><path d="M15.5 15.5c2.2.2 4.2 1.2 4.2 2.6s-1.6 2.3-3.6 2.3" opacity=".7"/>',
};
function cgsIconSvg(k) {
  const d = CGS_ICON[k] || '<path d="M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16.5l9 5 9-5"/>';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${d}</svg>`;
}
// CG 구성 창의 선택 카드 하나(아이콘 칩 + 이름 + 작은 설명). 이름·설명은 textContent로 넣는다.
function cgsCardBtn(iconKey, label, sub, subClass) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'cgsCard';
  b.setAttribute('aria-pressed', 'false');
  const ic = document.createElement('span'); ic.className = 'cgsCardIcon'; ic.innerHTML = cgsIconSvg(iconKey);   // 정적 아이콘 문자열
  const tx = document.createElement('span'); tx.className = 'cgsCardTxt';
  const nm = document.createElement('b'); nm.textContent = label;
  const sm = document.createElement('small'); if (subClass) sm.className = subClass; sm.textContent = sub || '';
  tx.append(nm, sm); b.append(ic, tx);
  return b;
}

// 지금 고른 예보를 이 지도에 칠하면 얼마나 정확한가.
// 예보 단위와 지도 단위가 다르면 반드시 정보가 깎이는데, 그걸 버튼에서 바로 알려준다.
function styleAccuracy(k) {
  if (k !== 'sgg' && k !== 'sido') return null;
  const grain = FCT_KINDS[fctKind].grain;
  if (grain === 'city') {
    return k === 'sgg' ? ['예보 그대로', 1] : ['시도로 합쳐짐', 0];
  }
  // 광역 예보 — 시도군은 광역을 펼치는 것뿐이라 정보 손실이 없다.
  // 오히려 강원 영서/영동이 갈려서 시도 지도보다 정확하다.
  return k === 'sgg' ? ['예보 그대로 (강원 영서/영동 갈림)', 1] : ['강원이 한쪽만 나옴', 0];
}

// 교체한 이미지도 '고를 수 있는 배경' 하나로 취급한다. 그래야 원래 배경으로
// 되돌리는 길이 따로 필요 없이 기본/비를 누르기만 하면 된다.
function buildBgBtns() {
  const w = $('#bgBtns');
  w.textContent = '';
  const add = (k, label, pick) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.bg = k;
    b.onclick = () => { pushUndo(); pick(); renderBg(); status(label + ' 배경'); };
    w.append(b);
  };
  for (const [k, label] of Object.entries(BGS)) {
    // 어두운/밝은 둘 중 하나라도 구워져 있으면 타입 버튼을 만든다
    if (!IMG[k] && !IMG[BG_LIGHT[k]]) continue;
    // VF 화면은 VF 배경만, 다른 화면은 VF 배경을 숨긴다
    if (S.res === '1920x1080-vf') { if (k !== 'bgVfDark') continue; }
    else if (k === 'bgVfDark') continue;
    add(k, label, () => { bgUseFile = 0; S.bg = k; });
  }
  if (bgOverride) add('_file', '교체한 것', () => { bgUseFile = 1; });
  markBgBtns();
}
function markBgBtns() {
  for (const b of document.querySelectorAll('#bgBtns button')) {
    const on = bgUseFile ? b.dataset.bg === '_file' : b.dataset.bg === bgTypeOf();
    b.classList.toggle('pri', on);
  }
}

function buildStyleBtns() {
  const w = $('#styleBtns');
  w.textContent = '';
  for (const [k, v] of Object.entries(MAP.styles)) {
    if (v.hidden) continue;   // 서울 지도 등 — 아트보드의 지도종류 아이콘 버튼으로만 진입
    const b = cgsCardBtn(k, v.label, '', 'styleUse');   // 설명(용도·정확도)은 syncStyleUse가 채운다
    b.dataset.style = k;
    b.onclick = () => {
      pendingStyle = k;
      // 작업 중 지금 서울 지도면 '시도군 구분'을 눌러도 서울 그대로(전국/서울 전환은 아트보드 지도 아이콘 몫).
      // 시작 화면(새로 시작)에선 지난 작업의 서울을 물려받지 않는다 — 시도군 구분 = 전국 지도로 시작.
      if (k === 'sgg' && isSeoul(S.style) && !startScreenOn()) pendingStyle = S.style;
      syncCgSetup();
      cgsShowOtherPane('style');
    };
    w.append(b);
  }
  const note = $('#cgsStyleNote'); if (note) note.style.display = MAP.styles.seoul ? '' : 'none';   // 서울 지도 데이터가 있을 때만 안내
  markStyleBtns();
  syncStyleUse();
}

// 버튼 밑 설명. 예보를 읽어둔 상태면 '이 지도가 더 정확한가'를 알려준다.
function syncStyleUse() {
  for (const b of document.querySelectorAll('#styleBtns button')) {
    const k = b.dataset.style;
    const s = b.querySelector('.styleUse');
    if (!s) continue;
    const acc = fctRows.length ? styleAccuracy(k) : null;
    const seoulNow = k === 'sgg' && isSeoul(S.style) && !startScreenOn();   // 지금 서울 지도(시도군의 변형)로 작업 중(시작 화면이면 아님)
    if (acc) {
      s.textContent = (acc[1] ? '✓ ' : '') + acc[0];
      s.style.opacity = acc[1] ? '1' : '.8';
    } else {
      s.textContent = seoulNow ? '날씨 예보용 · 지금 서울 지도' : (STYLE_USE[k] || '');
      s.style.opacity = '';
    }
  }
}
