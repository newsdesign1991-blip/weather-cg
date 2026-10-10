# 작업 안내 (AI 공용 — Claude·GPT 등)

이 앱(날씨 CG 메이커)은 2026-10-08부터 **기능별 파일로 나뉘어 있다.** 먼저 [`MODULES.md`](MODULES.md)를 읽을 것.

- 로직은 `js/*.js`(46개), 스타일은 `css/*.css`(16개)에 있다. `index.html`은 head 인라인·마크업·데이터 스크립트와 태그뿐이다.
  `index.html`에서 함수 본문을 찾지 말고 `grep -nE "^(async )?function 이름\b|^(const|let) 이름\b" js/*.js`로 찾는다.
- `<script>`/`<link>` 태그 순서 변경, `defer`/`async`/`type="module"` 추가 금지. 순서 = 로드 순서 = 덮어쓰기 우선순위.
  기존 파일의 순서는 바꾸지 않는다(테스트가 고정 목록과 비교한다). 새 파일은 사이에 끼워 넣기만 하고, 그때 MODULES.md 표에 행을 하나 넣는다.
- **지도 종류**: `S.style` = 지도 도형 키, 장면 설정 카드 = `MAP_CARDS`(js/map-build.js — 데이터별, `cardOf(S.style)`). 데이터 섹션은 자기 지도에서만(`secModeHidden`) — 다른 구분으로 옮겨 칠하지 않는다(MODULES.md 7-1).
  공공데이터포털 자료(생활기상·미세먼지)의 주소·오퍼레이션·응답 이름은 `js/data-maps.js`의 `DATA_API` 한 곳에만.
  요청은 데스크톱 메인 프로세스(`desktop/data-fetch.js` — 연결 재사용·늦은 새 연결엔 하나 더, 2026-10-10)가 먼저, 못 쓰면 헬퍼 `/api/kma`. 포털은 새 연결 첫 요청의 약 1/3을 30초 넘게 붙잡으니 요청마다 새 연결로 바꾸지 말 것(MODULES.md 7-1·10장). 키는 개인 설정(`wcg_datakey`) 우선, 없으면 데스크톱 비공개 `desktop/private/data-go.key`(Git 제외)를 쓴다. 키 값은 코드·문서·프로젝트·로그에 넣지 말 것.
  데이터 지도 도형 `region-map-data.js`는 손으로 고치지 말고 `node tools/build-data-maps.cjs --src=<원본 data 폴더>`로 다시 굽는다.
- **같은 이름 함수를 두 파일에 만들지 말 것.** 최상위 `let/const/class`·`var`도 파일 사이에 겹치면 안 된다. 예약 이름(`top` `location` `window` `document` `wcgDesktop` `_per` `_mas` 등)·window 내장 이름도 금지.
- 각 js 파일 머리 2줄(`/* [모듈] js/이름.js — 설명 */` + `'use strict';`)과 css 머리 1줄을 지우지 않는다.
- **호이스팅은 파일을 넘지 못한다.** 로드 때 바로 실행되는 새 최상위 코드(리스너 등록·즉시 실행·`const x = f()`·`typeof f`)와
  부팅 뒤를 가정한 setTimeout·rAF는 `js/boot.js`(마지막 파일)에 두거나, 쓰는 이름이 모두 앞 파일에 있는 곳에 둔다.
  boot.js가 아닌 파일의 최상위에서 `dispatchEvent`·`click()`·`focus()`·`queueMicrotask`·`MutationObserver`도 금지(로드 실패 가드가 치명 오류로 본다).
  최상위 리스너 등록문을 다른 파일로 옮기지 않는다(같은 이벤트의 실행 순서가 바뀐다).
- **태풍 지도 배경 '가벼운 지도 (WebGL · 시험)'**(10-10, `data-bm="gl"` — `js/gl-basemap.js`): MapLibre GL(`vendor/maplibre-gl/`, 저장소에 파일로 — CDN 금지)이 OpenFreeMap 벡터 타일을 아트보드 뒤 캔버스에 그린다. 다른 4모드(파란·밝은/어두운 위성·Mapbox)의 코드 길과 섞지 않는다 — 이 모드 판정은 `glbShowing()`·복제본 `#bgMapT[data-glb]`로만. 지도를 그림으로 굽는 곳(svgToImage·svgBlob·previewPng)을 새로 만들면 `glbInlineClone`도 부른다(MODULES.md 3장 6번·10장). 위성 사진 출처는 개인 Mapbox 주소(`wcg_mapbox_url`) 우선, 없으면 데스크톱 비공개 `desktop/private/mapbox.token`(공개용 pk. 토큰, Git 제외 — invoke `wcg:mapbox-token`)으로 기본 스타일. 토큰 값은 코드·문서·로그·시험에 넣지 말 것(시험은 가짜 `WCG_TEST_MAPBOX_TOKEN`).
- **`<select>`는 공용 드롭다운**(`js/dropdown.js`·`css/dropdown.css`)이 덮는다 — 원래 select는 숨긴 채 값·옵션·change의 원천이다.
  코드는 하던 대로 `select.value`·`innerHTML`·`onchange`를 쓰면 칸이 따라간다. 새 select를 만들어도 boot.js 관찰자가 붙인다(시스템 드롭다운을 다시 보이게 하지 말 것).
