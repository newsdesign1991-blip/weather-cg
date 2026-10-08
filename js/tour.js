/* [모듈] js/tour.js — 둘러보기(온보딩 투어) */
'use strict';

// ===================== 둘러보기 (온보딩 투어) =====================
// 어두운 오버레이로 전체를 덮고, 설명할 것만 구멍(스포트라이트)으로 보여주며 카드로 안내한다.
// 실제 드롭다운·사이드바 펼침을 그대로 실행해 진짜 애니메이션을 보여준다.
const TOUR_KEY = 'wcg_tour_seen';
let _openMenu = null, _closeMenu = null;   // setupMenus가 채운다
let tourI = -1, TOUR = null, tourTimer = null, tourSnap = null;

const menuBtnFor = (sec) => document.querySelector(`.menuBtn[data-menu="${sec}"]`);
function tourMenu(sec) {
  const drop = $('#menuDrop'), s = drop.querySelector(`.sec[data-sec="${sec}"]`);
  if (drop.classList.contains('on') && s && getComputedStyle(s).display !== 'none') return;   // 이미 그 메뉴가 열려 있으면 그대로 (토글 닫힘 방지)
  const b = menuBtnFor(sec);
  if (b && _openMenu) _openMenu(sec, b);
}
function tourMenuClose() { if (_closeMenu) _closeMenu(); closeCgSetup(); }   // 드롭다운·CG 구성 창 모두 닫기
function tourCgSetup() { if (_closeMenu) _closeMenu(); if (!cgSetupIsOpen()) openCgSetup(); }   // 투어: 실제 CG 구성 창을 열어 보여준다
// 투어 스포트라이트용 — CG 구성 창 카드가 '다 열린 뒤' 놓일 자리. 열리는 중(scale .95 → 1)에 재도 작게 잡히지 않게
// 변형을 빼고 레이아웃 위치(offset*)로 잰다. 카드의 offsetParent 는 고정 막(.cgSetupOv).
function cgsCardRect(card) {
  const o = card.offsetParent ? card.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
  const left = o.left + card.offsetLeft, top = o.top + card.offsetTop, width = card.offsetWidth, height = card.offsetHeight;
  return { left, top, width, height, right: left + width, bottom: top + height };
}
function tourExpand(sec, open) { const n = secNode(sec); if (!n) return; n.classList.toggle('closed', !open); if (open) { try { n.scrollIntoView({ block: 'center' }); } catch (e) {} } }
// 투어 '설명용'으로 이 카드만 보이게 — 기상특보(wrn)는 특보 지도, 기상예보(fct)는 예보 지도에서만 보이므로
// 지금 지도 모드와 상관없이 대상 카드만 강제로 펼쳐 보여준다(다른 자동색칠 카드는 숨김). 투어 끝나면 tourEnd가 updateAutoPaintSecs로 복원.
function tourShowSec(sec) {
  document.querySelectorAll('#panel .sec.toolSec, #panel .sec.special').forEach((n) => n.classList.add('closed'));
  const wrn = $('[data-sec="wrn"]'), fct = $('[data-sec="fct"]');
  if (wrn) wrn.style.display = (sec === 'wrn') ? '' : 'none';
  if (fct) fct.style.display = (sec === 'fct') ? '' : 'none';
  const n = secNode(sec); if (!n) return;
  n.style.display = ''; n.classList.remove('closed');
  try { n.scrollIntoView({ block: 'center' }); } catch (e) {}
}
function tourAllClosed() { document.querySelectorAll('#panel .sec.toolSec').forEach((n) => n.classList.add('closed')); }

