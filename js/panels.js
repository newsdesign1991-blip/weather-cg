/* [모듈] js/panels.js — 사이드바 패널(팔레트·인셋·텍스트/라벨/산 목록·섹션 열기/스크롤), 캔버스 요소→섹션 자동 열기, 선택(select)·refreshPanel·syncPanelFromState, 칠하기 paint */
'use strict';

// ===================== 패널 =====================
const hex = (v) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null);

const swatch = (c, title) => {
  const d = document.createElement('div');
  d.className = 'sw';
  d.style.background = c;
  d.dataset.c = c;
  d.title = title || c;
  d.onclick = () => setActive(c);
  return d;
};

function buildPalette() {
  const p = $('#pal');
  p.textContent = '';
  // grid-auto-flow:column + 8행 -> 계열 하나가 세로 한 줄을 채운다
  for (const ramp of RAMPS) {
    ramp.cols.forEach((c, i) => p.append(swatch(c, `${ramp.name} ${i + 1}단계 · ${c}`)));
  }
  const a = $('#palAccent');
  a.textContent = '';
  for (const c of ACCENTS) a.append(swatch(c, '강조 · ' + c));
  buildCustom();
}
function buildCustom() {
  const p = $('#palCustom');
  p.textContent = '';
  for (const c of customCols) {
    const d = swatch(c, c + ' (우클릭 삭제)');
    d.oncontextmenu = (e) => { e.preventDefault(); customCols = customCols.filter((v) => v !== c); saveCustom(); buildCustom(); markActive(); };
    p.append(d);
  }
}
function setActive(c) { activeColor = c.toUpperCase(); markActive(); }
function markActive() {
  $('#curChip').style.background = activeColor;
  $('#curHex').value = activeColor;
  document.querySelectorAll('.sw').forEach((s) => s.classList.toggle('on', s.dataset.c === activeColor));
}
const saveCustom = () => localStorage.setItem('wcg_custom', JSON.stringify(customCols));

// 도서 박스 입력칸은 사이드바에서 뺐다(이동 모드로 충분). 항목이 없으면 조용히 넘어간다.
function buildInsetPanel() {
  const b = $('#insetBody');
  if (!b) return;
  b.textContent = '';
  for (const key of Object.keys(S.insets)) {
    const c = S.insets[key];
    const w = document.createElement('div');
    w.style.cssText = 'margin-bottom:12px;padding-bottom:10px;border-bottom:1px dashed #2d323c';
    w.innerHTML =
      `<div style="font-weight:700;margin-bottom:6px">${c.label}</div>` +
      `<div class="row"><label>박스 X/Y</label><input type="number" data-k="${key}" data-f="0"><input type="number" data-k="${key}" data-f="1"></div>` +
      `<div class="row"><label>폭 / 높이</label><input type="number" data-k="${key}" data-f="2"><input type="number" data-k="${key}" data-f="3"></div>` +
      `<div class="row"><label>배율</label><input type="number" step="0.05" data-k="${key}" data-f="s"></div>` +
      `<div class="row"><label>섬 X/Y</label><input type="number" data-k="${key}" data-f="ox"><input type="number" data-k="${key}" data-f="oy"></div>` +
      `<div class="row"><label>박스선</label><input type="checkbox" data-k="${key}" data-f="show" style="flex:none"></div>`;
    b.append(w);
  }
  // 주의: 되돌리기/불러오기는 S를 통째로 교체하므로 S.insets[...]를 여기서 붙잡아 두면 안 된다.
  // 반드시 이벤트가 일어난 시점에 다시 찾아야 한다.
  b.querySelectorAll('input').forEach((n) => {
    const f = n.dataset.f;
    const cur = () => S.insets[n.dataset.k];
    if (f === 'show') {
      n.checked = !!cur().show;
      n.onchange = () => { pushUndo(); cur().show = n.checked ? 1 : 0; renderInsets(); };
      return;
    }
    n.value = /^\d$/.test(f) ? cur().box[+f] : cur()[f];
    n.oninput = () => {
      const v = parseFloat(n.value);
      if (isNaN(v)) return;
      pushUndo('inset-' + n.dataset.k + f);
      const c = cur();
      if (/^\d$/.test(f)) c.box[+f] = v; else c[f] = v;
      renderInsets();
    };
  });
}
function syncInsetPanel() {
  const b = $('#insetBody');
  if (!b) return;
  b.querySelectorAll('input').forEach((n) => {
    const c = S.insets[n.dataset.k], f = n.dataset.f;
    if (f === 'show') n.checked = !!c.show;
    else n.value = /^\d$/.test(f) ? c.box[+f] : c[f];
  });
}

