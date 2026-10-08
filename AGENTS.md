# 작업 안내 (AI 공용 — Claude·GPT 등)

이 앱(날씨 CG 메이커)은 2026-10-08부터 **기능별 파일로 나뉘어 있다.** 먼저 [`MODULES.md`](MODULES.md)를 읽을 것.

- 로직은 `js/*.js`(34개), 스타일은 `css/*.css`(11개)에 있다. `index.html`은 head 인라인·마크업·데이터 스크립트와 태그뿐이다.
  `index.html`에서 함수 본문을 찾지 말고 `grep -nE "^(async )?function 이름\b|^(const|let) 이름\b" js/*.js`로 찾는다.
- `<script>`/`<link>` 태그 순서 변경, `defer`/`async`/`type="module"` 추가 금지. 순서 = 로드 순서 = 덮어쓰기 우선순위.
  파일을 넣거나 순서를 바꾸면 MODULES.md 표도 함께 고친다(테스트가 비교한다).
- **같은 이름 함수를 두 파일에 만들지 말 것.** 최상위 `let/const/class`·`var`도 파일 사이에 겹치면 안 된다. 예약 이름(`top` `location` `window` `document` `wcgDesktop` `_per` `_mas` 등)·window 내장 이름도 금지.
- 각 js 파일 머리 2줄(`/* [모듈] js/이름.js — 설명 */` + `'use strict';`)과 css 머리 1줄을 지우지 않는다.
- **호이스팅은 파일을 넘지 못한다.** 로드 때 바로 실행되는 새 최상위 코드(리스너 등록·즉시 실행·`const x = f()`)와
  부팅 뒤를 가정한 setTimeout·rAF는 `js/boot.js`(마지막 파일)에 두거나, 쓰는 이름이 모두 앞 파일에 있는 곳에 둔다.
  최상위 리스너 등록문을 다른 파일로 옮기지 않는다(같은 이벤트의 실행 순서가 바뀐다).
- css 안 상대 경로는 css/ 기준(`url('../FontNew/…')`), js 안 경로는 문서 기준(`'FontNew/…'`). 경로는 늘 상대 경로.
- 테스트·스크립트에서 앱 코드를 잘라 쓸 때는 `index.html`을 직접 읽지 말고 `tools/app-source.cjs`를 쓴다
  (`appSource(path.join(__dirname, '..', 'index.html'))` → 분할 전 한 파일과 같은 텍스트). 근무표의 app-source.cjs와 다르니 서로 복사하지 않는다.
- 고친 뒤: `node tools/stamp-version.cjs`(?v= 갱신) → `node --test tests/*.test.cjs desktop/test/*.test.cjs`
  → (가능하면) `node desktop/test/boot-check.cjs . --wait=9000`. 데스크톱 개발판은 hot reload가 없다(Ctrl+R).
- 배포: 저장소 루트가 곧 사이트(GitHub Pages). **배포 전에 꼭 `node tools/stamp-version.cjs`**, 그다음
  `git add index.html js css <고친 파일>`(경로를 적어서, `-A` 금지) → commit → push. `index.html`·`js/`·`css/`는 한 커밋에 함께.
  GitHub 웹에서 고칠 때는 github.dev(`.` 키)로 고친 파일과 index.html의 `?v=`를 한 커밋으로.
- 디버그 eval·콘솔은 `(() => { … })()`로 감싸고 앱 전역(`S` `sel` `mode` …)에 대입하지 않는다(자동 저장으로 실제 작업에 남는다).
- 헬퍼(기능 확장팩) 동작을 바꿀 때는 웹판 Python 헬퍼(`tools/wns-helper/helper.py`)와 데스크톱 내장 헬퍼(`desktop/wns/`)
  **양쪽**을 함께 고치고 골든을 맞춘다(`py desktop/test/make_golden.py`로 정답 재생성 → `desktop/test/ae-jsx.golden.test.cjs` 통과).
- 공개 저장소다 — 문서·코드 주석에 비밀번호·API 키를 쓰지 않는다.
