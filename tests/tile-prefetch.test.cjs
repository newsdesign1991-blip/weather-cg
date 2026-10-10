// 지도 타일 — 디스크 캐시 길(tileFetch·가벼운 지도 wcgtile://)과 렌더 전 미리 받기(사용자 10-10: 버튼 없이 렌더를 누르면 알아서).
// 카메라 키가 있으면 모든 프레임에 필요한 타일(Mapbox 그림 타일·가벼운 지도 벡터 타일)을 먼저 받고, 렌더 루프 셋(MP4·PNG·MXF/MOV)이 다 부른다.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');

const html = appSource(path.join(__dirname, '..', 'index.html'));
const fn = (name) => { const m = new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html); assert.ok(m, name); return m[0]; };
const cst = (name) => { const m = new RegExp(`const ${name} = [^\\n]*;`).exec(html); assert.ok(m, name); return m[0]; };
const PROJ = { cx0: 2.2223878893370497, cy0: 0.6813549253753549, scale: 9730.769123924629 };   // map-data.js 그대로
const TMPL = 'https://api.mapbox.com/styles/v1/u/s/tiles/256/{z}/{x}/{y}@2x?access_token=pk.T';
const OFM = 'https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf';
const KOREA = { x: 860, y: 377, s: 0.307, rx: 0, ry: 0, rz: 0 };   // 힌남노 샘플 첫 화면
const ZOOMED = { x: -2300, y: -400, s: 1.4, rx: 0, ry: 0, rz: 0 };

function ctx(extra) {
  const c = Object.assign({
    S: { res: '1920x1080', map: { ...KOREA }, typhoon: { basemap: 'mapbox' } },
    MAP: { proj: PROJ }, RES: { '1920x1080': { size: [1920, 1080] }, '1920x1080-vf': { size: [1920, 1080] } },
    CAM_BLEED: 1.0, Math, JSON, Promise, Set, Array, Uint8Array, TextDecoder, TextEncoder, performance: { now: () => 0 },
    window: {}, _exportingFrames: false, _mbxCacheBust: '', _tileData: {},
    camActive3d: () => false, mapboxTileTemplate: () => TMPL, isTyphoon: () => true,
  }, extra || {});
  vm.createContext(c);
  vm.runInContext([
    cst('_lon2xt'), cst('_lat2yt'), fn('mapboxTileSet'), fn('mapboxTileUrl'), cst('camTilted'), fn('mapboxPrefetchUrls'),
    cst('GLB_TILES'), cst('GLB_SNAP_MAX'), cst('GLB_MERC_LAT'), cst('GLB_PROTO'), 'const _glb = { proto: false, tj: null, tjAt: 0 };',
    fn('glbView'), fn('glbBand'), fn('glbTransform'), fn('glbProtoLoad'), fn('glbTileJson'), fn('glbPrefetchUrls'), fn('prefetchRenderTiles'),
  ].join('\n'), c);
  return c;
}
const plain = (o) => JSON.parse(JSON.stringify(o));   // vm 안 객체(다른 realm) 비교용
const zxy = (u) => { const m = /\/(\d+)\/(\d+)\/(\d+)(?:@2x|\.pbf)/.exec(u); return m ? m.slice(1).map(Number) : null; };
const tileOf = (lon, lat, z) => { const n = 2 ** z, r = lat * Math.PI / 180; return [Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)]; };

test('Mapbox 타일 범위 — 화면(여백 포함)을 덮고, 상한을 넘으면 배율을 낮춘다', () => {
  const c = ctx();
  const a = c.mapboxTileSet(KOREA, 0.3, 140);
  assert.ok(a.z >= 2 && a.z <= 9);
  assert.ok((a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1) <= 140);
  // 한반도(127E·37N)와 샘플 현재 위치(124.6E·27.7N)는 화면 안 → 그 타일이 범위 안
  for (const [lo, la] of [[127, 37], [124.6, 27.7]]) { const [tx, ty] = tileOf(lo, la, a.z); assert.ok(tx >= a.x0 && tx <= a.x1 && ty >= a.y0 && ty <= a.y1, lo + ',' + la); }
  const b = c.mapboxTileSet(ZOOMED, 0.3, 140);
  assert.ok(b.z > a.z, '확대하면 배율이 오른다');
  const wide = c.mapboxTileSet(KOREA, 1.0, 300);   // 추출 여백(CAM_BLEED)
  assert.ok((wide.x1 - wide.x0 + 1) * (wide.y1 - wide.y0 + 1) <= 300);
  assert.ok(wide.y0 >= 0 && wide.y1 < wide.n);
});

