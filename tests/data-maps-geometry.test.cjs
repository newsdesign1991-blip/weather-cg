// 데이터 지도 도형(region-map-data.js — tools/build-data-maps.cjs가 만든다) 검사.
//  · 시군구(생활기상·미세먼지 농도): 기초자치단체 230(일반구는 시로), 코드 5자리, 인셋 4종, 시도군 지도와 같은 자리·같은 시도·도의 시군 id 그대로
//  · 미세먼지 예보 권역 19: 권역 목록·시군구를 한 번씩 덮음, 경기북부·강원영서/영동 명단 = 통보문 용어(js/bulletin.js KMA_TERMS)
//  · WCG_DATA_DIR(원본 data 폴더)가 있으면 생성기를 임시 폴더로 다시 돌려 바이트가 같은지(결정적 출력)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html'));
const load = (file, name) => { const c = { window: {} }; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c); return JSON.parse(JSON.stringify(c.window[name])); };   // vm 쪽 배열은 deepStrictEqual이 다른 realm으로 본다
const KOREA = load('map-data.js', 'KOREA_MAP');
const REGION = load('region-map-data.js', 'REGION_MAP');
const SG = REGION.sigungu.zones, RG = REGION.dustRegion.zones;
const DUST_REGIONS = ['서울', '인천', '경기북부', '경기남부', '강원영서', '강원영동', '대전', '세종', '충남', '충북', '광주', '전북', '전남', '부산', '대구', '울산', '경북', '경남', '제주'];
const ids = (zones) => [...new Set(zones.map((z) => z.id))];
const bboxOf = (zones) => zones.reduce((b, z) => [Math.min(b[0], z.bbox[0]), Math.min(b[1], z.bbox[1]), Math.max(b[2], z.bbox[2]), Math.max(b[3], z.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]);

test('파일 — 자동 생성 머리, window.REGION_MAP 하나, 크기 2.5MB 안, 앱이 seoul-map-data.js 바로 뒤에 읽는다(로드 실패 시 null)', () => {
  const raw = fs.readFileSync(path.join(root, 'region-map-data.js'), 'utf8');
  assert.match(raw, /^\/\/ 자동 생성 파일 — tools\/build-data-maps\.cjs 로 재생성/);
  assert.equal((raw.match(/window\.[A-Z_]+ =/g) || []).length, 1);
  assert.ok(raw.length < 2.5 * 1024 * 1024, `${raw.length} bytes`);
  assert.match(html, /<script src="seoul-map-data\.js" onerror="window\.SEOUL_MAP=null"><\/script>\n<script src="region-map-data\.js" onerror="window\.REGION_MAP=null"><\/script>/);
  assert.equal(REGION.ver, 'hjd-2026-07-01');
});

test('시군구 — 230곳(조각 232: 울릉·옹진 두 조각), 코드 5자리(구역마다 하나·서로 다름), 일반구는 시 하나로', () => {
  assert.equal(ids(SG).length, 230);
  assert.equal(SG.length, 232);
  const codeOf = new Map();
  for (const z of SG) {
    assert.match(z.code, /^\d{5}$/, z.id);
    if (codeOf.has(z.id)) assert.equal(codeOf.get(z.id), z.code, z.id); else codeOf.set(z.id, z.code);
    assert.equal(z.id, z.sido + '/' + z.zone, z.id);
    assert.doesNotMatch(z.id, /\s/);
  }
  assert.equal(new Set(codeOf.values()).size, 230, '코드가 겹친다');
  for (const city of ['경기/수원시', '경기/고양시', '경기/용인시', '충북/청주시', '전북/전주시', '경남/창원시', '경북/포항시', '충남/천안시']) assert.ok(codeOf.has(city), city);
  assert.equal(SG.filter((z) => /시.+구$/.test(z.zone)).length, 0, '일반구(…시…구)가 남아 있다');
  // 2026 행정구역: 인천 새 구, 대구 군위, 광주 자치구(전남광주통합특별시 안 '구'), 전남 시군
  for (const id of ['인천/제물포구', '인천/영종구', '인천/서해구', '인천/검단구', '대구/군위군', '광주/광산구', '전남/목포시', '세종/세종시']) assert.ok(codeOf.has(id), id);
  assert.deepEqual(SG.find((z) => z.id === '인천/제물포구').alt, { codes: ['28110', '28140'], names: ['인천/중구', '인천/동구'] });
  assert.deepEqual(SG.find((z) => z.id === '강원/춘천시').alt, { codes: ['42110'] });
});

test('시군구 — 시도 약칭이 시도군 지도와 같은 집합, 도의 시군 id는 그대로 있고, 인셋 4종·본토 bbox가 시도군 지도와 겹친다', () => {
  const sggSido = new Set(KOREA.styles.sgg.zones.map((z) => z.sido));
  assert.deepEqual(new Set(SG.map((z) => z.sido)), sggSido);
  const METRO = new Set(['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종']);
  const sgIds = new Set(ids(SG));
  for (const id of ids(KOREA.styles.sgg.zones)) if (!METRO.has(id.split('/')[0])) assert.ok(sgIds.has(id), `시도군 지도의 ${id}가 시군구 지도에 없음`);
  const insetOf = (id) => SG.filter((z) => z.id === id).map((z) => z.inset).sort().join(',');
  assert.equal(insetOf('제주/제주시'), 'jeju');
  assert.equal(insetOf('제주/서귀포시'), 'jeju');
  assert.equal(insetOf('경북/울릉군'), 'dokdo,ulleung');
  assert.equal(insetOf('인천/옹진군'), ',ongjin'.split(',').sort().join(','));
  const a = bboxOf(SG.filter((z) => !z.inset)), b = bboxOf(KOREA.styles.sgg.zones.filter((z) => !z.inset));
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(a[i] - b[i]) < 0.5, `bbox[${i}] ${a[i]} vs ${b[i]}`);
  for (const z of [...SG, ...RG]) {
    assert.match(z.d, /^(M-?[\d.]+ -?[\d.]+(L-?[\d.]+ -?[\d.]+)+Z)+$/, `${z.id} path는 M/L/Z와 숫자만`);
    assert.ok(Number.isFinite(z.cx) && Number.isFinite(z.cy) && z.bbox.every(Number.isFinite), z.id);
  }
});

