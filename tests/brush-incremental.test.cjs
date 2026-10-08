// 브러쉬 덧칠 — 증분 렌더(가볍게) 검사.
// index.html 의 브러쉬 구역(// ===== 브러쉬 덧칠 ===== ~ projLL 앞)을 그대로 떼어 와, 가짜 DOM·실수 픽셀 캔버스 위에서 돌린다.
//  · 바꾸기 전 renderBrush(런마다 레이어 → 앞 런 2번 파내기, 지우개는 런마다 점으로 파내기)를 이 파일에 기준으로 옮겨 두고
//    결과 런 캔버스가 픽셀(실수)까지 같은지 본다 — 같은 점·같은 순서·같은 파내기라 차이 0.
//    런 캔버스는 칠한 범위만큼 잘라 들므로(r.o) 공간 전체 크기로 펴서 비교한다.
//  · 한 획씩 더하기(증분) = 처음부터 굽기, 되돌리기(조각 복원) = 짧은 목록을 처음부터 굽기 — 픽셀·런 캔버스 범위까지 같아야 한다.
//  · 획이 그대로면 renderAll 이 불러도 그리기 0번.
//  · GPU 가 다시 시작돼 캔버스가 비면(contextlost → contextrestored) 저장 획에서 처음부터 다시 굽는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');

const html = appSource(path.join(__dirname, '..', 'index.html')).replace(/\r\n/g, '\n');
const fn = (name) => html.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0] || '';
const SEC_A = html.indexOf('// ===================== 브러쉬 덧칠 =====================');
const SEC_B = html.indexOf('\nfunction projLL(');
const SECTION = html.slice(SEC_A, SEC_B);

// ---- 가짜 DOM ----
class FakeEl {
  constructor(tag, attrs = {}) { this.tagName = tag; this.attrs = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)])); this.style = { display: '' }; this.children = []; this.parentNode = null; this.root = false; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
  get isConnected() { let n = this; while (n) { if (n.root) return true; n = n.parentNode; } return false; }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() { const p = this.parentNode; if (!p) return null; return p.children[p.children.indexOf(this) + 1] || null; }
  remove() { if (this.parentNode) { const c = this.parentNode.children; c.splice(c.indexOf(this), 1); this.parentNode = null; } }
  insertBefore(n, ref) { n.remove(); n.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; }
  append(...ns) { for (const n of ns) this.insertBefore(n, null); }
  querySelector() { return null; } querySelectorAll() { return []; }
  getBBox() { return this.bbox; }
  addEventListener(t, f) { ((this.ls ||= {})[t] ||= []).push(f); }
  fire(t) { for (const f of (this.ls && this.ls[t]) || []) f({ type: t, target: this }); }
}

