/* =====================================================================
   ErnteDominiksFest — Klötzchen-Survival
   Abbauen, bauen, überleben. Ziel: die Dominik-Suppe kochen.
   Rezepte gibt es bei den Jannessen: sie wollen Dominiks, Pilze oder
   fertige Gerichte und zeigen dafür ein Rezept — als Bild, nicht als Text.
   ===================================================================== */
import * as THREE from './vendor/three.module.min.js';
import {
  createWorld, DAYLEN, NIGHT_START, NIGHT_END, REACH, BOUND, HOME, SEA, RIVER_BED, RIVER_W,
  WATER_Y, BEDROCK, SPAWN, MARKET, hash2, vnoise, riverAt, beyondRiver, rawHeight,
  VILLAGES, VILL_R, VILL_FADE, terrainH, surfaceTex, BLOCKS, TREE_TOP, TRUNK_MIN, FRUIT_OFF, treeSpot,
  MOB_HP, MOB_SPEED, MOB_DMG, MOB_ATK_CD,
} from './shared/world.js';
import {GOAL, SEED_OF, PRICES, SHOP, RECIPES, REFRESH, RAW, offerWant} from './shared/economy.js';
import {PARTY_URL, connect, on, send, isConnected, getPid} from './net.js';

// ------------------------------------------------------------------ Helfer
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rnd=(a,b)=>a+Math.random()*(b-a);
const rndi=(a,b)=>Math.floor(rnd(a,b+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const el=id=>document.getElementById(id);
function mulberry(s){return function(){s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// ------------------------------------------------------------------ Ton
let AC=null;
const SAMPLES={};
const _pd=[];   // pending decode: [name, ArrayBuffer] before AudioContext exists
const ac=()=>{
  if(!AC){ try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}
    if(AC){_pd.forEach(([n,b])=>AC.decodeAudioData(b).then(d=>{SAMPLES[n]=d;}).catch(()=>{}));_pd.length=0;}
  } return AC;
};
function tone(f,d,type='sine',v=.1,w=0){
  const c=ac(); if(!c) return;
  if(c.state==='suspended') c.resume();
  const o=c.createOscillator(), g=c.createGain();
  o.type=type; o.frequency.value=f;
  g.gain.setValueAtTime(v,c.currentTime+w);
  g.gain.exponentialRampToValueAtTime(.001,c.currentTime+w+d);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime+w); o.stop(c.currentTime+w+d+.02);
}
function playSample(name,vol=1){
  const c=ac(); if(!c||!SAMPLES[name]) return false;
  if(c.state==='suspended') c.resume();
  const src=c.createBufferSource(),g=c.createGain();
  src.buffer=SAMPLES[name]; g.gain.value=vol;
  src.connect(g).connect(c.destination); src.start(); return true;
}
async function loadSample(name,url){
  try{ const buf=await fetch(url).then(r=>r.arrayBuffer());
    if(AC) SAMPLES[name]=await AC.decodeAudioData(buf); else _pd.push([name,buf]);
  }catch(e){}
}
const SND={
  tap:()=>tone(620,.05,'square',.05),
  dig:()=>playSample('dig',.7)||tone(150+Math.random()*70,.05,'square',.045),
  pop:()=>{tone(523,.07,'triangle',.08);tone(784,.09,'triangle',.08,.06);},
  place:()=>tone(240,.07,'square',.06),
  craft:()=>{tone(392,.09,'square',.08);tone(587,.09,'square',.08,.08);tone(784,.14,'square',.08,.16);},
  eat:()=>playSample('eat',.7)||(tone(300,.08,'triangle',.07),tone(240,.1,'triangle',.06,.09)),
  swing:()=>tone(300,.07,'sawtooth',.05),
  hit:()=>{tone(140,.09,'square',.1);tone(90,.12,'square',.08,.05);},
  hurt:()=>{tone(180,.2,'sawtooth',.13);tone(120,.25,'sawtooth',.1,.1);},
  mobDie:()=>{tone(400,.1,'square',.08);tone(200,.18,'square',.07,.09);},
  night:()=>{tone(160,.5,'sine',.09);tone(120,.6,'sine',.08,.2);},
  dawn:()=>{tone(523,.14,'triangle',.08);tone(659,.14,'triangle',.08,.12);tone(784,.2,'triangle',.08,.24);},
  chest:()=>{tone(440,.09,'triangle',.08);tone(660,.12,'triangle',.08,.08);},
  book:()=>{tone(659,.12,'triangle',.09);tone(988,.18,'triangle',.09,.11);},
  win:()=>{tone(523,.14,'triangle',.1);tone(659,.14,'triangle',.1,.14);
           tone(784,.14,'triangle',.1,.28);tone(1046,.3,'triangle',.1,.42);},
  step:()=>tone(90+Math.random()*30,.05,'triangle',.03),
  land:()=>tone(110,.07,'triangle',.05),
  fail:()=>tone(160,.15,'square',.06),
};
loadSample('dig','./block_break.wav');
loadSample('pop','./item_pickupp.ogg');
loadSample('punch','./punch.wav');
loadSample('eat','./eating.wav');
loadSample('dominik_break','./dominik_break.wav');
loadSample('benni1','./benni_scream1.wav');
loadSample('benni2','./benni_scream2.wav');
loadSample('benni3','./benni_scream3.wav');
for(let i=1;i<=11;i++) loadSample('bird'+i,'./bird'+i+'.ogg');

// ------------------------------------------------------------------ Welt-Eckdaten
// ------------------------------------------------------------------ Welt
// Terrain, Landschaft und alles, was sich darin ändern kann, kommt aus
// shared/world.js — dieselbe Instanz-Erzeugung läuft identisch im
// PartyKit-Server, damit beide Seiten ohne Netzwerkverkehr dieselbe
// Landschaft, Truhenplätze und Höhenlogik haben.
const world=createWorld();
const {
  scenery, edits, colRange, chests, torches, chestSpots, houseSpots, traderSpots,
  K, terrainType, saltVein,
  blockAt, solidAt, fills, fillsAt, waterAt, surfaceAt, safeSpot, mobBlocked, litAt,
  setBlock: setBlockData,
}=world;

// ------------------------------------------------------------------ Zustand
const state={t:0,day:1,dayT:.06,night:false,paused:true,started:false,
  mined:0,placed:0,killed:0,deaths:0,crafted:0,chests:0,trades:0,won:false,checkT:0,saveTick:0,
  underwater:false,money:0,earned:0,sold:0,bought:0,planted:0,
  spikes:0};                            // verworfene Maus-Ausreisser, siehe unten

const player={x:0,z:18,y:0,viewY:0,vy:0,onGround:true,wet:false,yaw:0,pitch:-.05,
  hp:20,maxhp:20,food:20,maxfood:20,regenT:0,starveT:0,
  bob:0,stepT:0,atkCd:0,hurtT:0,invT:0,fallFrom:0,sel:0};

// ------------------------------------------------------------------ Speichern
// Nur die sinnvollen Felder sichern; transiente Pro-Frame-Physik (vy,
// onGround,wet,bob,stepT,atkCd,hurtT,invT,fallFrom) soll beim Laden neu
// starten statt in einem seltsamen Zwischenzustand aufzutauchen.
function savePersist(){
  try{
    const{x,y,z,yaw,pitch,hp,food}=player;
    localStorage.setItem('edf_player',JSON.stringify({x,y,z,yaw,pitch,hp,food}));
    localStorage.setItem('edf_slots',JSON.stringify(slots));
  }catch(e){}
}
function loadPersist(){
  try{
    const p=JSON.parse(localStorage.getItem('edf_player'));
    if(p) Object.assign(player,p);
  }catch(e){}
  try{
    const s=JSON.parse(localStorage.getItem('edf_slots'));
    if(Array.isArray(s)) for(let i=0;i<NSLOT;i++) slots[i]=s[i]||null;
  }catch(e){}
}

// ------------------------------------------------------------------ Toasts
function toast(msg,type='',ms=3000){
  const box=el('toasts');
  while(box.children.length>=3) box.firstChild.remove();
  const d=document.createElement('div');
  d.className='toast '+type; d.textContent=msg;
  box.appendChild(d);
  setTimeout(()=>{d.classList.add('out');setTimeout(()=>d.remove(),400);},ms);
}

// ------------------------------------------------------------------ Renderer
let renderer,scene,camera;
try{
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
}catch(e){
  el('boot').innerHTML='😢 Dein Browser kann kein WebGL.';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFShadowMap;
document.body.insertBefore(renderer.domElement,document.body.firstChild);

scene=new THREE.Scene();
scene.fog=new THREE.Fog(0x9fd0e8,46,140);
camera=new THREE.PerspectiveCamera(74,1,.1,400);

const hemi=new THREE.HemisphereLight(0xcfe8ff,0x5a8a45,1.25); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff3d6,2.0);
sun.position.set(26,44,16); sun.castShadow=true;
sun.shadow.mapSize.set(512,512);
const sc=sun.shadow.camera;
sc.left=-24;sc.right=24;sc.top=24;sc.bottom=-24;sc.near=1;sc.far=120;
scene.add(sun.target);
sun.shadow.bias=-0.0018; sun.shadow.normalBias=0.05;
scene.add(sun);

const skyMat=new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{top:{value:new THREE.Color(0x3f86c8)},bot:{value:new THREE.Color(0xbfe0ef)}},
  vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform vec3 top;uniform vec3 bot;varying vec3 vP;'+
    'void main(){float h=normalize(vP).y*.5+.5;gl_FragColor=vec4(mix(bot,top,smoothstep(.42,.95,h)),1.);}'
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(320,20,12),skyMat));

// ------------------------------------------------------------------ Pixel-Texturen
function pixTex(draw,size=16,repeat){
  const c=document.createElement('canvas'); c.width=c.height=size;
  draw(c.getContext('2d'),size);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  t.magFilter=THREE.NearestFilter;
  t.minFilter=THREE.NearestMipmapLinearFilter;
  if(repeat){ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(repeat,repeat); }
  return t;
}
const noiseTex=(cols,seed,extra)=>pixTex((g,s)=>{
  const r=mulberry(seed);
  for(let y=0;y<s;y++) for(let x=0;x<s;x++){
    g.fillStyle=cols[Math.floor(r()*cols.length)];
    g.fillRect(x,y,1,1);
  }
  if(extra) extra(g,s,r);
});
// Ein junger Trieb: Stängel, zwei Blätter, oben eine Knospe in der Farbe
// dessen, was daraus wird. Steht unten in seiner Zelle, darum wächst er von
// der Unterkante des Bildes nach oben.
const sproutTex=(leaf,bud)=>pixTex(g=>{
  g.fillStyle='#4a7a2c'; g.fillRect(7,8,2,8);
  g.fillStyle=leaf;
  g.fillRect(4,10,3,2); g.fillRect(9,12,3,2);
  g.fillRect(3,9,2,1);  g.fillRect(11,11,2,1);
  g.fillStyle=bud; g.fillRect(6,6,4,3);
  g.fillStyle='#2e6b2b'; g.fillRect(7,15,2,1);
});
const TEX={
  dirt   :noiseTex(['#8a6440','#7d5937','#946d48','#6f4e30'],22),
  stone  :noiseTex(['#8e8e8e','#828282','#9a9a9a','#787878'],24),
  log    :noiseTex(['#6b4c2b','#7a5734','#5e4325'],25,(g,s)=>{
    g.fillStyle='#4e3720'; g.fillRect(0,0,1,s); g.fillRect(s-1,0,1,s);
    g.fillStyle='#84603c'; g.fillRect(5,0,1,s); g.fillRect(10,0,1,s);
  }),
  leaf   :noiseTex(['#3f8c39','#357a31','#489a41','#2e6b2b','#54a84a'],26),
  plank  :noiseTex(['#b08247','#a5783f','#bb8d51'],28,(g,s)=>{
    g.fillStyle='#8a6535'; for(let y=3;y<s;y+=4) g.fillRect(0,y,s,1);
  }),
  brick  :noiseTex(['#9a9a95','#8c8c88','#a6a6a1'],29,(g,s)=>{
    g.fillStyle='#6f6f6b';
    g.fillRect(0,7,s,1); g.fillRect(0,15,s,1);
    g.fillRect(7,0,1,8); g.fillRect(3,8,1,8);
  }),
  water  :noiseTex(['#2f7fc4','#2a72b2','#3a8ad0'],30),
  grass  :noiseTex(['#6aab3f','#5f9e38','#74b649','#589434','#7cbd4f'],36,(g,s)=>{
    g.fillStyle='rgba(0,0,0,.10)'; g.fillRect(0,0,s,1); g.fillRect(0,0,1,s);
  }),
  sand   :noiseTex(['#d9c68a','#cdb87b','#e3d29a','#c2ad72'],37),
  snow   :noiseTex(['#f2f6fa','#e7edf4','#ffffff','#dde6ef'],38),
  bench  :noiseTex(['#a5783f','#966c38'],32,(g,s)=>{
    g.fillStyle='#5e4325'; g.fillRect(0,0,s,3);
    g.fillStyle='#6f512f'; g.fillRect(2,5,4,4); g.fillRect(9,5,4,4); g.fillRect(2,11,4,3); g.fillRect(9,11,4,3);
  }),
  flame  :noiseTex(['#ffb03a','#ff8c1a','#ffd76a','#ff6a1a'],33),
  chest  :noiseTex(['#a2762f','#946b2a','#b08237'],41,(g,s)=>{
    g.fillStyle='#5d431a'; g.fillRect(0,4,s,2); g.fillRect(0,0,s,1); g.fillRect(0,s-1,s,1);
    g.fillStyle='#3c2c11'; g.fillRect(0,0,1,s); g.fillRect(s-1,0,1,s);
    g.fillStyle='#ffd76a'; g.fillRect(7,6,2,4);
  }),
  pot    :noiseTex(['#4a4f55','#3f444a','#565c63'],42,(g,s)=>{
    g.fillStyle='#2c3035'; g.fillRect(0,0,s,3); g.fillRect(0,s-2,s,2);
    g.fillStyle='#6b7279'; g.fillRect(2,5,12,1);
  }),
  bedrock:noiseTex(['#3a3a3e','#2c2c30','#4a4a4f','#232326'],44),
  // Ackerboden: dunkle, umgegrabene Erde mit Furchen quer darüber.
  till   :noiseTex(['#5c3f26','#523821','#67472c','#48311d'],46,(g,s)=>{
    g.fillStyle='#3d2917'; for(let y=2;y<s;y+=4) g.fillRect(0,y,s,1);
    g.fillStyle='#74522f'; for(let y=3;y<s;y+=4) g.fillRect(0,y,s,1);
  }),
  // Salzader: Fels mit hellen Kristallnestern — im Dunkeln gut zu erkennen.
  saltore:noiseTex(['#8e8e8e','#828282','#9a9a9a','#787878'],24,g=>{
    for(const [x,y] of [[2,3],[9,2],[11,7],[4,9],[6,12],[13,11]]){
      g.fillStyle='#f4f6ff'; g.fillRect(x,y,2,2);
      g.fillStyle='#c9d2ea'; g.fillRect(x,y+1,1,1); g.fillRect(x+1,y,1,1);
    }
  }),
  // Setzlinge: ein Halm mit zwei Blättchen, freigestellt. Die Tönung sagt,
  // was daraus wird — sonst weiß man im Beet nicht mehr, was wo steckt.
  sprout_d:sproutTex('#7fbf4a','#e2a24c'),
  sprout_m:sproutTex('#9fae86','#c3352e'),
  sprout_p:sproutTex('#5fa83c','#c9302a'),
  // Pfefferstrauch: gezeichnet auf durchsichtigem Grund, weil er als
  // gekreuzte Fläche steht und nicht als Klotz.
  pepper :pixTex((g,s)=>{
    const leaf=['#3f8c39','#357a31','#489a41','#2e6b2b'], r=mulberry(93);
    g.fillStyle='#4a7a2c'; g.fillRect(7,8,2,8);
    for(let y=2;y<12;y++) for(let x=2;x<14;x++){
      if(Math.hypot(x-7.5,y-6.5)>4.4-r()*1.4) continue;
      g.fillStyle=leaf[Math.floor(r()*leaf.length)]; g.fillRect(x,y,1,1);
    }
    for(const [x,y] of [[4,7],[10,5],[7,3],[11,9]]){       // die Schoten
      g.fillStyle='#c9302a'; g.fillRect(x,y,1,3);
      g.fillStyle='#e8604c'; g.fillRect(x,y,1,1);
    }
  }),
  // Pilz: roter Hut mit weißen Tupfen auf hellem Stiel, freigestellt — er
  // steht als gekreuzte Fläche im Gras und nicht mehr als Klotz.
  shroom :pixTex(g=>{
    g.fillStyle='#e8dcc0'; g.fillRect(6,8,4,8);            // Stiel
    g.fillStyle='#d6cbb0'; g.fillRect(6,8,1,8);
    const cap=['#c3352e','#b02c26','#d43e36'], r=mulberry(43);
    for(let y=2;y<9;y++){
      const w=y<3?4:y<4?6:y<6?7:8;                          // Hut, unten breiter
      for(let x=8-w;x<8+w;x++){
        if(x<1||x>14) continue;
        g.fillStyle=cap[Math.floor(r()*cap.length)];
        g.fillRect(x,y,1,1);
      }
    }
    g.fillStyle='#f2ece0';                                  // Tupfen
    g.fillRect(4,5,2,2); g.fillRect(10,4,2,2); g.fillRect(7,3,2,2); g.fillRect(12,7,2,1);
    g.fillStyle='#8e2620'; g.fillRect(1,8,14,1);            // Hutrand als Schatten
  }),
};

// ------------------------------------------------------------------ Bruchbilder
// Zehn Stufen wie im Vorbild. Jede erbt die Risse der vorigen und setzt neue
// dazu — der Block zerspringt also sichtbar, statt bloß dunkler zu werden.
// Gezeichnet wird auf durchsichtigem Grund, das Bild liegt später über der
// echten Textur.
const CRACKS=(()=>{
  const S=16, N=10, C=7.5, rr=mulberry(90210);
  // Ein Riss ist eine Linie, kein Fleck: von der Mitte nach außen, leicht
  // mäandernd. Später kommen Abzweige dazu. Jede Stufe zeigt mehr Linien und
  // zieht die vorhandenen weiter Richtung Rand.
  function ray(x,y,ang,steps){
    const path=[];
    for(let k=0;k<steps;k++){
      ang+=(rr()-.5)*.55;
      x+=Math.cos(ang)*.72; y+=Math.sin(ang)*.72;
      if(x<-.4||y<-.4||x>S-.6||y>S-.6) break;
      const key=Math.round(y)*S+Math.round(x);
      if(path[path.length-1]!==key) path.push(key);
    }
    return {path,x,y,ang};
  }
  const lines=[], LN=9;
  for(let i=0;i<LN;i++){
    const a=(i/LN)*Math.PI*2+(rr()-.5)*.5;
    const r=ray(C,C,a,26);
    lines.push(r.path);
    if(r.path.length>4){                       // ein Abzweig auf halber Strecke
      const at=r.path[Math.floor(r.path.length*.55)];
      lines.push(ray(at%S,(at/S)|0,a+(rr()>.5?1:-1)*.9,9).path);
    }
  }
  const out=[];
  for(let s=0;s<N;s++){
    const t=(s+1)/N;
    const set=new Set();
    const shown=Math.min(lines.length,Math.ceil(lines.length*(s+1.2)/N));
    for(let i=0;i<shown;i++){
      const p=lines[i], len=Math.ceil(p.length*Math.min(1,t*1.25));
      for(let k=0;k<len;k++) set.add(p[k]);
    }
    out.push(pixTex(g=>{
      for(const k of set){
        const x=k%S, y=(k/S)|0;
        // Erst die Aufhellung darunter, dann der dunkle Riss darüber —
        // sonst überschreibt die Kante den Riss selbst.
        g.fillStyle='rgba(255,255,255,.16)'; g.fillRect(x,Math.max(0,y-1),1,1);
      }
      for(const k of set){
        g.fillStyle='rgba(0,0,0,.7)'; g.fillRect(k%S,(k/S)|0,1,1);
      }
    },S));
  }
  return out;
})();

// ------------------------------------------------------------------ Blöcke
// BLOCKS (Härte, Drop, Name, Cross-Flags) kommt aus shared/world.js.
// Fällt auf einen unbekannten Typ zurück, statt die Vernetzung zu sprengen:
// eine kaputte Textur ist ein Schönheitsfehler, eine Ausnahme killt die Schleife.
const blockTex=t=>TEX[BLOCKS[t]?.tex]||TEX.stone;

// ------------------------------------------------------------------ Gegenstände
const ITEMS={
  dirt    :{ic:'🟫',nm:'Erde',        block:'dirt'},
  stone   :{ic:'🪨',nm:'Stein',       block:'rock'},
  sand    :{ic:'🟨',nm:'Sand',        block:'sand'},
  snow    :{ic:'❄️',nm:'Schnee',      block:'snow'},
  log     :{ic:'🪵',nm:'Holzstamm',   block:'log'},
  plank   :{ic:'🟧',nm:'Bretter',     block:'plank'},
  brick   :{ic:'🧱',nm:'Ziegel',      block:'brick'},
  bench   :{ic:'🛠️',nm:'Werkbank',    block:'bench'},
  pot     :{ic:'🍲',nm:'Kochtopf',    block:'pot'},
  torch   :{ic:'🔥',nm:'Fackel',      torch:true},
  stick   :{ic:'🥢',nm:'Stock'},
  bowl    :{ic:'🥣',nm:'Schale'},
  dominik :{ic:'🍑',nm:'Dominik',     food:4},
  mushroom:{ic:'🍄',nm:'Pilz',        food:2},
  salt    :{ic:'🧂',nm:'Salz'},
  pepper  :{ic:'🌶️',nm:'Pfeffer'},
  // Saatgut. seed sagt, was daraus wird: erst der Setzling, dann die Ernte.
  kern    :{ic:'🌰',nm:'Dominikkern', seed:{sprout:'sprout_d',ripe:'bush'}},
  mycel   :{ic:'🧫',nm:'Myzel',       seed:{sprout:'sprout_m',ripe:'shroom'}},
  korn    :{ic:'🌾',nm:'Pfefferkorn', seed:{sprout:'sprout_p',ripe:'pepper'}},
  hoe     :{ic:'🧑‍🌾',nm:'Hacke',       hoe:true},
  sword   :{ic:'⚔️',nm:'Steinschwert',dmg:6},
  axe     :{ic:'🪓',nm:'Steinaxt',    dmg:4, axe:true},
  pick    :{ic:'⛏️',nm:'Spitzhacke',  dmg:3, pick:true},
  compote :{ic:'🍯',nm:'Dominik-Kompott',food:8},
  panfry  :{ic:'🍳',nm:'Pilzpfanne',  food:10},
  soup    :{ic:'🍲',nm:'Dominik-Suppe',food:20},
  // Vom Markt, nicht aus dem Raster. Sie wirken, solange man sie in der
  // Hand hält — deshalb steht ihre Wirkung an einem Merkmal und nicht in
  // einem eigenen Ausrüstungsfach.
  boat    :{ic:'🛶',nm:'Boot',        boat:true},
  board   :{ic:'🛹',nm:'Skateboard',  board:true},
  glider  :{ic:'🪂',nm:'Gleitschirm', glide:true},
  // Was aus dem Topf kommt, wenn die Zutaten nicht zusammenpassen. Essbar
  // ist es gerade noch.
  junk    :{ic:'🤢',nm:'Angebrannte Pampe',food:1},
};

