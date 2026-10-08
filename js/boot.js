/* [모듈] js/boot.js — 파일 끌어다 놓아 열기 + 앱 부팅 순서(build·wire·loadLayout·renderAll, 이어 열기, 타이머·자동 저장) — 반드시 마지막 */
'use strict';

// 파일을 창에 끌어다 놓으면 열기 (더블클릭 대안 — file://에서도 동작). .wcg.png / .json 모두.
// 자기 drop에서 전파를 막는 곳(배치 슬롯 등)이 창 쪽 드래그 카운트·오버레이를 정리할 때 부른다.
let dropHintReset = () => { const h = $('#dropHint'); if (h) h.classList.remove('on'); };
function setupDropOpen() {
  const hint = $('#dropHint');
  const hasFile = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  let over = 0;
  dropHintReset = () => { over = 0; hint.classList.remove('on'); };
  window.addEventListener('dragenter', (e) => { if (!hasFile(e)) return; e.preventDefault(); over++; hint.classList.add('on'); });
  window.addEventListener('dragover', (e) => { if (hasFile(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  window.addEventListener('dragleave', (e) => { if (!hasFile(e)) return; over = Math.max(0, over - 1); if (!over) hint.classList.remove('on'); });
  window.addEventListener('drop', async (e) => {
    if (!hasFile(e)) return;
    e.preventDefault(); over = 0; hint.classList.remove('on');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    // 태풍 비교 지도에서 일반 이미지(.wcg 작업파일 제외)는 창 어디에 놓아도 대고 그리기 참고 이미지로.
    if (isTyphoonCompare() && /^image\//.test(f.type || '') && !/\.wcg/i.test(f.name)) { loadRefImgFromFile(f); return; }
    // JTWC 통보문 파일(.tcw 등 텍스트) — 태풍 지도로 그린다.
    if (/\.(tcw|txt|dat)$/i.test(f.name) || !/\.(png|json|wcg)/i.test(f.name)) {
      try {
        const txt = await f.text();
        if (/\bPGTW\b|\bWTPN|^\s*T\d{3}\s+\d+[NS]\s+\d+[EW]\s/m.test(txt)) {
          if (!isTyphoon()) { setStyle('typhoon'); markStyleBtns(); }
          const tp = $('#typPaste'); if (tp) tp.value = txt.slice(0, 100000);
          pushUndo(); applyTyphoonText(txt);
          return;
        }
      } catch (e2) { /* 텍스트로 못 읽으면 아래 작업파일 경로로 */ }
    }
    try {
      const { data } = await readProjectFile(f);
      loadProjectData(data, null);
      addRecent(f.name, null, data);
      status('불러옴: ' + f.name);
    } catch (err) { status('이 파일은 열 수 없어요 — 날씨 CG 작업 파일(.wcg.png / .json) 또는 JTWC 통보문(.tcw)이어야 합니다', true); }
  });
}

buildFrame();
buildZones();
buildResBtns();
buildBgBtns();
buildStyleBtns();
wireTyphoonPanel();
wireCompareSection();
wireMapPos();
buildWrnCols();
buildPalette();
buildSwapBtns();
buildInsetPanel(); // 인셋 입력칸을 먼저 만들어야 syncPanelFromState가 채울 수 있다
wire();
loadLayout();   // wire() 뒤라야 한다 — 창으로 옮겨도 핸들러가 이미 붙어 있어야 안 끊긴다
setupMenus();   // 추출·프로젝트를 상단 메뉴바 드롭다운으로 (loadLayout 뒤 — 사이드바에서 빼내야 하니)
setupStartScreen();   // 처음 켰으면 빈 화면 + CG 종류·지도 종류 선택 안내(CG 구성 열기)
syncPanelFromState();
markActive();
updateUndoBtns();
sizeFit();
applyView();
renderAll();
// 스테이지 크기(사이드바 토글·창 리사이즈)가 바뀌면 .fit을 정확한 해상도 비율로 다시 레터박스한다.
{ const st = $('#stage'); if (st && window.ResizeObserver) { let _roT = 0; const ro = new ResizeObserver(() => { if (_roT) return; _roT = requestAnimationFrame(() => { _roT = 0; applyView(); }); }); ro.observe(st); } }
window.addEventListener('resize', () => applyView());

// 앱을 '새 창으로 켜면'(=이 창 세션의 첫 실행) 늘 빈 화면(시작 안내)으로 시작한다.
// 지난 지도를 자동으로 띄우지 않는다. 새로고침(F5)일 때만(=세션 플래그 있음) 하던 작업을 이어 붙인다.
migrateLegacyVfScaleState();   // 옛 빌드가 일반 화면에서 자동 생성한 VF 100% 값을 한 번만 제거
// 기본 배치(배포 파일·슬롯)가 지난번과 달라졌는지 — 서명을 덮어쓰기 전에 비교해 둔다.
const _prevDeploySig = (() => { try { return localStorage.getItem(DEPLOY_DEFAULTS_KEY) || ''; } catch (e) { return ''; } })();
preferUpdatedDeploymentDefaults();
const defaultsChanged = deploymentDefaultsSignature() !== _prevDeploySig;
// 슬롯 적용 뒤 새로고침이면, 이어서 여는 작업에도 새 기본 배치를 한 번 적용한다.
const slotReapply = (() => { try { const v = sessionStorage.getItem('wcg_reapply_preset'); sessionStorage.removeItem('wcg_reapply_preset'); return !!v; } catch (e) { return false; } })();
const freshOpen = !sessionStorage.getItem('wcg_open');
sessionStorage.setItem('wcg_open', '1');
// '새로 시작' 후엔 선택 화면 대기 상태(새로고침에도 유지). 자동저장된 빈 작업을 로드하지 않고 시작화면을 띄운다.
const pendingStart = !!localStorage.getItem('wcg_pending_start');
const work = (freshOpen || pendingStart) ? null : loadWork();
if (work) {
  S = work;
  normStyle();   // 서울/태풍 데이터 로드 실패 시 저장된 지도 종류가 없으면 시도군으로
  bumpSeq();           // 저장본 id 뒤에서 새 id 발급
  applyVfDefaults();   // 이어서 열 때 VF면 라벨 92%·산 70% 강제
  buildZones(); markStyleBtns(); markResBtns();
  // 태풍 지도로 저장돼 있으면, 스타일 전환과 '똑같은' 배치가 나오도록 부팅에서도 배치를 재적용한다.
  // (안 그러면 저장된 옛 제목 위치가 남아, 특보/예보 갔다와야 제대로 바뀌는 경로 의존 버그가 생김)
  // 단 기본 배치가 그대로인 평범한 F5에서는 재적용하지 않는다 — 편집한 제목 내용·위치·범례가 배치값으로 덮였다.
  if (typeof isTyphoon === 'function' && isTyphoon()) {
    if (defaultsChanged || slotReapply) { const ap = applyPreset(); applyTyphoonStyle(); if (!ap) setTyphoonDefaultView(); }   // 구운 태풍 뷰가 있으면 그대로, 없으면 자동맞춤
    else applyTyphoonStyle();
  } else if (slotReapply) applyPreset();   // 슬롯 적용 직후 — 지금 화면에도 새 기본 배치가 바로 보이게
  restoreWrnRuntime();   // 특보 지도면 저장된 특보 목록·우선순위 복원(재오픈 후 편집 가능하게) — renderAll 앞이라야 자동 범례가 빈 채로 안 그려진다
  syncPanelFromState(); renderAll();
  showPresetInfo();
  flash('하던 작업 이어서 열었습니다');
} else {
  applyPreset();   // 저장해 둔 기본 배치(있으면)로 베이스 지도만 (showPresetInfo는 안에서 부른다)
  if (freshOpen || pendingStart) showStartScreen();   // 빈 화면 + 'CG 종류·지도 종류 선택' 안내 (새 접속 또는 '새로 시작' 후)
}

wireTour();
setupDropOpen();   // 파일을 창에 끌어다 놓으면 열기
// 새 창으로 켰고 아직 '다시 보지 않기'를 안 눌렀으면 둘러보기를 자동으로 띄운다(새로고침엔 안 뜸)
const tourWillOpen = freshOpen && !localStorage.getItem(TOUR_KEY);
if (tourWillOpen) setTimeout(() => tourOpen(false), 650);
// 안 읽은 공지가 있으면 팝업 — 새로고침·새 접속 어느 쪽이든 매번 확인(닫으면 읽음처리돼 다신 안 뜸).
// 투어가 뜨는 첫 방문이면 투어 뒤에 겹쳐 뜨도록 조금 늦춘다.
setTimeout(checkNoticeOnBoot, tourWillOpen ? 1500 : 600);
// 구버전 헬퍼면 렌치(설정) 버튼에 빨간 점(웹판만) + 세션 첫 회 안내(공지 팝업 뒤에 오도록 조금 더 늦춤)
setTimeout(checkHelperFreshOnBoot, tourWillOpen ? 2400 : 1300);

// 1.5초마다 + 창 닫을 때 자동 저장 (바뀐 게 있을 때만 쓴다)
setInterval(() => { if (!brushStroke) saveWork(); if (typeof tlContentChanged === 'function') tlContentChanged(); }, 1500);   // 브러쉬 드래그 중엔 건너뛴다(손 떼면 저장)
window.addEventListener('beforeunload', saveWork);
document.fonts.ready.then(() => { renderLabels(); renderMtns(); renderSel(); });
