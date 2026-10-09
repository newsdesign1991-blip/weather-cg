const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const appSource=require('../tools/app-source.cjs');
const source=appSource(path.join(__dirname,'..','index.html'));
test('datetime controls keep date and time in one aligned row below their label',()=>{
  assert.match(source,/\.row:has\(> \.dpDateTime\) \{ display: grid;/);
  assert.match(source,/\.dpDateTime \{ display: grid; grid-template-columns: minmax\(0, 1fr\) max-content;/);
  assert.match(source,/\.dpDateTime \.dpField, \.dpDateTime \.dpTime \{ height: 32px;/);
});
test('desktop date/time alignment at narrow and wide panel sizes',{skip:process.env.WCG_BOOT_CHECK!=='1'},()=>{
  const raw=require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'../desktop/test/boot-check.cjs'),path.join(__dirname,'..'),'--wait=9000','--size=1500x1000','--eval='+path.join(__dirname,'datetime-alignment.boot-eval.js')],{encoding:'utf8',timeout:180000});
  const out=JSON.parse(raw.slice(raw.indexOf('{')));assert.equal(out.ok,true,JSON.stringify(out.errors));assert.equal(out.evalResult.ok,true,JSON.stringify(out.evalResult));
});