// ------------------------------------------------------------------ Geld
// Das Ziel des Spiels: zehntausend Euro umgesetzt. Gezählt wird, was man
// insgesamt verdient hat, nicht was in der Kasse liegt — Einkaufen bringt
// einen also nicht zurück.
// GOAL/SEED_OF/PRICES kommen aus shared/economy.js.

// ------------------------------------------------------------------ Inventar
const STACK=64, NSLOT=36, NBAR=9;
const slots=Array.from({length:NSLOT},()=>null);   // {id,n} oder null

function countOf(id){ let n=0; for(const s of slots) if(s&&s.id===id) n+=s.n; return n; }
function give(id,n=1){
  for(const s of slots){ if(s&&s.id===id&&s.n<STACK){ const t=Math.min(n,STACK-s.n); s.n+=t; n-=t; if(!n) return 0; } }
  for(let i=0;i<NSLOT;i++){ if(!slots[i]){ const t=Math.min(n,STACK); slots[i]={id,n:t}; n-=t; if(!n) return 0; } }
  return n;                                        // Rest passt nicht mehr rein
}
function take(id,n=1){
  if(countOf(id)<n) return false;
  for(let i=0;i<NSLOT&&n>0;i++){
    const s=slots[i]; if(!s||s.id!==id) continue;
    const t=Math.min(n,s.n); s.n-=t; n-=t;
    if(s.n<=0) slots[i]=null;
  }
  return true;
}
const held=()=>slots[player.sel];
const heldId=()=>slots[player.sel]?.id||null;
function consumeHeld(){
  const s=slots[player.sel]; if(!s) return;
  s.n--; if(s.n<=0) slots[player.sel]=null;
}
const hasTool=k=>{ const id=heldId(); return !!(id&&ITEMS[id]&&ITEMS[id][k]); };
const heldDmg=()=>{ const id=heldId(); return (id&&ITEMS[id]?.dmg)||2; };

// ------------------------------------------------------------------ Rezepte
// pat  Zeilen von oben nach unten, key übersetzt die Zeichen, ' ' bleibt leer
// shapeless  Zutaten in beliebiger Anordnung
// rank je kleiner, desto alltäglicher — danach sortiert sich das Rezeptbuch
// secret  nur mit Rezept zu bauen; ohne bleibt der Topf leer
// Ob eine Werkbank nötig ist, steht nirgends: was breiter oder höher als zwei
// ist, passt schlicht nicht ins 2×2-Raster des Inventars.
// RECIPES kommt aus shared/economy.js.

// ------------------------------------------------------------------ Bildchen
// Für jeden Gegenstand liegt ein Sprite unter sprites/items/<id>.png. Das
// Emoji bleibt als alt-Text stehen: fehlt der Ordner (oder lädt eine Datei
// nicht), zeigt der Browser wieder Emoji statt eines kaputten Bildes.
const ICONS=new Set(['dirt','stone','sand','snow','log','plank','brick','bench','pot','torch',
                     'stick','bowl','dominik','mushroom','salt','pepper','sword','axe','pick',
                     'compote','panfry','soup','junk','boat','board','glider',
                     'hoe','kern','mycel','korn']);
// Dominik trägt sein Gesicht — im Rucksack wie am Baum dasselbe Bild.
const ICON_ALT={dominik:'dominik_face'};
const iconSrc=id=>ICONS.has(id)?'./sprites/items/'+(ICON_ALT[id]||id)+'.png':null;
// Was ein Gegenstand kann, in einer Zeile — für die Schwebehilfe.
function itemNote(id){
  const it=ITEMS[id]; if(!it) return '';
  const p=[];
  if(it.food) p.push('🍗 sättigt um '+it.food);
  if(it.dmg) p.push('⚔️ Schaden '+it.dmg);
  if(it.axe) p.push('🪓 schnell bei Holz');
  if(it.pick) p.push('⛏️ schnell bei Stein');
  if(it.torch) p.push('🔥 hält Bennis fern');
  if(it.hoe) p.push('🧑‍🌾 macht Gras und Erde zu Acker');
  if(it.seed) p.push('🌱 auf Acker säen — wird zu '+ITEMS[BLOCKS[it.seed.ripe].drop].nm);
  if(it.boat) p.push('🛶 trägt dich übers Wasser');
  if(it.board) p.push('🛹 doppelt so flott an Land');
  if(it.glide) p.push('🪂 lässt dich sanft herabsegeln');
  if(PRICES[id]) p.push('💶 '+PRICES[id]+' € bei Manni');
  if(it.block) p.push('setzbar');
  const used=RECIPES.filter(r=>patRows(r).some(row=>row.includes(id)))
    .filter(r=>known.has(r.id)).map(r=>ITEMS[r.out[0]].nm);
  if(used.length) p.push('Zutat für '+used.slice(0,3).join(', ')+(used.length>3?' …':''));
  return p.join(' · ');
}
function icon(id,cls=''){
  const it=ITEMS[id];
  if(!it) return '';
  const src=iconSrc(id);
  return src?`<img class="ic ${cls}" src="${src}" alt="${it.ic}" draggable="false">`
            :`<span class="ic ${cls}">${it.ic}</span>`;
}

// Die zwei offensichtlichen kennt man von zu Hause, der Rest will gefunden
// oder ausprobiert werden.
const known=new Set(['plank','stick']);
const knowsSoup=()=>known.has('soup');
// Auf den kleinsten belegten Ausschnitt zuschneiden — genau wie das, was im
// Raster liegt. Sonst hängt an 'SS ' eine leere Spalte, und die Axt passt zu
// nichts mehr.
function trimRows(rows){
  let x0=1e9,x1=-1,y0=1e9,y1=-1;
  rows.forEach((row,y)=>row.forEach((id,x)=>{
    if(!id) return;
    x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y);
  }));
  if(x1<0) return [[]];
  return rows.slice(y0,y1+1).map(row=>{
    const r=[];
    for(let x=x0;x<=x1;x++) r.push(row[x]??null);
    return r;
  });
}
const patRows=r=>trimRows(r.shapeless?[r.shapeless.slice()]
                                     :r.pat.map(row=>[...row].map(ch=>ch===' '?null:r.key[ch])));
function needList(rows){
  const n={};
  for(const row of rows) for(const id of row) if(id) n[id]=(n[id]||0)+1;
  return n;
}
const haveAll=rows=>{ const n=needList(rows); for(const id in n) if(countOf(id)<n[id]) return false; return true; };

// ------------------------------------------------------------------ Weltdaten
// scenery/edits/colRange/chests/K sowie blockAt/solidAt/fills/fillsAt/
// waterAt/surfaceAt/safeSpot und die gesamte Landschafts-/Truhen-/Jannes-
// Platzierung (chestSpots/houseSpots/traderSpots) kommen aus world (siehe
// shared/world.js) — dieselbe deterministische Erzeugung läuft unverändert
// im PartyKit-Server.

// ------------------------------------------------------------------ Chunk-Vernetzung
// Es werden ausschließlich freiliegende Flächen gebaut, chunkweise, damit die
// Kamera den Rest wegkulisst und ein Abbau nur seinen Chunk neu vernetzt.
const CHUNK=24, VIEW=145;
const NB4=[[1,0],[-1,0],[0,1],[0,-1]];
const FACE_N={py:[0,1,0],ny:[0,-1,0],px:[1,0,0],nx:[-1,0,0],pz:[0,0,1],nz:[0,0,-1]};
const UVQ=[0,0, 1,0, 1,1, 0,1];
function faceVerts(dir,x,y,z){
  const x0=x-.5,x1=x+.5,y0=y,y1=y+1,z0=z-.5,z1=z+.5;
  switch(dir){
    case 'py': return [x0,y1,z1, x1,y1,z1, x1,y1,z0, x0,y1,z0];
    case 'ny': return [x0,y0,z0, x1,y0,z0, x1,y0,z1, x0,y0,z1];
    case 'px': return [x1,y0,z1, x1,y0,z0, x1,y1,z0, x1,y1,z1];
    case 'nx': return [x0,y0,z0, x0,y0,z1, x0,y1,z1, x0,y1,z0];
    case 'pz': return [x0,y0,z1, x1,y0,z1, x1,y1,z1, x0,y1,z1];
    default  : return [x1,y0,z0, x0,y0,z0, x0,y1,z0, x1,y1,z0];
  }
}
// Zwei senkrechte Flächen über Kreuz, wie die Blumen im Vorbild. s ist die
// Kantenlänge, quer wie hoch. Gewachsenes steht auf dem Boden seiner Zelle
// (sit), Gepflücktes hängt oben drin — die Frucht soll am Laub darüber
// kleben und nicht in der Luft schweben.
const UPN=[0,1,0];
function crossVerts(i,x,y,z,s,sit){
  const o=s/(2*Math.SQRT2);
  const y0=sit?y:y+1-s, y1=sit?y+s:y+1;
  return i===0
    ? [x-o,y0,z-o, x+o,y0,z+o, x+o,y1,z+o, x-o,y1,z-o]
    : [x-o,y0,z+o, x+o,y0,z-o, x+o,y1,z-o, x-o,y1,z+o];
}
const chunks=new Map();
const NCH=Math.ceil((BOUND.x1-BOUND.x0+1)/CHUNK);
const CI=x=>clamp(Math.floor((x-BOUND.x0)/CHUNK),0,NCH-1);
function buildChunk(ci,cj){
  const ck=ci+','+cj;
  let c=chunks.get(ck);
  if(c){ for(const m of c.meshes){ scene.remove(m); m.geometry.dispose(); m.material.dispose(); } c.meshes.length=0; }
  else { c={meshes:[],cx:0,cz:0,visible:true}; chunks.set(ck,c); }
  const bx=BOUND.x0+ci*CHUNK, bz=BOUND.z0+cj*CHUNK;
  const x1=Math.min(bx+CHUNK-1,BOUND.x1), z1=Math.min(bz+CHUNK-1,BOUND.z1);
  c.cx=bx+CHUNK/2; c.cz=bz+CHUNK/2;
  const buf={};
  const addQuad=(mat,v,nv)=>{
    const b=buf[mat]||(buf[mat]={p:[],n:[],u:[],i:[]});
    const base=b.p.length/3;
    b.p.push(...v);
    for(let k=0;k<4;k++) b.n.push(nv[0],nv[1],nv[2]);
    b.u.push(...UVQ);
    b.i.push(base,base+1,base+2, base,base+2,base+3);
  };
  const add=(mat,dir,x,y,z)=>addQuad(mat,faceVerts(dir,x,y,z),FACE_N[dir]);
  for(let x=bx;x<=x1;x++) for(let z=bz;z<=z1;z++){
    const H=terrainH(x,z);
    let lo=H-1, hi=H-1;
    for(const [dx,dz] of NB4){
      const nx=x+dx, nz=z+dz;
      const nh=(nx<BOUND.x0||nx>BOUND.x1||nz<BOUND.z0||nz>BOUND.z1)?-12:terrainH(nx,nz);
      if(nh<lo) lo=nh;
    }
    lo=Math.max(lo,H-10);
    const r=colRange.get(x+','+z);
    if(r){ if(r[0]-1<lo) lo=r[0]-1; if(r[1]>hi) hi=r[1]; }
    for(let y=lo;y<=hi;y++){
      const t=blockAt(x,y,z);
      if(!t) continue;
      if(BLOCKS[t]?.cross){
        // Kein Würfel, sondern zwei gekreuzte Flächen — beidseitig sichtbar,
        // also keine Nachbarprüfung: die Frucht hängt ohnehin frei.
        const s=BLOCKS[t].size||1, sit=BLOCKS[t].sit;
        addQuad(t,crossVerts(0,x,y,z,s,sit),UPN);
        addQuad(t,crossVerts(1,x,y,z,s,sit),UPN);
        continue;
      }
      if(!fillsAt(x,y+1,z)) add(t,'py',x,y,z);
      if(!fillsAt(x,y-1,z)) add(t,'ny',x,y,z);
      if(!fillsAt(x+1,y,z)) add(t,'px',x,y,z);
      if(!fillsAt(x-1,y,z)) add(t,'nx',x,y,z);
      if(!fillsAt(x,y,z+1)) add(t,'pz',x,y,z);
      if(!fillsAt(x,y,z-1)) add(t,'nz',x,y,z);
    }
    if(H<=SEA-1&&!fillsAt(x,SEA-1,z)) add('water','py',x,SEA-1,z);
  }
  for(const mat in buf){
    const b=buf[mat];
    if(!b.i.length) continue;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(b.u,2));
    g.setIndex(b.i);
    g.computeBoundingSphere();
    const opts={map:mat==='water'?TEX.water:blockTex(mat)};
    // Beidseitig: von unten schaut man beim Schwimmen gegen die Oberfläche.
    if(mat==='water'){ opts.transparent=true; opts.opacity=.78; opts.side=THREE.DoubleSide; }
    else if(BLOCKS[mat]?.alpha){
      // Durchsichtige Ecken werden weggeschnitten, dadurch bleibt die runde
      // Form der Frucht stehen statt eines Kastens. Beide Seiten, sonst
      // schaut man durch die Vorderseite ins Nichts.
      opts.transparent=true; opts.alphaTest=.5; opts.side=THREE.DoubleSide;
    }
    const mesh=new THREE.Mesh(g,new THREE.MeshLambertMaterial(opts));
    mesh.receiveShadow=true; mesh.castShadow=false;
    mesh.visible=c.visible;
    scene.add(mesh); c.meshes.push(mesh);
  }
}
function buildWorld(){
  for(let i=0;i<NCH;i++) for(let j=0;j<NCH;j++) buildChunk(i,j);
}
// Nach einer Änderung nur den betroffenen Chunk (und ggf. den Nachbarn) neu bauen.
const _dirtyChunks=new Set();
function markDirty(x,z){
  for(const [dx,dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]])
    _dirtyChunks.add(CI(x+dx)+','+CI(z+dz));
}
function flushChunks(){
  if(!_dirtyChunks.size) return;
  // Erst leeren, dann bauen: ginge dabei etwas schief, bliebe der Chunk sonst
  // für immer schmutzig und risse jedes weitere Bild mit sich.
  const todo=[..._dirtyChunks];
  _dirtyChunks.clear();
  for(const k of todo){ const [i,j]=k.split(',').map(Number); buildChunk(i,j); }
}
// ------------------------------------------------------------------ Ackerbau
// Gehackt wird Gras oder Erde, gesät auf den Acker. Aus dem Setzling wird
// nach einer Weile die Ernte — und die gibt Saatgut für das nächste Beet.
// So ersetzt das Feld, was früher von selbst nachgewachsen ist.
const GROW=50;                           // Sekunden bis zur Reife, plus Streuung
const growing=new Map();                 // "x,y,z" → {to,at}
function till(cell){
  const t=blockAt(cell.x,cell.y,cell.z);
  if(t!=='grass'&&t!=='dirt') return false;
  if(blockAt(cell.x,cell.y+1,cell.z)) return false;
  setBlock(cell.x,cell.y,cell.z,'till');
  SND.dig();
  return true;
}
function plantSeed(cell,it){
  const {x,y,z}=cell;
  if(blockAt(x,y,z)!=='till'||blockAt(x,y+1,z)) return false;
  const gy=y+1;                            // Position des Setzlings — Karten-Schlüssel UND Broadcast nutzen dieselbe Koordinate
  setBlock(x,gy,z,it.seed.sprout);
  // Phase 3b: absolute Wanduhrzeit statt state.t (das ist pro Sitzung
  // relativ und startet bei jedem Neuladen nahe 0 — über Clients hinweg,
  // die zu verschiedenen echten Zeiten beigetreten sind, unbrauchbar).
  const at=Date.now()+GROW*rnd(.8,1.3)*1000;
  growing.set(K(x,gy,z),{to:it.seed.ripe,at});
  if(isConnected()) send({t:'plant',x,y:gy,z,to:it.seed.ripe,at});
  state.planted++;
  SND.place();
  return true;
}
function updateGrow(){
  for(const [k,g] of growing){
    if(Date.now()<g.at) continue;
    growing.delete(k);
    const [x,y,z]=k.split(',').map(Number);
    // Weggehackt oder überbaut? Dann wächst da auch nichts mehr. Läuft bei
    // jedem verbundenen Client unabhängig gegen dieselbe Wanduhrzeit — wer
    // zuerst dran ist, ruft das schon broadcastende setBlock() auf, alle
    // anderen finden hier nur noch keinen Setzling mehr vor und tun nichts.
    if(!String(blockAt(x,y,z)||'').startsWith('sprout')) continue;
    setBlock(x,y,z,g.to);
  }
}
// Reine Datenmutation kommt aus shared/world.js (setBlockData); hier nur
// noch die lokale Rendering-Folge (Chunk neu vernetzen) und — Phase 3a —
// die Weitergabe an den Server, falls verbunden. Jeder Aufrufer (till,
// plantSeed, updateGrow, breakBlock, useRight) läuft durch diese eine
// Funktion, darum genügt hier eine einzige send()-Stelle für alle
// Block-Änderungen. Eingehende 'block'-Nachrichten vom Server rufen NICHT
// diese Funktion auf, sondern setBlockData/markDirty direkt (siehe
// Netzwerk-Abschnitt weiter unten) — sonst würde ein gerade empfangener
// Fremd-Edit sofort wieder zurückgeschickt.
function setBlock(x,y,z,type){
  setBlockData(x,y,z,type);
  markDirty(x,z);
  if(isConnected()) send({t:'block',x,y,z,type});
}

// ------------------------------------------------------------------ Randmauer
const BLOCKGEO=new THREE.BoxGeometry(1,1,1);
const _m4=new THREE.Matrix4(), _pos=new THREE.Vector3(),
      _quat=new THREE.Quaternion(), _scl=new THREE.Vector3();
function batch(tex,cap,opts,shadow=true){
  const m=new THREE.InstancedMesh(BLOCKGEO,
    new THREE.MeshLambertMaterial(Object.assign({map:tex},opts||{})),cap);
  m.castShadow=shadow; m.receiveShadow=true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count=0; m.frustumCulled=false;
  scene.add(m);
  return m;
}
function blk(m,x,y,z,s=1){
  if(m.count>=m.instanceMatrix.count) return;
  _m4.compose(_pos.set(x,y+.5,z),_quat.set(0,0,0,1),_scl.set(s,s,s));
  m.setMatrixAt(m.count++,_m4);
}
// Zwei Lagen rund um die Welt: (Kantenlänge+2) × 2 Blöcke × 4 Seiten.
const wallMesh=batch(TEX.brick,(BOUND.x1-BOUND.x0+3)*8,null,false);
(function borderWall(){
  for(let x=BOUND.x0-1;x<=BOUND.x1+1;x++){
    blk(wallMesh,x,0,BOUND.z0-1); blk(wallMesh,x,1,BOUND.z0-1);
    blk(wallMesh,x,0,BOUND.z1+1); blk(wallMesh,x,1,BOUND.z1+1);
  }
  for(let z=BOUND.z0-1;z<=BOUND.z1+1;z++){
    blk(wallMesh,BOUND.x0-1,0,z); blk(wallMesh,BOUND.x0-1,1,z);
    blk(wallMesh,BOUND.x1+1,0,z); blk(wallMesh,BOUND.x1+1,1,z);
  }
  wallMesh.instanceMatrix.needsUpdate=true;
})();

// ------------------------------------------------------------------ Fackeln
// torches (Array) und litAt kommen aus shared/world.js (auch vom Server
// gebraucht, damit Bennis dort ebenso Fackellicht meiden).
const torchPost=batch(TEX.log,240);
const torchFlame=batch(TEX.flame,240,{emissive:0xff8c1a,emissiveIntensity:1});
function emitTorches(){
  torchPost.count=0; torchFlame.count=0;
  for(const t of torches){          // blk() setzt die Mitte auf y+.5, daher -.5
    blk(torchPost,t.x,t.y-.35,t.z,.18);
    blk(torchPost,t.x,t.y-.17,t.z,.18);
    blk(torchFlame,t.x,t.y+.07,t.z,.30);
  }
  torchPost.instanceMatrix.needsUpdate=true;
  torchFlame.instanceMatrix.needsUpdate=true;
}

