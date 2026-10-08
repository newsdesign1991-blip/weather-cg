// tools/load-order.cjs — js/ 모듈 '로드 순서' 정적 검사(호이스팅은 파일을 넘지 못한다).
//   node tools/load-order.cjs [앱폴더 또는 index.html] [--json] [--verbose]
//   (분할 전 한 파일을 보려면: node tools/split-app.cjs --src=… --out=<임시폴더> 로 시험 분할본을 만든 뒤 그 폴더를 준다)
//
// 하는 일: index.html의 <script src="js/…"> 순서대로 파일을 읽어 원래 IIFE 본문으로 이어 붙이고 acorn(Node 내장)으로 파싱한 뒤,
// '로드 때 실행되는' 최상위 문장(함수 선언이 아닌 모든 문장 — 리스너 등록, const 초기값, 즉시 실행 등)에서 출발해
// 그 자리에서 '동기로' 닿는 최상위 이름을 따라간다(직접 호출·IIFE·forEach/map 등 동기 콜백·new Promise).
//   - syncViol  : 뒤 파일에 선언된 이름에 로드 중 동기로 닿음 → 분할 후 ReferenceError(TDZ) 또는 함수 없음. 0이어야 한다.
//   - maybeViol : 사용자 함수에 넘긴 콜백 경유(동기일 수도) → 보수적으로 위반. 0이어야 한다.
//   - deferGap  : 이벤트 리스너·타이머 콜백이 뒤 파일 이름을 씀 → 부팅 전 '파일 사이 틈'에 입력이 오면 오류 1줄(수용, 참고용).
//   - typeofGuarded: typeof 로 감싼 뒤 파일 이름(참고용).
//   - textForward: 같은 파일 안에서 뒤에 선언된 함수에 로드 때 기댐(호이스팅 의존). 그 둘을 떼어 놓으면 안 된다(참고용).
//   - preBootTimers: boot.js가 아닌 파일이 로드 중 예약하는 타이머·rAF·then·Observer — '부팅 뒤'를 가정하면 안 된다(테스트가 허용 목록과 비교).
// 종료코드: syncViol·maybeViol이 하나라도 있으면 1.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

if (require.main === module && !process.execArgv.includes('--expose-internals')) {
  const r = spawnSync(process.execPath, ['--expose-internals', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status == null ? 1 : r.status);
}
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const { JS_HEAD } = require('./app-source.cjs');

const JS_TAG = /<script src="(js\/[\w.-]+\.js)(?:\?[^"]*)?"><\/script>/g;
const PRE = "(() => {\n'use strict';\n";

// ---------------- 분할본 읽기: 파일들을 원래 IIFE 본문 순서로 이어 붙이고 오프셋 → 파일·줄 ----------------
function loadSplit(target) {
  const indexHtml = fs.statSync(target).isDirectory() ? path.join(target, 'index.html') : target;
  const dir = path.dirname(indexHtml);
  const html = fs.readFileSync(indexHtml, 'utf8').replace(/\r\n/g, '\n');
  const files = [...html.matchAll(JS_TAG)].map((m) => m[1]);
  if (!files.length) throw new Error('index.html에 <script src="js/…"> 가 없음 — 분할 전이면 split-app --out 으로 시험 분할본을 만들어 그 폴더를 준다');
  let code = PRE;
  const ranges = [];
  for (const rel of files) {
    const s = fs.readFileSync(path.join(dir, rel), 'utf8').replace(/\r\n/g, '\n');
    const m = JS_HEAD.exec(s);
    if (!m) throw new Error(`머리 2줄 형식이 아님: ${rel}`);
    const body = s.slice(m[0].length);
    ranges.push({ rel, start: code.length, end: code.length + body.length });
    code += body;
  }
  code += '})();';
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
  const top = ast.body[0].expression.callee.body.body;
  const fileOf = (off) => { let lo = 0, hi = ranges.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ranges[mid].start <= off) lo = mid; else hi = mid - 1; } return lo; };
  const nl = []; for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) nl.push(i);
  const nlBefore = (off) => { let lo = 0, hi = nl.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < off) lo = mid + 1; else hi = mid; } return lo; };
  const where = (off) => { const k = fileOf(off); return `${ranges[k].rel}:${nlBefore(off) - nlBefore(ranges[k].start) + 3}`; };   // +3 = 머리 2줄 + 1부터
  return { files, ranges, code, top, fileOf, where };
}

