// 에어코리아·생활기상 느림·누락 고치기(2026-10-10) — 네트워크 없이 본다.
// 실측 모양(진단): 새 연결 첫 요청 약 1/3이 30초 뒤 504·57초 뒤 503(SERVICETIMEOUT_ERROR 05 — JSON 으로 감싸 옴), 헬퍼는 그걸 'The read operation timed out'으로 줬다,
// 농도 DAILY = 최근 24시간 시간별 값('24:00' 꼴), 광주·전남은 totalCount 0, 생활기상 옛 코드는 99 '검색결과가 없습니다', 예보 InformCode 무시·05시 전 오늘 0건.
// 픽스처(tests/fixtures/datamaps/)는 그 모양을 흉내 낸 합성 자료다(값은 지어낸 것).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');
const root = path.join(__dirname, '..');
const src = appSource(path.join(root, 'index.html'));
const start = src.indexOf('// ===================== 공공데이터포털 자료 공통');
const end = src.indexOf('// ===================== 해상도별 배치 프리셋', start);
assert.ok(start > 0 && end > start);
const fixture = (n) => fs.readFileSync(path.join(__dirname, 'fixtures/datamaps', n), 'utf8');
const plain = (o) => JSON.parse(JSON.stringify(o));
const OK = JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: [{ a: 1 }], totalCount: 1 } } });
const GW = fixture('err-gateway-timeout.json');
function ctx(extra = {}) {
  const store = new Map();
  const c = { S: { style: 'dust', fillsByStyle: {}, dataByStyle: {}, labels: [], dataColors: {} },
    localStorage: { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) },
    setTimeout, clearTimeout, AbortController, Date, console, URL, _workRev: 0, curStyle: () => ({ data: 'dust' }), WNS_HELPER: 'http://helper.test',
    ...extra };
  vm.createContext(c); vm.runInContext(src.slice(start, end), c);
  c.run = (s) => vm.runInContext(s, c);
  c.run('DATA_TRY.wait = [1, 1, 1];');   // 시험에선 쉬지 않는다
  return c;
}
// 가짜 데스크톱 메인 길 — answers[i](주소, 옵션)가 i번째 응답
function desktop(answers, calls) {
  return { wcgDesktop: { isDesktop: true, dataFetch: async (u, o) => { calls.push({ u, ms: o.timeoutMs }); const a = answers[Math.min(calls.length - 1, answers.length - 1)]; return typeof a === 'function' ? a(u, o) : a; } } };
}

test('게이트웨이 시간 초과(504 SERVICETIMEOUT 05 — JSON 감쌈)·헬퍼 시간 초과 문구·생활기상 99 를 바르게 읽는다', () => {
  const c = ctx();
  const gw = c.dataReadBody(GW);
  assert.equal(gw.kind, 'server'); assert.equal(gw.code, '05');
  assert.equal(c.dataHttpBody(504, GW).kind, 'server');
  assert.equal(c.dataHttpBody(503, '<html>busy</html>').kind, 'server', '못 읽는 5xx 본문 = 게이트웨이');
  assert.equal(c.dataHttpBody(401, 'Unauthorized').kind, 'keyBad');
  const to = c.dataHttpFail(502, JSON.stringify({ ok: false, error: 'The read operation timed out' }));
  assert.equal(to.kind, 'net'); assert.equal(to.timeout, true, '시간 초과를 5xx 보다 먼저 본다(전엔 server 로 잘못 분류)');
  assert.equal(c.dataHttpFail(502, JSON.stringify({ error: 'HTTP Error 504: Gateway Time-out' })).kind, 'server');
  assert.equal(c.dataHttpFail(502, JSON.stringify({ error: '<urlopen error [Errno 11001] getaddrinfo failed>' })).kind, 'net');
  assert.equal(c.dataReadBody(fixture('life-99.json')).kind, 'nodata', '99 검색결과 없음 = 자료 없음(옛 코드로 받기가 이어진다)');
  assert.equal(c.dataReadBody(JSON.stringify({ response: { header: { resultCode: '99', resultMsg: 'UNKNOWN_ERROR' } } })).kind, 'other');
  const v = c.dataResultView({ kind: 'net', timeout: true, tries: 4, st: 'dustFcst' });
  assert.match(v.title, /응답이 너무 늦어요/); assert.match(v.lines[0], /4번/);
});

