/* [모듈] js/busy-fx.js — 작업 중·도착 효과(fxBusy·fxRun·fxArrive·fxProgress): 흐르는 그라디언트, 버튼 진행 표시, 빛 훑는 자리표시 막대, 도착 떠오름 */
'use strict';

// ===================== 작업 중·도착 효과 =====================
// 데이터를 불러오거나 렌더하는 동안 '일하는 중'이 보이게, 끝나면 '들어왔다'가 보이게 한다.
// 뉴스 플레이어(WPF) 검수 버튼의 ShowThinking(카드 위를 떠도는 부드러운 그라디언트)·AddPlaceholderLines(빛이 훑는 회색 막대)·
// RevealLines(결과가 위에서부터 차례로 떠오름)를 웹으로 옮겼다. 모양·움직임 값은 css/busy-fx.css.
//  - fxBusy(대상, 켜기, opts): 대상 = 요소·선택자 글자·배열·NodeList(섞어도 됨, null 은 건너뜀). 요소 종류마다 효과가 다르다:
//      섹션(.sec)·그 밖 상자 → 흐르는 그라디언트(.fx-glow) / 제목줄 버튼 → 색 띠가 흐름(.fx-tb) / 그 밖 버튼 → 작은 흐름 + 비활성(.fx-btn)
//      opts.lines 를 준 상자(결과 목록 자리) → 바로 뒤에 빛 훑는 회색 막대 자리표시(.fx-ph), 옛 내용은 끝날 때까지 숨김
//    같은 요소를 여러 작업이 켜면 센다 — 마지막 작업이 끝나야 꺼진다(겹친 불러오기). 켜지 않은 요소를 끄면 아무 일도 안 한다.
//    opts: lines(자리표시 막대 수) · disable:false(버튼을 비활성으로 안 바꿈 — 부르는 쪽이 disabled 를 따로 다룰 때) ·
//          hide:false(자리표시 동안 옛 목록도 그대로 보임) · maxMs(안전 해제 — 그 시간이 지나면 강제로 끔. 응답 없는 네트워크 대비)
//  - fxRun(대상, fn, opts): 켜고 fn()을 기다린 뒤 성공·실패(throw)와 상관없이 반드시 끈다(try/finally). 반환 = fn 의 결과(실패면 그대로 throw).
//    opts.arrive: 성공(결과가 false·null 이 아님) 때 줄 도착 효과 대상 — 함수면 결과를 받아 대상을 돌려준다. 나머지 opts 는 fxBusy 로.
//  - fxArrive(대상): 섹션 = 머리에 한 번 빛 / 버튼 = 한 번 훑기 / 그 밖 요소 = 위에서부터 80ms 간격으로 떠오름
//    (투명→불투명 .34초 + 아래 14px→제자리 .42초, 3차 감속). 떠오름은 요소의 transform 을 건드리지 않게 translate 속성으로 한다.
//  - fxProgress(대상, 0~1): 켜진 제목줄 버튼 아래 얇은 진행 막대(대상이 없으면 지금 켜진 제목줄 버튼 전부). null 이면 막대를 치운다.
//  - fxSec(이름): 그 섹션 요소(사이드바·떼어낸 창·제목줄 드롭다운 어디에 있든). fxRows(상자): 상자의 자식 요소들(도착 효과용).
//  - fxClear(대상): 센 횟수와 상관없이 바로 끈다(작업을 통째로 버릴 때).
// 움직임 줄이기 설정이면 흐름·훑기·떠오름 대신 은은한 색·짧은 페이드만 쓴다(CSS @media + fxReduced).
// 움직임은 transform·opacity 만 바꾼다(레이아웃 없음 — 합성기에서 돌아 렌더 중 메인 스레드를 쓰지 않는다). 끄면 가상 요소째 사라져 애니메이션도 멈춘다.
// 연결된 곳: 특보 불러오기(fetchWrn), 예보 읽기(applyFct — 도착만), 이미지 추출(doExport), PNG 시퀀스·MP4·MXF/MOV(exportPngSeq·bakeMp4·wnsRender),
//   AE로 보내기(sendToAE), 프로젝트 저장·열기·최근 파일, 설정 가져오기, 기본값 굽기, 렌더 진행률(exportProgress → fxProgress).
//   태풍(js/typhoon-api.js)·통보문(js/bulletin.js)은 아직 안 붙였다 — 붙일 때도 켠 함수의 finally에서 끄는 짝을 지킨다(tests/busy-fx.test.cjs '연결').
const _fxSt = new WeakMap();   // 요소 → { n: 켠 횟수, kind, dis: 우리가 비활성으로 바꿨나, ph: 자리표시 요소, outT·maxT·arrT: 타이머 }
const FX_PH_W = [92, 68, 84, 50, 76, 60];   // 자리표시 막대 폭(%) — 검수 화면과 같은 들쭉날쭉
const FX_OUT_MS = 500;        // 흐름이 사라지는 시간(뉴스 플레이어 500ms) — css/busy-fx.css 의 fxOut .5s 와 같게
const FX_ARRIVE_MS = 1100;    // 도착 빛(섹션 머리·버튼)이 끝나는 시간 — css 의 fxArriveSweep .9s 보다 조금 길게
const FX_STAGGER_MAX = 10;    // 떠오름 차례 간격(80ms)은 11번째부터 더 늘리지 않는다(긴 목록이 늦게까지 안 보이지 않게)
const fxReduced = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
function fxSec(name) { return document.querySelector(`.sec[data-sec="${name}"]`); }
function fxRows(box) { return box && box.children ? [...box.children].filter((n) => !n.classList.contains('fx-ph')) : []; }
// 대상 → 요소 배열(중복·null 제거). 요소인지 먼저 본다 — <select>·<form> 도 length 가 있어 목록으로 오인하지 않게.
function fxEls(target) {
  const out = [];
  const add = (t) => {
    if (!t) return;
    if (t.nodeType === 1) { if (!out.includes(t)) out.push(t); return; }
    if (typeof t === 'string') { add(document.querySelector(t)); return; }
    if (typeof t !== 'function' && typeof t.length === 'number') for (const x of Array.from(t)) add(x);
  };
  add(target);
  return out;
}
function fxKind(el, opts) {
  if (el.classList.contains('sec')) return 'glow';
  if (el.tagName === 'BUTTON' || el.tagName === 'A') return el.closest && el.closest('#titlebar') ? 'tb' : 'btn';
  return opts && opts.lines ? 'ph' : 'glow';
}
function fxBusy(target, on = true, opts) {
  opts = opts || {};
  for (const el of fxEls(target)) {
    let st = _fxSt.get(el);
    if (on) {
      if (!st) _fxSt.set(el, (st = { n: 0 }));
      if (st.n++ === 0) fxStart(el, st, opts);
      if (opts.maxMs > 0) { clearTimeout(st.maxT); st.maxT = setTimeout(() => fxClear(el), opts.maxMs); }
    } else if (st && st.n > 0 && --st.n === 0) fxStop(el, st);
  }
}
function fxStart(el, st, opts) {
  if (st.outT) { clearTimeout(st.outT); st.outT = 0; }   // 사라지는 중에 다시 켜짐 — 흐름은 그대로 이어서
  el.classList.remove('fx-out');
  const kind = st.kind = fxKind(el, opts);
  el.setAttribute('aria-busy', 'true');
  if (kind === 'ph') {
    const ph = st.ph = document.createElement('div');
    ph.className = 'fx-ph'; ph.setAttribute('aria-hidden', 'true');
    const n = Math.max(1, Math.min(12, Math.round(+opts.lines) || FX_PH_W.length));
    for (let i = 0; i < n; i++) { const b = document.createElement('i'); b.style.width = FX_PH_W[i % FX_PH_W.length] + '%'; ph.append(b); }
    el.after(ph);   // 상자 '안'이 아니라 바로 뒤 — 목록을 다시 그리는 코드(textContent='')가 자리표시를 지우지 않게
    if (opts.hide !== false) el.classList.add('fx-ph-hide');
    return;
  }
  if (kind === 'btn' && opts.disable !== false && !el.disabled) {
    st.refocus = document.activeElement === el;   // 비활성으로 바꾸면 포커스가 빠진다 — 끝날 때 키보드 자리를 돌려주려고 기억
    el.disabled = true; st.dis = true;
  }
  el.classList.add('fx-' + kind, 'fx-on');
}
function fxStop(el, st) {
  if (st.maxT) { clearTimeout(st.maxT); st.maxT = 0; }
  el.removeAttribute('aria-busy');
  if (st.ph) { st.ph.remove(); st.ph = null; }
  el.classList.remove('fx-ph-hide');
  if (st.dis) {
    st.dis = false; el.disabled = false;
    // 누른 버튼에 있던 포커스를 되돌린다 — 그사이 사용자가 다른 곳으로 옮겼으면(body 아닌 곳) 그대로 둔다
    if (st.refocus && el.isConnected && (!document.activeElement || document.activeElement === document.body)) { try { el.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
    st.refocus = false;
  }
  if (!el.classList.contains('fx-on')) return;
  el.classList.remove('fx-on', 'fx-has-p');
  el.style.removeProperty('--fx-p');
  const kind = st.kind;
  if (kind === 'btn' || fxReduced()) { el.classList.remove('fx-' + kind); return; }
  el.classList.add('fx-out');   // 흐름은 그대로 두고 .5초 동안 옅어진다(뉴스 플레이어처럼) — 그 뒤 가상 요소째 치운다
  st.outT = setTimeout(() => { st.outT = 0; if (!st.n) el.classList.remove('fx-out', 'fx-' + kind); }, FX_OUT_MS);
}
function fxClear(target) {
  for (const el of fxEls(target)) { const st = _fxSt.get(el); if (st && st.n > 0) { st.n = 0; fxStop(el, st); } }
}
async function fxRun(target, fn, opts) {
  opts = opts || {};
  fxBusy(target, true, opts);
  let res, ok = false;
  try {
    res = await fn();
    ok = res !== false && res !== null;
    return res;
  } finally {
    fxBusy(target, false);
    if (ok && opts.arrive) { try { fxArrive(typeof opts.arrive === 'function' ? opts.arrive(res) : opts.arrive); } catch (e) { /* 효과가 작업 결과를 바꾸지 않게 */ } }
  }
}
// 섹션 머리·버튼에 한 번 빛(.fx-arrive) — 이미 빛나는 중이면 처음부터 다시
function fxFlash(el) {
  let st = _fxSt.get(el);
  if (!st) _fxSt.set(el, (st = { n: 0 }));
  clearTimeout(st.arrT);
  if (el.classList.contains('fx-arrive')) { el.classList.remove('fx-arrive'); void el.offsetWidth; }   // 애니메이션 재시작
  el.classList.add('fx-arrive');
  st.arrT = setTimeout(() => el.classList.remove('fx-arrive'), FX_ARRIVE_MS);
}
function fxArrive(target) {
  const reduce = fxReduced();
  const ease = 'cubic-bezier(.33, 1, .68, 1)';   // 3차 감속(뉴스 플레이어 CubicEase EaseOut)
  let k = 0;
  for (const el of fxEls(target)) {
    if (el.classList.contains('sec') || el.tagName === 'BUTTON' || el.tagName === 'A') { fxFlash(el); continue; }
    if (typeof el.animate !== 'function') continue;
    if (reduce) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); continue; }
    const delay = Math.min(k++, FX_STAGGER_MAX) * 80;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 340, delay, easing: ease, fill: 'backwards' });
    el.animate([{ translate: '0 14px' }, { translate: '0 0' }], { duration: 420, delay, easing: ease, fill: 'backwards' });
  }
}
function fxProgress(target, frac) {
  const els = target ? fxEls(target) : [...document.querySelectorAll('.fx-tb.fx-on')];
  for (const el of els) {
    if (frac == null || !Number.isFinite(+frac)) { el.classList.remove('fx-has-p'); el.style.removeProperty('--fx-p'); continue; }
    el.style.setProperty('--fx-p', String(Math.max(0, Math.min(1, +frac))));
    el.classList.add('fx-has-p');
  }
}
