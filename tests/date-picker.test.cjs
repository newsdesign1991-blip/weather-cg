// 날짜 고르기(js/date-picker.js) — 시스템 날짜/시각 칸 대신 근무표식 아이폰 달력 + iOS식 연·월 휠 + 시각 직접 입력.
// 1) 날짜 계산(순수 도우미): 달 칸 배치(6줄 고정·요일 자리)·윤년·말일·요일, 고를 수 있는 범위(오늘 이후·min/max), 연월 휠 목록·흐린 칸·가까운 칸,
//    날짜 더하기(달 넘김 말일), 칸 글자, 시각(10분 단위·↑↓). 2) 붙이기 계약: 모든 type=date·time이 붙는 자리, value 접근자, css·토큰.
// 3) (WCG_BOOT_CHECK=1 일 때) 실제 앱: 특보 지난 날짜 → 달력 → 휠 → 2019년 3월 15일 → #wrnDate.value·기존 리스너, 태풍 과거 날짜, 시각 칸.
// 앱 코드는 tools/app-source.cjs로 합쳐 읽고(MODULES.md) 모듈 부분만 vm에서 돌린다.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html')).replace(/\r\n/g, '\n');
const START = '// ===================== 날짜 고르기 (근무표 nd-cal';
const END = '// ===================== 작업 중·도착 효과';   // 다음 모듈(js/busy-fx.js) 첫 줄
const src = (() => {
  const a = html.indexOf(START), b = html.indexOf(END, a);
  assert.ok(a > 0 && b > a, '날짜 고르기 모듈 위치를 못 찾음');
  return html.slice(a, b);
})();
const css = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
const NAMES = ['DP_W', 'DP_ITEM', 'DP_YEAR_MIN', 'dpPad', 'dpYmd', 'dpToday', 'dpLeap', 'dpDaysIn', 'dpDowOf', 'dpValid', 'dpYm', 'dpMonthCells', 'dpLimits', 'dpDayOk', 'dpMonthOk',
  'dpClamp', 'dpYearItems', 'dpMonthItems', 'dpNearestOk', 'dpWheelIndex', 'dpAddDays', 'dpAddMonths', 'dpFmtField', 'dpFmtLong', 'dpTimeNorm', 'dpTimeStep', 'dpAmpm', 'dpWatchValue',
  'dpPlace', 'dpSlide'];
