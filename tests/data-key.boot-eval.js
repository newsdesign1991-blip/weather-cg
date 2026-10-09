// Opt-in WCG_TEST_DATA_KEY=1. Never return, log or interpolate the real credential.
const original=localStorage.getItem('wcg_datakey');
try{
  localStorage.removeItem('wcg_datakey');
  const key=dataKey();
  if(!key||!window.wcgDesktop.dataPortalKey)throw Error('desktop default missing');
  if(document.getElementById('dataKeyIn').value)throw Error('default copied into editable field');
  if(!document.getElementById('dataKeyInfo').textContent.includes('내장'))throw Error('default key guidance missing');
  if(JSON.stringify(stateForSave()).includes(key))throw Error('credential in project');
  if(dataMask(key)!=='***')throw Error('default not redacted');
  localStorage.setItem('wcg_datakey','PERSONAL-TEST-OVERRIDE');
  if(dataKey()!=='PERSONAL-TEST-OVERRIDE')throw Error('personal override failed');
  if(dataMask(key)!=='***')throw Error('default not masked with personal override');
  localStorage.removeItem('wcg_datakey');
  if(dataKey()!==key)throw Error('default reset failed');
  return {ok:true,defaultAvailable:true,personalOverride:true,projectHasNoKey:true};
}finally{
  if(original===null)localStorage.removeItem('wcg_datakey');else localStorage.setItem('wcg_datakey',original);
}
