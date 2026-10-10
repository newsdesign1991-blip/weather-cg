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
// Mapbox 기본 토큰(desktop/private/mapbox.token — 한 줄). 가벼운 지도 위성 사진의 기본 출처(js/gl-basemap.js glbSatBuiltinUrl — 개인 주소가 없을 때).
// 웹앱(렌더러)에 넘기므로 공개용 토큰(pk.)만 받는다 — 비밀 토큰(sk.)·다른 글은 ''. 데이터 키처럼 설치 파일에서 꺼낼 수는 있다(Mapbox에서 URL 제한 권장).
function mapboxTokenOk(v) {
  const t = String(v == null ? '' : v).trim();   // trim은 맨 앞 BOM(U+FEFF)도 지운다
  return /^pk\.[A-Za-z0-9._-]{8,2048}$/.test(t) ? t : '';
}
function readMapboxToken(desktopDir) {
  try {
    const file = path.join(desktopDir, 'private', 'mapbox.token');
    if (fs.statSync(file).size > 4096) return '';
    return mapboxTokenOk(fs.readFileSync(file, 'utf8'));
  } catch (_) { return ''; } // 오류/로그에 파일 내용·토큰을 싣지 않는다.
}
function privateKeyCallerOk(e, win) {
  try {
    const frame = e.senderFrame;
    return !!win && !win.isDestroyed() && e.sender?.id === win.webContents.id && !!frame && !frame.parent &&
      String(frame.url || '').startsWith('app://weathercg/');
  } catch (_) { return false; }
}
module.exports = { readDataPortalKey, readMapboxToken, mapboxTokenOk, privateKeyCallerOk };
