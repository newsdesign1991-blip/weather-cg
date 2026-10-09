/* [모듈] js/data-maps.js — 공공데이터포털 자료 공통(10-10): 주소·이름 설정(DATA_API), 인증키(dataKey)·키 가리기(dataMask)·요청(dataGet — 데스크톱 메인의 연결 재사용 wcgDesktop.dataFetch, 없으면 헬퍼 /api/kma · 시도마다 시간 제한·다시 보내기)·응답 판정(dataReadBody)·동시 요청(dataPool)·캐시(유효 시각), 색 단계표(DATA_SCALES)·범례 항목(dataLegendItems·autoLegendItems), 결과 카드(dataResultView·showDataResult), 단계 목록, 수치 라벨·지도별 라벨 맡기기(dataLabelsSwap) */
'use strict';

// ===================== 공공데이터포털 자료 공통 =====================
// 생활기상(기상청 생활기상지수 4.0)·미세먼지 농도(에어코리아 대기오염통계 현황)·미세먼지 예보(에어코리아 대기오염정보)를
// 들어오는 구분 그대로 자기 지도(S.style = life·dust·dustFcst)에만 칠한다 — 다른 구분 지도로 옮겨 칠하지 않는다(MODULES.md 7-1).
// 요청(10-10 느림·멈춤 고치기): 데스크톱이면 메인 프로세스가 연결을 모아 다시 쓰며 받는다(wcgDesktop.dataFetch — desktop/data-fetch.js).
//  포털 게이트웨이는 새 연결 첫 요청의 약 1/3을 30~57초 붙잡는다(504/503 SERVICETIMEOUT 05) — 다시 쓴 연결은 안 멈췄다(실측).
//  메인 길이 없거나(웹·옛 데스크톱)·프록시 PC·자동 점검이면 내장 헬퍼 /api/kma?u= 프록시로(허용 목록에 *.data.go.kr — 헬퍼 수정 없음).
//  어느 길이든 시도마다 첫 응답 시간 제한을 두고(5·9·15·25초), 시간 초과·게이트웨이 오류면 잠깐 쉬었다 다시 보낸다(dataGet — 최대 4번).
// 인증키 = 개인 설정 우선, 없으면 데스크톱 비공개 번들 기본 키. 작업·프로젝트·알림·콘솔에 그대로 쓰지 않는다(dataMask).
// 불러오기·고르기·패널은 js/data-load.js.

// ★ 주소·오퍼레이션·응답 이름은 여기 한 곳에만 둔다 — 서비스가 바뀌면 여기만 고친다.
//   ✓ = 사용자 키로 실제 응답을 확인함(2026-10-09 밤), ? = 실키로 다시 확인할 것(보고서 '실키로 확인 필요' 목록과 같다).
const DATA_API = {
  site: 'https://www.data.go.kr/',
  life: {
    svc: '기상청_생활기상지수 조회서비스(4.0)',
    base: 'https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/',   // ✓
    ops: { uv: 'getUVIdxV5', air: 'getAirDiffusionIdxV5' },          // ✓ (V4 이름·체감온도 getSenTaIdxV5 는 400 — 쓰지 않음)
    codes: { uv: 'A07_2', air: 'A09' },                                // ✓ 응답 item.code
    issueHours: [6, 18], issueLagMin: 30,                              // ? 발표 시각(06·18시)과 자료가 나오기까지 걸리는 시간 — 후보를 차례로 찾아 견딘다
    probeArea: '1114000000',                                           // 발표 시각 찾기용 구역(서울 중구) ✓ 시군구 areaNo 됨
    areaSuffix: '00000',                                               // 시군구 코드 5자리 + 00000 = areaNo 10자리 — ✓ 자치구, ? 일반구 있는 시(수원시 등)·2026 개편 코드
  },
  dust: {
    svc: '한국환경공단_에어코리아_대기오염통계 현황',
    url: 'https://apis.data.go.kr/B552584/ArpltnStatsSvc/getCtprvnMesureSidoLIst',   // ✓ cityName = 시군구 이름, 등급 없음(값으로 단계)
    sidos: ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'],   // ✓(17) ? 2026 통합 시도 이름
    sidoAlias: { 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산',
      세종특별자치시: '세종', 경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북',
      전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주도: '제주', 제주특별자치도: '제주' },   // 응답 sidoName → 지도 시도 약칭(? 새 이름이 오면 여기에)
    fields: { pm10: 'pm10Value', pm25: 'pm25Value' },                  // ✓
    // ✓(10-10 실측) searchCondition=DAILY 는 '하루 평균'이 아니라 최근 24시간의 시간별 값이다(서울 25곳 × 24시각 ≈ 600줄, '2026-10-09 24:00' 꼴 시각 포함).
    //   그래서 시도마다 DAILY 를 numOfRows 1000 으로 한 번에(1쪽) 받아 1시간 값(가장 최근 시각)과 24시간 평균을 둘 다 만든다 — 1시간 ↔ 24시간 평균은 다시 받지 않는다.
    //   totalCount 가 0 으로 오는 시도(광주·전남)가 있어, 받은 줄이 numOfRows 보다 적으면 마지막 쪽으로 본다(dataGetPages).
    query: { searchCondition: 'DAILY', numOfRows: 1000 },
    conds: { HOUR: '1시간', DAILY: '24시간 평균' },
    fillHours: 3,        // 1시간 값이 비었거나 그 시각 줄이 없으면 이만큼 안의 직전 시각 값(같은 시군구)으로, 그것도 없으면 같은 시군구 24시간 평균으로 — 결과 카드에 표시
    avgMin: 18,          // 24시간 평균은 24칸 중 이만큼(75%) 이상 값이 있을 때만
  },
  dustFcst: {
    svc: '한국환경공단_에어코리아_대기오염정보',
    url: 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth',   // ✓
    codes: { PM10: '미세먼지', PM25: '초미세먼지', O3: '오존' },        // ✓ InformCode
    regionAlias: { 영동: '강원영동', 영서: '강원영서' },                 // ✓ informGrade 의 권역 이름 → 지도 권역
    regionSplit: { 전남광주: ['광주', '전남'], 광주전남: ['광주', '전남'] },   // ? 2026 통합 이름이 오면 둘 다 같은 등급(같은 땅을 나눠 그린 것 — 옮겨 칠하기 아님)
    // ✓(10-10 실측) InformCode 는 무시된다 — 한 날짜 조회에 PM10·PM25·O3 가 늘 함께 온다(28줄 · 약 40KB). 그래서 날짜당 한 번만 받고 종류는 응답에서 고른다.
    //   발표 05·11·17·23시. 05시 발표 전에 '오늘'을 조회하면 0건이라 어제 조회(23시 발표 = 오늘·내일·모레)를 함께 쓴다.
    issueHours: [5, 11, 17, 23],
    notThis: '한국환경공단_에어코리아_고농도 초미세먼지(50초과) 예보 정보',   // ✓ 다른 서비스(B552584/MinuDustFrcstDspthSvc) — 일반 예보가 아님
  },
};
// 미세먼지 예보 권역 19 — 지도(region-map-data.js dustRegion)의 구역 id와 같다(테스트가 비교)
const DUST_REGIONS = ['서울', '인천', '경기북부', '경기남부', '강원영서', '강원영동', '대전', '세종', '충남', '충북', '광주', '전북', '전남', '부산', '대구', '울산', '경북', '경남', '제주'];
const DATA_NAME = { life: '생활기상', dust: '미세먼지 농도', dustFcst: '미세먼지 예보' };
const DATA_SEC_ID = { life: 'life', dust: 'dust', dustFcst: 'dfc' };   // 섹션 → 화면 요소 id 머리(#lifeResult·#dustList·#dfcResult …)