test('늦은 응답·게이트웨이 오류는 시간 제한을 늘려 가며 다시 보내고, 키 오류는 다시 보내지 않는다', async () => {
  const calls = [];
  const c = ctx({ window: desktop([{ ok: false, err: 'timeout', sent: 2 }, { ok: true, status: 504, text: GW, sent: 1 }, { ok: true, status: 200, text: OK, sent: 1 }], calls) });
  const retries = [];
  const r = await c.dataGet('https://apis.data.go.kr/B552584/A/b?serviceKey=TEST-ONLY', { onRetry: (n, x) => retries.push([n, x.kind]) });
  assert.equal(r.kind, 'ok');
  assert.deepEqual(calls.map((x) => x.ms), [5000, 9000, 15000], '시도마다 더 오래 기다린다');
  assert.deepEqual(retries, [[1, 'net'], [2, 'server']]);
  assert.equal(c.run('dataNet').sent, 4, '하나 더 보낸 것까지 센다'); assert.equal(c.run('dataNet').retried, 2);
  // 끝까지 안 되면 4번에서 멈추고 몇 번 보냈는지 남긴다
  const calls2 = [];
  const c2 = ctx({ window: desktop([{ ok: true, status: 504, text: GW, sent: 1 }], calls2) });
  const r2 = await c2.dataGet('https://apis.data.go.kr/B552584/A/b');
  assert.equal(r2.kind, 'server'); assert.equal(r2.tries, 4); assert.equal(calls2.length, 4);
  assert.deepEqual(calls2.map((x) => x.ms), [5000, 9000, 15000, 25000]);
  // 키·신청·한도 오류는 한 번만
  for (const body of [fixture('err-json-30.json'), fixture('err-quota.xml'), fixture('err-denied.xml')]) {
    const k = []; const ck = ctx({ window: desktop([{ ok: true, status: 200, text: body, sent: 1 }], k) });
    const x = await ck.dataGet('https://apis.data.go.kr/B552584/A/b');
    assert.equal(k.length, 1, x.kind);
  }
  // 자료 없음(03·99)도 한 번만
  const n = []; const cn = ctx({ window: desktop([{ ok: true, status: 200, text: fixture('life-99.json'), sent: 1 }], n) });
  assert.equal((await cn.dataGet('https://apis.data.go.kr/1360000/L/x')).kind, 'nodata'); assert.equal(n.length, 1);
  // 불러오기가 무효가 되면 다음 시도를 보내지 않는다
  const s = []; let live = true; const cs = ctx({ window: desktop([() => { live = false; return { ok: false, err: 'timeout', sent: 1 }; }], s) });
  assert.equal((await cs.dataGet('https://apis.data.go.kr/B552584/A/b', { stale: () => !live })).kind, 'cancelled'); assert.equal(s.length, 1);
});

