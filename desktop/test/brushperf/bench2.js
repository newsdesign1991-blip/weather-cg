// 미세 측정 2 — 클립 방식별 비용과 결과 차이(지금 방식=점마다 복잡한 클립 대비).
//  current   : 획마다 clip(존 path 합) + 점마다 그라디언트 fill  (지금 앱)
//  stroke    : 획마다 임시 레이어에 점(클립 없음) → destination-in 으로 클립 1번 → 레이어에 source-over
//  dabMask   : 클립 마스크 캔버스를 한 번 굽고, 점마다 작은 임시 캔버스에 점 → destination-in(마스크 조각) → 레이어에
//  runOnce   : 런(같은 색 연속) 전체를 클립 없이 → destination-in 1번
const now = () => performance.now();
const r2 = (x) => Math.round(x * 100) / 100;
const A = __bench.A, B = __bench.B, NSTROKE = __bench.n || 50;
const sz = __h.brushCanvasSize();
const W = sz.W, Hh = sz.H, K = sz.K, bx = sz.bbox[0], by = sz.bbox[1];
const gen = __h.genStrokes([A, B], NSTROKE, { runLen: 1000, eraseEvery: 0, cols: ['#E5231E'] });
const strokes = gen.strokes;
const zoneDs = [...document.querySelectorAll('#gMain > path.zone')].filter((z) => [A, B].includes(__h.sidoOf(z.dataset.id))).map((z) => z.getAttribute('d'));
const clip = new Path2D(); for (const d of zoneDs) clip.addPath(new Path2D(d));
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const grad = (cx, x, y, r, col, a, soft) => {
  const g = cx.createRadialGradient(x, y, 0, x, y, r); const inner = Math.max(0, Math.min(1, 1 - soft / 100)) * 0.9;
  g.addColorStop(0, hexA(col, a)); g.addColorStop(inner, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
  cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
};
const mk = (opts, w = W, h = Hh) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, x: c.getContext('2d', opts) }; };
const setT = (x) => x.setTransform(K, 0, 0, K, -bx * K, -by * K);
const flush = (x) => x.getImageData(0, 0, 1, 1);
const variants = {
  current: (x, list, opts) => { for (const s of list) { x.save(); setT(x); x.clip(clip); for (const [px, py] of s.dabs) { x.save(); grad(x, px, py, s.r, s.col, s.op / 100, s.soft); x.restore(); } x.restore(); } },
  stroke: (x, list, opts) => {
    const t = mk(opts);
    for (const s of list) {
      t.x.setTransform(1, 0, 0, 1, 0, 0); t.x.globalCompositeOperation = 'source-over'; t.x.clearRect(0, 0, W, Hh);
      setT(t.x); for (const [px, py] of s.dabs) grad(t.x, px, py, s.r, s.col, s.op / 100, s.soft);
      t.x.globalCompositeOperation = 'destination-in'; t.x.fillStyle = '#000'; t.x.fill(clip);
      x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(t.c, 0, 0);
    }
  },
  dabMask: (x, list, opts) => {
    const M = mk(opts); setT(M.x); M.x.fillStyle = '#000'; M.x.fill(clip);
    const R = Math.ceil(list[0].r * K) + 2, T = mk(opts, R * 2, R * 2);
    for (const s of list) for (const [px, py] of s.dabs) {
      const cx = (px - bx) * K, cy = (py - by) * K, ox = Math.floor(cx) - R, oy = Math.floor(cy) - R;
      T.x.setTransform(1, 0, 0, 1, 0, 0); T.x.globalCompositeOperation = 'source-over'; T.x.clearRect(0, 0, R * 2, R * 2);
      T.x.setTransform(K, 0, 0, K, -bx * K - ox, -by * K - oy); grad(T.x, px, py, s.r, s.col, s.op / 100, s.soft);
      T.x.setTransform(1, 0, 0, 1, 0, 0); T.x.globalCompositeOperation = 'destination-in'; T.x.drawImage(M.c, ox, oy, R * 2, R * 2, 0, 0, R * 2, R * 2);
      x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(T.c, ox, oy);
    }
  },
  runOnce: (x, list, opts) => { x.save(); setT(x); for (const s of list) for (const [px, py] of s.dabs) grad(x, px, py, s.r, s.col, s.op / 100, s.soft); x.globalCompositeOperation = 'destination-in'; x.fillStyle = '#000'; x.fill(clip); x.restore(); },
};
const OUT = { canvas: sz, strokes: strokes.length, dabs: gen.dabsTotal, clipChars: zoneDs.reduce((a, d) => a + d.length, 0), res: {} };
for (const [name, opts] of [['gpu', undefined], ['cpu', { willReadFrequently: true }]]) {
  const imgs = {};
  for (const [v, fn] of Object.entries(variants)) {
    const t1 = []; for (let k = 0; k < 3; k++) { const c = mk(opts); const t0 = now(); fn(c.x, strokes.slice(k, k + 1), opts); flush(c.x); t1.push(now() - t0); }
    const c = mk(opts); const t0 = now(); fn(c.x, strokes, opts); flush(c.x); const tAll = now() - t0;
    imgs[v] = c.x.getImageData(0, 0, W, Hh).data;
    OUT.res[`${name}_${v}`] = { oneStroke: r2(t1.sort((a, b) => a - b)[1]), allStrokes: r2(tAll) };
  }
  const ref = imgs.current;
  for (const v of Object.keys(variants)) {
    if (v === 'current') continue;
    const ib = imgs[v]; let mx = 0, sum = 0, n = 0, o8 = 0, o32 = 0;
    for (let i = 0; i < ref.length; i += 4) { const da = Math.abs(ref[i + 3] - ib[i + 3]); let dc = 0; for (let k = 0; k < 3; k++) dc = Math.max(dc, Math.abs(ref[i + k] - ib[i + k])); const d = da; if (d > mx) mx = d; if (ref[i + 3] || ib[i + 3]) { n++; sum += da; } if (d > 8) o8++; if (d > 32) o32++; }
    OUT.res[`${name}_${v}`].diffVsCurrent = { maxAbs: mx, meanAlphaAbs: r2(sum / Math.max(1, n)), pxOver8: o8, pxOver32: o32, paintedPx: n };
  }
}
return OUT;
