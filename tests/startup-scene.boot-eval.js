// Isolated boot-check profile only. Do not click the scene button: it must already be open.
const q=s=>document.querySelector(s),pause=ms=>new Promise(r=>setTimeout(r,ms));
const check=(v,m)=>{if(!v)throw new Error(m);};
check(q('#startOverlay.on'),'missing start screen');
check(q('#cgSetupOv.on'),'scene setup was not opened automatically');
check(!q('#tourWrap.on'),'automatic tour covers scene setup');
check(q('#cgsDone').disabled,'initial scene must still require both choices');
check(!q('#resBtns .choicePending')&&!q('#styleBtns .choicePending'),'no scene should be preselected');
q('#tossOv .tossX')?.click();await pause(400);
// The saved-file, recent-file and resume paths share loadProjectData.
const saved=JSON.parse(JSON.stringify(stateForSave()));saved.res='1920x1080-vf';saved.style='warn';saved.map.x=246;
loadProjectData(saved,null);await pause(1000);
check(!q('#cgSetupOv.on')&&!q('#startOverlay.on'),'loaded project left setup open');
check(S.res==='1920x1080-vf'&&S.style==='warn'&&S.map.x===246,'saved scene was changed by startup setup');
check(!workDirty(),'loading a saved project should be clean');
return {ok:true,automatic:true,savedScenePreserved:true};
