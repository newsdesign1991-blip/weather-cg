/* [모듈] js/floating-panels.js — 떼어낸 창(도킹), 패널 크기, 제목줄 색, 레이아웃 저장/불러오기, 제목줄 메뉴(setupMenus — 프로젝트·설정(렌치)), 시작 화면 */
'use strict';
// ===================== 떼어낸 창 (포토샵식 도킹) =====================
// .sec 노드를 사이드바 <-> 창 사이로 '옮기기만' 한다. 새로 만들면 지금까지 연결한
// 핸들러(수백 개)가 전부 끊어진다. innerHTML 로 다시 그리는 짓은 절대 하지 말 것.
const LAYOUT_KEY = 'wcg_layout';
const DOCK_EDGE = 90;   // 창 왼쪽이 사이드바에서 이 거리 안이면 도로 붙는다
const DRAG_SLOP = 5;    // 이만큼 움직여야 '끌기'. 안 그러면 접기 클릭이 안 된다

// wins = [{ id, x, y, w, h, secs:[...], active }]
let wins = [];
let winSeq = 1;
let dockSide = 'left';   // 사이드바가 어느 끝에 붙어 있나 (처음 켰을 때 기본: 왼쪽)

// DOM만 반영 (저장 안 함). 초기화·불러오기 때는 이걸 써야 한다 —
// setDockSide가 loadLayout보다 먼저 저장을 부르면 저장된 배치를 덮어써 버린다.
function applyDockSide() {
  document.querySelector('.app').classList.toggle('dockR', dockSide === 'right');
  updateDockBtn();
  applyPanelSize();    // 폭이 바뀌면 손잡이 위치도 다시 잡는다
  applyToolbarPos();   // 스테이지 폭이 바뀌니 툴바 위치 다시 잡는다
}
// 사이드바 하단 위치 버튼 — 화살표 방향·툴팁을 현재 도킹에 맞춘다(아이콘 버튼이라 텍스트 대신 회전).
function updateDockBtn() {
  const b = $('#dockSide'); if (!b) return;
  b.title = dockSide === 'right' ? '사이드바를 왼쪽으로' : '사이드바를 오른쪽으로';
  const svg = b.querySelector('svg'); if (svg) svg.style.transform = dockSide === 'right' ? 'scaleX(-1)' : '';
}

// 사이드바 크기 = zoom 배율(panelZoom). 폭이 커지면 글자·컨트롤이 다 같이 커진다.
const PANEL_BASE = 288;
let panelZoom = 1.3;   // 처음 켰을 때 기본을 조금 넓게 (288 -> 약 374px)
function applyPanelSize() {
  const p = $('#panel');
  if (!p) return;
  p.style.setProperty('--pz', panelZoom);
  syncWinZoom();       // 떼어낸 창도 같은 배율로 (창 크기도 같은 비율로)
  positionPanelResize();
  // 사이드바 폭이 바뀌면 스테이지 폭도 바뀌므로 상단바가 좁아진 캔버스에 맞춰 '옆으로' 따라오게 한다.
  if (typeof applyToolbarPos === 'function') applyToolbarPos();
  positionApiGear();   // API 설정 버튼도 사이드바를 안 겹치게 스테이지 쪽 모서리로
}
// API 설정 플로팅 버튼을 '스테이지 쪽' 하단 모서리에 둔다 — 사이드바(새로 시작 버튼)와 안 겹치게.
function positionApiGear() {
  const g = $('#apiGear'), pop = $('#apiPop'), panel = $('#panel');
  if (!g) return;
  const pw = panel ? Math.round(panel.getBoundingClientRect().width) : 0;
  const right = (dockSide === 'right') ? (pw + 16) : 16;   // 오른쪽 도킹이면 사이드바 폭만큼 왼쪽으로
  g.style.right = right + 'px';
  if (pop) pop.style.right = right + 'px';
}
function positionPanelResize() {
  const h = $('#panelResize'), p = $('#panel');
  if (!h || !p) return;
  const r = p.getBoundingClientRect();   // zoom 반영된 실제 화면 폭
  // 보이지 않는 잡기 영역(12px)을 사이드바의 '안쪽(스테이지 쪽)' 끝선 한가운데에 — 끝선을 잡고 끌면 크기 조절
  h.style.left = Math.round((dockSide === 'right' ? r.left : r.right) - 6) + 'px';
}
function setDockSide(side) {
  dockSide = side === 'right' ? 'right' : 'left';
  applyDockSide();
  saveLayout();   // 사용자 조작일 때만 저장
}