test('메인 길을 못 쓰면(점검 모드·프록시 PC·옛 메인) 이번 실행 동안 헬퍼 길로 — 헬퍼 길도 시도마다 시간 제한', async () => {
  for (const ans of [{ ok: false, err: 'off' }, { ok: false, err: 'proxy', sent: 0 }, () => { throw new Error("No handler registered for 'wcg:data-fetch'"); }]) {
    const calls = [], hits = [];
    const c = ctx({ window: desktop([ans], calls), fetch: async (u) => { hits.push(u); return { ok: true, status: 200, text: async () => OK }; } });
    assert.equal((await c.dataGet('https://apis.data.go.kr/B552584/A/b?serviceKey=K')).kind, 'ok');
    assert.equal(c.run('dataNet').desktopOff, true);
    assert.equal(hits.length, 1); assert.match(hits[0], /^http:\/\/helper\.test\/api\/kma\?u=https%3A%2F%2Fapis\.data\.go\.kr/);
    await c.dataGet('https://apis.data.go.kr/B552584/A/b');
    assert.equal(calls.length, 1, '두 번째부터는 메인에 묻지 않는다'); assert.equal(hits.length, 2);
  }
  // 허용 밖(denied)은 그 요청만 헬퍼로
  const dc = [], dh = [];
  const cd = ctx({ window: desktop([{ ok: false, err: 'denied', sent: 0 }], dc), fetch: async (u) => { dh.push(u); return { ok: true, status: 200, text: async () => OK }; } });
  await cd.dataGet('https://apis.data.go.kr/B552584/A/b'); assert.equal(cd.run('dataNet').desktopOff, false); assert.equal(dh.length, 1);
  // 헬퍼 길 시간 초과 — 받는 쪽에서 끊고(AbortController) 다시
  let n = 0;
  const ch = ctx({ fetch: (u, o) => new Promise((res, rej) => { n++; if (n >= 2) return res({ ok: true, status: 200, text: async () => OK }); o.signal.addEventListener('abort', () => rej(new Error('aborted'))); }) });
  ch.run('DATA_TRY.ms[0] = 40;');
  const t0 = Date.now();
  assert.equal((await ch.dataGet('https://apis.data.go.kr/B552584/A/b')).kind, 'ok');
  assert.equal(n, 2); assert.ok(Date.now() - t0 < 1000);
  // 헬퍼가 시간 초과를 502 로 알려도 다시
  let m = 0;
  const cm = ctx({ fetch: async () => (++m < 2 ? { ok: false, status: 502, text: async () => JSON.stringify({ ok: false, error: 'The read operation timed out' }) } : { ok: true, status: 200, text: async () => OK }) });
  assert.equal((await cm.dataGet('https://apis.data.go.kr/B552584/A/b')).kind, 'ok'); assert.equal(m, 2);
  // 헬퍼가 꺼져 있으면 다시 보내지 않는다(helperOff — 치명)
  let off = 0;
  const co = ctx({ fetch: async () => { off++; throw new TypeError('Failed to fetch'); } });
  assert.equal((await co.dataGet('https://apis.data.go.kr/B552584/A/b')).kind, 'helperOff'); assert.equal(off, 1);
});

test('여러 쪽 — 총건수 0(광주·전남)이면 줄 수가 numOfRows 보다 적을 때 끝, 가득 찬 쪽 뒤 빈 쪽도 끝', async () => {
  const c = ctx(); const pages = [];
  const page = (n, total) => ({ kind: 'ok', items: Array.from({ length: n }, (_, i) => ({ i: pages.length * 1000 + i })), total: total || n, totalRaw: total || 0 });
  c.dataGet = async (u) => { pages.push(new URL(u).searchParams.get('pageNo')); return page(120, 0); };
  let r = await c.dataGetPages('https://apis.data.go.kr/B/A/b', { numOfRows: 1000 }, () => false);
  assert.equal(r.kind, 'ok'); assert.equal(r.items.length, 120); assert.equal(pages.length, 1, 'DAILY 1000줄 = 한 번');
  pages.length = 0;
  c.dataGet = async () => { pages.push(1); return pages.length === 1 ? page(2, 0) : pages.length === 2 ? page(2, 0) : page(1, 0); };
  r = await c.dataGetPages('https://apis.data.go.kr/B/A/b', { numOfRows: 2 }, () => false);
  assert.equal(r.items.length, 5); assert.equal(pages.length, 3);
  pages.length = 0;
  c.dataGet = async () => { pages.push(1); return pages.length === 1 ? page(2, 0) : { kind: 'nodata', total: 0 }; };
  r = await c.dataGetPages('https://apis.data.go.kr/B/A/b', { numOfRows: 2 }, () => false);
  assert.equal(r.kind, 'ok'); assert.equal(r.items.length, 2);
  // 총건수를 알면 모자란 채 끝나는 건 실패(부분 자료로 덮지 않음)
  c.dataGet = async () => { pages.push(1); return pages.length === 4 ? page(2, 5) : { kind: 'nodata', total: 0 }; };
  pages.length = 3;
  assert.equal((await c.dataGetPages('https://apis.data.go.kr/B/A/b', { numOfRows: 2 }, () => false)).kind, 'format');
  // 페이지 사이 실패는 그대로(tries 포함)
  c.dataGet = async () => ({ kind: 'server', tries: 4 });
  assert.equal((await c.dataGetPages('https://apis.data.go.kr/B/A/b', { numOfRows: 2 }, () => false)).tries, 4);
});

