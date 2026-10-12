// 설치판 만들기(tools/build-installer.cjs)·설치판 점검기(tools/check-installed.cjs)·설치판 경로(desktop/main.js DESK_REAL) 정적 검사.
// 실제로 굽기·설치·실행은 사람이(또는 AI가) node tools/build-installer.cjs → 설치 → node tools/check-installed.cjs <설치 폴더> 로 한다(MODULES.md 10장).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const B = require('../../tools/build-installer.cjs');
const { asarList } = require('../../tools/check-installed.cjs');
const mainJs = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const preload = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8').replace(/\r\n/g, '\n');
const deskPkg = JSON.parse(fs.readFileSync(path.join(root, 'desktop', 'package.json'), 'utf8'));
const tracked = (() => {
  const r = spawnSync('git', ['-C', root, '-c', 'core.quotepath=false', 'ls-files', '-z'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\0').filter(Boolean) : null;
})();

test('이름·판 — 임시판(0.2.0)과 같은 appId·제품 이름·설치 폴더 이름, 판은 desktop/package.json(x.y.z), main.js 앱 ID 와 같음', () => {
  assert.equal(B.APP_ID, 'kr.co.sbs.weathercg');
  assert.equal(B.PRODUCT_NAME, '날씨 CG');
  assert.equal(B.PACKAGE_NAME, 'weathercg-desktop');
  assert.equal(B.PRODUCT_NAME, deskPkg.productName, '사용자 데이터 폴더 이름(%APPDATA%\\날씨 CG)이 개발판과 같아야 작업·설정이 이어진다');
  assert.equal(B.PACKAGE_NAME, deskPkg.name);
  assert.match(deskPkg.version, /^\d+\.\d+\.\d+$/);
  assert.match(mainJs, new RegExp(`const APP_ID = '${B.APP_ID.replace(/\./g, '\\.')}';`));
  assert.match(mainJs, /if \(app\.isPackaged\) app\.setAppUserModelId\(APP_ID\);/);
  assert.equal(B.ARTIFACT, 'WeatherCG-Setup-${version}.exe');
});

test('담는 파일 고르기 — 예시', () => {
  const yes = ['img-data.js', 'region-map-data.js', 'icon.ico', 'icon.svg', 'icon-512.png', 'manifest.webmanifest',
    'js/boot.js', 'css/base.css', 'FontNew/SUITE-Bold.otf', 'FontNew/WantedSansVariable.woff2', 'FontNew/WantedSans-LICENSE.txt',
    'vendor/maplibre-gl/maplibre-gl.js', 'vendor/maplibre-gl/LICENSE.txt', 'desktop/main.js', 'desktop/preload.js', 'desktop/private-config.js', 'desktop/wns/server.js'];
  const no = ['sw.js', '.nojekyll', '.gitignore', 'AGENTS.md', 'MODULES.md', 'README.md', 'AI_HANDOFF.md', 'vendor/.gitattributes',
    'tests/split-structure.test.cjs', 'tests/fixtures/jtwc/wp2726.tcw', 'docs/superpowers/README.md', 'tools/build-installer.cjs', 'tools/installer/installer.nsh',
    'desktop/test/boot-check.cjs', 'desktop/package.json', 'desktop/package-lock.json', 'desktop/.gitignore', 'desktop/날씨CG_데스크톱_실행.bat',
    'desktop/날씨CG_데스크톱_실행.bat - 바로 가기.lnk', 'rec-20261010-0500.json', 'js/rec-1.json', 'desktop/node_modules/electron/index.js',
    'data/raw.json', 'PSD/a.psd', '.worktrees/x/a.js','js/sub/x.js', 'js/Upper.js', '../x.js', 'a//b.js'];
  for (const p of yes) assert.equal(B.appFileFilter(p), true, p);
  for (const p of no) assert.equal(B.appFileFilter(p), false, p);
  assert.deepEqual(B.forbiddenIn(yes), []);
  assert.deepEqual(B.forbiddenIn(['rec-1.json', 'x/AI_HANDOFF.md', 'a.lnk', 'tests/a.cjs', 'desktop/test/x', '.git/HEAD', 'desktop/package.json']).length, 7);
});

test('담는 파일 고르기 — 지금 저장소: 앱이 부르는 파일은 다 들고, 넣으면 안 되는 것은 없음', { skip: !tracked && 'git 없음' }, () => {
  const picked = tracked.filter(B.appFileFilter);
  assert.deepEqual(B.forbiddenIn(picked), []);
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  assert.deepEqual(B.missingRefs(tracked, picked, read), [], '앱이 부르는데 빠진 파일');
  // js·css 모듈은 전부, 개발 파일은 하나도
  assert.deepEqual(picked.filter((p) => /^js\/.+\.js$/.test(p)), tracked.filter((p) => /^js\/[a-z0-9-]+\.js$/.test(p)));
  assert.deepEqual(picked.filter((p) => /^css\/.+\.css$/.test(p)), tracked.filter((p) => /^css\/[a-z0-9-]+\.css$/.test(p)));
  assert.ok(picked.includes('vendor/maplibre-gl/maplibre-gl.js'));
  assert.equal(picked.filter((p) => /^(tests|tools|docs)\//.test(p) || p.startsWith('desktop/test/')).length, 0);
  // 빼면 알아챈다(가벼운 지도 엔진·글꼴)
  const less = picked.filter((p) => p !== 'vendor/maplibre-gl/maplibre-gl.js' && p !== 'FontNew/SUITE-Bold.otf');
  assert.deepEqual(B.missingRefs(tracked, less, read), ['FontNew/SUITE-Bold.otf', 'vendor/maplibre-gl/maplibre-gl.js']);
  // 꼭 있어야 하는 것 중 Git 안 파일은 고른 것에 있다(나머지 — package.json·비공개 키·ffmpeg·SUITE 사본 — 은 빌드가 더한다)
  const added = new Set(['package.json', 'desktop/helper/ffmpeg.exe', ...B.PRIVATE_FILES.map((f) => 'desktop/private/' + f), ...B.SUITE_FONTS.map((f) => 'desktop/helper/fonts/' + f)]);
  assert.deepEqual(B.REQUIRED.filter((r) => !added.has(r) && !picked.includes(r)), []);
  for (const f of B.SUITE_FONTS) assert.ok(tracked.includes('FontNew/' + f), f);
});

test('electron-builder 설정 — 이 사용자만·위치 고르기·바로 가기·asar 밖 helper·데이터 남김·한국어', () => {
  const c = B.builderConfig({ appDir: 'A', outDir: 'O', resDir: 'R', version: '1.0.0', electronVersion: '44.6.0', electronDist: null, nsh: 'N.nsh' });
  assert.equal(c.appId, B.APP_ID); assert.equal(c.productName, B.PRODUCT_NAME);
  assert.equal(c.asar, true);
  assert.deepEqual(c.asarUnpack, ['desktop/helper/**']);
  assert.equal(c.electronDist, undefined);
  assert.equal(c.nsis.oneClick, false); assert.equal(c.nsis.perMachine, false);
  assert.equal(c.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(c.nsis.createDesktopShortcut, true); assert.equal(c.nsis.createStartMenuShortcut, true);
  assert.equal(c.nsis.shortcutName, B.PRODUCT_NAME);
  assert.equal(c.nsis.deleteAppDataOnUninstall, false);
  assert.equal(c.nsis.artifactName, B.ARTIFACT);
  assert.equal(c.nsis.language, '1042');
  assert.equal(c.nsis.include, 'N.nsh');
  assert.equal(c.win.target[0].target, 'nsis');
  assert.equal(c.publish, null);
  const nsh = fs.readFileSync(path.join(root, 'tools', 'installer', 'installer.nsh'), 'utf8');
  assert.match(nsh, /!macro customInstallMode\s+StrCpy \$isForceCurrentInstall "1"\s+!macroend/);
});

test('main.js — 설치판에서 ffmpeg·폰트·Python 헬퍼 자리는 asar 밖(DESK_REAL), 개발판은 __dirname 그대로', () => {
  const m = /const DESK_REAL = __dirname\.replace\(\/(.+)\/(\w*), '([^']*)'\);/.exec(mainJs);
  assert.ok(m, 'DESK_REAL 줄');
  const desk = (d) => d.replace(new RegExp(m[1], m[2]), m[3]);
  const inst = 'C:\\Users\\u\\AppData\\Local\\Programs\\weathercg-desktop\\resources';
  assert.equal(desk(inst + '\\app.asar\\desktop'), inst + '\\app.asar.unpacked\\desktop');
  assert.equal(desk(inst + '\\APP.ASAR\\desktop'), inst + '\\app.asar.unpacked\\desktop');
  assert.equal(desk(inst + '\\app.asar'), inst + '\\app.asar.unpacked');
  assert.equal(desk(inst + '\\app.asar.unpacked\\desktop'), inst + '\\app.asar.unpacked\\desktop');   // 두 번 바꾸지 않음
  assert.equal(desk('D:\\03_Util\\WeatherCG\\desktop'), 'D:\\03_Util\\WeatherCG\\desktop');
  assert.equal(desk('D:\\my.app.asarx\\desktop'), 'D:\\my.app.asarx\\desktop');
  assert.match(mainJs, /const FFMPEG = \[path\.join\(DESK_REAL, 'helper', 'ffmpeg\.exe'\),/);
  assert.match(mainJs, /defaultFontsCandidates\(DESK_REAL\)/);
  assert.match(mainJs, /const EXT_SRC_DIRS = \[path\.join\(DESK_REAL, 'helper'\),/);
  // 앱 파일(웹앱·preload·비공개 키)은 asar 안 그대로
  assert.match(mainJs, /path\.resolve\(__dirname, '\.\.'\)/);
  assert.match(mainJs, /preload: path\.join\(__dirname, 'preload\.js'\)/);
  assert.match(mainJs, /readDataPortalKey\(__dirname\)/);
  assert.match(mainJs, /readMapboxToken\(__dirname\)/);
  assert.match(mainJs, /const BLOCKED = \/\^\(\\\.git\|\\\.worktrees\|desktop\|node_modules\)/, 'app:// 는 desktop/(비공개 키·ffmpeg)을 막는다');
});

test('main.js·preload — 앱 버전·설치판 여부를 웹앱에, 점검 모드 경로 줄에는 키 없음', () => {
  assert.match(mainJs, /ipcMain\.on\('wcg:helper', \(e\) => \{ e\.returnValue = \{ url: helperUrl, kind: helperKind, ver: HELPER_VER, app: app\.getVersion\(\), packaged: app\.isPackaged \}; \}\);/);
  assert.match(preload, /appVersion: String\(helper\.app \|\| ''\),/);
  assert.match(preload, /packaged: helper\.packaged === true,/);
  const line = mainJs.split('\n').find((l) => l.includes("'[wcg-paths] '"));
  assert.ok(line && /^\s*if \(TEST_MODE\) console\.log\(/.test(line), '점검 모드에서만');
  assert.doesNotMatch(line, /readDataPortalKey|readMapboxToken|dataPortalKey|mapbox/i);
  assert.ok(mainJs.indexOf("'[wcg-paths] '") < mainJs.indexOf('if (TEST_MODE) { createWindow(); return; }'));
});

test('asarList — asar 머리(pickle + JSON)를 읽어 파일·asar 밖 표시', () => {
  const hdr = JSON.stringify({ files: { 'a.txt': { size: 1, offset: '0' }, d: { files: { 'b.js': { size: 2, offset: '1' }, e: { files: {} } } }, 'u.exe': { size: 3, unpacked: true } } });
  const s = Buffer.from(hdr, 'utf8');
  const pad = (4 - (s.length % 4)) % 4;
  const buf = Buffer.alloc(16 + s.length + pad + 3);
  buf.writeUInt32LE(4, 0); buf.writeUInt32LE(8 + s.length + pad, 4); buf.writeUInt32LE(4 + s.length + pad, 8); buf.writeUInt32LE(s.length, 12);
  s.copy(buf, 16);
  const f = path.join(os.tmpdir(), `wcg-asar-test-${process.pid}.asar`);
  fs.writeFileSync(f, buf);
  try {
    assert.deepEqual(asarList(f), [{ path: 'a.txt', unpacked: false, size: 1 }, { path: 'd/b.js', unpacked: false, size: 2 }, { path: 'u.exe', unpacked: true, size: 3 }]);
  } finally { fs.rmSync(f, { force: true }); }
});

test('점검기·빌드 — 키 값을 출력하지 않는다(있음·길이만), 띄운 프로세스는 PID 로만 끈다', () => {
  const chk = fs.readFileSync(path.join(root, 'tools', 'check-installed.cjs'), 'utf8');
  const bld = fs.readFileSync(path.join(root, 'tools', 'build-installer.cjs'), 'utf8');
  assert.match(chk, /dataKey: key\.length > 0, mapboxToken: tok\.length > 0/);
  assert.match(chk, /dataPortalKey: typeof d\.dataPortalKey === 'string' && d\.dataPortalKey\.length > 0/);
  const kills = (bld + '\n' + chk).split('\n').filter((l) => /taskkill/.test(l) && !/^\s*\/\//.test(l));
  assert.ok(kills.length >= 1);
  for (const l of kills) assert.match(l, /'\/PID', String\(proc\.pid\)/, '이름(/IM)으로 끄지 않는다: ' + l.trim());
  assert.doesNotMatch(bld, /readFileSync\(path\.join\(pdir/, '빌드는 키 파일을 복사만 한다(읽어서 찍지 않음)');
});
