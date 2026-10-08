# 날씨 CG 메이커 — 모듈 지도 (먼저 읽을 것)

이 앱은 2026-10-08부터 **기능별 파일로 나뉘어 있다.** `index.html`은 뼈대(head·마크업·데이터 스크립트)와 태그뿐이고,
로직은 `js/*.js`(32개), 스타일은 `css/*.css`(11개)에 있다. 나눌 때 기존 코드는 한 줄도 바꾸지 않았다(아래 '분할 이력').

- Claude·GPT 등 AI 공용 안내는 [`AGENTS.md`](AGENTS.md). 이 문서는 그 자세한 판이다.
- 함수 찾기: `grep -nE "^(async )?function 이름\b|^(const|let) 이름\b" js/*.js`
  (`index.html`에서 함수 본문을 찾지 말 것 — 거기엔 없다. `const 이름 = (…) =>` 꼴 함수도 많아서 `function`만 찾으면 놓친다.)

---

## 1. 구조

```
index.html          뼈대: head 인라인(서비스워커 등록·모듈 로드 실패 가드·배치 슬롯·글꼴 주입) + <link css/…> 11개
                    + 마크업 + 테마 + 데이터 스크립트 12개 + <script src="js/…"> 32개(맨 끝)
js/                 앱 로직 32개 — 아래 표 순서가 곧 로드 순서
css/                스타일 11개 — 아래 표 순서가 곧 덮어쓰기 우선순위
*.js (루트)          데이터 스크립트(지도·글꼴·이미지·배치 — window.X = … 꼴, 앱 로직 아님)
FontNew/            글꼴 파일(css/base.css의 @font-face가 ../FontNew/ 로 가리킴)
sw.js               서비스워커(웹판 설치·오프라인, network-first)
tools/              분할·검사 도구(아래 6장)
tests/              node --test 테스트(앱 코드는 tools/app-source.cjs로 합쳐 읽는다)
desktop/            데스크톱 앱(Electron 껍데기 + 내장 헬퍼 wns/) — 상위 폴더 index.html을 그대로 띄운다
```

## 2. 반드시 지킬 규칙

1. **`<script>`/`<link>` 태그 순서를 바꾸지 않는다.** `defer`·`async`·`type="module"`을 붙이지 않는다(실행 순서가 바뀐다).
   새 파일을 넣거나 순서를 바꾸면 아래 표도 함께 고쳐야 테스트(`tests/split-structure.test.cjs`)가 통과한다.
2. **파일 머리를 지우지 않는다.** js는 2줄(`/* [모듈] js/이름.js — 설명 */` + `'use strict';`), css는 1줄(`/* [모듈] css/이름.css — 설명 */`).
   `'use strict'`가 빠지면 그 파일만 느슨한 모드가 되어 오타 대입이 조용히 전역이 된다.
3. **호이스팅은 파일을 넘지 못한다.** 로드 때 바로 실행되는 최상위 코드(리스너 등록·`const x = f()`·즉시 실행)는
   **앞 파일**에 있는 이름만 쓸 수 있다. 새 최상위 실행 코드는 `boot.js`에 두거나, 쓰는 이름이 모두 앞 파일에 있는 곳에 둔다.
   함수 본문·이벤트 핸들러·타이머 콜백 안은 상관없다(부팅 뒤에 실행되므로). 검사: `node tools/load-order.cjs`.
4. **부팅 뒤를 가정하는 setTimeout·rAF·then도 boot.js에** 둔다. 파일과 파일 사이에 브라우저가 다른 일을 끼워 넣을 수 있다.
   (지금 예외 1곳: `wiring.js`의 `anim-ready` 80ms 타이머 — 화면 전환 애니메이션만 영향, 수용. 테스트 허용 목록에 있음)
5. **같은 이름 함수를 두 파일에 만들지 않는다.** 최상위 `let/const/class` 이름도 파일 사이에 겹치면 뒤 파일 전체가 SyntaxError로 안 돈다.
   최상위 `var`는 쓰지 않는다.
