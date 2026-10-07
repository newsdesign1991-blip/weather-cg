app.beginUndoGroup("WeatherCG");
var proj=app.project;
var dir="C:/WCG/frames/sid01";
var comp=proj.items.addComp("WeatherCG_\ud55c\uae00_\u1f300_\"q\"\\",1920,1080,1.0,6.000000,29.970000);
var TG=comp;
function imp(f){var io=new ImportOptions(File(dir+"/"+f));return proj.importFile(io);}
function addL(f,nm){var l=TG.layers.add(imp(f));l.name=nm;return l;}
function hx(h){h=String(h).replace("#","");return [parseInt(h.substr(0,2),16)/255,parseInt(h.substr(2,2),16)/255,parseInt(h.substr(4,2),16)/255];}
function addT(txt,nm){var l=TG.layers.addText(txt);l.name=nm;return l;}
function ez2(prop){var A=[new KeyframeEase(0,33)],B=[new KeyframeEase(0,75)];try{prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function fadeL(l,s,e){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ez2(op);}
function ezR(prop){try{var n=1;try{n=prop.value.length||1;}catch(e){n=1;}var A=[],B=[];for(var i=0;i<n;i++){A.push(new KeyframeEase(0,33));B.push(new KeyframeEase(0,75));}prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function dshadow(l){try{var e=l.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");e.property("Shadow Color").setValue(hx("#000814"));e.property("Opacity").setValue(114.750000);e.property("Direction").setValue(180.000000);e.property("Distance").setValue(8.000000);e.property("Softness").setValue(20.000000);}catch(err){}}
var L0=addL("f_00000.png","C:\\path\\to\\f.png/x.png");
var L1=addT("\ud55c\uae00 \uc81c\ubaa9","\ud55c\uae00 \uc81c\ubaa9");
(function(){var d=L1.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#ABCDEF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L1.property("Source Text").setValue(d);})();
L1.property("Position").setValue([10.000000,10.000000]);
dshadow(L1);
var L2=addT("\u1f300\ud0dc\ud48d\u1f600","\u1f300\ud0dc\ud48d\u1f600");
(function(){var d=L2.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#ABCDEF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L2.property("Source Text").setValue(d);})();
L2.property("Position").setValue([10.000000,11.000000]);
dshadow(L2);
var L3=addT("\u20000\uc5c6\ub294\uae00\uc790","\u20000\uc5c6\ub294\uae00\uc790");
(function(){var d=L3.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#ABCDEF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L3.property("Source Text").setValue(d);})();
L3.property("Position").setValue([10.000000,12.000000]);
dshadow(L3);
var L4=addT("say \"hi\"","say \"hi\"");
(function(){var d=L4.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#ABCDEF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L4.property("Source Text").setValue(d);})();
L4.property("Position").setValue([10.000000,13.000000]);
dshadow(L4);
var L5=addT("C:\\path\\to\\f.png","C:\\path\\to\\f.png");
(function(){var d=L5.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#ABCDEF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L5.property("Source Text").setValue(d);})();
L5.property("Position").setValue([10.000000,14.000000]);
dshadow(L5);
var L6=addT("\uc904\u000a\ubc14\uafc8\u000d\u000a\ud0ed\u0009\ub05d","\uc904\u000a\ubc14\uafc8\u000d\u000a\ud0ed\u0009\ub05d");
(function(){var d=L6.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#ABCDEF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L6.property("Source Text").setValue(d);})();
L6.property("Position").setValue([10.000000,15.000000]);
dshadow(L6);
var L7=addT("nul\u0000del\u007f","nul\u0000del\u007f");
(function(){var d=L7.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#ABCDEF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L7.property("Source Text").setValue(d);})();
L7.property("Position").setValue([10.000000,16.000000]);
dshadow(L7);
var L8=addT("lone\ud800sur","lone\ud800sur");
(function(){var d=L8.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#ABCDEF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L8.property("Source Text").setValue(d);})();
L8.property("Position").setValue([10.000000,17.000000]);
dshadow(L8);
var L9=addT("\u2028\u2029","\u2028\u2029");
(function(){var d=L9.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#ABCDEF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L9.property("Source Text").setValue(d);})();
L9.property("Position").setValue([10.000000,18.000000]);
dshadow(L9);
var L10=addT("\u00e9\u00ff\u0100","\u00e9\u00ff\u0100");
(function(){var d=L10.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#ABCDEF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L10.property("Source Text").setValue(d);})();
L10.property("Position").setValue([10.000000,19.000000]);
dshadow(L10);
var L11=addT("~ !#$%&'()*+,-./","~ !#$%&'()*+,-./");
(function(){var d=L11.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#ABCDEF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L11.property("Source Text").setValue(d);})();
L11.property("Position").setValue([10.000000,20.000000]);
dshadow(L11);
var LG12=proj.items.addComp("\u1f300\ud0dc\ud48d\u1f600",200,100,1.0,6.000000,29.970000);
(function(){var sl=LG12.layers.addShape();sl.name="\ud55c\uae00 \uc81c\ubaa9_\ub124\ubaa8";var root=sl.property("ADBE Root Vectors Group");var vg=root.addProperty("ADBE Vector Group");var ct=vg.property("ADBE Vectors Group");var rc=ct.addProperty("ADBE Vector Shape - Rect");rc.property("ADBE Vector Rect Size").setValue([10.000000,10.000000]);rc.property("ADBE Vector Rect Roundness").setValue(0.000000);var fl=ct.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("\"#FFF\\"));sl.property("Anchor Point").setValue([0,0]);sl.property("Position").setValue([5.000000,5.000000]);})();
(function(){var tl=LG12.layers.addText("\ud55c\uae00 \uc81c\ubaa9");tl.name="\ud55c\uae00 \uc81c\ubaa9_\uae00\uc790";var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-SemiBold";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);var r=tl.sourceRectAtTime(0,false);tl.property("Anchor Point").setValue([r.left,r.top+r.height/2]);tl.property("Position").setValue([12.000000,5.000000]);})();
(function(){var sl=LG12.layers.addShape();sl.name="\u1f300\ud0dc\ud48d\u1f600_\ub124\ubaa8";var root=sl.property("ADBE Root Vectors Group");var vg=root.addProperty("ADBE Vector Group");var ct=vg.property("ADBE Vectors Group");var rc=ct.addProperty("ADBE Vector Shape - Rect");rc.property("ADBE Vector Rect Size").setValue([10.000000,10.000000]);rc.property("ADBE Vector Rect Roundness").setValue(0.000000);var fl=ct.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("\"#FFF\\"));sl.property("Anchor Point").setValue([0,0]);sl.property("Position").setValue([5.000000,5.000000]);})();
(function(){var tl=LG12.layers.addText("\u1f300\ud0dc\ud48d\u1f600");tl.name="\u1f300\ud0dc\ud48d\u1f600_\uae00\uc790";var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-SemiBold";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);var r=tl.sourceRectAtTime(0,false);tl.property("Anchor Point").setValue([r.left,r.top+r.height/2]);tl.property("Position").setValue([12.000000,5.000000]);})();
(function(){var sl=LG12.layers.addShape();sl.name="\u20000\uc5c6\ub294\uae00\uc790_\ub124\ubaa8";var root=sl.property("ADBE Root Vectors Group");var vg=root.addProperty("ADBE Vector Group");var ct=vg.property("ADBE Vectors Group");var rc=ct.addProperty("ADBE Vector Shape - Rect");rc.property("ADBE Vector Rect Size").setValue([10.000000,10.000000]);rc.property("ADBE Vector Rect Roundness").setValue(0.000000);var fl=ct.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("\"#FFF\\"));sl.property("Anchor Point").setValue([0,0]);sl.property("Position").setValue([5.000000,5.000000]);})();
(function(){var tl=LG12.layers.addText("\u20000\uc5c6\ub294\uae00\uc790");tl.name="\u20000\uc5c6\ub294\uae00\uc790_\uae00\uc790";var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-SemiBold";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);var r=tl.sourceRectAtTime(0,false);tl.property("Anchor Point").setValue([r.left,r.top+r.height/2]);tl.property("Position").setValue([12.000000,5.000000]);})();
(function(){var sl=LG12.layers.addShape();sl.name="say \"hi\"_\ub124\ubaa8";var root=sl.property("ADBE Root Vectors Group");var vg=root.addProperty("ADBE Vector Group");var ct=vg.property("ADBE Vectors Group");var rc=ct.addProperty("ADBE Vector Shape - Rect");rc.property("ADBE Vector Rect Size").setValue([10.000000,10.000000]);rc.property("ADBE Vector Rect Roundness").setValue(0.000000);var fl=ct.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("\"#FFF\\"));sl.property("Anchor Point").setValue([0,0]);sl.property("Position").setValue([5.000000,5.000000]);})();
(function(){var tl=LG12.layers.addText("say \"hi\"");tl.name="say \"hi\"_\uae00\uc790";var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-SemiBold";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);var r=tl.sourceRectAtTime(0,false);tl.property("Anchor Point").setValue([r.left,r.top+r.height/2]);tl.property("Position").setValue([12.000000,5.000000]);})();
var L12=TG.layers.add(LG12);L12.name="\u1f300\ud0dc\ud48d\u1f600";
L12.property("Position").setValue([0.000000,0.000000]);
var PC13=proj.items.addComp("\ub77c\ubca8_1",100,40,1.0,6.000000,29.970000);
PC13.layers.add(imp("f_00001.png")).name="\ubc30\uacbd";
(function(){var tl=PC13.layers.addText("\ud55c\uae00 \uc81c\ubaa9");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("say \"hi\"");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
(function(){var tl=PC13.layers.addText("\u1f300\ud0dc\ud48d\u1f600");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("say \"hi\"");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
(function(){var tl=PC13.layers.addText("\u20000\uc5c6\ub294\uae00\uc790");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("say \"hi\"");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
(function(){var tl=PC13.layers.addText("say \"hi\"");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("say \"hi\"");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
(function(){var tl=PC13.layers.addText("C:\\path\\to\\f.png");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("say \"hi\"");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
(function(){var tl=PC13.layers.addText("\uc904\u000a\ubc14\uafc8\u000d\u000a\ud0ed\u0009\ub05d");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("say \"hi\"");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
(function(){var tl=PC13.layers.addText("nul\u0000del\u007f");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("say \"hi\"");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
(function(){var tl=PC13.layers.addText("lone\ud800sur");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("say \"hi\"");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
(function(){var tl=PC13.layers.addText("\u2028\u2029");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("say \"hi\"");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
(function(){var tl=PC13.layers.addText("\u00e9\u00ff\u0100");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("say \"hi\"");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
(function(){var tl=PC13.layers.addText("~ !#$%&'()*+,-./");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("say \"hi\"");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
var L13=TG.layers.add(PC13);L13.name="\ub77c\ubca8_1";
L13.property("Position").setValue([1.000000,2.000000]);
dshadow(L13);
fadeL(L13,1.000000,2.000000);
try{L13.inPoint=1.000000;}catch(err){}
comp.openInViewer();app.endUndoGroup();