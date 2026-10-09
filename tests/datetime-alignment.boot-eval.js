// Disposable boot-check profile; saved user projects are never touched.
const q=s=>document.querySelector(s),check=(ok,msg)=>{if(!ok)throw new Error(msg);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
closeTossModal();closeCgSetup();
const saved=JSON.parse(JSON.stringify(stateForSave()));
saved.style=Object.keys(MAP.styles).find(k=>MAP.styles[k].typhoon&&!MAP.styles[k].compare);
const pts=[{lon:130,lat:20,ws:30,tmef:'202610030600',fcst:false},{lon:134,lat:27,ws:30,tmef:'202610140600',fcst:true}];
saved.typhoon={...typhoonStyleDefaults(),name:'정렬 검증',issues:[{label:'검증',points:pts}],sel:0,rangeOn:1,rangeFrom:'2026-10-03T15:00',rangeTo:'2026-10-14T15:00',compare:[]};
loadProjectData(saved,null);await pause(400);revealSec('typhoon');
const from=q('#typRangeFrom'),to=q('#typRangeTo'),group=from.closest('.fieldGroup');
check(from._dpdt&&to._dpdt,'date/time controls missing');
const oldWidth=group.style.width;const results=[];
for(const width of [220,250,320]){
  group.style.width=width+'px';await pause(100);
  const edges=[];
  for(const input of [from,to]){
    const box=input._dpdt.box,date=box.querySelector('.dpField'),time=box.querySelector('.dpTime');
    const a=date.getBoundingClientRect(),b=time.getBoundingClientRect(),c=box.getBoundingClientRect(),label=input.closest('.row').querySelector('label').getBoundingClientRect();
    check(Math.abs(a.top-b.top)<1&&Math.abs(a.height-b.height)<1,'date/time not aligned at '+width);
    check(a.right<=b.left&&b.right<=c.right+1&&a.left>=c.left-1,'date/time overflow at '+width);
    check(label.bottom<=a.top,'label overlaps date at '+width);
    const text=date.querySelector('.dpFieldTx');check(text.scrollWidth<=text.clientWidth+1,'date text clipped at '+width);
    edges.push([a.left,b.left]);
  }
  check(Math.abs(edges[0][0]-edges[1][0])<1&&Math.abs(edges[0][1]-edges[1][1])<1,'start/end columns differ');
  results.push(width);
}
group.style.width=oldWidth;
from._dpdt.time._dpt.set('18:00');check(from.value==='2026-10-03T18:00'&&S.typhoon.rangeFrom===from.value,'time editing broken');
from._dpdt.date._dp.field.click();await pause(200);check(q('.dpPop'),'calendar did not open');dpClose(false);
group.scrollIntoView({block:'center'});await pause(400);
return {ok:true,widths:results,aligned:true,timeEditing:true,calendar:true};
