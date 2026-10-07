// 미세 측정(개선안 효과 추정) — 앱과 같은 크기 캔버스·같은 클립(시도 존 path 합)·같은 점(방사 그라디언트)으로
// 지금 방식 vs 개선 후보를 직접 잰다. 결과 그림 차이(알파 최대·평균 차)도 같이 본다.
// Runtime.evaluate 로 async 함수 본문처럼 실행: return 결과.
const $ = (s) => document.querySelector(s);
const now = () => performance.now();
const r2 = (x) => Math.round(x * 100) / 100;
const A = __bench.A, B = __bench.B, NSTROKE = __bench.n || 50;
const sz = __h.brushCanvasSize();
const W = sz.W, Hh = sz.H, K = sz.K, bx = sz.bbox[0], by = sz.bbox[1];
const gen = __h.genStrokes([A, B], NSTROKE, { runLen: 25, eraseEvery: 0 });
const strokes = gen.strokes;
const OUT = { canvas: sz, strokes: strokes.length, dabs: gen.dabsTotal, r: r2(gen.r) };
// 존 path 문자열 모으기(앱 keysPath2D 와 같은 대상)
const zoneDs = [...document.querySelectorAll('#gMain > path.zone')].filter((z) => [A, B].includes(__h.sidoOf(z.dataset.id))).map((z) => z.getAttribute('d'));
OUT.clipChars = zoneDs.reduce((a, d) => a + d.length, 0);
const mkPath = () => { const p = new Path2D(); for (const d of zoneDs) p.addPath(new Path2D(d)); return p; };
let t = now(); for (let i = 0; i < 20; i++) mkPath(); OUT.path2dBuildMs = r2((now() - t) / 20);
const clip = mkPath();
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const grad = (cx, x, y, r, col, a, soft) => {
  const g = cx.createRadialGradient(x, y, 0, x, y, r); const inner = Math.max(0, Math.min(1, 1 - soft / 100)) * 0.9;
  g.addColorStop(0, hexA(col, a)); g.addColorStop(inner, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
  cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
};
const mk = (opts) => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; return { c, x: c.getContext('2d', opts) }; };
const setT = (x) => x.setTransform(K, 0, 0, K, -bx * K, -by * K);
const flush = (x) => x.getImageData(0, 0, 1, 1);
// 지금 방식: 획마다 clip, 점마다 save/gradient/fill/restore
const drawCurrent = (x, list, path) => {
  for (const s of list) { x.save(); setT(x); x.clip(path); for (const [px, py] of s.dabs) { x.save(); x.globalCompositeOperation = 'source-over'; grad(x, px, py, s.r, s.col, s.op / 100, s.soft); x.restore(); } x.restore(); }
};
// 개선 후보: 클립 없이 점만 쌓고, 같은 keys(같은 클립) 묶음마다 한 번 destination-in 으로 클립
const drawMaskOnce = (x, list, path) => {
  x.save(); setT(x);
  for (const s of list) for (const [px, py] of s.dabs) grad(x, px, py, s.r, s.col, s.op / 100, s.soft);
  x.globalCompositeOperation = 'destination-in'; x.fillStyle = '#000'; x.fill(path);
  x.restore();
};
const timeIt = (fn) => { const t0 = now(); fn(); return r2(now() - t0); };
const res = {};
for (const [name, opts] of [['gpu', undefined], ['cpu', { willReadFrequently: true }]]) {
  const one = strokes.slice(0, 1), all = strokes;
  // 1획(새 획 한 번)과 전체(N획)
  for (const [lbl, list] of [['1stroke', one], ['all', all]]) {
    const a = mk(opts); const ta = timeIt(() => { drawCurrent(a.x, list, clip); flush(a.x); });
    const b = mk(opts); const tb = timeIt(() => { drawMaskOnce(b.x, list, clip); flush(b.x); });
    const c = mk(opts); const tc = timeIt(() => { drawCurrent(c.x, list, clip); flush(c.x); });   // 두 번째(워밍업 뒤)
    const d = mk(opts); const td = timeIt(() => { drawMaskOnce(d.x, list, clip); flush(d.x); });
    res[`${name}_${lbl}`] = { current: ta, current2: tc, maskOnce: tb, maskOnce2: td };
    if (lbl === 'all') {
      // 그림 차이 (알파)
      const ia = a.x.getImageData(0, 0, W, Hh).data, ib = b.x.getImageData(0, 0, W, Hh).data;
      let mx = 0, sum = 0, n = 0, over8 = 0;
      for (let i = 0; i < ia.length; i += 4) { for (let k = 0; k < 4; k++) { const dd = Math.abs(ia[i + k] - ib[i + k]); if (dd > mx) mx = dd; sum += dd; if (dd > 8) over8++; } if (ia[i + 3] || ib[i + 3]) n++; }
      res[`${name}_diff`] = { maxAbs: mx, meanAbsOverPainted: r2(sum / Math.max(1, n * 4)), chOver8: over8, paintedPx: n };
    }
  }
  // 라이브 미리보기 갱신 비용: base+live 합성 + toDataURL(PNG)
  const main = mk(opts), base = mk(opts), live = mk(opts);
  drawCurrent(base.x, strokes.slice(0, Math.min(10, strokes.length)), clip); drawCurrent(live.x, strokes.slice(0, 1), clip); flush(base.x); flush(live.x);
  const tl = [];
  let urlLen = 0;
  for (let i = 0; i < 12; i++) {
    const t0 = now();
    main.x.setTransform(1, 0, 0, 1, 0, 0); main.x.clearRect(0, 0, W, Hh); main.x.drawImage(base.c, 0, 0); main.x.drawImage(live.c, 0, 0);
    const u = main.c.toDataURL(); urlLen = u.length;
    tl.push(now() - t0);
    // 다음 점 하나 추가(라이브)
    const s = strokes[0], [px, py] = s.dabs[i % s.dabs.length]; live.x.save(); setT(live.x); live.x.clip(clip); grad(live.x, px + 3, py + 2, s.r, s.col, 0.55, 70); live.x.restore();
  }
  tl.sort((p, q) => p - q);
  res[`${name}_liveFlush_toDataURL`] = { p50: r2(tl[6]), max: r2(tl[11]), urlKB: Math.round(urlLen / 1024) };
  // toBlob(비동기) — 메인 스레드 점유(동기 부분)와 완료까지
  const tb = [], tbDone = [];
  for (let i = 0; i < 6; i++) {
    const t0 = now(); let t1;
    const p = new Promise((r) => main.c.toBlob((b) => r(b)));
    t1 = now(); const blob = await p; const t2 = now();
    tb.push(t1 - t0); tbDone.push(t2 - t0);
    URL.revokeObjectURL(URL.createObjectURL(blob));
  }
  res[`${name}_toBlob`] = { syncP50: r2(tb.sort((p, q) => p - q)[3]), doneP50: r2(tbDone.sort((p, q) => p - q)[3]) };
  // 합성만(base+live drawImage, 인코딩 없음)
  const tc2 = [];
  for (let i = 0; i < 12; i++) { const t0 = now(); main.x.clearRect(0, 0, W, Hh); main.x.drawImage(base.c, 0, 0); main.x.drawImage(live.c, 0, 0); flush(main.x); tc2.push(now() - t0); }
  res[`${name}_compositeOnly`] = { p50: r2(tc2.sort((p, q) => p - q)[6]) };
  // 점 하나 추가(지금 방식: 획 시작 때 걸어둔 clip 위에 점)
  const one2 = mk(opts); one2.x.save(); setT(one2.x); one2.x.clip(clip);
  const td2 = [];
  for (let i = 0; i < 30; i++) { const s = strokes[1 % strokes.length]; const [px, py] = s.dabs[i % s.dabs.length]; const t0 = now(); grad(one2.x, px, py, s.r, s.col, 0.55, 70); flush(one2.x); td2.push(now() - t0); }
  one2.x.restore();
  res[`${name}_dabWithClip`] = { p50: r2(td2.sort((p, q) => p - q)[15]) };
  const one3 = mk(opts); one3.x.save(); setT(one3.x);
  const td3 = [];
  for (let i = 0; i < 30; i++) { const s = strokes[1 % strokes.length]; const [px, py] = s.dabs[i % s.dabs.length]; const t0 = now(); grad(one3.x, px, py, s.r, s.col, 0.55, 70); flush(one3.x); td3.push(now() - t0); }
  one3.x.restore();
  res[`${name}_dabNoClip`] = { p50: r2(td3.sort((p, q) => p - q)[15]) };
  // toDataURL 단독(전체 크기, 칠 많이)
  const tt = []; for (let i = 0; i < 4; i++) { const t0 = now(); main.c.toDataURL(); tt.push(now() - t0); }
  res[`${name}_toDataURL_full`] = { p50: r2(tt.sort((p, q) => p - q)[2]) };
}
OUT.res = res;
// 존 path 파싱: 획마다 새로(지금) vs 캐시
OUT.path2dPerStrokeTotalMs_N = r2(OUT.path2dBuildMs * strokes.length);
return OUT;
