/* [모듈] js/export-video.js — 정확 MP4(베이킹)·PNG 시퀀스, 로컬 헬퍼(WNS) 연결·상태(렌치 빨간 점·기능 확장팩 줄)·렌더(wnsRender) */
'use strict';

// ===== 정확 MP4 (베이킹) =====
// MediaRecorder는 실시간이라 렌더가 느리면 영상이 길어진다. 여기선 WebCodecs VideoEncoder로
// 프레임을 하나씩 '정확한 타임스탬프'에 인코딩하고, 아래 buildMp4로 직접 MP4에 담는다.
// 렌더가 아무리 느려도 길이는 정확히 (프레임수 / fps) 가 된다.
function buildMp4(W, H, timescale, frameDur, samples, avcc) {
  const u8 = (...a) => new Uint8Array(a);
  const u16 = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n); return b; };
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return b; };
  const str = (s) => new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));
  const cat = (arrs) => { let L = 0; for (const a of arrs) L += a.byteLength; const o = new Uint8Array(L); let p = 0; for (const a of arrs) { o.set(a, p); p += a.byteLength; } return o; };
  const box = (type, ...parts) => { const body = cat(parts); return cat([u32(body.byteLength + 8), str(type), body]); };
  const fbox = (type, ver, flags, ...parts) => box(type, u8(ver), u8((flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...parts);
  const MAT = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

  const cnt = samples.length, duration = cnt * frameDur;
  const mdatData = cat(samples.map((s) => s.data));
  const sizes = samples.map((s) => s.data.byteLength);
  const keys = []; samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });

  const ftyp = box('ftyp', str('isom'), u32(0x200), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  const mdat = box('mdat', mdatData);
  const mdatOffset = ftyp.byteLength + 8;   // 샘플 데이터 시작 = ftyp 뒤 mdat 헤더(8) 다음

  const avc1 = box('avc1',
    u8(0, 0, 0, 0, 0, 0), u16(1),
    u16(0), u16(0), u32(0), u32(0), u32(0),
    u16(W), u16(H), u32(0x00480000), u32(0x00480000), u32(0),
    u16(1), new Uint8Array(32), u16(0x18), u16(0xFFFF),
    box('avcC', avcc));
  const stsd = fbox('stsd', 0, 0, u32(1), avc1);
  const stts = fbox('stts', 0, 0, u32(1), u32(cnt), u32(frameDur));
  const stss = fbox('stss', 0, 0, u32(keys.length), cat(keys.map(u32)));
  const stsc = fbox('stsc', 0, 0, u32(1), u32(1), u32(cnt), u32(1));
  const stsz = fbox('stsz', 0, 0, u32(0), u32(cnt), cat(sizes.map(u32)));
  const stco = fbox('stco', 0, 0, u32(1), u32(mdatOffset));
  const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco);
  const minf = box('minf', fbox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), box('dinf', fbox('dref', 0, 0, u32(1), fbox('url ', 0, 1))), stbl);
  const mdhd = fbox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55C4), u16(0));
  const hdlr = fbox('hdlr', 0, 0, u32(0), str('vide'), u32(0), u32(0), u32(0), str('VideoHandler\0'));
  const mdia = box('mdia', mdhd, hdlr, minf);
  const tkhd = fbox('tkhd', 0, 7, u32(0), u32(0), u32(1), u32(0), u32(duration), u32(0), u32(0), u16(0), u16(0), u16(0), u16(0), MAT, u32(W * 65536), u32(H * 65536));
  const trak = box('trak', tkhd, mdia);
  const mvhd = fbox('mvhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0), MAT, u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), u32(2));
  const moov = box('moov', mvhd, trak);
  return new Blob([ftyp, mdat, moov], { type: 'video/mp4' });
}

