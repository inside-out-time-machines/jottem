"""Inbedbare widgets (hoofdstuk Deelbaarheid, D-1 t/m D-4): de vorm van het antwoord
en de inbed-headers, niet de inhoud.

De widget-routes moeten juist wél in een iframe kunnen (geen X-Frame-Options,
frame-ancestors *) en cross-origin op te halen zijn (ACAO *); de rest van de site
blijft inbedden weigeren.
"""
import httpx


def _widget_pad(organisatie: dict, project: dict, rest: str = "") -> str:
    return f"/widget/{organisatie['slug']}/{project['slug']}{rest}"


def _controleer_inbed_headers(antwoord: httpx.Response):
    assert antwoord.headers["content-type"].startswith("text/html")
    assert "x-frame-options" not in antwoord.headers
    assert "frame-ancestors *" in antwoord.headers.get("content-security-policy", "")
    assert antwoord.headers.get("access-control-allow-origin") == "*"


def test_projectinfo_widget(site: httpx.Client, organisatie: dict, project: dict):
    antwoord = site.get(_widget_pad(organisatie, project))
    assert antwoord.status_code == 200
    _controleer_inbed_headers(antwoord)
    assert 'class="jottem-widget"' in antwoord.text
    assert "Help mee op Jottem" in antwoord.text


def test_recente_jottems_widget(site: httpx.Client, organisatie: dict, project: dict):
    antwoord = site.get(_widget_pad(organisatie, project, "/recent/3"))
    assert antwoord.status_code == 200
    _controleer_inbed_headers(antwoord)
    assert 'class="jottem-widget"' in antwoord.text


def test_willekeurige_jottems_widget(site: httpx.Client, organisatie: dict, project: dict):
    antwoord = site.get(_widget_pad(organisatie, project, "/willekeurig/4"))
    assert antwoord.status_code == 200
    _controleer_inbed_headers(antwoord)


def test_widget_stijl_neutraal(site: httpx.Client, organisatie: dict, project: dict):
    antwoord = site.get(_widget_pad(organisatie, project), params={"stijl": "neutraal"})
    assert antwoord.status_code == 200
    assert "border-top:3px solid" not in antwoord.text


def test_widget_grenzen(site: httpx.Client, organisatie: dict, project: dict):
    # aantal buiten 1..12 en een onbekende volgorde bestaan niet (D-1)
    assert site.get(_widget_pad(organisatie, project, "/recent/0")).status_code == 404
    assert site.get(_widget_pad(organisatie, project, "/recent/13")).status_code == 404
    assert site.get(_widget_pad(organisatie, project, "/nieuwste/3")).status_code == 404


def test_widget_onbekend_project(site: httpx.Client, organisatie: dict):
    assert site.get(f"/widget/{organisatie['slug']}/bestaat-niet-xyz").status_code == 404


def test_widget_api_endpoint(api: httpx.Client, organisatie: dict, project: dict):
    antwoord = api.get(
        f"/organisatie/{organisatie['slug']}/project/{project['slug']}/widget",
        params={"aantal": 3, "volgorde": "willekeurig"},
    )
    assert antwoord.status_code == 200
    body = antwoord.json()
    assert {"projectId", "naam", "slug", "organisatieSlug", "organisatieNaam",
            "kleurPrimair", "logoUrl", "beschrijving", "oproep", "aantalJottems",
            "cta", "jottems"} <= set(body)
    if body["cta"] is not None:
        assert {"sleutel", "cta"} <= set(body["cta"])
    assert api.get(
        f"/organisatie/{organisatie['slug']}/project/{project['slug']}/widget",
        params={"aantal": 13},
    ).status_code == 422


def test_site_blijft_inbedden_weigeren(site: httpx.Client):
    # de uitzondering geldt alleen voor /widget; de rest van de site blijft DENY sturen
    antwoord = site.get("/")
    assert antwoord.headers.get("x-frame-options") == "DENY"
    assert "frame-ancestors 'none'" in antwoord.headers.get("content-security-policy", "")
