const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const appSource=require('../tools/app-source.cjs');
const source=appSource(path.join(__dirname,'..','index.html'));
const a=source.indexOf("const freshOpen = !sessionStorage.getItem('wcg_open');");
const b=source.indexOf('\nwireTour();',a);
assert.ok(a>=0&&b>a);
function run({fresh=true,pending=false,saved=null}={}){
 const calls=[];
 const c={sessionStorage:{getItem:()=>fresh?null:'1',setItem(){}},localStorage:{getItem:()=>pending?'1':null},
  S:{},loadWork:()=>saved,defaultsChanged:false,slotReapply:false,isTyphoon:()=>false};
 for(const name of ['normStyle','bumpSeq','applyVfDefaults','buildZones','markStyleBtns','markResBtns','restoreWrnRuntime','syncPanelFromState','renderAll','showPresetInfo','flash','applyPreset','showStartScreen','openCgSetup'])c[name]=()=>calls.push(name);
 vm.createContext(c);vm.runInContext(source.slice(a,b),c);return {calls,state:c.S};
}
test('ordinary launch opens scene setup even when a previous autosave exists; autosave is not restored/overwritten',()=>{
 for(const saved of [null,{style:'warn',map:{x:123}}]){
  const r=run({saved});assert.deepEqual(r.calls,['applyPreset','showStartScreen','openCgSetup']);
  if(saved)assert.equal(saved.map.x,123);
 }
});
test('refresh resumes saved work without scene setup; blank/pending start still opens it',()=>{
 const saved={style:'warn',map:{x:123}};const r=run({fresh:false,saved});
 assert.equal(r.state,saved);assert.ok(r.calls.includes('restoreWrnRuntime'));assert.ok(!r.calls.includes('openCgSetup'));
 for(const pending of [false,true])assert.ok(run({fresh:false,pending,saved:pending?saved:null}).calls.includes('openCgSetup'));
});
test('startup tour does not cover scene setup, and saved-project load dismisses it',()=>{
 assert.match(source,/const tourWillOpen = freshOpen && !startScreenOn\(\)/);
 const load=source.match(/function loadProjectData\([^)]*\) \{[\s\S]*?\n\}/)[0];
 assert.match(load,/closeCgSetup\(\);/);
});
test('desktop: setup is already open on launch; loading a saved project keeps its scene', {skip:process.env.WCG_BOOT_CHECK!=='1'},()=>{
 const raw=execFileSync(process.execPath,[path.join(__dirname,'../desktop/test/boot-check.cjs'),path.join(__dirname,'..'),'--wait=9000','--eval='+path.join(__dirname,'startup-scene.boot-eval.js')],{encoding:'utf8',timeout:180000});
 const r=JSON.parse(raw.slice(raw.indexOf('{')));assert.equal(r.ok,true,JSON.stringify(r.errors));assert.equal(r.evalResult.ok,true,JSON.stringify(r.evalResult));
});