async function bakeMp4() {
  if (S.res === '1920x1080-vf') { status('노말 VF의 MOV(알파) 렌더는 아직 준비 중입니다 — "PNG 시퀀스로 렌더"를 쓰세요', true); return; }
  const A = anim();
  if (!hasAnim()) { status('트랙이 없습니다 — 자동 구성을 먼저 누르세요', true); return; }
  if (typeof VideoEncoder === 'undefined') { status('이 브라우저는 WebCodecs 인코딩을 지원 안 합니다 — 크롬 최신판을 쓰세요', true); return; }
  animStop();
  const [W, H] = RES[S.res].size;
  const fps = A.fps, n = Math.round(A.dur * fps);
  const df = Math.abs(fps - Math.round(fps)) > 0.001;           // 29.97 같은 드롭프레임
  const timescale = Math.round(fps) * 1000, frameDur = df ? 1001 : 1000;
  const codec = (W * H > 1920 * 1080) ? 'avc1.640033' : 'avc1.640028';   // 큰 해상도는 High@5.1
  const vf = S.res === '1920x1080-vf';                 // VF는 .mov로 뽑는다(컨테이너만 QuickTime, 코덱은 동일 H.264)
  const ext = vf ? 'mov' : 'mp4', mime = vf ? 'video/quicktime' : 'video/mp4', vlabel = vf ? 'MOV' : 'MP4';
  const tag = S.res === '2158x1214' ? 'touch' : vf ? 'vf' : 'normal';
  const fileName = `${dateTag()}.${ext}`;
  // 저장 대상을 '렌더 전에' 준비 — 저장 폴더(R:\Upload 등)면 바로쓰기, 아니면 저장창/다운로드. 취소면 렌더 안 함.
  const out = await prepareOutput(dateTag(), ext, mime, `${vlabel} 영상`);
  if (!out) return;
  const btn = $('#tlBake'); if (btn) btn.disabled = true;
  // 작업 중 효과(js/busy-fx.js) — 누른 버튼 + 제목줄 '영상으로 추출'(진행 막대). 가리개(#exportMask)의 흐름은 CSS. 실패해도 finally에서 끈다
  const fx = [btn, '#tlToggle']; let saved = false;

  const samples = []; let avcc = null, encErr = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (!avcc && meta && meta.decoderConfig && meta.decoderConfig.description) avcc = new Uint8Array(meta.decoderConfig.description);
      const buf = new Uint8Array(chunk.byteLength); chunk.copyTo(buf);
      samples.push({ data: buf, key: chunk.type === 'key' });
    },
    error: (e) => { encErr = e; },
  });
  encoder.configure({ codec, width: W, height: H, bitrate: 30e6, framerate: Math.round(fps), latencyMode: 'realtime', avc: { format: 'avc' } });

  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const cx = c.getContext('2d', { alpha: false });
  const t0 = performance.now();
  _exportingFrames = true; showExportMask(true);
  fxBusy(fx, true);   // try 바로 앞 — 끄는 finally와 짝이 어긋나지 않게
  try {
    for (let i = 0; i < n; i++) {
      if (encErr) throw encErr;
      renderAnimFrame(i / fps);
      await drawExportFrame(cx, W, H);
      const frame = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: i % (Math.round(fps) * 2) === 0 });
      frame.close();
      exportProgress(i + 1, n, 'MP4 만드는 중');
      while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 4));
    }
    await encoder.flush();
    encoder.close();
    if (encErr) throw encErr;
    if (!avcc) throw new Error('디코더 설정(avcC)을 못 받았습니다');
    const blob = buildMp4(W, H, timescale, frameDur, samples, avcc);
    await out.write(await blob.arrayBuffer()); const name = out.name;   // 저장 폴더/저장창/다운로드 (prepareOutput)
    const secs = (n * frameDur / timescale).toFixed(2), real = ((performance.now() - t0) / 1000).toFixed(1);
    $('#tlInfo').textContent = `${vlabel} 저장됨: ${name} · ${n}프레임 = ${secs}초 (굽는데 ${real}초)`;
    status(`${vlabel} 저장 완료 · ${name} · 정확히 ${secs}초`);
    flashDone('영상 저장 완료'); saved = true;
  } catch (e) {
    status(`${vlabel} 저장 실패: ` + (e.message || e), true); $('#tlInfo').textContent = `${vlabel} 저장 실패`;
  } finally {
    fxBusy(fx, false);
    if (btn) btn.disabled = false;
    animOff();
    if (saved) fxArrive(['#tlToggle', btn, $('#tlInfo')]);   // 도착 — 버튼에 한 번 빛 + 저장 안내 줄이 떠오름
    if (typeof tlRefreshPreview === 'function') tlRefreshPreview();   // 타임라인이 열려 있으면 재생헤드 시각 프레임으로 돌아간다
  }
}

