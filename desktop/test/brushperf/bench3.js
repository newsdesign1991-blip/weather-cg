// 미세 측정 3 — 클립을 '필요한 존만'으로 줄이면 결과가 같은 채로 얼마나 빨라지나.
//  current      : 획마다 clip(선택 시도의 존 path 전부) + 점마다 그라디언트 fill  (지금 앱)
//  subsetStroke : 획마다 clip(그 획 bbox(+r)와 겹치는 존만) + 점마다 fill  — 클립 안쪽 결과는 수학적으로 같다
//  subsetDab    : 점마다 그 점 bbox와 겹치는 존만으로 clip (같은 존 묶음이 이어지면 clip 재사용)
//  maskCached   : 클립 마스크 캔버스를 한 번 굽고(캐시), 획마다 클립 없이 점 → destination-in 마스크(획 bbox만) → 대상에 얹기
const now = () => performance.now();
const r2 = (x) => Math.round(x * 100) / 100;
const A = __bench.A, B = __bench.B, NSTROKE = __bench.n || 50;
const sz = __h.brushCanvasSize();
const W = sz.W, Hh = sz.H, K = sz.K, bx = sz.bbox[0], by = sz.bbox[1];
const gen = __h.genStrokes([A, B], NSTROKE, { runLen: 1000, eraseEvery: 0, cols: ['#E5231E'] });
const strokes = gen.strokes;
const zoneEls = [...document.querySelectorAll('#gMain > path.zone')].filter((z) => [A, B].includes(__h.sidoOf(z.dataset.id)));
const zones = zoneEls.map((z) => { const b = z.getBBox(); return { d: z.getAttribute('d'), x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height }; });
let t0 = now(); for (const z of zones) z.p = new Path2D(z.d); const zoneParseMs = now() - t0;
const clip = new Path2D(); for (const z of zones) clip.addPath(z.p);
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const grad = (cx, x, y, r, col, a, soft) => {
  const g = cx.createRadialGradient(x, y, 0, x, y, r); const inner = Math.max(0, Math.min(1, 1 - soft / 100)) * 0.9;
  g.addColorStop(0, hexA(col, a)); g.addColorStop(inner, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
  cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
};
const dab = (x, px, py, s) => { x.save(); x.globalCompositeOperation = 'source-over'; grad(x, px, py, s.r, s.col, s.op / 100, s.soft); x.restore(); };
const mk = (w = W, h = Hh) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, x: c.getContext('2d') }; };
const setT = (x) => x.setTransform(K, 0, 0, K, -bx * K, -by * K);
const flush = (x) => x.getImageData(0, 0, 1, 1);
const sbox = (s) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [px, py] of s.dabs) { if (px < x0) x0 = px; if (py < y0) y0 = py; if (px > x1) x1 = px; if (py > y1) y1 = py; } return { x0: x0 - s.r, y0: y0 - s.r, x1: x1 + s.r, y1: y1 + s.r }; };
const hit = (z, b) => z.x0 <= b.x1 && z.x1 >= b.x0 && z.y0 <= b.y1 && z.y1 >= b.y0;
const subPath = (b) => { const p = new Path2D(); let n = 0; for (const z of zones) if (hit(z, b)) { p.addPath(z.p); n++; } return { p, n }; };
// 마스크(캐시) — 한 번만 굽는다
let M = null, maskMs = 0;
const getMask = () => { if (M) return M; const t = now(); M = mk(); setT(M.x); M.x.fillStyle = '#000'; M.x.fill(clip); flush(M.x); maskMs = now() - t; return M; };
const L = mk();
const stats = { subsetStrokeZones: 0, subsetDabClips: 0, hybridIn: 0, hybridOut: 0, hybridEdge: 0 };
// hybrid: 마스크 알파를 한 번 읽어 8px 타일로 '완전히 안(255)'/'완전히 밖(0)'을 표시 → 점 bbox(+2px)가 전부 안이면 클립 없이,
// 전부 밖이면 건너뛰고, 경계에 걸친 점만 지금처럼 클립.
const TS = 8; let tiles = null, TW = 0, TH = 0, tileMs = 0;
const getTiles = () => {
  if (tiles) return tiles; const m = getMask(); const t = now();
  const a = m.x.getImageData(0, 0, W, Hh).data; TW = Math.ceil(W / TS); TH = Math.ceil(Hh / TS);
  tiles = new Uint8Array(TW * TH);   // 1=전부 안, 2=전부 밖, 0=섞임
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    let all = true, none = true;
    for (let y = ty * TS; y < Math.min(Hh, ty * TS + TS) && (all || none); y++) for (let x = tx * TS; x < Math.min(W, tx * TS + TS); x++) { const v = a[(y * W + x) * 4 + 3]; if (v !== 255) all = false; if (v !== 0) none = false; }
    tiles[ty * TW + tx] = all ? 1 : none ? 2 : 0;
  }
  tileMs = now() - t; return tiles;
};
const classify = (px, py, r) => {
  const tl = getTiles();
  const x0 = Math.floor(((px - r - bx) * K - 2) / TS), x1 = Math.floor(((px + r - bx) * K + 2) / TS);
  const y0 = Math.floor(((py - r - by) * K - 2) / TS), y1 = Math.floor(((py + r - by) * K + 2) / TS);
  let all = true, none = true;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const v = (tx < 0 || ty < 0 || tx >= TW || ty >= TH) ? 2 : tl[ty * TW + tx];
    if (v !== 1) all = false; if (v !== 2) none = false;
  }
  return all ? 1 : none ? 2 : 0;
};
const variants = {
  current: (x, list) => { for (const s of list) { x.save(); setT(x); x.clip(clip); for (const [px, py] of s.dabs) dab(x, px, py, s); x.restore(); } },
  subsetStroke: (x, list) => { for (const s of list) { const { p, n } = subPath(sbox(s)); stats.subsetStrokeZones += n; x.save(); setT(x); x.clip(p); for (const [px, py] of s.dabs) dab(x, px, py, s); x.restore(); } },
  subsetDab: (x, list) => {
    for (const s of list) {
      let key = null, open = false;
      for (const [px, py] of s.dabs) {
        const b = { x0: px - s.r, y0: py - s.r, x1: px + s.r, y1: py + s.r };
        const ids = []; for (let i = 0; i < zones.length; i++) if (hit(zones[i], b)) ids.push(i);
        const k = ids.join(',');
        if (k !== key) { if (open) x.restore(); const p = new Path2D(); for (const i of ids) p.addPath(zones[i].p); x.save(); setT(x); x.clip(p); open = true; key = k; stats.subsetDabClips++; }
        dab(x, px, py, s);
      }
      if (open) x.restore();
    }
  },
  hybrid: (x, list) => {
    for (const s of list) {
      let clipped = false;
      x.save(); setT(x);
      for (const [px, py] of s.dabs) {
        const c = classify(px, py, s.r);
        if (c === 2) { stats.hybridOut++; continue; }
        if (c === 1) { stats.hybridIn++; if (clipped) { x.restore(); x.save(); setT(x); clipped = false; } }
        else { stats.hybridEdge++; if (!clipped) { x.clip(clip); clipped = true; } }
        dab(x, px, py, s);
      }
      x.restore();
    }
  },
  maskCached: (x, list) => {
    const m = getMask();
    for (const s of list) {
      const b = sbox(s);
      const rx = Math.max(0, Math.floor((b.x0 - bx) * K) - 1), ry = Math.max(0, Math.floor((b.y0 - by) * K) - 1);
      const rw = Math.min(W, Math.ceil((b.x1 - bx) * K) + 2) - rx, rh = Math.min(Hh, Math.ceil((b.y1 - by) * K) + 2) - ry;
      L.x.setTransform(1, 0, 0, 1, 0, 0); L.x.globalCompositeOperation = 'source-over'; L.x.clearRect(rx, ry, rw, rh);
      setT(L.x); for (const [px, py] of s.dabs) dab(L.x, px, py, s);
      L.x.setTransform(1, 0, 0, 1, 0, 0); L.x.globalCompositeOperation = 'destination-in'; L.x.drawImage(m.c, rx, ry, rw, rh, rx, ry, rw, rh); L.x.globalCompositeOperation = 'source-over';
      x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(L.c, rx, ry, rw, rh, rx, ry, rw, rh);
    }
  },
};
const OUT = { canvas: sz, strokes: strokes.length, dabs: gen.dabsTotal, zones: zones.length, clipChars: zones.reduce((a, z) => a + z.d.length, 0), zoneParseMs: r2(zoneParseMs), res: {} };
const imgs = {};
for (let rep = 0; rep < 2; rep++) {
  for (const [v, fn] of Object.entries(variants)) {
    const t1 = []; for (let k = 0; k < 5; k++) { const c = mk(); const t = now(); fn(c.x, strokes.slice(k, k + 1)); flush(c.x); t1.push(now() - t); }
    const c = mk(); const t = now(); fn(c.x, strokes); flush(c.x); const tAll = now() - t;
    if (rep === 1) { imgs[v] = c.x.getImageData(0, 0, W, Hh).data; OUT.res[v] = { oneStrokeMed: r2(t1.sort((a, b) => a - b)[2]), allStrokes: r2(tAll) }; }
  }
}
OUT.maskBuildMs = r2(maskMs); OUT.tileBuildMs = r2(tileMs);
OUT.hybrid = { in: stats.hybridIn, out: stats.hybridOut, edge: stats.hybridEdge };
OUT.stats = { subsetStrokeZonesAvg: r2(stats.subsetStrokeZones / (2 * (strokes.length + 5))), subsetDabClipsPerStroke: r2(stats.subsetDabClips / (2 * (strokes.length + 5))) };
const ref = imgs.current;
for (const v of Object.keys(variants)) {
  if (v === 'current') continue;
  const ib = imgs[v]; let mx = 0, sum = 0, n = 0, o2 = 0, o8 = 0, o32 = 0, exact = 0;
  for (let i = 0; i < ref.length; i += 4) {
    let d = 0; for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(ref[i + k] - ib[i + k]));
    if (ref[i + 3] || ib[i + 3]) { n++; sum += Math.abs(ref[i + 3] - ib[i + 3]); if (d === 0) exact++; }
    if (d > mx) mx = d; if (d > 2) o2++; if (d > 8) o8++; if (d > 32) o32++;
  }
  OUT.res[v].diffVsCurrent = { maxAbs: mx, meanAlphaAbs: r2(sum / Math.max(1, n)), pxOver2: o2, pxOver8: o8, pxOver32: o32, paintedPx: n, exactPx: exact };
}
return OUT;
