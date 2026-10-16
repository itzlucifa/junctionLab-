// scratch probe: measure stop-line discharge under a long green
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./webster.html', import.meta.url), 'utf8');
const a = html.indexOf('// ==CORE-START==');
const b = html.indexOf('// ==CORE-END==');
const core = html.slice(a + '// ==CORE-START=='.length, b);
const api = new Function(`"use strict";\n${core}\nreturn {Sim, DIRS, AXIS, DT, MIN_GREEN, MAX_GREEN, STOP};`)();
const { Sim, DIRS, AXIS, DT, STOP } = api;
console.log('STOP =', STOP);

const SEED = 20261016;

function run(axis, level, warm, win){
  const rates = {N:0,E:0,S:0,W:0};
  const pair = axis === 0 ? ['N','S'] : ['E','W'];
  pair.forEach(d => rates[d] = level);
  const sim = new Sim({rates, green:1e9, amber:3, allRed:1.5, corridor:false}, 'fixed', SEED);
  if(axis === 1){ sim.ctl = {axis:1, state:'G', timer:0, nextAxis:0, gapT:0}; sim.prevLamp = ['R','G']; sim.redSince = [0,-99]; }
  const maxId = {N:0,E:0,S:0,W:0}, cnt = {N:0,E:0,S:0,W:0}, types = {};
  const poll = () => { for(const d of DIRS){ for(const c of sim.cars[d]) if(c.crossed && c.id > maxId[d]){ maxId[d] = c.id; cnt[d]++; types[c.type] = (types[c.type]||0)+1; } } };
  const N0 = Math.round(warm / DT);
  for(let i = 0; i < N0; i++) sim.step(DT);
  poll();
  const pendA = pair.map(d => sim.pending[d].length);
  const t0 = sim.t, c0 = JSON.parse(JSON.stringify(cnt));
  const N1 = Math.round(win / DT);
  for(let i = 0; i < N1; i++){ sim.step(DT); poll(); }
  const dt = sim.t - t0;
  const pendB = pair.map(d => sim.pending[d].length);
  const per = {}; pair.forEach(d => per[d] = (cnt[d] - c0[d]) / dt * 3600);
  const flow = pair.reduce((s,d) => s + (cnt[d]-c0[d]), 0) / dt * 3600 / pair.length;
  return {level, flow, per, pendA, pendB, queues: pair.map(d=>sim.queue(d)), types, dt,
          screen: pair.map(d=>sim.cars[d].length), dropped: sim.stats.dropped};
}

for(const level of [20, 30, 45, 60]){
  const r = run(0, level, 55, 30);
  console.log('axis0 lvl', level, JSON.stringify({flow: +r.flow.toFixed(0), per: Object.fromEntries(Object.entries(r.per).map(([k,v])=>[k,+v.toFixed(0)])), pendA: r.pendA, pendB: r.pendB, screen: r.screen, types: r.types, dropped: r.dropped}));
}
for(const level of [30, 60]){
  const r = run(1, level, 55, 30);
  console.log('axis1 lvl', level, JSON.stringify({flow: +r.flow.toFixed(0), per: Object.fromEntries(Object.entries(r.per).map(([k,v])=>[k,+v.toFixed(0)])), pendA: r.pendA, pendB: r.pendB, screen: r.screen, types: r.types, dropped: r.dropped}));
}
