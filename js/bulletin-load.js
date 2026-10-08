/* [모듈] js/bulletin-load.js — 통보문 불러오기(헬퍼로 날씨누리 단기예보)·데스크톱 날씨누리 창 읽기, 원문에서 '예상 강수량' 날짜 묶음 나누기·고르기·결과 카드 */
'use strict';

// ===================== 통보문 불러오기 — 묶음 나누기 =====================
// 날씨누리 단기예보(short-term.do)는 통보문 본문을 서버에서 HTML로 그려 보낸다(2025-11~2026-10 같은 마크업):
//   div.cmp-view-announce > span('2026년 10월 08일 (목)요일 11:00 발표') · div.cmp-view-content > p.summary > span.depth_1~4
//   (줄 하나 = span 하나, 줄 안 줄바꿈 = <br>) · PDF 링크 rpt_wid_day_<발표시각 12자리>_<관서>.pdf
// 그 안의 '* 예상 강수량(17~18일)'·'* 소나기에 의한 예상 강수량(19일)'·'* 예상 적설(27일)' 머리마다 묶음으로 나눈다.
// 같은 날짜에 '비'와 '소나기'(또는 '적설'과 '비') 묶음이 따로 나오는 날이 많다 — 고르기 이름에 종류를 꼭 붙인다.
// 페이지를 통째로 복사(Ctrl+A)한 글·PDF 글·데스크톱 날씨누리 창의 글(innerText)도 같은 규칙으로 나눈다(보관본 29건에서 HTML과 결과 같음).
const BUL_PAGE_URL = 'https://www.weather.go.kr/w/forecast/overall/short-term.do';
// 헬퍼(20261007)는 www.weather.go.kr 를 허용 목록에 두지 않아 400을 준다 → 같은 페이지로 302 되는 kma.go.kr 주소로 다시 부른다
// (헬퍼는 처음 주소만 검사하고 리다이렉트는 따라간다 — 파이썬·데스크톱 Node 판 같음).
const BUL_PAGE_VIA = 'https://www.kma.go.kr/w/forecast/overall/short-term.do';
// 통보문 관서(stnId) → 이름
const BUL_STN = { 108: '전국', 109: '서울·인천·경기', 105: '강원', 131: '충북', 133: '대전·세종·충남', 146: '전북', 156: '광주·전남', 143: '대구·경북', 159: '부산·울산·경남', 184: '제주' };

// HTML 조각의 문자 참조를 푼다
function bulHtmlText(s) {
  const cp = (n) => (n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '');
  return String(s).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&middot;/g, '·').replace(/&#(\d+);/g, (_, n) => cp(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => cp(parseInt(n, 16))).replace(/&amp;/g, '&');
}
// 날씨누리 페이지 HTML → { meta:{announce, tmfc, stn}, lines:[본문 줄] }. 본문(cmp-view-content)이 없으면 lines=null(페이지 모양이 바뀜)
function bulPageLines(html) {
  const h = String(html), meta = {};
  const a = h.match(/class="cmp-view-announce"[^>]*>\s*<span[^>]*>([^<]*)<\/span>/); if (a) meta.announce = bulHtmlText(a[1]).trim();
  const p = h.match(/rpt_wid_day_(\d{12})_(\d+)\.pdf/); if (p) { meta.tmfc = p[1]; meta.stn = p[2]; }
  const m = h.match(/<div[^>]*class="[^"]*\bcmp-view-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (!m) return { meta, lines: null };
  const body = bulHtmlText(m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:span|p|li)>/gi, '\n').replace(/<[^>]+>/g, ''));
  return { meta, lines: body.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()) };
}

