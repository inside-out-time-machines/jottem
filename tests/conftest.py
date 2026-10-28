"""Gedeelde fixtures voor de contracttests.

De suite is zwart-doos: hij praat met een draaiende omgeving via https, precies zoals
een externe gebruiker dat doet. Daardoor werkt hij zowel tegen dev als straks tegen
productie, en meet hij het echte gedrag inclusief Traefik, CORS en caching.

Basis-URL's zijn instelbaar met JOTTEM_API_URL, JOTTEM_SITE_URL, JOTTEM_DATA_URL en
JOTTEM_ANNO_URL; de standaardwaarden wijzen naar de dev-omgeving.
"""
import os

import httpx
import pytest

API = os.environ.get("JOTTEM_API_URL", "https://api.dev.iotm.nl").rstrip("/")
SITE = os.environ.get("JOTTEM_SITE_URL", "https://dev.iotm.nl").rstrip("/")
DATA = os.environ.get("JOTTEM_DATA_URL", "https://data.dev.iotm.nl").rstrip("/")
ANNO = os.environ.get("JOTTEM_ANNO_URL", "https://anno.dev.iotm.nl").rstrip("/")

TIMEOUT = float(os.environ.get("JOTTEM_TIMEOUT", "30"))


@pytest.fixture(scope="session")
def api() -> httpx.Client:
    with httpx.Client(base_url=API, timeout=TIMEOUT, follow_redirects=False) as client:
        yield client


@pytest.fixture(scope="session")
def data() -> httpx.Client:
    with httpx.Client(base_url=DATA, timeout=TIMEOUT, follow_redirects=False) as client:
        yield client


@pytest.fixture(scope="session")
def site() -> httpx.Client:
    with httpx.Client(base_url=SITE, timeout=TIMEOUT, follow_redirects=False) as client:
        yield client


@pytest.fixture(scope="session")
def organisaties(api: httpx.Client) -> list[dict]:
    antwoord = api.get("/organisaties")
    antwoord.raise_for_status()
    lijst = antwoord.json()
    if not lijst:
        pytest.skip("geen organisaties in deze omgeving")
    return lijst


def _openbaar_met_jottems(project: dict) -> bool:
    # een besloten project toont zonder login geen jottems (test_besloten.py dekt dat);
    # de publieke fixtures hebben een openbaar project nodig
    return project["aantalJottems"] > 0 and project.get("zichtbaarheid") != "besloten"


@pytest.fixture(scope="session")
def organisatie(organisaties: list[dict]) -> dict:
    """De eerste organisatie met een openbaar project en minstens één jottem."""
    for org in organisaties:
        if any(_openbaar_met_jottems(p) for p in org["projecten"]):
            return org
    pytest.skip("geen organisatie met gepubliceerde jottems in een openbaar project")


@pytest.fixture(scope="session")
def project(organisatie: dict) -> dict:
    return next(p for p in organisatie["projecten"] if _openbaar_met_jottems(p))


@pytest.fixture(scope="session")
def jottem_id(api: httpx.Client, organisatie: dict, project: dict) -> str:
    antwoord = api.get(f"/organisatie/{organisatie['slug']}/project/{project['slug']}/publiek")
    antwoord.raise_for_status()
    jottems = antwoord.json()["jottems"]
    if not jottems:
        pytest.skip("project zonder gepubliceerde jottems")
    return jottems[0]["mediaId"]