test('Mapbox 미리 받기 주소 — 카메라 프레임마다의 추출 범위를 합친 것(중복 없음, 토큰·재publish 표시 유지)', () => {
  const c = ctx();
  const one = c.mapboxPrefetchUrls([KOREA]);
  const both = c.mapboxPrefetchUrls([KOREA, ZOOMED, KOREA]);
  assert.ok(one.length > 0);
  assert.equal(new Set(both).size, both.length);
  assert.ok(one.every((u) => both.includes(u)));
  assert.ok(both.length > one.length);
  assert.ok(both.every((u) => u.includes('access_token=pk.T')));
  const t = c.mapboxTileSet(KOREA, 0.3, 300);   // 평면 프레임 = 화면 여백(0.3)
  assert.equal(one.length, (t.x1 - t.x0 + 1) * (t.y1 - t.y0 + 1));
  const tilt = c.mapboxPrefetchUrls([{ ...KOREA, rx: 40 }]), tb = c.mapboxTileSet(KOREA, 1.0, 300);   // 기울인 프레임 = 블리드(CAM_BLEED)
  assert.equal(tilt.length, (tb.x1 - tb.x0 + 1) * (tb.y1 - tb.y0 + 1));
  assert.ok(tilt.length > one.length);
  vm.runInContext("_mbxCacheBust = '42'", c);
  assert.ok(c.mapboxPrefetchUrls([KOREA]).every((u) => u.endsWith('&_cb=42')));
});

test('가벼운 지도 — 데스크톱이면 OpenFreeMap 주소만 wcgtile://(디스크 캐시 길), 목록은 JSON·타일은 ArrayBuffer로', async () => {
  const got = [];
  const c = ctx({ tileFetch: async (u) => { got.push(u); return { data: new TextEncoder().encode(u.endsWith('/planet') ? '{"tiles":["x"]}' : 'PBF'), type: '' }; } });
  assert.deepEqual(plain(c.glbTransform('https://tiles.openfreemap.org/planet')), { url: 'https://tiles.openfreemap.org/planet' }, '프로토콜 안 걸었으면 그대로');
  vm.runInContext('_glb.proto = true', c);
  assert.deepEqual(plain(c.glbTransform('https://tiles.openfreemap.org/planet')), { url: 'wcgtile://tiles.openfreemap.org/planet' });
  assert.deepEqual(plain(c.glbTransform('https://example.com/a.json')), { url: 'https://example.com/a.json' });
  assert.deepEqual(plain(c.glbTransform('http://tiles.openfreemap.org/planet')), { url: 'http://tiles.openfreemap.org/planet' });
  const j = await c.glbProtoLoad({ url: 'wcgtile://tiles.openfreemap.org/planet', type: 'json' });
  assert.deepEqual(JSON.parse(JSON.stringify(j.data)), { tiles: ['x'] });
  const t = await c.glbProtoLoad({ url: 'wcgtile://tiles.openfreemap.org/planet/v1/5/27/12.pbf', type: 'arrayBuffer' });
  assert.equal(Object.prototype.toString.call(t.data), '[object ArrayBuffer]');
  assert.equal(Buffer.from(t.data).toString(), 'PBF');
  assert.deepEqual(got, ['https://tiles.openfreemap.org/planet', 'https://tiles.openfreemap.org/planet/v1/5/27/12.pbf']);
});

