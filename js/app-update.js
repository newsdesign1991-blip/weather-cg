/* [모듈] js/app-update.js — 앱 업데이트(데스크톱, 10-12): '새 업데이트가 있습니다' 토스 팝업(판·바뀐 점·크기, [나중에]·[지금 설치] — 렌더 중이면 끝난 뒤), 저장 안 한 작업 묻기 → 받기 진행·결과, 설정 메뉴 '업데이트 확인'(지금 판 옆) */
'use strict';

// ===================== 앱 업데이트 =====================
// 메인(desktop/updater.js — main.js)이 공유 폴더의 latest.json 을 보고 새 판을 알리면(preload onUpdate) 팝업을 띄운다(updShow).
//  [나중에]·닫기·Esc = 이번 실행 동안 그 판은 저절로 다시 안 뜸(updateLater — 설정 메뉴 '업데이트 확인'으로는 언제든).
//  [지금 설치] = 저장 안 한 작업 묻기(닫기 전 묻기 closeAsk 그대로 — [저장]·[저장 안 함]·[취소], 렌더·AE 보내는 중도) → 메인이 설치 파일을 %TEMP% 로 받으며
//  크기·sha256 확인(진행 막대, [취소]) → 조용히 설치하고 앱을 끈다(설치 프로그램이 같은 자리에 덮어 깔고 새 판을 다시 켠다). 실패면 같은 팝업에 까닭.
// 렌더(영상·이미지 추출·AE 보내기) 중이거나 다른 토스 팝업(공지 등)이 떠 있으면 끝난 뒤에 띄운다(1초마다 확인).
// 웹판·옛 데스크톱(wcgDesktop.updateCheck 없음)은 아무것도 안 한다(설정 메뉴 버튼도 숨김). 부팅 배선은 js/boot.js 의 updWire().
const _upd = { pending: null, waitT: 0, checking: false, busy: false, shown: '' };   // shown = 이 화면에서 띄운(고른) 판 — 메인이 같은 판을 또 건네도 한 번만
const updEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function updDesk() { const d = window.wcgDesktop; return d && typeof d.updateCheck === 'function' ? d : null; }
function updSize(n) { n = +n || 0; return n >= 1048576 ? (Math.round(n / 1048576 * 10) / 10) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
function updDate(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; }
// 확인 결과 → 알림 글·색(설정 메뉴 '업데이트 확인')
function updResultView(r) {
  const cur = r && r.current ? String(r.current) : '';   // status()는 글자(textContent)로 쓴다
  switch (r && r.state) {
    case 'available': return { text: `새 판 ${r.version}이 있어요 — 지금 ${cur}`, tone: 'ok' };
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
    case 'not-newer': return '이미 최신 판이에요.';
    case 'missing': return '업데이트 폴더에 설치 파일이 없어요 — 담당자에게 알려 주세요.';
    case 'size': case 'sha': return '받은 설치 파일이 올린 것과 달라요(크기·확인값 불일치) — 설치하지 않았어요. 담당자에게 알려 주세요.';
    case 'path': case 'bad': return '업데이트 정보가 올바르지 않아요 — 설치하지 않았어요. 담당자에게 알려 주세요.';
    case 'copy': case 'write': return '설치 파일을 받지 못했어요 — 디스크 공간과 사내망 연결을 확인해 주세요.';
    case 'spawn': return '설치 프로그램을 실행하지 못했어요 — 보안 프로그램이 막았을 수 있어요.';
    case 'dev': return '개발판에서는 설치하지 않아요 — 설치판에서 업데이트해 주세요.';
    case 'busy': return '이미 업데이트를 진행하고 있어요.';
    case 'denied': return '이 창에서는 업데이트할 수 없어요.';
    default: return '업데이트하지 못했어요 — 잠시 뒤 다시 해 주세요.';
  }
}
// 지금 팝업을 띄우면 안 되는가 — 렌더(영상·이미지 추출·AE 보내기) 중·업데이트 진행 중·다른 토스 팝업이 떠 있음
function updBlocked() {
  let busy = '';
  try { busy = closeBusyWhat(); } catch (e) { busy = ''; }
  return !!busy || _upd.busy || !!document.getElementById('tossOv');
}
// 새 판 알림 — 막혀 있으면 풀릴 때까지 1초마다 본다(마지막 알림 하나만)
function updShow(info, manual) {
  if (!info || !info.version || !updDesk()) return;
  // 저절로 온 알림은 판마다 한 번(메인은 첫 확인·화면이 뜰 때 둘 다 건넬 수 있다). 설정 메뉴 '업데이트 확인'은 늘 띄운다
  if (!manual && (info.version === _upd.shown || (_upd.pending && _upd.pending.info.version === info.version))) return;
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
  status('나중에 알려 드릴게요 — 설정(렌치) 메뉴의 ‘업데이트 확인’으로 언제든 설치할 수 있어요', true);
}
// '새 업데이트가 있습니다' 팝업
function updOpen(info) {
  const notes = (Array.isArray(info.notes) ? info.notes : []).filter((n) => typeof n === 'string' && n.trim());
  _upd.shown = String(info.version);
  const meta = [`새 판 <b>${updEsc(info.version)}</b>`, info.current ? `지금 ${updEsc(info.current)}` : '',
    info.size ? `크기 ${updSize(info.size)}` : '', updDate(info.date) ? `올린 날 ${updDate(info.date)}` : ''].filter(Boolean);
  let decided = false;
  const m = tossModal({
    title: '새 업데이트가 있습니다', sub: `날씨 CG ${info.version}`, tone: 'blue',
    bodyHTML: `<div class="updMeta">${meta.map((x) => `<span>${x}</span>`).join('')}</div>`
      + (notes.length ? `<div class="updNotesHead">바뀐 점</div><ul class="updNotes">${notes.map((n) => `<li>${updEsc(n)}</li>`).join('')}</ul>`
        : '<p class="updNoNotes">바뀐 점 안내가 없어요.</p>')
      + '<p class="updHint">[지금 설치]를 누르면 설치 파일을 받아 확인한 뒤 앱이 잠깐 닫히고, 새 판이 깔리면 저절로 다시 켜져요. 관리자 확인 창이 뜨면 [예]를 눌러 주세요.</p>',
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
// 저장 안 한 작업 묻기 — 닫기 전 묻기(js/project-io.js closeAsk)를 그대로: 물을 것 없으면 곧바로 true, 팝업에서 [저장](저장함)·[저장 안 함]·[끄기] = true, [취소]·Esc = false
function updAskSave() {
  return new Promise((resolve) => {
    let done = false;
    const reply = (act) => { if (done || act === 'wait') return; done = true; resolve(act === 'close'); };
    try { closeAsk(-1, reply); } catch (e) { reply('stay'); }
  });
}
async function updInstall(info) {
  if (!updDesk() || _upd.busy) return null;
  _upd.busy = true;
  try {
    if (!(await updAskSave())) { status('업데이트를 미뤘어요 — 설정(렌치) 메뉴의 ‘업데이트 확인’에서 다시 할 수 있어요', true); return null; }
    return await updRun(info);
  } finally { _upd.busy = false; }
}
// 받기·설치 — 진행 막대 팝업. 결과도 같은 팝업에(성공 = 곧 앱이 꺼짐 / 실패 = 까닭 + [닫기]·[다시 확인])
async function updRun(info) {
  const d = updDesk();
  let finished = false, cancelled = false;
  const m = tossModal({
    title: '업데이트 받는 중', sub: `날씨 CG ${info.version}`, tone: 'blue',
    bodyHTML: '<div class="updBar"><i></i></div><div class="updProgTxt">설치 파일을 받는 중…</div>'
      + '<p class="updProgNote">받은 파일의 크기·확인값을 올린 것과 맞춰 본 뒤에만 설치해요.</p>',
    footHTML: '<button class="tossBtn ghost" data-cancel>취소</button>',
    onClose: () => { if (!finished) { cancelled = true; try { d.updateCancel(); } catch (e) { /* 옛 preload */ } } },
  });
  m.card.classList.add('updCard');
  const bar = m.body.querySelector('.updBar i'), txt = m.body.querySelector('.updProgTxt');
  m.foot.querySelector('[data-cancel]').onclick = () => m.close();
  const onProg = (p) => {
    if (finished || !p || !(p.total > 0)) return;
    const pct = Math.min(100, Math.floor(p.got / p.total * 100));
    bar.style.width = pct + '%';
    txt.textContent = p.got >= p.total ? '받은 파일을 확인하는 중…' : `설치 파일을 받는 중… ${pct}% (${updSize(p.got)} / ${updSize(p.total)})`;
  };
  if (typeof d.onUpdateProgress === 'function') d.onUpdateProgress(onProg);
  let r;
  try { r = await d.updateInstall(info.version); } catch (e) { r = { ok: false, err: 'error' }; }
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
      title.textContent = '설치를 시작했어요';
      txt.textContent = '앱이 곧 닫혀요. 새 판이 깔리면 저절로 다시 켜져요.';
      m.foot.innerHTML = '';
    }
    return r;
  }
  if (cancelled || (r && r.err === 'cancelled')) {
    if (m.ov.isConnected && !m.ov.classList.contains('popClosing')) m.close();
    status('업데이트를 취소했어요 — 앱은 지금 판 그대로예요', true);
    return r;
  }
  // 실패 — 같은 팝업에 까닭(머리 빨강) + [닫기]·[다시 확인]
  m.ov.querySelector('.tossHead').dataset.tone = 'red';
  title.textContent = '업데이트하지 못했어요';
  m.body.innerHTML = `<p class="updErr">${updEsc(updErrText(r))}</p><p class="updProgNote">앱은 지금 판${info.current ? `(${updEsc(info.current)})` : ''} 그대로예요.</p>`;
  m.foot.innerHTML = '<button class="tossBtn ghost" data-close>닫기</button><button class="tossBtn pri" data-retry>다시 확인</button>';
  m.foot.querySelector('[data-close]').onclick = () => m.close();
  m.foot.querySelector('[data-retry]').onclick = () => { m.close(); updCheckNow(); };
  return r;
}
// 설정(렌치) 메뉴 '업데이트 확인' — 곧바로 확인하고 결과를 알린다(새 판이면 메뉴를 닫고 팝업)
async function updCheckNow() {
  const d = updDesk();
  if (!d || _upd.checking) return null;
  const b = $('#updCheck');
  _upd.checking = true;
  if (b) { b.disabled = true; b.textContent = '확인 중…'; }
  let r = null;
  try { r = await d.updateCheck(); } catch (e) { r = null; }
  finally { _upd.checking = false; if (b) { b.disabled = false; b.textContent = '업데이트 확인'; } }
  const v = updResultView(r);
  if (b) b.title = v.text;
  if (r && r.state === 'available') { if (_closeMenu) _closeMenu(); updShow(r, true); }
  else status(v.text, true, v.tone);
  return r;
}
// 부팅 배선(js/boot.js) — 설정 메뉴 버튼(데스크톱만 보임)·메인의 새 판 알림 받기
function updWire() {
  const d = updDesk();
  const b = $('#updCheck');
  if (b) { b.hidden = !d; b.onclick = d ? () => { updCheckNow(); } : null; }
  if (d && typeof d.onUpdate === 'function') d.onUpdate((info) => { if (info && info.state === 'available') updShow(info, false); });
}
