/* [모듈] js/presets.js — 해상도별 배치 프리셋 + 작업 자동 저장(saveWork/loadWork), 배포 기본값 갱신, applyPreset */
'use strict';

// ===================== 해상도별 배치 프리셋 =====================
// 두 해상도는 비율이 같아서 그림 자체는 동일하지만, 가이드(앵커·자막 세이프티)가 달라
// 지도와 도서 박스를 놓을 자리가 다르다. 그래서 배치를 해상도별로 따로 기억한다.
// 배치(프리셋)에 담는 것 = 지도 위치·도서 박스·제목 텍스트(폰트/위치/크기)·라벨 배율.
// 제목 텍스트는 '출력화면별 배치'라 프리셋에 넣는다. 다만 수치 라벨·산은 '내용'이라
// 출력화면·지도종류를 바꿔도 사라지지 않게 프리셋에서 뺀다.
// 지도 위치·도서 박스·제목 텍스트(폰트)에 더해, CG 모드(밝은/어두운)와 그에 딸린 색 세트까지 담는다.
// 그래서 [출력화면 × 지도종류 × 밝은/어두운]마다 완전한 룩(색·폰트·배치)을 따로 기억한다.
// (수치 라벨·산은 '내용'이라 여기 안 넣어서 출력화면 바꿔도 안 사라진다.)
const PRESET_KEYS = ['map', 'insets', 'texts', 'labScale', 'mtnScale', 'cgLight', 'bg',
  'base', 'stroke', 'strokeW', 'sggOn', 'sggOp', 'realCol', 'realW', 'realOn', 'realOp',
  'sidoCol', 'sidoW', 'sidoOn', 'sidoOp', 'nbrCol', 'nbrOp', 'nbrGrow', 'shadow', 'showBg', 'showNW', 'showJP',
  'txtShadow', 'labShadow',   // 제목·라벨 그림자 켬/끔도 화면(모드)별로 기억 (밝은 모드에서 뺀 게 유지되도록)
  // 바다(해상) 색·경계선도 화면별 룩에 포함 — '특보+해상' 화면의 바다 색/경계를 따로 기억한다.
  'seaCol', 'seaW', 'seaBase', 'seaBaseOp', 'seaFade',
  'vfBar', 'vfScale', 'legend', 'wrnColors', 'wrnLevelColors',   // 노말 VF 제목 바·전체 크기 · 기상특보 범례 · 특보 기본색·단계별 색
  'map3d'];   // 3D 살짝 기울임 (미리보기·추출 공통) — 화면별로 기억/굽기

// 배치는 [출력 화면] × [배치 그룹] × [밝은/어두운]으로 따로 기억한다.
// '특보 + 해상'은 바다까지 담느라 지도를 줄여야 해서 배치가 완전히 다르다.
// 박스를 쓰는 나머지(시도군·시도·특보)는 배치가 같으므로 한 묶음('common')으로 공유한다.
const layoutGroup = (style) => ((MAP.styles[style] || MAP.styles.sgg).noInsets ? style : 'common');
const cgModeTag = (light) => ((light == null ? S.cgLight : light) ? 'L' : 'D');
const presetKey = (res, style, light) => `${res || S.res}|${layoutGroup(style || S.style)}|${cgModeTag(light)}`;
const presetLabel = (key) => {
  const [res, grp, mode] = key.split('|');
  const rl = RES[res] ? RES[res].label : res;
  const gl = grp === 'common' ? '기본' : MAP.styles[grp] ? MAP.styles[grp].label : grp;
  return rl + '·' + gl + '·' + (mode === 'L' ? '밝은' : '어두운');
};

