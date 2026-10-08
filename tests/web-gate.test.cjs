// 웹판 막기(index.html head 맨 앞 인라인 — 2026-10-09: 웹판은 접고 데스크톱 설치판 하나로 간다).
// 데스크톱 앱(wcgDesktop·app://)과 로컬 개발(file://·localhost·127.x·[::1]·*.localhost)은 그대로, 그 밖(GitHub Pages 등)은
// 다른 스크립트보다 먼저 '설치판으로 재배포 예정' 카드를 쓰고 나머지 문서는 <plaintext>로 글자만 — 닫기 없음, 저장된 작업(localStorage)은 그대로(쓰기만 막음).
// 판정 함수(wcgGateOf)는 호스트별 표로, 스크립트 전체는 가짜 window·document·Storage(vm)로 돌려 본다.
// 실제 브라우저에서는 로컬 서버를 LAN 주소로 열어(막힘)·localhost로 열어(안 막힘) 따로 봤다(보고서).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)

const html = appSource(path.join(__dirname, '..', 'index.html'));
const HEAD = '<script>(function () {\n  function wcgGateOf(';
const at = html.indexOf(HEAD);
const GATE = at >= 0 ? html.slice(at + '<script>'.length, html.indexOf('</script>', at)) : '';

// 'function 이름(' 부터 짝 맞는 닫는 중괄호까지
function fnOf(src, name) {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name} 없음`);
  let d = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1);
  }
  throw new Error(`${name} 끝을 못 찾음`);
}

test('자리 — 문서의 첫 <script>(서비스워커 등록·모듈 로드 실패 가드·배치 슬롯·글꼴·css·js보다 먼저), IIFE 한 덩어리', () => {
  assert.ok(at > 0, '웹판 막기 스크립트가 없음');
  assert.equal(html.indexOf('<script'), at, '첫 스크립트가 아님');
  assert.ok(at < html.indexOf('<link rel="stylesheet"') || html.indexOf('<link rel="stylesheet"') < 0);
  assert.ok(at < html.indexOf("navigator.serviceWorker.register('sw.js')"));
  assert.ok(at < html.indexOf('window.__wcgModFail'));
  assert.match(GATE, /^\(function \(\) \{\n[\s\S]*\n\}\)\(\);$/);
});

test('판정 — 데스크톱 앱·로컬 개발은 그대로, 그 밖(GitHub Pages·LAN 주소·이상한 스킴)은 막기', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fnOf(GATE, 'wcgGateOf') + '\nglobalThis.wcgGateOf = wcgGateOf;', ctx);
  const g = (proto, host, desk) => ctx.wcgGateOf(proto, host, desk);
  const rows = [
    ['https:', 'newsdesign1991-blip.github.io', false, 'block'],
    ['http:', 'newsdesign1991-blip.github.io', false, 'block'],
    ['https:', 'weather-cg.example.com', false, 'block'],
    ['http:', '192.168.0.10', false, 'block'],
    ['http:', '10.10.105.25', false, 'block'],
    ['http:', 'localhost.evil.example', false, 'block'],
    ['http:', 'evil-localhost', false, 'block'],
    ['http:', '127.0.0.1.nip.io', false, 'block'],
    ['http:', '', false, 'block'],
    ['about:', '', false, 'block'],
    ['chrome-extension:', 'abc', false, 'block'],
    ['', '', false, 'block'],
    ['http:', 'localhost', false, 'local'],
    ['http:', 'LOCALHOST', false, 'local'],
    ['HTTP:', 'localhost', false, 'local'],
    ['https:', 'wcg.localhost', false, 'local'],
    ['http:', '127.0.0.1', false, 'local'],
    ['http:', '127.0.1.1', false, 'local'],
    ['http:', '[::1]', false, 'local'],
    ['file:', '', false, 'local'],
    ['app:', 'weathercg', false, 'app'],
    ['https:', 'newsdesign1991-blip.github.io', true, 'app'],   // 데스크톱 preload가 있으면 어디서 열든 그대로
  ];
  for (const [p, h, d, want] of rows) assert.equal(g(p, h, d), want, `${p}//${h} desktop=${d}`);
});

