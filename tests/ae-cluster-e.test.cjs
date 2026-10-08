// 묶음 E(앱 쪽) — MXF/MOV 29.97 기준 n프레임, AE 출력 해상도 배율(터치), 태풍 리깅 새 스펙(라인모드·선굵기·noIcon·과거아이콘 30%),
// 지시선 라벨 별도 레이어, 비교 작은 원 크기, AE 컴프 길이(= 타임라인 길이), AE 타이밍 = 타임라인(트랙 없으면 자동 구성 타이밍), fontsOk 안내, HELPER_VER_MIN.
// 실제 앱 스펙 검사(부팅 점검기 + fetch 가로채기)는 WCG_BOOT_CHECK=1 일 때만 돈다(일렉트론 필요·느림).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = require('../tools/app-source.cjs');   // js/·css/로 나뉜 앱을 '한 파일' 텍스트로 합쳐 읽는다(MODULES.md)
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const html = appSource(path.join(root, 'index.html'));
const RF = 30000 / 1001;

function sliceBetween(startText, endText, from = 0) {
  const start = html.indexOf(startText, from);
  assert.notEqual(start, -1, `missing start marker: ${startText}`);
  const end = html.indexOf(endText, start + startText.length);
  assert.notEqual(end, -1, `missing end marker: ${endText}`);
  return html.slice(start, end);
}
// 최상위 함수 하나(시작 줄 ~ 첫 '\n}' ) 소스
function fnSource(sig) {
  const start = html.indexOf(sig);
  assert.notEqual(start, -1, `missing function: ${sig}`);
  const end = html.indexOf('\n}', start);
  return html.slice(start, end + 2);
}
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('인라인 스크립트가 전부 문법 오류 없이 컴파일된다', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 3);
  for (const code of blocks) assert.doesNotThrow(() => new vm.Script(code));
});

test('HELPER_VER_MIN은 새 헬퍼(20261008) 기준 — AE 확장(AE_EXT_VER)도 같은 판', () => {
  assert.match(html, /const HELPER_VER_MIN = 20261008;/);
  assert.match(html, /const AE_EXT_VER = 20261008;/);
});

