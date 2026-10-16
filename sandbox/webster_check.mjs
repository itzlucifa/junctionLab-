// Webster ("Fixed (calculated)") verification harness.
// Extracts the DOM-free CORE block from sandbox/webster.html and exercises it headless.
import fs from 'node:fs';

const FILE = new URL('./webster.html', import.meta.url);
const html = fs.readFileSync(FILE, 'utf8');
const START = '// ==CORE-START==', END = '// ==CORE-END==';
const a = html.indexOf(START), b = html.indexOf(END);
if(a < 0 || b < 0 || b < a) throw new Error('core markers not found');
const core = html.slice(a + START.length, b);
const api = new Function(`"use strict";\n${core}\nreturn {Sim, DIRS, AXIS, DT, MIN_GREEN, MAX_GREEN, STOP, PRESETS, DEFAULT_CFG,
  websterPlan, calibrateSaturation, setSaturationFlow, saturationFlow, saturationInfo, criticalDemand, SAT_BAND, SAT_FALLBACK, MAX_CYCLE};`)();
const {Sim, DIRS, DT, MIN_GREEN, PRESETS, DEFAULT_CFG, websterPlan, calibrateSaturation,
       setSaturationFlow, saturationFlow, saturationInfo, criticalDemand, SAT_BAND, MAX_CYCLE} = api;

const SEED = 20261016;
const MINUTES = 10;
const STEPS = Math.round(MINUTES * 60 / DT);
const pad = (s, n) => String(s).padEnd(n);
const num = (x, n, d = 1) => String(typeof x === 'number' ? x.toFixed(d) : x).padStart(n);
let failures = 0;
function assert(ok, msg){ console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + msg); if(!ok) failures++; }

/* ---------- 1. empirical saturation calibration ---------- */
console.log('\n=== Saturation calibration (measured, not assumed) ===');
const t0 = Date.now();
const cal = calibrateSaturation(SEED);
const wall = (Date.now() - t0) / 1000;
console.log(`calibration wall time: ${wall.toFixed(3)} s  (sim time ${(cal.warmup + cal.window) * 2} s, ladder ${cal.level.join('/')} veh/min)`);
for(const r of cal.perAxis){
  console.log(`axis ${r.axis} (${r.axis === 0 ? 'N-S' : 'E-W'}) @ ${r.level} veh/min/approach: ` +
    `flow ${r.flow} veh/h/lane, per approach ${JSON.stringify(r.perApproach)}, ` +
    `headway ${r.headway}s, crossings ${r.crossings} in ${r.greenSeconds}s green, ` +
    `saturated tail: ${r.saturated}, dropped ${r.dropped}`);
  console.log(`   per-type share of the discharge: ${JSON.stringify(r.typeCounts)} -> ${JSON.stringify(r.perTypeFlow)} veh/h/lane`);
}
console.log(`=> saturation flow used: ${cal.axes[0]} / ${cal.axes[1]} veh/h/lane (mean ${cal.flow})`);
console.log(`=> plausibility band ${SAT_BAND[0]}-${SAT_BAND[1]}: ${cal.plausible ? 'inside' : 'OUTSIDE (reported as measured, not clamped)'}`);
assert(saturationFlow()[0] === cal.axes[0] && saturationFlow()[1] === cal.axes[1], 'setSaturationFlow cached the axes globally');
assert(cal.saturated, 'both axes reached a genuinely saturated tail (queue still feeding the stop line at both ends of the window)');

