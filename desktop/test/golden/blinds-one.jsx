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
function slid(l,nm){var e=l.property("ADBE Effect Parade").addProperty("ADBE Slider Control");e.name=nm;return e.property(1);}
function ezE(p,o,i){try{var sp=false;try{sp=p.isSpatial;}catch(e){}var d=1;try{d=p.value.length||1;}catch(e){d=1;}var n=sp?1:d,A=[],B=[],z=[],k;for(k=0;k<n;k++){A.push(new KeyframeEase(0,o));B.push(new KeyframeEase(0,i));}for(k=0;k<d;k++)z.push(0);p.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);p.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);p.setTemporalEaseAtKey(1,A,A);p.setTemporalEaseAtKey(2,B,B);if(sp){try{p.setSpatialTangentsAtKey(1,z,z);p.setSpatialTangentsAtKey(2,z,z);}catch(e){}}}catch(err){}}
function fadeE(l,s,e,o,i){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ezE(op,o,i);}
var L0=addL("f_00000.png","\ubc30\uacbd\u00b7\uc9c0\ub3c4");
var L1=addL("f_00001.png","\uc0c9\uce60_FA9A8C");
(function(){try{var pr=slid(L1,"PROG");pr.setValueAtTime(1.000000,0);pr.setValueAtTime(1.800000,100);ezE(pr,34.000000,85.000000);var vb=L1.property("ADBE Effect Parade").addProperty("ADBE Venetian Blinds");try{vb.property(2).setValue(-45.000000);vb.property(3).setValue(8.160000);vb.property(4).setValue(0);}catch(e){}vb.property(1).expression="var g=effect(\"PROG\")(1)/100;g<=0?100:(g>=0.999?0:Math.max(0,1-0.093750-g)*100)";}catch(err){fadeE(L1,1.000000,1.800000,34.000000,85.000000);}})();
try{L1.inPoint=1.000000;}catch(err){}
var L2=addL("f_00002.png","\uc0b0_\uc124\uc545\uc0b0");
(function(){try{var pr=slid(L2,"PROG");pr.setValueAtTime(1.500000,0);pr.setValueAtTime(2.300000,100);ezE(pr,34.000000,85.000000);var vb=L2.property("ADBE Effect Parade").addProperty("ADBE Venetian Blinds");try{vb.property(2).setValue(30.000000);vb.property(3).setValue(8.000000);vb.property(4).setValue(0);}catch(e){}vb.property(1).expression="var g=effect(\"PROG\")(1)/100;g<=0?100:(g>=0.999?0:Math.max(0,1-0.012500-g)*100)";}catch(err){fadeE(L2,1.500000,2.300000,34.000000,85.000000);}})();
try{L2.inPoint=1.500000;}catch(err){}
comp.openInViewer();app.endUndoGroup();