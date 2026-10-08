// 페이지 도우미 — 부팅 뒤 Runtime.evaluate 로 한 번 넣는다. 앱 내부 함수(IIFE)는 못 부르므로 DOM·localStorage만 쓴다.
(() => {
  const H = window.__h = {};
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  H.sleep = sleep;
  H.closePopups = async () => {
    for (let i = 0; i < 16; i++) {
      if ($('#tourWrap.on')) $('#tourClose') && $('#tourClose').click();
      const x = document.querySelector('#tossOv .tossX'); if (x) x.click();
      await sleep(150);
      if (!$('#tourWrap.on') && !document.getElementById('tossOv')) break;
    }
    return { tour: !!$('#tourWrap.on'), toss: !!document.getElementById('tossOv') };
  };
  H.work = () => { try { return JSON.parse(localStorage.getItem('wcg_work') || 'null'); } catch (e) { return null; } };
  H.setupCG = async (res, style) => {
    await H.closePopups();
    const ovOn = () => $('#cgSetupOv') && $('#cgSetupOv').classList.contains('on');
    if (!ovOn()) { if ($('#startOverlay').classList.contains('on') && $('#startSetup')) $('#startSetup').click(); else $('#cgSetupBtn').click(); }
    await sleep(500);
    const st = style === 'seoul' ? 'sgg' : style;
    const rb = $(`#resBtns [data-res="${res}"]`), sb = $(`#styleBtns [data-style="${st}"]`);
    if (rb) rb.click(); if (sb) sb.click();
    await sleep(80);
    if ($('#cgsDone') && !$('#cgsDone').disabled) $('#cgsDone').click(); else if ($('#cgsX')) $('#cgsX').click();
    await sleep(1200);
    if (style === 'seoul') {
      $('#fctMapBtn').click(); await sleep(200);
      const o = document.querySelector('#fctMapPop .bmOpt[data-mt="seoul"]'); if (o) o.click();
      await sleep(1200);
    }
    await H.closePopups();
    await sleep(1800);   // 자동저장(1.5초) 기다림
    const w = H.work();
    return { res: w && w.res, style: w && w.style, start: $('#startOverlay').classList.contains('on'), ov: ovOn() };
  };
  // 브러쉬 영역 단위(앱의 brushSido 와 같은 규칙)
  const WARN = { '01': '경기', '02': '강원', '03': '대전·충남', '04': '충북', '05': '전남', '06': '전북', '07': '경북', '08': '경남·부산·울산', '09': '제주', '10': '서울', '11': '인천', '13': '광주', '14': '대구', '17': '세종' };
  H.sidoOf = (id) => { const m = /^L1(\d\d)/.exec(id); if (m) return WARN[m[1]] || id; return id.includes('/') ? id.split('/')[0] : id; };
  H.mainZones = (sido) => [...document.querySelectorAll('#gMain > path.zone')].filter((z) => H.sidoOf(z.dataset.id) === sido);
  // 큰 순서 시도 목록(본토)
  H.sidoList = () => {
    const m = new Map();
    for (const z of document.querySelectorAll('#gMain > path.zone')) {
      const k = H.sidoOf(z.dataset.id); const b = z.getBBox();
      m.set(k, (m.get(k) || 0) + b.width * b.height);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  };
  // 그 시도 안(커서 아래 맨 위 존이 그 시도인) 화면 점
  H.pointIn = (sido, seed = 1) => {
    const zs = H.mainZones(sido).map((z) => ({ z, r: z.getBoundingClientRect() })).sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
    let s = seed * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (const { z, r } of zs) {
      for (let i = 0; i < 200; i++) {
        const x = r.left + r.width * (0.2 + 0.6 * rnd()), y = r.top + r.height * (0.2 + 0.6 * rnd());
        const els = document.elementsFromPoint(x, y); const top = els.find((e) => e.closest && e.closest('.zone'));
        if (top && top.closest('.zone') === z && els[0] && els[0].closest && els[0].closest('#cg')) return { x: Math.round(x), y: Math.round(y) };
      }
    }
    return null;
  };
  // 그 시도 화면 bbox
  H.rectOf = (sido) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const z of H.mainZones(sido)) { const r = z.getBoundingClientRect(); x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  // 지그재그 획 경로(화면 좌표) — 시도 bbox 가운데 70% 안을 왕복
  H.strokePath = (sido, n, seed = 1) => {
    const r = H.rectOf(sido), pts = [];
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, ax = r.w * 0.35, ay = r.h * 0.35;
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      pts.push({ x: Math.round((cx + ax * Math.sin(t * Math.PI * 2 * 2.2 + seed)) * 10) / 10, y: Math.round((cy - ay + 2 * ay * t + ay * 0.15 * Math.sin(t * 40)) * 10) / 10 });
    }
    return pts;
  };
  // 기존 획 N개 생성 — 저장 형식(S.brushByStyle[style] 획 구조) 그대로. 본토 공간, 로컬 좌표.
  H.genStrokes = (sidos, N, opt = {}) => {
    const gMain = $('#gMain'), svg = $('#cg');
    const m = svg.getScreenCTM().inverse().multiply(gMain.getScreenCTM());
    const scale = Math.hypot(m.a, m.b) || 1;
    const size = opt.size || 55, r = Math.max(1, size / scale);
    const cols = opt.cols || ['#E5231E', '#2E6FB0', '#F2C230', '#3DAA5C'];
    const boxes = sidos.map((sd) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const z of H.mainZones(sd)) { const b = z.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); }
      return { x0, y0, x1, y1 };
    });
    let s = 12345; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const keys = sidos.map((sd) => 'main::' + sd);
    const out = []; let dabsTotal = 0;
    for (let i = 0; i < N; i++) {
      const b = boxes[i % boxes.length];
      const col = cols[Math.floor(i / (opt.runLen || 25)) % cols.length];
      const erase = opt.eraseEvery ? (i % opt.eraseEvery === opt.eraseEvery - 1) : false;
      const L = 40 + Math.floor(rnd() * 80);
      let x = b.x0 + (b.x1 - b.x0) * (0.15 + 0.7 * rnd()), y = b.y0 + (b.y1 - b.y0) * (0.15 + 0.7 * rnd()), a = rnd() * Math.PI * 2;
      const dabs = [];
      for (let k = 0; k < L; k++) {
        dabs.push([x + rnd() * 1e-9, y + rnd() * 1e-9]);   // 실제처럼 긴 소수
        a += (rnd() - 0.5) * 0.6; x += Math.cos(a) * r * 0.3; y += Math.sin(a) * r * 0.3;
        if (x < b.x0 || x > b.x1) a = Math.PI - a; if (y < b.y0 || y > b.y1) a = -a;
      }
      dabsTotal += L;
      out.push({ space: 'main', keys: keys.slice(), col, r, op: 55, soft: 70, erase, dabs });
    }
    return { strokes: out, r, scale, dabsTotal };
  };
  H.injectStrokes = (style, sidos, N, opt) => {
    const w = H.work(); if (!w) return { err: 'no work' };
    const g = H.genStrokes(sidos, N, opt);
    w.brushByStyle = w.brushByStyle || {}; w.brushByStyle[style] = g.strokes;
    const s = JSON.stringify(w);
    localStorage.setItem('wcg_work', s);
    localStorage.removeItem('wcg_pending_start');
    sessionStorage.setItem('wcg_open', '1');
    return { n: g.strokes.length, dabs: g.dabsTotal, r: g.r, scale: g.scale, workKB: Math.round(s.length / 1024) };
  };
  H.state = () => {
    const w = H.work();
    const bs = w && w.brushByStyle && w.brushByStyle[w.style];
    return { res: w && w.res, style: w && w.style, strokes: bs ? bs.length : 0, workKB: Math.round((localStorage.getItem('wcg_work') || '').length / 1024),
      brushImgs: document.querySelectorAll('image.brushLayer').length, selHi: document.querySelectorAll('.brushSelHi').length,
      mode: $('#mBrush') && $('#mBrush').classList.contains('on') ? 'brush' : 'other', shadowFilter: $('#L_map').getAttribute('filter'),
      gMainFilter: $('#gMain').getAttribute('filter'), zones: document.querySelectorAll('.zone').length,
      fit: (() => { const f = document.querySelector('.fit'); return f ? getComputedStyle(f).transform : null; })(),
      svgRect: (() => { const r = $('#cg').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(), dpr: devicePixelRatio, win: [innerWidth, innerHeight],
      brushCanvas: H.brushCanvasSize() };
  };
  // 앱 ensureSpaceCanvas 와 같은 계산(본토) — 브러쉬 캔버스 픽셀 크기
  H.brushCanvasSize = () => {
    const b = $('#zoneLineMain').getBBox(); const pad = 30;
    const w = b.width + pad * 2, h = b.height + pad * 2; const K = Math.min(3, Math.max(1, 1400 / Math.max(w, h)));
    return { W: Math.round(w * K), H: Math.round(h * K), K: Math.round(K * 1000) / 1000, bbox: [b.x - pad, b.y - pad, w, h].map((v) => Math.round(v)) };
  };
  H.setRange = (sel, v) => { const e = $(sel); if (!e) return false; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); return true; };
  return true;
})();
