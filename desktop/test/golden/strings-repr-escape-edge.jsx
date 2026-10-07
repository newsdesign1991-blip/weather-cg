app.beginUndoGroup("WeatherCG");
var proj=app.project;
var dir="C:/WCG/frames/sid01";
var comp=proj.items.addComp("['\\x00\\x1f ~\\x7f', '\\x80\\x85\\x9f\\xa0\\xad\u00ff', '\u0100\u0300\\u0378\\u2028\\u2029\\u3000\\ufeff\\ue000\ufffd\\uffff', '\\U000f0000\\U000e0001\\U0010ffff\ud83d\ude00\ud840\udc00', '\\ud800', '\\udfff', '\\udc00\\ud800', '\ud83d\ude00', 'a\\ud83db', \"it's\", 'say \"hi\"', 'both \\' and \"', 'back\\\\slash', '\\t\\n\\r\\x0b\\x0c\\x1b']",1920,1080,1.0,6.000000,29.970000);
var TG=comp;
function imp(f){var io=new ImportOptions(File(dir+"/"+f));return proj.importFile(io);}
function addL(f,nm){var l=TG.layers.add(imp(f));l.name=nm;return l;}
function hx(h){h=String(h).replace("#","");return [parseInt(h.substr(0,2),16)/255,parseInt(h.substr(2,2),16)/255,parseInt(h.substr(4,2),16)/255];}
function addT(txt,nm){var l=TG.layers.addText(txt);l.name=nm;return l;}
function ez2(prop){var A=[new KeyframeEase(0,33)],B=[new KeyframeEase(0,75)];try{prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function fadeL(l,s,e){var op=l.property("Opacity");op.setValueAtTime(s,0);op.setValueAtTime(e,100);ez2(op);}
function ezR(prop){try{var n=1;try{n=prop.value.length||1;}catch(e){n=1;}var A=[],B=[];for(var i=0;i<n;i++){A.push(new KeyframeEase(0,33));B.push(new KeyframeEase(0,75));}prop.setInterpolationTypeAtKey(1,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setInterpolationTypeAtKey(2,KeyframeInterpolationType.BEZIER,KeyframeInterpolationType.BEZIER);prop.setTemporalEaseAtKey(1,A,A);prop.setTemporalEaseAtKey(2,B,B);}catch(err){}}
function dshadow(l){try{var e=l.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");e.property("Shadow Color").setValue(hx("#000814"));e.property("Opacity").setValue(114.750000);e.property("Direction").setValue(180.000000);e.property("Distance").setValue(8.000000);e.property("Softness").setValue(20.000000);}catch(err){}}
var L0=addL("{\"k'ey\": ['\\x00\\x1f ~\\x7f', '\\x80\\x85\\x9f\\xa0\\xad\u00ff', '\u0100\u0300\\u0378\\u2028\\u2029\\u3000\\ufeff\\ue000\ufffd\\uffff'], '\"': {'': []}, '\\ud800': '\\U000e0001'}","[[], {}, [[]], [{}], True, False, None]");
var L1=addL("[10000000000000000, 1e+21, 1e+22, 1.5e-05, 1e-05, 0.0001, 1e-05, 123456789012.5, -1e-07, 5e-324, 1.7976931348623157e+308, 0.30000000000000004, 1000000000000000.5, 9007199254740992, 9007199254740994, 123456789012345680000, -0.5, 0.3333333333333333]","nums");
var L2=addL("\u0000\u001f~\u007f\u0080","\ud800\udc00\udfff\ud83d\ude00\udc00\ud800");
comp.openInViewer();app.endUndoGroup();