// ---------------- 범위(scope) 분석 + 함수별 '실행되면 무엇을 부르나' ----------------
// ctx: 'call' | 'sync'(forEach 등 동기 콜백) | 'defer:<종류>' | 'stored' | 'ref' | 'unknown:<callee>'
const SYNC_METHODS = new Set(['forEach', 'map', 'filter', 'some', 'every', 'reduce', 'reduceRight', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flatMap', 'sort', 'toSorted', 'replace', 'replaceAll', 'from']);
const DEFER_METHODS = { addEventListener: 'event', then: 'microtask', catch: 'microtask', finally: 'microtask', setTimeout: 'timer', setInterval: 'timer', requestAnimationFrame: 'raf', requestIdleCallback: 'idle', queueMicrotask: 'microtask', observe: 'observer', toBlob: 'async-cb', decode: 'async-cb' };
const DEFER_CALLEES = { setTimeout: 'timer', setInterval: 'timer', requestAnimationFrame: 'raf', requestIdleCallback: 'idle', queueMicrotask: 'microtask' };
const DEFER_NEW = { MutationObserver: 'observer', ResizeObserver: 'observer', IntersectionObserver: 'observer', PerformanceObserver: 'observer' };
const isFn = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');

class Scope {
  constructor(parent, kind, fnNode) { this.parent = parent; this.kind = kind; this.names = new Map(); this.fnNode = fnNode || (parent && parent.fnNode); }
  declare(name, fnValue) { if (!this.names.has(name) || fnValue) this.names.set(name, fnValue || null); }
  resolve(name) { for (let s = this; s; s = s.parent) if (s.names.has(name)) return s; return null; }
}
function patternNames(p, out = []) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p.name); break;
    case 'ObjectPattern': for (const q of p.properties) patternNames(q.type === 'RestElement' ? q.argument : q.value, out); break;
    case 'ArrayPattern': for (const e of p.elements) patternNames(e, out); break;
    case 'AssignmentPattern': patternNames(p.left, out); break;
    case 'RestElement': patternNames(p.argument, out); break;
  }
  return out;
}
function hoistVars(node, scope) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => hoistVars(n, scope)); return; }
  if (!node.type) return;
  if (isFn(node) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') for (const d of node.declarations) for (const n of patternNames(d.id)) scope.declare(n, isFn(d.init) ? d.init : null);
  for (const k in node) if (k !== 'type' && k !== 'loc' && node[k] && typeof node[k] === 'object') hoistVars(node[k], scope);
}
function declareBlock(stmts, scope) {
  for (const st of stmts) {
    if (st.type === 'VariableDeclaration' && st.kind !== 'var') for (const d of st.declarations) for (const n of patternNames(d.id)) scope.declare(n, isFn(d.init) ? d.init : null);
    else if (st.type === 'FunctionDeclaration') scope.declare(st.id.name, st);
    else if (st.type === 'ClassDeclaration') scope.declare(st.id.name, null);
  }
}
function calleeInfo(callee) {
  if (!callee) return { kind: 'unknown:?' };
  if (callee.type === 'Identifier') {
    if (DEFER_CALLEES[callee.name]) return { kind: 'defer:' + DEFER_CALLEES[callee.name] };
    return { kind: 'unknown:' + callee.name, name: callee.name };
  }
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
    const p = callee.property.name;
    if (SYNC_METHODS.has(p)) return { kind: 'sync' };
    if (DEFER_METHODS[p]) return { kind: 'defer:' + DEFER_METHODS[p] };
    return { kind: 'unknown:.' + p };
  }
  return { kind: 'unknown:?' };
}

