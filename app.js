import { optics, defaults, TAU, wavelengthColor } from './physics.mjs';
import { sampleWavePath } from './wave-path.mjs';

const $=id=>document.getElementById(id);
const canvas=$('simulation'),ctx=canvas.getContext('2d');
const state={...defaults,view:'front',composition:'sum',marker:false,playing:!matchMedia('(prefers-reduced-motion: reduce)').matches};
let model=optics(state),width=0,height=0,dpr=1,time=0,previous=0,lastDraw=0,geometry,drag=null;
const v=(x,y)=>({x,y}),add=(a,b)=>v(a.x+b.x,a.y+b.y),mul=(a,s)=>v(a.x*s,a.y*s),sub=(a,b)=>v(a.x-b.x,a.y-b.y),dot=(a,b)=>a.x*b.x+a.y*b.y;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const font=(size=12,weight=400)=>`${weight} ${size}px -apple-system,BlinkMacSystemFont,"Segoe UI","Yu Gothic",Meiryo,sans-serif`;
const rgba=(a,opacity=1)=>`rgba(${a.join(',')},${opacity})`;
const spectral=()=>wavelengthColor(state.wavelength);
const incidentColor=[53,131,177],reflectedColor=[208,126,38],secondColor=[155,101,172];

function update(){
  model=optics(state);
  for(const key of ['wavelength','thickness','angle']) {
    $(key).value=state[key];
    $(key+'-value').innerHTML=`${state[key]} <small>${key==='angle'?'°':'nm'}</small>`;
    $(key).setAttribute('aria-valuetext',`${state[key]} ${key==='angle'?'度':'ナノメートル'}`);
  }
  document.documentElement.style.setProperty('--wave',rgba(spectral()));
  const two=model.a1>1e-7&&model.a2>1e-7;
  const status=model.topTIR?'上面で全反射':model.a1+model.a2<1e-7?'反射なし':!two?'反射光は1本':Math.cos(model.phase)>.3?'強め合う':Math.cos(model.phase)<-.3?'弱め合う':'干渉の途中';
  $('status').textContent=status;
  $('intensity-fill').style.width=`${model.intensity*100}%`;
  $('intensity-fill').parentElement.setAttribute('aria-label',`相対強度 ${Math.round(model.intensity*100)}%`);
  $('status-dot').style.opacity=two?(.25+.75*model.intensity):1;
  $('optical-path').textContent=model.delta===null?'—':`${Math.round(model.delta).toLocaleString('ja-JP')} nm`;
  $('phase').textContent=two?`${(model.phase/Math.PI).toFixed(2)}π`:'—';
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===state.view));
  document.querySelectorAll('[data-composition]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.composition===state.composition));
  $('wave-options').hidden=state.view!=='wave';
  const incidentLegend='<span><i style="border-color:#3583b1"></i>入射波</span>';
  $('legend').innerHTML=incidentLegend+(state.view==='front'?'<span><i style="border-color:#d07e26"></i>反射波</span><span><i></i>山</span><span><i class="dashed"></i>谷</span>':state.composition==='individual'?'<span><i style="border-color:#d07e26"></i>上面反射</span><span><i class="dashed" style="border-color:#9b65ac"></i>下面反射</span>':'<span><i style="border-color:#d07e26"></i>合成波</span>');
  draw();
}

function layout(){
  const narrow=width<650, short=height<270;
  const left=narrow?104:Math.max(145,width*.18),right=width-(narrow?34:70),available=right-left;
  const wave=state.view==='wave';
  const yTop=height*(short?.53:wave?.52:.57),maxDepth=height*(short?.22:wave?.33:.27);
  const sin=Math.sin(model.theta1),cos=Math.cos(model.theta1),tan2=model.topTIR?0:Math.tan(model.theta2);
  const scale=Math.min(maxDepth/1000,available*.24/(2000*Math.max(.001,tan2)));
  const depth=state.thickness*scale,dx=2*depth*tan2;
  const L=Math.min((yTop-(short?64:100))/Math.max(.01,cos),available*.33/Math.max(.1,sin));
  const A=v(left+(available-dx)/2,yTop),B=v(A.x+dx/2,yTop+depth),C=v(A.x+dx,yTop);
  // Recenter the complete incident / reflected pair in the available area.
  A.x-=dx/2;B.x-=dx/2;C.x-=dx/2;
  if(wave){A.x+=dx/2;B.x+=dx/2;C.x+=dx/2}
  const out=v(sin,-cos),inc=v(sin,cos),inside=v(Math.sin(model.theta2),Math.cos(model.theta2)),up=v(Math.sin(model.theta2),-Math.cos(model.theta2));
  const start=add(A,mul(inc,-L));
  const mid=mul(add(A,C),.5),joinOffset=Math.min(L*.56,18+dx*sin/2),join=add(mid,mul(out,joinOffset));
  const eye=add(wave?C:mid,mul(out,L+5));
  const separation=dx*cos,beamWidth=clamp(available*.11,22,47);
  geometry={A,B,C,out,inc,inside,up,start,eye,join,mid,L,joinOffset,scale,depth,separation,beamWidth,yTop,yBottom:yTop+depth,short};
  const filmCenter=yTop+depth/2;
  // Offset labels outside very thin layers, without covering the boundaries' controls.
  $('medium-one').style.top=`${Math.max(short?70:100,yTop-(short?51:72))}px`;
  $('medium-two').style.top=`${filmCenter}px`;
  $('medium-three').style.top=`${Math.min(height-45,Math.max(yTop+depth+42,filmCenter+64))}px`;
}

