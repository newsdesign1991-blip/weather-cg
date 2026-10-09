/* [모듈] js/dropdown.js — 드롭다운(공용 부품): 시스템 <select>를 숨기고 버튼형 칸 + 토스 카드 목록 팝오버를 둔다(select.value·change 계약 그대로) */
'use strict';

// ===================== 드롭다운 (시스템 select 대신 토스 카드 목록) =====================
// 원래 <select>는 그대로 두고 숨긴다(.ddSrc) — 옵션·값의 원천이다. 기존 코드는 하던 대로 select.value를 읽고 쓰고, innerHTML·append로
// 옵션을 다시 채우고, change를 받는다(고르면 select에 input → change를 보낸다). 옆에 버튼형 칸(.ddField — 고른 항목 글자 + 아래 꺾쇠)을 둔다.
// 칸이 따라가는 것: 코드가 select.value·selectedIndex를 바꿀 때(이 select 하나에만 접근자를 덧씌움), 옵션이 바뀔 때(MutationObserver —
// 추가·삭제·글자·disabled·hidden·optgroup), select의 disabled·hidden·style.display·title.
// 칸을 누르면 바로 아래(자리 없으면 위)에 토스 카드 목록 — position: fixed라 사이드바·팝업 밖으로 넘쳐도 보이고, 카드가 칸의 배율
// (사이드바·떼어낸 창 zoom)을 따른다. 고른 항목 = 파란 글자 + 체크, 올리면 옅은 바탕, 긴 목록은 앱 스크롤바, 열 때 고른 항목이 가운데.
// 키(칸에 포커스): Enter·Space·↓·↑ = 열기, 글자 = 열고 찾기 / 열린 동안: ↑↓·Home·End·PageUp·PageDown = 옮기기, Enter·Space = 고르기,
// Esc = 닫기(값 그대로), Tab = 닫고 다음 칸으로, 글자 = 그 글자로 시작하는 항목(같은 글자를 거듭 치면 차례로, 이어 치면 낱말로).
// 바깥 누르기 = 닫기. 포커스는 칸에 둔 채(aria-activedescendant) — 열린 동안 키는 창 캡처 단계에서 먼저 받아 지도 단축키로 새지 않는다.
//   ddAttach(select)   칸 붙이기(여러 번 불러도 한 번만 — 두 번째부터는 다시 맞추기만)
//   ddAttachAll(root)  root 안의 select 전부(boot.js가 부팅 때 한 번 + 관찰자로 나중에 생긴 칸, 태풍 비교 카드는 wireCompareCard에서)
//   ddClose(back)      떠 있는 목록 닫기(back = 포커스를 칸으로)        _ddNow = 떠 있는 목록(없으면 null)
// 아래 순수 도우미(ddLabel·ddItems·ddStep·ddFind·ddPlace)는 DOM 없이 돈다 — tests/dropdown.test.cjs
const DD_ROW = 34;        // 목록 한 줄 높이(카드 px) — css/dropdown.css .ddOpt min-height와 같은 값(PageUp/Down 칸 수)
const DD_MAX_H = 312;     // 목록 최대 높이(카드 px) — 약 9줄, 넘치면 스크롤
const DD_MAX_W = 420;     // 카드 최대 폭(카드 px) — 넘치는 항목 글자는 '…'
const DD_EASE = 'cubic-bezier(.22,1,.36,1)';
const DD_CHEV = '<svg class="ddChev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DD_CHECK = '<svg class="ddCheck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2L18.5 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let _ddNow = null;   // 지금 떠 있는 목록 { sel, field, pop, list, items, act, … } — 한 번에 하나
let _ddSeq = 0;      // 칸마다 id(목록·항목 aria 연결)

