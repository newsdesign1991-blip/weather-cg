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

function createWarningContext() {
  const state = sliceBetween('const WRN_COLORS =', 'const listOf =');
  const hexHelper = sliceBetween('const hex =', '\n');
  const colors = sliceBetween('const wrnColorKey =', '// ===================== API 주소');
  const preset = sliceBetween('const PRESET_KEYS =', 'const presetKey =');
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${state}\n${hexHelper}\n${colors}\n${preset}\n`
      + 'globalThis.__state = S; globalThis.__presetKeys = PRESET_KEYS;',
    context,
    { filename: 'warning-color-contract.js' },
  );
  return context;
}

class FakeNode {
  constructor() {
    this.children = [];
    this.style = {};
    this._textContent = '';
    this._parts = {};
  }
  set textContent(value) {
    this._textContent = value;
    if (value === '') this.children = [];
  }
  get textContent() { return this._textContent; }
  set innerHTML(value) {
    if (!value.includes('wrnCol')) return;
    this._parts['.nm'] = new FakeNode();
    this._parts['.fc'] = new FakeNode();
    this._parts['.wrnCol'] = new FakeNode();
    this._parts['.eye'] = new FakeNode();
  }
  querySelector(selector) { return this._parts[selector] || null; }
  append(child) { this.children.push(child); }
}

function createWarningEditorContext() {
  const context = createWarningContext();
  const list = new FakeNode();
  context.document = { createElement: () => new FakeNode() };
  context.$ = (selector) => selector === '#wrnList' ? list : null;
  context.pushUndo = () => {};
  context.paintWrn = () => {};
  context.renderLegend = () => {};
  const buildList = sliceBetween('function buildWrnList()', '// ===================== 기상예보 자동 색칠');
  vm.runInContext(
    'var wrnRows = []; function wrnRank(){ return 0; } function tmShort(){ return ""; }\n'
      + buildList
      + '\nglobalThis.__setWrnRows = (rows) => { wrnRows = rows; };',
    context,
    { filename: 'warning-list-editor.js' },
  );
  return { context, list };
}

test('warning and major warning colors are independently stored', () => {
  const context = createWarningContext();

  assert.equal(context.setWrnLevelColor('폭염', '경보', '#AA0000'), true);
  assert.equal(context.setWrnLevelColor('폭염', '중대경보', '#550000'), true);

  assert.equal(context.wrnColorOf('폭염', '경보'), '#AA0000');
  assert.equal(context.wrnColorOf('폭염', '중대경보'), '#550000');
  assert.equal(context.__state.wrnLevelColors['폭염|경보'], '#AA0000');
  assert.equal(context.__state.wrnLevelColors['폭염|중대경보'], '#550000');
});

test('exact warning levels stay independent for every warning type', () => {
  const context = createWarningContext();
  const cases = [
    ['호우', '주의보', '#112233'],
    ['호우', '경보', '#223344'],
    ['대설', '중대경보', '#334455'],
    ['한파', '예비특보', '#445566'],
  ];

  for (const [warning, level, color] of cases) {
    assert.equal(context.setWrnLevelColor(warning, level, color), true);
  }

  for (const [warning, level, color] of cases) {
    assert.equal(context.wrnColorOf(warning, level), color);
    assert.equal(context.__state.wrnLevelColors[`${warning}|${level}`], color);
  }
});

test('existing warning colors remain the fallback for saved projects', () => {
  const context = createWarningContext();

  assert.equal(context.wrnColorOf('폭염', '주의보'), '#F57C00');
  assert.equal(context.wrnColorOf('폭염', '경보'), '#FA2E1E');
  assert.equal(context.wrnColorOf('폭염', '중대경보'), '#FA2E1E');
  assert.equal(context.wrnColorOf('없는특보', '경보'), null);
});

test('warning level colors participate in screen presets and baked defaults', () => {
  const context = createWarningContext();

  assert.equal(context.__presetKeys.includes('wrnLevelColors'), true);
});

test('incoming warning color input changes only its exact warning level', () => {
  const { context, list } = createWarningEditorContext();
  context.__setWrnRows([
    { wrn: '폭염', lvl: '경보', tmfc: '', id: 'L1010100' },
    { wrn: '폭염', lvl: '중대경보', tmfc: '', id: 'L1010200' },
  ]);
  context.buildWrnList();
  const majorWarningColorInput = list.children[2].querySelector('.wrnCol');

  majorWarningColorInput.oninput({ target: { value: '#550000' } });

  assert.equal(context.wrnColorOf('폭염', '경보'), '#FA2E1E');
  assert.equal(context.wrnColorOf('폭염', '중대경보'), '#550000');
});
