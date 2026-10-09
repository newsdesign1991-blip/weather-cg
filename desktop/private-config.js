'use strict';
const fs = require('node:fs');
const path = require('node:path');

// 개발판/설치판 모두 desktop/private/data-go.key를 포함할 수 있다. Git 추적·app:// 서빙에서는 제외.
// 클라이언트에 들어가는 키이므로 설치 파일을 가진 사람이 추출할 수는 있다. 암호화 저장소를 대신하지 않는다.
function readDataPortalKey(desktopDir) {
  try {
    const file = path.join(desktopDir, 'private', 'data-go.key');
    if (fs.statSync(file).size > 4096) return '';
    const key = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim();
    return /^[A-Za-z0-9+/%=_-]{16,2048}$/.test(key) ? key : '';
  } catch (_) { return ''; } // 오류/로그에 파일 내용·키를 싣지 않는다.
}
function privateKeyCallerOk(e, win) {
  try {
    const frame = e.senderFrame;
    return !!win && !win.isDestroyed() && e.sender?.id === win.webContents.id && !!frame && !frame.parent &&
      String(frame.url || '').startsWith('app://weathercg/');
  } catch (_) { return false; }
}
module.exports = { readDataPortalKey, privateKeyCallerOk };
