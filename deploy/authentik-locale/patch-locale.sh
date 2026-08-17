#!/bin/sh
# Tutoyeer-patch voor de Nederlandse authentik web-UI (route 3 uit het ontwerpgesprek):
# de gecompileerde nl-locale-chunk wordt uit het authentik-serverimage gehaald, de
# vervangingen uit vervangingen.tsv worden toegepast en het resultaat wordt in
# chunks/ gezet; docker-compose.yml mount dat bestand read-only over het origineel.
#
# NA ELKE AUTHENTIK-UPGRADE OPNIEUW DRAAIEN: de chunknaam is een buildhash die per
# release wisselt. Het script vindt de chunk inhoudelijk (grep "account nodig"),
# meldt vervangingen die niet meer matchen (vertaling upstream gewijzigd) en
# waarschuwt als de mountregel in docker-compose.yml niet naar de nieuwe hash wijst.
#
# Gebruik (op de dev-server, vanuit jottem/deploy): sh authentik-locale/patch-locale.sh
set -e
cd "$(dirname "$0")/.."

CHUNK=$(docker compose exec -T authentik-server sh -c \
  'grep -l "account nodig" /web/dist/src/locales/chunks/*.js' | tr -d '\r')
[ -n "$CHUNK" ] || { echo "FOUT: geen Nederlandse chunk gevonden"; exit 1; }
NAAM=$(basename "$CHUNK")
echo "Nederlandse chunk: $CHUNK"

docker compose exec -T authentik-server cat "$CHUNK" > "authentik-locale/chunks/$NAAM.orig"

python3 - "$NAAM" <<'EOF'
import sys
naam = sys.argv[1]
basis = "authentik-locale"
tekst = open(f"{basis}/chunks/{naam}.orig", encoding="utf-8").read()
mislukt = 0
for regel in open(f"{basis}/vervangingen.tsv", encoding="utf-8"):
    if regel.startswith("#") or "\t" not in regel:
        continue
    oud, nieuw = regel.rstrip("\n").split("\t", 1)
    if oud not in tekst:
        print(f"  NIET GEVONDEN (upstream gewijzigd?): {oud[:70]}")
        mislukt += 1
        continue
    tekst = tekst.replace(oud, nieuw)
open(f"{basis}/chunks/{naam}", "w", encoding="utf-8").write(tekst)
print(f"Gepatcht naar {basis}/chunks/{naam}" + (f" ({mislukt} regels niet gevonden)" if mislukt else ""))
EOF
rm -f "authentik-locale/chunks/$NAAM.orig"

grep -q "authentik-locale/chunks/$NAAM" docker-compose.yml \
  && echo "Mountregel in docker-compose.yml klopt ($NAAM)." \
  || echo "LET OP: werk de mountregel in docker-compose.yml bij naar chunks/$NAAM"
echo "Daarna: docker compose up -d authentik-server"
