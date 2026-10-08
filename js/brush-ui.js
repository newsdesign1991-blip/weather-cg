/* [모듈] js/brush-ui.js — 브러쉬 화면·입력: renderBrush, 라이브 캔버스·스포이드, 시도 영역 선택, 칠하기 드래그(startBrush), 좌표 변환(projLL·xyToLonLat·insetBBox) */
'use strict';
// 획 목록 → 화면. 되돌리기·불러오기·지우기·지도종류 바뀜 후, 그리고 renderAll 마다 불린다 — 획이 그대로면 할 일 없음.
// stroked = 방금 손 뗀 획의 공간(그 공간 라이브 캔버스는 이미 새 획을 보이고 있다).
function renderBrush(stroked) {
  if (brushStroke || brushGpu.lost) return;   // 드래그 중엔 손 뗄 때 한 번에 · GPU 복구 중엔 복구 뒤 처음부터
  const by = {};
  for (const s of brushStrokes()) (by[s.space || 'main'] ||= []).push(s);
  const changed = [];
  for (const space of brushSpaceKeys()) {
    const strokes = by[space] || [];
    if (!strokes.length && !brushRT[space]) continue;   // 획도 캐시도 없는 공간은 건드리지 않는다
    const prev = brushRT[space] && brushRT[space].runs;
    const st = brushStateOf(space);   // 지도 종류·존이 바뀌었으면 여기서 런을 비운다
    if (!st.ok) { brushResetRuns(st); continue; }
    if (st.imgs.some((im) => !im.isConnected)) { for (const im of st.imgs) im.remove(); st.imgs.length = 0; for (const r of st.runs) r.dirty = true; }   // 누가 이미지를 떼어 냈으면 다시 붙인다
    const stale = st.imgs.length > 0;   // 화면에 이미 런 이미지가 있다(새 PNG 전까지 옛 그림) — 처음 굽기(부팅)엔 가릴 옛 그림이 없다
    if ((brushReconcile(st, strokes) || st.runs !== prev) && stale && space !== stroked) changed.push(st);
    if (space === 'main' && st.runs.length && !st.fo) brushLiveOf(st);   // 본토 라이브 캔버스를 미리 붙여 둔다(첫 획 때 레이어 구성이 바뀌어 지도를 다시 굽지 않게)
  }
  brushPublish();
  // 새 PNG 를 기다리는 동안 화면이 옛 그림이면(되돌리기·지도 종류·불러오기) — 라이브 캔버스에 지금 런들을 쌓아 바로 맞춘다
  const pub = brushPub;
  if (pub && !pub.done) for (const st of changed) { pub.spaces.add(st.space); brushShowRuns(st); }
}
// 라이브 캔버스에 지금 런들을 쌓아 보이고 런 이미지는 숨긴다(GPU drawImage 몇 번) — 런 이미지가 옛 그림일 때 화면을 바로 맞춘다.
// 새 PNG 가 끼워지면(brushSyncImgs) 이미지를 다시 보이고 라이브는 비운다.
function brushShowRuns(st) {
  const fo = brushLiveOf(st);
  if (!fo) return;
  const c = fo.firstChild, x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, c.width, c.height);
  for (const r of st.runs) if (r.cv && r.box) x.drawImage(r.cv, r.o[0], r.o[1]);
  for (const im of st.imgs) if (im.style.display !== 'none') im.style.display = 'none';
  if (fo.style.display) fo.style.display = '';
  st.liveDirty = true; st.liveAll = true;
}
// 라이브(드래그 중) 캔버스 — 그 공간 bbox에 <foreignObject><canvas>. 런 이미지들 위(인셋은 경계선 아래)에 둔다.
function brushLiveOf(st) {
  const space = st.space, parent = brushParent(space);
  if (!parent) return null;
  let fo = st.fo;
  if (!fo) {
    fo = st.fo = el('foreignObject', { class: 'brushLayer brushLive', 'data-space': space });
    const cv = brushWatch(document.createElement('canvas'));
    cv.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
    fo.append(cv);
  }
  const cv = fo.firstChild;
  if (cv.width !== st.W) cv.width = st.W;
  if (cv.height !== st.H) cv.height = st.H;
  const bk = [st.bbox.x, st.bbox.y, st.bbox.w, st.bbox.h].join(',');
  if (fo._bk !== bk) { fo._bk = bk; fo.setAttribute('x', st.bbox.x); fo.setAttribute('y', st.bbox.y); fo.setAttribute('width', st.bbox.w); fo.setAttribute('height', st.bbox.h); }
  const anchor = space === 'main' ? null : parent.querySelector('[data-zoneline]');
  if (fo.parentNode !== parent || fo.nextSibling !== anchor) parent.insertBefore(fo, anchor);
  return fo;
}
// 스포이드 — 그 픽셀의 런들을 1×1 캔버스에 쌓아 읽는다(런 캔버스에 getImageData 를 안 해서 GPU 가속 유지).
let brushPick = null, brushPickX = null;
function brushPixelAt(st, px, py) {
  if (!brushPick) { brushPick = document.createElement('canvas'); brushPick.width = 1; brushPick.height = 1; brushPickX = brushPick.getContext('2d', { willReadFrequently: true }); }
  brushPickX.clearRect(0, 0, 1, 1);
  for (const r of st.runs) {
    const o = r.o;
    if (!o || px < o[0] || py < o[1] || px >= o[0] + o[2] || py >= o[1] + o[3]) continue;   // 그 런 캔버스 밖 = 투명
    brushPickX.drawImage(r.cv, px - o[0], py - o[1], 1, 1, 0, 0, 1, 1);
  }
  return brushPickX.getImageData(0, 0, 1, 1).data;
}
// 화면좌표 -> 그 공간의 로컬좌표 (inv: 드래그 동안 재사용하는 역행렬 — 점마다 getScreenCTM(강제 레이아웃) 안 부르게)
function toSpaceLocal(e, space, inv) {
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  const r = p.matrixTransform(inv || brushGroup(space).getScreenCTM().inverse());
  return [r.x, r.y];
}
// 그 공간의 로컬 -> 캔버스(1920) 배율 (반지름 환산용)
function brushLocalScale(space) {
  const g = brushGroup(space);
  const m = svg.getScreenCTM().inverse().multiply(g.getScreenCTM());
  return Math.hypot(m.a, m.b) || 1;
}

