#!/usr/bin/env node
'use strict';
// 날씨 CG 설치 파일(Windows) 만들기 — electron-builder NSIS. 사용법·주의는 MODULES.md 10장 '설치판 만들기'.
//
//   node tools/build-installer.cjs [--ref=HEAD] [--work=<준비 폴더>] [--tools=<빌드 도구 폴더>] [--dist=<결과 복사 폴더>]
//                                  [--ffmpeg=<ffmpeg.exe>] [--private=<비공개 키 폴더>] [--electron-dist=<electron dist 폴더> | --download-electron]
//                                  [--stage-only] [--installtest]
//   --installtest: 이름만 다른 '설치 시험판'(아래 INSTALLTEST)을 준비 폴더 out-installtest 에 굽는다 — 설치판이 깔렸거나 켜진 PC 에서 설치·제거 시험용.
//
// 하는 일(차례대로):
//  1) 커밋(--ref, 기본 HEAD)을 git archive 로 준비 폴더 src\ 에 꺼낸다 — 커밋 안 한 고침·Git 밖 파일(녹화 rec-*.json·메모·바로 가기)은 안 들어간다.
//  2) 앱 실행에 필요한 것만 app\ 로 고른다(appFileFilter): index.html·루트 데이터 js·아이콘·manifest, js\·css\·FontNew\·vendor\, desktop\*.js·desktop\wns\*.js.
//     빼는 것: tests\·tools\·docs\·desktop\test\·*.md·sw.js(웹판 전용 — app:// 에선 등록 안 함)·.git…·*.lnk·rec-*.json.
//  3) Git 밖 파일을 더한다: 비공개 키 desktop\private\{data-go.key, mapbox.token}(값은 출력하지 않음), ffmpeg.exe → desktop\helper\,
//     AE용 SUITE 폰트(FontNew\SUITE-*.otf) → desktop\helper\fonts\. desktop\helper\** 는 asar 밖(app.asar.unpacked)으로 푼다(다른 프로그램이 읽음 — desktop/main.js DESK_REAL).
//  4) 점검: 빠지면 안 되는 파일·앱이 부르는 파일(index.html 태그·js/css 안 경로)이 다 있는지, 넣으면 안 되는 것이 없는지 — 하나라도 어긋나면 멈춘다.
//  5) app\package.json(main = desktop/main.js, version = desktop/package.json)을 쓰고 electron-builder 로 NSIS 설치 파일을 굽는다.
//  6) 구운 app.asar 목록을 다시 점검하고, 설치 파일을 --dist(기본 desktop\dist — Git 제외)에 복사 + 빌드 정보(.build.json).
//
// 빌드 도구(electron-builder)는 저장소 밖 --tools(기본 %LOCALAPPDATA%\WeatherCG-build\tools)에 받는다 — 저장소·desktop\node_modules 에는 설치하지 않는다.
// Electron 은 desktop\node_modules\electron\dist(같은 판이면 — 읽기만)를 쓰고, 없거나 판이 다르면 electron-builder 가 받는다(인터넷).
// 서명 없음: 받은 PC 에서 Windows SmartScreen 경고가 뜬다('추가 정보 → 실행').
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// 바꾸면 안 되는 값 — 임시판(0.2.0, 10-12)과 같아야 그 위에 덮어 설치된다(같은 GUID·같은 설치 폴더·같은 사용자 데이터 '날씨 CG').
const APP_ID = 'kr.co.sbs.weathercg';          // desktop/main.js APP_ID 와 같게(작업 표시줄 묶음)
const PRODUCT_NAME = '날씨 CG';                 // exe 이름·바로 가기·사용자 데이터(%APPDATA%\날씨 CG — 개발판과 같은 곳) = desktop/package.json productName
const PACKAGE_NAME = 'weathercg-desktop';      // 설치 폴더 이름(%LOCALAPPDATA%\Programs\weathercg-desktop — 제품 이름에 한글이 있으면 이 이름을 쓴다)
const ARTIFACT = 'WeatherCG-Setup-${version}.exe';
const BUILDER_VERSION = '24.13.3';             // 임시판과 같은 판(Electron 44 를 그대로 복사해 묶는다)
const SUITE_FONTS = ['SUITE-Light.otf', 'SUITE-Regular.otf', 'SUITE-Medium.otf', 'SUITE-SemiBold.otf', 'SUITE-Bold.otf', 'SUITE-ExtraBold.otf', 'SUITE-Heavy.otf'];
const PRIVATE_FILES = ['data-go.key', 'mapbox.token'];

