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
  MOBS, mobCap, bloodMoon, KB_DRAG, FLY_H, MOB_SPAWN_MIN, MOB_SPAWN_MAX,
  CHICKEN_CAP, CHICKEN_NEAR_R, EGG_MIN, EGG_MAX,
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
// Wird das Gerät mit dem Finger bedient? Gefragt ist nicht "ist es ein Handy"
// (Bildschirmbreite lügt: ein schmales Fenster am Schreibtisch ist keins),
// sondern wie genau gezeigt werden kann. `pointer:coarse` ist genau das —
// ein Finger trifft ungenauer als ein Mauszeiger. maxTouchPoints daneben
// fängt die Geräte mit beidem ab. Steht ganz oben, weil schon der Renderer
// weiter unten davon abhängt (weniger Pixel auf einer Handy-Grafik).
const TOUCH=(matchMedia?.('(pointer:coarse)').matches)||navigator.maxTouchPoints>0;
document.body.classList.toggle('touch',TOUCH);

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
// rate verstellt die Wiedergabegeschwindigkeit mit — tiefer klingt ein Schrei
// verzerrt und schwer, höher schrill und dünn. So bekommen die Benni-Varianten
// ihre eigene Stimme, ohne dass eine einzige neue Sounddatei nötig wäre.
function playSample(name,vol=1,rate=1){
  const c=ac(); if(!c||!SAMPLES[name]) return false;
  if(c.state==='suspended') c.resume();
  const src=c.createBufferSource(),g=c.createGain();
  src.buffer=SAMPLES[name]; g.gain.value=vol; src.playbackRate.value=rate;
  src.connect(g).connect(c.destination); src.start(); return true;
}
async function loadSample(name,url){
  try{ const buf=await fetch(url).then(r=>r.arrayBuffer());
    if(AC) SAMPLES[name]=await AC.decodeAudioData(buf); else _pd.push([name,buf]);
  }catch(e){}
}
// Kein Sample fürs Knallen — ein weißes Rauschen reicht, einmal gebaut und
// dann immer wieder abgespielt, statt es jedes Mal neu auszuwürfeln.
let _boomBuf=null;
function boomNoise(dur,vol){
  const c=ac(); if(!c) return;
  if(c.state==='suspended') c.resume();
  if(!_boomBuf){
    _boomBuf=c.createBuffer(1,c.sampleRate*.3,c.sampleRate);
    const d=_boomBuf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  }
  const src=c.createBufferSource(),g=c.createGain();
  src.buffer=_boomBuf;
  g.gain.setValueAtTime(vol,c.currentTime);
  g.gain.exponentialRampToValueAtTime(.001,c.currentTime+dur);
  src.connect(g).connect(c.destination); src.start();
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
  // Ein kurzes Gackern-Zwitschern, wenn ein Huhn ein Ei legt (siehe
  // updateChicken/stepChicken) — zwei helle, schnell aufeinander folgende
  // Töne statt eines echten Sample, genau wie pop/craft oben.
  egg:()=>{tone(880,.05,'sine',.06);tone(1180,.06,'sine',.05,.055);},
  night:()=>{tone(160,.5,'sine',.09);tone(120,.6,'sine',.08,.2);},
  // Ein tiefes, lang ausklingendes Anschwellen statt der kurzen Nacht-Töne —
  // dieselben drei Oszillatoren, nur tiefer und länger gehalten.
  bloodMoon:()=>{tone(70,1.6,'sawtooth',.11);tone(52,2,'sine',.1,.3);tone(38,2.6,'sawtooth',.08,.6);},
  dawn:()=>{tone(523,.14,'triangle',.08);tone(659,.14,'triangle',.08,.12);tone(784,.2,'triangle',.08,.24);},
  chest:()=>{tone(440,.09,'triangle',.08);tone(660,.12,'triangle',.08,.08);},
  book:()=>{tone(659,.12,'triangle',.09);tone(988,.18,'triangle',.09,.11);},
  win:()=>{tone(523,.14,'triangle',.1);tone(659,.14,'triangle',.1,.14);
           tone(784,.14,'triangle',.1,.28);tone(1046,.3,'triangle',.1,.42);},
  step:()=>tone(90+Math.random()*30,.05,'triangle',.03),
  land:()=>tone(110,.07,'triangle',.05),
  fail:()=>tone(160,.15,'square',.06),
  // Knaller: Rauschstoß fürs Krachen, zwei tiefe Sägezahntöne für den Wumms.
  boom:()=>{boomNoise(.28,.35);tone(65,.24,'sawtooth',.2);tone(42,.32,'sawtooth',.16,.04);},
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
  blockAt, solidAt, fills, fillsAt, waterAt, surfaceAt, safeSpot, mobBlocked, losClear, litAt,
  setBlock: setBlockData,
}=world;

// ------------------------------------------------------------------ Zustand
const state={t:0,day:1,dayT:.06,night:false,paused:true,started:false,
  mined:0,placed:0,killed:0,deaths:0,crafted:0,chests:0,trades:0,won:false,checkT:0,saveTick:0,
  underwater:false,money:0,earned:0,sold:0,bought:0,planted:0,
  spikes:0};                            // verworfene Maus-Ausreisser, siehe unten

const player={x:0,z:18,y:0,viewY:0,vy:0,onGround:true,wet:false,yaw:0,pitch:-.05,
  hp:20,maxhp:20,food:20,maxfood:20,regenT:0,starveT:0,
  bob:0,stepT:0,atkCd:0,hurtT:0,invT:0,fallFrom:0,sel:0,
  // Besitz und Wahl der Skins von Manni (siehe SKINS) — gehören zum
  // Spielerzustand, NICHT zu slots: ein Skin ist kein Gegenstand, der aus
  // dem Rucksack fallen oder weggeworfen werden könnte. Index 0 (Standard)
  // ist immer "gekauft".
  skins:[0], skin:0};

