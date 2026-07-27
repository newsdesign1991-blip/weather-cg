# 관리자 공지 삭제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 비밀번호와 삭제 재확인을 거쳐 기본 공지와 관리자 작성 공지를 현재 브라우저에서 즉시 숨기고, 새로고침 후에도 그 상태를 유지한다.

**Architecture:** 기존 `index.html`의 공지 저장 구조를 유지하면서 삭제된 공지 ID를 localStorage의 별도 키에 저장한다. `allNotices()`가 이 ID를 제외하도록 만들고, 공지 카드의 삭제 버튼은 공통 삭제 함수로 연결한다. 테스트는 공지 스크립트를 VM에서 실제 실행하고 가짜 localStorage의 관찰 가능한 결과를 검증한다.

**Tech Stack:** 단일 HTML/CSS/JavaScript, Web Storage API, Node.js 내장 `node:test`, `vm`

## Global Constraints

- 기본 공지와 관리자 작성 공지를 모두 삭제 대상으로 한다.
- 삭제 결과는 현재 PC·브라우저에서 즉시 적용되고 새로고침 후에도 유지한다.
- 기존 관리자 비밀번호 `NOTICE_PW`를 재사용한다.
- 삭제 전 비밀번호 입력과 브라우저 확인 대화상자를 모두 거친다.
- 서버나 외부 의존성을 추가하지 않는다.
- GitHub 배포 파일의 기본 공지 원문은 제거하지 않는다.

---

### Task 1: 공지 삭제 저장 계약

**Files:**
- Create: `tests/notice-delete.test.cjs`
- Modify: `index.html:5735-5769`

**Interfaces:**
- Consumes: `SEED_NOTICES`, `authoredNotices()`, `NOTICE_SEEN_KEY`, `NOTICE_AUTH_KEY`
- Produces: `NOTICE_DELETED_KEY`, `deletedNoticeIds(): Set<string>`, `deleteNotice(id): boolean`

- [ ] **Step 1: 저장 동작의 실패 테스트 작성**

`tests/notice-delete.test.cjs`에서 `index.html`의 공지 블록을 VM으로 실행한다. 메모리 localStorage에 기본 공지 ID와 관리자 작성 공지를 준비한 뒤 다음을 실제 결과로 검증한다.

```js
test('deleting seed and authored notices persists their hidden state', () => {
  const seedId = context.allNotices()[0].id;
  storage.setItem('wcg_notices', JSON.stringify([
    { id: 'authored-1', date: '2026.07.27', title: '잘못된 공지', body: '<p>삭제</p>' },
  ]));

  assert.equal(context.deleteNotice(seedId), true);
  assert.equal(context.deleteNotice('authored-1'), true);
  assert.equal(context.allNotices().some((notice) => notice.id === seedId), false);
  assert.deepEqual(JSON.parse(storage.getItem('wcg_notices')), []);
  assert.deepEqual(
    new Set(JSON.parse(storage.getItem('wcg_notice_deleted'))),
    new Set([seedId, 'authored-1']),
  );
});
```

존재하지 않는 ID는 `false`를 반환하고 저장 내용을 바꾸지 않는 별도 테스트도 작성한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/notice-delete.test.cjs`

Expected: `deleteNotice is not a function` 또는 삭제 상태가 유지되지 않아 FAIL

- [ ] **Step 3: 최소 저장 로직 구현**

`index.html`의 공지 상수와 함수에 다음 계약을 구현한다.

```js
const NOTICE_DELETED_KEY = 'wcg_notice_deleted';

function deletedNoticeIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(NOTICE_DELETED_KEY) || '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : []);
  } catch (e) {
    return new Set();
  }
}

function allNotices() {
  const deleted = deletedNoticeIds();
  const map = {};
  for (const n of [...SEED_NOTICES, ...authoredNotices()])
    if (n && n.id && !deleted.has(n.id)) map[n.id] = n;
  return Object.values(map).sort((a, b) => (a.id < b.id ? 1 : -1));
}

