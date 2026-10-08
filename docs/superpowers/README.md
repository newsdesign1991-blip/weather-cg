# 분할 전 기록 (2026-07)

이 폴더의 plans·specs는 앱이 **한 파일 `index.html`이던 때(2026-10-08 기능별 분할 전)** 의 작업 기록이다.

다음은 지금은 **따르지 말 것**:

- `index.html:5735-5769` 같은 줄 번호 — 코드는 이제 `js/*.js`·`css/*.css`에 있다. `grep -nE "^(async )?function 이름\b" js/*.js`로 찾는다.
- 테스트에서 `fs.readFileSync('index.html')`로 앱 코드를 읽기 — `tools/app-source.cjs`의 `appSource(…)`를 쓴다(직접 읽으면 구조 테스트가 실패한다).
- `git add index.html`만 하고 커밋하기 — `index.html`·`js/`·`css/`를 한 커밋에 함께 올린다(`node tools/stamp-version.cjs` 뒤).

지금 규칙은 저장소 루트의 [`AGENTS.md`](../../AGENTS.md)와 [`MODULES.md`](../../MODULES.md)에 있다.