function line(a,b,color='#a7bbbf',w=1,dash=[]){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=w;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([])}
function label(text,x,y,color='#718b91',size=11,align='left',background=false){
  ctx.font=font(size,500);ctx.textAlign=align;ctx.textBaseline='middle';
  if(background){const w=ctx.measureText(text).width;ctx.fillStyle='#fcfdfde8';ctx.fillRect(x-(align==='center'?w/2:align==='right'?w:0)-4,y-9,w+8,18)}
  ctx.fillStyle=color;ctx.fillText(text,x,y);
}
function arrow(a,b,color='#91a9ab',w=1.25){
  line(a,b,color,w);const angle=Math.atan2(b.y-a.y,b.x-a.x),s=5;
  line(b,v(b.x-s*Math.cos(angle-.5),b.y-s*Math.sin(angle-.5)),color,w);
  line(b,v(b.x-s*Math.cos(angle+.5),b.y-s*Math.sin(angle+.5)),color,w);
}
function knob(p,type){
  ctx.beginPath();ctx.arc(p.x,p.y,12,0,TAU);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#8cafac';ctx.lineWidth=1;ctx.stroke();
  ctx.strokeStyle='#448a81';ctx.lineWidth=1.4;ctx.beginPath();
  if(type==='angle'){ctx.arc(p.x,p.y,5,.7,4.4);ctx.stroke();line(v(p.x-5,p.y-4),v(p.x-5,p.y), '#448a81',1.3)}
  else{for(const z of [-2.5,2.5])line(v(p.x-4,p.y+z),v(p.x+4,p.y+z),'#448a81',1.5)}
}

// Wave phase is k·r - ωt + φ. λ is shortened by n in each medium.
function beam(start,dir,length,beamWidth,phase,n=state.n1,amp=1,color=spectral(),style='front',strong=false){
  if(length<.5||amp<1e-7)return;
  const normal=v(-dir.y,dir.x),lambda=Math.max(9,state.wavelength*geometry.scale/n),k=TAU/lambda;
  ctx.save();ctx.translate(start.x,start.y);ctx.rotate(Math.atan2(dir.y,dir.x));
  if(style==='front'){
    ctx.beginPath();ctx.rect(0,-beamWidth/2,length,beamWidth);ctx.clip();
    ctx.fillStyle=rgba(color,.018+.018*amp);ctx.fillRect(0,-beamWidth/2,length,beamWidth);
    const offset=((phase-time)%TAU+TAU)%TAU;
    for(let half=-Math.ceil((Math.abs(offset)+k*length)/Math.PI)-2;half<Math.ceil((Math.abs(offset)+k*length)/Math.PI)+2;half++){
      const s=(half*Math.PI-offset)/k;
      if(s<0||s>length)continue;
      const trough=Math.abs(half%2)===1;
      ctx.beginPath();ctx.moveTo(s,-beamWidth/2);ctx.lineTo(s,beamWidth/2);
      ctx.strokeStyle=rgba(color,strong?(.08+.86*amp):(.23+.5*amp));ctx.lineWidth=strong?(0.8+2.7*amp):1.35;
      ctx.setLineDash(trough?[4,4]:[]);ctx.stroke();
    }
  }else{
    ctx.beginPath();
    const amplitude=Math.min(beamWidth*.42,19)*amp;
    for(let s=0;s<=length;s+=1.5){const y=amplitude*Math.sin(k*s-time+phase);if(s===0)ctx.moveTo(s,y);else ctx.lineTo(s,y)}
    ctx.strokeStyle=rgba(color,.85);ctx.lineWidth=strong?2.4:1.6;
    if(color[0]===203)ctx.setLineDash([5,3]);ctx.stroke();
  }
  ctx.restore();
}

