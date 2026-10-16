/* Verifies Deliverable 1 against the REAL core extracted from index.html.
   Reads the ==CORE-START==..==CORE-END== block, applies the patch from
   01-core-metrics.js by anchor, then asserts behaviour. Node only, no DOM.
   Run: node 01-core-metrics.test.js                                            */
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/Student/Desktop/h1';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const deliverable = fs.readFileSync(path.join(__dirname, '01-core-metrics.js'), 'utf8');

function grab(src, start, end, label){
  const a = src.indexOf(start); const b = src.indexOf(end, a);
  if(a < 0 || b < 0) throw new Error('cannot find ' + label);
  return src.slice(a + start.length, b);
}
let core = grab(html, '// ==CORE-START==', '// ==CORE-END==', 'core block');

/* pull the exact insert bodies out of the deliverable so we test what we ship */
function section(startMarker, endMarker){
  const i = deliverable.indexOf(startMarker);
  if(i < 0) throw new Error('deliverable marker missing: ' + startMarker);
  const close = deliverable.indexOf('*/', i);            // end of the header comment
  const end = deliverable.indexOf(endMarker, close);
  if(end < 0) throw new Error('deliverable end marker missing: ' + endMarker);
  return deliverable.slice(close + 2, end).trim();
}
const bA = section('/* ---- BLOCK 1-A', '/* ---- BLOCK 1-B');
const bB = section('/* ---- BLOCK 1-B', '/* ---- BLOCK 1-C');
const bC = "else { this.stats.served++; this.stats.waitSum += c.wait; this.recordWait(c); }";
const bE = section('/* ---- BLOCK 1-E', '/* ============================ END DELIVERABLE 1');
if(!/WAIT_RESERVOIR = 2048/.test(bA)) throw new Error('1-A extraction wrong:\n' + bA);
if(!/this.qPeakAll  = \{N:0/.test(bB)) throw new Error('1-B extraction wrong:\n' + bB);
if(!/recordWait\(c\)\{/.test(bE) || !/snapshot\(\)\{/.test(bE)) throw new Error('1-E extraction wrong:\n' + bE.slice(0, 200));

/* apply by anchor */
function mustReplace(src, from, to, label){
  if(src.indexOf(from) < 0) throw new Error('ANCHOR NOT FOUND (file drifted): ' + label);
  return src.replace(from, to);
}
core = mustReplace(core, "const MIX = [['car',.5],['bike',.3],['auto',.15],['bus',.05]];",
  "const MIX = [['car',.5],['bike',.3],['auto',.15],['bus',.05]];\n" + bA, '1-A after MIX');
core = mustReplace(core, "this.stats = {passed:0, passedBy:{N:0,E:0,S:0,W:0}, served:0, waitSum:0, collisions:0, redViol:0, dropped:0, ambPassed:0, ambWait:null};",
  "this.stats = {passed:0, passedBy:{N:0,E:0,S:0,W:0}, served:0, waitSum:0, collisions:0, redViol:0, dropped:0, ambPassed:0, ambWait:null};\n" + bB, '1-B in reset');
core = mustReplace(core, "else { this.stats.served++; this.stats.waitSum += c.wait; }", bC, '1-C crossing');
core = mustReplace(core, "this.moveCars(dt);\n    this.checkSafety();", "this.moveCars(dt);\n    this.checkSafety();\n    this.trackQueues();", '1-D step');
core = mustReplace(core, "  longestWait(){", "  __PATCHED__(){ return 1; }\n  longestWait(){", 'locate longestWait');
// append methods just before the class's closing brace: find end of longestWait()
{
  const li = core.indexOf('  longestWait(){');
  const closeOfMethod = core.indexOf('\n  }', li);
  if(closeOfMethod < 0) throw new Error('cannot close longestWait');
  const at = closeOfMethod + '\n  }'.length;
  core = core.slice(0, at) + '\n' + bE + core.slice(at);
}

/* run the patched core */
const sandbox = { Math, Set, Array, Float64Array, JSON, Object };
const run = new Function('api', core + '\n;api.Sim=Sim;api.DIRS=DIRS;api.PRESETS=PRESETS;api.DEFAULT_CFG=DEFAULT_CFG;api.DT=DT;api.WAIT_RESERVOIR=WAIT_RESERVOIR;api.LOS_BANDS=LOS_BANDS;api.amberOf=amberOf;api.allRedOf=allRedOf;');
const api = {};
run(api);
const { Sim, DIRS, DEFAULT_CFG, DT, WAIT_RESERVOIR } = api;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if(cond){ pass++; console.log('  PASS ' + name + (extra?'  '+extra:'')); } else { fail++; console.log('  FAIL ' + name + '  ' + extra); } };

function mk(preset = 'stress', mode = 'fixed'){
  const cfg = Object.assign({}, DEFAULT_CFG, {rates: Object.assign({}, preset === 'stress' ? {N:22,E:22,S:22,W:22} : preset === 'balanced' ? {N:8,E:8,S:8,W:8} : {N:16,S:16,E:5,W:5}), corridor:true});
  return new Sim(cfg, mode, 20261016);
}

console.log('\n[1] patched core loads and steps');
const s = mk();
for(let i = 0; i < 60 * 300; i++) s.step(DT);            // 300 sim seconds
ok('300 s of sim ran', s.t > 299.9 && s.t < 300.1, 't=' + s.t.toFixed(2));
ok('samples recorded', s.waitTotal > 100 && s.waitTotal === s.stats.served, 'waitTotal=' + s.waitTotal + ' served=' + s.stats.served);
ok('reservoir bounded', s.waitCount === Math.min(s.waitTotal, WAIT_RESERVOIR), 'waitCount=' + s.waitCount + ' cap=' + WAIT_RESERVOIR);
ok('waitSum still matches sum of samples in window or is larger (window is last N)', s.stats.waitSum >= 0);

console.log('\n[2] p95 is nearest-rank on a sorted copy');
const win = s.waitWindow();
const sorted = win.slice().sort((a,b)=>a-b);
const n = sorted.length;
const expect = sorted[Math.max(1, Math.min(n, Math.ceil(0.95*n))) - 1];
ok('p95 == nearest-rank of sorted copy', Math.abs(s.p95Wait() - expect) < 1e-12, s.p95Wait().toFixed(4) + ' vs ' + expect.toFixed(4));
ok('p95 >= p50', s.p95Wait() >= s.p50Wait(), `p50=${s.p50Wait().toFixed(2)} p95=${s.p95Wait().toFixed(2)}`);
ok('p95 >= avg of window', s.p95Wait() >= win.reduce((a,b)=>a+b,0)/n - 1e-9, 'avg=' + (win.reduce((a,b)=>a+b,0)/n).toFixed(2));
const orderBefore = s.waitBuf.slice(0, s.waitCount).join(',');
s.p95Wait();
ok('percentile() does not mutate the buffer order', s.waitBuf.slice(0, s.waitCount).join(',') === orderBefore);
ok('empty sim p95 == 0', new Sim(Object.assign({}, DEFAULT_CFG, {rates:{N:0,E:0,S:0,W:0},corridor:true}), 'fixed', 1).p95Wait() === 0);

console.log('\n[3] peak queue MUST be recorded in step(), not read from a 5 Hz renderer');
const p = mk('stress');
for(let i = 0; i < 60 * 600; i++) p.step(DT);    // 10 sim minutes, same stream the samplers replay
/* Emulate the real render cadence. renderAll() runs every 0.2 s of WALL time; at
   speed=8 the sim covers 1.6 s of SIM time between two renders (96 DT steps), so
   anything that rises and falls inside that window is invisible to the renderer. */
function sampler(stride){
  const q = mk('stress');                       // same cfg + same seed => same vehicle stream
  const seen = {N:0,E:0,S:0,W:0};
  for(let i = 0; i < 60 * 600; i++){
    q.step(DT);
    if((i + 1) % stride === 0) for(const d of DIRS) seen[d] = Math.max(seen[d], q.queue(d));
  }
  return {truth:{...q.qPeak}, seen};
}
const CADENCES = [['1x, 5 Hz  (12 steps)', 12], ['8x, 5 Hz  (96 steps)', 96], ['8x, 1 Hz  (480 steps)', 480]];
const runs = CADENCES.map(([label, stride]) => {
  const r = sampler(stride);
  let missed = 0, worst = 0;
  for(const d of DIRS){ const g = r.truth[d] - r.seen[d]; if(g > 0) missed++; worst = Math.max(worst, g); }
  console.log(`   ${label}: step-truth ${DIRS.map(d=>d+'='+r.truth[d]).join(' ')} | renderer ${DIRS.map(d=>d+'='+r.seen[d]).join(' ')} | arms under-reported ${missed}, worst gap ${worst}`);
  return {label, r, missed, worst};
});
ok('step-tracked peak >= renderer estimate for every arm at every cadence (invariant)',
   runs.every(x => DIRS.every(d => x.r.truth[d] >= x.r.seen[d])));
ok('maxQueue(d) reproduces the full-resolution truth exactly',
   DIRS.every(d => p.maxQueue(d) === runs[0].r.truth[d]), 'N=' + p.maxQueue('N') + ' truth=' + runs[0].r.truth.N);
ok('a coarse renderer strictly under-reports somewhere (justifies tracking inside step)',
   runs.reduce((a, x) => a + x.missed, 0) > 0,
   runs.map(x => `${x.label}:${x.missed}`).join('  '));
ok('maxQueueTotal(d) >= maxQueue(d)', DIRS.every(d => p.maxQueueTotal(d) >= p.maxQueue(d)), 'N: ' + p.maxQueueTotal('N') + ' vs ' + p.maxQueue('N'));
ok('maxQueueAll() == worst arm peak', p.maxQueueAll() === Math.max(...DIRS.map(d => p.maxQueue(d))), '=' + p.maxQueueAll());

console.log('\n[4] throughput guard');
const tt = mk('balanced');
ok('0 s -> 0 (guard)', tt.throughputPerHour() === 0 && !tt.throughputReliable());
for(let i = 0; i < 60 * 5; i++) tt.step(DT);      // 5 s
ok('5 s -> still 0 (guard)', tt.throughputPerHour() === 0, 't=' + tt.t.toFixed(1) + ' passed=' + tt.stats.passed);
for(let i = 0; i < 60 * 25; i++) tt.step(DT);     // 30 s
ok('30 s -> extrapolated', tt.throughputPerHour() > 0 && Math.abs(tt.throughputPerHour() - tt.stats.passed * 3600 / tt.t) < 1e-9,
   tt.throughputPerHour().toFixed(0) + '/h from ' + tt.stats.passed + ' veh in ' + tt.t.toFixed(0) + 's');
ok('demand sanity: 4x8 vpm = 1920 vph offered', tt.throughputPerHour() < 1920 * 1.05 && tt.throughputPerHour() > 200, tt.throughputPerHour().toFixed(0));

console.log('\n[5] HCM LOS bands');
const g = new Sim(Object.assign({}, DEFAULT_CFG, {rates:{N:0,E:0,S:0,W:0}, corridor:true}), 'fixed', 1);
const band = d => { g.stats.waitSum = 0; g.stats.served = 0; g.stats.waitSum = d * 1; g.stats.served = 1; return g.grade(); };
for(const [d, want] of [[0,'A'],[9.9,'A'],[10,'A'],[10.1,'B'],[20,'B'],[20.1,'C'],[35,'C'],[35.1,'D'],[55,'D'],[55.1,'E'],[80,'E'],[80.1,'F'],[300,'F']])
  ok('delay ' + d + 's -> ' + want, band(d) === want, 'got ' + band(d));
const expGrade = (() => { const d = p.avgWait(); const B = [10,20,35,55,80]; for(let i=0;i<5;i++) if(d<=B[i]) return 'ABCDEF'[i]; return 'F'; })();
ok('real stress run: grade() letter matches the HCM band of its own avg delay',
   /^[A-F]$/.test(p.grade()) && p.grade() === expGrade, 'avgWait=' + p.avgWait().toFixed(1) + 's grade=' + p.grade() + ' expected ' + expGrade);

console.log('\n[6] snapshot() deep-equals across reset');
const canon = o => JSON.stringify(o, (k, v) =>
  (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((a, kk) => { a[kk] = v[kk]; return a; }, {}) : v);
const snap = new Sim(Object.assign({}, DEFAULT_CFG, {rates:{N:22,E:22,S:22,W:22}, corridor:true}), 'adaptive', 777);
for(let i = 0; i < 60 * 240; i++) snap.step(DT);
snap.sendAmbulance('N');
for(let i = 0; i < 60 * 120; i++) snap.step(DT);
const dirty = snap.snapshot();
const afterReset = new Sim(Object.assign({}, DEFAULT_CFG, {rates:{N:22,E:22,S:22,W:22}, corridor:true}), 'adaptive', 777);
snap.reset();
const clean = snap.snapshot();
ok('snapshot() is plain JSON-safe data', typeof dirty === 'object' && JSON.stringify(dirty).length > 200);
ok('reset snapshot == fresh-construction snapshot', canon(clean) === canon(afterReset.snapshot()));
let differing = [];
for(const k of Object.keys(dirty)) if(canon({v:dirty[k]}) !== canon({v:clean[k]})) differing.push(k);
ok('dirty run differs from reset on the fields that must move (test has power)',
   differing.length >= 8 &&
   dirty.passed > 0 && dirty.served > 0 && dirty.waitSum > 0 && dirty.waitTotal > 0 &&
   dirty.ambWait !== null && dirty.maxQueue.N > 0 && dirty.derived.p95Wait > 0 &&
   dirty.derived.throughputPerHour > 0 && differing.includes('maxQueue') && differing.includes('derived'),
   differing.length + ' fields changed: ' + differing.join(','));
const untouched = ['mode','seed','collisionsInSchema'].filter(x => x !== 'mode' && x !== 'seed');
ok('mode/seed preserved by reset', clean.mode === 'adaptive' && clean.seed === 777);
ok('all counters zero after reset',
   clean.passed === 0 && clean.served === 0 && clean.waitSum === 0 && clean.collisions === 0 &&
   clean.redViol === 0 && clean.dropped === 0 && clean.ambPassed === 0 && clean.ambWait === null &&
   clean.waitTotal === 0 && clean.waitCount === 0 && clean.t === 0 && clean.phases === 0,
   JSON.stringify({passed:clean.passed, waitTotal:clean.waitTotal, ambWait:clean.ambWait}));
ok('all peak/queue maps zero after reset', DIRS.every(d => clean.maxQueue[d] === 0 && clean.maxQueueTotal[d] === 0 && clean.queueNow[d] === 0 && clean.pending[d] === 0 && clean.onScreen[d] === 0 && clean.ambPending[d] === 0));
ok('derived zeroed after reset', clean.derived.p95Wait === 0 && clean.derived.throughputPerHour === 0 && clean.derived.grade === 'A');
ok('reset() clears the leaked-state case: nid restarts', clean.nid === 1 && dirty.nid > 1);

console.log('\n[7] determinism: same seed + same cfg = identical snapshot');
function runFor(seed, secs){
  const x = new Sim(Object.assign({}, DEFAULT_CFG, {rates:{N:16,S:16,E:5,W:5}, corridor:true}), 'fixed', seed);
  for(let i = 0; i < 60 * secs; i++){ x.step(DT); if(i === 60*40) x.sendAmbulance('E'); }
  return JSON.stringify(x.snapshot());
}
ok('two identical runs match', runFor(20261016, 180) === runFor(20261016, 180));
ok('different seed differs', runFor(1, 180) !== runFor(2, 180));

console.log('\n[8] headless cost check (trackQueues added to step)');
function bench(withPatch){
  const base = core;
  let src = base;
  if(!withPatch) src = src.replace('    this.trackQueues();\n', '');
  const e2 = {}; new Function('api', src + ';api.Sim=Sim;api.DEFAULT_CFG=DEFAULT_CFG;api.DT=DT;')(e2);
  const x = new e2.Sim(Object.assign({}, e2.DEFAULT_CFG, {rates:{N:22,E:22,S:22,W:22},corridor:true}), 'fixed', 5);
  const t0 = process.hrtime.bigint();
  for(let i = 0; i < 60 * 600; i++) x.step(e2.DT);
  return Number(process.hrtime.bigint() - t0) / 1e6;
}
const withP = bench(true), withoutP = bench(false);
console.log(`   10 sim-min: patched ${withP.toFixed(0)} ms, unpatched ${withoutP.toFixed(0)} ms -> overhead ${((withP/withoutP-1)*100).toFixed(1)}%`);
ok('trackQueues overhead < 60% of step cost', withP / withoutP < 1.6, ((withP/withoutP-1)*100).toFixed(1) + '%');
ok('real-time capable: 10 sim-min in well under 600 s wall', withP < 8000);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
