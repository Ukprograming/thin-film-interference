// A waveform is drawn with a common displacement axis (parallel to the
// interfaces). Refraction changes the optical distance per unit path length,
// not the phase or displacement at the shared endpoint.
export function sampleWavePath(points, indices, k0, initialPhase, time, amplitude) {
  const samples=[];
  let phase=initialPhase;
  for(let segment=0;segment<points.length-1;segment++) {
    const a=points[segment],b=points[segment+1];
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    const count=Math.max(1,Math.ceil(length/1.5));
    for(let i=segment?1:0;i<=count;i++) {
      const fraction=i/count;
      const localPhase=phase+k0*indices[segment]*length*fraction;
      samples.push({x:a.x+dx*fraction+amplitude*Math.sin(localPhase-time),
        y:a.y+dy*fraction,phase:localPhase,segment,end:i===count});
    }
    phase+=k0*indices[segment]*length;
  }
  return {samples,phase};
}
