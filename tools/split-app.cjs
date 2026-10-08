// tools/split-app.cjs — 한 파일 index.html → js/*.js + css/*.css + 얇은 index.html (코드 무변경 기계 분할)
//
// 2026-10-08 분할(기준 커밋 a6d0794)을 만든 도구다. 기준표(MAP)는 지금 구조(경계 조정·뒤에 더한 busy-fx 한 쌍 반영)를 적어 둔다.
// 이미 나뉜 저장소의 index.html에 그대로 돌리면 '이미 분할된 index.html'로 멈춘다 — 재분할은 --src(한 파일)·--like로(MODULES.md 11·12장).
//
//   node tools/split-app.cjs --check                  검사·보고만(아무것도 안 씀)
//   node tools/split-app.cjs                          저장소 루트 index.html을 그 자리에서 분할
//   node tools/split-app.cjs --src=<한파일.html> --out=<폴더> [--force]   다른 곳에서 읽고/쓰기(시험·재분할)
//   node tools/split-app.cjs --like=<분할된 index.html> --src=… --out=…    기준표를 지금 분할본(파일·머리·첫 줄)에서 만든다
//                                                                        (분할 전 기반 브랜치를 한 파일로 합친 뒤 같은 구조로 다시 나눌 때)
//
// 경계는 아래 기준표(MAP)의 '시작 표지' 문자열로 찾는다(줄 번호를 쓰지 않음). 하나라도 어긋나면 아무것도 쓰지 않고 멈춘다.
// 바꾸는 것(기계 변환 4종):
//   ① 메인 IIFE 껍데기(`(() => {` + `'use strict';` / `})();`)를 빼고, 각 js 앞에 머리 2줄(주석 + 'use strict';)
//   ② 각 css 앞에 머리 주석 1줄
//   ③ css 안 상대 url()에 '../' (css/ 폴더 기준으로 다시 맞춤 — @font-face 글꼴 9곳)
//   ④ index.html의 큰 <style>/<script> 두 블록을 <link>/<script src> 묶음(?v= 포함)으로
// 마지막에 tools/app-source.cjs로 되돌린 결과가 원본과 바이트까지 같은지 확인한다(텍스트 무변경 증명). 다르면 아무것도 안 쓴다.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

// 문장 경계 확인용 acorn(Node 내장)은 --expose-internals가 있어야 읽힌다 → 없으면 스스로 다시 띄운다
if (!process.execArgv.includes('--expose-internals') && !process.argv.includes('--no-acorn')) {
  const r = spawnSync(process.execPath, ['--expose-internals', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status == null ? 1 : r.status);
}
let acorn = null;
try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); } catch (e) { /* 아래에서 멈춤(--no-acorn이면 글자 규칙만) */ }

const appSource = require('./app-source.cjs');
const { versionOf } = require('./stamp-version.cjs');

