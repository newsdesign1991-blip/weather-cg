/* [모듈] js/anim.js — 영상 애니메이션: 이징, 카메라 키프레임, 자동 트랙, 블라인드, renderAnimFrame(정확 경로·미리보기 가속), 재생/정지/탐색, 저장용 상태 */
'use strict';

// ===================== 영상 (타임라인) =====================
// 원칙: 애니메이션은 '지금 만들어 둔 CG'를 시간에 따라 드러내는 것일 뿐,
// 작업 내용(칠한 색·라벨 위치)을 바꾸지 않는다. 재생을 멈추면 renderAll()로 원상복구한다.
const anim = () => {
  const a = (S.anim ||= { dur: 6, fps: 29.97, reveal: 'dissolve', tracks: [] });
  // 영상 블라인드 등장은 폐지. 예전 프로젝트도 번짐으로 재생·추출한다.
  a.reveal = 'dissolve';
  return a;
};
// 태풍 경로 트랙 = 경로(ps 시작/pe 끝) + 라벨마다 개별 키(tr.lab[labelId]={s,e}). 카메라처럼 하위 행으로 표시.
function typhoonTrack() { return anim().tracks.find((x) => x.kind === 'typhoon'); }
// 애니 대상 라벨 = 숨김 아니고 지점(idx)에 붙은 것
function typhoonLabels() { return labelList().filter((b) => !b.off && b.idx != null); }
// 트랙 start/len 을 경로키+라벨키의 최소~최대로 동기화(기존 저장/로직 호환).
// 숨긴 라벨의 키(다시 켤 때 그대로 쓰려고 남겨 둔 것)는 길이에서 뺀다.
function syncTyphoonSpan(tr) {
  let mn = tr.ps, mx = tr.pe;
  // 라인 모드는 라벨이 안 보이므로 경로 키만으로 길이를 잡는다
  if (!typhoonLineMode()) {
    const vis = new Set(typhoonLabels().map((b) => b.id));
    for (const id in (tr.lab || {})) { const e = tr.lab[id]; if (!e || !vis.has(id)) continue; mn = Math.min(mn, e.s); mx = Math.max(mx, e.e); }
  }
  tr.start = +Math.max(0, mn).toFixed(4);
  tr.len = +Math.max(0.05, mx - tr.start).toFixed(4);
}
function ensureTyphoonKeys(tr) {
  if (!tr) return null;
  const s = +tr.start || 0, l = +tr.len || 3.2;
  if (tr.ps == null) tr.ps = +s.toFixed(2);
  if (tr.pe == null) tr.pe = +(s + Math.min(l, 2.0)).toFixed(2);   // 경로 그리기 기본 2초
  tr.lab = tr.lab || {};
  const labs = typhoonLabels();
  const pts = curTyphoonPoints();
  const { lo, hi } = typhoonAnimWindow(pts); const span = Math.max(1, hi - lo);
  const lineMode = typhoonLineMode();   // 라인 모드: 안 보이는 라벨 키는 새로 만들지 않는다(기존 키는 일반 모드 복귀용으로 보존)
  // 새 키는 프레임 경계로(AE 키프레임이 프레임 사이에 걸치지 않게 — 타임라인 끌기·입력과 같은 규칙)
  const fps = (typeof anim === 'function' && +anim().fps) || 29.97, fq = (t) => +(Math.round(t * fps + 1e-6) / fps).toFixed(4);
  for (const b of labs) {
    if (!tr.lab[b.id] && !lineMode) {   // 새로 붙은 라벨: 경로가 그 지점을 지나는 시각에 등장하도록 기본값
      const frac = span > 0 ? Math.min(1, Math.max(0, (b.idx - lo) / span)) : 0;
      const st = tr.ps + easeInOutCInv(frac) * Math.max(0.001, tr.pe - tr.ps);
      tr.lab[b.id] = { s: fq(st), e: fq(st + 0.9) };
    }
  }
  // 지운 라벨(또는 지점에서 떨어진 라벨)의 키만 정리 — 숨긴 라벨의 키는 다시 켤 때 손본 타이밍 그대로 쓰게 남긴다(B16)
  const exist = new Set(labelList().filter((b) => b.idx != null).map((b) => b.id));
  for (const id in tr.lab) if (!exist.has(id)) delete tr.lab[id];
  syncTyphoonSpan(tr);
  return tr;
}
let animT = null;      // 재생/미리보기 중인 시각(초). null 이면 평소 상태.
let tlHeadT = 0;       // 타임라인 재생헤드(CTI) 위치(초) — animT와 달리 지도 이동/정지로 null 되지 않고 유지(카메라 키 찍는 시각 기준).
let animRAF = 0;
let animPlaying = false;
let tlH = 280;         // 타임라인 높이

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// 큐빅 베지어 이징 (CSS cubic-bezier 와 동일). 속도(미분) 곡선이 '빠르게 올라 이른 피크 → 긴 감쇠 꼬리'가 되게.
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-6) break; const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    return sy(clamp01(t));
  };
}
// 앱 공통 이징 — 첨부 커브(빠른 가속 → 이른 피크 → 긴 정착). 모든 애니메이션(색칠·라벨·블라인드·카드)이 이걸 쓴다.
const EASE_BEZIER = [0.34, 0, 0.15, 1];
const easeOut = cubicBezier(...EASE_BEZIER);
// 노말 VF 진입 전용 — 부드러운 가속·감속(ease-in-out)으로 천천히 미끄러져 들어온다.
// (AE 보내기가 같은 곡선을 AE 키 영향값으로 옮기려고 상수로 꺼내 둔다 — js/ae-export.js aeEaseOf)
const EASE_VF = [0.4, 0, 0.2, 1];
const easeVf = cubicBezier(...EASE_VF);
// 카메라 키프레임 텐션 — 앱 공통 커브(빠른 가속 → 이른 피크 → 긴 정착, 사용자 지정). 예전 대칭 벨에서 변경.
const easeCam = cubicBezier(...EASE_BEZIER);
// 뽕 튀어나오는 느낌 — 1을 살짝 넘었다 돌아온다
const easePop = (p) => {
  const c = 1.70158 + 1;
  return 1 + c * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
};

const hex2rgb = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const rgb2hex = (a) => '#' + a.map((v) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const mixHex = (a, b, p) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * p));

const trackProg = (tr, t) => clamp01((t - tr.start) / Math.max(tr.len, 0.001));