function eye(p,u){
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(u.y,u.x)+Math.PI/2);
  ctx.beginPath();ctx.moveTo(-19,0);ctx.quadraticCurveTo(0,-20,19,0);ctx.quadraticCurveTo(0,16,-19,0);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#536f77';ctx.lineWidth=1.5;ctx.stroke();
  ctx.beginPath();ctx.ellipse(0,-1,7,9,0,0,TAU);ctx.fillStyle='#b6d7d0';ctx.fill();ctx.strokeStyle='#739b93';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.arc(0,-1,3.5,0,TAU);ctx.fillStyle='#354f58';ctx.fill();ctx.beginPath();ctx.arc(-1.4,-3.2,1.4,0,TAU);ctx.fillStyle='#fff';ctx.fill();ctx.restore();
  label('観測者',p.x,p.y-29,'#7b9096',10,'center');
}

function waveTrace(points,indices,phase,amplitude,color,dashed=false){
  const k0=TAU/(state.wavelength*Math.max(geometry.scale,1e-8));
  const path=sampleWavePath(points,indices,k0,phase,time,amplitude);
  if(!path.samples.length)return path.phase;
  ctx.save();ctx.beginPath();
  const samples=path.samples;
  ctx.moveTo(samples[0].x,samples[0].y);
  // Quadratic interpolation rounds the optical-axis corner without cutting
  // the curve into separate, clipped waves on either side of an interface.
  for(let i=1;i<samples.length-1;i++){
    const p=samples[i],next=samples[i+1];
    ctx.quadraticCurveTo(p.x,p.y,(p.x+next.x)/2,(p.y+next.y)/2);
  }
  const end=samples.at(-1);ctx.lineTo(end.x,end.y);
  ctx.strokeStyle=rgba(color,.94);ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';
  if(dashed)ctx.setLineDash([5,3]);ctx.stroke();ctx.restore();
  return path.phase;
}

function drawWavePaths(){
  const {A,B,C,inc,out,start,L,beamWidth,scale}=geometry;
  const firstStart=add(C,mul(inc,-L)),end=add(C,mul(out,Math.max(0,L-15)));
  const mixingDistance=Math.min(38,L*.23),mixingPoint=add(C,mul(out,mixingDistance));
  const k0=TAU/(state.wavelength*Math.max(scale,1e-8));
  const incidentAtA=k0*state.n1*dot(sub(A,C),inc);
  const total=model.a1+model.a2,a1=total?model.a1/total:0,a2=total?model.a2/total:0;
  const magnitude=Math.min(beamWidth*.42,18);
  const guide=(points,color)=>{for(let i=1;i<points.length;i++)line(points[i-1],points[i],rgba(color,.28),1)};
  // Ray 1 enters at C and reflects directly. Ray 2 enters at A, makes a
  // round trip A–B–C in the film, and emerges along exactly the same C–eye ray.
  if(model.a1>1e-7){
    guide([firstStart,C],incidentColor);
    waveTrace([firstStart,C],[state.n1],-k0*state.n1*L,magnitude*a1,incidentColor);
    arrow(add(firstStart,mul(inc,L*.4)),add(firstStart,mul(inc,L*.4+16)),rgba(incidentColor,.8));
  }
  if(!model.topTIR){
    const roundHalf=Math.hypot(B.x-A.x,B.y-A.y);
    guide([start,A,B],incidentColor);
    // One continuous path crosses A, with no independent phase reset.
    waveTrace([start,A,B],[state.n1,state.n2],incidentAtA-k0*state.n1*L,magnitude*(a2||.5),incidentColor);
    arrow(add(start,mul(inc,L*.4)),add(start,mul(inc,L*.4+16)),rgba(incidentColor,.8));
    if(model.a2>1e-7){
      const atB=incidentAtA+k0*state.n2*roundHalf+model.reflectionPhase;
      guide([B,C],reflectedColor);
      if(state.composition==='individual'){
        // The path through C and up to the observer is also a single curve.
        waveTrace([B,C,end],[state.n2,state.n1],atB,magnitude*a2,secondColor,true);
      }else waveTrace([B,C,mixingPoint],[state.n2,state.n1],atB,magnitude*a2,reflectedColor);
    }
  }
  if(total>1e-7){
    guide([C,end],reflectedColor);
    if(state.composition==='individual'){
      if(model.a1>1e-7)waveTrace([C,end],[state.n1],model.phi1,magnitude*a1,reflectedColor);
    }else{
      const phase=model.sumPhase??model.phi1;
      if(model.a1>1e-7)waveTrace([C,mixingPoint],[state.n1],model.phi1,magnitude*a1,reflectedColor);
      waveTrace([mixingPoint,end],[state.n1],phase+k0*state.n1*mixingDistance,magnitude*model.amplitude/total,reflectedColor);
      if(model.a1>1e-7&&model.a2>1e-7)label('合成',mixingPoint.x+22,mixingPoint.y-16,'#af803e',10,'left',true);
    }
    arrow(add(C,mul(out,L*.66)),add(C,mul(out,L*.66+16)),rgba(reflectedColor,.8));
  }
  if(state.angle>=8&&Math.hypot(C.x-A.x,C.y-A.y)>23){
    label('①',firstStart.x+17,firstStart.y+5,'#5b859d',14,'center',true);
    label('②',start.x-17,start.y+5,'#5b859d',14,'center',true);
  }
}

