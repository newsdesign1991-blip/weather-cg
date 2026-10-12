/* [모듈] js/app-update.js — 앱 업데이트(데스크톱, 10-12): 설정(렌치) 메뉴 '앱 업데이트' 묶음(지금 판·상태·새 판 바뀐 점·[업데이트하기]·업데이트 내역·이전 판으로 되돌리기), 새 판이면 렌치 깜빡임, '새 업데이트가 있습니다' 토스 팝업, 저장 안 한 작업 묻기 → 받기 진행·결과 */
'use strict';

// ===================== 앱 업데이트 =====================
// 메인(desktop/updater.js — main.js)이 공유 폴더의 latest.json 을 보고 새 판을 알리면(preload onUpdate) 팝업을 띄우고(updShow) 렌치를 깜빡인다(updBadge).
//  [나중에]·닫기·Esc = 이번 실행 동안 그 판은 저절로 다시 안 뜸(updateLater — 설정 메뉴 '앱 업데이트'에서는 언제든 [업데이트하기]).
//  [지금 설치]·메뉴 [업데이트하기] = 저장 안 한 작업 묻기(닫기 전 묻기 closeAsk 그대로 — [저장]·[저장 안 함]·[취소], 렌더·AE 보내는 중도) → 메인이 설치 파일을 %TEMP% 로 받으며
//  크기·sha256 확인(진행 막대, [취소]) → 업데이트 진행 창(10-13 — 앱이 꺼진 뒤에도 '닫기·확인·설치·새 판 실행' 단계를 보여 주는 작은 창, desktop/update-ui)을 띄우고 앱을 끈다
//  (창이 같은 자리에 덮어 깔고 새 판을 켠다. 창이 없거나 못 띄우면 예전처럼 조용한 설치 — '곧 앱이 닫히고 새 판이 켜져요'). 실패면 같은 팝업에 까닭.
// 설정(렌치) 메뉴 '앱 업데이트'(10-12 사용자 요청 — 배치·설정 옮기기 자리): 지금 판·상태(최신이에요 / 새 판 있어요 / 폴더에 못 닿아요 / 개발판),
//  새 판의 바뀐 점과 [업데이트하기], 업데이트 내역(올라간 판들 — 판·날짜·바뀐 점, 최근 판부터, 길면 스크롤), [다시 확인],
//  이전 판으로 되돌리기(업데이트 폴더에 설치 파일이 남아 있는 낮은 판 — [이 판으로 설치] → 확인 팝업 → 업데이트와 같은 길).
//  새 판이 있으면 메뉴 열기·[나중에]와 무관하게 렌치의 빨간 깜빡임을 유지한다(옛 wcg_upd_seen 값은 쓰지 않음).
//  되돌린 판(wcg_upd_skip = 되돌리기 전 판)까지는 저절로 팝업을 띄우지 않는다 — 더 새 판이 오면 다시. 렌치 표시·메뉴 설치는 유지한다.
// 렌더(영상·이미지 추출·AE 보내기) 중이거나 다른 토스 팝업(공지 등)이 떠 있으면 팝업은 끝난 뒤에 띄운다(1초마다 확인).
// 웹판·옛 데스크톱(wcgDesktop.updateCheck 없음)은 아무것도 안 한다(메뉴 묶음도 숨김). 부팅 배선은 js/boot.js 의 updWire(), 메뉴 열기는 js/floating-panels.js setupMenus → updMenuOpened().
const _upd = { pending: null, waitT: 0, checking: null, busy: false, shown: '', bootAt: 0, last: null, lastAt: 0 };   // shown = 이 화면에서 띄운(고른) 판 — 메인이 같은 판을 또 건네도 한 번만
// 부팅 직후엔 띄우지 않는다 — 부팅 팝업(공지 0.6·1.5초, 둘러보기 0.65초, 헬퍼 안내 1.3·2.4초 — js/boot.js)이 나중에 떠서
// 업데이트 팝업·받기 진행 팝업을 밀어내지 않게(10-12 끝에서 끝 점검에서 공지가 진행 팝업을 덮었다). updWire 부터 이만큼은 기다린다
const UPD_BOOT_QUIET_MS = 3500;
const UPD_MENU_STALE_MS = 60000;      // 메뉴를 열 때 마지막 확인이 이보다 오래됐으면 다시 확인
const UPD_SKIP_KEY = 'wcg_upd_skip';  // 되돌리기 전 판 — 그 판까지는 저절로 팝업 안 띄움
const updEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function updDesk() { const d = window.wcgDesktop; return d && typeof d.updateCheck === 'function' ? d : null; }
function updSize(n) { n = +n || 0; return n >= 1048576 ? (Math.round(n / 1048576 * 10) / 10) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
function updDate(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; }
function updClock(ms) { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
// 판 비교(desktop/updater.js cmpVer 와 같은 규칙 — x.y.z 숫자) — a 가 새 판이면 1, 같으면 0, 옛 판이면 -1, 꼴이 아니면 null
function updCmp(a, b) {
  const p = (v) => { const m = /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/.exec(String(v == null ? '' : v).trim()); return m ? [+m[1], +m[2], +m[3]] : null; };
  const x = p(a), y = p(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
// 판 + '으로/로'(끝 숫자 0·3·6 = 받침 ㅇ·ㅁ·ㄱ → '으로', 1·7·8 = ㄹ 받침 → '로', 나머지 받침 없음 → '로')
function updRo(v) { return String(v) + (/[036]$/.test(String(v)) ? '으로' : '로'); }
// 판 + '이/가'(끝 숫자 2·4·5·9 = 받침 없음 → '가')
function updI(v) { return String(v) + (/[2459]$/.test(String(v)) ? '가' : '이'); }
function updStoreGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function updStoreSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* 저장 공간 막힘 — 이번 실행만 */ } }
// 되돌리기 전 판(또는 그보다 옛 판)인가 — 저절로 팝업을 띄우지 않는다
function updSkipped(v) { const s = updStoreGet(UPD_SKIP_KEY); const c = s ? updCmp(v, s) : null; return c !== null && c <= 0; }
const updNotesOf = (n) => (Array.isArray(n) ? n : []).filter((x) => typeof x === 'string' && x.trim());
// 확인 결과 → 알림 글·색(실패 팝업의 [다시 확인] — updCheckNow)
function updResultView(r) {
  const cur = r && r.current ? String(r.current) : '';   // status()는 글자(textContent)로 쓴다
  switch (r && r.state) {
    case 'available': return { text: `새 판 ${updI(r.version)} 있어요 — 지금 ${cur}`, tone: 'ok' };
    case 'latest': return { text: `최신 판이에요 — 앱 ${cur}`, tone: 'ok' };
    case 'none': return { text: `올라온 업데이트가 없어요 — 지금 앱 ${cur}`, tone: 'ok' };
    case 'unreachable': return { text: '업데이트 폴더에 닿지 못했어요 — 사내망(R: 드라이브)에 연결돼 있는지 확인해 주세요', tone: 'warn' };
    case 'bad': return { text: '업데이트 정보(latest.json)를 읽지 못했어요 — 담당자에게 알려 주세요', tone: 'warn' };
    default: return { text: '업데이트를 확인하지 못했어요 — 잠시 뒤 다시 눌러 주세요', tone: 'warn' };
  }
}
// 설치 실패 까닭(desktop/updater.js install 의 err) → 안내 글
function updErrText(r) {
  switch (r && r.err) {
    case 'unreachable': case 'timeout': return '업데이트 폴더에 닿지 못했어요 — 사내망(R: 드라이브)에 연결돼 있는지 확인해 주세요.';
    case 'changed': return '그 사이 올라온 판이 바뀌었어요 — ‘다시 확인’을 눌러 주세요.';
    case 'gone': return '그 판이 업데이트 내역에서 빠졌어요 — ‘다시 확인’을 눌러 주세요.';
    case 'not-newer': return '이미 최신 판이에요.';
    case 'not-older': return '지금 판보다 옛 판이 아니에요 — ‘다시 확인’을 눌러 주세요.';
    case 'missing': return '업데이트 폴더에 그 판의 설치 파일이 없어요 — 담당자에게 알려 주세요.';
    case 'size': case 'sha': return '받은 설치 파일이 올린 것과 달라요(크기·확인값 불일치) — 설치하지 않았어요. 담당자에게 알려 주세요.';
    case 'path': case 'bad': return '업데이트 정보가 올바르지 않아요 — 설치하지 않았어요. 담당자에게 알려 주세요.';
    case 'copy': case 'write': return '설치 파일을 받지 못했어요 — 디스크 공간과 사내망 연결을 확인해 주세요.';
    case 'spawn': return '설치 프로그램을 실행하지 못했어요 — 보안 프로그램이 막았을 수 있어요.';
    case 'dev': return '개발판에서는 설치하지 않아요 — 설치판에서 업데이트해 주세요.';
    case 'busy': return '이미 업데이트를 진행하고 있어요.';
    case 'ui-stuck': return '업데이트 진행 창이 응답하지 않아 설치하지 않았어요 — 앱을 다시 켠 뒤 다시 해 주세요.';
    case 'denied': return '이 창에서는 업데이트할 수 없어요.';
    default: return '업데이트하지 못했어요 — 잠시 뒤 다시 해 주세요.';
  }
}

// ---------- 렌치 깜빡임 ----------
// 마지막 확인이 새 판이면 계속 빨갛게 깜빡이고 작은 점(css/menus-windows.css .updNew — 움직임 줄이기면 빨간색 고정).
// 툴팁도 그 판으로 — applyHelperState(js/export-video.js)가 렌치 툴팁을 다시 쓸 때 data-upd-tip 을 먼저 쓴다.
function updBadgeOn() {
  const r = _upd.last;
  return !!(r && r.state === 'available' && r.version);
}
function updBadge() {
  const b = $('#helperBtn');
  if (!b) return;
  const on = updBadgeOn();
  b.classList.toggle('updNew', on);
  if (on) b.dataset.updTip = `설정 — 새 판 ${updI(_upd.last.version)} 있어요(앱 업데이트)`;
  else delete b.dataset.updTip;
  if (b.classList.contains('hasNew')) return;   // 웹판 기능 확장팩 구버전 안내가 툴팁을 쓰는 중
  const tip = b.dataset.updTip || HELPER_BTN_TIP;
  b.title = tip; b.setAttribute('aria-label', tip);
}
// ---------- 확인 ----------
// 확인 한 번(겹쳐 부르면 같은 답) — 결과를 기억하고 렌치·메뉴를 다시 그린다.
function updFetch() {
  const d = updDesk();
  if (!d) return Promise.resolve(null);
  if (_upd.checking) return _upd.checking;
  // 묻기는 다음 마이크로태스크에 — 메뉴가 먼저 '확인 중…'으로 그려지게
  const p = Promise.resolve().then(() => d.updateCheck()).then((r) => r || null, () => null).then((r) => {
    _upd.last = r || { state: 'error', current: String(d.appVersion || '') };
    _upd.lastAt = Date.now();
    return r;
  });
  _upd.checking = p;
  p.then(() => { _upd.checking = null; updBadge(); updMenuRender(); });
  updMenuRender();   // '확인 중…'
  return p;
}
// 곧바로 확인해 결과를 알린다 — 새 판이면 메뉴를 닫고 팝업(나중에 고른 판도). 실패 팝업의 [다시 확인]
async function updCheckNow() {
  if (!updDesk()) return null;
  const r = await updFetch();
  const v = updResultView(r);
  if (r && r.state === 'available') { if (_closeMenu) _closeMenu(); updShow(r, true); }
  else status(v.text, true, v.tone);
  return r;
}

// ---------- 설정(렌치) 메뉴 '앱 업데이트' ----------
function updMenuIsOpen() {
  const drop = $('#menuDrop');
  if (!drop || !drop.classList.contains('on')) return false;
  const s = drop.querySelector('.sec[data-sec="cfg"]');
  return !!s && s.style.display !== 'none';
}
// 메뉴를 열 때(setupMenus): 깜빡임 유지 → 마지막 결과로 그리기 → 오래됐으면(또는 아직이면) 다시 확인
function updMenuOpened() {
  if (!updDesk()) return;
  updBadge();
  updMenuRender();
  if (!_upd.checking && (!_upd.last || Date.now() - _upd.lastAt > UPD_MENU_STALE_MS)) updFetch();
}
function updMenuRender() {
  const box = $('#updBox');
  if (!box) return;
  const d = updDesk();
  box.innerHTML = updMenuHTML(_upd.last, { checking: !!_upd.checking, at: _upd.lastAt, appVersion: d ? d.appVersion : '' });
}
// 묶음 안(#updBox) 그림 — 순수 함수(글자는 다 이스케이프). r = 마지막 확인 결과(updateCheck), o = { checking, at(확인 시각 ms), appVersion }
function updMenuHTML(r, o = {}) {
  const cur = String((r && r.current) || o.appVersion || '');
  const st = r ? r.state : '';
  const pill = o.checking && !r ? ['확인 중…', 'muted']
    : !r ? ['아직 확인 안 함', 'muted']
    : st === 'available' ? [`새 판 ${r.version} 있어요`, 'new']
    : st === 'latest' ? ['최신이에요', 'ok']
    : st === 'none' ? ['올라온 판이 없어요', 'muted']
    : st === 'unreachable' ? (r.why === 'test-mode' ? ['점검 모드 — 확인 안 함', 'muted'] : ['업데이트 폴더에 못 닿아요', 'warn'])
    : st === 'bad' ? ['업데이트 정보를 못 읽어요', 'warn']
    : ['확인하지 못했어요', 'warn'];
  const dev = !!r && r.packaged === false;
  const can = !r || r.canInstall !== false;
  const meta = (e) => [updDate(e.date), e.size ? updSize(e.size) : ''].filter(Boolean).join(' · ');
  const list = (n) => { const a = updNotesOf(n); return a.length ? `<ul class="updList">${a.map((x) => `<li>${updEsc(x)}</li>`).join('')}</ul>` : '<p class="updEmpty">바뀐 점 안내가 없어요.</p>'; };
  let h = '<div class="updNow">'
    + `<div class="updNowRow"><span class="updNowLbl">지금 판</span><b class="updNowVer">${updEsc(cur || '—')}</b>${dev ? '<span class="updDev">개발판</span>' : ''}`
    + `<span class="updPill" data-tone="${pill[1]}">${updEsc(pill[0])}</span></div>`;
  if (st === 'available') {
    h += `<div class="updNewBox"><div class="updNewHead"><b>${updEsc(r.version)}</b><span>${updEsc(meta(r))}</span></div>${list(r.notes)}`
      + `<div class="btns"><button type="button" class="pri" data-upd-act="install"${can ? '' : ' disabled'}>업데이트하기</button></div></div>`;
  }
  const notes = [];
  if (st === 'unreachable' && r.why !== 'test-mode') notes.push('사내망(R: 드라이브)에 연결돼 있는지 확인해 주세요.');
  if (st === 'bad') notes.push('업데이트 정보(latest.json)가 깨졌어요 — 담당자에게 알려 주세요.');
  if (dev && !can) notes.push('개발판은 업데이트·되돌리기를 하지 않아요 — 설치판에서 해 주세요.');
  for (const t of notes) h += `<p class="hint updNote">${updEsc(t)}</p>`;
  h += `<div class="updNowFoot"><span class="updWhen">${o.checking ? '' : o.at ? updClock(o.at) + ' 확인' : ''}</span>`
    + `<button type="button" class="updCheck" id="updCheck" data-upd-act="check"${o.checking ? ' disabled' : ''}>${o.checking ? '확인 중…' : '다시 확인'}</button></div></div>`;
  const hist = r && Array.isArray(r.history) ? r.history.filter((e) => e && e.version) : [];
  if (!hist.length) return h;
  h += '<div class="subhead">업데이트 내역 <span>최근 판부터</span></div><div class="updHist">';
  for (const e of hist) {
    const tag = e.version === cur ? '<span class="updTag" data-tone="cur">지금 판</span>'
      : st === 'available' && e.version === r.version ? '<span class="updTag" data-tone="new">새 판</span>' : '';
    h += `<div class="updHistItem"><div class="updHistHead"><b>${updEsc(e.version)}</b>${tag}<span class="updHistDate">${updEsc(updDate(e.date))}</span></div>${list(e.notes)}</div>`;
  }
  h += '</div>';
  const rb = hist.filter((e) => e.rollback && updCmp(e.version, cur) === -1);
  h += '<div class="subhead">이전 판으로 되돌리기 <span>새 판에 문제가 있을 때</span></div>'
    + '<p class="hint">업데이트 폴더에 남아 있는 옛 판을 다시 깔아요. 작업·배치·설정은 그대로예요.</p>';
  h += rb.length
    ? `<div class="updRb">${rb.map((e) => `<div class="updRbRow"><div class="updRbTxt"><b>${updEsc(e.version)}</b><span>${updEsc(meta(e))}</span></div>`
      + `<button type="button" data-upd-act="rollback" data-ver="${updEsc(e.version)}"${can ? '' : ' disabled'}>이 판으로 설치</button></div>`).join('')}</div>`
    : '<p class="updEmpty">되돌릴 수 있는 옛 판이 없어요 — 업데이트 폴더에 남은 옛 설치 파일이 없어요.</p>';
  return h;
}
// 묶음 안 버튼(그릴 때마다 새로 만들어지니 묶음 하나에 위임) — [다시 확인]·[업데이트하기]·[이 판으로 설치]
function updMenuClick(e) {
  const b = e && e.target && e.target.closest ? e.target.closest('[data-upd-act]') : null;
  if (!b || b.disabled) return;
  const act = b.dataset.updAct, r = _upd.last;
  if (act === 'check') { updFetch(); return; }
  if (act === 'install' && r && r.state === 'available') { _upd.shown = String(r.version); if (_closeMenu) _closeMenu(); updInstall(r); return; }
  if (act === 'rollback' && r && Array.isArray(r.history)) {
    const h = r.history.find((x) => x && x.version === b.dataset.ver);
    if (h) { if (_closeMenu) _closeMenu(); updRollbackAsk(h, r.current); }
  }
}
// 되돌리기 확인 팝업 — [되돌리기] = 저장 안 한 작업 묻기 → 받기 → 조용히 덮어 설치(updInstall rollback)
function updRollbackAsk(h, cur) {
  const v = String(h.version), c = String(cur || '');
  let go = false;
  const m = tossModal({
    title: `${updRo(v)} 되돌릴까요?`, sub: `날씨 CG ${c} → ${v}`, tone: 'blue',
    bodyHTML: `<div class="updMeta"><span>지금 <b>${updEsc(c)}</b></span><span>되돌릴 판 <b>${updEsc(v)}</b></span>${updDate(h.date) ? `<span>올린 날 ${updDate(h.date)}</span>` : ''}</div>`
      + `<p class="updLead">${updEsc(updRo(v))} 되돌려요 — 작업·배치·설정은 그대로예요. 설치 파일을 받아 확인한 뒤 앱이 잠깐 닫히고, 진행 창이 단계를 보여 드려요. ${updEsc(updI(v))} 깔리면 저절로 다시 켜져요.</p>`
      + `<p class="updHint">되돌린 뒤에는 ${updEsc(c)} 알림을 다시 띄우지 않아요(더 새 판이 올라오면 알려 드려요). 다시 올리려면 설정(렌치) 메뉴 ‘앱 업데이트’에서 [업데이트하기]를 누르세요. 관리자 확인 창이 뜨면 [예]를 눌러 주세요.</p>`,
    footHTML: '<button class="tossBtn ghost" data-cancel>취소</button><button class="tossBtn pri" data-go>되돌리기</button>',
  });
  m.card.classList.add('updCard');
  const ok = m.foot.querySelector('[data-go]');
  m.foot.querySelector('[data-cancel]').onclick = () => m.close();
  ok.onclick = () => {
    if (go) return;
    go = true; m.close();
    updInstall({ version: v, current: c, size: h.size, date: h.date, notes: updNotesOf(h.notes) }, { rollback: true });
  };
  popFocusIn(m.ov, ok, m.ov._opener);
  return m;
}

// ---------- 새 판 알림 팝업 ----------
// 지금 팝업을 띄우면 안 되는가 — 렌더(영상·이미지 추출·AE 보내기) 중·업데이트 진행 중·다른 토스 팝업이 떠 있음
function updBlocked() {
  let busy = '';
  try { busy = closeBusyWhat(); } catch (e) { busy = ''; }
  return !!busy || _upd.busy || !!document.getElementById('tossOv') || Date.now() - _upd.bootAt < UPD_BOOT_QUIET_MS;
}
// 새 판 알림 — 막혀 있으면 풀릴 때까지 1초마다 본다(마지막 알림 하나만)
function updShow(info, manual) {
  if (!info || !info.version || !updDesk()) return;
  // 저절로 온 알림은 판마다 한 번(메인은 첫 확인·화면이 뜰 때 둘 다 건넬 수 있다), 되돌리기 전 판까지는 저절로 안 띄움. 직접 확인은 늘 띄운다
  if (!manual && (info.version === _upd.shown || (_upd.pending && _upd.pending.info.version === info.version) || updSkipped(info.version))) return;
  _upd.pending = { info, manual: !!manual };
  updTryShow();
}
function updTryShow() {
  if (!_upd.pending) return;
  if (updBlocked()) {
    if (!_upd.waitT) _upd.waitT = setInterval(() => { if (!updBlocked()) { clearInterval(_upd.waitT); _upd.waitT = 0; updTryShow(); } }, 1000);
    return;
  }
  const { info } = _upd.pending;
  _upd.pending = null;
  updOpen(info);
}
function updLater(version) {
  const d = updDesk();
  if (d) { try { d.updateLater(version); } catch (e) { /* 옛 preload */ } }
  status('나중에 알려 드릴게요 — 설정(렌치) 메뉴의 ‘앱 업데이트’에서 언제든 설치할 수 있어요', true);
}
// '새 업데이트가 있습니다' 팝업
function updOpen(info) {
  const notes = updNotesOf(info.notes);
  _upd.shown = String(info.version);
  const meta = [`새 판 <b>${updEsc(info.version)}</b>`, info.current ? `지금 ${updEsc(info.current)}` : '',
    info.size ? `크기 ${updSize(info.size)}` : '', updDate(info.date) ? `올린 날 ${updDate(info.date)}` : ''].filter(Boolean);
  let decided = false;
  const m = tossModal({
    title: '새 업데이트가 있습니다', sub: `날씨 CG ${info.version}`, tone: 'blue',
    bodyHTML: `<div class="updMeta">${meta.map((x) => `<span>${x}</span>`).join('')}</div>`
      + (notes.length ? `<div class="updNotesHead">바뀐 점</div><ul class="updNotes">${notes.map((n) => `<li>${updEsc(n)}</li>`).join('')}</ul>`
        : '<p class="updNoNotes">바뀐 점 안내가 없어요.</p>')
      + '<p class="updHint">[지금 설치]를 누르면 설치 파일을 받아 확인한 뒤 앱이 잠깐 닫히고, 진행 창이 설치 단계를 보여 드려요. 새 판이 깔리면 저절로 다시 켜져요. 관리자 확인 창이 뜨면 [예]를 눌러 주세요.</p>',
    footHTML: '<button class="tossBtn ghost" data-later>나중에</button><button class="tossBtn pri" data-install>지금 설치</button>',
    onClose: () => { if (!decided) { decided = true; updLater(info.version); } },   // [나중에]·X·Esc·바깥 누르기
  });
  m.card.classList.add('updCard');
  const ins = m.foot.querySelector('[data-install]');
  m.foot.querySelector('[data-later]').onclick = () => m.close();
  ins.onclick = () => { if (decided) return; decided = true; m.close(); updInstall(info); };
  popFocusIn(m.ov, ins, m.ov._opener);
  // 다른 토스 팝업(부팅 공지 등)이 이 팝업을 밀어내면(tossModal 은 앞 모달을 onClose 없이 치운다) 그 팝업이 닫힌 뒤 다시 띄운다
  const watch = setInterval(() => {
    if (decided) { clearInterval(watch); return; }
    if (!m.ov.isConnected) { clearInterval(watch); _upd.shown = ''; updShow(info, true); }
  }, 1000);
  return m;
}

// ---------- 받기·설치(업데이트·되돌리기 공통) ----------
// 저장 안 한 작업 묻기 — 닫기 전 묻기(js/project-io.js closeAsk)를 그대로: 물을 것 없으면 곧바로 true, 팝업에서 [저장](저장함)·[저장 안 함]·[끄기] = true, [취소]·Esc = false
function updAskSave() {
  return new Promise((resolve) => {
    let done = false;
    const reply = (act) => { if (done || act === 'wait') return; done = true; resolve(act === 'close'); };
    try { closeAsk(-1, reply); } catch (e) { reply('stay'); }
  });
}
// info = { version, current, size, date, notes }, opt.rollback = 이전 판으로 되돌리기
async function updInstall(info, opt) {
  const rb = !!(opt && opt.rollback);
  if (!updDesk() || _upd.busy) return null;
  _upd.busy = true;
  try {
    if (!(await updAskSave())) {
      status(rb ? '되돌리기를 그만뒀어요 — 앱은 지금 판 그대로예요' : '업데이트를 미뤘어요 — 설정(렌치) 메뉴의 ‘앱 업데이트’에서 다시 할 수 있어요', true);
      return null;
    }
    return await updRun(info, opt);
  } finally { _upd.busy = false; }
}
// 받기·설치 — 진행 막대 팝업. 결과도 같은 팝업에(성공 = 곧 앱이 꺼짐 / 실패 = 까닭 + [닫기]·[다시 확인])
async function updRun(info, opt) {
  const rb = !!(opt && opt.rollback);
  const d = updDesk();
  const cur = String(info.current || (_upd.last && _upd.last.current) || '');
  let finished = false, cancelled = false;
  const m = tossModal({
    title: rb ? '이전 판 받는 중' : '업데이트 받는 중', sub: rb ? `날씨 CG ${cur} → ${info.version}` : `날씨 CG ${info.version}`, tone: 'blue',
    bodyHTML: '<div class="updBar"><i></i></div><div class="updProgTxt">설치 파일을 받는 중…</div>'
      + '<p class="updProgNote">받은 파일의 크기·확인값을 올린 것과 맞춰 본 뒤에만 설치해요.</p>',
    footHTML: '<button class="tossBtn ghost" data-cancel>취소</button>',
    onClose: () => { if (!finished) { cancelled = true; try { d.updateCancel(); } catch (e) { /* 옛 preload */ } } },
  });
  m.card.classList.add('updCard');
  const bar = m.body.querySelector('.updBar i'), txt = m.body.querySelector('.updProgTxt');
  m.foot.querySelector('[data-cancel]').onclick = () => m.close();
  const onProg = (p) => {
    if (finished || !p) return;
    // 받기·확인이 끝나고 진행 창(앱이 꺼진 뒤에도 단계를 보여 주는 창 — desktop/updater.js startUi)을 띄우는 중
    if (p.phase === 'handoff') { bar.style.width = '100%'; txt.textContent = '업데이트 진행 창을 여는 중…'; return; }
    if (!(p.total > 0)) return;
    const pct = Math.min(100, Math.floor(p.got / p.total * 100));
    bar.style.width = pct + '%';
    txt.textContent = p.got >= p.total ? '받은 파일을 확인하는 중…' : `설치 파일을 받는 중… ${pct}% (${updSize(p.got)} / ${updSize(p.total)})`;
  };
  if (typeof d.onUpdateProgress === 'function') d.onUpdateProgress(onProg);
  let r;
  try { r = await (rb ? d.updateInstall(info.version, { rollback: true }) : d.updateInstall(info.version)); } catch (e) { r = { ok: false, err: 'error' }; }
  finished = true;
  if (typeof d.onUpdateProgress === 'function') d.onUpdateProgress(null);
  const title = m.ov.querySelector('.tossTitle');
  if (r && r.ok) {
    bar.style.width = '100%';
    if (r.dry) {   // 시험(WCG_UPDATE_DRYRUN) — 설치 프로그램은 실행하지 않음
      title.textContent = '설치 직전까지 확인했어요';
      txt.textContent = '시험 모드 — 받은 파일의 크기·확인값이 맞아요. 설치 프로그램은 실행하지 않았어요.';
      m.foot.innerHTML = '<button class="tossBtn pri" data-ok>확인</button>';
      m.foot.querySelector('[data-ok]').onclick = () => m.close();
    } else {
      // 되돌리기 — 떠나는 판(cur)까지는 저절로 팝업 안 띄움(문제가 있어 내려온 판을 다시 권하지 않게)
      if (rb && updCmp(cur, info.version) === 1) updStoreSet(UPD_SKIP_KEY, cur);
      title.textContent = rb ? '되돌리기를 시작했어요' : '설치를 시작했어요';
      // r.ui = 진행 창이 떠서 이어 맡음(앱은 0.6초 뒤 꺼짐), 아니면 조용한 설치(진행 창 없음 — 앱은 1.5초 뒤 꺼짐)
      txt.textContent = r.ui ? '진행 창에서 설치 단계를 보여 드려요. 앱은 곧 닫혀요.'
        : rb ? `곧 앱이 닫히고 ${updI(info.version)} 켜져요.` : '곧 앱이 닫히고 새 판이 켜져요.';
      m.foot.innerHTML = '';
    }
    return r;
  }
  if (cancelled || (r && r.err === 'cancelled')) {
    if (m.ov.isConnected && !m.ov.classList.contains('popClosing')) m.close();
    status(rb ? '되돌리기를 취소했어요 — 앱은 지금 판 그대로예요' : '업데이트를 취소했어요 — 앱은 지금 판 그대로예요', true);
    return r;
  }
  // 실패 — 같은 팝업에 까닭(머리 빨강) + [닫기]·[다시 확인]
  m.ov.querySelector('.tossHead').dataset.tone = 'red';
  title.textContent = rb ? '되돌리지 못했어요' : '업데이트하지 못했어요';
  m.body.innerHTML = `<p class="updErr">${updEsc(updErrText(r))}</p><p class="updProgNote">앱은 지금 판${cur ? `(${updEsc(cur)})` : ''} 그대로예요.</p>`;
  m.foot.innerHTML = '<button class="tossBtn ghost" data-close>닫기</button><button class="tossBtn pri" data-retry>다시 확인</button>';
  m.foot.querySelector('[data-close]').onclick = () => m.close();
  m.foot.querySelector('[data-retry]').onclick = () => { m.close(); updCheckNow(); };
  return r;
}

// 부팅 배선(js/boot.js) — 메뉴 묶음(데스크톱만 보임)·묶음 안 버튼·메인의 새 판 알림 받기
function updWire() {
  _upd.bootAt = Date.now();
  const d = updDesk();
  const g = $('#cfgUpdGroup');
  if (g) g.hidden = !d;
  const box = $('#updBox');
  if (box) box.onclick = d ? updMenuClick : null;
  updMenuRender();
  if (d && typeof d.onUpdate === 'function') {
    d.onUpdate((info) => {
      if (!info || info.state !== 'available') return;
      _upd.last = info; _upd.lastAt = Date.now();
      updBadge();
      updMenuRender();
      updShow(info, false);
    });
  }
}
