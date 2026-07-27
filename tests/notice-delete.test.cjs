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
  const context = {
    localStorage,
    console,
    $: () => null,
    prompt: () => null,
    confirm: () => false,
    flash: () => {},
    tossModal: () => { throw new Error('modal should not open in storage tests'); },
  };
  vm.createContext(context);
  vm.runInContext(noticeScript, context, { filename: 'notice-script.js' });
  return { context, localStorage };
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
