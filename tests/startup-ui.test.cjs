const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const appSource=require('../tools/app-source.cjs');
const source=appSource(path.join(__dirname,'..','index.html'));

test('startup UI respects reduced motion and runs only for a fresh session',()=>{
  const a=source.indexOf('function startupUiEnter() {'),b=source.indexOf('\nbuildFrame();',a);
  assert.ok(a>=0&&b>a);
  const c={window:{matchMedia:q=>{assert.equal(q,'(prefers-reduced-motion: reduce)');return {matches:true};}}};
  vm.createContext(c);vm.runInContext(source.slice(a,b),c);
  assert.equal(c.startupUiEnter(),null);
  assert.match(source,/if \(freshOpen\) startupUiEnter\(\);/);
  assert.match(source,/html\.isDesktop #modalWindowDrag:not\(\[hidden\]\)/);
  assert.match(source,/if \(dragStrip\) dragStrip.hidden = !layers.length/);
});

test('desktop: staggered blur/fade, input cancellation and modal titlebar dragging', {skip:process.env.WCG_BOOT_CHECK!=='1'},()=>{
  const raw=execFileSync(process.execPath,[path.join(__dirname,'../desktop/test/boot-check.cjs'),path.join(__dirname,'..'),'--wait=9000','--size=1500x850','--eval='+path.join(__dirname,'startup-ui.boot-eval.js')],{encoding:'utf8',timeout:180000});
  const out=JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok,true,JSON.stringify(out.errors));assert.equal(out.evalResult.ok,true,JSON.stringify(out.evalResult));
});
