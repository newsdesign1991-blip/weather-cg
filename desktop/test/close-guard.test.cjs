// 창 닫기 전 묻기 — 메인 쪽 순서·안전장치(desktop/close-guard.js)를 가짜 창·가짜 타이머로 본다.
// 웹앱 쪽 판정·팝업은 tests/close-ask.test.cjs, 실제 앱 흐름은 desktop/test/close-flow-check.cjs(WCG_BOOT_CHECK=1).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCloseGuard, CLOSE_ASK_MS } = require('../close-guard');

// 가짜 창 + 손으로 돌리는 타이머
function rig(o = {}) {
  const log = [];
  const timers = new Map(); let tid = 0;
  const g = createCloseGuard({
    ask: o.ask || ((id) => { log.push(['ask', id]); }),
    close: () => log.push(['close']),
    destroy: () => log.push(['destroy']),
    reveal: () => log.push(['reveal']),
    timeoutMs: 1000,
    setTimer: (fn, ms) => { const id = ++tid; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
  });
  const fire = () => { const all = [...timers.values()]; timers.clear(); for (const t of all) t.fn(); };
  return { g, log, timers, fire };
}

test('기본 시간 제한은 몇 초(5초)', () => { assert.equal(CLOSE_ASK_MS, 5000); });

test('닫기 → 막고 묻는다, 웹앱이 close 라 하면 닫고 그다음 close 는 막지 않는다', () => {
  const { g, log, timers } = rig();
  assert.equal(g.onClose(), true, '첫 close 는 막는다');
  assert.deepEqual(log, [['ask', 1]]);
  assert.equal(timers.size, 1);
  g.onReply(1, 'close');
  assert.deepEqual(log.at(-1), ['close']);
  assert.equal(timers.size, 0, '시간 제한 해제');
  assert.equal(g.onClose(), false, 'win.close() 로 다시 들어온 close 는 통과');
});

test('답이 없으면(웹앱 멈춤) 시간 제한 뒤 그냥 닫는다(destroy)', () => {
  const { g, log, fire, timers } = rig();
  g.onClose();
  assert.equal([...timers.values()][0].ms, 1000);
  fire();
  assert.deepEqual(log, [['ask', 1], ['destroy']]);
  assert.equal(g.onClose(), false);
  g.onReply(1, 'stay');   // 늦은 답은 무시
  assert.equal(g.state().pass, true);
});

test('물을 곳이 없으면(웹앱 렌더러가 죽음 — ask 가 false·던짐) 기다리지 않고 곧바로 닫는다(close 이벤트 밖에서)', () => {
  for (const ask of [() => false, () => { throw new Error('창 없음'); }]) {
    const { g, log, fire, timers } = rig({ ask });
    assert.equal(g.onClose(), true, '이번 close 는 막고(이벤트 안에서 창을 부수지 않게)');
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].ms, 0, '시간 제한(5초) 대신 곧바로');
    assert.deepEqual(log, []);
    fire();
    assert.deepEqual(log, [['destroy']]);
    assert.equal(g.onClose(), false);
  }
  const ok = rig({ ask: () => undefined });   // 보냈으면(돌려주는 값 없음) 그대로 시간 제한
  ok.g.onClose();
  assert.equal([...ok.timers.values()][0].ms, 1000);
});

test('wait = 사용자가 고르는 중 → 시간 제한 없이 기다림, stay 면 그대로(다음 닫기에 다시 묻는다)', () => {
  const { g, log, timers } = rig();
  g.onClose(); g.onReply(1, 'wait');
  assert.equal(timers.size, 0, '팝업이 떠 있는 동안은 시간 제한 없음');
  assert.deepEqual(log.at(-1), ['reveal'], '팝업이 떴다 — 창을 앞으로(최소화한 창을 작업표시줄에서 닫았을 때)');
  g.onReply(1, 'stay');
  assert.deepEqual(g.state(), { pass: false, asking: false, timer: false, last: 0 });
  assert.equal(g.onClose(), true, '다시 막고 묻는다');
  assert.deepEqual(log.at(-1), ['ask', 2]);
  g.onReply(1, 'close');   // 지난 물음의 답 — 무시
  assert.equal(log.some((x) => x[0] === 'close'), false);
  g.onReply(2, 'close');
  assert.deepEqual(log.at(-1), ['close']);
});

test('팝업이 떠 있는데 또 닫기 → 다시 묻는다(웹앱은 같은 팝업으로 wait). 그 답마저 없으면(그 사이 멈춤) 닫는다', () => {
  const { g, log, timers, fire } = rig();
  g.onClose(); g.onReply(1, 'wait');
  assert.equal(g.onClose(), true);
  assert.deepEqual(log.at(-1), ['ask', 2]);
  assert.equal(timers.size, 1, '새 물음엔 다시 시간 제한');
  g.onReply(1, 'wait');   // 지난 물음의 wait 로는 새 시간 제한을 끄지 않는다
  assert.equal(timers.size, 1);
  g.onReply(2, 'wait');
  assert.equal(timers.size, 0);
  g.onReply(1, 'close');   // 처음 물음 번호로 온 결정도 이번 묻기 안이면 받는다
  assert.deepEqual(log.at(-1), ['close']);
  // 멈춘 경우
  const r = rig();
  r.g.onClose(); r.g.onReply(1, 'wait'); r.g.onClose();
  r.fire();
  assert.deepEqual(r.log.at(-1), ['destroy']);
});

test('모르는 번호·이상한 답·묻지 않을 때 온 답은 무시, release(윈도 종료)는 막지 않는다', () => {
  const { g, log, fire } = rig();
  g.onReply(1, 'close');
  assert.equal(log.length, 0, '묻지 않았는데 온 답');
  g.onClose();
  for (const [id, act] of [[2, 'close'], [0, 'close'], ['x', 'close'], [1, 'bogus'], [1, ''], [2, 'wait']]) g.onReply(id, act);
  assert.deepEqual(log, [['ask', 1]], '모르는 번호의 wait 로는 창을 앞으로 부르지도 않는다');
  const s = rig();
  s.g.onClose(); s.g.release();
  assert.equal(s.timers.size, 0);
  assert.equal(s.g.onClose(), false);
  fire();
});

// ── 실제 앱(메인 검사기로 진짜 win.close()) — WCG_BOOT_CHECK=1 일 때만 ──
test('실제 앱: 변경 없으면 곧바로 꺼짐 · 칠하면 팝업(하나·시간 제한에도 유지)·취소=유지·저장 안 함=꺼짐 · 웹앱이 멈추면 약 5초 뒤 꺼짐', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  let raw;
  try { raw = execFileSync(process.execPath, [path.join(__dirname, 'close-flow-check.cjs'), path.join(__dirname, '..', '..')], { encoding: 'utf8', timeout: 300000 }); }
  catch (e) { raw = String(e.stdout || ''); }
  const out = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok, true, JSON.stringify(out, null, 1));
});
