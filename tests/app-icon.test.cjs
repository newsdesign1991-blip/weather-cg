const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const appSource = require('../tools/app-source.cjs');
const { iconBundle } = require('../tools/build-icons.cjs');
const root = path.resolve(__dirname, '..');

test('sidebar logo matches the editable cyan/blue app icon, including weather geometry', () => {
  const src = appSource(path.join(root, 'index.html'));
  const logo = src.slice(src.indexOf('<div class="ahLogo">')).match(/<svg[^>]*>([\s\S]*?)<\/svg>/)[1];
  const icon = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8').match(/<svg[^>]*>([\s\S]*?)<\/svg>/)[1];
  assert.equal(logo.replace(/\s+/g, ' ').trim(), icon.replace(/\s+/g, ' ').trim());
  for (const color of ['#06D4EB', '#0757F5', '#A0FFFF', '#89C8FF']) assert.ok(icon.includes(color));
  assert.ok(icon.includes('cx="15.5" cy="15" r="4.6"'));
});

test('PNG icons have valid signatures and the expected dimensions', () => {
  for (const [file, size] of [['icon-192.png',192],['icon-512.png',512],['app-icon-full-192.png',192],['app-icon-full-512.png',512],['apple-touch-icon-20260926.png',180]]) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file);
    assert.equal(png.readUInt32BE(16),size,file); assert.equal(png.readUInt32BE(20),size,file);
  }
});

test('Windows ICO contains every size with valid PNG offsets and 32-bit color', () => {
  const ico = fs.readFileSync(path.join(root,'icon.ico'));
  assert.equal(ico.readUInt16LE(2),1); assert.equal(ico.readUInt16LE(4),7);
  for (const [i,size] of [16,24,32,48,64,128,256].entries()) {
    const at=6+i*16, start=ico.readUInt32LE(at+12), length=ico.readUInt32LE(at+8);
    assert.equal(ico[at] || 256,size); assert.equal(ico.readUInt16LE(at+6),32);
    assert.ok(start+length<=ico.length); assert.equal(ico.subarray(start,start+8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(ico.readUInt32BE(start+16),size);
  }
  const fake=iconBundle([{size:256,png:Buffer.from('abc')}]);
  assert.equal(fake.readUInt32LE(18),22); assert.equal(fake.subarray(22).toString(),'abc');
});
