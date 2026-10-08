/* [모듈] js/export-dialog.js — '이미지로 추출' 팝업(CG 구성 모양: 묶음 3판·아이콘 카드·빠른 선택·고른 것 기억)과 저장(폴더 고르기 → 오늘날짜_날씨CG메이커 폴더 → 카드 이름 그대로 PNG, 폴더 고르기를 못 쓰면 ZIP) */
'use strict';

// ===================== 이미지로 추출 팝업 =====================
// 제목줄 '이미지로 추출'(#exportBtn)을 누르면 CG 구성과 같은 모양의 팝업(#exportOv — index.html에 한 번만 만들어 두고 class 'on'으로 연다)이 뜬다.
// 카드(항목)를 여러 개 골라 [렌더] 한 번 → 폴더 고르기(지난번 폴더에서 시작) → 그 안에 '20261008_날씨CG메이커' 폴더 → '색칠만.png'처럼
// 카드 이름 그대로 저장. 항목 정의·장 목록·굽기는 js/export-blobs.js(EXPORT_TARGETS·exportPlan·exportBake).
// 이 지도에 없는 항목은 흐리게 두고 까닭을 한 줄 설명에(카드 자리가 지도마다 바뀌지 않게). 고른 것은 이 PC에 기억(localStorage — 작업 S와 무관).
// 영상 렌더 출력 폴더('outDir'·prepareOutput)는 쓰지 않는다 — 이미지 폴더는 따로 기억('imgDir').

// 카드 아이콘(24×24 선 아이콘 — CG 구성 카드와 같은 틀). 이모지 금지.
const EXPORT_ICON = {
  full: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M9 20.5h6M12 17v3.5M5.6 7.8h4.6M5.6 10.4h2.6"/><path d="M13.2 9.4c1.3-1.7 3.5-1.8 4.4-.4.8 1.2.2 2.6-1 3.2-1.4.7-2 1.6-3.4 1.1-1.1-.5-.9-2.5 0-3.9z" fill="currentColor" stroke="none" opacity=".6"/>',
  bgtext: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16.6l4.6-3.6 3.6 2.6 2.9-1.9 6.9 4.6"/><path d="M8.6 7.8h6.8M12 7.8v4.4" stroke-width="2"/>',
  map: '<path d="M3.5 6.2l5.3-2.2 6.4 2.2 5.3-2.2v13.8l-5.3 2.2-6.4-2.2-5.3 2.2z"/><path d="M8.8 4v13.8M15.2 6.2V20M3.5 11.6l5.3-1.6 6.4 2 5.3-1.8"/>',
  bg: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15.6l5-4 4 3 3-2 6 4.4"/><circle cx="16" cy="8.6" r="1.7"/>',
  base: '<path d="M9 3.6c2-.5 3.4.8 4.3 2.2.9 1.4 2.7 1.7 3.3 3.3.6 1.8-.6 2.9-.2 4.6.4 1.8 1.8 2.7 1 4.3-.9 1.6-3.3 1.2-4.9 1.9-1.6.7-2.8 1.5-4.3.5-1.5-1.1-.6-3.1-1.2-4.8-.6-1.5-2.1-2.4-1.8-4.2.3-1.8 2.2-2.2 2.4-4 .1-1.6.4-3.4 1.4-3.8z" fill="currentColor" fill-opacity=".24" stroke-linejoin="round"/>',
  fills: '<path d="M5 11.5L11.5 5l7 7-6.5 6.5a1.4 1.4 0 01-2 0L5 13.5a1.4 1.4 0 010-2zM5.5 12.5h12.5" stroke-linejoin="round"/><path d="M19.6 15.2c.9 1.3 1.4 2.2 1.4 2.9a1.4 1.4 0 01-2.8 0c0-.7.5-1.6 1.4-2.9z" fill="currentColor"/>',
  lines: '<path d="M3.5 7.5l5-3 6 2.5 6-3M3.5 13l5.5-2 5 2.5 6.5-2.5M9 4.5v15M14.5 7v13M3.5 19.5l5.5-1.6 5.5 1.6 6-1.6" stroke-linejoin="round"/>',
  sidoline: '<path d="M4 18c2.5-1 3-4 5.5-5s4.5 1 6.5-1.5S18 6 20 5" stroke-width="2.6"/>',
  labels: '<path d="M4 5h16a1.5 1.5 0 011.5 1.5v8A1.5 1.5 0 0120 16h-6l-2 3-2-3H4a1.5 1.5 0 01-1.5-1.5v-8A1.5 1.5 0 014 5z" stroke-linejoin="round"/><path d="M7.5 10.5h9"/>',
  mtn: '<path d="M3 19l6.5-11 3.5 5.5 2-3 6 8.5z" stroke-linejoin="round"/><path d="M8 10.6l1.5 1.2 1.5-1.2"/>',
  legend: '<rect x="4" y="5.5" width="4" height="4" rx="1" fill="currentColor"/><rect x="4" y="14.5" width="4" height="4" rx="1" fill="currentColor" opacity=".55"/><path d="M11 7.5h9M11 16.5h7"/>',
  title: '<path d="M5 5.5h14M12 5.5v13M8.6 18.5h6.8" stroke-width="2"/>',
  vfbar: '<rect x="2.5" y="4" width="19" height="16" rx="2"/><rect x="2.5" y="4" width="19" height="5" rx="2" fill="currentColor" stroke="none"/>',
  typhoon: '<circle cx="7" cy="17" r="2.2"/><path d="M7 14.2c2.3 0 3.6 1.2 3.6 2.6M7 19.8c-2.3 0-3.6-1.2-3.6-2.6"/><path d="M10.2 13.6c2-2.5 4.2-4.1 7.2-5.5M17.6 8l2.9-2.9" stroke-dasharray="2 2.2"/>',
};
const exIconSvg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">${EXPORT_ICON[k] || ''}</svg>`;
const EX_PICK_KEY = 'wcg_export_pick';   // 고른 항목(이 PC의 편의 기능)
const EX_GROUP_BOX = { one: '#exChoicesOne', base: '#exChoicesBase', mark: '#exChoicesMark' };
let exPick = null;                       // 고른 항목 key Set
let _exOpener = null, _exLastDir = null, _exBusy = false, _exStop = false, _exToastT = 0, _exDone = null;

