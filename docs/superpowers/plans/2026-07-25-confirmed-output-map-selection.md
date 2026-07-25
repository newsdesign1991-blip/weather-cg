# Confirmed Output and Map Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 출력 화면과 지도 종류를 후보 선택 후 적용하는 2단계 UI로 변경한다.

**Architecture:** `pendingRes`와 `pendingStyle`이 메뉴의 후보만 보관한다. 기존 실제 변경 코드는 적용 함수로 이동하고, 적용 성공 시 시작 안내 갱신과 메뉴 닫기를 수행한다.

**Tech Stack:** HTML, CSS, JavaScript, Node.js 내장 테스트 러너

## Global Constraints

- 메뉴를 열었을 때 현재값을 파란 후보로 표시하지 않는다.
- 카드 클릭은 후보만 변경한다.
- 적용 버튼만 실제 상태를 변경한다.
- 배치 저장과 배포 초기화를 시각적으로 분리한다.

---

### Task 1: 확인형 선택 UI

**Files:**
- Modify: `index.html`
- Modify: `tests/vf-scale.test.cjs`

**Interfaces:**
- Produces: `applyPendingRes()`, `applyPendingStyle()`
- Consumes: `pendingRes`, `pendingStyle`, `_closeMenu`, `markStartStep`

- [ ] 실패 테스트를 작성하고 실패를 확인한다.
- [ ] 후보 카드와 적용 버튼 마크업·스타일을 추가한다.
- [ ] 기존 즉시 적용 코드를 적용 함수로 이동한다.
- [ ] 시작 안내 완료를 적용 함수에서만 호출한다.
- [ ] 전체 테스트와 인라인 스크립트 구문을 검증한다.
- [ ] 기능을 커밋한다.
