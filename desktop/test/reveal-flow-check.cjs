// 렌더 결과 '폴더 열기' — 실제 앱 점검기. 숨김 창(점검 모드)으로 앱을 띄우고, 진짜 폴더·파일 핸들(File System Access)로 짧게 렌더해
// 메인이 저장한 경로를 알아내 버튼이 뜨는지, 누르면 reveal IPC가 그 파일 경로로 불리는지 끝까지 본다(main.js 'wcg:saved-path'·'wcg:reveal-path').
// 사용: node reveal-flow-check.cjs [앱폴더]   출력: JSON {ok, results{…}, reveals[], errors[]}. 하나라도 어긋나면 종료코드 1.
//  - 폴더·파일 핸들은 크로미움 검사기(CDP) Input.dispatchDragEvent로 진짜 끌어다 놓기를 해서 얻는다(폴더 창·저장창은 자동으로 못 누른다).
//    · 폴더 핸들 → 영상 저장 폴더(outDir)로 지정 → MP4(bakeMp4)·MXF(wnsRender — 헬퍼는 가짜 fetch)
//    · 파일 핸들 → 저장창(showSaveFilePicker)이 고른 파일로 → PNG 시퀀스(exportPngSeq)
//    · 폴더 핸들 → 이미지 폴더 창(showDirectoryPicker)이 고른 폴더로 → 이미지로 렌더(renderExport) 바닥 요약 [폴더 열기]
//  - 점검 모드 메인은 탐색기를 열지 않고 '[reveal-test] "경로"'를 찍는다 — 그 줄을 모아 누른 버튼의 경로와 맞춘다.
//  - 막는 것: 이번 실행에 저장하지 않은 곳(C:\Windows\notepad.exe)·없는 파일·경로 조각이 든 이름.
// 시험 폴더는 크로미움이 막는 곳(AppData — %TEMP% 포함, 그 아래 파일은 못 만든다)을 피해 이 폴더 안 .tmp-reveal-<pid>에 만들고 끝나면 지운다.
// tests 와 같은 임시 사용자 폴더(%TEMP%\wcg-test-<pid>)를 쓰고 끝나면 지운다. 사용자가 켜 둔 앱은 건드리지 않는다(단일 인스턴스 해제 모드).
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { rmTestProfile } = require('./test-profile.cjs');

