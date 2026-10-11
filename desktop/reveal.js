// 렌더 결과 '폴더 열기'(2026-10-12) — 이 앱이 이번 실행에서 저장한 곳만 탐색기로 연다(main.js 'wcg:saved-path'·'wcg:reveal-path').
//
// 웹앱은 저장한 파일의 실제 경로를 모른다: 영상 저장 폴더(outDir)·이미지 폴더·저장창은 File System Access 핸들이라 이름만 준다.
// 그래서 메인이 두 가지를 기록해 두었다가(이번 실행 동안 메모리에만) 웹앱이 '방금 저장한 파일 이름'으로 물으면 경로를 찾아 준다.
//  ① File System Access 권한 확인 — session.setPermissionCheckHandler('fileSystem')에 경로가 같이 온다(Electron 44, 2026-10-12 실험으로 확인):
//     · 고른 폴더(영상 저장 폴더·이미지 폴더) = 그 폴더 경로. 그 안에 만든 하위 폴더·파일은 폴더 권한을 같이 쓰므로 폴더 경로만 온다.
//     · 저장창으로 고른 파일 = 그 파일 경로(쓰기 직전 확인).
//     쓰기 확인(fileAccessType 'writable')만 기록한다 — 읽으려고 연 파일(프로젝트 열기 등)은 빼려고.
//  ② 내려받기 완료(will-download → done 'completed') = 실제 저장 경로(데스크톱 내려받기는 저장창이 뜬다 — 이미지 ZIP 받기 등).
// 열기는 shell.showItemInFolder(그 폴더를 열고 파일을 골라 둔다)만 — 실행 파일을 여는 openPath는 쓰지 않는다.
// 허용: 실제로 있는 파일·폴더이면서 ① 저장창 파일 그 자체·① 고른 폴더(와 그 아래)·② 내려받은 파일.
'use strict';
const nodeFs = require('fs');
const nodePath = require('path');

const MAX_GRANTS = 300;      // 기록 상한(오래된 것부터 버림) — 한 실행에 고르는 폴더·파일 수는 많지 않다
const MAX_DOWNLOADS = 100;
const DL_SLACK_MS = 15000;   // 내려받기 시작(will-download)이 웹앱의 물음보다 조금 먼저 올 수 있다
const DL_WAIT_MAX = 15 * 60 * 1000;   // 내려받기 저장창에서 오래 고민해도(최대 15분) 기다린다
const NAME_MAX = 255;