// ===== 카메라(위치·확대 키프레임) — 재생/추출 때 S.map을 보간해 지도+태풍만 움직인다(제목·범례·가이드 고정) =====
const camKeys = () => ((anim().cam ||= { keys: [] }).keys);
// 재생·추출 가능 여부(공통) — 트랙이 있거나, 카메라 키만 있거나, 태풍(경로 애니 내재)이면 된다.
const hasAnim = () => !!(anim().tracks.length || camKeys().length || isTyphoon());
let _camSavedMap = null;      // 재생/추출 들어가기 전 '작업 뷰'(S.map + 틸트) 백업
// 카메라 3D 회전은 S.map3d의 rx/ry/rz(도)에 담는다. 지도만 기울인다(미리보기 CSS, 추출 메시 워프).
const CAM3D_DEFAULT = () => ({ on: 0, rx: 0, ry: 0, rz: 0, persp: 2.2 });
function camRot() { const m = S.map3d || {}; return { rx: +m.rx || 0, ry: +m.ry || 0, rz: +m.rz || 0 }; }
function setCamRot(rx, ry, rz) {
  const m = (S.map3d ||= CAM3D_DEFAULT());
  m.rx = Math.max(-85, Math.min(85, +rx || 0));       // 기울임(tilt)
  m.ry = Math.max(-85, Math.min(85, +ry || 0));       // (구글지도식에선 미사용)
  m.rz = Math.max(-180, Math.min(180, +rz || 0));     // 방위(bearing) — 한 바퀴
  m.persp = m.persp || 2.2;
  m.on = (Math.abs(m.rx) > 0.05 || Math.abs(m.ry) > 0.05 || Math.abs(m.rz) > 0.05) ? 1 : 0;
}
function camAt(t) {
  const ks = camKeys().slice().sort((a, b) => a.t - b.t);
  if (!ks.length) return null;
  const pick = (k) => ({ x: k.x, y: k.y, s: k.s, rx: +k.rx || 0, ry: +k.ry || 0, rz: +k.rz || 0 });
  if (t <= ks[0].t) return pick(ks[0]);
  if (t >= ks[ks.length - 1].t) return pick(ks[ks.length - 1]);
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = (t - a.t) / Math.max(1e-6, b.t - a.t), e = easeCam(p);   // 대칭 벨 텐션(50/50)
      const L = (u, v) => (+u || 0) + ((+v || 0) - (+u || 0)) * e;
      return { x: L(a.x, b.x), y: L(a.y, b.y), s: L(a.s, b.s), rx: L(a.rx, b.rx), ry: L(a.ry, b.ry), rz: L(a.rz, b.rz) };
    }
  }
  return pick(ks[ks.length - 1]);
}
function applyCam(t, noTilt) {
  const c = camAt(t);
  if (!c) return;
  if (!_camSavedMap) _camSavedMap = { x: S.map.x, y: S.map.y, s: S.map.s, m3: S.map3d ? JSON.parse(JSON.stringify(S.map3d)) : null };
  S.map.x = c.x; S.map.y = c.y; S.map.s = c.s;
  setCamRot(c.rx, c.ry, c.rz);
  renderMapTransform();
  if (!noTilt) applyTilt();   // renderAnimFrame은 내용을 다 그린 뒤 직접 부른다
}
function restoreCamMap() {
  if (_camSavedMap) {
    S.map.x = _camSavedMap.x; S.map.y = _camSavedMap.y; S.map.s = _camSavedMap.s;
    S.map3d = _camSavedMap.m3 || CAM3D_DEFAULT();
    _camSavedMap = null; renderMapTransform(); applyTilt();
  }
}
// 저장·되돌리기 스냅샷용 상태 — 카메라 미리보기 중엔 S.map/S.map3d가 '카메라 보간 뷰'로 덮여 있으므로
// 작업 뷰(_camSavedMap)로 바꾼 사본을 준다(B5: 자동 저장·프로젝트 저장·되돌리기 기록이 카메라 뷰를 작업 위치로 굳히지 않게).
function stateForSave() {
  if (!_camSavedMap) return S;
  const o = Object.assign({}, S);
  o.map = Object.assign({}, S.map, { x: _camSavedMap.x, y: _camSavedMap.y, s: _camSavedMap.s });
  o.map3d = _camSavedMap.m3 ? JSON.parse(JSON.stringify(_camSavedMap.m3)) : CAM3D_DEFAULT();
  return o;
}
// S를 통째로 갈아끼웠다(되돌리기·다시 실행) — 새 S.map은 이미 작업 뷰이므로 카메라 백업은 버린다(옛 뷰가 덮이지 않게).
function animStateReplaced() { _camSavedMap = null; animFastOff(); }

// 트랙 이름·색 — (옛 호환용 이름) 타임라인은 tlLayerPlan의 이름을 쓴다
function trackInfo(tr) {
  if (tr.kind === 'typhoon') return { name: '태풍 경로', col: (S.typhoon && S.typhoon.iconCol) || '#E5231E' };
  if (tr.kind === 'typcmp') { const c = ((S.typhoon && S.typhoon.compare) || []).find((x) => x.id === tr.key); return { name: c ? ('비교 · ' + (c.name || '')) : '(지운 비교)', col: c ? c.color : '#888' }; }
  if (tr.kind === 'fill') return { name: tr.key, col: tr.key };
  if (tr.kind === 'brush') return { name: '브러쉬', col: tr.key };
  if (tr.kind === 'label') { const b = S.labels.find((x) => x.id === tr.key); return { name: b ? (b.txt || '(빈 라벨)') : '(지운 라벨)', col: b ? b.fill : '#888' }; }
  if (tr.kind === 'text') { const x = S.texts.find((v) => v.id === tr.key); return { name: x ? (x.txt || '(빈 텍스트)') : '(지운 텍스트)', col: x ? x.col : '#888' }; }
  const m = (S.mtns || []).find((v) => v.id === tr.key);
  return { name: m ? (m.txt || '산 표시') : '(지운 산)', col: m ? m.col : '#888' };
}

