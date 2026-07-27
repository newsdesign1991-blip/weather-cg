# Warning Drag Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 특보 우선순위 드래그 중 정확한 삽입 위치를 표시하고 항목 사이에 6px 간격을 만든다.

**Architecture:** `index.html`에 삽입 인덱스를 계산하는 순수 함수를 추가하고, 특보 목록의 HTML5 드래그 이벤트가 이 결과를 사용하도록 한다. 시각 피드백은 CSS 클래스만으로 표현하며 드롭·취소·이탈 시 공통 정리 함수로 제거한다.

**Tech Stack:** 단일 HTML/JavaScript/CSS, Node.js 내장 `node:test`

## Global Constraints

- 드래그 순서 변경은 현재 특보 조회 결과에만 적용한다.
- 다음 특보 조회 때 기존 기본순서로 초기화한다.
- 기존 색상 입력과 표시·숨김 버튼 동작은 유지한다.
- 특보 항목 간격은 6px이다.

---

### Task 1: 특보 삽입 위치 피드백

**Files:**
- Modify: `index.html`
- Modify: `tests/warning-timeline-and-order.test.cjs`

**Interfaces:**
- Produces: `wrnDropIndex(from: number, over: number, after: boolean, length: number): number`
- Produces: `clearWrnDragFeedback(container: HTMLElement): void`
- Consumes: 기존 `moveWrnOrder(order, from, to)` 및 `buildWrnList()`

- [ ] **Step 1: 삽입 인덱스와 UI 계약의 실패 테스트 작성**

```js
test('warning drop index matches the visible before or after guide', () => {
  const { wrnDropIndex } = timelineContext();
  assert.equal(wrnDropIndex(0, 2, false, 4), 1);
  assert.equal(wrnDropIndex(0, 2, true, 4), 2);
  assert.equal(wrnDropIndex(3, 1, false, 4), 1);
  assert.equal(wrnDropIndex(3, 1, true, 4), 2);
});

test('warning rows expose drag guides and six pixel separation', () => {
  assert.match(html, /\.wrnItem\s*\{[^}]*margin-bottom:\s*6px/s);
  assert.match(html, /\.wrnItem\.drop-before::before/);
  assert.match(html, /\.wrnItem\.drop-after::after/);
  assert.match(html, /\.wrnItem\.dragging/);
});
```

- [ ] **Step 2: 테스트를 실행해 기능 부재로 실패하는지 확인**

Run: `node --test tests/warning-timeline-and-order.test.cjs`

Expected: `wrnDropIndex is not a function` 및 드래그 CSS 계약 불일치로 FAIL

- [ ] **Step 3: 최소 구현 추가**

```js
function wrnDropIndex(from, over, after, length) {
  let insertion = Math.max(0, Math.min(length, over + (after ? 1 : 0)));
  if (from < insertion) insertion--;
  return Math.max(0, Math.min(length - 1, insertion));
}

function clearWrnDragFeedback(container) {
  container.querySelectorAll('.dragging,.drop-before,.drop-after').forEach((node) => {
    node.classList.remove('dragging', 'drop-before', 'drop-after');
  });
}
```

특보 행에 `wrnItem` 클래스를 적용하고 `dragstart`, `dragover`, `dragleave`, `drop`, `dragend`에서 다음 규칙을 적용한다.

```js
const after = e.clientY >= d.getBoundingClientRect().top + d.getBoundingClientRect().height / 2;
clearWrnDragFeedback(w);
d.classList.add(after ? 'drop-after' : 'drop-before');
const to = wrnDropIndex(from, listIndex, after, list.length);
wrnOrder = moveWrnOrder(list.map(wrnKeyOf), from, to);
```

CSS는 `.wrnItem { position:relative; margin-bottom:6px }`, 위·아래 파란 3px 삽입선, 중앙 삼각형, `.dragging { opacity:.42 }`를 정의한다.

- [ ] **Step 4: 해당 테스트와 전체 회귀 테스트 실행**

Run: `node --test tests/warning-timeline-and-order.test.cjs`

Expected: 모든 테스트 PASS

Run: `node --test tests/*.test.cjs`

Expected: 모든 테스트 PASS

- [ ] **Step 5: 변경 검토 및 커밋**

```bash
git diff --check
git add index.html tests/warning-timeline-and-order.test.cjs
git commit -m "특보 드래그 위치 표시 개선"
```