// ── 인증키 ──
const DATA_KEY_STORE = 'wcg_datakey';
// Encoding 키(%2B 등)는 한 번만 풀고, 요청 주소를 만들 때 한 번만 encode한다.
function dataDecodeKey(value) {
  let k = String(value || '').trim();
  if (/%[0-9A-Fa-f]{2}/.test(k)) { try { k = decodeURIComponent(k); } catch (e) { /* 그대로 */ } }
  return k;
}
function dataBuiltinKey() {
  return dataDecodeKey(typeof window !== 'undefined' && window.wcgDesktop && window.wcgDesktop.dataPortalKey);
}
function dataKey() {
  let personal = '';
  try { personal = dataDecodeKey(localStorage.getItem(DATA_KEY_STORE)); } catch (e) { /* 기본 키는 사용 가능 */ }
  return personal || dataBuiltinKey();
}
// 글자 안의 인증키를 가린다 — serviceKey= 값과 키 문자열 자체(풀린 것·encode 된 것) 모두. 결과 카드·알림·콘솔에 쓰기 전에 꼭 거친다.
function dataMask(s) {
  let t = String(s == null ? '' : s).replace(/(serviceKey=)[^&\s"'<]+/gi, '$1***');
  for (const k of new Set([dataKey(), dataBuiltinKey()])) if (k && k.length >= 6) {
    t = t.split(k).join('***');
    try { const e = encodeURIComponent(k); if (e !== k) t = t.split(e).join('***'); } catch (er) { /* 무시 */ }
  }
  return t;
}
// 요청 주소 — serviceKey 를 맨 앞에, 값은 모두 encodeURIComponent 한 번(한글 sidoName·키의 +/= 포함). 빈 값은 뺀다.
function dataUrl(base, params) {
  const q = Object.entries(Object.assign({ serviceKey: dataKey() }, params || {}))
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => k + '=' + encodeURIComponent(String(v)));
  return base + (base.includes('?') ? '&' : '?') + q.join('&');
}

// ── 응답 판정 ──
// 공공데이터포털 결과 코드 → 종류. 코드는 '3'·'03' 둘 다 온다(2자리로 맞춘다).
const DATA_CODE_KIND = {
  '00': 'ok', '03': 'nodata', '01': 'server', '02': 'server', '04': 'server', '05': 'server',
  '10': 'param', '11': 'param', '12': 'noService', '20': 'denied', '21': 'keyBad', '22': 'quota', '23': 'tps',
  '30': 'keyBad', '31': 'keyBad', '32': 'denied', '33': 'keyBad', '99': 'other',
};
const dataCodeKind = (c) => DATA_CODE_KIND[String(c).trim().padStart(2, '0')] || 'other';
// 받은 글 → { kind:'ok', items[], total } | { kind:'nodata', total } | 오류 { kind, code?, detail }. 순수 함수(테스트 대상).
//  JSON(response.header.resultCode — 기상청은 body.items.item[], 에어코리아는 body.items[])·XML 오류(<OpenAPI_ServiceResponse> returnReasonCode)·
//  새 게이트웨이 글자(Unauthorized·API not found)·점검 HTML. 오류 글은 가려서(dataMask) 160자까지만 detail 에.
function dataReadBody(text) {
  const s = String(text == null ? '' : text).replace(/^﻿/, '').trim();
  if (!s) return { kind: 'empty' };
  const cut = (x) => dataMask(String(x)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (s[0] === '{' || s[0] === '[') {
    let j;
    try { j = JSON.parse(s); } catch (e) { return { kind: 'format', detail: cut(s) }; }
    // 게이트웨이 오류는 JSON 으로도 감싸 온다(✓ 10-10: 504/503 {"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"SERVICETIMEOUT_ERROR",…"returnReasonCode":"05"}}})
    const resp = (j && (j.response || j.OpenAPI_ServiceResponse)) || j || {};
    const head = resp.header || resp.cmmMsgHeader || null;
    const code = head && head.resultCode != null ? String(head.resultCode) : (head && head.returnReasonCode != null ? String(head.returnReasonCode) : '');
    if (!code) return { kind: 'format', detail: cut(s) };
    let kind = dataCodeKind(code);
    const msg = String((head && (head.resultMsg || head.returnAuthMsg || head.errMsg)) || '');
    // 생활기상 V5 는 자료 없는 구역 코드에 03 이 아니라 99 '검색결과가 없습니다. [구역]'을 준다(✓ 10-10) — 자료 없음으로(옛 코드로 받기가 이어지게)
    if (kind === 'other' && /검색\s*결과가\s*없|NO_?DATA/i.test(msg)) kind = 'nodata';
    if (kind === 'nodata') return { kind, total: 0, code: code.padStart(2, '0') };
    if (kind !== 'ok') return { kind, code: code.padStart(2, '0'), detail: cut(`${code.padStart(2, '0')} ${msg}`) };
    const body = resp.body || {};
    let items = body.items;
    if (items && !Array.isArray(items) && typeof items === 'object') items = items.item != null ? items.item : [];
    if (items && !Array.isArray(items)) items = typeof items === 'object' ? [items] : [];
    items = (items || []).filter((x) => x && typeof x === 'object');
    const total = +body.totalCount || 0;
    if (!items.length) return { kind: 'nodata', total };
    // totalRaw = 응답이 적은 총건수 그대로(0 = 모름 — 광주·전남 농도는 값이 와도 0 이다 ✓ 10-10)
    return { kind: 'ok', items, total: total || items.length, totalRaw: total };
  }
  if (s[0] === '<') {
    const tag = (n) => { const m = s.match(new RegExp(`<${n}>\\s*([^<]*?)\\s*</${n}>`)); return m ? m[1] : ''; };
    const code = tag('returnReasonCode') || tag('resultCode');
    if (code) {
      const kind = dataCodeKind(code);
      if (kind === 'ok') return { kind: 'format', detail: 'XML 로 왔어요(JSON 을 요청했는데)' };
      return { kind, code: code.padStart(2, '0'), detail: cut(`${code.padStart(2, '0')} ${tag('returnAuthMsg') || tag('errMsg') || tag('resultMsg')}`) };
    }
    return { kind: 'format', detail: cut(s) };
  }
  if (/^unauthorized/i.test(s)) return { kind: 'keyBad', detail: 'Unauthorized' };
  if (/^forbidden/i.test(s)) return { kind: 'denied', detail: 'Forbidden' };
  if (/api not found|no_openapi|not found/i.test(s)) return { kind: 'noService', detail: cut(s) };
  if (/too many|rate limit|limited/i.test(s)) return { kind: 'quota', detail: cut(s) };
  return { kind: 'format', detail: cut(s) };
}
// 공공데이터포털 HTTP 상태 → 종류. 401 = 키 등록 안 됨, 403 = 활용신청 안 함(✓ 확인), 400·404 = 오퍼레이션 이름이 다름(✓ V4·체감온도), 429 = 한도, 5xx = 게이트웨이.
function dataStatusKind(code) {
  if (code === 401) return 'keyBad';
  if (code === 403) return 'denied';
  if (code === 400 || code === 404) return 'noService';
  if (code === 429) return 'quota';
  if (code >= 500) return 'server';
  return 'other';
}
// 헬퍼 /api/kma 가 실패(HTTP 오류)했을 때. status 0 = fetch 자체가 끊김. 헬퍼는 바깥 오류를 502 {"error":"HTTP Error 401: Unauthorized"} 로,
// 연결·시간 초과는 502 {"error":"The read operation timed out"}(파이썬 소켓 문구 그대로) 로 준다 — 시간 초과를 5xx 보다 먼저 본다(10-10: 전엔 '잠시 응답하지 않아요'로 잘못 나왔다).
function dataHttpFail(status, body) {
  const b = String(body == null ? '' : body);
  let msg = b;
  try { const j = JSON.parse(b); if (j && j.error) msg = String(j.error); } catch (e) { /* 글자 그대로 */ }
  msg = dataMask(msg).trim().slice(0, 160);
  if (!status) return { kind: 'helperOff', detail: msg };
  if (status === 404) return { kind: 'helperOld', detail: 'HTTP 404' };
  if (status === 400 && /허용되지 않은/.test(msg)) return { kind: 'helperOld', detail: msg };
  const m = msg.match(/HTTP Error (\d{3})/);
  if (m) return { kind: dataStatusKind(+m[1]), detail: msg };      // 포털이 보낸 HTTP 오류(헬퍼가 감싼 것)
  if (/timed? ?out|timeout|시간 초과/i.test(msg)) return { kind: 'net', detail: msg, timeout: true };
  if (status === 502 || status === 504) return { kind: 'net', detail: msg };   // 헬퍼가 포털에 닿지 못함(연결 오류)
  const k = dataStatusKind(status);
  return { kind: k, detail: msg || ('HTTP ' + status) };
}
// 포털이 직접 준 응답(데스크톱 메인 길) — 오류도 본문(JSON·XML)으로 오므로 먼저 본문을 읽고, 못 읽으면 상태 코드로.
function dataHttpBody(status, text) {
  if (status >= 200 && status < 300) return dataReadBody(text);
  const r = dataReadBody(text);
  if (r.kind !== 'ok' && r.kind !== 'nodata' && r.kind !== 'format' && r.kind !== 'empty') return { ...r, http: status };
  return { kind: dataStatusKind(status), detail: `HTTP ${status}` + (r.detail ? ' ' + r.detail : ''), http: status };
}

// ── 받는 길 · 시간 제한 · 다시 보내기 ──
// 시도마다 첫 응답을 ms[a] 까지 기다린다(늦은 응답일수록 더 오래 — 느린 서버도 끝내 받는다). 실패하면 wait[a] 쉬고 다시.
// 실측(10-10): 정상 응답은 0.2초 안(p50 0.09초), 멈춘 요청은 30초 뒤 504·57초 뒤 503 — 오래 기다려도 소용없고 새로 보내면 대개 바로 온다.
const DATA_TRY = { ms: [5000, 9000, 15000, 25000], wait: [300, 800, 1500] };
// 이번 실행의 받는 길 상태 — desktopOff = 메인 길을 못 써 헬퍼 길로(옛 메인·프록시 PC·자동 점검). sent = 보낸 요청 수(하나 더 보낸 것 포함), retried = 다시 보낸 수.
const dataNet = { desktopOff: false, sent: 0, retried: 0 };
const dataSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dataDesktopFetch = () => { const D = typeof window !== 'undefined' ? window.wcgDesktop : null; return D && typeof D.dataFetch === 'function' && !dataNet.desktopOff ? D : null; };
// 다시 보낼 만한 실패 — 게이트웨이 오류(5xx·01·02·04·05)·연결 끊김·시간 초과·빈 응답. 키·신청·한도·요청 값 오류는 다시 보내도 같다.
const dataRetryable = (r) => !!r && (r.kind === 'server' || r.kind === 'net' || r.kind === 'empty');
// 헬퍼 길 한 번 — 시간 제한은 받는 쪽에서 끊는다(헬퍼는 자기 20초 제한까지 마저 기다렸다 버린다).
async function dataSendHelper(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  const timer = ac ? setTimeout(() => { timedOut = true; ac.abort(); }, ms) : null;
  const late = () => ({ kind: 'net', timeout: true, detail: `${Math.round(ms / 1000)}초 동안 응답이 없어 끊었어요` });
  dataNet.sent++;
  try {
    let r;
    try { r = await fetch(WNS_HELPER + '/api/kma?u=' + encodeURIComponent(url), { cache: 'no-store', signal: ac ? ac.signal : undefined }); }
    catch (e) { return timedOut ? late() : dataHttpFail(0, e && e.message); }
    let t = '';
    try { t = await r.text(); } catch (e) { return timedOut ? late() : { kind: 'net', detail: dataMask(e && e.message) }; }
    if (!r.ok) return dataHttpFail(r.status, t);
    return dataReadBody(t);
  } finally { if (timer) clearTimeout(timer); }
}
// 한 번 보내기 — 데스크톱 메인 길(연결 재사용·늦은 새 연결엔 하나 더) 우선, 못 쓰면 헬퍼 길.
async function dataSendOnce(url, ms) {
  const D = dataDesktopFetch();
  if (D) {
    let x;
    try { x = await D.dataFetch(url, { timeoutMs: ms }); } catch (e) { x = { ok: false, err: 'ipc', detail: String((e && e.message) || e) }; }
    x = x || { ok: false, err: 'ipc' };
    dataNet.sent += Math.max(0, +x.sent || 0);
    if (x.ok) return dataHttpBody(+x.status || 0, x.text);
    if (x.err === 'timeout') return { kind: 'net', timeout: true, detail: `${Math.round(ms / 1000)}초 동안 응답이 없어 끊었어요` + (x.stage === 'body' ? '(받는 중 멈춤)' : '') };
    if (x.err === 'net') return { kind: 'net', detail: dataMask(x.detail || '연결 오류') };
    if (x.err === 'too-big') return { kind: 'format', detail: '응답이 너무 커요' };
    // off(자동 점검)·proxy(프록시 PC)·ipc(옛 메인 — 처리기 없음)는 이번 실행 동안 헬퍼 길로. denied(허용 밖 주소)는 이번 것만.
    if (x.err !== 'denied') dataNet.desktopOff = true;
  }
  return dataSendHelper(url, ms);
}
// 받을 준비 — 데스크톱 메인 길이 있으면 헬퍼를 볼 필요 없다. 아니면 헬퍼가 떠 있는지 한 번(pingHelper). 반환 { up, desktop? }
async function dataReady() {
  if (dataDesktopFetch()) return { up: true, desktop: true };
  return pingHelper();
}
// 한 건 받기 — 시도마다 시간 제한, 다시 보낼 만한 실패면 쉬었다 다시(최대 DATA_TRY.ms.length 번).
// o: { stale()(참이면 다음 시도 안 함 → cancelled), onRetry(번째, 실패) }. 실패 결과엔 tries(보낸 시도 수)를 붙인다.
async function dataGet(url, o) {
  o = o || {};
  const T = DATA_TRY.ms;
  let r = null, a = 0;
  for (; a < T.length; a++) {
    if (a && o.stale && o.stale()) return { kind: 'cancelled' };
    r = await dataSendOnce(url, T[a]);
    if (!dataRetryable(r) || a === T.length - 1) break;
    dataNet.retried++;
    if (o.onRetry) { try { o.onRetry(a + 1, r); } catch (e) { /* 진행 표시 실패는 무시 */ } }
    await dataSleep(DATA_TRY.wait[a] || 1500);
  }
  return r && r.kind !== 'ok' && r.kind !== 'nodata' ? { ...r, tries: a + 1 } : r;
}
// 페이지를 끝까지 받은 뒤에만 적용한다. 중간 오류·반복 페이지·비정상 총건수면 부분 자료로 지도를 덮지 않는다.
// 끝 판정: 총건수(totalRaw)를 알면 그만큼 모였을 때, 모르면(0 — 광주·전남 농도) 받은 줄이 numOfRows 보다 적을 때·다음 쪽이 비었을 때.
// o = dataGet 옵션(onRetry 등).
async function dataGetPages(base, params, stale, o) {
  const items = [], seen = new Set(), per = +((params || {}).numOfRows) || 0;
  let known = false;   // 응답이 총건수를 알려 줬나
  for (let pageNo = 1; pageNo <= 50; pageNo++) {
    if (stale && stale()) return { kind: 'cancelled' };
    const r = await dataGet(dataUrl(base, { ...params, pageNo }), { ...(o || {}), stale });
    if (r.kind === 'cancelled') return r;
    if (r.kind !== 'ok') {
      if (pageNo > 1 && r.kind === 'nodata') return known ? { kind: 'format', detail: '자료를 끝까지 받지 못했어요.' } : { kind: 'ok', items, total: items.length };
      return r;
    }
    const sig = JSON.stringify(r.items);
    if (seen.has(sig)) return { kind: 'format', detail: '같은 자료 페이지가 반복돼요.' };
    seen.add(sig); items.push(...r.items);
    const tot = r.totalRaw != null ? r.totalRaw : r.total;
    known = tot > 0;
    if (tot > 0 ? items.length >= tot : (!per || r.items.length < per)) return { kind: 'ok', items, total: tot > 0 ? tot : items.length };
  }
  return { kind: 'format', detail: '응답 자료가 너무 많아요.' };
}
// 하나라도 나오면 나머지 요청을 멈추는 오류(같은 키·같은 서비스라 다른 구역도 똑같이 실패한다)
const DATA_FATAL = new Set(['keyBad', 'denied', 'quota', 'noService', 'helperOff', 'helperOld']);
// 여러 건 받기 — 동시 limit(기본 4)개, 요청 시작 사이 gap(기본 60ms), 초당 한도(tps)는 0.6·1.2초 뒤 두 번 다시.
// 치명 오류가 나오거나 o.stale()이 참이면 남은 요청을 보내지 않는다(그 칸은 undefined). 반환 { out[], fatal }.
// o.quick(항목) = 참이면 캐시에서 바로 나오는 항목 — 간격을 기다리지 않는다(다시 칠할 때 230곳 × 간격을 헛되이 기다리지 않게).
async function dataPool(list, worker, o) {
  o = o || {};
  const limit = Math.max(1, o.limit || 4), gap = o.gap == null ? 60 : o.gap;
  const out = new Array(list.length);
  let next = 0, done = 0, fatal = null, lastStart = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = async () => {
    while (next < list.length) {
      if (fatal || (o.stale && o.stale())) return;
      const i = next++;
      let quick = false;
      if (o.quick) { try { quick = !!o.quick(list[i], i); } catch (e) { quick = false; } }
      if (!quick) {
        const now = Date.now(), at = Math.max(now, lastStart + gap);
        lastStart = at;
        if (at > now) await sleep(at - now);
      }
      if (fatal || (o.stale && o.stale())) return;
      let r;
      for (let a = 0; ; a++) {
        if (fatal || (o.stale && o.stale())) return;
        try { r = await worker(list[i], i); } catch (e) { r = { kind: 'other', detail: dataMask(e && e.message) }; }
        if (!r || r.kind !== 'tps' || a >= 2) break;
        await sleep(600 * (a + 1));
      }
      out[i] = r; done++;
      if (r && DATA_FATAL.has(r.kind) && !fatal) fatal = r;
      if (o.onStep) { try { o.onStep(done, list.length); } catch (e) { /* 진행 표시 실패는 무시 */ } }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, run));
  return { out, fatal };
}
// 지금 시각(한국 시간)의 날짜·시 — PC 시간대와 상관없이 UTC+9 로 센다. 반환 { y, m, d, h, min, ymd:'YYYY-MM-DD' }
function dataKstNow(now) {
  const t = new Date((now ? +now : Date.now()) + 9 * 3600e3);
  const p = (v) => String(v).padStart(2, '0');
  const o = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes() };
  o.ymd = `${o.y}-${p(o.m)}-${p(o.d)}`;
  return o;
}

// ── 색 단계표 ──
// 값 → 단계: 단계의 max '이하'(30 = 좋음, 31 = 보통). 값은 반올림 뒤 판정. grade 는 등급 이름 그대로.
// 색은 앱 팔레트(RAMPS) 값 위주 — 미세먼지는 환경부 관례(좋음 파랑·보통 초록·나쁨 노랑·매우나쁨 빨강), 자외선은 기상청 관례(초록~보라).
const DATA_SCALES = {
  uv: { name: '자외선지수', unit: '', steps: [
    { k: '낮음', max: 2, range: '0~2', col: '#2ECC4A' }, { k: '보통', max: 5, range: '3~5', col: '#FFCE00' }, { k: '높음', max: 7, range: '6~7', col: '#F57C00' },
    { k: '매우높음', max: 10, range: '8~10', col: '#FA2E1E' }, { k: '위험', max: Infinity, range: '11 이상', col: '#7E3FD0' }] },
  // 대기정체지수 — 낮음25·보통50·높음75·매우높음100(기상자료개방포털 lwiRltmList, 2026-10-10 확인)
  air: { name: '대기정체지수', unit: '', steps: [
    { k: '낮음', max: 25, range: '25', col: '#3A6FEE' }, { k: '보통', max: 50, range: '50', col: '#2ECC4A' },
    { k: '높음', max: 75, range: '75', col: '#FFCE00' }, { k: '매우높음', max: Infinity, range: '100', col: '#FA2E1E' }] },
  pm10: { name: '미세먼지 PM10', unit: '㎍/㎥', steps: [
    { k: '좋음', max: 30, range: '0~30', col: '#3A6FEE' }, { k: '보통', max: 80, range: '31~80', col: '#2ECC4A' },
    { k: '나쁨', max: 150, range: '81~150', col: '#FFCE00' }, { k: '매우나쁨', max: Infinity, range: '151 이상', col: '#FA2E1E' }] },
  pm25: { name: '초미세먼지 PM2.5', unit: '㎍/㎥', steps: [
    { k: '좋음', max: 15, range: '0~15', col: '#3A6FEE' }, { k: '보통', max: 35, range: '16~35', col: '#2ECC4A' },
    { k: '나쁨', max: 75, range: '36~75', col: '#FFCE00' }, { k: '매우나쁨', max: Infinity, range: '76 이상', col: '#FA2E1E' }] },
  grade: { name: '예보 등급', unit: '', steps: [
    { k: '좋음', col: '#3A6FEE' }, { k: '보통', col: '#2ECC4A' }, { k: '나쁨', col: '#FFCE00' }, { k: '매우나쁨', col: '#FA2E1E' }] },
};
// 지도마다 처음 쓰는 단계표(자료를 불러오기 전 손칠·범례 맞추기에도 쓴다)
const DATA_DEF_SCALE = { life: 'uv', dust: 'pm10', dustFcst: 'grade' };
function dataStep(sk, v) {
  const sc = DATA_SCALES[sk]; if (!sc || v == null) return null;
  if (sk === 'grade') return sc.steps.find((p) => p.k === String(v).replace(/\s+/g, '')) || null;
  if (!/^\d+(\.\d+)?$/.test(String(v).trim())) return null;
  const n = Math.round(+v);
  if (!isFinite(n)) return null;
  return sc.steps.find((p) => n <= p.max) || sc.steps[sc.steps.length - 1];
}
// 단계 색 — 단계 목록에서 바꾼 색(S.dataColors[단계표][단계])이 있으면 그것
function dataColOf(sk, k) {
  const o = ((S.dataColors || {})[sk] || {})[k];
  if (o && /^#[0-9A-Fa-f]{6}$/.test(o)) return o.toUpperCase();
  const p = (DATA_SCALES[sk] || { steps: [] }).steps.find((x) => x.k === k);
  return p ? p.col : '#C4C4C4';
}
const dataInfo = (st) => ((S.dataByStyle || {})[st]) || null;
const dataScaleOf = (st) => { const i = dataInfo(st); return (i && i.scale && DATA_SCALES[i.scale]) ? i.scale : DATA_DEF_SCALE[st]; };
// 범례 자동 항목 — 그 지도에 실제로 칠한 단계만 낮은 → 높은 순(손칠도 단계 색이면 나온다)
function dataLegendItems(st) {
  const sk = dataScaleOf(st), sc = DATA_SCALES[sk]; if (!sc) return [];
  const used = new Set(Object.values((S.fillsByStyle || {})[st] || {}).map((c) => String(c || '').toUpperCase()));
  return sc.steps.map((p) => ({ col: dataColOf(sk, p.k), txt: p.k })).filter((it) => used.has(it.col.toUpperCase()));
}
// 범례·타임라인·AE 칠 레이어 이름이 쓰는 '자동 항목' — 데이터 지도면 단계, 아니면 특보 목록(태풍은 부르는 쪽이 따로)
function autoLegendItems() { return curStyle().data ? dataLegendItems(S.style) : wrnLegendItems(); }
// 칠한 곳 수 — 단계 색별(대문자 색 → 수)
function dataFillCounts(st) {
  const n = {};
  for (const c of Object.values((S.fillsByStyle || {})[st] || {})) { const k = String(c || '').toUpperCase(); n[k] = (n[k] || 0) + 1; }
  return n;
}
// 단계별 수 한 줄 — '낮음 12 · 보통 80 · 높음 3'
function dataCountLine(sk, cnt) {
  const sc = DATA_SCALES[sk]; if (!sc) return '';
  return sc.steps.filter((p) => cnt[p.k]).map((p) => `${p.k} ${cnt[p.k]}`).join(' · ');
}
// 이름 목록 줄이기 — '인천 제물포구, 인천 영종구 외 3'
function dataNames(arr, max) {
  const a = Array.isArray(arr) ? arr : [], m = max || 4;
  return a.slice(0, m).map((s) => String(s).replace('/', ' ')).join(', ') + (a.length > m ? ` 외 ${a.length - m}` : '');
}

// ── 결과 카드 ──
// 특보 결과 카드와 같은 모양·규칙(.wrnRes): 정상·0건 = 초록, 칠했지만 확인할 것 = 주황, 실패 = 빨강 + 할 일 버튼(실패면 지도 그대로).
const DATA_ACT_LABEL = { retry: '다시 시도', api: 'API 설정 열기', site: 'data.go.kr 열기', helper: '확장팩 안내 보기', miss: '못 받은 곳만 다시' };
// 결과 → 화면 문구 { tone, title, meta, lines[], detail, actions[{id,label}], toast }. 순수 함수(테스트 대상).
// r: { kind, st, title?, meta?, lines?, tone?(ok일 때 'ok'|'warn'), done?, total?(busy 진행), detail, timeout, desktop, miss?(못 받은 곳 수 — '못 받은 곳만 다시') }
function dataResultView(r) {
  r = r || {};
  const k = r.kind, nm = DATA_NAME[r.st] || '자료', svc = ((DATA_API[r.st] || {}).svc) || '';
  if (k === 'busy') {
    // 진행: r.done / r.total + 단위(r.unit — '곳'·'시도'), r.retried = 늦은 응답을 다시 보낸 수, r.prev = 지금 지도에 칠해 둔 이전 자료 이름(새 자료가 오면 바뀐다)
    const t = r.title || `${nm} 불러오는 중…`;
    const meta = r.total ? `${r.unit ? r.unit + ' ' : ''}${r.done || 0} / ${r.total}` + (r.retried ? ` · 늦은 응답 ${r.retried}건 다시 요청` : '') : (r.meta || '');
    const lines = (r.lines || []).filter(Boolean);
    if (r.prev) lines.push(`지금 지도는 이전 자료(${r.prev}) — 새 자료가 오면 바꿔요.`);
    return { tone: 'busy', title: t, meta, lines, detail: '', actions: [], toast: t };
  }
  if (k === 'ok') {
    const tone = r.tone === 'warn' ? 'warn' : 'ok';
    const title = r.title || `${nm} 불러오기 완료`;
    const acts = r.miss ? [{ id: 'miss', label: DATA_ACT_LABEL.miss }] : [];
    return { tone, title, meta: r.meta || '', lines: (r.lines || []).filter(Boolean), detail: r.detail || '', actions: acts, toast: title };
  }
  if (k === 'nodata') {
    const title = r.title || `${nm} — 아직 자료가 없어요`;
    return { tone: 'ok', title, meta: r.meta || '', lines: (r.lines && r.lines.length ? r.lines : ['오류가 아니에요. 발표 뒤 자료가 올라오면 다시 눌러 주세요.']).concat('지도 색은 바꾸지 않았어요.'),
      detail: '', actions: [{ id: 'retry', label: DATA_ACT_LABEL.retry }], toast: title };
  }
  if (k === 'moved') {
    const title = '지도 종류가 바뀌어 칠하지 않았어요';
    return { tone: 'warn', title, meta: '', lines: [`자료는 들어온 구분 그대로 ‘${nm}’ 지도에만 칠해요. 그 지도에서 다시 불러와 주세요.`], detail: '', actions: [], toast: title };
  }
  const F = {
    key: () => ({ title: '공공데이터포털 인증키가 없어요',
      todo: `오른쪽 아래 ‘API 설정’에 공공데이터포털(data.go.kr) 일반 인증키(Decoding)를 넣어 주세요. 이 자료는 ‘${svc}’ 활용신청이 필요해요.`, actions: ['api', 'site'] }),
    keyBad: () => ({ title: '인증키가 등록되지 않았거나 맞지 않아요',
      todo: '발급·활용신청 직후면 1시간쯤 뒤에 다시 해 보세요. ‘API 설정’에 일반 인증키(Decoding)를 넣었는지 확인해 주세요.', actions: ['api', 'retry'] }),
    denied: () => ({ title: '이 서비스를 활용신청하지 않았어요',
      todo: `data.go.kr 에서 ‘${svc}’를 활용신청한 뒤 다시 눌러 주세요(같은 인증키로 돼요).` + (r.st === 'dustFcst' ? ` ‘${DATA_API.dustFcst.notThis}’는 다른 서비스예요.` : ''), actions: ['site', 'api', 'retry'] }),
    quota: () => ({ title: '오늘 요청 한도를 넘었어요',
      todo: '개발계정은 하루 요청 수가 정해져 있어요(기상청 10,000건 · 에어코리아 500건). 내일 다시 하거나 data.go.kr 에서 운영계정을 신청해 주세요.', actions: ['site'] }),
    tps: () => ({ title: '요청이 너무 잦다고 막혔어요', todo: '잠시 뒤 다시 눌러 주세요.', actions: ['retry'] }),
    noService: () => ({ title: '서비스·오퍼레이션 이름이 달라요',
      todo: `data.go.kr 에서 ‘${svc}’를 신청했는지 확인해 주세요. 비슷한 이름의 다른 서비스를 신청했거나 서비스 주소가 바뀌었을 수 있어요.`, actions: ['site', 'retry'] }),
    param: () => ({ title: '요청 값이 맞지 않는다고 해요', todo: '서비스의 요청 규칙이 바뀌었을 수 있어요. 아래 기술 정보를 개발자에게 알려 주세요.', actions: ['retry'] }),
    server: () => ({ title: '공공데이터포털이 잠시 응답하지 않아요', todo: (r.tries > 1 ? `${r.tries}번 다시 보냈지만 포털 쪽이 계속 답하지 않았어요. ` : '') + '1~2분 뒤 다시 눌러 주세요.', actions: ['retry'] }),
    net: () => ({ title: r.timeout ? '응답이 너무 늦어요' : '공공데이터포털에 연결되지 않아요',
      todo: (r.tries > 1 ? `${r.tries}번 다시 보냈지만 답이 없었어요. ` : '') + (r.timeout ? '포털이 붐비는 때일 수 있어요. 잠시 뒤 다시 눌러 주세요.' : '인터넷(사내망) 연결을 확인하고 잠시 뒤 다시 눌러 주세요.'), actions: ['retry'] }),
    helperOff: () => ({ title: r.desktop ? '내장 기능 확장팩이 응답하지 않아요' : '기능 확장팩이 꺼져 있어요',
      todo: r.desktop ? '앱을 완전히 닫았다가 다시 실행한 뒤 다시 눌러 주세요.' : '‘확장팩 안내 보기’대로 WNS_START를 한 번 실행한 뒤 다시 눌러 주세요.', actions: ['helper', 'retry'] }),
    helperOld: () => ({ title: '기능 확장팩이 옛 버전이에요', todo: r.desktop ? '앱을 최신 버전으로 업데이트한 뒤 다시 눌러 주세요.' : 'WNS_START를 다시 실행하면 최신으로 바뀝니다.', actions: ['helper', 'retry'] }),
    empty: () => ({ title: '빈 응답이 왔어요', todo: '잠시 뒤 다시 눌러 주세요.', actions: ['retry'] }),
    format: () => ({ title: '응답 형식이 달라 읽지 못했어요', todo: '서비스가 점검 중이거나 응답 모양이 바뀌었을 수 있어요. 잠시 뒤 다시 해 보세요.', actions: ['retry'] }),
    other: () => ({ title: '알 수 없는 문제가 생겼어요', todo: '잠시 뒤 다시 눌러 주세요.', actions: ['retry'] }),
  };
  const f = (F[k] || F.other)();
  const title = k === 'key' ? f.title : `불러오지 못했어요 — ${f.title}`;
  const lines = [f.todo];
  if (k !== 'key') lines.push('지도 색은 바꾸지 않았어요 — 이전 그대로입니다.');
  return { tone: k === 'key' ? 'warn' : 'err', title, meta: '', lines, detail: r.detail ? `기술 정보: ${dataMask(r.detail)}` : '', actions: f.actions.map((id) => ({ id, label: DATA_ACT_LABEL[id] })), toast: title };
}
// 결과 카드 그리기(#lifeResult·#dustResult·#dfcResult). r=null 이면 숨김. quiet = 알림(#status)은 안 띄움(진행 숫자만 바꿀 때).
// r.retry·r.missRetry = 할 일 버튼이 부를 함수.
function showDataResult(st, r, quiet) {
  const box = document.getElementById(DATA_SEC_ID[st] + 'Result'); if (!box) return;
  if (!r) { box.hidden = true; box.textContent = ''; delete box.dataset.tone; delete box.dataset.kind; return; }
  const v = dataResultView({ ...r, st, desktop: typeof WNS_DESKTOP !== 'undefined' && WNS_DESKTOP });
  box.dataset.tone = v.tone; box.dataset.kind = r.kind;
  box.innerHTML = `<div class="wrnResIc">${WRN_ICON[v.tone] || WRN_ICON.info}</div>` +
    '<div class="wrnResBody"><div class="wrnResT"></div><div class="wrnResM"></div><ul class="wrnResL"></ul><div class="wrnResD"></div><div class="wrnResA"></div></div>';
  box.querySelector('.wrnResT').textContent = v.title;
  const put = (sel, txt) => { const n = box.querySelector(sel); if (txt) n.textContent = txt; else n.remove(); };
  put('.wrnResM', v.meta); put('.wrnResD', v.detail);
  const ul = box.querySelector('.wrnResL');
  for (const line of v.lines) { const li = document.createElement('li'); li.textContent = line; ul.append(li); }
  if (!v.lines.length) ul.remove();
  const acts = box.querySelector('.wrnResA');
  const run = {
    retry: () => { if (r.retry) r.retry(); },
    miss: () => { if (r.missRetry) r.missRetry(); },
    api: () => apiPop(true, 'data'),
    site: () => window.open(DATA_API.site, '_blank', 'noopener'),
    helper: () => wnsHelperOffNotice(),
  };
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

// ── 진행 중 요청·메모리 캐시 ──
// 불러오기 차례 번호(겹치면 마지막 것만 칠한다)와 받은 응답 캐시(시각만·품목만 바꿀 땐 다시 받지 않는다 — 한도 아끼기).
// 캐시는 자료마다 유효 시각을 따로 준다(dataCachePut 의 ms — 농도는 다음 정시 자료가 올라올 때까지, 예보는 다음 발표까지, 생활기상은 발표가 바뀌지 않으므로 길게).
// 불러오기가 도중에 무효가 돼도(지도 전환·종류 바꿈) 받은 응답은 캐시한다 — 다시 누르면 바로 칠한다.
const dataSeq = { life: 0, dust: 0, dustFcst: 0 };
const dataCache = new Map();   // 키 → { at(ms), until(ms), r }
const DATA_CACHE_MS = 10 * 60e3;
function dataCacheGet(k) { const c = dataCache.get(k); if (!c) return null; if (Date.now() >= c.until) { dataCache.delete(k); return null; } return c.r; }
function dataCachePut(k, r, ms) { if (dataCache.size > 3000) dataCache.clear(); const at = Date.now(); dataCache.set(k, { at, until: at + (ms > 0 ? ms : DATA_CACHE_MS), r }); }
// 다른 작업을 열거나 새로 시작할 때(resetWorkRuntime) — 진행 중인 불러오기는 버리고 결과 카드를 비운다. 캐시는 남긴다(같은 자료).
function dataResetRuntime(resetPicks) {
  for (const st of Object.keys(dataSeq)) { dataSeq[st]++; showDataResult(st, null); }
  if (resetPicks) {
    Object.assign(dataPick.life, { idx: 'uv', labels: false });
    Object.assign(dataPick.dust, { item: 'pm10', cond: 'HOUR', labels: false });
    Object.assign(dataPick.dustFcst, { code: 'PM10', past: false, labels: false });
  }
}

// ── 단계 목록(사이드바) ──
// 색 칸 = 그 단계 색 바꾸기(칠·라벨·애니 트랙이 함께), 이름 줄 = 칠하기 색으로 집기(손으로 칠할 때 단계 색 그대로). 오른쪽 = 칠한 곳 수.
function dataStepsFill(st) {
  const box = document.getElementById(DATA_SEC_ID[st] + 'List'); if (!box) return;
  const sk = dataScaleOf(st), sc = DATA_SCALES[sk];
  box.textContent = '';
  if (!sc) return;
  const cnt = dataFillCounts(st);
  const head = document.createElement('div'); head.className = 'dataStepsHead';
  head.textContent = sc.name + (sc.unit ? ` (${sc.unit})` : '') + ' 단계';
  box.append(head);
  for (const p of sc.steps) {
    const col = dataColOf(sk, p.k);
    const row = document.createElement('div'); row.className = 'dataStep';
    const sw = document.createElement('input'); sw.type = 'color'; sw.className = 'dataSw'; sw.value = col.toLowerCase();
    sw.title = `‘${p.k}’ 색 바꾸기`; sw.setAttribute('aria-label', `${p.k} 색`);
    sw.onchange = () => dataRecolor(st, sk, p.k, sw.value);
    const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'dataStepPick';
    pick.title = `‘${p.k}’ 색으로 손칠하기`;
    const b = document.createElement('b'); b.textContent = p.k;
    const r = document.createElement('span'); r.className = 'dataStepRange'; r.textContent = p.range ? p.range : '';
    pick.append(b, r);
    pick.onclick = () => { activeColor = col; markActive(); status(`칠할 색: ${p.k} ${col}`); };
    const n = document.createElement('span'); n.className = 'dataStepN'; const c = cnt[col.toUpperCase()] || 0; n.textContent = c ? `${c}곳` : '—';
    row.append(sw, pick, n);
    box.append(row);
  }
}
// 단계 색 바꾸기 — 그 지도에서 옛 색으로 칠한 칸·그 지도 자료 라벨·애니 트랙 색을 새 색으로(통보문 색 목록 recolorBul 과 같은 규칙)
function dataRecolor(st, sk, k, newCol) {
  newCol = String(newCol || '').toUpperCase();
  const oldCol = dataColOf(sk, k).toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(newCol) || newCol === oldCol) return;
  pushUndo();
  ((S.dataColors ||= {})[sk] ||= {})[k] = newCol;
  const F = ((S.fillsByStyle ||= {})[st] ||= {});
  for (const id in F) if (String(F[id] || '').toUpperCase() === oldCol) F[id] = newCol;
  for (const b of S.labels || []) if (b.data === st && String(b.fill || '').toUpperCase() === oldCol) { b.fill = newCol; b.txtCol = dataLabelTxtCol(newCol); }
  if (S.style === st) for (const tr of anim().tracks) if (tr.kind === 'fill' && String(tr.key || '').toUpperCase() === oldCol) tr.key = newCol;
  dataAfterPaint(st);
  status(`${k} 색 바꿈 ${oldCol} → ${newCol}`);
}
// 칠·라벨이 바뀐 뒤 공통 — 화면·범례·타임라인·패널·자동 저장
function dataAfterPaint(st) {
  if (S.style === st) { renderFills(); renderAll(); refreshPanel(); }
  syncDataPanels();
  saveWork();
}

// ── 수치 라벨 ──
// 생활기상·미세먼지 농도 = 주요 도시(구역 id → 이름). 예보 권역은 19곳 모두. 자리 = 그 구역(가장 큰 조각)의 가운데.
const DATA_CITY_ZONES = [['서울', '서울/중구'], ['춘천', '강원/춘천시'], ['강릉', '강원/강릉시'], ['청주', '충북/청주시'], ['홍성', '충남/홍성군'], ['대전', '대전/서구'],
  ['전주', '전북/전주시'], ['광주', '광주/서구'], ['목포', '전남/목포시'], ['대구', '대구/중구'], ['안동', '경북/안동시'], ['울산', '울산/남구'], ['부산', '부산/연제구'], ['제주', '제주/제주시'],
  ['인천', '인천/남동구'], ['수원', '경기/수원시'], ['세종', '세종/세종시'], ['창원', '경남/창원시']];
const dataLabelTxtCol = (fill) => (lum(String(fill || '#000000')) > 0.62 ? '#1B1B1B' : '#FFFFFF');
function dataZoneCenter(id) {
  const arr = zoneEls.get(id); if (!arr || !arr.length) return null;
  let best = null, ba = -1;
  for (const { el: e } of arr) { const r = zoneRectRoot(e); const a = (r.x1 - r.x0) * (r.y1 - r.y0); if (a > ba) { ba = a; best = r; } }
  return best ? { x: Math.round((best.x0 + best.x1) / 2), y: Math.round((best.y0 + best.y1) / 2) } : null;
}
// 그 지도의 자료 라벨을 다시 만든다 — items = [{ id(구역), title(윗줄 이름), txt(값·등급), fill }]. 지도가 그 지도일 때만(구역 자리가 있어야).
// 자료 라벨은 b.data = 지도 키 표시가 붙어 다시 불러오면 바뀐다. 손으로 만든 라벨·통보문 라벨은 안 건드린다. 반환 = 만든 수.
function dataMakeLabels(st, items) {
  S.labels = (S.labels || []).filter((b) => b.data !== st);
  let n = 0;
  if (S.style !== st) return 0;
  for (const it of items || []) {
    const c = dataZoneCenter(it.id); if (!c) continue;
    S.labels.push(newLabel({ txt: String(it.txt), title: it.title || '', x: c.x, y: c.y, fill: it.fill, txtCol: dataLabelTxtCol(it.fill), data: st,
      size: 26, padX: 10, padY: 6, titleRatio: 0.7 }));
    n++;
  }
  return n;
}
// 지도를 바꿀 때(setStyle) 자료 라벨을 맡겨 둔다 — 라벨(S.labels)은 지도 종류 사이에 같이 쓰는 '내용'이라, 생활기상 지도의 자외선 라벨이
// 미세먼지 지도에 따라오면 '다른 구분으로 옮겨 칠하기'가 된다. 떠나는 지도의 자료 라벨은 S.dataByStyle[그 지도].labelsAway 에 두고,
// 들어가는 지도의 맡긴 라벨은 되돌린다(옮긴 자리·고친 글자 그대로). 되돌리기·저장은 S 통째라 함께 따라간다.
function dataLabelsSwap(prev, next) {
  if (prev === next) return;
  const D = (S.dataByStyle ||= {});
  const keep = [], away = {};
  for (const b of S.labels || []) { if (b && b.data && b.data !== next) (away[b.data] ||= []).push(b); else keep.push(b); }
  for (const [k, arr] of Object.entries(away)) { const i = (D[k] ||= {}); i.labelsAway = (i.labelsAway || []).concat(arr); }
  const back = (D[next] && D[next].labelsAway) || [];
  if (D[next]) delete D[next].labelsAway;
  const ids = new Set(keep.map((b) => b.id));
  S.labels = keep.concat(back.filter((b) => b && !ids.has(b.id)));
}