// ---------------------------------------------------------------------------
// 기준표(지금 구조). 순서 = 원본 순서 = 로드 순서. 처음 분할(ae0343d, 32개) 뒤 경계 조정(cg-setup 뒤쪽 → modals-notices,
// export-video·forecast-panel 뒤쪽 → export-blobs·warnings-load)을 반영했다. 구조를 바꾸면 이 표도 같이 고친다(--like는 이 표를 안 씀).
//  start: 그 파일이 시작되는 줄의 앞부분(본문 안에서 정확히 1번, 줄 맨 앞 — CSS는 앞 공백 허용)
//  walk:  false면 표지 줄에서 바로 시작(기본은 표지 바로 위의 빈 줄·'//' 주석 줄을 이 파일로 함께 가져감)
//  (--like가 만드는 기준표는 walk 대신 back: n — 표지 위로 정확히 n줄을 그 파일에 둔다)
//  desc:  파일 머리 주석의 한 줄 설명('*/'·줄바꿈 금지)
// ---------------------------------------------------------------------------
const MAP = {
  js: [
    { file: 'core.js', start: 'const $ = (s) => document.querySelector(s);', desc: '공통 도우미($·el·tip·svgNS), 색 팔레트(RAMPS·WRN_COLORS), 기본 상태 DEFAULTS·S, 선택 도우미, MAP/IMG 데이터 보정, 지도 종류 판별(isTyphoon·isSeoul·curStyle), fills·brushStrokes' },
    { file: 'brush.js', start: '// ===================== 브러쉬 덧칠', desc: '브러쉬 덧칠 엔진: 공간 캐시·색 런 캔버스·증분 적용(brushApply)·되돌리기 조각, <image> 반영, PNG 인코딩 워커·이미지 갱신(brushPublish·brushFinalize)' },
    { file: 'brush-ui.js', start: 'function renderBrush(stroked) {', desc: '브러쉬 화면·입력: renderBrush, 라이브 캔버스·스포이드, 시도 영역 선택, 칠하기 드래그(startBrush), 좌표 변환(projLL·xyToLonLat·insetBBox)' },
    { file: 'map-build.js', start: '// ===================== 실행 취소', desc: '실행 취소(pushUndo·undo/redo·applyState) + SVG 뼈대 구성(buildFrame·buildZones), 지도 스타일 전환(setStyle)·CG 종류/배경 버튼' },
    { file: 'map-render.js', start: '// ===================== 렌더 =====================', desc: '지도 렌더: 위치/잠금, 예보지도 연결, Mapbox 타일·위성 basemap, 인셋, 칠(renderFills), 경계선, 바다, 배경(renderBg)' },
    { file: 'vf-legend.js', start: 'function renderVfBar() {', desc: 'VF 막대·VF 패널 배율, 그림자, 제목 텍스트(renderTexts), 범례(renderLegend·특보·태풍 범례 목록)' },
    { file: 'labels-mountains.js', start: 'const newLabel = (o) => Object.assign({', desc: '수치 라벨(글자·글래스·지시선), 칠한 색 계열 바꾸기·자동 라벨, 산 표시, 선택 상자, renderAll' },
    { file: 'typhoon-core.js', start: '// ===================== 태풍 지도', desc: '태풍: 좌표·카메라 투영, 기본값·등급·날짜 범위, 스타일(applyTyphoonStyle), 데이터 초기화, 범례 카탈로그, 애니 상태, 아이콘·지시선·반경(밴드)' },
    { file: 'typhoon-render.js', start: 'const CMP_PALETTE = [', desc: '태풍 그리기: 예보 비교 경로·라벨, 진로선, 지명표시, 제목, 재생, renderTyphoon' },
    { file: 'typhoon-panel.js', start: 'function addCompareForecast(auto) {', desc: '태풍 패널 UI: 비교 카드, 태풍 패널·밴드, 펜툴, 참고 이미지, wireTyphoonPanel' },
    { file: 'typhoon-api.js', start: "const TYP_KEY_STORE = 'wcg_typ_key';", desc: '태풍 데이터: 기상청 typ/td 파싱, JMA·JTWC, 이름 저장, TD 가장자리 붙이기, fetchTyphoon' },
    { file: 'panels.js', start: '// ===================== 패널 =====================', desc: '사이드바 패널(팔레트·인셋·텍스트/라벨/산 목록·섹션 열기/스크롤), 캔버스 요소→섹션 자동 열기, 선택(select)·refreshPanel·syncPanelFromState, 칠하기 paint' },
    { file: 'view-camera.js', start: '// ===================== 작업창 줌', desc: '작업창 줌·맞춤(sizeFit·applyView)·틸트 래스터, 더블클릭 인라인 편집, Alt 카메라 조작(팬·줌·휠)' },
    { file: 'pointer-drag.js', start: "svg.addEventListener('pointerdown', (e) => {\n  if (e.button === 2", desc: '캔버스 포인터(칠·선택), 브러쉬 커서, dragLoop·스냅 가이드, 항목/그룹/인셋/지도 드래그·리사이즈, 키보드 단축키, delSel·setMode' },
    { file: 'warnings.js', start: '// ===================== 기상특보 자동 색칠', desc: '기상특보: 파싱(parseWrn)·단계 색·발효 순서, 불러오기 결과 판정·문구(wrnReadText·wrnHttpFail·wrnResultView)' },
    { file: 'warnings-apply.js', start: '// ===================== API 주소', walk: false, desc: '기상청 API 주소·키(apiKey·apiUrl — 예보·태풍도 씀), 특보 런타임 목록·순서, 특보 적용(applyWrn)·칠(paintWrn)·발효 현황·목록(buildWrnList)' },
    { file: 'bulletin.js', start: '// ===================== 기상예보 자동 색칠', desc: '기상예보 파싱·색(기온/강수), 통보문 강수량 붙여넣기(용어 사전·지역 표현 파서·applyBulletin)' },
    { file: 'bulletin-load.js', start: '// ===================== 통보문 불러오기 — 묶음 나누기', desc: "통보문 불러오기(헬퍼로 날씨누리 단기예보)·데스크톱 날씨누리 창 읽기, 원문에서 '예상 강수량' 날짜 묶음 나누기·고르기·결과 카드" },
    { file: 'forecast-panel.js', start: 'function applyFct(txt) {', desc: '예보 적용·고르기·목록, 작업 런타임 초기화(resetWorkRuntime), 예보 종류 버튼' },
    { file: 'warnings-load.js', start: 'let wrnResLast = null;', desc: '특보 불러오기(fetchWrn)·결과 카드(showWrnResult), 특보 열(buildWrnCols)' },
    { file: 'presets.js', start: '// ===================== 해상도별 배치 프리셋', desc: '해상도별 배치 프리셋 + 작업 자동 저장(saveWork/loadWork), 배포 기본값 갱신, applyPreset' },
    { file: 'cg-setup.js', start: '// ===================== 추출 =====================', desc: '해상도(RES)·CG 구성 창, 상태 표시(status·flash), 출력 폴더(IndexedDB·prepareOutput)' },
    { file: 'modals-notices.js', start: 'function popAnimClose(ov, done) {', desc: '팝업 공통(닫힘 애니메이션·포커스 — popAnimClose·popFocusIn), 토스 카드 모달(tossModal), 공지사항(시드·작성·삭제·부팅 확인), 내보내기 진행 마스크, 확인/입력 모달(tossConfirm·tossPrompt)' },
    { file: 'busy-fx.js', start: '// ===================== 작업 중·도착 효과', desc: '작업 중·도착 효과(fxBusy·fxRun·fxArrive·fxProgress): 흐르는 그라디언트, 버튼 진행 표시, 빛 훑는 자리표시 막대, 도착 떠오름' },
    { file: 'preset-slots.js', start: '// ===================== 배치 지정하기', desc: '배치 지정하기(완전 기본/개인 슬롯, 구운 배치 파일)' },
    { file: 'export-image.js', start: 'let _suiteFontCss = null;', desc: '이미지 추출 공통: 출력 글꼴 임베드, 카메라 레이어·가장자리, 텍스트 오버레이, svgToImage, 3D 틸트 워프, drawExportFrame' },
    { file: 'export-video.js', start: '// ===== 정확 MP4 (베이킹)', desc: '정확 MP4(베이킹)·PNG 시퀀스, 로컬 헬퍼(WNS) 연결·상태(렌치 빨간 점·기능 확장팩 줄)·렌더(wnsRender)' },
    { file: 'export-blobs.js', start: 'const ALL_LAYERS = [', desc: '추출 핵심: 레이어 목록(ALL_LAYERS)·SVG→PNG blob(svgBlob·keepLayers)·미리보기, 프로젝트 파일 PNG 메타(pngEmbed·pngExtract·readProjectFile), 이미지로 추출 항목·장 목록·굽기(EXPORT_TARGETS·exportPlan·exportBake)' },
    { file: 'ae-export.js', start: '// ===== After Effects 자동 임포트', desc: 'After Effects 보내기(레이어 분해 blob·sendToAE), download' },
    { file: 'export-dialog.js', start: 'const EXPORT_ICON = {', desc: "'이미지로 추출' 팝업(CG 구성 모양: 묶음 3판·아이콘 카드·빠른 선택·고른 것 기억)과 저장(폴더 고르기 → 오늘날짜_날씨CG메이커 폴더 → 카드 이름 그대로 PNG, 폴더 고르기를 못 쓰면 ZIP)" },
    { file: 'project-io.js', start: '// ===== 설정 옮기기', desc: '설정 옮기기, 프로젝트 저장/열기, 최근 파일, 기본 배치 굽기(bakeDefaults)' },
    { file: 'wiring.js', start: '// ===================== 배선 =====================', desc: '버튼·입력 배선 wire()(한 함수) + 사이드바 그룹·아이콘 구성(로드 때 실행, refreshToolGroup)' },
    { file: 'anim.js', start: '// ===================== 영상 (타임라인)', desc: '영상 애니메이션: 이징, 카메라 키프레임, 자동 트랙, 블라인드, renderAnimFrame, 재생/정지/탐색' },
    { file: 'timeline-ui.js', start: '// ===================== 타임라인 UI', desc: '타임라인 UI(막대·키 드래그·카메라 키 팝오버)' },
    { file: 'floating-panels.js', start: '// ===================== 떼어낸 창', desc: '떼어낸 창(도킹), 패널 크기, 제목줄 색, 레이아웃 저장/불러오기, 제목줄 메뉴(setupMenus — 프로젝트·설정(렌치)), 시작 화면' },
    { file: 'tour.js', start: '// ===================== 둘러보기', desc: '둘러보기(온보딩 투어)' },
    { file: 'boot.js', start: 'let dropHintReset = () =>', desc: '파일 끌어다 놓아 열기 + 앱 부팅 순서(build·wire·loadLayout·renderAll, 이어 열기, 타이머·자동 저장) — 반드시 마지막' },
  ],
  css: [
    { file: 'base.css', start: "@font-face { font-family: 'Pretendard Variable'", desc: '글꼴(@font-face: Pretendard·SUITE CG), 색 역할·토스 팔레트·팝업 공통 토큰(다크/라이트), html/body·앱 뼈대, 사이드바 바닥·footer, 작은 버튼' },
    { file: 'sidebar.css', start: '/* ===== 토스 반사 카드 ===== */', desc: '토스 반사 카드, 아이콘 칩, 섹션 접기 애니, 갈래 색, 근무표식 사이드바(눌린 블록·플로팅·크기 조절), 입력칸·버튼 높이·스와치·눈 버튼' },
    { file: 'stage.css', start: '/* 계열별 세로 배치: 8행 고정', desc: '색 팔레트 그리드, 사이드바 오른쪽 붙이기, 작업 영역 체커·스테이지·카메라 3D 캔버스·프레임 가이드, 툴바' },
    { file: 'titlebar.css', start: '/* ===== 맨 위 제목줄', desc: '맨 위 제목줄(데스크톱 창 제목표시줄 겸용)·글자 메뉴·추출 버튼, 좁은 창, 테마 토글, 로고, 알림, 드롭다운' },
    { file: 'start-tour.css', start: '/* 처음 켰을 때 빈 화면 + 안내', desc: '시작 화면(빈 아트보드), 둘러보기(투어) 오버레이, 파일 드롭 안내, CG 구성 열기 버튼' },
    { file: 'cg-setup.css', start: '/* ===== CG 구성 모달', desc: 'CG 구성 모달(옅은 틴트 머리·2판·선택 카드·창 안 알림·바닥 버튼·좁은 창)' },
    { file: 'export-dialog.css', start: '/* ===== 이미지로 추출 팝업', desc: '이미지로 추출 팝업(CG 구성 모양 재사용 + 묶음 3판 색·빠른 선택·장수 배지·흐린 카드·렌더 진행·창 안 알림 버튼·좁은 창)' },
    { file: 'menus-windows.css', start: '.menuDrop > .sec { border: none; }', desc: '제목줄 메뉴 드롭다운 안 섹션·설정(렌치) 메뉴·기능 확장팩 줄, 떼어낸 창(탭·크기 조절·도킹 미리보기·붙을 자리)' },
    { file: 'timeline.css', start: '/* ===== 타임라인 (하단) ===== */', desc: '타임라인, 추출 진행 바, 영상 추출 집중 모드, 카메라 키 편집·팝오버' },
    { file: 'dialogs.css', start: '/* 인증키가 없을 때만 뜨는 안내', desc: '인증키 안내, 특보 불러오기 결과 카드·빈 상태 카드, 알림 색 점, API 설정 창, 확인 모달, 배치 지정하기 모달·플로피' },
    { file: 'panel-misc.css', start: '/* ===== 통보문 색칠 박스', desc: '통보문·예보 API 박스(예보 API 묶음 접기), 링크 버튼, 칠한 색 목록·경고 배너, 최근 파일, 이미지 안내 팝업, 마우스 배지, 안내/완료 토스트·체크 모션, 브러쉬 영역 강조' },
    { file: 'toss-modal.css', start: '/* ===== 토스 카드 모달 (공지·안내 공통)', desc: '토스 카드 모달, 공지 목록·작성, 접이식 묶음, 렌더 가리개, 참고 이미지 드롭, 토글 스위치, 지도 배경 버튼, 브러쉬 원·산 히트·가이드(포인터 통과)' },
    { file: 'busy-fx.css', start: '/* ===== 작업 중·도착 효과', desc: '작업 중·도착 효과(js/busy-fx.js): 흐르는 그라디언트·버튼 진행·제목줄 버튼 흐름·진행 막대·빛 훑는 자리표시 막대·도착 빛, 렌더 가리개 흐름, 움직임 줄이기' },
  ],
  cssUrlRebase: 9,   // @font-face 글꼴 url() 개수(Pretendard 2 + SUITE 7). 달라지면 멈춘다.
};

// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(opt('src', path.join(ROOT, 'index.html')));
const OUT = path.resolve(opt('out', path.dirname(SRC)));
const CHECK = args.includes('--check');
const VERBOSE = args.includes('--verbose');
const fail = (msg) => { console.error('중단: ' + msg); process.exit(1); };
const count = (hay, needle) => hay.split(needle).length - 1;
if (!acorn && !args.includes('--no-acorn')) fail('acorn(Node 내장)을 못 읽음 — 문장 경계를 확인할 수 없다(--no-acorn이면 글자 규칙만으로 계속)');

// --like: 지금 분할본의 파일 목록·머리 설명·각 파일 첫 의미 줄로 기준표를 만든다
if (opt('like', '')) {
  const likeHtml = path.resolve(opt('like', ''));
  const dir = path.dirname(likeHtml);
  const h = fs.readFileSync(likeHtml, 'utf8').replace(/\r\n/g, '\n');
  // 표지 = 파일의 첫 의미 줄(js는 빈 줄·'//' 주석 다음 첫 코드 줄). 한 줄로 유일하지 않으면 아래 줄을 덧붙여 유일하게 만든다(원본을 읽은 뒤 확정).
  const firstLines = (rel, headLines, isCss) => {
    const text = fs.readFileSync(path.join(dir, rel), 'utf8').replace(/\r\n/g, '\n');
    const body = (isCss ? appSource.unrebaseCss(text) : text).split('\n').slice(headLines);
    const desc = /— (.*) \*\/$/.exec(text.split('\n')[0]);
    const i = isCss ? 0 : body.findIndex((l) => !(/^\s*$/.test(l) || /^\/\//.test(l)));
    const ls = body.slice(i); if (isCss) ls[0] = ls[0].replace(/^[ \t]+/, '');
    return { lines: ls, desc: desc ? desc[1] : '', lead: i };
  };
  MAP.js = [...h.matchAll(/<script src="js\/([\w.-]+\.js)(?:\?[^"]*)?"><\/script>/g)].map((m) => {
    const f = firstLines('js/' + m[1], 2, false);
    return { file: m[1], lines: f.lines, desc: f.desc, back: f.lead };
  });
  MAP.css = [...h.matchAll(/<link rel="stylesheet" href="css\/([\w.-]+\.css)(?:\?[^"]*)?">/g)].map((m) => { const f = firstLines('css/' + m[1], 1, true); return { file: m[1], lines: f.lines, desc: f.desc }; });
  if (!MAP.js.length || !MAP.css.length) fail('--like: 분할본에서 js/·css/ 태그를 못 찾음');
  console.log(`--like: 기준표를 ${likeHtml}에서 만듦(js ${MAP.js.length}, css ${MAP.css.length})`);
}

