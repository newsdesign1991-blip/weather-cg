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
  // 설치 방식 화면 없음: 보통 '이 사용자만', 임시판을 '모든 사용자'로만 깐 PC 는 그 자리에 덮어 올림(관리자 확인)
  const nsh = fs.readFileSync(path.join(root, 'tools', 'installer', 'installer.nsh'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(nsh, /!macro customInstallMode\n\s*\$\{if\} \$hasPerMachineInstallation == "1"\n\s*\$\{andIf\} \$hasPerUserInstallation == "0"\n\s*StrCpy \$isForceMachineInstall "1"\n\s*\$\{else\}\n\s*StrCpy \$isForceCurrentInstall "1"\n\s*\$\{endIf\}\n!macroend/);
  assert.equal(nsh.charCodeAt(0), 0xFEFF, 'NSIS 가 한글 주석을 UTF-8 로 읽게 BOM');
  // 설치 끝·제거 때 설치 프로그램 사본(%LOCALAPPDATA%\…-updater\installer.exe)만 지운다 — 사용자 데이터(APPDATA)는 안 건드림, 폴더는 빈 것만
  assert.match(nsh, /!macro customInstall\n\s*!insertmacro wcgDropInstallerCopy\n!macroend/);
  assert.match(nsh, /!macro customUnInstall\n\s*!insertmacro wcgDropInstallerCopy\n\s*SetOutPath "\$TEMP"\n\s*RMDir "\$INSTDIR"\n!macroend/, '제거 뒤 빈 설치 폴더만 지움(작업 폴더를 옮긴 뒤, /r 아님)');
  assert.match(nsh, /Delete "\$LOCALAPPDATA\\\$\{APP_INSTALLER_STORE_FILE\}"/);
  assert.match(nsh, /RMDir "\$LOCALAPPDATA\\\$\{WCG_UPDATER_DIR\}"/);
  assert.doesNotMatch(nsh.split('\n').filter((l) => !/^\s*;/.test(l)).join('\n'), /\$APPDATA|RMDir \/r|delete-app-data/i);
});