function buildTextList() {
  const L = $('#textList');
  L.textContent = '';
  if (!S.texts.length) L.innerHTML = '<div class="empty">텍스트가 없습니다</div>';
  for (const t of S.texts) {
    const d = document.createElement('div');
    d.className = 'item' + (isSel('text', t.id) ? ' on' : '');
    d.innerHTML = `<button class="eye${t.off ? ' off' : ''}" title="켜기/끄기"></button>` +
      `<div class="dot" style="background:${t.col}"></div><div class="nm"></div><span class="x">✕</span>`;
    d.querySelector('.nm').textContent = t.txt || '(빈 텍스트)';
    d.querySelector('.nm').style.opacity = t.off ? '.45' : '';
    d.onclick = (e) => {
      if (e.target.classList.contains('eye')) {
        pushUndo();
        t.off = t.off ? 0 : 1;
        sel = sel.filter((s) => !(s.kind === 'text' && s.id === t.id));
        refreshPanel(); renderTexts(); renderSel();
        return;
      }
      if (e.target.classList.contains('x')) {
        pushUndo();
        S.texts = S.texts.filter((v) => v !== t);
        sel = sel.filter((s) => !(s.kind === 'text' && s.id === t.id));
        refreshPanel(); renderAll(); return;
      }
      select('text', t.id, e.shiftKey);
    };
    L.append(d);
  }
}
function buildLabelList() {
  const L = $('#labelList');
  L.textContent = '';
  if (!labelList().length) L.innerHTML = '<div class="empty">라벨이 없습니다</div>';
  for (const b of labelList()) {
    const d = document.createElement('div');
    d.className = 'item' + (isSel('label', b.id) ? ' on' : '');
    d.innerHTML = `<button class="eye${b.off ? ' off' : ''}" title="켜기/끄기"></button>` +
      `<div class="dot" style="background:${b.fill}"></div><div class="nm"></div><span class="x">✕</span>`;
    d.querySelector('.nm').textContent = (b.title ? b.title.trim() + ' · ' : '') + b.txt;
    d.querySelector('.nm').style.opacity = b.off ? '.45' : '';
    d.onclick = (e) => {
      if (e.target.classList.contains('eye')) {
        pushUndo();
        b.off = b.off ? 0 : 1;
        sel = sel.filter((s) => !(s.kind === 'label' && s.id === b.id));
        refreshPanel(); renderLabels(); renderSel();
        return;
      }
      if (e.target.classList.contains('x')) {
        pushUndo();
        setLabelList(labelList().filter((v) => v !== b));
        sel = sel.filter((s) => !(s.kind === 'label' && s.id === b.id));
        refreshPanel(); renderAll(); return;
      }
      select('label', b.id, e.shiftKey);
    };
    L.append(d);
  }
}

function buildMtnList() {
  const L = $('#mtnList');
  L.textContent = '';
  const list = (S.mtns ||= []);
  if (!list.length) L.innerHTML = '<div class="empty">산 표시가 없습니다</div>';
  for (const m of list) {
    const d = document.createElement('div');
    d.className = 'item' + (isSel('mtn', m.id) ? ' on' : '');
    d.innerHTML = `<button class="eye${m.off ? ' off' : ''}" title="켜기/끄기"></button>` +
      `<div class="dot" style="background:${m.col}"></div><div class="nm"></div><span class="x">✕</span>`;
    d.querySelector('.nm').textContent = m.txt || '(이름 없음)';
    d.querySelector('.nm').style.opacity = m.off ? '.45' : '';
    d.onclick = (e) => {
      if (e.target.classList.contains('eye')) {
        pushUndo();
        m.off = m.off ? 0 : 1;
        sel = sel.filter((s) => !(s.kind === 'mtn' && s.id === m.id));
        refreshPanel(); renderMtns(); renderSel();
        return;
      }
      if (e.target.classList.contains('x')) {
        pushUndo();
        S.mtns = S.mtns.filter((v) => v !== m);
        sel = sel.filter((s) => !(s.kind === 'mtn' && s.id === m.id));
        refreshPanel(); renderAll(); return;
      }
      select('mtn', m.id, e.shiftKey);
    };
    L.append(d);
  }
}

// 클릭한 오브젝트를 편집하는 항목을 펼치고, 깜빡이고, 그 자리로 스크롤한다.
// 항목 순서는 절대 안 바꾼다 — 눌렀다고 순서가 뒤바뀌면 어디에 뭐가 있는지 못 외운다.
// (패널 아래에 여백을 크게 둬서 마지막 항목도 맨 위까지 올라올 수 있다)
// 그 항목이 지금 접혀 있나 (떼어낸 창에 있으면 '접힘'은 아니다)
function secClosed(name) {
  if (typeof winOf === 'function' && winOf(name)) return false;
  const sec = document.querySelector(`#panel .sec[data-sec="${name}"]`);
  return !!sec && sec.classList.contains('closed');
}

// 도구 묶음은 아코디언 — 하나를 펴면 나머지는 접는다. (떼어낸 창은 건드리지 않는다)
function collapseOtherTools(keep) {
  document.querySelectorAll('#panel .sec.toolSec').forEach((s) => {
    if (s.dataset.sec !== keep) s.classList.add('closed');
  });
}
// 강조 깜빡임만 (스크롤 없음)
function flashSec(sec) {
  sec.classList.remove('flash');
  void sec.offsetWidth; // 애니메이션 재시작용 강제 리플로우
  sec.classList.add('flash');
}