// PNG 시퀀스. MediaRecorder와 달리 벽시계와 무관해서 프레임이 정확하다.
// 느려도 상관없다 — 한 장씩 확실히 뽑아 편집 툴(프리미어/AE)에서 fps 지정해 합친다.
async function exportPngSeq() {
  const A = anim();
  if (!hasAnim()) { status('트랙이 없습니다 — 자동 구성을 먼저 누르세요', true); return; }
  const [W, H] = RES[S.res].size;
  const n = Math.round(A.dur * A.fps);
  const vf = S.res === '1920x1080-vf';   // VF는 투명(알파) PNG로 뽑아 AE에서 QuickTime Animation(RGB+Alpha)로 렌더
  const tag = S.res === '2158x1214' ? 'touch' : vf ? 'vf_alpha' : 'normal';
  const defName = `${dateTag()}`;

  // 저장 대상을 '렌더 전에' 준비 — 저장 폴더(R:\Upload 등)면 바로쓰기, 아니면 저장창/다운로드. 취소면 렌더 안 함.
  const out = await prepareOutput(defName, 'zip', 'application/zip', 'PNG 시퀀스(zip)');
  if (!out) return;

  animStop();
  _exportingFrames = true; showExportMask(true);
  const btn = $('#tlExportPng');
  btn.disabled = true;
  const fx = [btn, '#tlToggle']; let saved = false;   // 작업 중 효과(js/busy-fx.js) — bakeMp4와 같게
  fxBusy(fx, true);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const cx = c.getContext('2d', { alpha: vf });   // VF만 투명 배경
  const zipFrames = [];
  try {
    for (let i = 0; i <= n; i++) {
      renderAnimFrame(i / A.fps);
      await drawExportFrame(cx, W, H);            // 카메라 3D면 지도만 워프+오버레이 평면 합성
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      zipFrames.push({ name: `${defName}_${String(i).padStart(4, '0')}.png`, data: await blobBytes(blob) });
      exportProgress(i, n, 'PNG 프레임 만드는 중');
    }
    const zip = zipStore(zipFrames);
    await out.write(zip); const where = out.name;
    $('#tlInfo').textContent = `${n + 1}장을 ${where} 에 저장 — 압축 풀어 ${A.fps}fps로 합치세요`;
    status(`PNG ${n + 1}장 저장 완료 → ${where}`);
    flashDone('PNG 시퀀스 저장 완료'); saved = true;
  } catch (e) {
    status('PNG 저장 실패: ' + (e.message || e), true); $('#tlInfo').textContent = 'PNG 저장 실패';
  } finally {
    fxBusy(fx, false);
    btn.disabled = false;
    animOff();
    if (saved) fxArrive(['#tlToggle', btn, $('#tlInfo')]);
    if (typeof tlRefreshPreview === 'function') tlRefreshPreview();   // 타임라인이 열려 있으면 재생헤드 시각 프레임으로 돌아간다
  }
}

