# VF 배포 기본 스케일 복원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VF 첫 진입 전에 생성된 `100%` 라이브 값이 배포 기본 스케일을 덮어쓰지 않게 한다.

**Architecture:** 패널 UI 동기화에서 VF 여부를 먼저 판단하고, VF일 때만 상태를 쓰는 `vfScaleValue()`를 호출한다. 비-VF에서는 부작용 없는 표시값만 사용한다.

**Tech Stack:** 단일 HTML/JavaScript, Node.js `node:test`, `vm`

## Global Constraints

- 배포 기본값 `common=86`, `warnsea=83`을 유지한다.
- VF에서 사용자가 직접 조절한 값은 계속 유지한다.
- 비-VF 화면은 `vfScales`를 변경하지 않는다.
- 기존 자동저장에 남은 정확히 `100%`인 그룹 값만 한 번 제거하고 다른 작업 데이터는 보존한다.

---

### Task 1: 비-VF 패널 동기화의 상태 쓰기 제거

**Files:**
- Modify: `index.html:3653-3661`
- Modify: `tests/vf-scale.test.cjs`

- [ ] **Step 1: 실패 테스트 작성**

`syncPanelFromState()`의 VF 스케일 동기화 블록을 VM에서 실행해 `S.res='1920x1080'`일 때 `S.vfScales`가 비어 있는지 확인한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/vf-scale.test.cjs`

Expected: 비-VF 동기화가 `common:100`을 생성해 FAIL

- [ ] **Step 3: 최소 수정**

```js
const isVf = S.res === '1920x1080-vf';
const scale = isVf ? vfScaleValue() : clampVfScale(S.vfScale);
```

VF UI 표시 여부도 `isVf`를 사용한다.

- [ ] **Step 4: 전체 검증**

Run: `node --test tests/*.test.cjs`

Expected: 전체 PASS

Run: 인라인 스크립트 VM 파싱 및 `git diff --check`

- [ ] **Step 5: 커밋**

```powershell
git add -- index.html tests/vf-scale.test.cjs docs/superpowers
git commit -m "fix: VF 배포 기본 스케일 우선 적용"
```