// 가짜 브라우저 — 스크립트 전체를 돌린다(document.write로 쓴 글·DOMContentLoaded 뒤 window.stop을 본다)
function run(o = {}) {
  const store = new Map(Object.entries(o.store || {}));
  class Storage {
    constructor(m) { this.m = m; }
    getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
    setItem(k, v) { this.m.set(k, String(v)); }
    removeItem(k) { this.m.delete(k); }
    clear() { this.m.clear(); }
  }
  const ls = new Storage(store), ss = new Storage(new Map());
  const written = [], ready = [];
  let stops = 0;
  const ctx = {
    Storage, localStorage: ls, sessionStorage: ss,
    location: { protocol: o.protocol || 'https:', hostname: o.host == null ? 'newsdesign1991-blip.github.io' : o.host },
    stop: () => { stops++; },
    document: { write: (h) => written.push(String(h)), addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') ready.push(fn); } },
  };
  if (o.desktop) ctx.wcgDesktop = { isDesktop: true };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(GATE, ctx);
  return { ctx, store, ls, ss, written, ready, stops: () => stops };
}

test('막힘 — 카드를 쓰고 나머지 문서는 <plaintext>로 글자만(css·js·부팅·서비스워커 없음), 파싱 뒤 받던 파일도 멈춤, 닫기 없음, 저장된 작업은 그대로', () => {
  const saved = { wcg_work: '{"style":"typhoon"}', wcg_theme: 'dark', wcg_slot_personal: '{"active":1}' };
  const r = run({ store: saved });
  assert.equal(r.ctx.__wcgWebBlocked, true);
  assert.equal(r.written.length, 1, 'document.write 한 번');
  const h = r.written[0];
  assert.match(h, /^<div id="wcgWebGate" role="alertdialog" aria-modal="true" aria-labelledby="wcgWebGateT" style="position:fixed;inset:0;z-index:2147483647;/);
  assert.match(h, /<plaintext style="display:none">$/, '맨 끝에 plaintext — 뒤 문서가 태그로 안 읽힌다');
  assert.equal((h.match(/<div\b/g) || []).length, (h.match(/<\/div>/g) || []).length, '카드 div 짝이 맞아야(plaintext가 카드 밖)');
  assert.match(h, />날씨 CG 메이커는 설치판으로 재배포 예정입니다</);
  assert.match(h, /팀 공지/);
  assert.doesNotMatch(h, /<button|<a |onclick|href=|<script/i, '닫기·링크·스크립트 없음');
  assert.match(h, /background:#0f0f0f/, '어두운 테마');
  // head에서 바로 멈추지 않는다(body가 없으면 화면을 안 그린다) — 파싱이 끝나면 멈춤
  assert.equal(r.stops(), 0);
  assert.equal(r.ready.length, 1);
  r.ready[0]();
  assert.equal(r.stops(), 1);
  // 저장된 작업 그대로 + 쓰기·지우기·비우기는 localStorage만 막힘(sessionStorage는 그대로)
  r.ls.setItem('wcg_work', '{}'); r.ls.removeItem('wcg_slot_personal'); r.ls.clear();
  assert.deepEqual(Object.fromEntries(r.store), saved);
  r.ss.setItem('a', '1');
  assert.equal(r.ss.getItem('a'), '1');
  // 밝은 테마면 밝은 카드
  assert.match(run({ store: { wcg_theme: 'light' } }).written[0], /background:#eef1f5/);
  // 스크립트 안에 head에서 바로 window.stop()을 부르는 줄이 없다(그러면 화면이 영영 안 그려진다)
  assert.doesNotMatch(GATE.replace(/addEventListener\('DOMContentLoaded'[^\n]*/, ''), /window\.stop\(\)/);
});

test('안 막힘 — 데스크톱 앱·localhost·127.0.0.1·file:// 은 아무것도 안 한다(카드·멈춤·저장 막기 없음)', () => {
  for (const o of [{ desktop: true }, { protocol: 'app:', host: 'weathercg' }, { protocol: 'http:', host: 'localhost' }, { protocol: 'http:', host: '127.0.0.1' }, { protocol: 'file:', host: '' }]) {
    const r = run({ ...o, store: { wcg_work: 'x' } });
    assert.equal(r.written.length, 0, JSON.stringify(o));
    assert.equal(r.ready.length, 0);
    assert.equal(r.stops(), 0);
    assert.equal(r.ctx.__wcgWebBlocked, undefined);
    r.ls.setItem('wcg_work', 'y');
    assert.equal(r.store.get('wcg_work'), 'y', '저장은 그대로 동작');
  }
});
