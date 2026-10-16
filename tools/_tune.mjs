import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = readFileSync(join(ROOT,'index.html'),'utf8');
const S='// ==CORE-START==', E='// ==CORE-END==';
const body = base.slice(base.indexOf(S)+S.length, base.indexOf(E));
const PRESETS={balanced:{N:8,E:8,S:8,W:8},office:{N:16,S:16,E:5,W:5},market:{N:5,S:5,E:16,W:16},stress:{N:22,E:22,S:22,W:22}};
function core(ratio, waitS, starve){
  const src = body.replace(/const PRIORITY_RATIO = [^;]+;/, 'const PRIORITY_RATIO = '+ratio+';')
                 .replace(/const PRIORITY_WAIT_S = [^;]+;/, 'const PRIORITY_WAIT_S = '+waitS+';')
                 .replace(/STARVE_S = \d+(\.\d+)?;/, 'STARVE_S = '+starve+';');
  return new Function('"use strict";'+src+'\nreturn {Sim,DT,DIRS,AXIS,amberOf,allRedOf,STARVE_S};')();
}
function run(c,rates,mode,minutes=10,seed=20261016){
  const cfg={rates:{...rates},green:12,amber:c.amberOf(),allRed:c.allRedOf(),corridor:true,surge:null};
  const sim=new c.Sim(cfg,mode,seed); const n=Math.round(minutes*60/c.DT);
  const sv=[0,0];
  for(let i=0;i<n;i++){sim.step(c.DT); for(const ax of [0,1]) if(sim.pressure(ax)>0) sv[ax]=Math.max(sv[ax],sim.t-sim.lastGreen[ax]);}
  return {p:sim.stats.passed,w:sim.avgWait(),c:sim.stats.collisions,r:sim.stats.redViol,sv:Math.max(sv[0],sv[1])};
}
console.log('ratio wait  | balanced        | office          | market          | stress          | maxStarve');
for(const [ratio,waitS] of [[1e9,9],[1.5,9],[2.5,9],[2.5,12],[4,9],[6,9],[1e9,99]]){
  const c=core(ratio,waitS,60); const out=[]; let ms=0;
  for(const k of ['balanced','office','market','stress']){
    const r=run(c,PRESETS[k],'adaptive'); ms=Math.max(ms,r.sv);
    out.push(String(r.p).padStart(4)+' '+r.w.toFixed(1).padStart(5)+'s'+(r.c||r.r?'!':''));
  }
  console.log(String(ratio).padEnd(6),String(waitS).padStart(3),'|',out.join(' | '),'|',ms.toFixed(1),'(STARVE',c.STARVE_S+')');
}