- css 안 상대 경로는 css/ 기준(`url('../FontNew/…')`), js 안 경로는 문서 기준(`'FontNew/…'`). 경로는 늘 상대 경로(`/…` 금지).
- 테스트·스크립트에서 앱 코드를 잘라 쓸 때는 `index.html`을 직접 읽지 말고 `tools/app-source.cjs`를 쓴다
  (`appSource(path.join(__dirname, '..', 'index.html'))` → 분할 전 한 파일과 같은 텍스트). 근무표의 app-source.cjs와 다르니 서로 복사하지 않는다.
- 고친 뒤(배포 전 필수 3단계): `node tools/stamp-version.cjs`(?v= 갱신) → `node --test tests/*.test.cjs desktop/test/*.test.cjs`
  → `node desktop/test/boot-check.cjs . --wait=9000`이 `"ok": true`. 테스트는 정적 검사라 못 보는 로드 오류가 있다(MODULES.md 2장 규칙 3) —
  boot-check를 못 돌리는 환경(Electron 없음·GitHub 웹)이면 **배포(main push)하지 말고** 브랜치로 올려 사람에게 넘긴다. 데스크톱 개발판은 hot reload가 없다(Ctrl+R).
- **웹판은 2026-10-09부터 막혀 있다**(index.html head 첫 스크립트 — 데스크톱 앱·로컬 개발만 동작, MODULES.md 7장). 앞으로는 데스크톱 설치판으로 배포한다.
- **현재는 데스크톱 앱만 개발한다.** 평소에는 수정·검증·로컬 기록까지만. 사용자가 명시적으로 요청하지 않으면 GitHub push·웹 배포 준비·설치판 배포를 하지 않는다.
  로컬 커밋은 경로를 적어서(`-A` 금지), `index.html`·`js/`·`css/`를 한 커밋에 함께. 설치판 제작을 요청받으면 비공개 키 파일도 로컬 빌드에 포함하되 Git 추적에는 넣지 않는다.
- 디버그 eval·콘솔은 `(() => { … })()`로 감싸고 앱 전역(`S` `sel` `mode` …)에 대입하지 않는다(자동 저장으로 실제 작업에 남는다).
- 헬퍼(기능 확장팩) 동작을 바꿀 때:
  - Python 헬퍼 **원본은 저장소 밖 `R:\[F]_Util\WNS\_src\helper.py`**다. 저장소의 `tools/wns-helper/helper.py`는 2026-07 옛 사본이니 고치지 않는다.
  - 원본을 고치면 데스크톱 내장 헬퍼 `desktop/wns/`(server.js·ae-jsx.js)도 함께 고친다 → `py desktop/test/make_golden.py`(원본에서 정답 재생성)
    → `node --test desktop/test/ae-jsx.golden.test.cjs desktop/test/server.test.cjs` 통과.
  - 버전 4곳을 함께 올린다: `helper.py`의 `HELPER_VER`, `desktop/main.js`·`desktop/wns/server.js`의 `HELPER_VER`, `js/export-video.js`의 `HELPER_VER_MIN`.
  - AE 스펙에 새 필드를 더할 때(20261008 규칙): 옛 헬퍼는 모르는 필드를 무시하므로 **옛 필드를 계속 채우고 새 필드는 무시돼도 안전하게**(이미지 크기·자리가 바뀌는 것만 `/ping` 버전으로 게이트 — `AE_EXT_VER`).
    헬퍼는 새 필드를 `_xnum`·`_ease2`·`_prog` 같은 '예외 없는 읽기'로만 읽고, 새 JSX 도우미는 `_need`로 쓰일 때만 넣는다(새 필드 없는 스펙 출력은 바이트 그대로 —
    `desktop/test/golden-legacy.test.cjs`). 새 필드마다 `desktop/test/ae-specs/`에 있음·없음·경계값 스펙을 더하고, 화면과 같은지는 `tests/ae-ease-match.test.cjs`(AE 흉내 = 앱 함수).
    그다음 `py -m PyInstaller`로 웹판 헬퍼를 다시 빌드한다.
  - `R:`에 접근할 수 없는 환경이면 헬퍼를 바꾸지 않는다.
- `docs/superpowers/`(plans·specs)는 **분할 전(2026-07) 기록**이다. 거기 나오는 `index.html:줄번호`, `fs.readFileSync('index.html')` 테스트,
  `git add index.html`만 하기를 따르지 말 것 — 지금 규칙은 이 문서와 MODULES.md.
- 공개 저장소다 — 문서·코드 주석에 비밀번호·API 키를 쓰지 않는다.
