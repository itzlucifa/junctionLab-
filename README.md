# JunctionLab — Smart Traffic Signal Simulator 🚦

![JunctionLab UI Preview](preview.png)

> *Crafted with precision by **Sumit Nawale** & **Nayan Dudkekar***

[![Live Demo](https://img.shields.io/badge/🚀%20Live%20Demo-Open%20Project-brightgreen?style=for-the-badge)](https://junctionlab.netlify.app/)
[![Built with JavaScript](https://img.shields.io/badge/Built%20with%20Vanilla%20JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![No Dependencies](https://img.shields.io/badge/Zero%20Dependencies-✓-blue?style=for-the-badge)](https://github.com/itzlucifa/junctionLab-)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

---

## About

A four-way signalised junction you can watch, break and argue with — fixed-time, Webster-calculated and
adaptive signal control competing for the same vehicles, in **one dependency-free HTML file**.

### 🎥 Cinematic 3D Perspective View

Switch to **3D · perspective** for a movie-screen rendering of the junction. Built entirely with a
software rasteriser (no WebGL, no CDN), it delivers a real-life simulation vibe through:

- **5 Camera Presets** — Orbit (isometric 45°), Street Eye (driver-level ground perspective), Top (90°
  plan view), Gantry (overhead cantilever framing the slip lane), and Focus (tight cinematic zoom on the
  yellow-box centre). Smooth transitions with fade-in opacity on every switch.
- **3 Lighting Modes** — Day, Dusk, and Night. Each mode recolours the sky, fog density, ambient, sun
  direction, and streetlight intensity. Night mode adds per-vehicle headlight beams, signal road-glow
  halos, and warm window glows on buildings.
- **Film-Grade Post Processing** — Vignette, color grading (warm amber for dusk, cool blue for night),
  film grain overlay, and fog-based depth attenuation that makes distant queues fade into atmosphere.
- **City Decorations Toggle** — Show surrounding buildings (HDFC Bank tower, Tech Park, apartments,
  Apollo Pharmacy) with glowing windows at night, neem trees, bus shelters, and cobra-head streetlights.
- **Live Countdown Timers** — Every signal head shows the remaining seconds for the current phase.
- **Free Left Turn** — Protected slip-lane indicator with its own highlighted lane strip.

[![3D View](https://img.shields.io/badge/🎥%20Cinematic%203D-Software%20Rasteriser-blue?style=for-the-badge)](https://github.com/itzlucifa/junctionLab-)
[![AI Prompt Log](https://img.sields.io/badge/🧠%20AI%20Prompt%20Log-Real-time%20Analysis-green?style=for-the-badge)](index.html)
[![Live Stats](https://img.shields.io/badge/📊%20Live%20Statistics-Real-time%20Chart-orange?style=for-the-badge)](index.html)

[![CI](https://github.com/itzlucifa/junctionLab-/actions/workflows/ci.yml/badge.svg)](https://github.com/itzlucifa/junctionLab-/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-GitHub%20Pages-blue)](https://junctionlab.netlify.app/)
[![No dependencies](https://img.shields.io/badge/dependencies-0-green)](package.json)


No install • No dependencies • No network calls • Runs entirely in your browser

---

## Why this exists

Most traffic-signal demos hard-code "amber = 3 s" and declare adaptive control better without proving
it. JunctionLab instead derives every timing from the physics of the scene, measures its own capacity
instead of assuming it, and publishes the comparison with a seed so you can reproduce it exactly.

It is modelled on an Indian junction: left-hand traffic, a mixed fleet of cars, two-wheelers,
auto-rickshaws and buses, and an ambulance that expects to be let through.

## Features

- **Three controllers, one traffic stream.** Fixed (manual), Fixed (calculated) and Adaptive all see the
  identical vehicle sequence for a given seed, so the only variable is the signal policy.
- **Webster fixed timing, done properly.** `Co = (1.5L + 5) / (1 − Y)`, rounded up to a multiple of 5 s,
  green split by critical flow ratio, 6 s minimum, and an honest *demand exceeds capacity* fallback when `Y ≥ 0.95`.
- **Measured, not assumed, capacity.** Saturation flow is calibrated by discharging a saturated queue in a
  throwaway simulation and counting departures per second of green.
- **Timings derived from physics.** Amber is `reaction + v/(2a)`; all-red is `(junction width + vehicle length) / clearance speed`.
  Both come from named constants through one pixels-per-metre scale factor, and the UI shows the arithmetic.
- **Adaptive with real guardrails.** Gap-out at 1.6 s, 6–30 s green, queue weight in passenger-car units,
  a car-unit priority hand-over, and starvation protection that starts green on a waiting axis within 60 s.
- **Emergency preemption that cannot cheat.** A green corridor may cut a *green* short; it may never
  shorten or skip amber or all-red, and any axis whose green was truncated is owed its minimum green next cycle.
- **Safety is an invariant, not a hope.** Every pair of vehicle boxes is tested each tick. The headline
  result of this project is boring on purpose: **0 collisions, 0 red-light runs, in all 24 benchmark runs.**
- **Metrics that mean something.** Throughput per hour, 95th-percentile wait, longest queue per arm, and an
  HCM level-of-service grade A–F.
- **Reproducible.** Export a CSV of 10-second statistics, or copy the seed plus settings; paste the hash back to replay a run.
- **Cinematic 3D perspective view.** A software rasteriser (no WebGL, no CDN) that renders the junction
  like a movie frame. Five camera presets (Orbit, Street Eye, Top, Gantry, Focus), three lighting modes
  (Day, Dusk, Night), film-grade post-processing (vignette, color grading, film grain, fog), per-vehicle
  headlight beams, signal road-glow halos, live countdown timers, and a toggleable city scene with
  glowing buildings, neem trees, bus shelters, and cobra-head streetlights.
- **AI Prompt Log.** A live log of every analysis prompt the simulator generates, with reasoning and
  recommendations displayed in a modal. Prompts fire every second of simulation time.
- **Live Statistics panel.** Real-time chart of queue length and average wait, plus a summary grid of
  vehicles passed, average/P95 wait, throughput, collisions, and red-light runs.
- **Free Left Turn.** Toggle a protected slip-lane indicator on each arm.

## Quick start

```bash
git clone https://github.com/itzlucifa/junctionLab-.git
cd junctionLab-
npm test              # 21 tests, ~6 s, no install step required
npm run benchmark     # regenerate the table below
```

Or just open `index.html`. That is the whole point.

## How it works

The simulation core is delimited by `// ==CORE-START==` and `// ==CORE-END==` and contains no DOM access
at all, which is how the tests and the benchmark run the *shipping* code under Node. Details, including a
state-machine diagram, are in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Results

15 simulated minutes, seed `20261016`, identical vehicle stream per mode. Reproduce with `npm run benchmark`.

| Scenario | Control | Cars | Veh/h | Avg wait | P95 wait | LOS | Collisions | Red runs |
|---|---|---:|---:|---:|---:|:-:|---:|---:|
| balanced | Fixed (manual) | 456 | 1824 | 6.1 s | 18.5 s | A | 0 | 0 |
| balanced | Fixed (calculated) | 458 | 1832 | 5.9 s | 18.8 s | A | 0 | 0 |
| balanced | **Adaptive** | 459 | 1836 | **4.4 s** | 14.1 s | A | 0 | 0 |
| office rush (N–S) | Fixed (manual) | 577 | 2308 | 9.6 s | 26.5 s | A | 0 | 0 |
| office rush | Fixed (calculated) | 585 | 2340 | 6.1 s | 24.8 s | A | 0 | 0 |
| office rush | **Adaptive** | 580 | 2320 | **4.8 s** | 15.6 s | A | 0 | 0 |
| market day (E–W) | Fixed (manual) | 583 | 2332 | 12.4 s | 31.4 s | B | 0 | 0 |
| market day | Fixed (calculated) | 587 | 2348 | 6.0 s | 20.6 s | A | 0 | 0 |
| market day | **Adaptive** | 584 | 2336 | **4.9 s** | 16.9 s | A | 0 | 0 |
| stress | Fixed (manual) | 959 | 3836 | 102.2 s | 192.2 s | F | 0 | 0 |
| stress | Fixed (calculated) | 959 | 3836 | 102.2 s | 192.2 s | F | 0 | 0 |
| stress | **Adaptive** | **1085** | **4340** | **58.5 s** | 121.6 s | E | 0 | 0 |
| balanced + surge | Fixed (manual) | 549 | 2196 | 8.0 s | 19.3 s | A | 0 | 0 |
| balanced + surge | Fixed (calculated) | 554 | 2216 | 7.9 s | 19.8 s | A | 0 | 0 |
| balanced + surge | **Adaptive** | 556 | 2224 | **4.8 s** | 15.8 s | A | 0 | 0 |
| office rush + surge | Fixed (manual) | 621 | 2484 | 80.1 s | 180.2 s | F | 0 | 0 |
| office rush + surge | Fixed (calculated) | 743 | 2972 | 11.2 s | 31.8 s | B | 0 | 0 |
| office rush + surge | **Adaptive** | **747** | **2988** | **6.4 s** | 18.6 s | A | 0 | 0 |
| market day + surge | Fixed (manual) | 619 | 2476 | 57.9 s | 177.6 s | E | 0 | 0 |
| market day + surge | Fixed (calculated) | 636 | 2544 | 14.3 s | 39.3 s | B | 0 | 0 |
| market day + surge | **Adaptive** | **641** | **2564** | **8.5 s** | 25.4 s | A | 0 | 0 |
| stress + surge | Fixed (manual) | 934 | 3736 | 132.8 s | 241.9 s | F | 0 | 0 |
| stress + surge | Fixed (calculated) | 934 | 3736 | 132.8 s | 241.9 s | F | 0 | 0 |
| stress + surge | **Adaptive** | **1071** | **4284** | **103.5 s** | 185.2 s | F | 0 | 0 |

**What the table actually says.** Adaptive wins everywhere, but the interesting part is *where* it wins.
On balanced demand a correct Webster cycle is already near-optimal and adaptive buys you about 1.5 s.
When demand shifts — the surge rows, where the heavy axis swaps every 5 minutes — a fixed plan computed
for the old demand collapses to 80 s of average delay while adaptive holds at 6 s. And in `stress`, where
total demand exceeds the junction's capacity, no controller can win: the fixed plans sit in LOS F and
adaptive only delays the inevitable by moving more vehicles. That is the honest result, and the simulator
shows the warning rather than hiding it.

The `stress` rows for manual and calculated are identical because at `Y = 1.02` the Webster method
correctly reports the junction as oversaturated and falls back to equal 12 s greens — which happens to be
what the manual slider is set to.

## Controls

| Key | Action |
|:-|:-|
| `Space` | Pause / resume |
| `R` | Reset the run |
| `A` | Send an ambulance from the selected arm |

The header switches between the three controllers and a three-way compare; the sidebar sets per-arm demand,
the green slider, the emergency corridor, and the demand-surge scenario. **Judge tests** runs five
headless safety audits inside the page and reports PASS/FAIL with the numbers behind each.

## Privacy

JunctionLab runs entirely in your browser. It makes no network requests, sets no cookies, stores nothing,
and collects nothing. The CSV and settings export only ever write to your own machine.

## Limitations

Deliberate scope choices, not bugs:

- **Straight-through traffic only.** No turn lanes, so protected-versus-permitted phasing is out of scope.
- **One lane per direction.** Capacity comes from the calibrated saturation flow of that single lane.
- **No pedestrians, cyclists on the carriageway, or on-street parking.** The zebra crossings are scenery.
- **A junction, not a network.** Progression between adjacent signals is exactly the thing this model cannot show.

## Creator & License

**Created by:** Sumit Nawale & Nayan Dudkekar

**License:** [MIT License](LICENSE)