// 항목 글자 — label 속성이 있으면 그것(브라우저 option.label과 같게), 공백은 한 칸으로
function ddLabel(o) { return String((o && (o.label || o.textContent)) || '').replace(/\s+/g, ' ').trim(); }
// 목록 줄 — select의 자식(option·optgroup)을 차례로: { kind: 'grp', label, dis } / { kind: 'opt', i(= options 번호), label, value, dis, on, inGrp, font }.
// 막힌 optgroup 안 옵션은 막힘, hidden 옵션은 줄을 안 만든다(번호는 그대로 센다 — select.options 순서와 같게)
function ddItems(sel) {
  const out = [], cur = sel.selectedIndex;
  let i = 0;
  const tag = (n) => String((n && n.tagName) || '').toUpperCase();
  const opt = (o, g) => {
    const k = i++;
    if (o.hidden) return;
    out.push({ kind: 'opt', i: k, label: ddLabel(o), value: String(o.value == null ? '' : o.value), dis: !!(o.disabled || (g && g.disabled)), on: k === cur, inGrp: !!g, font: (o.style && o.style.fontFamily) || '' });
  };
  for (const c of Array.from(sel.children || [])) {
    if (tag(c) === 'OPTION') opt(c, null);
    else if (tag(c) === 'OPTGROUP') {
      out.push({ kind: 'grp', label: String(c.label || '').replace(/\s+/g, ' ').trim(), dis: !!c.disabled });
      for (const o of Array.from(c.children || [])) if (tag(o) === 'OPTION') opt(o, c);
    }
  }
  return out;
}
const ddOk = (it) => !!it && it.kind === 'opt' && !it.dis;
// 옮길 줄 — from(줄 번호, -1 = 없음)에서 dir(+1·−1) 쪽으로 n칸(막힌 줄·묶음 제목은 건너뜀, 끝에서 멈춤 — 돌지 않음).
// dir = 'first' | 'last' = 처음·끝 고를 수 있는 줄. 고를 수 있는 줄이 없으면 -1
function ddStep(items, from, dir, n) {
  const idx = [];
  items.forEach((it, k) => { if (ddOk(it)) idx.push(k); });
  if (!idx.length) return -1;
  if (dir === 'first') return idx[0];
  if (dir === 'last') return idx[idx.length - 1];
  const p = idx.indexOf(from);
  if (p < 0) {   // 지금 줄이 없거나 막힌 줄 — 그쪽으로 가장 가까운 줄(한 칸으로 친다)
    if (from < 0) return dir > 0 ? idx[0] : idx[idx.length - 1];
    const nx = dir > 0 ? idx.find((k) => k > from) : idx.slice().reverse().find((k) => k < from);
    return nx == null ? (dir > 0 ? idx[idx.length - 1] : idx[0]) : nx;
  }
  return idx[Math.max(0, Math.min(idx.length - 1, p + dir * (n || 1)))];
}
// 글자로 찾기 — buf로 시작하는 고를 수 있는 줄(대소문자 무시). 한 글자면 from 다음 줄부터(같은 글자를 거듭 치면 그 글자로 시작하는 줄을 차례로),
// 이어 친 낱말이면 from 자신부터. 시작이 같은 줄이 없으면 그 글자를 품은 줄. 없으면 -1
function ddFind(items, buf, from) {
  const s = String(buf || '').toLowerCase();
  if (!s || !items.length) return -1;
  const same = [...s].every((ch) => ch === s[0]);
  const q = same ? s[0] : s, n = items.length;
  const start = same ? from + 1 : Math.max(0, from);
  for (const hit of [(l) => l.startsWith(q), (l) => l.includes(q)]) {
    for (let k = 0; k < n; k++) {
      const j = (((start + k) % n) + n) % n, it = items[j];
      if (ddOk(it) && hit(it.label.toLowerCase())) return j;
    }
  }
  return -1;
}
// 목록 자리 — 칸 바로 아래(4px), 아래가 모자라면 위, 둘 다 모자라면 넓은 쪽에 그 높이까지만(cap > 0 — 목록을 그만큼 줄여 스크롤).
// 가로는 칸 왼쪽에 맞추고 화면 안(8px). fr = 칸 rect(화면 px), pw·ph = 팝오버 크기(화면 px), vw·vh = 창 크기
function ddPlace(fr, pw, ph, vw, vh) {
  const M = 8, G = 4;
  const below = vh - M - (fr.bottom + G), above = fr.top - G - M;
  const left = Math.max(M, Math.min(fr.left, vw - M - pw));
  if (ph <= below) return { side: 'down', left, top: fr.bottom + G, cap: 0 };
  if (ph <= above) return { side: 'up', left, top: fr.top - G - ph, cap: 0 };
  if (below >= above) return { side: 'down', left, top: fr.bottom + G, cap: Math.max(0, below) };
  return { side: 'up', left, top: M, cap: Math.max(0, above) };
}

