// 특보 '기상청에서 불러오기' 결과 판정·문구 — 정상인데 발효 특보 0건(none)을 오류로 보이지 않게.
// index.html의 순수 함수(wrnReadText·wrnHttpFail·wrnSummarize·wrnResultView)를 잘라 vm에서 돌린다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');
const vm = require('node:vm');

const html = appSource(path.join(__dirname, '..', 'index.html'));

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
    // paste = 접힌 '자동이 안 될 때 · 수동 붙여넣기'를 펼쳐 보여 줌 — 헬퍼·연결처럼 브라우저 새 창으로는 될 수 있는 실패에만
    helperOff: ['기능 확장팩이 꺼져 있어요', ['helper', 'paste', 'retry']],
    helperOld: ['기능 확장팩이 옛 버전이에요', ['helperOld', 'paste', 'retry']],
    net: ['기상청에 연결되지 않아요', ['retry', 'paste']],
    server: ['기상청 서버가 잠시 응답하지 않아요', ['retry']],
    key: ['인증키가 맞지 않아요', ['api', 'retry']],
    quota: ['오늘 쓸 수 있는 조회 횟수를 넘었어요', ['api', 'retry']],
    empty: ['기상청이 빈 응답을 보냈어요', ['retry', 'open']],
    format: ['특보 표가 아닌 응답이 왔어요', ['retry', 'open']],
    broken: ['한글이 깨진 채로 들어왔어요', ['open']],
    other: ['알 수 없는 문제가 생겼어요', ['retry', 'paste']],
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
  // 붙여넣기 결과엔 '직접 붙여넣기' 없음(이미 펼쳐 쓰는 중) · 버튼 이름
  assert.ok(!wrnResultView({ kind: 'other', src: 'paste' }).actions.some((a) => a.id === 'paste'), '붙여넣기엔 직접 붙여넣기 없음');
  assert.equal(wrnResultView({ kind: 'helperOff', src: 'fetch' }).actions.find((a) => a.id === 'paste').label, '직접 붙여넣기');
  // 문구가 가리키는 '아래 …' 버튼은 접힌 묶음 속 버튼이 아니라 카드의 버튼 이름과 같아야 한다
  for (const kind of ['empty', 'broken']) {
    const v = wrnResultView({ kind, src: 'fetch' });
    assert.match(v.lines[0], /‘기상청 화면 새 창으로 열기’/, kind);
    assert.ok(v.actions.some((a) => a.label === '기상청 화면 새 창으로 열기'), kind);
  }
  assert.doesNotMatch(html.slice(html.indexOf('const WRN_FAIL = {'), html.indexOf('// 특보 목록 자리의')), /‘기상청 특보현황 새 창으로 열기’로/);
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

// ───────── 검토 반영: 형식 바뀜·바다만·예비 켬·지난 결과·403·되돌림 ─────────

// 실제 응답의 데이터 줄 모양(2026-08-03 확인) — 쉼표 10칸 뒤에 ',=' 꼬리가 붙는다
const realRow = (id, ko, tmfc, tmef, wrn, lvl, cmd) => `L1150000, 부산광역시                              , ${id}, ${ko}                                , ${tmfc}, ${tmef}, ${wrn}, ${lvl}    , ${cmd},  ,=`;

test('(f) 표 형식이 바뀌면 "특보 없음"이 아니라 형식 오류 — 머리만 오면 정상 0건', () => {
  const { wrnReadText } = ctx();
  // 머리 + 탭/공백으로 구분된 데이터 줄 → 하나도 못 읽음 → 없음으로 단정하지 않는다
  const tab = wrnReadText(KMA_NONE + '\nL1000000\t서울\tL1010200\t서울동북권\t202610080100\t202610080100\t강풍\t주의보\t발표\t\n#7777END');
  assert.equal(tab.kind, 'format');
  assert.equal(tab.drift, true);
  assert.equal(tab.unread, 1);
  assert.match(tab.detail, /^L1000000\t서울/);
  const space = wrnReadText(KMA_NONE + '\nL1000000 서울 L1010300 서울서북권 202610080100 202610080100 강풍 주의보 발표');
  assert.equal(space.kind, 'format');
  // 머리만 + '=' 꼬리·빈 줄만 → 정상 0건
  assert.deepEqual(plain(wrnReadText(KMA_NONE + '\n=\n  \n')), { kind: 'rows', rows: [] });
  // 실제 모양의 줄(',=' 꼬리)은 다 읽히고 못 읽은 줄 표시가 없다
  const real = wrnReadText(KMA_NONE + '\n' + realRow('L1082700', '부산서부', '202607181600', '202607181800', '폭염', '주의보', '발표'));
  assert.equal(real.kind, 'rows');
  assert.equal(real.rows.length, 1);
  assert.equal(real.rows[0].lvl, '주의보');
  assert.equal(real.unread, undefined);
  // 일부만 읽힘 → rows로 두되 못 읽은 줄 수를 알린다
  const part = wrnReadText(KMA_ROWS + '\nL1000000\t서울\tL1010500\t서울동남권\t202610080100');
  assert.equal(part.kind, 'rows');
  assert.equal(part.rows.length, 3);
  assert.equal(part.unread, 1);
});