function deleteNotice(id) {
  const exists = allNotices().some((notice) => notice.id === id);
  if (!exists) return false;
  localStorage.setItem(
    NOTICE_AUTH_KEY,
    JSON.stringify(authoredNotices().filter((notice) => notice && notice.id !== id)),
  );
  const deleted = deletedNoticeIds();
  deleted.add(id);
  localStorage.setItem(NOTICE_DELETED_KEY, JSON.stringify([...deleted]));
  const seen = noticeSeenSet();
  seen.delete(id);
  localStorage.setItem(NOTICE_SEEN_KEY, JSON.stringify([...seen]));
  updateNoticeDot();
  return true;
}
```

- [ ] **Step 4: 저장 동작 테스트 통과 확인**

Run: `node --test tests/notice-delete.test.cjs`

Expected: 모든 공지 삭제 저장 테스트 PASS

- [ ] **Step 5: 중간 커밋**

```powershell
git add -- index.html tests/notice-delete.test.cjs
git commit -m "feat: 공지 삭제 상태 저장"
```

### Task 2: 관리자 삭제 UI와 안전 확인

**Files:**
- Modify: `index.html:1013-1024`
- Modify: `index.html:5767-5791`
- Modify: `tests/notice-delete.test.cjs`

**Interfaces:**
- Consumes: `deleteNotice(id): boolean`, `NOTICE_PW`, `openNoticeHistory()`
- Produces: 공지별 `[data-notice-delete]` 버튼, `requestNoticeDelete(id): void`

- [ ] **Step 1: UI 흐름의 실패 테스트 작성**

VM 테스트 컨텍스트에 `prompt`, `confirm`, `flash`, `openNoticeHistory` 관찰 함수를 주입하고 다음 행위를 검증한다.

```js
test('admin confirmation deletes a notice and refreshes history', () => {
  promptValue = '7989';
  confirmValue = true;
  context.requestNoticeDelete('authored-1');

  assert.equal(context.allNotices().some((notice) => notice.id === 'authored-1'), false);
  assert.equal(historyOpenCount, 1);
  assert.equal(lastFlash, '공지를 삭제했어요');
});
```

잘못된 비밀번호와 확인 취소에서는 공지가 남고 목록을 다시 열지 않는 테스트를 각각 작성한다. `noticeItemHTML()` 결과에 공지 ID가 연결된 접근 가능한 삭제 버튼이 포함되는지도 검증한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/notice-delete.test.cjs`

Expected: `requestNoticeDelete is not a function` 또는 삭제 버튼 부재로 FAIL

- [ ] **Step 3: 최소 UI 구현**

공지 카드에 안전하게 인코딩한 ID를 가진 삭제 버튼을 넣는다.

```js
function noticeItemHTML(n) {
  const id = encodeURIComponent(String(n.id || ''));
  return `<div class="ntItem">...<button class="ntDelete" type="button" data-notice-delete="${id}" title="공지 삭제" aria-label="공지 삭제">...</button>...</div>`;
}
```

공지 목록 모달에서 이벤트 위임으로 버튼을 연결하고, 인증·재확인 함수를 추가한다.

```js
function requestNoticeDelete(id) {
  const pw = prompt('공지 삭제 비밀번호를 입력하세요');
  if (pw == null) return;
  if (pw !== NOTICE_PW) { flash('비밀번호가 틀립니다'); return; }
  if (!confirm('이 공지를 삭제할까요?')) return;
  if (!deleteNotice(id)) { flash('삭제할 공지를 찾지 못했어요'); return; }
  flash('공지를 삭제했어요');
  openNoticeHistory();
}
```

`openNoticeHistory()`의 본문 클릭 이벤트는 `[data-notice-delete]`를 찾아 `decodeURIComponent()`로 ID를 복원한 후 `requestNoticeDelete()`를 호출한다.

`.ntItem`은 `position: relative`와 오른쪽 패딩을 사용하고 `.ntDelete`에 빨간색 기본·호버·포커스 스타일을 추가한다.

- [ ] **Step 4: 전체 테스트와 구문 검사**

Run:

```powershell
node --test tests/notice-delete.test.cjs tests/vf-scale.test.cjs
```

Expected: 모든 테스트 PASS

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

Expected: 인라인 스크립트 4개 파싱, `git diff --check` 오류 없음

- [ ] **Step 5: 기능 커밋**

```powershell
git add -- index.html tests/notice-delete.test.cjs
git commit -m "feat: 관리자 공지 삭제 기능 추가"
```
