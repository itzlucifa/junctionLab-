// JunctionLab headless test suite — Node built-in runner only, no dependencies.
// The simulation core is extracted from index.html between the CORE markers so the
// exact code that ships in the browser is what gets tested.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const START = '// ==CORE-START==';
const END = '// ==CORE-END==';
const src = html.slice(html.indexOf(START) + START.length, html.indexOf(END));
assert.ok(src.length > 1000, 'core markers must delimit a substantial block');

const EXPORTS = ['Sim', 'DIRS', 'AXIS', 'DT', 'PRESETS', 'SURGE', 'amberOf', 'allRedOf',
                 'calibrateSaturation', 'websterPlan', 'STARVE_S', 'MIN_GREEN'];
const core = new Function('"use strict";' + src + '\nreturn {' + EXPORTS.join(',') + '};')();

const SEED = 20261016;
const MINUTES = 10;
const SAT = core.calibrateSaturation().perLaneHour;

function makeCfg(rates, over = {}) {
  return Object.assign({
    rates: Object.assign({}, rates),
    green: 12,
    amber: core.amberOf(),
    allRed: core.allRedOf(),
    corridor: true,
    surge: null,
    satFlow: SAT
  }, over);
}

function run(mode, rates, over = {}, minutes = MINUTES, seed = SEED) {
  const sim = new core.Sim(makeCfg(rates, over), mode, seed);
  const steps = Math.round(minutes * 60 / core.DT);
  for (let i = 0; i < steps; i++) sim.step(core.DT);
  return sim;
}

// every invariant we demand of a finished run, checked on the live vehicle arrays
function invariants(sim) {
  const bad = { negativeSpeed: [], reversedOrder: [], overlap: [] };
  for (const d of core.DIRS) {
    const lane = sim.cars[d].concat(sim.amb[d]);
    for (let i = 0; i < lane.length; i++) {
      if (lane[i].v < 0) bad.negativeSpeed.push(lane[i].id);
      if (i > 0) {
        const gap = lane[i - 1].s - lane[i - 1].len - lane[i].s;
        if (gap < -0.001) bad.overlap.push(d + ':' + lane[i].id);
      }
    }
  }
  return bad;
}

const MODES = ['fixed', 'calculated', 'adaptive'];

for (const [name, rates] of Object.entries(core.PRESETS)) {
  for (const mode of MODES) {
    test(`${name} / ${mode}: safety invariants over ${MINUTES} simulated minutes`, () => {
      const sim = run(mode, rates);
      assert.equal(sim.stats.collisions, 0, 'box overlaps must be zero');
      assert.equal(sim.stats.redViol, 0, 'red-light runs must be zero');
      assert.equal(sim.stats.committedCrossed, 0, 'a vehicle committed to stop must never cross');
      assert.ok(sim.stats.passed > 0, 'some traffic must clear the junction');
      const bad = invariants(sim);
      assert.deepEqual(bad.negativeSpeed, [], 'no vehicle may have a negative speed');
      assert.deepEqual(bad.overlap, [], 'no two vehicles in a lane may overlap');
    });
  }
}

test('clearance intervals are never shortened, even under emergency preemption', () => {
  for (const mode of MODES) {
    for (const d of core.DIRS) {
      const sim = new core.Sim(makeCfg(core.PRESETS.balanced), mode, SEED);
      const plan = [{ at: 40, d }, { at: 160, d }, { at: 280, d }];
      let next = 0;
      const steps = Math.round(6 * 60 / core.DT);
      for (let i = 0; i < steps; i++) {
        while (next < plan.length && sim.t >= plan[next].at) { sim.sendAmbulance(plan[next].d); next++; }
        sim.step(core.DT);
      }
      const c = sim.clearanceShortfall();
      assert.equal(sim.stats.collisions, 0, mode + '/' + d);
      assert.equal(sim.stats.redViol, 0, mode + '/' + d);
      assert.equal(c.worst, null, mode + '/' + d + ': a clearance interval ran short');
      assert.ok(c.complete, mode + '/' + d + ': an amber or all-red was skipped entirely');
      assert.ok(sim.stats.ambPassed >= 3, mode + '/' + d + ': ambulances must get through');
    }
  }
});

