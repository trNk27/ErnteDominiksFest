/* =====================================================================
   ErnteDominiksFest 3D — Ego-Perspektive, für Handy im Querformat
   Ein satirisches Plantagenspiel. Dominiks wachsen auf Bäumen.
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
  done:()=>{tone(523,.08,'triangle',.09);tone(784,.1,'triangle',.09,.07);},
  coin:()=>{tone(988,.07,'square',.07);tone(1319,.12,'square',.07,.06);},
  alarm:()=>{tone(220,.18,'sawtooth',.09);tone(165,.25,'sawtooth',.09,.15);},
  fail:()=>tone(160,.15,'square',.07),
  splat:()=>tone(85,.22,'sine',.15),
  step:()=>tone(90+Math.random()*30,.05,'triangle',.03),
};

// ------------------------------------------------------------------ Balance
const DAYLEN=80, MAXDAY=10, GOAL=450;   // GOAL = Gesamtumsatz (Festkasse), nicht Barvermögen
const STAGE_DUR={seed:8,sprout:12,young:16,mature:12,blossom:8};
const STAGE_NEXT={seed:'sprout',sprout:'young',young:'mature',mature:'blossom',blossom:'fruiting'};
const FRUIT_WINDOW=32, OVERRIPE_WINDOW=16, WILT_LIMIT=14;
const GROWABLE=['seed','sprout','young','mature','blossom'];
const ALIVE=[...GROWABLE,'fruiting','overripe'];
const REACH=4.2;

const COLS=[-9,0,9], ROWS=[-18,-9,0,9];
const WELL={x:-15,z:23}, STALL={x:15,z:23}, SHED={x:0,z:25};
const BOUND={x0:-25,x1:25,z0:-25,z1:29};

const state={t:0,day:1,dayT:.15,price:12,priceT:0,money:30,paused:true,over:false,won:false,
  earned:0,harvested:0,checkT:0,started:false};
const inv={seed:3,bio:0,pest:1,fert:0};
const upg={can:0,shears:0,bag:0,boots:0,plots:0};
const canCap=()=>5+upg.can*2;
const bagCap=()=>5+upg.bag*3;
const trimMul=()=>[1,.68,.48][upg.shears];
const walkSpeed=()=>5.4*(1+upg.boots*.16);

const player={x:0,z:18,yaw:Math.PI,pitch:-.05,can:5,carry:0,bob:0,act:null,stepT:0};

// ------------------------------------------------------------------ Aktionen
const ACTS={
  plant   :{ic:'🌱',label:'Pflanzen',       dur:2.2},
  plantbio:{ic:'🌟',label:'Bio pflanzen',   dur:2.2},
  water   :{ic:'💧',label:'Gießen',         dur:1.6},
  trim    :{ic:'✂️',label:'Schneiden',      dur:3.0},
  spray   :{ic:'🧪',label:'Spritzen',       dur:2.0},
  fert    :{ic:'💩',label:'Düngen',         dur:1.8},
  harvest :{ic:'🧺',label:'Ernten',         dur:2.4},
  refill  :{ic:'🚰',label:'Kanne füllen',   dur:1.8},
  sell    :{ic:'💰',label:'Verkaufen',      dur:1.4},
  shop    :{ic:'🛒',label:'Laden öffnen',   dur:0},
  talk    :{ic:'💬',label:'Ansprechen',     dur:0},
  buyplot :{ic:'🌍',label:'Parzelle kaufen',dur:0},
};

// ------------------------------------------------------------------ Toasts
function toast(msg,type='',ms=3000){
  const box=el('toasts');
  while(box.children.length>=4) box.firstChild.remove();
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
scene.fog=new THREE.Fog(0x9fd0e8,45,135);
camera=new THREE.PerspectiveCamera(74,1,.1,400);
camera.position.set(player.x,1.7,player.z);

const hemi=new THREE.HemisphereLight(0xcfe8ff,0x4a7a3a,1.35); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff3d6,2.1);
sun.position.set(24,40,14); sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);
const sc=sun.shadow.camera;
sc.left=-32;sc.right=32;sc.top=32;sc.bottom=-32;sc.near=1;sc.far=110;
sun.shadow.bias=-0.0015; sun.shadow.normalBias=0.03;
scene.add(sun);

// Himmel
const skyMat=new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{top:{value:new THREE.Color(0x3f86c8)},bot:{value:new THREE.Color(0xbfe0ef)}},
  vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform vec3 top;uniform vec3 bot;varying vec3 vP;'+
    'void main(){float h=normalize(vP).y*.5+.5;gl_FragColor=vec4(mix(bot,top,smoothstep(.42,.95,h)),1.);}'
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(320,20,12),skyMat));

// ------------------------------------------------------------------ Texturen
function canvasTex(w,h,draw,repeat){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  if(repeat){ t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(repeat,repeat); }
  return t;
}
const grassTex=canvasTex(256,256,(g,w,h)=>{
  g.fillStyle='#5d9c42'; g.fillRect(0,0,w,h);
  const r=mulberry(11);
  for(let i=0;i<900;i++){
    const x=r()*w,y=r()*h,s=1+r()*3.5;
    const c=['#6cb14e','#559440','#74bb55','#4d8a3b','#8cc063'][Math.floor(r()*5)];
    g.fillStyle=c; g.fillRect(x,y,s,s*1.9);
  }
  for(let i=0;i<26;i++){ // Blümchen
    g.fillStyle=r()>.5?'#ffe08a':'#f4a0b6';
    g.beginPath(); g.arc(r()*w,r()*h,1.9,0,7); g.fill();
  }
},34);
const dirtTex=canvasTex(128,128,(g,w,h)=>{
  g.fillStyle='#7d5a34'; g.fillRect(0,0,w,h);
  const r=mulberry(5);
  for(let i=0;i<420;i++){
    g.fillStyle=['#8d6a3f','#6b4c2b','#95744a','#5d4224'][Math.floor(r()*4)];
    g.fillRect(r()*w,r()*h,2+r()*4,2+r()*4);
  }
});
const barkTex=canvasTex(64,128,(g,w,h)=>{
  g.fillStyle='#7a5a34'; g.fillRect(0,0,w,h);
  const r=mulberry(3);
  for(let i=0;i<70;i++){
    g.fillStyle=r()>.5?'#684b2b':'#8b6a40';
    g.fillRect(r()*w,r()*h,1+r()*3,8+r()*30);
  }
});
const iconCache=new Map();
function iconTex(txt){
  if(iconCache.has(txt)) return iconCache.get(txt);
  const t=canvasTex(128,128,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.fillStyle='rgba(12,22,12,.72)';
    g.beginPath(); g.arc(w/2,h/2,54,0,7); g.fill();
    g.strokeStyle='rgba(255,255,255,.5)'; g.lineWidth=4; g.stroke();
    g.font='60px system-ui'; g.textAlign='center'; g.textBaseline='middle';
    g.fillText(txt,w/2,h/2+3);
  });
  iconCache.set(txt,t); return t;
}
// Schild-Sprite mit korrektem Seitenverhältnis (Höhe in Weltmetern)
function makeLabel(lines,color,h,depthTest=true){
  const tex=labelTex(lines,color);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest,depthWrite:false}));
  sp.scale.set(h*tex.image.width/tex.image.height,h,1);
  return sp;
}
function labelTex(lines,color='#ffd76a',bg='rgba(12,22,12,.86)'){
  const W=512,LH=54,pad=18;
  const arr=Array.isArray(lines)?lines:[lines];
  const H=Math.max(128,arr.length*LH+pad*2);
  return canvasTex(W,H,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    g.fillStyle=bg;
    const r=22; g.beginPath();
    g.moveTo(r,0);g.arcTo(w,0,w,h,r);g.arcTo(w,h,0,h,r);g.arcTo(0,h,0,0,r);g.arcTo(0,0,w,0,r);g.fill();
    g.strokeStyle='rgba(255,255,255,.35)'; g.lineWidth=4; g.stroke();
    g.fillStyle=color; g.font='bold 38px system-ui'; g.textAlign='center'; g.textBaseline='middle';
    arr.forEach((t,i)=>g.fillText(t,w/2,pad+LH/2+i*LH,w-30));
  });
}

// ------------------------------------------------------------------ Welt
const groundMat=new THREE.MeshLambertMaterial({map:grassTex});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(300,300),groundMat);
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

const obstacles=[];  // {x,z,r}
const interactives=[];

// Zaun (einfache Latten entlang der Grenzen)
(function fence(){
  const mat=new THREE.MeshLambertMaterial({color:0x8a6b40});
  const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,1.4,.16),mat,220);
  const rails=new THREE.InstancedMesh(new THREE.BoxGeometry(2.6,.09,.09),mat,220);
  const m=new THREE.Matrix4(); let pi=0,ri=0;
  const put=(x,z,rot)=>{
    m.makeRotationY(rot); m.setPosition(x,.7,z); posts.setMatrixAt(pi++,m);
    for(const y of [.55,1.05]){ m.makeRotationY(rot); m.setPosition(x+Math.cos(rot)*1.3,y,z-Math.sin(rot)*1.3);
      rails.setMatrixAt(ri++,m); }
  };
  for(let x=BOUND.x0;x<=BOUND.x1;x+=2.6){ put(x,BOUND.z0,0); put(x,BOUND.z1,0); }
  for(let z=BOUND.z0;z<=BOUND.z1;z+=2.6){ put(BOUND.x0,z,Math.PI/2); put(BOUND.x1,z,Math.PI/2); }
  posts.count=pi; rails.count=ri;
  posts.castShadow=rails.castShadow=true;
  scene.add(posts,rails);
})();

// Hügel & Bäume am Horizont (Deko)
(function scenery(){
  const r=mulberry(77);
  const trunkM=new THREE.MeshLambertMaterial({color:0x6b4c2b});
  const leafM=new THREE.MeshLambertMaterial({color:0x2f6b34,flatShading:true});
  for(let i=0;i<46;i++){
    const a=r()*Math.PI*2, d=42+r()*70;
    const x=Math.cos(a)*d, z=Math.sin(a)*d;
    const h=3+r()*4;
    const t=new THREE.Mesh(new THREE.CylinderGeometry(.25,.35,h,5),trunkM);
    t.position.set(x,h/2,z); scene.add(t);
    const c=new THREE.Mesh(new THREE.IcosahedronGeometry(1.6+r()*1.4,0),leafM);
    c.position.set(x,h+1,z); scene.add(c);
  }
  for(let i=0;i<7;i++){ // Hügel
    const a=r()*Math.PI*2, d=110+r()*60, s=18+r()*26;
    const hm=new THREE.Mesh(new THREE.SphereGeometry(s,10,7),
      new THREE.MeshLambertMaterial({color:0x4a7c3c,flatShading:true}));
    hm.position.set(Math.cos(a)*d,-s*.55,Math.sin(a)*d); scene.add(hm);
  }
})();

function hitProxy(x,z,r,h,data){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,7),
    new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
  m.position.set(x,h/2,z); m.userData=data; scene.add(m); interactives.push(m); return m;
}

// ---- Brunnen
(function well(){
  const g=new THREE.Group(); g.position.set(WELL.x,0,WELL.z);
  const stoneM=new THREE.MeshLambertMaterial({color:0x9a9a95});
  const ring=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.6,1.1,14),stoneM);
  ring.position.y=.55; ring.castShadow=ring.receiveShadow=true; g.add(ring);
  const water=new THREE.Mesh(new THREE.CircleGeometry(1.28,16),
    new THREE.MeshLambertMaterial({color:0x2f7fc4}));
  water.rotation.x=-Math.PI/2; water.position.y=1.08; g.add(water);
  const woodM=new THREE.MeshLambertMaterial({map:barkTex});
  for(const s of [-1,1]){
    const p=new THREE.Mesh(new THREE.BoxGeometry(.22,2.6,.22),woodM);
    p.position.set(s*1.25,2.0,0); p.castShadow=true; g.add(p);
  }
  const roof=new THREE.Mesh(new THREE.ConeGeometry(2.2,1.1,4),
    new THREE.MeshLambertMaterial({color:0xa8462f,flatShading:true}));
  roof.position.y=3.7; roof.rotation.y=Math.PI/4; roof.castShadow=true; g.add(roof);
  const sign=makeLabel('🚰 Brunnen','#ffd76a',.6,false);
  sign.position.y=4.9; g.add(sign);
  scene.add(g);
  obstacles.push({x:WELL.x,z:WELL.z,r:1.9});
  hitProxy(WELL.x,WELL.z,2.4,3.4,{kind:'well'});
})();

// ---- Feststand
(function stall(){
  const g=new THREE.Group(); g.position.set(STALL.x,0,STALL.z);
  const woodM=new THREE.MeshLambertMaterial({map:barkTex});
  const counter=new THREE.Mesh(new THREE.BoxGeometry(5,1.1,1.4),woodM);
  counter.position.set(0,.55,-.6); counter.castShadow=counter.receiveShadow=true; g.add(counter);
  for(const s of [-1,1]){
    const p=new THREE.Mesh(new THREE.BoxGeometry(.2,3.2,.2),woodM);
    p.position.set(s*2.3,1.6,-1.1); p.castShadow=true; g.add(p);
  }
  const stripe=canvasTex(256,64,(c,w,h)=>{
    for(let i=0;i<8;i++){ c.fillStyle=i%2?'#e8e4d8':'#c8352f'; c.fillRect(i*w/8,0,w/8,h); }
  });
  const awn=new THREE.Mesh(new THREE.BoxGeometry(5.4,.14,2.2),
    new THREE.MeshLambertMaterial({map:stripe}));
  awn.position.set(0,3.2,-.6); awn.rotation.x=-.16; awn.castShadow=true; g.add(awn);
  const sign=makeLabel('💰 Feststand','#ffd76a',.6,false);
  sign.position.set(0,4.3,-.6); g.add(sign);
  scene.add(g);
  obstacles.push({x:STALL.x,z:STALL.z-.6,r:2.2});
  hitProxy(STALL.x,STALL.z-.6,3,3.2,{kind:'stall'});
})();

// ---- Laden
(function shed(){
  const g=new THREE.Group(); g.position.set(SHED.x,0,SHED.z);
  const wall=new THREE.Mesh(new THREE.BoxGeometry(5,3,4),
    new THREE.MeshLambertMaterial({color:0x8b6a43}));
  wall.position.y=1.5; wall.castShadow=wall.receiveShadow=true; g.add(wall);
  const door=new THREE.Mesh(new THREE.BoxGeometry(1.5,2.2,.12),
    new THREE.MeshLambertMaterial({color:0x5b3f24}));
  door.position.set(0,1.1,-2.03); g.add(door);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(4.1,1.6,4),
    new THREE.MeshLambertMaterial({color:0xa8462f,flatShading:true}));
  roof.position.y=3.8; roof.rotation.y=Math.PI/4; roof.castShadow=true; g.add(roof);
  const sign=makeLabel('🛒 Laden','#ffd76a',.6,false);
  sign.position.set(0,5,-1); g.add(sign);
  scene.add(g);
  obstacles.push({x:SHED.x,z:SHED.z,r:3});
  hitProxy(SHED.x,SHED.z-2.6,2.2,3,{kind:'shop'});
})();

// ------------------------------------------------------------------ Charaktere (PNG-Billboards)
const CHARS=[
  {key:'manni',name:'Manni',h:1.9,x:3.6,z:23.4,color:'#ff6b4a',role:'shop',
   lines:['Frisch reingekommen: Samen, die angeblich keimen!',
          'Kaufen, pflanzen, reich werden. In der Reihenfolge.',
          'Der Dünger riecht streng, wirkt aber Wunder.',
          'Rabatt? Bei mir gibt es Qualität. Und Preise.']},
  {key:'jannes',name:'Jannes',h:1.88,x:15,z:21.4,color:'#4ab0ff',role:'stall',
   lines:['Ich zahle Tagespreis. Der Markt ist grausam.',
          'Nur reife Dominiks! Matsch nehme ich nicht.',
          'Das Fest braucht Dominiks. Viele Dominiks.',
          'Die Börse schwankt. Verkauf klug, mein Freund.']},
  {key:'benni',name:'Benni',h:1.95,x:-4,z:14,color:'#57e06b',role:'wander',
   lines:['Ich helfe gleich. Erst noch eine Runde dribbeln.',
          'Gießen soll wichtig sein, hab ich gehört.',
          'Blattläuse mag ich nicht. Sind so klein.',
          'Wenn der Baum braun wird, ist das schlecht. Glaube ich.',
          'Schöne Plantage. Wer macht die ganze Arbeit?']},
];
const texLoader=new THREE.TextureLoader();
function loadTex(url){
  return new Promise((res,rej)=>texLoader.load(url,t=>{
    t.colorSpace=THREE.SRGBColorSpace;
    t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    res(t);
  },undefined,()=>rej(new Error('Bild fehlt: '+url))));
}
let dominikTex=null;
const billboards=[];   // {mesh} — dreht sich zur Kamera

function makeBillboard(tex,h){
  const asp=tex.image.width/tex.image.height;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(h*asp,h),
    new THREE.MeshLambertMaterial({map:tex,transparent:true,alphaTest:.5,side:THREE.DoubleSide}));
  m.castShadow=true;
  billboards.push(m);
  return m;
}
function setupChars(){
  for(const c of CHARS){
    const g=new THREE.Group();
    g.position.set(c.x,0,c.z);
    const bb=makeBillboard(c.tex,c.h);
    bb.position.y=c.h/2;
    g.add(bb);
    const tag=makeLabel(c.name,c.color,.3,false);
    tag.position.y=c.h+.28; g.add(tag);
    const bubble=makeLabel('','#fff',.5,false);
    bubble.position.y=c.h+1.0; bubble.visible=false; g.add(bubble);
    scene.add(g);
    Object.assign(c,{group:g,bb,bubble,bubbleT:0,sayT:rnd(4,14),wt:0,tx:c.x,tz:c.z,mesh:bb});
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

// ------------------------------------------------------------------ Bäume
const leafGeo=new THREE.IcosahedronGeometry(1,0);
const trunkGeo=new THREE.CylinderGeometry(.16,.24,1,7);
const fruitGeoCache={};
class Plot{
  constructor(i,x,z){
    this.i=i; this.x=x; this.z=z;
    this.unlocked=i<4;
    this.stage='empty'; this.growth=0; this.t=0; this.water=1; this.wilt=0;
    this.over=0; this.pest=null; this.fruits=0; this.premium=false;
    this.rng=mulberry(1000+i*37);
    this.visKey='';
    const g=new THREE.Group(); g.position.set(x,0,z); scene.add(g);
    this.group=g;
    const dirt=new THREE.Mesh(new THREE.CircleGeometry(2.1,20),
      new THREE.MeshLambertMaterial({map:dirtTex}));
    dirt.rotation.x=-Math.PI/2; dirt.position.y=.02; dirt.receiveShadow=true; g.add(dirt);
    this.dirt=dirt;
    this.tree=new THREE.Group(); g.add(this.tree);
    // Statussymbol
    this.icon=new THREE.Sprite(new THREE.SpriteMaterial({map:iconTex('💧'),depthTest:false}));
    this.icon.scale.set(.9,.9,1); this.icon.visible=false; g.add(this.icon);
    this.icon2=new THREE.Sprite(new THREE.SpriteMaterial({map:iconTex('🪲'),depthTest:false}));
    this.icon2.scale.set(.9,.9,1); this.icon2.visible=false; g.add(this.icon2);
    // Schild für gesperrte Parzelle
    this.sign=new THREE.Group();
    const post=new THREE.Mesh(new THREE.BoxGeometry(.12,1.5,.12),
      new THREE.MeshLambertMaterial({map:barkTex}));
    post.position.y=.75; this.sign.add(post);
    const board=makeLabel(['🚧 Parzelle','zu verkaufen'],'#ffd76a',.46);
    board.position.y=1.6; this.sign.add(board);
    this.sign.visible=!this.unlocked; g.add(this.sign);
    this.proxy=hitProxy(x,z,1.7,4,{kind:'plot',plot:this});
    this.fruitMeshes=[];
    this.pestMeshes=[];
    this.blossoms=[];
    this.build();
  }
  clearTree(){
    for(const c of [...this.tree.children]){
      this.tree.remove(c);
      if(c.geometry && c.geometry!==leafGeo && c.geometry!==trunkGeo) c.geometry.dispose();
      if(c.material && c.material.map!==barkTex) c.material.dispose?.();
    }
    this.fruitMeshes=[]; this.pestMeshes=[]; this.blossoms=[];
  }
  build(){
    const s=this.stage;
    const key=[s,this.premium?'p':'',this.unlocked?'u':'l'].join('|');
    if(key===this.visKey) return;
    this.visKey=key;
    this.clearTree();
    this.sign.visible=!this.unlocked;
    this.dirt.visible=this.unlocked;
    if(!this.unlocked||s==='empty') { this.canopyY=1.5; this.canopyR=1; return; }

    const leafM=new THREE.MeshLambertMaterial({color:0x4f9c3e,flatShading:true});
    this.leafM=leafM;
    const woodM=new THREE.MeshLambertMaterial({map:barkTex});

    if(s==='dead'){
      const t=new THREE.Mesh(trunkGeo,new THREE.MeshLambertMaterial({color:0x6b5f52}));
      t.scale.set(1,2.2,1); t.position.y=1.1; t.castShadow=true; this.tree.add(t);
      for(const a of [-.7,.8]){
        const b=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,1.3,5),
          new THREE.MeshLambertMaterial({color:0x6b5f52}));
        b.position.set(Math.cos(a)*.5,2.1,Math.sin(a)*.5);
        b.rotation.z=a*.9; b.castShadow=true; this.tree.add(b);
      }
      this.canopyY=2.6; this.canopyR=.8; return;
    }
    if(s==='seed'){
      const m=new THREE.Mesh(new THREE.SphereGeometry(.42,8,6),
        new THREE.MeshLambertMaterial({map:dirtTex}));
      m.position.y=.16; m.scale.y=.5; m.castShadow=true; this.tree.add(m);
      this.canopyY=.8; this.canopyR=.4; return;
    }
    if(s==='sprout'){
      const st=new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,.7,5),leafM);
      st.position.y=.35; st.castShadow=true; this.tree.add(st);
      for(const sgn of [-1,1]){
        const l=new THREE.Mesh(leafGeo,leafM);
        l.position.set(sgn*.22,.72,0); l.scale.set(.26,.12,.18); l.castShadow=true; this.tree.add(l);
      }
      this.canopyY=1.1; this.canopyR=.4; return;
    }
    // niedrig gehalten, damit Krone und Früchte in der Ego-Perspektive im Blick sind
    const young=s==='young';
    const th=young?1.05:1.95, cr=(young?.8:1.42)*(this.premium?1.12:1);
    const tr=new THREE.Mesh(trunkGeo,woodM);
    tr.scale.set(young?.8:1.15,th,young?.8:1.15); tr.position.y=th/2;
    tr.castShadow=tr.receiveShadow=true; this.tree.add(tr);
    const cy=th+cr*.55;
    const r=this.rng;
    const blobs=[[0,cy,0,cr],[-cr*.62,cy-cr*.28,cr*.2,cr*.68],[cr*.6,cy-cr*.2,-cr*.25,cr*.72],
                 [cr*.1,cy+cr*.52,cr*.15,cr*.55]];
    for(const [bx,by,bz,br] of blobs){
      const m=new THREE.Mesh(leafGeo,leafM);
      m.position.set(bx,by,bz); m.scale.setScalar(br);
      m.rotation.set(r()*3,r()*3,r()*3);
      m.castShadow=true; this.tree.add(m);
    }
    this.canopyY=cy; this.canopyR=cr;
    // Blüten
    if(s==='blossom'){
      const bm=new THREE.MeshLambertMaterial({color:0xffe9f0,emissive:0x2a1418});
      for(let i=0;i<10;i++){
        const b=new THREE.Mesh(new THREE.SphereGeometry(.12,6,5),bm);
        const a=r()*6.28, e=r()*Math.PI-Math.PI/2;
        b.position.set(Math.cos(a)*Math.cos(e)*cr,cy+Math.sin(e)*cr*.8,Math.sin(a)*Math.cos(e)*cr);
        this.tree.add(b); this.blossoms.push(b);
      }
    }
    // Dominik-Früchte
    if(dominikTex&&(s==='fruiting'||s==='overripe')){
      const fh=.92, asp=dominikTex.image.width/dominikTex.image.height;
      if(!fruitGeoCache.g) fruitGeoCache.g=new THREE.PlaneGeometry(fh*asp,fh);
      const fm=new THREE.MeshLambertMaterial({map:dominikTex,transparent:true,alphaTest:.5,side:THREE.DoubleSide});
      this.fruitMat=fm;
      for(let i=0;i<5;i++){
        const f=new THREE.Mesh(fruitGeoCache.g,fm);
        const a=(i/5)*6.28+r()*.8, rad=cr*.82;
        f.position.set(Math.cos(a)*rad,cy-cr*.32+r()*cr*.5,Math.sin(a)*rad);
        f.userData.base=f.position.clone(); f.userData.ph=r()*6.28;
        f.castShadow=true;
        this.tree.add(f); this.fruitMeshes.push(f);
      }
    }
    // Blattläuse
    const pm=new THREE.MeshLambertMaterial({color:0x7a1f1f});
    for(let i=0;i<5;i++){
      const b=new THREE.Mesh(new THREE.SphereGeometry(.11,6,5),pm);
      b.userData.ph=r()*6.28; b.visible=false;
      this.tree.add(b); this.pestMeshes.push(b);
    }
  }
  plant(premium){
    Object.assign(this,{stage:'seed',growth:0,t:0,water:1,wilt:0,over:0,pest:null,fruits:0,premium});
    this.build();
  }
  die(msg){
    Object.assign(this,{stage:'dead',growth:0,fruits:0,pest:null});
    this.build();
    toast(msg.replace('#','#'+(this.i+1)),'bad'); SND.splat();
  }
  update(dt){
    if(!this.unlocked||this.stage==='empty') return;
    const alive=ALIVE.includes(this.stage);
    if(alive){
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
      if(['young','mature','blossom','fruiting','overripe'].includes(this.stage))
        this.over=clamp(this.over+dt/58,0,1);
      if(GROWABLE.includes(this.stage)&&this.water>0&&!this.pest){
        let rate=1/STAGE_DUR[this.stage];
        if(this.premium) rate*=1.35;
        if(this.over>.6) rate*=.6;
        this.growth+=dt*rate;
        if(this.growth>=1){
          this.stage=STAGE_NEXT[this.stage]; this.growth=0; this.t=0;
          if(this.stage==='fruiting'){
            this.fruits=clamp(rndi(2,4)+(this.premium?1:0)-(this.over>.6?1:0),1,5);
            toast(pick(['🍑 Dominiks reif an Baum #N!','🍑 Baum #N trägt prächtige Dominiks!',
                        '🍑 Erntezeit an Baum #N!']).replace('#N','#'+(this.i+1)),'good');
            SND.done();
          }
          this.build();
        }
      }
      if(this.stage==='fruiting'){
        this.t+=dt;
        if(this.t>=FRUIT_WINDOW){ this.stage='overripe'; this.t=0; this.build();
          toast('🫠 Die Dominiks an Baum #'+(this.i+1)+' werden matschig!','warn'); }
      } else if(this.stage==='overripe'){
        this.t+=dt;
        if(this.t>=OVERRIPE_WINDOW){
          this.stage='mature'; this.growth=.2; this.fruits=0; this.t=0; this.build();
          toast('💦 Platsch. Baum #'+(this.i+1)+': alles zu Matsch.','bad'); SND.splat();
        }
      }
    }
    // ---- Optik
    const dry=clamp(1-this.water*2.4,0,1), wf=clamp(this.wilt/WILT_LIMIT,0,1);
    if(this.leafM){
      const f=Math.max(dry*.75,wf);
      this.leafM.color.setRGB(lerp(.31,.55,f),lerp(.61,.42,f),lerp(.24,.18,f));
      const ov=1+this.over*.22;
      this.tree.scale.setScalar(ov);
    }
    if(this.fruitMeshes.length){
      const ov=this.stage==='overripe';
      if(this.fruitMat) this.fruitMat.color.setRGB(1,ov?.72:1,ov?.55:1);
      this.fruitMeshes.forEach((f,i)=>{
        f.visible=i<this.fruits;
        if(!f.visible) return;
        const b=f.userData.base, ph=f.userData.ph;
        f.position.y=b.y+Math.sin(state.t*1.7+ph)*.06;
        f.position.x=b.x+Math.sin(state.t*1.1+ph)*.05;
      });
    }
    for(let i=0;i<this.pestMeshes.length;i++){
      const b=this.pestMeshes[i]; b.visible=!!this.pest;
      if(!b.visible) continue;
      const a=state.t*.9+b.userData.ph, r=this.canopyR*.95;
      b.position.set(Math.cos(a)*r,this.canopyY+Math.sin(a*1.7)*r*.55,Math.sin(a)*r);
    }
    for(const b of this.blossoms) b.visible=this.stage==='blossom';
    // Statussymbole
    const icons=[];
    if(this.pest) icons.push('🪲');
    if(alive&&this.water<.32) icons.push('💧');
    if(this.stage==='fruiting') icons.push('🧺');
    else if(this.stage==='overripe') icons.push('⏳');
    else if(this.over>.62) icons.push('✂️');
    const setIcon=(sp,txt)=>{
      if(!txt){ sp.visible=false; return; }
      sp.visible=true;
      if(sp.userData.txt!==txt){ sp.material.map=iconTex(txt); sp.userData.txt=txt; }
    };
    const yTop=this.canopyY+this.canopyR+.45;
    setIcon(this.icon,icons[0]); this.icon.position.set(icons.length>1?-.55:0,yTop,0);
    setIcon(this.icon2,icons[1]); this.icon2.position.set(.55,yTop,0);
    const pulse=1+Math.sin(state.t*5)*.08;
    this.icon.scale.set(.9*pulse,.9*pulse,1);
    this.icon2.scale.set(.9*pulse,.9*pulse,1);
  }
  get alerts(){
    const a=[];
    if(this.pest) a.push('🪲');
    if(ALIVE.includes(this.stage)&&this.water<.32) a.push('💧');
    if(this.stage==='fruiting') a.push('🧺');
    if(this.stage==='overripe') a.push('⏳');
    return a;
  }
  label(){
    const n='Baum #'+(this.i+1);
    if(!this.unlocked) return [n,'Nicht gekauft'];
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
  for(const z of ROWS) for(const x of COLS){ plots.push(new Plot(i++,x,z)); }
  for(const p of plots) obstacles.push({x:p.x,z:p.z,r:.75,plot:p});
})();

// ------------------------------------------------------------------ Aktionen prüfen/ausführen
function actionsFor(tg){
  if(!tg) return [];
  const out=[];
  const add=(id,ok,sub)=>out.push({id,ok:ok===true,reason:ok===true?'':ok,sub});
  if(tg.kind==='plot'){
    const p=tg.plot;
    if(!p.unlocked){
      const price=plotPrice();
      add('buyplot',price===null?'Alle Parzellen gekauft':(state.money>=price?true:'Zu teuer'),
        price===null?'':price+' €');
      return out;
    }
    if(p.stage==='empty'||p.stage==='dead'){
      add('plant',inv.seed>0?true:'Keine Samen','×'+inv.seed);
      add('plantbio',inv.bio>0?true:'Keine Bio-Samen','×'+inv.bio);
      return out;
    }
    if(ALIVE.includes(p.stage)){
      if(p.stage==='fruiting'||p.stage==='overripe')
        add('harvest',player.carry<bagCap()?true:'Rucksack voll','🍑'+p.fruits);
      if(p.pest) add('spray',inv.pest>0?true:'Kein Pestizid','×'+inv.pest);
      if(p.water<.95) add('water',player.can>0?true:'Kanne leer','💧'+player.can);
      if(p.over>=.15) add('trim',true,'🌿'+Math.round(p.over*100)+'%');
      if(GROWABLE.includes(p.stage)) add('fert',inv.fert>0?true:'Kein Dünger','×'+inv.fert);
    }
    return out;
  }
  if(tg.kind==='well'){ add('refill',player.can<canCap()?true:'Kanne ist voll',player.can+'/'+canCap()); return out; }
  if(tg.kind==='stall'){ add('sell',player.carry>0?true:'Nichts dabei',
    player.carry?'×'+player.carry+' → '+Math.round(player.carry*state.price)+' €':''); return out; }
  if(tg.kind==='shop'){ add('shop',true); return out; }
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
function plotPrice(){
  const locked=plots.filter(p=>!p.unlocked).length;
  if(!locked) return null;
  const bought=upg.plots;
  return [30,45,60,80,105,135,170,210][Math.min(bought,7)];
}
function runAction(id,tg){
  const p=tg.plot;
  switch(id){
    case 'plant':    inv.seed--; p.plant(false); toast('🌱 Gepflanzt an Baum #'+(p.i+1),'',1800); break;
    case 'plantbio': inv.bio--;  p.plant(true);  toast('🌟 Bio-Dominik gepflanzt!','good',1800); break;
    case 'water':    p.water=1; p.wilt=0; player.can--; break;
    case 'trim':     p.over=0; break;
    case 'spray':    inv.pest--; p.pest=null; toast('🧪 Blattläuse erledigt.','good',1800); break;
    case 'fert':     inv.fert--; p.growth=clamp(p.growth+.45,0,.99); p.water=clamp(p.water-.15,.05,1); break;
    case 'harvest':{
      const space=bagCap()-player.carry;
      const avail=p.stage==='overripe'?Math.max(1,Math.ceil(p.fruits/2)):p.fruits;
      const take=Math.min(avail,space);
      player.carry+=take; state.harvested+=take;
      toast('🧺 '+take+' Dominik'+(take>1?'s':'')+' geerntet!','good',1800);
      if(p.stage==='overripe'){ p.stage='mature'; p.growth=.2; p.fruits=0; p.t=0; p.build(); }
      else { p.fruits-=take; if(p.fruits<=0){ p.stage='mature'; p.growth=.2; p.t=0; p.build(); } }
      break;
    }
    case 'refill':   player.can=canCap(); toast('🚰 Kanne voll.','',1500); break;
    case 'sell':{
      const sum=Math.round(player.carry*state.price);
      state.money+=sum; state.earned+=sum;
      toast('💰 '+player.carry+' Dominiks für '+sum+' € verkauft!','good',2400);
      const j=CHARS.find(c=>c.role==='stall');
      if(j) say(j,pick(['Geht sofort weg, danke!','Solide Ware. Tagespreis!','Das Fest wird gerettet!']),3000);
      player.carry=0; SND.coin();
      break;
    }
    case 'shop':     openShop(); return;
    case 'talk':     say(tg.char,tip(tg.char),4200); SND.tap(); return;
    case 'buyplot':{
      const price=plotPrice();
      if(price===null||state.money<price) return;
      state.money-=price; upg.plots++;
      tg.plot.unlocked=true; tg.plot.build();
      toast('🌍 Parzelle #'+(tg.plot.i+1)+' gekauft!','good');
      SND.coin();
      break;
    }
  }
  if(id!=='sell') SND.done();
  updateHUD();
}
function tip(c){
  if(c.role==='wander'){
    const urgent=plots.filter(p=>p.unlocked&&p.alerts.length);
    if(urgent.length){
      const p=urgent[0];
      return 'Baum #'+(p.i+1)+' braucht was. Aber schau lieber selbst, ich bin beschäftigt.';
    }
    return pick(c.lines);
  }
  return pick(c.lines);
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
    tg={kind:u.kind,plot:u.plot,char:u.char,obj:hits[0].object};
  }
  target=tg;
  const acts=actionsFor(tg);
  el('cross').classList.toggle('hot',!!tg&&acts.length>0);
  const sig=tg?[tg.kind,tg.plot?tg.plot.i:'',tg.char?tg.char.key:'',
    acts.map(a=>a.id+(a.ok?'1':'0')+(a.sub||'')).join(',')].join('|'):'';
  if(sig!==targetSig){ targetSig=sig; renderTargetUI(tg,acts); }
  else if(tg&&acts.length) updateTargetName(tg);
  if(player.act){
    const still=acts.find(a=>a.id===player.act.id&&a.ok);
    if(!still||player.act.tg.plot!==tg?.plot||player.act.tg.kind!==tg?.kind) cancelAction();
  }
}
const tgEl=el('target'), tName=el('tname'), tActs=el('tacts');
let actEls=[], nameCache='';
function targetLabel(tg){
  if(tg.kind==='plot') return tg.plot.label();
  if(tg.kind==='well') return ['🚰 Brunnen','Gießkanne auffüllen'];
  if(tg.kind==='stall') return ['💰 Feststand','Tagespreis: '+Math.round(state.price)+' €'];
  if(tg.kind==='shop') return ['🛒 Laden','Manni verkauft dir alles'];
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
  if(player.act.t%.28<dt) SND.work();
  if(pct>=1){
    const id=player.act.id, tg=player.act.tg;
    player.act=null;
    if(cur) cur.el.querySelector('.prog').style.width='0';
    runAction(id,tg);
    targetSig=''; // UI neu aufbauen
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
  try{ layer.setPointerCapture(e.pointerId); }catch(err){/* synthetische Events */}
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
    const kn=stickEl.querySelector('.knob');
    kn.style.transform=`translate(${dx*k}px,${dy*k}px)`;
  } else if(e.pointerId===lookId){
    if(document.pointerLockElement) return; // per movementX behandelt
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
  // Blickrichtung ist -z; mz<0 (Stick nach oben) = vorwärts
  let dx=(mx*cos+mz*sin)*sp*dt;
  let dz=(-mx*sin+mz*cos)*sp*dt;
  const speed=Math.hypot(dx,dz)/Math.max(dt,1e-4);
  // Kollision (achsenweise, damit man an Hindernissen entlanggleitet)
  const R=.5;
  let nx=player.x+dx, nz=player.z+dz;
  for(const o of obstacles){
    const rr=o.r+R;
    if(Math.abs(nx-o.x)<rr&&Math.abs(player.z-o.z)<rr&&
       (nx-o.x)**2+(player.z-o.z)**2<rr*rr) nx=player.x;
    if(Math.abs(player.x-o.x)<rr&&Math.abs(nz-o.z)<rr&&
       (player.x-o.x)**2+(nz-o.z)**2<rr*rr) nz=player.z;
  }
  player.x=clamp(nx,BOUND.x0+1,BOUND.x1-1);
  player.z=clamp(nz,BOUND.z0+1,BOUND.z1-1);
  // Kopf-Wackeln + Schritte
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
  // sofort aktualisieren: Zielerfassung und Bildschirm-Projektion laufen noch
  // in diesem Frame und würden sonst die Matrix des Vorframes benutzen
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
}

