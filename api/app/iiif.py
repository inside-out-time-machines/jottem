"""Hulpfuncties voor URL's van de IIIF Image API (eigen Cantaloupe of een beeldbank)."""


def maat(breedte: int | None, hoogte: int | None, grens: int) -> str:
    """Maatparameter voor een afbeelding die binnen `grens` x `grens` moet passen:
    `!grens,grens` als het bronbeeld groter is, anders `max`. In IIIF 3 is `!w,h` op
    een kleiner bronbeeld namelijk een vergrotingsverzoek, en dat hoort een 400 te
    geven (vergroten vraagt om `^`). Zonder bekende afmetingen vragen we `!grens,grens`,
    want dan is verkleinen de veiligste aanname."""
    if not breedte or not hoogte or max(breedte, hoogte) > grens:
        return f"!{grens},{grens}"
    return "max"


def afbeelding_url(service: str, breedte: int | None, hoogte: int | None, grens: int) -> str:
    """Volledige image-URL binnen `grens` x `grens`."""
    return f"{service}/full/{maat(breedte, hoogte, grens)}/0/default.jpg"
