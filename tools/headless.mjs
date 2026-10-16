#!/usr/bin/env node
/*
 * JunctionLab headless test harness.
 *
 * Loads the DOM-free simulation core out of ../index.html (between the
 * // ==CORE-START== and // ==CORE-END== markers) and exercises it without a
 * browser. Never writes to index.html.
 *
 *   node tools/headless.mjs              full suite + human report
 *   node tools/headless.mjs --json       machine-readable output
 *   node tools/headless.mjs --minutes 2  override run length
 *   node tools/headless.mjs --only presets,determinism
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(HERE, '..', 'index.html');
const START_MARK = '// ==CORE-START==';
const END_MARK = '// ==CORE-END==';

/* ------------------------------------------------------------------ *
 * 1. load the core
 * ------------------------------------------------------------------ */

// Extend this list to expose more core symbols; nothing else needs to change.
// A missing symbol throws, naming itself.
const CORE_EXPORTS = ['Sim', 'DIRS', 'AXIS', 'NAMES', 'VT', 'MIX', 'DT', 'STOP', 'W', 'C', 'HALF'];

// Symbols the core is expected to reach the DOM-free boundary for, but which may
// still live in the UI section. Resolved leniently: undefined falls back to the
// hardcoded copy in section 2, which then drift-checks itself against index.html.
const CORE_OPTIONAL_EXPORTS = ['PRESETS', 'DEFAULT_CFG'];

function loadCore() {
  const html = readFileSync(HTML_PATH, 'utf8');
  const i = html.indexOf(START_MARK);
  const j = html.indexOf(END_MARK);
  if (i < 0 || j < 0) {
    throw new Error(`core markers not found in ${HTML_PATH} (looked for ${START_MARK} and ${END_MARK})`);
  }
  if (j < i) throw new Error('core markers are inverted in index.html');
  const src = html.slice(i + START_MARK.length, j);

  const exprs = [
    ...CORE_EXPORTS.map(
      n => `${n}: (typeof ${n} === 'undefined' ? __missing(${JSON.stringify(n)}) : ${n})`,
    ),
    ...CORE_OPTIONAL_EXPORTS.map(n => `${n}: (typeof ${n} === 'undefined' ? undefined : ${n})`),
  ];
  const factory = new Function(
    '__missing',
    `${src}\n;return {${exprs.join(',')}};`,
  );
  const missing = name => {
    throw new Error(
      `core export "${name}" is not defined between the CORE markers of index.html - ` +
      `either it was renamed/removed, or it still lives outside the core block`,
    );
  };
  const core = factory(missing);

  // Each declared export must really be present; the factory guards the rest.
  for (const n of CORE_EXPORTS) if (core[n] === undefined) missing(n);

  return { html, src, core };
}

const { html: HTML_SRC, src: CORE_SRC, core: CORE } = loadCore();

const { Sim, DIRS, AXIS, NAMES, VT, MIX, DT, STOP, W, C, HALF } = CORE;

/* ------------------------------------------------------------------ *
 * 2. config the core does not (yet) own
 * ------------------------------------------------------------------ *
 * HOOK(MOVE-PRESETS-INTO-CORE): PRESETS and DEFAULT_CFG currently live in the
 * UI section of index.html, outside the CORE markers. As soon as they move
 * inside, add 'PRESETS' and 'DEFAULT_CFG' to CORE_EXPORTS and this whole
 * hardcoded fallback + drift check can be deleted; CORE.PRESETS / CORE.DEFAULT_CFG
 * will then be picked up automatically below.
 */
const PRESET_BLOCK = `{
  balanced:{N:8,E:8,S:8,W:8},
  office:{N:16,S:16,E:5,W:5},
  market:{N:5,S:5,E:16,W:16},
  stress:{N:22,E:22,S:22,W:22}
}`;
const DEFAULT_CFG_BLOCK = `{rates:{N:8,E:8,S:8,W:8}, green:12, amber:3, allRed:1.5, corridor:true}`;

const squash = s => String(s).replace(/\s+/g, '');
const SQUASHED_HTML = squash(HTML_SRC);

