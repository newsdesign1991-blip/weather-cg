/* [모듈] js/typhoon-core.js — 태풍: 좌표·카메라 투영, 기본값·등급·날짜 범위, 스타일(applyTyphoonStyle), 데이터 초기화, 범례 카탈로그, 애니 상태, 아이콘·지시선·반경(밴드) */
'use strict';

// ===================== 태풍 지도 =====================
const TYPHOON_R_EARTH = 6371;   // km
const svgNS2 = 'http://www.w3.org/2000/svg';
const _te = (tag, attr) => { const e = document.createElementNS(svgNS2, tag); for (const k in attr) e.setAttribute(k, attr[k]); return e; };
// km 반경 -> 지도 로컬 단위(projLL 좌표계). 메르카토르 등각이라 위도별 sec 보정.
const typhoonKmToUnit = (km, lat) => km * MAP.proj.scale / (TYPHOON_R_EARTH * Math.cos(lat * Math.PI / 180));
// 경위도 -> 화면 좌표 (현재 지도 배치 반영)
function typhoonXY(lon, lat) { const [lx, ly] = projLL(lon, lat); return [S.map.x + lx * S.map.s, S.map.y + ly * S.map.s]; }
// 프레임 좌표(fx,fy)를 카메라 3D 회전으로 투영한 화면 좌표. 틸트 없으면 그대로. (warpTilt3D·CSS와 동일 계산)
// 라벨을 '세워서' 그리되 기울어진 지도 위 지점과 연결하기 위해 쓴다.
// VF 전체 크기(L_vfScale = 패널 우상단 기준 k배)가 걸려 있으면 {k,ax,ay}. 지도 래스터는 '축소 후' 프레임 중심으로 기울므로,
// 같은 L_vfScale 안에 그려지는 라벨도 축소 공간에서 투영해야 지도 지점과 맞는다(축소·회전은 순서가 바뀌면 결과가 다름).
function _camVfScale() {
  if (S.res !== '1920x1080-vf' || !_vfPanelRect) return null;
  const sv = S.vfScales && S.vfScales[vfScaleGroup()];
  const k = clampVfScale(sv === undefined ? S.vfScale : sv) / 100;
  if (!(k > 0) || Math.abs(k - 1) < 1e-6) return null;
  return { k, ax: _vfPanelRect.x + _vfPanelRect.w, ay: _vfPanelRect.y };
}
function camProjectXY(fx, fy) {
  if (!camTiltOn()) return [fx, fy];
  const v = _camVfScale(); if (!v) return _camProjectRaw(fx, fy);
  const [px, py] = _camProjectRaw(v.ax + (fx - v.ax) * v.k, v.ay + (fy - v.ay) * v.k);   // V → 투영 → V⁻¹ (그려질 때 L_vfScale이 다시 V)
  return [v.ax + (px - v.ax) / v.k, v.ay + (py - v.ay) / v.k];
}
function _camProjectRaw(fx, fy) {
  const m = S.map3d || {};
  const on = !!m.on && (Math.abs(+m.rx || 0) > 0.05 || Math.abs(+m.ry || 0) > 0.05 || Math.abs(+m.rz || 0) > 0.05);
  if (!on) return [fx, fy];
  const rx = (+m.rx || 0) * Math.PI / 180, ry = (+m.ry || 0) * Math.PI / 180, rz = (+m.rz || 0) * Math.PI / 180;
  const P = (m.persp == null ? 2.2 : +m.persp) * 1920, cx0 = 960, cy0 = 540;
  const cxr = Math.cos(rx), sxr = Math.sin(rx), cyr = Math.cos(ry), syr = Math.sin(ry), czr = Math.cos(rz), szr = Math.sin(rz);
  const X = fx - cx0, Y = fy - cy0;
  const x = X * czr - Y * szr, y = X * szr + Y * czr;   // Rz
  const x2 = x * cyr, z2 = -x * syr;                    // Ry
  const y3 = y * cxr - z2 * sxr, z3 = y * sxr + z2 * cxr; // Rx
  const f = P / (P - z3);
  return [cx0 + x2 * f, cy0 + y3 * f];
}
// 카메라 틸트가 실제 걸려 있는지(라벨을 지도평면에 붙일지 판단).
function camTiltOn() {
  const m = S.map3d || {};
  return !!m.on && (Math.abs(+m.rx || 0) > 0.05 || Math.abs(+m.ry || 0) > 0.05 || Math.abs(+m.rz || 0) > 0.05);
}
// camProjectXY의 역 — 화면좌표(sx,sy)를 '기울지 않은' 프레임(지도평면) 좌표로 되돌린다.
// 라벨을 지도평면 점으로 저장해두면 틸트가 바뀌어도 지도에 붙어 함께 움직인다(드래그는 마우스와 1:1 유지).
function camUnprojectXY(sx, sy) {
  if (!camTiltOn()) return [sx, sy];
  const v = _camVfScale(); if (!v) return _camUnprojectRaw(sx, sy);
  const [ux, uy] = _camUnprojectRaw(v.ax + (sx - v.ax) * v.k, v.ay + (sy - v.ay) * v.k);   // camProjectXY와 대칭
  return [v.ax + (ux - v.ax) / v.k, v.ay + (uy - v.ay) / v.k];
}
function _camUnprojectRaw(sx, sy) {
  const m = S.map3d || {};
  if (!camTiltOn()) return [sx, sy];
  const rx = (+m.rx || 0) * Math.PI / 180, ry = (+m.ry || 0) * Math.PI / 180, rz = (+m.rz || 0) * Math.PI / 180;
  const P = (m.persp == null ? 2.2 : +m.persp) * 1920, cx0 = 960, cy0 = 540;
  const cxr = Math.cos(rx), sxr = Math.sin(rx), cyr = Math.cos(ry), syr = Math.sin(ry), czr = Math.cos(rz), szr = Math.sin(rz);
  const sX = sx - cx0, sY = sy - cy0;
  // 평면점(x,y,0)을 Ry·Rx 회전+원근투영한 결과가 (sX,sY)가 되는 x,y를 선형연립으로 푼다.
  const a11 = P * cyr - sX * syr * cxr, a12 = sX * sxr, b1 = sX * P;
  const a21 = syr * (sY * cxr - P * sxr), a22 = sY * sxr + P * cxr, b2 = sY * P;
  const det = a11 * a22 - a12 * a21;
  if (Math.abs(det) < 1e-9) return [sx, sy];
  const x = (b1 * a22 - a12 * b2) / det, y = (a11 * b2 - b1 * a21) / det;
  // Rz 되돌리기 → 프레임 좌표
  return [x * czr + y * szr + cx0, -x * szr + y * czr + cy0];
}

