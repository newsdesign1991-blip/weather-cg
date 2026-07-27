const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

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
  const lines = body.indexOf("addImg('경계선'");
  const labels = body.indexOf('const labData = aeLabelCompData()');
  const bar = body.indexOf("addImg('VF_제목바'");
  const title = body.indexOf("addText('제목_");
  const legend = body.indexOf('specLayers.push({ legendComp');
  assert.ok(lines >= 0 && lines < bar, 'VF bar must be above boundary lines');
  assert.ok(labels >= 0 && labels < bar, 'VF bar must be above map labels');
  assert.ok(bar < title, 'editable title must be above VF bar');
  assert.ok(title < legend, 'editable legend must be above editable title');
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
