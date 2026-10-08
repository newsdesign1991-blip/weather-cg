// tools/verify-split.cjs — 분할 커밋이 '텍스트 무변경'인지 git 객체에서 바로 증명한다(작업트리·셸 리디렉션을 안 거침).
//   node tools/verify-split.cjs <분할 전 커밋> <분할 커밋>      예) node tools/verify-split.cjs a6d0794 ae0343d
// 확인하는 것:
//   1) 두 커밋 사이에 바뀐 경로가 index.html · js/ · css/ 뿐인가
//   2) <분할 커밋>의 index.html·js/·css/를 OS 임시 폴더에 꺼내 tools/app-source.cjs로 합친 결과가
//      <분할 전 커밋>의 index.html과 바이트까지 같은가(저장소는 LF)
// 의미(동작)가 같은지는 이 도구가 아니라 부팅·스크린샷 비교로 확인한다(MODULES.md '분할 이력').
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const appSource = require('./app-source.cjs');

const [pre, post] = process.argv.slice(2);
if (!pre || !post) { console.error('사용: node tools/verify-split.cjs <분할 전 커밋> <분할 커밋>'); process.exit(2); }
const ROOT = path.resolve(__dirname, '..');
const git = (args, enc = 'utf8') => execFileSync('git', args, { cwd: ROOT, encoding: enc, maxBuffer: 1 << 28 });

const changed = git(['diff', '--name-only', pre, post]).split('\n').filter(Boolean);
const bad = changed.filter((p) => !(p === 'index.html' || /^(js|css)\//.test(p)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wcg-verify-'));
try {
  const files = git(['ls-tree', '-r', '--name-only', post, '--', 'index.html', 'js', 'css']).split('\n').filter(Boolean);
  for (const f of files) {
    const dst = path.join(tmp, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, git(['show', `${post}:${f}`], 'buffer'));
  }
  const want = git(['show', `${pre}:index.html`], 'buffer').toString('utf8');
  const got = appSource(path.join(tmp, 'index.html'));
  const same = got === want;
  let at = -1;
  if (!same) { at = 0; while (at < got.length && got[at] === want[at]) at++; }
  console.log(`바뀐 경로 ${changed.length}개 — index.html·js·css 밖: ${bad.length ? bad.join(', ') : '없음'}`);
  console.log(`appSource(${post}) ${same ? '===' : '!=='} ${pre}:index.html (${want.length}자)` + (same ? '' : ` — 첫 차이 @${at}: ${JSON.stringify(want.slice(at, at + 60))} / ${JSON.stringify(got.slice(at, at + 60))}`));
  process.exit(same && !bad.length ? 0 : 1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