// 태풍 데이터 시드(샘플: 6호 '장미'). 실제 연동 시 기상청 API가 issues를 채운다.
const TYPHOON_DEFAULTS = { landFill: '#12325A', landStroke: '#3C6390', krShow: 1, krFill: '#2E6FB0', krStroke: '#BFE3FF', krStrokeW: 1.6, krOpacity: 0.45, krStrokeOp: 1, terrain: 0.85, iconCol: '#E5231E', basemap: 'satdark', nowIdx: null, labelSel: null,
  trackMode: 'full', lineColor: '#E5231E', lineWidth: 9.5,
  iconMode: 'image', iconScale: 1.75,   // 아이콘: image=사용자 이미지 / grade=기상청 강도 숫자 원, iconScale=전체 크기 배율(기본 175%)
  glowOn: 1, glowStr: 0.5, glowCol: '',   // 아이콘 글로우: 켜기 / 강도(0~1) / 색('' 이면 아이콘색 따라감)
  sidoShow: 1, sidoCol: '', sidoW: 0.8, sidoOp: 0.55,   // 남한 시도 구분선: 켜기 / 색('' 이면 강조 선색 따라감) / 굵기 / 투명도
  gridShow: 1, gridCol: '#7FA8CC', gridW: 0.4, gridOp: 0.12,   // 경위도 격자선(바다): 켜기 / 색 / 굵기 / 투명도(아주 살짝)
  // 새 태풍 라벨의 기본 스타일(굽기 포함). 라벨 하나를 원하는 대로 꾸민 뒤 그 라벨을 선택하고 굽기 하면 여기에 담긴다.
  labelStyle: { size: 40, w: 600, txtCol: '#FFFFFF', fill: '#0C295F', stroke: '#3F6BD8', strokeW: 2, radius: 16, padX: 28, padY: 16, track: -1, titleRatio: 0.7, divider: 1,
    fillGrad: 0, fill2: '#071B40', strokeGrad: 1, stroke2: '#4F7DF3', gradAngle: 90, fillOp: 0.72, glass: 0, glassBlur: 3 } };
// 기상청 태풍 강도(최대풍속 m/s) → 등급(1~5)·색. 17 미만은 열대저압부(TD, 등급 0).
const TYPHOON_GRADE_COL = { 1: '#4FB0E5', 2: '#38C172', 3: '#F2C14E', 4: '#EA8A3E', 5: '#E24C4C' };
function typhoonGrade(ws) {
  const v = +ws || 0;
  const g = v >= 54 ? 5 : v >= 44 ? 4 : v >= 33 ? 3 : v >= 25 ? 2 : v >= 17 ? 1 : 0;
  return { g, col: TYPHOON_GRADE_COL[g] || '#9AA3AD' };
}
// tmef("YYYYMMDDHHMM" UTC) → KST 날짜 "YYYY-MM-DD" (표시 날짜 범위 비교용)
function typhoonDateKST(tmef) {
  const s = String(tmef || '').replace(/\D/g, ''); if (s.length < 8) return '';
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +(s.slice(8, 10) || 0), +(s.slice(10, 12) || 0)));
  d.setUTCHours(d.getUTCHours() + 9);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
// 시각까지 포함(YYYY-MM-DDTHH:mm, KST) — 표시 범위를 '일'이 아니라 '발표시각' 단위로 자를 때 사용.
function typhoonDateTimeKST(tmef) {
  const s = String(tmef || '').replace(/\D/g, ''); if (s.length < 8) return '';
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +(s.slice(8, 10) || 0), +(s.slice(10, 12) || 0)));
  d.setUTCHours(d.getUTCHours() + 9);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
