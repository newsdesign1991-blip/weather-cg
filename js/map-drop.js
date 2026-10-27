/* [모듈] js/map-drop.js — 불러와 칠할 때 작업창 물결(아이폰 NameDrop — Graph CG fx-namedrop.js 셰이더 그대로): mapDropShot·mapDropGo·mapDrop */
'use strict';

/* ── 불러와 칠할 때 — 아이폰 NameDrop(AirDrop) 물결 (2026-10-27 사용자: 'Graph CG 에서 HWP 넣을 때와 같은 네임드롭 효과로 칠해졌음') ──
   셰이더는 Graph CG(Yoelon/svgcg/web/fx-namedrop.js)를 그대로 옮김 — 그쪽 머리 주석:
   참고: Daniel Kuntz 'AirDrop iOS 17 Swift.Shader Animation' (gist dkun7944/2f793643e469029fb4e7d700f0645ffc, airdrop.metal) 의 식을 WebGL2 로 옮김.
   원본의 '탕'(t ≥ 1) 뒤만: 위 가운데(닿는 곳)에서 밝은 물결 고리 두 겹이 퍼지며 화면을 굴절·흐리게 하고, 고리가 지나간 안쪽부터 새 화면.
   원본의 0.75배 속도(≈1초), 600번 표본 흐림 대신 밉맵 흐림(저사양 PC 용), 가로 화면 비율 환산. 고리 빛 = 앱 파랑(근무표·Graph CG 와 같은 셈).
   여기서 쓰는 길(Graph CG hwpSwitchScreen 의 reveal 과 같음): 칠하기 직전 작업창 자리를 찍어(데스크톱 wcgDesktop.capture — desktop/main.js 'wcg:capture')
   그 자리에 덮개로 깔고 → 칠하기(덮개 뒤에서 — 같은 작업 안이라 새 지도가 덮개 없이 보이는 프레임 없음) → 고리가 지나간 안쪽을 뚫어 실제 새 지도를 보임.
   덮개는 작업창(아트보드) 자리만 — 플로팅 바(z 10)·팝오버는 그 위에 그대로. 웹판·옛 데스크톱·움직임 줄이기·영상 재생·렌더 중엔 효과 없이 칠만 */