// ---- 가짜 캔버스(실수, premultiplied RGBA) ----
let OPS = 0;   // 그리기 연산 수(clearRect·drawImage·fill)
class FakeCanvas extends FakeEl {
  constructor() { super('canvas'); this._w = 0; this._h = 0; this.px = new Float64Array(0); this._ctx = null; }
  get width() { return this._w; } set width(v) { this._w = v; this.px = new Float64Array(this._w * this._h * 4); }
  get height() { return this._h; } set height(v) { this._h = v; this.px = new Float64Array(this._w * this._h * 4); }
  getContext() { return this._ctx || (this._ctx = new FakeCtx(this)); }
  toBlob(cb) { cb(null); }
  toDataURL() { let h = 0; for (let i = 0; i < this.px.length; i++) h = (h * 31 + Math.round(this.px[i] * 1e6)) | 0; return 'data:fake,' + this._w + 'x' + this._h + ':' + h; }
}
const parseRgba = (s) => { const m = /rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)/.exec(s); return m.slice(1).map(Number); };
class FakeCtx {
  constructor(cv) { this.cv = cv; this.t = [1, 0, 0, 1, 0, 0]; this.clips = []; this.globalCompositeOperation = 'source-over'; this.fillStyle = null; this.stack = []; this.circle = null; }
  isContextLost() { return !!this.cv.lost; }
  save() { this.stack.push({ t: this.t.slice(), clips: this.clips.slice(), g: this.globalCompositeOperation, f: this.fillStyle }); }
  restore() { const s = this.stack.pop(); if (s) { this.t = s.t; this.clips = s.clips; this.globalCompositeOperation = s.g; this.fillStyle = s.f; } }
  setTransform(a, b, c, d, e, f) { this.t = [a, b, c, d, e, f]; }
  clip(p) { this.clips.push(p); }
  identity() { const t = this.t; assert.ok(t[0] === 1 && t[1] === 0 && t[2] === 0 && t[3] === 1 && t[4] === 0 && t[5] === 0, '픽셀 연산은 단위 변환에서'); }
  clearRect(x, y, w, h) { OPS++; this.identity(); const W = this.cv.width; for (let j = Math.max(0, y); j < Math.min(this.cv.height, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) this.cv.px.fill(0, (j * W + i) * 4, (j * W + i) * 4 + 4); }
  comp(o, s) {   // o: 대상 픽셀 오프셋, s: [r,g,b,a] premultiplied
    const p = this.cv.px, g = this.globalCompositeOperation;
    if (g === 'source-over') { const k = 1 - s[3]; for (let c = 0; c < 4; c++) p[o + c] = s[c] + p[o + c] * k; }
    else if (g === 'destination-out') { const k = 1 - s[3]; for (let c = 0; c < 4; c++) p[o + c] *= k; }
    else throw new Error('지원 안 하는 합성 ' + g);
  }
  drawImage(src, ...a) {
    OPS++; this.identity(); assert.equal(this.clips.length, 0, 'drawImage 는 클립 없이');
    let sx = 0, sy = 0, sw = src.width, sh = src.height, dx, dy;
    if (a.length === 2) [dx, dy] = a; else { [sx, sy, sw, sh, dx, dy] = a; assert.equal(a[6], sw); assert.equal(a[7], sh); }
    const SW = src.width, W = this.cv.width;
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const X = dx + i, Y = dy + j, SX = sx + i, SY = sy + j;
      if (X < 0 || Y < 0 || X >= W || Y >= this.cv.height || SX < 0 || SY < 0 || SX >= SW || SY >= src.height) continue;
      const so = (SY * SW + SX) * 4; const s = [src.px[so], src.px[so + 1], src.px[so + 2], src.px[so + 3]];
      if (s[3] === 0 && s[0] === 0) continue;
      this.comp((Y * W + X) * 4, s);
    }
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) { const g = { x: x1, y: y1, r: r1, stops: [] }; g.addColorStop = (t, c) => g.stops.push([t, parseRgba(c)]); return g; }
  beginPath() { this.circle = null; }
  arc(x, y, r) { this.circle = { x, y, r }; }
  fill() {
    OPS++;
    const { x: cx, y: cy, r } = this.circle, g = this.fillStyle, t = this.t, W = this.cv.width;
    // 장치 → 로컬(축 정렬 확대·이동만 쓴다)
    const i0 = Math.max(0, Math.floor((cx - r) * t[0] + t[4]) - 1), i1 = Math.min(W, Math.ceil((cx + r) * t[0] + t[4]) + 1);
    const j0 = Math.max(0, Math.floor((cy - r) * t[3] + t[5]) - 1), j1 = Math.min(this.cv.height, Math.ceil((cy + r) * t[3] + t[5]) + 1);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const lx = (i + 0.5 - t[4]) / t[0], ly = (j + 0.5 - t[5]) / t[3];
      const d = Math.hypot(lx - cx, ly - cy); if (d > r) continue;
      if (!this.clips.every((p) => p.has(lx, ly))) continue;
      const u = d / g.r; let col = g.stops[g.stops.length - 1][1];
      for (let k = 0; k < g.stops.length - 1; k++) { const [t0, c0] = g.stops[k], [t1, c1] = g.stops[k + 1]; if (u >= t0 && u <= t1) { const f = t1 > t0 ? (u - t0) / (t1 - t0) : 0; col = c0.map((v, q) => v + (c1[q] - v) * f); break; } }
      const a = col[3]; this.comp((j * W + i) * 4, [col[0] / 255 * a, col[1] / 255 * a, col[2] / 255 * a, a]);
    }
  }
}
// 존 path 대신 사각형 목록('R x y w h;...')
class FakePath {
  constructor(d) { this.rects = d ? d.split(';').filter(Boolean).map((s) => s.trim().split(/\s+/).slice(1).map(Number)) : []; }
  addPath(p) { this.rects.push(...p.rects); }
  has(x, y) { return this.rects.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh); }
}
function makeApp(zones) {
  const root = new FakeEl('svg'); root.root = true;
  const L_brush = new FakeEl('g'); root.append(L_brush);
  const zoneLineMain = new FakeEl('path'); zoneLineMain.bbox = { x: 0, y: 0, width: 40, height: 24 };
  const ids = { '#L_brush': L_brush, '#zoneLineMain': zoneLineMain, '#gMain': new FakeEl('g') };
  const zoneEls = new Map();
  const bboxOf = (d) => { const rs = new FakePath(d).rects; const x0 = Math.min(...rs.map((r) => r[0])), y0 = Math.min(...rs.map((r) => r[1])); return { x: x0, y: y0, width: Math.max(...rs.map((r) => r[0] + r[2])) - x0, height: Math.max(...rs.map((r) => r[1] + r[3])) - y0 }; };
  for (const [id, d] of Object.entries(zones)) zoneEls.set(id, [{ el: { getAttribute: () => d, getBBox: () => bboxOf(d) }, inset: null }]);
  const S = { style: 'sgg', insets: {}, brushByStyle: { sgg: [] } };
  const env = {
    S, zoneEls, svg: { querySelector: () => null, querySelectorAll: () => [] }, $: (s) => ids[s] || null,
    document: { createElement: (t) => (t === 'canvas' ? new FakeCanvas() : new FakeEl(t)) },
    el: (t, a) => new FakeEl(t, a), Path2D: FakePath, clamp01: (v) => (v < 0 ? 0 : v > 1 ? 1 : v),
    hex2rgb: (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)),
    brushStrokes: () => S.brushByStyle[S.style], bumpMapContent: () => {}, curStyle: () => ({}), toUser: () => ({}), activeColor: '#000000',
    pushUndo: () => {}, saveWork: () => {}, status: () => {},
  };
  const names = Object.keys(env);
  const api = new Function(...names, SECTION + '\nreturn { renderBrush, brushRT, brushApply, brushSig, brushRect, brushStateOf, brushReconcile, brushZonesChanged, brushGeo, brushGpu, BRUSH_UNDO_N, BRUSH_G };')(...names.map((k) => env[k]));
  return { ...api, S, L_brush };
}

