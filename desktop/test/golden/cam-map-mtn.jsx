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
function ezE(p,o,i){try{var sp=false;try{sp=p.isSpatial;}catch(e){}var d=1;try{d=p.value.length||1;}catch(e){d=1;}var n=sp?1:d,A=[],B=[],z=[],k;for(k=0;k<n;k++){A.push(new KeyframeEase(0,o));B.push(new KeyframeEase(0,i));}for(k=0;k<d;k++)z.push(0);p.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);p.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);p.setTemporalEaseAtKey(1,A,A);p.setTemporalEaseAtKey(2,B,B);if(sp){try{p.setSpatialTangentsAtKey(1,z,z);p.setSpatialTangentsAtKey(2,z,z);}catch(e){}}}catch(err){}}
function fadeE(l,s,e,o,i){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ezE(op,o,i);}
var GCAM=TG.layers.addNull();GCAM.name="CAM";GCAM.enabled=false;GCAM.property("Anchor Point").setValue([1160.000000,545.000000]);GCAM.property("Position").setValue([1160.000000,545.000000]);
var GROT=TG.layers.addNull();GROT.name="ROT";GROT.enabled=false;GROT.property("Anchor Point").setValue([TG.width/2,TG.height/2]);GROT.property("Position").setValue([TG.width/2,TG.height/2]);GCAM.parent=GROT;
var L0=addL("f_00000.png","\uc9c0\ub3c4");
L0.parent=GCAM;
var L1=addL("f_00001.png","\uc0b0(\ubc14\ud0d5)");
L1.parent=GROT;
var L2=addL("f_00002.png","\uc0b0(\ubc14\ud0d5)_\uc124\uc545");
L2.property("Anchor Point").setValue([1300.500000,420.250000]);L2.property("Position").expression="thisComp.layer(\"CAM\").toComp([1300.500000,420.250000])";L2.property("Rotation").expression="thisComp.layer(\"ROT\").transform.rotation";
var L3=addL("f_00003.png","\uc0b0_\uc124\uc545");
L3.property("Anchor Point").setValue([1300.500000,420.250000]);L3.property("Position").expression="thisComp.layer(\"CAM\").toComp([1300.500000,420.250000])";L3.property("Rotation").expression="thisComp.layer(\"ROT\").transform.rotation";
fadeE(L3,1.000000,1.800000,34.000000,85.000000);
try{L3.inPoint=1.000000;}catch(err){}
var L4=addL("f_00004.png","\uc0b0_\ud2c0\ub9bc");
L4.parent=GCAM;
var L5=addL("f_00005.png","\uc0b0_\uc790\ub9ac\ub9cc");
L5.property("Anchor Point").setValue([0,0]);L5.property("Position").setValue([1.000000,2.000000]);L5.property("Scale").setValue([100.000000,100.000000]);
L5.property("Anchor Point").setValue([10.000000,20.000000]);L5.property("Position").expression="thisComp.layer(\"CAM\").toComp([10.000000,20.000000])";L5.property("Rotation").expression="thisComp.layer(\"ROT\").transform.rotation";
GCAM.property("Position").setValueAtTime(0.000000,[1160.000000,545.000000]);
GCAM.property("Position").setValueAtTime(2.000000,[1100.000000,560.000000]);
GCAM.property("Scale").setValueAtTime(0.000000,[100.000000,100.000000]);
GCAM.property("Scale").setValueAtTime(2.000000,[137.254902,137.254902]);
ezAll(GCAM.property("Position"),34.000000,85.000000);ezAll(GCAM.property("Scale"),34.000000,85.000000);
GROT.property("Rotation").setValueAtTime(0.000000,0.000000);
GROT.property("Rotation").setValueAtTime(2.000000,8.000000);
ezAll(GROT.property("Rotation"),34.000000,85.000000);
comp.openInViewer();app.endUndoGroup();