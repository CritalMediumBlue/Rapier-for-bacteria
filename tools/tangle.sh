#!/bin/sh
# Writes the source files (src/*.ts, index.html) from the literate program in docs/*.qmd.
# Run from the repository root: npm run tangle. Needs Entangled: pip install entangled-cli
set -eu
entangled tangle --force
# Entangled indents the blank lines inside indented blocks; remove that trailing whitespace.
for f in src/*.ts index.html; do
  [ -f "$f" ] || continue
  sed 's/[[:space:]]*$//' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done
