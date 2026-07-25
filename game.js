/* =====================================================================
   ErnteDominiksFest — Klötzchen-Survival
   Tagsüber Dominiks züchten und verkaufen, nachts die Bennis abwehren.
   Kein Countdown, kein Game Over — nur Aufbau.
   ===================================================================== */
import * as THREE from './vendor/three.module.min.js';

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
const ac=()=>{ if(!AC){ try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){} } return AC; };
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
const SND={
  tap:()=>tone(620,.05,'square',.05),
  work:()=>tone(300,.06,'triangle',.05),
  chop:()=>tone(180+Math.random()*60,.07,'square',.06),
  done:()=>{tone(523,.08,'triangle',.09);tone(784,.1,'triangle',.09,.07);},
  coin:()=>{tone(988,.07,'square',.07);tone(1319,.12,'square',.07,.06);},
  craft:()=>{tone(392,.09,'square',.08);tone(587,.09,'square',.08,.08);tone(784,.14,'square',.08,.16);},
  swing:()=>tone(300,.07,'sawtooth',.05),
  hit:()=>{tone(140,.09,'square',.1);tone(90,.12,'square',.08,.05);},
  shoot:()=>{tone(700,.06,'square',.08);tone(300,.12,'sawtooth',.07,.05);},
  hurt:()=>{tone(180,.2,'sawtooth',.13);tone(120,.25,'sawtooth',.1,.1);},
  mobDie:()=>{tone(400,.1,'square',.08);tone(200,.18,'square',.07,.09);},
  night:()=>{tone(160,.5,'sine',.09);tone(120,.6,'sine',.08,.2);},
  dawn:()=>{tone(523,.14,'triangle',.08);tone(659,.14,'triangle',.08,.12);tone(784,.2,'triangle',.08,.24);},
  splat:()=>tone(85,.22,'sine',.15),
  fail:()=>tone(160,.15,'square',.07),
  step:()=>tone(90+Math.random()*30,.05,'triangle',.03),
  quest:()=>{tone(659,.1,'triangle',.09);tone(988,.16,'triangle',.09,.1);},
  engine:()=>tone(70+Math.random()*20,.12,'sawtooth',.05),
};

// ------------------------------------------------------------------ Zeit & Balance
const DAYLEN=170;                       // Sekunden pro Tag/Nacht-Zyklus
const NIGHT_START=.60, NIGHT_END=.94;   // Nachtfenster
// Ackerbau ist entspannt: Bäume dursten langsam, Läuse töten nicht
const STAGE_DUR={seed:9,sprout:13,young:17,mature:13,blossom:9};
const STAGE_NEXT={seed:'sprout',sprout:'young',young:'mature',mature:'blossom',blossom:'fruiting'};
const FRUIT_WINDOW=70, OVERRIPE_WINDOW=40, WILT_LIMIT=75;
const DRINK_SLOW=1/190, DRINK_YOUNG=1/240;   // ~3 Min von voll auf leer
const PEST_TTL=90;                            // Läuse fressen nur die Ernte
const GROWABLE=['seed','sprout','young','mature','blossom'];
const ALIVE=[...GROWABLE,'fruiting','overripe'];
const REACH=4.4;

const COLS=[-9,0,9], ROWS=[-18,-9,0,9];
// Dorfkern: Brunnen, Werkbank, Laden und Feststand liegen dicht beieinander
const WELL={x:-12,z:24}, BENCH={x:-5,z:25}, SHED={x:2,z:26}, STALL={x:11,z:24};
const BOUND={x0:-33,x1:25,z0:-35,z1:29};

const state={t:0,day:1,dayT:.05,night:false,price:12,priceT:0,money:20,paused:true,
  earned:0,harvested:0,sold:0,crafted:0,chopped:0,killed:0,deaths:0,
  checkT:0,started:false,tutorial:true,q_water:false};
const inv={seed:3,bio:0,pest:1,fert:0,torch:0,ball:0,medkit:0};
const res={wood:0,stone:0};
const upg={can:0,shears:0,bag:0,boots:0,plots:0};
const owned={};                          // gekaufte Waffen/Rüstung/Fahrzeug
const canCap=()=>4+upg.can*2;
const bagCap=()=>5+upg.bag*3;
const trimMul=()=>[1,.68,.48][upg.shears];
const walkSpeed=()=>5.6*(1+upg.boots*.16);

const player={x:0,z:20,yaw:0,pitch:-.03,can:4,carry:0,bob:0,act:null,stepT:0,
  hp:20,maxhp:20,atkCd:0,hurtT:0,driving:false};

// ------------------------------------------------------------------ Waffen & Rüstung
const WEAPONS={
  fist  :{ic:'✊', nm:'Faust',           dmg:2, range:2.4, cd:.55},
  club  :{ic:'🏏', nm:'Knüppel',         dmg:3, range:2.8, cd:.5},
  sword :{ic:'⚔️', nm:'Schwert',         dmg:6, range:3.2, cd:.42},
  cannon:{ic:'🔫', nm:'Dominik-Kanone',  dmg:9, range:30,  cd:.75, ranged:true},
};
const WEAPON_ORDER=['cannon','sword','club','fist'];
const bestWeapon=()=>WEAPON_ORDER.find(w=>w==='fist'||owned[w])||'fist';
function activeWeapon(){
  const w=player.weapon&&(player.weapon==='fist'||owned[player.weapon])?player.weapon:bestWeapon();
  // Kanone braucht Dominiks als Munition
  if(w==='cannon'&&player.carry<1) return WEAPON_ORDER.find(x=>x!=='cannon'&&(x==='fist'||owned[x]));
  return w;
}
const armorPoints=()=>(owned.helm?2:0)+(owned.vest?4:0);

// ------------------------------------------------------------------ Aktionen
const ACTS={
  plant   :{ic:'🌱',label:'Pflanzen',      dur:1.8},
  plantbio:{ic:'🌟',label:'Bio pflanzen',  dur:1.8},
  water   :{ic:'💧',label:'Gießen',        dur:1.4},
  trim    :{ic:'✂️',label:'Schneiden',     dur:2.8},
  spray   :{ic:'🧪',label:'Spritzen',      dur:1.8},
  fert    :{ic:'💩',label:'Düngen',        dur:1.6},
  harvest :{ic:'🍑',label:'Ernten',        dur:2.0},
  refill  :{ic:'🚰',label:'Kanne füllen',  dur:1.6},
  sell    :{ic:'💰',label:'Verkaufen',     dur:1.2},
  shop    :{ic:'🛒',label:'Laden öffnen',  dur:0},
  craft   :{ic:'🔨',label:'Werkbank',      dur:0},
  talk    :{ic:'💬',label:'Ansprechen',    dur:0},
  buyplot :{ic:'🌍',label:'Beet kaufen',   dur:0},
  chop    :{ic:'🪓',label:'Baum hacken',   dur:2.6},
  mine    :{ic:'⛏️',label:'Stein klopfen', dur:2.6},
  torch   :{ic:'🔥',label:'Fackel setzen', dur:.8},
  drive   :{ic:'🚜',label:'Einsteigen',    dur:0},
  park    :{ic:'🅿️',label:'Aussteigen',    dur:0},
  heal    :{ic:'❤️',label:'Verbinden',     dur:1.2},
};

// ------------------------------------------------------------------ Rezepte
const RECIPES=[
  {id:'seed',  ic:'🌱',nm:'Samen',        ds:'Aus einem Dominik neue Samen gewinnen.',
   cost:{dominik:1}, give:()=>{inv.seed+=3;}, out:'3× 🌱'},
  {id:'torch', ic:'🔥',nm:'Fackel',       ds:'Bennis meiden beleuchtete Ecken.',
   cost:{wood:2,stone:1}, give:()=>{inv.torch+=2;}, out:'2× 🔥'},
  {id:'club',  ic:'🏏',nm:'Knüppel',      ds:'Einfache Waffe. Besser als nichts.',
   cost:{wood:4}, max:1, lvl:()=>owned.club?1:0, give:()=>{owned.club=true;}},
  {id:'sword', ic:'⚔️',nm:'Steinschwert', ds:'Deutlich mehr Wumms gegen Bennis.',
   cost:{stone:5,wood:3}, max:1, lvl:()=>owned.sword?1:0, give:()=>{owned.sword=true;}},
  {id:'pest',  ic:'🧪',nm:'Blattlaus-Spray',ds:'Rettet die Ernte am Baum.',
   cost:{stone:2,wood:1}, give:()=>{inv.pest++;}, out:'1× 🧪'},
  {id:'fert',  ic:'💩',nm:'Kompost',      ds:'Sofort +45 % Wachstum.',
   cost:{wood:3}, give:()=>{inv.fert++;}, out:'1× 💩'},
  {id:'can',   ic:'🚿',nm:'Größere Kanne', ds:'+2 Ladungen, weniger Brunnen-Wege.',
   cost:{wood:4,stone:3}, max:3, lvl:()=>upg.can, give:()=>{upg.can++;player.can=canCap();}},
  {id:'bag',   ic:'🎒',nm:'Erntekorb',    ds:'+3 Dominiks tragen.',
   cost:{wood:6}, max:3, lvl:()=>upg.bag, give:()=>{upg.bag++;}},
  {id:'shears',ic:'✂️',nm:'Schere',       ds:'Schneiden geht flotter.',
   cost:{stone:4,wood:2}, max:2, lvl:()=>upg.shears, give:()=>{upg.shears++;}},
  {id:'boots', ic:'👟',nm:'Stiefel',      ds:'+16 % Laufgeschwindigkeit.',
   cost:{wood:5,stone:4}, max:2, lvl:()=>upg.boots, give:()=>{upg.boots++;}},
];
const have=k=>k==='wood'?res.wood:k==='stone'?res.stone:k==='dominik'?player.carry:0;
const RESNAME={wood:'🪵',stone:'🪨',dominik:'🍑'};
function canCraft(r){
  if(r.max!=null&&r.lvl()>=r.max) return 'max';
  for(const k in r.cost) if(have(k)<r.cost[k]) return 'kosten';
  return true;
}

