const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {fnSrc, constSrc} = require('./tl-plan-ctx.cjs');

const row = (tm, cnt='4') => `${tm}, ${tm}, ${tm}, 108, L1010100, R, 2, 1, 00, ${cnt}, 101, =`;
const header = '#START7777\n# TM_FC, TM_EF, TM_IN, STN, REG_ID, WRN, LVL, CMD, GRD, CNT, RPT, =\n';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(hp = {up:true}) {
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id,{value:'',style:{},disabled:false,children:[],classList:{toggle(){}},replaceChildren(){this.children=[];},append(o){this.children.push(o);},get options(){return this.children;}}); return nodes.get(id); };
  node('#wrnDate').value='2026-08-03';
  const calls = [], deferred = [];
  const c = vm.createContext({$:node,document:{createElement:()=>({})},API_BASE:'https://api.example/',apiKey:()=> 'test',apiPop(){},wrnFetchSeq:0,wrnWhen:'',wrnSelFc:'__NOW__',TextDecoder,
    WNS_HELPER:'http://localhost',pingHelper:async()=>hp,fxSec:()=>null,fxBusy(){},wnsHelperOffNotice(){},status:s=>calls.push(s),
    showWrnResult:r=>calls.push(r),wrnHttpFail:()=>({kind:'net'}),wrnReadText:()=>({kind:'format'}),currentTm:()=> '202610091230',tmFull:t=>t,wrnTmText:t=>t,
    fetch:async url=>{calls.push({url});return new Promise(r=>deferred.push(r));},
    reflectWhenToPicker:()=>calls.push('reflect'),fetchWrn:async()=>false,setTimeout,clearTimeout});
  vm.runInContext(constSrc('WRN_SLOW_MS') + '\n' + ['wrnSlowNote','wrnDayTimes','wrnBrowsePast','wrnDayOptions','fetchWrnDay','wrnSelectTime'].map(fnSrc).join('\n'),c);
  const respond = (body,status=200) => deferred.shift()({ok:status===200,status,text:async()=>body,arrayBuffer:async()=>new TextEncoder().encode(body).buffer});
  return {c,node,calls,respond};
}
test('daily bulletin parser deduplicates actual completed announcement times, not effective times',()=>{
  const {c}=setup();
  const text=header+[row('202608031000'),row('202608031000'),row('202608031730'),row('202608041000'),row('202608030900','3')].join('\n');
  assert.deepEqual(Array.from(c.wrnDayTimes(text,'20260803')),['202608031730','202608031000']);
  assert.deepEqual(Array.from(c.wrnDayTimes(header+'#7777END','20260803')),[]);
  for(const invalid of ['', '<html>error</html>',header+'bad row']) assert.equal(c.wrnDayTimes(invalid,'20260803'),null);
});
test('day lookup only fills selector: never paints and never changes applied map time',async()=>{
  const {c,node,calls,respond}=setup();
  const p=c.fetchWrnDay(); await tick();
  respond(header+row('202608031000')); assert.equal(await p,true);
  assert.equal(c.wrnWhen,'');
  assert.deepEqual(node('#wrnBulletinSel').options.map(o=>o.value),['','202608031000','202608032359']);
  assert.equal(node('#wrnBulletinSel').value,'');
  const url=decodeURIComponent(calls.find(x=>x&&x.url).url);
  assert.match(url,/tmfc1=202608030000&tmfc2=202608032359/);
});
test('no announcements offers a separately labeled snapshot; broken response keeps work',async()=>{
  const {c,node,respond,calls}=setup();
  let p=c.fetchWrnDay(); await tick(); respond(header); assert.equal(await p,true);
  assert.match(node('#wrnBulletinSel').options[1].textContent,/현황 \(발표와 별도\)/);
  p=c.fetchWrnDay(); await tick(); respond('<html>error</html>'); assert.equal(await p,false);
  assert.equal(c.wrnWhen,''); assert.equal(calls.at(-1).kind,'format');
});
test('late day replies are ignored after another date or now selection',async()=>{
  const {c,node,respond}=setup();
  const p=c.fetchWrnDay(); await tick(); c.wrnFetchSeq++;
  respond(header+row('202608031000')); assert.equal(await p,null);
  assert.equal(node('#wrnBulletinSel').options.length,0);
});
test('picked timestamp fetches a full effective snapshot and rolls back on failure',async()=>{
  const {c,node}=setup(); const calls=[];
  c.fetchWrn=async(...args)=>{calls.push(args);return false;};
  await c.wrnSelectTime('202608031000');
  assert.equal(calls[0][0],'202608031000'); assert.equal(c.wrnWhen,'');
  c.fetchWrn=async()=>null; await c.wrnSelectTime('202608031000');
  assert.equal(c.wrnWhen,'','superseded request must not change the applied timestamp');
  assert.equal(node('#wrnBulletinSel').value,'');
});
// 10-12 '특보 없을 때 기상청 응답이 너무 늦어요' — 응답이 늦으면 결과 카드에 진행 문구, 응답이 오면 바로 멈춘다(결과 카드를 덮지 않게)
test('slow reply shows a retry note on the result card and stops as soon as the reply arrives',async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const {c,calls,respond}=setup({up:true,hedge:true});
  c.WRN_SLOW_MS=[20,70];
  const p=c.fetchWrnDay(); await tick();
  await sleep(45);
  const notes=()=>calls.filter(x=>x&&x.kind==='busy'&&x.slow);
  assert.deepEqual(notes().map(x=>[x.slow,x.hedge]),[[1,true]],'1단계: 헬퍼가 하나 더 보내는 중');
  respond(header+row('202608031000')); assert.equal(await p,true);
  await sleep(60);
  assert.equal(notes().length,1,'응답이 온 뒤엔 2단계 문구가 결과를 덮지 않는다');
  assert.equal(calls.filter(x=>x===null||(x&&typeof x==='object'&&'kind' in x)).at(-1),null,'마지막 카드 = 결과(목록 고르기)');
  // 밀린 요청은 문구를 바꾸지 않는다
  const s2=setup({up:true}); s2.c.WRN_SLOW_MS=[20,40];
  const p2=s2.c.fetchWrnDay(); await tick(); s2.c.wrnFetchSeq++;
  await sleep(60);
  assert.equal(s2.calls.filter(x=>x&&x.slow).length,0);
  s2.respond(header); assert.equal(await p2,null);
});
