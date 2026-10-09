// Disposable boot-check profile: only fetch is replaced; actual UI, painting, save, undo and export run.
const q=s=>document.querySelector(s), pause=ms=>new Promise(r=>setTimeout(r,ms));
const check=(v,m)=>{if(!v)throw new Error(m);};
const originalFetch=window.fetch, requests=[], captured=[];
const fixture=async name=>JSON.parse(await (await originalFetch('tests/fixtures/datamaps/'+name)).text());
const uv=await fixture('life-uv.json'), air=await fixture('life-air.json'), forecast=await fixture('dustfcst-pm10.json');
let failure='', delay=0, missing=false, gwSido='';   // gwSido = 이 시도는 게이트웨이 시간 초과(504 SERVICETIMEOUT — 다시 보내도 계속)
let fcByDate=null;   // 예보 조회일 → items(있으면 그 날짜 응답을 이것으로 — 오늘 05시 발표 뒤 모양)
const asked=[];   // [경로, 시도|조회일, searchCondition, numOfRows] — 키는 남기지 않는다
// 미세먼지 농도 가짜 응답 = DAILY(최근 24시간 시간별 값, 실측 모양): 2026-10-09 01:00 ~ 24:00. 강원 양양군은 마지막 시각 줄이 없다(직전 시각 값으로 보충돼야).
const dustHours=Array.from({length:24},(_,i)=>`2026-10-09 ${String(i+1).padStart(2,'0')}:00`);
const json=o=>new Response(JSON.stringify(o),{headers:{'Content-Type':'application/json'}});
window.fetch=async function(url,opts){
  const s=String(url);
  if(s.startsWith(WNS_HELPER+'/ping'))return json({ok:true,ff:true,ver:20261009});
  if(s.includes('/api/frame'))return json({ok:true});
  if(s.includes('/api/ae')){captured.push(JSON.parse(opts.body));return json({ok:true,ae:'test'});}
  if(s.startsWith(WNS_HELPER+'/api/kma?')){
    const u=new URL(new URL(s).searchParams.get('u'));requests.push(u.pathname); // No credentials in test output.
    asked.push([u.pathname.split('/').pop(),u.searchParams.get('sidoName')||u.searchParams.get('searchDate')||u.searchParams.get('areaNo')||'',u.searchParams.get('searchCondition')||'',u.searchParams.get('numOfRows')||'',u.searchParams.get('InformCode')||'']);
    if(delay)await pause(delay);
    if(failure==='403')return new Response(JSON.stringify({error:'HTTP Error 403: Forbidden'}),{status:502});
    if(failure==='format')return new Response('<html>maintenance</html>');
    if(missing)return json({response:{header:{resultCode:'03'},body:{items:[]}}});
    if(u.pathname.includes('LivingWthrIdx')){
      const isAir=u.pathname.includes('AirDiffusion'), out=JSON.parse(JSON.stringify(isAir?air:uv));
      const it=out.response.body.items.item[0];it.areaNo=u.searchParams.get('areaNo');it.date=u.searchParams.get('time');
      const n=Number(it.areaNo.slice(0,5));
      for(const k of Object.keys(it))if(/^h\d+$/.test(k))it[k]=String(isAir?[25,50,75,100][n%4]:(n+Number(k.slice(1)))%12);
      return json(out);
    }
    if(u.pathname.includes('ArpltnStats')){
      const sido=u.searchParams.get('sidoName');
      if(sido===gwSido)return new Response(JSON.stringify({ok:false,error:'HTTP Error 504: Gateway Time-out'}),{status:502});
      const items=[];
      dataAreas().filter(a=>a.sido===sido).forEach((a,i)=>{for(const t of dustHours){if(a.id==='강원/양양군'&&t===dustHours[23])continue;items.push({sidoName:sido,cityName:a.zone,districtCode:'0'+(i%9),dataTime:t,pm10Value:String([20,60,100,180][i%4]),pm25Value:i===0?'-':String([10,20,50,90][i%4])});}});
      return json({response:{header:{resultCode:'00'},body:{items,totalCount:sido==='광주'?0:items.length}}});   // 광주는 총건수 0(실측)
    }
    // 예보: 오늘 조회 = 0건(05시 발표 전 모양) → 앱이 어제 조회를 함께 받아야 한다
    if(fcByDate&&fcByDate[u.searchParams.get('searchDate')]){const items=fcByDate[u.searchParams.get('searchDate')];return json({response:{header:{resultCode:'00'},body:{items,totalCount:items.length}}});}
    if(u.searchParams.get('searchDate')===dataKstNow().ymd)return json({response:{header:{resultCode:'00',resultMsg:'NORMAL_CODE'},body:{items:[],totalCount:0}}});
    return json(forecast);
  }
  return originalFetch.call(this,url,opts);
};
const setKey=()=>{q('#dataKeyIn').value='fixture-only-not-a-real-key';q('#dataKeyIn').dispatchEvent(new Event('input',{bubbles:true}));};
const openStyle=async st=>{const w=JSON.parse(JSON.stringify(stateForSave()));w.style=st;loadProjectData(w,null);await pause(100);revealSec(st);};
try{
  q('#tourClose')?.click();q('#tossOv .tossX')?.click();q('#cgsX')?.click();
  setKey();await openStyle('life');
  delay=120;
  const initialLife=fetchLife();await pause(35);q('#lifeIdx [data-v="air"]').click();
  await initialLife;delay=0;
  check(!dataInfo('life')&&dataPick.life.idx==='air','first load overwrote a changed index');
  q('#lifeIdx [data-v="uv"]').click();
  check(await fetchLife()===true,'life load failed: '+q('#lifeResult').textContent);
  check(Object.keys(fills()).length===230,'life did not paint 230 regions');
  check(dataLegendItems('life').length>1,'life legend absent');
  const lifeCalls=requests.length;
  const time=q('#lifeTime');time.value=String([...time.options].map(o=>Number(o.value)).find(v=>v!==dataInfo('life').slot));time.dispatchEvent(new Event('change',{bubbles:true}));
  check(requests.length===lifeCalls,'slot fetched again');
  check(time._dd?.field,'time selector not app dropdown');
  q('#lifeLabels').checked=true;q('#lifeLabels').dispatchEvent(new Event('change',{bubbles:true}));
  check(S.labels.filter(x=>x.data==='life').length===18,'city labels missing');
  setActive('#123456');pushUndo();paint(zoneEls.get('서울/중구')[0].el);renderFills();
  q('#lifeLabels').checked=false;q('#lifeLabels').dispatchEvent(new Event('change',{bubbles:true}));
  check(fills()['서울/중구']==='#123456','label toggle repainted manual correction');
  const savedLife=JSON.stringify(fills());
  setStyle('dust');await pause(100);check(!S.labels.some(x=>x.data==='life'),'life labels leaked');
  for(const [selector,field,value,reset] of [['#dustCond [data-v="DAILY"]','cond','DAILY','#dustCond [data-v="HOUR"]'],['#dustItem [data-v="pm25"]','item','pm25','#dustItem [data-v="pm10"]']]){
    delay=120;const firstDust=fetchDust();await pause(35);q(selector).click();await firstDust;delay=0;
    check(!dataInfo('dust')&&dataPick.dust[field]===value,'first dust load overwrote changed '+field);
    q(reset).click();
  }
  const dustAsk0=asked.length;
  check(await fetchDust()===true,'dust load failed: '+q('#dustResult').textContent);
  check(Object.keys(fills()).length===230,'dust count');
  check(asked.slice(dustAsk0).every(a=>a[2]==='DAILY'&&a[3]==='1000'),'dust must ask DAILY with numOfRows 1000: '+JSON.stringify(asked.slice(dustAsk0)));
  check(/빈 값을 같은 시군구 값으로 채운 곳 1곳: 강원 양양군\(9일 23시 값\)/.test(q('#dustResult').textContent),'filled district not reported: '+q('#dustResult').textContent);
  check(dataInfo('dust').dataTime==='2026-10-09 24:00','dust base time');
  // 1시간 ↔ 24시간 평균 — 다시 받지 않는다
  const condCalls=requests.length;
  q('#dustCond [data-v="DAILY"]').click();
  check(dataInfo('dust').cond==='DAILY'&&requests.length===condCalls,'24h average switch fetched again');
  check(/24시간 평균/.test(q('#dustResult').textContent)&&Object.keys(fills()).length===230,'24h average paint: '+q('#dustResult').textContent);
  q('#dustCond [data-v="HOUR"]').click();check(dataInfo('dust').cond==='HOUR','back to hour');
  // 한 시도가 계속 게이트웨이 시간 초과 → 나머지는 칠하고, 그 시도만 다시
  setKey();gwSido='제주';
  check(await fetchDust()===true,'one province failure must not block: '+q('#dustResult').textContent);
  check(dataInfo('dust').noSido.join()==='제주'&&q('#dustResult').dataset.tone==='warn','failed province not reported');
  check(asked.filter(a=>a[1]==='제주').length>=4,'failed province not retried');
  const missBtn=q('#dustResult [data-act="miss"]');check(missBtn,'miss retry button');
  gwSido='';const missAsk=asked.length;missBtn.click();await pause(400);
  for(let i=0;i<30&&dataInfo('dust').noSido.length;i++)await pause(100);
  check(!dataInfo('dust').noSido.length&&asked.slice(missAsk).every(a=>a[1]==='제주')&&asked.length-missAsk===1,'miss retry should ask only Jeju once: '+JSON.stringify(asked.slice(missAsk)));
  check(Object.keys(fills()).length===230,'after miss retry');
  const dustCalls=requests.length;
  q('#dustItem [data-v="pm25"]').click();
  check(dataInfo('dust').item==='pm25'&&requests.length===dustCalls,'dust item switch');
  check(Object.keys(fills()).length===213,'missing pm25 must stay blank');
  check(q('#dustResult').dataset.tone==='warn','missing values not reported');
  undo();check(dataInfo('dust').item==='pm10','undo failed');
  const before=JSON.stringify(fills());
  for(const err of ['403','format']){setKey();failure=err;check(await fetchDust()===false,'error applied');check(JSON.stringify(fills())===before,'error changed map');check(q('#dustResult').dataset.tone==='err','error card');}
  failure='';setKey();delay=120;
  const pending=fetchDust();await pause(35);setStyle('life');setStyle('dust');
  await pending;delay=0;check(JSON.stringify(fills())===before,'stale response overwrote map');
  setKey();missing=true;check(await fetchDust()===false,'missing load result');check(JSON.stringify(fills())===before,'no data changed map');missing=false;
  q('#dataKeyIn').value='';q('#dataKeyIn').dispatchEvent(new Event('input',{bubbles:true}));const keyCalls=requests.length;
  check(await fetchDust()===false&&requests.length===keyCalls,'missing key sent request');apiPop(false);setKey();
  setStyle('dustFcst');delay=120;const firstForecast=fetchDustFcst();await pause(35);q('#dfcCode [data-v="PM25"]').click();await firstForecast;delay=0;
  check(!dataInfo('dustFcst')&&dataPick.dustFcst.code==='PM25','first forecast overwrote changed kind');
  q('#dfcCode [data-v="PM10"]').click();check(await fetchDustFcst()===true,'forecast load failed: '+q('#dfcResult').textContent);
  check(Object.keys(fills()).length===19,'forecast count');
  check(dataInfo('dustFcst').yday===true,'today without issues must merge yesterday');
  check(/어제 발표/.test(q('#dfcResult').textContent),'yesterday note missing');
  check(asked.filter(a=>a[0]==='getMinuDustFrcstDspth').every(a=>!a[4]),'InformCode must not be sent');
  const kindCalls=requests.length;
  q('#dfcCode [data-v="PM25"]').click();await pause(200);
  check(requests.length===kindCalls,'kind switch fetched again (date cache)');
  q('#dfcCode [data-v="PM10"]').click();await pause(200);
  check(requests.length===kindCalls&&dataInfo('dustFcst').code==='PM10'&&Object.keys(fills()).length===19,'kind switch back');
  // 오늘 05시 발표가 나온 뒤(✓ 10-10 05:22 실측 — PM10·PM25·O3 × 오늘·내일 6줄)엔 오늘 조회 하나로 칠한다 — 어제 조회를 보태지 않는다
  // (어제 23시 발표의 예보일도 어제·오늘·내일뿐이라 보탤 날이 없다 ✓ 10-10 실측)
  { const ymd=(dd)=>dataKstNow(Date.now()+dd*864e5).ymd, T=ymd(0), all=DUST_REGIONS.map((r,i)=>`${{강원영서:'영서',강원영동:'영동'}[r]||r} : ${['좋음','보통','나쁨'][i%3]}`).join(',');
    const row=(iss,day)=>({informCode:'PM10',dataTime:iss,informData:day,informGrade:all,informOverall:'시험'});
    fcByDate={[T]:[row(T+' 05시 발표',ymd(0)),row(T+' 05시 발표',ymd(1))]};
    dataCache.clear();const n0=asked.length;
    check(await fetchDustFcst()===true,'forecast with today 05 issue failed: '+q('#dfcResult').textContent);
    const fi=dataInfo('dustFcst');
    check(asked.slice(n0).map(a=>a[1]).join()===T,'today issue present: only today asked: '+JSON.stringify(asked.slice(n0)));
    check(dfcDays(fi,fi.issue).join()===[ymd(0),ymd(1)].join()&&fi.day===T&&fi.yday===false,'today 05 issue days');
    check(!/어제 발표를 썼어요/.test(q('#dfcResult').textContent)&&Object.keys(fills()).length===19,'today issue card');
    fcByDate=null;dataCache.clear();check(await fetchDustFcst()===true,'forecast restore');}
  const fcCalls=requests.length;
  const day=q('#dfcDay');day.value=[...day.options].map(x=>x.value).find(x=>x!==dataInfo('dustFcst').day);day.dispatchEvent(new Event('change',{bubbles:true}));
  check(requests.length===fcCalls,'day fetched again');
  q('#dfcLabels').checked=true;q('#dfcLabels').dispatchEvent(new Event('change',{bubbles:true}));
  check(S.labels.filter(x=>x.data==='dustFcst').length===19,'forecast labels');
  saveWork();const work=JSON.parse(localStorage.getItem('wcg_work'));
  check(work.dataByStyle.life.vals&&work.dataByStyle.dust.vals&&work.dataByStyle.dustFcst.fc,'autosave missing data');
  check(!JSON.stringify(work).includes('fixture-only-not-a-real-key'),'key leaked into project');
  const project=JSON.parse(JSON.stringify(stateForSave()));loadProjectData(project,null);await pause(100);
  check(q('#dfcDay').value===dataInfo('dustFcst').day&&S.labels.some(x=>x.data==='dustFcst'),'project restore');
  const fcLabelIds=S.labels.filter(x=>x.data==='dustFcst').map(x=>x.id);
  setStyle('life');check(JSON.stringify(fills())===savedLife,'separate map fills not retained');
  check(fcLabelIds.every(id=>!q(`[data-kind="label"][data-id="${id}"]`)),'previous map label DOM leaked');
  // Three map types, editable named AE paint layers and PNGs (all external AE calls intercepted).
  const output={};
  for(const st of ['life','dust','dustFcst']){
    setStyle(st);await pause(80);
    const blobs=await exportBlobs('fills');check(blobs.length&&blobs[0].blob.size>1000,st+' empty image');
    const n=captured.length;await sendToAE();check(captured.length===n+1,st+' no AE spec');
    const names=captured[n].layers.map(l=>l.name);
    check(names.some(n=>/^색칠_(낮음|보통|높음|매우높음|위험|좋음|나쁨|매우나쁨)$/.test(n)),st+' missing stage layer name');
    output[st]={png:true,namedLayers:true,insets:!!q('#gInsets .zone')};
  }
  // Snow: actual bulletin path, mountain districts and title/unit.
  const w=JSON.parse(JSON.stringify(stateForSave()));w.style='sgg';w.texts=[{...w.texts[0],txt:'예상 강수량'},{...w.texts[1],txt:'단위 : mm'}];loadProjectData(w,null);
  applyBulletin('* 예상 적설(10일)\n- 강원북부산지: 5~10cm\n- 강원북부동해안: 1~3cm');
  check(fills()['강원/인제군']&&fills()['강원/속초시'],'snow mountain districts missing');
  check(S.texts.some(t=>t.txt==='예상 적설량')&&S.texts.some(t=>t.txt==='단위 : cm'),'snow title/unit');
  check(S.mtns.length>0,'snow mountain marker missing');
  applyBulletin('* 예상 강수량(10일)\n- 서울.경기: 5~10mm');check(S.texts.some(t=>t.txt==='예상 강수량'),'rain title restore');
  setStyle('life');revealSec('life');await pause(2400);
  return {ok:true,requests:requests.length,lifeRegions:230,dustMissingValues:17,forecastRegions:19,output,snow:true};
}finally{window.fetch=originalFetch;}