// ------------------------------------------------------------------ Laden
const SHOP=[
  {id:'seed',ico:'🌱',nm:'Dominik-Samen',ds:'Der Klassiker.',price:()=>5,
   own:()=>'Vorrat: '+inv.seed,buy:()=>inv.seed++},
  {id:'bio',ico:'🌟',nm:'Bio-Samen',ds:'35 % schneller, +1 Frucht.',price:()=>14,
   own:()=>'Vorrat: '+inv.bio,buy:()=>inv.bio++},
  {id:'pest',ico:'🧪',nm:'Blattlaus-Spray',ds:'Rettet die Ernte.',price:()=>8,
   own:()=>'Vorrat: '+inv.pest,buy:()=>inv.pest++},
  {id:'torch',ico:'🔥',nm:'Fackel',ds:'Bennis spawnen nicht im Licht.',price:()=>7,
   own:()=>'Vorrat: '+inv.torch,buy:()=>inv.torch++},
  {id:'medkit',ico:'❤️',nm:'Verbandskasten',ds:'Heilt 10 Herzenspunkte.',price:()=>16,
   own:()=>'Vorrat: '+inv.medkit,buy:()=>inv.medkit++},
  {id:'club',ico:'🏏',nm:'Baseballschläger',ds:'Solide gegen anrückende Bennis.',price:()=>30,
   one:true,own:()=>owned.club?'gekauft ✔':'—',buy:()=>{owned.club=true;}},
  {id:'sword',ico:'⚔️',nm:'Schwert',ds:'Drei Treffer, ein Benni.',price:()=>85,
   one:true,own:()=>owned.sword?'gekauft ✔':'—',buy:()=>{owned.sword=true;}},
  {id:'helm',ico:'🪖',nm:'Helm',ds:'Weniger Schaden durch Basketbälle.',price:()=>55,
   one:true,own:()=>owned.helm?'gekauft ✔':'—',buy:()=>{owned.helm=true;}},
  {id:'vest',ico:'🦺',nm:'Warnweste',ds:'Deutlich weniger Schaden. Und sichtbar.',price:()=>110,
   one:true,own:()=>owned.vest?'gekauft ✔':'—',buy:()=>{owned.vest=true;}},
  {id:'cannon',ico:'🔫',nm:'Dominik-Kanone',ds:'Verschießt Dominiks. Ja, wirklich.',price:()=>220,
   one:true,own:()=>owned.cannon?'gekauft ✔':'—',buy:()=>{owned.cannon=true;}},
  {id:'tractor',ico:'🚜',nm:'Traktor',ds:'Doppelt so schnell, überfährt Bennis.',price:()=>300,
   one:true,own:()=>owned.tractor?'gekauft ✔':'—',buy:()=>{owned.tractor=true;spawnTractor();}},
];

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
document.body.insertBefore(renderer.domElement,el('touchlayer'));

scene=new THREE.Scene();
scene.fog=new THREE.Fog(0x9fd0e8,50,150);
camera=new THREE.PerspectiveCamera(74,1,.1,400);

const hemi=new THREE.HemisphereLight(0xcfe8ff,0x5a8a45,1.25); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff3d6,2.0);
sun.position.set(26,44,16); sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);
const sc=sun.shadow.camera;
sc.left=-40;sc.right=40;sc.top=40;sc.bottom=-40;sc.near=1;sc.far=130;
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
const TEX={
  dirt   :noiseTex(['#8a6440','#7d5937','#946d48','#6f4e30'],22),
  stone  :noiseTex(['#8e8e8e','#828282','#9a9a9a','#787878'],24),
  log    :noiseTex(['#6b4c2b','#7a5734','#5e4325'],25,(g,s)=>{
    g.fillStyle='#4e3720'; g.fillRect(0,0,1,s); g.fillRect(s-1,0,1,s);
    g.fillStyle='#84603c'; g.fillRect(5,0,1,s); g.fillRect(10,0,1,s);
  }),
  leaf   :noiseTex(['#3f8c39','#357a31','#489a41','#2e6b2b','#54a84a'],26),
  deadlog:noiseTex(['#6d6257','#5c5249','#7a6f63'],27),
  plank  :noiseTex(['#b08247','#a5783f','#bb8d51'],28,(g,s)=>{
    g.fillStyle='#8a6535'; for(let y=3;y<s;y+=4) g.fillRect(0,y,s,1);
  }),
  brick  :noiseTex(['#9a9a95','#8c8c88','#a6a6a1'],29,(g,s)=>{
    g.fillStyle='#6f6f6b';
    g.fillRect(0,7,s,1); g.fillRect(0,15,s,1);
    g.fillRect(7,0,1,8); g.fillRect(3,8,1,8);
  }),
  water  :noiseTex(['#2f7fc4','#2a72b2','#3a8ad0'],30),
  wool   :pixTex((g,s)=>{ for(let x=0;x<s;x++){ g.fillStyle=(x>>2)%2?'#c8352f':'#e8e4d8'; g.fillRect(x,0,1,s);} }),
  hay    :noiseTex(['#c9a233','#d6ae3c','#b8922c'],31),
  bench  :noiseTex(['#a5783f','#966c38'],32,(g,s)=>{
    g.fillStyle='#5e4325'; g.fillRect(0,0,s,3);
    g.fillStyle='#6f512f'; g.fillRect(2,5,4,4); g.fillRect(9,5,4,4); g.fillRect(2,11,4,3); g.fillRect(9,11,4,3);
  }),
  flame  :noiseTex(['#ffb03a','#ff8c1a','#ffd76a','#ff6a1a'],33),
  metal  :noiseTex(['#4a5560','#3e4852','#57626d'],34),
  tyre   :noiseTex(['#26262a','#1d1d20','#303036'],35),
};
const iconCache=new Map();
function iconTex(txt){
  if(iconCache.has(txt)) return iconCache.get(txt);
  const c=document.createElement('canvas'); c.width=c.height=128;
  const g=c.getContext('2d');
  g.fillStyle='rgba(12,22,12,.72)'; g.beginPath(); g.arc(64,64,54,0,7); g.fill();
  g.strokeStyle='rgba(255,255,255,.5)'; g.lineWidth=4; g.stroke();
  g.font='62px system-ui'; g.textAlign='center'; g.textBaseline='middle';
  g.fillText(txt,64,67);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace;
  iconCache.set(txt,t); return t;
}
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
function makeLabel(lines,color,h,depthTest=true){
  const tex=labelTex(lines,color);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest,depthWrite:false}));
  sp.scale.set(h*tex.image.width/tex.image.height,h,1);
  return sp;
}

// ------------------------------------------------------------------ Klötzchen
const BLOCK=new THREE.BoxGeometry(1,1,1);
const _m4=new THREE.Matrix4(), _pos=new THREE.Vector3(),
      _quat=new THREE.Quaternion(), _scl=new THREE.Vector3();
function batch(tex,cap,opts){
  const m=new THREE.InstancedMesh(BLOCK,
    new THREE.MeshLambertMaterial(Object.assign({map:tex},opts||{})),cap);
  m.castShadow=m.receiveShadow=true;
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
const reset=m=>{m.count=0;};
const flush=m=>{m.instanceMatrix.needsUpdate=true;};

const B={
  brick:batch(TEX.brick,900), plank:batch(TEX.plank,520), log:batch(TEX.log,420),
  stone:batch(TEX.stone,260), water:batch(TEX.water,12), wool:batch(TEX.wool,60),
  hay:batch(TEX.hay,40), bench:batch(TEX.bench,6),
};
const D={
  leaf:batch(TEX.leaf,1600), log:batch(TEX.log,340),
  dead:batch(TEX.deadlog,60), rock:batch(TEX.stone,220),
  torchPost:batch(TEX.log,120),
  flame:batch(TEX.flame,120,{emissive:0xff8c1a,emissiveIntensity:1}),
};
let treesDirty=true;

// ------------------------------------------------------------------ Boden
const ground=new THREE.Mesh(
  new THREE.PlaneGeometry(220,220),
  new THREE.MeshLambertMaterial({map:pixTex((g,s)=>{
    const r=mulberry(21);
    for(let y=0;y<s;y++) for(let x=0;x<s;x++){
      g.fillStyle=['#6aab3f','#5f9e38','#74b649','#589434','#7cbd4f'][Math.floor(r()*5)];
      g.fillRect(x,y,1,1);
    }
    g.fillStyle='rgba(0,0,0,.10)'; g.fillRect(0,0,s,1); g.fillRect(0,0,1,s);
  },16,220)}));
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true;
ground.userData={kind:'ground'};
scene.add(ground);

const obstacles=[];
const interactives=[];
function hitProxy(x,z,r,h,data,y0=0){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,7),
    new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
  m.position.set(x,y0+h/2,z); m.userData=data; scene.add(m);
  m.updateMatrixWorld();      // sonst liegt die Trefferzone bis zum nächsten Render im Ursprung
  interactives.push(m); return m;
}

(function wall(){
  for(let x=BOUND.x0-1;x<=BOUND.x1+1;x++){
    blk(B.brick,x,0,BOUND.z0-1); blk(B.brick,x,1,BOUND.z0-1);
    blk(B.brick,x,0,BOUND.z1+1); blk(B.brick,x,1,BOUND.z1+1);
  }
  for(let z=BOUND.z0-1;z<=BOUND.z1+1;z++){
    blk(B.brick,BOUND.x0-1,0,z); blk(B.brick,BOUND.x0-1,1,z);
    blk(B.brick,BOUND.x1+1,0,z); blk(B.brick,BOUND.x1+1,1,z);
  }
  flush(B.brick);
})();

(function well(){
  const {x,z}=WELL;
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){
    if(dx===0&&dz===0) continue;
    blk(B.brick,x+dx,0,z+dz);
  }
  blk(B.water,x,0,z,.94);
  for(const [dx,dz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    blk(B.log,x+dx,1,z+dz); blk(B.log,x+dx,2,z+dz);
  }
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) blk(B.plank,x+dx,3,z+dz);
  const sign=makeLabel('🚰 Brunnen','#ffd76a',.62,false);
  sign.position.set(x,5.1,z); scene.add(sign);
  obstacles.push({x,z,r:1.9});
  hitProxy(x,z,2.5,3.2,{kind:'well'});
})();

(function stall(){
  const {x,z}=STALL;
  for(let dx=-2;dx<=2;dx++){ blk(B.plank,x+dx,0,z-1); blk(B.hay,x+dx,1,z-1); }
  for(const dx of [-2,2]){ blk(B.log,x+dx,1,z-2); blk(B.log,x+dx,2,z-2); }
  for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=0;dz++) blk(B.wool,x+dx,3,z+dz-1);
  const sign=makeLabel('💰 Feststand','#ffd76a',.62,false);
  sign.position.set(x,5.1,z-1); scene.add(sign);
  obstacles.push({x,z:z-1.2,r:2.4});
  hitProxy(x,z-1,3.1,3,{kind:'stall'});
})();

(function shed(){
  const {x,z}=SHED;
  for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=1;dz++){
    const edge=Math.abs(dx)===2||dz===-2||dz===1;
    if(!edge) continue;
    for(let y=0;y<3;y++){
      if(dz===-2&&Math.abs(dx)<1&&y<2) continue;
      blk(B.plank,x+dx,y,z+dz);
    }
  }
  for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=2;dz++) blk(B.brick,x+dx,3,z+dz);
  const sign=makeLabel('🛒 Laden','#ffd76a',.62,false);
  sign.position.set(x,5.2,z-2); scene.add(sign);
  obstacles.push({x,z,r:3});
  hitProxy(x,z-2.6,2.2,3,{kind:'shop'});
})();

