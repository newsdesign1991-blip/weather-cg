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
  const body = sliceBetween('async function aeBaseBlob()', '// 브러쉬 덧칠');
  assert.match(body, /querySelector\(['"]#L_vfBar['"]\)\?\.remove\(\)/);
  assert.match(body, /querySelector\(['"]#L_title['"]\)\?\.remove\(\)/);
  assert.match(body, /querySelector\(['"]#L_legend['"]\)\?\.remove\(\)/);
});

test('AE bar is added after map overlays and before editable title and legend', () => {
  const body = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  // 일반 지도 분기만 본다(태풍 분기에도 제목·범례 addText가 있어 첫 위치를 잡으면 엉뚱한 줄이 걸림)
  const normalStart = body.indexOf("addImg('배경·지도'");
  assert.ok(normalStart >= 0, 'missing normal-map branch');
  const normal = body.slice(normalStart);
  const lines = normal.indexOf("addImg('경계선'");
  const labels = normal.indexOf('const labData = aeLabelCompData()');
  const bar = normal.indexOf("addImg('VF_제목바'");
  const title = normal.indexOf("addText('제목_", bar);
  const legend = normal.indexOf('specLayers.push({ legendComp', title);
  assert.ok(bar >= 0, 'missing VF bar layer');
  assert.ok(lines >= 0 && lines < bar, 'VF bar must be above boundary lines');
  assert.ok(labels >= 0 && labels < bar, 'VF bar must be above map labels');
  assert.ok(title > bar, 'editable title must be above VF bar');
  assert.ok(legend > title, 'editable legend must be above editable title');
});

test('AE typhoon branch keeps the VF bar baked in its background and puts title and legend on top', () => {
  const body = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  const tyStart = body.indexOf('if (isTyphoon())');
  const tyEnd = body.indexOf("addImg('배경·지도'", tyStart);
  assert.ok(tyStart >= 0 && tyEnd > tyStart, 'missing typhoon branch');
  const ty = body.slice(tyStart, tyEnd);
  // 배경 svgBlob에서 지우는 레이어 목록에 L_vfBar가 없어야 VF 바가 배경에 남는다
  const removed = [...ty.matchAll(/for \(const id of \[([^\]]*)\]\)/g)].map((m) => m[1]).join(',');
  assert.match(removed, /#L_title/);
  assert.doesNotMatch(removed, /L_vfBar/);
  const rig = Math.max(ty.lastIndexOf('compareRig'), ty.lastIndexOf('typhoonRig'));
  const title = ty.indexOf("addText('제목_", rig);
  const legend = ty.indexOf('legendComp', title);
  assert.ok(rig >= 0 && title > rig, 'editable title must be above typhoon rig');
  assert.ok(legend > title, 'editable legend must be above editable title');
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
