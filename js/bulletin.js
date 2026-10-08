/* [모듈] js/bulletin.js — 기상예보 파싱·색(기온/강수), 통보문 강수량 붙여넣기(용어 사전·지역 표현 파서·applyBulletin) */
'use strict';

// ===================== 기상예보 자동 색칠 =====================
// 예보는 특보와 달리 구역코드가 완전히 다르다 (예보 11B20705 / 특보 L1010100).
// 그래서 '예보구역 이름'으로 우리 지도 조각을 찾는다. 163개 중 163개가 이어지는 걸 확인했다.
//
// 세 가지를 쓴다:
//   단기육상 fct_afs_dl : 203개 도시, 05/11/17시 발표, 하늘상태·강수·기온·강수확률
//   중기육상 fct_afs_wl : 15개 광역,  06/18시 발표
//   중기기온 fct_afs_wc : 203개 도시, 최저/최고 기온
// grain = 예보가 실제로 오는 단위. 'city' = 203개 도시, 'wide' = 광역 15개.
// 어느 지도에 칠할지는 못박지 않는다 — 두 지도 다 되고, 단위가 안 맞으면 아래서 맞춘다.
//   도시 예보 -> 시도 지도  : 그 시도 안 시군들의 최빈값으로 합친다
//   광역 예보 -> 시도군 지도 : 그 광역 안 시군에 그대로 펼친다 (강원 영서/영동이 제대로 갈린다)
const FCT_KINDS = {
  dl: { label: '단기 · 육상', api: 'fctLand',    grain: 'city', style: 'sgg',  hint: '시군별 하늘·비/눈 · 05/11/17시 발표' },
  wl: { label: '중기 · 육상', api: 'fctMedLand', grain: 'wide', style: 'sgg',  hint: '광역별 3~10일 뒤 · 06/18시 발표' },
  wc: { label: '중기 · 기온', api: 'fctMedTa',   grain: 'city', style: 'sgg',  hint: '시군별 최저·최고 기온' },
};
let fctKind = 'dl';
let fctRows = [];   // 붙여넣은 예보 전부
let fctWhen = '';   // 발표일 (YYYYMMDD). 비어 있으면 오늘.
let fctPaintSig = {};   // 지도별 '예보가 마지막으로 칠한 내용' — 그 뒤 통보문·손칠·불러오기로 바뀌었으면 예보로 덮지 않는다
// 이 지도의 칠이 비어 있거나 아직 예보가 칠한 그대로면 true
function fctOwnsFills(st) {
  const cur = S.fillsByStyle[st] || {};
  return !Object.keys(cur).length || fctPaintSig[st] === JSON.stringify(cur);
}

// 예보구역코드 -> 우리 지도 조각. build/06-fct-zones.js 가 구워 넣는다.
// 예보 응답에는 구역코드만 있고 이름이 없어서, 이름표를 앱에서 따로 받아야 하는데
// 브라우저는 CORS 때문에 기상청을 직접 못 부른다. 그래서 미리 이어서 굽는다.
const FCT_ZONES = window.FCT_ZONES || { city: {}, wide: {} };
const fctZoneOf = (regId) => FCT_ZONES.city[regId] || null;

