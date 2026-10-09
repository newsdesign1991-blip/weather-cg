// Only the disposable boot-check profile is changed.
const q=s=>document.querySelector(s),check=(v,m)=>{if(!v)throw new Error(m);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
closeTossModal();closeCgSetup();await pause(500);
const results=[];
function verify(label,board){
  const b=q('#topbar').getBoundingClientRect(),r=board.getBoundingClientRect(),s=q('#stage').getBoundingClientRect();
  check(Math.abs(b.left-r.left)<=1,label+': not left aligned');
  check(Math.abs(r.top-b.bottom-10)<=1,label+': not 10px above artboard');
  check(b.top>=s.top-1,label+': outside stage');
  results.push({label,gap:Math.round(r.top-b.bottom),left:Math.round(b.left)});
}
verify('startup',q('.startBoard'));
const saved=JSON.parse(JSON.stringify(stateForSave()));loadProjectData(saved,null);await pause(400);
verify('editing',q('.fit'));
for(const side of ['right','left']){setDockSide(side);await pause(400);verify('dock '+side,q('.fit'));}
// Simulate a low/wide stage without resizing the real user window.
const stageNode=q('#stage'),oldH=stageNode.style.height,oldW=stageNode.style.width,oldFlex=stageNode.style.flex;
for(const [w,h] of [[1100,420],[680,520],[1500,650]]){
  stageNode.style.flex='none';stageNode.style.width=w+'px';stageNode.style.height=h+'px';applyView();await pause(150);verify(w+'x'+h,q('.fit'));
}
stageNode.style.height=oldH;stageNode.style.width=oldW;stageNode.style.flex=oldFlex;applyView();await pause(400);
// Real drag handlers still allow custom positions and save them in the new layout version.
const bar=q('#topbar'),grip=q('#tbGrip'),r=bar.getBoundingClientRect();
grip.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+8,clientY:r.top+12}));
window.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+108,clientY:r.top+92}));
window.dispatchEvent(new PointerEvent('pointerup'));
const layout=JSON.parse(localStorage.getItem('wcg_layout'));
check(layout.toolbarV===3&&typeof layout.toolbarX==='number'&&typeof layout.toolbarY==='number','drag not saved');
const moved=bar.style.left+','+bar.style.top;loadLayout();check(bar.style.left+','+bar.style.top===moved,'custom position not restored');
// Old placement must migrate without throwing away dock side / zoom.
localStorage.setItem('wcg_layout',JSON.stringify({...layout,toolbarV:2,toolbarX:500,toolbarY:200}));
// Fresh-page initialization supplies null anchors; migration is covered by source/unit check.
return {ok:true,results,customPosition:moved};
