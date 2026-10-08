# 날씨 CG 메이커 — 모듈 지도 (먼저 읽을 것)

이 앱은 2026-10-08부터 **기능별 파일로 나뉘어 있다.** `index.html`은 뼈대(head·마크업·데이터 스크립트)와 태그뿐이고,
로직은 `js/*.js`(40개), 스타일은 `css/*.css`(13개)에 있다. 나눌 때 기존 코드는 한 줄도 바꾸지 않았다(아래 '분할 이력' — 분할 때 34·11개, 뒤에 통보문 불러오기 `bulletin-load.js`, 이미지로 추출 팝업 `export-dialog`, AE식 타임라인 `timeline-plan.js`·`timeline-input.js`, 작업 중 효과 `busy-fx` 한 쌍, 틸트 WebGL 렌더러 `tilt-gl.js`를 더했다).

- Claude·GPT 등 AI 공용 안내는 [`AGENTS.md`](AGENTS.md). 이 문서는 그 자세한 판이다.
- 함수 찾기: `grep -nE "^(async )?function 이름\b|^(const|let) 이름\b" js/*.js`
  (`index.html`에서 함수 본문을 찾지 말 것 — 거기엔 없다. `const 이름 = (…) =>` 꼴 함수도 많아서 `function`만 찾으면 놓친다.)

---

## 1. 구조

```
index.html          뼈대: head 인라인(서비스워커 등록·모듈 로드 실패 가드·배치 슬롯·글꼴 주입) + <link css/…> 13개
                    + 마크업 + 테마 + 데이터 스크립트 12개 + <script src="js/…"> 40개(맨 끝)
js/                 앱 로직 40개 — 아래 표 순서가 곧 로드 순서
css/                스타일 13개 — 아래 표 순서가 곧 덮어쓰기 우선순위
*.js (루트)          데이터 스크립트(지도·글꼴·이미지·배치 — window.X = … 꼴, 앱 로직 아님)
FontNew/            글꼴 파일(css/base.css의 @font-face가 ../FontNew/ 로 가리킴)
sw.js               서비스워커(웹판 설치·오프라인, network-first)
tools/              분할·검사 도구(아래 6장)
tests/              node --test 테스트(앱 코드는 tools/app-source.cjs로 합쳐 읽는다)
desktop/            데스크톱 앱(Electron 껍데기 + 내장 헬퍼 wns/) — 상위 폴더 index.html을 그대로 띄운다
```

## 2. 반드시 지킬 규칙

1. **`<script>`/`<link>` 태그 순서를 바꾸지 않는다.** `defer`·`async`·`type="module"`을 붙이지 않는다(실행 순서가 바뀐다).
   기존 파일끼리의 순서는 고정이다(테스트의 `JS_ORDER`·`CSS_ORDER` — 바꾸면 실패). 새 파일은 사이에 **끼워 넣기만** 하고,
   그때 아래 표에 행을 하나 넣는다(표 순서도 테스트가 비교한다). 파일을 지우거나 이름을 바꿀 때만 고정 목록을 고친다.
2. **파일 머리를 지우지 않는다.** js는 2줄(`/* [모듈] js/이름.js — 설명 */` + `'use strict';`), css는 1줄(`/* [모듈] css/이름.css — 설명 */`).
   `'use strict'`가 빠지면 그 파일만 느슨한 모드가 되어 오타 대입이 조용히 전역이 된다.
3. **호이스팅은 파일을 넘지 못한다.** 로드 때 바로 실행되는 최상위 코드(리스너 등록·`const x = f()`·즉시 실행)는
   **앞 파일**에 있는 이름만 쓸 수 있다. 새 최상위 실행 코드는 `boot.js`에 두거나, 쓰는 이름이 모두 앞 파일에 있는 곳에 둔다.
   함수 본문·이벤트 핸들러·타이머 콜백 안은 상관없다(부팅 뒤에 실행되므로). 검사: `node tools/load-order.cjs`.
   로드 때 `typeof 뒤파일이름 === 'function'`으로 감싸는 것도 안 된다 — 한 파일일 때는 호이스팅으로 true였지만 분할 후엔 늘 false라
   오류 없이 **조용히 건너뛴다**(테스트가 0을 요구).
   **load-order의 한계**: 직접 호출·IIFE·동기 콜백(forEach 등)·객체 리터럴 메서드(`const h = { a() {…} }; h.a()`)·getter는 따라가지만,
   class 인스턴스 메서드, `call`/`apply`/`bind`를 거친 호출, 계산된 속성 이름, 객체를 다른 함수에 넘긴 뒤의 호출은 못 본다.
   그래서 테스트만으로는 부족하다 — **배포 전 `node desktop/test/boot-check.cjs . --wait=9000`이 `"ok": true`여야 한다**(9장).
4. **부팅 뒤를 가정하는 setTimeout·rAF·then도 boot.js에** 둔다. 파일과 파일 사이에 브라우저가 다른 일을 끼워 넣을 수 있다.
   (지금 예외 1곳: `wiring.js`의 `anim-ready` 80ms 타이머 — 화면 전환 애니메이션만 영향, 수용. 테스트 허용 목록에 있음)
   **boot.js가 아닌 파일의 최상위에서 `dispatchEvent`·`click()`·`focus()`·`blur()`·`queueMicrotask`·`MutationObserver` 금지** —
   그 리스너·콜백은 그 파일이 '로드 중'(`document.currentScript`가 그 파일)일 때 돌아서, 던지면 로드 실패 가드(7장)가 치명 오류로 보고
   앱을 멈춘다(한 파일일 때는 콘솔에만 찍히던 오류). load-order가 잡아 테스트 허용 목록(`PREBOOT_TIMERS_OK`)과 비교한다.
5. **같은 이름 함수를 두 파일에 만들지 않는다.** 최상위 `let/const/class` 이름도 파일 사이에 겹치면 뒤 파일 전체가 SyntaxError로 안 돈다.
   최상위 `var`는 쓰지 않는다.
