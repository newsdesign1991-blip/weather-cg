// Render the editable SVG with the app's own Chromium; rebuild PNG/Windows ICO assets.
// Usage: node tools/build-icons.cjs (no network or user app profile).
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function iconBundle(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const at = 6 + i * 16;
    header[at] = header[at + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8); header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(x => x.png)]);
}
module.exports = { iconBundle };

async function build() {
  const { app, BrowserWindow } = require('electron');
  const profile = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wcg-icons-'));
  app.setPath('userData', profile);
  await app.whenReady();
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  console.log('Icon renderer ready.');
  await win.loadURL('data:text/html,<html><body></body></html>');
  const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
  const full = svg.replace('<rect x="1" y="1" width="38" height="38" rx="11"', '<rect x="0" y="0" width="40" height="40" rx="0"')
    .replace(/\s*<rect x="1\.5"[^>]+\/>/, '');
  const raster = async (source, size) => {
    const data = await win.webContents.executeJavaScript(`(async () => {
      const img = new Image(); img.src = ${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(source).toString('base64'))};
      await img.decode(); const canvas = document.createElement('canvas'); canvas.width = canvas.height = ${size};
      const cx = canvas.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(img, 0, 0, ${size}, ${size});
      return canvas.toDataURL('image/png').split(',')[1];
    })()`);
    return Buffer.from(data, 'base64');
  };
  try {
    for (const size of [192, 512]) {
      fs.writeFileSync(path.join(root, `icon-${size}.png`), await raster(svg, size));
      fs.writeFileSync(path.join(root, `app-icon-full-${size}.png`), await raster(full, size));
    }
    fs.writeFileSync(path.join(root, 'apple-touch-icon-20260926.png'), await raster(full, 180));
    const images = [];
    for (const size of [16, 24, 32, 48, 64, 128, 256]) images.push({ size, png: await raster(svg, size) });
    fs.writeFileSync(path.join(root, 'icon.ico'), iconBundle(images));
    console.log('Built app icons: SVG → PNG (180/192/512), ICO (16–256).');
  } finally { win.destroy(); app.quit(); }
}
if (process.versions.electron) build().catch(e => { console.error(e); require('electron').app.exit(1); });
else if (require.main === module) {
    const exe = require(path.join(root, 'desktop/node_modules/electron'));
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const result = require('node:child_process').spawnSync(exe, [__filename], { env, windowsHide: true, stdio: 'inherit', timeout: 60000 });
    if (result.error) throw result.error;
    process.exitCode = result.status || 0;
}
