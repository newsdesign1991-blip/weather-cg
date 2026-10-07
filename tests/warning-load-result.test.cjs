// 특보 '기상청에서 불러오기' 결과 판정·문구 — 정상인데 발효 특보 0건(none)을 오류로 보이지 않게.
// index.html의 순수 함수(wrnReadText·wrnHttpFail·wrnSummarize·wrnResultView)를 잘라 vm에서 돌린다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function sliceBetween(startText, endText) {
  const start = html.indexOf(startText);
  const end = html.indexOf(endText, start);
  assert.notEqual(start, -1, `missing start marker: ${startText}`);
  assert.notEqual(end, -1, `missing end marker: ${endText}`);
  return html.slice(start, end);
}

function ctx() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    sliceBetween('// ===================== 기상특보 자동 색칠', '// ===================== API 주소'),
    context,
    { filename: 'warning-load-result.js' },
  );
  return context;
}
const plain = (v) => JSON.parse(JSON.stringify(v));

// 2026-10-08 실제 기상청 응답(발효 특보 0건) — 머리만 있고 줄이 없다. #7777END도 없다.
const KMA_NONE = [
  '#START7777',
  '#---------------------------------------------------------------------------------------------------',
  '#  특보현황 조회',
  '#---------------------------------------------------------------------------------------------------',
  '#  1. REG_UP    : 상위 특보구역코드',
  '#  3. REG_ID    : 특보구역코드',
  '#  5. TM_FC     : 발표시각(년월일시분,KST)',
  '#---------------------------------------------------------------------------------------------------',
  '# REG_UP  REG_UP_KO-------------------------------  REG_ID    REG_KO----------------------------------  TM_FC         TM_EF         WRN     LVL       CMD   ED_TM',
].join('\n');
const row = (id, ko, tmfc, tmef, wrn, lvl, cmd) => `L1000000, 서울, ${id}, ${ko}, ${tmfc}, ${tmef}, ${wrn}, ${lvl}, ${cmd}, `;
const KMA_ROWS = KMA_NONE + '\n' + [
  row('L1010200', '서울동북권', '202610080100', '202610080100', '강풍', '주의보', '발표'),
  row('L1010300', '서울서북권', '202610080100', '202610080100', '강풍', '주의보', '발표'),
  row('L1010400', '서울서남권', '202610080100', '202610080100', '호우', '경보', '발표'),
].join('\n') + '\n#7777END';
const AT = '202610080420';

test('(a)/(b) 정상 응답 판정 — 머리만 온 응답도 오류가 아니라 rows 0개', () => {
  const { wrnReadText } = ctx();
  assert.deepEqual(plain(wrnReadText(KMA_NONE)), { kind: 'rows', rows: [] });
  const ok = wrnReadText(KMA_ROWS);
  assert.equal(ok.kind, 'rows');
  assert.equal(ok.rows.length, 3);
});

test('(e)/(f) 200으로 온 이상한 본문 — 빈 응답·인증키·초과·점검·형식·한글 깨짐', () => {
  const { wrnReadText } = ctx();
  assert.equal(wrnReadText('').kind, 'empty');
  assert.equal(wrnReadText('  \n ').kind, 'empty');
  const key = wrnReadText('{\n  "result" : {\n    "status" : 401,\n    "message" : "유효한 인증키가 아닙니다."\n  }\n}');
  assert.equal(key.kind, 'key');
  assert.equal(key.detail, '유효한 인증키가 아닙니다.');
  assert.equal(wrnReadText('{"result":{"status":403,"message":"API 호출 한도를 초과했습니다."}}').kind, 'quota');
  assert.equal(wrnReadText('<html><body><h1>시스템 점검 중입니다</h1></body></html>').kind, 'server');
  assert.equal(wrnReadText('hello world\nfoo,bar\n').kind, 'format');
  const broken = 'L1000000, ?, L1010200, ?, 202610080100, 202610080100, ??, ???, 1, ';
  assert.equal(wrnReadText(broken).kind, 'broken');
});

test('(c)(d)(e) 헬퍼 /api/kma 실패 판정 — 원인별로 갈린다', () => {
  const { wrnHttpFail } = ctx();
  const k = (s, b) => wrnHttpFail(s, b).kind;
  assert.equal(k(0, 'Failed to fetch'), 'helperOff');
  assert.equal(k(404, '{"ok":false}'), 'helperOld');
  assert.equal(k(502, '{"ok":false,"error":"HTTP Error 401: Unauthorized"}'), 'key');
  assert.equal(k(502, '{"ok":false,"error":"HTTP Error 403: Forbidden"}'), 'key');
  assert.equal(k(502, '{"ok":false,"error":"HTTP Error 429: Too Many Requests"}'), 'quota');
  assert.equal(k(502, '{"ok":false,"error":"HTTP Error 503: Service Unavailable"}'), 'server');
  assert.equal(k(502, '{"ok":false,"error":"HTTP Error 500: Internal Server Error"}'), 'server');
  const to = wrnHttpFail(502, '{"ok":false,"error":"<urlopen error timed out>"}');
  assert.equal(to.kind, 'net');
  assert.equal(to.timeout, true);
  assert.equal(k(502, '{"ok":false,"error":"<urlopen error [Errno 11001] getaddrinfo failed>"}'), 'net');
  assert.equal(k(400, '{"ok":false,"error":"허용되지 않은 주소"}'), 'other');
  assert.equal(wrnHttpFail(502, '{"ok":false,"error":"HTTP Error 503: Service Unavailable"}').detail, 'HTTP Error 503: Service Unavailable');
});

