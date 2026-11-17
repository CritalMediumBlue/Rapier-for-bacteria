# Rapier for bacteria

Rod-shaped bacteria growing, dividing and pushing each other as a monolayer in a microfluidic
chamber (100 × 60 units, open at the bottom). Cells near the side walls can attach to the
surface. The mechanics run on the [Rapier](https://rapier.rs) 2D physics engine, in its
WebAssembly SIMD build (`@dimforge/rapier2d-simd-compat`), so the same code runs in the browser
and on the command line.

**Live demo:** https://critalmediumblue.github.io/Rapier-for-bacteria/

## Quick start

Requires Node.js 22 or newer and npm. In the browser, it needs WebAssembly SIMD: any current
Chrome, Edge, Firefox or Safari (Chrome 91, Firefox 89 and Safari 16.4 or newer).

```sh
git clone https://github.com/CritalMediumBlue/Rapier-for-bacteria.git
cd Rapier-for-bacteria
npm install                 # Rapier, TypeScript, and a small web server
npm run build               # compiles src/*.ts into build/*.js
npm start                   # opens the simulation in your browser
npm run simulate -- --steps 3000 --seed 7 --out output/states.json   # or run it without a browser
```

## How the code is organised

All the code is in `src/` (about 1 800 lines of TypeScript). Read it in this order:

| File | What it does |
|---|---|
| [`src/model.ts`](src/model.ts) | **The model**: every parameter with its default and an explanation (`DEFAULT_PARAMS`), the chamber geometry, and the formulas for cell mass and drag. No physics engine here. |
| [`src/simulation.ts`](src/simulation.ts) | **The simulation**: the `Simulation` class puts the model on Rapier. Each step: Rapier resolves contacts, then cells grow, divide, leave or die, and may attach to the wall. Records snapshots. |
| [`src/states.ts`](src/states.ts) | Records snapshots and the lineage, and writes them as JSON (format below). |
| [`src/rng.ts`](src/rng.ts) | Seeded random numbers: the same seed gives the same run. |
| [`src/overlap.ts`](src/overlap.ts) | Quality check: how deep cells penetrate each other and the walls (should stay below 8% of the cell width). |
| [`src/run.ts`](src/run.ts) | **Command-line entry point** (Node): runs a simulation and saves the states to disk. |
| [`src/viewer.ts`](src/viewer.ts) | **Browser entry point**: runs the simulation, the controls on [`index.html`](index.html), saving. |
| [`src/render.ts`](src/render.ts) | Draws the chamber and the cells on a canvas (no physics). |

```
          run.ts (Node)           viewer.ts (browser) ── render.ts
                 \                  /
                  simulation.ts ── overlap.ts
                 /      |      \
          model.ts   states.ts   rng.ts          + Rapier (npm: @dimforge/rapier2d-simd-compat)
```

`simulation.ts`, `model.ts`, `states.ts`, `rng.ts` and `overlap.ts` use no browser or Node APIs;
only the two entry points do. The rest of the repository:

| Path | |
|---|---|
| `index.html` | the web page (loads `build/viewer.js`) |
| `tools/build-site.sh` | assembles the static website in `_site/` |
| `tools/*.py` | analysis of output files (Python 3, standard library only): overlap reports and charts, colony organisation |
| `tools/rapier-stale-contacts.mjs` | minimal reproduction of the Rapier bug that `simulation.ts` works around (see `resizeCollider`) |
| `docs/NOTES.md` | why the model is the way it is: design decisions, solver settings, performance, validation |
| `docs/reports/` | the overlap validation: report, CSV logs and charts |
| `.github/workflows/deploy-pages.yml` | publishes the website on every push to `main` |

### Using the simulation from your own code

```ts
import { Simulation } from "./simulation.js";

const sim = await Simulation.create({ seed: 7, rate: 0.002 });   // any parameter from DEFAULT_PARAMS
while (sim.stepCount < 3000) { sim.step(); }
sim.forEachCell((x, y, angle, length) => { /* ... */ });
```

## Run in the browser

`npm start` serves the repository and opens `index.html`. Space pauses, N advances one step, J
saves the states. The header sets the steps per frame, the view (simple outlines, or diagnostic,
which highlights overlapping cells), the seed and the snapshot interval.

URL parameters set the same things, plus any model parameter by name, for example
`index.html?seed=7&speed=20&style=diagnostic&anchorMaxStretch=1`. `view=minX,minY,maxX,maxY`
zooms into a part of the chamber. `window.biofilm` gives scripts the simulation, the latest
overlap, timing and `download()`.

Saving: in Chrome and Edge you pick a file once, and it is then overwritten automatically every
500 snapshots; other browsers download numbered copies.

## Run on the command line

```sh
node build/run.js --steps 600000 --seed 7 --out output/states.json
node build/run.js --help              # all options
node build/run.js --list-params       # all model parameters and their defaults
node build/run.js --steps 30000 --set rate=0.002 --set anchorMaxStretch=1   # override parameters
node build/run.js --steps 60000 --overlap-log output/overlap.csv --overlap-check
python3 tools/overlap_report.py output/overlap.csv
```

(`npm run simulate -- <options>` is the same as `node build/run.js <options>`.)

- The output file is rewritten in full every `--save-every` snapshots (default 500) and at the
  end, via a temporary file, so it is always valid JSON. Ctrl+C stops the run and saves.
- The seed is printed at the start; pass it again with `--seed` to repeat a run exactly.
- Runs are independent, so several can run in parallel (one per CPU core).
- `--overlap-log` writes the penetration depth of every touching pair of cells, at each snapshot,
  as CSV. `--overlap-check` exits with status 3 if the deepest pair exceeds 8% of the cell width
  after a 3000-step warm-up (the random initial placement overlaps heavily). `--timing-log`
  writes the time per step.

## Output format

```json
{"1":[{"x":3.99,"y":166.12,"id":1,"an":0.46,"le":3.7}, ...], "2":[...], ..., "lineage":{"1":0, ...}}
```

- One snapshot every `snapshotInterval` steps (default 300; a multiple of `growthInterval` = 25).
  Snapshot keys count snapshots ("1", "2", ...); cells are sorted by id.
- `x`, `y`: cell centre. `an`: orientation as a fraction of π (0–1). `le`: distance between the
  end-cap centres (cell length = `le` + 0.8, the cell width). All rounded to 2 decimals.
- `id`: sequential, never reused. `lineage`: each cell id → its mother's id (0 for the initial
  cells). Cells that divide or leave between two snapshots appear in `lineage` but in no snapshot.
