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
var PC0=proj.items.addComp("\ub77c\ubca8_1",100,40,1.0,6.000000,29.970000);
PC0.layers.add(imp("f_00000.png")).name="\ubc30\uacbd";
(function(){var tl=PC0.layers.addText("A");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
var L0=TG.layers.add(PC0);L0.name="\ub77c\ubca8_1";
L0.property("Position").setValue([10.000000,20.000000]);
dshadow(L0);
fadeL(L0,0.000000,1.000000);
var PC1=proj.items.addComp("\ub77c\ubca8_2",100,40,1.0,6.000000,29.970000);
PC1.layers.add(imp("f_00001.png")).name="\ubc30\uacbd";
(function(){var tl=PC1.layers.addText("B");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
var L1=TG.layers.add(PC1);L1.name="\ub77c\ubca8_2";
L1.property("Position").setValue([10.000000,20.000000]);
dshadow(L1);
fadeL(L1,0.000500,1.000500);
var PC2=proj.items.addComp("\ub77c\ubca8_3",100,40,1.0,6.000000,29.970000);
PC2.layers.add(imp("f_00002.png")).name="\ubc30\uacbd";
(function(){var tl=PC2.layers.addText("C");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
var L2=TG.layers.add(PC2);L2.name="\ub77c\ubca8_3";
L2.property("Position").setValue([10.000000,20.000000]);
dshadow(L2);
var PC3=proj.items.addComp("\ub77c\ubca8_4",100,40,1.0,6.000000,29.970000);
PC3.layers.add(imp("f_00003.png")).name="\ubc30\uacbd";
(function(){var tl=PC3.layers.addText("D");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
var L3=TG.layers.add(PC3);L3.name="\ub77c\ubca8_4";
L3.property("Position").setValue([10.000000,20.000000]);
dshadow(L3);
fadeL(L3,2.000000,3.000000);
try{L3.inPoint=2.000000;}catch(err){}
var PC4=proj.items.addComp("\ub77c\ubca8_5",100,40,1.0,6.000000,29.970000);
PC4.layers.add(imp("f_00004.png")).name="\ubc30\uacbd";
(function(){var tl=PC4.layers.addText("E");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([50.000000,20.000000]);})();
var L4=TG.layers.add(PC4);L4.name="\ub77c\ubca8_5";
L4.property("Position").setValue([10.000000,20.000000]);
dshadow(L4);
fadeL(L4,2.000000,2.300000);
(function(){var p=L4.property("Position");p.setValueAtTime(2.000000,[10.000000,6.500000]);p.setValueAtTime(2.300000,[10.000000,20.000000]);ez2(p);})();
try{L4.inPoint=2.000000;}catch(err){}
comp.openInViewer();app.endUndoGroup();