// ------------------------------------------------------------------ Fallende Sachen
// Abgebautes fällt nicht mehr geradewegs in den Rucksack. Es liegt als
// kleiner drehender Würfel herum, bis jemand hingeht. Mit Q wirft man selbst
// etwas heraus, und genau so füttert man auch den Kochtopf.
const ITEM_TEX={};                    // Gegenstandsbildchen als Textur
const drops=[];
const DROP_S=.32, DROP_CAP=200, DROP_GRAV=22, DROP_DRAG=4;
const PICK_R=1.2;                     // so nah muss man ran
// Ein Würfel je Gegenstand, das Material geteilt: bei fünfzig herumliegenden
// Steinen wären fünfzig gleiche Materialien reine Verschwendung.
const dropMats=new Map();
function dropMat(id){
  let m=dropMats.get(id);
  if(m) return m;
  const it=ITEMS[id], b=it?.block?BLOCKS[it.block]:null;
  // Ein Block trägt seine Weltoberfläche, alles andere sein Bildchen — und
  // das hat durchsichtige Ränder, die weggeschnitten werden müssen.
  m=new THREE.MeshLambertMaterial(b
    ?{map:TEX[b.tex]||TEX.stone}
    :{map:ITEM_TEX[id]||TEX.dirt,transparent:true,alphaTest:.5,side:THREE.DoubleSide});
  dropMats.set(id,m);
  return m;
}
function removeDrop(d){
  const i=drops.indexOf(d);
  if(i<0) return;
  scene.remove(d.mesh);               // Würfel und Material sind geteilt, nichts wegwerfen
  drops.splice(i,1);
}
// pickT  Schonfrist, bis es aufgehoben werden darf
// potT   Schonfrist, bis ein Kochtopf es schlucken darf — sonst fiele das
//        fertige Gericht sofort wieder in den Topf, aus dem es kam
// Gemeinsamer Bau-Kern für einen lokalen UND einen von einem anderen Client
// übernommenen Drop (Phase 6) — der einzige Unterschied ist, wer die dropId
// vergibt und ob broadcastet wird, s. spawnDrop/spawnDropRemote unten.
function _mkDrop(dropId,id,n,x,y,z,vx,vy,vz,pickT,potT){
  if(!ITEMS[id]||n<=0) return null;
  while(drops.length>=DROP_CAP) removeDrop(drops[0]);   // Notbremse gegen Halden
  const mesh=new THREE.Mesh(BLOCKGEO,dropMat(id));
  mesh.scale.setScalar(DROP_S);
  mesh.castShadow=true;
  mesh.position.set(x,y,z);
  scene.add(mesh);
  // age zählt die Lebenszeit, t nur die Phase des Wippens — die startet
  // zufällig, damit nicht alle Würfel im Gleichschritt auf und ab gehen.
  const d={id,n,x,y,z,vx,vy,vz,mesh,spin:rnd(0,6.28),rest:false,
           pickT,potT,age:0,t:rnd(0,6.28),dropId};
  drops.push(d);
  return d;
}
let dropSeq=0;
// Jeder heutige Aufrufer (giveOrDrop, dropHeld, finishCook, buyFrom/
// buyResult, breakBlock, ...) hat seinen Zufalls-Impuls schon VOR diesem
// Aufruf ausgewürfelt — die Zufälligkeit ist längst aufgelöst, spawnDrop
// bekommt nur noch konkrete Zahlen. Darum genügt EIN Broadcast-Punkt hier
// für alle Aufrufer, genau wie setBlock() das für Blockänderungen schon tut:
// eine frische, global eindeutige dropId minten und — sofern verbunden — an
// alle ANDEREN Clients melden (Empfänger s. on('drop-spawn',...) unten).
function spawnDrop(id,n,x,y,z,vx=0,vy=0,vz=0,pickT=.35,potT=0){
  const dropId=`${getPid()??'off'}-${++dropSeq}`;
  const d=_mkDrop(dropId,id,n,x,y,z,vx,vy,vz,pickT,potT);
  if(d&&isConnected()) send({t:'drop-spawn',dropId,id,n,x,y,z,vx,vy,vz});
  return d;
}
// Für eine ankommende drop-spawn-Nachricht: baut denselben Würfel, aber mit
// der schon vom Absender vergebenen dropId und OHNE erneut zu broadcasten —
// sonst prallte dieselbe Nachricht endlos zwischen den Clients hin und her.
function spawnDropRemote(dropId,id,n,x,y,z,vx,vy,vz,pickT=.35,potT=0){
  return _mkDrop(dropId,id,n,x,y,z,vx,vy,vz,pickT,potT);
}
// Passt es nicht mehr in den Rucksack, liegt es eben vor den Füßen —
// besser als die alte Meldung, dass etwas verlorengegangen sei.
function giveOrDrop(id,n){
  const rest=give(id,n);
  if(rest) spawnDrop(id,rest,player.x,player.y+1,player.z,rnd(-.8,.8),1.6,rnd(-.8,.8),.8);
  return rest;
}
function dropHeld(all){
  const s=held();
  if(!s) return;
  const id=s.id, n=all?s.n:1;
  s.n-=n;
  if(s.n<=0) slots[player.sel]=null;
  camera.getWorldDirection(_rd);
  const l=Math.hypot(_rd.x,_rd.z)||1, fx=_rd.x/l, fz=_rd.z/l;
  // Gut einen Block weit: etwas Schwung nach vorn, den die Reibung in
  // dreiviertel Blöcken aufzehrt. Und eine Schonfrist, sonst hebt man es
  // sofort wieder auf.
  spawnDrop(id,n,player.x+fx*.55,player.y+1.15,player.z+fz*.55,fx*3,1.1,fz*3,1.6);
  SND.place();
  updateHUD();
}
function updateDrops(dt){
  for(let i=drops.length-1;i>=0;i--){
    const d=drops[i];
    d.t+=dt; d.age+=dt; d.spin+=dt*1.7;
    if(d.pickT>0) d.pickT-=dt;
    if(d.potT>0) d.potT-=dt;

    if(d.vx||d.vz){                      // waagerecht, mit Reibung
      const nx=d.x+d.vx*dt, nz=d.z+d.vz*dt;
      if(!fillsAt(Math.round(nx),Math.floor(d.y+.1),Math.round(nz))){ d.x=nx; d.z=nz; }
      else { d.vx=0; d.vz=0; }
      const f=Math.max(0,1-dt*DROP_DRAG);
      d.vx*=f; d.vz*=f;
      if(Math.abs(d.vx)<.06&&Math.abs(d.vz)<.06){ d.vx=0; d.vz=0; }
    }

    // Senkrecht. Im Wasser treibt es auf und schaukelt an der Oberfläche,
    // statt auf dem Grund zu verschwinden — Weggeworfenes soll man
    // wiederfinden, auch wenn es in den Fluss fällt.
    const wet=waterAt(d.x,d.y+.15,d.z);
    if(wet){
      d.vy=Math.min(d.vy+18*dt,1.2);
      const f=Math.max(0,1-dt*5); d.vx*=f; d.vz*=f;
    } else d.vy-=DROP_GRAV*dt;
    let ny=d.y+d.vy*dt;
    const bx=Math.round(d.x), bz=Math.round(d.z);
    if(d.vy<=0){
      const by=Math.floor(ny);
      if(fillsAt(bx,by,bz)){
        ny=by+1; d.vy=0;
        // Landet es auf einem Kochtopf, wandert es hinein statt obendrauf.
        // Verbunden: nicht sofort potAdd() aufrufen — zwei Clients, deren
        // Physik dasselbe Landen fast zeitgleich erkennt, würden sonst beide
        // füttern (Vervielfältigung). Stattdessen beim Server anmelden (s.
        // Kommentar bei den anderen beiden Claim-Stellen unten) und erst auf
        // die Freigabe (on('drop-claimed',...)) hin wirklich füttern. Position
        // hier merken, weil der Server sie zur Schiedsrichter-Rolle gar nicht
        // braucht und darum nicht zurückschickt.
        if(!d.rest&&d.potT<=0&&blockAt(bx,by,bz)==='pot'){
          if(isConnected()){
            if(!d._claiming){
              d._claiming=true; d._claimReason='pot'; d._potPos={x:bx,y:by,z:bz};
              send({t:'drop-claim',dropId:d.dropId,reason:'pot'});
            }
          }else{
            const took=potAdd(bx,by,bz,d.id,d.n);
            if(took>=d.n){ removeDrop(d); continue; }
            if(took>0) d.n-=took;
          }
        }
        d.rest=true;
      } else d.rest=false;
    }
    if(wet&&ny>WATER_Y-.42){ ny=WATER_Y-.42; d.vy=0; d.rest=true; }
    d.y=ny;
    if(d.y<BEDROCK-4){ removeDrop(d); continue; }   // normal unerreichbar

    // Was vor Mannis Tresen liegen bleibt und auf seiner Preisliste steht,
    // kauft er auf der Stelle. Alles andere lässt er liegen.
    // Verbunden: wie beim Topf oben — nicht sofort verkaufen, sonst könnten
    // zwei Clients, die dasselbe Ruhen fast zeitgleich erkennen, denselben
    // Drop beide verkaufen (Geld aus dem Nichts). Erst beim Server anmelden,
    // dann auf die Freigabe warten (drop._claiming verhindert erneutes
    // Anmelden, solange die Antwort noch aussteht — rein lokal, s. p._claiming
    // beim Topf-Claim).
    if(d.rest&&PRICES[d.id]&&marketChar&&
       Math.hypot(d.x-marketChar.x,d.z-marketChar.z)<MARKET_R&&
       Math.abs(d.y-marketChar.y)<2.5){
      if(isConnected()){
        if(!d._claiming){ d._claiming=true; d._claimReason='sell'; send({t:'drop-claim',dropId:d.dropId,reason:'sell'}); }
        continue;
      }
      const id=d.id, n=d.n;
      removeDrop(d);
      sellTo(id,n);
      continue;
    }
    // Gleiches Muster fürs Aufheben — verbunden erst anmelden, das eigentliche
    // give() läuft erst im on('drop-claimed',...)-Gewinnfall.
    if(d.pickT<=0&&Math.hypot(d.x-player.x,d.z-player.z)<PICK_R&&
       Math.abs(d.y-player.y)<2.2&&!state.paused){
      if(isConnected()){
        if(!d._claiming){ d._claiming=true; d._claimReason='pickup'; send({t:'drop-claim',dropId:d.dropId,reason:'pickup'}); }
      }else{
        const rest=give(d.id,d.n);
        if(rest<d.n){
          playSample('pop',.8)||SND.pop(); updateHUD();
          if(rest<=0){ removeDrop(d); continue; }
          d.n=rest;                        // nur ein Teil passte hinein
        }
      }
    }
    // Gleiches, das nebeneinander liegt, fasst sich zusammen — sonst pflastert
    // ein abgeräumter Baum die Wiese mit hundert Einzelwürfeln. Nur frisch
    // Gefallenes sucht sich einen Partner: sonst vergliche jeder Würfel in
    // jedem Bild jeden anderen.
    if(d.rest&&d.age<3){
      let merged=false;
      for(const o of drops){
        if(o===d||o.id!==d.id||!o.rest||o.n+d.n>STACK) continue;
        if(Math.abs(o.x-d.x)>.8||Math.abs(o.z-d.z)>.8||Math.abs(o.y-d.y)>.7) continue;
        o.n+=d.n; removeDrop(d); merged=true; break;
      }
      if(merged) continue;
    }
    d.mesh.position.set(d.x,d.y+DROP_S*.5+(d.rest?Math.sin(d.t*2.4)*.05:0),d.z);
    d.mesh.rotation.y=d.spin;
  }
}

// ------------------------------------------------------------------ Kochtopf
// Der Topf ist kein Raster mehr, sondern ein Topf: Zutaten hineinwerfen,
// Rechtsklick, und was dabei herauskommt, fällt oben wieder heraus.
const POT_CAP=12, COOK_TIME=4.5;
const pots=new Map();                    // "x,y,z" → {items:[{id,n}],cook:0}
const potCount=p=>p.items.reduce((a,b)=>a+b.n,0);
function potAdd(x,y,z,id,n){             // gibt zurück, wieviel hineinging
  const k=K(x,y,z);
  let p=pots.get(k);
  if(!p){ p={items:[],cook:0,readyAt:0}; pots.set(k,p); }
  if(p.cook>0) return 0;                 // während des Kochens bleibt der Deckel zu
  const t=Math.min(POT_CAP-potCount(p),n);
  if(t<=0) return 0;
  const e=p.items.find(i=>i.id===id);
  if(e) e.n+=t; else p.items.push({id,n:t});
  SND.tap();
  // Phase 3b: den vollen Inhalt broadcasten (nicht nur das Delta) — dasselbe
  // "ganzer Zustand" Prinzip wie bei Block/Fackel-Sync, unempfindlich gegen
  // Drift. Das auslösende Ereignis (ein Wurf-Würfel, der im Topf landet)
  // bleibt unsynchronisiert (Phase 6), nur das Ergebnis geht raus — hier statt
  // nur am einen bekannten Aufrufer (Wurf-Physik in updateDrops), damit auch
  // ein direkter potAdd()-Aufruf (z.B. über das Debug-API) korrekt synct.
  if(isConnected()) send({t:'pot-add',x,y,z,items:p.items});
  return t;
}
// Im Topf liegt alles durcheinander — es zählt nur, was drin ist und wieviel.
function potRecipe(p){
  const ids=[];
  for(const it of p.items) for(let i=0;i<it.n;i++) ids.push(it.id);
  ids.sort();
  return RECIPES.find(r=>r.station==='pot'&&r.shapeless&&
    r.shapeless.length===ids.length&&
    r.shapeless.slice().sort().every((v,i)=>v===ids[i]))||null;
}
// Steht man vor einem Topf, hängt rechts, was sich darin kochen lässt — und
// was gerade drinliegt. Neu gebaut wird die Leiste nur, wenn sich etwas
// geändert hat; sonst schriebe sie sich sechzigmal je Sekunde selbst neu.
let potPanelSig='', potPanelOn=false;
function updatePotPanel(cell){
  const box=el('potrec');
  if(!cell||state.paused){
    if(potPanelOn){ potPanelOn=false; potPanelSig=''; box.classList.add('hidden'); }
    return;
  }
  const p=pots.get(K(cell.x,cell.y,cell.z));
  const dishes=RECIPES.filter(r=>r.station==='pot'&&known.has(r.id));
  const sig=[cell.x,cell.y,cell.z,p?p.items.map(i=>i.id+'×'+i.n).join(','):'',
             p?p.cook>0:'' ,dishes.map(r=>r.id).join(',')].join('|');
  if(sig===potPanelSig) return;
  potPanelSig=sig;
  const n=p?potCount(p):0;
  const inside=p&&p.items.length
    ? p.items.map(i=>icon(i.id,'mini')+(i.n>1?'<b>'+i.n+'</b>':'')).join(' ')
    : '<i style="opacity:.6">leer</i>';
  box.innerHTML=`<h3>🍲 Kochtopf ${n}/${POT_CAP}</h3>
    <div class="inpot">${p&&p.cook>0?'kocht gerade …':inside}</div>`+
    (dishes.length?dishes.map(recCard).join('')
      :'<p class="sidenote">Du kennst noch kein Gericht. Die Rezepte dafür haben die Jannessen.</p>')+
    '<p class="sidenote">Zutaten hineinwerfen (Q), dann Rechtsklick.</p>';
  box.classList.remove('hidden');
  potPanelOn=true;
}
// Am Fadenkreuz steht, wie voll der Topf ist — sonst müsste man raten.
function potTip(cell){
  const p=pots.get(K(cell.x,cell.y,cell.z));
  const n=p?potCount(p):0;
  return p&&p.cook>0 ? '🍲 Kochtopf — kocht …'
       : n ? `🍲 Kochtopf ${n}/${POT_CAP} — Rechtsklick zum Kochen`
           : '🍲 Kochtopf — wirf Zutaten hinein (Q)';
}
function usePot(cell){
  const p=pots.get(K(cell.x,cell.y,cell.z));
  if(!p||!p.items.length){ toast('🍲 Der Topf ist leer — wirf Zutaten hinein (Q).','warn',2600); return; }
  if(p.cook>0){ toast('🍲 Es kocht schon.','',1400); return; }
  // p.cook ist nur noch ein 0/1-Kochflag, nicht mehr der Countdown selbst —
  // die eigentliche Zielzeit ist p.readyAt, eine absolute Wanduhrzeit, damit
  // alle verbundenen Clients (die zu unterschiedlichen echten Zeiten
  // beigetreten sind) auf denselben Moment hinlaufen.
  p.cook=1;
  p.readyAt=Date.now()+COOK_TIME*1000;
  if(isConnected()) send({t:'pot-start',x:cell.x,y:cell.y,z:cell.z,readyAt:p.readyAt});
  SND.craft();
  toast('🍲 Der Topf kocht …','good',2000);
}
function finishCook(k,p){
  const [x,y,z]=k.split(',').map(Number);
  const r=potRecipe(p);
  p.items.length=0;
  // Springt oben heraus und bleibt eine Weile taub für Töpfe, sonst plumpst
  // das fertige Gericht geradewegs in den zurück, aus dem es kam.
  const out=(id,n)=>spawnDrop(id,n,x,y+1.25,z,rnd(-.3,.3),2.4,rnd(-.3,.3),.5,1.8);
  if(r&&known.has(r.id)){
    out(r.out[0],r.out[1]);
    state.crafted++;
    SND.craft();
    const pr=PRICES[r.out[0]];
    toast(ITEMS[r.out[0]].ic+' '+ITEMS[r.out[0]].nm+' ist fertig.'+
      (pr?' — '+pr+' € bei Manni.':''),'good',2800);
    return;
  }
  out('junk',1);
  SND.fail();
  // Der Unterschied ist wichtig: das eine ist ein Fehlversuch, das andere
  // fehlendes Wissen — und dagegen hilft ein Jannes.
  toast(r?'🤢 Du weißt nicht, was daraus werden soll. Frag einen Jannes.'
         :'🤢 Angebrannt. Daraus wird kein Gericht.','bad',3200);
}
// Phase 3b: fertig ist ein Topf für ALLE Clients zur selben Wanduhrzeit
// (p.readyAt) — aber `finishCook` spawnt einen echten, aufhebbaren Würfel
// (Phase 6 synct Drops noch nicht), darum darf ihn nicht jeder Client für
// sich selbst aufrufen: stünden zwei Spieler am selben Topf, würde jeder
// sein eigenes Gericht spawnen und einsacken — echte Vervielfältigung, kein
// Rand­fall. Also: statt direkt zu kochen, wird beim Server ein "claim"
// angemeldet; der Server bestimmt EINMAL den Gewinner (pot-grant), und nur
// der ruft finishCook tatsächlich auf (siehe on('pot-grant',...) weiter
// unten). p._claiming verhindert, dass jedes Bild erneut angemeldet wird,
// während die Antwort noch aussteht — rein lokal, nie mitgeschickt.
function updatePots(dt){
  for(const [k,p] of pots){
    if(p.cook<=0) continue;
    if(Date.now()<p.readyAt) continue;
    const [x,y,z]=k.split(',').map(Number);
    if(blockAt(x,y,z)!=='pot'){ pots.delete(k); continue; }  // abgebaut, während es kochte
    if(!isConnected()){                    // offline/Einzelspieler: wie bisher, kein Claim-Tanz nötig
      p.cook=0;
      finishCook(k,p);
      continue;
    }
    if(p._claiming) continue;
    p._claiming=true;
    send({t:'pot-claim',x,y,z,readyAt:p.readyAt});
  }
}

// ------------------------------------------------------------------ Bewohner
const CHARS=[
  {key:'manni',name:'Manni-Markt',h:1.9,x:MARKET.x,z:MARKET.z,color:'#ff6b4a',
   market:true, tag:true, roam:1,
   lines:['Dominiks? Einen Euro das Stück, wirf sie mir hin.',
          'Die Suppe zahlt hundert. Hundert!',
          'Boot, Brett und Schirm — bauen kannst du die nicht.',
          'Rezepte gibt es draußen bei den Jannessen.']},
];