function driftWarnings() {
  const out = [];
  // HOOK: once PRESETS / DEFAULT_CFG are inside the CORE markers they arrive via
  // CORE_OPTIONAL_EXPORTS and this hardcoded copy is dead weight - delete it then.
  if (CORE.PRESETS) out.push('note: PRESETS is now exported from the core block; harness fallback unused.');
  else if (!SQUASHED_HTML.includes(squash(PRESET_BLOCK))) {
    out.push('PRESETS no longer appears verbatim in index.html. Hardcoded copy may be stale:\n' + PRESET_BLOCK);
  }
  if (CORE.DEFAULT_CFG) out.push('note: DEFAULT_CFG is now exported from the core block; harness fallback unused.');
  else if (!SQUASHED_HTML.includes(squash(DEFAULT_CFG_BLOCK))) {
    out.push('DEFAULT_CFG no longer appears verbatim in index.html. Hardcoded copy may be stale:\n' + DEFAULT_CFG_BLOCK);
  }
  return out;
}

const PRESETS = CORE.PRESETS || new Function('return ' + PRESET_BLOCK)();
const DEFAULT_CFG = CORE.DEFAULT_CFG || new Function('return ' + DEFAULT_CFG_BLOCK)();

function makeCfg(presetName, overrides = {}) {
  const rates = Object.assign({}, DEFAULT_CFG.rates, presetName ? PRESETS[presetName] : null);
  const cfg = Object.assign({}, DEFAULT_CFG, overrides);
  cfg.rates = Object.assign(rates, overrides && overrides.rates);
  return cfg;
}

/* ------------------------------------------------------------------ *
 * 3. run()
 * ------------------------------------------------------------------ */

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function p95FromSim(sim) {
  // The sim does not publish per-vehicle wait samples today; probe the obvious
  // names so the metric fills in automatically once it does.
  const samples = Array.isArray(sim.waitSamples) ? sim.waitSamples
    : Array.isArray(sim.waits) ? sim.waits
      : null;
  if (!samples || !samples.length) return null;
  return percentile(samples.slice().sort((a, b) => a - b), 0.95);
}

// Mirror of the core's carRect(), rebuilt from exported constants so the harness
// can explain a collision without touching index.html.
function rectFor(dir, c) {
  const hw = c.wid / 2, rear = c.s - c.len;
  // lateral axis: N/S travel vertically so off shifts x; E/W travel horizontally so off shifts y
  const lat = dir === 'N' || dir === 'E' ? C + c.off : C - c.off;
  if (dir === 'W' || dir === 'E') {
    const a = dir === 'W' ? c.s : W - c.s, b = dir === 'W' ? rear : W - rear;
    return { x1: Math.min(a, b), x2: Math.max(a, b), y1: lat - hw, y2: lat + hw };
  }
  const a = dir === 'S' ? W - c.s : c.s, b = dir === 'S' ? W - rear : rear;
  return { x1: lat - hw, x2: lat + hw, y1: Math.min(a, b), y2: Math.max(a, b) };
}

const overlapPairs = sim => {
  const items = [];
  for (const d of DIRS) {
    for (const c of sim.cars[d]) items.push({ c, r: rectFor(d, c), d });
    for (const c of sim.amb[d]) items.push({ c, r: rectFor(d, c), d });
  }
  const hits = [];
  for (let i = 0; i < items.length; i++) {
    const A = items[i].r;
    for (let j = i + 1; j < items.length; j++) {
      const B = items[j].r;
      if (A.x1 + 0.5 < B.x2 && B.x1 + 0.5 < A.x2 && A.y1 + 0.5 < B.y2 && B.y1 + 0.5 < A.y2) {
        hits.push({ a: items[i], b: items[j], key: items[i].c.id * 100000 + items[j].c.id });
      }
    }
  }
  return hits;
};