// ------------------------------------------------------------------ Charakter-Logik
function updateChars(dt){
  for(const c of CHARS){
    if(c.role==='wander'&&!state.paused){
      c.wt-=dt;
      if(c.wt<=0){
        c.wt=rnd(3,7);
        c.tx=rnd(-12,12); c.tz=rnd(-16,16);
      }
      const dx=c.tx-c.group.position.x, dz=c.tz-c.group.position.z, d=Math.hypot(dx,dz);
      if(d>.4){
        const s=Math.min(1.9*dt,d);
        c.group.position.x+=dx/d*s; c.group.position.z+=dz/d*s;
        c.mesh.position.y=c.h/2+Math.abs(Math.sin(state.t*7))*.06;
      }
      // Kollisions- und Trefferzone immer mitziehen, auch wenn er gerade steht
      const ob=obstacles.find(o=>o.char===c);
      if(ob){ ob.x=c.group.position.x; ob.z=c.group.position.z; }
      const px=interactives.find(m=>m.userData.follow===c);
      if(px) px.position.set(c.group.position.x,px.position.y,c.group.position.z);
    }
    if(!state.paused){
      c.sayT-=dt;
      if(c.sayT<=0){ c.sayT=rnd(14,30);
        const near=Math.hypot(player.x-c.group.position.x,player.z-c.group.position.z)<16;
        if(near) say(c,pick(c.lines),4000);
      }
      if(c.bubbleT>0){ c.bubbleT-=dt; if(c.bubbleT<=0) c.bubble.visible=false; }
    }
  }
}
const _wp=new THREE.Vector3();
function updateBillboards(){
  for(const m of billboards){
    m.getWorldPosition(_wp);
    m.rotation.y=Math.atan2(camera.position.x-_wp.x,camera.position.z-_wp.z)-
      (m.parent?m.parent.rotation.y:0);
  }
  for(const p of plots) for(const f of p.fruitMeshes)
    f.rotation.y=Math.atan2(camera.position.x-(p.x+f.position.x),camera.position.z-(p.z+f.position.z));
}

