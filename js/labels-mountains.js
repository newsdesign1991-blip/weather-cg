/* [모듈] js/labels-mountains.js — 수치 라벨(글자·글래스·지시선), 칠한 색 계열 바꾸기·자동 라벨, 산 표시, 선택 상자, renderAll */
'use strict';

// 라벨 하나. 직접 추가하는 것과 색 따라 자동 생성하는 것이 같은 기본값을 쓰도록 여기 모아둔다.
// 굵기 500(Medium) — 800은 방송 화면에서 너무 두껍다.
const newLabel = (o) => Object.assign({
  id: 'x' + seq++, txt: '입력', title: '', titleRatio: 0.75, divider: 1, x: 780, y: 600,
  fill: activeColor, txtCol: '#FFFFFF', stroke: '#FFFFFF', strokeW: 1.5,
  size: 40, w: 500, track: -1, padX: 20, padY: 12, radius: 0,
  fillGrad: 0, fill2: '', strokeGrad: 0, stroke2: '', gradAngle: 90, fillOp: 1, glass: 0, glassBlur: 6,
  style: 'plain',   // 'plain'=현재 박스 / 'leader'=태풍식 지시선+앵커원
}, o);

// 전체 크기 배율. 라벨은 x,y가 '중심'이라 크기만 키우면 제자리에서 커진다.
// 배율은 그릴 때만 곱한다 — 개별 편집칸에는 원래 숫자가 그대로 보여야 헷갈리지 않는다.
const labK = () => (S.labScale == null ? 100 : S.labScale) / 100;
const mtnK = () => (S.mtnScale == null ? 100 : S.mtnScale) / 100;

