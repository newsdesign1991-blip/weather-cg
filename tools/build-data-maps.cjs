// tools/build-data-maps.cjs — 데이터 지도 도형 굽기 → region-map-data.js (window.REGION_MAP)
//   node tools/build-data-maps.cjs --src=<원본 data 폴더> [--out=region-map-data.js] [--split-gu]
//
// 원본: 행정동 경계(vuski/admdongkor, 2026-07-01)를 시도군 지도와 같게 단순화한 것 — 저장소 밖(gitignore) data 폴더의
//   main-simplified.json(행정동 육지) + islands-detail.json(옹진·울릉 정밀). 투영값은 저장소 map-data.js의 proj를 그대로 읽어
//   시도군 지도(map-data.js)와 경계가 1:1로 겹친다(build/02-project.js와 같은 식·같은 반올림).
// 만드는 것:
//   sigungu    — 기초자치단체 230곳(자치구·시·군 — 일반구는 시로 합침, --split-gu면 일반구를 따로). 생활기상·미세먼지 농도 지도.
//   dustRegion — 에어코리아 미세먼지 예보 권역 19곳(시군을 권역별로 합침). 미세먼지 예보 지도.
// 합치기 = 공유 변 지우기: 원본 행정동은 이웃끼리 꼭짓점이 완전히 같아서, 이웃이 반대 방향으로 가진 변을 지우고
//   남은 변을 이어 붙이면 틈 없는 외곽이 된다(방향이 원본을 따라가 구멍도 그대로 — 채움 nonzero).
// 같은 입력이면 같은 바이트(정렬·반올림 고정). 결과 검사는 tests/data-maps-geometry.test.cjs.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── 표(앱 쪽 이름과 맞춘다) ──
// 시도 약칭 — build/01-assign-zones.js와 같은 표. 전남광주통합특별시는 이름이 '구'로 끝나면 광주(옛 광주광역시 자치구), 아니면 전남.
const SHORT = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천',
  '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종',
  '경기도': '경기', '강원특별자치도': '강원', '강원도': '강원',
  '충청북도': '충북', '충청남도': '충남',
  '전북특별자치도': '전북', '전라북도': '전북', '전라남도': '전남',
  '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주',
  '광주광역시': '광주', '전남광주통합특별시': '전남',
};
const SIDO_ORDER = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
// 미세먼지 예보 권역(에어코리아 informGrade 권역 — 영동·영서는 앱에서 강원영동·강원영서로 읽는다). 이 순서가 파일 순서.
const DUST_REGIONS = ['서울', '인천', '경기북부', '경기남부', '강원영서', '강원영동', '대전', '세종', '충남', '충북', '광주', '전북', '전남', '부산', '대구', '울산', '경북', '경남', '제주'];
// 경기·강원을 나누는 시군 — js/bulletin.js KMA_TERMS(경기북서부+경기북동부, 강원영서·강원영동)와 같은 명단(테스트가 비교한다).
// 경기북서부의 '인천(강화)'는 인천 권역(인천은 강화·옹진 포함 통째)이라 여기 없다.
// 에어코리아 공식 FAQ(2026-01-27), 2026-10-10 대조: https://airkorea.or.kr/web/board/5/1171/?pMENU_NO=144
const DUST_SPLIT = {
  경기북부: ['고양', '파주', '양주', '김포', '의정부', '포천', '동두천', '가평', '연천', '남양주', '구리'],
  강원영서: ['철원', '화천', '양구', '인제', '춘천', '홍천', '원주', '횡성', '영월', '평창', '정선'],
  강원영동: ['고성', '속초', '양양', '강릉', '태백', '동해', '삼척'],
};
// 자료가 2026 개편 전 이름·코드로 올 때 쓸 옛 것 — 실키로 확인 필요(설계서 6-5). codes = 생활기상 areaNo 앞 5자리, names = '시도/이름'(에어코리아 sidoName·cityName)
const ALT = {
  '인천/제물포구': { codes: ['28110', '28140'], names: ['인천/중구', '인천/동구'] },
  '인천/영종구': { codes: ['28110'], names: ['인천/중구'] },
  '인천/서해구': { codes: ['28260'], names: ['인천/서구'] },
  '인천/검단구': { codes: ['28260'], names: ['인천/서구'] },
  '광주/동구': { codes: ['29110'] }, '광주/서구': { codes: ['29140'] }, '광주/남구': { codes: ['29155'] }, '광주/북구': { codes: ['29170'] }, '광주/광산구': { codes: ['29200'] },
  '대구/군위군': { codes: ['47720'], names: ['경북/군위군'] },
};
// 전남(12xxx ← 46xxx): 새 코드 뒤 3자리와 옛 코드가 달라 이름으로 짝짓는다(옛 코드는 행정표준코드 기억값 — 확인 필요)
const OLD_JEONNAM = { 목포시: '46110', 여수시: '46130', 순천시: '46150', 나주시: '46170', 광양시: '46230', 담양군: '46710', 곡성군: '46720', 구례군: '46730', 고흥군: '46770', 보성군: '46780',
  화순군: '46790', 장흥군: '46800', 강진군: '46810', 해남군: '46820', 영암군: '46830', 무안군: '46840', 함평군: '46860', 영광군: '46870', 장성군: '46880', 완도군: '46890', 진도군: '46900', 신안군: '46910' };