// ------------------------------------------------------------------ Speichern
// Nur die sinnvollen Felder sichern; transiente Pro-Frame-Physik (vy,
// onGround,wet,bob,stepT,atkCd,hurtT,invT,fallFrom) soll beim Laden neu
// starten statt in einem seltsamen Zwischenzustand aufzutauchen.
// Die Schlüssel tragen eine 2, seit die Welt einmal zurückgesetzt wurde
// (Wurfweiten, Monstertruck, Skins — der Server hat dazu passend seinen
// Speicherschlüssel auf "world2" gehoben, siehe STORAGE_KEY dort). Rucksack
// und Standort fangen damit von vorn an, statt dass jemand mit vollen Taschen
// in einer nagelneuen Welt aufwacht. Das Passwort (edf_pw) und der gesehene
// Willkommensgruß (edf_seen) hängen nicht an der Welt und bleiben, wo sie sind.
function savePersist(){
  try{
    const{x,y,z,yaw,pitch,hp,food,skins,skin}=player;
    localStorage.setItem('edf_player2',JSON.stringify({x,y,z,yaw,pitch,hp,food,skins,skin}));
    localStorage.setItem('edf_slots2',JSON.stringify(slots));
  }catch(e){}
}
function loadPersist(){
  try{
    const p=JSON.parse(localStorage.getItem('edf_player2'));
    if(p) Object.assign(player,p);
  }catch(e){}
  // Ein beschädigter oder älterer Speicherstand darf nie zu einem Index
  // außerhalb SKINS oder einer leeren Besitzliste führen — sonst bliebe die
  // eigene Figur unsichtbar oder mit einem falschen Skin gebaut.
  if(!Array.isArray(player.skins)) player.skins=[0];
  player.skins=player.skins.filter(i=>Number.isInteger(i)&&i>=0&&i<SKINS.length);
  if(!player.skins.includes(0)) player.skins.push(0);
  if(!Number.isInteger(player.skin)||!player.skins.includes(player.skin)) player.skin=0;
  try{
    const s=JSON.parse(localStorage.getItem('edf_slots2'));
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

// VIEW ist die Sichtweite fürs Ausblenden ganzer Chunks, FOG_FAR die des
// Nebels — sie gehören zusammen: was im Nebel verschwindet, muss nicht mehr
// gezeichnet werden. Beide sind mit der vervierfachten Weltfläche etwas
// gesunken (vorher 145/140): früher war die ganze Welt 145 Blöcke breit,
// "alles sehen" hieß also 49 Chunks, jetzt wären es bei gleicher Sichtweite
// rund 150 — dreimal so viel Geometrie je Bild, das meiste davon Land, das
// ohnehin im Dunst liegt. Gemessen (Chromium, Startpunkt): 534 Zeichenaufrufe
// bei 145, 413 bei 125, vorher 187. Wer eine kräftige Grafikkarte hat, kann
// hier bedenkenlos wieder hochdrehen — es sind nur diese zwei Zahlen.
// Am Handy sieht man deutlich kürzer. Nicht aus Geschmack, sondern weil eine
// Telefongrafik sonst aussteigt: bei voller Sichtweite hängen rund 930 Netze
// mit gut einer halben Million Dreiecken in der Szene, und wenn Chrome dabei
// den Grafikprozess verliert, bleibt eine WEISSE Fläche zurück, auf der die
// Bedienung weiterläuft (siehe den contextlost-Zuhörer beim Renderer). Kürzer
// sehen heißt weniger Chunks, weniger Geometrie, weniger Speicher.
const CHUNK=24, VIEW=TOUCH?78:125, FOG_FAR=TOUCH?74:120;
// Zum Start wird nur der engere Kreis vernetzt; der Rest wächst in den ersten
// Sekunden nach (cullChunks) statt den Ladebildschirm zu verlängern.
const BOOT_VIEW=72;

// ------------------------------------------------------------------ Renderer
let renderer,scene,camera;
try{
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
}catch(e){
  el('boot').innerHTML='😢 Dein Browser kann kein WebGL.';
  throw e;
}
// Auf dem Handy weniger Pixel: ein Telefon meldet gern devicePixelRatio 3,
// und drei mal so viele Bildpunkte kosten dieselbe Grafik dreimal so viel
// Arbeit — bei diesem Klötzchenbild sieht man den Unterschied kaum, das
// Ruckeln dagegen sofort. 1.25 ist der Punkt, an dem die Pixelschrift auf
// einem kleinen Bildschirm noch sauber steht.
renderer.setPixelRatio(Math.min(devicePixelRatio||1,TOUCH?1.25:1.75));
// Schatten kosten einen zweiten Durchgang durch die ganze sichtbare Geometrie.
// Am Schreibtisch ist das keine Rede wert, auf dem Telefon ist es der teuerste
// einzelne Posten — und ohne Schatten sieht die Klötzchenwelt zwar flacher,
// aber immer noch richtig aus. Lieber flach als weiß (siehe VIEW oben).
renderer.shadowMap.enabled=!TOUCH;
renderer.shadowMap.type=THREE.PCFShadowMap;
// Verliert das Telefon den Grafikkontext (Speichernot, App im Hintergrund,
// abgestürzter Grafikprozess), hört WebGL einfach auf zu zeichnen: die
// Bedienung läuft weiter, das Bild bleibt WEISS stehen. Ohne diesen Zuhörer
// sieht das aus wie ein kaputtes Spiel, ohne einen Hinweis, was los ist.
// preventDefault() ist Pflicht, sonst versucht der Browser gar nicht erst,
// den Kontext wiederherzustellen.
let glLost=false;
renderer.domElement.addEventListener('webglcontextlost',e=>{
  e.preventDefault();
  glLost=true;
  toast('🧊 Grafik verloren — versuche neu zu starten …','warn',6000);
});
renderer.domElement.addEventListener('webglcontextrestored',()=>{
  glLost=false;
  toast('🧊 Grafik ist wieder da.','good',2500);
});
// autoClear bleibt AN. Es stand hier eine Weile auf false, weil frame() nach
// der Weltszene noch die Hand obendrauf rendert und beides sich ein Bild
// teilen muss — das Löschen übernahm dann ein eigenes renderer.clear().
// Das war ein Griff daneben: damit hing das Löschen des GANZEN Bildes an
// einer einzelnen Zeile in frame(), und wo die nicht ankommt, lädt eine
// Handy-Grafik (die rechnen kachelweise und heben das vorige Bild auf) das
// alte Bild einfach wieder hoch. Sichtbar wird das als Schlieren: ein
// laufender Benni oder ein fliegender Basketball hinterlässt eine ganze Kette
// von Abzügen quer über den Bildschirm, während Gelände und Bedienung sauber
// bleiben (die stehen ja still und werden jedes Bild neu darübergemalt).
// Jetzt löscht wieder three.js selbst, auf dem ausgetretenen Pfad, und nur
// für den einen Moment des Hand-Durchgangs wird es abgeschaltet (s. frame()).
document.body.insertBefore(renderer.domElement,document.body.firstChild);

scene=new THREE.Scene();
scene.fog=new THREE.Fog(0x9fd0e8,46,FOG_FAR);
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
  // Kohleader: derselbe Fels wie beim Salz, nur mit dunklen statt hellen Nestern.
  coalore:noiseTex(['#8e8e8e','#828282','#9a9a9a','#787878'],24,g=>{
    for(const [x,y] of [[3,2],[10,4],[12,9],[5,11],[7,3],[2,13]]){
      g.fillStyle='#26221e'; g.fillRect(x,y,2,2);
      g.fillStyle='#131110'; g.fillRect(x,y+1,1,1); g.fillRect(x+1,y,1,1);
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
  // Kohle: ein dunkler Klumpen, freigestellt — Gegenstand, keine Blockfläche.
  coal   :pixTex(g=>{
    const cols=['#232323','#2c2c2c','#1a1a1a','#333333'], r=mulberry(68);
    for(let y=4;y<12;y++) for(let x=3;x<13;x++){
      if(Math.hypot(x-8,y-8)>4.4-r()*1.2) continue;
      g.fillStyle=cols[Math.floor(r()*cols.length)]; g.fillRect(x,y,1,1);
    }
    g.fillStyle='#4a4a4a'; g.fillRect(6,5,2,1); g.fillRect(9,9,1,1);  // Glanzlichter
  }),
  // Schnur: ein loses Knäuel aus überlappenden Schlaufen, freigestellt.
  string :pixTex(g=>{
    g.fillStyle='#e8dcc0';
    for(const [cx,cy,rad] of [[6,6,3.4],[10,10,3.4],[8,4,2.6]])
      for(let y=0;y<16;y++) for(let x=0;x<16;x++){
        const d=Math.hypot(x-cx+.5,y-cy+.5);
        if(d>rad-.9&&d<rad) g.fillRect(x,y,1,1);
      }
  }),
  // Schleuder: hölzerne Gabel mit gespanntem Band, freigestellt.
  sling  :pixTex(g=>{
    g.fillStyle='#8a6535';
    g.fillRect(7,9,2,6);                                    // Griff
    [[7,8],[6,7],[6,6],[5,5],[5,4],[4,3]].forEach(([x,y])=>g.fillRect(x,y,1,1));
    [[8,8],[9,7],[9,6],[10,5],[10,4],[11,3]].forEach(([x,y])=>g.fillRect(x,y,1,1));
    g.fillStyle='#caa96a';
    g.fillRect(4,2,1,2); g.fillRect(11,2,1,2);
    g.fillRect(5,2,6,1);                                    // das gespannte Band
  }),
  // Basketball: wie der Pilz mit Sorgfalt gezeichnet — genoppte Kugel mit
  // den dunklen Nahtlinien, freigestellt.
  ball   :pixTex(g=>{
    const cols=['#e07a1f','#d46f18','#eb8a2e','#c96814'], r=mulberry(53);
    const cx=7.5,cy=7.5,rad=6.4;
    for(let y=1;y<15;y++) for(let x=1;x<15;x++){
      if(Math.hypot(x-cx,y-cy)>rad) continue;
      g.fillStyle=cols[Math.floor(r()*cols.length)]; g.fillRect(x,y,1,1);
    }
    g.fillStyle='#2a1608';                                  // die Nähte
    for(let y=2;y<14;y++) g.fillRect(7,y,1,1);
    for(let x=2;x<14;x++) g.fillRect(x,7,1,1);
    [[3,3],[2,5],[2,7],[2,9],[2,11],[3,13],
     [12,3],[13,5],[13,7],[13,9],[13,11],[12,13]].forEach(([x,y])=>g.fillRect(x,y,1,1));
  }),
  // Knaller: roter Zylinder mit brennender Lunte, freigestellt.
  cracker:pixTex(g=>{
    g.fillStyle='#c9302a'; g.fillRect(6,5,4,9);
    g.fillStyle='#8e2620'; g.fillRect(6,5,1,9); g.fillRect(9,5,1,9);
    g.fillStyle='#2a2a2a'; g.fillRect(6,4,4,1); g.fillRect(6,13,4,1);  // Kappen
    g.fillStyle='#e8dcc0'; g.fillRect(7,2,1,2); g.fillRect(8,1,1,1);   // Lunte
    g.fillStyle='#ffb03a'; g.fillRect(8,0,2,2);                       // Funke
    g.fillStyle='#ff6a1a'; g.fillRect(9,0,1,1);
  }),
  // Aquariendünger: ein Fläschchen mit einer Flüssigkeit, die nicht ganz
  // natürlich aussieht — mehr wird hier bewusst nicht verraten.
  fert   :pixTex(g=>{
    g.fillStyle='#cfe0df'; g.fillRect(6,3,4,2); g.fillRect(5,5,6,9);   // Glas
    g.fillStyle='#3a2418'; g.fillRect(6,1,4,2);                       // Korken
    g.fillStyle='#5fd6a0'; g.fillRect(6,8,4,5);                       // die Flüssigkeit
    g.fillStyle='#8f2fb0'; g.fillRect(7,9,1,1); g.fillRect(9,11,1,1); // ein Schimmer, der so nicht sein sollte
    g.fillStyle='#213331'; g.fillRect(5,13,6,1);
  }),
  // Ei: klassische Eiform (oben schmaler als unten, keine reine Ellipse),
  // freigestellt wie die übrigen gezeichneten Bildchen.
  egg    :pixTex(g=>{
    const cols=['#f7ecd8','#efe0c2','#fff6e6'], r=mulberry(151);
    const cx=8,cy=9,rx=4,ry=5.2;
    for(let y=2;y<15;y++) for(let x=3;x<14;x++){
      const ny=(y-cy)/ry, nx=(x-cx)/rx, taper=ny<0?1-ny*.4:1;   // oben spitzer
      if((nx/taper)**2+ny*ny>1) continue;
      g.fillStyle=cols[Math.floor(r()*cols.length)]; g.fillRect(x,y,1,1);
    }
    g.fillStyle='rgba(255,255,255,.5)'; g.fillRect(5,5,2,3);    // Glanzlicht
  }),
  // Rohes Hähnchen: eine Keule — rosa Fleisch über einem weißen Knochenende,
  // freigestellt.
  meat   :pixTex(g=>{
    g.fillStyle='#e8dcc0'; g.fillRect(6,12,4,3);                // Knochen
    g.fillStyle='#d8c9a8'; g.fillRect(7,14,2,1);
    const cols=['#e8918a','#dd7d75','#f0a49c'], r=mulberry(152);
    const cx=8,cy=7,rx=5,ry=4.4;
    for(let y=2;y<12;y++) for(let x=2;x<14;x++){
      if(((x-cx)/rx)**2+((y-cy)/ry)**2>1) continue;
      g.fillStyle=cols[Math.floor(r()*cols.length)]; g.fillRect(x,y,1,1);
    }
    g.fillStyle='#b85850'; g.fillRect(4,4,2,1); g.fillRect(11,9,2,1);  // Schatten
  }),
  // Monstertruck: von oben gezeichnet, weil bei 16×16 Pixeln eine Seitenansicht
  // kaum vier Räder zeigen könnte — so stehen sie deutlich als dicke, dunkle
  // Klötze an den vier Ecken der Karosserie heraus, mit Frontscheibe und
  // Chromleiste dazwischen. Freigestellt wie die übrigen gezeichneten Bildchen.
  truck  :pixTex(g=>{
    g.fillStyle='#c8371f'; g.fillRect(4,2,8,12);                      // Karosserie
    g.fillStyle='#8f2411'; g.fillRect(4,2,8,1); g.fillRect(4,13,8,1);  // Kanten
    g.fillStyle='#1c232c'; g.fillRect(5,3,6,3);                       // Frontscheibe, dunkel
    g.fillStyle='#e8dfc4'; g.fillRect(5,7,6,1);                       // Chromleiste
    g.fillStyle='#151515';
    for(const [x,y] of [[1,2],[12,2],[1,10],[12,10]]) g.fillRect(x,y,3,4); // vier dicke Räder
    g.fillStyle='#4a4a4a';
    for(const [x,y] of [[2,3],[13,3],[2,11],[13,11]]) g.fillRect(x,y,1,2); // Nabenglanz
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
  chest   :{ic:'🧰',nm:'Truhe',       block:'chest'},
  pot     :{ic:'🍲',nm:'Kochtopf',    block:'pot'},
  torch   :{ic:'🔥',nm:'Fackel',      torch:true},
  sign    :{ic:'🪧',nm:'Schild',      sign:true},
  stick   :{ic:'🥢',nm:'Stock'},
  dominik :{ic:'🍑',nm:'Dominik',     food:4},
  mushroom:{ic:'🍄',nm:'Pilz',        food:2},
  // Vom friedlichen Huhn (siehe MOBS.chicken in shared/world.js): das Ei
  // fällt von selbst ab und zu, das Fleisch nur, wenn es stirbt (loot dort).
  // Kein Sprite unter sprites/items/ nötig — beide bekommen ein gezeichnetes
  // pixTex-Bild wie ball/cracker (siehe TEX unten, ICONS bleibt ohne sie).
  egg     :{ic:'🥚',nm:'Ei',          food:2},
  meat    :{ic:'🍖',nm:'Rohes Hähnchen',food:3},
  salt    :{ic:'🧂',nm:'Salz'},
  pepper  :{ic:'🌶️',nm:'Pfeffer'},
  // Saatgut. seed sagt, was daraus wird: erst der Setzling, dann die Ernte.
  kern    :{ic:'🌰',nm:'Dominikkern', seed:{sprout:'sprout_d',ripe:'bush'}},
  mycel   :{ic:'🧫',nm:'Myzel',       seed:{sprout:'sprout_m',ripe:'shroom'}},
  korn    :{ic:'🌾',nm:'Pfefferkorn', seed:{sprout:'sprout_p',ripe:'pepper'}},
  hoe     :{ic:'🧑‍🌾',nm:'Hacke',       hoe:true},
  sword   :{ic:'⚔️',nm:'Steinschwert',dmg:6, kb:3},
  axe     :{ic:'🪓',nm:'Steinaxt',    dmg:4, axe:true, kb:2.5},
  pick    :{ic:'⛏️',nm:'Spitzhacke',  dmg:3, pick:true, kb:2},
  compote :{ic:'🍯',nm:'Dominik-Kompott',food:8},
  panfry  :{ic:'🍳',nm:'Pilzpfanne',  food:10},
  soup    :{ic:'🍲',nm:'Dominik-Suppe',food:20},
  // Die Gerichte, die mit dem Huhn dazugekommen sind (Rezepte s.
  // shared/economy.js). Sie tragen bewusst KEIN gezeichnetes Bildchen und
  // stehen auch nicht in ICONS: dann liefert iconSrc() nichts, und icon()
  // fällt sauber auf das Emoji zurück (derselbe Weg, den Truhe und Schild
  // schon immer gehen). Ein Teller Essen ist als Emoji sofort zu erkennen —
  // dafür lohnt keine 16×16-Zeichnung.
  salat   :{ic:'🥗',nm:'Pfeffersalat', food:6},
  pfannkuchen:{ic:'🥞',nm:'Pfannkuchen',food:8},
  roast   :{ic:'🍗',nm:'Brathähnchen', food:12},
  omelett :{ic:'🥘',nm:'Bauernomelett',food:10},
  kuchen  :{ic:'🥧',nm:'Dominikkuchen',food:12},
  eintopf :{ic:'🍛',nm:'Hühnereintopf',food:14},
  // Vom Markt, nicht aus dem Raster. Sie wirken, solange man sie in der
  // Hand hält — deshalb steht ihre Wirkung an einem Merkmal und nicht in
  // einem eigenen Ausrüstungsfach.
  boat    :{ic:'🛶',nm:'Boot',        boat:true},
  board   :{ic:'🛹',nm:'Skateboard',  board:true},
  glider  :{ic:'🪂',nm:'Gleitschirm', glide:true},
  truck   :{ic:'🚚',nm:'Monstertruck',monster:true},
  // Was aus dem Topf kommt, wenn die Zutaten nicht zusammenpassen. Essbar
  // ist es gerade noch.
  junk    :{ic:'🤢',nm:'Angebrannte Pampe',food:1},
  // Phase A: neue Rohstoffe, Waffen und ein Fläschchen, das nichts von sich preisgibt.
  string  :{ic:'🧵',nm:'Schnur'},
  coal    :{ic:'⚫',nm:'Kohle'},
  fert    :{ic:'🧪',nm:'Aquariendünger', mystery:true},
  // sp/lift/grav bestimmen die Flugbahn (s. "Wurfgeschosse" unten) — Schleuder
  // schießt schnell und flach (kaum Schwerkraft), Basketball fliegt im hohen
  // Bogen weit, der Knaller bleibt bei seinen alten Werten (Defaults im
  // Abschuss-Code) und damit bewusst eine Nahbereichswaffe. `far` ist nur ein
  // Hinweis für itemNote unten, keine Spielmechanik.
  sling   :{ic:'🏹',nm:'Schleuder',      sling:true, ammo:'dominik', dmg:4, kb:2, sp:34, grav:.45, far:true},
  ball    :{ic:'🏀',nm:'Basketball',     throw:'ball',    dmg:5, kb:4, sp:17, lift:4.5, grav:.75, far:true},
  cracker :{ic:'🧨',nm:'Knaller',        throw:'cracker', dmg:7, kb:7, blast:3.5, fuse:1.1},
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
// Die bloße Faust stößt ein bisschen, ein Schwert stößt richtig.
const heldKb=()=>{ const id=heldId(); return (id&&ITEMS[id]?.kb)||.5; };

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
// 'chest'/'sign' bewusst nicht dabei: es gibt kein sprites/items/chest.png
// bzw. sign.png, und ein <img> mit 404 zeigt in manchen Browsern das
// kaputte-Bild-Symbol statt sauber auf den alt-Text (das Emoji) auszuweichen
// — ganz ohne <img>-Versuch bleibt es zuverlässig beim Emoji.
const ICONS=new Set(['dirt','stone','sand','snow','log','plank','brick','bench','pot','torch',
                     'stick','dominik','mushroom','salt','pepper','sword','axe','pick',
                     'compote','panfry','soup','junk','boat','board','glider',
                     'hoe','kern','mycel','korn']);
// Dominik trägt sein Gesicht — im Rucksack wie am Baum dasselbe Bild.
const ICON_ALT={dominik:'dominik_face'};
// Die neuen Sachen — Schnur, Kohle, Dünger, Schleuder, Ball, Knaller — haben
// kein Sprite im Ordner, sondern ein gezeichnetes (siehe TEX). Hinter einer
// pixTex steckt ein Canvas, und das gibt sein Bild direkt als Datenadresse
// heraus: damit steht das Gezeichnete im Fenster genauso da wie ein geladenes
// PNG, statt auf das Emoji zurückzufallen (⚫ sähe im Rucksack aus wie ein
// verirrter Punkt). Einmal ausgerechnet und gemerkt — toDataURL ist teuer,
// und die Leiste zeichnet sich oft neu.
const _drawn={};
function drawnSrc(id){
  if(_drawn[id]!==undefined) return _drawn[id];
  const c=TEX[id]?.image;                // geladene PNG-Texturen sind <img>, die können das nicht
  let s=null;
  // toDataURL kann unter Speichernot fehlschlagen und dabei eine leere
  // Adresse ("data:," o.ä.) zurückgeben statt zu werfen. Die ist wahr genug
  // für ein <img>, zeigt aber nur das Kaputt-Bild-Symbol des Browsers. Lieber
  // gar keine Adresse: dann fällt icon() sauber auf das Emoji zurück.
  try{ if(c&&c.toDataURL) s=c.toDataURL(); }catch(e){}
  if(!s||s.length<32) s=null;
  return _drawn[id]=s;
}
const iconSrc=id=>ICONS.has(id)?'./sprites/items/'+(ICON_ALT[id]||id)+'.png':drawnSrc(id);
// Was ein Gegenstand kann, in einer Zeile — für die Schwebehilfe.
function itemNote(id){
  const it=ITEMS[id]; if(!it) return '';
  if(it.mystery) return '???';                              // der Dünger erklärt sich nie
  const p=[];
  if(it.food) p.push('🍗'+it.food);
  if(it.dmg) p.push('⚔️'+it.dmg);
  if(it.axe) p.push('🪓 schnell bei Holz');
  if(it.pick) p.push('⛏️ schnell bei Stein');
  if(it.torch) p.push('🔥 hält Bennis fern');
  if(it.sign) p.push('🪧 beschreibbar');
  if(it.hoe) p.push('🧑‍🌾 macht Gras und Erde zu Acker');
  if(it.seed) p.push('🌱→'+ITEMS[BLOCKS[it.seed.ripe].drop].ic);
  // Schleuder feuert Dominiks, nicht Bolzen — das steht nirgends sonst.
  if(it.sling) p.push('🏹→'+ITEMS[it.ammo].ic);
  if(it.far) p.push('🎯 weit');                             // Schleuder/Basketball, s. sp/grav in ITEMS
  if(it.blast) p.push('💥'+it.blast);
  if(it.boat||it.board||it.glide||it.monster) p.push(it.ic);
  // Der Truck fährt nicht nur schnell — er räumt sich seinen Weg selbst frei
  // (siehe truckSmash). Das gehört in die Schwebehilfe, sonst wundert man
  // sich beim ersten Zusammenstoß, wohin der Block verschwunden ist.
  if(it.monster) p.push('🚚 rasend an Land · bricht Blöcke im Weg');
  if(PRICES[id]) p.push('💶'+PRICES[id]+' €');
  if(it.block) p.push('setzbar');
  const used=RECIPES.filter(r=>patRows(r).some(row=>row.includes(id)))
    .filter(r=>known.has(r.id)).map(r=>ITEMS[r.out[0]].ic);
  if(used.length) p.push('Zutat für '+used.slice(0,4).join(''));
  return p.join(' · ');
}
function icon(id,cls=''){
  const it=ITEMS[id];
  if(!it) return '';
  const src=iconSrc(id);
  return src?`<img class="ic ${cls}" src="${src}" alt="${it.ic}" draggable="false">`
            :`<span class="ic ${cls}">${it.ic}</span>`;
}
// Wie icon(), aber für einen Skin (siehe SKINS) — kein ITEMS-Eintrag, also
// auch kein Bildchen, nur dessen Emoji.
function skinIcon(idx,cls=''){ return `<span class="ic ${cls}">${SKINS[idx].ic}</span>`; }

// Die zwei offensichtlichen kennt man von zu Hause, der Rest will gefunden
// oder ausprobiert werden.
const known=new Set(['plank','stick','bench']);
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
// Seit die Welt viermal so groß ist, werden nicht mehr alle Chunks beim Start
// vernetzt: das wären gut dreieinhalb mal so viele wie früher, größtenteils
// für Gegenden, die man in dieser Runde vielleicht nie betritt — sichtbarer
// Ladebildschirm und Geometrie ohne Gegenwert. Zum Start kommt, was in
// Sichtweite liegt, der Rest wächst nach, während man hinläuft (cullChunks).
function chunkCenter(ci,cj){
  return [BOUND.x0+ci*CHUNK+CHUNK/2, BOUND.z0+cj*CHUNK+CHUNK/2];
}
function buildWorld(){
  const r=(BOOT_VIEW+CHUNK)**2;
  for(let i=0;i<NCH;i++) for(let j=0;j<NCH;j++){
    const [cx,cz]=chunkCenter(i,j);
    if((cx-player.x)**2+(cz-player.z)**2<r) buildChunk(i,j);
  }
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

// ------------------------------------------------------------------ Schilder
// signs: "x,y,z" → {text}. Wie Fackeln leben Schilder außerhalb des Block-
// Rasters (kein Würfel, keine Kollision, kein Abbau über das normale
// Grabsystem) — anders als eine Fackel trägt ein Schild aber einen eigenen,
// veränderlichen Zustand (den Text), der wie bei Truhen/Töpfen über eine
// eigene Map läuft und mit dem Server synchronisiert wird (optimistisch,
// kein Wettlauf-Schiedsrichter nötig — siehe die 'sign-*'-Netzwerk-Handler
// weiter unten). Der Text selbst hängt als kamerafester Sprite über dem
// Platzierungspunkt (makeLabel/labelTex sind Funktionsdeklarationen, weiter
// unten im Datei definiert, aber dank Hoisting schon von hier aus aufrufbar
// — genau die Funktionen, die schon für Namensschilder/Sprechblasen laufen).
const signs=new Map();
const signSprites=new Map();              // "x,y,z" → THREE.Sprite (der Text)
const signPost=batch(TEX.log,240);        // rein kosmetischer Pfosten, wie bei Fackeln
const SIGN_MAX=80;                        // muss zum server- UND HTML-seitigen maxlength passen
function emitSignPosts(){
  signPost.count=0;
  for(const key of signs.keys()){
    const [x,y,z]=key.split(',').map(Number);
    blk(signPost,x,y-.35,z,.16);
    blk(signPost,x,y-.14,z,.16);
  }
  signPost.instanceMatrix.needsUpdate=true;
}
// Kurze Zeilen fürs Schild — wie say(), nur ohne dessen 3-Zeilen-Deckel (ein
// Schild darf ruhig etwas mehr zeigen) und mit einem sichtbaren Platzhalter,
// solange niemand etwas draufgeschrieben hat.
function signLines(text){
  if(!text) return ['(leer)'];
  const words=text.split(' ');
  const lines=[]; let cur='';
  for(const w of words){ if((cur+' '+w).trim().length>20){lines.push(cur.trim());cur=w;} else cur+=' '+w; }
  if(cur.trim()) lines.push(cur.trim());
  return lines.slice(0,5);
}
// Legt beim ersten Aufruf Sprite (und kosmetischen Pfosten) an, erneuert die
// Textur sonst nur — ein Aufruf genügt damit sowohl fürs frische Setzen als
// auch für jede spätere Textänderung, ob eigene oder fremde (siehe die
// 'sign-*'-Handler weiter unten und openSignEditor/saveSignEditor).
function ensureSignLabel(x,y,z){
  const key=K(x,y,z);
  const s=signs.get(key);
  if(!s) return null;
  let sp=signSprites.get(key);
  if(!sp){
    sp=makeLabel(signLines(s.text),'#ffe9b0',.42);
    sp.position.set(x,y+1.15,z);
    scene.add(sp);
    signSprites.set(key,sp);
    emitSignPosts();
  }else{
    sp.material.map?.dispose();
    const tex=labelTex(signLines(s.text),'#ffe9b0');
    sp.material.map=tex;
    sp.scale.set(.42*tex.image.width/tex.image.height,.42,1);
  }
  return sp;
}
function removeSignLabel(x,y,z){
  const key=K(x,y,z);
  const sp=signSprites.get(key);
  if(sp){
    scene.remove(sp);
    sp.material.map?.dispose();
    sp.material.dispose();
    signSprites.delete(key);
  }
  emitSignPosts();
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
  // Ohne eigenes Sprite (siehe ICONS) greift die prozedurale TEX-Textur, statt
  // dass ein Basketball oder ein Kohleklumpen als schlichter Erdklotz herumliegt.
  m=new THREE.MeshLambertMaterial(b
    ?{map:TEX[b.tex]||TEX.stone}
    :{map:ITEM_TEX[id]||TEX[id]||TEX.dirt,transparent:true,alphaTest:.5,side:THREE.DoubleSide});
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
// Gemeinsamer Bau-Kern für einen lokalen UND einen von einem anderen Client
// übernommenen Drop (Phase 6) — der einzige Unterschied ist, wer die dropId
// vergibt und ob broadcastet wird, s. spawnDrop/spawnDropRemote unten.
function _mkDrop(dropId,id,n,x,y,z,vx,vy,vz,pickT){
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
           pickT,age:0,t:rnd(0,6.28),dropId};
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
function spawnDrop(id,n,x,y,z,vx=0,vy=0,vz=0,pickT=.35){
  const dropId=`${getPid()??'off'}-${++dropSeq}`;
  const d=_mkDrop(dropId,id,n,x,y,z,vx,vy,vz,pickT);
  if(d&&isConnected()) send({t:'drop-spawn',dropId,id,n,x,y,z,vx,vy,vz});
  return d;
}
// Für eine ankommende drop-spawn-Nachricht: baut denselben Würfel, aber mit
// der schon vom Absender vergebenen dropId und OHNE erneut zu broadcasten —
// sonst prallte dieselbe Nachricht endlos zwischen den Clients hin und her.
function spawnDropRemote(dropId,id,n,x,y,z,vx,vy,vz,pickT=.35){
  return _mkDrop(dropId,id,n,x,y,z,vx,vy,vz,pickT);
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
  updateEyeRay(); _rd.copy(eyeDir);
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
        // Kein Hineinwerfen mehr: der Kochtopf hat jetzt ein eigenes Fenster
        // (Rechtsklick → openPot(), s. Abschnitt "Kochtopf"), in das Zutaten
        // aus dem Rucksack gezogen werden — ein Drop, der zufällig auf einem
        // Topf landet, bleibt darum einfach oben liegen wie auf jedem anderen
        // Block.
        ny=by+1; d.vy=0;
        d.rest=true;
      } else d.rest=false;
    }
    if(wet&&ny>WATER_Y-.42){ ny=WATER_Y-.42; d.vy=0; d.rest=true; }
    d.y=ny;
    if(d.y<BEDROCK-4){ removeDrop(d); continue; }   // normal unerreichbar

    // Was vor Mannis Tresen liegen bleibt und auf seiner Preisliste steht,
    // kauft er auf der Stelle. Alles andere lässt er liegen.
    // Verbunden: wie beim Kochtopf-Claim (s. updatePots) — nicht sofort
    // verkaufen, sonst könnten zwei Clients, die dasselbe Ruhen fast
    // zeitgleich erkennen, denselben Drop beide verkaufen (Geld aus dem
    // Nichts). Erst beim Server anmelden, dann auf die Freigabe warten
    // (drop._claiming verhindert erneutes Anmelden, solange die Antwort noch
    // aussteht — rein lokal, s. p._claiming beim Topf-Claim dort).
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

// ------------------------------------------------------------------ Wurfgeschosse
// Schleuder, Basketball und Knaller feuern denselben kleinen Würfel ab wie
// ein Boden-Drop (geteilte Geometrie/Materialien, dasselbe lokal-bauen-und-
// broadcasten-Muster, s. spawnDrop/spawnDropRemote oben) — nur bleibt er
// nicht liegen. Er fliegt, bis er trifft, ans Gelände stößt oder verpufft.
const shots=[];   // {id,x,y,z,vx,vy,vz,mesh,life,dmg,kb,fuse,blast,grav,mine}
// SHOT_LIFE war mit 4s auf den alten, kurzen Schuss zugeschnitten — Schleuder
// und Basketball fliegen jetzt spürbar weiter (s. sp/grav in ITEMS) und
// brauchten sonst länger als erlaubt, um überhaupt anzukommen.
const SHOT_S=.22, SHOT_CAP=60, SHOT_LIFE=7;
function removeShot(s){
  const i=shots.indexOf(s);
  if(i<0) return;
  scene.remove(s.mesh);               // Würfel und Material sind geteilt, nichts wegwerfen (s. dropMat)
  shots.splice(i,1);
}
// Gemeinsamer Bau-Kern, genau wie _mkDrop oben: derselbe Würfel, ob selbst
// abgefeuert oder von einem anderen Client gemeldet — nur `mine` entscheidet,
// ob er hier auch Schaden anrichten darf (s. spawnShot/spawnShotRemote).
function _mkShot(id,x,y,z,vx,vy,vz,mine,opts){
  if(!ITEMS[id]) return null;
  while(shots.length>=SHOT_CAP) removeShot(shots[0]);   // Notbremse, s. DROP_CAP
  const mesh=new THREE.Mesh(BLOCKGEO,dropMat(id));
  mesh.scale.setScalar(SHOT_S);
  mesh.castShadow=true;
  mesh.position.set(x,y,z);
  scene.add(mesh);
  const s={id,x,y,z,vx,vy,vz,mesh,spin:rnd(0,6.28),life:SHOT_LIFE,
           dmg:opts.dmg||0,kb:opts.kb||0,fuse:opts.fuse??0,blast:opts.blast??0,
           grav:opts.grav??1,mine};
  shots.push(s);
  return s;
}
// Wie spawnDrop: lokal bauen und — sofern verbunden — an alle ANDEREN Clients
// melden (Empfänger s. on('shot',...) unten, Relay s. party/src/game-server.js
// _onMessage). `grav` muss mit in die Nachricht — ohne ihn würde die
// Schleuder bei Mitspielern mit der Basketball-Flugbahn fliegen (und
// umgekehrt), weil der Server den Faktor unverändert nur weiterreicht. Für
// DIESEN Client ändert das nichts: Schaden lief noch nie über diese
// Nachricht (s. mine unten).
function spawnShot(id,x,y,z,vx,vy,vz,opts={}){
  const s=_mkShot(id,x,y,z,vx,vy,vz,true,opts);
  if(isConnected()) send({t:'shot',id,x,y,z,vx,vy,vz,grav:opts.grav??1});
  return s;
}
// Für eine ankommende shot-Nachricht: baut denselben Würfel nach, aber ohne
// Schaden (mine:false) und ohne erneut zu broadcasten — reines Anschauungs-
// material für andere Clients, exakt das Muster von spawnDropRemote.
function spawnShotRemote(id,x,y,z,vx,vy,vz,grav){
  return _mkShot(id,x,y,z,vx,vy,vz,false,{grav});
}
// Der Knaller zündet — eigener Name statt inline, weil zwei Stellen unten
// dorthin verzweigen (Lunte abgelaufen, Gelände getroffen). Nur eigene
// Knaller (mine) richten Schaden an, ein gespiegelter macht trotzdem Krach,
// das kostet nichts und sieht richtig aus. Blöcke bleiben stehen: eine
// Explosion, die das Gelände verändert, müsste über den vernetzten
// Block-Edit-Pfad laufen (setBlock + send('block',...)) — ein eigenes,
// deutlich größeres Problem, hier bewusst ausgespart.
function detonate(s){
  SND.boom();
  if(!s.mine) return;
  for(const m of mobs){
    const dx=m.x-s.x, dz=m.z-s.z, d=Math.hypot(dx,dz);
    if(d>s.blast) continue;
    const fall=1-d/s.blast;             // am Rand der Druckwelle nur noch ein Kitzeln
    hitMob(m,s.dmg*fall,s.kb*fall,dx,dz);
  }
}
function updateShots(dt){
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];
    s.spin+=dt*9; s.life-=dt;
    if(s.blast){                        // nur der Knaller trägt eine Lunte
      s.fuse-=dt;
      if(s.fuse<=0){ detonate(s); removeShot(s); continue; }
    }
    if(s.life<=0){ removeShot(s); continue; }
    s.vy-=DROP_GRAV*s.grav*dt;          // keine Reibung — es fliegt, es rollt nicht; grav s. ITEMS
    const nx=s.x+s.vx*dt, ny=s.y+s.vy*dt, nz=s.z+s.vz*dt;
    // Ein Benni geht vor Gelände. Der Knaller schlägt bei Berührung nicht
    // ein — er will die Lunte oder den Boden, s. detonate — und nur eigene
    // Geschosse machen überhaupt Schaden; ein gespiegeltes von einem anderen
    // Client ist reine Deko (s. mine bei spawnShotRemote).
    if(s.mine&&!s.blast){
      const m=mobs.find(mm=>Math.hypot(mm.x-nx,mm.z-nz)<.9&&Math.abs(mm.y+1-ny)<1.2);
      if(m){ hitMob(m,s.dmg,s.kb,s.vx,s.vz); removeShot(s); continue; }
    }
    if(fillsAt(Math.round(nx),Math.floor(ny),Math.round(nz))){
      if(s.blast) detonate(s);          // Volltreffer aufs Gelände zündet sofort, s.o.
      removeShot(s); continue;
    }
    s.x=nx; s.y=ny; s.z=nz;
    s.mesh.position.set(s.x,s.y,s.z);
    s.mesh.rotation.set(s.spin,s.spin*.7,0);
  }
}

// ------------------------------------------------------------------ Kochtopf
// Rechtsklick öffnet ein Fenster (openPot, Vorbild: die Truhe/openChest) —
// Zutaten werden aus dem Rucksack HINEINGEZOGEN statt hineingeworfen, ein
// Pfeil-Knopf ("Kochen"/"Nochmal", s. cookPot/renderPot) startet den Vorgang,
// und ein Ergebnisfeld zeigt vorab, was daraus wird. Das Hineinwerfen mit Q
// ist abgeschafft (s. Kommentar bei updateDrops).
const POT_CAP=12, COOK_TIME=4.5;
const pots=new Map();                    // "x,y,z" → {items:[{id,n}],cook:0,last:[{id,n}]}
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
  // Drift. Additiv wie Block/Fackel: keine Vervielfältigungsgefahr, darum
  // ohne Server-Schiedsspruch direkt lokal anwenden UND broadcasten — anders
  // als bei einer Truhe gehört ein Topf in dem Moment ohnehin nur dem einen
  // Spieler, der gerade sein Kochfenster offen hat (s. auch potTake unten).
  if(isConnected()) send({t:'pot-add',x,y,z,items:p.items});
  return t;
}
// Gegenstück zu potAdd: ein Fach im Kochfenster leeren (Ziehen zurück in den
// Rucksack, s. clickPotCell). Bleibt im selben additiv/broadcastenden
// Sync-Schema wie potAdd — der volle Inhalt geht wie gehabt über 'pot-add'
// raus, diesmal eben verkleinert statt vergrößert.
function potTake(x,y,z,i,n){
  const p=pots.get(K(x,y,z));
  if(!p||p.cook>0) return 0;             // während des Kochens bleibt der Deckel zu, s. potAdd
  const cur=p.items[i];
  if(!cur) return 0;
  const t=Math.min(n,cur.n);
  cur.n-=t;
  if(cur.n<=0) p.items.splice(i,1);
  if(isConnected()) send({t:'pot-add',x,y,z,items:p.items});
  return t;
}
// Im Topf liegt alles durcheinander — es zählt nur, was drin ist und wieviel.
// potRecipeItems ist der eigentliche Kern (nimmt eine bloße Zutatenliste,
// nicht erst ein Topf-Objekt) — renderPot() braucht genau das auch für eine
// Vorschau auf Basis von p.last, wenn der Topf gerade leer ist (s. dort).
function potRecipeItems(items){
  const ids=[];
  for(const it of items) for(let i=0;i<it.n;i++) ids.push(it.id);
  ids.sort();
  return RECIPES.find(r=>r.station==='pot'&&r.shapeless&&
    r.shapeless.length===ids.length&&
    r.shapeless.slice().sort().every((v,i)=>v===ids[i]))||null;
}
const potRecipe=p=>potRecipeItems(p.items);
// Am Fadenkreuz steht, wie voll der Topf ist — sonst müsste man raten. Bleibt
// bestehen, obwohl es das Kochfenster jetzt gibt: ein flüchtiger Blick beim
// Vorbeilaufen soll nicht erst ein Fenster verlangen (s. Commit-Notiz zur
// gestrichenen Seitenleiste #potrec bei potSideHTML unten).
function potTip(cell){
  const p=pots.get(K(cell.x,cell.y,cell.z));
  if(p&&p.cook>0) return '🍲 …';
  if(!p||!p.items.length) return '🍲';
  return '🍲 '+p.items.map(i=>ITEMS[i.id].ic+(i.n>1?i.n:'')).join(' ');
}
// Rechtsklick auf den Topf öffnet jetzt dieses Fenster statt sofort zu kochen
// (das übernimmt der "Kochen"-Knopf darin, s. cookPot) — Vorbild ist die
// Truhe (openChest): ein fremder Behälter oben, der Rucksack darunter.
let openPotCell=null;
function openPot(cell){
  const k=K(cell.x,cell.y,cell.z);
  if(!pots.has(k)) pots.set(k,{items:[],cook:0,readyAt:0});
  openPotCell=cell;
  panel='pot';
  SND.chest();
  renderPot(false);
}
// 4×3 = POT_CAP Fächer, genau wie chestGrid() für die Truhe — jedes zeigt
// direkt p.items[i]; da der Topf shapeless kocht (s. potRecipeItems), hat
// keine Position eine eigene Bedeutung, ein herausgenommener Stapel lässt
// die folgenden Fächer einfach nachrücken.
function potGrid(p){
  let h='<div class="invgrid potgrid">';
  for(let i=0;i<POT_CAP;i++) h+=`<div class="cell" data-pot="${i}">${stackHTML(p.items[i])}</div>`;
  h+='</div>';
  return h;
}
// Zellen im Kochfenster: wie bei der Truhe hängt der bewegte Stapel an carry
// (s. clickChestCell), nur ohne deren Server-Schiedsspruch (Begründung s.
// potTake) und ohne deren Tausch-Sonderfall — ein Klick auf ein fremdes oder
// leeres Fach landet gleichermaßen in potAdd, s. potGrid.
function clickPotCell(i,one){
  if(!openPotCell) return;
  const {x,y,z}=openPotCell;
  const p=pots.get(K(x,y,z));
  if(!p) return;
  if(!carry){
    const cur=p.items[i];
    if(!cur) return;
    const want=one?1:cur.n;
    const got=potTake(x,y,z,i,want);
    if(got>0) carry={id:cur.id,n:got};
  }else{
    const want=one?1:carry.n;
    const got=potAdd(x,y,z,carry.id,want);
    if(got<=0){ SND.fail(); return; }
    carry.n-=got; if(carry.n<=0) carry=null;
  }
  SND.tap();
  rerenderPanel();
}
// Ersetzt die alte, immer sichtbare Seitenleiste #potrec: dieselbe
// Rezeptübersicht (bekannte Kochtopf-Gerichte), jetzt aber nur, während das
// Kochfenster offen ist — wie sideHTML() das für die Werkbank neben
// craftHTML() schon macht. Als eigenständige, dauerhaft eingeblendete Leiste
// war sie mit dem neuen Fenster doppelt gemoppelt (das Fenster zeigt das
// Ergebnis direkt); als mside-Inhalt bleibt die Übersicht erhalten, ohne dass
// zwei Stellen dasselbe anzeigen.
function potSideHTML(){
  const dishes=RECIPES.filter(r=>r.station==='pot'&&known.has(r.id));
  return '<h3>📜 Im Kochtopf</h3>'+
    (dishes.length?dishes.map(recCard).join('')
      :'<p class="sidenote">Du kennst noch kein Gericht. Die Rezepte dafür haben die Jannessen.</p>');
}
function usePot(cell){
  const p=pots.get(K(cell.x,cell.y,cell.z));
  if(!p||!p.items.length){ toast('🍲 Leer.','warn',2000); return; }
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
// Der "Kochen"-Knopf im Fenster (data-act="cook", s. renderPot/mbox-Klick-
// Zuhörer). Ist der Topf leer, aber weiß er noch, was zuletzt darin kochte
// (p.last, s. on('pot-grant')/updatePots unten), holt dieser Knopf dieselben
// Zutaten aus dem Rucksack und legt sie wieder hinein — der Kern des
// "Nochmal"-Auftrags. Reicht der Rucksack nicht, passiert nichts außer einem
// Hinweis; renderPot markiert den Knopf für genau diesen Fall schon vorher
// mit der vorhandenen .off-Klasse, das hier ist die zweite, tatsächlich
// entscheidende Prüfung (der Rucksack kann sich zwischen zwei Bildern ändern).
function cookPot(cell){
  if(!cell) return;
  const k=K(cell.x,cell.y,cell.z);
  const p=pots.get(k);
  if(!p||p.cook>0) return;
  if(!p.items.length){
    if(!p.last||!p.last.length){ toast('🍲 Erst Zutaten hineinlegen.','warn',1800); return; }
    if(!p.last.every(it=>countOf(it.id)>=it.n)){
      toast('🍲 Die Zutaten fehlen im Rucksack.','warn',2200); SND.fail(); return;
    }
    for(const it of p.last) take(it.id,it.n);
    for(const it of p.last) potAdd(cell.x,cell.y,cell.z,it.id,it.n);
    updateHUD();
  }
  usePot(cell);
}
// Fortschritt/Ergebnis nur bei echter Änderung neu bauen — dasselbe Signatur-
// Muster wie hudCache und das frühere potPanelSig (s. Kommentar bei
// updateHand). remainS rundet auf ganze Sekunden, damit die Signatur nicht
// mit jedem Bild kippt, sondern höchstens einmal pro Sekunde neu baut.
let potWinSig='';
function refreshPotWindow(){
  if(panel!=='pot'||!openPotCell) return;
  const p=pots.get(K(openPotCell.x,openPotCell.y,openPotCell.z));
  if(!p){ potWinSig=''; return; }
  const remainS=p.cook>0?Math.max(0,Math.ceil((p.readyAt-Date.now())/1000)):-1;
  const sig=[p.items.map(it=>it.id+'×'+it.n).join(','),p.cook,remainS,
             p.last?p.last.map(it=>it.id+'×'+it.n).join(','):''].join('|');
  if(sig===potWinSig) return;
  potWinSig=sig;
  renderPot();
}
function renderPot(keep=true){
  if(!openPotCell) return;
  const p=pots.get(K(openPotCell.x,openPotCell.y,openPotCell.z));
  if(!p) return;
  const cooking=p.cook>0;
  const remainS=cooking?Math.max(0,Math.ceil((p.readyAt-Date.now())/1000)):0;
  const canRepeat=!cooking&&!p.items.length&&p.last&&p.last.length>0;
  const repeatReady=canRepeat&&p.last.every(it=>countOf(it.id)>=it.n);
  // Vorschau: aus dem aktuellen Inhalt, oder — leer, aber wiederholbar — aus
  // den zuletzt gekochten Zutaten, damit "Nochmal" schon vorher zeigt, was
  // dabei herauskäme.
  const previewItems=p.items.length?p.items:(canRepeat?p.last:null);
  const r=previewItems?potRecipeItems(previewItems):null;
  const shown=r&&known.has(r.id);
  let label,off;
  if(cooking){ label='Kocht … '+remainS+'s'; off=true; }
  else if(p.items.length){ label='Kochen'; off=false; }
  else if(canRepeat){ label='Nochmal'; off=!repeatReady; }
  else{ label='Kochen'; off=true; }
  let h='<h2>🍲 Kochtopf</h2>'+potGrid(p)+
    `<div class="potcook"><button class="potbtn${off?' off':''}" data-act="cook">${label}</button>`+
    '<div class="arrow">➜</div>'+
    `<div class="cell res${shown?'':' empty'}">${shown
      ?icon(r.out[0])+(r.out[1]>1?`<span class="n">${r.out[1]}</span>`:''):''}</div></div>`+
    '<h3>Rucksack</h3>'+invGrid()+
    dragHint()+
    '<div class="btnrow"><button class="primary" data-act="close">Schließen</button></div>';
  showModal(h,keep,potSideHTML());
  drawCarry();
  updateItemTip();
}
function finishCook(k,p){
  const [x,y,z]=k.split(',').map(Number);
  const r=potRecipe(p);
  p.items.length=0;
  // Springt oben heraus, mit der üblichen kurzen Aufheb-Schonfrist (pickT) —
  // ein Zurückfallen in den Topf gibt es nicht mehr zu verhindern, seit das
  // Hineinwerfen abgeschafft ist (s. updateDrops).
  const out=(id,n)=>spawnDrop(id,n,x,y+1.25,z,rnd(-.3,.3),2.4,rnd(-.3,.3),.5);
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
      // Für "Nochmal" merken, BEVOR finishCook() p.items leert (s. cookPot).
      p.last=p.items.map(it=>({...it}));
      finishCook(k,p);
      continue;
    }
    if(p._claiming) continue;
    p._claiming=true;
    send({t:'pot-claim',x,y,z,readyAt:p.readyAt});
  }
  refreshPotWindow();
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
// Phase A: Spinne und Fluch-Benni tragen kein eigenes Bild, sondern eine aus
// benni.png abgeleitete Textur je Spielart (siehe Boot-Block unten) — kein
// zweites, 1,4 MB schweres PNG für dieselbe Silhouette.
const MOB_TEX={};
// Huhn: anders als benni/spider/cursed kein Foto und keine daraus
// verrechnete Variante, sondern ein gezeichnetes Sprite wie ball/cracker/
// truck oben (siehe pixTex) — steht synchron fest, sobald dieses Skript
// läuft, ganz ohne auf benni.png zu warten. spawnChicken() (unten) nutzt das
// aus und prüft anders als spawnMob() kein "ist benniTex schon da". Nur
// online bleibt es an benni.png gekoppelt: on('mob-state',...) wartet für
// JEDEN Mob-Kind darauf (der Wächter dort gilt pauschal, nicht texturweise) —
// bei normaler Ladezeit ein kaum merklicher Verzug, kein eigener Fall wert.
MOB_TEX.chicken=pixTex(g=>{
  const r=mulberry(147), body=['#fbfbf6','#f4f3ec','#ffffff'];
  // Körper: weißes Oval
  const cx=8,cy=10,rx=5.4,ry=4;
  for(let y=6;y<15;y++) for(let x=2;x<15;x++){
    if(((x-cx)/rx)**2+((y-cy)/ry)**2>1) continue;
    g.fillStyle=body[Math.floor(r()*body.length)]; g.fillRect(x,y,1,1);
  }
  // Kopf: kleiner runder Aufsatz oben rechts
  for(let y=2;y<8;y++) for(let x=9;x<16;x++){
    if(Math.hypot(x-11.8,y-5)>3) continue;
    g.fillStyle=body[Math.floor(r()*body.length)]; g.fillRect(x,y,1,1);
  }
  g.fillStyle='#c9302a';                                  // Kamm
  g.fillRect(10,1,1,2); g.fillRect(11,0,2,2); g.fillRect(13,1,1,2);
  g.fillStyle='#e8b23a'; g.fillRect(14,5,2,1); g.fillRect(15,6,1,1);  // Schnabel
  g.fillStyle='#241a10'; g.fillRect(12,4,1,1);            // Auge
  g.fillStyle='#e8b23a';                                  // Füße
  g.fillRect(5,14,1,2); g.fillRect(4,15,3,1);
  g.fillRect(9,14,1,2); g.fillRect(8,15,3,1);
});
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
// Ein Fenster zum Ziehen, keins zum Lesen: Annahme und Auslage sind Zellen
// wie im Rucksack auch, bedient von denselben clickCell-Nachbarn (s.u.).
// MARKET_R bleibt für den alten Wurf-Radius stehen — Q wirft nach wie vor
// vor Mannis Füße, nur landet es nicht mehr zwangsläufig im Verkauf.
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
// Skins gehören zu player (siehe dort), nicht zu slots — anziehen ist rein
// kosmetisch und komplett lokal, ohne die gemeinsame Kasse zu berühren. Die
// eigene Figur baut sich von selbst neu (siehe updateSelfModel), Mitspieler
// erfahren es über das skin-Feld der nächsten 'pos'-Nachricht.
function equipSkin(idx){
  if(player.skin===idx) return;
  player.skin=idx;
  savePersist();
}
// Ein gekaufter Skin gehört dauerhaft zu player.skins (siehe dort) — anders
// als ein Rucksack-Gegenstand kann er weder rausfallen noch weggeworfen
// werden.
function unlockSkin(idx){
  if(!player.skins.includes(idx)) player.skins.push(idx);
  equipSkin(idx);
  SND.craft();
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
  // Ein Skin, den man schon hat, ist kein Kauf mehr, sondern nur noch ein
  // Anziehen — dafür braucht es weder Server noch Kasse.
  if(w.skin&&player.skins.includes(w.skinIdx)){
    equipSkin(w.skinIdx);
    SND.craft();
    toast(SKINS[w.skinIdx].ic+' '+SKINS[w.skinIdx].nm+' angezogen.','good',2200);
    rerenderPanel();
    return;
  }
  if(isConnected()){ send({t:'buy',id}); return; }
  if(state.money<w.price){ SND.fail(); toast('💶 Dafür reicht es nicht.','warn',1800); return; }
  state.money-=w.price; state.bought++;
  if(w.skin){
    // Kein Gegenstand für den Rucksack — giveOrDrop bräuchte einen
    // ITEMS-Eintrag, den es für einen Skin nicht gibt (siehe unlockSkin).
    unlockSkin(w.skinIdx);
    say(marketChar,SKINS[w.skinIdx].nm+', bitte sehr!',3200);
    toast('🛒 '+SKINS[w.skinIdx].ic+' '+SKINS[w.skinIdx].nm+' gekauft.','good',2600);
  }else{
    // In die Hand, nicht vor die Füße — anders als beim Verkaufen liegt hier
    // nichts, das erst noch am Boden landen müsste.
    giveOrDrop(id,1);
    SND.craft();
    say(marketChar,ITEMS[id].nm+', bitte sehr!',3200);
    toast('🛒 '+ITEMS[id].ic+' '+ITEMS[id].nm+' gekauft.','good',2600);
  }
  updateHUD();
  rerenderPanel();
}
// Das Fenster besteht nur noch aus dem, was man ohnehin schon kann: Zellen
// anklicken. Namen, Preise und der Rätseltext (siehe fert) stehen nicht mehr
// im Fließtext, sondern ausschließlich in der Schwebehilfe (itemUnder/
// updateItemTip) — dafür tragen die Zellen data-want/data-shop/data-accept.
function openMarket(c,keep){
  panel='market';
  // Höchstens fünf Waren je Zeile, der Rest bricht um. Mit den Gerichten aus
  // dem Kochtopf nimmt Manni inzwischen zehn Sachen an — alle nebeneinander
  // wären über dreihundert Pixel breit und ragten am Handy im Hochformat aus
  // dem Fenster (dieselbe Falle wie bei der Inventarleiste, siehe deren CSS).
  const buys=Object.entries(PRICES).map(([id,p])=>
    `<div class="pc" data-want="${id}">${icon(id)}<span class="n">${p}</span></div>`).join('');
  const shop=SHOP.map(w=>{
    if(w.skin){
      // Ein Skin bleibt nach dem Kauf stehen, statt aus der Auslage zu
      // verschwinden — angewählt zeigt er sich wie ein aktives Leistenfach
      // (.sel, siehe #hotbar .slot.sel), sonst nur ohne den "off"-Blasseffekt.
      const owned=player.skins.includes(w.skinIdx), active=player.skin===w.skinIdx;
      const cls=active?' sel':owned?'':(state.money>=w.price?'':' off');
      const badge=active?'✓':owned?'':w.price;
      return `<div class="cell${cls}" data-shop="${w.id}">${skinIcon(w.skinIdx)}`+
             (badge!==''?`<span class="n">${badge}</span>`:'')+'</div>';
    }
    const can=state.money>=w.price;
    return `<div class="cell${can?'':' off'}" data-shop="${w.id}">${icon(w.id)}<span class="n">${w.price}</span></div>`;
  }).join('');
  showModal(`<h2>💶 ${state.money} €</h2>
    <h3>Mannis Annahme</h3>
    <div class="patwrap"><div class="pat"
      style="grid-template-columns:repeat(${Math.min(5,Object.keys(PRICES).length)},30px)">${buys}</div></div>
    <div class="cell accept" data-accept>📥</div>
    <h3>Mannis Auslage</h3>
    <div class="invgrid" style="grid-template-columns:repeat(${SHOP.length},64px);justify-content:center">${shop}</div>
    <h3>Rucksack</h3>${invGrid()}
    <div class="btnrow"><button class="primary" data-act="close">Schließen</button></div>`,keep);
  drawCarry();
  updateItemTip();
}
// Mannis Annahme: der Stapel am Zeiger fällt hinein und ist sofort verkauft
// (sellTo() macht den Rest) — kauft Manni es nicht, bleibt er einfach in der
// Hand hängen, genau wie ein abgelehnter Tausch anderswo im Spiel.
function clickAccept(one){
  if(!carry) return;
  if(!PRICES[carry.id]){ SND.fail(); return; }
  const n=one?1:carry.n;
  sellTo(carry.id,n);
  carry.n-=n; if(carry.n<=0) carry=null;
  drawCarry();
  rerenderPanel();
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
  updateEyeRay(); _rd.copy(eyeDir);
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
// Wer steht vor einem Schild? Exakt dasselbe Prinzip wie aimChar, nur über
// die signs-Map statt CHARS — Schilder leben außerhalb des Block-Rasters
// (siehe Design-Kommentar bei signs weiter oben), brauchen also dieselbe
// eigene Zielerfassung wie ein Bewohner statt über rayPick/target zu laufen.
function aimSign(maxD=4.2){
  updateEyeRay(); _rd.copy(eyeDir);
  let best=null, bd=1e9;
  for(const [key,s] of signs){
    const [x,y,z]=key.split(',').map(Number);
    const dx=x-player.x, dz=z-player.z, d=Math.hypot(dx,dz)||1e-4;
    if(d>maxD||Math.abs(y-player.y)>2.5) continue;
    if((dx/d)*_rd.x+(dz/d)*_rd.z<.55) continue;
    if(d<bd){ bd=d; best={x,y,z,key,sign:s}; }
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
// ensureMob() below — dieselbe Fläche für alle drei Spielarten, nur Höhe und
// Textur kommen aus MOBS/MOB_TEX. Fehlt eine Variantentextur (Ladefehler),
// fällt sie auf benniTex zurück statt gar keine Fläche zu zeigen.
function makeMobMesh(x,y,z,kind='benni'){
  const cfg=MOBS[kind]||MOBS.benni, tex=MOB_TEX[kind]||benniTex;
  const h=cfg.h, asp=tex.image.width/tex.image.height;
  // Die Spinnentextur ist nicht vorverzerrt (sie ist derselbe Benni, nur
  // eingefärbt) — geduckt und breit wird sie erst über die Geometrie.
  const wMul=kind==='spider'?1.55:1;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(h*asp*wMul,h),
    new THREE.MeshLambertMaterial({map:tex,transparent:true,alphaTest:.5,side:THREE.DoubleSide}));
  mesh.position.set(x,y+h/2,z); mesh.castShadow=true;
  scene.add(mesh);
  return mesh;
}
// Kreischen je Spielart — dieselben drei Sample-Namen wie eh und je, nur mit
// eigener Tonhöhe (siehe playSample-Kommentar oben): die Spinne tief und
// damit verzerrt, der Fluch-Benni hoch und dünn. So bekommt jede Spielart
// ihre eigene Stimme, ohne eine einzige neue Sounddatei.
function scream(kind){
  const s=pick(['benni1','benni2','benni3']);
  if(kind==='spider') playSample(s,.7,rnd(.55,.7));
  else if(kind==='cursed') playSample(s,.6,rnd(1.9,2.3));
  else playSample(s,.7,rnd(.95,1.05));
}
// ---- Offline (Einzelspieler/kein Server) — volle lokale Simulation, wie bisher.
// Gewichtete Auswahl über MOBS[].w — cursed trägt w:0 und taucht normal nie
// auf, in der Blutmondnacht bekommt er hier eine echte Chance.
function pickMobKind(blood){
  let total=0;
  const ws=Object.entries(MOBS).map(([k,c])=>{
    const w=k==='cursed'&&blood?.5:c.w; total+=w; return [k,w];
  });
  let r=Math.random()*total;
  for(const [k,w] of ws){ if((r-=w)<0) return k; }
  return 'benni';
}
function spawnMob(){
  if(!benniTex) return;
  let x,z,tries=0;
  do{
    const a=rnd(0,6.28), d=rnd(18,30);
    x=clamp(Math.round(player.x+Math.cos(a)*d),BOUND.x0+2,BOUND.x1-2);
    z=clamp(Math.round(player.z+Math.sin(a)*d),BOUND.z0+2,BOUND.z1-2);
  } while(litAt(x,z)&&++tries<12);
  if(litAt(x,z)) return;
  const ground=surfaceAt(x,z);
  if(ground<SEA-1) return;
  const kind=pickMobKind(bloodMoon(state.day)), cfg=MOBS[kind];
  const y=cfg.fly?ground+FLY_H:ground;
  const mesh=makeMobMesh(x,y,z,kind);
  mobs.push({x,z,y,kind,hp:cfg.hp,kx:0,kz:0,mesh,
    atkCd:rnd(0,1),hurtT:0,bob:rnd(0,6),screamCd:rnd(3,7)});
}
function dropMob(m,i){
  scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose();
  mobs.splice(i<0?mobs.indexOf(m):i,1);
}
// ---- Hühner: der erste friedliche Mob (MOBS.chicken.peaceful, siehe
// shared/world.js). Sie tauchen NIE über pickMobKind/spawnMob auf (w:0),
// sondern über maintainChickens() unten, laufen tagsüber wie nachts einfach
// weiter (updateMobs() biegt für sie komplett aus der Kampf-/Fluchtschleife
// aus, siehe dort) und legen von Zeit zu Zeit ein Ei.
const CHICKEN_LURE_R=8, CHICKEN_EAT_R=1;
// Der nächste liegende Dominik in Reichweite — dieselbe Suche läuft offline
// hier UND online in updateMobsOnline() (dort, weil der Server gar keine
// Drop-Positionen kennt, s. Kommentar dort). d.id 'dominik' statt eines
// eigenen Lockstoff-Merkmals, weil das genau der Gegenstand ist, den man
// zum Anlocken hinwirft (siehe Auftrag).
function nearestLure(x,z){
  let best=null,bd=CHICKEN_LURE_R;
  for(const d of drops){
    if(d.id!=='dominik') continue;
    const dd=Math.hypot(d.x-x,d.z-z);
    if(dd<bd){ bd=dd; best=d; }
  }
  return best;
}
// Offline-Populationspflege: alle paar Sekunden nachsehen, ob in Spielernähe
// (CHICKEN_NEAR_R) noch Platz unter CHICKEN_CAP ist, und wenn ja, eines
// nachwachsen lassen. Online übernimmt der Server dasselbe über
// _spawnChicken() (siehe party/src/game-server.js) — beide lesen dieselben
// Konstanten aus shared/world.js, damit die beiden Populationen sich nicht
// heimlich auseinanderentwickeln.
let chickenTimer=rnd(2,5);
function maintainChickens(dt){
  chickenTimer-=dt;
  if(chickenTimer>0) return;
  chickenTimer=rnd(4,9);
  const near=mobs.filter(m=>m.kind==='chicken'&&Math.hypot(m.x-player.x,m.z-player.z)<CHICKEN_NEAR_R).length;
  if(near<CHICKEN_CAP) spawnChicken();
}
// Beim Betreten der Welt stehen schon ein paar da. Ohne diese Starthilfe
// beginnt jede Sitzung mit null Hühnern und lässt sie im Takt von
// maintainChickens einzeln erscheinen — bis die ersten drei da sind, verginge
// eine knappe halbe Minute, in der die Welt einfach leer aussieht. Nachwachsen
// tun sie danach wie gehabt, das hier ist nur der erste Anblick.
function seedChickens(n=3){ for(let i=0;i<n;i++) spawnChicken(); }
function spawnChicken(){
  let x,z,tries=0;
  do{
    const a=rnd(0,6.28), d=rnd(6,22);
    x=clamp(Math.round(player.x+Math.cos(a)*d),BOUND.x0+2,BOUND.x1-2);
    z=clamp(Math.round(player.z+Math.sin(a)*d),BOUND.z0+2,BOUND.z1-2);
  } while(surfaceAt(x,z)<SEA-1&&++tries<12);
  const ground=surfaceAt(x,z);
  if(ground<SEA-1) return;                    // kein Fleck über Wasser gefunden
  const mesh=makeMobMesh(x,ground,z,'chicken');
  mobs.push({x,z,y:ground,kind:'chicken',hp:MOBS.chicken.hp,kx:0,kz:0,mesh,
    hurtT:0,bob:rnd(0,6),wanderAng:null,wanderT:rnd(0,3),eggT:rnd(EGG_MIN,EGG_MAX)});
}
// Die eigentliche Verhaltens-KI, aus updateMobs() heraus für jedes Huhn
// aufgerufen (siehe dort): Ei-Timer, dann entweder auf den nächsten
// liegenden Dominik zulaufen (und ihn bei Ankunft auffressen) oder
// gemächlich umherstreifen. Setzt die Mesh-Position selbst — die zwei
// ".98"-Zeilen in updateMobs gelten nur für die menschengroßen Bennis, ein
// Huhn (h:.7) braucht seinen eigenen, viel kleineren Höhenversatz.
function updateChicken(m,dt){
  m.eggT-=dt;
  if(m.eggT<=0){
    m.eggT=rnd(EGG_MIN,EGG_MAX);
    spawnDrop('egg',1,m.x,m.y+.4,m.z,rnd(-.3,.3),1.4,rnd(-.3,.3),.6);
    SND.egg();
  }
  const lure=nearestLure(m.x,m.z);
  if(lure){
    const dx=lure.x-m.x, dz=lure.z-m.z, d=Math.hypot(dx,dz)||1;
    if(d<CHICKEN_EAT_R) removeDrop(lure);      // aufgefressen — offline sofort, kein Wettrennen möglich
    else{
      const nx=m.x+dx/d*MOBS.chicken.speed*dt, nz=m.z+dz/d*MOBS.chicken.speed*dt;
      if(!mobBlocked(nx,nz,m.y)){ m.x=nx; m.z=nz; }
    }
  }else{
    m.wanderT-=dt;
    if(m.wanderT<=0){
      m.wanderT=rnd(2,5);
      m.wanderAng=Math.random()<.35?null:rnd(0,6.28);   // gelegentlich stehen bleiben
    }
    if(m.wanderAng!=null){
      const nx=m.x+Math.cos(m.wanderAng)*MOBS.chicken.speed*dt,
            nz=m.z+Math.sin(m.wanderAng)*MOBS.chicken.speed*dt;
      if(!mobBlocked(nx,nz,m.y)){ m.x=nx; m.z=nz; } else m.wanderAng=null;
    }
  }
  m.mesh.position.set(m.x,mobY(m,dt)+MOBS.chicken.h/2+.02,m.z);
}
// Vertragsstelle für B2 (attack()): Signatur bleibt genau damageMob(m,dmg,kx,kz)
// — kx/kz sind ein horizontaler Stoß im Weltkoordinatensystem, standardmäßig
// keiner. kbTake gewichtet ihn je Spielart (die Spinne ist träge, der
// Fluch-Benni wird herumgeworfen wie ein Blatt).
function damageMob(m,dmg,kx=0,kz=0){
  const cfg=MOBS[m.kind||'benni'];
  m.hp-=dmg; m.hurtT=.22;
  m.kx=(m.kx||0)+kx*cfg.kbTake; m.kz=(m.kz||0)+kz*cfg.kbTake;
  playSample('punch',.6);
  if(m.hp<=0){
    const [id,lo,hi]=cfg.loot;
    spawnDrop(id,rndi(lo,hi),m.x,m.y+.5,m.z,rnd(-1,1),1.8,rnd(-1,1));
    dropMob(m,-1);
    state.killed++;
    SND.mobDie();
  } else SND.hit();
}
// mobBlocked kommt aus shared/world.js (auch vom Server gebraucht).
// surfaceAt() rastet auf ganze Blöcke ein: ungebremst springt ein Benni bei
// jedem Zellwechsel und flackert an Kanten hin und her. Also nachziehen statt
// setzen — nur bei großen Sprüngen (Respawn) sofort. Der Fluch-Benni schwebt
// FLY_H über demselben Bodenwert, statt auf ihm zu laufen.
function mobY(m,dt){
  const g=surfaceAt(m.x,m.z)+(MOBS[m.kind||'benni'].fly?FLY_H:0);
  m.y=Math.abs(g-m.y)>2.5?g:lerp(m.y,g,Math.min(1,dt*11));
  return m.y;
}
function updateMobs(dt){
  for(let i=mobs.length-1;i>=0;i--){
    // Ein Treffer kann zum Respawn führen, und der räumt die Umstehenden weg —
    // die Liste schrumpft also mitten in der Schleife.
    const m=mobs[i];
    if(!m) continue;
    const cfg=MOBS[m.kind||'benni'];
    if(m.hurtT>0) m.hurtT-=dt;
    m.mesh.material.color.setRGB(1,m.hurtT>0?.4:1,m.hurtT>0?.4:1);
    // Stoß zuerst, vor der eigenen KI — sonst überschreibt der nächste
    // Laufschritt ihn im selben Frame wieder.
    if(m.kx||m.kz){
      const nx=m.x+m.kx*dt, nz=m.z+m.kz*dt;
      if(cfg.fly||!mobBlocked(nx,nz,m.y)){ m.x=clamp(nx,BOUND.x0,BOUND.x1); m.z=clamp(nz,BOUND.z0,BOUND.z1); }
      else{ m.kx=0; m.kz=0; }
      const f=Math.max(0,1-dt*KB_DRAG); m.kx*=f; m.kz*=f;
      if(Math.hypot(m.kx,m.kz)<.05){ m.kx=0; m.kz=0; }
    }
    // Friedliche Mobs (bisher nur Hühner) biegen hier komplett aus der
    // Kampf-/Flucht-KI aus: kein Tagesanbruch-Verschwinden, kein Angriff,
    // kein Kreischen — eigene Verhaltens-Funktion, siehe updateChicken oben.
    if(cfg.peaceful){ updateChicken(m,dt); continue; }
    const dx=player.x-m.x, dz=player.z-m.z, d=Math.hypot(dx,dz)||1;
    if(!state.night){                          // Tagesanbruch: sie verziehen sich
      m.x-=dx/d*cfg.speed*1.6*dt; m.z-=dz/d*cfg.speed*1.6*dt;
      m.mesh.material.opacity=Math.max(0,(m.mesh.material.opacity??1)-dt*.7);
      m.mesh.material.transparent=true;
      if(d>44||m.mesh.material.opacity<=.02){ dropMob(m,i); continue; }
      m.mesh.position.set(m.x,mobY(m,dt)+.98,m.z);
      continue;
    }
    m.screamCd-=dt;
    if(d<14&&m.screamCd<=0){
      scream(m.kind);
      m.screamCd=rnd(8,14);
    }
    if(d>1.9){
      let nx=m.x+dx/d*cfg.speed*dt, nz=m.z+dz/d*cfg.speed*dt;
      // Der Fluch-Benni fliegt: kein mobBlocked, keine Wand, kein Steilhang
      // hält ihn auf. Eine Fackelwand rettet in der Blutmondnacht also
      // niemanden mehr.
      if(!cfg.fly){
        const my=surfaceAt(m.x,m.z);
        if(mobBlocked(nx,nz,my)){                // an Wänden und Steilhängen entlang
          nx=m.x+(dz/d)*cfg.speed*dt; nz=m.z-(dx/d)*cfg.speed*dt;
          if(mobBlocked(nx,nz,my)){ nx=m.x; nz=m.z; }
        }
      }
      m.x=clamp(nx,BOUND.x0,BOUND.x1); m.z=clamp(nz,BOUND.z0,BOUND.z1);
      m.bob+=dt*(cfg.fly?11:7);
    } else {
      m.atkCd-=dt;
      if(m.atkCd<=0){
        m.atkCd=cfg.atkCd;
        // Nur auf ähnlicher Höhe: von einem Turm aus bist du sicher. Und nur
        // bei freier Sicht auf Brusthöhe (+1.1 über den Füßen, nicht am
        // Boden — sonst würde der Boden unter dem Benni selbst jeden Angriff
        // blockieren): eine ein Block dicke Mauer schützt sonst nicht, auch
        // der fliegende Fluch-Benni (cfg.fly) darf nicht hindurchschlagen,
        // auch wenn er über die Mauer hinwegfliegen kann.
        const my=surfaceAt(m.x,m.z);
        if(Math.abs(my-player.y)<2.2
          &&losClear(m.x,my+1.1,m.z,player.x,player.y+1.1,player.z)) hurtPlayer(cfg.dmg);
      }
    }
    m.mesh.position.set(m.x,mobY(m,dt)+.98+Math.abs(Math.sin(m.bob))*(cfg.fly?.16:.06),m.z);
  }
}
// ---- Online (Server verbunden) — reines Rendern/Lerpen, exakt das Muster
// von ensureRemotePlayer/removeRemotePlayer/updateRemotePlayers (Phase 2),
// nur nach Benni-`id` statt Spieler-`pid` einsortiert. Der Server schickt
// keinen `bob`-Hüpfwert mit (siehe mob-state weiter unten) — anders als
// offline hüpfen vernetzte Bennis darum nicht beim Laufen, eine akzeptierte
// kosmetische Vereinfachung.
function ensureMob(id,x,y,z,kind='benni'){
  let m=mobs.find(mm=>mm.id===id);
  if(m) return m;
  const mesh=makeMobMesh(x,y,z,kind);
  m={id,x,y,z,kind,hp:MOBS[kind].hp,hurtT:false,mesh,target:{x,y,z},screamCd:rnd(3,7)};
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
    // Huhn: Wandern und Ei-Legen simuliert der Server (stepChicken dort),
    // aber das Anlocken NICHT — der Server kennt gar keine Drop-Positionen
    // (siehe die drop-claim-Arbitrierung, die nie prüft WO ein Drop liegt,
    // nur WELCHER dropId zuerst beansprucht wurde). Ist ein Dominik in Reichweite,
    // übernimmt darum der Client die sichtbare Position komplett selbst (statt
    // Richtung m.target zu lerpen) und beansprucht den Drop beim Ankommen über
    // genau denselben drop-claim/drop-claimed-Tanz wie Verkaufen/Aufheben/Topf
    // oben — so frisst ihn online nie mehr als ein Huhn gleichzeitig.
    if(m.kind==='chicken'){
      const lure=nearestLure(m.x,m.z);
      if(lure){
        const dx=lure.x-m.x, dz=lure.z-m.z, d=Math.hypot(dx,dz)||1;
        if(d<CHICKEN_EAT_R){
          if(!lure._claiming){
            lure._claiming=true; lure._claimReason='chicken';
            send({t:'drop-claim',dropId:lure.dropId,reason:'chicken'});
          }
        }else{
          m.x+=dx/d*MOBS.chicken.speed*dt; m.z+=dz/d*MOBS.chicken.speed*dt;
        }
      }else{
        m.x=lerp(m.x,m.target.x,f); m.z=lerp(m.z,m.target.z,f);
      }
      m.y=lerp(m.y,m.target.y,f);
      m.mesh.position.set(m.x,m.y+MOBS.chicken.h/2+.02,m.z);
      m.mesh.material.color.setRGB(1,m.hurtT?.4:1,m.hurtT?.4:1);
      continue;                          // kein Kreischen, kein .98-Höhenversatz
    }
    m.x=lerp(m.x,m.target.x,f);
    m.y=lerp(m.y,m.target.y,f);
    m.z=lerp(m.z,m.target.z,f);
    m.mesh.position.set(m.x,m.y+.98,m.z);
    m.mesh.material.color.setRGB(1,m.hurtT?.4:1,m.hurtT?.4:1);
    // Online übernimmt der Server Bewegung/Kampf, aber das Gruseln bei Nacht
    // (zufälliges Kreischen in Hörweite) ist rein kosmetisch und lokal — dafür
    // gibt es keinen Netzwerkgrund, nur denselben Cooldown wie offline.
    if(state.night){
      m.screamCd-=dt;
      if(Math.hypot(m.x-player.x,m.z-player.z)<14&&m.screamCd<=0){
        scream(m.kind);
        m.screamCd=rnd(8,14);
      }
    }
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
  // Wer im Boot stirbt, lässt es zurück, statt es an den Wiedereinstiegspunkt
  // mitzuschleifen (das gefahrene Fahrzeug folgt sonst jedem Schritt, siehe
  // updateVehicles) — es bleibt dort liegen, wo es zuletzt war.
  if(riding){
    const v=riding;
    riding=null; v.rider=null;
    if(isConnected()) send({t:'vehicle-leave',id:v.id});
  }
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
  toast('💀 Gestorben — Kram bleibt.','bad',3000);
  updateHUD();
}

// ------------------------------------------------------------------ Zielerfassung
// Marsch durchs Blockraster statt Raycast gegen zehntausende Flächen.
const _rd=new THREE.Vector3();
// Gezielt wird IMMER aus den Augen der Figur, nie aus der Kamera. Seit es die
// dritte Person gibt, sind das zwei verschiedene Orte: die Kamera steht vier
// Blöcke weiter hinten (in der Frontsicht schaut sie sogar in die
// Gegenrichtung), man würde also anderswo hinschlagen und hinbauen, als das
// Fadenkreuz zeigt. Die Blickrichtung ist dieselbe Rechnung, die auch die
// Kamera dreht (rotateY(yaw) dann rotateX(pitch), Blick nach -Z).
const eyePos=new THREE.Vector3(), eyeDir=new THREE.Vector3();
function updateEyeRay(){
  eyePos.set(player.x,player.viewY+EYE,player.z);
  const cp=Math.cos(player.pitch);
  eyeDir.set(-Math.sin(player.yaw)*cp,Math.sin(player.pitch),-Math.cos(player.yaw)*cp);
}
function rayPick(){
  updateEyeRay(); _rd.copy(eyeDir);
  const o=eyePos;
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
let target=null, aimed=null, aimedSign=null, aimedVehicle=null;
function updateTarget(){
  target=rayPick();
  // Ein Bewohner zählt nur, wenn kein Block näher steht — sonst redet man
  // durch die Hauswand hindurch.
  aimed=aimChar(target?Math.min(4.2,target.dist+.5):4.2);
  // Ein Schild tritt genau eine Stufe dahinter an: nur wenn gerade kein
  // Bewohner im Blick ist, aber mit derselben Block-Vorrang-Regel wie bei
  // aimed (ein näherer Block verdeckt das Schild dahinter).
  aimedSign=!aimed?aimSign(target?Math.min(4.2,target.dist+.5):4.2):null;
  // Fahrzeuge stehen in der Welt herum wie Schilder — dieselbe Vorrangregel,
  // eine Stufe dahinter. Wer selbst fährt, visiert nichts an (er säße sonst
  // im Boot und bekäme dauernd "einsteigen" angeboten).
  aimedVehicle=!aimed&&!aimedSign&&!riding
    ?aimVehicle(target?Math.min(3.6,target.dist+.6):3.6):null;
  // Nur Bedienbares bekommt eine Beschriftung — der Rest spricht für sich.
  const tip=el('tip');
  const b=target?BLOCKS[target.type]:null;
  const atPot=!aimed&&!aimedSign&&!aimedVehicle&&b&&b.use==='pot'?target.cell:null;
  // Nur noch der Name — das goldene Fadenkreuz (#cross.hot) sagt längst,
  // dass hier etwas geht; welche Taste, steht in der Tastenlegende.
  const txt=aimed?aimed.name
           :aimedSign?'🪧 '+(aimedSign.sign.text||'(leer)')
           :aimedVehicle?ITEMS[VEHICLES[aimedVehicle.kind].item].ic+' '+VEHICLES[aimedVehicle.kind].nm+
             (aimedVehicle.rider!=null?' 🔒':'')
           :atPot?potTip(atPot)
           :b&&b.use?b.nm:'';
  if(tip.textContent!==txt) tip.textContent=txt;
  el('cross').classList.toggle('hot',!!aimed||!!aimedSign||!!aimedVehicle||(!!target&&!!BLOCKS[target.type].use));
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
  // Eine Truhe voller Inhalt gibt beim Abbauen alle 24 Fächer wieder her —
  // spawnDrop() broadcastet selbst (Phase 6), kein weiterer Sync-Code nötig.
  if(t==='chest'){
    const c=chests.get(K(x,y,z));
    if(c){
      for(const it of c.items) if(it) spawnDrop(it.id,it.n,x,y+.4,z,rnd(-1,1),1.8,rnd(-1,1));
      chests.delete(K(x,y,z));
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
  // 1a2. Einsteigen geht vor allem, was man in der Hand hat — wer vor seinem
  // Boot steht und dabei ein zweites hält, will einsteigen, nicht stapeln.
  if(aimedVehicle){ enterVehicle(aimedVehicle); return; }
  // 1b. Ein Schild lesen/beschriften — wie das Ansprechen eines Bewohners
  // (Schilder leben ja außerhalb des Block-Rasters, siehe Design-Kommentar
  // bei signs), darum direkt danach und noch vor der Kisten/Werkbank/Topf-
  // Bedienung.
  if(aimedSign){ openSignEditor(aimedSign.x,aimedSign.y,aimedSign.z); return; }
  // 2. Kiste, Werkbank, Kochtopf bedienen
  if(target&&BLOCKS[target.type].use){
    const u=BLOCKS[target.type].use;
    if(u==='chest') return openChest(target.cell);
    if(u==='bench') return openCraft('bench');
    if(u==='pot')   return openPot(target.cell);
  }
  // 3. Hacken und säen — vor dem Essen, sonst isst man die Saat auf
  if(it&&it.hoe&&target){ till(target.cell); return; }
  if(it&&it.seed&&target){
    if(plantSeed(target.cell,it)) consumeHeld(); else SND.fail();
    updateHUD();
    return;
  }
  // 3b. Schleuder abfeuern, Basketball/Knaller werfen — nach Hacke/Saat, aber
  // klar vor dem Essen: träfe die Reihenfolge es andersherum, käme ein
  // Basketball nie zum Fliegen (er würde ja nie bis hierher durchfallen),
  // und schlimmer noch, eine geworfene Dominik-Suppe würde vorher aufgegessen.
  if(it&&it.sling){
    if(!take(it.ammo,1)){ SND.fail(); return; }
    updateEyeRay();
    const sp=it.sp??20, lift=it.lift??0;   // flach und schnell, eine Schleuder ist kein Wurf (s. ITEMS)
    spawnShot(it.ammo,eyePos.x,eyePos.y,eyePos.z,eyeDir.x*sp,eyeDir.y*sp+lift,eyeDir.z*sp,
      {dmg:it.dmg,kb:it.kb,grav:it.grav});
    playSample('dominik_break',.6,rnd(1.8,2.2));   // ein Dominik quietscht anders als er zerplatzt
    updateHUD();
    return;
  }
  if(it&&it.throw){
    consumeHeld();
    updateEyeRay();
    const sp=it.sp??9, lift=it.lift??3;    // langsamer als die Schleuder, dafür mit Bogen (s. ITEMS)
    spawnShot(it.throw,eyePos.x,eyePos.y,eyePos.z,eyeDir.x*sp,eyeDir.y*sp+lift,eyeDir.z*sp,
      {dmg:it.dmg,kb:it.kb,fuse:it.fuse,blast:it.blast,grav:it.grav});
    SND.place();
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
  // 4b. Fahrzeug abstellen. Vor dem Blocksetzen, weil Boot/Brett/Schirm keine
  // Blöcke sind und sonst nie an die Reihe kämen.
  if(it&&VEH_OF_ITEM[id]){
    if(placeVehicleFromHand(VEH_OF_ITEM[id])){ consumeHeld(); updateHUD(); }
    else SND.fail();
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
  // 5b. Schild setzen — frisch gesetzt öffnet es gleich den Editor, damit man
  // nicht extra nochmal hinsehen und Rechtsklick drücken muss.
  if(it&&it.sign&&target){
    const p=target.place;
    if(!canPlaceAt(p.x,p.y,p.z)||!blockAt(p.x,p.y-1,p.z)) return;
    const key=K(p.x,p.y,p.z);
    if(signs.has(key)) return;               // hier steht schon eines
    signs.set(key,{text:''});
    ensureSignLabel(p.x,p.y,p.z);
    consumeHeld(); SND.place(); updateHUD();
    if(isConnected()) send({t:'sign-place',x:p.x,y:p.y,z:p.z});
    openSignEditor(p.x,p.y,p.z);
    return;
  }
  // 6. Block setzen
  if(it&&it.block&&target){
    const p=target.place;
    if(!canPlaceAt(p.x,p.y,p.z)) return;
    setBlock(p.x,p.y,p.z,it.block);
    // Frisch gesetzte Truhe: sofort lokal ein leeres 24-Fächer-Objekt anlegen,
    // damit man sie ohne Wartezeit auf eine Server-Antwort öffnen und
    // benutzen kann. Der Server legt serverseitig unabhängig dasselbe an
    // (siehe der 'block'-Handler dort) — rein für die eigene, sofortige
    // Reaktionsfähigkeit hier, kein Sync-Anliegen, da der Server ohnehin
    // Autorität bleibt.
    if(it.block==='chest'){
      const k=K(p.x,p.y,p.z);
      if(!chests.has(k)) chests.set(k,{items:Array(24).fill(null),opened:false});
    }
    consumeHeld(); state.placed++;
    SND.place(); updateHUD();
  }
}
// hitMob ist der einzige Ort, der weiß, ob wir online sind oder nicht — jeder
// Angriff (Nahkampf hier unten in attack(), Geschosse in updateShots/
// detonate) ruft nur noch hier durch, statt die Verzweigung selbst zu kennen.
// dx,dz  Stoßrichtung, muss nicht normiert sein
function hitMob(m,dmg,kb,dx,dz){
  const l=Math.hypot(dx,dz)||1, kx=dx/l*kb, kz=dz/l*kb;
  // Online: nur die Trefferabsicht melden, hp NICHT lokal anfassen — die
  // tatsächliche Änderung kommt einen Tick später über mob-state/mob-dead
  // zurück (siehe die Handler weiter unten). Eine bewusste, kleine
  // Latenz, kein Bug.
  if(isConnected()){ playSample('punch',.6); send({t:'mob-hit',id:m.id,dmg,kx,kz}); return; }
  damageMob(m,dmg,kx,kz);
}
function attack(){
  if(player.atkCd>0||state.paused) return;
  // Ein Schlag auf ein abgestelltes Fahrzeug hebt es auf — dasselbe Gefühl
  // wie einen Block abbauen, nur ohne Grabezeit (es liegt ja nur herum).
  if(aimedVehicle){ player.atkCd=.35; SND.swing(); pickUpVehicle(aimedVehicle); return true; }
  player.atkCd=.45;
  el('cross').classList.add('swing');
  setTimeout(()=>el('cross').classList.remove('swing'),110);
  SND.swing();
  updateEyeRay();
  const dir=eyeDir;
  let best=null,bestD=1e9;
  for(const m of mobs){
    const dx=m.x-player.x, dz=m.z-player.z, d=Math.hypot(dx,dz);
    if(d>3.4) continue;
    const dot=(dx/d)*dir.x+(dz/d)*dir.z;
    if(dot<.4) continue;
    if(d<bestD){ bestD=d; best=m; }
  }
  if(!best) return false;
  // Stoßrichtung: vom Spieler weg, mit der Wucht der Waffe in der Hand.
  hitMob(best,heldDmg(),heldKb(),best.x-player.x,best.z-player.z);
  return true;
}

// ------------------------------------------------------------------ Truhen
let openChestCell=null;
function openChest(cell){
  const k=K(cell.x,cell.y,cell.z);
  // Truhen, die dieser Client noch nie berührt hat (z.B. gerade erst von
  // einem ANDEREN Spieler gesetzt), haben hier lokal noch gar keinen
  // Eintrag — bisher kam der erst mit der ersten chest-take/chest-put-
  // Antwort an, was ein frisch gesetztes, noch unberührtes Fach unmöglich
  // zu öffnen machte. Da man diese Funktion ohnehin nur über einen echten
  // Truhen-Block erreicht (target.type==='chest' in useRight, oder ein
  // Testaufruf mit derselben Annahme), ist "kein Eintrag" hier gleichbedeutend
  // mit "leere Truhe" — genau das legt on('chest-sync',...) im selben Fall
  // ebenfalls an.
  let c=chests.get(k);
  if(!c){ c={items:Array(24).fill(null),opened:false}; chests.set(k,c); }
  if(!c.opened){ c.opened=true; state.chests++; }
  openChestCell=cell;
  panel='chest';
  SND.chest();
  renderChest();
}
// Zweiseitiges Fenster: 24 feste Truhenfächer oben, das eigene Inventar
// (invGrid(), unverändert wiederverwendet — genau wie renderCraft() das
// schon für das Rucksackraster tut) darunter. Kein Knopf-basiertes "Alles
// nehmen" mehr als einzige Bedienung — direktes Klicken auf ein Fach nimmt
// oder legt, genau wie im Handwerksraster.
function chestGrid(c){
  let h='<div class="invgrid">';
  for(let i=0;i<24;i++) h+=`<div class="cell" data-chest="${i}">${stackHTML(c.items[i])}</div>`;
  h+='</div>';
  return h;
}
function renderChest(){
  const c=chests.get(K(openChestCell.x,openChestCell.y,openChestCell.z));
  if(!c) return;
  const hasAny=c.items.some(Boolean);
  let h='<h2>🧰 Truhe</h2>'+chestGrid(c)+
    '<h3>Rucksack</h3>'+invGrid()+
    dragHint()+
    '<div class="btnrow">'+(hasAny?'<button data-act="takeall">Alles nehmen</button>':'')+
    '<button class="primary" data-act="close">Schließen</button></div>';
  showModal(h,true);
  drawCarry();
  updateItemTip();
}
// Truhen-Klicks fassen zwei gekoppelte Wirkungen an: den gemeinsamen
// Truhenbestand UND das eigene (lokale, unsynchronisierte) Inventar/carry.
// Würden zwei Spieler fast gleichzeitig denselben Stapel anklicken und jeder
// optimistisch lokal anwenden, könnten beide sich den vollen Bestand
// gutschreiben, obwohl er nur einmal da war — echte Vervielfältigung. Darum
// entscheidet ausschließlich der SERVER, wieviel eine Anfrage wirklich
// bekommt (chest-take/chest-put → chest-sync), und der anfragende Client
// rührt sein Inventar/carry erst an, wenn die Antwort da ist (siehe
// on('chest-sync',...)). Offline/Einzelspieler fällt auf das alte
// Direkt-Verhalten zurück. Ein Klick auf ein Fach mit einem ANDEREN
// Gegenstand tauscht — genau wie im Rucksackraster (clickCell) und aus
// demselben Grund: die Fächer 0-3 der Weltlruhen sind ab Werk belegt, und
// wer dort mit vollem Zeiger hinklickte, sah bisher gar nichts passieren
// ("man kann nichts in Truhen legen"). Race-sicher bleibt das, weil auch
// der Tausch online eine EINZELNE servergeprüfte Anfrage ist (chest-put mit
// swap) und nicht etwa ein ungeschütztes Nehmen-dann-Legen: verlieren zwei
// gleichzeitige Tauscher, trägt der Zweite den Stapel des Ersten davon,
// vervielfältigt wird nichts. Rechtsklick (one) tauscht nicht — dort gilt
// wie im Rucksack "getauscht wird nur mit voller Hand".
function clickChestCell(i,one){
  const c=chests.get(K(openChestCell.x,openChestCell.y,openChestCell.z));
  if(!c) return;
  const cur=c.items[i];
  if(!carry){
    if(!cur) return;
    const want=one?1:cur.n;
    if(isConnected()){
      send({t:'chest-take',x:openChestCell.x,y:openChestCell.y,z:openChestCell.z,slot:i,n:want});
      return;
    }
    carry={id:cur.id,n:want};
    cur.n-=want; if(cur.n<=0) c.items[i]=null;
    SND.tap(); renderChest();
  }else{
    const swap=!!cur&&cur.id!==carry.id;
    if(swap&&one){ SND.fail(); return; }   // Tausch nur mit vollem Stapel, s.o.
    const spaceLeft=cur&&!swap?STACK-cur.n:STACK;
    const want=Math.min(one?1:carry.n,spaceLeft);
    // Ein Teiltausch ginge nicht auf: der zurückkommende Stapel bräuchte die
    // Hand, die dann noch den Rest hält. Volles Fach: auch nichts zu machen.
    if(want<=0||(swap&&want<carry.n)){ SND.fail(); return; }
    if(isConnected()){
      send({t:'chest-put',x:openChestCell.x,y:openChestCell.y,z:openChestCell.z,slot:i,id:carry.id,n:want,swap});
      return;
    }
    if(swap){
      c.items[i]={id:carry.id,n:want};
      carry=cur;
    }else{
      if(cur) cur.n+=want; else c.items[i]={id:carry.id,n:want};
      carry.n-=want; if(carry.n<=0) carry=null;
    }
    SND.tap(); renderChest();
  }
}
// Bequemlichkeits-Knopf: alles auf einmal in den eigenen Rucksack. Läuft
// online bewusst NACHEINANDER (ein chest-take in der Luft, dann erst das
// nächste) statt alle 24 Fächer auf einmal loszuschicken — grant landet
// serverseitig im gemeinsamen `carry`-Zeiger (genau wie ein manueller Klick),
// und der hätte bei gleichzeitig eintreffenden Antworten für mehrere
// verschiedene Gegenstände keinen Platz für mehr als einen Stapel. Jeder
// Schritt wartet auf die eigene chest-sync-Antwort und räumt den Zeiger
// sofort in den Rucksack, bevor der nächste startet — keine Vervielfältigung,
// weil pro Fach weiterhin genau eine servergeprüfte Anfrage unterwegs ist.
function waitForChestSync(pos,timeoutMs=2500){
  return new Promise(resolve=>{
    let done=false;
    const off=on('chest-sync',msg=>{
      if(msg.x!==pos.x||msg.y!==pos.y||msg.z!==pos.z) return;
      if(done) return; done=true;
      clearTimeout(t); off(); resolve();
    });
    const t=setTimeout(()=>{ if(done) return; done=true; off(); resolve(); },timeoutMs);
  });
}
async function takeAllFromChest(){
  const pos={x:openChestCell.x,y:openChestCell.y,z:openChestCell.z};
  const c=chests.get(K(pos.x,pos.y,pos.z));
  if(!c) return;
  if(!isConnected()){
    for(let i=0;i<24;i++){
      const it=c.items[i]; if(!it) continue;
      const rest=give(it.id,it.n);
      it.n=rest; if(it.n<=0) c.items[i]=null;
    }
    SND.tap(); updateHUD(); renderChest();
    return;
  }
  for(let i=0;i<24;i++){
    if(!openChestCell||openChestCell.x!==pos.x||openChestCell.y!==pos.y||openChestCell.z!==pos.z) return;
    const it=c.items[i]; if(!it) continue;
    if(carry) break;                        // etwas anderes hängt schon am Zeiger — nicht überschreiben
    send({t:'chest-take',x:pos.x,y:pos.y,z:pos.z,slot:i,n:it.n});
    await waitForChestSync(pos);
    if(carry){ giveOrDrop(carry.id,carry.n); carry=null; drawCarry(); }
  }
  updateHUD();
}

// ------------------------------------------------------------------ Schilder
// Text, den irgendein Mitspieler getippt hat, landet unescaped in signs —
// beim Bau des Editor-Fensters (innerHTML, siehe showModal) muss er darum
// escaped werden, sonst könnte ein böswillig beschriftetes Schild anderen
// Spielern beliebiges HTML unterschieben.
const escHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let openSignCell=null;
// Kein Wettlauf-Schiedsrichter nötig (siehe Design-Kommentar bei signs):
// Speichern/Entfernen wenden sich sofort lokal an UND broadcasten — im
// schlimmsten Fall gewinnt bei zwei fast gleichzeitigen Änderungen einfach
// der zuletzt angekommene Text, was für ein Kosmetik-Feld unbedenklich ist.
function openSignEditor(x,y,z){
  const key=K(x,y,z);
  const s=signs.get(key);
  if(!s) return;                          // inzwischen entfernt — nichts zu bearbeiten
  openSignCell={x,y,z};
  showModal(`<h2>🪧 Schild</h2>
    <p><input id="signInput" type="text" maxlength="${SIGN_MAX}" autocomplete="off"
      placeholder="Was soll hier stehen?" value="${escHtml(s.text)}" style="
      width:100%;box-sizing:border-box;padding:10px;border-radius:8px;
      border:1px solid #4a774a;background:#0f1c0f;color:#eaf3ea;font-size:15px"></p>
    <div class="btnrow">
      <button data-act="signremove">Entfernen</button>
      <button data-act="close">Abbrechen</button>
      <button class="primary" data-act="signsave">Speichern</button>
    </div>`);
  const inp=el('signInput');
  if(inp){
    inp.focus();
    inp.setSelectionRange(inp.value.length,inp.value.length);
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); saveSignEditor(); } });
  }
}
// Auto-vivify wie potAdd/pot-add: taucht die Zelle inzwischen (z.B. durch
// ein fast gleichzeitiges Entfernen von einem anderen Client) lokal gar
// nicht mehr auf, legt Speichern sie einfach neu an — der eigene, gerade
// eingegebene Text gewinnt, siehe Design-Kommentar oben.
function saveSignEditor(){
  if(!openSignCell) return;
  const {x,y,z}=openSignCell;
  const key=K(x,y,z);
  const inp=el('signInput');
  const text=(inp?inp.value:'').slice(0,SIGN_MAX);
  let s=signs.get(key);
  if(!s){ s={text:''}; signs.set(key,s); }
  s.text=text;
  ensureSignLabel(x,y,z);
  if(isConnected()) send({t:'sign-write',x,y,z,text});
  SND.tap();
  hideModal();
}
function removeSignEditor(){
  if(!openSignCell) return;
  const {x,y,z}=openSignCell;
  signs.delete(K(x,y,z));
  removeSignLabel(x,y,z);
  if(isConnected()) send({t:'sign-remove',x,y,z});
  SND.pop();
  hideModal();
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
// Welches Fenster gerade offen ist — Raster (Rucksack/Werkbank), Truhe,
// Markt oder Kochtopf. clickCell() braucht das, um zu wissen, was es nach
// einem Klick neu zeichnen muss (s.u.).
let panel=null;
function rerenderPanel(){
  if(panel==='chest') renderChest();
  else if(panel==='market') openMarket(marketChar,true);
  else if(panel==='pot') renderPot();
  else renderCraft();
}
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
  tradePartner=null; mining=false; openSignCell=null; openPotCell=null; panel=null;
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
  SND.tap(); updateHUD();
  // clickCell bedient das Rucksack-Gitter, das Werkbank-/Rucksackfenster,
  // Truhenfenster UND (seit dem Markt) das Marktfenster gemeinsam nutzen —
  // neu zeichnen muss darum das gerade offene Fenster (panel), nicht blind
  // eines der drei, sonst reißt ein Klick ins eigene Inventar bei offener
  // Truhe oder offenem Markt die Ansicht auf die Werkbank um.
  rerenderPanel();
}
function dropCarry(){                    // beim Schließen zurück in den Rucksack
  if(!carry) return;
  giveOrDrop(carry.id,carry.n);
  carry=null;
  drawCarry();
}
// Am Finger aus dem Fenster hinausgezogen und losgelassen: der Stapel fliegt
// vor die Füße, statt in den Rucksack zurückzuwandern (siehe touchCellUp).
// Dieselbe Flugbahn wie beim Wegwerfen mit Q — dort steht sie ausführlich
// erklärt (dropHeld), hier nur nachgefahren, weil der Stapel nicht aus einem
// Leistenfach kommt, sondern vom Daumen.
function dropCarryToWorld(){
  if(!carry) return;
  updateEyeRay(); _rd.copy(eyeDir);
  const l=Math.hypot(_rd.x,_rd.z)||1, fx=_rd.x/l, fz=_rd.z/l;
  spawnDrop(carry.id,carry.n,player.x+fx*.55,player.y+1.15,player.z+fz*.55,fx*3,1.1,fz*3,1.6);
  carry=null;
  drawCarry(); SND.place(); updateHUD(); rerenderPanel();
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
  if(d.shop) return d.shop;
  // Kein echter Gegenstand, aber Text nur auf Zuruf gibt es hier trotzdem —
  // das Sonderzeichen fängt updateItemTip weiter unten ab.
  if(d.accept!=null) return 'accept';
  if(d.chest!=null&&openChestCell){
    const c=chests.get(K(openChestCell.x,openChestCell.y,openChestCell.z));
    return c?.items[+d.chest]?.id||null;
  }
  if(d.pot!=null&&openPotCell){
    const p=pots.get(K(openPotCell.x,openPotCell.y,openPotCell.z));
    return p?.items[+d.pot]?.id||null;
  }
  if(d.act==='craft') return matchRecipe()?.out[0]||null;
  return null;
}
function updateItemTip(){
  // Beim Tragen hängt der Stapel schon am Zeiger, da stört der Kasten nur.
  if(carry||document.pointerLockElement){ tipEl.style.display='none'; return; }
  const node=document.elementFromPoint?.(mouseX,mouseY);
  const cell=node&&node.closest?.(
    '[data-slot],[data-bar],[data-g],[data-chest],[data-pot],[data-want],[data-act],[data-shop],[data-accept]');
  const id=itemUnder(cell);
  if(!id){ tipEl.style.display='none'; return; }
  if(id==='accept') tipEl.innerHTML='<b>Mannis Annahme</b><i>Stapel ablegen — verkauft sofort</i>';
  else{
    // Bei Manni zählt Preis und Beschreibung, nicht die Spielwerte-Notiz —
    // die zwei Tooltipp-Arten teilen sich hier bewusst nur das Gerüst.
    const shop=cell.dataset.shop&&SHOP.find(s=>s.id===id);
    if(shop&&shop.skin){
      // Kein ITEMS-Eintrag, also auch keine ITEMS[id].nm weiter unten —
      // Name/Emoji kommen stattdessen aus SKINS (siehe skinIcon/openMarket).
      const sk=SKINS[shop.skinIdx], owned=player.skins.includes(shop.skinIdx);
      const active=player.skin===shop.skinIdx;
      const note=active?'Angezogen':owned?'Gekauft — anklicken zum Anziehen':shop.price+' € · '+shop.txt;
      tipEl.innerHTML=`<b>${sk.ic} ${sk.nm}</b><i>${note}</i>`;
    }else{
      const note=shop?shop.price+' € · '+shop.txt:itemNote(id);
      tipEl.innerHTML=`<b>${ITEMS[id].nm}</b>`+(note?`<i>${note}</i>`:'');
    }
  }
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
// Eine Zeile für beide Fenster (Raster wie Truhe) — stand früher zweimal im
// Text und drohte irgendwann auseinanderzudriften.
// Am Finger gibt es keine zwei Maustasten — dort steht die Geste, die statt
// ihrer gilt (siehe mbox.pointerdown und touchCellUp im Abschnitt "Finger").
const dragHint=()=>TOUCH
  ?'<p class="hint">Tippen Stapel · Halten eins · Ziehen verschieben · hinaus werfen</p>'
  :'<p class="hint">🖱️L Stapel · 🖱️R eins</p>';
function craftHTML(){
  const r=matchRecipe();
  let h=`<div class="craft"><div class="cgrid c${gridN}">`;
  h+=gridCells().map(i=>`<div class="cell" data-g="${i}">${stackHTML(grid[i])}</div>`).join('');
  h+='</div><div class="arrow">➜</div>';
  h+=`<div class="cell res${r?'':' empty'}" data-act="craft">`+
     (r?icon(r.out[0])+`<span class="n">${r.out[1]>1?r.out[1]:''}</span>`:'')+'</div></div>';
  if(gridN===2) h+='<p class="hint">2×2 — Größeres nur an der 🛠️ Werkbank.</p>';
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
  panel='craft';
  renderCraft(false);
}
function renderCraft(keep=true){
  const title=craftStation==='bench'?'🛠️ Werkbank':'🎒 Inventar';
  showModal('<h2>'+title+'</h2>'+craftHTML()+'<h3>Rucksack</h3>'+invGrid()+
    dragHint()+
    '<div class="btnrow"><button class="primary" data-act="close">Schließen</button></div>',
    keep,sideHTML());
  drawCarry();
  updateItemTip();          // der Zeiger steht still, aber die Zelle ist neu
}
function openIntro(){
  showModal(`<h2>⛏️ ErnteDominiksFest</h2>
  <p><b>Ziel: ${GOAL} €.</b> Ernte 🍑 Dominiks, verkauf sie bei 🛒 Manni — gekocht bringen sie
  ein Vielfaches, die 🍲 Suppe allein <b>100 €</b>.</p>
  <p>Nachts kommen die 🌙 Bennis; Licht und eine Waffe halten sie fern.</p>
  <div class="kbd">
    <b>WASD</b> laufen &nbsp; <b>⇧</b> rennen &nbsp; <b>␣</b> springen<br>
    <b>LMB</b> abbauen / schlagen &nbsp; <b>RMB</b> setzen / benutzen / lesen / essen<br>
    <b>Q</b> wegwerfen &nbsp; <b>⇧Q</b> ganzen Stapel &nbsp; <b>E</b> Inventar<br>
    <b>V</b> Sicht wechseln &nbsp; <b>F</b> aussteigen &nbsp;
    <b>1-9</b> Leiste &nbsp; <b>Rad</b> wechseln &nbsp; <b>P</b> Pause
  </div>
  <div class="btnrow"><button class="primary" data-act="start">Los geht's</button></div>`);
}
function togglePause(){
  if(modalOpen()){ hideModal(); return; }
  showModal(`<h2>⏸️ Pause</h2>
    <p style="font-size:13px">💶${state.money} · 🎯${state.earned}/${GOAL} ·
    📜${known.size}/${RECIPES.length} · 🌙 Tag ${state.day}</p>
    <div class="btnrow">
      <button data-act="help">❓ Hilfe</button>
      <button class="primary" data-act="close">Weiter</button></div>`);
}
// Zellen hören auf mousedown, sonst käme die rechte Maustaste nie an:
// ein Rechtsklick löst gar kein click-Ereignis aus.
// Eine Zelle bedienen — von Maus wie Finger aus derselben Stelle heraus.
function useCell(c,one){
  if(c.dataset.chest!=null) clickChestCell(+c.dataset.chest,one);
  else if(c.dataset.pot!=null) clickPotCell(+c.dataset.pot,one);
  else if(c.dataset.slot!=null) clickCell({k:'i',i:+c.dataset.slot},one);
  else if(c.dataset.accept!=null) clickAccept(one);
  else clickCell({k:'g',i:+c.dataset.g},one);
}
// pointerdown statt mousedown: dasselbe Ereignis deckt Maus und Finger ab.
// Die Maus behält ihre zwei gewohnten Tasten. Am Finger gibt es die rechte
// nicht, dafür drei Gesten — und welche es war, weiß man erst hinterher,
// darum merkt sich der Druck hier nur, wo er anfing (Auflösung in
// touchCellMove/touchCellUp im Abschnitt "Finger"):
//
//   tippen        ganzer Stapel, genau wie ein Linksklick
//   lang drücken  genau eins, die Vertretung für den Rechtsklick
//   ziehen        aufnehmen und woandershin fallen lassen — und wer über den
//                 Fensterrand hinauszieht, wirft in die Welt
let cellHoldT=0, cellHeld=null, cellDidHold=false, cellDrag=false, cellX=0, cellY=0;
mbox.addEventListener('pointerdown',e=>{
  const c=e.target.closest('[data-slot],[data-g],[data-chest],[data-pot],[data-accept]');
  if(!c) return;
  e.preventDefault(); e.stopPropagation();
  ac();
  if(e.pointerType!=='touch'){ useCell(c,e.button===2); return; }
  cellHeld=c; cellDidHold=false; cellDrag=false;
  cellX=cellY=0; cellX=e.clientX; cellY=e.clientY;
  mouseX=e.clientX; mouseY=e.clientY;      // damit der Stapel gleich am Daumen hängt
  cellHoldT=setTimeout(()=>{
    if(cellDrag) return;                   // das Ziehen war schneller
    cellDidHold=true; useCell(c,true);
    drawCarry();
  },HOLD_MS+90);
});
mbox.addEventListener('click',e=>{
  const b=e.target.closest('button,[data-act],[data-shop]');
  if(!b) return;
  e.stopPropagation();
  ac();
  if(b.dataset.shop){ buyFrom(b.dataset.shop); return; }
  const act=b.dataset.act;
  if(act==='craft'){ craftFromGrid(); return; }
  if(act==='trade'){ doTrade(); return; }
  if(act==='cook'){ cookPot(openPotCell); return; }
  if(act==='close') hideModal();
  else if(act==='takeall'){ takeAllFromChest(); }
  else if(act==='help') openIntro();
  // Am Finger geht es gleich ins Vollbild: der Klick auf "Weiter" ist die
  // echte Fingerbewegung, die der Browser dafür verlangt, und einen zweiten
  // günstigen Moment gibt es später kaum noch (siehe goFullscreen).
  else if(act==='start'){
    localStorage.setItem('edf_seen','1'); hideModal(); state.started=true;
    if(TOUCH) goFullscreen();
  }
  else if(act==='pwsubmit') submitPassword();
  else if(act==='signsave') saveSignEditor();
  else if(act==='signremove') removeSignEditor();
});

// ------------------------------------------------------------------ Fahrzeuge
// Boot, Brett und Schirm wirkten früher, solange man sie in der HAND hielt —
// man fuhr also mit einem Gegenstand im Rucksack, den niemand sah, und wer
// segelte, konnte nebenbei nichts anderes greifen. Jetzt sind es Dinge in der
// Welt: hinstellen, einsteigen, fahren, aussteigen, wieder aufheben. Sie
// leben (wie Schilder und Fackeln) außerhalb des Block-Rasters, weil sie
// zwischen den Feldern stehen und sich bewegen.
//
// `seat` ist die Höhe, auf der die Figur über dem Fahrzeugpunkt sitzt/steht,
// `pose` ihre Haltung dabei (siehe posePlayerModel).
const VEHICLES={
  // Der Sitzplatz im Boot liegt UNTER dem Fahrzeugpunkt: die Figur klappt
  // die Beine nach vorn (pose 'sit'), ihre Hüfte sitzt 0,74 über dem eigenen
  // Nullpunkt — ohne diesen Versatz schwebte sie über der Bordwand, statt
  // im Rumpf zu sitzen.
  boat  :{item:'boat',  nm:'Boot',        pose:'sit', seat:-.45, water:8.0, land:1.6, float:true},
  board :{item:'board', nm:'Skateboard',  pose:'ride',seat:.19, water:1.4, land:8.6},
  glider:{item:'glider',nm:'Gleitschirm', pose:'hang',seat:.25, water:2.2, land:5.0, glide:true},
  // Das teuerste Stück im Laden: an Land außer Konkurrenz (mehr als anderthalb
  // Skateboards), im Wasser dagegen ein Klotz — kein float, er sackt einfach
  // durch, statt zu schwimmen. seat sitzt hoch, weil die Figur oben aus der
  // offenen Kabine herausragen soll statt darin zu verschwinden (siehe
  // makeVehicleModel). Das Zerlegen von Blöcken im Weg steckt nicht hier,
  // sondern in updatePlayer (siehe truckSmash) — genau dort, wo die
  // Kollision sonst jedes Fahrzeug ausbremst.
  truck :{item:'truck', nm:'Monstertruck', pose:'sit', seat:.55, water:1.0, land:13},
};
const VEH_OF_ITEM={boat:'boat',board:'board',glider:'glider',truck:'truck'};
const vehicles=new Map();                 // id -> {id,kind,x,y,z,yaw,rider,group,canopy}
let riding=null;                          // das Fahrzeug, auf dem man selbst sitzt
let vehSeq=0, vehSendT=0;
function vehicleOfRider(pid){
  if(pid==null) return null;
  for(const v of vehicles.values()) if(v.rider===pid) return v;
  return null;
}
// Die Modelle sind bewusst aus denselben Kästen gebaut wie die Spielerfigur —
// gedreht wird nach -Z, also zeigt der Bug dorthin, wohin auch die Figur sieht.
function makeVehicleModel(kind){
  const g=new THREE.Group();
  if(kind==='boat'){
    const base=box(.86,.14,1.6,'#8a5a2b'); base.position.y=.07; g.add(base);
    for(const x of [-.43,.43]){ const s=box(.1,.3,1.6,'#a06a33'); s.position.set(x,.24,0); g.add(s); }
    for(const z of [-.8,.8]){ const w=box(.86,.3,.1,'#a06a33'); w.position.set(0,.24,z); g.add(w); }
    const seat=box(.7,.08,.36,'#6d4520'); seat.position.set(0,.2,.15); g.add(seat);
  }else if(kind==='board'){
    const deck=box(.42,.07,1.1,'#2f3140'); deck.position.y=.16; g.add(deck);
    // Die Nase steht hoch, sonst sieht ein Brett aus wie ein Brett.
    const nose=box(.42,.07,.26,'#2f3140'); nose.position.set(0,.21,-.62); nose.rotation.x=.45; g.add(nose);
    const tail=box(.42,.07,.26,'#2f3140'); tail.position.set(0,.21,.62); tail.rotation.x=-.45; g.add(tail);
    for(const x of [-.19,.19]) for(const z of [-.36,.36]){
      const w=box(.08,.11,.11,'#e8dfc4'); w.position.set(x,.07,z); g.add(w);
    }
  }else if(kind==='truck'){
    // Kastenkarosserie mit hochgezogener Kabine vorn (an -Z, wie beim Boot der
    // Bug) und vier dicken Rädern an den Ecken — schlichte dunkle Kästen statt
    // Zylinder, das passt besser zum eckigen Look der übrigen Fahrzeuge/Figur.
    // Bewusst wuchtiger als Boot und Brett, aber die Kabine bleibt niedrig
    // genug, dass die Figur (seat:.55) oben sichtbar herausragt statt zu
    // verschwinden.
    const chassis=box(1.3,.5,2.2,'#c8371f'); chassis.position.y=.62; g.add(chassis);
    const cab=box(1.1,.55,.9,'#a82c16'); cab.position.set(0,1.0,-.55); g.add(cab);
    const glass=box(.9,.32,.06,'#1c232c'); glass.position.set(0,1.05,-.97); g.add(glass);
    for(const [x,z] of [[-.62,-.85],[.62,-.85],[-.62,.85],[.62,.85]]){
      const w=box(.34,.62,.62,'#191919'); w.position.set(x,.34,z); g.add(w);
      const hub=box(.06,.24,.24,'#666'); hub.position.set(x+(x>0?.16:-.16),.34,z); g.add(hub);
    }
  }else{
    // Am Boden ein zusammengelegtes Bündel, in der Luft die aufgespannte
    // Kappe darüber — dasselbe Fahrzeug, zwei Zustände (siehe updateVehicles).
    const pack=box(.5,.3,.4,'#d2503f'); pack.position.y=.15; g.add(pack);
    const canopy=new THREE.Group();
    const COL=['#d2503f','#e8a13a','#d2503f','#e8a13a','#d2503f'];
    for(let i=0;i<5;i++){
      const seg=box(.52,.12,1.5,COL[i]);
      const a=(i-2)*.34;
      seg.position.set(Math.sin(a)*1.25,2.2+Math.cos(a)*.28,0);
      seg.rotation.z=-a;
      canopy.add(seg);
    }
    for(const x of [-.9,.9]){
      const line=box(.03,1.5,.03,'#3a3a3a'); line.position.set(x*.75,1.35,0); line.rotation.z=x>0?-.35:.35;
      canopy.add(line);
    }
    canopy.visible=false;
    g.add(canopy);
    g.userData.canopy=canopy; g.userData.pack=pack;
  }
  return g;
}
function addVehicle(v){
  const g=makeVehicleModel(v.kind);
  g.position.set(v.x,v.y,v.z); g.rotation.y=v.yaw||0;
  scene.add(g);
  v.group=g;
  v.rx=v.x; v.ry=v.y; v.rz=v.z; v.ryaw=v.yaw||0;   // geglättete Anzeigelage
  vehicles.set(v.id,v);
  return v;
}
function dropVehicle(id){
  const v=vehicles.get(id);
  if(!v) return;
  if(riding===v) riding=null;
  scene.remove(v.group);
  disposeModel(v.group);
  vehicles.delete(id);
}
// Abstellen: auf den anvisierten Platz, und wenn man aufs Wasser zielt (dort
// gibt es keinen Block, an dem der Strahl hängenbliebe) knapp vor die eigenen
// Füße auf die Wasserlinie — sonst könnte man ein Boot nie zu Wasser lassen.
function placeVehicleFromHand(kind){
  let x,y,z;
  if(target){
    const p=target.place;
    // Bewusst NICHT canPlaceAt: das verbietet auch das Feld, in dem man
    // selbst steht — bei einem Block richtig, hier hinderlich. Ein Fahrzeug
    // ist kein Klotz, man steht ja gleich selbst darauf, und wer nach unten
    // schaut, will es vor die eigenen Füße stellen.
    if(p.x<BOUND.x0||p.x>BOUND.x1||p.z<BOUND.z0||p.z>BOUND.z1) return false;
    if(p.y<-8||p.y>60||blockAt(p.x,p.y,p.z)) return false;
    x=p.x; y=p.y; z=p.z;
  }else{
    updateEyeRay();
    const l=Math.hypot(eyeDir.x,eyeDir.z)||1;
    x=player.x+eyeDir.x/l*1.8; z=player.z+eyeDir.z/l*1.8;
    if(!waterAt(x,WATER_Y-.2,z)) return false;      // ins Leere stellen geht nicht
    y=WATER_Y;
  }
  if(kind==='boat'&&waterAt(x,y+.2,z)) y=WATER_Y;   // ein Boot schwimmt oben
  const id=`${getPid()??'off'}-v${++vehSeq}`;
  const v=addVehicle({id,kind,x,y,z,yaw:player.yaw,rider:null});
  if(isConnected()) send({t:'vehicle-place',id,kind,x,y,z,yaw:player.yaw});
  SND.place();
  return !!v;
}
// Anvisieren wie bei Bewohnern/Schildern: das nächste Fahrzeug in Reichweite,
// das ungefähr in Blickrichtung liegt.
function aimVehicle(maxDist){
  updateEyeRay(); _rd.copy(eyeDir);
  let best=null,bestD=1e9;
  for(const v of vehicles.values()){
    if(v===riding) continue;
    const dx=v.x-player.x, dy=v.y+.4-(player.viewY+EYE), dz=v.z-player.z;
    const d=Math.hypot(dx,dy,dz);
    if(d>maxDist||d>bestD) continue;
    // Aus der Nähe darf der Blick grob danebenliegen: wer direkt daneben
    // steht, sieht schon über das Boot hinweg, meint aber offensichtlich es.
    if((dx*_rd.x+dy*_rd.y+dz*_rd.z)/(d||1)<(d<1.8?.1:.86)) continue;
    best=v; bestD=d;
  }
  return best;
}
// Einsteigen ist online server-arbitriert (wie ein Truhen-Griff): säßen zwei
// Spieler nach zwei fast gleichzeitigen Klicks beide in demselben Boot, führe
// es an zwei Orte gleichzeitig. Der Server bestimmt den einen Fahrer und
// schickt das Ergebnis an alle (siehe on('vehicle-rider')).
function enterVehicle(v){
  if(!v||v.rider!=null) { SND.fail(); return; }
  if(isConnected()){ send({t:'vehicle-enter',id:v.id}); return; }
  v.rider=getPid()??0;
  riding=v;
  onMounted();
}
function onMounted(){
  view=view||1;                            // Fahren zeigt man in dritter Person
  player.x=riding.x; player.z=riding.z; player.y=riding.y; player.vy=0;
  SND.chest();
  toast('🚗 Eingestiegen.','',1600);
}
function leaveVehicle(){
  if(!riding) return;
  const v=riding;
  // Neben dem Fahrzeug absetzen, nicht hinein: ein Ausstieg mitten im Rumpf
  // schöbe einen beim nächsten Bild irgendwohin.
  const sin=Math.sin(player.yaw), cos=Math.cos(player.yaw);
  for(const [ox,oz] of [[cos,-sin],[-cos,sin],[sin,cos],[-sin,-cos],[0,0]]){
    const nx=v.x+ox*1.1, nz=v.z+oz*1.1;
    const ny=surfaceAt(nx,nz);
    if(!collides(nx,ny,nz)){ player.x=nx; player.z=nz; player.y=player.fallFrom=ny; break; }
  }
  player.vy=0;
  riding=null;
  v.rider=null;
  if(isConnected()) send({t:'vehicle-leave',id:v.id});
  SND.tap();
}
// Aufheben: online entscheidet der Server, WER das Fahrzeug bekommt (sonst
// bekämen zwei gleichzeitig Zuschlagende je einen Gegenstand aus einem).
function pickUpVehicle(v){
  if(!v||v.rider!=null){ SND.fail(); return false; }
  if(isConnected()){ send({t:'vehicle-remove',id:v.id}); return true; }
  dropVehicle(v.id);
  giveOrDrop(VEHICLES[v.kind].item,1);
  SND.pop(); updateHUD();
  return true;
}
function updateVehicles(dt){
  const f=Math.min(1,dt*10);
  for(const v of vehicles.values()){
    // Das eigene Fahrzeug folgt dem Spieler ohne Umweg — er ist der, der es
    // bewegt. Fremde ziehen wie Mitspieler zum zuletzt gemeldeten Stand
    // nach, statt bei jeder Nachricht zu springen. Die geglättete Lage steht
    // getrennt (rx/ry/rz/ryaw), damit das Schaukeln unten nicht in den
    // nächsten Glättungsschritt zurückläuft.
    if(v===riding){
      v.x=player.x; v.y=player.y; v.z=player.z; v.yaw=player.yaw;
      v.rx=v.x; v.ry=v.y; v.rz=v.z; v.ryaw=v.yaw;
    }else{
      v.rx=lerp(v.rx,v.x,f); v.ry=lerp(v.ry,v.y,f); v.rz=lerp(v.rz,v.z,f);
      let dy=v.yaw-v.ryaw;
      dy=((dy+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
      v.ryaw+=dy*f;
    }
    const g=v.group;
    g.position.set(v.rx,v.ry,v.rz);
    g.rotation.y=v.ryaw;
    // Schwimmendes schaukelt ein wenig, damit ein Boot nicht wie angenagelt
    // im Fluss steht.
    if(VEHICLES[v.kind].float&&waterAt(v.rx,v.ry+.2,v.rz)){
      g.position.y+=Math.sin(state.t*1.8+v.x)*.045;
      g.rotation.z=Math.sin(state.t*1.3+v.z)*.04;
    }else g.rotation.z=0;
    if(v.kind==='glider'){
      const flying=v.rider!=null;
      g.userData.canopy.visible=flying;
      g.userData.pack.visible=!flying;
    }
  }
  if(riding&&isConnected()){
    vehSendT+=dt;
    if(vehSendT>=.1){
      vehSendT=0;
      send({t:'vehicle-move',id:riding.id,x:riding.x,y:riding.y,z:riding.z,yaw:riding.yaw});
    }
  }
}

// ------------------------------------------------------------------ Spielerfigur
// Eine Klötzchen-Figur aus sechs Kästen (Kopf, Rumpf, zwei Arme, zwei Beine),
// passend zur würfeligen Welt. Eine kamerafeste Bildfläche wie bei den
// Bewohnern (setupChars) wäre hier gerade falsch: seit es die dritte Person
// gibt, sieht man sich selbst von hinten, und eine Fläche, die sich immer zur
// Kamera dreht, hat keine Rückseite.
//
// Die Figur baut nach -Z ("nach vorn" ist die Richtung, in die die Kamera bei
// yaw=0 schaut, siehe updatePlayer) — damit genügt group.rotation.y=yaw, für
// die eigene wie für fremde Figuren.
const SKIN='#e8b78d', PANTS='#3f4a66';
// Gesichter aus den Bildern, die ohnehin im Spiel stecken: dominik.png ist
// schon ein freigestellter Kopf, aus den Ganzkörperbildern von Manni und
// Jannes schneidet headTex den Kopf heraus (Werte von Hand an den Bildern
// abgelesen, als Anteil der Bildbreite/-höhe — nicht geraten, sondern gegen
// die Bilder geprüft). Fehlt ein Bild, bleibt der Kopf einfach ohne Gesicht.
const FACES=[
  {tex:()=>FACE_TEX.dominik,        crop:null},
  {tex:()=>CHAR_TEX.manni,          crop:{x:.44,y:.06,w:.24}},
  {tex:()=>CHAR_TEX.jannes,         crop:{x:.40,y:.06,w:.21}},
  {tex:()=>FACE_TEX.dominik,        crop:null},
];
const FACE_TEX={};
const faceCache=new Map();                // Index → THREE.Texture (jedes Gesicht nur einmal)
// Schneidet ein Quadrat aus einem geladenen Bild und macht daraus eine
// Textur für die Kopfvorderseite. Quadratisch deshalb, weil der Kopf ein
// Würfel ist — ein schiefes Rechteck würde das Gesicht verzerren.
function headTex(i){
  if(faceCache.has(i)) return faceCache.get(i);
  const spec=FACES[i%FACES.length];
  const src=spec.tex();
  const img=src&&src.image;
  if(!img||!img.width) return null;
  const S=96;
  const cv=document.createElement('canvas'); cv.width=cv.height=S;
  const ctx=cv.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  if(spec.crop){
    const w=img.width*spec.crop.w;
    ctx.drawImage(img,img.width*spec.crop.x,img.height*spec.crop.y,w,w,0,0,S,S);
  }else{
    // Ganzes Bild, aber mittig quadratisch beschnitten — dominik.png ist
    // hochkant, ohne Beschnitt säße das Gesicht gequetscht auf dem Würfel.
    const s=Math.min(img.width,img.height);
    ctx.drawImage(img,(img.width-s)/2,0,s,s,0,0,S,S);
  }
  const tex=new THREE.CanvasTexture(cv);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=THREE.NearestFilter; tex.minFilter=THREE.LinearMipmapLinearFilter;
  faceCache.set(i,tex);
  return tex;
}
// Zusatzgesicht nur für Skins (siehe SKINS unten) — bewusst NICHT in FACES
// oben mit hineingemischt: FACES.length bestimmt den Kreis, in dem headTex()
// ohne Skin über die pid rotiert, und der darf sich durch ein zusätzliches
// Gesicht nicht plötzlich verschieben. benni.png ist kein freigestellter
// Kopf wie dominik.png, sondern ein Ganzkörperbild — der Ausschnitt ist wie
// bei Manni/Jannes oben von Hand an dem Bild abgelesen.
const SKIN_FACES={benni:{tex:()=>benniTex, crop:{x:.395,y:.10,w:.25}}};
const skinFaceCache=new Map();            // Schlüssel aus SKIN_FACES → THREE.Texture
function skinHeadTex(key){
  if(skinFaceCache.has(key)) return skinFaceCache.get(key);
  const spec=SKIN_FACES[key];
  const img=spec&&spec.tex()?.image;
  if(!img||!img.width) return null;
  const S=96;
  const cv=document.createElement('canvas'); cv.width=cv.height=S;
  const ctx=cv.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  const w=img.width*spec.crop.w;
  ctx.drawImage(img,img.width*spec.crop.x,img.height*spec.crop.y,w,w,0,0,S,S);
  const tex=new THREE.CanvasTexture(cv);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=THREE.NearestFilter; tex.minFilter=THREE.LinearMipmapLinearFilter;
  skinFaceCache.set(key,tex);
  return tex;
}
// Käufliche Auftritte bei Manni (siehe SHOP/openMarket) — Index 0 ist der
// Standard-Look von jeher und bleibt unangetastet: er trägt keine eigenen
// torso/pants/skin/face-Werte, seine Torsofarbe kommt weiterhin aus
// PLAYER_COLORS weiter unten (unterscheidet Mitspieler voneinander). Erst ab
// Index 1 legt ein Skin diese Werte selbst fest und überschreibt damit sowohl
// PLAYER_COLORS als auch die feste SKIN/PANTS-Vorgabe (siehe makePlayerModel).
// face zeigt entweder auf einen FACES-Index (Zahl) oder auf SKIN_FACES oben
// (Schlüssel als Text) — fehlt es, bleibt es beim pid-abhängigen Standard.
const SKINS=[
  {nm:'Standard',            ic:'🙂'},
  {nm:'Dominik-Kostüm',      ic:'🍑', torso:'#e8935a', pants:'#6b4423', skin:'#f2c39a', face:0},
  {nm:'Benni-Kostüm',        ic:'👹', torso:'#2e2438', pants:'#1c1620', skin:'#8f7d99', face:'benni'},
  {nm:'Mannis Arbeitskittel',ic:'🦺', torso:'#4a7a9e', pants:'#33383f', skin:SKIN,      face:1},
];
const box=(w,h,d,color)=>{
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color}));
  m.castShadow=true;
  return m;
};
// Arme und Beine hängen in einer eigenen Gruppe an Schulter bzw. Hüfte, der
// Kasten selbst sitzt um seine halbe Länge tiefer darin — nur so dreht sich
// ein Bein beim Laufen um die Hüfte und nicht um seine eigene Mitte.
function limb(x,y,w,h,d,color){
  const pivot=new THREE.Group();
  pivot.position.set(x,y,0);
  const m=box(w,h,d,color);
  m.position.y=-h/2;
  pivot.add(m);
  return pivot;
}
function makePlayerModel(pid,skinIdx=0){
  const sk=SKINS[skinIdx]||SKINS[0];
  // sk.torso/pants/skin fehlen am Standard-Skin (Index 0) — dann bleibt es
  // bei PLAYER_COLORS/PANTS/SKIN wie eh und je (siehe SKINS oben).
  const color=sk.torso||PLAYER_COLORS[((pid||1)-1)%PLAYER_COLORS.length];
  const pants=sk.pants||PANTS;
  const skinCol=sk.skin||SKIN;
  const g=new THREE.Group();
  const legL=limb(-.15,.74,.19,.74,.22,pants), legR=limb(.15,.74,.19,.74,.22,pants);
  const armL=limb(-.36,1.28,.16,.58,.16,skinCol), armR=limb(.36,1.28,.16,.58,.16,skinCol);
  const torso=box(.54,.58,.28,color); torso.position.y=1.03;
  const head=box(.5,.5,.5,skinCol); head.position.y=1.57;
  const face=sk.face==='benni'?skinHeadTex('benni'):headTex(sk.face??((pid||1)-1));
  if(face){
    // Das Gesicht liegt als eigene Fläche hauchdünn vor dem Kopf statt als
    // Textur auf dessen Vorderseite: durchsichtige Ränder (die Bilder sind
    // freigestellt) würden sonst ein Loch in den Kopf schneiden.
    // Ein wenig Eigenleuchten, damit das Gesicht auch dann lesbar bleibt,
    // wenn die Sonne von hinten kommt — es ist das einzige Erkennungsmerkmal
    // der Figur, und ein schwarzer Fleck wäre eines weniger.
    const fp=new THREE.Mesh(new THREE.PlaneGeometry(.5,.5),
      new THREE.MeshLambertMaterial({map:face,transparent:true,alphaTest:.35,
                                     emissive:0x555555,emissiveMap:face}));
    fp.position.set(0,0,-.252); fp.rotation.y=Math.PI;
    head.add(fp);
  }
  g.add(legL,legR,armL,armR,torso,head);
  return Object.assign(g,{parts:{legL,legR,armL,armR,torso,head},gait:0,skin:skinIdx});
}
// Haltung: 'walk' schwingt Arme und Beine gegengleich, 'sit' klappt die Beine
// nach vorn (Boot), 'hang' hängt die Arme nach oben (Gleitschirm). Der Kopf
// nickt mit der Blickrichtung, damit man Mitspielern ansieht, wohin sie sehen.
function posePlayerModel(m,{gait=0,moving=0,pitch=0,mode='walk'}={}){
  const p=m.parts;
  const sw=Math.sin(gait)*Math.min(.9,moving);
  p.head.rotation.x=clamp(-pitch,-.9,.9);
  if(mode==='sit'){
    p.legL.rotation.x=p.legR.rotation.x=-1.4;
    p.armL.rotation.x=p.armR.rotation.x=-.55;
    p.armL.rotation.z=p.armR.rotation.z=0;
  }else if(mode==='hang'){
    p.legL.rotation.x=-.25; p.legR.rotation.x=.25;
    p.armL.rotation.x=p.armR.rotation.x=-2.5;
    p.armL.rotation.z=.25; p.armR.rotation.z=-.25;
  }else{
    p.legL.rotation.x=sw; p.legR.rotation.x=-sw;
    p.armL.rotation.x=-sw*.85; p.armR.rotation.x=sw*.85;
    p.armL.rotation.z=p.armR.rotation.z=0;
    if(mode==='ride'){                     // auf dem Brett: leicht in die Knie
      p.legL.rotation.x-=.25; p.legR.rotation.x-=.25;
    }
  }
}
function disposeModel(g){
  g.traverse(o=>{
    if(!o.isMesh) return;
    o.geometry.dispose();
    // Gesichtstexturen leben im faceCache weiter (nur je einmal gebaut) —
    // hier bewusst NICHT die map mit wegwerfen.
    o.material.dispose();
  });
}

// ------------------------------------------------------------------ Hand
// Der gehaltene Gegenstand unten rechts im Bild, wie beim Vorbild. Läuft in
// einer komplett eigenen THREE.Scene mit eigener Kamera, die in frame() NACH
// der Hauptszene gerendert wird (renderer.autoClear=false + clearDepth
// dazwischen, siehe dort) — dadurch hat die Hand gar keine Tiefen-Beziehung
// zur Welt und kann folglich auch nie in einer Wand stecken oder von
// Gelände verdeckt werden. Eigene Szene heißt auch: eigenes Licht, sonst
// bleiben die Lambert-Materialien schwarz.
const handScene=new THREE.Scene();
const handCam=new THREE.PerspectiveCamera(45,1,.05,4);
handScene.add(new THREE.AmbientLight(0xffffff,.9));
const handSun=new THREE.DirectionalLight(0xfff3d6,1.1);
handSun.position.set(1,1.4,1.2);
handScene.add(handSun);
// handRoot sitzt fix in der Bildecke (siehe resizeHand), handSwing schwingt
// und wippt darin — zwei getrennte Gruppen, damit Eckposition und Animation
// sich nicht gegenseitig überschreiben.
const handRoot=new THREE.Group(); handScene.add(handRoot);
const handSwing=new THREE.Group(); handRoot.add(handSwing);
let handRig=null;                          // aktuelles Modell (Unterarm + Gegenstand)
const HAND_PLANE=new THREE.PlaneGeometry(.42,.42);   // geteilte Geometrie für Plättchen-Items
const HAND_Z=-.85;                         // Abstand vor der Hand-Kamera
// Baut Unterarm + gehaltenen Gegenstand neu. Blöcke (ITEMS[id].block) werden
// als kleiner Würfel mit dropMat(id) gezeigt — genau das Material, mit dem
// auch am Boden liegende Blöcke gezeichnet werden (siehe dropMat weiter
// oben), macht also ohne neue Assets die richtige Blocktextur. Alles andere
// bekommt ein schräg gehaltenes Plättchen mit dem Item-Sprite, ebenfalls
// über dropMat. Nichts gewählt ⇒ nur die leere Faust.
function buildHandRig(id){
  const g=new THREE.Group();
  const arm=box(.26,.62,.26,SKIN);
  arm.position.y=-.31;                     // Gruppenursprung = Handgelenk oben
  g.add(arm);
  const it=id?ITEMS[id]:null;
  if(it?.block){
    const cube=new THREE.Mesh(BLOCKGEO,dropMat(id));
    cube.scale.setScalar(.32);
    cube.position.set(.04,.06,.22);          // vors Armvorderteil, sonst steckt der Würfel im Arm
    cube.rotation.set(.5,.6,.15);
    g.add(cube);
  }else if(it){
    const plate=new THREE.Mesh(HAND_PLANE,dropMat(id));
    plate.position.set(.03,.05,.2);          // dito für das Plättchen
    plate.rotation.set(-.25,.7,.2);
    g.add(plate);
  }
  return g;
}
// Der Arm ist bei jedem Aufbau eine frische, einzigartige Geometrie/Material
// (box() baut immer neu) — das Item-Mesh dagegen teilt sich BLOCKGEO/
// HAND_PLANE und dropMat(id) mit dem Rest des Spiels (Drops, Geschosse).
// Beim Wegwerfen daher NUR den Arm entsorgen, sonst reißt man Material unter
// am Boden liegenden Gegenständen weg.
function disposeHandRig(g){
  const arm=g.children[0];
  if(arm){ arm.geometry.dispose(); arm.material.dispose(); }
}
let handHeldId;                            // undefined ⇒ erster Aufruf baut garantiert
let handSwitchT=0;                         // Countdown fürs Wechsel-Dip (Anforderung 3)
const HAND_SWITCH_DUR=.22;
let handMineT=0;                           // Phase des Hack-Schwungs, läuft nur solange mining
// Reine Blickfeld-Geometrie statt fixer Pixel: bei jedem Seitenverhältnis
// (schmales Handyhochformat bis Ultrawide) sitzt die Hand im selben
// Bruchteil des sichtbaren Bereichs unten rechts (Anforderung 7).
function resizeHand(){
  handCam.aspect=innerWidth/innerHeight; handCam.updateProjectionMatrix();
  const halfH=Math.tan(handCam.fov*Math.PI/360)*Math.abs(HAND_Z);
  const halfW=halfH*handCam.aspect;
  handRoot.position.set(halfW*.62,-halfH*.66,HAND_Z);
}
resizeHand();
// Schwung, Wippen, Wechsel-Dip. Läuft aus update() heraus (nach
// updateSelfModel, siehe dort), damit player.spd für den Frame schon steht.
// Modell wird NUR bei geänderter heldId() neu gebaut, nicht jedes Bild —
// dasselbe Muster wie hudCache/potWinSig für "nur bei Änderung neu bauen".
function updateHand(dt){
  const id=heldId();
  if(id!==handHeldId){
    handHeldId=id;
    if(handRig){ handSwing.remove(handRig); disposeHandRig(handRig); }
    handRig=buildHandRig(id);
    handSwing.add(handRig);
    handSwitchT=HAND_SWITCH_DUR;
  }
  if(handSwitchT>0) handSwitchT=Math.max(0,handSwitchT-dt);
  if(mining) handMineT+=dt*9; else handMineT=0;
  const mineSwing=mining?Math.abs(Math.sin(handMineT))*.55:0;
  // atkCd zählt von .45 (Nahkampf) bzw. .35 (Fahrzeug aufheben) auf 0 herunter
  // (siehe attack()) — ein Sinusbogen über die Restzeit ergibt einen einzigen
  // Schwung: 0 beim Auslösen, Höhepunkt in der Mitte, wieder 0 beim Abklingen.
  const atkSwing=player.atkCd>0?Math.sin(Math.PI*clamp(player.atkCd/.45,0,1))*.8:0;
  const swing=Math.max(mineSwing,atkSwing);
  const bobY=Math.sin(player.bob*2)*((player.spd||0)>.4&&player.onGround?.03:.008);
  const dipY=handSwitchT>0?-Math.sin(Math.PI*(1-handSwitchT/HAND_SWITCH_DUR))*.16:0;
  handSwing.position.set(0,bobY+dipY,0);
  handSwing.rotation.set(-swing*.85,swing*.3,swing*.35);
}

// ------------------------------------------------------------------ Mitspieler (Phase 2)
// Andere verbundene Spieler bekommen die Klötzchen-Figur von oben und ein
// Namensschild; beides lerpt zur zuletzt empfangenen Position/Blickrichtung
// — keine Vorhersage, keine Extrapolation, nur Glätten des letzten bekannten
// Werts. Die eigene Bewegung bleibt komplett lokal maßgeblich (kein
// serverseitiges Zurückkorrigieren).
const PLAYER_COLORS=['#e0555f','#4fa8e0','#e0c04f','#7bcf6a'];
const remotePlayers=new Map();              // pid -> {group, target:{x,y,z,yaw}}
function ensureRemotePlayer(pid,skinIdx=0){
  let rp=remotePlayers.get(pid);
  if(rp) return rp;
  const color=PLAYER_COLORS[(pid-1)%4];
  const g=new THREE.Group();
  const body=makePlayerModel(pid,skinIdx);
  g.add(body);
  const label=makeLabel(['Spieler '+pid],color,.35);
  label.position.y=2.1; g.add(label);
  scene.add(g);
  rp={pid,group:g,body,label,target:{x:0,y:0,z:0,yaw:0},gait:0,moving:0,skin:skinIdx};
  remotePlayers.set(pid,rp);
  return rp;
}
// Modell neu bauen, wenn sich der Skin eines Mitspielers geändert hat — das
// Modell wird sonst nur einmal gebaut (siehe ensureRemotePlayer oben), Skin-
// Wechsel gehören anders als Position/Blickrichtung nicht zum Lerp-Ziel.
// disposeModel() vor dem Austausch, sonst bleiben Geometrie/Material des
// alten Körpers hängen (three.js räumt das nicht von selbst weg).
function setRemoteSkin(rp,skinIdx){
  if(rp.skin===skinIdx) return;
  rp.skin=skinIdx;
  rp.group.remove(rp.body);
  disposeModel(rp.body);
  rp.body=makePlayerModel(rp.pid,skinIdx);
  rp.group.add(rp.body);
}
function removeRemotePlayer(pid){
  const rp=remotePlayers.get(pid);
  if(!rp) return;
  scene.remove(rp.group);
  disposeModel(rp.body);
  rp.label.material.map?.dispose(); rp.label.material.dispose();
  remotePlayers.delete(pid);
}
function updateRemotePlayers(dt){
  const f=Math.min(1,dt*10);
  for(const [pid,rp] of remotePlayers){
    const g=rp.group, t=rp.target;
    const px=g.position.x, pz=g.position.z;
    g.position.set(lerp(g.position.x,t.x,f),lerp(g.position.y,t.y,f),lerp(g.position.z,t.z,f));
    let dy=t.yaw-g.rotation.y;
    dy=((dy+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;   // kürzester Weg, kein Sprung über die ±π-Naht
    g.rotation.y+=dy*f;
    // Die Schrittgeschwindigkeit kommt aus der tatsächlich zurückgelegten
    // Strecke — 'pos' trägt kein Bewegungsfeld, und ein zusätzliches wäre
    // Ballast für etwas, das hier ohnehin abzulesen ist.
    const sp=Math.hypot(g.position.x-px,g.position.z-pz)/Math.max(dt,1e-4);
    rp.moving=lerp(rp.moving,Math.min(1,sp/3.4),Math.min(1,dt*8));
    rp.gait+=dt*sp*1.9;
    const v=vehicleOfRider(pid);
    posePlayerModel(rp.body,{gait:rp.gait,moving:v?0:rp.moving,mode:v?VEHICLES[v.kind].pose:'walk'});
    // Wer fährt, klebt am Fahrzeug: dessen bereits geglättete Anzeigelage
    // zählt, nicht die eigenen 'pos'-Nachrichten. Sonst rutschten Figur und
    // Boot bei jedem Ruckler gegeneinander, weil beide für sich glätten.
    if(v){
      g.position.copy(v.group.position);
      g.position.y+=VEHICLES[v.kind].seat;
      g.rotation.y=v.group.rotation.y;
    }
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
on('leave',msg=>{
  toast('👋 Ein Mitspieler hat verlassen.','',1800);
  removeRemotePlayer(msg.pid);
  // Sein Fahrzeug wird wieder frei. Der Server räumt den Platz ebenfalls
  // (siehe _onClose dort) — hier zusätzlich, damit das Boot nicht bis zur
  // nächsten Nachricht "besetzt" aussieht.
  const v=vehicleOfRider(msg.pid);
  if(v) v.rider=null;
});
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
  // Schilder: wie chests/pots ein einfaches .set() pro Eintrag — von selbst
  // idempotent bei einem Reconnect. ensureSignLabel legt den Sprite an (oder
  // erneuert ihn, falls er von einem vorigen Verbindungsstand noch hängt).
  for(const [key,s] of msg.signs||[]){
    signs.set(key,{text:typeof s.text==='string'?s.text:''});
    const [x,y,z]=key.split(',').map(Number);
    ensureSignLabel(x,y,z);
  }
  // Fahrzeuge kommen als vollständiger Bestand — beim Wiederverbinden also
  // erst den eigenen (womöglich veralteten) Stand räumen, statt Karteileichen
  // von vor dem Abriss stehenzulassen. Ein Fahrer war man dabei nur bis zum
  // Verbindungsabbruch: der Server setzt rider beim Trennen zurück (siehe
  // dort), hier entsprechend absteigen.
  if(msg.vehicles){
    riding=null;
    for(const id of [...vehicles.keys()]) dropVehicle(id);
    for(const v of msg.vehicles){
      if(!VEHICLES[v.kind]) continue;
      addVehicle({id:v.id,kind:v.kind,x:v.x,y:v.y,z:v.z,yaw:v.yaw||0,rider:v.rider??null});
    }
    const mine=vehicleOfRider(getPid());
    if(mine){ riding=mine; onMounted(); }   // Wiederverbinden mitten in der Fahrt
  }
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
    const rp=ensureRemotePlayer(p.pid,p.skin||0);
    setRemoteSkin(rp,p.skin||0);           // ein Nachzügler sieht den Skin sofort, ohne Lerp
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
  const rp=ensureRemotePlayer(msg.pid,msg.skin||0);
  setRemoteSkin(rp,msg.skin||0);
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
    const m=ensureMob(e.id,e.x,e.y,e.z,e.kind);
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
//
// Beute (Phase B1/Task 4): spawnDrop() broadcastet selbst (Phase 6) — würde
// JEDER Client, der mob-dead empfängt, seinerseits spawnDrop() aufrufen, läge
// derselbe Loot bis zu viermal auf dem Boden. Der Server kennt als einziger
// den Schützen (killerPid, der letzte mob-hit vor dem Tod) und hat die Beute
// schon serverseitig gewürfelt (msg.loot) — nur dieser eine Client spawnt sie
// tatsächlich, alle anderen sehen sie über den ganz normalen drop-spawn-
// Broadcast wieder. Sauberer als etwa "der am nächsten stehende Client
// spawnt sie": das wäre nicht deterministisch und ließe sich nicht clientseitig
// nachprüfen.
on('mob-dead',msg=>{
  SND.mobDie(); state.killed++;
  if(msg.killerPid===getPid()&&msg.loot)
    spawnDrop(msg.loot.id,msg.loot.n,msg.x,msg.y+.5,msg.z,rnd(-1,1),1.8,rnd(-1,1));
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
// Schilder: optimistischer Broadcast wie Block/Fackel (siehe Design-
// Kommentar bei signs oben) — kein Grant/Claim-Umweg nötig, einfach
// übernehmen und den Sprite (neu) aufbauen.
on('sign-place',msg=>{
  const key=K(msg.x,msg.y,msg.z);
  if(!signs.has(key)) signs.set(key,{text:''});
  ensureSignLabel(msg.x,msg.y,msg.z);
});
on('sign-write',msg=>{
  const key=K(msg.x,msg.y,msg.z);
  let s=signs.get(key);
  if(!s){ s={text:''}; signs.set(key,s); }
  s.text=typeof msg.text==='string'?msg.text.slice(0,SIGN_MAX):'';
  ensureSignLabel(msg.x,msg.y,msg.z);
});
on('sign-remove',msg=>{
  signs.delete(K(msg.x,msg.y,msg.z));
  removeSignLabel(msg.x,msg.y,msg.z);
});
// Fahrzeuge: Abstellen und Fahren laufen optimistisch (wer sein Boot bewegt,
// bewegt nur sein eigenes — nichts Knappes, kein Wettlauf). Einsteigen und
// Aufheben dagegen entscheidet der Server, weil beides nur EINEM zustehen
// kann: zwei Fahrer führen ein Boot an zwei Orte, zwei Aufheber machten aus
// einem Boot zwei Gegenstände.
on('vehicle-place',msg=>{
  if(vehicles.has(msg.id)) return;
  if(!VEHICLES[msg.kind]) return;
  addVehicle({id:msg.id,kind:msg.kind,x:msg.x,y:msg.y,z:msg.z,yaw:msg.yaw||0,rider:msg.rider??null});
});
on('vehicle-move',msg=>{
  const v=vehicles.get(msg.id);
  if(!v||v===riding) return;               // die eigene Fahrt gibt hier den Ton an
  v.x=msg.x; v.y=msg.y; v.z=msg.z; v.yaw=msg.yaw||0;
});
on('vehicle-rider',msg=>{
  const v=vehicles.get(msg.id);
  if(!v) return;
  v.rider=msg.rider??null;
  const me=getPid();
  if(v.rider===me&&riding!==v){ riding=v; onMounted(); }
  // Ein anderer hat den Platz bekommen (oder der Server hat ihn geräumt):
  // dann steigt man hier eben wieder aus, statt unsichtbar mitzufahren.
  else if(v.rider!==me&&riding===v){ riding=null; toast('🚗 Jemand war schneller.','warn',1800); }
});
on('vehicle-remove',msg=>{
  const v=vehicles.get(msg.id);
  if(!v) return;
  dropVehicle(msg.id);
  // Nur der, dem der Server das Aufheben zugesprochen hat, bekommt es auch.
  if(msg.by!=null&&msg.by===getPid()){
    giveOrDrop(VEHICLES[v.kind].item,1);
    SND.pop(); updateHUD();
  }
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
// clickChestCell oben). items ist der vollständige, schon aktualisierte
// 24-Fächer-Truheninhalt — einfach übernehmen (die Truhe lokal anlegen, falls
// sie hier noch gar nicht existiert — z.B. weil DIESER Client sie gerade erst
// gesetzt hat, s. useRight). grant sagt, ob (und was) DIESER Client für seine
// eigene Anfrage bekommen hat: bei 'take' landet es am carry-Zeiger (genau
// wie ein Griff ins Handwerksraster), bei 'put' schrumpft der carry-Stapel um
// genau das, was wirklich ankam — der Rest (falls die Anfrage durch ein
// Wettrennen nur teilweise durchkam) bleibt am Zeiger hängen, statt verloren
// zu gehen.
on('chest-sync',msg=>{
  const key=K(msg.x,msg.y,msg.z);
  let c=chests.get(key);
  if(!c){ c={items:Array(24).fill(null),opened:true}; chests.set(key,c); }
  c.items=msg.items;
  if(msg.grant&&msg.grant.pid===getPid()){
    const g=msg.grant;
    if(g.kind==='take'&&g.n>0){
      if(!carry) carry={id:g.id,n:g.n};
      else if(carry.id===g.id) carry.n+=g.n;   // defensiv: sollte bei leerem Zeiger starten
      else giveOrDrop(g.id,g.n);                // Zeiger schon anderweitig belegt — nicht überschreiben
    }else if(g.kind==='put'&&carry&&carry.id===g.id){
      carry.n-=g.n; if(carry.n<=0) carry=null;
      // Tausch: das Fach war mit etwas anderem belegt und gibt dessen Stapel
      // zurück (siehe clickChestCell/chest-put mit swap). Der Server tauscht
      // nur ganze Stapel, der Zeiger ist also gerade frei geworden — sollte
      // doch noch ein Rest hängen (fremde Antwort, alte Server-Version),
      // wandert das Zurückgegebene in den Rucksack statt ihn zu überschreiben.
      if(g.back&&g.back.id){
        if(!carry) carry={id:g.back.id,n:g.back.n};
        else giveOrDrop(g.back.id,g.back.n);
      }
    }
    drawCarry();
  }
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
  // Für "Nochmal" (s. cookPot): JEDER Client, der die Nachricht bekommt,
  // kannte den Inhalt bereits synchron über pot-add — nicht nur der Gewinner
  // unten braucht ihn sich zu merken, sonst böte das Kochfenster bei allen
  // anderen Mitspielern nie "Nochmal" an.
  p.last=itemsSnapshot.map(it=>({...it}));
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
// Ein von einem anderen Client abgefeuertes Geschoss — rein kosmetisch nach-
// gebaut (spawnShotRemote setzt mine:false, s. dort), Schaden läuft für
// diesen Client ausschließlich über 'mob-hit', nie über diese Nachricht.
// `grav` reicht der Server unverändert durch (s. _onMessage dort) — ohne ihn
// bekäme jeder Mitspieler für jedes Geschoss dieselbe Flugbahn zu sehen.
on('shot',msg=>{
  spawnShotRemote(msg.id,msg.x,msg.y,msg.z,msg.vx,msg.vy,msg.vz,msg.grav);
});
// Der Server bestimmt hier EINMAL den Gewinner des Claim-Wettlaufs um einen
// Boden-Drop (s. updateDrops: sell/pickup melden sich dort per 'drop-claim'
// an, updateMobsOnline unten für 'chicken') — exakt dasselbe Muster wie
// Truhen-/Topf-Claim. Nur der Gewinner wendet den zu seiner eigenen Anfrage
// passenden Effekt an (welchen, steht lokal in d._claimReason); alle anderen
// Clients räumen den Drop trotzdem weg, sobald irgendwer gewonnen hat — er
// ist für alle weg. 'pot' gibt es hier nicht mehr: Zutaten wandern nur noch
// über das Kochfenster (openPot/clickPotCell) in den Topf, nie mehr durch
// bloßes Hinfallen — s. Kommentar bei updateDrops.
on('drop-claimed',msg=>{
  const d=drops.find(o=>o.dropId===msg.dropId);
  if(!d) return;                      // längst lokal zusammengeführt/entfernt — sicher zu ignorieren
  if(msg.pid===getPid()){
    if(d._claimReason==='sell') sellTo(d.id,d.n);
    // 'chicken': ein Huhn hat den Dominik gefressen — nichts weiter zu tun,
    // der Drop verschwindet unten wie bei jedem anderen Claim-Gewinn auch.
    else if(d._claimReason==='chicken'){}
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
      const w=SHOP.find(s=>s.id===msg.buyResult.id);
      if(w&&w.skin){
        // Kein Gegenstand für den Rucksack — giveOrDrop bräuchte einen
        // ITEMS-Eintrag, den es für einen Skin nicht gibt (siehe unlockSkin).
        unlockSkin(w.skinIdx);
        say(marketChar,SKINS[w.skinIdx].nm+', bitte sehr!',3200);
        toast('🛒 '+SKINS[w.skinIdx].ic+' '+SKINS[w.skinIdx].nm+' gekauft.','good',2600);
      }else{
        giveOrDrop(msg.buyResult.id,1);
        SND.craft();
        say(marketChar,ITEMS[msg.buyResult.id].nm+', bitte sehr!',3200);
        toast('🛒 '+ITEMS[msg.buyResult.id].ic+' '+ITEMS[msg.buyResult.id].nm+' gekauft.','good',2600);
      }
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
// Monstertruck: hält ihn ein Block auf, bricht der lieber weg, statt den
// Wagen zu bremsen — geprüft wird genau die Zelle, die collides() gerade als
// Blockade gemeldet hat (Boden- UND Kopfhöhe, siehe dort), also exakt die
// zwei Felder, die sonst auch einen zu Fuß gehenden Spieler aufhielten.
// smashCd ist eine kurze, gemeinsame Abklingzeit (kein Fahrzeug fährt zwei
// Richtungen gleichzeitig), damit nicht sechzigmal pro Bild derselbe Block
// "gebrochen" wird, während der Truck noch dagegensteht.
// Über breakBlock() statt setBlock(): nur so laufen Drop, Sound und der
// Netzwerk-Sync (send({t:'block',...}), siehe setBlock) exakt wie beim
// Abbau von Hand — der Truck ist ja im Grunde eine automatische Spitzhacke,
// die beim Fahren zuschlägt, kein Sonderfall mit eigenem Draht zum Server.
let smashCd=0;
function truckSmash(px,pz){
  if(smashCd>0) return false;
  const y0=Math.floor(player.y+EPS), y1=Math.floor(player.y+PH-EPS);
  let smashed=false;
  // Genau dasselbe Zellenraster abklappern wie collides() (siehe dort) und
  // nicht bloß die eine gerundete Zelle: der Truck ist so breit wie der
  // Spieler, und wer schräg gegen eine Wand fährt, wird von einer Nachbar-
  // zelle aufgehalten. Nur die Mittelzelle aufzubrechen ließe ihn genau dort
  // grundlos abprallen, wo man am ehesten gegen etwas fährt.
  for(let bx=Math.round(px-PR);bx<=Math.round(px+PR);bx++)
    for(let bz=Math.round(pz-PR);bz<=Math.round(pz+PR);bz++){
      if(Math.abs(px-bx)>=.5+PR||Math.abs(pz-bz)>=.5+PR) continue;
      for(let y=y0;y<=y1;y++){
        const t=blockAt(bx,y,bz);
        // Grundgestein & Co. bleiben stehen (b.noBreak) — dann bremst der
        // Truck wie jedes andere Fahrzeug auch ganz normal an ihnen ab.
        // Durchlässiges (b.pass, die gekreuzten Flächen) hält ihn ohnehin
        // nicht auf, das braucht er auch nicht niederzuwalzen.
        if(!t||BLOCKS[t].pass||BLOCKS[t].noBreak) continue;
        breakBlock(bx,y,bz,t);
        smashed=true;
      }
    }
  if(smashed){ smashCd=.12; SND.boom(); }
  return smashed;
}
const keys={};

// ------------------------------------------------------------------ Sicht
// 0 = aus den eigenen Augen, 1 = über die Schulter, 2 = von vorn (wie beim
// Vorbild dieselbe Taste im Kreis). Die dritte Person braucht einen eigenen
// Körper — den baut updateSelfModel beim ersten Umschalten.
let view=0;
const VIEW_DIST=4.2;
const VIEW_NAMES=['👁️ Ich-Sicht','🎥 Schulterblick','🙂 Frontsicht'];
// Wie weit die Kamera in eine Richtung kann, bevor sie in einem Block steckt.
// In kleinen Schritten abtasten genügt: ein halber Block Auflösung reicht bei
// vier Blöcken Abstand, und ein Strahl gegen alle Würfel wäre hier deutlich
// teurer als 28 Nachschlagversuche.
function camFree(ox,oy,oz,dx,dy,dz,want){
  const step=.15;
  for(let d=step;d<=want;d+=step){
    const x=ox+dx*d, y=oy+dy*d, z=oz+dz*d;
    if(fillsAt(Math.round(x),Math.floor(y),Math.round(z))) return Math.max(.4,d-step*2);
  }
  return want;
}
let selfModel=null, selfPid=null, selfSkin=null, selfGait=0, selfMove=0;
function updateSelfModel(dt,speed){
  const pid=getPid()??1;
  // Das eigene Gesicht hängt an der Spielernummer, Torso/Hose/Haut am
  // gewählten Skin — die kommt erst mit der Anmeldung bzw. ändert sich erst
  // beim Kauf/Anziehen, also den Körper neu bauen, wenn eins von beiden nicht
  // mehr zum stehenden Modell passt.
  if(selfModel&&(selfPid!==pid||selfSkin!==player.skin)){ scene.remove(selfModel); disposeModel(selfModel); selfModel=null; }
  if(!selfModel){
    if(!view) return;                      // in der Ich-Sicht gar nicht erst bauen
    selfModel=makePlayerModel(pid,player.skin); selfPid=pid; selfSkin=player.skin; scene.add(selfModel);
  }
  selfModel.visible=!!view;
  if(!view) return;
  selfGait+=dt*speed*1.9;
  selfMove=lerp(selfMove,Math.min(1,speed/3.4),Math.min(1,dt*8));
  const cfg=riding?VEHICLES[riding.kind]:null;
  selfModel.position.set(player.x,cfg?riding.y+cfg.seat:player.viewY,player.z);
  selfModel.rotation.y=player.yaw;
  posePlayerModel(selfModel,{gait:selfGait,moving:cfg?0:selfMove,
                             pitch:player.pitch,mode:cfg?cfg.pose:'walk'});
}
function toggleView(){
  view=(view+1)%3;
  toast(VIEW_NAMES[view],'',1200);
  SND.tap();
}

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
  // Was vom Markt kommt, wirkt nicht mehr in der Hand, sondern unter einem:
  // Brett an Land, Boot im Wasser, Schirm in der Luft — aber nur, wenn man
  // wirklich draufsitzt (siehe enterVehicle). Wer fährt, hat die Hände frei.
  const rv=riding?VEHICLES[riding.kind]:null;
  const onBoat=!!rv?.float&&wet;
  const gliding=!!rv?.glide&&!wet&&!player.onGround;
  player.gliding=gliding;
  // touchSprint kommt vom voll ausgeschlagenen Steuerkreuz und steht bewusst
  // neben den Shift-Tasten statt in ihnen: unter Wasser ist Shift das
  // Abtauchen, und wer am Handy nur zügig laufen will, soll dabei nicht
  // absacken (siehe stickSet im Abschnitt "Finger").
  const sprint=(keys.ShiftLeft||keys.ShiftRight||touchSprint)?1.42:1;
  const sp=rv?(wet?rv.water:rv.land)         // das Fahrzeug gibt das Tempo vor
          :wet?3.0                           // Wasser bremst
          :4.8*sprint;
  const sin=Math.sin(player.yaw), cos=Math.cos(player.yaw);
  const dx=(mx*cos+mz*sin)*sp*dt;
  const dz=(-mx*sin+mz*cos)*sp*dt;
  // Der Truck bricht sich seinen Weg frei — aber nur an Land: rv.water ist
  // für ihn absichtlich lahm (er schwimmt nicht), damit reißt im Wasser
  // nichts durch. sp ist hier schon die tatsächlich gefahrene Geschwindigkeit
  // (Fahrzeuge kennen kein Anfahren/Bremsen); steht der Truck (keine Taste),
  // ist dx=dz=0, also entsteht unten gar keine neue Kollision — "im Stand
  // zerlegt er nichts" ergibt sich damit von selbst.
  const truckDriving=riding&&riding.kind==='truck'&&sp>5;

  // Waagerecht, Achse für Achse — mit automatischer Stufe von einem Block.
  // Die Stufe geht auch im Wasser: sonst klebt man an der Böschung fest.
  const canStep=player.onGround||wet;
  let nx=clamp(player.x+dx,BOUND.x0-.4,BOUND.x1+.4);
  if(collides(nx,player.y,player.z)){
    // truckSmash() baut über breakBlock() ab (Drop/Sound/Netzwerk-Sync wie
    // von Hand) — klappt es, ist die Bahn meist schon in diesem Bild wieder
    // frei, statt erst einen Ruckler lang zu stehen.
    if(truckDriving&&truckSmash(nx,player.z)&&!collides(nx,player.y,player.z)){ /* durchgebrochen */ }
    else if(canStep&&!collides(nx,player.y+1,player.z)&&!collides(player.x,player.y+1,player.z))
      { player.y+=1; player.x=nx; }
    else nx=player.x;
  }
  if(nx!==player.x) player.x=nx;
  let nz=clamp(player.z+dz,BOUND.z0-.4,BOUND.z1+.4);
  if(collides(player.x,player.y,nz)){
    if(truckDriving&&truckSmash(player.x,nz)&&!collides(player.x,player.y,nz)){ /* durchgebrochen */ }
    else if(canStep&&!collides(player.x,player.y+1,nz)&&!collides(player.x,player.y+1,player.z))
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
  // In der dritten Person wackelt die Kamera nicht mit jedem Schritt — was
  // aus den eigenen Augen lebendig wirkt, sieht von außen nur unruhig aus.
  const eyeY=player.viewY+EYE+(view?0:bobY);
  camera.position.set(player.x,eyeY,player.z);
  camera.rotation.set(0,0,0);
  camera.rotateY(view===2?player.yaw+Math.PI:player.yaw);
  camera.rotateX(view===2?-player.pitch:player.pitch);
  if(view){
    // Nach hinten (bzw. bei der Frontsicht nach vorn) herausfahren, aber nur
    // so weit, wie freie Sicht ist — sonst steckt die Kamera in der Wand und
    // man sieht das Innere der Welt.
    camera.getWorldDirection(_rd);
    const d=camFree(player.x,eyeY,player.z,-_rd.x,-_rd.y,-_rd.z,VIEW_DIST);
    camera.position.set(player.x-_rd.x*d,eyeY-_rd.y*d,player.z-_rd.z*d);
  }
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  // Der eigene Körper wird NICHT hier gesetzt, sondern erst nach
  // updateVehicles (siehe update): beim Fahren hängt er am Fahrzeug, und das
  // übernimmt die frische Position erst dort — sonst liefe die Figur dem
  // Fahrzeug ein Bild hinterher.
  player.spd=speed;
  if(player.atkCd>0) player.atkCd-=dt;
  if(player.invT>0) player.invT-=dt;
  if(smashCd>0) smashCd-=dt;              // Abklingzeit des Monstertrucks, siehe truckSmash
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
  // 1 Nacht in 7 (bloodMoon() aus shared/world.js) — reine Funktion der
  // Tageszahl, damit Client und Server ohne ein Wort miteinander dieselbe
  // Nacht meinen.
  const blood=bloodMoon(state.day);
  if(state.night&&!wasNight){
    if(blood){ toast('🩸 Blutmond über '+state.day+'. Heute schwebt etwas.','bad',3800); SND.bloodMoon(); }
    else{ toast('🌙 Nacht '+state.day,'bad',2600); SND.night(); }
  }
  if(!state.night&&wasNight){ toast('🌅 Morgen.','good',2200); SND.dawn(); }
  if(state.night){
    mobTimer-=dt;
    if(mobTimer<=0){
      // Blutmond: gut dreimal so oft, und doppelt so viele dürfen gleichzeitig
      // unterwegs sein — siehe mobCap()/MOB_SPAWN_MIN/MAX aus shared/world.js.
      mobTimer=rnd(MOB_SPAWN_MIN,MOB_SPAWN_MAX)/(blood?3:1);
      const cap=mobCap(state.day)*(blood?2:1);
      // Online, spawning is entirely the server's job (see party/server.js
      // _startMobTimer) — this local trigger would otherwise fight it (and
      // every connected client would spawn its OWN extra Bennis on top of
      // the server's).
      // Hühner zählen NICHT gegen diesen Deckel (siehe CHICKEN_CAP-Kommentar
      // in shared/world.js) — sonst schrumpfte die Nachtbedrohung mit jedem
      // nachgewachsenen Huhn, obwohl das mit ihr nichts zu tun hat.
      if(!isConnected()&&mobs.filter(m=>!MOBS[m.kind]?.peaceful).length<cap) spawnMob();
    }
  } else {
    birdTimer-=dt;
    if(birdTimer<=0){
      playSample('bird'+Math.ceil(Math.random()*11),.35);
      birdTimer=rnd(20,50);
    }
  }
  // Hühner leben tagsüber wie nachts weiter und laufen über einen eigenen,
  // von der Nacht unabhängigen Populationspfad nach (siehe maintainChickens
  // oben) — online übernimmt das derselbe Mechanismus serverseitig
  // (_spawnChicken in party/src/game-server.js).
  if(!isConnected()) maintainChickens(dt);
}
const C={dayTop:new THREE.Color(0x3f86c8),evTop:new THREE.Color(0xd97b3a),nTop:new THREE.Color(0x0b1030),
  dayBot:new THREE.Color(0xbfe0ef),evBot:new THREE.Color(0xf0b070),nBot:new THREE.Color(0x141c38),
  sunDay:new THREE.Color(0xfff3d6),sunEv:new THREE.Color(0xffb070),moon:new THREE.Color(0x9fb4ff),
  water:new THREE.Color(0x1d5c8f),
  // Blutmond: der Nachthimmel kippt zusätzlich Richtung Blut statt Blau.
  bmTop:new THREE.Color(0x430109),bmBot:new THREE.Color(0x2a060f),
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
  // Blutmond: zusätzlicher Zug Richtung Rot, mit demselben night-Faktor wie
  // oben eingeblendet — sonst setzte die Farbe beim Nachtbeginn hart ein
  // statt sich einzuschleichen.
  if(bloodMoon(state.day)){ top.lerp(C.bmTop,night); bot.lerp(C.bmBot,night); }
  skyMat.uniforms.top.value.copy(top);
  skyMat.uniforms.bot.value.copy(bot);
  // Unter Wasser wird die Sicht kurz und blau, und ein Schleier liegt vor dem
  // Bild — sonst merkt man beim Schwimmen kaum, dass man untergetaucht ist.
  const sub=state.underwater;
  scene.fog.color.copy(sub?C.water:bot);
  scene.fog.near=sub?.4:46;
  scene.fog.far=sub?lerp(26,9,night):FOG_FAR;
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
  // Höchstens zwei neue Chunks je Bild: das Vernetzen eines Chunks dauert
  // ein paar Millisekunden, alle auf einmal wären ein sichtbarer Ruckler,
  // sobald man eine Gegend zum ersten Mal betritt. Zwei je Bild reichen
  // bequem, weil der Sichtrand weit vor dem Spieler liegt.
  let budget=3;
  for(let i=0;i<NCH;i++) for(let j=0;j<NCH;j++){
    const k=i+','+j;
    let c=chunks.get(k);
    const [ccx,ccz]=c?[c.cx,c.cz]:chunkCenter(i,j);
    const vis=(ccx-player.x)**2+(ccz-player.z)**2<r;
    if(!c){
      if(!vis||budget<=0) continue;
      buildChunk(i,j); budget--;
      c=chunks.get(k);
      if(!c) continue;
    }
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
canvas.addEventListener('pointerdown',e=>{
  ac();
  if(modalOpen()) return;
  // Der Finger geht seinen eigenen Weg (siehe Abschnitt "Finger" unten): kein
  // Pointer-Lock, sondern Ziehen zum Umsehen und eine Geste, die erst beim
  // Loslassen entscheidet, ob sie Tippen oder langer Druck war.
  if(e.pointerType==='touch'){ touchLookStart(e); return; }
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
// pointermove statt mousemove: dasselbe Ereignis deckt Maus UND Finger ab, und
// damit hängt der aufgenommene Stapel (carry/moveCarry) im Rucksack auch am
// Daumen, ohne dass es dafür einen zweiten Weg bräuchte. Ein PointerEvent ist
// ein MouseEvent, movementX/Y unter Pointer-Lock funktionieren unverändert.
document.addEventListener('pointermove',e=>{
  if(document.pointerLockElement===canvas){
    const dx=e.movementX||0, dy=e.movementY||0;
    if(lockFresh){ lockFresh=false; return; }
    const s=lookSpike();
    if(Math.abs(dx)>s||Math.abs(dy)>s){ state.spikes++; return; }
    player.yaw-=dx*.0022;
    player.pitch=clamp(player.pitch-dy*.0022,-1.45,1.45);
    return;
  }
  // Der Finger, der gerade die Landschaft dreht, ist kein Mauszeiger über
  // einem Fenster — sonst rechnete jede Drehung sinnlos elementFromPoint mit.
  if(touchLookId!==null&&e.pointerId===touchLookId) return;
  mouseX=e.clientX; mouseY=e.clientY;
  if(carry) moveCarry();
  updateItemTip();
});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement!==canvas) mining=false;
  else lockFresh=true;
});

// ------------------------------------------------------------------ Finger
// Am Handy gibt es keinen Pointer-Lock (auf manchen Geräten gar nicht, und wo
// es ihn gibt, hilft er nichts: ein Finger hat keine Bewegung, die man
// einfangen könnte). Also die Steuerung ein zweites Mal, für den Daumen:
//
//   linker Daumen   Steuerkreuz unten links — läuft, rennt bei vollem Ausschlag
//   rechter Daumen  irgendwo sonst aufs Bild:
//                     ziehen        umsehen
//                     kurz tippen   setzen/benutzen (die rechte Maustaste)
//                     lang drücken  schlagen und abbauen (die linke)
//
// Gezielt wird wie am Schreibtisch mit dem Fadenkreuz in der Bildmitte, nicht
// mit der Fingerspitze: updateTarget() schießt seinen Strahl ohnehin aus der
// Kameramitte, und derselbe Zielblock unter demselben Kreuz heißt, dass sich
// Reichweite, Blockname und Bruchbild kein zweites Mal erklären müssen.
//
// Die drei Gesten teilen sich einen Anfang, darum entscheidet nicht das
// Herunterdrücken, sondern die Zeit: wer weiter als TAP_MOVE zieht, sieht sich
// um; wer HOLD_MS lang liegen bleibt, fängt an abzubauen; wer vorher wieder
// loslässt, hat getippt.
const TAP_MOVE=14;         // Pixel, darüber ist es ein Umsehen und kein Tippen
const HOLD_MS=250;         // so lange liegenbleiben heißt: abbauen
const LOOK_SENS=.0042;     // Bogenmaß je Pixel — ein Wisch quer dreht gut halb herum
let touchLookId=null, tlX=0, tlY=0, tlMoved=0, tlHold=0, tlMining=false;
function touchLookEnd(){
  clearTimeout(tlHold);
  if(tlMining){ mining=false; mineT=0; }
  tlMining=false; touchLookId=null;
}
function touchLookStart(e){
  if(touchLookId!==null) return;          // ein zweiter Finger dreht nicht mit
  e.preventDefault();
  touchLookId=e.pointerId; tlX=e.clientX; tlY=e.clientY; tlMoved=0; tlMining=false;
  // Das Einfangen ist Bequemlichkeit, keine Bedingung: es hält die weiteren
  // Ereignisse auch dann beim Bild, wenn der Finger über die Inventarleiste
  // wandert. Manche Browser werfen dabei (ein Finger, den sie schon losgelassen
  // haben, lässt sich nicht mehr einfangen) — das darf die Geste nicht
  // mitreißen, gedreht wird notfalls auch ohne.
  try{ canvas.setPointerCapture?.(e.pointerId); }catch(err){}
  // Liegenbleiben heißt abbauen — und zwar über genau denselben Weg wie die
  // linke Maustaste: erst zuschlagen (attack() trifft Benni oder Fahrzeug und
  // meldet das), und nur wenn da nichts war, in den Block beißen.
  tlHold=setTimeout(()=>{
    if(touchLookId===null||tlMoved>TAP_MOVE) return;
    tlMining=true;
    if(!attack()) mining=true;
  },HOLD_MS);
}
canvas.addEventListener('pointermove',e=>{
  if(e.pointerId!==touchLookId) return;
  e.preventDefault();
  const dx=e.clientX-tlX, dy=e.clientY-tlY;
  tlX=e.clientX; tlY=e.clientY;
  tlMoved+=Math.hypot(dx,dy);
  // Beim Abbauen darf man weiter nachzielen; nur der noch unentschiedene
  // Druck verliert durch das Ziehen seine Chance, ein Abbauen zu werden.
  if(tlMoved>TAP_MOVE&&!tlMining) clearTimeout(tlHold);
  player.yaw-=dx*LOOK_SENS;
  player.pitch=clamp(player.pitch-dy*LOOK_SENS,-1.45,1.45);
});
canvas.addEventListener('pointerup',e=>{
  if(e.pointerId!==touchLookId) return;
  e.preventDefault();
  // Kurz und still: das war ein Tippen — setzen, benutzen, ansprechen, essen.
  if(!tlMining&&tlMoved<=TAP_MOVE) useRight();
  touchLookEnd();
});
canvas.addEventListener('pointercancel',e=>{ if(e.pointerId===touchLookId) touchLookEnd(); });

// ---- Steuerkreuz. Es schreibt in dasselbe keys{}, das auch die Tastatur
// füllt (siehe updatePlayer) — die Bewegungsrechnung erfährt damit nie, ob
// gerade ein Daumen oder eine Taste unterwegs ist.
// Rennen hängt NICHT an ShiftLeft, obwohl das die Renntaste ist: unter Wasser
// ist dieselbe Taste das Abtauchen, und ein voll ausgeschlagenes Steuerkreuz
// würde einen dann ungewollt in die Tiefe ziehen. Darum ein eigenes Flag,
// das updatePlayer neben den Tasten mitliest.
let touchSprint=false;
const stickEl=el('stick'), knobEl=stickEl?.querySelector('i');
let stickId=null, stickCx=0, stickCy=0, stickR=1;
function stickSet(nx,ny){
  keys.KeyW=ny<-.32; keys.KeyS=ny>.32;
  keys.KeyA=nx<-.32; keys.KeyD=nx>.32;
  touchSprint=Math.hypot(nx,ny)>.86;
  if(knobEl) knobEl.style.transform=`translate(calc(-50% + ${nx*38}%),calc(-50% + ${ny*38}%))`;
}
function stickReset(){
  stickId=null;
  keys.KeyW=keys.KeyS=keys.KeyA=keys.KeyD=false;
  touchSprint=false;
  if(knobEl) knobEl.style.transform='translate(-50%,-50%)';
}
stickEl?.addEventListener('pointerdown',e=>{
  e.preventDefault(); e.stopPropagation(); ac();
  stickId=e.pointerId;
  const r=stickEl.getBoundingClientRect();
  stickCx=r.left+r.width/2; stickCy=r.top+r.height/2; stickR=r.width/2;
  try{ stickEl.setPointerCapture?.(e.pointerId); }catch(err){}
  stickSet(0,0);
});
stickEl?.addEventListener('pointermove',e=>{
  if(e.pointerId!==stickId) return;
  e.preventDefault(); e.stopPropagation();
  let nx=(e.clientX-stickCx)/stickR, ny=(e.clientY-stickCy)/stickR;
  const m=Math.hypot(nx,ny);
  if(m>1){ nx/=m; ny/=m; }               // der Knopf bleibt im Ring
  stickSet(nx,ny);
});
for(const ev of ['pointerup','pointercancel'])
  stickEl?.addEventListener(ev,e=>{ if(e.pointerId===stickId){ e.preventDefault(); stickReset(); } });

// ---- Daumenknöpfe. Springen und Abtauchen halten ihre Taste gedrückt,
// solange der Finger liegt; die beiden anderen lösen einmal aus.
function holdButton(id,code){
  const b=el(id); if(!b) return;
  b.addEventListener('pointerdown',e=>{
    e.preventDefault(); e.stopPropagation(); ac();
    keys[code]=true; b.classList.add('on');
  });
  for(const ev of ['pointerup','pointercancel','pointerleave'])
    b.addEventListener(ev,()=>{ keys[code]=false; b.classList.remove('on'); });
}
holdButton('btnJump','Space');
holdButton('btnDive','ShiftLeft');
// Wegwerfen wie am Schreibtisch: kurz ist eins, lang der ganze Stapel (⇧Q).
let dropHoldT=0;
el('btnDrop')?.addEventListener('pointerdown',e=>{
  e.preventDefault(); e.stopPropagation(); ac();
  dropHoldT=setTimeout(()=>{ dropHoldT=0; if(!modalOpen()&&!state.paused) dropHeld(true); },420);
});
for(const ev of ['pointerup','pointercancel'])
  el('btnDrop')?.addEventListener(ev,e=>{
    e.preventDefault();
    if(!dropHoldT) return;                // der lange Druck hat schon geworfen
    clearTimeout(dropHoldT); dropHoldT=0;
    if(!modalOpen()&&!state.paused) dropHeld(false);
  });
el('btnExit')?.addEventListener('pointerdown',e=>{
  e.preventDefault(); e.stopPropagation(); ac();
  if(!modalOpen()&&riding) leaveVehicle();
});

// ---- Rucksack am Finger: die Auflösung der drei Gesten, deren Anfang
// mbox.pointerdown weiter oben gemerkt hat. Beide Zuhörer hängen am Dokument
// und nicht am Fenster, denn beim Ziehen verlässt der Finger das Fenster ja
// gerade — ein Zuhörer an #mbox bekäme genau den interessanten Fall nie zu
// sehen.
document.addEventListener('pointermove',e=>{
  if(!cellHeld||e.pointerType!=='touch'||cellDidHold||cellDrag) return;
  if(Math.hypot(e.clientX-cellX,e.clientY-cellY)<TAP_MOVE) return;
  clearTimeout(cellHoldT);
  cellDrag=true;
  if(!carry) useCell(cellHeld,false);     // aufnehmen — ab jetzt hängt er am Daumen
  drawCarry();
});
function touchCellUp(e){
  if(!cellHeld) return;
  clearTimeout(cellHoldT);
  const from=cellHeld, drag=cellDrag, held=cellDidHold;
  cellHeld=null; cellDrag=false; cellDidHold=false;
  if(e.pointerType!=='touch'||held) return;   // der lange Druck hat schon gehandelt
  if(!drag){ useCell(from,false); return; }   // schlichtes Tippen
  // Gezogen: worüber wurde losgelassen? elementFromPoint statt e.target, weil
  // der Finger den Zielknopf nie "betreten" hat — er war die ganze Zeit auf
  // demselben aufgenommenen Element.
  const node=document.elementFromPoint(e.clientX,e.clientY);
  const tgt=node?.closest?.('[data-slot],[data-g],[data-chest],[data-pot],[data-accept]');
  if(tgt){ useCell(tgt,false); return; }
  // Außerhalb des Fensters losgelassen heißt: weg damit.
  if(carry&&!node?.closest?.('#mwrap')) dropCarryToWorld();
}
document.addEventListener('pointerup',touchCellUp);
document.addEventListener('pointercancel',e=>{
  clearTimeout(cellHoldT); cellHeld=null; cellDrag=false; cellDidHold=false;
});

// ---- Vollbild. Auf dem Handy ist die Browserleiste ein Drittel der Sicht;
// weg damit. Ein Knopf statt automatisch, weil der Browser Vollbild nur auf
// eine echte Fingerbewegung hin erlaubt — und weil niemand ungefragt in den
// Vollbildmodus geworfen werden will. Beim ersten "Weiter" im Willkommens-
// fenster fragen wir zusätzlich, da liegt der Finger ohnehin schon (siehe den
// 'start'-Zweig weiter oben).
function goFullscreen(){
  try{
    if(document.fullscreenElement||document.webkitFullscreenElement){
      (document.exitFullscreen||document.webkitExitFullscreen)?.call(document);
      return;
    }
    const r=document.documentElement;
    const req=r.requestFullscreen||r.webkitRequestFullscreen;
    // Manche Browser liefern kein Promise zurück — .then blind anzuhängen
    // wäre also ein Fehler, und ein abgelehntes Vollbild darf nie das Spiel
    // mitreißen (iPhone-Safari kann es für andere Elemente als Video nicht).
    const p=req?.call(r,{navigationUI:'hide'});
    p?.catch?.(()=>{});
  }catch(e){}
}
el('btnFull')?.addEventListener('click',e=>{ e.stopPropagation(); ac(); goFullscreen(); });
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
  // Sicht umschalten: V wie "view", F5 zusätzlich für alle, die es aus dem
  // Vorbild so kennen (preventDefault, sonst lädt der Browser die Seite neu).
  if(e.code==='KeyV'||e.code==='F5'){
    e.preventDefault(); ac();
    if(!modalOpen()) toggleView();
    return;
  }
  // F steigt aus — nicht ⇧ wie im Vorbild, das ist hier schon Rennen/Tauchen.
  if(e.code==='KeyF'){
    e.preventDefault(); ac();
    if(!modalOpen()&&riding) leaveVehicle();
    return;
  }
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
el('btnView').addEventListener('click',e=>{ e.stopPropagation(); ac(); toggleView(); });
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
    updateShots(dt);
    updateGrow();
  }
  // Kochtöpfe laufen wie Tag/Nacht oben bewusst AUCH bei geöffnetem Fenster
  // weiter: das eigene Kochfenster (openPot/renderPot) IST jetzt ein offenes
  // Menü (state.paused=true) — ohne diese Ausnahme bliebe ein davor
  // betrachteter Topf für immer bei "kocht …" hängen, und finishCook() (das
  // Gericht fällt oben heraus, s. dort) würde erst nach dem Schließen
  // nachgeholt. readyAt ist ohnehin eine absolute Wanduhrzeit (s. usePot),
  // ein Pausieren verschiebt also nichts, es hielte nur die Beobachtung an.
  updatePots(dt);
  updatePlayer(dt);
  updateVehicles(dt);
  // Der Aussteigen-Knopf am Handy zeigt sich nur, wenn man auch wirklich in
  // etwas sitzt (body.riding, siehe #btnExit im CSS). Hier statt in
  // enterVehicle/leaveVehicle, weil man auch auf anderen Wegen aus einem
  // Fahrzeug kommt — beim Sterben etwa (siehe respawn) oder wenn der Server
  // einen anderen Fahrer meldet.
  document.body.classList.toggle('riding',!!riding);
  updateSelfModel(dt,player.spd||0);
  updateHand(dt);
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
    if(isConnected()) send({t:'pos',x:player.x,y:player.y,z:player.z,yaw:player.yaw,pitch:player.pitch,hp:player.hp,food:player.food,sel:player.sel,skin:player.skin});
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
    // Ohne Grafikkontext hat das Zeichnen keinen Sinn: jeder Aufruf liefe in
    // WebGL-Fehler, und der Browser braucht Ruhe, um den Kontext überhaupt
    // wiederherstellen zu können (siehe die contextlost-Zuhörer oben). Das
    // Spiel selbst rechnet weiter, es malt nur nicht.
    if(glLost) return;
    // Die Weltszene löscht wieder ganz gewöhnlich selbst (autoClear, s.
    // Renderer-Setup) — genau ein Aufruf, und das Bild ist in jedem Fall
    // sauber, auch wenn danach etwas schiefgeht.
    renderer.autoClear=true;
    renderer.render(scene,camera);
    // Hand: nur in der Ich-Sicht, nicht bei Pause und nicht hinter einem
    // offenen Fenster/Modal (Anforderung 4). Im Fahrzeug bleibt sie sichtbar
    // — riding hat auf view keinen Einfluss, siehe updateSelfModel.
    // Für diesen einen Durchgang MUSS das Löschen aus bleiben, sonst wischte
    // er die eben gezeichnete Welt weg; direkt danach steht es wieder an, und
    // zwar auch dann, wenn dazwischen etwas wirft (deshalb finally).
    if(view===0&&!state.paused&&!modalOpen()){
      try{
        renderer.autoClear=false;
        renderer.clearDepth();           // eigene Tiefe, damit nichts aus der Welt reinragt
        renderer.render(handScene,handCam);
      }finally{ renderer.autoClear=true; }
    }
  }catch(e){
    if(++frameErrs<4) console.error(e);
  }
}
function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.updateProjectionMatrix();
  resizeHand();
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
// Spinne und Fluch-Benni bekommen ihre Optik aus benni.png selbst: einmal
// beim Laden pixelweise verrechnet, nie pro Frame — bei 1,4 MB Bildgröße
// wäre alles andere spürbar. Schlägt die Verrechnung fehl (etwa ein vom
// Browser verweigerter Canvas-Zugriff), fallen beide einfach auf das
// unveränderte Bild zurück statt den Start abzubrechen.
function buildMobTex(t){
  MOB_TEX.benni=t;
  try{
    const img=t.image, w=img.width, h=img.height;
    const src=document.createElement('canvas'); src.width=w; src.height=h;
    src.getContext('2d').drawImage(img,0,0);
    const data=src.getContext('2d').getImageData(0,0,w,h).data;
    const mk=px=>{
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').putImageData(new ImageData(px,w,h),0,0);
      const tx=new THREE.CanvasTexture(c);
      tx.colorSpace=THREE.SRGBColorSpace;
      tx.magFilter=THREE.NearestFilter;
      tx.minFilter=THREE.NearestMipmapLinearFilter;
      return tx;
    };
    // Spinne: entsättigt und abgedunkelt, Alpha unangetastet.
    const sp=new Uint8ClampedArray(data);
    for(let i=0;i<sp.length;i+=4){
      const gr=(sp[i]*.3+sp[i+1]*.59+sp[i+2]*.11)*.55;
      sp[i]=gr; sp[i+1]=gr; sp[i+2]=gr;
    }
    MOB_TEX.spider=mk(sp);
    // Fluch-Benni: hart Richtung Rot, mehr Kontrast, und im oberen
    // Mittelfeld abgedunkelt, damit die Augen wie hohle Höhlen wirken.
    const cu=new Uint8ClampedArray(data);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      let r=cu[i],g=cu[i+1],b=cu[i+2];
      r=clamp((r-128)*1.4+128+40,0,255);
      g=clamp((g-128)*1.4+128-30,0,255);
      b=clamp((b-128)*1.4+128-30,0,255);
      if(y/h>.15&&y/h<.5&&Math.abs(x/w-.5)<.22){ r*=.25; g*=.25; b*=.25; }
      cu[i]=r; cu[i+1]=g; cu[i+2]=b;
    }
    MOB_TEX.cursed=mk(cu);
  }catch(e){ MOB_TEX.spider=t; MOB_TEX.cursed=t; }
}
Promise.all([
  ...[...ICONS].map(id=>loadItemTex(id)),
  preload('./sprites/items/page1.png'),
  ...UISPRITES.map(n=>preload('./sprites/ui/'+n+'.png')),
  ...[...new Set(CHARS.map(c=>c.key))].map(k=>loadTex(k+'.png').then(t=>{CHAR_TEX[k]=t;})),
  loadTex('benni.png').then(t=>{benniTex=t; buildMobTex(t);}).catch(()=>{}),
  // Der freigestellte Kopf aus dominik.png wird zum Gesicht auf der
  // Spielerfigur (siehe FACES/headTex) — bisher lag das Bild ungenutzt herum.
  loadTex('dominik.png').then(t=>{FACE_TEX.dominik=t;}),
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
  // Nur offline: verbunden füllt der Server die Population (s. _spawnChicken
  // dort), und lokal gesetzte Hühner wären dann Geister neben den echten.
  if(!isConnected()) seedChickens();
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
  drops,pots,spawnDrop,dropHeld,giveOrDrop,updateDrops,usePot,potAdd,potTake,potRecipe,potTip,
  openPot,cookPot,clickPotCell,renderPot,
  POT_CAP,COOK_TIME,fills,fillsAt,waterAt,WATER_Y,FALL_FREE,MARKET,SHOP,PRICES,GOAL,
  openMarket,sellTo,buyFrom,earn,growing,updateGrow,GROW,SEED_OF,till,plantSeed,
  SKINS,equipSkin,unlockSkin,
  makeOffer,offerAsk,offerHint,updateChars,wander,REFRESH,
  get marketChar(){return marketChar;},
  get dayEpoch0(){return dayEpoch0;},
  get tradePartner(){return tradePartner;}, set tradePartner(c){tradePartner=c;},
  get aimed(){return aimed;},
  blockAt,setBlock,surfaceAt,terrainH,rayPick,chunks,scene,renderer,remotePlayers,
  give:(id,n)=>give(id,n), take,countOf,
  get target(){return target;},
  get sel(){return heldId();},
  get openPotCell(){return openPotCell;},
  get panel(){return panel;},
  openCraft,openChest,attack,spawnMob,spawnChicken,maintainChickens,damageMob,hurtPlayer,updateHUD,breakBlock,updatePots,
  learnRecipe,matchRecipe,craftFromGrid,patRows,recCard,sideHTML,icon,iconSrc,
  clickCell,clickChestCell,takeAllFromChest,hideModal,showCrack,CRACKS,updateItemTip,itemNote,
  faceVerts,crossVerts,scenery,REACH,EYE,collides,keys,
  signs,signSprites,aimSign,ensureSignLabel,openSignEditor,saveSignEditor,removeSignEditor,SIGN_MAX,
  get aimedSign(){return aimedSign;},
  carried(){return carry;},
  // Sicht und Fahrzeuge — dieselben Einstiegspunkte, die Tasten und
  // Rechtsklick benutzen, damit Tests nicht die Eingabe nachstellen müssen.
  VEHICLES,vehicles,placeVehicleFromHand,enterVehicle,leaveVehicle,pickUpVehicle,
  aimVehicle,vehicleOfRider,toggleView,makePlayerModel,
  get view(){return view;}, set view(v){view=v;},
  get riding(){return riding;},
  get aimedVehicle(){return aimedVehicle;},
  get selfModel(){return selfModel;},
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
  // Die neuen Sachen: Benni-Arten samt ihren Werten, der Blutmond-Würfel und
  // die Geschosse in der Luft. bloodMoon ist rein — man kann durchprobieren,
  // welcher Tag einer wird, ohne bis dahin spielen zu müssen.
  MOBS, bloodMoon, MOB_TEX, shots, spawnShot, hitMob, useRight,
  // ---------------------------------------------------------- Entwickler
  // Nur über die Konsole erreichbar: keine Taste, kein Knopf, kein Eintrag
  // im Menü — wer nicht danach sucht, stolpert auch nicht hinein.
  dev:{
    // Geld in die Kasse, ohne dafür ernten zu müssen. Voreinstellung ist die
    // Summe über Mannis komplette Auslage (Fahrzeuge, Dünger und die drei
    // Skins, siehe SHOP) — ein Aufruf, dann einmal einkaufen, und alles liegt
    // zum Ausprobieren bereit.
    //
    // Online entscheidet der Server allein über die gemeinsame Kasse (jede
    // 'econ'-Nachricht überschreibt state.money, ein lokales += wäre also
    // im nächsten Moment wieder weg) — darum geht es hier denselben Weg wie
    // Kaufen und Verkaufen: hinschicken und die Antwort abwarten. Offline
    // bleibt der direkte Weg, genau wie bei buyFrom/sellTo.
    //
    // Gezählt wird das Geld NUR in der Kasse, nicht bei 💶 verdient — sonst
    // löste ein Test die 🎯 Siegesmeldung für alle mit aus. Geschenktes Geld
    // gibt man aus, gewonnen hat man damit nichts.
    money(n=SHOP.reduce((s,w)=>s+w.price,0)){
      if(!Number.isInteger(n)) return 'money(n): n muss eine ganze Zahl sein';
      if(isConnected()){ send({t:'dev-money',n}); return 'Angefragt: '+n+' € — der Server antwortet gleich mit dem neuen Kassenstand.'; }
      state.money=Math.max(0,state.money+n); updateHUD();
      return 'Kasse: '+state.money+' €';
    },
    // Die Waren direkt in den Rucksack, ganz ohne Markt — praktisch, wenn nur
    // das Fahren selbst dran ist und nicht der Einkauf davor. Skins zählen
    // nicht dazu (kein Rucksack-Gegenstand, siehe dev.skin unten).
    vehicles(){
      for(const w of SHOP) if(!w.skin) give(w.id,1);
      updateHUD();
      return 'Im Rucksack: '+SHOP.filter(w=>!w.skin).map(w=>ITEMS[w.id].nm).join(', ');
    },
    // Einen Skin freischalten und sofort anziehen, ohne erst bei Manni
    // einzukaufen (siehe unlockSkin/equipSkin, SKINS für die Liste).
    skin(i){
      if(!Number.isInteger(i)||i<0||i>=SKINS.length) return 'skin(i): i muss 0..'+(SKINS.length-1)+' sein';
      unlockSkin(i);
      return 'Skin: '+SKINS[i].ic+' '+SKINS[i].nm;
    },
  },
};
// Ein Hinweis in der Konsole, sonst weiß niemand, dass es das gibt.
console.info('%cErntedominiksfest','font-weight:bold',
  '— Entwicklerhilfen: game.dev.money() für die Kasse, game.dev.vehicles() für Brett/Boot/Schirm, game.dev.skin(i) für einen Skin.');
