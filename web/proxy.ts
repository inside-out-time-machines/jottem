import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Content negotiation op de duurzame jottem-URL (data-architectuur, AP-7).
//
// `/jottem/{id}` op de webhost is het onderwerp van elke jottem in de RDF, de dump en de
// Datasetregister-aanmelding. Een mens krijgt hier de HTML-pagina; een harvester die RDF
// vraagt, krijgt een 303 naar dezelfde jottem op de API, die JSON-LD (ook geframed),
// Turtle of RDF/XML levert. De API stuurt een HTML-verzoek op zijn beurt met een 303 terug
// naar deze URL, dus de twee kanten spiegelen elkaar.

const API = process.env.NEXT_PUBLIC_API_URL ?? "https://api.dev.iotm.nl";

// Dezelfde varianten en volgorde als de API (api/app/routers/jottem.py): text/html staat
// vooraan, zodat een kale */* of een gelijke voorkeur op de publiekspagina uitkomt.
const VARIANTEN = [
  "text/html",
  "application/ld+json",
  "application/json",
  "text/turtle",
  "application/rdf+xml",
] as const;

type Voorkeur = { type: string; sub: string; q: number };

function leesAccept(kop: string): Voorkeur[] {
  return kop
    .split(",")
    .map((deel) => {
      const [bereik, ...parameters] = deel.trim().split(";");
      const [type = "", sub = ""] = bereik.trim().toLowerCase().split("/");
      let q = 1;
      for (const parameter of parameters) {
        const [naam, waarde] = parameter.trim().split("=");
        if (naam === "q") q = Number.parseFloat(waarde) || 0;
      }
      return { type, sub, q };
    })
    .filter((v) => v.type && v.sub);
}

// De q-waarde van een variant: de meest specifieke overeenkomst telt (exact, dan type/*,
// dan */*), zoals RFC 9110 voorschrijft.
function kwaliteit(variant: string, voorkeuren: Voorkeur[]): number {
  const [type, sub] = variant.split("/");
  const exact = voorkeuren.find((v) => v.type === type && v.sub === sub);
  if (exact) return exact.q;
  const typeJoker = voorkeuren.find((v) => v.type === type && v.sub === "*");
  if (typeJoker) return typeJoker.q;
  const alles = voorkeuren.find((v) => v.type === "*" && v.sub === "*");
  return alles ? alles.q : 0;
}

function besteVariant(kop: string | null): string {
  if (!kop) return "text/html";
  const voorkeuren = leesAccept(kop);
  let beste: string = "text/html";
  let besteQ = -1;
  for (const variant of VARIANTEN) {
    const q = kwaliteit(variant, voorkeuren);
    if (q > besteQ) {
      beste = variant;
      besteQ = q;
    }
  }
  return besteQ > 0 ? beste : "text/html";
}

export function proxy(request: NextRequest) {
  if (besteVariant(request.headers.get("accept")) === "text/html") {
    return NextResponse.next();
  }
  const id = request.nextUrl.pathname.split("/")[2];
  return NextResponse.redirect(`${API}/jottem/${encodeURIComponent(id)}`, {
    status: 303,
    headers: { Vary: "Accept" },
  });
}

export const config = {
  // alleen de duurzame jottem-URL zelf, geen subpaden of statische bestanden
  matcher: "/jottem/:id",
};