// ── WNS 렌더 헬퍼로 MXF / 알파 MOV 추출 ──
// R:\[F]_Util\WNS 의 WNS_START 로 켜둔 로컬 헬퍼(localhost:3720)에 프레임을 보내 ffmpeg 로 인코딩한다.
// 파이썬/설치 없이(헬퍼는 컴파일 exe), 저장 위치는 '저장폴더' 칸으로 지정. 헬퍼가 그 PC 기준으로 파일을 만든다.
// 데스크톱 앱(Electron)이면 앱에 내장된 헬퍼 주소를 쓴다(preload가 알려줌). 웹판은 그대로 WNS_START 헬퍼(3720).
const WNS_HELPER = (window.wcgDesktop && window.wcgDesktop.helperUrl) || 'http://127.0.0.1:3720';
const WNS_DESKTOP = !!(window.wcgDesktop && window.wcgDesktop.isDesktop);
// 이 버전 미만(또는 ver 필드가 없는 옛 헬퍼)이면 '구버전'으로 보고 업데이트 안내를 띄운다.
// 헬퍼(helper.py)를 새로 빌드·배포할 때 HELPER_VER 와 이 값을 함께 올린다.
const HELPER_VER_MIN = 20261007;   // 20261007: 태풍 라인모드·선 굵기/색·noIcon·과거아이콘 30% 리깅 + fontsOk 응답 + 보안 보강
// 헬퍼 상태: {up, ver, old}. old=켜져 있지만 구버전(ver 없음 또는 < MIN).
async function pingHelper() {
  try {
    const r = await fetch(WNS_HELPER + '/ping', { cache: 'no-store' });
    if (!r.ok) return { up: false, ver: 0, old: false };
    const j = await r.json().catch(() => ({}));
    const ver = +(j.ver || 0);
    return { up: true, ver, old: ver < HELPER_VER_MIN };
  } catch (e) { return { up: false, ver: 0, old: false }; }
}
// 헬퍼 상태를 화면에 반영 — 제목줄 렌치(설정) 버튼의 빨간 점(구버전, 웹판만) + 설정 메뉴 맨 아래 '기능 확장팩' 한 줄.
// 데스크톱 앱은 확장팩이 앱에 내장이라 점을 띄우지 않고, 한 줄도 '앱에 내장됨'만(누를 것 없음).
const HELPER_BTN_TIP = '설정 — 배치·설정 옮기기';
function applyHelperState(st) {
  const b = $('#helperBtn');
  if (b) {
    const dot = !WNS_DESKTOP && st.up && st.old;
    b.classList.toggle('hasNew', dot);
    // 빨간 점이 무슨 뜻인지 렌치에 마우스만 올려도 알 수 있게 — 점이 없어지면 원래 문구로 되돌린다
    const tip = dot ? '설정 — 기능 확장팩 구버전: 메뉴 맨 아래에서 다시 실행' : HELPER_BTN_TIP;
    b.title = tip; b.setAttribute('aria-label', tip);
  }
  const row = $('#helperRow'); if (!row) return;
  const k = !st.up ? 'off' : st.old ? 'old' : 'ok';
  let html, act = null;
  if (WNS_DESKTOP) {
    html = st.up ? '렌더·불러오기 기능 · <b>앱에 내장됨</b>' : '렌더·불러오기 기능 <b>응답 없음</b> — 앱 다시 실행 안내';
    if (!st.up) act = () => wnsHelperOffNotice('off');
  } else {
    html = k === 'ok' ? `기능 확장팩 · <b>실행 중</b> · 버전 ${st.ver}`
      : k === 'old' ? `기능 확장팩 · <b>구버전</b>(${st.ver || '버전 없음'}) — 다시 실행 방법`
      : '기능 확장팩 · <b>꺼져 있음</b> — 켜는 방법';
    if (k !== 'ok') act = showHelperStatus;   // 꺼짐·구버전 → 기존 헬퍼 안내(켜는 방법 / 다시 실행)
  }
  row.dataset.st = (WNS_DESKTOP && st.up) ? 'ok' : k;
  row.querySelector('.hrText').innerHTML = html;
  row.classList.toggle('static', !act);
  row.setAttribute('aria-disabled', act ? 'false' : 'true');
  row.onclick = act ? () => { if (_closeMenu) _closeMenu(); act(); } : null;
}
// 설정(렌치) 메뉴를 열 때마다 다시 확인 — 마지막 상태를 보여 둔 채로 갱신한다.
async function refreshHelperRow() {
  const row = $('#helperRow');
  if (row && !row.dataset.st) row.querySelector('.hrText').textContent = '기능 확장팩 확인 중…';
  applyHelperState(await pingHelper());
}
// 부팅 때 한 번 확인 — 구버전 헬퍼가 켜져 있으면 렌치(설정) 버튼에 빨간 점(웹판만) + (세션당 1회) 안내 팝업.
async function checkHelperFreshOnBoot() {
  const st = await pingHelper();
  applyHelperState(st);
  if (st.up && st.old && !sessionStorage.getItem('wcg_helper_old_seen')) {
    sessionStorage.setItem('wcg_helper_old_seen', '1');
    // 공지 팝업 등 다른 토스 모달이 떠 있으면 그게 닫힌 뒤에 띄운다(덮어써서 공지를 못 읽는 일 방지)
    const show = () => { if (typeof wnsHelperOffNotice === 'function') wnsHelperOffNotice('old'); };
    if (!document.getElementById('tossOv')) show();
    else { const t = setInterval(() => { if (!document.getElementById('tossOv')) { clearInterval(t); show(); } }, 400); }
  }
}
// 깃헙(https) 배포본에서도 로컬 헬퍼(127.0.0.1)는 호출 가능하다(브라우저가 localhost는 예외 허용).
// 그래서 해상도만 맞으면 항상 버튼을 보인다. 헬퍼가 꺼져 있으면 누를 때 안내 팝업이 뜬다.
// 두 버튼은 타임라인 영상 렌더 묶음(#tlRender — MP4·PNG 시퀀스와 한 세그먼트) 안에 있다. 묶음은 숨기지 않는다 —
// 숨은 버튼은 칸이 안 생겨 보이는 버튼끼리 저절로 이어 붙는다(css/timeline.css .tlRender).
function updateWnsButtons() {
  const showMxf = S.res === '1920x1080';       // 노말 CG → MXF (방송 송출용)
  const showMov = S.res === '1920x1080-vf';    // 노말 VF → 알파 MOV (오버레이용)
  if ($('#wnsMxf')) $('#wnsMxf').style.display = showMxf ? '' : 'none';
  if ($('#wnsMov')) $('#wnsMov').style.display = showMov ? '' : 'none';
}
// 헬퍼가 꺼져 있을 때 크게 보여주는 안내 (토스 카드)
// mode='old': 켜져 있지만 구버전. ctx='kma': 기상청 불러오기가 그 때문에 막힌 상황(결과 카드에서 엶) — '지금도 쓸 수 있어요'라고 하지 않는다.
function wnsHelperOffNotice(mode, ctx) {
  const old = mode === 'old';   // old=기능 확장팩이 켜져 있지만 구버전 → '다시 실행'(웹) / '앱 업데이트'(데스크톱) 안내
  const kma = ctx === 'kma';
  if (WNS_DESKTOP) {   // 데스크톱 앱: 확장팩이 앱에 내장돼 따로 켤 필요가 없다 → 재시작(꺼짐) / 앱 업데이트(구버전) 안내
    const dm = tossModal(old
      ? {
        title: '앱을 최신 버전으로 업데이트해 주세요', sub: '데스크톱 앱 · 내장 기능 확장팩이 옛 버전',
        tone: 'red',
        bodyHTML: `이 데스크톱 앱에 들어 있는 기능 확장팩이 <b>옛 버전</b>이라 ${kma ? '<b>기상청 불러오기</b>가 안 돼요' : '새 기능 일부가 안 될 수 있어요'}.<br><br>`
          + '<b>최신 설치 파일</b>로 앱을 다시 설치(업데이트)한 뒤 다시 눌러 주세요. 다시 실행만으로는 바뀌지 않아요.'
          + (kma ? '<br><br>그동안은 특보 칸의 <b>‘자동이 안 될 때’</b>를 펼쳐(결과 카드의 ‘직접 붙여넣기’) <b>‘기상청 특보현황 새 창으로 열기’</b> → 전체 복사 → 붙여넣기로 칠할 수 있어요.' : ''),
        footHTML: '<button class="tossBtn ghost" data-ok>닫기</button>',
      }
      : {
        title: '내장 기능 확장팩이 응답하지 않아요', sub: '데스크톱 앱 · 기상청 불러오기 · MXF/MOV · AE',
        tone: 'red',
        bodyHTML: '데스크톱 앱에는 기능 확장팩이 <b>내장</b>돼 있어서 WNS_START를 따로 켤 필요가 없습니다.<br><br>응답이 없으면 앱을 <b>완전히 닫았다가 다시 실행</b>해 주세요.',
        footHTML: '<button class="tossBtn ghost" data-ok>닫기</button>',
      });
    dm.foot.querySelector('[data-ok]').onclick = dm.close;
    return;
  }
  const PATH = 'R:\\[F]_Util\\WNS\\자동시작';
  const step = (n, html) => `<div class="tossStep"><span class="n">${n}</span><div>${html}</div></div>`;
  const bodyHTML =
    (old
      ? (kma
        ? '기능 확장팩이 <b>구버전</b>이라 <b>기상청 불러오기</b>가 안 돼요. 아래대로 <b>다시 실행</b>하면 최신으로 바뀝니다.<br><br>'
        : '기능 확장팩이 <b>구버전</b>으로 켜져 있어요. 아래대로 <b>다시 실행</b>하면 최신으로 바뀝니다. (지금도 쓸 수는 있어요.)<br><br>')
      : '<b>기상청 불러오기</b>·<b>MXF/MOV 렌더</b> 같은 자동 기능을 쓰려면 <b>기능 확장팩</b>을 한 번 켜두면 됩니다. 아래 순서대로 하세요.<br><br>')
    + step(1, '아래 <b>[폴더 경로 복사]</b> 버튼을 누르세요.')
    + step(2, '키보드 <b>⊞Win + E</b> 로 <b>내 컴퓨터(파일 탐색기)</b>를 열고, 맨 위 <b>주소칸을 클릭</b>한 뒤 <b>Ctrl+V</b> 붙여넣고 <b>Enter</b>.')
    + step(3, '열린 폴더의 <b>WNS_START</b> 파일을 <b>더블클릭</b>. (검은 창이 잠깐 떴다 사라짐 — 켜기·다시켜기를 한 번에 합니다)')
    + step(4, '이 창을 닫고 <b>다시 그 버튼</b>(불러오기·MXF·MOV)을 누르면 됩니다.')
    + `<div class="tossPath">${PATH}</div>`
    + '<div style="margin-top:10px;color:var(--pop-muted);font-size:12.5px">한 번 하면 다음부턴 PC를 켤 때 자동으로 준비됩니다 — 다시 안 해도 돼요.</div>';
  const m = tossModal({
    title: old ? '기능 확장팩 업데이트 — 다시 실행만 하면 끝나요' : '기능 확장팩 준비 — 딱 한 번만 하면 끝나요',
    sub: '기상청 불러오기 · MXF/MOV 렌더',
    tone: 'red', bodyHTML,
    footHTML: '<button class="tossBtn pri" data-copy>폴더 경로 복사</button><button class="tossBtn ghost" data-ok>닫기</button>',
  });
  m.foot.querySelector('[data-ok]').onclick = m.close;
  const cp = m.foot.querySelector('[data-copy]');
  cp.onclick = async () => {
    try { await navigator.clipboard.writeText(PATH); }
    catch (e) { const t = document.createElement('textarea'); t.value = PATH; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (_) {} t.remove(); }
    cp.textContent = '✓ 복사됨! 탐색기 주소칸에 붙여넣기';
    cp.style.background = '#16A34A';
    setTimeout(() => { cp.textContent = '폴더 경로 복사'; cp.style.background = ''; }, 2600);
  };
}
// 기능 확장팩 상태 안내 — 지금 상태를 확인해서 알려준다(WNS_START가 조용히 실행돼 적용됐는지 알기 위함).
// 렌치 버튼은 이제 설정 메뉴라 여기로 바로 오지 않고, 설정 메뉴 맨 아래 '기능 확장팩' 한 줄(꺼짐·구버전일 때)에서 연다.
async function showHelperStatus() {
  status('기능 확장팩 확인 중…', true);
  const st = await pingHelper();
  applyHelperState(st);
  if (!st.up) { status('기능 확장팩 꺼져 있음', true); wnsHelperOffNotice('off'); return; }
  if (st.old) { status('기능 확장팩 구버전', true); wnsHelperOffNotice('old'); return; }
  status('기능 확장팩 실행 중 · 최신', true);
  const m = tossModal({
    title: '기능 확장팩 실행 중 · 최신이에요 ✓',
    sub: 'AE로 보내기 · MXF/MOV · 기상청 불러오기 준비됨',
    tone: 'green',
    bodyHTML: WNS_DESKTOP
      ? '데스크톱 앱에 <b>내장된</b> 기능 확장팩이 <b>정상 실행 중</b>입니다(WNS_START 불필요).<br><br>현재 버전 <b>' + st.ver + '</b> · 필요 버전 <b>' + HELPER_VER_MIN + '</b>'
      : '기능 확장팩이 <b>정상 실행 중</b>이고 <b>최신 버전</b>입니다.<br><br>현재 버전 <b>' + st.ver + '</b> · 필요 버전 <b>' + HELPER_VER_MIN + '</b><br><br>이제 <b>AE로 보내기</b>를 눌러 리깅을 확인하세요. (버전이 여기 보이면 WNS_START로 교체가 <b>적용된 것</b>입니다.)',
    footHTML: '<button class="tossBtn pri" data-ok>확인</button>',
  });
  m.foot.querySelector('[data-ok]').onclick = m.close;
}
async function wnsRender(mode) {   // mode: 'mxf' | 'mov'(알파)
  const A = anim();
  if (!hasAnim()) { status('트랙이 없습니다 — “지금 화면으로 자동 구성”을 먼저 누르세요', true); return; }
  // 헬퍼 살아있는지 확인 — 꺼져 있으면 큰 팝업 안내
  let up = false;
  try { const r = await fetch(WNS_HELPER + '/ping', { cache: 'no-store' }); up = r.ok; } catch (e) { up = false; }
  if (!up) { wnsHelperOffNotice(); return; }
  const alpha = (mode === 'mov');
  const label = alpha ? '알파 MOV' : 'MXF';
  const ext = alpha ? 'mov' : 'mxf';
  const [W, H] = RES[S.res].size;
  const A2 = anim();
  // 저장 대상 준비(렌더 전에) — 저장 폴더(R:\Upload 등) 있으면 바로쓰기, 없으면 저장창/다운로드. 취소면 렌더 안 함.
  const out = await prepareOutput(dateTag(), ext, 'application/octet-stream', label);
  if (!out) return;
  // 헬퍼는 항상 29.97(30000/1001)로 인코딩한다 → 프레임 수·샘플 시각도 그 기준(타임라인 fps로 뽑으면 길이·속도가 어긋남)
  const RF = 30000 / 1001;
  const fpsDiff = Math.abs((+A2.fps || RF) - RF) > 0.01;
  if (fpsDiff) status(`MXF·MOV는 방송 규격 29.97fps로 만듭니다 (타임라인 ${A2.fps}fps는 MP4·PNG 렌더에만 적용)`, true);
  const n = Math.max(1, Math.round(A2.dur * RF));   // MP4(bakeMp4)와 같게 n프레임(i=0..n-1)
  const sid = 'wns' + Date.now();
  const mv = alpha ? $('#wnsMov') : $('#wnsMxf');
  animStop();
  if (mv) mv.disabled = true;
  const fx = [mv, '#tlToggle']; let saved = false;   // 작업 중 효과(js/busy-fx.js) — bakeMp4와 같게
  fxBusy(fx, true);
  _exportingFrames = true; showExportMask(true);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const cx = c.getContext('2d', { alpha });
  // MXF·MOV 모두 PNG(무손실·풀 크로마) 프레임으로 굽는다. JPEG는 4:2:0 크로마 서브샘플링이라
  // 색 글자·경계선이 살짝 번진다 → PNG가 4:2:2 XDCAM으로 색을 더 깨끗이 살린다. (느린 건 워커 병렬로 상쇄)
  const fmt = 'image/png';
  const fext = 'png';
  try {
    // 한 프레임을 메인 스레드에서 직접 인코딩·전송(프레임0 = 헬퍼 세션 리셋용 + 워커 미지원 폴백).
    // 알파는 프리멀티플라이드(AE 동일)로 굽는다 — Uint32로 반투명 픽셀만 곱해 빠르게.
    const sendFrameMain = async (i) => {
      renderAnimFrame(i / RF);
      await drawExportFrame(cx, W, H);
      if (alpha) {
        const id = cx.getImageData(0, 0, W, H), d = id.data, u32 = new Uint32Array(d.buffer);
        for (let q = 0; q < u32.length; q++) { const v = u32[q], a = v >>> 24; if (a === 255) continue; if (a === 0) { u32[q] = 0; continue; } const p = q << 2; d[p] = (d[p] * a + 127) / 255 | 0; d[p + 1] = (d[p + 1] * a + 127) / 255 | 0; d[p + 2] = (d[p + 2] * a + 127) / 255 | 0; }
        cx.putImageData(id, 0, 0);
      }
      const blob = await new Promise((r) => c.toBlob(r, fmt, alpha ? undefined : 0.92));
      const resp = await fetch(WNS_HELPER + '/api/frame?sid=' + sid + '&index=' + i + '&ext=' + fext, { method: 'POST', body: blob });
      if (!resp.ok) throw new Error('프레임 전송 실패(' + i + ')');
    };

    // 인코딩(PNG/JPEG)+전송이 프레임당 가장 느리다 → Web Worker 여러 개로 병렬 처리.
    // 메인 스레드는 프레임을 그려 픽셀만 넘기고(전송 소유권 이전), 굽기·프리멀티플라이드·POST는 워커가.
    const canPool = (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && OffscreenCanvas.prototype.convertToBlob);
    const POOL = canPool ? Math.max(2, Math.min(10, (navigator.hardwareConcurrency || 4) - 1)) : 0;   // 인코딩·전송 병렬 워커 상한(6→10) — 지도 캐싱으로 렌더가 빨라져 워커가 더 일함

    await sendFrameMain(0);                     // 프레임0 먼저(세션 폴더 리셋 보장)
    exportProgress(1, n, label + ' 전송 중');

    if (POOL && n > 1) {                        // 남은 프레임(1..n-1)이 있을 때만 워커 풀
      const wsrc = "self.onmessage=async(e)=>{const m=e.data;try{const data=new Uint8ClampedArray(m.buf);if(m.premul){const u=new Uint32Array(m.buf);for(let q=0;q<u.length;q++){const v=u[q],a=v>>>24;if(a===255)continue;if(a===0){u[q]=0;continue;}const p=q<<2;data[p]=(data[p]*a+127)/255|0;data[p+1]=(data[p+1]*a+127)/255|0;data[p+2]=(data[p+2]*a+127)/255|0;}}const oc=new OffscreenCanvas(m.W,m.H);const x=oc.getContext('2d');x.putImageData(new ImageData(data,m.W,m.H),0,0);const b=await oc.convertToBlob({type:m.mime,quality:m.quality});const r=await fetch(m.url,{method:'POST',body:b});self.postMessage({index:m.index,ok:r.ok});}catch(err){self.postMessage({index:m.index,ok:false,err:String(err&&err.message||err)});}};";
      const wURL = URL.createObjectURL(new Blob([wsrc], { type: 'text/javascript' }));
      const workers = Array.from({ length: POOL }, () => new Worker(wURL));
      const free = workers.slice(), waiters = [];
      let done = 1, perr = null;                // done=1: 프레임0 이미 완료
      for (const w of workers) w.onmessage = (e) => {
        if (!e.data.ok && !perr) perr = new Error('프레임 인코딩 실패(' + e.data.index + ')' + (e.data.err ? ': ' + e.data.err : ''));
        done++; exportProgress(done, n, label + ' 인코딩·전송(병렬 ' + POOL + ')');
        const waiter = waiters.shift(); if (waiter) waiter(w); else free.push(w);
      };
      const acquire = () => (free.length ? Promise.resolve(free.pop()) : new Promise((res) => waiters.push(res)));
      try {
        const base = WNS_HELPER + '/api/frame?sid=' + sid + '&ext=' + fext + '&index=';
        for (let i = 1; i < n; i++) {
          if (perr) throw perr;
          renderAnimFrame(i / RF);
          await drawExportFrame(cx, W, H);
          const buf = cx.getImageData(0, 0, W, H).data.buffer;
          const w = await acquire();
          if (perr) throw perr;
          w.postMessage({ index: i, W, H, buf, premul: alpha, url: base + i, mime: fmt, quality: alpha ? undefined : 0.92 }, [buf]);
        }
        while (done < n && !perr) await new Promise((r) => setTimeout(r, 15));   // 남은 인코딩 마무리(프레임0 포함 n장)
        if (perr) throw perr;
      } finally { workers.forEach((w) => w.terminate()); URL.revokeObjectURL(wURL); }
    } else {
      for (let i = 1; i < n; i++) { await sendFrameMain(i); exportProgress(i + 1, n, label + ' 전송 중'); }
    }
    exportProgress(n, n, label + ' 인코딩 중 (헬퍼)');
    const fr = await fetch(WNS_HELPER + '/api/finalize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid, mode, tail: 0 }),
    });
    if (!fr.ok) { let er = {}; try { er = await fr.json(); } catch (_) {} throw new Error(er.error || ('헬퍼 오류 ' + fr.status)); }
    const buf = await fr.arrayBuffer();   // 인코딩된 파일 바이트
    await out.write(buf); const where = out.name;
    $('#tlInfo').textContent = `${label} 저장됨: ${where} · ${n}프레임 @29.97fps`; status(`${label} 저장 완료 → ${where}` + (fpsDiff ? ' (29.97fps로 변환됨)' : ''));
    flashDone(`${label} 렌더 완료`); saved = true;
  } catch (e) {
    status(`${label} 실패: ` + (e.message || e), true); $('#tlInfo').textContent = `${label} 실패`;
  } finally {
    fxBusy(fx, false);
    if (mv) mv.disabled = false;
    animOff();
    if (saved) fxArrive(['#tlToggle', mv, $('#tlInfo')]);
    if (typeof tlRefreshPreview === 'function') tlRefreshPreview();   // 타임라인이 열려 있으면 재생헤드 시각 프레임으로 돌아간다
  }
}