(function bench(){
  const {x,z}=BENCH;
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) blk(B.plank,x+dx,0,z+dz);
  blk(B.bench,x,1,z);
  const sign=makeLabel('🔨 Werkbank','#ffd76a',.62,false);
  sign.position.set(x,3.1,z); scene.add(sign);
  obstacles.push({x,z,r:1.3});
  hitProxy(x,z,2.2,2.6,{kind:'bench'});
  flush(B.plank); flush(B.log); flush(B.water); flush(B.wool); flush(B.hay); flush(B.bench);
})();

// ------------------------------------------------------------------ Baumformen
function canopyShape(big){
  const out=[];
  if(!big){
    for(let x=-1;x<=1;x++) for(let z=-1;z<=1;z++)
      if(Math.abs(x)+Math.abs(z)<=1) out.push([x,0,z]);
    out.push([0,1,0]);
    return out;
  }
  for(let x=-2;x<=2;x++) for(let z=-2;z<=2;z++){
    if(Math.abs(x)===2&&Math.abs(z)===2) continue;
    out.push([x,0,z]);
  }
  for(let x=-1;x<=1;x++) for(let z=-1;z<=1;z++) out.push([x,1,z]);
  out.push([0,2,0],[1,2,0],[-1,2,0],[0,2,1],[0,2,-1]);
  return out;
}
const CANOPY_BIG=canopyShape(true), CANOPY_SMALL=canopyShape(false);
const FRUIT_SLOTS=[[2,1,0],[-2,1,0],[0,1,2],[0,1,-2],[2,1,2],[-2,1,-2]];

// ------------------------------------------------------------------ Beete
class Plot{
  constructor(i,x,z){
    this.i=i; this.x=x; this.z=z;
    this.unlocked=i<4;
    this.stage='empty'; this.growth=0; this.t=0; this.water=1; this.wilt=0;
    this.over=0; this.pest=null; this.fruits=0; this.premium=false;
    this.canopyY=3; this.canopyR=2;
    const g=new THREE.Group(); g.position.set(x,0,z); scene.add(g); this.group=g;
    const soil=new THREE.Mesh(new THREE.PlaneGeometry(3,3),
      new THREE.MeshLambertMaterial({map:pixTex((c,s)=>{
        const r=mulberry(23);
        for(let y=0;y<s;y++) for(let x2=0;x2<s;x2++){
          c.fillStyle=['#6b4a2c','#5e3f24','#775434'][Math.floor(r()*3)];
          c.fillRect(x2,y,1,1);
        }
        c.fillStyle='#4a3119'; for(let y=2;y<s;y+=5) c.fillRect(0,y,s,1);
      },16,3)}));
    soil.rotation.x=-Math.PI/2; soil.position.y=.03; soil.receiveShadow=true; g.add(soil);
    this.soil=soil;
    this.icon=new THREE.Sprite(new THREE.SpriteMaterial({map:iconTex('💧'),depthTest:false}));
    this.icon.scale.set(.95,.95,1); this.icon.visible=false; g.add(this.icon);
    this.icon2=new THREE.Sprite(new THREE.SpriteMaterial({map:iconTex('🪲'),depthTest:false}));
    this.icon2.scale.set(.95,.95,1); this.icon2.visible=false; g.add(this.icon2);
    this.sign=makeLabel(['🚧 Beet frei','antippen'],'#ffd76a',.5);
    this.sign.position.y=1.5; this.sign.visible=!this.unlocked; g.add(this.sign);
    this.num=makeLabel('#'+(i+1),'#ffffff',.32,false);
    this.num.position.y=.5; g.add(this.num);
    hitProxy(x,z,1.8,4.5,{kind:'plot',plot:this});
  }
  emit(){
    if(!this.unlocked||this.stage==='empty'){ this.canopyY=1.5; this.canopyR=1; return; }
    const {x,z}=this, s=this.stage;
    if(s==='dead'){ blk(D.dead,x,0,z); blk(D.dead,x,1,z); this.canopyY=2; this.canopyR=.6; return; }
    if(s==='seed'){ if(this.growth>.5) blk(D.leaf,x,0,z,.35); this.canopyY=1; this.canopyR=.5; return; }
    if(s==='sprout'){ blk(D.log,x,0,z,.55); blk(D.leaf,x,1,z,.7);
      this.canopyY=1.6; this.canopyR=.6; return; }
    const big=s!=='young';
    const th=big?3:2, shape=big?CANOPY_BIG:CANOPY_SMALL;
    for(let y=0;y<th;y++) blk(D.log,x,y,z);
    const base=th-1;
    for(const [dx,dy,dz] of shape) blk(D.leaf,x+dx,base+dy,z+dz);
    if(this.over>.5){
      const r=mulberry(700+this.i);
      const n=Math.round(this.over*7);
      for(let k=0;k<n;k++){
        const a=r()*6.28, rad=2.6+r()*.8;
        blk(D.leaf,x+Math.round(Math.cos(a)*rad),base+Math.round(r()*2),z+Math.round(Math.sin(a)*rad));
      }
    }
    this.canopyY=base+1.6; this.canopyR=big?2.4:1.4;
    if(fruitMesh&&(s==='fruiting'||s==='overripe')){
      for(let k=0;k<this.fruits&&k<FRUIT_SLOTS.length;k++){
        const [dx,dy,dz]=FRUIT_SLOTS[k];
        blk(fruitMesh,x+dx,base-dy,z+dz,.82);
      }
    }
  }
  plant(premium){
    Object.assign(this,{stage:'seed',growth:0,t:0,water:1,wilt:0,over:0,pest:null,fruits:0,premium});
    treesDirty=true;
  }
  die(msg){
    Object.assign(this,{stage:'dead',growth:0,fruits:0,pest:null});
    treesDirty=true;
    toast(msg.replace('#','#'+(this.i+1)),'bad'); SND.splat();
  }
  update(dt){
    this.sign.visible=!this.unlocked;
    this.soil.visible=this.unlocked;
    this.num.visible=this.unlocked&&this.stage==='empty';
    if(!this.unlocked||this.stage==='empty'){ this.icon.visible=this.icon2.visible=false; return; }
    const alive=ALIVE.includes(this.stage);
    if(alive&&dt>0){
      const drink=(this.stage==='seed'||this.stage==='sprout')?DRINK_YOUNG:DRINK_SLOW;
      this.water=clamp(this.water-dt*drink*(this.premium?1.15:1),0,1);
      if(this.water<=0){
        this.wilt+=dt;
        if(this.wilt>=WILT_LIMIT){ this.die('💀 Baum # ist vertrocknet. Öfter mal gießen!'); return; }
      } else this.wilt=0;
      // Läuse fressen nur die Ernte, sie töten den Baum nicht mehr
      if(this.pest){
        this.pest.ttl-=dt;
        if(this.pest.ttl<=0){
          this.pest=null;
          if(this.fruits){ this.fruits=0; this.stage='mature'; this.growth=.2; treesDirty=true;
            toast('🪲 Die Läuse an Baum #'+(this.i+1)+' haben die Ernte weggefuttert.','warn'); }
          else toast('🪲 Die Läuse an Baum #'+(this.i+1)+' ziehen weiter.','',2200);
        }
      }
      if(['young','mature','blossom','fruiting','overripe'].includes(this.stage)){
        const o0=this.over;
        this.over=clamp(this.over+dt/95,0,1);
        if((o0<.5)!==(this.over<.5)) treesDirty=true;
      }
      if(GROWABLE.includes(this.stage)&&this.water>0&&!this.pest){
        let rate=1/STAGE_DUR[this.stage];
        if(this.premium) rate*=1.35;
        if(this.over>.6) rate*=.7;
        const g0=this.growth;
        this.growth+=dt*rate;
        if(this.stage==='seed'&&(g0<.5)!==(this.growth<.5)) treesDirty=true;
        if(this.growth>=1){
          this.stage=STAGE_NEXT[this.stage]; this.growth=0; this.t=0; treesDirty=true;
          if(this.stage==='fruiting'){
            this.fruits=clamp(rndi(2,4)+(this.premium?1:0),1,5);
            toast(pick(['🍑 Dominiks reif an Baum #N!','🍑 Baum #N trägt prächtige Dominiks!',
                        '🍑 Erntezeit an Baum #N!']).replace('#N','#'+(this.i+1)),'good');
            SND.done();
          }
        }
      }
      if(this.stage==='fruiting'){
        this.t+=dt;
        if(this.t>=FRUIT_WINDOW){ this.stage='overripe'; this.t=0; treesDirty=true;
          toast('🫠 Die Dominiks an Baum #'+(this.i+1)+' werden langsam matschig.','warn'); }
      } else if(this.stage==='overripe'){
        this.t+=dt;
        if(this.t>=OVERRIPE_WINDOW){
          this.stage='mature'; this.growth=.2; this.fruits=0; this.t=0; treesDirty=true;
          toast('💦 Baum #'+(this.i+1)+': die Dominiks sind runtergefallen.','',2600);
        }
      }
    }
    const icons=[];
    if(this.pest) icons.push('🪲');
    if(alive&&this.water<.3) icons.push('💧');
    if(this.stage==='fruiting') icons.push('🍑');
    else if(this.stage==='overripe') icons.push('⏳');
    else if(this.over>.62) icons.push('✂️');
    const setIcon=(sp,txt)=>{
      if(!txt){ sp.visible=false; return; }
      sp.visible=true;
      if(sp.userData.txt!==txt){ sp.material.map=iconTex(txt); sp.userData.txt=txt; }
    };
    const yTop=this.canopyY+this.canopyR+.4;
    setIcon(this.icon,icons[0]); this.icon.position.set(icons.length>1?-.6:0,yTop,0);
    setIcon(this.icon2,icons[1]); this.icon2.position.set(.6,yTop,0);
    const pulse=1+Math.sin(state.t*5)*.08;
    this.icon.scale.set(.95*pulse,.95*pulse,1);
    this.icon2.scale.set(.95*pulse,.95*pulse,1);
  }
  get alerts(){
    const a=[];
    if(this.pest) a.push('🪲');
    if(ALIVE.includes(this.stage)&&this.water<.3) a.push('💧');
    if(this.stage==='fruiting') a.push('🍑');
    if(this.stage==='overripe') a.push('⏳');
    return a;
  }
  label(){
    const n='Baum #'+(this.i+1);
    if(!this.unlocked) return [n,'Freies Beet — '+plotPrice()+' €'];
    const names={empty:'Leeres Beet',seed:'Samen',sprout:'Keimling',young:'Jungbaum',
      mature:'Ausgewachsen',blossom:'Blüte',fruiting:'Reif! 🍑',overripe:'Überreif 🫠',dead:'Vertrocknet 💀'};
    const bits=[names[this.stage]];
    if(ALIVE.includes(this.stage)) bits.push('💧'+Math.round(this.water*100)+'%');
    if(this.pest) bits.push('🪲'+Math.ceil(this.pest.ttl)+'s');
    if(this.over>.3) bits.push('🌿'+Math.round(this.over*100)+'%');
    if(this.fruits) bits.push('🍑'+this.fruits);
    return [n+(this.premium?' 🌟':''),bits.join('  ')];
  }
}
const plots=[];
(function makePlots(){
  let i=0;
  for(const z of ROWS) for(const x of COLS) plots.push(new Plot(i++,x,z));
  for(const p of plots) obstacles.push({x:p.x,z:p.z,r:.8,plot:p});
})();

