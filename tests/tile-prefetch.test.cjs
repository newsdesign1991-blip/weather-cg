// 지도 타일 — 디스크 캐시 길(tileFetch·WebGL 지도 wcgtile://)과 렌더 전 미리 받기(사용자 10-10: 버튼 없이 렌더를 누르면 알아서).
// 카메라 키가 있으면 모든 프레임에 필요한 타일(가벼운 지도 벡터·위성 그림 타일, Mapbox 실시간 타일의 그림 타일 — 10-12부터 같은 WebGL 길)을 먼저 받고,
// 렌더 루프 셋(MP4·PNG·MXF/MOV)이 다 부른다.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');

const html = appSource(path.join(__dirname, '..', 'index.html'));
const fn = (name) => { const m = new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html); assert.ok(m, name); return m[0]; };
const cst = (name) => { const m = new RegExp(`const ${name} = [^\\n]*;`).exec(html); assert.ok(m, name); return m[0]; };
const PROJ = { cx0: 2.2223878893370497, cy0: 0.6813549253753549, scale: 9730.769123924629 };   // map-data.js 그대로
const OFM = 'https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf';
const KOREA = { x: 860, y: 377, s: 0.307, rx: 0, ry: 0, rz: 0 };   // 힌남노 샘플 첫 화면
const ZOOMED = { x: -2300, y: -400, s: 1.4, rx: 0, ry: 0, rz: 0 };

function ctx(extra) {
  const c = Object.assign({
    S: { res: '1920x1080', map: { ...KOREA }, typhoon: { basemap: 'gl' } },
    MAP: { proj: PROJ }, RES: { '1920x1080': { size: [1920, 1080] }, '1920x1080-vf': { size: [1920, 1080] } },
    CAM_BLEED: 1.0, Math, JSON, Promise, Set, Array, Uint8Array, TextDecoder, TextEncoder, performance: { now: () => 0 }, setTimeout,
    window: {}, _exportingFrames: false, _mbxCacheBust: '', glbActive: () => true,
    exportCancelled: () => false, exportCancelCheck: () => {}, exportCancelSignal: () => undefined,   // [렌더 취소](js/modals-notices.js) — 여기선 안 누름(누를 때는 tests/render-cancel.test.cjs)
    camActive3d: () => false, isTyphoon: () => true,
    mapboxUrlRaw: () => '',   // 넣어 둔 Mapbox 주소(가벼운 지도 위성 사진·Mapbox 실시간 타일 출처) — 기본은 없음
  }, extra || {});
  vm.createContext(c);
  vm.runInContext([
    cst('_lon2xt'), cst('_lat2yt'),
    cst('GLB_TILES'), cst('GLB_ATTR'), cst('GLB_ATTR_MBX'), cst('GLB_ATTR_MBXS'), cst('GLB_ATTR_XYZ'), cst('GLB_SAT_MAXZ'), cst('GLB_XYZ_MAXZ'), cst('GLB_SAT_STYLE'),
    cst('GLB_SNAP_MAX'), cst('GLB_MERC_LAT'), cst('GLB_PROTO'), cst('GLB_WAIT_MS'), cst('glbSleep'),
    "const _glb = { state: 'ready', proto: false, tj: null, tjAt: 0, satBad: '', mbRaw: null, mbBust: null, mbDef: null, mbSrc: null, mxRaw: null, mxBust: null, mxSrc: null };",
    fn('glbMode'), cst('glbIsMbx'),
    fn('glbSatBuiltinUrl'), fn('glbSatSrc'), fn('glbMbxSrc'), fn('glbMbxSrcNow'), fn('glbSatSrcNow'), cst('glbSatPref'), fn('glbSatNow'), fn('glbSnapBox'), cst('glbPending'), fn('glbSettle'),
    fn('glbView'), fn('glbBand'), fn('glbTransform'), fn('glbProtoLoad'), fn('glbTileJson'), fn('glbPrefetchUrls'), fn('prefetchRenderTiles'),
  ].join('\n'), c);
  return c;
}
const plain = (o) => JSON.parse(JSON.stringify(o));   // vm 안 객체(다른 realm) 비교용
const zxy = (u) => { const m = /\/(\d+)\/(\d+)\/(\d+)(?:@2x|\.pbf|\.png)/.exec(u); return m ? m.slice(1).map(Number) : null; };
const tileOf = (lon, lat, z) => { const n = 2 ** z, r = lat * Math.PI / 180; return [Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)]; };

