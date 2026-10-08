// 점검용 Electron 임시 사용자 폴더 정리.
// desktop/main.js는 WCG_TEST=1이면 userData를 %TEMP%\wcg-test-<pid>로 둔다. 점검기는 taskkill로 끝내므로 Electron이 이 폴더를
// 지우지 못한다 — 안 지우면 실행마다 수십 MB씩 쌓인다. Electron을 띄우는 점검기(boot-check·brushperf)는 끝낼 때 이것을 부른다.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// pid: 띄운 electron.exe의 pid(= main.js의 process.pid). 지웠으면(또는 원래 없으면) true
function rmTestProfile(pid) {
  if (!pid) return true;
  const dir = path.join(os.tmpdir(), 'wcg-test-' + pid);
  for (let i = 0; i < 12; i++) {   // 막 끝난 프로세스의 파일 잠금이 잠깐 남을 수 있어 다시 시도(최대 약 3초)
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 잠금 — 잠시 뒤 다시 */ }
    if (!fs.existsSync(dir)) return true;
    sleepSync(250);
  }
  return false;
}

module.exports = { rmTestProfile };
