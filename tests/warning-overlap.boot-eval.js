// Runs only in boot-check's isolated temporary profile; never against an open user project.
const wait = ms => new Promise(r=>setTimeout(r,ms));
const q = s => document.querySelector(s);
const check = (v,m) => { if(!v) throw new Error(m); };
for(let i=0;i<12;i++) { q('#tourClose')?.click();q('#tossOv .tossX')?.click();await wait(120); }
if(q('#startOverlay.on')) q('#startSetup').click();else q('#cgSetupBtn').click();
await wait(350);q('#resBtns [data-res="1920x1080"]').click();q('#styleBtns [data-style="warnsea"]').click();q('#cgsDone').click();await wait(1000);
const land='L1030100', sea=MAP.sea[0].id;
const lines=[];
for(const id of [land,sea]) for(const kind of ['폭염','열대야']) lines.push(['L1000000','충청',id,'대전','202610090600','202610090600',kind,'주의보','발표'].join(', ')+', , =');
applyWrn('#START7777\n'+lines.join('\n')+'\n',null,'paste');
const colors=wrnOverlapPlan()[land];check(colors?.length===2,'two warning colors missing');
check(wrnOverlapPlan()[sea]?.length===2,'sea overlap missing');
const z=q('#gMain .zone[data-id="'+land+'"]');
check(z?.getAttribute('fill').startsWith('url(#wrnStripe-'),'land pattern missing');
check(q('#seaT .sea[data-id="'+sea+'"]').getAttribute('fill').startsWith('url(#wrnStripe-'),'sea pattern missing');
q('#wrnOverlap').click();check(z.getAttribute('fill')===fills()[land],'off should be solid');
undo();check(q('#wrnOverlap').checked && z.getAttribute('fill').startsWith('url('),'undo overlap');
const plan=autoTrackPlan();check(colors.every(c=>plan.tracks.some(t=>t.kind==='fill'&&t.key===c)),'secondary color needs a video track');
anim().tracks=plan.tracks;renderAnimFrame(0);
const pat=()=>svg.querySelector(z.getAttribute('fill').slice(4,-1));
check([...pat().children].every(n=>n.getAttribute('fill').toUpperCase()===S.base.toUpperCase()),'start frame must use base for every stripe');
renderAnimFrame(20);check(colors.every(c=>[...pat().children].some(n=>n.getAttribute('fill').toUpperCase()===c)),'end frame must show both colors');
animStop();renderAll();
const counts=async blob=>{
 const im=await createImageBitmap(blob),cv=document.createElement('canvas');cv.width=im.width;cv.height=im.height;
 const ctx=cv.getContext('2d');ctx.drawImage(im,0,0);im.close();const d=ctx.getImageData(0,0,cv.width,cv.height).data;
 return colors.map(c=>{const rgb=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));let n=0;for(let i=0;i<d.length;i+=4) if(d[i+3]>240&&rgb.every((v,j)=>Math.abs(d[i+j]-v)<2))n++;return n;});
};
const png=await counts(await exportBake('fills'));check(png.every(n=>n>100),'PNG missing a stripe color: '+png);
const defs=aeWarningFillDefs();const ae=[];
for(const def of defs){const v=await counts(await aeWarningFillBlob(def));const own=colors.indexOf(def.col.toUpperCase());check(v[own]>100 && v.every((n,i)=>i===own||n===0),'AE warning stripe isolation: '+v);ae.push(v);}
q('#wrnOverlap').click();const solid=await counts(await exportBake('fills'));check(solid.filter(n=>n>100).length===1,'off PNG must be solid');
check(!q('#tlReveal option[value="blinds"]'),'old video effect still offered');
q('#wrnOverlap').click();
check(stateForSave().wrnOverlap===1,'overlap preference must survive project save');
const before=svg.querySelectorAll('[data-wrnstripe]').length;
for(let i=0;i<120;i++) wrnStripeFill(svg,colors,1+i/100);
check(svg.querySelectorAll('[data-wrnstripe]').length===before,'zoom must reuse patterns instead of leaking one per frame');
const mainPat=svg.querySelector(wrnStripeFill(svg,colors,1).slice(4,-1));
const insetPat=svg.querySelector(wrnStripeFill(svg,colors,2,null,null,'testInset').slice(4,-1));
check(+mainPat.getAttribute('height')===2*+insetPat.getAttribute('height'),'main and inset scales must not overwrite each other');
renderAll();
return {ok:true,png,ae,solid};
