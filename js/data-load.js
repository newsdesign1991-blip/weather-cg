/* [모듈] js/data-load.js — 데이터 지도 불러오기(10-10): 생활기상(fetchLife — 시군구 230 × 기상청 생활기상지수)·미세먼지 농도(fetchDust — 시도 17 × 에어코리아 시군구 평균의 최근 24시간 → 1시간 값(빈 값은 같은 시군구의 3시간 안 직전 값·24시간 평균)·24시간 평균, 못 받은 시도만 다시)·미세먼지 예보(fetchDustFcst — 예보 권역 19 등급, 날짜당 한 번·05시 전 오늘은 어제 발표 함께), 파서·칠하기·시각/발표/예보일 고르기, 패널 배선(setupDataPanels)·동기화(syncDataPanels) */
'use strict';

// ===================== 데이터 지도 불러오기 =====================
// 세 자료 모두 같은 흐름(js/data-maps.js 공통):
//  키 없음 → 안내 카드 + API 설정 열기 / 불러오는 중 카드 + 작업 중 효과(js/busy-fx.js) / 헬퍼 확인(pingHelper — 한 번) / 받기 / 판정
//  → 다른 지도로 바뀌었으면 칠하지 않음(들어오는 구분 그대로 — 옮겨 칠하기 금지) → pushUndo · S.fillsByStyle[지도] · S.dataByStyle[지도] · 라벨 · 범례 · 자동 저장.
// S.dataByStyle[지도] = 마지막으로 불러온 자료와 고른 옵션(칠을 다시 만들 만큼만 — 시각·품목·예보일을 바꾸면 다시 받지 않고 다시 칠한다).
//  life:     { at, idx:'uv'|'air', scale, base:'YYYYMMDDHH', slot(칸 번호 — h = slot×3), vals:{ 구역: [h0,h3,…,h75] }, alt:{ 구역: 옛 코드 }, miss:[구역], labels }
//  dust:     { at, item:'pm10'|'pm25', scale, cond:'HOUR'|'DAILY'(24시간 평균), dataTime(기준 시각 글자), latestNo(정시 번호), span[24시간 처음, 끝],
//              vals:{ 구역: [pm10, pm25] }(1시간 — 채운 값 포함), fill:{ 구역: [원래 시각(정시 번호)|'avg'(24시간 평균)|null, …] }, avg:{ 구역: […] }(24시간 평균), avgN:{ 구역: [칸 수, …] },
//              why:{ 구역: ['absent'|'old'|'blank'|null, …] }, via:{ 구역: '중구·동구 평균' }, miss, unknown, noSido, labels }   (10-10 전 자료엔 avg·fill·why 없음 — 그대로 칠한다)
//  dustFcst: { at, code:'PM10'|'PM25'|'O3', scale:'grade', date:'YYYY-MM-DD'(조회일), past, yday(오늘 조회에 어제 발표를 보탰나), issues[], issue, day, fc:{ 발표: { 예보일: { grades, overall, unknown } } }, labels }
// 손으로 칠하기는 그대로 된다(자료 없이도 — 단계 목록 이름을 누르면 단계 색을 집는다).

// 고른 옵션(불러오기 전) — 자료가 있으면 자료 쪽을 따른다(syncDataPanels)
const dataPick = { life: { idx: 'uv', labels: false }, dust: { item: 'pm10', cond: 'HOUR', labels: false }, dustFcst: { code: 'PM10', past: false, labels: false } };
const DATA_WD = ['일', '월', '화', '수', '목', '금', '토'];

// 시군구 구역 목록(생활기상·미세먼지 농도 지도 공용 — 인셋 조각은 한 구역) [{ id, sido, zone, code, altCodes, altNames }]
let _dataAreas = null;
function dataAreas() {
  if (_dataAreas) return _dataAreas;
  const st = MAP.styles.life || MAP.styles.dust;
  const out = [], seen = new Map();
  if (st) for (const z of st.zones) {
    let a = seen.get(z.id);
    if (!a) { a = { id: z.id, sido: z.sido || String(z.id).split('/')[0], zone: z.zone || String(z.id).split('/')[1] || '', code: z.code || '', altCodes: [], altNames: [] }; seen.set(z.id, a); out.push(a); }
    if (z.alt) {
      for (const c of z.alt.codes || []) if (!a.altCodes.includes(c)) a.altCodes.push(c);
      for (const n of z.alt.names || []) if (!a.altNames.includes(n)) a.altNames.push(n);
    }
  }
  return (_dataAreas = out);
}
// 처음 불러오는 자료면(이 작업·이 지도) 범례를 켠다 — 범례 자동 항목 = 칠한 단계
function dataLegendFirst(st) { if (!dataInfo(st) || !dataInfo(st).at) { const g = (S.legend ||= {}); if (!g.on) g.on = 1; } }
// 불러오기 공통 시작 — 키·헬퍼 확인. 반환 null = 계속, 아니면 끝낼 값(false = 못 함)
function dataNeedKey(st, retry) {
  if (dataKey()) return null;
  apiPop(true, 'data');
  showDataResult(st, { kind: 'key', retry });
  return false;
}

