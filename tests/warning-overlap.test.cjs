const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');
const source = appSource(path.join(__dirname, '..', 'index.html'));
const fn = (n) => source.match(new RegExp('function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];
function setup() {
  const rows = [{id:'L1',wrn:'a',lvl:'경보'}, {id:'L1',wrn:'b',lvl:'주의보'}, {id:'S1',wrn:'a',lvl:'경보'}, {id:'S1',wrn:'b',lvl:'주의보'}];
  const c = { S: {style:'warnsea',wrnOff:{},fillsByStyle:{warnsea:{L1:'#FF0000'}},seaFills:{S1:'#FF0000'},wrnActive:rows}, wrnRows:rows,
    wrnKeyOf:r=>r.wrn, wrnRank:r=>['a','b','c'].indexOf(r.wrn), wrnColorOf:k=>({a:'#FF0000',b:'#00FF00',c:'#0000FF'})[k] };
  vm.createContext(c); vm.runInContext(fn('wrnOverlapPlan'),c);
  return c;
}
test('overlap: two and three colors, land/sea, duplicate colors, priority, hidden warning', () => {
  const c=setup(), plan=()=>JSON.parse(JSON.stringify(c.wrnOverlapPlan()));
  assert.deepEqual(plan(),{L1:['#FF0000','#00FF00'],S1:['#FF0000','#00FF00']});
  c.wrnRows.push({id:'L1',wrn:'c',lvl:'경보'},c.wrnRows[0]);
  assert.deepEqual(plan().L1,['#FF0000','#00FF00','#0000FF']);
  c.S.wrnOff.b=1;
  assert.deepEqual(plan(),{L1:['#FF0000','#0000FF']});
  c.wrnRank=r=>['c','a','b'].indexOf(r.wrn); c.S.fillsByStyle.warnsea.L1='#0000FF';
  assert.deepEqual(plan().L1,['#0000FF','#FF0000']);
});
test('overlap: saved rows fallback, manual repaint/erase and disabled/non-warning mode', () => {
  const c=setup(); c.wrnRows=[];
  assert.equal(c.wrnOverlapPlan().L1.length,2);
  c.S.fillsByStyle.warnsea.L1='#123456'; assert.equal(c.wrnOverlapPlan().L1,undefined);
  delete c.S.seaFills.S1; assert.equal(Object.keys(c.wrnOverlapPlan()).length,0);
  c.S.fillsByStyle.warnsea.L1='#ff0000'; assert.equal(c.wrnOverlapPlan().L1.length,2);
  c.S.wrnOverlap=0; assert.equal(Object.keys(c.wrnOverlapPlan()).length,0);
  c.S.wrnOverlap=1;c.S.style='sigungu';assert.equal(Object.keys(c.wrnOverlapPlan()).length,0);
});
test('legacy video blinds are read as dissolve; overlap mode is saved in presets', () => {
  const c={S:{anim:{reveal:'blinds',tracks:[],dur:7}}}; vm.createContext(c);
  vm.runInContext(source.match(/const anim = \(\) => \{[\s\S]*?\n\};/)[0]+'\nthis.result=anim();',c);
  assert.equal(c.result.reveal,'dissolve'); assert.equal(c.result.dur,7);
  assert.doesNotMatch(source,/<option value="blinds">/);
  assert.doesNotMatch(source,/id="tlBlind(Size|Angle)"/);
  assert.match(source,/'wrnOverlap'/);
});
test('boot: overlap stripes survive editing, animation, PNG and separate AE warning layers', {skip:process.env.WCG_BOOT_CHECK!=='1'}, () => {
  const raw=execFileSync(process.execPath,[path.join(__dirname,'../desktop/test/boot-check.cjs'),path.join(__dirname,'..'),'--wait=9000','--eval='+path.join(__dirname,'warning-overlap.boot-eval.js')],{encoding:'utf8',timeout:300000});
  const out=JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok,true,JSON.stringify(out.errors));
  assert.equal(out.evalResult.ok,true,JSON.stringify(out.evalResult));
});