// 가짜 HTMLInputElement — value 접근자만(dpWatchValue 검사용)
class FakeInput { constructor() { this._v = ''; } }
Object.defineProperty(FakeInput.prototype, 'value', { configurable: true, get() { return this._v; }, set(v) { this._v = String(v); } });
const ctx = { window: { matchMedia: () => ({ matches: false }) }, HTMLInputElement: FakeInput, document: {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, performance: { now: () => 0 } };
vm.createContext(ctx);
const D = vm.runInContext("'use strict';\n" + src + `\n;({ ${NAMES.join(', ')} })`, ctx, { filename: 'date-picker.js' });
const plain = (v) => JSON.parse(JSON.stringify(v));   // vm 안에서 만든 객체(다른 realm) 비교용
const jsDow = (y, m, d) => { const t = new Date(Date.UTC(2000, m - 1, d)); t.setUTCFullYear(y); return t.getUTCDay(); };

test('말일·윤년 — 4로 나뉘면 윤년, 100은 아님, 400은 윤년', () => {
  assert.deepEqual([2024, 2023, 2000, 2100, 1900, 2028].map((y) => D.dpDaysIn(y, 2)), [29, 28, 29, 28, 28, 29]);
  for (let y = 1990; y <= 2030; y++) for (let m = 1; m <= 12; m++) assert.equal(D.dpDaysIn(y, m), new Date(y, m, 0).getDate(), `${y}-${m}`);
  assert.equal(D.dpValid('2020-02-29'), true);
  assert.equal(D.dpValid('2019-02-29'), false, '윤년 아닌 해의 2/29');
  for (const bad of ['', '2019-13-01', '2019-00-10', '2019-04-31', '2019-3-1', '19-03-01', 'x', null, undefined]) assert.equal(D.dpValid(bad), false, String(bad));
});

test('요일 — 1990~2030 모든 날이 Date와 같다(0 = 일요일), 2026-10-09 = 금', () => {
  for (let y = 1990; y <= 2030; y++) for (let m = 1; m <= 12; m++) for (let d = 1; d <= D.dpDaysIn(y, m); d++) assert.equal(D.dpDowOf(y, m, d), jsDow(y, m, d), `${y}-${m}-${d}`);
  assert.equal(D.DP_W[D.dpDowOf(2026, 10, 9)], '금');
  assert.equal(D.DP_W[D.dpDowOf(2019, 3, 15)], '금');
});

test('달 칸 배치 — 늘 42칸(6줄), 1일은 그 요일 자리, 말일까지 차례로, 칸 요일 = 줄 안 자리', () => {
  for (let y = 2015; y <= 2027; y++) for (let m = 1; m <= 12; m++) {
    const cells = plain(D.dpMonthCells(y, m)), n = D.dpDaysIn(y, m), lead = jsDow(y, m, 1);
    assert.equal(cells.length, 42);
    assert.equal(cells.findIndex(Boolean), lead, `${y}-${m} 1일 자리`);
    const days = cells.filter(Boolean);
    assert.deepEqual(days.map((c) => c.d), Array.from({ length: n }, (_, i) => i + 1), `${y}-${m} 1~말일`);
    cells.forEach((c, i) => { if (c) { assert.equal(c.dow, i % 7); assert.equal(c.dow, jsDow(y, m, c.d)); assert.equal(c.ds, `${y}-${String(m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`); } });
    assert.ok(lead + n <= 42, '6줄 안에 들어간다');
  }
  // 대표 달: 2026-10(목요일 시작 → 앞 빈 칸 4), 2019-03(금 5), 2015-02(일 0, 28일 = 딱 4줄), 2026-08(토 6 + 31일 = 6줄 꽉)
  assert.equal(plain(D.dpMonthCells(2026, 10)).findIndex(Boolean), 4);
  assert.equal(plain(D.dpMonthCells(2019, 3)).findIndex(Boolean), 5);
  const feb15 = plain(D.dpMonthCells(2015, 2)); assert.equal(feb15.findIndex(Boolean), 0); assert.equal(feb15.slice(28).some(Boolean), false);
  const aug26 = plain(D.dpMonthCells(2026, 8)); assert.equal(aug26.findIndex(Boolean), 6); assert.equal(aug26[36].d, 31);
  assert.equal(plain(D.dpMonthCells(2024, 2)).filter(Boolean).length, 29, '윤년 2월');
});

test('고를 수 있는 범위 — 기본 1990-01-01 ~ 오늘(지난 날짜용), 휠 해는 1990 ~ 올해+1, min/max가 있으면 그것', () => {
  const T = '2026-10-09';
  assert.deepEqual(plain(D.dpLimits('', '', '', T)), { min: '1990-01-01', max: T, lo: 1990, hi: 2027 });
  assert.deepEqual(plain(D.dpLimits('', '', '1985-05-05', T)), { min: '1990-01-01', max: T, lo: 1985, hi: 2027 }, '지금 값의 해도 휠에');
  assert.deepEqual(plain(D.dpLimits('2024-08-20', '2024-09-02', '2024-08-25', T)), { min: '2024-08-20', max: '2024-09-02', lo: 2024, hi: 2024 }, '태풍 비교 범위(min/max)');
  assert.deepEqual(plain(D.dpLimits('bad', '2024-13-40', '', T)), { min: '1990-01-01', max: T, lo: 1990, hi: 2027 }, '이상한 min/max는 무시');
  assert.equal(D.dpLimits('2024-09-10', '2024-09-01', '', T).max, '2024-09-10', 'max < min이면 min으로');
  const L = D.dpLimits('', '', '', T);
  assert.equal(D.dpDayOk('2026-10-09', L), true, '오늘은 고를 수 있다');
  assert.equal(D.dpDayOk('2026-10-10', L), false, '내일은 못 고른다');
  assert.equal(D.dpDayOk('1989-12-31', L), false);
  assert.equal(D.dpClamp('2030-01-01', L), T); assert.equal(D.dpClamp('1980-01-01', L), '1990-01-01'); assert.equal(D.dpClamp('2019-03-15', L), '2019-03-15');
});

test('연·월 휠 목록 — 해 1990~2027(2027 흐림), 올해는 이번 달까지, 지난 해는 12달, min 있는 해는 그 달부터', () => {
  const L = D.dpLimits('', '', '', '2026-10-09');
  const ys = plain(D.dpYearItems(L));
  assert.equal(ys.length, 2027 - 1990 + 1);
  assert.deepEqual([ys[0], ys[ys.length - 1]], [{ v: 1990, label: '1990년', dis: false }, { v: 2027, label: '2027년', dis: true }]);
  assert.equal(ys.filter((y) => y.dis).length, 1);
  assert.deepEqual(plain(D.dpMonthItems(2026, L)).map((m) => m.dis), [false, false, false, false, false, false, false, false, false, false, true, true]);
  assert.ok(plain(D.dpMonthItems(2019, L)).every((m) => !m.dis));
  assert.deepEqual(plain(D.dpMonthItems(2026, L))[2], { v: 3, label: '3월', dis: false });
  const L2 = D.dpLimits('2024-08-20', '2024-09-02', '', '2026-10-09');
  assert.deepEqual(plain(D.dpMonthItems(2024, L2)).map((m) => +!m.dis).join(''), '000000011000');
  // 가까운 고를 수 있는 칸 — 흐린 칸이면 가까운 쪽(같은 거리면 앞 = 지난 쪽), 범위 밖 번호는 끝으로
  const items = [{ dis: true }, { dis: false }, { dis: false }, { dis: true }, { dis: true }];
  assert.deepEqual([0, 1, 2, 3, 4, 9, -3].map((i) => D.dpNearestOk(items, i)), [1, 1, 2, 2, 2, 2, 1]);
  assert.equal(D.dpNearestOk([{ dis: true }, { dis: true }], 1), 1, '다 막혔으면 그대로');
  // 휠 스크롤 위치 → 가운데 줄(반올림·끝 막기)
  assert.deepEqual([0, 17, 18, 36 * 29 + 0.3, -50, 99999].map((t) => D.dpWheelIndex(t, 38)), [0, 0, 1, 29, 0, 37]);
});

test('날짜 더하기 — 일은 달·해를 넘기고, 달은 넘친 날을 말일로(1/31 + 1달 = 2/28)', () => {
  assert.equal(D.dpAddDays('2019-03-31', 1), '2019-04-01');
  assert.equal(D.dpAddDays('2019-01-01', -1), '2018-12-31');
  assert.equal(D.dpAddDays('2024-02-28', 1), '2024-02-29');
  assert.equal(D.dpAddDays('2019-03-15', -7), '2019-03-08');
  assert.equal(D.dpAddMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(D.dpAddMonths('2023-01-31', 1), '2023-02-28');
  assert.equal(D.dpAddMonths('2024-03-31', -1), '2024-02-29');
  assert.equal(D.dpAddMonths('2019-03-16', -1), '2019-02-16');
  assert.equal(D.dpAddMonths('2019-02-16', -12), '2018-02-16');
  assert.equal(D.dpAddMonths('2019-11-30', 14), '2021-01-30');
  assert.equal(D.dpAddMonths('2020-02-29', 12), '2021-02-28');
});

test('글자 — 칸 "2026. 10. 9 (금)"(짧게 "10. 9 (금)"), 달력 아래 "10월 9일 (금)", 시각 읽기', () => {
  assert.equal(D.dpFmtField('2026-10-09'), '2026. 10. 9 (금)');
  assert.equal(D.dpFmtField('2026-10-09', true), '10. 9 (금)');
  assert.equal(D.dpFmtField('2019-03-15'), '2019. 3. 15 (금)');
  assert.equal(D.dpFmtField(''), '');
  assert.equal(D.dpFmtLong('2019-03-15'), '3월 15일 (금)');
  assert.deepEqual(['09:00', '00:00', '12:00', '14:30', '23:50', ''].map(D.dpAmpm), ['오전 9시', '오전 12시', '오후 12시', '오후 2시 30분', '오후 11시 50분', '']);
});

test('시각 — 두 칸 글자 → HH:MM(분은 10분 단위로 내림), ↑↓ = 시 ±1 · 분 ±10(돌기, 시는 그대로)', () => {
  assert.equal(D.dpTimeNorm('9', '37', 10), '09:30');
  assert.equal(D.dpTimeNorm('14', '', 10), '14:00');
  assert.equal(D.dpTimeNorm('25', '70', 10), '23:50', '넘치면 끝값');
  assert.equal(D.dpTimeNorm('', '30', 10), '', '시가 비면 시각 없음');
  assert.equal(D.dpTimeNorm('7', '05', 1), '07:05', '1분 단위면 그대로');
  assert.equal(D.dpTimeStep('09:00', 'm', 1, 10), '09:10');
  assert.equal(D.dpTimeStep('09:50', 'm', 1, 10), '09:00');
  assert.equal(D.dpTimeStep('09:00', 'm', -1, 10), '09:50');
  assert.equal(D.dpTimeStep('09:15', 'm', 1, 10), '09:20', '단위 밖 분은 다음 칸으로');
  assert.equal(D.dpTimeStep('09:15', 'm', -1, 10), '09:10');
  assert.equal(D.dpTimeStep('23:00', 'h', 1, 10), '00:00');
  assert.equal(D.dpTimeStep('00:40', 'h', -1, 10), '23:40');
  assert.equal(D.dpTimeStep('', 'h', 1, 10), '10:00', '비었으면 09:00에서');
});

test('value 계약 — 원래 input의 읽기·쓰기는 그대로, 코드가 바꾸면 칸이 따라간다(onSet), 돌려받은 쓰기는 조용히', () => {
  const inp = new FakeInput(); let n = 0;
  const raw = D.dpWatchValue(inp, () => n++);
  inp.value = '2019-03-15';
  assert.equal(inp.value, '2019-03-15'); assert.equal(inp._v, '2019-03-15'); assert.equal(n, 1);
  raw('2020-01-05');
  assert.equal(inp.value, '2020-01-05'); assert.equal(n, 1, '원래 쓰기는 알림 없음');
  assert.equal(new FakeInput().value, '', '다른 input은 그대로(프로토타입을 안 건드림)');
});

test('팝오버 자리 — 칸 아래, 모자라면 위, 둘 다 모자라면 칸 옆(사이드바 → 오른쪽), 옆도 없으면 화면 안. 크기는 offset(여는 scale 무시)', () => {
  // 가짜 칸·팝오버 — 칸 rect, 팝오버 offset 크기(476 = 달력 카드 × 사이드바 배율 1.3 남짓)
  const place = (fr, vw, vh, pw = 359, ph = 476) => {
    ctx.window.innerWidth = vw; ctx.window.innerHeight = vh;
    const pop = { offsetWidth: pw, offsetHeight: ph, style: {}, dataset: {} };
    const field = { getBoundingClientRect: () => ({ left: fr[0], top: fr[1], right: fr[0] + fr[2], bottom: fr[1] + fr[3], width: fr[2], height: fr[3] }) };
    const side = D.dpPlace(pop, field);
    return [side, pop.style.left, pop.style.top, pop.dataset.side];
  };
  assert.deepEqual(place([200, 300, 150, 36], 1600, 900), ['down', '200px', '342px', 'down'], '아래 자리 있음');
  assert.deepEqual(place([200, 700, 150, 36], 1600, 900), ['up', '200px', '218px', 'up'], '아래 모자람 → 위');
  // 900 높이 창 가운데 칸(사이드바): 위아래 다 모자람 → 칸 오른쪽, 세로는 칸 가운데(화면 안)
  assert.deepEqual(place([60, 430, 150, 36], 1600, 900), ['right', '216px', '210px', 'right']);
  assert.deepEqual(place([60, 600, 150, 36], 1600, 900, 359, 800), ['right', '216px', '92px', 'right'], '키 큰 팝오버 — 칸 가운데 맞춤이 넘치면 화면 아래에 붙음');
  // 오른쪽 끝 칸(떼어낸 창이 오른쪽에 있을 때) → 왼쪽
  assert.deepEqual(place([1300, 430, 150, 36], 1600, 900), ['left', '935px', '210px', 'left']);
  // 좁고 낮은 창: 옆자리도 없음 → 아래로 붙이고 화면 안(칸을 덮는 마지막 수)
  assert.deepEqual(place([100, 300, 150, 36], 600, 500), ['down', '100px', '16px', 'down']);
  // 오른쪽 넘침은 화면 안으로
  assert.equal(place([1500, 100, 90, 36], 1600, 900)[1], '1233px');
  assert.deepEqual(['down', 'up', 'right', 'left'].map((s) => D.dpSlide(s, 8)), ['translateY(-8px)', 'translateY(8px)', 'translateX(-8px)', 'translateX(8px)']);
});

test('붙이는 자리 — 부팅 때 문서 전체(wire 뒤·loadLayout 앞), 다시 그리는 태풍 비교 카드, 날짜 칸을 만드는 js는 모두 dpAttach', () => {
  const boot = html.slice(html.indexOf('buildFrame();\nbuildZones();'));
  const iw = boot.indexOf('\nwire();'), ia = boot.indexOf('\ndpAttachAll();'), il = boot.indexOf('\nloadLayout();');
  assert.ok(iw > 0 && ia > iw && il > ia, 'boot: wire() → dpAttachAll() → loadLayout()');
  const card = html.slice(html.indexOf('function wireCompareCard('), html.indexOf('\n}\n', html.indexOf('function wireCompareCard(')));
  assert.match(card, /q\('input\[type=date\]'\)\.forEach\(\(n\) => dpAttach\(n, \{ short: true \}\)\)/);
  // js 템플릿으로 type="date"/"time" 칸을 만드는 파일은 dpAttach/dpTimeAttach를 부른다
  for (const f of fs.readdirSync(path.join(root, 'js'))) {
    const t = fs.readFileSync(path.join(root, 'js', f), 'utf8');
    if (f === 'date-picker.js') continue;
    if (/type="date"/.test(t)) assert.match(t, /dpAttach\(/, `${f}: 날짜 칸을 만들면 dpAttach`);
    if (/type="time"/.test(t)) assert.match(t, /dpTimeAttach\(/, `${f}: 시각 칸을 만들면 dpTimeAttach`);
  }
  // 마크업의 날짜·시각 칸(dpAttachAll이 문서 전체를 붙인다) — 특보·예보 지난 날짜, 과거 태풍, 특보 시각(10분 단위)
  for (const id of ['wrnDate', 'fctDate', 'typPastDate']) assert.match(html, new RegExp(`<input[^>]*(type="date"[^>]*id="${id}"|id="${id}"[^>]*type="date")`));
  assert.match(html, /<input type="time" id="wrnTime" step="600">/);
});

test('모양 — 원래 칸 숨김, 휠 scroll-snap(가운데)·줄 높이 = DP_ITEM, 팝오버 fixed, 색은 토큰(--dp-* 두 테마), #hex 없음', () => {
  const dcss = css.slice(css.indexOf('/* ===== 날짜 고르기 — 근무표 nd-cal'), css.indexOf('/* ===== 작업 중·도착 효과'));
  assert.ok(dcss.length > 1000);
  assert.match(dcss, /\.dpSrc \{ display: none !important; \}/);
  assert.match(dcss, /\.dpPop \{ position: fixed;/);
  assert.match(dcss, /\.dpCol \{[^}]*scroll-snap-type: y mandatory/);
  assert.match(dcss, /\.dpItem \{[^}]*height: 36px;[^}]*scroll-snap-align: center/);
  assert.equal(D.DP_ITEM, 36);
  assert.match(dcss, /\.dpBody \{ position: relative; height: 252px; \}/);
  assert.match(dcss, /\.dpPadRow \{ height: 108px; \}/, '(252 − 36) / 2');
  assert.match(dcss, /\.dpCard\.wheelOn \.dpTitleChev \{ transform: rotate\(90deg\); \}/, '휠이 열리면 꺾쇠가 아래로');
  // 좁은 칸은 요일만 숨김 — 해 뺀 짧은 칸(태풍 비교 범위)은 더 좁아도 요일이 들어간다
  assert.match(dcss, /@container \(max-width: 116px\) \{ \.dpField:not\(\.short\) \.dpFtW \{ display: none; \} \}/);
  assert.match(dcss, /@container \(max-width: 84px\) \{ \.dpField\.short \.dpFtW \{ display: none; \} \}/);
  for (const s of ['up', 'right', 'left']) assert.match(dcss, new RegExp(`\\.dpPop\\[data-side="${s}"\\] \\{ transform-origin:`), `칸 ${s}쪽 팝오버 — 칸 쪽에서 열림`);
  assert.doesNotMatch(dcss, /#[0-9a-fA-F]{3,8}\b/, '색은 토큰으로(#hex 금지)');
  for (const theme of [':root, :root[data-theme="dark"] {', ':root[data-theme="light"] {']) {
    const i = css.indexOf(theme + '\n    --dp-acc');
    assert.ok(i > 0, `${theme} 에 --dp-* 토큰`);
    const blk = css.slice(i, css.indexOf('}', i));
    for (const k of ['--dp-acc', '--dp-acc2', '--dp-sun', '--dp-sat', '--dp-band']) assert.match(blk, new RegExp(k + ':'));
  }
});

// ── 실제 앱(부팅 점검기) — WCG_BOOT_CHECK=1 일 때만 ──
test('부팅 점검: 특보 지난 날짜 → 달력 → 휠 2019년 3월 → 15일, 키·Esc·바깥, 시각 칸, 태풍 과거 날짜', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=8000', '--size=1600x900', '--eval=' + path.join(__dirname, 'date-picker.boot-eval.js')], { encoding: 'utf8', timeout: 300000 });
  const out = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  const R = out.evalResult;
  assert.ok(!R.error, R.error);
  assert.ok(R.attached.date.length >= 3 && R.attached.date.every((d) => d.dp && d.hidden && d.field), JSON.stringify(R.attached));
  assert.ok(R.attached.time.every((d) => d.dpt && d.hidden));
  assert.deepEqual([R.open.pop, R.open.below, R.open.inView, R.open.futureOff, R.open.nextOff], [true, true, true, true, true]);
  assert.deepEqual([R.open.sel, R.open.today], [R.open.todayDs, R.open.todayDs], '오늘 = 고른 날·오늘 테두리');
  assert.deepEqual([R.wheel.on, R.wheel.calHidden, R.wheel.wheelShown, R.wheel.lastYearDis, R.wheel.snap], [true, true, true, true, 'y mandatory']);
  assert.equal(R.wheel.years[0], '1990년');
  assert.equal(R.blocked, R.wheel.title, '오늘 이후(다음 달·내년)로는 안 간다');
  assert.equal(R.afterKeys, '2019년 ' + R.wheel.title.split(' ')[1]);
  assert.equal(R.afterTap, '2019년 3월');
  assert.equal(R.monthsAll, true);
  assert.deepEqual(R.scrollAligned.map(Math.round), [29, 2], '고른 줄이 가운데(scroll-snap)');
  assert.deepEqual([R.backCal.title, R.backCal.calShown, R.backCal.wheelOff, R.backCal.lead], ['2019년 3월', true, true, 5]);
  assert.deepEqual(R.picked, { value: '2019-03-15', field: '2019. 3. 15 (금)', when: '201903150900', ev: { input: 1, change: 1 }, closed: true, focus: true });
  assert.deepEqual([R.kbFocus0, R.kbRight, R.kbPgUp, R.kbYear, R.kbPick], ['2019-03-15', '2019-03-16', ['2019-02-16', '2019년 2월'], ['2018-02-16', '2018년 2월'], ['2018-02-16', '201802160900']]);
  assert.deepEqual([R.esc, R.outside], [{ closed: true, value: '2018-02-16' }, { closed: true, value: '2018-02-16' }]);
  assert.equal(R.programmatic, '2020. 1. 5 (일)');
  assert.deepEqual([R.timePop, R.timeAdv, R.timeTyped.value, R.timeTyped.change, R.timeTyped.ampm, R.timeTyped.when], [true, true, '14:30', 1, '오후 2시 30분', '202001051430']);
  assert.deepEqual([R.timeChip.value, R.timeChip.change, R.timeUp.value, R.timeUp.change, R.timeClosed], ['18:00', 2, '18:10', 3, true]);
  assert.deepEqual(R.typ, { value: '2019-09-07', field: '2019. 9. 7 (토)', change: 1, closed: true });
});
