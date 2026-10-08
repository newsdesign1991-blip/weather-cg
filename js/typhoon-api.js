/* [모듈] js/typhoon-api.js — 태풍 데이터: 기상청 typ/td 파싱, JMA·JTWC, 이름 저장, TD 가장자리 붙이기, 기상청 조회 줄(kmaRequest), fetchTyphoon */
'use strict';

// ── 기상청 태풍정보 API (apihub typ_now.php — 특보와 같은 authKey, WNS 헬퍼 프록시) ──
// typ_now.php는 분석(FT=0)+예측(FT=1)을 CSV로 주고 RAD15/RAD25/RAD(70%) 3종 반경 포함.
const TYP_KEY_STORE = 'wcg_typ_key';   // (구 data.go.kr 키 — 이제 apihub 기본키 사용, 미사용)
const typKey = () => (localStorage.getItem(TYP_KEY_STORE) || '').trim();
const _tnum = (o, ...ks) => { for (const k of ks) { const v = o[k]; if (v != null && v !== '') { const n = parseFloat(v); if (!isNaN(n)) return n; } } return 0; };
const _tstr = (o, ...ks) => { for (const k of ks) { const v = o[k]; if (v != null && v !== '') return String(v); } return ''; };
let typhoonRaw = null;   // { src, whichList:[{tno,name,rows}] } — API 원본(비영속)

