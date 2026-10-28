"""Besloten projecten (ontwerp: OB-7, BE-8): de webapplicatie-weergaven zitten dicht, de
open data van hetzelfde project blijft open.

Zwart-doos: de suite zoekt een project met `zichtbaarheid == "besloten"` en slaat over als
de omgeving er geen heeft. Een besloten project is in dev met de hand aan te maken via het
projectbeheer (openbaarheid: besloten).
"""
import httpx
import pytest


@pytest.fixture(scope="session")
def besloten(organisaties: list[dict]) -> tuple[dict, dict]:
    for org in organisaties:
        for project in org["projecten"]:
            if project.get("zichtbaarheid") == "besloten":
                return org, project
    pytest.skip("geen besloten project in deze omgeving")


def test_projecten_dragen_zichtbaarheid(organisaties: list[dict]):
    for org in organisaties:
        for project in org["projecten"]:
            assert project["zichtbaarheid"] in ("openbaar", "besloten")


def test_projectpagina_zonder_token_toont_geen_jottems(api: httpx.Client, besloten):
    org, project = besloten
    antwoord = api.get(f"/organisatie/{org['slug']}/project/{project['slug']}/publiek")
    assert antwoord.status_code == 200
    data = antwoord.json()
    assert data["zichtbaarheid"] == "besloten"
    assert data["toegang"] == "inloggen"
    assert data["jottems"] == []
    assert data["aantalJottems"] == 0
    # de projectinfo zelf blijft openbaar
    assert data["naam"] == project["naam"]


def test_widget_bestaat_niet(api: httpx.Client, besloten):
    org, project = besloten
    assert api.get(f"/organisatie/{org['slug']}/project/{project['slug']}/widget").status_code == 404


def test_jottem_detail_vraagt_login(api: httpx.Client, besloten):
    """Een jottem-id van het besloten project komt uit de (openbare) IIIF-collectie."""
    org, project = besloten
    collectie = api.get(f"/project/{project['projectId']}/iiif/collection")
    assert collectie.status_code == 200
    items = collectie.json().get("items", [])
    if not items:
        pytest.skip("besloten project zonder gepubliceerde jottems")
    media_id = items[0]["id"].rstrip("/").split("/jottem/")[1].split("/")[0]
    assert api.get(f"/jottem/{media_id}/detail").status_code == 401
    # de open-data-representatie van dezelfde jottem blijft open
    assert api.get(f"/jottem/{media_id}", headers={"Accept": "application/ld+json"}).status_code == 200


@pytest.mark.parametrize("pad", ["/project/{id}/iiif/collection", "/project/{id}/rss",
                                 "/project/{id}/activity-stream", "/project/{id}/dump.nt.gz"])
def test_open_data_blijft_open(api: httpx.Client, besloten, pad: str):
    _, project = besloten
    antwoord = api.get(pad.format(id=project["projectId"]), follow_redirects=True)
    assert antwoord.status_code == 200


def test_datasetbeschrijving_blijft_open(data: httpx.Client, besloten):
    _, project = besloten
    assert data.get(f"/project/{project['projectId']}/dataset",
                    headers={"Accept": "application/ld+json"},
                    follow_redirects=True).status_code == 200
