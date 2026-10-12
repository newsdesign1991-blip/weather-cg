/* [모듈] js/sat-mip.js — 위성 바탕(밝은·어두운 위성지도 큰 그림) 축소 단계(밉맵): 미리 줄인 그림 1/2~1/32을 한 번 만들어 두고 화면·추출·틸트가 실제로 그려질 크기에 맞는 두 단계를 섞어 그린다(넓게 축소할 때 작은 섬·구름 점이 깜빡이지 않게) */
'use strict';

// ===================== 위성 바탕 축소 단계(밉맵) =====================
// 왜: 위성 바탕(typhoon-satellite.js·typhoon-satellite-dark.js — 8000×7056 JPEG 한 장)은 SVG <image> 하나로 그린다.
//   카메라로 넓게 축소하면 크롬이 이 그림을 줄여 그릴 때 넓이 평균을 하지 않아(대략 2배를 넘으면 건너뛰는 픽셀이 생김),
//   1~2px짜리 작은 섬·구름 점이 프레임마다 잡혔다 빠졌다 한다 — 영상에서 '바다 한가운데 흰 점이 깜빡깜빡'(사용자 10-12).
//   (점 격자 시험: 3.5배 축소에서 점 에너지가 0~2.7배로 흔들리고 아예 사라지는 점도 있음 — 큰 그림·작은 그림 똑같이)
// 그래서: 그림을 2×2 넓이 평균으로 반씩 줄인 단계(1 = 1/2, 2 = 1/4 … 5 = 1/32)를 처음 필요할 때 한 번 만들어(JPEG·PNG 데이터 주소로) 두고,
//   그려질 크기(그림 1px이 출력 몇 px인가 = k)에 맞춰 두 단계를 섞는다(GPU의 삼선형 필터와 같은 식 — 아래 satMipPick).
//   k ≥ 1(가까이 확대)이면 지금처럼 원본 그대로 — 선명함은 그대로다.
// 쓰는 곳: 화면(renderTyphoon → satMipShow — 재생 가속 중엔 안 바꿈), 추출·영상 프레임·틸트 그림(svgToImage)·이미지 추출·AE 레이어(svgBlob)·
//   프로젝트 미리보기(previewPng) → satMipClone(복제본, 출력 px/뷰박스 단위). 섞는 위 그림은 #typhoonSatB(처음 필요할 때 #typhoonSat 바로 뒤에 만든다).
// 만들기: 메인 스레드에서 64줄씩 잘라 넓이 평균(중간중간 쉼) → 1단계 JPEG, 2단계부터 PNG(작은 섬의 옅은 픽셀이 손실 압축으로 지워지지 않게).
const SAT_MIP_MAX = 5;          // 가장 작은 단계 = 1/32 (8000 → 250px)
const SAT_MIP_Q = 0.92;         // 단계 JPEG 품질
const _satMip = {};             // 'satellite'·'satdark' → 단계 항목(satMipEntry)
// 그림 1px이 출력 k px로 그려질 때 쓸 단계 — { lo, hi, t }: lo 단계 위에 hi 단계를 불투명도 t로 덮는다.
// 축소 배율 d = 1/k, e = log2(d): lo = ⌊e⌋(그려질 크기의 1~2배인 단계), hi = lo + 1(그려질 크기보다 작은 단계), t = e − lo.
// d가 2의 거듭제곱이면 그 단계 하나(1:1), 사이에서는 두 단계를 고르게 섞어 단계가 바뀌는 순간에도 튀지 않는다(e가 정수를 지날 때 그림이 같다).
// t가 아주 작거나(0.02 미만) 거의 1이면 한 장만 — 보이지 않는 차이로 그림을 두 장 굽지 않게.
function satMipPick(k, max) {
  const M = max == null ? SAT_MIP_MAX : max;
  if (!(k > 0) || k >= 1) return { lo: 0, hi: 0, t: 0 };
  const e = Math.log2(1 / k);
  let lo = Math.floor(e), t = e - lo;
  if (lo >= M) return { lo: M, hi: M, t: 0 };
  if (t < 0.02) t = 0;
  else if (t > 0.98) { lo += 1; t = 0; }
  return { lo, hi: t ? lo + 1 : lo, t };
}
// 2×2 넓이 평균으로 반 줄이기(RGBA) — 홀수 끝줄·끝칸은 가장자리를 되풀이한다. 반올림(+2 >> 2).
function satMipHalf(src, w, h) {
  const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2), out = new Uint8ClampedArray(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) {
    const r0 = 2 * y * w * 4, r1 = Math.min(2 * y + 1, h - 1) * w * 4, oy = y * w2 * 4;
    for (let x = 0; x < w2; x++) {
      const c0 = 8 * x, c1 = Math.min(2 * x + 1, w - 1) * 4, o = oy + 4 * x;
      const a = r0 + c0, b = r0 + c1, c = r1 + c0, d = r1 + c1;
      out[o] = (src[a] + src[b] + src[c] + src[d] + 2) >> 2;
      out[o + 1] = (src[a + 1] + src[b + 1] + src[c + 1] + src[d + 1] + 2) >> 2;
      out[o + 2] = (src[a + 2] + src[b + 2] + src[c + 2] + src[d + 2] + 2) >> 2;
      out[o + 3] = (src[a + 3] + src[b + 3] + src[c + 3] + src[d + 3] + 2) >> 2;
    }
  }
  return { data: out, w: w2, h: h2 };
}
// 데이터 주소(JPEG·PNG)의 그림 크기 — 머리만 풀어 읽는다(디코드 없이). 모르면 null
function satMipImgSize(url) {
  const m = /^data:image\/(jpeg|jpg|png);base64,/.exec(url || '');
  if (!m) return null;
  let bin;
  try { bin = atob(url.slice(m[0].length, m[0].length + 87380).replace(/[^A-Za-z0-9+/]/g, '').slice(0, 87380 - (87380 % 4))); } catch (e) { return null; }
  const u = (i) => bin.charCodeAt(i) & 255;
  if (m[1] === 'png') return bin.length >= 24 ? { w: (u(16) << 24 | u(17) << 16 | u(18) << 8 | u(19)) >>> 0, h: (u(20) << 24 | u(21) << 16 | u(22) << 8 | u(23)) >>> 0 } : null;
  for (let i = 2; i + 9 < bin.length;) {
    if (u(i) !== 0xFF) { i++; continue; }
    const mk = u(i + 1);
    if (mk === 0xD8 || mk === 0x01 || (mk >= 0xD0 && mk <= 0xD7) || mk === 0xFF) { i += mk === 0xFF ? 1 : 2; continue; }
    const len = u(i + 2) << 8 | u(i + 3);
    if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) return { w: u(i + 7) << 8 | u(i + 8), h: u(i + 5) << 8 | u(i + 6) };
    i += 2 + len;
  }
  return null;
}
// 지금 위성 모드의 그림 데이터(밝은·어두운) — 없으면 null
const satMipSatOf = (bm) => (bm === 'satdark' ? window.TYPHOON_SATELLITE_DARK : bm === 'satellite' ? window.TYPHOON_SATELLITE : null);
// 단계 항목 — 원본이 바뀌면(다른 데이터) 새로. levels[0] = 원본 데이터 주소, 1~ = 만든 단계(만들기 전엔 비어 있음)
function satMipEntry(bm) {
  const SAT = satMipSatOf(bm);
  if (!SAT || !SAT.img) return null;
  let E = _satMip[bm];
  if (!E || E.src !== SAT.img) {
    const sz = satMipImgSize(SAT.img);
    E = _satMip[bm] = { bm, src: SAT.img, w: sz ? sz.w : 0, h: sz ? sz.h : 0, levels: [{ url: SAT.img }], state: 'idle', p: null, stats: null, warm: {} };
  }
  return E;
}
const _satMipYield = () => new Promise((r) => setTimeout(r, 0));
// RGBA → 데이터 주소 — 큰 1단계는 JPEG, 2단계 이후는 PNG로 약한 섬 픽셀을 보존한다.
// (convertToBlob·toBlob은 첫 굽기가 1~4초로 들쭉날쭉했다 — 10-12 측정)
function satMipEncode(lv, level) {
  const c = document.createElement('canvas'); c.width = lv.w; c.height = lv.h;
  c.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(lv.data, lv.w, lv.h), 0, 0);
  const type = level >= 2 ? 'image/png' : 'image/jpeg';
  const url = c.toDataURL(type, SAT_MIP_Q);
  c.width = c.height = 1;
  if (!url.startsWith('data:' + type)) throw new Error('image encode');
  return url;
}
// 단계 만들기(한 번) — 원본을 64줄씩 잘라 2×2 평균 → 1단계, 그 뒤는 압축 전 RGBA에서 반씩.
// 실패하면(메모리·디코드) state 'fail' — 부르는 쪽은 원본 그대로 그린다.
function satMipEnsure(E) {
  if (!E) return Promise.resolve(null);
  if (E.state === 'ready' || E.state === 'fail') return Promise.resolve(E);
  if (E.p) return E.p;
  E.state = 'busy';
  E.p = (async () => {
    const t0 = performance.now();
    const im = new Image(); im.src = E.src; await im.decode();
    const W0 = im.naturalWidth, H0 = im.naturalHeight; E.w = W0; E.h = H0;
    const tDec = performance.now();
    const BAND = 64, W1 = Math.ceil(W0 / 2), H1 = Math.ceil(H0 / 2);
    let cur = { data: new Uint8ClampedArray(W1 * H1 * 4), w: W1, h: H1 };
    const bc = document.createElement('canvas'); bc.width = W0; bc.height = BAND;
    const bx = bc.getContext('2d', { willReadFrequently: true });
    for (let y0 = 0, n = 0; y0 < H0; y0 += BAND, n++) {
      const bh = Math.min(BAND, H0 - y0);
      bx.clearRect(0, 0, W0, BAND); bx.drawImage(im, 0, y0, W0, bh, 0, 0, W0, bh);
      const half = satMipHalf(bx.getImageData(0, 0, W0, bh).data, W0, bh);
      cur.data.set(half.data, (y0 / 2) * W1 * 4);
      if (n % 6 === 5) await _satMipYield();   // 화면이 멈추지 않게 조금씩
    }
    bc.width = bc.height = 1;
    const tBox = performance.now();
    const levels = [{ url: E.src, w: W0, h: H0 }], bytes = [];
    const lvMs = [];
    for (let L = 1; L <= SAT_MIP_MAX; L++) {
      const a0 = performance.now();
      if (L > 1) { cur = satMipHalf(cur.data, cur.w, cur.h); await _satMipYield(); }
      const a1 = performance.now();
      const url = satMipEncode(cur, L);
      levels.push({ url, w: cur.w, h: cur.h });
      bytes.push(Math.round((url.length - 23) * 3 / 4)); lvMs.push([Math.round(a1 - a0), Math.round(performance.now() - a1)]);
      await _satMipYield();
    }
    E.levels = levels; E.state = 'ready';
    E.stats = { ms: Math.round(performance.now() - t0), decodeMs: Math.round(tDec - t0), boxMs: Math.round(tBox - tDec), encodeMs: Math.round(performance.now() - tBox), lvMs, bytes, peakBufMB: Math.round((W0 * BAND * 4 * 2 + W1 * H1 * 4 * 1.34) / 1048576) };
    return E;
  })().catch((e) => { E.state = 'fail'; E.err = String(e && e.message || e); return E; }).finally(() => { E.p = null; });
  return E.p;
}
// 그림 1px → 출력 px(k): (그림 폭(뷰박스 단위) / 그림 픽셀 폭) × 지도 배율 × 출력 px/뷰박스 단위
function satMipK(E, el, mapS, ppv) {
  const vbW = +el.getAttribute('width') || 0;
  if (!E || !E.w || !(vbW > 0) || !(mapS > 0) || !(ppv > 0)) return 1;
  return vbW / E.w * mapS * ppv;
}
// 지도 변환(#bgMapT)의 배율 — 재생 가속 중 CSS 변환(style)이 있으면 그것이 실제 그려지는 배율
function satMipMapScale(g) {
  if (!g) return +S.map.s || 1;
  const m = /scale\(\s*([-\d.e+]+)/.exec((g.style && g.style.transform) || '') || /scale\(\s*([-\d.e+]+)/.exec(g.getAttribute('transform') || '');
  return m ? +m[1] : (+S.map.s || 1);
}
// 두 그림 요소(a = #typhoonSat 아래, b = #typhoonSatB 위)에 단계 p를 건다. 바뀐 것만(큰 데이터 주소를 매번 다시 넣지 않게).
function satMipSetEl(a, b, E, p) {
  const lv = (i) => (E.levels[i] && E.levels[i].url) || E.src;
  const ka = E.bm + ':' + p.lo;
  if (a._satEntry !== E || a._satLv !== ka) { a.setAttribute('href', lv(p.lo)); a._satLv = ka; a._satEntry = E; }
  if (!b) return;
  for (const n of ['x', 'y', 'width', 'height']) { const v = a.getAttribute(n); if (b.getAttribute(n) !== v) b.setAttribute(n, v); }
  if (p.t > 0) {
    const kb = E.bm + ':' + p.hi;
    if (b._satEntry !== E || b._satLv !== kb) { b.setAttribute('href', lv(p.hi)); b._satLv = kb; b._satEntry = E; }
    const op = p.t.toFixed(3); if (b.getAttribute('opacity') !== op) b.setAttribute('opacity', op);
    if (b.style.display) b.style.display = '';
  } else if (b.style.display !== 'none') b.style.display = 'none';
}
// 단계가 아직 없으면(만드는 중·실패) 원본 한 장
const satMipFallback = () => ({ lo: 0, hi: 0, t: 0 });
// 추출·영상 프레임·틸트 그림의 SVG 복제본 — 출력 px/뷰박스 단위(ppv)에 맞는 단계를 건다. 단계를 처음 쓸 때만 만들기를 기다린다.
// 배율은 복제본의 #bgMapT 변환에서 읽는다(부른 뒤 기다리는 사이 S.map이 바뀌어도 복제한 그 순간의 그림 그대로).
async function satMipClone(clone, ppv) {
  const a = clone.querySelector('#typhoonSat'), b = clone.querySelector('#typhoonSatB');
  if (!a || a.style.display === 'none') { b?.remove(); return; }
  const bm = a.getAttribute('data-sat-mode') || (S.typhoon && S.typhoon.basemap) || '';
  const E = satMipEntry(bm);
  if (!E) { b?.remove(); return; }
  const k = satMipK(E, a, satMipMapScale(clone.querySelector('#bgMapT')), ppv);
  let p = satMipPick(k);
  if (p.lo || p.t) { await satMipEnsure(E); if (E.state !== 'ready') p = satMipFallback(); }
  let bb = b;
  if (p.t > 0 && !bb) { bb = document.createElementNS(svgNS, 'image'); bb.setAttribute('id', 'typhoonSatB'); bb.setAttribute('preserveAspectRatio', 'none'); a.after(bb); }
  a._satLv = null; if (bb) bb._satLv = null;   // 복제본은 늘 새로 건다(화면 요소의 표시를 물려받지 않게)
  satMipSetEl(a, bb, E, p);
  if (bb && !(p.t > 0)) bb.remove();
}
// 화면 — 아트보드 1 뷰박스 단위가 기기 px로 몇인가(사이드바·창 크기·화면 배율)
function satMipScreenPpv() {
  const w = _fitCssW || (fit && fit.clientWidth) || 1920;
  return w / 1920 * (view.z || 1) * (window.devicePixelRatio || 1);
}
// 화면의 위성 바탕(renderTyphoon이 위치·크기를 맞춘 뒤 부른다). on = 위성 모드로 보이는가.
// 재생 가속 중(_tyLiteDraw)엔 단계를 바꾸지 않는다 — 그 큰 레이어를 프레임마다 다시 굽게 되므로(멈추면 정확한 프레임이 맞춘다).
// 단계가 아직 없으면 원본으로 두고 뒤에서 만든 뒤 다시 맞춘다. 새 단계 그림은 먼저 디코드해 둔 뒤 바꾼다(바꾸는 순간 빈 프레임이 없게).
function satMipShow(on, bm) {
  const a = $('#typhoonSat');
  let b = $('#typhoonSatB');
  const E = on && a ? satMipEntry(bm) : null;
  if (!E) { if (b && b.style.display !== 'none') b.style.display = 'none'; return; }
  a.setAttribute('data-sat-mode', bm);   // 복제 뒤 기다리는 동안 화면 모드가 바뀌어도 해당 그림의 출처 유지
  if (!b) { b = document.createElementNS(svgNS, 'image'); b.setAttribute('id', 'typhoonSatB'); b.setAttribute('preserveAspectRatio', 'none'); b.style.display = 'none'; a.after(b); }
  if (_tyLiteDraw && a._satEntry === E && a._satLv) return;
  let p = satMipPick(satMipK(E, a, +S.map.s || 1, satMipScreenPpv()));
  if (p.lo || p.t) {
    if (E.state !== 'ready') {
      if (E.state !== 'fail') satMipEnsure(E).then(() => satMipShowNow());
      p = satMipFallback();
    } else {
      const need = [p.lo, p.hi].filter((L) => L > 0 && !E.warm[L]);
      if (need.length) {   // 처음 보이는 단계 — 디코드가 끝나면 다시(그동안은 지금 그림 그대로)
        for (const L of need) if (E.warm[L] == null) { E.warm[L] = false; const im = new Image(); im.src = E.levels[L].url; im.decode().catch(() => {}).then(() => { E.warm[L] = true; satMipShowNow(); }); }
        if (a._satEntry === E && a._satLv) return;
        p = satMipFallback();
      }
    }
  }
  satMipSetEl(a, b, E, p);
}
// 단계를 다 만들었거나 디코드가 끝났을 때 — 지금도 위성 모드면 다시 맞춘다
function satMipShowNow() {
  if (!isTyphoon() || !S.typhoon) return;
  const a = $('#typhoonSat');
  if (!a || a.style.display === 'none') return;
  satMipShow(true, S.typhoon.basemap);
}
