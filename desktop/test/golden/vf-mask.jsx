app.beginUndoGroup("WeatherCG");
var proj=app.project;
var dir="C:/WCG/frames/sid01";
var comp=proj.items.addComp("WeatherCG_20261008_0930",1920,1080,1.0,6.000000,29.970000);
var vfc=proj.items.addComp("VF_\uc804\uccb4",1920,1080,1.0,6.000000,29.970000);
var TG=vfc;
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
var GCAM=TG.layers.addNull();GCAM.name="CAM";GCAM.enabled=false;GCAM.property("Anchor Point").setValue([1160.000000,545.000000]);GCAM.property("Position").setValue([1160.000000,545.000000]);
var L0=addL("f_00000.png","\uc9c0\ub3c4");
L0.property("Anchor Point").setValue([0,0]);L0.property("Position").setValue([-200.000000,-100.000000]);L0.property("Scale").setValue([100.000000,100.000000]);
L0.parent=GCAM;
GCAM.property("Position").setValueAtTime(0.000000,[1460.000000,516.000000]);
GCAM.property("Position").setValueAtTime(3.000000,[1300.000000,560.000000]);
GCAM.property("Scale").setValueAtTime(0.000000,[100.000000,100.000000]);
GCAM.property("Scale").setValueAtTime(3.000000,[78.431373,78.431373]);
ezAll(GCAM.property("Position"),34.000000,85.000000);ezAll(GCAM.property("Scale"),34.000000,85.000000);
var vfl=comp.layers.add(vfc);vfl.name="VF_\uc9c4\uc785";
try{var vmk=vfl.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");var vsh=new Shape();vsh.vertices=[[1012.400000,80.000000],[1892.650000,80.000000],[1892.650000,1000.000000],[1012.400000,1000.000000]];vsh.closed=true;vmk.property("ADBE Mask Shape").setValue(vsh);}catch(e){}
var pp=vfl.property("Position");var cc=[comp.width/2,comp.height/2];
pp.setValueAtTime(1.000000,[cc[0]+256.000000,cc[1]]);pp.setValueAtTime(2.200000,cc);
var vo=vfl.property("Opacity");vo.setValueAtTime(1.000000,0);vo.setValueAtTime(2.200000,100);
ezE(pp,40.000000,80.000000);ezE(vo,40.000000,80.000000);
comp.openInViewer();app.endUndoGroup();