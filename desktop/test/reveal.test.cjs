// 렌더 결과 '폴더 열기' — 메인 쪽(desktop/reveal.js): 저장한 경로 기록·이름으로 찾기·열어도 되는 경로(이번 실행에 저장한 곳만)·내려받기 기다리기를
// Electron 없이(가짜 파일 시스템·윈도 경로 규칙) 본다. main.js·preload.js 배선은 글자로 확인한다.
// 실제 앱 흐름(진짜 폴더·파일 핸들로 MP4·MXF·PNG 시퀀스·이미지 렌더 → 버튼 → reveal IPC 경로)은 WCG_BOOT_CHECK=1 일 때 reveal-flow-check.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRevealRegistry, nameOk } = require('../reveal.js');

const W = path.win32;
// 가짜 파일 시스템 — 윈도처럼 대소문자를 가리지 않는다. files: 파일 경로들, dirs: 폴더 경로들
function fakeFs(files = [], dirs = []) {
  const norm = (p) => W.resolve(p).normalize('NFC').toLowerCase().replace(/[\\/]+$/, '');
  const F = new Set(files.map(norm)), D = new Set(dirs.map(norm));
  return {
    statSync: (p) => {
      const k = norm(p);
      if (F.has(k)) return { isFile: () => true, isDirectory: () => false };
      if (D.has(k)) return { isFile: () => false, isDirectory: () => true };
      const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e;
    },
    add: (p) => F.add(norm(p)),
  };
}
const reg = (files, dirs, o = {}) => createRevealRegistry(Object.assign({ fs: fakeFs(files, dirs), path: W }, o));

test('이름 검사 — 파일·폴더 이름 하나만(구분자·..·드라이브·제어 문자·빈 이름·너무 긴 것 거절)', () => {
  for (const ok of ['1012.mp4', '1012-2.mxf', '저장창 시험.zip', '전체 화면 (2).png', '20261012_날씨CG메이커', 'a.b.c']) assert.equal(nameOk(ok), true, ok);
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', '..\\x', 'C:x', 'a*b', 'a?b', 'a"b', 'a<b', 'a|b', 'a\u0000b', 'a\nb', 'x'.repeat(256), null, undefined, 3, {}]) assert.equal(nameOk(bad), false, String(bad));
});

test('저장창 파일 — 그 파일 경로 자체가 기록된다: 이름으로 찾기(대소문자·한글 조합 무관), 없으면 모름', async () => {
  const p = 'D:\\영상\\저장창 시험.zip';
  const r = reg([p]);
  r.noteGrant(p, false);
  assert.equal(await r.find({ name: '저장창 시험.zip' }), p);
  assert.equal(await r.find({ name: '저장창 시험.ZIP' }), p);
  assert.equal(await r.find({ name: '저장창 시험.zip'.normalize('NFD') }), p);   // 조합형으로 와도
  assert.equal(await r.find({ name: '다른 이름.zip' }), '');
  assert.equal(await r.find({ name: '저장창 시험.zip', sub: ['x'] }), '');       // 저장창 파일엔 하위 폴더가 없다
  const r2 = reg([]); r2.noteGrant(p, false);
  assert.equal(await r2.find({ name: '저장창 시험.zip' }), '', '파일이 실제로 없으면 모름');
});

test('고른 폴더(저장 폴더·이미지 폴더) — 폴더 경로가 기록되고, 폴더 이름 + 하위 폴더 + 파일 이름으로 찾는다', async () => {
  const up = 'R:\\Upload', img = 'D:\\CG\\이미지';
  const f1 = 'R:\\Upload\\1012.mp4', f2 = 'D:\\CG\\이미지\\20261012_날씨CG메이커\\전체 화면.png';
  const r = reg([f1, f2], [up, img]);
  r.noteGrant(up, true); r.noteGrant(img, true);
  assert.equal(await r.find({ name: '1012.mp4', dir: 'Upload' }), f1);
  assert.equal(await r.find({ name: '1012.mp4', dir: 'upload' }), f1);
  assert.equal(await r.find({ name: '전체 화면.png', dir: '이미지', sub: ['20261012_날씨CG메이커'] }), f2);
  assert.equal(await r.find({ name: '1012.mp4', dir: '다른 폴더' }), '', '이름이 다른 폴더로 넘겨짚지 않는다');
  assert.equal(await r.find({ name: '1012.mp4' }), '', '폴더 단서 없이는 폴더 아래를 뒤지지 않는다');
  assert.equal(await r.find({ name: '없는.mp4', dir: 'Upload' }), '');
  assert.equal(await r.find({ name: '전체 화면.png', dir: '이미지', sub: ['..'] }), '');
  assert.equal(await r.find({ name: '..\\..\\Windows\\notepad.exe', dir: 'Upload' }), '');
  assert.equal(await r.find(null), '');
  assert.equal(await r.find('1012.mp4'), '');
});

