// tools/app-source.cjs — 나뉜 index.html(js/·css/)을 '분할 전 한 파일' 텍스트로 다시 합친다(테스트·검사·되돌리기용).
//   const appSource = require('../tools/app-source.cjs');   // 테스트에서(경로는 __dirname 기준으로)
//   const html = appSource(path.join(__dirname, '..', 'index.html'));
//   CLI: node tools/app-source.cjs [index.html] [--out=mono.html]   (기본: 표준출력 — PowerShell '>' 리디렉션은 UTF-16이 되니 --out을 쓴다)
//
// 규칙(tools/split-app.cjs의 정확한 역변환 — 결과는 분할 전 원본과 바이트까지 같다, 줄바꿈만 LF):
//  - 이어진 <script src="js/…"></script> 묶음(사이엔 공백만) 1개 → "<script>\n(() => {\n'use strict';\n" + 각 파일(머리 2줄 뺌) + "})();\n</script>"
//  - 이어진 <link rel="stylesheet" href="css/…"> 묶음 1개 → "<style>\n" + 각 파일(머리 1줄 뺌, url(../X) → url(X)) + "</style>"
//  - js 머리 = "/* [모듈] js/이름.js — 설명 */" + "'use strict';" 두 줄, css 머리 = "/* [모듈] css/이름.css — 설명 */" 한 줄. 형식이 다르면 throw
//  - ?v= 는 무시, 줄바꿈은 LF로 통일. 아직 한 파일(분할 전)이면 그대로(LF로만 바꿔) 돌려준다.
// 주의: 근무표(work schedule)의 swap-backend/app-source.cjs와 동작이 다르다(그쪽은 머리를 안 빼고 IIFE도 안 만든다). 서로 복사하지 말 것.
'use strict';
const fs = require('fs');
const path = require('path');

const JS_TAG = /<script src="(js\/[\w.-]+\.js)(?:\?[^"]*)?"><\/script>/g;
const CSS_TAG = /<link rel="stylesheet" href="(css\/[\w.-]+\.css)(?:\?[^"]*)?">/g;
const JS_HEAD = /^\/\* \[모듈\] (js\/[\w.-]+\.js) — [^\n]*\*\/\n'use strict';\n/;
const CSS_HEAD = /^\/\* \[모듈\] (css\/[\w.-]+\.css) — [^\n]*\*\/\n/;
const JS_OPEN = "<script>\n(() => {\n'use strict';\n", JS_CLOSE = '})();\n</script>';
const CSS_OPEN = '<style>\n', CSS_CLOSE = '</style>';
// css/ 안의 상대 url을 문서 기준으로 되돌림(split-app의 rebaseCss와 정확히 반대)
const unrebaseCss = (s) => s.replace(/(url\(\s*['"]?)\.\.\//gi, '$1');

function readModule(dir, rel, head) {
  const raw = fs.readFileSync(path.join(dir, rel), 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) throw new Error(`BOM 금지: ${rel}`);
  const s = raw.replace(/\r\n/g, '\n');
  const m = head.exec(s);
  if (!m) throw new Error(`머리 형식이 아님(첫 줄 '/* [모듈] ${rel} — … */'${head === JS_HEAD ? " + 둘째 줄 'use strict';" : ''}): ${rel}`);
  if (m[1] !== rel) throw new Error(`머리 주석의 파일 이름(${m[1]})이 실제(${rel})와 다름`);
  if (!s.endsWith('\n')) throw new Error(`파일 끝 줄바꿈 없음: ${rel}`);
  return s.slice(m[0].length);
}

function inlineGroup(html, dir, re, head, open, close, xform, kind) {
  const tags = [...html.matchAll(re)];
  if (!tags.length) return html;
  for (let i = 1; i < tags.length; i++) {
    const gap = html.slice(tags[i - 1].index + tags[i - 1][0].length, tags[i].index);
    if (!/^\s*$/.test(gap)) throw new Error(`${kind} 태그 묶음이 끊김(사이에 다른 내용): ${tags[i - 1][1]} … ${tags[i][1]}`);
  }
  const body = tags.map((m) => xform(readModule(dir, m[1], head))).join('');
  const a = tags[0].index, z = tags[tags.length - 1].index + tags[tags.length - 1][0].length;
  return html.slice(0, a) + open + body + close + html.slice(z);
}

function appSource(file) {
  const dir = path.dirname(path.resolve(file));
  const html = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const withJs = inlineGroup(html, dir, JS_TAG, JS_HEAD, JS_OPEN, JS_CLOSE, (s) => s, 'js');
  return inlineGroup(withJs, dir, CSS_TAG, CSS_HEAD, CSS_OPEN, CSS_CLOSE, unrebaseCss, 'css');
}

module.exports = appSource;
module.exports.appSource = appSource;
module.exports.unrebaseCss = unrebaseCss;
module.exports.JS_HEAD = JS_HEAD;
module.exports.CSS_HEAD = CSS_HEAD;

if (require.main === module) {
  const args = process.argv.slice(2);
  const src = args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'index.html');
  const out = (args.find((a) => a.startsWith('--out=')) || '').slice(6);
  const text = appSource(src);
  if (out) fs.writeFileSync(out, text); else process.stdout.write(text);
}
