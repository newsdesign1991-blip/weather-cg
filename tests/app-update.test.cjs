// 앱 업데이트 — 웹앱 쪽(js/app-update.js)을 앱 코드 그대로(vm) 가짜 환경에서 돌린다: '새 업데이트가 있습니다' 팝업(판·바뀐 점·크기·올린 날),
// [나중에]·닫기 = updateLater, 렌더 중·다른 팝업이면 끝난 뒤, [지금 설치] = 닫기 전 묻기(closeAsk) → 받기 진행 → 결과(성공·실패·취소·시험),
// 설정(렌치) 메뉴 '앱 업데이트'(10-12 — 지금 판·상태·새 판 바뀐 점·[업데이트하기]·내역·이전 판으로 되돌리기·[다시 확인]), 새 판이면 빨간 렌치 깜빡임 유지,
// 되돌리기(확인 팝업 → 같은 받기 길 { rollback: true } → 되돌리기 전 판은 저절로 안 권함). 마크업·배선은 글자로.
// 실제 앱(데스크톱 메인 + 시험 폴더)은 WCG_BOOT_CHECK=1 일 때 app-update.boot-eval.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html')).replace(/\r\n/g, '\n');
const between = (a, b) => { const i = html.indexOf(a); assert.notEqual(i, -1, a); const j = html.indexOf(b, i); assert.notEqual(j, -1, b); return html.slice(i, j); };
const UPD_SRC = between('// ===================== 앱 업데이트', 'let dropHintReset = () =>');
const bootJs = fs.readFileSync(path.join(root, 'js', 'boot.js'), 'utf8').replace(/\r\n/g, '\n');

