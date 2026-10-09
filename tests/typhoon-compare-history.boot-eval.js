// Only run with boot-check's disposable Electron profile.
const q=s=>document.querySelector(s),check=(v,m)=>{if(!v)throw new Error(m);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const until=async f=>{for(let i=0;i<100;i++){if(f())return;await pause(50);}throw new Error('UI timeout');};
closeTossModal();closeCgSetup();
const saved=JSON.parse(JSON.stringify(stateForSave()));
saved.style=Object.keys(MAP.styles).find(k=>MAP.styles[k].compare);
const pts=[{lon:130,lat:20,ws:30,tmef:'202407200600',fcst:false},{lon:133,lat:25,ws:30,tmef:'202407210600',fcst:false}];
saved.typhoon={...typhoonStyleDefaults(),name:'검증',issues:[{label:'검증',points:pts}],sel:0,compare:[]};
loadProjectData(saved,null);await pause(500);q('#tycLoadOpen').click();await pause(400);
check(q('#typLoadOv.on')&&q('#typLoadResults').hidden,'comparison dialog mode');
check(!q('#tycFetch').hidden&&q('#typFetch').hidden,'source buttons');
let pending=chooseTyphoonFromList([{tno:'3',year:'2024',kmaName:'개미',name:'제3호 태풍 개미',points:pts},{tno:'4',year:'2024',kmaName:'프라피룬',name:'제4호 태풍 프라피룬',points:pts}],'기상청',()=>true);
const panes=q('.typLoadBody').children,a=panes[0].getBoundingClientRect(),b=panes[1].getBoundingClientRect();
check(b.left>=a.right&&Math.abs(a.top-b.top)<2,'two panes');
let rows=q('#typLoadList .jtwcList').children;rows[0].click();rows[1].click();
check(rows[0].getAttribute('aria-pressed')==='true','selection feedback');
check(S.typhoon.compare.length===0,'selection mutated work before adding');
q('#typLoadList .tossFoot .pri').click();const chosen=await pending;
check(chosen.length===2,'multiple selection');
const undoBefore=undoStack.length;
applyPickedTyphoon([{tno:'3',year:'2024',kmaName:'개미',name:'제3호 태풍 개미',points:pts},{tno:'4',year:'2024',kmaName:'프라피룬',name:'제4호 태풍 프라피룬',points:pts}],chosen,'apihub');
check(undoStack.length===undoBefore+1&&S.typhoon.compare.length===2,'batch one undo');
check(S.typhoon.compare.every(c=>c.showName===1),'names hidden by default');
check(q('#typLoadBasket').children.length===3,'basket rows');
q('.typBasketRow input').click();check(S.typhoon.compare[0].show===0,'hide failed');
q('.typBasketRow button').click();check(S.typhoon.compare.length===1,'remove failed');undo();check(S.typhoon.compare.length===2,'remove undo failed');
const nativeFetch=window.fetch;
const catalog='2024,3,2,4,202407200600,202407270600,개미,GAEMI,설명,=\n2024,4,2,4,202407210300,202407231200,프라피룬,PRAPIROON,설명,=\n2024,2,2,4,202406010000,202407030000,이전달,PREVIOUS,설명,=';
const data=n=>[0,1].map(i=>[0,2024,n,i+1,0,'202407200600',i?'202407210600':'202407200600',20+i*3,130+i*2,'N',10,980,30,200,80,0,'-',0,'바다','-',0,'='].join(',')).join('\n');
window.fetch=async (url,...rest)=>{
  const text=String(url);
  if(text.includes('/api/kma?')){
    const upstream=new URL(new URL(text).searchParams.get('u'));
    if(upstream.pathname.endsWith('typ_lst.php'))return new Response(catalog);
    if(upstream.pathname.endsWith('typ_data.php'))return new Response(data(upstream.searchParams.get('typ')));
  }
  return nativeFetch(url,...rest);
};
try{
  q('#typHistoryMonth').value='2024-07';const history=fetchTyphoonHistory();
  await until(()=>q('[data-history-search]'));
  check(q('#typLoadList .jtwcList').children.length===2,'storm born in another month included');
  q('#typHistorySearch').value='gaemi';q('#typHistorySearch').dispatchEvent(new Event('input'));
  rows=q('#typLoadList .jtwcList').children;check(!rows[0].hidden&&rows[1].hidden,'English search');rows[0].click();
  q('#typHistorySearch').value='4';q('#typHistorySearch').dispatchEvent(new Event('input'));
  check(rows[0].hidden&&!rows[1].hidden,'number search');
  q('#typHistorySearch').value='프라피룬';q('#typHistorySearch').dispatchEvent(new Event('input'));check(rows[0].hidden&&!rows[1].hidden,'Korean search');rows[1].click();
  q('#typLoadList .tossFoot .pri').click();await history;
  check(S.typhoon.compare.length===4,'historical tracks replaced current tracks');
  check(S.typhoon.whichList.every(w=>w.archive&&w.kmaName&&w.points.every(p=>!p.fcst)),'historical metadata or forecast leakage');
  const beforeEmpty=JSON.stringify(stateForSave());q('#typHistoryMonth').value='2024-02';await fetchTyphoonHistory();
  check(q('#typLoadList .jtwcNote').textContent.includes('발생한 태풍이 없어요'),'empty month not explained');
  check(JSON.stringify(stateForSave())===beforeEmpty,'empty month changed work');
  const copy=JSON.parse(JSON.stringify(stateForSave()));loadProjectData(copy,null);await pause(300);
  check(S.typhoon.name.includes('프라피룬')&&S.typhoon.compare.length===4,'names/basket lost on save load');
  openTyphoonLoad();q('#typHistorySearch').value='';
  pending=chooseTyphoonFromList([{tno:'5',name:'취소',points:pts}],'기상청',()=>true);q('#typLoadDone').click();check(await pending===-1,'close did not cancel');
  openTyphoonLoad();await pause(400);
  return {ok:true,comparisonCount:S.typhoon.compare.length,names:S.typhoon.compare.map(c=>c.name),split:true,search:true,batchUndo:true};
}finally{window.fetch=nativeFetch;}
