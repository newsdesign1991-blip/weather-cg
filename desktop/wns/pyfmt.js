// Python 서식·변환 규칙 재현 유틸 — helper.py 의 AE JSX 생성기를 '출력 바이트 동일'하게 옮기기 위함.
// 값 모델: JSON.parse 결과(객체=dict, 배열=list, 문자열=str, number=float/int, boolean=bool, null=None).
// Python int 는 BigInt 로 다룬다(int()/round()/ceil() 결과). JS number 중 정수값(|x|<1e21)은
// 웹앱 JSON.stringify → Python json.loads 경로에서 int 가 되므로 str() 시 int 로 표기한다.
'use strict';

// ── 타입 판별 ──
function isDict(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function isNone(x) { return x === null || x === undefined; }
function typeName(x) {
  if (isNone(x)) return 'NoneType';
  if (typeof x === 'boolean') return 'bool';
  if (typeof x === 'bigint') return 'int';
  if (typeof x === 'number') return 'float';
  if (typeof x === 'string') return 'str';
  if (Array.isArray(x)) return 'list';
  return 'dict';
}
function pyErr(kind, msg) { const e = new Error(kind + ': ' + msg); e.pyType = kind; return e; }

// dict.get(k, d) — 키가 '없을 때만' d (값이 None 이면 None). dict 아니면 AttributeError.
function get(d, k, def) {
  if (!isDict(d)) throw pyErr('AttributeError', "'" + typeName(d) + "' object has no attribute 'get'");
  if (Object.prototype.hasOwnProperty.call(d, k)) { const v = d[k]; return v === undefined ? null : v; }
  return def === undefined ? null : def;
}
// d[k] — dict 아니면 TypeError, 키 없으면 KeyError
function sub(d, k) {
  if (!isDict(d)) throw pyErr('TypeError', "'" + typeName(d) + "' object is not subscriptable by str");
  if (!Object.prototype.hasOwnProperty.call(d, k)) throw pyErr('KeyError', JSON.stringify(k));
  const v = d[k]; return v === undefined ? null : v;
}
// 반복(for x in v) 대상 → JS 배열. list=그대로, str=코드포인트, dict=키. 그 외 TypeError.
function iter(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return Array.from(v);
  if (isDict(v)) return Object.keys(v);
  throw pyErr('TypeError', "'" + typeName(v) + "' object is not iterable");
}
// len(v)
function len(v) {
  if (Array.isArray(v)) return v.length;
  if (typeof v === 'string') return Array.from(v).length;
  if (isDict(v)) return Object.keys(v).length;
  throw pyErr('TypeError', "object of type '" + typeName(v) + "' has no len()");
}
// seq[i] (정수 i, 음수 미지원 — 생성기에서 안 씀)
function index(v, i) {
  if (Array.isArray(v) || typeof v === 'string') {
    const a = Array.isArray(v) ? v : Array.from(v);
    if (i < 0 || i >= a.length) throw pyErr('IndexError', 'index out of range');
    const x = a[i]; return x === undefined ? null : x;
  }
  if (isDict(v)) throw pyErr('KeyError', String(i));
  throw pyErr('TypeError', "'" + typeName(v) + "' object is not subscriptable");
}
// bool(v) — Python 참거짓(NaN 은 참)
function truthy(v) {
  if (isNone(v)) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'bigint') return v !== 0n;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return Object.keys(v).length > 0;
}
// a or b
function or(a, b) { return truthy(a) ? a : b; }

// ── 숫자 비교(int/float/bool 끼리만, 그 외 TypeError). JS 의 BigInt↔number 비교는 수학적으로 정확. ──
function numv(x, op) {
  if (typeof x === 'number' || typeof x === 'bigint') return x;
  if (typeof x === 'boolean') return x ? 1 : 0;
  throw pyErr('TypeError', "'" + op + "' not supported for '" + typeName(x) + "'");
}
function ge(a, b) { return numv(a, '>=') >= numv(b, '>='); }
function le(a, b) { return numv(a, '<=') <= numv(b, '<='); }
function gt(a, b) { return numv(a, '>') > numv(b, '>'); }
function lt(a, b) { return numv(a, '<') < numv(b, '<'); }
// max(a,b)/min(a,b) — Python 은 첫 값에서 시작해 '더 크면/작으면' 교체(NaN 순서 의존까지 동일)
function max2(a, b) { return gt(b, a) ? b : a; }
function min2(a, b) { return lt(b, a) ? b : a; }

