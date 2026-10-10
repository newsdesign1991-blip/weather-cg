'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {readDataPortalKey,readMapboxToken,mapboxTokenOk,privateKeyCallerOk}=require('../private-config');
test('private key reads only bounded single-token files; missing/malformed files are safe',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wcg-private-config-'));
  try{
    assert.equal(readDataPortalKey(dir),'');
    fs.mkdirSync(path.join(dir,'private'));
    const file=path.join(dir,'private','data-go.key');
    fs.writeFileSync(file,'\uFEFF TEST-ONLY-DEFAULT-KEY%2B%2F%3D\n');
    assert.equal(readDataPortalKey(dir),'TEST-ONLY-DEFAULT-KEY%2B%2F%3D');
    for(const invalid of ['not a key','x'.repeat(5000),'<html>failed response</html>']){
      fs.writeFileSync(file,invalid);assert.equal(readDataPortalKey(dir),'');
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Mapbox default token: only a bounded public pk. token line; secret sk. tokens, URLs and junk are refused',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wcg-private-config-'));
  try{
    assert.equal(readMapboxToken(dir),'');
    fs.mkdirSync(path.join(dir,'private'));
    const file=path.join(dir,'private','mapbox.token');
    fs.writeFileSync(file,String.fromCharCode(0xFEFF)+' pk.TEST-ONLY.fake_token-1\r\n');
    assert.equal(readMapboxToken(dir),'pk.TEST-ONLY.fake_token-1');
    for(const invalid of ['sk.TEST-ONLY.secret_token','https://api.mapbox.com/styles/v1/a/b?access_token=pk.TESTONLYfake','pk.TEST ONLY','pk.x','pk.'+'x'.repeat(5000)]){
      fs.writeFileSync(file,invalid);assert.equal(readMapboxToken(dir),'',invalid.slice(0,40));
    }
    assert.equal(mapboxTokenOk(undefined),'');assert.equal(mapboxTokenOk('pk.TESTONLYfake'),'pk.TESTONLYfake');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('private key IPC accepts only the local main app frame',()=>{
  const win={isDestroyed:()=>false,webContents:{id:7}};
  const event=(url='app://weathercg/',id=7,parent=null)=>({sender:{id},senderFrame:{url,parent}});
  assert.equal(privateKeyCallerOk(event(),win),true);
  assert.equal(privateKeyCallerOk(event('https://www.weather.go.kr/'),win),false);
  assert.equal(privateKeyCallerOk(event('app://weathercg.evil/'),win),false);
  assert.equal(privateKeyCallerOk(event(undefined,8),win),false);
  assert.equal(privateKeyCallerOk(event(undefined,7,{}),win),false);
  assert.equal(privateKeyCallerOk(event(),null),false);
  assert.equal(privateKeyCallerOk({get senderFrame(){throw Error('disposed');}},win),false);
});