function tourStepList() {
  return [
    { title: 'CG 구성', body: '맨 위 <b>CG 구성</b>을 누르면 이 창이 열립니다. 왼쪽 <b>CG 종류</b>(터치 스크린 · 노말 CG · 노말 VF · 날씨 팀)와 오른쪽 <b>지도 종류</b>(시도군 · 시도 · 특보 · 태풍 등)를 <b>둘 다</b> 고르고 <b>선택 완료</b>를 눌러야 적용돼요. CG 종류마다 화면 크기와 지도 · 제목 배치를 따로 기억합니다.',
      target: () => document.querySelector('#cgSetupOv .cgSetupCard'), setup: () => tourCgSetup(), delay: 380, rect: cgsCardRect },
    { title: '지도 종류 선택 · 지도 잠금', body: '<b>태풍 지도</b>에서는 아트보드 <b>오른쪽 위</b>에 버튼 두 개가 나옵니다. <b>접힌 지도 아이콘</b> = <b>지도 종류 선택</b> — 파란 지도 · 밝은/어두운 위성지도 · Mapbox 실시간 타일 중에서 고르고, 개인 Mapbox URL도 붙일 수 있어요. <b>자물쇠 아이콘</b> = <b>지도 잠금</b> — 켜면 지도가 실수로 움직이지 않게 고정됩니다(다시 누르면 해제).',
      target: () => { const b = document.querySelector('.basemapBtn'); return (b && b.offsetParent) ? b : (document.querySelector('.fit') || $('#stage')); }, setup: () => tourMenuClose(), delay: 300 },
    { title: '프로젝트 (플로피 디스크 아이콘)', body: '<b>CG 구성</b> 옆 <b>플로피 디스크 아이콘</b>이에요. 작업을 저장 · 불러오고 최근 파일을 엽니다. 저장 파일은 그림(PNG)이라 파일 탐색기에서 미리보기가 그대로 보여요.',
      target: () => $('#menuDrop'), setup: () => tourMenu('proj'), delay: 320 },
    { title: '이미지로 추출 · 영상으로 추출 · AE로 보내기', body: '파란 버튼 세 개예요. <b>이미지로 추출</b>은 창에서 완성 화면·레이어(색칠만·경계선만 등)를 골라 렌더하면, 고른 폴더 안 <b>오늘 날짜 폴더</b>에 카드 이름 그대로 저장해요. <b>영상으로 추출</b>은 타임라인을 영상(MP4)으로 뽑고, <b>AE로 보내기</b>는 레이어째 애프터이펙트로 넘깁니다.',
      target: () => $('#exportGroup'), setup: () => tourMenuClose(), delay: 280 },
    { title: '칠하기 · 브러쉬 · 이동 모드', body: '작업은 이 세 모드를 상황에 맞게 바꿔 가며 합니다. ① 칠하기 = 지역을 클릭해 색칠, ② 브러쉬 = 고른 영역 안에만 부드럽게 덧칠, ③ 이동 = 지도 · 글자 · 산의 위치를 끌어서 옮기기. 색칠하려면 칠하기, 자리 잡으려면 이동으로 바꾸세요.',
      target: () => { const b = document.getElementById('mPaint'); return b ? b.closest('.mode') : null; }, setup: () => tourMenuClose(), delay: 280 },
    { title: '밝기 전환 (다크 · 라이트)', body: '사이드바를 어둡게/밝게 바꿉니다. 편한 쪽으로 쓰면 되고, 작업물(방송에 나가는 지도)에는 영향이 없습니다.',
      target: () => $('#theme'), setup: () => tourMenuClose(), delay: 260 },
    { title: '둘러보기 · 공지 · 설정', body: '오른쪽 위 세 버튼이에요. <b>둘러보기</b>는 지금 이 설명을 다시 봅니다. <b>공지사항</b>은 업데이트·안내를 모아 보고, 빨간 점이 있으면 새 소식이 있다는 뜻이에요. <b>설정</b>(렌치)을 누르면 <b>배치 지정하기 · 기본값 굽기 · 설정 옮기기</b>가 모인 메뉴가 열립니다. 웹판에서 렌치에 빨간 점이 뜨면 기능 확장팩이 구버전이라는 뜻 — 메뉴 맨 아래 줄을 눌러 다시 실행하세요.',
      target: () => $('#tbInfoGroup'), setup: () => tourMenuClose(), delay: 260 },
    // 설정(렌치) 드롭다운을 실제로 열어 그 안의 버튼을 비춘다 (예전엔 사이드바 맨 아래·프로젝트 메뉴에 있던 것들)
    { title: '배치 지정하기', body: '오른쪽 위 <b>설정</b>(렌치) 메뉴 맨 위에 있어요. 구워 둔 배치 파일(default-presets.js)을 슬롯에 끌어다 놓아 <b>기본값</b>으로 지정합니다. <b>개인 배치</b>는 이 브라우저에만 적용(비번 없음), <b>완전 기본 배치</b>는 모두의 기본값이라 바꿀 때 비밀번호가 필요해요(“지금 배치로 채우기”로 현재 화면 배치를 바로 담을 수도 있어요). 그 아래 <b>모두의 기본값으로 굽기</b>는 배포용 배치 파일을 만듭니다.',
      target: () => $('#cfgPresetGroup'), setup: () => tourMenu('cfg'), delay: 320 },
    { title: '설정 옮기기', body: '웹판과 데스크톱 앱(또는 다른 PC)은 저장 공간이 따로예요. 한쪽에서 <b>설정 내보내기</b> → 다른 쪽에서 <b>설정 가져오기</b>하면 API 키 · 배치 · 이어하던 작업이 그대로 옮겨집니다.',
      target: () => $('#cfgMoveGroup'), setup: () => tourMenu('cfg'), delay: 320 },
    { title: '왼쪽 사이드바 — 지도 조정', body: '이 카드들로 지도의 색 · 글자 · 경계선 · 산 표시 같은 세부를 조정합니다. 카드를 누르면 펼쳐져 세부 설정이 나와요.',
      target: () => $('#panel'), setup: () => { tourMenuClose(); tourAllClosed(); }, delay: 320 },
    { title: '카드 떼어내기 (포토샵처럼)', body: '자주 쓰는 카드는 <b>제목을 잡고 사이드바 밖으로 끌어내면</b> 별도 창으로 떠서 원하는 자리에 놓고 쓸 수 있어요. 다시 다 모으려면 사이드바 맨 아래의 <b>기본 배치</b>(되돌리기 아이콘)를 누르면 됩니다. 사이드바 위치는 그 옆 <b>화살표</b>로 좌우를 바꿔요.',
      target: () => $('#panel'), setup: () => { tourMenuClose(); tourAllClosed(); }, delay: 320 },
    { title: '기상특보 자동 색칠', body: '‘기상청에서 불러오기’를 누르면(또는 특보 통보문을 붙여넣으면) 특보가 지역별로 자동 색칠됩니다. 이 카드는 특보 지도에서 나와요.',
      target: () => secNode('wrn'), setup: () => { tourMenuClose(); tourShowSec('wrn'); }, delay: 540 },
    { title: '기상예보 자동 색칠', body: '기상청 예보를 붙여넣으면 강수 · 기온 등을 지역별로 자동으로 색칠합니다. 단기 · 중기 예보 중 골라 쓸 수 있어요. 이 카드는 예보(시도·시군) 지도에서 나와요.',
      target: () => secNode('fct'), setup: () => { tourMenuClose(); tourShowSec('fct'); }, delay: 540 },
    { title: '새로 시작 (작업 비우기)', body: '지금 작업을 비우고 저장해 둔 기본 배치로 새로 시작합니다. 사이드바 맨 아래에 있어요.',
      target: () => $('#newWork'), setup: () => { updateAutoPaintSecs(); tourMenuClose(); }, delay: 320 },
  ];
}