// ===================== 생활기상(자외선·대기정체) =====================
// 기상청 생활기상지수 4.0(DATA_API.life) — 구역(areaNo 10자리)마다 한 건, 응답 h0~h75(3시간 간격) 예측값.
// 발표 시각 후보(06·18시 발표 + 30분 뒤부터) — 지금(한국 시간)에서 가까운 것부터 3개. 'YYYYMMDDHH'
function lifeBaseTimes(now) {
  const L = DATA_API.life, k = dataKstNow(now);
  const p = (v) => String(v).padStart(2, '0');
  const at = (dDay, h) => { const t = new Date(Date.UTC(k.y, k.m - 1, k.d + dDay, h)); return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}`; };
  const mins = k.h * 60 + k.min, hs = L.issueHours.slice().sort((a, b) => a - b), lag = L.issueLagMin;
  const out = [];
  for (let dDay = 0; out.length < 3 && dDay > -4; dDay--) {
    for (let i = hs.length - 1; i >= 0 && out.length < 3; i--) {
      if (dDay === 0 && hs[i] * 60 + lag > mins) continue;
      out.push(at(dDay, hs[i]));
    }
  }
  return out;
}
// 응답 한 줄 → { areaNo, date, code, vals[26] } — hN 칸을 N/3 자리에(빈 글·숫자 아님 = null). 대기정체는 h0 이 없고 h3 부터(✓).
function lifeParseItem(it) {
  const vals = new Array(26).fill(null);
  for (const [k, v] of Object.entries(it || {})) {
    const m = /^h(\d{1,2})$/.exec(k); if (!m) continue;
    const h = +m[1]; if (h % 3 || h > 75) continue;
    const s = String(v == null ? '' : v).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) continue;
    vals[h / 3] = +s;
  }
  return { areaNo: String((it && it.areaNo) || ''), date: String((it && it.date) || ''), code: String((it && it.code) || ''), vals };
}
function lifeReadArea(r, areaNo, base, idx) {
  if (r.kind !== 'ok') return r;
  const it = r.items.find((x) => String(x.areaNo) === areaNo && String(x.date) === base && String(x.code) === DATA_API.life.codes[idx]);
  if (!it) return { kind: 'format', detail: '요청한 구역·발표 시각·지수와 응답이 달라요.' };
  const p = lifeParseItem(it);
  return p.vals.some((v) => v != null) ? { kind: 'ok', vals: p.vals } : { kind: 'nodata' };
}
// 새 코드에 값이 없으면 옛 구역 전부를 확인한다. 합쳐진 구역은 시간칸별 평균, 나뉜 구역은 같은 원자료 값.
async function lifeAreaValues(a, base, idx, get, stale) {
  const L = DATA_API.life;
  const read = async (code) => lifeReadArea(await get(code + L.areaSuffix, base), code + L.areaSuffix, base, idx);
  const direct = await read(a.code);
  if (direct.kind !== 'nodata' && direct.kind !== 'param') return direct;
  const got = [], codes = [];
  for (const code of a.altCodes) {
    if (stale()) return { kind: 'cancelled' };
    const r = await read(code);
    if (r.kind === 'ok') { got.push(r.vals); codes.push(code); }
    else if (r.kind !== 'nodata' && r.kind !== 'param') return r;
  }
  if (!got.length) return { kind: 'nodata' };
  const vals = Array.from({ length: 26 }, (_, i) => {
    const xs = got.map((v) => v[i]).filter((v) => v != null);
    return xs.length ? Math.round(xs.reduce((n, v) => n + v, 0) / xs.length) : null;
  });
  return { kind: 'ok', vals, alt: codes.join('·') + (codes.length > 1 ? ' 평균' : '') };
}
// 발표 시각 + h시간 → { d, h, wd, label:'10일(금) 12시' } (한국 시간 그대로 — base 는 한국 시각)
function lifeSlotTime(base, h) {
  const b = String(base || '');
  const t = new Date(Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8), +b.slice(8, 10) + h));
  const o = { d: t.getUTCDate(), h: t.getUTCHours(), wd: DATA_WD[t.getUTCDay()] };
  o.label = `${o.d}일(${o.wd}) ${String(o.h).padStart(2, '0')}시`;
  return o;
}
// 고를 수 있는 시각 — 값이 절반 이상 구역에 있는 칸만. [{ i, h, label, n }]
function lifeSlots(base, valsList) {
  const list = (valsList || []).filter(Boolean), n = list.length, out = [];
  if (!n) return out;
  for (let i = 0; i < 26; i++) {
    let c = 0; for (const v of list) if (v[i] != null) c++;
    if (c * 2 >= n) out.push({ i, h: i * 3, label: lifeSlotTime(base, i * 3).label, n: c });
  }
  return out;
}
// 처음 고를 시각 — 자외선 = 처음 오는 12시(하루 중 가장 셀 때), 없으면 첫 칸 / 대기정체 = 첫 칸
function lifeDefaultSlot(idx, base, slots) {
  if (!slots.length) return 0;
  if (idx === 'uv') { const s = slots.find((x) => lifeSlotTime(base, x.h).h === 12); if (s) return s.i; }
  return slots[0].i;
}
// 칠 만들기 — 고른 시각의 값 → 단계 색. 반환 { F, cnt(단계 → 수) }
function lifePaintPlan(info) {
  const F = {}, cnt = {}, sk = info.scale;
  for (const [id, arr] of Object.entries(info.vals || {})) {
    const v = arr ? arr[info.slot] : null; if (v == null) continue;
    const p = dataStep(sk, v); if (!p) continue;
    F[id] = dataColOf(sk, p.k); cnt[p.k] = (cnt[p.k] || 0) + 1;
  }
  return { F, cnt };
}
// 주요 도시 수치 라벨 항목
function lifeLabelItems(info) {
  const out = [];
  for (const [nm, id] of DATA_CITY_ZONES) {
    const arr = (info.vals || {})[id]; const v = arr ? arr[info.slot] : null; if (v == null) continue;
    const p = dataStep(info.scale, v); if (!p) continue;
    out.push({ id, title: nm, txt: String(v), fill: dataColOf(info.scale, p.k) });
  }
  return out;
}
// 칠하기(+ 라벨) — 자료(info)를 S.dataByStyle.life 에 두고 칠을 만든다. pushUndo 는 부르는 쪽.
// 데이터별 제목·단위(사용자 10-10: 자외선·대기정체 등을 칠하면 제목도 그에 맞게). 표준 제목일 때만 바꾼다(bulletin.js autoTitleTexts)
function dataTitleFor(st, info) {
  if (st === 'life') return info.idx === 'uv' ? ['자외선 지수', '단위 : 지수'] : ['대기정체 지수', '단위 : 지수'];
  if (st === 'dust') return [(info.item === 'pm25' ? '초미세먼지 농도' : '미세먼지 농도') + (info.cond === 'DAILY' ? ' (24시간 평균)' : ''), '단위 : ㎍/㎥'];
  if (st === 'dustFcst') return [info.code === 'O3' ? '오존 예보' : info.code === 'PM25' ? '초미세먼지 예보' : '미세먼지 예보', '단위 : 등급'];
  return null;
}
function dataAutoTitle(st, info) {
  const tu = dataTitleFor(st, info);
  if (tu && autoTitleTexts(tu[0], tu[1]) && typeof renderTexts === 'function') renderTexts();
}
function lifeApply(info) {
  dataAutoTitle('life', info);
  const { F, cnt } = lifePaintPlan(info);
  (S.dataByStyle ||= {}).life = info;
  S.fillsByStyle.life = F;
  if (info.labels) dataMakeLabels('life', lifeLabelItems(info)); else S.labels = (S.labels || []).filter((b) => b.data !== 'life');
  return cnt;
}
// [기상청에서 불러오기] — 반환: 칠했으면 true, 못 했으면 false, 더 새 요청에 밀렸으면 null.
// only = 이 구역들만 다시 받기(결과 카드 '못 받은 곳만 다시' — 지난 자료에 덧붙인다)
async function fetchLife(only) {
  const st = 'life', again = () => fetchLife(only);
  const seq = ++dataSeq[st], revision = _workRev;
  const stale = () => seq !== dataSeq[st] || revision !== _workRev || S.style !== st;
  const stop = dataNeedKey(st, again); if (stop !== null) return stop;
  const idx = (only && dataInfo(st) && dataInfo(st).idx) || dataPick.life.idx;
  const L = DATA_API.life, op = L.ops[idx];
  const fail = (f) => { if (stale()) return null; showDataResult(st, { ...f, retry: again }); return false; };
  const prev0 = dataInfo(st), prevLabel = prev0 && prev0.at && prev0.base ? lifeIssueLabel(prev0.base) : '';
  let retried = 0;
  showDataResult(st, { kind: 'busy', prev: prevLabel });
  const fx = [fxSec(st), $('#lifeFetch'), $('#lifeList')];
  fxBusy(fx, true, { lines: 5, maxMs: 240000 });
  let ok = false;
  try {
    const hp = await dataReady();
    if (stale()) return null;
    if (!hp.up) { fail({ kind: 'helperOff' }); wnsHelperOffNotice(); return false; }
    // 한 발표의 값은 바뀌지 않는다 — 받은 응답은 6시간 캐시(불러오기가 도중에 무효가 돼도 — 다시 누르면 바로)
    const get = async (areaNo, base) => {
      const ck = `life|${idx}|${base}|${areaNo}`;
      let r = dataCacheGet(ck);
      if (!r) { r = await dataGet(dataUrl(L.base + op, { pageNo: 1, numOfRows: 10, dataType: 'JSON', areaNo, time: base }), { stale, onRetry: () => { retried++; } }); if (r.kind === 'ok') dataCachePut(ck, r, 6 * 3600e3); }
      return r;
    };
    // 1) 발표 시각 찾기 — 한 구역으로 후보를 차례로(자료 없음이면 다음 후보). 다시 받기(only)는 지난 발표 그대로.
    let base = only && dataInfo(st) ? dataInfo(st).base : '';
    if (!base) {
      for (const b of lifeBaseTimes()) {
        const r = lifeReadArea(await get(L.probeArea, b), L.probeArea, b, idx);
        if (stale()) return null;
        if (r.kind === 'ok') { base = b; break; }
        if (r.kind !== 'nodata') return fail(r);
      }
    }
    if (!base) { if (!stale()) showDataResult(st, { kind: 'nodata', retry: again, title: '생활기상 — 아직 발표된 자료가 없어요' }); return false; }
    // 2) 구역마다(옛 코드 차례로) — 동시 4건
    const areas = only ? dataAreas().filter((a) => only.includes(a.id)) : dataAreas();
    const worker = (a) => lifeAreaValues(a, base, idx, get, stale);
    const onStep = (done, total) => { if (!stale() && (done % 10 === 0 || done === total)) showDataResult(st, { kind: 'busy', unit: '시군구', done, total, retried, prev: prevLabel }, true); };
    const quick = (a) => !!a.code && !!dataCacheGet(`life|${idx}|${base}|${a.code}${L.areaSuffix}`);   // 이미 받은 구역은 간격 없이
    const { out, fatal } = await dataPool(areas, worker, { stale, onStep, gap: 30, quick });
    if (stale()) return null;
    if (fatal) return fail(fatal);
    const vals = only && dataInfo(st) && dataInfo(st).vals ? { ...dataInfo(st).vals } : {};
    const alt = only && dataInfo(st) && dataInfo(st).alt ? { ...dataInfo(st).alt } : {};
    const miss = [], errs = [];
    areas.forEach((a, i) => {
      const r = out[i];
      if (r && r.kind === 'ok' && r.vals.some((v) => v != null)) { vals[a.id] = r.vals; if (r.alt) alt[a.id] = r.alt; else delete alt[a.id]; }
      else { miss.push(a.id); if (r && r.kind !== 'nodata') errs.push(r); }
    });
    if (only) for (const id of (dataInfo(st).miss || [])) if (!only.includes(id) && !vals[id]) miss.push(id);
    if (!Object.keys(vals).length) return fail(errs[0] || { kind: 'nodata' });
    // 3) 들어오는 구분 그대로 — 그새 다른 지도로 바뀌었으면 칠하지 않는다
    if (S.style !== st) { showDataResult(st, { kind: 'moved' }); status('지도 종류가 바뀌어 생활기상을 칠하지 않았어요', true, 'warn'); return false; }
    const prev = dataInfo(st);
    const slots = lifeSlots(base, Object.values(vals));
    if (!slots.length) return fail({ kind: 'nodata' });
    const keepSlot = prev && prev.at && prev.base === base && prev.idx === idx && slots.some((s) => s.i === prev.slot);
    const info = { at: new Date().toISOString(), idx, scale: idx, base, slot: keepSlot ? prev.slot : lifeDefaultSlot(idx, base, slots), vals, alt, miss,
      labels: prev && prev.at ? !!prev.labels : !!dataPick.life.labels };
    pushUndo();
    dataLegendFirst(st);
    const cnt = lifeApply(info);
    dataAfterPaint(st);
    ok = true;
    showDataResult(st, lifeResultOk(info, cnt, areas.length, errs));
    return true;
  } catch (e) {
    return fail({ kind: 'other', detail: e && e.message });
  } finally {
    fxBusy(fx, false);
    if (!ok && seq === dataSeq[st]) { if (stale()) showDataResult(st, null); syncDataPanels(); }
    if (ok) fxArrive([fxSec(st), $('#lifeResult'), ...fxRows($('#lifeList'))]);
  }
}
// 발표 이름 — '10월 9일 18시 발표'
function lifeIssueLabel(base) { const b = lifeSlotTime(base, 0); return `${+String(base).slice(4, 6)}월 ${b.d}일 ${String(b.h).padStart(2, '0')}시 발표`; }
// 정상 결과 카드 문구
function lifeResultOk(info, cnt, asked, errs) {
  const total = dataAreas().length, painted = Object.values(cnt).reduce((s, n) => s + n, 0);
  const nm = DATA_SCALES[info.scale].name, b = lifeSlotTime(info.base, 0), at = lifeSlotTime(info.base, info.slot * 3);
  const lines = [`시군구 ${total}곳 중 ${painted}곳 칠함`, '단계: ' + (dataCountLine(info.scale, cnt) || '없음')];
  const alts = Object.keys(info.alt || {});
  if (alts.length) lines.push(`옛 구역 코드로 받은 곳: ${dataNames(alts, 3)}`);
  if (info.miss.length) lines.push(`못 받은 곳(비워 둠): ${dataNames(info.miss, 4)}`);
  if (errs.length) lines.push(`일부 요청이 실패했어요 — ‘못 받은 곳만 다시’로 다시 받을 수 있어요`);
  return { kind: 'ok', tone: info.miss.length ? 'warn' : 'ok', title: `생활기상 — ${nm} 칠함`,
    meta: `기상청 ${+info.base.slice(4, 6)}월 ${b.d}일 ${String(b.h).padStart(2, '0')}시 발표 · ${at.label} 값`, lines,
    miss: info.miss.length, missRetry: () => fetchLife(info.miss.slice()), retry: () => fetchLife() };
}
// 시각 바꾸기 — 다시 받지 않고 다시 칠한다
function lifeSetSlot(i) {
  const info = dataInfo('life'); if (!info || !info.vals || +i === info.slot) return;
  if (S.style !== 'life' || !lifeSlots(info.base, Object.values(info.vals)).some((s) => s.i === +i)) return;
  pushUndo();
  const next = { ...info, slot: +i };
  lifeApply(next);
  dataAfterPaint('life');
  showDataResult('life', lifeResultOk(next, lifePaintPlan(next).cnt, 0, []), true);
  const at = lifeSlotTime(next.base, next.slot * 3);
  status(`생활기상 — ${at.label} 값으로 다시 칠함`);
}

// ===================== 미세먼지 농도(시군구 평균) =====================
// 에어코리아 대기오염통계 현황(DATA_API.dust) — 시도마다 한 건(17건). items[] = 시군구 평균(cityName = 시군구 이름 그대로 ✓)의
// 최근 24시간 시간별 값(searchCondition=DAILY ✓ 10-10 — '하루 평균'이 아니다). 등급은 없어 값으로 단계.
// 한 번 받으면 1시간 값(가장 최근 시각)과 24시간 평균을 둘 다 만든다 — 1시간 ↔ 24시간 평균·PM10 ↔ PM2.5 는 다시 받지 않는다.
const dustNum = (s) => { const t = String(s == null ? '' : s).trim(); return /^\d+(\.\d+)?$/.test(t) ? Math.round(+t) : null; };
const dustSidoOf = (s) => { const t = String(s == null ? '' : s).trim(); return DATA_API.dust.sidoAlias[t] || t; };
// 측정 시각 'YYYY-MM-DD HH:MM'('2026-10-09 24:00' 도 온다 ✓) → 정시 번호(한국 시각 그대로 센 시간 수). 못 읽으면 NaN
function dustHourNo(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2})/.exec(String(t == null ? '' : t).trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]) / 3600e3 : NaN;
}
// 정시 번호 → '10일 04시'
function dustHourLabel(n) { const t = new Date(n * 3600e3); return `${t.getUTCDate()}일 ${String(t.getUTCHours()).padStart(2, '0')}시`; }
// 받은 줄들(여러 시각) → 시군구별 값. 순수 함수(테스트 대상).
// 맞추기: ① 시도 + 시군구 이름 ② districtCode(5자리)가 구역 코드 ③ 옛 이름(2026 개편 전 — 합쳐졌으면 그 시각 평균, 나뉘었으면 같은 값). 못 맞춘 이름은 unknown.
// 기준 시각 = 맞춘 줄 중 가장 최근 시각(o.at = 정시 번호로 정할 수도 — '못 받은 시도만 다시'가 지난 자료와 같은 시각을 쓰게).
// 1시간 값: 기준 시각 값. 비었거나 그 시각 줄이 없으면 같은 시군구의 fillHours(3) 시간 안 직전 값 — fill[구역] = 원래 시각(정시 번호),
//   그 안에도 없으면 같은 시군구의 24시간 평균(18칸 이상일 때) — fill = 'avg'. 이웃·시도 값은 쓰지 않는다(옮겨 칠하기 금지).
// 24시간 평균: 기준 시각까지 24칸 중 avgMin(18) 칸 이상 값이 있을 때만(avgN = 값 있는 칸 수). 빈 곳은 비워 두고 까닭(why)을 남긴다.
// 반환 { dataTime, latestNo, span[처음, 끝], vals{구역:[pm10,pm25]}, fill{구역:[시각|'avg'|null,…]}, avg{구역:[…]}, avgN{구역:[n10,n25]}(평균이 안 된 칸이 있는 곳만),
//        why{구역:['absent'(응답에 없음)|'old'(최근 몇 시간 자료 없음)|'blank'(측정값 빈칸)|null, …]}(1시간 값이 빈 곳만), via, miss, unknown }
function dustMatch(items, areas, o) {
  const D = DATA_API.dust, F = D.fields;
  const fillH = o && o.fillHours != null ? o.fillHours : D.fillHours, avgMin = o && o.avgMin != null ? o.avgMin : D.avgMin;
  const byKey = new Map(), byCode = new Map(), byAlt = new Map();
  for (const a of areas) {
    byKey.set(a.sido + '/' + a.zone, a);
    if (a.code) byCode.set(a.code, a);
    for (const n of a.altNames || []) { if (!byAlt.has(n)) byAlt.set(n, []); byAlt.get(n).push(a); }
  }
  const direct = new Map(), viaAlt = new Map(), altNm = new Map(), unknown = [], timeStr = new Map();
  const put = (id, h, v) => { let s = direct.get(id); if (!s) direct.set(id, s = new Map()); const p = s.get(h); s.set(h, p ? [p[0] != null ? p[0] : v[0], p[1] != null ? p[1] : v[1]] : v); };
  let latest = -Infinity;
  for (const it of items || []) {
    const sido = dustSidoOf(it.sidoName), city = String(it.cityName || '').trim();
    if (!city) continue;
    const h = dustHourNo(it.dataTime); if (!Number.isFinite(h)) continue;
    const v = [dustNum(it[F.pm10]), dustNum(it[F.pm25])];
    let a = byKey.get(sido + '/' + city) || null;
    if (!a) { const dc = String(it.districtCode == null ? '' : it.districtCode).trim(); if (/^\d{5}$/.test(dc)) a = byCode.get(dc) || null; }
    if (a) put(a.id, h, v);
    else {
      const alts = byAlt.get(sido + '/' + city);
      if (!alts) { unknown.push(`${sido} ${city}`); continue; }
      for (const b of alts) {
        let s = viaAlt.get(b.id); if (!s) viaAlt.set(b.id, s = new Map());
        if (!s.has(h)) s.set(h, []);
        s.get(h).push(v);
        if (!altNm.has(b.id)) altNm.set(b.id, new Set());
        altNm.get(b.id).add(city);
      }
    }
    if (h > latest) latest = h;
    if (!timeStr.has(h)) timeStr.set(h, String(it.dataTime).trim());
  }
  if (o && Number.isFinite(o.at)) latest = o.at;
  const vals = {}, fill = {}, avg = {}, avgN = {}, why = {}, via = {};
  const mean = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  for (const a of areas) {
    let s = direct.get(a.id) || null;
    if (!s && viaAlt.has(a.id)) {
      s = new Map();
      for (const [h, list] of viaAlt.get(a.id)) s.set(h, [0, 1].map((k) => mean(list.map((v) => v[k]).filter((x) => x != null))));
      const nm = [...altNm.get(a.id)];
      via[a.id] = nm.join('·') + (nm.length > 1 ? ' 평균' : ' 값');
    }
    if (!s || !Number.isFinite(latest)) { why[a.id] = ['absent', 'absent']; continue; }
    const cur = [null, null], src = [null, null], w = [null, null], av = [null, null], n = [0, 0];
    for (const k of [0, 1]) {
      for (let h = latest; h >= latest - fillH; h--) { const v = s.get(h); if (v && v[k] != null) { cur[k] = v[k]; src[k] = h; break; } }
      const xs = [];
      for (let h = latest - 23; h <= latest; h++) { const v = s.get(h); if (v && v[k] != null) xs.push(v[k]); }
      n[k] = xs.length;
      if (xs.length >= avgMin) av[k] = mean(xs);
      if (cur[k] == null && av[k] != null) { cur[k] = av[k]; src[k] = 'avg'; }   // 측정이 몇 시간 끊긴 곳(실측: 양양군) — 같은 곳 24시간 평균
      if (cur[k] == null) w[k] = s.has(latest) ? 'blank' : 'old';
    }
    if (cur[0] != null || cur[1] != null) vals[a.id] = cur;
    if (src.some((h) => h != null && h !== latest)) fill[a.id] = src.map((h) => (h != null && h !== latest ? h : null));
    if (w[0] || w[1]) why[a.id] = w;
    if (av[0] != null || av[1] != null) avg[a.id] = av;
    if (n[0] < avgMin || n[1] < avgMin) avgN[a.id] = n;
  }
  const miss = areas.filter((a) => !vals[a.id]).map((a) => a.id);
  const lbl = (h) => timeStr.get(h) || (Number.isFinite(h) ? dustHourLabel(h) : '');
  return { dataTime: lbl(latest), latestNo: Number.isFinite(latest) ? latest : null, span: [lbl(latest - 23), lbl(latest)],
    vals, fill, avg, avgN, why, via, miss, unknown: [...new Set(unknown)] };
}
// 칠할 값 — 24시간 평균이면 avg(옛 자료엔 없어 vals), 아니면 1시간 값
const dustValsOf = (info) => (info && info.cond === 'DAILY' && info.avg ? info.avg : (info && info.vals)) || {};
function dustPaintPlan(info) {
  const F = {}, cnt = {}, sk = info.item, k = info.item === 'pm25' ? 1 : 0;
  for (const [id, arr] of Object.entries(dustValsOf(info))) {
    const v = arr ? arr[k] : null; if (v == null) continue;
    const p = dataStep(sk, v); if (!p) continue;
    F[id] = dataColOf(sk, p.k); cnt[p.k] = (cnt[p.k] || 0) + 1;
  }
  return { F, cnt };
}
function dustLabelItems(info) {
  const out = [], k = info.item === 'pm25' ? 1 : 0, V = dustValsOf(info);
  for (const [nm, id] of DATA_CITY_ZONES) {
    const arr = V[id]; const v = arr ? arr[k] : null; if (v == null) continue;
    const p = dataStep(info.item, v); if (!p) continue;
    out.push({ id, title: nm, txt: String(v), fill: dataColOf(info.item, p.k) });
  }
  return out;
}
function dustApply(info) {
  info.scale = info.item;
  dataAutoTitle('dust', info);
  const { F, cnt } = dustPaintPlan(info);
  (S.dataByStyle ||= {}).dust = info;
  S.fillsByStyle.dust = F;
  if (info.labels) dataMakeLabels('dust', dustLabelItems(info)); else S.labels = (S.labels || []).filter((b) => b.data !== 'dust');
  return cnt;
}
// 시도 응답 캐시 유효 — 다음 정시 자료가 올라올 때까지(기준 시각 + 1시간 15분 — 실측 04시 자료가 04:25 전에 있었다). 지났는데 아직이면 3분마다 다시 확인.
function dustTtl(items, now) {
  let latest = -Infinity;
  for (const it of items || []) { const h = dustHourNo(it.dataTime); if (h > latest) latest = h; }
  if (!Number.isFinite(latest)) return 3 * 60e3;
  const nowNo = ((now ? +now : Date.now()) + 9 * 3600e3) / 3600e3;   // 한국 시각 정시 번호(dustHourNo 와 같은 눈금)
  return Math.round(Math.min(75 * 60e3, Math.max(3 * 60e3, (latest + 1.25 - nowNo) * 3600e3)));
}
// [에어코리아에서 불러오기] — only = 이 시도들만 다시 받기(결과 카드 '못 받은 곳만 다시' — 지난 자료에 같은 기준 시각으로 덧붙인다)
async function fetchDust(only) {
  const st = 'dust', again = () => fetchDust(only);
  const seq = ++dataSeq[st], revision = _workRev;
  const stale = () => seq !== dataSeq[st] || revision !== _workRev || S.style !== st;
  const stop = dataNeedKey(st, again); if (stop !== null) return stop;
  const D = DATA_API.dust, prev0 = dataInfo(st);
  const part = !!(only && prev0 && prev0.at && prev0.vals && prev0.avg && Number.isFinite(prev0.latestNo));
  const sidos = part ? D.sidos.filter((s) => only.includes(s)) : D.sidos;
  const cond = part ? prev0.cond : dataPick.dust.cond, item = part ? prev0.item : dataPick.dust.item;
  const fail = (f) => { if (stale()) return null; showDataResult(st, { ...f, retry: again }); return false; };
  const prevLabel = prev0 && prev0.at && prev0.dataTime ? `${prev0.dataTime} 기준` : '';
  let retried = 0, doneNow = 0;
  const busy = () => { if (!stale()) showDataResult(st, { kind: 'busy', unit: '시도', done: doneNow, total: sidos.length, retried, prev: prevLabel }, true); };
  showDataResult(st, { kind: 'busy', unit: '시도', done: 0, total: sidos.length, prev: prevLabel });
  const fx = [fxSec(st), $('#dustFetch'), $('#dustList')];
  fxBusy(fx, true, { lines: 4, maxMs: 120000 });
  let ok = false;
  try {
    const hp = await dataReady();
    if (stale()) return null;
    if (!hp.up) { fail({ kind: 'helperOff' }); wnsHelperOffNotice(); return false; }
    // 시도 하나 = 한 번(DAILY · numOfRows 1000 → 1쪽). 받은 응답은 다음 정시 자료까지 캐시(불러오기가 도중에 무효가 돼도).
    const worker = async (sido) => {
      const ck = `dust|${sido}`;
      let r = dataCacheGet(ck);
      if (!r) {
        r = await dataGetPages(D.url, { returnType: 'json', ...D.query, sidoName: sido }, stale, { onRetry: () => { retried++; busy(); } });
        if (r.kind === 'ok') dataCachePut(ck, r, dustTtl(r.items));
      }
      return r;
    };
    const onStep = (done) => { doneNow = done; busy(); };
    const { out, fatal } = await dataPool(sidos, worker, { stale, onStep, quick: (sido) => !!dataCacheGet(`dust|${sido}`) });
    if (stale()) return null;
    if (fatal) return fail(fatal);
    const items = [], got = [], noSido = [], errs = [];
    sidos.forEach((s, i) => { const r = out[i]; if (r && r.kind === 'ok') { items.push(...r.items); got.push(s); } else { noSido.push(s); if (r && r.kind !== 'nodata') errs.push(r); } });
    if (!items.length) return fail(errs[0] || { kind: 'nodata' });
    const areas = dataAreas().filter((a) => got.includes(a.sido));
    const m = dustMatch(items, areas, part ? { at: prev0.latestNo } : null);
    if (!part && !Object.keys(m.vals).length && !Object.keys(m.avg).length) return fail({ kind: 'format', detail: '시군구 이름을 하나도 맞추지 못했어요' });
    if (S.style !== st) { showDataResult(st, { kind: 'moved' }); status('지도 종류가 바뀌어 미세먼지 농도를 칠하지 않았어요', true, 'warn'); return false; }
    const prev = dataInfo(st);
    let info;
    if (part) {
      // 다시 받은 시도의 구역만 바꾼다(기준 시각은 지난 자료 그대로)
      const ids = new Set(areas.map((a) => a.id));
      const keep = (x) => Object.fromEntries(Object.entries(x || {}).filter(([id]) => !ids.has(id)));
      info = { ...prev0, at: new Date().toISOString(),
        vals: { ...keep(prev0.vals), ...m.vals }, fill: { ...keep(prev0.fill), ...m.fill }, avg: { ...keep(prev0.avg), ...m.avg },
        avgN: { ...keep(prev0.avgN), ...m.avgN }, why: { ...keep(prev0.why), ...m.why }, via: { ...keep(prev0.via), ...m.via },
        unknown: [...new Set((prev0.unknown || []).filter((u) => !got.includes(u.split(' ')[0])).concat(m.unknown))],
        noSido: (prev0.noSido || []).filter((s) => !got.includes(s)).concat(noSido.filter((s) => !(prev0.noSido || []).includes(s))) };
      info.miss = dataAreas().filter((a) => !info.vals[a.id]).map((a) => a.id);
    } else {
      info = { at: new Date().toISOString(), item, scale: item, cond, dataTime: m.dataTime, latestNo: m.latestNo, span: m.span,
        vals: m.vals, fill: m.fill, avg: m.avg, avgN: m.avgN, why: m.why, via: m.via, miss: m.miss, unknown: m.unknown, noSido,
        labels: prev && prev.at ? !!prev.labels : !!dataPick.dust.labels };
    }
    if (!Object.keys(dustPaintPlan(info).F).length) {
      if (cond === 'DAILY') return fail({ kind: 'nodata', title: '24시간 평균을 낼 만큼 자료가 없어요', lines: ['24칸 중 18칸 이상 값이 있는 시군구가 없어요. ‘1시간’으로 칠해 보세요.'] });
      return fail({ kind: 'nodata' });
    }
    pushUndo();
    dataLegendFirst(st);
    const cnt = dustApply(info);
    dataAfterPaint(st);
    ok = true;
    showDataResult(st, dustResultOk(info, cnt));
    return true;
  } catch (e) {
    return fail({ kind: 'other', detail: e && e.message });
  } finally {
    fxBusy(fx, false);
    if (!ok && seq === dataSeq[st]) { if (stale()) showDataResult(st, null); syncDataPanels(); }
    if (ok) fxArrive([fxSec(st), $('#dustResult'), ...fxRows($('#dustList'))]);
  }
}
// 빈 곳 까닭(쉬운 말)
function dustWhyText(info, id, vi, daily) {
  if (daily) {
    const n = ((info.avgN || {})[id] || [])[vi];
    if (n == null) return '응답에 없음';
    return n ? `24시간 중 ${n}시간만 측정` : '24시간 측정값 없음';
  }
  const w = ((info.why || {})[id] || [])[vi];
  return w === 'absent' ? '응답에 없음' : w === 'old' ? `최근 ${DATA_API.dust.fillHours}시간 자료 없음` : w === 'blank' ? '측정값 빈칸' : '값 없음';
}
function dustResultOk(info, cnt) {
  const total = dataAreas().length, painted = Object.values(cnt).reduce((s, n) => s + n, 0);
  const vi = info.item === 'pm25' ? 1 : 0, daily = info.cond === 'DAILY' && !!info.avg, V = dustValsOf(info);
  const nm = (id) => String(id).replace('/', ' ');
  const lines = [`시군구 ${total}곳 중 ${painted}곳 칠함`, '단계: ' + (dataCountLine(info.item, cnt) || '없음')];
  // 보충한 곳 — 그 시각 값이 비어 같은 시군구의 직전 시각 값(3시간 안)·24시간 평균으로 칠한 곳(1시간)
  if (!daily) {
    const filled = Object.entries(info.fill || {}).filter(([id, f]) => f && f[vi] != null && V[id] && V[id][vi] != null);
    const how = (f) => (f === 'avg' ? '24시간 평균' : `${dustHourLabel(f)} 값`);
    if (filled.length) lines.push(`빈 값을 같은 시군구 값으로 채운 곳 ${filled.length}곳: ` + filled.slice(0, 3).map(([id, f]) => `${nm(id)}(${how(f[vi])})`).join(', ') + (filled.length > 3 ? ` 외 ${filled.length - 3}` : ''));
  }
  const vias = Object.entries(info.via || {});
  if (vias.length) lines.push('옛 구역 값으로 칠함: ' + vias.slice(0, 3).map(([id, w]) => `${nm(id)}(${w})`).join(', ') + (vias.length > 3 ? ` 외 ${vias.length - 3}` : ''));
  const blank = dataAreas().filter((a) => !(V[a.id] && V[a.id][vi] != null) && !(info.noSido || []).includes(a.sido));
  if (blank.length) lines.push(`비워 둔 곳 ${blank.length}곳: ` + blank.slice(0, 4).map((a) => `${nm(a.id)}(${dustWhyText(info, a.id, vi, daily)})`).join(', ') + (blank.length > 4 ? ` 외 ${blank.length - 4}` : ''));
  if (info.noSido.length) lines.push(`못 받은 시도: ${info.noSido.join(', ')} — ‘못 받은 곳만 다시’로 그 시도만 다시 받아요`);
  if (info.unknown.length) lines.push(`지도에 없는 이름(칠 안 함): ${dataNames(info.unknown, 3)}`);
  const meta = daily ? `에어코리아 ${(info.span || [])[0] || ''} ~ ${(info.span || [])[1] || info.dataTime} · 24시간 평균`
    : `에어코리아 ${info.dataTime || '시각 모름'} 기준 · 1시간 값`;   // 10-10 전 자료(평균 없음)는 '하루 평균'이어도 실제로는 최근 시각 값이었다
  return { kind: 'ok', tone: blank.length || info.noSido.length || info.unknown.length ? 'warn' : 'ok', title: `미세먼지 농도 — ${DATA_SCALES[info.item].name} 칠함`,
    meta, lines, miss: info.noSido.length, missRetry: () => fetchDust(info.noSido.slice()), retry: () => fetchDust() };
}
// 품목(PM10 ↔ PM2.5) 바꾸기 — 받은 값 그대로 다시 칠한다
function dustSetItem(item) {
  if (S.style !== 'dust' || !['pm10', 'pm25'].includes(item)) return;
  if (dataPick.dust.item !== item) { dataSeq.dust++; showDataResult('dust', null); }
  dataPick.dust.item = item;
  const info = dataInfo('dust');
  if (!info || !info.vals || info.item === item) { syncDataPanels(); return; }
  pushUndo();
  const cnt = dustApply({ ...info, item });
  dataAfterPaint('dust');
  showDataResult('dust', dustResultOk(dataInfo('dust'), cnt), true);
  status(`미세먼지 농도 — ${DATA_SCALES[item].name}로 다시 칠함`);
}
// 기준(1시간 ↔ 24시간 평균) 바꾸기 — 받은 자료에 둘 다 있으면 다시 받지 않고 다시 칠한다(옛 자료엔 평균이 없어 다시 받는다 — 캐시가 있으면 바로)
function dustSetCond(cond) {
  if (S.style !== 'dust' || !DATA_API.dust.conds[cond]) return;
  if (dataPick.dust.cond !== cond) { dataSeq.dust++; showDataResult('dust', null); }
  dataPick.dust.cond = cond;
  const info = dataInfo('dust');
  if (!info || !info.at || !info.vals || info.cond === cond) { syncDataPanels(); return; }
  if (!info.avg) { if (dataKey()) fetchDust(); return; }
  pushUndo();
  const cnt = dustApply({ ...info, cond });
  dataAfterPaint('dust');
  showDataResult('dust', dustResultOk(dataInfo('dust'), cnt), true);
  status(`미세먼지 농도 — ${DATA_API.dust.conds[cond]}으로 다시 칠함`);
}

// ===================== 미세먼지 예보(예보 권역 등급) =====================
// 에어코리아 대기오염정보 getMinuDustFrcstDspth(DATA_API.dustFcst) — 조회일 하루에 여러 발표(05·11·17·23시)·여러 예보일(오늘·내일·모레)이 섞여 온다(✓).
// informGrade = '서울 : 나쁨,제주 : 좋음,…,영동 : 좋음,영서 : 보통' → 권역 19.
function dfcGrades(str) {
  const grades = {}, unknown = [];
  const known = new Set(DUST_REGIONS), A = DATA_API.dustFcst;
  for (const m of String(str || '').matchAll(/([^,:]+?)\s*:\s*(좋음|보통|나쁨|매우\s*나쁨|예보\s*없음)/g)) {
    const raw = m[1].trim(), gr = m[2].replace(/\s+/g, '');
    const names = A.regionSplit[raw] || [A.regionAlias[raw] || raw];
    for (const n of names) { if (known.has(n)) grades[n] = gr; else unknown.push(raw); }
  }
  return { grades, unknown: [...new Set(unknown)] };
}
// 발표 문자열('2026-10-09 17시 발표') → 정렬 숫자 YYYYMMDDHH
const dfcIssueKey = (s) => { const m = /(\d{4})-(\d{2})-(\d{2})\s*(\d{1,2})/.exec(String(s || '')); return m ? +(m[1] + m[2] + m[3] + m[4].padStart(2, '0')) : 0; };
// 받은 줄들 → { issues[](최신 먼저), byIssue: { 발표: { 예보일: { grades, overall, unknown } } } }. 순수 함수.
function dfcParse(items) {
  const byIssue = {};
  for (const it of items || []) {
    const issue = String(it.dataTime || '').trim(), day = String(it.informData || '').trim();
    if (!issue || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const g = dfcGrades(it.informGrade);
    if (!dfcIssueKey(issue) || !Object.keys(g.grades).length) continue;
    (byIssue[issue] ||= {})[day] = { issue, grades: g.grades, unknown: g.unknown, overall: String(it.informOverall || '').replace(/\s+/g, ' ').trim().slice(0, 400) };
  }
  const issues = Object.keys(byIssue).sort((a, b) => dfcIssueKey(b) - dfcIssueKey(a));
  const latest = {};
  for (const issue of issues) for (const [day, forecast] of Object.entries(byIssue[issue])) if (!latest[day]) latest[day] = forecast;
  return { issues, byIssue, latest };
}
// 예보일 이름 — 발표일 기준 오늘·내일·모레 + '10.10(금)'
function dfcDayLabel(issue, day) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(issue || '')), d = /(\d{4})-(\d{2})-(\d{2})/.exec(String(day || ''));
  if (!d) return String(day || '');
  const t = Date.UTC(+d[1], +d[2] - 1, +d[3]), wd = DATA_WD[new Date(t).getUTCDay()];
  const off = m ? Math.round((t - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 864e5) : NaN;
  const rel = ['오늘', '내일', '모레', '글피'][off] || '';
  return `${rel ? rel + ' ' : ''}${+d[2]}.${+d[3]}(${wd})`;
}
// 처음 고를 예보일 — 17·23시 발표면 내일(있으면), 아니면 오늘(없으면 첫 날)
function dfcDefaultDay(issue, days) {
  if (!days.length) return '';
  const h = dfcIssueKey(issue) % 100;
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(issue || '');
  if (m) {
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]) + (h >= 17 ? 864e5 : 0), x = new Date(t);
    const want = `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
    if (days.includes(want)) return want;
  }
  return days[0];
}
const dfcDays = (info, issue) => Object.keys(((info && info.fc) || {})[issue] || {}).sort();
function dfcCur(info) { return (((info && info.fc) || {})[info.issue] || {})[info.day] || null; }
function dfcDisplayIssue(info) { return (dfcCur(info) || {}).issue || info.issue; }
// 오늘·내일 이름의 기준 날 — '예보일별 최신'이면 조회일(오늘 조회에 어제 발표를 보태도 '오늘'이 오늘이게), 발표를 골랐으면 그 발표일
function dfcRefDay(info, issue) { const iss = issue || info.issue; return iss === '__LATEST__' ? (info.date || dfcDisplayIssue(info)) : iss; }
function dfcPaintPlan(info) {
  const F = {}, cnt = {}, cur = dfcCur(info), none = [];
  if (cur) for (const r of DUST_REGIONS) {
    const g = cur.grades[r];
    if (!g || g === '예보없음') { none.push(r); continue; }
    const p = dataStep('grade', g); if (!p) continue;
    F[r] = dataColOf('grade', p.k); cnt[p.k] = (cnt[p.k] || 0) + 1;
  }
  return { F, cnt, none };
}
function dfcLabelItems(info) {
  const cur = dfcCur(info), out = [];
  if (cur) for (const r of DUST_REGIONS) { const g = cur.grades[r]; const p = g && dataStep('grade', g); if (p) out.push({ id: r, title: r, txt: p.k, fill: dataColOf('grade', p.k) }); }
  return out;
}
function dfcApply(info) {
  info.scale = 'grade';
  dataAutoTitle('dustFcst', info);
  const plan = dfcPaintPlan(info);
  (S.dataByStyle ||= {}).dustFcst = info;
  S.fillsByStyle.dustFcst = plan.F;
  if (info.labels) dataMakeLabels('dustFcst', dfcLabelItems(info)); else S.labels = (S.labels || []).filter((b) => b.data !== 'dustFcst');
  return plan;
}
// 조회일 응답 캐시 유효 — 지난 날짜는 바뀌지 않는다(어제 6시간·그 전 24시간). 오늘은 다음 발표 시각(05·11·17·23시)까지,
// 그 시각이 지났는데 그 발표가 아직 없으면 3분마다 다시 확인. 빈 응답(지난 날짜)은 10분.
function dfcTtl(date, items, now) {
  const t = now ? +now : Date.now(), k = dataKstNow(t), hrs = DATA_API.dustFcst.issueHours;
  if (date < k.ymd) return (items || []).length ? (date === dataKstNow(t - 864e5).ymd ? 6 * 3600e3 : 24 * 3600e3) : 10 * 60e3;
  const mins = k.h * 60 + k.min;
  const due = hrs.filter((h) => h * 60 <= mins).pop();   // 지금쯤 올라와 있어야 할 가장 늦은 발표
  const have = Math.max(-1, ...(items || []).filter((it) => String(it.dataTime || '').startsWith(date)).map((it) => dfcIssueKey(it.dataTime) % 100));
  if (due != null && have < due) return 3 * 60e3;
  const next = hrs.find((h) => h * 60 > mins);
  return Math.max(60e3, ((next != null ? next * 60 : 24 * 60) - mins) * 60e3);
}
// 조회일 하나 받기(캐시). 종류(PM10·PM25·O3)는 한 응답에 다 들어 있다(✓ InformCode 무시) — 날짜당 한 번, 종류를 바꿔도 다시 받지 않는다.
async function dfcGetDay(date, stale, onRetry) {
  const ck = `dfc|${date}`;
  let r = dataCacheGet(ck);
  if (r) return r;
  r = await dataGetPages(DATA_API.dustFcst.url, { returnType: 'json', numOfRows: 100, searchDate: date }, stale, { onRetry });
  if (r.kind === 'ok' || r.kind === 'nodata') dataCachePut(ck, r, dfcTtl(date, r.kind === 'ok' ? r.items : []));
  return r;
}
// [에어코리아에서 불러오기] — 고른 종류(PM10·PM25·O3)·날짜(오늘 / 지난 날짜 = 그날 발표한 것)
async function fetchDustFcst() {
  const st = 'dustFcst', again = () => fetchDustFcst();
  const seq = ++dataSeq[st], revision = _workRev;
  const stale = () => seq !== dataSeq[st] || revision !== _workRev || S.style !== st;
  const stop = dataNeedKey(st, again); if (stop !== null) return stop;
  const A = DATA_API.dustFcst, code = dataPick.dustFcst.code;
  const today = dataKstNow().ymd, yday = dataKstNow(Date.now() - 864e5).ymd;
  const past = !!dataPick.dustFcst.past && /^\d{4}-\d{2}-\d{2}$/.test(($('#dfcDate') && $('#dfcDate').value) || '');
  const date = past ? $('#dfcDate').value : today;
  const fail = (f) => { if (stale()) return null; showDataResult(st, { ...f, retry: again }); return false; };
  const prev0 = dataInfo(st), prevLabel = prev0 && prev0.at && prev0.fc ? dfcDisplayIssue(prev0) : '';
  showDataResult(st, { kind: 'busy', prev: prevLabel });
  const onRetry = (n) => { if (!stale()) showDataResult(st, { kind: 'busy', meta: `응답이 늦어 다시 요청하는 중 (${n + 1}번째)`, prev: prevLabel }, true); };
  const fx = [fxSec(st), $('#dfcFetch'), $('#dfcList')];
  fxBusy(fx, true, { lines: 4, maxMs: 90000 });
  let ok = false;
  try {
    const hp = await dataReady();
    if (stale()) return null;
    if (!hp.up) { fail({ kind: 'helperOff' }); wnsHelperOffNotice(); return false; }
    const mineOf = (list) => list.filter((x) => !x.informCode || String(x.informCode).toUpperCase() === code);
    const r = await dfcGetDay(date, stale, onRetry);
    if (stale()) return null;
    if (r.kind !== 'ok' && r.kind !== 'nodata') return fail(r);
    let items = r.kind === 'ok' ? r.items : [], usedYday = false;
    // 오늘: 05시 발표 전엔 오늘 조회가 비어 있다(✓ 10-10 04시) — 어제 조회(23시 발표 = 오늘·내일·모레)를 함께 쓴다
    if (!past && !mineOf(items).some((x) => String(x.informData || '').trim() === today)) {
      const y = await dfcGetDay(yday, stale, onRetry);
      if (stale()) return null;
      if (y.kind === 'ok') { items = items.concat(y.items); usedYday = true; }
      else if (!items.length && y.kind !== 'nodata') return fail(y);
    }
    const cname = A.codes[code] || code, mine = mineOf(items);
    if (!mine.length) { showDataResult(st, { kind: 'nodata', retry: again, title: `${cname} 예보가 이날 없어요`, meta: `조회일 ${date}`,
      lines: [code === 'O3' ? '오류가 아니에요. 오존 예보는 철(대개 4~10월)에만 나와요.' : '오류가 아니에요. 그날 발표가 아직 없거나 지난 날짜라 자료가 없어요.'] }); return false; }
    const p = dfcParse(mine);
    if (!p.issues.length) return fail({ kind: 'format', detail: '예보 등급(informGrade)을 읽지 못했어요' });
    if (S.style !== st) { showDataResult(st, { kind: 'moved' }); status('지도 종류가 바뀌어 미세먼지 예보를 칠하지 않았어요', true, 'warn'); return false; }
    const prev = dataInfo(st);
    // 새 발표가 일부 날짜만 갱신해도 다른 예보일이 사라지지 않게 날짜별 최신을 기본으로. 실제 발표 시각도 각 날짜에 보존한다.
    const issue = '__LATEST__', days = Object.keys(p.latest).sort();
    const info = { at: new Date().toISOString(), code, scale: 'grade', date, past, yday: usedYday, issues: [issue, ...p.issues], fc: { ...p.byIssue, [issue]: p.latest }, issue, day: dfcDefaultDay(p.issues[0], days),
      labels: prev && prev.at ? !!prev.labels : !!dataPick.dustFcst.labels };
    pushUndo();
    dataLegendFirst(st);
    const plan = dfcApply(info);
    dataAfterPaint(st);
    ok = true;
    showDataResult(st, dfcResultOk(info, plan));
    return true;
  } catch (e) {
    return fail({ kind: 'other', detail: e && e.message });
  } finally {
    fxBusy(fx, false);
    if (!ok && seq === dataSeq[st]) { if (stale()) showDataResult(st, null); syncDataPanels(); }
    if (ok) fxArrive([fxSec(st), $('#dfcResult'), ...fxRows($('#dfcList'))]);
  }
}
function dfcResultOk(info, plan) {
  const cur = dfcCur(info) || { unknown: [] }, painted = Object.values(plan.cnt).reduce((s, n) => s + n, 0);
  const lines = [`예보 권역 ${DUST_REGIONS.length}곳 중 ${painted}곳 칠함`, '등급: ' + (dataCountLine('grade', plan.cnt) || '없음')];
  if (plan.none.length && plan.none.length < DUST_REGIONS.length) lines.push(`예보 없음(비워 둠): ${plan.none.join(', ')}`);
  if (cur.unknown && cur.unknown.length) lines.push(`모르는 권역 이름(칠 안 함): ${cur.unknown.join(', ')}`);
  if (info.yday && !info.issues.some((s) => String(s).startsWith(info.date))) lines.push('오늘 첫 발표(05시) 전이라 어제 발표를 썼어요');
  const issueCount = info.issues.filter((s) => s !== '__LATEST__').length;
  if (issueCount > 1) lines.push(`발표 ${issueCount}번 — ‘발표’ 칸에서 고를 수 있어요`);
  const actualIssue = dfcDisplayIssue(info);
  return { kind: 'ok', tone: cur.unknown && cur.unknown.length ? 'warn' : 'ok',
    title: `미세먼지 예보 — ${DATA_API.dustFcst.codes[info.code] || info.code} · ${dfcDayLabel(dfcRefDay(info), info.day)} 칠함`,
    meta: `에어코리아 ${actualIssue}` + (info.issue === '__LATEST__' ? ' · 예보일별 최신' : ''), lines, retry: () => fetchDustFcst() };
}
// 발표·예보일 바꾸기 — 다시 받지 않고 다시 칠한다
function dfcSetPick(issue, day) {
  if (S.style !== 'dustFcst') return;
  const info = dataInfo('dustFcst'); if (!info || !info.fc) return;
  const iss = issue && info.fc[issue] ? issue : info.issue;
  const days = dfcDays(info, iss);
  const baseIssue = iss === '__LATEST__' ? info.issues.find((s) => s !== '__LATEST__') : iss;
  const d = day && days.includes(day) ? day : (iss !== info.issue ? dfcDefaultDay(baseIssue, days) : info.day);
  if (iss === info.issue && d === info.day) return;
  pushUndo();
  const plan = dfcApply({ ...info, issue: iss, day: d });
  dataAfterPaint('dustFcst');
  showDataResult('dustFcst', dfcResultOk(dataInfo('dustFcst'), plan), true);
  status(`미세먼지 예보 — ${dfcDayLabel(dfcRefDay(dataInfo('dustFcst')), d)} 다시 칠함`);
}

