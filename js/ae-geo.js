/* [모듈] js/ae-geo.js — AE로 보내기 'GEOlayers 지도로'(10-10): 보내는 방식 고르기 팝업·헬퍼 확인(/api/geo-caps), geo 명세(앱 지도 위치 ↔ 위경도 ↔ GEOlayers 보기, 태풍 GeoJSON — 순수 함수), 지도에 붙는 겹 PNG */
'use strict';

// ===== AE로 보내기 — GEOlayers 지도로 =====
// 지도(위성 타일)는 AE의 GEOlayers 3 맵 컴프가 그리고, 앱은 보기(가운데 위경도·zoom·bearing)를 키로 넘긴다.
// 태풍(경로·반경·아이콘·라벨)은 지금 리깅(헬퍼 typhoonRig·compareRig) 그대로 보낸다 — 헬퍼(desktop/wns/geo-jsx.js)가 리깅의 CAM 널을
// GEOlayers 앵커 레이어에 표현식으로 묶어서, AE에서 보기를 고쳐도 태풍이 지도를 그대로 따라간다.
// 근거(GEOlayers 3 v1.17.0 설치 파일 — 읽기만):
//  · expressions/mapPivotScale.jsx — 배율 = 100·2^Zoom/2^18·512 % → zoom z에서 세계 너비 = 512·2^z 맵 컴프 px
//    (MapLibre·Mapbox GL의 512 타일 zoom과 같은 뜻 — js/gl-basemap.js glbView와 같은 식).
//  · expressions/mapPivotAnchorPoint.jsx, support_files/scripts/distance_circle.jsx — 세계 px = 0..2^18 웹 메르카토르
//    x = (lon+180)/360·2^18, y = (0.5 − ln((1+sinφ)/(1−sinφ))/4π)·2^18. 맵 컴프 앵커 레이어의 레이어 공간이 이 세계 px다.
//  · expressions/mapPivotOrientation.jsx — 방향 = [−Pitch, 0, Bearing] — AE 회전 +(시계 방향) = Bearing.
//    앱 카메라 rz도 화면(y 아래)에서 내용을 시계 방향으로 돌리므로(camProjectXY) GEOlayers Bearing = rz.
const GEO_MAP_SIZE = 262144;   // 2^18 — GEOlayers 세계 px 크기
const GEO_TILE = 512;          // zoom 기준 타일 크기(px)
const GEO_MAX_FRAMES = 3000;   // 보기 키를 프레임마다 굽는 최대 수(넘으면 간격을 넓힌다)
const GEO_CIRCLE_N = 128;      // 반경 원 꼭짓점 수 — 반지름 1000px에서도 변 가운데 오차 0.3px
const AE_MODE_KEY = 'wcg_ae_mode';   // 마지막으로 고른 보내는 방식(이 PC의 편의 기능 — 작업 S와 무관)