// UTC YYYYMMDDHH(MM) -> KST "M월 D일 H시"
function fmtKST(tm) {
  const s = String(tm).replace(/\D/g, ''); if (s.length < 10) return '';
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +(s.slice(10, 12) || 0)));
  d.setUTCHours(d.getUTCHours() + 9);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${d.getUTCHours()}시`;
}
const _cnum = (v) => { const n = parseFloat(v); return (isNaN(n) || n <= -900) ? 0 : n; };
// typ_now CSV 한 줄 -> 지점. 열: FT,YY,TYP,SEQ,TMD,TYP_TM,FT_TM,LAT,LON,DIR,SP,PS,WS,RAD15,RAD25,RAD,ED15,ER15,LOC,ED25,ER25
function typPointFromRow(c) {
  return { ft: +c[0], lon: _cnum(c[8]), lat: _cnum(c[7]), dir: (c[9] || '').trim(), sp: _cnum(c[10]), ps: _cnum(c[11]), ws: _cnum(c[12]),
    r15: _cnum(c[13]), r25: _cnum(c[14]), r70: _cnum(c[15]), tmef: (c[6] || '').trim(), loc: (c[18] || '').trim(),
    fcst: +c[0] === 1, label: fmtKST(c[6]) };
}
function parseTypNow(text) {
  const rows = [];
  for (const ln of String(text).split(/\r?\n/)) { if (!ln || ln.trim()[0] === '#') continue; const c = ln.split(','); if (c.length >= 19 && /^\d+$/.test((c[0] || '').trim())) rows.push(c); }
  return rows;
}
// td_now 한 줄 -> TD 지점. 열: FT,YY,TD,SEQ,TYP(연결태풍),TD_TM,FT_TM,LAT,LON,DIR,SP,PS,WS,RAD(70%),GR,LOC. (공백 또는 콤마 구분, LOC엔 공백 포함)
function typTdPointFromRow(c) {
  return { ft: +c[0], lat: _cnum(c[7]), lon: _cnum(c[8]), dir: (c[9] || '').trim(), sp: _cnum(c[10]), ps: _cnum(c[11]), ws: _cnum(c[12]),
    r15: 0, r25: 0, r70: _cnum(c[13]), tmef: (c[6] || '').trim(), loc: (c[15] || '').trim(), fcst: +c[0] === 1, label: fmtKST(c[6]),
    td: true, tdNo: (c[2] || '').trim(), typLink: (c[4] || '').trim() };
}
function parseTdRows(text) {
  const rows = [];
  for (const ln of String(text).split(/\r?\n/)) {
    if (!ln || ln.trim()[0] === '#' || !ln.trim()) continue;
    if (ln.split(',').length >= 19) continue;   // typ_now(콤마 19열+) 형식은 TD가 아님 — 건너뜀
    let c = ln.indexOf(',') >= 0 ? ln.split(',') : ln.trim().split(/\s+/);
    if (c.length < 15 || !/^\d+$/.test((c[0] || '').trim())) continue;
    if (c.length > 16) { c[15] = c.slice(15).join(' '); c.length = 16; }   // LOC(공백 포함)을 하나로
    rows.push(c);
  }
  return rows;
}

// opts.fromSel: 드롭다운 전환 — 메모리 원본(typhoonRaw, 비영속·다른 불러오기일 수 있음) 대신 S에 저장된 목록(지점 포함)으로 고른다.
function selectTyphoonFromApi(idx, opts) {
  const prev = S.typhoon || {};
  let list = null, src = '';
  if (opts && opts.fromSel) {
    const sl = prev.whichList, sw = sl && sl[idx];
    const rw = typhoonRaw && typhoonRaw.whichList && typhoonRaw.whichList[idx];
    if (sw && sw.points) { list = sl; src = prev.src || 'kma'; }
    else if (sw && rw && rw.tno === sw.tno && rw.name === sw.name && typhoonRaw.whichList.length === sl.length) { list = typhoonRaw.whichList; src = typhoonRaw.src === 'apihub' ? 'kma' : (typhoonRaw.src || 'kma'); }   // 옛 저장본(지점 없음) — 같은 불러오기일 때만
  } else if (typhoonRaw && typhoonRaw.whichList[idx]) { list = typhoonRaw.whichList; src = typhoonRaw.src === 'apihub' ? 'kma' : (typhoonRaw.src || 'kma'); }
  if (!list) {   // 전환할 지점 자료가 없으면 드롭다운 표시를 현재 태풍으로 되돌리고 안내
    buildTyphoonPanel(); if (isTyphoonCompare()) buildCompareSection();
    status('이 태풍으로 바꾸려면 다시 불러오기를 눌러 주세요', true);
    return;
  }
  if (opts && opts.fromSel) pushUndo();   // 드롭다운 전환은 되돌리기 가능(못 바꾼 경우엔 빈 단계를 남기지 않게 여기서)
  const w = list[idx];
  const rows = w.points || (w.rows ? w.rows.map(typPointFromRow) : []);
  const anal = rows.filter((r) => !r.fcst).sort((a, b) => (a.tmef > b.tmef ? 1 : (a.tmef < b.tmef ? -1 : 0)));
  const fcst = rows.filter((r) => r.fcst).sort((a, b) => (a.tmef > b.tmef ? 1 : (a.tmef < b.tmef ? -1 : 0)));
  const pts = JSON.parse(JSON.stringify(anal.concat(fcst)));   // 분석(과거~현재) + 예측(미래). nowIdx=마지막 분석 (목록 지점과 따로 복사)
  const DEF = typhoonStyleDefaults();
  const style = {};
  for (const k of TYPHOON_STYLE_KEYS) { const v = (prev[k] != null ? prev[k] : DEF[k]); if (v !== undefined) style[k] = v; }   // 아이콘/범례 등 스타일 키 모두 보존
  S.typhoon = Object.assign({
    name: w.name, issues: [{ tmfc: '', label: '실황 + 예상경로', points: pts }], sel: 0, fromApi: true,
    src,   // 반경 이름을 나라별로 바꾸는 데 씀
    // 지점까지 저장 — 새로고침·파일 열기·되돌리기 뒤에도 드롭다운 전환이 S만으로 된다
    whichList: list.map((x) => ({ tno: x.tno, year: x.year, td: x.td, name: x.name, points: JSON.parse(JSON.stringify(x.points || (x.rows ? x.rows.map(typPointFromRow) : []))) })), whichSel: idx, nowIdx: null, labelSel: null,
    compare: prev.compare || [],   // 비교 목록은 불러오기(트랙 교체)에도 보존 — 여러 기관 누적 비교 가능
    refImgs: prev.refImgs || (prev.refImg ? [prev.refImg] : []), refSel: prev.refSel,   // 대고 그리는 참고 이미지는 통보문/예보 불러와도 보존(간섭 방지)
    places: prev.places || [], placeSize: prev.placeSize,   // 지명표시(사용자 입력)도 보존
  }, style);
  autoTodayTyphoonLabel();   // 오늘 지점 라벨 하나 자동 표시
  buildTyphoonPanel(); renderTyphoon();
  // 비교 지도에서 '불러오기'(드롭다운 전환 제외)면 방금 로드한 예보를 자동으로 비교에 추가(중복 이름은 갱신).
  if (!(opts && opts.fromSwitch) && isTyphoonCompare()) addCompareForecast(true);
  if (isTyphoonCompare()) buildCompareSection();
}

// JMA 경계역/예보원 → 반경(km). {radius}(強風域·予報円) 또는 {arc:[[center,radius_m,[a0,a1]]…]}(暴風域) 둘 다 최대반경으로.
function jmaAreaRadKm(area) {
  if (!area) return 0;
  let m = +area.radius || 0;
  if (Array.isArray(area.arc)) for (const x of area.arc) { const r = +x[1] || 0; if (r > m) m = r; }
  return m ? Math.round(m / 1000) : 0;
}
// 일본 기상청(JMA) 공개 JSON(bosai) — CORS 허용이라 브라우저가 직접 fetch(헬퍼 불필요).
// 予報円(probabilityCircle)→r70(70% 확률반경), 暴風域(stormWarningArea)→r25(25m/s), 強風域(galeWarningArea)→r15(15m/s).
async function fetchJma() {
  const B = 'https://www.jma.go.jp/bosai/typhoon/data/';
  const btn = $('#typFetchJma'); if (btn) btn.disabled = true;
  status('일본 기상청(JMA) 불러오는 중…', true);
  try {
    const list = await (await fetch(B + 'targetTc.json', { cache: 'no-store' })).json();
    if (!Array.isArray(list) || !list.length) { status('JMA: 활동 중인 태풍이 없습니다', true); return; }
    const catWs = { TY: 35, STS: 28, TS: 20, TD: 12, LOW: 10 };
    const utc12 = (v) => String((v && v.UTC) || '').replace(/\D/g, '').slice(0, 12);
    const whichList = [];
    for (const tc of list) {
      const id = tc.tropicalCyclone; if (!id) continue;
      let fc; try { fc = await (await fetch(B + id + '/forecast.json', { cache: 'no-store' })).json(); } catch (e) { continue; }
      if (!Array.isArray(fc)) continue;
      const title = fc.find((p) => p.part === 'title') || {};
      const nm = (title.name && (title.name.en || title.name.jp)) || id;   // 영어 이름 우선(일본어 못 읽는 경우 대비)
      const num = title.typhoonNumber || '';
      const ws = catWs[tc.category] || 25;
      const anal = fc.find((p) => p.part === 'Analysis' || (p.part && p.part.en === 'Analysis'));
      const pts = [];
      const tk = anal && anal.track && anal.track.typhoon;   // 과거 경로 폴리라인 [[lat,lon],…]
      if (Array.isArray(tk) && tk.length > 1) {
        const step = Math.max(1, Math.round(tk.length / 24));   // 선은 촘촘히(≈24점) 유지
        let j = 0;   // 그 중 2개마다 1개꼴로 '전 발표' 아이콘(≈12개) — 선은 매끈, 아이콘은 과밀하지 않게
        for (let i = 0; i < tk.length - 1; i += step) { const q = tk[i]; if (Array.isArray(q) && q.length >= 2) pts.push({ lon: q[1], lat: q[0], ws, r15: 0, r25: 0, r70: 0, tmef: '', label: '', fcst: false, noIcon: (j++ % 2 !== 0) }); }
      }
      if (anal && Array.isArray(anal.center)) { const atm = utc12(anal.validtime); pts.push({ lon: anal.center[1], lat: anal.center[0], ws, r15: jmaAreaRadKm(anal.galeWarningArea), r25: jmaAreaRadKm(anal.stormWarningArea), r70: 0, tmef: atm, label: atm ? fmtKST(atm) : '', fcst: false }); }   // 현재 지점도 시각 라벨(안 그러면 '오늘' 라벨이 '지점 N')
      for (const p of fc) {
        if (!Array.isArray(p.center) || !(p.advancedHours > 0)) continue;
        const tmef = utc12(p.validtime);
        // 예보는 촘촘한 3시간 근접점(+1~+19h)은 아이콘 숨기고(선만) 하루 간격(+22h 이상)만 아이콘 — 안 그러면 아이콘이 뭉친다.
        pts.push({ lon: p.center[1], lat: p.center[0], ws, r15: jmaAreaRadKm(p.galeWarningArea), r25: jmaAreaRadKm(p.stormWarningArea), r70: (p.probabilityCircle ? Math.round((+p.probabilityCircle.radius || 0) / 1000) : 0), tmef, label: fmtKST(tmef), fcst: true, noIcon: !(p.advancedHours >= 22) });
      }
      if (pts.length < 2) continue;
      whichList.push({ tno: num || id, name: nm + ' (JMA' + (num && /^\d+$/.test(num) ? ' 제' + num + '호' : '') + ')', td: tc.category === 'TD', points: pts });
    }
    if (!whichList.length) { status('JMA 자료를 해석하지 못했습니다', true); return; }
    pushUndo();
    typhoonRaw = { src: 'jma', whichList };
    selectTyphoonFromApi(0);
    if (S.typhoon) S.typhoon.r15Buf = 0;   // JMA r15=실제 強風域이라 버퍼 없음
    if (S.map.s > 0.5) setTyphoonDefaultView();
    autoTodayTyphoonLabel(); renderAll();
    status(`일본 기상청(JMA) 불러옴 · ${whichList.length}개 · ${whichList[0].name}`, true);
  } catch (e) {
    status('JMA 불러오기 실패: ' + (e.message || e), true);
  } finally { if (btn) btn.disabled = false; }
}
// JTWC 통보문(.tcw / WTPN) 파싱 → whichList 항목. 압축 예보줄(T000 253N 1419E 115 R064… R050… R034…)과
// 하단 베스트트랙(1226080406 253N1419E 115)을 모두 읽어 과거+예보 한 트랙으로. 풍속 kt→m/s, 반경 NM→km(사분면 최대).
function parseJtwcTcw(text) {
  const lines = String(text).split(/\r?\n/);
  const KT = 0.514444, NM = 1.852;
  let base = '', stormNum = '', name = '';
  for (const ln of lines) { const m = ln.match(/^\s*(\d{10})\s+(\d+)[WEC]\s+([A-Z][A-Z0-9\-]*)\s+\d+/); if (m) { base = m[1]; stormNum = m[2]; name = m[3]; break; } }
  // base = SSYYMMDDHH(태풍번호2+연도2+월일시) — 연도는 slice(2,4)(베스트트랙과 같은 해석)
  const addHours = (b, h) => { const d = new Date(Date.UTC(2000 + +b.slice(2, 4), +b.slice(4, 6) - 1, +b.slice(6, 8), +b.slice(8, 10), 0)); d.setUTCHours(d.getUTCHours() + h); const p = (v) => String(v).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}00`; };
  const eLon = (v, hemi) => (hemi === 'W' ? 360 - v : v);   // 날짜변경선 넘는 서경은 동경 연속값(360-)으로
  const byTm = {};
  for (const ln of lines) {   // 압축 예보줄
    const m = ln.match(/^\s*T(\d{3})\s+(\d+)([NS])\s+(\d+)([EW])\s+(\d+)(.*)$/);
    if (!m || !base) continue;
    const tau = +m[1], rest = m[7] || '';
    const rad = (tag) => { const r = rest.match(new RegExp('R' + tag + '\\s+(\\d+)\\s+NE\\s+QD\\s+(\\d+)\\s+SE\\s+QD\\s+(\\d+)\\s+SW\\s+QD\\s+(\\d+)\\s+NW\\s+QD')); return r ? Math.max(+r[1], +r[2], +r[3], +r[4]) * NM : 0; };
    const tmef = addHours(base, tau);
    byTm[tmef] = { lon: eLon((+m[4]) / 10, m[5]), lat: (+m[2]) / 10 * (m[3] === 'S' ? -1 : 1), ws: Math.round((+m[6]) * KT), r15: Math.round(rad('034')), r25: Math.round(rad('050')), r70: 0, tmef, loc: '', fcst: tau > 0, label: fmtKST(tmef) };
  }
  for (const ln of lines) {   // 하단 베스트트랙(과거) — SSYY MMDDHH latN lonE wind
    const m = ln.match(/^\s*\d{2}(\d{2})(\d{6})\s+(\d+)([NS])(\d+)([EW])\s+(\d+)\s*$/);
    if (!m) continue;
    const tmef = '20' + m[1] + m[2] + '00';
    if (byTm[tmef]) continue;   // 예보(반경 포함)가 있으면 우선
    byTm[tmef] = { lon: eLon((+m[5]) / 10, m[6]), lat: (+m[3]) / 10 * (m[4] === 'S' ? -1 : 1), ws: Math.round((+m[7]) * KT), r15: 0, r25: 0, r70: 0, tmef, loc: '', fcst: false, label: fmtKST(tmef) };
  }
  const points = Object.values(byTm).sort((a, b) => (a.tmef < b.tmef ? -1 : 1));
  if (points.length < 2) return null;
  const isTD = Math.max(...points.map((p) => p.ws)) < 17;
  return [{ tno: stormNum || 'JTWC', name: (name ? name + ' ' : '') + '(JTWC' + (stormNum ? ' ' + stormNum + 'W' : '') + ')', td: isTD, points }];
}
// ── 태풍 번호별 이름 (기상청 typ_now API엔 이름이 없어 여기 표에 직접 저장 → 라벨/제목에 자동 부착) ──
// 키 = "년도-번호"(예: "2026-13"). 브라우저 localStorage에 저장(개인·비동기화). 한 번 입력하면 다음 불러오기에도 유지.
const TYP_NAME_STORE = 'wcg_typ_names';
function typNameMap() { try { return JSON.parse(localStorage.getItem(TYP_NAME_STORE) || '{}'); } catch (e) { return {}; } }
function typNameGet(year, tno) { if (!year || !tno) return ''; return (typNameMap()[year + '-' + tno] || '').trim(); }
function typNameSet(year, tno, nm) { const m = typNameMap(); const k = year + '-' + tno; if (nm && nm.trim()) m[k] = nm.trim(); else delete m[k]; localStorage.setItem(TYP_NAME_STORE, JSON.stringify(m)); }
// 드롭다운/제목에 쓸 표시명 = "제N호 태풍" + (저장된 이름이 있으면 " 개미"). TD는 이름 안 붙임.
function typhoonDisplayName(year, tno, isTD) {
  if (isTD) return '열대저압부(TD)';
  const nm = typNameGet(year, tno);
  return '제' + tno + '호 태풍' + (nm ? ' ' + nm : '');
}
// 이름을 바꾼 뒤 whichList 라벨·드롭다운·제목을 다시 반영(불러오기 다시 안 해도 됨).
function refreshTyphoonNames() {
  const T = S.typhoon; if (!T) return;
  const fix = (arr) => { if (!arr) return; for (const w of arr) if (!w.td && w.year) w.name = typhoonDisplayName(w.year, w.tno, false); };
  fix(T.whichList); fix(typhoonRaw && typhoonRaw.whichList);
  const cur = (T.whichList || [])[T.whichSel || 0];
  if (cur && !cur.td && cur.year) T.name = cur.name;   // 제목(태풍명 예상경로)도 갱신
  const which = $('#typWhichSel'); if (which) [...which.options].forEach((o, i) => { if (T.whichList && T.whichList[i]) o.textContent = T.whichList[i].name; });
  renderTyphoon();
}

