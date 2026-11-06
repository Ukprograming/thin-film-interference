import {test} from 'node:test';
import assert from 'node:assert/strict';
import {optics,defaults,TAU,wavelengthColor} from '../physics.mjs';
import {sampleWavePath} from '../wave-path.mjs';
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);
test('one phase inversion: quarter-wave film reinforces; half-wave film cancels',()=>{
  const p={...defaults,angle:0,wavelength:600,n1:1,n2:1.5,n3:1};
  const constructive=optics({...p,thickness:100});
  const destructive=optics({...p,thickness:200});
  near(constructive.phi1,Math.PI);near(constructive.reflectionPhase,0);
  near(constructive.intensity,1);near(destructive.phase,Math.PI);
  assert.ok(destructive.intensity<.001);
});
test('two phase inversions: integer-wave optical path reinforces',()=>{
  const o=optics({...defaults,angle:0,wavelength:600,thickness:200,n1:1,n2:1.5,n3:2});
  near(o.phi1,Math.PI);near(o.reflectionPhase,Math.PI);near(o.intensity,1);
});
test('oblique incidence satisfies Snell and Δ = 2 n₂ d cos θ₂',()=>{
  const p={...defaults,angle:60,thickness:400};const o=optics(p);
  near(p.n1*Math.sin(o.theta1),p.n2*Math.sin(o.theta2));
  near(o.delta,2*p.n2*p.thickness*Math.cos(o.theta2));
  const roundTrip=2*p.n2*p.thickness/Math.cos(o.theta2);
  const reference=2*p.n1*p.thickness*Math.tan(o.theta2)*Math.sin(o.theta1);
  near(o.delta,roundTrip-reference);
});
test('matching indices removes the corresponding reflection',()=>{
  near(optics({...defaults,n2:1}).a1,0);
  near(optics({...defaults,n3:1.5}).a2,0);
  const o=optics({...defaults,n1:1.5,n2:1.5,n3:1.5});
  near(o.amplitude,0);near(o.intensity,0);
});
test('top total internal reflection produces only one reflected beam',()=>{
  const o=optics({...defaults,n1:1.5,n2:1,angle:60});
  assert.equal(o.topTIR,true);near(o.a1,1);near(o.a2,0);assert.equal(o.delta,null);
  assert.ok(o.phi1<0&&o.phi1>-Math.PI);
});
test('bottom total internal reflection uses a continuous reflection phase',()=>{
  const o=optics({...defaults,n1:1.5,n2:2,n3:1,angle:60});
  assert.equal(o.topTIR,false);assert.equal(o.bottomTIR,true);
  assert.ok(o.reflectionPhase<0&&o.reflectionPhase>-Math.PI);
});
test('all supported optical states remain finite and normalized',()=>{
  for(const n1 of [.5,1,1.5,2.5])for(const n2 of [.5,1,1.5,2.5])for(const n3 of [.5,1,1.5,2.5])for(const angle of [0,35,70])for(const thickness of [0,300,1000]) {
    const o=optics({...defaults,n1,n2,n3,angle,thickness});
    for(const k of ['amplitude','a1','a2','phi1','phi2','intensity'])assert.ok(Number.isFinite(o[k]),`${k}: ${JSON.stringify({n1,n2,n3,angle,thickness})}`);
    assert.ok(o.intensity>=0&&o.intensity<=1+1e-9);
    if(!o.topTIR)assert.ok(o.phase>=0&&o.phase<TAU+1e-9);
  }
});
test('visible wavelengths always produce valid RGB values',()=>{
  for(let w=380;w<=750;w++)assert.ok(wavelengthColor(w).every(c=>Number.isInteger(c)&&c>=0&&c<=255));
});
test('waveform crosses refraction boundaries with the same phase and displacement',()=>{
  const A={x:40,y:50},B={x:65,y:120},C={x:90,y:50};
  const source={x:5,y:0},end={x:135,y:0};
  const k=.024,initial=.7,time=1.2,amplitude=12;
  const entry=sampleWavePath([source,A],[1],k,initial,time,amplitude);
  const transmitted=sampleWavePath([A,B],[1.5],k,entry.phase,time,amplitude);
  near(entry.samples.at(-1).x,transmitted.samples[0].x);
  near(entry.samples.at(-1).y,transmitted.samples[0].y);
  const returning=sampleWavePath([B,C],[1.5],k,transmitted.phase,time,amplitude);
  const emergent=sampleWavePath([C,end],[1],k,returning.phase,time,amplitude);
  near(returning.samples.at(-1).x,emergent.samples[0].x);
  near(returning.samples.at(-1).y,emergent.samples[0].y);
  const combined=sampleWavePath([source,A,B],[1,1.5],k,initial,time,amplitude);
  near(combined.phase,transmitted.phase);
});
test('two distinct incident paths give the modeled phase difference at a common exit',()=>{
  for(const angle of [0,35,60]){
    const p={...defaults,angle,thickness:700};const o=optics(p),scale=.14;
    const A={x:0,y:0},B={x:p.thickness*scale*Math.tan(o.theta2),y:p.thickness*scale},C={x:2*B.x,y:0};
    const k=TAU/(p.wavelength*scale);
    const phaseAtA=-k*p.n1*C.x*Math.sin(o.theta1);
    const path=sampleWavePath([A,B,C],[p.n2,p.n2],k,phaseAtA+o.reflectionPhase,0,10);
    near(path.phase,o.phi2);
  }
});