test('같은 이름 폴더가 둘이면 최근에 쓴(권한 확인이 나중인) 폴더', async () => {
  let t = 1000;
  const a = 'D:\\a\\Out', b = 'E:\\b\\Out';
  const r = reg([a + '\\1012.mp4', b + '\\1012.mp4'], [a, b], { now: () => t });
  r.noteGrant(a, true); t += 10; r.noteGrant(b, true);
  assert.equal(await r.find({ name: '1012.mp4', dir: 'Out' }), b + '\\1012.mp4');
  t += 10; r.noteGrant(a, true);   // 다시 a에 씀
  assert.equal(await r.find({ name: '1012.mp4', dir: 'Out' }), a + '\\1012.mp4');
  // 같은 밀리초여도 나중 확인이 앞
  const r2 = reg([a + '\\x.mp4', b + '\\x.mp4'], [a, b], { now: () => 5 });
  r2.noteGrant(b, true); r2.noteGrant(a, true);
  assert.equal(await r2.find({ name: 'x.mp4', dir: 'Out' }), a + '\\x.mp4');
});

test('드라이브 루트를 고른 폴더(R:\\) — 핸들 이름이 어떻게 와도 찾고, 그 드라이브 아래만 열 수 있다', async () => {
  const r = reg(['R:\\1012.mp4', 'R:\\x\\y.png'], ['R:\\']);
  r.noteGrant('R:\\', true);
  for (const d of ['R:\\', 'R:', '\\', 'r:\\']) assert.equal(await r.find({ name: '1012.mp4', dir: d }), 'R:\\1012.mp4', d);
  assert.equal(await r.find({ name: '1012.mp4', dir: 'Upload' }), '');
  assert.equal(r.allowed('R:\\x\\y.png'), true);
  assert.equal(r.allowed('R:\\1012.mp4'), true);
});

test('열어도 되는 경로 — 실제로 있고, 저장창 파일 그 자체·고른 폴더(와 그 아래)·내려받은 파일만', () => {
  const files = ['R:\\Upload\\1012.mp4', 'R:\\Upload\\sub\\a.png', 'R:\\Upload2\\x.mp4', 'D:\\pick\\a.zip', 'D:\\pick\\b.zip', 'C:\\Windows\\notepad.exe', 'C:\\Users\\me\\Downloads\\z.zip'];
  const dirs = ['R:\\Upload', 'R:\\Upload\\sub', 'R:\\', 'D:\\pick', 'C:\\Windows'];
  const r = reg(files, dirs);
  r.noteGrant('R:\\Upload', true);
  r.noteGrant('D:\\pick\\a.zip', false);
  assert.equal(r.allowed('R:\\Upload\\1012.mp4'), true);
  assert.equal(r.allowed('r:\\upload\\1012.MP4'), true, '대소문자 무관');
  assert.equal(r.allowed('R:\\Upload\\sub\\a.png'), true, '고른 폴더 아래');
  assert.equal(r.allowed('R:\\Upload'), true, '고른 폴더 자체');
  assert.equal(r.allowed('R:\\Upload\\..\\Upload\\1012.mp4'), true, '정규화');
  assert.equal(r.allowed('R:\\Upload2\\x.mp4'), false, '이름이 비슷한 옆 폴더');
  assert.equal(r.allowed('R:\\'), false, '고른 폴더의 위');
  assert.equal(r.allowed('D:\\pick\\a.zip'), true, '저장창 파일');
  assert.equal(r.allowed('D:\\pick\\b.zip'), false, '저장창 파일 옆 다른 파일');
  assert.equal(r.allowed('D:\\pick'), false, '저장창 파일의 폴더(그 자체는 고르지 않음)');
  assert.equal(r.allowed('C:\\Windows\\notepad.exe'), false);
  assert.equal(r.allowed('R:\\Upload\\없음.mp4'), false, '없는 파일');
  for (const bad of ['', 'Upload\\1012.mp4', '..\\x', null, 5, 'R:\\Upload\\a\u0000b']) assert.equal(r.allowed(bad), false, String(bad));
  assert.equal(r.allowed('C:\\Users\\me\\Downloads\\z.zip'), false, '내려받기 전');
  const done = r.noteDownloadStart('z.zip'); done('completed', 'C:\\Users\\me\\Downloads\\z.zip');
  assert.equal(r.allowed('C:\\Users\\me\\Downloads\\z.zip'), true, '내려받기 끝');
  const r2 = reg(['C:\\d\\c.zip'], []); r2.noteDownloadStart('c.zip')('cancelled', 'C:\\d\\c.zip');
  assert.equal(r2.allowed('C:\\d\\c.zip'), false, '취소한 내려받기');
});

