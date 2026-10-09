const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');
const source = appSource(path.join(__dirname, '..', 'index.html'));

test('sidebar card paints under its scrollbar gutter and insets the thumb', () => {
  assert.match(source, /#panel\s*\{[^}]*background-color:\s*var\(--surface-c\)/);
  assert.match(source, /#panel::-webkit-scrollbar-track\s*\{[^}]*margin-block:\s*20px/);
  assert.match(source, /#panel::-webkit-scrollbar-thumb\s*\{[^}]*border:\s*3px solid transparent;[^}]*background-clip:\s*padding-box/);
});

test('desktop sidebar: light/dark, left/right, 85–220% zoom, scrolling and footer', {skip:process.env.WCG_BOOT_CHECK!=='1'}, () => {
  const raw=execFileSync(process.execPath,[path.join(__dirname,'../desktop/test/boot-check.cjs'),path.join(__dirname,'..'),'--wait=9000','--size=1400x900','--eval='+path.join(__dirname,'sidebar-scroll.boot-eval.js')],{encoding:'utf8',timeout:180000});
  const out=JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok,true,JSON.stringify(out.errors));
  assert.equal(out.evalResult.ok,true,JSON.stringify(out.evalResult));
  assert.equal(out.evalResult.cases,16);
});