6. **예약 이름 금지**: `window document location top self parent frames opener NaN Infinity undefined globalThis`(브라우저 고정 전역),
   `wcgDesktop`(데스크톱 preload), `_per _mas`(head 인라인 var), 데이터 전역 12개(`WCG_DEFAULTS KOREA_MAP …` — 데이터는
   `const X = window.X …` 꼴로만 읽는다). window 내장(`name open close print fetch …`)을 가리는 새 최상위 이름도 금지.
   예외는 옛날부터 있던 `function status`(window.status를 대체 — 앱 안에서 window.status를 안 씀) 하나.
7. **최상위 리스너 등록문을 다른 파일로 옮기지 않는다.** 같은 대상·같은 이벤트(svg pointerdown, window keydown 등)는
   등록 순서 = 실행 순서다(typhoon-panel 캡처 → view-camera → pointer-drag, pointer-drag 단축키 → wire()의 keydown).
   로드 때 등록되는 리스너 22개의 순서·파일은 테스트(`LOAD_LISTENERS`)가 고정해 둔다 — 새 등록은 끼워 넣어도 되고, 기존 것을 옮기면 실패.
8. `wiring.js`의 사이드바 정리 IIFE와 `refreshToolGroup`은 같은 파일에 둔다(IIFE가 같은 파일 안 함수 호이스팅에 기댄다).
9. **요소는 항상 `$('#id')`로 잡는다.** 요소 id와 같은 전역 이름이 19개 있다(`undo` `stage` `apiKey` `wins` …) — 이름으로 요소를 부르면 함수·변수가 나온다.
   앱 이름에 `window.이름 =` 대입을 하지 않는다(함수를 덮어쓴다 — 테스트가 막는다).
