// Isolated test profile. No changes to the user's saved state.
const q=s=>document.querySelector(s),check=(v,m)=>{if(!v)throw new Error(m);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
closeTossModal();await pause(100);
check(q('#cgSetupOv.on'),'startup scene setup missing');
const strip=q('#modalWindowDrag');
check(!strip.hidden&&getComputedStyle(strip).getPropertyValue('-webkit-app-region')==='drag','modal drag region missing');
const r=strip.getBoundingClientRect();
check(r.top===0&&r.height===titleBarH()&&r.width>innerWidth/2&&r.right<=innerWidth,'drag region outside titlebar');
check(document.elementFromPoint(r.left+25,20)===strip,'modal backdrop covers drag region');
const done=q('#cgsX').getBoundingClientRect();
check(document.elementFromPoint(done.left+done.width/2,done.top+done.height/2).closest('#cgsX'),'drag region blocks dialog button');
const run=startupUiEnter();check(run&&run.animations.length>=6,'no entrance animations');
const delays=new Set();
for(const animation of run.animations){
  const timing=animation.effect.getTiming(),frames=animation.effect.getKeyframes();
  delays.add(timing.delay);check(timing.delay+timing.duration<=850,'intro too long');
  check(frames[0].opacity==='0'||frames[0].opacity===0,'intro has no fade');
  check(frames[0].filter==='blur(7px)','intro has no blur');
  check(!animation.effect.target.closest('#cg'),'intro animates output graphics');
}
check(delays.size>=5,'intro not staggered');
await run.finished;
check(run.animations.every(a=>a.playState==='idle'),'finished animations were not cleaned up');
const canceled=startupUiEnter();window.dispatchEvent(new Event('pointerdown'));await canceled.finished;
check(canceled.animations.every(a=>a.playState==='idle'),'input does not cancel effects');
q('#cgsX').click();await pause(450);
check(strip.hidden,'drag region blocks toolbar after popup closes');
const modal=tossModal({title:'이동 확인',bodyHTML:'<button id="dragTestBtn">입력 확인</button>'});await pause(80);
check(!strip.hidden,'dynamic modal lacks drag region');
let clicked=false;q('#dragTestBtn').onclick=()=>{clicked=true;};q('#dragTestBtn').click();check(clicked,'modal buttons blocked');
modal.close();await pause(450);check(strip.hidden,'dynamic modal left drag region active');
return {ok:true,animations:run.animations.length,delaySteps:delays.size,modalDrag:true};