// 메르카토르 y(라디안) ↔ 위도(도) — 앱 projLL과 같은 구형 웹 메르카토르
const geoMerc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const geoLatOf = (my) => ((2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180) / Math.PI;
// 경위도 → GEOlayers 세계 px(LonToPixelX·LatToPixelY와 같은 식, 위도는 ±85.05112878로 자름)
function geoWorldXY(lon, lat) {
  const la = Math.max(-85.05112878, Math.min(85.05112878, lat)), sn = Math.sin((la * Math.PI) / 180);
  return [((lon + 180) / 360) * GEO_MAP_SIZE, (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * GEO_MAP_SIZE];
}
// 앱 지도 위치(cam = {x, y, s, rz} — 뷰박스 1920×1080의 지도 원점·배율·회전) → GEOlayers 보기.
// proj = MAP.proj, k = 출력 px / 뷰박스 px(터치 2158×1214면 ≈1.124). 화면 가운데(960, 540) = 보기 가운데(회전은 가운데 기준이라 그대로).
// zoom = log2(2π·scale·s·k/512) — 출력 px로 잰 '라디안당 px'(scale·s·k)가 GEOlayers 세계 너비 512·2^z의 1/2π와 같아지는 값.
function geoViewOf(cam, proj, k) {
  const s = +cam.s || 1;
  const lx = (960 - (+cam.x || 0)) / s, ly = (540 - (+cam.y || 0)) / s;
  const mx = lx / proj.scale + proj.cx0, my = proj.cy0 - ly / proj.scale;
  return { latitude: geoLatOf(my), longitude: (mx * 180) / Math.PI, zoom: Math.log2((2 * Math.PI * proj.scale * s * k) / GEO_TILE), bearing: +cam.rz || 0, pitch: 0 };
}
// 앱 화면에서 경위도가 놓이는 출력 px(지도 원점·배율 → 출력 배율 k → 가운데 기준 rz 회전) — 시험·대조용
function geoAppXY(lon, lat, cam, proj, k, W, H) {
  const lx = ((lon * Math.PI) / 180 - proj.cx0) * proj.scale, ly = -(geoMerc(lat) - proj.cy0) * proj.scale;
  const s = +cam.s || 1, x = ((+cam.x || 0) + lx * s) * k - W / 2, y = ((+cam.y || 0) + ly * s) * k - H / 2;
  const r = ((+cam.rz || 0) * Math.PI) / 180, c = Math.cos(r), n = Math.sin(r);
  return [W / 2 + x * c - y * n, H / 2 + x * n + y * c];
}
// GEOlayers 보기에서 경위도가 놓이는 컴프 px — 맵 컴프가 담는 컴프(W×H)에 1:1·가운데일 때(GEOlayers 기본).
// 세계 px 차 × 2^zoom·512/2^18(mapPivotScale) → 가운데 기준 Bearing만큼 시계 방향 회전(mapPivotOrientation)
function geoCompXY(lon, lat, gv, W, H) {
  const [X, Y] = geoWorldXY(lon, lat), [Xc, Yc] = geoWorldXY(gv.longitude, gv.latitude);
  const f = (Math.pow(2, gv.zoom) * GEO_TILE) / GEO_MAP_SIZE, dx = (X - Xc) * f, dy = (Y - Yc) * f;
  const r = ((+gv.bearing || 0) * Math.PI) / 180, c = Math.cos(r), n = Math.sin(r);
  return [W / 2 + dx * c - dy * n, H / 2 + dx * n + dy * c];
}
// GeoJSON 고리 — 첫 점 = 끝 점, 반시계(RFC 7946 바깥 고리). 겹친 다각형을 한 셰이프로 칠해도(0이 아닌 감김) 구멍이 안 생기게 모두 같은 방향.
function geoRingCCW(ring) {
  const r = ring.slice();
  if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0].slice());
  let a = 0;
  for (let i = 0; i + 1 < r.length; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return a < 0 ? r.reverse() : r;
}
const geoRound = (v, d) => +(+v).toFixed(d);
// 메르카토르 평면(u = 경도 라디안, v = −메르카토르 y — 화면처럼 아래로 +) → [경도, 위도]
const geoUV2LL = (u, v) => [geoRound((u * 180) / Math.PI, 7), geoRound(geoLatOf(-v), 7)];
// 반경 원 — 앱과 같은 '메르카토르 원'(typhoonKmToUnit: km·scale/(R·cosφ) — 그 지점 위도에서 sec 보정한 등각 원)을 n각형으로.
// 화면에 그려지는 원과 꼭짓점이 1:1로 겹친다 — 앱 화면을 따른다. 측지 원과의 차이는 km로 재면 배율과 무관하게
// 260km·위도 15°에서 약 ±1.5km, 430km·30°에서 약 ±8.6km(2%), 500km·45°에서 약 ±20km(4%). 화면 px로는 배율 s에 비례한다(430km·30°: s 0.3 ≈ 4.5px, s 1 ≈ 15px).
function geoCircleRing(lon, lat, km, n) {
  n = n || GEO_CIRCLE_N;
  const u0 = (lon * Math.PI) / 180, v0 = -geoMerc(lat), r = km / (TYPHOON_R_EARTH * Math.cos((lat * Math.PI) / 180)), out = [];
  for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; out.push(geoUV2LL(u0 + r * Math.cos(a), v0 + r * Math.sin(a))); }
  return geoRingCCW(out);
}
// 반경 띠(앱 typhoonBandInto와 같은 모양) = 지점마다 원 + 이웃 지점 사이 사다리꼴(중심에서 수직으로 ±r).
// pts = [{lon, lat, r(km)}] — 반경이 0보다 큰 지점만(앞뒤를 바로 잇는다). 사다리꼴은 메르카토르 평면에서 계산해 경위도로 되돌린다.
function geoBandPolys(pts) {
  const P = pts.filter((p) => p.r > 0).map((p) => ({ u: (p.lon * Math.PI) / 180, v: -geoMerc(p.lat), r: p.r / (TYPHOON_R_EARTH * Math.cos((p.lat * Math.PI) / 180)), lon: p.lon, lat: p.lat, km: p.r }));
  const polys = [];
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], du = b.u - a.u, dv = b.v - a.v, len = Math.hypot(du, dv) || 1, nu = -dv / len, nv = du / len;
    polys.push([geoRingCCW([geoUV2LL(a.u + nu * a.r, a.v + nv * a.r), geoUV2LL(b.u + nu * b.r, b.v + nv * b.r), geoUV2LL(b.u - nu * b.r, b.v - nv * b.r), geoUV2LL(a.u - nu * a.r, a.v - nv * a.r)])]);
  }
  for (const p of P) polys.push([geoCircleRing(p.lon, p.lat, p.km)]);
  return polys;
}
const geoFC = (features) => ({ type: 'FeatureCollection', features });
const geoLine = (pts, props) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: pts.map((p) => [geoRound(p.lon, 7), geoRound(p.lat, 7)]) } });
// 보기(GEOlayers view) → 헬퍼로 넘기는 값(자릿수 정리)
const geoViewOut = (v) => ({ latitude: geoRound(v.latitude, 8), longitude: geoRound(v.longitude, 8), zoom: geoRound(v.zoom, 7), bearing: geoRound(v.bearing, 5), pitch: 0 });
// 카메라 키 → 보기 키, 그리고 키 사이를 프레임마다 구운 보기(앱 camAt 그대로 — 위치·배율이 같은 e로 보간되므로 위경도·zoom을 따로 보간하면
// 키 사이 가운데가 어긋난다. 프레임마다 키를 두면 GEOlayers 쪽 보간 방식과 무관하게 화면과 같다). 키가 0~1개면 frames = null(한 보기).
// 줄 시각 = AE 프레임 격자 n/fps(첫 키 ~ 끝 키 안) + 맨 앞·맨 끝 키 시각. AE는 n/fps에서 값을 읽으므로 격자 밖에 구우면 두 줄 사이를 선형으로 읽어
// 이징 가속 구간에서 어긋난다(큰 확대에서 약 1px). 줄이 GEO_MAX_FRAMES를 넘으면 간격을 프레임의 정수배로 넓힌다.
function geoViewPlan(proj, k, fps) {
  const ks = camKeys().slice().sort((a, b) => a.t - b.t);
  const keys = ks.map((q) => Object.assign({ t: +(+q.t).toFixed(4) }, geoViewOut(geoViewOf(q, proj, k))));
  const tilt = ks.some((q) => Math.abs(+q.rx || 0) > 0.05 || Math.abs(+q.ry || 0) > 0.05);
  const work = geoViewOut(geoViewOf(ks.length === 1 ? ks[0] : S.map, proj, k));
  let frames = null;
  if (ks.length >= 2) {
    const f = fps || 29.97, t0 = +ks[0].t, t1 = +ks[ks.length - 1].t;
    const n0 = Math.ceil(t0 * f - 1e-6), n1 = Math.floor(t1 * f + 1e-6), step = Math.max(1, Math.ceil((n1 - n0 + 1) / (GEO_MAX_FRAMES - 2)));
    const ts = [t0];
    for (let n = n0; n <= n1; n += step) { const t = n / f; if (t > t0 + 1e-6 && t < t1 - 1e-6) ts.push(t); }
    if (t1 > t0) ts.push(t1);
    const rows = ts.map((raw) => {
      const t = +raw.toFixed(6), v = geoViewOut(geoViewOf(camAt(t), proj, k));   // 키 시각 = 보기를 잰 시각(반올림한 그 시각)
      return [t, v.latitude, v.longitude, v.zoom, v.bearing];
    });
    frames = { fps: f, rows };
  }
  return { work, keys, frames, tilt };
}
// 단일 태풍 GeoJSON(편집용 GEOlayers 셰이프 — 헬퍼가 draw로 그려 꺼 둔다) + 그 스타일. 표시 날짜 범위·현재 위치·r15 여유·눈 꺼둔 반경을 화면과 같게.
function geoTyphoonSingle(kk) {
  const T = S.typhoon || {}, pts = curTyphoonPoints(), nowIdx = typhoonNowIdx(pts);
  const lineMode = T.trackMode === 'line';
  const r15b = +T.r15Buf || 0;
  const vis = pts.map((p, idx) => ({ p, idx })).filter((o) => typhoonIdxInRange(pts, o.idx));
  const ll = (o) => ({ lon: +o.p.lon, lat: +o.p.lat });
  const past = vis.filter((o) => o.idx <= nowIdx).map(ll), fcst = vis.filter((o) => o.idx >= nowIdx).map(ll);
  const trackW = Math.max(1, +T.lineWidth || 5), iconCol = T.iconCol || '#E5231E', lineCol = T.lineColor || iconCol;
  const geojson = {}, draw = [];
  for (const k of lineMode ? [] : ['r70', 'r15', 'r25']) {
    const st = Object.assign({}, TYPHOON_BAND_DEF[k], (T.bands && T.bands[k]) || {});
    if (st.off) continue;
    const bp = vis.filter((o) => o.idx >= nowIdx).map((o) => ({ lon: +o.p.lon, lat: +o.p.lat, r: (+o.p[k] || 0) ? (+o.p[k] || 0) + (k === 'r15' ? r15b : 0) : 0 }));
    const polys = geoBandPolys(bp);
    if (!polys.length) continue;
    geojson[k] = geoFC([{ type: 'Feature', properties: { role: k }, geometry: { type: 'MultiPolygon', coordinates: polys } }]);
    draw.push({ key: k, name: 'GEO_' + bandName(k), kind: 'fill', col: st.fill, op: +st.fillOp, stroke: st.stroke, w: +((st.strokeW || 0) * kk).toFixed(3), dash: st.dash ? 1 : 0 });
  }
  if (past.length > 1) { geojson.past = geoFC([geoLine(past, { role: 'past' })]); draw.push({ key: 'past', name: 'GEO_경로(지난)', kind: 'line', col: lineMode ? lineCol : '#96A0AD', w: +((lineMode ? trackW : Math.max(1.5, trackW * 0.55)) * kk).toFixed(3), dash: 0 }); }
  if (fcst.length > 1) { geojson.fcst = geoFC([geoLine(fcst, { role: 'forecast' })]); draw.push({ key: 'fcst', name: 'GEO_경로(예상)', kind: 'line', col: lineMode ? lineCol : '#FFFFFF', w: +(trackW * kk).toFixed(3), dash: 1 }); }
  if (vis.length) {
    geojson.points = geoFC(vis.map((o) => ({ type: 'Feature', properties: { idx: o.idx, label: String(o.p.label || ''), fcst: !!o.p.fcst, ws: o.p.ws == null ? null : +o.p.ws, ex: !!o.p.ex, past: o.idx < nowIdx, now: o.idx === nowIdx },
      geometry: { type: 'Point', coordinates: [geoRound(o.p.lon, 7), geoRound(o.p.lat, 7)] } })));
  }
  return { kind: 'single', nowIdx, geojson, draw };
}
// 비교 지도 GeoJSON — 예보선마다 선 하나(그 예보 색·굵기)
function geoTyphoonCompare(kk) {
  const geojson = {}, draw = [];
  let i = 0;
  for (const c of ((S.typhoon && S.typhoon.compare) || [])) {
    if (!c.show) continue;
    const cp = compareVisiblePoints(c).map((p) => ({ lon: +p.lon, lat: +p.lat }));
    if (cp.length < 2) continue;
    const key = 'c' + i++;
    geojson[key] = geoFC([geoLine(cp, { role: 'compare', name: String(c.name || '') })]);
    draw.push({ key, name: 'GEO_' + String(c.name || key), kind: 'line', col: c.color || '#FF5A5A', w: +((c.lineW || 2.2) * kk).toFixed(3), dash: 0 });
  }
  return { kind: 'compare', geojson, draw };
}
// 헬퍼로 보낼 geo 명세 — o = { kk(출력 배율), fps, kr(남한 강조 PNG 파일 이름 | null) }.
// bind: 리깅 CAM 널을 GEOlayers에 묶는 상수 — 투영 원점(지도 로컬 0,0)의 세계 px, 작업 뷰의 '출력 px / 라디안'(CAM 배율 100% 기준).
// 토큰·개인 지도 스타일 주소는 싣지 않는다(지도 그림은 사용자가 GEOlayers에서 고른 이미지).
function aeGeoSpec(o) {
  const proj = MAP.proj, kk = o.kk || 1;
  const view = geoViewPlan(proj, kk, o.fps);
  const typhoon = isTyphoonCompare() ? geoTyphoonCompare(kk) : geoTyphoonSingle(kk);
  const draw = typhoon.draw; delete typhoon.draw;
  return {
    v: 1,
    proj: { cx0: proj.cx0, cy0: proj.cy0, scale: proj.scale },
    out: { k: kk },
    bind: { origin: geoWorldXY((proj.cx0 * 180) / Math.PI, geoLatOf(proj.cy0)).map((v) => geoRound(v, 6)), sigma0: geoRound(proj.scale * (+S.map.s || 1) * kk, 9) },
    view,
    overlays: o.kr ? { kr: { file: o.kr, blend: 'screen' } } : {},
    typhoon,
    draw,
    finalize: 1,
  };
}
// GEOlayers 길의 리깅 카메라 — 위치·배율은 모두 작업 뷰(항등)다. 헬퍼가 CAM 널을 만들게 하려는 것이고, 실제 움직임(위치·배율·방향)은
// 헬퍼가 CAM에 거는 표현식(GEOlayers 앵커 따라가기)이 맡는다. 키 시각은 앱 카메라 키 그대로(컴프 길이가 카메라 키 끝까지).
// 회전(rz)은 앱 키 그대로 — 회전이 있으면 헬퍼가 ROT 널(피벗 = 프레임 가운데)을 만들고 라벨 박스·지시선을 그 회전으로 돌린다(앱 camProjectXY처럼).
// GEOlayers 길에서는 헬퍼(geo-jsx)가 CAM을 ROT에서 떼고 ROT 회전을 CAM 방향(GEOlayers Bearing)에 묶는다 — 여기 rz 키는 표현식이 꺼졌을 때의 대비.
function aeGeoCamSpec(pt, m0) {
  const [W, H] = RES[S.res].size;
  const a = pt(+m0.x, +m0.y), s0 = +m0.s || 1;
  const ks = camKeys().slice().sort((x, y) => x.t - y.t);
  const keys = ks.map((q) => ({ t: +q.t || 0, x: a.x, y: a.y, s: s0, rz: +q.rz || 0 }));
  if (!keys.length) keys.push({ t: 0, x: a.x, y: a.y, s: s0, rz: 0 });
  return { anchor: [a.x, a.y], sBaked: s0, keys, ease: aeEaseOf(EASE_BEZIER), pivot: [W / 2, H / 2] };
}
// 지도 바탕 노드 — GEOlayers가 그리므로 겹 PNG에서 뺀다(바다·배경 그림·Mapbox 타일·위성·육지·해안선·남한 바탕·지형·이웃 나라)
const GEO_BASE_IDS = ['#typhoonOcean', '#bgImg', '#typhoonTiles', '#typhoonSat', '#typhoonLand', '#typhoonCoast', '#typhoonKrBase', '#typhoonRelief', '#nbrNW', '#nbrJP'];
function aeGeoStripBase(c) {
  for (const id of GEO_BASE_IDS) c.querySelector(id)?.remove();
  c.querySelector('#bgMapT')?.removeAttribute('data-glb');   // 가벼운 지도(GL) 그림을 넣지 않게 — svgBlob이 이 표시를 보고 넣는다
  const g = c.querySelector('#typhoonGrid'); if (g && !g.getAttribute('clip-path')) g.remove();   // 파란 지도의 격자는 육지가 가려 주던 것 — 바다만 자르는 클립이 없으면 뺀다
}
// 지도에 붙는 겹(투명 PNG) — 지명표시·시도선·격자(바다만) 등. 태풍 트랙·라벨은 리깅이, 남한 강조는 aeGeoKrBlob(스크린 혼합)이 따로 만든다.
async function aeGeoOverlayBlob(opt) {
  return svgBlob((c) => {
    for (const id of ['#L_title', '#L_legend', '#L_refImg']) c.querySelector(id)?.remove();
    for (const id of ['#L_typhoon', '#L_typhoonLabels']) { const ly = c.querySelector(id); if (ly) [...ly.children].forEach((ch) => { if (!ch.hasAttribute('data-place-dot') && !ch.hasAttribute('data-place-label') && !ch.hasAttribute('data-place-leader')) ch.remove(); }); }
    aeGeoStripBase(c);
    c.querySelector('#typhoonKr')?.remove();
  }, false, opt);
}
// 남한 강조만(투명 PNG) — 화면은 mix-blend screen. 투명 바탕 위라 그냥 굽고 AE에서 스크린 혼합으로 얹는다. 꺼져 있으면 null.
async function aeGeoKrBlob(opt) {
  const kr = document.getElementById('typhoonKr');
  if (!kr || kr.style.display === 'none' || !kr.getAttribute('d')) return null;
  return svgBlob((c) => {
    keepLayers(c, ['L_bg']);
    const bm = c.querySelector('#bgMapT');
    if (bm) { [...bm.children].forEach((ch) => { if (ch.id !== 'typhoonKr') ch.remove(); }); bm.removeAttribute('data-glb'); }
    c.querySelector('#typhoonOcean')?.remove(); c.querySelector('#bgImg')?.remove();
    const k = c.querySelector('#typhoonKr'); if (k) k.style.mixBlendMode = '';
  }, false, opt);
}

