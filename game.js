/* =====================================================================
   ErnteDominiksFest — Klötzchen-Survival
   Abbauen, bauen, überleben. Ziel: die Dominik-Suppe kochen.
   Rezepte gibt es bei den Jannessen: sie wollen Dominiks, Pilze oder
   fertige Gerichte und zeigen dafür ein Rezept — als Bild, nicht als Text.
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
  dig:()=>tone(150+Math.random()*70,.05,'square',.045),
  pop:()=>{tone(523,.07,'triangle',.08);tone(784,.09,'triangle',.08,.06);},
  place:()=>tone(240,.07,'square',.06),
  craft:()=>{tone(392,.09,'square',.08);tone(587,.09,'square',.08,.08);tone(784,.14,'square',.08,.16);},
  eat:()=>{tone(300,.08,'triangle',.07);tone(240,.1,'triangle',.06,.09);},
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

// ------------------------------------------------------------------ Welt-Eckdaten
const DAYLEN=200;                       // Sekunden pro Tag/Nacht-Zyklus
const NIGHT_START=.60, NIGHT_END=.94;   // Nachtfenster
const REACH=4.6;
const BOUND={x0:-72,x1:72,z0:-72,z1:72};
const HOME={x:0,z:5,r:26,fade:13};      // flaches Starttal
const SEA=0;                            // Wasserspiegel der Flüsse
const RIVER_BED=-2, RIVER_W=4.5;
const BEDROCK=-12;                      // tiefer geht es nicht — hier ist Schluss
const SPAWN={x:0,z:18};

// ------------------------------------------------------------------ Geländeform
function hash2(x,z,s){
  let h=Math.imul(x|0,374761393)+Math.imul(z|0,668265263)+Math.imul(s|0,1274126177)|0;
  h=Math.imul(h^h>>>13,1274126177);
  return ((h^h>>>16)>>>0)/4294967296;
}
function vnoise(x,z,scale,seed){
  const fx=x/scale, fz=z/scale;
  const x0=Math.floor(fx), z0=Math.floor(fz);
  const tx=fx-x0, tz=fz-z0;
  const sx=tx*tx*(3-2*tx), sz=tz*tz*(3-2*tz);
  return lerp(lerp(hash2(x0,z0,seed),  hash2(x0+1,z0,seed),  sx),
              lerp(hash2(x0,z0+1,seed),hash2(x0+1,z0+1,seed),sx),sz);
}
// Zwei Flüsse: einer von Nord nach Süd im Westen, einer quer im Norden.
const riverAX=z=>-46+(vnoise(0,z,26,7)-.5)*20;
const riverBZ=x=>-47+(vnoise(x,0,24,8)-.5)*18;
function riverAt(x,z){
  const ax=riverAX(z), bz=riverBZ(x);
  const da=Math.abs(x-ax), db=Math.abs(z-bz);
  return da<db
    ? {d:da,bed:vnoise(0,z, 19, 9)>.52?SEA-1:RIVER_BED}
    : {d:db,bed:vnoise(x,0,19,10)>.52?SEA-1:RIVER_BED};
}
// Das Land hinter den Flüssen — nur über eine Furt zu erreichen. Dort und
// nur dort wächst der 🌶️ Pfeffer.
const beyondRiver=(x,z)=>x<riverAX(z)-RIVER_W-1||z<riverBZ(x)-RIVER_W-1;
function rawHeight(x,z){
  let h=vnoise(x,z,38,1)*7-2.2;                 // weite Hügel
  h+=vnoise(x,z,14,2)*2.6;                      // feine Wellen
  const m=vnoise(x,z,62,3);                     // Gebirgsmaske
  if(m>.56) h+=((m-.56)/.44)**2.2*27;
  return h;
}
const VILLAGES=[{x:21,z:52},{x:44,z:-26},{x:50,z:24}]
  .map(v=>({...v,y:clamp(Math.round(rawHeight(v.x,v.z)),1,6)}));
const VILL_R=14, VILL_FADE=11;
const _hCache=new Map();
// Oberkante der Säule: fester Grund liegt bei y < terrainH, gelaufen wird auf terrainH.
function terrainH(x,z){
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
function surfaceTex(x,z,h){
  if(h<=SEA-1) return 'sand';
  if(h>=18) return 'snow';
  if(h>=9)  return 'rock';
  if(h<=SEA+1&&riverAt(x,z).d<RIVER_W+3.5) return 'sand';
  return 'grass';
}

// ------------------------------------------------------------------ Zustand
const state={t:0,day:1,dayT:.06,night:false,paused:true,started:false,
  mined:0,placed:0,killed:0,deaths:0,crafted:0,chests:0,trades:0,won:false,checkT:0,
  spikes:0};                            // verworfene Maus-Ausreisser, siehe unten

const player={x:0,z:18,y:0,viewY:0,vy:0,onGround:true,yaw:0,pitch:-.05,
  hp:20,maxhp:20,food:20,maxfood:20,regenT:0,starveT:0,
  bob:0,stepT:0,atkCd:0,hurtT:0,invT:0,fallFrom:0,sel:0};

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
  // Salzader: Fels mit hellen Kristallnestern — im Dunkeln gut zu erkennen.
  saltore:noiseTex(['#8e8e8e','#828282','#9a9a9a','#787878'],24,g=>{
    for(const [x,y] of [[2,3],[9,2],[11,7],[4,9],[6,12],[13,11]]){
      g.fillStyle='#f4f6ff'; g.fillRect(x,y,2,2);
      g.fillStyle='#c9d2ea'; g.fillRect(x,y+1,1,1); g.fillRect(x+1,y,1,1);
    }
  }),
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
  shroom :noiseTex(['#c3352e','#b02c26','#d43e36'],43,(g,s)=>{
    g.fillStyle='#f2ece0';
    g.fillRect(3,3,3,3); g.fillRect(10,5,3,3); g.fillRect(6,10,3,3);
    g.fillStyle='#e8dcc0'; g.fillRect(0,12,s,4);
  }),
  note   :noiseTex(['#e6d9b4','#ddcea3','#efe4c6'],45,(g,s)=>{
    g.fillStyle='#8a7245'; g.fillRect(0,0,s,1); g.fillRect(0,s-1,s,1);
    g.fillRect(0,0,1,s); g.fillRect(s-1,0,1,s);
    g.fillStyle='#6b5a3a';
    for(let y=4;y<12;y+=3) g.fillRect(3,y,9-(y&2),1);
    g.fillStyle='#b03a2e'; g.fillRect(10,12,3,3);      // Wachssiegel
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
// tex   Texturname · hard Abbauzeit in Sekunden · drop Item-Id beim Abbau
const BLOCKS={
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
  chest  :{tex:'chest', hard:0,   drop:null,     nm:'Truhe',   use:'chest', noBreak:true},
  dominik:{tex:'dominik',hard:.5, drop:'dominik',nm:'Dominik',
           cross:true, size:.85, alpha:true, pass:true},
  shroom :{tex:'shroom',hard:.25, drop:'mushroom',nm:'Pilz'},
  pepper :{tex:'pepper',hard:.25, drop:'pepper', nm:'Pfefferstrauch',
           cross:true, alpha:true, pass:true},
  saltore:{tex:'saltore',hard:2.6,drop:'salt',   nm:'Salzader', pick:true},
  bedrock:{tex:'bedrock',hard:0,  drop:null,     nm:'Grundgestein', noBreak:true},
  lore   :{tex:'note',  hard:0,   drop:null,     nm:'Alte Notiz', use:'lore', noBreak:true},
};
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
  sword   :{ic:'⚔️',nm:'Steinschwert',dmg:6},
  axe     :{ic:'🪓',nm:'Steinaxt',    dmg:4, axe:true},
  pick    :{ic:'⛏️',nm:'Spitzhacke',  dmg:3, pick:true},
  compote :{ic:'🍯',nm:'Dominik-Kompott',food:8},
  panfry  :{ic:'🍳',nm:'Pilzpfanne',  food:10},
  soup    :{ic:'🍲',nm:'Dominik-Suppe',food:20},
};

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
const RECIPES=[
  {id:'plank', rank:0, out:['plank',4], shapeless:['log']},
  {id:'stick', rank:1, out:['stick',4], pat:['P','P'],     key:{P:'plank'}},
  {id:'bench', rank:2, out:['bench',1], pat:['PP','PP'],   key:{P:'plank'}},
  {id:'torch', rank:3, out:['torch',4], pat:['S','K'],     key:{S:'stone',K:'stick'}},
  {id:'brick', rank:4, out:['brick',4], pat:['SA','AS'],   key:{S:'stone',A:'sand'}},
  {id:'bowl',  rank:5, out:['bowl',2],  pat:['P P',' P '], key:{P:'plank'}},
  {id:'sword', rank:6, out:['sword',1], pat:['S','S','K'], key:{S:'stone',K:'stick'}},
  {id:'pick',  rank:7, out:['pick',1],  pat:['SSS',' K ',' K '], key:{S:'stone',K:'stick'}},
  {id:'axe',   rank:8, out:['axe',1],   pat:['SS ','SK ',' K '], key:{S:'stone',K:'stick'}},
  {id:'pot',   rank:9, out:['pot',1],   pat:['S S','S S','SPS'], key:{S:'stone',P:'plank'}},
  // Gerichte. Sie entstehen nur am Kochtopf und nur mit Rezept — das gibt es
  // bei den Jannessen, nicht durch Herumprobieren.
  {id:'compote',rank:10,out:['compote',1], pat:['DAD',' B '],
   key:{D:'dominik',A:'salt',B:'bowl'}, station:'pot', secret:true},
  {id:'panfry', rank:11,out:['panfry',1],  pat:['MFM',' B '],
   key:{M:'mushroom',F:'pepper',B:'bowl'}, station:'pot', secret:true},
  {id:'soup',  rank:99,out:['soup',1],  pat:['DDD','MAM','FBF'],
   key:{D:'dominik',M:'mushroom',A:'salt',F:'pepper',B:'bowl'}, station:'pot', secret:true},
];

// ------------------------------------------------------------------ Bildchen
// Für jeden Gegenstand liegt ein Sprite unter sprites/items/<id>.png. Das
// Emoji bleibt als alt-Text stehen: fehlt der Ordner (oder lädt eine Datei
// nicht), zeigt der Browser wieder Emoji statt eines kaputten Bildes.
const ICONS=new Set(['dirt','stone','sand','snow','log','plank','brick','bench','pot','torch',
                     'stick','bowl','dominik','mushroom','salt','pepper','sword','axe','pick',
                     'compote','panfry','soup']);
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

// ------------------------------------------------------------------ Notizen
// Liegen als Zettel draußen in der Welt: auf den Dorfplätzen, an den Furten,
// oben auf den Bergen. Die Reihenfolge ist die Fundreihenfolge: [0] liegt am
// Startpunkt, [1..3] in den Dörfern, [4,5] auf den Bergen, [6,7] an den
// Furten, der Rest verstreut. Was weiterhilft, liegt also dort, wo man
// ohnehin vorbeikommt.
const LORE=[
  {t:'Wie es anfing',    s:'Das Tal war leer, bis <b>Dominik</b> kam und einen Kern in die Erde drückte. '+
                           'Am nächsten Morgen stand da ein Baum, und an dem Baum hing er selbst — in klein und rund.'},
  {t:'Das Fest',         s:'Einmal im Jahr wurde geerntet und gekocht, und das hieß <b>ErnteDominiksFest</b>. '+
                           'Es gab genau einen Topf Suppe, und jeder bekam einen Schluck. Mehr brauchte es nicht.'},
  {t:'Von den Jannessen',s:'Sie schreiben nichts auf, sie zeigen es. Bring einem <b>🍑 Dominiks</b>, <b>🍄 Pilze</b> '+
                           'oder etwas Gekochtes, und er hält dir das <b>📜 Rezept</b> hin, bis du es dir gemerkt hast.'},
  {t:'Der lange Weg',    s:'Das Suppenrezept kennt nur noch einer, und der wollte seine Ruhe. '+
                           'Er sitzt <b>hinter dem Fluss</b>, wo der Pfeffer wächst. Und er will erst zwei Gerichte sehen.'},
  {t:'Über die Bennis',  s:'Sie kommen mit der Dunkelheit und gehen mit dem Licht, und niemand weiß, wo sie tagsüber stecken. '+
                           'Eine <b>🔥 Fackel</b> hält sie weit weg. Eine zwei Blöcke hohe Mauer auch.'},
  {t:'Der letzte Eintrag',s:'Ich hatte den <b>🍲 Kochtopf</b> schon aufgestellt: oben drei <b>🍑 Dominiks</b>, '+
                           'in der Mitte zwei <b>🍄 Pilze</b> mit dem <b>🧂 Salz</b> dazwischen, unten die <b>🥣 Schale</b> '+
                           'zwischen zwei <b>🌶️ Pfeffern</b>. Dann kam die Nacht. Wenn du das liest: koch sie fertig.'},
  {t:'Vom Salz',         s:'Im Sand ist keines mehr. Es sitzt <b>tief im Fels</b>, in hellen Nestern, die im Dunkeln blitzen. '+
                           'Nimm die <b>⛏️ Spitzhacke</b> und grab dich hinunter.'},
  {t:'Vom Pfeffer',      s:'Diesseits wächst er nicht, das haben wir oft genug versucht. '+
                           'Nur <b>hinter dem Fluss</b> steht er, kniehoch und rot. Such dir eine Furt.'},
  {t:'Die Dörfer',       s:'Drei sind übrig. Sie stehen auf flachem Grund, man sieht sie von weitem. '+
                           'In jedem wohnt ein Jannes, und der wartet in einem der Häuser.'},
  {t:'Die Ernte',        s:'Man pflückt nicht von jedem Baum. Nur jeder fünfte trägt, und der trägt reichlich. '+
                           'Wer alles abräumt, hat im nächsten Jahr nichts — also lass etwas hängen.'},
  {t:'Von den Pilzen',   s:'Sie stehen im Schatten der Wälder, immer ein paar Schritte neben einem Baum. '+
                           'Zwei genügen für den Topf. Der Rest ist Abendessen.'},
  {t:'Die Schale',       s:'Drei Bretter im Bogen: links eins, rechts eins, unten in die Mitte das dritte. '+
                           'Kein Kunststück — aber ohne sie hast du nichts, wo die Suppe hineinkann.'},
  {t:'Von der Werkbank', s:'Vier Bretter im Quadrat, und aus zwei mal zwei werden drei mal drei. '+
                           'Alles Größere geht nur dort. Stell sie hin, wo du sie wiederfindest.'},
];
const lore=new Set();                              // gelesene Notizen
const loreAt=new Map();                            // "x,y,z" → Index in LORE

// ------------------------------------------------------------------ Weltdaten
const scenery=new Map();                 // "x,y,z" → Blocktyp (Bäume, Häuser, Truhen)
const edits=new Map();                   // "x,y,z" → Blocktyp oder null (abgebaut)
const colRange=new Map();                // "x,z" → [lo,hi] der zu vernetzenden Höhen
const chests=new Map();                  // "x,y,z" → {items:[{id,n}],opened}
const K=(x,y,z)=>x+','+y+','+z;

function noteRange(x,z,y){
  const k=x+','+z, r=colRange.get(k);
  if(!r) colRange.set(k,[y,y]);
  else{ if(y<r[0]) r[0]=y; if(y>r[1]) r[1]=y; }
}
function put(t,x,y,z){ scenery.set(K(x,y,z),t); noteRange(x,z,y); }

// Salz steckt im Fels, nicht im Sand: Nester von ein paar Blöcken, die sich
// über drei Höhenlagen ziehen. Aus derselben Rauschformel wie die Landschaft,
// also überall gleich, ohne dass etwas gespeichert werden müsste. Die
// Schwelle ist gemessen: gut zwei Prozent des tiefen Gesteins, also ein
// Fund, den man sucht, und keiner, über den man stolpert.
function saltVein(x,y,z){
  const lay=Math.floor(y/3);
  return vnoise(x+lay*29,z-lay*17,8,61)>.91;
}
function terrainType(x,z,y){
  const H=terrainH(x,z);
  if(y>=H) return null;
  if(y<=BEDROCK) return 'bedrock';        // unzerstörbarer Boden der Welt
  if(y===H-1) return surfaceTex(x,z,H);
  if(y>=H-3) return 'dirt';
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

// Oberkante der Säule: erste freie Höhe über festem Grund.
function surfaceAt(x,z){
  x=Math.round(x); z=Math.round(z);
  let y=terrainH(x,z);
  while(y<64&&blockAt(x,y,z)) y++;
  while(y>BEDROCK&&!blockAt(x,y-1,z)) y--;
  return y;
}
// Erster Platz mit festem Boden und zwei freien Blöcken darüber. Wer sich am
// Startpunkt einen Schacht gegraben hat, landet sonst beim Sterben in der Luft
// und fällt endlos in dieselbe Grube zurück.
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

// ------------------------------------------------------------------ Landschaft
// Die Krone: zwei breite Lagen und eine schmale obendrauf. An einem langen
// Stamm sähe eine einzelne breite Lage aus wie ein Besen.
const TREE_TOP=[];
(function treeShape(){
  for(const dy of [0,1])
    for(let x=-2;x<=2;x++) for(let z=-2;z<=2;z++)
      if(Math.abs(x)+Math.abs(z)<=2) TREE_TOP.push([x,dy,z]);
  for(let x=-1;x<=1;x++) for(let z=-1;z<=1;z++)
    if(Math.abs(x)+Math.abs(z)<=1) TREE_TOP.push([x,2,z]);
})();
// Die Dominiks hängen unter der Krone, und die hängt hoch: vom Boden aus
// kommt man mit REACH nicht heran, es braucht zwei, drei gesetzte Blöcke.
const TRUNK_MIN=10;
const FRUIT_OFF=[[2,0],[-2,0],[0,2],[0,-2],[1,1],[-1,-1],[1,-1],[-1,1]];
// Nur auf ebenem Grasland: Hänge, Ufer und Fels bleiben frei.
function treeSpot(x,z){
  const h=terrainH(x,z);
  if(h<SEA+1||h>=9) return -1;
  if(surfaceTex(x,z,h)!=='grass') return -1;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])
    if(Math.abs(terrainH(x+dx,z+dz)-h)>1) return -1;
  return h;
}
const chestSpots=[];
const houseSpots=[];                     // Stube im zweiten Haus jedes Dorfes
const traderSpots=[];                    // wo die Jannessen stehen, in TRADES-Reihenfolge
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
  // --- Wälder: Rauschen gibt die Dichte, Dörfer und Starttal bleiben frei
  const r=mulberry(4711);
  let n=0, trees=[];
  for(let x=BOUND.x0+3;x<=BOUND.x1-3&&n<1200;x++)
    for(let z=BOUND.z0+3;z<=BOUND.z1-3&&n<1200;z++){
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
  // Aus derselben Zufallsformel wie die Wälder, damit die Welt bei jedem
  // Start dieselbe bleibt.
  const rr=(a,b)=>a+r()*(b-a);
  for(let k=0;k<6000&&chestSpots.length<8;k++){
    const x=Math.round(rr(BOUND.x0+6,BOUND.x1-6));
    const z=Math.round(rr(BOUND.z0+6,BOUND.z1-6));
    if(Math.hypot(x-HOME.x,z-HOME.z)<12) continue;
    const h=treeSpot(x,z);
    if(h<0) continue;
    if(scenery.has(K(x,h,z))) continue;
    if(chestSpots.some(c=>Math.hypot(c.x-x,c.z-z)<30)) continue;
    chestSpots.push({x,y:h,z});
  }
  // --- Truhen füllen: Werkzeug und Baustoff, keine Zutaten.
  const LOOT=[['plank',3,8],['stick',2,6],['torch',2,5],['bowl',1,1],
              ['stone',3,8],['dirt',2,6],['brick',2,6],['sword',1,1]];
  chestSpots.forEach(c=>{
    put('chest',c.x,c.y,c.z);
    const items=[];
    const cnt=2+Math.floor(r()*3);
    for(let k=0;k<cnt;k++){
      const [id,lo,hi]=LOOT[Math.floor(r()*LOOT.length)];
      if(items.some(it=>it.id===id)) continue;
      items.push({id,n:lo+Math.floor(r()*(hi-lo+1))});
    }
    chests.set(K(c.x,c.y,c.z),{items,opened:false});
  });

  // --- Plätze für die Jannessen. Der erste steht im Starttal, drei wohnen in
  // den Dorfhäusern, der Rest verteilt sich über die Welt: einer weit
  // draußen, einer an einer Furt, einer auf einem Berg und der letzte hinter
  // dem Fluss beim Pfeffer. Reihenfolge und Inhalt hängen zusammen — der
  // k-te Platz gehört zum k-ten Handel in TRADES.
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
  // Der erste steht sichtbar im Tal, aber weit genug von der Notiz am
  // Startpunkt weg: sonst schiebt sein Bannkreis die Notiz woanders hin.
  traderSpots.push({x:SPAWN.x+7,z:SPAWN.z-1}, ...houseSpots);
  for(const q of [
    [(x,z)=>far(x,z)&&grass(x,z), far, ()=>true],
    [(x,z)=>riverAt(x,z).d<RIVER_W+4&&grass(x,z), (x,z)=>riverAt(x,z).d<RIVER_W+7, ()=>true],
    [(x,z)=>terrainH(x,z)>=13, (x,z)=>terrainH(x,z)>=9, far, ()=>true],
    [(x,z)=>beyondRiver(x,z)&&grass(x,z), beyondRiver, far, ()=>true],
  ]) traderSpots.push(findSpot(...q)||{x:SPAWN.x,z:SPAWN.z-8});

  // --- Notizen in der Welt verteilen. Erst die Orte, an denen man ohnehin
  // vorbeikommt, dann der Rest — die Reihenfolge entscheidet, welcher Text
  // wo landet (siehe LORE).
  const loreSpots=[];
  const noteHere=(x,z)=>{
    x=Math.round(x); z=Math.round(z);
    if(loreSpots.length>=LORE.length) return false;
    if(x<BOUND.x0+3||x>BOUND.x1-3||z<BOUND.z0+3||z>BOUND.z1-3) return false;
    const y=terrainH(x,z);
    if(y<SEA||scenery.has(K(x,y,z))) return false;   // y===SEA ist das flache Starttal
    if(chestSpots.some(s=>Math.abs(s.x-x)<2&&Math.abs(s.z-z)<2)) return false;
    if(traderSpots.some(s=>Math.hypot(s.x-x,s.z-z)<3)) return false;
    if(loreSpots.some(s=>Math.hypot(s.x-x,s.z-z)<10)) return false;
    loreSpots.push({x,y,z});
    return true;
  };
  noteHere(SPAWN.x+4,SPAWN.z-4);                       // gleich am Startpunkt
  for(const v of VILLAGES) noteHere(v.x+3,v.z+4);      // neben dem Dorfplatz
  const peaks=[];                                      // die zwei höchsten Gipfel
  for(let x=BOUND.x0+4;x<=BOUND.x1-4;x+=3)
    for(let z=BOUND.z0+4;z<=BOUND.z1-4;z+=3){
      const h=terrainH(x,z);
      if(h>=16) peaks.push({x,z,h});
    }
  peaks.sort((a,b)=>b.h-a.h);
  for(let k=0,n=0;k<peaks.length&&n<2;k++) if(noteHere(peaks[k].x,peaks[k].z)) n++;
  for(let k=0,n=0;k<4000&&n<2;k++){                    // an den Furten
    const x=Math.round(rr(BOUND.x0+6,BOUND.x1-6)), z=Math.round(rr(BOUND.z0+6,BOUND.z1-6));
    if(riverAt(x,z).d>RIVER_W+3||terrainH(x,z)<=SEA) continue;
    if(noteHere(x,z)) n++;
  }
  for(let k=0;k<9000&&loreSpots.length<LORE.length;k++){   // und verstreut
    const x=Math.round(rr(BOUND.x0+6,BOUND.x1-6)), z=Math.round(rr(BOUND.z0+6,BOUND.z1-6));
    if(treeSpot(x,z)<0) continue;
    noteHere(x,z);
  }
  loreSpots.forEach((s,i)=>{ put('lore',s.x,s.y,s.z); loreAt.set(K(s.x,s.y,s.z),i); });
})();

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
// Zwei senkrechte Flächen über Kreuz, wie die Blumen im Vorbild. Sie hängen
// oben in der Zelle, damit die Frucht am Laub darüber zu kleben scheint statt
// in der Luft zu schweben. s ist die Kantenlänge, quer wie hoch.
const UPN=[0,1,0];
function crossVerts(i,x,y,z,s){
  const o=s/(2*Math.SQRT2), y1=y+1, y0=y+1-s;
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
        const s=BLOCKS[t].size||1;
        addQuad(t,crossVerts(0,x,y,z,s),UPN);
        addQuad(t,crossVerts(1,x,y,z,s),UPN);
        continue;
      }
      if(!blockAt(x,y+1,z)) add(t,'py',x,y,z);
      if(!blockAt(x,y-1,z)) add(t,'ny',x,y,z);
      if(!blockAt(x+1,y,z)) add(t,'px',x,y,z);
      if(!blockAt(x-1,y,z)) add(t,'nx',x,y,z);
      if(!blockAt(x,y,z+1)) add(t,'pz',x,y,z);
      if(!blockAt(x,y,z-1)) add(t,'nz',x,y,z);
    }
    if(H<=SEA-1&&!blockAt(x,SEA-1,z)) add('water','py',x,SEA-1,z);
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
    if(mat==='water'){ opts.transparent=true; opts.opacity=.82; }
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
function setBlock(x,y,z,type){
  edits.set(K(x,y,z),type||null);
  noteRange(x,z,y-1); noteRange(x,z,y+1);
  for(const [dx,dz] of NB4){ noteRange(x+dx,z+dz,y-1); noteRange(x+dx,z+dz,y+1); }
  markDirty(x,z);
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
const torches=[];
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
const litAt=(x,z,r=14)=>torches.some(t=>Math.hypot(t.x-x,t.z-z)<r);

// ------------------------------------------------------------------ Bewohner
// Die Handelskette. want ist, was ein Jannes sehen will, give das Rezept, das
// er dafür zeigt. Die Reihenfolge ist zugleich die Reihenfolge der Plätze
// (siehe traderSpots) und damit der Weg durchs Spiel: erst Schale und
// Kochtopf, dann die beiden Gerichte, damit tauscht man den Rest ein.
// ask steht im Fenster, hint in der Sprechblase — die fasst nur drei kurze
// Zeilen, ein ganzer Satz wäre dort abgeschnitten.
const TRADES=[
  {want:[['dominik',3]],  give:'bowl',  hint:'Drei Dominiks, und ich zeig dir was.',
   ask:'Drei Dominiks für den Winter — dafür zeig ich dir, woraus man isst.'},
  {want:[['mushroom',4]], give:'pot',   hint:'Vier Pilze für ein gutes Rezept.',
   ask:'Vier Pilze, und du weißt, worin man kocht.'},
  {want:[['dominik',5]],  give:'compote',hint:'Fünf Dominiks — dann wird es süß.',
   ask:'Fünf Dominiks. Dann verrate ich dir, was Süßes daraus wird.'},
  {want:[['mushroom',6]], give:'panfry',hint:'Sechs Pilze, und die Pfanne ist dein.',
   ask:'Sechs Pilze für das beste Pfannengericht diesseits des Flusses.'},
  {want:[['compote',1]],  give:'pick',  hint:'Bring mir ein Kompott.',
   ask:'Ein Kompott, und du kriegst das Werkzeug für den Fels.'},
  {want:[['panfry',1]],   give:'axe',   hint:'Eine Pilzpfanne, bitte.',
   ask:'Einmal Pilzpfanne. Dafür fällst du Bäume, als wären es Halme.'},
  {want:[['dominik',2],['mushroom',2]], give:'sword', hint:'Zwei Dominiks, zwei Pilze.',
   ask:'Hier oben wird es nachts ungemütlich. Bring mir was zu essen, '+
       'ich zeig dir was zum Wehren.'},
  {want:[['compote',1],['panfry',1]],   give:'soup',  hint:'Kompott und Pfanne. Dann reden wir.',
   ask:'Du willst das Suppenrezept? Dann koch mir erst beides vor: Kompott und Pfanne.'},
];
const CHARS=[
  {key:'manni',name:'Manni',h:1.9,x:-6,z:14,color:'#ff6b4a',
   lines:['Rezepte gibt es bei den Jannessen — gegen Essen.','Nachts bleibe ich lieber im Licht.',
          'Die Notizen hier herum kann man lesen.']},
];
// Alle heißen Jannes, alle sehen gleich aus, alle wollen etwas anderes.
TRADES.forEach((t,i)=>{
  const s=traderSpots[i];
  if(!s) return;
  CHARS.push({key:'jannes',name:'Jannes',h:1.88,x:s.x,z:s.z,color:'#4ab0ff',
    trade:{...t,done:false}, lines:[t.hint]});
});
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
    g.position.set(c.x,y,c.z);
    const asp=c.tex.image.width/c.tex.image.height;
    const bb=new THREE.Mesh(new THREE.PlaneGeometry(c.h*asp,c.h),
      new THREE.MeshLambertMaterial({map:c.tex,transparent:true,alphaTest:.5,side:THREE.DoubleSide}));
    bb.position.y=c.h/2; bb.castShadow=true; g.add(bb); billboards.push(bb);
    const tag=makeLabel(c.name,c.color,.3); tag.position.y=c.h+.28; g.add(tag);
    const bubble=makeLabel('','#fff',.5);
    bubble.position.y=c.h+1; bubble.visible=false; g.add(bubble);
    scene.add(g);
    Object.assign(c,{group:g,bb,tag,bubble,bubbleT:0,sayT:rnd(8,20)});
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
const DONE_LINES=['Gut gehandelt. Das Rezept hast du ja jetzt.',
                  'Frag ruhig nochmal nach, ich zeig es dir wieder.',
                  'Mehr hab ich nicht — geh weiter, es gibt noch andere von uns.'];
const _wp=new THREE.Vector3();
function updateChars(dt){
  for(const c of CHARS){
    if(!c.group) continue;
    // Namensschilder hängen vor der Landschaft. Bei einem Bewohner ist das
    // hilfreich, bei neun quer über die Welt wäre es ein Schilderwald.
    c.tag.visible=Math.hypot(player.x-c.x,player.z-c.z)<26;
    c.sayT-=dt;
    if(c.sayT<=0){ c.sayT=rnd(22,45);
      if(Math.hypot(player.x-c.x,player.z-c.z)<14)
        say(c,pick(c.trade?.done?DONE_LINES:c.lines),4200);
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
const mobs=[];
const MOB_HP=10, MOB_SPEED=2.35, MOB_DMG=3, MOB_ATK_CD=1.4;
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
  const h=1.95, asp=benniTex.image.width/benniTex.image.height;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(h*asp,h),
    new THREE.MeshLambertMaterial({map:benniTex,transparent:true,alphaTest:.5,side:THREE.DoubleSide}));
  mesh.position.set(x,y+h/2,z); mesh.castShadow=true;
  scene.add(mesh);
  mobs.push({x,z,y,hp:MOB_HP,mesh,atkCd:rnd(0,1),hurtT:0,bob:rnd(0,6)});
}
function dropMob(m,i){
  scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose();
  mobs.splice(i<0?mobs.indexOf(m):i,1);
}
function damageMob(m,dmg){
  m.hp-=dmg; m.hurtT=.22;
  if(m.hp<=0){
    dropMob(m,-1);
    state.killed++;
    SND.mobDie();
  } else SND.hit();
}
function mobBlocked(x,z,fromY){
  const s=surfaceAt(x,z);
  return s-fromY>1.001||s<SEA-1;
}
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
  for(let i=mobs.length-1;i>=0;i--)      // und die Umstehenden verziehen sich
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
  const txt=aimed?aimed.name+(aimed.trade&&!aimed.trade.done?' — Rechtsklick zum Tauschen':' — Rechtsklick')
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
  crackMesh.position.set(cell.x,cell.y+.5,cell.z);
  crackMesh.scale.setScalar(BLOCKS[type]?.size||1);   // um die kleine Frucht herum
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
  setBlock(x,y,z,null);
  state.mined++;
  SND.pop();
  let drop=b.drop;
  if(t==='leaf'){                            // Laub gibt manchmal einen Stock
    if(Math.random()<.22) drop='stick';
  }
  if(drop){ if(give(drop,1)) toast('🎒 Inventar voll.','warn',1400); }
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
    say(aimed,pick(aimed.lines),4200);
    return;
  }
  // 2. Kiste, Werkbank, Kochtopf bedienen
  if(target&&BLOCKS[target.type].use){
    const u=BLOCKS[target.type].use;
    if(u==='chest') return openChest(target.cell);
    if(u==='bench') return openCraft('bench');
    if(u==='pot')   return openCraft('pot');
    if(u==='lore')  return readLore(target.cell);
  }
  // 3. Essen
  if(it&&it.food){
    if(player.food>=player.maxfood&&player.hp>=player.maxhp){ toast('😋 Du bist satt.','',1200); return; }
    player.food=clamp(player.food+it.food,0,player.maxfood);
    if(id==='soup') player.hp=player.maxhp;
    consumeHeld(); SND.eat(); updateHUD();
    return;
  }
  // 4. Fackel setzen
  if(it&&it.torch&&target){
    const p=target.place;
    if(!canPlaceAt(p.x,p.y,p.z)||!blockAt(p.x,p.y-1,p.z)) return;
    torches.push({x:p.x,y:p.y,z:p.z});
    emitTorches(); consumeHeld(); SND.place(); updateHUD();
    return;
  }
  // 5. Block setzen
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
  if(best){ damageMob(best,heldDmg()); return true; }
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
function takeFromChest(i,one){
  const c=chests.get(K(openChestCell.x,openChestCell.y,openChestCell.z));
  const it=c.items[i]; if(!it) return;
  const want=one?1:it.n;                     // rechts nimmt einzeln aus der Truhe
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
// Ein Muster als kleines Raster, so wie es ins Handwerksfeld gehört.
function patHTML(r){
  const rows=patRows(r);
  const w=Math.max(...rows.map(x=>x.length));
  let g='';
  for(const row of rows) for(let x=0;x<w;x++)
    g+=`<div class="pc">${row[x]?icon(row[x]):''}</div>`;
  return `<div class="patwrap">
    <div class="pat" style="grid-template-columns:repeat(${w},30px)">${g}</div>
    <div class="arrow">➜</div>
    <div class="pc res">${icon(r.out[0])}${r.out[1]>1?`<span class="n">${r.out[1]}</span>`:''}</div>
    </div>`+
    (r.shapeless?'<p style="font-size:11.5px;opacity:.7;text-align:center">Anordnung egal.</p>':'');
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
  tradePartner=c;
  const ok=tradeOK(t);
  showModal(`<h2>${c.name}</h2>
    <p style="text-align:center;font-size:13px">${t.ask}</p>
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
function doTrade(){
  const c=tradePartner;
  if(!c||c.trade.done) return;
  const t=c.trade;
  if(!tradeOK(t)){ SND.fail(); return; }
  for(const [id,n] of t.want) take(id,n);
  t.done=true; state.trades++;
  SND.chest();
  say(c,'Danke. Schau her — so geht das.',5000);
  learnRecipe(t.give,c.name);
}

// ------------------------------------------------------------------ Notizen lesen
function readLore(cell){
  const i=loreAt.get(K(cell.x,cell.y,cell.z));
  if(i==null) return;
  const l=LORE[i];
  if(!lore.has(i)){ lore.add(i); SND.book(); updateHUD(); }
  showModal(`<h2>📖 ${l.t}</h2><div class="page">${l.s}</div>
    <p style="font-size:12px;opacity:.8;text-align:center">${lore.size}/${LORE.length} Notizen gelesen.</p>
    <div class="btnrow"><button class="primary" data-act="close">Weiter</button></div>`);
}

// ------------------------------------------------------------------ Sieg
function winGame(){
  if(state.won) return;
  state.won=true;
  SND.win();
  showModal(`<h2>🍲 Dominik-Suppe!</h2>
    <p>Sie ist fertig. Ein Rezept von hinter dem Fluss, ein Kochtopf, eine Suppe — Ziel erreicht.</p>
    <p style="font-size:12px;opacity:.8">⛏️ ${state.mined} Blöcke abgebaut · 🧱 ${state.placed} gesetzt ·
    🤝 ${state.trades}/${TRADES.length} Handel · 🧰 ${state.chests} Truhen ·
    📜 ${known.size}/${RECIPES.length} Rezepte · 📖 ${lore.size}/${LORE.length} Notizen ·
    🌙 Tag ${state.day} · 💀 ${state.deaths}× gestorben</p>
    <div class="btnrow"><button class="primary" data-act="close">Weiterspielen</button></div>`);
}

// ------------------------------------------------------------------ Fenster
const modal=el('modal'), mbox=el('mbox');
let craftStation=null;
function showModal(html,keep){
  const sc=mbox.scrollTop;
  mbox.innerHTML=html; modal.classList.remove('hidden'); state.paused=true;
  mbox.scrollTop=keep?sc:0;              // beim Umsortieren nicht nach oben springen
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
    const rest=give(s.id,s.n);
    if(rest) toast('🎒 Inventar voll — '+rest+'× ging verloren.','warn');
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
  const rest=give(r.out[0],r.out[1]);
  if(rest) toast('🎒 Inventar voll — '+rest+'× ging verloren.','warn');
  state.crafted++;
  SND.craft();
  const fresh=!known.has(r.id);
  known.add(r.id);                       // selbst herausgefunden zählt auch
  updateHUD();
  if(r.id==='soup'&&!state.won){ winGame(); return true; }
  toast(fresh?'📜 Rezept entdeckt: '+ITEMS[r.out[0]].nm
             :ITEMS[r.out[0]].ic+' '+ITEMS[r.out[0]].nm+' gebaut.','good',fresh?2600:1600);
  renderCraft();
  return true;
}
// Aus dem Rezeptbuch: Zutaten aus dem Inventar ins Raster legen.
function fillFromBook(r){
  const rows=patRows(r);
  const w=Math.max(...rows.map(x=>x.length));
  if(rows.length>gridN||w>gridN){ toast('🛠️ Dafür brauchst du eine Werkbank.','warn',1800); return false; }
  if(r.station&&r.station!==craftStation){ toast('🍲 Dafür brauchst du einen Kochtopf.','warn',1800); return false; }
  clearGrid();
  const need=needList(rows);
  for(const id in need)
    if(countOf(id)<need[id]){ toast('Es fehlt: '+ITEMS[id].ic+' '+ITEMS[id].nm,'warn',1800); return false; }
  rows.forEach((row,y)=>row.forEach((id,x)=>{
    if(!id) return;
    take(id,1); grid[y*3+x]={id,n:1};
  }));
  return true;
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
  const rest=give(carry.id,carry.n);
  if(rest) toast('🎒 Inventar voll — '+rest+'× ging verloren.','warn');
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
  else if(craftStation==='pot') h+='<p class="hint">Am Kochtopf. Hier entsteht die Suppe.</p>';
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
const patLine=rows=>rows.map(r=>r.map(id=>id?icon(id,'mini'):'<i class="dot"></i>').join(''))
                        .join('<b class="sep">/</b>');
function bookHTML(){
  let h='', unknown=0;
  for(const r of RECIPES.slice().sort((a,b)=>a.rank-b.rank)){
    if(!known.has(r.id)){ unknown++; continue; }
    const rows=patRows(r);
    const w=Math.max(...rows.map(x=>x.length));
    const st=(r.station==='pot'&&craftStation!=='pot')?'🍲 Kochtopf nötig'
            :(rows.length>gridN||w>gridN)?'🛠️ Werkbank nötig'
            :!haveAll(rows)?'Material fehlt':'';
    const out=ITEMS[r.out[0]];
    h+=`<div class="recipe${st?' off':''}"><div class="ico">${icon(r.out[0])}</div>
      <div class="txt"><div class="nm">${out.nm}${r.out[1]>1?' ×'+r.out[1]:''}</div>
      <div class="ds">${patLine(rows)}${st?' · '+st:''}</div></div>
      <button data-craft="${r.id}"${st?' disabled':''}>Bauen</button></div>`;
  }
  if(unknown) h+=`<div class="recipe off"><div class="ico">❓</div><div class="txt">
    <div class="nm">${unknown} unbekannt${unknown===1?'es Rezept':'e Rezepte'}</div>
    <div class="ds">Jannes zeigt sie dir gegen Essen — oder leg es selbst richtig ins Raster</div></div></div>`;
  return h;
}
function openCraft(station){
  clearGrid();                           // sonst stranden Zutaten in Zellen,
  craftStation=station||null;            // die das kleinere Raster nicht zeigt
  gridN=station?3:2;
  renderCraft(false);
}
function renderCraft(keep=true){
  const title=craftStation==='pot'?'🍲 Kochtopf':craftStation==='bench'?'🛠️ Werkbank':'🎒 Inventar';
  showModal('<h2>'+title+'</h2>'+craftHTML()+'<h3>Rucksack</h3>'+invGrid()+
    '<p class="hint">Links nimmt den ganzen Stapel, rechts genau einen.</p>'+
    '<h3>📜 Rezeptbuch</h3>'+bookHTML()+
    '<div class="btnrow"><button class="primary" data-act="close">Schließen</button></div>',keep);
  drawCarry();
  updateItemTip();          // der Zeiger steht still, aber die Zelle ist neu
}
function openIntro(){
  showModal(`<h2>⛏️ ErnteDominiksFest</h2>
  <p>Überlebe. Bau ab, bau auf, halte die Bennis aus der Nacht heraus.</p>
  <p>Gebaut wird im <b>Raster</b>: Zutaten hineinlegen wie beim Vorbild, 2×2 im Rucksack,
  3×3 an der <b>🛠️ Werkbank</b>. Wer ein Muster richtig legt, hat das Rezept entdeckt.</p>
  <p><b>📜 Rezepte</b> gibt es bei den <b>Jannessen</b> — in den Dorfhäusern und draußen in der Welt.
  Sie wollen <b>🍑 Dominiks</b>, <b>🍄 Pilze</b> oder ein fertiges Gericht und zeigen dir dafür,
  wie das nächste geht. Zutaten baust du selbst ab: 🧂 Salz sitzt tief im Fels,
  🌶️ Pfeffer wächst hinter dem Fluss.
  <b>📖 Notizen</b> stehen überall herum und erzählen, wie das alles zusammenhängt.</p>
  <div class="kbd">
    <b>WASD</b> laufen &nbsp; <b>⇧</b> rennen &nbsp; <b>␣</b> springen<br>
    <b>LMB</b> abbauen / schlagen &nbsp; <b>RMB</b> setzen / benutzen / lesen / essen<br>
    <b>E</b> Inventar &nbsp; <b>1-9</b> Leiste &nbsp; <b>Rad</b> wechseln &nbsp; <b>P</b> Pause
  </div>
  <div class="btnrow"><button class="primary" data-act="start">Los geht's</button></div>`);
}
function togglePause(){
  if(modalOpen()){ hideModal(); return; }
  showModal(`<h2>⏸️ Pause</h2>
    <p style="font-size:12.5px;opacity:.85">📜 ${known.size}/${RECIPES.length} Rezepte ·
    🤝 ${state.trades}/${TRADES.length} Handel · 📖 ${lore.size}/${LORE.length} Notizen ·
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
  if(b.dataset.craft){
    const r=RECIPES.find(x=>x.id===b.dataset.craft);
    if(r&&fillFromBook(r)) craftFromGrid();
    else renderCraft();
    return;
  }
  const act=b.dataset.act;
  if(act==='craft'){ craftFromGrid(); return; }
  if(act==='trade'){ doTrade(); return; }
  if(act==='close') hideModal();
  else if(act==='takeall'){
    const c=chests.get(K(openChestCell.x,openChestCell.y,openChestCell.z));
    for(let i=c.items.length-1;i>=0;i--) takeFromChest(i);
  }
  else if(act==='help') openIntro();
  else if(act==='start'){ localStorage.setItem('edf_seen','1'); hideModal(); state.started=true; }
});

// ------------------------------------------------------------------ Bewegung
const PR=.32, GRAV=26, JUMP=8.4, EYE=1.62, PH=1.8, EPS=1e-4;
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
  const sprint=(keys.ShiftLeft||keys.ShiftRight)?1.42:1;
  const sp=4.8*sprint;
  const sin=Math.sin(player.yaw), cos=Math.cos(player.yaw);
  const dx=(mx*cos+mz*sin)*sp*dt;
  const dz=(-mx*sin+mz*cos)*sp*dt;

  // Waagerecht, Achse für Achse — mit automatischer Stufe von einem Block.
  let nx=clamp(player.x+dx,BOUND.x0-.4,BOUND.x1+.4);
  if(collides(nx,player.y,player.z)){
    if(player.onGround&&!collides(nx,player.y+1,player.z)&&!collides(player.x,player.y+1,player.z))
      { player.y+=1; player.x=nx; }
    else nx=player.x;
  }
  if(nx!==player.x) player.x=nx;
  let nz=clamp(player.z+dz,BOUND.z0-.4,BOUND.z1+.4);
  if(collides(player.x,player.y,nz)){
    if(player.onGround&&!collides(player.x,player.y+1,nz)&&!collides(player.x,player.y+1,player.z))
      { player.y+=1; player.z=nz; }
    else nz=player.z;
  }
  if(nz!==player.z) player.z=nz;

  // Senkrecht
  if(!state.paused){
    if(player.onGround&&keys.Space){ player.vy=JUMP; player.onGround=false; }
    player.vy-=GRAV*dt;
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
    if(ny<BEDROCK-6){ respawn(); ny=player.y; fall=0; }  // normal unerreichbar
    player.y=ny;
    // Erst jetzt Schaden, sonst überschreibt die Höhe von oben einen Respawn.
    if(fall>3) hurtPlayer(Math.max(1,Math.round(fall-3)));
  }

  // Kamera: Höhe weich nachziehen, sonst ruckelt jede Stufe
  player.viewY=Math.abs(player.y-player.viewY)<.02?player.y:lerp(player.viewY,player.y,Math.min(1,dt*16));
  const speed=Math.hypot(dx,dz)/Math.max(dt,1e-4);
  if(speed>.4&&player.onGround&&!state.paused){
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
let mobTimer=0;
function updateNight(dt){
  const wasNight=state.night;
  state.night=state.dayT>=NIGHT_START&&state.dayT<NIGHT_END;
  if(state.night&&!wasNight){ toast('🌙 Nacht '+state.day,'bad',2600); SND.night(); }
  if(!state.night&&wasNight){ toast('🌅 Morgen.','good',2200); SND.dawn(); }
  if(state.night){
    mobTimer-=dt;
    if(mobTimer<=0){
      mobTimer=rnd(2.5,5);
      if(mobs.length<mobCap()) spawnMob();
    }
  }
}
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
  el('hLore').textContent=lore.size;
  el('book').classList.toggle('full',knowsSoup());
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
  if(e.repeat&&e.code!=='Space') return;
  keys[e.code]=true;
  if(e.code==='Escape'){ if(document.pointerLockElement) document.exitPointerLock(); return; }
  if(e.code==='KeyE'){
    e.preventDefault(); ac();
    modalOpen()?hideModal():openCraft(null);
    return;
  }
  if(e.code==='KeyP'){ e.preventDefault(); ac(); togglePause(); return; }
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
  if(!state.paused){
    state.t+=dt;
    state.dayT+=dt/DAYLEN;
    if(state.dayT>=1){ state.dayT=0; state.day++; }
    updateNight(dt);
    updateVitals(dt);
    updateMobs(dt);
  }
  updatePlayer(dt);
  updateTarget();
  updateMining(dt);
  flushChunks();
  cullChunks();
  updateChars(dt);
  updateBillboards();
  updateSky();
  state.checkT+=dt;
  if(state.checkT>=.5){ state.checkT=0; updateHUD(); }
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

// ------------------------------------------------------------------ Start
// Sprites vorladen, damit die Leiste nicht erst leer ist und dann aufploppt.
// Fehlt eines, wird nicht abgebrochen — dann greift der alt-Text.
const preload=src=>new Promise(res=>{
  const i=new Image(); i.onload=i.onerror=()=>res(); i.src=src;
});
const UISPRITES=['heart_full','heart_half','heart_empty','food_full','food_half','food_empty',
                 'icon_bag','icon_book','icon_pause'];
Promise.all([
  ...[...ICONS].map(id=>preload(iconSrc(id))),
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
  player.y=player.viewY=surfaceAt(player.x,player.z);
  el('hRecMax').textContent=RECIPES.length;
  el('hLoreMax').textContent=LORE.length;
  resize(); updateHUD();
  el('boot').remove();
  if(localStorage.getItem('edf_seen')){ state.paused=false; state.started=true; }
  else openIntro();
  requestAnimationFrame(frame);
}).catch(e=>{
  el('boot').innerHTML='😢 '+e.message;
  console.error(e);
});

// ------------------------------------------------------------------ Debug-API
window.game={state,player,slots,ITEMS,BLOCKS,RECIPES,known,lore,LORE,loreAt,grid,chests,torches,mobs,
  CHARS,TRADES,traderSpots,chestSpots,openTrade,doTrade,aimChar,saltVein,beyondRiver,BOUND,
  get aimed(){return aimed;},
  blockAt,setBlock,surfaceAt,terrainH,rayPick,chunks,scene,renderer,
  give:(id,n)=>give(id,n), take,countOf,
  get target(){return target;},
  get sel(){return heldId();},
  openCraft,openChest,attack,spawnMob,hurtPlayer,updateHUD,
  learnRecipe,matchRecipe,craftFromGrid,fillFromBook,patRows,patLine,readLore,icon,iconSrc,
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
};
