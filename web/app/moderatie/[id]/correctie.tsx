"use client";

import { useState } from "react";
import { API_PUBLIEK, authHeaders } from "@/lib/api";
import { KaartSectie, Veld } from "../../beheer-ui";

// Gegevens van een gepubliceerde jottem corrigeren (MO-8). De inzender kan dat zelf niet
// (UP-3) en een correctie-annotatie bereikt kaart, RDF en IIIF niet: die lezen de metadata.
type Gegevens = {
  mediaId: string;
  titel: string;
  beschrijving: string | null;
  genre: string | null;
  metadata: Record<string, string>;
};

const VELDEN: { sleutel: string; label: string }[] = [
  { sleutel: "jaarVan", label: "Van jaar" },
  { sleutel: "jaarTot", label: "Tot jaar" },
  { sleutel: "datering", label: "Datering" },
  { sleutel: "vervaardiger", label: "Vervaardiger" },
  { sleutel: "lat", label: "Breedtegraad (speld)" },
  { sleutel: "lon", label: "Lengtegraad (speld)" },
];

export default function Correctie({ gegevens, onOpgeslagen }: {
  gegevens: Gegevens; onOpgeslagen: (melding: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [titel, setTitel] = useState(gegevens.titel);
  const [beschrijving, setBeschrijving] = useState(gegevens.beschrijving ?? "");
  const [genre, setGenre] = useState(gegevens.genre ?? "");
  const [velden, setVelden] = useState<Record<string, string>>(
    Object.fromEntries(VELDEN.map((v) => [v.sleutel, gegevens.metadata[v.sleutel] ?? ""])));
  const [steekwoorden, setSteekwoorden] = useState(gegevens.metadata.steekwoord ?? "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  if (!open) {
    return (
      <KaartSectie titel="Gegevens corrigeren"
                   intro="Klopt er iets niet, bijvoorbeeld na een correctie in een annotatie? Hier pas je de gegevens van deze gepubliceerde jottem aan. De wijziging wordt gelogd.">
        <button className="knop knop-secundair" onClick={() => setOpen(true)}>Gegevens corrigeren</button>
      </KaartSectie>
    );
  }

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch(`${API_PUBLIEK}/jottem/${gegevens.mediaId}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          titel, beschrijving, genre,
          metadata: velden,
          steekwoorden: steekwoorden.split(",").map((w) => w.trim()).filter(Boolean),
        }),
      });
      const inhoud = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFout(typeof inhoud.detail === "string" ? inhoud.detail : "Opslaan is niet gelukt");
        return;
      }
      setOpen(false);
      onOpgeslagen(inhoud.gewijzigd ? "Gecorrigeerd; de publiekspagina en de open data volgen." : "Er was niets gewijzigd.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <KaartSectie titel="Gegevens corrigeren">
      <form onSubmit={opslaan}>
        <Veld label="Titel" htmlFor="c-titel">
          <input id="c-titel" required value={titel} onChange={(e) => setTitel(e.target.value)} />
        </Veld>
        <Veld label="Beschrijving" htmlFor="c-beschrijving">
          <textarea id="c-beschrijving" rows={3} value={beschrijving} onChange={(e) => setBeschrijving(e.target.value)} />
        </Veld>
        <Veld label="Categorie" htmlFor="c-genre">
          <input id="c-genre" value={genre} onChange={(e) => setGenre(e.target.value)} />
        </Veld>
        {VELDEN.map((v) => (
          <Veld key={v.sleutel} label={v.label} htmlFor={`c-${v.sleutel}`}>
            <input id={`c-${v.sleutel}`} value={velden[v.sleutel]}
                   onChange={(e) => setVelden({ ...velden, [v.sleutel]: e.target.value })} />
          </Veld>
        ))}
        <Veld label="Steekwoorden (komma-gescheiden)" htmlFor="c-steekwoorden">
          <input id="c-steekwoorden" value={steekwoorden} onChange={(e) => setSteekwoorden(e.target.value)} />
        </Veld>
        {fout && <p className="memo">{fout}</p>}
        <div className="knoppenrij">
          <button className="knop knop-primair" type="submit" disabled={bezig}>{bezig ? "Opslaan..." : "Opslaan"}</button>
          <button className="knop knop-secundair" type="button" onClick={() => setOpen(false)}>Annuleren</button>
        </div>
      </form>
    </KaartSectie>
  );
}