// ---------- 무엇을 담나 ----------
// rel = 저장소 기준 경로('/' 구분). true 면 설치판에 담는다.
function appFileFilter(rel) {
  const p = String(rel).replace(/\\/g, '/');
  if (!p || p.startsWith('/') || p.split('/').some((s) => s === '..' || s === '')) return false;
  const base = p.split('/').pop();
  if (base.startsWith('.')) return false;                                  // .gitignore·.gitattributes·.nojekyll
  if (/\.(md|lnk|bat|cmd|ps1|py|pyc|psd|tmp)$/i.test(base) || /^rec-.*\.json$/i.test(base)) return false;
  if (!p.includes('/')) {                                                    // 루트 파일
    if (p === 'sw.js') return false;                                         // 서비스워커 — http 일 때만 등록(index.html head). app:// 에선 안 씀
    return p === 'index.html' || p === 'manifest.webmanifest' || /\.(js|png|svg|ico)$/i.test(p);
  }
  if (/^js\/[a-z0-9-]+\.js$/.test(p)) return true;
  if (/^css\/[a-z0-9-]+\.css$/.test(p)) return true;
  if (/^FontNew\/[^/]+\.(otf|ttf|woff2?|txt)$/i.test(p)) return true;
  if (/^vendor\/[a-z0-9-]+\/[^/]+$/i.test(p)) return true;                  // vendor/maplibre-gl/{maplibre-gl.js, LICENSE.txt, README.txt}
  if (/^desktop\/[a-z0-9-]+\.js$/.test(p)) return true;                      // main·preload·close-guard·data-fetch·jtwc·private-config·reveal·tile-cache·window-layout
  if (/^desktop\/wns\/[a-z0-9-]+\.js$/.test(p)) return true;                 // 내장 헬퍼
  return false;
}

// 넣으면 안 되는 것(구운 뒤 asar 목록에도 다시 본다). 돌려주는 것: 걸린 경로 목록
const FORBIDDEN = [
  [/(^|\/)rec-[^/]*\.json$/i, '기상청 녹화(rec-*.json — 공개 금지)'],
  [/\.lnk$/i, '바로 가기(.lnk)'],
  [/(^|\/)AI_HANDOFF\.md$/i, 'AI 인계 문서'],
  [/\.md$/i, '개발 문서(.md)'],
  [/^(tests|tools|docs|scratch|\.worktrees|\.tmp)(\/|$)/i, '개발 폴더'],
  [/^desktop\/test(\/|$)/i, '데스크톱 시험'],
  [/(^|\/)\.git(\/|$|ignore$|attributes$)/i, 'git 흔적'],
  [/(^|\/)node_modules(\/|$)/i, 'node_modules'],
  [/^desktop\/package(-lock)?\.json$/i, '개발판 package.json'],
  [/(^|\/)(ImageSources|Preset_Location|PSD|VideoCodec|data|build|배포)(\/|$)/, '원본·작업 폴더'],
];
function forbiddenIn(list) {
  const out = [];
  for (const rel of list) {
    const p = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
    const hit = FORBIDDEN.find(([re]) => re.test(p));
    if (hit) out.push(`${p} (${hit[1]})`);
  }
  return out;
}