// 예보 응답은 공백으로 나뉜다 (특보는 쉼표). 예보문구는 따옴표로 묶여 온다.
// 열 위치가 종류마다 달라서 헤더의 '# REG_ID TM_FC ...' 줄을 읽어 이름으로 집는다.
function parseFct(txt) {
  const lines = String(txt).split(/\r?\n/);
  let cols = null;
  const out = [];
  for (const line of lines) {
    if (/^#\s*REG_ID\s/.test(line)) { cols = line.replace(/^#\s*/, '').trim().split(/\s+/); continue; }
    if (!line || line.trim().startsWith('#') || /7777END/.test(line)) continue;
    // "흐리고 한때 비" 처럼 따옴표 안에 공백이 있다 — 통째로 한 칸으로 잡는다
    const p = line.trim().match(/"[^"]*"|\S+/g);
    // 예보구역코드는 11A00101 처럼 숫자만이 아니라 문자가 섞여 있다
    if (!p || !/^[0-9A-Z]{8}$/.test(p[0])) continue;
    const r = {};
    if (cols) cols.forEach((c, i) => { r[c] = p[i] == null ? '' : p[i].replace(/^"|"$/g, ''); });
    else { r.REG_ID = p[0]; r.TM_FC = p[1]; r.TM_EF = p[2]; }
    if (!/^\d{12}$/.test(r.TM_FC || '')) continue;
    out.push(r);
  }
  return out;
}

// 기온은 어느 쪽을 볼지 + 몇 도 단위로 묶을지.
// 값 하나하나를 목록에 세우면 40줄이 나와서 못 쓴다 — 방송 CG는 보통 5도 구간으로 묶는다.
let fctTaField = 'MAX';   // MIN(아침최저) / MAX(낮최고)
let fctTaStep = 5;

// 25 -> '25~29°' (5도 구간). 음수도 바닥이 맞게 내려가야 한다 (-3 -> -5~-1)
function taBand(v) {
  const n = Math.floor(v / fctTaStep) * fctTaStep;
  return `${n}~${n + fctTaStep - 1}°`;
}
const taSort = (label) => parseInt(label, 10);

// 예보 한 줄이 무엇으로 불릴지 — 이게 목록의 한 항목이 되고, 색도 이 단위로 붙는다
function fctLabelOf(r) {
  if (fctKind === 'wc') {
    const v = parseInt(r[fctTaField], 10);
    if (!isFinite(v) || v <= -90) return null;   // -99 = 값 없음
    return taBand(v);
  }
  return (r.WF || '').trim() || '(예보문구 없음)';
}

const rampCol = (nm, s) => RAMPS.find((x) => x.name === nm).cols[s];

// 기온 색은 '그 날 데이터 안에서 몇 번째'가 아니라 '실제 몇 도인가'로 정한다.
// 상대적으로 매기면 한여름 20도가 그 날의 최저라는 이유로 한파색(진한 남색)이 돼버리고,
// 날마다 같은 기온이 다른 색으로 나가서 CG끼리 비교가 안 된다.
const TA_SCALE = [
  [-15, ['파랑', 7]], [-10, ['파랑', 6]], [-5, ['파랑', 5]], [0, ['파랑', 4]],
  [5, ['파랑', 3]], [10, ['파랑', 2]], [15, ['노랑', 2]], [20, ['노랑', 3]],
  [25, ['빨강', 3]], [30, ['빨강', 5]], [35, ['빨강', 7]],
];
function taColor(v) {
  let hit = TA_SCALE[0][1];
  for (const [t, c] of TA_SCALE) if (v >= t) hit = c;
  return rampCol(hit[0], hit[1]);
}

// 자동으로 색을 준다. 사람이 하나하나 고르게 하면 아무도 안 쓴다.
function fctAutoColor(label, i, n) {
  const R = rampCol;
  if (fctKind === 'wc') return taColor(taSort(label));
  if (/눈/.test(label) && /비/.test(label)) return R('파랑', 2);
  if (/눈/.test(label)) return R('무채색', 1);
  if (/소나기/.test(label)) return R('파랑', 3);
  if (/비/.test(label)) return R('파랑', 4);
  if (/흐림|흐리/.test(label)) return R('무채색', 4);
  if (/구름많음/.test(label)) return R('무채색', 3);
  if (/구름조금/.test(label)) return R('파랑', 1);
  if (/맑음/.test(label)) return R('파랑', 0);
  return R('무채색', Math.min(7, i));
}

// ===================== 통보문 강수량 붙여넣기 =====================
// 기상청 통보문의 강수량 줄을 파싱해 시도 지도에 자동으로 칠한다(+숫자 라벨).
// 예)  - (충청권) 대전.세종.충남, 충북: 20~60mm
//      - (경상권) 부산.울산.경남: 30~80mm/ 대구.경북: 20~60mm

// 강수량(mm 최댓값) -> 색. 방송 강수 CG의 파랑 계열.
const RAIN_SCALE = [
  [0, '#C5D8F5'], [5, '#93A9E5'], [10, '#6485E6'], [20, '#3A6FEE'],
  [40, '#0C46DC'], [60, '#1740C0'], [80, '#1B3AA0'], [120, '#1E3480'],
];
function rainColor(mm) { let c = RAIN_SCALE[0][1]; for (const [t, h] of RAIN_SCALE) if (mm >= t) c = h; return c; }

// ── 기상청 예보용어(장소표현) 매핑 — kma_place_terms.json 내장 ──
// '중부내륙·북부내륙·산지·해안'처럼 방향만으론 애매한 표현을, 기상청이 정한 '정확한 시군 목록'으로 칠하기 위한 기준표.
const KMA_TERMS = {
  방위별_분류: {
    수도권: {
      서울: { 서울서북: ['서울서북권'], 서울서남: ['서울서남권'], 서울동북: ['서울동북권'], 서울동남: ['서울동남권'] },   // sgg 지도가 서울을 4권역으로 세분(도형은 특보 스타일에서 복사). 구 단위는 아님.
      인천: ['인천'], 경기북서부: ['고양','파주','양주','김포','의정부','인천(강화)'], 경기북동부: ['포천','동두천','가평','연천','남양주','구리'],
      경기남서부: ['수원','성남','용인','부천','광명','안양','과천','시흥','군포','의왕','안산','오산','화성','평택','안성'], 경기남동부: ['하남','광주','이천','양평','여주'],
      조합표현: { 경기북부: '경기북서부+경기북동부', 경기서부: '경기북서부+경기남서부', 경기동부: '경기북동부+경기남동부', 경기남부: '경기남서부+경기남동부', 수도권: '서울+인천+경기북부+경기남부' } },
    강원도: { 강원영서북부: ['철원','화천','양구','인제'], 강원영서중부: ['춘천','홍천'], 강원영서남부: ['원주','횡성','영월','평창','정선'], 강원영동북부: ['고성','속초','양양'], 강원영동중부: ['강릉'], 강원영동남부: ['태백','동해','삼척'],
      조합표현: { 강원영서: '강원영서북부+강원영서중부+강원영서남부', 강원영동: '강원영동북부+강원영동중부+강원영동남부', 강원북부: '강원영서북부+강원영동북부', 강원중부: '강원영서중부+강원영동중부', 강원남부: '강원영서남부+강원영동남부' } },
    충청권: { 충북북부: ['충주','제천','음성','단양'], 충북중부: ['청주','증평','진천','괴산'], 충북남부: ['보은','옥천','영동'], 대전: ['대전'], 세종: ['세종'], 충남북부: ['천안','아산','예산','서산','당진','태안','홍성'], 충남남부: ['공주','논산','계룡','금산','부여','청양','보령','서천'],
      조합표현: { 충청권북부: '충북북부+충남북부', 충청권남부: '충북남부+충남남부', 충남권남부: '대전+충남남부', 충남권북부: '세종+충남북부', 충북중북부: '충북중부+충북북부', 충북중남부: '충북중부+충북남부' } },
    전라권: { 전북북서부: ['전주','익산','완주','군산','김제'], 전북북동부: ['무주','진안','장수'], 전북남서부: ['정읍','고창','부안'], 전북남동부: ['남원','임실','순창'], 광주: ['광주'], 전남북서부: ['장성','나주','함평','영광'], 전남북동부: ['담양','곡성','구례','순천','화순'], 전남남서부: ['목포','영암','무안','신안','해남','진도','흑산도'], 전남남동부: ['여수','광양','고흥','보성','장흥','강진','완도'],
      조합표현: { 전라권서부: '전북북서부+전북남서부+전남북서부+전남남서부', 전라권동부: '전북북동부+전북남동부+전남북동부+전남남동부', 전남권북서부: '광주+전남북서부' } },
    경상권: { 대구: ['대구'], 경북북부: ['상주','문경','예천','영주','영양','봉화','안동','의성','청송','영덕','울진'], 경북남부: ['영천','경산','청도','칠곡','김천','구미','군위','고령','성주','포항','경주'], 부산: ['부산'], 울산: ['울산'], 경남중부: ['밀양','의령','함안','창녕','창원'], 경남동부: ['양산','김해'], 경남서부: ['진주','하동','산청','함양','거창','합천','통영','사천','거제','고성','남해'],
      조합표현: { 경남중서부: '경남중부+경남서부', 경남중동부: '경남중부+경남동부', 경북권남부: '대구+경북남부', 경남권동부: '부산+울산+경남동부', 경상권남부: '경북남부+경남중부+경남동부+경남서부' } },
    // 제주도 — 예보용어(2025.06 PDF)는 읍·면까지 나누지만 앱 시군 지도는 제주시·서귀포시 2개뿐이라 그 2개로 수렴. 북부=제주시, 남부=서귀포시, 동/서부는 두 시에 걸쳐 둘 다.
    제주도: { 제주도동부: ['제주시동부','서귀포시동부'], 제주도서부: ['제주시서부','서귀포시서부'], 제주도남부: ['서귀포시남부'], 제주도북부: ['제주시북부'],
      제주동부: ['제주시동부','서귀포시동부'], 제주서부: ['제주시서부','서귀포시서부'], 제주남부: ['서귀포시남부'], 제주북부: ['제주시북부'],
      조합표현: { 제주도: '제주도북부+제주도남부+제주도동부+제주도서부' } },
  },
  지형특성별_분류: {
    서해안: { 인천: ['인천'], '경기북부(서)해안': ['김포','인천(강화)'], '경기남부(서)해안': ['시흥','안산','화성','평택'], '충남북부(서)해안': ['서산','당진','홍성','태안'], '충남남부(서)해안': ['보령','서천'], '전북북부(서)해안': ['군산','김제'], '전북남부(서)해안': ['고창','부안'], 전남북부서해안: ['영광','함평'], 전남중부서해안: ['목포','영암','무안','신안'], 전남남부서해안: ['진도'] },
    남해안: { 전남동부남해안: ['여수','광양','고흥','보성'], 전남서부남해안: ['장흥','강진','해남','완도'], 부산: ['부산'], 경남중부남해안: ['창원'], 경남서부남해안: ['통영','사천','거제','고성','남해'] },
    동해안: { 울산: ['울산'], '경북북부(동)해안': ['영덕','울진'], '경북남부(동)해안': ['포항','경주'], '강원북부(동)해안': ['고성','속초','양양'], '강원중부(동)해안': ['강릉'], '강원남부(동)해안': ['동해','삼척'], 제주도해안: ['제주시북부','제주시동부','제주시서부','서귀포시남부','서귀포시동부','서귀포시서부'], 제주해안: ['제주시북부','제주시동부','제주시서부','서귀포시남부','서귀포시동부','서귀포시서부'],
      조합표현: { 강원동해안: '강원북부동해안+강원중부동해안+강원남부동해안', 경북동해안: '경북북부동해안+경북남부동해안' } },
    중부내륙: { 서울: ['서울서북권','서울서남권','서울동북권','서울동남권'], 경기북서내륙: ['고양','파주','양주','의정부'], 경기북동내륙: ['포천','동두천','가평','연천','남양주','구리'], 경기남서내륙: ['수원','성남','용인','부천','광명','안양','과천','군포','의왕','오산','안성'], 경기남동내륙: ['하남','광주','이천','양평','여주'], 강원북부내륙: ['철원','화천','양구','인제'], 강원중부내륙: ['춘천','홍천'], 강원남부내륙: ['원주','횡성','영월','평창','정선'], 충북내륙: { 시군: ['충주','제천','음성','단양','청주','증평','진천','괴산','보은','옥천','영동'] }, 대전: ['대전'], 세종: ['세종'], 충남북부내륙: ['천안','아산','예산'], 충남중부내륙: ['공주','계룡'], 충남남동내륙: ['논산','금산'], 충남남서내륙: ['부여','청양'],
      조합표현: { 충남남부내륙: '충남남동내륙+충남남서내륙', 충청권내륙: '충북내륙+충남북부내륙+충남중부내륙+충남남동내륙+충남남서내륙', 충청내륙: '충청권내륙' } },
    남부내륙: { 전북중부내륙: ['전주','익산','완주','정읍'], 전북북동내륙: ['진안','무주','장수'], 전북남동내륙: ['남원','임실','순창'], 광주: ['광주'], 전남중부내륙: ['담양','장성','나주','화순'], 전남동부내륙: ['곡성','구례','순천'], 대구: ['대구'], 경북북서내륙: ['상주','문경','예천'], 경북북동내륙: ['봉화','영양','영주'], 경북중북부내륙: ['안동','의성','청송'], 경북남서내륙: ['김천','구미','칠곡','고령','성주'], 경북중남부내륙: ['영천','경산','청도','군위'], 경남동부내륙: ['김해','양산'], 경남중부내륙: ['밀양','의령','함안','창녕'], 경남남서내륙: ['진주','하동','산청'], 경남북서내륙: ['함양','거창','합천'],
      조합표현: { 전북동부내륙: '전북북동내륙+전북남동내륙', 경북북부내륙: '경북북서내륙+경북북동내륙+경북중북부내륙', 경북남부내륙: '경북남서내륙+경북중남부내륙', 경북중부내륙: '경북중북부내륙+경북중남부내륙', 경북서부내륙: '경북북서내륙+경북남서내륙', 경남서부내륙: '경남남서내륙+경남북서내륙' } },
    산지: { 강원북부산지: ['속초','인제','고성','양양','양구'], 강원중부산지: ['강릉','평창','홍천'], 강원남부산지: ['동해','삼척','정선'], 태백: ['태백'], 경북북동산지: ['영양','봉화','울진'], 제주도산지: ['제주도산지'], 제주산지: ['제주도산지'],
      조합표현: { 강원산지: '강원북부산지+강원중부산지+강원남부산지' } },
    // 제주도 중산간(해발 200~600m) — 북부=제주시, 남부=서귀포시. 앱 시군 지도는 시 단위라 그 2개로.
    중산간: { 제주도북부중산간: ['제주시중산간'], 제주도남부중산간: ['서귀포시중산간'], 제주북부중산간: ['제주시중산간'], 제주남부중산간: ['서귀포시중산간'], 제주중산간: ['제주시중산간','서귀포시중산간'],
      조합표현: { 제주도중산간: '제주도북부중산간+제주도남부중산간' } },
    섬: ['인천','울릉','추자','신안','여수'],
    지리산부근: ['남원','구례','하동','산청','함양'],
  },
};
// 괄호·점 뒤 제거(공통). JSON 이름은 이미 접미사가 없으므로 접미사 제거를 하면 안 된다('양구'의 끝 '구'까지 벗겨지는 사고 방지).
const _stripParen = (s) => String(s).replace(/\([^)]*\)/g, '').replace(/[.·].*$/, '').trim();
const jsonBase = (s) => _stripParen(s);                                                          // 기준표(JSON) 시군명 — 접미사 유지
const zoneBase = (s) => _stripParen(s).replace(/(특별자치시|특별자치도|광역시|특별시|시|군|구)$/, ''); // 존 시군명 — 접미사(시/군/구) 제거
const termNorm = (s) => String(s).replace(/[\s()]/g, '');
const TERM_PROV_PREFIX = ['강원','충북','충남','충청권','전북','전남','전라권','경북','경남','경상권','경기','수도권'];
// 용어 -> [시군 기본명] 평탄화 지도. 조합표현은 재귀로 풀되, 짧은 이름은 도 접두를 붙여 찾아본다.
let _termMap = null;
function termMap() {
  if (_termMap) return _termMap;
  const map = {}, combos = {};
  const walk = (obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k === '조합표현') { for (const [ck, cv] of Object.entries(v)) combos[termNorm(ck)] = cv; continue; }
      if (k === '비고' || k === '시군') continue;
      if (Array.isArray(v)) map[termNorm(k)] = v.map(jsonBase);
      else if (v && typeof v === 'object') { if (Array.isArray(v.시군)) map[termNorm(k)] = v.시군.map(jsonBase); else walk(v); }
    }
  };
  walk(KMA_TERMS.방위별_분류); walk(KMA_TERMS.지형특성별_분류);
  const resolve = (name, seen) => {
    name = termNorm(name);
    if (map[name]) return map[name];
    if (seen.has(name)) return null; seen.add(name);
    const expr = combos[name]; if (!expr) return null;
    const out = [];
    for (let part of expr.split('+')) {
      part = termNorm(part);
      let r = map[part] || resolve(part, seen);
      if (!r) for (const pre of TERM_PROV_PREFIX) { const key = pre + part; if (map[key] || combos[key]) { r = map[key] || resolve(key, seen); if (r) break; } }
      if (r) out.push(...r);
    }
    return out.length ? out : null;
  };
  for (const c of Object.keys(combos)) { const r = resolve(c, new Set()); if (r && r.length && !map[c]) map[c] = [...new Set(r)]; }
  _termMap = map;
  return map;
}
// 통보문 지역 표현 -> 기상청 기준 시군 기본명 목록(없으면 null). 예: '충남남부내륙','강원북부산지','경기북부'.
function termSiguns(regionStr) {
  const m = termMap();
  const key = termNorm(regionStr);
  return m[key] || null;
}