test('예보 권역 19 — 목록 순서 그대로, 시군구 230을 한 번씩 덮고, 인셋 조각은 같은 권역 id', () => {
  assert.deepEqual(ids(RG), DUST_REGIONS);
  for (const z of RG) assert.ok(z.id === z.zone && z.zone === z.sido, z.id);
  const m = REGION.dustRegion.members;
  assert.deepEqual(Object.keys(m), DUST_REGIONS);
  const all = Object.values(m).flat();
  assert.equal(all.length, 230);
  assert.deepEqual(new Set(all), new Set(ids(SG)));
  assert.deepEqual(RG.filter((z) => z.inset).map((z) => z.id + ':' + z.inset), ['인천:ongjin', '경북:ulleung', '경북:dokdo', '제주:jeju']);
  assert.ok(m.인천.includes('인천/강화군') && m.인천.includes('인천/옹진군'), '인천 권역 = 강화·옹진 포함');
  assert.ok(m.대구.includes('대구/군위군'));
  assert.deepEqual(m.광주.length, 5);
});

test('경기북부·강원영서·강원영동 명단 = 통보문 용어(KMA_TERMS — 경기북서부+경기북동부, 강원영서·영동 조합)', () => {
  const c = {};
  vm.createContext(c);
  vm.runInContext(html.slice(html.indexOf('const KMA_TERMS = {'), html.indexOf('// 괄호·점 뒤 제거(공통)')) + '\nthis.T = KMA_TERMS;', c);
  const T = JSON.parse(JSON.stringify(c.T.방위별_분류));
  const base = (id) => id.split('/')[1].replace(/(시|군)$/, '');
  const names = (list) => list.filter((n) => !/^인천/.test(n)).sort();   // '인천(강화)'는 인천 권역
  const m = REGION.dustRegion.members;
  assert.deepEqual(m.경기북부.map(base).sort(), names([...T.수도권.경기북서부, ...T.수도권.경기북동부]));
  assert.deepEqual(m.강원영서.map(base).sort(), names([...T.강원도.강원영서북부, ...T.강원도.강원영서중부, ...T.강원도.강원영서남부]));
  assert.deepEqual(m.강원영동.map(base).sort(), names([...T.강원도.강원영동북부, ...T.강원도.강원영동중부, ...T.강원도.강원영동남부]));
  assert.equal(m.경기북부.length + m.경기남부.length, 31);
});

test('생성기 — 원본 폴더 없이 부르면 사용법 + 종료 코드 2', () => {
  let code = 0;
  try { execFileSync(process.execPath, [path.join(root, 'tools', 'build-data-maps.cjs')], { stdio: 'pipe' }); } catch (e) { code = e.status; }
  assert.equal(code, 2);
});

test('생성기 — 같은 원본이면 같은 바이트(WCG_DATA_DIR가 있을 때만)', { skip: !process.env.WCG_DATA_DIR && 'WCG_DATA_DIR(원본 data 폴더)가 있을 때만' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-region-'));
  try {
    const out = path.join(tmp, 'region-map-data.js');
    execFileSync(process.execPath, [path.join(root, 'tools', 'build-data-maps.cjs'), '--src=' + process.env.WCG_DATA_DIR, '--out=' + out], { stdio: 'pipe' });
    const norm = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(norm(out), norm(path.join(root, 'region-map-data.js')));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