// ---------- 화면 ----------
const ddCalm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
// 코드가 select.value = … / selectedIndex = … 로 바꿔도 칸이 따라가게 — 이 select 하나에만 접근자를 덧씌운다(읽기·쓰기는 원래 그대로).
// 돌려주는 함수 = 원래 selectedIndex 쓰기(칸 알림 없이 — 목록에서 고를 때)
function ddWatchValue(sel, onSet) {
  const P = HTMLSelectElement.prototype;
  const dv = Object.getOwnPropertyDescriptor(P, 'value'), di = Object.getOwnPropertyDescriptor(P, 'selectedIndex');
  Object.defineProperty(sel, 'value', { configurable: true, get() { return dv.get.call(this); }, set(v) { dv.set.call(this, v); onSet(); } });
  Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return di.get.call(this); }, set(v) { di.set.call(this, v); onSet(); } });
  return (i) => di.set.call(sel, i);
}
// 칸 이름(화면 읽기용) — aria-label, 연결된 label의 제 글자(안에 든 칸 글자는 빼고), 바로 앞 label, title 차례
function ddNameOf(sel) {
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  if (sel.getAttribute('aria-label')) return clean(sel.getAttribute('aria-label'));
  const L = sel.labels && sel.labels[0];
  if (L) { const t = clean(Array.from(L.childNodes).filter((c) => c.nodeType === 3).map((c) => c.textContent).join(' ')); if (t) return t; }
  const p = sel.previousElementSibling;
  if (p && p.tagName === 'LABEL' && clean(p.textContent)) return clean(p.textContent);
  return clean(sel.title);
}
// 칸이 아직 보이는가 — 접힌 섹션·사이드바·떼어낸 창 스크롤 밖으로 나가면 목록을 닫는다
function ddFieldVisible(field) {
  if (!field.isConnected) return false;
  const r = field.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const clip = field.closest('#panel, .winbody, .menuDrop, .tossBody, .cgsBody');
  const c = clip ? clip.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  return r.bottom > c.top + 2 && r.top < c.bottom - 2;
}

function ddAttachAll(root) {
  root = root || document;
  if (root.matches && root.matches('select')) ddAttach(root);
  if (root.querySelectorAll) root.querySelectorAll('select').forEach((n) => ddAttach(n));
}

