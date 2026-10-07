// AE JSX 골든 테스트 — wns/ae-jsx.js 의 buildAeJsx 가 원본 파이썬 helper.build_ae_jsx 와 '한 글자도 안 틀리게' 같은지.
// 정답 파일은 make_golden.py 로 생성: py "D:\03_Util\10_XR\Plugins_Building\WeatherCG\desktop\test\make_golden.py"
// 실행: node --test "D:\03_Util\10_XR\Plugins_Building\WeatherCG\desktop\test\ae-jsx.golden.test.cjs"
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SPEC_DIR = path.join(__dirname, 'ae-specs');
const GOLD_DIR = path.join(__dirname, 'golden');
// WNS_DIR 환경변수로 다른 구현 폴더를 지정 가능(기본 ../wns)
const MOD_PATH = path.join(process.env.WNS_DIR || path.join(__dirname, '..', 'wns'), 'ae-jsx.js');
const FRAMES_DIR = 'C:\\WCG\\frames\\sid01';   // make_golden.py 와 동일
const CTX = 120;

// 모듈 로드 — 아직 없으면 전부 skip(다른 사람이 작성 중)
let buildAeJsx = null, loadErr = null;
try {
  buildAeJsx = require(MOD_PATH).buildAeJsx;
  if (typeof buildAeJsx !== 'function') loadErr = new Error('module.exports.buildAeJsx 가 함수가 아님');
} catch (e) {
  loadErr = e;
}

// 첫 불일치 위치 앞뒤 CTX자 + 줄/칸 번호
function diffMsg(name, exp, act) {
  let i = 0;
  const n = Math.min(exp.length, act.length);
  while (i < n && exp.charCodeAt(i) === act.charCodeAt(i)) i++;
  const before = exp.slice(0, i);
  const line = before.split('\n').length, col = i - before.lastIndexOf('\n');
  const cut = (s) => JSON.stringify(s.slice(Math.max(0, i - CTX), i + CTX));
  return `[${name}] 골든과 다름 — 첫 불일치 위치 ${i} (줄 ${line}, 칸 ${col}), 길이 기대 ${exp.length} / 실제 ${act.length}\n`
    + `  기대: ${cut(exp)}\n  실제: ${cut(act)}`;
}

const specFiles = fs.existsSync(SPEC_DIR) ? fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith('.json')).sort() : [];

test('코퍼스·골든 준비 상태', () => {
  assert.ok(specFiles.length >= 40, `스펙이 ${specFiles.length}개뿐(40개 이상 필요)`);
  const missing = specFiles.map((f) => f.slice(0, -5)).filter((nm) =>
    !fs.existsSync(path.join(GOLD_DIR, nm + '.jsx')) && !fs.existsSync(path.join(GOLD_DIR, nm + '.error.txt')));
  assert.deepStrictEqual(missing, [], '골든 없음 → make_golden.py 를 다시 실행: ' + missing.join(', '));
});

// 스펙으로 못 닿는 경로(wanted_ps 는 build_ae_jsx 에서 안 씀, frames_dir 는 서버가 고정) — 파이썬 직접 호출 결과와 비교
const EXTRA_P = path.join(GOLD_DIR, 'extra-cases.json');
const extra = fs.existsSync(EXTRA_P) ? JSON.parse(fs.readFileSync(EXTRA_P, 'utf8')) : null;
const extraOpts = loadErr ? { skip: 'wns/ae-jsx.js 로드 실패' } : (!extra ? { skip: 'extra-cases.json 없음 → make_golden.py 실행' } : {});
test('wantedPs/suitePs 직접 호출', extraOpts, () => {
  const M = require(MOD_PATH);
  for (const [s, ew, es] of extra.fontPs) {
    const v = JSON.parse(s);
    assert.strictEqual(M.wantedPs(v), ew, 'wantedPs(' + s + ')');
    assert.strictEqual(M.suitePs(v), es, 'suitePs(' + s + ')');
  }
});
test('framesDir 종류(스펙 {})', extraOpts, () => {
  for (const [s, exp, err] of extra.framesDir) {
    const d = JSON.parse(s);
    if (err) { assert.throws(() => buildAeJsx({}, d), undefined, `framesDir=${s} 파이썬은 ${err}`); continue; }
    const act = buildAeJsx({}, d);
    if (act !== exp) assert.strictEqual(act, exp, diffMsg('framesDir=' + s, exp, act));
  }
});

for (const f of specFiles) {
  const name = f.slice(0, -5);
  const opts = loadErr ? { skip: 'wns/ae-jsx.js 로드 실패: ' + loadErr.message.split('\n')[0] } : {};
  test(name, opts, () => {
    const spec = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, f), 'utf8'));
    const errP = path.join(GOLD_DIR, name + '.error.txt');
    const jsxP = path.join(GOLD_DIR, name + '.jsx');
    if (fs.existsSync(errP)) {
      // 파이썬이 예외를 던진 스펙 → JS도 던져야 함(종류는 안 봄)
      const pyErr = fs.readFileSync(errP, 'utf8').trim();
      let out, threw = false;
      try { out = buildAeJsx(spec, FRAMES_DIR); } catch (e) { threw = true; }
      assert.ok(threw, `[${name}] 파이썬은 예외(${pyErr})인데 JS는 정상 반환함` + (typeof out === 'string' ? ` (길이 ${out.length})` : ''));
      return;
    }
    const exp = fs.readFileSync(jsxP, 'utf8');
    const act = buildAeJsx(spec, FRAMES_DIR);
    assert.strictEqual(typeof act, 'string', `[${name}] 반환값이 문자열이 아님: ${typeof act}`);
    if (act !== exp) assert.strictEqual(act, exp, diffMsg(name, exp, act));
  });
}
