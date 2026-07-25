# Deployment Default Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 배포 기본값이 기존 브라우저 작업과 개인 배치보다 한 번 우선 적용되게 한다.

**Architecture:** 기본값 객체의 지문을 로컬에 기록한다. 부팅 시 지문이 달라졌을 때만 기존 저장 키를 제거하고 현재 지문으로 갱신한다.

**Tech Stack:** JavaScript, localStorage, Node.js 내장 테스트 러너

## Global Constraints

- 배포 변경 시 `wcg_work`와 `wcg_presets`를 모두 초기화한다.
- 같은 배포본에서는 사용자 저장 데이터를 유지한다.
- 비어 있거나 로드에 실패한 기본값은 초기화 트리거로 쓰지 않는다.

---

### Task 1: 배포 기본값 지문과 초기화

**Files:**
- Modify: `index.html`
- Modify: `tests/vf-scale.test.cjs`

**Interfaces:**
- Produces: `preferUpdatedDeploymentDefaults(): boolean`
- Consumes: `window.WCG_DEFAULTS`, `localStorage`, `WORK_KEY`

- [ ] 실패 테스트를 작성하고 `node --test tests/vf-scale.test.cjs`로 실패를 확인한다.
- [ ] 결정적 지문 계산과 조건부 초기화를 최소 구현한다.
- [ ] 자동 작업 복원 전에 초기화 함수를 호출한다.
- [ ] 전체 테스트와 인라인 스크립트 문법 검사를 실행한다.
- [ ] `feat: 새 배포 기본값을 저장 작업보다 우선`으로 커밋한다.