// 꼭 있어야 하는 것(앱 폴더 기준)
const REQUIRED = [
  'package.json', 'index.html', 'icon.ico', 'vendor/maplibre-gl/maplibre-gl.js',
  'desktop/main.js', 'desktop/preload.js', 'desktop/private-config.js', 'desktop/wns/server.js',
  ...PRIVATE_FILES.map((f) => 'desktop/private/' + f),
  'desktop/helper/ffmpeg.exe',
  ...SUITE_FONTS.map((f) => 'desktop/helper/fonts/' + f),
];

// 앱이 부르는 파일 중 저장소에는 있는데 설치판에 빠진 것 — index.html 의 src·href, js·css 안의 경로 글자(문서 기준·css 는 ../ 기준).
// srcFiles·appFiles = 경로('/' 구분) 모음. read(rel) = 글자. 돌려주는 것: [빠진 경로]
const REF_OK_MISSING = new Set(['sw.js']);   // 웹판 전용(위)
function missingRefs(srcFiles, appFiles, read) {
  const src = new Set(srcFiles), app = new Set(appFiles), miss = new Set();
  const want = (ref, fromCss) => {
    let r = String(ref).split(/[?#]/)[0].trim();
    if (!r || /^[a-z]+:/i.test(r) || r.startsWith('//') || r.startsWith('/')) return;
    if (fromCss) { if (!r.startsWith('../')) return; r = r.slice(3); }
    r = r.replace(/^\.\//, '');
    if (/^(tests|tools|docs|desktop)\//.test(r)) return;   // 주석 속 개발 파일 이름(app:// 로 부르지 않음 — desktop/ 은 app:// 가 막는다)
    if (src.has(r) && !app.has(r) && !REF_OK_MISSING.has(r)) miss.add(r);
  };
  const html = read('index.html');
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)) want(m[1], false);
  const PATHY = /['"`(]((?:\.\.\/)?(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:js|css|png|svg|ico|otf|ttf|woff2?|webmanifest|json|txt))['"`)]/g;
  for (const rel of appFiles) {
    if (!/^(js\/.*\.js|css\/.*\.css|index\.html)$/.test(rel)) continue;
    const t = read(rel), css = rel.endsWith('.css');
    for (const m of t.matchAll(PATHY)) want(m[1], css && m[1].startsWith('../'));
  }
  return [...miss].sort();
}

// 설치 시험판(--installtest): 설치판이 깔려 있거나 켜져 있는 PC 에서 설치·실행·제거를 시험할 때. 앱 내용은 같고 이름만 다르다 —
// electron-builder 설치·제거 프로그램은 같은 appId 의 기존 설치(모든 사용자 설치면 관리자 권한으로)를 지우고 올리며, 실행 중인 같은 exe 이름('날씨 CG.exe')을
// 이 사용자 것 전부 끈다. 이름을 바꾸면 사용자 설치판·실행 중인 앱·사용자 데이터를 건드리지 않는다. 결과는 준비 폴더에만(--dist 로 복사 안 함).
const INSTALLTEST = { appId: APP_ID + '.installtest', productName: '날씨 CG 설치시험', name: 'weathercg-installtest', artifact: 'WeatherCG-Setup-${version}-installtest.exe' };
const namesFor = (installtest) => (installtest ? INSTALLTEST : { appId: APP_ID, productName: PRODUCT_NAME, name: PACKAGE_NAME, artifact: ARTIFACT });

// electron-builder 설정. o = { appDir, outDir, resDir, version, electronVersion, electronDist?, nsh, installtest? }
function builderConfig(o) {
  const icon = path.join(o.appDir, 'icon.ico');
  const N = namesFor(o.installtest);
  return {
    appId: N.appId,
    productName: N.productName,
    copyright: 'SBS',
    directories: { app: o.appDir, output: o.outDir, buildResources: o.resDir },
    electronVersion: o.electronVersion,
    ...(o.electronDist ? { electronDist: o.electronDist } : {}),
    electronLanguages: ['ko', 'en-US'],       // 크로미움 내장 글(우클릭 메뉴 등) — 한국어·영어만(나머지 50여 개 언어 파일 빼서 약 45MB 줄임)
    asar: true,
    asarUnpack: ['desktop/helper/**'],        // ffmpeg.exe·SUITE 폰트 — 다른 프로그램(ffmpeg 실행·폰트 복사)이 진짜 파일로 읽는다
    files: ['**/*'],                          // app\ 은 이미 고른 것만 들어 있다(위 appFileFilter + 더한 파일)
    npmRebuild: false, nodeGypRebuild: false, buildDependenciesFromSource: false,
    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
      icon,
      signAndEditExecutable: true,            // 서명 인증서는 없음 — exe 아이콘·버전 정보(rcedit)만 넣는다
      requestedExecutionLevel: 'asInvoker',
    },
    nsis: {
      oneClick: false,                        // 순서 있는 설치(설치 위치 고르기)
      perMachine: false,                      // 이 사용자만(관리자 권한 없이) — installer.nsh 가 고르기 화면을 없앤다(임시판을 '모든 사용자'로 깐 PC 만 그 자리에 덮어 올림)
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: N.productName,
      menuCategory: false,
      runAfterFinish: true,
      deleteAppDataOnUninstall: false,        // 지워도 작업·설정(%APPDATA%\날씨 CG)은 남긴다 — 다시 깔면 그대로
      artifactName: N.artifact,
      installerIcon: icon, uninstallerIcon: icon, installerHeaderIcon: icon,
      language: '1042', installerLanguages: ['ko_KR'], multiLanguageInstaller: false,
      include: o.nsh,
      differentialPackage: false,             // 자동 업데이트(blockmap) 없음
    },
    publish: null,
  };
}

// ---------- 실행 도우미 ----------
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const flag = (k) => args.includes(`--${k}`);
const log = (...a) => console.log('[build]', ...a);
function die(msg) { console.error('[build] 멈춤: ' + msg); process.exit(1); }
function run(cmd, argv, o = {}) {
  const r = spawnSync(cmd, argv, { encoding: o.encoding === null ? null : 'utf8', maxBuffer: 1 << 30, windowsHide: true, ...o });
  if (r.error) throw r.error;
  if (r.status !== 0 && !o.allowFail) throw new Error(`${cmd} ${argv.join(' ')} → ${r.status}\n${String(r.stderr || '').slice(-2000)}`);
  return r;
}
const git = (...a) => run('git', ['-C', ROOT, '-c', 'core.quotepath=false', ...a]).stdout.trim();
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const mb = (n) => Math.round(n / 1048576 * 10) / 10;

// 비공개 키 폴더 — --private, 아니면 이 저장소의 desktop\private, 아니면(워크트리) 본 저장소의 desktop\private
function privateDir() {
  const cands = [opt('private', ''), path.join(ROOT, 'desktop', 'private')];
  try { cands.push(path.join(path.dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir')), 'desktop', 'private')); } catch (e) { /* git 없음 */ }
  return cands.filter(Boolean).find((d) => PRIVATE_FILES.every((f) => { try { return fs.statSync(path.join(d, f)).size > 0; } catch (e) { return false; } })) || null;
}
// ffmpeg — --ffmpeg, 아니면 파이썬 헬퍼 실행 사본, 공용 R:, 저장소 desktop\helper
function ffmpegSrc() {
  const la = process.env.LOCALAPPDATA;
  const cands = [opt('ffmpeg', ''), la && path.join(la, 'WNS_Helper', 'ffmpeg.exe'), 'R:\\[F]_Util\\WNS\\ffmpeg.exe', path.join(ROOT, 'desktop', 'helper', 'ffmpeg.exe')];
  return cands.filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}
// electron-builder — 저장소 밖 도구 폴더에. 없거나 판이 다르면 npm 으로 받는다
function ensureTools(dir) {
  const pj = path.join(dir, 'node_modules', 'electron-builder', 'package.json');
  try { if (JSON.parse(fs.readFileSync(pj, 'utf8')).version === BUILDER_VERSION) return; } catch (e) { /* 없음 */ }
  if (path.resolve(dir).toLowerCase().startsWith(ROOT.toLowerCase() + path.sep)) die('--tools 는 저장소 밖이어야 합니다(desktop\\node_modules 금지): ' + dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'wcg-build-tools', private: true, dependencies: { 'electron-builder': BUILDER_VERSION } }, null, 2));
  log(`빌드 도구 받기: electron-builder ${BUILDER_VERSION} → ${dir}`);
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, shell: process.platform === 'win32', stdio: 'inherit', encoding: null });
}

async function main() {
  const ref = opt('ref', 'HEAD');
  const work = path.resolve(opt('work', path.join(os.tmpdir(), 'wcg-installer-build')));
  const toolsDir = path.resolve(opt('tools', path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'WeatherCG-build', 'tools')));
  const distDir = path.resolve(opt('dist', path.join(ROOT, 'desktop', 'dist')));
  const installtest = flag('installtest');
  const N = namesFor(installtest);
  if (work.toLowerCase().startsWith(ROOT.toLowerCase() + path.sep)) die('--work 는 저장소 밖이어야 합니다: ' + work);
  if (installtest) log(`설치 시험판: 이름 '${N.productName}'·appId ${N.appId} — 앱 내용은 정식과 같음, --dist 로 복사 안 함`);

  // 1) 커밋 꺼내기
  const commit = git('rev-parse', '--verify', ref + '^{commit}');
  const dirty = git('status', '--porcelain', '--untracked-files=no', '--', 'index.html', 'js', 'css', 'desktop', 'FontNew', 'vendor', '*.js');
  if (dirty) log(`알림: 커밋하지 않은 고침이 있습니다 — 설치판에는 커밋 ${commit.slice(0, 7)} 내용만 들어갑니다\n${dirty}`);
  const srcDir = path.join(work, 'src'), appDir = path.join(work, 'app'), outDir = path.join(work, installtest ? 'out-installtest' : 'out'), resDir = path.join(work, 'build-res');
  for (const d of [srcDir, appDir, outDir, resDir]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
  const tarFile = path.join(work, 'src.tar');
  run('git', ['-C', ROOT, 'archive', '--format=tar', '-o', tarFile, commit]);
  // 윈도 기본 tar(bsdtar)는 git archive 의 한글 이름(UTF-8)을 그대로 두면 '빈 경로'로 못 푼다 → hdrcharset=UTF-8
  const winTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  if (process.platform === 'win32' && fs.existsSync(winTar)) run(winTar, ['--options', 'tar:hdrcharset=UTF-8', '-xf', tarFile, '-C', srcDir]);
  else run('tar', ['-xf', tarFile, '-C', srcDir]);
  fs.rmSync(tarFile, { force: true });
  const srcFiles = walk(srcDir);
  const deskPkg = JSON.parse(fs.readFileSync(path.join(srcDir, 'desktop', 'package.json'), 'utf8'));
  const version = deskPkg.version;
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) die('desktop/package.json version 이 x.y.z 꼴이 아닙니다: ' + version);
  if (deskPkg.productName !== PRODUCT_NAME) die(`desktop/package.json productName(${deskPkg.productName}) ≠ ${PRODUCT_NAME}`);
  log(`커밋 ${commit.slice(0, 7)} · 판 ${version} · 파일 ${srcFiles.length}개 꺼냄`);

  // 2) 고르기
  const picked = srcFiles.filter(appFileFilter);
  for (const rel of picked) { const d = path.join(appDir, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(srcDir, rel), d); }

  // 3) Git 밖 파일
  const pdir = privateDir();
  if (!pdir) die('비공개 키(desktop\\private\\data-go.key·mapbox.token)를 못 찾았습니다 — --private=<폴더>');
  fs.mkdirSync(path.join(appDir, 'desktop', 'private'), { recursive: true });
  for (const f of PRIVATE_FILES) fs.copyFileSync(path.join(pdir, f), path.join(appDir, 'desktop', 'private', f));   // 값은 출력하지 않는다
  const ff = ffmpegSrc();
  if (!ff) die('ffmpeg.exe 를 못 찾았습니다 — --ffmpeg=<경로>');
  const ffv = run(ff, ['-hide_banner', '-version'], { allowFail: true });
  const ffLine = String(ffv.stdout || '').split(/\r?\n/)[0];
  if (ffv.status !== 0 || !/^ffmpeg version /.test(ffLine)) die('ffmpeg.exe 가 실행되지 않습니다: ' + ff);
  fs.mkdirSync(path.join(appDir, 'desktop', 'helper', 'fonts'), { recursive: true });
  fs.copyFileSync(ff, path.join(appDir, 'desktop', 'helper', 'ffmpeg.exe'));
  for (const f of SUITE_FONTS) {
    const s = path.join(srcDir, 'FontNew', f);
    if (!fs.existsSync(s)) die('SUITE 폰트가 FontNew 에 없습니다: ' + f);
    fs.copyFileSync(s, path.join(appDir, 'desktop', 'helper', 'fonts', f));
  }
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
    name: N.name, productName: N.productName, version, private: true,
    description: 'SBS 날씨 CG 메이커', author: 'SBS', main: 'desktop/main.js',
  }, null, 2) + '\n');

  // 4) 점검
  const appFiles = walk(appDir);
  const bad = forbiddenIn(appFiles);
  if (bad.length) die('넣으면 안 되는 파일:\n  ' + bad.join('\n  '));
  const lack = REQUIRED.filter((r) => !appFiles.includes(r));
  if (lack.length) die('빠진 필수 파일:\n  ' + lack.join('\n  '));
  const miss = missingRefs(srcFiles, appFiles, (rel) => fs.readFileSync(path.join(fs.existsSync(path.join(appDir, rel)) ? appDir : srcDir, rel), 'utf8'));
  if (miss.length) die('앱이 부르는데 설치판에서 빠진 파일(appFileFilter 를 고칠 것):\n  ' + miss.join('\n  '));
  const appBytes = appFiles.reduce((n, r) => n + fs.statSync(path.join(appDir, r)).size, 0);
  log(`앱 ${appFiles.length}개 · ${mb(appBytes)}MB (ffmpeg ${mb(fs.statSync(ff).size)}MB 포함) — ${ffLine}`);
  if (flag('stage-only')) { log('--stage-only: 여기까지(설치 파일은 굽지 않음) → ' + appDir); return; }

  // 5) 굽기
  ensureTools(toolsDir);
  const nsh = path.join(srcDir, 'tools', 'installer', 'installer.nsh');
  if (!fs.existsSync(nsh)) die('tools/installer/installer.nsh 가 커밋에 없습니다');
  let electronVersion = String((deskPkg.devDependencies || {}).electron || '').replace(/^[^\d]*/, '');
  let electronDist = opt('electron-dist', '');
  const localDist = path.join(ROOT, 'desktop', 'node_modules', 'electron', 'dist');
  try { electronVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'desktop', 'node_modules', 'electron', 'package.json'), 'utf8')).version || electronVersion; } catch (e) { /* 개발판 electron 없음 */ }
  if (!electronDist && !flag('download-electron')) {
    let v = ''; try { v = fs.readFileSync(path.join(localDist, 'version'), 'utf8').trim(); } catch (e) { /* 없음 */ }
    if (v && v === electronVersion && fs.existsSync(path.join(localDist, 'electron.exe'))) electronDist = localDist;   // 개발판과 같은 Electron — 복사만(읽기)
  }
  if (!/^\d+\.\d+\.\d+$/.test(electronVersion)) die('Electron 판을 모릅니다: ' + electronVersion);
  log(`Electron ${electronVersion} ${electronDist ? '← ' + electronDist : '(electron-builder 가 받음)'}`);
  const config = builderConfig({ appDir, outDir, resDir, version, electronVersion, electronDist: electronDist || null, nsh, installtest });
  fs.writeFileSync(path.join(work, 'builder-config.json'), JSON.stringify(config, null, 2));
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';   // 인증서 찾지 않음(서명 없음)
  const builder = require(path.join(toolsDir, 'node_modules', 'electron-builder'));
  await builder.build({ projectDir: appDir, targets: builder.Platform.WINDOWS.createTarget(['nsis'], builder.Arch.x64), config, publish: 'never' });

  // 6) 구운 것 점검 + 복사
  const exeName = N.artifact.replace('${version}', version);
  const setup = path.join(outDir, exeName);
  if (!fs.existsSync(setup)) die('설치 파일이 안 생겼습니다: ' + setup);
  const { asarList } = require('./check-installed.cjs');
  const res = path.join(outDir, 'win-unpacked', 'resources');
  const inAsar = asarList(path.join(res, 'app.asar')).filter((x) => !x.unpacked).map((x) => x.path);
  const unpacked = walk(path.join(res, 'app.asar.unpacked'));
  const shipped = [...inAsar, ...unpacked].sort();
  const want = appFiles.slice().sort();
  const extra = shipped.filter((x) => !want.includes(x)), gone = want.filter((x) => !shipped.includes(x));
  const bad2 = forbiddenIn(shipped);
  if (extra.length || gone.length || bad2.length) die(`asar 목록이 준비한 것과 다릅니다\n  더 들어감: ${extra.join(', ')}\n  빠짐: ${gone.join(', ')}\n  금지: ${bad2.join(', ')}`);
  if (!unpacked.includes('desktop/helper/ffmpeg.exe')) die('ffmpeg.exe 가 asar 밖에 없습니다');
  if (installtest) {
    log(`끝(설치 시험판) — ${setup} (${mb(fs.statSync(setup).size)}MB). 시험: "${exeName}" /S /D=<임시 폴더> → node tools/check-installed.cjs <임시 폴더> → "<임시 폴더>\\Uninstall ${N.productName}.exe" /S`);
    return;
  }
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(setup, path.join(distDir, exeName));
  const info = {
    product: PRODUCT_NAME, appId: APP_ID, version, commit, ref, builtAt: new Date().toISOString(),
    electron: electronVersion, electronBuilder: BUILDER_VERSION, ffmpeg: ffLine, ffmpegSha256: sha256(ff),
    setup: exeName, setupBytes: fs.statSync(setup).size, setupSha256: sha256(setup),
    files: { asar: inAsar.length, unpacked: unpacked.length }, privateKeys: PRIVATE_FILES.length,
  };
  fs.writeFileSync(path.join(distDir, exeName.replace(/\.exe$/, '.build.json')), JSON.stringify(info, null, 2) + '\n');
  log(`끝 — ${path.join(distDir, exeName)} (${mb(info.setupBytes)}MB) · asar ${inAsar.length}개 + 밖 ${unpacked.length}개`);
  log(`설치해 보기 전 점검(설치 없이): node tools/check-installed.cjs "${path.join(outDir, 'win-unpacked')}"`);
}

if (require.main === module) main().catch((e) => { console.error('[build] 실패:', e && e.stack || e); process.exit(1); });
module.exports = { APP_ID, PRODUCT_NAME, PACKAGE_NAME, ARTIFACT, INSTALLTEST, SUITE_FONTS, PRIVATE_FILES, REQUIRED, appFileFilter, forbiddenIn, missingRefs, builderConfig, namesFor };
