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

function parserContext() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    sliceBetween('const KMA_TERMS = {', 'function bulAssignDir(') + '\nthis.parseBulletin = parseBulletin; this.bulToken = bulToken; this.bulTokens = bulTokens;',
    context,
    { filename: 'bulletin-parser.js' },
  );
  return context;
}
const plain = (v) => JSON.parse(JSON.stringify(v));

test('"많은 곳" without its own region makes no numeric pseudo-region and keeps the base range', () => {
  const { parseBulletin } = parserContext();
  for (const line of ['- 제주도: 50~100mm(많은 곳 150mm 이상)', '- (강원) 강원영동: 30~80mm(많은 곳 80mm 이상)']) {
    const groups = plain(parseBulletin(line));
    assert.ok(groups.every((g) => g.tokens.every((t) => t.province || t.island)), line);
    assert.equal(groups.filter((g) => g.many).length, 0, line);   // 자리를 모르면 덧칠 그룹을 만들지 않는다
    const base = groups.find((g) => !g.many);
    assert.notEqual(base.labelTxt, '0');
    assert.match(base.regionText, /많은 곳 \d+⬆/);
  }
  const [b] = plain(parseBulletin('- 제주도: 50~100mm(많은 곳 150mm 이상)'));
  assert.equal(b.labelTxt, '50~100');
});

test('"많은 곳" with the region before it keeps that region and number', () => {
  const { parseBulletin } = parserContext();
  const groups = plain(parseBulletin('- 강원영동.경북북부: 30~80mm(강원영동, 경북북부동해안 많은 곳 100mm 이상)'));
  const many = groups.find((g) => g.many);
  assert.equal(many.labelTxt, '100⬆');
  assert.deepEqual(many.tokens.map((t) => t.province), ['강원', '경북']);
  assert.ok(groups.every((g) => g.tokens.every((t) => t.province || t.island)), 'no numeric pseudo-region');
});

test('"많은 곳" with the region after it still works', () => {
  const { parseBulletin } = parserContext();
  const many = plain(parseBulletin('- 강원영동: 30~80mm(많은 곳 강원북부산지 120mm 이상)')).find((g) => g.many);
  assert.equal(many.labelTxt, '120⬆');
  assert.deepEqual(many.tokens, [{ province: '강원', dir: '북부산지' }]);
});

test('"(X 제외)" becomes an exclusion instead of a direction', () => {
  const { parseBulletin } = parserContext();
  const [g] = plain(parseBulletin('- 광주.전남(남해안 제외): 10~40mm'));
  assert.deepEqual(g.tokens, [{ province: '광주', dir: '' }, { province: '전남', dir: '', exclude: '남해안' }]);
  const [j] = plain(parseBulletin('- 제주도(북부 제외): 5mm'));
  assert.deepEqual(j.tokens, [{ province: '제주', dir: '', exclude: '북부' }]);
});

test('dash variants, full-width colon and slash-separated regions are read', () => {
  const { parseBulletin } = parserContext();
  for (const line of ['– 강원영동: 10~40mm', '— 강원영동: 10~40mm', '− 강원영동: 10~40mm', '- 강원영동： 10~40mm']) {
    assert.equal(parseBulletin(line).length, 1, line);
  }
  const [g] = plain(parseBulletin('- 대구/경북: 10~40mm'));
  assert.deepEqual(g.tokens.map((t) => t.province), ['대구', '경북']);
  // 값 뒤 '/'로 이어지는 기존 다중 값 형식은 그대로
  const two = plain(parseBulletin('- (경상권) 부산.울산: 10~40mm / (22일) 대구.경북남부내륙: 5~20mm'));
  assert.equal(two.length, 2);
});

test('the same region on several lines keeps only the larger value', () => {
  const { parseBulletin } = parserContext();
  const groups = plain(parseBulletin('- (21일) 강원영동: 50~100mm\n- (22일) 강원영동: 5~10mm'));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].labelTxt, '50~100');
});

test('numeric-only fragments are not region tokens', () => {
  const { bulToken } = parserContext();
  assert.equal(bulToken('1'), null);
  assert.deepEqual(plain(bulToken('서해5도')), { island: '옹진' });
});
