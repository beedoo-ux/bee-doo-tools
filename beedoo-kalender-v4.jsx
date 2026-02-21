import { useState, useMemo, useRef, useCallback } from "react";

// ─── Design System ────────────────────────────────────────────────────────────
const C = {
  bg:"#0c1222",c1:"#151d30",c2:"#1c2640",bd:"#263354",tx:"#e1e7ef",dm:"#5c6b8a",y:"#FDE154"
};
const VERTRIEBLER = [
  {id:"AK", name:"Andreas Klee",      color:"#4f8ef7"},
  {id:"FR", name:"Frank Reddig",       color:"#FDE154"},
  {id:"JP", name:"Jannis Pfeiffer",    color:"#a78bfa"},
  {id:"KM", name:"Maximilian Koch",    color:"#f74f4f"},
  {id:"MSC",name:"Miguel Schader",     color:"#4fc7f7"},
  {id:"PM", name:"Pascal Meier",       color:"#f7914f"},
  {id:"DV", name:"Dimitri van Eeuwen", color:"#34d399"},
  {id:"PTH",name:"P.-Torben Hannig",   color:"#fb7185"},
];
const STATUS_CFG = {
  offen:      {label:"Offen",     color:"#FDE154",textColor:"#0c1222"},
  bestaetigt: {label:"Bestätigt", color:"#4f8ef7",textColor:"#fff"},
  storniert:  {label:"Storniert", color:"#5c6b8a",textColor:"#e1e7ef"},
  verpasst:   {label:"Verpasst",  color:"#f74f4f",textColor:"#fff"},
  auftrag:    {label:"Auftrag",   color:"#34d399",textColor:"#0c1222"},
};
const BLOCK_TYPEN = [
  {key:"urlaub",   label:"Urlaub",          color:"#4fc7f7",icon:"🏖"},
  {key:"krank",    label:"Krank",           color:"#f74f4f",icon:"🤒"},
  {key:"meeting",  label:"Meeting",         color:"#f7914f",icon:"👥"},
  {key:"training", label:"Schulung",        color:"#a78bfa",icon:"📚"},
  {key:"sonstiges",label:"Sonstiges",       color:"#5c6b8a",icon:"🔒"},
];
const TAGE      = ["Mo","Di","Mi","Do","Fr","Sa","So"];
const TAGE_FULL = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
const GLOBAL_START = 8*60, GLOBAL_END = 22*60, GLOBAL_SPAN = GLOBAL_END-GLOBAL_START;
const HOURS = Array.from({length:15},(_,i)=>i+8);
const TODAY = "2026-02-20";
const pct  = m => Math.max(0,Math.min(100,((m-GLOBAL_START)/GLOBAL_SPAN)*100));
const wPct = d => (d/GLOBAL_SPAN)*100;
const m2t  = m => { if(m==null)return""; const h=Math.floor(m/60),min=Math.round(m%60); return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`; };
const defaultAz = () => TAGE.reduce((a,t)=>({...a,[t]:["Mo","Di","Mi","Do","Fr"].includes(t)?8*60:null,[t+"E"]:["Mo","Di","Mi","Do","Fr"].includes(t)?22*60:null}),{});
const INIT_AZ = VERTRIEBLER.reduce((a,v)=>({...a,[v.id]:defaultAz()}),{});
const FEB_DAYS = Array.from({length:28},(_,i)=>`2026-02-${String(i+1).padStart(2,"0")}`);
// day-of-week index: 2026-02-01 = Sunday(0)
const febStartDow = 0; // Sunday


// ─── Termine Data (573 entries Feb 2026, compact) ─────────────────────────────
const RAW=`0,2,8,S,42098,Neumann
0,2,10,S,98696,Vogel
0,2,16,O,65302,Weber
0,2,19,B,81426,Meier
0,3,17,O,10851,Friedrich
0,3,20,O,65392,Lange
0,4,11,A,54118,Schulz
0,4,9,B,57052,Schmitt
0,5,20,O,70217,Walter
0,5,9,A,59615,Becker
0,5,16,O,92397,Peters
0,5,13,B,19116,Weber
0,6,20,O,20458,Neumann
0,6,9,B,69429,Lang
0,6,13,O,56566,Schröder
0,6,18,O,99593,Scholz
0,9,16,S,31417,Schulze
0,9,14,O,93886,Jung
0,9,11,S,17331,Neumann
0,9,8,V,62581,Braun
0,10,17,A,51245,Schröder
0,11,14,A,94259,Schulze
0,11,10,O,42325,Vogel
0,11,16,B,86622,Lehmann
0,11,20,O,24371,Bauer
0,12,20,S,88172,Wagner
0,12,14,B,71348,König
0,12,12,A,11504,Weiß
0,12,9,S,80381,Friedrich
0,13,18,O,48469,Lehmann
0,13,10,B,44522,Herrmann
0,14,9,A,49117,Lang
0,14,16,B,30032,Werner
0,14,20,O,79514,Müller
0,16,15,O,57576,Hofmann
0,16,11,O,84364,Becker
0,16,9,S,19071,Friedrich
0,16,20,O,96474,Maier
0,17,10,O,89507,Lehmann
0,17,16,S,36365,Hahn
0,17,12,B,98039,Scholz
0,17,8,B,40161,Kaiser
0,17,19,B,40007,Wagner
0,17,14,O,22704,Möller
0,18,14,B,17100,Weiß
0,18,18,A,22899,Fischer
0,18,20,V,42591,Wolf
0,19,15,O,34050,Braun
0,19,11,A,19880,Schmid
0,20,16,O,95477,Walter
0,20,8,A,40982,Richter
0,20,14,B,38016,Krause
0,20,10,B,61173,Zimmermann
0,21,12,B,82845,Möller
0,21,19,B,34890,Krüger
0,21,8,B,81066,Fischer
0,21,17,B,79615,Richter
0,23,16,O,34356,Wagner
0,24,18,V,62923,Hoffmann
0,24,11,B,15209,Peters
0,24,9,B,86503,Huber
0,24,16,O,44179,Schröder
0,25,13,O,61876,Koch
0,25,18,B,69929,Hartmann
0,25,20,A,11220,Schulze
0,25,9,O,37938,Herrmann
0,26,13,A,42018,Werner
0,26,10,B,81200,Hahn
0,27,20,S,11025,Möller
0,27,16,O,96951,Schulz
0,28,9,A,82512,Bauer
0,28,12,O,37607,Hahn
1,2,18,B,44600,Herrmann
1,2,15,O,16658,Becker
1,2,12,O,53719,Keller
1,3,12,O,67912,Mayer
1,3,19,B,11267,Hoffmann
1,4,19,A,81511,Weber
1,5,17,B,66333,Koch
1,5,8,O,15229,Schmitt
1,5,11,S,97416,Schulz
1,5,13,S,63264,Peters
1,6,11,V,33206,Meier
1,6,8,O,53540,Meier
1,6,20,S,42527,Braun
1,6,14,A,71694,Neumann
1,9,13,O,39831,Neumann
1,9,8,S,62227,Lange
1,9,20,O,94080,Herrmann
1,9,18,A,80282,Lange
1,9,10,B,44795,Weber
1,10,14,O,51114,Lehmann
1,11,16,O,85574,Wolf
1,11,12,O,67154,Müller
1,11,20,B,97900,Wolf
1,11,14,O,97062,Lange
1,12,18,V,49363,Herrmann
1,12,12,S,52753,Krause
1,12,16,O,65108,Möller
1,12,14,S,32810,Peters
1,13,14,B,10053,Hofmann
1,13,12,O,86019,Fuchs
1,13,18,O,67905,Schmid
1,14,20,A,32241,Möller
1,14,9,O,97012,Lang
1,14,17,O,40784,Weiß
1,16,20,O,13201,Weber
1,16,11,A,90120,Keller
1,16,9,B,92544,Huber
1,17,19,B,62383,Schwarz
1,17,10,S,10726,Friedrich
1,18,9,S,38683,Klein
1,18,20,A,77889,Schulze
1,18,16,O,25906,Schulze
1,18,18,B,83259,Fuchs
1,18,13,A,68008,Peters
1,19,16,B,81810,Schmid
1,19,10,S,72216,Schmid
1,19,12,S,93579,Braun
1,19,20,S,73517,Lang
1,20,15,O,47450,Schwarz
1,20,12,O,80798,Becker
1,23,19,O,38043,Wagner
1,23,14,B,81121,Schulze
1,24,11,V,61049,Keller
1,24,17,A,12560,Friedrich
1,24,14,B,56105,Hofmann
1,25,14,B,81582,Fuchs
1,25,11,B,45774,Lehmann
1,25,8,B,97670,Weiß
1,25,20,B,31632,Schulze
1,26,17,B,61645,Kaiser
1,26,8,O,66179,Koch
1,26,15,O,44099,Schmitz
1,26,13,O,52840,Lange
1,26,20,A,46471,Friedrich
1,27,14,O,20735,Maier
1,27,8,S,16826,Schmitt
1,27,11,S,95426,Weber
1,27,20,O,42411,Wolf
1,27,17,O,26544,Maier
2,2,18,A,59192,Krause
2,2,11,O,92213,Schwarz
2,2,9,S,49529,Weiß
2,3,9,S,84177,Weber
2,3,13,B,96706,Werner
2,3,16,B,11658,Meier
2,3,18,A,70258,Hahn
2,4,10,S,95256,Braun
2,4,17,V,80539,Keller
2,5,14,V,87656,Braun
2,5,11,V,21359,Braun
2,5,20,B,89997,Möller
2,6,8,B,52600,Klein
2,6,15,O,43862,Lange
2,6,12,A,46211,Mayer
2,9,9,O,63271,Köhler
2,9,16,S,72402,Scholz
2,9,19,B,12260,Becker
2,9,12,O,41890,Hofmann
2,9,14,A,82140,Lange
2,10,19,B,78765,Fuchs
2,10,12,A,35443,Krüger
2,10,10,O,80010,Koch
2,11,8,B,26551,Lang
2,11,20,B,11607,Huber
2,12,15,B,34164,Fischer
2,12,12,A,72616,Hoffmann
2,13,14,B,85631,Lang
2,13,18,O,29555,Huber
2,13,12,O,42530,Hoffmann
2,13,16,S,89471,Fuchs
2,14,16,B,68028,Hofmann
2,14,14,O,91399,Fischer
2,16,19,O,37235,Lang
2,16,11,O,20641,Richter
2,16,16,O,10350,Meier
2,16,8,O,47056,Jung
2,17,9,S,44675,Lang
2,17,17,S,35928,Lehmann
2,17,11,B,44816,Bauer
2,17,20,O,84607,Krüger
2,17,15,O,49857,Jung
2,18,12,B,74722,Schmid
2,18,9,B,66626,Vogel
2,18,17,O,21970,Neumann
2,19,17,B,12719,Friedrich
2,19,12,B,32962,Maier
2,19,15,A,33788,Kaiser
2,19,9,B,63523,Lange
2,19,19,B,96846,Krause
2,20,20,B,67939,Friedrich
2,20,8,O,81987,Koch
2,20,12,B,73532,Hoffmann
2,23,20,O,30758,Hofmann
2,23,16,O,63476,Becker
2,23,11,A,24871,Schulze
2,23,9,B,30181,Köhler
2,24,12,B,45838,Meier
2,24,15,A,41946,Schulze
2,24,10,B,88561,Herrmann
2,24,19,A,19150,Braun
2,24,8,O,49132,Kaiser
2,25,18,B,29476,Schmid
2,25,16,B,53573,Mayer
2,25,20,B,69682,Hartmann
2,26,19,O,60196,Neumann
2,26,14,O,71993,Hahn
2,26,10,B,14852,Koch
2,26,16,A,53515,Schulz
2,26,8,S,63736,Scholz
2,27,9,B,44737,Lange
2,27,17,S,95175,Becker
2,27,13,V,79942,Schmitz
2,27,19,A,73956,Walter
2,27,11,B,47667,Neumann
2,27,15,O,49251,Schmidt
3,2,12,B,66450,Bauer
3,2,16,B,99364,Klein
3,2,10,O,89887,Schmitz
3,2,18,O,86435,Bauer
3,3,18,O,43466,Möller
3,3,8,A,70981,Krüger
3,4,10,O,55293,Kaiser
3,4,12,B,65615,Jung
3,4,15,V,36111,Schmitz
3,4,17,B,48780,Jung
3,5,18,B,11061,Huber
3,5,20,S,16428,Fuchs
3,6,12,S,40162,Fuchs
3,6,20,B,93442,Wolf
3,6,17,O,96400,Weiß
3,6,10,B,92242,Scholz
3,9,8,B,27224,Becker
3,9,12,O,64460,Klein
3,9,10,S,57953,König
3,9,16,A,31567,Zimmermann
3,10,15,A,48684,Vogel
3,10,13,V,71385,Wagner
3,10,10,S,39571,Weiß
3,10,19,S,62089,Mayer
3,10,8,O,26199,Schulze
3,11,19,S,86619,Schmitz
3,11,13,O,40647,Maier
3,11,8,B,83584,Hartmann
3,12,11,B,93283,Schulze
3,12,19,O,63516,Hoffmann
3,12,8,A,49893,Köhler
3,12,16,O,69459,Werner
3,12,14,B,30253,Meier
3,13,15,B,46666,Weber
3,13,19,B,68115,Schmid
3,13,11,V,23022,Weiß
3,13,13,B,94518,Schmitt
3,16,9,A,69600,Becker
3,16,18,O,93819,Fuchs
3,17,8,S,41925,Koch
3,17,20,B,18992,Friedrich
3,17,16,O,38305,Neumann
3,17,13,S,88116,Müller
3,17,10,A,80807,Zimmermann
3,17,18,V,27275,Müller
3,18,20,O,52437,Schmidt
3,18,10,O,26614,Vogel
3,18,14,B,18330,Maier
3,19,13,B,24293,Schmid
3,19,16,O,90623,Weber
3,19,19,S,96363,König
3,20,18,A,17972,Maier
3,20,14,B,24150,Köhler
3,21,9,O,29442,Wagner
3,21,12,B,86724,Mayer
3,21,19,O,88301,König
3,23,16,B,22999,Jung
3,23,9,V,95316,Keller
3,24,11,B,39949,Meier
3,24,13,V,62262,Meier
3,24,19,O,65936,Hartmann
3,25,13,A,72163,Wagner
3,25,9,V,22219,Lehmann
3,25,19,S,27054,Mayer
3,25,17,A,83620,Lange
3,26,14,B,97207,Friedrich
3,26,19,O,47700,Fuchs
3,26,12,B,85748,Herrmann
3,26,10,S,39392,Schulz
3,27,16,B,46512,Huber
3,27,11,V,83526,Keller
3,27,18,B,13441,Fuchs
3,28,12,O,45818,Jung
3,28,20,O,54541,Schmitt
3,28,8,O,28776,Huber
3,28,18,B,28595,Vogel
4,2,8,O,79531,Schröder
4,2,14,B,54681,Richter
4,2,12,S,84395,Fuchs
4,2,10,O,90981,Fischer
4,3,12,B,65576,Köhler
4,3,17,B,45804,Schröder
4,3,20,B,55242,Lehmann
4,3,9,O,98930,Kaiser
4,4,18,O,38903,Krause
4,4,8,O,49507,Schröder
4,4,20,O,43491,Krüger
4,5,8,B,66446,Klein
4,5,10,B,40161,Herrmann
4,5,16,V,56421,Wagner
4,6,19,O,12456,Schulze
4,6,9,V,85465,Lehmann
4,6,17,B,93904,Meier
4,9,13,O,91018,Schulze
4,9,19,A,21551,Lehmann
4,9,9,O,87184,Krause
4,10,14,A,54500,Neumann
4,10,20,O,76910,Lang
4,10,9,B,35415,Keller
4,11,19,A,94599,Bauer
4,11,11,O,43550,Wolf
4,11,17,O,95918,Wagner
4,12,20,B,70811,Friedrich
4,12,17,S,68838,Weiß
4,13,17,B,91857,Hartmann
4,13,13,O,18950,Maier
4,13,15,B,46002,Kaiser
4,13,8,B,19724,Hofmann
4,13,20,S,15376,Schmid
4,14,11,O,72341,Herrmann
4,14,8,B,55015,Hahn
4,14,16,B,15130,Schwarz
4,16,15,B,89928,Richter
4,16,13,B,47079,Schmitz
4,16,20,O,88366,Fischer
4,16,18,B,18639,Lange
4,17,18,B,43029,Schubert
4,18,17,A,53694,Becker
4,18,10,A,50662,Scholz
4,18,19,S,26901,Fuchs
4,18,12,B,94343,Lange
4,18,14,B,12389,Werner
4,19,11,O,73736,Wolf
4,19,9,O,23256,Herrmann
4,20,19,A,14947,Möller
4,20,13,A,91006,Koch
4,20,17,B,31266,Klein
4,20,10,S,15726,Meier
4,23,15,B,68841,Neumann
4,23,11,O,71474,Wolf
4,23,13,S,84766,Schmid
4,23,20,O,60052,Herrmann
4,24,10,V,89254,Koch
4,24,12,O,72991,Werner
4,24,16,A,77621,Hoffmann
4,25,20,O,68893,Herrmann
4,25,10,V,22021,Neumann
4,26,13,A,64381,Fischer
4,26,16,B,60615,Becker
4,26,11,O,22987,Hahn
4,26,18,O,29142,Koch
4,28,10,S,71487,Schmid
4,28,17,O,20384,Schmidt
4,28,12,O,29597,Mayer
5,2,17,B,24573,Keller
5,2,12,O,25970,Fischer
5,2,14,B,91633,Schulze
5,2,9,O,75513,Fuchs
5,2,19,O,66261,Müller
5,3,8,B,58929,Zimmermann
5,3,19,O,18855,Schmitt
5,3,11,S,92346,Schulz
5,3,17,S,53583,Koch
5,3,13,B,94252,Klein
5,4,18,B,72722,Lang
5,4,10,V,18270,Hahn
5,4,20,A,14847,Krüger
5,4,8,S,15492,Hartmann
5,5,16,B,81176,Maier
5,5,12,O,94790,Wolf
5,5,20,O,95948,Lange
5,5,9,S,67272,Krause
5,5,14,O,34486,Köhler
5,6,13,A,78062,Braun
5,6,20,O,65640,Becker
5,6,17,A,33652,Walter
5,6,9,O,96628,Krüger
5,9,14,O,68183,Schmitt
5,9,8,S,56210,Peters
5,9,12,B,17518,Wagner
5,9,18,B,57619,Herrmann
5,10,18,O,14081,Bauer
5,10,20,B,26545,Wagner
5,10,11,S,58015,Werner
5,10,14,A,14244,Fuchs
5,11,15,A,58760,Schmid
5,11,20,O,28047,König
5,12,13,B,42717,Hoffmann
5,12,8,S,75410,König
5,12,16,O,44116,Hahn
5,13,17,O,74382,Wolf
5,13,9,O,19706,Schmid
5,13,19,B,21506,Weiß
5,14,18,O,18511,Mayer
5,14,16,O,49315,Richter
5,14,10,S,76683,Neumann
5,14,20,O,74752,Schmidt
5,14,13,B,58353,Schulze
5,16,15,S,55156,Koch
5,17,20,B,87042,Klein
5,17,10,B,17263,Hoffmann
5,17,16,O,31581,Richter
5,17,13,A,39552,Schmitt
5,17,18,A,45972,Koch
5,18,17,B,75873,Scholz
5,18,10,B,86106,Bauer
5,18,19,A,54252,Huber
5,18,8,V,13718,Becker
5,20,17,O,37631,Keller
5,20,14,B,13969,Köhler
5,20,12,B,49596,Maier
5,20,20,V,63227,Hofmann
5,21,10,B,73471,Schulze
5,21,13,B,50970,Hahn
5,21,19,A,55268,Krause
5,21,16,B,51827,Schwarz
5,23,12,B,28465,Schulz
5,23,8,O,60351,Peters
5,23,14,O,30932,Hartmann
5,24,19,O,30885,Köhler
5,24,16,B,50441,Köhler
5,24,8,O,61543,Herrmann
5,24,11,O,56254,Fischer
5,24,14,O,44664,Schubert
5,25,14,B,62505,Fischer
5,25,17,B,57516,Mayer
5,25,12,O,76093,Schmid
5,26,12,V,91689,Weiß
5,26,17,O,22672,Krause
5,26,20,A,83116,Werner
5,26,10,O,76731,Krause
5,27,8,O,53652,Maier
5,27,16,B,89463,Herrmann
5,27,10,O,90356,Hartmann
6,2,19,V,87820,Lange
6,2,16,V,79774,Köhler
6,2,12,B,12180,Werner
6,2,9,A,86507,Hofmann
6,2,14,O,99224,Schwarz
6,4,9,O,67807,Hartmann
6,4,14,O,36724,Meier
6,4,16,S,71814,Vogel
6,4,19,O,28098,König
6,4,11,B,96799,Maier
6,5,12,B,39473,Hofmann
6,5,20,O,37168,Jung
6,5,15,O,55718,Mayer
6,5,9,B,81197,Schmitz
6,5,18,O,72793,Schröder
6,6,13,S,23178,Weiß
6,9,10,B,72350,Maier
6,9,18,O,47649,Hartmann
6,9,12,B,21725,Scholz
6,10,16,S,14888,Klein
6,10,14,A,33040,Weber
6,10,20,B,47941,Weber
6,12,9,A,53914,Krüger
6,12,15,A,81211,König
6,12,12,O,24764,Lange
6,13,15,B,34405,Müller
6,13,19,O,48669,Huber
6,14,17,V,63148,Lehmann
6,14,13,O,97720,Schulz
6,16,10,B,42512,Müller
6,16,12,B,68554,Friedrich
6,17,13,O,85088,Müller
6,17,18,B,40972,Fischer
6,18,15,O,63138,Weiß
6,18,19,S,25389,Lang
6,18,12,B,38947,Neumann
6,18,10,B,69634,Vogel
6,19,13,B,81989,Maier
6,19,20,B,97044,Schröder
6,19,11,S,88094,Becker
6,19,16,B,57419,Wagner
6,19,9,O,81781,Herrmann
6,19,18,O,86434,Köhler
6,20,16,B,17292,Schulze
6,23,17,O,70604,Weiß
6,23,20,O,12853,Krause
6,23,12,V,38560,Kaiser
6,24,14,O,18357,Walter
6,25,9,A,71875,Weber
6,25,12,B,27750,Keller
6,25,18,A,94656,Meier
6,25,14,B,59479,Schmitz
6,25,16,O,55582,Hoffmann
6,25,20,O,49107,Schulze
6,26,16,B,59712,Neumann
6,26,11,B,30332,Braun
6,26,19,S,14222,Möller
6,26,14,B,12050,Schwarz
6,27,9,B,68515,Fuchs
6,27,18,S,16380,Schwarz
6,28,11,B,17398,Koch
6,28,16,A,40692,Schubert
6,28,13,B,98150,Hartmann
7,2,10,A,78321,Neumann
7,2,14,O,17989,Mayer
7,3,19,A,92050,Weiß
7,3,14,B,16145,Schmitt
7,3,16,O,64568,Meier
7,3,10,O,34101,Friedrich
7,3,12,V,28920,Schulze
7,3,8,B,64592,Mayer
7,4,14,O,36651,Lange
7,4,18,O,68954,Werner
7,4,9,B,34966,Fischer
7,5,18,B,15183,Wagner
7,5,11,V,87015,Schubert
7,6,11,B,53642,Hofmann
7,6,8,O,34906,Vogel
7,6,19,A,72773,Schwarz
7,6,17,S,61987,Schwarz
7,7,14,B,95029,Schmitt
7,7,12,O,77215,Köhler
7,7,9,V,71537,Friedrich
7,7,17,V,29126,Schmidt
7,9,17,B,64732,Krüger
7,9,10,O,40149,Schmitz
7,10,11,B,95800,Weiß
7,10,13,O,74044,Schubert
7,10,18,S,70401,Richter
7,11,13,O,81636,Köhler
7,11,10,A,81058,Scholz
7,11,8,B,19742,Möller
7,11,20,O,28021,Lang
7,12,19,O,38668,Herrmann
7,12,15,B,90980,Lang
7,13,17,A,96413,Köhler
7,13,8,O,82305,Meier
7,13,19,O,47576,Schmidt
7,13,14,V,33496,Schulz
7,14,11,O,79003,Zimmermann
7,14,13,O,62022,Becker
7,14,15,B,39603,Hofmann
7,16,9,S,95182,Friedrich
7,16,14,B,82443,Maier
7,16,18,O,32463,Becker
7,16,20,O,22499,König
7,17,11,O,84289,Maier
7,17,8,A,99709,Braun
7,17,16,B,14312,Klein
7,17,13,O,37152,Kaiser
7,17,20,V,62205,Wagner
7,18,17,O,61007,Weiß
7,18,13,B,28343,Jung
7,19,16,S,55332,Fischer
7,19,9,B,19963,Lange
7,19,20,B,88067,Krause
7,19,13,O,45825,Schmid
7,20,13,B,59207,Lehmann
7,20,10,S,96595,Schmitz
7,20,20,B,42302,Hahn
7,23,14,S,93086,Bauer
7,23,19,B,57277,Schulz
7,24,12,B,45358,Schulz
7,25,10,B,83005,Mayer
7,25,16,B,13442,Becker
7,26,9,B,52523,Schmitz
7,26,12,B,21101,Schubert
7,26,16,A,41816,Huber
7,27,18,B,28198,Braun
7,27,12,O,29127,Wagner
7,27,10,B,65194,Hofmann
7,28,12,A,91924,Köhler`;
const VID=["AK","FR","JP","KM","MSC","PM","DV","PTH"];
const SMAP={"O":"offen","B":"bestaetigt","S":"storniert","V":"verpasst","A":"auftrag"};
let _tid=0;
const TERMINE_DATA=RAW.trim().split("\n").map(line=>{
  const[vi,day,zh,st,nr,...rest]=line.split(",");
  const kunde=rest.join(",");
  const d=parseInt(day); const dayStr=`2026-02-${String(d).padStart(2,"0")}`;
  const status=SMAP[st];
  return{id:++_tid,vertriebId:VID[parseInt(vi)],kunde,datum:dayStr,zeit:parseInt(zh)*60,dauer:120,status,nr,hatAuftrag:status==="auftrag"};
});

// ─── Range Slider ─────────────────────────────────────────────────────────────
function RangeSlider({vonM,bisM,onChange,disabled}){
  const trackRef=useRef(null);
  const dragging=useRef(null);
  const getM=useCallback((cx)=>{
    const rect=trackRef.current.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(1,(cx-rect.left)/rect.width));
    return Math.round((GLOBAL_START+ratio*GLOBAL_SPAN)/30)*30;
  },[]);
  const onMD=(h)=>(e)=>{
    if(disabled)return; e.preventDefault(); dragging.current=h;
    const mv=(ev)=>{
      const m=getM(ev.clientX);
      if(dragging.current==="von")onChange(Math.max(GLOBAL_START,Math.min(m,bisM-60)),bisM);
      else onChange(vonM,Math.min(GLOBAL_END,Math.max(m,vonM+60)));
    };
    const up=()=>{dragging.current=null;window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);};
    window.addEventListener("mousemove",mv); window.addEventListener("mouseup",up);
  };
  const lp=((vonM-GLOBAL_START)/GLOBAL_SPAN)*100, rp=((bisM-GLOBAL_START)/GLOBAL_SPAN)*100;
  return(
    <div ref={trackRef} style={{position:"relative",height:28,borderRadius:6,background:C.bg,border:`1px solid ${C.bd}`,userSelect:"none",opacity:disabled?0.35:1}}>
      {HOURS.map(h=><div key={h} style={{position:"absolute",left:`${((h*60-GLOBAL_START)/GLOBAL_SPAN)*100}%`,top:0,bottom:0,borderLeft:`1px solid ${h%2===0?C.bd+"55":C.bd+"22}`}}>{h%2===0&&<span style={{position:"absolute",top:2,left:2,fontSize:8,color:C.dm+"88"}}>{h}</span>}</div>)}
      <div style={{position:"absolute",left:`${lp}%`,width:`${rp-lp}%`,top:4,bottom:4,background:`linear-gradient(90deg,#4f8ef733,#FDE15433)`,border:`1px solid ${C.y}55`,borderRadius:4,pointerEvents:"none"}}/>
      {[["von","#4f8ef7",lp],["bis",C.y,rp]].map(([h,col,pos])=>(
        <div key={h} onMouseDown={onMD(h)} style={{position:"absolute",left:`${pos}%`,top:"50%",transform:"translate(-50%,-50%)",width:16,height:20,background:col,borderRadius:4,cursor:disabled?"default":"ew-resize",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3,boxShadow:"0 2px 6px #00000055"}}>
          <div style={{width:2,height:10,background:"#ffffff44",borderRadius:1}}/>
        </div>
      ))}
      <div style={{position:"absolute",left:`${lp}%`,transform:"translateX(-50%)",top:-14,fontSize:9,color:"#4f8ef7",fontWeight:700,pointerEvents:"none",whiteSpace:"nowrap"}}>{m2t(vonM)}</div>
      <div style={{position:"absolute",left:`${rp}%`,transform:"translateX(-50%)",top:-14,fontSize:9,color:C.y,fontWeight:700,pointerEvents:"none",whiteSpace:"nowrap"}}>{m2t(bisM)}</div>
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({type}){
  if(type==="auftrag") return <span style={{background:"#34d399",color:"#0c1222",fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:4,letterSpacing:"0.05em",textTransform:"uppercase",flexShrink:0}}>AUFTRAG</span>;
  if(type==="storniert") return <span style={{background:"#5c6b8a",color:"#e1e7ef",fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:4,letterSpacing:"0.05em",textTransform:"uppercase",flexShrink:0}}>STORNIERT</span>;
  return null;
}

// ─── Auslastung ───────────────────────────────────────────────────────────────
const MAX_PER_DAY = 4;
function AuslastungsBar({pct:p,color,small}){
  const col = p>=100?"#f74f4f":p>=75?C.y:p>=50?"#4f8ef7":color;
  return(
    <div style={{display:"flex",alignItems:"center",gap:small?3:5}}>
      <div style={{flex:1,height:small?4:6,background:C.bd+"55",borderRadius:3,overflow:"hidden",minWidth:small?30:40}}>
        <div style={{width:`${Math.min(100,p)}%`,height:"100%",background:col,borderRadius:3,transition:"width 0.3s"}}/>
      </div>
      <span style={{fontSize:small?9:10,color:p>=100?"#f74f4f":p>=75?C.y:C.dm,fontWeight:700,minWidth:small?24:28}}>{Math.round(p)}%</span>
    </div>
  );
}

// ─── Vertriebler Stat ─────────────────────────────────────────────────────────
function VertrieblerStat({v,termine,period}){
  const total=termine.length;
  const auftraege=termine.filter(t=>t.status==="auftrag"||t.hatAuftrag).length;
  const storniert=termine.filter(t=>t.status==="storniert").length;
  let days=1;
  if(period==="woche") days=5;
  if(period==="monat") days=20; // ~20 Werktage im Feb
  const maxTotal=days*MAX_PER_DAY;
  const auslastung=(total/maxTotal)*100;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:2}}>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <span style={{fontSize:11,fontWeight:700,color:C.tx}}>{total}</span>
        <span style={{fontSize:9,color:C.dm}}>Termine</span>
        {auftraege>0&&<span style={{fontSize:9,fontWeight:800,color:"#34d399"}}>+{auftraege}A</span>}
        {storniert>0&&<span style={{fontSize:9,color:"#5c6b8a"}}>-{storniert}S</span>}
      </div>
      <AuslastungsBar pct={auslastung} color={v.color} small/>
    </div>
  );
}