function exportIsOpen() { const ov = document.getElementById('exportOv'); return !!(ov && ov.classList.contains('on')); }
function exLoadPick() {
  let a = null;
  try { a = JSON.parse(localStorage.getItem(EX_PICK_KEY) || 'null'); } catch (e) { a = null; }
  const keys = new Set(EXPORT_TARGETS.map((t) => t.key));
  exPick = new Set(Array.isArray(a) ? a.filter((k) => keys.has(k)) : EXPORT_TARGETS.filter((t) => t.def).map((t) => t.key));
}
function exSavePick() { try { localStorage.setItem(EX_PICK_KEY, JSON.stringify([...exPick])); } catch (e) { /* 저장 못 해도 이번엔 그대로 */ } }
// 고른 것 중 지금 뽑을 수 있는 것(카드 순서)
const exPickedKeys = () => EXPORT_TARGETS.filter((t) => exPick.has(t.key) && !exportWhyNot(t.key)).map((t) => t.key);

// 폴더 이름 — 렌더를 누른 시각의 로컬 날짜(연월일 8자리, 탐색기에서 날짜순 정렬). 영상의 dateTag(월일 4자리)는 그대로.
function exportFolderName(d) {
  d = d || new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_날씨CG메이커`;
}

// 카드 하나 — CG 구성 카드(.cgsCard)와 같은 모양: 아이콘 칩 + 이름 + 한 줄 설명(+ 장수 배지)
function exCardBtn(t) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'cgsCard exItemCard'; b.dataset.key = t.key;
  b.setAttribute('aria-pressed', 'false');
  const ic = document.createElement('span'); ic.className = 'cgsCardIcon'; ic.innerHTML = exIconSvg(t.key);   // 정적 아이콘 문자열
  const tx = document.createElement('span'); tx.className = 'cgsCardTxt';
  const nm = document.createElement('b'); nm.textContent = t.name;
  const sm = document.createElement('small'); sm.textContent = t.sub;
  tx.append(nm, sm);
  const cnt = document.createElement('span'); cnt.className = 'exCount'; cnt.hidden = true;
  b.append(ic, tx, cnt);
  b.onclick = () => {
    if (_exBusy || b.getAttribute('aria-disabled') === 'true') return;
    if (exPick.has(t.key)) exPick.delete(t.key); else exPick.add(t.key);
    exSavePick(); _exDone = null; syncExport();
  };
  return b;
}
function buildExportCards() {
  for (const box of Object.values(EX_GROUP_BOX)) { const w = $(box); if (w) w.textContent = ''; }
  for (const t of EXPORT_TARGETS) { const w = $(EX_GROUP_BOX[t.group]); if (w) w.append(exCardBtn(t)); }
}
// 카드(쓸 수 있는지·고름·장수), 판 머리 '고름' 알약, 바닥 요약·렌더 버튼을 지금 상태에 맞춘다
function syncExport() {
  const ov = $('#exportOv'); if (!ov) return;
  if (!exPick) exLoadPick();
  const counts = {};
  for (const p of exportPlan(EXPORT_TARGETS.map((t) => t.key))) counts[p.key] = (counts[p.key] || 0) + 1;
  for (const b of ov.querySelectorAll('.exItemCard')) {
    const t = EXPORT_TARGETS.find((x) => x.key === b.dataset.key); if (!t) continue;
    const why = exportWhyNot(t.key), on = !why && exPick.has(t.key);
    b.classList.toggle('choicePending', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (why) { b.setAttribute('aria-disabled', 'true'); b.title = why; } else { b.removeAttribute('aria-disabled'); b.title = t.sub; }
    b.querySelector('small').textContent = why || t.sub;
    const cnt = b.querySelector('.exCount'), n = counts[t.key] || 0;
    cnt.hidden = !(t.key === 'labels' && n); cnt.textContent = n + '장';
  }
  for (const pane of ov.querySelectorAll('.cgsPane[data-group]')) {
    const ks = EXPORT_TARGETS.filter((t) => t.group === pane.dataset.group && !exportWhyNot(t.key)).map((t) => t.key);
    const n = ks.filter((k) => exPick.has(k)).length, pill = pane.querySelector('.exPanePick');
    if (!pill) continue;
    pill.textContent = n ? `${n}개 고름` : '모두 고르기';
    pill.classList.toggle('on', n > 0);
    pill.disabled = !ks.length || _exBusy;
    pill.title = n === ks.length && n ? '이 묶음 모두 풀기' : '이 묶음에서 뽑을 수 있는 것 모두 고르기';
  }
  const keys = exPickedKeys(), plan = exportPlan(keys);
  const btn = $('#exRender'); if (btn && !_exBusy) btn.disabled = !plan.length;
  const sum = $('#exSummary'); if (!sum || _exBusy) return;
  sum.textContent = ''; sum.classList.remove('exSumWarn');
  if (_exDone) { exSummaryDone(sum, _exDone); return; }
  if (!plan.length) { sum.textContent = '뽑을 것을 골라 주세요'; return; }
  const b = document.createElement('b'); b.textContent = `${keys.length}개 · ${plan.length}장`;
  const pickTxt = typeof window.showDirectoryPicker === 'function'
    ? ` — 렌더하면 폴더를 골라 그 안에 ${exportFolderName()} 폴더를 만들어요` + (_exLastDir && _exLastDir.name ? ` · 지난번: ${_exLastDir.name}` : '')
    : ` — 렌더하면 ${exportFolderName()}.zip 으로 받아요(풀면 같은 폴더)`;
  sum.append(b, document.createTextNode(pickTxt));
}
// 완료 표시(체크 아이콘 + 저장한 곳)
function exSummaryDone(sum, d) {
  sum.textContent = '';
  const ic = document.createElement('span'); ic.className = 'exSumIcon'; ic.setAttribute('aria-hidden', 'true');
  ic.innerHTML = d.ok
    ? '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.2" fill="currentColor"/><path d="M6.2 10.3l2.5 2.5 5.1-5.3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.2" fill="currentColor"/><path d="M10 5.8v5.2M10 13.6v.3" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
  sum.classList.toggle('exSumWarn', !d.ok);
  const b = document.createElement('b'); b.textContent = d.head;
  sum.append(ic, b, document.createTextNode(d.tail || ''));
}

function openExport() {
  const ov = $('#exportOv'); if (!ov) return;
  if (_closeMenu) _closeMenu();   // 열려 있던 드롭다운(프로젝트·설정)은 닫는다
  if (!exportIsOpen()) _exOpener = document.activeElement;
  if (!_exLastDir) idbGet('imgDir').then((h) => { if (h && !_exLastDir) { _exLastDir = h; if (exportIsOpen()) syncExport(); } });   // 지난번 폴더(폴더 창 시작 위치)
  _exDone = null;
  syncExport();
  ov.classList.add('on'); ov.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('exOpen');   // 데스크톱: 막 아래 제목줄을 창 끌기 영역에서 뺀다(바깥 클릭 = 닫기)
  $('#exToast')?.classList.remove('on');
  $('#exportBtn')?.classList.add('on');
  setTimeout(() => { if (!exportIsOpen()) return; try { ov.querySelector('.cgSetupCard').focus({ preventScroll: true }); } catch (e) {} }, 40);
}
function closeExport() {
  const ov = $('#exportOv'); if (!ov || !ov.classList.contains('on')) return;
  if (_exBusy) { exStopRequest(); return; }   // 굽는 중엔 닫지 않고 '중지'(지금 장까지 쓰고 멈춘다)
  ov.classList.remove('on'); ov.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('exOpen');
  $('#exportBtn')?.classList.remove('on');
  const back = _exOpener; _exOpener = null;
  if (back && back.focus && document.contains(back) && !$('#tourWrap')?.classList.contains('on')) { try { back.focus({ preventScroll: true }); } catch (e) {} }
}
function exStopRequest() {
  if (!_exBusy || _exStop) return;
  _exStop = true;
  const l = $('#exRender .exRenderLbl'); if (l) l.textContent = '멈추는 중…';
  exToast('지금 장까지 저장하고 멈춰요');
}
// 팝업 안 알림 — 팝업이 떠 있으면 막 뒤 #status 가 가려지므로 바닥 위 토스트로. opt.zip: [ZIP으로 받기] 버튼(폴더 창이 막혔을 때)
function exToast(m, opt) {
  const t = $('#exToast');
  if (!t || !exportIsOpen()) { status(m, true); return; }
  t.textContent = '';
  const s = document.createElement('span'); s.textContent = m; t.append(s);
  t.classList.toggle('hasAct', !!(opt && opt.zip));
  if (opt && opt.zip) {
    const z = document.createElement('button'); z.type = 'button'; z.className = 'exToastBtn'; z.textContent = 'ZIP으로 받기';
    z.onclick = () => { t.classList.remove('on'); renderExport({ zip: true }); };
    t.append(z);
  }
  t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
  clearTimeout(_exToastT);
  _exToastT = setTimeout(() => t.classList.remove('on'), opt && opt.zip ? 7000 : 3200);
}

// 정지 화면에서 굽기 — 타임라인 미리보기(재생 뒤 멈춤·끝까지 재생·스크럽)나 태풍 '애니메이션 확인'이 남긴 중간 프레임이
// 그대로 구워지지 않게(블라인드 베이스 지도가 모든 투명 항목에 섞이던 문제). 끝나면 타임라인이 열려 있던 시각으로 미리보기를 되살린다.
async function withStaticFrame(fn) {
  if (animPlaying) animStop();
  if (typhoonRaf) { cancelAnimationFrame(typhoonRaf); typhoonRaf = 0; }   // '애니메이션 확인' 루프
  const t = animT, tlOpen = !!$('#timeline')?.classList.contains('on');
  const dirty = t != null || !!document.getElementById('L_mapBase') || typhoonProg != null || typhoonCmpProg != null || typhoonLabelAnim != null;
  if (dirty) animOff();
  try { return await fn(); }
  finally { if (t != null && tlOpen) animSeek(t); }
}
// 폴더 고르기 — 지난번 폴더에서 시작. 지난번 핸들이 무효(지운 폴더 등 — TypeError·NotFoundError)일 때만 시작 위치 없이 한 번 더
// (같은 id라 브라우저가 기억한 곳). 취소·권한 거절·보안 오류는 그대로 던진다 — 폴더 창이 두 번 뜨지 않게.
async function exPickRoot(last) {
  const o = { id: 'wcgImgOut', mode: 'readwrite' };
  if (last) {
    try { return await window.showDirectoryPicker(Object.assign({}, o, { startIn: last })); }
    catch (e) { if (!e || (e.name !== 'TypeError' && e.name !== 'NotFoundError')) throw e; }
  }
  return await window.showDirectoryPicker(o);
}
// 파일 시스템 오류 → 짧은 한국어 까닭(영어 원문이 바닥 요약에 그대로 뜨지 않게)
function exErrText(e) {
  const m = {
    NotAllowedError: '이 폴더에 쓸 권한이 없어요', SecurityError: '보안 설정이 폴더 쓰기를 막았어요',
    TypeMismatchError: '같은 이름의 폴더가 있어요', NoModificationAllowedError: '다른 프로그램이 파일을 쓰고 있어요',
    InvalidModificationError: '다른 프로그램이 파일을 쓰고 있어요', QuotaExceededError: '저장 공간이 부족해요',
    NotFoundError: '폴더를 찾을 수 없어요(옮기거나 지웠나요?)', InvalidStateError: '폴더 상태가 바뀌었어요 — 다시 해 주세요',
  };
  return (e && m[e.name]) || (e && e.message) || String(e);
}
// 저장 대상 — 폴더(한 장씩 바로 쓰기) 또는 ZIP(끝에 한 번 내려받기, 안 이름 '폴더/파일.png' → 풀면 같은 폴더)
function exDirTarget(dir, rootName, folder) {
  return {
    label: `${rootName || '고른 폴더'} › ${folder}`,
    // 'file' = 같은 이름 파일, 'dir' = 같은 이름 폴더(덮어쓸 수 없다 — 그 장은 번호를 붙인다), false = 없음
    exists: async (name) => { try { await dir.getFileHandle(name); return 'file'; } catch (e) { return (e && e.name === 'TypeMismatchError') ? 'dir' : false; } },
    write: async (name, blob) => { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(blob); await w.close(); },
  };
}
function exZipTarget(folder) {
  const files = [];
  return {
    zip: true, label: `${folder}.zip (다운로드 폴더)`,
    exists: async () => false,
    write: async (name, blob) => { files.push({ name: `${folder}/${name}`, data: await blobBytes(blob) }); },
    finish: async () => { if (files.length) download(zipStore(files, new Date()), `${folder}.zip`); },
  };
}
// 같은 이름 파일이 이미 있을 때 한 번 묻기(D2) — 'over'(덮어쓰기) | 'number'(번호 붙여 따로) | null(취소)
function exAskOverwrite(names, folder) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    const m = tossModal({
      title: '같은 이름 파일이 있어요', sub: folder,
      bodyHTML: '<p class="exDupMsg"></p><p class="exDupNote">덮어쓰면 편집 툴(AE·프리미어)에 걸어 둔 파일도 새 그림으로 바뀌어요.</p>',
      footHTML: '<button class="tossBtn ghost" data-cancel>취소</button><button class="tossBtn ghost" data-num>번호 붙여 따로 저장</button><button class="tossBtn pri" data-over>덮어쓰기</button>',
      onClose: () => fin(null),
    });
    m.body.querySelector('.exDupMsg').textContent = `‘${names[0]}’${names.length > 1 ? ` 외 ${names.length - 1}개` : ''} 파일이 ‘${folder}’ 폴더에 이미 있어요.`;
    const on = (sel, v) => { m.foot.querySelector(sel).onclick = () => { fin(v); m.close(); }; };
    on('[data-over]', 'over'); on('[data-num]', 'number'); on('[data-cancel]', null);
    try { m.foot.querySelector('[data-over]').focus({ preventScroll: true }); } catch (e) {}
  });
}
// 번호 붙이기 — '색칠만 (2).png'(라벨 이름 규칙과 같은 ' (n)'). list = 번호를 붙일 장(기본 전부), all = 이번 렌더의 모든 장(이름 겹침 확인용)
async function exRenumber(list, target, all) {
  const taken = new Set((all || list).map((p) => p.file.toLowerCase()));
  for (const p of list) {
    if (!(await target.exists(p.file))) continue;
    taken.delete(p.file.toLowerCase());
    for (let i = 2; i < 1000; i++) {
      const nm = `${p.name} (${i})`, f = nm + '.png';
      if (taken.has(f.toLowerCase()) || await target.exists(f)) continue;
      p.name = nm; p.file = f; break;
    }
    taken.add(p.file.toLowerCase());
  }
}
// 굽는 중 표시 — 바닥 요약·렌더 버튼(중지 + 원형 진행)·제목줄 버튼 진행 막대
function exProgress(i, n, name) {
  const sum = $('#exSummary'); if (sum) { sum.classList.remove('exSumWarn'); sum.textContent = ''; const b = document.createElement('b'); b.textContent = `굽는 중 ${Math.min(i + 1, n)}/${n}`; sum.append(b, document.createTextNode(name ? ' — ' + name : '')); }
  const f = $('#exRender .exRingFill'); if (f) f.setAttribute('stroke-dasharray', `${Math.round(i / Math.max(1, n) * 100)} 100`);
  fxProgress('#exportBtn', i / Math.max(1, n));
}
function exSetBusy(on) {
  _exBusy = on;
  const btn = $('#exRender'), ov = $('#exportOv');
  if (ov) ov.classList.toggle('exBusy', on);
  if (btn) {
    btn.classList.toggle('busy', on); btn.disabled = false;
    const l = btn.querySelector('.exRenderLbl'); if (l) l.textContent = on ? '중지' : '렌더';
    btn.title = on ? '중지 — 지금 장까지 저장하고 멈춰요 (Esc)' : '고른 것을 렌더해 폴더에 저장 (Ctrl+Enter)';
    const f = btn.querySelector('.exRingFill'); if (f) f.setAttribute('stroke-dasharray', '0 100');
  }
}

// [렌더] — 폴더 고르기(클릭 직후 첫 await — 사용자 활성화 안에서 폴더 창) → 하위 폴더 → 겹침 확인 → 정지 화면에서 한 장씩 굽고 바로 쓰기.
// opt.zip: 폴더 창 없이 ZIP으로(막힌 폴더 안내의 'ZIP으로 받기'). 굽는 중 다시 누르면 중지.
async function renderExport(opt) {
  opt = opt || {};
  if (_exBusy) { exStopRequest(); return; }
  if (_exportingFrames) { exToast('영상 렌더가 끝난 뒤에 할 수 있어요'); return; }
  const plan = exportPlan(exPickedKeys());
  if (!plan.length) { exToast('뽑을 것을 골라 주세요'); return; }
  const folder = exportFolderName();
  let target = null;
  if (!opt.zip && typeof window.showDirectoryPicker === 'function') {
    let root = null;
    try { root = await exPickRoot(_exLastDir); }
    catch (e) {
      // 취소와 '막힌 폴더'(바탕화면·다운로드 자체 — 크롬이 막는다)는 둘 다 AbortError라 구별할 수 없다 → 안내 + ZIP 받기
      if (e && e.name === 'AbortError') { exToast('저장을 취소했어요 · 바탕화면·다운로드는 그 안의 폴더를 골라 주세요', { zip: true }); return; }
      // 권한 거절·보안 정책 등 — 말없이 ZIP을 내려받지 않고 까닭 + [ZIP으로 받기]
      exToast(`폴더를 열지 못했어요(${exErrText(e)}) — 다른 폴더를 고르거나 ZIP으로 받아 주세요`, { zip: true }); return;
    }
    if (root) {
      _exLastDir = root; idbSet('imgDir', root);   // 다음엔 여기서 시작(영상 출력 폴더 'outDir'와 따로)
      try { target = exDirTarget(await root.getDirectoryHandle(folder, { create: true }), root.name, folder); }
      catch (e) { exToast(`이 폴더에는 저장할 수 없어요(${exErrText(e)}) — 다른 폴더를 고르거나 ZIP으로 받아 주세요`, { zip: true }); return; }
    }
  }
  if (!target) target = exZipTarget(folder);
  const dup = [], dirClash = [];
  for (const p of plan) { const k = await target.exists(p.file); if (k) { dup.push(p.file); if (k === 'dir') dirClash.push(p); } }
  if (dup.length) {
    const how = await exAskOverwrite(dup, folder);
    if (!how) { exToast('저장을 취소했어요'); return; }
    if (how === 'number') await exRenumber(plan, target);
    else if (dirClash.length) await exRenumber(dirClash, target, plan);   // 같은 이름 '폴더'는 덮어쓸 수 없다 — 그 장만 번호
  }
  _exStop = false; _exDone = null;
  exSetBusy(true);
  // 작업 중 효과(js/busy-fx.js) — 제목줄 '이미지로 추출' 색 띠·팝업 본문 흐름. 렌더 버튼은 '중지'로 써야 해서 비활성으로 안 바꾼다
  const fx = ['#exportBtn', $('#exportOv .cgsBody')];
  fxBusy(fx, true, { disable: false });
  let n = 0, err = null;
  try {
    await withStaticFrame(async () => {
      await awaitMapboxTilesReady();   // 태풍 실시간 타일 — 렌더 전에 캐시
      for (const p of plan) {
        if (_exStop) break;
        exProgress(n, plan.length, p.name);
        const blob = await p.bake();
        if (!blob) throw new Error(`'${p.name}' 그림을 만들지 못했어요`);
        await target.write(p.file, blob);
        n++;
      }
    });
    if (target.finish) await target.finish();
  } catch (e) {
    err = e;
  } finally {
    exSetBusy(false);
    fxBusy(fx, false);
    fxProgress('#exportBtn', null);
  }
  const where = target.label;
  if (err) _exDone = { ok: false, head: '렌더 실패', tail: ` — ${exErrText(err)}` + (n ? ` · ${n}장은 저장됨(${where})` : '') };
  else if (_exStop && n < plan.length) _exDone = { ok: n > 0, head: n ? `중지 · ${n}장 저장했어요` : '중지했어요', tail: n ? ` · ${where}` : '' };
  else _exDone = { ok: true, head: '저장했어요', tail: ` · ${where} · ${n}장` };
  syncExport();
  if (!exportIsOpen()) { if (_exDone.ok) flashDone('이미지 저장 완료'); else status(_exDone.head + _exDone.tail, true, 'err'); }
  else if (_exDone.ok) fxArrive(['#exportBtn', $('#exSummary')]);   // 도착 — 제목줄 버튼 빛 + 저장 안내 떠오름
}

// 배선 — wire()가 부팅 때 한 번 부른다. 마크업은 index.html #exportOv(한 번만 만들어 둔다 — 다시 만들면 핸들러가 끊긴다).
function setupExportDialog() {
  const ov = $('#exportOv'); if (!ov) return;
  exLoadPick();
  buildExportCards();
  $('#exportBtn').onclick = (e) => { e.stopPropagation(); if (exportIsOpen()) closeExport(); else openExport(); };
  $('#exX').onclick = closeExport;
  $('#exCancel').onclick = closeExport;
  $('#exRender').onclick = () => renderExport();
  // 빠른 선택 — 완성 화면만 / 편집용 레이어 전부(쌓으면 '전체 화면'이 되는 묶음) / 모두 해제
  ov.querySelectorAll('.exQuick [data-quick]').forEach((b) => {
    b.onclick = () => {
      if (_exBusy) return;
      const q = b.dataset.quick;
      exPick = new Set(q === 'final' ? ['full'] : q === 'layers' ? EXPORT_STACK.filter((k) => !exportWhyNot(k)) : []);
      exSavePick(); _exDone = null; syncExport();
    };
  });
  // 판 머리 알약 — 그 묶음에서 뽑을 수 있는 것 모두 고르기 / 모두 골랐으면 모두 풀기
  ov.querySelectorAll('.cgsPane[data-group] .exPanePick').forEach((pill) => {
    pill.onclick = () => {
      if (_exBusy) return;
      const g = pill.closest('.cgsPane').dataset.group;
      const ks = EXPORT_TARGETS.filter((t) => t.group === g && !exportWhyNot(t.key)).map((t) => t.key);
      const all = ks.length && ks.every((k) => exPick.has(k));
      for (const k of ks) { if (all) exPick.delete(k); else exPick.add(k); }
      exSavePick(); _exDone = null; syncExport();
    };
  });
  // 바깥(어두운 막) 클릭 = 닫기 — 누른 곳·뗀 곳이 둘 다 막일 때만(CG 구성과 같게)
  let downOnOv = false;
  ov.addEventListener('pointerdown', (e) => { downOnOv = e.target === ov; });
  ov.addEventListener('click', (e) => { if (e.target === ov && downOnOv && !_exBusy) closeExport(); downOnOv = false; });
  // 위에 떠 있는 다른 창(겹침 확인 토스 모달 등)이 먼저 Esc·Tab 을 받는다 — 닫히는 중(.popClosing)인 창은 빼고
  const aboveEx = () => $('#tourWrap')?.classList.contains('on') || document.querySelector('#tossOv:not(.popClosing)') || $('#confirmOverlay.on:not(.popClosing)') || $('#slotOverlay.on:not(.popClosing)');
  window.addEventListener('keydown', (e) => {
    if (!exportIsOpen() || aboveEx()) return;
    if (e.key === 'Escape') { e.preventDefault(); if (_exBusy) exStopRequest(); else closeExport(); }   // 굽는 중 Esc = 중지
    else if (e.key === 'Tab') popTrapTab(ov.querySelector('.cgSetupCard'), e);
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); renderExport(); }
  });
  syncExport();
}
