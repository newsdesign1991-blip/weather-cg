'use strict';
// 파이썬 bytes.decode('utf-8') + json.loads 흉내 — helper.py 가 500 응답에 담는 오류 문구(str(e))까지 같게.
// 값 모델은 JSON.parse 와 같다(객체=일반 객체, 숫자=number). 다른 점: NaN/Infinity/-Infinity 허용(파이썬 기본),
// 오류 문구는 CPython 3.13 C 스캐너(_json.c)와 utf-8 디코더 그대로.

// ── utf-8 디코드(오류면 UnicodeDecodeError 문구) ──
const isCont = (b) => b >= 0x80 && b <= 0xbf;
const hex2 = (n) => n.toString(16).padStart(2, '0');

// 첫 오류 위치 [start, end, reason] (없으면 null) — CPython stringlib/codecs.h 와 같은 범위
function utf8ErrorRange(buf) {
  const n = buf.length;
  let i = 0;
  while (i < n) {
    const c = buf[i];
    if (c < 0x80) { i++; continue; }
    if (c < 0xc2 || c > 0xf4) return [i, i + 1, 'invalid start byte'];
    if (c < 0xe0) {
      if (n - i < 2) return [i, n, 'unexpected end of data'];
      if (!isCont(buf[i + 1])) return [i, i + 1, 'invalid continuation byte'];
      i += 2; continue;
    }
    if (c < 0xf0) {
      if (n - i < 3) {
        if (n - i < 2) return [i, n, 'unexpected end of data'];
        const c2 = buf[i + 1];
        if (!isCont(c2) || (c2 < 0xa0 ? c === 0xe0 : c === 0xed)) return [i, i + 1, 'invalid continuation byte'];
        return [i, n, 'unexpected end of data'];
      }
      const c2 = buf[i + 1];
      if (!isCont(c2) || (c === 0xe0 && c2 < 0xa0) || (c === 0xed && c2 >= 0xa0)) return [i, i + 1, 'invalid continuation byte'];
      if (!isCont(buf[i + 2])) return [i, i + 2, 'invalid continuation byte'];
      i += 3; continue;
    }
    if (n - i < 4) {
      if (n - i < 2) return [i, n, 'unexpected end of data'];
      const c2 = buf[i + 1];
      if (!isCont(c2) || (c2 < 0x90 ? c === 0xf0 : c === 0xf4)) return [i, i + 1, 'invalid continuation byte'];
      if (n - i === 3 && !isCont(buf[i + 2])) return [i, i + 2, 'invalid continuation byte'];
      return [i, n, 'unexpected end of data'];
    }
    const c2 = buf[i + 1];
    if (!isCont(c2) || (c === 0xf0 && c2 < 0x90) || (c === 0xf4 && c2 >= 0x90)) return [i, i + 1, 'invalid continuation byte'];
    if (!isCont(buf[i + 2])) return [i, i + 2, 'invalid continuation byte'];
    if (!isCont(buf[i + 3])) return [i, i + 3, 'invalid continuation byte'];
    i += 4;
  }
  return null;
}

// buf.decode('utf-8') — 실패하면 파이썬과 같은 문구로 throw
function decodeUtf8Strict(buf) {
  const r = utf8ErrorRange(buf);
  if (r) {
    const [s, e, why] = r;
    const msg = e - s === 1
      ? "'utf-8' codec can't decode byte 0x" + hex2(buf[s]) + ' in position ' + s + ': ' + why
      : "'utf-8' codec can't decode bytes in position " + s + '-' + (e - 1) + ': ' + why;
    const err = new Error(msg); err.pyType = 'UnicodeDecodeError'; throw err;
  }
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(buf);   // BOM 은 남긴다(파이썬 utf-8)
}

