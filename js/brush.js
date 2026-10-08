/* [모듈] js/brush.js — 브러쉬 덧칠 엔진: 공간 캐시·색 런 캔버스·증분 적용(brushApply)·되돌리기 조각, <image> 반영, PNG 인코딩 워커·이미지 갱신(brushPublish·brushFinalize) */
'use strict';

// ===================== 브러쉬 덧칠 =====================
// '공간'(본토 main + 각 인셋)마다 그 공간 좌표계 위 캔버스에 굽고 <image>로 얹는다.
// 본토 이미지는 mapT 안(L_brush), 인셋 이미지는 그 인셋 그룹(insetT-key) 안 → 각자 지도/박스를 따라간다.
// 각 획은 자기 '영역(존)' path 로 클립해서 그 안에만 칠해진다. 섬(인셋)도 같은 방식.
// 쌓는 규칙: 같은 색이 이어지는 획들 = 한 '색 런' 이미지(겹치면 진해짐, data-col·data-run). 새 획은 앞 런들을
// 자기 모양으로 2번 파내고(덮기 — 위에 얹힐 때 1번 더 = 3번) 자기 런에 얹는다. 지우개 획은 앞 런들을 파낸다.
//
// 가볍게(2026-10) — 계산·결과는 그대로, '다시 그리는 양'만 줄였다:
//  · 공간마다 색 런 캔버스를 메모리에 들고 있다가 새 획 하나엔 그 획만 더한다(증분 — 처음부터 굽기와 픽셀까지 같은 계산,
//    brushApply). 처음부터 다시 굽기는 획 목록이 통째로 바뀔 때(불러오기·지도 종류·색 계열 바꾸기)만.
//    renderAll 이 불러도 획이 그대로면 아무것도 안 한다.
//  · 런 캔버스는 공간 전체가 아니라 그 런이 칠한 범위(64px 격자로 맞춤)만 든다 — 메모리·PNG 인코딩·디코딩이 그만큼 준다.
//    획이 닿는 범위 = 점 범위 ∩ 고른 영역(존) bbox. 런 이미지는 공간 전체 이미지와 같은 픽셀 격자에 놓인다(brushGeo).
//  · 되돌리기 = 획마다 남겨 둔 '바뀌기 전 조각'을 되붙인다(최근 40획·메모리 한도 안 — 넘으면 다시 굽기).
//  · 드래그 중엔 <foreignObject> 안 캔버스(늘 붙어 있음)에 점만 바로 찍는다(PNG 인코딩·디코딩·그림자 필터 재래스터 없음).
//  · 손 떼면 바뀐 런만 PNG(data URL) — 워커 2~3개가 인코딩(메인 스레드 밖). 끝나면 한 번에 바꿔 끼우고 라이브 캔버스를 비운다.
//    인코딩 중에 다음 획·되돌리기가 와도 기다리지 않는다 — 앞 갱신을 취소하고 다음 갱신에 합친다(받아 둔 PNG 는 그대로 쓴다).
//    그동안 화면이 옛 그림이면 라이브 캔버스에 지금 런들을 쌓아 보이고 런 이미지는 잠깐 숨긴다(brushShowRuns).
//    바로 마무리(brushFinalize — 남은 런은 toDataURL)는 추출·애니 프레임처럼 최종 PNG 가 꼭 있어야 할 때만.
//  · GPU 가 다시 시작되면(드라이버 리셋·절전 복귀) 메모리 캔버스가 비므로, 복구되면 저장 획에서 처음부터 다시 굽는다(brushOnLost).
//  · 클립 Path2D 는 존마다 한 번만 파싱하고, 같은 영역(keys)은 캐시한다(buildZones 때 비움).
const hexA = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; };
const brushSpaceKeys = () => ['main', ...Object.keys(S.insets)];
const brushGroup = (space) => (space === 'main' ? $('#gMain') : $('#insetT-' + space));
const brushOutline = (space) => (space === 'main' ? $('#zoneLineMain') : svg.querySelector(`[data-zoneline="${space}"]`));
const brushParent = (space) => (space === 'main' ? $('#L_brush') : $('#insetT-' + space));
const brushRT = {};                  // space -> 메모리 캐시(저장 안 함): 색 런 캔버스·<image>·적용한 획 서명·되돌리기 조각·라이브 캔버스
let brushGeomRev = 0;                // 존을 다시 만들면 +1 → bbox·클립 캐시를 버린다
let brushViewRev = 0;                // 지도·인셋·보기 변환이 바뀌면 +1 → 칠하는 중 화면→로컬 역행렬을 다시 구한다
const brushZoneP = new WeakMap();    // 존 path 요소 -> Path2D (d 는 한 번만 파싱)
const brushClipC = new Map();        // 'space|영역' -> { p: 합친 클립 Path2D, b: 로컬 bbox [x0,y0,x1,y1] (모르면 null) }
const BRUSH_UNDO_N = 40, BRUSH_UNDO_PX = 12e6;   // 되돌리기 조각·백업: 공간마다 최근 40획·1200만 픽셀(약 48MB)까지
const BRUSH_G = 64;                  // 런 캔버스를 자르는 격자(픽셀)
// 특보구역 코드(L1+2자리) -> 권역(시도급). 특보구역은 시군보다 잘게 쪼개져 있어 이걸로 묶는다.
// (대전은 충남권, 부산·울산은 경남권으로 함께 묶인다 — 코드 체계가 그렇게 나뉜다.)
const WARN_SIDO = {
  '01': '경기', '02': '강원', '03': '대전·충남', '04': '충북', '05': '전남', '06': '전북',
  '07': '경북', '08': '경남·부산·울산', '09': '제주', '10': '서울', '11': '인천', '13': '광주', '14': '대구', '17': '세종',
};
// 브러쉬 영역 선택 단위 = '시도'(공간별).
//  · 특보구역(L 코드) -> 위 권역   · 시군/시도('강원/속초시','강원') -> '강원'   · 인셋(섬)은 공간이 달라 따로.
const brushSido = (id) => {
  const m = /^L1(\d\d)/.exec(id);
  if (m) return WARN_SIDO[m[1]] || id;
  return id.includes('/') ? id.split('/')[0] : id;
};
const regionKey = (space, id) => space + '::' + brushSido(id);
// 존을 다시 만들었다(지도 종류·불러오기) — 존 id·모양이 달라지니 선택과 클립·bbox 캐시를 비운다(buildZones가 부른다)
function brushZonesChanged() {
  brushGeomRev++;
  brushClipC.clear();
  brushRegions.clear();
  brushSelEls.clear();
}
function zonePath2D(e) {
  let p = brushZoneP.get(e);
  if (p === undefined) { const d = e.getAttribute('d'); p = d ? new Path2D(d) : null; brushZoneP.set(e, p); }
  return p;
}
// ids 에 걸리는(match(존 id)) 그 공간의 존 path 를 전부 합친 클립과 그 bbox(로컬) — 같은 영역은 한 번만 만든다.
// bbox 는 획이 닿는 범위를 줄이는 데만 쓴다(클립 밖은 어차피 안 칠해짐). 모르는 존이 있으면 null(줄이지 않음).
function brushClipPath(space, tag, ids, match) {
  const ck = space + '|' + tag + ids.join('\u0001');
  let c = brushClipC.get(ck);
  if (c) return c;
  const set = new Set(ids), p = new Path2D(), b = [Infinity, Infinity, -Infinity, -Infinity];
  let known = true;
  for (const [id, arr] of zoneEls) {
    if (!set.has(match(id))) continue;
    for (const { el: e, inset } of arr) {
      if ((inset || 'main') !== space) continue;
      const zp = zonePath2D(e);
      if (!zp) continue;
      p.addPath(zp);
      let bb = null;
      try { bb = e.getBBox ? e.getBBox() : null; } catch (_) { bb = null; }
      if (bb && (bb.width > 0 || bb.height > 0)) { b[0] = Math.min(b[0], bb.x); b[1] = Math.min(b[1], bb.y); b[2] = Math.max(b[2], bb.x + bb.width); b[3] = Math.max(b[3], bb.y + bb.height); }
      else known = false;
    }
  }
  c = { p, b: known ? b : null };   // 걸리는 존이 없으면 b 가 빈 범위(Infinity) → 아무 데도 안 칠해짐(클립도 비어 있다)
  brushClipC.set(ck, c);
  return c;
}
// 선택된 시도 key들(그 공간)에 해당하는 존 path 전부 합쳐서 마스크
const keysPath2D = (keys, space) => brushClipPath(space, 'k:', [...keys], (id) => regionKey(space, id)).p;
function strokeClipOf(s, space) {
  if (s.keys) return brushClipPath(space, 'k:', [...s.keys], (id) => regionKey(space, id));
  return brushClipPath(space, 'r:', s.regions || (s.region ? [s.region] : []), (id) => id);   // 옛 데이터 호환
}
const strokeClip = (s, space) => strokeClipOf(s, space).p;
const sameHex = (a, b) => (a || '').toUpperCase() === (b || '').toUpperCase();
// 주어진 ctx에 그 공간의 좌표계(배율·bbox)와 클립을 건다. save()하므로 끝나면 brushEnd(=restore).
function brushSetup(cx, st, clipPath) {
  cx.save();
  cx.setTransform(st.K, 0, 0, st.K, -st.bbox.x * st.K, -st.bbox.y * st.K);
  if (clipPath) cx.clip(clipPath);
  return cx;
}
const brushEnd = (cx) => cx.restore();
// 부드러운 원형 그라디언트 한 점 (peak 알파 a).
function brushGrad(cx, x, y, r, col, a, soft) {
  const g = cx.createRadialGradient(x, y, 0, x, y, r);
  const inner = clamp01(1 - soft / 100) * 0.9;   // soft 클수록 단단한 중심이 작다
  g.addColorStop(0, hexA(col, a));
  g.addColorStop(clamp01(inner), hexA(col, a));
  g.addColorStop(1, hexA(col, 0));
  cx.fillStyle = g;
  cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
}
// 한 점 찍기 — 같은 레이어에 겹치면 source-over로 '쌓여서 진해진다'. 지우개는 파낸다.
function brushDab(cx, x, y, r, col, op, soft, erase) {
  cx.save();
  cx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  brushGrad(cx, x, y, r, col, erase ? 1 : op / 100, soft);
  cx.restore();
}
// GPU 가 다시 시작되면(드라이버 리셋·절전 복귀·GPU 메모리 부족) 메모리에 든 캔버스(런·조각·백업·라이브)가 전부 비워진다.
// 그때 캔버스마다(문서 밖 것도) contextlost → 복구되면 contextrestored 가 온다. 복구되면 저장 획에서 처음부터 다시 굽는다.
// (그 전까지 화면은 이미 끼워 둔 PNG 그대로 — data URL 이라 GPU 와 무관)
const brushGpu = { lost: false, cv: null, t: 0, n: 0 };
function brushWatch(c) {
  if (c && c.addEventListener) { c.addEventListener('contextlost', brushOnLost); c.addEventListener('contextrestored', brushOnLost); }
  return c;
}
function brushOnLost(e) {
  if (!brushGpu.lost) brushGpu.n = 0;
  brushGpu.lost = true; brushGpu.cv = e.target;
  const pub = brushPub;
  if (pub && !pub.done) {   // 빈 캔버스로 만든 PNG 를 끼우지 않게 — 그동안은 이미 끼워 둔 PNG 를 보인다(라이브 캔버스도 비었다)
    pub.done = true; brushPub = null; brushEncCancel(pub.jobs);
    for (const st of Object.values(brushRT)) brushSyncImgs(st, null);
  }
  clearTimeout(brushGpu.t);
  brushGpu.t = setTimeout(brushGpuCheck, e.type === 'contextrestored' ? 0 : 250);
}
function brushGpuCheck() {
  const x = brushGpu.cv && brushGpu.cv.getContext('2d');
  if (x && x.isContextLost && x.isContextLost() && ++brushGpu.n < 40) { brushGpu.t = setTimeout(brushGpuCheck, 250); return; }   // 아직 복구 전(최대 10초 기다림)
  brushGpu.lost = false;
  for (const st of Object.values(brushRT)) brushResetRuns(st);
  renderBrush();   // 칠하는 중이면 손 뗄 때 처음부터 굽는다(런을 비워 둠)
}
// 캔버스(런·조각·백업용) — 버린 것은 크기를 0으로(메모리 바로 반환) 몇 장만 모아 두었다가 다시 쓴다.
const brushPool = [];
function brushNewCanvas(w, h) {
  const c = brushPool.pop() || brushWatch(document.createElement('canvas'));
  c.width = w; c.height = h;   // 크기를 정하면 비워지고 그리기 상태도 처음으로
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over';
  return c;
}
const brushFree = (c) => { if (!c) return; c.width = 0; c.height = 0; if (brushPool.length < 8) brushPool.push(c); };
function brushFreePatch(P) { if (P) for (const sv of P.saves) brushFree(sv[1]); }
function brushFreeBk(bk) { for (const b of bk.m.values()) brushFree(b.c); bk.m.clear(); }
// 획 서명 — 같은 획인지 빠르게 비교(되돌리기는 S를 JSON으로 통째로 갈아끼워 객체가 새것). 점은 개수 + 처음·가운데·끝.
function brushSig(s) {
  const d = s.dabs || [], a = d[0] || [], m = d[d.length >> 1] || [], z = d[d.length - 1] || [];
  return [s.erase ? 1 : 0, (s.col || '').toUpperCase(), s.r, s.op, s.soft,
    s.keys ? 'k' + s.keys.join('\u0001') : 'r' + (s.regions || (s.region ? [s.region] : [])).join('\u0001'),
    d.length, a[0], a[1], m[0], m[1], z[0], z[1]].join('|');
}
// 획이 닿는 캔버스 픽셀 사각형 [x, y, w, h] (점 bbox + 반지름 + 여유 2px, 그리고 클립 영역 bbox + 여유 2px 안).
// 이 밖은 그 획 레이어가 완전히 투명(클립 밖은 안 칠해진다).
function brushRect(st, s) {
  const d = s.dabs, r = +s.r;
  if (!d || !d.length || !(r > 0)) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of d) { const x = p[0], y = p[1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const K = st.K, bx = st.bbox.x, by = st.bbox.y;
  let rx0 = Math.max(0, Math.floor((x0 - r - bx) * K) - 2), ry0 = Math.max(0, Math.floor((y0 - r - by) * K) - 2);
  let rx1 = Math.min(st.W, Math.ceil((x1 + r - bx) * K) + 2), ry1 = Math.min(st.H, Math.ceil((y1 + r - by) * K) + 2);
  const cb = strokeClipOf(s, st.space).b;
  if (cb) {
    rx0 = Math.max(rx0, Math.floor((cb[0] - bx) * K) - 2); ry0 = Math.max(ry0, Math.floor((cb[1] - by) * K) - 2);
    rx1 = Math.min(rx1, Math.ceil((cb[2] - bx) * K) + 2); ry1 = Math.min(ry1, Math.ceil((cb[3] - by) * K) + 2);
  }
  return rx1 > rx0 && ry1 > ry0 ? [rx0, ry0, rx1 - rx0, ry1 - ry0] : null;
}
const boxHit = (b, r) => !!b && b[0] < r[0] + r[2] && r[0] < b[0] + b[2] && b[1] < r[1] + r[3] && r[1] < b[1] + b[3];
const boxAdd = (b, r) => {
  if (!b) return r.slice();
  const x0 = Math.min(b[0], r[0]), y0 = Math.min(b[1], r[1]);
  return [x0, y0, Math.max(b[0] + b[2], r[0] + r[2]) - x0, Math.max(b[1] + b[3], r[1] + r[3]) - y0];
};
const boxAnd = (a, b) => {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
};
// 런 캔버스 범위(공간 픽셀) — 칠한 범위(box)를 격자(BRUSH_G)로 넓힌 것. box 로만 정해지므로
// 한 획씩 더해도·처음부터 구워도·되돌려도 같은 범위(→ 같은 픽셀).
function brushExt(st, box) {
  if (!box) return [0, 0, 1, 1];
  const G = BRUSH_G, x0 = Math.floor(box[0] / G) * G, y0 = Math.floor(box[1] / G) * G;
  return [x0, y0, Math.min(st.W, Math.ceil((box[0] + box[2]) / G) * G) - x0, Math.min(st.H, Math.ceil((box[1] + box[3]) / G) * G) - y0];
}
const sameExt = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
// 런 캔버스를 범위 e 로 — 겹치는 부분은 그대로 옮긴다(정수 픽셀 복사)
function brushRunFit(r, e) {
  if (sameExt(r.o, e)) return;
  const c = brushNewCanvas(e[2], e[3]);
  if (r.cv && r.o) c.getContext('2d').drawImage(r.cv, r.o[0] - e[0], r.o[1] - e[1]);
  brushFree(r.cv);
  r.cv = c; r.o = e.slice();
}
// 런 캔버스 범위(픽셀) → <image> x·y·폭·높이(로컬). 공간 전체 이미지(bbox ↔ W×H)와 같은 픽셀 격자.
const brushGeo = (st, o) => { const sx = st.bbox.w / st.W, sy = st.bbox.h / st.H; return [st.bbox.x + o[0] * sx, st.bbox.y + o[1] * sy, o[2] * sx, o[3] * sy]; };
// 공간 캐시 — 지도 종류·존이 그대로면 재사용. 처음 보거나 바뀌면 bbox부터 새로(런은 비움).
function brushStateOf(space) {
  const key = S.style + '|' + brushGeomRev;
  let st = brushRT[space];
  if (st && st.key === key && st.ok) return st;
  if (!st) {
    st = brushRT[space] = { space, key: null, ok: false, runs: [], applied: [], hist: [], last: null, bk: null, bks: new Set(), imgs: [], box: null, fo: null, liveDirty: false, liveAll: false, layer: null, layerRect: null };
    svg.querySelectorAll(`image.brushLayer[data-space="${space}"]`).forEach((im) => im.remove());   // 이제부터 imgs 가 관리
  }
  if (st.key !== key) { brushResetRuns(st); st.key = key; }
  const outline = brushOutline(space);
  let b; try { b = outline && outline.getBBox(); } catch (e) { b = null; }
  st.ok = !!(b && b.width);
  if (st.ok) {
    const pad = 30;
    const bbox = { x: b.x - pad, y: b.y - pad, w: b.width + pad * 2, h: b.height + pad * 2 };
    const K = Math.min(3, Math.max(1, 1400 / Math.max(bbox.w, bbox.h)));
    if (!st.bbox || st.W !== Math.round(bbox.w * K) || st.H !== Math.round(bbox.h * K) || st.bbox.x !== bbox.x || st.bbox.y !== bbox.y) brushResetRuns(st);
    st.bbox = bbox; st.K = K; st.W = Math.round(bbox.w * K); st.H = Math.round(bbox.h * K);
  }
  return st;
}
function brushResetRuns(st) {
  for (const r of st.runs) brushFree(r.cv);
  for (const P of st.hist) brushFreePatch(P);
  for (const bk of st.bks) brushFreeBk(bk);
  st.bks.clear();
  if (st.layer) { brushFree(st.layer); st.layer = null; st.layerRect = null; }
  if (st.work) { brushFree(st.work); st.work = null; }
  st.runs = []; st.applied = []; st.hist = []; st.last = null; st.bk = null;
}
// (앞 런 백업이 없을 때만 쓰는 예비) 색 획 하나를 빈 레이어에 — 그 획 모양으로만 앞 런을 파낸다.
function brushStrokeLayer(st, s, rect) {
  let cv = st.layer;
  if (!cv || cv.width !== st.W || cv.height !== st.H) { brushFree(cv); cv = st.layer = brushNewCanvas(st.W, st.H); st.layerRect = null; }
  const x = cv.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over';
  if (st.layerRect) x.clearRect(st.layerRect[0], st.layerRect[1], st.layerRect[2], st.layerRect[3]);
  st.layerRect = rect;
  const g = brushSetup(x, st, strokeClip(s, st.space));
  for (const [px, py] of s.dabs) brushDab(g, px, py, s.r, s.col, s.op, s.soft, false);
  brushEnd(g);
  return cv;
}
// 그 런의 지금 모습을 칠한 범위(box)만큼 떠 둔다 — '이 런 시작 전' 백업용
function brushBackup(r) {
  const [bx, by, bw, bh] = r.box, c = brushNewCanvas(bw, bh);
  c.getContext('2d').drawImage(r.cv, bx - r.o[0], by - r.o[1], bw, bh, 0, 0, bw, bh);
  return { c, box: r.box.slice() };
}
// 획의 점들을 런 캔버스에 찍는다 — 잘라 든 런 캔버스에 바로 찍지 않고 공간 전체 크기 작업 캔버스(st.work)에서
// 바꾸기 전과 같은 장치 좌표로 찍은 뒤 그 부분(rect)만 옮겨 온다. GPU 래스터는 정수 픽셀만 옮겨 그려도 반올림이
// 조금 달라지므로(점이 겹쳐 쌓이면 가장자리 몇 픽셀이 최대 몇 단계) — 이렇게 해야 바꾸기 전과 픽셀까지 같다.
function brushDabsInto(st, r, s, clip, rect, erase) {
  const q = boxAnd(rect, r.o);
  if (!q) return;
  let w = st.work;
  if (!w || w.width !== st.W || w.height !== st.H) { brushFree(w); w = st.work = brushNewCanvas(st.W, st.H); }
  const wx = w.getContext('2d'), rx = r.cv.getContext('2d'), ox = r.o[0], oy = r.o[1];
  wx.setTransform(1, 0, 0, 1, 0, 0); wx.globalCompositeOperation = 'source-over';
  wx.clearRect(q[0], q[1], q[2], q[3]);
  wx.drawImage(r.cv, q[0] - ox, q[1] - oy, q[2], q[3], q[0], q[1], q[2], q[3]);   // 런의 그 부분을 제자리로
  const g = brushSetup(wx, st, clip);
  for (const [x, y] of s.dabs) brushDab(g, x, y, s.r, s.col, s.op, s.soft, erase);
  brushEnd(g);
  rx.setTransform(1, 0, 0, 1, 0, 0); rx.globalCompositeOperation = 'source-over';
  rx.clearRect(q[0] - ox, q[1] - oy, q[2], q[3]);
  rx.drawImage(w, q[0], q[1], q[2], q[3], q[0] - ox, q[1] - oy, q[2], q[3]);   // 되돌려 놓기
}
// 획 하나를 런 캔버스들에 더한다(증분) — 바꾸기 전 renderBrush 와 같은 계산을 획 단위로 한다:
//  · 색 획: 자기 런 캔버스에 점을 바로 찍는다(같은 색 연속 = 같은 런 → 진해짐).
//    앞 런들은 '이 런을 시작하기 전 모습(백업)'으로 되돌린 뒤 지금 런 전체로 2번 파낸다
//    (= 런을 다 그린 뒤 앞 런들을 한 번에 2번 파내던 것과 같은 픽셀. 획 사각형 밖은 런이 안 바뀌어 그대로).
//  · 지우개: 그때까지의 런마다 점으로 바로 파낸다.
// 런 캔버스는 칠한 범위만큼(brushExt) — 좌표는 모두 공간 픽셀, 캔버스 안에선 r.o 만큼 뺀다(점 찍기는 brushDabsInto).
// rec 이면 바뀌기 전 조각을 남겨 되돌리기를 다시 굽기 없이 한다.
function brushApply(st, s, sig, rec) {
  const rect = brushRect(st, s);
  const P = rec ? { rect, saves: [], newRun: false, grow: null, last: st.last, bk: st.bk, px: 0 } : null;
  const save = (k) => {   // 그 런의 rect 부분(캔버스 안쪽만)을 떠 둔다
    if (!P || !rect) return;
    const r = st.runs[k], q = boxAnd(rect, r.o);
    if (!q) return;
    const c = brushNewCanvas(q[2], q[3]);
    c.getContext('2d').drawImage(r.cv, q[0] - r.o[0], q[1] - r.o[1], q[2], q[3], 0, 0, q[2], q[3]);
    P.saves.push([k, c, r.box && r.box.slice(), q]);
    P.px += q[2] * q[3];
  };
  const clip = rect ? strokeClip(s, st.space) : null;
  const dabs = (r, erase) => brushDabsInto(st, r, s, clip, rect, erase);
  if (s.erase) {   // 지우개 — 그때까지의 런을 전부 파낸다
    if (rect) st.runs.forEach((r, k) => { if (boxHit(r.box, rect)) { save(k); dabs(r, true); r.dirty = true; } });
    st.last = '\u0000';   // 지우개 뒤의 색 획은 새 런
    st.bk = null;
  } else {
    const col = (s.col || '').toUpperCase();
    let k = st.runs.length - 1;
    const cont = k >= 0 && st.last === col;   // 같은 색 연속 → 같은 런
    if (!cont) {
      st.runs.push({ col: s.col, cv: null, o: null, box: null, dirty: true }); k++;
      if (P) P.newRun = true;
      st.bk = { k, m: new Map() };   // 새 런: 앞 런들 백업은 처음 닿을 때 뜬다
      st.bks.add(st.bk);
    }
    const run = st.runs[k];
    if (rect) {
      const nb = boxAdd(run.box, rect), e = brushExt(st, nb);
      if (!sameExt(e, run.o)) { if (P && cont) P.grow = [k, run.o.slice()]; brushRunFit(run, e); }   // 런 캔버스를 칠할 범위까지 넓힌다
      if (cont) save(k);
      dabs(run, false);
      run.box = nb;
      const bk = st.bk && st.bk.k === k ? st.bk : null;
      const L = bk ? null : brushStrokeLayer(st, s, rect);   // (백업이 없을 일은 없지만) 그땐 이 획 모양으로만 파낸다
      const src = bk ? run.cv : L, so = bk ? run.o : [0, 0];
      for (let j = 0; j < k; j++) {
        const pr = st.runs[j];
        if (!boxHit(pr.box, rect)) continue;
        const q = boxAnd(rect, pr.o);   // 그 런 캔버스 안쪽만(밖은 비어 있어 파낼 것도 없다)
        if (!q) continue;
        save(j);
        const x = pr.cv.getContext('2d'), ox = pr.o[0], oy = pr.o[1];
        x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over';
        if (bk) {
          const b = bk.m.get(j);
          if (!b) { const nb2 = brushBackup(pr); bk.m.set(j, nb2); if (P) P.px += nb2.box[2] * nb2.box[3]; }   // 처음 닿음 = 아직 이 런에 안 파였다
          else {   // 이 런에 이미 파인 자리 → 백업으로 되돌린 뒤 다시(런 전체로) 파낸다
            x.clearRect(q[0] - ox, q[1] - oy, q[2], q[3]);
            const ib = boxAnd(q, b.box);
            if (ib) x.drawImage(b.c, ib[0] - b.box[0], ib[1] - b.box[1], ib[2], ib[3], ib[0] - ox, ib[1] - oy, ib[2], ib[3]);
          }
        }
        x.globalCompositeOperation = 'destination-out';
        x.drawImage(src, q[0] - so[0], q[1] - so[1], q[2], q[3], q[0] - ox, q[1] - oy, q[2], q[3]);
        x.drawImage(src, q[0] - so[0], q[1] - so[1], q[2], q[3], q[0] - ox, q[1] - oy, q[2], q[3]);
        x.globalCompositeOperation = 'source-over';
        pr.dirty = true;
      }
    } else if (!run.cv) brushRunFit(run, brushExt(st, null));   // 아무 데도 안 닿는 획으로 시작한 런 — 빈 1px
    run.dirty = true;
    st.last = col;
  }
  st.applied.push(sig);
  st.hist.push(P);
  if (P) brushTrimUndo(st);
  brushBkGc(st);
}
// 되돌리기 조각은 최근 것만(개수·픽셀 한도). 가장 최근 1개는 늘 남긴다.
// 남은 조각은 늘 맨 뒤에 이어져 있다 — 빈 칸 너머(되돌리기로 못 닿는 곳)의 조각도 함께 반환한다.
function brushTrimUndo(st) {
  let n = 0, px = 0, i = st.hist.length - 1;
  for (; i >= 0 && st.hist[i]; i--) { n++; px += st.hist[i].px; if (n > 1 && (n > BRUSH_UNDO_N || px > BRUSH_UNDO_PX)) break; }
  for (; i >= 0; i--) if (st.hist[i]) { brushFreePatch(st.hist[i]); st.hist[i] = null; }
}
// 앞 런 백업 묶음 정리 — 지금 런(st.bk)과 남은 되돌리기 조각(P.bk)이 쓰는 것만 두고 나머지 캔버스는 바로 반환한다
function brushBkGc(st) {
  if (!st.bks.size) return;
  const live = new Set();
  if (st.bk) live.add(st.bk);
  for (let i = st.hist.length - 1; i >= 0 && st.hist[i]; i--) if (st.hist[i].bk) live.add(st.hist[i].bk);
  for (const bk of st.bks) if (!live.has(bk)) { brushFreeBk(bk); st.bks.delete(bk); }
}
// 마지막에 더한 획 하나를 되돌린다(남겨 둔 조각을 되붙임) — 다시 굽기와 픽셀이 같다(런 캔버스 범위도 그 획 전으로)
function brushRevert(st) {
  const P = st.hist.pop();
  st.applied.pop();
  if (P.newRun) brushFree(st.runs.pop().cv);
  for (const [k, c, box, q] of P.saves) {
    const r = st.runs[k];
    if (!r) continue;
    const x = r.cv.getContext('2d'), qx = q[0] - r.o[0], qy = q[1] - r.o[1];
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over';
    x.clearRect(qx, qy, q[2], q[3]);
    x.drawImage(c, 0, 0, q[2], q[3], qx, qy, q[2], q[3]);
    r.box = box; r.dirty = true;
  }
  if (P.grow) { const r = st.runs[P.grow[0]]; if (r) { brushRunFit(r, P.grow[1]); r.dirty = true; } }
  st.last = P.last;
  st.bk = P.bk;   // 그 획 전의 '앞 런 백업'(런을 넘어 되돌려도 이어 칠하기가 바꾸기 전과 같게)
  brushFreePatch(P);
  brushBkGc(st);
}
// 캐시(적용한 획들)를 지금 획 목록에 맞춘다: 같은 앞부분은 그대로, 뒤에서 빠진 획은 조각으로 되돌리고, 새 획만 더한다.
// 조각이 없으면(오래된 되돌리기·색 계열 바꾸기·불러오기) 처음부터 다시 굽는다.
function brushReconcile(st, strokes) {
  const sigs = strokes.map(brushSig), A = st.applied;
  let p = 0;
  const n = Math.min(A.length, sigs.length);
  while (p < n && A[p] === sigs[p]) p++;
  if (p === A.length && p === sigs.length) return false;
  if (p < A.length) {
    let can = p > 0;
    for (let i = p; can && i < A.length; i++) if (!st.hist[i]) can = false;
    if (can) while (st.applied.length > p) brushRevert(st);
    else { brushResetRuns(st); p = 0; }
  }
  const N = strokes.length;
  for (let i = p; i < N; i++) brushApply(st, strokes[i], sigs[i], N - i <= BRUSH_UNDO_N);
  return true;
}
// 런 → <image> 반영: 개수·순서(칠한 순서대로 위로)·색, 새 PNG(urls: 런 -> { u: data URL, g: x·y·폭·높이 }), 보이기(애니가 바꾼 opacity 원복).
// 위치·크기는 새 PNG 와 함께만 바꾼다(그 PNG 를 만든 런 캔버스 범위). 라이브는 비움.
// 같은 색이 다른 색을 사이에 두고 다시 나오면(빨강→파랑→빨강) 런마다 따로 — 타임라인·AE는 data-col로 묶어 쓴다.
function brushSyncImgs(st, urls) {
  const space = st.space, imgs = st.imgs, parent = brushParent(space);
  const n = st.ok && parent ? st.runs.length : 0;
  let changed = false;
  while (imgs.length > n) { imgs.pop().remove(); changed = true; }
  const anchor = st.fo && st.fo.parentNode === parent ? st.fo : (space === 'main' ? null : parent && parent.querySelector('[data-zoneline]'));
  const drawing = !!(brushStroke && brushStroke.space === space);
  const disp = drawing && st.liveAll ? 'none' : '';   // 칠하는 중 라이브 캔버스에 런을 쌓아 보이는 중이면 이미지는 계속 숨긴다
  for (let k = 0; k < n; k++) {
    const r = st.runs[k];
    let img = imgs[k];
    if (!img) { img = imgs[k] = el('image', { class: 'brushLayer', 'data-space': space, preserveAspectRatio: 'none' }); parent.insertBefore(img, anchor); changed = true; }
    const col = (r.col || '').toUpperCase();
    if (img.getAttribute('data-col') !== col) img.setAttribute('data-col', col);
    if (img.getAttribute('data-run') !== String(k)) img.setAttribute('data-run', k);
    const u = urls && urls.get(r);
    if (u) {
      const gk = u.g.join(',');
      if (img._bk !== gk) { img._bk = gk; img.setAttribute('x', u.g[0]); img.setAttribute('y', u.g[1]); img.setAttribute('width', u.g[2]); img.setAttribute('height', u.g[3]); }
      img.setAttribute('href', u.u); changed = true;
    }
    if (img.style.display !== disp) img.style.display = disp;
    if (img.hasAttribute('opacity')) img.removeAttribute('opacity');
  }
  // 공간 전체 자리(투명 1px PNG 를 공간 bbox 로 늘림 — 보이는 것 없음). 런 이미지는 칠한 범위만큼만 놓지만, 지도 레이어의
  // bbox(그림자 필터 영역)·그리기 범위(섬 그룹 클립 래스터)는 바꾸기 전(런마다 공간 전체 크기 이미지)과 같아야 픽셀이 같다.
  // data-cols = 이 공간 런 색들 — 색 하나만 뽑는 추출(aeBrushBlob)도 그 색이 있는 공간이면 남긴다.
  if (n) {
    let bx = st.box;
    if (!bx) bx = st.box = el('image', { class: 'brushLayer brushBox', 'data-space': space, preserveAspectRatio: 'none', href: brushClearPng() });
    if (bx.parentNode !== parent || bx.nextSibling !== imgs[0]) { parent.insertBefore(bx, imgs[0]); changed = true; }
    const gk = [st.bbox.x, st.bbox.y, st.bbox.w, st.bbox.h].join(',');
    if (bx._bk !== gk) { bx._bk = gk; bx.setAttribute('x', st.bbox.x); bx.setAttribute('y', st.bbox.y); bx.setAttribute('width', st.bbox.w); bx.setAttribute('height', st.bbox.h); }
    const cols = [...new Set(st.runs.map((r) => (r.col || '').toUpperCase()))].join(',');
    if (bx.getAttribute('data-cols') !== cols) bx.setAttribute('data-cols', cols);
  } else if (st.box && st.box.parentNode) { st.box.remove(); changed = true; }
  // 라이브 캔버스는 숨기지 않고 비우기만 한다 — 보였다 숨겼다 하면 레이어 구성이 바뀌어 지도(그림자 필터)를 통째로 다시 굽는다
  if (st.fo && !drawing) {
    if (st.liveDirty) { const c = st.fo.firstChild, x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); st.liveDirty = false; }
    st.liveAll = false;
    // 본토는 늘 붙여 둔다. 섬(인셋)은 확대 변환·클립 안이라 붙여 두면 섬 경계선 안티앨리어싱이 미세하게 달라져(화면만) 칠할 때만 보인다.
    const want = st.ok && space === 'main' ? '' : 'none';
    if (st.fo.style.display !== want) st.fo.style.display = want;
  }
  return changed;
}
let brushClear = null;
const brushClearPng = () => brushClear || (brushClear = (() => { const c = document.createElement('canvas'); c.width = 1; c.height = 1; return c.toDataURL(); })());   // 투명 1×1 PNG
// PNG 인코딩 일꾼(워커 2~3개) — 런 캔버스를 createImageBitmap(GPU 스냅샷, 읽어오기 없음)으로 넘기면 워커가
// OffscreenCanvas 에 그려 PNG data URL 로 돌려준다. 메인 스레드는 GPU 읽어오기·인코딩을 기다리지 않는다.
// 워커 하나 안에선 어차피 하나씩 인코딩되므로 큐로 돌리고, 취소된 작업은 건너뛴다(다음 갱신에 합쳐졌을 때).
const BRUSH_ENC_SRC = "const Q=[],X=new Set();let busy=false;" +
  "self.onmessage=(e)=>{const m=e.data;if(m.cancel){for(const i of m.cancel)X.add(i);return;}Q.push(m);pump();};" +
  "async function pump(){if(busy)return;busy=true;while(Q.length){const m=Q.shift();if(X.delete(m.id)){m.bmp.close();continue;}let url=null;" +
  "try{const oc=new OffscreenCanvas(m.bmp.width,m.bmp.height);oc.getContext('2d').drawImage(m.bmp,0,0);m.bmp.close();" +
  "url=new FileReaderSync().readAsDataURL(await oc.convertToBlob({type:'image/png'}));}catch(err){}" +
  "self.postMessage({id:m.id,url});}X.clear();busy=false;}";