test('농도 24시간 자료 — 1시간 값·직전 시각 보충(3시간 안)·빈 곳 까닭·24시간 평균(18칸 이상)·24:00·이름 차이', () => {
  const c = ctx();
  const items = c.dataReadBody(fixture('dust-daily-gangwon.json')).items;
  const A = (zone, code, altNames = []) => ({ id: '강원/' + zone, sido: '강원', zone, code, altNames });
  const areas = [A('춘천시', '51110'), A('양양군', '51830'), A('고성군', '51820'), A('철원군', '51780'), A('삼척시', '51230'), A('정선군', '51770')];
  const m = c.dustMatch(items, areas);
  assert.equal(m.dataTime, '2026-10-10 03:00');
  assert.deepEqual(plain(m.span), ['2026-10-09 04:00', '2026-10-10 03:00']);
  assert.deepEqual(plain(m.vals['강원/춘천시']), [43, 10]);
  assert.deepEqual(plain(m.avg['강원/춘천시']), [32, 10], '20~43 평균 31.5 → 32');
  // 양양: 최근 시각 줄이 없음 → 02시 값으로 채움(표시)
  assert.deepEqual(plain(m.vals['강원/양양군']), [50, 25]);
  assert.equal(c.dustHourLabel(m.fill['강원/양양군'][0]), '10일 02시');
  // 고성: 4시간째 없음(3시간 안 직전 값 없음) → 같은 곳 24시간 평균(20칸 ≥ 18)으로 채움(표시)
  assert.deepEqual(plain(m.vals['강원/고성군']), [40, 20]); assert.deepEqual(plain(m.fill['강원/고성군']), ['avg', 'avg']);
  assert.equal(m.why['강원/고성군'], undefined); assert.deepEqual(plain(m.avg['강원/고성군']), [40, 20]);
  // 평균도 안 되면(18칸 미만) 비움(old)
  const few = c.dustMatch(items.filter((x) => x.cityName !== '고성군' || x.dataTime < '2026-10-09 10:00'), areas);
  assert.equal(few.vals['강원/고성군'], undefined); assert.deepEqual(plain(few.why['강원/고성군']), ['old', 'old']); assert.deepEqual(plain(few.avgN['강원/고성군']), [6, 6]);
  // 철원: PM10 늘 빈칸 → 비움(blank)·평균도 없음(0칸), PM2.5 는 그대로
  assert.deepEqual(plain(m.vals['강원/철원군']), [null, 12]); assert.deepEqual(plain(m.why['강원/철원군']), ['blank', null]);
  assert.deepEqual(plain(m.avg['강원/철원군']), [null, 12]); assert.deepEqual(plain(m.avgN['강원/철원군']), [0, 24]);
  // 삼척: 최근 PM2.5 '-' → 02시 값으로
  assert.deepEqual(plain(m.vals['강원/삼척시']), [30, 15]); assert.deepEqual(plain(m.fill['강원/삼척시']).map((h) => h && c.dustHourLabel(h)), [null, '10일 02시']);
  // 정선: 응답에 없음 → absent, 이웃 값으로 채우지 않는다
  assert.equal(m.vals['강원/정선군'], undefined); assert.deepEqual(plain(m.why['강원/정선군']), ['absent', 'absent']);
  assert.deepEqual(plain(m.unknown), ['강원 없는군']);
  assert.deepEqual(plain(m.miss), ['강원/정선군']);
  // 기준 시각 지정(못 받은 시도만 다시 — 지난 자료와 같은 시각)
  const at = c.dustHourNo('2026-10-10 01:00');
  const m1 = c.dustMatch(items, areas, { at });
  assert.deepEqual(plain(m1.vals['강원/춘천시']), [41, 10]); assert.equal(m1.dataTime, '2026-10-10 01:00');
  assert.equal(c.dustHourNo('2026-10-09 24:00'), c.dustHourNo('2026-10-10 00:00'), '24:00 = 다음 날 00시');
  // 옛 이름(2026 개편) — 시각마다 평균
  const inc = [{ id: '인천/제물포구', sido: '인천', zone: '제물포구', code: '28125', altNames: ['인천/중구', '인천/동구'] }];
  const row = (cityName, dataTime, pm10Value) => ({ sidoName: '인천', cityName, dataTime, pm10Value, pm25Value: '' });
  const mi = c.dustMatch([row('중구', '2026-10-10 03:00', '20'), row('동구', '2026-10-10 03:00', '60'), row('중구', '2026-10-10 02:00', '10'), row('동구', '2026-10-10 02:00', '30')], inc, { avgMin: 2 });
  assert.deepEqual(plain(mi.vals['인천/제물포구']), [40, null]); assert.match(mi.via['인천/제물포구'], /평균/);
  assert.deepEqual(plain(mi.avg['인천/제물포구']), [30, null]);
});

