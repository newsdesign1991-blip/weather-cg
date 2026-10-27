const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { initialWindowBounds } = require('../window-layout');

test('wide window fits usable area, including taskbar, scaled and secondary displays', () => {
  for (const area of [
    {x:0,y:0,width:1920,height:1040}, {x:0,y:0,width:1536,height:824},
    {x:0,y:0,width:1366,height:728}, {x:-2560,y:-100,width:2560,height:1400},
    {x:40,y:0,width:1240,height:720}, {x:0,y:0,width:3840,height:2080},
    {x:1920,y:0,width:1080,height:1880}, {x:0,y:0,width:800,height:560},
  ]) {
    const b = initialWindowBounds(area);
    assert.ok(b.width < area.width && b.height < area.height);
    assert.ok(b.x >= area.x && b.y >= area.y);
    assert.ok(b.x+b.width <= area.x+area.width && b.y+b.height <= area.y+area.height);
    assert.ok(b.minWidth <= b.width && b.minHeight <= b.height);
    assert.ok(b.width/b.height >= 1.8);
    assert.ok(Math.abs((b.x-area.x)*2+b.width-area.width) <= 1);
  }
});

test('main window shows without maximizing/fullscreen; explicit test sizes stay intact', () => {
  const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
  const a=source.indexOf('function createWindow() {'), b=source.indexOf('\n// ---------- 날씨누리',a);
  assert.ok(a>=0&&b>a);
  for (const testSize of [null,['1100x850','1100','850']]) {
    let options,ready,shown=false;
    class FakeWindow {
      constructor(o) {options=o;this.webContents={setWindowOpenHandler(){},on(){}};}
      once(event,fn){if(event==='ready-to-show')ready=fn;} on(){} loadURL(){}
      maximize(){throw new Error('must not maximize');} show(){shown=true;}
    }
    const c={BrowserWindow:FakeWindow,initialWindowBounds,screen:{getCursorScreenPoint:()=>({x:100,y:100}),getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1920,height:1040}})},TEST_SIZE:testSize,TEST_MODE:!!testSize,path,APP_DIR:'.',TITLEBAR_H:48,TITLEBAR_DARK:{},APP_ORIGIN:'app://weathercg',wireCloseGuard(){},win:null,process:{env:{}}};
    c.__dirname=path.join(__dirname,'..');
    vm.createContext(c);vm.runInContext(source.slice(a,b)+'\ncreateWindow();',c);ready();
    assert.equal(options.fullscreen,false);assert.equal(options.show,false);
    assert.equal(shown,!testSize);
    if(testSize){assert.equal(options.width,1100);assert.equal(options.height,850);}
    else {assert.equal(options.width,1804);assert.ok(options.height<1000);}
  }
});
