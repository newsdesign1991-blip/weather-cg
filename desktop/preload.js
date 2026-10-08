// 데스크톱 판 표식 + 헬퍼 주소. 웹앱은 window.wcgDesktop 이 없으면 웹판(3720 헬퍼)으로 그대로 동작한다.
const { contextBridge, ipcRenderer } = require('electron');

let helper = { url: null, kind: null, ver: 0 };
try { helper = ipcRenderer.sendSync('wcg:helper') || helper; } catch (e) {}

contextBridge.exposeInMainWorld('wcgDesktop', {
  isDesktop: true,
  helperUrl: helper.url,       // 내장 헬퍼면 http://127.0.0.1:3721
  helperKind: helper.kind,     // 'embedded' | 'external'
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  // 창 버튼(최소화·최대화·닫기) 색을 앱 제목줄 색에 맞춘다 — { color: '#hex', symbolColor: '#hex' }
  setTitleBar: (o) => { try { ipcRenderer.send('wcg:titlebar', { color: String(o && o.color || ''), symbolColor: String(o && o.symbolColor || '') }); } catch (e) {} },
  // 앱 안 날씨누리 창(단기예보) 열기 — 화면이 뜰 때마다 통보문 글을 onWnuri 로 보내 준다(main.js '날씨누리 창')
  openWnuri: (url) => ipcRenderer.invoke('wcg:wnuri-open', String(url || '')),
  // 받는 것: { text, announce, url, first, err } 또는 { closed: true } — 한 번만 건다(다시 부르면 앞 것을 바꾼다)
  onWnuri: (cb) => {
    ipcRenderer.removeAllListeners('wcg:wnuri');
    if (typeof cb === 'function') ipcRenderer.on('wcg:wnuri', (_e, d) => { try { cb(d); } catch (err) {} });
  },
  // 미해군(JTWC) 자료 받기 — 'rss/jtwc.rss' 또는 'products/wp2726.tcw'(RSS의 전체 주소도 됨). 그 밖 주소는 메인이 거절한다(desktop/jtwc.js).
  // 돌려주는 것: { ok: true, status, url, text } 또는 { ok: false, err: 'denied'|'timeout'|'too-big'|'http'|'net', status?, detail? }
  jtwcFetch: (p) => ipcRenderer.invoke('wcg:jtwc-fetch', String(p || '')),
});