function analyze(topStatements) {
  const TOP = new Scope(null, 'top', null);
  for (const st of topStatements) {
    if (st.type === 'FunctionDeclaration') TOP.declare(st.id.name, st);
    else if (st.type === 'ClassDeclaration') TOP.declare(st.id.name, null);
    else if (st.type === 'VariableDeclaration') for (const d of st.declarations) for (const n of patternNames(d.id)) TOP.declare(n, isFn(d.init) ? d.init : null);
  }
  hoistVars(topStatements.filter((s) => s.type !== 'FunctionDeclaration'), TOP);
  const facts = new Map();
  const factOf = (owner) => { let f = facts.get(owner); if (!f) { f = { topRefs: [], uses: [] }; facts.set(owner, f); } return f; };

  function useCtx(node, parent, key, grand) {
    if (!parent) return 'ref';
    if ((parent.type === 'CallExpression' || parent.type === 'NewExpression') && key === 'callee') return 'call';
    if (parent.type === 'CallExpression' && key === 'arguments') return calleeInfo(parent.callee).kind;
    if (parent.type === 'NewExpression' && key === 'arguments') {
      if (parent.callee.type === 'Identifier' && DEFER_NEW[parent.callee.name]) return 'defer:' + DEFER_NEW[parent.callee.name];
      if (parent.callee.type === 'Identifier' && parent.callee.name === 'Promise') return 'sync';
      return 'unknown:new ' + (parent.callee.name || '?');
    }
    if (parent.type === 'MemberExpression' && key === 'object' && !parent.computed && grand && grand.node.type === 'CallExpression' && grand.key === 'callee') {
      const p = parent.property.name;
      if (p === 'call' || p === 'apply') return 'call';
      if (p === 'bind') return 'stored';
    }
    if (parent.type === 'AssignmentExpression' && key === 'right' && parent.left.type === 'MemberExpression' && !parent.left.computed && /^on[a-z]+$/.test(parent.left.property.name || '')) return 'defer:event(' + parent.left.property.name + ')';
    if (parent.type === 'AssignmentExpression' && key === 'right') return 'stored';
    if (parent.type === 'VariableDeclarator' && key === 'init') return 'stored';
    if (parent.type === 'Property' || parent.type === 'ArrayExpression' || parent.type === 'PropertyDefinition') return 'stored';
    if (parent.type === 'ReturnStatement' || parent.type === 'ArrowFunctionExpression') return 'stored';
    if (parent.type === 'ConditionalExpression' || parent.type === 'LogicalExpression') return 'stored';
    return 'ref';
  }
  function enrichCtx(ctx, parent) {
    if (ctx === 'defer:event' && parent && parent.type === 'CallExpression') {
      const a0 = parent.arguments[0];
      return a0 && a0.type === 'Literal' ? 'defer:event(' + a0.value + ')' : 'defer:event(?)';
    }
    if (ctx === 'defer:timer' && parent && parent.type === 'CallExpression') {
      const a1 = parent.arguments[1];
      return 'defer:timer(' + (a1 && a1.type === 'Literal' ? a1.value : (a1 ? 'expr' : 0)) + ')';
    }
    return ctx;
  }
  function walk(node, scope, owner, parent, key, grand) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, scope, owner, parent, key, grand)); return; }
    if (!node.type) return;
    const here = { node, key };
    switch (node.type) {
      case 'Identifier': {
        const s = scope.resolve(node.name);
        const ctx = enrichCtx(useCtx(node, parent, key, grand), parent);
        const typeofGuard = parent && parent.type === 'UnaryExpression' && parent.operator === 'typeof';
        if (s === TOP) factOf(owner).topRefs.push({ name: node.name, at: node.start, ctx, typeofGuard });
        if (s) { const fv = s.names.get(node.name); if (fv) factOf(owner).uses.push({ target: fv, ctx, at: node.start, via: node.name }); }
        return;
      }
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        if (node !== owner) {
          const ctx = enrichCtx(node.type === 'FunctionDeclaration' ? 'stored' : useCtx(node, parent, key, grand), parent);
          factOf(owner).uses.push({ target: node, ctx, at: node.start });
          analyzeFn(node, scope);
        }
        return;
      }
      case 'MemberExpression':
        walk(node.object, scope, owner, node, 'object', { node: parent, key });
        if (node.computed) walk(node.property, scope, owner, node, 'property', { node: parent, key });
        return;
      case 'Property':
        if (node.computed) walk(node.key, scope, owner, node, 'key', here);
        walk(node.value, scope, owner, node, 'value', { node: parent, key });
        return;
      case 'MethodDefinition': case 'PropertyDefinition':
        if (node.computed) walk(node.key, scope, owner, node, 'key', here);
        if (node.value) walk(node.value, scope, owner, node, 'value', here);
        return;
      case 'LabeledStatement': walk(node.body, scope, owner, node, 'body', here); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'VariableDeclaration':
        for (const d of node.declarations) { walkPattern(d.id, scope, owner, true); walk(d.init, scope, owner, d, 'init', { node, key: 'declarations' }); }
        return;
      case 'AssignmentExpression':
        if (node.left.type === 'ObjectPattern' || node.left.type === 'ArrayPattern') walkPattern(node.left, scope, owner, false);
        else walk(node.left, scope, owner, node, 'left', { node: parent, key });
        walk(node.right, scope, owner, node, 'right', { node: parent, key });
        return;
      case 'BlockStatement': case 'StaticBlock': {
        const bs = new Scope(scope, 'block');
        declareBlock(node.body, bs);
        for (const st of node.body) walk(st, bs, owner, node, 'body', { node: parent, key });
        return;
      }
      case 'SwitchStatement': {
        walk(node.discriminant, scope, owner, node, 'discriminant', here);
        const bs = new Scope(scope, 'block');
        for (const c of node.cases) declareBlock(c.consequent, bs);
        for (const c of node.cases) { walk(c.test, bs, owner, c, 'test', here); for (const st of c.consequent) walk(st, bs, owner, c, 'consequent', here); }
        return;
      }
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const bs = new Scope(scope, 'block');
        const head = node.init || node.left;
        if (head && head.type === 'VariableDeclaration' && head.kind !== 'var') for (const d of head.declarations) for (const n of patternNames(d.id)) bs.declare(n);
        for (const k of ['init', 'test', 'update', 'left', 'right', 'body']) if (node[k]) {
          if (k === 'left' && node.left.type !== 'VariableDeclaration') {
            if (node.left.type === 'Identifier' || node.left.type === 'MemberExpression') walk(node.left, bs, owner, node, 'left', here); else walkPattern(node.left, bs, owner, false);
          } else walk(node[k], bs, owner, node, k, here);
        }
        return;
      }
      case 'CatchClause': {
        const bs = new Scope(scope, 'block');
        for (const n of patternNames(node.param)) bs.declare(n);
        if (node.param) walkPattern(node.param, bs, owner, true);
        walk(node.body, bs, owner, node, 'body', here);
        return;
      }
      case 'ClassDeclaration': case 'ClassExpression': {
        if (node.superClass) walk(node.superClass, scope, owner, node, 'superClass', here);
        const cs = new Scope(scope, 'class');
        if (node.id) cs.declare(node.id.name);
        for (const m of node.body.body) {
          if (m.computed) walk(m.key, cs, owner, m, 'key', here);
          if (m.value && isFn(m.value)) { factOf(owner).uses.push({ target: m.value, ctx: 'stored', at: m.start }); analyzeFn(m.value, cs); }
          else if (m.type === 'StaticBlock') walk(m, cs, owner, node, 'body', here);
          else if (m.value) walk(m.value, cs, owner, m, 'value', here);
        }
        return;
      }
      case 'MetaProperty': case 'ThisExpression': case 'Super': case 'Literal': case 'TemplateElement': return;
    }
    for (const k in node) {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
      const v = node[k];
      if (v && typeof v === 'object') walk(v, scope, owner, node, k, { node: parent, key });
    }
  }
  function walkPattern(p, scope, owner, isDecl) {
    if (!p) return;
    switch (p.type) {
      case 'Identifier': if (!isDecl) walk(p, scope, owner, { type: 'AssignmentExpression', left: p }, 'left', null); return;
      case 'MemberExpression': walk(p, scope, owner, null, null, null); return;
      case 'ObjectPattern': for (const q of p.properties) { if (q.type === 'RestElement') walkPattern(q.argument, scope, owner, isDecl); else { if (q.computed) walk(q.key, scope, owner, q, 'key', null); walkPattern(q.value, scope, owner, isDecl); } } return;
      case 'ArrayPattern': for (const e of p.elements) walkPattern(e, scope, owner, isDecl); return;
      case 'AssignmentPattern': walkPattern(p.left, scope, owner, isDecl); walk(p.right, scope, owner, p, 'right', null); return;
      case 'RestElement': walkPattern(p.argument, scope, owner, isDecl); return;
    }
  }
  function analyzeFn(fn, outer) {
    factOf(fn);
    const fs2 = new Scope(outer, 'function', fn);
    if (fn.type === 'FunctionExpression' && fn.id) fs2.declare(fn.id.name, fn);
    for (const p of fn.params) for (const n of patternNames(p)) fs2.declare(n);
    for (const p of fn.params) walkPattern(p, fs2, fn, true);
    if (fn.body.type === 'BlockStatement') {
      hoistVars(fn.body.body, fs2);
      declareBlock(fn.body.body, fs2);
      for (const st of fn.body.body) walk(st, fs2, fn, fn.body, 'body', null);
    } else walk(fn.body, fs2, fn, fn, 'body', null);
  }
  const sites = [];
  for (const st of topStatements) {
    if (st.type === 'FunctionDeclaration') { analyzeFn(st, TOP); continue; }
    if (st.type === 'ExpressionStatement' && st.directive) continue;
    sites.push(st);
    factOf(st);
    walk(st, TOP, st, null, null, null);
  }
  return { TOP, facts, sites };
}

