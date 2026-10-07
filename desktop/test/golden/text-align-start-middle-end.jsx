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
var L0=addT("\uc67c\ucabd","\uc81c\ubaa9_1");
(function(){var d=L0.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L0.property("Source Text").setValue(d);})();
L0.property("Position").setValue([100.000000,120.000000]);
dshadow(L0);
var L1=addT("\uac00\uc6b4\ub370","\uc81c\ubaa9_2");
(function(){var d=L1.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L1.property("Source Text").setValue(d);})();
L1.property("Position").setValue([960.000000,120.000000]);
dshadow(L1);
var L2=addT("\uc624\ub978\ucabd","\uc81c\ubaa9_3");
(function(){var d=L2.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.RIGHT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L2.property("Source Text").setValue(d);})();
L2.property("Position").setValue([1800.000000,120.000000]);
dshadow(L2);
var L3=addT("\ubaa8\ub984","\uc81c\ubaa9_4");
(function(){var d=L3.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L3.property("Source Text").setValue(d);})();
L3.property("Position").setValue([10.000000,10.000000]);
dshadow(L3);
var L4=addT("\ub110","\uc81c\ubaa9_5");
(function(){var d=L4.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L4.property("Source Text").setValue(d);})();
L4.property("Position").setValue([10.000000,10.000000]);
dshadow(L4);
var L5=addT("\uc5c6\uc74c","\uc81c\ubaa9_6");
(function(){var d=L5.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L5.property("Source Text").setValue(d);})();
L5.property("Position").setValue([1.000000,2.000000]);
dshadow(L5);
comp.openInViewer();app.endUndoGroup();