// 파이썬 서식 흉내 유닛 테스트 — wns/pyfmt.js 의 pyF('%.{p}f'), pyD('%d'), pyJsonStr(json.dumps) 를
// 파이썬이 직접 만든 기대값(golden/pyfmt-cases.json, make_golden.py 생성)과 비교.
// 실행: node --test "D:\03_Util\10_XR\Plugins_Building\WeatherCG\desktop\test\pyfmt.test.cjs"
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CASES_P = path.join(__dirname, 'golden', 'pyfmt-cases.json');
// WNS_DIR 환경변수로 다른 구현 폴더를 지정 가능(기본 ../wns)
const MOD_PATH = path.join(process.env.WNS_DIR || path.join(__dirname, '..', 'wns'), 'pyfmt.js');

let M = null, loadErr = null;
try { M = require(MOD_PATH); } catch (e) { loadErr = e; }
const skip = loadErr ? { skip: 'wns/pyfmt.js 로드 실패: ' + loadErr.message.split('\n')[0] } : {};

// 파이썬 repr 문자열 → JS 숫자(정확히 같은 double)
function num(s) {
  if (s === 'inf') return Infinity;
  if (s === '-inf') return -Infinity;
  if (s === 'nan') return NaN;
  const v = Number(s);
  if (Number.isNaN(v)) throw new Error('숫자 복원 실패: ' + s);
  return v;
}

const C = JSON.parse(fs.readFileSync(CASES_P, 'utf8'));

// 실패를 모아서 한 번에(앞 30개) 보여줌 — 수천 개 케이스라 개별 test 대신
function check(label, rows, fn) {
  const bad = [];
  for (const r of rows) {
    const msg = fn(r);
    if (msg) bad.push(msg);
  }
  assert.strictEqual(bad.length, 0, `${label}: ${bad.length}/${rows.length}개 불일치\n  ` + bad.slice(0, 30).join('\n  '));
}

test('케이스 파일 정상', () => {
  assert.ok(C.pyF.length >= 300 && C.pyD.length >= 100 && C.pyJsonStr.length >= 100, '케이스 수 부족 — make_golden.py 재실행');
  for (const [x] of C.pyF.concat(C.pyD)) num(x);   // 숫자 복원 가능 확인
});

test('pyF 정밀도 6(기본 인자)', skip, () => {
  check('pyF(x)', C.pyF.filter((r) => r[1] === 6), ([x, , exp]) => {
    const act = M.pyF(num(x));
    return act === exp ? null : `pyF(${x}) → ${JSON.stringify(act)} (기대 ${JSON.stringify(exp)})`;
  });
});

test('pyF 정밀도 명시(0/1/2/3/6/10)', skip, () => {
  check('pyF(x,p)', C.pyF, ([x, p, exp]) => {
    const act = M.pyF(num(x), p);
    return act === exp ? null : `pyF(${x}, ${p}) → ${JSON.stringify(act)} (기대 ${JSON.stringify(exp)})`;
  });
});

test('pyF 대표값(사람이 읽는 확인용)', skip, () => {
  const eq = (x, p, e) => assert.strictEqual(p == null ? M.pyF(x) : M.pyF(x, p), e, `pyF(${Object.is(x, -0) ? '-0' : x}${p == null ? '' : ', ' + p})`);
  eq(0.0078125, null, '0.007812');    // 이진 동률 → 짝수 쪽(toFixed는 0.007813)
  eq(-0.0078125, null, '-0.007812');
  eq(-0, null, '-0.000000');          // -0 부호 유지
  eq(-1e-9, null, '-0.000000');
  eq(1e22, null, '10000000000000000000000.000000');   // toFixed는 지수표기로 빠짐
  eq(Infinity, null, 'inf');
  eq(-Infinity, null, '-inf');
  eq(NaN, null, 'nan');
  eq(2.5, 0, '2');
  eq(-0.5, 0, '-0');
  eq(1920, null, '1920.000000');
});

test('pyD (%d = 0쪽으로 자름)', skip, () => {
  check('pyD', C.pyD, ([x, exp, err]) => {
    let act, thrown = null;
    try { act = M.pyD(num(x)); } catch (e) { thrown = e; }
    if (err) return thrown ? null : `pyD(${x}) → ${JSON.stringify(act)} (파이썬은 ${err} 예외)`;
    if (thrown) return `pyD(${x}) 예외: ${thrown.message} (기대 ${JSON.stringify(exp)})`;
    return act === exp ? null : `pyD(${x}) → ${JSON.stringify(act)} (기대 ${JSON.stringify(exp)})`;
  });
});

test('pyJsonStr (json.dumps, ensure_ascii)', skip, () => {
  check('pyJsonStr', C.pyJsonStr, ([s, exp]) => {
    const act = M.pyJsonStr(s);
    return act === exp ? null : `pyJsonStr(${JSON.stringify(s)}) → ${JSON.stringify(act)} (기대 ${JSON.stringify(exp)})`;
  });
});
