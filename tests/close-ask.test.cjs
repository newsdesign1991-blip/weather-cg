// 닫기 전 묻기(데스크톱) — '저장하지 않은 변경' 판정(js/map-build.js 바뀜 번호 + js/project-io.js 서명 비교)과
// 웹앱 쪽 물음 흐름(closeAsk — 바로 답·팝업 하나·[저장]/[저장 안 함]/[취소]·렌더 중)을 앱 코드 그대로(vm) 돌려 본다.
// 배선(main.js·preload.js·boot.js)은 글자로, 실제 앱 흐름은 WCG_BOOT_CHECK=1 일 때 부팅 점검기로(close-ask.boot-eval.js).
// 메인 쪽 순서·안전장치(시간 제한·팝업 하나)는 desktop/test/close-guard.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html')).replace(/\r\n/g, '\n');
const mainJs = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const preloadJs = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8').replace(/\r\n/g, '\n');
const between = (a, b, from = 0) => {
  const i = html.indexOf(a, from); assert.notEqual(i, -1, a + ' 없음');
  const j = html.indexOf(b, i); assert.notEqual(j, -1, b + ' 없음');
  return html.slice(i, j);
};
const fnSrc = (name) => { const m = new RegExp(`(async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html); assert.ok(m, name + ' 없음'); return m[0]; };
const UNDO_SRC = between('const undoStack = [], redoStack = [];', 'function updateUndoBtns()');
const CLOSE_SRC = between('// ===== 저장하지 않은 변경', '// 스포이드', html.indexOf('// ===== 저장하지 않은 변경'));

// 가짜 토스 모달 — 연 옵션·닫힘을 기록, 버튼은 data-* 이름으로
function fakeModal(log) {
  return (opt) => {
    const btns = {};
    for (const m of opt.footHTML.matchAll(/<button class="([^"]*)" data-(\w+)>([^<]*)<\/button>/g)) btns[m[2]] = { cls: m[1], label: m[3], onclick: null };
    const ov = { isConnected: true, _opener: null, classList: { contains: () => false } };
    let closed = false;
    const close = () => { if (closed) return; closed = true; ov.isConnected = false; if (opt.onClose) opt.onClose(); };
    const md = { opt, btns, ov, close, closedBy: null, card: { classList: { add: (c) => { md.cardClass = c; } } }, foot: { querySelector: (s) => btns[/data-(\w+)/.exec(s)[1]] || null } };
    md.esc = () => { md.closedBy = 'esc'; close(); };
    md.dispose = () => { closed = true; ov.isConnected = false; };   // 다른 토스 모달에 밀려 사라짐(onClose 없음)
    log.modals.push(md);
    return md;
  };
}
// 앱 코드(되돌리기 + 닫기 전 묻기)를 가짜 환경에서 — S·화면은 최소한만
function makeCtx(o = {}) {
  const log = { modals: [], replies: [], status: [], saves: 0, autosaves: 0, traps: 0 };
  const ss = new Map();
  const keys = new Set();   // 창 캡처 단계 keydown 리스너(물음이 맨 위에서 키를 먼저 받는다)
  const ctx = {
    console, JSON, Math, performance: { now: () => ctx._now },
    _now: 1000, S: { a: 1, list: [] }, startOn: false, saveResult: true, busyAe: false,
    $: (s) => (s === '#aeSend' ? { disabled: ctx.busyAe } : null),
    stateForSave: () => ctx.S, startScreenOn: () => ctx.startOn,
    status: (m) => log.status.push(m), popFocusIn: () => {}, popTrapTab: () => { log.traps++; },
    sessionStorage: { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)), removeItem: (k) => ss.delete(k) },
    window: {
      addEventListener: (t, fn, cap) => { if (t === 'keydown' && cap === true) keys.add(fn); },
      removeEventListener: (t, fn, cap) => { if (t === 'keydown' && cap === true) keys.delete(fn); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(`let lastWork = '', _failedWork = '', _exportingFrames = false, _exBusy = false, projFileHandle = null;
    function saveWork() { __log.autosaves++; }
    function updateUndoBtns() {} function status(m) { __status(m); }`, Object.assign(ctx, { __log: log, __status: ctx.status }));
  vm.runInContext(UNDO_SRC, ctx, { filename: 'map-build-undo.js' });
  vm.runInContext(CLOSE_SRC, ctx, { filename: 'project-io-close.js' });
  ctx.applyState = (next) => { ctx.S = next; };   // 되돌리기 적용 = S 갈아끼우기만
  ctx.tossModal = fakeModal(log);
  ctx.saveProject = async () => { log.saves++; const ok = typeof ctx.saveResult === 'function' ? ctx.saveResult() : ctx.saveResult; if (ok) ctx.workMarkSaved(JSON.stringify(ctx.S), ctx.rev()); return ok; };
  vm.runInContext('globalThis.rev = () => _workRev; globalThis.setFailed = (v) => { _failedWork = v; }; globalThis.setExporting = (v) => { _exportingFrames = v; }; globalThis.setExBusy = (v) => { _exBusy = v; }; globalThis.setLastWork = (v) => { lastWork = v; };', ctx);
  const ask = (id) => ctx.closeAsk(id, (act, n) => log.replies.push([n, act]));
  const edit = (fn, tag) => { ctx.pushUndo(tag); fn(ctx.S); };
  // 키 누르기 — 창 캡처 단계 리스너에 먼저 준다. 반환: 아래(확인창·지도 단축키)로 내려가는가
  const key = (k) => {
    const e = { key: k, stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } };
    for (const fn of [...keys]) fn(e);
    return { down: !e.stopped, prevented: e.prevented };
  };
  return { ctx, log, ask, edit, ss, key, keys };
}
const tick = () => new Promise((r) => setImmediate(r));

test('판정 — 손대지 않으면 변경 없음, 칠하기 등 편집하면 변경 있음, 되돌려 원래대로면 다시 없음', () => {
  const { ctx, edit } = makeCtx();
  edit((S) => { S.a = 0; });   // 기준 앞의 편집(되돌리기 기록 하나)
  ctx.workMarkClean();
  assert.equal(ctx.workDirty(), false, '기준 직후');
  edit((S) => { S.a = 2; });
  assert.equal(ctx.workDirty(), true, '편집');
  ctx.undo();
  assert.equal(ctx.workDirty(), false, '되돌려 저장 시점 내용과 같다');
  ctx.redo();
  assert.equal(ctx.workDirty(), true, '다시 실행');
  ctx.undo(); ctx.undo();
  assert.equal(ctx.workDirty(), true, '저장 시점보다 더 앞으로 되돌림');
});

test('판정 — 기록 없이 나중에 채워진 값은 손댄 것이 아니다(번호 그대로) · 섞인 채 편집했다 되돌리면 바뀐 적 있음(수용)', () => {
  const { ctx, edit } = makeCtx();
  ctx.workMarkClean();
  ctx.S.lateDefault = 5;   // 늦게 채우는 기본값 등
  assert.equal(ctx.workDirty(), false, '바뀜 번호가 그대로면 내용이 달라도 변경 없음');
  edit((S) => { S.a = 2; });
  ctx.undo();
  assert.equal(ctx.workDirty(), true, '되돌린 상태(늦은 값 포함) ≠ 저장 시점 — 묻는 쪽(안전)');
});

test('판정 — 되돌리기 기록만 쌓고 바뀐 게 없으면(취소한 편집) 변경 없음, 시작 화면은 늘 변경 없음', () => {
  const { ctx, edit } = makeCtx();
  ctx.workMarkClean();
  ctx.pushUndo();   // 인라인 편집을 열었다 Esc 등
  assert.equal(ctx.workDirty(), false);
  edit((S) => { S.list.push(1); });
  ctx.startOn = true;
  assert.equal(ctx.workDirty(), false, '시작 화면');
  ctx.startOn = false;
  assert.equal(ctx.workDirty(), true);
});

test('판정 — 저장·불러오기가 기준을 바꾼다(저장 직후 같은 슬라이더를 이어 끌어도·저장하는 동안 바꿔도 변경 있음)', () => {
  const { ctx, edit } = makeCtx();
  ctx.workMarkClean();
  edit((S) => { S.a = 7; }, 'slider');
  ctx.workMarkSaved(JSON.stringify(ctx.S), ctx.rev());   // 저장
  assert.equal(ctx.workDirty(), false, '저장 직후');
  ctx._now += 100;   // 600ms 묶음 안에서 같은 슬라이더를 이어 끈다
  edit((S) => { S.a = 8; }, 'slider');
  assert.equal(ctx.workDirty(), true, '저장 기준을 잡을 때 묶음(lastTag)을 끊어 새 기록 = 번호가 오른다');
  // 저장하는 동안(그림 굽기) 바뀐 것: 기준은 쓰기 시작한 때의 번호·내용
  const rev0 = ctx.rev(), json0 = JSON.stringify(ctx.S);
  edit((S) => { S.a = 9; });
  ctx.workMarkSaved(json0, rev0);
  assert.equal(ctx.workDirty(), true, '쓴 뒤에 바뀐 것은 남는다');
  // 불러오기(workMarkClean)
  ctx.S = { a: 100, list: [] }; ctx.workMarkClean();
  assert.equal(ctx.workDirty(), false, '불러온 그대로');
});

test('판정 — 새로고침해도 변경 있음을 이어받는다(이어서 연 작업이 그 작업 그대로일 때만)', () => {
  const { ctx, edit, ss } = makeCtx();
  ctx.workMarkClean();
  const savedSig = ctx.workSig(JSON.stringify(ctx.S));
  edit((S) => { S.a = 3; });
  ctx.workUnsavedKeep();   // beforeunload
  const kept = JSON.parse(ss.get('wcg_unsaved'));
  assert.deepEqual(kept, { work: ctx.workSig(JSON.stringify(ctx.S)), saved: savedSig });
  // 새로고침 뒤 — 자동 저장 원문(lastWork)이 그 작업이면 이어받는다
  const b = makeCtx(); b.ss.set('wcg_unsaved', ss.get('wcg_unsaved'));
  b.ctx.S = JSON.parse(JSON.stringify(ctx.S)); b.ctx.setLastWork(JSON.stringify(ctx.S));
  b.ctx.workMarkBoot(true);
  assert.equal(b.ctx.workDirty(), true, '이어받음');
  assert.equal(b.ss.has('wcg_unsaved'), false, '읽으면 지운다');
  b.edit((S) => { S.a = 1; });
  assert.equal(b.ctx.workDirty(), false, '저장 시점 내용으로 되돌리면 변경 없음');
  // 다른 작업(설정 가져오기 등)·새 창(이어서 열지 않음)은 이어받지 않는다
  for (const [lw, resumed] of [['{"other":1}', true], [JSON.stringify(ctx.S), false]]) {
    const c = makeCtx(); c.ss.set('wcg_unsaved', ss.get('wcg_unsaved'));
    c.ctx.S = JSON.parse(JSON.stringify(ctx.S)); c.ctx.setLastWork(lw);
    c.ctx.workMarkBoot(resumed);
    assert.equal(c.ctx.workDirty(), false, lw + ' ' + resumed);
  }
  // 변경 없이 새로고침하면 적은 것을 지운다
  edit((S) => { S.a = 1; }); ctx.workMarkClean(); ctx.workUnsavedKeep();
  assert.equal(ss.has('wcg_unsaved'), false);
});

test('물음 — 변경 없으면 바로 close(팝업 없음), 있으면 팝업 + wait, 또 물으면 팝업 하나로 wait', () => {
  const { ctx, log, ask, edit } = makeCtx();
  ctx.workMarkClean();
  ask(1);
  assert.deepEqual(log.replies, [[1, 'close']]);
  assert.equal(log.modals.length, 0);
  edit((S) => { S.a = 2; });
  ask(2);
  assert.equal(log.modals.length, 1);
  const md = log.modals[0];
  assert.equal(md.opt.title, '저장하지 않은 변경이 있어요');
  assert.equal(md.cardClass, 'closeAsk');
  assert.deepEqual(Object.values(md.btns).map((b) => b.label), ['저장 안 함', '취소', '저장']);
  assert.match(md.btns.save.cls, /\bpri\b/, '[저장]이 주 버튼');
  assert.match(md.opt.bodyHTML, /파일로 남지 않아요/);
  assert.match(md.opt.bodyHTML, /직전 작업 이어보기/, '자동 저장으로 다음에 이어서 열 수 있다(사실대로)');
  assert.equal(log.autosaves, 1, '묻기 전에 자동 저장을 지금 내용으로');
  assert.deepEqual(log.replies.at(-1), [2, 'wait']);
  ask(3);
  assert.equal(log.modals.length, 1, '팝업은 하나');
  assert.deepEqual(log.replies.at(-1), [3, 'wait']);
  md.btns.cancel.onclick();
  assert.deepEqual(log.replies.at(-1), [3, 'stay'], '답은 마지막으로 물은 번호로');
  assert.equal(md.ov.isConnected, false, '닫힘');
  assert.equal(log.replies.length, 4, '취소 한 번에 답 하나(onClose 가 또 답하지 않는다)');
});

test('물음 — [저장 안 함] = close, Esc·바깥 클릭 = stay, 다른 팝업에 밀려 사라졌으면 새로 묻는다', () => {
  const { ctx, log, ask, edit } = makeCtx();
  ctx.workMarkClean(); edit((S) => { S.a = 2; });
  ask(1); log.modals[0].btns.discard.onclick();
  assert.deepEqual(log.replies.slice(-2), [[1, 'wait'], [1, 'close']]);
  ask(2); log.modals[1].esc();
  assert.deepEqual(log.replies.at(-1), [2, 'stay']);
  ask(3); log.modals[2].dispose();   // 공지 등 다른 토스 모달이 떠서 조용히 치워짐
  ask(4);
  assert.equal(log.modals.length, 4, '사라진 팝업을 기다리지 않고 다시 띄운다');
  assert.deepEqual(log.replies.at(-1), [4, 'wait']);
});

test('물음 — [저장]: 저장했으면 close·기준 갱신, 저장 위치 고르기 취소면 stay(닫지 않음), 저장 중 또 물으면 wait', async () => {
  const { ctx, log, ask, edit } = makeCtx();
  ctx.workMarkClean(); edit((S) => { S.a = 2; });
  let release; ctx.saveResult = () => new Promise((r) => { release = r; });
  ctx.saveProject = async () => { log.saves++; const ok = await ctx.saveResult(); if (ok) ctx.workMarkSaved(JSON.stringify(ctx.S), ctx.rev()); return ok; };
  ask(1); const md = log.modals[0];
  const p = md.btns.save.onclick();
  assert.equal(md.ov.isConnected, false, '저장 대화상자 전에 팝업은 닫는다');
  ask(2);
  assert.deepEqual(log.replies.at(-1), [2, 'wait'], '저장 중 — 새 팝업 없이 기다림');
  assert.equal(log.modals.length, 1);
  release(false); await p; await tick();
  assert.deepEqual(log.replies.at(-1), [2, 'stay'], '취소하면 닫지 않는다');
  assert.match(log.status.at(-1), /닫지 않았어요/);
  assert.equal(ctx.workDirty(), true);
  ctx.saveResult = true;
  ctx.saveProject = async () => { log.saves++; ctx.workMarkSaved(JSON.stringify(ctx.S), ctx.rev()); return true; };
  ask(3); await log.modals[1].btns.save.onclick(); await tick();
  assert.deepEqual(log.replies.at(-1), [3, 'close']);
  assert.equal(ctx.workDirty(), false, '저장한 뒤엔 변경 없음');
  ctx.saveProject = async () => { throw new Error('쓰기 실패'); };
  edit((S) => { S.a = 5; });
  ask(4); await log.modals[2].btns.save.onclick(); await tick();
  assert.deepEqual(log.replies.at(-1), [4, 'stay'], '실패도 닫지 않는다');
});

test('물음 — [저장]이 파일 쓰기 대신 내려받기로 넘겼으면(download) 닫지 않는다(곧바로 끄면 받는 중인 파일이 끊긴다)', async () => {
  const { ctx, log, ask, edit } = makeCtx();
  ctx.workMarkClean(); edit((S) => { S.a = 2; });
  ctx.saveProject = async () => { log.saves++; ctx.workMarkSaved(JSON.stringify(ctx.S), ctx.rev()); return 'download'; };
  ask(1); await log.modals[0].btns.save.onclick(); await tick();
  assert.deepEqual(log.replies.at(-1), [1, 'stay']);
  assert.match(log.status.at(-1), /다운로드로 저장했어요 — 받기가 끝난 뒤 다시 닫아 주세요/);
  ask(2);
  assert.deepEqual(log.replies.at(-1), [2, 'close'], '내려받은 내용 그대로면 다음 닫기는 묻지 않는다');
});

test('물음 — 키는 물음이 맨 위에서 먼저 받는다(아래 확인창·지도 단축키로 안 내려감): Esc = 취소, Tab = 카드 안, 닫히면 리스너를 뗀다', () => {
  const { ctx, log, ask, edit, key, keys } = makeCtx();
  ctx.workMarkClean(); edit((S) => { S.a = 2; });
  assert.equal(key('Enter').down, true, '물음이 없을 땐 그대로');
  ask(1);
  assert.equal(keys.size, 1);
  assert.deepEqual(key('Enter'), { down: false, prevented: false }, 'Enter 는 아래 확인창(문서 캡처)으로 안 내려가고 포커스 버튼의 기본 동작은 그대로');
  assert.equal(key('z').down, false, '뒤의 단축키(되돌리기 등)도 막는다');
  key('Tab'); assert.equal(log.traps, 1, 'Tab = 카드 안에서만');
  assert.deepEqual(log.replies, [[1, 'wait']]);
  assert.equal(key('Escape').prevented, true);
  assert.deepEqual(log.replies.at(-1), [1, 'stay'], 'Esc = 취소');
  assert.equal(keys.size, 0, '닫히면 뗀다');
  ask(2); log.modals[1].btns.discard.onclick();
  assert.equal(keys.size, 0, '[저장 안 함]으로 닫혀도 뗀다');
  ask(3); log.modals[2].dispose();   // 공지 등 다른 토스 모달에 밀려 사라짐(onClose 없음)
  assert.equal(key('Enter').down, true, '밀려 사라졌으면 키를 막지 않고');
  assert.equal(keys.size, 0, '스스로 뗀다');
});

test('물음 — 렌더(영상·AE 보내기) 중이면 변경이 없어도 묻고, 변경이 있으면 그 줄을 덧붙인다. 자동 저장이 실패했으면 사실대로', () => {
  const { ctx, log, ask, edit } = makeCtx();
  ctx.workMarkClean();
  ctx.setExporting(true);
  ask(1);
  const md = log.modals[0];
  assert.equal(md.opt.title, '영상을 렌더하는 중이에요');
  assert.deepEqual(Object.values(md.btns).map((b) => b.label), ['끄기', '취소']);
  assert.match(md.btns.cancel.cls, /\bpri\b/, '렌더 중엔 취소가 주 버튼');
  md.btns.discard.onclick();
  assert.deepEqual(log.replies.at(-1), [1, 'close']);
  ctx.setExporting(false); ctx.busyAe = true;
  ask(2); assert.equal(log.modals[1].opt.title, 'AE로 보내는 중이에요'); log.modals[1].esc();
  assert.deepEqual(log.replies.at(-1), [2, 'stay']);
  edit((S) => { S.a = 2; }); ctx.setFailed('{"x":1}');
  ask(3);
  const m3 = log.modals[2];
  assert.equal(m3.opt.title, '저장하지 않은 변경이 있어요');
  assert.match(m3.opt.bodyHTML, /closeAskBusy[^>]*>지금 끄면 After Effects로 보내기가 끊길 수 있어요/);
  assert.match(m3.opt.bodyHTML, /자동 저장 공간이 부족해/);
  assert.doesNotMatch(m3.opt.bodyHTML, /직전 작업 이어보기/);
  ctx.busyAe = false; ctx.setFailed('');
  m3.btns.cancel.onclick();
  // 이미지로 추출(한 장씩 굽고 쓰는 중) — 변경이 없어도 묻는다
  ctx.undo(); ctx.setExBusy(true);
  ask(4);
  const m4 = log.modals[3];
  assert.equal(m4.opt.title, '이미지를 추출하는 중이에요');
  assert.match(m4.opt.bodyHTML, /아직 굽지 않은 그림은 저장되지 않아요/);
  assert.deepEqual(Object.values(m4.btns).map((b) => b.label), ['끄기', '취소']);
  m4.btns.cancel.onclick();
  assert.deepEqual(log.replies.at(-1), [4, 'stay']);
  ctx.setExBusy(false);
  ask(5);
  assert.deepEqual(log.replies.at(-1), [5, 'close'], '끝나면 다시 바로 닫힘');
});

test('배선 — main.js: close 를 막고 묻기(desktop/close-guard.js), 답은 메인 창만 · preload: onCloseAsk/closeReply, 콜백 없으면 바로 close', () => {
  assert.match(mainJs, /const \{ createCloseGuard \} = require\('\.\/close-guard'\);/);
  const wire = mainJs.slice(mainJs.indexOf('function wireCloseGuard('), mainJs.indexOf("ipcMain.on('wcg:close-reply'"));
  assert.match(wire, /ask: \(id\) => \{\s*if \(w\.isDestroyed\(\) \|\| w\.webContents\.isCrashed\(\)\) return false;[^\n]*\n\s*w\.webContents\.send\('wcg:close-ask', id\);\s*\},/, '웹앱이 죽었으면 물을 곳이 없다(false → 곧바로 닫기)');
  assert.match(wire, /reveal: \(\) => \{ if \(w\.isDestroyed\(\)\) return; if \(w\.isMinimized\(\)\) w\.restore\(\); else if \(!w\.isVisible\(\)\) return; w\.focus\(\); \},/, '팝업이 뜨면 최소화한 창을 되살려 앞으로(숨긴 점검 창은 그대로)');
  assert.match(wire, /close: \(\) => \{ if \(!w\.isDestroyed\(\)\) w\.close\(\); \}/);
  assert.match(wire, /destroy: \(\) => \{ if \(!w\.isDestroyed\(\)\) w\.destroy\(\); \}/);
  assert.match(wire, /w\.on\('close', \(e\) => \{ if \(guard\.onClose\(\)\) e\.preventDefault\(\); \}\);/);
  assert.match(wire, /w\.on\('session-end', \(\) => guard\.release\(\)\);/, '윈도 종료는 막지 않는다');
  assert.match(mainJs.slice(mainJs.indexOf('function createWindow(')), /wireCloseGuard\(win\);/);
  const reply = mainJs.slice(mainJs.indexOf("ipcMain.on('wcg:close-reply'"));
  assert.match(reply.slice(0, reply.indexOf('\n});')), /e\.sender\.id !== win\.webContents\.id\) return;\s*closeGuard\.onReply\(d && d\.id, d && d\.act\);/, '메인 창(웹앱)만 답할 수 있다');
  assert.match(preloadJs, /ipcRenderer\.on\('wcg:close-ask', \(_e, id\) => \{\s*if \(!closeAskCb\) \{ closeReply\(id, 'close'\); return; \}/);
  assert.match(preloadJs, /onCloseAsk: \(cb\) => \{ closeAskCb = typeof cb === 'function' \? cb : null; \},/);
  assert.match(preloadJs, /closeReply: \(id, act\) => closeReply\(id, act\),/);
  assert.match(preloadJs, /ipcRenderer\.send\('wcg:close-reply', \{ id: Math\.floor\(\+id\) \|\| 0, act: String\(act \|\| ''\) \}\)/);
});

test('배선 — 웹앱: 부팅이 기준을 잡고 데스크톱에서만 묻기를 건다, 저장·불러오기·시작 화면 마침이 기준, 바뀜 번호는 되돌리기 기록에서', () => {
  const boot = between('// 닫기 전 묻기(데스크톱', 'document.fonts.ready');
  assert.match(boot, /if \(window\.wcgDesktop && typeof window\.wcgDesktop\.onCloseAsk === 'function'\) \{\s*workMarkBoot\(!!work\);\s*window\.addEventListener\('beforeunload', workUnsavedKeep\);[^\n]*\n\s*window\.wcgDesktop\.onCloseAsk\(\(id\) => closeAsk\(id\)\);\s*\}/);
  assert.ok(html.indexOf("window.addEventListener('beforeunload', saveWork);") < html.indexOf("window.addEventListener('beforeunload', workUnsavedKeep);"), '자동 저장 뒤에 적는다');
  assert.match(fnSrc('saveProject'), /\n  return saved;\n\}$/);
  const run = fnSrc('saveProjectRun');
  assert.equal((run.match(/workMarkSaved\(json0, rev0\);/g) || []).length, 3, '저장 성공 길 세 곳 모두');
  assert.match(run, /if \(e\.name === 'AbortError'\) return false;/);
  assert.equal((run.match(/return 'download';/g) || []).length, 2, '내려받기로 넘긴 길 두 곳은 download(닫기 전 묻기는 이때 닫지 않는다)');
  assert.match(fnSrc('closeAsk'), /closeAnswer\(ok === true \? 'close' : 'stay'\)/, '[저장]은 파일에 썼을 때만 닫는다');
  assert.match(fnSrc('loadProjectData'), /workMarkClean\(\);[^\n]*\n\}$/);
  assert.match(fnSrc('markStartStep'), /saveWork\(\); workMarkClean\(\); \}, 260\);/);
  assert.match(fnSrc('pushUndo'), /redoStack\.length = 0;\n  _workRev\+\+;/);
  assert.match(html, /function undo\(\) \{[^\n]*redoStack\.push\(cur\); _workRev\+\+; applyState\(prev\);/);
  assert.match(html, /function redo\(\) \{[^\n]*undoStack\.push\(cur\); _workRev\+\+; applyState\(next\);/);
  // 팝업 = 토스 카드(tossModal) — 왼쪽 '저장 안 함' 경고색은 토큰으로
  assert.match(html, /\.tossCard\.closeAsk \.tossFoot \.closeAskDiscard \{ margin-right: auto; color: var\(--danger\); \}/);
  const css = html.slice(html.indexOf('/* 닫기 전 묻기(js/project-io.js closeAsk)'), html.indexOf('.tossStep {'));
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, '색은 토큰만');
  // 이모지 없음
  assert.doesNotMatch(CLOSE_SRC, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

// ── 실제 앱(부팅 점검기) — WCG_BOOT_CHECK=1 일 때만 ──
test('부팅 점검: 변경 없으면 안 묻고, 칠하면 팝업(버튼 3개)·저장 안 함=닫기·취소=유지·저장=닫기·내려받기=유지, 렌더 중·키는 물음이 맨 위', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=8000', '--size=1600x900', '--keepalive', '--eval=' + path.join(__dirname, 'close-ask.boot-eval.js')], { encoding: 'utf8', timeout: 300000 });
  const out = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  const R = out.evalResult;
  assert.ok(R && !R.error, JSON.stringify(R));
  assert.deepEqual(R.api, { onCloseAsk: 'function', closeReply: 'function' });
  if (R.start) assert.deepEqual(R.start, { replies: [[1, 'close']], pop: false }, '시작 화면에서 끄기 = 안 물음');
  assert.deepEqual(R.afterSetup, { replies: [[2, 'close']], pop: false }, '장면 설정만 마치고 끄기 = 안 물음');
  assert.equal(R.painted, true, '칠하기로 변경 있음');
  assert.deepEqual(R.ask.replies, [[3, 'wait']]);
  assert.equal(R.ask.title, '저장하지 않은 변경이 있어요');
  assert.deepEqual(R.ask.buttons, ['저장 안 함', '취소', '저장']);
  assert.deepEqual(R.again, { replies: [[4, 'wait']], pops: 1 }, '또 닫기 = 팝업 하나');
  assert.deepEqual(R.cancel, { replies: [[4, 'stay']], pop: false, dirty: true }, '취소 = 그대로');
  assert.deepEqual(R.esc, { replies: [[5, 'wait'], [5, 'stay']], pop: false });
  assert.deepEqual(R.outside, { replies: [[6, 'wait'], [6, 'stay']], pop: false });
  assert.deepEqual(R.discard, { replies: [[7, 'wait'], [7, 'close']], pop: false });
  assert.deepEqual(R.saveAbort, { replies: [[8, 'wait'], [8, 'stay']], dirty: true }, '저장 위치 고르기 취소 = 닫지 않음');
  assert.deepEqual(R.saveOk, { replies: [[9, 'wait'], [9, 'close']], dirty: false, wrote: true }, '저장하면 닫기');
  assert.deepEqual(R.afterSave, { replies: [[10, 'close']], pop: false }, '저장 직후 끄기 = 안 물음');
  assert.deepEqual(R.undoBack, { dirtyAfterPaint: true, dirtyAfterUndo: false }, '되돌려 저장 시점으로 = 변경 없음');
  assert.deepEqual(R.saveDownload, { replies: [[13, 'wait'], [13, 'stay']], downloads: 1, status: '다운로드로 저장했어요 — 받기가 끝난 뒤 다시 닫아 주세요' }, '파일 쓰기 대신 내려받기 = 닫지 않음');
  assert.deepEqual(R.afterDownload, { replies: [[14, 'close']], pop: false });
  assert.deepEqual(R.imageBusy, { title: '이미지를 추출하는 중이에요', buttons: ['끄기', '취소'], replies: [[15, 'wait'], [15, 'stay']] });
  assert.deepEqual(R.renderBusy, { title: '영상을 렌더하는 중이에요', onTop: true, mask: true, replies: [[16, 'wait'], [16, 'stay']] }, '렌더 가리개보다 위');
  assert.deepEqual(R.busy, { title: 'AE로 보내는 중이에요', buttons: ['끄기', '취소'], replies: [[11, 'wait'], [11, 'stay']] });
  assert.deepEqual(R.keysOnTop, { focus: 'save', afterEnter: { confirm: 'pending', pop: true }, replies: [[17, 'wait'], [17, 'stay']], pop: false, confirmOpen: true, confirm: 'pending', confirmAfterCancel: false },
    '아래 확인창이 Enter 를 예로 받지 않고, Esc 는 물음만 취소');
  assert.deepEqual([R.shotDirty, R.shotPop], [true, true], '끝 화면(--shot)에 팝업이 떠 있다');
});
