// Runs only in boot-check's disposable profile, never the user's open project.
const q=s=>document.querySelector(s),check=(v,m)=>{if(!v)throw new Error(m);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
await document.fonts.ready;
const faces=await document.fonts.load('650 14px "Wanted Sans UI"','장면 설정 Weather CG 0123');
check(faces.length===1&&faces[0].status==='loaded','local Wanted Sans font not loaded');
check(faces[0].weight==='400 1000','variable weight range missing');
const fontNodes=['body','#cgSetupBtn','#aeSend','#regionQuery','#cgsDone','.dpField'];
for(const theme of ['light','dark']) {
  document.documentElement.dataset.theme=theme;
  for(const selector of fontNodes) {
    const node=q(selector);check(node,'missing UI '+selector);
    check(getComputedStyle(node).fontFamily.startsWith('"Wanted Sans UI"'),'wrong UI font '+selector);
  }
}
check(q('#cgSetupOv.on'),'startup scene popup missing');
q('#tossOv .tossX')?.click();await pause(400);
const saved=JSON.parse(JSON.stringify(stateForSave()));saved.style='sgg';
saved.texts=[{id:90001,x:800,y:250,txt:'CG 출력 글꼴 유지',size:48,w:700,col:'#fff',track:0,align:'middle'}];
loadProjectData(saved,null);await pause(500);
const cg=q('#L_title text');check(cg&&getComputedStyle(cg).fontFamily.startsWith('"SUITE CG"'),'CG font changed');
check(!Array.from(document.querySelectorAll('link[rel=stylesheet],link[as=font]')).some(n=>/https?:/.test(n.getAttribute('href'))),'remote UI font dependency');
const buttons=Array.from(q('#exportGroup').children).filter(n=>getComputedStyle(n).display!=='none');
for(const button of buttons)check(button.scrollWidth<=button.clientWidth+1,'toolbar text overflow '+button.id);
return {ok:true,fontLoaded:faces[0].family,weights:faces[0].weight,themes:2,cgFont:getComputedStyle(cg).fontFamily};
