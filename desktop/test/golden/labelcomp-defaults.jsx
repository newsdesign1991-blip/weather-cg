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
var PC0=proj.items.addComp("L",99,40,1.0,6.000000,29.970000);
PC0.layers.add(imp("")).name="\ubc30\uacbd";
(function(){var tl=PC0.layers.addText("\uae30\ubcf8");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([49.500000,20.000000]);})();
(function(){var tl=PC0.layers.addText("z");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=133.333333;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([49.500000,20.000000]);})();
(function(){var tl=PC0.layers.addText("");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([49.500000,20.000000]);})();
var L0=TG.layers.add(PC0);L0.name="L";
L0.property("Position").setValue([0.000000,0.000000]);
dshadow(L0);
var PC1=proj.items.addComp("label",1,1,1.0,6.000000,29.970000);
PC1.layers.add(imp("bg.png")).name="\ubc30\uacbd";
var L1=TG.layers.add(PC1);L1.name="label";
L1.property("Position").setValue([0.000000,0.000000]);
dshadow(L1);
var PC2=proj.items.addComp("M",101,41,1.0,6.000000,29.970000);
PC2.layers.add(imp("")).name="\ubc30\uacbd";
(function(){var tl=PC2.layers.addText("x");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([-0.000000,0.000000]);})();
var L2=TG.layers.add(PC2);L2.name="M";
L2.property("Position").setValue([0.000000,0.000000]);
dshadow(L2);
fadeL(L2,3.000001,3.250001);
(function(){var p=L2.property("Position");p.setValueAtTime(3.000001,[0.000000,0.000000]);p.setValueAtTime(3.250001,[0.000000,0.000000]);ez2(p);})();
try{L2.inPoint=3.000001;}catch(err){}
comp.openInViewer();app.endUndoGroup();