6. **예약 이름 금지**: `window document location top self parent frames opener NaN Infinity undefined globalThis`(브라우저 고정 전역),
   `wcgDesktop`(데스크톱 preload), `_per _mas`(head 인라인 var), 데이터 전역 12개(`WCG_DEFAULTS KOREA_MAP …` — 데이터는
   `const X = window.X …` 꼴로만 읽는다). window 내장(`name open close print fetch …`)을 가리는 새 최상위 이름도 금지.
   예외는 옛날부터 있던 `function status`(window.status를 대체 — 앱 안에서 window.status를 안 씀) 하나.
7. **최상위 리스너 등록문을 다른 파일로 옮기지 않는다.** 같은 대상·같은 이벤트(svg pointerdown, window keydown 등)는
   등록 순서 = 실행 순서다(typhoon-panel 캡처 → view-camera → pointer-drag, pointer-drag 단축키 → wire()의 keydown).
8. `wiring.js`의 사이드바 정리 IIFE와 `refreshToolGroup`은 같은 파일에 둔다(IIFE가 같은 파일 안 함수 호이스팅에 기댄다).
9. **요소는 항상 `$('#id')`로 잡는다.** 요소 id와 같은 전역 이름이 19개 있다(`undo` `stage` `apiKey` `wins` …) — 이름으로 요소를 부르면 함수·변수가 나온다.
   앱 이름에 `window.이름 =` 대입을 하지 않는다(함수를 덮어쓴다).
10. 경로는 항상 **상대 경로**(`js/…`, `css/…`). `/js/…`는 Pages 하위 경로에서 깨진다. css 안 상대 url은 `../`로 시작해야 한다(css/ 기준).
11. 파일 이름은 **소문자·숫자·하이픈**만(`^[a-z0-9-]+\.(js|css)$`). 대소문자만 바꾼 이름은 Windows git이 못 잡아 Pages에서 404가 난다.
    모듈 폴더 이름으로 `desktop`·`node_modules`·`.git…`을 쓰지 않는다(데스크톱 앱이 403으로 막는다).
12. js 안에 `</script` 문자열을 쓰지 않는다(`<\/script`로). 테스트 재조립이 깨진다.
13. **디버그 eval·콘솔**: 앱 이름이 이제 전역이라 최상위 `const $ = …`·`let S` 같은 선언은 SyntaxError가 난다.
    `(() => { … })()`로 감싸고, 앱 전역(`S` `sel` `mode` `status` …)에는 **대입하지 않는다**(1.5초 뒤 자동 저장으로 실제 작업에 남는다).
    함수는 `window.renderAll`로도 보이지만 let/const는 맨이름으로만 보인다(`window.S`는 undefined).

## 3. JS 모듈 (로드 순서 = 아래 순서)

줄 수는 분할 시점 값(참고용).