// apihub typ_now(태풍) + td_now(TD) 파싱 → S.typhoon. TD는 연결된 태풍(TYP) 앞에 붙여 하나의 트랙(TD→태풍)으로.
function applyTyphoonText(rawTyp, rawTd) {
  rawTyp = (rawTyp || '').trim();
  // JTWC 통보문(.tcw) 자동 감지 — PGTW/WTPN 헤더나 'T000 …N …E' 압축 예보줄이 있으면 JTWC로 파싱.
  if (/\bPGTW\b|\bWTPN|^\s*T\d{3}\s+\d+[NS]\s+\d+[EW]\s/m.test(rawTyp)) {
    const wl = parseJtwcTcw(rawTyp);
    if (wl) {
      typhoonRaw = { src: 'jtwc', whichList: wl };
      selectTyphoonFromApi(0);
      // JTWC '34노트 위험구역'은 풍역+오차버퍼라 실제 풍역보다 큼 → r15에 기본 여유 150km(사용자 조절 가능).
      if (S.typhoon) { S.typhoon.r15Buf = (S.typhoon.r15Buf != null && S.typhoon.r15Buf > 0) ? S.typhoon.r15Buf : 150; if (typeof buildTyphoonBands === 'function') buildTyphoonBands(); }
      if (S.map.s > 0.5) setTyphoonDefaultView();
      autoTodayTyphoonLabel(); renderAll();
      status(`JTWC 통보문 불러옴 · ${wl[0].name} · ${wl[0].points.length}개 지점`, true);
      return true;
    }
    status('JTWC 통보문을 못 읽었습니다 (형식 확인)', true); return false;
  }
  const typRows = rawTyp ? parseTypNow(rawTyp) : [];
  let tdRows = rawTd ? parseTdRows(rawTd) : [];
  if (!tdRows.length && rawTyp) tdRows = parseTdRows(rawTyp);   // 붙여넣기에 typ+TD가 섞여 있거나 TD만일 때 여기서 TD 추출
  if (!typRows.length && !tdRows.length) {
    $('#typInfo').textContent = '현재 활동 중인 태풍·열대저압부가 없습니다';
    status('태풍·TD 없음', true); return false;
  }
  const byTyp = {}; for (const c of typRows) { const t = (c[2] || '').trim(); (byTyp[t] ||= []).push(c); }
  const byTd = {}; for (const c of tdRows) { const t = (c[2] || '').trim(); (byTd[t] ||= []).push(c); }
  const tdUsed = {}, whichList = [];
  // 태풍 — 연결된 TD를 트랙에 이어붙인다. 발생(앞)·소멸(뒤) 모두. 시각순 정렬은 selectTyphoonFromApi가 한다.
  for (const tno of Object.keys(byTyp)) {
    const typPts = byTyp[tno].map(typPointFromRow);
    let tdMerge = [];
    for (const tdno of Object.keys(byTd)) {
      const rows = byTd[tdno];
      const link = (rows.map((c) => (c[4] || '').trim()).find((l) => l && +l !== 0)) || '';   // 어느 행이든 연결된 태풍번호
      if (link && +tno !== 0 && +link === +tno) { tdMerge = tdMerge.concat(rows.map(typTdPointFromRow)); tdUsed[tdno] = 1; }
    }
    const maxWs = Math.max(0, ...typPts.map((p) => p.ws));
    const isTD = !tno || +tno === 0 || maxWs < 17;
    const yr = ((byTyp[tno][0] || [])[1] || '').trim();   // c[1] = YY(년도) — 이름 표 키에 사용
    whichList.push({ tno, year: yr, name: typhoonDisplayName(yr, tno, isTD), td: isTD, points: tdMerge.concat(typPts) });
  }
  // 연결 안 된 독립 TD
  for (const tdno of Object.keys(byTd)) {
    if (tdUsed[tdno]) continue;
    whichList.push({ tno: 'TD' + tdno, name: '열대저압부(TD) ' + tdno + '호', td: true, points: byTd[tdno].map(typTdPointFromRow) });
  }
  if (!whichList.length) { $('#typInfo').textContent = '태풍 응답 형식을 인식하지 못했습니다'; status('형식 오류', true); return false; }
  typhoonRaw = { src: 'apihub', whichList };
  selectTyphoonFromApi(0);
  if (S.typhoon) S.typhoon.r15Buf = 0;   // 기상청 r15=실제 강풍반경 → JTWC 버퍼가 남지 않게 0
  if (S.map.s > 0.5) setTyphoonDefaultView();
  autoTodayTyphoonLabel();
  renderAll();
  status(`불러옴: ${whichList.map((w) => w.name).join(', ')}`);
  return true;
}

