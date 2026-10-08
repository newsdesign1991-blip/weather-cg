/* [모듈] js/tilt-gl.js — 틸트 지도 WebGL2 렌더러(밉맵·비등방 텍스처로 원근 투영 — 미리보기 #camGL·추출 공용, 못 쓰면 CSS·2D 메시로) */
'use strict';

// ===================== 틸트 지도 WebGL 렌더러 =====================
// 왜: 지도 그림(블리드 포함 5760×3240)을 CSS 3D transform으로 기울이면 GPU가 밉맵 없이 줄여 그려
//   1px 흰 선(시도 경계·섬 외곽선·인셋 박스·위성 지도 작은 섬)이 점선으로 끊기고 각도마다 반짝인다.
//   같은 그림을 밉맵(LINEAR_MIPMAP_LINEAR) + 비등방(최대 16) 텍스처로 직접 투영하면 반짝임이 크게 준다.
// 투영은 warpTilt3D·_camProjectRaw·CSS(rotateX·Y·Z + perspective)와 같은 식이다(뷰박스 단위, 원근 거리 P = persp × 1920).
// 그림(텍스처)은 바뀔 때만 올리고(texImage2D + generateMipmap), 회전만 바뀌면 다시 그리기만 한다.
// WebGL2를 못 쓰거나(tglCreate가 null) 컨텍스트를 잃으면(r.lost) 부르는 쪽이 예전 경로(미리보기 CSS, 추출 2D 메시)로 간다.
// 끄기(문제 GPU 비상용): localStorage 'wcg_tiltgl' = '0' → 새로 고침.
const TGL_VS = `#version 300 es
in vec4 aP; in vec2 aUV; out vec2 vUV;
void main() { vUV = aUV; gl_Position = aP; }`;
// 가장자리 페이드 = 미리보기 CSS 마스크(가로·세로 linear-gradient 교집합)·추출 fadeEdgesCanvas와 같은 식. 색은 premultiplied.
const TGL_FS = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uT; uniform float uF; uniform float uA; out vec4 o;
void main() {
  vec2 e = clamp(min(vUV, 1.0 - vUV) / uF, 0.0, 1.0);
  o = texture(uT, vUV) * (e.x * e.y * uA);
}`;
function tglEnabled() { try { return localStorage.getItem('wcg_tiltgl') !== '0'; } catch (e) { return true; } }
// 캔버스 하나에 렌더러 하나. 못 만들면 null. onLost(r, restored): 컨텍스트를 잃었을 때(false)·되찾았을 때(true)
function tglCreate(cv, onLost) {
  if (!cv || !tglEnabled()) return null;
  let gl = null;
  try { gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
  if (!gl) return null;
  const r = { cv, gl, lost: false, has: false, w: 0, h: 0, checked: false, onLost: onLost || null };
  if (!tglInit(r)) return null;
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); r.lost = true; r.has = r.has2 = false; if (r.onLost) r.onLost(r, false); });
  cv.addEventListener('webglcontextrestored', () => { r.lost = !tglInit(r); r.has = false; if (r.onLost) r.onLost(r, true); });
  return r;
}
// 셰이더·버퍼·텍스처(컨텍스트를 되찾으면 다시)
function tglInit(r) {
  const gl = r.gl;
  try {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, TGL_VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, TGL_FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    r.prog = p;
    r.uT = gl.getUniformLocation(p, 'uT'); r.uF = gl.getUniformLocation(p, 'uF'); r.uA = gl.getUniformLocation(p, 'uA');
    r.buf = gl.createBuffer();
    r.vao = gl.createVertexArray();
    gl.bindVertexArray(r.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.buf);
    const aP = gl.getAttribLocation(p, 'aP'), aUV = gl.getAttribLocation(p, 'aUV');
    gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aUV); gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 24, 16);
    gl.bindVertexArray(null);
    r.tex = gl.createTexture(); r.tex2 = gl.createTexture();   // tex2 = 섞어 바꾸는 동안의 앞 그림(미리보기 교체 페이드)
    r.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    r.maxAniso = r.aniso ? Math.max(1, Math.min(16, +gl.getParameter(r.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1)) : 1;
    r.maxTex = +gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    r.has = false; r.has2 = false; r.w = r.h = 0; r.checked = false;
    return true;
  } catch (e) { return false; }
}
const tglOk = (r) => !!(r && !r.lost && r.prog && !r.gl.isContextLost());
// 그림 올리기(+밉맵). src = 캔버스·이미지(w×h). 실패하면 false(부르는 쪽이 예전 경로로)
// keepPrev: 지금 그림을 tex2로 남겨 둔다(tglDraw의 v.prev로 짧게 섞어 바꾸기 — 끝나면 tglDropPrev)
function tglUpload(r, src, w, h, keepPrev) {
  if (!tglOk(r) || !(w > 0 && h > 0) || w > r.maxTex || h > r.maxTex) return false;
  const gl = r.gl;
  if (keepPrev && r.has) { const t = r.tex; r.tex = r.tex2; r.tex2 = t; r.has2 = true; }
  try {
    gl.bindTexture(gl.TEXTURE_2D, r.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (r.aniso) gl.texParameterf(gl.TEXTURE_2D, r.aniso.TEXTURE_MAX_ANISOTROPY_EXT, r.maxAniso);
    // 처음 한 번만 오류 확인(getError는 GPU를 기다리게 해서 매번 부르지 않는다)
    if (!r.checked) { r.checked = true; if (gl.getError() !== gl.NO_ERROR) { r.has = false; return false; } }
  } catch (e) { r.has = false; return false; }
  r.w = w; r.h = h; r.has = true;
  return true;
}
// 텍스처 메모리 반납(추출은 프레임마다 새로 올리므로 끝나면 바로 비운다)
function tglFree(r) {
  if (!tglOk(r)) return;
  const gl = r.gl;
  gl.bindTexture(gl.TEXTURE_2D, r.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  r.has = false; r.w = r.h = 0;
}
function tglDropPrev(r) {
  if (!r || !r.has2) return;
  r.has2 = false;
  if (!tglOk(r)) return;
  r.gl.bindTexture(r.gl.TEXTURE_2D, r.tex2);
  r.gl.texImage2D(r.gl.TEXTURE_2D, 0, r.gl.RGBA, 1, 1, 0, r.gl.RGBA, r.gl.UNSIGNED_BYTE, null);
}
// 블리드 그림(프레임 중앙 기준, 가로·세로 (1+2·CAM_BLEED)배)의 네 모서리를 원근 투영한 클립 좌표(x, y, 0, w)와 UV.
// v = { rx, ry, rz(도), persp, k: { r, tx, ty } | null } — k는 그림을 구운 카메라와 지금 카메라 차이(지도 평면에서 r배·이동, 뷰박스 단위)
// warpTilt3D·_camProjectRaw와 같은 식: Rz → Ry → Rx, f = P / (P − z). 클립 w = (P − z) / P 로 두면 GPU가 원근 보정까지 한다.
function tglQuad(v) {
  const D = Math.PI / 180, B = CAM_BLEED;
  const rx = (+v.rx || 0) * D, ry = (+v.ry || 0) * D, rz = (+v.rz || 0) * D;
  const P = (v.persp == null ? 2.2 : +v.persp) * 1920;
  const cxr = Math.cos(rx), sxr = Math.sin(rx), cyr = Math.cos(ry), syr = Math.sin(ry), czr = Math.cos(rz), szr = Math.sin(rz);
  const k = v.k || { r: 1, tx: 0, ty: 0 };
  const hw = 960 * (1 + 2 * B), hh = 540 * (1 + 2 * B);
  const out = new Float32Array(24);
  [[-hw, -hh, 0, 0], [hw, -hh, 1, 0], [-hw, hh, 0, 1], [hw, hh, 1, 1]].forEach(([X0, Y0, u, t], i) => {
    const X = k.r * X0 + k.tx, Y = k.r * Y0 + k.ty;
    const x = X * czr - Y * szr, y = X * szr + Y * czr;     // Rz(방위)
    const x2 = x * cyr, z2 = -x * syr;                       // Ry
    const y3 = y * cxr - z2 * sxr, z3 = y * sxr + z2 * cxr;  // Rx(기울임)
    out.set([x2 / 960, -y3 / 540, 0, (P - z3) / P, u, t], i * 6);
  });
  return out;
}
// W×H 그리기 버퍼에 지금 텍스처를 투영해 그린다(바탕은 투명). v.prev = { k }면 앞 그림(tex2)을 깔고 지금 그림을 v.a(0..1)만큼 덮는다(섞어 바꾸기)
function tglDraw(r, W, H, v) {
  if (!tglOk(r)) return false;
  const gl = r.gl, cv = r.cv;
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  gl.viewport(0, 0, W, H);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  if (!r.has) return true;
  gl.useProgram(r.prog);
  gl.bindVertexArray(r.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, r.buf);
  gl.activeTexture(gl.TEXTURE0); gl.uniform1i(r.uT, 0); gl.uniform1f(r.uF, CAM_EDGE_FADE / 100);
  if (v.prev && r.has2) {   // 앞 그림(그 그림의 카메라 보정으로) → 그 위에 지금 그림을 premultiplied 'over'로 a만큼
    gl.bufferData(gl.ARRAY_BUFFER, tglQuad(Object.assign({}, v, { k: v.prev.k })), gl.DYNAMIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, r.tex2); gl.uniform1f(r.uA, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  gl.bufferData(gl.ARRAY_BUFFER, tglQuad(v), gl.DYNAMIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D, r.tex); gl.uniform1f(r.uA, v.a == null ? 1 : Math.max(0, Math.min(1, +v.a)));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
  return true;
}
// 추출(영상 프레임·이미지 추출): 블리드 지도 그림 img를 지금 S.map3d로 기울여 cx(W×H)에 얹는다. 못 하면 false(→ 2D 메시).
// 미리보기와 같은 셰이더·밉맵이라 미리보기 = 추출. 화면 밖 캔버스 하나를 계속 쓴다.
// SVG 그림은 2D 캔버스(GPU)에 한 번 그린 뒤 올린다(SVG 이미지를 바로 texImage2D 하면 CPU로 다시 그려 프레임당 100ms쯤 더 든다).
// 영상 추출은 프레임마다 같은 크기라 텍스처·중간 캔버스를 이어 쓰고, 마지막 사용 1.5초 뒤 비운다.
let _tglExp = null, _tglExpFreeT = 0;   // null = 아직, false = 못 씀
function tglWarp(cx, img, W, H) {
  if (_tglExp === false) return false;
  if (_tglExp && _tglExp.lost) return false;
  if (!_tglExp) { _tglExp = tglCreate(document.createElement('canvas')) || false; if (!_tglExp) return false; }
  const r = _tglExp, m = S.map3d || {};
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  let ok = false;
  try {
    let src = img;
    if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
      const sc = r.scratch || (r.scratch = document.createElement('canvas'));
      if (sc.width !== iw || sc.height !== ih) { sc.width = iw; sc.height = ih; } else sc.getContext('2d').clearRect(0, 0, iw, ih);
      sc.getContext('2d').drawImage(img, 0, 0, iw, ih); src = sc;
    }
    ok = tglUpload(r, src, iw, ih) && tglDraw(r, W, H, { rx: m.rx, ry: m.ry, rz: m.rz, persp: m.persp });
    if (ok) cx.drawImage(r.cv, 0, 0, W, H);   // 같은 작업 안에서 바로 옮긴다(preserveDrawingBuffer 없이도 그대로)
  } catch (e) { ok = false; }
  clearTimeout(_tglExpFreeT);
  _tglExpFreeT = setTimeout(() => { tglFree(r); if (r.scratch) { r.scratch.width = r.scratch.height = 1; } }, 1500);
  return ok;
}