test('내려받기 — 저장창에서 저장할 때까지 기다렸다가 경로, 취소·실패·시간 초과는 모름', async () => {
  const dl = 'C:\\Users\\me\\Desktop\\20261012_날씨CG메이커.zip';
  const fsx = fakeFs([dl]);
  let t = 100000;
  const r = createRevealRegistry({ fs: fsx, path: W, now: () => t });
  // ① 묻고 나서 시작·끝
  const ask = r.find({ name: '20261012_날씨CG메이커.zip', download: true, waitMs: 5000 });
  const done = r.noteDownloadStart('20261012_날씨CG메이커.zip');
  setTimeout(() => done('completed', dl), 30);
  assert.equal(await ask, dl);
  // ② 이미 끝난 것(조금 전 시작 — 15초 안)은 곧바로
  assert.equal(await r.find({ name: '20261012_날씨CG메이커.zip', download: true, waitMs: 5000 }), dl);
  // ③ 오래전 것은 안 쓴다 → 기다리다 시간 초과
  t += 60000;
  const t0 = Date.now();
  assert.equal(await r.find({ name: '20261012_날씨CG메이커.zip', download: true, waitMs: 80 }), '');
  assert.ok(Date.now() - t0 >= 60, '시간 초과까지 기다림');
  // ④ 취소
  const ask2 = r.find({ name: 'b.zip', download: true, waitMs: 5000 });
  r.noteDownloadStart('b.zip')('cancelled', '');
  assert.equal(await ask2, '');
  // ⑤ 저장은 끝났는데 파일이 없다(바로 지움) → 모름
  const ask3 = r.find({ name: 'c.zip', download: true, waitMs: 5000 });
  r.noteDownloadStart('c.zip')('completed', 'C:\\x\\c.zip');
  assert.equal(await ask3, '');
  // ⑥ 기다리지 않음(waitMs 0)·이름이 다른 내려받기는 무시
  assert.equal(await r.find({ name: 'd.zip', download: true }), '');
  const ask4 = r.find({ name: 'e.zip', download: true, waitMs: 120 });
  r.noteDownloadStart('다른.zip')('completed', dl);
  assert.equal(await ask4, '');
  // ⑦ 기다리는 시간은 15분까지만(아무리 길게 물어도)
  const src = fs.readFileSync(path.join(__dirname, '..', 'reveal.js'), 'utf8');
  assert.match(src, /DL_WAIT_MAX = 15 \* 60 \* 1000/);
});

test('기록 상한 — 오래된 권한 기록부터 버린다(한 실행에 300개)', async () => {
  const r = reg(['D:\\keep\\a.mp4'], ['D:\\keep']);
  r.noteGrant('D:\\keep', true);
  for (let i = 0; i < 300; i++) r.noteGrant('D:\\f\\' + i + '.zip', false);
  assert.equal(r._grants.size, 300);
  assert.equal(await r.find({ name: 'a.mp4', dir: 'keep' }), '', '가장 오래된 것이 빠짐');
  for (const bad of ['', 'rel\\x', null, 'C:\\a\u0001b']) r.noteGrant(bad, true);
  assert.equal(r._grants.size, 300, '잘못된 경로는 기록 안 함');
});