function draw(){
  if(!width||!height)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);layout();
  const g=geometry,{A,B,C,out,inc,inside,up,start,eye:eyeAt,join,mid,L,joinOffset,depth,yTop,yBottom,beamWidth,scale}=g;
  ctx.fillStyle='#fcfdfd';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#e8f3ef';ctx.fillRect(0,yTop,width,Math.max(.6,depth));
  ctx.fillStyle='#f0f5f8';ctx.fillRect(0,yBottom,width,height-yBottom);
  // Very light material texture conveys the film without competing with the waves.
  ctx.save();ctx.beginPath();ctx.rect(0,yTop,width,depth);ctx.clip();
  for(let x=10;x<width;x+=20)for(let y=yTop+10;y<yBottom;y+=20){ctx.fillStyle='#a8cbc32b';ctx.fillRect(x,y,1,1)}ctx.restore();
  line(v(0,yTop),v(width,yTop),'#9fbeb8',1);line(v(0,yBottom),v(width,yBottom),'#9fbeb8',1);
  const wave=state.view==='wave',normalAt=wave?C:A;
  line(v(normalAt.x,yTop-70),v(normalAt.x,Math.min(yBottom+30,height-30)),'#aabcc2',1,[4,5]);
  label('法線',normalAt.x+8,yTop-65,'#93a5ac',10);
  const D=wave?add(C,mul(inc,-dot(sub(C,A),inc))):add(A,mul(out,dot(sub(C,A),out)));
  if(state.marker&&!model.topTIR){
    ctx.lineCap='round';line(A,B,'#efdb3b88',12);line(B,C,'#efdb3b88',12);line(wave?C:A,D,'#e78aaf99',12);line(wave?A:C,D,'#a1a1a9',1,[3,4]);ctx.lineCap='butt';
    if(depth>20)label('膜内の往復',B.x+12,B.y-8,'#9f831b',10,'left',true);
    label(wave?'Δ = n₂(AB + BC) − n₁DC':'Δ = n₂(AB + BC) − n₁AD',width-20,height-44,'#8d8555',width<500?9:11,'right',true);
    for(const [p,text,dx,dy] of [[A,'A',-12,13],[B,'B',0,14],[C,'C',10,13],[D,'D',10,-8]])label(text,p.x+dx,p.y+dy,'#6d7f81',10,'center',true);
  }
  if(wave)drawWavePaths();
  else {
  // Plane-wave display: parallel reflected beam strips.
  const guide='#a3b8b9';
  line(start,A,guide,1);
  const end1=add(A,mul(out,L+5)),end2=add(C,mul(out,L+5));
  if(model.a1>1e-7)line(A,end1,'#9fb9bd99',1,[3,4]);
  if(!model.topTIR&&model.a2>1e-7){line(A,B,guide,1);line(B,C,guide,1);line(C,end2,'#9fb9bd99',1,[3,4])}
  const k0=TAU/(state.wavelength*Math.max(scale,1e-8));
  beam(start,inc,L,beamWidth,-k0*state.n1*L,state.n1,.85,incidentColor,state.view);
  if(!model.topTIR){
    const len=depth/Math.max(.000001,Math.cos(model.theta2));
    // Clip each beam to its own medium so crests never cross an interface.
    ctx.save();ctx.beginPath();ctx.rect(0,yTop,width,depth);ctx.clip();
    beam(A,inside,len,beamWidth*.76,0,state.n2,.7,incidentColor,state.view);
    if(model.a2>1e-7)beam(B,up,len,beamWidth*.76,k0*state.n2*len+model.reflectionPhase,state.n2,.7,reflectedColor,state.view);
    ctx.restore();
  }
  const maxAmp=model.a1+model.a2;
  const a1=maxAmp?model.a1/maxAmp:0,a2=maxAmp?model.a2/maxAmp:0;
  const s1=joinOffset+dot(sub(mid,A),out),s2=joinOffset+dot(sub(mid,C),out);
  const outputWidth=Math.min(width*.29,beamWidth+g.separation),outputLength=Math.max(0,L-joinOffset-12);
  ctx.save();ctx.beginPath();ctx.rect(0,0,width,yTop);ctx.clip();
  if(model.a1>1e-7)beam(A,out,Math.max(0,s1),beamWidth,model.phi1,state.n1,.7,reflectedColor,state.view);
  if(model.a2>1e-7)beam(C,out,Math.max(0,s2),beamWidth,k0*state.n1*dot(sub(C,A),out)+model.phi2,state.n1,.7,reflectedColor,state.view);
  const basePhase=k0*state.n1*dot(sub(join,A),out);
  const sumPhase=model.sumPhase??model.phi1;
  const amplitude=maxAmp?model.amplitude/maxAmp:0;
  beam(join,out,outputLength,outputWidth,basePhase+sumPhase,state.n1,amplitude,reflectedColor,state.view,true);
  ctx.restore();
  // Arrowheads separate direction from the motion of crests.
  arrow(add(start,mul(inc,L*.49)),add(start,mul(inc,L*.49+14)),'#8caaa7',1.3);
  if(maxAmp>1e-7)arrow(add(join,mul(out,outputLength*.54)),add(join,mul(out,outputLength*.54+14)),'#8caaa7',1.3);
  }
  // Angle is measured from the normal, never from the surface.
  const radius=Math.min(43,L*.55);
  if(state.angle>0){ctx.beginPath();ctx.arc(normalAt.x,normalAt.y,radius,-Math.PI/2-model.theta1,-Math.PI/2);ctx.strokeStyle='#83a8a2';ctx.lineWidth=1;ctx.stroke()}
  label(`${state.angle}°`,normalAt.x-Math.sin(model.theta1/2)*(radius+17),normalAt.y-Math.cos(model.theta1/2)*(radius+17),'#4f8179',11,'center',true);
  const topPhase=model.topTIR?'全反射':model.a1<1e-7?'反射なし':model.phi1?'位相反転 π':'反転なし';
  label(topPhase,normalAt.x+(wave?13:-12),normalAt.y-15,'#728f91',10,wave?'left':'right',true);
  if(!model.topTIR){
    const bottomPhase=model.bottomTIR?`全反射 ${Math.round(model.reflectionPhase*180/Math.PI)}°`:model.a2<1e-7?'反射なし':Math.abs(model.reflectionPhase)>.01?'位相反転 π':'反転なし';
    label(bottomPhase,B.x+16,B.y+18,'#728f91',10,'left',true);
  }
  // A bracket and a generous invisible hit area make the lower interface draggable.
  const bracketX=width-30;
  line(v(bracketX,yTop),v(bracketX,yBottom),'#89aaa5',1);
  line(v(bracketX-5,yTop),v(bracketX+5,yTop),'#89aaa5',1);
  line(v(bracketX-5,yBottom),v(bracketX+5,yBottom),'#89aaa5',1);
  if(depth>30)label('d',bracketX-10,(yTop+yBottom)/2,'#6d9087',12,'right');
  g.thicknessHandle=v(width-63,yBottom);
  // At normal incidence the incoming and outgoing axes coincide; keep the
  // angle handle clear of the observer's eye.
  g.angleHandle=state.angle<8?add(start,mul(inc,32)):start;
  knob(g.thicknessHandle,'thickness');knob(g.angleHandle,'angle');
  if(model.a1+model.a2>1e-7)eye(eyeAt,out);
  if(model.topTIR)label('媒質 2 へ伝搬しない',Math.min(width-20,A.x+45),yTop+30,'#718b91',11,'left',true);
}