// ── 통보문 지역 파싱 ──
// 도 이름을 '먼저' 떼어 방향과 안 섞는다. (예전엔 '전북서부'가 정규식 '북서부'에 걸려 '전'으로 잘렸다.)
const BUL_PROVS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
// 도 안에서 방향으로는 잘 안 갈리는 '해안' 구역은 알려진 시군으로 콕 집는다.
// 특히 강원 동해안은 태백산맥 때문에 내륙과 날씨가 자주 달라 반드시 따로 칠해야 한다. (키: '도|동해안' 등, 값: 시군 이름)
const COAST_ZONES = {
  '강원|동해안': ['강릉시', '속초시', '동해시', '삼척시', '양양군', '고성군'],
};
const BUL_ALIAS = { 강원도: '강원', 제주도: '제주', 전라북도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 충청북도: '충북', 충청남도: '충남', 경기도: '경기' };
// 섬/특수 구역 -> 대표 시군 이름(시군 지도에서 그 시군을 칠한다). 서해5도는 옹진(인셋에 크게 보인다).
const BUL_ISLAND = { 서해5도: '옹진', 백령도: '옹진', 대청도: '옹진', 연평도: '옹진', 울릉도: '울릉', 독도: '울릉', 울릉도독도: '울릉' };
// 방향 문자열 -> 방위 코드. 문자열에서 '먼저' 나오는 방향을 우선한다(북부서해안 -> 북).
function bulDir(dir) {
  const m = (dir || '').match(/남서|남동|북서|북동|남|북|서|동|중/);
  return m ? { 남서: 'SW', 남동: 'SE', 북서: 'NW', 북동: 'NE', 남: 'S', 북: 'N', 서: 'W', 동: 'E', 중: 'C' }[m[0]] : '';
}
// 한 토큰 -> {province,dir} 또는 {island}. 도 접두를 먼저 매칭('전북서부' -> 전북 + '서부').
function bulToken(raw) {
  let t = (raw || '').replace(/\s/g, '');
  if (!t || /^\d+(?:\.\d+)?$/.test(t)) return null;   // 숫자만인 조각은 지역이 아니다
  // '(남해안 제외)'·'남해안제외' — 제외 문구는 따로 뗀다. 방향으로 읽으면 '남'을 잡아 제외할 쪽만 칠한다.
  let exclude = '';
  const exM = t.match(/\(([^()]*)제외\)/);
  if (exM) { exclude = exM[1]; t = t.replace(exM[0], ''); if (!t) return null; }
  const withEx = (tk) => (exclude ? Object.assign(tk, { exclude }) : tk);
  if (BUL_ISLAND[t]) return { island: BUL_ISLAND[t] };
  if (BUL_ALIAS[t]) return withEx({ province: BUL_ALIAS[t], dir: '' });
  for (const p of BUL_PROVS) if (t.startsWith(p)) {
    let dir = t.slice(p.length);
    if (!exclude && dir.length > 2 && /제외$/.test(dir)) { exclude = dir.slice(0, -2); dir = ''; }
    return withEx({ province: p, dir });
  }
  return { province: null, dir: t };   // 도 없이 방향만(앞 도에 붙는다) 또는 미지
}

