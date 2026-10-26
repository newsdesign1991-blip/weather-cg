'use strict';
// 설치·자료 자리 고르기(desktop/app-paths.js — 10-26 NDT 런처 통합): 새 NDT 설치 = NDT 네 자리, 예전 자리·개발판 = 그대로(옮기지 않음),
// NDT 에 깔렸지만 예전 자료만 있으면 예전 자료 그대로. 설치 프로그램(installer.nsh)·설치 창(SetupApp.cs)·main.js 배선도 같은 규칙인지.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const P = require('../app-paths');

const LAD = 'C:\\Users\\홍 길동\\AppData\\Local';
const OLD = 'C:\\Users\\홍 길동\\AppData\\Roaming\\날씨 CG';
const has = (set) => (d) => set.some((x) => P.samePath(x, d));

test('NDT 네 자리 — 갈래(설치 시험판)는 따로', () => {
  assert.deepEqual(P.ndtDirs(LAD, ''), {
    id: 'weather-cg', app: LAD + '\\NDT\\apps\\weather-cg', data: LAD + '\\NDT\\data\\weather-cg', cache: LAD + '\\NDT\\cache\\weather-cg', logs: LAD + '\\NDT\\logs\\weather-cg' });
  assert.equal(P.ndtDirs(LAD, 'installtest').app, LAD + '\\NDT\\apps\\weather-cg-installtest');
});

test('고르기 — 새 NDT 설치·예전 자리·개발판·예전 자료만 남은 재설치', () => {
  const exe = LAD + '\\NDT\\apps\\weather-cg\\날씨 CG.exe';
  // 새 NDT 설치(자료 없음) → NDT
  let r = P.resolveLayout({ packaged: true, exePath: exe, lad: LAD, legacyUserData: OLD, variant: '', hasEntries: has([]) });
  assert.equal(r.kind, 'ndt'); assert.equal(r.userData, LAD + '\\NDT\\data\\weather-cg'); assert.equal(r.cache, LAD + '\\NDT\\cache\\weather-cg'); assert.equal(r.logs, LAD + '\\NDT\\logs\\weather-cg');
  // 대소문자·끝 \ 다른 경로도 같은 자리
  r = P.resolveLayout({ packaged: true, exePath: exe.toUpperCase(), lad: LAD + '\\', legacyUserData: OLD, variant: '', hasEntries: has([]) });
  assert.equal(r.kind, 'ndt');
  // NDT 자료가 있으면(다음 업데이트) 예전 자료가 있어도 NDT
  r = P.resolveLayout({ packaged: true, exePath: exe, lad: LAD, legacyUserData: OLD, variant: '', hasEntries: has([LAD + '\\NDT\\data\\weather-cg', OLD]) });
  assert.equal(r.kind, 'ndt');
  // NDT 에 깔렸지만 NDT 자료는 없고 예전 자료만(예전 판을 지우고 다시 깜) → 예전 자료 그대로(옮기지 않음)
  r = P.resolveLayout({ packaged: true, exePath: exe, lad: LAD, legacyUserData: OLD, variant: '', hasEntries: has([OLD]) });
  assert.equal(r.kind, 'legacy'); assert.equal(r.userData, undefined); assert.equal(r.why, 'ndt-app-legacy-data');
  // 예전 자리 설치(업데이트) → 그대로 — 자료는 Electron 기본, 캐시는 %LOCALAPPDATA%\WeatherCG
  r = P.resolveLayout({ packaged: true, exePath: LAD + '\\Programs\\weathercg-desktop\\날씨 CG.exe', lad: LAD, legacyUserData: OLD, variant: '', hasEntries: has([]) });
  assert.deepEqual(r, { kind: 'legacy', why: 'installed-elsewhere', cache: LAD + '\\WeatherCG' });
  // 사용자가 고른 자리·NDT 다른 앱 폴더 → 그대로
  r = P.resolveLayout({ packaged: true, exePath: 'D:\\내 앱\\날씨 CG\\날씨 CG.exe', lad: LAD, legacyUserData: OLD, variant: '', hasEntries: has([]) });
  assert.equal(r.kind, 'legacy');
  r = P.resolveLayout({ packaged: true, exePath: LAD + '\\NDT\\apps\\weather-cg\\sub\\날씨 CG.exe', lad: LAD, legacyUserData: OLD, variant: '', hasEntries: has([]) });
  assert.equal(r.kind, 'legacy');
  // 개발판·LOCALAPPDATA 없음 → 그대로(캐시 null = main.js 예전 셈)
  assert.equal(P.resolveLayout({ packaged: false, exePath: exe, lad: LAD, legacyUserData: OLD, variant: '', hasEntries: has([]) }).why, 'dev');
  assert.equal(P.resolveLayout({ packaged: true, exePath: exe, lad: '', legacyUserData: OLD, variant: '', hasEntries: has([]) }).cache, null);
  // 설치 시험판 — 자기 NDT 자리만
  r = P.resolveLayout({ packaged: true, exePath: LAD + '\\NDT\\apps\\weather-cg-installtest\\날씨 CG 설치시험.exe', lad: LAD, legacyUserData: OLD, variant: 'installtest', hasEntries: has([]) });
  assert.equal(r.kind, 'ndt'); assert.equal(r.userData, LAD + '\\NDT\\data\\weather-cg-installtest');
  assert.equal(P.resolveLayout({ packaged: true, exePath: exe, lad: LAD, legacyUserData: OLD, variant: 'installtest', hasEntries: has([]) }).kind, 'legacy');
});