function resize(){const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);draw()}
new ResizeObserver(resize).observe(canvas);

for(const key of ['wavelength','thickness','angle'])$(key).addEventListener('input',e=>{state[key]=Number(e.target.value);update()});
for(const key of ['n1','n2','n3']){
  const input=$(key);
  input.addEventListener('input',()=>{
    if(input.value!==''&&Number.isFinite(input.valueAsNumber)&&input.valueAsNumber>=.5&&input.valueAsNumber<=2.5){state[key]=input.valueAsNumber;input.removeAttribute('aria-invalid');update()}
    else input.setAttribute('aria-invalid','true');
  });
  input.addEventListener('change',()=>{const n=Number(input.value);state[key]=Number.isFinite(n)&&input.value!==''?Math.round(clamp(n,.5,2.5)*100)/100:state[key];input.value=state[key].toFixed(2);input.removeAttribute('aria-invalid');update()});
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;update()}));
document.querySelectorAll('[data-composition]').forEach(b=>b.addEventListener('click',()=>{state.composition=b.dataset.composition;update()}));
$('marker').addEventListener('change',e=>{state.marker=e.target.checked;update()});
function playButton(){ $('play').setAttribute('aria-label',state.playing?'一時停止':'再生');$('play').title=state.playing?'一時停止':'再生';$('play').innerHTML=state.playing?'<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>':'<svg viewBox="0 0 24 24"><path d="m9 5 10 7-10 7Z"/></svg>' }
$('play').addEventListener('click',()=>{state.playing=!state.playing;playButton()});
$('reset').addEventListener('click',()=>{Object.assign(state,defaults,{view:'front',composition:'sum',marker:false});for(const key of ['n1','n2','n3'])$(key).value=state[key].toFixed(2);$('marker').checked=false;time=0;update()});
$('help').addEventListener('click',()=>$('help-dialog').showModal());$('close-help').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',e=>{if(e.target===$('help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
if(!document.documentElement.requestFullscreen)$('fullscreen').hidden=true;
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{ /* Fullscreen may be disallowed by the embedding browser. */ }});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'全画面表示を終了':'全画面表示')});