test('요약 — 발효 0건이어도 해제·발효 예정·예비 이름을 따로 센다', () => {
  const { wrnSummarize, parseWrn } = ctx();
  assert.equal(wrnSummarize([], AT).eff, 0);
  const evs = parseWrn([
    row('L1010200', '서울동북권', '202610080100', '202610080100', '강풍', '주의보', '발표'),
    row('L1010200', '서울동북권', '202610080300', '202610080300', '강풍', '주의보', '해제'),
    row('L1010300', '서울서북권', '202610080300', '202610081200', '호우', '주의보', '발표'),
    row('L1010400', '서울서남권', '202610080300', '202610080359', '호우', '예비', '발표'),
  ].join('\n'));
  const s = wrnSummarize(evs, AT);
  assert.equal(s.eff, 0);
  assert.equal(s.types, 0);
  assert.deepEqual(plain(s.rel), ['강풍 주의보']);
  assert.deepEqual(plain(s.up), ['호우 주의보']);
  assert.deepEqual(plain(s.pre), ['호우 예비']);
  const ok = wrnSummarize(parseWrn(KMA_ROWS), AT);
  assert.equal(ok.eff, 3);
  assert.equal(ok.types, 2);
});

test('(b) 발효 0건 문구 — 초록(ok) 톤, 완료, 실패·빨강 없음, 기준 시각과 지운 칠 안내', () => {
  const { wrnResultView } = ctx();
  const v = wrnResultView({ kind: 'none', src: 'fetch', at: AT, now: true, cleared: 2, pre: [], up: [], rel: ['강풍 주의보'] });
  assert.equal(v.tone, 'ok');
  assert.equal(v.title, '불러오기 완료 — 지금 발효 중인 기상특보가 없습니다');
  assert.equal(v.meta, '기상청 기준 2026.10.08 04:20 확인');
  const all = [v.title, v.meta, ...v.lines].join('\n');
  assert.doesNotMatch(all, /실패|못했/);
  assert.doesNotMatch(v.title, /오류/);
  assert.match(v.lines[0], /정상/);
  assert.ok(v.lines.some((l) => /특보 색\(2구역\)은 지웠어요/.test(l)));
  assert.ok(v.lines.some((l) => /해제된 특보\(강풍 주의보\)/.test(l)));
  assert.deepEqual(plain(v.actions), []);
  // 지난 시각 · 붙여넣기
  const past = wrnResultView({ kind: 'none', src: 'fetch', at: '202610071500', now: false });
  assert.equal(past.title, '불러오기 완료 — 그 시각에 발효 중인 기상특보가 없습니다');
  assert.equal(past.meta, '2026.10.07 15:00 기준 발효 현황');
  const paste = wrnResultView({ kind: 'none', src: 'paste', at: AT, now: true });
  assert.match(paste.title, /^칠하기 완료 — /);
  assert.equal(paste.tone, 'ok');
  // 켜 둔 예비특보만 칠했으면 '비어 있는 게 정상'이라고 하지 않는다
  const preOn = wrnResultView({ kind: 'none', src: 'fetch', at: AT, now: true, preOn: ['호우 예비'] });
  assert.match(preOn.lines[0], /켜 둔 예비특보\(호우 예비\)만 칠했어요/);
});

test('(a) 발효 N건 문구 — 초록 톤, 종류 수·칠한 구역 수, 꺼 둔 예비 안내', () => {
  const { wrnResultView } = ctx();
  const v = wrnResultView({ kind: 'ok', src: 'fetch', at: AT, now: true, types: 2, painted: 37, pre: ['호우 예비'] });
  assert.equal(v.tone, 'ok');
  assert.equal(v.title, '불러오기 완료 — 발효 중인 특보 2종 · 37개 구역 칠함');
  assert.ok(v.lines.some((l) => /예비특보\(호우 예비\)는 아직 발효 전이라 꺼 두었어요/.test(l)));
});