let brushErase = false;              // 지우개 브러쉬 토글
let brushRegions = new Set();        // 선택된 시도 영역 key들 (space::sido)
const brushSelEls = new Map();       // 선택 강조 path들 (key -> [path]) — 고른 시도만 붙였다 뗀다
let brushStroke = null;              // 드래그 중인 획(손 떼면 null)
// SHIFT+클릭 = 그 존이 속한 '시도'를 통째로 선택/해제 (작은 시군 조각 하나가 아니라)
function toggleBrushRegion(zoneEl) {
  const key = regionKey(zoneEl.dataset.inset || 'main', zoneEl.dataset.id);
  if (brushRegions.has(key)) brushRegions.delete(key); else brushRegions.add(key);
  markBrushRegions(key);   // 그 시도 강조만 붙이거나 뗀다(나머지는 그대로)
  status(brushRegions.size ? `영역 ${brushRegions.size}곳 선택 — 이제 클릭·드래그로 칠하세요` : '영역 선택 없음', true);
}
// 선택 강조를 '면'으로 — 시군마다 테두리를 긋지 않고, 선택된 존 위에 반투명 파란 면을 덮는다.
// (테두리 방식은 시도 안의 모든 시군 경계가 밝게 강조돼 지저분했다.) only = 그 key 만 다시(없으면 전부).
function markBrushRegions(only) {
  if (only == null) { for (const e of document.querySelectorAll('.brushSelHi')) e.remove(); brushSelEls.clear(); }
  else { for (const e of brushSelEls.get(only) || []) e.remove(); brushSelEls.delete(only); }
  for (const [id, arr] of zoneEls) for (const { el: ze, inset } of arr) {
    const key = regionKey(inset || 'main', id);
    if ((only != null && key !== only) || !brushRegions.has(key)) continue;
    const d = ze.getAttribute('d'); if (!d || !ze.parentNode) continue;
    const hi = el('path', { class: 'brushSelHi', d });
    ze.parentNode.appendChild(hi);   // 같은 부모라 좌표계·변형 그대로
    (brushSelEls.get(key) || brushSelEls.set(key, []).get(key)).push(hi);
  }
}
function clearBrushRegions() { brushRegions.clear(); markBrushRegions(); }
// 그 공간에 선택된 시도 key들
function brushKeysIn(space) { return [...brushRegions].filter((k) => k.startsWith(space + '::')); }
// 마우스 위치가 어느 공간인지 (인셋 박스 안이면 그 인셋, 아니면 본토). 존 밖(바다)에서 칠 시작할 때 쓴다.
// 커서 좌표 아래에서 '가장 위 존'을 찾는다 (브러쉬 그림·라벨 등이 겹쳐도 아래 존을 집게).
function zoneUnder(e) {
  for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
    const z = el.closest && el.closest('.zone');
    if (z) return z;
  }
  return null;
}
function brushSpaceAt(e) {
  if (curStyle().noInsets) return 'main';   // 인셋 없는 지도(서울·특보+해상): 숨은 인셋 박스가 본토 칠을 가로채지 않게
  const p = toUser(e);
  for (const key of Object.keys(S.insets)) {
    if (!S.insets[key].show) continue;
    const [bx, by, bw, bh] = S.insets[key].box;
    if (p.x >= bx && p.x <= bx + bw && p.y >= by && p.y <= by + bh) return key;
  }
  return 'main';
}
// 손 뗀 뒤 저장은 잠깐 뒤 한 번(연달아 칠하면 묶임). 드래그 중이면 끝난 뒤로 미룬다.
let _brushSaveT = 0;
function brushSaveSoon() {
  clearTimeout(_brushSaveT);
  _brushSaveT = setTimeout(() => { _brushSaveT = 0; if (brushStroke) brushSaveSoon(); else saveWork(); }, 400);
}
let brushStrokeEnd = null, brushStrokePid = null;   // 칠하는 중인 획을 끝내는 함수·그 포인터(손 뗌을 놓쳤을 때 대비)
function startBrush(e, keys, space, erase) {
  if (brushStroke) {
    if (!brushStrokeEnd || e.pointerId !== brushStrokePid) return;   // 다른 손가락 — 칠하는 중엔 무시
    brushStrokeEnd();   // 같은 포인터가 다시 눌렸다 = 앞 획의 손 뗌(pointerup)을 놓쳤다 → 앞 획을 끝내고 새로 시작
  }
  renderBrush();     // 캐시를 획 목록에 맞춘다 — 보통 이미 맞아서 할 일 없음(앞 획 PNG 인코딩은 기다리지 않는다)
  const st = brushStateOf(space);
  if (!st.ok) return;
  const fo = brushLiveOf(st);
  if (!fo) return;
  const g = brushGroup(space);
  // 드래그 동안 화면→로컬 변환 재사용(점마다 getScreenCTM 강제 레이아웃 없이). 지도·인셋·보기가 바뀌면(방향키·휠·창 크기) 다시 구한다.
  let inv = g.getScreenCTM().inverse(), rev = brushViewRev;
  const r = Math.max(1, S.brush.size / brushLocalScale(space));   // 화면(캔버스) px -> 그 공간 로컬 단위
  const s = { space, keys: keys.slice(), col: activeColor, r, op: S.brush.op, soft: S.brush.soft, erase: !!erase, dabs: [] };
  const D = fo.firstChild, dx = D.getContext('2d');
  // 지우개이거나 이 공간 런 이미지가 아직 옛 그림이면(앞 획 PNG 인코딩 중) 라이브 캔버스에 지금 런들을 쌓아 보이고 이미지는 숨긴다.
  // 지우개는 거기서 바로 파내고(손 떼면 런마다 같은 점으로 파낸다), 색 획은 그 위에 얹는다.
  if (s.erase || brushStale(space)) brushShowRuns(st);
  else { dx.setTransform(1, 0, 0, 1, 0, 0); dx.globalCompositeOperation = 'source-over'; dx.clearRect(0, 0, D.width, D.height); st.liveAll = false; }
  // 색 획: 라이브 캔버스엔 이 획 점만(앞 런 이미지는 그대로 보이고 그 위에 얹혀 보인다 — 바꾸기 전 미리보기와 같은 모습).
  // 손 떼면 같은 점을 런 캔버스에 찍는다(처음부터 굽기와 같은 계산 → 다시 열어도 픽셀이 같다).
  const gd = brushSetup(dx, st, keysPath2D(s.keys, space));
  if (fo.style.display) fo.style.display = '';
  st.liveDirty = true;
  const pid = e.pointerId;
  const add = (ev) => {
    if (!inv || rev !== brushViewRev) { inv = g.getScreenCTM().inverse(); rev = brushViewRev; }
    const [lx, ly] = toSpaceLocal(ev, space, inv);
    const d = s.dabs, last = d[d.length - 1];
    if (!last || Math.hypot(lx - last[0], ly - last[1]) > r * 0.28) {
      d.push([lx, ly]);
      brushDab(gd, lx, ly, r, s.col, s.op, s.soft, s.erase);
    }
  };
  try { add(e); } catch (err) { brushEnd(gd); brushSyncImgs(st, null); throw err; }   // 첫 점에서 실패하면 칠하기 상태로 남지 않게(라이브 비우고 이미지 다시 보이기)
  brushStroke = s; brushStrokePid = pid;
  const mv = (ev) => { if (ev.pointerId === pid) add(ev); };
  const reinv = () => { inv = null; };
  // 손 뗌 — pointerup 말고도 pointercancel(터치를 브라우저가 가져감)·창 포커스 잃음에서도 끝낸다(안 그러면 다음 칠·저장·되돌리기가 막힌다)
  const up = (ev) => {
    if (ev && ev.pointerId !== undefined && ev.pointerId !== pid) return;   // 다른 손가락이 뗀 것
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('blur', up);
    window.removeEventListener('wheel', reinv, true);
    window.removeEventListener('resize', reinv);
    window.removeEventListener('keydown', reinv, true);
    brushEnd(gd);
    if (s.dabs.length) { pushUndo(); brushStrokes().push(s); }   // 되돌리기 기록은 손 뗄 때(=누르기 전 상태 그대로)
    brushStroke = null; brushStrokeEnd = null; brushStrokePid = null;
    renderBrush(space);   // 이 획만 런에 더하고(증분) 바뀐 런만 다시 PNG(워커) — 라이브 캔버스가 그동안 새 획을 보인다
    brushSaveSoon();
    status(s.erase ? '브러쉬 지움' : '브러쉬 덧칠', true);
  };
  brushStrokeEnd = up;
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('blur', up);
  window.addEventListener('wheel', reinv, true);
  window.addEventListener('resize', reinv);
  window.addEventListener('keydown', reinv, true);
}

function projLL(lon, lat) {
  const { cx0, cy0, scale } = MAP.proj;
  const mx = (lon * Math.PI) / 180;
  const my = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [(mx - cx0) * scale, -(my - cy0) * scale];
}
// 화면(캔버스) 좌표 -> 경위도 (projLL + 지도 변환의 역). 산을 손으로 옮긴 위치를 프리셋 앵커로 되돌릴 때.
function xyToLonLat(x, y) {
  const { cx0, cy0, scale } = MAP.proj;
  const lx = (x - S.map.x) / S.map.s, ly = (y - S.map.y) / S.map.s;
  const mx = lx / scale + cx0, my = cy0 - ly / scale;
  const lon = (mx * 180) / Math.PI;
  const lat = ((2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180) / Math.PI;
  return { lon: +lon.toFixed(4), lat: +lat.toFixed(4) };
}

function insetBBox(key) {
  const zs = curZones().filter((z) => z.inset === key);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const z of zs) {
    x0 = Math.min(x0, z.bbox[0]); y0 = Math.min(y0, z.bbox[1]);
    x1 = Math.max(x1, z.bbox[2]); y1 = Math.max(y1, z.bbox[3]);
  }
  return [x0, y0, x1, y1];
}