const pointer=e=>{const r=canvas.getBoundingClientRect();return v(e.clientX-r.left,e.clientY-r.top)};
function hit(p){if(!geometry)return null;const g=geometry;
  if(Math.hypot(p.x-g.angleHandle.x,p.y-g.angleHandle.y)<30)return 'angle';
  if(Math.abs(p.y-g.yBottom)<20&&(p.x>width-100||Math.abs(p.x-g.B.x)<70))return 'thickness';
  const rel=sub(p,g.A),along=dot(rel,g.inc),normal=Math.abs(rel.x*g.inc.y-rel.y*g.inc.x);
  if(along< -20&&along> -g.L-20&&normal<20)return 'angle';
  if(state.view==='wave'){
    const first=sub(p,g.C),s=dot(first,g.inc),offset=Math.abs(first.x*g.inc.y-first.y*g.inc.x);
    if(s< -20&&s> -g.L-20&&offset<20)return 'angle';
  }
  return null;
}
canvas.addEventListener('pointerdown',e=>{
  if(drag||e.isPrimary===false)return;
  const p=pointer(e),type=hit(p);if(!type)return;
  const g=geometry,offset=origin=>Math.abs((p.x-origin.x)*g.inc.y-(p.y-origin.y)*g.inc.x);
  const origin=state.view==='wave'&&offset(g.C)<offset(g.A)?g.C:g.A;
  drag={type,id:e.pointerId,start:p,thickness:state.thickness,scale:g.scale,A:{...origin}};
  canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';e.preventDefault();
});
canvas.addEventListener('pointermove',e=>{const p=pointer(e);if(!drag){canvas.style.cursor=hit(p)==='thickness'?'ns-resize':hit(p)==='angle'?'grab':'default';return}if(e.pointerId!==drag.id)return;
  if(drag.type==='thickness')state.thickness=Math.round(clamp(drag.thickness+(p.y-drag.start.y)/drag.scale,0,1000));
  else state.angle=Math.round(clamp(Math.atan2(drag.A.x-p.x,drag.A.y-p.y)*180/Math.PI,0,70));update();e.preventDefault();
});
function endDrag(e){if(drag?.id===e.pointerId){drag=null;canvas.style.cursor='default'}}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);

function animate(now){
  const dt=previous?Math.min((now-previous)/1000,.06):0;previous=now;
  if(state.playing&&!document.hidden&&!$('help-dialog').open){time=(time+dt*2.1)%TAU;if(now-lastDraw>1000/30){draw();lastDraw=now}}
  requestAnimationFrame(animate);
}
playButton();update();requestAnimationFrame(animate);
