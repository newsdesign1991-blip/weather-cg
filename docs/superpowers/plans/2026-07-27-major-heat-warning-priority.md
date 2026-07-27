# Major Heat Warning Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폭염 중대경보가 폭염 경보보다 기본적으로 위에 표시되게 한다.

**Architecture:** 기존 특보 우선순위 산정 함수의 폭염 단계 순서만 조정한다. 사용자 드래그 순서는 기존 오버라이드 경로를 그대로 유지한다.

**Tech Stack:** 단일 HTML JavaScript, Node test runner

## Global Constraints

- 목록·범례·지도 레이어에 같은 기본 순서를 사용한다.
- 사용자 지정 순서는 기본값보다 우선한다.
- 다른 특보 순서는 바꾸지 않는다.

### Task 1: 기본 우선순위 변경

**Files:**
- Modify: `index.html`
- Modify: `tests/warning-timeline.test.cjs`

- [ ] 폭염 중대경보가 폭염 경보보다 높은 실패 테스트를 추가한다.
- [ ] 테스트가 기존 순서 때문에 실패하는지 확인한다.
- [ ] 기존 우선순위 표의 폭염 두 단계만 교체한다.
- [ ] 관련 테스트와 전체 테스트를 실행한다.
- [ ] 커밋하고 `origin/main`에 푸시한다.