// ------------------------------------------------------------------ Wald & Steinbruch
const nodes=[];
(function forest(){
  const r=mulberry(91);
  for(let k=0;k<70&&nodes.filter(n=>n.kind==='tree').length<14;k++){
    const x=Math.round(rnd(BOUND.x0+3,BOUND.x1-3));
    const z=Math.round(rnd(BOUND.z0+3,BOUND.z0+10));
    if(nodes.some(n=>Math.hypot(n.x-x,n.z-z)<5)) continue;
    nodes.push({kind:'tree',x,z,alive:true,respawn:0,h:3+Math.floor(r()*2)});
  }
  for(let k=0;k<70&&nodes.filter(n=>n.kind==='rock').length<12;k++){
    const x=Math.round(rnd(BOUND.x0+2,BOUND.x0+9));
    const z=Math.round(rnd(-12,16));
    if(nodes.some(n=>Math.hypot(n.x-x,n.z-z)<4)) continue;
    nodes.push({kind:'rock',x,z,alive:true,respawn:0,h:1+Math.floor(r()*2)});
  }
  for(const n of nodes){
    obstacles.push({x:n.x,z:n.z,r:.8,node:n});
    n.proxy=hitProxy(n.x,n.z,1.6,n.kind==='tree'?5:2.2,{kind:'node',node:n});
  }
})();
function emitNodes(){
  for(const n of nodes){
    if(!n.alive) continue;
    if(n.kind==='tree'){
      for(let y=0;y<n.h;y++) blk(D.log,n.x,y,n.z);
      for(const [dx,dy,dz] of CANOPY_BIG) blk(D.leaf,n.x+dx,n.h-1+dy,n.z+dz);
    } else {
      for(let y=0;y<n.h;y++) blk(D.rock,n.x,y,n.z);
      if(n.h>1){ blk(D.rock,n.x+1,0,n.z); blk(D.rock,n.x,0,n.z+1); }
    }
  }
}
function updateNodes(dt){
  for(const n of nodes){
    if(n.alive) continue;
    n.respawn-=dt;
    if(n.respawn<=0){ n.alive=true; treesDirty=true; }
  }
}

// ------------------------------------------------------------------ Fackeln
const torches=[];
function placeTorch(x,z){
  torches.push({x:Math.round(x),z:Math.round(z)});
  treesDirty=true;
}
function emitTorches(){
  for(const t of torches){
    blk(D.torchPost,t.x,0,t.z,.24);
    blk(D.torchPost,t.x,1,t.z,.24);
    blk(D.flame,t.x,2,t.z,.42);
  }
}
const litAt=(x,z,r=14)=>torches.some(t=>Math.hypot(t.x-x,t.z-z)<r);

// ------------------------------------------------------------------ Dominik-Frucht
let dominikTex=null, fruitMesh=null;
function makeFruitBatch(img){
  const c=document.createElement('canvas'); c.width=c.height=64;
  const g=c.getContext('2d');
  g.fillStyle='#3b2a1e'; g.fillRect(0,0,64,64);
  g.drawImage(img,100,150,812,812,0,0,64,64);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestMipmapLinearFilter;
  dominikTex=t;
  fruitMesh=batch(t,90);
}

// ------------------------------------------------------------------ Traktor
let tractor=null;
function spawnTractor(){
  if(tractor) return;
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.8,.9,2.6),
    new THREE.MeshLambertMaterial({color:0x2f7a2f}));
  body.position.y=1.0; body.castShadow=true; g.add(body);
  const cab=new THREE.Mesh(new THREE.BoxGeometry(1.3,.9,1.1),
    new THREE.MeshLambertMaterial({map:TEX.metal}));
  cab.position.set(0,1.85,.4); cab.castShadow=true; g.add(cab);
  const wheelG=new THREE.BoxGeometry(.5,1.1,1.1);
  for(const [wx,wz,s] of [[-.95,-.9,1],[.95,-.9,1],[-.95,.95,.8],[.95,.95,.8]]){
    const w=new THREE.Mesh(wheelG,new THREE.MeshLambertMaterial({map:TEX.tyre}));
    w.position.set(wx,.55*s+.1,wz); w.scale.set(1,s,s); w.castShadow=true; g.add(w);
  }
  const tag=makeLabel('🚜 Traktor','#ffd76a',.42,false);
  tag.position.y=3; g.add(tag);
  g.position.set(6,0,20);
  scene.add(g);
  tractor={group:g,x:6,z:20};
  obstacles.push({x:6,z:20,r:1.6,tractor:true});
  tractor.proxy=hitProxy(6,20,2.2,2.6,{kind:'tractor'});
  toast('🚜 Der Traktor steht am Hof bereit!','good');
}
function updateTractor(){
  if(!tractor) return;
  const ob=obstacles.find(o=>o.tractor);
  if(player.driving){
    tractor.x=player.x; tractor.z=player.z;
    tractor.group.position.set(player.x,-.2,player.z);
    tractor.group.rotation.y=player.yaw;
    if(ob){ ob.x=1e6; ob.z=1e6; }              // fährt mit, blockiert nicht
    tractor.proxy.position.set(1e6,0,1e6);
    tractor.proxy.updateMatrixWorld();
  } else {
    tractor.group.position.set(tractor.x,0,tractor.z);
    if(ob){ ob.x=tractor.x; ob.z=tractor.z; }
    tractor.proxy.position.set(tractor.x,1.3,tractor.z);
    tractor.proxy.updateMatrixWorld();
  }
}

// ------------------------------------------------------------------ Charaktere
const CHARS=[
  {key:'manni',name:'Manni',h:1.9,x:5.4,z:24.2,color:'#ff6b4a',role:'shop',
   lines:['Waffen, Fackeln, Samen — alles da.','Nachts kommen die Bennis. Kauf lieber was.',
          'Der Traktor? Teuer. Aber er macht Spaß.']},
  {key:'jannes',name:'Jannes',h:1.88,x:11,z:22.4,color:'#4ab0ff',role:'stall',
   lines:['Ich zahle Tagespreis. Für Basketbälle auch.','Nur reife Dominiks! Matsch nehme ich nicht.',
          'Je mehr Dominiks, desto besser das Fest.']},
];
const texLoader=new THREE.TextureLoader();
const loadTex=url=>new Promise((res,rej)=>texLoader.load(url,t=>{
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  res(t);
},undefined,()=>rej(new Error('Bild fehlt: '+url))));
const billboards=[];
let benniTex=null;
function setupChars(){
  for(const c of CHARS){
    const g=new THREE.Group(); g.position.set(c.x,0,c.z);
    const asp=c.tex.image.width/c.tex.image.height;
    const bb=new THREE.Mesh(new THREE.PlaneGeometry(c.h*asp,c.h),
      new THREE.MeshLambertMaterial({map:c.tex,transparent:true,alphaTest:.5,side:THREE.DoubleSide}));
    bb.position.y=c.h/2; bb.castShadow=true; g.add(bb); billboards.push(bb);
    const tag=makeLabel(c.name,c.color,.3,false); tag.position.y=c.h+.28; g.add(tag);
    const bubble=makeLabel('','#fff',.5,false);
    bubble.position.y=c.h+1; bubble.visible=false; g.add(bubble);
    scene.add(g);
    Object.assign(c,{group:g,bb,bubble,bubbleT:0,sayT:rnd(6,16),mesh:bb});
    obstacles.push({x:c.x,z:c.z,r:.6});
    hitProxy(c.x,c.z,1.1,2.1,{kind:'char',char:c});
  }
}
function say(c,txt,ms=4200){
  const words=txt.split(' '); const lines=[]; let cur='';
  for(const w of words){ if((cur+' '+w).trim().length>28){lines.push(cur.trim());cur=w;} else cur+=' '+w; }
  if(cur.trim()) lines.push(cur.trim());
  c.bubble.material.map?.dispose();
  const tex=labelTex(lines.slice(0,3),'#fff');
  c.bubble.material.map=tex;
  const bh=.34*Math.min(lines.length,3)+.3;
  c.bubble.scale.set(bh*tex.image.width/tex.image.height,bh,1);
  c.bubble.position.y=c.h+.75+bh*.5;
  c.bubble.visible=true; c.bubbleT=ms/1000;
}