test('가벼운 지도 미리 받기 주소 — 추출 그림과 같은 배율(내림)·영역, 기울인 프레임은 블리드까지', async () => {
  const c = ctx({ tileFetch: async () => ({ data: new TextEncoder().encode(JSON.stringify({ tiles: [OFM], minzoom: 0, maxzoom: 14 })), type: 'application/json' }) });
  const flat = await c.glbPrefetchUrls([KOREA]);
  assert.ok(flat.length > 0);
  const z = Math.floor(Math.log2(2 * Math.PI * PROJ.scale * KOREA.s * 1 / 512));
  assert.ok(flat.every((u) => zxy(u)[0] === z), '평면 1920 = 배율 floor(zoom)');
  const [tx, ty] = tileOf(127, 37, z);
  assert.ok(flat.some((u) => { const [, x, y] = zxy(u); return x === tx && y === ty; }), '한반도 타일 포함');
  const tilt = await c.glbPrefetchUrls([{ ...KOREA, rx: 40 }]);
  assert.ok(tilt.length > flat.length, '기울이면 블리드 영역까지');
  const zt = zxy(tilt[0])[0];
  assert.ok(zt <= z, '블리드 그림은 4096으로 줄여 굽는다 → 배율이 같거나 낮다');
  const many = await c.glbPrefetchUrls([KOREA, ZOOMED]);
  assert.ok(many.length > flat.length && new Set(many).size === many.length);
});

test('렌더 전 미리 받기 — 카메라 키가 있을 때만, 동시 12개, 진행 표시, 실패는 알림만(렌더 중 다시 받기)', async () => {
  const prog = [], st = [];
  let live = 0, peak = 0;
  const fetched = [];
  const keys = [{ t: 0, ...KOREA }, { t: 2, ...ZOOMED }];
  const c = ctx({
    camKeys: () => keys, camAt: (t) => { const p = Math.min(1, t / 2); return { x: KOREA.x + (ZOOMED.x - KOREA.x) * p, y: KOREA.y + (ZOOMED.y - KOREA.y) * p, s: KOREA.s + (ZOOMED.s - KOREA.s) * p, rx: 0, ry: 0, rz: 0 }; },
    glbActive: () => false,
    exportProgress: (d, n, l) => prog.push([d, n, l]), status: (m) => st.push(m),
    fetchTileData: async (u, quiet) => { assert.equal(quiet, true); live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 2)); live--; fetched.push(u); return u.includes('/9/') ? null : 'data:x'; },
  });
  await c.prefetchRenderTiles(60, 30);
  const want = c.mapboxPrefetchUrls(Array.from({ length: 61 }, (_, i) => c.camAt(i / 30)));
  assert.equal(fetched.length, want.length);
  assert.ok(peak <= 12 && peak >= 2, 'peak ' + peak);
  assert.deepEqual(prog[0], [0, want.length, '지도 미리 받는 중']);
  assert.deepEqual(prog[prog.length - 1], [want.length, want.length, '지도 미리 받는 중']);
  const nFail = fetched.filter((u) => u.includes('/9/')).length;
  if (nFail) assert.match(st[0], new RegExp(`지도 타일 ${nFail}개를 미리 못 받았어요`)); else assert.equal(st.length, 0);
  // 이미 받은 건 건너뛴다
  fetched.length = 0; for (const u of want) c._tileData[u] = 'data:x';
  await c.prefetchRenderTiles(60, 30);
  assert.equal(fetched.length, 0);
  // 카메라 키가 없으면(지도 고정) 아무것도 안 한다 · 파란/위성 지도도
  keys.length = 0; await c.prefetchRenderTiles(60, 30); assert.equal(fetched.length, 0);
  keys.push({ t: 0, ...KOREA }); c.S.typhoon.basemap = 'satdark'; await c.prefetchRenderTiles(60, 30); assert.equal(fetched.length, 0);
});

test('가벼운 지도 렌더 전 미리 받기 — 벡터 타일을 tileFetch로(디스크 캐시에 남김)', async () => {
  const got = [];
  const c = ctx({
    camKeys: () => [{ t: 0 }], camAt: () => ({ ...KOREA }), glbActive: () => true, exportProgress: () => {}, status: () => {},
    tileFetch: async (u) => { got.push(u); return { data: new TextEncoder().encode(u.endsWith('/planet') ? JSON.stringify({ tiles: [OFM], maxzoom: 14 }) : 'PBF'), type: '' }; },
  });
  c.S.typhoon.basemap = 'gl';
  await c.prefetchRenderTiles(10, 30);
  const tiles = got.filter((u) => u.endsWith('.pbf'));
  assert.ok(tiles.length > 0);
  assert.equal(new Set(tiles).size, tiles.length);
  assert.equal(got[0], 'https://tiles.openfreemap.org/planet');
  c.S.res = '1920x1080-vf'; got.length = 0;   // 노말 VF는 가벼운 지도를 안 씀(파란 지도)
  await c.prefetchRenderTiles(10, 30); assert.equal(got.length, 0);
});