// ---------- 0) 읽기 ----------
const raw = fs.readFileSync(SRC, 'utf8');
if (raw.charCodeAt(0) === 0xfeff) fail('BOM이 있음');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
if (EOL === '\r\n' && /[^\r]\n/.test(raw)) fail('CRLF/LF가 섞여 있음');
const src = raw.replace(/\r\n/g, '\n');
for (const m of MAP.js.concat(MAP.css)) {
  if (!m.lines) continue;   // --like 표지 확정
  let k = 0; m.start = m.lines[0];
  while (count(src, m.start) > 1 && k + 1 < m.lines.length) m.start += '\n' + m.lines[++k];
}
if (/<script src="js\//.test(src) || /<link rel="stylesheet" href="css\//.test(src)) fail('이미 분할된 index.html');
if (!CHECK && !args.includes('--force') && (fs.existsSync(path.join(OUT, 'js')) || fs.existsSync(path.join(OUT, 'css')))) fail(`${OUT}에 js/ 또는 css/가 이미 있음(--force로 덮어쓰기)`);
for (const m of MAP.js.concat(MAP.css)) {
  if (/\*\/|\n/.test(m.desc)) fail(`${m.file}: 설명에 */나 줄바꿈`);
  if (!/^[a-z0-9-]+\.(js|css)$/.test(m.file)) fail(`${m.file}: 파일 이름은 소문자·숫자·하이픈만`);
}

// ---------- 1) JS: 메인 IIFE 본문('use strict'가 있는 그 블록 하나) ----------
const JS_OPEN = "\n<script>\n(() => {\n'use strict';\n", JS_CLOSE = '\n})();\n</script>\n';
if (count(src, JS_OPEN) !== 1) fail(`메인 IIFE 시작이 정확히 1개가 아님(${count(src, JS_OPEN)})`);
const jsTagStart = src.indexOf(JS_OPEN) + 1;                 // '<script>' 위치
const bodyStart = jsTagStart + JS_OPEN.length - 1;
const closeAt = src.indexOf(JS_CLOSE, bodyStart);
if (closeAt < 0 || count(src.slice(bodyStart), JS_CLOSE) !== 1) fail('메인 IIFE 끝(})(); </script>)이 정확히 1개가 아님');
const bodyEnd = closeAt + 1;                                  // '})();' 앞(마지막 줄바꿈 뒤)
const jsTagEnd = closeAt + JS_CLOSE.length - 1;               // '</script>' 끝
const body = src.slice(bodyStart, bodyEnd);

// 표지 → 시작 위치. 표지 바로 위의 빈 줄·'//' 주석 줄은 그 파일로 함께 간다(앞 파일 표지는 넘지 않음, walk:false면 안 가져감).
const lineStartsOf = (s) => { const a = [0]; for (let i = 0; i < s.length; i++) if (s[i] === '\n') a.push(i + 1); return a; };
function cutPoints(text, list, { walkUp, allowIndent, firstAtZero }) {
  const ls = lineStartsOf(text);
  const pts = [];
  list.forEach((m, k) => {
    const n = count(text, m.start);
    if (n !== 1) fail(`${m.file}: 시작 표지가 ${n}번 나옴(정확히 1번이어야): ${JSON.stringify(m.start)}`);
    const at = text.indexOf(m.start);
    const lineAt = text.lastIndexOf('\n', at - 1) + 1;
    if (!(allowIndent ? /^[ \t]*$/.test(text.slice(lineAt, at)) : lineAt === at)) fail(`${m.file}: 표지가 줄 맨 앞이 아님`);
    let p = lineAt;
    if (k === 0 && firstAtZero) {
      if (!/^(\s*(\/\/[^\n]*)?\n)*[ \t]*$/.test(text.slice(0, lineAt))) fail(`${m.file}: 첫 표지 앞에 코드가 있음`);
      p = 0;
    } else if (typeof m.back === 'number') {   // --like: 그 파일이 표지 위로 정확히 몇 줄(빈 줄·주석)을 갖고 있었는지
      const li = ls.indexOf(p) - m.back;
      if (li < 0) fail(`${m.file}: 표지 위 ${m.back}줄이 없음`);
      p = ls[li];
    } else if (walkUp && m.walk !== false) {
      let li = ls.indexOf(p);
      while (li > 0) {
        const prev = text.slice(ls[li - 1], ls[li] - 1);
        if (!(/^\s*$/.test(prev) || /^\/\//.test(prev))) break;
        if (pts.length && ls[li - 1] <= pts[pts.length - 1]) break;
        li--;
      }
      p = ls[li];
    }
    if (pts.length && p <= pts[pts.length - 1]) fail(`${m.file}: 표지 순서가 원본 순서와 다름`);
    pts.push(p);
  });
  return pts;
}
const jsPts = cutPoints(body, MAP.js, { walkUp: true, firstAtZero: true });
const jsSlices = MAP.js.map((m, k) => ({ ...m, rel: `js/${m.file}`, text: body.slice(jsPts[k], k + 1 < jsPts.length ? jsPts[k + 1] : body.length) }));

// ---------- 2) JS 검사 ----------
const problems = [];
// 2-1) acorn: 경계가 최상위 문장 시작과 정확히 맞는지(문장 중간·문자열·템플릿·정규식 속 절단 없음, ASI로 앞 문장과 이어 붙던 곳 없음)
if (acorn) {
  const pre = "(() => {\n'use strict';\n";
  const ast = acorn.parse(pre + body + '})();', { ecmaVersion: 'latest', sourceType: 'script' });
  const stmts = ast.body[0].expression.callee.body.body;
  const starts = new Set(stmts.map((s) => s.start - pre.length));
  const firstCode = (t, from) => { const re = /(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/y; re.lastIndex = from; re.exec(t); return re.lastIndex; };
  jsPts.forEach((p, k) => {
    if (k === 0) return;
    if (!starts.has(firstCode(body, p))) problems.push(`${MAP.js[k].file}: 경계 뒤 첫 코드가 최상위 문장 시작이 아님(문장 중간 절단)`);
  });
  // 최상위 같은 이름 함수(원본에선 '뒤가 이김'이지만 나누면 로드 중엔 앞 것이 불림 → 0이어야)
  const seen = new Set();
  for (const s of stmts) if (s.type === 'FunctionDeclaration') { if (seen.has(s.id.name)) problems.push(`같은 이름 최상위 함수 2번: ${s.id.name}`); seen.add(s.id.name); }
} else {
  console.warn('경고: --no-acorn — 문장 경계는 글자 규칙(앞 끝 ;/}, 뒤 첫 글자 식별자)으로만 검사');
}
// 2-2) 글자 규칙(항상): 앞 파일 마지막 코드 글자 ';' 또는 '}', 다음 파일 첫 코드가 식별자/키워드(in·instanceof·of 제외)
jsSlices.forEach((m, k) => {
  if (k === 0) return;
  const prevCode = jsSlices[k - 1].text.replace(/(?:\s|\/\/[^\n]*\n)*$/, '');
  if (!/[;}]$/.test(prevCode)) problems.push(`${jsSlices[k - 1].file}: 끝 코드가 ';'나 '}'로 안 끝남(ASI 위험)`);
  const fm = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*([^\s])(\w*)/.exec(m.text);
  const first = fm ? fm[1] + fm[2] : '';
  if (!/^[A-Za-z_$]\w*$/.test(first) || /^(in|instanceof|of)$/.test(first)) problems.push(`${m.file}: 첫 코드가 식별자가 아님(ASI 위험): ${first.slice(0, 20)}`);
});
// 2-3) 파일마다 따로 컴파일(strict 포함) + 태그 순서대로 이어 붙여 한 번 컴파일(파일 사이 let/const/class 중복·function↔let 충돌)
const head = (m) => `/* [모듈] ${m.rel} — ${m.desc} */\n'use strict';\n`;
jsSlices.forEach((m) => { try { new vm.Script(head(m) + m.text, { filename: m.rel }); } catch (e) { problems.push(`${m.rel} 단독 컴파일 실패: ${e.message}`); } });
try { new vm.Script(jsSlices.map((m) => head(m) + m.text).join(''), { filename: 'js/(전체)' }); } catch (e) { problems.push(`전체 이어 붙여 컴파일 실패: ${e.message}`); }
if (/<\/script|<!--/i.test(body)) problems.push('IIFE 본문에 </script 또는 <!-- 가 있음(appSource 왕복이 깨질 수 있음)');

// ---------- 3) CSS(id 없는 메인 <style> 하나) ----------
const CSS_OPEN = '\n<style>\n', CSS_CLOSE = '\n</style>\n';
if (count(src, CSS_OPEN) !== 1) fail(`메인 <style>이 정확히 1개가 아님(${count(src, CSS_OPEN)})`);
const cssTagStart = src.indexOf(CSS_OPEN) + 1;
const cssStart = cssTagStart + CSS_OPEN.length - 1;
const cssCloseAt = src.indexOf(CSS_CLOSE, cssStart);
const cssEnd = cssCloseAt + 1, cssTagEnd = cssCloseAt + CSS_CLOSE.length - 1;
if (cssCloseAt < 0 || cssTagEnd > jsTagStart) fail('메인 <style>이 IIFE보다 뒤에 있거나 닫히지 않음(예상 밖 구조)');
const css = src.slice(cssStart, cssEnd);
const cssPts = cutPoints(css, MAP.css, { walkUp: false, allowIndent: true, firstAtZero: true });
// 경계가 중괄호 깊이 0인지(주석·문자열·url( ) 안은 건너뜀)
function depthAt(s, end) {
  let d = 0;
  for (let i = 0; i < end; i++) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); if (j < 0 || j >= end) return NaN; i = j + 1; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < end && s[j] !== c) { if (s[j] === '\\') j++; j++; } i = j; continue; }
    if (s.startsWith('url(', i)) {
      let j = i + 4; while (/\s/.test(s[j])) j++;
      if (s[j] === '"' || s[j] === "'") { const q = s[j]; j++; while (j < end && s[j] !== q) { if (s[j] === '\\') j++; j++; } }
      j = s.indexOf(')', j); if (j < 0) return NaN; i = j; continue;
    }
    if (c === '{') d++; else if (c === '}') d--;
  }
  return d;
}
cssPts.forEach((p, k) => { const d = depthAt(css, p); if (d !== 0) problems.push(`${MAP.css[k].file}: 경계의 중괄호 깊이가 ${d}(규칙 중간 절단)`); });
if (/url\(\s*['"]?\.\.\//.test(css)) fail("원본 CSS에 이미 url('../…')가 있음 — 왕복 규칙이 모호해짐");
// 문서 기준 상대 url → css/ 기준('../' 붙임). data:·http:·/절대·#조각은 그대로. (app-source.cjs unrebaseCss의 정확한 역)
// 처음 분할(기준표) 때는 바꾸는 url이 모두 @font-face { … src: … } 안이어야 한다(주석·문자열 속 url(을 잘못 바꾸지 않게).
// --like 왕복(appSource가 '../'를 뗀 것을 다시 붙임)에서는 unrebaseCss와 정확한 역이라 이 제한을 끈다 —
// 분할 뒤 css에 새로 쓴 url('../icon.svg') 같은 상대 url(@font-face 밖)도 그대로 왕복된다.
let rebased = 0;
const rebaseCss = (s) => s.replace(/(url\(\s*['"]?)([^'")\s]+)/gi, (all, pre, u, at) => {
  if (/^(?:[a-z][\w+.-]*:|\/|#)/i.test(u)) return all;
  const ff = s.lastIndexOf('@font-face', at);
  if (!opt('like', '') && (ff < 0 || s.slice(ff, at).includes('}') || !/\bsrc\s*:/.test(s.slice(ff, at)))) problems.push(`@font-face src 밖의 상대 url: ${u}`);
  rebased++; return pre + '../' + u;
});
const cssSlices = MAP.css.map((m, k) => ({ ...m, rel: `css/${m.file}`, text: rebaseCss(css.slice(cssPts[k], k + 1 < cssPts.length ? cssPts[k + 1] : css.length)) }));
if (rebased !== MAP.cssUrlRebase && !opt('like', '')) problems.push(`CSS url 재기준 ${rebased}곳 — 기대 ${MAP.cssUrlRebase}곳(글꼴이 늘거나 줄었으면 기준표를 고친다)`);
if (/@import|@charset/i.test(css)) problems.push('CSS에 @import/@charset — 위치 규칙 확인 필요');

if (problems.length) fail('검사 실패\n - ' + problems.join('\n - '));

// ---------- 4) 새 index.html (임시 폴더에 먼저 만든다. 뒤 블록부터 바꿔 위치가 안 밀리게) ----------
const files = [
  ...jsSlices.map((m) => ({ rel: m.rel, text: head(m) + m.text })),
  ...cssSlices.map((m) => ({ rel: m.rel, text: `/* [모듈] ${m.rel} — ${m.desc} */\n` + m.text })),
];
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-split-'));
const toEol = (s) => (EOL === '\n' ? s : s.replace(/\n/g, EOL));
for (const f of files) { fs.mkdirSync(path.join(stage, path.dirname(f.rel)), { recursive: true }); fs.writeFileSync(path.join(stage, f.rel), toEol(f.text)); }
const vtag = (rel) => `${rel}?v=${versionOf(path.join(stage, rel))}`;
const jsTags = jsSlices.map((m) => `<script src="${vtag(m.rel)}"></script>`).join('\n');
const cssTags = cssSlices.map((m) => `<link rel="stylesheet" href="${vtag(m.rel)}">`).join('\n');
let html = src.slice(0, jsTagStart) + jsTags + src.slice(jsTagEnd);
html = html.slice(0, cssTagStart) + cssTags + html.slice(cssTagEnd);
fs.writeFileSync(path.join(stage, 'index.html'), toEol(html));

// ---------- 5) 왕복 검사: appSource(분할본) === 원본(바이트까지, 줄바꿈 포함) ----------
const back = appSource(path.join(stage, 'index.html'));
if (back !== src || toEol(back) !== raw) {
  let i = 0; while (i < back.length && back[i] === src[i]) i++;
  fs.rmSync(stage, { recursive: true, force: true });
  fail(`왕복 불일치 @${i}: 원본 ${JSON.stringify(src.slice(i, i + 80))} / 재구성 ${JSON.stringify(back.slice(i, i + 80))}`);
}

// ---------- 6) 보고 · 쓰기 ----------
const lines = (s) => s.split('\n').length - 1;
console.log(`js ${jsSlices.length}개(${jsSlices.reduce((a, m) => a + lines(m.text), 0)}줄) · css ${cssSlices.length}개(${cssSlices.reduce((a, m) => a + lines(m.text), 0)}줄) · url 재기준 ${rebased}곳 · 줄바꿈 ${JSON.stringify(EOL)} · acorn ${acorn ? '사용' : '안 씀'} · 왕복 바이트 일치`);
const srcLineOf = (() => { const ls = lineStartsOf(src); return (off) => { let lo = 0, hi = ls.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ls[mid] <= off) lo = mid; else hi = mid - 1; } return lo + 1; }; })();
const report = (slices, pts, base) => slices.forEach((m, k) => {
  const a = srcLineOf(base + pts[k]); const n = lines(m.text);
  console.log(`  ${m.rel.padEnd(24)} ${String(n).padStart(5)}줄  원본 ${a}–${a + n - 1}`);
  if (VERBOSE) { const t = m.text.split('\n'); console.log('      ┌ ' + t.slice(0, 3).map((x) => x.slice(0, 90)).join('\n      │ ') + '\n      └ … ' + t.slice(-3, -1).map((x) => x.slice(0, 90)).join(' ⏎ ')); }
});
report(jsSlices, jsPts, bodyStart);
report(cssSlices, cssPts, cssStart);
if (CHECK) { fs.rmSync(stage, { recursive: true, force: true }); console.log('--check: 쓰지 않음'); process.exit(0); }
for (const f of files.concat([{ rel: 'index.html' }])) {
  const dst = path.join(OUT, f.rel); fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(stage, f.rel), dst);
}
fs.rmSync(stage, { recursive: true, force: true });
console.log(`썼음 → ${OUT}`);
