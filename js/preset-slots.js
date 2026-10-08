/* [모듈] js/preset-slots.js — 배치 지정하기(완전 기본/개인 슬롯, 구운 배치 파일) */
'use strict';

// ===================== 배치 지정하기 (기본 배치 슬롯) =====================
// 구운 배치 파일(default-presets.js/.json)을 슬롯에 드래그&드롭하면 '완전 기본 배치'(master, 비번)나 '개인 배치'(personal)로 지정.
// 지정하면 시작 시 문서 상단 인라인 스크립트가 window.WCG_DEFAULTS를 그 배치로 바꾼다(개인 배치 active면 최우선).
const SLOT_MASTER = 'wcg_slot_master', SLOT_PERSONAL = 'wcg_slot_personal', SLOT_PW = '7989';
const slotGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
function slotFmtTs(ts) { if (!ts) return ''; const d = new Date(ts), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
// 구운 파일에서 배치 객체 추출: 'window.WCG_DEFAULTS = {...};' 또는 순수 JSON.
function parseBakedPresets(text) {
  let obj = null;
  const m = text.match(/WCG_DEFAULTS\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  try { obj = m ? JSON.parse(m[1]) : JSON.parse(text); } catch (e) { obj = null; }
  return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : null;
}
// 새 배치 vs 지금 기본값 차이 요약.
function presetDiff(nw) {
  const cur = (window.WCG_DEFAULTS && typeof window.WCG_DEFAULTS === 'object') ? window.WCG_DEFAULTS : {};
  const keys = new Set([...Object.keys(nw), ...Object.keys(cur)]);
  const added = [], changed = [], removed = [];
  for (const k of keys) {
    const inCur = Object.prototype.hasOwnProperty.call(cur, k), inNw = Object.prototype.hasOwnProperty.call(nw, k);
    if (inNw && !inCur) added.push(k);
    else if (!inNw && inCur) removed.push(k);
    else if (JSON.stringify(cur[k]) !== JSON.stringify(nw[k])) changed.push(k);
  }
  const line = (label, arr) => arr.length ? `· ${label} ${arr.length}개: ${arr.slice(0, 5).join(', ')}${arr.length > 5 ? ' 외' : ''}` : '';
  const parts = [line('바뀜', changed), line('추가', added), line('빠짐', removed)].filter(Boolean);
  return { text: parts.join('\n') || '기존 기본값과 내용이 같습니다.', total: added.length + changed.length + removed.length };
}
// (토스 확인창 tossConfirm 은 위쪽 한 곳에만 정의 — 예전엔 여기 두 번째 정의가 있어 앞의 것을 덮어 danger 경고색·Enter 확인이 안 먹었다)
// 새로고침 뒤 부팅부가 하던 작업 위에 새 기본 배치를 한 번 다시 적용하도록 표시를 남긴다(안 그러면 지금 화면엔 옛 배치가 그대로).
function slotReload(msg) { try { sessionStorage.setItem('wcg_reapply_preset', '1'); } catch (e) { /* 무시 */ } status(msg || '적용되었습니다 — 새로고침합니다'); setTimeout(() => location.reload(), 550); }
// 이 브라우저에 직접 저장한 화면 배치(wcg_presets)는 슬롯보다 우선한다 — 슬롯을 바꿀 때 지울지 묻는다.
// 안 지우면 그 화면들은 계속 내 저장 배치로 열려 슬롯 적용이 안 보인다. 반환: 지웠으면 true.
async function offerDropLocalPresets() {
  const n = Object.keys(userPresets()).length;
  if (!n) return false;
  const ok = await tossConfirm({ title: '내가 저장한 화면 배치', message: `이 브라우저에서 직접 저장한 화면 배치 ${n}개가 슬롯 배치보다 우선합니다.\n\n지우고 슬롯 배치로 맞출까요?\n(지우지 않으면 그 화면들은 내 저장 배치로 열립니다)`, ok: '지우고 맞추기', cancel: '내 저장 유지' });
  if (ok) localStorage.removeItem('wcg_presets');
  return ok;
}
// 저장한 사람 이름 입력(직전 이름 기억). 취소=null, 빈칸 허용=''.
async function askSaverName(title) {
  const last = localStorage.getItem('wcg_last_by') || '';
  const by = await tossPrompt({ title: title || '저장한 사람', message: '저장하는 사람 이름 (팝업에 표시돼요 · 비워도 됨)', value: last });
  if (by == null) return null;
  const v = by.trim(); if (v) localStorage.setItem('wcg_last_by', v);
  return v;
}
// '지금 유효한 배치 전체'(기본배치+내가 저장한 화면) + 강원산지 + 태풍스타일을 담은 배치 객체.
// bakeDefaults(파일로 굽기)와 '지금 배치로 채우기'가 공유한다. ※ bakeDefaults의 담는 내용과 항상 동일하게 유지할 것.
function buildCurrentPresets(all) {
  // 주의: 여기서 savePreset()을 부르지 않는다(savePreset→syncPersonalSlot→buildCurrentPresets 무한재귀 방지).
  // 호출부가 필요하면 먼저 savePreset() 하거나, 지금 화면을 합친 배치(all)를 넘긴다.
  const presets = normalizeBakedVfScales(all || loadPresets());
  if (!Object.keys(presets).length) return null;
  const bulMtns = (S.mtns || []).filter((m) => m.bul && !m.off);
  if (bulMtns.length) {
    presets.mtnGangwon = { size: bulMtns[0].size, anchors: bulMtns.map((m) => (m.anchor && m.anchor.lon != null) ? { lon: m.anchor.lon, lat: m.anchor.lat } : xyToLonLat(m.x, m.y)) };
  } else if (window.WCG_DEFAULTS && window.WCG_DEFAULTS.mtnGangwon) {
    presets.mtnGangwon = window.WCG_DEFAULTS.mtnGangwon;
  }
  if (S.typhoon) {
    const T = S.typhoon;
    presets.typhoonStyle = {
      landFill: T.landFill, landStroke: T.landStroke, krShow: T.krShow, krFill: T.krFill, krStroke: T.krStroke, krStrokeW: T.krStrokeW, krOpacity: T.krOpacity, krStrokeOp: T.krStrokeOp,
      terrain: T.terrain, iconCol: T.iconCol, basemap: T.basemap, iconMode: T.iconMode, iconScale: T.iconScale, trackMode: T.trackMode, lineColor: T.lineColor, lineWidth: T.lineWidth, glowOn: T.glowOn, glowStr: T.glowStr, glowCol: T.glowCol, bands: T.bands ? JSON.parse(JSON.stringify(T.bands)) : undefined,
      sidoShow: T.sidoShow, sidoCol: T.sidoCol, sidoW: T.sidoW, sidoOp: T.sidoOp,
      gridShow: T.gridShow, gridCol: T.gridCol, gridW: T.gridW, gridOp: T.gridOp,
      legendOrder: T.legendOrder ? T.legendOrder.slice() : undefined, legendHidden: T.legendHidden ? JSON.parse(JSON.stringify(T.legendHidden)) : undefined,
    };
    const labs = (T.labels || []).filter((b) => !b.off);
    const selId = (sel.find((s) => s.kind === 'label') || {}).id;
    const src = labs.find((b) => b.id === selId) || labs[0];
    if (src) {
      presets.typhoonStyle.labelStyle = { size: src.size, w: src.w, txtCol: src.txtCol, fill: src.fill, stroke: src.stroke, strokeW: src.strokeW, radius: src.radius, padX: src.padX, padY: src.padY, track: src.track, titleRatio: src.titleRatio, divider: src.divider,
        fillGrad: src.fillGrad, fill2: src.fill2, strokeGrad: src.strokeGrad, stroke2: src.stroke2, gradAngle: src.gradAngle, fillOp: src.fillOp, glass: src.glass, glassBlur: src.glassBlur };
    } else if (window.WCG_DEFAULTS && window.WCG_DEFAULTS.typhoonStyle && window.WCG_DEFAULTS.typhoonStyle.labelStyle) {
      presets.typhoonStyle.labelStyle = window.WCG_DEFAULTS.typhoonStyle.labelStyle;
    }
  } else if (window.WCG_DEFAULTS && window.WCG_DEFAULTS.typhoonStyle) {
    presets.typhoonStyle = window.WCG_DEFAULTS.typhoonStyle;
  }
  delete presets.__meta__;   // 슬롯엔 순수 배치만(저장자 메타는 슬롯 레코드의 by로 따로 관리)
  return presets;
}
// 개인 슬롯이 있으면 '현재 배치를 이 화면 기본값으로 저장'할 때마다 자동으로 그 슬롯을 최신 배치로 갱신한다(조용히·리로드 없음).
// 개인 슬롯이 없으면 아무것도 안 한다(원치 않는 자동 생성 방지 — 슬롯은 사용자가 한 번 만든 뒤부터 연결됨).
// 꺼진 개인 슬롯은 건드리지 않는다 — 꺼져 있으면 기본값이 완전 기본/배포라, 그걸로 개인 배치를 덮어 원래 개인 배치가 사라진다.
function syncPersonalSlot() {
  const per = slotGet(SLOT_PERSONAL); if (!per || !per.active) return;
  const presets = buildCurrentPresets(); if (!presets) return;
  localStorage.setItem(SLOT_PERSONAL, JSON.stringify({ presets, ts: Date.now(), active: per.active !== false, name: per.name || '현재 배치', by: per.by || '' }));
  if ($('#slotOverlay') && $('#slotOverlay').classList.contains('on')) renderSlotStates();   // 팝업 열려 있으면 표시 갱신
}
// 파일 없이 '지금 화면 배치'를 슬롯에 바로 담기. (개인=비번없음 / 완전기본=비번)
async function fillSlotFromCurrent(which) {
  // 지금 보고 있는 화면도 담기게 '메모리에서만' 합친다 — 비번·확인·이름 입력을 모두 통과하기 전엔
  // 내 저장 배치(wcg_presets)·개인 슬롯을 건드리지 않는다(취소·비번 오류에도 이미 덮어써지던 문제).
  const mine = userPresets();
  mergeCurrentPreset(mine);
  const base = (window.WCG_DEFAULTS && typeof window.WCG_DEFAULTS === 'object') ? window.WCG_DEFAULTS : {};
  const presets = buildCurrentPresets(JSON.parse(JSON.stringify({ ...base, ...mine })));
  if (!presets) { await tossConfirm({ title: '저장된 배치 없음', message: '각 화면에서 "현재 배치를 이 화면 기본값으로"를 먼저 저장해 주세요.', ok: '확인', cancel: '닫기' }); return; }
  const nm = which === 'master' ? '완전 기본 배치' : '개인 배치';
  if (which === 'master') {
    const pw = await tossPrompt({ title: nm + ' 채우기', message: '관리자 비밀번호를 입력하세요' });
    if (pw == null) return; if (pw !== SLOT_PW) { await tossConfirm({ title: '비밀번호 오류', message: '비밀번호가 틀립니다.', warn: true, ok: '확인', cancel: '닫기' }); return; }
  }
  const d = presetDiff(presets);
  const ok = await tossConfirm({ title: nm + ' 채우기', message: `지금 화면 배치를 ${nm}으로 저장할까요?\n\n${d.text}\n\n앞으로 이 배치가 기본값이 됩니다.`, ok: '저장', cancel: '취소' });
  if (!ok) return;
  const by = await askSaverName(nm + ' 저장자'); if (by == null) return;
  // 이제 확정 — 내 저장 배치가 있으면 지울지 묻고, 유지하면 지금 화면을 거기에도 저장한다(옛 저장본이 새 슬롯을 가리지 않게).
  // 내 저장이 없으면 아무것도 안 쓴다(지금 화면은 슬롯에 들어갔으니 로컬에 따로 고정할 필요 없음).
  const hadLocal = Object.keys(userPresets()).length > 0;
  if (hadLocal && !(await offerDropLocalPresets())) localStorage.setItem('wcg_presets', JSON.stringify(mine));
  const rec = { presets, ts: Date.now(), by, name: '현재 배치' };
  if (which === 'personal') rec.active = true;
  localStorage.setItem(which === 'master' ? SLOT_MASTER : SLOT_PERSONAL, JSON.stringify(rec));
  slotReload(nm + ' 저장됨 — 새로고침합니다');
}
async function assignSlotFromFile(which, file) {
  let text; try { text = await file.text(); } catch (e) { status('파일을 못 읽었습니다', true); return; }
  const presets = parseBakedPresets(text);
  if (!presets) { await tossConfirm({ title: '읽기 실패', message: '배치 파일이 아닙니다.\n오른쪽 위 설정(렌치) 메뉴의 "…기본값으로 굽기"로 만든 default-presets.js(.json)를 넣어 주세요.', ok: '확인', cancel: '닫기' }); return; }
  const meta = presets.__meta__ || null; delete presets.__meta__;   // 저장자·버전 메타는 슬롯 필드로 빼고 배치에선 제거
  let by = meta && meta.by ? String(meta.by) : '';
  const metaTs = meta && meta.ts ? meta.ts : null;
  if (which === 'master') {
    const pw = await tossPrompt({ title: '완전 기본 배치 교체', message: '관리자 비밀번호를 입력하세요 (아무나 못 바꾸게)', value: '' });
    if (pw == null) return;
    if (pw !== SLOT_PW) { await tossConfirm({ title: '비밀번호 오류', message: '비밀번호가 틀립니다.', warn: true, ok: '확인', cancel: '닫기' }); return; }
  }
  const d = presetDiff(presets), nm = which === 'master' ? '완전 기본 배치' : '개인 배치';
  const ok = await tossConfirm({ title: nm + ' 적용', message: `이 파일을 ${nm}으로 적용할까요?${by ? '\n(저장자: ' + by + ')' : ''}\n\n${d.text}\n\n적용하면 앞으로 이 배치가 기본값이 됩니다.`, ok: '적용', cancel: '취소' });
  if (!ok) return;
  if (!by) { by = await askSaverName(nm + ' 저장자'); if (by == null) return; }
  const rec = { presets, ts: metaTs || Date.now(), by, name: file.name };
  if (which === 'personal') rec.active = true;
  localStorage.setItem(which === 'master' ? SLOT_MASTER : SLOT_PERSONAL, JSON.stringify(rec));
  await offerDropLocalPresets();   // 내가 저장한 화면 배치가 새 슬롯을 가리지 않게(지울지 묻는다)
  slotReload(nm + ' 적용됨 — 새로고침합니다');
}
async function clearSlot(which) {
  const nm = which === 'master' ? '완전 기본 배치' : '개인 배치';
  if (which === 'master') {
    const pw = await tossPrompt({ title: '완전 기본 배치 비우기', message: '관리자 비밀번호를 입력하세요' });
    if (pw == null) return; if (pw !== SLOT_PW) { await tossConfirm({ title: '비밀번호 오류', message: '비밀번호가 틀립니다.', warn: true, ok: '확인', cancel: '닫기' }); return; }
  }
  const ok = await tossConfirm({ title: nm + ' 비우기', message: nm + '을 지우고 ' + (which === 'master' ? '배포 기본값으로' : '완전 기본 배치로') + ' 되돌릴까요?', warn: true, ok: '비우기', cancel: '취소' });
  if (!ok) return;
  localStorage.removeItem(which === 'master' ? SLOT_MASTER : SLOT_PERSONAL);
  await offerDropLocalPresets();
  slotReload('되돌렸습니다 — 새로고침합니다');
}
async function togglePersonalActive() {
  const p = slotGet(SLOT_PERSONAL); if (!p) return;
  p.active = !p.active; localStorage.setItem(SLOT_PERSONAL, JSON.stringify(p));
  await offerDropLocalPresets();   // 끄거나 켠 배치가 실제로 보이게(내 저장 화면이 가리지 않게)
  slotReload(p.active ? '개인 배치 사용 — 새로고침합니다' : '개인 배치 끔 — 새로고침합니다');
}
const _flopEsc = (s) => String(s == null ? '' : s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));
const FLOP_PATH = 'M18 14 h68 l16 16 v72 a3 3 0 0 1-3 3 H21 a3 3 0 0 1-3-3 V17 a3 3 0 0 1 3-3 z';
// 장착된 플로피 — 색은 앱 테마 틴트(개인=--primary, 완전기본=--danger, CSS 클래스로). 라벨엔 저장한 사람(없으면 종류)+날짜.
function floppySvg(kind, by, ts) {
  const label = (by && by.trim()) ? by.trim() : (kind === 'master' ? '기본' : '개인'), date = slotFmtTs(ts).slice(0, 10);
  return `<svg viewBox="0 0 120 120" class="flopSvg flop-${kind}" aria-hidden="true">
    <path class="flopBody" d="${FLOP_PATH}"/>
    <rect class="flopSlider" x="34" y="14" width="40" height="30"/>
    <rect class="flopShutter" x="56" y="17" width="16" height="25" rx="1.5"/>
    <rect class="flopLabel" x="26" y="54" width="68" height="50" rx="3"/>
    <text class="flopName" x="60" y="76" text-anchor="middle">${_flopEsc(label).slice(0, 7)}</text>
    <text class="flopDate" x="60" y="94" text-anchor="middle">${date}</text>
  </svg>`;
}
// 빈 슬롯 — 같은 플로피지만 점선 아웃라인.
const EMPTY_DRIVE_SVG = `<svg viewBox="0 0 120 120" class="flopSvg flopDashed" aria-hidden="true"><path d="${FLOP_PATH}"/><rect x="34" y="14" width="40" height="30"/><rect x="26" y="54" width="68" height="50" rx="3"/></svg>`;
function renderSlotStates() {
  const per = slotGet(SLOT_PERSONAL), mas = slotGet(SLOT_MASTER);
  const drive = (id, rec, kind) => { const d = $('#' + id); if (!d) return; d.classList.toggle('filled', !!rec); d.classList.toggle('empty', !rec); d.innerHTML = rec ? floppySvg(kind, rec.by, rec.ts) : EMPTY_DRIVE_SVG; };
  drive('slotPersonalDrive', per, 'personal'); drive('slotMasterDrive', mas, 'master');
  const byTxt = (rec) => rec && rec.by && rec.by.trim() ? ` · <b>${_flopEsc(rec.by.trim())}</b>` : '';
  const ps = $('#slotPersonalState'), ms = $('#slotMasterState');
  if (ps) ps.innerHTML = per ? `저장: ${slotFmtTs(per.ts)}${byTxt(per)}${per.active ? '<span class="badge">사용 중</span>' : ''}` : '비어 있음';
  if (ms) ms.innerHTML = mas ? `버전: ${slotFmtTs(mas.ts)}${byTxt(mas)}` : '배포 기본값 사용 중';
  const mkBtn = (txt, fn, cls) => { const b = document.createElement('button'); b.textContent = txt; if (cls) b.className = cls; b.onclick = fn; return b; };
  const pb = $('#slotPersonalBtns'), mb = $('#slotMasterBtns');
  if (pb) {
    pb.innerHTML = '';
    pb.append(mkBtn('지금 배치로 채우기', () => fillSlotFromCurrent('personal'), 'pri'));   // 파일 없이 현재 배치를 담기
    if (per) { pb.append(mkBtn(per.active ? '끄기' : '켜기', togglePersonalActive), mkBtn('비우기', () => clearSlot('personal'), 'danger')); }
  }
  if (mb) {
    mb.innerHTML = '';
    mb.append(mkBtn('지금 배치로 채우기', () => fillSlotFromCurrent('master'), 'pri'));   // 비번 확인 후 담기
    if (mas) mb.append(mkBtn('비우기', () => clearSlot('master'), 'danger'));
  }
}
function openPresetSlots() {
  let ov = $('#slotOverlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'slotOverlay';
    ov.innerHTML = `<div class="slotCard" role="dialog" aria-modal="true" aria-label="배치 지정하기" tabindex="-1">
      <div class="slotHead">배치 지정하기<button class="x" id="slotX" aria-label="닫기" title="닫기 (Esc)">${POP_X_SVG}</button></div>
      <div class="slotBody">
        <div class="slotGrid">
          <div class="slot" id="slotPersonal">
            <h4>개인 배치</h4><div class="sub">이 브라우저 전용 · 비번 없음</div>
            <div class="slotDrive empty" id="slotPersonalDrive"></div>
            <div class="slotState" id="slotPersonalState"></div>
            <div class="drop">구운 파일을 <b>여기로 드래그&amp;드롭</b></div>
            <div class="slotBtns" id="slotPersonalBtns"></div>
          </div>
          <div class="slot master" id="slotMaster">
            <h4>완전 기본 배치</h4><div class="sub">모두의 기본값 · 교체 시 비번</div>
            <div class="slotDrive empty" id="slotMasterDrive"></div>
            <div class="slotState" id="slotMasterState"></div>
            <div class="drop">구운 파일을 <b>여기로 드래그&amp;드롭</b> (비번)</div>
            <div class="slotBtns" id="slotMasterBtns"></div>
          </div>
        </div>
        <div class="slotFootHint">· 이 브라우저에서 화면별로 <b>직접 저장한 배치</b>가 있으면 그 화면은 그게 먼저, 그다음 <b>개인 배치</b>(켜져 있을 때), <b>완전 기본 배치</b>, 배포 기본값 순입니다.<br>· 파일은 오른쪽 위 <b>설정</b>(렌치) 메뉴의 <b>"…기본값으로 굽기"</b>로 만든 default-presets.js(.json)입니다.</div>
      </div></div>`;
    document.body.appendChild(ov);
    const closeSlots = () => popAnimClose(ov, () => ov.classList.remove('on'));   // 닫힘 애니메이션 뒤 숨김(DOM은 그대로)
    const slotClose = () => { if (ov.classList.contains('popClosing')) return; closeSlots(); popFocusBack(ov); };
    $('#slotX').onclick = slotClose;
    ov.onclick = (e) => { if (e.target === ov) slotClose(); };
    // Esc = 닫기, Tab = 카드 안에서만 — 다른 팝업과 같게(처음 만들 때 한 번만 붙인다). 위에 뜬 확인·입력창·토스 모달이 먼저 받는다
    window.addEventListener('keydown', (e) => {
      if ((e.key !== 'Escape' && e.key !== 'Tab') || !ov.classList.contains('on') || ov.classList.contains('popClosing')) return;
      if ($('#confirmOverlay.on:not(.popClosing)') || document.querySelector('#tossOv:not(.popClosing)')) return;
      if (e.key === 'Escape') { e.preventDefault(); slotClose(); } else popTrapTab(ov.querySelector('.slotCard'), e);
    });
    for (const [id, which] of [['slotPersonal', 'personal'], ['slotMaster', 'master']]) {
      const el = document.getElementById(id);
      // 슬롯 위에선 전체창 '작업 파일 열기' 오버레이를 숨기고, 놓으면 창 쪽 드래그 상태도 함께 정리한다(안 그러면 오버레이가 확인창 위에 남는다).
      el.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('drag'); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; const h = $('#dropHint'); if (h) h.classList.remove('on'); });
      el.addEventListener('dragleave', (e) => { e.stopPropagation(); el.classList.remove('drag'); });
      el.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('drag'); dropHintReset(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) assignSlotFromFile(which, f); });
    }
  }
  renderSlotStates();
  const wasOpen = ov.classList.contains('on') && !ov.classList.contains('popClosing');
  popAnimCancel(ov);
  ov.classList.add('on');
  if (!wasOpen) popFocusIn(ov, ov.querySelector('.slotCard'));
}
