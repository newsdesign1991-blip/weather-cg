#!/usr/bin/env node
'use strict';
// 날씨 CG 설치 프로그램(겉 — 우리 설치 창) 굽기 — electron-builder 가 구운 NSIS 설치 파일을 리소스로 품은 WPF exe 를 윈도 기본 .NET Framework 4 csc 로 컴파일한다.
// 설치판 빌드(tools/build-installer.cjs)가 NSIS 를 구운 뒤 부른다. 손으로:
//
//   node tools/build-setup-ui.cjs --payload=<NSIS 설치 파일> --out=<WeatherCG-Setup-<판>.exe> --version=<x.y.z> [--installtest] [--app-files=<앱 파일 수>] [--commit=<커밋>]
//
// 원본: tools/installer/setup-ui/(SetupApp.cs·SetupWindow.xaml·app.manifest), 글꼴은 업데이트 진행 창과 같은 desktop/update-ui/fonts(Wanted Sans NP 3 — 따로 사본 두지 않음),
// 머리 아이콘 icon-192.png, exe 아이콘 icon.ico. 판·이름·GUID·품은 파일 확인값은 빌드가 SetupInfo.cs 로 만들어 함께 컴파일한다(파일 버전 정보 '날씨 CG / 판'도 여기서).
// 왜 이렇게(MODULES.md 10장 '설치 창'): 설치 기능(덮어 설치·'모든 사용자' 관리자 확인·바로 가기·제어판 등록·제거)은 검증된 NSIS 를 그대로 쓰고 겉 창만 우리 것으로 —
// 조용한 설치(/S — 앱 자동 업데이트)는 받은 명령줄을 그대로 NSIS 에 넘겨 종료 코드까지 같다. csc /resource 는 180MB 넘는 파일도 담는다(영상 플레이어 설치 프로그램도 130MB 를 리소스로 품음).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const BU = require('./build-update-ui.cjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = ['SetupApp.cs'];
const REFS = [...BU.REFS, 'System.Windows.Forms.dll'];
const NS_UUID = '50e065bc-3134-11e6-9bab-38c9862bdaf3';   // electron-builder ELECTRON_BUILDER_NS_UUID(NsisTarget.js) — APP_GUID = UUID v5(appId, 이것)

