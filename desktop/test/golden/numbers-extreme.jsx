app.beginUndoGroup("WeatherCG");
var proj=app.project;
var dir="C:/WCG/frames/sid01";
var comp=proj.items.addComp("W",10000000000000000000000,9007199254740992,1.0,1000000000000000000000.000000,0.000000);
var TG=comp;
function imp(f){var io=new ImportOptions(File(dir+"/"+f));return proj.importFile(io);}
function addL(f,nm){var l=TG.layers.add(imp(f));l.name=nm;return l;}
function hx(h){h=String(h).replace("#","");return [parseInt(h.substr(0,2),16)/255,parseInt(h.substr(2,2),16)/255,parseInt(h.substr(4,2),16)/255];}
function addT(txt,nm){var l=TG.layers.addText(txt);l.name=nm;return l;}
function ez2(prop){var A=[new KeyframeEase(0,33)],B=[new KeyframeEase(0,75)];try{prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function fadeL(l,s,e){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ez2(op);}
function ezR(prop){try{var n=1;try{n=prop.value.length||1;}catch(e){n=1;}var A=[],B=[];for(var i=0;i<n;i++){A.push(new KeyframeEase(0,33));B.push(new KeyframeEase(0,75));}prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function dshadow(l){try{var e=l.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");e.property("Shadow Color").setValue(hx("#000814"));e.property("Opacity").setValue(114.750000);e.property("Direction").setValue(180.000000);e.property("Distance").setValue(8.000000);e.property("Softness").setValue(20.000000);}catch(err){}}
var L0=addT("N","neg");
(function(){var d=L0.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L0.property("Source Text").setValue(d);})();
L0.property("Position").setValue([-123.456000,-0.000000]);
dshadow(L0);
var L1=addT("T","tiny");
(function(){var d=L1.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L1.property("Source Text").setValue(d);})();
L1.property("Position").setValue([0.000000,0.000000]);
dshadow(L1);
var L2=addT("T","tiny2");
(function(){var d=L2.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L2.property("Source Text").setValue(d);})();
L2.property("Position").setValue([-0.000000,0.000000]);
dshadow(L2);
var L3=addT("B","big");
(function(){var d=L3.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L3.property("Source Text").setValue(d);})();
L3.property("Position").setValue([1000000000000000000000.000000,10000000000000000000000.000000]);
dshadow(L3);
var L4=addT("H","huge");
(function(){var d=L4.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L4.property("Source Text").setValue(d);})();
L4.property("Position").setValue([1500000000000000078757140382806630373056702871662238732373781173267703686983362293679557062620671796065556665749325817265413784853040645863467188277180060474272580801389863705606745350692182135089053429852456199917621678558451461320111979114170213741868888183230085264257173504208294580298189100810240.000000,-179769313486231570814527423731704356798070567525844996598917476803157260780028538760589558632766878171540458953514382464234321326889464182768467546703537516986049910576551282076245490090389328944075868508455133942304583236903222948165808559332123348274797826204144723168738177180919299881250404026184124858368.000000]);
dshadow(L4);
var L5=addT("P","prec");
(function(){var d=L5.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L5.property("Source Text").setValue(d);})();
L5.property("Position").setValue([123456789.123457,0.100000]);
dshadow(L5);
var L6=addT("S","subn");
(function(){var d=L6.property("Source Text").value;d.fontSize=60;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Regular";}catch(e){}try{d.justification=ParagraphJustification.LEFT_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}L6.property("Source Text").setValue(d);})();
L6.property("Position").setValue([0.000000,9007199254740992.000000]);
dshadow(L6);
var L7=addL("f_00000.png","f");
fadeL(L7,0.000000,1000000000000000052504760255204420248704468581108159154915854115511802457988908195786371375080447864043704443832883878176942523235360430575644792184786706982848387200926575803737830233794788090059368953234970799945081119038967640880074652742780142494579258788820056842838115669472196386865459400540160.000000);
comp.openInViewer();app.endUndoGroup();