// 범위값 정규화 — 날짜만("2026-08-12")이면 시작=00:00, 끝=23:59로 확장(옛 저장값·일 단위 선택 호환).
const _typRangeNorm = (v, isEnd) => (v && v.indexOf('T') < 0 ? v + (isEnd ? 'T23:59' : 'T00:00') : v);
// 지점 idx가 '표시 날짜 범위' 안에 드는가 (범위 꺼짐이면 항상 true)
function typhoonIdxInRange(pts, idx) {
  const T = S.typhoon || {}; if (!T.rangeOn) return true;
  const p = pts[idx]; if (!p) return false;
  const d = typhoonDateTimeKST(p.tmef); if (!d) return true;
  if (T.rangeFrom && d < _typRangeNorm(T.rangeFrom, false)) return false;
  if (T.rangeTo && d > _typRangeNorm(T.rangeTo, true)) return false;
  return true;
}
// 애니메이션이 훑을 인덱스 구간 [lo,hi] — '표시 날짜 범위'가 켜져 있으면 그 안의 첫/끝 지점.
// (안 그러면 애니가 범위 밖 처음 지점부터 그려버린다.)
function typhoonRangeWindow(pts) {
  const N = pts.length; let lo = 0, hi = Math.max(0, N - 1);
  if ((S.typhoon || {}).rangeOn) {
    let a = -1, b = -1;
    for (let i = 0; i < N; i++) if (typhoonIdxInRange(pts, i)) { if (a < 0) a = i; b = i; }
    if (a >= 0) { lo = a; hi = b; }
  }
  return { lo, hi };
}
// 라인 모드(비교 지도 제외) — 경로 시각 라벨을 안 그리고 현재 위치에서 멈춘다.
function typhoonLineMode() { return !isTyphoonCompare() && !!(S.typhoon && S.typhoon.trackMode === 'line'); }
// 애니가 실제로 훑을 구간 — 라인 모드는 예상 지점으로 넘어가지 않고 현재 위치(nowIdx)에서 끝난다.
// 애니 확인(playTyphoon)·타임라인 재생·영상 추출(renderAnimFrame)·라벨 기본 키가 같은 규칙을 쓴다.
function typhoonAnimWindow(pts) {
  const win = typhoonRangeWindow(pts);
  if (!typhoonLineMode()) return win;
  return { lo: win.lo, hi: Math.max(win.lo, Math.min(win.hi, typhoonNowIdx(pts))) };
}
// 진행 폭 — 라인 모드는 구간이 한 점(현재=시작)이면 0(제자리, 예보로 갔다 튀지 않게), 일반 모드는 최소 1.
function typhoonAnimSpan(lo, hi) { return typhoonLineMode() ? Math.max(0, hi - lo) : Math.max(1, hi - lo); }
// 굽힌 배포 기본값(WCG_DEFAULTS.typhoonStyle)이 있으면 그걸 우선한 태풍 스타일 기본값.
function typhoonStyleDefaults() {
  const baked = (window.WCG_DEFAULTS && window.WCG_DEFAULTS.typhoonStyle) || {};
  const out = Object.assign({}, TYPHOON_DEFAULTS, baked);
  // 라인 모드가 생기기 전 배포 기본값에는 이 키들이 없다. 그 경우 새 라인 기본 크기를 우선한다.
  if (baked.lineWidth == null) { out.iconScale = 1.75; out.lineColor = '#E5231E'; out.lineWidth = 9.5; }
  return out;
}
const TYPHOON_STYLE_KEYS = ['landFill', 'landStroke', 'krShow', 'krFill', 'krStroke', 'krStrokeW', 'krOpacity', 'krStrokeOp', 'terrain', 'iconCol', 'basemap', 'bands', 'iconMode', 'iconScale', 'trackMode', 'lineColor', 'lineWidth', 'glowOn', 'glowStr', 'glowCol', 'sidoShow', 'sidoCol', 'sidoW', 'sidoOp', 'gridShow', 'gridCol', 'gridW', 'gridOp', 'legendOrder', 'legendHidden', 'r15Buf'];
// 34노트(=r15) 위험구역 여유(버퍼) km — JTWC의 '34 KNOT WIND DANGER AREA'는 풍역+오차버퍼라 실제 풍역보다 크다. 이 값을 r15에 더해 크게 그린다.
// 태풍 스타일(색·반경·지형·남한강조)을 굽힌 기본값으로 맞춘다 — 모든 해상도가 같은 색을 쓰게(진입·부팅 시).
// 단, 작업마다 정하는 값(라인 모드·선 색/굵기·아이콘 크기)은 이미 있으면 보존 — F5·지도 전환에도 유지(파일 열기와 같게).
const TYPHOON_PER_WORK_KEYS = new Set(['trackMode', 'lineColor', 'lineWidth', 'iconScale']);
function applyTyphoonStyle() {
  if (!S.typhoon) return;
  const DEF = typhoonStyleDefaults();
  for (const k of TYPHOON_STYLE_KEYS) {
    if (TYPHOON_PER_WORK_KEYS.has(k) && S.typhoon[k] != null) continue;
    if (DEF[k] !== undefined) S.typhoon[k] = JSON.parse(JSON.stringify(DEF[k]));
  }
}
function initTyphoonData() {
  const DEF = typhoonStyleDefaults();
  if (S.typhoon && S.typhoon.issues && S.typhoon.issues.length) {
    const legacyLineDefaults = S.typhoon.lineWidth == null;
    for (const k in DEF) if (S.typhoon[k] == null) S.typhoon[k] = DEF[k];   // 옛 데이터에 스타일 기본값 보강
    // 라인 모드 도입 전 저장본은 새 아이콘 기본 크기로 한 번 보강 — 그때 iconScale은 부팅마다 배포값(0.7 등)으로 덮여 사용자 값이 아니었다.
    if (legacyLineDefaults) S.typhoon.iconScale = DEF.iconScale;
    if (!S.typhoon.places) S.typhoon.places = [];   // 지명표시(옛 저장 보강)
    return;
  }
  const mk = (shift) => ([
    { lon: 137.2, lat: 19.4, label: '28일 03시', cat: 1, ws: 19, ps: 998, r15: 180, r25: 0, r70: 0, fcst: false },
    { lon: 136.3, lat: 20.6, label: '28일 15시', cat: 1, ws: 21, ps: 996, r15: 200, r25: 0, r70: 60, fcst: true },
    { lon: 135.0, lat: 22.3, label: '29일 03시', cat: 2, ws: 27, ps: 990, r15: 240, r25: 70, r70: 90, fcst: true },
    { lon: 133.4, lat: 24.2, label: '29일 15시', cat: 2, ws: 29, ps: 985, r15: 260, r25: 90, r70: 130, fcst: true },
    { lon: 131.7, lat: 26.0, label: '30일 03시', cat: 2, ws: 30, ps: 980, r15: 280, r25: 100, r70: 170, fcst: true },
    { lon: 130.2, lat: 27.8, label: '31일 03시', cat: 2, ws: 28, ps: 984, r15: 270, r25: 90, r70: 220, fcst: true },
  ].map((p) => ({ ...p, lon: p.lon + (shift || 0) })));
  S.typhoon = {
    name: "6호 태풍 '장미' 예상경로",
    issues: [
      { tmfc: '', label: '28일 04시 발표(최신)', points: mk(0) },
      { tmfc: '', label: '27일 22시 발표', points: mk(0.6) },
    ],
    sel: 0,
    places: [],   // 지명표시(원+이름표)
    ...DEF,   // 지도 색·반경 스타일·지형·남한 강조 기본값(굽힌 배포 기본값 우선)
  };
}
const curTyphoonIssue = () => (S.typhoon && S.typhoon.issues[S.typhoon.sel]) || null;
const curTyphoonPoints = () => { const it = curTyphoonIssue(); return it ? it.points : []; };

