// 분할 구조 검사 — js/·css/ 모듈이 MODULES.md 규칙을 지키는지(태그 순서·머리·strict·이름 충돌·?v=·로드 순서·재조립).
// node --test tests/*.test.cjs  (acorn이 필요한 검사는 Node 내장 acorn을 쓰려고 자식 프로세스(--expose-internals)로 돌린다)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const appSource = require('../tools/app-source.cjs');
const { versionOf } = require('../tools/stamp-version.cjs');

const root = path.join(__dirname, '..');
const INDEX = path.join(root, 'index.html');
const html = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');   // 태그 자체를 검사하므로 이 파일만 직접 읽는다
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const jsTags = [...html.matchAll(/<script src="(js\/[\w.-]+\.js)\?v=([0-9a-f]{8})"><\/script>/g)];
const cssTags = [...html.matchAll(/<link rel="stylesheet" href="(css\/[\w.-]+\.css)\?v=([0-9a-f]{8})">/g)];
const jsFiles = jsTags.map((m) => m[1]);
const cssFiles = cssTags.map((m) => m[1]);
const list = (d, ext) => fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith(ext)).map((f) => `${d}/${f}`).sort();
const bodyOf = (rel) => read(rel).replace(appSource.JS_HEAD, '');
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

// 브라우저에서 고칠 수 없는 전역 + 데스크톱 preload + head 인라인 var — 이 이름의 최상위 선언은 금지
const RESERVED = 'window document location top self parent frames opener globalThis NaN Infinity undefined wcgDesktop _per _mas'.split(' ');
// window 내장을 가리는 최상위 이름 금지(옛날부터 있던 function status 하나만 허용 — MODULES.md 2장)
const SHADOW = 'name status open close print find stop focus blur scroll scrollTo scrollBy alert confirm prompt fetch event origin length history screen navigator external closed localStorage sessionStorage indexedDB caches crypto performance requestAnimationFrame cancelAnimationFrame requestIdleCallback setTimeout clearTimeout setInterval clearInterval queueMicrotask getComputedStyle getSelection matchMedia innerWidth innerHeight outerWidth outerHeight devicePixelRatio visualViewport customElements Image Audio Option Blob URL URLSearchParams File FileReader FormData Worker Path2D DOMMatrix DOMParser XMLSerializer CustomEvent KeyboardEvent PointerEvent MouseEvent WheelEvent DragEvent Event EventTarget TextDecoder TextEncoder Response Request Headers AbortController OffscreenCanvas ImageData ImageBitmap createImageBitmap btoa atob structuredClone console Intl Promise Map Set WeakMap WeakSet WeakRef JSON Math Date Object Array String Number Boolean Symbol BigInt Error TypeError RangeError SyntaxError ReferenceError RegExp Reflect Proxy ArrayBuffer Uint8Array Uint8ClampedArray Float32Array Float64Array Int32Array Uint32Array DataView ResizeObserver MutationObserver IntersectionObserver HTMLElement HTMLCanvasElement SVGElement Element Node NodeFilter Document VideoEncoder VideoFrame AudioContext MediaRecorder ClipboardItem showSaveFilePicker showDirectoryPicker showOpenFilePicker isFinite isNaN parseInt parseFloat encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape eval CSS FontFace'.split(' ');
const SHADOW_OK = new Set(['status']);
// 로드 순서 검사 허용 목록(tools/load-order.cjs) — 늘리기 전에 MODULES.md 2장 규칙 3·4·8을 읽을 것
const PREBOOT_TIMERS_OK = ["js/wiring.js setTimeout setTimeout(() => document.documentElement.classList.add('anim-ready'), 80)"];
const TEXT_FORWARD_OK = ['js/wiring.js refreshToolGroup'];
// head 인라인 스크립트가 만들어도 되는 최상위 이름(배치 슬롯)
const INLINE_DECL_OK = new Set(['_per', '_mas']);

