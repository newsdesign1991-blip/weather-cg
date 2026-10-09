// Isolated boot-check profile: manual bulletin controls keep their handlers and values.
const q=s=>document.querySelector(s), check=(v,m)=>{if(!v)throw new Error(m);};
closeTossModal(); closeCgSetup(); revealSec('fct');
check(q('#bulManual').classList.contains('closed'),'manual section must start collapsed');
for(const id of ['bulLoad','bulResult','bulPick','bulInfo','bulList'])check(!q('#'+id).closest('#bulManual'),id+' must stay outside manual');
for(const id of ['bulOpen','bulHelpBtn','bulPaste','bulLabels','bulSoft','bulApply'])check(q('#'+id).closest('#bulManual'),id+' must be manual');
q('#bulManualHead').click();check(q('#bulManualHead').getAttribute('aria-expanded')==='true','cannot open manual');
q('#bulPaste').value='- (수도권) 서울: 5~10mm';
q('#bulManualHead').click();check(q('#bulManual').classList.contains('closed'),'cannot close manual');
q('#bulManualHead').click();check(q('#bulPaste').value.includes('5~10mm'),'fold discarded pasted text');
check(typeof q('#bulApply').onclick==='function'&&typeof q('#bulLoad').onclick==='function','load/apply wiring lost');
q('#bulHelpBtn').click();check(q('#bulHelpPop').classList.contains('on'),'copy help not opening');
q('#bulHelpClose').click();q('#bulManualHead').click();
return {ok:true,defaultClosed:true,toggle:true,controlsPreserved:true};