// 화면 맞춤 — 로드된 태풍 경로 + 한반도가 다 들어오도록 자동 계산. 경로 없으면 광역 기본.
function setTyphoonDefaultView() {
  let lo0 = 124, lo1 = 132, la0 = 33, la1 = 39;   // 한반도는 항상 포함
  const acc = [];
  const pts = curTyphoonPoints();
  if (pts && pts.length) acc.push(...pts);
  // 비교 지도: 모든 비교 예보선 지점도 프레임에 포함(안 그러면 라인이 화면 밖으로 잘림)
  if (isTyphoonCompare() && S.typhoon && Array.isArray(S.typhoon.compare)) {
    for (const c of S.typhoon.compare) { if (c && c.show && Array.isArray(c.points)) acc.push(...c.points); }
  }
  if (acc.length) {
    for (const p of acc) { if (p.lon == null || p.lat == null) continue; lo0 = Math.min(lo0, p.lon); lo1 = Math.max(lo1, p.lon); la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); }
  } else { lo0 = 100; lo1 = 150; la0 = 8; la1 = 47; }
  const mlon = (lo1 - lo0) * 0.3 + 5, mlat = (la1 - la0) * 0.3 + 5;   // 여백(라인 전체가 여유있게 보이도록)
  lo0 -= mlon; lo1 += mlon; la0 -= mlat; la1 += mlat;
  const box = [[lo0, la1], [lo1, la1], [lo0, la0], [lo1, la0]].map(([lo, la]) => projLL(lo, la));
  const xs = box.map((p) => p[0]), ys = box.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, h = y1 - y0;
  // 안전영역: 왼쪽 제목·범례 열(≈x440)과 오른쪽 진행자 가이드(≈x1170)를 피해 그 안에 맞춘다
  const SX0 = 445, SX1 = 1240, SY0 = 120, SY1 = 1055, sw = SX1 - SX0, sh = SY1 - SY0;
  const s = Math.min(sw / w, sh / h);
  S.map = { x: Math.round(SX0 + (sw - w * s) / 2 - x0 * s), y: Math.round(SY0 + (sh - h * s) / 2 - y0 * s), s: Math.round(s * 1000) / 1000 };
}

// 태풍 반경/색 상수
const TYPHOON_COL = { track: '#FF5A5A', trackDark: '#C01414', tag: '#C81E2E' };
// 반경 밴드 기본 스타일 — 면색/투명도/선색/선굵기/점선. 사이드바에서 전부 조절 가능.
// 70%=더 빨갛게+점선, 15m/s=파랑+점선 외곽, 25m/s=보라 채움.
const TYPHOON_BAND_DEF = {
  r70: { fill: '#FF3B4E', fillOp: 0.16, stroke: '#FF5A6B', strokeW: 0, dash: 0 },
  r15: { fill: '#8EA8DD', fillOp: 0.22, stroke: '#B7CCF2', strokeW: 2.0, dash: 1 },
  r25: { fill: '#6A5CC0', fillOp: 0.42, stroke: '#8E82D8', strokeW: 0, dash: 0 },
};
// 나라(소스)별 반경 이름 — 나라 정보를 고르면 그 나라 용어로 반경 스타일 라벨·범례가 바뀐다.
const BAND_NAMES = {
  kma:  { r15: '강풍반경(15m/s)', r25: '폭풍반경(25m/s)', r70: '70% 확률반경' },
  jma:  { r15: '강풍역(強風域)',   r25: '폭풍역(暴風域)',  r70: '예보원(予報円)' },
  jtwc: { r15: '34kt 강풍역',      r25: '50kt 폭풍역',     r70: '70% 확률반경' },
};
const BAND_LEGEND_NAMES = {
  kma:  { r15: '15m/s 이상 범위', r25: '25m/s 이상 범위', r70: '70% 확률반경' },
  jma:  { r15: '강풍역(15m/s↑)',  r25: '폭풍역(25m/s↑)',  r70: '예보원(70% 확률)' },
  jtwc: { r15: '34kt 위험구역',   r25: '50kt 폭풍역',     r70: '70% 확률반경' },
};
const typSrc = () => ((S.typhoon && S.typhoon.src) || 'kma');
const bandName = (key) => (BAND_NAMES[typSrc()] || BAND_NAMES.kma)[key] || key;
const bandLegendName = (key) => (BAND_LEGEND_NAMES[typSrc()] || BAND_LEGEND_NAMES.kma)[key] || key;
const lerp = (a, b, t) => a + (b - a) * t;

