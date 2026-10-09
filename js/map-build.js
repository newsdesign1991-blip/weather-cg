/* [모듈] js/map-build.js — 실행 취소(pushUndo·undo/redo·applyState) + SVG 뼈대 구성(buildFrame·buildZones), 지도 스타일 전환(setStyle)·CG 종류/배경 버튼 */
'use strict';

// ===================== 실행 취소 =====================
const undoStack = [], redoStack = [];
let lastTag = '', lastT = -1e9;
// 카메라 미리보기 중엔 S.map이 카메라 뷰로 덮여 있다 — 되돌리기 기록엔 작업 뷰를 넣는다(stateForSave, anim.js)
const snap = () => JSON.parse(JSON.stringify(typeof stateForSave === 'function' ? stateForSave() : S));

// 작업 바뀜 번호 — 되돌리기 기록이 쌓이거나(pushUndo) 되돌리기·다시 실행으로 상태가 바뀔 때 오른다.
// 닫기 전 '저장하지 않은 변경' 판정(js/project-io.js workDirty)이 저장·불러오기 때 번호와 비교한다.
let _workRev = 0;
// tag를 주면 600ms 안의 같은 조작(슬라이더 드래그 등)은 한 번으로 묶는다. tag가 없으면 항상 기록.
function pushUndo(tag) {
  const t = performance.now();
  if (tag && tag === lastTag && t - lastT < 600) { lastT = t; return; }
  lastTag = tag || ''; lastT = t;
  undoStack.push(snap());
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  _workRev++;
  updateUndoBtns();
}
// 지도 내용 리비전 — 틸트 미리보기 캔버스가 칠·태풍·되돌리기 같은 '내용' 변경도 다시 굽게 서명에 넣는다
// _mapAnimRev: 재생·스크럽(가속) 중 진행도가 바꾼 지도 그림(anim.js animMapKey) — 태풍은 경로 레이어만 바뀌므로 무거운 바탕은 _mapContentRev로 따로 본다
let _mapContentRev = 0, _tiltContentTimer = 0, _mapAnimRev = 0;
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
  if (typeof animStateReplaced === 'function') animStateReplaced();   // 미리보기 카메라 백업(옛 작업 뷰)·가속 그룹 버림 — 되돌린 S.map이 새 작업 뷰
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
  if (typeof tlAfterStateApplied === 'function') tlAfterStateApplied();   // 타임라인 막대·키를 되돌린 값으로 + 미리보기 중이면 그 시각 프레임 다시(B3)
}
// 불러오기·새로 시작 경계 스냅샷에 저장 대상 파일(projFileHandle) 전/후를 붙여 둔다 — 되돌리면 파일도 같이 되돌려
// 불러온 파일 B를 옛 작업 A로 묻지 않고 덮어쓰지 않게.
const _undoFileMark = new WeakMap();
function markUndoFileSwap(before, after) { const top = undoStack[undoStack.length - 1]; if (top) _undoFileMark.set(top, { before, after }); }
function undo() { if (!undoStack.length) return; const cur = snap(), prev = undoStack.pop(), m = _undoFileMark.get(prev); if (m) { _undoFileMark.set(cur, m); projFileHandle = m.before; } redoStack.push(cur); _workRev++; applyState(prev); status('되돌림'); }
function redo() { if (!redoStack.length) return; const cur = snap(), next = redoStack.pop(), m = _undoFileMark.get(next); if (m) { _undoFileMark.set(cur, m); projFileHandle = m.after; } undoStack.push(cur); _workRev++; applyState(next); status('다시 실행'); }
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
  if (typeof regionSearchReset === 'function') regionSearchReset();
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