// ── 숫자 문자열 파싱(Python int()/float() 문자열 규칙) ──
// Python 은 파싱 전에 _PyUnicode_TransformDecimalAndSpaceToASCII 로 바꾼다:
//   ASCII(<127) 그대로, 유니코드 공백 → ' ', Nd 숫자 → '0'~'9', 그 밖의 문자 → '?'(무효)에서 끝.
//   그다음 ASCII 공백(' \t\n\v\f\r')만 앞뒤로 벗긴다(\x1c~\x1f 는 안 벗김).
// Nd 표는 Python 3.13(Unicode 15.1) 값으로 고정 — Node ICU 의 더 새 유니코드 숫자는 Python 처럼 무효 처리.
const PY_DEC0 = [0x660, 0x6F0, 0x7C0, 0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6, 0xD66, 0xDE6, 0xE50, 0xED0,
  0xF20, 0x1040, 0x1090, 0x17E0, 0x1810, 0x1946, 0x19D0, 0x1A80, 0x1A90, 0x1B50, 0x1BB0, 0x1C40, 0x1C50, 0xA620, 0xA8D0,
  0xA900, 0xA9D0, 0xA9F0, 0xAA50, 0xABF0, 0xFF10, 0x104A0, 0x10D30, 0x11066, 0x110F0, 0x11136, 0x111D0, 0x112F0, 0x11450,
  0x114D0, 0x11650, 0x116C0, 0x11730, 0x118E0, 0x11950, 0x11C50, 0x11D50, 0x11DA0, 0x11F50, 0x16A60, 0x16AC0, 0x16B50,
  0x1D7CE, 0x1D7D8, 0x1D7E2, 0x1D7EC, 0x1D7F6, 0x1E140, 0x1E2F0, 0x1E4F0, 0x1E950, 0x1FBF0];   // 각 '0' 위치(뒤로 10개 연속)
const PY_USP = [0x85, 0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A,
  0x2028, 0x2029, 0x202F, 0x205F, 0x3000];   // 비ASCII 공백(Py_UNICODE_ISSPACE)