// ------------------------------------------------------------------ Bennis (Gegner)
const mobs=[];
const MOB_HP=8, MOB_SPEED=2.35, MOB_DMG=3, MOB_ATK_CD=1.4;
const mobCap=()=>Math.min(14,3+Math.floor(state.day*1.2));
function spawnMob(){
  if(!benniTex) return;
  let x,z,tries=0;
  do{
    const a=rnd(0,6.28), d=rnd(20,32);
    x=clamp(player.x+Math.cos(a)*d,BOUND.x0+2,BOUND.x1-2);
    z=clamp(player.z+Math.sin(a)*d,BOUND.z0+2,BOUND.z1-2);
  } while(litAt(x,z)&&++tries<12);
  if(litAt(x,z)) return;                       // im Fackelschein kein Spawn
  const h=1.95, asp=benniTex.image.width/benniTex.image.height;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(h*asp,h),
    new THREE.MeshLambertMaterial({map:benniTex,transparent:true,alphaTest:.5,side:THREE.DoubleSide}));
  mesh.position.set(x,h/2,z); mesh.castShadow=true;
  scene.add(mesh);
  mobs.push({x,z,hp:MOB_HP,mesh,atkCd:rnd(0,1),hurtT:0,bob:rnd(0,6)});
}
function damageMob(m,dmg){
  m.hp-=dmg; m.hurtT=.22;
  if(m.hp<=0){
    scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose();
    mobs.splice(mobs.indexOf(m),1);
    state.killed++; inv.ball++;
    SND.mobDie();
    if(state.killed%5===0) toast('🏀 '+state.killed+' Bennis vertrieben. Bälle verkaufst du bei Jannes.','good',2600);
    updateHUD();
  } else SND.hit();
}
function updateMobs(dt){
  for(let i=mobs.length-1;i>=0;i--){
    const m=mobs[i];
    if(m.hurtT>0) m.hurtT-=dt;
    m.mesh.material.color.setRGB(1,m.hurtT>0?.4:1,m.hurtT>0?.4:1);
    const dx=player.x-m.x, dz=player.z-m.z, d=Math.hypot(dx,dz)||1;
    // Tagesanbruch: Bennis verziehen sich
    if(!state.night){
      m.x-=dx/d*MOB_SPEED*1.6*dt; m.z-=dz/d*MOB_SPEED*1.6*dt;
      m.mesh.material.opacity=Math.max(0,(m.mesh.material.opacity??1)-dt*.7);
      m.mesh.material.transparent=true;
      if(d>44||m.mesh.material.opacity<=.02){
        scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose();
        mobs.splice(i,1);
      }
      m.mesh.position.set(m.x,.98,m.z);
      continue;
    }
    if(d>2.0){
      let nx=m.x+dx/d*MOB_SPEED*dt, nz=m.z+dz/d*MOB_SPEED*dt;
      for(const o of obstacles){                 // grob um Hindernisse herum
        if(o.node&&!o.node.alive) continue;
        const rr=o.r+.5;
        if((nx-o.x)**2+(nz-o.z)**2<rr*rr){ nx=m.x+(dz/d)*MOB_SPEED*dt; nz=m.z-(dx/d)*MOB_SPEED*dt; break; }
      }
      m.x=nx; m.z=nz;
      m.bob+=dt*7;
    } else {
      m.atkCd-=dt;
      if(m.atkCd<=0){
        m.atkCd=MOB_ATK_CD;
        if(player.driving){ damageMob(m,99); continue; }   // überfahren
        hurtPlayer(MOB_DMG);
      }
    }
    // Traktor walzt alles nieder
    if(player.driving&&d<2.2){ damageMob(m,99); continue; }
    m.mesh.position.set(m.x,.98+Math.abs(Math.sin(m.bob))*.06,m.z);
  }
}
function hurtPlayer(dmg){
  const real=Math.max(1,dmg-armorPoints());
  player.hp=clamp(player.hp-real,0,player.maxhp);
  player.hurtT=.35;
  SND.hurt();
  if(player.hp<=0) respawn();
  updateHUD();
}
function respawn(){
  state.deaths++;
  const lost=Math.floor(player.carry/2);
  player.carry-=lost;
  player.hp=player.maxhp;
  player.x=SHED.x; player.z=SHED.z-6; player.driving=false;
  toast('😵 Benni hat dich umgerempelt. '+(lost?lost+' Dominiks verloren.':'Nichts verloren.'),'bad',3600);
  updateHUD();
}

// ------------------------------------------------------------------ Geschosse
const shots=[];
function fireShot(){
  if(!dominikTex) return;
  const dir=new THREE.Vector3(); camera.getWorldDirection(dir);
  const mesh=new THREE.Mesh(BLOCK,new THREE.MeshLambertMaterial({map:dominikTex}));
  mesh.scale.setScalar(.42);
  mesh.position.set(player.x,1.6,player.z);
  scene.add(mesh);
  shots.push({mesh,vx:dir.x*32,vy:dir.y*32,vz:dir.z*32,life:1.6});
}
function updateShots(dt){
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];
    s.life-=dt;
    s.mesh.position.x+=s.vx*dt;
    s.mesh.position.y+=s.vy*dt-1.6*dt;
    s.mesh.position.z+=s.vz*dt;
    s.mesh.rotation.x+=dt*9; s.mesh.rotation.y+=dt*7;
    let hit=false;
    for(const m of mobs){
      if(Math.hypot(m.x-s.mesh.position.x,m.z-s.mesh.position.z)<1.1
         && Math.abs(s.mesh.position.y-1)<1.4){
        damageMob(m,WEAPONS.cannon.dmg); hit=true; break;
      }
    }
    if(hit||s.life<=0||s.mesh.position.y<0){
      scene.remove(s.mesh); s.mesh.material.dispose();
      shots.splice(i,1);
    }
  }
}
function attack(){
  if(player.atkCd>0||state.paused) return;
  const w=WEAPONS[activeWeapon()];
  player.atkCd=w.cd;
  el('cross').classList.add('swing');
  setTimeout(()=>el('cross').classList.remove('swing'),110);
  if(w.ranged){
    if(player.carry<1){ toast('🔫 Keine Dominiks als Munition!','warn',1600); SND.fail?.(); return; }
    player.carry--; fireShot(); SND.shoot(); updateHUD();
    return;
  }
  SND.swing();
  const dir=new THREE.Vector3(); camera.getWorldDirection(dir);
  let best=null,bestD=1e9;
  for(const m of mobs){
    const dx=m.x-player.x, dz=m.z-player.z, d=Math.hypot(dx,dz);
    if(d>w.range) continue;
    const dot=(dx/d)*dir.x+(dz/d)*dir.z;
    if(dot<.4) continue;                        // muss halbwegs vor dir stehen
    if(d<bestD){ bestD=d; best=m; }
  }
  if(best) damageMob(best,w.dmg);
}

// ------------------------------------------------------------------ Blöcke schreiben
function rebuildBlocks(){
  reset(D.leaf); reset(D.log); reset(D.dead); reset(D.rock);
  reset(D.torchPost); reset(D.flame);
  if(fruitMesh) reset(fruitMesh);
  for(const p of plots) p.emit();
  emitNodes(); emitTorches();
  flush(D.leaf); flush(D.log); flush(D.dead); flush(D.rock);
  flush(D.torchPost); flush(D.flame);
  if(fruitMesh) flush(fruitMesh);
  treesDirty=false;
}

// ------------------------------------------------------------------ Aktionen
function plotPrice(){ return [25,40,55,75,100,130,165,205][Math.min(upg.plots,7)]; }
function actionsFor(tg){
  if(!tg) return [];
  const out=[];
  const add=(id,ok,sub)=>out.push({id,ok:ok===true,reason:ok===true?'':ok,sub});
  if(tg.kind==='plot'){
    const p=tg.plot;
    if(!p.unlocked){ add('buyplot',state.money>=plotPrice()?true:'Zu teuer',plotPrice()+' €'); return out; }
    if(p.stage==='empty'||p.stage==='dead'){
      add('plant',inv.seed>0?true:'Keine Samen','×'+inv.seed);
      if(inv.bio>0) add('plantbio',true,'×'+inv.bio);
      return out;
    }
    if(ALIVE.includes(p.stage)){
      if(p.stage==='fruiting'||p.stage==='overripe')
        add('harvest',player.carry<bagCap()?true:'Korb voll','🍑'+p.fruits);
      if(p.pest) add('spray',inv.pest>0?true:'Kein Spray','×'+inv.pest);
      if(p.water<.95) add('water',player.can>0?true:'Kanne leer','💧'+player.can);
      if(p.over>=.15) add('trim',true,'🌿'+Math.round(p.over*100)+'%');
      if(GROWABLE.includes(p.stage)&&inv.fert>0) add('fert',true,'×'+inv.fert);
    }
    return out;
  }
  if(tg.kind==='well'){ add('refill',player.can<canCap()?true:'Kanne ist voll',player.can+'/'+canCap()); return out; }
  if(tg.kind==='stall'){
    const val=Math.round(player.carry*state.price)+inv.ball*6;
    add('sell',(player.carry||inv.ball)?true:'Nichts dabei',val?val+' €':'');
    return out;
  }
  if(tg.kind==='shop'){ add('shop',true); return out; }
  if(tg.kind==='bench'){ add('craft',true); return out; }
  if(tg.kind==='tractor'){ add(player.driving?'park':'drive',true); return out; }
  if(tg.kind==='node'){
    const n=tg.node;
    if(!n.alive) return out;
    if(n.kind==='tree') add('chop',true,'→ 🪵'); else add('mine',true,'→ 🪨');
    return out;
  }
  if(tg.kind==='ground'){
    if(inv.torch>0) add('torch',true,'×'+inv.torch);
    return out;
  }
  if(tg.kind==='char'){
    const c=tg.char;
    if(c.role==='shop') add('shop',true);
    else if(c.role==='stall'){
      const val=Math.round(player.carry*state.price)+inv.ball*6;
      add('sell',(player.carry||inv.ball)?true:'Nichts dabei',val?val+' €':'');
    }
    add('talk',true);
    return out;
  }
  return out;
}
function runAction(id,tg){
  const p=tg.plot;
  switch(id){
    case 'plant':    inv.seed--; p.plant(false); toast('🌱 Gepflanzt an Baum #'+(p.i+1),'',1600); break;
    case 'plantbio': inv.bio--;  p.plant(true);  toast('🌟 Bio-Dominik gepflanzt!','good',1600); break;
    case 'water':    p.water=1; p.wilt=0; player.can--; break;
    case 'trim':     p.over=0; treesDirty=true; break;
    case 'spray':    inv.pest--; p.pest=null; toast('🧪 Blattläuse erledigt.','good',1600); break;
    case 'fert':     inv.fert--; p.growth=clamp(p.growth+.45,0,.99); break;
    case 'harvest':{
      const space=bagCap()-player.carry;
      const avail=p.stage==='overripe'?Math.max(1,Math.ceil(p.fruits/2)):p.fruits;
      const take=Math.min(avail,space);
      player.carry+=take; state.harvested+=take;
      toast('🍑 '+take+' Dominik'+(take>1?'s':'')+' geerntet!','good',1800);
      if(p.stage==='overripe'||p.fruits-take<=0){ p.stage='mature'; p.growth=.2; p.fruits=0; p.t=0; }
      else p.fruits-=take;
      treesDirty=true;
      break;
    }
    case 'refill':   player.can=canCap(); toast('🚰 Kanne voll.','',1400); break;
    case 'sell':{
      const sum=Math.round(player.carry*state.price)+inv.ball*6;
      state.money+=sum; state.earned+=sum; state.sold+=player.carry;
      const parts=[];
      if(player.carry) parts.push(player.carry+' Dominiks');
      if(inv.ball) parts.push(inv.ball+' Basketbälle');
      toast('💰 '+parts.join(' + ')+' für '+sum+' € verkauft!','good',2600);
      const j=CHARS.find(c=>c.role==='stall');
      if(j) say(j,pick(['Geht sofort weg, danke!','Solide Ware. Tagespreis!','Das Fest wächst!']),3000);
      player.carry=0; inv.ball=0; SND.coin();
      if(state.sold&&state.sold%25===0)
        toast('🏆 '+state.sold+' Dominiks verkauft! Das Fest wird legendär.','good',3600);
      break;
    }
    case 'chop':{
      const n=tg.node; n.alive=false; n.respawn=45; treesDirty=true;
      const got=rndi(2,3); res.wood+=got; state.chopped++;
      toast('🪵 +'+got+' Holz','good',1600); SND.chop();
      break;
    }
    case 'mine':{
      const n=tg.node; n.alive=false; n.respawn=50; treesDirty=true;
      const got=rndi(1,2); res.stone+=got;
      toast('🪨 +'+got+' Stein','good',1600); SND.chop();
      break;
    }
    case 'torch':{
      if(inv.torch<1) return;
      inv.torch--;
      placeTorch(tg.point.x,tg.point.z);
      toast('🔥 Fackel gesetzt — hier spawnen keine Bennis.','good',2200);
      break;
    }
    case 'drive':  player.driving=true;  toast('🚜 Ab geht die Post!','good',1800); SND.engine(); break;
    case 'park':   dismount(); return;
    case 'shop':   openShop(); return;
    case 'craft':  openCraft(); return;
    case 'talk':   say(tg.char,pick(tg.char.lines),4200); SND.tap(); return;
    case 'buyplot':{
      const price=plotPrice();
      if(state.money<price) return;
      state.money-=price; upg.plots++;
      tg.plot.unlocked=true; treesDirty=true;
      toast('🌍 Beet #'+(tg.plot.i+1)+' gekauft!','good'); SND.coin();
      break;
    }
  }
  if(id!=='sell') SND.done();
  updateHUD();
}

