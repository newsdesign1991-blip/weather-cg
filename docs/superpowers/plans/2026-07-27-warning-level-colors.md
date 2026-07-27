# 특보 단계별 독립 색상 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 특보 종류에서 정확한 단계명마다 독립적인 사용자 색상을 저장하고 적용한다.

**Architecture:** 기존 `wrnColors`의 종류별 주의보·경보 기본색은 호환용 폴백으로 유지한다. 새 `wrnLevelColors` 객체가 `특보종류|정확한단계명`별 사용자 색상을 보관하고, 모든 색 조회와 ‘들어온 특보’ 편집은 공통 키 함수와 조회·설정 함수를 사용한다.

**Tech Stack:** 단일 HTML/CSS/JavaScript, Node.js 내장 `node:test`, `vm`

## Global Constraints

- `폭염 경보`와 `폭염 중대경보`는 서로 다른 색을 저장한다.
- 모든 특보 종류와 미래의 새로운 단계명에도 같은 규칙을 적용한다.
- 기존 프로젝트·자동저장·배포 기본값의 `wrnColors`와 호환한다.
- 기존 종류별 주의보·경보 색 편집은 단계별 색이 없을 때의 폴백으로 유지한다.
- 특보 겹침 우선순위는 변경하지 않는다.

---

### Task 1: 정확한 특보 단계 색상 계약

**Files:**
- Create: `tests/warning-level-colors.test.cjs`
- Modify: `index.html:1798-1851`
- Modify: `index.html:4321-4327`

**Interfaces:**
- Consumes: `S.wrnColors`, `wrnKeyOf({wrn, lvl})`
- Produces: `S.wrnLevelColors: Record<string,string>`, `wrnColorKey(wrn,lvl): string`, `wrnColorOf(wrn,lvl): string|null`, `setWrnLevelColor(wrn,lvl,color): void`

- [ ] **Step 1: 실패 테스트 작성**

`tests/warning-level-colors.test.cjs`가 `index.html`에서 `WRN_COLORS`, `DEFAULTS`, 특보 색 함수 블록을 VM으로 실행하게 한다. 다음 실제 동작을 검증한다.

```js
test('warning and major warning colors are independently stored', () => {
  context.setWrnLevelColor('폭염', '경보', '#AA0000');
  context.setWrnLevelColor('폭염', '중대경보', '#550000');

  assert.equal(context.wrnColorOf('폭염', '경보'), '#AA0000');
  assert.equal(context.wrnColorOf('폭염', '중대경보'), '#550000');
});
```

호우·대설·한파 등 표 기반 입력에도 `종류|정확한단계` 키가 각각 생성되는지 확인한다. 단계별 색이 없을 때 주의보는 `wrnColors[type][0]`, 경보 포함 단계는 `wrnColors[type][1]`을 반환하는 호환 테스트를 추가한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/warning-level-colors.test.cjs`

Expected: `setWrnLevelColor is not a function`으로 FAIL

- [ ] **Step 3: 최소 상태·조회·설정 로직 구현**

`DEFAULTS()`에 빈 단계별 색 객체를 추가한다.

```js
wrnColors: JSON.parse(JSON.stringify(WRN_COLORS)),
wrnLevelColors: {},
```

정확한 단계 키와 안전한 조회·설정을 구현한다.

```js
const wrnColorKey = (wrn, lvl) => String(wrn || '') + '|' + String(lvl || '');

function wrnColorOf(wrn, lvl) {
  const levelColors = S.wrnLevelColors && typeof S.wrnLevelColors === 'object'
    ? S.wrnLevelColors : (S.wrnLevelColors = {});
  const exact = levelColors[wrnColorKey(wrn, lvl)];
  if (hex(exact)) return exact.toUpperCase();
  const defaults = S.wrnColors[wrn];
  if (!defaults) return null;
  return /경보/.test(lvl) ? defaults[1] : defaults[0];
}

function setWrnLevelColor(wrn, lvl, color) {
  const value = hex(color);
  if (!value) return false;
  if (!S.wrnLevelColors || typeof S.wrnLevelColors !== 'object') S.wrnLevelColors = {};
  S.wrnLevelColors[wrnColorKey(wrn, lvl)] = value;
  return true;
}
```

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `node --test tests/warning-level-colors.test.cjs`

Expected: 모든 단계별 저장·폴백 테스트 PASS

### Task 2: 들어온 특보 편집과 프리셋 저장 연결

**Files:**
- Modify: `index.html:4490-4522`
- Modify: `index.html:5354-5364`
- Modify: `tests/warning-level-colors.test.cjs`

**Interfaces:**
- Consumes: `setWrnLevelColor(wrn,lvl,color)`, `wrnColorOf(wrn,lvl)`
- Produces: 단계별 색상 편집 이벤트, `PRESET_KEYS`의 `wrnLevelColors`

- [ ] **Step 1: 실패 테스트 작성**

간단한 가짜 DOM으로 `buildWrnList()`를 실행해 `폭염 경보` 색 입력을 변경한 뒤 `폭염 중대경보`가 기존 색을 유지하는지 검증한다. 또한 `PRESET_KEYS`에 `wrnLevelColors`가 들어가는지 확인한다.

```js
test('incoming warning editor changes only its exact warning level', () => {
  context.setWrnLevelColor('폭염', '중대경보', '#550000');
  context.setWrnLevelColor('폭염', '경보', '#AA0000');
  assert.equal(context.wrnColorOf('폭염', '중대경보'), '#550000');
  assert.equal(context.wrnColorOf('폭염', '경보'), '#AA0000');
});
```

편집 핸들러가 배열 인덱스를 직접 쓰지 않고 `setWrnLevelColor(a.wrn, a.lvl, ...)`를 호출하는지, 실제 이벤트를 통해 상태 결과로 검증한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/warning-level-colors.test.cjs`

Expected: 편집 후 두 단계가 같은 색이 되거나 프리셋 키가 없어 FAIL

- [ ] **Step 3: 편집 핸들러와 프리셋 구현**

`buildWrnList()`의 색 입력 이벤트에서 기존 배열 인덱스 쓰기를 제거하고 다음을 사용한다.

```js
ci.oninput = (e) => {
  pushUndo('wrncol' + key);
  setWrnLevelColor(a.wrn, a.lvl, e.target.value);
  paintWrn();
  renderLegend();
};
```

`PRESET_KEYS`에 `wrnLevelColors`를 추가해 화면 기본값 저장과 굽기에 포함한다.

- [ ] **Step 4: 전체 검증**

Run:

```powershell
node --test tests/*.test.cjs
```

Expected: 공지 삭제 6개, VF 11개, 단계별 특보 색상 테스트 모두 PASS

Run:

```powershell
@'
const fs=require('fs'); const vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match)=>match[1]).filter((script)=>script.trim());
scripts.forEach((script,index)=>new vm.Script(script,{filename:`index-inline-${index+1}.js`}));
console.log(`inline scripts parsed: ${scripts.length}`);
'@ | node -
git diff --check
```

Expected: 인라인 스크립트 4개 파싱, diff 오류 없음

- [ ] **Step 5: 커밋**

```powershell
git add -- index.html tests/warning-level-colors.test.cjs
git commit -m "fix: 특보 단계별 색상 독립 저장"
```
