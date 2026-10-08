// 측정 계측 — 페이지 스크립트보다 먼저 주입(Page.addScriptToEvaluateOnNewDocument). 앱 코드는 안 건드리고
// 브라우저 API·이벤트 리스너·rAF·타이머를 감싸 '측정 켜짐(P.on)'일 때만 시간을 모은다.
(() => {
  if (window.__perf) return;
  const now = () => performance.now();
  const P = window.__perf = { on: false, acc: {}, lis: {}, ev: {}, cbs: {}, t0: 0 };
  const add = (tab, k, d) => { const r = tab[k] || (tab[k] = { n: 0, t: 0, max: 0 }); r.n++; r.t += d; if (d > r.max) r.max = d; };
  P.add = add;
  const wrapM = (proto, name, label, filter) => {
    const orig = proto && proto[name]; if (typeof orig !== 'function') return;
    proto[name] = function (...a) {
      if (!P.on || (filter && !filter(a))) return orig.apply(this, a);
      const t = now();
      try { return orig.apply(this, a); } finally { add(P.acc, typeof label === 'function' ? label(a, this) : label, now() - t); }
    };
  };
  wrapM(HTMLCanvasElement.prototype, 'toDataURL', (a, c) => 'canvas.toDataURL(' + (c.width * c.height > 1e6 ? '>1MP' : '<=1MP') + ')');
  wrapM(HTMLCanvasElement.prototype, 'getContext', 'canvas.getContext');
  wrapM(SVGGraphicsElement.prototype, 'getScreenCTM', 'svg.getScreenCTM');
  wrapM(SVGGraphicsElement.prototype, 'getBBox', 'svg.getBBox');
  wrapM(SVGSVGElement.prototype, 'createSVGPoint', 'svg.createSVGPoint');
  wrapM(SVGGeometryElement.prototype, 'isPointInFill', 'svg.isPointInFill');
  const C2 = CanvasRenderingContext2D.prototype;
  wrapM(C2, 'clip', 'ctx.clip');
  wrapM(C2, 'drawImage', 'ctx.drawImage');
  wrapM(C2, 'fill', 'ctx.fill(dab)');
  wrapM(C2, 'createRadialGradient', 'ctx.createRadialGradient');
  wrapM(C2, 'clearRect', 'ctx.clearRect');
  wrapM(C2, 'save', 'ctx.save');
  wrapM(C2, 'restore', 'ctx.restore');
  wrapM(Path2D.prototype, 'addPath', 'Path2D.addPath');
  wrapM(Document.prototype, 'elementsFromPoint', 'doc.elementsFromPoint');
  wrapM(Document.prototype, 'querySelectorAll', 'doc.querySelectorAll');
  wrapM(Element.prototype, 'querySelectorAll', 'el.querySelectorAll');
  wrapM(Element.prototype, 'querySelector', 'el.querySelector');
  wrapM(Element.prototype, 'setAttribute', (a) => 'setAttribute(' + (a[0] === 'href' ? 'href' : a[0] === 'd' ? 'd' : 'other') + ')');
  wrapM(Element.prototype, 'remove', 'el.remove');
  wrapM(Storage.prototype, 'setItem', 'localStorage.setItem');
  wrapM(Storage.prototype, 'getItem', 'localStorage.getItem');
  // JSON (스냅샷·자동저장)
  const JS = JSON.stringify, JP = JSON.parse;
  JSON.stringify = function (...a) { if (!P.on) return JS.apply(JSON, a); const t = now(); const r = JS.apply(JSON, a); add(P.acc, 'JSON.stringify(' + ((r && r.length) > 2e5 ? '>200KB' : 'small') + ')', now() - t); return r; };
  JSON.parse = function (...a) { if (!P.on) return JP.apply(JSON, a); const t = now(); try { return JP.apply(JSON, a); } finally { add(P.acc, 'JSON.parse(' + ((a[0] && a[0].length) > 2e5 ? '>200KB' : 'small') + ')', now() - t); } };
  // Path2D 생성(존 path 문자열 파싱)
  const OP = window.Path2D;
  class WP extends OP {
    constructor(...a) {
      if (!P.on) { super(...a); return; }
      const t = now(); super(...a);
      add(P.acc, 'new Path2D(' + (typeof a[0] === 'string' ? 'd' : 'empty') + ')', now() - t);
      if (typeof a[0] === 'string') { P.pathChars = (P.pathChars || 0) + a[0].length; }
    }
  }
  window.Path2D = WP;
  // 이벤트 리스너 감싸기 — 이벤트마다 모든 리스너 시간 합 + 리스너별 합
  const TYPES = new Set(['pointerdown', 'pointermove', 'pointerup', 'pointerover', 'pointerout', 'pointerleave', 'pointerenter', 'mousemove', 'mousedown', 'mouseup', 'click', 'pointercancel', 'keydown', 'keyup', 'input', 'change']);
  const wmap = new WeakMap();
  const oAdd = EventTarget.prototype.addEventListener, oRem = EventTarget.prototype.removeEventListener;
  const capOf = (o) => (typeof o === 'boolean' ? o : !!(o && o.capture));
  const lname = (fn, tgt) => {
    const tn = tgt === window ? 'window' : tgt === document ? 'document' : (tgt && (tgt.id ? '#' + tgt.id : tgt.nodeName)) || '?';
    let src = ''; try { src = Function.prototype.toString.call(fn).replace(/\s+/g, ' ').slice(0, 70); } catch (e) {}
    return tn + ' ' + (fn.name || '') + ' :: ' + src;
  };
  const perEv = new WeakMap();
  const recEv = (ev, type, d) => {
    let r = perEv.get(ev);
    if (!r) { r = { type, ts: ev.timeStamp, t: 0, start: now() - d, trusted: ev.isTrusted }; perEv.set(ev, r); (P.ev[type] || (P.ev[type] = [])).push(r); }
    r.t += d; r.end = now();
  };
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (!TYPES.has(type) || typeof fn !== 'function') return oAdd.call(this, type, fn, opts);
    const key = type + '|' + capOf(opts);
    let m = wmap.get(fn); if (!m) wmap.set(fn, (m = new Map()));
    let w = m.get(key);
    if (!w) {
      const name = lname(fn, this);
      w = function (ev) {
        if (!P.on) return fn.call(this, ev);
        const t = now();
        try { return fn.call(this, ev); } finally { const d = now() - t; add(P.lis, type + ' @ ' + name, d); recEv(ev, type, d); }
      };
      m.set(key, w);
    }
    return oAdd.call(this, type, w, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    const m = typeof fn === 'function' && wmap.get(fn); const w = m && m.get(type + '|' + capOf(opts));
    return oRem.call(this, type, w || fn, opts);
  };
  // rAF·타이머 콜백 시간
  const oRAF = window.requestAnimationFrame.bind(window);
  P.rawRAF = oRAF;
  window.requestAnimationFrame = function (cb) {
    return oRAF(function (ts) {
      if (!P.on) return cb(ts);
      const t = now();
      try { return cb(ts); } finally { add(P.cbs, 'rAF ' + (cb.name || Function.prototype.toString.call(cb).replace(/\s+/g, ' ').slice(0, 60)), now() - t); }
    });
  };
  for (const k of ['setTimeout', 'setInterval']) {
    const o = window[k].bind(window);
    window[k] = function (cb, ms, ...rest) {
      if (typeof cb !== 'function') return o(cb, ms, ...rest);
      return o(function (...a) {
        if (!P.on) return cb.apply(this, a);
        const t = now();
        try { return cb.apply(this, a); } finally { add(P.cbs, k + ' ' + (cb.name || Function.prototype.toString.call(cb).replace(/\s+/g, ' ').slice(0, 60)), now() - t); }
      }, ms, ...rest);
    };
  }
  // 관찰자 (항상 켜두고 구간으로 자른다)
  P.loaf = []; P.lt = []; P.et = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.loaf.push(e.toJSON ? e.toJSON() : e); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) { P.loafErr = String(e); }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lt.push({ startTime: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) { P.ltErr = String(e); }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.et.push({ name: e.name, startTime: e.startTime, processingStart: e.processingStart, processingEnd: e.processingEnd, duration: e.duration, target: e.target && (e.target.id || e.target.getAttribute && e.target.getAttribute('class')) }); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch (e) { P.etErr = String(e); }
  // 브러쉬 런 이미지 href 가 바뀐 시각(손 뗀 뒤 최종 이미지가 화면 DOM에 들어간 때) — 개선 후 비동기 갱신 지연 재기
  P.mut = [];
  try {
    new MutationObserver((ms) => {
      const t = now();
      for (const m of ms) if (m.target.classList && m.target.classList.contains('brushLayer')) { P.lastHref = t; if (P.on) P.mut.push(t); break; }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['href'] });
  } catch (e) { P.mutErr = String(e); }
  // 구간 시작/끝
  P.begin = (name) => {
    P.name = name; P.acc = {}; P.lis = {}; P.ev = {}; P.cbs = {}; P.pathChars = 0; P.mut = [];
    P.frames = []; P.t0 = now(); P.on = true;
    const f = (ts) => { if (!P.on) return; P.frames.push(ts); oRAF(f); };
    oRAF(f);
    return true;
  };
  const q = (arr, p) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
  const r2 = (x) => Math.round(x * 100) / 100;
  P.end = async () => {
    // 마지막 프레임·지연 타이머까지 기다린 뒤 끈다
    await new Promise((r) => oRAF(() => oRAF(() => setTimeout(r, 50))));
    P.on = false;
    const t1 = now(), t0 = P.t0;
    const iv = []; for (let i = 1; i < P.frames.length; i++) iv.push(P.frames[i] - P.frames[i - 1]);
    const evs = {};
    for (const [type, arr] of Object.entries(P.ev)) {
      const ts = arr.map((r) => r.t);
      evs[type] = { n: arr.length, mean: r2(ts.reduce((a, b) => a + b, 0) / (ts.length || 1)), p50: r2(q(ts, 0.5)), p95: r2(q(ts, 0.95)), max: r2(Math.max(0, ...ts)), sum: r2(ts.reduce((a, b) => a + b, 0)) };
    }
    const tabOut = (tab, k = 25) => Object.entries(tab).sort((a, b) => b[1].t - a[1].t).slice(0, k).map(([n, r]) => ({ name: n, n: r.n, t: r2(r.t), avg: r2(r.t / r.n), max: r2(r.max) }));
    const loaf = P.loaf.filter((e) => e.startTime >= t0 && e.startTime <= t1);
    const loafScripts = {};
    for (const e of loaf) for (const s of e.scripts || []) { const k = (s.invoker || '') + ' | ' + (s.sourceFunctionName || '') + ' | ' + (s.invokerType || ''); add(loafScripts, k, s.duration); }
    const lt = P.lt.filter((e) => e.startTime >= t0 && e.startTime <= t1);
    const et = P.et.filter((e) => e.startTime >= t0 - 5 && e.startTime <= t1);
    // 손 뗌(pointerup 리스너 시작) → 다음 브러쉬 이미지 href 갱신까지(ms)
    const ups = (P.ev.pointerup || []).map((r) => r.start);
    const upToImg = ups.map((u) => { const m = P.mut.find((x) => x >= u); return m == null ? null : r2(m - u); });
    return {
      upToImg,
      name: P.name, spanMs: r2(t1 - t0),
      frames: { n: P.frames.length, mean: r2(iv.reduce((a, b) => a + b, 0) / (iv.length || 1)), p50: r2(q(iv, 0.5)), p95: r2(q(iv, 0.95)), max: r2(Math.max(0, ...iv)), over20: iv.filter((x) => x > 20).length, over33: iv.filter((x) => x > 33.4).length, over50: iv.filter((x) => x > 50).length },
      events: evs,
      longTasks: { n: lt.length, total: r2(lt.reduce((a, b) => a + b.duration, 0)), max: r2(Math.max(0, ...lt.map((e) => e.duration))) },
      loaf: { n: loaf.length, total: r2(loaf.reduce((a, b) => a + b.duration, 0)), blocking: r2(loaf.reduce((a, b) => a + (b.blockingDuration || 0), 0)), max: r2(Math.max(0, ...loaf.map((e) => e.duration))),
        renderTotal: r2(loaf.reduce((a, e) => a + (e.renderStart ? (e.startTime + e.duration - e.renderStart) : 0), 0)),
        styleLayoutTotal: r2(loaf.reduce((a, e) => a + (e.styleAndLayoutStart ? (e.startTime + e.duration - e.styleAndLayoutStart) : 0), 0)),
        scripts: tabOut(loafScripts, 12) },
      eventTiming: et.map((e) => ({ name: e.name, dur: r2(e.duration), proc: r2(e.processingEnd - e.processingStart), delay: r2(e.processingStart - e.startTime), target: e.target })),
      api: tabOut(P.acc, 30), listeners: tabOut(P.lis, 15), callbacks: tabOut(P.cbs, 12), pathChars: P.pathChars,
    };
  };
})();