// ------------------------------------------------------------------ Aufgaben
const QUESTS=[
  {t:'Pflanze einen Samen in ein Beet',   hint:'Stell dich vor ein Beet und tippe „Pflanzen"',
   at:()=>plots[0], done:()=>plots.some(p=>p.stage!=='empty'&&p.stage!=='dead')},
  {t:'Gieß den frisch gepflanzten Baum',  hint:'Wasser gibt es am Brunnen',
   at:()=>plots.find(p=>ALIVE.includes(p.stage))||plots[0], done:()=>state.q_water},
  {t:'Hack im Wald einen Baum um (🪵)',   hint:'Der Wald liegt hinter den Beeten',
   at:()=>nodes.find(n=>n.kind==='tree'&&n.alive), done:()=>res.wood>=1},
  {t:'Klopf im Steinbruch Stein ab (🪨)', hint:'Die Felsen liegen im Westen',
   at:()=>nodes.find(n=>n.kind==='rock'&&n.alive), done:()=>res.stone>=1},
  {t:'Ernte reife Dominiks 🍑',           hint:'Warte, bis der Baum Köpfe trägt',
   at:()=>plots.find(p=>p.stage==='fruiting'||p.stage==='overripe')||plots.find(p=>ALIVE.includes(p.stage)),
   done:()=>state.harvested>=1},
  {t:'Verkauf sie bei Jannes am Feststand',hint:'Der Feststand steht im Dorf',
   at:()=>({x:STALL.x,z:STALL.z}), done:()=>state.sold>=1},
  {t:'Bau dir etwas an der Werkbank 🔨',  hint:'Aus Holz und Stein wird Werkzeug',
   at:()=>({x:BENCH.x,z:BENCH.z}), done:()=>state.crafted>=1},
];
let questI=0;
const currentQuest=()=>state.tutorial?QUESTS[questI]:null;
function checkQuest(){
  if(!state.tutorial) return;
  const q=QUESTS[questI];
  if(q&&q.done()){
    questI++; SND.quest();
    if(questI>=QUESTS.length){
      state.tutorial=false;
      showModal(`<h2>🌙 Und jetzt: die Nächte</h2>
        <p>Du hast den Dreh raus. <b>Es gibt keine Frist und kein Game Over</b> — bau dir in Ruhe
        deine Plantage auf. Ziel ist einfach: möglichst viele Dominiks verkaufen.</p>
        <p>Aber: <b>nachts kommen die Bennis</b>. Sie rempeln dich um, mehr nicht — du wachst
        beim Laden wieder auf. Mit 🔥 Fackeln hältst du sie fern, mit 🏏⚔️🔫 Waffen los.</p>
        <p>Beim Laden gibt es Helm, Weste, Kanone — und einen 🚜 <b>Traktor</b>, der sie einfach überfährt.</p>
        <div class="btnrow"><button class="primary" data-act="resume">Los geht's! 🚜</button></div>`);
    } else toast('✅ Erledigt! Nächste Aufgabe: '+QUESTS[questI].t,'good',3600);
    updateQuestUI();
  }
}
function updateQuestUI(){
  const box=el('quest'), q=currentQuest();
  if(!q){ box.style.display='none'; return; }
  box.style.display='block';
  box.innerHTML=`<b>Aufgabe ${questI+1}/${QUESTS.length}</b> ${q.t}<small>${q.hint}</small>`;
}

// ------------------------------------------------------------------ Zielerfassung
const ray=new THREE.Raycaster(); ray.far=REACH;
const centre=new THREE.Vector2(0,0);
let target=null, targetSig='';
function updateTarget(){
  ray.setFromCamera(centre,camera);
  const hits=ray.intersectObjects(interactives,false);
  let tg=null;
  if(hits.length){
    const u=hits[0].object.userData;
    tg={kind:u.kind,plot:u.plot,char:u.char,node:u.node};
  } else if(inv.torch>0&&!player.driving){
    const gh=ray.intersectObject(ground,false);
    if(gh.length) tg={kind:'ground',point:gh[0].point};
  }
  target=tg;
  const acts=actionsFor(tg);
  el('cross').classList.toggle('hot',!!tg&&acts.length>0);
  const sig=tg?[tg.kind,tg.plot?tg.plot.i:'',tg.char?tg.char.key:'',tg.node?nodes.indexOf(tg.node):'',
    acts.map(a=>a.id+(a.ok?'1':'0')+(a.sub||'')).join(',')].join('|'):'';
  if(sig!==targetSig){ targetSig=sig; renderTargetUI(tg,acts); }
  else if(tg&&acts.length) updateTargetName(tg);
  if(player.act){
    const still=acts.find(a=>a.id===player.act.id&&a.ok);
    if(!still||player.act.tg.plot!==tg?.plot||player.act.tg.kind!==tg?.kind
       ||player.act.tg.node!==tg?.node) cancelAction();
  }
}
const tgEl=el('target'), tName=el('tname'), tActs=el('tacts');
let actEls=[], nameCache='';
function targetLabel(tg){
  if(tg.kind==='plot') return tg.plot.label();
  if(tg.kind==='well') return ['🚰 Brunnen','Gießkanne auffüllen'];
  if(tg.kind==='stall') return ['💰 Feststand','Dominik: '+Math.round(state.price)+' € · Ball: 6 €'];
  if(tg.kind==='shop') return ['🛒 Laden','Waffen, Fackeln, Samen'];
  if(tg.kind==='bench') return ['🔨 Werkbank','Werkzeug aus 🪵 und 🪨'];
  if(tg.kind==='tractor') return ['🚜 Traktor',player.driving?'Du fährst gerade':'Doppelt so schnell'];
  if(tg.kind==='ground') return ['🔥 Boden','Fackel setzen'];
  if(tg.kind==='node') return tg.node.kind==='tree'?['🌲 Waldbaum','Gibt Holz']:['🪨 Fels','Gibt Stein'];
  if(tg.kind==='char') return [tg.char.name,{shop:'Ladenbesitzer',stall:'Aufkäufer'}[tg.char.role]];
  return ['',''];
}
function updateTargetName(tg){
  const [title,sub]=targetLabel(tg);
  const h=title+'<small>'+(sub||'')+'</small>';
  if(h!==nameCache){ nameCache=h; tName.innerHTML=h; }
}
function renderTargetUI(tg,acts){
  if(!tg||!acts.length){ tgEl.classList.add('hidden'); actEls=[]; nameCache=''; return; }
  tgEl.classList.remove('hidden');
  updateTargetName(tg);
  tActs.innerHTML=''; actEls=[];
  acts.slice(0,4).forEach((a,i)=>{
    const d=ACTS[a.id];
    const b=document.createElement('div');
    b.className='act key'+(a.ok?'':' off')+(i===0?' prim':'');
    b.dataset.key=i===0?'E':(i+1);
    b.innerHTML=`<div class="prog"></div><span class="ic">${d.ic}</span>`+
      `<span class="tx">${a.ok?d.label:d.label+' — '+a.reason}</span>`+
      `<span class="sub">${a.sub||''}</span>`;
    b.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();startAction(a);});
    tActs.appendChild(b);
    actEls.push({el:b,a});
  });
}
function startAction(a){
  ac();
  if(!a.ok){ toast('⛔ '+a.reason,'warn',1800); return; }
  if(state.paused) return;
  const d=ACTS[a.id];
  if(d.dur<=0){ runAction(a.id,target); return; }
  player.act={id:a.id,t:0,dur:d.dur*(a.id==='trim'?trimMul():1),tg:target};
  SND.work();
}
function cancelAction(){
  if(!player.act) return;
  player.act=null;
  for(const {el:e} of actEls) e.querySelector('.prog').style.width='0';
}
function updateAction(dt){
  if(!player.act) return;
  player.act.t+=dt;
  const pct=clamp(player.act.t/player.act.dur,0,1);
  const cur=actEls.find(x=>x.a.id===player.act.id);
  if(cur) cur.el.querySelector('.prog').style.width=(pct*100)+'%';
  if(player.act.t%.3<dt) (player.act.id==='chop'||player.act.id==='mine')?SND.chop():SND.work();
  if(pct>=1){
    const id=player.act.id, tg=player.act.tg;
    player.act=null;
    if(cur) cur.el.querySelector('.prog').style.width='0';
    if(id==='water') state.q_water=true;
    runAction(id,tg);
    targetSig='';
    checkQuest();
  }
}

// ------------------------------------------------------------------ Eingabe
const isTouch=matchMedia('(pointer: coarse)').matches;
const keys={};
const move={x:0,y:0};
let stickId=null,stickOx=0,stickOy=0,lookId=null,lookX=0,lookY=0;
const stickEl=el('stick');
const layer=el('touchlayer');