// ------------------------------------------------------------------ Tag / Wirtschaft
function spawnPests(dt){
  if(state.day<2) return;
  const active=plots.filter(p=>p.pest).length;
  if(active>=Math.min(3,Math.ceil(state.day/3))) return;
  for(const p of plots){
    if(!p.unlocked||p.pest) continue;
    if(!['young','mature','blossom','fruiting','overripe'].includes(p.stage)) continue;
    if(Math.random()<dt*(.0022+.0012*state.day)){
      const ttl=Math.max(14,26-state.day);
      p.pest={ttl,max:ttl};
      toast('🪲 Blattläuse an Baum #'+(p.i+1)+'! Pestizid, schnell!','bad',4000);
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
  if(!anyAlive&&!player.carry&&inv.seed<1&&inv.bio<1&&state.money<5&&!state.won)
    endScreen(false,'Pleite! Keine Bäume, keine Samen, kein Geld. Dominik ist untröstlich.');
}

// ------------------------------------------------------------------ HUD
function updateHUD(){
  el('hMoney').textContent=state.money;
  el('hGoal').textContent=state.won?'✔ '+state.earned:state.earned+'/'+GOAL;
  el('hDay').textContent=state.day<=MAXDAY?state.day+'/'+MAXDAY:state.day;
  el('hPrice').textContent=Math.round(state.price);
  el('hInv').innerHTML=[['🌱',inv.seed],['🌟',inv.bio],['🧪',inv.pest],['💩',inv.fert]]
    .map(([i,n])=>`<span class="${n?'':'lo'}">${i}${n}</span>`).join(' ');
  const gc=el('gCan'), gb=el('gBag');
  gc.textContent='💧 '+player.can+'/'+canCap();
  gc.className=player.can===0?'warn':'';
  gb.textContent='🧺 '+player.carry+'/'+bagCap();
  gb.className=player.carry>=bagCap()?'warn':'';
}
const alertPool=[];
const _av=new THREE.Vector3();
function updateAlerts(){
  const box=el('alerts');
  const v=_av;
  let n=0;
  const cw=innerWidth, ch=innerHeight;
  for(const p of plots){
    if(!p.unlocked) continue;
    const a=p.alerts; if(!a.length) continue;
    v.set(p.x,p.canopyY,p.z).project(camera);
    const behind=v.z>1;
    if(!behind&&Math.abs(v.x)<.95&&Math.abs(v.y)<.95) continue; // sichtbar: 3D-Symbol reicht
    // Richtung zum Ziel; hinter der Kamera ist die Projektion gespiegelt
    let ex=v.x, ey=v.y;
    if(behind){ ex=-ex; ey=-ey; }
    const len=Math.max(Math.abs(ex),Math.abs(ey))||1;
    ex/=len; ey/=len;
    let e=alertPool[n];
    if(!e){ e=document.createElement('div'); e.className='alert'; box.appendChild(e); alertPool[n]=e; }
    e.style.display='block';
    e.innerHTML=a[0]+'<b>#'+(p.i+1)+'</b>';
    e.style.left=clamp(cw/2+ex*cw*.44,30,cw-30)+'px';   // NDC → Bildschirm (y gespiegelt)
    e.style.top =clamp(ch/2-ey*ch*.40,58,ch-66)+'px';
    n++;
  }
  for(let i=n;i<alertPool.length;i++) alertPool[i].style.display='none';
}

// ------------------------------------------------------------------ Laden
const SHOP=[
  {id:'seed',ico:'🌱',nm:'Dominik-Samen',ds:'Der Klassiker. Wächst zu einem soliden Dominik-Baum.',
   price:()=>5,own:()=>'Vorrat: '+inv.seed,buy:()=>inv.seed++},
  {id:'bio',ico:'🌟',nm:'Bio-Dominik-Samen',ds:'35 % schneller, +1 Frucht. Säuft aber mehr Wasser.',
   price:()=>14,own:()=>'Vorrat: '+inv.bio,buy:()=>inv.bio++},
  {id:'pest',ico:'🧪',nm:'Pestizid',ds:'Eine Dosis gegen Blattläuse. Nicht bio, aber wirksam.',
   price:()=>8,own:()=>'Vorrat: '+inv.pest,buy:()=>inv.pest++},
  {id:'fert',ico:'💩',nm:'Turbo-Dünger',ds:'Sofort +45 % Wachstum. Riecht nach Erfolg.',
   price:()=>9,own:()=>'Vorrat: '+inv.fert,buy:()=>inv.fert++},
  {id:'can',ico:'🚿',nm:'Größere Gießkanne',ds:'+2 Ladungen — weniger Laufen zum Brunnen.',
   max:3,lvl:()=>upg.can,price:()=>[20,35,60][upg.can],buy:()=>{upg.can++;player.can=canCap();}},
  {id:'bag',ico:'🎒',nm:'Erntekorb',ds:'+3 Tragekapazität für Dominiks.',
   max:3,lvl:()=>upg.bag,price:()=>[25,45,70][upg.bag],buy:()=>upg.bag++},
  {id:'shears',ico:'✂️',nm:'Schärfere Schere',ds:'Schneiden geht deutlich flotter.',
   max:2,lvl:()=>upg.shears,price:()=>[25,45][upg.shears],buy:()=>upg.shears++},
  {id:'boots',ico:'👟',nm:'Gummistiefel',ds:'+16 % Laufgeschwindigkeit. Der Acker ist groß.',
   max:2,lvl:()=>upg.boots,price:()=>[30,55][upg.boots],buy:()=>upg.boots++},
];
const modal=el('modal'), mbox=el('mbox');
function showModal(html){ mbox.innerHTML=html; modal.classList.remove('hidden'); state.paused=true;
  if(document.pointerLockElement) document.exitPointerLock(); }
function hideModal(){ modal.classList.add('hidden'); if(!state.over) state.paused=false; }
function openShop(){
  let h='<h2>🛒 Mannis Gartenbedarf</h2><div id="shopmoney">💰 '+state.money+' €</div><div class="cols">';
  for(const it of SHOP){
    const maxed=it.max!=null&&it.lvl()>=it.max;
    const pr=maxed?null:it.price();
    h+=`<div class="shopitem"><div class="ico">${it.ico}</div><div class="txt">
      <div class="nm">${it.nm}</div><div class="ds">${it.ds}</div>
      <div class="own">${it.own?it.own():'Stufe '+it.lvl()+'/'+it.max}</div></div>
      <button data-buy="${it.id}" ${maxed||pr>state.money?'disabled':''}>${maxed?'Max ✔':pr+' €'}</button></div>`;
  }
  h+='</div><p style="opacity:.7;font-size:11.5px;margin-top:8px">Neue Parzellen kaufst du direkt draußen '+
     'am Schild „Zu verkaufen".</p><div class="btnrow"><button class="primary" data-act="close">Zurück 🚜</button></div>';
  showModal(h);
  const m=CHARS.find(c=>c.role==='shop'); if(m) say(m,pick(m.lines),4000);
}
mbox.addEventListener('pointerdown',e=>{
  const b=e.target.closest('button'); if(!b) return;
  e.stopPropagation();
  if(b.dataset.buy){
    const it=SHOP.find(s=>s.id===b.dataset.buy), pr=it.price();
    if(state.money>=pr){ state.money-=pr; it.buy(); SND.coin();
      toast('🛒 Gekauft: '+it.nm,'good',1600); updateHUD(); openShop(); }
  } else if(b.dataset.act==='close'||b.dataset.act==='resume'){ hideModal(); }
  else if(b.dataset.act==='start'){ localStorage.setItem('edf3d_tut','1'); hideModal(); state.started=true; }
  else if(b.dataset.act==='restart'){ location.reload(); }
  else if(b.dataset.act==='endless'){ state.over=false; hideModal();
    toast('🌾 Endlos-Modus! Wie viele Dominiks schaffst du?','good'); }
  else if(b.dataset.act==='classic'){ location.href='./2d.html'; }
});
function showTutorial(){
  const ctrl=isTouch
    ? '<li><b>Links wischen</b> = laufen · <b>rechts wischen</b> = umsehen · Aktionen rechts unten antippen.</li>'
    : '<li><b>WASD</b> laufen · <b>Maus</b> umsehen · <b>E</b> Hauptaktion · <b>1–4</b> weitere Aktionen · <b>Shift</b> rennen.</li>';
  showModal(`<h2>🌳 ErnteDominiksFest 3D</h2>
  <p>Das Fest steht an — und es fehlen <b>Dominiks</b>! Du bewirtschaftest die Plantage
  ganz allein: pflanzen, gießen, schneiden, spritzen, ernten, verkaufen.</p>
  <ul class="tut">
    ${ctrl}
    <li>Stell dich vor einen <b>Baum</b>, eine <b>Station</b> oder eine <b>Person</b> — rechts erscheinen die möglichen Aktionen.</li>
    <li><b>💧 Gießkanne</b> am Brunnen füllen, <b>🧺 Ernte</b> am Feststand bei Jannes verkaufen,
        Nachschub im <b>🛒 Laden</b> bei Manni.</li>
    <li><b>Rechtzeitig ernten!</b> Überreife Dominiks fallen als Matsch zu Boden.</li>
    <li>Symbole über den Bäumen (💧 ✂️ 🪲 🧺 ⏳) zeigen, was fehlt — Pfeile am Bildrand weisen den Weg.</li>
  </ul>
  <p>🎯 <b>Ziel: ${GOAL} € Umsatz bis zum Ende von Tag ${MAXDAY}.</b>
  Was du im Laden wieder ausgibst, zählt weiter für die Festkasse — investieren lohnt sich!</p>
  <div class="btnrow">
    <button data-act="classic" style="background:#2f4f2f;flex:0 0 auto;font-size:12.5px">2D 🕹️</button>
    <button class="primary" data-act="start">Auf die Plantage! 🚜</button>
  </div>`);
}
function endScreen(win,msg){
  state.over=true; state.paused=true;
  const best=Math.max(state.earned,+(localStorage.getItem('edf3d_best')||0));
  localStorage.setItem('edf3d_best',best);
  showModal(`<h2>${win?'🎉 Das Fest ist gerettet!':'😢 Das Fest fällt aus …'}</h2>
  <p>${msg}</p>
  <p>📊 <b>${state.harvested}</b> Dominiks geerntet · <b>${state.earned} €</b> verdient
  (Rekord: ${best} €) · Tag ${state.day}.</p>
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
el('btnHelp').addEventListener('pointerdown',e=>{e.stopPropagation();showTutorial();});
function startGameIfNeeded(){
  if(!state.started&&modal.classList.contains('hidden')){ state.started=true; state.paused=false; }
}

// ------------------------------------------------------------------ Tageslicht
const C={dayTop:new THREE.Color(0x3f86c8),evTop:new THREE.Color(0xd97b3a),nTop:new THREE.Color(0x16203f),
  dayBot:new THREE.Color(0xbfe0ef),evBot:new THREE.Color(0xf0b070),nBot:new THREE.Color(0x27324f),
  sunDay:new THREE.Color(0xfff3d6),sunEv:new THREE.Color(0xffb070),
  top:new THREE.Color(),bot:new THREE.Color()};
function updateSky(){
  const d=state.dayT;
  // morgens warm, mittags hell, abends rot, kurz dämmrig
  const dawn=clamp((.18-d)*5,0,1), dusk=clamp((d-.75)*4,0,1);
  const night=clamp((d-.9)*10,0,1), warm=Math.max(dawn,dusk);
  const top=C.top.copy(C.dayTop).lerp(C.evTop,warm*.6).lerp(C.nTop,night*.75);
  const bot=C.bot.copy(C.dayBot).lerp(C.evBot,warm*.7).lerp(C.nBot,night*.7);
  skyMat.uniforms.top.value.copy(top);
  skyMat.uniforms.bot.value.copy(bot);
  scene.fog.color.copy(bot);
  renderer.setClearColor(bot);
  sun.intensity=lerp(2.1,.55,night);
  sun.color.copy(C.sunDay).lerp(C.sunEv,warm*.8);
  hemi.intensity=lerp(1.35,.5,night);
  const ang=Math.PI*(.15+d*.7);
  sun.position.set(Math.cos(ang)*40,Math.max(6,Math.sin(ang)*44),14);
}

// ------------------------------------------------------------------ Hauptschleife
function update(dt){
  if(!state.paused&&!state.over){
    state.t+=dt;
    state.dayT+=dt/DAYLEN;
    if(state.dayT>=1){ state.dayT=0; newDay(); }
    el('daybar').style.width=(state.dayT*100)+'%';
    state.priceT+=dt;
    if(state.priceT>=2){
      state.priceT=0;
      state.price=clamp(state.price+rnd(-1,1)*(1+state.day*.14),6,28);
      el('hPrice').textContent=Math.round(state.price);
    }
    spawnPests(dt);
    for(const p of plots) p.update(dt);
    updateAction(dt);
    state.checkT+=dt;
    if(state.checkT>=1){ state.checkT=0; checkEnd(); updateHUD(); }
  } else {
    for(const p of plots) p.update(0);   // Optik weiterlaufen lassen
  }
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
  loadTex('dominik.png').then(t=>{dominikTex=t;}),
]).then(()=>{
  setupChars();
  for(const p of plots){ p.visKey=''; p.build(); }
  resize(); updateHUD();
  el('boot').remove();
  el('hint').innerHTML=isTouch?'' :'WASD laufen · Maus umsehen<br>E Aktion · P Pause';
  if(localStorage.getItem('edf3d_tut')){ state.paused=false; state.started=true;
    toast('🌳 Auf geht\'s! Ziel: '+GOAL+' € bis Tag '+MAXDAY+'.','good'); }
  else showTutorial();
  requestAnimationFrame(frame);
}).catch(e=>{
  el('boot').innerHTML='😢 '+e.message;
  console.error(e);
});

// ------------------------------------------------------------------ Debug-API (für Tests)
window.game={state,inv,upg,plots,player,CHARS,
  get target(){return target;},
  actionsFor,runAction,openShop,
  // Kamera sofort nachziehen, damit Ziel-Raycast ohne Frame stimmt
  sync(){ updatePlayer(0); updateTarget(); },
  updateTarget(){ updatePlayer(0); updateTarget(); },
  setMove(x,y){ move.x=x; move.y=y; },
  tp(x,z,yaw){ player.x=x; player.z=z; if(yaw!=null) player.yaw=yaw; this.sync(); },
  lookAt(x,z){ player.yaw=Math.atan2(player.x-x,player.z-z); player.pitch=0; this.sync(); },
  act(id){ const a=actionsFor(target).find(v=>v.id===id); if(a) startAction(a); return !!a; },
  tick(sec){ const s=.05; for(let t=0;t<sec;t+=s) update(s); },
};
