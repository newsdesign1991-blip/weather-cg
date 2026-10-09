/* [모듈] js/date-picker.js — 날짜 고르기(근무표식 아이폰 달력 팝오버 + iOS식 연·월 휠)·시각 직접 입력: 시스템 날짜/시각 칸을 숨기고 우리 칸을 둔다(input.value·change 계약 그대로) */
'use strict';

// ===================== 날짜 고르기 (근무표 nd-cal 달력 + iOS식 연·월 휠) =====================
// 시스템(브라우저 기본) 날짜 칸 대신 근무표 앱의 아이폰식 달력을 쓴다. 원래 <input type="date">는 그대로 두고 숨긴다(.dpSrc) —
// 기존 코드는 하던 대로 input.value(YYYY-MM-DD)를 읽고 쓰고 change를 받는다(고르면 input → change를 보낸다).
// 칸(.dpField)을 누르면 그 아래(자리 없으면 위)에 달력 팝오버. 제목 'YYYY년 M월'을 누르면 달력 자리가 연·월 휠(scroll-snap)로 바뀌어
// 지난 해·달로 빨리 간다(다시 누르면 그 달의 달력). 지난 날짜용이라 오늘 이후는 흐리게·못 고름 — 입력에 min/max가 있으면 그것을 따른다.
//   dpAttach(input, {short})   날짜 칸 붙이기(여러 번 불러도 한 번만, short = 해 빼고 '10. 9 (금)')
//   dpTimeAttach(input, {step}) 시각 칸 — 근무표 ndTime처럼 '시 : 분' 직접 입력(↑↓·휠) + 자주 쓰는 시각 팝오버. step(분)은 input.step(초)에서
//   dpAttachAll(root)           root 안의 type=date·type=time 전부(boot.js가 부팅 때 한 번, 다시 그리는 칸은 그리는 곳에서 — 태풍 비교 카드)
// 아래 순수 도우미(dpMonthCells·dpLimits·dpYearItems …)는 DOM 없이 돈다 — tests/date-picker.test.cjs
const DP_W = '일월화수목금토';
const DP_ITEM = 36;          // 달력 칸·휠 한 줄 높이(px) — css/date-picker.css 와 같은 값
const DP_YEAR_MIN = 1990;    // 휠 연도 시작(입력에 min이 있으면 그 해)
const DP_EASE = 'cubic-bezier(.22,1,.36,1)';
const DP_TIME_PRESETS = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
const dpPad = (n) => String(n).padStart(2, '0');
const dpYmd = (y, m, d) => `${y}-${dpPad(m)}-${dpPad(d)}`;
function dpToday() { const t = new Date(); return dpYmd(t.getFullYear(), t.getMonth() + 1, t.getDate()); }
function dpLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function dpDaysIn(y, m) { return m === 2 ? (dpLeap(y) ? 29 : 28) : [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
// 요일(0 = 일요일) — Date의 두 자리 해(0~99 → 19xx) 함정 없이 계산
function dpDowOf(y, m, d) { const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]; if (m < 3) y -= 1; return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + d) % 7; }
function dpValid(s) { const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return !!p && +p[2] >= 1 && +p[2] <= 12 && +p[3] >= 1 && +p[3] <= dpDaysIn(+p[1], +p[2]); }
const dpYm = (ds) => +ds.slice(0, 4) * 12 + +ds.slice(5, 7) - 1;   // 달 번호(비교용)
const dpYmOf = (y, m) => y * 12 + m - 1;
// 달 칸 배치 — 늘 6줄 × 7칸(42칸). 첫 줄은 1일의 요일 자리부터, 앞뒤 빈 칸은 null(달마다 줄 수가 달라 팝오버가 들썩이지 않게)
function dpMonthCells(y, m) {
  const lead = dpDowOf(y, m, 1), n = dpDaysIn(y, m), out = [];
  for (let i = 0; i < 42; i++) { const d = i - lead + 1; out.push(d >= 1 && d <= n ? { d, ds: dpYmd(y, m, d), dow: i % 7 } : null); }
  return out;
}
// 고를 수 있는 범위 — 입력의 min/max(올바른 날짜일 때)를 따르고, 없으면 1990-01-01 ~ 오늘(지난 날짜용).
// lo~hi = 휠에 늘어놓을 해: 넉넉히 올해+1까지(오늘 이후 해는 흐리게), max가 있으면 그 해까지. 지금 값의 해도 늘 들어간다.
function dpLimits(minAttr, maxAttr, value, today) {
  const min = dpValid(minAttr) ? minAttr : dpYmd(DP_YEAR_MIN, 1, 1);
  let max = dpValid(maxAttr) ? maxAttr : today;
  if (max < min) max = min;
  let lo = +min.slice(0, 4), hi = dpValid(maxAttr) ? +max.slice(0, 4) : +today.slice(0, 4) + 1;
  if (dpValid(value)) { lo = Math.min(lo, +value.slice(0, 4)); hi = Math.max(hi, +value.slice(0, 4)); }
  return { min, max, lo, hi };
}
function dpDayOk(ds, L) { return ds >= L.min && ds <= L.max; }
function dpMonthOk(y, m, L) { const k = dpYmOf(y, m); return k >= dpYm(L.min) && k <= dpYm(L.max); }
function dpClamp(ds, L) { return ds < L.min ? L.min : ds > L.max ? L.max : ds; }
// 휠 목록 — 해·달. dis = 범위 밖(흐리게, 멈추면 가까운 칸으로 돌아감)
function dpYearItems(L) {
  const out = [], a = +L.min.slice(0, 4), b = +L.max.slice(0, 4);
  for (let y = L.lo; y <= L.hi; y++) out.push({ v: y, label: y + '년', dis: y < a || y > b });
  return out;
}
function dpMonthItems(y, L) { const out = []; for (let m = 1; m <= 12; m++) out.push({ v: m, label: m + '월', dis: !dpMonthOk(y, m, L) }); return out; }
// i에서 가장 가까운 고를 수 있는 칸(같은 거리면 앞 = 지난 쪽). 다 막혔으면 i 그대로
function dpNearestOk(items, i) {
  i = Math.max(0, Math.min(items.length - 1, i));
  for (let k = 0; k < items.length; k++) {
    if (items[i - k] && !items[i - k].dis) return i - k;
    if (items[i + k] && !items[i + k].dis) return i + k;
  }
  return i;
}
// 휠 스크롤 위치 → 가운데 줄 번호
function dpWheelIndex(top, n) { return Math.max(0, Math.min(n - 1, Math.round(top / DP_ITEM))); }
// 날짜 더하기 — 일(달·해 넘김), 달(넘친 날은 그달 말일로: 1/31 + 1달 = 2/28)
function dpAddDays(ds, n) { const d = new Date(Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10)) + n * 864e5); return dpYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
function dpAddMonths(ds, n) {
  const k = dpYm(ds) + n, y = Math.floor(k / 12), m = k - y * 12 + 1;
  return dpYmd(y, m, Math.min(+ds.slice(8, 10), dpDaysIn(y, m)));
}
// 칸 글자 '2026. 10. 9 (금)'(short = '10. 9 (금)') · 달력 아래 '10월 9일 (금)'
function dpFmtField(ds, short) { if (!dpValid(ds)) return ''; const y = +ds.slice(0, 4), m = +ds.slice(5, 7), d = +ds.slice(8, 10); return (short ? '' : y + '. ') + m + '. ' + d + ' (' + DP_W[dpDowOf(y, m, d)] + ')'; }
function dpFmtLong(ds) { if (!dpValid(ds)) return ''; const y = +ds.slice(0, 4), m = +ds.slice(5, 7), d = +ds.slice(8, 10); return m + '월 ' + d + '일 (' + DP_W[dpDowOf(y, m, d)] + ')'; }
// 시각 — 두 칸 글자(숫자만) → 'HH:MM'(시 비면 '', 분은 step분 단위로 내림)
function dpTimeNorm(h, mi, step) {
  if (h === '' || isNaN(+h)) return '';
  const hh = Math.min(23, +h), mm = mi === '' || isNaN(+mi) ? 0 : Math.min(59, +mi);
  return dpPad(hh) + ':' + dpPad(Math.floor(mm / step) * step);
}
// ↑↓ 한 번 — 시는 ±1(0↔23 돌기), 분은 step 칸에 맞춰 ±step(0↔마지막 칸 돌기, 시는 그대로 — 근무표 ndTime과 같게)
function dpTimeStep(v, part, dir, step) {
  const p = /^(\d{2}):(\d{2})$/.exec(v || '');
  let h = p ? +p[1] : 9, m = p ? +p[2] : 0;
  if (part === 'h') h = (h + dir + 24) % 24;
  else { const last = Math.floor(59 / step) * step; m = dir > 0 ? (Math.floor(m / step) * step + step > last ? 0 : Math.floor(m / step) * step + step) : (m % step ? Math.floor(m / step) * step : (m - step < 0 ? last : m - step)); }
  return dpPad(h) + ':' + dpPad(m);
}
function dpAmpm(v) {
  const p = /^(\d{2}):(\d{2})$/.exec(v || ''); if (!p) return '';
  const h = +p[1], m = +p[2];
  return (h < 12 ? '오전 ' : '오후 ') + ((h % 12) || 12) + '시' + (m ? ' ' + m + '분' : '');
}