// 묶음 머리 — 지금(2025-11~)은 '*', 2021년 판은 '□'(몸 줄은 '○')
const BUL_HEAD_RE = /^[*□◎]\s*(소나기에\s*의한\s*)?예상\s*(적설\s*및\s*강수량|강수량|적설)\s*\(\s*(.+?)\s*\)\s*$/;
const BUL_KIND_LABEL = { rain: '비', shower: '소나기', snow: '적설(cm)', snowrain: '적설·강수' };
// 줄들 → { groups:[{ kind:'rain'|'shower'|'snow'|'snowrain', when:'17일~18일 새벽', body:['- …'] }], used(묶음에 쓴 줄 수),
//          dropped(첫 머리 뒤에 나왔는데 어느 묶음에도 못 든 강수량 꼴 줄 '- 지역: 숫자' 수 — 0이 아니면 나누기를 믿지 않는다) }
// 몸 = '-'로 시작하는 줄. 끝 = 다음 머리·다른 기호 줄(* ※ □ ○ ◎ ▶)·그 밖의 줄(페이지를 통째 복사하면 바로 뒤에
// '평년(오늘)' 같은 표 글자가 붙어 온다)·빈 줄 뒤의 '-' 아닌 줄(빈 줄만으로는 끝내지 않는다 — 한 줄씩 띄운 글도 있다).
// 단 앞 줄이 '/ , . · ( : ~'로 끝나거나 괄호가 안 닫혔거나 이 줄이 '/'·'(많은 곳'으로 시작하면 줄바꿈으로 잘린 줄이라 앞 줄에 잇는다.
// inBody=true: 통보문 본문만 든 글(페이지 HTML의 cmp-view-content·데스크톱 창의 본문 글) — 표 글자가 섞일 일이 없으니
// 그 밖의 줄도 앞 줄에 잇는다(묶음을 끝내면 뒤따르는 '-' 줄이 빠진다 — 예: 줄바꿈된 '(많은 곳 … 이상)' 뒤의 지역).
function bulSplitGroups(lines, inBody) {
  const groups = []; let cur = null, used = 0, gap = false, dropped = 0;
  for (const raw of lines || []) {
    const l = String(raw).trim().replace(/\s{2,}/g, ' ').replace(/：/g, ':').replace(/^[–—−]/, '-');
    const hm = l.match(BUL_HEAD_RE);
    if (hm) {
      const k = hm[2].replace(/\s/g, '');
      groups.push(cur = { kind: k === '강수량' ? (hm[1] ? 'shower' : 'rain') : k === '적설' ? 'snow' : 'snowrain', when: hm[3].replace(/\s+/g, ' '), body: [], old: l[0] === '□' });
      used++; gap = false; continue;
    }
    if (!cur) { if (groups.length && /^[-‐·•∙]/.test(l) && /:/.test(l) && /\d/.test(l)) dropped++; continue; }
    if (!l) { if (cur.body.length && !inBody) gap = true; continue; }   // 본문만 든 글의 빈 줄은 줄 모양일 뿐(HTML 쪽은 빈 줄을 미리 뺀다)
    const afterGap = gap; gap = false;
    if (/^[-‐·•∙]/.test(l)) { cur.body.push(l); used++; continue; }
    if (cur.old && /^○/.test(l) && /:/.test(l) && /\d/.test(l)) { cur.body.push(l.replace(/^○\s*/, '- ')); used++; continue; }   // 2021년 판 몸 줄
    if (/^[*※□○◎▶]/.test(l) || afterGap) { cur = null; continue; }
    const prev = cur.body[cur.body.length - 1] || '';
    const open = (prev.match(/\(/g) || []).length > (prev.match(/\)/g) || []).length;
    if (prev && (inBody || /[/,.·(:~∼]\s*$/.test(prev) || open || /^\/|^\(\s*많은\s*곳/.test(l))) { cur.body[cur.body.length - 1] = prev + ' ' + l; used++; continue; }
    cur = null;
  }
  return { groups: groups.filter((g) => g.body.length).map((g) => ({ kind: g.kind, when: g.when, body: g.body })), used, dropped };
}

// 날짜 표현에서 날만: '16일 오후~17일 새벽' → '16~17일', '18일 오후' → '18일', '30일~5월 1일' → '30일~1일'. 여러 개면 첫 날~끝 날. 못 뽑으면 원문 그대로.
function bulMergeWhen(ws) {
  const days = ws.flatMap((w) => (String(w).replace(/\d{1,2}\s*월\s*/g, '').match(/\d{1,2}(?=\s*(?:일|~|∼))/g) || []).map(Number));
  if (!days.length) return ws.join(', ');
  const a = days[0], b = days[days.length - 1];
  return a === b ? `${a}일` : a < b ? `${a}~${b}일` : `${a}일~${b}일`;
}
// 고른 묶음(들) → 붙여넣기 칸에 넣을 글(머리 + 원문 줄). 머리 날짜는 때 말('새벽·오후')을 빼고 날만 —
// applyBulletin이 첫 머리의 날짜를 제목의 날짜 칸에 넣는다. 줄 안 날짜 꼬리표는 parseBulletin이 지운다(bulCleanLine).
function bulGroupText(gs) {
  const noun = { snow: '적설', snowrain: '적설 및 강수량' };
  return gs.flatMap((g) => [`* ${g.kind === 'shower' ? '소나기에 의한 ' : ''}예상 ${noun[g.kind] || '강수량'}(${bulMergeWhen([g.when])})`, ...g.body]).join('\n');
}
// 묶음(들)에 든 지역 수 — 칠할 때와 같은 기준(parseBulletin 토큰, '많은 곳' 덧칠은 뺀다)
function bulRegionCount(gs) {
  const set = new Set();
  for (const g of parseBulletin(bulGroupText(gs))) if (!g.many) for (const tk of g.tokens) set.add(tk.island ? 'I:' + tk.island : `${tk.province || ''}:${tk.dir || ''}:${tk.exclude || ''}`);
  return set.size;
}
// 묶음들 → 고르기 항목 [{ label, groups, snow, n(지역 수) }]. 원문 순서를 지키되, 같은 날(날만 비교)에 '비'와 '소나기'가 다 있으면
// 그날 첫 항목 앞에 '비+소나기' 합친 항목을 하나 더 둔다(방송 그림은 보통 그날 전체). 적설은 따로 둔다(cm라 처음 고르는 항목이 아님).
function bulPickItems(groups) {
  const wet = (g) => g.kind === 'rain' || g.kind === 'shower';
  const keyOf = (g) => bulMergeWhen([g.when]);
  const items = [], seen = new Set();
  for (const g of groups) {
    if (wet(g) && !seen.has(keyOf(g))) {
      seen.add(keyOf(g));
      const same = groups.filter((o) => wet(o) && keyOf(o) === keyOf(g));
      if (same.some((o) => o.kind === 'rain') && same.some((o) => o.kind === 'shower')) items.push({ label: `${keyOf(g)} · 비+소나기`, groups: same, snow: false });
    }
    items.push({ label: `${g.when} · ${BUL_KIND_LABEL[g.kind]}`, groups: [g], snow: !wet(g) });
  }
  for (const it of items) it.n = bulRegionCount(it.groups);
  return items;
}
// 처음 고를 항목 — 적설이 아닌 첫 항목(모두 적설이면 첫 항목)
const bulPickDefault = (items) => Math.max(0, items.findIndex((it) => !it.snow));

// '2026년 10월 08일 (목)요일 11:00 발표'·'2026년 10월 08일 11시 00분 발표'(PDF)·발표시각 12자리 → '10월 8일 11:00 발표'
function bulAnnounceText(s, tmfc) {
  const m = String(s || '').match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일[^\d\n]{0,12}(\d{1,2})\s*(?::|시)\s*(\d{2})\s*분?\s*발표/);
  if (m) return `${+m[2]}월 ${+m[3]}일 ${m[4].padStart(2, '0')}:${m[5]} 발표`;
  const t = String(tmfc || '');
  return /^\d{12}$/.test(t) ? `${+t.slice(4, 6)}월 ${+t.slice(6, 8)}일 ${t.slice(8, 10)}:${t.slice(10, 12)} 발표` : '';
}

// 받은 글(날씨누리 HTML · 붙여넣은 글 · 창에서 읽은 글) → 판정
//   { kind:'ok', groups, at, where, extra }   묶음 1개 이상(extra = 묶음 밖 글이 섞임 — 페이지 통째 복사 등)
//   { kind:'none', at, where }                본문은 읽었는데 예상 강수량·적설 묶음이 없음 — 정상
//   { kind:'empty' | 'broken' | 'format' }    빈 응답 · 한글 깨짐 · 본문을 못 찾음(페이지 모양이 바뀜) / drift: 머리 모양이 달라 못 나눔
// mode: 'html' | 'text'(붙여넣은 글 — 페이지 통째·PDF) | 'body'(통보문 본문만 든 글 — 데스크톱 창) | 생략(태그가 있으면 HTML)
function bulReadPage(t, mode) {
  const s = String(t == null ? '' : t);
  if (!s.trim()) return { kind: 'empty' };
  const html = mode ? mode === 'html' : /<(?:html|body|div|span)\b/i.test(s);
  let lines, meta = {};
  if (html) {
    const r = bulPageLines(s); meta = r.meta; lines = r.lines;
    if (!lines) return /[가-힣]/.test(s) || !/[^\x00-\x7f]/.test(s) ? { kind: 'format', detail: '통보문 본문(cmp-view-content)이 없음' } : { kind: 'broken' };
    // 본문 칸은 있는데 비었음(본문을 스크립트로 그리게 바뀜 등) — '한글 깨짐'이 아니다
    if (!lines.length) return { kind: 'format', detail: '통보문 본문(cmp-view-content)이 비어 있음' };
  } else lines = s.replace(/\r/g, '').split('\n');
  if (!lines.some((l) => /[가-힣]/.test(l))) return { kind: 'broken' };
  const at = bulAnnounceText(meta.announce || (html ? '' : s), meta.tmfc);
  const where = BUL_STN[meta.stn] || '';
  const { groups, used, dropped } = bulSplitGroups(lines, html || mode === 'body');
  if (!groups.length) {
    // 머리 모양이 바뀌어 못 나눴는데 '없음'이라고 하면 방송 사고 — 본문에 '예상 강수량/적설' 글이 남아 있으면 형식 오류로 본다(※ 안내 줄은 뺀다)
    const drift = lines.find((l) => /예상\s*(?:강수량|적설)/.test(l) && !/^\s*※/.test(l));
    return drift ? { kind: 'format', drift: true, detail: drift.trim().slice(0, 80), at, where } : { kind: 'none', at, where };
  }
  return { kind: 'ok', groups, at, where, extra: lines.filter((l) => String(l).trim()).length > used, dropped };
}

// 헬퍼 /api/kma 실패 → 판정. 특보와 같은 틀(wrnHttpFail)이되, 이 경로는 인증키를 안 쓰므로 401·403·429는 '기상청 사이트가 막음'
function bulHttpFail(status, body) {
  const f = wrnHttpFail(status, body);
  return f.kind === 'key' || f.kind === 'quota' ? { kind: 'blocked', detail: f.detail } : f;
}
// 결과 → 카드 문구 { tone:'ok'|'err'|'busy', title, meta, lines[], detail, actions[{id,label}], toast }
// r: { kind, src:'fetch'|'paste'|'wnd', n(묶음 수), label(칸에 채운 항목), at, where, snowOnly, drift, timeout, detail, desktop, wnd(날씨누리 창 가능) }
// 정상(묶음 0개 포함)은 초록, 오류는 빨강 + '할 일' 버튼. 오류일 땐 칸·지도를 건드리지 않는다.
function bulResultView(r) {
  r = r || {};
  const k = r.kind, meta = [r.at, r.where].filter(Boolean).join(' · ');
  if (k === 'busy') {
    const t = r.src === 'wnd' ? '날씨누리 창 여는 중…' : '통보문 불러오는 중…';
    return { tone: 'busy', title: t, meta: '', lines: [], detail: '', actions: [], toast: t };
  }
  if (k === 'ok') {
    const head = r.src === 'paste' ? '붙여넣은 글에서 찾음' : r.src === 'wnd' ? '날씨누리 창에서 읽음' : '불러오기 완료';
    // 항목 이름('10일 · 비')은 줄바꿈으로 갈라지지 않게 붙인다
    const title = `${head} — ${r.n > 1 ? `${r.n}묶음` : String(r.label || '').replace(/ /g, ' ')}`;
    // 여럿이면 고른 항목은 '날짜' 칸이 보여 준다(카드에 적으면 고를 때마다 낡는다)
    const lines = [r.n > 1 ? '날짜를 고르면 아래 칸에 채워져요.' : '칸에 채웠어요 — ‘통보문으로 색칠’을 누르세요.'];
    if (r.snowOnly) lines.push('적설(cm)만 있어요 — 강수량 색 단계로 칠해요.');
    if (r.dropped) lines.push(`묶음에 못 넣은 강수량 줄 ${r.dropped}개가 있어요 — 원문과 칸을 견줘 보세요.`);   // 말없이 빠지는 줄이 없게
    return { tone: 'ok', title, meta, lines, detail: '', actions: [], toast: title };
  }
  if (k === 'none') {
    const title = `${r.src === 'paste' ? '붙여넣은 통보문' : r.src === 'wnd' ? '창의 통보문' : '지금 통보문'}에는 예상 강수량이 없어요`;
    const lines = ['오류가 아니에요. 다음 발표(05·11·17시) 뒤 다시 확인하세요.'];
    if (r.cleared) lines.push('앞서 채운 칸은 비웠어요(지난 통보문).');   // 지난 통보문 글로 칠하는 일이 없게
    return { tone: 'ok', title, meta, lines, detail: '', actions: [], toast: title };
  }
  // 대신 쓸 길 — 데스크톱은 날씨누리 창에서 읽기, 웹은 페이지 통째 복사 → 붙여넣기
  const alt = r.wnd ? '‘날씨누리 창에서 읽기’로도 돼요.' : '‘단기예보 열기’에서 통째로 복사(Ctrl+A)해 붙여넣어도 돼요.';
  const F = {
    helperOff: () => ({ title: r.desktop ? '내장 기능 확장팩이 응답하지 않아요' : '기능 확장팩이 꺼져 있어요',
      todo: `${r.desktop ? '앱을 다시 실행해 주세요.' : '‘확장팩 안내 보기’대로 켜 주세요.'} ${alt}`, actions: ['helper', 'open', 'retry'] }),
    helperOld: () => ({ title: '기능 확장팩이 옛 버전이에요',
      todo: `${r.desktop ? '앱을 업데이트해 주세요.' : 'WNS_START를 다시 실행하면 최신으로 바뀌어요.'} ${alt}`, actions: ['helperOld', 'open', 'retry'] }),
    net: () => ({ title: r.timeout ? '기상청 응답이 너무 늦어요' : '기상청에 연결되지 않아요', todo: `인터넷(사내망) 연결을 확인하고 잠시 뒤 다시 눌러 주세요. ${alt}`, actions: ['retry', 'open'] }),
    server: () => ({ title: '기상청 사이트가 잠시 응답하지 않아요', todo: `1~2분 뒤 다시 눌러 주세요. ${alt}`, actions: ['retry', 'open'] }),
    blocked: () => ({ title: '기상청 사이트가 요청을 막았어요', todo: `잠시 뒤 다시 눌러 주세요. ${alt}`, actions: ['retry', 'open'] }),
    empty: () => ({ title: '기상청이 빈 응답을 보냈어요', todo: `잠시 뒤 다시 눌러 주세요. ${alt}`, actions: ['retry', 'open'] }),
    format: () => (r.drift
      ? { title: '예상 강수량 표기가 달라 나누지 못했어요', todo: '기상청이 표기를 바꿨을 수 있어요. 단기예보에서 예상 강수량 줄만 복사해 붙여넣어 주세요.', actions: ['open', 'retry'] }
      : { title: r.src === 'wnd' ? '이 화면에서 통보문을 찾지 못했어요' : '페이지에서 통보문을 찾지 못했어요',
        todo: r.src === 'wnd' ? '창에서 단기예보 화면을 열면 바로 읽어요. 안 되면 예상 강수량 부분을 복사해 붙여넣어 주세요.'
          : `기상청 페이지 모양이 바뀌었을 수 있어요. ${alt}`, actions: ['open', 'retry'] }),
    broken: () => ({ title: '한글이 깨진 채로 들어왔어요', todo: alt, actions: ['open', 'retry'] }),
    other: () => ({ title: '알 수 없는 문제가 생겼어요', todo: `잠시 뒤 다시 눌러 주세요. ${alt}`, actions: ['retry', 'open'] }),
  };
  const f = (F[k] || F.other)();
  const label = { retry: '다시 시도', helper: '확장팩 안내 보기', helperOld: '확장팩 안내 보기', open: r.wnd ? '날씨누리 창에서 읽기' : '단기예보 열기' };
  // 창 읽기 실패에 '다시 시도'(헬퍼로 불러오기)는 엉뚱하다 — 창 다시 열기만
  const acts = r.src === 'wnd' ? ['open'] : f.actions;
  const title = `${r.src === 'wnd' ? '창에서 읽지 못했어요' : '불러오지 못했어요'} — ${f.title}`;
  return { tone: 'err', title, meta, lines: [f.todo, '칸·지도는 그대로예요.'], detail: r.detail ? `기술 정보: ${r.detail}` : '', actions: acts.map((id) => ({ id, label: label[id] })), toast: title };
}

// ===================== 통보문 불러오기 — 화면 =====================
let bulPickList = [];   // '날짜' 고르기 항목(bulPickItems) — 고르면 그 묶음 글을 붙여넣기 칸에 채운다
let bulFetchSeq = 0;    // 불러오기 차례 번호 — 겹치면 마지막 것만(붙여넣기·창 읽기도 올려서 늦게 온 불러오기가 덮지 않게)
let bulWaitWnd = false; // 결과 카드가 날씨누리 창을 기다리는 중 — 창을 그냥 닫으면 카드를 치운다
let bulFilled = '';     // 고르기로 붙여넣기 칸에 마지막으로 채운 글 — 칸이 아직 이 글이면(손대지 않음) '없음'을 받았을 때 비운다
let bulWndLast = '';    // 데스크톱 창에서 마지막으로 읽은 글 — 같은 화면을 다시 읽으면(쪽 안 이동·스크립트 갱신) 고른 날짜·칸을 그대로 둔다
let bulLoadFx = null;   // 지금 켜 둔 작업 중 효과(js/busy-fx.js — 불러오기·날씨누리 창 기다림의 대상 배열). 결과 카드가 바뀌면 끈다(bulFxOff)

// 데스크톱 앱(새 판)이면 앱 안 날씨누리 창을 띄우고 그 창의 통보문을 읽어 올 수 있다(desktop/main.js 'wcg:wnuri-open')
const bulHasWnd = () => !!(window.wcgDesktop && typeof window.wcgDesktop.openWnuri === 'function');

// 결과 카드(#bulResult — 특보 결과 카드와 같은 모양). r=null이면 숨김. quiet=true면 아래 알림(#status)은 안 띄운다.
// 카드가 바뀌면(결과·오류·비움·새 '불러오는 중') 앞 작업의 작업 중 효과를 끈다 — 효과는 '불러오는 중' 카드와 함께 산다.
// (붙여넣기·창 읽기가 진행 중인 불러오기를 버려도 날짜 줄이 숨은 채 응답을 기다리지 않게. 같은 배열을 두 번 꺼도 무해)
function showBulResult(r, quiet) {
  bulFxOff();
  const box = $('#bulResult'); if (!box) return;
  bulWaitWnd = !!(r && r.kind === 'busy' && r.src === 'wnd');
  if (!r) { box.hidden = true; box.textContent = ''; delete box.dataset.tone; return; }
  const v = bulResultView({ ...r, desktop: WNS_DESKTOP, wnd: bulHasWnd() });
  box.dataset.tone = v.tone;
  box.innerHTML = `<div class="wrnResIc">${WRN_ICON[v.tone] || WRN_ICON.info}</div>` +
    '<div class="wrnResBody"><div class="wrnResT"></div><div class="wrnResM"></div><ul class="wrnResL"></ul><div class="wrnResD"></div><div class="wrnResA"></div></div>';
  box.querySelector('.wrnResT').textContent = v.title;
  const put = (sel, txt) => { const n = box.querySelector(sel); if (txt) n.textContent = txt; else n.remove(); };
  put('.wrnResM', v.meta); put('.wrnResD', v.detail);
  const ul = box.querySelector('.wrnResL');
  for (const line of v.lines) { const li = document.createElement('li'); li.textContent = line; ul.append(li); }
  if (!v.lines.length) ul.remove();
  const acts = box.querySelector('.wrnResA');
  const run = { retry: () => fetchBulletin(), helper: () => wnsHelperOffNotice(), helperOld: () => wnsHelperOffNotice('old', 'kma'), open: () => bulOpenPage() };
  v.actions.forEach((a, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = a.label; b.dataset.act = a.id;
    if (!i) b.className = 'pri';
    b.onclick = (e) => { e.stopPropagation(); run[a.id](); };
    acts.append(b);
  });
  if (!v.actions.length) acts.remove();
  box.hidden = false;
  if (!quiet) status(v.toast, r.kind === 'busy', v.tone === 'busy' ? '' : v.tone);
}
// 작업 중 효과(js/busy-fx.js) 끄기 — 켜는 곳(fetchBulletin·bulOpenPage)은 '불러오는 중' 카드를 띄운 뒤 bulLoadFx 에 대상 배열을 담고 켠다:
// 섹션 흐름 + 누른 버튼 띠 + 날짜 줄 자리(결과 카드 바로 아래)에 빛 훑는 막대.
function bulFxOff() { if (bulLoadFx) { fxBusy(bulLoadFx, false); bulLoadFx = null; } }
// 도착 효과 — 섹션 머리 한 번 빛 + 결과 카드·날짜 줄·채운 칸이 위에서부터 떠오른다. filled=false(예상 강수량 없음)면 카드만.
// 오류(칸·지도 그대로)에는 부르지 않는다.
function bulArriveFx(filled) {
  const row = $('#bulPickRow');
  fxArrive([fxSec('fct'), $('#bulResult'), filled && row && row.style.display !== 'none' ? row : null, filled ? $('#bulPaste') : null]);
}

// 고르기 채우기 — 항목이 둘 이상이면 '날짜' 줄을 보이고, 처음 항목(적설 아닌 첫 묶음)을 칸에 채운다. 채운 항목을 돌려준다.
function bulFillPick(groups) {
  bulPickList = bulPickItems(groups);
  const sel = $('#bulPick'), row = $('#bulPickRow');
  sel.textContent = '';
  bulPickList.forEach((it, i) => {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = it.label + (it.n ? ` · 지역 ${it.n}곳` : '');
    sel.append(o);
  });
  const d = bulPickDefault(bulPickList);
  sel.value = String(d);
  row.style.display = bulPickList.length > 1 ? '' : 'none';
  bulPickFill(d);
  return bulPickList[d];
}
// 고른 항목의 글을 붙여넣기 칸에 넣는다(미리보기 — 칠하기는 '통보문으로 색칠'). 고쳐서 칠할 수 있게 칸은 그대로 편집 가능.
function bulPickFill(i) {
  const it = bulPickList[+i]; if (!it) return;
  $('#bulPaste').value = bulFilled = bulGroupText(it.groups);
}
// 고르기 비우기(다른 작업을 열 때·묶음이 없는 통보문을 받았을 때). card=true면 결과 카드도 치우고 진행 중인 불러오기를 버린다.
function bulResetPick(card) {
  bulPickList = [];
  const sel = $('#bulPick'); if (sel) sel.textContent = '';
  const row = $('#bulPickRow'); if (row) row.style.display = 'none';
  if (card) { bulFetchSeq++; showBulResult(null); }
}
// 판정(bulReadPage) → 화면. 묶음이 있으면 고르기·칸 채우기, 없음·오류면 카드만(오류일 땐 칸·고르기를 그대로 둔다).
// 없음(정상)이면 고르기를 비우고, 칸에 지난 통보문에서 채운 글이 손대지 않은 채 남아 있으면 그것도 비운다(지난 비로 칠하는 사고 방지).
function bulShowPage(page, src) {
  if (page.kind === 'ok') {
    const it = bulFillPick(page.groups);
    const snowOnly = page.groups.every((g) => g.kind === 'snow' || g.kind === 'snowrain');
    showBulResult({ kind: 'ok', src, n: page.groups.length, label: it.label, at: page.at, where: page.where, snowOnly, dropped: page.dropped || 0 });
    return true;
  }
  let cleared = false;
  if (page.kind === 'none') {
    bulResetPick();
    const ta = $('#bulPaste');
    if (ta && bulFilled && ta.value === bulFilled) { ta.value = ''; cleared = true; }
    bulFilled = '';
  }
  showBulResult({ ...page, src, cleared });
  return page.kind === 'none';
}

// [통보문 불러오기] — 헬퍼 /api/kma 로 날씨누리 단기예보(전국) 페이지를 받아 묶음을 나눈다. 인증키·API 한도를 안 쓴다.
// 반환: 묶음을 채웠거나 정상 '없음'이면 true, 못 불러왔으면 false, 더 새 요청에 밀렸으면 null.
async function fetchBulletin() {
  const seq = ++bulFetchSeq;
  const stale = () => seq !== bulFetchSeq;
  const fail = (f) => { if (stale()) return null; showBulResult({ ...f, src: 'fetch' }); return false; };
  showBulResult({ kind: 'busy', src: 'fetch' });
  // 작업 중 효과(js/busy-fx.js) — 섹션 흐름 + 버튼 띠 + 날짜 줄 자리에 빛 훑는 막대. 실패·밀려남·헬퍼 꺼짐도 finally에서 끄고
  // (결과 카드가 바뀌면 showBulResult가 먼저 끈다 — 그래야 도착 효과 때 날짜 줄이 보인다), 칸을 채웠거나 정상 '없음'일 때만 도착 효과.
  const fx = bulLoadFx = [fxSec('fct'), $('#bulLoad'), $('#bulPickRow')];
  fxBusy(fx, true, { lines: 3, maxMs: 90000 });
  let got = '';   // 보여 준 결과 종류('ok' | 'none') — 도착 효과용
  try {
    const hp = await pingHelper();
    if (stale()) return null;
    if (!hp.up) return fail({ kind: 'helperOff' });
    let r = null, body = null;
    for (const u of [BUL_PAGE_URL, BUL_PAGE_VIA]) {
      // 주소가 늘 같다 — 발표(05·11·17시) 직후에 브라우저가 지난 응답을 다시 쓰지 않게 캐시를 안 쓴다
      try { r = await fetch(WNS_HELPER + '/api/kma?u=' + encodeURIComponent(u), { cache: 'no-store' }); }
      catch (e) { return fail(bulHttpFail(0, e && e.message)); }   // 확인 직후 연결이 끊김(확장팩 멈춤 등)
      if (stale()) return null;
      body = null;
      if (r.status !== 400) break;
      body = await r.text().catch(() => '');
      if (!/허용되지 않은/.test(body)) break;   // 허용 목록 밖(weather.go.kr) → 다음 주소(kma.go.kr 302 경유)로
    }
    if (!r.ok) {
      if (body == null) body = await r.text().catch(() => '');
      if (stale()) return null;
      // 두 주소 다 허용 목록 밖 = /api/kma 허용 호스트가 다른(더 옛·다른) 헬퍼
      return fail(r.status === 400 && /허용되지 않은/.test(body) ? { kind: 'helperOld', detail: '허용되지 않은 주소' } : bulHttpFail(r.status, body));
    }
    let t;
    try {
      const buf = await r.arrayBuffer();
      t = new TextDecoder('utf-8').decode(buf);
      if (!/[가-힣]/.test(t)) t = new TextDecoder('euc-kr').decode(buf);
    } catch (e) { return fail({ kind: 'net', detail: e && e.message }); }
    if (stale()) return null;
    const page = bulReadPage(t, 'html');
    if (page.kind === 'ok' || page.kind === 'none') {
      if (!page.where) page.where = '전국';
      const shown = bulShowPage(page, 'fetch');
      if (shown) got = page.kind;
      return shown;
    }
    return fail(page);
  } finally {
    fxBusy(fx, false);
    if (bulLoadFx === fx) bulLoadFx = null;
    if (got) bulArriveFx(got === 'ok');
  }
}

// 단기예보 열기 — 데스크톱(새 판)은 앱 안 날씨누리 창(뜰 때마다 통보문을 읽어 옴 → bulFromWnuri), 웹은 새 탭(복사 → 붙여넣기)
function bulOpenPage() {
  if (bulHasWnd()) {
    showBulResult({ kind: 'busy', src: 'wnd' });
    // 작업 중 효과 — 창이 첫 화면을 읽어 올 때까지('여는 중' 카드와 함께). 결과·오류·창 닫힘으로 카드가 바뀌면 showBulResult가 끈다
    // (bulFromWnuri). 창을 열어 둔 채 아무것도 안 오면 2분 뒤 저절로 꺼진다.
    const fx = bulLoadFx = [fxSec('fct'), $('#bulOpen'), $('#bulPickRow')];
    fxBusy(fx, true, { lines: 3, maxMs: 120000 });
    // main이 거절하면(false) '여는 중' 카드가 남지 않게 오류로 바꾼다
    const no = () => { if (bulWaitWnd) showBulResult({ kind: 'other', src: 'wnd' }); };
    Promise.resolve(window.wcgDesktop.openWnuri(BUL_PAGE_URL)).then((ok) => { if (ok === false) no(); }, no);
    return;
  }
  window.open(BUL_PAGE_URL, '_blank', 'noopener');
}
// 데스크톱 날씨누리 창이 화면을 다 띄울 때마다 main이 보내는 것 { text(본문 글), announce, url, first(창을 연 뒤 첫 화면), err, closed }
// 창의 글은 바깥 페이지가 준 것이라 글자로만 쓴다(칸·카드 textContent).
function bulFromWnuri(d) {
  if (!d || typeof d !== 'object') return;
  if (d.closed) { bulWndLast = ''; if (bulWaitWnd) showBulResult(null, true); return; }
  const wait = d.first || bulWaitWnd;
  if (d.err) { if (wait) showBulResult({ kind: 'net', src: 'wnd', detail: String(d.err).slice(0, 160) }); return; }
  const text = typeof d.text === 'string' ? d.text.slice(0, 200000) : '';
  if (!text.trim()) { if (wait) showBulResult({ kind: 'format', src: 'wnd' }); return; }   // 단기예보가 아닌 화면 — 처음 뜬 화면일 때만 알린다
  const all = `${typeof d.announce === 'string' ? d.announce.slice(0, 200) : ''}\n${text}`;
  // 같은 글을 다시 읽음(쪽 안 이동·같은 화면 새로 그림) — 고른 날짜·고친 칸을 덮지 않는다. 창을 다시 연 첫 읽기는 늘 반영.
  if (!wait && all === bulWndLast) return;
  bulWndLast = all;
  bulFetchSeq++;   // 진행 중인 불러오기가 이걸 덮지 않게
  const page = bulReadPage(all, 'body');
  const stn = (String(d.url || '').match(/[?&]stnId=(\d+)/) || [])[1];
  page.where = BUL_STN[stn || 108] || '';
  if (bulShowPage(page, 'wnd')) bulArriveFx(page.kind === 'ok');   // 작업 중 효과는 카드가 바뀌며 꺼졌다 — 읽었으면 도착 효과
}
// 붙여넣기 칸에 페이지 통째·PDF 글을 붙여넣으면 '예상 강수량' 묶음만 뽑아 고르기로. 지금처럼 강수량 줄만(또는 머리+줄 한 묶음만)
// 붙여넣으면 손대지 않고 그대로 붙는다.
function bulOnPaste(e) {
  const t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
  const page = bulReadPage(t, 'text');
  // 묶음이 여럿이거나 묶음 밖 글이 섞임(통째 복사) · 또는 통보문 한 판(발표 시각 있음)인데 묶음도 강수량 줄도 없음
  // 묶음 밖에 남은 강수량 줄이 있으면(dropped) 나누기를 믿지 않고 예전처럼 그대로 붙인다(줄이 빠지는 것보다 낫다)
  const rainy = () => t.split('\n').some((l) => /^\s*[-‐·•∙–—−]/.test(l) && /[:：]/.test(l) && /\d/.test(l));
  const whole = page.kind === 'ok' ? (!page.dropped && (page.groups.length > 1 || page.extra)) : (page.kind === 'none' && !!page.at && !rainy());
  if (!whole) return;
  e.preventDefault();
  bulFetchSeq++;
  if (bulShowPage(page, 'paste')) bulArriveFx(page.kind === 'ok');   // 바로 끝나는 일이라 도착 효과만
}