const DESK = path.resolve(__dirname, '..');
const ELECTRON = path.join(DESK, 'node_modules', 'electron', 'dist', 'electron.exe');
const appDir = path.resolve(process.argv.slice(2).find((x) => !x.startsWith('--')) || path.resolve(DESK, '..'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

async function cdp(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push('EXC ' + ((d.exception && d.exception.description) || d.text)); }
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); try { ws.send(JSON.stringify({ id: i, method, params })); } catch (e) { r({ error: e }); } });
  const evalJs = async (expression, ms = 120000) => {
    const r = await Promise.race([send('Runtime.evaluate', { expression: `(async () => { ${expression}\n})()`, awaitPromise: true, returnByValue: true }), sleep(ms).then(() => ({ timeout: true }))]);
    if (r.timeout) throw new Error('평가 시간 초과: ' + expression.trim().slice(0, 80));
    if (r.result && r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  return { ws, send, evalJs, errors, close: () => { try { ws.close(); } catch (e) {} } };
}

(async () => {
  const out = { ok: false, results: {}, reveals: [], errors: [] };
  if (!fs.existsSync(ELECTRON)) { out.errors.push('electron 없음'); console.log(JSON.stringify(out)); process.exit(2); }
  const tmp = path.join(__dirname, '.tmp-reveal-' + process.pid);
  const dirVideo = path.join(tmp, '영상 저장');      // 한글·띄어쓰기 이름(실제 사용자 폴더처럼)
  const dirPick = path.join(tmp, 'pick');
  const dirImg = path.join(tmp, '이미지');
  for (const d of [dirVideo, dirPick, dirImg]) fs.mkdirSync(d, { recursive: true });
  const pickFile = path.join(dirPick, '저장창 시험.zip');
  fs.writeFileSync(pickFile, '');                      // 저장창이 '고른' 파일(끌어다 놓아 핸들을 얻으려면 있어야 한다)
  fs.writeFileSync(path.join(dirVideo, 'other.txt'), 'x');   // 저장 폴더 안 다른 파일(폴더 아래는 열 수 있다)

  const rport = await freePort();
  const proc = spawn(ELECTRON, ['.', `--remote-debugging-port=${rport}`], {
    cwd: DESK, env: { ...process.env, WCG_APP_DIR: appDir, WCG_TEST: '1', WCG_TEST_SIZE: '1600x900' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let mainLog = '';
  proc.stdout.on('data', (d) => { mainLog += d.toString('utf8'); });
  proc.stderr.on('data', (d) => { mainLog += d.toString('utf8'); });
  const reveals = () => [...mainLog.matchAll(/\[reveal-test\] (".*")/g)].map((m) => JSON.parse(m[1]));
  let R = null, keep = null;
  const finish = (code) => {
    if (keep) clearInterval(keep);
    if (R) R.close();
    try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
    rmTestProfile(proc.pid);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { out.errors.push('시험 폴더 못 지움: ' + e.message); }
    console.log(JSON.stringify(out, null, 2));
    process.exit(code);
  };
  try {
    let page = null;
    for (let i = 0; i < 75 && !page; i++) { await sleep(400); try { const l = await (await fetch(`http://127.0.0.1:${rport}/json/list`)).json(); page = l.find((p) => p.type === 'page' && p.url.startsWith('app://weathercg')); } catch (e) {} }
    if (!page) throw new Error('페이지를 못 찾음');
    R = await cdp(page.webSocketDebuggerUrl);
    await R.send('Runtime.enable');
    // 숨김 창이 프레임을 계속 그리게(그림 굽기·toBlob이 멈추지 않게 — boot-check --keepalive와 같은 방법)
    keep = setInterval(() => { R.send('Page.captureScreenshot', { format: 'jpeg', quality: 5, clip: { x: 0, y: 0, width: 4, height: 4, scale: 1 } }); }, 2000);
    await sleep(8000);   // 부팅

    // 1) 준비 — 작업 열기(칠 두 곳) → 자동 구성 → 짧게(0.5초 · 10fps), 타임라인 열기. 진짜 끌어다 놓기만 가로채는 잡이(앱의 '파일 열기' 대신)
    out.results.setup = await R.evalJs(`
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const ids = [...document.querySelectorAll('#gMain .zone')].map((z) => z.dataset.id).filter(Boolean);
      const work = { res: '1920x1080', style: 'sgg', map: { x: 1160, y: 545, s: 1.02 }, fillsByStyle: { sgg: { [ids[10]]: '#FA2E1E', [ids[40]]: '#FFC400' } },
        anim: { dur: 6, fps: 29.97, reveal: 'dissolve', tracks: [] } };
      const dt = new DataTransfer(); dt.items.add(new File([JSON.stringify(work)], 'reveal.json', { type: 'application/json' }));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      await sleep(1500);
      autoTracks();
      anim().dur = 0.5; anim().fps = 10;
      if (!document.getElementById('timeline').classList.contains('on')) document.getElementById('tlToggle').click();
      await sleep(600);
      window.__drops = [];
      const stop = (e) => { if (!e.isTrusted) return; e.preventDefault(); e.stopImmediatePropagation(); };
      window.addEventListener('dragenter', stop, true); window.addEventListener('dragover', stop, true);
      window.addEventListener('drop', (e) => { if (!e.isTrusted) return; e.preventDefault(); e.stopImmediatePropagation();
        const it = e.dataTransfer && e.dataTransfer.items[0]; window.__drops.push(it ? it.getAsFileSystemHandle() : Promise.resolve(null)); }, true);
      const b = document.getElementById('tlOpenDir');
      return { tracks: anim().tracks.length, res: S.res, tlOpen: document.getElementById('timeline').classList.contains('on'), btnHidden: b.hidden, revealOk: outRevealOk() };
    `);
    // 진짜 끌어다 놓기(검사기) — 놓은 것의 File System Access 핸들이 window.__drops[n]
    const drop = async (p) => {
      const data = { items: [], files: [p], dragOperationsMask: 1 };
      for (const type of ['dragEnter', 'dragOver', 'drop']) await R.send('Input.dispatchDragEvent', { type, x: 700, y: 420, data });
      await sleep(400);
    };

    // 2) 영상 저장 폴더 = 끌어다 놓은 폴더 → MP4 → 버튼 → 누르기
    await drop(dirVideo);
    out.results.mp4 = await R.evalJs(`
      const h = await window.__drops[0]; if (!h || h.kind !== 'directory') return { err: 'no-dir-handle' };
      await idbSet('outDir', h); await updateOutDirBtn();
      await bakeMp4();
      const b = document.getElementById('tlOpenDir');
      const r = { name: h.name, info: document.getElementById('tlInfo').textContent, hidden: b.hidden, display: getComputedStyle(b).display, title: b.title, last: _outLast && _outLast.path, file: dateTag() + '.mp4' };
      b.click(); await new Promise((res) => setTimeout(res, 400));
      r.status = document.getElementById('status').textContent;
      return r;
    `, 240000);
    out.results.mp4.reveals = reveals();

    // 3) 다음 렌더가 저장할 곳을 정하면 지난 버튼은 숨는다(쓰기 전) — 그다음 MXF(가짜 헬퍼)로 같은 폴더에
    out.results.mxf = await R.evalJs(`
      const o = await prepareOutput('숨김확인', 'mp4', 'video/mp4', '시험');
      const hiddenAfterPrepare = document.getElementById('tlOpenDir').hidden;
      const realFetch = window.fetch;
      const json = (x) => new Response(JSON.stringify(x), { status: 200, headers: { 'Content-Type': 'application/json' } });
      window.fetch = async (u, opts) => { u = String(u);
        if (/\\/ping(\\?|$)/.test(u)) return json({ ok: true, ff: true, ver: 20261009 });
        if (u.includes('/api/frame')) return json({ ok: true });
        if (u.includes('/api/finalize')) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
        return realFetch(u, opts); };
      // 인코딩 일꾼(Worker)은 자기 fetch로 헬퍼에 보내 가짜 fetch를 못 탄다 — 이 점검만 일꾼 없이(메인 스레드 길)
      const realWorker = window.Worker; window.Worker = undefined;
      try { await wnsRender('mxf'); } finally { window.fetch = realFetch; window.Worker = realWorker; }
      const b = document.getElementById('tlOpenDir');
      const r = { hiddenAfterPrepare, prepared: !!o, info: document.getElementById('tlInfo').textContent, hidden: b.hidden, last: _outLast && _outLast.path, file: dateTag() + '.mxf' };
      b.click(); await new Promise((res) => setTimeout(res, 400));
      return r;
    `, 240000);
    out.results.mxf.reveals = reveals();

    // 4) 저장창(= 끌어다 놓은 파일) → PNG 시퀀스
    await drop(pickFile);
    out.results.png = await R.evalJs(`
      const hf = await window.__drops[1]; if (!hf || hf.kind !== 'file') return { err: 'no-file-handle' };
      await clearOutDir(); await updateOutDirBtn();
      const real = window.showSaveFilePicker; window.showSaveFilePicker = async () => hf;
      try { await exportPngSeq(); } finally { window.showSaveFilePicker = real; }
      const b = document.getElementById('tlOpenDir');
      const r = { name: hf.name, info: document.getElementById('tlInfo').textContent, hidden: b.hidden, last: _outLast && _outLast.path };
      b.click(); await new Promise((res) => setTimeout(res, 400));
      return r;
    `, 240000);
    out.results.png.reveals = reveals();

    // 5) 이미지로 렌더 — 폴더 창(= 끌어다 놓은 폴더) → 오늘날짜_날씨CG메이커 → 완성 화면 한 장 → 바닥 요약 [폴더 열기]
    await drop(dirImg);
    out.results.image = await R.evalJs(`
      const hd = await window.__drops[2]; if (!hd || hd.kind !== 'directory') return { err: 'no-dir-handle' };
      const real = window.showDirectoryPicker; window.showDirectoryPicker = async () => hd;
      openExport();
      document.querySelector('#exportOv .exQuick [data-quick="final"]').click();
      const plan = exportPlan(exPickedKeys());
      try { await renderExport(); } finally { window.showDirectoryPicker = real; }
      const ob = document.querySelector('#exSummary .exSumOpen');
      const r = { folder: exportFolderName(), file: plan[0] && plan[0].file, n: plan.length, summary: document.getElementById('exSummary').textContent, btn: !!ob, title: ob && ob.title, last: _exReveal };
      if (ob) { ob.click(); await new Promise((res) => setTimeout(res, 400)); }
      closeExport(); openExport();   // 다시 열어도(요약이 '고르기' 상태로) 다음 렌더 전까지는 버튼이 남는다
      r.btnAfterReopen = !!document.querySelector('#exSummary .exSumOpen');
      closeExport();
      return r;
    `, 240000);
    out.results.image.reveals = reveals();

    // 6) 막기 — 이번 실행에 저장하지 않은 곳·없는 파일·경로 조각 이름, 그리고 저장 폴더 아래 다른 파일(허용)
    out.results.guard = await R.evalJs(`
      const d = window.wcgDesktop;
      return {
        sys: await d.revealPath('C:\\\\Windows\\\\notepad.exe'),
        gone: await d.revealPath(${JSON.stringify(path.join(dirVideo, '없는 파일.mp4'))}),
        rel: await d.revealPath('영상 저장\\\\other.txt'),
        other: await d.revealPath(${JSON.stringify(path.join(dirVideo, 'other.txt'))}),
        parent: await d.revealPath(${JSON.stringify(tmp)}),
        badName: await d.savedPath({ name: '..\\\\..\\\\Windows\\\\notepad.exe' }),
        wrongDir: await d.savedPath({ name: dateTag() + '.mp4', dir: '다른 폴더' }),
        okDir: await d.savedPath({ name: dateTag() + '.mp4', dir: ${JSON.stringify(path.basename(dirVideo))} }),
      };
    `);
    out.results.guard.reveals = reveals();
    out.reveals = reveals();

    // 판정
    const R0 = out.results, today = (R0.mp4 && R0.mp4.file) || '';
    const want = {
      mp4: path.join(dirVideo, today),
      mxf: path.join(dirVideo, (R0.mxf && R0.mxf.file) || ''),
      png: pickFile,
      image: path.join(dirImg, (R0.image && R0.image.folder) || '', (R0.image && R0.image.file) || ''),
    };
    const fail = (m) => out.errors.push(m);
    if (!R0.setup || !R0.setup.tracks || !R0.setup.btnHidden || !R0.setup.revealOk) fail('준비: ' + JSON.stringify(R0.setup));
    if (!R0.mp4 || R0.mp4.hidden || R0.mp4.display === 'none' || R0.mp4.last !== want.mp4 || !fs.existsSync(want.mp4)) fail('MP4 버튼·경로: ' + JSON.stringify(R0.mp4) + ' 기대 ' + want.mp4);
    if (!R0.mp4 || !R0.mp4.reveals.includes(want.mp4)) fail('MP4 누름 → reveal 경로');
    if (!R0.mxf || !R0.mxf.hiddenAfterPrepare || R0.mxf.hidden || R0.mxf.last !== want.mxf || !R0.mxf.reveals.includes(want.mxf)) fail('MXF: ' + JSON.stringify(R0.mxf) + ' 기대 ' + want.mxf);
    if (!R0.png || R0.png.hidden || R0.png.last !== want.png || !R0.png.reveals.includes(want.png) || !(fs.statSync(pickFile).size > 0)) fail('PNG 시퀀스(저장창): ' + JSON.stringify(R0.png));
    if (!R0.image || !R0.image.btn || R0.image.last !== want.image || !R0.image.reveals.includes(want.image) || !R0.image.btnAfterReopen || !fs.existsSync(want.image)) fail('이미지: ' + JSON.stringify(R0.image) + ' 기대 ' + want.image);
    const g = R0.guard || {};
    if (!g.sys || g.sys.ok || g.sys.err !== 'not-allowed') fail('막기 — 시스템 파일: ' + JSON.stringify(g.sys));
    if (!g.gone || g.gone.ok || g.gone.err !== 'gone') fail('막기 — 없는 파일: ' + JSON.stringify(g.gone));
    if (!g.rel || g.rel.ok) fail('막기 — 상대 경로: ' + JSON.stringify(g.rel));
    if (!g.other || !g.other.ok) fail('저장 폴더 아래 다른 파일은 열 수 있어야: ' + JSON.stringify(g.other));
    if (!g.parent || g.parent.ok || g.parent.err !== 'not-allowed') fail('막기 — 고른 폴더의 바깥(위): ' + JSON.stringify(g.parent));
    if (g.badName !== '' || g.wrongDir !== '' || g.okDir !== want.mp4) fail('경로 찾기 단서: ' + JSON.stringify({ badName: g.badName, wrongDir: g.wrongDir, okDir: g.okDir }));
    if (out.reveals.some((p) => /windows/i.test(p) || p === tmp)) fail('막아야 할 경로가 열렸다: ' + JSON.stringify(out.reveals));
    if (R.errors.length) out.errors.push(...R.errors.map((e) => 'page ' + e.slice(0, 300)));
    out.ok = out.errors.length === 0;
    finish(out.ok ? 0 : 1);
  } catch (e) {
    out.errors.push('점검기 오류: ' + (e && e.message || e));
    out.mainLog = mainLog.slice(-2000);
    finish(1);
  }
})();