test('tileFetch — 디스크 캐시 길이 안 되면 그냥 fetch로(옛 메인·메인 실패), 서버 4xx는 그대로 실패, 연달아 3번이면 이번 실행 동안 끔', async () => {
  const mk = (tileGet) => {
    const net = [];
    const c = {
      window: { wcgDesktop: tileGet ? { tileGet } : undefined }, Uint8Array, Error,
      fetch: async (u) => { net.push(u); return { ok: !u.includes('404'), status: u.includes('404') ? 404 : 200, arrayBuffer: async () => new TextEncoder().encode('NET').buffer, headers: { get: () => 'image/jpeg' } }; },
    };
    vm.createContext(c);
    vm.runInContext('let _tileIpcOff = false, _tileIpcMiss = 0;\n' + fn('tileFetch') + '\nthis.st = () => ({ off: _tileIpcOff, miss: _tileIpcMiss });', c);
    c.net = net;
    return c;
  };
  const txt = (r) => Buffer.from(r.data).toString();
  // 메인에 받는 곳이 없음(앱을 새로 안 켬) → fetch, 다음부터는 메인을 안 부른다
  let calls = 0;
  let c = mk(async () => { calls++; throw new Error("No handler registered for 'wcg:tile-get'"); });
  assert.equal(txt(await c.tileFetch('https://api.mapbox.com/a/1/2/3')), 'NET');
  assert.equal(txt(await c.tileFetch('https://api.mapbox.com/a/1/2/4')), 'NET');
  assert.equal(calls, 1); assert.equal(c.st().off, true);
  // 메인이 받음 → fetch 안 함
  c = mk(async () => ({ ok: true, body: new TextEncoder().encode('DISK'), type: 'image/png' }));
  assert.equal(txt(await c.tileFetch('https://api.mapbox.com/a/1/2/3')), 'DISK'); assert.equal(c.net.length, 0);
  // 서버가 404라고 답함 → 다시 안 받고 실패
  c = mk(async () => ({ ok: false, err: 'http', status: 404 }));
  await assert.rejects(c.tileFetch('https://api.mapbox.com/a/9/9/9'), /tile http 404/); assert.equal(c.net.length, 0);
  // 캐시가 거절한 주소(허용 밖) → fetch, 끄지 않음
  c = mk(async () => ({ ok: false, err: 'denied' }));
  assert.equal(txt(await c.tileFetch('https://example.com/x.png')), 'NET'); assert.equal(c.st().off, false);
  // 메인은 연결 실패(사내 프록시 등)인데 fetch는 됨 → 3번째에 끈다
  calls = 0;
  c = mk(async () => { calls++; return { ok: false, err: 'net' }; });
  for (let i = 0; i < 4; i++) assert.equal(txt(await c.tileFetch('https://api.mapbox.com/a/1/2/' + i)), 'NET');
  assert.equal(calls, 3); assert.equal(c.st().off, true);
});

test('배선 — 렌더 루프 셋(MP4·PNG 시퀀스·MXF/MOV)이 _exportingFrames를 켠 뒤 미리 받기, Mapbox 화면 타일은 받은 data URI로(디스크 캐시 경유)', () => {
  for (const f of ['bakeMp4', 'exportPngSeq', 'wnsRender']) {
    const src = fn(f);
    const a = src.indexOf('_exportingFrames = true'), b = src.indexOf('await prefetchRenderTiles(');
    assert.ok(a > 0 && b > a, f);
    const first = f === 'wnsRender' ? src.indexOf('await sendFrameMain(0)') : src.indexOf('await drawExportFrame(');
    assert.ok(b < first, f + ': 첫 프레임 전에');
  }
  const up = fn('updateMapboxTiles');
  assert.doesNotMatch(up, /setAttribute\('href', url\)/, '화면 <image>가 타일 서버로 따로 받지 않는다');
  assert.match(up, /im\.setAttribute\('href', _tileData\[url\]\)/);
  assert.match(fn('fetchTileData'), /tileFetch\(url\)/);
  assert.match(html, /transformRequest: glbTransform/);
});