// 지금 화면을 보고 트랙을 만든다.
//  - 처음 1초는 베이스 상태로 홀드한 뒤 시작한다 (START).
//  - 색칠과 수치 라벨은 '동시에' 시작한다. 라벨은 1초 동안 밑에서 올라오며 나타난다.
//  - 제목 텍스트는 애니메이션 안 한다 (계속 떠 있음) — 트랙을 안 만든다.
const ANIM_START = 1.0;      // 시작 전 홀드(기본)
const ANIM_VF_ENTER_LEN = 1.2;   // 노말 VF 전체가 오른쪽→왼쪽 슬라이드+페이드인 되는 시간(더 천천히 부드럽게)
const VF_ENTER_FRAMES = 10;      // VF 진입이 시작된 뒤 색칠이 시작되기까지의 프레임 수
// 터치는 0초부터. 노말 VF는 1초 홀드 뒤 진입 시작 → 그 10프레임 뒤 색칠. 노말 CG·날씨 팀은 1초 홀드.
const animStart = () => (S.res === '2158x1214' ? 0 : S.res === '1920x1080-vf' ? ANIM_START + VF_ENTER_FRAMES / (anim().fps || 29.97) : ANIM_START);
const ANIM_FILL_LEN = 0.8;
const ANIM_LABEL_LEN = 1.0;  // 라벨 올라오는 시간
const ANIM_MTN_LEN = 0.6;
// 색 밝기 (높을수록 밝음) — 밝은 색부터 애니메이션한다
const lumOf = (h) => { const [r, g, b] = hex2rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
// 자동 구성 계획(부작용 없음) — 지금 화면이면 어떤 트랙이 생기는지. autoTracks(타임라인 버튼)와 AE 보내기(트랙이 아예 없을 때의 기본 타이밍)가 같이 쓴다.
// 반환 { tracks, dur, msg } (tracks가 비면 만들 것이 없음). id는 새로 받는다.
function autoTrackPlan() {
  const A = anim();
  // 시작·끝은 프레임 경계로(소수 4자리) — AE 키프레임이 프레임 위에 앉고, I/O·J/K·[ ]가 막대 끝과 정확히 맞는다(29.97fps에서 1초 = 0;00;01;00 = 1.001초)
  const fps = +A.fps || 29.97, fq = (t) => +(Math.round(t * fps + 1e-6) / fps).toFixed(4);
  const fl = (a, len) => +(fq(a + len) - fq(a)).toFixed(4);   // 끝을 프레임에 맞춘 길이
  if (isTyphoon()) {
    // 태풍은 칠/라벨 트랙 대신 '경로 애니메이션' 트랙 하나. 길이 = 홀드 + 경로2초 + 라벨1.2초 + 꼬리1초.
    const hold = animStart(), PATHs = 2.0, LABELs = typhoonLineMode() ? 0 : 1.2, tail = 1.0;   // 라인 모드는 경로 시각 라벨이 없다
    const tracks = [{ id: 'k' + seq++, kind: 'typhoon', key: 'typhoon', start: fq(hold), len: fl(hold, PATHs + LABELs), ps: fq(hold), pe: fq(hold + PATHs) }];   // 라벨별 키(lab)는 ensureTyphoonKeys가 채움
    for (const c of ((S.typhoon && S.typhoon.compare) || [])) tracks.push({ id: 'k' + seq++, kind: 'typcmp', key: c.id, start: fq(hold), len: fl(hold, PATHs) });   // 비교 예보마다 타임라인 트랙(끌어서 타이밍 조정)
    return { tracks, dur: Math.max(4, Math.ceil((hold + PATHs + LABELs + tail) * 2) / 2), msg: '태풍 경로 애니메이션 트랙 구성됨' };
  }
  const F = fills();
  const seen = {};
  for (const c of Object.values(F)) seen[c.toUpperCase()] = true;
  if (S.style === 'warnsea') for (const c of Object.values(S.seaFills || {})) seen[c.toUpperCase()] = true;
  if (typeof wrnOverlapPlan === 'function') for (const cols of Object.values(wrnOverlapPlan())) for (const c of cols) seen[c] = true;
  // 밝은 색 -> 어두운 색 순서
  const cols = Object.keys(seen).sort((a, b) => lumOf(b) - lumOf(a));

  const tracks = [];
  const push = (kind, key, start, len) => tracks.push({ id: 'k' + seq++, kind, key, start: fq(start), len: fl(start, len) });

  // 각 색은 앞 색보다 5프레임 뒤에 시작 (5 / fps 초)
  const step = 5 / (A.fps || 29.97);
  const start0 = animStart();   // 터치 스크린이면 0, 아니면 1초 홀드
  const startOf = {};
  cols.forEach((c, i) => { const st = start0 + i * step; startOf[c] = st; push('fill', c, st, ANIM_FILL_LEN); });
  // 브러쉬 덧칠도 색별 트랙으로 — 그 색 칠(fill)보다 조금 먼저 들어온다('브러쉬 먼저, 칠 다음').
  // 그 색 칠이 없으면(브러쉬만) 밝은→어두운 순으로 이어서 배치.
  const brushCols = [];
  for (const s of brushStrokes()) if (!s.erase && !brushCols.some((x) => x.toUpperCase() === s.col.toUpperCase())) brushCols.push(s.col);
  brushCols.sort((a, b) => lumOf(b) - lumOf(a));
  brushCols.forEach((c, i) => {
    const key = c.toUpperCase();
    const bs = startOf[key] != null ? Math.max(start0, startOf[key] - ANIM_FILL_LEN) : (start0 + (cols.length + i) * step);
    push('brush', key, bs, ANIM_FILL_LEN);
    if (startOf[key] == null) startOf[key] = bs + ANIM_FILL_LEN;   // 브러쉬만인 색도 라벨이 그 색 등장에 맞춰지게(존 색칠 없을 때 라벨이 0초로 튀던 것 방지)
  });
  // 라벨은 자기 지역 색과 같은 타이밍에 (그 색의 시작 시각). 색을 못 찾으면 첫 시작.
  const startForFill = (col) => (col && startOf[col.toUpperCase()] != null ? startOf[col.toUpperCase()] : start0);
  for (const b of S.labels) if (!b.off) push('label', b.id, startForFill(b.fill), ANIM_LABEL_LEN);
  // 산 색칠도 지도 칠처럼 애니메이션 — 그 산 색과 같은 타이밍에 번지듯/드러나듯 나온다
  for (const m of (S.mtns || [])) if (!m.off) push('mtn', m.id, startForFill(m.col), ANIM_FILL_LEN);
  // 제목 텍스트: 트랙 없음 -> 애니메이션 없이 계속 보인다. 경계선도 처음부터 그대로.
  if (!tracks.length) return { tracks, dur: A.dur, msg: '' };
  const end = Math.max(...tracks.map((x) => x.start + x.len));
  return { tracks, dur: Math.max(6, Math.ceil((end + 0.6) * 2) / 2), msg: `${tracks.length}개 트랙 만듦 (밝은색→어두운색, 5프레임 간격) — 막대를 끌어 조정하세요` };   // 기본 길이 6초, 넘치면 늘린다
}
// 손본 트랙 수 — 자동 구성 결과와 시작·길이(경로·라벨 키)가 다른 트랙(같은 대상끼리 비교)
function animTouchedCount(plan) {
  const A = anim(); let n = 0;
  // 반 프레임 남짓까지는 같은 값(옛 자동 구성은 소수 2자리, 지금은 프레임 경계 — 손본 값은 늘 1프레임 이상 다르다)
  const tol = 0.6 / (+A.fps || 29.97), same = (a, b) => Math.abs((+a || 0) - (+b || 0)) < tol;
  for (const tr of A.tracks) {
    const d = plan.tracks.find((x) => x.kind === tr.kind && String(x.key) === String(tr.key));
    if (!d) { n++; continue; }
    if (tr.kind === 'typhoon') {
      if (!same(tr.ps, d.ps) || !same(tr.pe, d.pe)) { n++; continue; }
      const tmp = JSON.parse(JSON.stringify(d)); ensureTyphoonKeys(tmp);
      if (Object.keys(tr.lab || {}).some((id) => tmp.lab[id] && (!same(tr.lab[id].s, tmp.lab[id].s) || !same(tr.lab[id].e, tmp.lab[id].e)))) n++;
    } else if (!same(tr.start, d.start) || !same(tr.len, d.len)) n++;
  }
  return n;
}
// 계획을 적용한다 — mode 'all'=모두 다시 구성, 'add'=있는 트랙은 그대로 두고 트랙이 없는 대상만 기본 타이밍으로 더한다
function applyAutoTrackPlan(plan, mode) {
  const A = anim();
  pushUndo();
  if (mode === 'add') {
    let added = 0;
    for (const d of plan.tracks) if (!A.tracks.some((x) => x.kind === d.kind && String(x.key).toUpperCase() === String(d.key).toUpperCase())) { A.tracks.push(d); added++; }
    const end = Math.max(A.dur, ...A.tracks.map((x) => (+x.start || 0) + (+x.len || 0)));
    if (end > A.dur) A.dur = Math.ceil((end + 0.4) * 2) / 2;
    buildTimeline(); animSeek(tlHeadT);
    status(added ? `새 항목 ${added}개에 기본 타이밍을 더했습니다 — 손본 타이밍은 그대로` : '새로 더할 항목이 없습니다 — 모두 타이밍이 있어요');
    return;
  }
  A.tracks = plan.tracks;
  A.dur = plan.dur;
  buildTimeline();
  animSeek(0);
  status(plan.msg + (isTyphoon() ? ' · ' + A.dur + '초' : ''));
}
function autoTracks() {
  const plan = autoTrackPlan();
  if (!plan.tracks.length) { status(wrnNoneLeftMapEmpty() ? wrnNoneEmptyText('애니메이션을 만드세요') : '칠한 색도 라벨도 없습니다 — 먼저 CG를 만드세요', true); return; }
  const touched = anim().tracks.length ? animTouchedCount(plan) : 0;
  if (!touched) { applyAutoTrackPlan(plan, 'all'); return; }
  // 손본 타이밍이 있으면 덮어쓰기 전에 묻는다(B13) — 토스 카드
  const m = tossModal({
    title: '자동 구성을 다시 할까요?', sub: `손본 타이밍 ${touched}개가 있어요`,
    bodyHTML: '<p style="margin:0;font-size:13px;line-height:1.6;color:var(--on-surface-var)"><b style="color:var(--on-surface)">새 항목만 추가</b>는 손본 타이밍을 그대로 두고, 타이밍이 없는 칠·라벨·산에만 기본 타이밍을 넣습니다.<br><b style="color:var(--on-surface)">모두 다시 구성</b>은 지금 화면 기준으로 전부 새로 만듭니다(되돌리기 Ctrl+Z).</p>',
    footHTML: '<button class="tossBtn ghost" data-act="cancel">취소</button><button class="tossBtn ghost" data-act="all">모두 다시 구성</button><button class="tossBtn pri" data-act="add">새 항목만 추가</button>',
  });
  m.foot.querySelectorAll('button').forEach((b) => { b.onclick = () => { const act = b.dataset.act; m.close(); if (act !== 'cancel') applyAutoTrackPlan(autoTrackPlan(), act); }; });
}

// 지금 지도 색칠과 하나도 안 맞는(=이전 지도에서 만든) 타임라인 트랙은 열 때 비운다.
// 새 작업에서 옛 트랙이 남아 헷갈리지 않게. 불러오기·이어보기는 색이 그대로라 겹쳐서 유지된다.
function dropStaleTracks() {
  const A = anim();
  const fillTr = A.tracks.filter((t) => t.kind === 'fill');
  if (!fillTr.length) return;                                       // 색 트랙이 없으면 판단 보류
  const cur = new Set(Object.values(fills()).map((c) => (c || '').toUpperCase()));
  if (fillTr.some((t) => cur.has((t.key || '').toUpperCase()))) return;  // 하나라도 지금 지도에 있으면 유효
  A.tracks = [];
  if (A.dur > 6) A.dur = 6;
  status('이전 화면의 타임라인 트랙을 비웠습니다 — “지금 화면으로 자동 구성”으로 새로 만드세요');
}

// ---- 블라인드(Venetian Blinds) 효과 ----
// 베이스색 지도를 밑에 깔고, 목표색 지도(L_map)를 슬랫이 열리듯 드러낸다.
// 슬랫 크기(pitch)와 각도(회전)를 조절할 수 있다. 회전해도 화면을 다 덮게 큰 정사각 범위에 슬랫을 깐다.
let blindOn = false;
const blindPitch = () => Math.max(8, anim().blindSize || 60);
const blindAngle = () => (+anim().blindAngle || 0);
function ensureBlind() {
  if (document.getElementById('L_mapBase')) return;
  // 밑에 깔 베이스색 지도 (L_map 복제, id는 전부 떼서 중복 안 나게)
  const base = document.getElementById('L_map').cloneNode(true);
  base.querySelector('#mapT')?.setAttribute('data-blindmapt', '1');   // 카메라 이동 때 renderMapTransform이 같이 옮길 표시(id는 아래서 지워짐)
  base.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  base.id = 'L_mapBase';
  base.removeAttribute('filter');
  base.querySelectorAll('image, foreignObject').forEach((n) => n.remove());   // 브러쉬 이미지(·라이브 캔버스)는 베이스에서 뺀다 (안 그러면 브러쉬가 겹쳐 이상해짐)
  // 경계선(구역선·시도선)은 베이스에도 그대로 둔다 — 애니메이션 처음부터 경계선이 보이게. 색칠만 슬랫으로 드러난다.
  base.querySelectorAll('.zone').forEach((z) => { z.setAttribute('fill', S.base); });
  base.querySelectorAll('[data-role="seoulPaintTop"]').forEach((g) => { g.textContent = ''; });   // 서울: 칠한 색 오버레이도 베이스엔 없어야(슬랫 열리기 전 색이 보임)
  document.getElementById('L_map').before(base);
}
// 클립 하나를 진행도 gp 만큼 열린 슬랫으로 채운다 (여러 색이 각자 이걸 쓴다)
function ensureClip(id) {
  let c = document.getElementById(id);
  if (!c) { c = el('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }); svg.querySelector('defs').append(c); }
  return c;
}
function paintBlindClip(clip, gp) {
  const pitch = blindPitch(), angle = blindAngle();
  const cx = 960, cy = 540, R = 1300;           // 대각선(≈1101)보다 큰 반경 — 어떤 각도로 돌려도 화면을 덮는다
  const y0 = cy - R, x0 = cx - R, w = R * 2;
  const need = Math.ceil((R * 2) / pitch);
  let rects = clip.querySelectorAll('rect');
  if (rects.length !== need) { clip.textContent = ''; for (let i = 0; i < need; i++) clip.append(el('rect', {})); rects = clip.querySelectorAll('rect'); }
  const raw = clamp01(gp) * pitch;
  const ov = raw > 0 ? 0.75 : 0;                // 슬랫 사이 헤어라인 이음새를 살짝 겹쳐 없앤다 (닫힘 상태엔 안 겹침)
  const openH = raw + ov;
  const rot = angle ? `rotate(${angle} ${cx} ${cy})` : null;
  rects.forEach((r, i) => {
    const by = y0 + i * pitch;
    r.setAttribute('x', x0); r.setAttribute('width', w);
    r.setAttribute('y', by + (pitch - openH) / 2); r.setAttribute('height', openH);
    if (rot) r.setAttribute('transform', rot); else r.removeAttribute('transform');
  });
}
function teardownBlind() {
  if (!blindOn) return;
  blindOn = false;
  document.getElementById('L_mapBase')?.remove();
  for (let k = 0; ; k++) { const c = document.getElementById('bclip' + k); if (!c) break; c.remove(); }
  document.getElementById('bclipHide')?.remove();
  document.getElementById('L_map')?.removeAttribute('clip-path');
  // 존·산에 걸었던 블라인드 클립을 전부 해제
  for (const [, arr] of zoneEls) for (const { el: e } of arr) e.removeAttribute('clip-path');
  for (const g of document.querySelectorAll('#L_mtn > g')) g.removeAttribute('clip-path');
}

// ===== 미리보기 가속(재생·스크럽·끌기 중에만) =====
// 정확한 경로는 존 수백 개의 fill을 매 프레임 바꿔 SVG 전체를 다시 래스터하고(평균 22ms), 카메라 키는 속성 transform이라
// 지도 전체를 매 프레임 다시 그린다(39~69ms). 움직이는 동안만 ① 바탕(베이스색) 위에 '색마다 겹친 그룹'의 opacity만 바꾸고
// (AE에서 색 레이어 opacity를 올리는 것과 같은 합성 — mixHex 선형 보간 = 알파 합성) ② 카메라는 지도 묶음의 CSS transform으로
// GPU 합성만 한다. 멈추면 tlSettle이 정확한 경로로 그 프레임을 한 번 다시 그린다. 추출(_exportingFrames)은 늘 정확한 경로.
let _animFast = null;
const camKeysRotate = () => camKeys().some((k) => Math.abs(+k.rx || 0) > 0.05 || Math.abs(+k.ry || 0) > 0.05 || Math.abs(+k.rz || 0) > 0.05);
function animFastOn() {
  if (_animFast || _exportingFrames) return;
  const A = anim(), F = fills();
  const blinds = (A.reveal || 'dissolve') === 'blinds';
  const fast = { groups: [], softKids: [], cam: null, blinds, masks: new Map(), tilt: false };
  // ① 칠: 서울 아님(한강 위 오버레이가 섞이는 식이 달라 정확 경로 유지)·태풍 아님. 번짐 = 그룹 opacity, 블라인드 = 그룹 마스크(슬랫 무늬 rect 하나)
  if (!isTyphoon() && !isSeoul() && !(typeof wrnOverlapPlan === 'function' && Object.keys(wrnOverlapPlan()).length)) {
    const trk = new Set(A.tracks.filter((x) => x.kind === 'fill').map((x) => String(x.key).toUpperCase()));
    const gm = $('#gMain');
    if (trk.size && gm) {
      if (blinds) teardownBlind();   // 정확 경로의 베이스 복제(L_mapBase)·슬랫 클립(rect 수백 개) 걷기 — 가속은 바탕 조각 + 색 그룹 마스크
      const byHost = new Map();   // 부모(본토 #gMain / 인셋 그룹) → { key → <g> }
      const groupFor = (host, key) => {
        let m = byHost.get(host); if (!m) { m = new Map(); byHost.set(host, m); }
        let g = m.get(key);
        if (!g) {
          g = el('g', { 'data-animfast': key, opacity: blinds ? '1' : '0', 'pointer-events': 'none' });
          g.style.willChange = 'opacity';
          if (host === gm) gm.append(g);   // 본토: #gMain 맨 끝(부드러운 경계 #gMainSoft 위)
          else { const zs = host.querySelectorAll(':scope > .zone'); const last = zs[zs.length - 1]; if (last) last.after(g); else host.prepend(g); }   // 인셋: 마지막 조각 바로 뒤(경계선 아래)
          m.set(key, g); fast.groups.push({ g, key });
        }
        return g;
      };
      for (const [id, arr] of zoneEls) {
        const col = F[id]; if (!col) continue;
        const key = col.toUpperCase(); if (!trk.has(key)) continue;
        for (const { el: e } of arr) {
          const host = e.parentNode; if (!host) continue;
          const cl = e.cloneNode(false);
          cl.setAttribute('class', 'zoneAF'); cl.removeAttribute('data-id'); cl.setAttribute('fill', col);
          cl.setAttribute('stroke', 'none');   // 칠만(테두리는 바로 뒤 복제가 원래 순서대로). 경계를 넓혀 틈을 덮는 방법은 경계가 0.5px 밀려 더 달라져 안 씀(측정)
          const g = groupFor(host, key); g.append(cl);
          // 그 조각의 원래 테두리(구역선 색·투명도)는 칠 위에 그대로 — 정확한 그림처럼 '칠 → 그 조각 테두리' 순서
          const sk = e.getAttribute('stroke');
          if (sk && sk !== 'none') { const so = e.cloneNode(false); so.setAttribute('class', 'zoneAF'); so.removeAttribute('data-id'); so.setAttribute('fill', 'none'); g.append(so); }
          e.setAttribute('fill', S.base);   // 바탕 = 베이스색(진행도 0과 같은 그림)
        }
      }
      // 부드러운 경계(#gMainSoft): 그 색 조각은 바탕(베이스)으로 두고, 같은 필터·클립을 건 복제를 색 그룹 안에 겹친다
      const soft = $('#gMainSoft');
      if (soft) for (const p of soft.children) {
        const col = F[p.dataset.id]; if (!col) continue; const key = col.toUpperCase(); if (!trk.has(key)) continue;
        const g = groupFor(gm, key);
        let sg = g.querySelector(':scope > g[data-soft]');
        if (!sg) { sg = el('g', { 'data-soft': '1', filter: soft.getAttribute('filter') || '' }); const cp = soft.getAttribute('clip-path'); if (cp) sg.setAttribute('clip-path', cp); g.append(sg); }
        const cl = p.cloneNode(false); cl.removeAttribute('data-id'); cl.removeAttribute('clip-path'); cl.setAttribute('fill', col); sg.append(cl);
        p.setAttribute('fill', S.base); p.removeAttribute('clip-path'); fast.softKids.push(p);
      }
    }
  }
  // ② 카메라: 회전·기울기가 없는 키일 때만(틸트는 래스터 캔버스라 정확 경로) — 지도 묶음을 GPU 변환으로
  if (camKeys().length && !camKeysRotate() && !camActive3d()) {
    if (_camSavedMap) { S.map.x = _camSavedMap.x; S.map.y = _camSavedMap.y; S.map.s = _camSavedMap.s; S.map3d = _camSavedMap.m3 || CAM3D_DEFAULT(); _camSavedMap = null; }   // S.map은 작업 뷰로(화면은 CSS가 덮는다)
    const nodes = ['#mapT', '#bgMapT', '#seaT'].map((q) => document.querySelector(q)).concat([document.querySelector('#L_mapBase [data-blindmapt]')]).filter(Boolean);
    fast.camStyle = nodes.map((n) => n.getAttribute('style'));   // 끝나면 원래 style 속성 그대로 되돌린다(직렬화까지 같게)
    for (const n of nodes) n.style.willChange = 'transform';
    fast.cam = nodes;
  }
  // ③ 틸트(기울기·방향 키 또는 지금 기울어 있음): 정확 경로로 그리되, 지도 그림은 내용이 바뀐 프레임에서만(animMapKey) 300ms에 한 번
  //   다시 굽고, 회전만 바뀐 프레임은 GPU 그리기·보정만(view-camera.js applyTilt·tiltWant)
  fast.tilt = !!((camKeys().length && camKeysRotate()) || camActive3d());
  _animFast = (fast.groups.length || fast.cam || fast.tilt) ? fast : null;
}
// 블라인드 가속 — 색마다 마스크 하나: 슬랫 무늬(pattern) 안 rect 하나의 y·height만 매 프레임 바꾼다(정확 경로는 색마다 rect 수백 개를 다시 씀).
// 무늬·영역은 정확 경로 paintBlindClip과 같은 자리(중심 960·540, 반경 1300, 슬랫 간격·각도). 마스크 이름 반환.
function animFastMask(key, gp) {
  const F = _animFast; let m = F.masks.get(key);
  const pitch = blindPitch(), angle = blindAngle(), cx = 960, cy = 540, R = 1300;
  if (!m) {
    const i = F.masks.size, id = 'bmF' + i, defs = svg.querySelector('defs');
    const pat = el('pattern', { id: 'bpF' + i, patternUnits: 'userSpaceOnUse', x: cx - R, y: cy - R, width: R * 2, height: pitch });
    const r = el('rect', { x: 0, y: 0, width: R * 2, height: 0, fill: '#fff' }); pat.append(r);
    const mk = el('mask', { id, maskUnits: 'userSpaceOnUse', maskContentUnits: 'userSpaceOnUse', x: -4000, y: -4000, width: 10000, height: 10000 });
    const area = el('rect', { x: cx - R, y: cy - R, width: R * 2, height: R * 2, fill: `url(#bpF${i})` });
    if (angle) area.setAttribute('transform', `rotate(${angle} ${cx} ${cy})`);
    mk.append(area); defs.append(pat, mk);
    m = { id, r, pat, mk, h: -1 }; F.masks.set(key, m);
  }
  const raw = clamp01(gp) * pitch, openH = raw + (raw > 0 ? 0.75 : 0);
  if (Math.abs(openH - m.h) > 1e-3) { m.h = openH; m.r.setAttribute('y', (pitch - openH) / 2); m.r.setAttribute('height', openH); }
  return m.id;
}
const setAttrIf = (n, k, v) => { if (v == null) { if (n.hasAttribute(k)) n.removeAttribute(k); } else if (n.getAttribute(k) !== v) n.setAttribute(k, v); };
function animFastOff() {
  const f = _animFast; if (!f) return;
  _animFast = null;
  for (const { g } of f.groups) g.remove();
  for (const m of f.masks.values()) { m.pat.remove(); m.mk.remove(); }
  if (f.blinds) for (const g of document.querySelectorAll('#L_mtn > g[mask]')) { g.removeAttribute('mask'); g.removeAttribute('opacity'); }
  if (f.cam) f.cam.forEach((n, i) => { const v = f.camStyle[i]; if (v == null) n.removeAttribute('style'); else n.setAttribute('style', v); });
  // 바탕으로 바꿔 둔 존·부드러운 경계 조각은 곧 이어지는 정확한 프레임(또는 renderAll)이 다시 칠한다
}
// 가속 카메라 — CSS로 지도 묶음만 옮기고, S.map은 이 프레임 동안만 카메라 값으로 빌려 태풍·지도 고정 산을 그린다(끝나면 작업 뷰로 되돌림)
function animFastCam(t, draw) {
  const c = camAt(t);
  if (!c) { draw(); return; }
  const tr = `translate(${c.x}px, ${c.y}px) scale(${c.s})`;
  for (const n of _animFast.cam) n.style.transform = tr;
  const m0 = { x: S.map.x, y: S.map.y, s: S.map.s };
  S.map.x = c.x; S.map.y = c.y; S.map.s = c.s; _tyLiteDraw = true;
  try { if (S.mtns && S.mtns.some((m) => m.anchor)) renderMtns(); draw(); }
  finally { S.map.x = m0.x; S.map.y = m0.y; S.map.s = m0.s; _tyLiteDraw = false; }
}

// 재생·스크럽(가속) 중 '틸트 지도 그림'(CAM_MAP_LAYERS)을 바꾸는 값만 모은 열쇠 — 앞 프레임과 같으면 그 프레임은 다시 굽지 않는다
// (회전만 바뀐 프레임). 칠·브러쉬·산 진행도(드러내기 방식 포함), 태풍 경로·비교선 진행도·선두 아이콘, 노말 VF 진입(래퍼가 지도까지 감싼다).
// 카메라 위치·배율(S.map)은 view-camera.js tiltWant가 따로 본다. 라벨·제목·범례는 평면 오버레이라 안 넣는다.
// 빠진 값이 있어도 멈추면 정확 경로(tlSettle)가 그 프레임을 다시 굽는다.
let _animMapKeyLast = null;
function animMapKey(t) {
  const A = anim();
  const k = [A.reveal || 'dissolve', A.blindSize, A.blindAngle, S.base];
  if (S.res === '1920x1080-vf') k.push('v' + easeVf(clamp01((t - ANIM_START) / ANIM_VF_ENTER_LEN)).toFixed(3));
  if (isTyphoon()) {
    k.push('p' + (typhoonProg == null ? '-' : (+typhoonProg).toFixed(4)), 'h' + (+typhoonHeadFade).toFixed(3));
    if (typhoonCmpProg) for (const id in typhoonCmpProg) k.push(id + ':' + (typhoonCmpProg[id] == null ? '-' : (+typhoonCmpProg[id]).toFixed(4)));
    return k.join(',');
  }
  for (const tr of A.tracks) if (tr.kind === 'fill' || tr.kind === 'brush' || tr.kind === 'mtn') k.push(tr.kind + ':' + tr.key + ':' + trackProg(tr, t).toFixed(4));
  // 트랙 없는 브러쉬 색(옛 데이터)은 '첫 칠 전 페이드인' — renderAnimFrameBody와 같은 식
  const bt = new Set(A.tracks.filter((x) => x.kind === 'brush').map((x) => String(x.key || '').toUpperCase()));
  if ([...document.querySelectorAll('image.brushLayer[data-col]')].some((im) => !bt.has((im.getAttribute('data-col') || '').toUpperCase()))) {
    const bft = A.tracks.filter((x) => x.kind === 'fill'), ff = bft.length ? Math.min(...bft.map((x) => x.start)) : ANIM_FILL_LEN;
    k.push('b' + clamp01(t / Math.max(ff, ANIM_FILL_LEN)).toFixed(3));
  }
  return k.join(',');
}
// t초 시점의 화면. 재생·미리보기·영상 추출이 모두 이걸 쓴다.
function renderAnimFrame(t) {
  if (_animFast && _exportingFrames) animFastOff();   // 추출은 늘 정확한 경로
  const lite = !!_animFast;
  if (lite) brushFinalize();   // 남은 새 획 이미지는 그리기 전에 — 그건 진짜 내용 변경이라 리비전을 그대로 올린다
  const rev0 = _mapContentRev;
  if (_animFast && _animFast.cam) animFastCam(t, () => renderAnimFrameBody(t));
  else renderAnimFrameBody(t);
  // 틸트 미리보기는 이번 프레임 내용(animT·칠·태풍)까지 다 그린 뒤 한 번 굽는다(먼저 구우면 한 단계 옛 그림).
  // 정확 경로(멈춘 프레임·추출)는 늘 다시 굽고, 가속(재생·스크럽) 중엔 그리기가 올린 리비전을 되돌린 뒤 지도 그림이 실제로 바뀐 때만 진행 리비전을 올린다.
  const key = animMapKey(t);
  if (lite) { _mapContentRev = rev0; if (key !== _animMapKeyLast) _mapAnimRev++; }
  else _mapContentRev++;
  _animMapKeyLast = key;
  if (camActive3d() || fit.classList.contains('mapTilt')) applyTilt();
  else if (!lite && !_exportingFrames && camKeys().length) tiltPrewarmSoon(700);   // 평면에서 멈췄고 기울일 키가 있으면 진입 그림을 미리 — 잠깐 멈췄다 다시 끄는 사이엔 안 굽게 0.7초 뒤(그때 또 만지는 중이면 건너뜀)
}
function renderAnimFrameBody(t) {
  if (!(_animFast && _animFast.cam)) applyCam(t, true);   // 카메라 키프레임이 있으면 S.map을 보간 적용(지도+태풍만 이동, 제목·범례 고정)
  // 태풍 지도: 경로가 스으윽 이동(2초) → 각 지점 등장 시 라벨이 개별 생성. 프레임(t)마다 결정적으로 계산.
  if (isTyphoon()) {
    animT = t;
    // 태풍 트랙: 경로는 [ps,pe], 라벨은 각자 자기 키 [s,e]로 등장(타임라인 하위 행에서 개별 조정).
    const _tt = anim().tracks.find((x) => x.kind === 'typhoon');
    ensureTyphoonKeys(_tt);
    const pts = curTyphoonPoints();
    const N = Math.max(2, pts.length);
    const { lo, hi } = typhoonAnimWindow(pts); const span = typhoonAnimSpan(lo, hi);   // '표시 날짜 범위' 구간만(라인 모드는 현재 위치까지 — playTyphoon과 동일)
    // 트랙 없으면 정적 전체 표시. 비교 지도는 비교 예보 트랙만 있어도 그 막대대로 움직인다(메인 경로 트랙이 없으면 경로는 다 그린 상태 — 막대 = 화면 = AE)
    const cmpOnly = !_tt && isTyphoonCompare() && anim().tracks.some((x) => x.kind === 'typcmp');
    if (!_tt && !cmpOnly) { typhoonProg = null; typhoonCmpProg = null; typhoonLabelAnim = null; renderTyphoon(); applyVfEnter(t); return; }
    const ps = _tt ? +_tt.ps : 0, pe = _tt ? +_tt.pe : 0, lab = (_tt && _tt.lab) || {};
    // 경로: [ps,pe] 동안 등속(이징) 진행
    const pathK = _tt ? clamp01((t - ps) / Math.max(0.001, pe - ps)) : 1;
    typhoonProg = pathK >= 1 ? null : lo + easeInOutC(pathK) * span;
    // 라벨: 각 라벨의 [s,e] 키로 등장(리더+스케일 시간은 그 길이에 비례). 절대시각(ms) 기준.
    const map = {};
    if (_tt && !typhoonLineMode()) for (const b of labelList()) if (!b.off && b.idx != null && b.idx >= lo && b.idx <= hi) {
      const e = lab[b.id]; if (!e) continue;
      const dur = Math.max(0.05, e.e - e.s) * 1000;
      map[b.id] = { st: e.s * 1000, LINE: dur * 0.6, SCALE: dur * 0.7 };
    }
    typhoonLabelAnim = _tt ? { at: t * 1000, map } : null;
    // 비교 예보선 진행도 — 타임라인 트랙(typcmp)이 있으면 그 시작·길이(초)로, 없으면 메인과 같은 타이밍.
    const cmp = (S.typhoon && S.typhoon.compare) || [];
    if (cmp.length) { const trk = anim().tracks; typhoonCmpProg = {}; for (const c of cmp) { const tr = trk.find((x) => x.kind === 'typcmp' && x.key === c.id); const ck = tr ? clamp01((t - tr.start) / Math.max(tr.len, 0.001)) : pathK; typhoonCmpProg[c.id] = ck >= 1 ? null : easeInOutC(ck); } }   // 0..1 비율(호길이 등속)
    else typhoonCmpProg = null;
    renderTyphoon();
    applyVfEnter(t);                                // VF면 진입 슬라이드도 함께
    return;
  }
  animT = t;
  const A = anim();
  const F = fills();
  const reveal = A.reveal || 'dissolve';

  const colProg = {};
  for (const tr of A.tracks) if (tr.kind === 'fill') colProg[String(tr.key || '').toUpperCase()] = easeOut(trackProg(tr, t));   // 색 키는 대문자로(타임라인 행·AE가 색을 대소문자 없이 찾는 것과 같게)
  const overlap = typeof wrnOverlapPlan === 'function' ? wrnOverlapPlan() : {};
  const progOf = (kind, id) => {
    const tr = A.tracks.find((x) => x.kind === kind && x.key === id);
    return tr ? trackProg(tr, t) : 1;   // 트랙이 없으면 계속 보이는 것으로
  };

  let blindProg = null, blindIdx = null;   // 블라인드일 때 색별 진행도/클립 인덱스 (아래 산에서도 쓴다)
  const fastFill = _animFast && _animFast.groups.length && reveal !== 'blinds' && !_animFast.blinds;
  const fastBlind = _animFast && _animFast.groups.length && reveal === 'blinds' && _animFast.blinds;
  if (fastBlind) {
    // 가속 블라인드(미리보기 전용): 진행도는 정확 경로와 같은 식, 그리기는 색 그룹 마스크(무늬 rect 하나)
    const prog = {};
    for (const c in colProg) prog[c] = colProg[c];
    const fcols = new Set(Object.values(F).map((c) => (c || '').toUpperCase()));
    for (const m of (S.mtns || [])) { if (m.off) continue; const k = (m.col || '').toUpperCase(); if (!k || k in colProg || fcols.has(k)) continue; const v = easeOut(clamp01(progOf('mtn', m.id))); prog[k] = prog[k] == null ? v : Math.min(prog[k], v); }
    for (const { g, key } of _animFast.groups) {
      const gp = prog[key];
      if (gp == null || gp >= 0.999) { setAttrIf(g, 'opacity', '1'); setAttrIf(g, 'mask', null); }
      else if (gp <= 0) setAttrIf(g, 'opacity', '0');
      else { setAttrIf(g, 'opacity', '1'); setAttrIf(g, 'mask', `url(#${animFastMask(key, gp)})`); }
    }
    blindProg = prog;
  } else if (fastFill) {
    // 가속(미리보기 전용): 색 그룹 opacity만 — 존 fill·#gMainSoft는 바탕 그대로
    for (const { g, key } of _animFast.groups) { const p = colProg[key]; g.setAttribute('opacity', (p === undefined ? 1 : clamp01(p)).toFixed(3)); }
  } else if (reveal === 'blinds') {
    // 색깔마다 '자기 트랙 진행도'로 열리는 슬랫으로 각자 드러난다 (지도 전체가 한 번에 열리지 않게)
    ensureBlind(); blindOn = true;
    ensureClip('bclipHide');   // 빈 클립(rect 없음) = 아무것도 안 보임 — 시작 전 산을 숨긴다
    const prog = {}, idx = {};
    for (const c in colProg) prog[c] = colProg[c];    // colProg = 색(대문자) -> easeOut 진행도
    // 지도 칠에 없는 산 색은 자기 '산' 트랙 진행도로 슬랫을 연다(번짐과 같은 타이밍 — 안 그러면 0초부터 다 보임).
    // 같은 색 산이 여럿이면 가장 늦은 진행도. 지도 존은 F 색만 보므로 영향 없음.
    const fcols = new Set(Object.values(F).map((c) => (c || '').toUpperCase()));
    for (const m of (S.mtns || [])) {
      if (m.off) continue;
      const k = (m.col || '').toUpperCase(); if (!k || k in colProg || fcols.has(k)) continue;
      const v = easeOut(clamp01(progOf('mtn', m.id)));
      prog[k] = prog[k] == null ? v : Math.min(prog[k], v);
    }
    // 진행 중(0<gp<1)인 색만 슬랫 클립을 만든다 (시작 전엔 베이스, 다 열리면 클립 없이 그냥 색)
    let ci = 0;
    for (const c in prog) if (prog[c] > 0 && prog[c] < 0.999) { idx[c] = ci; paintBlindClip(ensureClip('bclip' + ci), prog[c]); ci++; }
    for (let k = ci; ; k++) { const c = document.getElementById('bclip' + k); if (!c) break; c.remove(); }   // 남는 옛 클립 정리
    for (const [id, arr] of zoneEls) {
      const col = F[id], key = col ? col.toUpperCase() : null;
      const gp = key != null ? prog[key] : null;
      for (const { el: e } of arr) {
        if (key == null) { e.setAttribute('fill', S.base); e.removeAttribute('clip-path'); }            // 안 칠한 구역
        else if (gp == null || gp >= 0.999) { e.setAttribute('fill', col); e.removeAttribute('clip-path'); } // 다 열림
        else if (gp <= 0) { e.setAttribute('fill', S.base); e.removeAttribute('clip-path'); }            // 아직 시작 전 -> 베이스
        else { e.setAttribute('fill', col); e.setAttribute('clip-path', 'url(#bclip' + idx[key] + ')'); } // 진행 중 -> 슬랫으로 드러남
      }
    }
    blindProg = prog; blindIdx = idx;
  } else {
    teardownBlind();
    // 번짐 — 베이스색에서 목표색으로
    for (const [id, arr] of zoneEls) {
      const target = F[id];
      let col = S.base;
      if (target) { const p = colProg[target.toUpperCase()]; col = p === undefined ? target : mixHex(S.base, target, p); }
      for (const { el: e, inset } of arr) e.setAttribute('fill', overlap[id] ? wrnStripeFill(svg, overlap[id], inset ? S.insets[inset].s : S.map.s, colProg, null, inset) : col);
    }
  }

  // 해상 겹침도 같은 색별 타이밍을 쓴다.
  if (Object.keys(overlap).length) for (const p of document.querySelectorAll('#seaT .sea')) {
    const cols = overlap[p.dataset.id];
    if (cols) p.setAttribute('fill', wrnStripeFill(svg, cols, S.map.s, colProg));
  }

  // 부드러운 경계 오버레이(#gMainSoft)도 애니메이션에 맞춰 같이 드러나게 —
  // 각 복제본을 원본 존의 '지금 프레임' 칠/클립에 그대로 맞춘다 (안 그러면 애매 구역만 처음부터 꽉 차 보인다).
  if (!fastFill && !fastBlind) {
    const soft = $('#gMainSoft');
    if (soft) for (const p of soft.children) {
      const arr = zoneEls.get(p.dataset.id); const z = arr && arr[0] && arr[0].el;
      if (!z) continue;
      p.setAttribute('fill', z.getAttribute('fill'));
      const cp = z.getAttribute('clip-path');
      if (cp) p.setAttribute('clip-path', cp); else p.removeAttribute('clip-path');
    }
  }
  // 서울 지도: 칠한 동 색을 한강 위로 다시 그린 오버레이(#seoulPaintTop)도 원본 존의 '지금 프레임' 칠/클립에 맞춘다
  // (안 그러면 처음부터 최종색 85%가 덮여 번짐·블라인드가 안 보인다). 아직 베이스색이면 숨긴다. 끝나면 renderFills가 원래대로.
  {
    const top = $('#seoulPaintTop');
    if (top && isSeoul()) for (const p of top.children) {
      const arr = zoneEls.get(p.dataset.id); const z = arr && arr[0] && arr[0].el;
      if (!z) continue;
      const f = z.getAttribute('fill') || '';
      if (f.toUpperCase() === (S.base || '').toUpperCase()) { p.style.display = 'none'; continue; }
      p.style.display = '';
      p.setAttribute('fill', f);
      const cp = z.getAttribute('clip-path');
      if (cp) p.setAttribute('clip-path', cp); else p.removeAttribute('clip-path');
    }
  }

  // 수치 라벨 — 밑에서 올라오며 opacity로 나타난다 (제자리, ease-out)
  for (const g of document.querySelectorAll('#L_labels > g')) {
    const p = progOf('label', g.dataset.id);
    const it = itemOf({ kind: 'label', id: g.dataset.id });
    if (!it) continue;
    const e = easeOut(p);
    const dy = (1 - e) * 26;   // 26px 아래에서 올라온다
    g.setAttribute('transform', `translate(${it.x} ${it.y + dy})`);
    g.setAttribute('opacity', clamp01(e).toFixed(3));
    // 지시선 라벨 — 선·앵커는 박스 g 밖 형제라 같이 페이드시키고, 선 끝은 올라오는 박스를 따라간다
    const line = svg.querySelector(`#L_labels > [data-fleader-id="${g.dataset.id}"]`), anc = svg.querySelector(`#L_labels > [data-fanchor-id="${g.dataset.id}"]`);
    if (line || anc) {
      const b = S.labels.find((x) => x.id === g.dataset.id);
      if (line && b && b._w && b.ax != null) line.setAttribute('d', typhoonLeaderGeom(b.ax, b.ay, it.x, it.y + dy, b._w, b._h).d);
      if (line) line.setAttribute('opacity', clamp01(e).toFixed(3));
      if (anc) anc.setAttribute('opacity', clamp01(e).toFixed(3));
    }
  }

  // 브러쉬 덧칠 — 색별 이미지가 각자 자기 브러쉬 트랙 진행도로 들어온다(색별로 따로 등장).
  // 트랙이 없는 색(옛 데이터 등)은 예전처럼 '첫 칠 전 페이드인'으로 처리.
  {
    const bft = A.tracks.filter((x) => x.kind === 'fill');
    const firstFill = bft.length ? Math.min(...bft.map((x) => x.start)) : ANIM_FILL_LEN;
    const fallback = easeOut(clamp01(t / Math.max(firstFill, ANIM_FILL_LEN)));
    brushFinalize();   // 방금 칠한 획 이미지 갱신이 남았으면 먼저 끝낸다
    for (const im of document.querySelectorAll('image.brushLayer[data-col]')) {
      const col = (im.getAttribute('data-col') || '').toUpperCase();
      const tr = A.tracks.find((x) => x.kind === 'brush' && (x.key || '').toUpperCase() === col);
      const gp = tr ? easeOut(trackProg(tr, t)) : fallback;
      im.style.display = '';
      im.setAttribute('opacity', gp.toFixed(3));
    }
    // 라이브(드래그 중) 캔버스는 애니메이션 중엔 숨긴다
    for (const im of document.querySelectorAll('.brushLayer.brushLive')) im.style.display = 'none';
  }

  // 산 색칠 — 지도 칠과 똑같이. 번짐이면 베이스->산색으로 번지고, 블라인드면 그 산색의 슬랫으로 각자 드러난다.
  document.getElementById('L_mtn').removeAttribute('clip-path');   // 예전 전체 클립 잔재 제거
  for (const g of document.querySelectorAll('#L_mtn > g')) {
    const it = itemOf({ kind: 'mtn', id: g.dataset.id });
    if (!it) continue;
    g.setAttribute('transform', `translate(${it.x} ${it.y})`);   // 제자리 (뽕 애니메이션 제거)
    g.removeAttribute('opacity');
    const path = g.querySelector('path');
    if (!path) continue;
    if (fastBlind) {   // 가속 블라인드 — 산도 그 색 마스크로(시작 전 숨김, 다 열리면 그냥)
      path.setAttribute('fill', it.col); g.removeAttribute('clip-path');
      const gp = blindProg[(it.col || '').toUpperCase()];
      if (gp == null || gp >= 0.999) g.removeAttribute('mask');
      else if (gp <= 0) { g.setAttribute('opacity', '0'); g.removeAttribute('mask'); }
      else g.setAttribute('mask', `url(#${animFastMask((it.col || '').toUpperCase(), gp)})`);
    } else if (reveal === 'blinds') {
      path.setAttribute('fill', it.col);
      const key = (it.col || '').toUpperCase();
      const gp = blindProg ? blindProg[key] : null;
      // 그 산색이 지도에도 있으면 그 색 슬랫으로 같이 드러난다. 시작 전엔 숨김, 다 열리면 그냥 보임.
      if (gp == null || gp >= 0.999) g.removeAttribute('clip-path');
      else if (gp <= 0) g.setAttribute('clip-path', 'url(#bclipHide)');
      else g.setAttribute('clip-path', 'url(#bclip' + blindIdx[key] + ')');
    } else path.setAttribute('fill', mixHex(S.base, it.col, easeOut(clamp01(progOf('mtn', g.dataset.id)))));
  }
  // 제목 텍스트는 애니메이션 안 함 — renderTexts()가 그린 그대로 둔다

  // 노말 VF — 패널 전체가 오른쪽에서 왼쪽으로 슬라이드하며 opacity 0→1 (수치라벨과 같은 easeOut). 색칠은 10프레임 뒤부터(animStart).
  applyVfEnter(t);
}

// 노말 VF 진입: 래퍼(L_vfWrap) 하나에 슬라이드(transform)+페이드(opacity)를 건다.
// 단일 그룹이라 레이어끼리 겹쳐 비치는 잔상이 없고, 클립(vfClip)도 이 래퍼에 걸려 있어 패널 모양으로 같이 움직인다.
function vfEnterDist() { const r = _vfPanelRect; return r ? Math.round(r.w * 0.5) : 320; }   // 패널 폭 절반쯤 오른쪽에서
function applyVfEnter(t) {
  const wrap = document.getElementById('L_vfWrap');
  if (!wrap) return;
  if (S.res !== '1920x1080-vf') { wrap.removeAttribute('transform'); wrap.removeAttribute('opacity'); return; }
  const e = easeVf(clamp01((t - ANIM_START) / ANIM_VF_ENTER_LEN));   // 1초 홀드 뒤 시작, 부드럽게
  const dx = (1 - e) * vfEnterDist();
  wrap.setAttribute('transform', `translate(${dx.toFixed(2)} 0)`);
  wrap.setAttribute('opacity', e.toFixed(3));
}
function clearVfEnter() {
  const wrap = document.getElementById('L_vfWrap');
  if (wrap) { wrap.removeAttribute('transform'); wrap.removeAttribute('opacity'); }
}

// 애니메이션 상태를 걷어내고 평소 화면으로
function animOff() {
  animFastOff();     // 미리보기 가속 그룹·CSS 변환 제거
  if (typeof tlSettleCancel === 'function') tlSettleCancel();
  animT = null;
  _exportingFrames = false; showExportMask(false);   // 추출 종료 — 미리보기 캔버스 갱신 재개, 가리개 제거
  clearExportCache();          // 추출 정적 레이어 캐시 비움(다음 추출은 새로 굽는다)
  typhoonProg = null; typhoonCmpProg = null; typhoonLabelAnim = null;   // 태풍 애니 상태 초기화(정지 시 완전표시로 복구)
  teardownBlind();   // 블라인드 복제·클립을 먼저 걷어낸다
  clearVfEnter();    // VF 진입 슬라이드/페이드 잔재 제거
  restoreCamMap();   // 카메라로 바꾼 S.map을 작업 뷰로 되돌린다
  renderAll();
}
// 다른 작업으로 갈아끼우기(불러오기·새로 시작) 직전 — 재생 루프·미리보기·카메라 백업을 걷어
// 옛 작업의 뷰(_camSavedMap)가 나중에 새 작업 S.map에 덮이지 않게 한다.
function stopAnimForSwap() {
  animStop();
  if (typeof typhoonRaf !== 'undefined' && typhoonRaf) { cancelAnimationFrame(typhoonRaf); typhoonRaf = 0; }
  animOff();
  tlHeadT = 0;
}

// t초로 이동 — 그 시각의 정확한 프레임을 바로 그리고 재생헤드(CTI)를 옮긴다(동기). 끌기·재생 중 반복 그리기는 타임라인 스케줄러가 묶는다.
function animSeek(t) {
  const A = anim();
  t = Math.max(0, Math.min(t, A.dur));
  tlHeadT = t;   // 재생헤드 위치 기억(카메라 키 찍는 시각 기준 — 지도 이동/정지로 animT가 null 돼도 유지)
  animFastOff();
  renderAnimFrame(t);
  if (typeof tlPlaceHead === 'function') tlPlaceHead();
}

// 재생/멈춤 — 재생헤드(CTI)에서 시작한다(B6). 끝(또는 작업 영역 끝)에 있으면 처음(작업 영역 시작)부터.
// 프레임 그리기는 타임라인 스케줄러(tlFrame, rAF 하나)가 맡는다.
function animPlay() {
  if (animPlaying) return animStop();
  if (typeof typhoonRaf !== 'undefined' && typhoonRaf) { cancelAnimationFrame(typhoonRaf); typhoonRaf = 0; }   // '애니메이션 확인' 미리보기 루프가 살아 있으면 정리(겹쳐 재생돼 번쩍이는 것 방지)
  // 태풍 지도는 경로 애니가 내재적(renderAnimFrame이 시각으로 계산)이라 트랙/카메라 키가 없어도 재생된다.
  if (!hasAnim()) { status('트랙이 없습니다 — 자동 구성을 먼저 누르세요', true); return; }
  if (typeof tlPlayStart === 'function') { tlPlayStart(); return; }
}
function animStop() {
  const was = animPlaying;
  animPlaying = false;
  cancelAnimationFrame(animRAF);
  if (typeof tlPlayStopped === 'function') tlPlayStopped(was);
  else { const b = $('#tlPlay'); if (b) b.textContent = '재생'; }
}
