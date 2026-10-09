// boot-check temporary profile only; no open user project is modified.
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const q=s=>document.querySelector(s);
const check=(v,m)=>{if(!v)throw new Error(m);};
for(let i=0;i<12;i++){q('#tourClose')?.click();q('#tossOv .tossX')?.click();await pause(100);}
if(q('#startOverlay.on'))q('#startSetup').click();else q('#cgSetupBtn').click();
await pause(300);q('#resBtns [data-res="1920x1080"]').click();q('#styleBtns [data-style="warn"]').click();q('#cgsDone').click();await pause(800);
const p=q('#panel'),app=q('.app'),ft=p.querySelector('.panelFooter');
const oldZoom=p.style.getPropertyValue('--pz'),oldSide=app.classList.contains('dockR');
// Ensure a real overflow even when all sections are collapsed in a very tall viewport.
const extra=document.createElement('div');extra.style.cssText='height:1500px;flex:0 0 1500px';ft.before(extra);
let cases=0;
for(const theme of ['light','dark'])for(const right of [false,true])for(const zoom of [.85,1,1.3,2.2]){
 document.documentElement.dataset.theme=theme;app.classList.toggle('dockR',right);p.style.setProperty('--pz',zoom);await pause(40);
 const s=getComputedStyle(p),thumb=getComputedStyle(p,'::-webkit-scrollbar-thumb'),track=getComputedStyle(p,'::-webkit-scrollbar-track');
 check(s.backgroundColor!=='rgba(0, 0, 0, 0)','transparent card under scrollbar');
 check(thumb.backgroundClip==='padding-box'&&parseFloat(thumb.borderRightWidth)>2,'thumb missing inner spacing: '+JSON.stringify({zoom,clip:thumb.backgroundClip,border:thumb.borderRightWidth}));
 check(parseFloat(track.marginTop)>=20&&parseFloat(track.marginBottom)>=20,'scrollbar reaches rounded corners');
 check(p.scrollWidth<=p.clientWidth+1,'horizontal overflow');
 p.scrollTo({top:p.scrollHeight,behavior:'instant'});await pause(20);check(p.scrollTop>0,'scrolling broken');
 const pr=p.getBoundingClientRect(),fr=ft.getBoundingClientRect();
 check(fr.left>=pr.left-1&&fr.right<=pr.right+1&&fr.bottom<=pr.bottom+1,'footer escapes card');cases++;
}
extra.remove();app.classList.toggle('dockR',oldSide);p.style.setProperty('--pz',oldZoom);document.documentElement.dataset.theme='light';
p.scrollTo({top:0,behavior:'instant'});revealSec('wrn');await pause(500);
// Show the same thumb color as hover for the optional diagnostic screenshot (geometry unchanged).
const visible=document.createElement('style');visible.textContent='#panel::-webkit-scrollbar-thumb{background-color:var(--scrollbar)}';document.head.append(visible);
await pause(200);
return {ok:true,cases};