// ------------------------------------------------------------------ Angebote
// Jedes Rezept ist bei irgendeinem Jannes zu haben, und keines zweimal: was
// einer aushängen hat, bietet der nächste nicht an. Nach einem Handel
// überlegt er sich eine Weile etwas Neues — und wird dabei jedes Mal ein
// bisschen gieriger.
// REFRESH/RAW/offerWant kommen aus shared/economy.js — offerWant nimmt den
// Zufallsgenerator als Parameter, damit Client und Server je ihre eigene
// Instanz behalten (siehe OFFER_RND unten, nur noch für den Offline-Fall
// gebraucht, sobald der Server die Angebote vorgibt).
const OFFER_RND=mulberry(20260101);      // eigene Formel: Angebote bleiben reproduzierbar
function setOffer(c,r,round){
  c.trade=r?{give:r.id,want:offerWant(r,round,OFFER_RND),done:false,round,readyAt:0}
           :{give:null,want:[],done:false,round,readyAt:0};
}
function makeOffer(c,round){
  const taken=new Set(CHARS.filter(o=>o!==c&&o.trade&&o.trade.give&&!o.trade.done)
                           .map(o=>o.trade.give));
  const pool=RECIPES.filter(r=>!known.has(r.id)&&!taken.has(r.id));
  setOffer(c,pool.length?pool[Math.floor(OFFER_RND()*pool.length)]:null,round);
}
const offerAsk=c=>{
  const t=c.trade;
  if(!t.give) return 'Mehr hab ich dir nicht zu zeigen. Frag einen anderen von uns.';
  const w=t.want.map(([id,n])=>n+'× '+ITEMS[id].nm).join(' und ');
  return 'Bring mir '+w+', dann zeig ich dir, wie das nächste geht.';
};
const offerHint=c=>{
  const t=c.trade;
  if(t.done) return 'Lass mir einen Moment, mir fällt schon was ein.';
  if(!t.give) return 'Ich hab dir alles gezeigt.';
  return t.want.map(([id,n])=>n+'× '+ITEMS[id].nm).join(', ')+'?';
};
// Alle heißen Jannes, alle sehen gleich aus. Die in den Dorfhäusern haben
// wenig Platz, die draußen dürfen weiter umherstreifen.
const traders=traderSpots.map((s,i)=>{
  const c={key:'jannes',name:'Jannes',h:1.88,x:s.x,z:s.z,color:'#4ab0ff',
           tag:false, roam:i>=1&&i<=3?1.1:3.2, home:{x:s.x,z:s.z}, trade:null};
  CHARS.push(c);
  return c;
});
// Der im Tal fängt mit der Hacke an — ohne sie gibt es kein Feld und damit
// keinen Nachschub. Der Rest wird ausgelost.
setOffer(traders[0],RECIPES.find(r=>r.id==='hoe'),0);
for(let i=1;i<traders.length;i++) makeOffer(traders[i],0);
const texLoader=new THREE.TextureLoader();
const loadTex=url=>new Promise((res,rej)=>texLoader.load(url,t=>{
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  res(t);
},undefined,()=>rej(new Error('Bild fehlt: '+url))));
const billboards=[];
let benniTex=null;
function labelTex(lines,color='#ffd76a'){
  const W=512,LH=54,pad=18;
  const arr=Array.isArray(lines)?lines:[lines];
  const H=Math.max(128,arr.length*LH+pad*2);
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const g=c.getContext('2d');
  g.fillStyle='rgba(12,22,12,.86)';
  const r=22; g.beginPath();
  g.moveTo(r,0);g.arcTo(W,0,W,H,r);g.arcTo(W,H,0,H,r);g.arcTo(0,H,0,0,r);g.arcTo(0,0,W,0,r);g.fill();
  g.strokeStyle='rgba(255,255,255,.35)'; g.lineWidth=4; g.stroke();
  g.fillStyle=color; g.font='bold 38px system-ui'; g.textAlign='center'; g.textBaseline='middle';
  arr.forEach((t,i)=>g.fillText(t,W/2,pad+LH/2+i*LH,W-30));
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
function makeLabel(lines,color,h){
  const tex=labelTex(lines,color);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,depthWrite:false}));
  sp.scale.set(h*tex.image.width/tex.image.height,h,1);
  return sp;
}
const CHAR_TEX={};                        // key → Bild, jedes nur einmal geladen
function setupChars(){
  for(const c of CHARS){
    c.tex=CHAR_TEX[c.key];
    if(!c.tex) continue;
    const g=new THREE.Group();
    const y=surfaceAt(c.x,c.z);
    c.y=y;
    if(c.market) marketChar=c;
    g.position.set(c.x,y,c.z);
    const asp=c.tex.image.width/c.tex.image.height;
    const bb=new THREE.Mesh(new THREE.PlaneGeometry(c.h*asp,c.h),
      new THREE.MeshLambertMaterial({map:c.tex,transparent:true,alphaTest:.5,side:THREE.DoubleSide}));
    bb.position.y=c.h/2; bb.castShadow=true; g.add(bb); billboards.push(bb);
    // Nur wer einen Laden hat, trägt ein Schild. Die Jannessen erkennt man
    // am Fadenkreuz, wenn man vor ihnen steht.
    let tag=null;
    if(c.tag){ tag=makeLabel(c.name,c.color,.3); tag.position.y=c.h+.28; g.add(tag); }
    const bubble=makeLabel('','#fff',.5);
    bubble.position.y=c.h+1; bubble.visible=false; g.add(bubble);
    scene.add(g);
    Object.assign(c,{group:g,bb,tag,bubble,bubbleT:0,sayT:rnd(8,20),
                     home:c.home||{x:c.x,z:c.z},tx:null,waitT:rnd(1,5)});
  }
}
function say(c,txt,ms=4200){
  const words=txt.split(' '); const lines=[]; let cur='';
  for(const w of words){ if((cur+' '+w).trim().length>26){lines.push(cur.trim());cur=w;} else cur+=' '+w; }
  if(cur.trim()) lines.push(cur.trim());
  c.bubble.material.map?.dispose();
  const tex=labelTex(lines.slice(0,3),'#fff');
  c.bubble.material.map=tex;
  const bh=.34*Math.min(lines.length,3)+.3;
  c.bubble.scale.set(bh*tex.image.width/tex.image.height,bh,1);
  c.bubble.position.y=c.h+.75+bh*.5;
  c.bubble.visible=true; c.bubbleT=ms/1000;
}
// ------------------------------------------------------------------ Manni-Markt
// Manni kauft, was man ihm über den Tresen wirft, und zahlt bar. Verkauft
// wird nur, was sich nicht bauen lässt: Boot, Brett und Schirm.
const MARKET_R=2.6;
// Die Preise sind Stationen auf dem Weg zum Ziel: das Brett ist früh drin,
// der Schirm bleibt eine Weile ein Wunsch. Alle drei bringen dich schneller
// zur nächsten Ernte — sie zahlen sich also selbst zurück.
// SHOP kommt aus shared/economy.js.
let marketChar=null;
function earn(n){
  state.money+=n; state.earned+=n;
  updateHUD();
  if(state.earned>=GOAL) winGame();
}
// Verkaufen ist nie umkämpft — niemand kann verhindern, dass man das eigene,
// schon in der Hand befindliche Gut verkauft, anders als bei einer Truhe gibt
// es keinen gemeinsamen Vorrat, um den man wettrennen könnte. Darum dürfen
// Sound/Spruch/Toast sofort (optimistisch) laufen; die tatsächlichen
// gemeinsamen Zahlen (state.money/earned/sold) kommen NUR noch über die
// 'econ'-Antwort des Servers zurück (s.u.) — offline bleibt der alte, direkt
// mutierende Weg über earn() bestehen.
function sellTo(id,n){
  const sum=PRICES[id]*n;
  SND.chest();
  say(marketChar,n+'× '+ITEMS[id].nm+' — macht '+sum+' Euro.',3200);
  toast('💶 +'+sum+' € für '+n+'× '+ITEMS[id].ic+' '+ITEMS[id].nm,'good',2600);
  if(isConnected()) send({t:'sell',id,n});
  else{ state.sold+=n; earn(sum); }
}
// Kaufen dagegen ist ein echtes Wettrennen um die gemeinsame Kasse — zwei
// Mitspieler dürfen niemals beide den letzten knapp leistbaren Artikel
// bekommen. Also NICHT optimistisch: der Server entscheidet allein, ob es
// reicht, und erst seine 'econ'-Antwort (buyResult) löst Drop/Spruch/Toast
// aus (s. on('econ',...) unten). Offline bleibt der alte, direkt mutierende
// Weg bestehen.
function buyFrom(id){
  const w=SHOP.find(s=>s.id===id);
  if(!w||!marketChar) return;
  if(isConnected()){ send({t:'buy',id}); return; }
  if(state.money<w.price){ SND.fail(); toast('💶 Dafür reicht es nicht.','warn',1800); return; }
  state.money-=w.price; state.bought++;
  // Er reicht es über den Tresen, in die Richtung, in der man steht.
  const dx=player.x-marketChar.x, dz=player.z-marketChar.z, l=Math.hypot(dx,dz)||1;
  spawnDrop(id,1,marketChar.x,marketChar.y+1.5,marketChar.z,dx/l*2.2,2.4,dz/l*2.2,.4);
  SND.craft();
  say(marketChar,ITEMS[id].nm+', bitte sehr!',3200);
  toast('🛒 '+ITEMS[id].ic+' '+ITEMS[id].nm+' gekauft.','good',2600);
  updateHUD();
  openMarket(marketChar);
}
function openMarket(c){
  const buys=Object.entries(PRICES).map(([id,p])=>
    `<div class="pc" data-want="${id}">${icon(id)}<span class="n">${p}</span></div>`).join('');
  const sells=SHOP.map(w=>{
    const can=state.money>=w.price;
    return `<div class="recipe${can?'':' off'}"><div class="ico">${icon(w.id)}</div>
      <div class="txt"><div class="nm">${ITEMS[w.id].nm} — ${w.price} €</div>
      <div class="ds">${w.txt}</div></div>
      <button data-buy="${w.id}"${can?'':' disabled'}>Kaufen</button></div>`;
  }).join('');
  showModal(`<h2>🛒 Manni-Markt</h2>
    <p style="text-align:center;font-size:13px">Kasse <b>${state.money} €</b> ·
    insgesamt verdient <b>${state.earned} €</b> von ${GOAL} €</p>
    <h3>Manni kauft — wirf es ihm hin (Q)</h3>
    <div class="patwrap"><div class="pat"
      style="grid-template-columns:repeat(${Object.keys(PRICES).length},30px)">${buys}</div>
      <div class="arrow">➜</div><div class="pc res">💶</div></div>
    <h3>Manni verkauft — nichts davon lässt sich bauen</h3>
    ${sells}
    <div class="btnrow"><button class="primary" data-act="close">Weiter</button></div>`);
}

const _wp=new THREE.Vector3();
// Ein bisschen Umhergehen: ein Ziel in der Nähe des Standplatzes, gemächlich
// hin, kurz stehen bleiben. Nur auf gleicher Höhe und nur auf freien Grund,
// sonst liefe der Jannes durch die Hauswand oder den Hang hinauf.
function wander(c,dt){
  if(!c.roam) return;
  if(c.tx==null){
    c.waitT-=dt;
    if(c.waitT>0) return;
    for(let k=0;k<8;k++){
      const a=rnd(0,6.28), d=rnd(.6,c.roam);
      const tx=c.home.x+Math.cos(a)*d, tz=c.home.z+Math.sin(a)*d;
      const y=surfaceAt(tx,tz);
      if(Math.abs(y-c.y)>1) continue;
      if(fillsAt(Math.round(tx),y,Math.round(tz))) continue;
      c.tx=tx; c.tz=tz; break;
    }
    return;
  }
  const dx=c.tx-c.x, dz=c.tz-c.z, d=Math.hypot(dx,dz);
  if(d<.12){ c.tx=null; c.waitT=rnd(2.5,7); return; }
  const st=Math.min(d,.85*dt);
  c.x+=dx/d*st; c.z+=dz/d*st;
  const y=surfaceAt(c.x,c.z);
  c.y=Math.abs(y-c.y)>2?y:lerp(c.y,y,Math.min(1,dt*9));
  c.group.position.set(c.x,c.y,c.z);
}
// Phase 5a: online ist der Server die alleinige Autorität über die
// Umherlauf-Position jedes Jannes/Manni (siehe wander() im Server-Kommentar
// von party/server.js) — derselbe "wilde", nicht geseedete Random-Walk ergäbe
// pro Client sonst binnen Sekunden auseinanderlaufende Positionen, exakt wie
// beim Phase-2-Spieler-Lerp. Offline bleibt wander() lokal maßgeblich wie
// bisher; online lerpt jeder Client nur noch Richtung des zuletzt per
// 'char-pos'/'welcome' empfangenen Ziels (c._netX/_netY/_netZ).
const CHAR_LERP=9;
function updateChars(dt){
  const f=Math.min(1,dt*CHAR_LERP);
  for(const c of CHARS){
    if(!c.group) continue;
    if(!isConnected()){
      wander(c,dt);
    }else if(c._netX!=null){
      c.x=lerp(c.x,c._netX,f);
      c.y=lerp(c.y,c._netY,f);
      c.z=lerp(c.z,c._netZ,f);
      c.group.position.set(c.x,c.y,c.z);
    }
    // Das Ladenschild hängt vor der Landschaft — quer über die Welt sichtbar
    // wäre es zu viel, in Rufweite ist es die Wegmarke zum Markt.
    if(c.tag) c.tag.visible=Math.hypot(player.x-c.x,player.z-c.z)<26;
    // Nach einem Handel überlegt er eine Weile und hat dann etwas Neues.
    // Phase 4b: online ist NICHT der Client, der das nächste Angebot
    // auswürfelt (das würde bei vier Clients vier verschiedene Rezepte
    // ergeben) — er meldet nur einmalig einen Anspruch an (t._claiming
    // verhindert erneutes Senden, während die Antwort noch aussteht, genau
    // wie p._claiming beim Topf-Claim) und wartet auf 'trader-offer'.
    const t=c.trade;
    if(t&&t.done&&Date.now()>=t.readyAt){
      if(isConnected()){
        if(!t._claiming){
          t._claiming=true;
          send({t:'trader-refresh',idx:traders.indexOf(c),round:t.round});
        }
      }else{
        makeOffer(c,t.round+1);
        if(c.trade.give&&Math.hypot(player.x-c.x,player.z-c.z)<20)
          say(c,'Mir ist was Neues eingefallen!',3600);
      }
    }
    c.sayT-=dt;
    if(c.sayT<=0){ c.sayT=rnd(22,45);
      if(Math.hypot(player.x-c.x,player.z-c.z)<14)
        say(c,c.trade?offerHint(c):pick(c.lines),4200);
    }
    if(c.bubbleT>0){ c.bubbleT-=dt; if(c.bubbleT<=0) c.bubble.visible=false; }
  }
}
// Wer steht vor mir? Wie beim Zuschlagen: in Blickrichtung und nah genug.
// Die Sichtweite kommt von außen, damit ein Block davor Vorrang behält.
function aimChar(maxD=4.2){
  camera.getWorldDirection(_rd);
  let best=null, bd=1e9;
  for(const c of CHARS){
    if(!c.group) continue;
    const dx=c.x-player.x, dz=c.z-player.z, d=Math.hypot(dx,dz)||1e-4;
    if(d>maxD||Math.abs(c.y-player.y)>2.5) continue;
    if((dx/d)*_rd.x+(dz/d)*_rd.z<.55) continue;
    if(d<bd){ bd=d; best=c; }
  }
  return best;
}
function updateBillboards(){
  for(const m of billboards){
    m.getWorldPosition(_wp);
    m.rotation.y=Math.atan2(camera.position.x-_wp.x,camera.position.z-_wp.z)-
      (m.parent?m.parent.rotation.y:0);
  }
  for(const m of mobs)
    m.mesh.rotation.y=Math.atan2(camera.position.x-m.x,camera.position.z-m.z);
}

// ------------------------------------------------------------------ Bennis (Gegner)
// Phase 5b: online, the server owns every Benni's position/hp/AI — this
// array holds BOTH kinds of entry (never mixed within one session, since
// spawning itself is gated on isConnected(), see updateNight): offline
// entries built by spawnMob() below (full local simulation, `id` absent),
// and online entries built by ensureMob() further down (pure render/lerp,
// `id` present, a number). Kept as one shared array rather than two
// separate collections because attack()'s targeting loop and
// updateBillboards()'s rotation loop both already iterate `mobs` uniformly
// by `.x`/`.z`/`.mesh` — splitting the collection would mean splitting (and
// keeping in sync) those two loops too, for no real benefit.
const mobs=[];
// h/asp/mesh construction shared by the offline spawnMob() and the online
// ensureMob() below — same Benni sprite plane either way, just built from
// local physics vs. a server snapshot.
function makeMobMesh(x,y,z){
  const h=1.95, asp=benniTex.image.width/benniTex.image.height;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(h*asp,h),
    new THREE.MeshLambertMaterial({map:benniTex,transparent:true,alphaTest:.5,side:THREE.DoubleSide}));
  mesh.position.set(x,y+h/2,z); mesh.castShadow=true;
  scene.add(mesh);
  return mesh;
}
// ---- Offline (Einzelspieler/kein Server) — volle lokale Simulation, wie bisher.
const mobCap=()=>Math.min(12,3+Math.floor(state.day*1.1));
function spawnMob(){
  if(!benniTex) return;
  let x,z,tries=0;
  do{
    const a=rnd(0,6.28), d=rnd(18,30);
    x=clamp(Math.round(player.x+Math.cos(a)*d),BOUND.x0+2,BOUND.x1-2);
    z=clamp(Math.round(player.z+Math.sin(a)*d),BOUND.z0+2,BOUND.z1-2);
  } while(litAt(x,z)&&++tries<12);
  if(litAt(x,z)) return;
  const y=surfaceAt(x,z);
  if(y<SEA-1) return;
  const mesh=makeMobMesh(x,y,z);
  mobs.push({x,z,y,hp:MOB_HP,mesh,atkCd:rnd(0,1),hurtT:0,bob:rnd(0,6),screamCd:rnd(3,7)});
}
function dropMob(m,i){
  scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose();
  mobs.splice(i<0?mobs.indexOf(m):i,1);
}
function damageMob(m,dmg){
  m.hp-=dmg; m.hurtT=.22;
  playSample('punch',.6);
  if(m.hp<=0){
    dropMob(m,-1);
    state.killed++;
    SND.mobDie();
  } else SND.hit();
}
// mobBlocked kommt aus shared/world.js (auch vom Server gebraucht).
// surfaceAt() rastet auf ganze Blöcke ein: ungebremst springt ein Benni bei
// jedem Zellwechsel und flackert an Kanten hin und her. Also nachziehen statt
// setzen — nur bei großen Sprüngen (Respawn) sofort.
function mobY(m,dt){
  const g=surfaceAt(m.x,m.z);
  m.y=Math.abs(g-m.y)>2.5?g:lerp(m.y,g,Math.min(1,dt*11));
  return m.y;
}
function updateMobs(dt){
  for(let i=mobs.length-1;i>=0;i--){
    // Ein Treffer kann zum Respawn führen, und der räumt die Umstehenden weg —
    // die Liste schrumpft also mitten in der Schleife.
    const m=mobs[i];
    if(!m) continue;
    if(m.hurtT>0) m.hurtT-=dt;
    m.mesh.material.color.setRGB(1,m.hurtT>0?.4:1,m.hurtT>0?.4:1);
    const dx=player.x-m.x, dz=player.z-m.z, d=Math.hypot(dx,dz)||1;
    if(!state.night){                          // Tagesanbruch: sie verziehen sich
      m.x-=dx/d*MOB_SPEED*1.6*dt; m.z-=dz/d*MOB_SPEED*1.6*dt;
      m.mesh.material.opacity=Math.max(0,(m.mesh.material.opacity??1)-dt*.7);
      m.mesh.material.transparent=true;
      if(d>44||m.mesh.material.opacity<=.02){ dropMob(m,i); continue; }
      m.mesh.position.set(m.x,mobY(m,dt)+.98,m.z);
      continue;
    }
    m.screamCd-=dt;
    if(d<14&&m.screamCd<=0){
      playSample(pick(['benni1','benni2','benni3']),.7);
      m.screamCd=rnd(8,14);
    }
    if(d>1.9){
      const my=surfaceAt(m.x,m.z);
      let nx=m.x+dx/d*MOB_SPEED*dt, nz=m.z+dz/d*MOB_SPEED*dt;
      if(mobBlocked(nx,nz,my)){                // an Wänden und Steilhängen entlang
        nx=m.x+(dz/d)*MOB_SPEED*dt; nz=m.z-(dx/d)*MOB_SPEED*dt;
        if(mobBlocked(nx,nz,my)){ nx=m.x; nz=m.z; }
      }
      m.x=clamp(nx,BOUND.x0,BOUND.x1); m.z=clamp(nz,BOUND.z0,BOUND.z1);
      m.bob+=dt*7;
    } else {
      m.atkCd-=dt;
      if(m.atkCd<=0){
        m.atkCd=MOB_ATK_CD;
        // Nur auf ähnlicher Höhe: von einem Turm aus bist du sicher.
        if(Math.abs(surfaceAt(m.x,m.z)-player.y)<2.2) hurtPlayer(MOB_DMG);
      }
    }
    m.mesh.position.set(m.x,mobY(m,dt)+.98+Math.abs(Math.sin(m.bob))*.06,m.z);
  }
}
// ---- Online (Server verbunden) — reines Rendern/Lerpen, exakt das Muster
// von ensureRemotePlayer/removeRemotePlayer/updateRemotePlayers (Phase 2),
// nur nach Benni-`id` statt Spieler-`pid` einsortiert. Der Server schickt
// keinen `bob`-Hüpfwert mit (siehe mob-state weiter unten) — anders als
// offline hüpfen vernetzte Bennis darum nicht beim Laufen, eine akzeptierte
// kosmetische Vereinfachung.
function ensureMob(id,x,y,z){
  let m=mobs.find(mm=>mm.id===id);
  if(m) return m;
  const mesh=makeMobMesh(x,y,z);
  m={id,x,y,z,hp:MOB_HP,hurtT:false,mesh,target:{x,y,z}};
  mobs.push(m);
  return m;
}
function removeMob(id){
  const i=mobs.findIndex(m=>m.id===id);
  if(i<0) return;                        // schon weg — sicherer No-op (siehe mob-dead-Handler)
  dropMob(mobs[i],i);
}
function updateMobsOnline(dt){
  const f=Math.min(1,dt*10);
  for(const m of mobs){
    if(m.id==null) continue;             // eine (im selben Lauf eigentlich nie gemischte) Offline-Leiche
    m.x=lerp(m.x,m.target.x,f);
    m.y=lerp(m.y,m.target.y,f);
    m.z=lerp(m.z,m.target.z,f);
    m.mesh.position.set(m.x,m.y+.98,m.z);
    m.mesh.material.color.setRGB(1,m.hurtT?.4:1,m.hurtT?.4:1);
  }
}
function hurtPlayer(dmg){
  if(state.paused||player.invT>0) return;
  player.hp=clamp(player.hp-dmg,0,player.maxhp);
  player.hurtT=.35;
  player.invT=.5;                        // kurze Unverwundbarkeit wie im Vorbild
  SND.hurt();
  if(player.hp<=0) respawn();
  updateHUD();
}
function respawn(){
  state.deaths++;
  player.hp=player.maxhp; player.food=Math.max(6,player.food);
  const s=safeSpot();
  player.x=s.x; player.z=s.z; player.vy=0; player.onGround=true;
  player.y=player.viewY=player.fallFrom=s.y;
  player.invT=2.5;                       // Gnadenfrist, sonst campen Bennis den Punkt
  // Nur offline: die Umstehenden lokal wegräumen. Online gehören Bennis dem
  // Server (andere Spieler sehen sie ja weiter) — hier lokal entfernen würde
  // nur eine unnötige Mesh-Neuerstellung beim nächsten mob-state auslösen,
  // ohne den Server je etwas davon wissen zu lassen.
  if(!isConnected())
    for(let i=mobs.length-1;i>=0;i--)
      if(Math.hypot(mobs[i].x-s.x,mobs[i].z-s.z)<10) dropMob(mobs[i],i);
  toast('💀 Du bist gestorben. Dein Kram bleibt bei dir.','bad',3600);
  updateHUD();
}

// ------------------------------------------------------------------ Zielerfassung
// Marsch durchs Blockraster statt Raycast gegen zehntausende Flächen.
const _rd=new THREE.Vector3();
function rayPick(){
  camera.getWorldDirection(_rd);
  const o=camera.position;
  const px=o.x+.5, py=o.y, pz=o.z+.5;
  let cx=Math.floor(px), cy=Math.floor(py), cz=Math.floor(pz);
  if(blockAt(cx,cy,cz)) return null;
  const sx=Math.sign(_rd.x), sy=Math.sign(_rd.y), sz=Math.sign(_rd.z);
  const tdx=sx?Math.abs(1/_rd.x):Infinity,
        tdy=sy?Math.abs(1/_rd.y):Infinity,
        tdz=sz?Math.abs(1/_rd.z):Infinity;
  let tmx=sx?(sx>0?cx+1-px:cx-px)/_rd.x:Infinity,
      tmy=sy?(sy>0?cy+1-py:cy-py)/_rd.y:Infinity,
      tmz=sz?(sz>0?cz+1-pz:cz-pz)/_rd.z:Infinity;
  let t=0, nx=0, ny=0, nz=0;
  for(let step=0;step<80;step++){
    if(tmx<tmy&&tmx<tmz){ t=tmx; cx+=sx; tmx+=tdx; nx=-sx; ny=0; nz=0; }
    else if(tmy<tmz){     t=tmy; cy+=sy; tmy+=tdy; nx=0; ny=-sy; nz=0; }
    else{                 t=tmz; cz+=sz; tmz+=tdz; nx=0; ny=0; nz=-sz; }
    if(t>REACH) return null;
    const hit=blockAt(cx,cy,cz);
    if(hit) return {type:hit,cell:{x:cx,y:cy,z:cz},dist:t,place:{x:cx+nx,y:cy+ny,z:cz+nz}};
  }
  return null;
}
let target=null, aimed=null;
function updateTarget(){
  target=rayPick();
  // Ein Bewohner zählt nur, wenn kein Block näher steht — sonst redet man
  // durch die Hauswand hindurch.
  aimed=aimChar(target?Math.min(4.2,target.dist+.5):4.2);
  // Nur Bedienbares bekommt eine Beschriftung — der Rest spricht für sich.
  const tip=el('tip');
  const b=target?BLOCKS[target.type]:null;
  const atPot=!aimed&&b&&b.use==='pot'?target.cell:null;
  updatePotPanel(atPot);
  const txt=aimed?aimed.name+(aimed.trade&&!aimed.trade.done?' — Rechtsklick zum Tauschen':' — Rechtsklick')
           :atPot?potTip(atPot)
           :b&&b.use?b.nm+' — Rechtsklick':'';
  if(tip.textContent!==txt) tip.textContent=txt;
  el('cross').classList.toggle('hot',!!aimed||(!!target&&!!BLOCKS[target.type].use));
}

