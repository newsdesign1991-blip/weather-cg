'use strict';
// 내장 헬퍼 렌더 취소(POST /api/cancel?sid= — 앱의 [렌더 취소]·Esc, 10-12) 시험 — node --test test/server-cancel.test.cjs
// 세션 프레임 폴더 지우기, 취소 뒤 늦게 온 프레임·인코딩은 409(폴더를 다시 만들지 않음), 인코딩 중이면 ffmpeg 멈춤·결과 파일 지움,
// sid 검사(점 sid·장치 이름 400, 'ae…' = AE 보내기 원본 400), 같은 sid 프레임0 = 새 세션. 파이썬 헬퍼엔 없는 길이라 차등 시험은 없다.
// ffmpeg 는 가짜(runFfmpeg 주입)로 — 진짜 프로세스 멈추기는 runCapture 를 node 로 시험한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const W = require('../wns/server.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wns-cancel-'));
const FRAMES = path.join(TMP, 'frames');
const OUTS = path.join(TMP, 'out');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let srv, base;
const ff = { calls: [], impl: null };   // 가짜 ffmpeg — impl(args, o) 가 정한다(기본: 결과 파일을 만들고 성공)
async function post(p, body, headers) {
  const r = await fetch(base + p, { method: 'POST', body, headers });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, text: buf.toString('utf8'), json: () => JSON.parse(buf.toString('utf8')) };
}
const frame = (sid, i, body = 'f' + i) => post('/api/frame?sid=' + encodeURIComponent(sid) + '&index=' + i, Buffer.from(body));
const cancel = (sid) => post('/api/cancel?sid=' + encodeURIComponent(sid));
const finalize = (sid) => post('/api/finalize', JSON.stringify({ sid, mode: 'mxf', tail: 0 }), { 'Content-Type': 'application/json' });
const dir = (sid) => path.join(FRAMES, sid);

test.before(async () => {
  fs.mkdirSync(OUTS, { recursive: true });
  // ffmpegPath 는 있기만 하면 된다(ffExists) — 실제 실행은 runFfmpeg 가짜
  const fakeFf = path.join(TMP, 'ffmpeg.exe'); fs.writeFileSync(fakeFf, '');
  srv = W.createWnsServer({
    ffmpegPath: fakeFf, framesDir: FRAMES, tmpDir: OUTS, aeDryRun: true, fontsInstall: false,
    runFfmpeg: (args, o) => { ff.calls.push({ args, o }); return ff.impl ? ff.impl(args, o) : (fs.writeFileSync(args[args.length - 1], 'MXF'), Promise.resolve({ code: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) })); },
  });
  base = 'http://127.0.0.1:' + await srv.listen(0);
});
test.after(async () => { if (srv) await srv.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('/api/cancel — 그 세션 프레임 폴더를 지우고 {"ok": true}, 다른 세션은 그대로', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await frame('wns1', i)).status, 200);
  for (let i = 0; i < 2; i++) assert.equal((await frame('wns2', i)).status, 200);
  const r = await cancel('wns1');
  assert.equal(r.status, 200); assert.equal(r.text, '{"ok": true}');
  assert.equal(fs.existsSync(dir('wns1')), false);
  assert.deepEqual(fs.readdirSync(dir('wns2')).sort(), ['f_00000.png', 'f_00001.png']);
  // 없는 세션(프레임0 전에 취소)도 200
  assert.equal((await cancel('wns-none')).status, 200);
});

test('취소 뒤 늦게 온 프레임은 409(폴더를 다시 만들지 않음), 인코딩도 409(ffmpeg 안 부름) — 같은 sid 프레임0 은 새 세션', async () => {
  await frame('wns3', 0); await frame('wns3', 1);
  await cancel('wns3');
  const late = await frame('wns3', 2);
  assert.equal(late.status, 409); assert.deepEqual(late.json(), { ok: false, error: '취소된 렌더' });
  assert.equal(fs.existsSync(dir('wns3')), false, '늦은 프레임이 폴더를 다시 만들지 않는다');
  const n = ff.calls.length;
  const f = await finalize('wns3');
  assert.equal(f.status, 409); assert.deepEqual(f.json(), { ok: false, error: '취소된 렌더' });
  assert.equal(ff.calls.length, n, '인코딩 안 함');
  // 같은 sid 로 다시 시작(프레임0) — 취소 표시를 풀고 평소대로
  assert.equal((await frame('wns3', 0)).status, 200);
  assert.equal((await frame('wns3', 1)).status, 200);
  const ok = await finalize('wns3');
  assert.equal(ok.status, 200); assert.equal(ok.text, 'MXF');
});