// ---------- 화면 ----------
let _dpNow = null;   // 지금 떠 있는 팝오버 { kind: 'date'|'time', input, field, pop, close… } — 한 번에 하나
const dpCalm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const DP_CAL_SVG = '<svg class="dpFieldIco" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3.2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
const dpChev = (dir) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}"/></svg>`;

// 코드가 input.value = … 로 바꿔도(특보 시각 되돌리기 등) 우리 칸이 따라가게 — 이 input 하나에만 value 접근자를 덧씌운다
// (읽기·쓰기는 원래 그대로). 돌려주는 함수 = 원래 쓰기(칸 갱신 없이)
function dpWatchValue(input, onSet) {
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); onSet(); } });
  return (v) => d.set.call(input, v);
}
// 고른 뒤 기존 리스너(onchange 등)가 받도록 — 시스템 칸에서 고를 때처럼 input → change
function dpFire(input) {
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function dpAttachAll(root) {
  root = root || document;
  root.querySelectorAll('input[type=date]').forEach((n) => dpAttach(n));
  root.querySelectorAll('input[type=time]').forEach((n) => dpTimeAttach(n));
}

// ===== 날짜 칸 =====
function dpAttach(input, o) {
  if (!input || input.type !== 'date') return null;
  if (input._dp) { input._dp.sync(); return input._dp; }
  o = o || {};
  const f = document.createElement('button');
  f.type = 'button'; f.className = 'dpField';
  f.setAttribute('aria-haspopup', 'dialog'); f.setAttribute('aria-expanded', 'false');
  f.innerHTML = '<span class="dpFieldTx"></span>' + DP_CAL_SVG;
  if (input.style.flex) f.style.flex = input.style.flex;   // 줄 배치(style="flex:1")는 칸이 이어받는다
  input.classList.add('dpSrc'); input.tabIndex = -1;
  input.after(f);
  const tx = f.firstChild;
  const sync = () => {
    const v = input.value, ok = dpValid(v);
    // 요일은 따로(칸이 좁으면 css 컨테이너 질의로 요일만 숨긴다 — 날짜가 '…'로 잘리지 않게)
    if (ok) { const s = dpFmtField(v, o.short), k = s.lastIndexOf(' ('); tx.innerHTML = ''; const a = document.createElement('span'), b = document.createElement('span'); a.textContent = s.slice(0, k); b.className = 'dpFtW'; b.textContent = s.slice(k); tx.append(a, b); }
    else tx.textContent = '날짜 선택';
    f.classList.toggle('empty', !ok);
    f.setAttribute('aria-label', ok ? `${+v.slice(0, 4)}년 ${dpFmtLong(v)} — 날짜 바꾸기` : '날짜 고르기');
    f.disabled = input.disabled;
    if (_dpNow && _dpNow.input === input) _dpNow.refresh();
  };
  const setRaw = dpWatchValue(input, sync);
  f.addEventListener('click', () => { if (_dpNow && _dpNow.input === input) dpClose(true); else dpOpenCal(input); });
  // ↓·↑ = 열기(지도 단축키로 새지 않게)
  f.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); e.stopPropagation();
    if (!(_dpNow && _dpNow.input === input)) dpOpenCal(input);
  });
  const api = {
    field: f, opts: o, sync,
    // 고르기 — 같은 날을 다시 고르면 시스템 칸처럼 change를 안 보낸다
    set(v) { if (v === input.value) return false; setRaw(v); sync(); dpFire(input); return true; },
  };
  input._dp = api; sync();
  return api;
}