test('설치 시험판(--installtest) — 앱 내용은 같고 appId·제품 이름(exe·바로 가기·사용자 데이터)·설치 폴더 이름·파일 이름만 다름', () => {
  const base = { appDir: 'A', outDir: 'O', resDir: 'R', version: '1.0.0', electronVersion: '44.6.0', electronDist: null, nsh: 'N.nsh' };
  const c = B.builderConfig(base), t = B.builderConfig({ ...base, installtest: true });
  assert.notEqual(t.appId, c.appId); assert.ok(t.appId.startsWith(B.APP_ID + '.'));
  assert.notEqual(t.productName, c.productName);
  assert.notEqual(B.INSTALLTEST.name, B.PACKAGE_NAME);
  assert.equal(t.nsis.shortcutName, t.productName);
  assert.notEqual(t.nsis.artifactName, c.nsis.artifactName);
  const strip = (x) => JSON.stringify({ ...x, appId: 0, productName: 0, nsis: { ...x.nsis, shortcutName: 0, artifactName: 0 } });
  assert.equal(strip(t), strip(c), '이름 말고는 같은 설정');
  assert.deepEqual(B.namesFor(false), { appId: B.APP_ID, productName: B.PRODUCT_NAME, name: B.PACKAGE_NAME, artifact: B.ARTIFACT });
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
  assert.ok(mainJs.indexOf("'[wcg-paths] '") < mainJs.indexOf('if (TEST_MODE) { createWindow(); startUpdater(); return; }'));
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

// ---------- 깨끗한 Electron(공식 zip) — 1.0.0 검증에서 나온 debug.log·빠진 pak ----------
// 작은 ustar 만들기(시험용)
function ustar(files) {
  const bufs = [];
  for (const [name, body] of Object.entries(files)) {
    const h = Buffer.alloc(512);
    h.write(name, 0, 'utf8');
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
    h.write('00000000000\0', 136); h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263);
    let sum = 0; for (const b of h) sum += b; h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    bufs.push(h, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  bufs.push(Buffer.alloc(1024));
  return Buffer.concat(bufs);
}

test('Electron 공식 zip — SHASUMS256 읽기·tar 꺼내기·npm 캐시 checksums.json(sha512 확인)·캐시 zip 찾기·기준 순서', () => {
  const name = B.electronZipName('44.6.0');
  assert.equal(name, 'electron-v44.6.0-win32-x64.zip');
  const sha = 'ab'.repeat(32);
  assert.equal(B.shaFromShasums(`${'cd'.repeat(32)} *electron-v44.6.0-darwin-x64.zip\r\n${sha.toUpperCase()} *${name}\n`, name), sha);
  assert.equal(B.shaFromShasums('nothing', name), '');
  const tar = ustar({ 'package/package.json': Buffer.from('{}'), 'package/checksums.json': Buffer.from(JSON.stringify({ [name]: sha })) });
  assert.equal(B.tarEntry(tar, 'package/checksums.json').toString(), JSON.stringify({ [name]: sha }));
  assert.equal(B.tarEntry(tar, 'package/nope'), null);
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-ecache-'));
  try {
    // 가짜 npm 캐시(cacache): index-v5/<sha256(key)> 버킷 → content-v2/sha512/<무결성>
    const tgz = require('zlib').gzipSync(tar);
    const hex = require('crypto').createHash('sha512').update(tgz).digest('hex');
    const key = 'make-fetch-happen:request-cache:https://registry.npmjs.org/electron/-/electron-44.6.0.tgz';
    const kh = require('crypto').createHash('sha256').update(key).digest('hex');
    const npmc = path.join(t, 'npm-cache');
    fs.mkdirSync(path.join(npmc, '_cacache', 'index-v5', kh.slice(0, 2), kh.slice(2, 4)), { recursive: true });
    fs.mkdirSync(path.join(npmc, '_cacache', 'content-v2', 'sha512', hex.slice(0, 2), hex.slice(2, 4)), { recursive: true });
    fs.writeFileSync(path.join(npmc, '_cacache', 'content-v2', 'sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4)), tgz);
    fs.writeFileSync(path.join(npmc, '_cacache', 'index-v5', kh.slice(0, 2), kh.slice(2, 4), kh.slice(4)), '\nx\t' + JSON.stringify({ key, integrity: 'sha512-' + Buffer.from(hex, 'hex').toString('base64') }));
    assert.deepEqual(B.checksumsFromNpmCache('44.6.0', npmc), { [name]: sha });
    assert.equal(B.checksumsFromNpmCache('44.6.1', npmc), null);
    fs.appendFileSync(path.join(npmc, '_cacache', 'content-v2', 'sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4)), 'x');
    assert.equal(B.checksumsFromNpmCache('44.6.0', npmc), null, '꾸러미 sha512 가 다르면 안 믿음');
    // 캐시 zip 찾기(주소 해시 하위 폴더) + 옆 SHASUMS256.txt 가 먼저
    const ec = path.join(t, 'electron-cache'), sub = path.join(ec, 'abc123');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, name), 'zip');
    assert.equal(B.findElectronZip('44.6.0', [path.join(t, 'none'), ec]), path.join(sub, name));
    assert.equal(B.findElectronZip('44.6.9', [ec]), null);
    fs.writeFileSync(path.join(sub, 'SHASUMS256.txt'), `${sha} *${name}\n`);
    assert.equal(B.electronOfficialSha('44.6.0', path.join(sub, name), {}).sha256, sha);
    assert.match(B.electronOfficialSha('44.6.0', path.join(sub, name), {}).source, /SHASUMS256\.txt/);
    const cj = path.join(t, 'checksums.json'); fs.writeFileSync(cj, JSON.stringify({ [name]: 'ef'.repeat(32) }));
    assert.equal(B.electronOfficialSha('44.6.0', path.join(sub, name), { shasums: cj }).sha256, 'ef'.repeat(32), '--electron-shasums 가 먼저');
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
});

test('Electron 폴더 점검 — 판 파일·electron.exe·pak 둘·로그 없음, 빌드는 공식 zip 을 확인해 풀고 구운 폴더도 다시 본다', () => {
  assert.deepEqual(B.ELECTRON_PAKS, ['chrome_100_percent.pak', 'chrome_200_percent.pak']);
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-edist-'));
  try {
    fs.writeFileSync(path.join(t, 'version'), '44.6.0');
    fs.writeFileSync(path.join(t, 'electron.exe'), 'x');
    for (const p of B.ELECTRON_PAKS) fs.writeFileSync(path.join(t, p), 'x');
    assert.deepEqual(B.electronDistProblems(t, '44.6.0'), []);
    fs.writeFileSync(path.join(t, 'debug.log'), 'x');
    fs.rmSync(path.join(t, 'chrome_200_percent.pak'));
    assert.deepEqual(B.electronDistProblems(t, '44.6.0'), ['chrome_200_percent.pak 없음', '로그 파일: debug.log']);
    assert.deepEqual(B.electronDistProblems(t, '44.6.1').slice(0, 1), ['version 파일(44.6.0) ≠ 44.6.1']);
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
  const bld = fs.readFileSync(path.join(root, 'tools', 'build-installer.cjs'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(bld, /if \(got !== want\.sha256\) die\(/, 'sha256 이 공식 값과 다르면 멈춤');
  assert.match(bld, /const distBad = electronDistProblems\(path\.join\(outDir, 'win-unpacked'\)/, '구운 폴더도 다시 점검');
  assert.doesNotMatch(bld, /electronDist = localDist/, '개발판 dist 를 그대로 쓰지 않는다');
  const chk = fs.readFileSync(path.join(root, 'tools', 'check-installed.cjs'), 'utf8');
  assert.match(chk, /설치판에 로그 파일이 담김/);
  assert.match(chk, /Electron pak 이 빠짐/);
});

test('--version 은 설치 시험판만 — 정식에 주면 굽기 전에 멈춤', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'tools', 'build-installer.cjs'), '--version=9.9.9', '--stage-only', '--work=' + path.join(os.tmpdir(), 'wcg-ver-guard-' + process.pid)], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--version 은 --installtest\(설치 시험판\)에서만/);
  assert.ok(!fs.existsSync(path.join(os.tmpdir(), 'wcg-ver-guard-' + process.pid, 'src')), '아무것도 꺼내지 않음');
});