// electron-builder 와 같은 APP_GUID(설치 등록 Software\<GUID>·제어판 Uninstall\<GUID>)
function appGuid(appId) {
  const ns = Buffer.from(NS_UUID.replace(/-/g, ''), 'hex');
  const h = crypto.createHash('sha1').update(Buffer.concat([ns, Buffer.from(String(appId), 'utf8')])).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
// 품은 NSIS 를 풀 때 쓰는 이름(겉과 다르게 — 작업 관리자·관리자 확인 창에 보임)
const innerName = (version, variant) => `WeatherCG-Setup-${version}${variant ? '-' + variant : ''}-nsis.exe`;

const csStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"';
// 빌드 때 정해지는 값(순수 — 시험용). i = { version, product, exeName, guid, dirName, variant, inner, payloadSize, payloadSha256, appFiles, commit }
function setupInfoCs(i) {
  if (!/^\d+\.\d+\.\d+$/.test(i.version || '')) throw new Error('판이 x.y.z 꼴이 아닙니다: ' + i.version);
  if (!/^[0-9a-f]{64}$/.test(i.payloadSha256 || '')) throw new Error('품은 파일 sha256 이 이상합니다');
  const v4 = i.version + '.0';
  return [
    '// 빌드(tools/build-setup-ui.cjs)가 만든 파일 — 손으로 고치지 않는다.',
    'using System.Reflection;',
    `[assembly: AssemblyTitle(${csStr(i.product + ' 설치')})]`,
    `[assembly: AssemblyDescription(${csStr(i.product + ' ' + i.version + ' 설치 프로그램')})]`,
    '[assembly: AssemblyCompany("SBS")]',
    `[assembly: AssemblyProduct(${csStr(i.product)})]`,
    '[assembly: AssemblyCopyright("SBS")]',
    `[assembly: AssemblyVersion("${v4}")]`,
    `[assembly: AssemblyFileVersion("${v4}")]`,
    `[assembly: AssemblyInformationalVersion("${i.version}")]`,
    'namespace WeatherCGSetup',
    '{',
    '    static class SetupInfo',
    '    {',
    `        public const string Version = ${csStr(i.version)};`,
    `        public const string Product = ${csStr(i.product)};`,
    `        public const string ExeName = ${csStr(i.exeName)};`,
    `        public const string Guid = ${csStr(i.guid)};`,
    `        public const string DirName = ${csStr(i.dirName)};`,
    `        public const string Variant = ${csStr(i.variant || '')};`,
    `        public const string InnerName = ${csStr(i.inner)};`,
    `        public const long PayloadSize = ${Math.floor(i.payloadSize)}L;`,
    `        public const string PayloadSha256 = ${csStr(i.payloadSha256)};`,
    `        public const int AppFiles = ${Math.max(0, Math.floor(i.appFiles || 0))};`,
    `        public const string Commit = ${csStr(i.commit || '')};`,
    '    }',
    '}',
    '',
  ].join('\r\n');
}

// csc 인자(순수 — 시험용). o = { dir, src, out, icon, iconPng, fontsDir, info, payload }
function cscArgs(o) {
  const a = ['/nologo', '/target:winexe', '/optimize+', '/platform:anycpu', '/codepage:65001', '/utf8output', '/warn:4',
    `/out:${o.out}`, `/win32manifest:${path.join(o.src, 'app.manifest')}`];
  if (o.icon) a.push(`/win32icon:${o.icon}`);
  for (const r of REFS) a.push(`/reference:${/^(Presentation|WindowsBase)/.test(r) ? path.join(o.dir, 'WPF', r) : path.join(o.dir, r)}`);
  a.push(`/resource:${path.join(o.src, 'SetupWindow.xaml')},WeatherCGSetup.SetupWindow.xaml`);
  a.push(`/resource:${o.iconPng},WeatherCGSetup.icon.png`);
  for (const f of BU.FONT_FILES) a.push(`/resource:${path.join(o.fontsDir, f)},WeatherCGSetup.fonts.${f}`);
  a.push(`/resource:${o.payload},WeatherCGSetup.payload.exe`);
  for (const s of SOURCES) a.push(path.join(o.src, s));
  a.push(o.info);
  return a;
}

function sha256File(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 22);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

// 굽기 → { ok, out, bytes, sha256, info, check, log }. o = { payload, out, version, product, exeName, appId, dirName, variant, appFiles, commit, root?, check? }
function buildSetupUi(o) {
  const root = path.resolve(o.root || ROOT);
  const src = path.join(root, 'tools', 'installer', 'setup-ui');
  const fontsDir = path.join(root, 'desktop', 'update-ui', 'fonts');
  const icon = path.join(root, 'icon.ico'), iconPng = path.join(root, 'icon-192.png');
  const need = [...SOURCES, 'SetupWindow.xaml', 'app.manifest'].map((f) => path.join(src, f)).concat(BU.FONT_FILES.map((f) => path.join(fontsDir, f)), [icon, iconPng]);
  const lack = need.filter((f) => !fs.existsSync(f));
  if (lack.length) return { ok: false, log: '설치 창 원본이 모자람: ' + lack.join(', ') };
  const payload = path.resolve(o.payload || '');
  if (!o.payload || !fs.existsSync(payload)) return { ok: false, log: '품을 NSIS 설치 파일이 없습니다: ' + o.payload };
  const c = BU.findCsc();
  if (!c) return { ok: false, log: '.NET Framework 4 C# 컴파일러(csc.exe)·WPF 를 못 찾았습니다(%SystemRoot%\\Microsoft.NET\\Framework64\\v4.0.30319)' };
  const info = {
    version: o.version, product: o.product, exeName: o.exeName || (o.product + '.exe'), guid: appGuid(o.appId), dirName: o.dirName, variant: o.variant || '',
    inner: innerName(o.version, o.variant), payloadSize: fs.statSync(payload).size, payloadSha256: sha256File(payload), appFiles: o.appFiles || 0, commit: o.commit || '',
  };
  let infoCs;
  try { infoCs = setupInfoCs(info); } catch (e) { return { ok: false, log: e.message }; }
  const out = path.resolve(o.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-setup-ui-build-'));
  const infoFile = path.join(tmpDir, 'SetupInfo.cs');
  fs.writeFileSync(infoFile, '\uFEFF' + infoCs, 'utf8');
  const tmp = out + '.building-' + process.pid + '.exe';
  try {
    const r = spawnSync(c.csc, cscArgs({ dir: c.dir, src, out: tmp, icon, iconPng, fontsDir, info: infoFile, payload }), { encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 1 << 26 });
    const log = String(r.stdout || '') + String(r.stderr || '');
    if (r.error || r.status !== 0 || !fs.existsSync(tmp)) { fs.rmSync(tmp, { force: true }); return { ok: false, log: 'csc 실패(' + (r.error ? r.error.message : r.status) + ')\n' + log }; }
    if (/warning CS/i.test(log) && o.strict) { fs.rmSync(tmp, { force: true }); return { ok: false, log: '경고가 있습니다(--strict)\n' + log }; }
    let check = null;
    if (o.check !== false) {
      const cj = path.join(tmpDir, 'check.json'), fd = path.join(tmpDir, 'fonts');
      const rr = spawnSync(tmp, [`--check=${cj}`, `--fonts-dir=${fd}`], { windowsHide: true, timeout: 120000 });
      try { check = JSON.parse(fs.readFileSync(cj, 'utf8')); } catch (e) { check = { ok: false, error: 'check 결과 없음(종료 ' + rr.status + ')' }; }
      if (!check.ok || check.version !== info.version || check.payloadBytes !== info.payloadSize) {
        fs.rmSync(tmp, { force: true });
        return { ok: false, log: '구운 설치 프로그램 점검 실패: ' + JSON.stringify(check) + '\n' + log };
      }
    }
    fs.rmSync(out, { force: true });
    fs.renameSync(tmp, out);
    return { ok: true, out, bytes: fs.statSync(out).size, sha256: sha256File(out), info, check, csc: c.csc, log: log.trim() };
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const B = require('./build-installer.cjs');
  const N = B.namesFor(args.includes('--installtest'));
  const r = buildSetupUi({ payload: opt('payload', ''), out: opt('out', ''), version: opt('version', ''), product: N.productName, appId: N.appId, dirName: N.name,
    variant: args.includes('--installtest') ? 'installtest' : '', appFiles: +opt('app-files', '0') || 0, commit: opt('commit', ''), strict: args.includes('--strict') });
  console.log(JSON.stringify({ ...r, info: r.info }, null, 2));
  process.exit(r.ok ? 0 : 1);
}
module.exports = { SOURCES, REFS, NS_UUID, appGuid, innerName, setupInfoCs, cscArgs, buildSetupUi, sha256File };
