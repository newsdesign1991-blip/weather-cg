const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');

const html = appSource(path.join(__dirname, '..', 'index.html'));

function sliceBetween(startText, endText) {
  const start = html.indexOf(startText);
  const end = html.indexOf(endText, start);
  assert.notEqual(start, -1, `missing start marker: ${startText}`);
  assert.notEqual(end, -1, `missing end marker: ${endText}`);
  return html.slice(start, end);
}

test('AE base excludes the VF bar, editable title, and editable legend', () => {
  const body = sliceBetween('async function aeBaseBlob(', '// 브러쉬 덧칠');
  assert.match(body, /querySelector\(['"]#L_vfBar['"]\)\?\.remove\(\)/);
  assert.match(body, /querySelector\(['"]#L_title['"]\)\?\.remove\(\)/);
  assert.match(body, /querySelector\(['"]#L_legend['"]\)\?\.remove\(\)/);
});

test('AE bar is added after map overlays and before editable title and legend', () => {
  // AE 레이어 순서 = 타임라인 레이어 계획(tlLayerPlan)의 역순(아래→위). 계획을 실제로 돌려 순서를 본다.
  const { planCtx } = require('./tl-plan-ctx.cjs');
  const S = { style: 'sgg', res: '1920x1080-vf', vfBar: { on: 1 }, legend: { on: 1, auto: 0, items: [{ col: '#FA2E1E', txt: '80~100' }] },
    texts: [{ id: 'x1', txt: '내일~모레' }, { id: 'x2', txt: '예상 강수량' }], labels: [{ id: 'l1', txt: '10', fill: '#2255FF' }],
    mtns: [{ id: 'm1', txt: '설악산', col: '#8E6A8E' }], fillsByStyle: { sgg: { z1: '#FA2E1E', z2: '#FFE7E3' } } };
  const ctx = planCtx(S);
  const ae = [...ctx.tlLayerPlan()].reverse().map((L) => L.id);   // AE 쌓는 순서(아래→위)
  const at = (id) => { const i = ae.indexOf(id); assert.ok(i >= 0, 'missing ' + id + ' in ' + ae.join(',')); return i; };
  assert.equal(ae[0], 'st:bg', '배경·지도가 맨 아래');
  assert.ok(at('st:lines') < at('st:vfbar'), 'VF bar must be above boundary lines');
  assert.ok(at('label:l1') < at('st:vfbar'), 'VF bar must be above map labels');
  assert.ok(at('st:vfbar') < at('st:title:x1') && at('st:title:x1') < at('st:title:x2'), 'editable titles must be above VF bar(문서 순서대로)');
  assert.ok(at('st:title:x2') < at('st:legend'), 'editable legend must be above editable title');
  assert.ok(at('fill:#FFE7E3') < at('fill:#FA2E1E') && at('fill:#FA2E1E') < at('st:lines'), '칠(밝은 색이 아래) → 경계선');
  assert.ok(at('st:lines') < at('st:mtnBase') && at('st:mtnBase') < at('mtn:m1') && at('mtn:m1') < at('label:l1'), '경계선 → 산(바탕) → 산 → 라벨');
  // sendToAE 일반 지도 분기는 계획을 역순으로 돌며 정적 레이어를 이렇게 바꾼다
  const body = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  const normal = body.slice(body.indexOf('// 일반 지도 — 계획의 아래(뒤)→위(앞)'));
  assert.match(normal, /for \(const L of plan\.slice\(\)\.reverse\(\)\)/);
  assert.match(normal, /L\.sub === 'vfbar'\) addImg\('VF_제목바', await aeVfBarBlob\(\)\)/);
  assert.match(normal, /else await addTop\(L\)/);
  assert.match(body, /if \(L\.sub\.startsWith\('title:'\)\) \{ const t = S\.texts\.find\(\(x\) => x\.id === L\.key\); if \(t\) addText\('제목_'/);
  assert.match(body, /specLayers\.push\(\{ legendComp, name: '범례' \}\)/);
});

test('AE typhoon branch keeps the VF bar baked in its background and puts title and legend on top', () => {
  const body = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  const tyStart = body.indexOf('if (isTyphoon())');
  const tyEnd = body.indexOf('// 일반 지도 — 계획의 아래(뒤)→위(앞)', tyStart);
  assert.ok(tyStart >= 0 && tyEnd > tyStart, 'missing typhoon branch');
  const ty = body.slice(tyStart, tyEnd);
  // 배경 svgBlob에서 지우는 레이어 목록에 L_vfBar가 없어야 VF 바가 배경에 남는다
  const removed = [...ty.matchAll(/for \(const id of \[([^\]]*)\]\)/g)].map((m) => m[1]).join(',');
  assert.match(removed, /#L_title/);
  assert.doesNotMatch(removed, /L_vfBar/);
  const rig = Math.max(ty.lastIndexOf('specLayers.push({ compareRig'), ty.lastIndexOf('specLayers.push({ typhoonRig'));
  const top = ty.indexOf('await addTop(L)', rig);
  assert.ok(rig >= 0 && top > rig, 'editable title·legend must be above typhoon rig');
  assert.match(ty.slice(top - 160, top), /L\.sub === 'legend' \|\| L\.sub\.startsWith\('title:'\)/);
});

test('AE legend contract is produced from rendered rectangles and texts', () => {
  const body = sliceBetween('function aeLegendCompData()', 'async function sendToAE()');
  assert.match(body, /#L_legend/);
  assert.match(body, /querySelectorAll\(['"]rect['"]\)/);
  assert.match(body, /querySelectorAll\(['"]text['"]\)/);
  assert.match(body, /getBBox\(\)/);
  assert.match(body, /shape:\s*\{/);
  assert.match(body, /text:\s*\{/);
});

test('AE bar export keeps only the title bar SVG layer', () => {
  const body = sliceBetween('async function aeVfBarBlob()', 'function aeLegendCompData()');
  assert.match(body, /keepLayers\(c,\s*\[['"]L_vfBar['"]\]\)/);
});