// ===== 칸 =====
function ddAttach(sel) {
  if (!sel || String(sel.tagName).toUpperCase() !== 'SELECT') return null;
  if (sel._dd) { sel._dd.sync(); return sel._dd; }
  if (sel.multiple || sel.size > 1 || sel.dataset.dd === 'off') return null;   // 목록형·여러 개 고르기는 시스템 그대로(앱엔 없음)
  const uid = 'dd' + (++_ddSeq);
  const f = document.createElement('button');
  f.type = 'button'; f.className = 'ddField';
  f.setAttribute('role', 'combobox'); f.setAttribute('aria-haspopup', 'listbox'); f.setAttribute('aria-expanded', 'false'); f.setAttribute('aria-controls', uid + 'l');
  f.innerHTML = '<span class="ddFieldTx"><span class="ddCur"></span><span class="ddSz" aria-hidden="true"></span></span>' + DD_CHEV;
  // 줄 배치·글자 크기(style="flex:1;font-size:11px")는 칸이 이어받는다
  for (const k of ['flex', 'fontSize', 'width', 'minWidth', 'maxWidth']) if (sel.style[k]) f.style[k] = sel.style[k];
  sel.classList.add('ddSrc'); sel.tabIndex = -1;
  sel.after(f);
  const cur = f.firstChild.firstChild, sz = f.firstChild.lastChild;
  const name = ddNameOf(sel);
  let sig = null;
  const sync = () => {
    const i = sel.selectedIndex, o = i >= 0 ? sel.options[i] : null, tx = o ? ddLabel(o) : '';
    const show = tx || '—';
    if (cur.textContent !== show) cur.textContent = show;
    f.classList.toggle('empty', !tx);
    // 폭 재기 — 모든 항목 글자를 숨긴 채 겹쳐 둔다: 칸의 제 폭 = 가장 긴 항목(시스템 select처럼 골라도 폭이 안 바뀐다 — 타임라인 도구 줄)
    const labels = Array.from(sel.options, ddLabel), s = labels.join('\n');
    if (s !== sig) {
      sig = s; sz.textContent = '';
      for (const l of labels) { const sp = document.createElement('span'); sp.textContent = l || '—'; sz.append(sp); }
    }
    f.disabled = sel.disabled;
    f.hidden = sel.hidden || sel.style.display === 'none';
    if (f.title !== (sel.title || '')) f.title = sel.title || '';
    if (name) f.setAttribute('aria-label', name + ' ' + show);
    if (_ddNow && _ddNow.sel === sel) _ddNow.refresh();
  };
  const setRaw = ddWatchValue(sel, sync);
  const api = { uid, sel, field: f, name, sync, setRaw, kbAt: -1e9 };
  sel._dd = api;
  // 옵션을 다시 채우거나(innerHTML·append·textContent) 막고 숨기면 — 칸 글자·폭·상태, 떠 있는 목록도
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['disabled', 'hidden', 'style', 'title', 'label', 'selected', 'value'] });
  sel.addEventListener('change', sync);   // 누가 change를 직접 보내도
  sel.addEventListener('click', () => { if (!f.disabled && !f.hidden) f.focus(); });   // <label for>·감싼 label을 누르면 숨긴 select 대신 칸으로
  f.addEventListener('click', (e) => {
    if (_ddNow && _ddNow.sel === sel) { ddClose(true); return; }
    if (e.detail === 0 && performance.now() - api.kbAt < 400) return;   // 키로 고른 바로 뒤 버튼의 '눌림'(Space 떼기)이 다시 여는 것 막기
    ddOpen(sel);
  });
  // 닫힌 칸의 키 — 지도 단축키(Space = 재생, Delete = 지우기, 화살표 = 옮기기 …)로 새지 않게(예전 select처럼). Tab·Esc·Ctrl 조합은 그대로
  f.addEventListener('keydown', (e) => {
    if (_ddNow && _ddNow.sel === sel) return;   // 열린 동안은 창 캡처(ddOpen)가 받는다
    const k = e.key;
    if (e.ctrlKey || e.metaKey || k === 'Tab' || k === 'Escape' || /^F\d+$/.test(k)) return;
    e.stopPropagation();
    if (k === 'Enter' || k === ' ') return;   // 버튼 기본 동작(click)이 연다
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); ddOpen(sel); return; }
    if (/^(Home|End|PageUp|PageDown|ArrowLeft|ArrowRight)$/.test(k)) { e.preventDefault(); return; }   // 사이드바가 들썩이지 않게(select도 이 키를 먹었다)
    if (k.length === 1 && !e.altKey) { e.preventDefault(); const st = ddOpen(sel); if (st) st.type(k); }
  });
  f.addEventListener('keyup', (e) => { if (e.key === ' ' && performance.now() - api.kbAt < 400) e.preventDefault(); });
  sync();
  return api;
}