function run({ preset = null, mode = 'fixed', minutes = 10, seed = 20261016,
              cfgOverrides = {}, ambulancePlan = [], onStep = null, diagnose = false } = {}) {
  const wallStart = process.hrtime.bigint();
  const cfg = makeCfg(preset, cfgOverrides);
  const sim = new Sim(cfg, mode, seed);
  const plan = ambulancePlan.map(item => ({ ...item, fired: false, sent: false }));
  const tickCount = Math.round((minutes * 60) / DT);

  const redEvents = [], collEvents = [];
  let prevColl = 0, prevRed = 0, prevCrossed = new Set(), prevKeys = new Set();

  for (let tick = 0; tick < tickCount; tick++) {
    for (const item of plan) {
      if (!item.fired && sim.t >= item.atSeconds) {
        item.fired = true;
        item.sent = sim.sendAmbulance(item.dir) === true;
      }
    }
    if (diagnose) {
      const before = new Set();
      for (const d of DIRS) for (const c of sim.cars[d]) if (c.crossed) before.add(c.id);
      for (const d of DIRS) for (const c of sim.amb[d]) if (c.crossed) before.add(c.id);
      sim.step(DT);
      if (sim.stats.redViol > prevRed) {
        prevRed = sim.stats.redViol;
        for (const d of DIRS) {
          for (const c of sim.cars[d].concat(sim.amb[d])) {
            if (c.crossed && !before.has(c.id)) {
              const ax = AXIS[d];
              redEvents.push({
                at: +sim.t.toFixed(2), dir: d, id: c.id, type: c.type, amb: !!c.amb,
                lamp: sim.lamp(ax), redAge: +(sim.t - sim.redSince[ax]).toFixed(2),
                s: +c.s.toFixed(1), v: +c.v.toFixed(1), off: +c.off.toFixed(1), decision: c.decision,
              });
            }
          }
        }
      }
      if (sim.stats.collisions > prevColl) {
        prevColl = sim.stats.collisions;
        for (const h of overlapPairs(sim)) {
          if (prevKeys.has(h.key)) continue;
          collEvents.push({
            at: +sim.t.toFixed(2),
            a: { dir: h.a.d, id: h.a.c.id, type: h.a.c.type, amb: !!h.a.c.amb, s: +h.a.c.s.toFixed(1), off: +h.a.c.off.toFixed(1), v: +h.a.c.v.toFixed(1), crossed: h.a.c.crossed },
            b: { dir: h.b.d, id: h.b.c.id, type: h.b.c.type, amb: !!h.b.c.amb, s: +h.b.c.s.toFixed(1), off: +h.b.c.off.toFixed(1), v: +h.b.c.v.toFixed(1), crossed: h.b.c.crossed },
            lamps: { N: sim.lamp(AXIS.N), E: sim.lamp(AXIS.E) },
          });
        }
      }
      prevKeys = new Set(overlapPairs(sim).map(h => h.key));
    } else {
      sim.step(DT);
    }
    if (onStep) onStep(sim, tick);
  }

  const simSeconds = sim.t;
  // Diagnostics only - not part of the pass gate. Added when the core grew a
  // clearance log; absent on older cores, so it stays optional here too.
  const clearance = typeof sim.clearanceShortfall === 'function' ? sim.clearanceShortfall() : null;
  const result = {
    preset,
    mode,
    minutes,
    seed,
    corridor: cfg.corridor,
    collisions: sim.stats.collisions,
    redViol: sim.stats.redViol,
    passed: sim.stats.passed,
    passedBy: Object.assign({}, sim.stats.passedBy),
    served: sim.stats.served,
    dropped: sim.stats.dropped,
    ambPassed: sim.stats.ambPassed,
    ambWait: sim.stats.ambWait,
    avgWait: sim.avgWait(),
    p95Wait: p95FromSim(sim),
    longestWait: sim.longestWait(),
    throughputPerHour: (sim.stats.passed / simSeconds) * 3600,
    simSeconds,
    ambSent: plan.filter(p => p.sent).length,
    ambPlanned: plan.length,
    phases: typeof sim.phases === 'number' ? sim.phases : null,
    clearance,
    redEvents: diagnose ? redEvents : null,
    collEvents: diagnose ? collEvents : null,
    wallMs: Number(process.hrtime.bigint() - wallStart) / 1e6,
  };
  return result;
}

/* ------------------------------------------------------------------ *
 * 4. helpers for assertions
 * ------------------------------------------------------------------ */

function deepDiff(a, b, path, diffs) {
  if (diffs.length > 40) return;
  const isSetA = a instanceof Set, isSetB = b instanceof Set;
  if (isSetA || isSetB) {
    if (!isSetA || !isSetB) { diffs.push(`${path}: Set vs ${isSetA ? 'not a Set' : 'other'}`); return; }
    if (a.size !== b.size) { diffs.push(`${path}: set size ${a.size} != ${b.size}`); return; }
    const sa = [...a].sort(), sb = [...b].sort();
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) diffs.push(`${path}: set member ${sa[i]} missing after reset`);
    return;
  }
  const numA = typeof a === 'number', numB = typeof b === 'number';
  if (numA && numB && Number.isNaN(a) && Number.isNaN(b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { diffs.push(`${path}: length ${a.length} != ${b.length}`); return; }
    for (let i = 0; i < a.length; i++) deepDiff(a[i], b[i], `${path}[${i}]`, diffs);
    return;
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a) || !(k in b)) { diffs.push(`${path}.${k}: present in only one side`); continue; }
      deepDiff(a[k], b[k], `${path}.${k}`, diffs);
    }
    return;
  }
  if (a !== b) diffs.push(`${path}: ${JSON.stringify(b)} (fresh) != ${JSON.stringify(a)} (after reset)`);
}

