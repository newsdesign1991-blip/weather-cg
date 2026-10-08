const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');
const vm = require('node:vm');

const html = appSource(path.join(__dirname, '..', 'index.html'));

function loadDefinitionBuilder(order) {
  const start = html.indexOf('function aeWarningFillDefs(');
  const end = html.indexOf('async function aeWarningFillBlob(', start);
  assert.notEqual(start, -1, 'missing aeWarningFillDefs');
  assert.notEqual(end, -1, 'missing aeWarningFillBlob');
  const context = {
    S: { style: 'warn', wrnOff: {} },
    wrnRows: [
      { id: 'A', wrn: '폭염', lvl: '주의보' },
      { id: 'B', wrn: '폭염', lvl: '주의보' },
      { id: 'B', wrn: '폭염', lvl: '경보' },
      { id: 'C', wrn: '폭염', lvl: '경보' },
      { id: 'C', wrn: '폭염', lvl: '중대경보' },
      { id: 'D', wrn: '폭염', lvl: '중대경보' },
    ],
    wrnKeyOf: (r) => `${r.wrn}|${r.lvl}`,
    wrnColorOf: (_wrn, lvl) => ({
      주의보: '#FFAAAA',
      경보: '#FF3333',
      중대경보: '#8B0000',
    })[lvl],
    wrnRank: (r) => order.indexOf(`${r.wrn}|${r.lvl}`),
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  return context;
}

test('AE warning layers retain every region hidden beneath higher-priority warnings', () => {
  const context = loadDefinitionBuilder([
    '폭염|중대경보',
    '폭염|경보',
    '폭염|주의보',
  ]);
  const defs = JSON.parse(JSON.stringify(context.aeWarningFillDefs()));

  assert.deepEqual(defs.map((d) => d.key), [
    '폭염|주의보',
    '폭염|경보',
    '폭염|중대경보',
  ]);
  assert.deepEqual(defs[0].ids, ['A', 'B']);
  assert.deepEqual(defs[1].ids, ['B', 'C']);
  assert.deepEqual(defs[2].ids, ['C', 'D']);
});

test('AE warning layer stacking follows the current manual priority order', () => {
  const context = loadDefinitionBuilder([
    '폭염|주의보',
    '폭염|경보',
    '폭염|중대경보',
  ]);
  const defs = JSON.parse(JSON.stringify(context.aeWarningFillDefs()));

  assert.deepEqual(defs.map((d) => d.key), [
    '폭염|중대경보',
    '폭염|경보',
    '폭염|주의보',
  ]);
});

test('AE send path uses full warning masks instead of final visible color fragments', () => {
  assert.match(
    html,
    /const warningDefs = aeWarningFillDefs\(\);[\s\S]*aeWarningFillBlob\(def\)/,
  );
});

// sendToAE의 '칠한 색이 없습니다' 가드 조건식을 뽑아 실제로 평가한다(문자열 모양 대신 동작 검사)
function emptyFillGuard() {
  const start = html.indexOf('async function sendToAE()');
  assert.notEqual(start, -1, 'missing sendToAE');
  const defsAt = html.indexOf('const warningDefs = aeWarningFillDefs();', start);
  assert.notEqual(defsAt, -1, 'sendToAE must build warning masks');
  // 문구는 상황에 따라 갈린다(특보 0건이면 '오류가 아니에요' 안내) — 막는 조건만 잘라 검사한다
  const m = html.slice(defsAt, defsAt + 1500).match(/\n\s*if \((.+?)\) \{ status\([^\n]*'칠한 색이 없습니다/);
  assert.ok(m, 'missing empty-fill guard after aeWarningFillDefs()');
  return (ctx) => vm.runInNewContext(`(${m[1]})`, { isTyphoon: () => false, hasBrush: false, ...ctx });
}

test('sea-only warning masks are not rejected by the empty land-fill guard', () => {
  const rejects = emptyFillGuard();
  // 해상 특보만: 육지 칠 F는 비어도 특보 마스크가 있으면 통과
  assert.equal(rejects({ F: {}, warningDefs: [{ ids: ['S1'] }] }), false);
  // 아무것도 안 칠함: 막아야 함
  assert.equal(rejects({ F: {}, warningDefs: [] }), true);
  // 육지 칠만 있음: 통과
  assert.equal(rejects({ F: { A: '#FF0000' }, warningDefs: [] }), false);
  // 브러쉬로만 칠함 / 태풍 지도(칠 없음): 통과
  assert.equal(rejects({ F: {}, warningDefs: [], hasBrush: true }), false);
  assert.equal(rejects({ F: {}, warningDefs: [], isTyphoon: () => true }), false);
});
