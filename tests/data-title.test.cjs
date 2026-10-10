// 데이터별 제목·단위 자동(사용자 10-10: 자외선·대기정체 등을 칠하면 제목도 그에 맞게) — 표준 제목일 때만 바꾸고, 사용자가 고친 제목은 그대로.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');

const html = appSource(path.join(__dirname, '..', 'index.html'));
const fn = (name) => { const m = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html); assert.ok(m, name); return m[0]; };
const cst = (name) => { const m = new RegExp(`const ${name} = [^\\n]*;`).exec(html); assert.ok(m, name); return m[0]; };

function ctx(texts) {
  const c = { S: { texts }, renderTexts() { c.rendered = (c.rendered || 0) + 1; } };
  vm.createContext(c);
  vm.runInContext([cst('AUTO_TITLE_RE'), cst('AUTO_UNIT_RE'), fn('autoTitleTexts'), fn('bulTitleTexts'), fn('dataTitleFor'), fn('dataAutoTitle')].join('\n'), c);
  return c;
}
const T = () => [{ txt: '내일~모레' }, { txt: '예상 강수량' }, { txt: '단위 : mm' }];
const txts = (c) => c.S.texts.map((t) => t.txt);

test('데이터마다 제목·단위가 바뀌고 강수로 돌아오면 원래대로', () => {
  const c = ctx(T());
  c.dataAutoTitle('life', { idx: 'uv' }); assert.deepEqual(txts(c), ['내일~모레', '자외선 지수', '단위 : 지수']);
  c.dataAutoTitle('life', { idx: 'air' }); assert.deepEqual(txts(c), ['내일~모레', '대기정체 지수', '단위 : 지수']);
  c.dataAutoTitle('dust', { item: 'pm10', cond: 'HOUR' }); assert.deepEqual(txts(c), ['내일~모레', '미세먼지 농도', '단위 : ㎍/㎥']);
  c.dataAutoTitle('dust', { item: 'pm25', cond: 'DAILY' }); assert.deepEqual(txts(c), ['내일~모레', '초미세먼지 농도 (24시간 평균)', '단위 : ㎍/㎥']);
  c.dataAutoTitle('dustFcst', { code: 'PM25' }); assert.deepEqual(txts(c), ['내일~모레', '초미세먼지 예보', '단위 : 등급']);
  c.dataAutoTitle('dustFcst', { code: 'O3' }); assert.deepEqual(txts(c), ['내일~모레', '오존 예보', '단위 : 등급']);
  c.bulTitleTexts('snow'); assert.deepEqual(txts(c), ['내일~모레', '예상 적설량', '단위 : cm']);
  c.bulTitleTexts('rain'); assert.deepEqual(txts(c), ['내일~모레', '예상 강수량', '단위 : mm']);
  assert.ok(c.rendered >= 6);
});

test('사용자가 고친 제목·날짜 줄은 안 바뀐다', () => {
  const c = ctx([{ txt: '10일' }, { txt: '오늘 밤 자외선 주의' }, { txt: '단위 : mm' }]);
  c.dataAutoTitle('life', { idx: 'uv' });
  assert.deepEqual(txts(c), ['10일', '오늘 밤 자외선 주의', '단위 : 지수']);
});

test('칠하기 함수(lifeApply·dustApply·dfcApply)가 제목 자동을 부른다', () => {
  for (const [f, st] of [['lifeApply', 'life'], ['dustApply', 'dust'], ['dfcApply', 'dustFcst']]) assert.match(fn(f), new RegExp(`dataAutoTitle\\('${st}', info\\)`));
});