test('the adaptive controller never starves a waiting axis beyond 60 s', () => {
  for (const [name, rates] of Object.entries(core.PRESETS)) {
    const sim = new core.Sim(makeCfg(rates), 'adaptive', SEED);
    const steps = Math.round(MINUTES * 60 / core.DT);
    let worst = 0;
    for (let i = 0; i < steps; i++) {
      sim.step(core.DT);
      for (const ax of [0, 1]) if (sim.pressure(ax) > 0) worst = Math.max(worst, sim.t - sim.lastGreen[ax]);
    }
    assert.ok(worst <= core.STARVE_S + 0.5, name + ': waited ' + worst.toFixed(1) + ' s');
  }
});

test('demand surge scenario stays safe in every mode', () => {
  const surge = { blockSeconds: core.SURGE.blockSeconds, pattern: core.SURGE.pattern };
  for (const mode of MODES) {
    const sim = run(mode, core.PRESETS.office, { surge }, 10);
    assert.equal(sim.stats.collisions, 0, mode);
    assert.equal(sim.stats.redViol, 0, mode);
  }
});

test('same seed produces byte-identical statistics', () => {
  for (const mode of MODES) {
    const a = run(mode, core.PRESETS.stress);
    const b = run(mode, core.PRESETS.stress);
    assert.deepEqual(a.snapshot(), b.snapshot(), mode + ' is not deterministic');
    assert.equal(a.p95Wait(), b.p95Wait());
    assert.equal(a.avgWait().toFixed(6), b.avgWait().toFixed(6));
  }
});

test('a different seed produces a different run', () => {
  const a = run('adaptive', core.PRESETS.balanced, {}, 5, SEED);
  const b = run('adaptive', core.PRESETS.balanced, {}, 5, SEED + 1);
  assert.notEqual(a.stats.passed, b.stats.passed);
});

test('reset returns every statistic to its initial value', () => {
  for (const mode of MODES) {
    const sim = run(mode, core.PRESETS.stress, {}, 3);
    sim.reset();
    const fresh = new core.Sim(makeCfg(core.PRESETS.stress), mode, SEED);
    assert.equal(sim.t, 0, mode + ': clock must restart');
    assert.deepEqual(sim.snapshot(), fresh.snapshot(), mode + ': statistics must match a virgin sim');
    for (const d of core.DIRS) {
      assert.equal(sim.cars[d].length, 0);
      assert.equal(sim.amb[d].length, 0);
      assert.equal(sim.pending[d].length, 0);
      assert.equal(sim.maxQueue[d], 0);
    }
  }
});

test('the Webster plan follows the published formula', () => {
  const p = core.websterPlan({
    rates: { N: 16, S: 16, E: 5, W: 5 }, satFlow: SAT,
    amber: core.amberOf(), allRed: core.allRedOf()
  });
  const lost = (core.amberOf() + core.allRedOf()) * 2;
  const y = [16 * 60 / SAT, 5 * 60 / SAT];
  const Y = y[0] + y[1];
  const expected = Math.ceil(((1.5 * lost + 5) / (1 - Y)) / 5) * 5;
  assert.equal(p.lostTime, lost);
  assert.ok(Math.abs(p.cycleLength - expected) < 1.5, 'cycle ' + p.cycleLength + ' vs ' + expected);
  assert.ok(p.greens.every(g => g >= core.MIN_GREEN - 1e-9), 'minimum green must be honoured');
});

test('an oversaturated demand degrades to equal greens with a warning', () => {
  const p = core.websterPlan({
    rates: { N: 22, S: 22, E: 22, W: 22 }, satFlow: SAT,
    amber: core.amberOf(), allRed: core.allRedOf()
  });
  assert.ok(p.Y >= 0.95, 'stress demand must exceed capacity');
  assert.equal(p.degraded, true);
  assert.match(p.warning, /demand exceeds capacity/);
  assert.equal(p.greens[0], p.greens[1]);
});

test('calibrated saturation flow is a plausible number', () => {
  assert.ok(SAT > 600 && SAT < 4000, 'saturation flow of ' + SAT + ' veh/h/lane is not credible');
});