const ASCII_WS = ' \t\n\x0b\x0c\r';
function pyNumText(x) {
  let out = '';
  for (const ch of x) {
    const o = ch.codePointAt(0);
    if (o < 127) { out += ch; continue; }
    if (PY_USP.indexOf(o) >= 0) { out += ' '; continue; }
    const z = PY_DEC0.find(z0 => o >= z0 && o < z0 + 10);
    if (z === undefined) { out += '?'; break; }
    out += String.fromCharCode(48 + o - z);
  }
  let a = 0, b = out.length;
  while (a < b && ASCII_WS.indexOf(out[a]) >= 0) a++;
  while (b > a && ASCII_WS.indexOf(out[b - 1]) >= 0) b--;
  return out.slice(a, b);
}
const RE_INT = /^[+-]?[0-9](?:_?[0-9])*$/;
const PY_INT_MAX_STR_DIGITS = 4300;   // sys.get_int_max_str_digits() 기본값 — 넘으면 int(str) 이 ValueError
const RE_FLOAT = /^[+-]?(?:[0-9](?:_?[0-9])*(?:\.(?:[0-9](?:_?[0-9])*)?)?|\.[0-9](?:_?[0-9])*)(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/;
const RE_SPECIAL = /^([+-]?)(inf|infinity|nan)$/i;

// float(x)
function float(x) {
  if (typeof x === 'number') return x;
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (typeof x === 'bigint') {
    const v = Number(x);
    if (!isFinite(v)) throw pyErr('OverflowError', 'int too large to convert to float');
    return v;
  }
  if (typeof x === 'string') {
    const s = pyNumText(x);
    const m = RE_SPECIAL.exec(s);
    if (m) {
      if (m[2].toLowerCase() === 'nan') return NaN;
      return m[1] === '-' ? -Infinity : Infinity;
    }
    if (!RE_FLOAT.test(s)) throw pyErr('ValueError', 'could not convert string to float: ' + pyRepr(x));
    return Number(s.replace(/_/g, ''));   // JS Number 도 올바른 반올림(Python 과 동일)
  }
  throw pyErr('TypeError', "float() argument must be a string or a real number, not '" + typeName(x) + "'");
}

// int(x) → BigInt. float 는 0쪽 절삭, nan/inf 는 예외.
function int(x) {
  if (typeof x === 'bigint') return x;
  if (typeof x === 'boolean') return x ? 1n : 0n;
  if (typeof x === 'number') {
    if (isNaN(x)) throw pyErr('ValueError', 'cannot convert float NaN to integer');
    if (!isFinite(x)) throw pyErr('OverflowError', 'cannot convert float infinity to integer');
    return BigInt(Math.trunc(x));
  }
  if (typeof x === 'string') {
    const s = pyNumText(x);
    if (!RE_INT.test(s)) throw pyErr('ValueError', "invalid literal for int() with base 10: " + pyRepr(x));
    const digits = s.replace(/[^0-9]/g, '');   // 부호·밑줄 제외, 앞자리 0 은 셈
    if (digits.length > PY_INT_MAX_STR_DIGITS) {
      throw pyErr('ValueError', 'Exceeds the limit (4300 digits) for integer string conversion: value has ' + digits.length + ' digits');
    }
    return BigInt(s.replace(/_/g, ''));
  }
  throw pyErr('TypeError', "int() argument must be a string, a bytes-like object or a real number, not '" + typeName(x) + "'");
}

// round(x) (ndigits 없음) → BigInt, 동률은 짝수 쪽
function round(x) {
  if (typeof x === 'bigint') return x;
  if (typeof x === 'boolean') return x ? 1n : 0n;
  if (typeof x !== 'number') throw pyErr('TypeError', "type " + typeName(x) + " doesn't define __round__ method");
  if (isNaN(x)) throw pyErr('ValueError', 'cannot convert float NaN to integer');
  if (!isFinite(x)) throw pyErr('OverflowError', 'cannot convert float infinity to integer');
  const f = Math.floor(x);
  const d = x - f;                    // double 에서 정확
  let r = BigInt(f);
  if (d > 0.5 || (d === 0.5 && (r & 1n) === 1n)) r += 1n;
  return r;
}

// math.ceil(float) → BigInt
function ceil(x) {
  x = float(x);
  if (isNaN(x)) throw pyErr('ValueError', 'cannot convert float NaN to integer');
  if (!isFinite(x)) throw pyErr('OverflowError', 'cannot convert float infinity to integer');
  return BigInt(Math.ceil(x));
}

// int / int 또는 float 나눗셈(`/`) — 0 나누기는 ZeroDivisionError
function div(a, b) {
  const x = float(a), y = float(b);
  if (y === 0) throw pyErr('ZeroDivisionError', 'division by zero');
  return x / y;
}

// float % float — 결과 부호는 제수 쪽(Python float_rem 그대로)
function mod(a, b) {
  const vx = float(a), wx = float(b);
  if (wx === 0) throw pyErr('ZeroDivisionError', 'float modulo');
  let m = vx % wx;                    // C fmod 와 동일
  if (m !== 0) {                      // C 의 if(mod) — NaN 도 참
    if ((wx < 0) !== (m < 0)) m += wx;
  } else {
    m = wx < 0 ? -0 : 0;              // copysign(0, wx)
  }
  return m;
}

// ── double 분해: |x| = m * 2^e (m BigInt) ──
const _dv = new DataView(new ArrayBuffer(8));
function decomp(x) {
  _dv.setFloat64(0, x);
  const hi = _dv.getUint32(0), lo = _dv.getUint32(4);
  const E = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;
  if (E === 0) e = -1074; else { m |= 1n << 52n; e = E - 1075; }
  return [m, e];
}
function signbit(x) { _dv.setFloat64(0, x); return (_dv.getUint32(0) >>> 31) === 1; }
function bitlen(n) { return n === 0n ? 0 : n.toString(2).length; }
function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(bitlen(n) / 2));
  for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
}

