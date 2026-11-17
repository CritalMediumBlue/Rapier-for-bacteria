# Rapier for bacteria

Rod-shaped bacteria growing, dividing and pushing each other as a monolayer in a microfluidic
chamber, simulated with the [Rapier](https://rapier.rs) 2D physics engine. Runs in the browser
and on the command line.

- **How it works:** https://critalmediumblue.github.io/Rapier-for-bacteria/
- **Run it:** https://critalmediumblue.github.io/Rapier-for-bacteria/simulation/

The code is a literate program: the pages in `docs/*.qmd` explain every line, and the source files
(`src/*.ts`, `index.html`) are generated from them with [Entangled](https://entangled.github.io).
Edit the `.qmd` files, not the generated ones.

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

## Changing the code

Also requires Entangled (`pip install entangled-cli`) and, for the documentation,
[Quarto](https://quarto.org).

```sh
npm run tangle       # docs/*.qmd -> src/*.ts, index.html
npm run build
npm run docs         # renders the documentation into docs/_site
npm run build-site   # the whole website in _site/: documentation, simulation in simulation/
```

## Output format

```json
{"1":[{"x":3.99,"y":166.12,"id":1,"an":0.46,"le":3.7}, ...], "2":[...], ..., "lineage":{"1":0, ...}}
```

One snapshot every 300 steps. `x`, `y`: cell centre; `an`: orientation as a fraction of π;
`le`: distance between the end-cap centres; `lineage`: cell id → mother id (0 for initial cells).
The same seed and parameters reproduce a run.

## License

MIT