// 닫기·다시보지않기 바는 '사이드바가 없는 쪽' 위에 둔다 (사이드바 왼쪽=바 오른쪽, 오른쪽 도킹이면 반대).
// 단 비추는 곳(spot={x,y,w,h})을 가리면 반대쪽으로 비킨다 — 오른쪽 위 설정(렌치) 메뉴를 비출 때.
// 드롭다운이 열려 있으면 비추는 곳과 '드롭다운 전체'를 합친 영역으로 본다 — 스포트가 메뉴 아래쪽 묶음만 비춰도
// 바가 메뉴 오른쪽 위 모서리를 덮지 않게(그래야 '배치 지정하기'·'설정 옮기기' 두 단계 모두 바가 한쪽에 머문다).
function tourBarSide(spot) {
  const bar = document.querySelector('.tourBar'); if (!bar) return;
  const dockRight = document.querySelector('.app')?.classList.contains('dockR');
  const put = (left) => { bar.style.left = left ? '16px' : 'auto'; bar.style.right = left ? 'auto' : '16px'; };
  put(dockRight);
  if (!spot) return;
  let a = spot;
  const d = $('#menuDrop');
  if (d && d.classList.contains('on')) {
    const r = d.getBoundingClientRect();
    if (r.width && r.height) {
      const x1 = Math.min(a.x, r.left), y1 = Math.min(a.y, r.top);
      a = { x: x1, y: y1, w: Math.max(a.x + a.w, r.right) - x1, h: Math.max(a.y + a.h, r.bottom) - y1 };
    }
  }
  const b = bar.getBoundingClientRect();
  if (b.width && b.left < a.x + a.w && b.right > a.x && b.top < a.y + a.h && b.bottom > a.y) put(!dockRight);
}