// 범례(우리 특보 범례 시스템)에 넣을 태풍 항목
const TYPHOON_GRADE_RANGE = { 1: '17~24m/s', 2: '25~32m/s', 3: '33~43m/s', 4: '44~53m/s', 5: '54m/s 이상' };
// 태풍 범례 후보 전체(고정 id) — 반경 밴드 3종 + 열대저압부 + 강도 1~5. 색: 밴드=현재 반경색, 강도=등급색.
function typhoonLegendCatalog() {
  const b = (S.typhoon && S.typhoon.bands) || {};
  const bcol = (k) => (b[k] && b[k].fill) || TYPHOON_BAND_DEF[k].fill;
  const items = [
    { id: 'r15', kind: 'band', col: bcol('r15'), txt: bandLegendName('r15') },
    { id: 'r25', kind: 'band', col: bcol('r25'), txt: bandLegendName('r25') },
    { id: 'r70', kind: 'band', col: bcol('r70'), txt: bandLegendName('r70') },
    { id: 'td', kind: 'td', col: '#9AA3AD', txt: '열대저압부 17m/s 미만' },
  ];
  for (let n = 1; n <= 5; n++) items.push({ id: 'g' + n, kind: 'grade', g: n, col: TYPHOON_GRADE_COL[n], txt: '강도' + n + ', ' + TYPHOON_GRADE_RANGE[n] });
  return items;
}
const TYPHOON_LEGEND_DEFAULT_ORDER = ['r15', 'r25', 'r70', 'g1', 'g2', 'g3', 'g4', 'g5', 'td'];
const TYPHOON_LEGEND_DEFAULT_HIDDEN = { g1: 1, g2: 1, g3: 1, g4: 1, g5: 1, td: 1 };   // 기본은 반경 3종만 표시
// 실제 범례에 그릴 항목(순서·숨김 적용). renderLegend/vfExpandedLegend 공용.
function typhoonLegendItems() {
  const T = S.typhoon || {};
  // 비교 모드: 범례는 반경 대신 '기관 이름 + 색'(표시 중인 비교 예보들)로 대체 — 기존 범례 렌더/위치/추출 그대로 재사용.
  if (isTyphoonCompare() && Array.isArray(T.compare) && T.compare.length) return T.compare.filter((c) => c.show && c.showLegend !== 0).map((c) => ({ id: 'cmp_' + c.id, kind: 'cmp', col: c.color, txt: c.name }));
  const cat = typhoonLegendCatalog(), byId = {}; for (const it of cat) byId[it.id] = it;
  const order = (T.legendOrder && T.legendOrder.length) ? T.legendOrder : TYPHOON_LEGEND_DEFAULT_ORDER;
  const hidden = T.legendHidden || TYPHOON_LEGEND_DEFAULT_HIDDEN;
  const lineMode = T.trackMode === 'line';   // 라인 모드는 반경을 안 그리므로 반경 항목도 뺀다
  const bandOff = (id) => (T.bands && T.bands[id] && T.bands[id].off) || (lineMode && byId[id] && byId[id].kind === 'band');   // 눈 꺼둔 반경은 범례에서도 뺀다
  const out = [];
  for (const id of order) { const it = byId[id]; if (it && !hidden[id] && !bandOff(id)) out.push(it); }
  for (const it of cat) if (!order.includes(it.id) && !hidden[it.id] && !bandOff(it.id)) out.push(it);   // 카탈로그에 새로 생긴 항목 보강
  return out;
}

// 애니메이션 진행도(null=전체, 아니면 0..N-1 실수 — 지점 사이를 부드럽게 보간)
let typhoonProg = null;
// 예보 비교 트랙별 진행도 { compareId: null(전체)|0..N-1 }. null(전체 map)=정지(전 예보 완전표시).
let typhoonCmpProg = null;
let typhoonRaf = 0;
let typhoonHeadFade = 1;   // 애니 끝에서 이동 아이콘(head)을 부드럽게 사라지게(1→0)
// 라벨 생성 애니메이션 — 라벨마다 '그 태풍 지점이 나타나는 순간' 개별 시작한다.
// null=평소(완전표시). {at:경과ms, starts:{labelId:시작ms}, LINE, SCALE}
let typhoonLabelAnim = null;
// easeInOutCubic — 스크린샷의 종형(속도) 곡선처럼 시작·정지가 매우 부드럽게(오버슈트 없음).
const easeInOutC = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2));
// 위 이징의 역함수 — 영상 추출에서 '경로가 idx 지점에 닿는 시각'을 프레임 무관하게 역산할 때 쓴다.
const easeInOutCInv = (y) => (y <= 0 ? 0 : y >= 1 ? 1 : (y < 0.5 ? Math.cbrt(y / 4) : 1 - Math.cbrt(2 * (1 - y)) / 2));
// 라벨 한 개의 현재 진행 → { reveal:선 그리기 0..1, scale:박스 크기 0..1 }
function typhoonLabelProg(id) {
  if (!typhoonLabelAnim) return { reveal: 1, scale: 1 };
  const info = typhoonLabelAnim.map[id];
  if (!info) return { reveal: 0, scale: 0 };   // 아직 등장 전 / 애니 대상 아님
  const local = typhoonLabelAnim.at - info.st, { LINE, SCALE } = info;
  return { reveal: easeInOutC(local / LINE), scale: easeInOutC((local - LINE * 0.5) / SCALE) };
}

