#!/usr/bin/env node
'use strict';
// 업데이트 진행 창(WeatherCG-Update.exe) 굽기 — 윈도에 기본으로 있는 .NET Framework 4 C# 컴파일러(csc.exe)로 desktop/update-ui/ 를 컴파일한다.
// 설치판 빌드(tools/build-installer.cjs)가 커밋에서 꺼낸 원본으로 부르고(desktop\helper\WeatherCG-Update.exe — asar 밖), 개발 때는 손으로:
//
//   node tools/build-update-ui.cjs [--out=<exe>] [--src=<desktop/update-ui 폴더>] [--icon=<ico>]   (기본 --out = desktop\helper\WeatherCG-Update.exe — Git 제외 폴더)
//
// 왜 .NET Framework 4 + WPF 인가(MODULES.md 10장 '앱 업데이트 — 진행 창'): 앱이 꺼진 뒤에도 떠 있어야 하고 설치 폴더 밖(%TEMP%)에서 돌아야 한다.
//  · Electron 창은 설치 폴더의 날씨 CG.exe 그 자체라 설치 프로그램이 덮어쓰지 못한다.
//  · PowerShell + WPF 스크립트는 회사 PC 실행 정책(Restricted·AllSigned)·AppLocker 스크립트 규칙·보안 프로그램에 자주 막힌다.
//  · .NET Framework 4.8 은 윈도 10·11 에 늘 들어 있어(따로 설치 없음) exe 하나(글꼴 포함 약 9MB)로 돈다. 컴파일러도 윈도에 있어 빌드 PC 에 따로 설치할 것이 없다.
// csc 는 C# 5 문법까지만 안다($"" 보간·?. ·식 본문 멤버 없음). XAML 은 BAML 로 굽지 않고 exe 에 글자 그대로 넣어 XamlReader 로 읽는다(x:Class 없음).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const UI_EXE = 'WeatherCG-Update.exe';            // desktop/updater.js UI_EXE 와 같게
const FONT_FILES = ['WantedSansNP-Regular.ttf', 'WantedSansNP-Bold.ttf', 'WantedSansNP-ExtraBold.ttf'];
const SOURCES = ['UpdateApp.cs'];
const REFS = ['PresentationFramework.dll', 'PresentationCore.dll', 'WindowsBase.dll', 'System.Xaml.dll', 'System.dll', 'System.Core.dll', 'System.Drawing.dll'];