/* ---------- 2. Webster plan formula sanity ---------- */
console.log('\n=== websterPlan() maths ===');
{
  const amber = DEFAULT_CFG.amber, allRed = DEFAULT_CFG.allRed, L = (amber + allRed) * 2;
  const dem = criticalDemand(PRESETS.office);
  const Y = dem[0] / cal.axes[0] + dem[1] / cal.axes[1];
  const p = websterPlan({demands: dem, saturation: cal.axes, amber, allRed, minGreen: MIN_GREEN});
  const Co = Math.ceil(((1.5 * L + 5) / (1 - Y)) / 5) * 5;
  assert(Math.abs(p.lostTime - L) < 1e-9, `lost time L = 2*(amber+all-red) = ${L.toFixed(2)} s`);
  assert(Math.abs(p.Y - Y) < 1e-9, `Y = sum of critical flow ratios = ${Y.toFixed(4)}`);
  assert(p.cycleLength === Math.min(Co, MAX_CYCLE) || p.cycleLength === Co, `Co = (1.5L+5)/(1-Y) rounded up to a multiple of 5 = ${p.cycleLength} s`);
  assert(p.cycleLength % 5 === 0, 'cycle length is a multiple of 5 s');
  assert(p.greens.every(g => g >= MIN_GREEN - 1e-9), `both greens >= minimum green ${MIN_GREEN} s (${p.greens.join(' / ')} s)`);
  assert(Math.abs(p.rawGreens[0] / p.rawGreens[1] - dem[0] / dem[1]) < 1e-9,
    `green split proportional to the critical flow ratios (${p.rawGreens.map(x => x.toFixed(2)).join(' / ')} s for demand ratio ${(dem[0] / dem[1]).toFixed(2)})`);
  assert(Math.abs(p.greens[0] - p.rawGreens[0]) <= 0.25 + 1e-9, 'displayed green is the raw split rounded to 0.5 s');
  const ov = websterPlan({demands: [1e5, 1e5], saturation: cal.axes, amber, allRed, minGreen: MIN_GREEN});
  assert(ov.degraded === true && ov.warning === 'demand exceeds capacity', `oversaturated demand degrades: ${ov.degraded} / "${ov.warning}"`);
  assert(ov.greens[0] === ov.greens[1], `degraded fallback uses equal greens (${ov.greens.join(' / ')} s)`);
  const tiny = websterPlan({demands: [60, 1500], saturation: cal.axes, amber, allRed, minGreen: MIN_GREEN});
  assert(tiny.degraded === false && tiny.greens[0] === MIN_GREEN && tiny.greens[1] < 40,
    `light phase clamped to min green and the deficit came off the busy phase (${tiny.greens.join(' / ')} s, warning: ${tiny.warning})`);
  const dead = websterPlan({demands: [0, 0], saturation: cal.axes, amber, allRed, minGreen: MIN_GREEN});
  assert(dead.greens.every(g => g >= MIN_GREEN) && dead.cycleLength % 5 === 0,
    `zero demand still yields a legal plan (${dead.cycleLength} s, ${dead.greens.join(' / ')} s, warning: ${dead.warning})`);
}

/* ---------- 3. per-preset plan + 10 minute runs ---------- */
function run(mode, rates, seed, planOverride){
  const cfg = {rates: Object.assign({}, rates), green: DEFAULT_CFG.green, amber: DEFAULT_CFG.amber,
               allRed: DEFAULT_CFG.allRed, corridor: DEFAULT_CFG.corridor};
  const sim = new Sim(cfg, mode, seed);
  if(planOverride) sim.plan = planOverride();
  for(let i = 0; i < STEPS; i++) sim.step(DT);
  return sim;
}
const rows = [];
console.log('\n=== Webster plan per preset (saturation flow ' + cal.axes.join(' / ') + ' veh/h/lane) ===');
console.log([pad('preset', 10), pad('demand N-S', 11), pad('demand E-W', 11), pad('y0', 7), pad('y1', 7), pad('Y', 7),
             pad('L s', 7), pad('Co s', 7), pad('green N-S', 10), pad('green E-W', 10), 'degraded'].join(''));
for(const name of Object.keys(PRESETS)){
  const rates = PRESETS[name];
  const dem = criticalDemand(rates);
  const plan = websterPlan({demands: dem, saturation: saturationFlow(), amber: DEFAULT_CFG.amber,
                            allRed: DEFAULT_CFG.allRed, minGreen: MIN_GREEN});
  console.log([pad(name, 10), num(dem[0], 11, 0), num(dem[1], 11, 0), num(plan.ratios[0], 7, 3), num(plan.ratios[1], 7, 3),
               num(plan.Y, 7, 3), num(plan.lostTime, 7, 2), num(plan.cycleLength, 7, 0),
               num(plan.greens[0], 10, 1), num(plan.greens[1], 10, 1),
               plan.degraded ? 'YES ' + plan.warning : 'no'].join(''));
  rows.push({name, rates, plan});
}