| # | 파일 | 줄 | 담당 | 대표 함수·이름 |
|---|---|---|---|---|
| 1 | `js/core.js` | 192 | 공통 도우미, 색 팔레트, 기본 상태 `DEFAULTS`·`S`, 선택 도우미, MAP/IMG 데이터 보정, 지도 종류 판별 | `$` `el` `tip` `svgNS` `RAMPS` `DEFAULTS` `S` `isTyphoon` `isSeoul` `curStyle` `fills` `bumpSeq` |
| 2 | `js/brush.js` | 581 | 브러쉬 덧칠 엔진: 공간 캐시·색 런 캔버스·증분 적용·되돌리기 조각, `<image>` 반영, PNG 인코딩 워커 | `brushApply` `brushRevert` `brushReconcile` `brushSyncImgs` `brushEncode` `brushPublish` `brushFinalize` |
| 3 | `js/brush-ui.js` | 228 | 브러쉬 화면·입력: 라이브 캔버스·스포이드, 시도 영역 선택, 칠하기 드래그, 좌표 변환 | `renderBrush` `brushLiveOf` `toggleBrushRegion` `startBrush` `projLL` `xyToLonLat` `insetBBox` |
| 4 | `js/map-build.js` | 409 | 실행 취소, SVG 뼈대 구성, 지도 스타일 전환, CG 종류/배경 버튼 | `pushUndo` `undo` `redo` `applyState` `svg` `buildFrame` `buildZones` `setStyle` |
| 5 | `js/map-render.js` | 409 | 지도 렌더: 위치·잠금, 예보지도 연결, Mapbox 타일·위성, 인셋, 칠, 경계선, 바다, 배경 | `renderMapTransform` `wireMapPos` `renderFills` `renderBg` |
| 6 | `js/vf-legend.js` | 386 | VF 막대·배율, 그림자, 제목 텍스트, 범례(특보·태풍 범례 목록) | `renderVfBar` `renderTexts` `renderLegend` |
| 7 | `js/labels-mountains.js` | 445 | 수치 라벨, 칠한 색 계열 바꾸기·자동 라벨, 산 표시, 선택 상자, **renderAll** | `newLabel` `renderLabels` `swapRamp` `autoLabels` `renderMtns` `renderSel` `renderAll` |
| 8 | `js/typhoon-core.js` | 505 | 태풍: 좌표·카메라 투영, 기본값·등급·날짜 범위, 스타일, 데이터 초기화, 범례 카탈로그, 아이콘·반경 | `typhoonXY` `applyTyphoonStyle` `initTyphoonData` `typhoonIconEl` |
| 9 | `js/typhoon-render.js` | 753 | 태풍 그리기: 예보 비교 경로·라벨, 진로선, 지명표시, 제목, 재생 | `drawCompareTracks` `drawTyphoonTrack` `renderTyphoon` |
| 10 | `js/typhoon-panel.js` | 567 | 태풍 패널 UI: 비교 카드, 패널·밴드, 펜툴, 참고 이미지 | `addCompareForecast` `buildTyphoonPanel` `startPen` `wireTyphoonPanel` |
| 11 | `js/typhoon-api.js` | 431 | 태풍 데이터: 기상청 typ/td 파싱, JMA·JTWC, 이름 저장, 불러오기 | `parseTypNow` `fetchTyphoon` `typhoonApiUrl` |
| 12 | `js/panels.js` | 608 | 사이드바 패널(팔레트·인셋·목록·섹션 열기), 캔버스 요소 → 섹션 자동 열기, 선택, 칠하기 | `buildPalette` `revealSec` `select` `refreshPanel` `syncPanelFromState` `paint` `markActive` |
| 13 | `js/view-camera.js` | 305 | 작업창 줌·맞춤·틸트 래스터, 더블클릭 인라인 편집, Alt 카메라 조작 | `sizeFit` `applyView` `inlineEdit` |
| 14 | `js/pointer-drag.js` | 512 | 캔버스 포인터(칠·선택), 브러쉬 커서, 드래그·스냅, 리사이즈, **키보드 단축키**, 삭제·모드 | `dragLoop` `startDragItem` `delSel` `setMode` |
| 15 | `js/warnings.js` | 384 | 기상특보 파싱·단계 색·발효 순서, 불러오기 결과 판정·문구 | `parseWrn` `wrnColorOf` `wrnReadText` `wrnHttpFail` `wrnResultView` |
| 16 | `js/warnings-apply.js` | 403 | 기상청 API 주소·키(예보·태풍도 씀), 특보 런타임 목록, 특보 적용·칠·발효 현황·목록 | `apiKey` `apiUrl` `applyWrn` `paintWrn` `buildWrnList` |
| 17 | `js/bulletin.js` | 664 | 기상예보 파싱·색, 통보문 강수량 붙여넣기(용어 사전·지역 표현 파서) | `parseFct` `parseBulletin` `applyBulletin` |
| 18 | `js/forecast-panel.js` | 324 | 예보 적용·목록, 작업 런타임 초기화, 특보 불러오기·결과 카드 | `applyFct` `resetWorkRuntime` `fetchWrn` `buildWrnCols` |
| 19 | `js/presets.js` | 266 | 해상도별 배치 프리셋, **작업 자동 저장**, 배포 기본값 갱신 | `savePreset` `saveWork` `loadWork` `applyPreset` |
| 20 | `js/cg-setup.js` | 386 | 해상도·CG 구성 창, **상태 표시**, 출력 폴더, 팝업 닫힘 애니메이션, **토스 카드 모달** | `RES` `openCgSetup` `status` `flash` `prepareOutput` `popAnimClose` `tossModal` |
| 21 | `js/notices.js` | 265 | 공지사항, 내보내기 진행 마스크, 확인/입력 모달 | `checkNoticeOnBoot` `showExportMask` `tossConfirm` `tossPrompt` |
| 22 | `js/preset-slots.js` | 251 | 배치 지정하기(완전 기본/개인 슬롯, 구운 배치 파일) | `openPresetSlots` `buildCurrentPresets` |
| 23 | `js/export-image.js` | 314 | 이미지 추출 공통: 출력 글꼴 임베드, 카메라 레이어, 텍스트 오버레이, 3D 틸트 워프 | `suiteFontCss` `svgToImage` `drawExportFrame` |
| 24 | `js/export-video.js` | 606 | 정확 MP4·PNG 시퀀스, 로컬 헬퍼(WNS) 연결·상태(렌치 빨간 점·기능 확장팩 줄)·렌더, blob | `bakeMp4` `pingHelper` `checkHelperFreshOnBoot` `wnsRender` `exportBlobs` |
| 25 | `js/ae-export.js` | 572 | After Effects 보내기, doExport, 추출 선택, 다운로드 | `sendToAE` `doExport` `download` |
| 26 | `js/project-io.js` | 325 | 설정 옮기기, 프로젝트 저장/열기, 최근 파일, 기본 배치 굽기 | `exportSettings` `importSettings` `saveProject` `bakeDefaults` |
| 27 | `js/wiring.js` | 778 | 버튼·입력 배선 `wire()`(함수 하나) + 사이드바 그룹 정리(로드 때 실행) | `wire` `refreshToolGroup` |
| 28 | `js/anim.js` | 538 | 영상 애니메이션: 이징, 카메라 키프레임, 자동 트랙, 재생/정지/탐색 | `cubicBezier` `renderAnimFrame` `animPlay` `animStop` |
| 29 | `js/timeline-ui.js` | 377 | 타임라인 UI(막대·키 드래그·카메라 키 팝오버) | `buildTimeline` `openCamKeyPopover` |
| 30 | `js/floating-panels.js` | 670 | 떼어낸 창, 패널 크기, 레이아웃, **제목줄 메뉴(추출·프로젝트·설정(렌치))**, 시작 화면 | `popOut` `dockSec` `loadLayout` `setupMenus` `setupStartScreen` `showStartScreen` |
| 31 | `js/tour.js` | 200 | 둘러보기(온보딩 투어) | `tourOpen` `tourGo` `wireTour` |
| 32 | `js/boot.js` | 119 | 파일 끌어다 놓아 열기 + **앱 부팅 순서**(build·wire·loadLayout·renderAll, 이어 열기, 자동 저장 타이머) — **반드시 마지막** | `setupDropOpen` + 부팅 문장, `work` `freshOpen` `pendingStart` |

