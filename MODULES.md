# 날씨 CG 메이커 — 모듈 지도 (먼저 읽을 것)

이 앱은 2026-10-08부터 **기능별 파일로 나뉘어 있다.** `index.html`은 뼈대(head·마크업·데이터 스크립트)와 태그뿐이고,
로직은 `js/*.js`(47개), 스타일은 `css/*.css`(16개)에 있다. 나눌 때 기존 코드는 한 줄도 바꾸지 않았다(아래 '분할 이력' — 분할 때 34·11개, 뒤에 통보문 불러오기 `bulletin-load.js`, 이미지로 추출 팝업 `export-dialog`, AE식 타임라인 `timeline-plan.js`·`timeline-input.js`, 작업 중 효과 `busy-fx` 한 쌍, 틸트 WebGL 렌더러 `tilt-gl.js`, 미해군(JTWC) 자동 불러오기 `typhoon-jtwc.js`, 날짜 고르기 `date-picker` 한 쌍, 드롭다운 `dropdown` 한 쌍, 데이터 지도 `data-maps`·`data-load`·`css/data-maps.css`, 가벼운 지도(WebGL · 시험) `gl-basemap.js`, AE로 보내기 'GEOlayers 지도로' `ae-geo.js`를 더했다).

- Claude·GPT 등 AI 공용 안내는 [`AGENTS.md`](AGENTS.md). 이 문서는 그 자세한 판이다.
- 함수 찾기: `grep -nE "^(async )?function 이름\b|^(const|let) 이름\b" js/*.js`
  (`index.html`에서 함수 본문을 찾지 말 것 — 거기엔 없다. `const 이름 = (…) =>` 꼴 함수도 많아서 `function`만 찾으면 놓친다.)

---

## 1. 구조

