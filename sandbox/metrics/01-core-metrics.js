/* ============================================================================
   DELIVERABLE 1 — per-vehicle wait distribution + percentile / peak / grade
   helpers for JunctionLab.  DOM-FREE: safe inside // ==CORE-START== .. ==CORE-END==
   ----------------------------------------------------------------------------
   WHERE EACH BLOCK LANDS (search for the ANCHOR text, not line numbers — the
   file is being edited concurrently and the line numbers already moved twice):

     BLOCK 1-A  new constants        -> core, right after  `const MIX = [...]`
     BLOCK 1-B  new state            -> core, inside `reset()`, after the
                                        `this.stats = {...}` line
     BLOCK 1-C  wait sample on crossing -> core, inside `moveCars(dt)`, the
                                        `else { this.stats.served++; ... }` line
     BLOCK 1-D  peak queue tracking  -> core, end of `step(dt)`, after
                                        `this.checkSafety();`
     BLOCK 1-E  new methods          -> core, inside `class Sim`, appended after
                                        the existing `longestWait(){...}` helper
                                        (i.e. just before the closing `}` of the
                                        class, before `// ==CORE-END==`)

   Nothing here touches document/window. `Sim` stays headless-testable.
   Existing behaviour is unchanged: waitSum/served still accumulate exactly as
   before, so renderStats() and renderVerdict() keep working untouched.
   ==========================================================================*/


/* ---- BLOCK 1-A : constants. Insert immediately after `const MIX = [...]` ---- */

/* Wait-sample reservoir: a fixed-size circular buffer (Float64Array) holding the
   LAST 2048 crossing samples. Chosen over an unbounded array because a stress run
   at 8x speed generates ~10^4 samples/hour of wall time and an unbounded push()
   would grow forever; 2048 samples is ~8-12 minutes of throughput at stress
   demand, so p95 describes CURRENT conditions the way HCM reports delay per
   time-of-day interval, memory is O(1) and reset() just zeroes the counters. */
const WAIT_RESERVOIR = 2048;
/* Throughput is extrapolated from elapsed SIM time, so the empty start-up ramp
   must not be extrapolated: below this many seconds we report 0. */
const THROUGHPUT_MIN_T = 15;
/* HCM 6th ed. Chapter 18, signalised intersection LOS by average control delay
   (s/vehicle): A<=10, B<=20, C<=35, D<=55, E<=80, F>80. */
const LOS_BANDS = [10, 20, 35, 55, 80];


/* ---- BLOCK 1-B : state. Insert inside reset() after `this.stats = {...}` ---- */

    this.waitBuf   = new Float64Array(WAIT_RESERVOIR); // circular, oldest overwritten
    this.waitHead  = 0;        // next write slot
    this.waitCount = 0;        // samples currently held  (<= WAIT_RESERVOIR)
    this.waitTotal = 0;        // samples recorded since reset (provenance)
    this.qPeak     = {N:0, E:0, S:0, W:0};   // high-water mark of stopped-vehicle queue
    this.qPeakAll  = {N:0, E:0, S:0, W:0};   // same, but counting offscreen arrivals too


/* ---- BLOCK 1-C : record the sample.
   In moveCars(dt) find:
        if(c.amb) this.stats.ambWait = c.wait;
        else { this.stats.served++; this.stats.waitSum += c.wait; }
   and replace the second line with:                              ------------ */

        else { this.stats.served++; this.stats.waitSum += c.wait; this.recordWait(c); }

   /* Same population as served/waitSum (non-ambulance, crossed the stop line),
      so avgWait() and p95Wait() describe the same sample set. */


/* ---- BLOCK 1-D : peak tracking. In step(dt) find `this.checkSafety();`
   and add one line after it:                                          ------------ */

    this.trackQueues();

   /* WHY INSIDE step() AND NOT IN THE RENDERER: the UI calls renderStats() about
      every 200 ms of WALL time (and 4-8x faster relative to sim time at high
      speed). A queue peak that appears and drains between two UI samples is
      never seen by the renderer, so maxQueue() read from the renderer is a
      floor of the truth. Recording the peak every DT step makes the high-water
      mark exact at sim resolution. */


