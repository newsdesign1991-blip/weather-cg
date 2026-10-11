// boot-check --eval 용 본문(async 함수 본문, return 으로 결과). tests/render-cancel.test.cjs 가 WCG_BOOT_CHECK=1 일 때 돌린다.
// 실제 앱에서 짧은 MP4·MXF 렌더를 시작해 몇 프레임 뒤 가리개의 [렌더 취소]·Esc로 멈춘다(10-12).
// 저장 창(showSaveFilePicker — 고르는 순간 빈 파일을 만드는 크로미움처럼)·헬퍼(fetch 가로채기)·워커는 가짜 — 사용자 헬퍼·파일에 닿지 않는다.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 30000, what = '') => { const t0 = performance.now(); while (!f()) { if (performance.now() - t0 > ms) throw new Error('시간 초과: ' + what); await sleep(10); } };
const q = (s) => document.querySelector(s);
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
const out = {};
const fsLog = { writes: 0, removed: 0 };
const caps = { frames: [], finalize: 0, cancel: [], sid: '' };
const origPicker = window.showSaveFilePicker, origFetch = window.fetch, origWorker = window.Worker, origRAF = window.renderAnimFrame;
let frames = 0;   // 렌더 중(_exportingFrames)에 그린 프레임 수
window.showSaveFilePicker = async (o) => ({
  name: (o && o.suggestedName) || 'out', getFile: async () => ({ size: 0 }), remove: async () => { fsLog.removed++; },
  createWritable: async () => ({ write: async () => { fsLog.writes++; }, close: async () => {} }),
});
window.fetch = async (url, opts) => {
  const u = String(url);
  if (/\/ping(\?|$)/.test(u)) return json({ ok: true, ff: true, ver: 20261009 });
  if (u.includes('/api/frame')) { const p = new URL(u).searchParams; caps.frames.push(+p.get('index')); caps.sid = p.get('sid'); return json({ ok: true }); }
  if (u.includes('/api/finalize')) { caps.finalize++; return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); }
  if (u.includes('/api/cancel')) { caps.cancel.push(new URL(u).searchParams.get('sid')); return json({ ok: true }); }
  return origFetch(url, opts);
};
window.renderAnimFrame = function (...a) { if (_exportingFrames) frames++; return origRAF.apply(this, a); };

const LEG = { on: 0, auto: 0, horiz: 0, x: 150, y: 560, box: 34, radius: 6, rowGap: 16, size: 34, weight: 600, txtCol: '#FFFFFF', gap: 18, items: [] };
const tyPts = [
  { lon: 137.2, lat: 19.4, label: '28일 03시', ws: 19, r15: 180, r25: 0, r70: 0, fcst: false },
  { lon: 136.3, lat: 20.6, label: '28일 15시', ws: 21, r15: 200, r25: 0, r70: 60, fcst: false },
  { lon: 135.0, lat: 22.3, label: '29일 03시', r15: 240, r25: 70, r70: 90, fcst: false },
  { lon: 133.4, lat: 24.2, label: '29일 15시', ws: 29, r15: 260, r25: 90, r70: 130, fcst: true },
  { lon: 131.7, lat: 26.0, label: '30일 03시', ws: 30, r15: 280, r25: 100, r70: 170, fcst: true },
];
const tyWork = (dur) => ({
  res: '1920x1080', style: 'typhoon', map: { x: 1160, y: 545, s: 1.02 }, labels: [], legend: LEG,
  typhoon: { name: '취소시험', issues: [{ tmfc: '', label: 't', points: tyPts }], sel: 0, places: [], nowIdx: 2, trackMode: 'full', lineWidth: 6, lineColor: '#00AAFF', iconCol: '#E5231E', iconScale: 1, labels: [] },
  anim: { dur, fps: 29.97, reveal: 'dissolve', blindSize: 8, blindAngle: -45, tracks: [] },
});
const openWork = async (work) => {
  const f = new File([JSON.stringify(work)], 'render-cancel.json', { type: 'application/json' });
  const dt = new DataTransfer(); dt.items.add(f);
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await sleep(1200);
};
const nOf = () => { const A = anim(); return Math.round(A.dur * A.fps); };
const btnState = () => { const b = q('#exportMask .emCancel'); return b ? { text: b.textContent, disabled: b.disabled } : null; };
const after = async (atClick, p, extra) => {
  await p;
  const total = frames;
  await sleep(450);   // 가리개 페이드아웃(.34초) 뒤 display:none
  const m = q('#exportMask');
  return Object.assign({
    atClick, after: total - atClick, total, exporting: _exportingFrames, cancelled: exportCancelled(),
    maskOn: m.classList.contains('on'), maskDisplay: getComputedStyle(m).display,
    status: q('#status').textContent, info: q('#tlInfo').textContent, writes: fsLog.writes, removed: fsLog.removed,
    bakeDisabled: q('#tlBake').disabled, closeBusy: closeBusyWhat(),
  }, extra);
};
const escKey = () => {
  if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.body.dispatchEvent(e);
  return e.defaultPrevented;
};

