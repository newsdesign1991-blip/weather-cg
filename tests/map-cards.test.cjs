// 장면 설정 '지도 종류' = 데이터별 카드(10-10). 카드 ↔ 구분 지도(S.style) ↔ 사이드바 데이터 섹션 ↔ 배치 그룹, 옛 저장값 호환.
// 소스·vm 검사 + (WCG_BOOT_CHECK=1 일 때) 실제 앱: 카드 9장·3열·구분 줄·시도 칩·서울 카드·데이터 섹션 맨 위·배지 팝오버·옛 작업·옛 사이드바 배치.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html')).replace(/\r\n/g, '\n');
const between = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert.ok(i >= 0 && j > i, `${a} … ${b}`); return html.slice(i, j); };
const fnSrc = (name) => { const m = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`).exec(html); assert.ok(m, name); return m[0]; };
const P = (v) => JSON.parse(JSON.stringify(v));   // vm 쪽 배열·객체는 deepStrictEqual이 다른 realm으로 본다
const dataOf = (file, name) => { const c = { window: {} }; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c); return c.window[name]; };
const KOREA = dataOf('map-data.js', 'KOREA_MAP'), SEOUL = dataOf('seoul-map-data.js', 'SEOUL_MAP'), REGION = dataOf('region-map-data.js', 'REGION_MAP');

// core.js 지도 등록(시군 세분·태풍·서울·데이터 지도) + map-build.js 카드 표·구분 이름 + secModeHidden + presets.js layoutGroup 을 vm에서
function appCtx({ region = true } = {}) {
  const c = { window: { KOREA_MAP: JSON.parse(JSON.stringify(KOREA)), SEOUL_MAP: SEOUL, TYPHOON_MAP: {}, REGION_MAP: region ? REGION : null }, S: { style: 'sgg' }, pendingStyle: null, startScreenOn: () => false };
  vm.createContext(c);
  const src = [
    between('const MAP = window.KOREA_MAP;', 'const curZones = '),
    between('const MAP_CARDS = [', "// 장면 설정 카드 아래 '칠하는 구분' 줄"),
    between('const CGS_ICON = {', 'function cgsIconSvg('),
    fnSrc('secModeHidden'),
    /const layoutGroup = [^\n]*/.exec(html)[0],
    'this.X = { MAP, MAP_CARDS, mapCards, cardOf, cardStyleFor, cardLabelOf, mapUnitOf, mapUnitCount, mapUnitText, CGS_ICON, secModeHidden, layoutGroup, normStyle, curStyle, isTyphoon };',
  ].join('\n');
  vm.runInContext(src, c);
  return c;
}

test('카드 9장 — 순서·이름·한 줄 설명, 이모지 없음, 모든 지도 키가 카드 하나에만 속함', () => {
  const c = appCtx(), X = c.X;
  assert.deepEqual(P(X.MAP_CARDS.map((k) => k.id)), ['warn', 'warnsea', 'rain', 'life', 'dust', 'dustFcst', 'seoul', 'typhoon', 'typhoonCompare']);
  assert.deepEqual(P(X.MAP_CARDS.map((k) => k.label)), ['특보', '특보 + 해상', '예상 강수·적설', '생활기상', '미세먼지 농도', '미세먼지 예보', '서울', '태풍', '태풍 비교']);
  for (const k of X.MAP_CARDS) {
    assert.ok(k.sub && k.sub.length <= 18, `${k.id} 설명은 한 줄(짧게): ${k.sub}`);
    assert.doesNotMatch(k.label + k.sub + JSON.stringify(k.subs || {}), /\p{Extended_Pictographic}/u, k.id);
  }
  const keys = P(Object.keys(X.MAP.styles));
  assert.deepEqual(keys, ['sgg', 'sido', 'warn', 'warnsea', 'typhoon', 'typhoonCompare', 'seoul', 'life', 'dust', 'dustFcst'], '키 순서 — 첫 비태풍 지도 = sgg(다른 테스트가 기대)');
  for (const k of keys) assert.equal(X.MAP_CARDS.filter((card) => card.styles.includes(k)).length, 1, k);
  assert.equal(X.mapCards().length, 9);
  assert.equal(X.cardOf('sido').id, 'rain');
  assert.equal(X.cardOf('sgg').id, 'rain');
  assert.equal(X.cardOf('seoul').id, 'seoul');
  assert.equal(X.MAP.styles.seoul.hidden, undefined, '서울은 이제 카드로 보인다');
  // 데이터 지도: 생활기상·미세먼지 농도 = 같은 시군구 도형·다른 키, 미세먼지 예보 = 권역, 시군구 굵은 선은 시도군 지도 것
  assert.equal(X.MAP.styles.life.zones, X.MAP.styles.dust.zones);
  assert.equal(X.MAP.styles.life.sidoLines, X.MAP.styles.sgg.sidoLines);
  assert.deepEqual(P([X.MAP.styles.life.data, X.MAP.styles.dust.data, X.MAP.styles.dustFcst.data]), ['life', 'dust', 'dustFcst']);
  assert.deepEqual(P(Object.keys(X.MAP.styles.dustFcst.sidoLines).sort()), ['dokdo', 'jeju', 'main', 'ongjin', 'ulleung']);
  assert.deepEqual(keys.filter((k) => X.MAP.styles[k].search), ['sgg', 'seoul', 'life', 'dust'], '지역 이름 검색 지도');
});

test('칠하는 구분 이름·구역 수 — 하드코딩 없이 도형에서 센다', () => {
  const X = appCtx().X;
  const t = Object.fromEntries(Object.keys(X.MAP.styles).map((k) => [k, X.mapUnitText(k)]));
  assert.deepEqual(t, { sgg: '시군 173곳', sido: '시도 16곳', warn: '특보구역 235곳', warnsea: '특보구역 235곳 + 바다 44곳', typhoon: '', typhoonCompare: '', seoul: '동 427곳', life: '시군구 230곳', dust: '시군구 230곳', dustFcst: '예보 권역 19곳' });
  assert.equal(X.cardLabelOf('sido'), '예상 강수·적설 · 시도');
  assert.equal(X.cardLabelOf('sgg'), '예상 강수·적설 · 시군');
  assert.equal(X.cardLabelOf('life'), '생활기상');
  assert.equal(X.cardLabelOf('seoul'), '서울');
});

test('카드를 고를 때의 구분 — 작업 중 지금 지도 유지, 시작 화면은 첫 구분, 창에서 고른 칩 유지', () => {
  const c = appCtx(), X = c.X;
  const rain = X.MAP_CARDS.find((k) => k.id === 'rain');
  c.S.style = 'sido'; assert.equal(X.cardStyleFor(rain), 'sido');
  c.startScreenOn = () => true; assert.equal(X.cardStyleFor(rain), 'sgg');
  c.pendingStyle = 'sido'; assert.equal(X.cardStyleFor(rain), 'sido');
  c.pendingStyle = null; c.startScreenOn = () => false; c.S.style = 'life';
  assert.equal(X.cardStyleFor(rain), 'sgg');
  assert.equal(X.cardStyleFor(X.MAP_CARDS.find((k) => k.id === 'dust')), 'dust');
});

test('사이드바 데이터 섹션 — 지도마다 자기 섹션 하나만(다른 구분으로 옮겨 칠하지 않음)', () => {
  const c = appCtx(), X = c.X;
  const SECS = ['wrn', 'fct', 'life', 'dust', 'dustFcst'];
  const want = { sgg: 'fct', sido: 'fct', warn: 'wrn', warnsea: 'wrn', seoul: null, life: 'life', dust: 'dust', dustFcst: 'dustFcst', typhoon: null, typhoonCompare: null };
  for (const [st, sec] of Object.entries(want)) {
    c.S.style = st;
    assert.deepEqual(SECS.filter((s) => !X.secModeHidden(s)), sec ? [sec] : [], st);
    const card = X.cardOf(st);
    if (sec) assert.equal(card.sec, sec, `${st} → 카드를 고르면 펼칠 섹션`);
  }
  // 카드를 고르면 펼칠 섹션 = 카드의 sec (autoSecFor)
  assert.match(fnSrc('autoSecFor'), /const c = cardOf\(\);\n\s*return c && c\.sec && !secModeHidden\(c\.sec\) \? c\.sec : null;/);
  assert.match(fnSrc('updateAutoPaintSecs'), /for \(const s of \['wrn', 'fct', 'life', 'dust', 'dustFcst', 'legend'/);
});

test('배치 그룹 — 새 데이터 지도는 인셋을 써서 기본(common) 그룹, 옛 키는 그대로', () => {
  const X = appCtx().X;
  assert.deepEqual(['sgg', 'sido', 'warn', 'life', 'dust', 'dustFcst'].map(X.layoutGroup), Array(6).fill('common'));
  assert.deepEqual(['warnsea', 'seoul', 'typhoon', 'typhoonCompare'].map(X.layoutGroup), ['warnsea', 'seoul', 'typhoon', 'typhoonCompare']);
});

test('옛 저장값 그대로 열림 — style 7종은 옮기기 없이 유효, 데이터 지도 파일을 못 읽으면 시도군으로', () => {
  const c = appCtx(), X = c.X;
  const card = { sgg: 'rain', sido: 'rain', warn: 'warn', warnsea: 'warnsea', seoul: 'seoul', typhoon: 'typhoon', typhoonCompare: 'typhoonCompare' };
  for (const [st, id] of Object.entries(card)) { c.S.style = st; X.normStyle(); assert.equal(c.S.style, st); assert.equal(X.cardOf().id, id); }
  const n = appCtx({ region: false });
  assert.equal(n.X.MAP.styles.life, undefined);
  assert.equal(n.X.mapCards().map((k) => k.id).join(), 'warn,warnsea,rain,seoul,typhoon,typhoonCompare', '도형이 없는 카드는 안 보인다');
  n.S.style = 'life'; n.X.normStyle(); assert.equal(n.S.style, 'sgg');
});

test('아이콘 — 카드 id마다 있고, 색은 글자색(currentColor)만(#hex 없음)', () => {
  const X = appCtx().X;
  for (const k of X.MAP_CARDS) {
    assert.ok(X.CGS_ICON[k.id], k.id);
    assert.doesNotMatch(X.CGS_ICON[k.id], /#[0-9a-f]{3,6}\b/i, k.id);
  }
  assert.match(fnSrc('cgsIconSvg'), /stroke="currentColor"/);
});

test('장면 설정·사이드바·배지 마크업 — 구분 줄, 데이터 섹션 3개 뼈대, 데이터 섹션 맨 위, 배지(옛 전국/서울 버튼 자리)', () => {
  assert.match(html, /<div class="cgSetupCard cgsScene" role="dialog"/);
  assert.match(html, /<div class="cgsPaneSub">어떤 자료를 그릴지 · 자료마다 들어오는 구분 그대로 칠해요<\/div>/);
  for (const s of ['wrn', 'fct', 'life', 'dust', 'dustFcst']) {
    const i = html.indexOf(`<div class="sec special" data-sec="${s}">`);
    assert.ok(i > 0, s);
    assert.match(html.slice(i, i + 400), /<div class="mapUnitRow" data-map-unit><\/div>/, `${s} 첫 줄 = 구분 줄`);
  }
  assert.match(html, /const SEC_ORDER = \['wrn', 'fct', 'life', 'dust', 'dustFcst', 'res', 'text', 'legend', 'pal', 'sea', 'label', 'mtn', 'map'\];/);
  assert.match(html, /life: \['special', '특수'\], dust: \['special', '특수'\], dustFcst: \['special', '특수'\]/);
  assert.match(html, /<button id="fctMapBtn" class="basemapBtn unitPill" type="button"[^>]*>\s*<span class="unitIc" aria-hidden="true"><\/span><span class="unitTxt"><\/span>/);
  assert.doesNotMatch(html, /data-mt="seoul"/, '전국/서울 옵션은 없앰(서울은 카드)');
  // 옛 사이드바 배치(10-10 전 — secV 없음)는 데이터 섹션만 새 자리(맨 위)로, 범례는 제목 텍스트 밑
  const ll = fnSrc('loadLayout');
  assert.match(ll, /const reseat = \(s\) => s === 'legend' \|\| \(L\.secV !== SEC_LAYOUT_V && SEC_DATA\.includes\(s\)\);/);
  assert.match(fnSrc('saveLayout'), /secV: SEC_LAYOUT_V/);
  // 지역 이름 검색·구역선 이름은 도형 깃발·구분 이름으로
  assert.match(fnSrc('regionSearchRender'), /box\.hidden = !curStyle\(\)\.search;/);
  assert.match(fnSrc('regionSearchPaint'), /if \(!curStyle\(\)\.search\) return;/);
  assert.match(html, /const kind = mapUnitOf\(S\.style\);/);
});

test('새 이름은 한 번씩만', () => {
  for (const n of ['syncMapUnit', 'mapUnitRowFill', 'mapUnitPopFill', 'cardStyleFor', 'cardLabelOf', 'mapUnitCount', 'syncCgsUnitRow']) assert.equal(html.split(`function ${n}(`).length - 1, 1, n);
  for (const n of ['MAP_CARDS', 'mapCards', 'cardOf', 'MAP_UNIT', 'mapUnitOf', 'mapUnitText', 'SEC_DATA', 'SEC_LAYOUT_V']) assert.equal((html.match(new RegExp(`\\nconst ${n} = `, 'g')) || []).length, 1, n);
  assert.equal(html.split('function syncFctMapBtn(').length - 1, 0, '옛 전국/서울 버튼 동기화는 syncMapUnit으로 바뀜');
});

// ── 실제 앱(부팅 점검기) — WCG_BOOT_CHECK=1 일 때만 ──
test('부팅 점검: 카드 9장 3열·구분 줄·시도 칩·서울 카드·데이터 섹션 맨 위·배지·옛 작업·옛 배치·칠 따로', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=9000', '--size=1600x900', '--keepalive', '--eval=' + path.join(__dirname, 'map-cards.boot-eval.js')], { encoding: 'utf8', timeout: 480000 });
  const out = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  const R = out.evalResult;
  assert.ok(R && !R.error, JSON.stringify(R));
  assert.deepEqual(R.cards, ['warn', 'warnsea', 'rain', 'life', 'dust', 'dustFcst', 'seoul', 'typhoon', 'typhoonCompare']);
  assert.deepEqual([R.grid.rows, R.grid.cols], [3, 3], '1600px 창 = 3열 3줄');
  assert.match(R.unitEmpty, /카드를 고르면 칠하는 구분이 여기 나와요/);
  assert.deepEqual(R.rainPick, { unit: '시군 173곳', chips: ['sgg', 'sido'], chipsShown: true });
  assert.deepEqual(R.sidoChip, { pick: '예상 강수·적설 · 시도', cardStyle: 'sido', unit: '시도 16곳', sub: '시도 · 시도 단위로 칠하기' });
  assert.equal(R.afterSido.style, 'sido');
  assert.deepEqual(R.reopenSido, { picked: ['rain'], cardStyle: 'sido', chipOn: 'sido', againStyle: 'sido' });
  assert.deepEqual(R.oldSelector, { style: 'sgg' }, '옛 선택자 [data-style="sgg"]도 그대로');
  assert.deepEqual(R.seoul, { style: 'seoul', badge: '동', dataSecs: [] });
  for (const k of ['life', 'dust', 'dustFcst']) {
    const v = R.data[k];
    assert.equal(v.style, k);
    assert.deepEqual(v.dataSecs, [k], `${k}: 자기 데이터 섹션만`);
    assert.equal(v.firstSec, k, `${k}: 사이드바 맨 위`);
    assert.ok(v.open, `${k}: 펼쳐짐`);
    assert.match(v.row, k === 'dustFcst' ? /예보 권역19곳/ : /시군구230곳/);
  }
  assert.equal(R.data.life.badge, '시군구');
  assert.equal(R.data.dustFcst.badge, '예보 권역');
  assert.deepEqual(R.badgeRain, { opts: ['sgg', 'sido'], after: 'sido', onAfter: 'sido' });
  assert.deepEqual(R.badgeLife, { info: true, setupOpened: true });
  assert.deepEqual(R.sideSeg, { before: 'sgg', after: 'sido' });
  assert.deepEqual(R.fills, { life: '#123ABC', dustEmpty: true, back: '#123ABC', undo: 'life' }, '칠은 지도(키)마다 따로·되돌리기');
  for (const k of ['life', 'dust', 'dustFcst']) assert.deepEqual(R.out[k], { fillsPng: true, fullPng: true, ae: (k === 'life' ? ['색칠_낮음', '색칠_매우높음'] : ['색칠_보통', '색칠_매우나쁨']).sort(), inset: true }, `${k}: 이미지 추출·AE 스펙`);
  assert.deepEqual(R.typhoonBadge, { hidden: true });
  assert.deepEqual(R.oldWorks, { seoul: 'seoul', sido: 'rain:sido', warnsea: 'warnsea', typhoon: 'typhoon', sgg: 'rain:sgg' });
  assert.ok(R.layoutOld.wrnBeforeRes && R.layoutOld.lifeBeforeRes && R.layoutOld.legendAfterText, JSON.stringify(R.layoutOld));
  assert.equal(R.layoutOld.savedV, 2);
  assert.ok(R.layoutNew.wrnLast, '새 판 배치는 사용자 순서 그대로');
});