test('농도 칠·결과 카드 — 1시간은 보충한 곳 수를, 24시간 평균은 평균이 안 된 까닭을 쉬운 말로', () => {
  const zones = ['춘천시', '양양군', '고성군', '철원군', '삼척시', '정선군'].map((z) => ({ id: '강원/' + z, sido: '강원', zone: z, code: '', altCodes: [], altNames: [] }));
  const c = ctx({ MAP: { styles: { dust: { zones } } } });
  const items = c.dataReadBody(fixture('dust-daily-gangwon.json')).items;
  const m = c.dustMatch(items, c.dataAreas());
  const info = { item: 'pm10', cond: 'HOUR', dataTime: m.dataTime, span: m.span, vals: m.vals, fill: m.fill, avg: m.avg, avgN: m.avgN, why: m.why, via: m.via, unknown: m.unknown, noSido: [] };
  const hour = c.dustResultOk(info, c.dustPaintPlan(info).cnt);
  assert.match(hour.lines.join('\n'), /빈 값을 같은 시군구 값으로 채운 곳 2곳: 강원 양양군\(10일 02시 값\), 강원 고성군\(24시간 평균\)/);
  assert.match(hour.lines.join('\n'), /비워 둔 곳 2곳: 강원 철원군\(측정값 빈칸\), 강원 정선군\(응답에 없음\)/);
  assert.match(hour.meta, /2026-10-10 03:00 기준 · 1시간 값/);
  const day = { ...info, cond: 'DAILY' };
  const dv = c.dustResultOk(day, c.dustPaintPlan(day).cnt);
  assert.match(dv.meta, /2026-10-09 04:00 ~ 2026-10-10 03:00 · 24시간 평균/);
  assert.match(dv.lines.join('\n'), /강원 철원군\(24시간 측정값 없음\)/);
  assert.equal(Object.keys(c.dustPaintPlan(day).F).length, 4, '춘천·양양·고성·삼척(평균) — 철원 PM10·정선은 비움');
  const pm25 = { ...info, item: 'pm25' };
  assert.match(c.dustResultOk(pm25, c.dustPaintPlan(pm25).cnt).lines.join('\n'), /채운 곳 3곳: 강원 양양군\(10일 02시 값\), 강원 고성군\(24시간 평균\), 강원 삼척시\(10일 02시 값\)/);
  // 못 받은 시도 → '못 받은 곳만 다시'
  const part = c.dustResultOk({ ...info, noSido: ['경기'] }, c.dustPaintPlan(info).cnt);
  assert.equal(part.miss, 1); assert.equal(c.dataResultView({ ...part, st: 'dust' }).actions[0].id, 'miss');
  // 옛 자료(평균·까닭 없음)도 그대로 칠한다
  const old = { item: 'pm10', cond: 'DAILY', dataTime: '2026-10-09 23:00', vals: { '강원/춘천시': [40, 10] }, via: {}, unknown: [], noSido: [] };
  assert.equal(Object.keys(c.dustPaintPlan(old).F).length, 1);
  assert.match(c.dustResultOk(old, c.dustPaintPlan(old).cnt).meta, /2026-10-09 23:00 기준 · 1시간 값/, '옛 자료의 하루 평균은 실제로 최근 시각 값이었다');
});