test('(f) 형식 오류 문구 — 표 형식 바뀜·일부만 읽힘은 빨강, "특보 없음"이라고 하지 않는다', () => {
  const { wrnResultView, wrnReadText } = ctx();
  const drift = wrnResultView({ kind: 'format', drift: true, src: 'fetch', detail: 'L1000000\t서울' });
  assert.equal(drift.tone, 'err');
  assert.equal(drift.title, '불러오지 못했어요 — 특보 표 형식이 달라 읽지 못했어요');
  assert.match(drift.lines[0], /특보가 없는 게 아니라 못 읽은 거예요/);
  assert.deepEqual(plain(drift.actions.map((a) => a.id)), ['open', 'retry']);
  const part = wrnResultView({ kind: 'format', partial: true, unread: 2, src: 'fetch' });
  assert.equal(part.tone, 'err');
  assert.equal(part.title, '불러오지 못했어요 — 특보 표 일부를 읽지 못했어요');
  assert.match(part.lines[0], /읽지 못한 줄 2개/);
  assert.equal(part.lines[1], '지도 색은 바꾸지 않았어요 — 이전 그대로입니다.');
  for (const v of [drift, part]) assert.doesNotMatch([v.title, ...v.lines].join(' '), /오류가 아니에요|없습니다/);
  // 일부만 읽혔지만 발효 특보가 있어 칠한 경우 — 주황(확인 필요) + 새 창 버튼
  const warn = wrnResultView({ kind: 'ok', src: 'fetch', at: AT, now: true, types: 1, painted: 3, unread: 1, sample: 'L1000000\t서울' });
  assert.equal(warn.tone, 'warn');
  assert.match(warn.lines[0], /읽지 못한 줄이 1개 있어요/);
  assert.equal(warn.detail, '읽지 못한 줄: L1000000\t서울');
  assert.deepEqual(plain(warn.actions.map((a) => a.id)), ['open']);
  // 흐름: 머리 + 못 읽는 줄은 rows(→ none)로 가지 않는다
  assert.notEqual(wrnReadText(KMA_NONE + '\nL1000000\t서울\tL1010200').kind, 'rows');
});

test('(a) 육상 지도에 바다 특보만 — "1종 · 0개 구역"이 아니라 육상/바다를 나눠 이유를 말한다', () => {
  const { wrnResultView } = ctx();
  const v = wrnResultView({ kind: 'ok', src: 'fetch', at: AT, now: true, types: 1, painted: 0,
    seaHidden: 1, seaNames: ['풍랑 경보'], seaMap: '특보 + 해상', landEff: 0 });
  assert.equal(v.tone, 'ok');
  assert.equal(v.title, '불러오기 완료 — 발효 중인 특보 1종 · 육상 0구역 칠함 · 바다 1구역');
  assert.match(v.lines[0], /육상에는 발효 중인 특보가 없어 이 지도\(육상\)는 비어 있어요 — 정상이에요/);
  assert.match(v.lines[1], /바다 특보\(풍랑 경보\) 1구역은 이 지도에는 안 보여요 — ‘특보 \+ 해상’ 지도로 바꾸면 보여요/);
  // 육상도 칠했으면 '육상은 비어 있다'고 하지 않는다
  const both = wrnResultView({ kind: 'ok', src: 'fetch', at: AT, now: true, types: 2, painted: 2, seaHidden: 1, seaNames: ['풍랑 경보'], landEff: 2 });
  assert.equal(both.title, '불러오기 완료 — 발효 중인 특보 2종 · 육상 2구역 칠함 · 바다 1구역');
  assert.ok(!both.lines.some((l) => /육상에는/.test(l)));
  // 해상 지도에선 바다까지 칠한 수 그대로
  const sea = wrnResultView({ kind: 'ok', src: 'fetch', at: AT, now: true, types: 2, painted: 3, seaHidden: 0 });
  assert.equal(sea.title, '불러오기 완료 — 발효 중인 특보 2종 · 3개 구역 칠함');
  // 전부 꺼 둠 / 일부 꺼 둠 / 지도에 없는 구역
  const offAll = wrnResultView({ kind: 'ok', src: 'fetch', at: AT, now: true, types: 2, painted: 0, offAll: true, offNames: ['강풍 주의보', '호우 경보'] });
  assert.ok(offAll.lines.some((l) => /목록에서 특보를 모두 꺼 두어서 칠한 구역이 없어요/.test(l)));
  const offSome = wrnResultView({ kind: 'ok', src: 'fetch', at: AT, now: true, types: 2, painted: 1, offNames: ['호우 경보'] });
  assert.ok(offSome.lines.some((l) => /꺼 둔 특보\(호우 경보\)는 칠하지 않았어요/.test(l)));
  const unk = wrnResultView({ kind: 'ok', src: 'fetch', at: AT, now: true, types: 1, painted: 0, unknown: 1, unknownNames: ['없는구역'] });
  assert.equal(unk.tone, 'warn');
  assert.match(unk.lines[0], /지도에 없는 구역 1곳\(없는구역\)은 칠하지 못했어요/);
});

