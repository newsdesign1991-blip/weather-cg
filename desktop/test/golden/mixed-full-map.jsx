app.beginUndoGroup("WeatherCG");
var proj=app.project;
var dir="C:/WCG/frames/sid01";
var comp=proj.items.addComp("WeatherCG_20261007_0930",1920,1080,1.0,6.000000,29.970000);
var TG=comp;
function imp(f){var io=new ImportOptions(File(dir+"/"+f));return proj.importFile(io);}
function addL(f,nm){var l=TG.layers.add(imp(f));l.name=nm;return l;}
function hx(h){h=String(h).replace("#","");return [parseInt(h.substr(0,2),16)/255,parseInt(h.substr(2,2),16)/255,parseInt(h.substr(4,2),16)/255];}
function addT(txt,nm){var l=TG.layers.addText(txt);l.name=nm;return l;}
function ez2(prop){var A=[new KeyframeEase(0,33)],B=[new KeyframeEase(0,75)];try{prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function fadeL(l,s,e){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ez2(op);}
function ezR(prop){try{var n=1;try{n=prop.value.length||1;}catch(e){n=1;}var A=[],B=[];for(var i=0;i<n;i++){A.push(new KeyframeEase(0,33));B.push(new KeyframeEase(0,75));}prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function dshadow(l){try{var e=l.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");e.property("Shadow Color").setValue(hx("#000814"));e.property("Opacity").setValue(114.750000);e.property("Direction").setValue(180.000000);e.property("Distance").setValue(8.000000);e.property("Softness").setValue(20.000000);}catch(err){}}
var L0=addL("f_00000.png","\ubc30\uacbd\u00b7\uc9c0\ub3c4");
var L1=addL("f_00001.png","\uc0c9\uce60_FFD400");
fadeL(L1,1.000000,2.000000);
try{L1.inPoint=1.000000;}catch(err){}
var L2=addL("f_00002.png","\uc0c9\uce60_F5A623");
fadeL(L2,1.166834,2.166834);
try{L2.inPoint=1.166834;}catch(err){}
var L3=addL("f_00003.png","\uc0c9\uce60_E5231E");
fadeL(L3,1.333667,2.333667);
try{L3.inPoint=1.333667;}catch(err){}
var L4=addL("f_00004.png","\ube0c\ub7ec\uc26c_F5A623");
fadeL(L4,1.000000,2.000000);
try{L4.inPoint=1.000000;}catch(err){}
var L5=addL("f_00005.png","\uacbd\uacc4\uc120");
var L6=addL("f_00006.png","\uc0b0(\ubc14\ud0d5)");
var L7=addL("f_00007.png","\uc0b0(\uc0c9)");
fadeL(L7,1.000000,2.000000);
try{L7.inPoint=1.000000;}catch(err){}
var PC8=proj.items.addComp("\ub77c\ubca8_1",132,64,1.0,6.000000,29.970000);
PC8.layers.add(imp("f_00008.png")).name="\ubc30\uacbd";
(function(){var tl=PC8.layers.addText("\uc11c\uc6b8");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Bold";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([66.000000,42.200000]);})();
var L8=TG.layers.add(PC8);L8.name="\ub77c\ubca8_1";
L8.property("Position").setValue([640.500000,380.250000]);
dshadow(L8);
fadeL(L8,1.000000,2.000000);
(function(){var p=L8.property("Position");p.setValueAtTime(1.000000,[640.500000,406.250000]);p.setValueAtTime(2.000000,[640.500000,380.250000]);ez2(p);})();
try{L8.inPoint=1.000000;}catch(err){}
var PC9=proj.items.addComp("\ub77c\ubca8_2",150,64,1.0,6.000000,29.970000);
PC9.layers.add(imp("f_00009.png")).name="\ubc30\uacbd";
(function(){var tl=PC9.layers.addText("\ub300\uad6c 33\u00b0");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#111111");try{d.font="SUITE-ExtraBold";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=-20.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([75.000000,42.200000]);})();
var L9=TG.layers.add(PC9);L9.name="\ub77c\ubca8_2";
L9.property("Position").setValue([900.200000,600.700000]);
dshadow(L9);
fadeL(L9,1.333667,2.333667);
(function(){var p=L9.property("Position");p.setValueAtTime(1.333667,[900.200000,626.700000]);p.setValueAtTime(2.333667,[900.200000,600.700000]);ez2(p);})();
try{L9.inPoint=1.333667;}catch(err){}
var L10=addT("\ub0b4\uc77c \ub0a0\uc528 \u2192 \ud638\uc6b0","\uc81c\ubaa9_\ub0b4\uc77c \ub0a0\uc528");
(function(){var d=L10.property("Source Text").value;d.fontSize=64;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-ExtraBold";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=-20.000000;}catch(e){}L10.property("Source Text").setValue(d);})();
L10.property("Position").setValue([80.000000,110.000000]);
dshadow(L10);
var LG11=proj.items.addComp("\ubc94\ub840",221,96,1.0,6.000000,29.970000);
(function(){var sl=LG11.layers.addShape();sl.name="\ud638\uc6b0\uacbd\ubcf4_\ub124\ubaa8";var root=sl.property("ADBE Root Vectors Group");var vg=root.addProperty("ADBE Vector Group");var ct=vg.property("ADBE Vectors Group");var rc=ct.addProperty("ADBE Vector Shape - Rect");rc.property("ADBE Vector Rect Size").setValue([36.000000,24.000000]);rc.property("ADBE Vector Rect Roundness").setValue(6.000000);var fl=ct.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("#E5231E"));sl.property("Anchor Point").setValue([0,0]);sl.property("Position").setValue([18.000000,12.000000]);})();
(function(){var tl=LG11.layers.addText("\ud638\uc6b0\uacbd\ubcf4");tl.name="\ud638\uc6b0\uacbd\ubcf4_\uae00\uc790";var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-SemiBold";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);var r=tl.sourceRectAtTime(0,false);tl.property("Anchor Point").setValue([r.left,r.top+r.height/2]);tl.property("Position").setValue([48.000000,12.000000]);})();
(function(){var sl=LG11.layers.addShape();sl.name="\ud638\uc6b0\uc8fc\uc758\ubcf4_\ub124\ubaa8";var root=sl.property("ADBE Root Vectors Group");var vg=root.addProperty("ADBE Vector Group");var ct=vg.property("ADBE Vectors Group");var rc=ct.addProperty("ADBE Vector Shape - Rect");rc.property("ADBE Vector Rect Size").setValue([36.000000,24.000000]);rc.property("ADBE Vector Rect Roundness").setValue(6.000000);var fl=ct.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("#F5A623"));sl.property("Anchor Point").setValue([0,0]);sl.property("Position").setValue([18.000000,48.000000]);})();
(function(){var tl=LG11.layers.addText("\ud638\uc6b0\uc8fc\uc758\ubcf4");tl.name="\ud638\uc6b0\uc8fc\uc758\ubcf4_\uae00\uc790";var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-SemiBold";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);var r=tl.sourceRectAtTime(0,false);tl.property("Anchor Point").setValue([r.left,r.top+r.height/2]);tl.property("Position").setValue([48.000000,48.000000]);})();
var L11=TG.layers.add(LG11);L11.name="\ubc94\ub840";
L11.property("Position").setValue([1700.000000,980.000000]);
comp.openInViewer();app.endUndoGroup();