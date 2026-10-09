const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{execFileSync}=require('node:child_process');
test('data maps: real app fetch/paint/errors/undo/save/export/snow', {skip:!process.env.WCG_BOOT_CHECK,timeout:480000},()=>{
  const root=path.join(__dirname,'..');
  const raw=execFileSync(process.execPath,['desktop/test/boot-check.cjs',root,'--wait=9000','--size=1600x900','--keepalive','--eval='+path.join(__dirname,'data-load.boot-eval.js')],{cwd:root,encoding:'utf8',timeout:470000});
  const out=JSON.parse(raw.slice(raw.indexOf('{')));assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.evalResult?.ok,true,JSON.stringify(out.evalResult));
});
