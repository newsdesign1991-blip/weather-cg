// tools/stamp-version.cjs — index.html의 js/·css/ 태그에 ?v=<파일 내용 md5 앞 8자리>를 찍는다(웹 캐시가 옛 파일을 섞지 않게).
//   node tools/stamp-version.cjs          갱신(바뀐 게 있으면 index.html 저장) — 배포(commit·push) 전에 꼭 돌린다
//   node tools/stamp-version.cjs --check  검사만(낡은 ?v= 가 있으면 목록 출력 후 종료코드 1)
// 해시는 CR을 지운 내용으로 잰다(작업트리 CRLF·저장소 LF 어느 쪽이든 같은 값 — 근무표 deploy.py chash와 같은 방식).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TAG = /((?:src|href)=")((?:js|css)\/[\w.-]+\.(?:js|css))(?:\?v=[^"]*)?(")/g;
const versionOf = (file) => crypto.createHash('md5').update(fs.readFileSync(file, 'utf8').replace(/\r/g, '')).digest('hex').slice(0, 8);

function stamp(html, root) {
  const stale = [], missing = [];
  const out = html.replace(TAG, (all, a, rel, z) => {
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) { missing.push(rel); return all; }
    const want = `${a}${rel}?v=${versionOf(fp)}${z}`;
    if (want !== all) stale.push(rel);
    return want;
  });
  return { out, stale, missing };
}

module.exports = { stamp, versionOf, TAG };

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const file = path.join(root, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const { out, stale, missing } = stamp(html, root);
  if (missing.length) { console.error('index.html이 가리키는 파일이 없음: ' + missing.join(', ')); process.exit(2); }
  if (process.argv.includes('--check')) {
    if (stale.length) { console.error('?v= 낡음: ' + stale.join(', ') + '\n→ node tools/stamp-version.cjs'); process.exit(1); }
    console.log('?v= 최신'); process.exit(0);
  }
  if (out !== html) fs.writeFileSync(file, out);
  console.log(stale.length ? '갱신: ' + stale.join(', ') : '바뀐 것 없음');
}
