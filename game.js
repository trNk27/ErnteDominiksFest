/* =====================================================================
   ErnteDominiksFest 3D — Klötzchen-Edition
   Ego-Perspektive, Handy im Querformat. Dominiks wachsen auf Bäumen.
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
  alarm:()=>{tone(220,.18,'sawtooth',.09);tone(165,.25,'sawtooth',.09,.15);},
  fail:()=>tone(160,.15,'square',.07),
  splat:()=>tone(85,.22,'sine',.15),
  step:()=>tone(90+Math.random()*30,.05,'triangle',.03),
  quest:()=>{tone(659,.1,'triangle',.09);tone(988,.16,'triangle',.09,.1);},
};

// ------------------------------------------------------------------ Balance
const DAYLEN=80, MAXDAY=10, GOAL=450;
const STAGE_DUR={seed:8,sprout:12,young:16,mature:12,blossom:8};
const STAGE_NEXT={seed:'sprout',sprout:'young',young:'mature',mature:'blossom',blossom:'fruiting'};
const FRUIT_WINDOW=32, OVERRIPE_WINDOW=16, WILT_LIMIT=14;
const GROWABLE=['seed','sprout','young','mature','blossom'];
const ALIVE=[...GROWABLE,'fruiting','overripe'];
const REACH=4.4;

const COLS=[-9,0,9], ROWS=[-18,-9,0,9];
const WELL={x:-15,z:23}, STALL={x:15,z:23}, SHED={x:0,z:25}, BENCH={x:-6,z:24};
const BOUND={x0:-33,x1:25,z0:-35,z1:29};

const state={t:0,day:1,dayT:0,price:12,priceT:0,money:20,paused:true,over:false,won:false,
  earned:0,harvested:0,crafted:0,chopped:0,checkT:0,started:false,tutorial:true};
const inv={seed:3,bio:0,pest:1,fert:0};
const res={wood:0,stone:0};
const upg={can:0,shears:0,bag:0,boots:0,plots:0};
const canCap=()=>4+upg.can*2;
const bagCap=()=>5+upg.bag*3;
const trimMul=()=>[1,.68,.48][upg.shears];
const walkSpeed=()=>5.6*(1+upg.boots*.16);

const player={x:0,z:16,yaw:Math.PI,pitch:-.03,can:4,carry:0,bob:0,act:null,stepT:0};

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
};

// ------------------------------------------------------------------ Rezepte (Werkbank)
const RECIPES=[
  {id:'seed',  ic:'🌱',nm:'Samen',        ds:'Aus einem Dominik neue Samen gewinnen.',
   cost:{dominik:1}, give:()=>{inv.seed+=3;}, out:'3× 🌱'},
  {id:'pest',  ic:'🧪',nm:'Blattlaus-Spray',ds:'Rettet befallene Bäume.',
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
  grass  :noiseTex(['#6aab3f','#5f9e38','#74b649','#589434','#7cbd4f'],21),
  dirt   :noiseTex(['#8a6440','#7d5937','#946d48','#6f4e30'],22),
  farm   :noiseTex(['#6b4a2c','#5e3f24','#775434'],23,(g,s,r)=>{
    g.fillStyle='#4a3119'; for(let y=2;y<s;y+=5) g.fillRect(0,y,s,1);
  }),
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

// ------------------------------------------------------------------ Klötzchen-System
const BLOCK=new THREE.BoxGeometry(1,1,1);
const _m4=new THREE.Matrix4(), _pos=new THREE.Vector3(),
      _quat=new THREE.Quaternion(), _scl=new THREE.Vector3();
function batch(tex,cap,color){
  const m=new THREE.InstancedMesh(BLOCK,
    new THREE.MeshLambertMaterial({map:tex,color:color||0xffffff}),cap);
  m.castShadow=m.receiveShadow=true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count=0; m.frustumCulled=false;
  scene.add(m);
  return m;
}
/** Block mit Mittelpunkt (x, y+.5, z) setzen; y ist die Blocklage. */
function blk(m,x,y,z,s=1){
  if(m.count>=m.instanceMatrix.count) return;
  _m4.compose(_pos.set(x,y+.5,z),_quat.set(0,0,0,1),_scl.set(s,s,s));
  m.setMatrixAt(m.count++,_m4);
}
const reset=m=>{m.count=0;};
const flush=m=>{m.instanceMatrix.needsUpdate=true;
  m.computeBoundingSphere&&(m.boundingSphere=null);};

// statische Welt
const B={
  brick:batch(TEX.brick,900), plank:batch(TEX.plank,520), log:batch(TEX.log,420),
  stone:batch(TEX.stone,260), water:batch(TEX.water,12), wool:batch(TEX.wool,60),
  hay:batch(TEX.hay,40), bench:batch(TEX.bench,6), dirt:batch(TEX.dirt,120),
};
// dynamische Welt (Bäume, Rohstoffe)
const D={
  leaf:batch(TEX.leaf,1500), log:batch(TEX.log,320),
  dead:batch(TEX.deadlog,60), rock:batch(TEX.stone,200),
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
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

const obstacles=[];
const interactives=[];
function hitProxy(x,z,r,h,data,y0=0){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,7),
    new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
  m.position.set(x,y0+h/2,z); m.userData=data; scene.add(m); interactives.push(m); return m;
}

