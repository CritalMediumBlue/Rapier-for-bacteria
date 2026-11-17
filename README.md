# Rapier for bacteria

Rod-shaped bacteria growing, dividing and pushing each other as a monolayer in a microfluidic
chamber, simulated with the [Rapier](https://rapier.rs) 2D physics engine. Runs in the browser
and on the command line.

**Live demo:** https://critalmediumblue.github.io/Rapier-for-bacteria/

## Quick start

Requires Node.js 22+.

```sh
npm install
npm run build        # compiles src/ into build/
npm start            # opens the simulation in the browser
```

In the browser: Space pauses, N steps, J saves the states. URL parameters set the seed, the view
and any model parameter, e.g. `index.html?seed=7&speed=20&style=diagnostic`.

## Command line

```sh
node build/run.js --steps 600000 --seed 7 --out output/states.json
node build/run.js --steps 30000 --set rate=0.002     # override any parameter
node build/run.js --list-params                      # all parameters and defaults
node build/run.js --help                             # all options
```

## Code

| File | |
|---|---|
| `src/model.ts` | parameters with defaults, chamber geometry, cell mass and drag |
| `src/simulation.ts` | the `Simulation` class: the model on Rapier (growth, division, anchoring, snapshots) |
| `src/states.ts` | records snapshots and lineage as JSON |
| `src/overlap.ts` | measures cell–cell and cell–wall penetration |
| `src/rng.ts` | seeded random numbers |
| `src/run.ts` | command-line entry point |
| `src/viewer.ts`, `src/render.ts` | browser entry point and drawing |
| `tools/` | site build script and Python analysis scripts |
| `docs/` | design notes and validation reports |

## Output format

```json
{"1":[{"x":3.99,"y":166.12,"id":1,"an":0.46,"le":3.7}, ...], "2":[...], ..., "lineage":{"1":0, ...}}
```

One snapshot every 300 steps. `x`, `y`: cell centre; `an`: orientation as a fraction of π;
`le`: distance between the end-cap centres; `lineage`: cell id → mother id (0 for initial cells).
The same seed and parameters reproduce a run.

## License

MIT
