// JunctionLab benchmark — prints the results table used by README.md.
// Every scenario is run in all three control strategies against the SAME vehicles
// (identical seed), so the only difference between columns is the signal controller.
//
//   node scripts/benchmark.js            15 simulated minutes, all presets + surge
//   node scripts/benchmark.js --csv      machine-readable output
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const START = '// ==CORE-START==';
const END = '// ==CORE-END==';
const src = html.slice(html.indexOf(START) + START.length, html.indexOf(END));
const core = new Function('"use strict";' + src + '\nreturn {Sim,DIRS,DT,PRESETS,SURGE,amberOf,allRedOf,calibrateSaturation,websterPlan};')();

const SEED = 20261016;
const MINUTES = Number(process.env.JL_MINUTES || 15);
const MODES = ['fixed', 'calculated', 'adaptive'];
const LABEL = { fixed: 'Fixed (manual)', calculated: 'Fixed (calculated)', adaptive: 'Adaptive' };
const SAT = core.calibrateSaturation().perLaneHour;

function run(mode, rates, surge) {
  const cfg = {
    rates: Object.assign({}, rates), green: 12,
    amber: core.amberOf(), allRed: core.allRedOf(),
    corridor: true, surge, satFlow: SAT
  };
  const sim = new core.Sim(cfg, mode, SEED);
  const steps = Math.round(MINUTES * 60 / core.DT);
  for (let i = 0; i < steps; i++) sim.step(core.DT);
  return sim;
}

const scenarios = [];
for (const [name, rates] of Object.entries(core.PRESETS)) scenarios.push({ name, rates, surge: null });
for (const [name, rates] of Object.entries(core.PRESETS)) {
  scenarios.push({
    name: name + ' + surge', rates,
    surge: { blockSeconds: core.SURGE.blockSeconds, pattern: core.SURGE.pattern }
  });
}

const rows = [];
for (const sc of scenarios) {
  for (const mode of MODES) {
    const s = run(mode, sc.rates, sc.surge);
    rows.push({
      scenario: sc.name, mode: LABEL[mode],
      passed: s.stats.passed,
      throughput: Math.round(s.throughputPerHour()),
      avg: +s.avgWait().toFixed(1),
      p95: +s.p95Wait().toFixed(1),
      los: s.grade(),
      collisions: s.stats.collisions,
      redRuns: s.stats.redViol
    });
  }
}

const t0 = Date.now();
if (process.argv.includes('--csv')) {
  const head = Object.keys(rows[0]);
  console.log(head.join(','));
  for (const r of rows) console.log(head.map(k => r[k]).join(','));
} else {
  console.log('JunctionLab benchmark — ' + MINUTES + ' simulated minutes, seed ' + SEED +
    ', identical vehicle stream per mode.');
  console.log('calibrated saturation flow: ' + Math.round(SAT) + ' veh/h/lane');
  console.log('derived amber ' + core.amberOf().toFixed(2) + ' s, all-red ' + core.allRedOf().toFixed(2) + ' s');
  console.log();
  const cols = { scenario: 18, mode: 19, passed: 8, throughput: 11, avg: 9, p95: 9, los: 4, collisions: 11, redRuns: 8 };
  const line = (o) => Object.keys(cols).map(k => String(o[k]).padEnd(cols[k])).join(' ');
  console.log(line({ scenario: 'Scenario', mode: 'Control', passed: 'Cars', throughput: 'Veh/h', avg: 'Avg s', p95: 'P95 s', los: 'LOS', collisions: 'Collisions', redRuns: 'Red' }));
  console.log('-'.repeat(101));
  for (const r of rows) console.log(line(r));
  console.log();
  const bad = rows.filter(r => r.collisions || r.redRuns);
  console.log(bad.length ? 'SAFETY: ' + bad.length + ' run(s) violated an invariant' :
    'SAFETY: 0 collisions and 0 red-light runs across all ' + rows.length + ' runs');
}
console.error('wall clock ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