// 제목 텍스트: src의 위치·크기·내용만 가져오고, 색(col)·굵기(w)는 dst 것을 유지한다(모드별 색/굵기 보존).
function mergeTextPos(dstArr, srcArr) {
  if (!Array.isArray(srcArr)) return dstArr;
  return srcArr.map((s) => {
    const c = JSON.parse(JSON.stringify(s));
    const d = (dstArr || []).find((x) => x.id === s.id);
    if (d) { if (d.col != null) c.col = d.col; if (d.w != null) c.w = d.w; }
    return c;
  });
}
// VF 제목 바: 위치·크기·on은 src(옮겨오는 쪽)에서, 그림자(농도/번짐/거리)는 dst(그 모드) 것을 유지.
function mergeVfBar(dst, src) {
  if (!src) return dst;
  const c = JSON.parse(JSON.stringify(src));
  if (dst) { for (const k of ['shOp', 'shBlur', 'shDy']) if (dst[k] != null) c[k] = dst[k]; }
  return c;
}
function savePreset() {
  // 내가 저장한 것만 localStorage에 둔다(배포 기본배치는 복사하지 않는다).
  const mine = userPresets();
  const key = mergeCurrentPreset(mine);
  localStorage.setItem('wcg_presets', JSON.stringify(mine));
  showPresetInfo();
  if (typeof syncPersonalSlot === 'function') syncPersonalSlot();   // 개인 슬롯이 있으면 방금 저장을 그 슬롯에도 바로 반영
  cgsStatus(`${presetLabel(key)} 배치로 저장됨 (위치는 밝은·어두운 공유)`);   // CG 구성 창에서 눌렀으면 창 안 토스트로
}
// 지금 화면 배치를 mine(내 저장 배치 객체)에 합친다 — 저장소에는 안 쓴다(미리보기·취소 가능한 흐름용). 반환: 화면 키.
function mergeCurrentPreset(mine) {
  const p = {}, S0 = stateForSave();   // 미리보기 카메라 뷰가 배치로 굳지 않게
  for (const k of PRESET_KEYS) p[k] = JSON.parse(JSON.stringify(S0[k]));
  if (S.res !== '1920x1080-vf') delete p.vfScale; // VF 전용 값이 일반 화면 프리셋에 섞이지 않게
  const key = presetKey();
  mine[key] = p;
  // 같은 화면·지도의 '다른 CG 모드'에도 위치는 똑같이 맞춘다(색은 그대로 둠 — 밝은 모드는 어두운 글씨).
  const base = key.split('|').slice(0, 2).join('|');
  const other = key.endsWith('|L') ? base + '|D' : key.endsWith('|D') ? base + '|L' : null;
  if (other) {
    const all = loadPresets();
    // 다른 모드 배치가 '이미 있을 때만' 위치를 맞춘다(그 모드의 색·굵기는 유지). 없으면 새로 만들지 않는다(색 옮겨붙음 방지 — 폴백이 위치만 따라오게 함).
    if (mine[other] || all[other]) {
      const target = mine[other] ? mine[other] : JSON.parse(JSON.stringify(all[other]));
      for (const k of ['map', 'insets', 'labScale', 'mtnScale']) if (p[k] !== undefined) target[k] = JSON.parse(JSON.stringify(p[k]));
      if (p.vfBar !== undefined) target.vfBar = mergeVfBar(target.vfBar, p.vfBar);   // 위치는 공유, 그림자는 그 모드 것 유지
      if (p.vfScale !== undefined) target.vfScale = clampVfScale(p.vfScale);
      if (p.legend !== undefined) {   // 범례: 위치·크기는 공유, 글자색(txtCol)은 그 모드 것 유지(어두운=흰, 밝은=남색)
        const keepCol = target.legend && target.legend.txtCol;
        target.legend = JSON.parse(JSON.stringify(p.legend));
        if (keepCol) target.legend.txtCol = keepCol;
      }
      // 제목 텍스트: 위치·크기·내용만 맞추고 글자색(col)·굵기(w)는 그 모드 것을 유지한다.
      target.texts = mergeTextPos(target.texts, p.texts);
      mine[other] = target;
    }
  }
  return key;
}
// 이 브라우저에 '내가 직접 저장'한 배치만 (없으면 {}).
function userPresets() {
  try { const raw = localStorage.getItem('wcg_presets'); if (raw) return JSON.parse(raw) || {}; } catch (e) { /* 무시 */ }
  return {};
}
// 지금 유효한 배치 = '모두의 기본 배치'(default-presets.js = WCG_DEFAULTS)를 바탕으로,
// 내가 저장한 화면만 덮어쓴 것. 새로 저장한 배치가 없는 화면은 '항상' 배포 기본배치가 기본이 된다.
function loadPresets() {
  const base = (window.WCG_DEFAULTS && typeof window.WCG_DEFAULTS === 'object') ? window.WCG_DEFAULTS : {};
  return { ...base, ...userPresets() };
}

