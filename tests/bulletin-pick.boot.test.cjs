const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path'), { execFileSync } = require('node:child_process');
test('통보문 목록에서 선택 후 바로 칠하기 — 실제 앱', { skip: !process.env.WCG_BOOT_CHECK, timeout: 150000 }, () => {
  const root = path.join(__dirname, '..');
  const raw = execFileSync(process.execPath, ['desktop/test/boot-check.cjs', root, '--wait=9000', '--size=1600x1000', '--keepalive', '--eval=' + path.join(__dirname, 'bulletin-pick.boot-eval.js')], { cwd: root, encoding: 'utf8', timeout: 140000 });
  const out = JSON.parse(raw.slice(raw.indexOf('{')));
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.evalResult?.ok, true, JSON.stringify(out.evalResult));
});
