app.beginUndoGroup("WeatherCG");
var proj=app.project;
var dir="C:/WCG/frames/sid01";
var comp=proj.items.addComp("[12345678901234567000, 98765432109876540000, 1.5, -12345678901234567000]",12345678901234567000,98765432109876540000,1.0,6.000000,29.970000);
var TG=comp;
function imp(f){var io=new ImportOptions(File(dir+"/"+f));return proj.importFile(io);}
function addL(f,nm){var l=TG.layers.add(imp(f));l.name=nm;return l;}
function hx(h){h=String(h).replace("#","");return [parseInt(h.substr(0,2),16)/255,parseInt(h.substr(2,2),16)/255,parseInt(h.substr(4,2),16)/255];}
function addT(txt,nm){var l=TG.layers.addText(txt);l.name=nm;return l;}
function ez2(prop){var A=[new KeyframeEase(0,33)],B=[new KeyframeEase(0,75)];try{prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function fadeL(l,s,e){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ez2(op);}
function ezR(prop){try{var n=1;try{n=prop.value.length||1;}catch(e){n=1;}var A=[],B=[];for(var i=0;i<n;i++){A.push(new KeyframeEase(0,33));B.push(new KeyframeEase(0,75));}prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function dshadow(l){try{var e=l.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");e.property("Shadow Color").setValue(hx("#000814"));e.property("Opacity").setValue(114.750000);e.property("Direction").setValue(180.000000);e.property("Distance").setValue(8.000000);e.property("Softness").setValue(20.000000);}catch(err){}}
var PC0=proj.items.addComp("12345678901234567000",98765432109876540000,12345678901234567000,1.0,6.000000,29.970000);
PC0.layers.add(imp("12345678901234567000")).name="\ubc30\uacbd";
(function(){var tl=PC0.layers.addText("98765432109876540000");var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([49382716054938271744.000000,6172839450617283584.000000]);})();
var L0=TG.layers.add(PC0);L0.name="12345678901234567000";
L0.property("Position").setValue([0.000000,0.000000]);
dshadow(L0);
var LG1=proj.items.addComp("{'k': 98765432109876540000}",12345678901234567168,40,1.0,6.000000,29.970000);
(function(){var sl=LG1.layers.addShape();sl.name="a_\ub124\ubaa8";var root=sl.property("ADBE Root Vectors Group");var vg=root.addProperty("ADBE Vector Group");var ct=vg.property("ADBE Vectors Group");var rc=ct.addProperty("ADBE Vector Shape - Rect");rc.property("ADBE Vector Rect Size").setValue([1.000000,1.000000]);rc.property("ADBE Vector Rect Roundness").setValue(0.000000);var fl=ct.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("#FFFFFF"));sl.property("Anchor Point").setValue([0,0]);sl.property("Position").setValue([0.500000,0.500000]);})();
(function(){var tl=LG1.layers.addText("[12345678901234567000]");tl.name="a_\uae00\uc790";var d=tl.property("Source Text").value;d.fontSize=30;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-SemiBold";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);var r=tl.sourceRectAtTime(0,false);tl.property("Anchor Point").setValue([r.left,r.top+r.height/2]);tl.property("Position").setValue([0.000000,20.000000]);})();
var L1=TG.layers.add(LG1);L1.name="{'k': 98765432109876540000}";
L1.property("Position").setValue([0.000000,0.000000]);
var L2=addL("12345678901234567000","1152921504606847200");
comp.openInViewer();app.endUndoGroup();