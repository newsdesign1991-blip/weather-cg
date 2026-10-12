// 태풍 라벨 지시선 끝 '흰 점'(2026-10-13) — 앱 실제 함수(tools/app-source.cjs로 잘라 vm)로 확인한다.
// 옛 방식: 선이 나오기 전에도 지시선을 넣고 dasharray=len·dashoffset=len으로 숨김 → 계산 길이가 실제보다 0.01px만 짧아도
// 다음 대시가 선 끝(박스 쪽)에 길이 0으로 생겨 둥근 마개가 3px 흰 점으로 남았다(3D 카메라 이동 중 화면에 남아 깜빡임).
// 실제 앱 그림 점검은 tests/typhoon-leader-specks.boot.test.cjs(WCG_BOOT_CHECK=1).
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const fs = require('node:fs');
const { fnSrc } = require('./tl-plan-ctx.cjs');

const fakeEl = (tag, attr) => {
  const a = Object.assign({}, attr || {});
  return { tag, attr: a, kids: [], setAttribute(k, v) { a[k] = String(v); }, getAttribute(k) { return k in a ? a[k] : null }, hasAttribute(k) { return k in a; }, appendChild(c) { this.kids.push(c); } };
};
function ctxWith(prog) {
  const ctx = {
    Math, Object, String, Number, console, S: { labShadow: 0 },
    camProjectXY: (x, y) => [x, y], el: fakeEl, _te: fakeEl, L_typhoon_attachTmp() {}, fillLabelBox: () => ({ w: 318.6, h: 78.5 }),
    typhoonLabelProg: () => prog,
  };
  vm.createContext(ctx);
  vm.runInContext(['typhoonLeaderGeom', 'typhoonLeaderDash', 'typhoonLabelParts'].map(fnSrc).join('\n'), ctx);
  return ctx;
}
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const polyLen = (d) => {
  const n = (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) || []).map(Number);
  let L = 0; for (let i = 2; i + 1 < n.length; i += 2) L += Math.hypot(n[i] - n[i - 2], n[i + 1] - n[i - 1]);
  return L;
};

test('지시선 길이 = d에 적힌 좌표로 잰 길이(시작점 0.1 반올림까지 같게)', () => {
  const c = ctxWith({ reveal: 1, scale: 1 });
  let worst = 0;
  for (let i = 0; i < 3000; i++) {
    const px = rnd() * 1920, py = rnd() * 1080, bx = rnd() * 1920, by = rnd() * 1080;
    const g = c.typhoonLeaderGeom(px, py, bx, by, 200 + rnd() * 200, 60 + rnd() * 30);
    worst = Math.max(worst, Math.abs(g.len - polyLen(g.d)));
  }
  assert.ok(worst < 1e-9, '최대 차 ' + worst);
});

test('그려지는 중 대시: 보이는 길이 = len×reveal, 간격은 선보다 길어 선 안에 두 번째 대시가 없다(dashoffset 안 씀)', () => {
  const c = ctxWith({ reveal: 1, scale: 1 });
  for (let i = 0; i < 3000; i++) {
    const len = 5 + rnd() * 700, rv = i === 0 ? 1e-6 : i === 1 ? 0.999999 : rnd();
    const line = fakeEl('path');
    c.typhoonLeaderDash(line, len, rv);
    const [a, g] = line.getAttribute('stroke-dasharray').split(' ').map(Number);
    assert.ok(Math.abs(a - len * rv) <= 0.0051, `보이는 길이 ${a} vs ${len * rv}`);
    assert.ok(a + g >= len + 15.99, `두 번째 대시가 선 안(${a + g} < ${len})`);
    assert.equal(line.getAttribute('stroke-dashoffset'), null);
  }
});

test('typhoonLabelParts: 선이 나오기 전(reveal 0)엔 지시선 없음, 그려지는 중엔 새 대시, 다 나오면 대시 없음 — 박스는 그대로', () => {
  const b = { id: 'x3', x: 771, y: 615 };
  const hid = ctxWith({ reveal: 0, scale: 0 }).typhoonLabelParts(b, 990, 700, 1);
  assert.equal(hid.line, null, '숨은 라벨에 지시선이 남음');
  assert.match(hid.box.getAttribute('transform'), /scale\(0\)/, '박스는 크기 0(옛날과 같음)');
  assert.equal(hid.box.getAttribute('opacity'), '0');
  const mid = ctxWith({ reveal: 0.37, scale: 0 }).typhoonLabelParts(b, 990, 700, 1);
  assert.ok(mid.line, '그려지는 중엔 지시선');
  const [a, g] = mid.line.getAttribute('stroke-dasharray').split(' ').map(Number);
  const L = polyLen(mid.line.getAttribute('d'));
  assert.ok(Math.abs(a - L * 0.37) < 0.01 && a + g > L + 8, mid.line.getAttribute('stroke-dasharray') + ' / ' + L);
  assert.equal(mid.line.getAttribute('stroke-dashoffset'), null);
  assert.equal(mid.line.getAttribute('data-leader-id'), 'x3');
  const full = ctxWith({ reveal: 1, scale: 1 }).typhoonLabelParts(b, 990, 700, 1);
  assert.ok(full.line && full.line.getAttribute('stroke-dasharray') == null, '다 나오면 온전한 선');
  assert.equal(full.line.getAttribute('stroke-linecap'), 'round', '선 모양(둥근 끝)은 그대로');
  assert.equal(full.box.getAttribute('opacity'), null);
});

test('비교 지도 수치라벨도 같은 규칙: _rv 0이면 지시선 없음, 그리는 중엔 typhoonLeaderDash — 길이만큼 밀어 숨기기는 없다', () => {
  const src = fnSrc('drawCompareLabels');
  assert.match(src, /if \(_rv > 0\) \{[\s\S]*?typhoonLeaderDash\(line, geom\.len, _rv\)[\s\S]*?LB\.insertBefore\(line, g\)/);
  for (const f of ['typhoon-core.js', 'typhoon-render.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
    assert.doesNotMatch(code, /stroke-dashoffset/, f + ': 지시선을 dashoffset으로 숨기지 않는다');
  }
});
