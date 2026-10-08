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
function ezAll(p,o,i){try{var sp=false;try{sp=p.isSpatial;}catch(e){}var d=1;try{d=p.value.length||1;}catch(e){d=1;}var n=sp?1:d,A=[],B=[],z=[],k;for(k=0;k<n;k++){A.push(new KeyframeEase(0,i));B.push(new KeyframeEase(0,o));}for(k=0;k<d;k++)z.push(0);for(k=1;k<=p.numKeys;k++){p.setInterpolationTypeAtKey(k,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);p.setTemporalEaseAtKey(k,A,B);if(sp){try{p.setSpatialAutoBezierAtKey(k,false);p.setSpatialContinuousAtKey(k,false);p.setSpatialTangentsAtKey(k,z,z);}catch(e){}}}}catch(err){}}
var GCAM=TG.layers.addNull();GCAM.name="CAM";GCAM.enabled=false;GCAM.property("Anchor Point").setValue([1160.000000,545.000000]);GCAM.property("Position").setValue([1160.000000,545.000000]);
var GROT=TG.layers.addNull();GROT.name="ROT";GROT.enabled=false;GROT.property("Anchor Point").setValue([960.000000,540.000000]);GROT.property("Position").setValue([960.000000,540.000000]);GCAM.parent=GROT;
try{var VOID=TG.layers.addSolid(hx("#0e2a4e"),"VOID",TG.width,TG.height,1);VOID.moveToEnd();}catch(e){}
var L0=addL("f_00000.png","\ubc30\uacbd");
L0.parent=GROT;
var L1=addL("f_00001.png","\uc9c0\ub3c4");
L1.parent=GCAM;
var L2=addL("f_00002.png","\uc778\uc14b");
L2.parent=GROT;
var L3=addL("f_00003.png","\uace0\uc815");
GCAM.property("Position").setValueAtTime(0.000000,[1160.000000,545.000000]);
GCAM.property("Position").setValueAtTime(2.000000,[1100.000000,560.000000]);
GCAM.property("Position").setValueAtTime(4.000000,[1000.000000,600.000000]);
GCAM.property("Scale").setValueAtTime(0.000000,[100.000000,100.000000]);
GCAM.property("Scale").setValueAtTime(2.000000,[117.647059,117.647059]);
GCAM.property("Scale").setValueAtTime(4.000000,[117.647059,117.647059]);
ezAll(GCAM.property("Position"),34.000000,85.000000);ezAll(GCAM.property("Scale"),34.000000,85.000000);
GROT.property("Rotation").setValueAtTime(0.000000,0.000000);
GROT.property("Rotation").setValueAtTime(2.000000,15.000000);
GROT.property("Rotation").setValueAtTime(4.000000,-30.500000);
ezAll(GROT.property("Rotation"),34.000000,85.000000);
comp.openInViewer();app.endUndoGroup();