/* [모듈] js/warnings.js — 기상특보: 파싱(parseWrn)·단계 색·발효 순서, 불러오기 결과 판정·문구(wrnReadText·wrnHttpFail·wrnResultView) */
'use strict';

// ===================== 기상특보 자동 색칠 =====================
// 기상청 '특보현황 조회'(wrn_now_data) 응답 형식:
//   REG_UP, REG_UP_KO, REG_ID, REG_KO, TM_FC, TM_EF, WRN, LVL, CMD, ED_TM, =
//   #으로 시작하는 줄은 주석. REG_ID가 우리 지도 조각 id와 같다 (235개 전부 확인함).
function parseWrn(txt) {
  const out = [];
  for (const line of String(txt).split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const p = line.split(',').map((s) => s.trim());
    if (p.length < 9 || !/^[LS]\d/.test(p[2])) continue;
    out.push({ id: p[2], ko: p[3], tmfc: p[4], tmef: p[5], wrn: p[6], lvl: p[7], cmd: p[8] });
  }
  return out;
}

// 202607151000 -> '7/15 10:00'
function tmShort(t) {
  const s = String(t || '');
  if (!/^\d{12}$/.test(s)) return '';
  return `${+s.slice(4, 6)}/${+s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
}

const wrnColorKey = (wrn, lvl) => String(wrn || '') + '|' + String(lvl || '');
function ensureWrnLevelColors() {
  if (!S.wrnLevelColors || typeof S.wrnLevelColors !== 'object' || Array.isArray(S.wrnLevelColors)) S.wrnLevelColors = {};
  if (!hex(S.wrnLevelColors['폭염|중대경보'])) S.wrnLevelColors['폭염|중대경보'] = '#8B0000';
  return S.wrnLevelColors;
}
// 특보 하나의 색 — 정확한 종류×단계 사용자색을 우선하고, 없으면 기존 주의보/경보 기본색
function wrnColorOf(wrn, lvl) {
  const exact = hex(ensureWrnLevelColors()[wrnColorKey(wrn, lvl)]);
  if (exact) return exact;
  const c = S.wrnColors[wrn];
  if (!c) return null;
  return /경보/.test(lvl) ? c[1] : c[0];
}
function setWrnLevelColor(wrn, lvl, color) {
  const value = hex(color);
  if (!value) return false;
  ensureWrnLevelColors()[wrnColorKey(wrn, lvl)] = value;
  return true;
}
function normalizedWrnLevelColors(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [key, color] of Object.entries(value)) {
    const valid = typeof key === 'string' && key.includes('|') ? hex(color) : null;
    if (valid) out[key] = valid;
  }
  return out;
}
function applyPresetWarningColors(preset, full) {
  if (!full) return;
  const saved = normalizedWrnLevelColors(preset && preset.wrnLevelColors);
  S.wrnLevelColors = { '폭염|중대경보': '#8B0000', ...saved };
}
function refreshWarningColorsAfterPreset(full) {
  if (!full) return;
  buildWrnCols();
  buildWrnList();
  if (wrnRows.length) paintWrn();
}

// 켜고 끄는 단위. 목록이 종류×수준으로 나오므로 키도 같이 가야 한다.
// (종류만으로 키를 잡으면 '호우 예비'를 끌 때 '호우 주의보'까지 같이 꺼진다.)
const wrnKeyOf = (r) => r.wrn + '|' + r.lvl;
// 예비특보는 "곧 낼 수도 있다"는 예고지 발효된 특보가 아니다.
// 주의보와 같은 색으로 깔리면 방송에서 사실과 다른 그림이 되므로 기본은 꺼둔다.
const isPre = (lvl) => /예비/.test(lvl);

const wrnCommandKind = (cmd) => {
  const value = String(cmd || '').trim();
  if (value === '3' || value === '4' || /해제/.test(value)) return 'release';
  if (value === '2' || /대치/.test(value)) return 'replace';
  if (value === '5' || /연장/.test(value)) return 'extend';
  return 'announce';
};
const wrnEventTime = (r) => String(r.tmef || r.tmfc || '');
// 같은 구역·종류라도 예비특보와 발효 특보(주의보/경보)는 따로 산다 — 한 키로 묶으면 늦게 온 예비가 발효 중인 주의보를 지운다.
// 발효 쪽은 단계를 키에 안 넣어야 주의보→경보 '대치'·해제가 같은 키로 덮어쓰기·삭제된다.
const wrnActiveKey = (r) => `${r.id}|${r.wrn}|${/예비/.test(r.lvl || '') ? 'pre' : 'eff'}`;
function applyWrnEvent(active, r) {
  const key = wrnActiveKey(r), kind = wrnCommandKind(r.cmd);
  if (kind === 'release') { active.delete(key); return; }
  if (kind === 'replace' && key.endsWith('|eff')) active.delete(key.slice(0, -3) + 'pre');   // 대치로 발효되면 그 예비특보는 끝난 것
  active.set(key, r);
}
function activeWrnRows(rows, target) {
  const at = String(target || '999999999999');
  const events = rows.map((r, i) => ({ r, i }))
    .filter(({ r }) => !wrnEventTime(r) || wrnEventTime(r) <= at)
    .sort((a, b) => wrnEventTime(a.r).localeCompare(wrnEventTime(b.r))
      || String(a.r.tmfc || '').localeCompare(String(b.r.tmfc || '')) || a.i - b.i);
  const active = new Map();
  for (const { r } of events) applyWrnEvent(active, r);
  return Array.from(active.values());
}
// 선택한 '발표시각(통보문)' 기준의 유효 특보 — 그 발표까지의 이벤트를 발표시각 순으로 재생(발표=추가, 해제=제거).
// activeWrnRows는 발효(tmef) 기준이라 발효/발표가 섞였는데, 통보문 드롭다운에선 '발표시각' 하나로 일관되게 본다.
function activeAtFc(rows, fc) {
  const at = String(fc || '999999999999');
  const evs = rows.map((r, i) => ({ r, i }))
    .filter(({ r }) => String(r.tmfc || '') <= at)
    .sort((a, b) => String(a.r.tmfc || '').localeCompare(String(b.r.tmfc || '')) || a.i - b.i);
  const active = new Map();
  for (const { r } of evs) applyWrnEvent(active, r);
  return Array.from(active.values());
}
function moveWrnOrder(order, from, to) {
  const next = order.slice();
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
function wrnDropIndex(from, over, after, length) {
  let insertion = Math.max(0, Math.min(length, over + (after ? 1 : 0)));
  if (from < insertion) insertion--;
  return Math.max(0, Math.min(length - 1, insertion));
}
function clearWrnDragFeedback(container) {
  container.querySelectorAll('.dragging,.drop-before,.drop-after').forEach((node) => {
    node.classList.remove('dragging', 'drop-before', 'drop-after');
  });
}
function defaultWrnOrder(rows, warningTypes) {
  const typeRank = new Map(warningTypes.map((name, i) => [name, i]));
  const unique = new Map();
  const keyOf = (r) => `${r.wrn}|${r.lvl}`;
  const levelRank = (r) => (r.wrn === '폭염' && /중대경보/.test(r.lvl))
    ? -1
    : (/경보/.test(r.lvl) ? 0 : 1);
  for (const r of rows) if (!unique.has(keyOf(r))) unique.set(keyOf(r), r);
  return Array.from(unique.values())
    .sort((a, b) => ((typeRank.get(a.wrn) ?? 999) - (typeRank.get(b.wrn) ?? 999))
      || (levelRank(a) - levelRank(b)))
    .map(keyOf);
}
// 다시 불러와도 사용자가 드래그로 정한 겹침 순서는 지킨다 — 이전 순서(prev)를 그대로 두고,
// 새로 나온 특보만 기본 순서(def)에서 바로 앞 특보 뒤에 끼운다. 지금 없는 특보 순서도 뒤에 남겨 다시 나올 때 쓴다.
function mergeWrnOrder(prev, def) {
  prev = Array.isArray(prev) ? prev : [];
  const out = prev.filter((k) => def.includes(k));
  def.forEach((k, i) => {
    if (out.includes(k)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const p = out.indexOf(def[j]); if (p >= 0) { at = p + 1; break; } }
    out.splice(at, 0, k);
  });
  return out.concat(prev.filter((k) => !out.includes(k)));
}

// ===================== 특보 불러오기 결과 — 판정·문구 =====================
// '기상청에서 불러오기'(또는 붙여넣기)의 결과를 경우별로 나눠 화면 문구를 고른다. DOM을 안 쓰는 순수 함수(tests/에서 검사).
// 핵심: 정상 응답인데 그 시각 발효 중인 특보가 0건인 것(none)은 오류가 아니다 — 초록·'완료'로 보여 줘야 고장으로 오해하지 않는다.
//   ok        발효 중인 특보 N건 → 칠함
//   none      정상 응답 · 발효 중 0건(아예 없거나 해제·예비·발효 예정만 있음) → 정상
//   helperOff 기능 확장팩(헬퍼)이 응답 없음         helperOld  확장팩이 옛 버전(기상청 연결 기능 없음, /api/kma 404)
//   net       인터넷·사내망 연결 문제(시간 초과 등)   server     기상청 서버 오류(5xx 등)
//   key       인증키 오류(401·403)                   quota      사용량(호출 횟수) 초과
//   empty     빈 응답    format  특보 표가 아닌 응답(점검 페이지·표 형식 바뀜 등)    broken  한글 깨짐    other  그 밖의 문제
// 톤: ok(초록) · warn(주황 — 칠은 했지만 일부 줄을 못 읽었거나 지도에 없는 구역이 있음) · err(빨강 — 지도는 그대로)
// 202610080420 -> '2026.10.08 04:20'
function wrnTmText(t) {
  const s = String(t || '');
  if (!/^\d{12}$/.test(s)) return '';
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
}
// ['호우 주의보', ...] -> '호우 주의보, 강풍 주의보 외 2'
function wrnNameList(arr, max = 3) {
  const a = Array.isArray(arr) ? arr : [];
  return a.slice(0, max).join(', ') + (a.length > max ? ` 외 ${a.length - max}` : '');
}
// 헬퍼 /api/kma가 실패(HTTP 오류)했을 때. status=0 이면 fetch 자체가 끊김. body = 헬퍼가 준 본문({ok:false,error:'HTTP Error 401: …'}).
function wrnHttpFail(status, body) {
  const b = String(body == null ? '' : body);
  let msg = b;
  try { const j = JSON.parse(b); if (j && j.error) msg = String(j.error); } catch (e) { /* 글자 그대로 */ }
  msg = msg.trim().slice(0, 160);
  if (!status) return { kind: 'helperOff', detail: msg };
  if (status === 404) return { kind: 'helperOld', detail: 'HTTP 404' };
  const code = +((msg.match(/HTTP Error (\d{3})/) || [])[1] || 0);
  if (code === 429 || /초과|한도/.test(msg)) return { kind: 'quota', detail: msg };
  // 헬퍼는 기상청 오류 본문을 버리고 'HTTP Error 403: Forbidden'만 넘긴다 — 403만으로는 '키가 틀림'인지 '횟수 초과·권한 없음'인지 모른다.
  // 단서(인증키 문구)가 없는 403은 두 원인을 같이 말한다(maybeQuota). 401은 키 문제로 본다.
  if (code === 401 || code === 403) return { kind: 'key', detail: msg, maybeQuota: code === 403 && !/인증키|authKey|유효하지|등록되지/i.test(msg) };
  if (code) return { kind: 'server', detail: msg };   // 기상청이 HTTP 오류를 돌려줌(5xx 등)
  if (/timed? ?out|timeout|시간 초과/i.test(msg)) return { kind: 'net', detail: msg, timeout: true };
  if (status === 502 || status === 504) return { kind: 'net', detail: msg };   // 헬퍼가 기상청까지 못 감(주소 못 찾음·연결 거부 등)
  return { kind: 'other', detail: msg || ('HTTP ' + status) };
}
// 특보 줄로 읽지 못한 데이터 줄 — '#' 설명줄·빈 줄·'=' 꼬리만 있는 줄은 뺀다.
// 실제 응답(2026-08-03 354줄 확인)은 모든 데이터 줄이 쉼표 10칸 + ',=' 꼬리라 0개다. 쉼표가 9칸 미만이면 형식이 바뀐 줄로 본다.
function wrnUnreadLines(txt) {
  const out = [];
  for (const line of String(txt == null ? '' : txt).split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#') || /^[=\s]*$/.test(s)) continue;
    if (s.split(',').length < 9) out.push(s);
  }
  return out;
}
// 정상(200)으로 받은 글을 읽는다 → { kind:'rows', rows, unread } (rows가 0개여도 정상 특보현황) 또는 오류 { kind, detail }.
// unread = 특보 줄 모양이 아니라 못 읽은 줄 수(sample = 그 첫 줄 앞부분). 머리만 있고 못 읽은 줄만 있으면 '없음'이 아니라 형식 오류다.
function wrnReadText(txt) {
  const t = String(txt == null ? '' : txt);
  if (!t.trim()) return { kind: 'empty' };
  const rows = parseWrn(t);
  const bad = wrnUnreadLines(t);
  if (rows.length) {
    // 기상청 응답은 EUC-KR이라 UTF-8로 잘못 읽히면 한글이 통째로 깨져 특보종류를 못 알아본다
    if (!rows.some((r) => /[가-힣]/.test(r.wrn))) return { kind: 'broken' };
    return bad.length ? { kind: 'rows', rows, unread: bad.length, sample: bad[0].slice(0, 80) } : { kind: 'rows', rows };
  }
  if (/START7777|7777END|REG_ID|TM_FC/i.test(t)) {
    // 머리는 특보현황인데 데이터 줄을 하나도 못 읽음 = 표 형식이 바뀜(탭·공백 구분 등). '특보 없음'으로 단정하면 방송 사고라 오류로 돌린다.
    if (bad.length) return { kind: 'format', drift: true, unread: bad.length, detail: bad[0].slice(0, 80) };
    // 특보현황 머리(#START7777 · REG_ID 열 설명)만 오고 줄이 없음 = 지금 특보가 하나도 없는 정상 응답 (실제 응답엔 #7777END도 없다)
    return { kind: 'rows', rows: [] };
  }
  // 기상청 오류 응답 — {"result":{"status":401,"message":"유효한 인증키가 아닙니다."}} 꼴이거나 문구만
  const st = +((t.match(/"status"\s*:\s*"?(\d{3})/) || [])[1] || 0);
  const m = ((t.match(/"message"\s*:\s*"([^"]*)"/) || [])[1] || '').trim();
  const say = m || t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (st === 429 || /초과|한도/.test(say)) return { kind: 'quota', detail: say };
  if (st === 401 || st === 403 || /인증키|authKey/i.test(say)) return { kind: 'key', detail: say };
  if (st >= 500 || /점검/.test(say)) return { kind: 'server', detail: say };
  return { kind: 'format', detail: say };
}
// 특정 시각(at) 기준 요약 — 발효 중(예비 제외) 건수·종류 수와, 칠하지 않은 이유가 될 예비·해제·발효 예정 이름들.
function wrnSummarize(events, at) {
  const t = String(at || '999999999999');
  const ev = Array.isArray(events) ? events : [];
  const active = activeWrnRows(ev, t);
  const label = (r) => `${r.wrn || ''} ${r.lvl || ''}`.trim();
  const uniq = (a) => Array.from(new Set(a.filter(Boolean)));
  const eff = active.filter((r) => !isPre(r.lvl));
  return {
    active,
    eff: eff.length,
    types: uniq(eff.map(label)).length,
    pre: uniq(active.filter((r) => isPre(r.lvl)).map(label)),
    rel: uniq(ev.filter((r) => wrnCommandKind(r.cmd) === 'release' && wrnEventTime(r) && wrnEventTime(r) <= t).map(label)),
    up: uniq(ev.filter((r) => wrnCommandKind(r.cmd) !== 'release' && !isPre(r.lvl) && wrnEventTime(r) > t).map(label)),
  };
}
const WRN_ACT_LABEL = { retry: '다시 시도', helper: '확장팩 안내 보기', helperOld: '확장팩 안내 보기', api: 'API 설정 열기', open: '기상청 화면 새 창으로 열기' };
const WRN_FAIL = {
  helperOff: (r) => ({ title: r.desktop ? '내장 기능 확장팩이 응답하지 않아요' : '기능 확장팩이 꺼져 있어요',
    todo: r.desktop ? '앱을 완전히 닫았다가 다시 실행한 뒤 다시 눌러 주세요.' : '‘확장팩 안내 보기’대로 WNS_START를 한 번 실행한 뒤 다시 눌러 주세요.',
    actions: ['helper', 'retry'] }),
  helperOld: (r) => ({ title: '기능 확장팩이 옛 버전이에요',
    todo: r.desktop ? '앱을 최신 버전으로 업데이트한 뒤 다시 눌러 주세요.' : 'WNS_START를 다시 실행하면 최신으로 바뀝니다. 그다음 다시 눌러 주세요.',
    actions: ['helperOld', 'retry'] }),
  net: (r) => ({ title: r.timeout ? '기상청 응답이 너무 늦어요' : '기상청에 연결되지 않아요',
    todo: '인터넷(사내망) 연결을 확인하고 잠시 뒤 다시 눌러 주세요.', actions: ['retry'] }),
  server: () => ({ title: '기상청 서버가 잠시 응답하지 않아요', todo: '기상청 쪽 문제예요. 1~2분 뒤 다시 눌러 주세요.', actions: ['retry'] }),
  // defKey = API 설정 칸이 비어 앱에 들어 있는 기본 인증키를 쓰는 중(여럿이 같이 써서 막히거나 횟수가 먼저 찰 수 있다)
  key: (r) => (r.maybeQuota
    ? { title: `${r.defKey ? '기본 인증키가' : '인증키가'} 막혔거나 오늘 조회 횟수를 넘었어요`,
      todo: r.defKey
        ? '여럿이 같이 쓰는 기본 인증키라 막혔을 수 있어요. 오른쪽 아래 ‘API 설정’에 개인 인증키를 넣으면 바로 됩니다. 아니면 잠시 뒤 다시 눌러 주세요.'
        : '‘API 설정’에 넣은 인증키가 맞는지, 기상청 API허브에서 특보 API 사용 신청이 됐는지 확인해 주세요. 칸을 비우면 기본 키로 해 볼 수 있어요.',
      actions: ['api', 'retry'] }
    : { title: r.defKey ? '기본 인증키가 맞지 않아요' : '인증키가 맞지 않아요',
      todo: (r.noKey || r.defKey) ? '오른쪽 아래 ‘API 설정’에 개인 인증키를 넣어 주세요.' : '오른쪽 아래 ‘API 설정’에서 인증키를 확인해 주세요. 칸을 비우면 기본 키를 씁니다.',
      actions: ['api', 'retry'] }),
  quota: (r) => ({ title: '오늘 쓸 수 있는 조회 횟수를 넘었어요',
    todo: r.defKey === false
      ? '넣어 둔 인증키의 오늘 횟수를 다 썼어요. 내일 다시 되거나, ‘API 설정’ 칸을 비우면 기본 키로 해 볼 수 있어요.'
      : '잠시 뒤 다시 하거나, ‘API 설정’에 개인 인증키를 넣으면 바로 됩니다.',
    actions: ['api', 'retry'] }),
  empty: (r) => (r.src === 'paste'
    ? { title: '붙여넣은 내용이 비어 있어요', todo: '새 창 글자를 전체 선택(Ctrl+A) → 복사(Ctrl+C)해서 아래 칸에 붙여넣어 주세요.', actions: ['open'] }
    : { title: '기상청이 빈 응답을 보냈어요', todo: '잠시 뒤 다시 눌러 주세요. 계속되면 아래 ‘기상청 특보현황 새 창으로 열기’로 확인해 보세요.', actions: ['retry', 'open'] }),
  format: (r) => (r.partial   // 일부 줄만 읽혔고 읽힌 줄엔 발효 특보가 없음 — '없음'이 확실하지 않아 칠을 바꾸지 않는다
    ? { title: '특보 표 일부를 읽지 못했어요',
      todo: `읽지 못한 줄${r.unread ? ` ${r.unread}개` : ''} 때문에 특보가 정말 없는지 확실하지 않아요. 아래 ‘기상청 특보현황 새 창으로 열기’로 직접 확인해 주세요.`,
      actions: ['open', 'retry'] }
    : r.drift   // 특보현황 머리는 왔는데 데이터 줄 모양이 달라 하나도 못 읽음
      ? { title: '특보 표 형식이 달라 읽지 못했어요',
        todo: '기상청이 표 형식을 바꿨을 수 있어요. 특보가 없는 게 아니라 못 읽은 거예요 — 아래 ‘기상청 특보현황 새 창으로 열기’로 직접 확인해 주세요.',
        actions: ['open', 'retry'] }
      : r.src === 'paste'
        ? { title: '붙여넣은 글에서 특보 표를 찾지 못했어요', todo: '새 창 글자를 전체 선택(Ctrl+A)해서 그대로 붙여넣었는지 확인해 주세요.', actions: ['open'] }
        : { title: '특보 표가 아닌 응답이 왔어요', todo: '기상청이 점검 중이거나 주소가 바뀌었을 수 있어요. 잠시 뒤 다시 하거나 아래 ‘새 창으로 열기’로 확인해 보세요.', actions: ['retry', 'open'] }),
  broken: () => ({ title: '한글이 깨진 채로 들어왔어요', todo: '아래 ‘기상청 특보현황 새 창으로 열기’로 연 화면을 복사해 붙여넣으면 보통 정상입니다.', actions: ['open'] }),
  other: () => ({ title: '알 수 없는 문제가 생겼어요', todo: '잠시 뒤 다시 눌러 주세요.', actions: ['retry'] }),
};
// 'YYYYMMDDHHMM' → 분 단위 수(시간대와 무관하게 두 시각의 차이만 잰다). 형식이 틀리면 NaN.
function wrnTmMin(t) {
  const s = String(t || '');
  if (!/^\d{12}$/.test(s)) return NaN;
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12)) / 60000;
}
// 어느 시각·무엇을 기준으로 본 결과인지 한 줄. 붙여넣기는 글이 언제 것인지 모르므로 '칠한 시각'만 말한다.
function wrnBasisText(r) {
  const when = wrnTmText(r && r.at);
  if (!when) return '';
  if (r.src === 'paste') return r.now ? `붙여넣은 특보현황 · ${when}에 칠함` : `붙여넣은 특보현황 · ${when} 기준`;
  return r.now ? `기상청 기준 ${when} 확인` : `${when} 기준 발효 현황`;
}
// 결과 → 화면 문구 { tone:'ok'|'warn'|'err'|'busy', title, meta, lines[], detail, actions[{id,label}], toast }
// r: { kind, src:'fetch'|'paste', at(YYYYMMDDHHMM), now(지금 기준?), types, painted, pre[], preOn[], up[], rel[], added[], cleared,
//      seaHidden(육상 지도라 안 보이는 바다 구역 수), seaNames[], seaMap, landEff(육상 발효 특보 줄 수), unknown(지도에 없는 구역 수), unknownNames[],
//      offNames[](목록에서 꺼 둔 발효 특보), offAll, unread(못 읽은 줄 수), back(실패 때 되돌린 시각 표시), detail, timeout, desktop, defKey, maybeQuota }
function wrnResultView(r) {
  r = r || {};
  const k = r.kind, paste = r.src === 'paste';
  if (k === 'busy') {
    const t = '기상청에서 특보를 불러오는 중…';
    return { tone: 'busy', title: t, meta: '', lines: [], detail: '', actions: [], toast: t };
  }
  if (k === 'ok' || k === 'none') {
    const meta = wrnBasisText(r);
    const done = paste ? '칠하기 완료' : '불러오기 완료';
    const lines = [];
    let title, tone = 'ok';
    const seaHidden = r.seaHidden > 0 ? r.seaHidden : 0;
    if (k === 'none') {
      title = `${done} — ${paste ? '붙여넣은 특보현황에는' : r.now ? '지금' : '그 시각에'} 발효 중인 기상특보가 없습니다`;
      if (r.preOn && r.preOn.length) lines.push(`오류가 아니에요. 발효 중인 특보는 없고, 켜 둔 예비특보(${wrnNameList(r.preOn)})만 칠했어요.`);
      else lines.push('오류가 아니에요. 칠할 특보가 없어서 지도가 비어 있는 게 정상입니다.');
      if (r.cleared > 0) lines.push(`지도에 있던 특보 색(${r.cleared}구역)은 지웠어요 — 되돌리려면 Ctrl+Z`);
    } else {
      const painted = r.painted != null ? r.painted : null;
      // 육상 지도에 바다 특보만(또는 바다도) 있으면 '0개 구역 칠함'만 보고 고장으로 오해한다 — 육상/바다를 나눠 말한다
      title = `${done} — 발효 중인 특보 ${r.types || 0}종` + (seaHidden
        ? ` · 육상 ${painted || 0}구역 칠함 · 바다 ${seaHidden}구역`
        : painted != null ? ` · ${painted}개 구역 칠함` : '');
      if (seaHidden) {
        if (!painted && r.landEff === 0) lines.push('육상에는 발효 중인 특보가 없어 이 지도(육상)는 비어 있어요 — 정상이에요.');
        lines.push(`바다 특보(${wrnNameList(r.seaNames)}) ${seaHidden}구역은 이 지도에는 안 보여요 — ‘${r.seaMap || '특보 + 해상'}’ 지도로 바꾸면 보여요`);
      }
      if (r.offAll) lines.push('목록에서 특보를 모두 꺼 두어서 칠한 구역이 없어요 — 아래 목록의 눈 아이콘으로 켜세요');
      else if (r.offNames && r.offNames.length) lines.push(`목록에서 꺼 둔 특보(${wrnNameList(r.offNames)})는 칠하지 않았어요`);
      if (r.unknown > 0) {   // 발효 중인데 지도에 그릴 자리가 없음 — 방송 그림에서 빠지므로 주황으로 알린다
        tone = 'warn';
        lines.unshift(`지도에 없는 구역 ${r.unknown}곳${r.unknownNames && r.unknownNames.length ? `(${wrnNameList(r.unknownNames)})` : ''}은 칠하지 못했어요 — 기상청이 구역을 새로 나눴을 수 있어요. 아래 ‘기상청 특보현황 새 창으로 열기’로 확인해 보세요`);
      }
    }
    if (r.unread > 0) {   // 일부 줄을 못 읽음 — 읽은 만큼은 칠했지만 빠진 특보가 있을 수 있다
      tone = 'warn';
      lines.unshift(`읽지 못한 줄이 ${r.unread}개 있어요 — 그 줄의 특보는 칠하지 못했을 수 있어요. 아래 ‘기상청 특보현황 새 창으로 열기’로 확인해 보세요`);
    }
    if (r.pre && r.pre.length) lines.push(`예비특보(${wrnNameList(r.pre)})는 아직 발효 전이라 꺼 두었어요 — 아래 목록에서 켤 수 있어요`);
    if (r.up && r.up.length) lines.push(`곧 발효될 특보(${wrnNameList(r.up)})가 있어요 — 위 ‘통보문’에서 ‘발효 예정’ 시각을 고르면 볼 수 있어요`);
    if (k === 'none' && r.rel && r.rel.length) lines.push(`이미 해제된 특보(${wrnNameList(r.rel)})는 칠하지 않았어요 — 위 ‘통보문’에서 지난 시각을 고르면 그때 모습을 볼 수 있어요`);
    if (r.added && r.added.length) lines.push(`처음 보는 특보(${wrnNameList(r.added)})는 회색으로 넣었어요 — 아래 ‘특보 종류별 색’에서 바꾸세요`);
    const actions = tone === 'warn' ? [{ id: 'open', label: WRN_ACT_LABEL.open }] : [];
    return { tone, title, meta, lines, detail: tone === 'warn' && r.sample ? `읽지 못한 줄: ${r.sample}` : '', actions, toast: title };
  }
  const f = (WRN_FAIL[k] || WRN_FAIL.other)(r);
  const title = `${paste ? '칠하지 못했어요' : '불러오지 못했어요'} — ${f.title}`;
  const actions = f.actions.filter((a) => !(paste && a === 'retry')).map((id) => ({ id, label: WRN_ACT_LABEL[id] }));
  const lines = [f.todo, '지도 색은 바꾸지 않았어요 — 이전 그대로입니다.'];
  // 날짜·통보문을 바꿔 자동으로 다시 부르다 실패하면, 고른 시각 표시도 지도에 칠해진 시각으로 되돌린다(호출하는 쪽) — 그걸 알려 준다
  if (r.back) lines.push(`날짜·시각 선택도 지도에 칠해진 시각(${r.back})으로 되돌렸어요.`);
  return { tone: 'err', title, meta: '', lines, detail: r.detail ? `기술 정보: ${r.detail}` : '', actions, toast: title };
}
// 특보 목록 자리의 '발효 중인 특보 없음' 카드 문구 { title, sub, stale }. info = S.wrnNone, o = { nowTm, preOn(켜 둔 예비특보가 있나) }
// 저장해 둔 0건 결과를 나중에 다시 열면 '지금 … 없습니다'가 거짓이 될 수 있다 — 1시간이 지났으면 '그때는 없었다'로 바꾸고 다시 확인을 권한다.
const WRN_STALE_MIN = 60;
function wrnEmptyView(info, o) {
  info = info || {}; o = o || {};
  const paste = info.src === 'paste';
  const when = wrnTmText(info.at);
  const stale = !!info.now && !!when && wrnTmMin(o.nowTm) - wrnTmMin(info.at) >= WRN_STALE_MIN;
  const title = paste ? '붙여넣은 특보현황에는 발효 중인 기상특보가 없습니다'
    : stale ? `${when} 확인 때는 발효 중인 기상특보가 없었습니다`
      : info.now ? '지금 발효 중인 기상특보가 없습니다' : '이 시각에 발효 중인 기상특보가 없습니다';
  const sub = [];
  const basis = wrnBasisText(info);
  if (basis) sub.push(basis);
  if (stale) sub.push('지금 상태는 위 ‘기상청에서 불러오기’로 다시 확인하세요');
  sub.push(o.preOn ? '발효 중인 특보는 없고, 켜 둔 예비특보만 칠했어요' : '칠할 구역이 없어 지도가 비어 있는 게 정상이에요');
  if (!o.preOn && Array.isArray(info.pre) && info.pre.length) sub.push('아래 예비특보는 아직 발효 전이라 꺼 두었어요');
  return { title, sub: sub.join(' · '), stale };
}
// ===================== 특보 불러오기 결과 — 판정·문구 끝 =====================

