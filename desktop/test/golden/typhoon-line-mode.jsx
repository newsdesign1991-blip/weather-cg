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
var CAM=null;
var bgL=TG.layers.add(imp("f_00000.png"));bgL.name="\uc9c0\ub3c4";if(CAM){bgL.parent=CAM;}
var icC=imp("f_00001.png"),icG=imp("f_00002.png");
var icTC=imp("f_00003.png"),icTG=imp("f_00004.png");
var icEC=imp("f_00005.png"),icEG=imp("f_00006.png");
var TP0=TG.layers.addNull();TP0.name="TP0";TP0.property("Position").setValue([1210.400000,980.200000]);TP0.enabled=false;if(CAM){TP0.parent=CAM;}
var TP1=TG.layers.addNull();TP1.name="TP1";TP1.property("Position").setValue([1150.800000,905.600000]);TP1.enabled=false;if(CAM){TP1.parent=CAM;}
var TP2=TG.layers.addNull();TP2.name="TP2";TP2.property("Position").setValue([1092.300000,830.100000]);TP2.enabled=false;if(CAM){TP2.parent=CAM;}
var TP3=TG.layers.addNull();TP3.name="TP3";TP3.property("Position").setValue([1040.500000,742.800000]);TP3.enabled=false;if(CAM){TP3.parent=CAM;}
try{var sl=TG.layers.addShape();sl.name="\uacbd\ub85c";sl.property("Position").setValue([0,0]);sl.property("Anchor Point").setValue([0,0]);if(CAM){sl.parent=CAM;}var root=sl.property("ADBE Root Vectors Group");var gp=root.addProperty("ADBE Vector Group");var ct=gp.property("ADBE Vectors Group");var pa=ct.addProperty("ADBE Vector Shape - Group");pa.property("ADBE Vector Shape").expression="var Q=[thisComp.layer(\"TP0\").position,thisComp.layer(\"TP1\").position,thisComp.layer(\"TP2\").position,thisComp.layer(\"TP3\").position];for(var i=0;i<Q.length;i++){Q[i]=[Q[i][0],Q[i][1]];}createPath(Q,[],[],false);";var tm=ct.addProperty("ADBE Vector Filter - Trim");var en=tm.property("ADBE Vector Trim End");en.setValueAtTime(1.000000,0);en.setValueAtTime(3.000000,100);var st=ct.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(hx("#FF8800"));st.property("ADBE Vector Stroke Width").setValue(23.750000);try{st.property("ADBE Vector Stroke Line Cap").setValue(2);st.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e){}}catch(e){}
try{var ic=TG.layers.add(icC);ic.name="\uc544\uc774\ucf583";ic.parent=TP3;ic.property("Anchor Point").setValue([135.000000,135.000000]);ic.property("Position").setValue([0,0]);ic.property("Scale").setValue([18.888889,18.888889]);var op=ic.property("Opacity");op.setValueAtTime(3.000000,0);op.setValueAtTime(3.220000,100);ezR(op);}catch(e){}
})();
comp.openInViewer();app.endUndoGroup();