// math.hypot(x, y) — 정확값 BigInt 로 계산해 올바르게 반올림(Python 3.10+ hypot 와 같은 결과)
function hypot(x, y) {
  x = Math.abs(float(x)); y = Math.abs(float(y));
  if (x === Infinity || y === Infinity) return Infinity;
  if (isNaN(x) || isNaN(y)) return NaN;
  if (x === 0) return y;
  if (y === 0) return x;
  const [mx, ex] = decomp(x), [my, ey] = decomp(y);
  const e = Math.min(ex, ey);
  const X = mx << BigInt(ex - e), Y = my << BigInt(ey - e);
  let S = X * X + Y * Y;                      // 결과 = sqrt(S) * 2^e
  const bl = bitlen(S);
  const k = bl < 130 ? Math.ceil((130 - bl) / 2) : 0;
  S <<= BigInt(2 * k);
  const r = isqrt(S);
  const sticky = r * r !== S;
  const L = bitlen(r), sh = L - 53;           // 항상 sh>0(65비트 이상 확보)
  let q = r >> BigInt(sh);
  const rem = r & ((1n << BigInt(sh)) - 1n), half = 1n << BigInt(sh - 1);
  if (rem > half || (rem === half && (sticky || (q & 1n) === 1n))) q += 1n;
  return Number(q) * Math.pow(2, e - k + sh);
}
const _RAD2DEG = 180.0 / Math.PI;
// math.degrees(x) = x * (180/pi)
function degrees(x) { return float(x) * _RAD2DEG; }
// math.atan2(y, x) — V8 Math.atan2 는 Windows CRT 와 1ulp 씩 자주(약 5%) 달라서,
// BigInt 고정소수점으로 올바르게 반올림한 값을 쓴다(CRT 와 거의 항상 일치, 중간값 근처 극히 드묾만 다름).
// 0·무한대·NaN 특수값은 C99 규칙이 같으므로 Math.atan2 그대로.
let _piB = null; const _PIBITS = 2700;
function _atanInv(k, S) {   // atan(1/k) * 2^S
  const K = BigInt(k), K2 = K * K; let term = (1n << BigInt(S)) / K, sum = 0n, n = 1n, s = 1n;
  while (term !== 0n) { sum += s * term / n; term /= K2; n += 2n; s = -s; }
  return sum;
}
function _piAt(S) {   // pi * 2^S (Machin)
  if (!_piB) _piB = (16n * _atanInv(5, _PIBITS + 16) - 4n * _atanInv(239, _PIBITS + 16)) >> 16n;
  return _piB >> BigInt(_PIBITS - S);
}
function _atanFix(T, S) {   // atan(T/2^S) * 2^S, 0<=T/2^S<=1
  const one = 1n << BigInt(S), bS = BigInt(S); let r = 0;
  while (T > (one >> 4n)) {   // 반각 축소: t -> t/(1+sqrt(1+t^2))
    const t2 = (T * T) >> bS; const root = isqrt((one + t2) << bS); T = (T << bS) / (one + root); r++;
  }
  const t2 = (T * T) >> bS; let term = T, sum = 0n, k = 1n, sg = 1n;
  while (term !== 0n) { sum += sg * term / k; term = (term * t2) >> bS; k += 2n; sg = -sg; }
  return sum << BigInt(r);
}
function _fixToDouble(a, S) {
  const L = bitlen(a), sh = L - 53; let q = a >> BigInt(sh);
  const rem = a & ((1n << BigInt(sh)) - 1n), half = 1n << BigInt(sh - 1);
  if (rem > half || (rem === half && (q & 1n) === 1n)) q += 1n;
  const e = sh - S;
  return e < -1000 ? Number(q) * Math.pow(2, e + 600) * Math.pow(2, -600) : Number(q) * Math.pow(2, e);   // 아주 작은 값 언더플로 방지
}
function atan2(y, x) {
  y = float(y); x = float(x);
  if (!isFinite(x) || !isFinite(y) || x === 0 || y === 0) return Math.atan2(y, x);
  const ay = Math.abs(y), ax = Math.abs(x), swap = ay > ax;
  const [nm, ne] = decomp(swap ? ax : ay), [dm, de] = decomp(swap ? ay : ax);
  const lt = bitlen(nm) - bitlen(dm) + (ne - de);
  const S = 160 + Math.max(0, -lt) + 8;
  const sh = S + ne - de;
  const T = sh >= 0 ? (nm << BigInt(sh)) / dm : nm / (dm << BigInt(-sh));
  let a = _atanFix(T, S);
  if (swap) a = (_piAt(S) >> 1n) - a;
  if (x < 0) a = _piAt(S) - a;
  const r = _fixToDouble(a, S);
  return y < 0 ? -r : r;
}