const LANE_COLLECTIONS = ['cars', 'amb', 'ambQ', 'pending'];

// Sim must stay free of any browser API. Scanning the source of the class is
// enough to catch an accidental re-introduction.
const DOM_TOKENS = ['document', 'window', 'canvas', 'getContext', 'requestAnimationFrame',
  'localStorage', 'sessionStorage', 'alert(', 'Image', 'ctx', 'performance'];

function domAccessViolations() {
  const s = CORE_SRC.indexOf('class Sim');
  if (s < 0) return ['class Sim not found inside the CORE markers'];
  let e = CORE_SRC.indexOf('\nclass ', s + 1);
  const body = CORE_SRC.slice(s, e < 0 ? CORE_SRC.length : e);
  const bad = [];
  for (const tok of DOM_TOKENS) {
    const re = new RegExp(`(?<![A-Za-z0-9_$.])${tok.replace(/[()]/g, '\\$&')}(?![A-Za-z0-9_$])`, 'g');
    const hits = body.match(re);
    if (hits) bad.push(`${tok} x${hits.length}`);
  }
  return bad;
}

/* ------------------------------------------------------------------ *
 * 5. suites
 * ------------------------------------------------------------------ */

const WARNINGS = driftWarnings();

function describeEvents(r) {
  const parts = [];
  if (r.collEvents && r.collEvents.length) {
    parts.push(`first collision @${r.collEvents[0].at}s ` +
      `${r.collEvents[0].a.dir}/${r.collEvents[0].a.type}#${r.collEvents[0].a.id} (s=${r.collEvents[0].a.s} off=${r.collEvents[0].a.off}) x ` +
      `${r.collEvents[0].b.dir}/${r.collEvents[0].b.type}#${r.collEvents[0].b.id} (s=${r.collEvents[0].b.s} off=${r.collEvents[0].b.off}) ` +
      `lamps ${JSON.stringify(r.collEvents[0].lamps)}; ${r.collEvents.length} distinct new overlap pairs logged`);
    const byPair = {};
    for (const e of r.collEvents) {
      const k = [e.a.dir, e.b.dir].sort().join('-') + ' ' + [e.a.type, e.b.type].sort().join('/');
      byPair[k] = (byPair[k] || 0) + 1;
    }
    parts.push('by arm/type: ' + Object.entries(byPair).sort((x, y) => y[1] - x[1]).slice(0, 4)
      .map(([k, n]) => `${k} x${n}`).join(', '));
  }
  if (r.redEvents && r.redEvents.length) {
    const byArm = {};
    for (const e of r.redEvents) byArm[e.dir] = (byArm[e.dir] || 0) + 1;
    parts.push(`first red-run @${r.redEvents[0].at}s ${r.redEvents[0].dir}/${r.redEvents[0].type}#${r.redEvents[0].id} ` +
      `lamp=${r.redEvents[0].lamp} redAge=${r.redEvents[0].redAge}s decision=${r.redEvents[0].decision} s=${r.redEvents[0].s}; ` +
      'per arm: ' + Object.entries(byArm).map(([k, n]) => `${k}=${n}`).join(' '));
  }
  if (r.clearance && r.clearance.worst) {
    parts.push(`shortest clearance: ${r.clearance.worst.kind} ${r.clearance.worst.dur.toFixed(2)}s vs ${r.clearance.worst.need.toFixed(2)}s needed @${r.clearance.worst.at.toFixed(1)}s`);
  }
  return parts.join('\n       ');
}

