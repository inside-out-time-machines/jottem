#!/bin/sh
# Vertaalpatch voor de authentik-BACKEND (Django gettext), tegenhanger van
# patch-locale.sh voor de web-UI: sommige backendstrings (zoals de consent-kop
# "Continue to confirm this email address." uit stages/email/flow.py) ontbreken in
# de meegeleverde Nederlandse catalogus en tonen daardoor Engels.
#
# Haalt /locale/nl/LC_MESSAGES/django.mo uit de draaiende authentik-server, vult de
# msgid's uit backend-vertalingen.tsv aan (meldt regels die inmiddels upstream
# vertaald zijn) en schrijft backend/nl-django.mo; docker-compose.yml mount dat
# bestand read-only over het origineel (server én worker).
#
# NA ELKE AUTHENTIK-UPGRADE OPNIEUW DRAAIEN, net als patch-locale.sh.
# Vereist gettext (msgunfmt/msgfmt).
# Gebruik (op de dev-server, vanuit jottem/deploy): sh authentik-locale/patch-backend-locale.sh
set -e
cd "$(dirname "$0")/.."

mkdir -p authentik-locale/backend
docker compose exec -T authentik-server cat /locale/nl/LC_MESSAGES/django.mo \
  > authentik-locale/backend/nl-django.mo.orig
msgunfmt authentik-locale/backend/nl-django.mo.orig -o authentik-locale/backend/nl-django.po

python3 - <<'EOF'
basis = "authentik-locale"
po = open(f"{basis}/backend/nl-django.po", encoding="utf-8").read()
def po_str(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'
nieuw = []
for regel in open(f"{basis}/backend-vertalingen.tsv", encoding="utf-8"):
    if regel.startswith("#") or "\t" not in regel:
        continue
    msgid, msgstr = regel.rstrip("\n").split("\t", 1)
    if f"msgid {po_str(msgid)}" in po:
        print(f"  AL AANWEZIG (upstream vertaald?): {msgid[:70]}")
        continue
    nieuw.append(f"\nmsgid {po_str(msgid)}\nmsgstr {po_str(msgstr)}\n")
open(f"{basis}/backend/nl-django.po", "a", encoding="utf-8").write("".join(nieuw))
print(f"{len(nieuw)} vertaling(en) toegevoegd")
EOF

msgfmt authentik-locale/backend/nl-django.po -o authentik-locale/backend/nl-django.mo
rm -f authentik-locale/backend/nl-django.po authentik-locale/backend/nl-django.mo.orig
echo "Gepatcht: authentik-locale/backend/nl-django.mo"
echo "Daarna: docker compose up -d authentik-server authentik-worker (en committen)"
