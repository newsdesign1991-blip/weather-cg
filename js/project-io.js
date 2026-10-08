/* [모듈] js/project-io.js — 설정 옮기기, 프로젝트 저장/열기, 최근 파일, 기본 배치 굽기(bakeDefaults) */
'use strict';

// ===== 설정 옮기기 — 웹판 ↔ 데스크톱 앱 ↔ 다른 PC =====
// 주소(출처)마다 localStorage가 따로라 wcg_* 키 전체를 파일 하나로 주고받는다. (최근 파일 목록=폴더 권한이라 못 옮김)
const SETTINGS_SKIP = new Set(['wcg_pending_start']);   // 일시 상태(새로 시작 대기)는 빼고
function exportSettings() {
  const keys = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('wcg_') && !SETTINGS_SKIP.has(k)) keys[k] = localStorage.getItem(k);
  }
  saveWork(); keys.wcg_work = localStorage.getItem('wcg_work') || keys.wcg_work;   // 지금 작업까지 최신으로
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const payload = { kind: 'wcg-settings', v: 1, at: d.toISOString(), from: location.origin, keys };
  download(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `날씨CG_설정_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`);
  status(`설정 ${Object.keys(keys).length}개를 내보냈습니다 — 옮길 쪽 앱에서 '설정 가져오기'`, true);
}
function importSettings() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    let obj = null; try { obj = JSON.parse(await f.text()); } catch (e) { obj = null; }
    if (!obj || obj.kind !== 'wcg-settings' || !obj.keys || typeof obj.keys !== 'object') { status('설정 파일이 아닙니다 — "설정 내보내기"로 만든 .json을 넣어 주세요', true); return; }
    const names = Object.keys(obj.keys).filter((k) => k.startsWith('wcg_') && !SETTINGS_SKIP.has(k) && typeof obj.keys[k] === 'string');
    const ok = await tossConfirm({
      title: '설정 가져오기',
      message: `설정 ${names.length}개를 이 앱에 넣고 새로고침할까요?\n(${obj.from || '?'} · ${String(obj.at || '').slice(0, 10)})\n\n이 앱의 같은 설정과 이어하던 작업은 파일 내용으로 바뀝니다.`,
      ok: '가져오기', danger: true,
    });
    if (!ok) return;
    fxBusy([fxSec('cfg'), '#importSettings'], true, { maxMs: 15000 });   // 작업 중 효과 — 새로고침까지(못 하면 15초 뒤 저절로 꺼짐)
    window.removeEventListener('beforeunload', saveWork);   // 새로고침 때 지금 작업이 가져온 작업을 덮어쓰지 않게
    let n = 0; for (const k of names) { try { localStorage.setItem(k, obj.keys[k]); n++; } catch (e) { /* 용량 초과 등 */ } }
    status(`설정 ${n}개를 가져왔습니다 — 새로고침합니다`, true);
    setTimeout(() => location.reload(), 600);
  };
  inp.click();
}

// 여러 파일을 압축 없이(store) ZIP 한 개로 묶는다 — 폴더 선택 없이 다운로드 폴더로 바로 받게. file://에서도 됨.
function zipStore(files) {   // files: [{name, data: Uint8Array}]
  const enc = new TextEncoder();
  const parts = [];
  let offset = 0;
  const central = [];
  const u16 = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n & 0xffff, true); return b; };
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
  const push = (a) => { parts.push(a); offset += a.length; };
  const FLAG = 0x0800;   // 파일명 UTF-8 플래그(비트11) — 한글 이름이 깨지지 않게(Windows 탐색기 포함)
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = _crc32(data), localOff = offset;
    push(u32(0x04034b50)); push(u16(20)); push(u16(FLAG)); push(u16(0)); push(u16(0)); push(u16(0)); // ver, flag(UTF-8), method(store), time, date
    push(u32(crc)); push(u32(data.length)); push(u32(data.length)); push(u16(name.length)); push(u16(0));
    push(name); push(data);
    central.push({ name, crc, size: data.length, localOff });
  }
  const cdStart = offset;
  for (const c of central) {
    push(u32(0x02014b50)); push(u16(20)); push(u16(20)); push(u16(FLAG)); push(u16(0)); push(u16(0)); push(u16(0)); // sig, made, need, flag(UTF-8), method, time, date
    push(u32(c.crc)); push(u32(c.size)); push(u32(c.size)); push(u16(c.name.length)); push(u16(0)); push(u16(0)); // sizes, name/extra/comment len
    push(u16(0)); push(u16(0)); push(u32(0)); push(u32(c.localOff)); push(c.name); // disk, int/ext attr, local offset
  }
  const cdSize = offset - cdStart;   // ★ 중앙디렉터리 크기는 EOCD 필드 push '전에' 확정해야 한다(예전엔 12바이트 초과 계산 → zip 손상).
  push(u32(0x06054b50)); push(u16(0)); push(u16(0)); push(u16(central.length)); push(u16(central.length));
  push(u32(cdSize)); push(u32(cdStart)); push(u16(0));
  return new Blob(parts, { type: 'application/zip' });
}
const blobBytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

