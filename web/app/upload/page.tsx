"use client";

import { useEffect, useState } from "react";
import { API_PUBLIEK, devHeaders } from "@/lib/api";

type Project = { projectId: string; naam: string; datasetLicentie: string | null };
type Organisatie = { naam: string; projecten: Project[] };

export default function UploadPagina() {
  const [organisaties, setOrganisaties] = useState<Organisatie[]>([]);
  const [bestand, setBestand] = useState<File | null>(null);
  const [projectId, setProjectId] = useState("");
  const [titel, setTitel] = useState("");
  const [beschrijving, setBeschrijving] = useState("");
  const [licentieAkkoord, setLicentieAkkoord] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    fetch(`${API_PUBLIEK}/organisaties`)
      .then((r) => r.json())
      .then(setOrganisaties)
      .catch(() => setMelding("De API is niet bereikbaar."));
  }, []);

  const projecten = organisaties.flatMap((o) =>
    o.projecten.map((p) => ({ ...p, organisatie: o.naam })),
  );
  const gekozen = projecten.find((p) => p.projectId === projectId);

  async function versturen(e: React.FormEvent) {
    e.preventDefault();
    if (!bestand || !projectId || !titel || !licentieAkkoord) {
      setMelding("Vul alles in en bevestig de licentie.");
      return;
    }
    setBezig(true);
    setMelding(null);
    try {
      const headers = { "Content-Type": "application/json", ...devHeaders("dev-anna", "Anna Uploader") };
      const urlAntwoord = await fetch(`${API_PUBLIEK}/upload-url`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          bestandsnaam: bestand.name,
          contentType: bestand.type,
          grootte: bestand.size,
        }),
      });
      if (!urlAntwoord.ok) throw new Error((await urlAntwoord.json()).detail ?? urlAntwoord.statusText);
      const { mediaId, uploadUrl } = await urlAntwoord.json();

      const putAntwoord = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": bestand.type },
        body: bestand,
      });
      if (!putAntwoord.ok) throw new Error(`Upload naar opslag mislukt (${putAntwoord.status})`);

      const indienAntwoord = await fetch(`${API_PUBLIEK}/jottem`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          mediaId,
          projectId,
          titel,
          beschrijving: beschrijving || null,
          licentieBevestigd: licentieAkkoord,
          steekwoorden: [],
          metadata: {},
        }),
      });
      if (!indienAntwoord.ok) throw new Error((await indienAntwoord.json()).detail ?? indienAntwoord.statusText);
      setMelding("Gelukt! Je jottem staat in de wachtrij voor de moderator. Jottem!");
      setBestand(null);
      setTitel("");
      setBeschrijving("");
      setLicentieAkkoord(false);
    } catch (fout) {
      setMelding(`Er ging iets mis: ${(fout as Error).message}`);
    } finally {
      setBezig(false);
    }
  }

  return (
    <main>
      <h1>Deel je materiaal</h1>
      <p style={{ maxWidth: "40rem", marginTop: ".8rem" }}>
        Kies je foto (JPG, PNG of TIFF, tot 50 MB), vertel er kort iets bij en
        kies het project. Een moderator bekijkt je bijdrage voordat hij online
        komt.
      </p>
      <form className="formulier" onSubmit={versturen}>
        <div className="veld">
          <label htmlFor="bestand">Bestand</label>
          <input
            id="bestand"
            type="file"
            accept="image/jpeg,image/png,image/tiff"
            onChange={(e) => setBestand(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="veld">
          <label htmlFor="project">Project</label>
          <select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Kies een project</option>
            {projecten.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.organisatie}: {p.naam}
              </option>
            ))}
          </select>
        </div>
        <div className="veld">
          <label htmlFor="titel">Titel</label>
          <input id="titel" type="text" value={titel} onChange={(e) => setTitel(e.target.value)} />
        </div>
        <div className="veld">
          <label htmlFor="beschrijving">Vertel er iets bij (mag)</label>
          <textarea
            id="beschrijving"
            rows={4}
            value={beschrijving}
            onChange={(e) => setBeschrijving(e.target.value)}
          />
        </div>
        <label style={{ fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={licentieAkkoord}
            onChange={(e) => setLicentieAkkoord(e.target.checked)}
          />{" "}
          Ik ga akkoord met de licentie van het project
          {gekozen?.datasetLicentie ? ` (${gekozen.datasetLicentie})` : ""}
        </label>
        <button className="knop knop-primair" type="submit" disabled={bezig}>
          {bezig ? "Bezig..." : "Verstuur je jottem"}
        </button>
      </form>
      {melding && <p className="memo" style={{ marginTop: "1.2rem" }}>{melding}</p>}
    </main>
  );
}
