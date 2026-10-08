// 시제품(측정 전용) — 'AE식 레이어 합성' 재생이 지금 방식(존마다 fill 바꿔 SVG 전체 재래스터)보다 얼마나 가벼운지 잰다.
// tlperf.cjs --proto=<variant> 가 async 함수 본문으로 실행한다. window.__proto = { variant, ms }.
//  - 'app'     : 지금 재생과 같음(rAF마다 animSeek) — 비교 기준
//  - 'imgLayers': AE 보내기와 같은 레이어(aeBaseBlob·aeFillBlob 색별 PNG)를 <img>로 겹쳐 CSS opacity만 바꾼다(합성 전용).
//                 라벨은 SVG 그대로 두고 renderAnimFrame과 같은 식(올라오기+opacity)으로 속성만 바꾼다.
//  - 'svgGroups': 색별 존 복제를 SVG <g>로 묶고 opacity 속성만 바꾼다(래스터는 남음 — 비교용).
//  - 'cssCam'  : 카메라 키 재생을 #mapT/#bgMapT의 CSS transform(GPU 합성)으로 — 앱의 lightPanZoom과 같은 방식.
// 끝나면 만든 것을 지우고 animOff()로 원래 화면으로.
const P = window.__proto || {}; const V = P.variant || 'app', MS = P.ms || 3000;
const A = anim(), F = fills();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const easeO = (x) => easeOut(x);
const tracks = A.tracks;
const colTr = {}; for (const tr of tracks) if (tr.kind === 'fill') colTr[tr.key.toUpperCase()] = tr;
const prog = (tr, t) => (tr ? easeO(clamp01((t - tr.start) / Math.max(tr.len, 0.001))) : 1);
const cleanup = [];
animStop(); animOff();
await sleep(300);
const frames = []; let t0 = null; const work = [];
const loop = (fn) => new Promise((res) => { const step = (ts) => { if (t0 == null) t0 = ts; const t = (ts - t0) / 1000; frames.push(ts); const a = performance.now(); fn(t); work.push(performance.now() - a); if (ts - t0 < MS) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
let info = {};
if (V === 'app') {
  await loop((t) => animSeek(t % A.dur));
} else if (V === 'imgLayers') {
  const fitEl = document.querySelector('.fit');
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1';
  const cols = Object.keys(colTr);
  const t1 = performance.now();
  const urls = [];
  const mk = async (blob) => { const u = URL.createObjectURL(blob); urls.push(u); const im = new Image(); im.src = u; await im.decode(); im.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;will-change:opacity'; return im; };
  const imgs = {};
  for (const c of cols) imgs[c] = await mk(await aeFillBlob(c));
  info.bakeMs = Math.round(performance.now() - t1); info.layers = cols.length;
  for (const c of cols) host.append(imgs[c]);
  // 라이브 SVG의 존 칠은 베이스로(색은 위 이미지가 담당) — 경계선·라벨은 SVG 그대로
  const L_map = document.querySelector('#L_map');
  for (const [, arr] of zoneEls) for (const { el: e } of arr) e.setAttribute('fill', S.base);
  // 이미지 레이어를 지도(L_map) 위·라벨 아래에 끼울 수 없으니(SVG 안) 측정용으로 svg 위에 올린다(합성 비용 측정이 목적)
  fitEl.append(host);
  cleanup.push(() => { host.remove(); urls.forEach((u) => URL.revokeObjectURL(u)); });
  const labs = [...document.querySelectorAll('#L_labels > g')].map((g) => ({ g, it: itemOf({ kind: 'label', id: g.dataset.id }), tr: tracks.find((x) => x.kind === 'label' && x.key === g.dataset.id) }));
  await loop((tt) => {
    const t = tt % A.dur;
    for (const c of cols) imgs[c].style.opacity = prog(colTr[c], t).toFixed(3);
    for (const { g, it, tr } of labs) { if (!it) continue; const e = prog(tr, t); g.setAttribute('transform', `translate(${it.x} ${it.y + (1 - e) * 26})`); g.setAttribute('opacity', e.toFixed(3)); }
  });
} else if (V === 'svgGroups') {
  const parent = document.querySelector('#gMain').parentNode;
  const groups = {};
  for (const c of Object.keys(colTr)) { const g = el('g', { 'data-proto': c }); if (P.wc) g.style.willChange = 'opacity'; groups[c] = g; parent.insertBefore(g, document.querySelector('#gMain').nextSibling); }
  for (const [id, arr] of zoneEls) {
    const col = F[id]; for (const { el: e } of arr) { e.setAttribute('fill', S.base); if (!col || !groups[col.toUpperCase()]) continue; if (e.closest('#gMain')) { const cl = e.cloneNode(false); cl.removeAttribute('id'); cl.setAttribute('fill', col); cl.setAttribute('stroke', 'none'); groups[col.toUpperCase()].append(cl); } }
  }
  cleanup.push(() => { for (const g of Object.values(groups)) g.remove(); });
  const labs = [...document.querySelectorAll('#L_labels > g')].map((g) => ({ g, it: itemOf({ kind: 'label', id: g.dataset.id }), tr: tracks.find((x) => x.kind === 'label' && x.key === g.dataset.id) }));
  await loop((tt) => {
    const t = tt % A.dur;
    for (const c in groups) groups[c].setAttribute('opacity', prog(colTr[c], t).toFixed(3));
    for (const { g, it, tr } of labs) { if (!it) continue; const e = prog(tr, t); g.setAttribute('transform', `translate(${it.x} ${it.y + (1 - e) * 26})`); g.setAttribute('opacity', e.toFixed(3)); }
  });
} else if (V === 'cssCam') {
  // 칠은 최종 상태로 두고(애니 없음) 카메라만 — 지금 방식(속성 transform, applyCam)과 CSS transform을 비교하려면 variant=attrCam도 함께 잰다
  const ids = ['#bgMapT', '#mapT'];
  const nodes = ids.map((s) => document.querySelector(s)).filter(Boolean);
  for (const n of nodes) { n.style.willChange = 'transform'; n.style.transformBox = 'view-box'; n.style.transformOrigin = '0 0'; }
  const m0 = { ...S.map };
  cleanup.push(() => { for (const n of nodes) { n.style.willChange = ''; n.style.transformBox = ''; n.style.transformOrigin = ''; n.style.transform = ''; } });
  await loop((tt) => { const c = camAt(tt % A.dur); if (!c) return; const tr = `translate(${c.x}px, ${c.y}px) scale(${c.s})`; for (const n of nodes) n.style.transform = tr; });
  info.m0 = m0;
} else if (V === 'attrCam') {
  const m0 = { ...S.map };
  await loop((tt) => { const c = camAt(tt % A.dur); if (!c) return; S.map.x = c.x; S.map.y = c.y; S.map.s = c.s; renderMapTransform(); });
  S.map.x = m0.x; S.map.y = m0.y; S.map.s = m0.s; renderMapTransform();
}
for (const f of cleanup) f();
animOff();
const iv = []; for (let i = 1; i < frames.length; i++) iv.push(frames[i] - frames[i - 1]);
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : 0; };
const r2 = (x) => Math.round(x * 100) / 100;
return { variant: V, info, frames: { n: frames.length, mean: r2(iv.reduce((a, b) => a + b, 0) / (iv.length || 1)), p50: r2(q(iv, 0.5)), p95: r2(q(iv, 0.95)), max: r2(Math.max(0, ...iv)), over20: iv.filter((x) => x > 20).length }, jsPerFrame: { mean: r2(work.reduce((a, b) => a + b, 0) / (work.length || 1)), max: r2(Math.max(0, ...work)) } };
