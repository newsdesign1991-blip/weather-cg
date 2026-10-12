// 앱 업데이트 — 웹앱 쪽(js/app-update.js)을 앱 코드 그대로(vm) 가짜 환경에서 돌린다: '새 업데이트가 있습니다' 팝업(판·바뀐 점·크기·올린 날),
// [나중에]·닫기 = updateLater, 렌더 중·다른 팝업이면 끝난 뒤, [지금 설치] = 닫기 전 묻기(closeAsk) → 받기 진행 → 결과(성공·실패·취소·시험),
// 설정 메뉴 '업데이트 확인'(결과 알림·새 판이면 메뉴 닫고 팝업). 마크업·배선은 글자로. 실제 앱(데스크톱 메인 + 시험 폴더)은 WCG_BOOT_CHECK=1 일 때 app-update.boot-eval.js.
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
  const log = { modals: [], open: null, status: [], later: [], installs: [], checks: 0, cancels: 0, menuClosed: 0, asks: [] };
  const timers = [];
  let progCb = null, updateCb = null;
  const desk = o.web ? undefined : {
    isDesktop: true,
    updateCheck: async () => { log.checks++; return typeof o.check === 'function' ? o.check() : (o.check || { state: 'latest', current: '1.0.0', version: '1.0.0' }); },
    updateLater: (v) => { log.later.push(v); return Promise.resolve({ ok: true }); },
    updateInstall: (v) => { log.installs.push(v); return new Promise((res) => { log.finishInstall = res; }); },
    updateCancel: () => { log.cancels++; if (log.finishInstall) log.finishInstall({ ok: false, err: 'cancelled' }); return Promise.resolve(true); },
    onUpdate: (cb) => { updateCb = cb; },
    onUpdateProgress: (cb) => { progCb = cb; },
  };
  const btn = { hidden: true, disabled: false, textContent: '업데이트 확인', title: '', onclick: null };
  const ctx = {
    console, Promise, JSON, Math, Array, String, Number, Object,
    window: { wcgDesktop: desk },
    document: { getElementById: (id) => (id === 'tossOv' && ((log.open && !log.open.closed) || ctx.otherPop) ? {} : null) },
    $: (s) => (s === '#updCheck' ? btn : null),
    status: (m, hold, tone) => log.status.push([m, tone || '']),
    popFocusIn: () => {},
    closeBusyWhat: () => ctx.busy || '',
    busy: '', otherPop: false,
    _closeMenu: () => { log.menuClosed++; },
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
  const tick = async () => { for (const t of timers.filter((x) => x.on)) t.fn(); await new Promise((r) => setImmediate(r)); };
  const flush = () => new Promise((r) => setImmediate(r));
  return { ctx, log, btn, timers, tick, flush, notify: (i) => updateCb && updateCb(i), progress: (p) => progCb && progCb(p), hasProg: () => !!progCb };
}

