/* [모듈] js/modals-notices.js — 팝업 공통(닫힘 애니메이션·포커스 — popAnimClose·popFocusIn), 토스 카드 모달(tossModal), 공지사항(시드·작성·삭제·부팅 확인), 내보내기 진행 마스크, 확인/입력 모달(tossConfirm·tossPrompt) */
'use strict';

// ===================== 팝업 닫힘 애니메이션 (근무표 .nd-closing 과 같은 결) =====================
// 막은 페이드아웃, 카드는 아래로 34px 내려가며 사라진다(.34초, CSS .popClosing). 끝나면 done()(숨기기·지우기).
// DOM은 그대로 두고 class만 바꾼다(재생성 없음). 닫히는 중에 다시 열면 popAnimCancel 이 취소한다. 움직임 줄이기 설정이면 바로 닫는다.
function popAnimClose(ov, done) {
  if (!ov) return;
  clearTimeout(ov._popT);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { ov._popT = 0; ov.classList.remove('popClosing'); done(); return; }
  ov.classList.add('popClosing');
  ov._popT = setTimeout(() => { ov._popT = 0; ov.classList.remove('popClosing'); done(); }, 340);
}
function popAnimCancel(ov) {
  if (!ov) return;
  if (ov._popT) { clearTimeout(ov._popT); ov._popT = 0; }
  ov.classList.remove('popClosing');
}
// 팝업 안 Tab 가두기 — Tab / Shift+Tab 은 카드 안에서만 돈다(막 뒤 제목줄·사이드바 버튼으로 새어 Enter로 눌리지 않게).
// 카드엔 tabindex="-1" — 열 때 카드 자체에 포커스를 두고(테두리 없이), 첫 Tab 에 첫 버튼으로. CG 구성·토스 모달·확인창·배치 지정하기·이미지 안내가 같이 쓴다.
function popTrapTab(card, e) {
  const list = [...card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((n) => !n.disabled && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
  const a = document.activeElement;
  if (!list.length) { e.preventDefault(); card.focus(); return; }
  const first = list[0], last = list[list.length - 1], inside = card.contains(a) && a !== card;
  if (e.shiftKey ? (!inside || a === first) : (!inside && a !== card) || a === last) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}
// 열 때: 연 버튼을 기억하고 포커스를 팝업 안(카드 또는 지정한 칸)으로. 닫을 때: 포커스가 팝업 안·body 에 있으면 연 버튼으로 돌려준다.
function popFocusIn(ov, target, opener) {
  ov._opener = opener !== undefined ? opener : document.activeElement;
  if (target) { try { target.focus({ preventScroll: true }); } catch (e) {} }
}
function popFocusBack(ov) {
  const back = ov._opener; ov._opener = null;
  const a = document.activeElement;
  if (!back || !back.isConnected || typeof back.focus !== 'function' || (a && a !== document.body && !ov.contains(a))) return;
  if ($('#tourWrap')?.classList.contains('on')) return;   // 둘러보기 중엔 포커스를 옮기지 않는다(closeCgSetup 과 같게)
  try { back.focus({ preventScroll: true }); } catch (e) {}
}
// 닫기 X 아이콘(유리 원 버튼 안) — 정적 문자열
const POP_X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

// ===================== 토스 카드 모달 (공지·안내 공통) =====================
// 근무표 최신 팝업처럼 옅은 틴트 머리(진한 색 띠 아님) + 기본색 제목 + 유리 닫기 + 아래 내용. 반환값으로 각 영역을 넘겨 추가 조작.
// opt.tone: 'blue'(기본·안내) | 'red'(경고·문제) | 'green'(완료·작성) — 머리 틴트 색만 바뀐다.
// 떠 있는 토스 모달을 조용히 치운다(새 모달로 바뀔 때) — onClose(공지 읽음 처리 등)는 부르지 않고 Esc 리스너만 함께 뗀다.
// (DOM만 지우면 이전 모달의 Esc 리스너가 남아, 나중 Esc 한 번에 읽지도 않은 공지가 '읽음'이 됐다)
let _tossDispose = null;
function closeTossModal() { if (_tossDispose) _tossDispose(); const e = document.getElementById('tossOv'); if (e) e.remove(); }
function tossModal(opt) {
  opt = opt || {};
  // 연 버튼 — 떠 있던 토스 모달 안에서 새 모달로 바뀌면(그 안 버튼이 곧 지워지니) 처음 연 버튼을 이어받는다
  const prevOv = document.getElementById('tossOv');
  const opener = prevOv && prevOv.contains(document.activeElement) ? prevOv._opener : document.activeElement;
  closeTossModal();
  const tone = opt.tone === 'red' || opt.tone === 'green' ? opt.tone : 'blue';
  const ov = document.createElement('div');
  ov.className = 'tossOv'; ov.id = 'tossOv';
  ov.innerHTML =
    `<div class="tossCard${opt.wide ? ' wide' : ''}" role="dialog" aria-modal="true" tabindex="-1">`
    + `<div class="tossHead" data-tone="${tone}">`
    +   `<div class="tossHeadTxt"><div class="tossTitle"></div>${opt.sub ? '<div class="tossSub"></div>' : ''}</div>`
    +   `<div class="tossHeadAct"></div>`
    +   `<button class="tossX" aria-label="닫기" title="닫기 (Esc)">${POP_X_SVG}</button>`
    + `</div>`
    + `<div class="tossBody">${opt.bodyHTML || ''}</div>`
    + (opt.footHTML ? `<div class="tossFoot">${opt.footHTML}</div>` : '')
    + `</div>`;
  document.body.appendChild(ov);
  ov.querySelector('.tossTitle').textContent = opt.title || '';   // 제목·부제는 textContent로(주입 안전)
  if (opt.sub) ov.querySelector('.tossSub').textContent = opt.sub;
  let closed = false;
  const detach = () => { closed = true; window.removeEventListener('keydown', onKey); if (_tossDispose === dispose) _tossDispose = null; };
  const dispose = () => { detach(); clearTimeout(ov._popT); ov.remove(); };   // 새 모달로 바뀔 때 — 애니메이션 없이 바로
  // 닫기 = 닫힘 애니메이션(.34초) 뒤 지운다. 그 사이 새 모달이 뜨면 closeTossModal 이 #tossOv 를 바로 치운다.
  const close = () => { if (closed) return; detach(); popAnimClose(ov, () => ov.remove()); popFocusBack(ov); if (opt.onClose) opt.onClose(); };
  ov.querySelector('.tossX').onclick = close;
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const card = ov.querySelector('.tossCard');
  // Esc = 닫기, Tab = 카드 안에서만(토스 모달이 맨 위 층 — 확인창(z 200)보다 위)
  const onKey = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'Tab') popTrapTab(card, e); };
  window.addEventListener('keydown', onKey);
  _tossDispose = dispose;
  popFocusIn(ov, card, opener);   // 포커스를 카드로(막 뒤 버튼이 Enter·Space 를 받지 않게) — 부르는 쪽이 입력칸 등에 다시 줘도 된다
  return { ov, close, card, head: ov.querySelector('.tossHeadAct'), body: ov.querySelector('.tossBody'), foot: ov.querySelector('.tossFoot') };
}