로드 때 다른 파일을 쓰는 곳(전부 앞 파일 → 순서가 맞다): `map-build`·`labels-mountains`·`wiring` → `core`, `typhoon-panel`·`pointer-drag` → `map-build`(`svg`), `view-camera` → `core`·`map-build`, `boot` → 거의 전부.

## 4. CSS 모듈 (순서 = 덮어쓰기 우선순위, 뒤가 이김)

| # | 파일 | 줄 | 담당 |
|---|---|---|---|
| 1 | `css/base.css` | 198 | 글꼴(@font-face — `../FontNew/`), 색 역할·토스 팔레트·팝업 공통 토큰(다크/라이트), html/body·앱 뼈대, 사이드바 바닥·footer, 작은 버튼 |
| 2 | `css/sidebar.css` | 245 | 토스 반사 카드, 아이콘 칩, 섹션 접기, 갈래 색, 근무표식 사이드바, 입력칸·버튼 높이·스와치·눈 버튼 |
| 3 | `css/stage.css` | 133 | 색 팔레트 그리드, 사이드바 오른쪽 붙이기, 작업 영역·스테이지·카메라 3D 캔버스·프레임 가이드, 툴바 |
| 4 | `css/titlebar.css` | 204 | 맨 위 제목줄(데스크톱 창 제목표시줄 겸용 — `--tbH`)·글자 메뉴·추출 버튼, 좁은 창, 테마 토글, 알림, 드롭다운 |
| 5 | `css/start-tour.css` | 102 | 시작 화면, 둘러보기 오버레이, 파일 드롭 안내, CG 구성 열기 버튼 |
| 6 | `css/cg-setup.css` | 141 | CG 구성 모달 |
| 7 | `css/menus-windows.css` | 165 | 제목줄 메뉴 드롭다운 안 섹션·설정(렌치) 메뉴·기능 확장팩 줄, 떼어낸 창(탭·크기 조절·도킹 미리보기) |
| 8 | `css/timeline.css` | 163 | 타임라인, 추출 진행 바, 영상 추출 집중 모드, 카메라 키 편집·팝오버 |
| 9 | `css/dialogs.css` | 171 | 인증키 안내, 특보 불러오기 결과 카드, 알림 색 점, API 설정 창, 확인 모달, 배치 지정하기 모달 |
| 10 | `css/panel-misc.css` | 141 | 통보문·예보 박스, 링크 버튼, 칠한 색 목록·경고, 최근 파일, 이미지 안내 팝업, 마우스 배지, 토스트, 브러쉬 영역 강조 |
| 11 | `css/toss-modal.css` | 158 | 토스 카드 모달, 공지, 접이식 묶음, 렌더 가리개, 참고 이미지 드롭, 토글 스위치, 지도 배경 버튼, 브러쉬 원·가이드 |