test('받는 중에 취소되면 그 프레임도 409 · 방금 만든 폴더째 지운다', async () => {
  await frame('wns4', 0);
  const body = Buffer.alloc(64 * 1024, 7);
  let rq = null;
  const res = new Promise((resolve, reject) => {
    rq = http.request(base + '/api/frame?sid=wns4&index=1', { method: 'POST', headers: { 'Content-Length': String(body.length) } }, (r) => {
      const ch = []; r.on('data', (b) => ch.push(b)); r.on('end', () => resolve({ status: r.statusCode, text: Buffer.concat(ch).toString('utf8') }));
    });
    rq.on('error', reject);
    rq.write(body.subarray(0, 1024));   // 앞부분만 보내 두고
  });
  const t0 = Date.now();
  while (!fs.existsSync(path.join(dir('wns4'), 'f_00001.png')) && Date.now() - t0 < 3000) await sleep(20);
  assert.ok(fs.existsSync(path.join(dir('wns4'), 'f_00001.png')), '받는 중');
  assert.equal((await cancel('wns4')).status, 200);
  rq.end(body.subarray(1024));   // 나머지
  const r = await res;
  assert.equal(r.status, 409);
  const t1 = Date.now();
  while (fs.existsSync(dir('wns4')) && Date.now() - t1 < 3000) await sleep(20);
  assert.equal(fs.existsSync(dir('wns4')), false);
});

test('인코딩 중(/api/finalize) 취소 — ffmpeg 를 멈추고(신호) 반쯤 만든 결과 파일을 지우고 409, 프레임 폴더도 지움', async () => {
  for (let i = 0; i < 3; i++) await frame('wns5', i);
  let sig = null;
  ff.impl = (args, o) => new Promise((resolve) => {   // 진짜 ffmpeg 처럼: 결과 파일을 쓰다가 신호가 오면 끝남(종료코드 null)
    sig = o && o.signal;
    fs.writeFileSync(args[args.length - 1], 'half');
    sig.addEventListener('abort', () => resolve({ code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }), { once: true });
  });
  try {
    const pf = finalize('wns5');
    const t0 = Date.now();
    while (!sig && Date.now() - t0 < 3000) await sleep(10);
    assert.ok(sig, 'ffmpeg 시작');
    assert.equal(sig.aborted, false);
    assert.equal((await cancel('wns5')).status, 200);
    assert.equal(sig.aborted, true, '돌던 ffmpeg 를 멈춘다');
    const r = await pf;
    assert.equal(r.status, 409); assert.deepEqual(r.json(), { ok: false, error: '취소된 렌더' });
    assert.equal(fs.existsSync(path.join(OUTS, 'wns_wns5.mxf')), false, '결과 파일 지움');
    assert.equal(fs.existsSync(dir('wns5')), false);
  } finally { ff.impl = null; }
});

test('sid 검사 — 점 sid·장치 이름은 400(아무것도 안 지움), AE 보내기 세션(ae…)은 400, 이상한 글자는 safe() 그대로', async () => {
  fs.mkdirSync(path.join(FRAMES, 'ae123'), { recursive: true }); fs.writeFileSync(path.join(FRAMES, 'ae123', 'x.png'), 'x');
  const ae = await cancel('ae123');
  assert.equal(ae.status, 400); assert.deepEqual(ae.json(), { ok: false, error: '렌더 세션만 취소할 수 있습니다' });
  assert.ok(fs.existsSync(path.join(FRAMES, 'ae123', 'x.png')), 'AE 원본은 그대로');
  for (const bad of ['..', '.', 'a.', 'CON', 'nul.txt']) {
    const r = await cancel(bad);
    assert.equal(r.status, 400, bad); assert.deepEqual(r.json(), { ok: false, error: '잘못된 sid' });
  }
  assert.ok(fs.existsSync(FRAMES), 'FRAMES 자신은 그대로');
  await frame('a..bc', 0);
  assert.equal((await cancel('a/../b c')).status, 200);   // safe('a/../b c') = 'a..bc'
  assert.equal(fs.existsSync(dir('a..bc')), false);
  // 출처 검사는 다른 길과 같다(허용 안 된 출처 403)
  const rr = await fetch(base + '/api/cancel?sid=wns9', { method: 'POST', headers: { Origin: 'https://evil.example' } });
  assert.equal(rr.status, 403);
});

test('runCapture — 신호가 끊기면 프로세스를 멈춘다(이미 끊긴 신호면 곧바로)', async () => {
  const ac = new AbortController();
  const t0 = Date.now();
  const p = W.runCapture(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], 0, ac.signal);
  setTimeout(() => ac.abort(), 150);
  const r = await p;
  assert.ok(Date.now() - t0 < 10000, '바로 끝남');
  assert.notEqual(r.code, 0);
  const pre = new AbortController(); pre.abort();
  const t1 = Date.now();
  const r2 = await W.runCapture(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], 0, pre.signal);
  assert.ok(Date.now() - t1 < 10000); assert.notEqual(r2.code, 0);
  // 신호 없이는 예전 그대로(종료코드 그대로)
  const r3 = await W.runCapture(process.execPath, ['-e', 'process.exit(3)']);
  assert.equal(r3.code, 3);
});