// ---- Mauer rundum
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

// ---- Brunnen
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

// ---- Feststand
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

// ---- Laden
(function shed(){
  const {x,z}=SHED;
  for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=1;dz++){
    const edge=Math.abs(dx)===2||dz===-2||dz===1;
    if(!edge) continue;
    for(let y=0;y<3;y++){
      if(dz===-2&&Math.abs(dx)<1&&y<2) continue;      // Tür
      blk(B.plank,x+dx,y,z+dz);
    }
  }
  for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=2;dz++) blk(B.brick,x+dx,3,z+dz);
  const sign=makeLabel('🛒 Laden','#ffd76a',.62,false);
  sign.position.set(x,5.2,z-2); scene.add(sign);
  obstacles.push({x,z,r:3});
  hitProxy(x,z-2.6,2.2,3,{kind:'shop'});
})();

// ---- Werkbank
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

// ------------------------------------------------------------------ Baum-Bausatz
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
// Fruchtplätze hängen unter dem Kronenrand — in der Ego-Sicht gut sichtbar
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
    // Ackerboden 3×3
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
  // Blöcke in die gemeinsamen Batches schreiben
  emit(){
    if(!this.unlocked||this.stage==='empty') { this.canopyY=1.5; this.canopyR=1; return; }
    const {x,z}=this, s=this.stage;
    if(s==='dead'){
      blk(D.dead,x,0,z); blk(D.dead,x,1,z);
      this.canopyY=2; this.canopyR=.6; return;
    }
    if(s==='seed'){
      if(this.growth>.5) blk(D.leaf,x,0,z,.35);
      this.canopyY=1; this.canopyR=.5; return;
    }
    if(s==='sprout'){
      blk(D.log,x,0,z,.55); blk(D.leaf,x,1,z,.7);
      this.canopyY=1.6; this.canopyR=.6; return;
    }
    const big=s!=='young';
    const th=big?3:2, shape=big?CANOPY_BIG:CANOPY_SMALL;
    for(let y=0;y<th;y++) blk(D.log,x,y,z);
    const base=th-1;
    for(const [dx,dy,dz] of shape) blk(D.leaf,x+dx,base+dy,z+dz);
    // Wildwuchs: zusätzliche Blätter ringsum
    if(this.over>.5){
      const r=mulberry(700+this.i);
      const n=Math.round(this.over*7);
      for(let k=0;k<n;k++){
        const a=r()*6.28, rad=2.6+r()*.8;
        blk(D.leaf,x+Math.round(Math.cos(a)*rad),base+Math.round(r()*2),z+Math.round(Math.sin(a)*rad));
      }
    }
    this.canopyY=base+1.6; this.canopyR=big?2.4:1.4;
    if(dominikMat&&(s==='fruiting'||s==='overripe')){
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
    // Sichtbarkeiten gelten auch für gesperrte und leere Beete
    this.sign.visible=!this.unlocked;
    this.soil.visible=this.unlocked;
    this.num.visible=this.unlocked&&this.stage==='empty';
    if(!this.unlocked||this.stage==='empty'){
      this.icon.visible=this.icon2.visible=false;
      return;
    }
    const alive=ALIVE.includes(this.stage);
    if(alive&&dt>0){
      const dayF=1+.11*(state.day-1);
      const drink=(this.stage==='seed'||this.stage==='sprout')?1/72:1/50;
      this.water=clamp(this.water-dt*drink*dayF*(this.premium?1.18:1),0,1);
      if(this.water<=0){
        this.wilt+=dt;
        if(this.wilt>=WILT_LIMIT){ this.die('💀 Baum # ist vertrocknet. Wasser, Mann!'); return; }
      } else this.wilt=0;
      if(this.pest){
        this.pest.ttl-=dt;
        if(this.pest.ttl<=0){ this.die('🪲 Die Blattläuse haben Baum # gefressen!'); return; }
      }
      if(['young','mature','blossom','fruiting','overripe'].includes(this.stage)){
        const o0=this.over;
        this.over=clamp(this.over+dt/58,0,1);
        if((o0<.5)!==(this.over<.5)) treesDirty=true;
      }
      if(GROWABLE.includes(this.stage)&&this.water>0&&!this.pest){
        let rate=1/STAGE_DUR[this.stage];
        if(this.premium) rate*=1.35;
        if(this.over>.6) rate*=.6;
        const g0=this.growth;
        this.growth+=dt*rate;
        if(this.stage==='seed'&&(g0<.5)!==(this.growth<.5)) treesDirty=true;
        if(this.growth>=1){
          this.stage=STAGE_NEXT[this.stage]; this.growth=0; this.t=0; treesDirty=true;
          if(this.stage==='fruiting'){
            this.fruits=clamp(rndi(2,4)+(this.premium?1:0)-(this.over>.6?1:0),1,5);
            toast(pick(['🍑 Dominiks reif an Baum #N!','🍑 Baum #N trägt prächtige Dominiks!',
                        '🍑 Erntezeit an Baum #N!']).replace('#N','#'+(this.i+1)),'good');
            SND.done();
          }
        }
      }
      if(this.stage==='fruiting'){
        this.t+=dt;
        if(this.t>=FRUIT_WINDOW){ this.stage='overripe'; this.t=0; treesDirty=true;
          toast('🫠 Die Dominiks an Baum #'+(this.i+1)+' werden matschig!','warn'); }
      } else if(this.stage==='overripe'){
        this.t+=dt;
        if(this.t>=OVERRIPE_WINDOW){
          this.stage='mature'; this.growth=.2; this.fruits=0; this.t=0; treesDirty=true;
          toast('💦 Platsch. Baum #'+(this.i+1)+': alles zu Matsch.','bad'); SND.splat();
        }
      }
    }
    // Symbole
    const icons=[];
    if(this.pest) icons.push('🪲');
    if(alive&&this.water<.32) icons.push('💧');
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
    if(ALIVE.includes(this.stage)&&this.water<.32) a.push('💧');
    if(this.stage==='fruiting') a.push('🍑');
    if(this.stage==='overripe') a.push('⏳');
    return a;
  }
  label(){
    const n='Baum #'+(this.i+1);
    if(!this.unlocked) return [n,'Freies Beet — '+plotPrice()+' €'];
    const names={empty:'Leeres Beet',seed:'Samen',sprout:'Keimling',young:'Jungbaum',
      mature:'Ausgewachsen',blossom:'Blüte',fruiting:'Reif! 🍑',overripe:'ÜBERREIF! 🫠',dead:'Vertrocknet 💀'};
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

// ------------------------------------------------------------------ Rohstoffe: Wald & Steinbruch
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

// ------------------------------------------------------------------ Dominik-Kopf-Block
let dominikMat=null, fruitMesh=null;
function makeFruitBatch(img){
  const c=document.createElement('canvas'); c.width=c.height=64;
  const g=c.getContext('2d');
  g.fillStyle='#3b2a1e'; g.fillRect(0,0,64,64);           // Haarfarbe als Hintergrund
  g.imageSmoothingEnabled=true;
  g.drawImage(img,100,150,812,812,0,0,64,64);             // quadratischer Gesichtsausschnitt
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestMipmapLinearFilter;
  dominikMat=t;
  fruitMesh=batch(t,90);
}

// ------------------------------------------------------------------ Charaktere
const CHARS=[
  {key:'manni',name:'Manni',h:1.9,x:3.4,z:23.4,color:'#ff6b4a',role:'shop',
   lines:['Samen, Pestizid, Beete — alles da.','Kaufen, pflanzen, reich werden. In der Reihenfolge.',
          'Werkzeug? Bau dir das an der Werkbank, ich bin kein Schmied.']},
  {key:'jannes',name:'Jannes',h:1.88,x:15,z:21.2,color:'#4ab0ff',role:'stall',
   lines:['Ich zahle Tagespreis. Der Markt ist grausam.','Nur reife Dominiks! Matsch nehme ich nicht.',
          'Das Fest braucht Dominiks. Viele Dominiks.']},
  {key:'benni',name:'Benni',h:1.95,x:-4,z:12,color:'#57e06b',role:'wander',
   lines:['Ich helfe gleich. Erst noch eine Runde dribbeln.','Gießen soll wichtig sein, hab ich gehört.',
          'Im Wald gibt es Holz. Logisch eigentlich.','Schöne Plantage. Wer macht die ganze Arbeit?']},
];
const texLoader=new THREE.TextureLoader();
const loadTex=url=>new Promise((res,rej)=>texLoader.load(url,t=>{
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  res(t);
},undefined,()=>rej(new Error('Bild fehlt: '+url))));
const billboards=[];
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
    Object.assign(c,{group:g,bb,bubble,bubbleT:0,sayT:rnd(6,16),wt:0,tx:c.x,tz:c.z,mesh:bb});
    obstacles.push({x:c.x,z:c.z,r:.6,char:c});
    hitProxy(c.x,c.z,1.1,2.1,{kind:'char',char:c}).userData.follow=c;
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

// ------------------------------------------------------------------ Blöcke neu schreiben
function rebuildBlocks(){
  reset(D.leaf); reset(D.log); reset(D.dead); reset(D.rock);
  if(fruitMesh) reset(fruitMesh);
  for(const p of plots) p.emit();
  emitNodes();
  flush(D.leaf); flush(D.log); flush(D.dead); flush(D.rock);
  if(fruitMesh) flush(fruitMesh);
  treesDirty=false;
}

// ------------------------------------------------------------------ Aktionen
function plotPrice(){
  const bought=upg.plots;
  return [25,40,55,75,100,130,165,205][Math.min(bought,7)];
}
function actionsFor(tg){
  if(!tg) return [];
  const out=[];
  const add=(id,ok,sub)=>out.push({id,ok:ok===true,reason:ok===true?'':ok,sub});
  if(tg.kind==='plot'){
    const p=tg.plot;
    if(!p.unlocked){
      add('buyplot',state.money>=plotPrice()?true:'Zu teuer',plotPrice()+' €');
      return out;
    }
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
  if(tg.kind==='stall'){ add('sell',player.carry>0?true:'Nichts dabei',
    player.carry?'×'+player.carry+' → '+Math.round(player.carry*state.price)+' €':''); return out; }
  if(tg.kind==='shop'){ add('shop',true); return out; }
  if(tg.kind==='bench'){ add('craft',true); return out; }
  if(tg.kind==='node'){
    const n=tg.node;
    if(!n.alive) return out;
    if(n.kind==='tree') add('chop',true,'→ 🪵');
    else add('mine',true,'→ 🪨');
    return out;
  }
  if(tg.kind==='char'){
    const c=tg.char;
    if(c.role==='shop') add('shop',true);
    else if(c.role==='stall') add('sell',player.carry>0?true:'Nichts dabei',
      player.carry?'×'+player.carry+' → '+Math.round(player.carry*state.price)+' €':'');
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
    case 'fert':     inv.fert--; p.growth=clamp(p.growth+.45,0,.99); p.water=clamp(p.water-.15,.05,1); break;
    case 'harvest':{
      const space=bagCap()-player.carry;
      const avail=p.stage==='overripe'?Math.max(1,Math.ceil(p.fruits/2)):p.fruits;
      const take=Math.min(avail,space);
      player.carry+=take; state.harvested+=take;
      toast('🍑 '+take+' Dominik'+(take>1?'s':'')+' geerntet!','good',1800);
      if(p.stage==='overripe'||p.fruits-take<=0){
        p.stage='mature'; p.growth=.2; p.fruits=0; p.t=0;
      } else p.fruits-=take;
      treesDirty=true;
      break;
    }
    case 'refill':   player.can=canCap(); toast('🚰 Kanne voll.','',1400); break;
    case 'sell':{
      const sum=Math.round(player.carry*state.price);
      state.money+=sum; state.earned+=sum;
      toast('💰 '+player.carry+' Dominiks für '+sum+' € verkauft!','good',2400);
      const j=CHARS.find(c=>c.role==='stall');
      if(j) say(j,pick(['Geht sofort weg, danke!','Solide Ware. Tagespreis!','Das Fest wird gerettet!']),3000);
      player.carry=0; SND.coin();
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
    case 'shop':     openShop(); return;
    case 'craft':    openCraft(); return;
    case 'talk':     say(tg.char,pick(tg.char.lines),4200); SND.tap(); return;
    case 'buyplot':{
      const price=plotPrice();
      if(state.money<price) return;
      state.money-=price; upg.plots++;
      tg.plot.unlocked=true; treesDirty=true;
      toast('🌍 Beet #'+(tg.plot.i+1)+' gekauft!','good');
      SND.coin();
      break;
    }
  }
  if(id!=='sell') SND.done();
  updateHUD();
}

// ------------------------------------------------------------------ Aufgaben (sanfter Einstieg)
const QUESTS=[
  {t:'Pflanze einen Samen in ein Beet',      hint:'Stell dich vor ein Beet und tippe „Pflanzen"',
   at:()=>plots[0], done:()=>plots.some(p=>p.stage!=='empty'&&p.stage!=='dead')},
  {t:'Gieß den frisch gepflanzten Baum',     hint:'Ohne Wasser wächst nichts',
   at:()=>plots.find(p=>ALIVE.includes(p.stage))||plots[0], done:()=>state.q_water},
  {t:'Hack im Wald einen Baum um (🪵)',      hint:'Der Wald liegt hinter den Beeten',
   at:()=>nodes.find(n=>n.kind==='tree'&&n.alive), done:()=>res.wood>=1},
  {t:'Klopf im Steinbruch Stein ab (🪨)',    hint:'Die Felsen liegen im Westen',
   at:()=>nodes.find(n=>n.kind==='rock'&&n.alive), done:()=>res.stone>=1},
  {t:'Ernte reife Dominiks 🍑',              hint:'Warte, bis der Baum Köpfe trägt',
   at:()=>plots.find(p=>p.stage==='fruiting'||p.stage==='overripe')||plots.find(p=>ALIVE.includes(p.stage)),
   done:()=>state.harvested>=1},
  {t:'Verkauf sie bei Jannes am Feststand',  hint:'Der Feststand steht rechts hinten',
   at:()=>({x:STALL.x,z:STALL.z}), done:()=>state.earned>=1},
  {t:'Bau dir etwas an der Werkbank 🔨',     hint:'Aus Holz und Stein wird Werkzeug',
   at:()=>({x:BENCH.x,z:BENCH.z}), done:()=>state.crafted>=1},
];
let questI=0;
function currentQuest(){ return state.tutorial?QUESTS[questI]:null; }
function checkQuest(){
  if(!state.tutorial) return;
  const q=QUESTS[questI];
  if(q&&q.done()){
    questI++; SND.quest();
    if(questI>=QUESTS.length){
      state.tutorial=false; state.dayT=.12;
      showModal(`<h2>🎉 Du hast den Dreh raus!</h2>
        <p>Ab jetzt läuft die Uhr: <b>${GOAL} € Umsatz bis zum Ende von Tag ${MAXDAY}</b>.</p>
        <p>Achte auf die Symbole über den Bäumen — 💧 durstig, ✂️ zugewuchert,
        🪲 Blattläuse, 🍑 reif, ⏳ gleich matschig.</p>
        <div class="btnrow"><button class="primary" data-act="resume">Los geht's! 🚜</button></div>`);
    } else {
      toast('✅ Erledigt! Nächste Aufgabe: '+QUESTS[questI].t,'good',3600);
    }
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
  if(tg.kind==='stall') return ['💰 Feststand','Tagespreis: '+Math.round(state.price)+' €'];
  if(tg.kind==='shop') return ['🛒 Laden','Samen, Spray, Beete'];
  if(tg.kind==='bench') return ['🔨 Werkbank','Werkzeug aus 🪵 und 🪨'];
  if(tg.kind==='node') return tg.node.kind==='tree'?['🌲 Waldbaum','Gibt Holz']:['🪨 Fels','Gibt Stein'];
  if(tg.kind==='char') return [tg.char.name,
    {shop:'Ladenbesitzer',stall:'Aufkäufer',wander:'Hilfskraft (theoretisch)'}[tg.char.role]];
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
  if(!a.ok){ toast('⛔ '+a.reason,'warn',1800); SND.fail(); return; }
  if(state.paused||state.over) return;
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
    lookId=e.pointerId; lookX=e.clientX; lookY=e.clientY;
    if(document.pointerLockElement!==renderer.domElement) renderer.domElement.requestPointerLock?.();
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
  if(e.code==='KeyP') togglePause();
});
addEventListener('keyup',e=>{keys[e.code]=false;});

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
  const sp=walkSpeed()*sprint*(state.paused?0:1);
  const sin=Math.sin(player.yaw), cos=Math.cos(player.yaw);
  let dx=(mx*cos+mz*sin)*sp*dt;
  let dz=(-mx*sin+mz*cos)*sp*dt;
  const speed=Math.hypot(dx,dz)/Math.max(dt,1e-4);
  const R=.5;
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
    player.bob+=dt*speed*1.5;
    player.stepT+=dt*speed;
    if(player.stepT>3.1){ player.stepT=0; SND.step(); }
  } else player.bob+=dt*.6;
  const bobY=Math.sin(player.bob)*(speed>.4?.045:.012);
  camera.position.set(player.x,1.7+bobY,player.z);
  camera.rotation.set(0,0,0);
  camera.rotateY(player.yaw);
  camera.rotateX(player.pitch);
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
}

// ------------------------------------------------------------------ NPCs
const _wp=new THREE.Vector3();
function updateChars(dt){
  for(const c of CHARS){
    if(c.role==='wander'&&!state.paused){
      c.wt-=dt;
      if(c.wt<=0){ c.wt=rnd(3,7); c.tx=rnd(-12,12); c.tz=rnd(-16,16); }
      const dx=c.tx-c.group.position.x, dz=c.tz-c.group.position.z, d=Math.hypot(dx,dz);
      if(d>.4){
        const s=Math.min(1.9*dt,d);
        c.group.position.x+=dx/d*s; c.group.position.z+=dz/d*s;
        c.mesh.position.y=c.h/2+Math.abs(Math.sin(state.t*7))*.06;
      }
      const ob=obstacles.find(o=>o.char===c);
      if(ob){ ob.x=c.group.position.x; ob.z=c.group.position.z; }
      const px=interactives.find(m=>m.userData.follow===c);
      if(px) px.position.set(c.group.position.x,px.position.y,c.group.position.z);
    }
    if(!state.paused){
      c.sayT-=dt;
      if(c.sayT<=0){ c.sayT=rnd(16,34);
        if(Math.hypot(player.x-c.group.position.x,player.z-c.group.position.z)<16)
          say(c,pick(c.lines),4000);
      }
      if(c.bubbleT>0){ c.bubbleT-=dt; if(c.bubbleT<=0) c.bubble.visible=false; }
    }
  }
}
function updateBillboards(){
  for(const m of billboards){
    m.getWorldPosition(_wp);
    m.rotation.y=Math.atan2(camera.position.x-_wp.x,camera.position.z-_wp.z)-
      (m.parent?m.parent.rotation.y:0);
  }
}

// ------------------------------------------------------------------ Tag & Wirtschaft
function spawnPests(dt){
  if(state.tutorial||state.day<2) return;
  const active=plots.filter(p=>p.pest).length;
  if(active>=Math.min(3,Math.ceil(state.day/3))) return;
  for(const p of plots){
    if(!p.unlocked||p.pest) continue;
    if(!['young','mature','blossom','fruiting','overripe'].includes(p.stage)) continue;
    if(Math.random()<dt*(.0022+.0012*state.day)){
      const ttl=Math.max(14,26-state.day);
      p.pest={ttl,max:ttl};
      toast('🪲 Blattläuse an Baum #'+(p.i+1)+'! Spray, schnell!','bad',4000);
      SND.alarm();
      return;
    }
  }
}
function newDay(){
  state.day++;
  if(state.day>MAXDAY&&!state.won){
    endScreen(false,`Tag ${MAXDAY} ist vorbei und die Festkasse blieb bei ${state.earned} € `+
      `statt der nötigen ${GOAL} €. Das Fest fällt aus. Die Dorfjugend ist untröstlich.`);
    return;
  }
  toast('🌅 Tag '+state.day+(state.day<=MAXDAY?'/'+MAXDAY:'')+' — '+
    pick(['die Blattläuse werden mutiger.','die Sonne brennt, Bäume dursten schneller.',
          'die Dominik-Börse wird nervös.','die Nachfrage steigt!']),'',3400);
}
function checkEnd(){
  if(!state.won&&state.earned>=GOAL){
    state.won=true;
    endScreen(true,`Die Festkasse steht bei ${state.earned} € — Ziel erreicht! `+
      `Dominiks, so weit das Auge reicht. Das ErnteDominiksFest ist gerettet.`);
    return;
  }
  const anyAlive=plots.some(p=>p.unlocked&&ALIVE.includes(p.stage));
  if(!anyAlive&&!player.carry&&inv.seed<1&&inv.bio<1&&state.money<5&&!state.won&&!state.tutorial)
    endScreen(false,'Pleite! Keine Bäume, keine Samen, kein Geld. Dominik ist untröstlich.');
}

// ------------------------------------------------------------------ HUD
const HOT=[
  {ic:'💧',get:()=>player.can+'/'+canCap(),warn:()=>player.can===0,tip:'Gießkanne'},
  {ic:'🍑',get:()=>player.carry+'/'+bagCap(),warn:()=>player.carry>=bagCap(),tip:'Erntekorb'},
  {ic:'🌱',get:()=>inv.seed,warn:()=>inv.seed===0,tip:'Samen'},
  {ic:'🪵',get:()=>res.wood,tip:'Holz'},
  {ic:'🪨',get:()=>res.stone,tip:'Stein'},
  {ic:'🧪',get:()=>inv.pest,tip:'Spray'},
  {ic:'💩',get:()=>inv.fert,tip:'Kompost'},
];
let hotEls=null, hotCache='';
function buildHotbar(){
  const box=el('hotbar');
  box.innerHTML='';
  hotEls=HOT.map(h=>{
    const d=document.createElement('div');
    d.className='slot'; d.title=h.tip;
    d.innerHTML=`<span class="i">${h.ic}</span><span class="n"></span>`;
    box.appendChild(d);
    return d;
  });
}
function updateHUD(){
  el('hMoney').textContent=state.money;
  el('hGoal').textContent=state.won?'✔ '+state.earned:state.earned+'/'+GOAL;
  el('hDay').textContent=state.tutorial?'—':(state.day<=MAXDAY?state.day+'/'+MAXDAY:state.day);
  el('hPrice').textContent=Math.round(state.price);
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
  if(q&&q.at){
    const t=q.at();
    if(t) marks.push({x:t.x,y:2.4,z:t.z,ic:'⭐',tag:'Ziel',always:true});
  }
  for(const m of marks){
    _av.set(m.x,m.y,m.z).project(camera);
    const behind=_av.z>1;
    const onScreen=!behind&&Math.abs(_av.x)<.95&&Math.abs(_av.y)<.95;
    if(onScreen&&!m.always) continue;
    let ex=_av.x, ey=_av.y;
    let px,py;
    if(onScreen){
      px=cw/2+ex*cw/2; py=ch/2-ey*ch/2;
    } else {
      if(behind){ ex=-ex; ey=-ey; }
      const len=Math.max(Math.abs(ex),Math.abs(ey))||1;
      ex/=len; ey/=len;
      px=cw/2+ex*cw*.44; py=ch/2-ey*ch*.40;
    }
    let e=alertPool[n];
    if(!e){ e=document.createElement('div'); e.className='alert'; box.appendChild(e); alertPool[n]=e; }
    e.style.display='block';
    e.innerHTML=m.ic+'<b>'+m.tag+'</b>';
    e.style.left=clamp(px,30,cw-30)+'px';
    e.style.top =clamp(py,58,ch-96)+'px';
    n++;
  }
  for(let i=n;i<alertPool.length;i++) alertPool[i].style.display='none';
}

// ------------------------------------------------------------------ Laden & Werkbank
const SHOP=[
  {id:'seed',ico:'🌱',nm:'Dominik-Samen',ds:'Der Klassiker.',price:()=>5,
   own:()=>'Vorrat: '+inv.seed,buy:()=>inv.seed++},
  {id:'bio',ico:'🌟',nm:'Bio-Samen',ds:'35 % schneller, +1 Frucht, mehr Durst.',price:()=>14,
   own:()=>'Vorrat: '+inv.bio,buy:()=>inv.bio++},
  {id:'pest',ico:'🧪',nm:'Blattlaus-Spray',ds:'Rettet befallene Bäume.',price:()=>8,
   own:()=>'Vorrat: '+inv.pest,buy:()=>inv.pest++},
];
const modal=el('modal'), mbox=el('mbox');
function showModal(html){ mbox.innerHTML=html; modal.classList.remove('hidden'); state.paused=true;
  if(document.pointerLockElement) document.exitPointerLock(); }
function hideModal(){ modal.classList.add('hidden'); if(!state.over) state.paused=false; }
function openShop(){
  let h='<h2>🛒 Mannis Laden</h2><div id="shopmoney">💰 '+state.money+' €</div><div class="cols">';
  for(const it of SHOP){
    const pr=it.price();
    h+=`<div class="shopitem"><div class="ico">${it.ico}</div><div class="txt">
      <div class="nm">${it.nm}</div><div class="ds">${it.ds}</div><div class="own">${it.own()}</div></div>
      <button data-buy="${it.id}" ${pr>state.money?'disabled':''}>${pr} €</button></div>`;
  }
  h+='</div><p style="opacity:.75;font-size:11.5px;margin-top:8px">🔨 Werkzeug baust du an der '+
     'Werkbank aus 🪵 Holz und 🪨 Stein. Freie Beete kaufst du direkt draußen am Schild.</p>'+
     '<div class="btnrow"><button class="primary" data-act="close">Zurück 🚜</button></div>';
  showModal(h);
}
function openCraft(){
  let h='<h2>🔨 Werkbank</h2><div id="shopmoney">🪵 '+res.wood+'   🪨 '+res.stone+'   🍑 '+player.carry+'</div><div class="cols">';
  for(const r of RECIPES){
    const st=canCraft(r);
    const cost=Object.entries(r.cost).map(([k,v])=>v+'× '+RESNAME[k]).join(' + ');
    const lvl=r.max!=null?`Stufe ${r.lvl()}/${r.max}`:(r.out||'');
    h+=`<div class="shopitem"><div class="ico">${r.ic}</div><div class="txt">
      <div class="nm">${r.nm}</div><div class="ds">${r.ds}</div>
      <div class="own">${cost} → ${lvl}</div></div>
      <button data-craft="${r.id}" ${st===true?'':'disabled'}>${st==='max'?'Max ✔':'Bauen'}</button></div>`;
  }
  h+='</div><div class="btnrow"><button class="primary" data-act="close">Zurück 🚜</button></div>';
  showModal(h);
}
mbox.addEventListener('pointerdown',e=>{
  const b=e.target.closest('button'); if(!b) return;
  e.stopPropagation();
  if(b.dataset.buy){
    const it=SHOP.find(s=>s.id===b.dataset.buy), pr=it.price();
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
    updateHUD();
    // erst die Werkbank neu zeichnen, dann Aufgaben prüfen — sonst
    // überschreibt die Werkbank ein eventuelles Abschluss-Fenster
    openCraft(); checkQuest();
  }
  else if(b.dataset.act==='close'||b.dataset.act==='resume'){ hideModal(); }
  else if(b.dataset.act==='start'){ localStorage.setItem('edf3d_tut','1'); hideModal(); state.started=true; }
  else if(b.dataset.act==='restart'){ location.reload(); }
  else if(b.dataset.act==='endless'){ state.over=false; hideModal();
    toast('🌾 Endlos-Modus! Wie viele Dominiks schaffst du?','good'); }
  else if(b.dataset.act==='classic'){ location.href='./2d.html'; }
});
function showIntro(){
  const ctrl=isTouch
    ? 'Links wischen = laufen · rechts wischen = umsehen · Aktionen rechts unten antippen.'
    : 'WASD laufen · Maus umsehen · <b>E</b> Aktion.';
  showModal(`<h2>🌳 ErnteDominiksFest</h2>
  <p style="font-size:14px">Auf dem Fest fehlen <b>Dominiks</b>. Züchte sie auf Bäumen,
  ernte die Köpfe und verkauf sie.</p>
  <p style="font-size:13px;opacity:.9">${ctrl}</p>
  <p style="font-size:13px">Oben steht immer, <b>was als Nächstes zu tun ist</b> — ein ⭐ zeigt dir den Weg.</p>
  <div class="btnrow">
    <button data-act="classic" style="background:#2f4f2f;flex:0 0 auto;font-size:12.5px">2D 🕹️</button>
    <button class="primary" data-act="start">Loslegen 🚜</button>
  </div>`);
}
function endScreen(win,msg){
  state.over=true; state.paused=true;
  const best=Math.max(state.earned,+(localStorage.getItem('edf3d_best')||0));
  localStorage.setItem('edf3d_best',best);
  showModal(`<h2>${win?'🎉 Das Fest ist gerettet!':'😢 Das Fest fällt aus …'}</h2>
  <p>${msg}</p>
  <p>📊 <b>${state.harvested}</b> Dominiks · <b>${state.earned} €</b> Umsatz
  (Rekord: ${best} €) · 🪵${state.chopped} Bäume gefällt · Tag ${state.day}.</p>
  ${win?'<div class="btnrow"><button data-act="endless">Weiterspielen 🌾</button>'+
        '<button class="primary" data-act="restart">Neu starten 🔄</button></div>'
       :'<div class="btnrow"><button class="primary" data-act="restart">Nochmal! 🔄</button></div>'}`);
}
function togglePause(){
  if(state.over) return;
  if(modal.classList.contains('hidden'))
    showModal('<h2>⏸️ Pause</h2><p>Die Dominiks warten. Aber nicht ewig.</p>'+
      '<div class="btnrow"><button class="primary" data-act="resume">Weiter 🚜</button></div>');
  else hideModal();
}
el('btnPause').addEventListener('pointerdown',e=>{e.stopPropagation();togglePause();});
el('btnHelp').addEventListener('pointerdown',e=>{e.stopPropagation();showIntro();});
function startGameIfNeeded(){
  if(!state.started&&modal.classList.contains('hidden')){ state.started=true; state.paused=false; }
}

// ------------------------------------------------------------------ Tageslicht
const C={dayTop:new THREE.Color(0x3f86c8),evTop:new THREE.Color(0xd97b3a),nTop:new THREE.Color(0x16203f),
  dayBot:new THREE.Color(0xbfe0ef),evBot:new THREE.Color(0xf0b070),nBot:new THREE.Color(0x27324f),
  sunDay:new THREE.Color(0xfff3d6),sunEv:new THREE.Color(0xffb070),
  top:new THREE.Color(),bot:new THREE.Color()};
function updateSky(){
  const d=state.tutorial?.35:state.dayT;
  const dawn=clamp((.18-d)*5,0,1), dusk=clamp((d-.75)*4,0,1);
  const night=clamp((d-.9)*10,0,1), warm=Math.max(dawn,dusk);
  const top=C.top.copy(C.dayTop).lerp(C.evTop,warm*.45).lerp(C.nTop,night*.75);
  const bot=C.bot.copy(C.dayBot).lerp(C.evBot,warm*.5).lerp(C.nBot,night*.7);
  skyMat.uniforms.top.value.copy(top);
  skyMat.uniforms.bot.value.copy(bot);
  scene.fog.color.copy(bot);
  renderer.setClearColor(bot);
  sun.intensity=lerp(2.0,.55,night);
  sun.color.copy(C.sunDay).lerp(C.sunEv,warm*.8);
  hemi.intensity=lerp(1.25,.5,night);
  const ang=Math.PI*(.15+d*.7);
  sun.position.set(Math.cos(ang)*44,Math.max(8,Math.sin(ang)*48),16);
}

// ------------------------------------------------------------------ Schleife
function update(dt){
  if(!state.paused&&!state.over){
    state.t+=dt;
    if(!state.tutorial){
      state.dayT+=dt/DAYLEN;
      if(state.dayT>=1){ state.dayT=0; newDay(); }
      el('daybar').style.width=(state.dayT*100)+'%';
    }
    state.priceT+=dt;
    if(state.priceT>=2){
      state.priceT=0;
      state.price=clamp(state.price+rnd(-1,1)*(1+state.day*.14),6,28);
      el('hPrice').textContent=Math.round(state.price);
    }
    spawnPests(dt);
    for(const p of plots) p.update(dt);
    updateNodes(dt);
    updateAction(dt);
    state.checkT+=dt;
    if(state.checkT>=.5){ state.checkT=0; checkQuest(); checkEnd(); updateHUD(); }
  } else {
    for(const p of plots) p.update(0);
  }
  if(treesDirty) rebuildBlocks();
  updatePlayer(dt);
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
  loadTex('dominik.png').then(t=>{makeFruitBatch(t.image);}),
]).then(()=>{
  setupChars();
  buildHotbar();
  rebuildBlocks();
  resize(); updateHUD(); updateQuestUI();
  el('boot').remove();
  el('hint').innerHTML=isTouch?'':'WASD laufen · Maus umsehen<br>E Aktion · P Pause';
  if(localStorage.getItem('edf3d_tut')){ state.paused=false; state.started=true; }
  else showIntro();
  requestAnimationFrame(frame);
}).catch(e=>{
  el('boot').innerHTML='😢 '+e.message;
  console.error(e);
});

// ------------------------------------------------------------------ Debug-API
window.game={state,inv,res,upg,plots,player,CHARS,nodes,RECIPES,
  get target(){return target;},
  get quest(){return questI;},
  actionsFor,runAction,openShop,openCraft,checkQuest,
  rebuild(){ treesDirty=true; },
  get counts(){ return {fruit:fruitMesh?fruitMesh.count:-1,leaf:D.leaf.count,
    log:D.log.count,rock:D.rock.count,dead:D.dead.count}; },
  sync(){ updatePlayer(0); updateTarget(); },
  updateTarget(){ updatePlayer(0); updateTarget(); },
  setMove(x,y){ move.x=x; move.y=y; },
  tp(x,z,yaw){ player.x=x; player.z=z; if(yaw!=null) player.yaw=yaw; this.sync(); },
  lookAt(x,z){ player.yaw=Math.atan2(player.x-x,player.z-z); player.pitch=0; this.sync(); },
  act(id){ const a=actionsFor(target).find(v=>v.id===id); if(a) startAction(a); return !!a; },
  tick(sec){ const s=.05; for(let t=0;t<sec;t+=s) update(s); },
};
