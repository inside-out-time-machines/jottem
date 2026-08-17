"use client";

import { useState } from "react";
import { API_PUBLIEK } from "@/lib/api";

export type OrganisatieVorm = {
  naam: string; slug: string; beschrijving: string; website: string; email: string;
  identifier: string; spatialUri: string; spatialNaam: string;
  kleurPrimair: string; kleurSecundair: string; kleurAchtergrond: string;
  logo: string | null; favicon: string | null;
};

export const LEGE_ORGANISATIE: OrganisatieVorm = {
  naam: "", slug: "", beschrijving: "", website: "", email: "", identifier: "",
  spatialUri: "", spatialNaam: "",
  kleurPrimair: "#d85a30", kleurSecundair: "#a2401f", kleurAchtergrond: "#faf6f1",
  logo: null, favicon: null,
};

// Gedeeld formulier voor /beheer/nieuw en /beheer/[slug]; huisstijl-uploads alleen
// bij een bestaande organisatie (de upload-URL hangt aan de slug).
export default function OrganisatieFormulier({
  begin,
  bewerkSlug,
  headers,
  opslaanTekst,
  onKlaar,
}: {
  begin: OrganisatieVorm;
  bewerkSlug: string | null;
  headers: Record<string, string>;
  opslaanTekst: string;
  onKlaar: (melding: string) => void;
}) {
  const [vorm, setVorm] = useState<OrganisatieVorm>(begin);
  const [melding, setMelding] = useState<string | null>(null);
  // plaats-zoeker (GeoNames via het Termennetwerk) voor schema:spatialCoverage
  const [plaatsZoek, setPlaatsZoek] = useState("");
  const [plaatsSuggesties, setPlaatsSuggesties] = useState<{ uri: string; label: string }[]>([]);

  async function plaatsZoeken(tekst: string) {
    setPlaatsZoek(tekst);
    if (tekst.trim().length < 2) { setPlaatsSuggesties([]); return; }
    const r = await fetch(`${API_PUBLIEK}/termennetwerk/zoek?bron=geonames&query=${encodeURIComponent(tekst.trim())}`);
    if (r.ok) setPlaatsSuggesties((await r.json()).slice(0, 8));
  }

  async function huisstijlBestand(soort: "logo" | "favicon", bestand: File) {
    const vraag = await fetch(`${API_PUBLIEK}/organisatie/${bewerkSlug}/huisstijl-upload`, {
      method: "POST", headers,
      body: JSON.stringify({ soort, bestandsnaam: bestand.name, contentType: bestand.type }),
    });
    if (!vraag.ok) throw new Error("Upload-URL aanvragen mislukt");
    const { objectKey, uploadUrl } = await vraag.json();
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": bestand.type }, body: bestand });
    if (!put.ok) throw new Error("Upload mislukt");
    return objectKey as string;
  }

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    setMelding(null);
    try {
      const pad = bewerkSlug ? `/organisatie/${bewerkSlug}` : "/organisatie";
      const r = await fetch(`${API_PUBLIEK}${pad}`, {
        method: bewerkSlug ? "PUT" : "POST",
        headers,
        body: JSON.stringify({
          ...vorm,
          beschrijving: vorm.beschrijving || null,
          website: vorm.website || null,
          identifier: vorm.identifier || null,
          spatialUri: vorm.spatialUri || null,
          spatialNaam: vorm.spatialNaam || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      onKlaar(bewerkSlug ? "Organisatie bijgewerkt." : "Organisatie aangemaakt, met automatisch een eerste project.");
    } catch (f) {
      setMelding(`Opslaan mislukt: ${(f as Error).message}`);
    }
  }

  return (
    <form className="formulier" onSubmit={opslaan}>
      {melding && <p className="memo">{melding}</p>}
      <div className="veld">
        <label htmlFor="naam">Naam</label>
        <input id="naam" type="text" required value={vorm.naam} onChange={(e) => setVorm({ ...vorm, naam: e.target.value })} />
      </div>
      <div className="veld">
        <label htmlFor="slug">Slug (voor de adressen, kleine letters en streepjes)</label>
        <input id="slug" type="text" required value={vorm.slug} onChange={(e) => setVorm({ ...vorm, slug: e.target.value })} />
      </div>
      <div className="veld">
        <label htmlFor="beschrijving">Beschrijving (mag)</label>
        <textarea id="beschrijving" rows={2} value={vorm.beschrijving} onChange={(e) => setVorm({ ...vorm, beschrijving: e.target.value })} />
      </div>
      <div className="veld">
        <label htmlFor="website">Website (mag)</label>
        <input id="website" type="text" value={vorm.website} onChange={(e) => setVorm({ ...vorm, website: e.target.value })} />
      </div>
      <div className="veld">
        <label htmlFor="email">E-mailadres (publiek contactadres, staat als publisher in de datasetbeschrijving)</label>
        <input id="email" type="email" required value={vorm.email} onChange={(e) => setVorm({ ...vorm, email: e.target.value })} />
      </div>
      <div className="veld">
        <label htmlFor="identifier">Identifier (mag, bijv. ISIL of KvK-nummer; staat bij de publisher in de datasetbeschrijving)</label>
        <input id="identifier" type="text" value={vorm.identifier} onChange={(e) => setVorm({ ...vorm, identifier: e.target.value })} />
      </div>
      <div className="veld" style={{ position: "relative" }}>
        <label htmlFor="plaats">Plaats (mag; GeoNames via het NDE Termennetwerk, wordt spatialCoverage in de datasetbeschrijvingen)</label>
        {vorm.spatialUri ? (
          <span style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".95rem" }}>
            <a href={vorm.spatialUri} target="_blank" rel="noreferrer">{vorm.spatialNaam || vorm.spatialUri}</a>
            <button
              type="button" className="knop knop-secundair" style={{ padding: ".1rem .5rem" }}
              onClick={() => { setVorm({ ...vorm, spatialUri: "", spatialNaam: "" }); setPlaatsZoek(""); }}
            >×</button>
          </span>
        ) : (
          <>
            <input
              id="plaats" type="text" placeholder="bijv. Gouda" value={plaatsZoek}
              onChange={(e) => plaatsZoeken(e.target.value)} autoComplete="off"
            />
            {plaatsSuggesties.length > 0 && (
              <ul style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, listStyle: "none", margin: 0, padding: ".2rem", background: "var(--wit)", border: "1px solid var(--kartonrand)", borderRadius: ".35rem", boxShadow: "var(--schaduw)", maxHeight: "12rem", overflowY: "auto" }}>
                {plaatsSuggesties.map((s) => (
                  <li key={s.uri}>
                    <button
                      type="button"
                      style={{ width: "100%", textAlign: "left", padding: ".3rem .5rem", background: "none", border: "none", cursor: "pointer", font: "inherit" }}
                      onClick={() => { setVorm({ ...vorm, spatialUri: s.uri, spatialNaam: s.label }); setPlaatsSuggesties([]); }}
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
        {(["kleurPrimair", "kleurSecundair", "kleurAchtergrond"] as const).map((veld) => (
          <label key={veld} style={{ fontWeight: 600, fontSize: ".95rem" }}>
            {veld.replace("kleur", "")}<br />
            <input
              type="color"
              value={vorm[veld] ?? "#d85a30"}
              onChange={(e) => setVorm({ ...vorm, [veld]: e.target.value })}
              style={{ width: "4rem", height: "2.4rem", border: "1px solid var(--kartonrand)", borderRadius: ".3rem" }}
            />
          </label>
        ))}
      </div>
      {bewerkSlug && (
        <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
          {(["logo", "favicon"] as const).map((soort) => (
            <label key={soort} style={{ fontWeight: 600, fontSize: ".95rem" }}>
              {soort} uploaden<br />
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const bestand = e.target.files?.[0];
                  if (!bestand) return;
                  try {
                    const sleutel = await huisstijlBestand(soort, bestand);
                    setVorm((oud) => ({ ...oud, [soort]: sleutel }));
                    setMelding(`${soort} geupload; klik op Opslaan om vast te leggen.`);
                  } catch (f) {
                    setMelding((f as Error).message);
                  }
                }}
              />
            </label>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: ".7rem" }}>
        <button className="knop knop-primair" type="submit">{opslaanTekst}</button>
        <a className="knop knop-secundair" href="/beheer">Annuleren</a>
      </div>
    </form>
  );
}