console.log(`\n=== ${MINUTES} simulated minutes per mode (seed ${SEED}) ===`);
console.log([pad('preset', 10), pad('metric', 22), pad('calculated', 12), pad('adaptive', 12), pad('delta', 10), 'winner'].join(''));
for(const r of rows){
  const calc = run('calculated', r.rates, SEED);
  const adpt = run('adaptive', r.rates, SEED);
  console.log(`  ${r.name}: plan applied by the controller -> Co ${calc.plan.cycleLength}s, greens ${calc.plan.greens.join('/')}s, ` +
    `greenFor(0)=${calc.greenFor(0)}s greenFor(1)=${calc.greenFor(1)}s, Y ${calc.plan.Y.toFixed(3)}, L ${calc.plan.lostTime.toFixed(2)}s` +
    (calc.plan.warning ? ` [warning: ${calc.plan.warning}]` : ''));
  assert(calc.stats.collisions === 0, `${r.name}/calculated: zero collisions (got ${calc.stats.collisions})`);
  assert(calc.stats.redViol === 0, `${r.name}/calculated: zero red-light runs (got ${calc.stats.redViol})`);
  assert(adpt.stats.collisions === 0, `${r.name}/adaptive: zero collisions (got ${adpt.stats.collisions})`);
  assert(adpt.stats.redViol === 0, `${r.name}/adaptive: zero red-light runs (got ${adpt.stats.redViol})`);
  const w = (s) => s.stats.served ? s.stats.waitSum / s.stats.served : 0;
  const lines = [
    ['cars passed', calc.stats.passed, adpt.stats.passed, true],
    ['average wait (all, s)', calc.avgWait(), adpt.avgWait(), false],
    ['avg wait served-only (s)', w(calc), w(adpt), false],
    ['longest wait now (s)', calc.longestWait(), adpt.longestWait(), false],
    ['dropped off-screen', calc.stats.dropped, adpt.stats.dropped, false],
    ['collisions', calc.stats.collisions, adpt.stats.collisions, false],
    ['red-light runs', calc.stats.redViol, adpt.stats.redViol, false]
  ];
  for(const [k, c, ad, moreBetter] of lines){
    const d = c - ad;
    const win = Math.abs(d) < 1e-9 ? 'tie' : (moreBetter ? (d > 0 ? 'calculated' : 'adaptive') : (d < 0 ? 'calculated' : 'adaptive'));
    console.log([pad(r.name + ' ' + k, 26), num(c, 12, 1), num(ad, 12, 1), num(d, 10, 1), win].join(''));
  }
}

/* ---------- 4. sensitivity: does the 120 s cycle cap cost us when demand exceeds capacity? ---------- */
console.log('\n=== stress preset, cycle cap sensitivity ===');
{
  const rates = PRESETS.stress;
  const mk = mc => () => websterPlan({demands: criticalDemand(rates), saturation: saturationFlow(),
                                      amber: DEFAULT_CFG.amber, allRed: DEFAULT_CFG.allRed,
                                      minGreen: MIN_GREEN, maxCycle: mc});
  for(const mc of [MAX_CYCLE, 150, 185]){
    const sim = run('calculated', rates, SEED, mk(mc));
    const adpt = run('adaptive', rates, SEED);
    console.log([pad(`stress Co cap ${String(mc).padStart(3)}s`, 26),
                 num(sim.stats.passed, 12, 1), num(adpt.stats.passed, 12, 1),
                 num(sim.stats.passed - adpt.stats.passed, 10, 1),
                 `wait ${sim.avgWait().toFixed(1)}s vs ${adpt.avgWait().toFixed(1)}s, ` +
                 `plan greens ${sim.plan.greens.join('/')}s, dropped ${sim.stats.dropped}, ` +
                 `collisions ${sim.stats.collisions}, red ${sim.stats.redViol}`].join(''));
  }
}
console.log(`\nharness finished in ${(wall + (Date.now() - t0) / 1000 > 0 ? ((Date.now() - t0) / 1000).toFixed(1) : '0')} s of wall time`);
console.log(failures ? `\n${failures} ASSERTION(S) FAILED` : '\nALL ASSERTIONS PASSED');
process.exit(failures ? 1 : 0);
