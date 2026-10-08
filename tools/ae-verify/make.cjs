// AE 실기 대조 — 1단계: 골든 스펙으로 '검증용 JSX'를 만든다(헬퍼 desktop/wns/ae-jsx.js = helper.py 출력 + 값 덤프 꼬리).
// 사람이 AE(새 빈 프로젝트)에서 File > Scripts > Run Script File로 실행하면, 만들어진 컴프의 키·표현식 속성 값을
// 프레임마다(valueAtTime) <출력 폴더>/<스펙>.dump.json 으로 써 낸다. 2단계는 compare.cjs(같은 JSX를 AE 흉내로 계산한 값과 비교).
// 이걸로 확인하는 것(설계 3.5): V1 영향 합 >100%(34/85)·V2 공간 속성 이즈 개수·V5 표현식이 슬라이더 읽기·V6 toComp·
// V9 부모 대입 보정·V10 한글 레이어 이름 표현식. (V3 블라인드 띠·V4 Trim 그리기·V7·V11 기울기는 화면으로 본다)
// 사용: node tools/ae-verify/make.cjs [출력 폴더] [스펙 이름 …]   (기본 출력: %TEMP%\wcg-ae-verify)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { buildAeJsx } = require('../../desktop/wns/ae-jsx.js');

const SPEC_DIR = path.join(__dirname, '..', '..', 'desktop', 'test', 'ae-specs');
const DEFAULT = ['ease-fade', 'ease-vf', 'blinds-one', 'typhoon-prog', 'typhoon-prog-cam', 'compare-prog-each', 'cam-map-rot', 'cam-map-mtn', 'labelcomp-leader', 'typhoon-camera'];
const outDir = process.argv[2] && !/^[a-z0-9-]+$/.test(process.argv[2]) ? process.argv[2] : path.join(os.tmpdir(), 'wcg-ae-verify');
const names = process.argv.slice(process.argv[2] === outDir ? 3 : 2);

// 투명 PNG(가로×세로) — 헬퍼 JSX가 임포트할 자리 그림(값 비교엔 그림 내용이 필요 없다)
function blankPng(w, h) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);   // 필터 0 + RGBA 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// 값 덤프 꼬리(ExtendScript — ES3, JSON 없음). 이 JSX가 만든 컴프만(시작 전 항목 수 기억), 키나 표현식이 있는 속성만.
// 경로 = matchName#같은 이름 순번(형제 중) — compare.cjs가 AE 흉내의 같은 경로를 찾는다
const DUMP = (file) => `
(function(){
  function num(v){return (typeof v==="number"&&isFinite(v))?String(Math.round(v*1e6)/1e6):"null";}
  function ser(v){if(v===null||v===undefined)return "null";if(typeof v==="number")return num(v);if(typeof v==="boolean")return v?"1":"0";
    if(v instanceof Array){var a=[];for(var i=0;i<v.length;i++)a.push(ser(v[i]));return "["+a.join(",")+"]";}
    try{if(v.vertices!==undefined)return "{\\"v\\":"+ser(v.vertices)+",\\"c\\":"+(v.closed?1:0)+"}";}catch(e){}return "null";}
  function esc(s){s=String(s);var o="";for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);if(c===34||c===92)o+="\\\\"+s.charAt(i);else if(c<32||c>126){var h=c.toString(16);while(h.length<4)h="0"+h;o+="\\\\u"+h;}else o+=s.charAt(i);}return o;}
  var out=[],errs=[];
  function walk(comp,layer,grp,pth){
    var seen={};
    for(var i=1;i<=grp.numProperties;i++){var p=grp.property(i),mn=p.matchName,k=(seen[mn]=(seen[mn]||0)+1),pp=pth+"/"+mn+"#"+k;
      try{
        if(p.propertyType===PropertyType.PROPERTY){
          var ex="";try{ex=p.expression||"";}catch(e){}
          if(p.numKeys>0||ex!==""){var vals=[];var n=Math.round(comp.duration*comp.frameRate);
            for(var f=0;f<=n;f++){var v;try{v=p.valueAtTime(f*comp.frameDuration,false);}catch(e){v=null;}vals.push(ser(v));}
            var ee="";try{ee=p.expressionError||"";}catch(e){}
            out.push("{\\"comp\\":\\""+esc(comp.name)+"\\",\\"layer\\":\\""+esc(layer.name)+"\\",\\"li\\":"+layer.index+",\\"path\\":\\""+esc(pp)+"\\",\\"keys\\":"+p.numKeys+",\\"expr\\":"+(ex!==""?1:0)+",\\"exprErr\\":\\""+esc(ee)+"\\",\\"v\\":["+vals.join(",")+"]}");}
        }else walk(comp,layer,p,pp);
      }catch(e){errs.push(esc(pp+": "+e));}
    }
  }
  for(var j=__wcgN0+1;j<=app.project.numItems;j++){var it=app.project.item(j);if(!(it instanceof CompItem))continue;
    for(var l=1;l<=it.numLayers;l++){var ly=it.layer(l);
      var par="";try{par=ly.parent?ly.parent.name:"";}catch(e){}
      out.push("{\\"comp\\":\\""+esc(it.name)+"\\",\\"layer\\":\\""+esc(ly.name)+"\\",\\"li\\":"+l+",\\"parent\\":\\""+esc(par)+"\\"}");
      walk(it,ly,ly,"");}}
  var fl=new File(${JSON.stringify(file.split(path.sep).join('/'))});fl.encoding="UTF-8";fl.open("w");fl.write("{\\"items\\":["+out.join(",\\n")+"],\\"errors\\":[\\""+errs.join("\\",\\"")+"\\"]}");fl.close();
  alert("WeatherCG AE 대조: 덤프를 썼습니다\\n"+fl.fsName);
})();`;

fs.mkdirSync(outDir, { recursive: true });
const framesDir = path.join(outDir, 'frames');
fs.mkdirSync(framesDir, { recursive: true });
const png = blankPng(1920, 1080), icon = blankPng(270, 270);
const list = names.length ? names : DEFAULT;
for (const nm of list) {
  const spec = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, nm + '.json'), 'utf8'));
  const jsx = buildAeJsx(spec, framesDir);
  // 스펙이 임포트하는 파일(f_*.png)을 자리 그림으로 — 아이콘 크기(270)는 리그가 쓰는 것
  for (const m of new Set(jsx.match(/f_\d{5}\.png/g) || [])) { const p = path.join(framesDir, m); if (!fs.existsSync(p)) fs.writeFileSync(p, /^f_0000[1-7]\.png$/.test(m) && /typhoonRig|compareRig/.test(JSON.stringify(spec)) ? icon : png); }
  const dumpFile = path.join(outDir, nm + '.dump.json');
  const full = 'var __wcgN0=app.project.numItems;\n' + jsx + '\n' + DUMP(dumpFile);
  fs.writeFileSync(path.join(outDir, nm + '.verify.jsx'), full);
  console.log('만듦:', path.join(outDir, nm + '.verify.jsx'));
}
console.log('\nAE(새 빈 프로젝트)에서 위 .verify.jsx를 하나씩 실행한 뒤:  node tools/ae-verify/compare.cjs "' + outDir + '"');