```
index.html          뼈대: head 인라인(웹판 막기·서비스워커 등록·모듈 로드 실패 가드·배치 슬롯·글꼴 주입) + <link css/…> 16개
                    + 마크업 + 테마 + 데이터 스크립트 13개 + <script src="js/…"> 47개(맨 끝)
js/                 앱 로직 47개 — 아래 표 순서가 곧 로드 순서
css/                스타일 16개 — 아래 표 순서가 곧 덮어쓰기 우선순위
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
   `wcgDesktop`(데스크톱 preload), `_per _mas`(head 인라인 var), 데이터 전역 13개(`WCG_DEFAULTS KOREA_MAP REGION_MAP …` — 데이터는
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
| 1 | `js/core.js` | 192 | 공통 도우미, 색 팔레트, 기본 상태 `DEFAULTS`·`S`, 선택 도우미, MAP/IMG 데이터 보정(시군 세분·태풍·서울·**데이터 지도 등록** — 생활기상·미세먼지 농도 = 시군구, 미세먼지 예보 = 예보 권역 19, `region-map-data.js`), 지도 종류 판별 | `$` `el` `tip` `svgNS` `RAMPS` `DEFAULTS` `S` `isTyphoon` `isSeoul` `curStyle` `fills` `bumpSeq` |
| 2 | `js/brush.js` | 581 | 브러쉬 덧칠 엔진: 공간 캐시·색 런 캔버스·증분 적용·되돌리기 조각, `<image>` 반영, PNG 인코딩 워커 | `brushApply` `brushRevert` `brushReconcile` `brushSyncImgs` `brushEncode` `brushPublish` `brushFinalize` |
| 3 | `js/brush-ui.js` | 228 | 브러쉬 화면·입력: 라이브 캔버스·스포이드, 시도 영역 선택, 칠하기 드래그, 좌표 변환 | `renderBrush` `brushLiveOf` `toggleBrushRegion` `startBrush` `projLL` `xyToLonLat` `insetBBox` |
| 4 | `js/map-build.js` | 409 | 실행 취소(+ 작업 바뀜 번호 `_workRev` — 닫기 전 묻기 판정용), SVG 뼈대 구성, 지도 스타일 전환, CG 종류/배경 버튼, **지도 종류 카드 = 데이터별**(10-10 — `MAP_CARDS` 9장·카드 안 구분 칩·칠하는 구분 이름/구역 수), 사이드바 데이터 섹션 숨김(`secModeHidden`), **지금 칠하는 구분** 배지·구분 줄(`syncMapUnit`) | `pushUndo` `undo` `redo` `applyState` `svg` `buildFrame` `buildZones` `setStyle` `_workRev` `MAP_CARDS` `cardOf` `mapUnitOf` `syncMapUnit` |
| 5 | `js/map-render.js` | 409 | 지도 렌더: 위치·잠금, 예보지도 연결, Mapbox 타일·위성, 인셋, 칠, 경계선, 바다, 배경 | `renderMapTransform` `wireMapPos` `renderFills` `renderBg` |
| 6 | `js/gl-basemap.js` | 359 | **태풍 지도 배경 '가벼운 지도 (WebGL · 시험)'**(10-10): 벡터 타일(OpenFreeMap — 키·가입 없음)을 MapLibre GL(`vendor/maplibre-gl/` 5.24.0, BSD-3 — 고를 때만 읽음)이 GPU로 그린다. 화면 = 아트보드 뒤 캔버스(`#glMap`>`#glMapIn`, 투영 1:1 — `glbView`: zoom = log2(2π·scale·S.map.s·k/512)), 끌기·휠·렌더마다 `glbSync`(jumpTo + 같은 프레임 redraw), 준비되면 renderTyphoon이 파란 바다·육지·지형을 숨김(`glbMarkHidden`). 추출·틸트·영상·AE = SVG 복제본의 `#bgMapT[data-glb]`에 그 영역 GL 그림(`glbInlineClone` — 숨은 추출용 지도, 타일 다 받을 때까지·시간 제한), 위도 ±85° 밖은 바다색. 실패(오프라인·엔진·WebGL·타일·시간)·노말 VF = 파란 지도로 + 알림·다시 시도. **위성 사진**(10-10 — `S.typhoon.glSat` 기본 1, 팝오버 두 칸 고르기 '위성 사진 · 벡터만' `glbSetSat`): 'Mapbox 실시간 타일'에 넣어 둔 Mapbox 주소(localStorage `wcg_mapbox_url`)를 그림 타일 소스로(`glbSatSrc` — 스타일 주소 → Static Tiles 512 @2x, v4 래스터 → 256 @2x, 토큰은 그 주소에서만) 맨 아래에 — 그때는 벡터 타일·육지·바다 면·경계를 다 뺀다. 넣어 둔 주소가 없거나 못 알아보면 **데스크톱 기본 출처**(`glbSatBuiltinUrl` — 비공개 `desktop/private/mapbox.token`의 pk. 토큰 + 기본 스타일 `GLB_SAT_STYLE`). 출처 없음·한 장도 못 받음 = 벡터만(+ 까닭 한 줄·흐린 위성 칸·가벼운 지도 칸 안에 주소 칸 — [적용]해도 배경은 그대로 `glbUrlApplied`·알림), 일부 실패 = 받은 데까지(추출은 한 번 더 해 본 뒤). 불러오는 중 위성 실패는 알림 없이 벡터로 → 끝에 한 번(벡터도 실패 = '모두 못 받음' 하나, why `net`). 격자 기본값은 위성처럼 끔(`glbSatOn` — typhoonGridIsSat, 노말 VF는 파란 지도처럼). 스타일이 바뀌면 `glbRestyle`(setStyle). 렌더 전 미리 받기 `glbPrefetchUrls` = MapLibre coveringZoomLevel 그대로(벡터 내림·그림 타일 반올림·256은 +1, 영역·크기는 `glbSnapBox` 공용). 영상 렌더 중엔 화면 지도가 카메라를 안 따라간다(추가 요청 0 — 한 번도 자리 안 잡은 지도만 한 번). 스타일 바꾸기(위성 → 벡터)는 렌더 중에도(불러오는 중 위성 실패가 막히지 않게), 불러오는 중 스타일을 바꾸면 기다린 시간도 처음부터. 렌더 전 미리 받기는 불러오는 중이면 끝을 보고, 실패면 0장. 오프라인이어도 데스크톱(디스크 캐시 길)은 한 번 해 본다 | `glbActive` `glbShowing` `glbStyle` `glbView` `glbBand` `glbSync` `glbMarkHidden` `glbInlineClone` `glbSnap` `glbSnapBox` `glbSettle` `glbPending` `glbPicked` `glbRetry` `glbUi` `glbSatSrc` `glbSatBuiltinUrl` `glbSatNow` `glbSatOn` `glbSetSat` `glbUrlApplied` `glbTokenArrived` `glbRestyle` `glbPrefetchUrls` |
| 7 | `js/vf-legend.js` | 386 | VF 막대·배율, 그림자, 제목 텍스트, 범례(특보·태풍 범례 목록) | `renderVfBar` `renderTexts` `renderLegend` |
| 8 | `js/labels-mountains.js` | 445 | 수치 라벨, 칠한 색 계열 바꾸기·자동 라벨, 산 표시, 선택 상자, **renderAll** | `newLabel` `renderLabels` `swapRamp` `autoLabels` `renderMtns` `renderSel` `renderAll` |
| 9 | `js/typhoon-core.js` | 505 | 태풍: 좌표·카메라 투영, 기본값·등급·날짜 범위, 스타일, 데이터 초기화, 범례 카탈로그, 아이콘·반경 | `typhoonXY` `applyTyphoonStyle` `initTyphoonData` `typhoonIconEl` |
| 10 | `js/typhoon-render.js` | 753 | 태풍 그리기: 예보 비교 경로·라벨, 진로선, 지명표시, 제목, 재생 | `drawCompareTracks` `drawTyphoonTrack` `renderTyphoon` |
| 11 | `js/typhoon-panel.js` | 567 | 태풍 패널 UI: 비교 카드, 패널·밴드, 펜툴, 참고 이미지 | `addCompareForecast` `buildTyphoonPanel` `startPen` `wireTyphoonPanel` |
| 12 | `js/typhoon-api.js` | 431 | 태풍 데이터: 기상청 typ/td 파싱, JMA·JTWC, 이름 저장, 불러오기(기상청 조회 줄 — 동시 6개·우선순위·캐시(다시 누르면 최근 시각은 새로)·다시 보내기(헬퍼가 스스로 하나 더 보내면 — 응답 머리 `X-WCG-Kma: hedge`, `_kmaQ.helperHedge` — 끔, 대신 급한 조회는 첫 하나 더 시각 `&hedge=` 0.9초를 헬퍼에 넘김. 표시는 불러오기 시작 때 `/ping` 머리로 미리(`_kmaHelperMark`), 프록시 PC는 표시 없음 → 예전처럼 여기서 한 번 더, 10-12), 12시간 창 규칙으로 덜 묻기), 발생·소멸 TD는 뒤에서(입력 중이면 미룸) | `parseTypNow` `fetchTyphoon` `typhoonApiUrl` `kmaRequest` `_kmaFirst` `_kmaHelperMark` |
| 13 | `js/typhoon-jtwc.js` | 275 | **미해군(JTWC) 자동 불러오기**(데스크톱 앱 — 메인이 metoc.navy.mil/jtwc 의 RSS·.tcw만 받음: desktop/jtwc.js): 활동 중인 태풍 목록(RSS) 해석(서태평양 먼저)·고르기 팝업(토스 모달), 고른 태풍 통보문(.tcw) 받아 붙여넣기와 같은 길(applyTyphoonText)로 그리기, 없음·실패 안내(다시 시도·사이트 열기·직접 붙여넣기 — 태풍 '자동이 안 될 때'를 이번만 펼침). 웹판·옛 데스크톱은 사이트 열기 | `fetchJtwc` `loadJtwcStorm` `parseJtwcRss` `jtwcCanFetch` `jtwcErrText` `jtwcSyncButtons` |
| 14 | `js/panels.js` | 608 | 사이드바 패널(팔레트·인셋·목록·섹션 열기), **섹션 안 접이식 묶음**(잘 안 쓰는 메뉴 — 예보 API·특보·태풍 '자동이 안 될 때'. 기본 접힘·제목 줄로 펼침·상태 기억, 실패 카드 등에서 이번만 펼쳐 보이게 스크롤), 캔버스 요소 → 섹션 자동 열기, 선택, 칠하기 | `buildPalette` `revealSec` `foldWire` `foldReveal` `select` `refreshPanel` `syncPanelFromState` `paint` `markActive` |
| 15 | `js/view-camera.js` | 305 | 작업창 줌·맞춤·틸트 미리보기(그림 버퍼 #camCanvas 래스터·GL/CSS 그리기·첫 진입 게이트·예열·다시 굽기 판단 — 회전만 바뀌면 안 굽기, 태풍은 무거운 바탕을 따로 두고 경로 레이어만 다시 굽기, 드래그 놓을 때 섞어 바꾸기, 다시 굽게 하기 `tiltInvalidate`(늦게 온 위성 타일·작업 바꿈·GPU 리셋 — GPU 프로세스가 죽으면 2D 그림 버퍼도 비워지므로 그동안 평면 지도로 두고 되찾으면 다시 굽기), 타임라인을 닫으면 GL 텍스처 반납), 더블클릭 인라인 편집, Alt 카메라 조작 | `sizeFit` `applyView` `applyTilt` `rasterTiltCanvas` `tiltWant` `tiltPrewarm` `tiltInvalidate` `inlineEdit` |
| 16 | `js/tilt-gl.js` | 174 | **틸트 지도 WebGL2 렌더러**: 블리드 지도 그림을 밉맵(LINEAR_MIPMAP_LINEAR)·비등방(최대 16) 텍스처로 원근 투영(warpTilt3D·CSS와 같은 식) — 미리보기(#camGL, 그림이 바뀔 때만 올리고 회전만 바뀌면 다시 그리기만)·추출(tglWarp) 공용. 가장자리 페이드는 셰이더. 못 쓰거나 컨텍스트를 잃으면 null/false → 미리보기 CSS 3D·추출 2D 메시로. 끄기: localStorage wcg_tiltgl=0 | `tglCreate` `tglUpload` `tglDraw` `tglQuad` `tglWarp` `tglOk` |
| 17 | `js/pointer-drag.js` | 512 | 캔버스 포인터(칠·선택), 브러쉬 커서, 드래그·스냅, 리사이즈, **키보드 단축키**, 삭제·모드 | `dragLoop` `startDragItem` `delSel` `setMode` |
| 18 | `js/warnings.js` | 384 | 기상특보 파싱·단계 색·발효 순서, 불러오기 결과 판정·문구(불러오는 중 카드의 늦음 단계 `slow` 1·2 — 10-12) | `parseWrn` `wrnColorOf` `wrnReadText` `wrnHttpFail` `wrnResultView` |
| 19 | `js/warnings-apply.js` | 403 | 기상청 API 주소·키(예보·태풍도 씀), 특보 런타임 목록, 특보 적용·칠·발효 현황·목록 | `apiKey` `apiUrl` `applyWrn` `paintWrn` `buildWrnList` |
| 20 | `js/bulletin.js` | 664 | 기상예보 파싱·색, 통보문 강수량 붙여넣기(용어 사전·지역 표현 파서) | `parseFct` `parseBulletin` `applyBulletin` |
| 21 | `js/bulletin-load.js` | 371 | **통보문 불러오기**(헬퍼 /api/kma로 날씨누리 단기예보 페이지 — 인증키 안 씀)·데스크톱 날씨누리 창 읽기, 원문에서 '예상 강수량' 날짜 묶음 나누기·고르기·결과 카드, 통째 붙여넣기 | `fetchBulletin` `bulReadPage` `bulSplitGroups` `bulPickItems` `bulResultView` `showBulResult` `bulOnPaste` `bulFromWnuri` |
| 22 | `js/forecast-panel.js` | 206 | 예보 적용·고르기·목록, 작업 런타임 초기화, 예보 종류 버튼 | `applyFct` `buildFctList` `resetWorkRuntime` `setFctKind` |
| 23 | `js/warnings-load.js` | 120 | **특보 '기상청에서 불러오기'**(헬퍼 /api/kma 경유)·결과 카드(**늦을 때 진행 문구** `wrnSlowNote` — 1.6초 '기상청 응답이 늦어 다시 요청하는 중'(헬퍼가 하나 더 보내면, `pingHelper().hedge` — 프록시 PC면 표시가 없어 '기다리는 중')·8초 '많이 늦어요', 응답 머리가 오면 바로 멈춤 — 10-12), **특보 종류별 색**(10-09 — 사이드바 색 격자를 버튼 하나로: 버튼 점 `buildWrnCols` + 2분할 팝업 `#wrnColOv` — 왼쪽 특보 종류(S.wrnColors 키 순서 = 위가 우선), 오른쪽 고른 특보의 단계(예비특보·주의보·경보·중대경보)마다 큰 색 칸·#hex·지도 조각. 저장은 옛 격자·들어온 특보 목록과 같은 자리: 주의보·경보 = `S.wrnColors`, 그 밖 단계 = `S.wrnLevelColors`) | `fetchWrn` `showWrnResult` `wrnRefreshResult` `wrnSlowNote` `buildWrnCols` `openWrnColPop` `closeWrnColPop` `wrnColPopIsOpen` `setupWrnColPop` `wrnColSet` |
| 24 | `js/data-maps.js` | 330 | **공공데이터포털 자료 공통**(10-10 — 생활기상·미세먼지): 주소·오퍼레이션·응답 이름 설정 한 곳(`DATA_API` — ✓ 실키 확인/? 확인 필요 표시), 인증키(`dataKey` — API 설정 칸, localStorage `wcg_datakey`, Encoding 키면 한 번 풂)·키 가리기(`dataMask` — 카드·알림·콘솔 전), 요청(`dataGet` — **10-10 느림·멈춤 고치기**: 데스크톱 메인 길 `wcgDesktop.dataFetch`(연결 재사용·늦은 새 연결엔 하나 더 — `desktop/data-fetch.js`) 우선, 못 쓰면(점검 모드·프록시 PC·옛 메인) 헬퍼 `/api/kma`(`dataSendHelper`), 시도마다 첫 응답 시간 제한 5·9·15·25초·게이트웨이 오류/시간 초과면 다시 보내기(`DATA_TRY` — 최대 4번), 받는 길 상태·보낸 수 `dataNet`, 준비 `dataReady`), 응답 판정(`dataReadBody` — JSON resultCode·`OpenAPI_ServiceResponse` 감싼 게이트웨이 오류(504/503 SERVICETIMEOUT 05)·XML returnReasonCode·게이트웨이 글자·HTML → ok/nodata/keyBad/denied/quota/tps/noService/param/server/format, 생활기상 99 '검색결과가 없습니다' = nodata)·헬퍼 실패(`dataHttpFail` — 시간 초과 문구를 5xx보다 먼저)·포털 직접 응답(`dataHttpBody`), 여러 쪽(`dataGetPages` — 총건수 0(광주·전남)이면 numOfRows보다 적은 쪽이 끝), 동시 요청(`dataPool` — 동시 4·간격 60ms(생활기상 30ms)·캐시 항목은 간격 없이(`quick`)·초당 한도 재시도·치명 오류면 멈춤), 캐시(`dataCachePut(키, 응답, 유효 ms)` — 자료마다 유효 시각), 색 단계표(`DATA_SCALES` — 자외선·대기정체·PM10·PM2.5·예보 등급, 바꾼 색 `S.dataColors`), 범례 자동 항목(`dataLegendItems`·`autoLegendItems` — 범례·타임라인·AE 칠 레이어 이름), 결과 카드(`dataResultView`·`showDataResult` — 특보 카드 규칙), 단계 목록(색 칸 = 단계 색 바꾸기·이름 = 칠할 색 집기), 수치 라벨(`dataMakeLabels`)·지도별 라벨 맡기기(`dataLabelsSwap` — setStyle) | `DATA_API` `dataKey` `dataMask` `dataGet` `dataSendOnce` `dataReady` `DATA_TRY` `dataNet` `dataReadBody` `dataPool` `DATA_SCALES` `dataLegendItems` `autoLegendItems` `showDataResult` `dataLabelsSwap` |
| 25 | `js/data-load.js` | 560 | **데이터 지도 불러오기**(10-10): 생활기상(`fetchLife` — 발표 시각 찾기(06·18시 후보)·시군구 230건(옛 코드 차례로)·시각 고르기(다시 받지 않음)·못 받은 곳만 다시), 미세먼지 농도(`fetchDust` — 시도 17건(DAILY = 최근 24시간 시간별 값, numOfRows 1000 → 시도당 1쪽) → `dustMatch`(시도+이름·districtCode·옛 이름 평균, 1시간 값·빈 값 보충(같은 시군구 3시간 안 직전 값 → 24시간 평균)·24시간 평균(18칸 이상)·빈 곳 까닭)·PM10↔PM2.5·1시간↔24시간 평균은 다시 칠하기만(`dustSetItem`·`dustSetCond`)·못 받은 시도만 다시·캐시 다음 정시 자료까지(`dustTtl`)), 미세먼지 예보(`fetchDustFcst` — 조회일 하나 = 한 번(InformCode 무시 — 세 종류가 한 응답, `dfcGetDay` 캐시 다음 발표까지 `dfcTtl`), 05시 발표 전 '오늘'은 어제 조회를 함께 → `dfcParse`(발표·예보일)·`dfcGrades`(권역 이름 별칭)·발표/예보일 고르기, 오늘·내일 이름은 조회일 기준 `dfcRefDay`), 칠은 들어온 구분 그대로 자기 지도에만(지도가 바뀌었으면 안 칠함), 패널 배선(`setupDataPanels` — boot.js)·동기화(`syncDataPanels` — updateAutoPaintSecs 끝) | `fetchLife` `fetchDust` `fetchDustFcst` `lifeBaseTimes` `lifeParseItem` `lifeSlots` `dustMatch` `dustSetCond` `dustTtl` `dfcGetDay` `dfcTtl` `dfcParse` `dfcGrades` `setupDataPanels` `syncDataPanels` |
| 26 | `js/presets.js` | 266 | 해상도별 배치 프리셋, **작업 자동 저장**, 배포 기본값 갱신 | `savePreset` `saveWork` `loadWork` `applyPreset` |
| 27 | `js/cg-setup.js` | 297 | 해상도·CG 구성 창(화면 이름 **장면 설정**, 10-09 바꿈 — 코드·주석은 옛 이름), **상태 표시**, 출력 폴더(IndexedDB), 영상 저장 대상 `prepareOutput`(`{name, write, discard}` — discard = 렌더 취소 때 저장 대화상자가 고르는 순간 만든 **빈 파일만** 지움, 저장 폴더·다운로드는 write 전엔 아무것도 안 만듦) · **렌더 결과 폴더 열기**(10-12 — 데스크톱: 영상 저장이 끝나면 `#tlInfo` 옆 `#tlOpenDir`, 다음 렌더가 저장할 곳을 정하면 숨김. 경로는 메인이 찾아 줌 — 10장) | `RES` `openCgSetup` `status` `flash` `flashDone` `prepareOutput` `outRevealFind` `outRevealOpen` `outRevealStart` `outRevealSaved` `outRevealClick` `OUT_OPEN_ICON` |
| 28 | `js/modals-notices.js` | 354 | **팝업 공통**(닫힘 애니메이션·포커스), **토스 카드 모달**, 공지사항, 내보내기 진행 마스크, **렌더 취소**(10-12 — 가리개 진행 막대 아래 [렌더 취소](`.tossBtn.ghost`)·Esc → `exportCancelReq`: 렌더 중일 때 한 번만, 버튼 '취소하는 중…'(안 눌림), `exportCancelSignal()`(AbortSignal)도 끊음. 루프는 `exportCancelCheck()`(던지는 오류 `cancelled`)·`exportCancelled()`로 멈추고 실패와 가른다, 렌더 시작·끝 `exportCancelReset()`. Esc는 가리개가 떠 있는 동안만 창 캡처 단계(`exportCancelKey` — 타임라인·펜툴 Esc보다 먼저, 받으면 아래로 안 보냄), 위에 뜬 창·목록·글자 칸이 있으면 그쪽 Esc(`exportEscOwner`)), 확인/입력 모달 | `popAnimClose` `popFocusIn` `tossModal` `checkNoticeOnBoot` `showExportMask` `exportCancelReq` `exportCancelCheck` `exportCancelled` `exportCancelReset` `exportCancelSignal` `exportEscOwner` `tossConfirm` `tossPrompt` |
| 29 | `js/dropdown.js` | 352 | **드롭다운**(10-09 — 공용 부품): 시스템 `<select>`를 숨기고(값·옵션·change 계약 그대로 — `select.value`·`selectedIndex` 접근자를 덧씌우고 옵션은 MutationObserver로 따라감: 추가·삭제·글자·disabled·hidden·optgroup, select의 disabled·hidden·style.display·title) 옆에 버튼형 칸(고른 항목 + 꺾쇠, 칸 폭 = 가장 긴 항목) + **토스 카드 목록 팝오버**(칸 아래·자리 없으면 위·둘 다 모자라면 넓은 쪽에 높이를 줄여, position: fixed·칸의 배율 zoom, 고른 항목 파란 글자·체크, 올리면 옅은 바탕, 앱 스크롤바, 열 때 고른 항목이 가운데). 키: 칸에서 Enter·Space·↑↓ = 열기 / ↑↓·Home·End·PageUp·PageDown·Enter·Space·Esc·Tab·글자로 찾기, 바깥 누르기 = 닫기, 포커스는 칸(aria-activedescendant). 붙이기: boot.js `ddAttachAll()` + 관찰자, 태풍 비교 카드는 `wireCompareCard`에서 | `ddAttach` `ddAttachAll` `ddClose` `_ddNow` `ddItems` `ddStep` `ddFind` `ddPlace` `ddLabel` |
| 30 | `js/date-picker.js` | 578 | **날짜 고르기**(10-09): 시스템 날짜·시각 칸(`<input type=date>`·`type=time`)을 숨기고(값·change 계약 그대로 — `input.value` 접근자를 덧씌워 코드가 바꿔도 칸이 따라감) 근무표식 **아이폰 달력 팝오버**(칸 아래·자리 없으면 위, position: fixed·사이드바 배율, 바깥·Esc 닫기, 화살표·PageUp/Down(Shift = 한 해)·Enter) + 제목을 누르면 **iOS식 연·월 휠**(scroll-snap·가운데 띠·위아래 흐림, 마우스 휠·끌기·누르기·키, 블러+스케일 모핑) + **시각 직접 입력**(근무표 ndTime — '시 : 분', ↑↓·휠, 분 = step 단위, 자주 쓰는 시각 팝오버). 지난 날짜용 — 오늘 이후·min/max 밖은 흐리게. 붙이기: boot.js `dpAttachAll()`, 태풍 비교 카드는 `wireCompareCard`에서 | `dpAttach` `dpTimeAttach` `dpAttachAll` `dpClose` `dpMonthCells` `dpLimits` `dpYearItems` `dpMonthItems` `dpTimeNorm` |
| 31 | `js/busy-fx.js` | 163 | **작업 중·도착 효과**(뉴스 플레이어 검수 로딩 효과): 섹션·상자에 흐르는 그라디언트, 버튼 진행(흐름+비활성)·제목줄 버튼 색 띠·진행 막대, 결과 목록 자리 빛 훑는 막대, 섹션 머리만 옅은 띠(뒤에서 도는 확인 — h3), 도착(머리 빛·행 떠오름). 겹친 작업은 센다(켤 때·끌 때 같은 배열 = 한 작업 — 안전 해제 뒤 늦은 끄기가 새 작업을 안 끈다), `fxRun`은 실패해도 끈다 | `fxBusy` `fxRun` `fxArrive` `fxProgress` `fxSec` `fxHead` `fxRows` `fxClear` |
| 32 | `js/preset-slots.js` | 251 | 배치 지정하기(완전 기본/개인 슬롯, 구운 배치 파일) | `openPresetSlots` `buildCurrentPresets` |
| 33 | `js/export-image.js` | 314 | 이미지 추출 공통: 출력 글꼴 임베드, 카메라 레이어, 텍스트 오버레이, 3D 틸트 워프 | `suiteFontCss` `svgToImage` `drawExportFrame` |
| 34 | `js/export-video.js` | 410 | 정확 MP4·PNG 시퀀스, 로컬 헬퍼(WNS) 연결·상태(렌치 빨간 점·기능 확장팩 줄)·렌더. **렌더 취소**(10-12): 세 루프·렌더 전 미리 받기가 프레임마다·긴 기다림 뒤에 `exportCancelCheck()` — MP4 = 인코더 닫고 파일 안 씀, PNG = zip 안 묶음, MXF/MOV = 워커 종료·`/api/finalize` 안 부름(부르는 중이면 끊음)·`POST /api/cancel?sid=`(내장 헬퍼만 — 옛 헬퍼 실패는 무시), 미리 받기 = 새 타일 안 받고 받던 것도 안 기다림. 공통 마무리 `renderCancelled(out)`(`out.discard()`·상태 줄 '렌더를 취소했어요 — 파일은 만들지 않았어요' — 실패 알림과 다름), 나머지(가리개·`_exportingFrames`·버튼·미리보기 복귀)는 루프의 finally | `bakeMp4` `pingHelper` `checkHelperFreshOnBoot` `wnsHelperOffNotice` `wnsRender` `prefetchRenderTiles` `renderCancelled` |
| 35 | `js/export-blobs.js` | 198 | **추출 핵심**: 레이어 목록·SVG→PNG blob, 미리보기, 프로젝트 파일 PNG 메타(읽기), 내보내기 대상 | `ALL_LAYERS` `svgBlob` `keepLayers` `pngEmbed` `readProjectFile` `exportBlobs` |
| 36 | `js/ae-export.js` | 572 | After Effects 보내기(타임라인 = AE — 헬퍼 20261008: 앱 이징 곡선을 AE 키 영향값으로·태풍/비교 진행 곡선·블라인드·일반/비교 지도 카메라(이동/고정 레이어 나눔·블리드)·방향·지시선 셰이프·옮기지 않은 비교 이름표 따라가기(nameLabel.follow)), 다운로드 | `sendToAE` `aeEaseOf` `aeCamSpec` `aeBleedBox` `aeLeaderSpec` `aeBlindMtnSpan` `download` |
| 37 | `js/ae-geo.js` | 300 | **AE로 보내기 'GEOlayers 지도로'**(10-10): 제목줄 'AE로 보내기' = `aeSendClick` — 헬퍼가 그 길을 알고(GET `/api/geo-caps`) 이 PC에 GEOlayers 3가 있으면 보내는 방식 토스 모달(`aeAskMode` — 카드 2장 '레이어 그림으로'(지금 방식)·'GEOlayers 지도로', 태풍 지도만 켜짐·다른 지도·노말 VF는 흐림 + 까닭 `aeGeoWhyNot`, 고른 것 기억 localStorage `wcg_ae_mode`, 설치판이 지원하는 AE 범위를 알면 안내에 덧붙임), 아니면 팝업 없이 `sendToAE()`(옛 헬퍼·부팅 점검 길). geo 명세 `aeGeoSpec`(순수 함수 — `sendToAE({ aeMode: 'geolayers' })`가 spec.mode·spec.geo로): 앱 지도 위치 → GEOlayers 보기(`geoViewOf` — zoom = log2(2π·scale·s·k/512), 512 타일 = glbView와 같음, bearing = rz, pitch 0), 카메라 키 → 보기 키·프레임마다 구운 보기(`geoViewPlan` = camAt, 줄 시각 = AE 프레임 격자 n/fps + 첫·끝 키), 리깅 CAM 묶기 상수(투영 원점 세계 px·작업 뷰 px/라디안), 태풍 GeoJSON(지난·예상 선, 반경 = 앱과 같은 메르카토르 원 128각 + 사다리꼴 `geoBandPolys`, 지점)·셰이프 스타일, 비교 지도는 예보선마다 선. 리깅 카메라는 위치·배율 항등 키 + 앱 rz(`aeGeoCamSpec` — 움직임은 헬퍼가 CAM을 GEOlayers 앵커에 묶고, 회전이 있으면 생기는 ROT 널을 CAM 방향에 묶어 라벨 박스도 돈다), 바탕 = 지도에 붙는 겹만 투명 PNG(`aeGeoOverlayBlob` — 바다·육지·지형·위성·Mapbox·GL 그림 뺌), 남한 강조는 따로(`aeGeoKrBlob` — AE 스크린 혼합) | `aeSendClick` `aeAskMode` `aeModeCards` `aeGeoCaps` `aeGeoWhyNot` `aeGeoSpec` `aeGeoCamSpec` `geoViewOf` `geoViewPlan` `geoWorldXY` `geoAppXY` `geoCompXY` `geoCircleRing` `geoBandPolys` `aeGeoOverlayBlob` `aeGeoKrBlob` |
| 38 | `js/export-dialog.js` | 378 | **이미지로 추출 팝업**(CG 구성 모양 — 묶음 3판·아이콘 카드·빠른 선택·고른 것 기억)과 **저장**(폴더 고르기(지난번 폴더 'imgDir') → `오늘날짜_날씨CG메이커` 폴더 → 카드 이름 그대로 PNG, 같은 이름이면 덮어쓰기/번호/취소(같은 이름 '폴더'는 그 장만 번호), 폴더 고르기를 못 쓰면 ZIP, 취소·권한 거절은 까닭 + [ZIP으로 받기] — 말없이 ZIP 안 받음), 정지 화면에서 굽기, 저장 뒤 바닥 요약 [폴더 열기](10-12 — 첫 장을 골라 둔 채 탐색기, 다음 이미지 렌더까지·다시 연 팝업에도) | `openExport` `renderExport` `withStaticFrame` `exportFolderName` `setupExportDialog` `EXPORT_ICON` `exErrText` `exRevealBtn` |
| 39 | `js/project-io.js` | 325 | 설정 옮기기, 프로젝트 저장/열기, 최근 파일, 기본 배치 굽기, **저장 안 한 변경 판정·닫기 전 묻기**(데스크톱 — 10장 · [렌더 취소]를 누른 뒤 멈추는 중은 '렌더 중' 아님) | `exportSettings` `importSettings` `saveProject` `bakeDefaults` `workDirty` `workMarkClean` `closeAsk` |
| 40 | `js/wiring.js` | 778 | 버튼·입력 배선 `wire()`(함수 하나) + 사이드바 그룹 정리(로드 때 실행) | `wire` `refreshToolGroup` |
| 41 | `js/anim.js` | 640 | 영상 애니메이션: 이징, 카메라 키프레임, 자동 트랙(계획·적용), renderAnimFrame(정확 경로 + 재생 중 가속 경로 — 틸트 그림은 지도 내용이 바뀐 프레임만 다시 굽기: animMapKey), 재생/정지/탐색, 저장용 상태 | `cubicBezier` `renderAnimFrame` `animFastOn` `animPlay` `animStop` `stateForSave` `autoTrackPlan` |
| 42 | `js/timeline-plan.js` | 230 | 타임라인 레이어 계획(화면·AE 공용 목록·순서·이름·타이밍), 시간 도우미(프레임·타임코드·입력 해석), 막대 끌기 계산, 스냅 대상 | `tlLayerPlan` `tlQuant` `tlFmtTC` `tlParseTime` `tlSetSpan` `tlDragCalc` `tlSnapTargets` |
| 43 | `js/timeline-ui.js` | 560 | 타임라인 화면(AE식 레이어 열·아이콘·막대·키·눈금자·CTI·내비게이터), 그리기 스케줄러(rAF 하나), 열기·높이·미리보기, 카메라 키 팝오버. 내용 변경 알림 `tlContentChanged`(renderAll·renderFills — 가속 미리보기를 걷고 다시 그림) / 1.5초 행 점검 `tlCheckRows`(boot.js — 가속은 그대로) | `buildTimeline` `tlSync` `tlInvalidate` `tlFrame` `tlSetT` `tlSetOpen` `tlContentChanged` `tlCheckRows` `openCamKeyPopover` `TL_ICONS` |
| 44 | `js/timeline-input.js` | 420 | 타임라인 조작: 막대·키 끌기(프레임·스냅·다중 선택), 스크럽·줌·스크롤, 이름 열 숫자 끌기·키 내비게이터, 키보드 단축키·패널 포커스, Alt 카메라 자동 키 | `tlWire` `tlKeydown` `tlOwnsKeys` `tlCamKeyAt` `tlCamAutoKey` |
| 45 | `js/floating-panels.js` | 670 | 떼어낸 창, 패널 크기, 레이아웃, **제목줄 메뉴(추출·프로젝트·설정(렌치))**, 시작 화면 | `popOut` `dockSec` `loadLayout` `setupMenus` `setupStartScreen` `showStartScreen` |
| 46 | `js/tour.js` | 200 | 둘러보기(온보딩 투어) | `tourOpen` `tourGo` `wireTour` |
| 47 | `js/boot.js` | 119 | 파일 끌어다 놓아 열기 + **앱 부팅 순서**(build·wire·loadLayout·renderAll, 이어 열기, 자동 저장 타이머) — **반드시 마지막** | `setupDropOpen` + 부팅 문장, `work` `freshOpen` `pendingStart` |

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
| 6 | `css/cg-setup.css` | 141 | CG 구성 모달(화면 이름 장면 설정) |
| 7 | `css/export-dialog.css` | 77 | 이미지로 추출 팝업 — CG 구성 클래스 재사용 + 묶음 3판 색(보라 `--cgs-mark` 토큰)·빠른 선택·장수 배지·흐린 카드·렌더 진행·좁은 창, 타임라인 '저장 폴더' 버튼, 렌더 결과 '폴더 열기'(`.tlOpenDir` — `[hidden]` 지킴, `.exSumOpen`) |
| 8 | `css/menus-windows.css` | 165 | 제목줄 메뉴 드롭다운 안 섹션·설정(렌치) 메뉴·기능 확장팩 줄, 떼어낸 창(탭·크기 조절·도킹 미리보기) |
| 9 | `css/timeline.css` | 190 | 타임라인(AE식 — 전용 토큰 어두운/밝은, 레이어 열·막대·키·CTI·눈금자·내비게이터), 도구 줄 오른쪽(저장 폴더 + 영상 렌더 묶음 `.tlRender` — MP4·PNG 시퀀스·MXF·알파 MOV 한 세그먼트, 초기화, 닫기 자리 — 닫기 모양은 toss-modal.css 공통 유리 원), 무대 줄이기, 추출 진행 바, 영상 추출 집중 모드, 카메라 키 팝오버 |
| 10 | `css/dialogs.css` | 171 | 인증키 안내, 특보 불러오기 결과 카드, 특보 종류별 색(사이드바 버튼·2분할 팝업 — 장면 설정 창 클래스 재사용 + `wrnCol*`), 알림 색 점, API 설정 창, 확인 모달, 배치 지정하기 모달 |
| 11 | `css/panel-misc.css` | 141 | 통보문·예보 박스, 섹션 안 접이식 묶음(`.subFold*` — 예보 API·특보 수동 붙여넣기), 링크 버튼, 칠한 색 목록·경고, 최근 파일, 이미지 안내 팝업, 마우스 배지, 토스트, 브러쉬 영역 강조 |
| 12 | `css/data-maps.css` | 28 | 데이터 지도 섹션(생활기상·미세먼지 — js/data-load.js): 고르기 세그먼트(`.dataSeg` — 사이드바 `.mode`), 단계 목록(`.dataSteps` — 색 칸·이름과 범위·칠한 수), 예보 개황 세 줄, API 설정의 공공데이터포털 키 묶음(`.apiSep`·`.apiSvc`, 창이 길어지면 스크롤) |
| 13 | `css/toss-modal.css` | 158 | 토스 카드 모달, 공지, 접이식 묶음, 렌더 가리개(+ 진행 막대 아래 [렌더 취소] `.emCancel` — 누른 뒤 흐리게), 참고 이미지 드롭, 토글 스위치, 지도 배경 버튼, 브러쉬 원·가이드 |
| 14 | `css/dropdown.css` | 67 | 드롭다운(`js/dropdown.js`) — 칸(입력칸·날짜 칸과 같은 높이·테두리, 꺾쇠 — 열리면 위로·파랑, 숨겨 겹친 항목 글자로 폭), 자리별 크기(타임라인 도구 줄 28px·비교 일괄 줄), 목록 팝오버(반사 테두리 카드·팝오버 그림자, 체크·올림 바탕·고른 줄 파랑, optgroup 제목, 앱 스크롤바). 색 = 공통 토큰 + `--dp-acc`(두 테마) |
| 15 | `css/date-picker.css` | 132 | 날짜 고르기(`js/date-picker.js`) — 날짜 칸·달력 팝오버(근무표 nd-cal 모양: 반사 테두리 카드·파란 < >·요일 색·오늘 테두리·고른 날 파란 원·'오늘' 알약)·연월 휠(scroll-snap·가운데 띠·mask 흐림)·시각 칸·자주 쓰는 시각. 색 토큰 `--dp-*`는 base.css(두 테마) |
| 16 | `css/busy-fx.css` | 119 | 작업 중·도착 효과(`js/busy-fx.js`)의 모양·움직임 — 흐름(transform만, 호스트 `overflow: clip`), 버튼 띠·진행 막대, 자리표시 막대, 도착 빛, 렌더 가리개 흐름, 움직임 줄이기. **맨 뒤**(다른 규칙을 덮어야 한다) |

- css 안 상대 url은 **css/ 폴더 기준**이다(`url('../FontNew/…')`). js 안 경로(`fetch('FontNew/…')` 등)는 **문서 기준**이라 그대로다.
- `index.html`의 `<style id="fontEmbed">`(head, 글꼴 데이터 주입)와 SVG 안 `<style id="fontStyle">`(추출 때 JS가 채움)은 **옮기지 않는다.**

## 5. index.html에 남아 있는 것

| 자리 | 내용 |
|---|---|
| head 맨 앞 | **웹판 막기**(7장 — 첫 스크립트), 서비스워커 등록, `html.isDesktop` |
| 그 다음 | **모듈 로드 실패 가드**(7장) |
| | `default-presets.js` + 배치 슬롯으로 `WCG_DEFAULTS` 교체(`var _per/_mas`), `font-data.js` + `#fontEmbed`, Wanted Sans preload(UI 전용·FontNew 내장, CG 출력 SUITE는 그대로) |
| | `<link rel="stylesheet" href="css/…?v=…">` 16개 |
| body | 마크업(사이드바·제목줄·모달·SVG 등) |
| 끝 | 테마(`data-theme`), 데이터 스크립트 11개(`onerror` 대체값 — 지도 `map-data.js`·`seoul-map-data.js`·`region-map-data.js`(데이터 지도, 10-10)·태풍·지명·예보·이미지), `<script src="js/…?v=…">` 47개 |

## 6. 공용 도우미 위치

| 이름 | 파일 |
|---|---|
| `$` `el` `tip` `svgNS` `DEFAULTS` `S` `curStyle` `isTyphoon` | `core.js` |
| `pushUndo` `undo` `redo` `svg` `buildFrame` `setStyle` | `map-build.js` |
| `MAP_CARDS`(지도 종류 카드 = 데이터별 — 카드 ↔ 구분 키 ↔ 사이드바 섹션) `cardOf(st)`(구분 키가 든 카드) `cardStyleFor` `cardLabelOf` `mapUnitOf(st)`(칠하는 구분 이름) `mapUnitCount` `mapUnitText` `syncMapUnit`(배지·구분 줄) | `map-build.js` |
| `renderAll` `renderLabels` `renderMtns` `renderSel` | `labels-mountains.js` |
| `select` `refreshPanel` `syncPanelFromState` `revealSec` | `panels.js` |
| `foldWire`(접이식 묶음 배선 — 기본 접힘·상태 기억) `foldReveal`(이번만 펼치고 보이게 스크롤·포커스) `foldSet` `foldIsOpen` (마크업·모양은 파일 안 주석, css `.subFold*`) | `panels.js` |
| `apiKey` `apiUrl` `apiPop(on, which)`(which = `'data'`면 공공데이터포털 키 칸) `syncKeyWarn` | `warnings-apply.js` |
| `DATA_API`(주소·오퍼레이션·응답 이름 한 곳) `dataKey` `dataMask` `dataUrl` `dataGet` `dataReadBody` `dataPool` `DATA_SCALES` `dataStep` `dataColOf` `dataLegendItems` `autoLegendItems`(범례 자동 항목 — 데이터 지도면 칠한 단계, 아니면 특보) `showDataResult` `dataMakeLabels` `dataLabelsSwap` `dataResetRuntime` | `data-maps.js` |
| `fetchLife` `fetchDust` `fetchDustFcst` `setupDataPanels` `syncDataPanels` `dataAreas` | `data-load.js` |
| `saveWork` `loadWork` `applyPreset` | `presets.js` |
| `status` `flash` `flashDone` `prepareOutput` `RES` `outRevealFind(단서)`(방금 저장한 파일 경로 — 데스크톱, 모르면 '') `outRevealOpen(경로)`(탐색기에서 골라 보이기 — 못 열면 까닭·false) `OUT_OPEN_ICON` | `cg-setup.js` |
| `popAnimClose` `popFocusIn` `tossModal` `tossConfirm` `tossPrompt` `showExportMask` | `modals-notices.js` |
| `exportCancelReq`(렌더 취소 요청 — [렌더 취소]·Esc) `exportCancelCheck`(눌렸으면 던짐 — 렌더 루프의 프레임마다·긴 기다림 뒤) `exportCancelled` `exportCancelReset`(렌더 시작·끝) `exportCancelSignal`(헬퍼 요청에 다는 AbortSignal) — 새 렌더 루프를 만들면 이 넷을 똑같이 쓴다 | `modals-notices.js` |
| `ddAttach`(드롭다운 칸 — 시스템 select 대신, 값·옵션·change 계약 그대로) `ddAttachAll(root)`(그 안의 select 전부 — 새로 그린 칸에) `ddClose` `_ddNow`(떠 있는 목록 — 뒤 팝업의 Esc 판정용) | `dropdown.js` |
| `dpAttach`(날짜 칸 — 시스템 달력 대신, 값 계약 그대로) `dpTimeAttach`(시각 칸) `dpAttachAll(root)`(그 안의 date·time 전부 — 새로 그린 칸에) `dpClose` | `date-picker.js` |
| `fxBusy` `fxRun` `fxArrive` `fxProgress` `fxSec` `fxHead` `fxRows` `fxClear` (작업 중·도착 효과 — 쓰는 법은 파일 머리 주석) | `busy-fx.js` |
| `fetchWrn` `showWrnResult` `buildWrnCols`(특보 종류별 색 — 버튼 점·떠 있는 팝업 갱신, `syncPanelFromState`가 부른다) `openWrnColPop` `closeWrnColPop` `wrnColPopIsOpen` | `warnings-load.js` |
| `fetchBulletin` `showBulResult` `bulReadPage` `bulResetPick` | `bulletin-load.js` |
| `fetchJtwc`(미해군 고르기 팝업) `loadJtwcStorm` `parseJtwcRss` `jtwcCanFetch` `jtwcManual` | `typhoon-jtwc.js` |
| `pingHelper`(`{ up, ver, old, hedge }` — hedge = 기상청 받기에서 스스로 하나 더 보내는 헬퍼, /ping 머리 `X-WCG-Kma` — apihub가 빠른 길을 타는 PC만, 프록시 PC는 없음) `wnsHelperOffNotice` `HELPER_VER_MIN` `wnsRender` `AE_EXT_VER` `aeHelperExt`(헬퍼가 AE 확장을 아는가 — 'AE 차이' 표시 기준) `renderCancelled(out)`(렌더 취소 공통 마무리) | `export-video.js` |
| `svgBlob` `keepLayers` `ALL_LAYERS` `readProjectFile` `pngEmbed` `pngExtract` `exportBlobs` `exportPlan` `exportWhyNot` `safeFileName` `EXPORT_STACK` | `export-blobs.js` |
| `download` `aeEaseOf`(앱 cubic-bezier(x1,0,x2,1) → AE 영향 [x1·100, (1−x2)·100]) `aeCamSpec` `aeBleedBox` | `ae-export.js` |
| `aeSendClick`(제목줄 AE 버튼 — 방식 묻기·바로 보내기) `aeGeoSpec`(GEOlayers 길 geo 명세) `geoViewOf`(앱 지도 위치 → GEOlayers 보기) `geoWorldXY`(경위도 → GEOlayers 세계 px) | `ae-geo.js` |
| `openExport` `closeExport` `exportIsOpen` `renderExport` `withStaticFrame` `exportFolderName` | `export-dialog.js` |
| `tlLayerPlan`(타임라인 레이어 = AE 레이어 목록·순서·타이밍) `tlQuant` `tlFmtTC` `tlParseTime` `tlSetSpan` | `timeline-plan.js` |
| `buildTimeline` `tlSetT`(재생헤드) `tlInvalidate` `tlRefreshPreview` `tlState` | `timeline-ui.js` |
| `stateForSave`(저장·되돌리기용 S — 카메라 미리보기 중이면 작업 뷰) `animFastOn/Off`(재생 중 가속) `autoTrackPlan` `animMapKey` `EASE_BEZIER` `EASE_VF`(AE 보내기가 같은 곡선을 옮김) | `anim.js` |
| `applyTilt` `camActive3d` `tiltWant` `tiltPrewarmSoon` `tiltInvalidate`(틸트 그림을 꼭 다시 굽게 — `_tiltRasterSig = null` 대신. `true` = 지금 그림도 버림) (틸트 미리보기) | `view-camera.js` |
| `tglCreate` `tglUpload` `tglDraw` `tglWarp` (틸트 WebGL — 미리보기·추출 공용) | `tilt-gl.js` |
| `glbActive`(태풍 지도 배경이 가벼운 지도인가) `glbShowing`(지금 GL로 보이나 — 준비·노말 VF 아님) `glbSync`(화면 캔버스를 지금 지도 위치로 — 끌기·렌더마다) `glbInlineClone`(추출 복제본에 그 영역 GL 그림) `glbView`(앱 지도 위치 → MapLibre 카메라) `glbSettle`·`glbPending` `glbRetry` `glbSatOn(T)`(이 작업의 가벼운 지도가 위성 사진을 까는가 — 고른 값 + Mapbox 출처, 노말 VF 아님, 격자 기본값용) `glbSatBuiltinUrl()`(데스크톱 기본 출처 — 비공개 토큰 + 기본 스타일, 없으면 '') `glbSatNow()`(지금 그릴 위성 출처 또는 null) `glbSatSrc(주소)` | `gl-basemap.js` |
| `saveProject`(저장했으면 true · 파일 쓰기 대신 내려받기로 넘겼으면 `'download'` · 취소면 false) `loadProjectData` `openProject` `workDirty` `workMarkSaved` `workMarkClean` `closeAsk` | `project-io.js` |
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

- **웹판 막기**(2026-10-09 — 웹판은 접고 데스크톱 설치판 하나로 간다. index.html head의 **첫 스크립트**): 데스크톱 앱(`window.wcgDesktop`·`app://`)과
  로컬 개발(`file://`·`localhost`·`127.x`·`[::1]`·`*.localhost`)이 아니면(GitHub Pages·LAN 주소 등) '날씨 CG 메이커는 설치판으로 재배포 예정입니다' 카드를
  `document.write`로 쓰고 바로 뒤에 `<plaintext>`를 열어 문서의 나머지(css·데이터·js·부팅·자동 저장·서비스워커 등록)를 숨긴 글자로만 읽게 한다.
  파싱이 끝나면 미리 받던 파일도 멈춘다(`window.stop`). **head에서 바로 `window.stop()`을 부르면 안 된다** — body가 없어 크로미움이 화면을 끝내 그리지 않는다(실제로 확인).
  저장된 작업(localStorage)은 지우지 않는다(쓰기만 막음). 닫기 없음. 기록은 `window.__wcgWebBlocked`. 판정 `wcgGateOf`·막힌 화면은 `tests/web-gate.test.cjs`.
  다시 웹으로 열려면 이 스크립트를 지운다(push·배포는 사람이 설치판 배포 때).

## 7-1. 지도 종류 = 데이터별 카드 (2026-10-10)

- **`S.style`은 지금처럼 지도 도형 키**(sgg·sido·warn·warnsea·seoul·typhoon·typhoonCompare + 새 life·dust·dustFcst). **카드는 `MAP_CARDS`**(js/map-build.js)가 도형 키를 묶는다 —
  카드 하나 = 키 하나, 예상 강수·적설만 키 둘(시군 sgg·시도 sido — 장면 설정 카드 아래 '칠하는 구분' 줄의 칩, 아트보드 배지, 사이드바 구분 줄 세그먼트로 전환). `cardOf(S.style)`로 늘 카드를 안다(새 상태 필드 없음).
  옛 작업·프로젝트·배치 키의 `S.style`은 그대로 유효(옮기기 0줄). 새 지도 3개는 인셋을 써서 배치 그룹 = `common`.
- **들어오는 구분 그대로 칠한다**: 데이터 섹션(wrn·fct·life·dust·dustFcst)은 자기 지도에서만 보인다(`secModeHidden`) — 다른 구분 지도로 옮겨 칠하지 않는다.
  카드를 고르면 그 섹션이 사이드바 맨 위에 펼쳐진다(`autoSecFor` = 카드의 `sec`). 데이터 섹션은 `SEC_ORDER` 맨 앞 — 그 전에 저장된 사이드바 배치(`wcg_layout`에 `secV` 없음)는 데이터 섹션만 새 자리로(`loadLayout`).
- 생활기상(life)·미세먼지 농도(dust)는 **같은 시군구 도형**(기초자치단체 230 — 일반구는 시로)을 쓰되 키가 달라 칠·브러쉬가 따로 저장된다. 미세먼지 예보(dustFcst) = 예보 권역 19.
- 도형 데이터 `region-map-data.js`(`window.REGION_MAP`)는 **생성기로 굽는다**: `node tools/build-data-maps.cjs --src=<원본 data 폴더(저장소 밖 WeatherCG/data — main-simplified.json·islands-detail.json)>`
  (`--split-gu` = 일반구 따로 256곳). 행정동을 공유 변 지우기로 합치고, 투영은 `map-data.js`의 proj 그대로(시도군 지도와 1:1). 같은 입력이면 같은 바이트. 권역 명단은 `js/bulletin.js` KMA_TERMS와 같다(테스트가 비교).
  파일을 못 읽으면(onerror → null) 세 카드가 안 보이고 저장값은 `normStyle`이 시도군으로.
- 지금 칠하는 구분 표시: 아트보드 오른쪽 위 배지(`#fctMapBtn` — 옛 전국/서울 버튼 자리, 태풍 지도에선 숨김) + 사이드바 데이터 섹션 첫 줄(`[data-map-unit]`). 둘 다 `syncMapUnit`.
- **데이터 불러오기**(10-10 2단계 — `js/data-maps.js` 공통·`js/data-load.js` 불러오기): 생활기상 = 기상청 생활기상지수 4.0(`LivingWthrIdxServiceV5` — 자외선 `getUVIdxV5`·대기정체 `getAirDiffusionIdxV5`, 시군구 areaNo 230건),
  미세먼지 농도 = 에어코리아 대기오염통계 현황(`ArpltnStatsSvc/getCtprvnMesureSidoLIst` — 시도 17건, cityName = 시군구 그대로), 미세먼지 예보 = 에어코리아 대기오염정보(`ArpltnInforInqireSvc/getMinuDustFrcstDspth` — informGrade 권역 등급).
  주소·이름은 `DATA_API` 한 곳(✓ 실키 확인·? 확인 필요 주석). 요청은 헬퍼 `/api/kma`(헬퍼 수정 없음). 인증키는 API 설정의 개인 키(localStorage `wcg_datakey`) 우선, 빈칸이면 데스크톱 기본 키(아래 10장). 공개 코드에는 실제 키가 없다.
  자료·고른 옵션은 `S.dataByStyle[지도]`(작업·자동 저장·프로젝트·되돌리기에 S 통째로 따라감), 바꾼 단계 색 `S.dataColors`. 시각·품목·발표·예보일은 다시 받지 않고 다시 칠한다.
  불러오는 중 지도를 옮겼다 돌아오거나 작업을 편집·되돌리기·불러오기·초기화했으면 늦은 응답은 칠하지 않는다(`dataSeq` + `_workRev`). 키 변경·색 지우기도 진행 중 요청을 무효화한다.
  자료 라벨(`b.data = 지도`)은 지도를 바꾸면 `S.dataByStyle[지도].labelsAway`에 맡겨 두고 돌아오면 되돌린다(`dataLabelsSwap` + `setStyle`의 `renderLabels` — DOM도 즉시 갱신).
  라벨 표시만 바꿀 때는 수동으로 보정한 지도 색을 다시 칠하지 않는다. 주요 도시 라벨은 18곳, 예보 권역 라벨은 19곳이다.
  생활기상은 응답의 areaNo·date·code를 확인한다. 새 구역 코드에 값이 없으면 대응하는 옛 구역을 모두 조회하고 시각별 유효 값의 평균을 쓴다(결과 카드에 표시). 없는 값은 0으로 칠하지 않으며 재조회 가능하도록 실패는 캐시하지 않는다.
  에어코리아는 `dataGetPages`로 끝 페이지까지 받는다(반복 페이지·중간 실패는 완성 자료로 취급하지 않음, 총건수 0이면 numOfRows보다 적은 쪽이 끝).
  **느림·멈춤·누락 고치기(2026-10-10 — 실측 진단 근거)**: 포털 게이트웨이는 새 연결 첫 요청의 약 1/3을 30~57초 붙잡았다가 504/503(`SERVICETIMEOUT_ERROR` 05)을 준다.
  다시 쓴 연결(keep-alive)은 63건 중 한 번도 멈추지 않았다. 그래서 데스크톱은 메인 프로세스가 받는다(`desktop/data-fetch.js` — 10장): 연결 재사용, 새 연결이 1.5초 안에 답이 없으면 다른 연결로
  하나 더(최대 2번), 첫 응답 시간 제한은 웹앱이 시도마다 정한다(`DATA_TRY` 5·9·15·25초, 게이트웨이 오류·시간 초과·끊김만 다시). 헬퍼 길도 같은 시간 제한·다시 보내기를 쓴다(10-12부터 내장 헬퍼 `/api/kma`도 같은 받기 — 연결 재사용·늦으면 하나 더, 10장 '기상청 받기'. 파이썬 헬퍼는 요청마다 새 연결 그대로).
  받은 응답은 무효가 된 불러오기여도 캐시한다(농도 = 다음 정시 자료(기준 + 1시간 15분)까지, 예보 = 다음 발표(05·11·17·23시)까지·그 시각이 지났는데 아직이면 3분, 생활기상 = 6시간).
  불러오는 동안 결과 카드에 진행(시도·시군구 N/전체·늦은 응답 다시 요청 수)과 '지금 지도는 이전 자료(기준 시각)'를 보여 준다(지도는 새 자료가 와야 바뀐다).
  농도 DAILY는 '하루 평균'이 아니라 최근 24시간 시간별 값이다 — 시도마다 한 번에 받아 1시간 값과 24시간 평균(24칸 중 18칸 이상)을 둘 다 만든다. 1시간 값이 비었거나 그 시각 줄이 없으면
  **같은 시군구**의 3시간 안 직전 값, 그것도 없으면 같은 시군구 24시간 평균으로 채우고 결과 카드에 '빈 값을 같은 시군구 값으로 채운 곳 N곳(무엇으로)'을 적는다. 이웃·시도 평균으로는 채우지 않는다
  (옮겨 칠하기 금지 — 사용자 결정 전). 끝내 빈 곳은 비우고 까닭(응답에 없음·최근 3시간 자료 없음·측정값 빈칸·24시간 중 N시간만 측정)을 적는다. 한 시도가 끝내 실패해도 나머지는 칠하고 '못 받은 곳만 다시'로 그 시도만(같은 기준 시각).
  예보 기본 발표 선택은 '예보일별 최신 발표'다. 새 발표가 일부 날짜만 담아도 다른 날짜를 잃지 않으며 각 예보일의 실제 발표 시각을 표시한다. 개별 발표 선택도 가능하다.
  예보는 조회일 하나에 한 번만 받는다(InformCode는 무시되고 세 종류가 한 응답 — 종류를 바꾸면 캐시로 다시 칠함). 05시 발표 전 '오늘' 조회는 0건이라 어제 조회(23시 발표 = 오늘·내일·모레)를 함께 쓰고 카드에 적는다.
  '지난 날짜'는 그날 **발표한** 예보다(화면 '2. 언제 발표한 것') — 17·23시 발표면 기본 예보일이 다음 날.
  범례: 데이터 지도에서도 범례 섹션이 보이고(이름 '자료 범례'), 자동 항목 = 칠한 단계(`autoLegendItems` — 타임라인·AE 칠 레이어 이름도 '나쁨'·'높음').
  시험: `tests/data-maps.test.cjs`(판정·키 가림·파서·맞추기·단계·동시 요청·페이지·발표별 자료), `tests/data-airkorea.test.cjs`(게이트웨이 시간 초과·99·다시 보내기·헬퍼 길 대체·여러 쪽·24시간 자료 보충·카드 문구·캐시 유효·예보 날짜당 한 번), `desktop/test/data-fetch.test.cjs`(메인 받기 — 로컬 서버로 멈춤·하나 더·재사용·시간 제한·크기·허용 주소), `tests/bulletin-snow.test.cjs`(단위별 색·제목).
  `tests/fixtures/datamaps/`는 응답 형식에 맞춘 합성 자료이며 실시간 관측 원문이 아니다. `WCG_BOOT_CHECK=1`이면 `tests/data-load.boot.test.cjs` → `data-load.boot-eval.js`가 가짜 fetch로 실제 앱의 세 자료 흐름·오류·키 없음·지도 전환·되돌리기·저장 왕복·PNG/AE 스펙·적설, 농도 DAILY 1000 요청·보충 표시·1시간↔24시간 평균(다시 안 받음)·한 시도 계속 실패 → 나머지 칠함·그 시도만 다시, 예보 오늘 0건 → 어제 함께·오늘 05시 발표 뒤엔 오늘 조회 하나만·InformCode 안 보냄·종류 바꿔도 다시 안 받음을 점검한다(점검 모드는 메인 길이 'off'라 헬퍼 길 = 가짜 fetch). 실제 API 가용성/측정값과 Adobe AE 실행 확인을 대신하지 않는다.
  단계 기준 확인: [기상청 생활기상지수](https://data.kma.go.kr/data/lwi/lwiRltmList.do), 예보 권역 경계 확인: [에어코리아 예보 권역 안내](https://airkorea.or.kr/web/board/5/1171/?pMENU_NO=144). 서비스 발행 지연·일부 개편 지역 코드는 `DATA_API`의 확인 필요 주석을 유지한다(DATA·InformCode·발표 시각은 10-10 실측으로 ✓).
- **예상 적설**(카드 3 보강 — `js/bulletin.js`): 통보문 줄의 단위(cm·mm)를 읽어 적설(cm)은 눈 색 단계(`SNOW_SCALE` — 하양~하늘~보라), 강수(mm)는 비 색 단계에서 따로(`bulColorPlan`).
  눈이면 강원 산지 표현(강원북부산지 등)도 기준표 시군에 칠하고(같은 시군은 값이 큰 쪽, 산▲은 그대로), 제목·단위 글자가 '예상 적설량'·'단위 : cm'(그 모양 글자만 — `bulTitleTexts`). 다음 불러오기 땐 `S.bulKind`로 처음 고를 묶음(적설)을 정한다.

## 8. 테스트 · 도구

- **통보문 묶음 선택**(2026-10-10): `#bulPick`은 이제 select가 아니라 펼친 카드 목록이다. 원문 순서와 같은 날 비+소나기 합치기 항목을 유지하고, `bulPickFill`은 선택 표시만 바꾸며 `bulPaintPick`이 선택한 원문으로 칠한다. 수동 입력 칸을 수정해도 자동 칠하기에는 섞이지 않는다. 한 묶음도 목록·칠하기 버튼을 보인다. 숫자 라벨·부드러운 경계 옵션은 자동/수동 공용으로 접힘 밖에 둔다. 실패는 목록을 보존, 자료 없음/작업 초기화는 목록과 선택을 비운다. `tests/bulletin-pick.boot.test.cjs`는 `WCG_BOOT_CHECK=1`에서 실제 앱 흐름을 검사한다. 아래 드롭다운 검사의 옛 통보문 날짜 자리는 이제 사이드바 시험 select로 검증한다.

- 특보 지난 날짜(`warnings-load.js`): 수동 시간 칸 없이 날짜의 실제 발표 목록(`wrn_met_data`, 통보완료만·중복 제거)을 먼저 보여준다. 시각을 선택하면 `wrn_now_data(fe=e)`로 그때의 발효 현황을 새로 받아 색칠한다(전날부터 유지된 특보 포함). 목록만 조회하거나 실패한 경우 지도는 그대로다. 새 발표가 없는 날도 별도 표시한 일말 현황을 고를 수 있다. 날짜·요청을 빠르게 바꾸면 이전 응답은 버린다.
- AE 태풍 라인 모드(헬퍼 20261009): 전체 표시 구간의 지점을 전달하고 `lineForecast:1`일 때 현재까지 실선·예상 구간 점선을 나눠 같은 진행 곡선으로 그린다. 선두도 예상 끝까지 간다. 예상선은 배경에 중복으로 굽지 않는다. 새 필드 없는 옛 스펙의 JSX는 그대로이며, 옛 헬퍼는 새 필드만 무시해 전체 경로를 실선으로 표시한다.

특보 겹침 표시(2026-10-09): `warnings-apply.js`의 `wrnOverlapPlan`·`wrnStripeFill`이 겹친 활성 특보를 교차 색 띠로 그린다.
`S.wrnOverlap`은 기본 켜짐, 개인 배치·프로젝트에도 저장한다. 지도/인셋·해상·이미지·영상·AE 분리 레이어가 같은 무늬를 쓴다.
옛 영상 진입 효과 '블라인드'는 선택 메뉴에서 제거했고, 옛 저장본의 `anim.reveal=blinds`는 번짐으로 읽는다.
헬퍼의 옛 스펙 처리·클립 정리 도우미는 이전 프로젝트 호환용으로 유지한다(새 출력에는 영상 블라인드를 보내지 않는다).

| 명령 | 하는 일 |
|---|---|
| `node --test tests/*.test.cjs desktop/test/*.test.cjs` | 전체 테스트(Electron 없이). 구조 검사 `tests/split-structure.test.cjs` 포함 |
| `WCG_BOOT_CHECK=1 node --test tests/brush-incremental.test.cjs tests/cg-setup.test.cjs tests/ae-cluster-e.test.cjs` | 실제 앱을 숨김 Electron으로 띄워 눌러 보는 점검(느림). 타임라인은 `tests/timeline-ae.boot.test.cjs`·`tests/ae-timeline-spec.test.cjs`도. 특보 종류별 색 팝업은 `tests/wrn-color-popup.test.cjs` |
| `WCG_BOOT_CHECK=1 node --test tests/tilt-gl.boot.test.cjs` | **틸트 미리보기 WebGL** 실제 앱 점검: GL(밉맵)로 그리는지, 타임라인을 열면 틸트 그림을 미리 굽는지, 진입 프레임부터 기울인 지도(빈 지도 없음), 회전만 바뀌는 재생은 다시 안 굽는지, 컨텍스트를 잃으면 CSS·되찾으면 GL, 영상 프레임도 GL. 가짜 DOM·가짜 WebGL 단위 검사(폴백·게이트·다시 굽기 조건·투영식·메시 이음매·GPU 리셋 — 2D 그림 버퍼를 잃으면 평면 지도·되찾으면 다시 굽기, 늦은 타일·작업 바꿈, 타임라인 닫으면 텍스처 반납)는 `tests/tilt-gl.test.cjs`. 진짜 GPU 리셋은 CDP `Browser.crashGpuProcess`로만 재현된다(점검 스크립트에서) |
| `WCG_BOOT_CHECK=1 node --test tests/gl-basemap.test.cjs` | **가벼운 지도(WebGL · 시험)**(10-10 — js/gl-basemap.js): 늘 도는 것 = 메뉴 5개(옛 4개 줄 그대로)·엔진 파일(5.24.0·BSD-3·sha256 = README·부팅 태그 없음)·자체 스타일(글자·래스터 없음)·투영(무작위 3000점 — MapLibre 웹 메르카토르 식 = 앱 typhoonXY, 1e-6 px 미만)·추출 복제본 넣기/되돌리기(가짜 DOM)·다른 4모드 길 그대로(정적). 켜면 실제 앱(실제 OpenFreeMap 타일 — 인터넷 없으면 GL 부분만 건너뜀): 오프라인 → 파란 지도·까닭·다시 시도, 준비 시간, 정렬(화면·끌기 같은 프레임·휠·재생 프레임·아트보드 크기 바뀜), **실제 GPU 픽셀 정렬**(시험 선 — 화면·추출 1px 안쪽, 10-10 측정 0.23·0.21px), 추출(평면·틸트 미리보기·틸트 프레임·AE 블리드 영역·그림 실패 → 그 그림만 파란 지도), 저장·불러오기·옛 작업, 노말 VF, 다른 4모드 GL 흔적 없음. **위성 사진**(10-10): 늘 = 주소 해석(스타일·WMTS·공유 .html·타일 틀·mapbox://·v4·TileJSON·토큰 없음)·위성 스타일(그림 타일만·페이드 0·출처)·켜기(고른 값·주소·못 받은 주소)·준비 판정·저장 키·옛 작업·격자 기본값(4모드는 옛 함수와 같은 결과)·메뉴. 켜면 실제 앱(`gl-satellite.boot-eval.js` — 가짜 주소 pk.TEST + 우리 받기에서 합성 그림 타일, 토큰 없이): 위성 타일만 받아 준비, GPU 픽셀 정렬(합성 그림의 선 — 10-10 측정 화면 0.06·추출 0.20px), 추출·틸트, 벡터만·되돌리기, 카메라 키 2개 렌더 전 미리 받기 뒤 프레임 렌더 중 미리 받은 것 밖 요청 0, 전부 실패(401) → 벡터만 + 까닭, 렌더 중 불러오다 전부 실패 → 1초 안팎에 벡터(예전 13초), 위성·벡터 모두 실패 → 경고 하나(`net`), 일부 실패 → 받은 데까지, 오프라인 + 받아 둔 타일 → 위성, 주소 없음 → 기본 토큰(가짜 `WCG_TEST_MAPBOX_TOKEN`)으로 기본 스타일, 가벼운 지도 칸에서 주소 [적용](배경 그대로), 저장, 다른 4모드. 벡터 실행(`gl-basemap.boot-eval.js`)은 출처 없음 안내·주소 칸·흐린 위성 칸, 오프라인 + 받아 둔 것 없음 → 한 번 해 본 뒤 파란 지도. 배율 규칙(MapLibre 소스 그대로)·wcgtile 변환·미리 받기 주소는 `tests/tile-prefetch.test.cjs` |
| `WCG_BOOT_CHECK=1 node --test tests/date-picker.test.cjs` | **날짜 고르기**(js/date-picker.js): 날짜 계산(달 칸 6줄·윤년·말일·요일·오늘 이후 막기·연월 휠 목록·10분 시각)은 늘 돌고, 켜면 실제 앱에서 특보 지난 날짜 → 달력 → 휠 2019년 3월 → 15일(`#wrnDate.value`·기존 onchange → `wrnWhen`), 키·Esc·바깥 닫기, 시각 칸, 태풍 과거 날짜를 눌러 본다 |
| `WCG_BOOT_CHECK=1 node --test tests/dropdown.test.cjs` | **드롭다운**(js/dropdown.js): 순수 도우미(항목 줄·optgroup·막힌 줄 건너뛰기·글자로 찾기·자리)와 값 계약(가짜 select — value·selectedIndex 접근자)·붙이는 자리·css 토큰은 늘 돌고, 켜면 실제 앱에서 모든 select가 숨고 칸이 붙었는지, 통보문 날짜(#bulPick)·타임라인 fps(#tlFps)·비교 카드 글꼴(다시 그린 카드)·토스 모달 안 select를 열기·키·고르기(input·change 1번씩·기존 리스너)·Esc·바깥 닫기, 코드가 값·옵션·disabled·숨김을 바꾸면 칸이 따라가는지 |
| `WCG_BOOT_CHECK=1 node --test tests/map-cards.test.cjs` | **지도 종류 = 데이터별 카드**(10-10): 카드 9장 순서·이름·이모지 없음, 모든 지도 키가 카드 하나에, 칠하는 구분 이름·구역 수, 카드를 고를 때의 구분(작업 중 시도 유지·시작 화면은 시군), 데이터 섹션 = 자기 지도에서만, 배치 그룹, 옛 저장값 7종·데이터 지도 파일 없을 때. 켜면 실제 앱: 3열·구분 줄·시도 칩·서울 카드·데이터 섹션 맨 위·배지 팝오버·사이드바 세그먼트·칠 따로·이미지 추출·AE 스펙·옛 작업·옛 사이드바 배치 |
| `WCG_BOOT_CHECK=1 node --test tests/data-maps.test.cjs` | **데이터 불러오기**(10-10 2단계): 응답 판정표(픽스처 — 정상·자료 없음·키 등록 안 됨·활용신청 안 함·한도·오퍼레이션 다름·Unauthorized·점검 HTML), 키 가리기·Encoding 키 풀기, 발표 시각 후보 경계, 자외선(h0)·대기정체(h3부터) 읽기·시각 고르기, 동시 요청(4개·초당 한도 재시도·치명 오류 멈춤), 단계 경계값, 시군구 맞추기(옛 이름 평균·districtCode·'-' 빼기·모르는 이름), 예보 발표·예보일·권역 별칭·통합 이름, 범례 순서, 적설 색·제목·처음 고를 묶음. 켜면 실제 앱(가짜 fetch): 세 자료 칠·범례·결과 카드·라벨·오류마다 칠 그대로·키 없음·지도 바뀜·되돌리기·저장 왕복·이미지/AE 스펙·적설 원문 |
| `node --test tests/data-airkorea.test.cjs desktop/test/data-fetch.test.cjs` | **에어코리아·생활기상 느림·누락 고치기**(10-10): 게이트웨이 시간 초과(504 SERVICETIMEOUT 05 — JSON 감쌈)·헬퍼 시간 초과 문구·생활기상 99 판정, 시도마다 시간 제한을 늘려 다시 보내기(키·신청·한도·자료 없음은 한 번), 메인 길 못 쓰면 헬퍼 길(점검 모드·프록시·옛 메인), 헬퍼 길 시간 초과 끊기, 여러 쪽(총건수 0), 농도 24시간 자료(1시간·직전 값/24시간 평균 보충·빈 곳 까닭·24:00·옛 이름), 카드 문구, 캐시 유효 시각, 예보 날짜당 한 번·조회일 기준 오늘/내일. 메인 받기(`desktop/data-fetch.js`)는 로컬 http 서버로 멈춤·하나 더(2번)·재사용·시간 제한·본문 멈춤·크기·끊긴 재사용 소켓·허용 주소·배선 |
| `node --test tests/data-maps-geometry.test.cjs` | **데이터 지도 도형**(`region-map-data.js`): 시군구 230·코드·인셋·시도군 지도와 같은 자리, 예보 권역 19·명단 = 통보문 용어. `WCG_DATA_DIR=<원본 data 폴더>`면 생성기를 다시 돌려 바이트 비교 |
| `node --test tests/ae-timeline-spec.test.cjs` | **타임라인 = AE 1:1**: 실제 `sendToAE`(vm)가 보내는 `/api/ae` 스펙과 헬퍼 JSX(`desktop/wns/ae-jsx.js`)를 AE 흉내로 실행한 키·이징·부모·효과를 무작위 작업 수백 개의 타임라인 값(트랙·태풍 키·카메라 키·길이)과 비교 — 헬퍼 20261008(새)·20261007(옛) 두 번. AE 보내기를 고치면 꼭 돌린다 |
| `node --test tests/ae-geo.test.cjs` | **AE로 보내기 'GEOlayers 지도로'**(10-10): 투영 왕복(앱 화면 출력 px = GEOlayers 보기의 컴프 px — GEOlayers 식은 설치판 표현식 파일에서 시험에 따로 옮김, 무작위 3000점·회전·터치)·zoom 정의(512 타일, glbView와 같음)·반경 원/사다리꼴 = 앱 typhoonBandInto·보기 키/프레임 = camAt, 실제 sendToAE(vm)의 GEOlayers 길 스펙(리깅 카메라 항등·겹 PNG·남한 강조·GeoJSON·토큰 없음, 비교 지도, 노말 VF·일반 지도 막음), **끝까지**: 그 스펙 → `desktop/wns/geo-jsx.js` → AE 흉내(`ae-model.cjs` opt.geo) + 가짜 GEOlayers(앵커 = 세계 px) — 프레임마다 태풍 지점 = 앱 화면 자리(최대 0.1px, 터치 0.5px), 카메라 회전(이동+45°·회전만 30°·터치 12°·비교 지도)이 있으면 라벨 박스·지시선 = 앱 camProjectXY(0.1px 안), AE에서 보기를 고쳐도 따라감, 앵커를 못 찾아도(컨트롤 식) 같음, 남한 강조 겹 순서, 패널 없음(지원하지 않는 AE 판 까닭 포함)·맵 컴프 없음·여럿 알림, 복제 실패(undefined·예외·맵 컴프를 같이 쓰는 복제 — 원본 그대로·새로 생긴 것만 지움), 패널이 답하지 않으면 예약 알림, Zoom 자름·맵 컴프 길이 안내, 기존 jsx 글자 그대로·ASCII·ES3, 팝업 카드·까닭·aeSendClick 갈래·배선 |
| `node --test tests/output-reveal.test.cjs desktop/test/reveal.test.cjs` | **렌더 결과 '폴더 열기'**(10-12 — 10장): 웹앱(vm) = 저장 폴더·저장창·내려받기마다 묻는 단서, 쓰기 끝에 버튼(렌더 끝 안내와 함께), 다음 렌더가 저장할 곳을 정하면 숨김·늦은 답 버림, 모름(빈 답·오류·3초)·웹판·옛 preload = 버튼 없음, 누르기(열림·없어짐 → 거둠), 이미지 바닥 요약 버튼 조건·배선, 마크업(이모지 없음·`[hidden]`). 메인(`desktop/reveal.js`) = 이름 검사, 저장창 파일·고른 폴더(+ 하위 폴더)로 찾기(대소문자·한글 조합·최근 폴더·드라이브 루트), 열어도 되는 경로(옆 폴더·위·없는 파일·시스템 파일 막기), 내려받기 기다리기(취소·시간 초과·옛 기록), 기록 상한, main/preload 배선(글자). `WCG_BOOT_CHECK=1`이면 `desktop/test/reveal-flow-check.cjs`: 진짜 끌어다 놓기(CDP)로 얻은 폴더·파일 핸들로 MP4·MXF(저장 폴더)·PNG 시퀀스(저장창)·이미지(폴더 창)를 저장 → 버튼 → 누르면 메인 '[reveal-test]' 경로 = 그 파일, 막기 |
| `node --test tests/ae-ease-match.test.cjs` | **AE 키·표현식 = 화면 함수**: 헬퍼 JSX를 AE 흉내(`desktop/test/ae-model.cjs` — AE 시간 베지어·부모 보정·표현식 vm 실행)로 프레임마다 계산해 앱 실제 함수(easeOut·easeVf·camAt·typhoonScreenPts·typhoonBandInto·typhoonLabelProg·compareScreenPts·typhoonLeaderGeom·블라인드 덮임 식)와 비교. 끝에 항목별 최대 오차 표 |
| `node --test desktop/test/golden-legacy.test.cjs` | 옛 앱 스펙 골든 137개가 헬퍼 확장 뒤에도 바이트까지 같다(sha256 — F1 카메라 6개만 의도한 변경) |
| `node tools/ae-verify/make.cjs` → AE에서 실행 → `node tools/ae-verify/compare.cjs` | **AE 실기 대조**(사람이 1회): 골든 스펙 JSX + 값 덤프 꼬리를 AE(새 빈 프로젝트)에서 돌려 `valueAtTime` 덤프를 AE 흉내 값과 비교 — AE 흉내의 가정(영향 합 >100%·공간 속성 이즈·슬라이더 표현식·toComp·부모 보정·한글 이름)을 실제 AE로 확인 |
| `node --test desktop/test/server-kma.test.cjs desktop/test/data-fetch.test.cjs tests/typhoon-fetch-speed.test.cjs tests/warning-day.test.cjs` | **기상청 받기 빠른 길**(10-12 — 10장. 검증 뒤 더함: 프록시 PC면 `/ping`·`/api/kma` 표시 없음·옛 길 응답도 표시 없음, 연결 모음이 꽉 차면 하나 더 안 보냄(줄 선 요청은 한도 직전에 연결을 받아도 안 보냄), 5xx 다시 보내기도 하나 더 몫 안(503 → 다시 → 하나 더 = 3번), 조금씩 오는 본문·여러 번 넘겨주기도 전체 한도, 옛 길로 넘길 때 남은 시간만, `&hedge=` 첫 하나 더 시각, 태풍 = `/ping`으로 미리·급한 조회는 `&hedge=`·표시 없어지면 예전처럼. 헬퍼 부르기는 http.request — 전역 fetch는 fetch 금지 포트에 걸리면 'bad port'): 로컬 가짜 기상청(http + 이름 풀기 apihub.kma.go.kr → 127.0.0.1)으로 연결 재사용·새 연결 멈춤 → 하나 더(2·3번째)·다시 쓴 연결도 하나 더·5xx 한 번 더(그래도면 urllib 문구)·4xx 그대로·느린 본문은 끝까지·끊긴 본문 다시·전체 한도(처음부터)·앱이 떠나면 끊기·넘겨주기(따라감/옛 길)·프록시 PC 옛 길·`kmaFastUrl`·`kmaFailText`, 웹앱 = 헬퍼 머리 있으면 태풍 조회 줄 한 번 더 끔·특보 카드 늦음 문구(응답 오면 멈춤). 옛 길·파이썬 차등은 `server.test.cjs` |
| `node --test tests/render-cancel.test.cjs desktop/test/server-cancel.test.cjs` | **렌더 취소**(10-12): 취소 신호(렌더 중에만·한 번만·버튼 '취소하는 중…'·AbortSignal), Esc(위에 뜬 창·글자 칸이면 그쪽 — 판정 목록 정적 검사), 가짜 환경에서 실제 루프 — MP4(누른 프레임부터 안 그림·인코더 닫음·파일 안 씀·버림), PNG(zip 안 묶음), MXF 메인·워커 풀(빈 워커 기다림 중에도 곧바로·워커 종료·finalize 없음·`/api/cancel?sid=`·인코딩 기다림 끊기·옛 헬퍼 실패 무시), 미리 받기(새 타일 안 받고 느린 타일 안 기다림), `prepareOutput().discard()`(빈 파일만), 닫기 전 묻기. 헬퍼 = 폴더 지우기·늦은 프레임/인코딩 409·받는 중 취소·인코딩 중 ffmpeg 멈춤·결과 파일 지움·sid 검사(점·장치 이름·`ae…` 400)·`runCapture` 신호. `WCG_BOOT_CHECK=1`이면 실제 앱(`render-cancel.boot-eval.js`): 짧은 MP4를 몇 프레임 뒤 [렌더 취소]·Esc(토스 모달이 위면 모달만 닫힘), MXF(가짜 헬퍼·워커), 취소 뒤 다시 렌더하면 끝까지 |
| `WCG_BOOT_CHECK=1 node --test tests/close-ask.test.cjs desktop/test/close-guard.test.cjs` | **닫기 전 묻기**(10장) 실제 앱 점검 — 웹앱 흐름(묻기 흉내: 시작 화면·장면 설정만 = 안 물음, 칠함 = 팝업 하나·취소·Esc·바깥·저장 안 함·저장 취소/성공·내려받기로 넘김 = 유지·되돌리기·이미지 추출·영상 렌더(가리개 위)·AE 보내는 중, 아래 확인창이 있어도 키는 물음이 먼저)과 진짜 창 닫기(메인 검사기 `--inspect`로 `win.close()` — `desktop/test/close-flow-check.cjs`: 변경 없음·칠함·멈춤·새로고침 뒤(최소화 흉내 창 되살림)·렌더러 죽음) |
| `WCG_BOOT_CHECK=1 node --test tests/export-render.test.cjs` | **이미지로 추출 픽셀 점검**(약 10분) — 지도 7묶음 × 항목 14개가 '딱 그것만'인지(화이트리스트 기준과 비교·섞인 색), 편집용 레이어 다시 쌓기 = 전체 화면, 색칠만 이음새, 미리보기 상태·3D 기울기·태풍·터치 가장자리, 저장 흐름(가짜 폴더·ZIP·같은 이름 폴더·권한 거절)·팝업. 그림이 필요하면 `window.__XR_DUMP = true`(본문 머리 주석) |
| `node desktop/test/boot-check.cjs . --wait=9000 [--eval=…] [--shot=…] [--size=WxH] [--keepalive]` | 실제 부팅·콘솔 오류 점검(`"ok": true`여야). `--eval`은 async 함수로 감싸 실행된다(`--keepalive` = 긴 eval 동안 숨김 창 프레임 깨우기). 끝나면 임시 사용자 폴더(`%TEMP%\wcg-test-<pid>`)를 지운다 |
| `node tools/stamp-version.cjs [--check]` | `?v=` 갱신 / 검사 |
| `node tools/load-order.cjs [--verbose]` | 로드 순서 정적 검사(뒤 파일 동기 참조·로드 중 typeof 0이어야, 부팅 전 예약·동기 이벤트, 로드 때 리스너 순서). 테스트도 돌린다. 한계는 2장 규칙 3 |
| `node tools/app-source.cjs index.html --out=<파일>` | 나뉜 앱을 '분할 전 한 파일' 텍스트로 합침(PowerShell `>` 대신 `--out`) |
| `node tools/verify-split.cjs <전> <후>` | 분할 커밋이 텍스트 무변경인지 git 객체로 증명 |
| `node tools/split-app.cjs` | 분할 도구(한 파일 → 지금 구조, 기준표 MAP). `--like=index.html`로 지금 분할본과 같은 구조로 재분할(11·12장) |
| `node tools/build-installer.cjs [--ref=HEAD] [--dist=…] [--ffmpeg=…] [--private=…] [--stage-only] [--installtest]` | **설치 파일 굽기**(10장 '설치판 만들기') → `desktop\dist\WeatherCG-Setup-<판>.exe`. 요청받을 때만. `--installtest` = 이름만 다른 설치 시험판(설치판이 깔린 PC에서 설치·제거 시험) |
| `node tools/check-installed.cjs <설치 폴더 또는 out\win-unpacked> [--shot=<png>] [--json=<파일>]` | **설치판 점검**(담긴 것·asar 밖 ffmpeg·키 있음·내장 헬퍼·점검 모드로 실제 부팅) — `"ok": true`여야 |

- **테스트에서 앱 코드를 읽을 때는 `tools/app-source.cjs`를 쓴다**: `const appSource = require('../tools/app-source.cjs'); const html = appSource(path.join(__dirname, '..', 'index.html'));`
  결과는 분할 전 `index.html`과 같은 텍스트(줄바꿈 LF)라 예전처럼 함수를 잘라 쓸 수 있다. `index.html`을 `readFileSync`로 직접 읽으면 구조 테스트가 실패한다.
- 이 `app-source.cjs`는 근무표(work schedule)의 `swap-backend/app-source.cjs`와 **동작이 다르다**(이쪽은 머리 제거·IIFE 재구성·url 역변환까지 하는 정확한 역변환). 서로 복사하지 않는다.
- 데스크톱 개발판은 hot reload가 없다 — 고친 뒤 창에서 Ctrl+R.
- 일반·비교 태풍의 `태풍 불러오기 · 선택`은 `typLoadOv` 창(`typhoon-panel.js`): 처음은 출처 선택만, 불러오기를 누르면 오른쪽 목록이 나타나는 큰 2분할 창이다. 현재/과거/해외 출처는 색으로 구분하고 기관 버튼에는 SVG 국기가 붙는다. 과거는 `typHistoryMonth` 연·월 휠로 선택하고 공식 목록의 발생 시각(한국 시각)으로 그 달에 발생한 태풍만 거른다. 이름·발표 시각 수정은 팝업 밖 사이드바 `typDetailSettings` 접이식에 유지한다. 창을 닫거나 출처를 바꾸면 진행 중 선택은 취소한다.
- 날짜 UI는 `date-picker.js`가 date/month/time/datetime-local 모두 처리하며, boot의 관찰자가 나중에 추가된 칸도 연결한다. datetime-local은 원래 값·change 계약을 유지한 채 날짜/시각 칸으로 표시하고 min/max를 지킨다. 일반 달력은 연월 휠의 `확인 · 일자 선택`으로 일자 달력에 돌아간다. month는 처음부터 연·월 휠만 표시하고 확인하면 YYYY-MM 값을 저장하며 일자 달력은 열지 않는다. 모든 select는 `js/dropdown.js`의 공용 드롭다운(버튼형 칸 + 토스 카드 목록)으로 보인다 — 원래 select는 숨긴 채 값·옵션·change의 원천(10-09, 옛 `appearance: base-select` 방식은 걷어냄). boot의 같은 관찰자가 나중에 생긴 select도 붙인다.
- 태풍 불러오기: JMA·기상청(현재/과거)은 `typhoon-api.js`의 `chooseTyphoonFromList`로 JTWC와 같은 선택 카드를 띄우고 고른 뒤에만 작업에 적용한다. 비교 패널 수동 붙여넣기는 `tycManual` 접이식, 펜·참고 이미지는 보라색 묶음. `tycBulk` 전체 조절은 숨긴 태풍까지 현재 비교 목록의 선택한 스타일 속성만 변경하며, 개별 색상·경로·날짜범위는 유지한다. 추가로 불러온 태풍에는 기존 기본값을 사용한다.
- 창 시작 크기는 `desktop/window-layout.js`: 마우스가 있는 모니터의 작업 영역 안에 가로형 일반 창으로 가운데 배치(자동 최대화 없음). `desktop/main.js`를 바꾸면 앱을 다시 실행해야 한다. `boot.js`의 `startupUiEnter`는 첫 실행에만 UI를 0.85초 안에 투명도·블러로 순차 표시하며, 입력/모션 줄이기 설정은 효과를 건너뛴다. 모달이 떠 있으면 `modalWindowDrag`가 제목줄 위에서 창 이동을 허용한다.
- 시군(예상 강수·적설)·서울·시군구(생활기상·미세먼지 농도) 지도 — 도형의 `search` 깃발(js/core.js) — 는 색 팔레트 위의 **지역 이름 검색**으로 여러 구역을 선택하고 칠/지우기 가능(`panels.js`). 서울은 구 전체도 선택한다. 검색 선택 테두리는 임시 편집 표시로, `stripExportUi`에서 제거하며 프로젝트에는 저장하지 않는다.
- 일반 실행에서 복원할 작업이 없으면 시작 안내와 함께 **장면 설정을 자동으로 연다**(`boot.js`). 저장 작업 불러오기·이어보기는 `loadProjectData`가 설정창을 닫으며, 작업을 복원하는 새로고침에는 자동으로 열지 않는다. 시작 중 자동 둘러보기는 겹쳐 띄우지 않는다(상단 i로 수동 실행 가능).
- 로컬 웹 미리보기는 `npx serve`(ETag로 매번 재검증)나 Electron을 쓴다. `py -m http.server`는 휴리스틱 캐시로 옛 js를 줄 수 있다. 미리보기 전에 stamp.

## 9. 로컬 검증·데스크톱 배포 방침

1. 고친다 → `node tools/stamp-version.cjs` → `node --test tests/*.test.cjs desktop/test/*.test.cjs`
   → **`node desktop/test/boot-check.cjs . --wait=9000`이 `"ok": true`** (필수 — 정적 검사가 못 보는 로드 오류를 잡는다. 하나라도 실패하면
   모든 사용자에게 '앱을 다 불러오지 못했어요'가 뜬다). Electron이 없는 환경(GitHub 웹·github.dev 등)이면 **배포하지 말고** 사람에게 넘긴다.
2. 로컬 기록이 필요하면 `git add index.html js css <고친 다른 파일>` — **경로를 적어서**(`git add -A` 금지). `index.html`·`js/`·`css/`는 **한 커밋**에 함께.
3. **웹판은 더 이상 사용하지 않는다. 사용자의 명시적 요청 없이 push·웹 배포 준비를 하지 않는다.** 위 검사는 데스크톱 동작 검증이지 웹 배포 준비가 아니다.
4. 설치판 제작·배포도 요청받을 때만. 개발판 소스 변경만으로 기존 설치판이 교체되지는 않는다.
   굽는 법은 10장 '설치판 만들기'(`node tools/build-installer.cjs` → `node tools/check-installed.cjs`). R: 공유 폴더 복사·업로드는 사람이.
- 문서·코드 주석에 비밀번호·API 키를 쓰지 않는다(공개 저장소).

## 10. 데스크톱 앱 영향

데스크톱 앱(Electron)은 영향 없다. `desktop/main.js`는 상위 폴더를 `app://weathercg`로 서빙하고(js·css MIME 등록됨, `no-store`,
`?v=`는 경로만 보므로 무해), `desktop/test/boot-check.cjs`는 모듈 오류를 `EXC …@app://weathercg/js/x.js:줄`로 잡는다.

- **설치판 만들기**(2026-10-12 — 정식 1.0.0, 사용자 요청. 그 전에 급히 만든 임시판 0.2.0이 있다): `node tools/build-installer.cjs` → `desktop\dist\WeatherCG-Setup-<판>.exe`
  (+ `WeatherCG-Setup-<판>.build.json` — 커밋·Electron·ffmpeg·크기·sha256. `desktop/dist/`는 Git 제외). 판 = `desktop/package.json`의 `version` — 올리고 **커밋한 뒤** 굽는다.
  - **커밋을 굽는다**: `--ref`(기본 HEAD)를 `git archive`로 준비 폴더(`--work`, 기본 `%TEMP%\wcg-installer-build` — 저장소 밖)에 꺼낸다. 커밋 안 한 고침·Git 밖 파일
    (기상청 녹화 `rec-*.json`·바로 가기·`AI_HANDOFF.md`·메모)은 안 들어간다(커밋 안 한 고침이 있으면 알림만). 빌드 도구 electron-builder 24.13.3은 `--tools`
    (기본 `%LOCALAPPDATA%\WeatherCG-build\tools`)에 처음 한 번 npm으로 받는다 — 저장소·`desktop\node_modules`에는 설치하지 않는다(개발판 실행 중일 수 있음).
    Electron은 `desktop\node_modules\electron\dist`가 같은 판(44.6.0)이면 그것을 복사만 하고, 아니면 electron-builder가 받는다(`--download-electron`으로 강제).
  - **담는 것**(`appFileFilter`): index.html·루트 데이터 js 13개·아이콘·manifest, `js/`·`css/`·`FontNew/`·`vendor/`(maplibre-gl — 없으면 가벼운 지도가 파란 지도), `desktop/*.js`·`desktop/wns/*.js`.
    Git 밖에서 더하는 것: `desktop/private/{data-go.key, mapbox.token}`(이 저장소 → 워크트리면 본 저장소 → `--private`, 값은 출력 안 함), `ffmpeg.exe`(`%LOCALAPPDATA%\WNS_Helper` → `R:\[F]_Util\WNS` → `--ffmpeg`, 실행해 보고 담음),
    AE용 SUITE 7종(FontNew 사본) → `desktop/helper/`. **빼는 것**: tests/·tools/·docs/·desktop/test/·`*.md`·`sw.js`(http일 때만 등록 — app://에선 안 씀)·`.git…`·`*.lnk`·`rec-*.json`·`desktop/package*.json`·개발판 실행 bat.
    빌드가 점검하고 어긋나면 멈춘다: 넣으면 안 되는 것(`FORBIDDEN`), 꼭 있어야 하는 것(`REQUIRED`), **앱이 부르는데 빠진 파일**(index.html 태그·js/css 안 경로 글자 — 새 루트 폴더를 만들면 `appFileFilter`에 넣을 것),
    구운 뒤 asar 목록 = 준비한 목록. 정적 검사 `desktop/test/installer.test.cjs`(지금 저장소로 고르기·설정·main.js 경로식).
  - **구조**: `resources\app.asar` = 저장소와 같은 모양(루트에 웹앱, main = `desktop/main.js`) → main.js의 `path.resolve(__dirname, '..')`가 그대로 asar 안 웹앱이고, app://·preload·비공개 키는 asar 안에서 읽는다(Electron fs).
    다른 프로그램이 쓰는 `desktop\helper\**`(ffmpeg 실행·SUITE 폰트 복사)만 `app.asar.unpacked`로 풀고, main.js `DESK_REAL`(경로의 `app.asar` → `app.asar.unpacked`, 개발판은 `__dirname` 그대로)로 찾는다.
    app://는 `desktop/` 전체를 403으로 막으므로 키·ffmpeg는 웹앱에서 안 보인다. 타일 캐시(`%LOCALAPPDATA%\WeatherCG\tile-cache`)·영상 프레임(`…\WeatherCG\frames`)은 개발판과 같은 곳.
  - **설치 프로그램**(NSIS, 한국어): 이 사용자만(관리자 권한 없음 — `tools/installer/installer.nsh`가 '모든 사용자/나만' 화면을 없앰), 기본 `%LOCALAPPDATA%\Programs\weathercg-desktop`(바꿀 수 있음).
    단 임시판(0.2.0 — 그때는 고르는 화면이 있었다)을 **'모든 사용자'로만 깐 PC**는 그 자리(`C:\Program Files\weathercg-desktop`)에 덮어 올린다(관리자 확인 창 한 번 — 안 그러면 두 벌이 된다),
    바탕화면·시작 메뉴 '날씨 CG', 끝에 실행. 제어판에서 지워도 작업·설정(`%APPDATA%\날씨 CG`)은 남긴다. **appId `kr.co.sbs.weathercg`·제품 이름 '날씨 CG'·설치 폴더 이름 `weathercg-desktop`은 임시판(0.2.0)과 같다** —
    그 위에 덮어 설치하면 올라간다(바꾸면 따로 설치돼 둘이 생긴다). 설치 폴더 이름은 제품 이름에 한글이 있어 package 이름을 쓴다(electron-builder 규칙). main.js는 설치판이면 같은 appId로 `setAppUserModelId`(작업 표시줄 고정 아이콘과 창이 한 칸).
    서명 인증서가 없어 받은 PC에서 SmartScreen이 막는다('추가 정보 → 실행'). 자동 업데이트 없음(새 판 = 새 설치 파일을 덮어 설치). 크롬 내장 언어 파일은 한국어·영어만.
    electron-builder가 설치할 때마다 남기는 설치 파일 사본(`%LOCALAPPDATA%\weathercg-desktop-updater\installer.exe` — 자동 업데이트용, 약 170MB)은 `installer.nsh`가 설치 끝·제거 때 지운다(임시판이 남긴 것도 덮어 설치 때 함께).
  - **사용자 데이터 = 개발판과 같음**: 설치판·개발판 모두 '%APPDATA%\날씨 CG'(제품 이름)와 같은 출처 `app://weathercg`를 쓴다 → 작업·배치·개인 키가 이어진다(임시판 → 1.0.0도 그대로).
    대신 한 PC에서 둘을 같이 켜면 나중에 켠 쪽이 먼저 켠 창을 앞으로 부르고 꺼진다(단일 인스턴스 잠금). 시험 배포 대상은 다른 PC들이라 이름을 나누지 않았다 — 개발 PC에서는 하나만 켠다.
  - **앱 버전 보기**: main이 `wcg:helper`로 `app.getVersion()`·`app.isPackaged`를 넘기고 preload가 `wcgDesktop.appVersion`·`packaged` → 설정(렌치) 메뉴 맨 아래 줄 '앱 1.0.0 · 렌더·불러오기 기능 · 앱에 내장됨'(개발판은 '앱 1.0.0 개발판', 마우스를 올리면 전체).
    main/preload 변경이라 개발판은 **앱 재실행 필요**.
  - **점검**: 굽고 나서 `node tools/check-installed.cjs <준비 폴더>\out\win-unpacked --shot=<png>`(설치 없이) → 실제 설치 시험은 `WeatherCG-Setup-<판>.exe /S /D=<임시 폴더>` →
    `node tools/check-installed.cjs <임시 폴더>` → `"<임시 폴더>\Uninstall 날씨 CG.exe" /S`(곧바로 돌아오니 폴더가 없어질 때까지 기다림). 점검기는 담긴 것(금지 0·키 2·asar 밖 ffmpeg 실행·SUITE 7),
    노드 모드(설치된 exe + `ELECTRON_RUN_AS_NODE` — asar 안 `private-config.js`로 두 키 읽기, 내장 헬퍼를 빈 포트에 띄워 `/ping` ff:true), 점검 모드 앱(`WCG_TEST=1` — main 경로 줄 `[wcg-paths]`(설치판·ffmpeg/폰트가 asar 밖),
    부팅 오류 0, `#cg`·`#panel`, app:// js 47·css 16 모두 200, maplibre 200, desktop/ 403, `wcgDesktop` isDesktop·packaged·appVersion·dataPortalKey 있음)를 본다. 값은 출력하지 않는다(있음·길이만).
    점검 모드는 실제 Mapbox 토큰 대신 가짜를 주므로(위 '가벼운 지도') 토큰 파일 읽기는 노드 모드로 본다. 띄운 exe는 PID로만 끈다.
    **주의**: electron-builder 설치·제거 프로그램은 실행 중인 '날씨 CG.exe'(이 사용자 것 전부)를 이름으로 끄고, 같은 appId의 기존 설치를 지우고 올린다('모든 사용자' 설치면 조용한 설치도 관리자 확인 창).
    그래서 **설치판이 깔렸거나 켜진 PC(개발 PC 포함)에서는 정식 설치 파일로 설치 시험을 하지 말고** `--installtest`로 이름만 다른 설치 시험판(`날씨 CG 설치시험`·appId `….installtest`·`out-installtest\WeatherCG-Setup-<판>-installtest.exe`
    — 앱 내용·설치 프로그램 설정은 같음, 정식 exe는 `out\win-unpacked`를 점검기로)을 굽어 설치·점검·제거한다(개발판 electron.exe는 상관없음).
    조용한 설치도 바탕화면·시작 메뉴 바로 가기와 HKCU 등록을 만들었다가 제거 때 지운다.

- **공공데이터포털 기본 키**(2026-10-10 사용자 요청): `desktop/private-config.js`가 `desktop/private/data-go.key`를 읽는다(Git 제외, app://에서는 desktop/ 전체 접근 차단). `wcg:data-key` 동기 IPC는 메인 앱 창의 app://weathercg 주 프레임만 허용하고 preload가 `wcgDesktop.dataPortalKey`로 넘긴다. 개인 키가 없으면 자동 사용하며 입력칸에는 키를 채우지 않고 '기본 키 내장' 안내만 표시한다. 개인 키를 비우면 기본 키로 복귀. 키 두 종류 모두 오류에서 가린다.
  설치판을 만들 때 이 비공개 파일을 desktop/private/ 경로에 함께 담아야 한다(`tools/build-installer.cjs`가 담는다 — 아래 '설치판 만들기'). 클라이언트에 포함된 키는 설치 파일 소유자가 추출할 수 있으므로 강한 비밀 보관 수단은 아니다. 기본 자동 점검에는 실제 키를 넘기지 않으며 `WCG_TEST_DATA_KEY=1`을 명시한 별도 `tests/data-key.boot-eval.js`만 실제 내장 연결을 검사한다(값은 출력 안 함). main/preload 변경이므로 **앱 재실행 필요**.

- **공공데이터포털 받기**(2026-10-10 — 에어코리아·생활기상 느림·누락 고치기): 웹앱(`js/data-maps.js` `dataSendOnce`)이 `wcgDesktop.dataFetch(주소, { timeoutMs })` → `wcg:data-fetch`로 부르면
  메인이 `desktop/data-fetch.js`로 받는다. 허용 주소는 `https://apis.data.go.kr/<기관>/<서비스>/<오퍼레이션>?…`뿐(그 밖은 요청 없이 `denied`), UA는 파이썬 기본(포털 WAF), 8MB 상한.
  Node https 연결 재사용(keepAlive — 소켓 8, 놀면 15초 뒤 닫음, 시스템 인증서도 — `pyurl.caList`), 새 연결이 1.5초·3초 안에 답이 없으면 다른 연결로 하나씩 더(먼저 온 것을 쓰고 나머지는 끊음), 첫 응답 `timeoutMs`·본문 쉼 20초,
  재사용 소켓이 곧바로 끊기면 새 연결로 바로 다시. 프록시를 써야 하는 PC(`pyurl.systemProxyConfig`·`proxyBypass` — 헬퍼와 같은 기준)면 `proxy`로 돌려보내 웹앱이 헬퍼 길로 받는다.
  메인 창 주 프레임만(`privateKeyCallerOk`), 자동 점검(WCG_TEST)은 `WCG_TEST_DATA_FETCH=1`일 때만 실제로 받고 아니면 `off`(→ 헬퍼 길 = 가짜 fetch). 키가 든 주소는 로그·오류에 싣지 않는다.
  `dataFetch`가 없는 옛 데스크톱 판(Ctrl+R만 한 개발판 포함)·웹판은 헬퍼 길 + 웹앱의 시간 제한·다시 보내기. main/preload 변경이므로 **앱 재실행 필요**. 시험: `desktop/test/data-fetch.test.cjs`.
  파이썬 헬퍼(`helper.py` /api/kma)도 요청마다 새 연결·20초 제한이라 같은 멈춤을 겪는다 — 고치지 않았다(대체 길). 내장 헬퍼 `/api/kma`는 10-12부터 이 받기를 같이 쓴다(아래 '기상청 받기').
- **기상청 받기 — 내장 헬퍼 `/api/kma` 빠른 길**(2026-10-12 — '특보 없을 때 기상청 응답이 엄청 오래 걸림' 신고): 원인은 특보 유무가 아니라 **기상청 apihub가 가끔 요청 하나를 응답 없이 붙잡는 것**이다
  (10-12 실측 40분 240건(30초마다 새 연결 1 + keep-alive 2): 30초 뒤 504가 16건 — **특보 없음 응답 4/81 · 특보 있음 7/81 · 하루 목록 5/78**, 새 연결 12/151 · 다시 쓴 연결 4/89(포털과 달리 다시 쓴 연결도 붙잡힘).
  나머지 첫 응답 p50 0.13~0.23초·p90 0.3~0.8초(드물게 1.3·3.8초). TLS는 0.1초 안에 끝나고 요청을 보낸 뒤 멈춘다. 몰려 오는 때가 있다(같은 날 앞선 160건은 0건, 뒤 15분은 12건). 같은 순간 다른 연결로 보낸 요청은 대개 정상(같은 주소 둘 다 붙잡힘 2번)).
  옛 헬퍼는 요청마다 새 연결 + 20초 제한이라 그때 20초를 기다린 뒤 'The read operation timed out' → 앱 카드 '기상청 응답이 너무 늦어요'(옛 헬퍼로 64번 중 5번 재현 — 특보 없음 2·특보 있음 2·태풍 1).
  그래서 `desktop/wns/server.js` `kmaGet`이 `desktop/data-fetch.js` `createDataFetcher`(공공데이터포털 받기 — 같은 함수, 헬퍼 옵션만)를 쓴다: https keep-alive 연결 모음(apihub는 5초 놀면 닫음 — 태풍처럼 연달아 묻는 때 득,
  소켓 32(앱 동시 6건 × 요청마다 최대 4번 = 24보다 넉넉히), 시스템 인증서 `caList`), 첫 응답이 **1.5·3·6초** 안에 없으면 다른 연결로 하나씩 더(다시 쓴 연결도 — `hedgeReused`) 먼저 온 것을 쓰고 나머지는 끊음, 5xx·연결 오류·본문 끊김이면 남은 시간 안에 한 번 더(`retries` 1 —
  다시 보낸 것도 하나 더 몫에서 빼서 **요청 하나에 최대 4번**, 예전엔 503 뒤 하나 더 타이머가 겹쳐 5번), 연결 모음이 꽉 차면(빈 연결 없음·상한만큼 사용·줄 있음) 하나 더·다시 보내기를 하지 않는다(줄만 서서 소용없고 한도 순간에 헛요청이 나감·Node가 소켓에 error 리스너를 쌓음 — `poolFull`, 줄 서 있다 한도 1초 안에 연결을 받은 요청도 안 보냄).
  **처음 보낸 때부터 20초**(`cfg.kmaTimeout` — 옛 약속 그대로, 붙잡힌 요청은 30초 뒤 504라 더 기다려도 안 옴)가 전체 한도(`deadline`) — 머리·본문(조각 사이 쉼도 남은 시간까지만)·넘겨주기 모두. 넘겨주기(302 — 통보문 kma.go.kr → weather.go.kr)는 다음 주소도 빠른 길이면 남은 시간으로 따라가고(0.5초 안 남으면 시간 초과),
  따라갈 수 없으면 옛 길로 처음부터 — 그때도 남은 시간만(urllib 시간 제한은 읽기마다라 조금 넘을 수 있음).
  4xx(인증키·한도)는 다시 보내지 않는다. 응답 글은 옛 길과 같다(`decodeKmaBody` — EUC-KR → UTF-8), 오류 글도 urllib 문구(`kmaFailText` — `HTTP Error 504: …`·`The read operation timed out`·`<urlopen error …>`) 그대로라 웹앱 판정(`wrnHttpFail`·`bulHttpFail`·`dataHttpFail`)은 안 바뀐다.
  **옛 길(urllib 흉내 `urlopen`, 한 번·20초 — helper.py와 바이트까지 같음)로 가는 것**: 프록시를 써야 하는 PC(`systemProxyConfig`·`proxyBypass` — 그 길 그대로), `kmaFastUrl`이 거르는 주소(http://·포트·사용자 정보·점 경로·대문자 호스트·공백·한글·따옴표 등 Node와 urllib이 다르게 보낼 수 있는 글자), 따라갈 수 없는 넘겨주기 — 그래서 파이썬 헬퍼와의 차등 시험(server.test.cjs)은 그대로 통과.
  앱이 기다리다 떠나면(요청 취소 — 태풍 조회 줄의 늦은 쪽 끊기, 데이터 지도 시도 시간 초과) 남은 시도를 끊는다. 기록(`cfg.log`)은 '받음/실패 — N번 보냄, ms'만(인증키 든 주소는 안 실음).
  머리 `X-WCG-Kma: hedge`는 **빠른 길을 실제로 탈 때만** — `/api/kma`는 빠른 길로 받은 응답(실패 502 포함)에만, 옛 길(프록시 PC·특수 주소·옛 길로 넘긴 넘겨주기)로 간 응답엔 없음, `/ping`은 이 PC에서 apihub가 프록시를 안 타면(시작 때 미리 판정, 0.3초까지만 기다림)
  (10-12 검증: 프록시 PC에도 붙어 앱이 자기 '한 번 더'를 끄는 바람에 아무도 다시 안 보내던 것을 고침). `/api/kma`는 늘 `X-WCG-Kma-Sent: 보낸 수`·`Access-Control-Expose-Headers`. 웹앱은 이 표시를 보고 ① 태풍 조회 줄(`kmaRequest`)의 자기 '한 번 더'(0.9·1.5초)를 끈다(겹치면 같은 주소가 최대 2×4번 — 인증키 사용량) —
  표시는 불러오기 시작 때 `/ping` 머리로 미리 알고(`_kmaHelperMark` — 첫 묶음부터 안 겹침) 응답마다 다시 보며, 급한 조회(지금 태풍·지난 날짜 찾기)는 첫 하나 더 시각을 헬퍼에 넘긴다(`/api/kma?u=…&hedge=900` — 헬퍼 기본 1.5초 대신 예전 0.9초, 첫 것만 바뀌어 보내는 수는 그대로, 기본보다 늦거나 0.3초 아래면 무시, 파이썬·옛 헬퍼는 무시),
  ② 특보 불러오기 카드에 1.6초 '기상청 응답이 늦어 다시 요청하는 중…'·8초 '많이 늦어요 — 20초가 지나도 안 오면 멈추고 알려 드려요'(`wrnSlowNote` — 응답 머리가 오면 바로 멈춤, '특보 없음'은 지금처럼 정상 결과).
  파이썬 헬퍼·옛 내장 헬퍼는 머리가 없어 웹앱이 예전 그대로(자기 한 번 더·'기다리는 중' 문구). 버전 게이트·`HELPER_VER` 올림 없음(새 머리는 무시돼도 안전). 웹 데이터 지도의 헬퍼 길(`DATA_TRY`)은 그대로(시도 시간 초과로 끊으면 헬퍼도 끊는다).
  전후 실측(같은 시간대 번갈아 40건씩, 특보 지금·특보 없음·특보 있음·하루 목록·태풍, 헬퍼를 시험 포트로): 옛 헬퍼 실패 4/40(모두 20초 뒤 시간 초과)·평균 2.2초,
  고친 헬퍼 실패 0/40·하나 더로 살린 것 2건(1.6·1.7초)·p50 0.17초·p90 0.31초·최대 1.7초·평균 0.25초. 시험 `desktop/test/server-kma.test.cjs`(로컬 가짜 기상청 — 멈춤·하나 더·다시 쓴 연결·5xx 한 번 더·4xx 그대로·느린 본문·끊긴 본문·전체 한도·앱이 떠남·넘겨주기·프록시 PC 옛 길·주소 판정·오류 문구),
  `tests/typhoon-fetch-speed.test.cjs`(머리 있으면 웹 한 번 더 끔), `tests/warning-day.test.cjs`·`tests/warning-load-result.test.cjs`(늦음 문구·응답 오면 멈춤·밀린 요청은 안 바꿈). main/preload 변경 없음 — 그래도 내장 헬퍼는 메인 프로세스라 **앱 재실행 필요**(Ctrl+R로는 헬퍼가 안 바뀜).
- **가벼운 지도(WebGL · 시험)**(2026-10-10 — js/gl-basemap.js): 엔진 `vendor/maplibre-gl/maplibre-gl.js`(MapLibre GL JS 5.24.0, BSD-3, 고치지 않은 원본 — `vendor/maplibre-gl/README.txt`에 판·sha256)는 그 배경을 고를 때만 `<script>`로 읽는다(부팅·다른 모드엔 없음, 로드 실패 가드 대상 아님 — js/·css/만 봄). 타일은 웹앱(렌더러)이 `https://tiles.openfreemap.org/planet`(TileJSON → 판 붙은 .pbf, CORS `*`, 키·가입 없음)에서 직접 받는다 — 메인·헬퍼 안 거침, 크로미움 HTTP 캐시. **설치판을 만들 때 `vendor/`를 꼭 담는다**(없으면 그 배경만 '지도 엔진 파일을 못 읽었어요' → 파란 지도). 출처 표기(OSM ODbL·OpenMapTiles): 화면엔 아트보드 아래·메뉴에 늘, **출력물에는 넣지 않으니 방송에 쓰면 자막·크레딧에 적는다**. 사내망에서 그 주소가 막히면 '타일을 못 받았어요' → 파란 지도.
  **위성 사진**(10-10): 지도 배경 팝오버의 두 칸 고르기 '위성 사진 · 벡터만'(`S.typhoon.glSat` — 태풍 스타일 키·프로젝트·개인 배치, 옛 작업 = 1). 출처는 'Mapbox 실시간 타일'에 넣어 둔 주소(localStorage `wcg_mapbox_url` — 프로젝트·저장소에 안 들어감)를
  Mapbox Static Tiles(그림 타일 — 다른 지도 라이브러리용 공식 API)로 받는다: 스타일 주소 → `…/styles/v1/{user}/{style}/tiles/512/{z}/{x}/{y}@2x`(tileSize 512 — Studio에서 꾸민 그대로), v4 래스터 → `…/v4/{tileset}/{z}/{x}/{y}@2x.jpg90`(256).
  Mapbox 벡터 스타일을 MapLibre로 직접 그리지 않는다(약관·호환성). 그 스타일은 나라 경계를 꺼 두어(10-10 확인: 보이는 레이어 = background·satellite·water) 자체 경계 선도 빼고 그림 타일만 깐다.
  데스크톱은 그림 타일도 `wcgtile://` → 디스크 캐시(api.mapbox.com 허용, 토큰은 열쇠에서 뺌), 웹은 https 직접(Mapbox CORS `*`) — 어느 쪽이든 ArrayBuffer → ImageBitmap이라 추출 캔버스가 오염되지 않는다.
  넣어 둔 주소가 없으면(또는 못 알아보면) **데스크톱 기본 출처**: `desktop/private-config.js` `readMapboxToken`이 `desktop/private/mapbox.token`(Git 제외 — app://에서는 desktop/ 전체 차단, 공개용 `pk.`만 받고 `sk.`·주소·그 밖 글은 거절)을 읽어 `wcg:mapbox-token` **invoke**로 넘기고(sendSync는 받는 곳 없는 옛 메인이면 창이 멈춘다 — 10-10 확인), preload가 `wcgDesktop.mapboxToken()`·`mapboxTokenReady()`로 앱에 준다(늦게 오면 boot.js → `glbTokenArrived`). 앱은 기본 스타일 `GLB_SAT_STYLE`(사용자 Studio 스타일 — 토큰은 코드에 없음)의 Static Tiles 주소를 만든다. 자동 점검(WCG_TEST)은 실제 토큰을 주지 않고 `WCG_TEST_MAPBOX_TOKEN`(가짜 pk.) 값만. **설치판을 만들 때 `desktop/private/mapbox.token`도 담는다**(없으면 넣어 둔 주소 없이는 벡터만).
  **그림 타일은 요청마다 Mapbox 사용량**이라 영상 렌더 중엔 화면 지도가 카메라를 따라가지 않고(가리개 아래), 프레임은 렌더 전 미리 받은 타일로만 그린다(화면 지도가 실패 상태면 미리 받기 0장). 출처 '지도 © Mapbox © OpenStreetMap · 위성 사진 © Maxar'(위성일 때 화면·메뉴).
- **날씨누리 창**(2026-10-08): `main.js`가 웹앱의 '단기예보 열기'를 받아(`wcg:wnuri-open`) 앱 안 창으로 날씨누리를 띄우고, 다 뜰 때마다
  통보문 본문 글을 웹앱에 보낸다(`wcg:wnuri` → `js/bulletin-load.js` `bulFromWnuri`). 창이 이미 떠 있으면 새로고침한 뒤 읽는다(열어 둔 채
  발표가 바뀌어도 지난 통보문을 읽지 않게). 같은 글을 다시 읽으면 웹앱은 고른 날짜·고친 칸을 그대로 둔다. 창에는 preload가 없다(바깥 페이지에 앱 API 없음). preload의 `openWnuri`·`onWnuri`가 없는 옛 데스크톱 판·웹판은
  그대로 새 탭(복사 → 붙여넣기)이다. main.js·preload.js를 고치면 앱을 다시 실행해야 반영된다(Ctrl+R로는 안 됨).
- **미해군(JTWC) 받기**(2026-10-09): 웹앱의 '미해군(JTWC)에서 불러오기'(`js/typhoon-jtwc.js`)가 `wcgDesktop.jtwcFetch(path)` → `wcg:jtwc-fetch`로 부르면 메인이
  `desktop/jtwc.js`로 받아 글자를 돌려준다. 허용 주소는 `https://www.metoc.navy.mil/jtwc/`의 `rss/jtwc.rss`(활동 중인 태풍 목록)와 `products/xxNNYY.tcw`(통보문)뿐 —
  그 밖은 요청 없이 `denied`. 15초 시간 제한·1MB 상한·브라우저 UA, 따로 세션(`jtwc`, 메모리)의 net.fetch(시스템 프록시를 따름).
  넘겨주기(리디렉트)는 그 세션에 건 문지기(`jtwcGuardSession` — webRequest.onBeforeRequest)가 허용 밖 다음 주소를 요청 전에 끊는다(`denied`·`redirect`).
  **net.fetch는 넘겨주기 뒤에도 `Response.url`이 빈 글자라 받은 뒤 주소 검사로는 못 막는다**(2026-10-09 Electron 44에서 확인) — 문지기를 빼지 말 것.
  메인 창의 주 프레임(`app://` 웹앱)만 부를 수 있다. 헬퍼(`desktop/wns`) 허용 목록과 무관. `jtwcFetch`가 없는 옛 데스크톱 판·웹판은 예전처럼 사이트를 새 창으로 연다.
  시험: `desktop/test/jtwc-fetch.test.cjs`(허용 주소·받기), `tests/typhoon-jtwc.test.cjs`(실제로 받은 RSS·.tcw 픽스처 `tests/fixtures/jtwc/` — 원문 그대로, `-text`).
- **닫기 전 묻기**(2026-10-09): 메인 창 닫기(X·Alt+F4·작업표시줄·앱 종료)는 `main.js`가 막고(close preventDefault) 웹앱에 묻는다(`wcg:close-ask` → preload `onCloseAsk`
  → `js/project-io.js` `closeAsk`). 웹앱은 곧바로 `wcg:close-reply`로 답한다 — 물을 것 없으면 `close`, 토스 팝업('저장하지 않은 변경이 있어요' [저장 안 함]·[취소]·[저장])을
  띄우면 `wait`, 고르면 `close`(저장함·저장 안 함) / `stay`(취소·Esc·바깥 클릭·저장 위치 고르기 취소·저장 실패·파일 쓰기 대신 내려받기로 넘김 — 곧바로 끄면 받기가 끊긴다).
  렌더(영상·이미지로 추출·AE 보내기) 중이면 변경이 없어도 묻는다. 팝업이 떠 있는 동안 키는 팝업이 먼저 받는다(창 캡처 단계 — 아래 확인창 `tossConfirm`이 Enter를 '예'로 받거나 뒤 단축키가 돌지 않게).
  순서·안전장치는 `desktop/close-guard.js`: 묻고 **5초** 안에 답이 없으면(웹앱 멈춤·오류) 그냥 닫는다(destroy), 렌더러가 죽었으면(`isCrashed`) 기다리지 않고 곧바로, `wait` 뒤엔 기다린다(그때 최소화한 창은 되살려 앞으로 — 작업표시줄에서 닫으면 팝업이 안 보이지 않게, 숨긴 점검 창은 그대로),
  또 닫기 = 다시 물음(웹앱은 같은 팝업으로 `wait` — 팝업 하나), 윈도 종료(`session-end`)는 막지 않는다. preload는 웹앱이 아직 콜백을 안 걸었으면(부팅 전·로드 실패) 스스로 `close`로 답한다. 웹판·`onCloseAsk` 없는 옛 데스크톱은 그대로.
  '변경 있음' 판정은 웹앱: 마지막 프로젝트 저장(`saveProjectRun` → `workMarkSaved`)·불러오기(`loadProjectData` → `workMarkClean`)·시작 화면 마침(`markStartStep`) 뒤로
  바뀜 번호 `_workRev`(js/map-build.js — `pushUndo`·`undo`·`redo`)가 올랐고 지금 작업(stateForSave) 서명이 그때와 다를 때(`workDirty`). 자동 저장(wcg_work)은 저장으로 치지 않는다.
  새로고침해도 이어받는다(sessionStorage `wcg_unsaved`). 시험: `tests/close-ask.test.cjs`(판정·팝업 흐름 vm + 배선, `WCG_BOOT_CHECK=1`이면 `close-ask.boot-eval.js`로 실제 앱),
  `desktop/test/close-guard.test.cjs`(메인 순서·시간 제한 + `WCG_BOOT_CHECK=1`이면 `close-flow-check.cjs` — 메인 검사기로 진짜 `win.close()`: 변경 없음 = 곧바로 꺼짐, 칠함 = 팝업·취소·저장 안 함, 멈춘 웹앱 = 약 5초 뒤 꺼짐,
  칠하고 새로고침 = 그래도 팝업(최소화 흉내 창 되살림), 죽은 렌더러 = 곧바로 꺼짐).
- **렌더 결과 '폴더 열기'**(2026-10-12 사용자 요청): 영상(MP4·PNG 시퀀스·MXF·알파 MOV)을 저장하면 타임라인 `#tlInfo` 옆에 [폴더 열기](`#tlOpenDir`), 이미지로 렌더는 팝업 바닥 요약에([폴더 열기] `.exSumOpen` — 첫 장).
  누르면 탐색기에서 그 폴더를 열고 방금 만든 파일을 골라 둔다(`shell.showItemInFolder`만 — `openPath`·실행 없음). 마지막 저장 위치는 다음 렌더가 저장할 곳을 정할 때까지 기억(이번 실행 동안).
  **웹앱은 저장한 파일의 실제 경로를 모른다**(영상 저장 폴더 `outDir`·이미지 폴더·저장창은 File System Access 핸들 — 이름만). 그래서 메인이 기록한다(`desktop/reveal.js`):
  ① `session.setPermissionCheckHandler`의 `'fileSystem'` 확인에 경로가 같이 온다(Electron 44 — `electron/shell/browser/file_system_access/file_system_access_permission_context.cc` `GetStatus`, 2026-10-12 실험으로 확인) —
  고른 폴더 = 폴더 경로(그 안 하위 폴더·파일은 폴더 권한을 같이 써서 폴더 경로만 온다), 저장창 파일 = 그 파일 경로. 메인 출처(`app://weathercg`)의 쓰기 확인(`writable`)만 기록. ② 내려받기 완료(`will-download` → `done` — 경로·저장창은 그대로, 끝난 뒤 `getSavePath`).
  웹앱은 쓰기가 끝나면 단서로 묻는다(`wcgDesktop.savedPath` → `wcg:saved-path`): 저장 폴더 = {파일 이름, 폴더 핸들 이름}, 저장창 = {파일 이름}, 이미지 = {첫 장, 고른 폴더 이름, [날짜 폴더]}, 내려받기 = {이름, download} — 저장창에서 저장을 마칠 때까지(최대 15분) 기다린 뒤 버튼.
  메인은 기록 중 이름이 맞고 실제로 있는 파일만(같은 이름 폴더가 둘이면 최근에 쓴 곳) 돌려준다. 열기(`wcgDesktop.revealPath` → `wcg:reveal-path`)는 다시 확인: 실제로 있고 **저장창 파일 그 자체·고른 폴더(와 그 아래)·내려받은 파일**만(그 밖 `not-allowed`, 없음 `gone`).
  두 IPC 모두 메인 창 주 프레임만(`privateKeyCallerOk`). 점검 모드(WCG_TEST)는 탐색기를 열지 않고 `[reveal-test] "경로"`만 찍는다.
  **권한 확인 처리기를 두면 `'fileSystem'` 상태는 처리기 답이 정한다** → 늘 허용(전에도 처리기가 없어 Electron이 요청을 묻는 창 없이 다 허용했다 — 이제는 저장 폴더를 다시 허락받는 단계 없이 곧바로). 다른 권한은 처리기가 없을 때와 같은 답(`deprecated-sync-clipboard-read`만 거절). 크로미움 막힌 폴더(AppData 등) 규칙은 그대로.
  **안 되는 경우**(버튼 안 뜸): 웹판·main/preload를 안 바꾼 옛 데스크톱(Ctrl+R만 한 개발판 — **앱 재실행 필요**), 경로를 못 찾은 저장(드묾), 내려받기를 취소함. 파일을 옮기거나 지웠으면 누를 때 '그 자리에 없어요' 안내 뒤 버튼을 거둔다. AE로 보내기는 AE가 바로 열리므로 버튼 없음.
  시험: `tests/output-reveal.test.cjs`·`desktop/test/reveal.test.cjs`, 실제 앱 `WCG_BOOT_CHECK=1` → `desktop/test/reveal-flow-check.cjs`(시험 폴더는 크로미움이 막는 %TEMP% 대신 `desktop/test/.tmp-reveal-<pid>` — 끝나면 지움, Git 제외).
- **AE로 보내기 'GEOlayers 지도로'**(2026-10-10 — 내장 헬퍼만): `desktop/wns/server.js`에 GET `/api/geo-caps`(GEOlayers 3 확장 폴더의 CSXS/manifest.xml 판·지원 AE 범위(AEFT — 1.17.0은 13.6~26.9)만 읽음 — 경로·사용자 이름은 응답에 없음), `/api/ae`는 스펙에 `mode:'geolayers'` + `geo`가 있을 때만 `desktop/wns/geo-jsx.js`로(태풍 GeoJSON을 보내기 폴더에 `geo_<키>.geojson`·`typhoon.geojson`으로 저장, 지원 AE 범위를 jsx에 넘김) — 없으면 `ae-jsx.js` 그대로(golden 바이트 동일). geo-jsx는 기존 jsx를 글자 그대로 가운데에 넣고 앞뒤만 덧붙인다(첫 줄 '실행 취소 묶음 열기'만 ①로 당김): ① `geolayers3` 전역(GEOlayers 3 패널이 열려 있어야 생김 — 없으면 AE 판이 설치판 지원 범위 밖인지까지 알림)·맵 컴프 찾기(열어 둔 컴프 → 프로젝트 창에서 고른 것 → 맵 컴프가 하나뿐이면 그것 — 없거나 여럿이면 한국어 알림으로 멈춤, 아무것도 안 만듦) → 실행 취소 묶음 열기 → `duplicate`로 담는 컴프 복제(담는 컴프·맵 컴프가 둘 다 새것일 때만 씀 — 아니면 이번에 새로 생긴 컴프만 지우고 알림으로 멈춤, **사용자의 원래 맵 컴프는 읽기만**) ② 기존 jsx ③ 복제본을 우리 컴프 맨 아래 `GEO_MAP`(짧으면 길이를 늘리고 안내), 보기 키(프레임마다 Latitude·Longitude·Zoom·Bearing 값 직접 — 안 되면 setViewAtTime, 한 보기는 setViewAtTime이 돌려준 Zoom이 다르면 기록), 리깅 CAM 널 = GEOlayers 앵커 레이어(세계 px)를 따라가는 표현식(앵커가 없으면 컨트롤 값으로 같은 식 — AE에서 보기를 고쳐도 태풍이 지도에 붙어 있음), 앱 카메라에 회전이 있으면 기존 jsx의 ROT 널(라벨 박스·지시선을 프레임 가운데 기준으로 돌림)에서 CAM을 떼고 ROT 회전 = CAM 방향(라벨도 GEOlayers Bearing을 따라 돎), 남한 강조 스크린 혼합(지도 겹 바로 아래·GEO_MAP 위 — 앱 순서), 마커 = 앱 카메라 키 ④ 비동기(패널이 처리): 태풍 GeoJSON을 `draw`로 GEOlayers 셰이프(편집용·꺼 둠, 선이 있으면 autoStrokeWidth, 채움 불투명도 0은 채움 끄기 — 설치판이 0을 100으로 바꿈) → `finalize`(타일 받기) → 알림·`geo_log.txt`. 패널을 닫았으면 콜백이 안 오므로 `app.scheduleTask`로 정한 시간(셰이프 90초·타일 받기만 600초) 안에 첫 답이 없으면 알림·기록. 확정 못 한 API(duplicate 반환 모양·draw 콜백·스타일 dashVal 뜻)는 typeof·try로 감싸고 안 된 것을 알림·기록에 남긴다. 파이썬 헬퍼(웹판)에는 없다(앱은 404면 지금 방식만). 기울기(rx)는 옮기지 않는다(Pitch 0 — 리깅이 2D). 실제 AE 확인은 사람이(보고서 순서).
- **렌더 취소 — 헬퍼 쪽**(2026-10-12 — 내장 헬퍼만): `desktop/wns/server.js`에 `POST /api/cancel?sid=`(본문 안 읽음) — 그 세션 프레임 폴더를 지우고, 취소한 sid(최근 64개)의 늦게 온 프레임(프레임0 제외 — 프레임0 = 새 세션이라 표시를 푼다)·`/api/finalize`는 409 `취소된 렌더`(폴더를 다시 만들지 않음, 받는 중이던 프레임은 끝나면 폴더째 지움), 인코딩 중이면 ffmpeg를 멈추고(`runCapture`의 signal) 반쯤 만든 결과 파일을 지운 뒤 409. sid 검사는 `safe`·`checkSid` 그대로 + `ae…`(AE 보내기 원본 — 저장한 AE 프로젝트가 참조)는 400. 파이썬 헬퍼(웹판)엔 없어 404 — 앱은 결과를 보지 않으므로 버전 게이트·`HELPER_VER` 올림 없음(남은 폴더는 하루 뒤 정리). 시험 `desktop/test/server-cancel.test.cjs`.
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