// 인셋(확대 상자) — build/01-assign-zones.js와 같다
const INSET_JEJU = new Set(['제주시', '서귀포시']);
const DOKDO_LON = 131.5, SEO5_LON = 125.0;
const PREC = { dokdo: 3, ulleung: 2, ongjin: 2 };

// ── 인자 ──
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([\w-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] == null ? true : m[2]] : [a, true]; }));
const ROOT = path.join(__dirname, '..');
if (!args.src || args.src === true) {
  console.error('사용법: node tools/build-data-maps.cjs --src=<원본 data 폴더(main-simplified.json·islands-detail.json)> [--out=region-map-data.js] [--split-gu]');
  process.exit(2);
}
const SRC = path.resolve(String(args.src));
const OUT = path.resolve(ROOT, args.out && args.out !== true ? String(args.out) : 'region-map-data.js');
const SPLIT_GU = !!args['split-gu'];

// ── 투영 — map-data.js의 proj 그대로 ──
const mapCtx = { window: {} };
vm.createContext(mapCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'map-data.js'), 'utf8'), mapCtx);
const { cx0, cy0, scale } = mapCtx.window.KOREA_MAP.proj;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const mercX = (lon) => (lon * Math.PI) / 180;
const px = (lon) => (mercX(lon) - cx0) * scale;
const py = (lat) => -(mercY(lat) - cy0) * scale;
const r = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