// ── C14: aeOutK / aePt / aeSz ──
function aeScaleCtx(res, vf) {
  const ctx = {
    S: { res },
    RES: { '2158x1214': { size: [2158, 1214] }, '1920x1080': { size: [1920, 1080] }, '1920x1080-vf': { size: [1920, 1080] } },
    _vfPanelRect: vf ? { x: 1100, y: 100, w: 700, h: 800 } : null,
    vfScaleValue: () => (vf ? 80 : 100),
  };
  vm.runInNewContext([fnSource('function vfScaledPoint('), fnSource('function vfScaledSize('), fnSource('function aeOutK('),
    html.match(/function aePt\([^\n]*/)[0], html.match(/function aeSz\([^\n]*/)[0]].join('\n') + '\nthis.aePt = aePt; this.aeSz = aeSz; this.vfScaledPoint = vfScaledPoint;', ctx);
  return ctx;
}

test('터치 해상도(2158×1214)에서 AE 좌표·크기는 출력 해상도 배율을 곱한다', () => {
  const c = aeScaleCtx('2158x1214');
  const p = c.aePt(128, 300);
  close(p.x, 128 * 2158 / 1920); close(p.y, 300 * 1214 / 1080);
  close(c.aeSz(66), 66 * (2158 / 1920 + 1214 / 1080) / 2);
});

test('노말·VF는 배율 1 — 기존 vfScaledPoint/vfScaledSize 그대로', () => {
  const n = aeScaleCtx('1920x1080');
  const np = n.aePt(128, 300);
  assert.equal(np.x, 128); assert.equal(np.y, 300);
  assert.equal(n.aeSz(66), 66);
  const v = aeScaleCtx('1920x1080-vf', true);
  const vp = v.vfScaledPoint(500, 600), ap = v.aePt(500, 600);
  close(ap.x, vp.x); close(ap.y, vp.y);
  close(v.aeSz(50), 40);
});

test('일반 지도 AE 제목·라벨·범례·라벨 PNG가 aePt/aeSz(출력 해상도)를 쓴다', () => {
  const send = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  assert.match(send, /const p = aePt\(t\.x, t\.y\)/);
  assert.match(send, /size: aeSz\(t\.size\)/);
  assert.match(send, /track: aeSz\(t\.track \|\| 0\)/);
  assert.match(send, /const p = aePt\(ld\.cx, ld\.cy\)/);
  assert.match(send, /w: aeSz\(ld\.w\), h: aeSz\(ld\.h\)/);
  assert.match(send, /size: aeSz\(t\.size\), track: aeSz\(t\.track\), cx: aeSz\(t\.cx\), cy: aeSz\(t\.cy\)/);
  assert.match(send, /rise: aeSz\(26\)/);
  assert.doesNotMatch(send, /vfScaledPoint|vfScaledSize/, 'sendToAE는 배율 헬퍼(aePt/aeSz)만 쓴다');
  const bgBlob = fnSource('async function aeLabelBgBlob(');
  assert.match(bgBlob, /Math\.round\(aeSz\(box\.w\)\)/);
  assert.match(bgBlob, /Math\.round\(aeSz\(box\.h\)\)/);
  const legend = fnSource('function aeLegendCompData(');
  assert.match(legend, /const k = aeSz\(1\)/);
  assert.match(legend, /const center = aePt\(/);
});

test('출력 배율 kx/ky/kk는 sendToAE 한 곳에서만 정의(단일 태풍 리그 중복 곱 없음)', () => {
  const send = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  assert.equal((send.match(/const kx = W \/ 1920, ky = H \/ 1080;/g) || []).length, 1);
  assert.equal((send.match(/const SX = \(v\) =>/g) || []).length, 1);
  // 리그 좌표·크기는 노말 VF면 패널 축소 공간으로(aePt와 같은 변환 — F7), 그 밖은 출력 배율만
  assert.equal((send.match(/kk = \(kx \+ ky\) \/ 2 \* vk;/g) || []).length, 1);
  assert.match(send, /const SX = \(v\) => \+\(\(vax \+ \(v - vax\) \* vk\) \* kx\)\.toFixed\(1\)/);
});

// ── C13/C60/C70/C71/C59: 단일 태풍 리그 새 필드 ──
test('단일 태풍 리그가 라인모드·선 굵기/색·과거아이콘 30%·noIcon을 보낸다', () => {
  const send = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  const ty = send.slice(send.indexOf('// 단일 태풍: 리깅'), send.indexOf("name: '태풍 리깅'"));
  assert.match(ty, /const lineMode = T\.trackMode === 'line'/);
  assert.match(ty, /if \(lineMode\) sp = sp\.filter\(\(p\) => p\.idx <= nowIdx\)/);
  assert.match(ty, /const trackW = Math\.max\(1, \+T\.lineWidth \|\| 9\.5\)/);
  assert.match(ty, /if \(!lineMode\) for \(const k of \['r70', 'r15', 'r25'\]\)/);
  assert.match(ty, /if \(!lineMode\) for \(const b of labelList\(\)\)/);
  assert.match(ty, /noIcon: tip \? false : !!p\.noIcon/);
  assert.match(ty, /ws: \(pts\[p\.idx\] && pts\[p\.idx\]\.ws\) \|\| 99/);
  assert.match(ty, /trackMode: lineMode \? 'line' : 'full'/);
  assert.match(ty, /const lineCol = T\.lineColor \|\| iconCol/);
  assert.match(ty, /lineWidth: \+\(trackW \* kk\)\.toFixed\(2\)/);
  assert.match(ty, /pastLineWidth: \+\(Math\.max\(1\.5, trackW \* 0\.55\) \* kk\)\.toFixed\(2\)/);
  assert.match(ty, /pastIconK: 0\.3/);
  // 화면 라인모드 선두 아이콘도 r=17 → iconScreenH(17×배율×2.5×kk) 그대로
  assert.match(ty, /const iconScreenH = 17 \* \(T\.iconScale == null \? 1 : T\.iconScale\) \* 2\.5 \* kk/);
  assert.match(html, /add\(typhoonIconEl\(tip\.x, tip\.y, 17, iconCol/);
  // 화면 drawTyphoonTrack 값과 같은 식
  assert.match(html, /const pastTrackW = Math\.max\(1\.5, trackW \* 0\.55\)/);
  assert.match(html, /past \? baseR \* 0\.3 : baseR/);
});

// ── C58: 비교 리그 출력 해상도 배율 ──
test('비교 리그 좌표·크기에 kx/ky/kk를 곱한다(track 비율은 그대로)', () => {
  const send = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  const cmp = send.slice(send.indexOf('if (isTyphoonCompare())'), send.indexOf("name: '태풍 비교 리깅'"));
  assert.match(cmp, /x: SX\(\+pos\.x\), y: SY\(\+pos\.y\), size: \(c\.labelSize \|\| 34\) \* kk/);
  assert.match(cmp, /px: SX\(pt\.x\), py: SY\(pt\.y\)/);
  assert.match(cmp, /bx: SX\(bxv\), by: SY\(byv\), bw: \(lb\._w \|\| est\) \* kk, bh: \(lb\._h \|\| \(size \+ 34\)\) \* kk/);
  assert.match(cmp, /size: Math\.round\(size \* labK\(\) \* kk\)/);
  assert.match(cmp, /track: Math\.round\(\(\(ls\.track == null \? -1 : ls\.track\) \/ \(c\.numSize \|\| ls\.size \|\| 40\)\) \* 1000\)/);
  assert.match(cmp, /strokeW: \(ls\.strokeW \|\| 0\) \* labK\(\) \* kk, radius: \(ls\.radius \|\| 14\) \* labK\(\) \* kk/);
  assert.match(cmp, /lineW: \(c\.lineW \|\| 2\.2\) \* kk/);
  assert.match(cmp, /iconScreenH: 15 \* \(c\.iconScale == null \? 1 : c\.iconScale\) \* kk/);
  assert.match(cmp, /points: sp\.map\(\(p\) => \(\{ x: SX\(p\.x\), y: SY\(p\.y\) \}\)\)/);
  assert.match(cmp, /aeIconBlob\(c\.color, false, false, !!c\.dotIcon, false, true\)/);
});

// ── C57: 작은 원 아이콘 크기 — aeIconBlob을 가짜 캔버스로 실제 실행 ──
async function runIconBlob(args, iconMode) {
  let svgSrc = '';
  const ctx = {
    S: { typhoon: { iconMode } }, window: { TYPHOON_ICON: { img: 'data:image/png;base64,AA', w: 100, h: 100 } },
    Image: class { set src(v) { svgSrc = decodeURIComponent(v.slice(v.indexOf(',') + 1)); } get src() { return ''; } async decode() {} },
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: (cb) => cb('blob') }) },
    iconTintValues: () => '1 0 0 0 0',
  };
  vm.runInNewContext(fnSource('async function aeIconBlob(') + '\nthis.aeIconBlob = aeIconBlob;', ctx);
  const r = await ctx.aeIconBlob(...args);
  const m = /<circle[^>]*\br="([\d.]+)"[^>]*stroke-width="([\d.]+)"/.exec(svgSrc);
  return { r, rr: m && +m[1], sw: m && +m[2], svg: svgSrc };
}

test('비교 작은 원: AE 원 반지름·링 굵기 = 화면 compareIconEl(r×1.05, 링 0.34)', async () => {
  for (const iconScale of [1, 1.6]) {
    const { r, rr, sw } = await runIconBlob(['#FF5A5A', false, false, true, false, true], 'image');
    const iconScreenH = 15 * iconScale;              // sendToAE가 보내는 값(kk=1)
    const k = iconScreenH / r.iconH;                 // 헬퍼 배율(iconScreenH/iconRenderH)
    const scrR = 6 * iconScale * 1.05;               // 화면 compareIconEl 비머리 원
    close(rr * k, scrR, 1e-9);
    close(sw * k, scrR * 0.34, 1e-9);
  }
});

test('비교선은 c.dotIcon이 아니면 단일 태풍 iconMode가 dot이어도 원으로 바꾸지 않는다', async () => {
  const { svg, r } = await runIconBlob(['#FF5A5A', false, false, false, false, true], 'dot');
  assert.doesNotMatch(svg, /<circle/);
  assert.match(svg, /<image /);
  assert.equal(r.iconH, 90 * 2.5);
});

test('단일 태풍 iconMode dot: AE 원 = 화면 typhoonIconEl(r=17×배율, 원 r×0.62, 링 0.32)', async () => {
  const { r, rr, sw } = await runIconBlob(['#E5231E', false, false], 'dot');
  const iconScale = 1.75, iconScreenH = 17 * iconScale * 2.5;
  const k = iconScreenH / r.iconH, scrR = 17 * iconScale * 0.62;
  close(rr * k, scrR, 1e-9);
  close(sw * k, scrR * 0.32, 1e-9);
  assert.match(html, /const rr = r \* 0\.62;\s*\n\s*g\.appendChild\(_te\('circle', \{ r: rr, fill: past \? '#9AA3AD' : color, stroke: past \? '#C8D0DA' : '#FFFFFF', 'stroke-width': Math\.max\(1\.6, rr \* 0\.32\)/);
  assert.match(html, /if \(dot\) \{ const rr = r \* 1\.05; g\.appendChild\(_te\('circle', \{ r: rr, fill: color, stroke: '#FFFFFF', 'stroke-width': Math\.max\(1\.4, rr \* 0\.34\) \}\)\); \}/);
});

// ── C56: 지시선 라벨 ──
test('AE 배경엔 라벨 지시선·앵커가 없고, 지시선은 라벨별 레이어로 같은 페이드', () => {
  const base = fnSource('async function aeBaseBlob(');
  assert.match(base, /querySelectorAll\('#L_labels > \*'\)\.forEach\(\(n\) => n\.remove\(\)\)/);
  const leader = fnSource('async function aeLeaderBlob(');
  assert.match(leader, /keepLayers\(c, \['L_labels'\]\)/);
  assert.match(leader, /querySelectorAll\('#L_labels > \*'\)\.forEach\(\(n\) => \{ if \(aeLeaderOwner\(n\) !== id\) n\.remove\(\); \}\)/);
  const bg = fnSource('async function aeLabelBgBlob(');
  assert.match(bg, /#L_labels > \[data-fleader-id\], #L_labels > \[data-fanchor-id\]'\)\.forEach\(\(n\) => n\.remove\(\)\)/);
  assert.match(fnSource('function aeLabelCompData('), /const leader = leaderIds\.has\(id\)/);
  const send = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  const lab = send.slice(send.indexOf("if (L.kind === 'label')"), send.indexOf('// 컴프 길이'));
  const ldr = lab.indexOf("if (ld.leader) addImg('지시선_' + li, await aeLeaderBlob(ld.id), fade, lsp ? { legacy: 1 } : null)");
  const comp = lab.indexOf("name: '라벨_' + li, fade: fade ? Object.assign({}, fade, { rise: aeSz(26) }) : null");
  assert.ok(ldr >= 0 && comp > ldr, '지시선 레이어는 그 라벨 프리컴프 바로 아래, 같은 start/len(라벨 막대 타이밍)');
  // 헬퍼가 이미 받는 레이어 형식(file+fade)만 쓴다
  assert.match(send, /const addImg = \(name, blob, fade, extra\) => \{[^\n]*specLayers\.push\(Object\.assign\(\{ file: /);
});

// ── C100: 컴프 길이 — sendToAE의 계산 블록을 그대로 돌린다 ──
function compDur(specLayers, opt = {}) {
  const block = sliceBetween('    // 컴프 길이', '    const sid = ');
  const fn = new Function('durBase', 'specLayers', 'S', 'ANIM_START', 'ANIM_VF_ENTER_LEN', 'gCam', `${block}\nreturn dur;`);
  return fn(opt.dur ?? 6, specLayers, { res: opt.res || '1920x1080' }, 1.0, 1.2, opt.cam || null);
}
test('AE 컴프 길이 = 타임라인 길이(화면 = AE), 넘친 내용(리빌·라벨 키·비교 리빌·카메라 키)만 잘리지 않게', () => {
  assert.equal(compDur([], { dur: 6 }), 6);                               // 타임라인 6초 = 컴프 6초(A.dur에 여유 두 번 안 더함, MXF와 같은 길이)
  assert.equal(compDur([], { dur: 7.5 }), 7.5);                           // 타임라인 7.5초 그대로
  assert.equal(compDur([{ fade: { start: 1, len: 1 } }], { dur: 6 }), 6);  // 내용이 타임라인 안이면 타임라인 길이
  assert.equal(compDur([], { dur: 2 }), 2);                               // 타임라인 2초 = 컴프 2초(예전 '최소 6초'는 없앰 — MP4·MXF와 같은 길이)
  assert.equal(compDur([{ fade: { start: 8, len: 1 } }], { dur: 2 }), 10);
  const rig = (labels) => ({ typhoonRig: { reveal: { start: 1, path: 8, labelLen: 1 }, labels } });
  assert.equal(compDur([rig([])], { dur: 2 }), 10);                        // 1+8=9 → 10
  assert.equal(compDur([rig([{ revStart: 9.5, revLen: 1.5 }])], { dur: 2 }), 12);   // 11 → 12
  assert.equal(compDur([rig([{ revStart: 9.5, revLen: null }])], { dur: 2 }), 11.5); // 9.5+1(labelLen)=10.5 → ceil(11.1×2)/2
  assert.equal(compDur([rig([{ revStart: null, revLen: null }])], { dur: 2 }), 11); // 1+8+1=10 → 11
  assert.equal(compDur([{ compareRig: { reveal: { start: 4, path: 4, labelLen: 1 } } }], { dur: 2 }), 10);
  assert.equal(compDur([rig([{ revStart: 9.5, revLen: 1.5 }])], { dur: 6 }), 12);   // 타임라인보다 긴 리빌은 내용 끝+여유
  assert.equal(compDur([], { dur: 2, res: '1920x1080-vf' }), 3);          // VF 진입(1+1.2=2.2)이 넘치면 그 끝+여유
  assert.equal(compDur([], { dur: 6, res: '1920x1080-vf' }), 6);
  assert.equal(compDur([{ typhoonRig: { reveal: { start: 1, path: 2, labelLen: 1 }, labels: [], camera: { keys: [{ t: 0.4 }, { t: 7.2 }] } } }], { dur: 6 }), 8);   // 길이 밖 카메라 키도 안 잘림
  assert.equal(compDur([{ compareRig: { reveal: { start: 1, path: 1, labelLen: 0.2 }, typhoons: [{ prog: { start: 2, end: 7.4 } }, {}] } }], { dur: 6 }), 8);   // 예보마다 진행 곡선 끝
  assert.equal(compDur([{ compareRig: { reveal: { start: 1, path: 1, labelLen: 0.2 }, typhoons: [], camera: { keys: [{ t: 9 }] } } }], { dur: 6 }), 10);   // 비교 지도 카메라 키
  assert.equal(compDur([], { dur: 6, cam: { keys: [{ t: 0.5 }, { t: 6.9 }] } }), 7.5);   // 일반 지도 카메라 키(spec.camera)
});

// ── C14: 반경 외곽선 굵기도 출력 배율 / C59: 비교 아이콘은 화면처럼 noIcon 무시 ──
test('단일 태풍 반경 strokeW는 kk 배율, 비교 리그 iconAt은 noIcon을 보지 않는다(화면 drawCompareTracks와 같게)', () => {
  const send = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  assert.match(send, /bands\[k\] = \{ fill: st\.fill, fillOp: st\.fillOp, stroke: st\.stroke, strokeW: \(st\.strokeW \|\| 0\) \* kk, dash: st\.dash \? 1 : 0 \}/);
  const cmp = send.slice(send.indexOf('if (isTyphoonCompare())'), send.indexOf("name: '태풍 비교 리깅'"));
  assert.match(cmp, /sp\.forEach\(\(p\) => \{ if \(idxSet\.has\(Math\.round\(p\.idx\)\)\) iconAt\.push\(p\.idx\); \}\)/);
  assert.doesNotMatch(cmp, /p\.noIcon/);
  const tracks = fnSource('function drawCompareTracks(');
  assert.doesNotMatch(tracks, /\.noIcon/, '화면 비교선 아이콘도 noIcon을 안 본다 — 바꾸면 AE iconAt도 같이');
  // 화면 반경 외곽선 = 뷰박스 단위 strokeW, 점선 ×4/×3.5
  assert.match(html, /if \(st\.dash\) a\['stroke-dasharray'\] = \(st\.strokeW \* 4\) \+ ' ' \+ \(st\.strokeW \* 3\.5\)/);
});

// ── C114: fontsOk ──
test('/api/ae 응답 fontsOk===false면 SUITE 폰트 안내(없거나 true면 안내 없음)', () => {
  const send = sliceBetween('async function sendToAE()', '// 폴더를 물어보고');
  assert.match(send, /if \(jr\.fontsOk === false\) status\('[^']*SUITE 폰트를 설치하지 못해 AE에서 기본 폰트로 들어갈 수 있습니다', true\)/);
});

// ── C12/C98: wnsRender — 가짜 헬퍼·캔버스로 실제 실행 ──
async function runWns({ dur, fps, pool }) {
  const times = [], sent = [], progress = [], posted = [], statusMsgs = [];
  const el = () => ({ disabled: false, textContent: '', style: {} });
  const els = { '#wnsMxf': el(), '#wnsMov': el(), '#tlInfo': el() };
  const ctx = {
    anim: () => ({ dur, fps }), hasAnim: () => true, WNS_HELPER: 'http://h', RES: { '1920x1080': { size: [1920, 1080] } }, S: { res: '1920x1080' },
    wnsHelperOffNotice() {}, dateTag: () => 'd', prepareOutput: async () => ({ name: 'o.mxf', write: async () => {} }),
    $: (s) => els[s] || null, animStop() {}, animOff() {}, showExportMask() {}, flashDone() {},
    fxBusy() {}, fxArrive() {},   // 작업 중·도착 효과(js/busy-fx.js) — 여기선 화면이 없으니 빈 함수
    status: (m) => statusMsgs.push(m), exportProgress: (d, t) => progress.push([d, t]),
    renderAnimFrame: (t) => times.push(t), drawExportFrame: async () => {},
    document: { createElement: () => ({ getContext: () => ({ getImageData: () => ({ data: { buffer: new ArrayBuffer(4) } }), putImageData() {} }), toBlob: (cb) => cb({}) }) },
    // 가짜 헬퍼: 메인 스레드가 보낸 프레임 index 기록(fetch 클로저는 이 파일 realm이라 진짜 URL 사용)
    fetch: async (u) => { const s = String(u); if (s.includes('/api/frame')) sent.push(+new URL(s).searchParams.get('index')); return { ok: true, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(1) }; },
    URL: { createObjectURL: () => 'blob:w', revokeObjectURL() {} },
    navigator: { hardwareConcurrency: 4 }, Blob, setTimeout, Uint32Array, Uint8ClampedArray,
  };
  if (pool) {   // 가짜 워커 풀: 받은 index 기록 후 바로 완료 응답
    ctx.OffscreenCanvas = class {}; ctx.OffscreenCanvas.prototype.convertToBlob = () => {};
    ctx.Worker = class { postMessage(m) { posted.push(m.index); setTimeout(() => this.onmessage({ data: { index: m.index, ok: true } }), 0); } terminate() {} };
  }
  vm.runInNewContext(fnSource('async function wnsRender(') + '\nthis.wnsRender = wnsRender;', ctx);
  await ctx.wnsRender('mxf');
  return { times, sent, posted, progress, statusMsgs };
}

test('MXF는 타임라인 fps와 무관하게 29.97 기준 n프레임(0..n-1)을 i/RF 시각으로 뽑는다', async () => {
  for (const pool of [false, true]) {
    const r = await runWns({ dur: 1, fps: 25, pool });
    const n = Math.round(1 * RF);   // 30
    assert.equal(r.times.length, n, `pool=${pool}`);
    r.times.forEach((t, i) => close(t, i / RF, 1e-12));
    const all = [...r.sent, ...r.posted].sort((a, b) => a - b);
    assert.deepEqual(all, Array.from({ length: n }, (_, i) => i));
    assert.deepEqual(r.progress[r.progress.length - 1], [n, n]);
    assert.ok(r.progress.every(([, t]) => t === n), '진행률 분모 = n');
    assert.ok(r.statusMsgs.some((m) => m.includes('MXF·MOV는 방송 규격 29.97fps로 만듭니다')), '29.97 안내');
    assert.equal(r.statusMsgs.filter((m) => m.includes('29.97fps로 만듭니다')).length, 1, '안내는 한 번');
  }
});

test('MXF 29.97 타임라인이면 안내 없음, 1프레임이면 워커 풀 없이 프레임0만', async () => {
  const r = await runWns({ dur: 6, fps: 29.97, pool: true });
  assert.equal(r.times.length, Math.round(6 * RF));
  assert.ok(!r.statusMsgs.some((m) => m.includes('29.97fps로 만듭니다')));
  const one = await runWns({ dur: 0.02, fps: 29.97, pool: true });
  assert.deepEqual(one.sent, [0]);
  assert.deepEqual(one.posted, []);
  assert.deepEqual(one.times, [0]);
});

// ── 실제 앱(부팅 점검기 + fetch 가로채기) — WCG_BOOT_CHECK=1 일 때만 ──
test('부팅 점검: 실제 sendToAE/wnsRender 스펙', { skip: process.env.WCG_BOOT_CHECK !== '1' && 'WCG_BOOT_CHECK=1 일 때만(일렉트론 필요)' }, () => {
  let raw;
  try {
    raw = execFileSync(process.execPath, [path.join(root, 'desktop', 'test', 'boot-check.cjs'), '--wait=7000', '--eval=' + path.join(__dirname, 'ae-cluster-e.boot-eval.js')], { encoding: 'utf8', timeout: 400000 });
  } catch (e) { raw = e.stdout; }
  const j = JSON.parse(raw);
  assert.equal(j.ok, true, JSON.stringify(j.errors));
  const o = j.evalResult;
  assert.ok(o && !o.error, o && o.error);
  const kx = 2158 / 1920, ky = 1214 / 1080, kk = (kx + ky) / 2;
  // 터치: 제목·라벨·범례 배율
  close(o.touch.title.x, 128 * kx); close(o.touch.title.y, 300 * ky); close(o.touch.title.size, 66 * kk);
  close(o.touch.lab1.x, 900 * kx); close(o.touch.lab1.y, 400 * ky);
  close(o.touch.lab1.w, o['1920x1080'].lab1.w * kk);
  // 라벨 배경 PNG = 반올림한 박스(aeLabelCompData) × 출력 배율을 다시 반올림(aeLabelBgBlob) — 실측 폭에 소수가 있으면 순서가 결과를 바꾼다(글꼴 로드 시점에 따라 흔들리던 기대식)
  assert.deepEqual(o.touch.lab1.png, [Math.round(Math.round(o.touch.lab1.rectW) * kk), Math.round(Math.round(o.touch.lab1.rectH) * kk)]);
  close(o.touch.legend.x, o['1920x1080'].legend.x * kx, 1e-6);
  close(o.touch.legend.items[0].text.size, 34 * kk);
  // 지시선: 라벨 바로 아래 같은 페이드, 배경엔 앵커 없음(앵커색 #00C853)
  assert.equal(o.touch.leader.idx + 1, o.touch.leader.lab2Idx);
  assert.deepEqual({ start: o.touch.leader.fade.start, len: o.touch.leader.fade.len }, { start: o.touch.leader.labFade.start, len: o.touch.leader.labFade.len });
  assert.deepEqual(o.touch.leader.fade.ease, [34, 85], '페이드 이징 = 앱 easeOut(34/85)');
  assert.notDeepEqual(o.touch.baseAnchor.slice(0, 3), [0, 200, 83]);
  assert.equal(o.touch.ldrAnchor[3], 255);
  assert.equal(o.touch.ldrBox[3], 0);
  // VF·노말은 배율 1
  for (const res of ['1920x1080', '1920x1080-vf']) assert.equal(o[res].title.size, 66);
  // 단일 태풍
  const L = o.tyLineTouch.rig, F = o.tyFullTouch.rig, N = o.tyFull1920.rig;
  assert.equal(L.trackMode, 'line'); assert.deepEqual(L.bands, {}); assert.deepEqual(L.labels, []);
  assert.ok(L.points.every((p) => p.idx <= L.nowIdx));
  assert.equal(L.points[L.points.length - 1].past, false);
  assert.equal(L.lineColor, '#00AAFF'); close(L.lineWidth, +(6 * kk).toFixed(2));
  assert.equal(F.trackMode, 'full'); assert.equal(F.pastIconK, 0.3); close(F.pastLineWidth, +(Math.max(1.5, 6 * 0.55) * kk).toFixed(2));
  assert.deepEqual(F.points.map((p) => p.noIcon), [false, true, false, true, false]);
  F.points.forEach((p, i) => { close(p.x, N.points[i].x * kx, 0.11); close(p.y, N.points[i].y * ky, 0.11); });
  close(F.bands.r15.strokeW, N.bands.r15.strokeW * kk); close(N.bands.r15.strokeW, 2);   // 반경 외곽선도 출력 배율
  assert.equal(o.tyLong.comp.dur, 12);
  // 타임라인 6초 = AE 컴프 6초(여유 두 번 안 더함)
  for (const k of ['tyLineTouch', 'tyFullTouch', 'tyFull1920', 'cmpTouch', 'cmp1920']) assert.equal(o[k].comp.dur, 6, k);
  for (const res of ['1920x1080', '1920x1080-vf']) assert.equal(o[res].comp.dur, 6, res);
  assert.equal(o.touch.comp.dur, 6);
  // 타이밍 = 타임라인 값. 이 작업들은 트랙이 없어 '자동 구성' 타이밍(=타임라인을 열고 자동 구성을 누르면 생길 막대)으로 들어간다
  // — 칠 0.8초(예전 AE 전용 1초 고정이 아님), 라벨 1초 + 26px 올라오기, 지시선 = 그 라벨 막대. (트랙을 손본 경우의 1:1 비교는 ae-timeline-spec.test.cjs)
  {
    const A = o.touch.auto, fz = Object.fromEntries(o.touch.fades);
    assert.ok(A && A.length, '트랙 없음 → 자동 구성 계획');
    const fillT = A.filter((t) => t.kind === 'fill');
    assert.equal(fillT.length, 2);
    const fps = o.touch.comp.fps, fr = (t) => +(Math.round(t * fps) / fps).toFixed(4);   // 자동 구성은 프레임 경계(0.8초 → 24프레임)
    const sl = (f) => ({ start: f.start, len: f.len });
    for (const t of fillT) { assert.deepEqual(sl(fz['색칠_' + t.key.slice(1)]), { start: t.start, len: t.len }); assert.deepEqual(fz['색칠_' + t.key.slice(1)].ease, [34, 85]); close(t.len, fr(0.8), 1e-4); }
    assert.equal(fillT[0].start, 0, '터치 = 0초부터');
    for (const [id, nm] of [['l1', '라벨_1'], ['l2', '라벨_2']]) {
      const t = A.find((x) => x.kind === 'label' && x.key === id);
      assert.deepEqual({ start: fz[nm].start, len: fz[nm].len }, { start: t.start, len: t.len }); close(fz[nm].rise, 26 * kk);
    }
    const t2 = A.find((x) => x.kind === 'label' && x.key === 'l2');
    assert.deepEqual(sl(fz['지시선_2']), { start: t2.start, len: t2.len });
    // 태풍(트랙 없음) = 자동 구성 경로 막대, 라벨은 경로가 그 지점을 지날 때
    for (const k of ['tyFullTouch', 'tyFull1920']) {
      const tt = o[k].auto.find((x) => x.kind === 'typhoon'), rv = o[k].rig.reveal;
      close(rv.start, tt.ps); close(rv.path, tt.pe - tt.ps); assert.equal(rv.labelLen, 1);
      close(rv.start, k === 'tyFullTouch' ? 0 : fr(1), 1e-4, '터치 0초, 노말 1초 홀드(프레임 경계 0;00;01;00)');
    }
    // 손본 태풍 트랙(경로 1→9초, 라벨 9.5→11초) = 그대로
    assert.deepEqual(o.tyLong.reveal, { start: 1, path: 8, labelLen: 1 });
    assert.deepEqual(o.tyLong.labels, [[9.5, 1.5]]);
  }
  // 비교
  const ct = o.cmpTouch.rig.typhoons[0], cn = o.cmp1920.rig.typhoons[0];
  const cmpT = o.cmp1920.auto.find((x) => x.kind === 'typcmp');
  { const rv = o.cmp1920.rig.reveal;   // 비교 = 비교 예보 막대(끝 = 시작+길이 — 부동소수 덧셈 오차만 허용)
    close(rv.start, cmpT.start); close(rv.path, cmpT.len, 1e-9); assert.equal(rv.labelLen, +Math.min(1, Math.max(0.2, cmpT.len * 0.2)).toFixed(4)); }
  close(ct.iconScreenH, 15 * kk); close(ct.lineW, 3 * kk); close(ct.iconRenderH, 90 * 0.62 * 2.5 / 1.05);
  close(ct.labels[0].bx, cn.labels[0].bx * kx, 0.11); close(ct.nameLabel.size, cn.nameLabel.size * kk);
  // MXF 30프레임
  for (const k of ['mxfPool', 'mxfMain']) assert.deepEqual([...o[k].main, ...o[k].posted].sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i));
  assert.deepEqual(o.mxfOne.main, [0]);
});
