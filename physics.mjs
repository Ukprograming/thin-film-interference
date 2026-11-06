// Two reflected s-polarized beams; nonabsorbing media. All lengths are in nm.
export const TAU = 2 * Math.PI;
export const defaults = Object.freeze({ wavelength:550, thickness:300, angle:35, n1:1, n2:1.5, n3:1 });
const EPS = 1e-9;
export function optics(p) {
  const theta1 = p.angle * Math.PI / 180;
  const q = p.n1 * Math.sin(theta1); // conserved tangential wave-vector / k0
  const z1 = p.n1 * Math.cos(theta1);
  const z2sq = p.n2*p.n2-q*q;
  if (z2sq <= EPS) {
    const evanescent = Math.sqrt(Math.max(0,-z2sq));
    return { theta1, theta2:Math.PI/2, topTIR:true, bottomTIR:false,
      a1:1, a2:0, phi1:-2*Math.atan2(evanescent,z1), phi2:0,
      delta:null, phase:null, intensity:1, amplitude:1, visibility:0 };
  }
  const z2 = Math.sqrt(z2sq);
  const theta2 = Math.asin(Math.min(1,q/p.n2));
  const r12 = (z1-z2)/(z1+z2);
  const phi1 = r12 < 0 ? Math.PI : 0;
  const z3sq = p.n3*p.n3-q*q;
  const bottomTIR = z3sq < -EPS;
  let r23, reflectionPhase;
  if (bottomTIR) {
    r23=1;
    reflectionPhase=-2*Math.atan2(Math.sqrt(-z3sq),z2);
  } else {
    const z3=Math.sqrt(Math.max(0,z3sq));
    const r=(z2-z3)/(z2+z3);
    r23=Math.abs(r);
    reflectionPhase=r<0?Math.PI:0;
  }
  const a1=Math.abs(r12), a2=(1-r12*r12)*r23; // t12 * t21 * |r23|
  const delta=2*z2*p.thickness;
  const phi2=TAU*delta/p.wavelength+reflectionPhase;
  const phase=((phi2-phi1)%TAU+TAU)%TAU;
  const real=a1*Math.cos(phi1)+a2*Math.cos(phi2);
  const imag=a1*Math.sin(phi1)+a2*Math.sin(phi2);
  const amplitude=Math.hypot(real,imag);
  const maximum=a1+a2;
  return {theta1,theta2,topTIR:false,bottomTIR,a1,a2,phi1,phi2,
    reflectionPhase,delta,phase,amplitude,sumPhase:Math.atan2(imag,real),
    intensity:maximum>EPS?amplitude**2/maximum**2:0,
    visibility:maximum>EPS?2*a1*a2/(a1*a1+a2*a2):0};
}
export function wavelengthColor(w) {
  // Visible-spectrum hue, darkened to keep wavefronts legible on a light canvas.
  const stops=[[380,119,66,176],[440,70,80,207],[490,20,141,175],[520,35,150,110],[550,96,151,44],[580,173,145,20],[620,208,100,26],[680,192,58,55],[750,151,57,72]];
  for(let i=1;i<stops.length;i++) if(w<=stops[i][0]) {
    const a=stops[i-1],b=stops[i],t=(w-a[0])/(b[0]-a[0]);
    return a.slice(1).map((v,j)=>Math.round(v+(b[j+1]-v)*t));
  }
  return stops.at(-1).slice(1);
}
