'use strict';
// 지도 타일 디스크 캐시(desktop/tile-cache.js) — 네트워크 없이 가짜 fetch·임시 폴더로 본다.
// 한 번 받은 타일은 디스크에서(토큰만 다른 주소도 같은 타일), 허용 주소만, 동시 요청 한 번, 기한·no-store·목록(TileJSON) 보관,
// 인터넷이 안 되면 기한 지난 것이라도, 용량 상한을 넘으면 오래 안 쓴 것부터, 파일에 토큰이 안 남는지.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTileCache, tileUrlOk, cacheKeyUrl, isTilePath, maxAgeOf, TILE_AGE } = require('../tile-cache');

const TOK = 'pk.SECRET123';
const MBX = (z, x, y, tok = TOK) => `https://api.mapbox.com/styles/v1/u/s/tiles/256/${z}/${x}/${y}@2x?access_token=${tok}`;
const OFM = (z, x, y) => `https://tiles.openfreemap.org/planet/20251001_001001_pt/${z}/${x}/${y}.pbf`;
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-tile-'));
const rm = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* 무시 */ } };
// 가짜 fetch — plan(url) → { status, body, type, cc } 또는 'net'(연결 실패). calls 에 받은 주소를 남긴다
function fakeFetch(plan) {
  const calls = [];
  const fn = async (u) => {
    calls.push(u);
    await new Promise((r) => setTimeout(r, 5));
    const p = plan(u);
    if (p === 'net') throw new Error('ECONNRESET');
    const body = Buffer.from(p.body == null ? 'TILE:' + u.replace(/\?.*$/, '') : p.body);
    return {
      ok: (p.status || 200) < 300, status: p.status || 200,
      headers: { get: (k) => ({ 'content-type': p.type || 'image/jpeg', 'cache-control': p.cc == null ? 'max-age=43200' : p.cc })[k.toLowerCase()] || null },
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    };
  };
  fn.calls = calls;
  return fn;
}

test('주소 — 지도 타일 서버(https)만, 열쇠에서 토큰을 뺀다, 타일/목록 구분, max-age', () => {
  assert.equal(tileUrlOk(MBX(5, 27, 12)), true);
  assert.equal(tileUrlOk(OFM(5, 27, 12)), true);
  assert.equal(tileUrlOk('https://a.tiles.mapbox.com/v4/mapbox.satellite/1/1/1.jpg'), true);
  for (const bad of ['http://api.mapbox.com/x/1/2/3', 'https://evil.com/tiles/1/2/3', 'https://api.mapbox.com.evil.com/1/2/3', 'https://u:p@api.mapbox.com/1/2/3',
    'https://api.mapbox.com:8443/1/2/3', 'file:///C:/x', 'javascript:alert(1)', '', null]) assert.equal(tileUrlOk(bad), false, String(bad));
  assert.equal(cacheKeyUrl(MBX(5, 27, 12)), cacheKeyUrl(MBX(5, 27, 12, 'pk.OTHER')));
  assert.ok(!cacheKeyUrl(MBX(5, 27, 12)).includes('SECRET'));
  assert.notEqual(cacheKeyUrl(MBX(5, 27, 12) + '&_cb=1'), cacheKeyUrl(MBX(5, 27, 12)));   // '적용'(재publish)은 새 타일
  for (const p of ['/styles/v1/u/s/tiles/256/5/27/12@2x', '/v4/mapbox.satellite/5/27/12@2x.jpg90', '/planet/2025_pt/5/27/12.pbf']) assert.equal(isTilePath(p), true, p);
  assert.equal(isTilePath('/planet'), false);
  assert.equal(maxAgeOf('public, max-age=3600'), 3600000);
  assert.equal(maxAgeOf('s-maxage=99'), null);
});

test('한 번 받으면 디스크에서 — 토큰만 다른 주소도 같은 타일, 동시 요청은 한 번만, 파일에 토큰 없음', async () => {
  const dir = tmpDir();
  try {
    const f = fakeFetch(() => ({}));
    const c = createTileCache({ dir, fetch: f });
    const [a, b] = await Promise.all([c.get(MBX(5, 27, 12)), c.get(MBX(5, 27, 12))]);
    assert.equal(f.calls.length, 1);
    assert.equal(a.ok && b.ok, true);
    assert.equal(a.hit, false);
    const again = await c.get(MBX(5, 27, 12, 'pk.OTHER'));
    assert.equal(f.calls.length, 1, '두 번째는 디스크');
    assert.equal(again.hit, true);
    assert.equal(again.type, 'image/jpeg');
    assert.deepEqual(Buffer.from(again.body), Buffer.from(a.body));
    // 새 캐시(앱 다시 켬)도 디스크에서
    const f2 = fakeFetch(() => ({}));
    const c2 = createTileCache({ dir, fetch: f2 });
    assert.equal((await c2.get(MBX(5, 27, 12))).hit, true);
    assert.equal(f2.calls.length, 0);
    // 디스크 어디에도 토큰이 없다
    const all = [];
    const walk = (d) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else all.push(fs.readFileSync(p, 'latin1') + n); } };
    walk(dir);
    assert.ok(all.length >= 2);
    assert.ok(all.every((s) => !s.includes('SECRET')));
  } finally { rm(dir); }
});

test('허용 밖 주소는 받지 않는다(denied) — 웹앱이 그냥 fetch로', async () => {
  const dir = tmpDir();
  try {
    const f = fakeFetch(() => ({}));
    const c = createTileCache({ dir, fetch: f });
    assert.deepEqual(await c.get('https://example.com/a.png'), { ok: false, err: 'denied' });
    assert.equal(f.calls.length, 0);
  } finally { rm(dir); }
});

