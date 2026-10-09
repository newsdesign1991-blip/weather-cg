// Disposable boot-check profile: only fetch is replaced; actual UI, painting, save, undo and export run.
const q=s=>document.querySelector(s), pause=ms=>new Promise(r=>setTimeout(r,ms));
const check=(v,m)=>{if(!v)throw new Error(m);};
const originalFetch=window.fetch, requests=[], captured=[];
const fixture=async name=>JSON.parse(await (await originalFetch('tests/fixtures/datamaps/'+name)).text());
const uv=await fixture('life-uv.json'), air=await fixture('life-air.json'), forecast=await fixture('dustfcst-pm10.json');
let failure='', delay=0, missing=false;
const json=o=>new Response(JSON.stringify(o),{headers:{'Content-Type':'application/json'}});
window.fetch=async function(url,opts){
  const s=String(url);
  if(s.startsWith(WNS_HELPER+'/ping'))return json({ok:true,ff:true,ver:20261009});
  if(s.includes('/api/frame'))return json({ok:true});
  if(s.includes('/api/ae')){captured.push(JSON.parse(opts.body));return json({ok:true,ae:'test'});}
  if(s.startsWith(WNS_HELPER+'/api/kma?')){
    const u=new URL(new URL(s).searchParams.get('u'));requests.push(u.pathname); // No credentials in test output.
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
      const items=dataAreas().filter(a=>a.sido===sido).map((a,i)=>({sidoName:sido,cityName:a.zone,districtCode:a.code,dataTime:'2026-10-09 23:00',pm10Value:String([20,60,100,180][i%4]),pm25Value:i===0?'-':String([10,20,50,90][i%4])}));
      return json({response:{header:{resultCode:'00'},body:{items,totalCount:items.length}}});
    }
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
  check(await fetchDust()===true,'dust load failed: '+q('#dustResult').textContent);
  check(Object.keys(fills()).length===230,'dust count');
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
  q('#dfcCode [data-v="PM10"]').click();check(await fetchDustFcst()===true,'forecast load failed');
  check(Object.keys(fills()).length===19,'forecast count');
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