- css 안 상대 url은 **css/ 폴더 기준**이다(`url('../FontNew/…')`). js 안 경로(`fetch('FontNew/…')` 등)는 **문서 기준**이라 그대로다.
- `index.html`의 `<style id="fontEmbed">`(head, 글꼴 데이터 주입)와 SVG 안 `<style id="fontStyle">`(추출 때 JS가 채움)은 **옮기지 않는다.**

## 5. index.html에 남아 있는 것

| 자리 | 내용 |
|---|---|
| head 맨 앞 | 서비스워커 등록, `html.isDesktop` |
| 그 다음 | **모듈 로드 실패 가드**(7장) |
| | `default-presets.js` + 배치 슬롯으로 `WCG_DEFAULTS` 교체(`var _per/_mas`), `font-data.js` + `#fontEmbed`, Pretendard preload |
| | `<link rel="stylesheet" href="css/…?v=…">` 11개 |
| body | 마크업(사이드바·제목줄·모달·SVG 등) |
| 끝 | 테마(`data-theme`), 데이터 스크립트 10개(`onerror` 대체값), `<script src="js/…?v=…">` 32개 |

## 6. 공용 도우미 위치

| 이름 | 파일 |
|---|---|
| `$` `el` `tip` `svgNS` `DEFAULTS` `S` `curStyle` `isTyphoon` | `core.js` |
| `pushUndo` `undo` `redo` `svg` `buildFrame` `setStyle` | `map-build.js` |
| `renderAll` `renderLabels` `renderMtns` `renderSel` | `labels-mountains.js` |
| `select` `refreshPanel` `syncPanelFromState` `revealSec` | `panels.js` |
| `apiKey` `apiUrl` | `warnings-apply.js` |
| `saveWork` `loadWork` `applyPreset` | `presets.js` |
| `status` `flash` `tossModal` `popAnimClose` `popFocusIn` `RES` | `cg-setup.js` |
| `tossConfirm` `tossPrompt` | `notices.js` |
| `download` `doExport` | `ae-export.js` |
| `setupMenus` `showStartScreen` | `floating-panels.js` |

짧은 전역 이름(새 이름으로 쓰지 말 것): `$ el S sel mode seq view work fit snap svg anim hex clamp lerp one tip lum BGS MAP IMG RES tlH _te`,
boot.js 최상위 const `work freshOpen pendingStart tourWillOpen defaultsChanged slotReapply _prevDeploySig`.

## 7. 캐시 · 서비스워커 · 로드 실패 가드