// 지역 문자열 -> 토큰들. 도 없는 방향(예: '경북중.북부'의 '북부')은 바로 앞 도에 이어붙인다.
// ctxProv: 앞에 도가 없을 때 붙일 도(예: '많은 곳 산지'는 그 줄의 도).
function bulTokens(regionStr, ctxProv) {
  const raws = String(regionStr).split(/[.,·]/).map((r) => r.trim()).filter(Boolean);
  const tokens = []; let cur = ctxProv || null;
  for (const r of raws) {
    const tk = bulToken(r); if (!tk) continue;
    if (tk.island) { tokens.push(tk); continue; }
    if (tk.province) { cur = tk.province; tokens.push(tk.exclude ? { province: tk.province, dir: tk.dir, exclude: tk.exclude } : { province: tk.province, dir: tk.dir }); }
    else if (cur) tokens.push({ province: cur, dir: tk.dir });
    else tokens.push({ province: null, dir: tk.dir });   // 도 접두 없는 권역 표현(전라권서부 등) — applyBulletin에서 기준표로 해석
  }
  return tokens;
}

function parseBulletin(txt) {
  const groups = [];
  for (let line of String(txt).split(/\r?\n/)) {
    // HWP·PDF 복사본의 긴 줄표(–—−)·전각 콜론(：)도 같은 줄로 읽는다(안 그러면 그 지역만 말없이 빠진다).
    line = line.trim().replace(/：/g, ':').replace(/^[–—−]/, '-');
    if (!/^[-‐·•∙]/.test(line)) continue;         // 강수량 줄은 - 로 시작
    line = line.replace(/^[-‐·•∙]\s*/, '').replace(/^\([^)]*\)\s*/, '');  // 앞의 (권역, 날짜) 제거
    let carry = '';                                 // '대구/경북: …'처럼 지역을 / 로 나눈 앞 조각(콜론 없음)은 다음 조각 지역에 붙인다
    for (let part of line.split('/')) {            // 한 줄에 값이 여러 개면 / 로 나뉜다
      // 숫자가 든 조각('/ 많은 곳 100mm 이상 /' 등)은 지역이 아니니 붙이지 않는다(붙이면 다음 지역이 '못 찾음'이 된다).
      if (part.indexOf(':') < 0) { if (part.trim() && !/\d/.test(part)) carry += part.trim() + '.'; continue; }
      part = carry + part; carry = '';
      const c = part.indexOf(':');
      let valStr = part.slice(c + 1);
      // 조각 앞머리의 (날짜/권역) 도 벗긴다. 예: "/ (22일) 대구.경북남부내륙" → "대구.경북남부내륙"
      // (안 벗기면 '대구'가 '(22일)대구'로 붙어 도 인식 실패 → 대구를 못 찾는다.)
      const regionStr = part.slice(0, c).trim().replace(/^\([^)]*\)\s*/, '');
      // '많은 곳 (지역) N(mm) 이상' = 국지적으로 더 많은 곳 → 본 구간과 '따로' 더 진하게 칠한다.
      // 지역은 '많은 곳' 뒤·앞에 오거나 아예 없다. 지역 칸엔 숫자를 안 받는다
      // (받으면 '많은 곳 150mm'의 '1'을 지역으로 먹고 값이 '50'으로 잘린다).
      const many = valStr.match(/([가-힣.·,\s]*?)\s*많은\s*곳\s*([가-힣A-Za-z.·,\s]*?)\s*(?<![\d.])(\d+(?:\.\d+)?)\s*(?:mm|㎜|밀리|미리|cm|㎝)?\s*이상/);
      if (many) valStr = valStr.slice(0, many.index) + ' ' + valStr.slice(many.index + many[0].length);   // 본 구간 값에서 그 문구 제거(150 안 섞이게)
      const nums = (valStr.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n >= 0);
      const tokens = bulTokens(regionStr);
      let baseG = null;
      if (tokens.length && nums.length) {
        const labelTxt = nums.length > 1 ? `${Math.min(...nums)}~${Math.max(...nums)}` : `${nums[0]}`;
        groups.push(baseG = { tokens, max: Math.max(...nums), labelTxt, regionText: regionStr });
      }
      // 많은 곳 → 별도 그룹. 본 구간보다 뒤에 push 해서(우선순위 높게), max 를 크게 줘서 램프에서 가장 진한 색.
      if (many) {
        const mnum = Number(many[3]);
        const provs = [...new Set(tokens.map((tk) => tk.province).filter(Boolean))];
        const ctx = provs.length === 1 ? provs[0] : null;   // 도 없는 '산지' 등은 이 줄의 도에 붙인다
        const clean = (s) => String(s || '').replace(/^[\s(.,·]+|[\s).,·]+$/g, '').trim();
        // 지역으로 읽을 수 있는 토큰만(앞에 붙은 '예상' 같은 말을 지역으로 오인하지 않게)
        const known = (tk) => tk.island
          || (tk.province && (!tk.dir || bulDir(tk.dir) || /산지|해안|내륙|도서/.test(tk.dir) || termSiguns(tk.province + tk.dir)))
          || (!tk.province && tk.dir && termSiguns(tk.dir));
        // 지역은 '많은 곳' 뒤 → 앞 순. 둘 다 없으면 어디인지 몰라 덧칠하지 않는다
        // (그 줄 지역 전체를 덧칠하면 본 구간 색·라벨이 통째로 덮여 '전역 150 이상'처럼 보인다).
        let mreg = '', mtok = [];
        for (const cand of [clean(many[2]), clean(many[1])]) {
          if (!cand) continue;
          const tk = bulTokens(cand, ctx);
          if (tk.length && tk.every(known)) { mreg = cand; mtok = tk; break; }
        }
        if (mtok.length && mnum > 0) groups.push({ tokens: mtok, max: mnum + 0.5, labelTxt: `${many[3]}⬆`, regionText: `${mreg} ${many[3]}⬆`, many: true });
        else if (baseG && mnum > 0) baseG.regionText += ` (많은 곳 ${many[3]}⬆)`;   // 자리를 몰라 덧칠은 안 하지만 색 목록엔 적어 둔다
      }
    }
  }
  // 같은 지역이 여러 줄(날짜별 등)이면 큰 값 하나만 남긴다 — 경로마다(기준표/방향/시도) 이기는 줄이 달라지고
  // 진 쪽 색은 칠한 곳 없이 목록에만 남아 라벨이 사라졌다.
  const keyOf = (g) => (g.many ? 'M|' : 'B|') + g.tokens.map((tk) => tk.island ? 'I:' + tk.island : `${tk.province || ''}:${termNorm(tk.dir || '')}:${tk.exclude || ''}`).sort().join(',');
  const best = new Map();
  for (const g of groups) { const k = keyOf(g), b = best.get(k); if (!b || g.max > b.max) best.set(k, g); }
  return groups.filter((g) => best.get(keyOf(g)) === g);
}

