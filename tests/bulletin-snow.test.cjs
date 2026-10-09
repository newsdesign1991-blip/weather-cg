const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const appSource=require('../tools/app-source.cjs');
const src=appSource(path.join(__dirname,'..','index.html'));
function context(){
  const c={S:{texts:[]}};vm.createContext(c);
  vm.runInContext(src.slice(src.indexOf('const RAIN_SCALE ='),src.indexOf('const KMA_TERMS = {')),c);
  vm.runInContext(src.slice(src.indexOf('const KMA_TERMS = {'),src.indexOf('function bulAssignDir(')),c);
  return c;
}
test('snow/rain same values remain separate color groups and support fullwidth units',()=>{
  const c=context();
  const groups=c.parseBulletin('* 예상 적설 및 강수량\n- 서울: 5~10cm\n- 서울: 5~10mm\n- 경기: 1~3㎝');
  assert.equal(groups.length,3);
  const p=c.bulColorPlan(groups,c.bulDocKind('* 예상 적설 및 강수량'));
  assert.equal(p.kind,'mix');assert.notEqual(p.colOf['cm|5~10'],p.colOf['mm|5~10']);
  assert.equal(c.bulColorPlan(c.parseBulletin('- 서울: 1~3'),'snow').kind,'snow');
});
test('automatic snow title/unit round trip preserves custom titles',()=>{
  const c=context();c.S.texts=[{txt:'예상 강수량'},{txt:'단위 : mm'},{txt:'오늘의 특별한 소식'}];
  c.bulTitleTexts('snow');assert.equal(c.S.texts[0].txt,'예상 적설량');assert.equal(c.S.texts[1].txt,'단위 : cm');
  c.bulTitleTexts('mix');assert.equal(c.S.texts[1].txt,'단위 : cm·mm');
  c.bulTitleTexts('rain');assert.equal(c.S.texts[0].txt,'예상 강수량');assert.equal(c.S.texts[2].txt,'오늘의 특별한 소식');
});
