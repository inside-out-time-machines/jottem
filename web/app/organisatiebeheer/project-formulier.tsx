"use client";

import { useEffect, useState } from "react";
import { API_PUBLIEK } from "@/lib/api";
import { KaartSectie, Veld } from "../beheer-ui";

export type ProjectVorm = {
  naam: string; slug: string; beschrijving: string; oproep: string; periode: string;
  datasetLicentie: string; status: string; terminologiebronnen: string[];
  afbeelding: string | null; verrijkingen: string[] | null;
  uploadWijzen: string[] | null;
  zichtbaarheid: "openbaar" | "besloten";
};

export const LEEG_PROJECT: ProjectVorm = {
  naam: "", slug: "", beschrijving: "", oproep: "", periode: "",
  datasetLicentie: "https://creativecommons.org/licenses/by/4.0/",
  status: "actief", terminologiebronnen: [], afbeelding: null, verrijkingen: null,
  uploadWijzen: null, zichtbaarheid: "openbaar",
};

// de vier manieren om materiaal aan te leveren (zelfde sleutels als de API)
export const UPLOAD_WIJZEN = [
  { sleutel: "bestand", label: "Bestand kiezen" },
  { sleutel: "camera", label: "Foto maken met de camera" },
  { sleutel: "beeldbank", label: "Permalink uit een beeldbank" },
  { sleutel: "url", label: "Foto-URL van een website" },
];

// id van het formulier: de Opslaan-knop staat in de actiebalk, buiten het <form>,
// en verwijst er met het form-attribuut naar
export const PROJECT_FORMULIER_ID = "project-formulier";

type Bron = { uri: string; naam: string; alternatief: string | null };
type Verrijking = { sleutel: string; label: string; cta: string };