10. 경로는 항상 **상대 경로**(`js/…`, `css/…`). `/js/…`는 Pages 하위 경로(`/weather-cg/`)에서 깨진다. css 안 상대 url은 `../`로 시작해야 한다
    (css/ 기준 — `url('../icon.svg')`). css의 `url('/…')`, js의 `'/js/…'`·`'/css/…'`·`'/FontNew/…'` 문자열은 테스트가 막는다.
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
| 11 | `js/typhoon-api.js` | 431 | 태풍 데이터: 기상청 typ/td 파싱, JMA·JTWC, 이름 저장, 불러오기(기상청 조회 줄 — 동시 6개·우선순위·캐시(다시 누르면 최근 시각은 새로)·다시 보내기, 12시간 창 규칙으로 덜 묻기), 발생·소멸 TD는 뒤에서(입력 중이면 미룸) | `parseTypNow` `fetchTyphoon` `typhoonApiUrl` `kmaRequest` `_kmaFirst` |
| 12 | `js/panels.js` | 608 | 사이드바 패널(팔레트·인셋·목록·섹션 열기), 캔버스 요소 → 섹션 자동 열기, 선택, 칠하기 | `buildPalette` `revealSec` `select` `refreshPanel` `syncPanelFromState` `paint` `markActive` |
| 13 | `js/view-camera.js` | 305 | 작업창 줌·맞춤·틸트 미리보기(그림 버퍼 #camCanvas 래스터·GL/CSS 그리기·첫 진입 게이트·예열·다시 굽기 판단 — 회전만 바뀌면 안 굽기, 태풍은 무거운 바탕을 따로 두고 경로 레이어만 다시 굽기, 드래그 놓을 때 섞어 바꾸기, 다시 굽게 하기 `tiltInvalidate`(늦게 온 위성 타일·작업 바꿈·GPU 리셋 — GPU 프로세스가 죽으면 2D 그림 버퍼도 비워지므로 그동안 평면 지도로 두고 되찾으면 다시 굽기), 타임라인을 닫으면 GL 텍스처 반납), 더블클릭 인라인 편집, Alt 카메라 조작 | `sizeFit` `applyView` `applyTilt` `rasterTiltCanvas` `tiltWant` `tiltPrewarm` `tiltInvalidate` `inlineEdit` |
| 14 | `js/tilt-gl.js` | 174 | **틸트 지도 WebGL2 렌더러**: 블리드 지도 그림을 밉맵(LINEAR_MIPMAP_LINEAR)·비등방(최대 16) 텍스처로 원근 투영(warpTilt3D·CSS와 같은 식) — 미리보기(#camGL, 그림이 바뀔 때만 올리고 회전만 바뀌면 다시 그리기만)·추출(tglWarp) 공용. 가장자리 페이드는 셰이더. 못 쓰거나 컨텍스트를 잃으면 null/false → 미리보기 CSS 3D·추출 2D 메시로. 끄기: localStorage wcg_tiltgl=0 | `tglCreate` `tglUpload` `tglDraw` `tglQuad` `tglWarp` `tglOk` |
| 15 | `js/pointer-drag.js` | 512 | 캔버스 포인터(칠·선택), 브러쉬 커서, 드래그·스냅, 리사이즈, **키보드 단축키**, 삭제·모드 | `dragLoop` `startDragItem` `delSel` `setMode` |
| 16 | `js/warnings.js` | 384 | 기상특보 파싱·단계 색·발효 순서, 불러오기 결과 판정·문구 | `parseWrn` `wrnColorOf` `wrnReadText` `wrnHttpFail` `wrnResultView` |
| 17 | `js/warnings-apply.js` | 403 | 기상청 API 주소·키(예보·태풍도 씀), 특보 런타임 목록, 특보 적용·칠·발효 현황·목록 | `apiKey` `apiUrl` `applyWrn` `paintWrn` `buildWrnList` |
| 18 | `js/bulletin.js` | 664 | 기상예보 파싱·색, 통보문 강수량 붙여넣기(용어 사전·지역 표현 파서) | `parseFct` `parseBulletin` `applyBulletin` |
| 19 | `js/bulletin-load.js` | 371 | **통보문 불러오기**(헬퍼 /api/kma로 날씨누리 단기예보 페이지 — 인증키 안 씀)·데스크톱 날씨누리 창 읽기, 원문에서 '예상 강수량' 날짜 묶음 나누기·고르기·결과 카드, 통째 붙여넣기 | `fetchBulletin` `bulReadPage` `bulSplitGroups` `bulPickItems` `bulResultView` `showBulResult` `bulOnPaste` `bulFromWnuri` |
| 20 | `js/forecast-panel.js` | 206 | 예보 적용·고르기·목록, 작업 런타임 초기화, 예보 종류 버튼 | `applyFct` `buildFctList` `resetWorkRuntime` `setFctKind` |
| 21 | `js/warnings-load.js` | 120 | **특보 '기상청에서 불러오기'**(헬퍼 /api/kma 경유)·결과 카드, 특보 열 | `fetchWrn` `showWrnResult` `wrnRefreshResult` `buildWrnCols` |
| 22 | `js/presets.js` | 266 | 해상도별 배치 프리셋, **작업 자동 저장**, 배포 기본값 갱신 | `savePreset` `saveWork` `loadWork` `applyPreset` |
| 23 | `js/cg-setup.js` | 297 | 해상도·CG 구성 창, **상태 표시**, 출력 폴더(IndexedDB) | `RES` `openCgSetup` `status` `flash` `flashDone` `prepareOutput` |
| 24 | `js/modals-notices.js` | 354 | **팝업 공통**(닫힘 애니메이션·포커스), **토스 카드 모달**, 공지사항, 내보내기 진행 마스크, 확인/입력 모달 | `popAnimClose` `popFocusIn` `tossModal` `checkNoticeOnBoot` `showExportMask` `tossConfirm` `tossPrompt` |
| 25 | `js/busy-fx.js` | 163 | **작업 중·도착 효과**(뉴스 플레이어 검수 로딩 효과): 섹션·상자에 흐르는 그라디언트, 버튼 진행(흐름+비활성)·제목줄 버튼 색 띠·진행 막대, 결과 목록 자리 빛 훑는 막대, 섹션 머리만 옅은 띠(뒤에서 도는 확인 — h3), 도착(머리 빛·행 떠오름). 겹친 작업은 센다(켤 때·끌 때 같은 배열 = 한 작업 — 안전 해제 뒤 늦은 끄기가 새 작업을 안 끈다), `fxRun`은 실패해도 끈다 | `fxBusy` `fxRun` `fxArrive` `fxProgress` `fxSec` `fxHead` `fxRows` `fxClear` |
| 26 | `js/preset-slots.js` | 251 | 배치 지정하기(완전 기본/개인 슬롯, 구운 배치 파일) | `openPresetSlots` `buildCurrentPresets` |
| 27 | `js/export-image.js` | 314 | 이미지 추출 공통: 출력 글꼴 임베드, 카메라 레이어, 텍스트 오버레이, 3D 틸트 워프 | `suiteFontCss` `svgToImage` `drawExportFrame` |
| 28 | `js/export-video.js` | 410 | 정확 MP4·PNG 시퀀스, 로컬 헬퍼(WNS) 연결·상태(렌치 빨간 점·기능 확장팩 줄)·렌더 | `bakeMp4` `pingHelper` `checkHelperFreshOnBoot` `wnsHelperOffNotice` `wnsRender` |
| 29 | `js/export-blobs.js` | 198 | **추출 핵심**: 레이어 목록·SVG→PNG blob, 미리보기, 프로젝트 파일 PNG 메타(읽기), 내보내기 대상 | `ALL_LAYERS` `svgBlob` `keepLayers` `pngEmbed` `readProjectFile` `exportBlobs` |
| 30 | `js/ae-export.js` | 572 | After Effects 보내기(타임라인 = AE — 헬퍼 20261008: 앱 이징 곡선을 AE 키 영향값으로·태풍/비교 진행 곡선·블라인드·일반/비교 지도 카메라(이동/고정 레이어 나눔·블리드)·방향·지시선 셰이프), 다운로드 | `sendToAE` `aeEaseOf` `aeCamSpec` `aeBleedBox` `aeLeaderSpec` `aeBlindMtnSpan` `download` |
| 31 | `js/export-dialog.js` | 378 | **이미지로 추출 팝업**(CG 구성 모양 — 묶음 3판·아이콘 카드·빠른 선택·고른 것 기억)과 **저장**(폴더 고르기(지난번 폴더 'imgDir') → `오늘날짜_날씨CG메이커` 폴더 → 카드 이름 그대로 PNG, 같은 이름이면 덮어쓰기/번호/취소(같은 이름 '폴더'는 그 장만 번호), 폴더 고르기를 못 쓰면 ZIP, 취소·권한 거절은 까닭 + [ZIP으로 받기] — 말없이 ZIP 안 받음), 정지 화면에서 굽기 | `openExport` `renderExport` `withStaticFrame` `exportFolderName` `setupExportDialog` `EXPORT_ICON` `exErrText` |
| 32 | `js/project-io.js` | 325 | 설정 옮기기, 프로젝트 저장/열기, 최근 파일, 기본 배치 굽기 | `exportSettings` `importSettings` `saveProject` `bakeDefaults` |
| 33 | `js/wiring.js` | 778 | 버튼·입력 배선 `wire()`(함수 하나) + 사이드바 그룹 정리(로드 때 실행) | `wire` `refreshToolGroup` |
| 34 | `js/anim.js` | 640 | 영상 애니메이션: 이징, 카메라 키프레임, 자동 트랙(계획·적용), renderAnimFrame(정확 경로 + 재생 중 가속 경로 — 틸트 그림은 지도 내용이 바뀐 프레임만 다시 굽기: animMapKey), 재생/정지/탐색, 저장용 상태 | `cubicBezier` `renderAnimFrame` `animFastOn` `animPlay` `animStop` `stateForSave` `autoTrackPlan` |
| 35 | `js/timeline-plan.js` | 230 | 타임라인 레이어 계획(화면·AE 공용 목록·순서·이름·타이밍), 시간 도우미(프레임·타임코드·입력 해석), 막대 끌기 계산, 스냅 대상 | `tlLayerPlan` `tlQuant` `tlFmtTC` `tlParseTime` `tlSetSpan` `tlDragCalc` `tlSnapTargets` |
| 36 | `js/timeline-ui.js` | 560 | 타임라인 화면(AE식 레이어 열·아이콘·막대·키·눈금자·CTI·내비게이터), 그리기 스케줄러(rAF 하나), 열기·높이·미리보기, 카메라 키 팝오버. 내용 변경 알림 `tlContentChanged`(renderAll·renderFills — 가속 미리보기를 걷고 다시 그림) / 1.5초 행 점검 `tlCheckRows`(boot.js — 가속은 그대로) | `buildTimeline` `tlSync` `tlInvalidate` `tlFrame` `tlSetT` `tlSetOpen` `tlContentChanged` `tlCheckRows` `openCamKeyPopover` `TL_ICONS` |
| 37 | `js/timeline-input.js` | 420 | 타임라인 조작: 막대·키 끌기(프레임·스냅·다중 선택), 스크럽·줌·스크롤, 이름 열 숫자 끌기·키 내비게이터, 키보드 단축키·패널 포커스, Alt 카메라 자동 키 | `tlWire` `tlKeydown` `tlOwnsKeys` `tlCamKeyAt` `tlCamAutoKey` |
| 38 | `js/floating-panels.js` | 670 | 떼어낸 창, 패널 크기, 레이아웃, **제목줄 메뉴(추출·프로젝트·설정(렌치))**, 시작 화면 | `popOut` `dockSec` `loadLayout` `setupMenus` `setupStartScreen` `showStartScreen` |
| 39 | `js/tour.js` | 200 | 둘러보기(온보딩 투어) | `tourOpen` `tourGo` `wireTour` |
| 40 | `js/boot.js` | 119 | 파일 끌어다 놓아 열기 + **앱 부팅 순서**(build·wire·loadLayout·renderAll, 이어 열기, 자동 저장 타이머) — **반드시 마지막** | `setupDropOpen` + 부팅 문장, `work` `freshOpen` `pendingStart` |

경계 조정(2026-10-08, 코드 무변경 — 이어 붙인 텍스트는 그대로): 처음 분할의 `cg-setup.js` 뒤쪽(팝업 닫힘 애니메이션·토스 카드 모달)을
`notices.js` 앞에 붙여 `modals-notices.js`로, `export-video.js`의 `ALL_LAYERS`부터 끝을 `export-blobs.js`로, `forecast-panel.js`의
특보 불러오기 부분을 `warnings-load.js`로 옮겼다. 줄 수는 그때 값(참고용).

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
| 7 | `css/export-dialog.css` | 77 | 이미지로 추출 팝업 — CG 구성 클래스 재사용 + 묶음 3판 색(보라 `--cgs-mark` 토큰)·빠른 선택·장수 배지·흐린 카드·렌더 진행·좁은 창, 타임라인 '저장 폴더' 버튼 |
| 8 | `css/menus-windows.css` | 165 | 제목줄 메뉴 드롭다운 안 섹션·설정(렌치) 메뉴·기능 확장팩 줄, 떼어낸 창(탭·크기 조절·도킹 미리보기) |
| 9 | `css/timeline.css` | 190 | 타임라인(AE식 — 전용 토큰 어두운/밝은, 레이어 열·막대·키·CTI·눈금자·내비게이터), 무대 줄이기, 추출 진행 바, 영상 추출 집중 모드, 카메라 키 팝오버 |
| 10 | `css/dialogs.css` | 171 | 인증키 안내, 특보 불러오기 결과 카드, 알림 색 점, API 설정 창, 확인 모달, 배치 지정하기 모달 |
| 11 | `css/panel-misc.css` | 141 | 통보문·예보 박스, 링크 버튼, 칠한 색 목록·경고, 최근 파일, 이미지 안내 팝업, 마우스 배지, 토스트, 브러쉬 영역 강조 |
| 12 | `css/toss-modal.css` | 158 | 토스 카드 모달, 공지, 접이식 묶음, 렌더 가리개, 참고 이미지 드롭, 토글 스위치, 지도 배경 버튼, 브러쉬 원·가이드 |
| 13 | `css/busy-fx.css` | 119 | 작업 중·도착 효과(`js/busy-fx.js`)의 모양·움직임 — 흐름(transform만, 호스트 `overflow: clip`), 버튼 띠·진행 막대, 자리표시 막대, 도착 빛, 렌더 가리개 흐름, 움직임 줄이기. **맨 뒤**(다른 규칙을 덮어야 한다) |

- css 안 상대 url은 **css/ 폴더 기준**이다(`url('../FontNew/…')`). js 안 경로(`fetch('FontNew/…')` 등)는 **문서 기준**이라 그대로다.
- `index.html`의 `<style id="fontEmbed">`(head, 글꼴 데이터 주입)와 SVG 안 `<style id="fontStyle">`(추출 때 JS가 채움)은 **옮기지 않는다.**

## 5. index.html에 남아 있는 것

| 자리 | 내용 |
|---|---|
| head 맨 앞 | 서비스워커 등록, `html.isDesktop` |
| 그 다음 | **모듈 로드 실패 가드**(7장) |
| | `default-presets.js` + 배치 슬롯으로 `WCG_DEFAULTS` 교체(`var _per/_mas`), `font-data.js` + `#fontEmbed`, Pretendard preload |
| | `<link rel="stylesheet" href="css/…?v=…">` 13개 |
| body | 마크업(사이드바·제목줄·모달·SVG 등) |
| 끝 | 테마(`data-theme`), 데이터 스크립트 10개(`onerror` 대체값), `<script src="js/…?v=…">` 40개 |

## 6. 공용 도우미 위치

| 이름 | 파일 |
|---|---|
| `$` `el` `tip` `svgNS` `DEFAULTS` `S` `curStyle` `isTyphoon` | `core.js` |
| `pushUndo` `undo` `redo` `svg` `buildFrame` `setStyle` | `map-build.js` |
| `renderAll` `renderLabels` `renderMtns` `renderSel` | `labels-mountains.js` |
| `select` `refreshPanel` `syncPanelFromState` `revealSec` | `panels.js` |
| `apiKey` `apiUrl` | `warnings-apply.js` |
| `saveWork` `loadWork` `applyPreset` | `presets.js` |
| `status` `flash` `flashDone` `prepareOutput` `RES` | `cg-setup.js` |
| `popAnimClose` `popFocusIn` `tossModal` `tossConfirm` `tossPrompt` `showExportMask` | `modals-notices.js` |
| `fxBusy` `fxRun` `fxArrive` `fxProgress` `fxSec` `fxHead` `fxRows` `fxClear` (작업 중·도착 효과 — 쓰는 법은 파일 머리 주석) | `busy-fx.js` |
| `fetchWrn` `showWrnResult` `buildWrnCols` | `warnings-load.js` |
| `fetchBulletin` `showBulResult` `bulReadPage` `bulResetPick` | `bulletin-load.js` |
| `pingHelper` `wnsHelperOffNotice` `HELPER_VER_MIN` `wnsRender` `AE_EXT_VER` `aeHelperExt`(헬퍼가 AE 확장을 아는가 — 'AE 차이' 표시 기준) | `export-video.js` |
| `svgBlob` `keepLayers` `ALL_LAYERS` `readProjectFile` `pngEmbed` `pngExtract` `exportBlobs` `exportPlan` `exportWhyNot` `safeFileName` `EXPORT_STACK` | `export-blobs.js` |
| `download` `aeEaseOf`(앱 cubic-bezier(x1,0,x2,1) → AE 영향 [x1·100, (1−x2)·100]) `aeCamSpec` `aeBleedBox` | `ae-export.js` |
| `openExport` `closeExport` `exportIsOpen` `renderExport` `withStaticFrame` `exportFolderName` | `export-dialog.js` |
| `tlLayerPlan`(타임라인 레이어 = AE 레이어 목록·순서·타이밍) `tlQuant` `tlFmtTC` `tlParseTime` `tlSetSpan` | `timeline-plan.js` |
| `buildTimeline` `tlSetT`(재생헤드) `tlInvalidate` `tlRefreshPreview` `tlState` | `timeline-ui.js` |
| `stateForSave`(저장·되돌리기용 S — 카메라 미리보기 중이면 작업 뷰) `animFastOn/Off`(재생 중 가속) `autoTrackPlan` `animMapKey` `EASE_BEZIER` `EASE_VF`(AE 보내기가 같은 곡선을 옮김) | `anim.js` |
| `applyTilt` `camActive3d` `tiltWant` `tiltPrewarmSoon` `tiltInvalidate`(틸트 그림을 꼭 다시 굽게 — `_tiltRasterSig = null` 대신. `true` = 지금 그림도 버림) (틸트 미리보기) | `view-camera.js` |
| `tglCreate` `tglUpload` `tglDraw` `tglWarp` (틸트 WebGL — 미리보기·추출 공용) | `tilt-gl.js` |
| `saveProject` `loadProjectData` `openProject` | `project-io.js` |
| `setupMenus` `showStartScreen` | `floating-panels.js` |

짧은 전역 이름(새 이름으로 쓰지 말 것): `$ el S sel mode seq view work fit snap svg anim hex clamp lerp one tip lum BGS MAP IMG RES tlH _te`,
boot.js 최상위 const `work freshOpen pendingStart tourWillOpen defaultsChanged slotReapply _prevDeploySig`.

## 7. 캐시 · 서비스워커 · 로드 실패 가드

- 태그마다 `?v=<파일 내용 해시 8자리>`가 붙는다. **고친 뒤에는 꼭 `node tools/stamp-version.cjs`**(낡으면 테스트가 실패한다).
- `sw.js`(v4): 페이지(탐색) 요청은 늘 서버에 다시 확인(`no-cache`), 나머지는 network-first + 오프라인 캐시.
  GitHub Pages는 `?v=` 쿼리를 무시하므로, 옛 index.html이 캐시에서 나오면 옛·새 파일이 섞일 수 있어 페이지만은 늘 새로 받는다.
  - 판 올림(activate) 때 옛 캐시(`weathercg-v3` 등)의 항목을 새 캐시로 **옮겨 담은 뒤** 지운다. 그냥 지우면 배포 뒤 첫 방문에서 캐시가 비어,
    곧바로 오프라인이 되면 앱이 안 열린다. 옮겨 담는 것은 그 방문에서 받은 index·js·css 한 벌이라 늘 앞뒤가 맞는다.
  - js/·css/의 `?v=` 응답을 담을 때 같은 경로의 옛 `?v=` 항목을 지운다(배포마다 캐시가 커지지 않게).
  - 캐시 이름(`CACHE`)을 올리는 것은 sw.js 동작을 바꿀 때뿐이다. js·css만 고치는 배포는 `?v=`로 충분하다.
- **모듈 로드 실패 가드**(index.html head 인라인): js/·css/ 중 하나라도 못 받거나(404·끊김) 모듈이 로드되며 실행 오류
  (문법 오류·이름 중복 포함, boot.js는 문법 오류만)를 내면 → 남은 파일과 boot.js를 실행하지 않고(`window.stop()`),
  localStorage 쓰기를 막고, '앱을 다 불러오지 못했어요 — 새로고침' 안내를 띄운다. 반쯤 깨진 앱이 하던 작업을 덮어쓰지 않게.
  기록은 `window.__wcgModFail`. 정상일 때는 오류 리스너 하나뿐이다. 부팅(boot.js) 중·부팅 뒤 실행 오류는 앱 오류라 건드리지 않는다.

## 8. 테스트 · 도구

| 명령 | 하는 일 |
|---|---|
| `node --test tests/*.test.cjs desktop/test/*.test.cjs` | 전체 테스트(Electron 없이). 구조 검사 `tests/split-structure.test.cjs` 포함 |
| `WCG_BOOT_CHECK=1 node --test tests/brush-incremental.test.cjs tests/cg-setup.test.cjs tests/ae-cluster-e.test.cjs` | 실제 앱을 숨김 Electron으로 띄워 눌러 보는 점검(느림). 타임라인은 `tests/timeline-ae.boot.test.cjs`·`tests/ae-timeline-spec.test.cjs`도 |
| `WCG_BOOT_CHECK=1 node --test tests/tilt-gl.boot.test.cjs` | **틸트 미리보기 WebGL** 실제 앱 점검: GL(밉맵)로 그리는지, 타임라인을 열면 틸트 그림을 미리 굽는지, 진입 프레임부터 기울인 지도(빈 지도 없음), 회전만 바뀌는 재생은 다시 안 굽는지, 컨텍스트를 잃으면 CSS·되찾으면 GL, 영상 프레임도 GL. 가짜 DOM·가짜 WebGL 단위 검사(폴백·게이트·다시 굽기 조건·투영식·메시 이음매·GPU 리셋 — 2D 그림 버퍼를 잃으면 평면 지도·되찾으면 다시 굽기, 늦은 타일·작업 바꿈, 타임라인 닫으면 텍스처 반납)는 `tests/tilt-gl.test.cjs`. 진짜 GPU 리셋은 CDP `Browser.crashGpuProcess`로만 재현된다(점검 스크립트에서) |
| `node --test tests/ae-timeline-spec.test.cjs` | **타임라인 = AE 1:1**: 실제 `sendToAE`(vm)가 보내는 `/api/ae` 스펙과 헬퍼 JSX(`desktop/wns/ae-jsx.js`)를 AE 흉내로 실행한 키·이징·부모·효과를 무작위 작업 수백 개의 타임라인 값(트랙·태풍 키·카메라 키·길이)과 비교 — 헬퍼 20261008(새)·20261007(옛) 두 번. AE 보내기를 고치면 꼭 돌린다 |
| `node --test tests/ae-ease-match.test.cjs` | **AE 키·표현식 = 화면 함수**: 헬퍼 JSX를 AE 흉내(`desktop/test/ae-model.cjs` — AE 시간 베지어·부모 보정·표현식 vm 실행)로 프레임마다 계산해 앱 실제 함수(easeOut·easeVf·camAt·typhoonScreenPts·typhoonBandInto·typhoonLabelProg·compareScreenPts·typhoonLeaderGeom·블라인드 덮임 식)와 비교. 끝에 항목별 최대 오차 표 |
| `node --test desktop/test/golden-legacy.test.cjs` | 옛 앱 스펙 골든 137개가 헬퍼 확장 뒤에도 바이트까지 같다(sha256 — F1 카메라 6개만 의도한 변경) |
| `node tools/ae-verify/make.cjs` → AE에서 실행 → `node tools/ae-verify/compare.cjs` | **AE 실기 대조**(사람이 1회): 골든 스펙 JSX + 값 덤프 꼬리를 AE(새 빈 프로젝트)에서 돌려 `valueAtTime` 덤프를 AE 흉내 값과 비교 — AE 흉내의 가정(영향 합 >100%·공간 속성 이즈·슬라이더 표현식·toComp·부모 보정·한글 이름)을 실제 AE로 확인 |
| `WCG_BOOT_CHECK=1 node --test tests/export-render.test.cjs` | **이미지로 추출 픽셀 점검**(약 10분) — 지도 7묶음 × 항목 14개가 '딱 그것만'인지(화이트리스트 기준과 비교·섞인 색), 편집용 레이어 다시 쌓기 = 전체 화면, 색칠만 이음새, 미리보기 상태·3D 기울기·태풍·터치 가장자리, 저장 흐름(가짜 폴더·ZIP·같은 이름 폴더·권한 거절)·팝업. 그림이 필요하면 `window.__XR_DUMP = true`(본문 머리 주석) |
| `node desktop/test/boot-check.cjs . --wait=9000 [--eval=…] [--shot=…] [--size=WxH] [--keepalive]` | 실제 부팅·콘솔 오류 점검(`"ok": true`여야). `--eval`은 async 함수로 감싸 실행된다(`--keepalive` = 긴 eval 동안 숨김 창 프레임 깨우기). 끝나면 임시 사용자 폴더(`%TEMP%\wcg-test-<pid>`)를 지운다 |
| `node tools/stamp-version.cjs [--check]` | `?v=` 갱신 / 검사 |
| `node tools/load-order.cjs [--verbose]` | 로드 순서 정적 검사(뒤 파일 동기 참조·로드 중 typeof 0이어야, 부팅 전 예약·동기 이벤트, 로드 때 리스너 순서). 테스트도 돌린다. 한계는 2장 규칙 3 |
| `node tools/app-source.cjs index.html --out=<파일>` | 나뉜 앱을 '분할 전 한 파일' 텍스트로 합침(PowerShell `>` 대신 `--out`) |
| `node tools/verify-split.cjs <전> <후>` | 분할 커밋이 텍스트 무변경인지 git 객체로 증명 |
| `node tools/split-app.cjs` | 분할 도구(한 파일 → 지금 구조, 기준표 MAP). `--like=index.html`로 지금 분할본과 같은 구조로 재분할(11·12장) |

- **테스트에서 앱 코드를 읽을 때는 `tools/app-source.cjs`를 쓴다**: `const appSource = require('../tools/app-source.cjs'); const html = appSource(path.join(__dirname, '..', 'index.html'));`
  결과는 분할 전 `index.html`과 같은 텍스트(줄바꿈 LF)라 예전처럼 함수를 잘라 쓸 수 있다. `index.html`을 `readFileSync`로 직접 읽으면 구조 테스트가 실패한다.
- 이 `app-source.cjs`는 근무표(work schedule)의 `swap-backend/app-source.cjs`와 **동작이 다르다**(이쪽은 머리 제거·IIFE 재구성·url 역변환까지 하는 정확한 역변환). 서로 복사하지 않는다.
- 데스크톱 개발판은 hot reload가 없다 — 고친 뒤 창에서 Ctrl+R.
- 로컬 웹 미리보기는 `npx serve`(ETag로 매번 재검증)나 Electron을 쓴다. `py -m http.server`는 휴리스틱 캐시로 옛 js를 줄 수 있다. 미리보기 전에 stamp.

## 9. 배포(GitHub Pages — 저장소 루트가 곧 사이트)

1. 고친다 → `node tools/stamp-version.cjs` → `node --test tests/*.test.cjs desktop/test/*.test.cjs`
   → **`node desktop/test/boot-check.cjs . --wait=9000`이 `"ok": true`** (필수 — 정적 검사가 못 보는 로드 오류를 잡는다. 하나라도 실패하면
   모든 사용자에게 '앱을 다 불러오지 못했어요'가 뜬다). Electron이 없는 환경(GitHub 웹·github.dev 등)이면 **배포하지 말고** 사람에게 넘긴다.
2. `git add index.html js css <고친 다른 파일>` — **경로를 적어서**(`git add -A` 금지: 검사 산출물·임시 파일이 공개된다)
3. commit → push. `index.html`·`js/`·`css/`는 **한 커밋**에 함께 간다(따로 가면 Pages가 중간본을 배포해 옛·새가 섞인다).
4. Pages 반영(1–2분) 뒤 라이브 주소에서 콘솔 오류 0, js·css 200을 확인.
- GitHub 웹에서 고칠 때(GPT 등)는 github.dev(저장소에서 `.` 키)로 js·css와 index.html의 `?v=`를 **한 커밋**으로 올리되,
  main이 아닌 **브랜치(PR)**에 올린다(main 커밋 = 곧 배포인데 boot-check를 못 돌렸으므로). 병합은 boot-check를 돌린 뒤.
  `?v=`는 아무 새 8자리 16진수면 되고, 다음 stamp가 바로잡는다.
- 문서·코드 주석에 비밀번호·API 키를 쓰지 않는다(공개 저장소).

## 10. 데스크톱 앱 영향

데스크톱 앱(Electron)은 영향 없다. `desktop/main.js`는 상위 폴더를 `app://weathercg`로 서빙하고(js·css MIME 등록됨, `no-store`,
`?v=`는 경로만 보므로 무해), `desktop/test/boot-check.cjs`는 모듈 오류를 `EXC …@app://weathercg/js/x.js:줄`로 잡는다.

- **날씨누리 창**(2026-10-08): `main.js`가 웹앱의 '단기예보 열기'를 받아(`wcg:wnuri-open`) 앱 안 창으로 날씨누리를 띄우고, 다 뜰 때마다
  통보문 본문 글을 웹앱에 보낸다(`wcg:wnuri` → `js/bulletin-load.js` `bulFromWnuri`). 창이 이미 떠 있으면 새로고침한 뒤 읽는다(열어 둔 채
  발표가 바뀌어도 지난 통보문을 읽지 않게). 같은 글을 다시 읽으면 웹앱은 고른 날짜·고친 칸을 그대로 둔다. 창에는 preload가 없다(바깥 페이지에 앱 API 없음). preload의 `openWnuri`·`onWnuri`가 없는 옛 데스크톱 판·웹판은
  그대로 새 탭(복사 → 붙여넣기)이다. main.js·preload.js를 고치면 앱을 다시 실행해야 반영된다(Ctrl+R로는 안 됨).
- **기능 확장팩(헬퍼)**: 분할과 무관. 원본은 저장소 밖 `R:\[F]_Util\WNS\_src\helper.py`(웹판, PyInstaller로 빌드)이고, 데스크톱 내장판
  `desktop/wns/`(server.js·ae-jsx.js)가 그것을 Node로 옮긴 것이다. 저장소의 `tools/wns-helper/helper.py`는 **2026-07 옛 사본**(고치지 않는다 —
  `tests/wns-helper-legend.test.cjs`·`tests/wns_helper_smoke.py`가 그 사본의 범례 기능만 본다). 고치는 법은 `AGENTS.md`.
- **옛 file:// 설치판은 분할 뒤 그대로는 못 쓴다.** 저장소 밖(gitignore) `배포/`의 세 도구가 앱 파일 목록을 직접 나열하는데
  js/·css/(그리고 FontNew/·지도 데이터 js 일부)가 없다: `build-installer.ps1`(`$appFiles`), `install.ps1`(`$files`), `update.bat`(for 목록).
  게다가 `build-installer`가 쓰는 IExpress는 한 폴더만 묶어 하위 폴더를 담지 못한다. 분할본으로 설치 exe를 다시 굽거나 update.bat을 쓰면
  설치본은 index.html만 새것이 되고 js/·css/가 404 → 로드 실패 가드 안내('앱을 다 불러오지 못했어요')만 뜬다(작업을 덮어쓰지는 않는다).
  지금 배포된 `날씨CG_설치.exe`는 분할 전 스냅샷이라 영향 없다. 다시 쓰려면 둘 중 하나:
  (a) 폐기 — `사용법-설치배포.txt`에 '분할 이후 사용 불가 — 웹판·데스크톱 앱 사용'이라고 적는다.
  (b) js/·css/·FontNew/를 zip으로 묶어 install.ps1에서 `Expand-Archive`로 풀고, update.bat에는 `robocopy "%SRC%\js" "%DEST%\js" /MIR`
      (css·FontNew도)를 더한다. 데이터 js(seoul/typhoon/place 등)도 목록에 넣는다.

## 11. 분할 이력 · 되돌리기

- 분할 전 기준 커밋: `a6d0794`(한 파일 index.html, 16,626줄). 커밋: 도구+테스트 재배선 `7457f3a` → **기계 분할 `ae0343d`**
  → verify-split·--like `3df2455` → 로드 실패 가드·sw v4 `c75bc2d` → 문서·구조 테스트 → 검토 반영(경계 조정 32→34개(3장 표 아래),
  sw 옮겨 담기·옛 ?v= 정리, 검사 보강). 경계 조정 앞뒤로 `appSource(index.html)`는 바이트까지 같다.
- 바꾼 것은 기계 변환 4종뿐: ① 메인 IIFE 껍데기 ② 파일 머리 ③ css @font-face url 9곳 `../` ④ 두 블록 → 태그(`?v=`).
  `node tools/verify-split.cjs 7457f3a ae0343d` → 바뀐 경로는 index.html·js·css뿐, 합친 결과가 분할 전과 바이트까지 같다.
- 동작이 같은지는 화면으로 확인했다: 시작 화면·CG 구성 창·시도군·시도·특보·태풍·태풍 비교·서울·설정 메뉴(어두운/밝은) 16장면에서
  SVG 해시·화면 요소 계산 스타일 해시·CSS 규칙 수(862)·로드된 글꼴·콘솔 오류 0이 분할 전과 같고 스크린샷 픽셀 차이 0.
  달라진 것은 정해진 것뿐: 스타일시트 수 3→13, body의 script 태그 사이 빈 줄 31개, @font-face url 글자(`../`),
  CRLF 작업트리에서만 줄바꿈이 든 CSS 값 1곳의 `\r`(저장소·Pages는 LF라 같음, 렌더 결과 같음).
- **한 파일로 되돌리기(비상)**: `node tools/app-source.cjs index.html --out=index.mono.html` → 그 파일을 index.html로 바꾸고 js/·css/를 치운다.
  그리고 `tests/split-structure.test.cjs`를 지운다(분할 구조 검사라 첫 테스트부터 실패한다 — js 태그 2개 이상을 요구). 다른 테스트는
  `appSource`가 한 파일을 그대로 돌려주므로 그대로 돈다. AGENTS.md·이 문서의 분할 안내도 함께 고친다.
- **분할 전 기반 브랜치 옮기기**: 그 브랜치의 index.html과 지금 것을 한 파일 단위로 3-way 병합한 뒤 같은 구조로 다시 나눈다.
  base는 **그 브랜치가 갈라져 나온 커밋**이다(늘 a6d0794가 아니다 — origin/main처럼 a6d0794보다 앞에서 딴 브랜치에 a6d0794를 base로 쓰면
  그 사이 커밋(브러쉬·팝업 개선 등)을 '되돌리는' 변경이 theirs 쪽에 들어가, 충돌 없는 부분이 조용히 되돌아간다).
  파일 저장은 모두 **Git Bash**에서 한다(PowerShell의 `>`는 UTF-16/BOM으로 저장해 깨진다 — PowerShell뿐이면 `node`로 저장).
  ```
  T=$(mktemp -d)                                         # 산출물은 저장소 밖 임시 폴더에
  B=$(git merge-base <브랜치> a6d0794)                   # 그 브랜치가 갈라져 나온 분할 전 커밋
  git show "$B:index.html" > "$T/base.html"
  git show "<브랜치>:index.html" > "$T/theirs.html"
  node tools/app-source.cjs index.html --out="$T/ours.html"
  git merge-file "$T/ours.html" "$T/base.html" "$T/theirs.html"    # 결과가 ours.html에 제자리로(리디렉션 없음). 충돌 표시는 손으로 정리
  node tools/split-app.cjs --like=index.html --src="$T/ours.html" --out=. --force
  node tools/stamp-version.cjs && node --test tests/*.test.cjs desktop/test/*.test.cjs && node desktop/test/boot-check.cjs . --wait=9000
  rm -rf "$T"
  ```
  그 브랜치가 새 함수를 '로드 때 실행' 코드로 넣었다면 load-order·boot-check가 잡는다(2장 규칙 3·4) — 그 코드를 boot.js로 옮긴다.
  다시 나눈 뒤 `git diff --stat`으로 바뀐 파일을 본다. 어떤 파일 **첫머리 주석 묶음**(머리 2줄 아래, 첫 코드 줄 위)에 줄이 늘었으면
  `--like`는 늘어난 줄을 **앞 파일 끝**에 둔다(그 파일이 첫 코드 줄 위에 둘 줄 수를 지금 것 그대로 쓰므로 — 텍스트는 같다). 그러면 손으로 옮긴다.
  (점검: origin/main + 시험 변경 1줄로 해 보면 이 레시피는 그 1줄만 들어오고, base를 a6d0794로 두면 충돌 0인 채 3,762줄이 되돌아간다.)

## 12. 파일 나누기 · 경계 옮기기 (기계적으로)

파일이 너무 커졌거나 기능이 엉뚱한 파일에 있을 때 — 코드는 그대로 두고 **경계만** 옮긴다(이어 붙인 텍스트는 그대로).

1. 자를 자리는 **최상위 문장 사이**(함수·const 선언 앞, 그 위의 주석 묶음째)다. 문장 중간·블록 안은 안 된다.
2. 뒤쪽을 새 파일로 옮기고 머리 2줄(`/* [모듈] js/새이름.js — 설명 */` + `'use strict';`)을 붙인다. 앞 파일 머리의 설명도 고친다.
   관례: 앞 파일은 마지막 코드 줄로 끝나고, 둘 사이의 빈 줄은 새 파일 머리 바로 아래에 둔다(다른 파일들과 같게).
3. `index.html`에서 원래 파일 태그 **바로 뒤**에 새 태그를 넣는다(다른 파일 순서는 그대로) → 3장 표에 행 추가, 6장 도우미 위치 갱신,
   `tools/split-app.cjs`의 기준표(MAP)에도 같은 경계를 넣는다(새 파일의 첫 코드 줄을 `start`로).
4. `node tools/stamp-version.cjs` → `node tools/load-order.cjs`(위반 0, textForward 그대로 — 같은 파일 안 호이스팅 의존을 갈라놓으면
   위반으로 바뀐다) → `node --test tests/*.test.cjs desktop/test/*.test.cjs` → boot-check.
5. 텍스트가 그대로인지: 고치기 전 `node tools/app-source.cjs index.html --out=<임시>/before.html`을 떠 두고, 고친 뒤 다시 떠서 바이트 비교.
   재조립 테스트는 `--like`(지금 구조를 읽음)라 새 경계를 그대로 받는다. 기준표로도 확인하려면
   `node tools/split-app.cjs --src=<임시>/before.html --out=<임시>/re`의 결과가 지금 js·css와 같아야 한다.
- 합치기(두 파일을 하나로)도 같다. 파일을 지우거나 이름을 바꾸면 테스트의 `JS_ORDER`도 고친다(그 밖의 기존 순서는 그대로).
