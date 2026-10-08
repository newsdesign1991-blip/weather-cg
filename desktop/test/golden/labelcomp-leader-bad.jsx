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
var PC0=proj.items.addComp("\ub77c\ubca8_1",132,60,1.0,6.000000,29.970000);
PC0.layers.add(imp("f_00001.png")).name="\ubc30\uacbd";
(function(){var tl=PC0.layers.addText("11");var d=tl.property("Source Text").value;d.fontSize=40;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Bold";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([66.000000,43.600000]);})();
var L0=TG.layers.add(PC0);L0.name="\ub77c\ubca8_1";
L0.property("Position").setValue([500.000000,300.000000]);
dshadow(L0);
fadeE(L0,1.000000,2.000000,34.000000,85.000000);
(function(){var p=L0.property("Position");p.setValueAtTime(1.000000,[500.000000,326.000000]);p.setValueAtTime(2.000000,[500.000000,300.000000]);ezE(p,34.000000,85.000000);})();
try{L0.inPoint=1.000000;}catch(err){}
var PC1=proj.items.addComp("\ub77c\ubca8_2",132,60,1.0,6.000000,29.970000);
PC1.layers.add(imp("f_00002.png")).name="\ubc30\uacbd";
(function(){var tl=PC1.layers.addText("12");var d=tl.property("Source Text").value;d.fontSize=40;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Bold";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([66.000000,43.600000]);})();
var L1=TG.layers.add(PC1);L1.name="\ub77c\ubca8_2";
L1.property("Position").setValue([600.000000,300.000000]);
dshadow(L1);
fadeL(L1,1.000000,2.000000);
(function(){var p=L1.property("Position");p.setValueAtTime(1.000000,[600.000000,326.000000]);p.setValueAtTime(2.000000,[600.000000,300.000000]);ez2(p);})();
try{L1.inPoint=1.000000;}catch(err){}
var PC2=proj.items.addComp("\ub77c\ubca8_3",132,60,1.0,6.000000,29.970000);
PC2.layers.add(imp("f_00003.png")).name="\ubc30\uacbd";
(function(){var tl=PC2.layers.addText("13");var d=tl.property("Source Text").value;d.fontSize=40;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Bold";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([66.000000,43.600000]);})();
var L2=TG.layers.add(PC2);L2.name="\ub77c\ubca8_3";
L2.property("Position").setValue([700.000000,300.000000]);
dshadow(L2);
fadeL(L2,1.000000,2.000000);
(function(){var p=L2.property("Position");p.setValueAtTime(1.000000,[700.000000,326.000000]);p.setValueAtTime(2.000000,[700.000000,300.000000]);ez2(p);})();
try{L2.inPoint=1.000000;}catch(err){}
(function(){var ln=TG.layers.addShape();ln.name="\ub77c\ubca8_3_\uc9c0\uc2dc\uc120";ln.property("Position").setValue([0,0]);ln.property("Anchor Point").setValue([0,0]);var root=ln.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression="var B=thisComp.layer(\"\\ub77c\\ubca8_3\").transform.position;var P=[1.000000,1.000000],bx=B[0],by=B[1],hw=5.000000;var lft=bx-hw,rgt=bx+hw;var useL=Math.abs(P[0]-lft)<=Math.abs(P[0]-rgt);var ax=useL?lft:rgt,ay=by;var sgn=ax>=P[0]?1:-1;var dyA=Math.abs(ay-P[1]),room=Math.abs(ax-P[0]);var diag=Math.min(dyA,room);var kx=P[0]+sgn*diag,ky=P[1]+(ay>=P[1]?diag:-diag);var GAP=16.000000,kd=Math.sqrt((kx-P[0])*(kx-P[0])+(ky-P[1])*(ky-P[1]))||1;var sx=P[0]+(kx-P[0])/kd*Math.min(GAP,kd*0.9),sy=P[1]+(ky-P[1])/kd*Math.min(GAP,kd*0.9);createPath([[sx,sy],[kx,ky],[ax,ay]],[],[],false);";var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("#FFFFFF"));st.property("ADBE Vector Stroke Width").setValue(0.000000);try{st.property("ADBE Vector Stroke Opacity").setValue(100.000000);st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}try{ln.moveAfter(L2);}catch(e){}fadeL(ln,1.000000,2.000000);try{ln.inPoint=1.000000;}catch(err){}})();
var PC3=proj.items.addComp("\ub77c\ubca8_4",132,60,1.0,6.000000,29.970000);
PC3.layers.add(imp("f_00004.png")).name="\ubc30\uacbd";
(function(){var tl=PC3.layers.addText("14");var d=tl.property("Source Text").value;d.fontSize=40;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Bold";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([66.000000,43.600000]);})();
var L3=TG.layers.add(PC3);L3.name="\ub77c\ubca8_4";
L3.property("Position").setValue([800.000000,300.000000]);
dshadow(L3);
fadeL(L3,1.000000,2.000000);
(function(){var p=L3.property("Position");p.setValueAtTime(1.000000,[800.000000,326.000000]);p.setValueAtTime(2.000000,[800.000000,300.000000]);ez2(p);})();
try{L3.inPoint=1.000000;}catch(err){}
(function(){var ln=TG.layers.addShape();ln.name="\ub77c\ubca8_4_\uc9c0\uc2dc\uc120";ln.property("Position").setValue([0,0]);ln.property("Anchor Point").setValue([0,0]);var root=ln.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression="var B=thisComp.layer(\"\\ub77c\\ubca8_4\").transform.position;var P=[1.000000,1.000000],bx=B[0],by=B[1],hw=5.000000;var lft=bx-hw,rgt=bx+hw;var useL=Math.abs(P[0]-lft)<=Math.abs(P[0]-rgt);var ax=useL?lft:rgt,ay=by;var sgn=ax>=P[0]?1:-1;var dyA=Math.abs(ay-P[1]),room=Math.abs(ax-P[0]);var diag=Math.min(dyA,room);var kx=P[0]+sgn*diag,ky=P[1]+(ay>=P[1]?diag:-diag);var GAP=16.000000,kd=Math.sqrt((kx-P[0])*(kx-P[0])+(ky-P[1])*(ky-P[1]))||1;var sx=P[0]+(kx-P[0])/kd*Math.min(GAP,kd*0.9),sy=P[1]+(ky-P[1])/kd*Math.min(GAP,kd*0.9);createPath([[sx,sy],[kx,ky],[ax,ay]],[],[],false);";var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("#FFFFFF"));st.property("ADBE Vector Stroke Width").setValue(2.400000);try{st.property("ADBE Vector Stroke Opacity").setValue(92.000000);st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}try{ln.moveAfter(L3);}catch(e){}fadeL(ln,1.000000,2.000000);try{ln.inPoint=1.000000;}catch(err){}})();
(function(){var ac=TG.layers.addShape();ac.name="\ub77c\ubca8_4_\uc575\ucee4";ac.property("Position").setValue([0,0]);ac.property("Anchor Point").setValue([0,0]);var root=ac.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");var el=ct.addProperty("ADBE Vector Shape - Ellipse");el.property("ADBE Vector Ellipse Size").setValue([6.000000,6.000000]);el.property("ADBE Vector Ellipse Position").setValue([1.000000,1.000000]);var fl=ct.addProperty("ADBE Vector Graphic - Fill");fl.property("ADBE Vector Fill Color").setValue(hx("#FFFFFF"));var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("#ABCDEF"));st.property("ADBE Vector Stroke Width").setValue(1.600000);fadeL(ac,1.000000,2.000000);try{ac.inPoint=1.000000;}catch(err){}})();
var PC4=proj.items.addComp("\ub77c\ubca8_5",132,60,1.0,6.000000,29.970000);
PC4.layers.add(imp("f_00005.png")).name="\ubc30\uacbd";
(function(){var tl=PC4.layers.addText("15");var d=tl.property("Source Text").value;d.fontSize=40;d.applyFill=true;try{d.applyStroke=false;}catch(e){}d.fillColor=hx("#FFFFFF");try{d.font="SUITE-Bold";}catch(e){}try{d.justification=ParagraphJustification.CENTER_JUSTIFY;}catch(e){}try{d.tracking=0.000000;}catch(e){}tl.property("Source Text").setValue(d);tl.property("Position").setValue([66.000000,43.600000]);})();
var L4=TG.layers.add(PC4);L4.name="\ub77c\ubca8_5";
L4.property("Position").setValue([900.000000,300.000000]);
dshadow(L4);
fadeL(L4,1.000000,2.000000);
(function(){var p=L4.property("Position");p.setValueAtTime(1.000000,[900.000000,326.000000]);p.setValueAtTime(2.000000,[900.000000,300.000000]);ez2(p);})();
try{L4.inPoint=1.000000;}catch(err){}
var L5=addL("f_00009.png","legacy-\ubb38\uc790");
var L6=addL("f_00010.png","legacy-0");
fadeL(L6,1.000000,2.000000);
try{L6.inPoint=1.000000;}catch(err){}
var L7=addL("f_00011.png","legacy-\ucc38");
comp.openInViewer();app.endUndoGroup();