test('기한 — 타일 30일, 목록(TileJSON)은 서버 max-age(없으면 1시간), no-store·실패는 저장 안 함', async () => {
  const dir = tmpDir();
  try {
    let t = 1e12;
    const f = fakeFetch((u) => (u.includes('nostore') ? { cc: 'no-store', type: 'application/json', body: '{}' }
      : u.endsWith('/planet') ? { cc: 'max-age=600', type: 'application/json', body: '{"tiles":["x"]}' }
        : u.includes('/404/') ? { status: 404 } : {}));
    const c = createTileCache({ dir, fetch: f, now: () => t });
    await c.get(OFM(5, 27, 12));
    await c.get('https://tiles.openfreemap.org/planet');
    await c.get('https://tiles.openfreemap.org/planet/nostore');
    assert.deepEqual(await c.get(OFM(404, 1, 1)), { ok: false, err: 'http', status: 404 });
    const n0 = f.calls.length;
    t += 9 * 60000;   // 9분 — 둘 다 디스크
    await c.get(OFM(5, 27, 12)); await c.get('https://tiles.openfreemap.org/planet');
    assert.equal(f.calls.length, n0);
    await c.get('https://tiles.openfreemap.org/planet/nostore');   // no-store는 매번 받는다
    assert.equal(f.calls.length, n0 + 1);
    t += 2 * 60000;   // 11분 — 목록은 다시, 타일은 그대로
    await c.get(OFM(5, 27, 12)); await c.get('https://tiles.openfreemap.org/planet');
    assert.equal(f.calls.length, n0 + 2);
    assert.equal(f.calls[f.calls.length - 1], 'https://tiles.openfreemap.org/planet');
    t += TILE_AGE;   // 30일 넘음 — 타일도 다시
    await c.get(OFM(5, 27, 12));
    assert.equal(f.calls.length, n0 + 3);
  } finally { rm(dir); }
});

test('인터넷이 안 되면 기한 지난 타일이라도 준다(stale), 처음 보는 타일은 실패', async () => {
  const dir = tmpDir();
  try {
    let t = 1e12, down = false;
    const f = fakeFetch(() => (down ? 'net' : {}));
    const c = createTileCache({ dir, fetch: f, now: () => t });
    await c.get(MBX(6, 54, 24));
    down = true; t += TILE_AGE + 1;
    const r = await c.get(MBX(6, 54, 24));
    assert.equal(r.ok, true); assert.equal(r.stale, true);
    const miss = await c.get(MBX(6, 54, 25));
    assert.equal(miss.ok, false); assert.equal(miss.err, 'net');
    assert.equal(c.stats.stale, 1); assert.equal(c.stats.fail, 1);
  } finally { rm(dir); }
});

test('용량 상한 — 넘으면 오래 안 쓴 것(마지막 사용 시각)부터 85%까지 지운다', async () => {
  const dir = tmpDir();
  try {
    let t = 1e12;
    const f = fakeFetch(() => ({ body: 'x'.repeat(1000) }));
    const c = createTileCache({ dir, fetch: f, now: () => t, maxBytes: 5500 });
    for (let i = 0; i < 5; i++) { t += 1000; await c.get(OFM(7, i, 0)); }
    t += 1000; assert.equal((await c.get(OFM(7, 0, 0))).hit, true);   // 0번을 방금 씀 → 가장 오래 안 쓴 건 1번
    await new Promise((r) => setTimeout(r, 30));   // utimes(마지막 사용) 반영
    t += 1000; await c.get(OFM(7, 5, 0));   // 6000 > 5500 → 정리
    await c.prune();
    const f2 = fakeFetch(() => ({ body: 'x'.repeat(1000) }));
    const c2 = createTileCache({ dir, fetch: f2, now: () => t, maxBytes: 5500 });
    for (const i of [0, 5]) assert.equal((await c2.get(OFM(7, i, 0))).hit, true, '최근 것 ' + i);
    assert.equal((await c2.get(OFM(7, 1, 0))).hit, false, '가장 오래 안 쓴 1번은 지워짐');
  } finally { rm(dir); }
});

test('배선 — main.js: 메인 창 주 프레임만·LOCALAPPDATA\\WeatherCG\\tile-cache(점검은 임시 프로필)·앱 기본 세션(프록시 로그인 공유) · preload: tileGet', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const h = main.slice(main.indexOf("ipcMain.handle('wcg:tile-get'"));
  assert.match(h, /^ipcMain\.handle\('wcg:tile-get', \(e, u\) => \{\r?\n {2}if \(!jtwcCallerOk\(e\)\) return \{ ok: false, err: 'denied', detail: 'sender' \};/);
  assert.match(main, /path\.join\(process\.env\.LOCALAPPDATA \|\| app\.getPath\('userData'\), INSTALL_TEST \? 'WeatherCG-installtest' : 'WeatherCG'\)/);   // 설치 시험판만 따로(업데이트 시험 — 10-12)
  assert.match(main, /TEST_MODE \? app\.getPath\('userData'\)/);
  assert.match(main, /fetch: \(u, init\) => session\.defaultSession\.fetch\(u, init\)/);   // 웹앱과 같은 프록시·프록시 로그인
  const pre = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.match(pre, /tileGet: \(u\) => ipcRenderer\.invoke\('wcg:tile-get', String\(u \|\| ''\)\),/);
});
