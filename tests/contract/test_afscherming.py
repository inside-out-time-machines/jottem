"""Beheerendpoints horen zonder geldig token dicht te zitten.

Deze tests draaien bewust zonder inloggegevens: ze leggen vast dat de dev-bypass uit
staat en dat elke beheerroute 401 geeft. Zo merkt de suite het meteen als DEV_AUTH per
ongeluk aan blijft staan na een test.
"""
import uuid

import httpx
import pytest

BEHEER_GET = [
    "/organisatie",
    "/mijn/profiel",
    "/mijn/jottems",
]


@pytest.mark.parametrize("pad", BEHEER_GET)
def test_beheer_get_zonder_token(api: httpx.Client, pad: str):
    assert api.get(pad).status_code == 401


@pytest.mark.parametrize("pad", BEHEER_GET)
def test_dev_bypass_staat_uit(api: httpx.Client, pad: str):
    """X-Dev-Sub mag alleen werken als JOTTEM_DEV_AUTH=1; op een normale omgeving niet."""
    assert api.get(pad, headers={"X-Dev-Sub": "dev-piet"}).status_code == 401


def test_organisatiebeheer_zonder_token(api: httpx.Client, organisatie: dict):
    slug = organisatie["slug"]
    assert api.get(f"/organisatie/{slug}/projecten").status_code == 401
    assert api.get(f"/organisatie/{slug}/moderatie/jottems").status_code == 401
    assert api.get(f"/organisatie/{slug}/gebruikers").status_code == 401


def test_schrijfacties_zonder_token(api: httpx.Client, jottem_id: str):
    assert api.put(f"/jottem/{jottem_id}/status",
                   json={"besluit": "goedgekeurd"}).status_code == 401
    assert api.post("/upload-url", json={"bestandsnaam": "x.jpg",
                                         "contentType": "image/jpeg",
                                         "grootte": 1024}).status_code == 401
    assert api.post(f"/jottem/{jottem_id}/annotation",
                    json={"verrijking": "herinnering", "tekst": "test"}).status_code == 401


def test_detail_van_gepubliceerde_jottem_is_publiek(api: httpx.Client, jottem_id: str):
    """De publiekspagina rendert hiermee zonder login; dat moet zo blijven."""
    antwoord = api.get(f"/jottem/{jottem_id}/detail")
    assert antwoord.status_code == 200
    assert antwoord.json()["status"] == "goedgekeurd"


def test_detail_geeft_geen_rechten_via_de_dev_header(api: httpx.Client, jottem_id: str):
    """Een verzonnen X-Dev-Sub mag geen extra toegang geven.

    Zwart-doos kan deze suite geen niet-gepubliceerde jottem vinden: die zijn per
    definitie niet zichtbaar. Dat pad (401 zonder token, geen presigned origineel in het
    antwoord) is met de hand geverifieerd door tijdelijk een status om te zetten; zie
    UPLIFT_NOTES.md, fase 4. Wat hier wél te toetsen is: de dev-bypass staat uit.
    """
    met_header = api.get(f"/jottem/{jottem_id}/detail", headers={"X-Dev-Sub": "dev-piet"})
    assert met_header.status_code == 200        # gepubliceerd blijft publiek
    assert api.get("/mijn/jottems", headers={"X-Dev-Sub": "dev-piet"}).status_code == 401


def test_onbekende_jottem(api: httpx.Client):
    onbekend = uuid.uuid4()
    assert api.get(f"/jottem/{onbekend}/detail").status_code == 404
    assert api.get(f"/jottem/{onbekend}").status_code == 404