// 팝오버 자리 — 칸 아래(6px), 아래가 모자라면 위, 둘 다 모자라면 화면 안에 붙인다. 좌우도 화면 안(8px)
function dpPlace(pop, field) {
  const r = field.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight, M = 8, G = 6;
  let top = r.bottom + G, up = false;
  if (top + pr.height > vh - M) {
    if (r.top - G - pr.height >= M) { top = r.top - G - pr.height; up = true; }
    else top = Math.max(M, vh - M - pr.height);
  }
  const left = Math.max(M, Math.min(r.left, vw - M - pr.width));
  pop.style.left = Math.round(left) + 'px'; pop.style.top = Math.round(top) + 'px';
  pop.classList.toggle('up', up);
  return up;
}
// 칸이 아직 보이는가 — 접힌 섹션·사이드바 스크롤 밖으로 나가면 팝오버를 닫는다
function dpFieldVisible(field) {
  if (!field.isConnected) return false;
  const r = field.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const clip = field.closest('#panel, .winbody, .menuDrop');
  const c = clip ? clip.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  return r.bottom > c.top + 2 && r.top < c.bottom - 2;
}
// 팝오버 공통 뼈대 — 몸통에 붙이고(사이드바 밖으로 넘쳐도 보이게 position: fixed) 칸의 배율(사이드바 zoom)을 카드가 따른다.
// 바깥 누르기·Esc·창 크기 바꾸기 = 닫기, 사이드바 스크롤 = 따라가기(칸이 가려지면 닫기). 지도 단축키로 키가 새지 않게 막는다.
function dpPopup(kind, input, field, cls, html, label) {
  dpClose(false);
  const pop = document.createElement('div');
  pop.className = 'dpPop ' + cls;
  if (label) { pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', label); }
  pop.innerHTML = html;
  document.body.append(pop);
  const card = pop.firstElementChild;
  card.style.zoom = String(field.currentCSSZoom || 1);
  const st = { kind, input, field, pop, card, off: [], refresh() {}, onClose: null };
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); st.off.push(() => t.removeEventListener(ev, fn, opt)); };
  on(document, 'pointerdown', (e) => { if (!pop.contains(e.target) && !field.contains(e.target)) dpClose(false); }, true);
  on(window, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    if (st.onEsc) st.onEsc(); else dpClose(true);
  }, true);
  let raf = 0;
  on(window, 'scroll', (e) => {
    if (e.target && e.target.nodeType === 1 && pop.contains(e.target)) return;   // 휠 열 스크롤은 제 것
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (_dpNow !== st) return; if (!dpFieldVisible(field)) dpClose(false); else dpPlace(pop, field); });
  }, true);
  on(window, 'resize', () => dpClose(false));
  // 팝오버 안 누르기·키는 뒤로 안 보낸다 — 제목줄 메뉴 '바깥 누르기 닫기'·사이드바 끌기, 화살표 = 지도 선택 옮기기 같은 단축키
  pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  pop.addEventListener('keydown', (e) => { if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation(); });
  const up = dpPlace(pop, field);
  field.classList.add('on'); field.setAttribute('aria-expanded', 'true');
  if (!dpCalm() && pop.animate) pop.animate([{ opacity: 0, transform: `translateY(${up ? 8 : -8}px) scale(.97)` }, { opacity: 1, transform: 'none' }], { duration: 220, easing: DP_EASE });
  _dpNow = st;
  return st;
}
// 닫기 — back = 포커스를 칸으로 돌려준다(고르기·Esc). 바깥을 눌러 닫을 때는 누른 곳이 포커스를 가져간다
function dpClose(back) {
  const st = _dpNow; if (!st) return;
  _dpNow = null;
  st.off.forEach((fn) => fn());
  if (st.onClose) st.onClose();
  const { pop, field } = st;
  const inside = pop.contains(document.activeElement);
  field.classList.remove('on'); field.setAttribute('aria-expanded', 'false');
  pop.classList.add('closing');
  if (back && (inside || document.activeElement === document.body || document.activeElement === field) && field.isConnected && st.kind === 'date') { try { field.focus({ preventScroll: true }); } catch (e) {} }
  if (dpCalm() || !pop.animate) { pop.remove(); return; }
  pop.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${pop.classList.contains('up') ? 6 : -6}px) scale(.97)` }], { duration: 140, easing: 'ease-in', fill: 'forwards' });
  setTimeout(() => pop.remove(), 150);
}
// 전환 모핑(근무표 ndMorph 결) — 나가는 쪽이 블러·투명·살짝 작게(150ms) → 바꾸기 → 들어오는 쪽이 블러에서 또렷하게(300ms).
// 앞 전환이 진행 중이면 바로 끝내고 새로. 움직임 줄이기면 바로 바꾼다
function dpMorph(st, outEl, inEl, swap) {
  if (st.morph) st.morph();
  if (dpCalm() || !outEl.animate) { swap(); return; }
  const BL = 'blur(8px)';
  const a1 = outEl.animate([{ opacity: 1, filter: 'blur(0)', transform: 'none' }, { opacity: 0, filter: BL, transform: 'scale(.97)' }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
  let done = false;
  const go = () => {
    if (done) return; done = true; clearTimeout(t); st.morph = null;
    try { a1.cancel(); } catch (e) {}
    swap();
    inEl.animate([{ opacity: 0, filter: BL, transform: 'scale(.96)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], { duration: 300, easing: DP_EASE, fill: 'backwards' });
  };
  const t = setTimeout(go, 150);
  st.morph = go;
}

// ===== 달력 팝오버 =====
function dpOpenCal(input) {
  const api = input._dp; if (!api || api.field.disabled) return;
  const f = api.field;
  const L0 = () => dpLimits(input.min, input.max, input.value, dpToday());
  let L = L0();
  const v0 = input.value, base = dpValid(v0) ? v0 : dpClamp(dpToday(), L);
  const week = DP_W.split('').map((w, i) => `<span${i === 0 ? ' class="sun"' : i === 6 ? ' class="sat"' : ''}>${w}</span>`).join('');
  const st = dpPopup('date', input, f, 'dpCalPop',
    '<div class="dpCard" tabindex="-1">'
    + '<div class="dpHead"><button type="button" class="dpTitle" aria-expanded="false" title="연·월 고르기"><span class="dpTitleTx"></span>'
    + '<svg class="dpTitleChev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
    + `<div class="dpNav"><button type="button" class="dpPrev" aria-label="이전 달">${dpChev(-1)}</button><button type="button" class="dpNext" aria-label="다음 달">${dpChev(1)}</button></div></div>`
    + `<div class="dpBody"><div class="dpCal"><div class="dpWeek" aria-hidden="true">${week}</div><div class="dpGrid" role="group"></div></div>`
    + '<div class="dpWheel" hidden><div class="dpBand" aria-hidden="true"></div><div class="dpCol" data-k="y" tabindex="0" role="listbox" aria-label="연도"></div><div class="dpCol" data-k="m" tabindex="0" role="listbox" aria-label="월"></div></div></div>'
    + '<div class="dpFoot"><span class="dpSel"></span><button type="button" class="dpTodayBtn">오늘</button></div>'
    + '</div>', '날짜 고르기');
  const { pop, card } = st, q = (s) => pop.querySelector(s);
  const title = q('.dpTitle'), titleTx = q('.dpTitleTx'), prev = q('.dpPrev'), next = q('.dpNext'), grid = q('.dpGrid');
  const calEl = q('.dpCal'), whEl = q('.dpWheel'), sel = q('.dpSel'), todayBtn = q('.dpTodayBtn');
  st.y = +base.slice(0, 4); st.m = +base.slice(5, 7); st.wheel = false;
  const setTitle = () => { titleTx.textContent = `${st.y}년 ${st.m}월`; };
  // 달력 그리기 — fk = 그린 뒤 포커스('d:YYYY-MM-DD' | 'prev' | 'next'), slide = 달 넘김 방향(살짝 밀려 들어옴)
  const renderCal = (fk, slide) => {
    L = L0();
    const cur = input.value, t = dpToday(), ym = dpYmOf(st.y, st.m);
    setTitle();
    prev.disabled = ym <= dpYm(L.min); next.disabled = ym >= dpYm(L.max);
    const cells = dpMonthCells(st.y, st.m);
    const mine = (ds) => dpValid(ds) && dpYm(ds) === ym && dpDayOk(ds, L);
    const tab = mine(cur) ? cur : mine(t) ? t : ((cells.find((c) => c && dpDayOk(c.ds, L)) || {}).ds || '');
    grid.setAttribute('aria-label', `${st.y}년 ${st.m}월`);
    grid.innerHTML = cells.map((c) => {
      if (!c) return '<span></span>';
      const ok = dpDayOk(c.ds, L), on = c.ds === cur;
      return `<button type="button" class="dpDay${c.dow === 0 ? ' sun' : c.dow === 6 ? ' sat' : ''}${c.ds === t ? ' is-today' : ''}${on ? ' is-sel' : ''}" data-d="${c.ds}" tabindex="${c.ds === tab ? 0 : -1}"`
        + `${ok ? '' : ' disabled'} aria-pressed="${on}" aria-label="${st.m}월 ${c.d}일 ${DP_W[c.dow]}요일${c.ds === t ? ', 오늘' : ''}">${c.d}</button>`;
    }).join('');
    sel.textContent = dpValid(cur) ? dpFmtLong(cur) : '날짜를 골라 주세요';
    sel.classList.toggle('empty', !dpValid(cur));
    todayBtn.disabled = !dpDayOk(t, L);
    if (slide && !dpCalm() && grid.animate) grid.animate([{ opacity: 0, transform: `translateX(${slide * 14}px)` }, { opacity: 1, transform: 'none' }], { duration: 240, easing: DP_EASE });
    if (fk) {
      let el = fk.startsWith('d:') ? grid.querySelector(`[data-d="${fk.slice(2)}"]`) : fk === 'prev' ? prev : fk === 'next' ? next : null;
      if (!el || el.disabled) el = grid.querySelector('.dpDay[tabindex="0"]');
      if (el) try { el.focus({ preventScroll: true }); } catch (e) {}
    }
  };
  const nav = (dm, fk) => {
    const k = dpYmOf(st.y, st.m) + dm;
    if (k < dpYm(L.min) || k > dpYm(L.max)) return;
    st.y = Math.floor(k / 12); st.m = k - st.y * 12 + 1;
    renderCal(fk, dm);
  };
  // 고르기 — 값을 넣고(기존 리스너가 change로 받음) 고른 칸을 잠깐 보여 준 뒤 닫는다
  const pick = (ds) => {
    if (!dpValid(ds) || !dpDayOk(ds, L)) return;
    api.set(ds);
    st.y = +ds.slice(0, 4); st.m = +ds.slice(5, 7);
    renderCal();
    setTimeout(() => { if (_dpNow === st) dpClose(true); }, dpCalm() ? 0 : 130);
  };
  st.refresh = () => { if (!st.wheel) renderCal(); };

  // ----- 연·월 휠 -----
  // 열 요소는 열 때마다 새로(앞 휠의 리스너가 남지 않게)
  const freshCol = (k) => { const old = q(`.dpCol[data-k="${k}"]`), n = old.cloneNode(false); old.replaceWith(n); return n; };
  const buildWheel = () => {
    L = L0();
    const ys = dpYearItems(L);
    let yi = ys.findIndex((it) => it.v === st.y); if (yi < 0) yi = ys.length - 1;
    st.colY = dpWheel(freshCol('y'), ys, yi, (y) => {
      st.y = y; setTitle();
      st.colM.setItems(dpMonthItems(st.y, L));   // 해가 바뀌면 고를 수 없는 달(오늘 이후)도 바뀐다 — 지금 달이 막히면 가까운 달로
    });
    st.y = ys[st.colY.idx].v;   // 지금 해가 흐린 칸이었으면 휠이 고른 가까운 해로
    st.colM = dpWheel(freshCol('m'), dpMonthItems(st.y, L), st.m - 1, (m) => { st.m = m; setTitle(); });
    st.m = st.colM.idx + 1; setTitle();
  };
  const toggleWheel = (want) => {
    if (want === st.wheel) return;
    st.wheel = want;
    card.classList.toggle('wheelOn', want);
    title.setAttribute('aria-expanded', String(want));
    title.title = want ? '이 달의 달력으로' : '연·월 고르기';
    dpMorph(st, want ? calEl : whEl, want ? whEl : calEl, () => {
      calEl.hidden = want; whEl.hidden = !want;
      if (want) buildWheel();
      else { if (st.colY) st.colY.stop(); if (st.colM) st.colM.stop(); renderCal(); }
    });
  };
  st.onEsc = () => dpClose(true);
  st.onClose = () => { if (st.morph) st.morph(); if (st.colY) st.colY.stop(); if (st.colM) st.colM.stop(); };

  title.addEventListener('click', () => toggleWheel(!st.wheel));
  prev.addEventListener('click', () => nav(-1, document.activeElement === prev ? 'prev' : ''));
  next.addEventListener('click', () => nav(1, document.activeElement === next ? 'next' : ''));
  todayBtn.addEventListener('click', () => pick(dpToday()));
  grid.addEventListener('click', (e) => { const b = e.target.closest('.dpDay'); if (b && !b.disabled) pick(b.dataset.d); });
  // 날짜 위 키: ←→↑↓(하루·한 주) / PageUp·PageDown(한 달, Shift = 한 해) / Home·End(주 처음·끝) / Enter·Space = 고르기(버튼 기본)
  grid.addEventListener('keydown', (e) => {
    const b = e.target.closest && e.target.closest('.dpDay'); if (!b) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    let s = b.dataset.d;
    if (step) s = dpAddDays(s, step);
    else if (e.key === 'PageUp' || e.key === 'PageDown') s = dpAddMonths(s, (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1));
    else if (e.key === 'Home' || e.key === 'End') { const w = dpDowOf(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10)); s = dpAddDays(s, e.key === 'Home' ? -w : 6 - w); }
    else return;
    e.preventDefault();
    s = dpClamp(s, L);   // 고를 수 없는 날 너머로는 그 끝날에 멈춤
    if (dpYm(s) !== dpYmOf(st.y, st.m)) { const dir = Math.sign(dpYm(s) - dpYmOf(st.y, st.m)); st.y = +s.slice(0, 4); st.m = +s.slice(5, 7); renderCal('d:' + s, dir); }
    const el = grid.querySelector(`[data-d="${s}"]`);
    if (el) { grid.querySelectorAll('.dpDay[tabindex="0"]').forEach((x) => { x.tabIndex = -1; }); el.tabIndex = 0; try { el.focus({ preventScroll: true }); } catch (err) {} }
  });
  // 휠에서 Enter = 그 연·월의 달력으로. Tab은 카드 안에서만 돈다(팝업 공통 popTrapTab)
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { popTrapTab(card, e); return; }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('dpCol')) { e.preventDefault(); toggleWheel(false); try { title.focus({ preventScroll: true }); } catch (err) {} }
  });
  renderCal('d:' + (dpValid(v0) ? v0 : ''));
  if (!pop.contains(document.activeElement)) try { card.focus({ preventScroll: true }); } catch (e) {}
  return st;
}

// ===== iOS식 휠 한 열 =====
// 줄 높이 DP_ITEM, 위아래에 반 칸 남짓 빈 줄을 둬서 첫·끝 칸도 가운데에 온다. scroll-snap(가운데 정렬)으로 딱 멈춘다.
// 움직이기: 마우스 휠(한 칸 = 한 줄, 터치패드는 모아서) · 끌기(놓을 때 살짝 굴러감) · 줄 누르기 · ↑↓/PageUp·PageDown/Home·End.
// 고른 줄(idx)은 움직이자마자 정한다 — 부드러운 스크롤은 보이는 것만(창이 그림을 안 그려도 값은 맞다). 손으로 굴려 멈추면(scrollend) 그 줄로.
// 흐린 줄(범위 밖)에 멈추면 가까운 줄로 돌아간다. 보이는 3D 굴곡(살짝 눕고 흐려짐)은 스크롤마다 다시 칠한다.
function dpWheel(el, items, idx, onPick) {
  const W = { items, idx: -1, acc: 0, drag: null, anim: false, tries: 0, raf: 0, t: 0, live: true };
  const zoom = () => el.currentCSSZoom || 1;
  const k = el.dataset.k;
  const render = () => {
    el.innerHTML = '<div class="dpPadRow"></div>' + W.items.map((it, i) => `<div class="dpItem${it.dis ? ' dis' : ''}" role="option" id="dp-${k}-${i}" data-i="${i}" aria-disabled="${it.dis}">${it.label}</div>`).join('') + '<div class="dpPadRow"></div>';
  };
  const paint = () => {
    W.raf = 0;
    const c = el.scrollTop / DP_ITEM;
    el.querySelectorAll('.dpItem').forEach((it, i) => {
      const d = i - c, a = Math.min(Math.abs(d), 4);
      it.style.opacity = String(+(Math.max(0.18, 1 - a * 0.25) * (W.items[i].dis ? 0.45 : 1)).toFixed(3));
      it.style.transform = `perspective(240px) rotateX(${Math.max(-68, Math.min(68, -d * 21)).toFixed(1)}deg)`;
      const on = i === W.idx;
      it.classList.toggle('on', on); it.setAttribute('aria-selected', String(on));
    });
    if (W.idx >= 0) el.setAttribute('aria-activedescendant', `dp-${k}-${W.idx}`);
  };
  const sched = () => { if (!W.raf) W.raf = requestAnimationFrame(paint); };
  // 우리가 굴리는 맞춤 스크롤(W.anim) — 휠·키·누르기·끌기 놓기. 고른 줄은 이미 정해졌고 스크롤은 보이는 것뿐
  const go = (i, how) => {
    if (!W.live) return;
    i = dpNearestOk(W.items, Math.max(0, Math.min(W.items.length - 1, i)));
    const changed = i !== W.idx;
    W.idx = i; W.tries = 0;
    const top = i * DP_ITEM;
    clearTimeout(W.t);
    if (Math.abs(el.scrollTop - top) > 0.5) {
      W.anim = true; el.scrollTo({ top, behavior: how === 'smooth' && !dpCalm() ? 'smooth' : 'auto' });
      // 안전망 — 부드러운 스크롤이 끝내 안 오면(창이 그림을 안 그리는 동안 등) 바로 그 줄에 맞춘다
      W.t = setTimeout(() => { if (W.live && W.anim && !W.drag && Math.abs(el.scrollTop - W.idx * DP_ITEM) > 0.5) { el.scrollTo({ top: W.idx * DP_ITEM, behavior: 'auto' }); paint(); } }, 900);
    } else { W.anim = false; el.classList.remove('drag'); }
    paint();
    if (changed) onPick(W.items[i].v);
  };
  // 스크롤이 멈췄을 때(scrollend):
  //  - 맞춤 스크롤 중이었는데 목표 밖에서 멈춤 = 다음 맞춤에 끊겼거나 창이 그림을 안 그림 → 고른 줄은 그대로 두고 다시 맞춘다(두 번 넘으면 바로)
  //  - 손으로 굴려(터치) 멈춤 = 가운데 줄을 고른다(흐린 줄이면 가까운 줄로)
  const settle = () => {
    if (!W.live || W.drag) return;
    const top = W.idx * DP_ITEM;
    if (W.anim) {
      if (Math.abs(el.scrollTop - top) > 0.5) { W.tries++; el.scrollTo({ top, behavior: W.tries > 2 || dpCalm() ? 'auto' : 'smooth' }); return; }
      W.anim = false; el.classList.remove('drag'); return;
    }
    el.classList.remove('drag');
    const i = dpWheelIndex(el.scrollTop, W.items.length);
    if (i !== W.idx || (W.items[i] && W.items[i].dis)) go(i, 'smooth');
    else if (Math.abs(el.scrollTop - top) > 0.5) go(i, 'smooth');
  };
  el.addEventListener('scroll', () => { if (W.anim && Math.abs(el.scrollTop - W.idx * DP_ITEM) <= 0.5) { W.anim = false; el.classList.remove('drag'); } sched(); }, { passive: true });
  el.addEventListener('scrollend', settle);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    let n;
    if (Math.abs(dy) >= 50) { n = Math.sign(dy) * Math.max(1, Math.min(4, Math.round(Math.abs(dy) / 100))); W.acc = 0; }   // 마우스 휠 한 칸 = 한 줄
    else { W.acc += dy; n = Math.trunc(W.acc / DP_ITEM); W.acc -= n * DP_ITEM; }                                          // 터치패드 — 조금씩 모아서
    if (n) go(W.idx + n, 'smooth');
  }, { passive: false });
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') { W.anim = false; return; }   // 터치는 원래 스크롤(scroll-snap)로 — 멈춘 자리를 고른다
    if (e.button !== 0) return;
    e.preventDefault();
    try { el.focus({ preventScroll: true }); } catch (err) {}
    W.anim = false;   // 손이 잡았다 — 굴러가던 맞춤은 손에 넘긴다
    W.drag = { id: e.pointerId, y0: e.clientY, top0: el.scrollTop, moved: false, hist: [[e.timeStamp, e.clientY]], it: e.target.closest('.dpItem') };
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
  });
  el.addEventListener('pointermove', (e) => {
    const D = W.drag; if (!D || e.pointerId !== D.id) return;
    const dy = e.clientY - D.y0;
    if (!D.moved && Math.abs(dy) > 3) { D.moved = true; el.classList.add('drag'); }   // 끄는 동안은 scroll-snap을 끈다(손을 따라 매끈하게)
    if (!D.moved) return;
    el.scrollTop = D.top0 - dy / zoom();
    D.hist.push([e.timeStamp, e.clientY]); if (D.hist.length > 6) D.hist.shift();
  });
  const up = (e) => {
    const D = W.drag; if (!D || e.pointerId !== D.id) return;
    W.drag = null;
    if (!D.moved) { if (D.it) go(+D.it.dataset.i, 'smooth'); return; }   // 누르기 = 그 줄로
    const a = D.hist[0], b = D.hist[D.hist.length - 1], v = (b[1] - a[1]) / Math.max(1, b[0] - a[0]);   // 화면 px/ms
    const fling = e.timeStamp - b[0] < 80 ? v * 180 : 0;   // 놓기 직전까지 움직였으면 조금 더 굴러감
    go(dpWheelIndex(el.scrollTop - fling / zoom(), W.items.length), 'smooth');
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('keydown', (e) => {
    const s = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
    if (s) { e.preventDefault(); go(W.idx + s, 'smooth'); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); go(e.key === 'Home' ? 0 : W.items.length - 1, 'smooth'); }
  });
  render();
  W.idx = dpNearestOk(W.items, idx);
  el.scrollTop = W.idx * DP_ITEM;
  paint();
  return {
    get idx() { return W.idx; },
    go,
    // 목록 바꾸기(해가 바뀌어 고를 수 있는 달이 달라짐) — 같은 자리를 지키고, 막혔으면 가까운 줄로
    setItems(list) { W.items = list; render(); paint(); if (W.items[W.idx] && W.items[W.idx].dis) go(W.idx, 'smooth'); },
    stop() { W.live = false; clearTimeout(W.t); if (W.raf) cancelAnimationFrame(W.raf); },
  };
}

// ===== 시각 칸 — 근무표 ndTime처럼 '시 : 분' 두 칸 직접 입력 =====
// 숫자를 치면 시 → 분으로 넘어가고(3~9시는 한 자리로 바로), ↑↓(또는 칸에 포커스가 있을 때 마우스 휠)로 시 ±1 · 분 ±step.
// 분은 step분 단위(특보 = 10분)로 내린다. 칸에 들어가면 아래에 자주 쓰는 시각 팝오버(오전/오후 읽기 + 알약). 값 계약 HH:MM 그대로.
// change는 시각이 다 정해졌을 때만 보낸다(분 두 자리·Enter·칸 나가기·알약, ↑↓는 멈춘 뒤 0.5초) — 특보는 바뀔 때마다 다시 불러오므로.
function dpTimeAttach(input, o) {
  if (!input || input.type !== 'time') return null;
  if (input._dpt) { input._dpt.sync(); return input._dpt; }
  o = o || {};
  const step = Math.max(1, Math.round(o.step || (+input.step >= 60 ? +input.step / 60 : 1)));
  const box = document.createElement('span');
  box.className = 'dpTime'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', '시각 (시 : 분)');
  box.innerHTML = '<input class="dpTH" inputmode="numeric" maxlength="2" placeholder="--" autocomplete="off" spellcheck="false" aria-label="시(0~23)">'
    + '<span class="dpTColon" aria-hidden="true">:</span>'
    + `<input class="dpTM" inputmode="numeric" maxlength="2" placeholder="--" autocomplete="off" spellcheck="false" aria-label="분(0~59, ${step}분 단위)">`;
  input.classList.add('dpSrc'); input.tabIndex = -1;
  input.after(box);
  const H = box.querySelector('.dpTH'), M = box.querySelector('.dpTM');
  const typed = () => dpTimeNorm(H.value.replace(/\D/g, ''), M.value.replace(/\D/g, ''), step);
  let t = 0, dirty = false;   // dirty = 사람이 고쳤다(그냥 들어갔다 나가면 값을 안 건드린다 — 10분 단위가 아닌 옛 시각도 그대로)
  const show = (v) => {
    const p = /^(\d{2}):(\d{2})/.exec(v || '');
    H.value = p ? p[1] : ''; M.value = p ? p[2] : '';
    box.classList.toggle('empty', !p);
    dirty = false;
    if (_dpNow && _dpNow.input === input) _dpNow.refresh();
  };
  const sync = () => { if (!box.contains(document.activeElement)) show(input.value); else if (_dpNow && _dpNow.input === input) _dpNow.refresh(); };
  const setRaw = dpWatchValue(input, sync);
  const commit = (final) => {
    clearTimeout(t);
    if (!dirty) { if (final) show(input.value); return; }
    const v = typed();
    if (v && v !== input.value) { setRaw(v); dpFire(input); }
    if (final || v) show(v || input.value);   // 시를 비웠으면 원래 값으로(빈 시각은 받지 않는다)
  };
  const later = () => { clearTimeout(t); t = setTimeout(() => commit(false), 500); };
  const onIn = (el, max, nextEl) => {
    let s = el.value.replace(/\D/g, '').slice(0, 2);
    if (s.length === 1 && +s > max) s = '0' + s;   // 시 3~9 / 분 6~9 → 한 자리면 바로 두 자리로
    if (s.length === 2 && +s > (el === H ? 23 : 59)) s = el === H ? '23' : '59';
    el.value = s; dirty = true;
    if (_dpNow && _dpNow.input === input) _dpNow.refresh();
    if (s.length === 2) {
      if (nextEl) { nextEl.focus(); nextEl.select(); }
      else { commit(true); M.select(); }   // 분까지 다 치면 바로 정한다(분은 step 단위로)
    }
  };
  H.addEventListener('input', () => onIn(H, 2, M));
  M.addEventListener('input', () => onIn(M, 5, null));
  const bump = (el, dir) => {
    const nv = dpTimeStep(typed() || input.value, el === H ? 'h' : 'm', dir, step);
    H.value = nv.slice(0, 2); M.value = nv.slice(3, 5); box.classList.remove('empty'); dirty = true;
    if (_dpNow && _dpNow.input === input) _dpNow.refresh();
    el.select(); later();
  };
  [H, M].forEach((el) => {
    el.addEventListener('focus', () => setTimeout(() => { try { el.select(); } catch (e) {} }, 0));
    el.addEventListener('keydown', (e) => {
      if (e.isComposing || e.key === 'Process') return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bump(el, e.key === 'ArrowUp' ? 1 : -1); return; }
      if (el === H && (e.key === ':' || e.key === '.' || e.key === ' ')) { e.preventDefault(); M.focus(); return; }
      if (el === M && e.key === 'Backspace' && M.value === '') { e.preventDefault(); H.focus(); return; }
      if (el === M && e.key === 'ArrowLeft' && M.selectionStart === 0 && M.selectionEnd === 0) { e.preventDefault(); H.focus(); return; }
      if (el === H && e.key === 'ArrowRight' && H.selectionStart === H.value.length) { e.preventDefault(); M.focus(); return; }
      if (e.key === 'Enter') { e.preventDefault(); commit(true); el.select(); }
    });
    // 칸에 포커스가 있을 때만 휠로 조절(사이드바 스크롤을 빼앗지 않게)
    el.addEventListener('wheel', (e) => { if (document.activeElement !== el) return; e.preventDefault(); bump(el, e.deltaY < 0 ? 1 : -1); }, { passive: false });
  });
  // 칸 빈 곳·콜론을 누르면 시(비었으면)나 분으로
  box.addEventListener('mousedown', (e) => { if (e.target === box || e.target.classList.contains('dpTColon')) { e.preventDefault(); (H.value === '' ? H : M).focus(); } });
  box.addEventListener('focusin', () => { box.classList.add('on'); if (!(_dpNow && _dpNow.input === input)) dpOpenTime(input); });
  box.addEventListener('focusout', (e) => {
    if (box.contains(e.relatedTarget)) return;
    box.classList.remove('on');
    commit(true);
    if (_dpNow && _dpNow.input === input) dpClose(false);
  });
  const api = {
    box, step, sync,
    typed: () => typed(),
    set(v) { clearTimeout(t); show(v); if (v !== input.value) { setRaw(v); dpFire(input); } },
    revert() { clearTimeout(t); show(input.value); },
  };
  input._dpt = api; show(input.value);
  return api;
}
// 자주 쓰는 시각 팝오버 — 칸 아래에 '오전 9시' 읽기 + 알약. 알약은 누르기만(포커스는 칸에 그대로 — mousedown 막음)
function dpOpenTime(input) {
  const api = input._dpt; if (!api) return;
  const st = dpPopup('time', input, api.box, 'dpTimePop',
    '<div class="dpCard dpTCard"><div class="dpTHead"><b class="dpTAmpm"></b>'
    + `<span class="dpTHint">↑↓ 키·휠 = 시 1 · 분 ${api.step}</span></div>`
    + '<div class="dpTChips" role="group" aria-label="자주 쓰는 시각">'
    + DP_TIME_PRESETS.map((p) => `<button type="button" class="dpTChip" tabindex="-1" data-t="${p}" aria-pressed="false">${p}</button>`).join('')
    + '</div></div>', '');
  const { pop } = st;
  st.refresh = () => {
    const v = api.typed() || input.value;
    const a = pop.querySelector('.dpTAmpm'); a.textContent = dpAmpm(v) || '시각을 입력하세요';
    pop.querySelectorAll('.dpTChip').forEach((c) => { const on = c.dataset.t === v; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); });
  };
  st.onEsc = () => { api.revert(); dpClose(false); };   // Esc = 치던 것 버리고 원래 시각, 칸은 그대로
  pop.addEventListener('mousedown', (e) => e.preventDefault());
  pop.addEventListener('click', (e) => { const c = e.target.closest('.dpTChip'); if (c) { api.set(c.dataset.t); st.refresh(); } });
  st.refresh();
  return st;
}