test('캐시 유효 — 농도는 다음 정시 자료까지, 예보는 다음 발표까지(지났는데 아직이면 3분), 지난 날짜는 길게', () => {
  const c = ctx();
  const kst = (s) => new Date(s + '+09:00');
  const rows = [{ dataTime: '2026-10-10 03:00' }, { dataTime: '2026-10-10 02:00' }];
  assert.equal(Math.round(c.dustTtl(rows, kst('2026-10-10T03:40:00')) / 60e3), 35);
  assert.equal(c.dustTtl(rows, kst('2026-10-10T04:20:00')), 3 * 60e3, '04:15 지났는데 04시 자료가 아직 — 3분 뒤 다시');
  assert.equal(c.dustTtl(rows, kst('2026-10-10T03:01:00')), 74 * 60e3);
  const iss = (h) => ({ dataTime: `2026-10-10 ${h}시 발표` });
  assert.equal(c.dfcTtl('2026-10-10', [], kst('2026-10-10T04:40:00')), 20 * 60e3, '05시 발표 전 — 05시까지');
  assert.equal(c.dfcTtl('2026-10-10', [], kst('2026-10-10T05:10:00')), 3 * 60e3, '05시가 지났는데 아직 — 3분');
  assert.equal(c.dfcTtl('2026-10-10', [iss('05')], kst('2026-10-10T05:10:00')), 350 * 60e3, '05시 발표 있음 — 11시까지');
  assert.equal(c.dfcTtl('2026-10-10', [iss('23')], kst('2026-10-10T23:20:00')), 40 * 60e3);
  assert.equal(c.dfcTtl('2026-10-09', [iss('23')], kst('2026-10-10T04:40:00')), 6 * 3600e3);
  assert.equal(c.dfcTtl('2026-10-01', [iss('23')], kst('2026-10-10T04:40:00')), 24 * 3600e3);
  assert.equal(c.dfcTtl('2026-10-01', [], kst('2026-10-10T04:40:00')), 10 * 60e3);
  c.dataCachePut('a', { kind: 'ok' }, 50);
  assert.equal(c.dataCacheGet('a').kind, 'ok');
  return new Promise((r) => setTimeout(() => { assert.equal(c.dataCacheGet('a'), null); r(); }, 70));
});

test('예보는 날짜당 한 번 — 종류를 바꿔도 다시 받지 않는다(캐시), InformCode 를 보내지 않는다', async () => {
  const calls = [];
  const fc = fixture('dustfcst-pm10.json');
  const c = ctx({ window: desktop([{ ok: true, status: 200, text: fc, sent: 1 }], calls) });
  const a = await c.dfcGetDay('2026-10-09', () => false);
  const b = await c.dfcGetDay('2026-10-09', () => false);
  assert.equal(a.kind, 'ok'); assert.equal(b, a); assert.equal(calls.length, 1);
  const q = new URL(calls[0].u).searchParams;
  assert.equal(q.get('searchDate'), '2026-10-09'); assert.equal(q.get('InformCode'), null);
});

test('예보일 이름은 조회일 기준 — 오늘 조회에 어제 23시 발표를 보태도 오늘은 "오늘"', () => {
  const c = ctx();
  const p = c.dfcParse([{ dataTime: '2026-10-09 23시 발표', informData: '2026-10-10', informGrade: '서울 : 좋음' }, { dataTime: '2026-10-09 23시 발표', informData: '2026-10-11', informGrade: '서울 : 보통' }]);
  const info = { issue: '__LATEST__', date: '2026-10-10', issues: ['__LATEST__', ...p.issues], fc: { ...p.byIssue, __LATEST__: p.latest }, day: c.dfcDefaultDay(p.issues[0], Object.keys(p.latest).sort()) };
  assert.equal(info.day, '2026-10-10', '23시 발표의 기본 = 다음 날 = 오늘');
  assert.equal(c.dfcDayLabel(c.dfcRefDay(info), info.day), '오늘 10.10(토)');
  assert.equal(c.dfcDayLabel(c.dfcRefDay(info, '2026-10-09 23시 발표'), '2026-10-10'), '내일 10.10(토)', '발표를 고르면 그 발표 기준');
});