// ------------------------------------------------------------------ Abbauen & Setzen
// Die Risse liegen als eigener Würfel knapp über dem Block. Ein Hauch größer
// und mit polygonOffset, sonst streiten sich die beiden Flächen um die Tiefe
// und das Bild flimmert.
const crackMat=new THREE.MeshBasicMaterial({
  transparent:true, depthWrite:false, polygonOffset:true,
  polygonOffsetFactor:-4, polygonOffsetUnits:-4
});
const crackMesh=new THREE.Mesh(new THREE.BoxGeometry(1.004,1.004,1.004),crackMat);
crackMesh.visible=false; crackMesh.frustumCulled=false; crackMesh.renderOrder=2;
scene.add(crackMesh);
let crackStage=-1;
function showCrack(cell,frac,type){
  if(!cell||frac<=0){
    if(crackMesh.visible){ crackMesh.visible=false; crackStage=-1; }
    return;
  }
  const i=clamp(Math.floor(frac*CRACKS.length),0,CRACKS.length-1);
  if(i!==crackStage){ crackStage=i; crackMat.map=CRACKS[i]; crackMat.needsUpdate=true; }
  // Um die kleinen Gewächse herum sitzen die Risse genau da, wo sie stehen:
  // unten in der Zelle, wenn sie wachsen, oben, wenn sie hängen.
  const b=BLOCKS[type], s=b?.size||1;
  crackMesh.position.set(cell.x,
    !b?.cross?cell.y+.5:b.sit?cell.y+s/2:cell.y+1-s/2, cell.z);
  crackMesh.scale.setScalar(s);
  crackMesh.visible=true;
}