// scroll=false 면 그 자리에서 펴기만 한다 (수동 클릭용). 기본은 스크롤(프로그램이 부를 때).
function revealSec(name, scroll = true) {
  const panel = $('#panel');
  // 떼어낸 창에 있으면 그 창을 앞으로 올리고 탭을 골라준다 — 사이드바를 스크롤해봐야 없다
  const w = typeof winOf === 'function' && winOf(name);
  if (w) {
    w.active = name;
    renderWins(); raiseWin(w);
    const el = document.querySelector(`.win[data-win="${w.id}"]`);
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    return;
  }
  const sec = panel.querySelector(`.sec[data-sec="${name}"]`);
  if (!sec) return;
  openPanelSec(sec, name, scroll);
}
// 사이드바 섹션 노드를 연다(아코디언: 다른 도구는 접음) → 깜빡 → (scroll이면) 보이게 스크롤.
// keep = 접지 않고 둘 도구 이름(태풍 비교의 태풍별 탭처럼 도구가 아니면 null — 도구는 전부 접힌다).
function openPanelSec(sec, keep, scroll) {
  const wasOpen = !sec.classList.contains('closed');
  collapseOtherTools(keep);        // 다른 도구는 접는다
  sec.classList.remove('closed');
  flashSec(sec);
  if (!scroll) return;             // 수동 클릭 — 그 자리에서 펴기만
  if (wasOpen && secInView(sec)) {   // 이미 펴져 있고 보이는 중 — 강조만 (아래로 내려 편집하던 자리를 빼앗지 않게)
    if (_secScrollStop) _secScrollStop();   // 진행 중이던 옛 스크롤도 여기서 끝(이미 보이는 중이니)
    _secScrollGen++;                        // 손 뗀 옛 스크롤의 밀린 프레임이 나중에 끌고 가지 않게
    return;
  }
  scrollPanelToSec(sec);
}
// 사이드바 위·아래에 붙어 있는(sticky) 머리·꼬리가 가리는 높이 — 스크롤 목표를 그만큼 비켜 잡는다.
// 실제 화면 위치로 잰다(sticky top·패딩 계산에 기대지 않게). 사이드바는 zoom이 걸려 있어 화면 px ÷ 배율 = scrollTop 단위.
const panelZoomK = (panel) => (panel.getBoundingClientRect().width / (panel.offsetWidth || 1)) || 1;
function panelStickyH(panel) {
  const hd = panel.querySelector(':scope > .appHeader');
  if (!hd || !hd.offsetParent) return 0;
  const k = panelZoomK(panel), top = panel.getBoundingClientRect().top + panel.clientTop * k;
  return Math.max(0, (hd.getBoundingClientRect().bottom - top) / k);
}
function panelFooterH(panel) {
  const ft = panel.querySelector(':scope > .panelFooter');
  if (!ft || !ft.offsetParent) return 0;
  const k = panelZoomK(panel), bot = panel.getBoundingClientRect().top + (panel.clientTop + panel.clientHeight) * k;
  return Math.max(0, (bot - ft.getBoundingClientRect().top) / k);
}
// 섹션이 지금 보이는 중인가 — 머리(h3)가 화면 안에 있거나, 긴 섹션을 읽는 중이라 화면을 통째로 채우고 있으면 '보이는 중'.
// (아랫부분만 살짝 걸친 건 안 보이는 것으로 친다 → 머리가 보이게 스크롤)
function secInView(sec) {
  const panel = $('#panel');
  if (!sec.offsetParent) return false;
  const v0 = panel.scrollTop + panelStickyH(panel), v1 = panel.scrollTop + panel.clientHeight - panelFooterH(panel);
  const a = sec.offsetTop, b = a + sec.offsetHeight, h = sec.querySelector(':scope > h3');
  const headIn = a >= v0 - 1 && a + (h ? h.offsetHeight : 0) <= v1 + 1;
  return headIn || (a <= v0 && b >= v1);
}
// 섹션이 보이게 사이드바를 부드럽게 스크롤. 다른 섹션이 접히는 애니메이션(.34s) 동안 위치가 계속 바뀌므로
// 처음 한 번 잰 값으로 가면 엇나간다 → 매 프레임 목표를 다시 재며 따라간다(끝나면 정확히 그 자리).
let _secScrollStop = null, _secScrollGen = 0;
function scrollPanelToSec(sec0) {
  const panel = $('#panel');
  if (_secScrollStop) _secScrollStop();
  const gen = ++_secScrollGen;   // 더 새 스크롤이 시작되면 이 회차의 밀린 프레임은 아무것도 안 한다
  // 태풍 비교의 태풍별 탭은 패널 갱신 때 통째로 다시 만들어진다 → 매번 이름으로 다시 찾는다(떨어져 나간 옛 노드를 따라가지 않게)
  const key = sec0.dataset.sec ? `:scope > .sec[data-sec="${sec0.dataset.sec}"]` : `:scope > .sec[data-cmpsec="${sec0.dataset.cmpsec}"]`;
  const want = () => {
    const sec = sec0.isConnected ? sec0 : (panel.querySelector(key) || sec0);
    const head = panelStickyH(panel) + 4;
    let top = sec.offsetTop - head;
    // 맨 위까지 올리면 앞뒤 맥락이 사라져서 지금 어디쯤인지 감이 안 온다. 두 번째 칸에 세운다.
    let prev = sec.previousElementSibling;
    while (prev && prev.classList.contains('sec') && !prev.offsetParent) prev = prev.previousElementSibling;   // 지금 지도에서 숨긴 항목은 건너뛴다
    if (prev && prev.classList.contains('sec')) {   // 머리(로고 등 비-.sec)면 두 번째 칸 계산 없이
      const prevTop = prev.offsetTop - head;
      // 앞 항목이 짧으면 통째로 보여줘서 진짜 '두 번째'가 되게 한다.
      // 앞 항목이 길면 그렇게 못 한다 — 이 항목이 화면 밖으로 밀려나므로 제목 한 칸만 띄운다.
      top = (top - prevTop <= (panel.clientHeight - head) * 0.45) ? prevTop : top - prev.querySelector('h3').offsetHeight;
    }
    return Math.max(0, Math.min(top, panel.scrollHeight - panel.clientHeight));
  };
  const from = panel.scrollTop, t0 = performance.now(), DUR = 440;
  const sb = panel.style.scrollBehavior;
  panel.style.scrollBehavior = 'auto';   // CSS의 smooth를 잠깐 끈다 — 매 프레임 직접 옮긴다
  let raf = 0, fin = 0, rel = 0, done = false;
  // 접기·펴기 애니메이션이 늦게 끝나도(창이 가려져 프레임이 멈췄던 경우 등) 끝나는 순간 제자리로 한 번 더 맞춘다
  const onTe = (ev) => { if (!done && gen === _secScrollGen && ev.propertyName === 'grid-template-rows') panel.scrollTop = want(); };
  const release = () => {   // 손 떼기 — 리스너·스크롤 방식 원복 (남은 마지막 프레임은 그대로 둔다)
    clearTimeout(fin); clearTimeout(rel);
    panel.style.scrollBehavior = sb;
    panel.removeEventListener('wheel', stop); panel.removeEventListener('pointerdown', stop);
    panel.removeEventListener('transitionend', onTe);
    if (_secScrollStop === stop) _secScrollStop = null;
  };
  // 즉시 멈춤 — 사용자가 직접 스크롤·클릭했거나 새 스크롤이 시작될 때
  function stop() { done = true; cancelAnimationFrame(raf); release(); }
  _secScrollStop = stop;
  panel.addEventListener('wheel', stop, { passive: true });   // 사용자가 직접 스크롤하면 바로 양보
  panel.addEventListener('pointerdown', stop);
  panel.addEventListener('transitionend', onTe);
  const step = (now) => {
    if (done || gen !== _secScrollGen) return;
    const k = Math.min(1, (now - t0) / DUR), e = 1 - Math.pow(1 - k, 3);
    panel.scrollTop = from + (want() - from) * e;
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  // 프레임이 멈춘 창에서도 끝 위치는 보장. (밀린 프레임이 나중에 와도 마지막 단계가 같은 자리로 다시 맞춘다)
  fin = setTimeout(() => { if (!done && gen === _secScrollGen) panel.scrollTop = want(); }, DUR + 120);
  rel = setTimeout(release, 1600);   // 그 뒤로는 손을 뗀다(사용자 스크롤 자유)
}

// ===== 화면(캔버스) 요소 → 사이드바 섹션 자동 열기 — 연결은 전부 여기 한 곳에서 =====
// kind = 캔버스에서 누른 것. 지도 종류마다 섹션 구성이 달라 '어느 섹션'인지는 여기서만 정한다.
// 반환: data-sec 이름 | { cmp: 태풍 비교의 태풍 id }(태풍별 탭) | null(연결 없음)
function secForKind(kind, id) {
  const cmp = isTyphoonCompare();
  switch (kind) {
    case 'text': case 'vfBar': return 'text';                   // 제목 텍스트 · VF 제목 바/전체 크기(설정이 제목 텍스트 안)
    case 'label': return cmp ? null : 'label';                  // 수치 라벨(일반·지시선·앵커·태풍 라벨)
    case 'mtn': return 'mtn';                                   // 산 표시
    case 'legend': return cmp ? 'typhoonCompare' : 'legend';    // 범례 — 비교 지도는 범례 토글이 '태풍 비교' 안
    case 'map': return 'map';                                   // 지도 크기 손잡이 · 이동 모드 지도/도서 박스 끌기('drag')
    case 'bg': return 'res';                                    // 이동 모드에서 배경 빈 곳 딱 클릭 → 배경 · 가이드('click')
    case 'paint': return 'pal';                                 // 칠하기·브러쉬·스포이드·산 색칠
    case 'place': return 'typhoonPlaces';                       // 지명 이름표·원
    case 'typhoon': return cmp ? (id ? { cmp: id } : 'typhoonCompare') : 'typhoon';   // 태풍 경로·아이콘·반경
    case 'cmp': return id ? { cmp: id } : 'typhoonCompare';     // 비교 이름표·수치라벨·점 편집
    case 'refImg': return 'typhoonCompare';                     // 참고 이미지
  }
  return null;
}
// how: 'soft' = 연속 작업(칠하기 등) — 접혀 있을 때만 편다. 이미 펴져 있으면 아무것도 안 해서 칠할 때마다 사이드바가 안 튄다.
//      'click' = 끌지 않고 딱 눌렀다 뗐을 때만(끌어도 아무 동작 없는 태풍 경로, 배경 빈 곳 등).
//      'drag' = 실제로 끌었을 때만 + soft(접혀 있을 때만). 이동 모드 지도·도서 박스 끌기 → 지도 위치(좌표 칸).
//               그래서 빈 곳 딱 클릭(선택 해제)은 지도 위치를 열지 않는다.
// 캔버스를 누르고 있는 동안(끌기 중)엔 열지 않고, 손을 뗄 때 조건에 맞는 마지막 요청 하나만 연다
// (같은 누름에 '클릭이면 배경 · 끌면 지도 위치'처럼 둘을 걸어 둘 수 있다).
// 연결 안 함(의도): 칠하기 모드의 배경 클릭(칠하다 빗나간 클릭마다 색 팔레트가 접히면 안 됨 — 사이드바는 아코디언),
//   태풍 지도의 바다·광역 육지 클릭(배경이 아니라 지도), 지도 빈 곳 딱 클릭(선택 해제), Alt 카메라 팬·줌(영상 추출 카메라 키 작업).
let _canvasPress = null;   // { x, y, moved, pending: [{ target, how }] }
function revealSecFor(kind, id, how) {
  const target = secForKind(kind, id);
  if (!target) return;
  if (_canvasPress) { (_canvasPress.pending ||= []).push({ target, how }); return; }
  revealSecTarget(target, how);
}
function revealSecTarget(target, how) {
  const soft = how === 'soft' || how === 'drag';
  if (typeof target === 'object') {   // 태풍 비교: 태풍별 탭(.sec[data-cmpsec]) — 없으면 '태풍 비교'
    const sec = document.querySelector(`#panel > .sec[data-cmpsec="${target.cmp}"]`);
    if (!sec) { revealSecTarget('typhoonCompare', how); return; }
    if (soft && !sec.classList.contains('closed')) return;
    const c = typeof compareById === 'function' && compareById(target.cmp);
    if (c) c._open = true;   // 탭 접힘 상태 기억(재빌드 때 유지)
    openPanelSec(sec, null, true);
    return;
  }
  if (secModeHidden(target)) return;   // 지금 지도에서 숨긴 섹션 — 열어도 안 보인다
  if (soft && !secClosed(target)) return;
  revealSec(target);
}
// 캔버스 누름 추적(캡처 단계 — 요소 핸들러가 전파를 막아도 먼저 본다)
window.addEventListener('pointerdown', (e) => {
  _canvasPress = (e.button === 0 && e.target && e.target.closest && e.target.closest('#cg')) ? { x: e.clientX, y: e.clientY, moved: false, pending: null } : null;
}, true);
window.addEventListener('pointermove', (e) => {
  const p = _canvasPress;
  if (p && !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) p.moved = true;
}, true);
{
  const endPress = () => {
    const p = _canvasPress; _canvasPress = null;
    if (!p || !p.pending) return;
    // 끌었으면 '클릭 전용'은, 안 끌었으면 '끌기 전용'은 건너뛰고 남은 것 중 마지막 하나
    const q = p.pending.filter((r) => (r.how === 'click' ? !p.moved : r.how === 'drag' ? p.moved : true)).pop();
    if (!q) return;
    setTimeout(() => revealSecTarget(q.target, q.how), 0);   // 끌기 끝 처리(패널 동기화) 뒤에
  };
  window.addEventListener('pointerup', endPress, true);
  window.addEventListener('pointercancel', endPress, true);
  window.addEventListener('blur', () => { _canvasPress = null; });
}

function select(kind, id, additive) {
  if (additive) {
    const i = sel.findIndex((s) => s.kind === kind && s.id === id);
    if (i >= 0) sel.splice(i, 1); else sel.push({ kind, id });
  } else if (!isSel(kind, id)) {
    // 이미 선택된 걸 다시 누르면 선택을 유지한다 (여러 개 잡고 끌 수 있게)
    sel = [{ kind, id }];
  }
  refreshPanel(); renderSel();
  if (sel.length === 1) revealSecFor(kind === 'text' || kind === 'mtn' ? kind : 'label');
}
const deselect = () => { sel = []; refreshPanel(); renderSel(); };

function refreshPanel() {
  buildTextList(); buildLabelList(); buildMtnList();
  const s1 = one();
  const t = s1 && s1.kind === 'text' ? itemOf(s1) : null;
  $('#textEdit').style.display = t ? '' : 'none';
  if (t) {
    $('#tTxt').value = t.txt; $('#tSize').value = t.size; $('#tWeight').value = t.w;
    $('#tCol').value = t.col; $('#tColHex').value = t.col; $('#tTrack').value = t.track;
    $('#tAlign').value = t.align; $('#tX').value = Math.round(t.x); $('#tY').value = Math.round(t.y);
  }
  const b = s1 && s1.kind === 'label' ? itemOf(s1) : null;
  $('#labelEdit').style.display = b ? '' : 'none';
  if (b) {
    $('#lTxt').value = b.txt; $('#lFill').value = b.fill; $('#lFillHex').value = b.fill;
    $('#lTitle').value = b.title || '';
    { const rr = b.titleRatio == null ? 75 : Math.round(b.titleRatio * 100); $('#lTitleR').value = rr; $('#lTitleRV').textContent = rr; }
    $('#lDivider').checked = (b.divider == null ? true : !!b.divider);
    $('#lTxtCol').value = b.txtCol; $('#lTxtColHex').value = b.txtCol;
    $('#lStroke').value = b.stroke; $('#lStrokeW').value = b.strokeW;
    $('#lFillGrad').checked = !!b.fillGrad; $('#lFill2').value = b.fill2 || b.fill; $('#lFill2Hex').value = b.fill2 || '';
    $('#lStrokeGrad').checked = !!b.strokeGrad; $('#lStroke2').value = b.stroke2 || b.stroke; $('#lStroke2Hex').value = b.stroke2 || '';
    { const fo = b.fillOp == null ? 1 : b.fillOp; $('#lFillOp').value = fo; $('#lFillOpV').textContent = Math.round(fo * 100) + '%'; }
    { const ga = b.gradAngle == null ? 90 : b.gradAngle; $('#lGradAngle').value = ga; $('#lGradAngleV').textContent = ga + '°'; }
    $('#lSize').value = b.size; $('#lPadX').value = b.padX; $('#lPadY').value = b.padY;
    $('#lRadius').value = b.radius; $('#lX').value = Math.round(b.x); $('#lY').value = Math.round(b.y);
    $('#lWeight').value = b.w == null ? 500 : b.w;
    $('#lTrack').value = b.track == null ? -1 : b.track;
    if ($('#lLabelStyle')) $('#lLabelStyle').value = b.style === 'leader' ? 'leader' : 'plain';
  }
  const ls = S.labScale == null ? 100 : S.labScale;
  $('#labScale').value = ls; $('#labScaleV').textContent = ls;
  const ms = S.mtnScale == null ? 100 : S.mtnScale;
  if ($('#mtnScale')) { $('#mtnScale').value = ms; $('#mtnScaleV').textContent = ms; }
  { // 기상특보 범례
    const g = (S.legend ||= { on: 0, box: 34, radius: 6, rowGap: 16, size: 34, txtCol: '#FFFFFF', gap: 18, items: [] });
    if ($('#lgOn')) $('#lgOn').checked = !!g.on;
    if ($('#lgAuto')) $('#lgAuto').checked = g.auto == null ? true : !!g.auto;
    if ($('#lgHoriz')) $('#lgHoriz').checked = !!g.horiz;
    if ($('#lgHorizTy')) $('#lgHorizTy').checked = !!g.horiz;
    const sv = (id, v, vid) => { if ($(id)) { $(id).value = v; if (vid) $(vid).textContent = v; } };
    sv('#lgSize', g.size == null ? 34 : g.size, '#lgSizeV'); sv('#lgBox', g.box == null ? 34 : g.box, '#lgBoxV');
    sv('#lgRadius', g.radius == null ? 6 : g.radius, '#lgRadiusV'); sv('#lgRowGap', g.rowGap == null ? 16 : g.rowGap, '#lgRowGapV');
    sv('#lgGap', g.gap == null ? 18 : g.gap, '#lgGapV');
    sv('#lgWeight', g.weight == null ? 600 : g.weight, '#lgWeightV');
    if ($('#lgTxtCol')) { $('#lgTxtCol').value = g.txtCol || '#FFFFFF'; $('#lgTxtColHex').value = g.txtCol || '#FFFFFF'; }
    buildLgList();
    if (isTyphoon()) buildTyphoonLegendList();
    syncLegendMode();
  }
  $('#labShadow').checked = S.labShadow == null ? true : !!S.labShadow;
  $('#txtShadow').checked = S.txtShadow == null ? true : !!S.txtShadow;

  const m = s1 && s1.kind === 'mtn' ? itemOf(s1) : null;
  $('#mtnEdit').style.display = m ? '' : 'none';
  if (m) {
    $('#mTxt').value = m.txt; $('#mCol').value = m.col; $('#mColHex').value = m.col;
    $('#mOp').value = m.op; $('#mOpV').textContent = m.op;
    $('#mStroke').value = m.stroke || '#FFFFFF'; $('#mStrokeW').value = m.strokeW == null ? 2 : m.strokeW;
    $('#mSize').value = m.size; $('#mTxtSize').value = m.txtSize; $('#mTxtCol').value = m.txtCol;
    $('#mX').value = Math.round(m.x); $('#mY').value = Math.round(m.y);
  }
}

function syncEyes() {
  $('#sggEye').classList.toggle('off', !S.sggOn);
  $('#sidoEye').classList.toggle('off', !S.sidoOn);
  $('#realEye').classList.toggle('off', !S.realOn);
  $('#realCol').value = S.realCol; $('#realColHex').value = S.realCol;
  $('#realW').value = S.realW;
  $('#realOp').value = S.realOp; $('#realOpV').textContent = S.realOp;
  $('#sggOp').value = S.sggOp; $('#sggOpV').textContent = S.sggOp;
  $('#sidoOp').value = S.sidoOp; $('#sidoOpV').textContent = S.sidoOp;
  $('#seaBaseOp').value = S.seaBaseOp; $('#seaBaseOpV').textContent = S.seaBaseOp;
  $('#seaFade').value = S.seaFade; $('#seaFadeV_').textContent = S.seaFade;
  $('#seaW').value = S.seaW;
  $('#seaCol').value = S.seaCol; $('#seaColHex').value = S.seaCol;
  $('#seaBase').value = S.seaBase; $('#seaBaseHex').value = S.seaBase;
  // 지도 종류에 따라 이 선이 무슨 구역의 선인지 이름이 달라진다
  const kind = { sgg: '시군', sido: '시도', warn: '특보구역', warnsea: '특보구역' }[S.style] || '구역';
  $('#realLab').textContent = kind + ' 구역선 (칠 안쪽)';
  $('#sggLab').textContent = kind + ' 칠바깥용';
}

function syncPanelFromState() {
  markResBtns();
  updateAutoPaintSecs();
  if (typeof updateWnsButtons === 'function') updateWnsButtons();   // MXF/MOV 버튼: 노말 VF + 로컬만
  { // 노말 VF 제목 바 — VF 화면에서만 UI 표시 + 값 동기화
    const isVf = S.res === '1920x1080-vf', scaleUi = $('#vfScaleUI'), scale = vfScaleForPanel();
    if (scaleUi) scaleUi.style.display = isVf ? '' : 'none';
    if ($('#vfScale')) $('#vfScale').value = scale;
    if ($('#vfScaleV')) $('#vfScaleV').textContent = scale + '%';
    const ui = $('#vfBarUI'); const b = (S.vfBar ||= { on: 0, x: 1140, y: 150, w: 640, h: 110 });
    if (ui) ui.style.display = (S.res === '1920x1080-vf') ? '' : 'none';
    if ($('#vfBarOn')) $('#vfBarOn').checked = !!b.on;
    if ($('#vfBarX')) { $('#vfBarX').value = Math.round(b.x); $('#vfBarY').value = Math.round(b.y); $('#vfBarW').value = Math.round(b.w); $('#vfBarH').value = Math.round(b.h); }
    { const so = b.shOp == null ? 42 : b.shOp, sb = b.shBlur == null ? 7 : b.shBlur, sd = b.shDy == null ? 7 : b.shDy;
      if ($('#vfBarShOp')) { $('#vfBarShOp').value = so; $('#vfBarShOpV').textContent = so; }
      if ($('#vfBarShBlur')) { $('#vfBarShBlur').value = sb; $('#vfBarShBlurV').textContent = sb; }
      if ($('#vfBarShDy')) { $('#vfBarShDy').value = sd; $('#vfBarShDyV').textContent = sd; } }
  }
  $('#showBg').checked = !!S.showBg;
  $('#showGuide').checked = !!S.showGuide;
  $('#guideOp').value = S.guideOp; $('#guideOpV').textContent = S.guideOp;
  $('#nbrCol').value = S.nbrCol; $('#nbrColHex').value = S.nbrCol;
  $('#nbrOp').value = S.nbrOp; $('#nbrOpV').textContent = S.nbrOp;
  $('#nbrGrow').value = S.nbrGrow; $('#nbrGrowV').textContent = S.nbrGrow;
  $('#showNW').checked = !!S.showNW; $('#showJP').checked = !!S.showJP;
  { const bs = $('#bulSoft'); if (bs) bs.checked = !!S.softFill; }   // 불러오기·되돌리기 때 '부드러운 경계' 체크 동기화
  $('#baseCol').value = S.base; $('#baseColHex').value = S.base;
  $('#strokeCol').value = S.stroke; $('#strokeColHex').value = S.stroke; $('#strokeW').value = S.strokeW;
  $('#sidoCol').value = S.sidoCol; $('#sidoColHex').value = S.sidoCol; $('#sidoW').value = S.sidoW;
  syncEyes();
  const s = S.shadow;
  $('#shX').value = s.x; $('#shXV').textContent = s.x;
  $('#shY').value = s.y; $('#shYV').textContent = s.y;
  $('#shBlur').value = s.blur; $('#shBlurV').textContent = s.blur;
  $('#shOp').value = s.op; $('#shOpV').textContent = s.op;
  $('#shCol').value = s.col; $('#shColHex').value = s.col;
  syncInsetPanel(); refreshPanel(); markCgMode();
}

// CG 밝은/어두운 모드 — 배경·베이스색·경계선·실루엣·기본 폰트색을 한 세트로 바꾼다.
// (UI 밝기와 무관. 이건 방송 그래픽 자체의 밝은/어두운 룩)
// 모드 기본 색 세트만 S에 적용 (렌더·프리셋·undo는 호출자가). setCgMode와 새로 시작이 공유.
function applyCgDefaults(light) {
  S.cgLight = light ? 1 : 0;
  bgUseFile = 0;
  S.bg = bgTypeOf(); S.showBg = 1;   // 배경 타입(기본/비)은 유지 — 이미지는 renderBg가 모드에 맞게 고른다
  if (light) {
    S.base = '#959EBA';
    S.stroke = '#E2E2E2'; S.sggOn = 1; S.sggOp = 100;
    S.realCol = '#959EBA'; S.realOn = 1; S.realOp = 2;
    S.sidoCol = '#E2E2E2'; S.sidoOn = 1; S.sidoOp = 100;
    S.nbrCol = '#B7C0D9'; S.nbrOp = 31;
    S.shadow = { x: 3, y: 8, blur: 4, op: 20, col: '#000814' };
    S.seaBase = '#AEBBD4'; S.seaCol = '#8695B5';   // 바다 색도 모드별로 (밝은)
    for (const t of S.texts) t.col = '#071251';
  } else {
    S.base = '#3C4875';
    S.stroke = '#A4A2A2'; S.sggOn = 1; S.sggOp = 17;
    S.realCol = '#3C4875'; S.realOn = 1; S.realOp = 2;
    S.sidoCol = '#EBEBEB'; S.sidoOn = 1; S.sidoOp = 100;
    S.nbrCol = '#1B2856'; S.nbrOp = 100;
    S.shadow = { x: 0, y: 8, blur: 10, op: 45, col: '#000814' };
    S.seaBase = '#2A3A63'; S.seaCol = '#7E8AA8';   // 바다 색도 모드별로 (어두운)
    for (const t of S.texts) if ((t.col || '').toUpperCase() === '#071251') t.col = '#FFFFFF';
  }
}
function setCgMode(light) {
  pushUndo();
  applyCgDefaults(light);
  // 이 모드에 저장해 둔 배치가 있으면 그걸로(색·폰트·배치 전부), 없으면 방금 잡은 기본 세트로.
  if (!applyPreset()) { markCgMode(); buildBgBtns(); syncPanelFromState(); renderAll(); }
  status(light ? 'CG 밝은 모드로 전환' : 'CG 어두운 모드로 전환');
}
function markCgMode() {
  const want = S.cgLight ? 'light' : 'dark';
  for (const b of document.querySelectorAll('#cgMode button')) b.classList.toggle('on', b.dataset.cg === want);
}

// ===================== 상호작용 =====================
let painting = false;
let paintErase = false; // 한 획(드래그) 동안 칠할지 지울지는 처음 누른 조각으로 정한다

// 그 조각에 지금 칠해진 색 (안 칠했으면 undefined)
const fillOf = (node) => (node.dataset.sea ? S.seaFills : fills())[node.dataset.id];

function paint(node, erase) {
  const id = node.dataset.id;
  // 바다는 지도 종류와 무관한 별도 레이어라 색도 따로 기억한다
  if (node.dataset.sea) {
    if (erase) delete S.seaFills[id];
    else S.seaFills[id] = activeColor;
    renderSea();
    return;
  }
  const F = fills();
  if (erase) delete F[id];
  else F[id] = activeColor;
  const f = F[id] || S.base;
  for (const { el: e } of zoneEls.get(id)) e.setAttribute('fill', f);
  // 서울 지도: 칠한 색을 한강 위 오버레이에도 반영(증분)
  if (isSeoul()) {
    const layer = $('#seoulPaintTop');
    if (layer) {
      let op = layer.querySelector('[data-id="' + id + '"]');
      if (erase) { if (op) op.remove(); }
      else {
        if (!op) { op = el('path', { d: node.getAttribute('d') || '', 'data-id': id, 'fill-opacity': 0.85, 'pointer-events': 'none' }); layer.append(op); }
        op.setAttribute('fill', f);
      }
    }
  }
}

// 화면 좌표 -> SVG 좌표. getScreenCTM이 작업창 줌(.fit의 CSS transform)까지 알아서 반영한다.
function toUser(e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
