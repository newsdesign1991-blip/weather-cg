/* [모듈] js/cg-setup.js — 해상도(RES)·CG 구성 창, 상태 표시(status·flash), 출력 폴더(IndexedDB·prepareOutput) */
'use strict';

// ===================== 추출 =====================
const RES = {
  // note = CG 구성 창 카드의 크기 옆 한마디(쓰임새)
  '2158x1214': { size: [2158, 1214], label: '터치 스크린', note: '터치 화면용' },
  '1920x1080': { size: [1920, 1080], label: '노말 CG', note: '기본 방송 화면' },
  // 노말 VF — 영상 위에 얹는 오버레이(오른쪽 귀퉁이, 작게). 캔버스는 1920x1080로 같고 배치만 따로 기억한다.
  // 최종은 알파 채널로 뽑아 편집 툴(AE)에서 영상에 합친다. (3번째 자리)
  '1920x1080-vf': { size: [1920, 1080], label: '노말 VF', note: '영상 위 투명 오버레이' },
  // 날씨 팀 전용 — 크기는 노말 CG와 같은 1920x1080이지만 배치는 따로 기억한다. 잘 안 쓰는 옵션이라 흐리게(dim), 맨 오른쪽.
  '1920x1080-team': { size: [1920, 1080], label: '날씨 팀', note: '팀 전용 배치', dim: 1 },
};
let pendingRes = null, pendingStyle = null;