test('바다·꺼 둠·예비 숫자 세기(wrnPaintStats) — 지도 종류에 따라 바다 구역을 따로 센다', () => {
  const src = sliceBetween('function wrnPaintStats()', '// 목록 아래 한 줄 안내');
  const run = (style, rows, off, F, SF) => {
    const c = {
      MAP: { styles: { warn: { zones: [{ id: 'L1' }, { id: 'L2' }] }, warnsea: { label: '특보 + 해상' } }, sea: [{ id: 'S1' }] },
      S: { style, fillsByStyle: { warn: F }, seaFills: SF, wrnOff: off },
      wrnRows: rows,
      wrnKeyOf: (r) => r.wrn + '|' + r.lvl,
      isPre: (l) => /예비/.test(l),
      wrnColorOf: () => '#FF0000',
    };
    vm.createContext(c);
    vm.runInContext(src + '\nglobalThis.__r = wrnPaintStats();', c);
    return plain(c.__r);
  };
  const seaOnly = [{ id: 'S1', wrn: '풍랑', lvl: '경보' }];
  const land = run('warn', seaOnly, {}, {}, { S1: '#00F' });
  assert.equal(land.painted, 0);
  assert.equal(land.seaHidden, 1);
  assert.deepEqual(land.seaNames, ['풍랑 경보']);
  assert.equal(land.landEff, 0);
  const seaMap = run('warnsea', seaOnly, {}, {}, { S1: '#00F' });
  assert.equal(seaMap.painted, 1);
  assert.equal(seaMap.seaHidden, 0);
  // 지도에 없는 구역 · 일부 꺼 둠 · 켜 둔 예비
  const rows = [{ id: 'L9', ko: '없는구역', wrn: '강풍', lvl: '주의보' }, { id: 'L1', wrn: '호우', lvl: '경보' }, { id: 'L2', wrn: '호우', lvl: '예비' }];
  const st = run('warn', rows, { '호우|경보': 1, '호우|예비': 0 }, { L2: '#0F0' }, {});
  assert.equal(st.unknown, 1);
  assert.deepEqual(st.unknownNames, ['없는구역']);
  assert.deepEqual(st.offNames, ['호우 경보']);
  assert.equal(st.offAll, false);
  assert.deepEqual(st.preOn, ['호우 예비']);
  assert.equal(st.painted, 1);
  const allOff = run('warn', rows.slice(1), { '호우|경보': 1, '호우|예비': 1 }, {}, {});
  assert.equal(allOff.offAll, true);
  assert.equal(allOff.onCount, 0);
  // 칠을 지운 뒤(특보 색 지우기)엔 칠한 구역으로 세지 않는다
  assert.equal(run('warn', [{ id: 'L1', wrn: '호우', lvl: '경보' }], {}, {}, {}).painted, 0);
});

