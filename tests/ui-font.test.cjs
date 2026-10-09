const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');

test('bundled Wanted Sans matches the unmodified official font',()=>{
  // wanteddev/wanted-sans commit 02c9b822349c188ada95f9e2d90c2ed18f853235:
  // packages/wanted-sans/fonts/webfonts/variable/complete/woff2/WantedSansVariable.woff2
  const bytes=fs.readFileSync(path.join(__dirname,'../FontNew/WantedSansVariable.woff2'));
  assert.equal(bytes.subarray(0,4).toString(),'wOF2');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'4259e7e9a172e634c2cb419d793b84148990316341e910443e5d10965b2c8f16');
});
test('desktop: Wanted Sans loads locally, UI uses it in both themes, CG keeps SUITE', {skip:process.env.WCG_BOOT_CHECK!=='1'},()=>{
  const raw=execFileSync(process.execPath,[path.join(__dirname,'../desktop/test/boot-check.cjs'),path.join(__dirname,'..'),'--wait=9000','--size=1100x850','--eval='+path.join(__dirname,'ui-font.boot-eval.js')],{encoding:'utf8',timeout:180000});
  const out=JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok,true,JSON.stringify(out.errors));
  assert.equal(out.evalResult.ok,true,JSON.stringify(out.evalResult));
});
