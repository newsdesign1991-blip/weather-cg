const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const appSource=require('../tools/app-source.cjs');
const source=appSource(path.join(__dirname,'..','index.html'));
test('toolbar default follows artboard left and sits outside; custom and bottom positions remain',()=>{
  const start=source.indexOf('function applyToolbarPos() {'),end=source.indexOf('\n}',start)+2;
  const tb={offsetWidth:290,offsetHeight:44,style:{}},st={clientWidth:1200,getBoundingClientRect:()=>({left:400,top:40})};
  const ctx={toolbarX:null,toolbarY:null,TB_GAP:10,$:s=>s==='#topbar'?tb:st,document:{querySelector:()=>({getBoundingClientRect:()=>({left:474,top:130})})},clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),toolbarBottomY:()=>650};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);ctx.applyToolbarPos();
  assert.equal(tb.style.left,'74px');assert.equal(tb.style.top,'36px');
  ctx.toolbarX=200;ctx.toolbarY=100;ctx.applyToolbarPos();assert.equal(tb.style.left,'200px');assert.equal(tb.style.top,'100px');
  ctx.toolbarY='bottom';ctx.applyToolbarPos();assert.equal(tb.style.top,'650px');
  assert.match(source,/const TOOLBAR_V = 3;/);
  assert.match(source,/L\.toolbarX !== undefined && L\.toolbarV === TOOLBAR_V/);
  assert.match(source,/padding: var\(--toolbar-space, 64px\) 74px 26px/);
});