// 툴바 좌우 위치. null 이면 기본 = 스테이지(캔버스) 가운데. 내가 끌어 옮기면 그 자리를 기억한다.
// 스테이지 안에서 절대배치라 스테이지 폭 기준으로 잡는다.
let toolbarX = null;   // 처음 켰을 때 기본: 가운데 (사이드바 크기가 바뀌어도 다시 가운데로)
// 툴바 세로 위치. null = 맨 위(제목줄 바로 아래), 'bottom' = 창 아래 끝에 붙음(창 크기가 바뀌어도 아래), 숫자 = 스테이지 기준 px
let toolbarY = null;
const TB_SNAP = 14, TB_GAP = 10;   // 붙는 거리(px) · 붙었을 때 띄우는 간격(px)
// 아래 끝 자리 — 타임라인이 열려 있으면(스테이지 아래 여백이 커짐) 그 위까지
function toolbarBottomY(st, tb) {
  const extra = Math.max(0, (parseFloat(getComputedStyle(st).paddingBottom) || 0) - 26);
  return Math.max(0, st.clientHeight - extra - tb.offsetHeight - TB_GAP);
}
function applyToolbarPos() {
  const tb = $('#topbar'), st = $('#stage');
  if (!tb || !st) return;
  const max = Math.max(16, st.clientWidth - tb.offsetWidth - 16);
  // 기본(null): 스테이지 가운데. 내가 안 건드리면 좌우로 치우치지 않고 항상 가운데에 온다.
  const center = clamp(Math.round((st.clientWidth - tb.offsetWidth) / 2), 16, max);
  const x = toolbarX == null ? center : clamp(toolbarX, 16, max);
  tb.style.left = Math.round(x) + 'px';
  const yMax = toolbarBottomY(st, tb);
  const y = toolbarY == null ? 0 : toolbarY === 'bottom' ? yMax : clamp(toolbarY, 0, yMax);
  tb.style.top = Math.round(y) + 'px';
}
// 끌기 중 붙이기 — 위(제목줄 바로 아래)·아래(창 아래 끝)·작업창(아트보드) 위/아래 바깥, 가로는 작업창 왼끝·오른끝·가운데·스테이지 가운데.
// 가까운(TB_SNAP 이내) 것에 붙는다. 반환 x/y 는 toolbarX/toolbarY 에 그대로 넣는 값(null·'bottom' 포함)
function snapToolbar(x, y) {
  const tb = $('#topbar'), st = $('#stage'), fit = document.querySelector('.fit');
  const w = tb.offsetWidth, h = tb.offsetHeight, sr = st.getBoundingClientRect();
  const xs = [[Math.round((st.clientWidth - w) / 2), null]];
  const ys = [[0, null], [toolbarBottomY(st, tb), 'bottom']];
  if (fit) {
    const r = fit.getBoundingClientRect(), L = r.left - sr.left, R = r.right - sr.left, T = r.top - sr.top, B = r.bottom - sr.top;
    xs.push([L], [R - w], [Math.round((L + R - w) / 2)]);
    ys.push([T - h - TB_GAP], [B + TB_GAP]);
  }
  const pick = (list, v) => {
    let best = null, d0 = TB_SNAP + 1;
    for (const [p, key] of list) { const d = Math.abs(p - v); if (d < d0) { d0 = d; best = key === undefined ? p : key; } }
    return d0 <= TB_SNAP ? { v: best } : null;
  };
  const sx = pick(xs, x), sy = pick(ys, y);
  return { x: sx ? sx.v : x, y: sy ? sy.v : y };
}
// 플로팅 바 모양 판번호 — 2: 메뉴를 맨 위 제목줄로 옮겨 칠하기·브러쉬·이동·되돌리기만 남은 좁은 바.
// 옛 넓은 바 기준으로 저장된 위치(toolbarX)는 안 맞으니 한 번 버리고 가운데에서 시작한다.
const TOOLBAR_V = 2;
// 맨 위 제목줄 높이(px) — 떼어낸 창·둘러보기 카드가 그 위(데스크톱에선 창 끌기 영역)로 올라가지 않게.
function titleBarH() { const t = $('#titlebar'); return t ? t.offsetHeight : 0; }
// 창 전체(제목줄 포함)를 덮는 어두운 막들 — [선택자, 막 색('' = 그 요소의 배경색)].
// 둘러보기는 어두운 막이 .tourSpot 그림자라 배경색이 없어 색을 직접 적는다(.tourSpot box-shadow 바깥색과 같게).
const TITLEBAR_DIM = [
  ['#tourWrap.on', 'rgba(6, 8, 12, .76)'],
  ['#tossOv', ''], ['#confirmOverlay.on', ''], ['#slotOverlay.on', ''], ['#bulHelpPop.on', ''], ['#dropHint.on', ''],
  ['#cgSetupOv.on', 'var(--pop-ov)'],   // CG 구성 창 — 막이 서서히 나타나 배경색 대신 최종 색(.cgSetupOv 배경과 같은 변수, 테마마다 다름)을 읽는다
  ['#exportOv.on', 'var(--pop-ov)'],    // 이미지로 추출 팝업 — CG 구성 창과 같은 막
  ['#wrnColOv.on', 'var(--pop-ov)'],    // 특보 종류별 색 팝업 — 같은 막
];
function titleBarDimLayers() {
  const out = [];
  for (const [sel, col] of TITLEBAR_DIM) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const v = /^var\((--[\w-]+)\)$/.exec(col);   // 캔버스는 var() 를 못 읽으니 지금 테마 값으로 바꿔 넣는다
    out.push(v ? getComputedStyle(document.documentElement).getPropertyValue(v[1]).trim() : (col || cs.backgroundColor));
  }
  return out;
}
// 바탕색 위에 반투명 막들을 차례로 얹은 색(#rrggbb). CSS 색 문법(rgba·color-mix 결과 등)은 캔버스가 해석·합성한다.
let _tbMixCtx = null;
function mixColorLayers(base, layers) {
  if (!_tbMixCtx) { const c = document.createElement('canvas'); c.width = c.height = 1; _tbMixCtx = c.getContext('2d', { willReadFrequently: true }); }
  const x = _tbMixCtx;
  x.clearRect(0, 0, 1, 1);
  x.fillStyle = '#000'; x.fillStyle = base; x.fillRect(0, 0, 1, 1);
  for (const l of layers) { x.fillStyle = 'transparent'; x.fillStyle = l; x.fillRect(0, 0, 1, 1); }
  const d = x.getImageData(0, 0, 1, 1).data;
  return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
}
// 데스크톱 앱: 창 버튼(최소화·최대화·닫기) 바탕·기호 색을 제목줄(--surface 바탕, --on-surface 글자)에 맞춘다.
// 모달·둘러보기의 어두운 막이 떠 있으면 OS가 그리는 창 버튼 자리는 그 막에 안 덮이므로, 막을 합성한 색으로 바탕을 같이 어둡게 한다.
// (막이 떠 있는 동안에도 제목줄 빈 곳은 창 끌기 그대로 — 모달을 띄운 채 창을 옮길 수 있다)
// 웹(window.wcgDesktop 없음)에선 아무 것도 안 한다. 테마를 바꿀 때·막이 생기고 사라질 때 부른다(부팅 때 한 번 포함).
let _tbColorKey = '';
function syncTitleBarColors() {
  const d = window.wcgDesktop;
  if (!d || typeof d.setTitleBar !== 'function') return;
  const cs = getComputedStyle(document.documentElement), layers = titleBarDimLayers();
  const color = mixColorLayers(cs.getPropertyValue('--surface').trim(), layers);
  // 막이 떠 있어도 창 버튼 기호는 보이게 — 어두워진 바탕이면 밝은 기호, 밝은 테마의 옅은 막(바탕이 아직 밝음)이면 어두운 기호. 평소엔 제목줄 글자색.
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const symbolColor = !layers.length ? cs.getPropertyValue('--on-surface').trim()
    : mixColorLayers(color, [lum(color) > 0.45 ? 'rgba(15, 23, 42, .8)' : 'rgba(255, 255, 255, .72)']);
  if (color + symbolColor === _tbColorKey) return;   // 같은 색이면 다시 안 보낸다
  _tbColorKey = color + symbolColor;
  d.setTitleBar({ color, symbolColor });
}
// 어두운 막이 생기고 사라지는 걸 지켜본다 — 모달(#tossOv·#slotOverlay)은 body에 붙었다 떨어지고, 나머지는 class 'on'으로 켜진다.
function watchTitleBarDim() {
  if (!window.wcgDesktop || typeof window.wcgDesktop.setTitleBar !== 'function' || typeof MutationObserver !== 'function') return;
  const mo = new MutationObserver(() => { watch(); syncTitleBarColors(); });
  const watch = () => {
    for (const [sel] of TITLEBAR_DIM) {
      const el = document.getElementById(sel.slice(1).split('.')[0]);
      if (el && !el._tbDimWatched) { el._tbDimWatched = true; mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }); }
    }
  };
  mo.observe(document.body, { childList: true });
  watch(); syncTitleBarColors();
}
const secNode = (s) => document.querySelector(`.sec[data-sec="${s}"]`);
const winOf = (s) => wins.find((w) => w.secs.includes(s));
// 탭 이름 = 제목 글자만. h3 맨 앞엔 아이콘(svg)이, 끝엔 갈래 칩이 붙어 있어 firstChild로 읽으면 빈 글자가 된다.
const secTitle = (s) => {
  const h = secNode(s)?.querySelector('h3');
  if (!h) return s;
  const c = h.cloneNode(true);
  c.querySelectorAll('.secIcon, .tag').forEach((n) => n.remove());
  return c.textContent.trim() || s;
};

