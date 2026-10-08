app.beginUndoGroup("WeatherCG");
var proj=app.project;
var dir="C:/WCG/frames/sid01";
var comp=proj.items.addComp("WeatherCG_20261008_0930",1920,1080,1.0,6.000000,29.970000);
var TG=comp;
function imp(f){var io=new ImportOptions(File(dir+"/"+f));return proj.importFile(io);}
function addL(f,nm){var l=TG.layers.add(imp(f));l.name=nm;return l;}
function hx(h){h=String(h).replace("#","");return [parseInt(h.substr(0,2),16)/255,parseInt(h.substr(2,2),16)/255,parseInt(h.substr(4,2),16)/255];}
function addT(txt,nm){var l=TG.layers.addText(txt);l.name=nm;return l;}
function ez2(prop){var A=[new KeyframeEase(0,33)],B=[new KeyframeEase(0,75)];try{prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function fadeL(l,s,e){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ez2(op);}
function ezR(prop){try{var n=1;try{n=prop.value.length||1;}catch(e){n=1;}var A=[],B=[];for(var i=0;i<n;i++){A.push(new KeyframeEase(0,33));B.push(new KeyframeEase(0,75));}prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function dshadow(l){try{var e=l.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");e.property("Shadow Color").setValue(hx("#000814"));e.property("Opacity").setValue(114.750000);e.property("Direction").setValue(180.000000);e.property("Distance").setValue(8.000000);e.property("Softness").setValue(20.000000);}catch(err){}}
function ezE(p,o,i){try{var sp=false;try{sp=p.isSpatial;}catch(e){}var d=1;try{d=p.value.length||1;}catch(e){d=1;}var n=sp?1:d,A=[],B=[],z=[],k;for(k=0;k<n;k++){A.push(new KeyframeEase(0,o));B.push(new KeyframeEase(0,i));}for(k=0;k<d;k++)z.push(0);p.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);p.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);p.setTemporalEaseAtKey(1,A,A);p.setTemporalEaseAtKey(2,B,B);if(sp){try{p.setSpatialTangentsAtKey(1,z,z);p.setSpatialTangentsAtKey(2,z,z);}catch(e){}}}catch(err){}}
function fadeE(l,s,e,o,i){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ezE(op,o,i);}
var L0=addL("f_00000.png","a");
fadeE(L0,1.000000,1.800000,0.100000,100.000000);
try{L0.inPoint=1.000000;}catch(err){}
var L1=addL("f_00001.png","b");
fadeE(L1,1.000000,1.800000,0.100000,100.000000);
try{L1.inPoint=1.000000;}catch(err){}
var L2=addL("f_00002.png","c");
fadeL(L2,1.000000,1.800000);
try{L2.inPoint=1.000000;}catch(err){}
var L3=addL("f_00003.png","d");
fadeL(L3,1.000000,1.800000);
try{L3.inPoint=1.000000;}catch(err){}
var L4=addL("f_00004.png","e");
fadeL(L4,1.000000,1.800000);
try{L4.inPoint=1.000000;}catch(err){}
var L5=addL("f_00005.png","f");
fadeL(L5,1.000000,1.800000);
try{L5.inPoint=1.000000;}catch(err){}
var L6=addL("f_00006.png","g");
fadeL(L6,1.000000,1.800000);
try{L6.inPoint=1.000000;}catch(err){}
var L7=addL("f_00007.png","h");
fadeL(L7,1.000000,1.800000);
try{L7.inPoint=1.000000;}catch(err){}
var L8=addL("f_00008.png","i");
fadeL(L8,1.000000,1.800000);
try{L8.inPoint=1.000000;}catch(err){}
var L9=addL("f_00009.png","j");
fadeL(L9,1.000000,1.800000);
try{L9.inPoint=1.000000;}catch(err){}
var L10=addL("f_00010.png","k");
fadeE(L10,1.000000,1.800000,33.500000,99.990000);
try{L10.inPoint=1.000000;}catch(err){}
var L11=addL("f_00011.png","l");
fadeL(L11,1.000000,1.800000);
try{L11.inPoint=1.000000;}catch(err){}
var PC12=proj.items.addComp("\ub77c\ubca8_1",80,40,1.0,6.000000,29.970000);
PC12.layers.add(imp("f_00012.png")).name="\ubc30\uacbd";
var L12=TG.layers.add(PC12);L12.name="\ub77c\ubca8_1";
L12.property("Position").setValue([300.000000,200.000000]);
dshadow(L12);
fadeL(L12,2.000000,3.000000);
(function(){var p=L12.property("Position");p.setValueAtTime(2.000000,[300.000000,226.000000]);p.setValueAtTime(3.000000,[300.000000,200.000000]);ez2(p);})();
try{L12.inPoint=2.000000;}catch(err){}
comp.openInViewer();app.endUndoGroup();