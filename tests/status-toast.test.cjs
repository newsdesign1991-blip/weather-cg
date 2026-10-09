const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const appSource=require('../tools/app-source.cjs');
const source=appSource(path.join(__dirname,'..','index.html'));
function setup(){
  const timers=new Map(),node={style:{},dataset:{},textContent:''};let next=0;
  const ctx={$:()=>node,setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
  vm.createContext(ctx);const a=source.indexOf('let statusT = 0;'),b=source.indexOf('\n}',a)+2;vm.runInContext(source.slice(a,b),ctx);
  return {ctx,node,timers};
}
test('normal, formerly persistent and error toasts all auto-hide with reading time',()=>{
  for(const [hold,tone,ms] of [[false,undefined,2600],[true,undefined,4000],[true,'ok',4000],[true,'err',6000],[false,'warn',6000]]){
    const e=setup();e.ctx.status('태풍 4개 — 골라 주세요',hold,tone);
    assert.equal(e.node.style.opacity,'1');assert.equal(e.timers.size,1);
    const t=[...e.timers.values()][0];assert.equal(t.ms,ms);t.fn();assert.equal(e.node.style.opacity,'0');
    assert.equal(e.node.textContent,'태풍 4개 — 골라 주세요');
  }
});
test('new status replaces the old timer and empty status cancels immediately',()=>{
  const e=setup();e.ctx.status('old',true,'err');const old=[...e.timers.keys()][0];
  e.ctx.status('new',true);assert.equal(e.timers.has(old),false);assert.equal(e.timers.size,1);assert.equal(e.node.dataset.tone,undefined);
  e.ctx.status('');assert.equal(e.timers.size,0);assert.equal(e.node.style.opacity,'0');
});