// ─── Day View Row ──────────────────────────────────────────────────────────────
function DayRow({v,termine,az,blocks,onTerminClick,period,allTermine,displayDate}){
  const [hov,setHov]=useState(null);
  // Use day-of-week from displayDate to get correct working hours
  const dowMap={0:"So",1:"Mo",2:"Di",3:"Mi",4:"Do",5:"Fr",6:"Sa"};
  const dt=new Date(displayDate+"T12:00:00");
  const tagKey=dowMap[dt.getDay()];
  const von=az[tagKey], bis=az[tagKey+"E"];
  const hasAz=von!=null&&bis!=null;
  const ganztaegig=blocks.find(b=>b.ganztaegig);

  const periodTermine=period==="tag"?allTermine.filter(t=>t.datum===displayDate&&t.vertriebId===v.id):
    period==="woche"?allTermine.filter(t=>t.datum>="2026-02-16"&&t.datum<="2026-02-22"&&t.vertriebId===v.id):
    allTermine.filter(t=>t.vertriebId===v.id);

  // Compute free slots within working hours minus termine and time-blocks
  const freeSlots=useMemo(()=>{
    if(!hasAz||ganztaegig)return[];
    const busy=[];
    // Add time-based blocks
    blocks.filter(b=>!b.ganztaegig&&b.zeitVon!=null).forEach(b=>busy.push([b.zeitVon,b.zeitBis]));
    // Add termine
    termine.forEach(t=>busy.push([t.zeit,t.zeit+t.dauer]));
    busy.sort((a,b)=>a[0]-b[0]);
    // Compute gaps within [von, bis]
    const slots=[];
    let cur=von;
    busy.forEach(([s,e])=>{
      const bs=Math.max(s,von), be=Math.min(e,bis);
      if(bs>cur+15) slots.push([cur,bs]); // gap > 15min
      if(be>cur) cur=be;
    });
    if(cur<bis-15) slots.push([cur,bis]);
    return slots;
  },[hasAz,ganztaegig,von,bis,blocks,termine]);

  return(
    <div style={{display:"flex",alignItems:"stretch",borderBottom:`1px solid ${C.bd}22`,minHeight:58}}>
      {/* Name + Stats — STICKY left */}
      <div style={{width:200,flexShrink:0,padding:"6px 14px",display:"flex",flexDirection:"column",justifyContent:"center",gap:3,borderRight:`1px solid ${C.bd}`,position:"sticky",left:0,zIndex:12,background:C.bg,boxShadow:"4px 0 12px #00000044"}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:24,height:24,borderRadius:"50%",background:v.color+"22",border:`2px solid ${v.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:v.color,flexShrink:0}}>{v.id.slice(0,2)}</div>
          <div style={{overflow:"hidden"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.tx,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{v.name}</div>
            {hasAz&&!ganztaegig&&<div style={{fontSize:9,color:C.dm}}>{m2t(von)}–{m2t(bis)}</div>}
            {ganztaegig&&<div style={{fontSize:9,color:BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.color}}>{BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.icon} {ganztaegig.label}</div>}
          </div>
        </div>
        <VertrieblerStat v={v} termine={periodTermine} period={period}/>
      </div>
      {/* Timeline */}
      <div style={{flex:1,position:"relative",opacity:ganztaegig?0.6:1}}>
        {HOURS.map(h=><div key={h} style={{position:"absolute",left:`${((h*60-GLOBAL_START)/GLOBAL_SPAN)*100}%`,top:0,bottom:0,borderLeft:`1px solid ${C.bd}22`}}/>)}
        {/* Not-working zones */}
        {hasAz&&!ganztaegig&&von>GLOBAL_START&&<div style={{position:"absolute",left:0,width:`${((von-GLOBAL_START)/GLOBAL_SPAN)*100}%`,top:0,bottom:0,background:"repeating-linear-gradient(45deg,transparent,transparent 4px,#ffffff06 4px,#ffffff06 8px)",borderRight:`2px dashed ${C.bd}44`}}/>}
        {hasAz&&!ganztaegig&&bis<GLOBAL_END&&<div style={{position:"absolute",left:`${((bis-GLOBAL_START)/GLOBAL_SPAN)*100}%`,right:0,top:0,bottom:0,background:"repeating-linear-gradient(45deg,transparent,transparent 4px,#ffffff06 4px,#ffffff06 8px)",borderLeft:`2px dashed ${C.bd}44`}}/>}
        {ganztaegig&&<div style={{position:"absolute",inset:0,background:`repeating-linear-gradient(45deg,transparent,transparent 8px,${BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.color}15 8px,${BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.color}15 16px)`,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><span style={{fontSize:20,opacity:0.25}}>{BLOCK_TYPEN.find(t=>t.key===ganztaegig.typ)?.icon}</span></div>}
        {/* ✅ FREE SLOTS — leicht grün */}
        {!ganztaegig&&freeSlots.map(([s,e],i)=>(
          <div key={i} style={{position:"absolute",left:`${pct(s)}%`,width:`${wPct(e-s)}%`,top:0,bottom:0,background:"linear-gradient(180deg,#34d39912 0%,#34d39920 100%)",borderLeft:`1px solid #34d39930`,borderRight:`1px solid #34d39930`,pointerEvents:"none",zIndex:1}}/>
        ))}
        {/* Time blocks */}
        {!ganztaegig&&blocks.filter(b=>!b.ganztaegig&&b.zeitVon!=null).map(b=>{
          const typ=BLOCK_TYPEN.find(t=>t.key===b.typ);
          const dur=b.zeitBis-b.zeitVon;
          return <div key={b.id} style={{position:"absolute",left:`${pct(b.zeitVon)}%`,width:`${wPct(dur)}%`,top:4,bottom:4,background:`repeating-linear-gradient(45deg,${typ.color}22,${typ.color}22 4px,${typ.color}0a 4px,${typ.color}0a 8px)`,border:`1.5px dashed ${typ.color}88`,borderRadius:6,display:"flex",alignItems:"center",paddingLeft:6,overflow:"hidden",zIndex:2}}>
            <span style={{fontSize:10,color:typ.color,fontWeight:700,whiteSpace:"nowrap"}}>{typ.icon} {b.label}</span>
          </div>;
        })}
        {/* Termine */}
        {!ganztaegig&&termine.map(t=>{
          const s=STATUS_CFG[t.status];
          const isHov=hov===t.id;
          return(
            <div key={t.id} onClick={()=>onTerminClick(t)}
              onMouseEnter={()=>setHov(t.id)} onMouseLeave={()=>setHov(null)}
              style={{position:"absolute",left:`${pct(t.zeit)}%`,width:`${wPct(t.dauer)}%`,top:5,bottom:5,background:s.color,borderRadius:8,padding:"2px 6px",overflow:"hidden",cursor:"pointer",zIndex:isHov?10:3,boxShadow:isHov?`0 4px 16px ${s.color}55`:`0 1px 4px ${s.color}33`,transform:isHov?"scaleY(1.06)":"scaleY(1)",transition:"all 0.12s"}}>
              <div style={{display:"flex",gap:3,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:10,fontWeight:700,color:s.textColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{t.kunde}</span>
                {t.status==="auftrag"&&<Badge type="auftrag"/>}
                {t.status==="storniert"&&<Badge type="storniert"/>}
              </div>
              <div style={{fontSize:9,color:s.textColor+"bb"}}>#{t.nr} · {m2t(t.zeit)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── Week View ────────────────────────────────────────────────────────────────
function WeekView({termine,activeV,onDayClick,activeStatus}){
  // Week of 20.02.2026: Mo 16 – So 22
  const weekDays=[
    {datum:"2026-02-16",label:"Mo 16"},
    {datum:"2026-02-17",label:"Di 17"},
    {datum:"2026-02-18",label:"Mi 18"},
    {datum:"2026-02-19",label:"Do 19"},
    {datum:"2026-02-20",label:"Fr 20 ◀ Heute",isToday:true},
    {datum:"2026-02-21",label:"Sa 21"},
    {datum:"2026-02-22",label:"So 22"},
  ];
  const activeVList=VERTRIEBLER.filter(v=>activeV[v.id]);
  const filtered=termine.filter(t=>activeStatus[t.status]);
  return(
    <div style={{overflowX:"auto"}}>
      <div style={{minWidth:900}}>
        {/* Header */}
        <div style={{display:"flex",background:C.c1,borderBottom:`1px solid ${C.bd}`,position:"sticky",top:0,zIndex:20}}>
          <div style={{width:200,flexShrink:0,borderRight:`1px solid ${C.bd}`,padding:"7px 14px",position:"sticky",left:0,zIndex:22,background:C.c1,boxShadow:"4px 0 12px #00000044"}}>
            <span style={{fontSize:10,color:C.dm,fontWeight:600}}>VERTRIEBLER</span>
          </div>
          {weekDays.map(d=>(
            <div key={d.datum} onClick={()=>onDayClick(d.datum)} style={{flex:1,borderRight:`1px solid ${C.bd}22`,padding:"7px 8px",cursor:"pointer",background:d.isToday?C.y+"11":"transparent",transition:"background 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=d.isToday?C.y+"22":C.c2}
              onMouseLeave={e=>e.currentTarget.style.background=d.isToday?C.y+"11":"transparent"}>
              <div style={{fontSize:11,fontWeight:d.isToday?800:600,color:d.isToday?C.y:C.dm,whiteSpace:"nowrap"}}>{d.label}</div>
              <div style={{fontSize:9,color:C.dm+"88",marginTop:2}}>
                {filtered.filter(t=>t.datum===d.datum).length} Termine
              </div>
            </div>
          ))}
        </div>
        {/* Rows */}
        {activeVList.map(v=>{
          const days=weekDays.map(d=>({...d,termine:filtered.filter(t=>t.vertriebId===v.id&&t.datum===d.datum)}));
          const weekTotal=filtered.filter(t=>t.vertriebId===v.id&&t.datum>="2026-02-16"&&t.datum<="2026-02-22").length;
          const auslastung=(weekTotal/(5*MAX_PER_DAY))*100;
          return(
            <div key={v.id} style={{display:"flex",borderBottom:`1px solid ${C.bd}22`,minHeight:52}}>
              {/* Name col */}
              <div style={{width:200,flexShrink:0,padding:"6px 14px",display:"flex",flexDirection:"column",justifyContent:"center",gap:3,borderRight:`1px solid ${C.bd}`,position:"sticky",left:0,zIndex:12,background:C.bg,boxShadow:"4px 0 12px #00000044"}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:v.color+"22",border:`2px solid ${v.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:v.color,flexShrink:0}}>{v.id.slice(0,2)}</div>
                  <span style={{fontSize:11,fontWeight:700,color:C.tx,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{v.name}</span>
                </div>
                <AuslastungsBar pct={auslastung} color={v.color} small/>
              </div>
              {/* Day cells */}
              {days.map(d=>{
                const cnt=d.termine.length;
                const auftrag=d.termine.some(t=>t.status==="auftrag"||t.hatAuftrag);
                const storniert=d.termine.some(t=>t.status==="storniert");
                const dayPct=Math.min(100,(cnt/MAX_PER_DAY)*100);
                return(
                  <div key={d.datum} onClick={()=>onDayClick(d.datum)}
                    style={{flex:1,borderRight:`1px solid ${C.bd}22`,padding:6,cursor:"pointer",background:d.isToday?C.y+"0a":"transparent",position:"relative",transition:"background 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=d.isToday?C.y+"18":C.c2+"88"}
                    onMouseLeave={e=>e.currentTarget.style.background=d.isToday?C.y+"0a":"transparent"}>
                    {cnt===0
                      ?<div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:11,color:C.bd}}>—</span></div>
                      :<>
                        <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4,flexWrap:"wrap"}}>
                          <span style={{fontSize:12,fontWeight:800,color:v.color}}>{cnt}</span>
                          {auftrag&&<Badge type="auftrag"/>}
                          {storniert&&<Badge type="storniert"/>}
                        </div>
                        {/* Mini status pills */}
                        <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
                          {Object.entries(STATUS_CFG).map(([k,s])=>{
                            const c2=d.termine.filter(t=>t.status===k).length;
                            if(!c2)return null;
                            return <span key={k} style={{fontSize:8,background:s.color+"33",color:s.color,padding:"1px 4px",borderRadius:3,fontWeight:700}}>{c2}{k==="bestaetigt"?"B":k==="offen"?"O":k==="storniert"?"S":k==="auftrag"?"A":"V"}</span>;
                          })}
                        </div>
                        {/* Load bar */}
                        <div style={{marginTop:4,height:3,background:C.bd+"44",borderRadius:2,overflow:"hidden"}}>
                          <div style={{width:`${dayPct}%`,height:"100%",background:dayPct>=100?"#f74f4f":dayPct>=75?C.y:v.color,borderRadius:2}}/>
                        </div>
                      </>
                    }
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── Month View ───────────────────────────────────────────────────────────────
function MonthView({termine,activeV,onDayClick,activeStatus}){
  const activeVList=VERTRIEBLER.filter(v=>activeV[v.id]);
  const filtered=termine.filter(t=>activeStatus[t.status]);
  // Feb 2026: starts Sunday=0
  const calDays=[];
  for(let i=0;i<febStartDow;i++) calDays.push(null);
  FEB_DAYS.forEach(d=>calDays.push(d));
  while(calDays.length%7!==0) calDays.push(null);
  const DOW=["So","Mo","Di","Mi","Do","Fr","Sa"];

  return(
    <div style={{padding:"0 0 16px"}}>
      {/* Vertriebler selector summary */}
      <div style={{display:"flex",gap:8,padding:"8px 24px",borderBottom:`1px solid ${C.bd}`,flexWrap:"wrap"}}>
        {activeVList.map(v=>{
          const total=filtered.filter(t=>t.vertriebId===v.id).length;
          const auftraege=filtered.filter(t=>t.vertriebId===v.id&&(t.status==="auftrag")).length;
          const auslastung=(total/(20*MAX_PER_DAY))*100;
          return(
            <div key={v.id} style={{background:C.c1,border:`1px solid ${v.color}44`,borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:8,minWidth:160}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:v.color+"22",border:`2px solid ${v.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:v.color,flexShrink:0}}>{v.id.slice(0,2)}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:C.tx}}>{v.name.split(" ")[0]}</div>
                <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                  <span style={{fontSize:10,color:C.dm}}>{total} Termine</span>
                  {auftraege>0&&<span style={{fontSize:9,color:"#34d399",fontWeight:700}}>·{auftraege}A</span>}
                </div>
                <AuslastungsBar pct={auslastung} color={v.color} small/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Calendar grid */}
      <div style={{padding:"12px 24px"}}>
        {/* DOW header */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:6}}>
          {DOW.map(d=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:d==="So"||d==="Sa"?"#5c6b8a55":C.dm,padding:"4px 0"}}>{d}</div>)}
        </div>
        {/* Weeks */}
        {Array.from({length:calDays.length/7},(_,wi)=>(
          <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:3}}>
            {calDays.slice(wi*7,wi*7+7).map((datum,di)=>{
              if(!datum) return <div key={di} style={{aspectRatio:"1",borderRadius:8,background:C.c1+"44"}}/>;
              const isToday=datum===TODAY;
              const isSun=di===0, isSat=di===6;
              const dayTermine=filtered.filter(t=>t.datum===datum);
              const totalCount=dayTermine.length;
              const hasAuftrag=dayTermine.some(t=>t.status==="auftrag");
              const heat=Math.min(1,totalCount/(MAX_PER_DAY*activeVList.length||1));
              const dayNum=datum.split("-")[2];

              return(
                <div key={datum} onClick={()=>onDayClick(datum)}
                  style={{aspectRatio:"1",borderRadius:8,border:`1px solid ${isToday?C.y:isSun||isSat?C.bd+"44":C.bd+"88"}`,background:isToday?C.y+"15":isSun||isSat?C.c1+"44":C.c1,cursor:"pointer",padding:4,display:"flex",flexDirection:"column",transition:"all 0.1s",position:"relative",overflow:"hidden"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=isToday?C.y:C.y+"88"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=isToday?C.y:isSun||isSat?C.bd+"44":C.bd+"88"}>
                  {/* Heat overlay */}
                  {heat>0&&<div style={{position:"absolute",inset:0,background:`${C.y}${Math.round(heat*30).toString(16).padStart(2,"0")}`,borderRadius:7,pointerEvents:"none"}}/>}
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",position:"relative"}}>
                    <span style={{fontSize:11,fontWeight:isToday?800:600,color:isToday?C.y:isSun||isSat?C.dm+"55":C.dm}}>{dayNum}</span>
                    {hasAuftrag&&<span style={{fontSize:7,fontWeight:800,color:"#34d399",background:"#34d39922",padding:"1px 3px",borderRadius:3}}>A</span>}
                  </div>
                  {totalCount>0&&(
                    <div style={{marginTop:"auto",position:"relative"}}>
                      {/* Per-vertriebler dots */}
                      <div style={{display:"flex",gap:1,flexWrap:"wrap"}}>
                        {activeVList.map(v=>{
                          const vCnt=dayTermine.filter(t=>t.vertriebId===v.id).length;
                          if(!vCnt)return null;
                          return <div key={v.id} style={{width:6,height:6,borderRadius:"50%",background:v.color,title:v.name,opacity:0.9}}/>;
                        })}
                      </div>
                      <div style={{fontSize:9,color:C.tx,fontWeight:700,marginTop:1}}>{totalCount}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Termin Modal ─────────────────────────────────────────────────────────────
function TerminModal({termin,v,onSave,onClose}){
  const [dauer,setDauer]=useState(termin.dauer);
  const [zeitM,setZeitM]=useState(termin.zeit);
  const [status,setStatus]=useState(termin.status);
  return(
    <div style={{position:"fixed",inset:0,background:"#000a",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.c1,border:`1px solid ${v.color}55`,borderRadius:14,width:460,maxWidth:"100%"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:`1px solid ${C.bd}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:v.color}}/>
            <span style={{fontWeight:700,fontSize:14,color:C.tx}}>{termin.kunde}</span>
            <span style={{fontSize:11,color:C.dm}}>#{termin.nr}</span>
            <Badge type={status}/>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.dm,fontSize:20,cursor:"pointer"}}>×</button>
        </div>
        <div style={{padding:18,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:C.c2,borderRadius:10,padding:12,display:"flex",gap:16}}>
            {[["Vertriebler",v.name,v.color],["Start",m2t(zeitM),C.tx],["Ende",m2t(zeitM+dauer),C.tx],["Dauer",`${dauer}min`,C.y]].map(([l,val,col])=>(
              <div key={l} style={{textAlign:"center",flex:1}}>
                <div style={{fontSize:10,color:C.dm,marginBottom:2}}>{l}</div>
                <div style={{fontSize:12,fontWeight:700,color:col}}>{val}</div>
              </div>
            ))}
          </div>
          {/* Slider */}
          <div>
            <div style={{fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Zeit & Dauer</div>
            <RangeSlider vonM={zeitM} bisM={zeitM+dauer} onChange={(v2,b2)=>{setZeitM(v2);setDauer(b2-v2);}}/>
          </div>
          {/* Dauer quick */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[60,90,120,150,180].map(d=>(
              <button key={d} onClick={()=>setDauer(d)} style={{padding:"5px 12px",borderRadius:7,border:`1.5px solid ${dauer===d?C.y:C.bd}`,background:dauer===d?C.y+"22":"transparent",color:dauer===d?C.y:C.dm,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>{d}min</button>
            ))}
          </div>
          {/* Status */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {Object.entries(STATUS_CFG).map(([k,s])=>(
              <button key={k} onClick={()=>setStatus(k)} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:7,border:`1.5px solid ${status===k?s.color:C.bd}`,background:status===k?s.color+"22":"transparent",color:status===k?s.color:C.dm,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:status===k?s.color:C.bd}}/>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <button onClick={onClose} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${C.bd}`,background:"transparent",color:C.dm,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Abbrechen</button>
            <button onClick={()=>{onSave({...termin,zeit:zeitM,dauer,status});onClose();}} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${C.y}`,background:C.y+"22",color:C.y,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Speichern</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App(){
  const [view,setView]=useState("tag"); // tag|woche|monat
  const [activeStatus,setActiveStatus]=useState(Object.keys(STATUS_CFG).reduce((a,k)=>({...a,[k]:true}),{}));
  const [activeV,setActiveV]=useState(VERTRIEBLER.reduce((a,v)=>({...a,[v.id]:true}),{}));
  const [az]=useState(INIT_AZ);
  const [termine,setTermine]=useState(TERMINE_DATA);
  const [terminModal,setTerminModal]=useState(null);
  const [showBlocks]=useState(true);
  const [selectedDate,setSelectedDate]=useState(TODAY);

  // Mock blocks for today
  const BLOCKS=[
    {id:"b1",vertriebId:"AK",typ:"urlaub",label:"Urlaub",datum:TODAY,zeitVon:null,zeitBis:null,ganztaegig:true},
    {id:"b2",vertriebId:"FR",typ:"meeting",label:"Teammeeting",datum:TODAY,zeitVon:8*60,zeitBis:9.5*60,ganztaegig:false},
    {id:"b3",vertriebId:"JP",typ:"training",label:"Schulung",datum:TODAY,zeitVon:9*60,zeitBis:11*60,ganztaegig:false},
  ];

  const activeVList=VERTRIEBLER.filter(v=>activeV[v.id]);
  const allVActive=VERTRIEBLER.every(v=>activeV[v.id]);

  // For day view: use selectedDate
  const displayDate=view==="tag"?selectedDate:TODAY;
  const dayTermine=useMemo(()=>termine.filter(t=>t.datum===displayDate&&activeStatus[t.status]&&activeV[t.vertriebId]),[termine,displayDate,activeStatus,activeV]);
  const allFiltered=useMemo(()=>termine.filter(t=>activeStatus[t.status]&&activeV[t.vertriebId]),[termine,activeStatus,activeV]);

  // KPI totals
  const kpis=useMemo(()=>{
    const scope=view==="tag"?dayTermine:view==="woche"?allFiltered.filter(t=>t.datum>="2026-02-16"&&t.datum<="2026-02-22"):allFiltered;
    return {
      total:scope.length,
      auftraege:scope.filter(t=>t.status==="auftrag").length,
      storniert:scope.filter(t=>t.status==="storniert").length,
      offen:scope.filter(t=>t.status==="offen").length,
    };
  },[view,dayTermine,allFiltered]);

  const handleDayClick=(datum)=>{setSelectedDate(datum);setView("tag");};

  // Date navigation for day view
  const shiftDay=(delta)=>{
    const [y,m,d]=selectedDate.split("-").map(Number);
    const dt=new Date(y,m-1,d+delta);
    const nd=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
    if(nd>="2026-02-01"&&nd<="2026-02-28") setSelectedDate(nd);
  };

  const dateLabel=(d)=>{
    const days=["So","Mo","Di","Mi","Do","Fr","Sa"];
    const dt=new Date(d);
    return `${days[dt.getDay()]}, ${d.split("-")[2]}.${d.split("-")[1]}.${d.split("-")[0]}`;
  };

  return(
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",color:C.tx}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{background:C.c1,borderBottom:`1px solid ${C.bd}`,padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:11,fontWeight:800,letterSpacing:"0.1em",color:C.y,textTransform:"uppercase"}}>bee-doo</span>
          <span style={{color:C.bd}}>|</span>
          <span style={{fontSize:15,fontWeight:700}}>Vertriebskalender</span>
          <span style={{background:C.c2,border:`1px solid ${C.bd}`,borderRadius:6,padding:"2px 10px",fontSize:11,color:C.dm}}>Februar 2026</span>
        </div>
        {/* View tabs */}
        <div style={{display:"flex",gap:3,background:C.c2,borderRadius:10,padding:3}}>
          {[["tag","Tag"],["woche","Woche"],["monat","Monat"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:"5px 16px",borderRadius:7,border:"none",background:view===v?C.y:"transparent",color:view===v?C.bg:C.dm,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s"}}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPI Bar */}
      <div style={{background:C.c2,borderBottom:`1px solid ${C.bd}`,padding:"6px 24px",display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
        {[
          ["Gesamt",kpis.total,C.tx],
          ["Aufträge",kpis.auftraege,"#34d399"],
          ["Offen",kpis.offen,"#FDE154"],
          ["Storniert",kpis.storniert,"#5c6b8a"],
        ].map(([l,val,col])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:C.dm}}>{l}:</span>
            <span style={{fontSize:14,fontWeight:800,color:col}}>{val}</span>
          </div>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,color:C.dm}}>Auslastung:</span>
          <span style={{fontSize:13,fontWeight:700,color:C.y}}>
            {Math.round((kpis.total/((view==="tag"?1:view==="woche"?5:20)*MAX_PER_DAY*activeVList.length||1))*100)}%
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{background:C.c1,borderBottom:`1px solid ${C.bd}`,padding:"9px 24px",display:"flex",flexDirection:"column",gap:7}}>
        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
          <span style={{fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",minWidth:60}}>Status</span>
          {Object.entries(STATUS_CFG).map(([k,s])=>(
            <button key={k} onClick={()=>setActiveStatus(p=>({...p,[k]:!p[k]}))} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:7,border:`1.5px solid ${activeStatus[k]?s.color:C.bd}`,background:activeStatus[k]?s.color+"22":"transparent",color:activeStatus[k]?s.color:C.dm,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:activeStatus[k]?s.color:C.bd}}/>{s.label}
            </button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:10,color:C.dm,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",minWidth:60}}>Team</span>
          <button onClick={()=>setActiveV(VERTRIEBLER.reduce((a,v)=>({...a,[v.id]:!allVActive}),{}))} style={{padding:"4px 10px",borderRadius:16,border:`1.5px solid ${allVActive?C.y:C.bd}`,background:allVActive?C.y+"22":"transparent",color:allVActive?C.y:C.dm,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Alle</button>
          {VERTRIEBLER.map(v=>(
            <button key={v.id} onClick={()=>setActiveV(p=>({...p,[v.id]:!p[v.id]}))} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px 4px 6px",borderRadius:16,border:`1.5px solid ${activeV[v.id]?v.color:C.bd}`,background:activeV[v.id]?v.color+"18":"transparent",color:activeV[v.id]?C.tx:C.dm,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>
              <span style={{width:18,height:18,borderRadius:"50%",background:activeV[v.id]?v.color:C.bd,color:activeV[v.id]?"#0c1222":C.dm,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,flexShrink:0}}>{v.id.slice(0,2)}</span>
              {v.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Day nav (only in Tag view) */}
      {view==="tag"&&(
        <div style={{background:C.c1,borderBottom:`1px solid ${C.bd}`,padding:"7px 24px",display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>shiftDay(-1)} style={{background:C.c2,border:`1px solid ${C.bd}`,borderRadius:7,color:C.dm,padding:"3px 10px",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>‹</button>
          <span style={{fontWeight:700,fontSize:13,color:selectedDate===TODAY?C.y:C.tx}}>{dateLabel(selectedDate)}{selectedDate===TODAY?" · Heute":""}</span>
          <button onClick={()=>shiftDay(1)} style={{background:C.c2,border:`1px solid ${C.bd}`,borderRadius:7,color:C.dm,padding:"3px 10px",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>›</button>
          {selectedDate!==TODAY&&<button onClick={()=>setSelectedDate(TODAY)} style={{marginLeft:"auto",padding:"3px 12px",borderRadius:7,border:`1.5px solid ${C.y}`,background:C.y+"22",color:C.y,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Heute</button>}
        </div>
      )}

      {/* Views */}
      {view==="tag"&&(
        <div style={{overflowX:"auto"}}>
          <div style={{minWidth:1100}}>
            {/* Time header */}
            <div style={{display:"flex",borderBottom:`1px solid ${C.bd}`,background:C.c1,position:"sticky",top:0,zIndex:20}}>
              <div style={{width:200,flexShrink:0,borderRight:`1px solid ${C.bd}`,padding:"7px 14px",position:"sticky",left:0,zIndex:22,background:C.c1,boxShadow:"4px 0 12px #00000044"}}><span style={{fontSize:10,color:C.dm,fontWeight:600}}>RESSOURCEN · {dateLabel(selectedDate)}</span></div>
              <div style={{flex:1,position:"relative",height:30}}>
                {HOURS.map(h=><div key={h} style={{position:"absolute",left:`${((h*60-GLOBAL_START)/GLOBAL_SPAN)*100}%`,top:0,bottom:0,display:"flex",alignItems:"center",paddingLeft:4}}><span style={{fontSize:10,color:C.dm,fontWeight:600}}>{String(h).padStart(2,"0")}:00</span></div>)}
                {selectedDate===TODAY&&<div style={{position:"absolute",left:`${((15*60+30-GLOBAL_START)/GLOBAL_SPAN)*100}%`,top:0,bottom:0,width:2,background:"#ff4444",zIndex:5}}><div style={{position:"absolute",top:0,left:-3,width:8,height:8,borderRadius:"50%",background:"#ff4444"}}/></div>}
              </div>
            </div>
            {activeVList.map(v=>(
              <DayRow key={v.id} v={v}
                termine={dayTermine.filter(t=>t.vertriebId===v.id)}
                az={az[v.id]||{}} blocks={showBlocks?BLOCKS.filter(b=>b.vertriebId===v.id&&b.datum===selectedDate):[]}
                onTerminClick={t=>setTerminModal({t,v})}
                period="tag" allTermine={termine} displayDate={selectedDate}/>
            ))}
          </div>
        </div>
      )}

      {view==="woche"&&(
        <WeekView termine={allFiltered} activeV={activeV} onDayClick={handleDayClick} activeStatus={activeStatus}/>
      )}

      {view==="monat"&&(
        <MonthView termine={allFiltered} activeV={activeV} onDayClick={handleDayClick} activeStatus={activeStatus}/>
      )}

      {/* Termin Modal */}
      {terminModal&&(
        <TerminModal termin={terminModal.t} v={terminModal.v}
          onSave={t=>setTermine(p=>p.map(x=>x.id===t.id?t:x))}
          onClose={()=>setTerminModal(null)}/>
      )}
    </div>
  );
}
