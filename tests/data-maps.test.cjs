const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');
const root = path.join(__dirname, '..');
const src = appSource(path.join(root, 'index.html'));
const start = src.indexOf('// ===================== 공공데이터포털 자료 공통');
const end = src.indexOf('// ===================== 해상도별 배치 프리셋', start);
assert.ok(start > 0 && end > start);
const fixture = n => fs.readFileSync(path.join(__dirname, 'fixtures/datamaps', n), 'utf8');
const plain = o => JSON.parse(JSON.stringify(o));
function ctx(extra = {}) {
  const store = new Map();
  const c = { S: { style: 'life', fillsByStyle: {}, dataByStyle: {}, labels: [], dataColors: {} },
    localStorage: { getItem: k => store.get(k), setItem: (k,v) => store.set(k,v) },
    setTimeout, Date, console, URL, _workRev: 0, curStyle: () => ({ data: 'life' }), ...extra };
  vm.createContext(c); vm.runInContext(src.slice(start,end), c);
  c.run = s => vm.runInContext(s,c); return c;
}
test('data responses: JSON/XML errors, absent values, malformed body, direct/wrapped HTTP', () => {
  const c=ctx();
  for(const [f,k] of Object.entries({'life-uv.json':'ok','life-air.json':'ok','life-nodata.json':'nodata','err-key.xml':'keyBad','err-quota.xml':'quota','err-denied.xml':'denied','err-noservice.xml':'noService','err-json-30.json':'keyBad','err-unauthorized.txt':'keyBad','err-html.txt':'format'})) assert.equal(c.dataReadBody(fixture(f)).kind,k,f);
  for(const [code,kind] of [[401,'keyBad'],[403,'denied'],[429,'quota'],[400,'noService']]) {
    assert.equal(c.dataHttpFail(code,'failure').kind,kind);
    assert.equal(c.dataHttpFail(502,JSON.stringify({error:`HTTP Error ${code}: failure`})).kind,kind);
  }
  assert.equal(c.dataReadBody('{broken').kind,'format');
  const single={response:{header:{resultCode:'00'},body:{items:{item:{h0:'0'}},totalCount:1}}};
  assert.equal(c.dataReadBody(JSON.stringify(single)).items.length,1);
});
test('credential decoding, encoding once and redaction BEFORE detail truncation',()=>{
  const c=ctx(), key='TEST-ONLY-'+'a'.repeat(180)+'+/=';
  c.localStorage.setItem('wcg_datakey',encodeURIComponent(key));
  assert.equal(c.dataKey(),key);
  assert.equal(new URL(c.dataUrl('https://apis.data.go.kr/test',{sidoName:'서울'})).searchParams.get('serviceKey'),key);
  for(const detail of [c.dataReadBody('<html>'+key+'</html>').detail,c.dataHttpFail(500,key).detail,c.dataMask('serviceKey='+encodeURIComponent(key)+'&x=1')]) {
    assert.ok(!detail.includes('TEST-ONLY')&&!detail.includes('aaaa'),detail);
  }
});
test('desktop default key, personal override, empty reset and redaction of both keys',()=>{
  const embedded='BUILTIN-TEST-ONLY+/=';
  const c=ctx({window:{wcgDesktop:{dataPortalKey:encodeURIComponent(embedded)}}});
  assert.equal(c.dataKey(),embedded);
  c.localStorage.setItem('wcg_datakey','PERSONAL-TEST-ONLY');
  assert.equal(c.dataKey(),'PERSONAL-TEST-ONLY');
  assert.equal(c.dataMask(embedded+' PERSONAL-TEST-ONLY'),'*** ***');
  c.localStorage.setItem('wcg_datakey','  ');assert.equal(c.dataKey(),embedded);
  c.localStorage.getItem=()=>{throw Error('blocked');};assert.equal(c.dataKey(),embedded);
  assert.equal(ctx().dataKey(),'','local web/old desktop stays supported');
});

