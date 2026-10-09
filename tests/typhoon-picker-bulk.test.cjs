const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const appSource = require('../tools/app-source.cjs');
const source = appSource(path.join(__dirname, '..', 'index.html'));
function fn(name) {
  const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
const plain = x => JSON.parse(JSON.stringify(x));
const row = (num, ft = 0) => [ft,2026,num,1,'202610090000','202610090000',ft?'202610101200':'202610090000',25+num,130+num,'N',10,980,30,200,80,100,'','', 'sea'].join(',');
function env() {
  const calls = {undo:0,picks:[],effects:[],arrive:0}, modals = [], observers = [];
  class El {
    constructor() { this.children = []; this.textContent = ''; }
    append(...items) { this.children.push(...items); }
    setAttribute() {}
  }
  const ctx = {
    console, Promise, Number, Object, Math, Date, Set,
    S:{style:'typhoonCompare',typhoon:{compare:[]},map:{s:.1}},
    typhoonRaw:null, typhoonPickSeq:0,
    $:()=>null, isTyphoon:()=>true, isTyphoonCompare:()=>true, curStyle:()=> 'typhoonCompare',
    status:()=>{}, fxBusy:(fx,on)=>calls.effects.push(on), fxRows:x=>x.children, fxArrive:()=>{},
    typBusyFx:()=>[], typArriveFx:()=>calls.arrive++,
    pushUndo:()=>calls.undo++, buildCompareSection:()=>{},syncCompareBulk:()=>{},renderTyphoon:()=>{},renderLegend:()=>{},
    autoTodayTyphoonLabel:()=>{},renderAll:()=>{},setTyphoonDefaultView:()=>{},
    selectTyphoonFromApi:idx=>calls.picks.push({idx,list:plain(ctx.typhoonRaw.whichList),src:ctx.typhoonRaw.src}),
    typhoonDisplayName:(yr,no,td)=>td?'TD':`제${no}호 태풍`,
    document:{body:{},createElement:()=>new El()},
    MutationObserver:class {constructor(cb){this.cb=cb;observers.push(this);}observe(){}disconnect(){this.off=true;}},
    jtwcModal:()=>{const m={list:new El(),note:new El(),open:true,alive:()=>m.open,close:()=>{m.open=false;m.onGone?.();}};modals.push(m);return m;},
    jtwcModalHead:()=>{},jtwcModalFoot:(m,f)=>m.buttons=f,
    apiKey:()=> 'test',_kmaDropRecent:()=>{},enrichTyphoonNames:async list=>list,WNS_HELPER:'http://fixture',
    typhoonApiUrl:()=>{},typhoonTdUrl:()=>{},attachEdgeTD:async()=>{},
    fetch:async()=>({ok:true}),_typScanRecent:async(url,td)=>td?null:{text:row(1)+'\n'+row(2)},
  };
  vm.createContext(ctx);
  vm.runInContext("const _cnum=v=>Number(v)||0;\n" + ['fmtKST','typPointFromRow','parseTypNow','typTdPointFromRow','parseTdRows','parseKmaTyphoonList','chooseTyphoonFromList','applyPickedTyphoon','jmaAreaRadKm','fetchJma','fetchTyphoon','compareBulkValue','applyCompareBulk'].map(fn).join('\n'),ctx);
  return {ctx,calls,modals,observers};
}
const tick = () => new Promise(r=>setImmediate(r));
test('KMA parser separates storms and joins linked TD without touching work',()=>{
  const e=env(), before=JSON.stringify(e.ctx.S);
  const td=[0,2026,3,1,2,'202610080000','202610080000',24,131,'N',10,1000,12,0,'TD','sea'].join(',');
  const list=e.ctx.parseKmaTyphoonList(row(1)+'\n'+row(2),td);
  assert.equal(list.length,2);assert.equal(list[0].points.length,1);assert.equal(list[1].points.length,2);
  assert.equal(list[1].points[0].td,true);assert.equal(JSON.stringify(e.ctx.S),before);
  assert.equal(e.ctx.parseKmaTyphoonList('bad','').length,0);
});
test('picker: cancel, removed modal, changed work and second selection',async()=>{
  const e=env(), list=e.ctx.parseKmaTyphoonList(row(1)+'\n'+row(2),'');
  let p=e.ctx.chooseTyphoonFromList(list,'KMA',()=>true);e.modals.at(-1).close();assert.equal(await p,-1);
  p=e.ctx.chooseTyphoonFromList(list,'KMA',()=>true);e.modals.at(-1).open=false;e.observers.at(-1).cb();assert.equal(await p,-1);
  let valid=true;p=e.ctx.chooseTyphoonFromList(list,'KMA',()=>valid);valid=false;e.modals.at(-1).list.children[1].onclick();assert.equal(await p,-1);
  p=e.ctx.chooseTyphoonFromList(list,'KMA',()=>true);e.modals.at(-1).list.children[1].onclick();assert.equal(await p,1);
  assert.equal(e.calls.undo,0);assert.equal(e.calls.picks.length,0);
  assert.ok(e.observers.every(o=>o.off));
});
test('KMA fetch never applies first storm implicitly; select second or cancel',async()=>{
  const e=env();let p=e.ctx.fetchTyphoon();await tick();
  assert.equal(e.calls.picks.length,0);assert.equal(e.calls.undo,0);assert.equal(e.calls.effects.at(-1),false);
  e.modals.at(-1).list.children[1].onclick();await p;
  assert.equal(e.calls.picks[0].idx,1);assert.equal(e.calls.undo,1);assert.equal(e.calls.arrive,1);
  p=e.ctx.fetchTyphoon();await tick();e.modals.at(-1).close();await p;assert.equal(e.calls.undo,1);
});
test('comparison dialog supports multiple selection, cancellation and one-step batch undo',async()=>{
  const e=env();e.ctx.$=selector=>selector==='#typLoadOv.on'?{}:null;
  const list=e.ctx.parseKmaTyphoonList(row(1)+'\n'+row(2),'');
  let pending=e.ctx.chooseTyphoonFromList(list,'KMA',()=>true),m=e.modals.at(-1);
  m.list.children[0].onclick();m.list.children[1].onclick();
  assert.equal(e.calls.undo,0);assert.match(m.buttons[0].label,/2개/);
  m.buttons[0].act();const selected=await pending;
  assert.deepEqual(plain(selected),[0,1]);
  e.ctx.applyPickedTyphoon(list,selected,'apihub');
  assert.equal(e.calls.undo,1);assert.deepEqual(e.calls.picks.map(p=>p.idx),[0,1]);
  pending=e.ctx.chooseTyphoonFromList(list,'KMA',()=>true);m=e.modals.at(-1);m.list.children[0].onclick();m.close();
  assert.equal(await pending,-1);assert.equal(e.calls.undo,1);
});
test('JMA fetch lists multiple storms, preserves points and discards obsolete requests',async()=>{
  const e=env();
  e.ctx.fetch=async url=>({json:async()=>url.endsWith('targetTc.json')?[{tropicalCyclone:'one',category:'TY'},{tropicalCyclone:'two',category:'TY'}]:[
    {part:'title',name:{en:url.includes('/one/')?'ONE':'TWO'},typhoonNumber:url.includes('/one/')?'1':'2'},
    {part:'Analysis',center:[25,130],validtime:{UTC:'2026-10-09T00:00:00Z'}},
    {advancedHours:24,center:[28,132],validtime:{UTC:'2026-10-10T00:00:00Z'}}]});
  let p=e.ctx.fetchJma();await tick();assert.equal(e.modals.at(-1).list.children.length,2);assert.equal(e.calls.undo,0);
  e.modals.at(-1).list.children[1].onclick();await p;
  assert.equal(e.calls.picks[0].idx,1);assert.match(e.calls.picks[0].list[1].name,/TWO/);assert.equal(e.calls.picks[0].list[1].points[1].fcst,true);
  p=e.ctx.fetchJma();await tick();e.ctx.S={...e.ctx.S};e.modals.at(-1).list.children[0].onclick();await p;assert.equal(e.calls.undo,1);
});
test('bulk style changes one property across hidden storms too, preserving data',()=>{
  const e=env();const cmp=e.ctx.S.typhoon.compare=[{id:'a',color:'#FF0000',show:1,iconScale:1,points:[{lon:130}],rangeFrom:'2026-10-01'},{id:'b',color:'#00FF00',show:0,iconScale:2,points:[{lon:140}],labels:[{idx:0,txt:'name'}]}];
  const old=plain(cmp);
  assert.equal(e.ctx.applyCompareBulk('iconScale','175'),true);assert.ok(cmp.every(c=>c.iconScale===1.75));
  assert.deepEqual(plain(cmp.map(({iconScale,...r})=>r)),old.map(({iconScale,...r})=>r));
  assert.equal(e.calls.undo,1);assert.equal(e.ctx.applyCompareBulk('iconScale','175'),false);assert.equal(e.calls.undo,1);
  e.ctx.applyCompareBulk('lineW','9.5');e.ctx.applyCompareBulk('dotIcon','1');e.ctx.applyCompareBulk('iconMode','daily');
  assert.ok(cmp.every(c=>c.lineW===9.5&&c.dotIcon===1&&c.iconMode==='daily'));
  for(const [key,value] of [['color','#333333'],['lineW','NaN'],['iconMode','bad'],['lineW','']])assert.equal(e.ctx.applyCompareBulk(key,value),false);
  assert.deepEqual(plain(cmp.map(c=>c.color)),old.map(c=>c.color));
});
test('manual fold and drawing group keep their controls; bulk wiring is per field',()=>{
  assert.match(source,/class="subFold closed" id="tycManual"/);
  assert.match(source,/foldWire\(\$\('#tycManual'\), 'wcg_tyc_manual_open'\)/);
  assert.match(source,/class="tycDrawGroup"[\s\S]*id="tycPen"[\s\S]*<svg[\s\S]*id="tycRefDrop"/);
  assert.match(source,/label = b.querySelector\('\.tycPenLabel'\)/);
  assert.match(source,/n.indeterminate = mixed/);
  assert.match(source,/id="tycBulkScaleRange"[^>]*type="range"[^>]*step="1"/);
  assert.match(source,/id="tycBulkWidthRange"[^>]*type="range"[^>]*step="0.1"/);
});
test('live slider updates preserve data and group undo without rebuilding controls',()=>{
  const e=env();const cmp=e.ctx.S.typhoon.compare=[{iconScale:1,color:'#112233',show:0},{iconScale:2,color:'#abcdef',show:1}];
  let rebuilds=0;e.ctx.buildCompareSection=()=>rebuilds++;
  e.ctx.applyCompareBulk('iconScale','70',{live:true,undo:true});
  e.ctx.applyCompareBulk('iconScale','80',{live:true,undo:false});
  assert.equal(e.calls.undo,1);assert.equal(rebuilds,0);assert.ok(cmp.every(c=>c.iconScale===.8));
  assert.equal(cmp[0].show,0);assert.equal(cmp[1].color,'#abcdef');
});