test('배선 — main.js: fileSystem 쓰기 권한 확인만 기록(메인 출처)·늘 허용·다른 권한은 Electron 기본과 같은 답, 내려받기는 경로를 안 바꿈, IPC는 메인 창 주 프레임만·showItemInFolder만·점검 모드는 기록만', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
  const i = main.indexOf('function watchSavedPaths(ses)'); assert.ok(i > 0);
  const w = main.slice(i, main.indexOf('\n}\n', i));
  assert.match(w, /ses\.setPermissionCheckHandler\(\(_wc, permission, origin, d\) => \{/);
  assert.match(w, /if \(permission === 'fileSystem'\) \{\n\s+if \(d && d\.fileAccessType === 'writable' && String\(origin \|\| ''\)\.replace\(\/\\\/\+\$\/, ''\) === APP_ORIGIN\) reveals\.noteGrant\(String\(d\.filePath \|\| ''\), !!d\.isDirectory\);\n\s+return true;/);
  assert.match(w, /return permission !== 'deprecated-sync-clipboard-read';/, '처리기가 없을 때(Electron 기본)와 같은 답');
  assert.doesNotMatch(w, /setPermissionRequestHandler/, '요청 처리기는 그대로(없음 = 모두 허용)');
  assert.match(w, /ses\.on\('will-download', \(_e, item, wc\) => \{/);
  assert.match(w, /wc\.id !== win\.webContents\.id\) return;/, '메인 창 내려받기만');
  assert.doesNotMatch(w, /setSavePath|savePath =|preventDefault|setSaveDialogOptions/, '내려받기 저장 위치·저장창은 그대로');
  assert.match(w, /item\.once\('done', \(_ev, state\) => \{ let p = ''; try \{ p = item\.getSavePath\(\); \}/);
  assert.match(main, /watchSavedPaths\(session\.defaultSession\);/);
  // 점검 모드 return 보다 앞(점검에서도 기록)
  assert.ok(main.indexOf('watchSavedPaths(session.defaultSession);') < main.indexOf("if (TEST_MODE) { createWindow(); return; }"));
  const s = main.slice(main.indexOf("ipcMain.handle('wcg:saved-path'"), main.indexOf('// ---------- 닫기 전 묻기'));
  assert.match(s, /ipcMain\.handle\('wcg:saved-path', \(e, h\) => \{\n\s+if \(!privateKeyCallerOk\(e, win\)\) return '';\n\s+return reveals\.find\(h\);/);
  assert.match(s, /ipcMain\.handle\('wcg:reveal-path', \(e, p\) => \{\n\s+if \(!privateKeyCallerOk\(e, win\)\) return \{ ok: false, err: 'denied' \};/);
  assert.match(s, /if \(!fp \|\| !path\.isAbsolute\(fp\) \|\| !exists\(fp\)\) return \{ ok: false, err: 'gone' \};\n\s+if \(!reveals\.allowed\(fp\)\) return \{ ok: false, err: 'not-allowed' \};/);
  assert.match(s, /if \(TEST_MODE\) \{ console\.log\('\[reveal-test\] ' \+ JSON\.stringify\(fp\)\); return \{ ok: true, path: fp, test: true \}; \}\n\s+shell\.showItemInFolder\(fp\);/);
  assert.doesNotMatch(s, /openPath|openExternal/, '실행 파일 열기 없음');
  assert.equal((main.match(/shell\.openPath/g) || []).length, 0);
});

test('배선 — preload: savedPath·revealPath 두 개만(invoke), 단서는 글자·배열·숫자로 씻어서', () => {
  const pre = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(pre, /savedPath: \(h\) => ipcRenderer\.invoke\('wcg:saved-path', \{\n\s+name: String\(\(h && h\.name\) \|\| ''\), dir: h && h\.dir != null \? String\(h\.dir\) : '',\n\s+sub: Array\.isArray\(h && h\.sub\) \? h\.sub\.slice\(0, 8\)\.map\(String\) : \[\], download: !!\(h && h\.download\), waitMs: Math\.floor\(\+\(h && h\.waitMs\)\) \|\| 0,\n\s+\}\),/);
  assert.match(pre, /revealPath: \(p\) => ipcRenderer\.invoke\('wcg:reveal-path', String\(p \|\| ''\)\),/);
  assert.doesNotMatch(pre, /shell|openPath/);
});

// ── 실제 앱(진짜 폴더·파일 핸들로 렌더 → 버튼 → reveal IPC) — WCG_BOOT_CHECK=1 일 때만 ──
test('실제 앱: MP4·MXF(저장 폴더)·PNG 시퀀스(저장창)·이미지(폴더 창) 저장 뒤 버튼 → 누르면 그 파일 경로로 reveal, 다음 렌더면 숨김, 막을 곳은 막음', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  let raw = '';
  try { raw = execFileSync(process.execPath, [path.join(__dirname, 'reveal-flow-check.cjs'), path.join(__dirname, '..', '..')], { encoding: 'utf8', timeout: 400000 }); }
  catch (e) { raw = String((e && e.stdout) || ''); }
  const j = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.deepEqual(j.errors, [], JSON.stringify(j, null, 1).slice(0, 4000));
  assert.equal(j.ok, true);
  assert.equal(j.reveals.length, 5);
});