// (b방식) 트랙 맨 앞(발생)에 열대저압부(TD)를 붙인다 — 추정이 아니라 기상청 td_now에서 '실제 좌표'를 가져온다.
// 태풍 첫 점 시각을 기준으로 시각을 거슬러(최대 48h) td_now를 조회, 그 위치에 연결되는 TD의 분석 좌표를 붙인다. 다시 누르면 원복(토글).
const _dtm = (tm) => +String(tm || '').replace(/\D/g, '').slice(0, 12);
function _tmBack(tm12, hb) { const s = String(tm12); const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +(s.slice(10, 12) || 0))); d.setUTCHours(d.getUTCHours() - hb); const p = (v) => String(v).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`; }
// td_now(TD) 또는 typ_now(태풍)에서 기준점(refPt) 근처 스톰의 '실제 분석 좌표'를 시각을 거슬러(back)/앞으로(fwd) 조회.
// kind='td'면 열대저압부, 'typ'면 태풍. refT 기준 back=그 이전, fwd=그 이후 지점만(기존 트랙과 안 겹치게).
// ★위치 근접(<8°)으로 '같은 스톰'을 식별 — 번호가 바뀌어도(태풍↔TD 승격/약화) 트랙 연속성으로 이어붙는다.
// prio: 조회 줄 우선순위 바탕(불러오기 뒤 자동 확인은 지금 태풍 조회보다 뒤 — 100번대, 버튼으로 기다릴 때는 40번대).
async function _scanEdgeReal(refPt, refT, dir, kind, prio) {
  const base = String(refPt.tmef).replace(/\D/g, '').slice(0, 12).padEnd(12, '0');
  const urlOf = kind === 'typ' ? typhoonApiUrlTm : typhoonTdUrlTm;
  const parse = kind === 'typ' ? parseTypNow : parseTdRows;
  const ptOf = kind === 'typ' ? typPointFromRow : typTdPointFromRow;
  const tms = [];
  for (let hb = 0; hb <= 48; hb += 6) {
    const tm = _tmBack(base, dir === 'back' ? hb : -hb);
    if (dir !== 'back' && _kmaTmUnseen(tm)) break;   // 앞으로(fwd)는 아직 분석이 있을 수 없는 시각부터 끝까지 빈 응답 — 안 보낸다
    tms.push(tm);
  }
  // 응답 하나에서 기준점 8° 안 가장 가까운 스톰(없으면 null)
  const pick = (raw) => {
    const rows = parse(raw); if (!rows.length) return null;
    let best = null;
    const by = {}; for (const c of rows) { (by[(c[2] || '').trim()] ||= []).push(c); }
    for (const id of Object.keys(by)) {
      const pts = by[id].map(ptOf);
      let dmin = 1e9; for (const q of pts) { if (q.fcst) continue; const d = Math.hypot(q.lon - refPt.lon, q.lat - refPt.lat); if (d < dmin) dmin = d; }
      if (dmin < 8 && (!best || dmin < best.dmin)) best = { pts, dmin };
    }
    return best;
  };
  // 가까운 시각(작은 hb)부터 채택 — 앞 시각에서 찾으면 뒤 시각은 안 보낸다(_kmaFirst).
  // 6시간 간격이라 홀수 번째는 양옆(12시간 간격)이 덮는다: 양옆에 근처 스톰이 없으면 그 사이에도 없다 → 짝수 번째를 먼저 묻고 홀수는 필요할 때만.
  // 태풍(typ)은 보통 첫 시각에 자기 자신이 잡혀 끝나므로 첫 시각만 먼저.
  const P = prio == null ? 100 : prio;
  const hit = await _kmaFirst(tms.map(urlOf), pick, { prio: (i) => P + i * 4, cover: _kmaCoverTm(tms), lazy: true, ahead: (cur) => ((kind === 'typ' && cur === 0) ? 1 : 3) });
  const best = hit && hit.v;
  if (!best) return [];
  const seen = {};
  const out = best.pts.filter((q) => !q.fcst && q.tmef && (dir === 'back' ? _dtm(q.tmef) < refT : _dtm(q.tmef) > refT))
    .filter((q) => { const k = _dtm(q.tmef); if (seen[k]) return false; seen[k] = 1; return true; });
  out.forEach((q) => { q.td = (kind !== 'typ') && (+q.ws || 99) < 17; q._edgeTD = true; });
  return out;
}
// td_now + typ_now를 함께 역조회해 시각순으로 병합(같은 시각이면 태풍 우선). back/fwd 공용.
// 우선순위: 발생(back)·소멸(fwd) × TD·태풍 네 조회가 같은 시각 순번끼리 번갈아 나가게(base + 순번×4 + 0~3).
// base: 불러오기 뒤 자동 확인은 100(뒤에서 — 늦을 때 다시 보내기도 1.5초 뒤), 버튼(사용자가 기다림)은 40(급한 조회처럼 0.9초 뒤).
async function _scanEdgeBoth(refPt, refT, dir, base) {
  const d = dir === 'back' ? 0 : 1, B = base == null ? 100 : base;
  const [a, b] = await Promise.all([_scanEdgeReal(refPt, refT, dir, 'td', B + d), _scanEdgeReal(refPt, refT, dir, 'typ', B + 2 + d)]);
  const m = new Map();
  for (const q of a) m.set(_dtm(q.tmef), q);
  for (const q of b) m.set(_dtm(q.tmef), q);   // 태풍(typ) 우선 — 같은 시각이면 태풍 분류/풍속으로
  return [...m.values()].sort((x, y) => _dtm(x.tmef) - _dtm(y.tmef));
}
// 하위호환 별칭(기존 호출부 유지)
const scanTdReal = (refPt, refT, dir) => _scanEdgeReal(refPt, refT, dir, 'td');
// 점 배열을 바꾼 뒤(TD 붙이기/원복) 지점 인덱스로 붙은 라벨·현재 지점을 '같은 실제 점'으로 옮긴다(빠진 점의 라벨은 삭제).
// 비교 지도면 이 트랙의 스냅샷(같은 지점 열인 비교 항목)도 새 트랙으로 갱신 — 비교 지도는 비교 선만 그리므로.
function _remapEdgePoints(it, oldPts) {
  const T = S.typhoon; if (!T) return;
  const newPts = it.points;
  const mapIdx = (i) => (i == null || !oldPts[i]) ? -1 : newPts.indexOf(oldPts[i]);
  const remapLabels = (arr) => arr.filter((b) => { if (b.idx == null) return true; const k = mapIdx(b.idx); if (k < 0) return false; b.idx = k; return true; });
  if (Array.isArray(T.labels)) T.labels = remapLabels(T.labels);
  if (T.nowIdx != null) { const k = mapIdx(T.nowIdx); T.nowIdx = k < 0 ? null : k; }
  if (isTyphoonCompare() && Array.isArray(T.compare)) {
    const key = (pts) => pts.map((p) => p.tmef + ',' + p.lon + ',' + p.lat).join('|');
    const ok = key(oldPts);
    const c = T.compare.find((x) => !x.manual && Array.isArray(x.points) && key(x.points) === ok);
    if (c) {
      c.points = JSON.parse(JSON.stringify(newPts));
      if (Array.isArray(c.labels)) c.labels = remapLabels(c.labels);   // 스냅샷은 같은 순서의 복사본이라 인덱스 대응이 같다
      buildCompareSection();
    }
  }
}
// 사용자가 글자 칸(태풍 이름·라벨 목록·캔버스 인라인 편집 등)에 입력 중인지 — 뒤에서 도는 TD 붙이기가 패널을 다시 그리면
// 입력 중인 칸(한글 조합 포함)이 지워지고, 라벨 목록 칸은 지점 번호가 밀려 엉뚱한 라벨을 고치게 된다.
function _typTyping() {
  const a = document.activeElement;
  if (!a || a === document.body) return false;
  if (a.isContentEditable || a.tagName === 'TEXTAREA') return true;
  return a.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|reset|color|file|image|hidden)$/i.test(a.type || '');
}
// 발생(앞)·소멸(뒤) 열대저압부를 실좌표로 붙인다. auto=true면 불러오기에서 조용히, false면 버튼(토글).
// 불러오기(auto)는 태풍을 먼저 그린 뒤 이 확인을 기다리지 않고 뒤에서 돌린다 — doneMsg: 확인 중 문구 앞에 붙이고, 못 붙였으면 되돌릴 문구.
// 확인하는 사이 다른 태풍을 불러오거나 고르거나 지점이 바뀌거나(배열·점 하나라도) 새 확인이 시작되면 결과를 붙이지 않는다(엉뚱한 트랙·라벨에 안 붙게).
// 뒤에서 붙일 때 사용자가 글자 칸에 입력 중이면 그 칸을 떠날 때까지 미뤘다가 붙인다(입력을 덮지 않게 — 그동안 문구는 '확인 중…').
let _typEdgeSeq = 0;
async function attachEdgeTD(auto, doneMsg) {
  const it = curTyphoonIssue();
  if (!it || !it.points || !it.points.length) { if (!auto) status('태풍 트랙이 없습니다', true); return; }
  if (!auto && it.points.some((p) => p._edgeTD)) {   // 버튼 재클릭 = 제거(토글)
    pushUndo(); const oldPts = it.points; it.points = it.points.filter((p) => !p._edgeTD);
    _remapEdgePoints(it, oldPts);
    renderTyphoon(); if (typeof buildTyphoonPanel === 'function') buildTyphoonPanel();
    status('열대저압부(발생·소멸) 제거(원복)'); return;
  }
  const core = it.points.filter((p) => !p._edgeTD);   // 기존 것(이미 붙인 edge 제외) 기준
  const times = core.map((p) => _dtm(p.tmef)).filter((v) => v > 100000000000);
  if (!times.length) { if (!auto) status('실좌표 TD는 기상청에서 불러온 태풍(발표시각 데이터)에만 붙습니다.', true); return; }
  if (!apiKey()) { if (!auto) status('apihub 인증키가 필요합니다', true); return; }
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const p0 = core.find((p) => _dtm(p.tmef) === tMin) || core[0];
  const anal = core.filter((p) => !p.fcst);
  const pL = (anal.length ? anal[anal.length - 1] : core[core.length - 1]);   // 소멸은 마지막 '분석' 지점 기준
  const tL = _dtm(pL.tmef);
  const seq = ++_typEdgeSeq;
  const btn = $('#typAddTD'); if (btn) btn.disabled = true;
  const checking = (doneMsg || '') + ' · 발생·소멸 열대저압부 확인 중…';
  if (!auto) status('열대저압부(실좌표) 불러오는 중…', true);
  else if (doneMsg) status(checking, true);
  const startPts = it.points, startSnap = startPts.slice();
  const stale = () => seq !== _typEdgeSeq || curTyphoonIssue() !== it || it.points !== startPts
    || it.points.length !== startSnap.length || it.points.some((p, i) => p !== startSnap[i]);   // 지운 뒤 하나 넣기(길이 같음)도 잡는다
  // 확인 중 문구가 그대로면 불러옴 문구로 — 더 새 확인이 돌고 있으면 그쪽 문구(같은 글자일 수 있다)를 건드리지 않는다
  const restore = () => { const n = $('#status'); if (auto && doneMsg && seq === _typEdgeSeq && n && n.textContent === checking) status(doneMsg); };
  try {
    if (!auto) {   // 버튼: 헬퍼부터 확인(꺼져 있으면 안내). 불러오기(auto)는 방금 확인했다.
      let up = false; try { const r = await fetch(WNS_HELPER + '/ping', { cache: 'no-store' }); up = r.ok; } catch (e) { up = false; }
      if (!up) { status('기능 확장팩(헬퍼)이 응답하지 않아 불러오지 못했습니다', true); if (typeof wnsHelperOffNotice === 'function') wnsHelperOffNotice(); return; }   // '불러오는 중…'에 멈춰 있지 않게
    }
    // ★td_now(TD)+typ_now(태풍) 둘 다 역/순 조회 → 태풍↔TD가 바뀐 스톰도 트랙 연속성으로 과거/미래를 이어붙인다.
    //  (예: 지금 열대저압부인데 예전엔 태풍이었던 경우 → 앞에 태풍 트랙이 통보문처럼 이어짐)
    // 발생·소멸은 서로 무관해 동시에 찾는다(옛 방식은 발생 다 받은 뒤 소멸).
    const base = auto ? 100 : 40;
    const [genesis, dissip] = await Promise.all([_scanEdgeBoth(p0, tMin, 'back', base), _scanEdgeBoth(pL, tL, 'fwd', base)]);
    if (auto && (genesis.length || dissip.length)) { while (_typTyping() && !stale()) await new Promise((r) => setTimeout(r, 250)); }
    if (stale()) { restore(); return; }
    if (!genesis.length && !dissip.length) { if (!auto) status('연결되는 태풍·열대저압부를 못 찾았습니다 (그 시기 데이터 없음)', true); else restore(); return; }
    pushUndo();
    const oldPts = it.points;
    it.points = [...genesis, ...core, ...dissip];
    _remapEdgePoints(it, oldPts);   // 라벨·현재 지점 인덱스 보정 + 비교 스냅샷 갱신
    const gTyp = genesis.filter((p) => !p.td).length, dTyp = dissip.filter((p) => !p.td).length;
    renderTyphoon(); if (typeof buildTyphoonPanel === 'function') buildTyphoonPanel();
    status(`과거·미래 트랙 붙임 — 발생 ${genesis.length}점(태풍 ${gTyp}) · 소멸 ${dissip.length}점(태풍 ${dTyp}) (버튼 다시 누르면 원복)`);
  } catch (e) {
    if (!auto) status('열대저압부 불러오기 실패: ' + (e.message || e), true);
    else restore();
  } finally { if (btn && seq === _typEdgeSeq) btn.disabled = false; }
}
const prependGenesisTD = () => attachEdgeTD(false);   // 버튼 핸들러(토글)
// CSV 응답에 실제 데이터 행(주석 # 아닌 숫자 시작)이 있는지
function typhoonHasRows(t) { return String(t).split(/\r?\n/).some((l) => l && l[0] !== '#' && /^\s*\d/.test(l)); }

// ── 기상청 조회 줄 세우기(태풍 불러오기 속도) ──
// 브라우저는 한 주소(헬퍼 127.0.0.1)에 동시에 6개까지만 연결한다. 13개·18개를 한꺼번에 던지면 6개씩 '파도'로 처리되고
// (왕복 하나 ≈ 0.2~0.35초, 헬퍼가 기상청에 매번 새로 TLS 연결), 급한 조회(지금 태풍)가 덜 급한 조회 뒤에 줄을 선다. 그래서 여기서 직접 줄을 세운다:
//  - 동시에 KMA_INFLIGHT_MAX개까지만 내보내고, 우선순위(작을수록 먼저, 같으면 먼저 온 순) 순서로 꺼낸다.
//  - 같은 주소는 진행 중 요청을 같이 쓰고, 받은 응답은 잠깐 기억한다 — 더 바뀔 수 없는 지난 시각(tm+6시간 지남)은 10분,
//    최근 시각은 30초(새 발표를 놓치지 않게). 실패 응답은 기억하지 않는다. 사용자가 '불러오기'를 다시 누르면 최근 시각 기억은 버린다
//    (_kmaDropRecent — 발표 직후 다시 눌렀는데 30초 전 빈 응답이 나오지 않게. 한 번 누름 안의 중복 조회만 줄인다).
//  - 기다리는 쪽이 모두 취소한 대기 요청은 보내지 않는다(인증키 하루 사용량도 아낀다).
//  - 응답이 늦으면 같은 주소를 한 번 더 보내 먼저 온 쪽을 쓴다 — 급한 조회(prio < KMA_HEDGE_PRIO: 지금 태풍·지난 날짜 찾기)는 KMA_HEDGE_MS,
//    뒤에서 도는 발생·소멸 확인은 KMA_HEDGE_BG_MS 뒤. 기상청 응답이 가끔 0.7~2.3초 늦고, 드물게 15초 넘게 멈춘다
//    (2026-10 실측: 보통 0.2~0.35초, 62건 중 2~3건이 0.7~2.3초, 16건 중 1건 15초+). 같은 주소를 몇 초 사이에 다시 묻는 것이라 답은 같다.
//    늦은 쪽은 끊는다(브라우저 연결을 비우게). 기다리는 쪽이 다 떠난(답이 정해져 아무도 안 쓰는) 진행 중 요청은 다시 보내지 않는다.
const KMA_INFLIGHT_MAX = 6;
const KMA_HEDGE_MS = 900, KMA_HEDGE_BG_MS = 1500, KMA_HEDGE_PRIO = 100;
const KMA_TTL_PAST = 10 * 60e3, KMA_TTL_RECENT = 30e3;
const _kmaQ = { active: 0, seq: 0, wait: [], jobs: new Map(), cache: new Map(), soon: false };
// 기상청 typ_now·td_now의 tm은 UTC로 해석된다(응답의 분석 시각 열과 같은 기준) — 주소·tm 문자열 → ms
function _kmaTmMs(tm) { const s = String(tm); return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +(s.slice(10, 12) || 0)); }
// typ_now·td_now는 tm 기준 '12시간 안에 분석이 있는 스톰'만 준다(2026-10 실측: 마지막 분석 12시간 뒤 tm까지 포함, 13시간 뒤 제외).
// tm이 지금보다 18시간(12시간 + 시계 오차 여유 6시간) 넘게 앞이면 그 창엔 아직 분석이 있을 수 없다 → 빈 응답이 확실해 안 보낸다.
function _kmaTmUnseen(tm) { return _kmaTmMs(tm) > Date.now() + 18 * 3600e3; }
function _kmaTtl(u) { const m = /[?&]tm=(\d{10,12})/.exec(u); return (m && _kmaTmMs(m[1]) + 6 * 3600e3 <= Date.now()) ? KMA_TTL_PAST : KMA_TTL_RECENT; }
// 다시 불러오기: 최근 시각(새 발표가 나올 수 있는) 기억을 버린다. 지난 시각 기억·진행 중 요청은 그대로.
function _kmaDropRecent() { for (const u of [..._kmaQ.cache.keys()]) if (_kmaTtl(u) < KMA_TTL_PAST) _kmaQ.cache.delete(u); }
// 기상청 한 건 조회 예약 → { p: Promise<본문 | null(실패·비ok·취소)>, cancel() }. prio 작을수록 먼저.
function kmaRequest(u, prio) {
  const Q = _kmaQ;
  const c = Q.cache.get(u);
  if (c && Date.now() - c.t < _kmaTtl(u)) return { p: Promise.resolve(c.text), cancel() {} };
  let job = Q.jobs.get(u);
  if (!job) {
    job = { u, prio, seq: Q.seq++, refs: 0, started: false };
    job.p = new Promise((res) => { job.res = res; });
    Q.jobs.set(u, job); Q.wait.push(job);
  } else if (!job.started && prio < job.prio) job.prio = prio;   // 더 급한 쪽이 같이 기다리면 앞당긴다
  job.refs++;
  let live = true;
  const h = {
    p: job.p,
    cancel() {
      if (!live) return; live = false;
      if (--job.refs > 0 || job.started) return;
      const i = Q.wait.indexOf(job); if (i >= 0) Q.wait.splice(i, 1);
      Q.jobs.delete(u); job.res(null);
    },
  };
  _kmaPumpSoon();
  return h;
}
// 꺼내기는 한 박자(마이크로태스크) 뒤에 — 같은 순간에 줄 선 요청들(태풍·TD, 발생·소멸)이 우선순위대로 섞여 나가게.
function _kmaPumpSoon() { const Q = _kmaQ; if (Q.soon) return; Q.soon = true; Promise.resolve().then(() => { Q.soon = false; _kmaPump(); }); }
function _kmaPump() {
  const Q = _kmaQ;
  while (Q.active < KMA_INFLIGHT_MAX && Q.wait.length) {
    let k = 0;
    for (let i = 1; i < Q.wait.length; i++) { const a = Q.wait[i], b = Q.wait[k]; if (a.prio < b.prio || (a.prio === b.prio && a.seq < b.seq)) k = i; }
    const job = Q.wait.splice(k, 1)[0];
    job.started = true; Q.active++;
    let fin = false, live = 0, timer = null;
    const ctrls = [];
    const end = (text, ac) => {
      live--;
      if (fin || (text == null && live > 0)) return;   // 실패면 남은 쪽을 기다린다
      fin = true; clearTimeout(timer);
      for (const c of ctrls) if (c && c !== ac) { try { c.abort(); } catch (e) { /* 무시 */ } }
      Q.active--; Q.jobs.delete(job.u);
      if (text != null) {
        if (Q.cache.size > 300) { for (const [k2, v] of Q.cache) if (Date.now() - v.t >= _kmaTtl(k2)) Q.cache.delete(k2); }   // 오래된 것 정리
        Q.cache.set(job.u, { t: Date.now(), text });
      }
      job.res(text);
      _kmaPumpSoon();   // 기다리던 쪽이 다음 후보를 줄 세운 뒤에 꺼낸다
    };
    const go = () => {
      const ac = typeof AbortController === 'function' ? new AbortController() : null;
      ctrls.push(ac); live++;
      // no-store: 브라우저 HTTP 캐시를 거치지 않는다 — 같은 주소 두 번째 요청이 첫 요청 끝까지 '캐시 잠금'으로 묶이지 않게(다시 보내기가 실제로 나가게)
      fetch(WNS_HELPER + '/api/kma?u=' + encodeURIComponent(job.u), ac ? { cache: 'no-store', signal: ac.signal } : { cache: 'no-store' })
        .then((r) => (r.ok ? r.text() : null)).catch(() => null).then((text) => end(text, ac));
    };
    go();
    timer = setTimeout(() => { if (!fin && job.refs > 0) go(); }, job.prio < KMA_HEDGE_PRIO ? KMA_HEDGE_MS : KMA_HEDGE_BG_MS);
  }
}
// 후보 주소들 중 '앞에서부터 처음으로 accept(본문, i)가 값을 돌려주는 것'을 찾는다 → { i, text, v } | null.
// 옛 방식(전부 동시에 받은 뒤 앞에서부터 고르기)과 답이 같다 — i번째는 그 앞이 모두 '아님'으로 끝난 뒤에야 판정한다.
// 다른 점은 덜 보낸다는 것: 답이 정해지면 아직 안 보낸 뒤 후보는 취소한다. 실패(null)는 옛 kmaGet처럼 빈 본문('')으로 판정.
//  o.prio(i): 우선순위(기본 i). o.ahead(cur, res): 판정 위치 cur부터 미리 내보내 둘 개수(기본 전부). o.pre: 처음부터 같이 보낼 위치들.
//  o.cover(i) → [j, k] | null: '12시간 창 규칙'(_kmaTmUnseen 위 설명)으로 i를 덮는 양옆 후보. i의 시각이 j·k 사이이고 j·k가 12시간 이내면
//    i에서 맞는(데이터가 있는·근처 스톰이 있는) 스톰은 j나 k에서도 같은 자취로 잡힌다 → j·k가 둘 다 정상 응답으로 '아님'이면 i도 아님(안 묻는다).
//    실패 응답이 끼면 줄이지 않고 직접 묻는다. o.lazy: 덮인 후보는 양옆 결과가 나올 때까지 보내지 않는다(대개 빈 쪽일 때).
// accept가 던지면 남은 조회를 거두고 그 오류로 끝난다(옛 방식처럼 호출한 쪽 catch로 — 멈춘 채 버튼이 잠기지 않게).
function _kmaFirst(urls, accept, o = {}) {
  return new Promise((resolve, reject) => {
    const n = urls.length, res = new Array(n), hs = new Array(n), val = new Array(n);
    const prio = o.prio || ((i) => i);
    let cur = 0, done = false;
    const no = (j) => !!res[j] && res[j].ok && !val[j];   // 정상 응답인데 '아님'
    const cov = (i) => (o.cover ? o.cover(i) : null);
    const skippable = (i) => { const c = cov(i); return !!c && no(c[0]) && no(c[1]); };
    const pending = (i) => { const c = cov(i); return !!c && (!res[c[0]] || !res[c[1]]); };
    const finish = (r, err) => { if (done) return; done = true; for (const h of hs) if (h) h.cancel(); if (err) reject(err); else resolve(r); };
    const send = (i) => {
      if (i >= n || hs[i]) return;
      const h = kmaRequest(urls[i], prio(i)); hs[i] = h;
      h.p.then((t) => {
        if (done) return;
        res[i] = { text: t, ok: t != null };
        try { val[i] = accept(t || '', i); step(); } catch (e) { finish(null, e); }
      });
    };
    const step = () => {
      if (done) return;
      for (;;) {
        if (cur >= n) return finish(null);
        if (res[cur]) { if (val[cur]) return finish({ i: cur, text: res[cur].text || '', v: val[cur] }); cur++; continue; }
        if (skippable(cur)) { cur++; continue; }
        break;
      }
      // cur부터 ahead개(받았거나 보낸 것 포함 — 앞이 늦어도 창이 혼자 앞서 나가지 않게)
      let budget = o.ahead ? o.ahead(cur, res) : n;
      for (let i = cur; i < n && budget > 0; i++) {
        if (skippable(i)) continue;
        if (res[i] || hs[i]) { budget--; continue; }
        if (o.lazy && pending(i)) continue;   // 양옆을 아직 몰라 보류
        send(i); budget--;
      }
      // 안전장치: 기다리는 응답이 하나도 없으면(보류만 남음) 판정 위치를 직접 묻는다 — 멈춰 서지 않게
      if (!hs.some((h, i) => h && !res[i])) send(cur);
    };
    (o.pre || []).forEach(send);
    step();
  });
}
// 시각열(tm 목록)의 덮개: 첫 시각에서 6시간의 홀수 배 떨어진 시각은 그 ±6시간 시각(둘 다 목록에 있을 때, 12시간 간격)이 덮는다.
// 짝수 배 시각은 덮개가 없어(서로 덮지 않아) 늘 직접 묻는다. 시각은 ms로 비교(시간대·날짜 넘김과 무관).
function _kmaCoverTm(tms) {
  const H6 = 6 * 3600e3, ms = tms.map(_kmaTmMs), at = new Map(ms.map((t, i) => [t, i]));
  return (i) => {
    const d = ms[i] - ms[0], k = Math.round(d / H6);
    if (d !== k * H6 || k % 2 === 0) return null;
    const a = at.get(ms[i] - H6), b = at.get(ms[i] + H6);
    return (a == null || b == null) ? null : [a, b];
  };
}
// 지금 태풍(lane 0, typ_now)·열대저압부(lane 1, td_now) 찾기 — 옛 방식은 0~12시간 전 13개 시각을 모두 받아 '데이터 있는 가장 최근'을 골랐다.
// 답은 같게, 보내는 수와 기다림만 줄인다:
//  · 앞(최근)에서부터 차례로 판정하고, 답이 정해지면 뒤 시각은 안 보낸다(_kmaFirst).
//  · 0시간 전 창[tm0−12h, tm0]과 12시간 전 창[tm0−24h, tm0−12h]이 1~11시간 전 창을 모두 덮는다(cover) → 둘 다 정상 응답으로 비었으면
//    1~11도 빈 것이니 묻지 않는다(태풍 없는 철·TD 없을 때 13번 → 2~4번). 데이터가 있거나 실패 응답이 끼면 옛 방식대로 앞에서부터 본다.
//  · 우선순위를 태풍·TD 번갈아(0시간 전 → 12시간 전 → 1, 2, …) 매겨 첫 묶음(동시 6개)에 태풍 0·1·2·12시간 전 + TD 0·12시간 전이 함께 나간다.
//    태풍은 보통 1~3시간 전에 있어 미리 보내고(ahead0=3), TD는 보통 없어 0·12시간 전 결과를 보고 나서 묻는다(lazy).
function _typScanRecent(urlOf, lane, ahead0, lazy) {
  const N = 12, urls = [];
  for (let b = 0; b <= N; b++) urls.push(urlOf(b));
  const tmOf = (u) => _kmaTmMs((/[?&]tm=(\d{10,12})/.exec(u) || [])[1] || '');
  const span = tmOf(urls[0]) - tmOf(urls[N]);   // 보통 정확히 12시간(일광절약시간 지역에선 어긋날 수 있어 확인)
  return _kmaFirst(urls, (t) => typhoonHasRows(t), {
    pre: [N], lazy,
    cover: (i) => ((i > 0 && i < N && span > 0 && span <= 12 * 3600e3) ? [0, N] : null),
    prio: (i) => (i === 0 ? 0 : i === N ? 1 : i + 1) * 2 + lane,
    ahead: (cur, res) => ((res[0] && res[N]) ? 4 : Math.max(0, ahead0 - cur)),   // 0·12시간 전 결과가 다 나오기 전엔 처음 묶음(0~ahead0−1)보다 더 안 보낸다
  });
}
async function fetchTyphoon() {
  if (!apiKey()) { if (typeof apiPop === 'function') apiPop(true); status('apihub 인증키가 필요합니다 (API 설정)', true); return; }
  const btn = $('#typFetch'); if (btn) btn.disabled = true;
  status('태풍 정보 불러오는 중…', true);
  try {
    // 1) 헬퍼 살아있는지 먼저 확인 — 꺼져 있으면 설치/실행 안내 팝업
    let up = false; try { const r = await fetch(WNS_HELPER + '/ping', { cache: 'no-store' }); up = r.ok; } catch (e) { up = false; }
    if (!up) { if (typeof wnsHelperOffNotice === 'function') { status('기능 확장팩(헬퍼)이 응답하지 않아 불러오지 못했습니다', true); wnsHelperOffNotice(); } else status('WNS 헬퍼가 꺼져 있습니다 (R:\\[F]_Util\\WNS 실행)', true); return; }
    _kmaDropRecent();   // 다시 누름 = 최신으로(방금 나온 발표를 30초 기억 때문에 놓치지 않게)
    // 2) 태풍(typ_now)·열대저압부(td_now)를 함께 찾는다 — 둘 다 '데이터 있는 가장 최근 시각'(옛 방식과 같은 답, _typScanRecent).
    //    현재 시각엔 아직 발표가 없을 수 있어 0~12시간 전을 본다. 옛 방식은 태풍 13개를 다 받은 뒤 TD 13개를 받았다.
    const [tHit, dHit] = await Promise.all([_typScanRecent(typhoonApiUrl, 0, 3, false), _typScanRecent(typhoonTdUrl, 1, 1, true)]);
    const raw = tHit ? tHit.text : '', found = !!tHit;
    const tdRaw = dHit ? dHit.text : '';
    if (tdRaw) console.log('[TD raw]', tdRaw.slice(0, 2000));
    if (!found && !tdRaw) { status('현재 활동 중인 태풍·열대저압부 정보가 없습니다 (기상청)', true); return; }
    console.log('[typhoon raw]', raw.slice(0, 3000));
    const okTyp = applyTyphoonText(raw, tdRaw);   // 태풍·TD를 각자 형식으로 파싱해 병합(TD→태풍 트랙)
    // 3) 기본값: 발생·소멸 열대저압부(실좌표)를 앞뒤로 자동 부착(실패해도 태풍만 표시).
    //    태풍은 이미 그렸으니 기다리지 않는다 — 뒤에서 찾아 붙으면 트랙·상태 문구만 갱신(버튼도 바로 다시 누를 수 있게).
    //    (붙이기 실패는 태풍 불러오기 실패가 아니다 — 문구는 attachEdgeTD가 '불러옴'으로 되돌린다)
    if (okTyp) attachEdgeTD(true, ($('#status') || {}).textContent || '').catch((e) => console.warn('[발생·소멸 TD 자동 붙이기]', e));
  } catch (e) {
    status('태풍 API 실패: ' + (e.message || e), true);
  } finally { if (btn) btn.disabled = false; }
}
// apihub td_now.php — 열대저압부(TD) 현재+예측. typ_now와 같은 authKey·형식(CSV). disp=1로 CSV 요청.
function typhoonTdUrlTm(tm) { return `https://apihub.kma.go.kr/api/typ01/url/td_now.php?tm=${tm}&mode=1&disp=0&help=0&authKey=${encodeURIComponent(apiKey())}`; }
function typhoonTdUrl(back) { const d = new Date(); if (back) d.setHours(d.getHours() - back); return typhoonTdUrlTm(_kmaTm(d)); }
// 과거 태풍 찾기: 고른 날짜 정오(base) 기준 아래 순서로 시각을 훑어 '처음 데이터 있는 발표'와 그 시각 TD → { raw, usedTm, tdRaw } | null
// 옛 방식은 이 순서대로 하나씩 차례로 물었다(없으면 17번 × 왕복). 같은 순서의 '처음 데이터 있는 시각'을 고르되 몇 개씩 동시에 묻는다(_kmaFirst).
// 아직 분석이 있을 수 없는 먼 미래 시각은 빈 응답이 확실해 뺀다(순서·답은 그대로). ±6·18·30·42시간은 양옆(±6시간)이 덮어
// 둘 다 비었으면 묻지 않는다(그날 태풍이 없으면 17번 → 9번).
async function _typPastFind(base) {
  const offs = [0, -6, 6, -12, 12, -18, 18, -24, 24, -30, 30, -36, 36, -42, 42, -48, 48];   // 정오 기준 ±(시간)
  const tms = offs.map((off) => _kmaTm(new Date(base.getTime() + off * 3600e3))).filter((tm) => !_kmaTmUnseen(tm));
  const tdHead = tms.length ? kmaRequest(typhoonTdUrlTm(tms[0]), 1) : null;   // 가장 흔한 경우(정오에 바로 있음)를 위해 그 시각 TD도 같이
  const hit = await _kmaFirst(tms.map(typhoonApiUrlTm), (t) => typhoonHasRows(t), { prio: (i) => (i ? i + 1 : 0), cover: _kmaCoverTm(tms), lazy: true, ahead: (cur) => (cur ? 6 : 2) });
  if (!hit) { if (tdHead) tdHead.cancel(); return null; }
  const usedTm = tms[hit.i];
  let tdT;
  if (hit.i === 0) tdT = await tdHead.p;
  else { if (tdHead) tdHead.cancel(); tdT = await kmaRequest(typhoonTdUrlTm(usedTm), 0).p; }
  return { raw: hit.text, usedTm, tdRaw: (tdT && typhoonHasRows(tdT)) ? tdT : '' };   // TD 없어도 태풍만
}
// 과거 태풍 — 고른 날짜(정오 기준) ±2일 범위의 발표시각을 훑어 데이터 있는 발표를 찾아 그린다. 이름은 별도 입력.
async function fetchTyphoonPast() {
  const inp = $('#typPastDate'); const ds = inp ? inp.value.trim() : '';
  if (!ds) { status('날짜를 먼저 고르세요 (예: 2024-07-24)', true); return; }
  if (!apiKey()) { if (typeof apiPop === 'function') apiPop(true); status('apihub 인증키가 필요합니다 (API 설정)', true); return; }
  const base = new Date((ds.length <= 10 ? ds + 'T12:00:00' : ds));
  if (isNaN(+base)) { status('날짜 형식을 확인하세요 (예: 2024-07-24)', true); return; }
  const btn = $('#typPastFetch'); if (btn) btn.disabled = true;
  status('과거 태풍 불러오는 중…', true);
  try {
    let up = false; try { const r = await fetch(WNS_HELPER + '/ping', { cache: 'no-store' }); up = r.ok; } catch (e) { up = false; }
    if (!up) { if (typeof wnsHelperOffNotice === 'function') { status('기능 확장팩(헬퍼)이 응답하지 않아 불러오지 못했습니다', true); wnsHelperOffNotice(); } else status('WNS 헬퍼가 꺼져 있습니다', true); return; }
    _kmaDropRecent();   // 오늘 날짜를 고른 경우 최근 시각도 새로
    const found = await _typPastFind(base);
    if (!found) { status('그 날짜엔 활동 중인 태풍이 없습니다 (±2일 확인) — 다른 날짜로 시도하세요', true); return; }
    const { raw, usedTm, tdRaw } = found;
    const ok = applyTyphoonText(raw, tdRaw);
    if (ok) { if (S.map.s > 0.5) setTyphoonDefaultView(); status(`과거 태풍 불러옴 · ${usedTm.slice(0, 4)}-${usedTm.slice(4, 6)}-${usedTm.slice(6, 8)} 발표 기준 — 이름은 '이름' 칸에 입력`, true); }
  } catch (e) {
    status('과거 태풍 실패: ' + (e.message || e), true);
  } finally { if (btn) btn.disabled = false; }
}
// apihub typ_now.php — 특보와 같은 apihub authKey 사용(apiKey). back=몇 시간 전(발표 없는 최신시각 회피), mode=1(분석+예측), disp=1(CSV).
const _kmaTm = (d) => { const p = (v) => String(v).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}00`; };
function typhoonApiUrlTm(tm) { return `https://apihub.kma.go.kr/api/typ01/url/typ_now.php?tm=${tm}&mode=1&disp=1&help=0&authKey=${encodeURIComponent(apiKey())}`; }
function typhoonApiUrl(back) { const d = new Date(); if (back) d.setHours(d.getHours() - back); return typhoonApiUrlTm(_kmaTm(d)); }