// 한 도의 시군들을 방향 스펙에 나눠 담는다 — 각 시군을 '가장 잘 맞는 방향'에 배정(중심 좌표 기준).
// 반환: Map(spec -> [zoneId...]). 이걸로 전북 서/동, 경북 중북부/남부처럼 도 안을 갈라 칠한다.
function bulAssignDir(ids, specs, thresh) {
  const cen = ids.map((id) => { const e = zoneEls.get(id)[0].el; const r = zoneRectRoot(e); return { id, x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }; });
  const xs = cen.map((c) => c.x), ys = cen.map((c) => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const nx = (x) => (maxX > minX ? (x - minX) / (maxX - minX) : 0.5);   // 0=서,1=동
  const ny = (y) => (maxY > minY ? (y - minY) / (maxY - minY) : 0.5);   // 0=북(위),1=남(아래)
  const score = (d, x, y) => ({
    N: 1 - y, S: y, W: 1 - x, E: x, C: 1 - Math.abs(y - 0.5) * 2,
    NW: (2 - y - x) / 2, NE: (1 - y + x) / 2, SW: (y + 1 - x) / 2, SE: (y + x) / 2,
  }[d] ?? 0.4);
  const out = new Map();
  for (const c of cen) {
    let best = specs[0], bs = -Infinity;
    for (const s of specs) {
      let v = score(s.dir, nx(c.x), ny(c.y));
      if ((s.raw || '').includes('내륙')) v -= (1 - Math.abs(nx(c.x) - 0.5) * 2) * 0 + ny(c.y) * 0.25;   // 내륙 = 남쪽(해안) 쪽일수록 감점
      if ((s.raw || '').includes('해안')) v += ny(c.y) * 0.2;                                            // 해안 = 남쪽(바다) 쪽 가점
      if (v > bs) { bs = v; best = s; }
    }
    // 부분 예보(thresh 지정): 방향에 충분히 안 맞는 존은 비워 둔다 → '경남서부내륙'이 경남 전체로 안 번진다.
    if (thresh != null && bs < thresh) continue;
    if (!out.has(best)) out.set(best, []);
    out.get(best).push(c.id);
  }
  return out;
}

function applyBulletin(txt) {
  const groups = parseBulletin(txt);
  if (!groups.length) {
    alert('통보문에서 강수량 줄을 못 찾았습니다.\n\n"- (충청권) 대전.세종.충남: 20~60mm" 형식인지 확인해 주세요.');
    return;
  }
  pushUndo();
  // 지금 보던 예보 지도(시도군/시도)에 칠한다. 특보 지도였으면 시도 지도로 넘어간다.
  let st = (S.style === 'sgg' || S.style === 'sido') ? S.style : 'sido';
  // 시도 지도인데 통보문이 한 도를 방향(서부·동부 등)으로 다른 값으로 쪼개면 표현 불가 → 시도군 지도로 넘어갈지 묻는다.
  if (st === 'sido') {
    // 같은 도 안에서 '방향이 다르고' 값도 다를 때만 쪼개기다(같은 방향이 여러 줄이면 쪼개기가 아니다).
    const byProv = {};
    // '(남해안 제외)'도 한 표현으로 센다 — '전남(남해안 제외)' + '전남남해안'이 값이 다르면 시도 지도로는 못 나눈다.
    for (const g of groups) for (const tk of g.tokens) if (tk.province && (bulDir(tk.dir) || tk.exclude)) {
      const e = (byProv[tk.province] ||= { dirs: new Set(), labels: new Set() });
      e.dirs.add(termNorm(tk.dir) + (tk.exclude ? '-' + termNorm(tk.exclude) : '')); e.labels.add(g.labelTxt);
    }
    const split = Object.keys(byProv).filter((p) => byProv[p].dirs.size >= 2 && byProv[p].labels.size >= 2);
    if (split.length && confirm(`지금 '시도' 지도로는 ${split.join(', ')}을(를) 방향(서부·동부 등)으로 나눠 칠할 수 없습니다.\n\n'시도·군' 지도로 넘어가서 칠할까요?`)) st = 'sgg';
  }
  if (S.style !== st) setStyle(st);   // 지도 종류 맞추고 존을 렌더(중심 좌표 계산에 필요)

  // 값 범위(예 '30~100')마다 서로 다른 색을 준다 — 이게 있어야 각 강수 구간이 '구분'된다.
  // 같은 범위는 같은 색. 약한 비 -> 진한 비 순으로 램프에서 뽑는다.
  const ranges = [];
  for (const g of groups) if (!ranges.some((r) => r.labelTxt === g.labelTxt)) ranges.push({ labelTxt: g.labelTxt, max: g.max });
  ranges.sort((a, b) => a.max - b.max);
  // 구간마다 '서로 다른' 색. 구간 수가 램프색(8)보다 많아도 겹치지 않게 램프를 보간해서 뽑는다.
  // (예전엔 반올림으로 두 구간이 같은 색이 돼 전북=경북중북부처럼 섞여 보였다.)
  const RAMP = RAIN_SCALE.map((x) => x[1]);
  const lerp = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return '#' + [0, 1, 2].map((k) => Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };
  const rampAt = (t) => { if (t <= 0) return RAMP[0]; if (t >= 1) return RAMP[RAMP.length - 1]; const p = t * (RAMP.length - 1), i = Math.floor(p); return lerp(RAMP[i], RAMP[i + 1], p - i); };
  const colOf = {};
  ranges.forEach((r, i) => { colOf[r.labelTxt] = rampAt(ranges.length <= 1 ? 1 : i / (ranges.length - 1)); });

  const sidoName = (p) => (st === 'sido' && p === '광주' ? '전남' : p);   // 시도 지도엔 광주 조각 없음(전남 통합)
  const provSpecs = {};   // 시도 -> [{dir, col, gi}]
  const islandSpecs = []; // {island, col, gi}
  const regionSpecs = []; // 권역(도 접두 없는) 기준표 매핑 — {names:Set, col, gi, raw}
  const unknown = [];
  groups.forEach((g, gi) => {
    const col = colOf[g.labelTxt];
    for (const tk of g.tokens) {
      if (tk.island) { islandSpecs.push({ island: tk.island, col, gi }); continue; }
      if (!tk.province) {
        // 도 접두가 없어도 '전라권서부·충청권북부'처럼 기준표에 있으면 권역 단위로 칠한다 (시도·군 지도에서만)
        const nm = st === 'sgg' ? termSiguns(tk.dir) : null;
        if (nm && nm.length) regionSpecs.push({ names: new Set(nm), col, gi, raw: tk.dir });
        else if (tk.dir) unknown.push(tk.dir);
        continue;
      }
      if (tk.province === '강원' && (tk.dir || '').includes('산지')) continue;   // 강원 '산지' 계열(산지/북부산지/강원산지 등)은 시군을 안 칠하고 산(▲)만 만든다(kma_place_terms에서 산지 분류는 전부 산 표시). 방위 표현(영서/영동 등)만 시군 색칠.
      const arr = (provSpecs[sidoName(tk.province)] ||= []);
      const ex = tk.exclude || '';
      // 같은 도·같은 표현이 다른 줄에도 있으면(일부만 겹치는 줄) 큰 값 하나만 — 경로마다 이기는 줄이 달라지지 않게.
      const dup = arr.find((s) => s.raw === tk.dir && s.many === !!g.many && s.exclude === ex);
      if (dup) { if (g.max > dup.max) Object.assign(dup, { col, gi, max: g.max }); continue; }
      arr.push({ dir: bulDir(tk.dir), raw: tk.dir, col, gi, many: !!g.many, max: g.max, exclude: ex });
    }
  });

  // 존 채우기 + 그룹별로 칠한 존 기록(라벨 중심 계산용)
  const F = {};
  const groupZones = groups.map(() => []);
  // '부드러운 경계' 대상 구역 모으기 — 내륙·해안·산지처럼 경계가 애매한 표현만. soft=true일 때만 담고,
  // 나중에 다른(확실한) 스펙이 덧칠하면 빼서, 마지막에 칠한 성격을 따르게 한다.
  const softZones = new Set();
  const isVague = (raw) => /내륙|해안|산지/.test(raw || '');
  const put = (id, col, gi, soft) => { F[id] = col; groupZones[gi].push(id); if (soft) softZones.add(id); else softZones.delete(id); };
  const sidoOf = (id) => (st === 'sido' ? id : id.split('/')[0]);
  const zonesByProv = {};
  for (const id of zoneEls.keys()) (zonesByProv[sidoOf(id)] ||= []).push(id);
  // 시군 지도에서만, '동/서/남해안' → 알려진 해안 시군 이름들 (시도 지도는 도 전체라 해당 없음)
  const coastNamesOf = (prov, raw) => { const m = (raw || '').match(/([동서남])해안/); return (m && st !== 'sido') ? COAST_ZONES[`${prov}|${m[1]}해안`] : null; };
  const provCoastSet = (prov) => new Set(Object.keys(COAST_ZONES).filter((k) => k.startsWith(prov + '|')).flatMap((k) => COAST_ZONES[k]));
  for (const [prov, specs] of Object.entries(provSpecs)) {
    const provAll = zonesByProv[prov] || [];
    if (!provAll.length) continue;
    // '(남해안 제외)' 같은 제외 구역 — 기준표(도+표현, 또는 도로 시작해 그 표현으로 끝나는 항목들) → 해안표 → 방향 순으로 찾는다.
    // 시도 지도는 도를 못 쪼개므로 도 전체로 둔다.
    const exZones = (s) => {
      if (!s.exclude || st === 'sido') return null;
      if (s._ex) return s._ex;
      const X = termNorm(s.exclude), set = new Set();
      let names = termSiguns(prov + X);
      if (!names) { const m = termMap(); const ks = Object.keys(m).filter((k) => k.startsWith(prov) && k.endsWith(X)); if (ks.length) names = ks.flatMap((k) => m[k]); }
      const coast = COAST_ZONES[`${prov}|${X}`];
      if (names && names.length) { const ns = new Set(names); for (const id of provAll) if (ns.has(zoneBase(id.split('/')[1] || ''))) set.add(id); }
      else if (coast) { for (const id of provAll) if (coast.includes(id.split('/')[1])) set.add(id); }
      else if (bulDir(X)) { for (const [, zids] of bulAssignDir(provAll, [{ dir: bulDir(X), raw: X }], 0.5)) zids.forEach((id) => set.add(id)); }
      return (s._ex = set);
    };
    const excluded = (s, id) => { const ex = exZones(s); return !!(ex && ex.has(id)); };

    // ── 0) 기상청 기준표(JSON)로 '정확히' 매핑되는 표현 먼저 칠한다 (시도·군 지도에서만).
    //    예: 충남남부내륙 → 논산·금산·부여·청양, 강원북부산지 → 속초·인제·고성·양양·양구.
    //    좌표 추측(방향 배정)보다 우선. 매핑된 스펙·칠한 존은 아래 방향 배정에서 제외(폴백이 덮어쓰지 않게).
    const jsonDone = new Set(), jsonZones = new Set();
    if (st === 'sgg') {
      for (const s of specs) {
        // 방향 없는 순수 도이름(예: '인천','대전')은 정밀표(인천→['인천'])에 걸리면 안 된다.
        // 걸리면 인천 본토만 칠하고 강화·옹진을 빼먹은 채 '처리 완료'가 돼 도 전체 폴백까지 막힌다 → 도 전체로 맡긴다.
        if (!(s.raw || '').trim()) continue;
        const names = termSiguns(prov + (s.raw || ''));
        if (!names || !names.length) continue;
        const nameSet = new Set(names);
        let painted = false;
        for (const id of provAll) if (nameSet.has(zoneBase(id.split('/')[1] || ''))) { put(id, s.col, s.gi, false); jsonZones.add(id); painted = true; }
        if (painted) jsonDone.add(s);
      }
    }
    const all = provAll.filter((id) => !jsonZones.has(id));   // JSON으로 확정된 존은 방향 배정에서 뺀다
    if (!all.length && !specs.some((s) => !jsonDone.has(s))) continue;   // 남은 게 없으면 다음 도로
    const baseSpecs = specs.filter((s) => !s.many && !jsonDone.has(s));      // 기본 예보(JSON으로 처리 안 된 것)
    const overlaySpecs = specs.filter((s) => s.many && !jsonDone.has(s));    // '많은 곳 … 이상' — 기본 위에 덧칠(우선순위 높음)

    // ── 1) 기본 예보 ──
    const coastDone = new Set(), usedBase = new Set();
    for (const s of baseSpecs) {                          // 해안은 알려진 시군으로 콕 집는다
      const names = coastNamesOf(prov, s.raw);
      if (!names) continue;
      for (const id of all) if (!coastDone.has(id) && names.includes(id.split('/')[1])) { put(id, s.col, s.gi, true); coastDone.add(id); }   // 해안 = 애매 → 부드럽게
      if (st !== 'sido') usedBase.add(s);                 // 해안 표현은 항상 소비(시군 지도) — 그 해안 시군을 이미 다른 스펙(JSON 산지 등)이 칠해 all에서 빠졌어도 '방향 폴백'으로 넘기지 않게(강원동해안.산지 → 원주·횡성 등 오칠 방지)
    }
    const ids = all.filter((id) => !coastDone.has(id));
    const rest = baseSpecs.filter((s) => !usedBase.has(s));
    if (ids.length && rest.length) {
      const dirSpecs = rest.filter((s) => s.dir);
      const hasFull = rest.some((s) => !s.dir);   // 방향 없는 스펙 = 도 전체 담당
      if (st === 'sido' || !dirSpecs.length) {
        const s = rest[rest.length - 1];   // 방향 구분 없음 -> 도(나머지) 한 색
        for (const id of ids) if (!excluded(s, id)) put(id, s.col, s.gi, isVague(s.raw));
      } else {
        // 방향 스펙 1개뿐 + 도 전체 스펙 없음 = '부분 예보'(예: 경남서부내륙) → 방향 맞는 존만 칠하고 나머지는 비운다.
        const partial = dirSpecs.length === 1 && !hasFull;
        const thresh = partial ? ((dirSpecs[0].raw || '').includes('내륙') ? 0.58 : 0.5) : null;
        const left = [];   // 제외로 비운 [구역, 제외한 스펙]
        for (const [s, zids] of bulAssignDir(ids, rest, thresh)) for (const id of zids) { if (excluded(s, id)) left.push([id, s]); else put(id, s.col, s.gi, isVague(s.raw)); }
        // 제외한 구역은 같은 표현의 다른 줄('전남(남해안 제외)' + '전남남해안')이 맡는다 — 안 그러면 방향 배정이 갈라 놓은 광양 같은 곳이 빈다.
        for (const [id, ex] of left) {
          const s = rest.find((o) => !o.exclude && o.raw && termNorm(o.raw) === termNorm(ex.exclude));
          if (s) put(id, s.col, s.gi, isVague(s.raw));
        }
      }
    }

    // ── 2) '많은 곳' 오버레이 (기본 위에 덧칠) ──
    for (const s of overlaySpecs) {
      const names = coastNamesOf(prov, s.raw);
      if (names) { for (const id of all) if (names.includes(id.split('/')[1])) put(id, s.col, s.gi, true); }   // 해안 국지 = 애매 → 부드럽게
      else if (!s.raw) { for (const id of all) if (!excluded(s, id)) put(id, s.col, s.gi, false); }           // 도 이름 그대로(예: 인천) → 도 전체(확실 → 또렷)
      else if (s.dir && st !== 'sido') {                                                                 // 방향 국지 → 그 방향 존만
        let pool = all;
        if ((s.raw || '').includes('내륙')) { const cz = provCoastSet(prov); pool = all.filter((id) => !cz.has(id.split('/')[1])); }   // 내륙 = 해안 제외
        const thr = (s.raw || '').includes('내륙') ? 0.5 : 0.42;
        for (const [sp, zids] of bulAssignDir(pool, [s], thr)) for (const id of zids) put(id, sp.col, sp.gi, isVague(sp.raw));
      }
      // 그 외(도를 못 쪼개는 '산지' 등)는 자리를 못 정하니 덧칠 안 함 → 기본색 유지 (도 전체가 진한색으로 덮이는 것 방지)
    }
  }
  // 권역(도 접두 없는) 표현 — 기준표대로 해당 권역의 시군을 정확히 칠한다. (전라권서부·충청권북부 등)
  // '고성·광주'처럼 도가 겹치는 이름 오염을 막으려 권역에 속한 도로만 범위를 좁힌다.
  const REGION_PROVS = { 수도권: ['서울', '인천', '경기'], 충청권: ['대전', '세종', '충북', '충남'], 전라권: ['광주', '전북', '전남'], 경상권: ['대구', '부산', '울산', '경북', '경남'] };
  for (const rs of regionSpecs) {
    const pre = Object.keys(REGION_PROVS).find((p) => (rs.raw || '').startsWith(p));
    const provs = pre ? REGION_PROVS[pre] : Object.keys(zonesByProv);
    for (const p of provs) for (const id of (zonesByProv[p] || [])) if (rs.names.has(zoneBase(id.split('/')[1] || ''))) put(id, rs.col, rs.gi, false);
  }
  // 섬(서해5도->옹진, 울릉도.독도->울릉군). 도 뒤에 처리해 더 구체적인 섬 색이 이긴다.
  for (const isp of islandSpecs) {
    for (const id of zoneEls.keys()) if (st !== 'sido' && (id.split('/')[1] || '').startsWith(isp.island)) put(id, isp.col, isp.gi, false);
  }

  // '산지'(예: 강원내륙.산지) → 태백산맥 산 표시. 산은 강원 좌표라 '강원' 산지만(제주도산지·경북북동산지는 아님).
  // 칠할 시군이 없어도 강원 산지가 있으면 산만 만들고 끝낸다(강원산지만 있는 통보문).
  const sanji = groups.find((g) => g.tokens.some((tk) => tk.province === '강원' && (tk.dir || '').includes('산지')));
  if (!Object.keys(F).length && !sanji) {
    const miss = [...new Set(unknown)];
    setBulInfo('', miss, '한 곳도 못 칠했습니다 — 지역명을 확인하세요');
    status('통보문 색칠 실패 — 지역을 못 찾았습니다' + (miss.length ? ` (${miss.join(', ')})` : ''), true); return;
  }
  S.fillsByStyle[st] = F;
  S.softFill = $('#bulSoft')?.checked ? 1 : 0;   // '부드러운 경계' 체크를 색칠에 반영
  (S.softZonesByStyle ||= {})[st] = [...softZones];   // 이번 통보문에서 '애매한' 구역만 저장(지도 종류별, 선별 블러용)
  renderFills();

  // 태백산맥 산 표시 자동 추가(앱의 '강원' 프리셋). 색은 그 지역 강수 색.
  // 다시 붙여넣으면 이전에 통보문이 만든 산(bul)은 지우고 다시 만든다(손으로 만든 산은 안 건드림).
  S.mtns = (S.mtns || []).filter((m) => !m.bul);
  let madeMtns = 0;
  if (sanji) {
    // 저장된 '강원 산지' 기본 배치(default-presets.js의 mtnGangwon)가 있으면 그걸, 없으면 코드 프리셋을 쓴다.
    const ov = (window.WCG_DEFAULTS && window.WCG_DEFAULTS.mtnGangwon) || null;
    const base = MTN_PRESETS.find((p) => p.label === '강원');
    const anchors = (ov && Array.isArray(ov.anchors) && ov.anchors.length) ? ov.anchors : (base ? base.anchors : []);
    const size = (ov && ov.size) || (base ? base.size : 90);
    const mcol = colOf[sanji.labelTxt] || '#FFFFFF';
    for (const anc of anchors) {
      const m = newMtn({ anchor: JSON.parse(JSON.stringify(anc)), size, col: mcol, bul: 1 });
      const a = mtnAnchorXY(m); m.x = a.x; m.y = a.y;
      (S.mtns ||= []).push(m); madeMtns++;
    }
  }
  renderMtns();   // 산지가 없어도 다시 그린다 — 이전 통보문이 만든 산을 지웠으니 화면(PNG 추출)에서도 사라져야 한다

  // 숫자 라벨 — 값 범위마다 하나만(내용 같은 라벨 중복 X). 그 범위 색으로 칠한 조각 전부의 면적 가중 중심에.
  // 다시 붙여넣으면 이전 통보문 라벨은 지운다. 손으로 만든 라벨은 안 건드린다.
  S.labels = S.labels.filter((b) => !b.bul);
  let madeLabels = 0;
  if ($('#bulLabels').checked) {
    // 숫자 라벨만 만든다. 윗줄(지역명)은 자동으로 안 넣는다 — 필요하면 '수치 라벨' 탭에서 직접 추가.
    for (const rg of ranges) {
      const col = (colOf[rg.labelTxt] || '').toUpperCase();
      let wx = 0, wy = 0, area = 0;
      for (const [id, arr] of zoneEls) {
        if ((F[id] || '').toUpperCase() !== col) continue;
        for (const { el: e } of arr) { const r = zoneRectRoot(e); const a = Math.max((r.x1 - r.x0) * (r.y1 - r.y0), 1); wx += ((r.x0 + r.x1) / 2) * a; wy += ((r.y0 + r.y1) / 2) * a; area += a; }
      }
      if (!area) continue;
      S.labels.push(newLabel({ txt: rg.labelTxt, x: Math.round(wx / area), y: Math.round(wy / area), fill: colOf[rg.labelTxt], bul: 1 }));
      madeLabels++;
    }
  }
  renderLabels(); refreshPanel();

  // 통보문 머리글의 날짜(예: '예상 강수량(18~19일)')를 제목의 날짜 칸('내일~모레' 자리)에 넣는다.
  let date = null;
  const dm = txt.match(/강수량\s*\(([^)]+)\)/);
  if (dm && /일/.test(dm[1])) date = dm[1].replace(/\s+/g, '');
  else { const d2 = txt.match(/\(\s*(\d{1,2}\s*[~∼\-]?\s*\d{0,2}\s*일)\s*\)/); if (d2) date = d2[1].replace(/\s+/g, ''); }
  if (date) {
    const dateRe = /(내일|모레|오늘|어제|글피|\d{1,2}\s*[~∼\-]\s*\d{1,2}\s*일|\d{1,2}\s*일)/;
    const t = S.texts.find((x) => !x.off && dateRe.test(x.txt || ''));
    if (t && t.txt !== date) { t.txt = date; renderTexts(); }
  }

  // 색 목록(그룹별). 같은 색은 renderBulList가 한 줄로 묶는다.
  bulSpecs = groups.map((g) => ({ regionText: g.regionText, col: colOf[g.labelTxt], labelTxt: g.labelTxt }));
  renderBulList();

  const parts = [`${Object.keys(F).length}개 ${st === 'sido' ? '시도' : '시군'} 칠함`, `${ranges.length}색 구분`];
  if (madeLabels) parts.push(`라벨 ${madeLabels}개`);
  if (madeMtns) parts.push(`산 ${madeMtns}개`);
  const miss = [...new Set(unknown)];
  setBulInfo(parts.join(' · '), miss);
  status(`통보문 색칠 — ${parts.join(' · ')}` + (miss.length ? ` · 못 찾음: ${miss.join(', ')}` : ''), miss.length > 0);
}