// ===================== 공지사항 =====================
const NOTICE_SEEN_KEY = 'wcg_notice_seen', NOTICE_AUTH_KEY = 'wcg_notices', NOTICE_DELETED_KEY = 'wcg_notice_deleted', NOTICE_PW = '7989';
// 배포에 심는 기본 공지 — 모든 사용자에게 뜬다. (사용자가 쓴 공지는 그 브라우저 localStorage 에만 쌓인다)
const SEED_NOTICES = [{
  id: '2026-07-31-typhoon-beta', date: '2026.07.31', title: '새 기능 — 태풍 예상경로 지도 (베타)',
  body:
    '<p>맨 위 <b>‘CG 구성’</b>의 <b>지도 종류</b>에 <b>태풍 (베타)</b>가 새로 생겼어요. 기상청 태풍정보로 <b>예상경로 CG</b>를 만듭니다.</p>'
    + '<ul>'
    + '<li><b>불러오기</b> — 태풍 메뉴의 <b>‘기상청에서 불러오기’</b>를 누르면 현재 태풍의 <b>실황+예상경로</b>가 자동으로 들어옵니다. (발표 시각도 자동으로 최신 것을 찾습니다.)</li>'
    + '<li><b>경로·반경 애니메이션</b> — <b>‘애니메이션 확인’</b>으로 경로가 스으윽 그려지고, 15m/s·25m/s·70% 확률반경이 함께 나타납니다. <b>영상으로 추출</b>에도 그대로 담깁니다.</li>'
    + '<li><b>수치 라벨</b> — 불러오면 <b>오늘(현재) 지점에 라벨 1개</b>가 자동으로 생깁니다. 지도의 라벨을 <b>클릭</b>하면 <b>수치 라벨</b> 메뉴에서 내용·색·크기·윗줄까지 예보/특보 지도와 똑같이 편집할 수 있어요. 다른 시각에도 체크로 라벨을 더 넣을 수 있습니다.</li>'
    + '<li><b>세부</b> — 아직 태풍이 안 된 <b>열대저압부는 점</b>으로, <b>독도</b>는 항상 살짝 보이게 표시됩니다. 지형·남한강조·광역색은 <b>지도 위치</b> 메뉴에서 조절합니다.</li>'
    + '<li><b>베타</b>입니다 — 계속 다듬는 중이라 어색한 부분이 있으면 알려주세요.</li>'
    + '</ul>'
}, {
  id: '2026-07-24-aeexport', date: '2026.07.24', title: '새 기능 — AE로 보내기',
  body:
    '<p>지금 만든 CG를 <b>애프터이펙트로 자동으로 넘기는</b> 기능이 생겼어요.</p>'
    + '<ul>'
    + '<li><b>AE로 보내기 버튼</b> — 상단 <b>‘영상으로 추출’ 옆</b>에 <b>‘AE로 보내기’</b> 버튼이 생겼습니다.</li>'
    + '<li><b>레이어별로 자동 구성</b> — 배경·지도, 색칠(색별), 산, 경계선, 라벨(배경+글자), 제목이 각각 <b>편집 가능한 레이어</b>로 들어가고, <b>타임라인과 같은 애니메이션</b>(색별로 1초, 라벨 올라오기, VF 진입)이 자동으로 걸립니다.</li>'
    + '<li><b>쓰는 법</b> — 버튼을 누르면 <b>‘렌더 기능 확장팩’</b>이 알아서 처리합니다(제목 폰트도 자동 설치). 기능 확장팩이 꺼져 있으면 안내창이 뜨니 처음 한 번만 켜 주세요. <b>AE가 꺼진 상태</b>에서 누르는 게 가장 깔끔합니다.</li>'
    + '</ul>'
}, {
  id: '2026-07-23-newfeatures', date: '2026.07.23', title: '새 기능 업데이트',
  body:
    '<p><b>노말 VF 출력</b>과 <b>방송용 렌더</b>가 새로 들어왔어요.</p>'
    + '<ul>'
    + '<li><b>VF 출력 기능 추가</b> — 맨 위 <b>‘CG 구성’</b>의 <b>CG 종류</b>에서 <b>노말 VF</b>를 고르면 투명(알파) 오버레이용 화면으로 작업할 수 있습니다.</li>'
    + '<li><b>MXF · MOV 렌더 추가</b> — <b>‘영상으로 추출’</b> 창에서 <b>노말 CG는 MXF</b>, <b>노말 VF는 알파 MOV</b> 버튼으로 방송용 파일을 바로 뽑습니다.</li>'
    + '<li><b>쓰는 법</b> — <b>MXF / MOV 버튼을 누르면 안내창</b>이 뜹니다. 처음 한 번만 그 안내대로 <b>‘렌더 기능 확장팩’</b>을 켜 두면, 이후로는 버튼만 누르면 자동으로 됩니다.</li>'
    + '</ul>'
}];
function noticeSeenSet() { try { return new Set(JSON.parse(localStorage.getItem(NOTICE_SEEN_KEY) || '[]')); } catch (e) { return new Set(); } }
function authoredNotices() { try { const a = JSON.parse(localStorage.getItem(NOTICE_AUTH_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function deletedNoticeIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(NOTICE_DELETED_KEY) || '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : []);
  } catch (e) { return new Set(); }
}
function allNotices() {
  const deleted = deletedNoticeIds(), map = {};
  for (const n of [...SEED_NOTICES, ...authoredNotices()]) if (n && n.id && !deleted.has(n.id)) map[n.id] = n;
  return Object.values(map).sort((a, b) => (a.id < b.id ? 1 : -1));
}  // 최신 먼저
function unseenNotices() { const s = noticeSeenSet(); return allNotices().filter((n) => !s.has(n.id)); }
function noticeMarkAllSeen() { localStorage.setItem(NOTICE_SEEN_KEY, JSON.stringify(allNotices().map((n) => n.id))); updateNoticeDot(); }
function deleteNotice(id) {
  if (!allNotices().some((notice) => notice.id === id)) return false;
  localStorage.setItem(NOTICE_AUTH_KEY, JSON.stringify(authoredNotices().filter((notice) => notice && notice.id !== id)));
  const deleted = deletedNoticeIds(); deleted.add(id);
  localStorage.setItem(NOTICE_DELETED_KEY, JSON.stringify([...deleted]));
  const seen = noticeSeenSet(); seen.delete(id);
  localStorage.setItem(NOTICE_SEEN_KEY, JSON.stringify([...seen]));
  updateNoticeDot();
  return true;
}
// 공지 날짜("YYYY.MM.DD") 파싱
function parseNoticeDate(s) { const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
// 만든 지 7일 이내면 '최근' — 읽었어도 빨간 점 유지
function noticeIsRecent(n) { const d = parseNoticeDate(n && n.date); return d ? (new Date().getTime() - d.getTime()) < 7 * 864e5 : false; }
function updateNoticeDot() { const b = $('#noticeBtn'); if (b) b.classList.toggle('hasNew', unseenNotices().length > 0 || allNotices().some(noticeIsRecent)); }
function noticeItemHTML(n) {
  const body = n.body || '';   // 저장 시 이미 정제됨(작성자=관리자만 7989로 작성)
  const id = encodeURIComponent(String(n.id || ''));
  return `<div class="ntItem"><button class="ntDelete" type="button" data-notice-delete="${id}" title="공지 삭제" aria-label="공지 삭제"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7 21a2 2 0 0 1-2-2V6h14v13a2 2 0 0 1-2 2H7zM9 9v8h2V9H9zm4 0v8h2V9h-2zm1-6 1 1h4v2H5V4h4l1-1h4z"/></svg></button><div class="d">${(n.date || '').replace(/</g, '&lt;')}</div><div class="t">${(n.title || '').replace(/</g, '&lt;')}</div><div class="b">${body}</div></div>`;
}
// 공지 하나를 팝업으로 (부팅 자동 안내). 닫으면 전부 읽음 처리 → 다시 안 뜬다.
function openNoticePopup(n) {
  const m = tossModal({
    title: n.title || '공지', sub: n.date || '', tone: 'blue',
    bodyHTML: n.body || '', footHTML: '<button class="tossBtn pri" data-ok>확인</button>',
    onClose: noticeMarkAllSeen,
  });
  m.foot.querySelector('[data-ok]').onclick = m.close;
}
// 공지 히스토리 — 지금까지의 공지 모아보기 + 헤더의 작성 아이콘
function openNoticeHistory() {
  const list = allNotices();
  const bodyHTML = list.length ? `<div class="ntList">${list.map(noticeItemHTML).join('')}</div>` : '<div class="ntEmpty">아직 공지가 없습니다.</div>';
  const m = tossModal({ title: '공지사항', sub: '업데이트·안내 모아보기', tone: 'blue', bodyHTML, wide: true });
  const write = document.createElement('button');
  write.className = 'tossHeadIcon'; write.title = '공지 작성 (비밀번호)'; write.setAttribute('aria-label', '공지 작성');
  write.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M4 20h4L18 10l-4-4L4 16v4zM16.5 3.5l4 4L18.8 9.2l-4-4L16.5 3.5z"/></svg>';
  write.onclick = openNoticeWrite;
  m.head.appendChild(write);
  m.body.onclick = (e) => {
    const button = e.target.closest('[data-notice-delete]');
    if (!button || !m.body.contains(button)) return;
    requestNoticeDelete(decodeURIComponent(button.dataset.noticeDelete || ''));
  };
  noticeMarkAllSeen();   // 히스토리를 열면 전부 읽음
}
function requestNoticeDelete(id) {
  const pw = prompt('공지 삭제 비밀번호를 입력하세요');
  if (pw == null) return;
  if (pw !== NOTICE_PW) { flash('비밀번호가 틀립니다'); return; }
  if (!confirm('이 공지를 삭제할까요?')) return;
  if (!deleteNotice(id)) { flash('삭제할 공지를 찾지 못했어요'); return; }
  flash('공지를 삭제했어요');
  openNoticeHistory();
}
// 공지 작성 — 비번 7989 확인 후 제목·내용 입력. 저장하면 다음 실행 때 팝업으로 뜬다.
function openNoticeWrite() {
  const pw = prompt('공지 작성 비밀번호를 입력하세요');
  if (pw == null) return;
  if (pw !== NOTICE_PW) { flash('비밀번호가 틀립니다'); return; }
  const m = tossModal({
    title: '공지 작성', sub: '저장하면 다음 실행 때 자동으로 뜹니다', tone: 'green',
    bodyHTML: '<div class="ntForm"><label>제목</label><input id="ntTitle" placeholder="예: 새 기능 안내" maxlength="80"><label>내용</label><textarea id="ntBody" placeholder="줄바꿈은 그대로 반영됩니다. (원하면 <b> 같은 HTML 태그도 사용 가능)"></textarea></div>',
    footHTML: '<button class="tossBtn ghost" data-cancel>취소</button><button class="tossBtn pri" data-save>저장</button>',
  });
  m.foot.querySelector('[data-cancel]').onclick = m.close;
  m.foot.querySelector('[data-save]').onclick = () => {
    const t = m.body.querySelector('#ntTitle').value.trim();
    const raw = m.body.querySelector('#ntBody').value.trim();
    if (!t && !raw) { flash('제목이나 내용을 입력하세요'); return; }
    const d = new Date();
    const p2 = (x) => String(x).padStart(2, '0');
    const date = `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`;
    const id = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    // 태그가 있으면 그대로, 없으면 escape + 줄바꿈 → <br>
    const body = /<[a-z][\s\S]*>/i.test(raw) ? raw
      : '<p>' + raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>';
    const arr = authoredNotices(); arr.push({ id, date, title: t || '공지', body });
    localStorage.setItem(NOTICE_AUTH_KEY, JSON.stringify(arr));
    // 작성자는 방금 봤으니 이 공지는 '읽음'으로. 그래도 다른 브라우저(다음 사람)에겐 안 읽음이라 뜬다.
    const seen = noticeSeenSet(); seen.add(id); localStorage.setItem(NOTICE_SEEN_KEY, JSON.stringify([...seen]));
    updateNoticeDot();
    flash('공지를 저장했어요'); openNoticeHistory();
  };
}
// 부팅 시 안 읽은 공지가 있으면 가장 최신 것을 팝업
function checkNoticeOnBoot() {
  const un = unseenNotices();
  if (!un.length) return;
  if (un.length === 1) { openNoticePopup(un[0]); return; }
  // 안 읽은 공지가 여러 개면 한 팝업에 전부 쌓아서 보여준다(닫으면 전부 읽음).
  const m = tossModal({
    title: '새 공지', sub: `안 읽은 공지 ${un.length}개`, tone: 'blue', wide: true,
    bodyHTML: `<div class="ntList">${un.map(noticeItemHTML).join('')}</div>`,
    footHTML: '<button class="tossBtn pri" data-ok>확인</button>', onClose: noticeMarkAllSeen,
  });
  m.foot.querySelector('[data-ok]').onclick = m.close;
}

// 추출(MP4/PNG 시퀀스) 진행 바 — #tlInfo 안에 얇은 바 + 텍스트로 보여준다.
function exportProgress(done, total, label) {
  const el = $('#tlInfo'); if (!el) return;
  const pct = total ? Math.max(0, Math.min(100, Math.round(done / total * 100))) : 0;
  el.innerHTML = `<span class="tlProg"><span class="tlProgFill" style="width:${pct}%"></span></span>${label} ${done}/${total} · ${pct}%`;
  exportMaskProgress(pct, label);   // 가리개(렌더 중…) 안 진행바도 함께 채운다
  fxProgress(null, pct / 100);      // 일하는 중인 제목줄 버튼(영상으로 추출·AE로 보내기) 아래 얇은 막대도(js/busy-fx.js)
}
// 렌더 중 스테이지 가리개 — 프레임마다 라이브 SVG를 갱신해 깜빡이므로 덮어 둔다(추출 결과엔 영향 없음).
function showExportMask(on) {
  let m = document.getElementById('exportMask');
  if (on) {
    const stage = document.getElementById('stage') || document.querySelector('#cg')?.parentNode || document.body;
    if (!m) {
      m = document.createElement('div'); m.id = 'exportMask';
      m.innerHTML = '<div class="emCard">렌더 중…<div class="emSub">미리보기는 잠시 멈춥니다 · 결과물엔 영향 없어요</div>'
        + '<div class="emBar"><span class="emBarFill"></span></div><div class="emPct">준비 중…</div></div>';
    }
    if (stage && getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
    if (m.parentNode !== stage) (stage || document.body).appendChild(m);
    if (_maskHideT) { clearTimeout(_maskHideT); _maskHideT = 0; }
    const f = m.querySelector('.emBarFill'), p = m.querySelector('.emPct');
    if (f) f.style.width = '0%'; if (p) p.textContent = '준비 중…';   // 매번 0에서 시작
    m.style.display = 'flex';
    void m.offsetWidth;              // 리플로우 강제 → 다음 프레임에 opacity 전환이 걸린다(부드러운 페이드인)
    m.classList.add('on');
  } else if (m) {
    m.classList.remove('on');       // 부드러운 페이드아웃 후 display:none
    if (_maskHideT) clearTimeout(_maskHideT);
    _maskHideT = setTimeout(() => { m.style.display = 'none'; _maskHideT = 0; }, 340);
  }
}
let _maskHideT = 0;
// 렌더 진행바 갱신 — exportProgress 가 하단 정보줄과 함께 가리개 안 바도 함께 채운다.
function exportMaskProgress(pct, label) {
  const m = document.getElementById('exportMask'); if (!m) return;
  const f = m.querySelector('.emBarFill'), p = m.querySelector('.emPct');
  if (f) f.style.width = pct + '%';
  if (p) p.textContent = (label ? label + ' · ' : '') + pct + '%';
}

// 토스 카드 스타일 확인 모달. confirm()의 예쁜 버전. Promise<boolean> 반환.
// opts: { title, message, ok, cancel, danger }. 실수로 누르면 곤란한 버튼에 쓴다.
// DOM은 한 번만 만들어 두고 열고 닫기만 한다(재생성 X — 핸들러 유지).
function tossConfirm(opts = {}) {
  const ov = $('#confirmOverlay');
  if (!ov) return Promise.resolve(window.confirm(opts.message || '계속할까요?'));   // 안전망
  { const inp = $('#confirmInput'); if (inp) inp.style.display = 'none'; }   // 확인 모달은 입력칸 숨김
  const danger = !!(opts.danger || opts.warn);   // 배치 슬롯 쪽은 warn, 나머지는 danger 로 부른다 — 둘 다 경고색
  $('#confirmHead').textContent = opts.title || '확인';
  $('#confirmHead').classList.toggle('warn', danger);
  $('#confirmMsg').textContent = opts.message || '';
  $('#confirmOk').textContent = opts.ok || '확인';
  $('#confirmOk').classList.toggle('warn', danger);
  $('#confirmCancel').textContent = opts.cancel || '취소';
  const wasOpen = ov.classList.contains('on') && !ov.classList.contains('popClosing');
  popAnimCancel(ov);   // 직전 확인창이 닫히는 중이면 취소하고 다시 연다
  ov.classList.add('on');
  popFocusIn(ov, $('#confirmOk'), wasOpen ? ov._opener : document.activeElement);
  return new Promise((resolve) => {
    const done = (v) => {
      popAnimClose(ov, () => ov.classList.remove('on'));   // 닫힘 애니메이션(.34초) 뒤 숨김
      $('#confirmOk').onclick = $('#confirmCancel').onclick = ov.onclick = null;
      document.removeEventListener('keydown', onKey, true);
      popFocusBack(ov);   // 연 버튼으로 포커스 돌려주기(이어서 다른 확인·입력창이 뜨면 그 창이 다시 가져간다)
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
      else if (e.key === 'Tab') { e.stopPropagation(); popTrapTab(ov.querySelector('.confirmCard'), e); }   // 확인창 안에서만(아래 창들의 가두기는 안 받게)
    };
    $('#confirmOk').onclick = () => done(true);
    $('#confirmCancel').onclick = () => done(false);
    ov.onclick = (e) => { if (e.target === ov) done(false); };   // 바깥 클릭 = 취소
    document.addEventListener('keydown', onKey, true);
  });
}

// 토스 카드 스타일 입력창. prompt()의 예쁜 버전. Promise<string|null> 반환(취소면 null).
// opts: { title, message, value, ok, cancel }
function tossPrompt(opts = {}) {
  const ov = $('#confirmOverlay'), inp = $('#confirmInput');
  if (!ov || !inp) { const v = window.prompt(opts.message || '', opts.value || ''); return Promise.resolve(v == null ? null : v.trim()); }   // 안전망
  $('#confirmHead').textContent = opts.title || '입력';
  $('#confirmHead').classList.remove('warn');
  $('#confirmMsg').textContent = opts.message || '';
  inp.style.display = ''; inp.value = opts.value || '';
  $('#confirmOk').textContent = opts.ok || '확인'; $('#confirmOk').classList.remove('warn');
  $('#confirmCancel').textContent = opts.cancel || '취소';
  const wasOpen = ov.classList.contains('on') && !ov.classList.contains('popClosing');
  popAnimCancel(ov);
  ov.classList.add('on');
  popFocusIn(ov, inp, wasOpen ? ov._opener : document.activeElement);
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
  return new Promise((resolve) => {
    const clean = () => inp.value.trim();   // 기본값은 칸에 이미 채워져 있다 — 사용자가 지우면 빈 값 그대로(직전 값으로 되돌리지 않음)
    const done = (v) => {
      // 닫힘 애니메이션 뒤 숨김 — 입력칸도 그때 숨긴다(먼저 숨기면 카드가 줄며 사라진다). 그 사이 다시 열리면 popAnimCancel 이 막는다
      popAnimClose(ov, () => { ov.classList.remove('on'); inp.style.display = 'none'; });
      $('#confirmOk').onclick = $('#confirmCancel').onclick = ov.onclick = inp.onkeydown = null;
      document.removeEventListener('keydown', onKey, true);
      popFocusBack(ov);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      else if (e.key === 'Tab') { e.stopPropagation(); popTrapTab(ov.querySelector('.confirmCard'), e); }
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(clean()); } };
    $('#confirmOk').onclick = () => done(clean());
    $('#confirmCancel').onclick = () => done(null);
    ov.onclick = (e) => { if (e.target === ov) done(null); };
    document.addEventListener('keydown', onKey, true);
  });
}
