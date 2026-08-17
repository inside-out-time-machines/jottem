"""Catalogus van verrijkingsmogelijkheden, conform hoofdstuk Verrijkingen in het design.

De CTA-teksten komen letterlijk uit het verrijkingendocument (B1, tutoyerend; V-2).
Niet-MVP-verrijkingen bestaan hier al wel maar staan achter de mvp-vlag (V-5), zodat ze
later per omgeving/fase geactiveerd kunnen worden zonder herontwerp. De organisatie-
beheerder schakelt per project verrijkingen in of uit (V-1); None betekent: alle
MVP-verrijkingen aan (de standaard).
"""
from dataclasses import dataclass

from .models import Project


@dataclass(frozen=True)
class Verrijking:
    sleutel: str
    label: str            # korte naam voor beheer-checkbox en weergave
    cta: str              # call-to-action op de jottem-pagina (V-2)
    motivation: str       # W3C Web Annotation motivation
    doel: str             # "heel" (hele jottem), "vlak" (getekend vlak) of "beide"
    mvp: bool = True


CATALOGUS: list[Verrijking] = [
    Verrijking(
        "herinnering", "Herinneringen en verhalen",
        "Was jij hier weleens? Vertel je herinnering, groot of klein.",
        "commenting", "heel",
    ),
    Verrijking(
        "vlak", "Aanwijzen op de foto",
        "Zie je iets bijzonders op deze foto? Teken er een vak omheen en vertel wat het is.",
        "identifying", "vlak",
    ),
    Verrijking(
        "tag", "Steekwoorden (Termennetwerk)",
        "Wat zie je op deze foto? Kies een woord uit de lijst, dan kan iedereen het terugvinden.",
        "tagging", "heel",
    ),
    Verrijking(
        "vraag", "Vragen stellen",
        "Weet jij dit niet? Stel je vraag, misschien weet een ander het wel.",
        "questioning", "heel",
    ),
    Verrijking(
        "bron", "Externe bronnen koppelen",
        "Ken je een krantenbericht of archiefstuk over deze plek? Plak de link erbij.",
        "linking", "heel",
    ),
    Verrijking(
        "periode", "Datering",
        "Weet je wanneer dit was? Vul het jaartal in, ook een gok helpt.",
        "describing", "heel",
    ),
    Verrijking(
        "begrip", "Begrippen uitleggen",
        "Weet jij wat dit woord betekent? Leg het uit voor wie het niet meer kent.",
        "describing", "heel",
    ),
    Verrijking(
        "zichtveld", "Standpunt van de fotograaf",
        "Waar stond de fotograaf? Zet een speld en draai het pijltje in de kijkrichting.",
        "describing", "heel",
    ),
    # fase 2 en later (V-5): nog niet activeerbaar in de MVP
    Verrijking("transcriptie", "Transcriptie",
               "Kun je lezen wat hier staat? Typ het over, dan kan iedereen het vinden.",
               "supplementing", "vlak", mvp=False),
    Verrijking("namen", "Namen en lijsten",
               "Staan er namen op? Typ ze over, dan zijn ze te vinden voor familie en onderzoekers.",
               "supplementing", "vlak", mvp=False),
    Verrijking("audio", "Gesproken verhalen",
               "Vertel je verhaal liever? Neem het op, praten mag ook.",
               "commenting", "heel", mvp=False),
    Verrijking("toen-nu", "Toen en nu",
               "Woon je in de buurt? Maak dezelfde foto zoals het er nu uitziet en zet hem ernaast.",
               "linking", "heel", mvp=False),
    Verrijking("feitencontrole", "Feitencontrole",
               "Klopt deze informatie? Bevestig het of stel een verbetering voor.",
               "assessing", "heel", mvp=False),
]

PER_SLEUTEL: dict[str, Verrijking] = {v.sleutel: v for v in CATALOGUS}
MVP_SLEUTELS: list[str] = [v.sleutel for v in CATALOGUS if v.mvp]

# reageren op een annotatie (replying) is geen instelbare verrijking maar hoort bij
# elke annotatie zodra die er is (AN-3)
REAGEREN_MOTIVATION = "replying"


def actieve_sleutels(project: Project) -> list[str]:
    """De ingeschakelde verrijkingen van een project (V-1); None = MVP-standaard."""
    if project.verrijkingen is None:
        return list(MVP_SLEUTELS)
    return [s for s in project.verrijkingen if s in PER_SLEUTEL and PER_SLEUTEL[s].mvp]


def actieve_verrijkingen(project: Project) -> list[Verrijking]:
    return [PER_SLEUTEL[s] for s in actieve_sleutels(project)]
