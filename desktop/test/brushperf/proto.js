// 실제 SVG(#L_brush, 그림자 필터 아래) 안에서 '라이브 미리보기' 전달 방식만 바꿔 2초 칠해 본다(앱 코드는 안 건드림 — 측정용 임시 DOM).
//  img   = 지금 방식(캔버스 → toDataURL(PNG) → <image href>)
//  blob  = 캔버스 → toBlob → objectURL → <image href> (비동기 인코딩)
//  fo    = <foreignObject><canvas> 를 같은 자리에 두고 캔버스에 바로 그림(인코딩·디코딩 없음)
// 프레임마다 점 2~3개(실제 드래그와 비슷), 지금 방식처럼 획 clip 을 건 채로 그린다.
const V = __proto.variant, MS = __proto.ms || 2000;
const now = () => performance.now();
const rAF = (window.__perf && __perf.rawRAF) || requestAnimationFrame;
const sz = __h.brushCanvasSize(); const W = sz.W, Hh = sz.H, K = sz.K, [bx, by, bw, bh] = sz.bbox;
const NS = 'http://www.w3.org/2000/svg';
const host = document.querySelector('#L_brush');
const A = __proto.A, B = __proto.B;
const zoneDs = [...document.querySelectorAll('#gMain > path.zone')].filter((z) => [A, B].includes(__h.sidoOf(z.dataset.id))).map((z) => z.getAttribute('d'));
const clip = new Path2D(); for (const d of zoneDs) clip.addPath(new Path2D(d));
const g = __h.genStrokes([A], 1, {}); const s = g.strokes[0]; const r = g.r;
// 긴 경로(바깥 bbox 안을 지그재그)
const pts = []; { let x = s.dabs[0][0], y = s.dabs[0][1], a = 0.3; for (let i = 0; i < 400; i++) { pts.push([x, y]); a += Math.sin(i * 0.15) * 0.25; x += Math.cos(a) * r * 0.3; y += Math.sin(a) * r * 0.3; } }
let el, cv, cx, url = null;
const base = document.createElement('canvas'); base.width = W; base.height = Hh;   // 지금 방식의 base(빈 것)
const live = document.createElement('canvas'); live.width = W; live.height = Hh; const lx = live.getContext('2d');
lx.setTransform(K, 0, 0, K, -bx * K, -by * K); lx.save(); lx.clip(clip);
if (V === 'fo') {
  el = document.createElementNS(NS, 'foreignObject');
  for (const [k, v] of Object.entries({ x: bx, y: by, width: bw, height: bh })) el.setAttribute(k, v);
  cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; cv.style.cssText = 'width:100%;height:100%;display:block';
  el.append(cv); host.append(el); cx = cv.getContext('2d');
} else {
  el = document.createElementNS(NS, 'image');
  for (const [k, v] of Object.entries({ x: bx, y: by, width: bw, height: bh, preserveAspectRatio: 'none' })) el.setAttribute(k, v);
  host.append(el);
  cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; cx = cv.getContext('2d');
}
const hexA = (h, al) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${al})`; };
const dab = (x, y) => { const gr = lx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, hexA(s.col, 0.55)); gr.addColorStop(0.27, hexA(s.col, 0.55)); gr.addColorStop(1, hexA(s.col, 0)); lx.fillStyle = gr; lx.beginPath(); lx.arc(x, y, r, 0, Math.PI * 2); lx.fill(); };
const frames = [], work = [];
let i = 0, pend = false;
const t0 = now();
await new Promise((done) => {
  const f = (ts) => {
    frames.push(ts);
    const w0 = now();
    for (let k = 0; k < 3 && i < pts.length; k++, i++) dab(pts[i][0], pts[i][1]);
    // 합성(지금 방식 brushLiveRecomp 와 같음)
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'source-over'; cx.clearRect(0, 0, W, Hh); cx.drawImage(base, 0, 0); cx.drawImage(live, 0, 0);
    if (V === 'img') el.setAttribute('href', cv.toDataURL());
    else if (V === 'blob') { if (!pend) { pend = true; cv.toBlob((b) => { const u = URL.createObjectURL(b); el.setAttribute('href', u); if (url) URL.revokeObjectURL(url); url = u; pend = false; }); } }
    work.push(now() - w0);
    if (now() - t0 < MS && i < (__proto.maxPts || 1e9)) rAF(f); else done();
  };
  rAF(f);
});
await new Promise((r2) => setTimeout(r2, 300));
if (__proto.keep) window.__protoEl = el; else { el.remove(); if (url) URL.revokeObjectURL(url); }
const iv = []; for (let k = 1; k < frames.length; k++) iv.push(frames[k] - frames[k - 1]);
const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1) + 0.5))] || 0; };
const rr = (x) => Math.round(x * 100) / 100;
return { variant: V, frames: frames.length, ivMean: rr(iv.reduce((a, b) => a + b, 0) / (iv.length || 1)), ivP95: rr(q(iv, 0.95)), ivMax: rr(Math.max(0, ...iv)), over20: iv.filter((x) => x > 20).length, workP50: rr(q(work, 0.5)), workP95: rr(q(work, 0.95)), workMax: rr(Math.max(0, ...work)), canvas: [W, Hh] };