let brushEncWs = null, brushEncSeq = 0;   // 워커들(null=아직 안 만듦, false=못 씀 → toBlob)
const brushEncCb = new Map();             // 작업 id -> { done, w }
function brushEncoders() {
  if (brushEncWs !== null) return brushEncWs;
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') throw new Error('no worker');
    const src = URL.createObjectURL(new Blob([BRUSH_ENC_SRC], { type: 'text/javascript' }));
    const n = Math.max(1, Math.min(3, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1));
    const ws = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(src);
      w.busy = 0;
      w.onmessage = (e) => { const j = brushEncCb.get(e.data.id); if (!j) return; brushEncCb.delete(e.data.id); w.busy--; j.done(e.data.url); };
      w.onerror = () => brushEncDead();
      ws.push(w);
    }
    brushEncWs = ws;
  } catch (_) { brushEncWs = false; }
  return brushEncWs;
}
// 워커가 죽으면 이후엔 toBlob. 기다리던 작업은 모두 null 로 끝낸다(부른 쪽이 toDataURL 로 대신 — 갱신이 멈춰 있지 않게).
function brushEncDead() {
  const ws = brushEncWs;
  brushEncWs = false;
  if (ws) for (const w of ws) { try { w.terminate(); } catch (_) {} }
  const jobs = [...brushEncCb.values()];
  brushEncCb.clear();
  for (const j of jobs) j.done(null);
}
// 캔버스 → PNG data URL (비동기). 실패하면 done(null) — 부른 쪽이 toDataURL 로 대신한다. 작업 id 를 돌려준다(취소용).
function brushEncode(cv, done) {
  const id = ++brushEncSeq, ws = brushEncoders();
  if (ws) {
    const w = ws.reduce((a, b) => (b.busy < a.busy ? b : a));   // 가장 한가한 워커
    const job = { done, w };
    w.busy++;
    brushEncCb.set(id, job);
    const fail = () => { if (brushEncCb.get(id) !== job) return; brushEncCb.delete(id); w.busy--; done(null); };
    createImageBitmap(cv).then((bmp) => {
      if (brushEncCb.get(id) !== job) { bmp.close(); return; }   // 그새 취소됐거나 워커가 죽었다(그땐 이미 끝냄)
      try { w.postMessage({ id, bmp }, [bmp]); } catch (_) { try { bmp.close(); } catch (e) {} fail(); }
    }, fail);
    return id;
  }
  cv.toBlob((blob) => {
    if (!blob) { done(null); return; }
    const fr = new FileReader();
    fr.onload = () => done(fr.result);
    fr.onerror = () => done(null);
    fr.readAsDataURL(blob);
  }, 'image/png');
  return id;
}
// 인코딩 작업 취소 — 결과는 버리고, 워커 큐에 남은 것은 건너뛰게 한다
function brushEncCancel(ids) {
  const by = new Map();
  for (const id of ids) {
    const j = brushEncCb.get(id);
    if (!j) continue;
    brushEncCb.delete(id); j.w.busy--;
    (by.get(j.w) || by.set(j.w, []).get(j.w)).push(id);
  }
  for (const [w, list] of by) { try { w.postMessage({ cancel: list }); } catch (_) {} }
}
// 바뀐 런만 PNG(data URL)로 — 인코딩은 워커(메인 스레드 밖). 다 되면 한 번에 바꿔 끼운다(그동안은
// 라이브 캔버스가 새 그림을 보여 준다). 진행 중인 갱신이 있으면 기다리지 않고 취소해 이번 것에 합친다:
// 받아 둔 PNG 는 그대로 쓰고, 아직 안 됐거나 다시 바뀐 런만 (다시) 인코딩한다.
let brushPub = null;
function brushPublish() {
  const old = brushPub && !brushPub.done ? brushPub : null;
  let dirty = false;
  for (const st of Object.values(brushRT)) { for (const r of st.runs) if (r.dirty) { dirty = true; break; } if (dirty) break; }
  if (old && !dirty) return;   // 진행 중인 갱신이 지금 런 그대로 — 그걸 기다린다
  const pub = brushPub = { items: [], urls: new Map(), spaces: new Set(), jobs: [], done: false };
  const had = old ? new Set(old.items.map((it) => it[0])) : null;
  if (old) { old.done = true; brushEncCancel(old.jobs); for (const sp of old.spaces) pub.spaces.add(sp); }
  const todo = [];
  for (const st of Object.values(brushRT)) for (const r of st.runs) {
    if (r.dirty) r.dirty = false;
    else if (!(had && had.has(r))) continue;
    else if (old.urls.has(r)) { pub.urls.set(r, old.urls.get(r)); pub.items.push([r, st]); pub.spaces.add(st.space); continue; }
    pub.items.push([r, st]); pub.spaces.add(st.space); todo.push([r, st]);
  }
  if (!todo.length) { brushPubApply(pub); return; }
  let left = todo.length;
  for (const [r, st] of todo) {
    const g = brushGeo(st, r.o);
    pub.jobs.push(brushEncode(r.cv, (url) => {
      if (pub.done) return;
      pub.urls.set(r, { u: url || r.cv.toDataURL(), g });
      if (--left === 0) brushPubApply(pub);
    }));
  }
}
// 진행 중인 이미지 갱신을 지금 끝낸다(남은 런은 toDataURL) — 추출·애니 프레임처럼 최종 PNG 가 꼭 있어야 할 때만 부른다.
function brushFinalize() {
  const pub = brushPub;
  if (!pub || pub.done) return;
  brushEncCancel(pub.jobs);
  for (const [r, st] of pub.items) if (!pub.urls.has(r)) pub.urls.set(r, { u: r.cv.toDataURL(), g: brushGeo(st, r.o) });
  brushPubApply(pub);
}
function brushPubApply(pub) {
  if (pub.done) return;
  pub.done = true;
  if (brushPub === pub) brushPub = null;
  let changed = pub.items.length > 0;
  for (const st of Object.values(brushRT)) changed = brushSyncImgs(st, pub.urls) || changed;
  if (changed) bumpMapContent();   // 틸트 미리보기 캔버스도 다시 굽게
}
// 그 공간 런 이미지가 아직 옛 그림인가(새 PNG 인코딩 중)
const brushStale = (space) => !!(brushPub && !brushPub.done && brushPub.spaces.has(space));