try {
  await openWork(tyWork(4));
  // 1) MP4 — 3프레임 그린 뒤 [렌더 취소] 클릭
  {
    const n = nOf(); frames = 0; fsLog.writes = 0; fsLog.removed = 0;
    const p = bakeMp4();
    await until(() => frames >= 3, 60000, 'MP4 3프레임');
    const atClick = frames;
    q('#exportMask .emCancel').click();
    const btn = btnState();
    q('#exportMask .emCancel').click();   // 두 번 눌러도 한 번
    out.mp4Click = await after(atClick, p, { n, btn });
  }
  // 2) MP4 — 새 렌더면 버튼이 원래대로. 토스 모달이 떠 있으면 Esc는 모달 닫기(렌더 계속), 다시 Esc = 렌더 취소
  {
    const n = nOf(); frames = 0; fsLog.writes = 0; fsLog.removed = 0;
    const p = bakeMp4();
    await until(() => frames >= 2, 60000, 'MP4 2프레임');
    const btnAtStart = btnState();
    tossModal({ title: '시험 팝업', bodyHTML: '렌더 중 위에 뜬 팝업', footHTML: '' });
    await sleep(60);
    const f0 = frames;
    const keyToModal = (() => { const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); (document.activeElement || document.body).dispatchEvent(e); return e.defaultPrevented; })();
    await sleep(80);
    const ov = q('#tossOv');
    const modalClosed = !ov || ov.classList.contains('popClosing');
    await until(() => frames > f0 + 1, 30000, '모달 Esc 뒤에도 렌더 계속');
    const stillRendering = _exportingFrames && !exportCancelled();
    await sleep(400);   // 모달 닫힘 애니메이션이 끝나게(닫히는 중 창은 Esc를 안 가져간다)
    const atClick = frames;
    const prevented = escKey();
    out.mp4Esc = await after(atClick, p, { n, btnAtStart, keyToModal, modalClosed, stillRendering, prevented });
  }
  // 3) MXF — 가짜 헬퍼·가짜 워커(받으면 바로 답) — 4프레임 뒤 클릭: 그 뒤 프레임 안 보냄, finalize 없음, /api/cancel?sid=
  {
    const workers = [], posted = [];
    // 진짜 워커처럼 끝낸(terminate) 뒤엔 답이 안 온다
    window.Worker = class { constructor() { this.t = false; workers.push(this); } postMessage(m) { posted.push(m.index); setTimeout(() => !this.t && this.onmessage && this.onmessage({ data: { index: m.index, ok: true } }), 5); } terminate() { this.t = true; } };
    const RF = 30000 / 1001, n = Math.max(1, Math.round(anim().dur * RF));
    frames = 0; fsLog.writes = 0; fsLog.removed = 0; caps.frames.length = 0; caps.finalize = 0; caps.cancel.length = 0;
    const p = wnsRender('mxf');
    await until(() => frames >= 4, 60000, 'MXF 4프레임');
    const atClick = frames;
    q('#exportMask .emCancel').click();
    const r = await after(atClick, p, { n });
    await sleep(50);
    out.mxf = Object.assign(r, { posted: posted.length, main: caps.frames.length, finalize: caps.finalize, cancel: caps.cancel.slice(), sid: caps.sid, terminated: workers.length > 0 && workers.every((w) => w.t) });
    window.Worker = origWorker;
  }
  // 4) 취소 뒤 다시 렌더하면 끝까지(취소 표시가 남지 않는다)
  {
    await openWork(tyWork(0.3));
    const n = nOf(); frames = 0; fsLog.writes = 0; fsLog.removed = 0;
    await bakeMp4();
    out.again = { n, total: frames, writes: fsLog.writes, status: q('#status').textContent, exporting: _exportingFrames };
  }
} catch (e) {
  out.error = String(e && e.stack || e);
} finally {
  window.showSaveFilePicker = origPicker; window.fetch = origFetch; window.Worker = origWorker; window.renderAnimFrame = origRAF;
}
return out;