// ---------------- 로드 때 닿는 이름 ----------------
function analyzeLoadOrder(target) {
  const P = loadSplit(target);
  const { top, fileOf, where, files, code } = P;
  const { facts, sites } = analyze(top);
  const topDecl = new Map();
  for (const st of top) {
    const add = (n, kind) => topDecl.set(n, { at: st.start, file: fileOf(st.start), kind });
    if (st.type === 'FunctionDeclaration') add(st.id.name, 'function');
    else if (st.type === 'ClassDeclaration') add(st.id.name, 'class');
    else if (st.type === 'VariableDeclaration') for (const d of st.declarations) for (const n of patternNames(d.id)) add(n, st.kind + (isFn(d.init) ? '(fn)' : ''));
  }
  const rank = (m) => (m === 'sync' ? 0 : m === 'maybe' ? 1 : 2);
  const reach = (site) => {
    const best = new Map(); const names = new Map();
    const q = [{ owner: site, mode: 'sync', path: [] }];
    while (q.length) {
      const { owner, mode, path: pth } = q.shift();
      const f = facts.get(owner);
      if (!f) continue;
      for (const r of f.topRefs) {
        const prev = names.get(r.name);
        if (!prev || rank(mode) < rank(prev.mode)) names.set(r.name, { mode, path: pth, ctx: r.ctx, typeofGuard: r.typeofGuard, at: r.at });
      }
      for (const u of f.uses) {
        let nm;
        if (u.ctx === 'call' || u.ctx === 'sync') nm = mode;
        else if (u.ctx.startsWith('unknown:')) nm = mode === 'sync' ? 'maybe' : mode;
        else if (u.ctx.startsWith('defer:')) nm = mode.startsWith('defer:') ? mode : u.ctx;
        else continue;
        const prev = best.get(u.target);
        if (prev && rank(prev.mode) <= rank(nm)) continue;
        const step = (u.via ? u.via + '()' : '(함수)') + (u.ctx === 'call' ? '' : ` [${u.ctx}]`) + ` @${where(u.at)}`;
        best.set(u.target, { mode: nm, path: [...pth, step] });
        q.push({ owner: u.target, mode: nm, path: [...pth, step] });
      }
    }
    return names;
  };
  const out = { files, sites: sites.length, syncViol: [], maybeViol: [], deferGap: [], typeofGuarded: [], textForward: [], preBootTimers: [], loadDeps: {} };
  for (const st of sites) {
    const sf = fileOf(st.start);
    const head = code.slice(st.start, Math.min(st.end, st.start + 70)).replace(/\s+/g, ' ');
    for (const [n, info] of reach(st)) {
      const d = topDecl.get(n);
      if (!d) continue;
      if (info.mode === 'sync' && d.file !== sf) (out.loadDeps[files[sf]] ||= new Set()).add(files[d.file]);
      if (!info.mode.startsWith('defer') && !info.typeofGuard && d.at > st.end && d.file === sf) out.textForward.push({ site: where(st.start), name: n, def: where(d.at) });
      if (d.file <= sf) continue;
      const row = { site: where(st.start), src: head, name: n, def: where(d.at), mode: info.mode, ctx: info.ctx, path: info.path.join(' → ') };
      if (info.typeofGuard) out.typeofGuarded.push(row);
      else if (info.mode === 'sync') out.syncViol.push(row);
      else if (info.mode === 'maybe') out.maybeViol.push(row);
      else out.deferGap.push(row);
    }
  }
  for (const k of Object.keys(out.loadDeps)) out.loadDeps[k] = [...out.loadDeps[k]];
  // boot.js가 아닌 파일의 로드 중 지연 예약(타이머·rAF·then·Observer). 리스너 등록(addEventListener·on*)은 사용자 입력이라 뺀다.
  const SYNC_CB = /^(forEach|map|filter|some|every|reduce|find|findIndex|flatMap|sort|replace|replaceAll|from)$/;
  const DEFER_NAMES = /^(setTimeout|setInterval|requestAnimationFrame|requestIdleCallback|queueMicrotask|then|catch|finally|observe)$/;
  const visit = (n, parent) => {
    if (!n || typeof n.type !== 'string') return;
    if (isFn(n)) {
      const imm = parent && parent.type === 'CallExpression' && (parent.callee === n || (parent.callee.type === 'MemberExpression' && !parent.callee.computed && SYNC_CB.test(parent.callee.property.name) && parent.arguments.includes(n)));
      if (n.type === 'FunctionDeclaration' || !imm) return;
    }
    if (n.type === 'CallExpression') {
      const c = n.callee; const nm = c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : '');
      if (DEFER_NAMES.test(nm)) out.preBootTimers.push({ at: where(n.start), call: nm, src: code.slice(n.start, Math.min(n.end, n.start + 90)).replace(/\s+/g, ' ') });
    }
    if (n.type === 'NewExpression' && /Observer$/.test(n.callee.name || '')) out.preBootTimers.push({ at: where(n.start), call: 'new ' + n.callee.name, src: code.slice(n.start, Math.min(n.end, n.start + 90)).replace(/\s+/g, ' ') });
    for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach((x) => visit(x, n)); else if (v && typeof v.type === 'string') visit(v, n); }
  };
  for (const st of top) if (files[fileOf(st.start)] !== 'js/boot.js') visit(st, null);
  return out;
}

