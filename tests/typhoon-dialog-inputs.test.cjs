const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const appSource=require('../tools/app-source.cjs');
const source=appSource(path.join(__dirname,'..','index.html'));
test('normal and comparison animation preview buttons include the same accessible play icon',()=>{
  for(const id of ['typPlay','tycPlay']) {
    const button=source.match(new RegExp('<button id="'+id+'"[^>]*>[\\s\\S]*?</button>'))[0];
    assert.match(button,/class="animPreviewBtn"/);
    assert.match(button,/<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.match(button,/<span>애니메이션 확인<\/span>/);
  }
});
test('typhoon load UI groups sources; detail settings stay outside the dialog and manual TD is folded',()=>{
  const start=source.indexOf('<div id="typLoadOv"'),end=source.indexOf('id="typPlay"',start);
  const modal=source.slice(start,end);
  for(const id of ['typHistoryMonth','typFetchJma','typJtwcDl']) assert.ok(modal.includes('id="'+id+'"'),id);
  for(const id of ['typWhichSel','typName','typIssueSel']) assert.ok(!modal.includes('id="'+id+'"'),id);
  assert.doesNotMatch(modal,/불러온 태풍 설정|typPastDate/);
  assert.match(modal,/typLoadPane/);
  const manual=source.slice(source.indexOf('id="typManual">'),source.indexOf('<div class="subhead">지난 구간'));
  assert.match(manual,/id="typAddTD"/);
  assert.match(source,/watch.observe\(document.body, \{ childList: true, subtree: true \}\)/);
});
test('all date types and native select menus use shared UI; year/month offers explicit confirmation',()=>{
  assert.match(source,/each\('input\[type=datetime-local\]', dpDateTimeAttach\)/);
  assert.match(source,/if \(input.min && value < input.min\) value = input.min/);
  assert.match(source,/if \(input.max && value > input.max\) value = input.max/);
  assert.match(source,/dpWheelDone[^\n]*확인 · 일자 선택/);
  assert.match(source,/q\('\.dpWheelDone'\).addEventListener\('click', confirmWheel\)/);
  assert.match(source,/\.ddSrc \{ display: none !important; \}/);   // 시스템 드롭다운은 숨기고 공용 드롭다운(js/dropdown.js)
  assert.doesNotMatch(source,/appearance: base-select/);
  assert.match(source,/\nddAttachAll\(\);/);
  assert.match(source,/lateFields.observe\(document.body, \{ childList: true, subtree: true \}\)/);
});
test('desktop: split dialog, embedded picker, datetime synchronization, all dropdowns, wheel confirmation',{skip:process.env.WCG_BOOT_CHECK!=='1'},()=>{
  const raw=execFileSync(process.execPath,[path.join(__dirname,'../desktop/test/boot-check.cjs'),path.join(__dirname,'..'),'--wait=9000','--size=1500x900','--eval='+path.join(__dirname,'typhoon-dialog-inputs.boot-eval.js')],{encoding:'utf8',timeout:180000});
  const out=JSON.parse(raw.slice(raw.indexOf('{')));assert.equal(out.ok,true,JSON.stringify(out.errors));assert.equal(out.evalResult.ok,true,JSON.stringify(out.evalResult));
});
