app.beginUndoGroup("WeatherCG");
var proj=app.project;
var dir="C:/WCG/frames/sid01";
var comp=proj.items.addComp("WeatherCG_20261007_0930",1920,1080,1.0,6.000000,29.970000);
var vfc=proj.items.addComp("VF_\uc804\uccb4",1920,1080,1.0,6.000000,29.970000);
var TG=vfc;
function imp(f){var io=new ImportOptions(File(dir+"/"+f));return proj.importFile(io);}
function addL(f,nm){var l=TG.layers.add(imp(f));l.name=nm;return l;}
function hx(h){h=String(h).replace("#","");return [parseInt(h.substr(0,2),16)/255,parseInt(h.substr(2,2),16)/255,parseInt(h.substr(4,2),16)/255];}
function addT(txt,nm){var l=TG.layers.addText(txt);l.name=nm;return l;}
function ez2(prop){var A=[new KeyframeEase(0,33)],B=[new KeyframeEase(0,75)];try{prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function fadeL(l,s,e){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ez2(op);}
function ezR(prop){try{var n=1;try{n=prop.value.length||1;}catch(e){n=1;}var A=[],B=[];for(var i=0;i<n;i++){A.push(new KeyframeEase(0,33));B.push(new KeyframeEase(0,75));}prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function dshadow(l){try{var e=l.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");e.property("Shadow Color").setValue(hx("#000814"));e.property("Opacity").setValue(0.019922);e.property("Direction").setValue(179.820951);e.property("Distance").setValue(2.500012);e.property("Softness").setValue(0.015625);}catch(err){}}
var L0=addT("A","t1");
(function(){var d=L0.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L0.property("Source Text").setValue(d);})();
L0.property("Position").setValue([0.007812,-0.007812]);
dshadow(L0);
var L1=addT("A","t2");
(function(){var d=L1.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L1.property("Source Text").setValue(d);})();
L1.property("Position").setValue([0.023438,2.500000]);
dshadow(L1);
var L2=addT("A","t3");
(function(){var d=L2.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L2.property("Source Text").setValue(d);})();
L2.property("Position").setValue([1.000001,123.000000]);
dshadow(L2);
var L3=addT("A","t4");
(function(){var d=L3.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L3.property("Source Text").setValue(d);})();
L3.property("Position").setValue([0.500000,1.500001]);
dshadow(L3);
var L4=addT("A","t5");
(function(){var d=L4.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L4.property("Source Text").setValue(d);})();
L4.property("Position").setValue([1048576.007812,-3.000001]);
dshadow(L4);
var L5=addT("A","t6");
(function(){var d=L5.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L5.property("Source Text").setValue(d);})();
L5.property("Position").setValue([0.000000,0.000002]);
dshadow(L5);
var L6=addL("f_00000.png","f");
fadeL(L6,0.101562,1.000000);
try{L6.inPoint=0.101562;}catch(err){}
var L7=addL("f_00001.png","g");
fadeL(L7,2.500000,3.500001);
try{L7.inPoint=2.500000;}catch(err){}
var PC8=proj.items.addComp("L",15,35,1.0,6.000000,29.970000);
PC8.layers.add(imp("")).name="\ubc30\uacbd";
(function(){var tl=PC8.layers.addText("t");var d=tl.property("Source Text").value;d.fontSize=15;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Medium";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.520833;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([7.500000,17.500000]);})();
var L8=TG.layers.add(PC8);L8.name="L";
L8.property("Position").setValue([0.007812,0.039062]);
dshadow(L8);
fadeL(L8,0.007812,1.000000);
(function(){var p=L8.property("Position");p.setValueAtTime(0.007812,[0.007812,0.046875]);p.setValueAtTime(1.000000,[0.007812,0.039062]);ez2(p);})();
try{L8.inPoint=0.007812;}catch(err){}
var vfl=comp.layers.add(vfc);vfl.name="VF_\uc9c4\uc785";
var pp=vfl.property("Position");var cc=[comp.width/2,comp.height/2];
pp.setValueAtTime(0.007812,[cc[0]+2.500000,cc[1]]);pp.setValueAtTime(1.007813,cc);
var vo=vfl.property("Opacity");vo.setValueAtTime(0.007812,0);vo.setValueAtTime(1.007813,100);
ez2(pp);ez2(vo);
comp.openInViewer();app.endUndoGroup();