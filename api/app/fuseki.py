"""Fuseki-client: named graph per project, herbouwd via het Graph Store Protocol.

De worker herbouwt bij elke relevante mutatie de volledige projectgraaf (idempotent en
eenvoudig; op pilotschaal ruim snel genoeg). Depublicatie of een leeg project betekent:
graaf weg. Publiek is alleen het /sparql-leespad (Traefik); schrijven kan uitsluitend
intern.
"""
import httpx
from sqlalchemy.orm import Session

from . import rdf
from .config import settings
from .models import Project


def _graph_url(graaf_iri: str) -> str:
    return f"{settings().fuseki_url}/data?graph={graaf_iri}"


def sync_project_graaf(db: Session, project: Project) -> int:
    """Herbouw de named graph van een project; retourneert het aantal jottems."""
    documenten = rdf.project_jsonld(db, project)
    graaf_iri = rdf.dataset_uri(project.projectId)
    with httpx.Client(timeout=60) as client:
        if not documenten:
            client.delete(_graph_url(graaf_iri))
            return 0
        triples = rdf.serialiseer(documenten, "nt")
        antwoord = client.put(
            _graph_url(graaf_iri), content=triples,
            headers={"Content-Type": "application/n-triples"},
        )
        antwoord.raise_for_status()
    return len(documenten)


def verwijder_project_graaf(project_id) -> None:
    with httpx.Client(timeout=30) as client:
        client.delete(_graph_url(rdf.dataset_uri(project_id)))
