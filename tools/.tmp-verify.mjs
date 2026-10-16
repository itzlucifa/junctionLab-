// temporary: why do run() and a manual loop disagree?
import { run, makeCfg, Sim, DT, DIRS } from './headless.mjs';
const ov = { amber: 0.05, allRed: 0, green: 4 };
const a = run({ preset: 'stress', mode: 'fixed', minutes: 4, seed: 20261016, cfgOverrides: ov });
const cfg = makeCfg('stress', ov);
const sim = new Sim(cfg, 'fixed', 20261016);
for (let i = 0; i < 14400; i++) sim.step(DT);
console.log('run   cfg', JSON.stringify(makeCfg('stress', ov)));
console.log('loop  cfg', JSON.stringify(cfg));
console.log('run   ', JSON.stringify({ coll: a.collisions, passed: a.passed, served: a.served, dropped: a.dropped, t: a.simSeconds }));
console.log('loop  ', JSON.stringify({ coll: sim.stats.collisions, passed: sim.stats.passed, served: sim.stats.served, dropped: sim.stats.dropped, t: sim.t }));
