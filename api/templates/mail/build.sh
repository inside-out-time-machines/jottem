#!/bin/bash
# Compileert de MJML-sjablonen naar HTML-Jinja-sjablonen in dist/ (vereist Node/npx).
# De partials (mj-include) worden vooraf geëxpandeerd zodat de build niet afhangt van
# include-gedrag van de gebruikte mjml-versie.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist/nl
for f in nl/*.mjml; do
  python3 - "$f" <<'PY' | npx mjml -i -s > "dist/${f%.mjml}.html.j2"
import re, sys, pathlib
src_path = pathlib.Path(sys.argv[1])
src = src_path.read_text()
def expand(m):
    return (src_path.parent / m.group(1)).resolve().read_text()
sys.stdout.write(re.sub(r'<mj-include path="([^"]+)"\s*/>', expand, src))
PY
done
echo "Klaar: $(ls dist/nl | wc -l) sjablonen gecompileerd"