// 데이터 스크립트(js/ 밖 <script src>) — window.X = … 로 만드는 전역을 자동으로 모은다
const dataScripts = [...html.matchAll(/<script src="(?!js\/)([\w.-]+\.js)"[^>]*><\/script>/g)].map((m) => m[1]);
const DATA_GLOBALS = new Set();
for (const f of dataScripts) for (const m of fs.readFileSync(path.join(root, f), 'utf8').slice(0, 65536).matchAll(/window\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) DATA_GLOBALS.add(m[1]);

// 스크립트 최상위 선언(스크립트 범위) — acorn(Node 내장)으로: 최상위 function·class·let·const + 함수 밖 어디든 var(블록 안 var도 window로 샌다)
const DECLS_SRC = String.raw`
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const srcs = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const pn = (p, o) => { if (!p) return o; switch (p.type) { case 'Identifier': o.push(p.name); break; case 'ObjectPattern': p.properties.forEach((q) => pn(q.type === 'RestElement' ? q.argument : q.value, o)); break; case 'ArrayPattern': p.elements.forEach((e) => pn(e, o)); break; case 'AssignmentPattern': pn(p.left, o); break; case 'RestElement': pn(p.argument, o); break; } return o; };
process.stdout.write(JSON.stringify(srcs.map((src) => {
  const out = []; const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') out.push({ n: st.id.name, k: st.type === 'ClassDeclaration' ? 'class' : 'function' });
    else if (st.type === 'VariableDeclaration' && st.kind !== 'var') for (const d of st.declarations) for (const n of pn(d.id, [])) out.push({ n, k: st.kind, init: d.init && d.id.type === 'Identifier' ? src.slice(d.init.start, d.init.end).slice(0, 80) : '' });
  }
  const walk = (n) => {
    if (!n || typeof n.type !== 'string' || /Function|Class/.test(n.type)) return;
    if (n.type === 'VariableDeclaration' && n.kind === 'var') for (const d of n.declarations) for (const x of pn(d.id, [])) out.push({ n: x, k: 'var' });
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  };
  ast.body.forEach(walk);
  return out;
})));`;
const declsOf = (srcs) => JSON.parse(execFileSync(process.execPath, ['--expose-internals', '-e', DECLS_SRC], { input: JSON.stringify(srcs), encoding: 'utf8', maxBuffer: 1 << 26 }));

test('태그 = 실제 파일 1:1, 정해진 형식만(defer·async·type=module 금지), 첫 core.js·끝 boot.js, 파일 이름 규칙', () => {
  assert.ok(jsFiles.length >= 2 && cssFiles.length >= 1);
  assert.deepEqual([...jsFiles].sort(), list('js', '.js'), 'index.html <script src="js/…?v=…"> 와 js/ 폴더가 다름(태그 형식이 다르거나 ?v= 가 없어도 여기서 걸린다)');
  assert.deepEqual([...cssFiles].sort(), list('css', '.css'), 'index.html <link rel="stylesheet" href="css/…?v=…"> 와 css/ 폴더가 다름');
  assert.equal((html.match(/<script\b[^>]*\bsrc="[^"]*js\//g) || []).length, jsFiles.length, 'js 태그에 다른 속성이 붙음(defer/async/type 금지)');
  assert.equal((html.match(/<link\b[^>]*\bhref="[^"]*css\//g) || []).length, cssFiles.length, 'css 태그 형식이 다름');
  assert.equal(jsFiles[0], 'js/core.js', '첫 모듈은 core.js');
  assert.equal(jsFiles[jsFiles.length - 1], 'js/boot.js', '부팅 boot.js는 반드시 마지막');
  for (const rel of [...jsFiles, ...cssFiles]) assert.match(path.basename(rel), /^[a-z0-9-]+\.(js|css)$/, `${rel}: 파일 이름은 소문자·숫자·하이픈만(Pages는 대소문자를 가린다)`);
  assert.ok(!/\s(src|href)="\/(js|css)\//.test(html), '절대 경로(/js/…) 금지 — Pages 하위 경로에서 깨진다');
});

test('index.html 의 js·css 태그 순서가 MODULES.md 표와 같다(순서를 바꾸거나 파일을 넣으면 표도 함께 고친다)', () => {
  const md = fs.readFileSync(path.join(root, 'MODULES.md'), 'utf8').replace(/\r\n/g, '\n');
  const rows = (re) => [...md.matchAll(re)].map((m) => m[1]);
  assert.deepEqual(rows(/^\|\s*\d+\s*\|\s*`(js\/[\w.-]+\.js)`/gm), jsFiles, 'MODULES.md 3장 JS 표의 순서');
  assert.deepEqual(rows(/^\|\s*\d+\s*\|\s*`(css\/[\w.-]+\.css)`/gm), cssFiles, 'MODULES.md 4장 CSS 표의 순서');
});

test('?v= 가 파일 내용 해시(CR 제외 md5 앞 8자리)와 같다 — 낡았으면: node tools/stamp-version.cjs', () => {
  const stale = [...jsTags, ...cssTags].filter((m) => versionOf(path.join(root, m[1])) !== m[2]).map((m) => m[1]);
  assert.deepEqual(stale, []);
});

test("각 js: 머리 주석 + 'use strict'; 두 줄, 단독 컴파일, strict 모드, </script 없음 / 각 css: 머리 주석", () => {
  for (const rel of jsFiles) {
    const s = read(rel);
    assert.match(s, new RegExp(`^/\\* \\[모듈\\] ${rel.replace(/[.]/g, '\\.')} — [^\\n]*\\*/\\n'use strict';\\n`), `${rel}: 머리 2줄 형식`);
    assert.doesNotThrow(() => new vm.Script(s, { filename: rel }), `${rel}: 단독 컴파일`);
    // strict 탐침: 지시문이 정말 먹으면 'with'가 SyntaxError
    assert.throws(() => new vm.Script(s + '\nwith ({}) {}', { filename: rel }), /strict mode/i, `${rel}: strict 모드가 아님`);
    assert.ok(!/<\/script/i.test(s), `${rel}: '</script' 문자열 금지 — '<\\/script'로`);
    assert.ok(s.endsWith('\n'), `${rel}: 파일 끝 줄바꿈`);
  }
  for (const rel of cssFiles) assert.match(read(rel), new RegExp(`^/\\* \\[모듈\\] ${rel.replace(/[.]/g, '\\.')} — [^\\n]*\\*/\\n`), `${rel}: 머리 주석`);
});

test('css 상대 url()은 ../ 로 시작하고(css/ 기준) 가리키는 파일이 있다', () => {
  const bad = [];
  for (const rel of cssFiles) {
    for (const m of read(rel).matchAll(/url\(\s*['"]?([^'")\s]+)/gi)) {
      const u = m[1];
      if (/^(?:[a-z][\w+.-]*:|\/|#)/i.test(u)) continue;   // data:·http:·절대·조각
      if (!u.startsWith('../')) { bad.push(`${rel}: ${u} — '../'로 시작해야(css/ 폴더 기준)`); continue; }
      if (!fs.existsSync(path.resolve(root, 'css', u.split(/[?#]/)[0]))) bad.push(`${rel}: ${u} — 파일 없음`);
    }
  }
  assert.deepEqual(bad, []);
});

test('최상위 이름: 파일 사이 중복 없음, 예약·내장 가림 없음, 스크립트 범위 var 없음, 데이터 전역은 const X = window.X 꼴만', () => {
  const where = new Map(); const bad = [];
  const decls = declsOf(jsFiles.map(bodyOf));
  jsFiles.forEach((rel, i) => {
    for (const { n, k, init } of decls[i]) {
      if (k === 'var') bad.push(`${rel}: 스크립트 범위 var ${n} 금지(window로 샌다)`);
      if (where.has(n)) bad.push(`${n}: ${where.get(n)} 와 ${rel} — 최상위 이름 중복(함수면 뒤 파일이 조용히 덮고, let/const면 SyntaxError)`);
      where.set(n, rel);
      if (RESERVED.includes(n)) bad.push(`${rel}: ${k} ${n} — 예약 이름`);
      if (SHADOW.includes(n) && !SHADOW_OK.has(n)) bad.push(`${rel}: ${k} ${n} — window 내장을 가림`);
      if (DATA_GLOBALS.has(n) && !(k === 'const' && new RegExp(`^window\\.${n}\\b`).test(init || ''))) bad.push(`${rel}: ${n} — 데이터 전역은 'const ${n} = window.${n} …' 꼴만`);
    }
  });
  assert.ok(DATA_GLOBALS.size >= 10, `데이터 전역을 못 모음(${[...DATA_GLOBALS]})`);
  assert.ok(where.size > 500, '최상위 이름을 못 모음');
  assert.deepEqual(bad, []);
});

test('인라인 <script>는 전부 js 묶음보다 앞, 최상위 선언은 허용 목록(_per·_mas)만', () => {
  const firstJs = html.indexOf('<script src="js/');
  const bad = [];
  const decls = declsOf(inlineScripts.map((m) => m[1]));
  inlineScripts.forEach((m, i) => {
    if (m.index > firstJs) bad.push(`js 묶음 뒤 인라인 스크립트 @${m.index} — 앱 함수를 조용히 덮을 수 있다(부팅 뒤 코드는 boot.js에)`);
    for (const d of decls[i]) if (!INLINE_DECL_OK.has(d.n)) bad.push(`인라인 스크립트의 최상위 선언 ${d.k} ${d.n} — IIFE로 감쌀 것`);
  });
  assert.ok(inlineScripts.length >= 4, '인라인 스크립트를 못 찾음');
  assert.deepEqual(bad, []);
});

test('브라우저와 같은 전역 의미로 문서 순서대로 실행해도 선언 충돌(SyntaxError·재정의 오류)이 없다', () => {
  // vm 컨텍스트에 브라우저의 고칠 수 없는 전역을 재현하고, 인라인 스크립트와 js를 문서 순서대로 runInContext.
  // 선언 인스턴스화(첫 문장 실행 전) 단계의 오류만 실패로 본다 — DOM이 없어 나는 실행 오류는 무시.
  const ctx = {};
  for (const n of ['window', 'document', 'location', 'top', 'wcgDesktop']) Object.defineProperty(ctx, n, { value: {}, configurable: false, writable: false, enumerable: true });
  vm.createContext(ctx);
  const items = [];
  for (const m of inlineScripts) items.push({ at: m.index, label: `inline@${m.index}`, code: 'globalThis.__lo = true;\n' + m[1] });
  for (const t of jsTags) {
    const s = read(t[1]); const h = appSource.JS_HEAD.exec(s)[0];
    items.push({ at: t.index, label: t[1], code: h + 'globalThis.__lo = true;' + s.slice(h.length) });
  }
  items.sort((a, b) => a.at - b.at);
  const bad = [];
  for (const it of items) {
    ctx.__lo = false;
    try { vm.runInContext(it.code, ctx, { filename: it.label, timeout: 3000 }); } catch (e) {
      if (!ctx.__lo) bad.push(`${it.label}: ${e.name}: ${e.message}`);
    }
  }
  assert.equal(items.length, inlineScripts.length + jsTags.length);
  assert.deepEqual(bad, []);
});

test('로드 순서: 로드 중 실행 코드가 뒤 파일 정의에 닿지 않는다(tools/load-order.cjs)', () => {
  const r = JSON.parse(execFileSync(process.execPath, [path.join(root, 'tools', 'load-order.cjs'), root, '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 }));
  assert.deepEqual(r.files, jsFiles);
  const show = (rows) => rows.map((v) => `${v.site} → ${v.name}(${v.def}) | ${v.path}`);
  assert.deepEqual(show(r.syncViol), [], '뒤 파일 정의를 로드 중 동기로 부름 — 그 코드를 boot.js로 옮기거나 정의를 앞 파일로');
  assert.deepEqual(show(r.maybeViol), [], '콜백 경유로 뒤 파일 정의에 닿을 수 있음');
  assert.deepEqual(r.preBootTimers.map((t) => `${t.at.replace(/:\d+$/, '')} ${t.call} ${t.src}`), PREBOOT_TIMERS_OK, '부팅 전 지연 예약(타이머·then·Observer)은 boot.js에 — MODULES.md 2장 규칙 4');
  assert.deepEqual(r.textForward.map((t) => `${t.site.replace(/:\d+$/, '')} ${t.name}`), TEXT_FORWARD_OK, '같은 파일 안 호이스팅 의존이 늘거나 줄었다 — 떼어 놓으면 깨진다');
});

test('재조립: appSource(index.html)는 분할 전 형식(메인 IIFE 하나·메인 <style> 하나)이고, 같은 구조로 다시 나누면 지금 파일과 바이트까지 같다', () => {
  const mono = appSource(INDEX);
  assert.equal(mono.split("\n<script>\n(() => {\n'use strict';\n").length - 1, 1, '메인 IIFE 시작이 하나');
  assert.equal(mono.split('\n})();\n</script>\n').length - 1, 1, '메인 IIFE 끝이 하나(인라인을 IIFE 줄바꿈 꼴로 쓰지 말 것)');
  assert.equal(mono.split('\n<style>\n').length - 1, 1, 'id 없는 메인 <style>이 하나(head에 <style>을 더하지 말 것 — css/ 파일이나 <style id>로)');
  assert.ok(!/<script src="js\/|<link rel="stylesheet" href="css\//.test(mono));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-struct-'));
  try {
    fs.writeFileSync(path.join(tmp, 'mono.html'), mono);
    execFileSync(process.execPath, [path.join(root, 'tools', 'split-app.cjs'), `--like=${INDEX}`, `--src=${path.join(tmp, 'mono.html')}`, `--out=${path.join(tmp, 'out')}`], { encoding: 'utf8', stdio: 'pipe' });
    const diff = ['index.html', ...jsFiles, ...cssFiles].filter((rel) => fs.readFileSync(path.join(tmp, 'out', rel), 'utf8') !== read(rel));
    assert.deepEqual(diff, [], '파일 경계가 최상위 문장·CSS 규칙 사이가 아니거나(문장 중간에서 나뉨) 머리 형식이 다름');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('테스트·점검 스크립트는 index.html을 직접 읽지 않는다(tools/app-source.cjs 사용)', () => {
  const bad = [];
  for (const dir of ['tests', path.join('desktop', 'test')]) {
    for (const f of fs.readdirSync(path.join(root, dir)).filter((f) => /\.(c?js|mjs)$/.test(f) && f !== path.basename(__filename))) {
      const s = fs.readFileSync(path.join(root, dir, f), 'utf8');
      if (/readFileSync\([^\n]{0,200}?index\.html/.test(s)) bad.push(`${dir}/${f}`);
    }
  }
  assert.deepEqual(bad, []);
});