test('목록의 "특보 없음" 카드 — 켜 둔 예비가 있으면 "비어 있는 게 정상"이라 하지 않고, 오래된 "지금"은 "그때"로', () => {
  const { wrnEmptyView, wrnResultView } = ctx();
  const info = { at: AT, now: true, src: 'fetch', pre: ['호우 예비'] };
  const fresh = wrnEmptyView(info, { nowTm: '202610080450', preOn: false });
  assert.equal(fresh.title, '지금 발효 중인 기상특보가 없습니다');
  assert.equal(fresh.stale, false);
  assert.equal(fresh.sub, '기상청 기준 2026.10.08 04:20 확인 · 칠할 구역이 없어 지도가 비어 있는 게 정상이에요 · 아래 예비특보는 아직 발효 전이라 꺼 두었어요');
  const preOn = wrnEmptyView(info, { nowTm: '202610080450', preOn: true });
  assert.match(preOn.sub, /발효 중인 특보는 없고, 켜 둔 예비특보만 칠했어요/);
  assert.doesNotMatch(preOn.sub, /비어 있는 게 정상|아직 발효 전이라 꺼 두었어요/);
  // 다음 날 다시 연 작업 — '지금 … 없습니다'라고 단정하지 않는다
  const stale = wrnEmptyView(info, { nowTm: '202610090900', preOn: false });
  assert.equal(stale.stale, true);
  assert.equal(stale.title, '2026.10.08 04:20 확인 때는 발효 중인 기상특보가 없었습니다');
  assert.match(stale.sub, /지금 상태는 위 ‘기상청에서 불러오기’로 다시 확인하세요/);
  assert.equal(wrnEmptyView(info, { nowTm: '202610080519' }).stale, false);   // 59분 — 아직 '지금'
  assert.equal(wrnEmptyView(info, { nowTm: '202610080520' }).stale, true);    // 60분
  // 지난 시각 조회는 원래 '그 시각' 문구라 오래돼도 그대로
  const past = wrnEmptyView({ at: '202610071500', now: false, src: 'fetch' }, { nowTm: '202610090900' });
  assert.equal(past.title, '이 시각에 발효 중인 기상특보가 없습니다');
  // 붙여넣기 — PC 시각을 '기상청 기준'처럼 말하지 않는다
  const paste = wrnEmptyView({ at: AT, now: true, src: 'paste' }, { nowTm: '202610080430' });
  assert.equal(paste.title, '붙여넣은 특보현황에는 발효 중인 기상특보가 없습니다');
  assert.match(paste.sub, /^붙여넣은 특보현황 · 2026\.10\.08 04:20에 칠함/);
  const pv = wrnResultView({ kind: 'none', src: 'paste', at: AT, now: true });
  assert.equal(pv.title, '칠하기 완료 — 붙여넣은 특보현황에는 발효 중인 기상특보가 없습니다');
  assert.equal(pv.meta, '붙여넣은 특보현황 · 2026.10.08 04:20에 칠함');
});

test('(e) 403 — 단서가 없으면 "키 틀림"으로 단정하지 않고, 기본 키·개인 키 안내를 나눈다', () => {
  const { wrnHttpFail, wrnResultView } = ctx();
  const f403 = wrnHttpFail(502, '{"ok":false,"error":"HTTP Error 403: Forbidden"}');
  assert.equal(f403.kind, 'key');
  assert.equal(f403.maybeQuota, true);
  assert.equal(wrnHttpFail(502, '{"ok":false,"error":"HTTP Error 401: Unauthorized"}').maybeQuota, false);
  assert.equal(wrnHttpFail(502, '{"ok":false,"error":"HTTP Error 403: 유효한 인증키가 아닙니다"}').maybeQuota, false);
  const def = wrnResultView({ ...f403, src: 'fetch', defKey: true });
  assert.equal(def.title, '불러오지 못했어요 — 기본 인증키가 막혔거나 오늘 조회 횟수를 넘었어요');
  assert.match(def.lines[0], /개인 인증키를 넣으면 바로 됩니다/);
  const mine = wrnResultView({ ...f403, src: 'fetch', defKey: false });
  assert.equal(mine.title, '불러오지 못했어요 — 인증키가 막혔거나 오늘 조회 횟수를 넘었어요');
  assert.match(mine.lines[0], /사용 신청이 됐는지 확인/);
  const key401def = wrnResultView({ kind: 'key', src: 'fetch', defKey: true });
  assert.equal(key401def.title, '불러오지 못했어요 — 기본 인증키가 맞지 않아요');
  for (const v of [def, mine, key401def]) assert.deepEqual(plain(v.actions.map((a) => a.id)), ['api', 'retry']);
  const quotaMine = wrnResultView({ kind: 'quota', src: 'fetch', defKey: false });
  assert.match(quotaMine.lines[0], /칸을 비우면 기본 키로/);
});

