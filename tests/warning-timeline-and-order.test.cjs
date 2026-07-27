const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function sliceBetween(startText, endText) {
  const start = html.indexOf(startText);
  const end = html.indexOf(endText, start);
  assert.notEqual(start, -1, `missing start marker: ${startText}`);
  assert.notEqual(end, -1, `missing end marker: ${endText}`);
  return html.slice(start, end);
}

function timelineContext() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    sliceBetween('const wrnCommandKind =', '// ===================== API'),
    context,
    { filename: 'warning-timeline.js' },
  );
  return context;
}

test('target-time normalization keeps only warnings active at that exact time', () => {
  const { activeWrnRows } = timelineContext();
  const rows = [
    { id: 'L1', wrn: '강풍', lvl: '주의보', tmfc: '202607260900', tmef: '202607261000', cmd: '발표' },
    { id: 'L1', wrn: '강풍', lvl: '경보', tmfc: '202607261130', tmef: '202607261200', cmd: '대치' },
    { id: 'L2', wrn: '폭염', lvl: '경보', tmfc: '202607260900', tmef: '202607261000', cmd: '발표' },
    { id: 'L2', wrn: '폭염', lvl: '경보', tmfc: '202607261300', tmef: '202607261400', cmd: '해제' },
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(activeWrnRows(rows, '202607261100'))),
    [rows[0], rows[2]],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(activeWrnRows(rows, '202607261230'))),
    [rows[1], rows[2]],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(activeWrnRows(rows, '202607261500'))),
    [rows[1]],
  );
});

test('future-effective warning does not appear before its effective time', () => {
  const { activeWrnRows } = timelineContext();
  const rows = [
    { id: 'L1', wrn: '호우', lvl: '주의보', tmfc: '202607261000', tmef: '202607261600', cmd: '발표' },
  ];
  assert.equal(activeWrnRows(rows, '202607261500').length, 0);
  assert.equal(activeWrnRows(rows, '202607261600').length, 1);
});

test('existing warning priority is used by default and a drag move only changes the current result', () => {
  const { defaultWrnOrder, moveWrnOrder } = timelineContext();
  const rows = [
    { wrn: '호우', lvl: '경보' },
    { wrn: '강풍', lvl: '주의보' },
    { wrn: '폭염', lvl: '경보' },
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(defaultWrnOrder(rows, ['강풍', '폭염', '호우']))),
    ['강풍|주의보', '폭염|경보', '호우|경보'],
  );
  const incoming = ['강풍|주의보', '폭염|경보', '호우|경보'];
  assert.deepEqual(JSON.parse(JSON.stringify(moveWrnOrder(incoming, 2, 0))),
    ['호우|경보', '강풍|주의보', '폭염|경보']);
  assert.deepEqual(incoming, ['강풍|주의보', '폭염|경보', '호우|경보']);
});

test('warning drop index matches the visible before or after guide', () => {
  const { wrnDropIndex } = timelineContext();
  assert.equal(wrnDropIndex(0, 2, false, 4), 1);
  assert.equal(wrnDropIndex(0, 2, true, 4), 2);
  assert.equal(wrnDropIndex(3, 1, false, 4), 1);
  assert.equal(wrnDropIndex(3, 1, true, 4), 2);
});

test('warning rows expose drag guides and six pixel separation', () => {
  assert.match(html, /\.wrnItem\s*\{[^}]*margin-bottom:\s*6px/s);
  assert.match(html, /\.wrnItem\.drop-before::before/);
  assert.match(html, /\.wrnItem\.drop-after::after/);
  assert.match(html, /\.wrnItem\.dragging/);
});

test('warning API requests effective-time status', () => {
  assert.match(html, /wrn_now_data\.php\?fe=e&tm=\{TM\}/);
});

test('manual legends with three items use the same expanded VF layout', () => {
  assert.match(html, /function vfExpandedLegend\(\)/);
  assert.doesNotMatch(
    sliceBetween('function vfExpandedLegend()', '// 기상특보 범례'),
    /g\.auto[^;]*return null/,
  );
});

test('major heat warning has the dark-red default independent of heat warning', () => {
  assert.match(html, /['"]폭염\|중대경보['"]\s*:\s*['"]#8B0000['"]/);
});
