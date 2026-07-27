const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const noticeStart = html.indexOf('const NOTICE_SEEN_KEY');
const noticeEnd = html.indexOf('function exportProgress(', noticeStart);
assert.notEqual(noticeStart, -1, 'notice script start must exist');
assert.notEqual(noticeEnd, -1, 'notice script end must exist');
const noticeScript = html.slice(noticeStart, noticeEnd);

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function createNoticeContext(initial = {}) {
  const localStorage = createStorage(initial);
  const controls = {
    promptValue: null,
    confirmValue: false,
    flashes: [],
    historyOpenCount: 0,
  };
  const context = {
    localStorage,
    console,
    $: () => null,
    prompt: () => controls.promptValue,
    confirm: () => controls.confirmValue,
    flash: (message) => controls.flashes.push(message),
    tossModal: () => { throw new Error('modal should not open in storage tests'); },
  };
  vm.createContext(context);
  vm.runInContext(noticeScript, context, { filename: 'notice-script.js' });
  context.openNoticeHistory = () => { controls.historyOpenCount += 1; };
  return { context, localStorage, controls };
}

test('deleting seed and authored notices persists their hidden state', () => {
  const { context, localStorage } = createNoticeContext();
  const seedId = context.allNotices()[0].id;
  localStorage.setItem('wcg_notices', JSON.stringify([
    { id: 'authored-1', date: '2026.07.27', title: '잘못된 공지', body: '<p>삭제</p>' },
  ]));

  assert.equal(context.deleteNotice(seedId), true);
  assert.equal(context.deleteNotice('authored-1'), true);
  assert.equal(context.allNotices().some((notice) => notice.id === seedId), false);
  assert.equal(context.allNotices().some((notice) => notice.id === 'authored-1'), false);
  assert.equal(localStorage.getItem('wcg_notices'), '[]');
  assert.deepEqual(
    new Set(JSON.parse(localStorage.getItem('wcg_notice_deleted'))),
    new Set([seedId, 'authored-1']),
  );
});

test('deleting an unknown notice leaves storage unchanged', () => {
  const initial = JSON.stringify([
    { id: 'authored-1', date: '2026.07.27', title: '남길 공지', body: '<p>유지</p>' },
  ]);
  const { context, localStorage } = createNoticeContext({ wcg_notices: initial });

  assert.equal(context.deleteNotice('missing-notice'), false);
  assert.equal(localStorage.getItem('wcg_notices'), initial);
  assert.equal(localStorage.getItem('wcg_notice_deleted'), null);
});

test('notice cards expose an accessible delete action for their notice id', () => {
  const { context } = createNoticeContext();
  const markup = context.noticeItemHTML({
    id: 'notice/id 1',
    date: '2026.07.27',
    title: '삭제 대상',
    body: '<p>본문</p>',
  });

  assert.match(markup, /data-notice-delete="notice%2Fid%201"/);
  assert.match(markup, /aria-label="공지 삭제"/);
});

test('admin confirmation deletes a notice and refreshes history', () => {
  const authored = JSON.stringify([
    { id: 'authored-1', date: '2026.07.27', title: '잘못된 공지', body: '<p>삭제</p>' },
  ]);
  const { context, controls } = createNoticeContext({ wcg_notices: authored });
  controls.promptValue = '7989';
  controls.confirmValue = true;

  context.requestNoticeDelete('authored-1');

  assert.equal(context.allNotices().some((notice) => notice.id === 'authored-1'), false);
  assert.equal(controls.historyOpenCount, 1);
  assert.deepEqual(controls.flashes, ['공지를 삭제했어요']);
});

test('wrong admin password does not delete a notice', () => {
  const authored = JSON.stringify([
    { id: 'authored-1', date: '2026.07.27', title: '남길 공지', body: '<p>유지</p>' },
  ]);
  const { context, controls } = createNoticeContext({ wcg_notices: authored });
  controls.promptValue = 'wrong';
  controls.confirmValue = true;

  context.requestNoticeDelete('authored-1');

  assert.equal(context.allNotices().some((notice) => notice.id === 'authored-1'), true);
  assert.equal(controls.historyOpenCount, 0);
  assert.deepEqual(controls.flashes, ['비밀번호가 틀립니다']);
});

test('cancelling delete confirmation keeps the notice', () => {
  const authored = JSON.stringify([
    { id: 'authored-1', date: '2026.07.27', title: '남길 공지', body: '<p>유지</p>' },
  ]);
  const { context, controls } = createNoticeContext({ wcg_notices: authored });
  controls.promptValue = '7989';
  controls.confirmValue = false;

  context.requestNoticeDelete('authored-1');

  assert.equal(context.allNotices().some((notice) => notice.id === 'authored-1'), true);
  assert.equal(controls.historyOpenCount, 0);
  assert.deepEqual(controls.flashes, []);
});