function buildResBtns() {
  const w = $('#resBtns');
  w.textContent = '';
  for (const [k, v] of Object.entries(RES)) {
    // CG 구성 창의 선택 카드 — 이름 + 화면 크기(+ 쓰임새 한마디)
    const b = cgsCardBtn(k, v.label, `${v.size[0]} × ${v.size[1]}` + (v.note ? '\n' + v.note : ''));   // 크기 / 쓰임새 두 줄(white-space: pre-line)
    b.dataset.res = k;
    if (v.dim) b.classList.add('resDim');   // 잘 안 쓰는 옵션(날씨 팀) — 흐리게
    b._apply = () => {
      if (S.res === k) return;
      if (animT != null) { animStop(); animOff(); }   // 애니 프리뷰 중이었으면 종료 — VF 진입 슬라이드/페이드 잔재 제거
      const oldStart = animStart();   // 해상도별 기본 시작 시각(바꾼 뒤 타임라인 알림 줄용)
      pushUndo();
      S.res = k;
      const applied = applyPreset();
      // 노말 VF 기본값: 내가 직접 저장한 VF 배치가 아직 없으면 라벨 92%·산 70%로 시작(사용자 요청 기본값).
      // (배포 기본배치가 있어도, 내가 저장 전까진 이 값으로 시작 → 저장하면 그 값이 유지된다.)
      if (k === '1920x1080-vf') {
        if (!isTyphoon()) { S.labScale = 92; S.mtnScale = 70; }   // VF는 라벨 92%·산 70%(태풍 제외 — 저장값 존중)
        if (!applied && !S.cgLight) { S.bg = 'bgVfDark'; S.showBg = 1; }
        renderAll();
      } else if (!applied) renderAll();   // 배치가 없어도 다시 그린다 — VF에서 나올 때 VF 축소(#L_vfScale transform)·이동 핸들이 남지 않게
      buildBgBtns(); syncPanelFromState();   // 화면마다 배경 목록이 달라(VF 배경은 VF에서만) 다시 그리고 패널 동기화
      renderBg(); markResBtns();
      if (k === '1920x1080-vf' && S.legend && S.legend.on) ensureLegendInVfPanel();   // VF 범례가 패널 밖이면 안으로
      if (typeof tlNote === 'function') tlNote();   // 해상도마다 렌더 안내가 다르다
      updateFrameGuideLabel();                       // 프레임 가이드 라벨·비율도 새 해상도로
      if (typeof tlAfterResChange === 'function') tlAfterResChange(oldStart);   // 타임라인이 열려 있으면 막대·재생헤드 프레임 다시(B7) + 시작 시각 알림(B15)
      status(v.label);
    };
    b.onclick = () => {
      pendingRes = k;
      syncCgSetup();   // 카드 표시 + 두 가지 다 골랐으면 '선택 완료' 켜기
      cgsShowOtherPane('res');
    };
    w.append(b);
  }
  markResBtns();
}
const markResBtns = () =>
  document.querySelectorAll('#resBtns button').forEach((b) => {
    const on = b.dataset.res === pendingRes;
    b.classList.toggle('choicePending', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

// 고른 CG 종류·지도 종류를 실제로 적용(바뀐 것만 — 같으면 _apply·setStyle이 그냥 돌아온다).
// 되돌리기·배치 적용·VF 기본값 같은 안전장치는 원래 적용 경로(b._apply / setStyle)를 그대로 탄다.
function applyPendingRes() {
  if (!pendingRes) return;
  const b = document.querySelector(`#resBtns button[data-res="${pendingRes}"]`);
  if (!b || typeof b._apply !== 'function') return;
  b._apply();
  pendingRes = null;
  markResBtns();
  markStartStep('res');
}
function applyPendingStyle() {
  if (!pendingStyle) return;
  const style = pendingStyle;
  pendingStyle = null;
  setStyle(style);
  markStyleBtns();
  markStartStep('style');
}

// ===================== CG 구성 (CG 종류 + 지도 종류 고르기 창) =====================
// 화면에 보이는 이름은 '장면 설정'(2026-10-09 바꿈). 코드·주석은 옛 이름(cgSetup·CG 구성) 그대로 둔다.
// 맨 위 '장면 설정'·시작 화면 '장면 설정 열기'로 연다. 카드를 눌러도 바로 바뀌지 않고(pendingRes/pendingStyle),
// 둘 다 골라 '선택 완료'를 눌러야 적용된다. 닫기(X·Esc·바깥 클릭·취소)는 아무것도 안 바꾼다.
let _cgsOpener = null, _cgsResetT = 0;
function cgSetupIsOpen() { const ov = document.getElementById('cgSetupOv'); return !!(ov && ov.classList.contains('on')); }
function startScreenOn() { const ov = document.getElementById('startOverlay'); return !!(ov && ov.classList.contains('on')); }
// 좁은 창(900px 이하) — 두 판이 좌우가 아니라 위아래로 쌓인다(CSS @media 와 같은 기준)
function cgsStacked() { return window.matchMedia('(max-width: 900px)').matches; }
// 카드 표시·판 머리의 '고른 것'·아래 요약·선택 완료 버튼을 지금 pending 값에 맞춘다
function syncCgSetup() {
  markResBtns(); markStyleBtns();
  const rl = pendingRes && RES[pendingRes] ? RES[pendingRes].label : '';
  const sl = pendingStyle && MAP.styles[pendingStyle] ? MAP.styles[pendingStyle].label : '';
  const ok = !!(rl && sl);
  const done = $('#cgsDone'); if (done) done.disabled = !ok;
  const pick = (id, txt) => { const el = $(id); if (!el) return; el.textContent = txt || '고르세요'; el.classList.toggle('on', !!txt); };
  pick('#cgsResPick', rl); pick('#cgsStylePick', sl);
  // 시작 화면 단계 알약도 창에서 고르는 대로 체크(적용 전 진행 표시) — 닫으면(고른 것 버림) 다시 비워진다
  if (startScreenOn()) document.querySelectorAll('#startOverlay .startStep').forEach((s) => s.classList.toggle('picked', s.dataset.step === 'res' ? !!rl : !!sl));
  const sum = $('#cgsSummary'); if (!sum) return;
  sum.textContent = '';
  // 안내 방향은 배치에 맞춘다 — 넓은 창 = 왼쪽(CG 종류)·오른쪽(지도 종류), 좁은 창 = 위·아래
  const st = cgsStacked();
  if (!ok) { sum.textContent = !rl && !sl ? 'CG 종류와 지도 종류를 모두 골라 주세요' : (!rl ? `${st ? '위' : '왼쪽'}에서 CG 종류도 골라 주세요` : `${st ? '아래' : '오른쪽'}에서 지도 종류도 골라 주세요`); return; }
  const b = document.createElement('b'); b.textContent = `${rl} · ${sl}`;
  const same = pendingRes === S.res && pendingStyle === S.style;
  sum.append(b, document.createTextNode(startScreenOn() ? ' — 이 구성으로 제작을 시작합니다' : (same ? ' — 지금과 같아요' : ' — 선택 완료를 누르면 바뀝니다')));
}
function openCgSetup() {
  const ov = $('#cgSetupOv'); if (!ov) return;
  if (_closeMenu) _closeMenu();   // 열려 있던 드롭다운(프로젝트·추출)은 닫는다
  clearTimeout(_cgsResetT);
  // 작업 중이면 지금 CG 종류·지도 종류가 미리 골라져 있다. 시작 화면이면 둘 다 새로 고른다.
  const fresh = startScreenOn();
  pendingRes = fresh ? null : S.res;
  pendingStyle = fresh ? null : S.style;
  syncStyleUse(); syncCgSetup();
  if (!ov.classList.contains('on')) _cgsOpener = document.activeElement;
  ov.classList.add('on'); ov.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('cgsOpen');   // 데스크톱: 막 아래 제목줄을 창 끌기 영역에서 뺀다(바깥 클릭 = 취소가 되게)
  $('#cgsToast')?.classList.remove('on');
  const tb = $('#cgSetupBtn'); if (tb) tb.classList.add('on');
  setTimeout(() => { if (!cgSetupIsOpen()) return; const f = ov.querySelector('.cgsCard.choicePending') || ov.querySelector('.cgSetupCard'); try { f.focus({ preventScroll: true }); } catch (e) {} }, 40);
}
function closeCgSetup() {
  const ov = $('#cgSetupOv'); if (!ov || !ov.classList.contains('on')) return;
  ov.classList.remove('on'); ov.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('cgsOpen');   // 데스크톱: 제목줄 창 끌기 다시 켬
  const tb = $('#cgSetupBtn'); if (tb) tb.classList.remove('on');
  // 고르던 것은 버린다 — 닫히는 애니메이션(블러+스케일) 동안엔 그대로 보이게 끝난 뒤에 비운다
  clearTimeout(_cgsResetT);
  _cgsResetT = setTimeout(() => { if (!cgSetupIsOpen()) { pendingRes = null; pendingStyle = null; syncCgSetup(); } }, 360);
  const back = _cgsOpener; _cgsOpener = null;
  if (back && back.focus && document.contains(back) && !$('#tourWrap')?.classList.contains('on')) { try { back.focus({ preventScroll: true }); } catch (e) {} }
}
// '선택 완료' — CG 종류 먼저(화면 크기·배치), 그다음 지도 종류. 시작 화면이면 두 단계가 다 끝나 제작이 시작된다.
function applyCgSetup() {
  if (!pendingRes || !pendingStyle) return;
  const res = pendingRes, style = pendingStyle;
  const top0 = undoStack[undoStack.length - 1];
  applyPendingRes();
  const first = undoStack[undoStack.length - 1] !== top0 ? undoStack[undoStack.length - 1] : null;   // CG 종류가 바뀌며 쌓인 '적용 전' 스냅샷
  pendingStyle = style; applyPendingStyle();
  // 선택 완료 한 번 = 되돌리기 한 칸. 지도 종류 전환(setStyle)이 또 쌓은 중간 상태(새 CG 종류 + 옛 지도 종류)는
  // 사용자가 고른 적 없는 조합이라 버린다 → Ctrl+Z 한 번이면 창을 열기 전 구성으로 돌아간다. (80칸 넘침 shift 에도 안전하게 참조로 찾는다)
  if (first) { const i = undoStack.lastIndexOf(first); if (i >= 0 && i < undoStack.length - 1) { undoStack.length = i + 1; updateUndoBtns(); } }
  pendingRes = res; pendingStyle = style;   // 닫히는 동안 고른 카드가 그대로 보이게(닫힌 뒤 비움)
  markResBtns(); markStyleBtns();
  closeCgSetup();
}
// 좁은 창(위아래로 쌓임)에서 한쪽 판을 고르면 아직 안 고른 다른 판을 본문 스크롤로 화면 안에 올려 준다(반대 순서도 같게).
// picked = 방금 고른 판('res' | 'style'). 넓은 창(좌우 2판)은 둘 다 보이므로 아무것도 안 한다.
function cgsShowOtherPane(picked) {
  if (!cgSetupIsOpen() || !cgsStacked()) return;
  if (picked === 'res' ? pendingStyle : pendingRes) return;   // 다른 쪽도 이미 골랐으면 그대로
  const pane = $(picked === 'res' ? '.cgsPaneStyle' : '.cgsPaneRes'), body = pane && pane.closest('.cgsBody');
  if (!body) return;
  const b = body.getBoundingClientRect(), p = pane.getBoundingClientRect(), pad = 14;
  let d = 0;
  if (p.bottom > b.bottom + 1) d = (p.height + pad * 2 > b.height) ? p.top - b.top - pad : p.bottom - b.bottom + pad;   // 아래에 걸쳐 있음 — 판 전체(길면 머리부터)가 보이게
  else if (p.top < b.top - 1) d = p.top - b.top - pad;                                                              // 위로 지나감 — 머리가 보이게
  if (d) body.scrollBy({ top: d, behavior: 'smooth' });
}
// 창 안 알림 — 창이 떠 있으면 작업 화면의 #status 가 막 뒤에 가려지므로 창 아래쪽 토스트로. 닫혀 있으면 평소 status.
let _cgsToastT = 0;
function cgsStatus(m) {
  const t = $('#cgsToast');
  if (!t || !cgSetupIsOpen()) { status(m); return; }
  t.textContent = m;
  t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');   // 연달아 와도 다시 떠오르게
  clearTimeout(_cgsToastT);
  _cgsToastT = setTimeout(() => t.classList.remove('on'), 2800);
}
function setupCgSetup() {
  const ov = $('#cgSetupOv'); if (!ov) return;
  $('#cgSetupBtn').onclick = (e) => { e.stopPropagation(); if (cgSetupIsOpen()) closeCgSetup(); else openCgSetup(); };
  $('#cgsX').onclick = closeCgSetup;
  $('#cgsCancel').onclick = closeCgSetup;
  $('#cgsDone').onclick = applyCgSetup;
  // 바깥(어두운 막) 클릭 = 취소 — 단, 누른 곳과 뗀 곳이 둘 다 막일 때만. 카드를 누른 채 막으로 미끄러져 떼면
  // 크로미움이 click 을 공통 조상(막)에 보내는데, 그걸로 고르던 것이 날아가지 않게.
  let downOnOv = false;
  ov.addEventListener('pointerdown', (e) => { downOnOv = e.target === ov; });
  ov.addEventListener('click', (e) => { if (e.target === ov && downOnOv) closeCgSetup(); downOnOv = false; });
  // 위에 떠 있는 다른 창 — 닫히는 중(.popClosing, .34초)인 창은 뺀다(안 그러면 그 사이 Esc 가 그냥 사라지고 Tab 가두기도 꺼진다)
  const aboveCgs = () => $('#tourWrap')?.classList.contains('on') || document.querySelector('#tossOv:not(.popClosing)') || $('#confirmOverlay.on:not(.popClosing)') || $('#slotOverlay.on:not(.popClosing)');
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !cgSetupIsOpen()) return;
    // 위에 뜬 둘러보기·확인창·토스 모달이 먼저 Esc를 받는다
    if (aboveCgs()) return;
    e.preventDefault(); closeCgSetup();
  });
  // 포커스 가두기 — 창이 떠 있는 동안 Tab / Shift+Tab 은 창 안에서만 돈다(뒤의 사이드바·제목줄 버튼으로 새어 Enter로 눌리지 않게)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !cgSetupIsOpen() || aboveCgs()) return;
    popTrapTab(ov.querySelector('.cgSetupCard'), e);
  });
  // 창이 떠 있는 채 창 크기가 900px 를 넘나들면(좌우 ↔ 위아래) 안내 방향도 다시 맞춘다
  window.matchMedia('(max-width: 900px)').addEventListener('change', () => { if (cgSetupIsOpen()) syncCgSetup(); });
  // 시작 화면 단계 알약(CG 종류 선택 · 지도 종류 선택)도 누르면 CG 구성 창을 연다(버튼처럼 보이는데 안 눌리지 않게)
  document.querySelectorAll('#startOverlay .startStep').forEach((s) => { s.title = '장면 설정 열기'; s.onclick = openCgSetup; });
  syncCgSetup();
}