// 파일·폴더 이름 하나(경로 조각 아님) — 구분자·'..'·제어 문자·빈 이름은 거절
function nameOk(s) {
  if (typeof s !== 'string' || !s || s.length > NAME_MAX) return false;
  if (s === '.' || s === '..' || /[\\/:*?"<>|\u0000-\u001f]/.test(s)) return false;
  return true;
}
// 이름 비교 — 윈도 파일 이름은 대소문자를 가리지 않는다. 한글은 조합형/완성형이 섞일 수 있어 NFC로
const fold = (s) => String(s || '').normalize('NFC').toLowerCase();

function createRevealRegistry(opt = {}) {
  const fs = opt.fs || nodeFs;
  const path = opt.path || nodePath;
  const now = opt.now || Date.now;
  const grants = new Map();   // 접은 경로 → { p, dir, t }
  const downloads = [];       // { name, t, state: 'progressing'|'completed'|'cancelled'|'interrupted', p }
  const waiters = new Set();  // 내려받기 끝을 기다리는 물음
  let seq = 0;                // 같은 밀리초 안의 순서(나중 확인이 앞)

  const key = (p) => fold(path.resolve(p)).replace(/[\\/]+$/, '');
  const stat = (p) => { try { return fs.statSync(p); } catch (e) { return null; } };
  const isFile = (p) => { const s = stat(p); return !!s && s.isFile(); };
  const absOk = (p) => typeof p === 'string' && p.length > 2 && p.length < 4096 && path.isAbsolute(p) && !/[\u0000-\u001f]/.test(p);
  // 폴더 이름 비교 — 드라이브 루트(R:\)는 이름이 비어 있어 핸들 이름(브라우저마다 'R:\'·'\' 등)과 느슨하게 맞춘다
  const dirNameIs = (p, want) => {
    const base = path.basename(p);
    if (base) return fold(base) === fold(want);
    const root = fold(path.parse(path.resolve(p)).root);
    const w = fold(want);
    return !w || w === '\\' || w === '/' || root === w || root.replace(/[\\/]+$/, '') === w.replace(/[\\/]+$/, '');
  };

  // ① File System Access 쓰기 권한 확인 — p는 고른 폴더 또는 저장창 파일
  function noteGrant(p, isDirectory) {
    if (!absOk(p)) return;
    const k = key(p);
    grants.delete(k);   // 다시 넣어 '최근' 순서로
    grants.set(k, { p: path.resolve(p), dir: !!isDirectory, t: now(), n: ++seq });
    while (grants.size > MAX_GRANTS) grants.delete(grants.keys().next().value);
  }
  // ② 내려받기 — 시작(state 'progressing')과 끝(같은 기록을 바꿈). 돌려주는 함수로 끝을 알린다
  function noteDownloadStart(name) {
    const rec = { name: String(name || ''), t: now(), n: ++seq, state: 'progressing', p: '' };
    downloads.push(rec);
    while (downloads.length > MAX_DOWNLOADS) downloads.shift();
    wake();
    return (state, savePath) => { rec.state = String(state || 'interrupted'); rec.p = absOk(savePath) ? path.resolve(savePath) : ''; wake(); };
  }
  function wake() { for (const w of [...waiters]) w(); }

  // 방금 저장한 파일 경로 찾기 — hint: { name, dir?(고른 폴더 핸들 이름), sub?: [하위 폴더 이름…] } 또는 { name, download: true }
  // 찾으면 경로, 못 찾으면 ''. 내려받기는 끝날 때까지 기다린다(waitMs — 최대 15분).
  function find(hint) {
    const h = hint && typeof hint === 'object' ? hint : {};
    const name = h.name;
    const sub = Array.isArray(h.sub) ? h.sub : [];
    if (!nameOk(name) || sub.length > 8 || !sub.every(nameOk)) return Promise.resolve('');
    if (h.download) return findDownload(name, Math.max(0, Math.min(DL_WAIT_MAX, +h.waitMs || 0)));
    return Promise.resolve(findSaved(name, h.dir, sub));
  }
  function findSaved(name, dir, sub) {
    const list = [...grants.values()].sort((a, b) => b.n - a.n);   // 최근 확인 먼저(방금 쓴 곳)
    if (dir != null && dir !== '') {
      if (typeof dir !== 'string' || dir.length > NAME_MAX) return '';
      const dirs = list.filter((g) => g.dir);
      // 이름이 맞는 고른 폴더(최근 것부터)에 그 파일이 실제로 있어야 — 이름이 다른 폴더로 넘겨짚지 않는다
      for (const g of dirs.filter((x) => dirNameIs(x.p, dir))) {
        const p = path.join(g.p, ...sub, name);
        if (isFile(p)) return p;
      }
      return '';
    }
    if (sub.length) return '';
    for (const g of list) if (!g.dir && fold(path.basename(g.p)) === fold(name) && isFile(g.p)) return g.p;
    return '';
  }
  function findDownload(name, waitMs) {
    const t0 = now() - DL_SLACK_MS;
    const pick = () => {
      const recs = downloads.filter((r) => r.t >= t0 && fold(r.name) === fold(name)).sort((a, b) => b.n - a.n);
      const r = recs[0];
      if (!r) return null;                                   // 아직 시작 전 — 기다림
      if (r.state === 'progressing') return null;
      return r.state === 'completed' && r.p && isFile(r.p) ? r.p : '';   // 취소·실패 = 없음
    };
    const first = pick();
    if (first !== null || !waitMs) return Promise.resolve(first || '');
    return new Promise((resolve) => {
      let timer = null;
      const w = () => { const v = pick(); if (v === null) return; done(v); };
      const done = (v) => { waiters.delete(w); clearTimeout(timer); resolve(v || ''); };
      waiters.add(w);
      timer = setTimeout(() => done(''), waitMs);
    });
  }

  // 열어도 되는 경로인가 — 실제로 있고, ① 저장창 파일 그 자체·① 고른 폴더(그 아래)·② 내려받은 파일
  function allowed(p) {
    if (!absOk(p)) return false;
    const st = stat(p);
    if (!st || !(st.isFile() || st.isDirectory())) return false;
    const k = key(p);
    for (const g of grants.values()) {
      const gk = key(g.p);
      if (k === gk) return true;
      if (g.dir && k.startsWith(gk + path.sep)) return true;   // 고른 폴더 아래 — 드라이브 루트(R:\)도: 열쇠는 끝 구분자를 떼서 'r:'
    }
    return downloads.some((r) => r.state === 'completed' && r.p && key(r.p) === k);
  }

  return { noteGrant, noteDownloadStart, find, allowed, _grants: grants, _downloads: downloads };
}

module.exports = { createRevealRegistry, nameOk };
