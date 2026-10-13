// 설치 창(겉 설치 프로그램 — 10-13): tools/build-setup-ui.cjs(GUID·SetupInfo·csc 인자)·tools/installer/setup-ui(SetupApp.cs·SetupWindow.xaml) 글자 검사,
// 이 PC 에 .NET Framework 4 컴파일러가 있으면 가짜 설치 본체(받은 명령줄·작업 폴더를 적고 정한 종료 코드로 끝나는 작은 exe)를 품게 실제로 굽고
// 조용한 설치(/S)가 명령줄을 한 글자도 안 바꾸고 넘기는지·종료 코드가 그대로인지·푼 폴더를 지우는지 본다. 창 흐름은 사람이(또는 AI 가 UI 자동화로) 설치 시험판으로.
// MODULES.md 10장 '설치 창'.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const S = require('../../tools/build-setup-ui.cjs');
const BU = require('../../tools/build-update-ui.cjs');
const B = require('../../tools/build-installer.cjs');
const U = require('../updater.js');

const root = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const cs = read('tools/installer/setup-ui/SetupApp.cs');
const xaml = read('tools/installer/setup-ui/SetupWindow.xaml');

test('GUID — electron-builder 와 같은 UUID v5(설치 등록 Software\\<GUID>·제어판 Uninstall\\<GUID>)', () => {
  assert.equal(S.appGuid(B.APP_ID), '809d0877-ffb3-55fc-ae04-cfdfe5a15fd7');
  assert.equal(S.appGuid(B.INSTALLTEST.appId), '0e7070cc-158c-59a1-b8f2-3cd1169bd0a3');
  assert.equal(S.innerName('1.0.3', ''), 'WeatherCG-Setup-1.0.3-nsis.exe');
  assert.equal(S.innerName('1.0.3', 'installtest'), 'WeatherCG-Setup-1.0.3-installtest-nsis.exe');
  assert.equal(U.parseSetupName(S.innerName('1.0.3', '')), null, '품은 파일 이름은 업데이트 폴더 이름 꼴이 아니다(섞여 올라가지 않게)');
});

