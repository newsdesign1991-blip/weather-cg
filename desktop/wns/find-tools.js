'use strict';
// 내장 WNS 서버가 쓸 도구(ffmpeg·SUITE 폰트 폴더) 위치 찾기 — 후보 경로를 앞에서부터 본다.
const fs = require('fs');
const path = require('path');

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };

// 기본 후보: desktop\helper → 파이썬 헬퍼 실행 사본 폴더 → 공용 R: 드라이브
function defaultFfmpegCandidates(desktopDir = path.resolve(__dirname, '..')) {
  const la = process.env.LOCALAPPDATA;
  return [
    path.join(desktopDir, 'helper', 'ffmpeg.exe'),
    la ? path.join(la, 'WNS_Helper', 'ffmpeg.exe') : null,
    'R:\\[F]_Util\\WNS\\ffmpeg.exe',
  ].filter(Boolean);
}

function defaultFontsCandidates(desktopDir = path.resolve(__dirname, '..')) {
  return [path.join(desktopDir, 'helper', 'fonts'), 'R:\\[F]_Util\\WNS\\fonts'];
}

// 환경변수 읽기(윈도는 이름 대소문자 무시)
function envGet(env, name) {
  if (env === process.env) return env[name];
  const k = Object.keys(env).find((x) => x.toUpperCase() === name.toUpperCase());
  return k === undefined ? undefined : env[k];
}
// ntpath.join(dir, f) — 정규화 없이 붙인다(파이썬 결과 문자열과 같게)
const ntJoin2 = (a, b) => (/^[\\/]/.test(b) || /^[A-Za-z]:/.test(b) ? b : (a && !/[\\/:]$/.test(a) ? a + '\\' : a) + b);

// PATH 에서 찾기 — 파이썬 3.13 shutil.which(윈도) 그대로:
//   현재 폴더 먼저(NoDefaultCurrentDirectoryInExePath 없으면), PATHEXT 확장자를 붙여 보고,
//   이름 그대로는 그 확장자가 PATHEXT 에 있을 때만 본다. PATH 항목의 따옴표는 벗기지 않는다(파이썬도 안 벗김).
function whichSync(cmd, env = process.env) {
  if (process.platform !== 'win32') {
    for (const dir of (envGet(env, 'PATH') || '').split(path.delimiter)) {
      const p = path.join(dir || '.', cmd);
      if (isFile(p)) return p;
    }
    return null;
  }
  const cut = Math.max(cmd.lastIndexOf('\\'), cmd.lastIndexOf('/'));
  let dirname = '', base = cmd;
  if (cut >= 0) { dirname = cmd.slice(0, cut) || cmd.slice(0, 1); base = cmd.slice(cut + 1); } else if (/^[A-Za-z]:/.test(cmd)) { dirname = cmd.slice(0, 2); base = cmd.slice(2); }
  let dirs;
  if (dirname) dirs = [dirname];
  else {
    let p = envGet(env, 'PATH');
    if (p === undefined) p = '.;C:\\bin';   // os.defpath
    if (!p) return null;
    dirs = p.split(';');
    if (envGet(env, 'NoDefaultCurrentDirectoryInExePath') === undefined) dirs.unshift('.');
  }
  const pathext = (envGet(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD;.VBS;.JS;.WS;.MSC').split(';').filter(Boolean);
  const files = pathext.map((e) => base + e);
  if (pathext.some((e) => base.toUpperCase().endsWith(e.toUpperCase()))) files.unshift(base);
  const seen = new Set();
  for (const dir of dirs) {
    const norm = dir.toLowerCase().replace(/\//g, '\\');
    if (seen.has(norm)) continue;
    seen.add(norm);
    for (const f of files) {
      const name = ntJoin2(dir, f);
      if (isFile(name)) return name;
    }
  }
  return null;
}

// 후보 중 처음 존재하는 ffmpeg. 없으면 o.usePath(기본 true)일 때 PATH, 그래도 없으면 null
function findFfmpeg(candidates = defaultFfmpegCandidates(), o = {}) {
  const hit = (candidates || []).find((p) => p && isFile(p));
  if (hit) return hit;
  return o.usePath === false ? null : whichSync('ffmpeg');
}

// 존재하는 폰트 폴더들(순서 유지) — 서버의 fontsDirs 로 그대로 넘긴다
function findFontsDirs(candidates = defaultFontsCandidates()) {
  return (candidates || []).filter((d) => d && isDir(d));
}

// 첫 존재 항목(파일·폴더 무관)
function findFirst(candidates) {
  return (candidates || []).find((p) => { try { return !!p && fs.existsSync(p); } catch (e) { return false; } }) || null;
}

module.exports = { findFfmpeg, findFontsDirs, findFirst, whichSync, defaultFfmpegCandidates, defaultFontsCandidates };