// ===================== 작업 내용 자동 저장 =====================
// 프리셋(기본 배치)과 별개로, 지금 하던 작업을 통째로 계속 저장한다.
// 새로고침하거나 브라우저를 닫았다 열어도 그대로 이어서 한다.
const WORK_KEY = 'wcg_work';
const DEPLOY_DEFAULTS_KEY = 'wcg_deployment_defaults_signature';
const VF_SCALE_MIGRATION_KEY = 'wcg_vf_scale_state_v2';
let lastWork = '';
function deploymentVfScaleForWork(work) {
  const group = work && work.style === 'warnsea' ? 'warnsea' : 'common';
  const mode = work && work.cgLight ? 'L' : 'D';
  const key = `1920x1080-vf|${group}|${mode}`;
  const preset = window.WCG_DEFAULTS && window.WCG_DEFAULTS[key];
  const value = Number(preset && preset.vfScale);
  return Number.isFinite(value) ? Math.max(50, Math.min(150, Math.round(value))) : 100;
}
function migrateLegacyVfScaleState() {
  try {
    if (localStorage.getItem(VF_SCALE_MIGRATION_KEY)) return false;
    const raw = localStorage.getItem(WORK_KEY);
    let changed = false;
    if (raw) {
      const work = JSON.parse(raw);
      const scales = work && work.vfScales;
      if (scales && typeof scales === 'object' && !Array.isArray(scales)) {
        const currentGroup = work.style === 'warnsea' ? 'warnsea' : 'common';
        let removedCurrent = false;
        for (const group of ['common', 'warnsea']) {
          if (Number(scales[group]) === 100) {
            delete scales[group];
            changed = true;
            if (group === currentGroup) removedCurrent = true;
          }
        }
        if (removedCurrent && work.res === '1920x1080-vf') work.vfScale = deploymentVfScaleForWork(work);
        if (changed) localStorage.setItem(WORK_KEY, JSON.stringify(work));
      }
    }
    localStorage.setItem(VF_SCALE_MIGRATION_KEY, '1');
    return changed;
  } catch (e) { return false; }
}
function deploymentDefaultsSignature() {
  const defaults = window.WCG_DEFAULTS;
  if (!defaults || typeof defaults !== 'object' || !Object.keys(defaults).length) return '';
  const json = JSON.stringify(defaults);
  let hash = 2166136261;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return json.length + ':' + (hash >>> 0).toString(16);
}
function preferUpdatedDeploymentDefaults() {
  // 예전엔 배포 기본값(default-presets.js)이 바뀌면 wcg_work·wcg_presets를 통째로 지워
  // '배포 기본값 우선'을 강제했지만 — 사용자의 현재 작업과 배치가 날아가고
  // '옛날 제목 배치'가 자꾸 되살아나는 버그의 원인이라 그 강제 초기화를 제거한다.
  // (새 배포 기본값은 loadPresets가 '저장 안 한 화면'에만 자동 적용한다.)
  try {
    const signature = deploymentDefaultsSignature();
    if (signature) localStorage.setItem(DEPLOY_DEFAULTS_KEY, signature);   // 서명만 기록(초기화 안 함)
  } catch (e) { /* noop */ }
  return false;
}
let _saveWarned = false, _failedWork = '';
function saveWork() {
  // 시작 화면이 떠 있는 동안은 저장하지 않는다 — 빈 시작 지도가 '직전 작업 이어보기'용 작업을 덮어쓰지 않게
  const ov = document.getElementById('startOverlay');
  if (ov && ov.classList.contains('on')) return;
  let s;
  try {
    s = JSON.stringify(stateForSave());   // 카메라 미리보기 중엔 S.map이 카메라 뷰 — 작업 뷰로 저장(B5)
    if (s === lastWork || s === _failedWork) return; // 안 바뀌었으면(또는 방금 같은 내용이 실패했으면) 쓰지 않는다
    localStorage.setItem(WORK_KEY, s);
    lastWork = s;   // 성공한 뒤에만 기록 — 실패하면 내용이 바뀔 때 다시 시도
    _failedWork = ''; _saveWarned = false;
  } catch (e) {
    if (s) _failedWork = s;
    // 용량 초과 등 — 한 번만 알린다(조용히 멈추면 새로고침 때 작업이 사라짐)
    if (!_saveWarned) { _saveWarned = true; status('자동 저장 실패(저장 공간 부족) — 참고 이미지를 줄이거나 지우고, 프로젝트 저장(Ctrl+S)으로 보관하세요', true); }
  }
}
function loadWork() {
  try {
    const raw = localStorage.getItem(WORK_KEY);
    if (!raw) return null;
    const w = JSON.parse(raw);
    if (!isWorkData(w)) return null;
    lastWork = raw;
    return Object.assign(DEFAULTS(), w);
  } catch (e) { return null; }
}

