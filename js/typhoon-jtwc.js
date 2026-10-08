/* [모듈] js/typhoon-jtwc.js — 미해군(JTWC) 자동 불러오기: 활동 중인 태풍 목록(RSS) 해석·고르기 팝업, 고른 태풍 통보문(.tcw) 받아 그리기(데스크톱 앱), 실패 안내·수동 길 */
'use strict';

// ===================== 미해군(JTWC) 자동 불러오기 =====================
// 데스크톱 앱이면 앱(메인 프로세스)이 미해군 합동태풍경보센터 사이트에서 직접 받아 온다 — desktop/main.js 'wcg:jtwc-fetch'
// (허용 주소는 desktop/jtwc.js: metoc.navy.mil/jtwc 의 rss/jtwc.rss 와 products/xxNNYY.tcw 뿐). 웹판·옛 데스크톱 판(jtwcFetch 없음)은
// 예전처럼 사이트를 새 창으로 열고, 받은 .tcw를 창에 끌어다 놓거나 '자동이 안 될 때'에 붙여넣는다.
// 흐름: 버튼(태풍 '미해군(JTWC)에서 불러오기' #typJtwcDl · 태풍 비교 '미해군(JTWC)' #tycJtwcDl) → fetchJtwc: 고르기 팝업을 바로 띄우고(빛 훑는 자리표시)
//       RSS를 받아 활동 중인 태풍(서태평양 먼저)을 보여 준다 → 고르면 loadJtwcStorm: .tcw를 받아 붙여넣기·끌어놓기와 같은 길(applyTyphoonText → parseJtwcTcw)로 그린다.
// 받은 글(RSS·통보문)은 바깥 사이트가 준 것이라 화면에는 textContent로만 넣는다.
const JTWC_SITE = 'https://www.metoc.navy.mil/jtwc/jtwc.html';
const JTWC_RSS = 'rss/jtwc.rss';
// 통보문 파일 앞 두 글자(해역) → 한국어. wp=서태평양(한국 쪽)이 맨 위
const JTWC_BASIN_KO = { wp: '서태평양', io: '북인도양', sh: '남반구', ep: '동태평양', cp: '중태평양' };
const JTWC_KIND_KO = {
  'super typhoon': '슈퍼태풍', typhoon: '태풍', 'tropical storm': '열대폭풍', 'tropical depression': '열대저압부', 'tropical cyclone': '열대저기압',
  'subtropical storm': '아열대폭풍', 'subtropical depression': '아열대저압부', hurricane: '허리케인', cyclone: '사이클론',
};
const JTWC_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
let jtwcSeq = 0;   // 늦게 온 응답 버리기(목록·통보문 받기 모두 — 새로 누르면 앞 요청 결과는 안 그린다)

// 데스크톱 앱(새 preload)이면 직접 받기
function jtwcCanFetch() { return !!(window.wcgDesktop && typeof window.wcgDesktop.jtwcFetch === 'function'); }
// 메인 프로세스에 받기를 부탁 — 실패도 같은 모양 { ok:false, err } 으로
async function jtwcGet(p) {
  try {
    const r = await window.wcgDesktop.jtwcFetch(p);
    return r && typeof r === 'object' ? r : { ok: false, err: 'net', detail: '응답 없음' };
  } catch (e) { return { ok: false, err: 'net', detail: String((e && e.message) || e).slice(0, 160) }; }
}