// ===== 목록 팝오버 =====
function ddOpen(sel) {
  const api = sel && sel._dd;
  if (!api || api.field.disabled || api.field.hidden || !api.field.getClientRects().length) return null;   // 막힘·숨김·접혀 안 보이는 칸은 안 연다
  ddClose(false);
  const f = api.field, z = f.currentCSSZoom || 1;
  const pop = document.createElement('div');
  pop.className = 'ddPop';
  pop.innerHTML = `<div class="ddCard"><div class="ddList" role="listbox" id="${api.uid}l" tabindex="-1"></div></div>`;
  document.body.append(pop);
  const card = pop.firstElementChild, list = card.firstElementChild;
  card.style.zoom = String(z);
  if (api.name) list.setAttribute('aria-label', api.name);
  const st = { sel, field: f, pop, card, list, items: [], act: -1, off: [], buf: '', bufT: 0, raf: 0, refresh() {}, type() {} };
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); st.off.push(() => t.removeEventListener(ev, fn, opt)); };
  const rowOf = (k) => list.querySelector(`.ddOpt[data-k="${k}"]`);
  const render = () => {
    st.items = ddItems(sel);
    list.textContent = '';
    const frag = document.createDocumentFragment();
    st.items.forEach((it, k) => {
      const d = document.createElement('div');
      if (it.kind === 'grp') { d.className = 'ddGrp' + (it.dis ? ' dis' : ''); d.setAttribute('role', 'presentation'); d.textContent = it.label; frag.append(d); return; }
      d.className = 'ddOpt' + (it.on ? ' on' : '') + (it.dis ? ' dis' : '') + (it.inGrp ? ' inGrp' : '');
      d.id = api.uid + 'o' + k; d.dataset.k = String(k);
      d.setAttribute('role', 'option'); d.setAttribute('aria-selected', String(it.on));
      if (it.dis) d.setAttribute('aria-disabled', 'true');
      const t = document.createElement('span');
      t.className = 'ddOptTx'; t.textContent = it.label || '—';
      if (it.font) t.style.fontFamily = it.font;
      if (it.label.length > 28) d.title = it.label;   // 길어서 '…'로 잘릴 만한 글자는 올리면 전부
      d.append(t); d.insertAdjacentHTML('beforeend', DD_CHECK);
      frag.append(d);
    });
    if (!st.items.some((it) => it.kind === 'opt')) { const d = document.createElement('div'); d.className = 'ddEmpty'; d.textContent = '고를 항목이 없어요'; frag.append(d); }
    list.append(frag);
  };
  // 활성 줄(키·마우스 올림) — scroll: 'center'(열 때 고른 줄을 가운데) | true(보이게만) | false
  const setAct = (k, scroll) => {
    const old = list.querySelector('.ddOpt.act'); if (old) old.classList.remove('act');
    st.act = k;
    const row = k >= 0 ? rowOf(k) : null;
    if (!row) { f.removeAttribute('aria-activedescendant'); return; }
    row.classList.add('act'); f.setAttribute('aria-activedescendant', row.id);
    if (!scroll) return;
    const top = row.offsetTop, h = row.offsetHeight, vh = list.clientHeight;
    if (scroll === 'center') list.scrollTop = top - (vh - h) / 2;
    else if (top < list.scrollTop + 4) list.scrollTop = top - 4;
    else if (top + h > list.scrollTop + vh - 4) list.scrollTop = top + h - vh + 4;
  };
  const startAct = () => { const k = st.items.findIndex((it) => it.on); return ddOk(st.items[k]) ? k : ddStep(st.items, -1, 1); };
  // 자리 — first = 처음(폭·높이 한도를 정하고, 위아래 다 모자라면 목록 높이를 줄인다), 아니면 칸을 따라 옮기기만(스크롤)
  const layout = (first) => {
    const fr = f.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    if (first) {
      card.style.minWidth = Math.round(fr.width / z) + 'px';
      card.style.maxWidth = Math.floor(Math.max(fr.width, Math.min(DD_MAX_W * z, vw - 16)) / z) + 'px';
      list.style.maxHeight = DD_MAX_H + 'px';
    }
    let P = ddPlace(fr, pop.offsetWidth, pop.offsetHeight, vw, vh);
    if (first && P.cap) {
      const chrome = pop.offsetHeight - list.getBoundingClientRect().height;   // 카드 테두리·여백(화면 px)
      list.style.maxHeight = Math.max(DD_ROW, Math.floor((P.cap - chrome) / z)) + 'px';
      P = ddPlace(fr, pop.offsetWidth, pop.offsetHeight, vw, vh);
    }
    pop.style.left = Math.round(P.left) + 'px'; pop.style.top = Math.round(P.top) + 'px';
    pop.dataset.side = P.side;
    return P.side;
  };
  // 고르기 — 먼저 닫고(시스템 select처럼), 값이 바뀌었을 때만 input → change(기존 리스너가 받는다)
  const pick = (k) => {
    const it = st.items[k]; if (!ddOk(it)) return;
    ddClose(true);
    if (sel.selectedIndex === it.i) return;
    api.setRaw(it.i); api.sync();
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  st.pick = pick;
  st.type = (ch) => {
    clearTimeout(st.bufT);
    st.buf += String(ch).toLowerCase();
    st.bufT = setTimeout(() => { st.buf = ''; }, 800);
    const k = ddFind(st.items, st.buf, st.act);
    if (k >= 0) setAct(k, true);
  };
  // 옵션이 바뀌면(열린 채 다시 채움) — 같은 옵션에 활성을 두고 다시 그린다. 칸이 사라지거나 막히면 닫기
  st.refresh = () => {
    if (!f.isConnected || f.hidden || f.disabled) { ddClose(false); return; }
    const keep = st.items[st.act], top = list.scrollTop;
    render();
    let k = keep ? st.items.findIndex((it) => it.kind === 'opt' && it.i === keep.i) : -1;
    if (!ddOk(st.items[k])) k = startAct();
    list.scrollTop = top; setAct(k, true); layout(false);
  };
  // 목록 안 — 포커스는 칸에 그대로(mousedown 기본 막기), 누르기는 뒤로 안 보낸다(제목줄 메뉴 '바깥 누르기 닫기'·사이드바 끌기)
  pop.addEventListener('mousedown', (e) => e.preventDefault());
  pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  list.addEventListener('pointermove', (e) => { const r = e.target.closest && e.target.closest('.ddOpt'); if (r && !r.classList.contains('dis') && +r.dataset.k !== st.act) setAct(+r.dataset.k, false); });
  list.addEventListener('click', (e) => { const r = e.target.closest && e.target.closest('.ddOpt'); if (r && !r.classList.contains('dis')) pick(+r.dataset.k); });
  on(document, 'pointerdown', (e) => { if (!pop.contains(e.target) && !f.contains(e.target)) ddClose(false); }, true);
  // 열린 동안 키 — 창 캡처 단계에서 먼저(뒤의 팝업 Esc·지도 단축키로 새지 않게). Ctrl 조합(저장 등)은 그대로, Tab은 닫고 그대로 다음 칸으로
  on(window, 'keydown', (e) => {
    if (_ddNow !== st || e.ctrlKey || e.metaKey) return;
    if (!f.isConnected) { ddClose(false); return; }   // 칸이 다시 그려져 사라졌으면(select째 지움 — 관찰자가 못 봄) 닫고 키는 그대로
    const k = e.key;
    if (k === 'Tab') { ddClose(false); return; }
    e.stopPropagation();
    if (k === 'Escape') { e.preventDefault(); ddClose(true); return; }
    if (k === 'Enter' || (k === ' ' && !st.buf) || (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown'))) {
      e.preventDefault(); api.kbAt = performance.now();
      if (ddOk(st.items[st.act])) pick(st.act); else ddClose(true);
      return;
    }
    const page = Math.max(1, Math.floor(list.clientHeight / DD_ROW) - 1);
    let to;
    if (k === 'ArrowDown') to = ddStep(st.items, st.act, 1);
    else if (k === 'ArrowUp') to = ddStep(st.items, st.act, -1);
    else if (k === 'Home') to = ddStep(st.items, st.act, 'first');
    else if (k === 'End') to = ddStep(st.items, st.act, 'last');
    else if (k === 'PageDown') to = ddStep(st.items, st.act, 1, page);
    else if (k === 'PageUp') to = ddStep(st.items, st.act, -1, page);
    else if (k.length === 1 && !e.altKey) { e.preventDefault(); st.type(k); return; }
    else return;
    e.preventDefault();
    if (to >= 0) setAct(to, true);
  }, true);
  on(window, 'scroll', (e) => {
    if (e.target && e.target.nodeType === 1 && pop.contains(e.target)) return;   // 목록 스크롤은 제 것
    if (st.raf) return;
    st.raf = requestAnimationFrame(() => { st.raf = 0; if (_ddNow !== st) return; if (!ddFieldVisible(f)) ddClose(false); else layout(false); });
  }, true);
  on(window, 'resize', () => ddClose(false));
  st.off.push(() => { if (st.raf) cancelAnimationFrame(st.raf); clearTimeout(st.bufT); });

  render();
  const side = layout(true);
  setAct(startAct(), 'center');
  f.classList.add('on'); f.setAttribute('aria-expanded', 'true');
  document.documentElement.classList.add('ddOpen');   // 데스크톱 제목줄 끌기 끔(css/dropdown.css)
  if (!ddCalm() && pop.animate) pop.animate([{ opacity: 0, transform: `translateY(${side === 'up' ? 6 : -6}px) scale(.98)` }, { opacity: 1, transform: 'none' }], { duration: 200, easing: DD_EASE });
  _ddNow = st;
  return st;
}
// 닫기 — back = 포커스를 칸으로 돌려준다(고르기·Esc). 바깥을 눌러 닫을 때는 누른 곳이 포커스를 가져간다
function ddClose(back) {
  const st = _ddNow; if (!st) return;
  _ddNow = null;
  st.off.forEach((fn) => fn());
  const { pop, field } = st;
  field.classList.remove('on'); field.setAttribute('aria-expanded', 'false'); field.removeAttribute('aria-activedescendant');
  document.documentElement.classList.remove('ddOpen');
  pop.classList.add('closing');
  const a = document.activeElement;
  if (back && field.isConnected && a !== field && (!a || a === document.body || pop.contains(a))) { try { field.focus({ preventScroll: true }); } catch (e) {} }
  if (ddCalm() || !pop.animate) { pop.remove(); return; }
  pop.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${pop.dataset.side === 'up' ? 4 : -4}px) scale(.98)` }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
  setTimeout(() => pop.remove(), 130);
}
