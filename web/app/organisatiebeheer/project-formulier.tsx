"use client";

import { useEffect, useState } from "react";
import { API_PUBLIEK } from "@/lib/api";

export type ProjectVorm = {
  naam: string; slug: string; beschrijving: string; oproep: string; periode: string;
  datasetLicentie: string; status: string; terminologiebronnen: string[];
  afbeelding: string | null; verrijkingen: string[] | null;
};

export const LEEG_PROJECT: ProjectVorm = {
  naam: "", slug: "", beschrijving: "", oproep: "", periode: "",
  datasetLicentie: "https://creativecommons.org/licenses/by/4.0/",
  status: "actief", terminologiebronnen: [], afbeelding: null, verrijkingen: null,
};

type Bron = { uri: string; naam: string; alternatief: string | null };
type Verrijking = { sleutel: string; label: string; cta: string };

// Gedeeld projectformulier voor nieuw en bewerken; de afbeelding-upload werkt alleen
// bij een bestaand project (upload-URL hangt aan het projectId).
export default function ProjectFormulier({
  begin,
  organisatieSlug,
  bewerkProjectId,
  headers,
  opslaanTekst,
  onKlaar,
}: {
  begin: ProjectVorm;
  organisatieSlug: string;
  bewerkProjectId: string | null;
  headers: Record<string, string>;
  opslaanTekst: string;
  onKlaar: (melding: string) => void;
}) {
  const [vorm, setVorm] = useState<ProjectVorm>(begin);
  const [bronnen, setBronnen] = useState<Bron[]>([]);
  const [catalogus, setCatalogus] = useState<Verrijking[]>([]);
  const [melding, setMelding] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_PUBLIEK}/termennetwerk/bronnen`).then((r) => r.json()).then(setBronnen).catch(() => {});
    fetch(`${API_PUBLIEK}/verrijkingen`).then((r) => r.json()).then(setCatalogus).catch(() => {});
  }, []);

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    setMelding(null);
    const pad = bewerkProjectId ? `/project/${bewerkProjectId}` : `/organisatie/${organisatieSlug}/projecten`;
    const r = await fetch(`${API_PUBLIEK}${pad}`, {
      method: bewerkProjectId ? "PUT" : "POST",
      headers,
      body: JSON.stringify({
        ...vorm,
        beschrijving: vorm.beschrijving || null,
        oproep: vorm.oproep || null,
        periode: vorm.periode || null,
      }),
    });
    if (!r.ok) {
      setMelding(`Opslaan mislukt: ${(await r.json()).detail ?? r.statusText}`);
      return;
    }
    onKlaar(bewerkProjectId ? "Project bijgewerkt." : "Project aangemaakt.");
  }

  async function afbeeldingKiezen(bestand: File) {
    const vraag = await fetch(`${API_PUBLIEK}/project/${bewerkProjectId}/afbeelding-upload`, {
      method: "POST", headers,
      body: JSON.stringify({ bestandsnaam: bestand.name, contentType: bestand.type }),
    });
    if (!vraag.ok) { setMelding("Upload-URL aanvragen mislukt"); return; }
    const { objectKey, uploadUrl } = await vraag.json();
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": bestand.type }, body: bestand });
    if (!put.ok) { setMelding("Upload mislukt"); return; }
    setVorm((oud) => ({ ...oud, afbeelding: objectKey }));
    setMelding("Afbeelding geupload; klik op Opslaan om vast te leggen.");
  }

  const veldStijl = { maxHeight: "12rem", overflowY: "auto", border: "1px solid var(--kartonrand)", borderRadius: ".35rem", padding: ".6rem", background: "var(--wit)", fontSize: ".92rem" } as const;

  return (
    <form className="formulier" onSubmit={opslaan}>
      {melding && <p className="memo">{melding}</p>}
      <div className="veld"><label>Naam</label>
        <input type="text" required value={vorm.naam} onChange={(e) => setVorm({ ...vorm, naam: e.target.value })} /></div>
      <div className="veld"><label>Slug</label>
        <input type="text" required value={vorm.slug} onChange={(e) => setVorm({ ...vorm, slug: e.target.value })} /></div>
      <div className="veld"><label>Beschrijving (mag)</label>
        <textarea rows={2} value={vorm.beschrijving} onChange={(e) => setVorm({ ...vorm, beschrijving: e.target.value })} /></div>
      <div className="veld"><label>Oproep (mag)</label>
        <textarea rows={2} value={vorm.oproep} onChange={(e) => setVorm({ ...vorm, oproep: e.target.value })} /></div>
      <div className="veld"><label>Periode (mag, bijv. 1950-2000)</label>
        <input type="text" value={vorm.periode} onChange={(e) => setVorm({ ...vorm, periode: e.target.value })} /></div>
      <div className="veld"><label>Datasetlicentie (URL)</label>
        <input type="text" value={vorm.datasetLicentie} onChange={(e) => setVorm({ ...vorm, datasetLicentie: e.target.value })} /></div>
      <div className="veld"><label>Status</label>
        <select value={vorm.status} onChange={(e) => setVorm({ ...vorm, status: e.target.value })}>
          <option value="actief">actief</option>
          <option value="afgerond">afgerond</option>
        </select></div>
      {bewerkProjectId && (
        <div className="veld"><label>Projectafbeelding uploaden (mag)</label>
          <input type="file" accept="image/*" onChange={(e) => {
            const bestand = e.target.files?.[0];
            if (bestand) afbeeldingKiezen(bestand);
          }} /></div>
      )}
      <div className="veld">
        <label>Terminologiebronnen (NDE Termennetwerk; leeg = alle bronnen)</label>
        <div style={veldStijl}>
          {bronnen.map((bron) => (
            <label key={bron.uri} style={{ display: "block", fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={vorm.terminologiebronnen.includes(bron.uri)}
                onChange={(e) => setVorm((oud) => ({
                  ...oud,
                  terminologiebronnen: e.target.checked
                    ? [...oud.terminologiebronnen, bron.uri]
                    : oud.terminologiebronnen.filter((u) => u !== bron.uri),
                }))}
              />{" "}
              {bron.naam}{bron.alternatief ? ` (${bron.alternatief})` : ""}
            </label>
          ))}
          {bronnen.length === 0 && <em>Bronnenlijst wordt geladen...</em>}
        </div>
      </div>
      <div className="veld">
        <label>Verrijkingen op de jottem-pagina (standaard staan ze allemaal aan)</label>
        <div style={{ ...veldStijl, maxHeight: undefined }}>
          {catalogus.map((verrijking) => {
            const actief = vorm.verrijkingen === null
              ? true
              : vorm.verrijkingen.includes(verrijking.sleutel);
            return (
              <label key={verrijking.sleutel} style={{ display: "block", fontWeight: 400 }} title={verrijking.cta}>
                <input
                  type="checkbox"
                  checked={actief}
                  onChange={(e) => setVorm((oud) => {
                    const huidig = oud.verrijkingen ?? catalogus.map((v) => v.sleutel);
                    return {
                      ...oud,
                      verrijkingen: e.target.checked
                        ? [...huidig.filter((s) => s !== verrijking.sleutel), verrijking.sleutel]
                        : huidig.filter((s) => s !== verrijking.sleutel),
                    };
                  })}
                />{" "}
                {verrijking.label}
              </label>
            );
          })}
          {catalogus.length === 0 && <em>Catalogus wordt geladen...</em>}
        </div>
      </div>
      <div style={{ display: "flex", gap: ".7rem" }}>
        <button className="knop knop-primair" type="submit">{opslaanTekst}</button>
        <a className="knop knop-secundair" href="/organisatiebeheer">Annuleren</a>
      </div>
    </form>
  );
}