// 저장 위치·이름을 고르고 blob을 쓴다. 미지원 브라우저는 다운로드 폴더로. 취소하면 null.
async function saveBlobAs(blob, suggestedName, type) {
  if (window.showSaveFilePicker) {
    try {
      const fh = await window.showSaveFilePicker({ suggestedName, types: type ? [type] : undefined });
      const w = await fh.createWritable(); await w.write(blob); await w.close();
      return fh.name;
    } catch (e) { if (e.name === 'AbortError') return null; /* file:// 등 피커 미지원 → 아래 다운로드 폴백 */ }
  }
  download(blob, suggestedName); return suggestedName;
}

// 프로젝트 저장. 처음(또는 다른 이름으로=saveAs)엔 위치를 고르고, 이후 Ctrl+S는 같은 파일에 덮어쓴다.
let projFileHandle = null;
// 작업 중·도착 효과(js/busy-fx.js) 대상 — 프로젝트 메뉴 섹션·제목줄 프로젝트(플로피) 버튼 + 누른 버튼
const projFx = (btn) => [fxSec('proj'), '#titlebar [data-menu=proj]', btn];
async function saveProject(saveAs) {
  // 미리보기 그림 굽기·파일 쓰기 동안 흐름(Ctrl+S로 불러도 제목줄 플로피에 보인다). 실패·취소도 finally에서 끈다
  const fx = projFx('#save'); let saved = false;
  fxBusy(fx, true);
  try { saved = await saveProjectRun(saveAs); }
  finally { fxBusy(fx, false); if (saved) fxArrive(['#titlebar [data-menu=proj]', '#save']); }
}
// 반환: 저장했으면 true(취소면 false)
async function saveProjectRun(saveAs) {
  const snap = JSON.parse(JSON.stringify(stateForSave()));   // 카메라 미리보기 중이어도 작업 뷰로 저장(B5)
  // 그림(PNG)에 작업 데이터를 심어 저장 — 탐색기 미리보기 + 다시 불러오기 둘 다 되는 한 파일.
  // 이름을 '날씨CG_날짜.wcg.png'로 해서 일반 사진 PNG와 헷갈리지 않게 한다(확장자는 .png라 썸네일은 그대로).
  const day = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; })();
  let blob, suggested = `날씨CG_${day}.wcg.png`, types = [{ description: '날씨 CG 작업 파일(그림)', accept: { 'image/png': ['.png'] } }];
  try {
    const png = new Uint8Array(await (await previewPng(1280)).arrayBuffer());
    blob = new Blob([pngEmbed(png, 'wcgwork', _b64enc(JSON.stringify(snap)))], { type: 'image/png' });
  } catch (e) {
    blob = new Blob([JSON.stringify(snap, null, 1)], { type: 'application/json' });
    suggested = `날씨CG_${day}.json`; types = [{ description: '날씨 CG 프로젝트', accept: { 'application/json': ['.json'] } }];
  }
  if (!window.showSaveFilePicker) { download(blob, suggested); addRecent(suggested, null, snap); status('저장됨 (다운로드 폴더)'); return true; }
  try {
    if (saveAs || !projFileHandle) {
      projFileHandle = await window.showSaveFilePicker({ suggestedName: (projFileHandle && projFileHandle.name) || suggested, types });
    }
    const w = await projFileHandle.createWritable(); await w.write(blob); await w.close();
    addRecent(projFileHandle.name, projFileHandle, snap);   // 최근 파일에 기록
    status('저장됨: ' + projFileHandle.name);
    return true;
  } catch (e) {
    if (e.name === 'AbortError') return false;   // 사용자가 취소
    projFileHandle = null;                 // file:// 등 피커 미지원 → 다운로드 폴더로
    download(blob, suggested); addRecent(suggested, null, snap); status('저장됨 (다운로드 폴더)');
    return true;
  }
}