// Gedeeld projectformulier voor nieuw en bewerken, in drie kaarten (Basis,
// Openbaarheid, Instellingen); de afbeelding-upload werkt alleen bij een bestaand
// project (upload-URL hangt aan het projectId).
export default function ProjectFormulier({
  begin,
  organisatieSlug,
  bewerkProjectId,
  headers,
  onKlaar,
  onMelding,
}: {
  begin: ProjectVorm;
  organisatieSlug: string;
  bewerkProjectId: string | null;
  headers: Record<string, string>;
  onKlaar: (melding: string) => void;
  onMelding: (melding: string | null) => void;
}) {
  const [vorm, setVorm] = useState<ProjectVorm>(begin);
  const [bronnen, setBronnen] = useState<Bron[]>([]);
  const [catalogus, setCatalogus] = useState<Verrijking[]>([]);
  const [zoekBron, setZoekBron] = useState("");

  useEffect(() => {
    fetch(`${API_PUBLIEK}/termennetwerk/bronnen`).then((r) => r.json()).then(setBronnen).catch(() => {});
    fetch(`${API_PUBLIEK}/verrijkingen`).then((r) => r.json()).then(setCatalogus).catch(() => {});
  }, []);

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    onMelding(null);
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
      onMelding(`Opslaan mislukt: ${(await r.json()).detail ?? r.statusText}`);
      return;
    }
    onKlaar(bewerkProjectId ? "Project bijgewerkt." : "Project aangemaakt.");
  }

  async function afbeeldingKiezen(bestand: File) {
    const vraag = await fetch(`${API_PUBLIEK}/project/${bewerkProjectId}/afbeelding-upload`, {
      method: "POST", headers,
      body: JSON.stringify({ bestandsnaam: bestand.name, contentType: bestand.type }),
    });
    if (!vraag.ok) { onMelding("Upload-URL aanvragen mislukt"); return; }
    const { objectKey, uploadUrl } = await vraag.json();
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": bestand.type }, body: bestand });
    if (!put.ok) { onMelding("Upload mislukt"); return; }
    setVorm((oud) => ({ ...oud, afbeelding: objectKey }));
    onMelding("Afbeelding geupload; klik op Opslaan om vast te leggen.");
  }

  const zoek = zoekBron.trim().toLowerCase();
  const getoondeBronnen = zoek
    ? bronnen.filter((b) => `${b.naam} ${b.alternatief ?? ""}`.toLowerCase().includes(zoek))
    : bronnen;

  return (
    <form id={PROJECT_FORMULIER_ID} className="beheer-formulier" onSubmit={opslaan}>
      <KaartSectie titel="Basis" intro="Naam, oproep en status zoals bezoekers ze op de projectpagina zien.">
        <Veld label="Naam" htmlFor="naam">
          <input id="naam" type="text" required value={vorm.naam} onChange={(e) => setVorm({ ...vorm, naam: e.target.value })} />
        </Veld>
        <div className="veld-rij">
          <Veld label="Slug" htmlFor="slug" hint="Voor de adressen: kleine letters en streepjes.">
            <input id="slug" type="text" required pattern="[a-z0-9-]+" value={vorm.slug} onChange={(e) => setVorm({ ...vorm, slug: e.target.value })} />
          </Veld>
          <Veld label="Periode" htmlFor="periode" hint="Mag leeg; bijvoorbeeld 1950-2000.">
            <input id="periode" type="text" value={vorm.periode} onChange={(e) => setVorm({ ...vorm, periode: e.target.value })} />
          </Veld>
        </div>
        <Veld label="Oproep" htmlFor="oproep" hint="Eén of twee zinnen die bezoekers uitnodigen om mee te doen; staat bovenaan de projectpagina.">
          <textarea id="oproep" rows={2} value={vorm.oproep} onChange={(e) => setVorm({ ...vorm, oproep: e.target.value })} />
        </Veld>
        <Veld label="Beschrijving" htmlFor="beschrijving" hint="Mag leeg; achtergrond en doel van het project.">
          <textarea id="beschrijving" rows={3} value={vorm.beschrijving} onChange={(e) => setVorm({ ...vorm, beschrijving: e.target.value })} />
        </Veld>
        <div className="veld-rij">
          <Veld label="Datasetlicentie" htmlFor="licentie" hint="URL van de licentie die inzenders bij het uploaden bevestigen.">
            <input id="licentie" type="url" value={vorm.datasetLicentie} onChange={(e) => setVorm({ ...vorm, datasetLicentie: e.target.value })} />
          </Veld>
          <Veld label="Status" htmlFor="status" hint="Een afgerond project staat niet meer op de startpagina en neemt geen uploads aan.">
            <select id="status" value={vorm.status} onChange={(e) => setVorm({ ...vorm, status: e.target.value })}>
              <option value="actief">actief</option>
              <option value="afgerond">afgerond</option>
            </select>
          </Veld>
        </div>
        {bewerkProjectId && (
          <Veld label="Projectafbeelding" htmlFor="afbeelding" hint={vorm.afbeelding ? "Er staat een afbeelding; kies een bestand om die te vervangen." : "Mag leeg; wordt getoond op de start- en organisatiepagina."}>
            <input id="afbeelding" type="file" accept="image/*" onChange={(e) => {
              const bestand = e.target.files?.[0];
              if (bestand) afbeeldingKiezen(bestand);
            }} />
          </Veld>
        )}
      </KaartSectie>

      <KaartSectie titel="Openbaarheid" intro="Wie de gepubliceerde jottems mag zien. De projectinformatie en de open data blijven altijd openbaar.">
        <div className="keuzes-kader">
          <div className="keuzes keuzes-een">
            <label>
              <input type="radio" name="zichtbaarheid" value="openbaar"
                     checked={vorm.zichtbaarheid === "openbaar"}
                     onChange={() => setVorm({ ...vorm, zichtbaarheid: "openbaar" })} />
              <span>Openbaar <span className="keuze-uitleg">(standaard): iedereen ziet de gepubliceerde jottems</span></span>
            </label>
            <label>
              <input type="radio" name="zichtbaarheid" value="besloten"
                     checked={vorm.zichtbaarheid === "besloten"}
                     onChange={() => setVorm({ ...vorm, zichtbaarheid: "besloten" })} />
              <span>Besloten <span className="keuze-uitleg">: alleen uitgenodigde leden, en de beheerders en moderatoren van je organisatie, zien de jottems</span></span>
            </label>
          </div>
        </div>
      </KaartSectie>

      <KaartSectie titel="Instellingen" intro="Wat inzenders en annoteerders in dit project kunnen doen.">
        <Veld label="Terminologiebronnen" hint="Bronnen uit het NDE Termennetwerk waaruit term-URI's gekozen kunnen worden; niets aangevinkt = alle bronnen.">
          <div className="keuzes-kader">
            <input type="search" className="zoekveld" placeholder="Zoek een bron..." value={zoekBron}
                   onChange={(e) => setZoekBron(e.target.value)} aria-label="Zoek in de bronnenlijst" />
            <div className="keuzes keuzes-scroll">
              {getoondeBronnen.map((bron) => (
                <label key={bron.uri}>
                  <input
                    type="checkbox"
                    checked={vorm.terminologiebronnen.includes(bron.uri)}
                    onChange={(e) => setVorm((oud) => ({
                      ...oud,
                      terminologiebronnen: e.target.checked
                        ? [...oud.terminologiebronnen, bron.uri]
                        : oud.terminologiebronnen.filter((u) => u !== bron.uri),
                    }))}
                  />
                  <span>{bron.naam}{bron.alternatief ? <span className="keuze-uitleg"> ({bron.alternatief})</span> : null}</span>
                </label>
              ))}
              {bronnen.length === 0 && <em className="beheer-leeg">Bronnenlijst wordt geladen...</em>}
              {bronnen.length > 0 && getoondeBronnen.length === 0 && <em className="beheer-leeg">Geen bron gevonden.</em>}
            </div>
          </div>
        </Veld>
        <Veld label="Verrijkingen op de jottem-pagina" hint="Welke oproepen tot bijdragen bezoekers bij een jottem zien; standaard staan ze allemaal aan.">
          <div className="keuzes-kader">
            <div className="keuzes">
              {catalogus.map((verrijking) => {
                const actief = vorm.verrijkingen === null
                  ? true
                  : vorm.verrijkingen.includes(verrijking.sleutel);
                return (
                  <label key={verrijking.sleutel} title={verrijking.cta}>
                    <input
                      type="checkbox"
                      checked={actief}
                      onChange={(e) => setVorm((oud) => {
                        const huidig = oud.verrijkingen ?? catalogus.map((v) => v.sleutel);
                        const nieuw = e.target.checked
                          ? [...huidig.filter((s) => s !== verrijking.sleutel), verrijking.sleutel]
                          : huidig.filter((s) => s !== verrijking.sleutel);
                        return { ...oud, verrijkingen: nieuw };
                      })}
                    />
                    <span>{verrijking.label}</span>
                  </label>
                );
              })}
              {catalogus.length === 0 && <em className="beheer-leeg">Catalogus wordt geladen...</em>}
            </div>
          </div>
        </Veld>
        <Veld label="Uploadwijzen" hint="Hoe inzenders materiaal kunnen aanleveren; minimaal één, standaard alle vier.">
          <div className="keuzes-kader">
            <div className="keuzes">
              {UPLOAD_WIJZEN.map((wijze) => {
                const huidig = vorm.uploadWijzen ?? UPLOAD_WIJZEN.map((w) => w.sleutel);
                const actief = huidig.includes(wijze.sleutel);
                return (
                  <label key={wijze.sleutel}>
                    <input
                      type="checkbox"
                      checked={actief}
                      onChange={(e) => setVorm((oud) => {
                        const oudeWijzen = oud.uploadWijzen ?? UPLOAD_WIJZEN.map((w) => w.sleutel);
                        const nieuw = e.target.checked
                          ? [...oudeWijzen.filter((s) => s !== wijze.sleutel), wijze.sleutel]
                          : oudeWijzen.filter((s) => s !== wijze.sleutel);
                        if (nieuw.length === 0) {
                          onMelding("Er moet minimaal één uploadwijze aan staan.");
                          return oud;
                        }
                        return { ...oud, uploadWijzen: nieuw };
                      })}
                    />
                    <span>{wijze.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </Veld>
      </KaartSectie>
    </form>
  );
}
