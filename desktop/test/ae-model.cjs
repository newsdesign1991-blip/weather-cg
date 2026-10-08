// AE 흉내(테스트 전용) — 헬퍼(desktop/wns/ae-jsx.js = helper.py)가 만든 JSX를 Node vm에서 '그대로' 실행해
// 프로젝트(컴프·레이어·속성·키·표현식·부모)를 만들고, 시각마다 속성 값을 계산한다.
//  · 키 보간 = AE 시간 베지어: 두 키 사이 (시간, 값) 3차 베지어, P1 = (tₐ + 영향ₒ·D, vₐ + 속도ₒ·영향ₒ·D), P2 = (t_b − 영향ᵢ·D, v_b − 속도ᵢ·영향ᵢ·D)
//    (bodymovin(로티)이 AE 키를 옮기는 식과 같다). 선형 키 = 평균 속도·영향 16.67%(직선). 공간 속성(Position)은 두 키 사이 직선 위 거리에 이징.
//  · 표현식 = 문자열을 vm에서 그대로 실행(thisComp.layer(이름).position·toComp·transform·effect(이름)(1)·createPath·time).
//  · 부모 대입 = AE처럼 지금 시각(0)의 부모 변환으로 보정(F1을 그대로 재현). 틀린 사용(이즈 개수·범위 밖 영향·없는 키)은 AE처럼 예외 + errors 기록.
// 한계: 3D·카메라·마스크 모양·효과 렌더·텍스트 크기는 흉내만(값 저장). 3키 이상 위치의 '자동 베지어' 휘어짐은 모델에 없다(curved 표시만).
'use strict';
const vm = require('node:vm');

const KIT = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
const clone = (v) => (Array.isArray(v) ? v.map(clone) : (v && typeof v === 'object' ? Object.assign(Object.create(Object.getPrototypeOf(v)), v) : v));
const dimsOf = (v) => (Array.isArray(v) ? v.length : 1);
const TRANSFORM = { 'Anchor Point': 'anchor', Position: 'position', Scale: 'scale', Rotation: 'rotation', Opacity: 'opacity' };
const GROUPS = new Set(['ADBE Root Vectors Group', 'ADBE Vectors Group', 'ADBE Effect Parade', 'ADBE Vector Stroke Dashes', 'ADBE Mask Parade']);