function suitePresets(minutes) {
  const checks = [];
  const rows = [];
  for (const preset of Object.keys(PRESETS)) {
    for (const mode of ['fixed', 'adaptive']) {
      const r = run({ preset, mode, minutes, seed: 20261016 });
      rows.push(r);
      const ok = r.collisions === 0 && r.redViol === 0;
      let detail = `collisions=${r.collisions} redViol=${r.redViol} passed=${r.passed} avgWait=${r.avgWait.toFixed(2)}s`;
      if (!ok) {
        const d = run({ preset, mode, minutes, seed: 20261016, diagnose: true });
        if (d.collisions === r.collisions && d.redViol === r.redViol) detail += '\n       ' + describeEvents(d);
        else detail += `\n       NOTE: diagnostic re-run diverged (${d.collisions}/${d.redViol}) - harness observer changed the outcome`;
      }
      checks.push({ name: `${preset}/${mode}: collisions 0, red-runs 0`, ok, detail });
    }
  }
  return { checks, rows };
}

function suiteDeterminism(minutes) {
  const args = { preset: 'office', mode: 'adaptive', minutes, seed: 987654321 };
  const a = run(args);
  const b = run(args);
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  const strip = o => JSON.stringify(Object.assign({}, o, { wallMs: 0 }));
  return {
    checks: [
      {
        name: 'same seed + same inputs reproduce identical numbers',
        ok: strip(a) === strip(b),
        detail: strip(a) === strip(b) ? `byte-identical (${ja.length} chars)` : `MISMATCH:\n  ${strip(a)}\n  ${strip(b)}`,
      },
      {
        // wallMs is the one field that legitimately differs
        name: 'wall-clock field is the only allowed variance',
        ok: ja !== jb ? strip(a) === strip(b) : true,
        detail: `run A ${a.wallMs.toFixed(0)}ms vs run B ${b.wallMs.toFixed(0)}ms`,
      },
    ],
    rows: [a],
  };
}

function suiteAmbulance(minutes) {
  const checks = [];
  const rows = [];
  const plan = dirs => dirs.map(dir => [{ atSeconds: 90, dir }, { atSeconds: 300, dir }]).flat();
  for (const dir of DIRS) {
    for (const mode of ['fixed', 'adaptive']) {
      for (const corridor of [true, false]) {
        const r = run({
          preset: 'balanced', mode, minutes, seed: 20261016,
          cfgOverrides: { corridor },
          ambulancePlan: plan([dir]),
        });
        rows.push(r);
        const ok = r.collisions === 0 && r.redViol === 0 && r.ambPassed >= 2;
        let detail = `collisions=${r.collisions} redViol=${r.redViol} ambPassed=${r.ambPassed} ambSent=${r.ambSent}/2 ` +
          `ambWait=${r.ambWait === null ? 'n/a' : r.ambWait.toFixed(1) + 's'} passed=${r.passed}`;
        if (!ok) {
          const d = run({
            preset: 'balanced', mode, minutes, seed: 20261016,
            cfgOverrides: { corridor }, ambulancePlan: plan([dir]), diagnose: true,
          });
          const extra = describeEvents(d);
          if (extra) detail += '\n       ' + extra;
        }
        checks.push({
          name: `amb ${dir}/${mode}/corridor=${corridor ? 'on' : 'off'}: 0 collisions, 0 red-runs, ambPassed>=2`,
          ok, detail,
        });
      }
    }
  }
  return { checks, rows };
}