test('배선 — 웹판(다리 없음)은 버튼 숨김·알림 안 받음, 데스크톱은 버튼 보이고 알림 받기', () => {
  const w = makeCtx({ web: true });
  w.ctx.updWire();
  assert.equal(w.btn.hidden, true); assert.equal(w.btn.onclick, null);
  const d = makeCtx();
  d.ctx.updWire();
  assert.equal(d.btn.hidden, false); assert.equal(typeof d.btn.onclick, 'function');
  d.notify({ state: 'latest' });
  assert.equal(d.log.modals.length, 0, '새 판이 아니면 아무것도 안 띄움');
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
  await ctx.updInstall(INFO);   // 받는 중 또 누름 — 무시
  assert.equal(log.installs.length, 1);
  log.finishInstall({ ok: true, version: '1.0.1' });
  await flush(); await flush();
  assert.equal(m.title, '설치를 시작했어요');
  assert.equal(m.txt.textContent, '앱이 곧 닫혀요. 새 판이 깔리면 저절로 다시 켜져요.');
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

test('설정 메뉴 \'업데이트 확인\' — 확인 중 버튼 막음, 결과 알림(최신·없음·못 닿음·깨짐), 새 판이면 메뉴 닫고 팝업(나중에 고른 판도)', async () => {
  const cases = [
    [{ state: 'latest', current: '1.0.0', version: '1.0.0' }, /최신 판이에요 — 앱 1\.0\.0/, 'ok'],
    [{ state: 'none', current: '1.0.0' }, /올라온 업데이트가 없어요/, 'ok'],
    [{ state: 'unreachable', current: '1.0.0' }, /업데이트 폴더에 닿지 못했어요 — 사내망\(R: 드라이브\)/, 'warn'],
    [{ state: 'bad', current: '1.0.0' }, /latest\.json/, 'warn'],
    [null, /확인하지 못했어요/, 'warn'],
  ];
  for (const [res, re, tone] of cases) {
    const { ctx, log, btn } = makeCtx({ check: () => { assert.equal(btn.disabled, true); assert.equal(btn.textContent, '확인 중…'); return res; } });
    ctx.updWire();
    await ctx.updCheckNow();
    assert.equal(btn.disabled, false); assert.equal(btn.textContent, '업데이트 확인');
    assert.match(log.status.at(-1)[0], re); assert.equal(log.status.at(-1)[1], tone);
    assert.match(btn.title, re);
    assert.equal(log.modals.length, 0);
  }
  const { ctx, log } = makeCtx({ check: INFO });
  ctx.updWire();
  await ctx.updCheckNow();
  assert.equal(log.menuClosed, 1);
  assert.equal(log.open.title, '새 업데이트가 있습니다');
});

test('마크업·모양 — 설정 메뉴 맨 아래 줄(상태 줄 옆) 숨긴 [업데이트 확인], 이모지 없음, [hidden] 지킴, 부팅 배선, 팝업 모양', () => {
  const line = /<div class="helperLine">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(line, '.helperLine');
  assert.ok(line[1].indexOf('id="helperRow"') < line[1].indexOf('id="updCheck"'), '상태 줄(앱 판) 옆');
  const b = /<button[^>]*id="updCheck"[^>]*>([^<]*)<\/button>/.exec(line[1]);
  assert.ok(b && / hidden[ >]/.test(b[0]), '처음엔 숨김(웹판)');
  assert.equal(b[1], '업데이트 확인');
  const cfgStart = html.indexOf('<div class="sec pinned" data-sec="cfg">');
  assert.ok(cfgStart > 0 && html.indexOf('id="updCheck"') > cfgStart, '설정(렌치) 메뉴 안');
  assert.match(html, /\.updCheck\[hidden\] \{ display: none; \}/);
  assert.match(html, /\.helperLine > \.helperRow \{ margin-top: 0; flex: 1 1 auto; width: auto; min-width: 0; \}/);
  assert.match(html, /\.tossCard\.updCard \.updBar i \{/);
  assert.ok(!/\p{Extended_Pictographic}/u.test(UPD_SRC + b[0]), '이모지 없음');
  assert.match(bootJs, /\nupdWire\(\);/);
  assert.ok(bootJs.indexOf('updWire();') > bootJs.indexOf('setTimeout(checkHelperFreshOnBoot'), '부팅 끝 쪽');
  // 팝업은 토스 카드 모달(tossModal) — 따로 만든 창 없음
  assert.match(UPD_SRC, /tossModal\(\{\n\s*title: '새 업데이트가 있습니다'/);
  assert.doesNotMatch(UPD_SRC, /createElement\('div'\)/);
});

// ── 실제 앱(부팅 점검기 + 시험 업데이트 폴더) — WCG_BOOT_CHECK=1 일 때만 ──
// 개발판 Electron 을 점검 모드로 띄우고 WCG_UPDATE_DIR = 임시 폴더(가짜 설치 파일 + latest.json), WCG_UPDATE_DRYRUN = 1(실행 직전까지), 첫 확인 0.8초.
function bootRun(dir) {
  const raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=6000', '--size=1600x900', '--keepalive', '--eval=' + path.join(__dirname, 'app-update.boot-eval.js')],
    { encoding: 'utf8', timeout: 300000, env: { ...process.env, WCG_UPDATE_DIR: dir, WCG_UPDATE_DRYRUN: '1', WCG_UPDATE_FIRST_MS: '800' } });
  return JSON.parse(raw.slice(raw.indexOf('{')));
}
function bootShare(o = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-upd-boot-'));
  const body = crypto.randomBytes(3 * 1024 * 1024);
  const file = 'WeatherCG-Setup-9.9.9.exe';
  fs.writeFileSync(path.join(dir, file), body);
  const sha256 = o.badSha ? 'e'.repeat(64) : crypto.createHash('sha256').update(body).digest('hex');
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ version: '9.9.9', file, sha256, size: body.length, date: '2026-10-12T09:00:00Z', notes: ['시험 판 — 바뀐 점 한 줄'] }));
  return dir;
}
test('부팅 점검: 실제 앱 — 저절로 알림 팝업·나중에·설정 메뉴로 다시 확인·지금 설치(시험) 진행 100%, 확인값 다르면 빨간 실패', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const good = bootShare();
  try {
    const out = bootRun(good);
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    const R = out.evalResult;
    assert.ok(R && !R.error, JSON.stringify(R));
    assert.deepEqual(R.api, { updateCheck: 'function', onUpdate: 'function', updateInstall: 'function' });
    assert.equal(R.btnVisible, true, '데스크톱이면 [업데이트 확인] 보임');
    assert.equal(R.auto.title, '새 업데이트가 있습니다', '켠 뒤 저절로');
    assert.match(R.auto.body, /새 판 9\.9\.9/); assert.match(R.auto.body, /시험 판 — 바뀐 점 한 줄/); assert.match(R.auto.body, /크기 3MB/);
    assert.deepEqual(R.auto.buttons, ['나중에', '지금 설치']);
    assert.equal(R.afterLater, false, '나중에 = 닫힘');
    assert.equal(R.manual.title, '새 업데이트가 있습니다', '설정 메뉴 확인은 나중에 고른 판도 보임');
    assert.equal(R.install.ask, false, '시작 화면 = 저장 묻기 없음');
    assert.equal(R.install.title, '설치 직전까지 확인했어요');
    assert.equal(R.install.bar, '100%');
    assert.ok(R.install.sawProgress, '진행 막대가 움직였다');
    assert.ok(fs.existsSync(path.join(os.tmpdir(), 'wcg-update', 'WeatherCG-Setup-9.9.9.exe')), '임시 폴더에 확인한 사본');
  } finally { fs.rmSync(good, { recursive: true, force: true }); fs.rmSync(path.join(os.tmpdir(), 'wcg-update', 'WeatherCG-Setup-9.9.9.exe'), { force: true }); }
  const bad = bootShare({ badSha: true });
  try {
    const out = bootRun(bad);
    assert.equal(out.ok, true, JSON.stringify(out.errors));
    const R = out.evalResult;
    assert.equal(R.install.title, '업데이트하지 못했어요');
    assert.equal(R.install.tone, 'red');
    assert.match(R.install.body, /확인값 불일치/);
    assert.ok(!fs.existsSync(path.join(os.tmpdir(), 'wcg-update', 'WeatherCG-Setup-9.9.9.exe')) && !fs.existsSync(path.join(os.tmpdir(), 'wcg-update', 'WeatherCG-Setup-9.9.9.exe.partial')), '확인값이 다르면 사본을 남기지 않음');
  } finally { fs.rmSync(bad, { recursive: true, force: true }); }
});