function mkModel(opt = {}) {
  const M = { comps: [], items: [], errors: [], log: [] };
  const fail = (msg) => { const e = new Error(msg); M.errors.push(msg); throw e; };

  class KeyframeEase {
    constructor(speed, influence) {
      if (!(influence >= 0.1 && influence <= 100)) fail('KeyframeEase 영향 범위 밖: ' + influence);
      this.speed = speed; this.influence = influence;
    }
  }
  class Shape { constructor() { this.vertices = []; this.inTangents = []; this.outTangents = []; this.closed = true; } }

  // ── 속성·그룹 ──
  class Node {
    constructor(layer, name, value, spatial) {
      this.layer = layer; this.name = name; this.matchName = name; this._v = value === undefined ? 0 : value;
      this.isSpatial = !!spatial; this.keys = []; this.expression = ''; this.kids = [];
    }
    get value() { return this._v; }
    get numKeys() { return this.keys.length; }
    property(k) {
      if (typeof k === 'number') { const c = this.kids[k - 1]; if (!c) { const n = new Node(this.layer, String(k), 0); this.kids[k - 1] = n; return n; } return c; }
      let c = this.kids.find((x) => x && (x.name === k || x.matchName === k));
      if (!c) { c = new Node(this.layer, k, GROUPS.has(k) ? undefined : 0, /Position$/.test(k) && k !== 'ADBE Vector Ellipse Size'); this.kids.push(c); }
      return c;
    }
    addProperty(match) {
      const n = new Node(this.layer, match, undefined);
      if (match === 'ADBE Slider Control') n.kids = [new Node(this.layer, 'Slider', 0)];
      if (match === 'ADBE Venetian Blinds') n.kids = ['Transition Completion', 'Direction', 'Width', 'Feather'].map((nm) => new Node(this.layer, nm, 0));
      if (match === 'ADBE Vector Shape - Ellipse') n.kids = [new Node(this.layer, 'ADBE Vector Ellipse Size', [100, 100]), new Node(this.layer, 'ADBE Vector Ellipse Position', [0, 0], true)];
      if (match === 'ADBE Vector Filter - Trim') n.kids = [new Node(this.layer, 'ADBE Vector Trim Start', 0), new Node(this.layer, 'ADBE Vector Trim End', 100), new Node(this.layer, 'ADBE Vector Trim Offset', 0)];
      this.kids.push(n);
      return n;
    }
    setValue(v) { if (this.keys.length) fail('키가 있는 속성에 setValue: ' + this.name); this._v = clone(v); }
    setValueAtTime(t, v) {
      if (!isFinite(t)) fail('시각이 수가 아님: ' + t);
      const key = { t, v: clone(v), inI: KIT.LINEAR, outI: KIT.LINEAR, inE: null, outE: null, tan: null };
      const i = this.keys.findIndex((k) => Math.abs(k.t - t) < 1e-9);
      if (i >= 0) this.keys[i] = key; else { this.keys.push(key); this.keys.sort((a, b) => a.t - b.t); }
    }
    _key(k) { const key = this.keys[k - 1]; if (!key) fail('없는 키 ' + k + ' (' + this.name + ')'); return key; }
    setInterpolationTypeAtKey(k, a, b) { const key = this._key(k); key.inI = a; key.outI = b == null ? a : b; }
    setTemporalEaseAtKey(k, a, b) {
      const key = this._key(k), n = this.isSpatial ? 1 : dimsOf(this.keys[0].v);
      b = b || a;
      if (!Array.isArray(a) || a.length !== n || b.length !== n) fail('이즈 개수 ' + a.length + ' ≠ 차원 ' + n + ' (' + this.name + (this.isSpatial ? ', 공간' : '') + ')');
      key.inE = a.map((e) => ({ speed: e.speed, influence: e.influence })); key.outE = b.map((e) => ({ speed: e.speed, influence: e.influence }));
    }
    setSpatialTangentsAtKey(k, a, b) { if (!this.isSpatial) fail('공간 속성 아님'); this._key(k).tan = [a, b]; }
    setSpatialAutoBezierAtKey(k, v) { if (!this.isSpatial) fail('공간 속성 아님'); this._key(k).auto = v; }
    setSpatialContinuousAtKey(k, v) { if (!this.isSpatial) fail('공간 속성 아님'); this._key(k).cont = v; }
    // 키 보간(표현식 전)
    keyedAt(t) {
      const K = this.keys;
      if (!K.length) return this._v;
      if (t <= K[0].t) return clone(K[0].v);
      const Z = K[K.length - 1]; if (t >= Z.t) return clone(Z.v);
      let i = 0; while (t > K[i + 1].t) i++;
      const a = K[i], b = K[i + 1], D = b.t - a.t, x = t - a.t;
      if (a.outI === KIT.HOLD) return clone(a.v);
      if (this.isSpatial) {
        const d = Math.hypot(...a.v.map((v, j) => b.v[j] - v));
        const f = d > 0 ? seg1(0, d, x, D, a.outI, a.outE && a.outE[0], b.inI, b.inE && b.inE[0]) / d : 0;
        return a.v.map((v, j) => v + (b.v[j] - v) * f);
      }
      if (Array.isArray(a.v)) return a.v.map((v, j) => seg1(v, b.v[j], x, D, a.outI, a.outE && a.outE[j], b.inI, b.inE && b.inE[j]));
      return seg1(a.v, b.v, x, D, a.outI, a.outE && a.outE[0], b.inI, b.inE && b.inE[0]);
    }
    valueAtTime(t) { return this.expression ? evalExpr(this, t) : this.keyedAt(t); }
  }
  // 1차원 두 키 사이 — 선형 쪽은 평균 속도·영향 1/6(직선과 같다), 베지어 쪽은 그 이즈
  function seg1(va, vb, x, D, oI, oE, iI, iE) {
    const avg = (vb - va) / D;
    const o = oI === KIT.LINEAR || !oE ? { speed: avg, influence: 100 / 6 } : oE;
    const i = iI === KIT.LINEAR || !iE ? { speed: avg, influence: 100 / 6 } : iE;
    if (oI === KIT.LINEAR && iI === KIT.LINEAR) return va + avg * x;
    const x1 = (o.influence / 100) * D, y1 = va + o.speed * x1, x2 = D - (i.influence / 100) * D, y2 = vb - i.speed * (i.influence / 100) * D;
    const X = (u) => 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u * D;
    const Y = (u) => (1 - u) ** 3 * va + 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3 * vb;
    let lo = 0, hi = 1;
    for (let k = 0; k < 64; k++) { const m = (lo + hi) / 2; if (X(m) < x) lo = m; else hi = m; }
    return Y((lo + hi) / 2);
  }

  // ── 레이어·컴프 ──
  let uid = 0;
  class Layer {
    constructor(comp, kind, src, name) {
      this.comp = comp; this.kind = kind; this.source = src || null; this.name = name || kind; this.id = ++uid;
      this.enabled = true; this.guideLayer = false; this.inPoint = 0; this._parent = null;
      const w = src && src.width != null ? src.width : 0, h = src && src.height != null ? src.height : 0;
      const anchor = kind === 'av' || kind === 'solid' || kind === 'comp' ? [w / 2, h / 2] : [0, 0];   // 그림·단색·프리컴프 = 가운데, 널·셰이프·글자 = 0,0
      this.root = new Node(this, 'root');
      this.tf = {
        anchor: new Node(this, 'Anchor Point', anchor, true), position: new Node(this, 'Position', [comp.width / 2, comp.height / 2], true),
        scale: new Node(this, 'Scale', [100, 100]), rotation: new Node(this, 'Rotation', 0), opacity: new Node(this, 'Opacity', 100),
      };
      if (kind === 'text') this.text = new Node(this, 'Source Text', { text: src, fontSize: 12 });
    }
    property(k) {
      if (TRANSFORM[k]) return this.tf[TRANSFORM[k]];
      if (k === 'Source Text' && this.text) return this.text;
      return this.root.property(k);
    }
    get index() { return this.comp.list.indexOf(this) + 1; }
    get parent() { return this._parent; }
    set parent(p) {
      // AE: parent 대입은 지금 시각(0)의 부모 변환으로 보정해 화면 자리를 그대로 둔다(setParentWithJump는 보정 없음)
      const t = 0, W = worldAt(this, t);
      for (const nd of [this.tf.position, this.tf.scale, this.tf.rotation]) if (nd.keys.length) M.log.push('키 있는 속성에 부모 보정(무시): ' + this.name);
      this._parent = p || null;
      const P = p ? worldAt(p, t) : IDM, L = mul(inv(P), W);
      const sc = Math.sqrt(Math.abs(L[0] * L[3] - L[1] * L[2])) * 100, rot = Math.atan2(L[1], L[0]) * 180 / Math.PI;
      const a = this.tf.anchor.keyedAt(t), pos = apply(L, a);
      if (!this.tf.position.keys.length) this.tf.position._v = pos;
      if (!this.tf.scale.keys.length) this.tf.scale._v = [sc, sc];
      if (!this.tf.rotation.keys.length) this.tf.rotation._v = rot;
    }
    setParentWithJump(p) { this._parent = p || null; }
    moveToEnd() { const l = this.comp.list; l.splice(l.indexOf(this), 1); l.push(this); }
    moveToBeginning() { const l = this.comp.list; l.splice(l.indexOf(this), 1); l.unshift(this); }
    moveAfter(o) { const l = this.comp.list; l.splice(l.indexOf(this), 1); l.splice(l.indexOf(o) + 1, 0, this); }
    moveBefore(o) { const l = this.comp.list; l.splice(l.indexOf(this), 1); l.splice(l.indexOf(o), 0, this); }
    sourceRectAtTime() { return { left: -50, top: -20, width: 100, height: 40 }; }
    effectNode(nm) { const fx = this.root.kids.find((k) => k.name === 'ADBE Effect Parade'); const e = fx && fx.kids.find((k) => k.name === nm || k.matchName === nm); if (!e) fail('효과 없음: ' + nm + ' (' + this.name + ')'); return e; }
  }
  class Comp {
    constructor(name, w, h, par, dur, fps) {
      this.name = name; this.width = w; this.height = h; this.duration = dur; this.frameRate = fps; this.list = []; this.typeName = 'Composition';
      const c = this;
      this.layers = {
        add: (item) => c._add(new Layer(c, item instanceof Comp ? 'comp' : 'av', item, item.name)),
        addNull: () => c._add(new Layer(c, 'null', null, 'Null')),
        addShape: () => c._add(new Layer(c, 'shape', null, 'Shape')),
        addText: (txt) => c._add(new Layer(c, 'text', txt, String(txt))),
        addSolid: (col, nm, w2, h2) => c._add(new Layer(c, 'solid', { width: w2, height: h2, color: col }, nm)),
      };
      M.comps.push(this);
    }
    _add(l) { this.list.unshift(l); return l; }   // 새 레이어 = 맨 위(index 1)
    layer(k) { return typeof k === 'number' ? this.list[k - 1] : this.list.find((l) => l.name === k); }
    openInViewer() { M.viewer = this; }
  }

  // ── 2D 변환(행렬 [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f) ──
  const IDM = [1, 0, 0, 1, 0, 0];
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const inv = (A) => { const d = A[0] * A[3] - A[1] * A[2]; return [A[3] / d, -A[1] / d, -A[2] / d, A[0] / d, (A[2] * A[5] - A[3] * A[4]) / d, (A[1] * A[4] - A[0] * A[5]) / d]; };
  const apply = (A, p) => [A[0] * p[0] + A[2] * p[1] + A[4], A[1] * p[0] + A[3] * p[1] + A[5]];
  function localAt(l, t) {
    const a = l.tf.anchor.valueAtTime(t), p = l.tf.position.valueAtTime(t), s = l.tf.scale.valueAtTime(t), r = l.tf.rotation.valueAtTime(t) * Math.PI / 180;
    const sx = (Array.isArray(s) ? s[0] : s) / 100, sy = (Array.isArray(s) ? s[1] : s) / 100, c = Math.cos(r), n = Math.sin(r);
    const L = [c * sx, n * sx, -n * sy, c * sy, 0, 0];
    const o = apply(L, a);
    L[4] = p[0] - o[0]; L[5] = p[1] - o[1];
    return L;
  }
  function worldAt(l, t) { const L = localAt(l, t); return l._parent ? mul(worldAt(l._parent, t), L) : L; }

  // ── 표현식 ──
  const ctxPool = [];
  let depth = 0;
  function layerProxy(l, t) {
    if (!l) throw new Error('표현식: 레이어 없음');
    return {
      get position() { return l.tf.position.valueAtTime(t); },
      get transform() { return { get position() { return l.tf.position.valueAtTime(t); }, get rotation() { return l.tf.rotation.valueAtTime(t); }, get scale() { return l.tf.scale.valueAtTime(t); }, get anchorPoint() { return l.tf.anchor.valueAtTime(t); }, get opacity() { return l.tf.opacity.valueAtTime(t); } }; },
      toComp: (p) => apply(worldAt(l, t), p),
      effect: (nm) => { const e = l.effectNode(nm); return (k) => e.property(k).valueAtTime(t); },
      sourceRectAtTime: () => l.sourceRectAtTime(),
      get index() { return l.index; }, get name() { return l.name; },
    };
  }
  function evalExpr(node, t) {
    const l = node.layer, comp = l.comp;
    if (depth > 20) throw new Error('표현식 재귀 너무 깊음');
    let ctx = ctxPool[depth];
    if (!ctx) { ctx = vm.createContext({ Math }); ctxPool[depth] = ctx; }
    let scr = node._scr;
    if (!scr || node._src !== node.expression) { scr = new vm.Script(node.expression); node._scr = scr; node._src = node.expression; }
    Object.assign(ctx, {
      time: t, value: node.keyedAt(t),
      thisComp: { layer: (k) => layerProxy(comp.layer(k), t), width: comp.width, height: comp.height, duration: comp.duration },
      thisLayer: layerProxy(l, t),
      effect: (nm) => { const e = l.effectNode(nm); return (k) => e.property(k).valueAtTime(t); },
      createPath: (pts, it, ot, closed) => ({ points: pts.map((p) => [p[0], p[1]]), closed: !!closed }),
    });
    depth++;
    try { return scr.runInContext(ctx); } catch (e) { M.errors.push('표현식 오류(' + l.name + ' ' + node.name + '): ' + e.message); throw e; } finally { depth--; }
  }

  // ── JSX 실행 ──
  const proj = {
    items: { addComp: (nm, w, h, par, dur, fps) => new Comp(nm, w, h, par, dur, fps) },
    importFile: (io) => { const f = String(io.file.path); const it = { name: f.split('/').pop(), path: f, width: opt.footW || 1920, height: opt.footH || 1080, typeName: 'Footage' }; M.items.push(it); return it; },
  };
  const g = {
    app: { project: proj, beginUndoGroup() {}, endUndoGroup() {} },
    KeyframeEase, Shape, KeyframeInterpolationType: KIT,
    ParagraphJustification: { LEFT_JUSTIFY: 1, CENTER_JUSTIFY: 2, RIGHT_JUSTIFY: 3 },
    ImportOptions: function ImportOptions(file) { this.file = file; },
    File: (p) => ({ path: p }),
    Math, String, parseInt, Array,
  };
  M.run = (jsx) => { vm.createContext(g); vm.runInContext(jsx, g); M.main = M.comps[0]; return M; };
  M.find = (name, comp) => (comp || M.main).list.find((l) => l.name === name) || M.comps.flatMap((c) => c.list).find((l) => l.name === name) || null;
  M.findAll = (re) => M.comps.flatMap((c) => c.list.filter((l) => re.test(l.name)));
  M.worldAt = worldAt; M.apply = apply; M.KIT = KIT;
  // 셰이프 레이어 안 모든 노드(깊이 우선)
  M.nodes = (l) => { const out = []; const walk = (n) => { for (const k of n.kids) if (k) { out.push(k); walk(k); } }; walk(l.root); return out; };
  return M;
}
// 레이어 이름은 JSX 안에서 \uXXXX로 쓰여 실행 후엔 한글 — 테스트 편의
module.exports = { mkModel, KIT };
