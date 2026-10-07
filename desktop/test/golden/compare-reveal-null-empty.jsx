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
(function(){
var bgL=TG.layers.add(imp("f_00000.png"));bgL.name="\uc9c0\ub3c4";
var C0_0=TG.layers.addNull();C0_0.name="C0_0";C0_0.property("Position").setValue([1200.500000,900.200000]);C0_0.enabled=false;
var C0_1=TG.layers.addNull();C0_1.name="C0_1";C0_1.property("Position").setValue([1150.100000,820.700000]);C0_1.enabled=false;
var C0_2=TG.layers.addNull();C0_2.name="C0_2";C0_2.property("Position").setValue([1100.400000,740.300000]);C0_2.enabled=false;
var ICON0=imp("a.png");
try{var sl=TG.layers.addShape();sl.name="\ube44\uad50\uc1200";sl.property("Position").setValue([0,0]);sl.property("Anchor Point").setValue([0,0]);var root=sl.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression="var Q=[thisComp.layer(\"C0_0\").position,thisComp.layer(\"C0_1\").position,thisComp.layer(\"C0_2\").position];for(var i=0;i<Q.length;i++){Q[i]=[Q[i][0],Q[i][1]];}createPath(Q,[],[],false);";var tm=ct.addProperty("ADBE Vector Filter - Trim");var en=tm.property("ADBE Vector Trim End");en.setValueAtTime(1.000000,0);en.setValueAtTime(3.000000,100);var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("#FF5A5A"));st.property("ADBE Vector Stroke Width").setValue(2.200000);try{st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}}catch(e){}
try{var ic=TG.layers.add(ICON0);ic.name="\uc544\uc774\ucf580_1";ic.parent=C0_1;ic.property("Anchor Point").setValue([135.000000,135.000000]);ic.property("Position").setValue([0,0]);ic.property("Scale").setValue([6.666667,6.666667]);var op=ic.property("Opacity");op.setValueAtTime(1.997925,0);op.setValueAtTime(2.217925,100);ezR(op);}catch(e){}
})();
(function(){
var bgL=TG.layers.add(imp("f_00000.png"));bgL.name="\uc9c0\ub3c4";
var C0_0=TG.layers.addNull();C0_0.name="C0_0";C0_0.property("Position").setValue([1250.500000,905.200000]);C0_0.enabled=false;
var C0_1=TG.layers.addNull();C0_1.name="C0_1";C0_1.property("Position").setValue([1210.100000,830.700000]);C0_1.enabled=false;
var C0_2=TG.layers.addNull();C0_2.name="C0_2";C0_2.property("Position").setValue([1180.400000,760.300000]);C0_2.enabled=false;
var ICON0=imp("b.png");
try{var sl=TG.layers.addShape();sl.name="\ube44\uad50\uc1200";sl.property("Position").setValue([0,0]);sl.property("Anchor Point").setValue([0,0]);var root=sl.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression="var Q=[thisComp.layer(\"C0_0\").position,thisComp.layer(\"C0_1\").position,thisComp.layer(\"C0_2\").position];for(var i=0;i<Q.length;i++){Q[i]=[Q[i][0],Q[i][1]];}createPath(Q,[],[],false);";var tm=ct.addProperty("ADBE Vector Filter - Trim");var en=tm.property("ADBE Vector Trim End");en.setValueAtTime(1.000000,0);en.setValueAtTime(3.000000,100);var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("#4DA3FF"));st.property("ADBE Vector Stroke Width").setValue(2.200000);try{st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}}catch(e){}
try{var ic=TG.layers.add(ICON0);ic.name="\uc544\uc774\ucf580_2";ic.parent=C0_2;ic.property("Anchor Point").setValue([135.000000,135.000000]);ic.property("Position").setValue([0,0]);ic.property("Scale").setValue([6.666667,6.666667]);var op=ic.property("Opacity");op.setValueAtTime(3.000000,0);op.setValueAtTime(3.220000,100);ezR(op);}catch(e){}
})();
(function(){
var bgL=TG.layers.add(imp("x.png"));bgL.name="\uc9c0\ub3c4";
})();
comp.openInViewer();app.endUndoGroup();