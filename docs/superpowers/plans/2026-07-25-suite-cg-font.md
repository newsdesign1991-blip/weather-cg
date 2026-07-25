# SUITE CG Font Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI 글꼴을 유지하면서 CG 출력의 기본 글꼴을 SUITE 7개 굵기로 변경한다.

**Architecture:** `index.html`에 출력 전용 `SUITE CG` 폰트 패밀리를 선언한다. 기존 CG SVG/HTML 생성 지점만 이 패밀리를 사용하고 UI 전역 스타일은 변경하지 않는다.

**Tech Stack:** HTML, CSS `@font-face`, JavaScript SVG 생성, Node.js 내장 테스트 러너

## Global Constraints

- UI의 `Wanted Sans Variable` 설정은 유지한다.
- `FontNew`의 SUITE OTF 7개 파일을 모두 사용한다.
- 기존 CG 요소별 `font-weight` 값은 변경하지 않는다.

---

### Task 1: 출력 전용 SUITE 폰트 연결

**Files:**
- Modify: `index.html`
- Modify: `tests/vf-scale.test.cjs`
- Use: `FontNew/SUITE-Light.otf`
- Use: `FontNew/SUITE-Regular.otf`
- Use: `FontNew/SUITE-Medium.otf`
- Use: `FontNew/SUITE-SemiBold.otf`
- Use: `FontNew/SUITE-Bold.otf`
- Use: `FontNew/SUITE-ExtraBold.otf`
- Use: `FontNew/SUITE-Heavy.otf`

**Interfaces:**
- Consumes: 기존 SVG/HTML CG 텍스트 생성 코드
- Produces: CSS 패밀리 이름 `SUITE CG`

- [ ] **Step 1: Write the failing test**

```js
test('CG uses local SUITE weights while editor UI keeps Wanted Sans', () => {
  for (const [weight, file] of [['300','Light'], ['400','Regular'], ['500','Medium'], ['600','SemiBold'], ['700','Bold'], ['800','ExtraBold'], ['900','Heavy']]) {
    assert.match(html, new RegExp(`font-weight:\\\\s*${weight}[\\\\s\\\\S]*FontNew/SUITE-${file}\\\\.otf`));
  }
  assert.match(html, /body\s*\{[\s\S]*font-family:\s*'Wanted Sans Variable'/);
  assert.match(html, /'font-family':\s*'"SUITE CG"'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/vf-scale.test.cjs`

Expected: FAIL because `SUITE CG` is not registered or used.

- [ ] **Step 3: Write minimal implementation**

Add seven `@font-face` declarations for `SUITE CG`, then replace only the CG text generator font-family values with `"SUITE CG", "Malgun Gothic", sans-serif`.

- [ ] **Step 4: Run verification**

Run: `node --test tests/vf-scale.test.cjs`

Expected: all tests PASS.

Run an inline JavaScript parse check for every script in `index.html`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/vf-scale.test.cjs FontNew docs/superpowers
git commit -m "feat: CG 기본 글꼴을 SUITE로 변경"
```