function tourPlace(step) {
  const el = step.target && step.target();
  const spot = $('#tourSpot'), card = $('#tourCard'), arrow = $('#tourArrow');
  if (!el) { spot.style.opacity = 0; return; }
  // 사이드바 섹션은 펼치면 화면보다 길 수 있다 — 가운데 정렬로 위아래가 잘려 스포트라이트가 사이드바 전체처럼 커지는 걸 막고,
  // 섹션 '위쪽'이 화면 상단(툴바 아래)에 오게 스크롤해 깔끔한 사각형으로 잡히게 한다.
  if (el.classList && el.classList.contains('sec') && el.closest('#panel')) {
    const panel = $('#panel'), sb = panel.style.scrollBehavior;
    panel.style.scrollBehavior = 'auto';
    panel.scrollTop += el.getBoundingClientRect().top - 92;
    panel.style.scrollBehavior = sb;
  }
  const r = step.rect ? step.rect(el) : el.getBoundingClientRect();   // rect = 열리는 애니메이션(변형)과 상관없는 최종 자리(CG 구성 창)
  const vw = window.innerWidth, vh = window.innerHeight, pad = 8;
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(vw - x - 4, r.width + pad * 2), h = Math.min(vh - y - 4, r.height + pad * 2);
  spot.style.opacity = 1;
  spot.style.left = x + 'px'; spot.style.top = y + 'px'; spot.style.width = w + 'px'; spot.style.height = h + 'px';
  tourBarSide({ x, y, w, h });   // 카드 자리(아래 .tourBar 비키기)를 정하기 전에 바부터 옮긴다

  const cw = card.offsetWidth || 300, ch = card.offsetHeight || 180, gap = 18;   // 대체값 = CSS .tourCard 폭
  const tcx = x + w / 2, tcy = y + h / 2;
  let side, cx, cy;
  // 맨 위 제목줄 안의 버튼(밝기·둘러보기 등)은 카드를 바로 '아래'에 — 옆에 두면 화면 위로 잘려 화살표가 어긋난다
  const inTitleBar = !!(el.closest && el.closest('#titlebar'));
  if (inTitleBar && vh - (y + h) >= ch + gap + 8) { side = 'below'; cy = y + h + gap; cx = tcx - cw / 2; }
  else if (vw - (x + w) >= cw + gap + 8) { side = 'right'; cx = x + w + gap; cy = tcy - ch / 2; }
  else if (x >= cw + gap + 8) { side = 'left'; cx = x - cw - gap; cy = tcy - ch / 2; }
  else if (vh - (y + h) >= ch + gap + 8) { side = 'below'; cy = y + h + gap; cx = tcx - cw / 2; }
  else { side = 'above'; cy = y - ch - gap; cx = tcx - cw / 2; }
  cx = Math.max(12, Math.min(cx, vw - cw - 12));
  cy = Math.max(titleBarH() + 8, Math.min(cy, vh - ch - 12));   // 제목줄(데스크톱=창 끌기 영역) 아래로
  // 닫기·'다시 보지 않기' 바(.tourBar — 카드보다 위에 그려짐)가 카드 모서리를 덮지 않게.
  // 위/아래 카드는 화살표가 대상을 계속 가리킬 수 있는 한 바 옆으로 비켜 놓고, 안 되면 바 아래로 내린다.
  const bb = document.querySelector('.tourBar')?.getBoundingClientRect();
  const hitBar = (X, Y) => !!bb && bb.width > 0 && X < bb.right + 8 && X + cw > bb.left - 8 && Y < bb.bottom + 8 && Y + ch > bb.top - 8;
  if (hitBar(cx, cy)) {
    const arrowIn = (X) => tcx - X - 9 >= 14 && tcx - X - 9 <= cw - 24;
    const xs = (side === 'below' || side === 'above')
      ? [bb.left - 12 - cw, bb.right + 12].filter((X) => X >= 12 && X <= vw - cw - 12 && arrowIn(X)) : [];
    if (xs.length) cx = xs.sort((a, b) => Math.abs(a - cx) - Math.abs(b - cx))[0];
    else cy = Math.max(cy, Math.min(bb.bottom + 10, vh - ch - 12));
  }
  card.style.left = cx + 'px'; card.style.top = cy + 'px';
  card.className = 'tourCard tourUI show pos-' + side;
  if (side === 'right' || side === 'left') { arrow.style.cssText = `top:${Math.max(14, Math.min(tcy - cy - 9, ch - 24))}px`; }
  else { arrow.style.cssText = `left:${Math.max(14, Math.min(tcx - cx - 9, cw - 24))}px`; }
}