// 지금 [화면 × 배치 그룹]에 저장된 배치를 불러온다
function applyPreset() {
  const key = presetKey();
  const all = loadPresets();
  const liveVfScale = S.vfScales && S.vfScales[vfScaleGroup()];
  let p = all[key];
  let full = !!p;
  _presetUsedKey = p ? key : '';
  // 태풍 지도: 배치는 해상도별로 따로지만, 현재 해상도에 태풍 배치가 없으면
  // (현재 모드→현재 res 다른 모드→같은 res 단일 태풍→노말 1920→아무 태풍 배치) 순으로 '태풍' 배치를 찾아 통째로 적용한다.
  // → 아직 안 구운 해상도에서도 옛 작업 배치 대신 구운 태풍 배치가 일관되게 뜬다.
  // 단 VF는 VF 태풍 배치만 쓴다(일반 화면 배치를 쓰면 VF 배경·제목 위치가 통째로 노말 것으로 바뀐다). 일반 화면도 VF 배치는 안 빌린다.
  if (!p && isTyphoon()) {
    const base = key.slice(0, -2);   // res|typhoon(또는 typhoonCompare)
    const mode = key.slice(-1), alt = mode === 'L' ? 'D' : 'L';
    const isVf = S.res === '1920x1080-vf';
    let cands = [base + '|' + mode, base + '|' + alt, `${S.res}|typhoon|${mode}`, `${S.res}|typhoon|${alt}`];
    if (isVf) cands = cands.concat(Object.keys(all).filter((k) => k.startsWith('1920x1080-vf|') && /\|typhoon\|/.test(k)));
    else cands = cands.concat([`1920x1080|typhoon|${mode}`, `1920x1080|typhoon|${alt}`], Object.keys(all).filter((k) => /\|typhoon\|/.test(k) && !k.startsWith('1920x1080-vf|')));
    const found = cands.find((k) => all[k]);
    if (found) { p = all[found]; full = true; _presetUsedKey = found; }
    else { showPresetInfo(); return false; }   // 어떤 태풍 배치도 없으면 현재 배치 유지
  }
  if (!p) {
    // 이 모드 배치가 없으면(예: 밝은 모드 배치 미저장) 같은 화면·지도의 다른 배치에서
    // '위치'(지도·도서박스·제목·라벨배율·VF바)만 가져와 지도가 그 화면에 맞게 따라오게 한다.
    const base = key.split('|').slice(0, 2).join('|');   // res|group
    const altKey = Object.keys(all).find((k) => k !== key && (k === base || k.startsWith(base + '|')));
    if (altKey) { p = all[altKey]; _presetUsedKey = altKey; }
  }
  if (!p) { showPresetInfo(); return false; }
  // 태풍은 같은 콘텐츠라 해상도가 달라도 지도 뷰·라벨 크기를 '공유'한다(라벨값이 해상도마다 달라지지 않게).
  // 태풍은 해상도끼리 지도뷰·라벨/산 크기를 '공유'하려 skip한다. 단 '처음 진입' 때는 배치의 라벨/산 크기를 그대로 써서
  // 직전 지도(특보 128% 등)의 값이 남지 않게 한다(지도뷰 map은 진입 시 setTyphoonDefaultView가 따로 처리하므로 계속 skip).
  const skip = isTyphoon() ? (_enterTyphoonApply ? { map: 1 } : { map: 1, labScale: 1, mtnScale: 1 }) : {};
  if (full) {
    for (const k of PRESET_KEYS) if (p[k] !== undefined && !skip[k]) S[k] = JSON.parse(JSON.stringify(p[k]));   // 0·false 값도 복원
    applyPresetWarningColors(p, true);   // 옛 프리셋에 단계별 색이 없으면 이전 화면의 색을 남기지 않는다
  } else {
    // 폴백: 위치만 가져오고 색은 지금 모드 것 유지. 텍스트도 위치만 병합(색·굵기 유지).
    for (const k of ['map', 'insets', 'labScale', 'mtnScale']) if (p[k] !== undefined && !skip[k]) S[k] = JSON.parse(JSON.stringify(p[k]));
    if (p.vfBar !== undefined) S.vfBar = mergeVfBar(S.vfBar, p.vfBar);   // 위치만 따라오고 그림자는 지금 모드 것 유지
    if (p.texts) S.texts = mergeTextPos(S.texts, p.texts);
  }
  bumpSeq();   // 배치에 구워진 텍스트 id와 겹치지 않게
  applyPresetVfScale(p, liveVfScale);
  // 특보 범례: 이 그룹 배치가 범례를 갖고 있으면 그대로, 없으면(옛/배포 프리셋) 기본값으로 리셋한다.
  // 안 그러면 특보구역↔특보+해상처럼 그룹을 옮길 때 이전 그룹의 범례 위치가 그대로 남는다.
  // 단 태풍 지도는 특보에서 잡은 범례 크기·위치를 그대로 쓰도록 리셋하지 않는다(사용자 요청).
  if (!isTyphoon()) S.legend = (p.legend !== undefined) ? JSON.parse(JSON.stringify(p.legend)) : JSON.parse(JSON.stringify(DEFAULTS().legend));
  // 범례 글자색은 제목 글씨처럼 모드에 맞춘다: 어두운 모드의 남색(#071251) 글씨는 흰색으로, 밝은 모드의 흰색은 남색으로.
  // (커스텀 색은 안 건드림.) 밝은 모드에서 잡은 남색이 어두운 모드로 넘어와 안 보이는 문제 자동 보정.
  if (S.legend) {
    const _tc = (S.legend.txtCol || '').toUpperCase();
    if (S.cgLight && _tc === '#FFFFFF') S.legend.txtCol = '#071251';
    else if (!S.cgLight && _tc === '#071251') S.legend.txtCol = '#FFFFFF';
  }
  // 제목·라벨 그림자 켬/끔: 프리셋에 있으면 그대로, 없으면(옛/배포 프리셋) 기본값으로. 안 그러면 이전 화면 값이 그대로 남아 껐던 게 되살아난다.
  const _def = DEFAULTS();
  S.txtShadow = (p.txtShadow !== undefined) ? p.txtShadow : _def.txtShadow;
  S.labShadow = (p.labShadow !== undefined) ? p.labShadow : _def.labShadow;
  applyVfDefaults();   // VF면 라벨 92%·산 70% 강제(프리셋에 옛 128이 있어도)
  sel = []; bgUseFile = 0;
  markCgMode(); buildBgBtns(); syncPanelFromState(); renderAll();
  refreshWarningColorsAfterPreset(full);   // 배치 색 적용 직후 목록·지도·범례를 같은 상태로 맞춘다
  showPresetInfo();
  status(full ? `${presetLabel(key)} 배치 적용됨` : `${presetLabel(key)} — 위치만 다른 배치에서 가져옴`);
  return true;
}
function showPresetInfo() {
  // 선택 메뉴를 간결하게 유지한다. 저장 여부 목록은 배치 동작과 무관해 표시하지 않는다.
}