// 지금까지 저장한 모든 화면 기본배치를 default-presets.js 파일로 구워 낸다.
// 그 파일을 WeatherCG 폴더에 두면 새로 받은 사람도(localStorage 비어 있을 때) 이 배치로 열린다.
function normalizeBakedVfScales(presets) {
  for (const group of ['common', 'warnsea']) {
    const keys = [`1920x1080-vf|${group}|L`, `1920x1080-vf|${group}|D`];
    const entries = keys.map((k) => presets[k]).filter((p) => p && typeof p === 'object');
    if (!entries.length) continue;
    const source = entries.find((p) => p.vfScale !== undefined);
    const scale = clampVfScale(source ? source.vfScale : 100);
    for (const p of entries) p.vfScale = scale;
  }
  return presets;
}
async function bakeDefaults() {
  // 굽기 직전에 '지금 보고 있는 화면'을 자동 저장한다 — 크기·색을 바꾸고 "현재 배치를 기본값으로"를
  // 깜빡해도 지금 화면 값이 그대로 담기게. (안 그러면 저장 안 한 변경은 굽기에서 빠진다.)
  savePreset();
  // '지금 유효한' 배치 전체(배포 기본배치 + 내가 저장한 화면)를 굽는다.
  // localStorage만 raw로 읽으면 내가 이번에 저장한 화면만 담겨, 나머지 배치가 통째로 사라진다.
  const presets = normalizeBakedVfScales(loadPresets());
  const keys = Object.keys(presets);
  if (!keys.length) { status('저장된 배치가 없습니다 — 각 화면에서 "현재 배치를 이 화면 기본값으로"를 먼저 누르세요', true); return; }
  // 지금 화면에 '강원 산지'(통보문 bul 산)가 있으면 그 위치를 경위도로 저장 → 자동 산지 기본 위치가 된다.
  const bulMtns = (S.mtns || []).filter((m) => m.bul && !m.off);
  if (bulMtns.length) {
    presets.mtnGangwon = { size: bulMtns[0].size, anchors: bulMtns.map((m) => (m.anchor && m.anchor.lon != null) ? { lon: m.anchor.lon, lat: m.anchor.lat } : xyToLonLat(m.x, m.y)) };
  } else if (window.WCG_DEFAULTS && window.WCG_DEFAULTS.mtnGangwon) {
    presets.mtnGangwon = window.WCG_DEFAULTS.mtnGangwon;   // 산지가 화면에 없으면 기존 값 유지
  }
  // 태풍 전용 스타일(배치와 별개: 색·반경 스타일·지형강도·남한강조·아이콘색)도 기본값으로 굽는다.
  if (S.typhoon) {
    const T = S.typhoon;
    presets.typhoonStyle = {
      landFill: T.landFill, landStroke: T.landStroke, krShow: T.krShow, krFill: T.krFill, krStroke: T.krStroke, krStrokeW: T.krStrokeW, krOpacity: T.krOpacity, krStrokeOp: T.krStrokeOp,
      terrain: T.terrain, iconCol: T.iconCol, basemap: T.basemap, iconMode: T.iconMode, iconScale: T.iconScale, trackMode: T.trackMode, lineColor: T.lineColor, lineWidth: T.lineWidth, glowOn: T.glowOn, glowStr: T.glowStr, glowCol: T.glowCol, bands: T.bands ? JSON.parse(JSON.stringify(T.bands)) : undefined,
      sidoShow: T.sidoShow, sidoCol: T.sidoCol, sidoW: T.sidoW, sidoOp: T.sidoOp,
      gridShow: T.gridShow, gridCol: T.gridCol, gridW: T.gridW, gridOp: T.gridOp,
      legendOrder: T.legendOrder ? T.legendOrder.slice() : undefined, legendHidden: T.legendHidden ? JSON.parse(JSON.stringify(T.legendHidden)) : undefined,
    };
    // 라벨 기본 스타일(폰트 크기·굵기·색·박스)도 굽는다 — 선택한 태풍 라벨, 없으면 첫 라벨 기준.
    const labs = (T.labels || []).filter((b) => !b.off);
    const selId = (sel.find((s) => s.kind === 'label') || {}).id;
    const src = labs.find((b) => b.id === selId) || labs[0];
    if (src) {
      presets.typhoonStyle.labelStyle = { size: src.size, w: src.w, txtCol: src.txtCol, fill: src.fill, stroke: src.stroke, strokeW: src.strokeW, radius: src.radius, padX: src.padX, padY: src.padY, track: src.track, titleRatio: src.titleRatio, divider: src.divider,
      fillGrad: src.fillGrad, fill2: src.fill2, strokeGrad: src.strokeGrad, stroke2: src.stroke2, gradAngle: src.gradAngle, fillOp: src.fillOp, glass: src.glass, glassBlur: src.glassBlur };
    } else if (window.WCG_DEFAULTS && window.WCG_DEFAULTS.typhoonStyle && window.WCG_DEFAULTS.typhoonStyle.labelStyle) {
      presets.typhoonStyle.labelStyle = window.WCG_DEFAULTS.typhoonStyle.labelStyle;   // 라벨이 없으면 기존 굽힌 값 유지
    }
  } else if (window.WCG_DEFAULTS && window.WCG_DEFAULTS.typhoonStyle) {
    presets.typhoonStyle = window.WCG_DEFAULTS.typhoonStyle;
  }
  const by = await askSaverName('굽는 사람 (저장자)'); if (by == null) return;
  presets.__meta__ = { by, ts: Date.now() };   // 저장자·버전 — 슬롯에 꽂으면 팝업에 표시된다
  const js = '// 모두의 기본 배치 (fresh install 때 이 배치로 열린다). 앱의 굽기 버튼으로 다시 만들 수 있다.\nwindow.WCG_DEFAULTS = ' + JSON.stringify(presets) + ';\n';
  const fx = [fxSec('cfg'), '#bakeDefaults'];   // 작업 중 효과(js/busy-fx.js) — 파일로 쓰는 동안. 실패해도 finally에서 끈다
  fxBusy(fx, true);
  let name = null;
  try { name = await saveBlobAs(new Blob([js], { type: 'application/javascript' }), 'default-presets.js', { description: '모두의 기본 배치', accept: { 'application/javascript': ['.js'] } }); }
  finally { fxBusy(fx, false); }
  if (name) fxArrive('#bakeDefaults');
  if (name) status(`기본값 구움: ${name} (${keys.length}개 배치${by ? ', 저장자 ' + by : ''}) — WeatherCG 폴더의 default-presets.js 를 이 파일로 교체하세요`);
}