let mining=false, mineT=0, mineKey='';
function breakSpeed(type){
  const b=BLOCKS[type];
  let f=1;
  if(b.axe&&hasTool('axe')) f=3.2;
  else if(b.pick&&hasTool('pick')) f=3.5;
  else if(b.pick) f=.55;                     // ohne Spitzhacke geht Stein zäh
  return f;
}
function updateMining(dt){
  const bar=el('mine');
  if(!mining||!target||state.paused){
    bar.style.display='none'; mineT=0; mineKey=''; showCrack(null,0); return;
  }
  const t=target.type, b=BLOCKS[t];
  if(b.noBreak){ bar.style.display='none'; showCrack(null,0); return; }
  // Was als Billboard im Gelände steht — Frucht, Pilz, Pfeffer —, ist mit
  // einem Griff gepflückt: kein Halten, kein Balken, keine Risse. Beim
  // Drüberstreichen fällt eines nach dem anderen.
  if(b.cross){
    bar.style.display='none'; mineT=0; mineKey=''; showCrack(null,0);
    breakBlock(target.cell.x,target.cell.y,target.cell.z,t);
    return;
  }
  const k=K(target.cell.x,target.cell.y,target.cell.z);
  if(k!==mineKey){ mineKey=k; mineT=0; }
  mineT+=dt*breakSpeed(t);
  if(mineT%.22<dt*breakSpeed(t)) SND.dig();
  bar.style.display='block';
  bar.firstElementChild.style.width=clamp(mineT/b.hard,0,1)*100+'%';
  showCrack(target.cell,mineT/b.hard,t);
  if(mineT>=b.hard){
    mineT=0; mineKey='';
    showCrack(null,0);
    breakBlock(target.cell.x,target.cell.y,target.cell.z,t);
  }
}
function breakBlock(x,y,z,t){
  const b=BLOCKS[t];
  // Ein Topf voller Zutaten gibt sie beim Abbauen wieder her.
  if(t==='pot'){
    const p=pots.get(K(x,y,z));
    if(p){
      for(const it of p.items) spawnDrop(it.id,it.n,x,y+.4,z,rnd(-1,1),1.8,rnd(-1,1));
      pots.delete(K(x,y,z));
    }
  }
  setBlock(x,y,z,null);
  state.mined++;
  if(b.drop==='dominik') playSample('dominik_break',.7)||SND.pop();
  else SND.pop();
  let drop=b.drop;
  if(t==='leaf'){                            // Laub gibt manchmal einen Stock
    if(Math.random()<.22) drop='stick';
  }
  // Nichts springt mehr direkt in den Rucksack: es fällt heraus und liegt da.
  if(drop) spawnDrop(drop,1,x,y+.3,z,rnd(-.7,.7),1.6,rnd(-.7,.7),.25);
  // Ernte gibt Saatgut. Auf dem Acker gezogen fällt mehr ab als in der
  // Wildnis — sonst käme man vom Sammeln nie zum Anbauen.
  const sd=SEED_OF[t];
  if(sd){
    const farmed=blockAt(x,y-1,z)==='till';
    let n=farmed?1:0;
    if(Math.random()<(farmed?.7:.45)) n++;
    if(n) spawnDrop(sd,n,x,y+.3,z,rnd(-.7,.7),1.4,rnd(-.7,.7),.25);
  }
  growing.delete(K(x,y,z));
  // Baumkronen ohne Stamm fallen nicht — Laub bleibt hängen, wie im Vorbild.
  updateHUD();
}
function canPlaceAt(x,y,z){
  if(x<BOUND.x0||x>BOUND.x1||z<BOUND.z0||z>BOUND.z1) return false;
  if(y<-8||y>60) return false;
  if(blockAt(x,y,z)) return false;
  // nicht in den Spieler hinein bauen
  const py=player.y;
  if(Math.abs(x-player.x)<.85&&Math.abs(z-player.z)<.85&&y+1>py&&y<py+1.8) return false;
  for(const m of mobs)
    if(Math.abs(x-m.x)<.85&&Math.abs(z-m.z)<.85&&Math.abs(y-surfaceAt(m.x,m.z))<1.6) return false;
  return true;
}
function useRight(){
  if(state.paused) return;
  const id=heldId(), it=id?ITEMS[id]:null;
  // 1. Ansprechen geht vor allem anderen — sonst isst man vor dem Händler
  // seine eigene Ware auf.
  if(aimed){
    if(aimed.trade) return openTrade(aimed);
    if(aimed.market) return openMarket(aimed);
    say(aimed,pick(aimed.lines),4200);
    return;
  }
  // 2. Kiste, Werkbank, Kochtopf bedienen
  if(target&&BLOCKS[target.type].use){
    const u=BLOCKS[target.type].use;
    if(u==='chest') return openChest(target.cell);
    if(u==='bench') return openCraft('bench');
    if(u==='pot')   return usePot(target.cell);
  }
  // 3. Hacken und säen — vor dem Essen, sonst isst man die Saat auf
  if(it&&it.hoe&&target){ till(target.cell); return; }
  if(it&&it.seed&&target){
    if(plantSeed(target.cell,it)) consumeHeld(); else SND.fail();
    updateHUD();
    return;
  }
  // 4. Essen
  if(it&&it.food){
    if(player.food>=player.maxfood&&player.hp>=player.maxhp){ toast('😋 Du bist satt.','',1200); return; }
    player.food=clamp(player.food+it.food,0,player.maxfood);
    if(id==='soup') player.hp=player.maxhp;
    consumeHeld(); SND.eat(); updateHUD();
    return;
  }
  // 5. Fackel setzen
  if(it&&it.torch&&target){
    const p=target.place;
    if(!canPlaceAt(p.x,p.y,p.z)||!blockAt(p.x,p.y-1,p.z)) return;
    torches.push({x:p.x,y:p.y,z:p.z});
    emitTorches(); consumeHeld(); SND.place(); updateHUD();
    if(isConnected()) send({t:'torch',x:p.x,y:p.y,z:p.z});
    return;
  }
  // 6. Block setzen
  if(it&&it.block&&target){
    const p=target.place;
    if(!canPlaceAt(p.x,p.y,p.z)) return;
    setBlock(p.x,p.y,p.z,it.block);
    consumeHeld(); state.placed++;
    SND.place(); updateHUD();
  }
}
function attack(){
  if(player.atkCd>0||state.paused) return;
  player.atkCd=.45;
  el('cross').classList.add('swing');
  setTimeout(()=>el('cross').classList.remove('swing'),110);
  SND.swing();
  const dir=new THREE.Vector3(); camera.getWorldDirection(dir);
  let best=null,bestD=1e9;
  for(const m of mobs){
    const dx=m.x-player.x, dz=m.z-player.z, d=Math.hypot(dx,dz);
    if(d>3.4) continue;
    const dot=(dx/d)*dir.x+(dz/d)*dir.z;
    if(dot<.4) continue;
    if(d<bestD){ bestD=d; best=m; }
  }
  if(best){
    // Online: nur die Trefferabsicht melden, hp NICHT lokal anfassen — die
    // tatsächliche Änderung kommt einen Tick später über mob-state/mob-dead
    // zurück (siehe die Handler weiter unten). Eine bewusste, kleine
    // Latenz, kein Bug.
    if(isConnected()){ send({t:'mob-hit',id:best.id,dmg:heldDmg()}); return true; }
    damageMob(best,heldDmg());
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ Truhen
let openChestCell=null;
function openChest(cell){
  const c=chests.get(K(cell.x,cell.y,cell.z));
  if(!c) return;
  if(!c.opened){ c.opened=true; state.chests++; }
  openChestCell=cell;
  SND.chest();
  renderChest();
}
function renderChest(){
  const c=chests.get(K(openChestCell.x,openChestCell.y,openChestCell.z));
  let h='<h2>🧰 Truhe</h2>';
  if(!c.items.length) h+='<p style="text-align:center;opacity:.7">Leer.</p>';
  else{
    h+='<div class="invgrid">'+c.items.map((it,i)=>
      `<div class="cell" data-chest="${i}">${icon(it.id)}<span class="n">${it.n>1?it.n:''}</span></div>`
    ).join('')+'</div>';
    h+='<p style="font-size:11.5px;opacity:.7;text-align:center">Anklicken zum Mitnehmen</p>';
  }
  h+='<div class="btnrow">'+(c.items.length?'<button data-act="takeall">Alles nehmen</button>':'')+
     '<button class="primary" data-act="close">Schließen</button></div>';
  showModal(h,true);
  updateItemTip();
}
// Truhen-Entnahme fasst zwei gekoppelte Wirkungen an: den gemeinsamen
// Truhenbestand UND das eigene (lokale, unsynchronisierte) Inventar. Würden
// zwei Spieler fast gleichzeitig denselben Stapel anklicken und jeder
// optimistisch lokal anwenden, könnten beide sich den vollen Bestand
// gutschreiben, obwohl er nur einmal da war — echte Vervielfältigung.
// Darum entscheidet ausschließlich der SERVER, wieviel eine Anfrage wirklich
// bekommt (chest-take → chest-sync), und der anfragende Client rührt sein
// Inventar erst an, wenn die Antwort da ist (siehe on('chest-sync',...)).
// Offline/Einzelspieler fällt auf das alte Direkt-Verhalten zurück.
function takeFromChest(i,one){
  const c=chests.get(K(openChestCell.x,openChestCell.y,openChestCell.z));
  const it=c.items[i]; if(!it) return;
  const want=one?1:it.n;                     // rechts nimmt einzeln aus der Truhe
  if(isConnected()){
    send({t:'chest-take',x:openChestCell.x,y:openChestCell.y,z:openChestCell.z,id:it.id,n:want});
    return;
  }
  const rest=give(it.id,want);
  if(rest===want){ toast('🎒 Inventar voll.','warn',1400); return; }
  it.n-=want-rest;
  if(it.n<=0) c.items.splice(i,1);
  SND.tap();
  updateHUD();
  renderChest();
}

// ------------------------------------------------------------------ Rezeptbuch
// Gelernt wird beim Handeln, und gezeigt wird es als Bild: das Muster, wie es
// ins Raster gehört, und daneben, was dabei herauskommt. Kein Fließtext.
function learnRecipe(id,from){
  const r=RECIPES.find(x=>x.id===id);
  if(!r) return;
  if(!known.has(id)){
    known.add(id);
    SND.book();
    toast('📜 Rezept gelernt: '+ITEMS[r.out[0]].nm,'good',2600);
  }
  updateHUD();
  recipeCard(r,from);
}
// Gleiche Zutaten zusammenfassen: neun Kästchen in einer Reihe liest niemand,
// „3× 🍑 · 2× 🍄 · …“ dagegen auf einen Blick.
const groupCells=list=>{
  const n={};
  for(const id of list) n[id]=(n[id]||0)+1;
  return Object.entries(n);
};
// Ein Rezept als Bild: links, was hineinkommt, rechts, was herauskommt.
// Bei einem Muster steht es im Raster, bei einer Zutatenliste nebeneinander.
function patHTML(r){
  const cells=r.shapeless
    ? groupCells(r.shapeless).map(([id,n])=>
        `<div class="pc" data-want="${id}">${icon(id)}${n>1?`<span class="n">${n}</span>`:''}</div>`)
    : null;
  const rows=cells?null:patRows(r);
  const w=cells?cells.length:Math.max(...rows.map(x=>x.length));
  let g='';
  if(cells) g=cells.join('');
  else for(const row of rows) for(let x=0;x<w;x++)
    g+=`<div class="pc">${row[x]?icon(row[x]):''}</div>`;
  const note=r.station==='pot'?'In den 🍲 Kochtopf werfen — Reihenfolge egal.'
            :r.shapeless?'Anordnung egal.':'';
  return `<div class="patwrap">
    <div class="pat" style="grid-template-columns:repeat(${w},30px)">${g}</div>
    <div class="arrow">➜</div>
    <div class="pc res">${icon(r.out[0])}${r.out[1]>1?`<span class="n">${r.out[1]}</span>`:''}</div>
    </div>`+
    (note?`<p style="font-size:11.5px;opacity:.7;text-align:center">${note}</p>`:'');
}
function recipeCard(r,from){
  const rows=patRows(r);
  const st=Math.max(rows.length,...rows.map(x=>x.length))>2
    ?(r.station==='pot'?'🍲 Kochtopf':'🛠️ Werkbank'):'';
  showModal(`<h2>📜 ${ITEMS[r.out[0]].nm}</h2>${patHTML(r)}
    <p style="font-size:12.5px;opacity:.85;text-align:center">
      ${st?st+' · ':''}steht ab jetzt im Rezeptbuch — <b>E</b> öffnet es.</p>
    <div class="btnrow"><button class="primary" data-act="close">${from?'Danke!':'Weiter'}</button></div>`);
}

// ------------------------------------------------------------------ Handeln
// Der Jannes zeigt, was er will, und was er dafür hergibt: erst ein
// verdecktes Blatt, nach dem Tausch das Rezept selbst.
let tradePartner=null;
function tradeOK(t){ return t.want.every(([id,n])=>countOf(id)>=n); }
function openTrade(c){
  const t=c.trade;
  if(t.done) return recipeCard(RECIPES.find(x=>x.id===t.give),c.name);
  // Nichts mehr anzubieten: das kommt vor, wenn man schon alles kennt.
  if(!t.give) return showModal(`<h2>${c.name}</h2>
    <p style="text-align:center;font-size:13px">${offerAsk(c)}</p>
    <div class="btnrow"><button class="primary" data-act="close">Weiter</button></div>`);
  tradePartner=c;
  const ok=tradeOK(t);
  showModal(`<h2>${c.name}</h2>
    <p style="text-align:center;font-size:13px">${offerAsk(c)}</p>
    <div class="patwrap">
      <div class="pat" style="grid-template-columns:repeat(${t.want.length},30px)">`+
      t.want.map(([id,n])=>`<div class="pc" data-want="${id}">${icon(id)}<span class="n">${n}</span></div>`).join('')+
     `</div>
      <div class="arrow">➜</div>
      <div class="pc res"><img class="ic" src="./sprites/items/page1.png" alt="📜"></div>
    </div>
    <div class="btnrow">
      <button data-act="close">Später</button>
      <button class="primary" data-act="trade"${ok?'':' disabled'}>${ok?'Tauschen':'Das hast du noch nicht'}</button>
    </div>`);
}
// Phase 4b: online ist das Abschließen eines Handels genau wie ein
// Truhen-Take server-arbitriert — der Server entscheidet, WER genau diesen
// einen Handel für sich verbucht (siehe on('trade-result',...) oben), damit
// zwei gleichzeitige "Tauschen"-Klicks auf denselben Jannes nicht beide
// erfolgreich sind und die Angebots-Buchführung (done/round/readyAt)
// doppelt weiterzählt. Zutaten werden darum NICHT hier abgezogen, sondern
// erst bei der Serverantwort (die auch dem Verlierer eine Antwort gibt,
// statt sein UI hängen zu lassen).
function doTrade(){
  const c=tradePartner;
  if(!c||c.trade.done||!c.trade.give) return;
  const t=c.trade;
  if(!tradeOK(t)){ SND.fail(); return; }
  if(isConnected()){
    send({t:'trade-complete',idx:traders.indexOf(c)});
    return;
  }
  for(const [id,n] of t.want) take(id,n);
  // Er braucht danach eine Weile, bis ihm das nächste Rezept einfällt.
  t.done=true; t.readyAt=Date.now()+REFRESH*1000; state.trades++;
  SND.chest();
  say(c,'Danke. Schau her — so geht das.',5000);
  learnRecipe(t.give,c.name);
}

// ------------------------------------------------------------------ Sieg
function winGame(){
  if(state.won) return;
  state.won=true;
  SND.win();
  showModal(`<h2>💶 ${GOAL.toLocaleString('de-DE')} €!</h2>
    <p>Die Kasse stimmt. Vom ersten Dominik für einen Euro bis zum letzten Topf Suppe —
    das Fest hat sich gerechnet.</p>
    <p style="font-size:12px;opacity:.8">💶 ${state.earned} € verdient · 🛒 ${state.sold} Stück verkauft ·
    ${state.bought}× eingekauft · ⛏️ ${state.mined} Blöcke abgebaut · 🧱 ${state.placed} gesetzt ·
    🤝 ${state.trades} Handel · 🧰 ${state.chests} Truhen · 🌱 ${state.planted} gepflanzt ·
    📜 ${known.size}/${RECIPES.length} Rezepte ·
    🌙 Tag ${state.day} · 💀 ${state.deaths}× gestorben</p>
    <div class="btnrow"><button class="primary" data-act="close">Weiterspielen</button></div>`);
}

// ------------------------------------------------------------------ Fenster
const modal=el('modal'), mbox=el('mbox'), mside=el('mside');
let craftStation=null;
// side ist die Rezeptleiste neben dem Fenster; ohne sie bleibt sie weg.
function showModal(html,keep,side){
  const sc=mbox.scrollTop, ss=mside.scrollTop;
  mbox.innerHTML=html; modal.classList.remove('hidden'); state.paused=true;
  mside.innerHTML=side||'';
  mside.classList.toggle('hidden',!side);
  mbox.scrollTop=keep?sc:0;              // beim Umsortieren nicht nach oben springen
  if(keep) mside.scrollTop=ss;
  if(document.pointerLockElement) document.exitPointerLock();
}
function hideModal(){
  clearGrid();                           // was im Raster liegt, gehört dem Spieler
  dropCarry();
  modal.classList.add('hidden'); state.paused=false; openChestCell=null; craftStation=null;
  tradePartner=null; mining=false;
}
const modalOpen=()=>!modal.classList.contains('hidden');

// ------------------------------------------------------------------ Handwerksfeld
// Immer neun Zellen, zeilenweise und drei breit. Im Inventar sind nur 0,1,3,4
// sichtbar — dadurch passt kein Muster hinein, das breiter oder höher als zwei
// ist, und die Werkbank braucht keine Sonderregel.
const grid=Array(9).fill(null);
let gridN=2;
const gridCells=()=>gridN===3?[0,1,2,3,4,5,6,7,8]:[0,1,3,4];
function clearGrid(){
  for(let i=0;i<9;i++){
    const s=grid[i]; if(!s) continue;
    grid[i]=null;
    giveOrDrop(s.id,s.n);              // was nicht mehr passt, liegt vor den Füßen
  }
}
// Belegte Zellen auf den kleinsten Ausschnitt zuschneiden, damit dasselbe
// Muster überall im Raster zählt.
function gridShape(){
  let x0=3,x1=-1,y0=3,y1=-1;
  for(let y=0;y<3;y++) for(let x=0;x<3;x++){
    if(!grid[y*3+x]) continue;
    x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y);
  }
  if(x1<0) return null;
  const rows=[];
  for(let y=y0;y<=y1;y++){
    const row=[];
    for(let x=x0;x<=x1;x++) row.push(grid[y*3+x]?.id||null);
    rows.push(row);
  }
  return rows;
}
const sameRows=(a,b)=>a.length===b.length&&a[0].length===b[0].length&&
  a.every((r,y)=>r.every((v,x)=>v===b[y][x]));
const mirrorRows=rows=>rows.map(r=>r.slice().reverse());
function matchRecipe(){
  const rows=gridShape();
  if(!rows) return null;
  const ids=grid.filter(Boolean).map(s=>s.id).sort();
  for(const r of RECIPES){
    if(r.station&&r.station!==craftStation) continue;
    if(r.secret&&!known.has(r.id)) continue;          // die Suppe nur mit Rezept
    if(r.shapeless){
      const w=r.shapeless.slice().sort();
      if(w.length===ids.length&&w.every((v,i)=>v===ids[i])) return r;
    }else{
      const p=patRows(r);
      if(sameRows(p,rows)||sameRows(mirrorRows(p),rows)) return r;
    }
  }
  return null;
}
function craftFromGrid(){
  const r=matchRecipe();
  if(!r){ SND.fail(); return false; }
  for(let i=0;i<9;i++){ const s=grid[i]; if(s&&--s.n<=0) grid[i]=null; }
  giveOrDrop(r.out[0],r.out[1]);
  state.crafted++;
  SND.craft();
  const fresh=!known.has(r.id);
  // Phase 4b: known ist team-weit — nur beim ECHTEN Erstfund gibt es etwas zu
  // verbreiten (sonst würde jedes weitere Craften desselben Rezepts unnötig
  // Netzwerkverkehr erzeugen).
  if(fresh){ known.add(r.id); if(isConnected()) send({t:'learn',id:r.id}); }
  updateHUD();
  if(r.id==='soup'&&!state.won){ winGame(); return true; }
  toast(fresh?'📜 Rezept entdeckt: '+ITEMS[r.out[0]].nm
             :ITEMS[r.out[0]].ic+' '+ITEMS[r.out[0]].nm+' gebaut.','good',fresh?2600:1600);
  renderCraft();
  return true;
}
// Aus dem Rezeptbuch: Zutaten aus dem Inventar ins Raster legen.
// ------------------------------------------------------------------ Rezeptleiste
// Ein Rezept als Bild: das Muster, wie es ins Raster gehört, und daneben, was
// dabei herauskommt. Absichtlich ohne Knopf — das Hinlegen ist das Spiel.
// Fehlt Material, steht es blass da.
function recCard(r){
  const rows=patRows(r);
  const w=Math.max(...rows.map(x=>x.length));
  const cells=r.shapeless
    ? groupCells(r.shapeless).map(([id,n])=>
        `<div class="pc" data-want="${id}">${icon(id)}${n>1?`<span class="n">${n}</span>`:''}</div>`)
    : null;
  let g='';
  if(cells) g=cells.join('');
  else for(const row of rows) for(let x=0;x<w;x++)
    g+=`<div class="pc">${row[x]?icon(row[x]):''}</div>`;
  const out=ITEMS[r.out[0]];
  return `<div class="rec${haveAll(rows)?'':' off'}">
    <div class="rt">${out.nm}${r.out[1]>1?' ×'+r.out[1]:''}</div>
    <div class="patwrap">
      <div class="pat" style="grid-template-columns:repeat(${cells?cells.length:w},22px)">${g}</div>
      <div class="arrow">➜</div>
      <div class="pc res" data-want="${r.out[0]}">${icon(r.out[0])}</div>
    </div></div>`;
}
// Neben dem Fenster steht, was sich hier bauen lässt: im Rucksack nur, was
// ins Zweierraster passt, an der Werkbank auch alles Größere. Das Sperrige
// zuerst — deswegen steht man ja an der Bank.
function sideHTML(){
  const fits=r=>{
    if(r.station||!known.has(r.id)) return false;
    const rows=patRows(r);
    return rows.length<=gridN&&Math.max(...rows.map(x=>x.length))<=gridN;
  };
  const size=r=>{ const rows=patRows(r); return Math.max(rows.length,...rows.map(x=>x.length)); };
  const list=RECIPES.filter(fits).sort((a,b)=>size(b)-size(a)||a.rank-b.rank);
  const unknown=RECIPES.filter(r=>!known.has(r.id)).length;
  return `<h3>📜 ${gridN===3?'An der Werkbank':'Im Rucksack'}</h3>`+
    (list.length?list.map(recCard).join('')
      :'<p class="sidenote">Hier lässt sich noch nichts bauen.</p>')+
    (gridN===2?'<p class="sidenote">Alles, was breiter oder höher als zwei ist, '+
      'geht nur an der 🛠️ Werkbank.</p>':'')+
    (unknown?'<p class="sidenote">'+unknown+' Rezept'+(unknown===1?'':'e')+
      ' kennst du noch nicht — die zeigen dir die Jannessen.</p>':'');
}

// ------------------------------------------------------------------ Fensterinhalt
// Der aufgenommene Stapel hängt am Mauszeiger. Links nimmt und legt alles,
// rechts genau ein Stück — damit lässt sich ein Muster auslegen, ohne den
// ganzen Stapel wieder auseinandersortieren zu müssen.
let carry=null;
const refGet=r=>r.k==='g'?grid[r.i]:slots[r.i];
const refSet=(r,v)=>{ if(r.k==='g') grid[r.i]=v; else slots[r.i]=v; };
function clickCell(ref,one){
  const cur=refGet(ref);
  if(!carry){
    if(!cur) return;
    if(one){ carry={id:cur.id,n:1}; if(--cur.n<=0) refSet(ref,null); }
    else { carry=cur; refSet(ref,null); }
  } else if(!cur){
    if(one){ refSet(ref,{id:carry.id,n:1}); if(--carry.n<=0) carry=null; }
    else { refSet(ref,carry); carry=null; }
  } else if(cur.id===carry.id){
    const t=Math.min(one?1:carry.n,STACK-cur.n);
    if(!t) return;
    cur.n+=t; carry.n-=t; if(carry.n<=0) carry=null;
  } else if(one) return;                 // getauscht wird nur mit voller Hand
  else { refSet(ref,carry); carry=cur; }
  SND.tap(); updateHUD(); renderCraft();
}
function dropCarry(){                    // beim Schließen zurück in den Rucksack
  if(!carry) return;
  giveOrDrop(carry.id,carry.n);
  carry=null;
  drawCarry();
}
// ------------------------------------------------------------------ Schwebehilfe
// Der Name kommt nicht aus dem Markup, sondern beim Zeigen frisch aus den
// Daten — sonst müsste jede Zelle ihn doppelt führen und könnte veralten.
const tipEl=el('itip');
function itemUnder(node){
  if(!node) return null;
  const d=node.dataset;
  if(d.slot!=null) return slots[+d.slot]?.id||null;
  if(d.bar!=null) return slots[+d.bar]?.id||null;
  if(d.g!=null) return grid[+d.g]?.id||null;
  if(d.want) return d.want;
  if(d.chest!=null&&openChestCell){
    const c=chests.get(K(openChestCell.x,openChestCell.y,openChestCell.z));
    return c?.items[+d.chest]?.id||null;
  }
  if(d.act==='craft') return matchRecipe()?.out[0]||null;
  return null;
}
function updateItemTip(){
  // Beim Tragen hängt der Stapel schon am Zeiger, da stört der Kasten nur.
  if(carry||document.pointerLockElement){ tipEl.style.display='none'; return; }
  const node=document.elementFromPoint?.(mouseX,mouseY);
  const cell=node&&node.closest?.('[data-slot],[data-bar],[data-g],[data-chest],[data-want],[data-act]');
  const id=itemUnder(cell);
  if(!id){ tipEl.style.display='none'; return; }
  const note=itemNote(id);
  tipEl.innerHTML=`<b>${ITEMS[id].nm}</b>`+(note?`<i>${note}</i>`:'');
  tipEl.style.display='block';
  // An der rechten oder unteren Kante nach innen klappen
  const w=tipEl.offsetWidth, h=tipEl.offsetHeight;
  const x=mouseX+16+w>innerWidth?mouseX-16-w:mouseX+16;
  const y=mouseY+18+h>innerHeight?mouseY-10-h:mouseY+18;
  tipEl.style.transform=`translate(${Math.max(4,x)}px,${Math.max(4,y)}px)`;
}

const carryEl=el('carry');
let mouseX=0, mouseY=0;
function moveCarry(){ carryEl.style.transform=`translate(${mouseX-22}px,${mouseY-22}px)`; }
function drawCarry(){
  if(!carry){ carryEl.style.display='none'; return; }
  carryEl.innerHTML=icon(carry.id)+(carry.n>1?`<span class="n">${carry.n}</span>`:'');
  carryEl.style.display='flex';
  moveCarry();
}
const stackHTML=s=>s?icon(s.id)+`<span class="n">${s.n>1?s.n:''}</span>`:'';
function craftHTML(){
  const r=matchRecipe();
  let h=`<div class="craft"><div class="cgrid c${gridN}">`;
  h+=gridCells().map(i=>`<div class="cell" data-g="${i}">${stackHTML(grid[i])}</div>`).join('');
  h+='</div><div class="arrow">➜</div>';
  h+=`<div class="cell res${r?'':' empty'}" data-act="craft">`+
     (r?icon(r.out[0])+`<span class="n">${r.out[1]>1?r.out[1]:''}</span>`:'')+'</div></div>';
  if(gridN===2) h+='<p class="hint">2×2 — Größeres geht nur an der 🛠️ Werkbank.</p>';
  return h;
}
function invGrid(){
  const cell=(i,cls)=>
    `<div class="cell ${cls}" data-slot="${i}">${stackHTML(slots[i])}</div>`;
  let h='<div class="invgrid">';
  for(let i=NBAR;i<NSLOT;i++) h+=cell(i,'');
  h+='</div><h3>Leiste</h3><div class="invgrid">';
  for(let i=0;i<NBAR;i++) h+=cell(i,'bar');
  h+='</div>';
  return h;
}
function openCraft(station){
  clearGrid();                           // sonst stranden Zutaten in Zellen,
  craftStation=station||null;            // die das kleinere Raster nicht zeigt
  gridN=station?3:2;
  renderCraft(false);
}
function renderCraft(keep=true){
  const title=craftStation==='bench'?'🛠️ Werkbank':'🎒 Inventar';
  showModal('<h2>'+title+'</h2>'+craftHTML()+'<h3>Rucksack</h3>'+invGrid()+
    '<p class="hint">Links nimmt den ganzen Stapel, rechts genau einen.</p>'+
    '<div class="btnrow"><button class="primary" data-act="close">Schließen</button></div>',
    keep,sideHTML());
  drawCarry();
  updateItemTip();          // der Zeiger steht still, aber die Zelle ist neu
}
function openIntro(){
  showModal(`<h2>⛏️ ErnteDominiksFest</h2>
  <p><b>Ziel: ${GOAL} €.</b> Ernte 🍑 Dominiks und wirf sie Manni über den Tresen — einen Euro
  das Stück. Gekocht bringen sie ein Vielfaches: die 🍲 Dominik-Suppe zahlt <b>100 €</b>.</p>
  <p>Nebenbei überleben: bau ab, bau auf, halte die Bennis aus der Nacht heraus.</p>
  <p>Gebaut wird im <b>Raster</b>: Zutaten hineinlegen wie beim Vorbild, 2×2 im Rucksack,
  3×3 an der <b>🛠️ Werkbank</b>. Wer ein Muster richtig legt, hat das Rezept entdeckt.</p>
  <p>Abgebautes fällt als <b>Würfel</b> zu Boden — hingehen, aufheben. Mit <b>Q</b> wirfst du
  selbst etwas heraus. So wird auch gekocht: Zutaten in den <b>🍲 Kochtopf</b> werfen,
  Rechtsklick, warten. Passt es zusammen, kommt ein Gericht heraus; sonst Pampe.</p>
  <p>Am <b>🛒 Manni-Markt</b> gibt es auch, was sich nicht bauen lässt: <b>🛹 Skateboard</b>,
  <b>🛶 Boot</b>, <b>🪂 Gleitschirm</b> — in der Hand gehalten, bringen sie dich schneller
  ans Ziel. Im <b>Wasser</b> schwimmst du — <b>␣</b> hoch, <b>⇧</b> runter;
  hineinspringen tut nicht weh.</p>
  <p><b>📜 Rezepte</b> gibt es bei den <b>Jannessen</b> — in den Dorfhäusern und draußen in der
  Welt. Sie wollen Essen und zeigen dir dafür, wie das nächste geht; nach einer Weile fällt
  ihnen etwas Neues ein. Der erste im Tal zeigt dir die <b>🧑‍🌾 Hacke</b>.</p>
  <p>Damit legst du ein <b>Feld</b> an: Boden hacken, <b>Saatgut</b> säen (das fällt beim
  Pflücken ab), warten, ernten. Was du nicht anbaust, findest du draußen —
  🧂 Salz tief im Fels, 🌶️ Pfeffer hinter dem Fluss.</p>
  <div class="kbd">
    <b>WASD</b> laufen &nbsp; <b>⇧</b> rennen &nbsp; <b>␣</b> springen<br>
    <b>LMB</b> abbauen / schlagen &nbsp; <b>RMB</b> setzen / benutzen / lesen / essen<br>
    <b>Q</b> wegwerfen &nbsp; <b>⇧Q</b> ganzen Stapel &nbsp; <b>E</b> Inventar<br>
    <b>1-9</b> Leiste &nbsp; <b>Rad</b> wechseln &nbsp; <b>P</b> Pause
  </div>
  <div class="btnrow"><button class="primary" data-act="start">Los geht's</button></div>`);
}
function togglePause(){
  if(modalOpen()){ hideModal(); return; }
  showModal(`<h2>⏸️ Pause</h2>
    <p style="font-size:13px">💶 <b>${state.money} €</b> in der Kasse ·
    🎯 <b>${state.earned}</b> von ${GOAL} € verdient</p>
    <p style="font-size:12.5px;opacity:.85">📜 ${known.size}/${RECIPES.length} Rezepte ·
    🤝 ${state.trades} Handel · 🌱 ${state.planted} gepflanzt ·
    🧰 ${state.chests} Truhen · ⛏️ ${state.mined} abgebaut · 🧱 ${state.placed} gesetzt ·
    🌙 Tag ${state.day}</p>
    <div class="btnrow">
      <button data-act="help">❓ Hilfe</button>
      <button class="primary" data-act="close">Weiter</button></div>`);
}
// Zellen hören auf mousedown, sonst käme die rechte Maustaste nie an:
// ein Rechtsklick löst gar kein click-Ereignis aus.
mbox.addEventListener('mousedown',e=>{
  const c=e.target.closest('[data-slot],[data-g],[data-chest]');
  if(!c) return;
  e.preventDefault(); e.stopPropagation();
  ac();
  const one=e.button===2;
  if(c.dataset.chest!=null) takeFromChest(+c.dataset.chest,one);
  else if(c.dataset.slot!=null) clickCell({k:'i',i:+c.dataset.slot},one);
  else clickCell({k:'g',i:+c.dataset.g},one);
});
mbox.addEventListener('click',e=>{
  const b=e.target.closest('button,[data-act]');
  if(!b) return;
  e.stopPropagation();
  ac();
  if(b.dataset.buy){ buyFrom(b.dataset.buy); return; }
  const act=b.dataset.act;
  if(act==='craft'){ craftFromGrid(); return; }
  if(act==='trade'){ doTrade(); return; }
  if(act==='close') hideModal();
  else if(act==='takeall'){
    const c=chests.get(K(openChestCell.x,openChestCell.y,openChestCell.z));
    if(isConnected()){
      // Erst eine Momentaufnahme, dann pro Stapel eine eigene chest-take-
      // Anfrage — c.items ändert sich sonst unter der Schleife weg, sobald
      // die erste chest-sync-Antwort hereinkommt.
      const items=c.items.slice();
      for(const it of items)
        send({t:'chest-take',x:openChestCell.x,y:openChestCell.y,z:openChestCell.z,id:it.id,n:it.n});
    }else{
      for(let i=c.items.length-1;i>=0;i--) takeFromChest(i);
    }
  }
  else if(act==='help') openIntro();
  else if(act==='start'){ localStorage.setItem('edf_seen','1'); hideModal(); state.started=true; }
  else if(act==='pwsubmit') submitPassword();
});

// ------------------------------------------------------------------ Mitspieler (Phase 2)
// Andere verbundene Spieler bekommen einen simplen Avatar (Kapsel + Namensschild),
// der zur zuletzt empfangenen Position/Blickrichtung hin lerpt — keine Vorhersage,
// keine Extrapolation, nur Glätten des letzten bekannten Werts. Die eigene Bewegung
// bleibt komplett lokal maßgeblich (kein serverseitiges Zurückkorrigieren).
const PLAYER_COLORS=['#e0555f','#4fa8e0','#e0c04f','#7bcf6a'];
const remotePlayers=new Map();              // pid -> {group, target:{x,y,z,yaw}}
function ensureRemotePlayer(pid){
  let rp=remotePlayers.get(pid);
  if(rp) return rp;
  const color=PLAYER_COLORS[(pid-1)%4];
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.28,1.1,4,8),
    new THREE.MeshLambertMaterial({color}));
  body.position.y=.83; body.castShadow=true; g.add(body);
  const label=makeLabel(['Spieler '+pid],color,.35);
  label.position.y=2; g.add(label);
  scene.add(g);
  rp={group:g,body,label,target:{x:0,y:0,z:0,yaw:0}};
  remotePlayers.set(pid,rp);
  return rp;
}
function removeRemotePlayer(pid){
  const rp=remotePlayers.get(pid);
  if(!rp) return;
  scene.remove(rp.group);
  rp.body.geometry.dispose(); rp.body.material.dispose();
  rp.label.material.map?.dispose(); rp.label.material.dispose();
  remotePlayers.delete(pid);
}
function updateRemotePlayers(dt){
  const f=Math.min(1,dt*10);
  for(const rp of remotePlayers.values()){
    const g=rp.group, t=rp.target;
    g.position.set(lerp(g.position.x,t.x,f),lerp(g.position.y,t.y,f),lerp(g.position.z,t.z,f));
    let dy=t.yaw-g.rotation.y;
    dy=((dy+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;   // kürzester Weg, kein Sprung über die ±π-Naht
    g.rotation.y+=dy*f;
  }
}
let netSendT=0;
// Phase 5a: die Server-Epoche für Tag/Nacht — "wann begann Tag 1 / dayT=0",
// siehe update(dt). null bis die erste 'welcome' da ist (oder dauerhaft null
// offline), so lange läuft der alte Tick-Rückfall weiter.
let dayEpoch0=null;

// ------------------------------------------------------------------ Netzwerk / Passwort
// Phase 1: nur Verbindung + Passwortabfrage — noch keine Spielnachrichten.
// awaitingPassword hält fest, ob gerade eine Passwortabfrage den Boot-
// Übergang blockiert; ohne diese Fahne könnte der normale Boot-Abschluss
// (edf_seen/openIntro) das Passwortfenster überschreiben oder das Spiel
// entpausieren, während der Server noch auf ein Passwort wartet.
let awaitingPassword=false;
// Was nach erfolgreicher Anmeldung (oder wenn gar kein Passwort nötig war)
// passiert — genau das, was der Boot-Abschluss ohnehin tut.
function afterAuth(){
  if(localStorage.getItem('edf_seen')){ state.paused=false; state.started=true; }
  else openIntro();
}
function openPasswordModal(msg){
  awaitingPassword=true;
  showModal(`<h2>🔒 Serverzugang</h2>
    <p>BOMBA BOOM, BOMBA BOOM...</p>
    ${msg?`<p style="color:#ff9a86">${msg}</p>`:''}
    <p><input id="pwInput" type="text" placeholder="Passwort" autocomplete="off" style="
      width:100%;box-sizing:border-box;padding:10px;border-radius:8px;
      border:1px solid #4a774a;background:#0f1c0f;color:#eaf3ea;font-size:15px"></p>
    <div class="btnrow"><button class="primary" data-act="pwsubmit">Verbinden</button></div>`);
  const inp=el('pwInput');
  if(inp){
    inp.focus();
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); submitPassword(); } });
  }
}
function submitPassword(){
  const inp=el('pwInput');
  const pw=inp?inp.value:'';
  if(!pw) return;
  attemptConnect(pw,true);
}
// fromPrompt: true, wenn der Versuch aus dem Passwortfenster kam (dann
// entscheidet der Ausgang auch über dessen Schließen), false beim stillen
// Versuch mit gespeichertem Passwort beim Boot.
function attemptConnect(pw,fromPrompt){
  return connect(pw).then(()=>{
    try{ localStorage.setItem('edf_pw',pw); }catch(e){}
    if(awaitingPassword){ awaitingPassword=false; hideModal(); afterAuth(); }
  }).catch(err=>{
    if(err.reason==='bad-password'){
      try{ localStorage.removeItem('edf_pw'); }catch(e){}
      // Leeres pw heißt: stiller Erstversuch ohne gespeichertes Passwort —
      // dafür "falsches Passwort" zu melden wäre irreführend.
      openPasswordModal(pw?'❌ Falsches Passwort — bitte erneut versuchen.':null);
    }else if(err.reason==='full'){
      openPasswordModal('🚪 Server ist gerade voll (maximal 4 Spieler) — später erneut versuchen.');
    }else{
      // offline/unerreichbar: nie blockieren, das Spiel läuft ohne Server weiter.
      toast('📡 Kein Server erreichbar — offline gespielt.','warn',3400);
      if(awaitingPassword){ awaitingPassword=false; hideModal(); afterAuth(); }
    }
  });
}
// Kleine Statusmeldungen für Mitspieler und Verbindungsabbrüche — die
// eigentliche Roster-Verwaltung/Spiel-Synchronisation kommt erst in
// späteren Phasen, hier nur die Verkabelung.
on('join',()=>toast('👋 Ein Mitspieler ist beigetreten.','',1800));
// 'join' selbst trägt keine Position — die kommt erst mit der ersten 'pos'-
// Nachricht des Beigetretenen, also gibt es hier noch nichts zu zeichnen.
on('leave',msg=>{ toast('👋 Ein Mitspieler hat verlassen.','',1800); removeRemotePlayer(msg.pid); });
on('disconnected',info=>{
  if(info.reason==='bad-password'||info.reason==='full') return;  // eigene Meldung übernimmt das
  toast('📡 Verbindung verloren — versuche erneut zu verbinden …','warn',2600);
});
on('reconnected',info=>{
  toast('✅ Wieder verbunden.','good',2000);
  // Während der Trennung kann sich das Roster geändert haben — Geister-Avatare
  // von Mitspielern, die inzwischen weg sind, hier aufräumen. Wer noch da ist,
  // bekommt über die frische 'welcome'-Nachricht (dieselbe Handler-Kette,
  // siehe unten) ohnehin gleich seine echte Position zugewiesen.
  for(const pid of [...remotePlayers.keys()])
    if(!info.roster.includes(pid)) removeRemotePlayer(pid);
});
// welcome kommt bei jeder (Wieder-)Verbindung an: initial und nach einem
// Reconnect (net.js leitet die rohe Server-Nachricht unverändert weiter).
// Direktes Setzen von position/rotation zusätzlich zum target lässt bereits
// anwesende Mitspieler sofort an ihrer echten Stelle erscheinen, statt sichtbar
// vom Ursprung heranzulerpen.
// Phase 3a: welcome trägt zusätzlich den bisherigen Weltzustand (Block-Edits
// und Fackeln) — direkt über setBlockData/markDirty angewendet, NICHT über
// das sendende setBlock(), sonst würde der gerade empfangene Weltzustand
// gleich wieder an den Server zurückgeschickt. edits ist eine Map über
// Positionsschlüssel, ein erneutes .set() beim Reconnect überschreibt den
// alten Wert einfach — von selbst idempotent. torches dagegen ist eine
// Liste ohne Schlüssel, darum hier ersetzen statt anhängen (sonst gäbe es
// bei jedem Reconnect doppelte Fackeln).
// Phase 3b: welcome trägt zusätzlich Truhen, wachsende Saat und Kochtöpfe.
// chests ist wie edits über Positionsschlüssel indiziert — .set() pro
// Eintrag überschreibt einfach die beim Weltaufbau schon deterministisch
// angelegte Truhe mit dem serverseitig echten (evtl. schon geplünderten)
// Inhalt. growing/pots ebenso: von selbst idempotent, ein erneutes .set()
// beim Reconnect ersetzt den alten Eintrag. Für growing gilt zusätzlich:
// selbst ein inzwischen serverseitig gelöschter (weil längst abgebauter)
// Eintrag, der hier lokal übrig bliebe, wäre harmlos — s. updateGrow().
on('welcome',msg=>{
  // Phase 5a: die Server-Epoche für Tag/Nacht — ab jetzt rechnet update(dt)
  // day/dayT rein aus Date.now()-dayEpoch0 statt lokal zu ticken (siehe dort).
  if(typeof msg.dayEpoch0==='number') dayEpoch0=msg.dayEpoch0;
  for(const [key,type] of msg.edits||[]){
    const [x,y,z]=key.split(',').map(Number);
    setBlockData(x,y,z,type);
    markDirty(x,z);
  }
  torches.length=0;
  for(const t of msg.torches||[]) torches.push(t);
  emitTorches();
  for(const [key,c] of msg.chests||[]){
    const cc=chests.get(key);
    if(cc) cc.items=c.items;
    else chests.set(key,{items:c.items,opened:!!c.opened});
  }
  for(const [key,g] of msg.growing||[]) growing.set(key,g);
  for(const [key,p] of msg.pots||[])
    pots.set(key,{items:p.items,cook:p.cook,readyAt:p.readyAt,_claiming:false});
  // Phase 4a: die gemeinsame Kasse kommt beim (Wieder-)Verbinden ebenfalls im
  // Ganzen mit. Kein winGame() hier, auch wenn schon gewonnen — ein spät
  // Beitretender soll nicht ungefragt das Sieg-Fenster aufgerissen bekommen,
  // aber state.won MUSS trotzdem stimmen, sonst bliebe die HUD-Kennzeichnung
  // (siehe updateHUD/'.rich') inkonsistent mit dem tatsächlichen Spielstand.
  if(msg.econ){
    state.money=msg.econ.money; state.earned=msg.econ.earned;
    state.sold=msg.econ.sold; state.bought=msg.econ.bought;
    state.won=msg.econ.won;
    updateHUD();
  }
  for(const p of msg.positions||[]){
    const rp=ensureRemotePlayer(p.pid);
    Object.assign(rp.target,{x:p.x,y:p.y,z:p.z,yaw:p.yaw});
    rp.group.position.set(p.x,p.y,p.z);
    rp.group.rotation.y=p.yaw;
  }
  // Phase 5a: der volle Jannes/Manni-Bestand kommt bei jeder (Wieder-)
  // Verbindung mit — anders als die laufenden 'char-pos'-Ticks (die nur noch
  // das Lerp-Ziel setzen) hier direkt snappen, sonst würde ein frisch
  // beigetretener Spieler jeden NPC sichtbar aus dem Nichts heranlaufen
  // sehen (genau wie bei msg.positions oben).
  for(const cp of msg.chars||[]){
    const c=CHARS[cp.idx];
    if(!c) continue;
    c.x=cp.x; c.y=cp.y; c.z=cp.z;
    c._netX=cp.x; c._netY=cp.y; c._netZ=cp.z;
    c.tx=null;
    if(c.group) c.group.position.set(cp.x,cp.y,cp.z);
  }
  // Phase 4b: bekannte Rezepte sind team-weit — zusammenführen, nicht
  // ersetzen (known startet auf beiden Seiten ohnehin mit {'plank','stick'},
  // die Überschneidung ist harmlos).
  for(const id of msg.known||[]) known.add(id);
  // Phase 4b: die Jannes-Angebote sind ausschließlich Server-Wahrheit — der
  // lokale Boot-Wurf (setOffer/makeOffer, siehe oben) ist nur ein
  // Platzhalter für den Offline-Fall und wird hier vom echten Zustand
  // überschrieben, sobald er eintrifft.
  for(const tr of msg.trades||[]){
    const c=traders[tr.idx]; if(!c) continue;
    c.trade={give:tr.give,want:tr.want,done:tr.done,round:tr.round,readyAt:tr.readyAt,_claiming:false};
  }
});
on('pos',msg=>{
  const rp=ensureRemotePlayer(msg.pid);
  Object.assign(rp.target,{x:msg.x,y:msg.y,z:msg.z,yaw:msg.yaw});
});
// Phase 5a: laufende Positions-Ticks der Jannessen/Manni vom Server — nur das
// Lerp-Ziel setzen (siehe updateChars), nicht snappen, exakt wie 'pos' oben
// für Mitspieler.
on('char-pos',msg=>{
  for(const cp of msg.list||[]){
    const c=CHARS[cp.idx];
    if(!c) continue;
    c._netX=cp.x; c._netY=cp.y; c._netZ=cp.z;
  }
});
// Phase 5b: server-authoritative Bennis — full snapshot every MOB_TICK_MS
// (see party/server.js). ensureMob() snaps a freshly-seen id straight to its
// first position (no lerp-in, exactly like a joining remote player); any id
// currently tracked locally but absent from this list quietly wandered out
// of range at dawn (no death sound — see mob-dead below for the other case).
on('mob-state',msg=>{
  // Der Netzwerk-Connect (bootNet) läuft unabhängig vom Textur-Preload —
  // eine erste mob-state-Momentaufnahme kann eintreffen, bevor benniTex
  // geladen ist. ensureMob() baut das Mesh sofort aus benniTex.image; ohne
  // diese Wache crasht das beim allerersten Tick. Einfach überspringen: der
  // Server sendet ohnehin alle 100ms erneut, der nächste Tick (meist längst
  // nach dem Laden) holt es problemlos nach.
  if(!benniTex) return;
  const seen=new Set();
  for(const e of msg.list||[]){
    seen.add(e.id);
    const m=ensureMob(e.id,e.x,e.y,e.z);
    m.target.x=e.x; m.target.y=e.y; m.target.z=e.z;
    m.hp=e.hp;
    m.hurtT=!!e.hurtT;
  }
  for(let i=mobs.length-1;i>=0;i--){
    const m=mobs[i];
    if(m.id!=null&&!seen.has(m.id)) removeMob(m.id);
  }
});
// A dedicated event for an actual kill (unlike the day-flee despawn above,
// which relies on snapshot-absence) — this is the ONLY place the death
// sound/kill-count fires online. removeMob() is a safe no-op if the next
// mob-state (which also won't list this id) tries to remove it again.
on('mob-dead',msg=>{
  SND.mobDie(); state.killed++;
  removeMob(msg.id);
});
// A Benni's attack only ever reaches the one player it actually hit (see the
// server's class-level comment) — reuses the existing, entirely local
// hurtPlayer() untouched.
on('mob-attack',msg=>{ hurtPlayer(msg.dmg); });
// Phase 3a: von anderen Spielern gesetzte/abgebaute Blöcke und Fackeln.
// setBlockData direkt statt setBlock() — s.o., kein Zurücksenden.
on('block',msg=>{
  setBlockData(msg.x,msg.y,msg.z,msg.type);
  markDirty(msg.x,msg.z);
});
on('torch',msg=>{
  torches.push({x:msg.x,y:msg.y,z:msg.z});
  emitTorches();
});
// ---------------------------------------------------------------- Phase 3b
// Wachsende Saat: nur die Wachstums-Uhr übernehmen, NICHT setBlock/setBlockData
// aufrufen — der Setzling-BLOCK selbst kommt schon über die normale
// 'block'-Nachricht an (plantSeed ruft dafür bereits das broadcastende
// setBlock() auf), hier nur die dazugehörige Reifezeit nachtragen.
on('plant',msg=>{
  growing.set(K(msg.x,msg.y,msg.z),{to:msg.to,at:msg.at});
});
// Truhen: Server ist alleinige Autorität, wer wieviel bekommt (siehe
// takeFromChest oben). items ist der vollständige, schon aktualisierte
// Truheninhalt — einfach übernehmen. grant sagt, ob (und was) DIESER Client
// für seine eigene Anfrage bekommen hat; giveOrDrop übernimmt das restliche
// Verhalten (Inventar voll → vor die Füße legen) genau wie beim Handeln/
// Kochen schon heute.
on('chest-sync',msg=>{
  const key=K(msg.x,msg.y,msg.z);
  let c=chests.get(key);
  if(!c){ c={items:[],opened:true}; chests.set(key,c); }
  c.items=msg.items;
  if(msg.grant&&msg.grant.pid===getPid()&&msg.grant.n>0) giveOrDrop(msg.grant.id,msg.grant.n);
  if(openChestCell&&openChestCell.x===msg.x&&openChestCell.y===msg.y&&openChestCell.z===msg.z) renderChest();
  updateHUD();
});
// Kochtöpfe: drei getrennt synchronisierte Teile (s. potAdd/usePot/updatePots
// oben) — Zutaten und Kochstart dürfen optimistisch/broadcastend laufen (rein
// additive Zustandsänderung, keine Vervielfältigungsgefahr), nur das fertige
// Ergebnis (pot-grant) braucht die Schiedsrichter-Rolle des Servers.
on('pot-add',msg=>{
  const k=K(msg.x,msg.y,msg.z);
  let p=pots.get(k);
  if(!p){ p={items:[],cook:0,readyAt:0}; pots.set(k,p); }
  p.items=msg.items;
});
on('pot-start',msg=>{
  const k=K(msg.x,msg.y,msg.z);
  let p=pots.get(k);
  if(!p){ p={items:[],cook:0,readyAt:0}; pots.set(k,p); }
  p.cook=1;
  p.readyAt=msg.readyAt;
});
// Der Server bestimmt hier EINMAL den Gewinner des Claim-Wettlaufs (siehe
// updatePots) — alle Clients räumen den Topf gleichermaßen leer/untätig,
// aber nur der Gewinner ruft finishCook tatsächlich auf und bekommt damit
// den echten (aufhebbaren) Drop.
on('pot-grant',msg=>{
  const k=K(msg.x,msg.y,msg.z);
  const p=pots.get(k);
  if(!p) return;
  const itemsSnapshot=p.items;
  p.cook=0; p.readyAt=0; p._claiming=false; p.items=[];
  if(msg.pid===getPid()) finishCook(k,{items:itemsSnapshot});
});
// ---------------------------------------------------------------- Phase 6
// Ein von einem anderen Client gespawnter Boden-Drop — einfach nachbauen
// (gleiche dropId, s. spawnDropRemote) und mitfallen lassen. Die Physik läuft
// ab hier rein lokal weiter (jeder Client simuliert Fallen/Rollen/Verschmelzen
// für sich, s. Klassenkommentar in party/server.js) — nur der Startzustand
// ist geteilt, kein Cent Netzwerkkosten für einen kosmetischen Fall.
on('drop-spawn',msg=>{
  spawnDropRemote(msg.dropId,msg.id,msg.n,msg.x,msg.y,msg.z,msg.vx,msg.vy,msg.vz);
});
// Der Server bestimmt hier EINMAL den Gewinner des Claim-Wettlaufs um einen
// Boden-Drop (s. updateDrops: sell/pickup/pot melden sich dort per
// 'drop-claim' an) — exakt dasselbe Muster wie Truhen-/Topf-Claim. Nur der
// Gewinner wendet den zu seiner eigenen Anfrage passenden Effekt an (welchen,
// steht lokal in d._claimReason); alle anderen Clients räumen den Drop
// trotzdem weg, sobald irgendwer gewonnen hat — er ist für alle weg.
on('drop-claimed',msg=>{
  const d=drops.find(o=>o.dropId===msg.dropId);
  if(!d) return;                      // längst lokal zusammengeführt/entfernt — sicher zu ignorieren
  if(msg.pid===getPid()){
    if(d._claimReason==='sell') sellTo(d.id,d.n);
    else if(d._claimReason==='pot') potAdd(d._potPos.x,d._potPos.y,d._potPos.z,d.id,d.n);
    else{                              // 'pickup' (und Fallback)
      const rest=give(d.id,d.n);
      if(rest<d.n){ playSample('pop',.8)||SND.pop(); updateHUD(); }
      if(rest>0) spawnDrop(d.id,rest,d.x,d.y,d.z,0,0,0,.5);  // passte nicht (mehr) rein — bleibt liegen
    }
  }
  removeDrop(d);
});
// ---------------------------------------------------------------- Phase 4a
// Die gemeinsame Kasse: der Client wendet HIER nie selbst etwas an, er
// wartet auf genau diese Nachricht — sowohl für den eigenen Verkauf/Einkauf
// als auch für den von Mitspielern (state.money/earned/sold/bought kommen
// ausschließlich aus 'econ'). buyResult ist nur gesetzt, wenn diese
// Nachricht die Antwort auf EINE eigene 'buy'-Anfrage ist (pid-Vergleich) —
// erst dann darf der Drop/Spruch/Toast (Erfolg) bzw. der "reicht nicht"-Toast
// (Ablehnung) ausgelöst werden, s. buyFrom oben, das selbst nichts davon mehr
// direkt tut.
on('econ',msg=>{
  state.money=msg.money; state.earned=msg.earned; state.sold=msg.sold; state.bought=msg.bought;
  updateHUD();
  if(msg.won&&!state.won) winGame();
  if(msg.buyResult&&msg.buyResult.pid===getPid()){
    if(msg.buyResult.ok){
      const dx=player.x-marketChar.x, dz=player.z-marketChar.z, l=Math.hypot(dx,dz)||1;
      spawnDrop(msg.buyResult.id,1,marketChar.x,marketChar.y+1.5,marketChar.z,dx/l*2.2,2.4,dz/l*2.2,.4);
      SND.craft();
      say(marketChar,ITEMS[msg.buyResult.id].nm+', bitte sehr!',3200);
      toast('🛒 '+ITEMS[msg.buyResult.id].ic+' '+ITEMS[msg.buyResult.id].nm+' gekauft.','good',2600);
      if(modalOpen()) openMarket(marketChar);      // Preise/Kasse im offenen Fenster auffrischen
    }else{
      SND.fail();
      toast('💶 Dafür reicht es nicht.','warn',1800);
    }
  }
});
// ---------------------------------------------------------------- Phase 4b
// Rezeptwissen ist team-weit (siehe Kommentar bei craftFromGrid): einfach,
// weil known.add idempotent ist und es hier — anders als bei Truhen/Töpfen —
// keine Mengenknappheit gibt, um die es einen Wettlauf geben könnte. Kein
// Ton/Toast für ein von JEMAND ANDEREM gelerntes Rezept, das wäre nur laut.
on('learn',msg=>{
  known.add(msg.id);
  updateHUD();
});
// Ein Jannes hat (nach Ablauf des Cooldowns) ein neues Angebot — ausschließlich
// vom Server bestimmt (trader-refresh oben), damit alle Clients auf demselben
// Rezept landen statt jeder für sich zu würfeln. msg.round>0 filtert das
// allererste Angebot beim Boot/Beitritt heraus, dafür gibt es keinen Spruch.
on('trader-offer',msg=>{
  const c=traders[msg.idx]; if(!c) return;
  c.trade={give:msg.give,want:msg.want,done:false,round:msg.round,readyAt:0,_claiming:false};
  if(c.trade.give&&msg.round>0&&Math.hypot(player.x-c.x,player.z-c.z)<20)
    say(c,'Mir ist was Neues eingefallen!',3600);
});
// Antwort auf eine eigene 'trade-complete'-Anfrage (oder die eines anderen
// Spielers, der um denselben Handel gewettet hat) — give/want kommen als
// Echo mit, damit hier NICHT auf c.trade.want zurückgegriffen wird (das
// könnte durch einen inzwischen eingetroffenen trader-offer schon wieder
// etwas anderes sein). Wie beim Truhen-/Topf-Muster gewinnt genau eine
// Anfrage; alle anderen Clients übernehmen nur den done/round/readyAt-Stand.
on('trade-result',msg=>{
  const c=traders[msg.idx]; if(!c) return;
  c.trade.done=true; c.trade.readyAt=msg.readyAt; c.trade.round=msg.round; c.trade._claiming=false;
  if(msg.pid===getPid()){
    if(msg.ok){
      for(const [id,n] of msg.want) take(id,n);
      state.trades++;
      SND.chest();
      say(c,'Danke. Schau her — so geht das.',5000);
      learnRecipe(msg.give,c.name);
    }else{
      SND.fail();          // verlorener Wettlauf — es wurde nichts abgezogen, nichts rückgängig zu machen
    }
  }
});
// Läuft parallel zum Laden der Bilder/Welt weiter unten und blockiert den
// Boot-Vorgang nicht: mit gespeichertem Passwort still verbinden, sonst mit
// leerem Passwort "anklopfen" — das genügt, um zu erkennen, ob überhaupt ein
// Server antwortet, ohne einem Erstbesucher grundlos "falsches Passwort" zu
// melden.
(function bootNet(){
  let stored=null;
  try{ stored=localStorage.getItem('edf_pw'); }catch(e){}
  attemptConnect(stored||'',false);
})();