function saveLayout() {
  try {
    const docked = [...$('#panel').children].map((n) => n.dataset.sec).filter(Boolean);
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ docked, wins, dockSide, toolbarX, toolbarY, toolbarV: TOOLBAR_V, panelZoom }));
  } catch (e) { /* 용량 초과 등 — 배치는 없어도 앱은 돌아간다 */ }
}

// 창 하나를 그린다. 안의 .sec 은 옮겨 담을 뿐 다시 만들지 않는다.
function renderWin(w) {
  let el = document.querySelector(`.win[data-win="${w.id}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'win';
    el.dataset.win = w.id;
    // 닫기 = 사이드바로 되돌리기. 글자 ✕ 대신 얇은 X 아이콘(SVG) — 우리 UI의 둥근 아이콘 버튼
    el.innerHTML = '<div class="winbar"><div class="wintabs"></div><button class="winclose" title="사이드바로 되돌리기" aria-label="사이드바로 되돌리기">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button></div>' +
      '<div class="winbody"></div><div class="winsize" title="끌어서 크기 조절"></div>';
    $('#wins').append(el);
    el.querySelector('.winbar').addEventListener('pointerdown', (e) => {
      if (e.target.closest('.winclose') || e.target.closest('.wintab')) return;
      startWinDrag(e, w);
    });
    el.querySelector('.winclose').onclick = () => closeWin(w);
    el.querySelector('.winsize').addEventListener('pointerdown', (e) => startWinResize(e, w));
    el.addEventListener('pointerdown', () => raiseWin(w), true);
    // 탭줄은 스크롤바를 숨겼으니 휠(세로·가로 모두)로 옆으로 넘긴다 — 넘칠 때만
    const tb = el.querySelector('.wintabs');
    tb.addEventListener('wheel', (e) => {
      if (tb.scrollWidth <= tb.clientWidth + 1) return;
      tb.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      e.preventDefault();
    }, { passive: false });
  }
  el.style.left = w.x + 'px'; el.style.top = w.y + 'px';
  el.style.width = w.w + 'px'; el.style.height = w.h + 'px';
  el.classList.toggle('solo', w.secs.length === 1);   // 항목 하나면 탭 숨기고 h3를 제목으로

  if (!w.secs.includes(w.active)) w.active = w.secs[0];
  const tabs = el.querySelector('.wintabs');
  tabs.textContent = '';
  for (const s of w.secs) {
    const t = document.createElement('div');
    t.className = 'wintab' + (s === w.active ? ' on' : '');
    // 사이드바 머리와 같은 아이콘(복제) + 이름. 좁아져 말줄임이 돼도 툴팁으로 전체 이름
    const ic = secNode(s)?.querySelector(':scope > h3 > .secIcon');
    if (ic) t.append(ic.cloneNode(true));
    const nm = document.createElement('span');
    nm.className = 'wtName';
    nm.textContent = t.title = secTitle(s);
    t.append(nm);
    t.dataset.sec = s;
    t.addEventListener('pointerdown', (e) => startTabDrag(e, w, s));
    tabs.append(t);
  }
  showActiveTab(el);
  // 탭이 하나뿐이면 탭도 제목 노릇을 하니 그대로 둔다 (닫기 버튼과 균형)
  const body = el.querySelector('.winbody');
  // 비활성 탭도 전부 이 창 body로 옮긴다 — 다른 창에 합쳐질 때 옛 창(.win)과 함께 지워지지 않게
  for (const s of w.secs) {
    const n = secNode(s);
    if (!n) continue;
    if (n.parentElement !== body) body.append(n);
    n.style.display = (s === w.active && !secModeHidden(s)) ? '' : 'none';   // 지도 종류로 숨긴 카드는 계속 숨김
  }
  return el;
}

// 고른 탭이 탭줄 밖(합칠 때 맨 뒤에 붙는다·창을 좁혔다)이면 보이게 넘긴다 — 탭이 여럿일 땐 h3를 숨기니 고른 탭이 곧 제목이다.
// (scrollIntoView는 overflow:hidden 인 창까지 밀어버릴 수 있어 탭줄만 직접 넘긴다)
function showActiveTab(el) {
  el.classList.remove('tabsTight');
  if (el.classList.contains('solo')) return;
  const tabs = el.querySelector('.wintabs'), on = tabs && tabs.querySelector('.wintab.on');
  if (!on) return;
  // 다른 탭이 다 아이콘만 남아도 넘치면 그때만 고른 탭도 줄인다(CSS .tabsTight)
  if (tabs.scrollWidth > tabs.clientWidth + 1) el.classList.add('tabsTight');
  const L = on.offsetLeft, R = L + on.offsetWidth;
  if (L < tabs.scrollLeft) tabs.scrollLeft = L;
  else if (R > tabs.scrollLeft + tabs.clientWidth) tabs.scrollLeft = R - tabs.clientWidth;
}

// 창을 맨 앞으로. z를 끝없이 올리지 않고 '지금 순서'대로 1..n 으로 다시 매긴다(창 층 #wins 안에서만 쓰는 번호).
const raiseWin = (w) => {
  const el = document.querySelector(`.win[data-win="${w.id}"]`);
  if (!el) return;
  const order = [...document.querySelectorAll('#wins > .win')]
    .filter((x) => x !== el)
    .sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0));   // 같은 번호(새 창 등)는 DOM 순서 그대로
  order.push(el);
  order.forEach((x, i) => { x.style.zIndex = i + 1; });
};

// 떼어낸 창 배율 = 사이드바 배율(panelZoom). 창 안만 zoom 하므로(.win CSS) 배율이 바뀌면 창 크기도 같은 비율로 맞춰
// 안의 배치가 그대로이게 한다. w.wz = 그 창의 w·h를 잰 배율(옛 저장본엔 없음 = 배율을 안 쓰던 때 → 1).
// 반올림하지 않는다 — 사이드바를 천천히 끌면 한 번에 0.5px도 안 커져서 반올림하면 영영 안 커진다.
function syncWinZoom() {
  const box = $('#wins');
  if (box) box.style.setProperty('--pz', panelZoom);
  for (const w of wins) {
    const k = panelZoom / (w.wz || 1);
    w.wz = panelZoom;
    if (Math.abs(k - 1) < 1e-6) continue;
    w.w *= k;
    const el = document.querySelector(`.win[data-win="${w.id}"]`);
    if (!el) { w.h = Math.min(w.h * k, Math.max(120, window.innerHeight - w.y - 20)); continue; }   // 아직 안 그린 창(배치 불러오기 중) — 그릴 때 이 크기로
    el.style.width = w.w + 'px';
    if (w.sized) { w.h = Math.min(w.h * k, Math.max(120, window.innerHeight - w.y - 20)); el.style.height = w.h + 'px'; }
    else fitWin(w);   // 손대지 않은 창은 내용 높이에 다시 맞춘다
  }
}

function renderWins() {
  for (const w of wins) renderWin(w);
  for (const el of document.querySelectorAll('.win')) {
    if (!wins.some((w) => w.id === el.dataset.win)) el.remove();
  }
  if (typeof refreshToolGroup === 'function') refreshToolGroup();  // 떼고 붙임에 따라 묶음 경계 갱신
  saveLayout();
}

// 사이드바의 제자리로 되돌린다 (SEC_ORDER 순서를 지켜서 꽂는다)
function dockSec(s, beforeSec) {
  const panel = $('#panel');
  const n = secNode(s);
  if (!n) return;
  n.style.display = secModeHidden(s) ? 'none' : '';   // 지도 종류로 숨긴 카드는 사이드바에서도 숨김 유지
  const want = beforeSec !== undefined ? beforeSec : (() => {
    const i = SEC_ORDER.indexOf(s);
    for (let j = i + 1; j < SEC_ORDER.length; j++) {
      const c = panel.querySelector(`.sec[data-sec="${SEC_ORDER[j]}"]`);
      if (c && c.parentElement === panel) return SEC_ORDER[j];
    }
    return null;
  })();
  const ref = want ? panel.querySelector(`.sec[data-sec="${want}"]`) : null;
  if (ref && ref.parentElement === panel) panel.insertBefore(n, ref);
  else panel.append(n);
  pinPanelFooter();   // 섹션 뒤로 밀리지 않게 여백·footer를 맨 아래로
}

// 사이드바 맨 아래 '스크롤 여백(panelScrollPad)'과 footer(새로 시작)를 항상 마지막에 오게 한다.
// 섹션을 다시 붙이는 조작(기본 배치·창 되돌리기 등)이 이들 뒤로 섹션을 밀면 레이아웃이 깨지기 때문.
function pinPanelFooter() {
  const panel = $('#panel');
  const pad = panel.querySelector('.panelScrollPad');
  const ft = panel.querySelector('.panelFooter');
  if (pad) panel.append(pad);
  if (ft) panel.append(ft);
}

function closeWin(w) {
  for (const s of w.secs) dockSec(s);
  wins = wins.filter((x) => x !== w);
  renderWins();
  status('사이드바로 되돌렸습니다');
}

// 떼어낸 창은 스크롤 없이 다 보이는 게 목표다. 내용 높이를 재서 그만큼 키우고,
// 화면을 넘으면 화면에 맞춘다 (그때는 어쩔 수 없이 스크롤이 생긴다).
function fitWin(w) {
  const el = document.querySelector(`.win[data-win="${w.id}"]`);
  if (!el) return;
  const body = el.querySelector('.winbody');
  const sec = [...body.children].find((n) => n.classList.contains('sec') && n.style.display !== 'none');
  if (!sec) return;
  // 머리는 고정, 내용(.body)만 스크롤한다 → 필요한 높이 = 지금 창 높이 - 지금 스크롤 칸(.body) 높이 + 내용 원래 높이.
  // (.body 는 창 높이에 맞춰 늘고 줄어 scrollHeight로는 못 잰다 — 늘어나지 않는 .bodyInner 높이를 잰다)
  // 창 안은 zoom(--pz)이라 offsetHeight(배율 전 값)와 섞으면 틀린다 — 모두 화면 기준 getBoundingClientRect로 잰다.
  const sb = sec.querySelector(':scope > .body');
  const inner = sb && sb.querySelector(':scope > .bodyInner');
  if (!inner) return;
  const need = Math.ceil(el.getBoundingClientRect().height - sb.getBoundingClientRect().height + inner.getBoundingClientRect().height) + 1;
  w.h = Math.round(Math.min(need, window.innerHeight - w.y - 20));
  w.h = Math.max(w.h, 120);
  el.style.height = w.h + 'px';
}

// 항목 하나를 새 창으로 떼어낸다
function popOut(s, x, y) {
  const from = winOf(s);
  if (from) {
    from.secs = from.secs.filter((v) => v !== s);
    if (!from.secs.length) wins = wins.filter((v) => v !== from);
  }
  const W = Math.round(320 * panelZoom);   // 창 안이 사이드바 배율로 커지니 폭도 같이 (배율 1에서 320px)
  const w = {
    id: 'w' + winSeq++,
    // 화면 밖에 생기면 못 찾는다 — 처음부터 안쪽으로 잡는다
    x: Math.round(Math.max(0, Math.min(x, window.innerWidth - W - 8))),
    y: Math.round(Math.max(titleBarH(), Math.min(y, window.innerHeight - 140))),
    w: W, h: 380, wz: panelZoom, secs: [s], active: s,
  };
  wins.push(w);
  renderWins();
  raiseWin(w);
  // 높이는 끌기가 끝난 뒤에 맞춘다 — 여기서 재면 아직 제목 자리에 있어서
  // '화면 아래에 있는 항목'일수록 창이 납작해진다
  return w;
}

// 다른 창의 탭줄 위에 떨궜나? (합치기 판정)
function winBarUnder(x, y, skipId) {
  for (const el of [...document.querySelectorAll('.win')].reverse()) {
    if (el.dataset.win === skipId) continue;
    const bar = el.querySelector('.winbar').getBoundingClientRect();
    if (x >= bar.left && x <= bar.right && y >= bar.top && y <= bar.bottom) {
      return wins.find((w) => w.id === el.dataset.win);
    }
  }
  return null;
}
// 사이드바가 붙어 있는 쪽 가장자리에 왔나. 왼쪽/오른쪽 어디에 있든 똑같이 동작해야 한다.
const overDock = (x) => {
  const r = $('#panel').getBoundingClientRect();
  return dockSide === 'right' ? x > r.left - DOCK_EDGE : x < r.right + DOCK_EDGE;
};

// 지금 커서 위치에서 사이드바의 어느 항목 앞에 꽂힐지
// 보이는 카드(.sec)만 본다 — 스크롤 여백·footer·머리표처럼 data-sec 없는 자식은 빼야 undefined(=안 붙음)가 안 나온다. 없으면 null(맨 뒤).
function dockTargetAt(y) {
  const panel = $('#panel');
  for (const n of panel.querySelectorAll(':scope > .sec[data-sec]')) {
    if (n.style.display === 'none') continue;
    const r = n.getBoundingClientRect();
    if (y < r.top + r.height / 2) return n.dataset.sec;
  }
  return null;
}

function showDockHint(y) {
  const panel = $('#panel');
  const pr = panel.getBoundingClientRect();
  const line = $('#dockline');
  const t = dockTargetAt(y);
  const ref = t ? panel.querySelector(`.sec[data-sec="${t}"]`) : null;
  const secs = [...panel.querySelectorAll(':scope > .sec[data-sec]')].filter((n) => n.style.display !== 'none');
  const last = secs[secs.length - 1];   // 맨 뒤에 붙는 자리 = 마지막 카드 바로 아래(footer 아래가 아니라)
  const top = ref ? ref.getBoundingClientRect().top : (last?.getBoundingClientRect().bottom ?? pr.top);
  line.style.left = pr.left + 'px';
  line.style.width = pr.width + 'px';
  line.style.top = Math.max(pr.top, Math.min(pr.bottom - 3, top)) + 'px';
  line.classList.add('on');
  panel.classList.add('dragover');
  return t;
}
const hideHints = () => {
  $('#dockline').classList.remove('on');
  document.querySelectorAll('.win.mergeTarget').forEach((n) => n.classList.remove('mergeTarget'));
  $('#panel').classList.remove('dragover');
};
// 합칠 창을 파랗게 — 그 창 안에 덮는다(CSS .win.mergeTarget::after). 창 층 순서를 그대로 따라 대상 창 위·끄는 창 아래에 보인다.
function showMergeHint(w) {
  document.querySelector(`.win[data-win="${w.id}"]`)?.classList.add('mergeTarget');
}

// ---- 끌기: 사이드바 제목 -> 떼어내기 ----
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest('.sec > h3');
  if (!h) return;
  const sec = h.parentElement;
  if (sec.parentElement !== $('#panel')) return;   // 창 안의 것은 탭으로 다룬다
  const s = sec.dataset.sec;
  const x0 = e.clientX, y0 = e.clientY;
  let moved = false;
  const mv = (ev) => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_SLOP) return;
    if (!moved) {
      moved = true;
      const w = popOut(s, ev.clientX - 40, ev.clientY - 10);
      startWinDrag(ev, w, true);   // 곧바로 창 끌기로 넘긴다
    }
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    if (!moved) {
      // 설정 항목(출력·지도종류·추출·프로젝트)은 항상 펴둔다 — 클릭해도 안 접힘
      if (ALWAYS_OPEN.has(s)) return;
      // 도구 항목: 접혀 있었으면 그 자리에서 펴고(스크롤X) 나머지는 접는다. 펴져 있었으면 접는다.
      if (sec.classList.contains('closed')) revealSec(s, false);
      else sec.classList.add('closed');
    }
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  e.preventDefault();
});

// ---- 끌기: 창 이동 (합치기 / 도킹 판정) ----
function startWinDrag(e, w, already) {
  const el = renderWin(w);
  const r = el.getBoundingClientRect();
  const dx = e.clientX - r.left, dy = e.clientY - r.top;
  el.classList.add('drag');
  raiseWin(w);
  let target = null, dockAt = undefined;
  const mv = (ev) => {
    w.x = Math.round(ev.clientX - dx);
    w.y = Math.max(titleBarH(), Math.round(ev.clientY - dy));   // 제목줄 위로는 못 올린다(데스크톱에선 창 끌기 영역)
    el.style.left = w.x + 'px'; el.style.top = w.y + 'px';
    hideHints();
    target = winBarUnder(ev.clientX, ev.clientY, w.id);
    dockAt = undefined;
    if (target) showMergeHint(target);
    else if (overDock(ev.clientX)) dockAt = showDockHint(ev.clientY);
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    el.classList.remove('drag');
    hideHints();
    if (target) {
      target.secs.push(...w.secs);
      target.active = w.secs[0];
      wins = wins.filter((x) => x !== w);
      renderWins(); raiseWin(target);
      if (!target.sized) fitWin(target);
      saveLayout();
      status('탭으로 합쳤습니다');
    } else if (dockAt !== undefined) {
      for (const s of w.secs) dockSec(s, dockAt);
      wins = wins.filter((x) => x !== w);
      renderWins();
      status('사이드바에 붙였습니다');
    } else {
      renderWins();
      // 놓인 자리가 정해졌으니 이제 내용에 맞춰 키운다. 사람이 손으로 크기를
      // 바꿔둔 창은 건드리지 않는다 — 그걸 되돌리면 짜증난다.
      if (!w.sized) fitWin(w);
      saveLayout();
    }
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  if (already) mv(e);
  e.preventDefault();
}

// ---- 끌기: 탭 (골라 보기 / 끌어내면 분리) ----
function startTabDrag(e, w, s) {
  const x0 = e.clientX, y0 = e.clientY;
  let moved = false;
  const mv = (ev) => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_SLOP) return;
    if (!moved) {
      moved = true;
      if (w.secs.length === 1) { startWinDrag(ev, w, true); return; }  // 하나뿐이면 창째로
      const nw = popOut(s, ev.clientX - 40, ev.clientY - 10);
      startWinDrag(ev, nw, true);
    }
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    // 안 움직였으면 탭 고르기. 탭마다 내용 높이가 달라서 크기도 다시 맞춘다.
    if (!moved) { w.active = s; renderWins(); if (!w.sized) fitWin(w); saveLayout(); }
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  e.preventDefault();
  e.stopPropagation();
}

function startWinResize(e, w) {
  const x0 = e.clientX, y0 = e.clientY, w0 = w.w, h0 = w.h;
  const el = document.querySelector(`.win[data-win="${w.id}"]`);
  const mv = (ev) => {
    // 최소 크기 = .win CSS min-width/min-height 와 같게(배율 곱)
    w.w = Math.max(Math.round(220 * panelZoom), Math.round(w0 + ev.clientX - x0));
    w.h = Math.max(Math.round(90 * panelZoom), Math.round(h0 + ev.clientY - y0));
    w.sized = 1;   // 손으로 정한 크기 — 이후 자동 조절이 덮어쓰지 않는다
    el.style.width = w.w + 'px'; el.style.height = w.h + 'px';
    showActiveTab(el);   // 좁혀도 고른 탭(=제목)은 보이게
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    saveLayout();
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  e.preventDefault();
  e.stopPropagation();
}

function loadLayout() {
  let L = null;
  try { L = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); } catch (e) { /* 깨졌으면 기본 배치 */ }
  if (!L || !Array.isArray(L.docked)) return;
  if (L.toolbarX !== undefined && L.toolbarV === TOOLBAR_V) toolbarX = L.toolbarX;   // 옛 넓은 바 위치는 버림(가운데)
  if (L.toolbarV === TOOLBAR_V && (L.toolbarY === 'bottom' || typeof L.toolbarY === 'number')) toolbarY = L.toolbarY;   // 세로 위치(없으면 맨 위)
  if (L.panelZoom) panelZoom = L.panelZoom;
  dockSide = L.dockSide === 'left' ? 'left' : 'right';   // 저장에 없으면(옛 파일) 기본 오른쪽
  applyDockSide();   // 저장 안 함 — 방금 읽은 걸 도로 덮어쓰지 않게 (applyPanelSize도 부른다)
  const known = new Set(SEC_ORDER);
  // 창부터. 저장된 뒤에 없어진 항목은 버린다.
  wins = (L.wins || [])
    .map((w) => ({ ...w, secs: (w.secs || []).filter((s) => known.has(s) && secNode(s)) }))
    .filter((w) => w.secs.length);
  winSeq = wins.length + 1;
  for (const w of wins) { w.id = 'w' + winSeq++; }
  syncWinZoom();   // 저장 당시 배율(w.wz, 옛 저장본은 1)과 지금 배율이 다르면 창 크기를 그 비율로 (창 안은 지금 배율로 그려진다)
  // 화면 밖으로 나간 창은 끌어올 수가 없으니 들여놓는다 (창 크기를 줄인 채로 열었을 때)
  for (const w of wins) {
    w.x = Math.min(Math.max(0, w.x), Math.max(0, window.innerWidth - 120));
    w.y = Math.min(Math.max(titleBarH(), w.y), Math.max(titleBarH(), window.innerHeight - 40));
  }
  const inWin = new Set(wins.flatMap((w) => w.secs));
  const panel = $('#panel');
  for (const s of L.docked) {
    if (!known.has(s) || inWin.has(s) || s === 'legend') continue;   // 범례는 저장된 위치 무시하고 항상 정해진 자리(제목텍스트 밑)로
    const n = secNode(s);
    if (n) panel.append(n);
  }
  // 저장 당시엔 없던 새 항목 + 범례는 SEC_ORDER 상의 원래 자리에 꽂는다
  for (const s of SEC_ORDER) {
    if (inWin.has(s) || (L.docked.includes(s) && s !== 'legend')) continue;
    dockSec(s);
  }
  renderWins();
}

// 상단 메뉴바(맨 위 제목줄) — 설정 섹션(프로젝트)을 드롭다운으로 올린다. CG 종류·지도 종류는 CG 구성 창(setupCgSetup),
// 이미지로 추출은 팝업(setupExportDialog — js/export-dialog.js).
// + 제목줄 오른쪽 끝 렌치(#helperBtn, data-menu="cfg") = '설정' 드롭다운(배치 지정하기·기본값 굽기·설정 옮기기·기능 확장팩 상태).
function setupMenus() {
  const drop = $('#menuDrop');
  if (!drop) return;
  for (const s of ['proj', 'cfg']) { const n = secNode(s); if (n) { n.classList.remove('closed'); n.style.display = 'none'; drop.append(n); } }
  // 배치 지정하기 — 구운 배치 파일을 꽂아 개인/완전 기본 배치로 지정(팝업). 예전엔 사이드바 맨 아래, 지금은 설정(렌치) 메뉴 맨 위.
  // 팝업을 여니 드롭다운은 먼저 닫는다(close는 아래에서 정의 — 누를 땐 이미 있다).
  { const sb = $('#slotBtn'); if (sb) sb.onclick = () => { close(); openPresetSlots(); }; }
  // '새로 시작'은 프로젝트 메뉴에서 빼내 사이드바 맨 아래 붉은 footer로.
  const nw = $('#newWork');
  if (nw) {
    const pad = document.createElement('div'); pad.className = 'panelScrollPad'; $('#panel').appendChild(pad);
    const ft = document.createElement('div'); ft.className = 'panelFooter';
    const row = document.createElement('div'); row.className = 'footRow';
    nw.classList.add('danger', 'newBtn');
    // 사이드바 위치 바꾸기(화살표) + 기본 배치(되돌리기 아이콘) — 상단바에서 여기로 옮김
    const dock = document.createElement('button'); dock.id = 'dockSide'; dock.className = 'footIcon';
    dock.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>';
    dock.onclick = () => setDockSide(dockSide === 'left' ? 'right' : 'left');
    const reset = document.createElement('button'); reset.id = 'resetLayout'; reset.className = 'footIcon'; reset.title = '기본 배치 — 떼어낸 창을 전부 사이드바로';
    reset.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 9a7 7 0 111.5 6M4 9V4M4 9h5"/></svg>';
    reset.onclick = resetLayout;
    // (배치 지정하기는 설정(렌치) 메뉴로 옮김 — footer엔 새로 시작·좌우 바꾸기·기본 배치 한 줄만)
    row.append(nw, dock, reset); ft.appendChild(row); $('#panel').appendChild(ft);
    updateDockBtn();
  }
  let openSec = null;
  const close = () => {
    drop.classList.remove('on'); openSec = null;
    document.documentElement.classList.remove('menuOpen');   // 데스크톱: 제목줄 창 끌기 다시 켬
    document.querySelectorAll('.menuBtn.on').forEach((b) => b.classList.remove('on'));
  };
  const openMenu = (sec, btn) => {
    if (openSec === sec) { close(); return; }
    close();
    for (const c of drop.children) c.style.display = (c.dataset && c.dataset.sec === sec) ? '' : 'none';
    // 누른 메뉴 버튼(맨 위 제목줄의 글자 메뉴) 바로 아래에 연다 — 데스크톱 메뉴바처럼 거의 붙여서
    // 제목줄 오른쪽 묶음(설정=렌치)은 버튼 오른쪽 끝에 맞춰 왼쪽으로 펼친다(오른쪽 끝이라 화면 밖으로 나가지 않게)
    const r = btn.getBoundingClientRect(), dw = drop.offsetWidth || 380;   // 대체값 = CSS .menuDrop 폭
    const alignR = !!btn.closest('.tbRight');
    drop.style.left = (alignR ? Math.max(8, Math.min(r.right - dw, window.innerWidth - dw - 8)) : Math.max(8, Math.min(r.left, window.innerWidth - dw - 12))) + 'px';
    drop.style.top = (r.bottom + 6) + 'px';
    drop.classList.toggle('alignR', alignR);
    drop.classList.add('on'); btn.classList.add('on'); openSec = sec;
    // 열려 있는 동안 제목줄 빈 곳(데스크톱=창 끌기 영역)을 눌러도 아래 '바깥 클릭 닫기'가 받게
    document.documentElement.classList.add('menuOpen');
    if (sec === 'cfg') refreshHelperRow();   // 맨 아래 '기능 확장팩' 한 줄을 지금 상태로
  };
  _openMenu = openMenu; _closeMenu = close;   // 투어가 실제 드롭다운을 그대로 열고 닫을 수 있게 노출
  document.querySelectorAll('.menuBtn').forEach((btn) => { btn.onclick = (e) => { e.stopPropagation(); openMenu(btn.dataset.menu, btn); }; });
  document.addEventListener('pointerdown', (e) => { if (drop.classList.contains('on') && !drop.contains(e.target) && !e.target.closest('.menuBtn') && !e.target.closest('.tourUI')) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drop.classList.contains('on')) close(); });
  window.addEventListener('resize', close);
}

// 처음 켰을 때 빈 화면 + 'CG 종류와 지도 종류를 고르세요' 안내. CG 구성 창에서 둘 다 골라 선택 완료하면 사라진다.
let startResDone = false, startStyleDone = false;
function showStartScreen() {
  const ov = $('#startOverlay'); if (!ov) return;
  startResDone = false; startStyleDone = false;
  ov.querySelectorAll('.startStep').forEach((s) => s.classList.remove('done', 'picked'));
  // 직전에 자동저장된 작업이 있으면 '이어보기' 버튼을 보여 준다(빈 화면으로 시작해도 작업을 잃지 않게).
  const rb = $('#startResume');
  if (rb) { let has = false; try { const w = localStorage.getItem(WORK_KEY); has = !!(w && JSON.parse(w).map); } catch (e) {} rb.style.display = has ? '' : 'none'; }
  ov.classList.add('on');
}
function markStartStep(which) {
  const ov = $('#startOverlay'); if (!ov || !ov.classList.contains('on')) return;
  if (which === 'res') startResDone = true;
  if (which === 'style') startStyleDone = true;
  ov.querySelector(`.startStep[data-step="${which}"]`)?.classList.add('done');
  if (startResDone && startStyleDone) {
    // 시작 화면을 마친 빈 지도 = 새로 시작 — '저장 안 한 변경' 기준도 여기서(고른 CG 종류·지도 종류만으로는 끌 때 안 묻는다)
    setTimeout(() => { ov.classList.remove('on'); localStorage.setItem('wcg_started', '1'); localStorage.removeItem('wcg_pending_start'); saveWork(); workMarkClean(); }, 260);
  }
}
function setupStartScreen() {
  const rb = $('#startResume');
  if (rb) rb.onclick = () => { localStorage.removeItem('wcg_pending_start'); const w = loadWork(); if (w) loadProjectData(w, null); };   // 직전 자동저장 작업 이어보기
  // (시작 화면 자동표시는 부팅의 freshOpen이 담당 — 여기선 안 띄운다)
}

function resetLayout() {
  // 창에 든 카드는 전부 먼저 사이드바로 — SEC_ORDER 밖(태풍 카드 등)도 꺼내야 창과 함께 지워지지 않는다
  for (const w of wins) for (const s of w.secs) {
    const n = secNode(s); if (!n) continue;
    if (SEC_ORDER.includes(s)) n.style.display = secModeHidden(s) ? 'none' : ''; else dockSec(s);
  }
  wins = [];
  const panel = $('#panel');
  for (const s of SEC_ORDER) { const n = secNode(s); if (n) panel.append(n); }
  pinPanelFooter();   // 여백·footer(새로 시작)는 항상 맨 아래로 — 안 그러면 섹션 뒤로 밀려 레이아웃이 깨진다
  renderWins();
  status('기본 배치로 되돌렸습니다');
}