// ── 최근 파일 목록 (IndexedDB에 파일 핸들+스냅샷 저장) ──
// 핸들이 있으면(크롬/엣지) 다시 클릭 시 그 파일을 바로 연다. 핸들을 못 쓰면(file://) 저장 시점 스냅샷을 연다.
function idbRecent(mode, val) {
  return new Promise((res) => {
    let rq;
    try { rq = indexedDB.open('wcg', 1); } catch (e) { return res(mode === 'get' ? [] : false); }
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onerror = () => res(mode === 'get' ? [] : false);
    rq.onsuccess = () => {
      try {
        const tx = rq.result.transaction('kv', mode === 'get' ? 'readonly' : 'readwrite');
        const st = tx.objectStore('kv');
        if (mode === 'get') { const g = st.get('recent'); g.onsuccess = () => res(g.result || []); g.onerror = () => res([]); }
        else { const p = st.put(val, 'recent'); tx.oncomplete = () => res(true); tx.onerror = () => res(false); if (p) p.onerror = () => res(false); }
      } catch (e) { res(mode === 'get' ? [] : false); }   // 구조화복제 실패 등
    };
  });
}
async function addRecent(name, handle, data) {
  try {
    let list = await idbRecent('get');
    list = list.filter((r) => r.name !== name);
    const rec = { name, time: Date.now(), handle: handle || null, data };
    list.unshift(rec);
    list = list.slice(0, 10);
    let ok = await idbRecent('set', list);
    if (!ok && handle) { rec.handle = null; ok = await idbRecent('set', list); }   // 핸들이 저장 안 되면 스냅샷만
    if ($('#recentList').classList.contains('on')) buildRecentList();
  } catch (e) { /* IDB 안 되면 무시 */ }
}
function relTime(t) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return '방금'; if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`;
}
async function buildRecentList() {
  const box = $('#recentList'); box.textContent = '';
  let list = []; try { list = await idbRecent('get'); } catch (e) {}
  if (!list.length) { const d = document.createElement('div'); d.className = 'recentEmpty'; d.textContent = '최근 연 파일이 없습니다 — 저장하거나 불러오면 여기 쌓입니다.'; box.append(d); return; }
  for (const rec of list) {
    const row = document.createElement('div'); row.className = 'recentRow';
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = rec.name; nm.title = rec.name;
    const tm = document.createElement('div'); tm.className = 'tm'; tm.textContent = relTime(rec.time);
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '✕'; del.title = '목록에서 제거';
    del.onclick = async (e) => { e.stopPropagation(); let l = await idbRecent('get'); l = l.filter((r) => !(r.name === rec.name && r.time === rec.time)); await idbRecent('set', l); buildRecentList(); };
    row.append(nm, tm, del);
    row.onclick = () => openRecent(rec);
    box.append(row);
  }
}
async function openRecent(rec) {
  const fx = projFx(null); let opened = false;   // 작업 중 효과 — 권한 확인·파일 읽기·그리기 동안
  fxBusy(fx, true);
  try {
    let data = rec.data, fromSnap = false;
    if (rec.handle && rec.handle.queryPermission) {
      // 원본이 옮겨졌거나 지워졌으면(NotFoundError 등) 저장해 둔 스냅샷으로 연다
      try {
        let p = await rec.handle.queryPermission({ mode: 'read' });
        if (p !== 'granted') p = await rec.handle.requestPermission({ mode: 'read' });
        if (p === 'granted') { const file = await rec.handle.getFile(); data = (await readProjectFile(file)).data; }
      } catch (err) { data = rec.data; fromSnap = true; }
    }
    if (!isWorkData(data)) { status('열 수 없습니다 (파일이 옮겨졌거나 삭제됨)', true); return; }
    const keepH = (!fromSnap && rec.handle && /\.png$/i.test(rec.name || '')) ? rec.handle : null;   // PNG 핸들만 덮어쓰기에(스냅샷으로 열었으면 없는 파일에 쓰지 않게)
    loadProjectData(data, keepH);
    await addRecent(rec.name, rec.handle || null, data);   // 방금 연 걸 맨 위로(스냅샷으로 열어도 핸들은 남긴다 — 네트워크 드라이브가 잠깐 끊긴 경우 다음엔 원본을 다시 시도)
    $('#recentList').classList.remove('on');
    status(fromSnap && rec.handle ? '원본 파일을 못 찾아 마지막 저장 스냅샷으로 열었습니다: ' + rec.name : '열림: ' + rec.name, fromSnap && !!rec.handle);
    opened = true;
  } catch (e) { status('열기 실패: ' + rec.name + ' — 파일이 옮겨졌거나 지워졌을 수 있어요', true); }
  finally { fxBusy(fx, false); if (opened) fxArrive('#titlebar [data-menu=proj]'); }
}
// 프로젝트 데이터를 화면에 적용 (불러오기·최근파일 공용)
// 작업 파일 최소 검사 — 아무 JSON이나 열려 현재 작업이 빈 기본값으로 바뀌거나 렌더 예외로 멈추지 않게
function isWorkData(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const m = d.map;
  if (!m || typeof m !== 'object' || ![m.x, m.y, m.s].every((v) => v != null && Number.isFinite(+v))) return false;
  return ['texts', 'labels', 'mtns'].every((k) => d[k] == null || Array.isArray(d[k]));
}
function loadProjectData(data, handle) {
  if (!isWorkData(data)) throw new Error('날씨 CG 작업 파일이 아닙니다');
  stopAnimForSwap();   // 옛 작업의 재생·카메라 백업을 먼저 걷는다(작업 뷰로 되돌린 뒤 undo 스냅샷)
  const prevS = S, prevHandle = projFileHandle;
  pushUndo();
  try {
    S = Object.assign(DEFAULTS(), data);
    normStyle();   // 없는 지도 종류(데이터 파일 로드 실패)면 시도군으로
    bumpSeq();   // 불러온 작업 id 뒤에서 새 id 발급
    sel = [];
    resetWorkRuntime();    // 이전 작업의 특보·예보·통보문 목록을 비운다(새 작업 칠·범례·AE를 덮어쓰지 않게)
    buildZones(); markStyleBtns(); markResBtns();
    buildBgBtns(); markCgMode();
    restoreWrnRuntime();   // 특보 지도면 저장된 특보 목록·우선순위 복원(재오픈 후 편집 가능하게) — renderAll 앞이라야 자동 범례가 빈 채로 안 그려진다
    syncPanelFromState(); renderAll();
    buildTimeline();
  } catch (e) {
    // 그리다 깨지면 원래 작업으로 되돌린다(깨진 S가 자동저장되지 않게)
    undoStack.pop(); updateUndoBtns();
    S = prevS; sel = [];
    try { resetWorkRuntime(); buildZones(); markStyleBtns(); markResBtns(); buildBgBtns(); markCgMode(); restoreWrnRuntime(); syncPanelFromState(); renderAll(); buildTimeline(); } catch (_) {}
    throw e;
  }
  _tiltRasterSig = null; applyTilt();   // 옛 작업의 기울인 지도 미리보기 잔재 제거·새 작업 기준으로
  updateFrameGuideLabel();              // 새 작업 해상도에 맞춰 프레임 비율
  showPresetInfo();
  projFileHandle = handle || null;   // 핸들 있으면 이후 Ctrl+S가 같은 파일로
  markUndoFileSwap(prevHandle, projFileHandle);   // 불러오기를 되돌리면 저장 대상 파일도 되돌린다
  // '예전 작업 불러오기'로 시작화면에서 열었다면 시작화면을 닫는다 (이제 작업이 있으니)
  const ov = document.getElementById('startOverlay');
  if (ov && ov.classList.contains('on')) { ov.classList.remove('on'); localStorage.setItem('wcg_started', '1'); }
  localStorage.removeItem('wcg_pending_start');   // 프로젝트를 열었으면 '선택 화면 대기' 해제
  closeCgSetup();   // CG 구성 창이 떠 있었으면(파일 끌어다 놓기 등) 고르던 건 버리고 닫는다 — 불러온 작업의 구성이 이긴다
}

// 불러오기 (사이드바 버튼·시작화면 버튼 공용). 새 형식(PNG, 데이터 내장)·옛 형식(JSON) 둘 다 연다.
async function openProject() {
  if (window.showOpenFilePicker) {
    try {
      const [h] = await window.showOpenFilePicker({ types: [{ description: '날씨 CG 프로젝트', accept: { 'image/png': ['.png'], 'application/json': ['.json'] } }] });
      // 작업 중 효과(js/busy-fx.js) — 파일을 고른 뒤 읽고 그리는 동안. 실패해도 finally에서 끄고, 아래 catch가 알린다
      const fx = projFx('#load');
      fxBusy(fx, true);
      try {
        const file = await h.getFile();
        const { data, png } = await readProjectFile(file);
        loadProjectData(data, png ? h : null);            // PNG 핸들만 이후 Ctrl+S 덮어쓰기에 쓴다
        addRecent(h.name, png ? h : null, data);
        status('불러옴: ' + h.name);
      } finally { fxBusy(fx, false); }
      fxArrive('#titlebar [data-menu=proj]');
      return;
    } catch (e) { if (e.name === 'AbortError') return; if (e && e.message) { alert('불러오기 실패: ' + e.message); return; } }
  }
  const i = document.createElement('input');
  i.type = 'file'; i.accept = '.png,.json';
  i.onchange = async () => {
    const fx = projFx('#load'); let opened = false;
    fxBusy(fx, true);
    try {
      const { data } = await readProjectFile(i.files[0]);
      loadProjectData(data, null);
      addRecent(i.files[0].name, null, data);
      status('불러옴');
      opened = true;
    } catch (err) { alert('불러오기 실패: ' + err.message); }
    finally { fxBusy(fx, false); if (opened) fxArrive('#titlebar [data-menu=proj]'); }
  };
  i.click();
}

// 스포이드 — 커서 아래 색을 집는다. 브러쉬 그림이 있으면 그 픽셀 색, 없으면 그 존의 칠 색.
function colorAtPoint(e) {
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  const space = brushSpaceAt(e);
  const c = brushRT[space];   // 브러쉬 런 캔버스들(화면 이미지와 같은 그림)
  if (c && c.ok && c.runs.length) {
    const [lx, ly] = toSpaceLocal(e, space);
    const px = Math.round((lx - c.bbox.x) * c.K), py = Math.round((ly - c.bbox.y) * c.K);
    if (px >= 0 && py >= 0 && px < c.W && py < c.H) {
      try { const d = brushPixelAt(c, px, py); if (d[3] > 30) return toHex(d[0], d[1], d[2]); } catch (_) {}
    }
  }
  const z = zoneUnder(e);
  if (z) { const f = fillOf(z); if (f && f !== S.base) return f; }
  return null;
}