// ── json.loads ──
function decodeError(msg, cps, pos) {
  let line = 1, last = -1;
  for (let i = 0; i < pos; i++) if (cps[i] === '\n') { line++; last = i; }
  const e = new Error(msg + ': line ' + line + ' column ' + (pos - last) + ' (char ' + pos + ')');
  e.pyType = 'JSONDecodeError';
  return e;
}
class StopIter { constructor(idx) { this.idx = idx; } }
const WS = new Set([' ', '\t', '\n', '\r']);
const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';
const HEXV = (c) => {
  if (c === undefined) return -1;
  const o = c.codePointAt(0);
  if (o >= 48 && o <= 57) return o - 48;
  if (o >= 97 && o <= 102) return o - 87;
  if (o >= 65 && o <= 70) return o - 55;
  return -1;
};

function setKey(obj, k, v) {   // "__proto__" 키도 일반 키로(파이썬 dict 처럼)
  Object.defineProperty(obj, k, { value: v, writable: true, enumerable: true, configurable: true });
}

function makeScanner(cps) {
  const len = cps.length, endIdx = len - 1;
  const skipWs = (i) => { while (i <= endIdx && WS.has(cps[i])) i++; return i; };
  const at = (i, s) => { for (let k = 0; k < s.length; k++) if (cps[i + k] !== s[k]) return false; return true; };

  function scanString(end) {   // end = 여는 따옴표 다음
    const begin = end - 1;
    let out = '';
    for (;;) {
      let next = end, d = '';
      for (; next < len; next++) {
        d = cps[next];
        if (d === '"' || d === '\\') break;
        if (d.codePointAt(0) <= 0x1f) throw decodeError('Invalid control character at', cps, next);
      }
      const c = next < len ? d : '';
      if (c !== '"' && c !== '\\') throw decodeError('Unterminated string starting at', cps, begin);
      out += cps.slice(end, next).join('');
      next++;
      if (c === '"') return [out, next];
      if (next === len) throw decodeError('Unterminated string starting at', cps, begin);
      const e = cps[next];
      if (e !== 'u') {
        end = next + 1;
        const m = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[e];
        if (m === undefined) throw decodeError('Invalid \\escape', cps, end - 2);
        out += m;
        continue;
      }
      next++;
      end = next + 4;
      if (end >= len) throw decodeError('Invalid \\uXXXX escape', cps, next - 1);
      let u = 0;
      for (; next < end; next++) {
        const h = HEXV(cps[next]);
        if (h < 0) throw decodeError('Invalid \\uXXXX escape', cps, end - 5);
        u = (u << 4) | h;
      }
      if (u >= 0xd800 && u <= 0xdbff && end + 6 < len && cps[next] === '\\' && cps[next + 1] === 'u') {
        next += 2;
        end += 6;
        let u2 = 0;
        for (; next < end; next++) {
          const h = HEXV(cps[next]);
          if (h < 0) throw decodeError('Invalid \\uXXXX escape', cps, end - 5);
          u2 = (u2 << 4) | h;
        }
        if (u2 >= 0xdc00 && u2 <= 0xdfff) u = 0x10000 + ((u - 0xd800) << 10) + (u2 - 0xdc00);
        else end -= 6;
      }
      out += String.fromCodePoint(u);
    }
  }

  function matchNumber(start) {
    let idx = start, isFloat = false;
    if (cps[idx] === '-') { idx++; if (idx > endIdx) throw new StopIter(start); }
    if (cps[idx] >= '1' && cps[idx] <= '9') { idx++; while (idx <= endIdx && isDigit(cps[idx])) idx++; }
    else if (cps[idx] === '0') idx++;
    else throw new StopIter(start);
    if (idx < endIdx && cps[idx] === '.' && isDigit(cps[idx + 1])) {
      isFloat = true; idx += 2;
      while (idx <= endIdx && isDigit(cps[idx])) idx++;
    }
    if (idx < endIdx && (cps[idx] === 'e' || cps[idx] === 'E')) {
      const eStart = idx; idx++;
      if (idx < endIdx && (cps[idx] === '-' || cps[idx] === '+')) idx++;
      while (idx <= endIdx && isDigit(cps[idx])) idx++;
      if (isDigit(cps[idx - 1])) isFloat = true; else idx = eStart;
    }
    void isFloat;   // 값 모델상 int/float 모두 number
    return [Number(cps.slice(start, idx).join('')), idx];
  }

  function parseObject(idx) {
    const obj = {};
    idx = skipWs(idx);
    if (idx > endIdx || cps[idx] !== '}') {
      for (;;) {
        if (idx > endIdx || cps[idx] !== '"') throw decodeError('Expecting property name enclosed in double quotes', cps, idx);
        const [key, ni] = scanString(idx + 1);
        idx = skipWs(ni);
        if (idx > endIdx || cps[idx] !== ':') throw decodeError("Expecting ':' delimiter", cps, idx);
        idx = skipWs(idx + 1);
        const [val, vi] = scanOnce(idx);
        setKey(obj, key, val);
        idx = skipWs(vi);
        if (idx <= endIdx && cps[idx] === '}') break;
        if (idx > endIdx || cps[idx] !== ',') throw decodeError("Expecting ',' delimiter", cps, idx);
        const comma = idx;
        idx = skipWs(idx + 1);
        if (idx <= endIdx && cps[idx] === '}') throw decodeError('Illegal trailing comma before end of object', cps, comma);
      }
    }
    return [obj, idx + 1];
  }

  function parseArray(idx) {
    const arr = [];
    idx = skipWs(idx);
    if (idx > endIdx || cps[idx] !== ']') {
      for (;;) {
        const [val, vi] = scanOnce(idx);
        arr.push(val);
        idx = skipWs(vi);
        if (idx <= endIdx && cps[idx] === ']') break;
        if (idx > endIdx || cps[idx] !== ',') throw decodeError("Expecting ',' delimiter", cps, idx);
        const comma = idx;
        idx = skipWs(idx + 1);
        if (idx <= endIdx && cps[idx] === ']') throw decodeError('Illegal trailing comma before end of array', cps, comma);
      }
    }
    return [arr, idx + 1];
  }

  function scanOnce(idx) {
    if (idx >= len) throw new StopIter(idx);
    switch (cps[idx]) {
      case '"': return scanString(idx + 1);
      case '{': return parseObject(idx + 1);
      case '[': return parseArray(idx + 1);
      case 'n': if (idx + 3 < len && at(idx + 1, 'ull')) return [null, idx + 4]; break;
      case 't': if (idx + 3 < len && at(idx + 1, 'rue')) return [true, idx + 4]; break;
      case 'f': if (idx + 4 < len && at(idx + 1, 'alse')) return [false, idx + 5]; break;
      case 'N': if (idx + 2 < len && at(idx + 1, 'aN')) return [NaN, idx + 3]; break;
      case 'I': if (idx + 7 < len && at(idx + 1, 'nfinity')) return [Infinity, idx + 8]; break;
      case '-': if (idx + 8 < len && at(idx + 1, 'Infinity')) return [-Infinity, idx + 9]; break;
      default: break;
    }
    return matchNumber(idx);
  }
  return { scanOnce, skipWs };
}

// json.loads(str)
function pyJsonLoads(s) {
  const cps = Array.from(String(s));
  if (cps[0] === '﻿') throw decodeError('Unexpected UTF-8 BOM (decode using utf-8-sig)', cps, 0);
  const sc = makeScanner(cps);
  let v, end;
  try { [v, end] = sc.scanOnce(sc.skipWs(0)); } catch (e) {
    if (e instanceof StopIter) throw decodeError('Expecting value', cps, e.idx);
    throw e;
  }
  end = sc.skipWs(end);
  if (end !== cps.length) throw decodeError('Extra data', cps, end);
  return v;
}

// json.loads(body.decode('utf-8'))
const pyJsonLoadsBytes = (buf) => pyJsonLoads(decodeUtf8Strict(buf));

module.exports = { pyJsonLoads, pyJsonLoadsBytes, decodeUtf8Strict, utf8ErrorRange };