// 라벨 박스 한 개(rect + 글자 + 구분선)를 g에 채우고 rect 크기를 맞춘다. {w,h} 반환.
// 노말 라벨(renderLabels)과 태풍 라벨(typhoonLabelEl)이 '똑같은' 리치 렌더를 공유한다.
// ⚠ g는 호출 전에 이미 DOM(레이어)에 붙어 있어야 한다 — 글자 getBBox 측정에 필요.
// 부분 서식 — b.txt를 글자별 {c,col,w} 배열로 펼친다(runs가 있으면 반영).
function labelCharAttrs(b) {
  const arr = Array.from(b.txt || '').map((c) => ({ c, col: undefined, w: undefined }));
  if (b.runs && b.runs.length) {
    let i = 0;
    for (const rn of b.runs) for (const ch of Array.from(rn.t || '')) { if (i < arr.length) { if (rn.col) arr[i].col = rn.col; if (rn.w != null) arr[i].w = rn.w; i++; } }
  }
  return arr;
}
// 글자별 배열 → 연속 같은 서식을 묶어 runs로. 서식이 하나도 없으면 null(=평문).
function labelRunsFromChars(arr) {
  const runs = []; let any = false;
  for (const ch of arr) {
    const last = runs[runs.length - 1];
    if (last && last.col === ch.col && last.w === ch.w) last.t += ch.c;
    else runs.push({ t: ch.c, col: ch.col, w: ch.w });
    if (ch.col || ch.w != null) any = true;
  }
  return any ? runs : null;
}
// 라벨 배경/테두리 그라디언트 정의(objectBoundingBox, 각도 지원). id는 라벨별 고유.
function mkLabelGrad(id, c1, c2, angle) {
  const rad = (angle == null ? 90 : angle) * Math.PI / 180, dx = Math.cos(rad), dy = Math.sin(rad);
  const grad = el('linearGradient', { id, x1: (0.5 - dx / 2).toFixed(4), y1: (0.5 - dy / 2).toFixed(4), x2: (0.5 + dx / 2).toFixed(4), y2: (0.5 + dy / 2).toFixed(4) });
  grad.append(el('stop', { offset: '0', 'stop-color': c1 }));
  grad.append(el('stop', { offset: '1', 'stop-color': c2 }));
  return grad;
}
// 라벨 텍스트 폭 캐시 — getBBox(강제 레이아웃)는 비싸다. 텍스트/크기/굵기/자간이 같으면 재사용해
// 재생(매 프레임 재구성) 때 레이아웃 스래싱을 없앤다. 키에 내용 결정요소만 담아 자동 무효화.
const _labWCache = new Map();
function fillLabelBox(g, b, k) {
  const size = Math.max(1, b.size * k), padX = b.padX * k, padY = b.padY * k;
  const weight = b.w == null ? 500 : b.w;
  const track = (b.track == null ? -1 : b.track) * k;
  // 칠·테두리 색 — 그라디언트면 라벨별 linearGradient를 만들어 url로 참조.
  let fillVal = b.fill, strokeVal = b.stroke;
  if (b.fillGrad) { const gid = 'lgf_' + b.id; g.append(mkLabelGrad(gid, b.fill, b.fill2 || b.fill, b.gradAngle)); fillVal = 'url(#' + gid + ')'; }
  if (b.strokeGrad && b.strokeW > 0) { const gid = 'lgs_' + b.id; g.append(mkLabelGrad(gid, b.stroke, b.stroke2 || b.stroke, b.gradAngle)); strokeVal = 'url(#' + gid + ')'; }
  const r = el('rect', { fill: fillVal, 'fill-opacity': (b.fillOp == null ? 1 : b.fillOp), stroke: strokeVal, 'stroke-width': b.strokeW * k, rx: b.radius * k, ry: b.radius * k });
  g.append(r);
  const mkText = (txt, fs, fw, yc, runs) => {
    const t = el('text', {
      fill: b.txtCol, 'font-family': '"SUITE CG", "Malgun Gothic", sans-serif', 'font-size': fs,
      'font-weight': fw, 'text-anchor': 'middle', 'letter-spacing': track, y: yc,
      'dominant-baseline': 'central', 'xml:space': 'preserve',
    });
    if (runs && runs.length) {   // 부분 서식 — 구간별 tspan(색·굵기)
      for (const rn of runs) { const ts = el('tspan', {}); if (rn.col) ts.setAttribute('fill', rn.col); if (rn.w != null) ts.setAttribute('font-weight', rn.w); ts.textContent = rn.t; t.append(ts); }
    } else { t.textContent = txt; }
    g.append(t); return t;
  };
  const title = (b.title || '').trim();
  const _sig = title + '' + (b.txt || '') + '' + size + '' + weight + '' + track + '' + (b.titleRatio == null ? '' : b.titleRatio) + '' + (b.divider == null ? 1 : b.divider) + '' + (b.runs ? JSON.stringify(b.runs) : '');
  let cw, ch;
  if (title) {
    // 2단 라벨: 윗줄(지역명, 작게) + 아랫줄(내용, 크게) + 그 사이 구분선
    const tSize = Math.max(1, size * (b.titleRatio == null ? 0.75 : b.titleRatio));
    const showDiv = (b.divider == null ? 1 : b.divider);
    const gap = size * (showDiv ? 0.28 : 0.1);
    const H = tSize + gap + size;
    const tTit = mkText(title, tSize, Math.max(400, weight - 100), -(H / 2) + tSize / 2);
    const tNum = mkText(b.txt, size, weight, (H / 2) - size / 2, b.runs);
    let _cw = _labWCache.get(_sig);
    if (_cw == null) { _cw = Math.max(tTit.getBBox().width, tNum.getBBox().width); _labWCache.set(_sig, _cw); }
    cw = _cw; ch = H;
    if (showDiv) {
      const dy = (tSize - size) / 2;
      g.append(el('line', { x1: -cw / 2, x2: cw / 2, y1: dy, y2: dy,
        stroke: b.txtCol, 'stroke-width': Math.max(1.2, size * 0.035), 'stroke-opacity': 0.85, 'stroke-linecap': 'round' }));
    }
  } else {
    const t = mkText(b.txt, size, weight, 0, b.runs);
    let _cw = _labWCache.get(_sig);
    if (_cw == null) { _cw = t.getBBox().width; _labWCache.set(_sig, _cw); }
    cw = _cw; ch = size;
  }
  const w = cw + padX * 2, h = ch + padY * 2;
  r.setAttribute('x', -w / 2); r.setAttribute('y', -h / 2);
  r.setAttribute('width', w); r.setAttribute('height', h);
  // (유리 블러 기능 제거됨 — 더 이상 라벨 뒤 블러를 그리지 않는다)
  return { w, h };
}
// 드래그(박스 노드 재생성 없이 transform만 갱신)중 유리(뒷배경 블러) backdrop을 새 위치로 따라오게 한다.
// 유리는 g 안에서 (-x,-y)로 되돌려 루트좌표의 #L_bg를 그리고 카드 모양으로 클립하므로, 위치가 바뀌면 둘 다 갱신해야 한다.
function updateLabelGlass(node, x, y) {
  const gw = node.querySelector('g[clip-path]'); if (!gw) return;
  gw.setAttribute('transform', `translate(${-x} ${-y})`);
  const cr = node.querySelector('clipPath rect');
  const rect = [...node.children].find((c) => c.tagName === 'rect');
  if (cr && rect) { const w = +rect.getAttribute('width'), h = +rect.getAttribute('height'); cr.setAttribute('x', x - w / 2); cr.setAttribute('y', y - h / 2); }
}
function renderLabels() {
  const L = $('#L_labels');
  L.textContent = '';
  // 태풍 지도: 라벨은 태풍 레이어에서 지시선과 함께 그린다. 편집기 핸들러가 renderLabels를
  // 호출해도 태풍 라벨이 갱신되도록 여기서 renderTyphoon에 위임한다(renderTyphoon은 renderLabels를 부르지 않음).
  if (isTyphoon()) { if (!_inTyphoonRender) renderTyphoon(); return; }
  const k = labK();
  for (const b of S.labels) {
    if (b.off) continue; // 눈 꺼짐 — 화면에도 추출에도 안 나온다
    if (b.style === 'leader') { renderLeaderLabel(L, b, k); continue; }
    const g = el('g', { class: 'drag', 'data-kind': 'label', 'data-id': b.id, transform: `translate(${b.x} ${b.y})` });
    L.append(g);
    fillLabelBox(g, b, k);
  }
}
// 태풍식 '지시선' 스타일 라벨(시군구 지도용). 박스는 기존과 동일(드래그·편집 공유)하고,
// 앵커점(드래그 가능한 작은 원, 색=라벨색)에서 박스로 지시선을 뽑는다. typhoonLeaderGeom 재사용.
function renderLeaderLabel(L, b, k) {
  if (b.ax == null || b.ay == null) { b.ax = Math.round(b.x); b.ay = Math.round(b.y + 170); }   // 처음엔 박스 아래로
  const g = el('g', { class: 'drag', 'data-kind': 'label', 'data-id': b.id, transform: `translate(${b.x} ${b.y})` });
  L.append(g);
  const { w, h } = fillLabelBox(g, b, k);
  b._w = w; b._h = h;
  const geom = typhoonLeaderGeom(b.ax, b.ay, b.x, b.y, w, h);
  const line = el('path', { 'data-fleader-id': b.id, d: geom.d, stroke: b.stroke || '#FFFFFF', 'stroke-width': 2.4, fill: 'none', 'stroke-opacity': 0.92, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'pointer-events': 'none' });
  L.insertBefore(line, g);   // 지시선은 박스 아래
  // 앵커 원 — 선이 빈 곳에서 뽑히지 않게 시작점에 표시. 색은 라벨색(b.fill).
  const c = el('circle', { 'data-fanchor-id': b.id, cx: b.ax, cy: b.ay, r: 6, fill: b.fill, stroke: '#FFFFFF', 'stroke-width': 1.6, cursor: 'move' });
  L.append(c);
  c.addEventListener('pointerdown', (e) => startAnchorDrag(e, b));
}
// 지시선 라벨의 지시선/앵커를 가볍게 다시 그린다(박스 드래그·앵커 드래그 중).
function updateForecastLeaders() {
  for (const b of S.labels) {
    if (b.style !== 'leader' || b.off || b.ax == null) continue;
    const line = svg.querySelector(`[data-fleader-id="${b.id}"]`);
    const circle = svg.querySelector(`[data-fanchor-id="${b.id}"]`);
    if (line && b._w) line.setAttribute('d', typhoonLeaderGeom(b.ax, b.ay, b.x, b.y, b._w, b._h).d);
    if (circle) { circle.setAttribute('cx', b.ax); circle.setAttribute('cy', b.ay); circle.setAttribute('fill', b.fill); }
  }
}
// 앵커점 드래그(박스와 별개). dragLoop의 dx/dy는 라벨 좌표계와 같다.
function startAnchorDrag(e, b) {
  e.stopPropagation();
  if (e.button != null && e.button !== 0) return;
  select('label', b.id);
  pushUndo('lanchor');
  const ax0 = b.ax, ay0 = b.ay;
  dragLoop(e, (dx, dy) => { b.ax = Math.round(ax0 + dx); b.ay = Math.round(ay0 + dy); updateForecastLeaders(); });
}