- A run cannot be resumed from this file (it holds rounded positions, not the full physics state).
  To reproduce a run, run it again with the same seed and parameters.
  `python3 tools/organization.py FILE` computes cell counts and alignment from it.

## Reproducibility

- Same seed, parameters and machine → byte-identical output. Results depend on the Rapier
  version, so it is pinned exactly in `package.json` (0.21.0) and printed at the start of a run.
  The SIMD build gave byte-identical output to Rapier's plain build (`rapier2d-compat`, used
  before 17 November 2026) in a 20 000-step test, at about half the time per step. Rapier makes no
  promise of identical results across machines; its `rapier2d-deterministic` build does, but is
  slower.
- Defaults: 1000 initial cells, 60 steps per simulated second, cell width 0.8, growth every 25
  steps, 8 solver iterations. Every parameter is documented in `src/model.ts`.
- Expected output: `--steps 3000` gives 10 snapshots and ~970 cells. The chamber fills after
  ~12 000 steps and then holds ~1700–1800 cells. With a full chamber a step takes ~5 ms on one
  core of a Xeon E-2246G (~10 ms with the plain build). 600 000 steps give a ~190 MB file with
  2000 snapshots; they took ~1 h 40 min with the plain build.

## The website

Every push to `main` builds the page and publishes it on GitHub Pages
(`.github/workflows/deploy-pages.yml`). This needs, once, in the repository's
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

To build the site locally: `npm run build-site`, then `npx http-server _site`. The site is
`index.html`, `build/*.js` and Rapier's single JavaScript file (the WebAssembly is inlined in it),
about 3.4 MB; it needs no server-side code.

## History

The model was first written on Box2D (in
[box2d_for_bacteria](https://github.com/CritalMediumBlue/box2d_for_bacteria), which keeps the
original implementation) and then ported to Rapier. This repository continues the Rapier version
only, with the history of its files. Comments that mention "the testbed" refer to that original
Box2D implementation; `docs/NOTES.md` describes the port and every model change since.

## License

MIT, see [`LICENSE`](LICENSE). Rapier is licensed under Apache-2.0.
