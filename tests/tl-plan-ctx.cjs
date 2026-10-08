// 타임라인 레이어 계획·시간 도우미를 실제 앱 소스에서 잘라 vm으로 돌리는 도우미(테스트 공용 — *.test.cjs 아님).
// 앱 코드는 tools/app-source.cjs로 합쳐 읽는다(MODULES.md 8장). 화면·DOM 없이 S만 주면 tlLayerPlan·끌기 계산·자동 구성 계획을 실행한다.
const path = require('node:path');
const vm = require('node:vm');
const appSource = require('../tools/app-source.cjs');

const html = appSource(path.join(__dirname, '..', 'index.html'));
const fnSrc = (name) => {
  const m = html.match(new RegExp(`\\n(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  if (!m) throw new Error(name + ' 함수를 못 찾음');
  return m[0];
};
const constSrc = (name) => {
  const m = html.match(new RegExp(`\\nconst ${name} = [^\\n]*`));
  if (!m) throw new Error(name + ' 상수를 못 찾음');
  return m[0].replace(/^\nconst /, '\nvar ');   // vm 컨텍스트 전역으로 보이게
};
const FNS = ['tlFps', 'tlNomFps', 'tlFrameOf', 'tlQuant', 'tlFrameDur', 'tlPad', 'tlIsDropFps', 'tlFramesToTC', 'tlFmtTC', 'tlFmtShort', 'tlParseTime',
  'tlLegendNames', 'tlLayerPlan', 'tlSpanNow', 'tlSetSpan', 'tlDragCalc', 'tlEnsureTrack', 'tlSnapTargets', 'tlSnapNear', 'timelineSnapTimes',
  'trackInfo', 'syncTyphoonSpan', 'ensureTyphoonKeys', 'typhoonLabels', 'autoTrackPlan', 'animTouchedCount', 'stateForSave'];
const CONSTS = ['ANIM_START', 'ANIM_VF_ENTER_LEN', 'VF_ENTER_FRAMES', 'ANIM_FILL_LEN', 'ANIM_LABEL_LEN', 'TL_CAM_COL', 'TL_DEF_LEN', 'hex2rgb', 'lumOf', 'animStart', 'camKeysRotate', 'CAM3D_DEFAULT'];

// S를 받아 계획 컨텍스트를 만든다. opt.warnDefs = 특보 정의(aeWarningFillDefs 대신), opt.legend = 범례 항목,
// opt.ver = 기능 확장팩(헬퍼) 버전(없으면 새 헬퍼 — 'AE 차이'·블리드가 버전에 따라 다르다)
function planCtx(S, opt = {}) {
  S.anim ||= { dur: 6, fps: 29.97, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [] };
  S.anim.cam ||= { keys: [] };
  const ctx = {
    S, Math, JSON, Object, Array, String, Number, Set, Map, isFinite, console,
    seq: 1000, tlHeadT: 0, _camSavedMap: null,
    aeHelperExt: () => (opt.ver == null ? true : opt.ver >= 20261008),
    anim: () => S.anim,
    camKeys: () => S.anim.cam.keys,
    isTyphoon: () => S.style === 'typhoon' || S.style === 'typhoonCompare',
    isTyphoonCompare: () => S.style === 'typhoonCompare',
    fills: () => ((S.fillsByStyle ||= {})[S.style] ||= {}),
    brushStrokes: () => ((S.brushByStyle ||= {})[S.style] ||= []),
    aeWarningFillDefs: () => opt.warnDefs || [],
    wrnLegendItems: () => opt.legend || [],
    typhoonLineMode: () => !!(S.typhoon && S.typhoon.trackMode === 'line' && S.style !== 'typhoonCompare'),
    curTyphoonPoints: () => ((S.typhoon && S.typhoon.issues && S.typhoon.issues[0] && S.typhoon.issues[0].points) || []),
    labelList: () => (S.style === 'typhoon' || S.style === 'typhoonCompare' ? ((S.typhoon ||= {}).labels ||= []) : S.labels),
    typhoonAnimWindow: (pts) => ({ lo: 0, hi: Math.max(0, pts.length - 1) }),
    easeInOutCInv: (y) => (y <= 0 ? 0 : y >= 1 ? 1 : (y < 0.5 ? Math.cbrt(y / 4) : 1 - Math.cbrt(2 * (1 - y)) / 2)),
  };
  vm.createContext(ctx);
  vm.runInContext(CONSTS.map(constSrc).join('\n') + '\n' + FNS.map(fnSrc).join('\n'), ctx);
  return ctx;
}
// 한 줄짜리 함수(`function aePt(x, y) { … }`) — fnSrc는 '\n}'까지라 한 줄 함수엔 못 쓴다
const fnLine = (name) => {
  const m = html.match(new RegExp(`\\n(?:async )?function ${name}\\([^\\n]*`));
  if (!m) throw new Error(name + ' 함수를 못 찾음');
  return m[0];
};
// 실제 sendToAE를 vm에서 돌리는 컨텍스트 — 레이어 PNG 굽기·화면 실측·태풍 투영만 가짜(내용 표시 문자열)로 바꾸고,
// 계획(tlLayerPlan)·자동 구성·좌표 배율·스펙 조립·컴프 길이는 앱 코드 그대로. fetch를 가로채 /api/frame 본문과 /api/ae 스펙을 모은다.
//  반환 { ctx, caps, send } — send()는 sendToAE를 한 번 돌려 /api/ae 스펙(이 realm 객체)을 준다. caps.frames[i] = i번 업로드의 내용 표시.
//  opt.ver = /ping 이 돌려줄 헬퍼 버전(기본 20261008 = 새 헬퍼). opt.real = 태풍 투영을 앱 실제 함수(typhoonScreenPts·compareScreenPts·projLL)로.
function aeCtx(S, opt = {}) {
  const ctx = planCtx(S, opt);
  const caps = { ae: [], frames: [], status: [] };
  const vf = () => S.res === '1920x1080-vf';
  const ver = opt.ver == null ? 20261008 : opt.ver;
  const part = (p) => (p ? '@' + p : '');
  const up = (s) => String(s || '').toUpperCase();
  Object.assign(ctx, {
    WNS_HELPER: 'http://helper',
    fetch: async (url, o) => {
      const u = String(url);
      if (/\/ping(\?|$)/.test(u)) return { ok: true, status: 200, json: async () => ({ ok: true, ff: true, ver }) };
      if (u.includes('/api/frame')) caps.frames[+new URL(u).searchParams.get('index')] = o.body;
      if (u.includes('/api/ae')) caps.ae.push(JSON.parse(o.body));
      return { ok: true, status: 200, json: async () => ({ ok: true, ae: 'AE test' }) };
    },
    wnsHelperOffNotice() {}, flashDone() {}, exportProgress() {}, animStop() {}, animOff() {}, tlRefreshPreview() {},
    fxBusy() {}, fxArrive() {}, fxProgress() {},   // 작업 중·도착 효과(js/busy-fx.js) — 스펙 검사엔 무관

    status: (m) => caps.status.push(m), wrnNoneLeftMapEmpty: () => false, wrnNoneEmptyText: () => '',
    $: () => null, animT: null, animPlaying: false, dateTag: () => 'T', pickAeVersion: async () => null,
    RES: { '1920x1080': { size: [1920, 1080] }, '1920x1080-vf': { size: [1920, 1080] }, '2158x1214': { size: [2158, 1214] } },
    _vfPanelRect: { x: 1100, y: 100, w: 700, h: 800 }, vfScaleValue: () => (vf() ? 80 : 100), vfEnterDist: () => 320,
    // 레이어 PNG — 무엇을 구웠는지 표시 문자열(업로드 본문으로 그대로 잡힌다)
    // 카메라가 있으면 이동/고정 부분을 나눠 굽는다(part) — 표시 문자열에 '@part'
    aeBaseBlob: async (p) => 'base' + part(p), aeLinesBlob: async (p) => 'lines' + part(p), aeVfBarBlob: async () => 'vfbar',
    aeMtnBlob: async (base, id) => (base ? 'mtnBase' + (id == null ? '' : '@' + (id instanceof Set ? 'free' : id)) : 'mtn:' + id), aeFillBlob: async (col, p) => 'fill:' + col.toUpperCase() + part(p),
    aeWarningFillBlob: async (d, p) => 'wrn:' + d.key + part(p), aeBrushBlob: async (col, p) => 'brush:' + col.toUpperCase() + part(p),
    // 인셋에 있는 것(S.insets = { any, fills, ids, brush, lines }) · 노말 VF 패널 클립(S.vfClip이면 고정 사각형)
    aeInsetInfo: () => { const i = S.insets || {}; return { any: !!i.any, fills: new Set((i.fills || []).map(up)), ids: new Set(i.ids || []), brush: new Set((i.brush || []).map(up)), lines: !!i.lines }; },
    aeVfMaskRect: () => (vf() && S.vfClip ? { x: 1012, y: 80, w: 880, h: 920 } : null),
    _helperVer: null, CAM_VOID_COL: '#0e2a4e',
    aeLeaderBlob: async (id) => 'leader:' + id, aeLabelBgBlob: async (ld) => 'labelbg:' + ld.id, svgBlob: async () => 'svg',
    aeIconBlob: async () => ({ blob: 'icon', w: 270, h: 270, iconH: 225 }),
    // 화면 실측 대신 — 라벨 박스는 S 좌표 그대로, 범례는 고정 크기
    aeLabelCompData: () => S.labels.filter((b) => !b.off).map((b) => ({ id: b.id, w: 120, h: 50, cx: b.x, cy: b.y, fill: b.fill, texts: [], leader: b.style === 'leader',
      lg: b.style === 'leader' ? { ax: b.ax != null ? b.ax : b.x, ay: b.ay != null ? b.ay : b.y + 170, w: 121.5, h: 50.25, col: b.stroke || '#FFFFFF', fill: b.fill } : null })),
    aeLegendCompData: () => (S.legend && S.legend.on ? { w: 200, h: 80, x: 150, y: 600, items: [] } : null),
    // 태풍 투영(가짜 — 좌표만 정해지면 된다)
    typhoonNowIdx: () => (S.typhoon && S.typhoon.nowIdx) || 0, typhoonIdxInRange: () => true, labK: () => 1,
    typhoonScreenPts: (pts) => pts.map((p, idx) => ({ x: 300 + idx * 90, y: 800 - idx * 40, idx, r15: p.r15 || 0, r25: 0, r70: 0, head: false, noIcon: !!p.noIcon })),
    TYPHOON_BAND_DEF: { r70: { fill: '#F00', fillOp: 0.3, stroke: '#FFF', strokeW: 2 }, r15: { fill: '#0F0', fillOp: 0.3, stroke: '#FFF', strokeW: 2 }, r25: { fill: '#00F', fillOp: 0.3, stroke: '#FFF', strokeW: 2 } },
    typhoonStyleDefaults: () => ({ labelStyle: {} }), camProjectXY: (x, y) => [x, y], compareIconIdxSet: () => new Set([0]),
    compareVisiblePoints: (c) => c.points || ctx.curTyphoonPoints(),
    compareScreenPts: (cpts) => cpts.map((p, idx) => ({ x: 320 + idx * 80, y: 760 - idx * 30, idx, head: false })),
    compareVisibleIdxMap: (c) => Object.fromEntries((c.points || ctx.curTyphoonPoints()).map((_, i) => [i, i])),
  });
  if (opt.real) {   // 태풍 투영 = 앱 실제 함수(지도 데이터의 메르카토르 투영) — 키·표현식 = 화면 함수 비교용
    ctx.MAP = { proj: MAP_PROJ }; ctx.typhoonProg = null;
    delete ctx.typhoonScreenPts; delete ctx.compareScreenPts;
    vm.runInContext(['TYPHOON_R_EARTH', 'typhoonKmToUnit', 'lerp'].map(constSrc).join('\n') + '\n' + ['projLL', 'typhoonXY', 'typhoonScreenPts', 'compareScreenPts'].map(fnSrc).join('\n'), ctx);
  }
  vm.runInContext(['aeArrow', 'clamp01', 'rgb2hex', 'mixHex', 'EASE_BEZIER', 'EASE_VF', 'aeEaseOf', 'blindPitch', 'blindAngle', 'AE_EXT_VER'].map(constSrc).join('\n') + '\n'
    + ['vfScaledPoint', 'vfScaledSize', 'aeOutK', 'aeCamSpec', 'aeBleedBox', 'aeLeaderSpec', 'aeBlindMtnSpan', 'sendToAE'].map(fnSrc).join('\n') + '\n' + ['aePt', 'aeSz'].map(fnLine).join('\n'), ctx);
  const send = async () => { const n = caps.ae.length; await ctx.sendToAE(); return caps.ae[n] || null; };
  return { ctx, caps, send };
}
// 지도 투영 상수(map-data.js의 KOREA_MAP.proj — 데이터 파일이라 JSON 조각만 읽는다)
const MAP_PROJ = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '..', 'map-data.js'), 'utf8').match(/"proj":(\{[^}]*\})/)[1]);
module.exports = { planCtx, aeCtx, html, fnSrc, constSrc, MAP_PROJ };
