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

// S를 받아 계획 컨텍스트를 만든다. opt.warnDefs = 특보 정의(aeWarningFillDefs 대신), opt.legend = 범례 항목
function planCtx(S, opt = {}) {
  S.anim ||= { dur: 6, fps: 29.97, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [] };
  S.anim.cam ||= { keys: [] };
  const ctx = {
    S, Math, JSON, Object, Array, String, Number, Set, Map, isFinite, console,
    seq: 1000, tlHeadT: 0, _camSavedMap: null,
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
module.exports = { planCtx, html, fnSrc };