// 가짜 토스 모달 — 새 모달은 앞 모달을 onClose 없이 치운다(진짜 tossModal 과 같음). 버튼은 data-* 이름
function fakeModal(log) {
  const parse = (h) => { const b = {}; for (const m of String(h || '').matchAll(/<button class="([^"]*)" data-(\w+)>([^<]*)<\/button>/g)) b[m[2]] = { cls: m[1], label: m[3], onclick: null }; return b; };
  return (opt) => {
    if (log.open && !log.open.closed) log.open.dispose();
    const md = { opt, title: opt.title, sub: opt.sub, tone: opt.tone, bodyHTML: opt.bodyHTML, footHTML: opt.footHTML, btns: parse(opt.footHTML), closed: false, cls: [] };
    const titleEl = { get textContent() { return md.title; }, set textContent(v) { md.title = v; } };
    md.headEl = { dataset: { tone: opt.tone } };
    md.bar = { style: { width: '' } }; md.txt = { textContent: '' };
    md.ov = { isConnected: true, _opener: null, classList: { contains: (c) => c === 'popClosing' && md.closed }, querySelector: (s) => (s === '.tossTitle' ? titleEl : s === '.tossHead' ? md.headEl : null) };
    md.body = { get innerHTML() { return md.bodyHTML; }, set innerHTML(v) { md.bodyHTML = v; }, querySelector: (s) => (s === '.updBar i' ? md.bar : s === '.updProgTxt' ? md.txt : null) };
    md.foot = { get innerHTML() { return md.footHTML; }, set innerHTML(v) { md.footHTML = v; md.btns = parse(v); }, querySelector: (s) => md.btns[/data-(\w+)/.exec(s)[1]] || null };
    md.card = { classList: { add: (c) => md.cls.push(c) } };
    md.close = () => { if (md.closed) return; md.closed = true; md.ov.isConnected = false; if (opt.onClose) opt.onClose(); };
    md.dispose = () => { md.closed = true; md.ov.isConnected = false; };
    md.click = (k) => { assert.ok(md.btns[k], `버튼 ${k} 없음: ${Object.keys(md.btns)}`); md.btns[k].onclick(); };
    md.labels = () => Object.values(md.btns).map((b) => b.label);
    log.open = md; log.modals.push(md);
    return md;
  };
}
const INFO = { state: 'available', version: '1.0.1', current: '1.0.0', size: 180769112, date: '2026-10-12T09:00:00.000Z', notes: ['기상청 받기 빨라짐', '<b>굵게</b> & 꺾쇠'], file: 'WeatherCG-Setup-1.0.1.exe' };
function makeCtx(o = {}) {
  const log = { modals: [], open: null, status: [], later: [], installs: [], installOpts: [], checks: 0, cancels: 0, menuClosed: 0, asks: [] };
  const timers = [];
  let progCb = null, updateCb = null;
  const desk = o.web ? undefined : {
    isDesktop: true,
    updateCheck: async () => { log.checks++; return typeof o.check === 'function' ? o.check() : (o.check || { state: 'latest', current: '1.0.0', version: '1.0.0' }); },
    updateLater: (v) => { log.later.push(v); return Promise.resolve({ ok: true }); },
    updateInstall: (v, o) => { log.installs.push(v); log.installOpts.push(o); return new Promise((res) => { log.finishInstall = res; }); },
    updateCancel: () => { log.cancels++; if (log.finishInstall) log.finishInstall({ ok: false, err: 'cancelled' }); return Promise.resolve(true); },
    onUpdate: (cb) => { updateCb = cb; },
    onUpdateProgress: (cb) => { progCb = cb; },
  };
  // 가짜 요소 — 묶음(#cfgUpdGroup)·묶음 안(#updBox)·렌치(#helperBtn)·메뉴 드롭다운(#menuDrop — 열림·cfg 섹션 보임)
  const el = () => { const set = new Set(); return { hidden: true, innerHTML: '', onclick: null, title: '', dataset: {}, attrs: {}, set,
    classList: { toggle: (c, on) => { if (on) set.add(c); else set.delete(c); }, contains: (c) => set.has(c), add: (c) => set.add(c), remove: (c) => set.delete(c) },
    setAttribute(k, v) { this.attrs[k] = v; } }; };
  const group = el(), box = el(), wrench = el(), drop = el();
  const cfgSec = { style: { display: 'none' } };
  drop.querySelector = (s) => (s === '.sec[data-sec="cfg"]' ? cfgSec : null);
  const store = new Map(o.store || []);
  const btn = group;   // 옛 이름(배선 시험) — 이제 묶음이 보이고 숨는다
  const ctx = {
    console, Promise, JSON, Math, Array, String, Number, Object,
    window: { wcgDesktop: desk },
    document: { getElementById: (id) => (id === 'tossOv' && ((log.open && !log.open.closed) || ctx.otherPop) ? {} : null) },
    $: (s) => ({ '#cfgUpdGroup': group, '#updBox': box, '#helperBtn': wrench, '#menuDrop': drop })[s] || null,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    HELPER_BTN_TIP: '설정 — 앱 업데이트',
    status: (m, hold, tone) => log.status.push([m, tone || '']),
    popFocusIn: () => {},
    closeBusyWhat: () => ctx.busy || '',
    busy: '', otherPop: false,
    _closeMenu: () => { log.menuClosed++; drop.classList.remove('on'); cfgSec.style.display = 'none'; },
    // 닫기 전 묻기 흉내 — ask = 'close'(물을 것 없음) | ['wait', 'close'|'stay'](팝업 → 나중에 고름)
    closeAsk: (id, reply) => {
      log.asks.push(id);
      const a = ctx.ask || 'close';
      if (typeof a === 'string') { reply(a, id); return; }
      reply('wait', id); log.answerAsk = () => reply(a[1], id);
    },
    setInterval: (fn, ms) => { const t = { fn, ms, on: true }; timers.push(t); return t; },
    clearInterval: (t) => { if (t) t.on = false; },
  };
  vm.createContext(ctx);
  ctx.tossModal = fakeModal(log);
  vm.runInContext(UPD_SRC, ctx, { filename: 'app-update.js' });
  // 시험에서는 부팅 직후 기다림(UPD_BOOT_QUIET_MS)을 건너뛴다 — 그 기다림 자체는 따로 본다(updWireRaw)
  ctx.updWireRaw = ctx.updWire;
  ctx.updWire = () => { ctx.updWireRaw(); vm.runInContext('_upd.bootAt = 0', ctx); };
  const tick = async () => { for (const t of timers.filter((x) => x.on)) t.fn(); await new Promise((r) => setImmediate(r)); };
  const flush = () => new Promise((r) => setImmediate(r));
  // 메뉴 열기 흉내(setupMenus — cfg 섹션 보이고 updMenuOpened)
  const openMenu = () => { drop.classList.add('on'); cfgSec.style.display = ''; ctx.updMenuOpened(); };
  // 묶음 안 버튼 누르기(위임) — data-upd-act·data-ver 로 찾는다
  const clickBox = (act, ver) => {
    const re = new RegExp('<button[^>]*data-upd-act="' + act + '"' + (ver ? '[^>]*data-ver="' + ver.replace(/\./g, '\\.') + '"' : '') + '[^>]*>');
    const m = re.exec(box.innerHTML);
    assert.ok(m, act + ' 버튼 없음: ' + box.innerHTML.slice(0, 300));
    const b = { disabled: / disabled[ >]/.test(m[0]), dataset: { updAct: act, ver } };
    box.onclick({ target: { closest: () => b } });
  };
  return { ctx, log, btn, group, box, wrench, drop, store, timers, tick, flush, openMenu, clickBox, notify: (i) => updateCb && updateCb(i), progress: (p) => progCb && progCb(p), hasProg: () => !!progCb };
}

test('배선 — 웹판(다리 없음)은 메뉴 묶음 숨김·알림 안 받음, 데스크톱은 묶음 보이고(안을 그림) 버튼 위임·알림 받기', () => {
  const w = makeCtx({ web: true });
  w.ctx.updWire();
  assert.equal(w.group.hidden, true); assert.equal(w.box.onclick, null);
  const d = makeCtx();
  d.ctx.updWire();
  assert.equal(d.group.hidden, false); assert.equal(typeof d.box.onclick, 'function');
  assert.match(d.box.innerHTML, /아직 확인 안 함/);
  d.notify({ state: 'latest' });
  assert.equal(d.log.modals.length, 0, '새 판이 아니면 아무것도 안 띄움');
  assert.equal(d.wrench.classList.contains('updNew'), false);
});

test('새 판 알림 → 팝업(제목·판·지금 판·크기·올린 날·바뀐 점 글자로), [나중에]·Esc = 이번 실행 동안 안 띄움 요청', () => {
  const { ctx, log, notify } = makeCtx();
  ctx.updWire();
  notify(INFO);
  const m = log.open;
  assert.equal(m.title, '새 업데이트가 있습니다');
  assert.equal(m.sub, '날씨 CG 1.0.1');
  assert.ok(m.cls.includes('updCard'));
  assert.match(m.bodyHTML, /새 판 <b>1\.0\.1<\/b>/);
  assert.match(m.bodyHTML, /지금 1\.0\.0/);
  assert.match(m.bodyHTML, /크기 172\.4MB/);
  assert.match(m.bodyHTML, /올린 날 2026\.10\.12/);
  assert.match(m.bodyHTML, /<li>기상청 받기 빨라짐<\/li>/);
  assert.match(m.bodyHTML, /<li>&lt;b&gt;굵게&lt;\/b&gt; &amp; 꺾쇠<\/li>/, '바뀐 점은 글자로(주입 안전)');
  assert.deepEqual(m.labels(), ['나중에', '지금 설치']);
  m.click('later');
  assert.deepEqual(log.later, ['1.0.1']);
  assert.match(log.status.at(-1)[0], /나중에 알려 드릴게요/);
  notify(INFO);
  assert.equal(log.modals.length, 1, '같은 판을 메인이 또 건네도(화면이 다시 뜰 때 등) 저절로는 한 번만');
  notify({ ...INFO, version: '1.0.2' });
  assert.equal(log.modals.length, 2, '더 새 판은 띄움');
  log.open.close();   // X·Esc·바깥 누르기 = 나중에
  assert.deepEqual(log.later, ['1.0.1', '1.0.2']);
  assert.equal(log.installs.length, 0);
});

test('부팅 직후 3.5초는 띄우지 않는다 — 부팅 공지·둘러보기가 나중에 떠서 업데이트·받기 팝업을 밀어내지 않게', async () => {
  const { ctx, log, notify, tick } = makeCtx();
  ctx.updWireRaw();
  assert.match(UPD_SRC, /const UPD_BOOT_QUIET_MS = 3500;/);
  notify(INFO);
  await tick();
  assert.equal(log.modals.length, 0, '부팅 직후엔 기다림');
  vm.runInContext('_upd.bootAt = Date.now() - UPD_BOOT_QUIET_MS - 1', ctx);
  await tick();
  assert.equal(log.modals.length, 1);
  assert.equal(log.open.title, '새 업데이트가 있습니다');
});

test('렌더(영상·이미지·AE) 중이거나 다른 토스 팝업이 떠 있으면 끝난 뒤에 띄운다', async () => {
  const { ctx, log, notify, tick } = makeCtx();
  ctx.updWire();
  ctx.busy = 'render';
  notify(INFO);
  assert.equal(log.modals.length, 0, '렌더 중엔 안 띄움');
  await tick(); assert.equal(log.modals.length, 0);
  ctx.busy = ''; ctx.otherPop = true;   // 렌더는 끝났는데 공지 팝업이 떠 있음
  await tick(); assert.equal(log.modals.length, 0);
  ctx.otherPop = false;
  await tick();
  assert.equal(log.modals.length, 1);
  assert.equal(log.open.title, '새 업데이트가 있습니다');
  await tick(); assert.equal(log.modals.length, 1, '한 번만');
});

test('부팅 공지 등 다른 토스 팝업이 업데이트 팝업을 밀어내면 그 팝업이 닫힌 뒤 다시 뜬다(나중에로 치지 않음)', async () => {
  const { ctx, log, notify, tick } = makeCtx();
  ctx.updWire();
  notify(INFO);
  const first = log.open;
  ctx.tossModal({ title: '새 공지', footHTML: '' });   // 공지가 위에 뜸 — 업데이트 팝업은 onClose 없이 치워짐
  assert.equal(first.closed, true);
  assert.deepEqual(log.later, [], '밀려난 것은 나중에가 아님');
  await tick();
  assert.equal(log.modals.length, 2, '공지가 떠 있는 동안은 기다림');
  log.open.close();   // 공지 닫힘
  await tick(); await tick();
  assert.equal(log.modals.length, 3);
  assert.equal(log.open.title, '새 업데이트가 있습니다');
});

test('[지금 설치] — 저장할 것 없으면 곧바로 받기 → 진행 막대 → 성공(곧 앱이 꺼짐), 겹쳐 누르기 막음', async () => {
  const { ctx, log, notify, progress, flush } = makeCtx();
  ctx.updWire();
  notify(INFO);
  log.open.click('install');
  await flush();
  assert.deepEqual(log.asks, [-1], '닫기 전 묻기를 그대로 거친다');
  assert.deepEqual(log.installs, ['1.0.1']);
  const m = log.open;
  assert.equal(m.title, '업데이트 받는 중');
  assert.deepEqual(m.labels(), ['취소']);
  progress({ got: 90384556, total: 180769112 });
  assert.equal(m.bar.style.width, '50%');
  assert.equal(m.txt.textContent, '설치 파일을 받는 중… 50% (86.2MB / 172.4MB)');
  progress({ got: 180769112, total: 180769112 });
  assert.equal(m.txt.textContent, '받은 파일을 확인하는 중…');
  progress({ phase: 'handoff' });   // 받기·확인 끝 — 진행 창(앱이 꺼진 뒤에도 단계를 보여 주는 창)을 띄우는 중
  assert.equal(m.txt.textContent, '업데이트 진행 창을 여는 중…');
  assert.equal(m.bar.style.width, '100%');
  await ctx.updInstall(INFO);   // 받는 중 또 누름 — 무시
  assert.equal(log.installs.length, 1);
  log.finishInstall({ ok: true, version: '1.0.1', ui: true });
  await flush(); await flush();
  assert.equal(m.title, '설치를 시작했어요');
  assert.equal(m.txt.textContent, '진행 창에서 설치 단계를 보여 드려요. 앱은 곧 닫혀요.', '진행 창이 떠서 이어 맡음');
  assert.equal(m.footHTML, '', '누를 것 없음');
  assert.equal(m.bar.style.width, '100%');
});

test('[지금 설치] — 저장 안 한 변경: 팝업에서 [취소]면 설치 안 함, [저장]·[저장 안 함]이면 받기', async () => {
  const a = makeCtx();
  a.ctx.updWire(); a.ctx.ask = ['wait', 'stay'];
  a.notify(INFO); a.log.open.click('install'); await a.flush();
  assert.equal(a.log.installs.length, 0, '묻는 중엔 아직');
  a.log.answerAsk(); await a.flush();
  assert.equal(a.log.installs.length, 0, '취소면 설치 안 함');
  assert.match(a.log.status.at(-1)[0], /업데이트를 미뤘어요/);
  const b = makeCtx();
  b.ctx.updWire(); b.ctx.ask = ['wait', 'close'];
  b.notify(INFO); b.log.open.click('install'); await b.flush();
  b.log.answerAsk(); await b.flush();
  assert.deepEqual(b.log.installs, ['1.0.1']);
});

test('실패 — 확인값 다름·폴더에 못 닿음은 같은 팝업에 빨간 머리·까닭, [다시 확인] = 곧바로 확인', async () => {
  for (const [err, re] of [['sha', /확인값 불일치/], ['size', /크기·확인값 불일치/], ['unreachable', /업데이트 폴더에 닿지 못했어요/], ['spawn', /보안 프로그램/], ['dev', /개발판에서는/], ['changed', /올라온 판이 바뀌었어요/]]) {
    const { ctx, log, notify, flush } = makeCtx();
    ctx.updWire(); notify(INFO); log.open.click('install'); await flush();
    log.finishInstall({ ok: false, err }); await flush(); await flush();
    const m = log.open;
    assert.equal(m.headEl.dataset.tone, 'red', err);
    assert.equal(m.title, '업데이트하지 못했어요');
    assert.match(m.bodyHTML, re, err);
    assert.match(m.bodyHTML, /앱은 지금 판\(1\.0\.0\) 그대로예요/);
    assert.deepEqual(m.labels(), ['닫기', '다시 확인']);
    if (err === 'sha') { m.click('retry'); await flush(); assert.equal(log.checks, 1, '다시 확인'); }
  }
});

test('받는 중 취소(X·Esc·[취소]) — 메인에 멈춤 요청, 알림만(팝업 닫힘)', async () => {
  const { ctx, log, notify, flush } = makeCtx();
  ctx.updWire(); notify(INFO); log.open.click('install'); await flush();
  log.open.click('cancel');
  await flush(); await flush();
  assert.equal(log.cancels, 1);
  assert.match(log.status.at(-1)[0], /업데이트를 취소했어요/);
  assert.equal(log.modals.at(-1).closed, true);
});

test('시험(WCG_UPDATE_DRYRUN) 결과 — 설치 직전까지 확인했다는 안내 + [확인]', async () => {
  const { ctx, log, notify, flush } = makeCtx();
  ctx.updWire(); notify(INFO); log.open.click('install'); await flush();
  log.finishInstall({ ok: true, dry: true, version: '1.0.1' }); await flush(); await flush();
  assert.equal(log.open.title, '설치 직전까지 확인했어요');
  assert.match(log.open.txt.textContent, /설치 프로그램은 실행하지 않았어요/);
  assert.deepEqual(log.open.labels(), ['확인']);
});

test('곧바로 확인(updCheckNow — 실패 팝업의 [다시 확인]) — 확인 중엔 메뉴 [다시 확인] 막음, 결과 알림(최신·없음·못 닿음·깨짐), 새 판이면 메뉴 닫고 팝업(나중에 고른 판도)', async () => {
  const cases = [
    [{ state: 'latest', current: '1.0.0', version: '1.0.0' }, /최신 판이에요 — 앱 1\.0\.0/, 'ok'],
    [{ state: 'none', current: '1.0.0' }, /올라온 업데이트가 없어요/, 'ok'],
    [{ state: 'unreachable', current: '1.0.0' }, /업데이트 폴더에 닿지 못했어요 — 사내망\(R: 드라이브\)/, 'warn'],
    [{ state: 'bad', current: '1.0.0' }, /latest\.json/, 'warn'],
    [null, /확인하지 못했어요/, 'warn'],
  ];
  for (const [res, re, tone] of cases) {
    const { ctx, log, box } = makeCtx({ check: () => { assert.match(box.innerHTML, /id="updCheck" data-upd-act="check" disabled>확인 중…<\/button>/); return res; } });
    ctx.updWire();
    await ctx.updCheckNow();
    assert.match(box.innerHTML, /data-upd-act="check">다시 확인<\/button>/);
    assert.match(log.status.at(-1)[0], re); assert.equal(log.status.at(-1)[1], tone);
    assert.equal(log.modals.length, 0);
  }
  const { ctx, log } = makeCtx({ check: INFO });
  ctx.updWire();
  await ctx.updCheckNow();
  assert.equal(log.menuClosed, 1);
  assert.equal(log.open.title, '새 업데이트가 있습니다');
});

test('마크업·모양 — 설정 메뉴 맨 위 숨긴 \'앱 업데이트\' 묶음(#updBox), 맨 아래 줄은 상태 줄만, 렌치 깜빡임(움직임 줄이기면 점만), 이모지 없음, 부팅 배선, 팝업 모양', () => {
  const cfgStart = html.indexOf('<div class="sec pinned" data-sec="cfg">');
  const g = html.indexOf('<div class="cfgGroup" id="cfgUpdGroup" hidden>');
  assert.ok(cfgStart > 0 && g > cfgStart && g < html.indexOf('id="cfgPresetGroup"'), '설정(렌치) 메뉴 맨 위, 처음엔 숨김(웹판)');
  assert.ok(html.indexOf('<div class="updBox" id="updBox"></div>') > g);
  const line = /<div class="helperLine">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(line && /id="helperRow"/.test(line[1]) && !/updCheck/.test(line[1]), '맨 아래 줄 = 상태 줄만([다시 확인]은 묶음 안)');
  assert.equal(html.split('id="updCheck"').length - 1, 1, '[다시 확인] id 는 묶음 그림(updMenuHTML)에만');
  assert.match(html, /\.cfgGroup\[hidden\] \{ display: none; \}/);
  assert.match(html, /\.helperLine > \.helperRow \{ margin-top: 0; flex: 1 1 auto; width: auto; min-width: 0; \}/);
  assert.match(html, /\.tossCard\.updCard \.updBar i \{/);
  assert.match(html, /\.updHist \{ max-height: 196px; overflow-y: auto;/, '내역은 길면 묶음 안에서 스크롤');
  assert.match(html, /#titlebar #helperBtn\.updNew \{ color: var\(--danger\); animation: updBreath 2\.6s ease-in-out infinite; \}/);
  assert.match(html, /#titlebar #helperBtn\.updNew::after\s*\{[^}]*background: var\(--danger\)/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{ #titlebar #helperBtn\.updNew \{ animation: none; \} \}/, '움직임 줄이기면 빨간색 고정');
  assert.ok(!/\p{Extended_Pictographic}/u.test(UPD_SRC + html.slice(g, g + 400)), '이모지 없음');
  assert.match(bootJs, /\nupdWire\(\);/);
  assert.ok(bootJs.indexOf('updWire();') > bootJs.indexOf('setTimeout(checkHelperFreshOnBoot'), '부팅 끝 쪽');
  // 팝업은 토스 카드 모달(tossModal) — 따로 만든 창 없음
  assert.match(UPD_SRC, /tossModal\(\{\n\s*title: '새 업데이트가 있습니다'/);
  assert.doesNotMatch(UPD_SRC, /createElement\('div'\)/);
});

// ── 설정(렌치) 메뉴 '앱 업데이트'·렌치 깜빡임·이전 판으로 되돌리기(10-12) ──
const HIST = [
  { version: '1.0.2', date: '2026-10-20T09:00:00.000Z', size: 180000000, notes: ['새 판 바뀐 점'], rollback: false },
  { version: '1.0.1', date: '2026-10-15T09:00:00.000Z', size: 179000000, notes: ['지금 판 바뀐 점', '<i>꺾쇠</i>'], rollback: false },
  { version: '1.0.0', date: '2026-10-12T09:00:00.000Z', size: 178000000, notes: ['첫 정식판'], rollback: true },
  { version: '0.9.0', date: '2026-10-01T09:00:00.000Z', size: 170000000, notes: [], rollback: false },
];
const AVAIL = { state: 'available', current: '1.0.1', packaged: true, canInstall: true, version: '1.0.2', size: 180000000, date: '2026-10-20T09:00:00.000Z', notes: ['새 판 바뀐 점'], file: 'WeatherCG-Setup-1.0.2.exe', history: HIST };

test('메뉴 그림(updMenuHTML) — 지금 판·상태 알약(최신·새 판·폴더에 못 닿음·개발판·점검 모드), 새 판이면 바뀐 점·[업데이트하기], 내역(지금 판·새 판 표시, 글자로), 되돌리기는 파일이 남은 낮은 판만', () => {
  const { ctx } = makeCtx();
  const H = (r, o) => ctx.updMenuHTML(r, o || {});
  const a = H(AVAIL, { at: new Date(2026, 9, 20, 15, 7).getTime() });
  assert.match(a, /<span class="updNowLbl">지금 판<\/span><b class="updNowVer">1\.0\.1<\/b><span class="updPill" data-tone="new">새 판 1\.0\.2 있어요<\/span>/);
  assert.match(a, /<div class="updNewHead"><b>1\.0\.2<\/b><span>2026\.10\.20 · 171\.7MB<\/span><\/div><ul class="updList"><li>새 판 바뀐 점<\/li><\/ul>/);
  assert.match(a, /<button type="button" class="pri" data-upd-act="install">업데이트하기<\/button>/);
  assert.match(a, /<span class="updWhen">15:07 확인<\/span>/);
  assert.match(a, /<div class="subhead">업데이트 내역 <span>최근 판부터<\/span><\/div>/);
  assert.ok(a.indexOf('<b>1.0.2</b><span class="updTag" data-tone="new">새 판</span>') > 0, '새 판 표시');
  assert.ok(a.indexOf('<b>1.0.1</b><span class="updTag" data-tone="cur">지금 판</span>') > 0, '지금 판 표시');
  assert.match(a, /<li>&lt;i&gt;꺾쇠&lt;\/i&gt;<\/li>/, '바뀐 점은 글자로(주입 안전)');
  assert.ok(a.indexOf('<b>1.0.2</b>') < a.indexOf('<b>1.0.1</b>') && a.indexOf('<b>1.0.1</b>') < a.indexOf('<b>0.9.0</b>'), '최근 판부터');
  assert.match(a, /<div class="subhead">이전 판으로 되돌리기 <span>새 판에 문제가 있을 때<\/span><\/div>/);
  assert.match(a, /<div class="updRbRow"><div class="updRbTxt"><b>1\.0\.0<\/b><span>2026\.10\.12 · 169\.8MB<\/span><\/div><button type="button" data-upd-act="rollback" data-ver="1\.0\.0">이 판으로 설치<\/button><\/div>/);
  assert.doesNotMatch(a, /data-ver="0\.9\.0"/, '파일이 정리된 판은 되돌리기 목록에 없음');
  const latest = H({ state: 'latest', current: '1.0.1', version: '1.0.1', packaged: true, canInstall: true, history: HIST.slice(1).map((h) => ({ ...h, rollback: false })) });
  assert.match(latest, /data-tone="ok">최신이에요</);
  assert.doesNotMatch(latest, /data-upd-act="install"/);
  assert.match(latest, /되돌릴 수 있는 옛 판이 없어요/);
  const off = H({ state: 'unreachable', current: '1.0.1', packaged: true, canInstall: true });
  assert.match(off, /data-tone="warn">업데이트 폴더에 못 닿아요</);
  assert.match(off, /사내망\(R: 드라이브\)에 연결돼 있는지 확인해 주세요/);
  assert.doesNotMatch(off, /업데이트 내역|이전 판으로 되돌리기/, '내역을 못 받았으면 내역·되돌리기 칸 없음');
  const dev = H({ ...AVAIL, packaged: false, canInstall: false });
  assert.match(dev, /<span class="updDev">개발판<\/span>/);
  assert.match(dev, /data-upd-act="install" disabled>업데이트하기/);
  assert.match(dev, /data-upd-act="rollback" data-ver="1\.0\.0" disabled>/);
  assert.match(dev, /개발판은 업데이트·되돌리기를 하지 않아요/);
  assert.match(H({ state: 'unreachable', why: 'test-mode', current: '1.0.0', packaged: false, canInstall: false }), /점검 모드 — 확인 안 함/);
  assert.match(H(null, { checking: true, appVersion: '1.0.0' }), /<b class="updNowVer">1\.0\.0<\/b><span class="updPill" data-tone="muted">확인 중…<\/span>/);
  assert.match(H(null, { checking: true }), /data-upd-act="check" disabled>확인 중…/);
  assert.match(H({ state: 'bad', current: '1.0.0' }), /업데이트 정보를 못 읽어요/);
  assert.ok(!/\p{Extended_Pictographic}/u.test(a + dev), '이모지 없음');
});

test('렌치 깜빡임 — 새 판이면 나중에·메뉴 열기·재확인 뒤에도 유지; 오래된 확인은 갱신', async () => {
  const { ctx, wrench, store, notify, openMenu, flush, log } = makeCtx({ check: AVAIL });
  ctx.updWire();
  assert.equal(wrench.classList.contains('updNew'), false);
  notify(AVAIL);
  assert.equal(wrench.classList.contains('updNew'), true, '새 판 = 깜빡임');
  assert.equal(wrench.title, '설정 — 새 판 1.0.2가 있어요(앱 업데이트)');
  assert.equal(wrench.dataset.updTip, wrench.title, 'applyHelperState 가 툴팁을 다시 쓸 때 쓰는 값');
  log.open.click('later');
  assert.equal(wrench.classList.contains('updNew'), true, '나중에도 계속 깜빡임');
  openMenu();
  assert.equal(wrench.classList.contains('updNew'), true, '메뉴를 열어도 계속 깜빡임');
  assert.equal(store.has('wcg_upd_seen'), false, '본 판을 기록할 필요 없음');
  assert.match(wrench.title, /새 판 1\.0\.2/);
  assert.equal(log.checks, 0, '방금 받은 알림이면 다시 확인 안 함');
  notify(AVAIL);
  assert.equal(wrench.classList.contains('updNew'), true, '같은 판을 다시 알려도 유지');
  ctx._closeMenu();
  notify({ ...AVAIL, version: '1.0.3', history: [{ ...HIST[0], version: '1.0.3' }, ...HIST] });
  assert.equal(wrench.classList.contains('updNew'), true, '다음 새 판에 다시');
  // 메뉴를 다시 열 때 마지막 확인이 1분 넘었으면 다시 확인
  vm.runInContext('_upd.lastAt = Date.now() - UPD_MENU_STALE_MS - 1', ctx);
  openMenu();
  await flush(); await flush();
  assert.equal(log.checks, 1, '오래된 확인이면 열 때 다시');
  assert.equal(wrench.classList.contains('updNew'), true, '메뉴 안에서 재확인해도 새 판이면 유지');
  // 다시 다른 시험: 처음 연 메뉴(아직 확인 안 함) = 곧바로 확인
  const b = makeCtx({ check: { state: 'latest', current: '1.0.2', version: '1.0.2', packaged: true, canInstall: true, history: [] } });
  b.ctx.updWire(); b.openMenu(); await b.flush(); await b.flush();
  assert.equal(b.log.checks, 1);
  assert.match(b.box.innerHTML, /최신이에요/);
  assert.equal(b.wrench.classList.contains('updNew'), false, '최신 판은 깜빡이지 않음');
});

test('렌치 깜빡임 — 옛 본 판 기록이 남아도 켜지고 최신/업데이트 없음 확인 뒤에는 색·툴팁 복귀', async () => {
  let result = AVAIL;
  const c = makeCtx({ store: [['wcg_upd_seen', '9.9.9']], check: () => result });
  c.ctx.updWire();
  c.openMenu(); await c.flush(); await c.flush();
  assert.equal(c.wrench.classList.contains('updNew'), true);
  for (const state of ['latest', 'none']) {
    result = { ...AVAIL, state, current: AVAIL.version };
    await c.ctx.updFetch(); await c.flush();
    assert.equal(c.wrench.classList.contains('updNew'), false, state);
    assert.equal(c.wrench.dataset.updTip, undefined);
    assert.equal(c.wrench.title, '설정 — 앱 업데이트');
    result = AVAIL;
    await c.ctx.updFetch(); await c.flush();
    assert.equal(c.wrench.classList.contains('updNew'), true);
  }
});

test('메뉴 [업데이트하기] — 메뉴 닫고 저장 묻기 → 같은 받기 길(나중에 고른 판도), [다시 확인] = 확인만', async () => {
  const { ctx, log, notify, openMenu, clickBox, flush } = makeCtx({ check: AVAIL });
  ctx.updWire();
  notify(AVAIL);
  log.open.click('later');   // 팝업은 나중에 — 메뉴에선 언제든
  assert.deepEqual(log.later, ['1.0.2']);
  openMenu();
  clickBox('check'); await flush(); await flush();
  assert.equal(log.checks, 1);
  clickBox('install'); await flush();
  assert.equal(log.menuClosed, 1, '메뉴 닫음');
  assert.deepEqual(log.asks, [-1], '저장 묻기 그대로');
  assert.deepEqual(log.installs, ['1.0.2']);
  assert.equal(log.installOpts[0], undefined, '보통 업데이트(되돌리기 아님)');
  assert.equal(log.open.title, '업데이트 받는 중');
});

test('이전 판으로 되돌리기 — 확인 팝업(판·그대로인 것·다시 올리는 법) → 저장 묻기 → { rollback: true } 받기 → \'되돌리기를 시작했어요\', 되돌리기 전 판은 저절로 다시 권하지 않음(더 새 판은 권함)', async () => {
  const { ctx, log, store, wrench, openMenu, clickBox, notify, flush, tick } = makeCtx({ check: { ...AVAIL, state: 'latest', current: '1.0.2', version: '1.0.2' } });
  ctx.updWire();
  openMenu(); await flush(); await flush();
  clickBox('rollback', '1.0.0');
  assert.equal(log.menuClosed, 1);
  const c = log.open;
  assert.equal(c.title, '1.0.0으로 되돌릴까요?');
  assert.equal(c.sub, '날씨 CG 1.0.2 → 1.0.0');
  assert.match(c.bodyHTML, /지금 <b>1\.0\.2<\/b>/); assert.match(c.bodyHTML, /되돌릴 판 <b>1\.0\.0<\/b>/);
  assert.match(c.bodyHTML, /1\.0\.0으로 되돌려요 — 작업·배치·설정은 그대로예요/);
  assert.match(c.bodyHTML, /1\.0\.0이 깔리면 저절로 다시 켜져요/);
  assert.match(c.bodyHTML, /1\.0\.2 알림을 다시 띄우지 않아요/);
  assert.deepEqual(c.labels(), ['취소', '되돌리기']);
  c.click('go'); await flush();
  assert.deepEqual(log.asks, [-1]);
  assert.deepEqual(log.installs, ['1.0.0']);
  assert.equal(JSON.stringify(log.installOpts[0]), '{"rollback":true}');
  const m = log.open;
  assert.equal(m.title, '이전 판 받는 중'); assert.equal(m.sub, '날씨 CG 1.0.2 → 1.0.0');
  log.finishInstall({ ok: true, version: '1.0.0', ui: false, rollback: true }); await flush(); await flush();
  assert.equal(m.title, '되돌리기를 시작했어요');
  assert.equal(m.txt.textContent, '곧 앱이 닫히고 1.0.0이 켜져요.', '진행 창 없이 조용한 설치 — 앱이 꺼지기 전 한 줄');
  assert.equal(store.get('wcg_upd_skip'), '1.0.2', '되돌리기 전 판');
  // 되돌린 판(1.0.0)으로 다시 켜진 뒤 — 1.0.2 팝업은 안 띄우지만 렌치 알림은 유지, 메뉴에선 [업데이트하기]
  const after = makeCtx({ store: [['wcg_upd_skip', '1.0.2']], check: { ...AVAIL, current: '1.0.0' } });
  after.ctx.updWire();
  after.notify({ ...AVAIL, current: '1.0.0' });
  await after.tick();
  assert.equal(after.log.modals.length, 0, '되돌리기 전 판은 저절로 안 권함');
  assert.equal(after.wrench.classList.contains('updNew'), true, '팝업을 생략해도 새 판 표시는 유지');
  after.openMenu();
  assert.match(after.box.innerHTML, /data-upd-act="install">업데이트하기/, '메뉴에선 다시 올릴 수 있음');
  after.ctx._closeMenu();
  after.notify({ ...AVAIL, current: '1.0.0', version: '1.0.3' });
  assert.equal(after.log.open.title, '새 업데이트가 있습니다', '더 새 판은 권함');
  assert.equal(after.wrench.classList.contains('updNew'), true);
});

test('되돌리기 — [취소]·저장 묻기 취소·받기 실패(빨간 머리 \'되돌리지 못했어요\')·시험(DRYRUN)은 되돌리기 전 판을 기억하지 않음', async () => {
  const base = { check: { ...AVAIL, state: 'latest', current: '1.0.2', version: '1.0.2' } };
  const a = makeCtx(base);
  a.ctx.updWire(); a.openMenu(); await a.flush(); await a.flush();
  a.clickBox('rollback', '1.0.0'); a.log.open.click('cancel');
  assert.equal(a.log.installs.length, 0);
  const b = makeCtx(base);
  b.ctx.updWire(); b.ctx.ask = ['wait', 'stay']; b.openMenu(); await b.flush(); await b.flush();
  b.clickBox('rollback', '1.0.0'); b.log.open.click('go'); await b.flush();
  b.log.answerAsk(); await b.flush();
  assert.equal(b.log.installs.length, 0);
  assert.match(b.log.status.at(-1)[0], /되돌리기를 그만뒀어요/);
  const c = makeCtx(base);
  c.ctx.updWire(); c.openMenu(); await c.flush(); await c.flush();
  c.clickBox('rollback', '1.0.0'); c.log.open.click('go'); await c.flush();
  c.log.finishInstall({ ok: false, err: 'missing' }); await c.flush(); await c.flush();
  assert.equal(c.log.open.title, '되돌리지 못했어요');
  assert.equal(c.log.open.headEl.dataset.tone, 'red');
  assert.match(c.log.open.bodyHTML, /그 판의 설치 파일이 없어요/);
  assert.match(c.log.open.bodyHTML, /앱은 지금 판\(1\.0\.2\) 그대로예요/);
  assert.equal(c.store.has('wcg_upd_skip'), false);
  const d = makeCtx(base);
  d.ctx.updWire(); d.openMenu(); await d.flush(); await d.flush();
  d.clickBox('rollback', '1.0.0'); d.log.open.click('go'); await d.flush();
  d.log.finishInstall({ ok: true, dry: true, version: '1.0.0', rollback: true }); await d.flush(); await d.flush();
  assert.equal(d.log.open.title, '설치 직전까지 확인했어요');
  assert.equal(d.store.has('wcg_upd_skip'), false, '시험은 기억 안 함');
  assert.equal(d.ctx.updRo('1.0.1') + '|' + d.ctx.updRo('1.0.3') + '|' + d.ctx.updI('1.0.2') + '|' + d.ctx.updI('1.0.10'), '1.0.1로|1.0.3으로|1.0.2가|1.0.10이');
});

// ── 실제 앱(부팅 점검기 + 시험 업데이트 폴더) — WCG_BOOT_CHECK=1 일 때만 ──
// 개발판 Electron 을 점검 모드로 띄우고 WCG_UPDATE_DIR = 임시 폴더(가짜 설치 파일 + latest.json), WCG_UPDATE_DRYRUN = 1(실행 직전까지), 첫 확인 0.8초.
function bootRun(dir) {
  const raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=6000', '--size=1600x900', '--keepalive', '--eval=' + path.join(__dirname, 'app-update.boot-eval.js')],
    { encoding: 'utf8', timeout: 300000, env: { ...process.env, WCG_UPDATE_DIR: dir, WCG_UPDATE_DRYRUN: '1', WCG_UPDATE_FIRST_MS: '800' } });
  return JSON.parse(raw.slice(raw.indexOf('{')));
}
// 시험 업데이트 폴더 — 새 판 9.9.9(가짜 설치 파일) + 되돌리기용 옛 판 0.0.1(개발판 1.0.0 보다 낮음) + latest.json(history)
function bootShare(o = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-upd-boot-'));
  const mk = (version, bytes) => {
    const body = crypto.randomBytes(bytes);
    const file = 'WeatherCG-Setup-' + version + '.exe';
    fs.writeFileSync(path.join(dir, file), body);
    return { version, file, sha256: crypto.createHash('sha256').update(body).digest('hex'), size: body.length };
  };
  const top = { ...mk('9.9.9', 3 * 1024 * 1024), date: '2026-10-12T09:00:00Z', notes: ['시험 판 — 바뀐 점 한 줄'] };
  if (o.badSha) top.sha256 = 'e'.repeat(64);
  const old = { ...mk('0.0.1', 1024 * 1024 + 7), date: '2026-10-01T09:00:00Z', notes: ['되돌리기 시험용 옛 판'] };
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ ...top, history: [top, old] }));
  return dir;
}
const bootTemp = (n) => path.join(os.tmpdir(), 'wcg-update', 'WeatherCG-Setup-' + n + '.exe');
test('부팅 점검: 실제 앱 — 저절로 알림 팝업·빨간 렌치 깜빡임 유지·나중에·설정 메뉴·[업데이트하기](시험) 진행 100%·되돌리기(시험), 확인값 다르면 빨간 실패', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const good = bootShare();
  try {
    const out = bootRun(good);
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    const R = out.evalResult;
    assert.ok(R && !R.error, JSON.stringify(R));
    assert.deepEqual(R.api, { updateCheck: 'function', onUpdate: 'function', updateInstall: 'function' });
    assert.equal(R.groupVisible, true, '데스크톱이면 앱 업데이트 묶음 보임');
    assert.deepEqual(R.hiddenGroups, [true, true], '배치·설정 옮기기 묶음은 숨김');
    assert.equal(R.auto.title, '새 업데이트가 있습니다', '켠 뒤 저절로');
    assert.match(R.auto.body, /새 판 9\.9\.9/); assert.match(R.auto.body, /시험 판 — 바뀐 점 한 줄/); assert.match(R.auto.body, /크기 3MB/);
    assert.deepEqual(R.auto.buttons, ['나중에', '지금 설치']);
    assert.equal(R.badge.on, true, '새 판 = 렌치 깜빡임'); assert.equal(R.badge.anim, 'updBreath'); assert.match(R.badge.title, /새 판 9\.9\.9/);
    assert.equal(R.afterLater, false, '나중에 = 닫힘');
    assert.equal(R.menu.visible, true);
    assert.equal(R.menu.pill, '새 판 9.9.9 있어요', '나중에 고른 판도 메뉴에선 보임');
    assert.equal(R.menu.cur, JSON.parse(fs.readFileSync(path.join(root, 'desktop', 'package.json'), 'utf8')).version);
    assert.equal(R.menu.newVer, '9.9.9'); assert.deepEqual(R.menu.newNotes, ['시험 판 — 바뀐 점 한 줄']);
    assert.equal(R.menu.install, true, '[업데이트하기] 켜짐(시험 DRYRUN)');
    assert.deepEqual(R.menu.hist, ['9.9.9', '0.0.1']);
    assert.deepEqual(R.menu.rollback, ['0.0.1']);
    assert.equal(R.menu.histScroll, 'auto');
    assert.equal(R.badgeAfterMenu, true, '메뉴를 열어도 깜빡임 유지');
    assert.equal(R.badge.dot, R.badge.danger, '업데이트 점은 테마의 빨간색');
    assert.equal(R.badge.infinite, 'infinite');
    assert.notEqual(R.badge.phase0, R.badge.phase1, '주기 안에서 렌치 색이 바뀜');
    assert.ok(R.badge.phase1Pixel.every((v, i) => Math.abs(v - R.badge.dangerPixel[i]) <= 1), '강조 시 렌치는 빨간색');
    assert.equal(R.install.ask, false, '시작 화면 = 저장 묻기 없음');
    assert.equal(R.install.title, '설치 직전까지 확인했어요');
    assert.equal(R.install.bar, '100%');
    assert.ok(R.install.sawProgress, '진행 막대가 움직였다');
    assert.equal(R.menuClosedOnInstall, true);
    assert.equal(R.rbAsk.title, '0.0.1로 되돌릴까요?');
    assert.deepEqual(R.rbAsk.buttons, ['취소', '되돌리기']);
    assert.equal(R.rollback.title, '설치 직전까지 확인했어요', '되돌리기도 같은 길(시험)');
    assert.equal(R.rollback.bar, '100%');
    assert.ok(fs.existsSync(bootTemp('0.0.1')), '임시 폴더에 확인한 옛 판 사본');
  } finally { fs.rmSync(good, { recursive: true, force: true }); for (const n of ['9.9.9', '0.0.1']) fs.rmSync(bootTemp(n), { force: true }); }
  const bad = bootShare({ badSha: true });
  try {
    const out = bootRun(bad);
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    const R = out.evalResult;
    assert.equal(R.install.title, '업데이트하지 못했어요');
    assert.equal(R.install.tone, 'red');
    assert.match(R.install.body, /확인값 불일치/);
    assert.ok(!fs.existsSync(bootTemp('9.9.9')) && !fs.existsSync(bootTemp('9.9.9') + '.partial'), '확인값이 다르면 사본을 남기지 않음');
  } finally { fs.rmSync(bad, { recursive: true, force: true }); for (const n of ['9.9.9', '0.0.1']) fs.rmSync(bootTemp(n), { force: true }); }
});
