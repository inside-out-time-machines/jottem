"use client";

import { useState } from "react";
import { API_PUBLIEK } from "@/lib/api";
import { KaartSectie, Veld } from "../beheer-ui";

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

// id van het formulier: de Opslaan-knop staat in de actiebalk (form-attribuut)
export const ORGANISATIE_FORMULIER_ID = "organisatie-formulier";

const KLEUREN = [
  { veld: "kleurPrimair", label: "Primair", uitleg: "koppen en bies" },
  { veld: "kleurSecundair", label: "Secundair", uitleg: "knoppen" },
  { veld: "kleurAchtergrond", label: "Achtergrond", uitleg: "pagina" },
] as const;

// Gedeeld formulier voor /beheer/nieuw en /beheer/[slug], in drie kaarten (Basis,
// Publisher, Huisstijl); huisstijl-uploads alleen bij een bestaande organisatie (de
// upload-URL hangt aan de slug).
export default function OrganisatieFormulier({
  begin,
  bewerkSlug,
  headers,
  onKlaar,
  onMelding,
  logoUrl,
  faviconUrl,
}: {
  begin: OrganisatieVorm;
  bewerkSlug: string | null;
  headers: Record<string, string>;
  onKlaar: (melding: string) => void;
  onMelding: (melding: string | null) => void;
  logoUrl?: string | null;
  faviconUrl?: string | null;
}) {
  const [vorm, setVorm] = useState<OrganisatieVorm>(begin);
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
    onMelding(null);
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
      onMelding(`Opslaan mislukt: ${(f as Error).message}`);
    }
  }

  return (
    <form id={ORGANISATIE_FORMULIER_ID} className="beheer-formulier" onSubmit={opslaan}>
      <KaartSectie titel="Basis" intro="Naam en beschrijving zoals bezoekers ze op de organisatiepagina zien.">
        <div className="veld-rij">
          <Veld label="Naam" htmlFor="naam">
            <input id="naam" type="text" required value={vorm.naam} onChange={(e) => setVorm({ ...vorm, naam: e.target.value })} />
          </Veld>
          <Veld label="Slug" htmlFor="slug" hint="Voor de adressen: kleine letters en streepjes.">
            <input id="slug" type="text" required pattern="[a-z0-9-]+" value={vorm.slug} onChange={(e) => setVorm({ ...vorm, slug: e.target.value })} />
          </Veld>
        </div>
        <Veld label="Beschrijving" htmlFor="beschrijving" hint="Mag leeg; wie de organisatie is en wat ze verzamelt.">
          <textarea id="beschrijving" rows={3} value={vorm.beschrijving} onChange={(e) => setVorm({ ...vorm, beschrijving: e.target.value })} />
        </Veld>
        <Veld label="Website" htmlFor="website" hint="Mag leeg; volledige URL met https://.">
          <input id="website" type="url" value={vorm.website} onChange={(e) => setVorm({ ...vorm, website: e.target.value })} />
        </Veld>
      </KaartSectie>

      <KaartSectie titel="Publisher" intro="Gegevens die als uitgever in de datasetbeschrijvingen van de projecten terechtkomen (NDE Datasetregister).">
        <div className="veld-rij">
          <Veld label="E-mailadres" htmlFor="email" hint="Publiek contactadres van de organisatie.">
            <input id="email" type="email" required value={vorm.email} onChange={(e) => setVorm({ ...vorm, email: e.target.value })} />
          </Veld>
          <Veld label="Identifier" htmlFor="identifier" hint="Mag leeg; bijvoorbeeld een ISIL- of KvK-nummer.">
            <input id="identifier" type="text" value={vorm.identifier} onChange={(e) => setVorm({ ...vorm, identifier: e.target.value })} />
          </Veld>
        </div>
        <div className="veld" style={{ position: "relative" }}>
          <label htmlFor="plaats">Plaats</label>
          {vorm.spatialUri ? (
            <span className="kleurstaal">
              <a href={vorm.spatialUri} target="_blank" rel="noreferrer">{vorm.spatialNaam || vorm.spatialUri}</a>
              <button
                type="button" className="knop knop-secundair" style={{ padding: ".1rem .5rem" }}
                onClick={() => { setVorm({ ...vorm, spatialUri: "", spatialNaam: "" }); setPlaatsZoek(""); }}
                aria-label="Plaats wissen"
              >×</button>
            </span>
          ) : (
            <>
              <input
                id="plaats" type="text" placeholder="bijv. Gouda" value={plaatsZoek}
                onChange={(e) => plaatsZoeken(e.target.value)} autoComplete="off"
              />
              {plaatsSuggesties.length > 0 && (
                <ul className="zoeklijst" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, boxShadow: "var(--schaduw)" }}>
                  {plaatsSuggesties.map((s) => (
                    <li key={s.uri}>
                      <button
                        type="button"
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
          <p className="hint">Mag leeg; GeoNames via het NDE Termennetwerk, wordt de spatialCoverage van de datasets en het startpunt van de kaart.</p>
        </div>
      </KaartSectie>

      <KaartSectie titel="Huisstijl" intro="De organisatiekleuren komen over de Jottem-basislaag heen; logo en favicon staan op de organisatie- en projectpagina's.">
        <div className="veld-rij">
          {KLEUREN.map(({ veld, label, uitleg }) => (
            <Veld key={veld} label={label} htmlFor={veld} hint={uitleg}>
              <span className="kleurstaal">
                <input
                  id={veld}
                  type="color"
                  value={vorm[veld] ?? "#d85a30"}
                  onChange={(e) => setVorm({ ...vorm, [veld]: e.target.value })}
                />
                <code>{vorm[veld]}</code>
              </span>
            </Veld>
          ))}
        </div>
        {bewerkSlug ? (
          // onder elkaar, niet naast elkaar: een breed logo plus de bestandskiezer
          // past niet in een halve kolom
          <div className="kaart-inhoud" style={{ marginTop: 0 }}>
            {(["logo", "favicon"] as const).map((soort) => {
              const huidig = soort === "logo" ? logoUrl : faviconUrl;
              return (
                <Veld key={soort} label={soort === "logo" ? "Logo" : "Favicon"} htmlFor={`bestand-${soort}`}
                      hint={huidig ? "Kies een bestand om het huidige te vervangen." : "Nog niet geüpload; PNG of SVG."}>
                  <span className="kleurstaal">
                    {huidig && <img src={huidig} alt="" className="bestand-voorbeeld" />}
                    <input
                      id={`bestand-${soort}`}
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const bestand = e.target.files?.[0];
                        if (!bestand) return;
                        try {
                          const sleutel = await huisstijlBestand(soort, bestand);
                          setVorm((oud) => ({ ...oud, [soort]: sleutel }));
                          onMelding(`${soort === "logo" ? "Logo" : "Favicon"} geüpload; klik op Opslaan om vast te leggen.`);
                        } catch (f) {
                          onMelding((f as Error).message);
                        }
                      }}
                    />
                  </span>
                </Veld>
              );
            })}
          </div>
        ) : (
          <p className="hint">Logo en favicon kun je na het aanmaken uploaden via Bewerken.</p>
        )}
      </KaartSectie>
    </form>
  );
}
