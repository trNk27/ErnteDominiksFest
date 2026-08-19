/* =====================================================================
   shared/world.js — reines Weltwissen, ohne three.js und ohne DOM.
   Wird sowohl vom Client (game.js) als auch vom PartyKit-Server
   (party/server.js) importiert, damit beide Seiten aus demselben Samen
   exakt dieselbe Landschaft, dieselben Truhenplätze und dieselbe
   Höhen-/Kollisionslogik erzeugen — ohne dass eine Seite der anderen
   Terrain-Daten schicken müsste.
   ===================================================================== */

// ------------------------------------------------------------------ Helfer
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp=(a,b,t)=>a+(b-a)*t;
export function mulberry(s){return function(){s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// ------------------------------------------------------------------ Welt-Eckdaten
export const DAYLEN=200;                       // Sekunden pro Tag/Nacht-Zyklus
export const NIGHT_START=.60, NIGHT_END=.94;   // Nachtfenster
export const REACH=4.6;
// Die Welt ist doppelt so breit und doppelt so tief wie ursprünglich, also
// viermal so groß in der Fläche. Alles, was sich an ihrer Größe bemisst, hängt
// an BOUND (Baumzahl, Truhen, Fluss- und Dorfplätze weiter unten) — die alte
// Landschaft innerhalb von ±72 bleibt dabei Block für Block dieselbe, das Neue
// legt sich nur außen herum.
export const BOUND={x0:-144,x1:144,z0:-144,z1:144};
export const HOME={x:0,z:5,r:26,fade:13};      // flaches Starttal
export const SEA=0;                            // Wasserspiegel der Flüsse
// Die Rinne ist tief genug zum Schwimmen; die flachen Stellen bleiben Furten.
export const RIVER_BED=-4, RIVER_W=4.5;
export const WATER_Y=SEA;                      // Oberkante des Wassers
export const BEDROCK=-12;                      // tiefer geht es nicht — hier ist Schluss
export const SPAWN={x:0,z:18};
export const MARKET={x:-6,z:14};               // Manni und sein Stand, gleich beim Start
const NB4=[[1,0],[-1,0],[0,1],[0,-1]];
// Phase 5b: Benni-Kampfwerte — hier statt lokal in game.js/party/server.js
// definiert, weil beide Seiten exakt denselben Wert brauchen (der Client für
// seinen Offline-Einzelspieler-Fallback, der Server für die echte, jetzt
// serverseitige KI) und ein doppelt getipptes MOB_SPEED leicht auseinander-
// laufen könnte, ohne dass es sofort auffiele.
// Phase A: aus dem einen Benni werden drei Spielarten. Jede trägt ihre
// Kampfwerte, ihre Fluggabe und ihre Beute selbst statt sie über eine
// wachsende Zahl loser Konstanten zu verstreuen — MOB_HP & Co. bleiben als
// Aliase erhalten, damit nichts, was sie schon importiert, bricht.
// Hühner sind die erste FRIEDLICHE Spielart: peaceful:true markiert das für
// jede Stelle, die zwischen Angreifern und Mitläufern unterscheiden muss
// (siehe updateMobs/stepMob — beide biegen dort komplett aus der Kampf-KI
// aus). dmg:0 und atkCd sind darum reine Füllwerte, nie wirklich gelesen.
// w:0 hält sie aus pickMobKind() heraus, genau wie den Fluch-Benni außerhalb
// der Blutmondnacht — Hühner brauchen aber, anders als der, überhaupt keinen
// Blutmond-Bonus, sie kommen über einen eigenen, tagsüber laufenden
// Populationspfad in die Welt (Client: maintainChickens in game.js, Server:
// _spawnChicken in game-server.js — siehe CHICKEN_CAP/CHICKEN_NEAR_R unten).
export const MOBS={
  benni  :{hp:10,speed:2.35,dmg:3,atkCd:1.4,h:1.95,kbTake:1,  fly:false,w:1,   loot:['ball',1,2]},
  spider :{hp:14,speed:1.9, dmg:4,atkCd:1.6,h:1.5, kbTake:.7, fly:false,w:.28, loot:['string',1,2]},
  cursed :{hp:7, speed:3.1, dmg:2,atkCd:1.0,h:1.5, kbTake:1.4,fly:true, w:0,   loot:['string',1,1]},
  chicken:{hp:4, speed:.85, dmg:0,atkCd:99, h:.7,  kbTake:1,  fly:false,w:0,   loot:['meat',1,2], peaceful:true},
};
export const MOB_HP=MOBS.benni.hp, MOB_SPEED=MOBS.benni.speed,
             MOB_DMG=MOBS.benni.dmg, MOB_ATK_CD=MOBS.benni.atkCd;
// Stoßwerte: wie schnell ein Stoß verebbt (KB_DRAG), wie groß der Server ihn
// höchstens durchlässt (KB_MAX) und wie hoch der Fluch-Benni über dem Boden
// schwebt (FLY_H).
export const KB_DRAG=6, KB_MAX=10, FLY_H=2.2;
// Wie viele Bennis (aller Art) gleichzeitig unterwegs sein dürfen — wächst
// mit den Tagen, aber nur bis sieben, sonst erstickt man im eigenen Erfolg.
export const mobCap=day=>Math.min(7,2+Math.floor(day*.6));
export const MOB_SPAWN_MIN=6, MOB_SPAWN_MAX=11;
// Hühner zählen NICHT gegen mobCap (sie sind kein Nachtdruck, sie sollen
// einfach da sein) — beide Seiten filtern sie vor jedem mobCap-Vergleich
// eigens heraus (Client: die spawnMob-Wache in update(), Server: der
// night-Zweig in _startMobTimer). CHICKEN_CAP begrenzt ihre eigene, kleine
// Population stattdessen direkt: höchstens so viele gleichzeitig in
// Spielernähe (CHICKEN_NEAR_R), egal ob Tag oder Nacht. EGG_MIN/EGG_MAX ist
// der Abstand zwischen zwei Eiern je Huhn — kurz gehalten (90–180s statt der
// im Auftrag genannten 3–6 Minuten), damit man das Legen beim Testen nicht
// ewig abwarten muss.
export const CHICKEN_CAP=7, CHICKEN_NEAR_R=40;
export const EGG_MIN=90, EGG_MAX=180;

// ------------------------------------------------------------------ Geländeform
export function hash2(x,z,s){
  let h=Math.imul(x|0,374761393)+Math.imul(z|0,668265263)+Math.imul(s|0,1274126177)|0;
  h=Math.imul(h^h>>>13,1274126177);
  return ((h^h>>>16)>>>0)/4294967296;
}
// Reine Funktion der Tageszahl — wie dayEpoch0 kommen Client und Server ohne
// ein einziges zusätzliches Netzwerkpaket auf denselben Blutmond.
export const bloodMoon=day=>hash2(day,0,777)<1/7;
export function vnoise(x,z,scale,seed){
  const fx=x/scale, fz=z/scale;
  const x0=Math.floor(fx), z0=Math.floor(fz);
  const tx=fx-x0, tz=fz-z0;
  const sx=tx*tx*(3-2*tx), sz=tz*tz*(3-2*tz);
  return lerp(lerp(hash2(x0,z0,seed),  hash2(x0+1,z0,seed),  sx),
              lerp(hash2(x0,z0+1,seed),hash2(x0+1,z0+1,seed),sx),sz);
}
// Vier Flüsse: die beiden alten im Westen und Norden, dazu seit der
// Vergrößerung zwei weitere im Osten und Süden, damit auch das neue Land
// Wasser hat (und das Boot dort etwas zu tun). Die neuen liegen weit genug
// außerhalb der alten Weltgrenze (±72), dass ihre Uferausformung — sie
// reicht 26 Blöcke weit, siehe terrainH — die alte Landschaft nicht mehr
// berührt: bei x=72 sind es noch mindestens 36 Blöcke bis zum nächsten.
const riverAX=z=>-46+(vnoise(0,z,26,7)-.5)*20;
const riverBZ=x=>-47+(vnoise(x,0,24,8)-.5)*18;
const riverCX=z=>118+(vnoise(0,z,25,12)-.5)*20;
const riverDZ=x=>120+(vnoise(x,0,23,13)-.5)*18;
// Ohne Zwischenobjekte, weil das hier pro Geländesäule läuft: erst den
// nächstgelegenen Lauf suchen, dann nur für den das Flussbett auswürfeln.
export function riverAt(x,z){
  let d=Math.abs(x-riverAX(z)), which=0;
  const db=Math.abs(z-riverBZ(x)); if(db<d){ d=db; which=1; }
  const dc=Math.abs(x-riverCX(z)); if(dc<d){ d=dc; which=2; }
  const dd=Math.abs(z-riverDZ(x)); if(dd<d){ d=dd; which=3; }
  const deep=which===0?vnoise(0,z,19, 9)>.52
            :which===1?vnoise(x,0,19,10)>.52
            :which===2?vnoise(0,z,19,14)>.52
            :          vnoise(x,0,19,15)>.52;
  return {d,bed:deep?SEA-1:RIVER_BED};
}
// Das Land hinter den Flüssen — nur über eine Furt zu erreichen. Dort und
// nur dort wächst der 🌶️ Pfeffer. Jetzt sind es vier Ufer statt zwei: das
// alte Land hinter dem West- und dem Nordfluss und ebenso die Streifen
// jenseits der beiden neuen im Osten und Süden — sonst hinge das Gewürz der
// ganzen, viermal so großen Welt an einer einzigen Ecke.
export const beyondRiver=(x,z)=>x<riverAX(z)-RIVER_W-1||z<riverBZ(x)-RIVER_W-1
                              ||x>riverCX(z)+RIVER_W+1||z>riverDZ(x)+RIVER_W+1;
export function rawHeight(x,z){
  let h=vnoise(x,z,38,1)*7-2.2;                 // weite Hügel
  h+=vnoise(x,z,14,2)*2.6;                      // feine Wellen
  const m=vnoise(x,z,62,3);                     // Gebirgsmaske
  if(m>.56) h+=((m-.56)/.44)**2.2*27;
  return h;
}
// Die drei alten Dörfer im Kern, dazu drei im neuen Land — eines im Westen
// hinter dem Fluss, eines weit im Süden, eines im Nordosten. Jedes bringt
// einen Jannes mit (siehe traderSpots), damit die vierfache Fläche nicht
// bedeutet, dass man für ein Rezept eine Viertelstunde läuft. Alle liegen
// mit Abstand zu den Flussläufen: ein Dorf ebnet sein Gelände ein (VILL_R
// unten), und ein Fluss, der in eine Plateaukante läuft, sähe falsch aus.
export const VILLAGES=[{x:21,z:52},{x:44,z:-26},{x:50,z:24},
                       {x:-95,z:20},{x:20,z:86},{x:70,z:-85}]
  .map(v=>({...v,y:clamp(Math.round(rawHeight(v.x,v.z)),1,6)}));
export const VILL_R=14, VILL_FADE=11;
// Wie weit ein Haus höchstens von der Dorfmitte wegstehen darf, und wie breit
// der baumfreie Gürtel um ein Dorf ist. Das eine muss kleiner sein als das
// andere: ein Giebel, in den ein Baum hineinwächst, sieht nach Fehler aus.
// Beides ist mit den neuen Grundrissen gewachsen — vorher lagen alle vier
// Häuser eines Dorfes fest auf denselben nahen Ecken.
export const HOUSE_MAX=15, VILL_CLEAR=20;
// Der Pagodengarten: ein einzelner, fester Bauplatz statt eines gewürfelten
// wie bei den Dörfern — es soll immer genau eine Tempelanlage geben, an einer
// Stelle, die von Hand geprüft ist (Geländehöhe, Abstand zu Fluss und Dorf,
// siehe Auftrag). r ist der flachgeebnete Kern, fade der Übergang zurück ins
// natürliche Gelände, genau wie VILL_R/VILL_FADE bei den Dörfern.
export const PAGODA={x:-25,z:95,y:2,r:24,fade:12};
const _hCache=new Map();
// Oberkante der Säule: fester Grund liegt bei y < terrainH, gelaufen wird auf terrainH.
export function terrainH(x,z){
  x=Math.round(x); z=Math.round(z);
  const k=x+','+z;
  let v=_hCache.get(k);
  if(v!==undefined) return v;
  const hd=Math.hypot(x-HOME.x,z-HOME.z);
  if(hd<HOME.r) v=0;
  else{
    let h=rawHeight(x,z);
    const {d:rd,bed}=riverAt(x,z);
    if(rd<26){
      if(rd<RIVER_W) h=bed;
      else{ const t=clamp((rd-RIVER_W)/(26-RIVER_W),0,1); h=lerp(bed,h,Math.sqrt(t)); }
    }
    if(hd<HOME.r+HOME.fade){
      const t=(hd-HOME.r)/HOME.fade;
      h=lerp(0,h,t*t*(3-2*t));
    }
    // Der Pagodengarten ebnet sein Gelände genau wie ein Dorf ein — nur zuerst
    // geprüft und mit eigenem Radius. Liegt eine Säule noch im Einflussbereich
    // der Pagode, überspringt sie die Dorfsuche gleich ganz: die beiden liegen
    // 46 Blöcke auseinander und können sich darum nie wirklich in die Quere
    // kommen, aber so gewinnt die Pagode auch dann, wenn sie es doch täten.
    const pd=Math.hypot(x-PAGODA.x,z-PAGODA.z);
    if(pd<PAGODA.r) h=PAGODA.y;
    else if(pd<PAGODA.r+PAGODA.fade){
      const t=(pd-PAGODA.r)/PAGODA.fade; h=lerp(PAGODA.y,h,t*t*(3-2*t));
    }
    if(pd>=PAGODA.r+PAGODA.fade){
      let near=null, nd=Infinity;
      for(const g of VILLAGES){
        const d=Math.hypot(x-g.x,z-g.z);
        if(d<nd){ nd=d; near=g; }
      }
      if(nd<VILL_R) h=near.y;
      else if(nd<VILL_R+VILL_FADE){
        const t=(nd-VILL_R)/VILL_FADE; h=lerp(near.y,h,t*t*(3-2*t));
      }
    }
    v=Math.round(h);
  }
  if(_hCache.size<120000) _hCache.set(k,v);
  return v;
}
export function surfaceTex(x,z,h){
  if(h<=SEA-1) return 'sand';
  if(h>=18) return 'snow';
  if(h>=9)  return 'rock';
  if(h<=SEA+1&&riverAt(x,z).d<RIVER_W+3.5) return 'sand';
  return 'grass';
}

// ------------------------------------------------------------------ Blöcke
// tex   Texturname · hard Abbauzeit in Sekunden · drop Item-Id beim Abbau
export const BLOCKS={
  grass  :{tex:'grass', hard:.7,  drop:'dirt',   nm:'Gras'},
  dirt   :{tex:'dirt',  hard:.7,  drop:'dirt',   nm:'Erde'},
  rock   :{tex:'stone', hard:2.4, drop:'stone',  nm:'Stein',  pick:true},
  sand   :{tex:'sand',  hard:.6,  drop:'sand',   nm:'Sand'},
  snow   :{tex:'snow',  hard:.5,  drop:'snow',   nm:'Schnee'},
  log    :{tex:'log',   hard:1.6, drop:'log',    nm:'Holzstamm', axe:true},
  // twig markiert, was beim Abbauen manchmal einen Stock hergibt (siehe
  // breakBlock in game.js) — Laub tat das schon immer, die Nadeln und der
  // Busch sind jetzt genauso Reisig und sollen sich nicht anders anfühlen.
  leaf   :{tex:'leaf',  hard:.3,  drop:null,     nm:'Laub', twig:true},
  // Nadelbaum-Krone. Eigener Blocktyp statt dunkler eingefärbtem Laub, damit
  // man Fichte und Laubbaum schon von weitem auseinanderhält — und damit der
  // Nadelwald sich abbauen lässt, ohne dass Laub daraus wird.
  needle :{tex:'needle',hard:.3,  drop:null,     nm:'Nadeln', twig:true},
  plank  :{tex:'plank', hard:1.3, drop:'plank',  nm:'Bretter', axe:true},
  brick  :{tex:'brick', hard:2.2, drop:'brick',  nm:'Ziegel',  pick:true},
  bench  :{tex:'bench', hard:1.5, drop:'bench',  nm:'Werkbank',axe:true, use:'bench'},
  pot    :{tex:'pot',   hard:2.2, drop:'pot',    nm:'Kochtopf',pick:true, use:'pot'},
  chest  :{tex:'chest', hard:1.6, drop:'chest',  nm:'Truhe',   use:'chest', axe:true},
  // Alles, was wächst, steht als gekreuzte Fläche im Gelände: man geht
  // hindurch, es verdeckt nichts (siehe fills()), und es ist mit einem
  // Klick gepflückt statt abgebaut — hard bleibt darum ungenutzt bei 0.
  dominik:{tex:'dominik',hard:0, drop:'dominik',nm:'Dominik',
           cross:true, size:.85, alpha:true, pass:true},
  shroom :{tex:'shroom',hard:0,  drop:'mushroom',nm:'Pilz',
           cross:true, size:.8, sit:true, alpha:true, pass:true},
  pepper :{tex:'pepper',hard:0,  drop:'pepper', nm:'Pfefferstrauch',
           cross:true, size:.95,sit:true, alpha:true, pass:true},
  // Wilder Busch: kniehoch, steht wie alles Wachsende als gekreuzte Fläche im
  // Gras, und man geht mitten hindurch. Er trägt nichts — er ist Landschaft,
  // kein Vorrat; höchstens ein Stock fällt ab (twig, s. leaf oben).
  shrub  :{tex:'shrub', hard:0,  drop:null,     nm:'Busch',
           cross:true, size:1,  sit:true, alpha:true, pass:true, twig:true},
  saltore:{tex:'saltore',hard:2.6,drop:'salt',   nm:'Salzader', pick:true},
  coalore:{tex:'coalore',hard:2.2,drop:'coal',   nm:'Kohleader', pick:true},
  // --- Acker und was darauf wächst
  till   :{tex:'till',  hard:.6,  drop:'dirt',   nm:'Ackerboden'},
  // Der gezogene Dominik hängt an keinem Baum, er sitzt im Beet.
  bush   :{tex:'dominik',hard:0,  drop:'dominik',nm:'Dominikstrauch',
           cross:true, size:.9, sit:true, alpha:true, pass:true},
  sprout_d:{tex:'sprout_d',hard:0,drop:'kern',   nm:'Dominik-Setzling',
            cross:true, size:.7, sit:true, alpha:true, pass:true},
  sprout_m:{tex:'sprout_m',hard:0,drop:'mycel',  nm:'Pilzbrut',
            cross:true, size:.7, sit:true, alpha:true, pass:true},
  sprout_p:{tex:'sprout_p',hard:0,drop:'korn',   nm:'Pfeffer-Setzling',
            cross:true, size:.7, sit:true, alpha:true, pass:true},
  bedrock:{tex:'bedrock',hard:0,  drop:null,     nm:'Grundgestein', noBreak:true},
  // --- Der Pagodengarten. Eigene Blöcke statt eingefärbter alter, weil dieser
  // Ort von weitem als etwas anderes als Dorf oder Wald zu erkennen sein soll.
  cherry :{tex:'cherry', hard:1.6, drop:'log',    nm:'Kirschstamm', axe:true},
  // Wie Laub/Nadeln gibt die Blüte manchmal einen Stock her (twig) — sie ist
  // Baumkrone, kein eigenes Fach im Rucksack wert.
  blossom:{tex:'blossom',hard:.3,  drop:null,     nm:'Kirschblüte', twig:true},
  redwood:{tex:'redwood',hard:1.4, drop:'redwood',nm:'Zinnoberholz', axe:true},
  tile   :{tex:'tile',   hard:2.2, drop:'tile',   nm:'Tempelziegel', pick:true},
  paper  :{tex:'paper',  hard:.4,  drop:'paper',  nm:'Reispapierwand'},
  gravel :{tex:'gravel', hard:.7,  drop:'gravel', nm:'Kies'},
  // Der Schrein trägt die Rezepte am Ende der Treppe — noBreak, damit sie
  // nie verloren gehen können, use markiert ihn nur als anklickbar; was der
  // Klick tut, entscheidet ein anderer Auftrag.
  shrine :{tex:'shrine', hard:0,   drop:null,     nm:'Schrein',
           noBreak:true, use:'shrine'},
  alchemy:{tex:'alchemy',hard:2.0, drop:'alchemy',nm:'Trankstation',
           pick:true, use:'alchemy'},
};

// ------------------------------------------------------------------ Bäume
// Die Krone: zwei breite Lagen und eine schmale obendrauf. An einem langen
// Stamm sähe eine einzelne breite Lage aus wie ein Besen.
export const TREE_TOP=[];
(function treeShape(){
  for(const dy of [0,1])
    for(let x=-2;x<=2;x++) for(let z=-2;z<=2;z++)
      if(Math.abs(x)+Math.abs(z)<=2) TREE_TOP.push([x,dy,z]);
  for(let x=-1;x<=1;x++) for(let z=-1;z<=1;z++)
    if(Math.abs(x)+Math.abs(z)<=1) TREE_TOP.push([x,2,z]);
})();
// Der Nadelbaum: ein Kegel in Etagen statt eines Balls obendrauf. Unten ein
// breiter Kranz, darüber wechseln sich schmal und breit ab — das gibt die
// abgestuften Zweige einer Fichte —, ganz oben eine einzelne Spitze. Die
// Krone reicht weit am Stamm herunter (CONIFER_H Lagen), darum trägt sie
// ihre eigene Liste und ist kein gestauchtes TREE_TOP.
export const CONIFER_H=6;
export const CONIFER_TOP=[];
(function coniferShape(){
  const ring=(dy,rad)=>{
    for(let x=-rad;x<=rad;x++) for(let z=-rad;z<=rad;z++)
      if(Math.abs(x)+Math.abs(z)<=rad) CONIFER_TOP.push([x,dy,z]);
  };
  ring(0,2); ring(1,2); ring(2,1); ring(3,2); ring(4,1); ring(5,0);
})();
// Die Kirschblüte: breiter als hoch und an den Rändern leicht hängend, statt
// eines Balls wie TREE_TOP — ein flacher Schirm ist es, der eine Kirsche
// schon auf den ersten Blick von einem gewöhnlichen Laubbaum unterscheidet.
export const BLOSSOM_TOP=[];
(function blossomShape(){
  // Die breiteste Lage unten (Radius 4 in der Manhattan-Norm, also ein
  // flacher Diamant), eine engere darüber — nur zwei Lagen, damit die Krone
  // gedrungen bleibt statt hoch aufzuragen.
  for(let x=-3;x<=3;x++) for(let z=-3;z<=3;z++)
    if(Math.abs(x)+Math.abs(z)<=4) BLOSSOM_TOP.push([x,1,z]);
  for(let x=-2;x<=2;x++) for(let z=-2;z<=2;z++)
    if(Math.abs(x)+Math.abs(z)<=3) BLOSSOM_TOP.push([x,2,z]);
  // Die hängenden Spitzen: einzelne Blüten eine Lage UNTER dem Schirm, an
  // seinem Rand — das "Drooping", das eine Kirsche von einem Busch abhebt.
  for(const [x,z] of [[3,0],[-3,0],[0,3],[0,-3],[2,2],[-2,2],[2,-2],[-2,-2]])
    BLOSSOM_TOP.push([x,0,z]);
})();
// ------------------------------------------------------------------ Dörfer
// Die Bauarten. In jedem Dorf stand bisher viermal dasselbe Häuschen; das hier
// ist die Auswahl, aus der jeder Bauplatz jetzt zieht.
//
// w/d ist der Grundriss, h die Wandhöhe über dem Fußboden. wall:null heißt
// offener Unterstand — nur Eckpfosten aus trim und ein Dach darüber. roof ist
// die Dachform: 'gable' Sattel (First über die lange Seite), 'hip' Walm (läuft
// von allen vier Seiten auf einen kurzen First zu), 'flat' ein flaches Dach
// mit Brüstung. Ein Block Überstand hat jedes Dach — ohne den sieht ein
// Klötzchenhaus aus wie eine Kiste mit Deckel.
export const HOUSE_KINDS=[
  // Die Kate: das alte Dorfhaus, jetzt mit richtigem Dach statt einer Platte.
  {id:'kate',   w:5,d:5,h:3, floor:'plank',wall:'plank',trim:'log',  roofMat:'brick',roof:'gable'},
  // Das Steinhaus: breiter, gemauert, mit Walmdach — das wohlhabende im Dorf.
  {id:'stein',  w:6,d:5,h:3, floor:'rock', wall:'brick',trim:'rock', roofMat:'plank',roof:'hip'},
  // Das Langhaus: schmal und lang, der First läuft über die ganze Länge.
  {id:'lang',   w:9,d:5,h:3, floor:'plank',wall:'plank',trim:'log',  roofMat:'brick',roof:'gable'},
  // Der Turm: nur vier mal vier, dafür doppelt so hoch, oben eine Brüstung
  // statt eines Dachs. Von weitem sieht man daran, dass dort ein Dorf liegt.
  {id:'turm',   w:4,d:4,h:7, floor:'rock', wall:'brick',trim:'rock',  roofMat:'rock', roof:'flat'},
  // Die Scheune: gar keine Wände, nur Pfosten und ein großes Dach.
  {id:'scheune',w:7,d:5,h:4, floor:'plank',wall:null,   trim:'log',  roofMat:'plank',roof:'gable'},
  // Die Werkstatt: Kate mit einer 🔨 Werkbank darin, an der man auch bauen darf.
  {id:'werk',   w:6,d:6,h:3, floor:'plank',wall:'plank',trim:'log',  roofMat:'brick',roof:'hip', bench:true},
];
// Die Grundrisse. Jeder Eintrag ist ein Bauplatz als Mittelpunkt relativ zur
// Dorfmitte; das Haus wird darum herum gesetzt und dreht seine Tür zum Platz.
// Die Bauplätze bleiben eng genug beieinander, dass auch das breiteste Haus
// noch auf die eingeebnete Fläche passt (VILL_R) — was nicht passt, weicht
// beim Bauen auf eine kleinere Bauart aus.
export const VILLAGE_PLANS=[
  // Das Carré: vier Häuser um den Platz, wie bisher — nur eben nicht mehr
  // viermal dasselbe Haus.
  [[-8,-8],[8,-8],[-8,8],[8,8]],
  // Die Gasse: zwei Reihen an einer Straße, drei und drei.
  [[-8,-9],[-9,0],[-8,9],[8,-9],[9,0],[8,9]],
  // Das Runddorf: die Höfe stehen im Kreis um den Platz.
  [[0,-10],[10,-3],[6,9],[-6,9],[-10,-3]],
  // Das Haufendorf: unregelmäßig gewachsen, ohne erkennbare Ordnung.
  [[-9,-6],[1,-10],[9,3],[-5,9],[-1,0]],
];
// Die Dominiks hängen unter der Krone, und die hängt hoch: vom Boden aus
// kommt man mit REACH nicht heran, es braucht zwei, drei gesetzte Blöcke.
export const TRUNK_MIN=10;
export const FRUIT_OFF=[[2,0],[-2,0],[0,2],[0,-2],[1,1],[-1,-1],[1,-1],[-1,1]];
// Nur auf ebenem Grasland: Hänge, Ufer und Fels bleiben frei.
export function treeSpot(x,z){
  const h=terrainH(x,z);
  if(h<SEA+1||h>=9) return -1;
  if(surfaceTex(x,z,h)!=='grass') return -1;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])
    if(Math.abs(terrainH(x+dx,z+dz)-h)>1) return -1;
  return h;
}