// 평소엔 비어 있고, 알릴 게 있을 때만 잠깐 떴다가 사라진다.
// hold=true면 다음 알림이 올 때까지 남긴다 (추출 중 같은 진행 표시용)
// tone: 'ok'(초록 점) | 'warn'(주황 점, 확인 필요) | 'err'(빨간 점) — 정상/오류를 글자만이 아니라 색으로도 구분. 안 주면 예전과 똑같다.
let statusT = 0;
function status(m, hold, tone) {
  const n = $('#status');
  n.textContent = m;
  if (m && (tone === 'ok' || tone === 'warn' || tone === 'err')) n.dataset.tone = tone; else delete n.dataset.tone;
  n.style.opacity = m ? '1' : '0';
  clearTimeout(statusT);
  if (m && !hold) statusT = setTimeout(() => { n.style.opacity = '0'; }, 2600);
}
// 중요한 안내 — 화면 중앙 위에서 빨간색으로 한 번 반짝
function flash(m) {
  const n = $('#flashMsg');
  n.textContent = m;
  n.classList.remove('show'); void n.offsetWidth; n.classList.add('show');   // 애니메이션 재시작
}
// 렌더/추출 완료 — 화면 정중앙에 파란 카드('완료' 등)가 떴다가 사라진다
function flashDone(m) {
  const n = $('#doneMsg');
  // Face ID 성공 모션: 원형 링(doneCircle)이 그려지고 → 체크(doneCheck)가 그어지고 → 아이콘 스프링 바운스.
  n.innerHTML =
    '<svg class="doneIcon" viewBox="0 0 52 52" width="34" height="34" aria-hidden="true">'
    + '<circle class="doneCircle" cx="26" cy="26" r="23" fill="none" stroke="#fff" stroke-width="3"/>'
    + '<path class="doneCheck" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" d="M15 27 l7 7 l15 -16"/>'
    + '</svg><span></span>';
  n.querySelector('span').textContent = m || '완료';
  n.classList.remove('show'); void n.offsetWidth; n.classList.add('show');   // 애니메이션 재시작
}