// ===================== 칠한 색 계열 바꾸기 =====================
// 색 -> 그 색이 속한 계열의 몇 번째 단계인가 (0=연함, 7=진함)
const RAMP_POS = new Map();
for (const r of RAMPS) r.cols.forEach((c, i) => { if (!RAMP_POS.has(c.toUpperCase())) RAMP_POS.set(c.toUpperCase(), i); });

const lum = (h) => {
  const v = parseInt(h.slice(1), 16);
  return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
};

// 계열 표에 없는 색(직접 만든 색 등)은 밝기가 가장 비슷한 단계로 친다
function stepOf(col, target) {
  const p = RAMP_POS.get(col.toUpperCase());
  if (p != null) return p;
  const L = lum(col);
  let best = 0, bd = Infinity;
  target.cols.forEach((c, i) => { const d = Math.abs(lum(c) - L); if (d < bd) { bd = d; best = i; } });
  return best;
}

function swapRamp(name) {
  const target = RAMPS.find((r) => r.name === name);
  if (!target) return;
  const F = fills();
  const BS = brushStrokes().filter((s) => !s.erase && s.col);   // 브러쉬 덧칠 색도 칠한 색(autoLabels·애니와 같게)
  const src = [...new Set([...Object.values(F), ...Object.values(S.seaFills), ...BS.map((s) => s.col)].map((c) => c.toUpperCase()))];
  if (!src.length) { status('칠한 색이 없습니다 — 먼저 지도를 칠하세요', true); return; }

  // 연한 것부터 차례로 자리를 준다. 서로 다른 색이 같은 단계로 겹치면 한 칸씩 밀어
  // 구분을 살린다 — 두 종류로 칠해 놓은 게 한 색으로 합쳐지면 CG가 못 쓰게 된다.
  const withStep = src.map((c) => ({ c, s: stepOf(c, target) })).sort((a, b) => a.s - b.s);
  let last = -1;
  for (const w of withStep) { w.s = clamp(Math.max(w.s, last + 1), 0, 7); last = w.s; }
  const map = new Map(withStep.map((w) => [w.c, target.cols[w.s]]));
  const conv = (col) => map.get(col.toUpperCase()) || col;

  pushUndo();
  for (const id of Object.keys(F)) F[id] = conv(F[id]);
  for (const id of Object.keys(S.seaFills)) S.seaFills[id] = conv(S.seaFills[id]);
  // 라벨은 색으로 무슨 뜻인지 알려주는 것이라 같이 안 따라가면 지도와 어긋난다
  for (const b of S.labels) { const n = map.get((b.fill || '').toUpperCase()); if (n) b.fill = n; }
  for (const s of BS) s.col = conv(s.col);
  // 애니 트랙 key(=색)도 같이 — 안 그러면 번짐/블라인드가 새 색을 못 찾아 처음부터 꽉 차거나, 타임라인을 열 때 트랙이 통째로 지워진다(recolorBul과 같게)
  for (const tr of anim().tracks) if (tr.kind === 'fill' || tr.kind === 'brush') { const n = map.get((tr.key || '').toUpperCase()); if (n) tr.key = n.toUpperCase(); }
  for (const s of bulSpecs) { const n = map.get((s.col || '').toUpperCase()); if (n) s.col = n; }
  renderFills(); renderBrush(); renderLabels(); refreshPanel(); buildTimeline();
  renderBulList(); saveWork();
  status(`${name} 계열로 바꿨습니다 (${src.length}색)`, true);
}