layer.addEventListener('pointerdown',e=>{
  ac(); startGameIfNeeded();
  try{ layer.setPointerCapture(e.pointerId); }catch(err){}
  if(e.pointerType==='mouse'&&!isTouch){
    if(document.pointerLockElement===renderer.domElement){ attack(); return; }
    lookId=e.pointerId; lookX=e.clientX; lookY=e.clientY;
    renderer.domElement.requestPointerLock?.();
    return;
  }
  if(e.clientX<innerWidth*.5&&stickId===null){
    stickId=e.pointerId; stickOx=e.clientX; stickOy=e.clientY;
    stickEl.style.left=(e.clientX-59)+'px'; stickEl.style.top=(e.clientY-59)+'px';
    stickEl.classList.add('on');
  } else if(lookId===null){
    lookId=e.pointerId; lookX=e.clientX; lookY=e.clientY;
  }
});
layer.addEventListener('pointermove',e=>{
  if(e.pointerId===stickId){
    const dx=e.clientX-stickOx, dy=e.clientY-stickOy, d=Math.hypot(dx,dy), max=52;
    const k=d>max?max/d:1;
    move.x=clamp(dx/max,-1,1); move.y=clamp(dy/max,-1,1);
    stickEl.querySelector('.knob').style.transform=`translate(${dx*k}px,${dy*k}px)`;
  } else if(e.pointerId===lookId){
    if(document.pointerLockElement) return;
    const s=.0042;
    player.yaw-=(e.clientX-lookX)*s;
    player.pitch=clamp(player.pitch-(e.clientY-lookY)*s,-1.45,1.45);
    lookX=e.clientX; lookY=e.clientY;
  }
});
const endPointer=e=>{
  if(e.pointerId===stickId){
    stickId=null; move.x=move.y=0;
    stickEl.classList.remove('on');
    stickEl.querySelector('.knob').style.transform='';
  }
  if(e.pointerId===lookId) lookId=null;
};
layer.addEventListener('pointerup',endPointer);
layer.addEventListener('pointercancel',endPointer);
document.addEventListener('mousemove',e=>{
  if(document.pointerLockElement===renderer.domElement){
    player.yaw-=e.movementX*.0022;
    player.pitch=clamp(player.pitch-e.movementY*.0022,-1.45,1.45);
  }
});
addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(e.code==='Escape'&&document.pointerLockElement) document.exitPointerLock();
  if(['KeyE','Space','Digit1','Digit2','Digit3','Digit4'].includes(e.code)){
    e.preventDefault(); startGameIfNeeded();
    const i=e.code==='KeyE'||e.code==='Space'?0:+e.code.slice(5)-1;
    if(actEls[i]) startAction(actEls[i].a);
  }
  if(e.code==='KeyF'){ e.preventDefault(); attack(); }
  if(e.code==='KeyR'){ e.preventDefault(); dismount(); }
  if(e.code==='KeyP') togglePause();
});
addEventListener('keyup',e=>{keys[e.code]=false;});
el('fight').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();ac();attack();});
el('exitcar').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();dismount();});
function dismount(){
  if(!player.driving) return;
  player.driving=false;
  toast('🅿️ Traktor abgestellt.','',1600);
  updateHUD();
}

// ------------------------------------------------------------------ Bewegung
function updatePlayer(dt){
  let mx=move.x, mz=move.y;
  if(keys.KeyW||keys.ArrowUp) mz-=1;
  if(keys.KeyS||keys.ArrowDown) mz+=1;
  if(keys.KeyA||keys.ArrowLeft) mx-=1;
  if(keys.KeyD||keys.ArrowRight) mx+=1;
  const len=Math.hypot(mx,mz);
  if(len>1){ mx/=len; mz/=len; }
  const sprint=(keys.ShiftLeft||keys.ShiftRight)?1.45:1;
  const base=player.driving?11.5:walkSpeed();
  const sp=base*sprint*(state.paused?0:1);
  const sin=Math.sin(player.yaw), cos=Math.cos(player.yaw);
  let dx=(mx*cos+mz*sin)*sp*dt;
  let dz=(-mx*sin+mz*cos)*sp*dt;
  const speed=Math.hypot(dx,dz)/Math.max(dt,1e-4);
  const R=player.driving?1.1:.5;
  let nx=player.x+dx, nz=player.z+dz;
  for(const o of obstacles){
    if(o.node&&!o.node.alive) continue;
    const rr=o.r+R;
    if(Math.abs(nx-o.x)<rr&&Math.abs(player.z-o.z)<rr&&
       (nx-o.x)**2+(player.z-o.z)**2<rr*rr) nx=player.x;
    if(Math.abs(player.x-o.x)<rr&&Math.abs(nz-o.z)<rr&&
       (player.x-o.x)**2+(nz-o.z)**2<rr*rr) nz=player.z;
  }
  player.x=clamp(nx,BOUND.x0,BOUND.x1);
  player.z=clamp(nz,BOUND.z0,BOUND.z1);
  if(speed>.4&&!state.paused){
    player.bob+=dt*speed*(player.driving?.7:1.5);
    player.stepT+=dt*speed;
    if(player.stepT>3.1){ player.stepT=0; player.driving?SND.engine():SND.step(); }
  } else player.bob+=dt*.6;
  const bobY=Math.sin(player.bob)*(speed>.4?.045:.012);
  camera.position.set(player.x,(player.driving?2.6:1.7)+bobY,player.z);
  camera.rotation.set(0,0,0);
  camera.rotateY(player.yaw);
  camera.rotateX(player.pitch);
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  if(player.atkCd>0) player.atkCd-=dt;
  if(player.hurtT>0){ player.hurtT-=dt; el('hurt').style.opacity=Math.max(0,player.hurtT); }
  else el('hurt').style.opacity=0;
}