function suiteReset(minutes) {
  const checks = [];
  const runMinutes = Math.min(minutes, 3); // spec: 3 simulated minutes
  for (const mode of ['fixed', 'adaptive']) {
    const cfg = makeCfg('stress', {});
    const sim = new Sim(cfg, mode, 20261016);
    const ref = new Sim(cfg, mode, 20261016); // never stepped: the constructor values
    const ticks = Math.round((runMinutes * 60) / DT);
    for (let i = 0; i < ticks; i++) {
      sim.step(DT);
      if (i === Math.round(ticks / 2)) sim.sendAmbulance('N');
    }
    const dirty = { collisions: sim.stats.collisions, redViol: sim.stats.redViol,
      passed: sim.stats.passed, served: sim.stats.served, ambPassed: sim.stats.ambPassed };
    sim.reset();

    const diffs = [];
    deepDiff(sim.stats, ref.stats, 'stats', diffs);
    if (sim.t !== 0) diffs.push(`t: ${sim.t} != 0`);
    for (const coll of LANE_COLLECTIONS) {
      for (const d of DIRS) {
        const arr = sim[coll] && sim[coll][d];
        if (Array.isArray(arr) && arr.length) diffs.push(`${coll}.${d}: ${arr.length} left after reset`);
      }
    }
    for (const [k, v] of Object.entries(ref)) {
      if (k === 'cfg' || k === 'rng' || k === 'stats') continue;
      deepDiff(sim[k], v, k, diffs);
    }

    checks.push({
      name: `reset() restores a clean sim (${mode}, after ${runMinutes} min + mid-run ambulance)`,
      ok: diffs.length === 0,
      detail: diffs.length === 0
        ? `stats + t + ${LANE_COLLECTIONS.join('/')}/${DIRS.join('')} + ctl/overlap all back to constructor values`
        : diffs.slice(0, 12).join('\n  '),
    });
    const anyTraffic = Object.values(dirty).some(v => v > 0);
    checks.push({
      name: `the pre-reset run was actually dirty (${mode})`,
      ok: anyTraffic,
      detail: `before reset: ${Object.entries(dirty).map(([k, v]) => k + '=' + v).join(' ')}`,
    });
  }
  return { checks, rows: [] };
}

function suitePurity() {
  const bad = domAccessViolations();
  return {
    checks: [{
      name: 'class Sim is DOM-free inside the CORE markers',
      ok: bad.length === 0,
      detail: bad.length ? 'found: ' + bad.join(', ') : `clean across ${CORE_SRC.length} chars of core`,
    }],
    rows: [],
  };
}

const SUITES = [
  { key: 'purity', make: () => suitePurity(), label: 'core purity' },
  { key: 'presets', make: suitePresets, label: 'signal presets' },
  { key: 'determinism', make: suiteDeterminism, label: 'determinism' },
  { key: 'ambulance', make: suiteAmbulance, label: 'ambulance corridor' },
  { key: 'reset', make: suiteReset, label: 'reset() hygiene' },
];