// ------------------------------------------------------------------ Weltinstanz
// Alles, was sich zur Laufzeit ändert (abgebaute/gesetzte Blöcke, Truheninhalt,
// Fackeln) lebt in einer eigenen Instanz — Client und Server rufen createWorld()
// je einmal auf und bekommen dieselbe deterministisch erzeugte Landschaft,
// aber jeder seine eigenen, unabhängigen Maps für das, was sich ändert.
export function createWorld(){
  const scenery=new Map();                 // "x,y,z" → Blocktyp (Bäume, Häuser, Truhen)
  const edits=new Map();                   // "x,y,z" → Blocktyp oder null (abgebaut)
  const colRange=new Map();                // "x,z" → [lo,hi] der zu vernetzenden Höhen
  // "x,y,z" → {items, opened}. items is a FIXED 24-slot array (index i holds
  // {id,n} or null, exactly like the inventory/craft-grid slots) — not a
  // variable-length list — so every chest can be addressed by slot index
  // for both taking and putting (see game.js clickChestCell/chest-take/
  // chest-put).
  const chests=new Map();
  const torches=[];
  const chestSpots=[];
  const houseSpots=[];                     // Stube im zweiten Haus jedes Dorfes
  const traderSpots=[];                    // wo die Jannessen stehen
  const guardSpots=[];                     // Standplätze der Tempelwachen, je Stockwerk
  const K=(x,y,z)=>x+','+y+','+z;

  function noteRange(x,z,y){
    const k=x+','+z, r=colRange.get(k);
    if(!r) colRange.set(k,[y,y]);
    else{ if(y<r[0]) r[0]=y; if(y>r[1]) r[1]=y; }
  }
  function put(t,x,y,z){ scenery.set(K(x,y,z),t); noteRange(x,z,y); }

  // Salz steckt im Fels, nicht im Sand: Nester von ein paar Blöcken, die sich
  // über drei Höhenlagen ziehen. Aus derselben Rauschformel wie die Landschaft,
  // also überall gleich, ohne dass etwas gespeichert werden müsste.
  function saltVein(x,y,z){
    const lay=Math.floor(y/3);
    return vnoise(x+lay*29,z-lay*17,8,61)>.885;
  }
  // Kohle liegt flacher als Salz und aus eigenem Samen — sonst säßen beide
  // Adern immer an derselben Stelle übereinander.
  function coalVein(x,y,z){
    const lay=Math.floor(y/3);
    return vnoise(x-lay*19,z+lay*23,8,67)>.86;
  }
  function terrainType(x,z,y){
    const H=terrainH(x,z);
    if(y>=H) return null;
    if(y<=BEDROCK) return 'bedrock';        // unzerstörbarer Boden der Welt
    if(y===H-1) return surfaceTex(x,z,H);
    if(y>=H-3) return 'dirt';
    if(y<=H-4&&coalVein(x,y,z)) return 'coalore';
    if(y<=H-5&&saltVein(x,y,z)) return 'saltore';
    return 'rock';
  }
  function blockAt(x,y,z){
    if(x<BOUND.x0||x>BOUND.x1||z<BOUND.z0||z>BOUND.z1) return null;
    const k=K(x,y,z);
    const e=edits.get(k);
    if(e!==undefined) return e;             // null = abgebaut
    const s=scenery.get(k);
    if(s) return s;
    return terrainType(x,z,y);
  }
  const solidAt=(x,y,z)=>!!blockAt(Math.round(x),Math.floor(y),Math.round(z));
  // Füllt der Block seine Zelle wirklich aus? Gekreuzte Flächen — Frucht,
  // Pilzstrauch — tun das nicht: sie sind zwei dünne Blätter mitten in der
  // Zelle. Zum Verdecken zählt also nur, was voll ist.
  const fills=t=>!!t&&!BLOCKS[t]?.cross;
  const fillsAt=(x,y,z)=>fills(blockAt(x,y,z));
  // Wasser ist kein Block, sondern der Raum unter dem Wasserspiegel über einem
  // Flussbett. Es fließt nicht: wo das Gelände über den Spiegel reicht, ist
  // trocken, und ein gesetzter Block verdrängt das Wasser aus seiner Zelle.
  function waterAt(x,y,z){
    if(y>=WATER_Y) return false;
    const bx=Math.round(x), bz=Math.round(z);
    if(bx<BOUND.x0||bx>BOUND.x1||bz<BOUND.z0||bz>BOUND.z1) return false;
    if(terrainH(bx,bz)>=WATER_Y) return false;
    return !blockAt(bx,Math.floor(y),bz);
  }
  // Oberkante der Säule: erste freie Höhe über festem Grund. Gewächse zählen
  // nicht mit — sonst stünde ein Benni auf einem Pilz wie auf einer Stufe.
  function surfaceAt(x,z){
    x=Math.round(x); z=Math.round(z);
    let y=terrainH(x,z);
    while(y<64&&fillsAt(x,y,z)) y++;
    while(y>BEDROCK&&!fillsAt(x,y-1,z)) y--;
    return y;
  }
  // Erster Platz mit festem Boden und zwei freien Blöcken darüber.
  function safeSpot(){
    for(let r=0;r<14;r++)
      for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++){
        if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
        const x=SPAWN.x+dx, z=SPAWN.z+dz;
        if(x<BOUND.x0||x>BOUND.x1||z<BOUND.z0||z>BOUND.z1) continue;
        const y=surfaceAt(x,z);
        if(y>SEA-2&&blockAt(x,y-1,z)&&!blockAt(x,y,z)&&!blockAt(x,y+1,z)) return {x,y,z};
      }
    return {x:SPAWN.x,y:surfaceAt(SPAWN.x,SPAWN.z),z:SPAWN.z};
  }
  // surfaceAt() rastet auf ganze Blöcke ein: ungebremst springt ein Benni bei
  // jedem Zellwechsel und flackert an Kanten hin und her — nachziehen statt
  // setzen (siehe mobY im Aufrufer), hier nur die reine Blockade-Prüfung.
  function mobBlocked(x,z,fromY){
    const s=surfaceAt(x,z);
    return s-fromY>1.001||s<SEA-1;
  }
  // Sichtlinie zwischen zwei Punkten frei? Gemeinsam für Client (updateMobs)
  // und Server (stepMob) — ein Benni darf nicht durch eine ein Block dicke
  // Mauer angreifen, nur weil er auf ähnlicher Höhe steht. In ~0.2-Block-
  // Schritten vom Start- zum Zielpunkt marschieren, sobald eine Zelle dazwi-
  // schen voll ist (fillsAt) abbrechen. Start- und Zielzelle selbst zählen
  // nicht mit — sonst würde der Block, in dem Angreifer oder Opfer gerade
  // stehen, sich selbst die Sicht versperren.
  function losClear(x0,y0,z0,x1,y1,z1){
    const dx=x1-x0, dy=y1-y0, dz=z1-z0;
    const dist=Math.hypot(dx,dy,dz);
    if(dist<1e-6) return true;
    const steps=Math.ceil(dist/.2);
    const sx0=Math.round(x0), sy0=Math.floor(y0), sz0=Math.round(z0);
    const sx1=Math.round(x1), sy1=Math.floor(y1), sz1=Math.round(z1);
    for(let i=1;i<steps;i++){
      const t=i/steps;
      const cx=Math.round(x0+dx*t), cy=Math.floor(y0+dy*t), cz=Math.round(z0+dz*t);
      if(cx===sx0&&cy===sy0&&cz===sz0) continue;
      if(cx===sx1&&cy===sy1&&cz===sz1) continue;
      if(fillsAt(cx,cy,cz)) return false;
    }
    return true;
  }
  const litAt=(x,z,r=14)=>torches.some(t=>Math.hypot(t.x-x,t.z-z)<r);
  // Reine Datenmutation — das Neuvernetzen des Chunk-Meshs (markDirty) ist
  // Sache des Aufrufers, der hat kein Rendering-Wissen hier drin.
  function setBlock(x,y,z,type){
    edits.set(K(x,y,z),type||null);
    noteRange(x,z,y-1); noteRange(x,z,y+1);
    for(const [dx,dz] of NB4){ noteRange(x+dx,z+dz,y-1); noteRange(x+dx,z+dz,y+1); }
  }

  // -------------------------------------------------------------- Landschaft
  (function landscape(){
    // Derselbe Test wie VILLAGES.some(...) unten, nur für den einen festen
    // Pagoden-Platz statt für jedes Dorf: wilde Bäume, Büsche und Umgestürzte
    // sollen nicht mitten im Garten aufploppen, den wir gleich von Hand bauen.
    const inPagoda=(x,z)=>Math.abs(x-PAGODA.x)<PAGODA.r&&Math.abs(z-PAGODA.z)<PAGODA.r;
    // --- Dörfer. Alles hier legt Blöcke ab vy — der freien Zelle über dem
    // eingeebneten Dorfboden (VILL_R in terrainH). Fußböden, Platz und Wege
    // liegen damit eine Stufe über dem Gras ringsum, so wie schon immer.

    // Der Baukörper: Fußboden über den ganzen Grundriss (auch unter der Tür,
    // sonst stolpert man in ein Loch), darauf die Wände. Die Tür ist zwei
    // Blöcke hoch, die Fenster sitzen auf Augenhöhe und höher. Ecken bekommen
    // ein eigenes Material — das gibt dem Haus Kanten statt einer glatten
    // Fläche. Ohne Wand (o.wall null) bleiben nur Boden und Eckpfosten: die
    // offene Scheune.
    const shell=(x0,z0,y,w,d,h,o)=>{
      for(let dx=0;dx<w;dx++) for(let dz=0;dz<d;dz++){
        const x=x0+dx, z=z0+dz;
        put(o.floor,x,y,z);
        const edge=dx===0||dx===w-1||dz===0||dz===d-1;
        const corner=(dx===0||dx===w-1)&&(dz===0||dz===d-1);
        if(!edge) continue;
        if(!o.wall){ if(corner) for(let k=1;k<=h;k++) put(o.trim,x,y+k,z); continue; }
        for(let k=1;k<=h;k++){
          // Die Tür lässt zwei Blöcke frei, die Fenster je einen — aber weder
          // in den Ecken (die tragen) noch in der obersten Lage (die trägt das
          // Dach) und nie neben der Tür, sonst steht davon zu wenig Wand.
          if(dx===o.doorX&&dz===o.doorZ){ if(k<=2) continue; }
          else if(!corner&&k>1&&k<h&&Math.abs(dx-o.doorX)+Math.abs(dz-o.doorZ)>1
                  &&hash2(x,z,161+k)<.18) continue;
          put(corner?o.trim:o.wall,x,y+k,z);
        }
      }
    };
    // Satteldach: Lage für Lage von zwei Seiten einrücken, bis der First übrig
    // bleibt. Gelegt wird nicht die ganze Lage, sondern nur ihr abfallender
    // Rand — was dazwischen liegt, deckt schon die nächste ab.
    //
    // Der Rand ist dabei ZWEI Reihen breit, nicht eine. Bei einer greift die
    // nächste Lage genau dort an, wo die vorige aufhört, und zwischen den
    // Stufen bleibt eine diagonale Ritze: von schräg unten sieht man durchs
    // Dach in den Himmel. Mit zwei Reihen überlappen sich die Stufen um eine,
    // die Ritze ist zu, und das Dach wirkt von außen nur etwas kräftiger.
    const slope=(mat,x0,z0,y,w,d,alongX)=>{
      const lay=Math.ceil(((alongX?d:w)+2)/2);
      for(let i=0;i<lay;i++){
        const ax=x0-1+(alongX?0:i), bx=x0+w-(alongX?0:i);
        const az=z0-1+(alongX?i:0), bz=z0+d-(alongX?i:0);
        for(let x=ax;x<=bx;x++) for(let z=az;z<=bz;z++){
          const e=alongX?Math.min(z-az,bz-z):Math.min(x-ax,bx-x);
          if(i<lay-1&&e>1) continue;
          put(mat,x,y+i,z);
        }
      }
    };
    // Walmdach: dasselbe von allen vier Seiten. Es läuft nicht auf einen First
    // über die ganze Länge zu, sondern auf ein kurzes Stück in der Mitte.
    const hip=(mat,x0,z0,y,w,d)=>{
      const lay=Math.ceil((Math.min(w,d)+2)/2);
      for(let i=0;i<lay;i++){
        const ax=x0-1+i, bx=x0+w-i, az=z0-1+i, bz=z0+d-i;
        if(ax>bx||az>bz) break;
        for(let x=ax;x<=bx;x++) for(let z=az;z<=bz;z++){
          if(i<lay-1&&Math.min(x-ax,bx-x,z-az,bz-z)>1) continue;
          put(mat,x,y+i,z);
        }
      }
    };
    // Flaches Dach mit Brüstung — nur der Turm trägt eines. Die Zinnen machen
    // aus der Platte oben eine Plattform, auf der offensichtlich jemand steht.
    const flatRoof=(mat,x0,z0,y,w,d)=>{
      for(let x=x0-1;x<=x0+w;x++) for(let z=z0-1;z<=z0+d;z++){
        put(mat,x,y,z);
        if((x===x0-1||x===x0+w||z===z0-1||z===z0+d)&&((x+z)&1)) put(mat,x,y+1,z);
      }
    };

    for(const v of VILLAGES){
      const {x:vx,z:vz,y:vy}=v;
      // Der Wurf hängt allein an den Koordinaten des Dorfes: kein gemeinsamer
      // Generator, den ein späterer Eingriff woanders verschieben könnte, und
      // für Client wie Server derselbe Grundriss ohne ein Netzwerkpaket.
      const rv=mulberry(Math.imul(vx,73856093)^Math.imul(vz,19349663));
      const plan=VILLAGE_PLANS[Math.floor(rv()*VILLAGE_PLANS.length)];
      const want=Math.min(plan.length,3+Math.floor(rv()*3));   // drei bis fünf Häuser
      // Der Platz: gepflastert, mal quadratisch, mal rund, mit einem Stein in
      // der Mitte.
      const pr=2+Math.floor(rv()*2), round=rv()<.5;
      for(let dx=-pr;dx<=pr;dx++) for(let dz=-pr;dz<=pr;dz++){
        if(round&&Math.hypot(dx,dz)>pr+.4) continue;
        put(dx||dz?'rock':'brick',vx+dx,vy,vz+dz);
      }
      const houses=[];
      for(const [ax,az] of plan){
        if(houses.length>=want) break;
        // In die ersten beiden Häuser kommen Truhe und Jannes — die brauchen
        // Wände, eine offene Scheune wäre für beides das falsche Haus.
        const needsWalls=houses.length<2;
        const start=Math.floor(rv()*HOUSE_KINDS.length), rot=rv()<.5;
        let kind=null, w=0, d=0, x0=0, z0=0;
        for(let k=0;k<HOUSE_KINDS.length&&!kind;k++){
          const c=HOUSE_KINDS[(start+k)%HOUSE_KINDS.length];
          if(needsWalls&&!c.wall) continue;
          w=rot?c.d:c.w; d=rot?c.w:c.d;
          x0=vx+ax-(w>>1); z0=vz+az-(d>>1);
          // Passt der Grundriss? Gefragt wird nicht nach einem Radius, sondern
          // nach dem Gelände selbst: jede Zelle des Grundrisses muss auf
          // Dorfhöhe liegen, sonst hinge eine Ecke in der Luft oder steckte im
          // Hang. Das ebene Stück reicht je nach Dorf und Richtung
          // unterschiedlich weit über VILL_R hinaus (die Abstufung rundet sich
          // noch eine Weile auf dieselbe Höhe) — so nutzt jedes Dorf genau so
          // viel Platz, wie es wirklich hat. HOUSE_MAX deckelt das trotzdem,
          // damit kein Haus aus dem baumfreien Gürtel um das Dorf herausragt.
          let fits=Math.max(Math.abs(ax),Math.abs(az))+Math.max(w,d)/2<=HOUSE_MAX;
          for(let cx=x0;cx<x0+w&&fits;cx++) for(let cz=z0;cz<z0+d&&fits;cz++)
            if(terrainH(cx,cz)!==vy) fits=false;
          // Zwischen zwei Häusern müssen zwei Blöcke Luft bleiben, sonst
          // wachsen ihre Dächer (je ein Block Überstand) ineinander.
          const clash=houses.some(b=>x0-3<=b.x1&&b.x0<=x0+w+2&&z0-3<=b.z1&&b.z0<=z0+d+2);
          if(fits&&!clash) kind=c;
        }
        if(!kind) continue;
        // Die Tür zeigt zum Platz; welche Wand das ist, entscheidet die
        // größere der beiden Richtungen dorthin.
        const fx=vx-(x0+(w>>1)), fz=vz-(z0+(d>>1));
        const o={...kind, doorX:0, doorZ:0};
        if(Math.abs(fx)>=Math.abs(fz)){ o.doorX=fx>0?w-1:0; o.doorZ=d>>1; }
        else                          { o.doorZ=fz>0?d-1:0; o.doorX=w>>1; }
        shell(x0,z0,vy,w,d,kind.h,o);
        const ry=vy+kind.h+1;
        if(kind.roof==='gable')     slope(kind.roofMat,x0,z0,ry,w,d,w>=d);
        else if(kind.roof==='hip')  hip(kind.roofMat,x0,z0,ry,w,d);
        else                        flatRoof(kind.roofMat,x0,z0,ry,w,d);
        houses.push({x0,z0,x1:x0+w-1,z1:z0+d-1,w,d,kind,
                     doorX:x0+o.doorX, doorZ:z0+o.doorZ});
      }
      // Truhe ins erste, Jannes ins zweite Haus — dieselbe Reihenfolge wie
      // vorher, ein Eintrag je Dorf: an traderSpots und damit an der Zuordnung
      // Jannes ↔ Angebot ändert sich dadurch nichts.
      const [h0,h1]=houses;
      if(h0) chestSpots.push({x:h0.x0+1,y:vy+1,z:h0.z0+1});
      if(h1){
        // Wie weit der Jannes umhergeht, hängt jetzt am Zimmer statt an einer
        // Zahl, die Client und Server doppelt tippen mussten: in der Kate ein
        // Schritt, im Langhaus drei. Sonst liefe er im Turm durch die Wand.
        const roam=Math.max(.8,(Math.min(h1.w,h1.d)-2)/2);
        houseSpots.push({x:h1.x0+(h1.w>>1),z:h1.z0+(h1.d>>1),roam});
      }
      // Die Werkbank in der Werkstatt. Sie steht in der hinteren Ecke, die
      // Truhe oben in der vorderen — so kommen sich beide auch dann nicht ins
      // Gehege, wenn die Werkstatt zufällig das Truhenhaus ist.
      for(const h of houses) if(h.kind.bench) put('bench',h.x1-1,vy+1,h.z1-1);
      // Ein gepflasterter Weg von jeder Tür zum Platz. Er macht aus ein paar
      // Häusern erst ein Dorf — und er nimmt die Stufe, die der um einen Block
      // erhöhte Dorfboden sonst vor jede Tür setzte. Gelegt wird nur auf
      // freien Boden, damit ein Weg, der an einem anderen Haus vorbeiführt,
      // ihm nicht den Fußboden aufreißt.
      for(const h of houses){
        let px=h.doorX, pz=h.doorZ;
        for(let k=0;k<26&&Math.hypot(px-vx,pz-vz)>1;k++){
          if(!scenery.has(K(px,vy,pz))) put('rock',px,vy,pz);
          if(Math.abs(px-vx)>=Math.abs(pz-vz)) px+=Math.sign(vx-px);
          else pz+=Math.sign(vz-pz);
        }
      }
    }
    // --- Manni-Markt: vier Pfosten, ein Dach, ein Tresen. Er steht im flachen
    // Starttal und zeigt seine Theke dem Startpunkt zu, damit man beim ersten
    // Umsehen davorsteht.
    {
      const {x:mx,z:mz}=MARKET, my=terrainH(mx,mz);
      for(const [px,pz] of [[-2,-2],[2,-2],[-2,2],[2,2]])
        for(let dy=0;dy<3;dy++) put('log',mx+px,my+dy,mz+pz);
      for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) put('plank',mx+dx,my+3,mz+dz);
      for(let dx=-1;dx<=1;dx++) put('plank',mx+dx,my,mz+2);      // Tresen zum Startpunkt
    }
    // --- Der Pagodengarten: ein einzelner, von Hand gesetzter Bauplatz (siehe
    // PAGODA oben) statt einer gewürfelten Anlage wie bei den Dörfern — davon
    // soll es genau einen geben. Kies statt Gras, Kirschbäume statt Wald, ein
    // Torii als Wegweiser von weitem und ein fünfstöckiger Tempel als Ziel.
    {
      const PX=PAGODA.x, PZ=PAGODA.z, PY=PAGODA.y;

      // -------------------------------------------------------- Der Tempel
      // R ist der Halbmesser je Stockwerk (Grundfläche (2R+1)²) — 13×13 unten,
      // danach durchgehend zwei Blöcke schmaler bis 5×5 oben, das als offener
      // Pavillon endet: eine Reispapierwand ließe dort, wo kaum noch
      // Grundfläche übrig ist, keinen Platz mehr für Schrein UND Wache.
      // Wichtig: KEINE zwei Werte in R dürfen gleich sein. Die Wendeltreppe
      // eines Stockwerks läuft im Ring exakt einen Block innerhalb der
      // kleineren der beiden angrenzenden Grundflächen (siehe stairCols
      // unten) — zwei gleich große Nachbarn ergäben denselben Ringradius auf
      // beiden Seiten eines Stockwerks, und die rein aus dem Ring gewürfelte
      // Drehung könnte dann Auf- und Abstieg auf dieselbe Spalte legen: zwei
      // Stufen verschiedener Treppen im selben Luftraum, eine davon nicht
      // mehr begehbar. Bei lauter verschiedenen Radien ist das unmöglich,
      // weil ein Ring mit Radius r und einer mit Radius r' bei r≠r' keine
      // einzige Zelle teilen. FY ist die Zelle des Bretterbodens je
      // Stockwerk, FLOORH der Abstand zum nächsten — sechs Blöcke, vier für
      // die Wand (SH) und zwei für die hochgezogene Traufe. Genau dieser
      // Rhythmus ist es, den die Wendeltreppe braucht: sechs Stufen, jede
      // einen Block höher als die vorige, wie es der automatische Schritt in
      // updatePlayer (game.js, canStep) verlangt — mehr als ein Block
      // Unterschied, und die Treppe wäre für den Spieler unbegehbar.
      const R=[6,5,4,3,2];
      const SH=4, FLOORH=SH+2;
      const FY=R.map((_,s)=>PY+s*FLOORH);

      // Ecken tragen Zinnoberholz-Pfosten, dazwischen Reispapier — wie
      // shell() bei den Dörfern, nur ohne die zufälligen Fensterlücken: ein
      // Tempel hat keine Löcher in seinen Wänden außer der einen Tür im
      // Erdgeschoss und den Treppenschächten, die eigens freigehalten werden.
      const wall=(x0,z0,w,d,y,h,doorDX)=>{
        for(let dx=0;dx<w;dx++) for(let dz=0;dz<d;dz++){
          const edge=dx===0||dx===w-1||dz===0||dz===d-1;
          if(!edge) continue;
          const x=x0+dx, z=z0+dz;
          const corner=(dx===0||dx===w-1)&&(dz===0||dz===d-1);
          for(let k=1;k<=h;k++){
            if(doorDX!=null&&dx===doorDX&&dz===0&&k<=2) continue;
            put(corner?'redwood':'paper',x,y+k,z);
          }
        }
      };
      // Das oberste Stockwerk trägt nur seine vier Eckpfosten — offen genug,
      // dass der Schrein von jeder Seite aus zu sehen und zu erreichen ist.
      const posts=(x0,z0,w,d,y,h)=>{
        for(const [dx,dz] of [[0,0],[w-1,0],[0,d-1],[w-1,d-1]])
          for(let k=1;k<=h;k++) put('redwood',x0+dx,y+k,z0+dz);
      };
      // Die Traufe: DREI Ringe, und der äußerste liegt doppelt.
      //
      // Zwei Ringe waren es zuerst, der äußere einen Block höher als der
      // innere — die hochgezogene Pagodentraufe, die ein Klötzchendach von
      // einem echten Pagodendach unterscheidet. Nur hatte das zwei Löcher:
      //
      // Erstens berührten sich die beiden Ringe dabei nur über die Kante:
      // außen y+1, innen y, dazwischen nichts. Von schräg unten sah man
      // genau durch diese Diagonale in den Himmel. Dasselbe Problem hat
      // slope() bei den Dorfdächern schon gelöst (siehe den Kommentar dort),
      // und zwar mit derselben Antwort: die Stufe zwei Lagen dick machen,
      // damit sich die Ringe überlappen statt sich nur zu streifen. Der
      // äußerste Ring bekommt darum y UND y+1.
      //
      // Zweitens endete das Dach einen Ring ZU FRÜH. X0/X1 greifen zwei
      // Blöcke über die Wand hinaus, e=2 ist damit genau die Wandlinie
      // selbst — und die blieb offen. Über der obersten Wandreihe stand der
      // Himmel, rundherum, in jedem Stockwerk: der Boden des nächsten
      // Stockwerks ist einen Ring kleiner und deckt sie nicht mit ab. Ein
      // Dach muss die Wand treffen, auf der es sitzt.
      //
      // Der Innenraum bleibt unberührt (e>2): dort deckt der Bretterboden
      // des nächsten Stockwerks, und genau dort steigt auch die Treppe
      // durch — sie läuft auf Halbmesser R[s]-2 und damit sicher innerhalb.
      const eave=(x0,z0,w,d,y)=>{
        const X0=x0-2,X1=x0+w+1,Z0=z0-2,Z1=z0+d+1;
        for(let x=X0;x<=X1;x++) for(let z=Z0;z<=Z1;z++){
          const e=Math.min(x-X0,X1-x,z-Z0,Z1-z);
          if(e>2) continue;
          put('tile',x,y,z);
          if(e===0) put('tile',x,y+1,z);
        }
      };
      // Der Ring einer Wendeltreppen-Etage: die Umrandung eines Quadrats mit
      // Halbmesser rad, im Uhrzeigersinn ab der linken oberen Ecke — jeder
      // Schritt darin unterscheidet sich vom vorigen in genau einer Achse um
      // genau ein Feld, exakt das Muster, das der automatische Schritt des
      // Spielers braucht.
      const ringPath=rad=>{
        const p=[];
        for(let dx=-rad;dx<=rad;dx++) p.push([dx,-rad]);
        for(let dz=-rad+1;dz<=rad;dz++) p.push([rad,dz]);
        for(let dx=rad-1;dx>=-rad;dx--) p.push([dx,rad]);
        for(let dz=rad-1;dz>=-rad+1;dz--) p.push([-rad,dz]);
        return p;
      };
      // Die vier Treppen: je eine zwischen zwei Stockwerken, im Ring EINEN
      // Block innerhalb der Grundfläche des jeweils KLEINEREN der beiden
      // Stockwerke — so bleibt sie sowohl von der eigenen (größeren) Wand als
      // auch von der Wand des nächsten (kleineren) Stockwerks freigestellt,
      // egal ob dieses schrumpft oder (ganz oben) gleich groß bleibt. Jede
      // Treppe beginnt an einer anderen Ecke ihres Rings (startOff), damit
      // sich der Aufstieg ums Gebäude windet statt immer an derselben Seite
      // emporzulaufen.
      const stairCols=[];
      for(let s=0;s<4;s++){
        const rad=R[s+1]-1;
        const ring=ringPath(rad);
        const startOff=(s%4)*2*rad;
        const cols=[];
        for(let i=0;i<FLOORH;i++){
          const [dx,dz]=ring[(startOff+i)%ring.length];
          const x=PX+dx, z=PZ+dz, y=FY[s]+1+i;
          put('plank',x,y,z);
          cols.push(x+','+z);
        }
        stairCols.push(cols);
      }
      // Die Böden: die volle Grundfläche in Bretter, außer dort, wo die
      // Treppe von unten hereinkommt — das ist die Deckenaussparung, durch
      // die man hochsteigt.
      for(let s=0;s<5;s++){
        const w=2*R[s]+1, x0=PX-R[s], z0=PZ-R[s];
        const holes=s>0?new Set(stairCols[s-1]):null;
        for(let dx=0;dx<w;dx++) for(let dz=0;dz<w;dz++){
          const x=x0+dx, z=z0+dz;
          if(holes&&holes.has(x+','+z)) continue;
          put('plank',x,FY[s],z);
        }
      }
      // Wände und Traufen, Stockwerk für Stockwerk. Die Tür liegt im
      // Erdgeschoss auf der Südseite (Richtung Startpunkt) und zeigt zu Torii
      // und Weg.
      for(let s=0;s<4;s++){
        const w=2*R[s]+1, x0=PX-R[s], z0=PZ-R[s];
        wall(x0,z0,w,w,FY[s],SH,s===0?R[s]:null);
        eave(x0,z0,w,w,FY[s]+SH+1);
      }
      {
        const s=4, w=2*R[s]+1, x0=PX-R[s], z0=PZ-R[s];
        posts(x0,z0,w,w,FY[s],SH);
        eave(x0,z0,w,w,FY[s]+SH+1);
        // Das schließende Walmdach: dieselbe Form wie hip() bei den Dörfern,
        // nur in Ziegeln statt Brettern — und eine schmale Spitze obendrauf,
        // damit die Pagode nicht stumpf endet.
        const hipY=FY[s]+SH+3, lay=Math.ceil((Math.min(w,w)+2)/2);
        hip('tile',x0,z0,hipY,w,w);
        put('redwood',PX,hipY+lay,PZ);
        put('redwood',PX,hipY+lay+1,PZ);
      }
      // Der Schrein, ganz oben im offenen Pavillon — hier endet die Treppe,
      // hier stehen die Rezepte (siehe BLOCKS.shrine).
      put('shrine',PX,FY[4]+1,PZ);

      // Die Wachplätze: zwei bis vier je Stockwerk, mit Abstand zur eigenen
      // Treppe (der von unten UND der nach oben) und, wo die Grundfläche es
      // hergibt, mit zwei Blöcken Luft zur Wand. In den beiden obersten,
      // knappen Stockwerken reicht die Fläche dafür nicht immer; dort rückt
      // die Anforderung auf einen Block zusammen — lieber das als ein
      // Stockwerk ganz ohne Wache.
      for(let s=0;s<5;s++){
        // rgMax reicht bis auf einen Block an die Wand heran (nie auf die
        // Wand selbst) — geprüft wird trotzdem zuerst der geräumigere Kern
        // mit zwei Blöcken Luft (clearance), der Rand ist nur die
        // Rückfallebene für die knappen oberen Stockwerke.
        const rgMax=Math.max(R[s]-1,1);
        const forbid=new Set();
        if(s>0) stairCols[s-1].forEach(c=>forbid.add(c));
        if(s<4) stairCols[s].forEach(c=>forbid.add(c));
        if(s===4){
          for(const [dx,dz] of [[-R[s],-R[s]],[R[s],-R[s]],[-R[s],R[s]],[R[s],R[s]]])
            forbid.add((PX+dx)+','+(PZ+dz));
          forbid.add(PX+','+PZ);                    // der Schrein steht in der Mitte
        }
        const cand=[];
        for(let dx=-rgMax;dx<=rgMax;dx++) for(let dz=-rgMax;dz<=rgMax;dz++){
          const x=PX+dx, z=PZ+dz, k=x+','+z;
          if(forbid.has(k)) continue;
          const clearance=R[s]-Math.max(Math.abs(dx),Math.abs(dz));
          cand.push({x,z,clearance,r:hash2(x,z,331+s)});
        }
        cand.sort((a,b)=>b.clearance-a.clearance||a.r-b.r);
        const want=2+Math.floor(hash2(PX,PZ,401+s)*3);       // 2 bis 4
        const chosen=[];
        for(const c of cand){
          if(chosen.length>=want) break;
          if(chosen.some(g=>Math.max(Math.abs(g.x-c.x),Math.abs(g.z-c.z))<2)) continue;
          chosen.push(c);
        }
        // Reicht der Mindestabstand in den knappen oberen Stockwerken nicht
        // für zwei Plätze, dann lieber enger stehende Wachen als ein
        // Stockwerk ganz ohne — die Grundfläche gibt es sonst nicht her.
        if(chosen.length<2) for(const c of cand){
          if(chosen.length>=Math.max(2,want)) break;
          if(chosen.some(g=>g.x===c.x&&g.z===c.z)) continue;
          chosen.push(c);
        }
        chosen.forEach(c=>guardSpots.push({x:c.x,y:FY[s]+1,z:c.z,floor:s+1}));
      }

      // -------------------------------------------------------- Der Garten
      const WR=15;                          // Halbmesser der Gartenmauer
      const gz=PZ-WR-6;                     // Torii, sechs Blöcke vor der Mauer
      const pondCX=PX+10, pondCZ=PZ+4, pondR=3;

      // Kies statt Gras, mit unregelmäßigem statt kreisrundem Rand — vnoise
      // macht daraus weiche Buchten statt eines Zirkelschlags; am Rand zur
      // Mauer hin bleibt darum echtes Gras stehen, genau die "durchscheinende"
      // Kante, die ein geharkter Garten von einer geschütteten Fläche
      // unterscheidet.
      for(let dx=-WR+1;dx<=WR-1;dx++) for(let dz=-WR+1;dz<=WR-1;dz++){
        const x=PX+dx, z=PZ+dz;
        const d=Math.hypot(dx,dz);
        const edgeR=WR-4+(vnoise(x,z,11,201)-.5)*6;
        if(d>edgeR) continue;
        put('gravel',x,PY-1,z);
      }

      // Kirschbäume: verstreut, nie einander, dem Tempel, dem Weg oder dem
      // Becken zu nah. Deterministisch aus hash2 statt aus einer eigenen
      // mulberry()-Instanz gewürfelt — der Wurf hängt rein am Laufindex,
      // nicht an einem Aufrufzähler, darum kommen Client und Server ohne ein
      // einziges Netzwerkpaket auf dieselbe Handvoll Bäume.
      const cherryAt=new Set();
      const nearCherry=(x,z,min)=>{
        for(const k of cherryAt){
          const [tx,tz]=k.split(',').map(Number);
          if(Math.hypot(tx-x,tz-z)<min) return true;
        }
        return false;
      };
      const inCorridor=(x,z)=>Math.abs(x-PX)<=4&&z<=PZ-R[0]-1&&z>=gz-2;
      const inPond=(x,z)=>Math.hypot(x-pondCX,z-pondCZ)<pondR+3;
      let ncherry=0;
      for(let i=0;i<160&&ncherry<15;i++){
        const a=hash2(i,7,211)*Math.PI*2;
        const rad=8+hash2(i,11,212)*5;
        const x=Math.round(PX+Math.cos(a)*rad), z=Math.round(PZ+Math.sin(a)*rad);
        if(Math.max(Math.abs(x-PX),Math.abs(z-PZ))<=R[0]+3) continue;   // nicht auf den Tempel
        if(inCorridor(x,z)) continue;
        if(inPond(x,z)) continue;
        if(nearCherry(x,z,3.2)) continue;
        const trunk=4+Math.floor(hash2(x,z,213)*3);           // vier bis sechs hoch
        for(let y=0;y<trunk;y++) put('cherry',x,PY+y,z);
        for(const [dx,dy,dz] of BLOSSOM_TOP) put('blossom',x+dx,PY+trunk-2+dy,z+dz);
        cherryAt.add(x+','+z);
        ncherry++;
      }

      // Das Trockenbecken: Randsteine, ein Sandboden einen Block tiefer und
      // ein paar Trittsteine darin. Echtes Wasser ginge hier nicht — das
      // Wassermodell kennt nur den Raum unter dem Meeresspiegel über einem
      // Flussbett (siehe waterAt oben), und das Plateau liegt mit PY=2
      // deutlich darüber. Ein Becken ohne Wasser ist darum kein Kompromiss,
      // sondern die einzig ehrliche Lösung: ein Zen-Garten harkt ohnehin
      // öfter Kies als dass er Wasser führt.
      for(let dx=-pondR-1;dx<=pondR+1;dx++) for(let dz=-pondR-1;dz<=pondR+1;dz++){
        const x=pondCX+dx, z=pondCZ+dz, d=Math.hypot(dx,dz);
        if(d>pondR+1) continue;
        if(d>pondR){ put('rock',x,PY,z); continue; }          // der Rand
        if(hash2(x,z,221)<.22){ put('rock',x,PY-1,z); continue; }  // ein Trittstein
        setBlock(x,PY-1,z,null);
        put('sand',x,PY-2,z);
      }

      // Der Weg: vom Torii durch die Maueröffnung bis zur Tempeltür.
      for(let z=gz;z<=PZ-R[0]-1;z++) put('rock',PX,PY-1,z);

      // Das Torii: zwei Pfosten, ein Kranbalken mit Überstand, darunter ein
      // kürzerer, bündiger Balken — die Silhouette, die den Garten schon von
      // weitem als das zeigt, was er ist.
      for(const ddx of [-3,3]) for(let k=0;k<5;k++) put('redwood',PX+ddx,PY+k,gz);
      for(let dx=-4;dx<=4;dx++) put('redwood',PX+dx,PY+5,gz);
      for(let dx=-3;dx<=3;dx++) put('redwood',PX+dx,PY+3,gz);

      // Steinlaternen am Weg entlang — Sockel aus Stein, Lichtkasten aus
      // Reispapier, Kappe aus Stein. Ihre Position wandert zusätzlich in
      // torches (siehe litAt weiter oben): der Garten soll auch nachts ein
      // sicherer Ort sein, kein Benni spawnt im Licht der Laternen (spawnMob
      // in game.js meidet litAt-Zellen genauso wie die Wachen oben ihn nicht
      // brauchen, weil sie ohnehin schon dort stehen).
      const doorZ=PZ-R[0]-1;                // letzte begehbare Wegzelle vor der Tür
      for(const z of [gz+2,Math.round((gz+doorZ)/2),doorZ]) for(const dx of [-2,2]){
        const x=PX+dx;
        put('rock',x,PY,z); put('paper',x,PY+1,z); put('rock',x,PY+2,z);
        torches.push({x,y:PY+2.5,z});
      }

      // Die Gartenmauer: Stein mit Ziegelabdeckung, ringsum am Rand des
      // Plateaus — mit einer Lücke dort, wo das Torii steht.
      for(let dx=-WR;dx<=WR;dx++) for(let dz=-WR;dz<=WR;dz++){
        if(Math.max(Math.abs(dx),Math.abs(dz))!==WR) continue;
        if(dz===-WR&&Math.abs(dx)<=2) continue;               // die Lücke fürs Tor
        const x=PX+dx, z=PZ+dz;
        put('rock',x,PY,z); put('rock',x,PY+1,z);
        put('tile',x,PY+2,z);
      }
    }
    // --- Wälder: Rauschen gibt die Dichte, Dörfer und Starttal bleiben frei
    const r=mulberry(4711);
    // Die Obergrenze ist nur eine Notbremse, keine Zielzahl — sie muss aber
    // mit der Fläche mitwachsen: die Schleife läuft von West nach Ost und
    // hört auf, sobald sie erreicht ist, ein zu kleiner Deckel ließe also den
    // halben Osten kahl.
    const TREE_CAP=4800;
    let n=0, trees=[];
    // Kein Baum steht mehr an einem anderen — weder über die Kante noch über
    // die Ecke. Zwei Stämme in Nachbarzellen sahen aus wie ein Fehler im
    // Gelände und ließen sich zu zweit auf einmal fällen; jetzt bleibt
    // zwischen zwei Stämmen immer mindestens eine Zelle Platz.
    //
    // Geprüft wird gegen die schon gesetzten Stämme, und die Schleife läuft in
    // fester Reihenfolge (West nach Ost, darin Nord nach Süd) — welcher von
    // zwei Bewerbern um dieselbe Ecke gewinnt, steht damit fest, und Client
    // und Server kommen ohne ein einziges Netzwerkpaket auf denselben Wald.
    const trunks=new Set();
    const roomFor=(x,z)=>{
      for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++)
        if(trunks.has((x+dx)+','+(z+dz))) return false;
      return true;
    };
    // Der Abstandstest wirft Bewerber weg, die es vorher ins Bild geschafft
    // hätten — ohne Gegengewicht wären die Wälder um gut ein Drittel lichter
    // geworden. Die Dichteschwellen sind darum angehoben, sodass am Ende
    // wieder ungefähr gleich viele Bäume stehen, nur eben verteilt.
    for(let x=BOUND.x0+3;x<=BOUND.x1-3&&n<TREE_CAP;x++)
      for(let z=BOUND.z0+3;z<=BOUND.z1-3&&n<TREE_CAP;z++){
        if(Math.hypot(x-HOME.x,z-HOME.z)<HOME.r-6) continue;
        if(VILLAGES.some(v=>Math.abs(x-v.x)<VILL_CLEAR&&Math.abs(z-v.z)<VILL_CLEAR)||inPagoda(x,z)) continue;
        const dens=vnoise(x,z,44,11);
        if(hash2(x,z,55)>(dens>.54?.22:.036)) continue;
        const h=treeSpot(x,z);
        if(h<0) continue;
        if(!roomFor(x,z)) continue;
        // Nadelbäume stehen, wo es höher und karger wird, und dazu in eigenen
        // Beständen aus einer zweiten Rauschformel — ein Fichtenhain mitten im
        // Laubwald ist keine Ausnahme, sondern genau das, was man sucht. Das
        // Starttal und seine Umgebung liegen tief, dort bleibt es laubgrün.
        const fir=h>=7||vnoise(x,z,34,131)>.70;
        const trunk=TRUNK_MIN+Math.floor(hash2(x,z,56)*3);
        for(let y=0;y<trunk;y++) put('log',x,h+y,z);
        // Kronen reichen zwei Zellen weit und damit bis in den Nachbarstamm
        // hinein — ohne diese Wache stanzte ein später gesetzter Baum dem
        // früheren ein Stück Laub mitten in den Stamm, und beim Fällen bliebe
        // dessen Krone in der Luft hängen. Laub über Laub ist dagegen egal.
        const crown=(t,x2,y2,z2)=>{ if(scenery.get(K(x2,y2,z2))!=='log') put(t,x2,y2,z2); };
        if(fir)
          // Ein Stück über den Stamm hinaus, sonst fiele die Spitze (die
          // oberste Lage von CONIFER_TOP sitzt in der Stammachse) unter die
          // Wache oben und der Baum endete in einem kahlen Pfahl. Nach unten
          // reicht die Krone dafür weit den Stamm hinab.
          for(const [dx,dy,dz] of CONIFER_TOP) crown('needle',x+dx,h+trunk+1-CONIFER_H+dy,z+dz);
        else
          for(const [dx,dy,dz] of TREE_TOP) crown('leaf',x+dx,h+trunk-1+dy,z+dz);
        trunks.add(x+','+z);
        trees.push({x,z,h,trunk,fir});
        n++;
      }
    // --- Jeder fünfte Laubbaum trägt Dominiks. Sie hängen eine Lage unter der
    // Krone, jeder direkt unter einem Blatt — und damit ausser Reichweite.
    // Am Nadelbaum wächst kein Dominik; er hat dort auch keinen Platz, seine
    // Krone reicht bis auf diese Höhe herunter. Zusammen mit dem breiteren
    // baumfreien Gürtel um die Dörfer (VILL_CLEAR) kostete das rund ein Siebtel
    // der wilden Ernte — die Rate ist darum von .22 auf .30 angehoben, sodass
    // am Ende wieder ungefähr gleich viele Dominiks in den Kronen hängen.
    for(const t of trees){
      if(t.fir) continue;
      if(hash2(t.x,t.z,77)>.30) continue;
      const y=t.h+t.trunk-2;
      for(const [dx,dz] of FRUIT_OFF){
        if(hash2(t.x+dx,t.z+dz,78)>.5) continue;
        if(scenery.has(K(t.x+dx,y,t.z+dz))) continue;
        put('dominik',t.x+dx,y,t.z+dz);
      }
    }
    // --- Pilze im Schatten der Wälder
    for(const t of trees){
      if(hash2(t.x,t.z,81)>.45) continue;
      const mx=t.x+(hash2(t.x,t.z,82)>.5?3:-3), mz=t.z+(hash2(t.x,t.z,83)>.5?3:-3);
      if(treeSpot(mx,mz)<0) continue;
      if(scenery.has(K(mx,terrainH(mx,mz),mz))) continue;
      put('shroom',mx,terrainH(mx,mz),mz);
    }
    // --- Umgestürzte Bäume: selten liegt einer quer im Gras. Ein Stumpf am
    // Fuß, daneben der ausgestreckte Stamm, am Kopfende das heruntergekommene
    // Laub — und mit etwas Glück wächst schon ein Pilz darauf. Für den
    // Spieler ist es Holz ohne Klettern, für die Landschaft eine Stelle, an
    // der einmal etwas passiert ist.
    //
    // Auf einer Linie gleicher Höhe, sonst schwebte das hintere Ende oder
    // steckte im Hang; treeSpot() prüft Ebenheit und Gras schon mit.
    for(let x=BOUND.x0+6;x<=BOUND.x1-6;x++)
      for(let z=BOUND.z0+6;z<=BOUND.z1-6;z++){
        if(hash2(x,z,111)>.005) continue;
        if(Math.hypot(x-HOME.x,z-HOME.z)<HOME.r-6) continue;
        if(VILLAGES.some(v=>Math.abs(x-v.x)<VILL_CLEAR&&Math.abs(z-v.z)<VILL_CLEAR)||inPagoda(x,z)) continue;
        const h=treeSpot(x,z);
        if(h<0) continue;
        const [dx,dz]=NB4[Math.floor(hash2(x,z,112)*4)];
        const len=4+Math.floor(hash2(x,z,113)*3);          // 4 bis 6 Blöcke Stamm
        let free=true;
        for(let i=0;i<=len+1&&free;i++){
          const cx=x+dx*i, cz=z+dz*i;
          if(treeSpot(cx,cz)!==h||scenery.has(K(cx,h,cz))) free=false;
        }
        if(!free) continue;
        put('log',x,h,z);                                  // der Stumpf
        for(let i=2;i<=len;i++) put('log',x+dx*i,h,z+dz*i);
        // Das Kopfende: was von der Krone übrig ist, liegt um die Spitze
        // herum ausgebreitet.
        const tx=x+dx*len, tz=z+dz*len;
        for(const [lx,lz] of NB4){
          if(lx===-dx&&lz===-dz) continue;                 // nicht zurück auf den Stamm
          if(scenery.has(K(tx+lx,h,tz+lz))||treeSpot(tx+lx,tz+lz)<0) continue;
          if(hash2(tx+lx,tz+lz,114)>.6) continue;
          put('leaf',tx+lx,h,tz+lz);
        }
        // Ein Pilz auf dem morschen Stamm — sit:true setzt ihn oben auf.
        const my=hash2(x,z,115);
        if(my<.5) put('shroom',x+dx*(2+Math.floor(my*6)),h+1,z+dz*(2+Math.floor(my*6)));
      }
    // --- Büsche: kniehohes Gestrüpp in Gruppen über dem Grasland, dichter am
    // Waldrand als auf der freien Fläche (dieselbe Dichteformel wie die
    // Bäume). Sie halten niemanden auf und geben nichts her — sie füllen nur
    // den leeren Boden zwischen den Stämmen.
    for(let x=BOUND.x0+3;x<=BOUND.x1-3;x++)
      for(let z=BOUND.z0+3;z<=BOUND.z1-3;z++){
        // Der Würfel zuerst, das Rauschen danach: er wirft neun von zehn
        // Zellen weg und kostet einen Bruchteil davon. Über die ganze Karte
        // gerechnet ist das der Unterschied zwischen spürbar und unmerklich.
        if(hash2(x,z,152)>.09) continue;
        if(VILLAGES.some(v=>Math.abs(x-v.x)<VILL_CLEAR&&Math.abs(z-v.z)<VILL_CLEAR)||inPagoda(x,z)) continue;
        if(vnoise(x,z,19,151)<.44) continue;               // Gruppen statt Teppich
        if(vnoise(x,z,44,11)<=.54&&hash2(x,z,152)>.03) continue;   // außerhalb der Wälder lichter
        const h=treeSpot(x,z);
        if(h<0||scenery.has(K(x,h,z))) continue;
        put('shrub',x,h,z);
      }
    // --- Pfeffer: nur jenseits der Flüsse, in lockeren Feldern auf dem Grasland.
    for(let x=BOUND.x0+3;x<=BOUND.x1-3;x++)
      for(let z=BOUND.z0+3;z<=BOUND.z1-3;z++){
        if(!beyondRiver(x,z)) continue;
        if(vnoise(x,z,20,91)<.48) continue;             // Felder statt Teppich
        if(hash2(x,z,92)>.22) continue;
        const h=treeSpot(x,z);
        if(h<0||scenery.has(K(x,h,z))) continue;
        put('pepper',x,h,z);
      }
    // --- Truhen: eine je Dorf, dazu ein paar verstreute. Sie sind selten und
    // halten nur Vorräte bereit — Zutaten holt man sich draußen selbst.
    const rr=(a,b)=>a+r()*(b-a);
    // Sechs davon stehen schon in den Dörfern (oben), der Rest verstreut sich.
    // Mit der Fläche gewachsen: acht Truhen auf der vierfachen Welt wären
    // seltener als je eine pro Tagesmarsch.
    //
    // In ZWEI Durchgängen, und das ist Absicht: der erste würfelt mit
    // derselben Formel aus demselben Samen wie vor der Vergrößerung und
    // innerhalb der alten Weltgrenzen — die verstreuten Truhen der alten Welt
    // bleiben damit an Ort und Stelle, samt allem, was Mitspieler schon
    // hineingelegt haben (der Inhalt hängt am Fundort, siehe chests). Erst
    // der zweite Durchgang verteilt die neuen über das gewachsene Land.
    const OLD_BOUND={x0:-72,x1:72,z0:-72,z1:72};
    const place=(b,upto,tries)=>{
      for(let k=0;k<tries&&chestSpots.length<upto;k++){
        const x=Math.round(rr(b.x0+6,b.x1-6));
        const z=Math.round(rr(b.z0+6,b.z1-6));
        if(Math.hypot(x-HOME.x,z-HOME.z)<12) continue;
        const h=treeSpot(x,z);
        if(h<0) continue;
        if(scenery.has(K(x,h,z))) continue;
        if(chestSpots.some(c=>Math.hypot(c.x-x,c.z-z)<30)) continue;
        chestSpots.push({x,y:h,z});
      }
    };
    place(OLD_BOUND,VILLAGES.length+5,6000);
    place(BOUND,18,12000);
    // --- Truhen füllen: Werkzeug und Baustoff, keine Zutaten.
    // Die 🥣 Schale stand hier früher mit drin. Sie gibt es nicht mehr (ein
    // Gericht besteht jetzt nur noch aus Zutaten, siehe RECIPES in
    // shared/economy.js) — und ein Truhenfach mit einem Gegenstand, den ITEMS
    // gar nicht kennt, wäre kein leeres Fach, sondern ein Fehler beim
    // Zeichnen. An ihrer Stelle steht Schnur: auch Baustoff, auch nicht
    // anbaubar, und man braucht sie für die Schleuder.
    const LOOT=[['plank',3,8],['stick',2,6],['torch',2,5],['string',1,2],
                ['stone',3,8],['dirt',2,6],['brick',2,6],['sword',1,1]];
    chestSpots.forEach(c=>{
      put('chest',c.x,c.y,c.z);
      // Fixed 24-slot array (see the `chests` doc comment above) — same
      // loot-selection probability/logic as before, just written into
      // indexed slots instead of pushed onto a variable-length list.
      const items=Array(24).fill(null);
      const cnt=2+Math.floor(r()*3);
      let idx=0;
      for(let k=0;k<cnt;k++){
        const [id,lo,hi]=LOOT[Math.floor(r()*LOOT.length)];
        if(items.some(it=>it&&it.id===id)) continue;
        items[idx++]={id,n:lo+Math.floor(r()*(hi-lo+1))};
      }
      chests.set(K(c.x,c.y,c.z),{items,opened:false});
    });

    // --- Plätze für die Jannessen. Der erste steht im Starttal, drei wohnen in
    // den Dorfhäusern, der Rest verteilt sich über die Welt: einer weit
    // draußen, einer an einer Furt, einer auf einem Berg und der letzte hinter
    // dem Fluss beim Pfeffer. Reihenfolge und Inhalt hängen zusammen — der
    // k-te Platz gehört zum k-ten Jannes.
    const freeSpot=(x,z)=>{
      const h=terrainH(x,z);
      return h>SEA&&!scenery.has(K(x,h,z))&&!scenery.has(K(x,h+1,z));
    };
    const findSpot=(...preds)=>{
      for(const p of preds)
        for(let k=0;k<8000;k++){
          const x=Math.round(rr(BOUND.x0+6,BOUND.x1-6)), z=Math.round(rr(BOUND.z0+6,BOUND.z1-6));
          if(!p(x,z)||!freeSpot(x,z)) continue;
          if(traderSpots.some(s=>Math.hypot(s.x-x,s.z-z)<22)) continue;
          if(chestSpots.some(s=>Math.abs(s.x-x)<2&&Math.abs(s.z-z)<2)) continue;
          return {x,z};
        }
      return null;
    };
    // Vorne die festen Plätze, dann die gesuchten. Ein nicht gefundener Platz
    // wäre ein verlorenes Rezept, darum hat jede Suche eine Rückfallebene.
    const grass=(x,z)=>treeSpot(x,z)>=0;
    const far  =(x,z)=>Math.hypot(x-SPAWN.x,z-SPAWN.z)>44;
    traderSpots.push({x:SPAWN.x+7,z:SPAWN.z-1}, ...houseSpots);
    for(const q of [
      [(x,z)=>far(x,z)&&grass(x,z), far, ()=>true],
      [(x,z)=>riverAt(x,z).d<RIVER_W+4&&grass(x,z), (x,z)=>riverAt(x,z).d<RIVER_W+7, ()=>true],
      [(x,z)=>terrainH(x,z)>=13, (x,z)=>terrainH(x,z)>=9, far, ()=>true],
      [(x,z)=>beyondRiver(x,z)&&grass(x,z), beyondRiver, far, ()=>true],
    ]) traderSpots.push(findSpot(...q)||{x:SPAWN.x,z:SPAWN.z-8});
  })();

  return {
    scenery, edits, colRange, chests, torches, chestSpots, houseSpots, traderSpots, guardSpots,
    K, terrainType, saltVein, coalVein,
    blockAt, solidAt, fills, fillsAt, waterAt, surfaceAt, safeSpot, mobBlocked, losClear, litAt, setBlock,
  };
}