const MD_VS = `#version 300 es
in vec2 p; out vec2 vUv; void main() { vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
const MD_FS = `#version 300 es
precision highp float;
uniform sampler2D uOld, uNew; uniform float uT; uniform vec2 uSize; uniform float uTexH; uniform float uTaps; uniform float uBgra; uniform float uReveal; uniform vec3 uGlow; uniform float uGlowA; uniform vec2 uO, uN; uniform float uGlowK; uniform float uFade;
in vec2 vUv; out vec4 outColor;
vec4 tx(sampler2D s, vec2 uv, float lod) { vec4 c = textureLod(s, clamp(uv, 0., 1.), lod); return uBgra > .5 ? c.bgra : c; }
vec4 blurS(sampler2D s, vec2 uv, float r) {   // 반지름 r(화면 높이 비율) 원판 평균 ≈ 밉맵 한 단계 + 둘레 몇 점
  float px = r * uTexH, lod = log2(max(1., px * 1.2));
  vec4 c = tx(s, uv, lod);
  if (uTaps > .5 && px > 1.5) {
    vec2 rr = vec2(r * uSize.y / uSize.x, r) * .55;
    for (int k = 0; k < 6; k++) { float a = float(k) * 1.0471976; c += tx(s, uv + vec2(cos(a), sin(a)) * rr, lod); }
    c /= 7.;
  }
  return c;
}
void main() {
  // 닿는 곳 = uO(uv — 누른 버튼 쪽 가장자리 안, 10-27 사용자 '버튼이 있는 방향에서'). 원본은 위 가운데 고정(uv (.5, .96) = dio .46)
  // 고리 옅어짐: 원본 (uv.y + .05) = 닿는 가장자리에서 안쪽으로 갈수록 → 안쪽 방향 uN 으로 잰 거리로 일반화
  float aT = uT;   // 원본 t − 1 ('탕' 뒤 초)
  vec2 uv = vUv, u2 = uv - .5; float asp = uSize.x / uSize.y; u2.x *= asp;
  vec2 dv = u2 - (uO - .5) * vec2(asp, 1.);
  float L = length(dv), fall = 1.05 - clamp(dot(uv - uO, uN), 0., 1.);
  float bd = (aT * .16) / L; bd = smoothstep(.09, .05, bd) * smoothstep(.04, .07, bd) * fall;
  float bd2 = ((aT - .085) * .14) / L; bd2 = smoothstep(.09, .05, bd2) * smoothstep(.04, .07, bd2) * fall;
  // 굴절: 원본 (-8·bd·x, -4·bd·(y−.4))·.1 — 닿는 곳 기준 방향으로(x 는 폰 가로/세로 기준을 이 화면 비율로 환산)
  vec2 bo = vec2(-.37 * dv.x / asp, -.4 * dv.y) * (bd - .2 * bd2);
  float front = aT * .16 / .06;   // 고리 한가운데(bd 원값 .06 자리)
  float mixNew = smoothstep(front + .04, front - .06, L);   // 고리가 지나간 안쪽 = 새 화면
  vec2 sb = uv + bo;
  float R = bd * .05;
  float g = bd * (500. / 600.) * smoothstep(.05, .1, aT);   // 원본: bang_d*500 을 600 표본 평균에 더함 → 밝은 고리
  if (uReveal > .5) {   // 새 화면은 그림이 아니라 실제 화면 — 고리가 지나간 안쪽을 뚫고(미리 곱한 알파) 빛 고리는 그 위에
    vec4 o = blurS(uOld, sb, R); float m = mixNew * step(.0001, aT), w = clamp(g * uGlowK, 0., 1.) * uGlowA;
    outColor = vec4(mix(o.rgb, uGlow, w) * (1. - m) + uGlow * w * m, (1. - m) + w * m) * uFade;   // uFade: 끝에서 남은 빛·덮개를 스르륵(미리 곱한 알파라 통째로)
    return;
  }
  vec4 col = mix(blurS(uOld, sb, R), blurS(uNew, sb, R), mixNew);
  col.rgb = mix(col.rgb, uGlow, clamp(g * uGlowK, 0., 1.) * uGlowA);
  outColor = vec4(col.rgb, 1.);
}`;
const MD_END = 0.75;   // 원본 t 0.75 면 고리가 화면 구석까지 다 지나감(위 가운데 기준). 다른 곳에서 닿으면 먼 구석까지 지나가게 늘림(mdEndFor)
// 닿는 곳 uO 에서 가장 먼 구석까지 고리 안쪽(front − .06)이 다 지나가는 t — 원본 0.75 보다 짧으면 0.75
function mdEndFor(o, asp) {
  let far = 0;
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) far = Math.max(far, Math.hypot((x - o[0]) * asp, y - o[1]));
  return Math.max(MD_END, (far + 0.08) * 0.06 / 0.16);
}
// 닿는 곳(uv, y 위쪽 = 1)과 안쪽 방향 — 누른 버튼(el)의 가운데를 덮개 사각형 r(화면 CSS 픽셀)에 가두어 가장 가까운 가장자리 안쪽 4%(원본 위 가운데 .96 과 같은 깊이).
// 버튼이 없거나 안 보이면 사이드바 쪽 가운데
function mdOrigin(el, r) {
  let b = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  if (!b || !b.width) { const p = $('#panel'); b = p && p.getBoundingClientRect(); }
  if (!b || !b.width) return { o: [0.5, 0.96], n: [0, -1] };
  const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
  const ux = Math.min(1, Math.max(0, (cx - r.x) / r.w)), uy = Math.min(1, Math.max(0, 1 - (cy - r.y) / r.h));
  const edges = [[ux, [1, 0]], [1 - ux, [-1, 0]], [uy, [0, 1]], [1 - uy, [0, -1]]].sort((a, c) => a[0] - c[0]);
  const k = (v) => Math.min(0.96, Math.max(0.04, v));
  return { o: [k(ux), k(uy)], n: edges[0][1], px: [cx, cy] };
}
// 고리 빛 = 앱 강조 파랑(--primary) 그대로. Graph CG themeGlow(밝은 화면 옅은 파랑·.8 / 어두운 화면 파랑·.45)를 그대로 쓰면 남색 날씨 지도 위에선 파랑이 묻혀
// 흐린 흰빛만 보임(10-27 사용자 '흰색 버전 같다, 파란색으로 약간 칠한 거로') → 테마와 상관없이(지도는 늘 어두운 CG) 파랑 그대로·세기 .62, 고리 빛 너비·세기 ×2.6(glowK)
function mdGlow() {
  let hex = '#3182f6';
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    if (v) { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = '#3182f6'; c.fillStyle = v; hex = c.fillStyle; }
  } catch (e) { /* 기본 파랑 */ }
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) || [0, '31', '82', 'f6'];
  const rgb = [m[1], m[2], m[3]].map((x) => parseInt(x, 16));
  return { glow: rgb.map((c) => c / 255), glowA: .62, glowK: 2.6 };
}
// canvas 에 그림(Graph CG NameDrop.create 그대로). src = 캔버스·이미지 또는 { data: BGRA 바이트(화면 캡처), width, height }.
// opts: { lite, reveal } → { setNew, frame(t), play(속도) → Promise, stop() } · WebGL2 가 안 되면 null
function mdCreate(cv, oldSrc, opts) {
  opts = opts || {};
  const sw = oldSrc.width, sh = oldSrc.height;
  cv.width = Math.max(1, Math.round(opts.width || sw)); cv.height = Math.max(1, Math.round(opts.height || sh));
  const gl = cv.getContext('webgl2', { alpha: !!opts.reveal, antialias: false, premultipliedAlpha: !!opts.reveal, preserveDrawingBuffer: false });
  if (!gl) return null;
  const sh_ = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const pr = gl.createProgram();
  try { gl.attachShader(pr, sh_(gl.VERTEX_SHADER, MD_VS)); gl.attachShader(pr, sh_(gl.FRAGMENT_SHADER, MD_FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); }
  catch (e) { console.warn('mapDrop', e); return null; }
  gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = (unit, src) => {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (src.data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, src.width, src.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data instanceof Uint8Array ? src.data : new Uint8Array(src.data));
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const t0 = tex(0, oldSrc);
  if (opts.reveal) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t0); }   // 새 화면 그림은 안 씀 → 같은 그림을 묶어 둠
  else tex(1, oldSrc);
  gl.uniform1f(gl.getUniformLocation(pr, 'uReveal'), opts.reveal ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(pr, 'uOld'), 0); gl.uniform1i(gl.getUniformLocation(pr, 'uNew'), 1);
  gl.uniform2f(gl.getUniformLocation(pr, 'uSize'), cv.width, cv.height); gl.uniform1f(gl.getUniformLocation(pr, 'uTexH'), sh);
  gl.uniform1f(gl.getUniformLocation(pr, 'uTaps'), opts.lite ? 0 : 1); gl.uniform1f(gl.getUniformLocation(pr, 'uBgra'), oldSrc.data ? 1 : 0);   // 화면 캡처는 BGRA 순서
  const g0 = opts.glow ? { glow: opts.glow, glowA: opts.glowA == null ? 1 : opts.glowA, glowK: opts.glowK } : mdGlow();   // 고리 빛 색(0~1)·세기 — 없으면 앱 파랑
  gl.uniform3f(gl.getUniformLocation(pr, 'uGlow'), g0.glow[0], g0.glow[1], g0.glow[2]); gl.uniform1f(gl.getUniformLocation(pr, 'uGlowA'), g0.glowA);
  gl.uniform1f(gl.getUniformLocation(pr, 'uGlowK'), g0.glowK || 1);   // 고리 빛 너비·세기 키움(1 = 원본)
  const og = opts.origin || { o: [0.5, 0.96], n: [0, -1] }, end = mdEndFor(og.o, cv.width / cv.height);
  gl.uniform2f(gl.getUniformLocation(pr, 'uO'), og.o[0], og.o[1]); gl.uniform2f(gl.getUniformLocation(pr, 'uN'), og.n[0], og.n[1]);
  const uT = gl.getUniformLocation(pr, 'uT');
  gl.viewport(0, 0, cv.width, cv.height);
  const uF = gl.getUniformLocation(pr, 'uFade');
  const draw = (t, fade) => { gl.uniform1f(uT, t); gl.uniform1f(uF, fade == null ? 1 : fade); gl.drawArrays(gl.TRIANGLES, 0, 3); };
  draw(0);   // 첫 장면 = 지금 화면 그대로(겹쳐도 티 안 남)
  let raf = 0, stopped = false;
  return {
    setNew(src) { if (!stopped) tex(1, src); },
    frame: draw,
    // 끝을 부드럽게(10-27 사용자 '물결 마지막이 부드럽게 끝나지 못하는 느낌'): 원본은 고리가 같은 빠르기로 가다 덮개가 한 번에 사라짐 →
    //   고리를 끝으로 갈수록 느리게(1 − (1 − p)^1.6 — 처음은 원본의 약 1.3배, 끝은 멈추듯) + 마지막 22% 동안 남은 빛·덮개를 스르륵. 걸리는 시간 = 원본의 1.25배(≈1.25초)
    play(speed) {
      const sp = speed || 0.75, dur = end / sp * 1.25;
      return new Promise((res) => {
        let last = performance.now(), u = 0;
        const step = (now) => {
          if (stopped) return res();
          u += Math.min(0.05, (now - last) / 1000); last = now;
          const p = Math.min(1, u / dur), k = Math.min(1, Math.max(0, (p - 0.78) / 0.22));
          draw(end * (1 - Math.pow(1 - p, 1.6)), 1 - k * k * (3 - 2 * k));
          if (p >= 1) return res();
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      });
    },
    stop() { stopped = true; cancelAnimationFrame(raf); try { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* 이미 끝남 */ } },
  };
}
// 화면이 다 그려질 때까지(프레임이 연달아 need 번 제때 오면) — 최대 maxMs. 칠한 뒤 무거운 그리기가 끝나야 고리가 끊김 없이 퍼진다(Graph CG framesSettle)
function mdSettle(maxMs, need) {
  return new Promise((res) => {
    const t0 = performance.now(); let last = t0, ok = 0, n = 0;
    const step = (now) => { ok = n++ && now - last < 25 ? ok + 1 : 0; last = now; if (ok >= (need || 3) || now - t0 > maxMs) res(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
// 덮개 자리 = 작업창에 보이는 아트보드(틸트 미리보기면 그 그림) ∩ 작업 영역, 창 안 CSS 픽셀(정수)
function mdRect() {
  const stage = $('#stage'); if (!stage) return null;
  const vis = (e) => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const art = ['#camGL', '#camCanvas', '#cg'].map((s) => $(s)).find(vis); if (!art) return null;
  const a = art.getBoundingClientRect(), b = stage.getBoundingClientRect();
  const x = Math.ceil(Math.max(a.left, b.left, 0)), y = Math.ceil(Math.max(a.top, b.top, 0));
  const r = Math.floor(Math.min(a.right, b.right, innerWidth)), btm = Math.floor(Math.min(a.bottom, b.bottom, innerHeight));
  return r - x >= 32 && btm - y >= 32 ? { x, y, w: r - x, h: btm - y } : null;
}
const mdRectKey = (r) => r ? [r.x, r.y, r.w, r.h].join(',') : '';
let _mdShooting = false, _mdCur = null;
// 칠하기 직전에 부른다 — 지금 작업창 그림(없으면 null: 웹판·옛 데스크톱·움직임 줄이기·재생·렌더 중·작업창 안 보임·찍는 중).
// from = 누른 버튼(요소·선택자) — 물결이 그 쪽 가장자리에서 시작하고 에디터는 반대쪽으로 살짝 튕긴다
async function mapDropShot(from) {
  const d = window.wcgDesktop;
  if (!d || typeof d.capture !== 'function' || _mdShooting || fxReduced() || animPlaying || _exportingFrames || document.hidden) return null;
  const r = mdRect(); if (!r) return null;
  _mdShooting = true;
  try {
    const s = await d.capture({ x: r.x, y: r.y, width: r.w, height: r.h });
    if (!s || !s.data || !(s.w > 0) || !(s.h > 0)) return null;
    return { data: s.data, width: s.w, height: s.h, key: mdRectKey(r), rev: _workRev, from: typeof from === 'string' ? $(from) : from || null };
  } catch (e) { return null; } finally { _mdShooting = false; }
}
// 에디터 튕김(10-27 사용자 '왼쪽에서 칠해질 때 그 영향으로 에디터를 오른쪽으로 살짝 튕겼다가 복귀') — 닿는 곳 → 작업창 가운데 방향으로 7px 밀렸다가
// 반대로 조금 넘친 뒤 제자리(스프링). 고리가 퍼지기 시작하는 순간에. 작업 영역(#stage) 통째로 — 덮개 캔버스도 그 안이라 같이 움직인다
function mdBounce(stage, og, r) {
  if (!stage || !stage.animate || !og.px) return;
  let vx = r.x + r.w / 2 - og.px[0], vy = r.y + r.h / 2 - og.px[1];
  const len = Math.hypot(vx, vy); if (len < 1) return;
  vx = vx / len * 7; vy = vy / len * 7 * 0.6;   // 세로는 덜(가로로 넓은 작업창)
  const at = (k) => `translate(${(vx * k).toFixed(2)}px, ${(vy * k).toFixed(2)}px)`, ease = 'cubic-bezier(.33, 0, .2, 1)';
  try {
    stage.animate([{ transform: at(0), easing: 'cubic-bezier(.2, .8, .3, 1)' }, { transform: at(1), offset: 0.16, easing: ease }, { transform: at(-0.3), offset: 0.44, easing: ease },
      { transform: at(0.1), offset: 0.7, easing: ease }, { transform: at(0) }], { duration: 640 });
  } catch (e) { /* 튕김 없이 */ }
}
// 칠한 직후, 같은 작업(동기) 안에서 부른다 — 바뀐 게 있고(_workRev) 작업창 자리가 그대로면 찍은 그림을 덮고 물결로 걷는다. 했으면 true
function mapDropGo(shot) {
  if (!shot || shot.rev === _workRev || animPlaying || _exportingFrames) return false;
  const r = mdRect(), stage = $('#stage'); if (!r || !stage || mdRectKey(r) !== shot.key) return false;   // 그새 창·작업창 크기가 바뀌었으면 그림이 안 맞음 → 그냥 칠만
  if (_mdCur) _mdCur.end();
  const sr = stage.getBoundingClientRect();
  const cv = document.createElement('canvas');
  cv.className = 'mapDrop'; cv.setAttribute('aria-hidden', 'true');
  // 작업 영역 안(튕김을 같이 받게) — 아트보드(z 1)·프레임 안내(5) 위, 플로팅 바(10) 아래
  cv.style.cssText = `position:absolute;left:${r.x - sr.left - stage.clientLeft}px;top:${r.y - sr.top - stage.clientTop}px;width:${r.w}px;height:${r.h}px;z-index:6;pointer-events:none;display:block;margin:0`;
  stage.appendChild(cv);
  const og = mdOrigin(shot.from, r);
  let d = null;
  try { d = mdCreate(cv, shot, { reveal: true, origin: og }); } catch (e) { d = null; }
  if (!d) { cv.remove(); return false; }
  const cur = _mdCur = { end() { d.stop(); cv.remove(); if (_mdCur === cur) _mdCur = null; } };
  mdSettle(600, 4).then(() => { if (_mdCur !== cur) return null; mdBounce(stage, og, r); return d.play(); })   // 새 지도를 다 그린 뒤 고리 시작(멈칫 없게) + 튕김
    .then(() => cur.end(), () => cur.end());
  return true;
}
// 동기 칠하기(붙여넣기 [적용]·통보문 [칠하기]) 감싸기 — 찍고 → fn() → 바뀌었으면 물결. from = 누른 버튼. fn 의 반환값 그대로
async function mapDrop(fn, from) {
  const shot = await mapDropShot(from);
  const r = fn();
  mapDropGo(shot);
  return r;
}
