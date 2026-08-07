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
export const MOBS={
  benni :{hp:10,speed:2.35,dmg:3,atkCd:1.4,h:1.95,kbTake:1,  fly:false,w:1,   loot:['ball',1,2]},
  spider:{hp:14,speed:1.9, dmg:4,atkCd:1.6,h:1.5, kbTake:.7, fly:false,w:.28, loot:['string',1,2]},
  cursed:{hp:7, speed:3.1, dmg:2,atkCd:1.0,h:1.5, kbTake:1.4,fly:true, w:0,   loot:['string',1,1]},
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
    let near=null, nd=Infinity;
    for(const g of VILLAGES){
      const d=Math.hypot(x-g.x,z-g.z);
      if(d<nd){ nd=d; near=g; }
    }
    if(nd<VILL_R) h=near.y;
    else if(nd<VILL_R+VILL_FADE){
      const t=(nd-VILL_R)/VILL_FADE; h=lerp(near.y,h,t*t*(3-2*t));
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
  leaf   :{tex:'leaf',  hard:.3,  drop:null,     nm:'Laub'},
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
    // --- Dörfer: je vier Häuschen um einen gepflasterten Platz. Ins erste
    // kommt die Truhe, im zweiten wartet ein Jannes.
    for(const v of VILLAGES){
      const {x:vx,z:vz,y:vy}=v;
      for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) put('rock',vx+dx,vy,vz+dz);
      [[-8,-7],[5,-7],[-8,5],[5,5]].forEach(([hx,hz],hi)=>{
        for(let dx=0;dx<5;dx++) for(let dz=0;dz<5;dz++){
          const edge=dx===0||dx===4||dz===0||dz===4;
          const x=vx+hx+dx, z=vz+hz+dz;
          if(edge&&!(dx===2&&dz===4)) for(let y=0;y<3;y++) put('plank',x,vy+y,z);
          else if(!edge) put('rock',x,vy,z);
          put('brick',x,vy+3,z);
        }
        if(hi===0) chestSpots.push({x:vx+hx+1,y:vy+1,z:vz+hz+2});
        if(hi===1) houseSpots.push({x:vx+hx+2,z:vz+hz+2});
      });
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
    // --- Wälder: Rauschen gibt die Dichte, Dörfer und Starttal bleiben frei
    const r=mulberry(4711);
    // Die Obergrenze ist nur eine Notbremse, keine Zielzahl — sie muss aber
    // mit der Fläche mitwachsen: die Schleife läuft von West nach Ost und
    // hört auf, sobald sie erreicht ist, ein zu kleiner Deckel ließe also den
    // halben Osten kahl.
    const TREE_CAP=4800;
    let n=0, trees=[];
    for(let x=BOUND.x0+3;x<=BOUND.x1-3&&n<TREE_CAP;x++)
      for(let z=BOUND.z0+3;z<=BOUND.z1-3&&n<TREE_CAP;z++){
        if(Math.hypot(x-HOME.x,z-HOME.z)<HOME.r-6) continue;
        if(VILLAGES.some(v=>Math.abs(x-v.x)<15&&Math.abs(z-v.z)<15)) continue;
        const dens=vnoise(x,z,44,11);
        if(hash2(x,z,55)>(dens>.54?.13:.022)) continue;
        const h=treeSpot(x,z);
        if(h<0) continue;
        const trunk=TRUNK_MIN+Math.floor(hash2(x,z,56)*3);
        for(let y=0;y<trunk;y++) put('log',x,h+y,z);
        for(const [dx,dy,dz] of TREE_TOP) put('leaf',x+dx,h+trunk-1+dy,z+dz);
        trees.push({x,z,h,trunk});
        n++;
      }
    // --- Jeder fünfte Baum trägt Dominiks. Sie hängen eine Lage unter der
    // Krone, jeder direkt unter einem Blatt — und damit ausser Reichweite.
    for(const t of trees){
      if(hash2(t.x,t.z,77)>.22) continue;
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
    const LOOT=[['plank',3,8],['stick',2,6],['torch',2,5],['bowl',1,1],
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
    scenery, edits, colRange, chests, torches, chestSpots, houseSpots, traderSpots,
    K, terrainType, saltVein, coalVein,
    blockAt, solidAt, fills, fillsAt, waterAt, surfaceAt, safeSpot, mobBlocked, litAt, setBlock,
  };
}
