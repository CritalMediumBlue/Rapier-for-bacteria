#!/bin/sh
# Assemble the static web version of the simulation in _site/ (run from the repository root).
# Used by .github/workflows/deploy-pages.yml; also works locally:
#
#   npm run build-site                     # compiles, then runs this script
#   npx http-server _site                  # open http://127.0.0.1:8080/
#
# The site is the page, the compiled modules and Rapier, at the same relative paths as in the
# repository, so it works under any subpath, e.g. https://<user>.github.io/<repo>/.
set -eu
out="${1:-_site}"
rapier=node_modules/@dimforge/rapier2d-simd-compat/dist/rapier.mjs  # self-contained (WebAssembly inlined)

for f in index.html build/viewer.js "$rapier"; do
  [ -f "$f" ] || { echo "missing $f: run 'npm install' and 'npm run build' first" >&2; exit 1; }
done

rm -rf "$out"
mkdir -p "$out/build" "$out/$(dirname "$rapier")"
cp index.html "$out/"
for f in build/*.js; do
  [ "$f" = build/run.js ] || cp "$f" "$out/build/"  # run.js is the Node runner, not part of the page
done
cp "$rapier" "$out/$rapier"
echo "site in $out/ ($(du -sh "$out" | cut -f1)); open it through a web server, e.g. npx http-server $out"