// ── '%f' / '%.Nf' — 정확한 이진값을 10진 전개 후 round-half-even ──
function pyF(x, prec) {
  if (prec === undefined) prec = 6;
  if (typeof x === 'bigint' || typeof x === 'boolean') x = float(x);
  if (typeof x !== 'number') throw pyErr('TypeError', 'must be real number, not ' + typeName(x));
  if (isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  const neg = signbit(x);
  const [m, e] = decomp(Math.abs(x));
  const P = 10n ** BigInt(prec);
  let q;
  if (e >= 0) q = (m * P) << BigInt(e);
  else {
    const num = m * P, den = 1n << BigInt(-e);
    q = num / den;
    const r2 = (num - q * den) * 2n;
    if (r2 > den || (r2 === den && (q & 1n) === 1n)) q += 1n;
  }
  let s = q.toString();
  if (prec > 0) {
    if (s.length <= prec) s = '0'.repeat(prec + 1 - s.length) + s;
    s = s.slice(0, s.length - prec) + '.' + s.slice(s.length - prec);
  }
  return (neg ? '-' : '') + s;
}

// '%d' — int() 와 같은 변환(float 절삭, bool 0/1), 그 외 TypeError
function pyD(x) {
  if (typeof x === 'bigint') return x.toString();
  if (typeof x === 'boolean') return x ? '1' : '0';
  if (typeof x === 'number') return int(x).toString();
  throw pyErr('TypeError', '%d format: a real number is required, not ' + typeName(x));
}

// repr(float) / str(float) — 최단 왕복 자릿수, 지수 -4 <= e < 16 이면 고정소수, 아니면 1e+16 꼴
function floatRepr(x) {
  if (isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return signbit(x) ? '-0.0' : '0.0';
  const neg = x < 0;
  const t = Math.abs(x).toExponential();      // 인자 없음 = 최단 왕복 자릿수
  const mm = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(t);
  const digits = mm[1] + (mm[2] || '');
  const exp = parseInt(mm[3], 10);
  let out;
  if (exp >= -4 && exp < 16) {
    const decpt = exp + 1;
    if (decpt <= 0) out = '0.' + '0'.repeat(-decpt) + digits;
    else if (decpt >= digits.length) out = digits + '0'.repeat(decpt - digits.length) + '.0';
    else out = digits.slice(0, decpt) + '.' + digits.slice(decpt);
  } else {
    const ae = Math.abs(exp);
    out = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + 'e' + (exp < 0 ? '-' : '+') + (ae < 10 ? '0' : '') + ae;
  }
  return (neg ? '-' : '') + out;
}
// JSON 에서 온 number 가 Python 에서 int 였을지(웹앱 JSON.stringify 기준: 정수값이고 |x|<1e21)
function numIsInt(x) { return Number.isInteger(x) && Math.abs(x) < 1e21; }

// JSON.parse 결과 → Python json.loads 값 모델. int 였을 number 를 BigInt 로(값은 JSON.stringify 가 쓴 자릿수 = String(x)).
// 2^53 넘는 정수는 BigInt(x)(이진 정확값, 예: ...567168)와 파이썬 int(텍스트 ...567000)가 달라 %d·str·비교가 어긋나므로.
// -0 은 그대로 둔다(JSON.stringify 는 "-0" 을 안 씀. 손으로 쓴 "-0.0" 은 파이썬 float -0.0).
function pyJsonVal(v) {
  if (typeof v === 'number') return (numIsInt(v) && !Object.is(v, -0)) ? BigInt(String(v)) : v;
  if (Array.isArray(v)) return v.map(pyJsonVal);
  if (isDict(v)) {
    const o = {};
    for (const k of Object.keys(v)) {   // "__proto__" 키도 자기 속성으로 유지
      Object.defineProperty(o, k, { value: pyJsonVal(v[k]), writable: true, enumerable: true, configurable: true });
    }
    return o;
  }
  return v;
}

// repr(str) — 따옴표 선택 + 비인쇄문자 이스케이프
const RE_NONPRINT = /^[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]$/u;
// Python 3.13(유니코드 15.1)엔 미할당(Cn=비인쇄)인데 Node ICU(유니코드 16~17)엔 할당된 문자 범위 [시작,끝,...].
// RE_NONPRINT 만 쓰면 이 문자들이 그대로 나가 repr 이 달라짐 → 여기 걸리면 비인쇄로 본다.
const PY_UNASSIGNED_NEW = [
  0x88F, 0x88F, 0x897, 0x897, 0xC5C, 0xC5C, 0xCDC, 0xCDC, 0x1ACF, 0x1ADD, 0x1AE0, 0x1AEB, 0x1B4E, 0x1B4F,
  0x1B7F, 0x1B7F, 0x1C89, 0x1C8A, 0x20C1, 0x20C1, 0x2427, 0x2429, 0x2B96, 0x2B96, 0x31E4, 0x31E5, 0xA7CB, 0xA7CF,
  0xA7D2, 0xA7D2, 0xA7D4, 0xA7D4, 0xA7DA, 0xA7DC, 0xA7F1, 0xA7F1, 0xFBC3, 0xFBD2, 0xFD90, 0xFD91, 0xFDC8, 0xFDCE,
  0x105C0, 0x105F3, 0x10940, 0x10959, 0x10D40, 0x10D65, 0x10D69, 0x10D85, 0x10D8E, 0x10D8F, 0x10EC2, 0x10EC7,
  0x10ED0, 0x10ED8, 0x10EFA, 0x10EFC, 0x11380, 0x11389, 0x1138B, 0x1138B, 0x1138E, 0x1138E, 0x11390, 0x113B5,
  0x113B7, 0x113C0, 0x113C2, 0x113C2, 0x113C5, 0x113C5, 0x113C7, 0x113CA, 0x113CC, 0x113D5, 0x113D7, 0x113D8,
  0x113E1, 0x113E2, 0x116D0, 0x116E3, 0x11B60, 0x11B67, 0x11BC0, 0x11BE1, 0x11BF0, 0x11BF9, 0x11DB0, 0x11DDB,
  0x11DE0, 0x11DE9, 0x11F5A, 0x11F5A, 0x13460, 0x143FA, 0x16100, 0x16139, 0x16D40, 0x16D79, 0x16EA0, 0x16EB8,
  0x16EBB, 0x16ED3, 0x16FF2, 0x16FF6, 0x187F8, 0x187FF, 0x18CFF, 0x18CFF, 0x18D09, 0x18D1E, 0x18D80, 0x18DF2,
  0x1CC00, 0x1CCFC, 0x1CD00, 0x1CEB3, 0x1CEBA, 0x1CED0, 0x1CEE0, 0x1CEF0, 0x1E5D0, 0x1E5FA, 0x1E5FF, 0x1E5FF,
  0x1E6C0, 0x1E6DE, 0x1E6E0, 0x1E6F5, 0x1E6FE, 0x1E6FF, 0x1F6D8, 0x1F6D8, 0x1F777, 0x1F77A, 0x1F8B2, 0x1F8BB,
  0x1F8C0, 0x1F8C1, 0x1F8D0, 0x1F8D8, 0x1FA54, 0x1FA57, 0x1FA89, 0x1FA8A, 0x1FA8E, 0x1FA8F, 0x1FABE, 0x1FABE,
  0x1FAC6, 0x1FAC6, 0x1FAC8, 0x1FAC8, 0x1FACD, 0x1FACD, 0x1FADC, 0x1FADC, 0x1FADF, 0x1FADF, 0x1FAE9, 0x1FAEA,
  0x1FAEF, 0x1FAEF, 0x1FBCB, 0x1FBEF, 0x1FBFA, 0x1FBFA, 0x2B73A, 0x2B73F, 0x2CEA2, 0x2CEAD, 0x323B0, 0x33479];
function pyUnassignedNew(o) {
  for (let i = 0; i < PY_UNASSIGNED_NEW.length; i += 2) if (o >= PY_UNASSIGNED_NEW[i] && o <= PY_UNASSIGNED_NEW[i + 1]) return true;
  return false;
}
function hex(n, w) { let s = n.toString(16); while (s.length < w) s = '0' + s; return s; }
function strRepr(s) {
  const q = (s.indexOf("'") >= 0 && s.indexOf('"') < 0) ? '"' : "'";
  let out = q;
  for (const ch of s) {
    const o = ch.codePointAt(0);
    if (ch === q || ch === '\\') out += '\\' + ch;
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (o < 0x20 || o === 0x7f) out += '\\x' + hex(o, 2);
    else if (o < 0x7f) out += ch;
    else if (ch !== ' ' && (RE_NONPRINT.test(ch) || pyUnassignedNew(o))) {
      if (o <= 0xff) out += '\\x' + hex(o, 2);
      else if (o <= 0xffff) out += '\\u' + hex(o, 4);
      else out += '\\U' + hex(o, 8);
    } else out += ch;
  }
  return out + q;
}
// repr(x)
function pyRepr(x) {
  if (typeof x === 'string') return strRepr(x);
  return reprNonStr(x);
}
function reprNonStr(x) {
  if (isNone(x)) return 'None';
  if (typeof x === 'boolean') return x ? 'True' : 'False';
  if (typeof x === 'bigint') return x.toString();
  if (typeof x === 'number') return numIsInt(x) ? BigInt(x).toString() : floatRepr(x);
  if (Array.isArray(x)) return '[' + x.map(pyRepr).join(', ') + ']';
  return '{' + Object.keys(x).map(k => strRepr(k) + ': ' + pyRepr(x[k])).join(', ') + '}';
}
// str(x)
function pyStr(x) { return typeof x === 'string' ? x : reprNonStr(x); }

// json.dumps(str) 기본값(ensure_ascii=True)
function pyJsonStr(s) {
  if (typeof s !== 'string') throw pyErr('TypeError', 'pyJsonStr: str only');
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);       // UTF-16 단위 = Python 의 서로게이트 쌍 출력과 동일
    if (c >= 0x20 && c <= 0x7e && c !== 0x5c && c !== 0x22) { out += s[i]; continue; }
    switch (c) {
      case 0x5c: out += '\\\\'; break;
      case 0x22: out += '\\"'; break;
      case 0x08: out += '\\b'; break;
      case 0x0c: out += '\\f'; break;
      case 0x0a: out += '\\n'; break;
      case 0x0d: out += '\\r'; break;
      case 0x09: out += '\\t'; break;
      default: out += '\\u' + hex(c, 4);
    }
  }
  return out + '"';
}