// ===================== 패널 =====================
// 라벨 켜고 끄기 — 자료가 있으면 바로 만들거나 지운다(되돌리기 가능). 자료가 없으면 다음 불러오기 때 만든다.
function dataSetLabels(st, on) {
  if (S.style !== st) return;
  dataPick[st].labels = !!on;
  const info = dataInfo(st);
  if (!info || !info.at) return;
  pushUndo();
  const next = { ...info, labels: !!on };
  S.dataByStyle[st] = next;
  const items = st === 'life' ? lifeLabelItems(next) : st === 'dust' ? dustLabelItems(next) : dfcLabelItems(next);
  dataMakeLabels(st, on ? items : []);   // 라벨 토글은 손으로 보정한 지도 색을 다시 칠하지 않는다.
  dataAfterPaint(st);
}
// 색 지우기 — 그 지도의 칠·자료·자료 라벨
function dataClear(st) {
  dataSeq[st]++;
  showDataResult(st, null);
  const had = Object.keys((S.fillsByStyle || {})[st] || {}).length || dataInfo(st);
  if (!had) { status('지울 색이 없어요'); return; }
  pushUndo();
  S.fillsByStyle[st] = {};
  if (S.dataByStyle) delete S.dataByStyle[st];
  S.labels = (S.labels || []).filter((b) => b.data !== st);
  dataAfterPaint(st);
  status(`${DATA_NAME[st]} 색을 지웠어요 (Ctrl+Z로 되돌리기)`);
}
// 세그먼트(.mode) 켜짐 표시
function dataSegSet(sel, v) {
  for (const b of document.querySelectorAll(sel + ' button')) { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
}
// 선택 칸(select) 옵션 채우기 — 같은 목록이면 다시 만들지 않는다(드롭다운 포커스 유지)
function dataSelFill(sel, opts, val) {
  const s = $(sel); if (!s) return;
  const sig = JSON.stringify(opts);
  if (s.dataset.sig !== sig) {
    s.textContent = '';
    for (const [v, t] of opts) { const o = document.createElement('option'); o.value = String(v); o.textContent = t; s.append(o); }
    s.dataset.sig = sig;
  }
  s.value = String(val);
}
// 패널을 S(자료·고른 옵션)에 맞춘다 — 지도 전환·되돌리기·불러오기·작업 열기 뒤(updateAutoPaintSecs 끝에서 부른다)
function syncDataPanels() {
  if (!$('#lifeIdx')) return;
  const D = S.dataByStyle || {};
  // 생활기상
  { const i = D.life && D.life.at ? D.life : null;
    if (i) dataPick.life.idx = i.idx;
    dataSegSet('#lifeIdx', dataPick.life.idx);
    const row = $('#lifeTimeRow');
    if (i && i.vals) {
      const slots = lifeSlots(i.base, Object.values(i.vals));
      dataSelFill('#lifeTime', slots.map((s) => [s.i, s.label]), i.slot);
      row.style.display = slots.length > 1 ? '' : 'none';
    } else row.style.display = 'none';
    $('#lifeLabels').checked = i ? !!i.labels : !!dataPick.life.labels;
    dataStepsFill('life');
  }
  // 미세먼지 농도
  { const i = D.dust && D.dust.at ? D.dust : null;
    if (i) { dataPick.dust.item = i.item; dataPick.dust.cond = i.cond; }
    dataSegSet('#dustItem', dataPick.dust.item); dataSegSet('#dustCond', dataPick.dust.cond);
    $('#dustLabels').checked = i ? !!i.labels : !!dataPick.dust.labels;
    dataStepsFill('dust');
  }
  // 미세먼지 예보
  { const i = D.dustFcst && D.dustFcst.at ? D.dustFcst : null;
    if (i) {
      dataPick.dustFcst.code = i.code;
      dataPick.dustFcst.past = !!i.past;
      $('#dfcDate').value = i.date;
    }
    $('#dfcPastRow').style.display = dataPick.dustFcst.past ? '' : 'none';
    $('#dfcWhenNow').classList.toggle('pri', !dataPick.dustFcst.past);
    $('#dfcWhenPast').classList.toggle('pri', dataPick.dustFcst.past);
    dataSegSet('#dfcCode', dataPick.dustFcst.code);
    const ir = $('#dfcIssueRow'), dr = $('#dfcDayRow'), ov = $('#dfcOverall');
    if (i && i.fc) {
      dataSelFill('#dfcIssue', i.issues.map((s) => [s, s === '__LATEST__' ? '예보일별 최신 발표' : s]), i.issue);
      ir.style.display = i.issues.length > 1 ? '' : 'none';
      const days = dfcDays(i, i.issue);
      dataSelFill('#dfcDay', days.map((d) => [d, dfcDayLabel(dfcRefDay(i), d)]), i.day);
      dr.style.display = days.length ? '' : 'none';
      const cur = dfcCur(i);
      ov.hidden = !(cur && cur.overall);
      ov.textContent = cur && cur.overall ? cur.overall.slice(0, 160) + (cur.overall.length > 160 ? '…' : '') : '';
      ov.title = cur && cur.overall ? cur.overall : '';
    } else { ir.style.display = 'none'; dr.style.display = 'none'; ov.hidden = true; ov.textContent = ''; }
    $('#dfcLabels').checked = i ? !!i.labels : !!dataPick.dustFcst.labels;
    dataStepsFill('dustFcst');
  }
  // 자료가 있으면 빈 상태 안내를 숨긴다
  for (const n of document.querySelectorAll('[data-data-empty]')) { const i = D[n.dataset.dataEmpty]; n.hidden = !!(i && i.at); }
  // 범례 섹션 — 데이터 지도에선 '자료 범례'(자동 = 칠한 단계)
  { const isData = !!curStyle().data;
    const lg = document.querySelector('.sec[data-sec="legend"]');
    const nm = lg && lg.querySelector(':scope > h3 .secName');
    if (nm) nm.textContent = isData ? '자료 범례' : '특보 범례';
    const t = $('#lgAutoTxt'); if (t) t.textContent = isData ? '칠한 단계에서 자동' : '기상특보 목록에서 자동';
    const h = $('#lgAutoHint'); if (h) h.innerHTML = isData ? '지도에 <b>칠한 단계</b>만 나와요(낮은 → 높은 순).' : '특보 목록에서 <b>눈 켠</b> 특보만 나와요.';
  }
  syncKeyWarn();
}
// 배선(boot.js — wire() 바로 다음)
function setupDataPanels() {
  if (!$('#lifeIdx')) return;
  // API 설정 — 공공데이터포털 인증키 칸
  const ki = $('#dataKeyIn');
  if (ki) {
    try { ki.value = (localStorage.getItem(DATA_KEY_STORE) || '').trim(); } catch (e) { ki.value = ''; }
    if (dataBuiltinKey()) {
      ki.placeholder = '앱 기본 인증키 사용 · 변경할 때만 입력';
      const hint = $('#dataKeyInfo');
      if (hint) hint.textContent = '기본 인증키가 내장되어 있어 따로 입력하지 않아도 돼요. 다른 키를 입력하면 그 키를 우선 사용하고, 빈칸으로 두면 기본 키로 돌아가요. 개인 키는 이 컴퓨터에만 저장돼요.';
    }
    ki.oninput = () => { try { localStorage.setItem(DATA_KEY_STORE, ki.value.trim()); } catch (e) { /* 저장소를 못 쓰면 이번만 */ } dataResetRuntime(); dataCache.clear(); syncKeyWarn(); };
  }
  const site = $('#dataSite'); if (site) site.onclick = () => window.open(DATA_API.site, '_blank', 'noopener');
  for (const n of document.querySelectorAll('[data-nokey="data"]')) n.onclick = () => apiPop(true, 'data');
  // 생활기상
  for (const b of document.querySelectorAll('#lifeIdx button')) b.onclick = () => {
    if (dataPick.life.idx === b.dataset.v) return;
    dataSeq.life++; showDataResult('life', null);
    dataPick.life.idx = b.dataset.v; dataSegSet('#lifeIdx', b.dataset.v);
    const i = dataInfo('life');
    if (i && i.at && dataKey()) fetchLife();   // 이미 불러온 지도면 바로 그 지수로(시각만 바꿀 땐 캐시)
  };
  $('#lifeFetch').onclick = () => fetchLife();
  $('#lifeClear').onclick = () => dataClear('life');
  $('#lifeTime').onchange = (e) => lifeSetSlot(e.target.value);
  $('#lifeLabels').onchange = (e) => dataSetLabels('life', e.target.checked);
  // 미세먼지 농도
  for (const b of document.querySelectorAll('#dustItem button')) b.onclick = () => { dataSegSet('#dustItem', b.dataset.v); dustSetItem(b.dataset.v); };
  // 1시간 ↔ 24시간 평균 — 한 번 받은 자료에 둘 다 있어 다시 칠하기만(옛 자료면 다시 받는다)
  for (const b of document.querySelectorAll('#dustCond button')) b.onclick = () => {
    if (dataPick.dust.cond === b.dataset.v) return;
    dataSegSet('#dustCond', b.dataset.v); dustSetCond(b.dataset.v);
  };
  $('#dustFetch').onclick = () => fetchDust();
  $('#dustClear').onclick = () => dataClear('dust');
  $('#dustLabels').onchange = (e) => dataSetLabels('dust', e.target.checked);
  // 미세먼지 예보
  for (const b of document.querySelectorAll('#dfcCode button')) b.onclick = () => {
    if (dataPick.dustFcst.code === b.dataset.v) return;
    dataSeq.dustFcst++; showDataResult('dustFcst', null);
    dataPick.dustFcst.code = b.dataset.v; dataSegSet('#dfcCode', b.dataset.v);
    const i = dataInfo('dustFcst');
    if (i && i.at && dataKey()) fetchDustFcst();
  };
  const day = $('#dfcDate');
  day.max = dataKstNow().ymd;
  const past = (on) => {
    dataSeq.dustFcst++;
    showDataResult('dustFcst', null);
    dataPick.dustFcst.past = on;
    $('#dfcPastRow').style.display = on ? '' : 'none';
    $('#dfcWhenNow').classList.toggle('pri', !on); $('#dfcWhenPast').classList.toggle('pri', on);
    if (on && !day.value) { const k = dataKstNow(Date.now() - 864e5); day.value = k.ymd; }
  };
  $('#dfcWhenNow').onclick = () => { past(false); if (dataKey()) fetchDustFcst(); else showDataResult('dustFcst', { kind: 'key', retry: () => fetchDustFcst() }); };
  $('#dfcWhenPast').onclick = () => past(true);
  day.onchange = () => { if (dataPick.dustFcst.past && dataKey()) fetchDustFcst(); };
  $('#dfcFetch').onclick = () => fetchDustFcst();
  $('#dfcClear').onclick = () => dataClear('dustFcst');
  $('#dfcIssue').onchange = (e) => dfcSetPick(e.target.value, null);
  $('#dfcDay').onchange = (e) => dfcSetPick(null, e.target.value);
  $('#dfcLabels').onchange = (e) => dataSetLabels('dustFcst', e.target.checked);
  syncDataPanels();
}
