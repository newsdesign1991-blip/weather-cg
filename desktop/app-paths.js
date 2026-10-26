'use strict';
// 설치·자료 자리 고르기(2026-10-26 — NDT 런처 통합 요청 'Weather-CG-다음업데이트-프롬프트.md'). main.js 가 app ready 전에 한 번 부른다(순수 — desktop/test/app-paths.test.cjs).
//
//  · NDT 자리(새 설치): 본체 %LOCALAPPDATA%\NDT\apps\weather-cg(설치 프로그램 — tools/installer/installer.nsh·설치 창이 새 설치의 기본 자리로 고름)
//      자료(작업·배치·설정 = 크로미움 localStorage 등 사용자 데이터) %LOCALAPPDATA%\NDT\data\weather-cg
//      다시 만들 수 있는 것(지도 타일·영상 프레임·크로미움 디스크 캐시·업데이트 설치 파일 사본) %LOCALAPPDATA%\NDT\cache\weather-cg
//      기록(업데이트 진행 창 기록·크래시 덤프) %LOCALAPPDATA%\NDT\logs\weather-cg
//  · 예전 자리(지금까지의 설치·개발판·사용자가 고른 자리): 아무것도 옮기지 않는다 — 자료 %APPDATA%\<제품 이름>(Electron 기본),
//      캐시 %LOCALAPPDATA%\WeatherCG, 기록은 지금처럼(임시 폴더·Electron 기본).
//  NDT 자리로 깔렸어도 NDT 자료 폴더가 아직 없고 예전 자료(%APPDATA%\날씨 CG)가 남아 있으면(예전 판을 지운 뒤 다시 깐 경우 — 지우기는 자료를 남긴다)
//  예전 자료를 그 자리에서 그대로 쓴다(옮기지도 지우지도 않음 — 작업·설정이 사라져 보이지 않게). 공식 이전은 하지 않는다(MODULES.md 10장 'NDT 자리').
const path = require('path');

const NDT_ID = 'weather-cg';
// 갈래(설치 시험판 'installtest')는 따로 — 사용자 설치판·자료를 건드리지 않게
const ndtIdOf = (variant) => (variant ? NDT_ID + '-' + variant : NDT_ID);
// NDT 네 자리. lad = %LOCALAPPDATA%
function ndtDirs(lad, variant) {
  const id = ndtIdOf(variant), root = path.win32.join(lad, 'NDT');
  return { id, app: path.win32.join(root, 'apps', id), data: path.win32.join(root, 'data', id), cache: path.win32.join(root, 'cache', id), logs: path.win32.join(root, 'logs', id) };
}
const norm = (p) => path.win32.resolve(String(p || '')).replace(/[\\/]+$/, '').toLowerCase();
const samePath = (a, b) => !!a && !!b && norm(a) === norm(b);

// o = { packaged, exePath(process.execPath), lad(%LOCALAPPDATA%), legacyUserData(Electron 기본 app.getPath('userData')), variant,
//       hasEntries(dir) → 그 폴더가 있고 비어 있지 않은가 }
// → { kind: 'ndt' | 'legacy', why, userData?(바꿀 때만), cache, logs?(NDT 만), dirs? }
function resolveLayout(o) {
  const legacyCache = o.lad ? path.win32.join(o.lad, o.variant ? 'WeatherCG-' + o.variant : 'WeatherCG') : null;   // null = main.js 가 예전 셈(임시 폴더)
  const legacy = (why) => ({ kind: 'legacy', why, cache: legacyCache });
  if (!o.packaged) return legacy('dev');
  if (!o.lad) return legacy('no-localappdata');
  const d = ndtDirs(o.lad, o.variant);
  if (!samePath(path.win32.dirname(o.exePath || ''), d.app)) return legacy('installed-elsewhere');
  if (!o.hasEntries(d.data) && o.legacyUserData && o.hasEntries(o.legacyUserData)) return { ...legacy('ndt-app-legacy-data'), dirs: d };
  return { kind: 'ndt', why: 'ndt-app', userData: d.data, cache: d.cache, logs: d.logs, dirs: d };
}

module.exports = { NDT_ID, ndtIdOf, ndtDirs, resolveLayout, samePath };
