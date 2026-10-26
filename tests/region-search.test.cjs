const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const appSource = require('../tools/app-source.cjs');
const source = appSource(path.join(__dirname, '..', 'index.html'));
const begin = source.indexOf('function regionSearchEntries(');
const end = source.indexOf('function regionSearchReset(', begin);
assert.ok(begin >= 0 && end > begin);
const ctx = vm.createContext({});
vm.runInContext(source.slice(begin, end), ctx);
const zones = [
  {id:'a',sido:'서울',gu:'종로구',zone:'사직동'},
  {id:'b',sido:'서울',gu:'종로구',zone:'삼청동'},
  {id:'c',sido:'서울',gu:'중구',zone:'명동'},
  {id:'d',sido:'부산',zone:'중구'},
  {id:'e',sido:'경기',zone:'수원시 장안구'}
];
test('region names are qualified and duplicate district names stay separate', () => {
  const entries = ctx.regionSearchEntries(zones, false);
  const results = ctx.regionSearchMatches(entries, '중구');
  assert.equal(results.length,2);
  assert.deepEqual(Array.from(results, e=>e.name).sort(), ['부산 중구','서울 중구 명동']);
  assert.equal(ctx.regionSearchMatches(entries, '수원')[0].ids[0], 'e');
  assert.equal(ctx.regionSearchMatches(entries, '서울 종로구 사직동')[0].ids[0], 'a');
  assert.equal(ctx.regionSearchMatches(entries, ' 서울종로구 사직동 ')[0].ids[0], 'a');
  assert.equal(ctx.regionSearchMatches(entries, '').length, 0);
  assert.equal(ctx.regionSearchMatches(entries, '없는지역').length, 0);
});
test('시도 전체 묶음(구역 둘 이상만)이 먼저, 제주도산지는 한라산으로도 — 10-26', () => {
  const jz = [{id:'j1',sido:'제주',zone:'제주시북부'},{id:'j2',sido:'제주',zone:'제주도산지'},{id:'j3',sido:'제주',zone:'서귀포시남부'},{id:'u',sido:'울산',zone:'울산'}];
  const r = ctx.regionSearchMatches(ctx.regionSearchEntries(jz, false), '제주');
  assert.equal(r[0].name, '제주 전체'); assert.deepEqual(Array.from(r[0].ids), ['j1','j2','j3']);
  assert.equal(ctx.regionSearchMatches(ctx.regionSearchEntries(jz, false), '울산').length, 1, '구역 하나면 전체 묶음 없음');
  const h = ctx.regionSearchMatches(ctx.regionSearchEntries(jz, false), '한라산');
  assert.deepEqual(Array.from(h, (e) => e.name), ['제주 제주도산지 (한라산)']);
});
test('산 표시 검색 칠하기 — 한라산·강원 산지 줄, 칠하면 그 자리 산 색(없으면 만듦), 지우기 = 흰색, 되돌리기 한 번', () => {
  const src = source.slice(source.indexOf('const REGION_MTNS = ['), source.indexOf('function regionSearchReset('));
  const made = [];
  const sb = vm.createContext({ S: { insets: { jeju: {} }, mtns: [{ id: 'k', anchor: { lon: 128, lat: 37 }, col: '#FFFFFF' }] }, isSeoul: () => false, activeColor: '#123456',
    MTN_PRESETS: [{ label: '강원', size: 90, anchors: [{ lon: 1, lat: 2 }] }, { label: '제주', size: 71, anchors: [{ inset: 'jeju' }] }],
    newMtn: (o) => { const m = Object.assign({ col: '#FFFFFF' }, o); made.push(m); return m; }, mtnAnchorXY: () => ({ x: 1, y: 2 }), renderMtns: () => {}, window: {} });
  vm.runInContext(src, sb);
  assert.deepEqual(Array.from(sb.regionSearchMtnEntries(), (e) => e.name), ['제주 한라산 (산 표시)', '강원 산지 · 태백산맥 (산 표시)']);
  assert.equal(sb.regionSearchPaintMtns(['mtn:제주', 'mtn:강원'], false), 2);
  assert.equal(made.length, 1, '제주 산은 없어서 만들고, 강원은 있는 산을 칠함');
  assert.equal(sb.S.mtns[0].col, '#123456'); assert.equal(sb.S.mtns[1].col, '#123456'); assert.equal(sb.S.mtns[1].anchor.inset, 'jeju');
  sb.regionSearchPaintMtns(['mtn:제주'], true);
  assert.equal(sb.S.mtns[1].col, '#FFFFFF');
  const paint = source.slice(source.indexOf('function regionSearchPaint('), source.indexOf('function wireRegionSearch('));
  assert.equal((paint.match(/pushUndo\(/g) || []).length, 1);
  assert.match(paint, /if \(!nodes\.length && !mtnKeys\.length\) return;/);
});
test('Seoul offers district-wide selection first, without conflating dong IDs', () => {
  const results = ctx.regionSearchMatches(ctx.regionSearchEntries(zones.slice(0,3), true), '종로구');
  assert.equal(results[0].name, '서울 종로구 전체');
  assert.deepEqual(Array.from(results[0].ids), ['a','b']);
  assert.equal(results.length, 3);
});
test('search UI is ephemeral, export strips it, and paint is a single undo step', () => {
  assert.match(source,/const regionSearchSelected = new Set\(\)/);
  const paint = source.slice(source.indexOf('function regionSearchPaint('),source.indexOf('function wireRegionSearch('));
  assert.equal((paint.match(/pushUndo\(/g)||[]).length, 1);
  assert.match(paint,/for \(const node of nodes\) paint\(node, erase\)/);
  assert.match(source,/clone\.querySelectorAll\('\.brushSelHi, \.brushLive, \.regionSearchHi'\)/);
});
test('painting clears search selection after filling, without resetting query or scroll', () => {
  const code = source.slice(source.indexOf('function regionSearchPaint('),source.indexOf('function wireRegionSearch('));
  const selected = new Set(['a','b']);
  const calls = [];
  const results = {scrollTop:90};
  const sandbox = vm.createContext({
    S:{style:'sgg'}, isSeoul:()=>false, curStyle:()=>({search:1}), regionSearchSelected:selected,
    zoneEls:new Map([['a',[{el:'a'}]],['b',[{el:'b'}]]]),
    $:()=>results, animStop:()=>{}, animOff:()=>{},
    pushUndo:()=>calls.push('undo'),
    paint:(node,erase)=>{assert.equal(selected.size,2);calls.push([node,erase]);},
    renderFills:()=>{}, regionSearchHighlight:()=>calls.push(['highlight',selected.size]),
    regionSearchRender:()=>{results.scrollTop=0;calls.push(['render',selected.size]);},
    flash:msg=>calls.push(msg)
  });
  vm.runInContext(code,sandbox);
  sandbox.regionSearchPaint(false);
  assert.equal(selected.size,0);
  assert.equal(results.scrollTop,90);
  assert.deepEqual(calls,['undo',['a',false],['b',false],['highlight',0],['render',0],'2개 지역 색칠 완료']);
  selected.add('a');selected.add('b');
  sandbox.regionSearchPaint(true);
  assert.equal(selected.size,2,'erase retains its existing selection behavior');
});
test('desktop: search, select, paint, auto-clear, undo, Seoul group, export and map switching', {skip:process.env.WCG_BOOT_CHECK !== '1'}, () => {
  const raw=execFileSync(process.execPath,[path.join(__dirname,'../desktop/test/boot-check.cjs'),path.join(__dirname,'..'),'--wait=9000','--size=1400x1000','--eval='+path.join(__dirname,'region-search.boot-eval.js')],{encoding:'utf8',timeout:180000});
  const out=JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok,true,JSON.stringify(out.errors));
  assert.equal(out.evalResult.ok,true,JSON.stringify(out.evalResult));
});