test('자동 재요청 실패 — 고른 시각 표시를 지도 시각으로 되돌리고 그걸 알려 준다(통보문·날짜 칸 같은 규칙)', () => {
  const { wrnResultView } = ctx();
  const v = wrnResultView({ kind: 'server', src: 'fetch', back: '지금' });
  assert.equal(v.lines[1], '지도 색은 바꾸지 않았어요 — 이전 그대로입니다.');
  assert.equal(v.lines[2], '날짜·시각 선택도 지도에 칠해진 시각(지금)으로 되돌렸어요.');
  assert.equal(wrnResultView({ kind: 'server', src: 'fetch' }).lines.length, 2);
  // 날짜 칸(syncWhen)도 통보문 고르기처럼 실패하면 되돌린다
  const sync = sliceBetween('const syncWhen = (reapply) =>', "$('#wrnWhenNow').onclick");
  assert.match(sync, /const prevWhen = wrnWhen;/);
  assert.match(sync, /fetchWrn\(null, [^\n]*\{ back \}\)\.then\(\(ok\) => \{/);
  assert.match(sync, /if \(ok !== false \|\| wrnWhen !== want\) return;/);
  assert.match(sync, /wrnWhen = prevWhen; reflectWhenToPicker\(\); syncNowLabel\(\);/);
  const bs = sliceBetween("const bs = $('#wrnBulletinSel'); if (bs) bs.onchange", '// 인증키는 이 브라우저에만');
  assert.match(bs, /\{ back \}\);/);
  assert.match(bs, /wrnWhen = prevWhen; reflectWhenToPicker\(\);/);
});

test('결과 카드 숫자는 지도 전환·눈 켜고 끄기 뒤 다시 센다 · 구버전 확장팩 안내가 카드와 맞는다 · 0건이면 AE 막힘도 정상 안내', () => {
  const setStyleSrc = sliceBetween('function setStyle(name) {', 'function markStyleBtns()');
  assert.match(setStyleSrc, /if \(name === 'warn' \|\| name === 'warnsea'\) \{[\s\S]*?wrnRefreshResult\(\);/);
  const list = sliceBetween('function buildWrnList() {', '// ===================== 기상예보 자동 색칠');
  assert.match(list, /buildWrnList\(\); paintWrn\(\); renderLegend\(\);[^\n]*\n\s*wrnRefreshResult\(\);/);
  const show = sliceBetween('function showWrnResult(r, quiet) {', 'async function fetchWrn(');
  assert.match(show, /helperOld: \(\) => wnsHelperOffNotice\('old', 'kma'\)/);
  assert.match(show, /if \(!quiet\) status\(/);
  assert.match(show, /function wrnRefreshResult\(\) \{[\s\S]*?showWrnResult\(\{ \.\.\.r, \.\.\.wrnPaintStats\(\) \}, true\);/);
  const notice = sliceBetween('function wnsHelperOffNotice(mode, ctx) {', 'async function showHelperStatus() {');   // 렌치가 설정 메뉴로 바뀌며 사이 주석이 바뀜 — 다음 함수 머리로 자른다
  // 데스크톱 구버전 = 앱 업데이트(재실행 안내 아님), 웹 구버전 + 기상청 = '지금도 쓸 수 있어요' 빼기
  assert.match(notice, /if \(WNS_DESKTOP\) \{[\s\S]*?old\s*\? \{\s*title: '앱을 최신 버전으로 업데이트해 주세요'/);
  assert.match(notice, /kma\s*\? '기능 확장팩이 <b>구버전<\/b>이라 <b>기상청 불러오기<\/b>가 안 돼요/);
  const { wrnResultView } = ctx();
  assert.match(wrnResultView({ kind: 'helperOld', desktop: true }).lines[0], /앱을 최신 버전으로 업데이트/);
  // AE 보내기·타임라인: 특보 0건으로 비어 있으면 '먼저 칠하세요' 대신 정상 안내
  assert.match(html, /status\(wrnNoneLeftMapEmpty\(\) \? wrnNoneEmptyText\('보내세요'\) : '칠한 색이 없습니다/);
  assert.match(html, /status\(wrnNoneLeftMapEmpty\(\) \? wrnNoneEmptyText\('애니메이션을 만드세요'\) : '칠한 색도 라벨도 없습니다/);
  // 일부만 읽혔고 발효 0건이면 지도를 비우지 않는다
  const apply = sliceBetween('function applyWrn(', "// 고른 '발표시각(통보문)' 기준으로");
  assert.match(apply, /if \(read\.unread\) \{[\s\S]*?kind: 'format', partial: true/);
});