// ===== 보내는 방식 고르기 =====
// 헬퍼가 GEOlayers 길을 아는지·이 PC에 GEOlayers 3가 있는지(GET /api/geo-caps — 옛 헬퍼는 404). 못 받으면 null.
async function aeGeoCaps() {
  try {
    const r = await fetch(WNS_HELPER + '/api/geo-caps', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok ? j : null;
  } catch (e) { return null; }
}
// GEOlayers로 보낼 수 없는 까닭(한 줄) — 쓸 수 있으면 ''
function aeGeoWhyNot(caps) {
  if (!isTyphoon()) return '태풍 지도에서만 써요';
  if (S.res === '1920x1080-vf') return '노말 VF에서는 아직 못 써요';
  if (!caps) return '기능 확장팩이 몰라요 — 앱을 다시 실행해 주세요';
  if (!caps.geolayers || !caps.geolayers.installed) return '이 PC에 GEOlayers 3가 없어요';
  return '';
}
// 팝업 카드 내용(순수 — 시험용). 고른 것: 저장해 둔 방식이 쓸 수 있으면 그것, 아니면 지금 방식.
// geoNote: GEOlayers 지도로를 골랐을 때 아래 안내 — 설치판이 지원하는 AE 범위(manifest AEFT, 헬퍼 /api/geo-caps의 ae)를 알면 덧붙인다
//   (예: 1.17.0 = AE 26.9까지 — 더 새 AE에서는 패널이 아예 안 떠서 '패널을 열라'는 안내만으로는 모른다)
function aeModeCards(caps, saved) {
  const why = aeGeoWhyNot(caps), gl = (caps && caps.geolayers) || {}, ver = gl.version ? ' ' + gl.version : '';
  const cards = [
    { id: 'layers', name: '레이어 그림으로', sub: '지금 방식 — 지도·태풍을 앱 그림 레이어로, AE 카메라로 움직여요', why: '' },
    // 실제 AE에서 아직 다 맞춰 보지 못한 길이라 '시험 중'을 이름에 붙인다(사용자 10-12)
    { id: 'geolayers', name: 'GEOlayers 지도로 (시험 중)', sub: why || ('GEOlayers 3' + ver + ' 맵 컴프에 위성 지도 — 보기·태풍은 앱 그대로 따라가요 · 아직 시험 중이라 결과가 어긋날 수 있어요'), why },
  ];
  const pick = saved === 'geolayers' && !why ? 'geolayers' : 'layers';
  const ae = Array.isArray(gl.ae) && gl.ae.length === 2 && gl.ae.every((x) => Number.isFinite(+x)) ? gl.ae : null;
  const geoNote = 'AE에서 GEOlayers 3 패널을 열고, 위성 이미지로 맵 컴프를 하나 만들어 열어 두세요 — 그 맵 컴프를 복제해 보기·태풍을 얹어요.' +
    (ae ? ' 설치된 GEOlayers 3' + ver + '는 AE ' + (+ae[0]) + '~' + (+ae[1]) + '판에서만 패널이 떠요(더 새 AE면 GEOlayers를 새 판으로).' : '');
  return { cards, pick, geoNote };
}
const AE_MODE_ICON = {
  layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l9.5 5.2-9.5 5.2-9.5-5.2zM4.6 11.3L12 15.4l7.4-4.1 2.1 1.2L12 17.7l-9.5-5.2zm0 4.6L12 20l7.4-4.1 2.1 1.2L12 22.3l-9.5-5.2z"/></svg>',
  geolayers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 2a10 10 0 110 20 10 10 0 010-20zm-1.4 2.1A8 8 0 004.3 9.5h3.4c.5-2 1.5-3.9 2.9-5.4zm2.8 0c1.4 1.5 2.4 3.4 2.9 5.4h3.4a8 8 0 00-6.3-5.4zM12 4.6c-1.3 1.3-2.2 3-2.7 4.9h5.4c-.5-1.9-1.4-3.6-2.7-4.9zM4 11.5a8 8 0 000 1h3.4a15 15 0 010-1zm5.3 0a13 13 0 000 1h5.4a13 13 0 000-1zm7.3 0a15 15 0 010 1H20a8 8 0 000-1zM4.3 14.5a8 8 0 006.3 5.4c-1.4-1.5-2.4-3.4-2.9-5.4zm5 0c.5 1.9 1.4 3.6 2.7 4.9 1.3-1.3 2.2-3 2.7-4.9zm7 0c-.5 2-1.5 3.9-2.9 5.4a8 8 0 006.3-5.4z"/></svg>',
};
// 'After Effects로 보내기' 토스 모달 — 카드 2장(지금 방식 / GEOlayers 지도로). 고르면 'layers'|'geolayers', 취소·Esc·바깥이면 null.
function aeAskMode(caps) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    let saved = null; try { saved = localStorage.getItem(AE_MODE_KEY); } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
    const { cards, pick: pick0, geoNote } = aeModeCards(caps, saved);
    let pick = pick0;
    const m = tossModal({
      title: 'After Effects로 보내기', sub: '보내는 방식을 골라 주세요', wide: true,
      bodyHTML: '<div class="cgsChoices aeModeCards"></div><p class="cgsNote aeModeNote"></p>',
      footHTML: '<button class="tossBtn ghost" data-cancel>취소</button><button class="tossBtn pri" data-go>보내기</button>',
      onClose: () => fin(null),
    });
    const box = m.body.querySelector('.aeModeCards'), note = m.body.querySelector('.aeModeNote');
    const sync = () => {
      for (const b of box.children) { const on = b.dataset.mode === pick; b.classList.toggle('choicePending', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      note.textContent = pick === 'geolayers' ? geoNote : '지금처럼 지도·태풍을 앱 그림 레이어로 보내요.';
    };
    for (const cd of cards) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cgsCard'; b.dataset.mode = cd.id;
      if (cd.why) { b.setAttribute('aria-disabled', 'true'); b.title = cd.why; }
      const ic = document.createElement('span'); ic.className = 'cgsCardIcon'; ic.innerHTML = AE_MODE_ICON[cd.id];   // 정적 아이콘 문자열
      const tx = document.createElement('span'); tx.className = 'cgsCardTxt';
      const nm = document.createElement('b'); nm.textContent = cd.name;
      const sm = document.createElement('small'); sm.textContent = cd.sub;
      tx.append(nm, sm); b.append(ic, tx);
      b.onclick = () => { if (cd.why) return; pick = cd.id; sync(); };
      b.ondblclick = () => { if (cd.why) return; pick = cd.id; go(); };
      box.append(b);
    }
    const go = () => { try { localStorage.setItem(AE_MODE_KEY, pick); } catch (e) { /* 이번만 */ } fin(pick); m.close(); };
    m.foot.querySelector('[data-go]').onclick = go;
    m.foot.querySelector('[data-cancel]').onclick = () => { fin(null); m.close(); };
    m.card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(); } });
    sync();
    try { m.foot.querySelector('[data-go]').focus({ preventScroll: true }); } catch (e) { /* 포커스 못 줘도 된다 */ }
  });
}
// 제목줄 'AE로 보내기' — 헬퍼가 GEOlayers 길을 알고 이 PC에 GEOlayers 3가 있으면 방식을 묻고, 아니면 지금처럼 바로 보낸다
// (옛 헬퍼·헬퍼 꺼짐·GEOlayers 없음 = 팝업 없이 sendToAE — 부팅 점검도 이 길).
async function aeSendClick() {
  const caps = await aeGeoCaps();
  if (!caps || !caps.geolayers || !caps.geolayers.installed) return sendToAE();
  const mode = await aeAskMode(caps);
  if (!mode) { status('AE 보내기 취소', true); return; }
  return mode === 'geolayers' ? sendToAE({ aeMode: 'geolayers' }) : sendToAE();
}