// 지점(경위도+반경km) -> 화면좌표 + 화면반경. 애니 head는 보간값. idx=원본 인덱스.
function typhoonScreenPts(pts) {
  const r15b = (S.typhoon && +S.typhoon.r15Buf) || 0;   // 34노트(r15) 위험구역 여유(km) — JTWC 위험구역처럼 크게
  const toS = (p, idx) => { const [x, y] = typhoonXY(p.lon, p.lat); return { x, y, idx, r15: (p.r15 || 0) ? typhoonKmToUnit(p.r15 + r15b, p.lat) * S.map.s : 0, r25: (p.r25 || 0) ? typhoonKmToUnit(p.r25, p.lat) * S.map.s : 0, r70: (p.r70 || 0) ? typhoonKmToUnit(p.r70, p.lat) * S.map.s : 0, label: p.label, head: false, noIcon: !!p.noIcon }; };
  if (typhoonProg == null) return pts.map(toS);
  const prog = Math.max(0, Math.min(pts.length - 1, typhoonProg));
  const fl = Math.floor(prog), frac = prog - fl;
  const out = [];
  for (let i = 0; i <= fl; i++) out.push(toS(pts[i], i));
  if (frac > 1e-4 && fl + 1 < pts.length) {
    const a = pts[fl], b = pts[fl + 1];
    // 목적지 지점(b)에 그 반경이 없으면(0) head도 0으로 — 마지막이 0인 반경을 향해 lerp하다 '유령 반경'을 그렸다 정지프레임서 사라지는 어색함 제거.
    const ip = { lon: lerp(a.lon, b.lon, frac), lat: lerp(a.lat, b.lat, frac), r15: (b.r15 || 0) ? lerp(a.r15 || 0, b.r15 || 0, frac) : 0, r25: (b.r25 || 0) ? lerp(a.r25 || 0, b.r25 || 0, frac) : 0, r70: (b.r70 || 0) ? lerp(a.r70 || 0, b.r70 || 0, frac) : 0, label: '' };
    const s = toS(ip, fl + frac); s.head = true;
    s.ws = lerp((a.ws == null ? 99 : a.ws), (b.ws == null ? 99 : b.ws), frac);   // 선두 강도=보간(약해지면 TD/온대 마커로 자연스럽게 전환)
    s.ex = frac >= 0.5 ? !!b.ex : !!a.ex;   // 향하는 지점이 온대저압부면 선두도 '저'
    out.push(s);
  }
  return out;
}
// 기본 '현재 시각' 인덱스 = 마지막 실황(fcst=false) 지점
function typhoonDefaultNowIdx(pts) { let idx = 0; pts.forEach((p, i) => { if (!p.fcst) idx = i; }); return idx; }
const typhoonNowIdx = (pts) => clamp(S.typhoon && S.typhoon.nowIdx != null ? S.typhoon.nowIdx : typhoonDefaultNowIdx(pts), 0, pts.length - 1);

// 태풍 아이콘 — 두 종류: 'image'(사용자 이미지) / 'grade'(기상청 강도 숫자 원). 전체 크기는 iconScale 배율.
// td=true(열대저압부, 17m/s 미만)면 아이콘 대신 '그냥 점'. r = 반지름 기준. ws = 최대풍속(등급 판정용).
function typhoonIconEl(x, y, r, color, td, past, ws, forceImage, ex) {
  const T = S.typhoon || {};
  const scale = (T.iconScale == null ? 1 : +T.iconScale) || 1;
  r = r * scale;
  const g = _te('g', { transform: `translate(${x} ${y})` });
  if (!past && (T.glowOn == null ? 1 : T.glowOn)) g.setAttribute('filter', 'url(#typhoonIconGlow)');   // 현재/미래 아이콘에 살짝 글로우
  if ((td || ex) && !forceImage) {   // 열대저압부(TD)=원+X / 온대저압부(ex)=원+'저'. 현재·미래=흰 배경+빨강, 지난 날짜=회색.
    const rr = r * 1.15;
    const lineCol = past ? '#79828E' : '#E24C4C';       // 지난 것: 회색 / 현재·미래: 빨강
    const faceCol = past ? '#AEB6C0' : '#FFFFFF';        // 지난 것: 회색 면(어둡게) / 현재·미래: 흰 면
    const op = past ? 0.85 : 1;
    g.appendChild(_te('circle', { r: rr + Math.max(1.6, rr * 0.18), fill: 'none', stroke: past ? '#5A626C' : '#FFFFFF', 'stroke-width': Math.max(1.6, rr * 0.22), 'stroke-opacity': past ? 0.35 : 0.9 }));   // 바깥 할로(지난 것은 어두운 회색·연하게)
    g.appendChild(_te('circle', { r: rr, fill: faceCol, stroke: lineCol, 'stroke-width': Math.max(1.6, rr * 0.15), 'stroke-opacity': op, 'fill-opacity': op }));
    if (ex) {   // 온대저압부 = 가운데 '저'(열대저압부와 같은 원, X 대신 저)
      const t = _te('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: lineCol, 'font-family': '"SUITE CG","Malgun Gothic",sans-serif', 'font-weight': 800, 'font-size': rr * 1.42, 'fill-opacity': op });
      t.textContent = '저';
      g.appendChild(t);
    } else {
      const xx = rr * 0.46;
      g.appendChild(_te('path', { d: `M${-xx} ${-xx}L${xx} ${xx}M${xx} ${-xx}L${-xx} ${xx}`, fill: 'none', stroke: lineCol, 'stroke-width': Math.max(1.6, rr * 0.2), 'stroke-linecap': 'round', 'stroke-opacity': op }));   // X
    }
    return g;
  }
  if (!forceImage && (T.iconMode || 'image') === 'dot') {   // 작은 원 — 색 채움 + 흰 링 한 겹 (지난 날짜=회색)
    const rr = r * 0.62;
    g.appendChild(_te('circle', { r: rr, fill: past ? '#9AA3AD' : color, stroke: past ? '#C8D0DA' : '#FFFFFF', 'stroke-width': Math.max(1.6, rr * 0.32), 'stroke-opacity': past ? 0.7 : 1, 'fill-opacity': past ? 0.9 : 1 }));
    return g;
  }
  if (!forceImage && (T.iconMode || 'image') === 'grade') {   // 기상청 강도(1~5) 숫자 원 (forceImage면 건너뛰고 일러스트)
    const gr = typhoonGrade(ws), rr = r * 1.15;
    g.appendChild(_te('circle', { r: rr, fill: past ? '#9AA3AD' : gr.col, stroke: '#FFFFFF', 'stroke-width': Math.max(1.5, rr * 0.13), 'stroke-opacity': past ? 0.6 : 1 }));
    const t = _te('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#FFFFFF', 'font-family': '"SUITE CG","Malgun Gothic",sans-serif', 'font-weight': 800, 'font-size': rr * 1.25 });
    t.textContent = String(gr.g || 1);
    g.appendChild(t);
    return g;
  }
  const IC = window.TYPHOON_ICON;
  if (!IC || !IC.img) { g.appendChild(_te('circle', { r: r * 0.6, fill: color })); return g; }
  const h = r * 2.5, w = h * (IC.w / IC.h);
  g.appendChild(_te('image', { href: IC.img, x: -w / 2, y: -h / 2, width: w, height: h, preserveAspectRatio: 'xMidYMid meet', filter: past ? 'url(#typhoonIconGray)' : 'url(#typhoonIconTint)' }));
  return g;
}
// hex -> 색상(hue, 0~360)
function hexHue(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return 0;
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  let h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360; return h;
}
// 아이콘(빨강 몸통 + 흰 눈)을 target색으로 재계산하는 feColorMatrix values.
// 몸통 빨강(≈0.86,0.30,0.30)→target, 흰색(1,1,1)→흰색 유지. hueRotate와 달리 아무 색이나 정확히 적용됨.
function iconTintValues(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '#E5231E');
  const t = m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0.9, 0.14, 0.12];
  const RED = 0.86, LO = 0.30, span = RED - LO;
  const row = (tk) => { const a = (tk - LO) / span, bc = (1 - a) / 2; return a + ' ' + bc + ' ' + bc + ' 0 0'; };
  return row(t[0]) + ' ' + row(t[1]) + ' ' + row(t[2]) + ' 0 0 0 1 0';
}