// ── 원본 읽기 ──
const feats = ['main-simplified.json', 'islands-detail.json'].flatMap((f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')).features);
const polysOf = (g) => (g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : []);
const strip = (n) => { const m = n.match(/^(.+?시)(.+구)$/); return m ? m[1] : n; };   // 수원시장안구 → 수원시
const baseName = (n) => n.replace(/(시|군|구)$/, '');

// 행정동 하나 → 시군구 구역
function sigunguOf(p) {
  const sido = p.sidonm === '전남광주통합특별시' ? (/구$/.test(p.sggnm) ? '광주' : '전남') : SHORT[p.sidonm];
  if (!sido) throw new Error('처음 보는 시도명: ' + p.sidonm + ' — SHORT 표에 추가할 것');
  const merged = !SPLIT_GU && strip(p.sggnm) !== p.sggnm;
  const name = merged ? strip(p.sggnm) : p.sggnm;
  const code = merged ? String(p.sgg).slice(0, 4) + '0' : String(p.sgg);
  const zone = SPLIT_GU && strip(p.sggnm) !== p.sggnm ? strip(p.sggnm) + ' ' + p.sggnm.slice(strip(p.sggnm).length) : name;
  return { id: sido + '/' + name.replace(/\s+/g, ''), zone, sido, code, base: strip(p.sggnm) };
}
// 시군구 → 예보 권역
function regionOf(sg) {
  if (sg.sido === '경기') return DUST_SPLIT.경기북부.includes(baseName(sg.base)) ? '경기북부' : '경기남부';
  if (sg.sido === '강원') {
    const b = baseName(sg.base);
    if (DUST_SPLIT.강원영서.includes(b)) return '강원영서';
    if (DUST_SPLIT.강원영동.includes(b)) return '강원영동';
    throw new Error('강원 시군이 영서·영동 어디에도 없음: ' + sg.base);
  }
  return sg.sido;
}
// 인셋 나누기 — [[inset, 폴리곤들]…]
function insetSplit(p, polys) {
  const by = (lon) => { const w = [], e = []; for (const q of polys) (q[0][0][0] < lon ? w : e).push(q); return [w, e]; };
  if (p.sggnm === '울릉군') { const [u, d] = by(DOKDO_LON); return [['ulleung', u], ['dokdo', d]]; }
  if (p.sggnm === '옹진군') { const [s5, rest] = by(SEO5_LON); return [['ongjin', s5], ['', rest]]; }
  if (INSET_JEJU.has(p.sggnm) && SHORT[p.sidonm] === '제주') return [['jeju', polys]];
  return [['', polys]];
}

// ── 공유 변 지우기 ──
const q = (pt) => pt[0].toFixed(7) + ',' + pt[1].toFixed(7);
function dissolve(polys) {
  const dir = new Map();   // 'a|b' → [a점, b점]
  for (const poly of polys) for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) {
    const a = q(ring[i]), b = q(ring[i + 1]);
    if (a === b) continue;
    const rev = b + '|' + a;
    if (dir.has(rev)) dir.delete(rev); else dir.set(a + '|' + b, [ring[i], ring[i + 1]]);
  }
  const next = new Map();   // a → [[b키, b점]…]
  for (const [k, [, bp]] of dir) { const [a, b] = k.split('|'); (next.get(a) || next.set(a, []).get(a)).push([b, bp]); }
  const rings = [];
  let broken = 0;
  for (const [k, [ap]] of dir) {
    const a0 = k.split('|')[0];
    const out = next.get(a0);
    if (!out || !out.length) continue;   // 이 시작점의 변은 이미 다른 링이 썼다
    const ring = [ap];
    let a = a0, guard = 0;
    for (;;) {
      const nb = next.get(a);
      if (!nb || !nb.length) { broken++; break; }
      const [b, bp] = nb.shift();
      a = b;
      if (a === a0) break;
      ring.push(bp);
      if (++guard > 1e6) { broken++; break; }
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return { rings, broken };
}

// 링 무리 → 지도 좌표 path·중심·bbox (build/02-project.js와 같은 식)
function ringArea(ring) { let a = 0; for (let i = 0; i < ring.length; i++) { const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length]; a += x0 * y1 - x1 * y0; } return a / 2; }
function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (a === 0) return null;
  return { cx: cx / (3 * a), cy: cy / (3 * a), area: Math.abs(a / 2) };
}
let tinyDropped = 0;
function makeShape(rings, inset) {
  const prec = PREC[inset] || 1;
  let d = '', best = null, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const ring of rings) {
    const P = ring.map(([lon, lat]) => [px(lon), py(lat)]);
    const pts = [];
    for (const [X, Y] of P) {
      const x = r(X, prec), y = r(Y, prec), l = pts[pts.length - 1];
      if (!l || l[0] !== x || l[1] !== y) pts.push([x, y]);
    }
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3 || Math.abs(ringArea(pts)) < 10 ** -(2 * prec)) { tinyDropped++; continue; }   // 반올림 뒤 넓이 0 — 점·선 찌꺼기
    d += pts.map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + y).join('') + 'Z';
    const c = ringCentroid(P);
    if (c && (!best || c.area > best.area)) best = c;
    for (const [X, Y] of P) { if (X < bx0) bx0 = X; if (X > bx1) bx1 = X; if (Y < by0) by0 = Y; if (Y > by1) by1 = Y; }
  }
  return { inset: inset || null, d, cx: r(best ? best.cx : (bx0 + bx1) / 2, prec), cy: r(best ? best.cy : (by0 + by1) / 2, prec), bbox: [r(bx0, prec), r(by0, prec), r(bx1, prec), r(by1, prec)] };
}

