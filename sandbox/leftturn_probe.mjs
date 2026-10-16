// scratch: confirm the untouched core baseline is collision-free before I edit it
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./leftturn.html', import.meta.url), 'utf8');
const a = html.indexOf('// ==CORE-START==');
const b = html.indexOf('// ==CORE-END==');
const core = html.slice(a + '// ==CORE-START=='.length, b);
const api = new Function(`"use strict";\n${core}\nreturn {Sim, DIRS, AXIS, DT, STOP, BOX_S, BOX_E, PRESETS, DEFAULT_CFG, pos};`)();
const { Sim, DIRS, DT, PRESETS, DEFAULT_CFG, pos, BOX_S, BOX_E, STOP } = api;
console.log('STOP', STOP, 'BOX', BOX_S, BOX_E, 'amber', DEFAULT_CFG.amber.toFixed(3), 'allRed', DEFAULT_CFG.allRed.toFixed(3));
for(const d of DIRS) console.log(d, 'entry', JSON.stringify(pos(d, BOX_S, 20)), 'boxexit', JSON.stringify(pos(d, BOX_E, 20)), 'stopline', JSON.stringify(pos(d, STOP, 20)));

const SEED = 20261016;
const MIN = 10;
for(const [name, rates] of Object.entries(PRESETS)){
  for(const mode of ['fixed', 'adaptive']){
    const cfg = Object.assign({}, DEFAULT_CFG, {rates: Object.assign({}, rates)});
    const sim = new Sim(cfg, mode, SEED);
    const t0 = Date.now();
    for(let k = 0; k < MIN * 60 / DT; k++) sim.step(DT);
    console.log(name.padEnd(9), mode.padEnd(8), 'passed', String(sim.stats.passed).padStart(4),
      'coll', sim.stats.collisions, 'red', sim.stats.redViol, 'drop', sim.stats.dropped,
      'avgWait', sim.avgWait().toFixed(2), 'wall', ((Date.now()-t0)/1000).toFixed(1) + 's');
  }
}
