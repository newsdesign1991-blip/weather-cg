// 측정용 Electron 진입점 — 원래 desktop/main.js 를 그대로 불러오되, 점검 모드 창을 '보이게'(포커스 안 뺏고) 띄운다.
// 숨김 창은 프레임(rAF)을 안 만들어 렌더 비용을 못 잰다. 가려져도 프레임이 돌도록 가림 감지·백그라운드 감속을 끈다.
const { app, screen } = require('electron');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.on('browser-window-created', (e, w) => {
  w.once('ready-to-show', () => {
    try {
      const d = screen.getPrimaryDisplay();
      console.log('[perf] display', JSON.stringify({ size: d.size, workArea: d.workAreaSize, scale: d.scaleFactor }));
      w.setPosition(0, 0); w.showInactive();
    } catch (er) { console.log('[perf] show fail', er.message); }
  });
});
require(process.env.WCG_MAIN);