// 통보문 결과 안내(#bulInfo). 못 찾아 못 칠한 지역이 있으면 빨간 경고 배너로 '확 띄게' 보여준다.
//  okText: 정상 요약("N개 시군 칠함 · …")  miss: 못 찾은 표현들  bannerTitle: 배너 제목(전부 실패 시)
function setBulInfo(okText, miss, bannerTitle) {
  const el = $('#bulInfo'); if (!el) return;
  el.textContent = '';
  miss = miss || [];
  if (okText) { const s = document.createElement('span'); s.className = 'bulOk'; s.textContent = okText; el.append(s); }
  if (miss.length || bannerTitle) {
    const box = document.createElement('div'); box.className = 'bulMiss';
    box.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2 1 21h22L12 2zm0 6c.6 0 1 .4 1 1v5a1 1 0 0 1-2 0V9c0-.6.4-1 1-1zm0 9.5a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/></svg>';
    const t = document.createElement('div');
    const head = document.createElement('b');
    head.textContent = bannerTitle || `못 칠한 곳 ${miss.length}: ${miss.join(', ')}`;
    t.append(head);
    if (bannerTitle && miss.length) { const m = document.createElement('span'); m.className = 'mrg'; m.textContent = miss.join(', '); t.append(m); }
    box.append(t); el.append(box);
  }
}