/* ---- BLOCK 1-E : methods. Append to class Sim, after longestWait(){...} ---- */

  /* ---- write side ------------------------------------------------------- */

  recordWait(c){
    this.waitBuf[this.waitHead] = c.wait;
    this.waitHead = (this.waitHead + 1) % WAIT_RESERVOIR;
    if(this.waitCount < WAIT_RESERVOIR) this.waitCount++;
    this.waitTotal++;
  }

  trackQueues(){
    // identical predicate to queue(d), so maxQueue(d) is consistent with the number the UI shows
    for(const d of DIRS){
      let n = 0;
      for(const c of this.cars[d]) if(!c.crossed && c.v < WAIT_V) n++;
      if(n > this.qPeak[d])     this.qPeak[d] = n;
      const tot = n + this.pending[d].length;      // queued beyond the screen edge too
      if(tot > this.qPeakAll[d]) this.qPeakAll[d] = tot;
    }
  }

  /* ---- read-only helpers ------------------------------------------------- */

  /* Percentile by NEAREST-RANK on a sorted copy of the reservoir:
     the smallest stored value whose rank is >= q*N  (index ceil(q*N)-1).
     Nearest-rank, not linear interpolation, because the sample set is small and
     discrete: it always returns an actual observed wait, never an invented
     in-between value, and it is the definition used by most traffic-engineering
     reporting. TypedArray.prototype.sort() is numeric by default, so no
     comparator is needed, and slice() gives us the copy that leaves insertion
     order (and therefore future writes) untouched. */
  percentile(q){
    const n = this.waitCount;
    if(n === 0) return 0;
    const sorted = this.waitBuf.slice(0, n).sort();
    const rank = Math.max(1, Math.min(n, Math.ceil(q * n)));
    return sorted[rank - 1];
  }
  p95Wait(){ return this.percentile(0.95); }
  p50Wait(){ return this.percentile(0.50); }   // median, cheap to have for the chart tooltip

  waitWindow(){ return Array.from(this.waitBuf.slice(0, this.waitCount)); }

  maxQueue(d){ return this.qPeak[d] || 0; }            // peak stopped-vehicle queue for arm d
  maxQueueTotal(d){ return this.qPeakAll[d] || 0; }     // same, counting offscreen arrivals too
  maxQueueAll(){ let m = 0; for(const d of DIRS) if(this.qPeak[d] > m) m = this.qPeak[d]; return m; }

  throughputPerHour(){
    if(this.t < THROUGHPUT_MIN_T) return 0;
    return this.stats.passed * 3600 / this.t;
  }
  throughputReliable(){ return this.t >= THROUGHPUT_MIN_T; }

  grade(){
    /* HCM signalised-intersection LOS on average control delay.
       AVERAGE WAIT IS A PROXY for control delay: both are the time a vehicle
       spends moving below WAIT_V before crossing. Two known deviations, both
       documented rather than papered over: (a) c.wait is seeded from arrival
       time at spawn, so a vehicle queued beyond the screen edge is charged for
       offscreen queueing time HCM would attribute to the upstream link — this
       makes the grade CONSERVATIVE (worse) under spillback; (b) HCM adds
       deceleration/acceleration time, which this model folds into the sub-8px/s
       window. Treat a C as a C, not as a 3-second precision claim. */
    const d = this.avgWait();
    for(let i = 0; i < LOS_BANDS.length; i++) if(d <= LOS_BANDS[i]) return 'ABCDEF'[i];
    return 'F';
  }

  /* One plain object holding every statistic, for the "reset restores every
     statistic to zero" test: assert deep-equal between snapshot() taken right
     after construction and snapshot() taken after sim.reset(). Deliberately
     deterministic: no clock, no randomness, no Date, only sim-derived values, so
     an empty snapshot compares equal by value. ambWait stays null (not 0) at
     reset because 0 s is a legitimate ambulance delay and null means "none yet";
     the deep-equal test therefore also catches a regression that resets it to a
     number. */
  snapshot(){
    const passedBy = {}, q = {}, qa = {}, qNow = {}, pend = {}, alive = {}, ambPend = {};
    for(const d of DIRS){
      passedBy[d]  = this.stats.passedBy[d];
      q[d]         = this.qPeak[d];
      qa[d]        = this.qPeakAll[d];
      qNow[d]      = this.queue(d);
      pend[d]      = this.pending[d].length;
      alive[d]     = this.cars[d].length + this.amb[d].length;
      ambPend[d]   = this.ambQ[d].length;
    }
    return {
      t: this.t, mode: this.mode, seed: this.seed, nid: this.nid, phases: this.phases,
      passed: this.stats.passed, passedBy: passedBy,
      served: this.stats.served, waitSum: this.stats.waitSum,
      collisions: this.stats.collisions, redViol: this.stats.redViol,
      dropped: this.stats.dropped, ambPassed: this.stats.ambPassed, ambWait: this.stats.ambWait,
      waitTotal: this.waitTotal, waitCount: this.waitCount,
      maxQueue: q, maxQueueTotal: qa, queueNow: qNow, pending: pend, onScreen: alive,
      ambPending: ambPend,
      derived: {
        avgWait: this.avgWait(), longestWait: this.longestWait(),
        p50Wait: this.p50Wait(), p95Wait: this.p95Wait(),
        throughputPerHour: this.throughputPerHour(), grade: this.grade(),
        maxQueueAll: this.maxQueueAll()
      }
    };
  }

/* ============================ END DELIVERABLE 1 ============================
   NAMING: maxQueue(d) = peak for arm d (same predicate the queue bars show);
   maxQueueTotal(d) = peak including vehicles queued off-screen;
   maxQueueAll() = the single worst arm peak, no argument, as specified.
   ==========================================================================*/
