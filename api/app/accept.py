"""Content negotiation: de Accept-header echt ontleden in plaats van erin zoeken.

De koppen werden met `"text/turtle" in accept` afgehandeld. Dat gaat op drie manieren mis.
Q-waarden tellen niet mee, dus `Accept: text/turtle;q=0.1, application/ld+json` leverde
turtle terwijl de client juist het omgekeerde vroeg. Parameters worden meegelezen als
mediatype, dus een verzoek om een geframede representatie matchte op de gewone en kreeg
stilzwijgend een ander document. En zonder onderscheid tussen varianten is er ook geen
reden om `Vary: Accept` te sturen, terwijl er vier representaties op één URL leven.
"""
from __future__ import annotations

FRAMED = "http://www.w3.org/ns/json-ld#framed"


def _splits_op_komma(header: str) -> list[str]:
    """Splits op komma's die buiten aanhalingstekens staan.

    Een profielparameter is een quoted-string die spaties mag bevatten (meerdere
    profiel-URI's), dus naief splitsen breekt precies op de header die we nodig hebben.
    """
    delen, huidig, in_quote = [], [], False
    for teken in header:
        if teken == '"':
            in_quote = not in_quote
        if teken == "," and not in_quote:
            delen.append("".join(huidig))
            huidig = []
        else:
            huidig.append(teken)
    delen.append("".join(huidig))
    return [d.strip() for d in delen if d.strip()]


class Bereik:
    """Eén mediabereik uit de Accept-header."""

    def __init__(self, tekst: str, volgorde: int):
        stukken = _splits_op_puntkomma(tekst)
        self.mediatype = stukken[0].lower()
        self.parameters: dict[str, str] = {}
        self.q = 1.0
        for stuk in stukken[1:]:
            sleutel, _, waarde = stuk.partition("=")
            sleutel = sleutel.strip().lower()
            waarde = waarde.strip().strip('"')
            if sleutel == "q":
                try:
                    self.q = float(waarde)
                except ValueError:
                    self.q = 0.0
            else:
                self.parameters[sleutel] = waarde
        self.volgorde = volgorde

    @property
    def specificiteit(self) -> int:
        if self.mediatype == "*/*":
            return 0
        return 1 if self.mediatype.endswith("/*") else 2

    def past_bij(self, aangeboden: str) -> bool:
        if self.mediatype in ("*/*", aangeboden):
            return True
        return self.mediatype.endswith("/*") and aangeboden.startswith(
            self.mediatype[:-1])


def _splits_op_puntkomma(tekst: str) -> list[str]:
    delen, huidig, in_quote = [], [], False
    for teken in tekst:
        if teken == '"':
            in_quote = not in_quote
        if teken == ";" and not in_quote:
            delen.append("".join(huidig))
            huidig = []
        else:
            huidig.append(teken)
    delen.append("".join(huidig))
    return [d.strip() for d in delen if d.strip()]


def ontleed(header: str | None) -> list[Bereik]:
    return [Bereik(deel, i) for i, deel in enumerate(_splits_op_komma(header or ""))]


def beste(header: str | None, aangeboden: list[str]) -> str:
    """Welke van de aangeboden representaties de client het liefst wil.

    Bij gelijke q wint de specifiekste match, en daarna de volgorde van `aangeboden`:
    daar staat de standaardrepresentatie vooraan, zodat een kale `*/*` daarop uitkomt.
    """
    bereiken = [b for b in ontleed(header) if b.q > 0]
    if not bereiken:
        return aangeboden[0]
    kandidaten = []
    for stand, type_ in enumerate(aangeboden):
        passend = [b for b in bereiken if b.past_bij(type_)]
        if passend:
            beste_bereik = max(passend, key=lambda b: (b.q, b.specificiteit))
            kandidaten.append((beste_bereik.q, beste_bereik.specificiteit, -stand, type_))
    if not kandidaten:
        return aangeboden[0]
    return max(kandidaten)[3]


def framed_gevraagd(header: str | None) -> bool:
    """Vraagt de client om een geframede JSON-LD-representatie?

    Het profiel is een spatie-gescheiden lijst URI's; wij kijken alleen of de
    framing-URI erbij staat. Welk frame dat is bepaalt de route, niet de client.
    """
    for bereik in ontleed(header):
        if bereik.q > 0 and bereik.mediatype in ("application/ld+json", "application/json"):
            if FRAMED in bereik.parameters.get("profile", "").split():
                return True
    return False