// 오늘 날짜 태그 — 파일명 기본값(예: 0723). 월·일 2자리.
function dateTag() { const d = new Date(), p = (x) => String(x).padStart(2, '0'); return p(d.getMonth() + 1) + p(d.getDate()); }

// ── 렌더/추출 저장 폴더(예: R:\Upload) ──
// 브라우저는 임의 절대경로를 코드로 못 박는다. 대신 폴더 핸들을 한 번 고르게 해 IndexedDB에 저장하고,
// 이후엔 그 폴더로 대화상자 없이 바로 저장한다. (권한은 세션마다 브라우저가 한 번 확인)
let _wcgDB;
function wcgDB() {
  return _wcgDB || (_wcgDB = new Promise((res, rej) => {
    const r = indexedDB.open('wcg', 1);
    r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) { /* 이미 있음 */ } };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
async function idbGet(k) { try { const db = await wcgDB(); return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function idbSet(k, v) { try { const db = await wcgDB(); await new Promise((res) => { const q = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); q.onsuccess = () => res(); q.onerror = () => res(); }); } catch (e) { /* 무시 */ } }
// 이미 지정해 둔 저장 폴더 핸들만 가져온다(폴더 선택창은 안 띄운다). 권한 필요 시 1회 허용만.
async function getOutDir() {
  try {
    const h = await idbGet('outDir');
    if (h) {
      let p = await h.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted') p = await h.requestPermission({ mode: 'readwrite' });
      if (p === 'granted') return h;
    }
  } catch (e) { /* 무시 → null */ }
  return null;
}
// '출력 폴더 지정' 버튼에서만 폴더 선택창을 띄운다(사용자가 명시적으로 누를 때).
async function pickOutDir() {
  try { if (!window.showDirectoryPicker) return null; const h = await window.showDirectoryPicker({ id: 'cgOut', mode: 'readwrite' }); await idbSet('outDir', h); return h; }
  catch (e) { return null; }   // 취소·시스템폴더 차단 등
}
async function clearOutDir() { await idbSet('outDir', null); }
// 타임라인 '저장 폴더'(영상 출력 폴더) 버튼 라벨을 현재 상태로 갱신 — 글자 span(.tlDirLbl)만 바꾼다(폴더 아이콘 svg 유지).
// 이미지로 추출은 이 폴더를 쓰지 않는다(팝업에서 따로 폴더를 고른다 — js/export-dialog.js).
async function updateOutDirBtn() {
  const b = $('#exSetDir'); if (!b) return;
  let h = null; try { h = await idbGet('outDir'); } catch (e) { /* 무시 */ }
  const lbl = b.querySelector('.tlDirLbl') || b;
  if (h) { lbl.textContent = '저장 폴더: ' + h.name; b.classList.add('on'); b.title = '영상 저장 폴더: ' + h.name + ' — 클릭하면 해제(저장할 때 위치를 다시 고릅니다)'; }
  else { lbl.textContent = '저장 폴더'; b.classList.remove('on'); b.title = '영상(MP4·PNG 시퀀스·MXF·MOV)을 정해둔 폴더로 바로 저장(예: R:\\Upload). 안 정하면 저장할 때 위치를 고릅니다.'; }
}
// 폴더 안에서 안 겹치는 이름 (0723.mov, 0723-2.mov …)
async function uniqueName(dir, base, ext) {
  let name = base + '.' + ext, i = 2;
  for (; ;) { try { await dir.getFileHandle(name); name = base + '-' + i + '.' + ext; i++; } catch (e) { return name; } }
}
// 저장 대상 준비(렌더 전에 호출) — 1) 저장 폴더 바로쓰기, 2) 저장 대화상자, 3) 다운로드.
// 반환 {name, write(bytes)} 또는 null(사용자 취소).
async function prepareOutput(base, ext, mime, label) {
  const dir = await getOutDir();   // 지정해 둔 폴더가 있을 때만(폴더 선택창은 안 띄움)
  if (dir) {
    const name = await uniqueName(dir, base, ext);
    return { name, write: async (bytes) => { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(bytes); await w.close(); } };
  }
  if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({ id: 'cgOut', suggestedName: base + '.' + ext, types: [{ description: label || '파일', accept: { [mime || 'application/octet-stream']: ['.' + ext] } }] });
      return { name: h.name, write: async (bytes) => { const w = await h.createWritable(); await w.write(bytes); await w.close(); } };
    } catch (e) { if (e.name === 'AbortError') return null; }
  }
  return { name: base + '.' + ext + ' (다운로드 폴더)', write: async (bytes) => download(new Blob([bytes], { type: mime || 'application/octet-stream' }), base + '.' + ext) };
}
