#!/bin/sh
# Assemble the website in _site/ (run from the repository root): the documentation rendered by
# Quarto (docs/_site) at the root, and the simulation under simulation/. Used by
# .github/workflows/deploy-pages.yml; also works locally:
#
#   npm run build-site                     # compiles, renders the documentation, runs this script
#   npx http-server _site                  # open http://127.0.0.1:8080/
#
# The simulation's page, compiled modules and Rapier keep the same relative paths as in the
# repository, so the site works under any subpath, e.g. https://<user>.github.io/<repo>/.
set -eu
out="${1:-_site}"
rapier=node_modules/@dimforge/rapier2d-simd-compat/dist/rapier.mjs  # self-contained (WebAssembly inlined)

for f in docs/_site/index.html index.html build/viewer.js "$rapier"; do
  [ -f "$f" ] || { echo "missing $f: run 'npm install', 'npm run build' and 'npm run docs' first" >&2; exit 1; }
done

rm -rf "$out"
cp -R docs/_site "$out"
sim="$out/simulation"
mkdir -p "$sim/build" "$sim/$(dirname "$rapier")"
cp index.html "$sim/"
for f in build/*.js; do
  [ "$f" = build/run.js ] || cp "$f" "$sim/build/"  # run.js is the Node runner, not part of the page
done
cp "$rapier" "$sim/$rapier"
echo "site in $out/ ($(du -sh "$out" | cut -f1)); open it through a web server, e.g. npx http-server $out"