test('SetupInfo.cs — 파일 버전 정보(날씨 CG / 판)·이름·GUID·품은 파일 확인값, 판·확인값이 이상하면 거절', () => {
  const info = { version: '1.0.3', product: '날씨 CG', exeName: '날씨 CG.exe', guid: S.appGuid(B.APP_ID), dirName: 'weathercg-desktop', variant: '',
    inner: S.innerName('1.0.3', ''), payloadSize: 184688406, payloadSha256: 'a'.repeat(64), appFiles: 31, commit: 'abc1234' };
  const t = S.setupInfoCs(info);
  assert.match(t, /\[assembly: AssemblyTitle\("날씨 CG 설치"\)\]/);
  assert.match(t, /\[assembly: AssemblyProduct\("날씨 CG"\)\]/);
  assert.match(t, /\[assembly: AssemblyFileVersion\("1\.0\.3\.0"\)\]/);
  assert.match(t, /\[assembly: AssemblyInformationalVersion\("1\.0\.3"\)\]/);
  assert.match(t, /public const long PayloadSize = 184688406L;/);
  assert.match(t, /public const string Guid = "809d0877-ffb3-55fc-ae04-cfdfe5a15fd7";/);
  assert.match(t, /public const string DirName = "weathercg-desktop";/);
  assert.match(t, /public const int AppFiles = 31;/);
  assert.throws(() => S.setupInfoCs({ ...info, version: '1.0' }));
  assert.throws(() => S.setupInfoCs({ ...info, payloadSha256: 'x' }));
  assert.match(S.setupInfoCs({ ...info, product: 'a"b\\c' }), /"a\\"b\\\\c 설치"/, 'C# 글자 이스케이프');
});

test('csc 인자 — XAML·아이콘 PNG·글꼴 3(업데이트 진행 창과 같은 파일)·품은 NSIS·매니페스트·exe 아이콘·SetupInfo', () => {
  const a = S.cscArgs({ dir: 'C:\\W\\F64', src: 'D:\\r\\tools\\installer\\setup-ui', out: 'D:\\o\\S.exe', icon: 'D:\\r\\icon.ico', iconPng: 'D:\\r\\icon-192.png',
    fontsDir: 'D:\\r\\desktop\\update-ui\\fonts', info: 'T:\\SetupInfo.cs', payload: 'D:\\o\\nsis\\S.exe' });
  assert.ok(a.includes('/target:winexe') && a.includes('/out:D:\\o\\S.exe') && a.includes('/win32icon:D:\\r\\icon.ico'));
  assert.ok(a.includes('/win32manifest:' + path.join('D:\\r\\tools\\installer\\setup-ui', 'app.manifest')));
  assert.ok(a.includes('/resource:D:\\o\\nsis\\S.exe,WeatherCGSetup.payload.exe'));
  assert.ok(a.includes('/resource:D:\\r\\icon-192.png,WeatherCGSetup.icon.png'));
  assert.ok(a.includes(`/resource:${path.join('D:\\r\\tools\\installer\\setup-ui', 'SetupWindow.xaml')},WeatherCGSetup.SetupWindow.xaml`));
  assert.equal(a.filter((x) => /,WeatherCGSetup\.fonts\.WantedSansNP-.+\.ttf$/.test(x)).length, 3);
  assert.ok(a.includes('/reference:' + path.join('C:\\W\\F64', 'System.Windows.Forms.dll')));
  assert.ok(a.includes('/reference:' + path.join('C:\\W\\F64', 'WPF', 'PresentationFramework.dll')));
  assert.equal(a[a.length - 1], 'T:\\SetupInfo.cs');
  for (const f of BU.FONT_FILES) assert.ok(fs.existsSync(path.join(root, 'desktop', 'update-ui', 'fonts', f)), f);
});

test('설치 프로그램 글자 — 조용한 설치는 받은 꼬리 그대로·종료 코드 그대로, 창은 /currentuser|/allusers /D= 마지막, 이름으로 끄지 않음', () => {
  // 조용한 설치: NSIS 와 같은 '/S' 기준, 프로그램 경로 뺀 명령줄 꼬리를 그대로
  assert.match(cs, /foreach \(string a in args\) if \(a == "\/S"\) return true;/);
  assert.match(cs, /if \(Cmd\.Silent\(args\)\) return Silent\.Run\(tail\);/);
  assert.match(cs, /var psi = new ProcessStartInfo\(inner, tail\) \{ UseShellExecute = false, WorkingDirectory = work \};/);
  assert.match(cs, /p\.WaitForExit\(\);\n\s*code = p\.ExitCode;/);
  assert.match(cs, /Log\.Write\("끝 — 종료 코드 " \+ code \+ ", " \+ sw\.ElapsedMilliseconds \+ "ms"\);\n\s*return code;/);
  // 창: 설치 방식은 electron-builder 설치 화면(installer.nsh customInstallMode)과 같게 — HKCU 에 있으면 이 사용자, HKLM 에만 있으면 모든 사용자
  assert.match(cs, /string args = "\/S " \+ \(_perMachine \? "\/allusers" : "\/currentuser"\) \+ " \/D=" \+ _dir;/);
  assert.match(cs, /if \(u != null\) r\.Dir = u;\n\s*else if \(m != null\) \{ r\.Dir = m; r\.PerMachine = true; \}/);
  assert.match(cs, /RegistryKey\.OpenBaseKey\(hive, RegistryView\.Registry64\)/);
  assert.match(cs, /root\.OpenSubKey\(@"Software\\" \+ SetupInfo\.Guid\)/);
  assert.match(cs, /GetValue\("InstallLocation"\)/);
  // 켜진 앱은 창에 닫기만 요청(저장 묻기는 앱이) — 강제로 끄지 않는다
  assert.match(cs, /p\.CloseMainWindow\(\);/);
  assert.doesNotMatch(cs.replace(/\/\/.*$/gm, ''), /\.Kill\(|taskkill/i);
  // 품은 파일 확인(sha256)·도는 중 못 닫음·끝 화면·관리자 확인 안내·판 안내
  assert.match(cs, /if \(got != SetupInfo\.PayloadSha256\)/);
  assert.match(cs, /if \(_running\) \{ e\.Cancel = true; return; \}/);
  for (const s of ['"처음 설치해요"', '"다시 설치"', '"낮은 판으로 바꾸기"', '"업데이트"', '"설치가 끝났어요"', '"설치하지 못했어요"', '"다시 시도"', '" 실행"',
    '"관리자 확인 창이 뜨면 [예]를 눌러 주세요."', '"관리자 확인 창에서 [예]를 눌러 주세요…"']) assert.ok(cs.includes(s), s);
  // 앱의 시험용 환경 변수는 새로 켜는 앱에 안 넘김
  assert.match(cs, /k\.StartsWith\("WCG_", StringComparison\.OrdinalIgnoreCase\) \|\| k\.StartsWith\("ELECTRON_", StringComparison\.OrdinalIgnoreCase\)/);
  // XAML 이름 = 코드가 찾는 이름, 이벤트·클래스 없음, 파랑 강조
  const names = /Names = \{([^}]+)\}/.exec(cs)[1].match(/"([A-Za-z]+)"/g).map((x) => x.slice(1, -1));
  assert.ok(names.length >= 30);
  for (const n of names) assert.match(xaml, new RegExp(`x:Name="${n}"`), n);
  assert.doesNotMatch(xaml.replace(/<!--[\s\S]*?-->/g, ''), /x:Class|Click="|MouseLeftButtonDown="/);
  assert.match(xaml, /#3182F6/);
  assert.match(read('tools/installer/setup-ui/app.manifest'), /level="asInvoker"/, "윈도 '설치 프로그램 짐작'(관리자로 띄움)을 끈다");
  assert.doesNotMatch(cs + xaml, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'UI 글자에 이모지 없음');
  assert.doesNotMatch(cs.replace(/\/\/.*$/gm, ''), /(^|[\s(,=]|\+\s)\$@?"|\w\?\.[A-Za-z]/m, 'C# 5 — 문자열 보간·?. 없음(윈도 기본 csc)');
});

test('빌드 배선 — NSIS 를 굽고 out\\nsis 로 옮겨 품고 같은 이름으로, --nsis-only, 빌드 정보, 업데이트 인자는 그대로', () => {
  const bld = read('tools/build-installer.cjs');
  assert.match(bld, /const \{ buildSetupUi \} = require\('\.\/build-setup-ui\.cjs'\);/);
  assert.match(bld, /const nsisFile = path\.join\(outDir, 'nsis', exeName\);/);
  assert.match(bld, /fs\.renameSync\(setup, nsisFile\);/);
  assert.match(bld, /setupUi = buildSetupUi\(\{ root: srcDir, payload: nsisFile, out: setup, version, product: N\.productName, appId: N\.appId, dirName: N\.name,/, '커밋에서 꺼낸 원본으로 굽는다');
  assert.match(bld, /if \(!flag\('nsis-only'\)\)/);
  assert.match(bld, /setupUi: setupUi \? \{ guid: setupUi\.info\.guid, inner: setupUi\.info\.inner, appFiles: setupUi\.info\.appFiles \} : null, nsis: nsisInfo,/);
  assert.ok(bld.indexOf('buildSetupUi({') < bld.indexOf('fs.copyFileSync(setup, path.join(distDir, exeName));'), '굽고 나서 dist 로 복사(크기·sha256 = 겉)');
  // 앱 자동 업데이트가 넘기는 인자는 그대로(겉이 그대로 NSIS 에 넘김)
  assert.deepEqual(U.INSTALL_ARGS, ['/S', '--updated', '--force-run']);
  const ucs = read('desktop/update-ui/UpdateApp.cs');
  assert.match(ucs, /new ProcessStartInfo\(_o\.Setup, "\/S --updated"\)/);
  // 진행 창은 확인한 설치 파일을 띄우기 바로 전에 놓는다(.NET 설치 프로그램을 잡은 채 띄우면 약 23초 늦게 뜸)
  const inst = ucs.slice(ucs.indexOf('async Task StepInstall()'), ucs.indexOf('bool SetupRunning()'));
  assert.ok(inst.indexOf('ReleaseSetup();') > 0 && inst.indexOf('ReleaseSetup();') < inst.indexOf('p = Process.Start(psi);'));
  // 원본은 앱에 안 담음
  for (const p of ['tools/installer/setup-ui/SetupApp.cs', 'tools/installer/setup-ui/SetupWindow.xaml', 'tools/build-setup-ui.cjs']) assert.equal(B.appFileFilter(p), false, p);
});

// 가짜 설치 본체 — 받은 명령줄·작업 폴더를 WCG_FAKE_NSIS_OUT 에 적고 WCG_FAKE_NSIS_CODE 로 끝남
const FAKE_CS = `using System; using System.IO;
static class P { static int Main() {
  string f = Environment.GetEnvironmentVariable("WCG_FAKE_NSIS_OUT");
  if (f != null) File.WriteAllText(f, Environment.CommandLine + "\\n" + Environment.CurrentDirectory, new System.Text.UTF8Encoding(false));
  int n; return int.TryParse(Environment.GetEnvironmentVariable("WCG_FAKE_NSIS_CODE"), out n) ? n : 0; } }`;

test('실제로 굽기 — 가짜 설치 본체를 품고, 조용한 설치가 명령줄 그대로·종료 코드 그대로·푼 폴더 지움, 스스로 점검', { skip: (process.platform !== 'win32' || !BU.findCsc()) && 'csc 없음', timeout: 300000 }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-setupui-test-'));
  try {
    const c = BU.findCsc();
    fs.writeFileSync(path.join(d, 'fake.cs'), FAKE_CS);
    const fake = path.join(d, 'fake-nsis.exe');
    const r0 = spawnSync(c.csc, ['/nologo', '/target:exe', `/out:${fake}`, path.join(d, 'fake.cs')], { encoding: 'utf8', windowsHide: true });
    assert.equal(r0.status, 0, r0.stdout);
    const out = path.join(d, 'WeatherCG-Setup-9.8.7-installtest.exe');
    const r = S.buildSetupUi({ payload: fake, out, version: '9.8.7', product: B.INSTALLTEST.productName, appId: B.INSTALLTEST.appId, dirName: B.INSTALLTEST.name, variant: 'installtest', appFiles: 12, strict: true });
    assert.equal(r.ok, true, r.log);
    assert.deepEqual({ ok: r.check.ok, xaml: r.check.xaml, fonts: r.check.fonts, family: r.check.family, payload: r.check.payload, icon: r.check.icon, version: r.check.version, fileVersion: r.check.fileVersion },
      { ok: true, xaml: true, fonts: 3, family: 'Wanted Sans NP', payload: true, icon: true, version: '9.8.7', fileVersion: '9.8.7.0' });
    assert.equal(r.info.guid, S.appGuid(B.INSTALLTEST.appId));
    assert.ok(r.bytes > 8000000, '글꼴 셋 + 품은 파일');
    // 조용한 설치: 업데이트(--updated --force-run)·모든 사용자·공백·한글 /D= 그대로, 종료 코드 그대로
    const rec = path.join(d, 'rec.txt');
    for (const [tail, code] of [['/S --updated --force-run', 0], ['/S /allusers /D=C:\\시험 폴더\\날씨 CG', 2], ['/S --updated', 1223]]) {
      fs.rmSync(rec, { force: true });
      // 꼬리를 손으로(windowsVerbatimArguments) — 노드가 따옴표를 더하지 않게(임시 폴더 경로엔 공백 없음)
      const rr = spawnSync(out, [tail], { windowsVerbatimArguments: true, windowsHide: true, timeout: 120000,
        env: { ...process.env, WCG_FAKE_NSIS_OUT: rec, WCG_FAKE_NSIS_CODE: String(code) } });
      assert.equal(rr.status, code, tail + ' → 종료 코드');
      const [cl, cwd] = fs.readFileSync(rec, 'utf8').split('\n');
      const m = /^"([^"]+)" (.*)$/.exec(cl);
      assert.ok(m, cl);
      assert.equal(m[2], tail, '꼬리 그대로');
      assert.equal(path.basename(m[1]), 'WeatherCG-Setup-9.8.7-installtest-nsis.exe');
      assert.equal(path.dirname(m[1]), cwd, '작업 폴더 = 푼 폴더');
      assert.equal(fs.existsSync(cwd), false, '끝나면 푼 폴더를 지운다');
    }
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