- 태그마다 `?v=<파일 내용 해시 8자리>`가 붙는다. **고친 뒤에는 꼭 `node tools/stamp-version.cjs`**(낡으면 테스트가 실패한다).
- `sw.js`(v4): 페이지(탐색) 요청은 늘 서버에 다시 확인(`no-cache`), 나머지는 network-first + 오프라인 캐시.
  GitHub Pages는 `?v=` 쿼리를 무시하므로, 옛 index.html이 캐시에서 나오면 옛·새 파일이 섞일 수 있어 페이지만은 늘 새로 받는다.
- **모듈 로드 실패 가드**(index.html head 인라인): js/·css/ 중 하나라도 못 받거나(404·끊김) 모듈이 로드되며 실행 오류
  (문법 오류·이름 중복 포함, boot.js는 문법 오류만)를 내면 → 남은 파일과 boot.js를 실행하지 않고(`window.stop()`),
  localStorage 쓰기를 막고, '앱을 다 불러오지 못했어요 — 새로고침' 안내를 띄운다. 반쯤 깨진 앱이 하던 작업을 덮어쓰지 않게.
  기록은 `window.__wcgModFail`. 정상일 때는 오류 리스너 하나뿐이다. 부팅(boot.js) 중·부팅 뒤 실행 오류는 앱 오류라 건드리지 않는다.

## 8. 테스트 · 도구

| 명령 | 하는 일 |
|---|---|
| `node --test tests/*.test.cjs desktop/test/*.test.cjs` | 전체 테스트(Electron 없이). 구조 검사 `tests/split-structure.test.cjs` 포함 |
| `WCG_BOOT_CHECK=1 node --test tests/brush-incremental.test.cjs tests/cg-setup.test.cjs tests/ae-cluster-e.test.cjs` | 실제 앱을 숨김 Electron으로 띄워 눌러 보는 점검(느림) |
| `node desktop/test/boot-check.cjs . --wait=9000 [--eval=…] [--shot=…] [--size=WxH]` | 부팅·콘솔 오류 점검. `--eval`은 async 함수로 감싸 실행된다 |
| `node tools/stamp-version.cjs [--check]` | `?v=` 갱신 / 검사 |
| `node tools/load-order.cjs [--verbose]` | 로드 순서 정적 검사(뒤 파일 동기 참조 0이어야). 테스트도 돌린다 |
| `node tools/app-source.cjs index.html --out=<파일>` | 나뉜 앱을 '분할 전 한 파일' 텍스트로 합침(PowerShell `>` 대신 `--out`) |
| `node tools/verify-split.cjs <전> <후>` | 분할 커밋이 텍스트 무변경인지 git 객체로 증명 |
| `node tools/split-app.cjs` | 분할 도구(1회용 기록). `--like=index.html`로 같은 구조 재분할 |

- **테스트에서 앱 코드를 읽을 때는 `tools/app-source.cjs`를 쓴다**: `const appSource = require('../tools/app-source.cjs'); const html = appSource(path.join(__dirname, '..', 'index.html'));`
  결과는 분할 전 `index.html`과 같은 텍스트(줄바꿈 LF)라 예전처럼 함수를 잘라 쓸 수 있다. `index.html`을 `readFileSync`로 직접 읽으면 구조 테스트가 실패한다.
- 이 `app-source.cjs`는 근무표(work schedule)의 `swap-backend/app-source.cjs`와 **동작이 다르다**(이쪽은 머리 제거·IIFE 재구성·url 역변환까지 하는 정확한 역변환). 서로 복사하지 않는다.
- 데스크톱 개발판은 hot reload가 없다 — 고친 뒤 창에서 Ctrl+R.
- 로컬 웹 미리보기는 `npx serve`(ETag로 매번 재검증)나 Electron을 쓴다. `py -m http.server`는 휴리스틱 캐시로 옛 js를 줄 수 있다. 미리보기 전에 stamp.

## 9. 배포(GitHub Pages — 저장소 루트가 곧 사이트)

