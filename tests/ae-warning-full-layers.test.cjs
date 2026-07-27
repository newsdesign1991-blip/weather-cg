const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

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

test('sea-only warning masks are not rejected by the empty land-fill guard', () => {
  assert.match(
    html,
    /const warningDefs = aeWarningFillDefs\(\);\s*if \(!Object\.keys\(F\)\.length && !warningDefs\.length\)/,
  );
});
