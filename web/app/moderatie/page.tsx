"use client";

import { useCallback, useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";

type Jottem = {
  mediaId: string;
  titel: string;
  status: string;
  genre: string | null;
  creatieDatum: string;
  afkeurReden: string | null;
  duurzameUrl: string | null;
  herkenbaar: boolean | null;
  toestemming: string | null;
};

const ORGANISATIE = "samh"; // fundament: één organisatie; later uit de ingelogde rol

type MeldingRij = {
  meldingId: number;
  mediaId: string | null;
  annotatieIri: string;
  reden: string;
  toelichting: string | null;
  status: string;
  creatieDatum: string;
  annotatie: {
    body?: { type?: string; value?: string; format?: string }[] | { type?: string; value?: string };
    creator?: { name?: string };
  } | null;
};

function annotatieTekst(rij: MeldingRij): string {
  const body = rij.annotatie?.body;
  const lijst = Array.isArray(body) ? body : body ? [body] : [];
  const tekst = lijst.find((b) => b.type === "TextualBody" && b.value)?.value;
  return tekst ?? "(geen tekstinhoud)";
}

export default function ModeratiePagina() {
  const [jottems, setJottems] = useState<Jottem[]>([]);
  const [meldingen, setMeldingen] = useState<MeldingRij[]>([]);
  const [melding, setMelding] = useState<string | null>(null);
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);

  useEffect(() => {
    setIngelogd(isIngelogd());
  }, []);

  const headers = { "Content-Type": "application/json", ...authHeaders("dev-mona", "Mona Moderator") };

  const laden = useCallback(() => {
    if (!isIngelogd()) return;
    fetch(`${API_PUBLIEK}/organisatie/${ORGANISATIE}/moderatie/jottems`, { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
        return r.json();
      })
      .then(setJottems)
      .catch((fout) => setMelding(`Wachtrij laden mislukt: ${fout.message}`));
    fetch(`${API_PUBLIEK}/organisatie/${ORGANISATIE}/meldingen`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then(setMeldingen)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(laden, [laden]);

  async function beoordeel(mediaId: string, besluit: "goedgekeurd" | "afgekeurd") {
    let reden: string | null = null;
    if (besluit === "afgekeurd") {
      reden = window.prompt("Reden van afkeuring (verplicht):");
      if (!reden) return;
    }
    const antwoord = await fetch(`${API_PUBLIEK}/jottem/${mediaId}/status`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ besluit, reden }),
    });
    if (!antwoord.ok) {
      setMelding(`Beoordelen mislukt: ${(await antwoord.json()).detail ?? antwoord.statusText}`);
      return;
    }
    setMelding(besluit === "goedgekeurd" ? "Goedgekeurd en gepubliceerd." : "Afgekeurd; de uploader krijgt een mail met de reden.");
    laden();
  }

  if (ingelogd === null) {
    return <main><h1>Moderatie</h1></main>;
  }
  if (!ingelogd) {
    return (
      <main>
        <h1>Moderatie</h1>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin("/moderatie")}>
            Log in als moderator
          </button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Moderatie</h1>
      <p style={{ marginTop: ".5rem" }}>
        Alle jottems van <strong>Streekarchief Midden-Holland</strong>.
      </p>
      {melding && <p className="memo" style={{ marginTop: "1rem" }}>{melding}</p>}
      <table className="lijst stapel">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Status</th>
            <th>Ingediend</th>
            <th>Actie</th>
          </tr>
        </thead>
        <tbody>
          {jottems.map((jottem) => (
            <tr key={jottem.mediaId}>
              <td data-label="Titel">
                <a href={`/jottem/${jottem.mediaId}`}>{jottem.titel}</a>
                {jottem.herkenbaar && (
                  <div>
                    <span
                      className={`status-pil ${jottem.toestemming === "ja" ? "status-goedgekeurd" : "status-afgekeurd"}`}
                      title="Signaal van de Herkenbaar API plus de verklaring van de uploader"
                    >
                      herkenbaar · toestemming: {jottem.toestemming}
                    </span>
                  </div>
                )}
                {jottem.afkeurReden && (
                  <div style={{ fontSize: ".85rem", color: "var(--grijs)" }}>
                    reden: {jottem.afkeurReden}
                  </div>
                )}
              </td>
              <td data-label="Status">
                <span className={`status-pil status-${jottem.status}`}>{jottem.status}</span>
              </td>
              <td data-label="Ingediend">{new Date(jottem.creatieDatum).toLocaleDateString("nl-NL")}</td>
              <td>
                {jottem.status === "nieuw" && (
                  <span style={{ display: "flex", gap: ".5rem" }}>
                    <button className="knop knop-primair" onClick={() => beoordeel(jottem.mediaId, "goedgekeurd")}>
                      Goedkeuren
                    </button>
                    <button className="knop knop-secundair" onClick={() => beoordeel(jottem.mediaId, "afgekeurd")}>
                      Afkeuren
                    </button>
                  </span>
                )}
                {jottem.duurzameUrl && <a href={jottem.duurzameUrl}>bekijk</a>}
              </td>
            </tr>
          ))}
          {jottems.length === 0 && (
            <tr>
              <td colSpan={4}>Geen jottems in de wachtrij.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 style={{ marginTop: "2.5rem" }}>Meldingen op annotaties en reacties</h2>
      <p style={{ marginTop: ".4rem", fontSize: ".95rem", color: "var(--grijs)" }}>
        Bezoekers kunnen bijdragen rapporteren (ook zonder account). Verbergen of
        verwijderen haalt de bijdrage uit de publieke weergave; alles wordt gelogd.
      </p>
      <table className="lijst stapel">
        <thead>
          <tr>
            <th>Bijdrage</th>
            <th>Reden</th>
            <th>Gemeld op</th>
            <th>Status / actie</th>
          </tr>
        </thead>
        <tbody>
          {meldingen.map((rij) => (
            <tr key={rij.meldingId}>
              <td data-label="Bijdrage" style={{ maxWidth: "22rem" }}>
                <em>&ldquo;{annotatieTekst(rij).slice(0, 160)}&rdquo;</em>
                {rij.annotatie?.creator?.name && (
                  <div style={{ fontSize: ".85rem", color: "var(--grijs)" }}>door {rij.annotatie.creator.name}</div>
                )}
                {rij.mediaId && (
                  <div style={{ fontSize: ".85rem" }}><a href={`/jottem/${rij.mediaId}`}>bekijk de jottem</a></div>
                )}
              </td>
              <td data-label="Reden">
                {rij.reden}
                {rij.toelichting && (
                  <div style={{ fontSize: ".85rem", color: "var(--grijs)" }}>{rij.toelichting}</div>
                )}
              </td>
              <td data-label="Gemeld op">{new Date(rij.creatieDatum).toLocaleDateString("nl-NL")}</td>
              <td>
                {rij.status === "nieuw" ? (
                  <span style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                    <button className="knop knop-secundair" onClick={() => besluitMelding(rij, "verborgen")}>Verberg</button>
                    <button className="knop knop-secundair" onClick={() => besluitMelding(rij, "verwijderd")}>Verwijder</button>
                    <button className="knop knop-secundair" onClick={() => besluitMelding(rij, "afgewezen")}>Wijs af</button>
                  </span>
                ) : (
                  <span className="status-pil status-gedepubliceerd">{rij.status}</span>
                )}
              </td>
            </tr>
          ))}
          {meldingen.length === 0 && (
            <tr>
              <td colSpan={4}>Geen meldingen.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );

  async function besluitMelding(rij: MeldingRij, besluit: "verwijderd" | "verborgen" | "afgewezen") {
    const r = await fetch(`${API_PUBLIEK}/melding/${rij.meldingId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ besluit }),
    });
    if (!r.ok) {
      setMelding(`Afhandelen mislukt: ${(await r.json()).detail ?? r.statusText}`);
      return;
    }
    setMelding(
      besluit === "afgewezen"
        ? "Melding afgewezen; de bijdrage blijft staan."
        : "De bijdrage is uit de publieke weergave gehaald.",
    );
    laden();
  }
}