// csc.exe 와 참조 어셈블리 폴더(.NET Framework 4 — 64비트 먼저)
function findCsc(o = {}) {
  const win = o.windir || process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  const exists = o.exists || ((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
  for (const fw of ['Framework64', 'Framework']) {
    const dir = path.join(win, 'Microsoft.NET', fw, 'v4.0.30319');
    if (exists(path.join(dir, 'csc.exe')) && exists(path.join(dir, 'WPF', 'PresentationFramework.dll'))) return { csc: path.join(dir, 'csc.exe'), dir };
  }
  return null;
}
// 참조 경로 — WPF 셋은 WPF 하위 폴더, 나머지는 프레임워크 폴더
function refPaths(dir) {
  return REFS.map((r) => (/^(Presentation|WindowsBase)/.test(r) ? path.join(dir, 'WPF', r) : path.join(dir, r)));
}
// csc 인자(순수 — 시험용). o = { dir, src, out, icon, iconPng } — iconPng = 머리 로고(10-21 — 근무표 업데이트 창처럼)
function cscArgs(o) {
  const a = ['/nologo', '/target:winexe', '/optimize+', '/platform:anycpu', '/codepage:65001', '/utf8output', '/warn:4',
    `/out:${o.out}`, `/win32manifest:${path.join(o.src, 'app.manifest')}`];
  if (o.icon) a.push(`/win32icon:${o.icon}`);
  for (const r of refPaths(o.dir)) a.push(`/reference:${r}`);
  a.push(`/resource:${path.join(o.src, 'UpdateWindow.xaml')},WeatherCGUpdate.UpdateWindow.xaml`);
  if (o.iconPng) a.push(`/resource:${o.iconPng},WeatherCGUpdate.icon.png`);
  for (const f of FONT_FILES) a.push(`/resource:${path.join(o.src, 'fonts', f)},WeatherCGUpdate.fonts.${f}`);
  for (const s of SOURCES) a.push(path.join(o.src, s));
  return a;
}
// 굽기 → { ok, out, bytes, sha256, csc, log } (실패면 ok:false·log). check=true 면 구운 exe 를 --check 로 한 번 돌려 본다(XAML·글꼴 3)
function buildUpdateUi(o = {}) {
  const src = path.resolve(o.src || path.join(ROOT, 'desktop', 'update-ui'));
  const out = path.resolve(o.out || path.join(ROOT, 'desktop', 'helper', UI_EXE));
  const icon = o.icon === null ? null : path.resolve(o.icon || path.join(path.dirname(path.dirname(src)), 'icon.ico'));
  const iconPng = path.join(path.dirname(path.dirname(src)), 'icon-192.png');   // 앱 로고(설치 창 tools/build-setup-ui.cjs 머리 아이콘과 같은 그림)
  const need = ['UpdateApp.cs', 'UpdateWindow.xaml', 'app.manifest', ...FONT_FILES.map((f) => path.join('fonts', f))];
  const lack = need.filter((f) => !fs.existsSync(path.join(src, f)));
  if (lack.length) return { ok: false, log: '진행 창 원본이 모자람: ' + lack.join(', ') };
  const c = findCsc();
  if (!c) return { ok: false, log: '.NET Framework 4 C# 컴파일러(csc.exe)·WPF 를 못 찾았습니다(%SystemRoot%\\Microsoft.NET\\Framework64\\v4.0.30319)' };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = out + '.building-' + process.pid + '.exe';
  const r = spawnSync(c.csc, cscArgs({ dir: c.dir, src, out: tmp, icon: icon && fs.existsSync(icon) ? icon : null, iconPng: fs.existsSync(iconPng) ? iconPng : null }), { encoding: 'utf8', windowsHide: true, timeout: 180000 });
  const log = String(r.stdout || '') + String(r.stderr || '');
  if (r.error || r.status !== 0 || !fs.existsSync(tmp)) { fs.rmSync(tmp, { force: true }); return { ok: false, log: 'csc 실패(' + (r.error ? r.error.message : r.status) + ')\n' + log }; }
  if (/warning CS/i.test(log) && o.strict) { fs.rmSync(tmp, { force: true }); return { ok: false, log: '경고가 있습니다(--strict)\n' + log }; }
  let check = null;
  if (o.check !== false) {
    const cj = path.join(os.tmpdir(), `wcg-update-ui-check-${process.pid}-${Date.now()}.json`);
    const fd = path.join(os.tmpdir(), `wcg-update-ui-check-fonts-${process.pid}-${Date.now()}`);
    const rr = spawnSync(tmp, [`--check=${cj}`, `--fonts-dir=${fd}`], { windowsHide: true, timeout: 60000 });
    try { check = JSON.parse(fs.readFileSync(cj, 'utf8')); } catch (e) { check = { ok: false, error: 'check 결과 없음(종료 ' + rr.status + ')' }; }
    fs.rmSync(cj, { force: true }); fs.rmSync(fd, { recursive: true, force: true });
    if (!check.ok) { fs.rmSync(tmp, { force: true }); return { ok: false, log: '구운 진행 창 점검 실패: ' + JSON.stringify(check) + '\n' + log }; }
  }
  fs.rmSync(out, { force: true });
  fs.renameSync(tmp, out);
  const buf = fs.readFileSync(out);
  return { ok: true, out, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), csc: c.csc, check, log: log.trim() };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const r = buildUpdateUi({ out: opt('out', ''), src: opt('src', ''), icon: opt('icon', ''), strict: args.includes('--strict') });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
module.exports = { UI_EXE, FONT_FILES, SOURCES, REFS, findCsc, refPaths, cscArgs, buildUpdateUi };