1. 고친다 → `node tools/stamp-version.cjs` → `node --test tests/*.test.cjs desktop/test/*.test.cjs`
2. `git add index.html js css <고친 다른 파일>` — **경로를 적어서**(`git add -A` 금지: 검사 산출물·임시 파일이 공개된다)
3. commit → push. `index.html`·`js/`·`css/`는 **한 커밋**에 함께 간다(따로 가면 Pages가 중간본을 배포해 옛·새가 섞인다).
4. Pages 반영(1–2분) 뒤 라이브 주소에서 콘솔 오류 0, js·css 200을 확인.
- GitHub 웹에서 고칠 때(GPT 등)는 github.dev(저장소에서 `.` 키)로 js·css와 index.html의 `?v=`를 **한 커밋**으로 올린다.
  `?v=`는 아무 새 8자리 16진수면 되고, 다음 stamp가 바로잡는다.
- 문서·코드 주석에 비밀번호·API 키를 쓰지 않는다(공개 저장소).

## 10. 데스크톱 앱 영향

없다. `desktop/main.js`는 상위 폴더를 `app://weathercg`로 서빙하고(js·css MIME 등록됨, `no-store`, `?v=`는 경로만 보므로 무해),
`desktop/test/boot-check.cjs`는 모듈 오류를 `EXC …@app://weathercg/js/x.js:줄`로 잡는다. 헬퍼(`desktop/wns`·`tools/wns-helper`)와 무관.
(옛 file:// 설치판 `배포/update.bat`은 파일 목록을 직접 나열해 js/·css/를 빠뜨린다 — 쓰려면 폴더 복사를 추가해야 한다. 저장소 밖.)

## 11. 분할 이력 · 되돌리기

- 분할 전 기준 커밋: `a6d0794`(한 파일 index.html, 16,626줄). 커밋: 도구+테스트 재배선 `7457f3a` → **기계 분할 `ae0343d`**
  → verify-split·--like `3df2455` → 로드 실패 가드·sw v4 `c75bc2d` → 문서·구조 테스트.
- 바꾼 것은 기계 변환 4종뿐: ① 메인 IIFE 껍데기 ② 파일 머리 ③ css @font-face url 9곳 `../` ④ 두 블록 → 태그(`?v=`).
  `node tools/verify-split.cjs 7457f3a ae0343d` → 바뀐 경로는 index.html·js·css뿐, 합친 결과가 분할 전과 바이트까지 같다.
- 동작이 같은지는 화면으로 확인했다: 시작 화면·CG 구성 창·시도군·시도·특보·태풍·태풍 비교·서울·설정 메뉴(어두운/밝은) 16장면에서
  SVG 해시·화면 요소 계산 스타일 해시·CSS 규칙 수(862)·로드된 글꼴·콘솔 오류 0이 분할 전과 같고 스크린샷 픽셀 차이 0.
  달라진 것은 정해진 것뿐: 스타일시트 수 3→13, body의 script 태그 사이 빈 줄 31개, @font-face url 글자(`../`),
  CRLF 작업트리에서만 줄바꿈이 든 CSS 값 1곳의 `\r`(저장소·Pages는 LF라 같음, 렌더 결과 같음).
- **한 파일로 되돌리기(비상)**: `node tools/app-source.cjs index.html --out=index.mono.html` → 그 파일을 index.html로 바꾸고 js/·css/를 치운다.
- **분할 전 기반 브랜치 옮기기**: 그 브랜치의 index.html과 지금 것을 한 파일 단위로 3-way 병합한 뒤 같은 구조로 다시 나눈다.
  ```
  git show a6d0794:index.html > base.html            (PowerShell이면 '>' 대신 node로 저장 — UTF-16 주의)
  node tools/app-source.cjs index.html --out=ours.html
  git show <브랜치>:index.html > theirs.html
  git merge-file -p ours.html base.html theirs.html > merged.html     (충돌은 손으로)
  node tools/split-app.cjs --like=index.html --src=merged.html --out=. --force
  node tools/stamp-version.cjs && node --test tests/*.test.cjs desktop/test/*.test.cjs
  ```
  산출물(base/ours/theirs/merged)은 저장소 밖(임시 폴더)에 두고, 끝나면 지운다.
