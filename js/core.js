/* [모듈] js/core.js — 공통 도우미($·el·tip·svgNS), 색 팔레트(RAMPS·WRN_COLORS), 기본 상태 DEFAULTS·S, 선택 도우미, MAP/IMG 데이터 보정, 지도 종류 판별(isTyphoon·isSeoul·curStyle), fills·brushStrokes */
'use strict';

const $ = (s) => document.querySelector(s);
const svgNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => {
  const n = document.createElementNS(svgNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
// Element.append()는 undefined를 반환하므로 따로 만들어 붙인다
const tip = (node, text) => { const t = el('title', {}); t.textContent = text; node.append(t); return node; };

// 계열별 8단계 (연한 것 -> 진한 것). 세로 한 줄이 한 계열.
const RAMPS = [
  { name: '빨강', cols: ['#FFE7E3', '#FDB9B1', '#FA9A8C', '#FB7264', '#F9483A', '#FA2E1E', '#C81306', '#8A0A02'] },
  { name: '파랑', cols: ['#DDE6FA', '#93A9E5', '#6485E6', '#3A6FEE', '#0C46DC', '#1740C0', '#1B3AA0', '#1E3480'] },
  { name: '초록', cols: ['#E2F9E4', '#A9EFB0', '#6BE07A', '#2ECC4A', '#00E81E', '#12A62B', '#0B7220', '#064515'] },
  { name: '노랑', cols: ['#FFF7DE', '#FCE4B3', '#FFDD73', '#FFCE00', '#FFC800', '#FBA800', '#F57C00', '#B35400'] },
  { name: '무채색', cols: ['#FFFFFF', '#E4E4E4', '#C4C4C4', '#A4A2A2', '#8C8C8C', '#5A5A5A', '#2E2E2E', '#000000'] },
];
// 강조색 (계열에 안 넣고 따로 둔다)
const ACCENTS = ['#00D6CE'];

// 특보 종류별 색 초안 — [주의보, 경보]. 사이드바 '특보 종류별 색' 버튼(팝업)에서 바꿀 수 있다. 키 순서 = 겹칠 때 우선순위(위가 우선).
// 방송 관례대로 같은 계열의 연한/진한 두 단계로 잡았다.
const WRN_COLORS = {
  호우:   ['#6485E6', '#0C46DC'],
  대설:   ['#93A9E5', '#1B3AA0'],
  폭염:   ['#F57C00', '#FA2E1E'],
  열대야: ['#FDB9B1', '#FB7264'], // 폭염과 같은 난색이되 구분되게
  한파:   ['#00D6CE', '#1740C0'],
  강풍:   ['#6BE07A', '#12A62B'],
  건조:   ['#FFDD73', '#FBA800'],
  풍랑:   ['#A9EFB0', '#2ECC4A'],
  태풍:   ['#FB7264', '#C81306'],
  황사:   ['#FCE4B3', '#B35400'],
  폭풍해일: ['#6485E6', '#1E3480'],
  해일:   ['#6485E6', '#1E3480'],
  지진해일: ['#FA9A8C', '#8A0A02'],
};

const DEFAULTS = () => ({
  res: '2158x1214',
  style: 'sgg',
  cgLight: 0,   // CG 밝은 모드 (배경·베이스·경계선·실루엣·폰트를 밝은 세트로)
  showBg: 1, showGuide: 1, guideOp: 50,
  bg: 'bg', // 어느 기본 배경을 쓸지 (BGS의 키)
  nbrCol: '#1B2856', nbrOp: 100, showNW: 1, showJP: 0, nbrGrow: 3,
  base: '#3C4875',
  // 칠 바깥용 — 색 안 칠한 구역에 은은하게 깔리는 선
  stroke: '#A4A2A2', strokeW: 0.4, sggOn: 1, sggOp: 17,
  // 칠 안쪽용 — 칠한 구역 안을 가르는 선 (베이스색이라 아주 옅게)
  realCol: '#3C4875', realW: 0.6, realOn: 1, realOp: 2,
  sidoCol: '#EBEBEB', sidoW: 1.1, sidoOn: 1, sidoOp: 100, // 시도(광역) 경계 — 위에 덧그림
  shadow: { x: 0, y: 8, blur: 10, op: 45, col: '#000814' },
  map: { x: 1160, y: 545, s: 1.02 },
  // anchorXY = 박스 한가운데에 놓을 지점(지도 좌표). 반드시 명시할 것 —
  // 그냥 내용 bbox 중심을 쓰면 멀리 딸린 섬(제주의 추자도, 옹진의 영흥도)이
  // 기준을 끌고 가서 본섬이 박스 밖으로 밀려난다.
  insets: {
    jeju:    { label: '제주',    box: [538, 902, 212, 136], s: 1.3,  ox: 0,   oy: 0, show: 1, anchorXY: [-132.4, 610] },
    ulleung: { label: '울릉도',  box: [1406, 178, 150, 111], s: 2.6, ox: -30, oy: 0, show: 1, anchorXY: [598, -250] },
    // 독도는 울릉도 박스를 같이 쓰고(박스선은 울릉도 것만) 내용만 오른쪽으로 민다
    dokdo:   { label: '독도',    box: [1406, 178, 150, 111], s: 20, ox: 37,  oy: 0, show: 0, anchorXY: [770, -193.7] },
    ongjin:  { label: '서해5도', box: [614, 274, 107, 116], s: 1.85, ox: 0,   oy: 0, show: 1, anchorXY: [-448.8, -328.8] },
  },
  // 지도 종류마다 칠하기 단위가 달라서 색도 따로 기억한다
  fillsByStyle: {},
  // 브러쉬 덧칠 — 지도 종류마다 따로. 각 획 = {region(존 id), col, r(로컬 반지름), op, soft, erase, dabs:[[lx,ly]...]}
  brushByStyle: {},
  brush: { size: 55, op: 55, soft: 70 },   // 현재 브러쉬 설정 (획과 별개, UI 값)
  // 해상 특보구역 (육상과 함께 칠하되 눈으로 끌 수 있다)
  fctOff: {},     // 목록에서 끈 예보 (예보문구 -> 1)
  fctColors: {},  // 예보문구 -> 색 (안 정하면 문구 보고 자동)
  seaFills: {}, seaBase: '#2A3A63', seaBaseOp: 30, seaCol: '#7E8AA8', seaW: 0.6,
  seaFade: 18, // 프레임 좌·우·하단에서 사라지는 폭 (%). 상단은 안 건드린다.
  wrnColors: JSON.parse(JSON.stringify(WRN_COLORS)), // 특보 종류별 기본색 (주의보/경보 폴백)
  wrnLevelColors: { '폭염|중대경보': '#8B0000' }, // 들어온 특보에서 지정한 종류×정확한 단계별 색
  wrnOff: {},   // 목록에서 끈 특보 종류
  wrnOverlap: 1,   // 겹친 특보를 교차 색 띠로 표시
  texts: [
    { id: 't1', txt: '내일~모레',  x: 128, y: 300, size: 66, w: 700, col: '#FFFFFF', track: -2, align: 'start' },
    { id: 't2', txt: '예상 강수량', x: 128, y: 388, size: 66, w: 700, col: '#5BC5F2', track: -2, align: 'start' },
    { id: 't3', txt: '단위 : mm',  x: 130, y: 462, size: 26, w: 500, col: '#7FB2E8', track: 0,  align: 'start' },
  ],
  labels: [],
  labScale: 100, // 수치 라벨 전체 크기 (%) — 각자 제자리에서 같이 커지고 작아진다
  mtnScale: 100, // 산 표시 전체 크기 (%) — 각 산이 제자리에서 같이 커지고 작아진다
  map3d: { on: 0, deg: 14, persp: 2.2 }, // 3D 살짝 기울임(미리보기·추출 공통): on/각도/원근깊이(×화면폭)

  labShadow: 1,  // 수치 라벨 그림자 — 지도와 같은 그림자(#shadowF)를 얹는다
  txtShadow: 1,  // 제목 텍스트 그림자 — 지도와 같은 그림자
  mtns: [],      // 산 표시
  softFill: 0,   // 아사모사(부드러운 경계) — 통보문 색칠을 경계에서 부드럽게 섞을지
  softZonesByStyle: {}, // 지도 종류별 '부드럽게' 대상 구역 id들(내륙·해안·산지처럼 애매한 표현만). 확실한 지명은 또렷하게 둔다.
  vfBar: { on: 0, x: 1140, y: 150, w: 640, h: 110, shOp: 42, shBlur: 7, shDy: 7 }, // 노말 VF 제목 바(배경 크롭+그림자 농도/번짐/거리). 배치는 프리셋에 저장.
  vfScale: 100, // 노말 VF 출력 전체 크기(%). 파란 배경판 오른쪽 위를 고정하고 전체를 함께 확대·축소.
  vfScales: {}, // 작업 중 공유값: common / warnsea 두 칸. 밝은·어두운 전환 때 현재 크기가 유지된다.
  // 기상특보 범례 — 제목 밑에 '색상 상자 + 이름' 목록. 특보용 지도에서만 UI 노출, 배치는 프리셋에 저장.
  legend: { on: 0, auto: 1, horiz: 0, x: 150, y: 560, box: 34, radius: 6, rowGap: 16, size: 34, weight: 600, txtCol: '#FFFFFF', gap: 18,
    items: [{ col: '#FA2E1E', txt: '폭염특보' }, { col: '#FFC400', txt: '폭염주의보' }] },
  // 영상용. tracks = [{id, kind:'fill'|'label'|'text'|'mtn', key, start, len}]
  // fps 기본 29.97 — 방송 표준(NTSC)에 맞춘다.
  // reveal: 색칠이 나타나는 방식 — 'dissolve'(번짐) / 'blinds'(블라인드, AE 효과)
  anim: { dur: 6, fps: 29.97, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [] },
});

let S = DEFAULTS();
let activeColor = '#FA2E1E';
let sel = []; // 선택된 것들 [{kind,id}] — Shift+클릭으로 여러 개
const isSel = (kind, id) => sel.some((s) => s.kind === kind && s.id === id);
// 태풍 지도에선 라벨을 S.typhoon.labels 에 따로 담는다 — 노말 지도의 S.labels 와 섞이지 않게.
// (그 외 모든 편집/선택/드래그/편집기는 listOf 를 통해 자동으로 이 배열을 쓴다.)
const labelList = () => (isTyphoon() ? ((S.typhoon || (initTyphoonData(), S.typhoon)).labels ||= []) : S.labels);
const setLabelList = (arr) => { if (isTyphoon()) S.typhoon.labels = arr; else S.labels = arr; };
const listOf = (kind) => (kind === 'text' ? S.texts : kind === 'mtn' ? (S.mtns ||= []) : labelList());
const itemOf = (s) => listOf(s.kind).find((v) => v.id === s.id);
const selItems = () => sel.map((s) => ({ s, it: itemOf(s) })).filter((x) => x.it);
const one = () => (sel.length === 1 ? sel[0] : null); // 단일 선택일 때만 편집 패널을 연다
let customCols = [];
let seq = 1;
// 저장본·배치를 불러오면 seq를 그 안의 id(x·cmp·c·k + 숫자) 최댓값 뒤로 맞춘다 — 새 라벨/텍스트 id가 옛 것과 겹치지 않게
function bumpSeq() {
  let m = 0;
  try { for (const r of JSON.stringify(S).matchAll(/"id":"(?:x|cmp|c|k)(\d+)"/g)) { const n = +r[1]; if (n > m) m = n; } } catch (e) {}
  seq = Math.max(seq, m + 1);
}
let mode = 'paint';
let bgOverride = null; // 사용자가 교체한 배경 (data URI). 그 세션 한정 — 저장 안 된다.
let bgUseFile = 0;     // 교체한 것을 쓰는 중인가 (0이면 S.bg 의 기본 배경)

const MAP = window.KOREA_MAP;
const IMG = window.CG_IMAGES || {};

// 시군구(sgg) 지도의 제주·서울을 예보구역 단위로 세분한다.
//  · 제주: '제주시·서귀포시' 2개 → 북부·동부·서부·남부·중산간·산지(9개)
//  · 서울: '서울' 1개 → 서북·서남·동북·동남 4권역
// 그 도형은 모두 특보(warn) 스타일에 이미 있고 좌표계도 동일하므로 그대로 복사한다(map-data.js는 안 건드림).
(function patchFineSggZones() {
  try {
    if (!MAP || !MAP.styles || !MAP.styles.sgg || !MAP.styles.warn) return;
    const sgg = MAP.styles.sgg.zones, warn = MAP.styles.warn.zones;
    if (sgg.some((z) => z.id === '제주/제주시동부')) return;   // 이미 패치됨
    const mk = (z, sido) => ({ id: sido + '/' + z.zone, zone: z.zone, sido, inset: z.inset || null, d: z.d,
      cx: z.cx != null ? z.cx : (z.bbox[0] + z.bbox[2]) / 2, cy: z.cy != null ? z.cy : (z.bbox[1] + z.bbox[3]) / 2, bbox: z.bbox });
    const jeju = warn.filter((z) => z.inset === 'jeju' && /제주|서귀/.test(z.zone || '')).map((z) => mk(z, '제주'));
    const seoul = warn.filter((z) => /^서울(동북|동남|서남|서북)권$/.test(z.zone || '')).map((z) => mk(z, '서울'));
    let out = sgg.filter((z) => z.id !== '제주/제주시' && z.id !== '제주/서귀포시' && z.id !== '서울/서울');
    if (jeju.length) out = out.concat(jeju);
    if (seoul.length) out = out.concat(seoul);
    MAP.styles.sgg.zones = out;
  } catch (e) {}
})();

// 태풍 지도 종류 — 광역(일본·중국·필리핀) 배경 + 태풍 예상경로 오버레이. 구역 색칠이 없으므로 zones는 빈 배열.
// (typhoon-map-data.js가 있을 때만 '지도 종류'에 버튼이 뜬다)
if (window.TYPHOON_MAP && MAP.styles && !MAP.styles.typhoon) {
  MAP.styles.typhoon = { label: '태풍 (베타)', zones: [], sidoLines: {}, noInsets: true, sea: false, typhoon: true };
  // 태풍 비교 — 같은 광역 배경/카메라/추출을 쓰되, 여러 기관 예보선을 대등하게 겹쳐 비교하는 별도 지도.
  MAP.styles.typhoonCompare = { label: '태풍 비교 (베타)', zones: [], sidoLines: {}, noInsets: true, sea: false, typhoon: true, compare: true };
}
const isTyphoon = (st) => !!(MAP.styles[st || S.style] && MAP.styles[st || S.style].typhoon);
// 태풍 '비교' 지도인지 — 태풍 지도 렌더 인프라를 공유하되 비교 전용 UI/렌더로 분기.
const isTyphoonCompare = (st) => !!(MAP.styles[st || S.style] && MAP.styles[st || S.style].compare);

// 서울 지도 — 시도군 지도의 '지도 종류' 변형. 서울 25개 자치구를 427개 행정동으로 세분(색칠 단위=동).
// 구 경계선(guLines)은 시도선 레이어에 두껍게, 동 경계선은 각 zone 윤곽으로 얇게. 자체 좌표계라 noInsets.
// #styleBtns 목록엔 숨기고(hidden), 아트보드의 지도종류 아이콘 버튼으로만 진입(태풍 basemap과 동일 컨셉).
if (window.SEOUL_MAP && MAP.styles && !MAP.styles.seoul) {
  MAP.styles.seoul = { label: '서울 지도', zones: window.SEOUL_MAP.zones || [],
    sidoLines: { main: window.SEOUL_MAP.guLines || '' }, noInsets: true, hidden: true, seoul: true };
}
const isSeoul = (st) => !!(MAP.styles[st || S.style] && MAP.styles[st || S.style].seoul);
// 서울 지도 첫 진입(저장된 배치 없음) 시 서울이 화면에 꽉 차게 기본 뷰를 잡는다. 이후 사용자가 배치·저장하면 그 값 우선.
function setSeoulDefaultView() {
  const bb = (window.SEOUL_MAP && window.SEOUL_MAP.bbox) || [-549, -450, 549, 450];
  const w = bb[2] - bb[0], h = bb[3] - bb[1], cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
  const s = Math.max(0.02, Math.min(4, Math.min(1920 * 0.62 / w, 1080 * 0.74 / h)));
  S.map.x = Math.round(960 - s * cx); S.map.y = Math.round(540 - s * cy); S.map.s = +s.toFixed(3);
}

// S.style이 없는 스타일을 가리키면(예: seoul-map-data.js 로드 실패 + 저장값이 seoul) 시도군으로 폴백.
const curStyle = () => MAP.styles[S.style] || MAP.styles.sgg;
// 저장·되돌리기·불러오기로 S를 통째로 바꾼 뒤 부른다 — 없는 지도 종류면 S.style 자체를 시도군으로(데이터 키도 맞게).
const normStyle = () => { if (!MAP.styles[S.style]) S.style = 'sgg'; };
const curZones = () => curStyle().zones;
// 시도선은 지도 종류마다 다르다 — 특보 지도는 기상청 데이터에서, 나머지는 행정동 데이터에서 뽑았다.
// 출처가 다른 시도선을 얹으면 경계가 0.2~0.6km 어긋난다.
const curSidoLines = () => curStyle().sidoLines || {};
// 칠한 색은 지도 종류별로 따로 (시도군 지도의 '경기/파주시'와 시도 지도의 '경기'는 다른 단위)
const fills = () => (S.fillsByStyle[S.style] ||= {});
const brushStrokes = () => ((S.brushByStyle ||= {})[S.style] ||= []);