// 통보문으로 칠한 색 목록 — 어느 지역이 어떤 색인지 보여주고, 색 상자를 누르면 그 색을 한 번에 다른 색으로 바꾼다.
let bulSpecs = [];
function renderBulList() {
  const box = $('#bulList'); if (!box) return;
  box.textContent = '';
  if (!bulSpecs.length) return;
  // 같은 색이 여러 그룹이면 한 줄로 묶는다 (색 바꾸기는 '그 색 전부'가 대상)
  const byCol = new Map();
  for (const s of bulSpecs) {
    const k = (s.col || '').toUpperCase();
    if (!byCol.has(k)) byCol.set(k, { col: s.col, texts: [], labels: [] });
    const e = byCol.get(k);
    if (s.regionText) e.texts.push(s.regionText);
    if (s.labelTxt && !e.labels.includes(s.labelTxt)) e.labels.push(s.labelTxt);
  }
  const head = document.createElement('div'); head.className = 'bulListHead';
  head.textContent = '칠한 색 — 색 상자를 눌러 바꾸기';
  box.append(head);
  for (const g of byCol.values()) {
    const row = document.createElement('div'); row.className = 'bulListRow';
    const sw = document.createElement('input'); sw.type = 'color'; sw.className = 'bulSw';
    sw.value = /^#[0-9a-fA-F]{6}$/.test(g.col) ? g.col : '#000000';
    sw.title = '이 색을 한 번에 바꾸기';
    const old = g.col;
    sw.onchange = () => recolorBul(old, sw.value);
    const txt = document.createElement('div'); txt.className = 'bulListTxt';
    const b = document.createElement('b'); b.textContent = g.labels.join(', ') || g.col;
    const sp = document.createElement('span'); sp.textContent = g.texts.join(' / ');
    txt.append(b, sp);
    row.append(sw, txt);
    box.append(row);
  }
}
// 지금 지도(현재 종류)에서 oldCol로 칠한 칸·라벨·애니 트랙 색을 newCol로 한 번에 바꾼다.
function recolorBul(oldCol, newCol) {
  oldCol = (oldCol || '').toUpperCase(); newCol = (newCol || '').toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(newCol) || oldCol === newCol) return;
  pushUndo();
  const F = fills();
  for (const id in F) if ((F[id] || '').toUpperCase() === oldCol) F[id] = newCol;
  for (const b of S.labels) if ((b.fill || '').toUpperCase() === oldCol) b.fill = newCol;
  const A = anim();
  for (const tr of A.tracks) if (tr.kind === 'fill' && (tr.key || '').toUpperCase() === oldCol) tr.key = newCol;
  for (const s of bulSpecs) if ((s.col || '').toUpperCase() === oldCol) s.col = newCol;
  for (const m of S.mtns || []) if (m.bul && (m.col || '').toUpperCase() === oldCol) m.col = newCol;   // 통보문이 만든 산(▲)도 같은 색이면 함께
  renderFills(); renderMtns(); renderLabels(); refreshPanel(); buildTimeline();
  renderBulList(); saveWork();
  status(`색 바꿈 ${oldCol} → ${newCol}`);
}