// '...' % (args) — 생성기에서 쓰는 %s %d %f %% 만 지원. 인자 개수 불일치는 TypeError(Python 과 동일).
function fmt(f, args) {
  let out = '', ai = 0, i = 0;
  for (;;) {
    const j = f.indexOf('%', i);
    if (j < 0) { out += f.slice(i); break; }
    out += f.slice(i, j);
    const c = f[j + 1];
    if (c === '%') { out += '%'; i = j + 2; continue; }
    if (ai >= args.length) throw pyErr('TypeError', 'not enough arguments for format string');
    const a = args[ai++];
    if (c === 's') out += pyStr(a);
    else if (c === 'd') out += pyD(a);
    else if (c === 'f') out += pyF(a);
    else throw new Error('fmt: unsupported conversion %' + c);
    i = j + 2;
  }
  if (ai !== args.length) throw pyErr('TypeError', 'not all arguments converted during string formatting');
  return out;
}

module.exports = {
  isDict, isNone, typeName, pyErr, get, sub, iter, len, index, truthy, or,
  ge, le, gt, lt, max2, min2,
  float, int, round, ceil, div, mod, hypot, degrees, atan2,
  pyF, pyD, floatRepr, pyRepr, pyStr, pyJsonStr, fmt, decomp, signbit, pyJsonVal,
};
