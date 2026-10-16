# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-16

### Added
- Four-way signalised junction simulation with left-hand traffic and an Indian vehicle mix (car, two-wheeler, auto-rickshaw, bus).
- Three signal control strategies: **Fixed (manual)**, **Fixed (calculated)** using the Webster method, and **Adaptive** with gap-out, minimum/maximum green and a car-unit priority rule.
- Emergency-vehicle green corridor with full-length amber and all-red clearance and a minimum-green recovery debt for any axis whose green was cut short.
- Amber and all-red intervals derived from physical constants rather than chosen by hand.
- Empirical saturation-flow calibration — no hard-coded capacity figure.
- Demand-surge scenario for comparing adaptive control against a fair fixed plan.
- Metrics: throughput per hour, 95th-percentile wait, maximum queue per arm, HCM level-of-service grade A–F.
- Time-series chart of queue and wait, distinguished by both colour and dash pattern.
- CSV export of 10-second statistics and reproducible seed + settings export.
- In-page "Judge tests" panel plus a Node `node:test` suite covering safety invariants and determinism.
- Continuous integration and GitHub Pages deployment workflows.