test('(c)~(f) 오류 문구 — 빨강(err) 톤, 원인·할 일·지도 그대로, 원인별 버튼', () => {
  const { wrnResultView } = ctx();
  const cases = {
    helperOff: ['기능 확장팩이 꺼져 있어요', ['helper', 'retry']],
    helperOld: ['기능 확장팩이 옛 버전이에요', ['helperOld', 'retry']],
    net: ['기상청에 연결되지 않아요', ['retry']],
    server: ['기상청 서버가 잠시 응답하지 않아요', ['retry']],
    key: ['인증키가 맞지 않아요', ['api', 'retry']],
    quota: ['오늘 쓸 수 있는 조회 횟수를 넘었어요', ['api', 'retry']],
    empty: ['기상청이 빈 응답을 보냈어요', ['retry', 'open']],
    format: ['특보 표가 아닌 응답이 왔어요', ['retry', 'open']],
    broken: ['한글이 깨진 채로 들어왔어요', ['open']],
    other: ['알 수 없는 문제가 생겼어요', ['retry']],
  };
  const titles = new Set();
  for (const [kind, [cause, acts]] of Object.entries(cases)) {
    const v = wrnResultView({ kind, src: 'fetch', detail: 'HTTP Error 503' });
    assert.equal(v.tone, 'err', kind);
    assert.equal(v.title, `불러오지 못했어요 — ${cause}`, kind);
    assert.ok(v.lines[0].length > 5, kind + ' 할 일');
    assert.equal(v.lines[1], '지도 색은 바꾸지 않았어요 — 이전 그대로입니다.');
    assert.equal(v.detail, '기술 정보: HTTP Error 503');
    assert.deepEqual(plain(v.actions.map((a) => a.id)), acts, kind);
    assert.ok(v.actions.every((a) => a.label && !/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(a.label)), kind + ' 버튼 이모지 금지');
    titles.add(v.title);
  }
  assert.equal(titles.size, Object.keys(cases).length, '원인마다 문구가 달라야 한다');
  // 데스크톱(내장 확장팩) · 시간 초과 · 붙여넣기
  assert.equal(wrnResultView({ kind: 'helperOff', desktop: true }).title, '불러오지 못했어요 — 내장 기능 확장팩이 응답하지 않아요');
  assert.equal(wrnResultView({ kind: 'net', timeout: true }).title, '불러오지 못했어요 — 기상청 응답이 너무 늦어요');
  const p = wrnResultView({ kind: 'format', src: 'paste' });
  assert.equal(p.title, '칠하지 못했어요 — 붙여넣은 글에서 특보 표를 찾지 못했어요');
  assert.ok(!p.actions.some((a) => a.id === 'retry'), '붙여넣기엔 다시 시도 없음');
});

test('흐름 — 같은 기상청 응답 경로에서 (b)는 ok, (c)~(f)는 err로 확실히 갈린다', () => {
  const { wrnReadText, wrnHttpFail, wrnSummarize, wrnResultView } = ctx();
  const view200 = (txt) => {
    const read = wrnReadText(txt);
    if (read.kind !== 'rows') return wrnResultView({ kind: read.kind, src: 'fetch' });
    const s = wrnSummarize(read.rows, AT);
    return wrnResultView({ kind: s.eff ? 'ok' : 'none', src: 'fetch', at: AT, now: true, types: s.types });
  };
  assert.equal(view200(KMA_ROWS).tone, 'ok');                 // (a)
  assert.equal(view200(KMA_NONE).tone, 'ok');                 // (b)
  assert.match(view200(KMA_NONE).title, /발효 중인 기상특보가 없습니다/);
  assert.equal(view200('').tone, 'err');                      // (f) 빈 응답
  assert.equal(view200('<html>점검</html>').tone, 'err');     // (d) 점검 페이지
  assert.equal(view200('{"result":{"status":401,"message":"유효한 인증키가 아닙니다."}}').tone, 'err');   // (e)
  assert.equal(wrnResultView(wrnHttpFail(0, 'Failed to fetch')).tone, 'err');   // (c)
});

test('불러오기·붙여넣기 경로는 alert 대신 결과 카드를 쓴다', () => {
  const fetchSrc = sliceBetween('async function fetchWrn(', '// 특보 종류별 색 편집 줄');
  const applySrc = sliceBetween('function applyWrn(', '// 고른 \'발표시각(통보문)\' 기준으로');
  assert.doesNotMatch(fetchSrc, /\balert\(/);
  assert.doesNotMatch(applySrc, /\balert\(/);
  assert.match(fetchSrc, /showWrnResult\(\{ kind: 'busy' \}\)/);
  assert.match(fetchSrc, /wrnFetchSeq/);   // 겹친 요청은 마지막 것만
  // 발효 0건 상태는 S에 남아 실행 취소·다시 열기에도 목록 카드가 따라온다
  assert.match(html, /S\.wrnNone = \{ at, now: isNow/);
  assert.match(html, /<div class="wrnRes" id="wrnResult"[^>]*hidden><\/div>/);
});