// ------------------------------------------------------------------ Bewegung
const PR=.32, GRAV=26, JUMP=8.4, EYE=1.62, PH=1.8, EPS=1e-4;
const FALL_FREE=4;                      // so tief geht es ohne Schaden
// Schwimmen: SWIM_UP ist das Tempo hoch wie runter, FLOAT_Y die Höhe, auf der
// man von selbst treibt — gerade so, dass die Augen über dem Spiegel liegen.
const SWIM_UP=3.4, SWIM_ACC=15, FLOAT_Y=WATER_Y-1.42;
const GLIDE_V=1.7;                      // Sinkgeschwindigkeit am Gleitschirm
// Der Spieler füllt [py, py+PH), ein Block y deckt [y, y+1) ab. Berührung ist
// noch keine Überschneidung — sonst zieht die Schwerkraft ihn jedes Bild ein
// Stück in den Boden, der Aufsetzer schiebt ihn zurück, und das Bild zittert.
// Der Rand muss darum knapp *innerhalb* des Körpers liegen, nicht darüber.
function collides(px,py,pz){
  const y0=Math.floor(py+EPS), y1=Math.floor(py+PH-EPS);
  for(let bx=Math.round(px-PR);bx<=Math.round(px+PR);bx++)
    for(let bz=Math.round(pz-PR);bz<=Math.round(pz+PR);bz++){
      if(Math.abs(px-bx)>=.5+PR||Math.abs(pz-bz)>=.5+PR) continue;
      for(let y=y0;y<=y1;y++){
        const t=blockAt(bx,y,bz);
        // Die Dominiks sind zwei dünne Flächen, kein Klotz — man geht hindurch,
        // statt beim Hochbauen an einer unsichtbaren Ecke hängenzubleiben.
        if(t&&!BLOCKS[t]?.pass) return true;
      }
    }
  return false;
}
const keys={};
function updatePlayer(dt){
  let mx=0, mz=0;
  if(!state.paused){
    if(keys.KeyW||keys.ArrowUp) mz-=1;
    if(keys.KeyS||keys.ArrowDown) mz+=1;
    if(keys.KeyA||keys.ArrowLeft) mx-=1;
    if(keys.KeyD||keys.ArrowRight) mx+=1;
  }
  const len=Math.hypot(mx,mz);
  if(len>1){ mx/=len; mz/=len; }
  // Zwei Blicke ins Wasser: einer knapp über die Füße — steht man drin? — und
  // einer knapp darunter. Der zweite hält den Auftrieb noch einen Moment
  // aufrecht, während man sich über die Böschung schiebt; ohne ihn käme man
  // aus einer tiefen Rinne nie wieder heraus, weil einen die Schwerkraft
  // genau an der Wasserlinie wieder zurückzieht.
  const wet=waterAt(player.x,player.y+.25,player.z)||
            waterAt(player.x,player.y-.1,player.z);
  player.wet=wet;
  state.underwater=waterAt(player.x,player.viewY+EYE,player.z);
  // Was vom Markt kommt, wirkt in der Hand: Brett an Land, Boot im Wasser,
  // Schirm in der Luft. Alles drei kostet den Platz in der Hand — wer segelt,
  // haut in dem Moment nichts ab.
  const hit=heldId(), hi=hit?ITEMS[hit]:null;
  const onBoat=!!hi?.boat&&wet;
  const onBoard=!!hi?.board&&!wet&&player.onGround;
  const gliding=!!hi?.glide&&!wet&&!player.onGround;
  player.gliding=gliding;
  const sprint=(keys.ShiftLeft||keys.ShiftRight)?1.42:1;
  const sp=wet?(onBoat?7.2:3.0)              // Wasser bremst, das Boot nicht
          :onBoard?8.4                       // das Brett rollt
          :gliding?6.2                       // im Gleitflug trägt der Fahrtwind
          :4.8*sprint;
  const sin=Math.sin(player.yaw), cos=Math.cos(player.yaw);
  const dx=(mx*cos+mz*sin)*sp*dt;
  const dz=(-mx*sin+mz*cos)*sp*dt;

  // Waagerecht, Achse für Achse — mit automatischer Stufe von einem Block.
  // Die Stufe geht auch im Wasser: sonst klebt man an der Böschung fest.
  const canStep=player.onGround||wet;
  let nx=clamp(player.x+dx,BOUND.x0-.4,BOUND.x1+.4);
  if(collides(nx,player.y,player.z)){
    if(canStep&&!collides(nx,player.y+1,player.z)&&!collides(player.x,player.y+1,player.z))
      { player.y+=1; player.x=nx; }
    else nx=player.x;
  }
  if(nx!==player.x) player.x=nx;
  let nz=clamp(player.z+dz,BOUND.z0-.4,BOUND.z1+.4);
  if(collides(player.x,player.y,nz)){
    if(canStep&&!collides(player.x,player.y+1,nz)&&!collides(player.x,player.y+1,player.z))
      { player.y+=1; player.z=nz; }
    else nz=player.z;
  }
  if(nz!==player.z) player.z=nz;

  // Senkrecht
  if(!state.paused){
    if(wet){
      // Schwimmen: ␣ zieht nach oben, ⇧ taucht ab, sonst trägt der Auftrieb
      // einen zur Wasserlinie zurück — mit dem Kopf gerade heraus. Das Wasser
      // dämpft alles, deshalb pendelt es sich ein statt zu springen.
      if(keys.Space) player.vy=Math.min(player.vy+SWIM_ACC*dt,SWIM_UP);
      else if(keys.ShiftLeft||keys.ShiftRight)
        player.vy=Math.max(player.vy-SWIM_ACC*dt,-SWIM_UP);
      else{
        // Im Boot sitzt man obenauf, sonst treibt man mit dem Kopf heraus.
        const line=onBoat?WATER_Y:FLOAT_Y;
        player.vy+=clamp((line-player.y)*6,-GRAV*.25,4.5)*dt;
        player.vy*=Math.max(0,1-dt*2.4);
      }
      player.vy=clamp(player.vy,-SWIM_UP,SWIM_UP);
      // onGround bleibt der Kollision überlassen: wer auf dem Grund steht,
      // steht auch unter Wasser auf dem Grund.
    } else {
      if(player.onGround&&keys.Space){ player.vy=JUMP; player.onGround=false; }
      player.vy-=GRAV*dt;
      // Der Schirm bremst den Fall auf Schrittgeschwindigkeit — steigen kann
      // man damit nicht, nur weit kommen.
      if(gliding&&player.vy<-GLIDE_V) player.vy=-GLIDE_V;
    }
    let ny=player.y+player.vy*dt;
    let fall=0;
    if(player.vy<=0){
      if(collides(player.x,ny,player.z)){
        ny=Math.floor(ny)+1;
        if(!player.onGround){
          if(player.vy<-6) SND.land();
          fall=player.fallFrom-ny;               // Sturzhöhe für den Schaden
        }
        player.vy=0; player.onGround=true;
      } else player.onGround=false;
    } else {
      if(collides(player.x,ny,player.z)){ ny=player.y; player.vy=0; }
      player.onGround=false;
    }
    if(player.onGround||ny>player.fallFrom) player.fallFrom=ny;
    // Wasser fängt den Sturz, und wer am Schirm hängt, fällt gar nicht.
    if(wet||gliding){ player.fallFrom=ny; fall=0; }
    if(ny<BEDROCK-6){ respawn(); ny=player.y; fall=0; }  // normal unerreichbar
    player.y=ny;
    // Erst jetzt Schaden, sonst überschreibt die Höhe von oben einen Respawn.
    // Vier Blöcke sind frei, darüber kostet jeder weitere gut drei Viertel.
    if(fall>FALL_FREE) hurtPlayer(Math.max(1,Math.round((fall-FALL_FREE)*.8)));
  }

  // Kamera: Höhe weich nachziehen, sonst ruckelt jede Stufe
  player.viewY=Math.abs(player.y-player.viewY)<.02?player.y:lerp(player.viewY,player.y,Math.min(1,dt*16));
  const speed=Math.hypot(dx,dz)/Math.max(dt,1e-4);
  if(speed>.4&&player.onGround&&!wet&&!state.paused){
    player.bob+=dt*speed*1.5;
    player.stepT+=dt*speed;
    if(player.stepT>3.1){ player.stepT=0; SND.step(); }
  } else player.bob+=dt*.6;
  const bobY=Math.sin(player.bob)*(speed>.4?.045:.012);
  camera.position.set(player.x,player.viewY+EYE+bobY,player.z);
  camera.rotation.set(0,0,0);
  camera.rotateY(player.yaw);
  camera.rotateX(player.pitch);
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  if(player.atkCd>0) player.atkCd-=dt;
  if(player.invT>0) player.invT-=dt;
  if(player.hurtT>0){ player.hurtT-=dt; el('hurt').style.opacity=Math.max(0,player.hurtT); }
  else el('hurt').style.opacity=0;
}