test('stage boundaries and invalid/missing numbers never become low stage',()=>{
  const c=ctx();
  for(const [sk,vals,names] of [['pm10',[30,31,80,81,150,151],['좋음','보통','보통','나쁨','나쁨','매우나쁨']],['pm25',[15,16,35,36,75,76],['좋음','보통','보통','나쁨','나쁨','매우나쁨']],['uv',[2,3,5,6,7,8,10,11],['낮음','보통','보통','높음','높음','매우높음','매우높음','위험']],['air',[25,50,75,100],['낮음','보통','높음','매우높음']]]) assert.deepEqual(vals.map(v=>c.dataStep(sk,v).k),names);
  for(const v of ['',null,undefined,'-',-1,NaN,Infinity]) assert.equal(c.dataStep('pm10',v),null);
  assert.equal(c.dataStep('grade','예보없음'),null);
});
test('life issue times use KST and slots honor h0 absence and midnight',()=>{
  const c=ctx();
  for(const [time,first] of [['2026-10-10T06:29:00+09:00','2026100918'],['2026-10-10T06:30:00+09:00','2026101006'],['2026-10-10T18:30:00+09:00','2026101018']]) assert.equal(c.lifeBaseTimes(new Date(time))[0],first);
  const air=c.lifeParseItem(c.dataReadBody(fixture('life-air.json')).items[0]);
  assert.equal(air.vals[0],null); assert.ok(air.vals[1]>0);
  assert.equal(c.lifeParseItem({h0:'0',h3:'-999',h6:''}).vals[0],0);
  assert.equal(c.lifeParseItem({h0:'0',h3:'-999',h6:''}).vals[1],null);
  const slots=c.lifeSlots('2026100918',[air.vals,air.vals]);
  assert.equal(slots[0].i,1); assert.equal(c.lifeSlotTime('2026100918',6).d,10);
  assert.equal(c.lifeReadArea({kind:'ok',items:[{areaNo:'wrong'}]},'1114000000','2026100918','uv').kind,'format');
});
test('life fallback checks all former districts, averages, and does not substitute mismatched response',async()=>{
  const c=ctx(), calls=[];
  const r=await c.lifeAreaValues({code:'28125',altCodes:['28110','28140']},'2026100918','uv',async(areaNo)=>{
    calls.push(areaNo);
    return areaNo==='2812500000'?{kind:'nodata'}:{kind:'ok',items:[{areaNo,date:'2026100918',code:'A07_2',h0:areaNo==='2811000000'?'2':'6'}]};
  },()=>false);
  assert.equal(r.vals[0],4); assert.match(r.alt,/평균/); assert.equal(calls.length,3);
});
test('dust matches city and province, latest timestamp wins, missing and former districts remain explicit',()=>{
  const c=ctx();
  const areas=[{id:'인천/제물포구',sido:'인천',zone:'제물포구',code:'28125',altNames:['인천/중구','인천/동구']},{id:'인천/영종구',sido:'인천',zone:'영종구',code:'28155',altNames:['인천/중구']},{id:'서울/중구',sido:'서울',zone:'중구',code:'11140',altNames:[]}];
  const item=(sidoName,cityName,n,date='2026-10-10 12:00')=>({sidoName,cityName,pm10Value:String(n),pm25Value:'-',dataTime:date});
  const r=c.dustMatch([item('인천','중구',20),item('인천','동구',60),item('서울','중구',81),item('서울','중구',1,'2026-10-09 12:00'),item('서울','없는구',4)],areas);
  assert.deepEqual(plain(r.vals),{'인천/제물포구':[40,null],'인천/영종구':[20,null],'서울/중구':[81,null]});
  assert.match(r.via['인천/제물포구'],/평균/); assert.equal(r.unknown.length,1);
  const direct=c.dustMatch([item('인천','중구',20),item('인천','제물포구',99)],areas);
  assert.equal(direct.vals['인천/제물포구'][0],99);
});
test('forecast aliases, grades and issue/day defaults; malformed grades cannot clear a map',()=>{
  const c=ctx();
  const g=c.dfcGrades('영동 : 매우 나쁨,영서 : 좋음,전남광주 : 보통,없는권역 : 나쁨');
  assert.deepEqual(plain(g.grades),{강원영동:'매우나쁨',강원영서:'좋음',광주:'보통',전남:'보통'});
  assert.deepEqual(plain(g.unknown),['없는권역']);
  const p=c.dfcParse(c.dataReadBody(fixture('dustfcst-pm10.json')).items);
  assert.ok(p.issues.length>=2); assert.match(p.issues[0],/17시/);
  assert.equal(c.dfcDefaultDay(p.issues[0],['2026-10-09','2026-10-10']),'2026-10-10');
  assert.equal(c.dfcParse([{dataTime:'2026-10-09 17시 발표',informData:'2026-10-10',informGrade:'bad'}]).issues.length,0);
  const partial=c.dfcParse([{dataTime:'2026-10-09 17시 발표',informData:'2026-10-10',informGrade:'서울 : 나쁨'}, {dataTime:'2026-10-09 11시 발표',informData:'2026-10-11',informGrade:'서울 : 좋음'}]);
  assert.equal(partial.latest['2026-10-11'].issue,'2026-10-09 11시 발표');
  assert.equal(partial.latest['2026-10-10'].grades.서울,'나쁨');
});
test('pool concurrency, retry and fatal-stop do not send remaining requests',async()=>{
  const c=ctx(); let active=0,max=0,calls=0;
  const r=await c.dataPool([1,2,3,4,5,6],async()=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return {kind:'ok'};},{limit:2,gap:0});
  assert.equal(r.out.filter(Boolean).length,6);assert.equal(max,2);
  calls=0;const fatal=await c.dataPool([1,2,3],async()=>{calls++;return{kind:'quota'};},{limit:1,gap:0});
  assert.equal(fatal.fatal.kind,'quota');assert.equal(calls,1);
  calls=0;await c.dataPool([1],async()=>({kind:++calls<3?'tps':'ok'}),{gap:0});assert.equal(calls,3);
});
test('pagination keeps all pages and rejects repeated or failed continuation',async()=>{
  const c=ctx();let calls=0;
  c.dataGet=async()=>({kind:'ok',total:3,items:[{n:++calls}]});
  assert.equal((await c.dataGetPages('https://apis.data.go.kr/test',{},()=>false)).items.length,3);
  c.dataGet=async()=>({kind:'ok',total:3,items:[{n:1}]});
  assert.equal((await c.dataGetPages('https://apis.data.go.kr/test',{},()=>false)).kind,'format');
});
test('legend uses only visible painted stages, in stage order; labels stay with their own map',()=>{
  const c=ctx();
  c.S.fillsByStyle.life={a:'#FA2E1E',b:'#2ECC4A'};
  assert.deepEqual(plain(c.dataLegendItems('life')).map(x=>x.txt),['낮음','매우높음']);
  c.S.labels=[{id:1,data:'life',txt:'7'},{id:2,txt:'manual'}];
  c.dataLabelsSwap('life','dust');assert.equal(c.S.labels.length,1);
  c.dataLabelsSwap('dust','life');assert.equal(c.S.labels.length,2);
});