// 자동 색칠 사이드바 표시: 데이터마다 자기 지도에서만 — 기상특보는 특보용 지도(특보구역·특보+해상), 기상예보·통보문은
// 예보용 지도(시군·시도), 생활기상·미세먼지 농도·미세먼지 예보는 각자의 지도(life·dust·dustFcst)에서만. 다른 구분으로 옮겨 칠하지 않는다.
// 지도 종류에 따라 숨길 카드인가 — updateAutoPaintSecs·renderSea와 창 닫기·도킹·기본 배치가 같은 기준을 쓴다.
function secModeHidden(s) {
  const isWarn = S.style === 'warn' || S.style === 'warnsea';
  const isFct = S.style === 'sgg' || S.style === 'sido';
  const isTy = isTyphoon(), isTyCmp = isTyphoonCompare();
  switch (s) {
    case 'wrn': return !isWarn;
    case 'fct': return !isFct;
    case 'life': case 'dust': case 'dustFcst': return S.style !== s;   // 데이터 지도 섹션 = 그 지도에서만
    case 'legend': return !((isWarn || isTy || !!curStyle().data) && !isTyCmp);   // 범례 탭: 특보용·단일 태풍·데이터 지도(칠한 단계). 비교 지도에선 숨김(각 태풍 탭 안에 범례 토글)
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
  for (const s of ['wrn', 'fct', 'life', 'dust', 'dustFcst', 'legend', 'label', 'typhoon', 'typhoonPlaces', 'typhoonCompare']) { const n = secEl(s); if (n) n.style.display = secDisplay(s, n); }
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
  syncMapUnit();   // 아트보드 '지금 구분' 배지·사이드바 구분 줄
  if (typeof syncDataPanels === 'function') syncDataPanels();   // 데이터 섹션(생활기상·미세먼지)·범례 이름을 지금 지도·자료에 맞춤(js/data-load.js)
}
// '지금 칠하는 구분' 표시 — 아트보드 오른쪽 위 배지(#fctMapBtn 재용도 — 옛 전국/서울 버튼 자리)와 사이드바 데이터 섹션 첫 줄([data-map-unit]).
// 태풍 지도엔 구역 칠하기가 없어 배지를 숨긴다(같은 자리에 지도 배경 버튼). 이미지·영상·AE 출력엔 안 나온다(SVG 밖 HTML).
function syncMapUnit() {
  const st = S.style, ty = isTyphoon(), c = cardOf(st);
  const btn = $('#fctMapBtn');
  if (btn) {
    btn.style.display = ty ? 'none' : '';
    btn.classList.remove('sat');
    const ic = btn.querySelector('.unitIc'), tx = btn.querySelector('.unitTxt');
    const key = c ? c.id : '';
    if (ic && ic.dataset.k !== key) { ic.innerHTML = cgsIconSvg(key); ic.dataset.k = key; }   // 정적 아이콘 문자열(카드 아이콘과 같은 것)
    if (tx) tx.textContent = mapUnitOf(st);
    const t = '칠하는 구분 — ' + (mapUnitText(st) || mapUnitOf(st)) + (c && c.styles.length > 1 ? ' · 눌러서 바꾸기' : '');
    btn.title = t; btn.setAttribute('aria-label', t);
    if (ty) { const p = $('#fctMapPop'); if (p) p.style.display = 'none'; }
  }
  document.querySelectorAll('[data-map-unit]').forEach((row) => mapUnitRowFill(row, st));
}
// 사이드바 구분 줄 하나 채우기: '칠하는 구분 · 시군구 230곳'. 예상 강수·적설 지도면 [시군 | 시도] 세그먼트(누르면 그 구분 지도로).
function mapUnitRowFill(row, st) {
  if (row.dataset.st === st) return;   // 같은 지도면 그대로(패널 동기화마다 다시 만들면 세그먼트 포커스가 날아간다)
  row.dataset.st = st;
  const c = cardOf(st);
  row.textContent = '';
  const lab = document.createElement('span'); lab.className = 'mapUnitLab'; lab.textContent = '칠하는 구분';
  row.append(lab);
  if (c && c.styles.length > 1) {
    const seg = document.createElement('div'); seg.className = 'mode mapUnitSeg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', '칠하는 구분');
    for (const k of c.styles) {
      if (!MAP.styles[k]) continue;
      const b = document.createElement('button'); b.type = 'button'; b.dataset.style = k;
      b.textContent = mapUnitOf(k);
      b.title = mapUnitText(k) + ' — 이 구분 지도로 바꿔요';
      const on = k === st; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.onclick = () => { if (S.style !== k) setStyle(k); };
      seg.append(b);
    }
    row.append(seg);
  } else {
    const v = document.createElement('b'); v.textContent = mapUnitOf(st);
    const n = document.createElement('span'); n.className = 'mapUnitN'; n.textContent = mapUnitCount(st);
    row.append(v, n);
  }
}
// 배지 팝오버 채우기 — 예상 강수·적설은 [시군 173곳]·[시도 16곳] 고르기, 그 밖은 지금 구분 한 줄 + 장면 설정 안내.
function mapUnitPopFill(pop) {
  const st = S.style, c = cardOf(st);
  pop.textContent = '';
  const head = document.createElement('div'); head.className = 'bmHead'; head.textContent = '칠하는 구분' + (c ? ' · ' + c.label : '');
  pop.append(head);
  const opts = c && c.styles.length > 1 ? c.styles.filter((k) => MAP.styles[k]) : [st];
  for (const k of opts) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'bmOpt';
    if (opts.length > 1) b.dataset.style = k; else { b.disabled = true; b.classList.add('bmInfo'); }
    b.classList.toggle('on', k === st);
    const nm = document.createElement('span'); nm.className = 'bmUnitNm'; nm.textContent = mapUnitOf(k);
    const n = document.createElement('small'); n.textContent = mapUnitCount(k);
    b.append(nm, n);
    pop.append(b);
  }
  const hint = document.createElement('p'); hint.className = 'bmMbxHint';
  hint.textContent = '자료마다 들어오는 구분 그대로 칠해요. 다른 자료는 장면 설정에서 지도 카드를 바꿔요.';
  const go = document.createElement('button'); go.type = 'button'; go.className = 'bmApply'; go.dataset.act = 'setup'; go.textContent = '장면 설정 열기';
  pop.append(hint, go);
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
  const prevStyle = S.style;
  S.style = name;
  if (typeof dataLabelsSwap === 'function') dataLabelsSwap(prevStyle, name);   // 자료 라벨은 자기 지도에만(떠나는 지도 것은 맡겨 두고, 들어가는 지도 것은 되돌림 — js/data-maps.js)
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
    status(`${cardLabelOf(name)} — 이 배치는 아직 저장 안 됨`);
    return;
  }
  // 태풍인데 저장된 배치가 한국 축척(넓은 지도가 아님)이면 광역 기본배치로 강제 + 다시 그린다
  if (enteringTyphoon && S.map.s > 0.5) { setTyphoonDefaultView(); renderAll(); }
  if (applyVfDefaults()) { syncPanelFromState(); renderAll(); }   // 배치 적용 뒤에도 VF면 기본크기 강제(배포 프리셋의 옛 라벨/산 크기 덮어쓰기)
  renderSea();
  status(cardLabelOf(name));   // 카드 이름(+ 칠하는 구분)
  // 읽어둔 예보가 있으면 새 지도 단위에 맞춰 다시 칠한다.
  // (시도군 <-> 시도는 칠하는 단위가 달라서 그대로 두면 새 지도가 텅 빈다)
  // 단 그 지도가 비어 있거나 마지막 칠이 예보였을 때만 — 통보문·손칠·불러온 작업의 칠은 덮지 않는다.
  if (fctRows.length && (name === 'sgg' || name === 'sido') && fctOwnsFills(name)) paintFct();
}
function markStyleBtns() {
  // 카드 = 데이터별(MAP_CARDS). 고른 구분(도형)이 든 카드를 켜고 그 카드의 data-style을 고른 구분으로(예상 강수·적설: 시군 sgg ↔ 시도 sido).
  // 안 고른 카드는 첫 구분으로 되돌린다 — 그래서 [data-style="sido"]는 (시도를 고르기 전엔) 구분 줄의 시도 칩을 가리킨다.
  const pc = pendingStyle ? cardOf(pendingStyle) : null;   // (cardOf(null)은 지금 지도를 보므로 null 먼저 거른다)
  document.querySelectorAll('#styleBtns .cgsCard').forEach((b) => {
    const c = MAP_CARDS.find((x) => x.id === b.dataset.card);
    const on = !!(pc && c && pc.id === c.id);
    if (c) b.dataset.style = on ? pendingStyle : c.styles[0];
    b.classList.toggle('choicePending', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  syncCgsUnitRow();
  syncStyleUse();   // 카드의 구분이 바뀌면(시군 ↔ 시도) 정확도 설명도 다시
}
// 장면 설정 '지도 종류' 카드 = 데이터별(10-10 — 자료마다 들어오는 구분 그대로 칠한다).
// styles[0] = 카드를 처음 고를 때의 구분(도형 키 = S.style), 나머지는 카드 안 전환(칠하는 구분 — 예상 강수·적설의 시군/시도).
// sec = 카드를 고르면 펼칠 사이드바 섹션(없으면 null). 도형 데이터가 없는 카드(예: region-map-data.js 로드 실패)는 안 보인다.
// 옛 저장값의 S.style(sgg·sido·warn·warnsea·seoul·typhoon·typhoonCompare)은 그대로 이 표의 카드 하나에 속한다(옮기기 없음).
const MAP_CARDS = [
  { id: 'warn', styles: ['warn'], label: '특보', sub: '특보구역 · 기상특보', sec: 'wrn' },
  { id: 'warnsea', styles: ['warnsea'], label: '특보 + 해상', sub: '특보구역 + 바다 · 풍랑 포함', sec: 'wrn' },
  { id: 'rain', styles: ['sgg', 'sido'], label: '예상 강수·적설', sub: '시군 · 통보문 지역 그대로', subs: { sido: '시도 · 시도 단위로 칠하기' }, sec: 'fct' },
  { id: 'life', styles: ['life'], label: '생활기상', sub: '시군구 · 자외선·대기정체', sec: 'life' },
  { id: 'dust', styles: ['dust'], label: '미세먼지 농도', sub: '시군구 평균 · 실시간', sec: 'dust' },
  { id: 'dustFcst', styles: ['dustFcst'], label: '미세먼지 예보', sub: '예보 권역 19 · 오늘~모레', sec: 'dustFcst' },
  { id: 'seoul', styles: ['seoul'], label: '서울', sub: '구·동 · 손으로 칠하기', sec: null },
  { id: 'typhoon', styles: ['typhoon'], label: '태풍', sub: '태풍 예상경로', sec: 'typhoon' },
  { id: 'typhoonCompare', styles: ['typhoonCompare'], label: '태풍 비교', sub: '여러 기관 예보선 겹쳐 비교', sec: 'typhoonCompare' },
];
const mapCards = () => MAP_CARDS.filter((c) => c.styles.some((s) => MAP.styles[s]));
// 이 구분(도형 키)이 든 카드 — 인자 없으면 지금 지도
const cardOf = (st) => MAP_CARDS.find((c) => c.styles.includes(st || S.style)) || null;
// 카드를 누를 때 고를 구분: 장면 설정에서 이미 이 카드 안 구분을 골라 뒀으면(시도 칩) 그대로, 작업 중 지금 지도가 이 카드 안이면 그 구분 그대로,
// 아니면(시작 화면 포함) 카드의 첫 구분 — 시작 화면에선 지난 작업의 시도를 물려받지 않는다.
function cardStyleFor(c) {
  if (pendingStyle && c.styles.includes(pendingStyle)) return pendingStyle;
  if (!startScreenOn() && c.styles.includes(S.style) && MAP.styles[S.style]) return S.style;
  return c.styles.find((s) => MAP.styles[s]) || c.styles[0];
}
// 장면 설정 요약·고른 것 표시용 이름 — 카드 이름 + (카드 안 구분이 둘 이상이면) ' · 시군'/' · 시도'
function cardLabelOf(st) {
  const c = cardOf(st); if (!c) return (MAP.styles[st] && MAP.styles[st].label) || '';
  return c.label + (c.styles.filter((s) => MAP.styles[s]).length > 1 ? ' · ' + mapUnitOf(st) : '');
}
// 칠하는 구분 이름(배지·장면 설정·사이드바·구역선 이름 공용). 도형에 unit이 있으면 그것.
const MAP_UNIT = { sgg: '시군', sido: '시도', warn: '특보구역', warnsea: '특보구역', seoul: '동', life: '시군구', dust: '시군구', dustFcst: '예보 권역' };
const mapUnitOf = (st) => { const k = st || S.style; return (MAP.styles[k] && MAP.styles[k].unit) || MAP_UNIT[k] || '구역'; };
// 구역 수 — '230곳', 특보 + 해상은 '235곳 + 바다 44곳', 구역 칠하기가 없는 지도(태풍)는 ''. 개수는 하드코딩하지 않는다(인셋 조각의 같은 id는 하나로).
const _mapUnitN = new Map();
function mapUnitCount(st) {
  const k = st || S.style, v = MAP.styles[k];
  if (!v || !v.zones || !v.zones.length) return '';
  if (!_mapUnitN.has(k)) _mapUnitN.set(k, new Set(v.zones.map((z) => z.id)).size + '곳' + (v.sea && MAP.sea && MAP.sea.length ? ` + 바다 ${new Set(MAP.sea.map((z) => z.id)).size}곳` : ''));
  return _mapUnitN.get(k);
}
const mapUnitText = (st) => { const n = mapUnitCount(st); return n ? mapUnitOf(st) + ' ' + n : ''; };
// 장면 설정 카드 아래 '칠하는 구분' 줄 — 고른 카드의 구분·구역 수, 예상 강수·적설이면 [시군 | 시도] 칩
function syncCgsUnitRow() {
  const val = $('#cgsUnitVal'); if (!val) return;
  const pc = pendingStyle ? cardOf(pendingStyle) : null;
  val.textContent = '';
  if (!pc || !MAP.styles[pendingStyle]) val.textContent = '카드를 고르면 칠하는 구분이 여기 나와요';
  else if (!mapUnitCount(pendingStyle)) val.textContent = isTyphoonCompare(pendingStyle) ? '구역 없이 여러 예보선을 겹쳐 그려요' : '구역 없이 태풍 경로를 그려요';
  else {
    const b = document.createElement('b'); b.textContent = mapUnitOf(pendingStyle);
    val.append(b, document.createTextNode(' ' + mapUnitCount(pendingStyle)));
  }
  document.querySelectorAll('#cgsUnitRow .cgsUnitChip').forEach((ch) => {
    ch.hidden = !(pc && ch.dataset.card === pc.id);
    const on = ch.dataset.style === pendingStyle;
    ch.classList.toggle('on', on); ch.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const chips = $('#cgsUnitChips'); if (chips) chips.hidden = !(pc && pc.styles.filter((s) => MAP.styles[s]).length > 1);
}
// CG 구성 창의 선택 카드 아이콘(24x24, 선 아이콘). 없는 키는 겹친 지도 아이콘. 지도 카드는 카드 id(MAP_CARDS)로 찾는다.
const CGS_ICON = {
  '2158x1214': '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M9 20.5h6M12 16.5v4"/><circle cx="12" cy="10.2" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="10.2" r="4.2" opacity=".55"/>',
  '1920x1080': '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M9 20.5h6M12 16.5v4"/>',
  '1920x1080-vf': '<rect x="2.5" y="4" width="19" height="12.5" rx="2" stroke-dasharray="3 2.4"/><path d="M9 20.5h6M12 16.5v4"/><rect x="12.5" y="9.5" width="6.5" height="4.5" rx="1" fill="currentColor" stroke="none"/>',
  '1920x1080-team': '<circle cx="9" cy="8.6" r="3"/><circle cx="16.6" cy="9.6" r="2.4"/><path d="M3.4 19.2c.6-3.1 2.8-4.8 5.6-4.8s5 1.7 5.6 4.8M15 14.9c2.6-.3 4.9 1 5.6 4"/>',
  sgg: '<path d="M3.5 6.2l5.3-2.2 6.4 2.2 5.3-2.2v13.8l-5.3 2.2-6.4-2.2-5.3 2.2z"/><path d="M8.8 4v13.8M15.2 6.2V20M3.5 11.6l5.3-1.6 6.4 2 5.3-1.8"/>',
  sido: '<path d="M3.5 6.2l5.3-2.2 6.4 2.2 5.3-2.2v13.8l-5.3 2.2-6.4-2.2-5.3 2.2z"/><path d="M8.8 4v13.8M15.2 6.2V20"/>',
  warn: '<path d="M12 3.6l9.2 16H2.8z" stroke-linejoin="round"/><path d="M12 10v4.2M12 16.8v.3" stroke-width="2.2"/>',
  warnsea: '<path d="M12 2.8l7 12.1H5z" stroke-linejoin="round"/><path d="M12 7.6v3.4M12 12.8v.2" stroke-width="2.1"/><path d="M2.5 19.2c1.6 0 1.6-1.3 3.2-1.3s1.6 1.3 3.2 1.3 1.6-1.3 3.1-1.3 1.6 1.3 3.2 1.3 1.6-1.3 3.2-1.3 1.6 1.3 3.1 1.3"/>',
  // 예상 강수·적설 = 빗방울 + 눈송이
  rain: '<path d="M8.6 3.4C6.2 6.6 4.8 8.8 4.8 10.6a3.8 3.8 0 007.6 0c0-1.8-1.4-4-3.8-7.2z" stroke-linejoin="round"/><path d="M17 11.5v9M13.1 13.7l7.8 4.6M13.1 18.3l7.8-4.6"/>',
  // 생활기상 = 해(자외선)
  life: '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.4 5.4l1.6 1.6M17 17l1.6 1.6M5.4 18.6L7 17M17 7l1.6-1.6"/>',
  // 미세먼지 농도 = 흩어진 먼지 알갱이(채움 점)
  dust: '<circle cx="7" cy="8" r="1.7" fill="currentColor" stroke="none"/><circle cx="14.6" cy="6.4" r="2.3" fill="currentColor" stroke="none"/><circle cx="18" cy="13.4" r="1.5" fill="currentColor" stroke="none"/><circle cx="9.6" cy="14.6" r="2.7" fill="currentColor" stroke="none"/><circle cx="15.4" cy="19.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.6" cy="18.4" r="1.1" fill="currentColor" stroke="none"/>',
  // 미세먼지 예보 = 달력 + 먼지 점
  dustFcst: '<rect x="3.5" y="5" width="17" height="15" rx="2.6"/><path d="M3.5 9.6h17M8 3v4M16 3v4"/><circle cx="9" cy="14.6" r="1.4" fill="currentColor" stroke="none"/><circle cx="14.6" cy="13.6" r="1.8" fill="currentColor" stroke="none"/><circle cx="12.2" cy="17.4" r="1.1" fill="currentColor" stroke="none"/>',
  // 서울 = 구 경계 윤곽 + 한강
  seoul: '<path d="M4 9.2l4.2-4 5 1.1 4-2 3 4.2-1 5.6 1.8 3.8-5 2-5-1.1-4 1-3-4z" stroke-linejoin="round"/><path d="M3.6 13.6c2.4-1 4.6 1 7-.2s4.9-1.5 9.8.2"/>',
  // 태풍 = 지도에 그리는 우리 태풍 아이콘(typhoon-icon.js 일러스트, 304×440) 모양을 그대로 옮긴 채운 도형 — 색은 다른 카드 아이콘처럼 글자색(currentColor), 눈은 뚫림
  typhoon: `<path fill="currentColor" stroke="none" fill-rule="evenodd" transform="translate(6.2 2.6) scale(0.0425)" d="${'M245 13C228 32 205 62 210 95C265 125 300 180 290 245C278 340 190 410 58 427C76 408 99 378 94 345C39 315 4 260 14 195C26 100 114 30 245 13ZM232 220A80 80 0 1 0 72 220A80 80 0 1 0 232 220Z'}"/>`,
  // 태풍 비교 = 같은 아이콘 두 개(뒤 것은 옅게)
  typhoonCompare: `<g fill="currentColor" stroke="none" fill-rule="evenodd"><path opacity=".5" transform="translate(2.2 1.6) scale(0.034)" d="${'M245 13C228 32 205 62 210 95C265 125 300 180 290 245C278 340 190 410 58 427C76 408 99 378 94 345C39 315 4 260 14 195C26 100 114 30 245 13ZM232 220A80 80 0 1 0 72 220A80 80 0 1 0 232 220Z'}"/><path transform="translate(11.3 7.4) scale(0.034)" d="${'M245 13C228 32 205 62 210 95C265 125 300 180 290 245C278 340 190 410 58 427C76 408 99 378 94 345C39 315 4 260 14 195C26 100 114 30 245 13ZM232 220A80 80 0 1 0 72 220A80 80 0 1 0 232 220Z'}"/></g>`,
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
  for (const c of mapCards()) {
    const b = cgsCardBtn(c.id, c.label, c.sub, 'styleUse');   // 이름 + 한 줄 설명(무슨 자료 · 어떤 구분) — 예보를 읽어 뒀으면 syncStyleUse가 정확도로 바꾼다
    b.dataset.card = c.id;
    b.dataset.style = c.styles[0];   // 카드의 지금 구분(markStyleBtns가 고른 구분으로 바꾼다)
    b.onclick = () => {
      const k = cardStyleFor(c);   // 작업 중 지금 지도가 이 카드 안이면 그 구분 그대로(예: 시도), 시작 화면이면 카드의 첫 구분
      pendingStyle = k;
      syncCgSetup();
      cgsShowOtherPane('style');
    };
    w.append(b);
  }
  // 그리드 맨 끝 한 줄 — '칠하는 구분 · 시군 173곳' + 카드 안 전환 칩(예상 강수·적설: 시군 | 시도). 칩도 #styleBtns 안이라 [data-style="sido"]로 고를 수 있다.
  const row = document.createElement('div'); row.className = 'cgsUnitRow'; row.id = 'cgsUnitRow';
  const lab = document.createElement('span'); lab.className = 'cgsUnitLab'; lab.textContent = '칠하는 구분';
  const val = document.createElement('span'); val.className = 'cgsUnitVal'; val.id = 'cgsUnitVal';
  const chips = document.createElement('span'); chips.className = 'cgsUnitChips'; chips.id = 'cgsUnitChips';
  chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', '칠하는 구분');
  for (const c of mapCards()) for (const k of c.styles.filter((s) => MAP.styles[s])) {
    if (c.styles.filter((s) => MAP.styles[s]).length < 2) break;
    const ch = document.createElement('button'); ch.type = 'button'; ch.className = 'cgsUnitChip';
    ch.dataset.card = c.id; ch.dataset.style = k; ch.textContent = mapUnitOf(k); ch.title = mapUnitText(k);
    ch.onclick = () => { pendingStyle = k; syncCgSetup(); cgsShowOtherPane('style'); };
    chips.append(ch);
  }
  row.append(lab, val, chips);
  w.append(row);
  markStyleBtns();
  syncStyleUse();
}

// 카드 밑 설명 = 무슨 자료 · 어떤 구분. 예상 강수·적설 카드는 예보(API)를 읽어 둔 상태면 '고른 구분(시군·시도)에 칠하면 정확한가'를 알려준다.
function syncStyleUse() {
  for (const b of document.querySelectorAll('#styleBtns .cgsCard')) {
    const c = MAP_CARDS.find((x) => x.id === b.dataset.card);
    const s = b.querySelector('.styleUse');
    if (!c || !s) continue;
    const acc = fctRows.length && c.styles.length > 1 ? styleAccuracy(b.dataset.style) : null;
    if (acc) {
      s.textContent = (acc[1] ? '✓ ' : '') + acc[0];
      s.style.opacity = acc[1] ? '1' : '.8';
    } else {
      s.textContent = (c.subs && c.subs[b.dataset.style]) || c.sub;   // 카드 안 구분을 바꾸면(시도) 설명도 그 구분으로
      s.style.opacity = '';
    }
  }
  // 칩 풍선 도움말 — 구역 수(+ 예보를 읽어 뒀으면 정확도)
  for (const ch of document.querySelectorAll('#styleBtns .cgsUnitChip')) {
    const acc = fctRows.length ? styleAccuracy(ch.dataset.style) : null;
    ch.title = mapUnitText(ch.dataset.style) + (acc ? ' · ' + acc[0] : '');
  }
}
