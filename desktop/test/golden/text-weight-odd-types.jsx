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
var L0=addT("W","w0");
(function(){var d=L0.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Bold";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L0.property("Source Text").setValue(d);})();
L0.property("Position").setValue([10.000000,0.000000]);
dshadow(L0);
var L1=addT("W","w1");
(function(){var d=L1.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-ExtraBold";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L1.property("Source Text").setValue(d);})();
L1.property("Position").setValue([10.000000,10.000000]);
dshadow(L1);
var L2=addT("W","w2");
(function(){var d=L2.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L2.property("Source Text").setValue(d);})();
L2.property("Position").setValue([10.000000,20.000000]);
dshadow(L2);
var L3=addT("W","w3");
(function(){var d=L3.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L3.property("Source Text").setValue(d);})();
L3.property("Position").setValue([10.000000,30.000000]);
dshadow(L3);
var L4=addT("W","w4");
(function(){var d=L4.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L4.property("Source Text").setValue(d);})();
L4.property("Position").setValue([10.000000,40.000000]);
dshadow(L4);
var L5=addT("W","w5");
(function(){var d=L5.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L5.property("Source Text").setValue(d);})();
L5.property("Position").setValue([10.000000,50.000000]);
dshadow(L5);
var L6=addT("W","w6");
(function(){var d=L6.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Light";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L6.property("Source Text").setValue(d);})();
L6.property("Position").setValue([10.000000,60.000000]);
dshadow(L6);
var L7=addT("W","w7");
(function(){var d=L7.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L7.property("Source Text").setValue(d);})();
L7.property("Position").setValue([10.000000,70.000000]);
dshadow(L7);
var L8=addT("W","w8");
(function(){var d=L8.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Light";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L8.property("Source Text").setValue(d);})();
L8.property("Position").setValue([10.000000,80.000000]);
dshadow(L8);
var L9=addT("W","w9");
(function(){var d=L9.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L9.property("Source Text").setValue(d);})();
L9.property("Position").setValue([10.000000,90.000000]);
dshadow(L9);
var L10=addT("W","w10");
(function(){var d=L10.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-SemiBold";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L10.property("Source Text").setValue(d);})();
L10.property("Position").setValue([10.000000,100.000000]);
dshadow(L10);
var L11=addT("W","w11");
(function(){var d=L11.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Heavy";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L11.property("Source Text").setValue(d);})();
L11.property("Position").setValue([10.000000,110.000000]);
dshadow(L11);
var L12=addT("W","w12");
(function(){var d=L12.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L12.property("Source Text").setValue(d);})();
L12.property("Position").setValue([10.000000,120.000000]);
dshadow(L12);
comp.openInViewer();app.endUndoGroup();