// ---------- Mapbox 실시간 타일(10-12 — WebGL, 가짜 토큰 pk.T만) ----------
const MBX_CARTO = 'https://api.mapbox.com/styles/v1/u/s/tiles/256/{z}/{x}/{y}@2x?access_token=pk.T';   // Studio Share → Third party → CARTO 꼴
const MBX_512 = 'https://api.mapbox.com/styles/v1/u/s/tiles/512/';
const XYZ = 'https://tiles.example.com/{z}/{x}/{y}.png';

test('Mapbox 실시간 타일 미리 받기 주소 — 가벼운 지도 위성 사진과 같은 길(Static Tiles 512 = MapLibre 반올림 배율), 넣어 둔 주소만(기본 토큰 안 씀), 재publish 표시, 다른 서버 {z}/{x}/{y} 틀은 256(+1)', async () => {
  let url = MBX_CARTO;
  const got = [];
  const c = ctx({ mapboxUrlRaw: () => url, window: { wcgDesktop: { mapboxToken: () => 'pk.TESTDEFAULT.fake' } }, tileFetch: async (u) => { got.push(u); return { data: new TextEncoder().encode(JSON.stringify({ tiles: [OFM], maxzoom: 14 })), type: '' }; } });
  c.S.typhoon = { basemap: 'mapbox' };
  const z = Math.round(Math.log2(2 * Math.PI * PROJ.scale * KOREA.s * 1 / 512));   // 평면 1920 px = 화면 배율 그대로, 래스터 = 반올림
  const one = await c.glbPrefetchUrls([KOREA]);
  assert.ok(one.length > 0 && one.every((u) => u.startsWith(MBX_512) && u.endsWith('@2x?access_token=pk.T')), one[0]);
  assert.ok(one.every((u) => zxy(u)[0] === z), '배율 ' + zxy(one[0])[0] + ' = ' + z);
  const [tx, ty] = tileOf(127, 37, z);
  assert.ok(one.some((u) => { const [, x, y] = zxy(u); return x === tx && y === ty; }), '한반도 타일 포함');
  const both = await c.glbPrefetchUrls([KOREA, ZOOMED, KOREA]);
  assert.equal(new Set(both).size, both.length, '중복 없음');
  assert.ok(one.every((u) => both.includes(u)) && both.length > one.length);
  const tilt = await c.glbPrefetchUrls([{ ...KOREA, rx: 40 }]);
  assert.ok(tilt.length > one.length, '기울인 프레임 = 블리드까지');
  assert.equal(got.length, 0, 'TileJSON·벡터 타일 안 받음');
  vm.runInContext("_mbxCacheBust = '42'", c);
  assert.ok((await c.glbPrefetchUrls([KOREA])).every((u) => u.endsWith('&_cb=42')), "'적용'(재publish) = 새 주소");
  vm.runInContext("_mbxCacheBust = ''", c);
  // 다른 지도 서버의 타일 틀(옛 Mapbox 모드가 받던 것) — 256 → 배율 +1, 토큰 없어도
  url = XYZ;
  const x = await c.glbPrefetchUrls([KOREA]);
  assert.ok(x.length > 0 && x.every((u) => u.startsWith('https://tiles.example.com/') && zxy(u)[0] === Math.round(Math.log2(2 * Math.PI * PROJ.scale * KOREA.s / 512) + 1)), x[0]);
  // 넣어 둔 주소 없음·못 알아봄·한 장도 못 받은 주소 = 0장(파란 지도로 그림 — 기본 토큰·벡터 타일도 안 받음)
  for (const bad of ['', 'https://api.mapbox.com/styles/v1/u/s/wmts', 'mapbox://styles/u/s', 'https://api.mapbox.com/styles/v1/u/s/wmts?access_token=sk.SECRET']) {
    url = bad; assert.deepEqual(plain(await c.glbPrefetchUrls([KOREA])), [], JSON.stringify(bad));
  }
  url = MBX_CARTO; vm.runInContext("_glb.satBad = glbMbxSrcNow().tiles[0]", c);
  assert.deepEqual(plain(await c.glbPrefetchUrls([KOREA])), []);
  assert.equal(got.length, 0);
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

test('렌더 전 미리 받기(Mapbox 실시간 타일) — 카메라 키가 있을 때만, 동시 8개, 진행 표시, 실패는 알림만(렌더 중 다시 받기), 다른 배경·노말 VF는 안 함', async () => {
  const prog = [], st = [];
  let live = 0, peak = 0, bm = 'mapbox';
  const fetched = [];
  const keys = [{ t: 0, ...KOREA }, { t: 2, ...ZOOMED }];
  const c = ctx({
    mapboxUrlRaw: () => MBX_CARTO,
    camKeys: () => keys, camAt: (t) => { const p = Math.min(1, t / 2); return { x: KOREA.x + (ZOOMED.x - KOREA.x) * p, y: KOREA.y + (ZOOMED.y - KOREA.y) * p, s: KOREA.s + (ZOOMED.s - KOREA.s) * p, rx: 0, ry: 0, rz: 0 }; },
    glbActive: () => bm === 'mapbox' || bm === 'gl',
    exportProgress: (d, n, l) => prog.push([d, n, l]), status: (m) => st.push(m),
    tileFetch: async (u) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 2)); live--; fetched.push(u); if (/\/512\/9\//.test(u)) throw new Error('tile http 404'); return { data: new Uint8Array([1]), type: 'image/jpeg' }; },
  });
  c.S.typhoon = { basemap: 'mapbox' };
  await c.prefetchRenderTiles(60, 30);
  const want = await c.glbPrefetchUrls(Array.from({ length: 61 }, (_, i) => c.camAt(i / 30)));
  assert.deepEqual([...fetched].sort(), [...want].sort(), '카메라 키 프레임마다의 그림 타일 = 추출 때 숨은 지도가 쓸 것');
  assert.ok(fetched.every((u) => u.startsWith(MBX_512)));
  assert.ok(peak <= 8 && peak >= 2, 'peak ' + peak);
  assert.deepEqual(prog[0], [0, want.length, '지도 미리 받는 중']);
  assert.deepEqual(prog[prog.length - 1], [want.length, want.length, '지도 미리 받는 중']);
  const nFail = fetched.filter((u) => /\/512\/9\//.test(u)).length;
  if (nFail) assert.match(st[0], new RegExp(`지도 타일 ${nFail}개를 미리 못 받았어요`)); else assert.equal(st.length, 0);
  // 카메라 키가 없으면(지도 고정) 아무것도 안 한다 · 파란/위성 지도·노말 VF도
  fetched.length = 0;
  keys.length = 0; await c.prefetchRenderTiles(60, 30); assert.equal(fetched.length, 0);
  keys.push({ t: 0, ...KOREA }); bm = 'satdark'; c.S.typhoon.basemap = 'satdark'; await c.prefetchRenderTiles(60, 30); assert.equal(fetched.length, 0);
  bm = 'mapbox'; c.S.typhoon.basemap = 'mapbox'; c.S.res = '1920x1080-vf'; await c.prefetchRenderTiles(60, 30); assert.equal(fetched.length, 0);
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

test('배선 — 렌더 루프 셋(MP4·PNG 시퀀스·MXF/MOV)이 _exportingFrames를 켠 뒤 미리 받기, 옛 SVG Mapbox 타일 길(<image> 타일·data URI 캐시)은 없음(10-12 — WebGL)', () => {
  for (const f of ['bakeMp4', 'exportPngSeq', 'wnsRender']) {
    const src = fn(f);
    const a = src.indexOf('_exportingFrames = true'), b = src.indexOf('await prefetchRenderTiles(');
    assert.ok(a > 0 && b > a, f);
    const first = f === 'wnsRender' ? src.indexOf('await sendFrameMain(0)') : src.indexOf('await drawExportFrame(');
    assert.ok(b < first, f + ': 첫 프레임 전에');
  }
  for (const gone of ['updateMapboxTiles', 'scheduleMapboxTiles', 'mapboxTileTemplate', 'mapboxTileSet', 'mapboxTileUrl', 'mapboxPrefetchUrls', 'fetchTileData', 'mbxTileShow', 'mbxDropStale', 'inlineMapboxTiles', 'awaitMapboxTilesReady']) {
    assert.ok(!new RegExp(`\\b${gone}\\b`).test(html), '옛 이름이 남음: ' + gone);
  }
  assert.ok(!/_tileData|id="typhoonTiles"|#typhoonTiles/.test(html), '옛 <image> 타일 그룹·data URI 캐시 없음');
  assert.match(html, /transformRequest: glbTransform/);
  assert.match(fn('prefetchRenderTiles'), /if \(!glbActive\(\) \|\| S\.res === '1920x1080-vf'\) return;/);
  assert.match(fn('prefetchRenderTiles'), /const todo = await glbPrefetchUrls\(cams\);/);
});

// ---------- 가벼운 지도 위성 사진(10-10) — 가짜 토큰(pk.TEST)만 ----------
const SAT_STYLE = 'https://api.mapbox.com/styles/v1/user1/ckstyle01/wmts?access_token=pk.TEST';
const SAT_V4 = 'https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.png?access_token=pk.TEST';
const FRAC = { x: 860, y: 377, s: 0.44, rx: 0, ry: 0, rz: 0 };   // zoom ≈ 5.71 — 내림(5)과 반올림(6)이 갈린다
const fs = require('node:fs');
// MapLibre 소스(vendor — 고치지 않은 원본) 그대로의 coveringZoomLevel: z = (roundZoom ? round : floor)(zoom + log2(transform.tileSize / source.tileSize)), 0 아래면 0
const ML = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'maplibre-gl', 'maplibre-gl.js'), 'utf8');
const mlCe = (() => {
  const m = /function Ce\(e,i\)\{const o=\(i\.roundZoom\?Math\.round:Math\.floor\)\(e\.zoom\+t\.ar\(e\.tileSize\/i\.tileSize\)\);return Math\.max\(0,o\)\}/.exec(ML);
  assert.ok(m, 'MapLibre coveringZoomLevel 코드가 바뀌었다 — glbPrefetchUrls의 배율 규칙을 다시 맞출 것');
  assert.ok(ML.includes('t.ar=function(t){return Math.log(t)/Math.LN2}'), 't.ar = log2');
  const c = vm.createContext({ Math, t: { ar: (x) => Math.log(x) / Math.LN2 } });
  vm.runInContext(m[0] + ';globalThis.Ce = Ce;', c);
  return c.Ce;
})();
// 앱의 추출 한 장(glbInlineClone → glbSnapBox → glbSnap)과 따로 쓴 배율 — 평면 프레임 1920 px, 기울이면 블리드(3배)를 한 변 4096으로 줄여
function snapZoom(c, W) {
  const tilt = Math.abs(c.rx) > 0.05 || Math.abs(c.ry) > 0.05 || Math.abs(c.rz) > 0.05, B = tilt ? 1 : 0;
  const vbw = 1920 * (1 + 2 * B), vbh = 1080 * (1 + 2 * B), vby = -1080 * B;
  const b0 = c.y + (-(Math.PI - PROJ.cy0) * PROJ.scale) * c.s, b1 = c.y + ((Math.PI + PROJ.cy0) * PROJ.scale) * c.s;
  const y0 = Math.max(vby, b0), y1 = Math.min(vby + vbh, b1);
  let pw = Math.round(W * (1 + 2 * B)), ph = Math.round((y1 - y0) * pw / vbw);
  const f = Math.min(1, 4096 / pw, 4096 / ph); if (f < 1) pw = Math.round(pw * f);
  return Math.log2(2 * Math.PI * PROJ.scale * c.s * (pw / vbw) / 512);
}

test('MapLibre 배율 규칙(소스 코드 확인): 평면(pitch 0)은 화면 전체가 coveringZoomLevel 한 배율 — 벡터 512 = 내림, 그림 타일(roundZoom) = 반올림, 256 소스는 +1', () => {
  // 메르카토르의 '배율을 거리마다 바꾸기'는 기울였을 때(pitch > 78.5 − fov/2)나 지형일 때만 — 우리 지도는 pitch 0(틸트는 그림으로 굽는다)
  assert.ok(ML.includes('allowVariableZoom(e,i){const o=e.fov*(Math.abs(Math.cos(e.rollInRadians))*e.height+Math.abs(Math.sin(e.rollInRadians))*e.width)/e.height,a=t.al(78.5-o/2,0,60);return !!i.terrain||e.pitch>a}'));
  assert.ok(ML.includes('l=n.allowVariableZoom(e,i),c=Ce(e,i)') && ML.includes('let M=c;l&&(M=(i.calculateTileZoom||Pe)'), 'coveringTiles: 고정 배율 = Ce');
  assert.ok(/class q extends t\.E\{constructor\(e,i,o,a\)\{super\(\),this\.id=e,this\.dispatcher=o,this\.setEventedParent\(a\),this\.type="raster",this\.minzoom=0,this\.maxzoom=22,this\.roundZoom=!0/.test(ML), '래스터 소스 = roundZoom');
  // 빈 타일 자리에 부모 타일을 따로 받는 건 그 타일이 실패했을 때만(wasRequested = errored·loaded·reloading — loading은 아님)
  assert.ok(ML.includes('wasRequested(){return "errored"===this.state||"loaded"===this.state||"reloading"===this.state}'));
  for (const zm of [-1.7, 0.2, 2.49, 2.5, 2.51, 5.715, 7.99]) {
    assert.equal(Math.max(0, Math.floor(zm)), mlCe({ zoom: zm, tileSize: 512 }, { roundZoom: false, tileSize: 512 }), '벡터 ' + zm);
    assert.equal(Math.max(0, Math.round(zm)), mlCe({ zoom: zm, tileSize: 512 }, { roundZoom: true, tileSize: 512 }), '그림 512 ' + zm);
    assert.equal(Math.max(0, Math.round(zm + 1)), mlCe({ zoom: zm, tileSize: 512 }, { roundZoom: true, tileSize: 256 }), '그림 256 ' + zm);
  }
});

test('가벼운 지도 위성 사진 — Mapbox 그림 타일도 wcgtile://(디스크 캐시 길, 토큰은 그대로 넘기고 캐시가 열쇠에서 뺀다), 그림은 ArrayBuffer로', async () => {
  const got = [];
  const c = ctx({ tileFetch: async (u) => { got.push(u); return { data: new Uint8Array([0xff, 0xd8, 0xff]), type: 'image/jpeg' }; } });
  const u = 'https://api.mapbox.com/styles/v1/user1/ckstyle01/tiles/512/5/27/12@2x?access_token=pk.TEST';
  assert.deepEqual(plain(c.glbTransform(u)), { url: u }, '프로토콜 안 걸었으면(웹·점검 브리지 없음) 그대로 https — Mapbox CORS *');
  vm.runInContext('_glb.proto = true', c);
  assert.deepEqual(plain(c.glbTransform(u)), { url: 'wcgtile://api.mapbox.com/styles/v1/user1/ckstyle01/tiles/512/5/27/12@2x?access_token=pk.TEST' });
  assert.deepEqual(plain(c.glbTransform('https://api.mapbox.com.evil.example/x')), { url: 'https://api.mapbox.com.evil.example/x' });
  const t = await c.glbProtoLoad({ url: 'wcgtile://api.mapbox.com/styles/v1/user1/ckstyle01/tiles/512/5/27/12@2x?access_token=pk.TEST', type: 'image' });
  assert.equal(Object.prototype.toString.call(t.data), '[object ArrayBuffer]', 'MapLibre가 ImageBitmap으로 푼다(캔버스 오염 없음)');
  assert.deepEqual([...new Uint8Array(t.data)], [0xff, 0xd8, 0xff]);
  assert.deepEqual(got, [u]);
  const { tileUrlOk, cacheKeyUrl, isTilePath } = require('../desktop/tile-cache.js');
  assert.equal(tileUrlOk(u), true); assert.equal(isTilePath(new URL(u).pathname), true, '타일 — 30일');
  assert.ok(!cacheKeyUrl(u).includes('pk.TEST'), '열쇠·파일에 토큰 없음');
});

test('가벼운 지도 위성 사진 미리 받기 — 그림 타일만(TileJSON·벡터 안 받음), 배율 = MapLibre 반올림(512 Static Tiles)·+1(v4 256), 추출 영역을 덮는다', async () => {
  let url = SAT_STYLE;
  const got = [];
  const c = ctx({ mapboxUrlRaw: () => url, tileFetch: async (u) => { got.push(u); return { data: new TextEncoder().encode(JSON.stringify({ tiles: [OFM], maxzoom: 14 })), type: '' }; } });
  c.S.typhoon = { basemap: 'gl', glSat: 1 };
  const cams = [KOREA, FRAC, ZOOMED, { ...FRAC, rx: 40, rz: -12 }, { ...KOREA, s: 0.05 }];
  for (const [u, ts] of [[SAT_STYLE, 512], [SAT_V4, 256]]) {
    url = u; got.length = 0;
    for (const cam of cams) {
      const list = await c.glbPrefetchUrls([cam]);
      assert.ok(list.length > 0, JSON.stringify(cam));
      assert.ok(list.every((x) => x.startsWith('https://api.mapbox.com/') && x.includes('@2x') && x.includes('access_token=pk.TEST')), '위성 그림 타일만');
      const want = Math.min(22, mlCe({ zoom: snapZoom(cam, 1920), tileSize: 512 }, { roundZoom: true, tileSize: ts }));
      assert.ok(list.every((x) => zxy(x)[0] === want), `${ts} 배율 ${zxy(list[0])[0]} = MapLibre ${want} (${JSON.stringify(cam)})`);
      // 프레임(기울이면 블리드) 안 몇 점의 타일이 들어 있다
      const n = 2 ** want, s = cam.s, tilt = cam.rx ? 1 : 0;
      for (const [fx, fy] of [[0.02, 0.05], [0.5, 0.5], [0.98, 0.95], [0.02, 0.95], [0.98, 0.05]]) {
        const x = -1920 * tilt + fx * 1920 * (1 + 2 * tilt), y = -1080 * tilt + fy * 1080 * (1 + 2 * tilt);
        const lon = ((x - cam.x) / s / PROJ.scale + PROJ.cx0) * 180 / Math.PI, my = PROJ.cy0 - (y - cam.y) / s / PROJ.scale;
        const lat = Math.max(-85.05, Math.min(85.05, (2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180 / Math.PI));
        const [tx, ty] = tileOf(lon, lat, want);
        assert.ok(list.some((v) => { const [, X, Y] = zxy(v); return X === ((tx % n) + n) % n && Y === ty; }), `${ts} 점 ${fx},${fy} 타일 ${want}/${tx}/${ty}`);
      }
    }
    assert.equal(got.length, 0, 'TileJSON·벡터 타일 안 받음');
  }
  // 반올림이 내림과 갈리는 화면(zoom 5.71): 위성 512 = 6, 벡터 = 5
  url = SAT_STYLE;
  assert.ok((await c.glbPrefetchUrls([FRAC])).every((x) => zxy(x)[0] === 6));
  c.S.typhoon.glSat = 0;
  const vec = await c.glbPrefetchUrls([FRAC]);
  assert.ok(vec.length && vec.every((x) => x.endsWith('.pbf') && zxy(x)[0] === 5), '벡터만 = 벡터 타일(내림)');
  url = ''; c.S.typhoon.glSat = 1;
  assert.ok((await c.glbPrefetchUrls([FRAC])).every((x) => x.endsWith('.pbf')), 'Mapbox 주소 없음 = 벡터만');
  // 못 받은 위성 주소(satBad) = 벡터만
  url = SAT_STYLE; vm.runInContext("_glb.satBad = 'https://api.mapbox.com/styles/v1/user1/ckstyle01/tiles/512/{z}/{x}/{y}@2x?access_token=pk.TEST'", c);
  assert.ok((await c.glbPrefetchUrls([FRAC])).every((x) => x.endsWith('.pbf')));
});

test('가벼운 지도 위성 사진 렌더 전 미리 받기 — 카메라 키 프레임마다의 그림 타일을 tileFetch로(디스크 캐시), 중복 없음', async () => {
  const got = [];
  const c = ctx({
    mapboxUrlRaw: () => SAT_STYLE,
    camKeys: () => [{ t: 0 }, { t: 2 }], camAt: (t) => { const p = Math.min(1, t / 2); return { x: KOREA.x + (ZOOMED.x - KOREA.x) * p, y: KOREA.y + (ZOOMED.y - KOREA.y) * p, s: KOREA.s + (ZOOMED.s - KOREA.s) * p, rx: 0, ry: 0, rz: 0 }; },
    glbActive: () => true, exportProgress: () => {}, status: () => {},
    tileFetch: async (u) => { got.push(u); return { data: new Uint8Array([1]), type: 'image/jpeg' }; },
  });
  c.S.typhoon = { basemap: 'gl', glSat: 1 };
  await c.prefetchRenderTiles(60, 30);
  assert.ok(got.length > 0 && got.every((u) => u.startsWith('https://api.mapbox.com/styles/v1/user1/ckstyle01/tiles/512/')));
  assert.equal(new Set(got).size, got.length);
  const want = await c.glbPrefetchUrls(Array.from({ length: 61 }, (_, i) => c.camAt(i / 30)));
  assert.deepEqual([...got].sort(), [...want].sort());
});

test('가벼운 지도 렌더 전 미리 받기 — 실패(파란 지도로 그림)면 하나도 안 받고, 불러오는 중이면 끝을 본 뒤 정한다(위성 → 벡터만으로 바뀔 수 있다)', async () => {
  const got = [];
  const c = ctx({
    mapboxUrlRaw: () => SAT_STYLE, camKeys: () => [{ t: 0 }], camAt: () => ({ ...KOREA }), glbActive: () => true, exportProgress: () => {}, status: () => {},
    tileFetch: async (u) => { got.push(u); return { data: new TextEncoder().encode(u.endsWith('/planet') ? JSON.stringify({ tiles: [OFM], maxzoom: 14 }) : 'x'), type: '' }; },
  });
  c.S.typhoon = { basemap: 'gl', glSat: 1 };
  vm.runInContext("_glb.state = 'fail'", c);
  assert.deepEqual(plain(await c.glbPrefetchUrls([KOREA])), []);
  await c.prefetchRenderTiles(10, 30);
  assert.equal(got.length, 0, '실패면 위성 그림 타일(요청마다 Mapbox 사용량)도 벡터 타일도 안 받음');
  // 불러오는 중 → 그사이 위성 타일을 한 장도 못 받아(satBad) 벡터로 준비됨 → 벡터 타일만
  vm.runInContext("_glb.state = 'loading'; setTimeout(() => { _glb.satBad = glbSatSrcNow().tiles[0]; _glb.state = 'ready'; }, 30)", c);
  await c.prefetchRenderTiles(10, 30);
  assert.ok(got.length > 0 && got.every((u) => !u.includes('api.mapbox.com')), '벡터만 ' + got.slice(0, 2));
  // 불러오는 중 → 실패 → 안 받음
  got.length = 0;
  vm.runInContext("_glb.satBad = ''; _glb.state = 'loading'; setTimeout(() => { _glb.state = 'fail'; }, 30)", c);
  await c.prefetchRenderTiles(10, 30);
  assert.equal(got.length, 0);
});

test('가벼운 지도 위성 사진 기본 출처 — 넣어 둔 주소가 없으면 데스크톱 기본 토큰(pk.)으로 기본 스타일, 넣어 둔 주소가 먼저', async () => {
  let url = '', tok = 'pk.TESTDEFAULT.fake';
  const c = ctx({ mapboxUrlRaw: () => url, window: { wcgDesktop: { mapboxToken: () => tok } }, tileFetch: async () => ({ data: new TextEncoder().encode(JSON.stringify({ tiles: [OFM], maxzoom: 14 })), type: '' }) });
  c.S.typhoon = { basemap: 'gl', glSat: 1 };
  const DEF = 'https://api.mapbox.com/styles/v1/supermanpasa/cmsg6825m002h01r6eufdeg24/tiles/512/';
  let list = await c.glbPrefetchUrls([KOREA]);
  assert.ok(list.length && list.every((x) => x.startsWith(DEF) && x.endsWith('@2x?access_token=pk.TESTDEFAULT.fake')), list[0]);
  assert.equal(c.glbSatSrcNow().def, 1);
  url = SAT_STYLE;   // 넣어 둔 주소가 먼저
  list = await c.glbPrefetchUrls([KOREA]);
  assert.ok(list.every((x) => x.includes('/user1/ckstyle01/')), list[0]);
  url = 'https://example.com/{z}/{x}/{y}.png';   // 못 알아보는 주소 → 기본 출처
  assert.ok((await c.glbPrefetchUrls([KOREA])).every((x) => x.startsWith(DEF)));
  for (const bad of ['', 'sk.secret', 'pk.bad token', 'https://evil/?access_token=pk.x']) {   // 공개 토큰 모양이 아니면 기본 출처 없음 → 벡터만
    tok = bad; url = '';
    assert.ok((await c.glbPrefetchUrls([KOREA])).every((x) => x.endsWith('.pbf')), JSON.stringify(bad));
  }
});