// ── 묶기 ──
const sgGroups = new Map();   // id#inset → { sg, inset, polys }
const rgGroups = new Map();   // 권역#inset → { name, inset, polys }
const sgInfo = new Map();     // id → sg
for (const f of feats) {
  const p = f.properties;
  const sg = sigunguOf(p);
  const prev = sgInfo.get(sg.id);
  if (prev && prev.code !== sg.code) throw new Error(`같은 구역 id에 코드가 둘: ${sg.id} ${prev.code} / ${sg.code}`);
  sgInfo.set(sg.id, sg);
  const rg = regionOf(sg);
  for (const [inset, polys] of insetSplit(p, polysOf(f.geometry))) {
    if (!polys.length) continue;
    const k1 = sg.id + '#' + inset, k2 = rg + '#' + inset;
    (sgGroups.get(k1) || sgGroups.set(k1, { sg, inset, polys: [] }).get(k1)).polys.push(...polys);
    (rgGroups.get(k2) || rgGroups.set(k2, { name: rg, inset, polys: [] }).get(k2)).polys.push(...polys);
  }
}
let broken = 0, rings = 0;
const sidoRank = (s) => { const i = SIDO_ORDER.indexOf(s); if (i < 0) throw new Error('시도 순서표에 없음: ' + s); return i; };
const insetRank = (i) => ['', 'jeju', 'ongjin', 'ulleung', 'dokdo'].indexOf(i);
const sgZones = [...sgGroups.values()]
  .sort((a, b) => sidoRank(a.sg.sido) - sidoRank(b.sg.sido) || a.sg.code.localeCompare(b.sg.code) || insetRank(a.inset) - insetRank(b.inset))
  .map(({ sg, inset, polys }) => {
    const dz = dissolve(polys); broken += dz.broken; rings += dz.rings.length;
    const z = { id: sg.id, zone: sg.zone, sido: sg.sido, code: sg.code, ...makeShape(dz.rings, inset) };
    const alt = { ...(ALT[sg.id] || {}) };
    if (sg.sido === '전남' && OLD_JEONNAM[sg.zone]) alt.codes = [OLD_JEONNAM[sg.zone]];
    if ((sg.sido === '강원' && sg.code.startsWith('51')) || (sg.sido === '전북' && sg.code.startsWith('52'))) alt.codes = [(sg.sido === '강원' ? '42' : '45') + sg.code.slice(2)];
    if (alt.codes || alt.names) z.alt = alt;
    return z;
  });
const members = {};
for (const sg of [...sgInfo.values()].sort((a, b) => sidoRank(a.sido) - sidoRank(b.sido) || a.code.localeCompare(b.code))) (members[regionOf(sg)] ||= []).push(sg.id);
const rgZones = [...rgGroups.values()]
  .sort((a, b) => DUST_REGIONS.indexOf(a.name) - DUST_REGIONS.indexOf(b.name) || insetRank(a.inset) - insetRank(b.inset))
  .map(({ name, inset, polys }) => {
    if (!DUST_REGIONS.includes(name)) throw new Error('권역 표에 없는 권역: ' + name);
    const dz = dissolve(polys); broken += dz.broken; rings += dz.rings.length;
    return { id: name, zone: name, sido: name, ...makeShape(dz.rings, inset) };
  });

const data = {
  ver: 'hjd-2026-07-01' + (SPLIT_GU ? '-gu' : ''),
  sigungu: { zones: sgZones },
  dustRegion: { zones: rgZones, members: Object.fromEntries(DUST_REGIONS.map((n) => [n, members[n] || []])) },
};
const text = '// 자동 생성 파일 — tools/build-data-maps.cjs 로 재생성 (원본: 행정동 2026-07-01, vuski/admdongkor)\n' +
  'window.REGION_MAP = ' + JSON.stringify(data) + ';\n';
fs.writeFileSync(OUT, text);

const ids = new Set(sgZones.map((z) => z.id));
console.log(`시군구: 구역 ${ids.size} / 조각 ${sgZones.length}${SPLIT_GU ? ' (일반구 따로)' : ''}`);
console.log(`예보 권역: 구역 ${new Set(rgZones.map((z) => z.id)).size} / 조각 ${rgZones.length}`);
console.log(`링 ${rings} · 끊긴 링 ${broken} · 반올림 찌꺼기 ${tinyDropped}`);
console.log(`${path.relative(ROOT, OUT)}: ${Math.round(text.length / 1024)} KB`);
if (broken) { console.error('끊긴 링이 있다 — 원본 위상이 깨졌는지 확인'); process.exit(1); }