// 선으로 튀어나오는 큰 날짜 라벨 — 남색 둥근박스 + 흰 날짜 + 청록 시각.
// 지시선은 태풍 지점에서 45°로 꺾여 박스로 이어지고, 박스는 드래그로 옮겨도 끝점은 태풍에 고정.
// 태풍점(px,py) → 박스(중심 b.x,b.y, 크기 w×h) 45° 팔꿈치 지시선 { d, len, ax, ay, useLeft }.
function typhoonLeaderGeom(px, py, bx, by, w, h) {
  const left = bx - w / 2, right = bx + w / 2;
  // 박스의 좌/우 모서리 중 태풍점에 가까운 쪽 중앙에 붙인다
  const useLeft = Math.abs(px - left) <= Math.abs(px - right);
  const ax = useLeft ? left : right, ay = by;
  const sgnx = ax >= px ? 1 : -1;
  const dyAbs = Math.abs(ay - py);
  const room = Math.abs(ax - px);
  const diag = Math.min(dyAbs, room);          // 45° 대각선 길이(수평 여유가 부족하면 줄임)
  const kneeX = px + sgnx * diag, kneeY = py + (ay >= py ? diag : -diag);
  // 지시선 시작점을 아이콘 중심에서 살짝 띄운다 — 선이 아이콘 얼굴을 가로지르지 않게(선이 아이콘 앞으로 보이는 문제).
  const GAP = 16;
  const kd = Math.hypot(kneeX - px, kneeY - py) || 1;
  const sx = px + (kneeX - px) / kd * Math.min(GAP, kd * 0.9), sy = py + (kneeY - py) / kd * Math.min(GAP, kd * 0.9);
  const d = `M${sx.toFixed(1)} ${sy.toFixed(1)}L${kneeX} ${kneeY}L${ax} ${ay}`;
  const len = Math.hypot(kneeX - sx, kneeY - sy) + Math.hypot(ax - kneeX, ay - kneeY);
  return { d, len, ax, ay, useLeft };
}
// 태풍 라벨 하나 → { box, line }. box는 노말 라벨과 '똑같은' 리치 박스(드래그·선택·편집기 공유).
function typhoonLabelParts(b, px, py, k) {
  // b.x/b.y는 '기울지 않은' 지도평면 좌표. 표시할 땐 카메라로 투영해 지도에 붙인다(틸트 없으면 그대로).
  const [bx, by] = camProjectXY(b.x, b.y);
  const g = el('g', { class: 'drag', 'data-kind': 'label', 'data-id': b.id, transform: `translate(${bx} ${by})` });
  if (S.labShadow == null ? true : S.labShadow) g.setAttribute('filter', 'url(#typhoonLabelShadow)');
  L_typhoon_attachTmp(g);                        // getBBox 측정용 임시 부착(아래에서 실제 위치로 옮김)
  const { w, h } = fillLabelBox(g, b, k);
  b._w = w; b._h = h;                            // 드래그 중 지시선 갱신에 쓰려고 크기 기억
  const geom = typhoonLeaderGeom(px, py, bx, by, w, h);
  const line = _te('path', { 'data-leader-id': b.id, d: geom.d, stroke: '#DCE8F7', 'stroke-width': 2.6, fill: 'none', 'stroke-opacity': 0.9, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  // 생성 애니메이션(라벨별): 선이 태풍점에서 수욱 뻗고(reveal) → 선 끝(anchor)에서 박스가 스케일로 커진다.
  const { reveal, scale } = typhoonLabelProg(b.id);
  if (reveal < 1) { line.setAttribute('stroke-dasharray', geom.len); line.setAttribute('stroke-dashoffset', geom.len * (1 - reveal)); }
  if (scale < 1) {
    const aLx = geom.useLeft ? -w / 2 : w / 2;   // 박스 로컬 기준 선 끝(anchor) x — 여기서부터 커진다
    g.setAttribute('transform', `translate(${bx} ${by}) translate(${aLx} 0) scale(${scale}) translate(${-aLx} 0)`);
    g.setAttribute('opacity', Math.max(0, Math.min(1, scale * 2)));
  }
  return { box: g, line };
}
// 드래그/방향키 중 지시선만 가볍게 다시 그린다(박스 노드는 그대로 두어 드래그가 끊기지 않게).
function updateTyphoonLeaders() {
  const LB = $('#L_typhoonLabels'); if (!LB) return;
  const sp = typhoonScreenPts(curTyphoonPoints());
  const idxXY = {}; for (const p of sp) if (!p.head) idxXY[p.idx] = p;
  for (const b of labelList()) {
    const path = LB.querySelector(`[data-leader-id="${b.id}"]`), p = idxXY[b.idx];
    if (path && p) { const [prx, pry] = camProjectXY(p.x, p.y); const [bx, by] = camProjectXY(b.x, b.y); path.setAttribute('d', typhoonLeaderGeom(prx, pry, bx, by, b._w || 100, b._h || 60).d); }
  }
  updatePlaceMarkers();   // 지명(원+라벨)도 회전/이동에 맞춰 갱신
}
// 지명표시를 현재 카메라(3D 회전·틸트)에 맞춰 다시 배치. 원은 경위도 고정(래스터에서 이동)이라
// 라벨 박스는 원의 현재 투영위치+오프셋으로, 지시선도 그에 맞춰 갱신 → 회전해도 원에 붙어 따라온다.
function updatePlaceMarkers() {
  const places = (S.typhoon && S.typhoon.places) || [];
  if (!places.length) return;
  const LB = $('#L_typhoonLabels'); if (!LB) return;
  for (const pl of places) {
    if (pl.off) continue;
    const g = LB.querySelector(`[data-place-label="${pl.id}"]`);
    const line = LB.querySelector(`[data-place-leader="${pl.id}"]`);
    if (!g && !line) continue;
    const [fx, fy] = typhoonXY(pl.lon, pl.lat);
    const [sx, sy] = camProjectXY(fx, fy);
    const lx = sx + (pl.ox == null ? 0 : pl.ox), ly = sy + (pl.oy == null ? -52 : pl.oy);
    if (g) g.setAttribute('transform', `translate(${lx} ${ly})`);
    if (line) line.setAttribute('d', typhoonLeaderGeom(sx, sy, lx, ly, pl._w || 100, pl._h || 44).d);
  }
}
// fillLabelBox는 g가 DOM에 있어야 getBBox가 되므로, 측정용으로 잠깐 태풍 레이어에 붙였다 뗀다.
function L_typhoon_attachTmp(g) { const L = $('#L_typhoon'); if (L) L.appendChild(g); }

// 반경 밴드 — '원 + 세그먼트 사다리꼴'을 그룹 opacity로 합성(겹침 진해짐 없음, 굽은 경로에도 안정적).
// 외곽선(점선)은 각 지점 원에 스트로크로 얹는다(밴드에서 켜고 끔).
function typhoonBandInto(parent, sp, key, st) {
  const P = sp.filter((p) => p[key] > 0);
  if (!P.length) return;
  // 채우기 — 원 + 세그먼트 사다리꼴을 그룹 opacity로 합성(겹침 진해짐 없음, 어떤 경로에도 안정적)
  const fg = _te('g', { opacity: st.fillOp });
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], ra = a[key], rb = b[key];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    fg.appendChild(_te('path', { fill: st.fill, d: `M${a.x + nx * ra} ${a.y + ny * ra}L${b.x + nx * rb} ${b.y + ny * rb}L${b.x - nx * rb} ${b.y - ny * rb}L${a.x - nx * ra} ${a.y - ny * ra}Z` }));
  }
  for (const p of P) fg.appendChild(_te('circle', { cx: p.x, cy: p.y, r: p[key], fill: st.fill }));
  parent.appendChild(fg);
  // 외곽 점선 — 좌/우 오프셋 폴리라인 + 양 끝 둥근 캡을 이은 '하나의 닫힌 튜브' 외곽선.
  if (st.strokeW > 0 && P.length >= 2) {
    const rawL = [], rawR = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const nx = -dy, ny = dx, r = P[i][key];
      rawL.push([P[i].x + nx * r, P[i].y + ny * r]); rawR.push([P[i].x - nx * r, P[i].y - ny * r]);
    }
    // 오목한 급커브에서 안쪽 오프셋이 접혀(자기교차) 외곽선에 이상한 선이 생긴다.
    // → 진행방향(센터라인)과 반대로 꺾이는 안쪽 점은 건너뛴다(끝점은 캡 위해 항상 유지). 원(채우기)이 코너를 덮는다.
    const clean = (arr) => {
      const out = [arr[0]];
      for (let i = 1; i < arr.length - 1; i++) {
        const prev = out[out.length - 1];
        const cdx = P[i].x - P[i - 1].x, cdy = P[i].y - P[i - 1].y;   // 센터라인 진행방향
        const odx = arr[i][0] - prev[0], ody = arr[i][1] - prev[1];   // 오프셋 진행방향
        if (odx * cdx + ody * cdy > 0) out.push(arr[i]);   // 같은 방향이면 유지, 접히면 skip
      }
      if (arr.length > 1) out.push(arr[arr.length - 1]);
      return out;
    };
    const L = clean(rawL), R = clean(rawR);
    const rl = P[P.length - 1][key], rf = P[0][key];
    const RL = R[R.length - 1], RF = R[0];
    let d = 'M' + L[0][0] + ' ' + L[0][1];
    for (let i = 1; i < L.length; i++) d += 'L' + L[i][0] + ' ' + L[i][1];
    d += `A${rl} ${rl} 0 0 0 ${RL[0]} ${RL[1]}`;    // 예보 끝 둥근 캡(바깥쪽)
    for (let i = R.length - 2; i >= 0; i--) d += 'L' + R[i][0] + ' ' + R[i][1];
    d += `A${rf} ${rf} 0 0 0 ${L[0][0]} ${L[0][1]}Z`;         // 시작 둥근 캡(바깥쪽)
    const a = { d, fill: 'none', stroke: st.stroke, 'stroke-width': st.strokeW, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
    if (st.dash) a['stroke-dasharray'] = (st.strokeW * 4) + ' ' + (st.strokeW * 3.5);
    parent.appendChild(_te('path', a));
  }
}