function buildSwapBtns() {
  const box = $('#swapRamp');
  box.textContent = '';
  for (const r of RAMPS) {
    const b = document.createElement('button');
    b.textContent = r.name;
    // 버튼에 그 계열이 어떤 색인지 띠로 보여준다 — 이름만으론 무채색/노랑이 잘 안 그려진다
    b.style.borderBottom = '3px solid ' + r.cols[5];
    b.onclick = () => swapRamp(r.name);
    box.append(b);
  }
}

// 조각의 화면상 사각형을 루트 좌표(viewBox 0 0 1920 1080)로 되돌린다.
// 인셋은 그룹 transform으로 확대돼 있어서 getBBox()를 그대로 쓰면 엉뚱한 자리가 나온다.
function zoneRectRoot(node) {
  const b = node.getBBox();
  const m = svg.getScreenCTM().inverse().multiply(node.getScreenCTM());
  const pt = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(m); };
  const cs = [pt(b.x, b.y), pt(b.x + b.width, b.y), pt(b.x, b.y + b.height), pt(b.x + b.width, b.y + b.height)];
  const xs = cs.map((c) => c.x), ys = cs.map((c) => c.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

// 칠한 색 종류마다 라벨을 하나씩, 그 색이 몰려 있는 자리 근처에 만든다.
// 이미 그 색 라벨이 있으면 건드리지 않는다 — 두 번 눌러도 늘어나지 않게.
function autoLabels() {
  const F = fills();
  const byCol = new Map(); // 색 -> {wx, wy, area}  (면적으로 가중한 중심)
  const addPt = (col, cx, cy, a) => {   // 같은 색(대소문자·존/브러쉬 무관)은 하나로 합친다
    let key = col; for (const k of byCol.keys()) if (sameHex(k, col)) { key = k; break; }
    const g = byCol.get(key) || { wx: 0, wy: 0, area: 0 };
    g.wx += cx * a; g.wy += cy * a; g.area += a; byCol.set(key, g);
  };
  for (const [id, col] of Object.entries(F)) {
    const arr = zoneEls.get(id);
    if (!arr) continue;
    for (const { el: e } of arr) {
      const r = zoneRectRoot(e);
      const a = Math.max((r.x1 - r.x0) * (r.y1 - r.y0), 1);
      addPt(col, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, a);
    }
  }
  // 브러쉬로 칠한 색도 포함 — 획의 실제 칠한 점(dabs)을 루트 좌표로 옮겨 무게중심(붓 크기로 가중)
  for (const s of (typeof brushStrokes === 'function' ? brushStrokes() : [])) {
    if (s.erase || !s.dabs || !s.dabs.length) continue;
    const bg = brushGroup(s.space || 'main'); if (!bg) continue;
    let m; try { m = svg.getScreenCTM().inverse().multiply(bg.getScreenCTM()); } catch (e) { continue; }
    const p = svg.createSVGPoint(), w = Math.max(1, s.r || 4);
    for (const [x, y] of s.dabs) { p.x = x; p.y = y; const rp = p.matrixTransform(m); addPt(s.col, rp.x, rp.y, w); }
  }
  if (!byCol.size) { status('칠한 색이 없습니다 — 먼저 지도를 칠하세요', true); return; }

  const have = new Set(S.labels.map((b) => (b.fill || '').toUpperCase()));
  // 넓게 칠한 색부터 자리를 잡는다 (좁은 색이 밀려나는 게 덜 어색하다)
  const want = [...byCol.entries()]
    .filter(([col]) => !have.has(col.toUpperCase()))
    .sort((a, b) => b[1].area - a[1].area);
  if (!want.length) { status('칠한 색마다 라벨이 이미 있습니다', true); return; }

  pushUndo();
  const k = labK();
  const placed = S.labels.filter((b) => !b.off).map((b) => itemRect('label', b.id)).filter(Boolean);
  const added = [];
  for (const [col, g] of want) {
    const b = newLabel({ fill: col });
    // 글자가 '입력' 4글자 기준이라 폭을 대충 잡는다 — 겹침만 피하면 되니 정확할 필요는 없다
    const hw = (b.size * 1.2 + b.padX) * k, hh = (b.size / 2 + b.padY) * k;
    let x = clamp(Math.round(g.wx / g.area), hw + 8, 1920 - hw - 8);
    let y = clamp(Math.round(g.wy / g.area), hh + 8, 1080 - hh - 8);
    // 이미 놓인 라벨과 겹치면 아래로 밀어낸다
    const hits = (yy) => placed.some((r) => x - hw < r.x1 + 6 && x + hw > r.x0 - 6 && yy - hh < r.y1 + 6 && yy + hh > r.y0 - 6);
    for (let i = 0; i < 40 && hits(y); i++) y += hh * 2 + 8;
    if (y > 1080 - hh - 8) y = clamp(Math.round(g.wy / g.area), hh + 8, 1080 - hh - 8); // 끝까지 밀렸으면 포기하고 원위치
    b.x = x; b.y = y;
    S.labels.push(b);
    placed.push({ x0: x - hw, y0: y - hh, x1: x + hw, y1: y + hh });
    added.push(b);
  }
  renderLabels();
  sel = added.map((b) => ({ kind: 'label', id: b.id }));
  refreshPanel(); renderSel();
  status(`라벨 ${added.length}개 만듦 — 내용을 채우세요`, true);
}

// ===================== 산 표시 =====================
// 삼각형 하나. size = 밑변 폭, 높이는 그 0.78배.
// 좌표계는 밑변 가운데가 (0,0)이라 산을 키워도 발끝이 제자리에 붙어 있는다.
function mtnPath(size) {
  const w = size, h = size * 0.78;
  const p = (x, y) => `${(x * w).toFixed(2)} ${(y * h).toFixed(2)}`;
  return `M ${p(-0.5, 0)} L ${p(0, -1)} L ${p(0.5, 0)} Z`;
}

// ---- 산 빠른 배치 (강원 · 제주) ----
// 지도에 '고정(anchor)'해서 놓는다 — 지도를 옮기거나 크기를 바꾸면 산이 따라간다.
//  · 강원: 위경도 -> 본토 transform(translate(map.x,map.y) scale(map.s))으로 캔버스 좌표
//  · 제주: 제주 인셋 박스 중앙 (박스를 옮기면 같이 따라감)
// 손으로 끌면 앵커가 풀려 자유 위치가 된다.
// 강원은 태백산맥을 따라 큰 산 4개가 북동->남서로 계단처럼 겹쳐 선다 (사용자가 만든 산맥 모양).
// 제주는 인셋 박스 안에 하나. 각 산은 자기 위경도/인셋에 고정돼 지도를 따라간다.
const MTN_PRESETS = [
  { label: '강원', size: 90, anchors: [
      { lon: 128.15, lat: 37.93 },
      { lon: 128.38, lat: 37.70 },
      { lon: 128.60, lat: 37.47 },
      { lon: 128.80, lat: 37.24 },
  ] },
  { label: '제주', size: 71, anchors: [ { inset: 'jeju' } ] },
];
// 앵커 -> 현재 지도 기준 캔버스 좌표
function mtnAnchorXY(m) {
  if (!m.anchor) return { x: m.x, y: m.y };
  if (m.anchor.inset) {
    const c = S.insets[m.anchor.inset];
    // 밑변이 섬 한가운데보다 살짝 아래로 오게 (한라산이 섬 중앙에 자연스럽게 앉도록)
    if (c) { const [bx, by, bw, bh] = c.box; return { x: Math.round(bx + bw / 2 + (c.ox || 0)), y: Math.round(by + bh / 2 + (c.oy || 0) + bh * 0.16) }; }
  }
  if (m.anchor.lon != null) {
    const [lx, ly] = projLL(m.anchor.lon, m.anchor.lat);
    return { x: Math.round(S.map.x + lx * S.map.s), y: Math.round(S.map.y + ly * S.map.s) };
  }
  return { x: m.x, y: m.y };
}
function addMtnPreset(preset) {
  pushUndo();
  const added = [];
  for (const anc of preset.anchors) {
    const m = newMtn({ anchor: JSON.parse(JSON.stringify(anc)), size: preset.size });
    const a = mtnAnchorXY(m); m.x = a.x; m.y = a.y;
    (S.mtns ||= []).push(m); added.push(m);
  }
  renderMtns();
  sel = added.map((m) => ({ kind: 'mtn', id: m.id })); // 만든 산 전부 선택 (한 번에 옮기기 쉽게)
  refreshPanel(); renderSel();
  if (sel.length === 1) revealSecFor('mtn');
  status(`${preset.label} 산 ${added.length}개 추가 — 지도를 옮기면 따라갑니다`);
}
function buildMtnPresets() {
  const w = $('#mtnPresets');
  if (!w) return;
  w.textContent = '';
  for (const p of MTN_PRESETS) {
    const b = document.createElement('button');
    b.textContent = p.label;
    b.onclick = () => addMtnPreset(p);
    w.append(b);
  }
}

const newMtn = (o) => Object.assign({
  id: 'x' + seq++, x: 1200, y: 400, size: 34,
  // 테두리 — 산이 배경과 같은 색이어도 윤곽이 보이게. 기본은 흰색.
  col: '#FFFFFF', op: 90, stroke: '#FFFFFF', strokeW: 2,
  txt: '', txtSize: 22, txtCol: '#FFFFFF',
}, o);

function renderMtns() {
  bumpMapContent();   // 틸트 미리보기 캔버스도 다시 굽게
  const L = $('#L_mtn');
  L.textContent = '';
  const k = mtnK();
  for (const m of (S.mtns ||= [])) {
    if (m.off) continue;
    if (m.anchor) { const a = mtnAnchorXY(m); m.x = a.x; m.y = a.y; } // 앵커면 현재 지도 기준으로 위치 갱신 (지도 따라가기)
    const g = el('g', { class: 'drag', 'data-kind': 'mtn', 'data-id': m.id, transform: `translate(${m.x} ${m.y})` });
    const size = m.size * k;   // 전체 산 크기(%) 반영 — 제자리에서 커지고 작아진다
    // 이동 모드에서 잡기 쉽게 삼각형 bbox 전체를 투명 히트 영역으로. (삼각형과 같은 크기라 getBBox는 안 커진다)
    // 칠하기 모드에선 pointer-events:none 이라 빈 구석은 아래 지도로 통과한다.
    const hw = size / 2, hh = size * 0.78;
    g.append(el('rect', { class: 'mtnHit', x: -hw, y: -hh, width: size, height: hh, fill: 'transparent' }));
    const pa = { d: mtnPath(size), fill: m.col, 'fill-opacity': m.op / 100, 'fill-rule': 'nonzero' };
    // strokeW/stroke 가 없던 옛 산도 기본 테두리를 갖게 한다 (UI 기본값과 일치)
    const sw = m.strokeW == null ? 2 : m.strokeW, sc = m.stroke || '#FFFFFF';
    if (sw > 0) { pa.stroke = sc; pa['stroke-width'] = sw; pa['stroke-linejoin'] = 'round'; }
    g.append(el('path', pa));
    if (m.txt) {
      const ts = m.txtSize * k;
      const t = el('text', {
        fill: m.txtCol, 'font-family': '"SUITE CG", "Malgun Gothic", sans-serif', 'font-size': ts,
        'font-weight': 500, 'text-anchor': 'middle', 'letter-spacing': -0.5,
        y: ts + 2, 'xml:space': 'preserve',
      });
      t.textContent = m.txt;
      g.append(t);
    }
    L.append(g);
  }
}

// 선택된 것들 전체를 감싸는 사각형
function selBBox() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of sel) {
    const r = itemRect(s.kind, s.id);
    if (!r) continue;
    x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0);
    x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1);
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

