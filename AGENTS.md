# 작업 안내 (AI 공용 — Claude·GPT 등)

이 앱(날씨 CG 메이커)은 2026-10-08부터 **기능별 파일로 나뉘어 있다.** 먼저 [`MODULES.md`](MODULES.md)를 읽을 것.

- 로직은 `js/*.js`(34개), 스타일은 `css/*.css`(11개)에 있다. `index.html`은 head 인라인·마크업·데이터 스크립트와 태그뿐이다.
  `index.html`에서 함수 본문을 찾지 말고 `grep -nE "^(async )?function 이름\b|^(const|let) 이름\b" js/*.js`로 찾는다.
- `<script>`/`<link>` 태그 순서 변경, `defer`/`async`/`type="module"` 추가 금지. 순서 = 로드 순서 = 덮어쓰기 우선순위.
  기존 파일의 순서는 바꾸지 않는다(테스트가 고정 목록과 비교한다). 새 파일은 사이에 끼워 넣기만 하고, 그때 MODULES.md 표에 행을 하나 넣는다.
- **같은 이름 함수를 두 파일에 만들지 말 것.** 최상위 `let/const/class`·`var`도 파일 사이에 겹치면 안 된다. 예약 이름(`top` `location` `window` `document` `wcgDesktop` `_per` `_mas` 등)·window 내장 이름도 금지.
- 각 js 파일 머리 2줄(`/* [모듈] js/이름.js — 설명 */` + `'use strict';`)과 css 머리 1줄을 지우지 않는다.
- **호이스팅은 파일을 넘지 못한다.** 로드 때 바로 실행되는 새 최상위 코드(리스너 등록·즉시 실행·`const x = f()`·`typeof f`)와
  부팅 뒤를 가정한 setTimeout·rAF는 `js/boot.js`(마지막 파일)에 두거나, 쓰는 이름이 모두 앞 파일에 있는 곳에 둔다.
  boot.js가 아닌 파일의 최상위에서 `dispatchEvent`·`click()`·`focus()`·`queueMicrotask`·`MutationObserver`도 금지(로드 실패 가드가 치명 오류로 본다).
  최상위 리스너 등록문을 다른 파일로 옮기지 않는다(같은 이벤트의 실행 순서가 바뀐다).
- css 안 상대 경로는 css/ 기준(`url('../FontNew/…')`), js 안 경로는 문서 기준(`'FontNew/…'`). 경로는 늘 상대 경로(`/…` 금지).
- 테스트·스크립트에서 앱 코드를 잘라 쓸 때는 `index.html`을 직접 읽지 말고 `tools/app-source.cjs`를 쓴다
  (`appSource(path.join(__dirname, '..', 'index.html'))` → 분할 전 한 파일과 같은 텍스트). 근무표의 app-source.cjs와 다르니 서로 복사하지 않는다.
- 고친 뒤(배포 전 필수 3단계): `node tools/stamp-version.cjs`(?v= 갱신) → `node --test tests/*.test.cjs desktop/test/*.test.cjs`
  → `node desktop/test/boot-check.cjs . --wait=9000`이 `"ok": true`. 테스트는 정적 검사라 못 보는 로드 오류가 있다(MODULES.md 2장 규칙 3) —
  boot-check를 못 돌리는 환경(Electron 없음·GitHub 웹)이면 **배포(main push)하지 말고** 브랜치로 올려 사람에게 넘긴다. 데스크톱 개발판은 hot reload가 없다(Ctrl+R).
- 배포: 저장소 루트가 곧 사이트(GitHub Pages). 위 3단계를 마친 뒤
  `git add index.html js css <고친 파일>`(경로를 적어서, `-A` 금지) → commit → push. `index.html`·`js/`·`css/`는 한 커밋에 함께.
- 디버그 eval·콘솔은 `(() => { … })()`로 감싸고 앱 전역(`S` `sel` `mode` …)에 대입하지 않는다(자동 저장으로 실제 작업에 남는다).
- 헬퍼(기능 확장팩) 동작을 바꿀 때:
  - Python 헬퍼 **원본은 저장소 밖 `R:\[F]_Util\WNS\_src\helper.py`**다. 저장소의 `tools/wns-helper/helper.py`는 2026-07 옛 사본이니 고치지 않는다.
  - 원본을 고치면 데스크톱 내장 헬퍼 `desktop/wns/`(server.js·ae-jsx.js)도 함께 고친다 → `py desktop/test/make_golden.py`(원본에서 정답 재생성)
    → `node --test desktop/test/ae-jsx.golden.test.cjs desktop/test/server.test.cjs` 통과.
  - 버전 4곳을 함께 올린다: `helper.py`의 `HELPER_VER`, `desktop/main.js`·`desktop/wns/server.js`의 `HELPER_VER`, `js/export-video.js`의 `HELPER_VER_MIN`.
    그다음 `py -m PyInstaller`로 웹판 헬퍼를 다시 빌드한다.
  - `R:`에 접근할 수 없는 환경이면 헬퍼를 바꾸지 않는다.
- `docs/superpowers/`(plans·specs)는 **분할 전(2026-07) 기록**이다. 거기 나오는 `index.html:줄번호`, `fs.readFileSync('index.html')` 테스트,
  `git add index.html`만 하기를 따르지 말 것 — 지금 규칙은 이 문서와 MODULES.md.
- 공개 저장소다 — 문서·코드 주석에 비밀번호·API 키를 쓰지 않는다.
