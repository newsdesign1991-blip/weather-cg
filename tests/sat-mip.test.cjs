// 위성 바탕 축소 단계: 넓이 평균·단계 혼합·원본 교체·화면/추출 배선.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/sat-mip.js'), 'utf8');
function setup(extra = {}) {
  const ctx = vm.createContext({ atob, Uint8ClampedArray, setTimeout, performance, window: {}, ...extra });
  vm.runInContext(source, ctx);
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
const el = () => ({ attrs: {}, style: {}, getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = String(v); } });
test('축소 단계: 확대는 원본, 2의 거듭제곱은 한 단계, 사이는 연속 혼합, 최대 1/32', () => {
  const c = setup();
  for (const k of [0, -1, NaN, 1, 4]) assert.deepEqual(plain(c.satMipPick(k)), { lo: 0, hi: 0, t: 0 });
  for (let i = 0; i <= 5; i++) assert.deepEqual(plain(c.satMipPick(2 ** -i)), { lo: i, hi: i, t: 0 });
  assert.deepEqual(plain(c.satMipPick(2 ** -2.5)), { lo: 2, hi: 3, t: 0.5 });
  assert.deepEqual(plain(c.satMipPick(0.00001)), { lo: 5, hi: 5, t: 0 });
  for (const e of [1.99, 2.01]) assert.deepEqual(plain(c.satMipPick(2 ** -e)), { lo: 2, hi: 2, t: 0 });
});
test('2×2 넓이 평균: 작은 점 에너지 보존, 홀수 가장자리·알파 포함', () => {
  const c = setup();
  const rgba = (v) => v.flatMap((x) => [x, x, x, 255]);
  const a = c.satMipHalf(new Uint8ClampedArray(rgba([0, 0, 0, 252])), 2, 2);
  assert.deepEqual(Array.from(a.data), [63, 63, 63, 255]);
  const b = c.satMipHalf(new Uint8ClampedArray(rgba([0, 40, 80, 40, 80, 120, 80, 120, 160])), 3, 3);
  assert.equal(b.w, 2); assert.equal(b.h, 2);
  assert.deepEqual(Array.from(b.data), rgba([40, 100, 100, 160]));
  const d = c.satMipHalf(new Uint8ClampedArray([3, 9, 21, 37]), 1, 1);
  assert.deepEqual(Array.from(d.data), [3, 9, 21, 37]);
});
test('원본 머리 크기·모드 격리·같은 모드의 원본 교체도 화면을 갱신', () => {
  const png = Buffer.alloc(24); png.writeUInt32BE(8000, 16); png.writeUInt32BE(7056, 20);
  const img = 'data:image/png;base64,' + png.toString('base64');
  const c = setup({ window: { TYPHOON_SATELLITE: { img }, TYPHOON_SATELLITE_DARK: { img: img + 'AA' } } });
  assert.deepEqual(plain(c.satMipImgSize(img)), { w: 8000, h: 7056 });
  assert.equal(c.satMipImgSize('bad'), null);
  for (const mode of ['blue', 'mapbox', 'gl', undefined]) assert.equal(c.satMipEntry(mode), null);
  const e = c.satMipEntry('satellite'); assert.equal(c.satMipEntry('satellite'), e);
  assert.notEqual(c.satMipEntry('satdark'), e);
  const a = el(), b = el(); a.setAttribute('width', 123);
  const p = { lo: 0, hi: 0, t: 0 };
  c.satMipSetEl(a, b, e, p); assert.equal(a.getAttribute('href'), img); assert.equal(b.style.display, 'none');
  c.window.TYPHOON_SATELLITE.img = 'replacement';
  const next = c.satMipEntry('satellite'); assert.notEqual(next, e);
  c.satMipSetEl(a, b, next, p); assert.equal(a.getAttribute('href'), 'replacement');
  next.levels.push({ url: 'level1' });
  c.satMipSetEl(a, b, next, { lo: 0, hi: 1, t: 0.5 });
  assert.equal(b.getAttribute('href'), 'level1'); assert.equal(b.getAttribute('opacity'), '0.500');
  assert.equal(b.getAttribute('width'), '123'); assert.equal(b.style.display, '');
  assert.equal(c.satMipK({ w: 8000 }, a, 2, 1), 123 / 4000);
});
test('단계 준비 실패는 원본으로 대체, 중복 준비는 같은 Promise', async () => {
  const c = setup({ Image: class { decode() { return Promise.reject(new Error('decode')); } } });
  const e = { src: 'bad', state: 'idle', p: null };
  const a = c.satMipEnsure(e), b = c.satMipEnsure(e); assert.equal(a, b);
  await a; assert.equal(e.state, 'fail'); assert.equal(e.p, null);
  assert.deepEqual(plain(vm.runInContext('satMipFallback()', c)), { lo: 0, hi: 0, t: 0 });
});
test('내보내기는 현재 화면이 아닌 복제 시점의 위성 종류를 유지', async () => {
  const a = el(); a.setAttribute('data-sat-mode', 'satdark'); a.setAttribute('width', 8000);
  const g = el(); g.setAttribute('transform', 'scale(1)');
  const clone = { querySelector(s) { return s === '#typhoonSat' ? a : s === '#bgMapT' ? g : null; } };
  const c = setup({ S: { typhoon: { basemap: 'blue' }, map: { s: 1 } }, window: { TYPHOON_SATELLITE_DARK: { img: 'saved-dark' } } });
  await c.satMipClone(clone, 1);
  assert.equal(a.getAttribute('href'), 'saved-dark');
});
test('축소 단계 배선: 화면·영상/틸트·이미지/AE·미리보기·GEO 분리', () => {
  const app = appSource(path.join(root, 'index.html'));
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  assert.match(read('js/typhoon-render.js'), /satMipShow\(isSat, bmMode\)/);
  assert.match(read('js/export-image.js'), /await satMipClone\(clone, W \/ /);
  assert.equal((read('js/export-blobs.js').match(/await satMipClone\(/g) || []).length, 2);
  assert.match(read('js/ae-geo.js'), /'#typhoonSatB'/);
  assert.ok(app.indexOf('function satMipPick(') < app.indexOf('function renderTyphoon('));
});
test('실제 앱: 밝은·어두운 단계 생성·화면/추출 크기·모드 전환·작은 점 흔들림 감소', { skip: process.env.WCG_BOOT_CHECK !== '1' }, () => {
  const raw = execFileSync(process.execPath, [path.join(root, 'desktop/test/boot-check.cjs'), root, '--wait=9000', '--keepalive', '--size=1600x900', '--eval=' + path.join(__dirname, 'sat-mip.boot-eval.js')], { encoding: 'utf8', timeout: 300000 });
  const r = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.evalResult?.ok, true, JSON.stringify(r.evalResult));
});
