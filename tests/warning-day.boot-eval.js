// Disposable profile. Only network responses are mocked; real UI and painting run unchanged.
const q=s=>document.querySelector(s), check=(v,m)=>{if(!v)throw new Error(m);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const until=async f=>{for(let i=0;i<100;i++){if(f())return;await pause(30);}throw new Error('wait timeout');};
const originalFetch=window.fetch, requests=[];
let broken=false;
window.fetch=async function(url,...args){
  const s=String(url);
  if(s.startsWith(WNS_HELPER+'/ping')) return new Response(JSON.stringify({ok:true,ver:20261009}));
  if(s.startsWith(WNS_HELPER+'/api/kma?')) {
    const u=new URL(new URL(s).searchParams.get('u')); requests.push(u);
    if(broken) return new Response('unavailable',{status:503});
    if(u.pathname.endsWith('wrn_met_data.php')) {
      const day=u.searchParams.get('tmfc1').slice(0,8);
      const times=day==='20260804'?[]:['1000','1730','1000'];
      return new Response('#START7777\n# TM_FC, TM_EF, TM_IN, STN, REG_ID, WRN, LVL, CMD, GRD, CNT, RPT\n'+times.map(t=>`${day+t}, ${day}1800, ${day}0900, 108, L1010200, R, 2, 1, 00, 4, 101, =`).join('\n'));
    }
    const tm=u.searchParams.get('tm')||currentTm();
    return new Response('#START7777\n# REG_UP REG_ID TM_FC TM_EF WRN LVL CMD\nL1000000, 서울, L1010200, 서울동북권, 202608010900, 202608010900, 호우, 경보, 발표, =\n#7777END');
  }
  return originalFetch.call(this,url,...args);
};
try {
  q('#tossOv .tossX')?.click();
  const fixture=JSON.parse(JSON.stringify(stateForSave()));fixture.style='warn';
  loadProjectData(fixture,null); await pause(400); revealSec('wrn');
  q('#wrnDate').value='2026-08-03'; const before=JSON.stringify(fills());
  q('#wrnWhenPast').click(); await until(()=>q('#wrnBulletinSel').options.length===4);
  check(!q('#wrnTime'),'old manual time field remains');
  check(JSON.stringify(fills())===before&&!wrnWhen,'day lookup changed map');
  const sel=q('#wrnBulletinSel');
  check(sel.options[1].value==='202608031730'&&sel.options[2].value==='202608031000','actual times order/dedup');
  sel._dd.field.click();await pause(100);
  q('.ddPop:not(.closing) .ddOpt[data-k="2"]').click();
  await until(()=>wrnWhen==='202608031000');
  check(requests.at(-1).searchParams.get('fe')==='e','not effective snapshot');
  check(fills().L1010200,'carried warning was not painted');
  check(sel._dd.field.textContent.includes('10:00'),'selected time field stale');
  const applied=JSON.stringify(fills());
  q('#wrnDate').value='2026-08-04'; q('#wrnDate').dispatchEvent(new Event('change',{bubbles:true}));
  await until(()=>sel.options.length===2&&!sel.disabled);
  check(JSON.stringify(fills())===applied,'no announcements erased prior map');
  check(sel.options[1].textContent.includes('발표와 별도'),'snapshot mislabeled as announcement');
  broken=true; sel.value='202608042359'; sel.dispatchEvent(new Event('change',{bubbles:true}));
  await until(()=>q('#wrnResult').dataset.tone==='err');
  check(wrnWhen==='202608031000'&&JSON.stringify(fills())===applied,'failed selection changed map');
  broken=false;
  q('#wrnWhenNow').click(); await until(()=>wrnWhen===''&&q('#wrnResult').dataset.tone==='ok');
  check(q('#wrnPastRow').style.display==='none','now tab failed');
  return {ok:true,requests:requests.length,carriedWarning:true};
} finally { window.fetch=originalFetch; }