// ------------------------------------------------------------------ Hunger
function updateVitals(dt){
  const moving=keys.KeyW||keys.KeyA||keys.KeyS||keys.KeyD;
  player.food=clamp(player.food-dt/(moving?18:34),0,player.maxfood);
  if(player.food<=0){
    player.starveT+=dt;
    if(player.starveT>=5){ player.starveT=0; hurtPlayer(1); }
  } else player.starveT=0;
  if(player.food>=16&&player.hp<player.maxhp){
    player.regenT+=dt;
    if(player.regenT>=4.5){
      player.regenT=0; player.hp=Math.min(player.maxhp,player.hp+1);
      player.food=Math.max(0,player.food-.6);
      updateHUD();
    }
  } else player.regenT=0;
}

// ------------------------------------------------------------------ Tag & Nacht
let mobTimer=0, birdTimer=rnd(8,20);
function updateNight(dt){
  const wasNight=state.night;
  state.night=state.dayT>=NIGHT_START&&state.dayT<NIGHT_END;
  if(state.night&&!wasNight){ toast('🌙 Nacht '+state.day,'bad',2600); SND.night(); }
  if(!state.night&&wasNight){ toast('🌅 Morgen.','good',2200); SND.dawn(); }
  if(state.night){
    mobTimer-=dt;
    if(mobTimer<=0){
      mobTimer=rnd(2.5,5);
      // Online, spawning is entirely the server's job (see party/server.js
      // _startMobTimer) — this local trigger would otherwise fight it (and
      // every connected client would spawn its OWN extra Bennis on top of
      // the server's).
      if(!isConnected()&&mobs.length<mobCap()) spawnMob();
    }
  } else {
    birdTimer-=dt;
    if(birdTimer<=0){
      playSample('bird'+Math.ceil(Math.random()*11),.35);
      birdTimer=rnd(20,50);
    }
  }
}
const C={dayTop:new THREE.Color(0x3f86c8),evTop:new THREE.Color(0xd97b3a),nTop:new THREE.Color(0x0b1030),
  dayBot:new THREE.Color(0xbfe0ef),evBot:new THREE.Color(0xf0b070),nBot:new THREE.Color(0x141c38),
  sunDay:new THREE.Color(0xfff3d6),sunEv:new THREE.Color(0xffb070),moon:new THREE.Color(0x9fb4ff),
  water:new THREE.Color(0x1d5c8f),
  top:new THREE.Color(),bot:new THREE.Color()};
let _wasSub=false;
function updateSky(){
  const d=state.dayT;
  const dawn=clamp((NIGHT_END+.04-d)*7,0,1)*(d>NIGHT_END-.01?1:0)+clamp((.14-d)*6,0,1);
  const dusk=clamp((d-(NIGHT_START-.12))*7,0,1)*(d<NIGHT_START?1:0);
  const night=state.night?1:clamp((d-(NIGHT_START-.04))*20,0,1)*(d<NIGHT_START?1:0);
  const warm=clamp(Math.max(dawn,dusk),0,1);
  const top=C.top.copy(C.dayTop).lerp(C.evTop,warm*.5).lerp(C.nTop,night);
  const bot=C.bot.copy(C.dayBot).lerp(C.evBot,warm*.55).lerp(C.nBot,night);
  skyMat.uniforms.top.value.copy(top);
  skyMat.uniforms.bot.value.copy(bot);
  // Unter Wasser wird die Sicht kurz und blau, und ein Schleier liegt vor dem
  // Bild — sonst merkt man beim Schwimmen kaum, dass man untergetaucht ist.
  const sub=state.underwater;
  scene.fog.color.copy(sub?C.water:bot);
  scene.fog.near=sub?.4:46;
  scene.fog.far=sub?lerp(26,9,night):140;
  renderer.setClearColor(sub?C.water:bot);
  if(sub!==_wasSub){ _wasSub=sub; el('water').style.opacity=sub?1:0; }
  sun.intensity=lerp(2.0,.35,night);
  sun.color.copy(C.sunDay).lerp(C.sunEv,warm*.8).lerp(C.moon,night);
  hemi.intensity=lerp(1.25,.42,night);
  const ang=Math.PI*(.15+d*.7);
  sun.target.position.set(player.x,player.y,player.z);
  sun.position.set(player.x+Math.cos(ang)*44,player.y+Math.max(10,Math.sin(ang)*48),player.z+16);
}
function cullChunks(){
  const r=(VIEW+CHUNK)**2;
  for(const c of chunks.values()){
    const vis=(c.cx-player.x)**2+(c.cz-player.z)**2<r;
    if(vis!==c.visible){ c.visible=vis; for(const m of c.meshes) m.visible=vis; }
  }
}

// ------------------------------------------------------------------ HUD
let hotEls=null, hudCache='', hpCache='', foodCache='';
// Zehn Symbole zu je zwei Punkten. Mit den halben Sprites zeigt der Balken
// jetzt auch ungerade Werte richtig an statt aufzurunden.
function vitalBar(v,max,kind,on,off){
  let h='';
  for(let i=0;i<max/2;i++){
    const part=clamp(v-i*2,0,2);                 // Essen läuft in Bruchteilen leer
    const nm=part>=2?'full':part>=1?'half':'empty';
    h+=`<img class="vit" src="./sprites/ui/${kind}_${nm}.png" alt="${part>=1?on:off}">`;
  }
  return h;
}
function buildHotbar(){
  const box=el('hotbar');
  box.innerHTML='';
  hotEls=[];
  for(let i=0;i<NBAR;i++){
    const d=document.createElement('div');
    d.className='slot'; d.dataset.bar=i;
    d.innerHTML='<span class="i"></span><span class="n"></span>';
    d.addEventListener('pointerdown',e=>{
      e.stopPropagation(); e.preventDefault();
      ac(); player.sel=i; SND.tap(); updateHUD();
    });
    box.appendChild(d); hotEls.push(d);
  }
}
function updateHUD(){
  const hs=vitalBar(player.hp,player.maxhp,'heart','❤️','🖤');
  if(hs!==hpCache){ hpCache=hs; el('hearts').innerHTML=hs; }
  const fs=vitalBar(player.food,player.maxfood,'food','🍗','▪️');
  if(fs!==foodCache){ foodCache=fs; el('food').innerHTML=fs; }
  el('hRec').textContent=known.size;
  el('hCash').textContent=state.money;
  el('hEarn').textContent=state.earned;
  el('book').classList.toggle('full',knowsSoup());
  el('book').classList.toggle('rich',state.earned>=GOAL);
  const sig=slots.map(s=>s?s.id+s.n:'-').join(',')+'|'+player.sel;
  if(sig!==hudCache&&hotEls){
    hudCache=sig;
    for(let i=0;i<NBAR;i++){
      const s=slots[i], d=hotEls[i];
      d.querySelector('.i').innerHTML=s?icon(s.id):'';
      d.querySelector('.n').textContent=s&&s.n>1?s.n:'';
      d.classList.toggle('sel',i===player.sel);
    }
  }
}

// ------------------------------------------------------------------ Eingabe
const canvas=renderer.domElement;
// Rechtsklick gehört dem Spiel, nicht dem Browser. Am Dokument und in der
// Capture-Phase, sonst schlüpft das Menü über der Inventarleiste, den Knöpfen
// und den Fenstern durch — die liegen über dem Canvas.
addEventListener('contextmenu',e=>{e.preventDefault();return false;},{capture:true});
canvas.addEventListener('mousedown',e=>{
  ac();
  if(modalOpen()) return;
  if(document.pointerLockElement!==canvas){ canvas.requestPointerLock?.(); return; }
  if(e.button===0){ if(!attack()) mining=true; }
  else if(e.button===2){ e.preventDefault(); useRight(); }
});
addEventListener('mouseup',e=>{ if(e.button===0){ mining=false; mineT=0; } });
addEventListener('blur',()=>{ mining=false; for(const k in keys) keys[k]=false; });
// Unter Pointer-Lock schiebt der Browser den unsichtbaren Zeiger von Zeit zu
// Zeit in die Bildmitte zurück. Dreht man länger in eine Richtung, kommt genau
// dann ein einzelnes Ereignis mit einem Sprung von fast Bildschirmbreite —
// und die Sicht reisst mitten in der Drehung weg. Solche Ausreisser sind keine
// Handbewegung: ein sehr schneller Schlenker bringt es auf rund 300 Pixel je
// Ereignis, das Zurücksetzen auf ein Vielfaches davon. Also verwerfen.
// Dasselbe beim frischen Einfangen der Maus, wo das erste Ereignis den Weg
// seit der letzten Position mitbringt.
let lockFresh=false;
function lookSpike(){ return Math.max(400,Math.min(innerWidth,innerHeight)*.5); }
document.addEventListener('mousemove',e=>{
  if(document.pointerLockElement===canvas){
    const dx=e.movementX||0, dy=e.movementY||0;
    if(lockFresh){ lockFresh=false; return; }
    const s=lookSpike();
    if(Math.abs(dx)>s||Math.abs(dy)>s){ state.spikes++; return; }
    player.yaw-=dx*.0022;
    player.pitch=clamp(player.pitch-dy*.0022,-1.45,1.45);
    return;
  }
  mouseX=e.clientX; mouseY=e.clientY;
  if(carry) moveCarry();
  updateItemTip();
});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement!==canvas) mining=false;
  else lockFresh=true;
});
canvas.addEventListener('wheel',e=>{
  if(modalOpen()) return;
  e.preventDefault();
  player.sel=(player.sel+(e.deltaY>0?1:NBAR-1))%NBAR;
  SND.tap(); updateHUD();
},{passive:false});
addEventListener('keydown',e=>{
  // Tippt man gerade in ein Textfeld (z.B. das Passwortfeld), sollen Tasten
  // wie E/P/Q/Ziffern/Leertaste normal ihr Zeichen eingeben statt als
  // Spielsteuerung abgefangen zu werden — sonst schließt "e" tippen sogar
  // gleich das offene Fenster.
  if(document.activeElement&&document.activeElement.tagName==='INPUT') return;
  if(e.repeat&&e.code!=='Space') return;
  keys[e.code]=true;
  if(e.code==='Escape'){ if(document.pointerLockElement) document.exitPointerLock(); return; }
  if(e.code==='KeyE'){
    e.preventDefault(); ac();
    modalOpen()?hideModal():openCraft(null);
    return;
  }
  if(e.code==='KeyP'){ e.preventDefault(); ac(); togglePause(); return; }
  // Q wirft weg: einzeln, mit Shift den ganzen Stapel.
  if(e.code==='KeyQ'){
    e.preventDefault(); ac();
    if(!modalOpen()&&!state.paused) dropHeld(e.shiftKey);
    return;
  }
  if(e.code.startsWith('Digit')){
    const i=+e.code.slice(5)-1;
    if(i>=0&&i<NBAR){ e.preventDefault(); player.sel=i; SND.tap(); updateHUD(); }
    return;
  }
  if(e.code==='Space') e.preventDefault();
});
addEventListener('keyup',e=>{ keys[e.code]=false; });
el('btnPause').addEventListener('click',e=>{ e.stopPropagation(); ac(); togglePause(); });
el('btnBag').addEventListener('click',e=>{ e.stopPropagation(); ac(); modalOpen()?hideModal():openCraft(null); });

// ------------------------------------------------------------------ Schleife
function update(dt){
  // Phase 5a: Tag/Nacht ist jetzt eine reine Funktion der Server-Wanduhrzeit
  // (dayEpoch0), nicht mehr lokal aufaddierter dt — das läuft absichtlich
  // UNABHÄNGIG von state.paused weiter: sonst friert die geteilte Welt ein
  // (bzw. läuft aus dem Takt), nur weil DIESER Client gerade sein Inventar
  // offen hat. updateNight läuft mit, weil es genau die Werte liest, die
  // hier gerade gesetzt wurden (Nacht-Toast/Sound/Vogelgezwitscher sollen
  // beim online Spielen ebenfalls nicht an einem geöffneten Menü hängen
  // bleiben). Offline (oder solange nach dem Verbinden noch keine 'welcome'
  // da ist) bleibt exakt der alte, pausierbare Tick-Rückfall.
  const dayOnline=isConnected()&&dayEpoch0!=null;
  if(dayOnline){
    const elapsed=(Date.now()-dayEpoch0)/1000;
    state.day=1+Math.floor(elapsed/DAYLEN);
    state.dayT=(elapsed%DAYLEN)/DAYLEN;
    updateNight(dt);
  }else if(!state.paused){
    state.dayT+=dt/DAYLEN;
    if(state.dayT>=1){ state.dayT=0; state.day++; }
    updateNight(dt);
  }
  if(!state.paused){
    state.t+=dt;
    updateVitals(dt);
    if(isConnected()) updateMobsOnline(dt); else updateMobs(dt);
    updateDrops(dt);
    updatePots(dt);
    updateGrow();
  }
  updatePlayer(dt);
  updateTarget();
  updateMining(dt);
  flushChunks();
  cullChunks();
  updateChars(dt);
  updateBillboards();
  updateRemotePlayers(dt);
  updateSky();
  // Eigene Position senden — unabhängig von state.paused: wer nur sein eigenes
  // Inventar geöffnet hat, ist für andere trotzdem noch "da" und bewegt sich
  // bei ihnen ja auch nicht plötzlich nicht mehr.
  netSendT+=dt;
  if(netSendT>=.1){
    netSendT=0;
    if(isConnected()) send({t:'pos',x:player.x,y:player.y,z:player.z,yaw:player.yaw,pitch:player.pitch,hp:player.hp,food:player.food,sel:player.sel});
  }
  state.checkT+=dt;
  if(state.checkT>=.5){
    state.checkT=0; updateHUD();
    if(++state.saveTick>=6){ state.saveTick=0; savePersist(); }
  }
}
let last=performance.now(), frameErrs=0;
function frame(now){
  // Nächstes Bild zuerst anfordern: ein Fehler in update() soll die Schleife
  // nicht abreißen lassen, sonst friert das ganze Spiel ein.
  requestAnimationFrame(frame);
  let dt=Math.min((now-last)/1000,.1); last=now;
  dt*=(window.__speed||1);
  try{
    update(dt);
    renderer.render(scene,camera);
  }catch(e){
    if(++frameErrs<4) console.error(e);
  }
}
function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.updateProjectionMatrix();
}
addEventListener('resize',resize);
addEventListener('beforeunload',savePersist);

// ------------------------------------------------------------------ Start
// Sprites vorladen, damit die Leiste nicht erst leer ist und dann aufploppt.
// Fehlt eines, wird nicht abgebrochen — dann greift der alt-Text.
const preload=src=>new Promise(res=>{
  const i=new Image(); i.onload=i.onerror=()=>res(); i.src=src;
});
// Die Gegenstandsbildchen braucht es zweimal: als Bild fürs Fenster und als
// Textur für den Würfel, der herumliegt. Fehlt eines, bleibt ITEM_TEX leer
// und der Würfel nimmt die Notfalltextur — abgebrochen wird deswegen nicht.
const loadItemTex=id=>loadTex(iconSrc(id)).then(t=>{
  t.magFilter=THREE.NearestFilter;
  t.minFilter=THREE.NearestMipmapLinearFilter;
  ITEM_TEX[id]=t;
}).catch(()=>{});
const UISPRITES=['heart_full','heart_half','heart_empty','food_full','food_half','food_empty',
                 'icon_bag','icon_book','icon_pause'];
Promise.all([
  ...[...ICONS].map(id=>loadItemTex(id)),
  preload('./sprites/items/page1.png'),
  ...UISPRITES.map(n=>preload('./sprites/ui/'+n+'.png')),
  ...[...new Set(CHARS.map(c=>c.key))].map(k=>loadTex(k+'.png').then(t=>{CHAR_TEX[k]=t;})),
  loadTex('benni.png').then(t=>{benniTex=t;}),
  // Die Frucht trägt sein Gesicht: fertig zusammengesetzt in
  // sprites/items/dominik_face.png, durchsichtig rundherum.
  loadTex('./sprites/items/dominik_face.png').then(t=>{
    t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestMipmapLinearFilter;
    TEX.dominik=t;
  }),
]).then(()=>{
  setupChars();
  buildHotbar();
  buildWorld();
  emitTorches();
  loadPersist();
  player.y=player.viewY=surfaceAt(player.x,player.z);
  el('hRecMax').textContent=RECIPES.length;
  el('hGoal').textContent=GOAL;
  resize(); updateHUD();
  el('boot').remove();
  // Steht gerade eine Passwortabfrage aus (siehe bootNet() weiter oben),
  // entscheidet die über den Übergang — sonst wie gehabt.
  if(!awaitingPassword) afterAuth();
  requestAnimationFrame(frame);
}).catch(e=>{
  el('boot').innerHTML='😢 '+e.message;
  console.error(e);
});

// ------------------------------------------------------------------ Debug-API
window.game={state,player,slots,ITEMS,BLOCKS,RECIPES,known,grid,chests,torches,mobs,
  CHARS,traders,traderSpots,chestSpots,openTrade,doTrade,aimChar,saltVein,beyondRiver,BOUND,
  drops,pots,spawnDrop,dropHeld,giveOrDrop,updateDrops,usePot,potAdd,potRecipe,potTip,
  POT_CAP,COOK_TIME,fills,fillsAt,waterAt,WATER_Y,FALL_FREE,MARKET,SHOP,PRICES,GOAL,
  openMarket,sellTo,buyFrom,earn,growing,updateGrow,GROW,SEED_OF,till,plantSeed,
  makeOffer,offerAsk,offerHint,updateChars,wander,REFRESH,
  get marketChar(){return marketChar;},
  get dayEpoch0(){return dayEpoch0;},
  get tradePartner(){return tradePartner;}, set tradePartner(c){tradePartner=c;},
  get aimed(){return aimed;},
  blockAt,setBlock,surfaceAt,terrainH,rayPick,chunks,scene,renderer,remotePlayers,
  give:(id,n)=>give(id,n), take,countOf,
  get target(){return target;},
  get sel(){return heldId();},
  openCraft,openChest,attack,spawnMob,hurtPlayer,updateHUD,breakBlock,updatePots,
  learnRecipe,matchRecipe,craftFromGrid,patRows,recCard,sideHTML,updatePotPanel,icon,iconSrc,
  clickCell,takeFromChest,hideModal,showCrack,CRACKS,updateItemTip,itemNote,
  faceVerts,crossVerts,scenery,REACH,EYE,collides,keys,
  carried(){return carry;},
  tp(x,z,yaw){
    player.x=clamp(x,BOUND.x0,BOUND.x1); player.z=clamp(z,BOUND.z0,BOUND.z1);
    player.y=player.viewY=player.fallFrom=surfaceAt(player.x,player.z);
    player.vy=0; player.onGround=true;
    if(yaw!=null) player.yaw=yaw; updatePlayer(0); updateTarget(); },
  look(yaw,pitch){ player.yaw=yaw; player.pitch=pitch; updatePlayer(0); updateTarget(); },
  mine(){ if(!target) return false; const t=target.type;
    if(BLOCKS[t].noBreak) return false;
    breakBlock(target.cell.x,target.cell.y,target.cell.z,t); updateTarget(); return true; },
  place(){ useRight(); },
  setDayT(v){ state.dayT=v; updateNight(0); },
  tick(sec,s=.05){ for(let t=0;t<sec;t+=s) update(s); },
  // Phase 3b Netzwerk-Debug-Hooks: erlauben Tests, rohe Nachrichten zu
  // schicken/den eigenen Verbindungsstatus abzufragen, ohne echte
  // Spielhandlungen (Wurf-Physik, echtes Warten auf COOK_TIME) nachstellen
  // zu müssen.
  send, getPid, isConnected, finishCook, potCount,
};