module.exports = { analyzeLoadOrder };

if (require.main === module) {
  const args = process.argv.slice(2);
  const target = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..'));
  const r = analyzeLoadOrder(target);
  if (args.includes('--json')) { process.stdout.write(JSON.stringify(r, null, 1)); process.exit(r.syncViol.length || r.maybeViol.length ? 1 : 0); }
  console.log(`파일 ${r.files.length}개 · 로드 때 실행 문장 ${r.sites}개`);
  console.log(`syncViol ${r.syncViol.length} · maybeViol ${r.maybeViol.length} · deferGap ${r.deferGap.length} · typeofGuarded ${r.typeofGuarded.length} · textForward ${r.textForward.length} · preBootTimers ${r.preBootTimers.length}`);
  for (const v of [...r.syncViol, ...r.maybeViol]) console.log(`  위반 ${v.mode} ${v.site} → ${v.name}(${v.def}) | ${v.src} | ${v.path}`);
  for (const t of r.textForward) console.log(`  호이스팅 의존(같은 파일) ${t.site} → ${t.name}(${t.def})`);
  for (const t of r.preBootTimers) console.log(`  부팅 전 지연 예약 ${t.at} ${t.call} | ${t.src}`);
  if (args.includes('--verbose')) {
    for (const g of r.deferGap) console.log(`  틈(리스너·타이머) ${g.site} → ${g.name}(${g.def}) [${g.ctx}]`);
    for (const [f, d] of Object.entries(r.loadDeps)) console.log(`  로드 때 의존 ${f} ← ${d.join(', ')}`);
  }
  process.exit(r.syncViol.length || r.maybeViol.length ? 1 : 0);
}
