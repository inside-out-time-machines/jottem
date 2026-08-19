// Model en leeslogica van de annotaties, los van de weergave. Stond eerder verspreid in
// interactief.tsx (717 regels), waar de GeoJSON van een zichtveld op twee plaatsen bijna
// identiek werd geparseerd: één keer om te tonen en één keer om te bewerken.

export type Verrijking = {
  sleutel: string;
  label: string;
  cta: string;
  motivation: string;
  doel: string;
};

export type W3CBody = {
  type?: string;
  value?: string;
  purpose?: string;
  format?: string;
  source?: string;
};

export type W3CAnnotatie = {
  id: string;
  motivation?: string;
  target?: unknown;
  body?: W3CBody | W3CBody[];
  creator?: { id?: string; name?: string };
  created?: string;
  "jottem:verrijking"?: string;
  "jottem:aard"?: string;
};

export type Zichtveld = {
  lat: number | null;
  lon: number | null;
  richting: number | null;
  fov: number | null;
  doelLat: number | null;
  doelLon: number | null;
};

export function bodies(a: W3CAnnotatie): W3CBody[] {
  if (!a.body) return [];
  return Array.isArray(a.body) ? a.body : [a.body];
}

export function heeftVlak(a: W3CAnnotatie): boolean {
  const t = a.target as { selector?: unknown } | string | undefined;
  return typeof t === "object" && t !== null && "selector" in t;
}

export function naamUitIri(iri: string): string {
  return iri.split("/").filter(Boolean).pop() ?? "";
}

/** De GeoJSON van een zichtveld-annotatie; null als er niets parsebaars in staat. */
export function parseZichtveld(waarde: string | undefined): Zichtveld | null {
  if (!waarde) return null;
  try {
    const geo = JSON.parse(waarde) as {
      geometry?: { coordinates?: [number, number] };
      properties?: { bearing?: number; fov?: number; target?: [number, number] };
    };
    const [lon, lat] = geo.geometry?.coordinates ?? [];
    if (lat === undefined || lon === undefined) return null;
    return {
      lat, lon,
      richting: geo.properties?.bearing ?? null,
      fov: geo.properties?.fov ?? null,
      doelLon: geo.properties?.target?.[0] ?? null,
      doelLat: geo.properties?.target?.[1] ?? null,
    };
  } catch {
    return null;   // zonder parsebare geo start de kaart op de standaardpositie
  }
}

/** Leesbare weergave per annotatie (V-2/V-4): tekst, links en een typelabel. */
export function weergave(a: W3CAnnotatie, catalogus: Verrijking[]) {
  const sleutel = a["jottem:verrijking"];
  const uitCatalogus = catalogus.find((v) => v.sleutel === sleutel);
  let label = uitCatalogus?.label
    ?? (sleutel === "reactie" ? "Reactie" : a.motivation ?? "Annotatie");
  const teksten: string[] = [];
  const links: { label: string; url: string }[] = [];
  // zichtveld: geen coördinatentekst maar dezelfde kaartcomponent als bij het bewerken,
  // alleen-lezen en ingezoomd op de driehoek
  let zichtveld: Zichtveld | null = null;
  for (const b of bodies(a)) {
    if (b.type === "TextualBody" && b.value) {
      if (b.format === "application/geo+json") {
        const geparsed = parseZichtveld(b.value);
        if (geparsed) zichtveld = geparsed;
        else teksten.push(b.value);
      } else if (sleutel === "periode" && /^[0-9X]{3,4}/.test(b.value)) {
        teksten.push(`Datering: ${b.value}`);
      } else {
        teksten.push(b.value);
      }
    }
    if (b.type === "SpecificResource" && b.source) {
      links.push({ label: b.source.replace(/^https?:\/\//, "").slice(0, 60), url: b.source });
    }
  }
  if (sleutel === "tag") label = "Steekwoord";
  return { label, teksten, links, zichtveld };
}

export const LEEG_FORMULIER = {
  tekst: "", aard: "", termUri: "", termLabel: "", bronUrl: "", bronLabel: "",
  jaarVan: "", jaarTot: "", lat: null as number | null, lon: null as number | null,
  richting: null as number | null,
  fov: null as number | null,
  doelLat: null as number | null,
  doelLon: null as number | null,
  vlak: null as { x: number; y: number; w: number; h: number } | null,
  doelAnnotatie: null as string | null,
  bewerkNaam: null as string | null,
};
