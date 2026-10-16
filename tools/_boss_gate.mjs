// Boss gate: my own quick verification loop, independent of tools/headless.mjs.
// Usage: node tools/_boss_gate.mjs
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const S = '// ==CORE-START==', E = '// ==CORE-END==';
const src = html.slice(html.indexOf(S) + S.length, html.indexOf(E));
const NAMES = ['Sim','DIRS','AXIS','NAMES','DT','STOP','PRESETS','DEFAULT_CFG','MIN_GREEN','MAX_GREEN',
               'PX_PER_M','toM','toMps','amberOf','allRedOf','REACTION_S','DECEL_MS2','APPROACH_SPEED_PX',
               'CLEARANCE_SPEED_PX','JUNCTION_WIDTH_PX','CLEARANCE_VEH_LEN_PX','VT','STARVE_S','SURGE','PCU_TABLE','PCU','PRIORITY_RATIO','PRIORITY_WAIT_S','MIN_GREEN','NEAR','HOLD_MAX','MIN_PRE','calibrateSaturation','websterPlan','HCM_BANDS','SAMPLE_S'];
const core = new Function('"use strict";' + src + '\nreturn {' + NAMES.join(',') + '};')();

const cfg = (preset, over = {}) => Object.assign(
  { rates: Object.assign({}, preset), green: 12, amber: core.amberOf(), allRed: core.allRedOf(),
    corridor: true, leftTurnFrac: 0, satFlow: SAT.perLaneHour }, over);

function run({ preset, mode, minutes = 10, seed = 20261016, extras = {}, ambs = [], surge = null }) {
  const c = cfg(preset, extras);
  const sim = new core.Sim(c, mode, seed);
  const steps = Math.round(minutes * 60 / core.DT);
  const _unused = 0; let nextAmb = 0, owedCuts = 0, starve = [0, 0];
  for (let i = 0; i < steps; i++) {
    while (nextAmb < ambs.length && sim.t >= ambs[nextAmb].at) { sim.sendAmbulance(ambs[nextAmb].dir); nextAmb++; }
    const before = sim.ctl.owedAxis;
    sim.step(core.DT);
    if (sim.ctl.owedAxis !== null && before === null) owedCuts++;
    for (const ax of [0, 1]) if (sim.pressure(ax) > 0) starve[ax] = Math.max(starve[ax], sim.t - sim.lastGreen[ax]);
  }
  return { sim, res: {
    minutes, mode, collisions: sim.stats.collisions, redRuns: sim.stats.redViol,
    passed: sim.stats.passed, served: sim.stats.served,
    avgWait: sim.avgWait(), longest: sim.longestWait(),
    ambPassed: sim.stats.ambPassed, ambSent: ambs.length,
    clear: sim.clearanceShortfall(), owedCuts, starve: Math.max(starve[0], starve[1])
  } };
}

const SAT = core.calibrateSaturation();
console.log('calibrated saturation flow =', SAT.perLaneHour.toFixed(0), 'veh/h/lane  ('+SAT.departures+' departures over '+SAT.seconds+'s of green across '+2+' lanes)');
console.log();
const PRESET_LIST = Object.entries(core.PRESETS);
const MODES = ['fixed','calculated','adaptive'];
let fails = [];

console.log('derived amber  =', core.amberOf().toFixed(3), 's   (= 1 + ' + core.toMps(core.APPROACH_SPEED_PX).toFixed(2) + ' / (2*3))');
console.log('derived allRed =', core.allRedOf().toFixed(3), 's   (= (' + core.toM(core.JUNCTION_WIDTH_PX).toFixed(2) + ' + ' + core.toM(core.CLEARANCE_VEH_LEN_PX).toFixed(2) + ') / ' + core.toMps(core.CLEARANCE_SPEED_PX).toFixed(2) + ')');
console.log();
console.log('preset      mode      passed  avgWait  coll  redRuns');
for (const [name, rates] of PRESET_LIST) {
  for (const mode of MODES) {
    const { res } = run({ preset: rates, mode, minutes: +(process.argv[2] || 10) });
    console.log(name.padEnd(11), mode.padEnd(9), String(res.passed).padStart(6),
      res.avgWait.toFixed(2).padStart(8), String(res.collisions).padStart(6), String(res.redRuns).padStart(8),
      res.starve.toFixed(1).padStart(12));
    if (res.collisions) fails.push(name + '/' + mode + ' collisions=' + res.collisions);
    if (res.redRuns) fails.push(name + '/' + mode + ' redRuns=' + res.redRuns);
    if (res.starve > core.STARVE_S + 2) fails.push(name + '/' + mode + ' starvation=' + res.starve.toFixed(1) + 's');
  }
}

// ---- STEP 4: demand surge, reported honestly whether adaptive wins or not ----
console.log('\n--- demand surge: N-S 1.8x / E-W 0.6x for 5 min, then reversed for 5 min ---');
for (const [name, rates] of PRESET_LIST) {
  const surge = { blockSeconds: core.SURGE.blockSeconds, pattern: core.SURGE.pattern };
  const out = {};
  for (const mode of ['fixed', 'adaptive']) {
    const { res } = run({ preset: rates, mode, minutes: 10, extras: { surge } });
    out[mode] = res;
    if (res.collisions || res.redRuns) fails.push('surge ' + name + '/' + mode);
  }
  const dW = out.fixed.avgWait - out.adaptive.avgWait;
  console.log(name.padEnd(11), 'fixed', String(out.fixed.passed).padStart(4), out.fixed.avgWait.toFixed(1).padStart(6) + 's',
    '| adaptive', String(out.adaptive.passed).padStart(4), out.adaptive.avgWait.toFixed(1).padStart(6) + 's',
    '| adaptive ' + (dW >= 0 ? 'better by ' + dW.toFixed(1) + 's' : 'WORSE by ' + (-dW).toFixed(1) + 's'),
    '| coll', out.fixed.collisions + '/' + out.adaptive.collisions,
    '| red', out.fixed.redRuns + '/' + out.adaptive.redRuns);
}

// ---- STEP 1 safety test: ambulance from each arm, both modes, corridor on + off ----
console.log('\n--- preemption: amber and all-red must always run full length ---');
const amodes = core.PRESETS.balanced;
for (const mode of ['fixed','adaptive']) {
  for (const corridor of [true,false]) {
    for (const dir of core.DIRS) {
      const ambs = [{at:60,dir},{at:180,dir},{at:330,dir}];
      const { res } = run({ preset: amodes, mode, minutes: 8, extras: { corridor }, ambs });
      const c = res.clear;
      const ok = res.collisions === 0 && res.redRuns === 0 && !c.worst && c.complete && res.ambPassed >= 3;
      console.log(mode.padEnd(9), 'corridor=' + (corridor?'on ':'off'), dir,
        '| amb', res.ambPassed + '/' + res.ambSent, '| Y', c.nY, 'R', c.nR, 'phases', c.phases,
        '| short', c.worst ? c.worst.kind + ' ' + c.worst.dur.toFixed(2) + '<' + c.worst.need.toFixed(2) : 'none',
        '| owed cuts repaid', res.owedCuts, '|', ok ? 'PASS' : 'FAIL');
      if (!ok) fails.push('preempt ' + mode + ' corridor' + corridor + ' ' + dir);
    }
  }
}

console.log('\n' + (fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'ALL GATES PASS'));
process.exit(fails.length ? 1 : 0);