function tourGo(i) {
  if (!TOUR) return;
  tourI = Math.max(0, Math.min(TOUR.length - 1, i));
  const step = TOUR[tourI];
  $('#tourCard').classList.remove('show');
  try { step.setup && step.setup(); } catch (e) {}
  $('#tourStepNo').textContent = `${tourI + 1} / ${TOUR.length}`;
  $('#tourTitle').textContent = step.title;
  $('#tourBody').innerHTML = step.body;   // 본문에 <b> 등 서식 허용 (내용은 전부 코드 내 정적 문자열)
  $('#tourPrev').disabled = tourI === 0;
  $('#tourNext').textContent = tourI === TOUR.length - 1 ? '끝내기' : '다음 →';
  clearTimeout(tourTimer);
  tourTimer = setTimeout(() => tourPlace(step), step.delay || 320);
}

function tourOpen(manual) {
  // '봤음' 표시는 오직 '다시 보지 않기'로만 켠다 — 그 전까진 앱 켤 때마다 계속 뜬다(끝내기·i버튼·닫기 모두 안 멈춤).
  if ($('#tourWrap').classList.contains('on')) { tourGo(0); return; }   // 이미 열려 있으면 처음 단계로만
  TOUR = tourStepList();
  document.documentElement.classList.add('anim-ready');
  tourSnap = [...document.querySelectorAll('#panel .sec.toolSec')].map((n) => [n, n.classList.contains('closed')]);
  tourBarSide(null);
  $('#tourWrap').classList.add('on');
  tourGo(0);
}
function tourEnd(never) {
  if (never) localStorage.setItem(TOUR_KEY, '1');
  clearTimeout(tourTimer);
  $('#tourWrap').classList.remove('on');
  $('#tourCard').classList.remove('show');
  tourMenuClose();
  if (tourSnap) { tourSnap.forEach(([n, wasClosed]) => n.classList.toggle('closed', wasClosed)); tourSnap = null; }
  if (typeof updateAutoPaintSecs === 'function') updateAutoPaintSecs();   // 투어 중 강제로 보였던 특보·예보 카드를 지금 지도 모드 기준으로 복원
  TOUR = null; tourI = -1;
}
function tourNextOrEnd() { if (tourI >= TOUR.length - 1) tourEnd(false); else tourGo(tourI + 1); }   // 끝내기도 '이번만' (다시 보지 않기 눌러야 영구 종료)
function wireTour() {
  $('#tourClose').onclick = () => tourEnd(false);       // 닫기 = 이번만 (다음 실행 때 다시 뜸)
  $('#tourNever').onclick = () => tourEnd(true);        // 다시 보지 않기 = 영구
  $('#tourPrev').onclick = () => tourGo(tourI - 1);
  $('#tourNext').onclick = tourNextOrEnd;
  $('#tourBtn').onclick = () => tourOpen(true);         // 상단바 i 버튼
  if ($('#noticeBtn')) { $('#noticeBtn').onclick = openNoticeHistory; updateNoticeDot(); }   // 상단바 공지 버튼
  // (렌치 #helperBtn 은 이제 '설정' 드롭다운 — setupMenus가 .menuBtn 으로 연결. 기능 확장팩 안내는 그 메뉴 맨 아래 한 줄에서)
  // 투어 UI 클릭이 메뉴 '바깥 클릭 닫기'를 건드리지 않게 + 어두운 영역 클릭 무효
  $('#tourWrap').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target.closest('#tourBlock')) e.preventDefault(); });
  window.addEventListener('keydown', (e) => {
    if (!$('#tourWrap').classList.contains('on')) return;
    if (e.key === 'Escape') tourEnd(false);
    else if (e.key === 'ArrowRight') tourNextOrEnd();
    else if (e.key === 'ArrowLeft') tourGo(tourI - 1);
  });
  let rz; window.addEventListener('resize', () => { if ($('#tourWrap').classList.contains('on') && TOUR) { clearTimeout(rz); rz = setTimeout(() => tourGo(tourI), 140); } });
}
