// 결과 동일성 점검용 페이지 도우미(helpers.js 뒤에 넣는다) — 브러쉬 런 이미지·추출과 같은 래스터를 뽑고, 두 PNG를 픽셀로 비교한다.
(() => {
  const E = window.__eq = {};
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 브러쉬 이미지 href 바뀜 횟수(손 뗀 뒤 비동기 갱신이 끝났는지 보려고)
  E.mut = 0;
  new MutationObserver((ms) => { for (const m of ms) if (m.target.classList && m.target.classList.contains('brushLayer')) E.mut++; })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['href', 'style'], childList: true });
  E.settle = async (quiet = 500, max = 15000) => {
    const t0 = performance.now(); let last = E.mut, since = performance.now();
    while (performance.now() - t0 < max) { await sleep(50); if (E.mut !== last) { last = E.mut; since = performance.now(); } else if (performance.now() - since >= quiet) return true; }
    return false;
  };
  const STRIP = ['#L_sel', '#L_guides', '#L_grips', '#L_insetHits', '#L_guide', '#L_vfPreview', '#brushCursor', '#L_refImg'];
  const LAYERS = ['L_bg', 'L_sea', 'L_map', 'L_boxes', 'L_mtn', 'L_typhoon', 'L_typhoonLabels', 'L_vfBar', 'L_labels', 'L_title', 'L_legend'];
  const load = (u) => new Promise((res, rej) => { const i = new Image(); i.decoding = 'sync'; i.onload = () => res(i); i.onerror = rej; i.src = u; });
  // 추출(svgBlob)과 같은 방식: 복제 → 편집 UI 제거 → (mutate) → data:svg → 캔버스
  E.raster = async (mutate, W = 1920, H = 1080) => {
    const c = $('#cg').cloneNode(true);
    c.setAttribute('width', W); c.setAttribute('height', H);
    for (const s of STRIP) c.querySelector(s)?.remove();
    c.querySelectorAll('.brushSelHi, .brushLive').forEach((n) => n.remove());
    if (mutate) mutate(c);
    const img = await load('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c)));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(img, 0, 0, W, H);
    return cv.toDataURL();
  };
  // aeBrushBlob 와 같은 '그 색 브러쉬만' 레이어
  const aeBrush = (col) => (c) => {
    for (const k of LAYERS) if (!['L_sea', 'L_map'].includes(k)) c.querySelector('#' + k)?.remove();
    c.querySelectorAll('.zoneLine, .sidoLine').forEach((n) => n.remove());
    c.querySelector('#gMainSoft')?.remove();
    c.querySelectorAll('#gMain .zone, #gInsets .zone').forEach((z) => { z.setAttribute('fill', 'none'); z.setAttribute('stroke', 'none'); });
    c.querySelectorAll('#seaT .sea').forEach((p) => { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'none'); p.removeAttribute('mask'); });
    c.querySelectorAll('image.brushLayer').forEach((im) => { if ((im.getAttribute('data-col') || '').toUpperCase() !== col) im.remove(); else { im.style.display = ''; im.removeAttribute('opacity'); } });
  };
  E.capture = async (opt = {}) => {
    const imgs = [...document.querySelectorAll('image.brushLayer[data-col]')].map((im) => ({
      space: im.getAttribute('data-space'), col: im.getAttribute('data-col'), run: im.getAttribute('data-run'),
      geo: ['x', 'y', 'width', 'height'].map((k) => +(+im.getAttribute(k)).toFixed(3)).join(','), disp: im.style.display || '', op: im.getAttribute('opacity'), href: im.getAttribute('href') || '' }));
    const live = [...document.querySelectorAll('.brushLayer.brushLive')].map((e) => ({ tag: e.tagName, disp: e.style.display || '' }));
    const out = { imgs, live, strokes: (H().brushByStyle || {})[H().style]?.length || 0 };
    if (opt.frame !== false) out.frame = await E.raster();
    if (opt.ae !== false) { out.ae = {}; for (const col of [...new Set(imgs.map((i) => i.col))]) out.ae[col] = await E.raster(aeBrush(col)); }
    return out;
  };
  // 큰 문자열을 한 번에 넘기지 않게 — 캡처는 페이지에 두고 조각씩 꺼내거나(get) 넣는다(put)
  E.caps = {};
  E.store = async (name, opt) => { const c = await E.capture(opt); E.caps[name] = c; return { n: c.imgs.length, strokes: c.strokes, meta: c.imgs.map(({ href, ...m }) => m), cols: Object.keys(c.ae || {}), live: c.live, hasFrame: !!c.frame }; };
  E.keys = (name) => { const c = E.caps[name]; return [...c.imgs.map((_, i) => 'img:' + i), ...(c.frame ? ['frame'] : []), ...Object.keys(c.ae || {}).map((k) => 'ae:' + k)]; };
  E.get = (name, key) => { const c = E.caps[name]; if (key === 'frame') return c.frame; if (key.startsWith('img:')) return c.imgs[+key.slice(4)].href; return c.ae[key.slice(3)]; };
  E.put = (name, key, val, meta) => { const c = E.caps[name] || (E.caps[name] = { imgs: [], ae: {}, frame: null, strokes: meta && meta.strokes }); if (key === 'frame') c.frame = val; else if (key.startsWith('img:')) c.imgs[+key.slice(4)] = { ...(meta && meta.img), href: val }; else c.ae[key.slice(3)] = val; return true; };
  E.cmpCaps = async (na, nb) => {
    const a = E.caps[na], b = E.caps[nb];
    const r = { strokes: [a.strokes, b.strokes], imgCount: [a.imgs.length, b.imgs.length], meta: [], imgs: [], frame: null, ae: {} };
    for (let i = 0; i < Math.max(a.imgs.length, b.imgs.length); i++) {
      const x = a.imgs[i], y = b.imgs[i];
      if (!x || !y) { r.imgs.push({ i, missing: !x ? 'a' : 'b' }); continue; }
      const meta = ['space', 'col', 'run', 'geo', 'disp', 'op'].filter((k) => x[k] !== y[k]).map((k) => k + ':' + x[k] + '≠' + y[k]);
      if (meta.length) r.meta.push({ i, meta });
      r.imgs.push({ i, col: x.col, run: x.run, ...(await E.cmp(x.href, y.href)) });
    }
    if (a.frame && b.frame) r.frame = await E.cmp(a.frame, b.frame);
    for (const col of Object.keys(a.ae || {})) if (b.ae && b.ae[col]) r.ae[col] = await E.cmp(a.ae[col], b.ae[col]);
    return r;
  };
  const H = () => { try { return JSON.parse(localStorage.getItem('wcg_work') || '{}'); } catch (e) { return {}; } };
  // 두 PNG(data URL) 픽셀 비교 — 알파와 premultiplied 색 기준(투명에 가까운 픽셀의 rgb 반올림 잡음 배제)
  E.cmp = async (a, b) => {
    if (a === b) return { same: true, identicalBytes: true };
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: [ia.width, ia.height, ib.width, ib.height] };
    const W = ia.width, Hh = ia.height, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
    const x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, W, Hh).data; x.clearRect(0, 0, W, Hh);
    x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, W, Hh).data;
    let n = 0, painted = 0, exact = 0, mx = 0, sum = 0, o1 = 0, o2 = 0, o4 = 0, o8 = 0, o32 = 0;
    for (let i = 0; i < da.length; i += 4) {
      const aa = da[i + 3], ab = db[i + 3];
      let d = Math.abs(aa - ab);
      for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(Math.round(da[i + k] * aa / 255) - Math.round(db[i + k] * ab / 255)));
      n++; if (aa || ab) painted++;
      if (d === 0) exact++; else { sum += d; if (d > mx) mx = d; if (d > 1) o1++; if (d > 2) o2++; if (d > 4) o4++; if (d > 8) o8++; if (d > 32) o32++; }
    }
    return { w: W, h: Hh, painted, diffPx: n - exact, maxAbs: mx, meanAbsPainted: Math.round(sum / Math.max(1, painted) * 1000) / 1000, over1: o1, over2: o2, over4: o4, over8: o8, over32: o32 };
  };
  E.setColor = (c) => { const i = $('#curHex'); i.value = c; i.dispatchEvent(new Event('change', { bubbles: true })); return true; };
  return true;
})();
