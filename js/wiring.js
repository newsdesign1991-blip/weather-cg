/* [모듈] js/wiring.js — 버튼·입력 배선 wire()(한 함수) + 사이드바 그룹·아이콘 구성(로드 때 실행, refreshToolGroup) */
'use strict';

// ===================== 배선 =====================
function wire() {
  // 제목 접기는 pointerdown 쪽(끌어서 떼어내기)에서 '안 움직였을 때'만 처리한다.
  // 여기에 onclick 을 또 달면 떼어낸 직후에 접히거나 두 번 토글된다.
  // 사이드바 위치/기본배치 버튼은 사이드바 하단 footer에서 만들고 배선한다(위 footer 생성부).
  applyDockSide();   // 저장하지 않고 기본 상태만 반영 (loadLayout가 이 뒤에 덮어쓴다)

  // 툴바 좌우로 끌어 옮기기 (손잡이)
  $('#tbGrip').addEventListener('pointerdown', (e) => {
    const st = $('#stage'), tb = $('#topbar');
    const x0 = e.clientX, base = tb.offsetLeft;
    const mv = (ev) => {
      toolbarX = base + (ev.clientX - x0);
      applyToolbarPos();
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      saveLayout();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  });
  applyToolbarPos();
  window.addEventListener('resize', () => { applyToolbarPos(); positionPanelResize(); positionApiGear(); });

  // 사이드바 가로 크기 조절 (통째로 확대)
  $('#panelResize').addEventListener('pointerdown', (e) => {
    const r = $('#panel').getBoundingClientRect();   // 고정된 바깥 모서리 기준
    const grip = $('#panelResize'); grip.classList.add('on');
    const mv = (ev) => {
      // 오른쪽 도킹이면 오른쪽 모서리 고정, 왼쪽 도킹이면 왼쪽 모서리 고정
      const w = dockSide === 'right' ? (r.right - ev.clientX) : (ev.clientX - r.left);
      panelZoom = clamp(w / PANEL_BASE, 0.85, 2.2);
      applyPanelSize();
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      grip.classList.remove('on');
      saveLayout();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  });
  applyPanelSize();

  // ---- 타임라인 ----
  const tlShow = (on) => {
    $('#timeline').classList.toggle('on', on);
    $('#tlToggle').classList.toggle('pri', on);
    document.querySelector('.app').classList.toggle('tlFocus', on);   // 사이드바 숨기고 타임라인·지도에 집중
    const gd = $('#camGuide'); if (gd) gd.style.display = on ? '' : 'none';
    const ke = $('#camKeyEditor'); if (ke) ke.style.display = on ? '' : 'none';
    syncMapAltHint();   // 추출 모드 on/off에 맞춰 좌하단 Alt 조작법 표시 갱신
    syncCamGuidePos();  // 카메라 안내를 타임라인 위(하단)에 맞춘다

    updateFrameGuideLabel();
    if (typeof applyToolbarPos === 'function') applyToolbarPos();
    if (on) { dropStaleTracks(); buildTimeline(); }
    else { animStop(); animOff(); S.map3d = CAM3D_DEFAULT(); applyTilt(); }   // 닫으면 편집은 평면으로
  };
  $('#tlToggle').onclick = () => tlShow(!$('#timeline').classList.contains('on'));
  $('#tlClose').onclick = () => tlShow(false);
  $('#tlPlay').onclick = animPlay;
  $('#tlStop').onclick = () => { animStop(); animSeek(0); };
  $('#tlAuto').onclick = autoTracks;
  // 카메라 키 — 현재 시각(플레이헤드)에 지금 지도 위치·확대를 저장(같은 시각이면 갱신)
  $('#tlCamKey').onclick = () => {
    const t = +(tlHeadT || 0);   // 재생헤드 위치(지도 이동으로 animT가 null 돼도 유지)
    pushUndo();
    const ks = camKeys();
    const R = camRot();
    const snap = { t: +t.toFixed(2), x: Math.round(S.map.x), y: Math.round(S.map.y), s: +(+S.map.s).toFixed(4), rx: +R.rx.toFixed(1), ry: +R.ry.toFixed(1), rz: +R.rz.toFixed(1) };
    const near = ks.find((k) => Math.abs(k.t - t) < 0.05);
    if (near) Object.assign(near, snap); else ks.push({ id: 'c' + (seq++), ...snap });
    const end = Math.max(anim().dur, ...ks.map((x) => x.t));
    if (end > anim().dur) anim().dur = Math.ceil((end + 0.4) * 2) / 2;
    buildTimeline();
    status(`카메라 키 ${snap.t}s 저장 · 위치(${snap.x},${snap.y}) 확대 ×${snap.s.toFixed(2)}` + (ks.length < 2 ? ' — 다른 시각에 하나 더 찍으면 사이가 애니메이션됩니다' : ''));
  };
  $('#tlCamDel').onclick = () => {
    const t = +(tlHeadT || 0), ks = camKeys();
    if (!ks.length) { status('카메라 키가 없습니다', true); return; }
    let bi = -1, bd = 1e9; ks.forEach((k, i) => { const d = Math.abs(k.t - t); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0 && bd < 0.3) { pushUndo(); ks.splice(bi, 1); buildTimeline(); animSeek(t); status('카메라 키 삭제'); }
    else status('현재 시각 근처에 카메라 키가 없습니다 (키를 클릭해 이동 후 삭제)', true);
  };
  $('#tlReset').onclick = () => {
    pushUndo();
    animStop();
    S.anim = { dur: 6, fps: 29.97, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [] };   // 모든 키·트랙·설정 초기화(카메라 키=anim.cam도 함께 사라짐)
    camKeyEditorSel = null; const p = document.querySelector('#camKeyPop'); if (p) p.remove();
    tlHeadT = 0; animOff();   // 재생헤드·애니 상태 리셋 → 평소 화면
    buildTimeline(); tlNote();
    status('타임라인 초기화됨 — 키·트랙·설정 모두 지움 (되돌리기 Ctrl+Z)');
  };
  $('#tlBake').onclick = bakeMp4;
  $('#tlExportPng').onclick = exportPngSeq;
  if ($('#wnsMxf')) $('#wnsMxf').onclick = () => wnsRender('mxf');
  if ($('#wnsMov')) $('#wnsMov').onclick = () => wnsRender('mov');
  updateWnsButtons();   // 노말 VF + 로컬일 때만 버튼 노출
  $('#tlDur').onchange = (e) => { pushUndo(); anim().dur = Math.max(0.5, +e.target.value || 6); buildTimeline(); };
  $('#tlFps').onchange = (e) => { pushUndo(); anim().fps = parseFloat(e.target.value) || 29.97; tlNote(); };
  const syncBlindOpts = () => { $('#blindOpts').style.display = (anim().reveal === 'blinds') ? 'inline-flex' : 'none'; };
  $('#tlReveal').onchange = (e) => { pushUndo(); anim().reveal = e.target.value; syncBlindOpts(); animSeek(animT == null ? 0 : animT); };
  const onBlind = () => { pushUndo(); anim().blindSize = Math.max(8, +$('#tlBlindSize').value || 8); anim().blindAngle = +$('#tlBlindAngle').value || 0; animSeek(animT == null ? 0 : animT); };
  $('#tlBlindSize').oninput = onBlind;
  $('#tlBlindAngle').oninput = onBlind;
  // 눈금자를 누르면 그 시각으로
  const scrub = (e) => {
    const r = $('#tlRuler').getBoundingClientRect();
    animStop();
    const pps = tlPxPerSec();
    let t = (e.clientX - r.left) / pps;   // 눈금자는 그리드와 함께 가로 스크롤 → rect.left에 scrollLeft가 이미 반영됨
    t = Math.max(0, Math.min(anim().dur, t));
    if (e.shiftKey) {   // Shift = 모든 키(카메라·경로·라벨·클립)와 0초·끝에 스냅
      const snapTs = timelineSnapTimes();
      const thr = 10 / pps; let best = null, bd = thr;
      for (const st of snapTs) { const d = Math.abs(st - t); if (d < bd) { bd = d; best = st; } }
      if (best != null) t = best;
    }
    animSeek(t);
  };
  $('#tlRuler').addEventListener('pointerdown', (e) => {
    scrub(e);
    const mv = (ev) => scrub(ev);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
  // 높이 조절
  $('#tlGrip').addEventListener('pointerdown', (e) => {
    const y0 = e.clientY, h0 = tlH;
    const mv = (ev) => {
      tlH = Math.max(120, Math.min(window.innerHeight - titleBarH() - 120, h0 - (ev.clientY - y0)));   // 제목줄 높이만큼 덜 — 플로팅 바·제목줄 쪽으로 너무 안 올라오게
      $('#timeline').style.height = tlH + 'px';
      syncCamGuidePos();   // 타임라인 높이 바뀌면 카메라 안내도 따라 올라가게
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      buildTimeline();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  });

  $('#mPaint').onclick = () => setMode('paint');
  $('#mBrush').onclick = () => setMode('brush');
  $('#mMove').onclick = () => setMode('move');
  // 브러쉬 설정
  const brSync = () => { $('#brSizeV').textContent = S.brush.size; $('#brOpV').textContent = S.brush.op; $('#brSoftV').textContent = S.brush.soft;
    $('#brSize').value = S.brush.size; $('#brOp').value = S.brush.op; $('#brSoft').value = S.brush.soft;
    $('#brErase').classList.toggle('pri', brushErase); $('#brErase').textContent = brushErase ? '지우개 켜짐' : '지우개 브러쉬'; };
  $('#brSize').oninput = (e) => { S.brush.size = +e.target.value; $('#brSizeV').textContent = S.brush.size; };
  $('#brOp').oninput = (e) => { S.brush.op = +e.target.value; $('#brOpV').textContent = S.brush.op; };
  $('#brSoft').oninput = (e) => { S.brush.soft = +e.target.value; $('#brSoftV').textContent = S.brush.soft; };
  $('#brErase').onclick = () => { brushErase = !brushErase; brSync(); if (mode !== 'brush') setMode('brush'); };
  $('#brClear').onclick = () => { if (!brushStrokes().length) return; pushUndo(); S.brushByStyle[S.style] = []; renderBrush(); saveWork(); status('브러쉬 전부 지움'); };
  brSync();
  $('#undo').onclick = undo;
  $('#redo').onclick = redo;
  // (선택 삭제·화면 맞춤 버튼은 상단바에서 제거 — Delete 키·더블클릭 화면맞춤 등은 그대로)
  // 사이드바 밝기. 작업물(CG)과는 무관하니 작업 내용이 아니라 이 브라우저에 저장한다.
  const setTheme = (t) => {
    document.documentElement.dataset.theme = t;
    localStorage.setItem('wcg_theme', t);
    $('#theme').setAttribute('aria-checked', t === 'light' ? 'true' : 'false');
    syncTitleBarColors();   // 데스크톱: 창 버튼 색도 제목줄에 맞춤
  };
  setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  $('#theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  watchTitleBarDim();   // 데스크톱: 모달·둘러보기 막이 뜨면 창 버튼 자리도 같이 어둡게

  setupCgSetup();   // CG 구성 창(CG 종류 + 지도 종류 → 선택 완료)
  { const tg = $('#presetMoreToggle'), bd = $('#presetMoreBody');
    if (tg && bd) tg.onclick = () => { const open = bd.classList.toggle('open'); tg.setAttribute('aria-expanded', open ? 'true' : 'false'); }; }
  $('#savePreset').onclick = async () => {
    const key = presetKey();
    // 내 브라우저에 '직접 저장'해 둔 배치가 있을 때만 덮어쓰기 경고(배포 기본배치와 구분)
    let mine = false;
    try { const raw = localStorage.getItem('wcg_presets'); mine = !!(raw && JSON.parse(raw)[key]); } catch (e) { /* 무시 */ }
    const ok = await tossConfirm({
      title: '이 화면 기본값으로 저장',
      message: `지금 배치를 [${presetLabel(key)}] 화면의 기본 배치로 저장할까요?`
        + (mine ? '\n\n이 화면에 저장해 둔 기본 배치를 덮어씁니다.' : ''),
      ok: mine ? '덮어쓰기' : '저장', danger: mine,
    });
    if (ok) savePreset();
  };
  // 내가 이 브라우저에 저장한 배치를 전부 지우고 배포 기본배치(default-presets.js=WCG_DEFAULTS)로 복귀.
  $('#restoreDefaults').onclick = async () => {
    const mine = (() => { try { const r = localStorage.getItem('wcg_presets'); return !!(r && r !== '{}'); } catch (e) { return false; } })();
    if (!mine) { if (cgSetupIsOpen()) cgsStatus('이 브라우저엔 따로 저장한 배치가 없습니다 — 이미 모두의 기본 배치입니다'); else status('이 브라우저엔 따로 저장한 배치가 없습니다 — 이미 모두의 기본 배치입니다', true); return; }
    const ok = await tossConfirm({
      title: '모두의 기본 배치로 되돌리기',
      message: '이 브라우저에 내가 저장한 배치를 모두 지우고, 배포된 기본 배치로 되돌릴까요?\n\n다른 사람 화면에는 영향이 없습니다.',
      ok: '되돌리기', danger: true,
    });
    if (!ok) return;
    pushUndo();
    localStorage.removeItem('wcg_presets');   // 로컬 덮어쓰기 제거 → loadPresets()가 WCG_DEFAULTS를 쓴다
    S.vfScales = {};                         // 작업 중 공유값도 비워 배포 기본 VF 크기로 복귀
    applyPreset();
    cgsStatus('모두의 기본 배치로 되돌렸습니다');   // CG 구성 창 안에서 누른 버튼 — 창이 떠 있으면 창 안 토스트로
  };
  $('#bakeDefaults').onclick = bakeDefaults;
  $('#vfScale').oninput = (e) => {
    pushUndo('vfScale');
    setVfScale(e.target.value);
    $('#vfScaleV').textContent = S.vfScale + '%';
    renderVfScale();
    if (isTyphoon() && camTiltOn()) { renderTyphoon(); applyTilt(); }   // 3D 회전 중이면 라벨·지시선·지명 투영과 지도 래스터가 VF 크기에 따라 바뀜
  };
  // 노말 VF 제목 바 컨트롤
  $('#vfBarOn').onchange = (e) => { pushUndo(); (S.vfBar ||= {x:1140,y:150,w:640,h:110}).on = e.target.checked ? 1 : 0; renderVfBar(); };
  const vfw = (id, key) => { $(id).oninput = (e) => { pushUndo('vfbar'); (S.vfBar ||= {on:1,x:1140,y:150,w:640,h:110})[key] = Math.round(+e.target.value) || 0; renderVfBar(); }; };
  vfw('#vfBarX', 'x'); vfw('#vfBarY', 'y'); vfw('#vfBarW', 'w'); vfw('#vfBarH', 'h');
  const vfsh = (id, key, vid) => { $(id).oninput = (e) => { pushUndo('vfbarsh'); (S.vfBar ||= {})[key] = +e.target.value; $(vid).textContent = e.target.value; renderVfBar(); }; };
  vfsh('#vfBarShOp', 'shOp', '#vfBarShOpV'); vfsh('#vfBarShBlur', 'shBlur', '#vfBarShBlurV'); vfsh('#vfBarShDy', 'shDy', '#vfBarShDyV');
  $('#nbrOp').oninput = (e) => { pushUndo('nbrOp'); S.nbrOp = +e.target.value; $('#nbrOpV').textContent = S.nbrOp; renderBg(); };
  $('#nbrGrow').oninput = (e) => { pushUndo('nbrGrow'); S.nbrGrow = +e.target.value; $('#nbrGrowV').textContent = S.nbrGrow; renderBg(); };
  for (const b of document.querySelectorAll('#cgMode button')) b.onclick = () => setCgMode(b.dataset.cg === 'light');
  $('#showBg').onchange = (e) => { S.showBg = e.target.checked ? 1 : 0; renderBg(); };
  $('#showGuide').onchange = (e) => { S.showGuide = e.target.checked ? 1 : 0; renderBg(); };
  $('#guideOp').oninput = (e) => { S.guideOp = +e.target.value; $('#guideOpV').textContent = S.guideOp; renderBg(); };
  $('#showNW').onchange = (e) => { pushUndo(); S.showNW = e.target.checked ? 1 : 0; renderBg(); };
  $('#showJP').onchange = (e) => { pushUndo(); S.showJP = e.target.checked ? 1 : 0; renderBg(); };

  $('#bgFile').onclick = () => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    i.onchange = () => {
      const r = new FileReader();
      r.onload = () => {
        pushUndo();
        bgOverride = r.result; bgUseFile = 1;
        buildBgBtns();   // '교체한 것' 버튼이 생긴다 — 기본/비를 누르면 언제든 되돌아온다
        renderBg();
        status('배경 교체됨 — 기본/비를 누르면 원래 배경으로 돌아갑니다');
      };
      r.readAsDataURL(i.files[0]);
    };
    i.click();
  };

  const colorPair = (cId, hId, get, set, after) => {
    $(cId).oninput = (e) => { pushUndo('c' + cId); set(e.target.value.toUpperCase()); if (hId) $(hId).value = e.target.value.toUpperCase(); (after || renderAll)(); };
    if (hId) $(hId).onchange = (e) => { const v = hex(e.target.value.trim()); if (v) { pushUndo(); set(v); $(cId).value = v; (after || renderAll)(); } else $(hId).value = get(); };
  };
  colorPair('#nbrCol', '#nbrColHex', () => S.nbrCol, (v) => (S.nbrCol = v), renderBg);
  colorPair('#baseCol', '#baseColHex', () => S.base, (v) => (S.base = v), renderFills);
  colorPair('#strokeCol', '#strokeColHex', () => S.stroke, (v) => (S.stroke = v), renderFills);
  colorPair('#sidoCol', '#sidoColHex', () => S.sidoCol, (v) => (S.sidoCol = v), renderSidoLines);
  colorPair('#shCol', '#shColHex', () => S.shadow.col, (v) => (S.shadow.col = v), renderShadow);

  $('#strokeW').oninput = (e) => { pushUndo('strokeW'); S.strokeW = +e.target.value; renderFills(); };
  $('#sidoW').oninput = (e) => { pushUndo('sidoW'); S.sidoW = +e.target.value; renderSidoLines(); };
  $('#sggEye').onclick = () => { pushUndo(); S.sggOn = S.sggOn ? 0 : 1; renderFills(); syncEyes(); };
  $('#sidoEye').onclick = () => { pushUndo(); S.sidoOn = S.sidoOn ? 0 : 1; renderSidoLines(); syncEyes(); };
  $('#realEye').onclick = () => { pushUndo(); S.realOn = S.realOn ? 0 : 1; renderZoneLines(); syncEyes(); };
  $('#realW').oninput = (e) => { pushUndo('realW'); S.realW = +e.target.value; renderZoneLines(); };
  $('#realOp').oninput = (e) => { pushUndo('realOp'); S.realOp = +e.target.value; $('#realOpV').textContent = S.realOp; renderZoneLines(); };
  colorPair('#realCol', '#realColHex', () => S.realCol, (v) => (S.realCol = v), renderZoneLines);
  $('#sggOp').oninput = (e) => { pushUndo('sggOp'); S.sggOp = +e.target.value; $('#sggOpV').textContent = S.sggOp; renderFills(); };

  $('#seaBaseOp').oninput = (e) => { pushUndo('seaBaseOp'); S.seaBaseOp = +e.target.value; $('#seaBaseOpV').textContent = S.seaBaseOp; renderSea(); };
  $('#seaFade').oninput = (e) => { pushUndo('seaFade'); S.seaFade = +e.target.value; $('#seaFadeV_').textContent = S.seaFade; renderSea(); };
  $('#seaW').oninput = (e) => { pushUndo('seaW'); S.seaW = +e.target.value; renderSea(); };
  colorPair('#seaCol', '#seaColHex', () => S.seaCol, (v) => (S.seaCol = v), renderSea);
  colorPair('#seaBase', '#seaBaseHex', () => S.seaBase, (v) => (S.seaBase = v), renderSea);
  $('#seaClear').onclick = () => { pushUndo(); S.seaFills = {}; renderSea(); };

  $('#wrnApply').onclick = () => applyWrn($('#wrnPaste').value, null, 'paste');
  $('#wrnFetch').onclick = () => fetchWrn();   // 인자 없이(=목록 새로 만듦). onclick이 이벤트를 keepSel로 넘기지 않게 감쌈.
  // 발효시각을 고르면 그 시각으로 '재요청'해서 정확한 발효현황을 받아 칠한다(picker와 동일). 목록은 그대로 둠.
  { const bs = $('#wrnBulletinSel'); if (bs) bs.onchange = async () => {
      const v = bs.value, prevWhen = wrnWhen, prevFc = wrnSelFc;
      wrnWhen = (v === '__NOW__') ? '' : v;
      reflectWhenToPicker();
      // __NOW__는 목록도 새로, 특정시각은 목록 유지(keepSel). 다시 시도 = 같은 시각을 다시 고르기.
      const back = wrnWhen === prevWhen ? '' : prevWhen ? wrnTmText(prevWhen) : '지금';   // 실패하면 아래에서 이 시각으로 되돌린다
      const ok = await fetchWrn(v === '__NOW__' ? null : v, () => { bs.value = v; bs.onchange(); }, { back });
      if (ok === false) {
        // 못 불러왔으면 지도는 이전 그대로다 — 목록·시각 표시도 지도에 칠해진 시각으로 되돌려 서로 어긋나 보이지 않게
        wrnWhen = prevWhen; reflectWhenToPicker();
        if (prevFc && [...bs.options].some((o) => o.value === prevFc)) bs.value = prevFc;
      }
    }; }

  // 인증키는 이 브라우저에만 둔다 — 프로젝트 JSON이나 배포 파일에 섞여 나가면 안 된다.
  // 넣는 곳은 API 설정 한 군데뿐이고, 특보·예보 항목은 없으면 그리로 보내기만 한다.
  $('#apiKey').value = (localStorage.getItem(WRN_KEY_STORE) || '').trim();   // 비어 있으면 내장 기본키를 쓴다
  $('#apiKey').oninput = (e) => { localStorage.setItem(WRN_KEY_STORE, e.target.value.trim()); syncKeyWarn(); };
  syncKeyWarn();

  // 언제 특보 — '지금'이면 tm을 비우고, '지난 날짜'면 그 시각을 넣는다
  // '발효 현황' 라벨만 새 시각으로 갱신. 실제 색칠은 '기상청에서 불러오기'가 그 시각으로 재요청해 정확히 받아온다.
  // (한 번 받은 데이터를 다른 시각으로 로컬 재계산하면 열대야 자동해제 등이 안 맞아 틀림 → 재요청이 정답)
  const syncNowLabel = () => {
    if (!wrnLoaded) return;   // 한 번 읽었으면(발효 특보 0건이어도) 라벨 갱신
    const sel = $('#wrnBulletinSel');
    const opt = sel && [...sel.options].find((o) => o.value === '__NOW__');
    if (opt) opt.textContent = wrnEffLabel();
  };
  // 날짜·시각 칸만 w 시각으로 보여 준다(지도에 칠해진 시각 wrnWhen은 그대로)
  const showPickerAt = (w) => { const keep = wrnWhen; wrnWhen = w; reflectWhenToPicker(); wrnWhen = keep; };
  const syncWhen = (reapply) => {
    const prevWhen = wrnWhen;   // 지금 지도에 칠해진 시각
    const past = $('#wrnPastRow').style.display !== 'none';
    $('#wrnWhenNow').classList.toggle('pri', !past);
    $('#wrnWhenPast').classList.toggle('pri', past);
    if (!past) { wrnWhen = ''; }
    else { const d = $('#wrnDate').value, t = $('#wrnTime').value || '00:00'; wrnWhen = d ? d.replace(/-/g, '') + t.replace(':', '') : ''; }
    syncNowLabel();
    // reapply=true면 그 시각으로 바로 재요청(picker 조작 시 사용자가 기대하는 동작).
    if (reapply && wrnLoaded) {
      const want = wrnWhen;
      // 못 불러오면 지도는 이전 시각 그대로다 — 통보문 고르기처럼 '지금/지난 날짜'·날짜 칸·'발효 현황' 라벨도 지도 시각으로 되돌린다.
      // 다시 시도 = 고르려던 시각을 칸에 다시 채우고 같은 동작 반복.
      const back = want === prevWhen ? '' : prevWhen ? wrnTmText(prevWhen) : '지금';   // 같은 시각을 다시 부른 거면 되돌릴 게 없다
      fetchWrn(null, () => { showPickerAt(want); syncWhen(true); }, { back }).then((ok) => {
        if (ok !== false || wrnWhen !== want) return;   // 칠했거나, 그새 다른 시각을 골랐으면 그대로
        wrnWhen = prevWhen; reflectWhenToPicker(); syncNowLabel();
      });
    }
  };
  $('#wrnWhenNow').onclick = () => { $('#wrnPastRow').style.display = 'none'; syncWhen(true); };
  $('#wrnWhenPast').onclick = () => {
    $('#wrnPastRow').style.display = '';
    if (!$('#wrnDate').value) {
      // 기본값은 어제 — '지난 날짜'를 누르는 사람이 가장 자주 찾는 날이다
      const y = new Date(Date.now() - 864e5);
      $('#wrnDate').value = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      $('#wrnTime').value = '09:00';
    }
    syncWhen(true);
  };
  $('#wrnDate').onchange = () => syncWhen(true);
  $('#wrnTime').onchange = () => syncWhen(true);
  syncWhen();

  $('#wrnOpen').onclick = () => {
    if (!apiKey()) { apiPop(true); status('인증키를 먼저 넣어주세요'); return; }
    syncWhen();
    window.open(WRN_URL(), '_blank', 'noopener');
    status(wrnWhen ? `${tmShort(wrnWhen)} 특보 — Ctrl+A → Ctrl+C 해서 아래에 붙여넣으세요`
                   : '새 창에서 Ctrl+A → Ctrl+C 하고 아래에 붙여넣으세요');
  };

  // ---- 기상예보 ----
  buildFctKindBtns();
  const syncFctWhen = () => {
    const past = $('#fctPastRow').style.display !== 'none';
    $('#fctWhenNow').classList.toggle('pri', !past);
    $('#fctWhenPast').classList.toggle('pri', past);
    const d = past ? $('#fctDate').value : '';
    fctWhen = d ? d.replace(/-/g, '') : '';
  };
  $('#fctWhenNow').onclick = () => { $('#fctPastRow').style.display = 'none'; syncFctWhen(); };
  $('#fctWhenPast').onclick = () => {
    $('#fctPastRow').style.display = '';
    if (!$('#fctDate').value) {
      const y = new Date(Date.now() - 864e5);
      $('#fctDate').value = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    }
    syncFctWhen();
  };
  $('#fctDate').onchange = syncFctWhen;
  syncFctWhen();

  $('#fctOpen').onclick = () => {
    if (!apiKey()) { apiPop(true); status('인증키를 먼저 넣어주세요'); return; }
    syncFctWhen();
    // 하루치를 통째로 받아서, 발표시각은 받아온 뒤 목록에서 고르게 한다.
    // 발표시각을 미리 맞춰 넣게 하면 05/11/17시를 외우고 있어야 한다.
    const day = fctWhen || (() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; })();
    window.open(apiUrl(FCT_KINDS[fctKind].api, { TM1: day + '0000', TM2: day + '2359' }), '_blank', 'noopener');
    status('새 창에서 Ctrl+A → Ctrl+C 하고 아래에 붙여넣으세요');
  };
  $('#fctApply').onclick = () => applyFct($('#fctPaste').value);
  $('#bulApply').onclick = () => applyBulletin($('#bulPaste').value);
  // 통보문 불러오기·날짜 고르기·통째 붙여넣기·데스크톱 날씨누리 창 읽기 (js/bulletin-load.js)
  $('#bulLoad').onclick = () => fetchBulletin();
  $('#bulPick').onchange = (e) => bulPickFill(e.target.value);
  $('#bulPaste').onpaste = bulOnPaste;
  if (bulHasWnd()) {   // 데스크톱(새 판): '단기예보 열기'를 앱 안 창으로 — 뜰 때마다 통보문을 읽어 온다
    const a = $('#bulOpen');
    if (a) { a.title = '앱 안 창으로 열고, 통보문을 바로 읽어 와요'; a.onclick = (e) => { e.preventDefault(); bulOpenPage(); }; }
    if (typeof window.wcgDesktop.onWnuri === 'function') window.wcgDesktop.onWnuri(bulFromWnuri);
  }
  const bulSoft = $('#bulSoft');
  if (bulSoft) { bulSoft.checked = !!S.softFill; bulSoft.onchange = (e) => { pushUndo(); S.softFill = e.target.checked ? 1 : 0; renderFills(); }; }
  // 통보문 복사 안내 팝업
  const bulHelpPop = $('#bulHelpPop');
  const openBulHelp = () => {
    const img = $('#bulHelpImg');
    if (!img.src && IMG.bulHelp) img.src = IMG.bulHelp;   // 처음 열 때만 이미지 붙인다
    const wasOpen = bulHelpPop.classList.contains('on') && !bulHelpPop.classList.contains('popClosing');
    popAnimCancel(bulHelpPop);
    bulHelpPop.classList.add('on');
    if (!wasOpen) popFocusIn(bulHelpPop, bulHelpPop.querySelector('.imgPopInner'));   // 포커스를 안내 카드로(닫으면 '복사할 부분 보기'로 돌아감)
  };
  const closeBulHelp = () => { if (!bulHelpPop.classList.contains('popClosing')) { popAnimClose(bulHelpPop, () => bulHelpPop.classList.remove('on')); popFocusBack(bulHelpPop); } };
  $('#bulHelpBtn').onclick = openBulHelp;
  $('#bulHelpClose').onclick = closeBulHelp;
  bulHelpPop.addEventListener('click', (e) => { if (e.target === bulHelpPop) closeBulHelp(); }); // 바깥 클릭 닫기
  window.addEventListener('keydown', (e) => {
    if (!bulHelpPop.classList.contains('on') || bulHelpPop.classList.contains('popClosing')) return;
    if (e.key === 'Escape') closeBulHelp();
    else if (e.key === 'Tab') popTrapTab(bulHelpPop.querySelector('.imgPopInner'), e);   // Tab = 안내 카드 안에서만
  });
  $('#fctTmfc').onchange = () => { buildFctEf(); buildFctList(); paintFct(); };
  $('#fctTmef').onchange = () => { buildFctList(); paintFct(); };
  $('#fctTaField').onchange = (e) => { fctTaField = e.target.value; buildFctList(); paintFct(); };
  $('#fctTaStep').onchange = (e) => { fctTaStep = +e.target.value; buildFctList(); paintFct(); };
  $('#fctClear').onclick = () => {
    pushUndo();
    S.fillsByStyle.sgg = {}; S.fillsByStyle.sido = {};
    renderFills();
    $('#fctInfo').textContent = '';
    status('예보 색 지움');
  };
  // '기상청 예보 API로 색칠' 묶음 — 잘 안 써서 기본 접힘. 제목 줄을 누르면 펼침/접힘, 펼침 상태만 기억한다.
  // (localStorage가 막혀도(시크릿·로드 실패 가드) 접힌 채로 그냥 동작하게 try/catch. 마크업 기본값이 접힘이라 첫 화면에 접히는 애니가 안 뜬다)
  {
    const head = $('#fctFoldHead'), fold = $('#fctFold'), KEY = 'wcg_fct_api_open';
    if (head && fold) {
      const setOpen = (open) => { fold.classList.toggle('closed', !open); head.setAttribute('aria-expanded', open ? 'true' : 'false'); };
      let open = false;
      try { open = localStorage.getItem(KEY) === '1'; } catch (e) {}
      setOpen(open);
      head.onclick = () => {
        const next = fold.classList.contains('closed');
        setOpen(next);
        try { localStorage.setItem(KEY, next ? '1' : '0'); } catch (e) {}
      };
    }
  }

  // ---- API 설정 (우하단 플로팅) ----
  $('#apiGear').onclick = () => apiPop(!$('#apiPop').classList.contains('on'));
  // 안내를 누르면 바로 거기로 데려간다 — "어디서 넣나요"를 묻게 하면 안 된다
  for (const n of document.querySelectorAll('[data-nokey]')) n.onclick = () => apiPop(true);
  $('#apiClose').onclick = () => apiPop(false);
  $('#apiSite').onclick = () => window.open(API_SITE, '_blank', 'noopener');
  // 바깥을 누르면 닫힌다 — 열어둔 채로 잊어버리면 캔버스를 가린다
  document.addEventListener('pointerdown', (e) => {
    if (!$('#apiPop').classList.contains('on')) return;
    if (e.target.closest('#apiPop') || e.target.closest('#apiGear')) return;
    apiPop(false);
  });
  $('#wrnClear').onclick = () => {
    pushUndo();
    S.fillsByStyle.warn = {}; S.fillsByStyle.warnsea = {}; S.seaFills = {};
    renderFills(); renderSea();
    $('#wrnInfo').textContent = '';
    showWrnResult(null);   // '몇 구역 칠함' 결과 카드가 지운 지도와 어긋나지 않게
    status('특보 색 지움');
  };
  $('#sidoOp').oninput = (e) => { pushUndo('sidoOp'); S.sidoOp = +e.target.value; $('#sidoOpV').textContent = S.sidoOp; renderSidoLines(); };

  for (const [id, key] of [['#shX', 'x'], ['#shY', 'y'], ['#shBlur', 'blur'], ['#shOp', 'op']]) {
    $(id).oninput = (e) => {
      pushUndo('shadow' + key);
      S.shadow[key] = +e.target.value;
      $(id + 'V').textContent = e.target.value;
      renderShadow();
    };
  }

  $('#baseUse').onclick = () => setActive(S.base);

  // 현재 색을 hex로 직접 타이핑
  $('#curHex').onchange = (e) => { const v = hex(e.target.value.trim()); if (v) setActive(v); else markActive(); };
  // 팔레트 추가: 색상판 또는 hex 입력 둘 다
  $('#newCol').oninput = (e) => { $('#newColHex').value = e.target.value.toUpperCase(); };
  $('#newColHex').onchange = (e) => { const v = hex(e.target.value.trim()); if (v) $('#newCol').value = v; };
  $('#addCol').onclick = () => {
    const v = hex($('#newColHex').value.trim()) || $('#newCol').value.toUpperCase();
    if (!customCols.includes(v)) { customCols.push(v); saveCustom(); buildCustom(); }
    setActive(v);
  };
  $('#clearAll').onclick = () => { if (confirm('칠한 색을 전부 지울까요?')) { pushUndo(); S.fillsByStyle[S.style] = {}; renderFills(); } };


  $('#addText').onclick = () => {
    pushUndo();
    // 어두운 모드 흰 글씨는 기본 semibold(600), 밝은 모드는 700
    const t = { id: 'x' + seq++, txt: '새 텍스트', x: 200, y: 600, size: 48, w: S.cgLight ? 700 : 600, col: S.cgLight ? '#071251' : '#FFFFFF', track: -2, align: 'start' };
    S.texts.push(t); renderTexts(); select('text', t.id);
  };
  const curT = () => { const s = one(); return s && s.kind === 'text' ? itemOf(s) : null; };
  const tw = (id, key, cast) => { $(id).oninput = (e) => {
    const t = curT(); if (!t) return;
    pushUndo('t' + key); t[key] = cast ? cast(e.target.value) : e.target.value;
    renderTexts(); renderSel(); buildTextList();
  }; };
  tw('#tTxt', 'txt'); tw('#tSize', 'size', Number); tw('#tTrack', 'track', Number);
  tw('#tX', 'x', Number); tw('#tY', 'y', Number);
  $('#tWeight').onchange = (e) => { const t = curT(); if (!t) return; pushUndo(); t.w = +e.target.value; renderTexts(); renderSel(); };
  $('#tAlign').onchange = (e) => { const t = curT(); if (!t) return; pushUndo(); t.align = e.target.value; renderTexts(); renderSel(); };
  $('#tCol').oninput = (e) => { const t = curT(); if (!t) return; pushUndo('tcol'); t.col = e.target.value.toUpperCase(); $('#tColHex').value = t.col; renderTexts(); buildTextList(); };
  $('#tColHex').onchange = (e) => { const v = hex(e.target.value.trim()); const t = curT(); if (v && t) { pushUndo(); t.col = v; $('#tCol').value = v; renderTexts(); buildTextList(); } };

  $('#addLabel').onclick = () => {
    pushUndo();
    S.labels.push(newLabel({ x: 780, y: 600, fill: activeColor }));
    const b = S.labels[S.labels.length - 1];
    renderLabels(); select('label', b.id);
  };
  const curL = () => { const s = one(); return s && s.kind === 'label' ? itemOf(s) : null; };
  const lw = (id, key, cast) => { $(id).oninput = (e) => {
    const b = curL(); if (!b) return;
    pushUndo('l' + key); b[key] = cast ? cast(e.target.value) : e.target.value;
    renderLabels(); renderSel(); buildLabelList();
  }; };
  lw('#lSize', 'size', Number); lw('#lPadX', 'padX', Number);
  lw('#lPadY', 'padY', Number); lw('#lRadius', 'radius', Number); lw('#lStrokeW', 'strokeW', Number);
  if ($('#lLabelStyle')) $('#lLabelStyle').onchange = (e) => {
    const b = curL(); if (!b) return;
    pushUndo('lstyle'); b.style = e.target.value === 'leader' ? 'leader' : 'plain';
    if (b.style === 'leader' && b.ax == null) { b.ax = Math.round(b.x); b.ay = Math.round(b.y + 170); }   // 앵커 초기 위치
    renderLabels(); renderSel();
  };
  // 내용 편집 — 글자를 바꾸면 부분 서식(runs)은 초기화(혼동 방지)
  wireImeText($('#lTxt'), (v) => { const b = curL(); if (!b) return; pushUndo('ltxt'); b.txt = v; if (b.runs) b.runs = null; renderLabels(); renderSel(); buildLabelList(); });   // IME 안전: 조합 중 buildLabelList 재생성으로 한글 끊기던 것 방지
  // 부분 서식 — 내용칸에서 선택한 구간을 기억했다가 색/굵기 적용
  let lTxtSel = null;
  const rememberSel = () => { const i = $('#lTxt'); lTxtSel = { s: i.selectionStart, e: i.selectionEnd }; };
  $('#lTxt').addEventListener('select', rememberSel);
  $('#lTxt').addEventListener('keyup', rememberSel);
  $('#lTxt').addEventListener('mouseup', rememberSel);
  const applyRun = (attr, val) => {
    const b = curL(); if (!b) return;
    if (!lTxtSel || lTxtSel.s == null || lTxtSel.s >= lTxtSel.e) { status('내용칸에서 글자를 먼저 드래그해 선택하세요', true); return; }
    pushUndo('lrun');
    const arr = labelCharAttrs(b);
    for (let i = lTxtSel.s; i < lTxtSel.e && i < arr.length; i++) arr[i][attr] = val;
    b.runs = labelRunsFromChars(arr);
    renderLabels(); renderSel();
  };
  $('#lRunColApply').onclick = () => applyRun('col', $('#lRunCol').value.toUpperCase());
  $('#lRunWApply').onclick = () => applyRun('w', +$('#lRunW').value);
  $('#lRunClear').onclick = () => { const b = curL(); if (!b) return; pushUndo('lrunclr'); b.runs = null; renderLabels(); renderSel(); };
  lw('#lX', 'x', Number); lw('#lY', 'y', Number); lw('#lTrack', 'track', Number);
  lw('#lTitle', 'title');
  $('#lTitleR').oninput = (e) => { const b = curL(); if (!b) return; pushUndo('ltitleR'); b.titleRatio = (+e.target.value) / 100; $('#lTitleRV').textContent = e.target.value; renderLabels(); renderSel(); };
  $('#lDivider').onchange = (e) => { const b = curL(); if (!b) return; pushUndo(); b.divider = e.target.checked ? 1 : 0; renderLabels(); renderSel(); };
  $('#lWeight').onchange = (e) => { const b = curL(); if (!b) return; pushUndo(); b.w = +e.target.value; renderLabels(); renderSel(); };

  $('#labScale').oninput = (e) => {
    pushUndo('labScale');
    S.labScale = +e.target.value;
    $('#labScaleV').textContent = S.labScale;
    renderLabels(); renderSel();
  };
  $('#mtnScale').oninput = (e) => {
    pushUndo('mtnScale');
    S.mtnScale = +e.target.value;
    $('#mtnScaleV').textContent = S.mtnScale;
    renderMtns(); renderSel();
  };
  // 기상특보 범례
  $('#lgOn').onchange = (e) => { pushUndo(); (S.legend ||= { items: [] }).on = e.target.checked ? 1 : 0; if (e.target.checked) ensureLegendInVfPanel(); renderVfBar(); };
  $('#lgAuto').onchange = (e) => { pushUndo(); (S.legend ||= {}).auto = e.target.checked ? 1 : 0; syncLegendMode(); renderVfBar(); };
  $('#lgHoriz').onchange = (e) => { pushUndo(); (S.legend ||= {}).horiz = e.target.checked ? 1 : 0; renderVfBar(); };
  { const h = $('#lgHorizTy'); if (h) h.onchange = (e) => { pushUndo(); (S.legend ||= {}).horiz = e.target.checked ? 1 : 0; renderLegend(); renderVfBar(); }; }
  $('#lgAdd').onclick = () => { pushUndo(); const g = (S.legend ||= { items: [] }); (g.items ||= []).push({ col: activeColor, txt: '' }); g.on = 1; $('#lgOn').checked = true; renderVfBar(); buildLgList(); };
  const lgw = (id, key, vid) => { $(id).oninput = (e) => { pushUndo('lg' + key); (S.legend ||= {})[key] = +e.target.value; if (vid) $(vid).textContent = e.target.value; renderVfBar(); }; };
  lgw('#lgSize', 'size', '#lgSizeV'); lgw('#lgBox', 'box', '#lgBoxV'); lgw('#lgRadius', 'radius', '#lgRadiusV'); lgw('#lgRowGap', 'rowGap', '#lgRowGapV'); lgw('#lgGap', 'gap', '#lgGapV'); lgw('#lgWeight', 'weight', '#lgWeightV');
  $('#lgTxtCol').oninput = (e) => { pushUndo('lgtc'); (S.legend ||= {}).txtCol = e.target.value.toUpperCase(); $('#lgTxtColHex').value = S.legend.txtCol; renderLegend(); };
  $('#lgTxtColHex').onchange = (e) => { const v = hex(e.target.value.trim()); if (v) { pushUndo(); (S.legend ||= {}).txtCol = v; $('#lgTxtCol').value = v; renderLegend(); } };
  $('#labShadow').onchange = (e) => { pushUndo(); S.labShadow = e.target.checked ? 1 : 0; renderShadow(); };
  $('#txtShadow').onchange = (e) => { pushUndo(); S.txtShadow = e.target.checked ? 1 : 0; renderShadow(); };
  $('#autoLabel').onclick = autoLabels;

  $('#addMtn').onclick = () => {
    pushUndo();
    // 지금 보이는 지도 한가운데쯤에 놓는다 — 화면 밖에 생기면 못 찾는다
    const m = newMtn({ x: Math.round(S.map.x - 60), y: Math.round(S.map.y - 40) });
    (S.mtns ||= []).push(m);
    renderMtns(); select('mtn', m.id);
  };
  const curM = () => { const s = one(); return s && s.kind === 'mtn' ? itemOf(s) : null; };
  const mw = (id, key, cast) => { $(id).oninput = (e) => {
    const m = curM(); if (!m) return;
    pushUndo('m' + key); m[key] = cast ? cast(e.target.value) : e.target.value;
    renderMtns(); renderSel(); buildMtnList();
  }; };
  mw('#mTxt', 'txt'); mw('#mSize', 'size', Number); mw('#mTxtSize', 'txtSize', Number);
  mw('#mX', 'x', Number); mw('#mY', 'y', Number); mw('#mStrokeW', 'strokeW', Number);
  $('#mStroke').oninput = (e) => { const m = curM(); if (!m) return; pushUndo('mstr'); m.stroke = e.target.value.toUpperCase(); renderMtns(); };
  $('#mOp').oninput = (e) => { const m = curM(); if (!m) return; pushUndo('mop'); m.op = +e.target.value; $('#mOpV').textContent = m.op; renderMtns(); };
  $('#mCol').oninput = (e) => { const m = curM(); if (!m) return; pushUndo('mcol'); m.col = e.target.value.toUpperCase(); $('#mColHex').value = m.col; renderMtns(); buildMtnList(); };
  $('#mColHex').onchange = (e) => { const v = hex(e.target.value.trim()); const m = curM(); if (v && m) { pushUndo(); m.col = v; $('#mCol').value = v; renderMtns(); buildMtnList(); } };
  $('#mTxtCol').oninput = (e) => { const m = curM(); if (!m) return; pushUndo('mtcol'); m.txtCol = e.target.value.toUpperCase(); renderMtns(); };

  for (const [c, h, key] of [['#lFill', '#lFillHex', 'fill'], ['#lTxtCol', '#lTxtColHex', 'txtCol'], ['#lStroke', null, 'stroke'], ['#lFill2', '#lFill2Hex', 'fill2'], ['#lStroke2', '#lStroke2Hex', 'stroke2']]) {
    $(c).oninput = (e) => { const b = curL(); if (!b) return; pushUndo('l' + key); b[key] = e.target.value.toUpperCase(); if (h) $(h).value = b[key]; renderLabels(); buildLabelList(); };
    if (h) $(h).onchange = (e) => { const v = hex(e.target.value.trim()); const b = curL(); if (v && b) { pushUndo(); b[key] = v; $(c).value = v; renderLabels(); buildLabelList(); } };
  }
  // 라벨 그라디언트 / 투명도 (유리 블러 기능 제거됨)
  $('#lFillGrad').onchange = (e) => { const b = curL(); if (!b) return; pushUndo(); b.fillGrad = e.target.checked ? 1 : 0; renderLabels(); renderSel(); };
  $('#lStrokeGrad').onchange = (e) => { const b = curL(); if (!b) return; pushUndo(); b.strokeGrad = e.target.checked ? 1 : 0; renderLabels(); renderSel(); };
  $('#lFillOp').oninput = (e) => { const b = curL(); if (!b) return; pushUndo('lfillop'); b.fillOp = +e.target.value; $('#lFillOpV').textContent = Math.round(e.target.value * 100) + '%'; renderLabels(); renderSel(); };
  $('#lGradAngle').oninput = (e) => { const b = curL(); if (!b) return; pushUndo('lgradangle'); b.gradAngle = +e.target.value; $('#lGradAngleV').textContent = e.target.value + '°'; renderLabels(); renderSel(); };
  document.querySelectorAll('[data-ins]').forEach((btn) => {
    btn.onclick = () => {
      const b = curL(); if (!b) return;
      pushUndo(); b.txt += btn.dataset.ins; $('#lTxt').value = b.txt; renderLabels(); buildLabelList();
    };
  });

  buildExportPick();
  buildMtnPresets();
  $('#doExport').onclick = doExport;
  // 전체 선택/해제 토글 — 다 선택돼 있으면 전부 해제, 아니면 전부 선택
  $('#exAll').onclick = () => {
    const allOn = EXPORT_TARGETS.every((t) => exportPick.has(t.key));
    exportPick = new Set(allOn ? [] : EXPORT_TARGETS.map((t) => t.key));
    buildExportPick();
    $('#exAll').textContent = EXPORT_TARGETS.every((t) => exportPick.has(t.key)) ? '전체 해제' : '전체 선택';
  };
  // 출력 폴더 지정/해제 — 지정하면 렌더·추출이 그 폴더로 바로 저장, 없으면 저장창.
  updateOutDirBtn();
  if ($('#exSetDir')) $('#exSetDir').onclick = async () => {
    if (await idbGet('outDir')) { await clearOutDir(); status('출력 폴더 해제 — 이제 저장할 때 위치를 고릅니다'); }
    else { const p = await pickOutDir(); if (!p) return; status('출력 폴더 지정: ' + p.name + ' — 이제 여기로 바로 저장됩니다'); }
    updateOutDirBtn();
  };
  // AE로 보내기 — 모두에게 노출(로컬 헬퍼로 동작, 헬퍼 꺼져 있으면 안내창).
  if ($('#aeSend')) { $('#aeSend').onclick = sendToAE; $('#aeSend').style.display = ''; }

  $('#newWork').onclick = () => {
    if (!confirm('지금 작업을 비우고 저장해 둔 기본 배치로 새로 시작할까요?')) return;
    stopAnimForSwap();   // 옛 작업의 카메라 백업이 새 작업 지도에 덮이지 않게
    pushUndo();
    markUndoFileSwap(projFileHandle, null);
    projFileHandle = null;   // 새 작업의 첫 저장은 위치를 다시 묻는다(이전 파일 덮어쓰기 방지)
    localStorage.removeItem(WORK_KEY);
    lastWork = '';
    // 출력화면(res)·레이아웃(style)·CG모드(cgLight)는 유지해야 프리셋 키가 맞아
    // 저장해 둔 기본 배치(섬 위치·폰트·색 전부)를 그대로 불러온다. 안 그러면 기본값 튐.
    const keepRes = S.res, keepStyle = S.style, keepLight = S.cgLight;
    S = DEFAULTS();
    S.res = keepRes; S.style = keepStyle; S.cgLight = keepLight;
    sel = [];
    resetWorkRuntime();   // 이전 작업의 특보·예보·통보문 목록도 비운다
    buildZones(); markStyleBtns(); markResBtns();
    if (!applyPreset()) {
      // 저장해 둔 배치가 없으면 최소한 그 모드 기본 색 세트라도 맞춰 준다.
      applyCgDefaults(keepLight);
      markCgMode(); buildBgBtns(); syncPanelFromState(); renderAll(); showPresetInfo();
    }
    _tiltRasterSig = null; applyTilt();   // 옛 작업의 기울인 지도 미리보기 잔재 제거
    localStorage.removeItem('wcg_started');           // 다시 빈 화면 + 선택 안내부터
    localStorage.setItem('wcg_pending_start', '1');   // 새로고침해도 'CG 종류·지도 종류 선택' 화면이 계속 뜨게(자동저장된 빈 작업을 로드하지 않도록)
    showStartScreen();
    status('새로 시작');
    setTimeout(() => { if (startScreenOn()) openCgSetup(); }, 160);   // 새로 시작했으면 바로 CG 구성 창을 띄워 고르게
  };

  $('#save').onclick = () => saveProject(false);   // 처음엔 위치 선택, 이후 같은 파일에 저장 (Ctrl+S와 동일)
  $('#load').onclick = openProject;
  { const ex = $('#exportSettings'), im = $('#importSettings'); if (ex) ex.onclick = exportSettings; if (im) im.onclick = importSettings; }
  const startLoadBtn = $('#startLoad'); if (startLoadBtn) startLoadBtn.onclick = openProject;
  const startSetupBtn = $('#startSetup'); if (startSetupBtn) startSetupBtn.onclick = openCgSetup;   // 시작 화면 'CG 구성 열기'
  $('#recentBtn').onclick = () => {
    const l = $('#recentList');
    l.classList.toggle('on');
    if (l.classList.contains('on')) buildRecentList();
  };
}

// ===================== 시작 =====================
try { customCols = JSON.parse(localStorage.getItem('wcg_custom') || '[]'); } catch (e) { customCols = []; }

// 사이드바 갈래 — 색 + 태그로 구분한다. 항목이 많아 그냥 나열하면 안 읽힌다.
const SEC_GRP = {
  out: ['pinned', '설정'],   // (CG 종류·지도 종류는 CG 구성 창으로 옮겨 사이드바 카드가 없다)
  res: ['map', '지도'], map: ['map', '지도'],
  pal: ['paint', '칠하기'],
  text: ['text', '글자'], label: ['text', '글자'], mtn: ['text', '글자'],
  sea: ['special', '특수'], wrn: ['special', '특수'], fct: ['special', '특수'], legend: ['special', '특수'], typhoon: ['special', '특수'], typhoonPlaces: ['special', '특수'],
  proj: ['proj', '파일'],
};
// 항목 제목의 아이콘. 채워진(filled) 모양으로 통일한다 — 24x24 기준 path.
// 외부 아이콘 폰트는 못 쓴다 (file:// 로도 열려야 하고 CSP도 막는다).
const SEC_ICON = {
  res: 'M3 4h18v16H3zm2.5 12.5h13l-4-5.5-3 4-2-2.5zM8 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z', // 이미지
  text: 'M4 4h16v3.2h-6.4V20h-3.2V7.2H4z',                                  // T
  wrn: 'M12 2L1.2 21h21.6zm-1.2 6h2.4v6h-2.4zm0 8h2.4v2.4h-2.4z',           // 경고
  fct: 'M6.6 19.5A4.6 4.6 0 016 10.4a6.4 6.4 0 0112.4-1.2 4.2 4.2 0 01-.6 10.3z', // 구름
  pal: 'M12 2C6.5 2 2 6.3 2 11.7c0 5.4 4.5 9.7 10 9.7 1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h1.7c2.9 0 5.3-2.3 5.3-5.2C22 5.6 17.5 2 12 2zM6 13a1.6 1.6 0 110-3.2A1.6 1.6 0 016 13zm3.2-4.2a1.6 1.6 0 110-3.2 1.6 1.6 0 010 3.2zm5.6 0a1.6 1.6 0 110-3.2 1.6 1.6 0 010 3.2zM18 13a1.6 1.6 0 110-3.2A1.6 1.6 0 0118 13z', // 팔레트
  sea: 'M2 15.2c1.8 0 1.8-1.6 3.6-1.6s1.8 1.6 3.6 1.6 1.8-1.6 3.6-1.6 1.8 1.6 3.6 1.6 1.8-1.6 3.6-1.6V17c-1.8 0-1.8 1.6-3.6 1.6S15 17 13.2 17s-1.8 1.6-3.6 1.6S7.8 17 6 17s-1.8 1.6-3.6 1.6zm0-6c1.8 0 1.8-1.6 3.6-1.6S7.4 9.2 9.2 9.2 11 7.6 12.8 7.6s1.8 1.6 3.6 1.6S18.2 7.6 20 7.6V11c-1.8 0-1.8 1.6-3.6 1.6S15 11 13.2 11s-1.8 1.6-3.6 1.6S7.8 11 6 11s-1.8 1.6-3.6 1.6z', // 물결
  map: 'M12 2l3.5 3.5h-2.3v5.3h5.3V8.5L22 12l-3.5 3.5v-2.3h-5.3v5.3h2.3L12 22l-3.5-3.5h2.3v-5.3H5.5v2.3L2 12l3.5-3.5v2.3h5.3V5.5H8.5z', // 이동
  label: 'M2 5h12.6l5.4 7-5.4 7H2zm14.8 5.6a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8z', // 라벨
  mtn: 'M12 4l9.5 16.5H2.5z',                                               // 산 (실제 산 표시와 같은 삼각형)
  legend: 'M3 4h5v5H3zm7 1h11v3H10zM3 15h5v5H3zm7 1h11v3H10z',              // 범례 (색상 상자 + 이름 두 줄)
  out: 'M12 2v10.2l3.4-3.4 1.8 1.8L12 15.8 6.8 10.6l1.8-1.8L12 12.2V2zM3 17h18v5H3z', // 내려받기
  proj: 'M3 4h6l2 2h10v13H3zm2 5v8h14V9z',                                  // 폴더
  anim: 'M4 4h16v3H4zm0 5h16v11H4zm3 2v7l6-3.5z',                           // 타임라인/재생
  typhoon: 'M12 3c3.9 0 6.5 2.1 6.5 4.9 0 2.1-1.5 3.5-3.6 3.5-1.5 0-2.5-.8-2.5-2 0-.9.6-1.5 1.5-1.5.6 0 1 .3 1 .8-.6 0-.9.3-.9.8 0 .6.5 1 1.3 1 1.2 0 2-.8 2-2.1 0-1.9-1.8-3.2-4.3-3.2-3.3 0-5.7 1.9-6.4 5.1M12 21c-3.9 0-6.5-2.1-6.5-4.9 0-2.1 1.5-3.5 3.6-3.5 1.5 0 2.5.8 2.5 2 0 .9-.6 1.5-1.5 1.5-.6 0-1-.3-1-.8.6 0 .9-.3.9-.8 0-.6-.5-1-1.3-1-1.2 0-2 .8-2 2.1 0 1.9 1.8 3.2 4.3 3.2 3.3 0 5.7-1.9 6.4-5.1M12 10a2 2 0 100 4 2 2 0 000-4z', // 태풍(소용돌이)
  typhoonPlaces: 'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z', // 지명(위치 핀)
};

// 항목 제목 글자를 span.secName 으로 감싼다 — 떼어낸 창을 좁히면 닫기(X) 앞에서 말줄임(…)으로 자르려고.
// (h3 바로 아래 맨 글자 노드엔 text-overflow가 안 먹는다. textContent는 그대로라 secTitle·검색은 영향 없음)
document.querySelectorAll('.sec[data-sec] > h3').forEach((h) => {
  for (const t of [...h.childNodes]) {
    if (t.nodeType !== 3 || !t.textContent.trim()) continue;
    const sp = document.createElement('span');
    sp.className = 'secName';
    t.replaceWith(sp);
    sp.append(t);
  }
});
for (const [sec, [grp, tag]] of Object.entries(SEC_GRP)) {
  const n = document.querySelector(`.sec[data-sec="${sec}"]`);
  if (!n) continue;
  n.dataset.grp = grp;
  const h = n.querySelector('h3');
  const d = SEC_ICON[sec];
  if (sec === 'typhoon' && window.TYPHOON_ICON && window.TYPHOON_ICON.img) {
    // 태풍 섹션 아이콘 = 실제 태풍 아이콘 '모양'을 섹션 강조색(보라)으로 칠한 실루엣(원래 아이콘 색감과 통일).
    const span = document.createElement('span');
    span.className = 'secIcon';                    // 박스(연보라 배경)
    const im = document.createElement('i');
    im.className = 'secIconMask';                  // 안쪽: 태풍 모양 마스크 + currentColor(보라)
    im.style.webkitMaskImage = `url("${window.TYPHOON_ICON.img}")`;
    im.style.maskImage = `url("${window.TYPHOON_ICON.img}")`;
    span.appendChild(im);
    h.prepend(span);
  } else if (d) {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'secIcon');
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'currentColor');
    svg.append(p);
    h.prepend(svg);
  }
  const t = document.createElement('span');
  t.className = 'tag';
  t.textContent = tag;
  h.append(t);
}

// 항목 순서. 마크업을 직접 옮기는 것보다 여기서 한 줄로 정리하는 게 실수가 적다.
// 도서 박스는 뺐다 — 이동 모드에서 끌고 핸들로 크기 조절하면 되니 중복이다.
// '지도 위치·경계선·그림자'(map)는 사이드바 가장 아래로.
// 설정(out=추출, proj=프로젝트, cfg=설정(렌치): 배치·설정 옮기기)은 맨 위 제목줄 드롭다운으로, CG 종류·지도 종류는 CG 구성 창으로 빠져서 여기 없다.
const SEC_ORDER = ['res', 'text', 'legend', 'wrn', 'fct', 'pal', 'sea', 'label', 'mtn', 'map'];
// 항상 펴져 있는 설정 항목. 나머지는 '이 지도 편집' 묶음 — 기본 접힘, 눌러야 펴진다.
const ALWAYS_OPEN = new Set(['out', 'proj', 'cfg']);
(() => {
  const panel = document.querySelector('#panel');
  document.querySelector('.sec[data-sec="inset"]')?.remove();
  // 각 카드 본문을 .bodyInner 로 감싼다 — grid-rows 접기 애니메이션이 패딩째 부드럽게 접히도록
  panel.querySelectorAll('.sec > .body').forEach((body) => {
    if (body.firstElementChild && body.firstElementChild.classList.contains('bodyInner')) return;
    const inner = document.createElement('div');   // 클리퍼
    inner.className = 'bodyInner';
    const pad = document.createElement('div');      // 실제 패딩
    pad.className = 'bodyPad';
    while (body.firstChild) pad.appendChild(body.firstChild);
    inner.appendChild(pad);
    body.appendChild(inner);
  });
  for (const s of SEC_ORDER) {
    const n = panel.querySelector(`.sec[data-sec="${s}"]`);
    if (!n) continue;
    panel.append(n); // 순서대로 뒤에 붙이면 그 순서가 된다
    if (ALWAYS_OPEN.has(s)) n.classList.remove('closed');
    else { n.classList.add('closed', 'toolSec'); }   // 지도 편집 도구 — 기본 접힘 + 묶음 표시
  }
  // (옛 '이 지도에서 편집' 머리표 제거 — 설정이 상단바로 빠져 사이드바는 전부 편집 도구뿐)
  refreshToolGroup();
  // 첫 페인트(접힌 상태) 후에 트랜지션을 켠다 — 로드하자마자 전부 접히는 애니메이션이 뜨지 않게
  setTimeout(() => document.documentElement.classList.add('anim-ready'), 80);
})();

// 도구 묶음의 처음/끝을 표시하고(둥근 모서리) 머리표를 그 앞에 둔다.
// 항목을 떼어냈다 붙였다 하면 묶음 경계가 바뀌므로 그때마다 다시 부른다.
function refreshToolGroup() {
  const panel = document.querySelector('#panel');
  const tools = [...panel.children].filter((n) => n.classList && n.classList.contains('toolSec'));
  panel.querySelectorAll('.tgFirst, .tgLast').forEach((n) => n.classList.remove('tgFirst', 'tgLast'));
  const gh = document.querySelector('#grpHead');
  if (!tools.length) { if (gh) gh.style.display = 'none'; return; }
  tools[0].classList.add('tgFirst');
  tools[tools.length - 1].classList.add('tgLast');
  if (gh) { gh.style.display = ''; panel.insertBefore(gh, tools[0]); }
}