/* ------------------------------------------------------------------ *
 * 6. CLI
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const opts = { json: false, minutes: 10, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--minutes') opts.minutes = Number(argv[++i]);
    else if (a.startsWith('--minutes=')) opts.minutes = Number(a.split('=')[1]);
    else if (a === '--only') opts.only = argv[++i].split(',').map(s => s.trim());
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!Number.isFinite(opts.minutes) || opts.minutes <= 0) throw new Error(`bad --minutes value: ${argv.join(' ')}`);
  return opts;
}

const rpad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

function printTable(rows) {
  if (!rows.length) return;
  const head = [rpad('preset', 10), rpad('mode', 10), rpad('corridor', 10), lpad('passed', 7), lpad('served', 7),
    lpad('avg', 8), lpad('p95', 8), lpad('longest', 9), lpad('thr/h', 8), lpad('coll', 6), lpad('red', 5), lpad('drop', 6)];
  console.log('\n  ' + head.join(' '));
  console.log('  ' + '-'.repeat(head.join(' ').length));
  for (const r of rows) {
    console.log('  ' + [
      rpad(r.preset ?? '-', 10), rpad(r.mode, 10), rpad(r.corridor ? 'on' : 'off', 10),
      lpad(r.passed, 7), lpad(r.served, 7), lpad(r.avgWait.toFixed(2), 8),
      lpad(r.p95Wait === null ? 'n/a' : r.p95Wait.toFixed(2), 8),
      lpad(r.longestWait.toFixed(2), 9), lpad(r.throughputPerHour.toFixed(0), 8),
      lpad(r.collisions, 6), lpad(r.redViol, 5), lpad(r.dropped, 6),
    ].join(' '));
  }
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (opts.help) {
    console.log('usage: node tools/headless.mjs [--json] [--minutes N] [--only purity,presets,determinism,ambulance,reset]');
    return;
  }

  const selected = opts.only ? SUITES.filter(s => opts.only.includes(s.key)) : SUITES;
  if (opts.only && selected.length !== opts.only.length) {
    console.error(`unknown suite: have ${SUITES.map(s => s.key).join(', ')}`);
    process.exit(2);
  }

  const started = Date.now();
  const perSuite = [];
  const report = { warnings: WARNINGS, suites: [], totals: { passed: 0, failed: 0 } };
  let failed = 0, total = 0;

  for (const suite of selected) {
    const t0 = Date.now();
    const { checks, rows } = suite.make(opts.minutes);
    const ms = Date.now() - t0;
    perSuite.push({ suite: suite.key, ms });
    for (const c of checks) {
      total++;
      if (!c.ok) failed++;
    }
    report.suites.push({ suite: suite.key, label: suite.label, ms, checks, rows });
  }

  const wall = Date.now() - started;
  report.totals = { checks: total, passed: total - failed, failed };
  report.wallMs = wall;
  report.minutes = opts.minutes;

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`JunctionLab headless harness  ·  ${HTML_PATH}`);
    console.log(`core: ${CORE_SRC.length} chars, exports [${CORE_EXPORTS.join(', ')}], STOP=${STOP}, W=${W}, C=${C}, HALF=${HALF}, DT=1/${Math.round(1 / DT)}`);
    console.log(`run length: ${opts.minutes} simulated minute(s)  seed 20261016`);
    for (const w of WARNINGS) console.log((w.startsWith('note:') ? '\nNOTE    ' : '\nWARNING ') + w);
    for (const s of report.suites) {
      console.log(`\n== ${s.label} (${s.suite}) ==`);
      for (const c of s.checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}\n       ${c.detail}`);
      printTable(s.rows);
    }
    console.log('\n== wall clock ==');
    for (const p of perSuite) console.log(`  ${rpad(p.suite, 12)} ${(p.ms / 1000).toFixed(2)}s`);
    console.log(`  ${rpad('TOTAL', 12)} ${(wall / 1000).toFixed(2)}s`);
    console.log(`\n${total - failed}/${total} checks passed -> ${failed ? 'FAIL' : 'PASS'}`);
  }

  if (!opts.json && wall > 90000) writePerf(report, perSuite, wall);
  process.exit(failed ? 1 : 0);
}

function writePerf(report, perSuite, wall) {
  const lines = [
    '# JunctionLab headless harness - performance notes',
    '',
    `Full suite wall clock: ${(wall / 1000).toFixed(1)}s (threshold 90s).`,
    '',
    '## Where the time goes',
    '',
    '| suite | seconds |',
    '| --- | --- |',
    ...perSuite.map(p => `| ${p.suite} | ${(p.ms / 1000).toFixed(2)} |`),
    '',
    'Ticks dominate: every `Sim.step()` runs `checkSafety()`, which builds a bounding',
    'rect per vehicle and then compares every pair - O(n^2) per tick over every vehicle',
    'on screen (both `cars` and `amb` lanes, all four arms). At 60 ticks/s a 10 minute',
    'run is 36000 ticks, so the presets + ambulance suites alone evaluate roughly',
    '(vehicles^2) x 36000 x 24 pair checks.',
    '',
    '## Suggested optimisation (NOT applied to index.html)',
    '',
    '1. Bucket vehicles into a uniform grid keyed by the 5 px cell, and only compare',
    '   pairs that share a cell plus its 8 neighbours. Same result set, O(n) rebuild',
    '   and roughly O(n) pair checks for realistic spacing.',
    '2. Cheaper variant that fits the model: vehicles only ever collide with their',
    '   lane neighbour or with a vehicle from the *other* axis inside the junction',
    '   box. Compare (a) adjacent pairs within each lane, which is already O(n), and',
    '   (b) only the small subset whose `s` lies in `[BOX_S - len, BOX_E + len]`',
    '   across the perpendicular arms. That removes the all-pairs scan entirely.',
    '3. Throttle the harness rather than the app: run `checkSafety()` every k ticks.',
    '   Not equivalent (fast vehicles can pass through each other between checks), so',
    '   prefer 1 or 2 for the shipped app; only use this for smoke runs.',
    '',
    'Harness-side knobs that already exist: `--minutes N` to shrink runs and `--only`',
    'to select suites.',
    '',
  ];
  writeFileSync(join(HERE, 'PERF.md'), lines.join('\n'), 'utf8');
  console.log(`\nnote: full run exceeded 90s, wrote ${join(HERE, 'PERF.md')}`);
}

// Only run the CLI when executed directly, so the module can also be imported.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();

export {
  run, makeCfg, PRESETS, DEFAULT_CFG, CORE, overlapPairs, rectFor,
  Sim, DIRS, AXIS, NAMES, VT, MIX, DT, STOP, W, C, HALF,
  CORE_EXPORTS, CORE_OPTIONAL_EXPORTS,
};