// ---- 기준: 바꾸기 전 renderBrush 의 런 계산(같은 가짜 캔버스·같은 점 함수) ----
function referenceRuns(app, strokes) {
  const st = app.brushStateOf('main');
  const clipOf = (s) => { const p = new FakePath(''); for (const k of s.keys) for (const [id, d] of Object.entries(ZONES)) if ('main::' + id.split('/')[0] === k) p.addPath(new FakePath(d)); return p; };
  const setup = (cx, clip) => { cx.save(); cx.setTransform(st.K, 0, 0, st.K, -st.bbox.x * st.K, -st.bbox.y * st.K); cx.clip(clip); return cx; };
  const dab = (cx, x, y, r, col, op, soft, erase) => {   // = brushDab/brushGrad (바뀌지 않음)
    cx.save(); cx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    const a = erase ? 1 : op / 100, inner = Math.min(1, Math.max(0, 1 - soft / 100)) * 0.9, rgb = [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16));
    const g = cx.createRadialGradient(x, y, 0, x, y, r); const c = (al) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${al})`;
    g.addColorStop(0, c(a)); g.addColorStop(Math.min(1, Math.max(0, inner)), c(a)); g.addColorStop(1, c(0));
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); cx.restore();
  };
  const runs = [];
  for (let i = 0; i < strokes.length;) {
    const s0 = strokes[i];
    if (s0.erase) { for (const r of runs) { const g = setup(r.cv.getContext('2d'), clipOf(s0)); for (const [x, y] of s0.dabs) dab(g, x, y, s0.r, s0.col, s0.op, s0.soft, true); g.restore(); } i++; continue; }
    let j = i + 1;
    while (j < strokes.length && !strokes[j].erase && strokes[j].col.toUpperCase() === s0.col.toUpperCase()) j++;
    const cv = new FakeCanvas(); cv.width = st.W; cv.height = st.H;
    for (let k = i; k < j; k++) { const s = strokes[k]; const g = setup(cv.getContext('2d'), clipOf(s)); for (const [x, y] of s.dabs) dab(g, x, y, s.r, s.col, s.op, s.soft, false); g.restore(); }
    for (const r of runs) { const x = r.cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-out'; x.drawImage(cv, 0, 0); x.drawImage(cv, 0, 0); x.globalCompositeOperation = 'source-over'; }
    runs.push({ col: s0.col, cv }); i = j;
  }
  return runs;
}
const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
// 잘라 든 런 캔버스(r.o 자리)를 공간 전체 크기로 편다 — 범위 밖은 투명
const fullPx = (app, r) => {
  const st = app.brushRT.main, W = st.W, out = new Float64Array(W * st.H * 4), [ox, oy, w, h] = r.o;
  assert.equal(r.cv.width, w); assert.equal(r.cv.height, h);
  assert.ok(ox >= 0 && oy >= 0 && ox + w <= W && oy + h <= st.H, '런 캔버스 범위는 공간 안');
  for (let j = 0; j < h; j++) out.set(r.cv.px.subarray(j * w * 4, (j + 1) * w * 4), ((oy + j) * W + ox) * 4);
  return out;
};
const sameRuns = (app, ref, tol, msg) => {
  const runs = app.brushRT.main.runs;
  assert.equal(runs.length, ref.length, msg + ': 런 개수');
  runs.forEach((r, k) => { assert.equal(r.col.toUpperCase(), ref[k].col.toUpperCase(), msg + ': 런 색'); const d = maxDiff(fullPx(app, r), ref[k].cv.px); assert.ok(d <= tol, `${msg}: 런 ${k} 픽셀 차 ${d}`); });
};
const snapRuns = (app) => app.brushRT.main.runs.map((r) => ({ col: r.col, o: r.o.join(','), px: fullPx(app, r) }));

// 존 4개(경기 2·강원 2) — 사각형 클립. 로컬 0~40 × 0~24, bbox 패딩 30 → 캔버스는 작게(K=min(3,1400/..)=3이면 너무 크니 bbox 를 키운다)
const ZONES = { '경기/a': 'R 0 0 20 12', '경기/b': 'R 0 12 20 12', '강원/c': 'R 20 0 20 12', '강원/d': 'R 20 12 20 12' };
let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const mkStroke = (col, keys, erase, n = 5) => {
  let x = 4 + rnd() * 32, y = 3 + rnd() * 18; const dabs = [];
  for (let i = 0; i < n; i++) { dabs.push([x, y]); x += (rnd() - 0.5) * 6; y += (rnd() - 0.5) * 6; }
  return { space: 'main', keys, col, r: 3 + rnd() * 5, op: 55, soft: 70, erase: !!erase, dabs };
};
const K1 = ['main::경기'], K2 = ['main::경기', 'main::강원'];
const LIST = [mkStroke('#E5231E', K1), mkStroke('#e5231e', K2), mkStroke('#2E6FB0', K2), mkStroke('#2E6FB0', K1), mkStroke('#000000', K2, true),
  mkStroke('#E5231E', K2), mkStroke('#3DAA5C', K1), mkStroke('#3DAA5C', K2, true), mkStroke('#3DAA5C', K2), mkStroke('#E5231E', K1)];

test('소스: 증분·조각 되돌리기·라이브 foreignObject·워커 인코딩 구조', () => {
  assert.ok(SEC_A > 0 && SEC_B > SEC_A, '브러쉬 구역');
  assert.match(fn('renderBrush'), /brushReconcile\(st, strokes\)/);
  assert.match(fn('renderBrush'), /if \(brushStroke \|\| brushGpu\.lost\) return;/);   // 드래그 중·GPU 복구 중엔 다시 굽지 않는다
  assert.doesNotMatch(fn('renderBrush'), /brushFinalize\(\)/);   // 앞 PNG 인코딩을 기다리지 않는다(다음 갱신에 합친다)
  assert.doesNotMatch(fn('startBrush'), /brushFinalize\(\)/);
  assert.match(fn('brushApply'), /bk\.m\.get\(j\)/);   // 앞 런은 '이 런 전' 백업으로 되돌린 뒤
  assert.match(fn('brushApply'), /x\.drawImage\(src, [^;]+;\s*x\.drawImage\(src,/);   // 지금 런 전체로 2번 파내기
  assert.match(fn('brushApply'), /dabs\(r, true\)/);   // 지우개는 런마다 점으로
  assert.match(fn('brushSyncImgs'), /'data-run'/);
  assert.match(fn('brushSyncImgs'), /data-col/);
  assert.match(fn('brushLiveOf'), /foreignObject/);
  assert.doesNotMatch(SECTION, /toDataURL\(\)\);\s*img\.style\.display = ''/);   // 드래그 중 프레임마다 PNG 없음
  assert.match(fn('startBrush'), /brushStroke = null;[^\n]*\n\s*renderBrush\(space\);/);   // 손 떼면 그 획만 증분
  assert.match(fn('startBrush'), /addEventListener\('pointercancel', up\)/);   // 손 뗌을 놓쳐도 획이 끝난다
  assert.match(fn('startBrush'), /addEventListener\('blur', up\)/);
  assert.match(fn('startBrush'), /rev !== brushViewRev/);   // 칠하는 중 지도·보기가 바뀌면 역행렬 다시
  for (const f of ['renderMapTransform', 'renderInsets', 'applyView']) assert.match(fn(f), /brushViewRev\+\+/, f);
  assert.match(html, /#cg\.brushmode \{ touch-action: none; \}/);
  assert.match(fn('brushNewCanvas'), /brushWatch\(/);   // GPU 리셋 감지
  assert.match(fn('brushLiveOf'), /brushWatch\(/);
  assert.match(fn('brushPublish'), /brushEncCancel\(old\.jobs\)/);   // 진행 중 갱신은 취소하고 합친다
  assert.match(fn('startBrush'), /pushUndo\(\); brushStrokes\(\)\.push\(s\)/);   // 되돌리기 기록은 손 뗄 때
  assert.match(fn('brushEncode'), /createImageBitmap/);
  assert.match(fn('stripExportUi'), /\.brushLive/);   // 추출 복제본에 라이브 캔버스 없음
  for (const f of ['svgToImage', 'svgBlob', 'previewPng']) assert.match(fn(f), /brushFinalize\(\)/, f);
  assert.match(fn('buildZones'), /brushZonesChanged\(\)/);
  assert.match(fn('markBrushRegions'), /brushSelEls/);   // 선택 강조는 그 시도만
  assert.match(html, /setInterval\(\(\) => \{ if \(!brushStroke\) saveWork\(\);[^}\n]*\}, 1500\)/);   // 자동 저장(+ 타임라인 행 확인)
});

test('처음부터 굽기 = 바꾸기 전 계산(같은 색 쌓기·다른 색 덮기·지우개·대소문자 같은 색)', () => {
  const app = makeApp(ZONES);
  app.S.brushByStyle.sgg = LIST.slice();
  app.renderBrush();
  sameRuns(app, referenceRuns(app, LIST), 0, '전체');
  // 런 이미지: 칠한 순서대로, data-col 대문자·data-run 순번
  const imgs = app.L_brush.children.filter((n) => n.tagName === 'image' && n.getAttribute('data-col') != null);   // 런 이미지(공간 자리 brushBox 빼고)
  assert.deepEqual(imgs.map((n) => n.getAttribute('data-run')), imgs.map((_, k) => String(k)));
  assert.deepEqual(imgs.map((n) => n.getAttribute('data-col')), app.brushRT.main.runs.map((r) => r.col.toUpperCase()));
  assert.ok(imgs.every((n) => /^data:/.test(n.getAttribute('href'))));
});

test('한 획씩 더하기(증분) = 처음부터 굽기, 획이 그대로면 그리기 0번', () => {
  const inc = makeApp(ZONES);
  for (const s of LIST) { inc.S.brushByStyle.sgg.push(s); inc.renderBrush(); }
  const full = makeApp(ZONES); full.S.brushByStyle.sgg = LIST.slice(); full.renderBrush();
  const a = snapRuns(inc), b = snapRuns(full);
  assert.equal(a.length, b.length);
  a.forEach((r, k) => { assert.equal(r.o, b[k].o, '런 범위 ' + k); assert.equal(maxDiff(r.px, b[k].px), 0, '런 ' + k); });
  sameRuns(inc, referenceRuns(inc, LIST), 0, '증분 vs 기준');
  OPS = 0; inc.renderBrush(); inc.renderBrush();
  assert.equal(OPS, 0, 'renderAll 이 불러도 다시 그리지 않음');
  // 되돌리기(S 를 JSON 으로 갈아끼움 — 객체가 새것이어도 같은 획으로 알아본다)
  inc.S.brushByStyle.sgg = JSON.parse(JSON.stringify(inc.S.brushByStyle.sgg));
  OPS = 0; inc.renderBrush(); assert.equal(OPS, 0, 'JSON 복제본도 같은 획');
});

test('되돌리기 = 조각 복원(처음부터 굽기와 픽셀 같음), 다시 실행 = 다시 더하기', () => {
  const app = makeApp(ZONES);
  app.S.brushByStyle.sgg = LIST.slice(); app.renderBrush();
  const after = snapRuns(app);
  for (const keep of [9, 7, 4]) {   // 뒤에서 1·3·6획 되돌리기
    app.S.brushByStyle.sgg = JSON.parse(JSON.stringify(LIST.slice(0, keep)));
    OPS = 0; app.renderBrush();
    const ref = makeApp(ZONES); ref.S.brushByStyle.sgg = LIST.slice(0, keep); ref.renderBrush();
    const a = snapRuns(app), b = snapRuns(ref);
    assert.equal(a.length, b.length, `되돌리기 ${keep}: 런 개수`);
    a.forEach((r, k) => { assert.equal(r.o, b[k].o, `되돌리기 ${keep}: 런 범위 ${k}`); assert.equal(maxDiff(r.px, b[k].px), 0, `되돌리기 ${keep}: 런 ${k}`); });
    assert.equal(app.brushRT.main.applied.length, keep);
  }
  // 다시 실행 — 남은 목록에 이어 붙이면 처음 결과와 같다
  app.S.brushByStyle.sgg = LIST.slice(); app.renderBrush();
  const again = snapRuns(app);
  assert.equal(again.length, after.length);
  again.forEach((r, k) => { assert.equal(r.o, after[k].o, '다시 실행 런 범위 ' + k); assert.equal(maxDiff(r.px, after[k].px), 0, '다시 실행 런 ' + k); });
});

test('앞쪽 획이 바뀌면(색 계열 바꾸기·불러오기) 처음부터 다시 — 기준과 같다', () => {
  const app = makeApp(ZONES);
  app.S.brushByStyle.sgg = LIST.slice(); app.renderBrush();
  const L2 = JSON.parse(JSON.stringify(LIST)); for (const s of L2) if (s.col.toUpperCase() === '#2E6FB0') s.col = '#7B3FA0';
  app.S.brushByStyle.sgg = L2; app.renderBrush();
  sameRuns(app, referenceRuns(app, L2), 0, '색 바꾼 뒤');
  app.S.brushByStyle.sgg = []; app.renderBrush();
  assert.equal(app.brushRT.main.runs.length, 0);
  assert.equal(app.L_brush.children.filter((n) => n.tagName === 'image').length, 0, '전부 지우면 이미지도 없음');
});

test('되돌리기 조각은 최근 것만 — 넘어가면 처음부터 굽기로 맞는다', () => {
  const app = makeApp(ZONES);
  const N = app.BRUSH_UNDO_N + 6, long = [];
  for (let i = 0; i < N; i++) long.push(mkStroke(['#E5231E', '#2E6FB0', '#3DAA5C'][Math.floor(i / 4) % 3], i % 2 ? K1 : K2, i % 11 === 10, 3));
  for (const s of long) { app.S.brushByStyle.sgg.push(s); app.renderBrush(); }
  const st = app.brushRT.main;
  assert.ok(st.hist.slice(0, 6).every((p) => p === null), '오래된 조각은 버림');
  assert.ok(st.hist.slice(-app.BRUSH_UNDO_N).every((p) => p), '최근 조각은 남김');
  app.S.brushByStyle.sgg = long.slice(0, 3); app.renderBrush();   // 조각이 없는 곳까지 되돌림 → 다시 굽기
  sameRuns(app, referenceRuns(app, long.slice(0, 3)), 0, '긴 되돌리기');
});

test('옛 데이터(keys 없이 region/regions)도 같은 클립으로 칠한다', () => {
  const s = mkStroke('#E5231E', K1); const old = { ...s }; delete old.keys; old.regions = ['경기/a', '경기/b'];
  const a = makeApp(ZONES); a.S.brushByStyle.sgg = [old]; a.renderBrush();
  const b = makeApp(ZONES); b.S.brushByStyle.sgg = [s]; b.renderBrush();
  assert.equal(a.brushRT.main.runs.length, 1);
  assert.ok(a.brushRT.main.runs[0].cv.px.some((v) => v > 0), '칠해짐');
  assert.equal(maxDiff(a.brushRT.main.runs[0].cv.px, b.brushRT.main.runs[0].cv.px), 0);
  const one = { ...old, regions: undefined, region: '경기/a' };
  const c = makeApp(ZONES); c.S.brushByStyle.sgg = [one]; c.renderBrush();
  assert.equal(c.brushRT.main.runs.length, 1);
});

// ── 실제 앱(부팅 점검기) — WCG_BOOT_CHECK=1 일 때만: 합성 포인터로 칠하기·지우개·되돌리기·다시 실행 ──
test('부팅 점검: 칠하기·지우개 → 되돌리기는 칠하기 전과, 다시 실행은 칠한 직후와 픽셀까지 같다', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  const { execFileSync } = require('node:child_process');
  const root = path.join(__dirname, '..');
  const raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), root, '--wait=8000', '--size=1600x900', '--eval=' + path.join(__dirname, 'brush-incremental.boot-eval.js')], { encoding: 'utf8', timeout: 300000 });
  const out = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  const R = out.evalResult;
  assert.ok(R && !R.error, JSON.stringify(R));
  assert.ok(R.selHi > 0, '영역 선택 강조');
  assert.deepEqual(R.afterTwo, ['#E5231E:0'], '같은 색 두 획 = 런 하나');
  assert.deepEqual(R.afterFive, ['#E5231E:0', '#2E6FB0:1', '#3DAA5C:2'], '다른 색은 새 런, 지우개 뒤 새 색도 새 런');
  assert.equal(R.toDataURLDuringDrag, 0, '드래그 중 PNG 인코딩 없음');
  assert.ok(R.live.length >= 1 && R.live.every((x) => /^foreignObject:shown:CANVAS$/i.test(x)), JSON.stringify(R.live));
  assert.equal(R.liveEmpty, true, '손 뗀 뒤 라이브 캔버스는 비어 있다(최종 그림은 런 이미지)');
  assert.equal(R.imgsShown, true);
  assert.equal(R.undo3.ok, true, '되돌리기: ' + JSON.stringify(R.undo3));
  assert.equal(R.redo3.ok, true, '다시 실행: ' + JSON.stringify(R.redo3));
  assert.equal(R.rapidToDataURL, 0, '연달아 칠해도 누를 때 동기 PNG 인코딩 없음(앞 갱신은 합친다)');
  assert.equal(R.rapidImgsShown, true, '연달아 칠한 뒤 런 이미지가 다시 보인다');
  assert.equal(R.rapidLiveEmpty, true, '연달아 칠한 뒤 라이브 캔버스는 비어 있다');
  assert.equal(R.rapidStrokes, 10);
  assert.equal(R.lostUpStrokes, 3, 'pointercancel·놓친 손 뗌 뒤에도 획이 끝나고 다음 칠이 된다');
  assert.equal(R.lostUpImgsShown, true);
  assert.deepEqual(R.work, { n: 13, keys: 'col,dabs,erase,keys,op,r,soft,space', erase: 2 }, '저장 형식 그대로');
});

test('런 경계를 넘어 되돌린 뒤 같은 색으로 이어 칠해도(앞 런 백업 복원) 바꾸기 전 계산과 같다', () => {
  // LIST[7] = 지우개, LIST[8] = 초록, LIST[9] = 빨강(새 런). 뒤 2획을 되돌리고(지우개까지) 초록·빨강을 칠한다.
  const app = makeApp(ZONES);
  app.S.brushByStyle.sgg = LIST.slice(); app.renderBrush();
  app.S.brushByStyle.sgg = JSON.parse(JSON.stringify(LIST.slice(0, 8))); app.renderBrush();   // 되돌리기 2번(런 둘을 넘는다)
  const more = [mkStroke('#3DAA5C', K2), mkStroke('#3DAA5C', K1), mkStroke('#E5231E', K2)];
  for (const s of more) { app.S.brushByStyle.sgg.push(s); app.renderBrush(); }
  const list = [...LIST.slice(0, 8), ...more];
  sameRuns(app, referenceRuns(app, list), 0, '되돌린 뒤 이어 칠하기');
  // 지우개 바로 뒤까지 되돌렸다가 다시 색 획
  app.S.brushByStyle.sgg = JSON.parse(JSON.stringify(list.slice(0, 5))); app.renderBrush();   // LIST[4] = 지우개
  const after = [mkStroke('#2E6FB0', K2), mkStroke('#2E6FB0', K1)];
  for (const s of after) { app.S.brushByStyle.sgg.push(s); app.renderBrush(); }
  sameRuns(app, referenceRuns(app, [...list.slice(0, 5), ...after]), 0, '지우개 뒤로 되돌린 뒤');
  app.S.brushByStyle.sgg = JSON.parse(JSON.stringify(list.slice(0, 3))); app.renderBrush();   // 지우개 앞(파랑 런 중간)까지
  const cont = [mkStroke('#2E6FB0', K1)];
  app.S.brushByStyle.sgg.push(cont[0]); app.renderBrush();
  sameRuns(app, referenceRuns(app, [...list.slice(0, 3), ...cont]), 0, '런 중간까지 되돌린 뒤 이어 칠하기');
});

test('같은 색 획이 겹쳐 앞 런을 여러 번 덮어도(백업으로 되돌린 뒤 런 전체로 파내기) 바꾸기 전과 같다', () => {
  const line = (col, keys, y, erase) => ({ space: 'main', keys, col, r: 6, op: 55, soft: 70, erase: !!erase, dabs: [[6, y], [12, y + 1], [18, y], [24, y + 1], [30, y]] });
  const list = [line('#E5231E', K2, 12), line('#E5231E', K2, 9), line('#2E6FB0', K2, 11), line('#2E6FB0', K2, 13), line('#2E6FB0', K2, 10),
    line('#3DAA5C', K1, 12), line('#000000', K2, 12, true), line('#3DAA5C', K2, 11), line('#3DAA5C', K2, 12)];
  const full = makeApp(ZONES); full.S.brushByStyle.sgg = list.slice(); full.renderBrush();
  sameRuns(full, referenceRuns(full, list), 0, '겹친 덮기(처음부터)');
  const inc = makeApp(ZONES);
  for (const s of list) { inc.S.brushByStyle.sgg.push(s); inc.renderBrush(); }
  sameRuns(inc, referenceRuns(inc, list), 0, '겹친 덮기(증분)');
  inc.S.brushByStyle.sgg = list.slice(0, 4); inc.renderBrush();   // 파랑 런 가운데까지 되돌리기
  inc.S.brushByStyle.sgg.push(line('#2E6FB0', K1, 12)); inc.renderBrush();
  sameRuns(inc, referenceRuns(inc, [...list.slice(0, 4), line('#2E6FB0', K1, 12)]), 0, '되돌린 뒤 같은 런 이어 칠하기');
});

test('런 캔버스는 칠한 범위만(격자 맞춤) — 클립 영역 bbox 로 잘리고, 이미지는 공간 전체와 같은 픽셀 격자에 놓인다', () => {
  const app = makeApp(ZONES);
  // 경기(로컬 x 0~20)만 고르고 오른쪽(강원 쪽)까지 크게 칠한 획 — 닿는 범위는 경기 bbox 안으로 잘린다
  const wide = { space: 'main', keys: K1, col: '#E5231E', r: 6, op: 55, soft: 70, erase: false, dabs: [[4, 6], [14, 8], [26, 10], [36, 12]] };
  app.S.brushByStyle.sgg = [wide, mkStroke('#2E6FB0', K2)]; app.renderBrush();
  const st = app.brushRT.main, rect = app.brushRect(st, wide);
  assert.ok(rect[0] + rect[2] <= Math.ceil((20 - st.bbox.x) * st.K) + 2, '경기 bbox 밖(강원 쪽)은 범위에서 빠짐: ' + rect);
  for (const r of st.runs) {
    const [ox, oy, w, h] = r.o, G = app.BRUSH_G;
    assert.equal(ox % G, 0); assert.equal(oy % G, 0);
    assert.ok(w <= st.W && h <= st.H && w * h < st.W * st.H, '공간 전체보다 작게: ' + r.o);
    assert.ok(r.box[0] >= ox && r.box[1] >= oy && r.box[0] + r.box[2] <= ox + w && r.box[1] + r.box[3] <= oy + h, '칠한 범위를 담는다');
  }
  sameRuns(app, referenceRuns(app, app.S.brushByStyle.sgg), 0, '잘라 든 런');
  const imgs = app.L_brush.children.filter((n) => n.tagName === 'image' && n.getAttribute('data-col') != null);   // 런 이미지(공간 자리 brushBox 빼고)
  imgs.forEach((im, k) => {
    const g = app.brushGeo(st, st.runs[k].o);
    assert.deepEqual(['x', 'y', 'width', 'height'].map((a) => +im.getAttribute(a)), g);
    // 공간 전체 이미지(x=bbox.x, 폭=bbox.w ↔ W px)와 같은 픽셀 크기
    assert.ok(Math.abs(g[2] / st.runs[k].o[2] - st.bbox.w / st.W) < 1e-12);
  });
  // 공간 전체 자리(투명) 하나 — 지도 레이어 bbox(그림자 필터 영역)·그리기 범위가 바꾸기 전(런마다 공간 전체 이미지)과 같게
  const box = app.L_brush.children.filter((n) => n.tagName === 'image' && /brushBox/.test(n.getAttribute('class')));
  assert.equal(box.length, 1);
  assert.deepEqual(['x', 'y', 'width', 'height'].map((a) => +box[0].getAttribute(a)), [st.bbox.x, st.bbox.y, st.bbox.w, st.bbox.h]);
  assert.match(box[0].getAttribute('href'), /^data:.*1x1/, '투명 1×1 PNG 를 공간 bbox 로 늘림(그리기 범위도 바꾸기 전과 같게)');
  assert.equal(box[0].getAttribute('data-cols'), '#E5231E,#2E6FB0');
  assert.equal(box[0].nextSibling, imgs[0], '런 이미지들 앞');
});

test('GPU 가 다시 시작돼 캔버스가 비면(contextlost → contextrestored) 저장 획에서 처음부터 다시 굽는다', async () => {
  const app = makeApp(ZONES);
  app.S.brushByStyle.sgg = LIST.slice(); app.renderBrush();
  const st = app.brushRT.main, cvs = st.runs.map((r) => r.cv);
  // GPU 리셋 흉내: 캔버스 내용이 비고 '잃음' 상태
  for (const c of cvs) { c.px.fill(0); c.lost = true; }
  cvs[0].fire('contextlost');
  assert.equal(app.brushGpu.lost, true);
  OPS = 0; app.S.brushByStyle.sgg = [...LIST, mkStroke('#E5231E', K2)]; app.renderBrush();
  assert.equal(OPS, 0, '복구 전엔 빈 캔버스에 그리지 않는다');
  for (const c of cvs) c.lost = false;
  cvs[1].fire('contextrestored');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(app.brushGpu.lost, false);
  sameRuns(app, referenceRuns(app, app.S.brushByStyle.sgg), 0, 'GPU 복구 뒤 다시 굽기');
  // 되돌리기 조각도 새로 — 되돌리면 처음부터 굽기와 같다
  app.S.brushByStyle.sgg = LIST.slice(0, 8); app.renderBrush();
  sameRuns(app, referenceRuns(app, LIST.slice(0, 8)), 0, 'GPU 복구 뒤 되돌리기');
});

test('앞 런 백업·되돌리기 조각은 쓰는 것만 남긴다(버린 캔버스는 크기 0)', () => {
  const app = makeApp(ZONES);
  const long = [];
  for (let i = 0; i < 60; i++) long.push(mkStroke(['#E5231E', '#2E6FB0', '#3DAA5C', '#F2C230'][Math.floor(i / 3) % 4], K2, i % 13 === 12, 4));
  for (const s of long) { app.S.brushByStyle.sgg.push(s); app.renderBrush(); }
  const st = app.brushRT.main;
  const live = new Set([st.bk, ...st.hist.filter(Boolean).map((P) => P.bk)].filter(Boolean));
  assert.ok(st.bks.size <= live.size, `백업 묶음 ${st.bks.size} ≤ 쓰는 것 ${live.size}`);
  for (const bk of st.bks) for (const b of bk.m.values()) assert.ok(b.c.width > 0, '남긴 백업은 살아 있다');
  // 한 번에 많이 더해(되돌리기 구멍) 앞쪽 조각이 못 쓰게 되면 반환
  app.S.brushByStyle.sgg = long.slice(0, 5); app.renderBrush();
  for (let i = 0; i < 50; i++) app.S.brushByStyle.sgg.push(mkStroke('#E5231E', K1, false, 3));
  app.renderBrush();
  let k = st.hist.length - 1; while (k >= 0 && st.hist[k]) k--;
  assert.ok(st.hist.slice(0, k + 1).every((P) => P === null), '빈 칸 너머 조각 없음');
  sameRuns(app, referenceRuns(app, app.S.brushByStyle.sgg), 0, '많이 더한 뒤');
});
