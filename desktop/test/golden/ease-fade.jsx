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
var L0=addL("f_00000.png","\ubc30\uacbd\u00b7\uc9c0\ub3c4");
var L1=addL("f_00001.png","\uc0c9\uce60_FA9A8C");
fadeE(L1,1.000000,1.800000,34.000000,85.000000);
try{L1.inPoint=1.000000;}catch(err){}
var L2=addL("f_00002.png","\uc0c9\uce60_8A0A02");
fadeE(L2,0.000000,0.500000,34.000000,85.000000);
var L3=addL("f_00003.png","\ube0c\ub7ec\uc26c_2E6FB0");
fadeL(L3,1.200000,2.000000);
try{L3.inPoint=1.200000;}catch(err){}
var PC4=proj.items.addComp("\ub77c\ubca8_1",120,50,1.0,6.000000,29.970000);
PC4.layers.add(imp("f_00004.png")).name="\ubc30\uacbd";
(function(){var tl=PC4.layers.addText("10");var d=tl.property("Source Text").value;d.fontSize=40;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Bold";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([60.000000,38.600000]);})();
var L4=TG.layers.add(PC4);L4.name="\ub77c\ubca8_1";
L4.property("Position").setValue([500.000000,300.000000]);
dshadow(L4);
fadeE(L4,3.100000,3.800000,34.000000,85.000000);
(function(){var p=L4.property("Position");p.setValueAtTime(3.100000,[500.000000,326.000000]);p.setValueAtTime(3.800000,[500.000000,300.000000]);ezE(p,34.000000,85.000000);})();
try{L4.inPoint=3.100000;}catch(err){}
var PC5=proj.items.addComp("\ub77c\ubca8_2",120,50,1.0,6.000000,29.970000);
PC5.layers.add(imp("f_00005.png")).name="\ubc30\uacbd";
var L5=TG.layers.add(PC5);L5.name="\ub77c\ubca8_2";
L5.property("Position").setValue([700.000000,300.000000]);
dshadow(L5);
fadeE(L5,0.000000,1.000000,34.000000,85.000000);
var PC6=proj.items.addComp("\ub77c\ubca8_3",120,50,1.0,6.000000,29.970000);
PC6.layers.add(imp("f_00006.png")).name="\ubc30\uacbd";
var L6=TG.layers.add(PC6);L6.name="\ub77c\ubca8_3";
L6.property("Position").setValue([900.000000,300.000000]);
dshadow(L6);
fadeE(L6,2.000000,3.000000,40.000000,80.000000);
(function(){var p=L6.property("Position");p.setValueAtTime(2.000000,[900.000000,329.224000]);p.setValueAtTime(3.000000,[900.000000,300.000000]);ezE(p,40.000000,80.000000);})();
try{L6.inPoint=2.000000;}catch(err){}
comp.openInViewer();app.endUndoGroup();