function renderSel() {
  const L = $('#L_sel');
  L.textContent = '';
  if (!sel.length) return;
  const pad = 6;
  for (const s of sel) {
    const r = itemRect(s.kind, s.id);
    if (!r) continue;
    L.append(el('rect', { class: 'selbox', x: r.x0 - pad, y: r.y0 - pad, width: r.x1 - r.x0 + pad * 2, height: r.y1 - r.y0 + pad * 2 }));
  }
  // 크기 핸들. 하나만 골라도 나온다 — 숫자칸까지 가지 않고 바로 끌어서 키울 수 있게.
  const b = selBBox();
  if (!b) return;
  const m = 13;
  // 여러 개일 때만 전체를 감싸는 박스를 더 그린다 (하나면 점선 박스와 겹쳐서 지저분하다)
  if (sel.length > 1) {
    L.append(el('rect', { class: 'selGroup', x: b.x0 - m, y: b.y0 - m, width: b.x1 - b.x0 + m * 2, height: b.y1 - b.y0 + m * 2 }));
  }
  const g = el('g', { class: 'selGrip', transform: `translate(${b.x1 + m} ${b.y1 + m})` });
  g.append(el('circle', { r: 11 }), el('path', { class: 'gripArrow', d: 'M-4 4 L4 -4 M4 -4 L4 0 M4 -4 L0 -4' }));
  tip(g, sel.length > 1 ? '끌어서 선택한 것들 크기 조절' : '끌어서 크기 조절');
  L.append(g);
}

function renderAll() {
  bumpMapContent();
  renderBg(); renderShadow(); renderMapTransform(); renderInsets();
  renderBrush(); renderTexts(); renderLegend(); renderLabels(); renderMtns(); renderTyphoon(); renderSel(); renderVfScale();
  if (typeof tlContentChanged === 'function') tlContentChanged(true);   // 타임라인 행(레이어 계획) 확인 + 미리보기 중이면 그 시각 프레임 다시
}
