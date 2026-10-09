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
const catalog = '#START7777\n2024,3,2,4,202407200600,202407270600,개미,GAEMI,설명,=\n2024,4,2,4,202407210300,202407231200,프라피룬,PRAPIROON,설명,=\n#7777END';
test('official catalog parses names/dates and manual names override without erasing official names', async () => {
  const ctx = {setTimeout,clearTimeout,typNameGet:()=>'',apiKey:()=> 'fixture',kmaRequest:()=>({p:Promise.resolve(catalog)})};
  vm.createContext(ctx);vm.runInContext(['typhoonDisplayName','parseTyphoonCatalog','getTyphoonCatalog','enrichTyphoonNames'].map(fn).join('\n'),ctx);
  const list = ctx.parseTyphoonCatalog(catalog);assert.equal(list.length,2);assert.equal(list[0].name,'제3호 태풍 개미');assert.equal(list[0].englishName,'GAEMI');
  assert.equal(ctx.parseTyphoonCatalog('<html>error</html>').length,0);
  const track = [{year:2024,tno:'03',points:[]},{year:2024,tno:'4',td:true}];await ctx.enrichTyphoonNames(track);
  assert.equal(track[0].kmaName,'개미');assert.equal(track[1].kmaName,undefined);
  ctx.typNameGet=()=> '사용자 이름';assert.equal(ctx.typhoonDisplayName(2024,3,false,'개미'),'제3호 태풍 사용자 이름');
  ctx.kmaRequest=()=>({p:Promise.reject(new Error('offline'))});await ctx.enrichTyphoonNames(track);assert.equal(track[0].kmaName,'개미');
});
test('comparison identity separates years/providers and preserves edited style on refresh',()=>{
  const pts=[{tmef:'202407200600',lon:130},{tmef:'202407210600',lon:131}];
  const ctx={S:{typhoon:{src:'kma',whichList:[{year:2024,tno:3,name:'개미'}],whichSel:0,compare:[]}},seq:1,CMP_PALETTE:['#ff0000'],curTyphoonPoints:()=>pts,pushUndo:()=>{},buildCompareSection:()=>{},renderTyphoon:()=>{},renderLegend:()=>{},status:()=>{}};
  vm.createContext(ctx);vm.runInContext(fn('addCompareForecast'),ctx);
  ctx.addCompareForecast(true);const first=ctx.S.typhoon.compare[0];assert.equal(first.showName,1);assert.equal(first.iconScale,1.25);assert.equal(first.lineW,5);first.name='수정한 이름';first.color='#abcdef';first.show=0;first.iconScale=.7;first.lineW=3.5;
  ctx.addCompareForecast(true);assert.equal(ctx.S.typhoon.compare.length,1);assert.equal(first.color,'#abcdef');assert.equal(first.name,'수정한 이름');assert.equal(first.show,0);assert.equal(first.iconScale,.7);assert.equal(first.lineW,3.5);
  ctx.S.typhoon.whichList[0].year=2025;ctx.addCompareForecast(true);
  ctx.S.typhoon.src='jma';ctx.addCompareForecast(true);
  ctx.S.typhoon.whichList[0].archive=true;ctx.addCompareForecast(true);assert.equal(ctx.S.typhoon.compare.length,4);
  ctx.S.typhoon.src='jtwc';ctx.S.typhoon.whichList[0].basin='W';ctx.addCompareForecast(true);
  ctx.S.typhoon.whichList[0].basin='E';ctx.addCompareForecast(true);assert.equal(ctx.S.typhoon.compare.length,6);
});
test('history and comparison controls share the large dialog with explicit basket',()=>{
  const modal=source.slice(source.indexOf('<div id="typLoadOv"'),source.indexOf('id="typPlay"'));
  for(const id of ['tycFetch','tycFetchJma','tycJtwcDl','typHistoryMonth','typHistoryFetch','typHistorySearch','typLoadBasket'])assert.ok(modal.includes('id="'+id+'"'),id);
  assert.match(source,/typ_data\.php\?YY=[\s\S]*?&mode=0&disp=1/);
  assert.match(source,/sourceKey/);
});

test('history month means genesis month, not the months crossed during the lifetime',()=>{
  const ctx={typhoonDateKST:(s)=>{const d=new Date(Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8),+s.slice(8,10))+9*3600e3);return d.toISOString().slice(0,10);}};
  vm.createContext(ctx);vm.runInContext(fn('typhoonCatalogInMonth'),ctx);
  const list=[{tno:1,start:'202406010000',end:'202407050000'},{tno:2,start:'202406301800'},{tno:3,start:'202407050000'},{tno:4,start:'202407311800'},{tno:5,start:'202408010000'}];
  assert.deepEqual(Array.from(ctx.typhoonCatalogInMonth(list,'2024-07'),w=>w.tno),[2,3]);
  assert.equal(ctx.typhoonCatalogInMonth(list,'2024-02').length,0);
});
test('JTWC multiple load adds valid storms together and discards results after closing',async()=>{
  const applied=[];let alive=true;
  const modal={list:{querySelectorAll:()=>[]},note:{},alive:()=>alive,close:()=>{alive=false;}};
  const ctx={S:{typhoon:{}},jtwcSeq:0,curStyle:()=> 'compare',isTyphoonCompare:()=>true,jtwcModalFoot:()=>{},jtwcGet:async p=>({ok:p!=='bad',text:p}),parseJtwcTcw:text=>[{name:text,points:[{},{}]}],applyPickedTyphoon:(list,indices,src)=>applied.push({list,indices,src}),renderTyphoon:()=>{},typArriveFx:()=>{},status:()=>{},jtwcShowFail:()=>{},fetchJtwc:()=>{}};
  vm.createContext(ctx);vm.runInContext(fn('loadJtwcSelection'),ctx);
  await ctx.loadJtwcSelection([{path:'one'},{path:'bad'},{path:'two'}],modal);
  assert.equal(applied.length,1);assert.equal(applied[0].list.length,2);assert.equal(applied[0].src,'jtwc');assert.equal(ctx.S.typhoon.r15Buf,150);
  alive=true;ctx.jtwcGet=async()=>{alive=false;return {ok:true,text:'late'};};
  await ctx.loadJtwcSelection([{path:'late'}],modal);assert.equal(applied.length,1);
});
test('desktop comparison: split dialog, multiple selections, search, history, names, save/load',{skip:process.env.WCG_BOOT_CHECK!=='1'},()=>{
  const raw=require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'../desktop/test/boot-check.cjs'),path.join(__dirname,'..'),'--wait=9000','--size=1500x1000','--eval='+path.join(__dirname,'typhoon-compare-history.boot-eval.js')],{encoding:'utf8',timeout:180000});
  const out=JSON.parse(raw.slice(raw.indexOf('{')));assert.equal(out.ok,true,JSON.stringify(out.errors));assert.equal(out.evalResult.ok,true,JSON.stringify(out.evalResult));
});