// ------------------------------------------------------------------ NPCs
const _wp=new THREE.Vector3();
function updateChars(dt){
  for(const c of CHARS){
    if(state.paused) continue;
    c.sayT-=dt;
    if(c.sayT<=0){ c.sayT=rnd(18,36);
      if(Math.hypot(player.x-c.group.position.x,player.z-c.group.position.z)<16)
        say(c,pick(c.lines),4000);
    }
    if(c.bubbleT>0){ c.bubbleT-=dt; if(c.bubbleT<=0) c.bubble.visible=false; }
  }
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

// ------------------------------------------------------------------ Tag & Nacht
function spawnPests(dt){
  if(state.tutorial) return;
  const active=plots.filter(p=>p.pest).length;
  if(active>=2) return;
  for(const p of plots){
    if(!p.unlocked||p.pest) continue;
    if(!['young','mature','blossom','fruiting','overripe'].includes(p.stage)) continue;
    if(Math.random()<dt*.0016){
      p.pest={ttl:PEST_TTL,max:PEST_TTL};
      toast('🪲 Blattläuse an Baum #'+(p.i+1)+'. Kein Stress, aber sie fressen die Ernte.','warn',3600);
      return;
    }
  }
}
let mobTimer=0;
function updateNight(dt){
  const wasNight=state.night;
  state.night=state.dayT>=NIGHT_START&&state.dayT<NIGHT_END;
  if(state.night&&!wasNight&&!state.tutorial){
    toast('🌙 Nacht '+state.day+' — die Bennis kommen!','bad',3600); SND.night();
  }
  if(!state.night&&wasNight){
    toast('🌅 Morgen. Die Bennis verziehen sich.','good',3000); SND.dawn();
  }
  if(state.night&&!state.tutorial){
    mobTimer-=dt;
    if(mobTimer<=0){
      mobTimer=rnd(2.5,5);
      if(mobs.length<mobCap()) spawnMob();
    }
  }
}
function newDay(){
  state.day++;
  toast('☀️ Tag '+state.day+' bricht an.','',2600);
}

// ------------------------------------------------------------------ HUD
const HOT=[
  {ic:'💧',get:()=>player.can+'/'+canCap(),warn:()=>player.can===0},
  {ic:'🍑',get:()=>player.carry+'/'+bagCap(),warn:()=>player.carry>=bagCap()},
  {ic:'🌱',get:()=>inv.seed},
  {ic:'🪵',get:()=>res.wood},
  {ic:'🪨',get:()=>res.stone},
  {ic:'🔥',get:()=>inv.torch},
  {ic:'🏀',get:()=>inv.ball},
];
let hotEls=null, hotCache='';
function buildHotbar(){
  const box=el('hotbar');
  box.innerHTML='';
  hotEls=HOT.map(h=>{
    const d=document.createElement('div');
    d.className='slot';
    d.innerHTML=`<span class="i">${h.ic}</span><span class="n"></span>`;
    box.appendChild(d);
    return d;
  });
}
function updateHUD(){
  el('hMoney').textContent=state.money;
  el('hSold').textContent=state.sold;
  el('hPrice').textContent=Math.round(state.price);
  el('hDay').textContent=(state.night?'🌙 ':'☀️ ')+state.day;
  // Herzen
  const hearts=el('hearts');
  const full=Math.ceil(player.hp/2), max=player.maxhp/2;
  let hs='';
  for(let i=0;i<max;i++) hs+=i<full?'❤️':'🖤';
  if(hearts.textContent!==hs) hearts.textContent=hs;
  // Waffe
  const w=WEAPONS[activeWeapon()];
  el('weapon').innerHTML=w.ic+'<span>'+w.nm+(w.ranged?' 🍑'+player.carry:'')+'</span>';
  el('fight').style.display=(mobs.length||state.night)?'flex':'none';
  el('exitcar').style.display=player.driving?'flex':'none';
  el('fight').textContent=w.ic;
  const sig=HOT.map(h=>h.get()).join('|');
  if(sig!==hotCache){
    hotCache=sig;
    HOT.forEach((h,i)=>{
      hotEls[i].querySelector('.n').textContent=h.get();
      hotEls[i].classList.toggle('warn',!!(h.warn&&h.warn()));
    });
  }
}
const alertPool=[];
const _av=new THREE.Vector3();
function updateAlerts(){
  const box=el('alerts');
  let n=0;
  const cw=innerWidth, ch=innerHeight;
  const marks=[];
  for(const p of plots){
    if(!p.unlocked) continue;
    const a=p.alerts;
    if(a.length) marks.push({x:p.x,y:p.canopyY,z:p.z,ic:a[0],tag:'#'+(p.i+1)});
  }
  const q=currentQuest();
  if(q&&q.at){ const t=q.at(); if(t) marks.push({x:t.x,y:2.4,z:t.z,ic:'⭐',tag:'Ziel',always:true}); }
  for(const m of mobs){
    if(Math.hypot(m.x-player.x,m.z-player.z)<26) marks.push({x:m.x,y:2,z:m.z,ic:'🏀',tag:''});
  }
  for(const m of marks){
    _av.set(m.x,m.y,m.z).project(camera);
    const behind=_av.z>1;
    const onScreen=!behind&&Math.abs(_av.x)<.95&&Math.abs(_av.y)<.95;
    if(onScreen&&!m.always) continue;
    let ex=_av.x, ey=_av.y, px, py;
    if(onScreen){ px=cw/2+ex*cw/2; py=ch/2-ey*ch/2; }
    else {
      if(behind){ ex=-ex; ey=-ey; }
      const len=Math.max(Math.abs(ex),Math.abs(ey))||1;
      ex/=len; ey/=len;
      px=cw/2+ex*cw*.44; py=ch/2-ey*ch*.40;
    }
    let e=alertPool[n];
    if(!e){ e=document.createElement('div'); e.className='alert'; box.appendChild(e); alertPool[n]=e; }
    e.style.display='block';
    e.innerHTML=m.ic+(m.tag?'<b>'+m.tag+'</b>':'');
    e.style.left=clamp(px,30,cw-30)+'px';
    e.style.top =clamp(py,58,ch-96)+'px';
    n++;
  }
  for(let i=n;i<alertPool.length;i++) alertPool[i].style.display='none';
}

// ------------------------------------------------------------------ Fenster
const modal=el('modal'), mbox=el('mbox');
function showModal(html){ mbox.innerHTML=html; modal.classList.remove('hidden'); state.paused=true;
  if(document.pointerLockElement) document.exitPointerLock(); }
function hideModal(){ modal.classList.add('hidden'); state.paused=false; }
function openShop(){
  let h='<h2>🛒 Mannis Laden</h2><div id="shopmoney">💰 '+state.money+' €</div><div class="cols">';
  for(const it of SHOP){
    const bought=it.one&&owned[it.id];
    const pr=it.price();
    h+=`<div class="shopitem"><div class="ico">${it.ico}</div><div class="txt">
      <div class="nm">${it.nm}</div><div class="ds">${it.ds}</div><div class="own">${it.own()}</div></div>
      <button data-buy="${it.id}" ${bought||pr>state.money?'disabled':''}>${bought?'✔':pr+' €'}</button></div>`;
  }
  h+='</div><p style="opacity:.75;font-size:11.5px;margin-top:8px">🔨 Werkzeug und Fackeln baust du '+
     'günstiger an der Werkbank. Freie Beete kaufst du draußen am Schild.</p>'+
     '<div class="btnrow"><button class="primary" data-act="close">Zurück 🚜</button></div>';
  showModal(h);
}
function openCraft(){
  let h='<h2>🔨 Werkbank</h2><div id="shopmoney">🪵 '+res.wood+'   🪨 '+res.stone+'   🍑 '+player.carry+'</div><div class="cols">';
  for(const r of RECIPES){
    const st=canCraft(r);
    const cost=Object.entries(r.cost).map(([k,v])=>v+'× '+RESNAME[k]).join(' + ');
    const lvl=r.max!=null?(r.max===1?(r.lvl()?'gebaut ✔':'—'):`Stufe ${r.lvl()}/${r.max}`):(r.out||'');
    h+=`<div class="shopitem"><div class="ico">${r.ic}</div><div class="txt">
      <div class="nm">${r.nm}</div><div class="ds">${r.ds}</div>
      <div class="own">${cost} → ${lvl}</div></div>
      <button data-craft="${r.id}" ${st===true?'':'disabled'}>${st==='max'?'✔':'Bauen'}</button></div>`;
  }
  h+='</div><div class="btnrow"><button class="primary" data-act="close">Zurück 🚜</button></div>';
  showModal(h);
}
mbox.addEventListener('pointerdown',e=>{
  const b=e.target.closest('button'); if(!b) return;
  e.stopPropagation();
  if(b.dataset.buy){
    const it=SHOP.find(s=>s.id===b.dataset.buy), pr=it.price();
    if(it.one&&owned[it.id]) return;
    if(state.money>=pr){ state.money-=pr; it.buy(); SND.coin();
      toast('🛒 Gekauft: '+it.nm,'good',1600); updateHUD(); openShop(); }
  } else if(b.dataset.craft){
    const r=RECIPES.find(x=>x.id===b.dataset.craft);
    if(canCraft(r)!==true) return;
    for(const k in r.cost){
      if(k==='wood') res.wood-=r.cost[k];
      else if(k==='stone') res.stone-=r.cost[k];
      else if(k==='dominik') player.carry-=r.cost[k];
    }
    r.give(); state.crafted++; SND.craft();
    toast('🔨 Gebaut: '+r.nm,'good',1800);
    updateHUD(); openCraft(); checkQuest();
  }
  else if(b.dataset.act==='close'||b.dataset.act==='resume'){ hideModal(); }
  else if(b.dataset.act==='start'){ localStorage.setItem('edf3d_tut','1'); hideModal(); state.started=true; }
  else if(b.dataset.act==='classic'){ location.href='./2d.html'; }
  else if(b.dataset.act==='heal'){
    if(inv.medkit>0){ inv.medkit--; player.hp=clamp(player.hp+10,0,player.maxhp);
      toast('❤️ Verbunden.','good',1600); updateHUD(); }
    hideModal();
  }
});
function showIntro(){
  const ctrl=isTouch
    ? 'Links wischen = laufen · rechts wischen = umsehen · Aktionen rechts unten antippen.'
    : 'WASD laufen · Maus umsehen · <b>E</b> Aktion · <b>F</b> zuschlagen.';
  showModal(`<h2>🌳 ErnteDominiksFest</h2>
  <p style="font-size:14px">Züchte Dominiks auf Bäumen, ernte die Köpfe und verkauf sie im Dorf.
  <b>Kein Zeitdruck, kein Game Over.</b></p>
  <p style="font-size:13px;opacity:.9">${ctrl}</p>
  <p style="font-size:13px">Oben steht, <b>was als Nächstes zu tun ist</b> — ein ⭐ zeigt den Weg.
  Nachts wird es ungemütlich: dann kommen die Bennis.</p>
  <div class="btnrow">
    <button data-act="classic" style="background:#2f4f2f;flex:0 0 auto;font-size:12.5px">2D 🕹️</button>
    <button class="primary" data-act="start">Loslegen 🚜</button>
  </div>`);
}
function togglePause(){
  if(modal.classList.contains('hidden')){
    const best=Math.max(state.sold,+(localStorage.getItem('edf3d_sold')||0));
    localStorage.setItem('edf3d_sold',best);
    showModal(`<h2>⏸️ Pause</h2>
      <p>📊 <b>${state.sold}</b> Dominiks verkauft (Rekord: ${best}) · <b>${state.earned} €</b> Umsatz ·
      🏀 ${state.killed} Bennis vertrieben · Tag ${state.day}.</p>
      <div class="btnrow">
        ${inv.medkit>0?'<button data-act="heal">❤️ Verbandskasten ('+inv.medkit+')</button>':''}
        <button class="primary" data-act="resume">Weiter 🚜</button></div>`);
  } else hideModal();
}
el('btnPause').addEventListener('pointerdown',e=>{e.stopPropagation();togglePause();});
el('btnHelp').addEventListener('pointerdown',e=>{e.stopPropagation();showIntro();});
function startGameIfNeeded(){
  if(!state.started&&modal.classList.contains('hidden')){ state.started=true; state.paused=false; }
}

// ------------------------------------------------------------------ Licht
const C={dayTop:new THREE.Color(0x3f86c8),evTop:new THREE.Color(0xd97b3a),nTop:new THREE.Color(0x0b1030),
  dayBot:new THREE.Color(0xbfe0ef),evBot:new THREE.Color(0xf0b070),nBot:new THREE.Color(0x141c38),
  sunDay:new THREE.Color(0xfff3d6),sunEv:new THREE.Color(0xffb070),moon:new THREE.Color(0x9fb4ff),
  top:new THREE.Color(),bot:new THREE.Color()};
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
  scene.fog.color.copy(bot);
  renderer.setClearColor(bot);
  sun.intensity=lerp(2.0,.35,night);
  sun.color.copy(C.sunDay).lerp(C.sunEv,warm*.8).lerp(C.moon,night);
  hemi.intensity=lerp(1.25,.42,night);   // nachts dunkel, aber spielbar
  const ang=Math.PI*(.15+d*.7);
  sun.position.set(Math.cos(ang)*44,Math.max(10,Math.sin(ang)*48),16);
}

// ------------------------------------------------------------------ Schleife
function update(dt){
  if(!state.paused){
    state.t+=dt;
    state.dayT+=dt/DAYLEN;
    if(state.dayT>=1){ state.dayT=0; newDay(); }
    el('daybar').style.width=(state.dayT*100)+'%';
    state.priceT+=dt;
    if(state.priceT>=2){
      state.priceT=0;
      state.price=clamp(state.price+rnd(-1,1)*1.6,7,26);
      el('hPrice').textContent=Math.round(state.price);
    }
    updateNight(dt);
    spawnPests(dt);
    for(const p of plots) p.update(dt);
    updateNodes(dt);
    updateMobs(dt);
    updateShots(dt);
    updateAction(dt);
    state.checkT+=dt;
    if(state.checkT>=.5){ state.checkT=0; checkQuest(); updateHUD(); }
  } else {
    for(const p of plots) p.update(0);
  }
  if(treesDirty) rebuildBlocks();
  updatePlayer(dt);
  updateTractor();
  updateChars(dt);
  updateBillboards();
  updateTarget();
  updateAlerts();
  updateSky();
}
let last=performance.now();
function frame(now){
  let dt=Math.min((now-last)/1000,.1); last=now;
  dt*=(window.__speed||1);
  update(dt);
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.updateProjectionMatrix();
}
addEventListener('resize',resize);
addEventListener('orientationchange',()=>setTimeout(resize,250));

// ------------------------------------------------------------------ Start
Promise.all([
  ...CHARS.map(c=>loadTex(c.key+'.png').then(t=>{c.tex=t;})),
  loadTex('benni.png').then(t=>{benniTex=t;}),
  loadTex('dominik.png').then(t=>{makeFruitBatch(t.image);}),
]).then(()=>{
  setupChars();
  buildHotbar();
  rebuildBlocks();
  resize(); updateHUD(); updateQuestUI();
  el('boot').remove();
  el('hint').innerHTML=isTouch?'':'WASD laufen · Maus umsehen<br>E Aktion · F schlagen · P Pause';
  if(localStorage.getItem('edf3d_tut')){ state.paused=false; state.started=true; }
  else showIntro();
  requestAnimationFrame(frame);
}).catch(e=>{
  el('boot').innerHTML='😢 '+e.message;
  console.error(e);
});

// ------------------------------------------------------------------ Debug-API
window.game={state,inv,res,upg,owned,plots,player,CHARS,nodes,mobs,torches,RECIPES,SHOP,WEAPONS,
  get target(){return target;},
  get quest(){return questI;},
  get tractor(){return tractor;},
  actionsFor,runAction,openShop,openCraft,checkQuest,attack,spawnMob,hurtPlayer,placeTorch,dismount,
  rebuild(){ treesDirty=true; },
  get counts(){ return {fruit:fruitMesh?fruitMesh.count:-1,leaf:D.leaf.count,
    log:D.log.count,rock:D.rock.count,flame:D.flame.count}; },
  sync(){ updatePlayer(0); updateTarget(); },
  updateTarget(){ updatePlayer(0); updateTarget(); },
  setMove(x,y){ move.x=x; move.y=y; },
  setDayT(v){ state.dayT=v; updateNight(0); },
  tp(x,z,yaw){ player.x=x; player.z=z; if(yaw!=null) player.yaw=yaw; this.sync(); },
  lookAt(x,z){ player.yaw=Math.atan2(player.x-x,player.z-z); player.pitch=0; this.sync(); },
  act(id){ const a=actionsFor(target).find(v=>v.id===id); if(a) startAction(a); return !!a; },
  tick(sec){ const s=.05; for(let t=0;t<sec;t+=s) update(s); },
};