// RSS 날짜('Thu, 08 Oct 2026 16:28:02 +0000' · item은 'Thu, 08 Oct 26 …') → { y, m, d } (UTC). 못 읽으면 null
function jtwcRssDate(s) {
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{2,4})\s+(\d{1,2}):(\d{2})/.exec(String(s || ''));
  if (!m || !JTWC_MON[m[2].toLowerCase()]) return null;
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return { y, m: JTWC_MON[m[2].toLowerCase()], d: +m[1], hh: +m[4], mi: +m[5] };
}
// 'Issued at 08/1500Z'(날·시분만) + 기준 날짜(RSS 갱신일) → 'YYYYMMDDHHMM'(UTC). 날이 기준보다 크면 지난달(월말을 넘긴 경우)
function jtwcIssuedUtc(dd, hhmm, ref) {
  if (!ref || !/^\d{1,2}$/.test(String(dd)) || !/^\d{4}$/.test(String(hhmm))) return '';
  const back = +dd > ref.d + 1 ? 1 : 0;
  const t = new Date(Date.UTC(ref.y, ref.m - 1 - back, +dd, +String(hhmm).slice(0, 2), +String(hhmm).slice(2)));
  const p = (v) => String(v).padStart(2, '0');
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}`;
}
const jtwcUnesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&');

// 활동 중인 태풍 목록(RSS) 해석 → { valid, built, storms, titled }. valid=false면 RSS가 아니다(오류 페이지 등 — '태풍 없음'과 구별).
// 태풍 = 통보문(.tcw) 링크 하나. 그 앞의 제목('Typhoon  27W (Koguma) Warning #15')·'Issued at 08/1500Z'를 짝짓는다(제목 형식이 바뀌어도
// .tcw만 있으면 파일 이름으로 목록에 올린다). 같은 태풍이 두 해역 item에 나오면 한 번만. 정렬: 서태평양(wp) → 북서태평양 item의 다른 해역 태풍 → 나머지.
// 링크는 미해군 사이트 것만 읽는다 — www 있음/없음·http/https, 그리고 같은 사이트의 S3 주소(채널 <link>가 이미 s3.amazonaws.com/www.metoc.navy.mil/…).
// 어느 주소로 적혀 있든 받기는 늘 파일 이름(products/xxNNYY.tcw)으로 메인의 허용 주소에서 한다.
// titled = 태풍 경보 제목 수. 제목은 있는데 .tcw를 하나도 못 찾았으면 링크 형식이 바뀐 것 — '태풍 없음'으로 보이면 안 된다(fetchJtwc가 형식 안내).
function parseJtwcRss(xml) {
  const t = String(xml || '');
  const valid = /<rss[\s>]/i.test(t) && /<channel[\s>]/i.test(t);
  const head = t.split(/<item[\s>]/i)[0];
  const builtStr = ((/<lastBuildDate>([^<]*)<\/lastBuildDate>/i.exec(head) || /<pubDate>([^<]*)<\/pubDate>/i.exec(head) || [])[1] || '').trim();
  const ref = jtwcRssDate(builtStr);
  const storms = [], seen = new Set();
  const TITLE = /((?:super\s+)?typhoon|tropical\s+storm|tropical\s+depression|tropical\s+cyclone|subtropical\s+(?:storm|depression)|hurricane|cyclone)\s+(\d{1,2})([A-Z])\b\s*(?:\(([^)<]{0,40})\))?\s*warning\s*#?\s*(\d+)/gi;
  const ISSUED = /issued\s+at\s+(\d{2})\/(\d{4})\s*Z/gi;
  const TCW = /https?:\/\/(?:(?:www\.)?metoc\.navy\.mil|s3\.amazonaws\.com\/www\.metoc\.navy\.mil)\/jtwc\/products\/([a-z]{2})(\d{2})(\d{2})\.tcw/gi;
  let titled = 0;
  for (const it of t.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const item = it[0];
    const area = ((/<guid[^>]*>([^<]*)<\/guid>/i.exec(item) || [])[1] || '').trim();
    const dm = /<description>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))\s*<\/description>/i.exec(item);
    const desc = dm ? (dm[1] != null ? dm[1] : jtwcUnesc(dm[2] || '')) : '';
    const titles = [...desc.matchAll(TITLE)], issued = [...desc.matchAll(ISSUED)];
    titled += titles.length;
    let prevAt = -1;
    for (const lk of desc.matchAll(TCW)) {
      const at = lk.index, basin = lk[1].toLowerCase(), num = lk[2], yy = lk[3], code = basin + num + yy;
      const ti = titles.filter((x) => x.index < at && x.index > prevAt).pop() || null;   // 이 링크와 앞 링크 사이의 제목(그 태풍 묶음)
      const is = issued.filter((x) => x.index < at && x.index > (ti ? ti.index : prevAt)).pop() || null;
      prevAt = at;
      if (seen.has(code)) continue;
      seen.add(code);
      const kind = ti ? ti[1].replace(/\s+/g, ' ').toLowerCase() : '';
      const issuedUtc = is ? jtwcIssuedUtc(is[1], is[2], ref) : '';
      const nwpac = /^NWPAC/i.test(area);
      let region = JTWC_BASIN_KO[basin] || basin.toUpperCase();
      if (nwpac && (basin === 'ep' || basin === 'cp')) region += ' → 서태평양';   // 날짜변경선을 넘어온 태풍(번호는 그대로 15E 등)
      storms.push({
        code, basin, num, year: '20' + yy, id: ti ? ti[2].padStart(2, '0') + ti[3].toUpperCase() : num + ({ wp: 'W', ep: 'E', cp: 'C' }[basin] || ''),
        kind, kindKo: JTWC_KIND_KO[kind] || (ti ? ti[1] : ''), name: ti && ti[4] ? ti[4].trim() : '', warnNo: ti ? +ti[5] : 0,
        issuedUtc, issuedKo: issuedUtc ? fmtKST(issuedUtc) : '', area, region,
        rank: basin === 'wp' ? 0 : nwpac ? 1 : 2, path: `products/${code}.tcw`,
      });
    }
  }
  storms.sort((a, b) => a.rank - b.rank);   // 같은 순위 안은 RSS 순서 그대로(안정 정렬)
  return { valid, built: builtStr, builtKo: ref ? fmtKST(jtwcIssuedUtc(ref.d, String(ref.hh).padStart(2, '0') + String(ref.mi).padStart(2, '0'), ref)) : '', storms, titled };
}

// 실패 → 한 줄 안내
function jtwcErrText(r) {
  r = r || {};
  if (r.err === 'timeout') return '미해군 사이트가 15초 동안 응답하지 않았어요.';
  if (r.err === 'http') return `미해군 사이트가 요청을 받지 않았어요 (응답 ${r.status || '오류'}).`;
  if (r.err === 'too-big') return '받은 자료가 너무 커서 멈췄어요 — 사이트 형식이 바뀐 것 같아요.';
  if (r.err === 'format' && r.what === 'links') return '활동 중인 태풍은 있는데 통보문(.tcw) 링크를 찾지 못했어요 — 사이트에서 직접 받아 주세요.';
  if (r.err === 'format') return r.what === 'tcw' ? '받은 통보문(.tcw)을 읽지 못했어요 — 형식이 바뀌었을 수 있어요.' : '받은 태풍 목록(RSS)을 읽지 못했어요 — 형식이 바뀌었을 수 있어요.';
  if (r.err === 'denied') return '허용되지 않은 주소라 받지 않았어요.';
  return '인터넷 연결을 확인해 주세요' + (r.detail ? ` (${r.detail})` : '') + '.';
}

// 수동 길: 사이트 열기(기본 브라우저) · 붙여넣을 칸 보여 주기(일반 태풍 = 접힌 '자동이 안 될 때'를 이번만 펼침 / 비교 = 붙여넣기 칸)
function jtwcOpenSite() {
  window.open(JTWC_SITE, '_blank', 'noopener');
  status('JTWC 사이트에서 통보문(.tcw)을 받아 창에 끌어다 놓거나 붙여넣으세요', true);
}
function jtwcManual() {
  if (isTyphoonCompare()) { const t = $('#tycPaste'); if (t) { try { t.focus(); } catch (e) { /* 숨은 칸 */ } } return; }
  foldReveal($('#typManual'), $('#typPaste'));
}
// 버튼 이름 — 직접 받을 수 있으면 '불러오기', 아니면 예전처럼 사이트 링크(→). 마크업 기본값은 데스크톱 쪽.
function jtwcSyncButtons() {
  const auto = jtwcCanFetch();
  const a = $('#typJtwcDl');
  if (a) {
    a.textContent = auto ? '미해군(JTWC)에서 불러오기' : '미해군(JTWC) 자료 받기 →';
    a.title = auto ? '미해군 합동태풍경보센터(JTWC)에서 지금 활동 중인 태풍을 골라 바로 그려요' : '미해군 합동태풍경보센터(JTWC) — 통보문(.tcw) 파일을 받아 창에 끌어다 놓거나 아래 ‘자동이 안 될 때’에 붙이면 그려집니다';
  }
  const b = $('#tycJtwcDl');
  if (b) {
    b.textContent = auto ? '미해군(JTWC)' : '미해군(JTWC) →';
    b.title = auto ? '미해군(JTWC)에서 활동 중인 태풍을 골라 비교에 추가' : '미해군(JTWC) 통보문 받기 — 사이트 열기';
  }
}

// 고르기 팝업(토스 카드). 열자마자 띄우고 내용은 상태별로 바꾼다. alive(): 사람이 닫지 않았고 다른 팝업에 밀리지 않았나
// m.onGone: 사람이 닫을 때 한 번 부른다(받는 중에 닫으면 작업 중 효과를 바로 끄려고 — fetchJtwc)
function jtwcModal() {
  const st = { closed: false };
  let m = null;
  m = tossModal({
    title: '미해군(JTWC) 태풍 불러오기', sub: '지금 활동 중인 태풍 · 미해군 합동태풍경보센터', tone: 'blue',
    bodyHTML: '<div class="jtwcList" role="list" aria-label="활동 중인 태풍"></div><p class="jtwcNote"></p>',
    footHTML: ' ',
    onClose: () => { st.closed = true; if (m && typeof m.onGone === 'function') m.onGone(); },
  });
  m.list = m.body.querySelector('.jtwcList');
  m.note = m.body.querySelector('.jtwcNote');
  m.alive = () => !st.closed && m.ov.isConnected;
  return m;
}
// 머리·바닥 버튼 바꾸기 — foot: [{ label, pri, act }]
function jtwcModalHead(m, tone, title, sub) {
  m.ov.querySelector('.tossHead').dataset.tone = tone;
  m.ov.querySelector('.tossTitle').textContent = title;
  const s = m.ov.querySelector('.tossSub'); if (s) s.textContent = sub || '';
}
function jtwcModalFoot(m, foot) {
  m.foot.textContent = '';
  for (const f of foot) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tossBtn ' + (f.pri ? 'pri' : 'ghost'); b.textContent = f.label;
    b.onclick = f.act;
    m.foot.append(b);
  }
}
// 실패 안내(같은 팝업 — 닫혔으면 새로). 다시 시도 · 사이트 열기(붙여넣을 칸도 펼침) · 직접 붙여넣기
function jtwcShowFail(m, r, retry) {
  if (!m || !m.alive()) m = jtwcModal();
  jtwcModalHead(m, 'red', '미해군(JTWC) 자료를 못 받았어요', r && r.what === 'tcw' && r.storm ? `${r.storm.id} ${r.storm.name || ''} 통보문`.trim() : '활동 중인 태풍 목록');
  m.list.textContent = '';
  const msg = document.createElement('div'); msg.className = 'jtwcMsg'; msg.dataset.tone = 'err';
  const b = document.createElement('b'); b.textContent = jtwcErrText(r);
  msg.append(b);
  m.list.append(msg);
  m.note.innerHTML = '대신 사이트에서 통보문(<b>.tcw</b>)을 받아 <b>창에 끌어다 놓거나</b> 붙여넣어도 돼요.';
  jtwcModalFoot(m, [
    { label: '다시 시도', pri: true, act: () => { m.close(); retry(); } },
    { label: '사이트 열기', act: () => { m.close(); jtwcManual(); jtwcOpenSite(); } },
    { label: '직접 붙여넣기', act: () => { m.close(); jtwcManual(); } },
  ]);
  status('미해군(JTWC) 불러오기 실패 — ' + jtwcErrText(r), true, 'err');
  return m;
}
// 목록 그리기 — 서태평양(한국 쪽) 묶음 먼저, 다른 해역은 아래. 서태평양에 없으면 그 묶음에 '없음' 한 줄
function jtwcFillList(m, rss) {
  const box = m.list;
  box.textContent = '';
  const near = rss.storms.filter((s) => s.rank === 0), far = rss.storms.filter((s) => s.rank > 0);
  const group = (txt) => { const g = document.createElement('div'); g.className = 'jtwcGroup'; g.textContent = txt; box.append(g); };
  const row = (s) => {
    const r = document.createElement('button');
    r.type = 'button'; r.className = 'jtwcRow'; r.setAttribute('role', 'listitem'); if (s.rank > 0) r.dataset.far = '1';
    const id = document.createElement('span'); id.className = 'jtwcId'; id.textContent = s.id;
    const tx = document.createElement('span'); tx.className = 'jtwcTxt';
    const nm = document.createElement('span'); nm.className = 'jtwcName'; nm.textContent = (s.name || '(이름 없음)').toUpperCase();
    if (s.kindKo) { const k = document.createElement('small'); k.textContent = s.kindKo; nm.append(k); }
    const meta = document.createElement('span'); meta.className = 'jtwcMeta';
    meta.textContent = [s.region, s.warnNo ? `통보 ${s.warnNo}호` : '', s.issuedKo ? `${s.issuedKo} 발표` : ''].filter(Boolean).join(' · ');
    tx.append(nm, meta);
    r.append(id, tx);
    r.title = `${s.id} ${s.name || ''} — 고르면 통보문을 받아 ${isTyphoonCompare() ? '비교에 추가해요' : '지도에 그려요'}`.replace(/\s+/g, ' ');
    r.onclick = () => { m.close(); loadJtwcStorm(s); };
    box.append(r);
  };
  group('서태평양 · 한국 쪽');
  if (near.length) near.forEach(row);
  else { const e = document.createElement('div'); e.className = 'jtwcNone'; e.textContent = '지금 서태평양에는 활동 중인 태풍이 없어요'; box.append(e); }
  if (far.length) { group('다른 해역'); far.forEach(row); }
  m.note.textContent = '시각은 한국 시각이에요' + (rss.builtKo ? ` · 목록 갱신 ${rss.builtKo}` : '') + ' · 고르면 통보문을 받아 바로 그려요.';
}

// 버튼 → 고르기 팝업 + 활동 중인 태풍 목록 받기
async function fetchJtwc() {
  if (!jtwcCanFetch()) { jtwcOpenSite(); return; }   // 웹판·옛 데스크톱 판 — 예전처럼 사이트
  const btn = $(isTyphoonCompare() ? '#tycJtwcDl' : '#typJtwcDl');
  const seq = ++jtwcSeq;
  const m = jtwcModal();
  jtwcModalFoot(m, [{ label: '사이트 열기', act: () => { m.close(); jtwcOpenSite(); } }, { label: '닫기', act: () => m.close() }]);
  m.note.textContent = '미해군 사이트에서 지금 활동 중인 태풍을 찾는 중이에요…';
  // 작업 중 효과(js/busy-fx.js) — 섹션 흐름 + 누른 버튼 + 팝업 목록 자리에 빛 훑는 막대. 실패·없음이어도 finally에서 끄고,
  // 받는 중에 팝업을 닫으면 그때 바로 끈다(버튼이 응답·시간 제한까지 잠겨 있지 않게). 끄기는 한 번만(fxOn)
  const fx = [fxSec(isTyphoonCompare() ? 'typhoonCompare' : 'typhoon'), btn, m.list];
  fxBusy(fx, true, { lines: 3, maxMs: 40000 });
  let fxOn = true;
  m.onGone = () => { if (fxOn) { fxOn = false; fxBusy(fx, false); } };
  status('미해군(JTWC) 활동 중인 태풍 찾는 중…', true);
  let shown = false;
  try {
    const r = await jtwcGet(JTWC_RSS);
    if (seq !== jtwcSeq || !m.alive()) return;   // 닫았거나 다시 눌렀으면 버린다
    if (!r.ok) { jtwcShowFail(m, r, fetchJtwc); return; }
    const rss = parseJtwcRss(r.text);
    if (!rss.valid) { jtwcShowFail(m, { ok: false, err: 'format', what: 'rss' }, fetchJtwc); return; }
    // 태풍 경보 제목은 있는데 통보문 링크를 하나도 못 찾았으면(링크 형식이 바뀜·아직 안 올라옴) '없음'이 아니라 그 안내 + 수동 길
    if (!rss.storms.length && rss.titled > 0) { jtwcShowFail(m, { ok: false, err: 'format', what: 'links' }, fetchJtwc); return; }
    if (!rss.storms.length) {
      m.list.textContent = '';
      const msg = document.createElement('div'); msg.className = 'jtwcMsg'; msg.dataset.tone = 'ok';
      const b = document.createElement('b'); b.textContent = '지금 활동 중인 태풍이 없어요(미해군 기준)';
      msg.append(b);
      m.list.append(msg);
      m.note.textContent = rss.builtKo ? `미해군 목록 갱신 ${rss.builtKo}(한국 시각)` : '';
      jtwcModalFoot(m, [{ label: '사이트 열기', act: () => { m.close(); jtwcOpenSite(); } }, { label: '확인', pri: true, act: () => m.close() }]);
      status('지금 활동 중인 태풍이 없어요(미해군 기준)', true, 'ok');
      shown = true;
      return;
    }
    jtwcFillList(m, rss);
    status(`미해군(JTWC) 활동 중인 태풍 ${rss.storms.length}개 — 골라 주세요`, true);
    shown = true;
  } finally {
    m.onGone = null;   // 끝났다 — 이 뒤에 닫아도(고르기·다시 시도) 다시 끄지 않는다
    if (fxOn) fxBusy(fx, false);
    if (shown && m.alive()) fxArrive(fxRows(m.list));   // 도착 — 목록 행이 위에서부터 떠오른다
  }
}

// 고른 태풍의 통보문(.tcw) 받아 그리기 — 붙여넣기·끌어놓기와 같은 길(applyTyphoonText). 비교 지도면 비교에 자동 추가된다(selectTyphoonFromApi)
async function loadJtwcStorm(storm) {
  const seq = ++jtwcSeq;
  const btn = $('#typJtwcDl');
  // 작업 중 효과 — 일반: 태풍 섹션 + 버튼 / 비교: 비교 섹션 + 비교 버튼 + 태풍 목록 자리(typBusyFx). 그렸을 때만 도착 효과
  const fx = typBusyFx(btn, '#tycJtwcDl');
  fxBusy(fx, true, { lines: 3, maxMs: 40000 });
  status(`미해군(JTWC) ${storm.id} 통보문 받는 중…`, true);
  let ok = false;
  try {
    const r = await jtwcGet(storm.path);
    if (seq !== jtwcSeq) return;
    if (!isTyphoon()) { status('태풍 지도가 아니라 그리지 않았어요 — 태풍 지도에서 다시 불러와 주세요', true, 'warn'); return; }
    if (!r.ok) { jtwcShowFail(null, { ...r, what: 'tcw', storm }, () => loadJtwcStorm(storm)); return; }
    if (!parseJtwcTcw(r.text)) { jtwcShowFail(null, { ok: false, err: 'format', what: 'tcw', storm }, () => loadJtwcStorm(storm)); return; }
    const tp = $('#typPaste'); if (tp) tp.value = r.text.slice(0, 100000);   // 끌어놓기처럼 '자동이 안 될 때' 칸에도 원문을 남긴다(고쳐 다시 그리기)
    pushUndo(); ok = applyTyphoonText(r.text);
  } finally { fxBusy(fx, false); if (ok) typArriveFx(); }
}