test('배선 — main.js(잠금 전 setPath)·업데이트·설치 프로그램·설치 창이 같은 규칙', () => {
  const root = path.join(__dirname, '..', '..');
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const main = read('desktop/main.js');
  assert.match(main, /require\('\.\/app-paths'\)\.resolveLayout\(/);
  assert.ok(main.indexOf("app.setPath('userData', LAYOUT.userData)") > 0 && main.indexOf("app.setPath('userData', LAYOUT.userData)") < main.indexOf('requestSingleInstanceLock'), '단일 실행 잠금보다 먼저');
  assert.match(main, /app\.setPath\('logs', LAYOUT\.logs\)/);
  assert.match(main, /legacyUserData: path\.join\(app\.getPath\('appData'\), app\.getName\(\)\)/, "예전 자료 폴더를 만들지 않게(getPath('userData')는 폴더를 만든다)");
  assert.doesNotMatch(main, /getPath\('userData'\)[^\n]*resolveLayout|legacyUserData: app\.getPath\('userData'\)/);
  assert.match(main, /tempRoot: LAYOUT\.kind === 'ndt' \? LAYOUT\.cache : app\.getPath\('temp'\), logDir: LAYOUT\.kind === 'ndt' \? LAYOUT\.logs : undefined/);
  const nsh = read('tools/installer/installer.nsh');
  assert.match(nsh, /StrCpy \$INSTDIR "\$LOCALAPPDATA\\NDT\\apps\\\$\{WCG_NDT_ID\}"/);
  assert.match(nsh, /!define WCG_NDT_ID "weather-cg"/);
  assert.match(nsh, /!macro customInit/); assert.match(nsh, /!macro customPageAfterChangeDir/);
  assert.ok(nsh.includes('WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"'), '제거 목록에 설치 자리');
  assert.match(nsh, /!macro preInit\r?\n\s*StrCpy \$wcgCmdDir \$INSTDIR/, '/D= 공백 경로 보존');
  const cs = read('tools/installer/setup-ui/SetupApp.cs');
  assert.match(cs, /"NDT", "apps", NdtId/);
  assert.match(cs, /_browse\.Visibility = Visibility\.Collapsed;/);
  assert.match(cs, /_dirBox\.IsReadOnly = true;/);
  assert.doesNotMatch(cs, /_browse\.Click \+=/, '찾아보기 없음');
});
