// 통보문 '불러오기'·붙여넣기 묶음 나누기 — 날씨누리 단기예보 원문(고정 자료)을 '예상 강수량' 날짜 묶음으로 나누고 고르기 항목·결과 카드를 만든다.
// 실제 기상청 호출 없이: tests/fixtures/bulletin-pages.json = 날씨누리 페이지에서 통보문 부분만 그대로 자른 원문
// (2025-11~2026-09 web.archive.org 보관본 29건 + 2026-10-08 11:00 현재 페이지 4건) + 페이지 통째 복사 글·PDF 글 앞부분.
// 앱 코드는 tools/app-source.cjs로 합쳐 읽고 순수 함수만 잘라 vm에서 돌린다(MODULES.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');
const path = require('node:path');
const vm = require('node:vm');

const html = appSource(path.join(__dirname, '..', 'index.html'));
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bulletin-pages.json'), 'utf8'));

function sliceBetween(startText, endText) {
  const start = html.indexOf(startText);
  const end = html.indexOf(endText, start);
  assert.notEqual(start, -1, `missing start marker: ${startText}`);
  assert.notEqual(end, -1, `missing end marker: ${endText}`);
  return html.slice(start, end);
}
let _ctx = null;
function ctx() {
  if (_ctx) return _ctx;
  _ctx = {};
  vm.createContext(_ctx);
  vm.runInContext([
    sliceBetween('const KMA_TERMS = {', 'function bulAssignDir('),                                  // parseBulletin(지역 수 세기·칠하기 판정)
    sliceBetween('function wrnHttpFail(', '// 특보 줄로 읽지 못한 데이터 줄'),                         // 헬퍼 실패 판정(특보와 같은 틀)
    sliceBetween('// ===================== 통보문 불러오기 — 묶음 나누기', '// ===================== 통보문 불러오기 — 화면'),
  ].join('\n') + '\nObject.assign(this, { BUL_STN, parseBulletin, bulCleanLine, bulReadPage, bulSplitGroups, bulPickItems, bulPickDefault, bulGroupText, bulMergeWhen, bulAnnounceText, bulResultView, bulHttpFail, bulDir, termSiguns });',
  _ctx, { filename: 'bulletin-load.js' });
  return _ctx;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const sig = (gs) => plain(gs.map((g) => `${g.when} · ${g.kind}/${g.body.length}`));

// 보관본마다 나뉘어야 할 묶음(날짜 · 종류/줄 수) — 조사 때 눈으로 원문과 맞춰 본 결과
const EXPECT = {
  old_20210705071725: ['5~6일 · rain/3'],                                     // 2021년 판(□ 머리 + ○ 줄)
  st_20251126082230: ['27일 · rain/6', '27일 · snow/4'],
  st_20251201183732: ['2~3일 · snow/5', '2~3일 · rain/5'],
  st_20260203135924: ['5일 · snowrain/2'],                                      // 예상 적설 및 강수량
  st_20260211151351: [],                                                        // 예상 강수량 없는 날(정상)
  st_20260430133009: ['30일~5월 1일 · rain/3'],                                // 달 넘김
  st_20260615174211: ['15일 · shower/3', '16일 오후~17일 새벽 · rain/1', '16일 · shower/2', '17일 · shower/5'],
  st_20260617131849: ['17일 · rain/1', '17일~18일 새벽 · shower/5', '18일 오후 · shower/5', '19일 · rain/3', '19일 · shower/4'],   // 5묶음
  st_20260618073637: ['18일 오후~저녁 · shower/5', '19일 · shower/4', '19~20일 · rain/6'],
  st_20260924062041: ['25~26일 · rain/6'],                                      // 줄마다 날짜 꼬리표
  now_108_202610081100: ['10일 · rain/3'],
  now_184_202610081100: ['10일 낮~늦은 밤 · rain/1'],                           // 지역판(※ 안내 줄 뒤따름)
  now_109_202610081100: [],
};

test('날씨누리 페이지 HTML → 날짜 묶음(보관본 33건 모두 본문을 찾고, 대표 날은 묶음·줄 수까지 맞다)', () => {
  const { bulReadPage } = ctx();
  assert.ok(Object.keys(FX.html).length >= 30);
  for (const [name, h] of Object.entries(FX.html)) {
    const p = bulReadPage(h, 'html');
    assert.ok(p.kind === 'ok' || p.kind === 'none', `${name}: ${p.kind}`);
    assert.match(p.at, /^\d{1,2}월 \d{1,2}일 \d{2}:\d{2} 발표$/, `${name}: 발표 시각`);
    // 본문의 '* … 예상 …(…)' 머리 수 = 묶음 수(빈 묶음 없음)
    const heads = (h.match(/depth_3">\s*\*\s*(?:소나기에 의한\s*)?예상/g) || []).length;
    if (!name.startsWith('old_')) assert.equal((p.groups || []).length, heads, `${name}: 묶음 수`);
    for (const g of p.groups || []) assert.ok(g.body.length && g.body.every((l) => /^-/.test(l)), `${name}: 몸 줄`);
    if (EXPECT[name]) assert.deepEqual(sig(p.groups || []), EXPECT[name], name);
  }
  const now = bulReadPage(FX.html.now_108_202610081100, 'html');
  assert.equal(now.at, '10월 8일 11:00 발표');
  assert.equal(now.where, '전국');   // PDF 링크의 관서 108
  assert.deepEqual(plain(now.groups[0].body), ['- (전라권) 광주.전남: 5~10mm/ 전북: 5mm 미만', '- (경상권) 부산.울산.경남: 5~20mm/ 대구.경북: 5~10mm', '- (제주도) 제주도: 5~10mm']);
  assert.equal(bulReadPage(FX.html.now_184_202610081100, 'html').where, '제주');
  // 발표가 바뀐 직후(17:01 캡처) — PDF 링크는 아직 11시 것이지만 발표 시각은 페이지 표시(17:00)를 따른다
  assert.match(FX.html.st_20260214080114, /rpt_wid_day_202602141100_108\.pdf/);
  assert.equal(bulReadPage(FX.html.st_20260214080114, 'html').at, '2월 14일 17:00 발표');
});

test('페이지 통째 복사·PDF 글도 HTML과 똑같이 나뉜다(표 글자가 바로 붙어도)', () => {
  const { bulReadPage, bulSplitGroups } = ctx();
  const full = (gs) => gs.map((g) => `${g.kind}|${g.when}|${g.body.join('§')}`).join('\n');
  for (const [name, h] of Object.entries(FX.html)) {
    const a = bulReadPage(h, 'html');
    const lines = h.match(/cmp-view-content[\s\S]*/)[0];
    // HTML 본문 줄 → 평문(메뉴·표 글자를 앞뒤로, 빈 줄 없이 바로 붙는 최악의 경우도)
    const body = lines.replace(/<br\s*\/?>/gi, '\n').replace(/<\/span>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&middot;/g, '·').replace(/&amp;/g, '&').split('\n').filter((l) => l.trim());
    const t1 = ['날씨누리 메뉴', ...body, '', '현재위치의 단기예보의 정보를 비교해서 나타낸 표입니다.', '예보요소\t평년(오늘)\t어제(07일)'].join('\n');
    const t2 = [...body, '평년(오늘)', '어제(07일)', '기온', '(℃)'].join('\n');
    for (const t of [t1, t2]) assert.equal(full(bulSplitGroups(t.split('\n')).groups), full(a.groups || []), name);
  }
  const cp = bulReadPage(FX.text.copy_fullpage_202610081100, 'text');
  assert.equal(cp.kind, 'ok'); assert.equal(cp.at, '10월 8일 11:00 발표'); assert.equal(cp.extra, true);
  assert.deepEqual(sig(cp.groups), ['10일 · rain/3']);
  const pdf = bulReadPage(FX.text.pdf_202610081100, 'text');
  assert.deepEqual(sig(pdf.groups), ['10일 · rain/3']); assert.equal(pdf.at, '10월 8일 11:00 발표');
  assert.ok(pdf.groups[0].body.every((l) => !/평년|기온/.test(l)), '표 글자가 섞이지 않음');
  const none = bulReadPage(FX.text.pdf_202610071700, 'text');
  assert.equal(none.kind, 'none'); assert.equal(none.at, '10월 7일 17:00 발표');
  // 지금처럼 강수량 줄만 붙여넣은 글 = 머리가 없어 묶음 없음(붙여넣기는 그대로 둔다)
  assert.equal(bulReadPage('- (수도권, 16일) 경기남서부: 5mm 안팎\n- (충청권) 대전.세종.충남, 충북: 20~60mm', 'text').kind, 'none');
});

test('고르기 항목 — 원문 순서, 같은 날 비+소나기 합친 항목, 적설은 처음 고르지 않음, 지역 수', () => {
  const { bulReadPage, bulPickItems, bulPickDefault, bulGroupText } = ctx();
  const items = (name) => bulPickItems(bulReadPage(FX.html[name], 'html').groups);
  const six = items('st_20260617131849');
  assert.deepEqual(plain(six.map((it) => it.label)), ['17일 · 비', '17일~18일 새벽 · 소나기', '18일 오후 · 소나기', '19일 · 비+소나기', '19일 · 비', '19일 · 소나기']);
  assert.equal(bulPickDefault(six), 0);
  const both = six[3];
  assert.equal(both.groups.length, 2);
  assert.ok(both.n >= six[4].n && both.n >= six[5].n && six.every((it) => it.n > 0), '지역 수');
  // 합친 항목의 글 = 두 묶음 머리(날만) + 원문 줄
  const txt = bulGroupText(both.groups).split('\n');
  assert.equal(txt[0], '* 예상 강수량(19일)');
  assert.ok(txt.includes('* 소나기에 의한 예상 강수량(19일)'));
  assert.equal(txt.filter((l) => l.startsWith('-')).length, 7);
  // 머리 날짜는 때 말 없이 — applyBulletin이 첫 '강수량(…)'을 제목 날짜 칸에 넣는다
  assert.equal(bulGroupText([six[1].groups[0]]).split('\n')[0], '* 소나기에 의한 예상 강수량(17~18일)');
  assert.equal(/강수량\s*\(([^)]+)\)/.exec(bulGroupText(six[1].groups))[1], '17~18일');
  // 적설과 비가 같은 날 짝 — 적설이 먼저 나와도 처음 고르는 건 비
  const snow = items('st_20260122044041');
  assert.deepEqual(plain(snow.map((it) => it.label)), ['22일 · 적설(cm)', '22일 · 비', '23일 · 적설(cm)', '23일 · 비']);
  assert.equal(bulPickDefault(snow), 1);
  assert.equal(bulGroupText(snow[0].groups).split('\n')[0], '* 예상 적설(22일)');
  // 적설만 있으면 첫 항목
  assert.equal(bulPickDefault(items('st_20260203135924')), 0);
});

test('날짜 합치기 — 때 말 빼고 날만, 달 넘김', () => {
  const { bulMergeWhen } = ctx();
  assert.equal(bulMergeWhen(['16일 오후~17일 새벽']), '16~17일');
  assert.equal(bulMergeWhen(['17일~18일 새벽']), '17~18일');
  assert.equal(bulMergeWhen(['18일 오후']), '18일');
  assert.equal(bulMergeWhen(['19~20일']), '19~20일');
  assert.equal(bulMergeWhen(['17~18일', '19일']), '17~19일');
  assert.equal(bulMergeWhen(['30일~5월 1일']), '30일~1일');
  assert.equal(bulMergeWhen(['오늘']), '오늘');
});

test('줄 안 날짜 꼬리표는 parseBulletin이 지운다 — 붙여넣기로 칠할 때도 같은 오칠이 없게', () => {
  const { parseBulletin, bulCleanLine } = ctx();
  const toks = (line) => plain(parseBulletin(line)).flatMap((g) => g.tokens);
  // '서해5도(25일)'이 경기 '서'쪽이 아니라 섬(옹진)으로
  assert.deepEqual(toks('- (수도권) 경기서부, 서해5도(25일): 5~30mm'), [{ province: '경기', dir: '서부' }, { island: '옹진' }]);
  // '(… 제외, 26일)' — 제외가 살아남는다
  assert.deepEqual(toks('- (경상권) 부산.울산.경남(경남서부남해안 제외, 26일): 5~20mm').pop(), { province: '경남', dir: '', exclude: '경남서부남해안' });
  // 지역 목록 가운데 '(3일)'
  assert.deepEqual(toks('- (전라권) 전북서해안, (3일) 전남북부서해안: 3~8cm'), [{ province: '전북', dir: '서해안' }, { province: '전남', dir: '북부서해안' }]);
  // 부분 기간 괄호·해발고도(천 단위 쉼표)
  assert.deepEqual(toks('- (수도권) 서울.인천.경기(경기북동내륙 23일 새벽까지): 5~60mm').map((t) => t.province), ['서울', '인천', '경기']);
  assert.deepEqual(toks('- (전라권) 전북동부 높은 산지(해발고도 1,000m 이상): 3~10cm'), [{ province: '전북', dir: '동부높은산지' }]);
  // 날짜 없는 괄호·많은 곳은 그대로, 두 번 해도 같다
  for (const l of ['광주.전남(남해안 제외): 10~40mm', '강원영동: 30~80mm(많은 곳 강원북부산지 120mm 이상)', '경기서부, 서해5도: 5~30mm']) assert.equal(bulCleanLine(l), l);
  assert.equal(bulCleanLine('강원영동: 30~80mm(많은 곳 강원북부산지 120mm 이상, 26일)'), '강원영동: 30~80mm(많은 곳 강원북부산지 120mm 이상)');
  const once = bulCleanLine('부산.울산.경남(경남서부남해안 제외, 26일): 5~20mm/ 울릉도.독도(6~7일): 5mm');
  assert.equal(once, '부산.울산.경남(경남서부남해안 제외): 5~20mm/ 울릉도.독도: 5mm');
  assert.equal(bulCleanLine(once), once);
});

test('보관본 모든 묶음을 parseBulletin으로 읽으면 날짜 때문에 못 읽는 지역이 없다(남은 3건은 날짜와 무관한 옛 한계)', () => {
  const { bulReadPage, bulGroupText, parseBulletin, bulDir, termSiguns } = ctx();
  const known = (tk) => tk.island || (tk.province && (!tk.dir || bulDir(tk.dir) || /산지|해안|내륙|도서/.test(tk.dir) || termSiguns(tk.province + tk.dir)))
    || (!tk.province && tk.dir && termSiguns(tk.dir));
  const bad = [];
  for (const [name, h] of Object.entries(FX.html)) for (const g of bulReadPage(h, 'html').groups || []) {
    for (const pg of parseBulletin(bulGroupText([g]))) for (const tk of pg.tokens) {
      assert.ok(!/\d|일\)/.test(`${tk.dir || ''}${tk.exclude || ''}`), `${name} ${g.when}: 날짜가 지역에 남음 ${JSON.stringify(tk)}`);
      if (!known(tk)) bad.push(`${name}|${tk.province}|${tk.dir}`);
    }
  }
  // 옛 한계: '지리산부근'이 앞 도(경남)에 붙음, 2021년 판의 '전라권·충청권' 권 표현 — 이번 일과 별개
  assert.ok(bad.every((b) => /지리산부근|^old_/.test(b)), bad.join('\n'));
});

test('받은 글 판정 — 빈 응답·본문 없음(페이지 모양 바뀜)·머리 표기 바뀜·한글 깨짐', () => {
  const { bulReadPage } = ctx();
  assert.equal(bulReadPage('', 'html').kind, 'empty');
  assert.equal(bulReadPage('<html><body><h1>시스템 점검 중입니다</h1></body></html>', 'html').kind, 'format');
  assert.equal(bulReadPage('<html><body>Access Denied</body></html>', 'html').kind, 'format');
  // 본문은 있는데 머리 기호가 바뀌어 못 나눔 → '없음'이 아니라 형식 오류(방송 사고 방지)
  const drift = FX.html.now_108_202610081100.replace('*  예상 강수량(10일)', '◇ 10일 예상 강수량');
  const d = bulReadPage(drift, 'html');
  assert.equal(d.kind, 'format'); assert.equal(d.drift, true);
  // 지역판 '※ … 예상 강수량은 …' 안내 줄은 머리가 아니다 → 정상 없음
  const note = FX.html.now_109_202610081100.replace('</p>', '<span class="depth_3">※ 11일까지의 예상 강수량은 내일(9일) 05시에 발표되는 단기예보를 참고하기 바랍니다</span></p>');
  assert.equal(bulReadPage(note, 'html').kind, 'none');
  // 한글이 깨짐(EUC-KR을 UTF-8로 잘못 읽은 꼴)
  assert.equal(bulReadPage('<div class="cmp-view-content"><span>\u00c0\u00fc\u00b1\u00b9</span></div>', 'html').kind, 'broken');
});

test('경계 사례 — 묶음 1·3개, 날짜 표기, 달 넘김, 없음, 적설만, 비+눈, 해상 줄, 줄바꿈·빈 줄에도 줄이 빠지지 않음', () => {
  const { bulReadPage, bulPickItems, bulPickDefault, bulGroupText } = ctx();
  // 원문 몸만 주면 HTML(본문 span)·평문(페이지 통째 — 앞뒤에 다른 글)·창 본문 글(body) 세 가지로 만들어 같은 결과인지 본다
  const AT = '2026년 10월 17일 (토)요일 17:00 발표';
  const asHtml = (b) => `<div class="cmp-view-announce"><span>${AT}</span></div><div class="cmp-view-content"><p class="summary">${b.split('\n').map((l) => `<span class="depth_3">${l}</span>`).join('')}</p></div>`;
  const read = (b) => {
    const r = [bulReadPage(asHtml(b), 'html'), bulReadPage(`날씨누리 메뉴\n${AT}\n${b}\n평년(오늘)\n18.2`, 'text'), bulReadPage(`${AT}\n${b}`, 'body')];
    const s = r.map((p) => JSON.stringify([p.kind, p.at, (p.groups || []).map((g) => [g.kind, g.when, g.body])]));
    assert.equal(s[1], s[0], 'text = html'); assert.equal(s[2], s[0], 'body = html');
    for (const p of r) assert.ok(!p.dropped, '빠진 줄 없음');
    return r[0];
  };
  const labels = (p) => plain(bulPickItems(p.groups).map((it) => it.label));
  const heads = (p) => plain(bulPickItems(p.groups).map((it) => bulGroupText(it.groups).split('\n')[0]));
  // 묶음 1개
  const one = read('□ (종합) 내일 남부 비\n* 예상 강수량(18일)\n- (전라권) 광주.전남: 5~20mm\n- (경상권) 부산.울산.경남: 5~30mm');
  assert.deepEqual(labels(one), ['18일 · 비']); assert.equal(one.at, '10월 17일 17:00 발표');
  // 묶음 3개 + '17일~18일'·줄마다 '(권역, 17일)'
  const three = read('* 예상 강수량(17일~18일)\n- (수도권, 17일) 경기남서부: 5mm 안팎\n- (충청권) 대전.세종.충남, 충북: 20~60mm\n* 예상 강수량(19일)\n- (전라권) 전북, 광주.전남: 30~80mm\n* 소나기에 의한 예상 강수량(20일 오후)\n- (강원도) 강원내륙.산지: 5~20mm');
  assert.deepEqual(labels(three), ['17일~18일 · 비', '19일 · 비', '20일 오후 · 소나기']);
  assert.deepEqual(heads(three), ['* 예상 강수량(17~18일)', '* 예상 강수량(19일)', '* 소나기에 의한 예상 강수량(20일)']);
  // '17~18일' 표기는 그대로 한 묶음
  assert.deepEqual(labels(read('* 예상 강수량(17~18일)\n- (수도권, 16일) 경기남서부: 5mm 안팎\n- (충청권, 17일) 충북: 20~60mm')), ['17~18일 · 비']);
  // 다음 달로 넘어감
  const month = read('* 예상 강수량(31일~11월 1일)\n- (제주도) 제주도: 20~60mm\n* 예상 강수량(11월 2일)\n- (전라권) 광주.전남: 5~10mm');
  assert.deepEqual(heads(month), ['* 예상 강수량(31일~1일)', '* 예상 강수량(2일)']);
  // 예상 강수량 없음 = 정상 없음
  assert.equal(read('□ (종합) 전국 맑음\n○ (오늘, 17일) 전국 맑음').kind, 'none');
  // 적설만 — 첫 항목, cm 표시
  const snow = read('* 예상 적설(18일)\n- (강원도) 강원산지: 3~8cm/ 강원동해안: 1~5cm');
  assert.deepEqual(labels(snow), ['18일 · 적설(cm)']); assert.equal(bulPickDefault(bulPickItems(snow.groups)), 0);
  // 비+눈 섞임 — 처음 고르는 건 비, 적설·강수는 따로
  const mix = read('* 예상 적설(22일)\n- (수도권) 경기북동부: 1~3cm\n* 예상 강수량(22일)\n- (수도권) 서울.인천.경기: 5~10mm\n* 예상 적설 및 강수량(23일)\n- (수도권) 경기북동부: 1cm 미만/ 1mm 미만');
  assert.deepEqual(labels(mix), ['22일 · 적설(cm)', '22일 · 비', '23일 · 적설·강수']);
  assert.equal(bulPickDefault(bulPickItems(mix.groups)), 1);
  // 해상 줄도 줄째 남는다(칠할 때 '못 찾음'으로 알린다 — 말없이 빠지지 않게)
  assert.equal(read('* 예상 강수량(18일)\n- (수도권) 서해5도: 5~20mm\n- (해상) 서해중부해상: 10~30mm\n- (제주도) 제주도: 5~10mm').groups[0].body.length, 3);
  // 줄바꿈된 '(많은 곳 …)' 줄 — 앞 줄에 잇고, 뒤따르는 지역 줄도 빠지지 않는다
  const wrap = read('* 예상 강수량(18일)\n- (경상권) 부산.울산.경남: 30~80mm\n(많은 곳 경남남해안 100mm 이상)\n- (제주도) 제주도: 20~60mm');
  assert.deepEqual(plain(wrap.groups[0].body), ['- (경상권) 부산.울산.경남: 30~80mm (많은 곳 경남남해안 100mm 이상)', '- (제주도) 제주도: 20~60mm']);
  // 평문: 값 앞에서 잘린 줄(':'로 끝남)은 잇고, 한 줄씩 띄운 글도 줄이 빠지지 않으며, 표 글자는 안 섞인다
  const t = bulReadPage(`${AT}\n* 예상 강수량(10일)\n\n- (경상권) 부산.울산.경남: 5~20mm/ 대구.경북:\n5~10mm\n\n- (제주도) 제주도: 5~10mm\n\n평년(오늘)\n12.3`, 'text');
  assert.deepEqual(plain(t.groups[0].body), ['- (경상권) 부산.울산.경남: 5~20mm/ 대구.경북: 5~10mm', '- (제주도) 제주도: 5~10mm']);
  assert.equal(t.dropped, 0);
  // 묶음이 끝난 뒤 남은 강수량 줄은 dropped로 센다(붙여넣기는 이때 나누지 않고 그대로 붙인다)
  assert.equal(bulReadPage('* 예상 강수량(10일)\n- (제주도) 제주도: 5~10mm\n○ (모레) 흐림\n- (전라권) 광주.전남: 5mm', 'text').dropped, 1);
  // 본문 칸이 비었음 — '한글 깨짐'이 아니라 형식 오류
  assert.equal(bulReadPage(`<div class="cmp-view-announce"><span>${AT}</span></div><div class="cmp-view-content">  </div>`, 'html').kind, 'format');
});

test('화면 흐름 — 붙여넣기 가로채기 조건, 정상 없음이면 지난 칸 비우기, 창에서 같은 글 다시 읽으면 그대로', () => {
  const src = [
    sliceBetween('function bulShowPage(', '// [통보문 불러오기]'),
    sliceBetween('function bulFromWnuri(', '// 붙여넣기 칸에 페이지 통째'),
    sliceBetween('function bulOnPaste(', '\n}\n') + '\n}\n',
  ].join('\n');
  const c = ctx();
  const run = (pre) => {
    const k = { ...c, shown: [], els: {}, arrived: [] };
    vm.createContext(k);
    vm.runInContext(`let bulFetchSeq = 0, bulWaitWnd = false, bulFilled = '', bulWndLast = '', bulPickList = [];
      const bulArriveFx = (filled) => { arrived.push(filled); };   // 도착 효과(js/busy-fx.js) 흉내 — 무엇이 채워졌다고 알렸는지 기록
      const $ = (s) => els[s]; const showBulResult = (r) => { shown.push(r); bulWaitWnd = !!(r && r.kind === 'busy' && r.src === 'wnd'); };
      const bulResetPick = () => { bulPickList = []; };
      function bulFillPick(groups) { bulPickList = bulPickItems(groups); bulFilled = $('#bulPaste').value = bulGroupText(bulPickList[0].groups); return bulPickList[0]; }
      ${pre || ''}\n${src}\nthis.api = { bulOnPaste, bulFromWnuri, bulShowPage, get filled() { return bulFilled; }, set filled(v) { bulFilled = v; }, set wait(v) { bulWaitWnd = v; } };`, k);
    k.els['#bulPaste'] = { value: '' };
    return k;
  };
  const paste = (k, text) => { const e = { clipboardData: { getData: () => text }, prevented: false, preventDefault() { this.prevented = true; } }; k.api.bulOnPaste(e); return e.prevented; };
  let k = run();
  // 강수량 줄만·머리+한 묶음은 그대로 붙음(예전 방식)
  assert.equal(paste(k, '- (수도권, 16일) 경기남서부: 5mm 안팎\n- (충청권) 대전.세종.충남, 충북: 20~60mm'), false);
  assert.equal(paste(k, '* 예상 강수량(16~17일)\n- (수도권, 16일) 경기남서부: 5mm 안팎'), false);
  // 페이지 통째(표 글자 섞임) · 묶음 여럿 → 나눠서 고르기
  assert.equal(paste(k, FX.text.copy_fullpage_202610081100), true);
  assert.equal(k.shown.at(-1).kind, 'ok');
  assert.equal(paste(k, '* 예상 강수량(17~18일)\n- (수도권) 경기: 5mm\n* 예상 강수량(19일)\n- (전라권) 전북: 5mm'), true);
  // 묶음 밖에 남은 강수량 줄이 있으면 나누지 않는다(줄이 빠지는 것보다 그대로 붙이는 게 낫다)
  assert.equal(paste(k, '* 예상 강수량(10일)\n- (제주도) 제주도: 5~10mm\n○ (모레) 흐림\n- (전라권) 광주.전남: 5mm\n평년(오늘)'), false);
  // 발표 시각은 있는데 강수량 줄이 있으면(머리 없이) '없음'으로 가로채지 않는다
  assert.equal(paste(k, '2026년 10월 08일 (목)요일 11:00 발표\n- (제주도) 제주도: 5~10mm'), false);
  assert.equal(paste(k, FX.text.pdf_202610071700), true);   // 강수량 없는 통보문 한 판 → '없음' 카드
  assert.equal(k.shown.at(-1).kind, 'none');
  // 도착 효과 — 가로챈 붙여넣기만(묶음을 채움 = true, 정상 없음 = false(카드만)). 그대로 붙인 글은 효과 없음
  assert.deepEqual([...k.arrived], [true, true, false]);
  // 정상 없음: 칸이 지난번에 채운 글 그대로면 비우고 카드에 알린다, 손댄 글은 그대로
  k = run();
  k.api.bulShowPage(c.bulReadPage(FX.html.now_108_202610081100, 'html'), 'fetch');
  assert.match(k.els['#bulPaste'].value, /^\* 예상 강수량\(10일\)/);
  k.api.bulShowPage(c.bulReadPage(FX.html.now_109_202610081100, 'html'), 'fetch');
  assert.equal(k.els['#bulPaste'].value, ''); assert.equal(k.shown.at(-1).cleared, true);
  assert.ok(c.bulResultView(k.shown.at(-1)).lines.some((l) => /비웠어요/.test(l)));
  k.api.bulShowPage(c.bulReadPage(FX.html.now_108_202610081100, 'html'), 'fetch');
  k.els['#bulPaste'].value += '\n- (수도권) 서울: 5mm';   // 사용자가 고침
  k.api.bulShowPage(c.bulReadPage(FX.html.now_109_202610081100, 'html'), 'fetch');
  assert.match(k.els['#bulPaste'].value, /서울: 5mm/); assert.equal(k.shown.at(-1).cleared, false);
  // 오류는 칸을 건드리지 않는다
  const before = k.els['#bulPaste'].value;
  k.api.bulShowPage({ kind: 'format' }, 'fetch');
  assert.equal(k.els['#bulPaste'].value, before);
  // 창 읽기: 같은 글을 다시 읽으면(첫 읽기 아님) 고친 칸을 덮지 않는다, 창을 다시 열면(first) 늘 반영
  k = run();
  const d = { text: '* 예상 강수량(10일)\n- (제주도) 제주도: 5~10mm\n\n* 소나기에 의한 예상 강수량(11일)\n- (전라권) 전북: 5mm', announce: '2026년 10월 08일 (목)요일 11:00 발표', url: 'https://www.weather.go.kr/w/forecast/overall/short-term.do?stnId=184', first: true };
  k.api.bulFromWnuri(d);
  assert.equal(k.shown.at(-1).kind, 'ok'); assert.equal(k.shown.at(-1).where, '제주'); assert.equal(k.shown.at(-1).n, 2);
  k.els['#bulPaste'].value = '고친 글';
  const n = k.shown.length;
  k.api.bulFromWnuri({ ...d, first: false });
  assert.equal(k.els['#bulPaste'].value, '고친 글'); assert.equal(k.shown.length, n);
  k.api.bulFromWnuri({ ...d, first: true });
  assert.notEqual(k.els['#bulPaste'].value, '고친 글');
  // 창이 닫히면 기억을 지운다(다시 열면 같은 글도 반영)
  k.api.bulFromWnuri({ closed: true });
  k.els['#bulPaste'].value = '고친 글';
  k.api.bulFromWnuri({ ...d, first: false });
  assert.notEqual(k.els['#bulPaste'].value, '고친 글');
  // 도착 효과 — 읽어 반영한 때만(같은 글 다시 읽기·창 닫힘·창 오류·단기예보 아닌 화면은 없음)
  assert.deepEqual([...k.arrived], [true, true, true]);
  k.api.wait = true; k.api.bulFromWnuri({ err: '연결 끊김' });
  k.api.wait = true; k.api.bulFromWnuri({ text: '  ', first: true });
  assert.deepEqual(k.shown.slice(-2).map((r) => r.kind), ['net', 'format']);
  assert.equal(k.arrived.length, 3);
});

test('헬퍼 실패 판정 — 이 경로는 인증키를 안 써서 401·403·429는 "사이트가 막음"', () => {
  const { bulHttpFail } = ctx();
  const k = (s, b) => bulHttpFail(s, b).kind;
  assert.equal(k(0, 'Failed to fetch'), 'helperOff');
  assert.equal(k(404, '{"ok":false}'), 'helperOld');
  assert.equal(k(502, '{"ok":false,"error":"HTTP Error 403: Forbidden"}'), 'blocked');
  assert.equal(k(502, '{"ok":false,"error":"HTTP Error 429: Too Many Requests"}'), 'blocked');
  assert.equal(k(502, '{"ok":false,"error":"HTTP Error 503: Service Unavailable"}'), 'server');
  assert.equal(bulHttpFail(502, '{"ok":false,"error":"timed out"}').timeout, true);
  assert.equal(k(502, '{"ok":false,"error":"<urlopen error [Errno 11001] getaddrinfo failed>"}'), 'net');
});

test('결과 카드 문구 — 정상 없음은 초록(오류 아님), 오류는 빨강 + 원인별 할 일, 데스크톱은 날씨누리 창', () => {
  const { bulResultView } = ctx();
  const ok = plain(bulResultView({ kind: 'ok', src: 'fetch', n: 3, label: '19일 · 비+소나기', at: '6월 17일 17:00 발표', where: '전국' }));
  assert.equal(ok.tone, 'ok');
  assert.equal(ok.title, '불러오기 완료 — 3묶음');
  assert.equal(ok.meta, '6월 17일 17:00 발표 · 전국');
  assert.match(ok.lines[0], /날짜를 고르면/);
  assert.equal(plain(bulResultView({ kind: 'ok', src: 'fetch', n: 1, label: '10일 · 비' })).title, '불러오기 완료 — 10일\u00a0·\u00a0비');   // 항목 이름은 줄바꿈 안 되게
  assert.match(bulResultView({ kind: 'ok', src: 'paste', n: 2, label: 'x' }).title, /^붙여넣은 글에서 찾음/);
  assert.match(bulResultView({ kind: 'ok', src: 'wnd', n: 2, label: 'x' }).title, /^날씨누리 창에서 읽음/);
  const none = plain(bulResultView({ kind: 'none', src: 'fetch', at: '10월 8일 11:00 발표' }));
  assert.equal(none.tone, 'ok');
  assert.equal(none.title, '지금 통보문에는 예상 강수량이 없어요');
  assert.match(none.lines[0], /오류가 아니에요/);
  assert.equal(none.actions.length, 0);
  // 오류 — 빨강, 칸·지도 그대로, 원인별 버튼
  const off = plain(bulResultView({ kind: 'helperOff', src: 'fetch' }));
  assert.equal(off.tone, 'err');
  assert.equal(off.title, '불러오지 못했어요 — 기능 확장팩이 꺼져 있어요');
  assert.deepEqual(off.actions.map((a) => a.id), ['helper', 'open', 'retry']);
  assert.equal(off.actions[1].label, '단기예보 열기');
  assert.match(off.lines[0], /통째로 복사/);
  assert.ok(off.lines.includes('칸·지도는 그대로예요.'));
  const offD = plain(bulResultView({ kind: 'helperOff', src: 'fetch', desktop: true, wnd: true }));
  assert.equal(offD.title, '불러오지 못했어요 — 내장 기능 확장팩이 응답하지 않아요');
  assert.equal(offD.actions[1].label, '날씨누리 창에서 읽기');
  assert.equal(plain(bulResultView({ kind: 'helperOld' })).title, '불러오지 못했어요 — 기능 확장팩이 옛 버전이에요');
  assert.match(bulResultView({ kind: 'blocked' }).title, /요청을 막았어요/);
  assert.match(bulResultView({ kind: 'net', timeout: true }).title, /너무 늦어요/);
  assert.match(bulResultView({ kind: 'format' }).title, /페이지에서 통보문을 찾지 못했어요/);
  assert.match(bulResultView({ kind: 'format', drift: true }).title, /표기가 달라/);
  assert.equal(bulResultView({ kind: 'busy', src: 'fetch' }).tone, 'busy');
  // 창 읽기 실패 — '다시 시도'(헬퍼) 대신 창 다시 열기만
  const w = plain(bulResultView({ kind: 'format', src: 'wnd', wnd: true }));
  assert.equal(w.title, '창에서 읽지 못했어요 — 이 화면에서 통보문을 찾지 못했어요');
  assert.deepEqual(w.actions.map((a) => a.id), ['open']);
  // 기술 정보
  assert.equal(bulResultView({ kind: 'server', detail: 'HTTP Error 503' }).detail, '기술 정보: HTTP Error 503');
});

test('화면 배선 — 불러오기 버튼·날짜 고르기·결과 카드·붙여넣기·데스크톱 창', () => {
  assert.match(html, /<button class="pri" id="bulLoad"[^>]*>통보문 불러오기<\/button>/);
  assert.match(html, /<div class="wrnRes" id="bulResult" role="status" aria-live="polite" hidden><\/div>/);
  assert.match(html, /id="bulPickRow" style="display:none[^"]*"><label>날짜<\/label><select id="bulPick"/);
  assert.match(html, /<a class="btn linkBtn" id="bulOpen" href="https:\/\/www\.weather\.go\.kr\/w\/forecast\/overall\/short-term\.do"/);
  const wire = sliceBetween('function wire() {', '\n}\n');
  assert.match(wire, /\$\('#bulLoad'\)\.onclick = \(\) => fetchBulletin\(\);/);
  assert.match(wire, /\$\('#bulPick'\)\.onchange = \(e\) => bulPickFill\(e\.target\.value\);/);
  assert.match(wire, /\$\('#bulPaste'\)\.onpaste = bulOnPaste;/);
  assert.match(wire, /window\.wcgDesktop\.onWnuri\(bulFromWnuri\)/);
  // 불러오기 주소: weather.go.kr 먼저, 허용 목록 밖(400)이면 kma.go.kr(302 경유)
  const f = sliceBetween('async function fetchBulletin() {', '\n}\n');
  assert.match(f, /for \(const u of \[BUL_PAGE_URL, BUL_PAGE_VIA\]\)/);
  assert.match(html, /const BUL_PAGE_VIA = 'https:\/\/www\.kma\.go\.kr\/w\/forecast\/overall\/short-term\.do';/);
  // 다른 작업을 열면 고르기·카드도 비운다
  assert.match(sliceBetween('function resetWorkRuntime() {', '\n}\n'), /bulResetPick\(true\);/);
});

test('데스크톱 날씨누리 창 — 메인 창만 열 수 있고, 날씨누리·기상청 https 안에서만, 권한·내려받기 막음', () => {
  const lf = (f) => fs.readFileSync(path.join(__dirname, '..', 'desktop', f), 'utf8').replace(/\r\n/g, '\n');
  const main = lf('main.js');
  const pre = lf('preload.js');
  assert.match(main, /ipcMain\.handle\('wcg:wnuri-open', \(e, url\) => \{\n\s*if \(!win \|\| win\.isDestroyed\(\) \|\| !e\.sender \|\| e\.sender\.id !== win\.webContents\.id\) return false;/);
  assert.match(main, /sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'wnuri'/);
  assert.match(main, /setPermissionRequestHandler\(\(_w, _p, cb\) => cb\(false\)\)/);
  assert.match(main, /on\('will-download', \(e\) => e\.preventDefault\(\)\)/);
  assert.match(main, /win\.on\('closed', \(\) => \{ if \(wnuri && !wnuri\.isDestroyed\(\)\) wnuri\.destroy\(\); \}\);/);
  // 창에는 preload(앱 API)를 주지 않는다 — 바깥 페이지에 노출되는 함수 없음
  const wbw = /wnuri = new BrowserWindow\(\{[\s\S]*?\n {2}\}\);/.exec(main)[0];
  assert.doesNotMatch(wbw, /preload|nodeIntegration: true|contextIsolation: false|sandbox: false|webviewTag/);
  // 이미 떠 있으면 새로고침 뒤 읽는다(열어 둔 채 발표가 바뀌어도 지난 통보문을 읽지 않게)
  assert.match(main, /wnuri\.focus\(\); wnuri\.webContents\.reload\(\); return; \}/);
  // 이동·리다이렉트 검사는 이벤트 객체의 주소를 먼저 본다
  assert.match(main, /wc\.on\('will-navigate', \(e, u0\) => \{ const u = \(e && e\.url\) \|\| u0; if \(!wnuriOk\(u\)\)/);
  assert.match(main, /if \(isMain && !wnuriOk\(u\)\) e\.preventDefault\(\);/);
  // 허용 주소 판정
  const okSrc = /const WNURI_HOST = [^\n]+\nconst wnuriOk = [^\n]+/.exec(main)[0];
  const c = { URL }; vm.createContext(c); vm.runInContext(okSrc.replace('const wnuriOk', 'this.wnuriOk = function (u) { return wnuriOk0(u); }; const wnuriOk0'), c);
  for (const u of ['https://www.weather.go.kr/w/forecast/overall/short-term.do?stnId=109', 'https://www.kma.go.kr/w/forecast/overall/short-term.do', 'https://weather.go.kr/']) assert.equal(c.wnuriOk(u), true, u);
  for (const u of ['http://www.weather.go.kr/', 'https://weather.go.kr.evil.com/', 'https://evilweather.go.kr/', 'javascript:alert(1)', 'file:///C:/x']) assert.equal(c.wnuriOk(u), false, u);
  assert.match(pre, /openWnuri: \(url\) => ipcRenderer\.invoke\('wcg:wnuri-open', String\(url \|\| ''\)\)/);
  assert.match(pre, /ipcRenderer\.removeAllListeners\('wcg:wnuri'\)/);
});
