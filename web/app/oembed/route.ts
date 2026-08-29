import { API_INTERN, SITE_URL } from "@/lib/api";
import { WidgetData } from "../widget/html";

// oEmbed-endpoint (hoofdstuk Deelbaarheid, D-7): platforms met
// oEmbed-ondersteuning tonen een geplakte Jottem-URL automatisch als embed.
// Project-URL's leveren type "rich" (de jottems-widget als iframe), jottem-URL's
// type "photo" (de duurzame IIIF-afbeelding). Spec: https://oembed.com/

type JottemDetail = {
  titel: string;
  status: string;
  bron: string;
  bronUrl: string | null;
  iiifService: string | null;
  breedte: number | null;
  hoogte: number | null;
  uploaderNaam: string | null;
  verrijkingen?: { cta: string }[];
};

function jsonAntwoord(inhoud: unknown, status = 200): Response {
  return new Response(JSON.stringify(inhoud), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
  });
}

function fout(status: number, melding: string): Response {
  return new Response(JSON.stringify({ melding }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// begrens een standaardmaat door de maxwidth/maxheight van de consumer (oEmbed-spec)
function begrensd(standaard: number, max: string | null): number {
  const n = Number(max);
  return Number.isInteger(n) && n > 0 ? Math.min(standaard, n) : standaard;
}

// zelfde geen-vergroten-regel als og:image op de jottem-pagina: `!w,h` mag in
// IIIF 3 niet vergroten, dus bij een kleiner bronbeeld vragen we `max`
function iiifMaat(breedte: number | null, hoogte: number | null, doel: number): string {
  return Math.max(breedte ?? 0, hoogte ?? 0) > doel || !breedte || !hoogte
    ? `!${doel},${doel}`
    : "max";
}

function fotoAfmetingen(breedte: number | null, hoogte: number | null, doel: number) {
  if (!breedte || !hoogte) return {};
  const schaal = Math.min(doel / breedte, doel / hoogte, 1);
  return { width: Math.round(breedte * schaal), height: Math.round(hoogte * schaal) };
}

async function projectEmbed(org: string, project: string, zoek: URLSearchParams): Promise<Response> {
  const antwoord = await fetch(
    `${API_INTERN}/organisatie/${encodeURIComponent(org)}/project/${encodeURIComponent(project)}/widget?aantal=1`,
    { cache: "no-store" },
  );
  if (!antwoord.ok) return fout(404, "Project onbekend");
  const data = (await antwoord.json()) as WidgetData;
  const width = begrensd(600, zoek.get("maxwidth"));
  const height = begrensd(240, zoek.get("maxheight"));
  const src = `${SITE_URL}/widget/${encodeURIComponent(org)}/${encodeURIComponent(project)}/recent/3`;
  return jsonAntwoord({
    version: "1.0",
    type: "rich",
    title: `${data.naam} · ${data.organisatieNaam}`,
    provider_name: "Jottem",
    provider_url: SITE_URL,
    html: `<iframe src="${src}" width="${width}" height="${height}"`
      + ` style="border:0;max-width:100%" title="Jottem"></iframe>`,
    width,
    height,
  });
}

async function jottemEmbed(id: string, zoek: URLSearchParams): Promise<Response> {
  const antwoord = await fetch(`${API_INTERN}/jottem/${id}/detail`, { cache: "no-store" });
  if (!antwoord.ok) return fout(404, "Jottem onbekend");
  const jottem = (await antwoord.json()) as JottemDetail;
  if (jottem.status !== "goedgekeurd") return fout(404, "Jottem niet gepubliceerd");

  // alleen duurzame beeld-URL's: presigned S3-URL's verlopen en zijn ongeschikt
  // voor de caches van oEmbed-consumers (zelfde regel als og:image)
  const doel = Math.min(1200, begrensd(1200, zoek.get("maxwidth")), begrensd(1200, zoek.get("maxheight")));
  const beeldUrl = jottem.iiifService
    ? `${jottem.iiifService}/full/${iiifMaat(jottem.breedte, jottem.hoogte, doel)}/0/default.jpg`
    : jottem.bron === "url"
      ? jottem.bronUrl
      : null;
  if (!beeldUrl) return fout(404, "Geen inbedbaar beeld voor deze jottem");

  // dezelfde uitnodigende titel als og:title (D-5): een willekeurige actieve CTA
  const ctas = jottem.verrijkingen?.map((verrijking) => verrijking.cta) ?? [];
  const oproep = ctas.length ? ctas[Math.floor(Math.random() * ctas.length)] : "weet jij hier meer van?";
  return jsonAntwoord({
    version: "1.0",
    type: "photo",
    url: beeldUrl,
    ...fotoAfmetingen(jottem.breedte, jottem.hoogte, doel),
    title: `${jottem.titel} - ${oproep}`,
    provider_name: "Jottem",
    provider_url: SITE_URL,
    ...(jottem.uploaderNaam ? { author_name: jottem.uploaderNaam } : {}),
  });
}

export async function GET(request: Request) {
  const zoek = new URL(request.url).searchParams;
  const format = zoek.get("format");
  if (format && format !== "json") {
    return fout(501, "Alleen format=json wordt ondersteund");
  }
  const doelUrl = zoek.get("url");
  if (!doelUrl || !doelUrl.startsWith(`${SITE_URL}/`)) {
    return fout(404, "Onbekende URL; alleen project- en jottempagina's van dit platform");
  }
  const pad = doelUrl.slice(SITE_URL.length).replace(/[?#].*$/, "").replace(/\/$/, "");

  const projectMatch = pad.match(/^\/organisatie\/([^/]+)\/([^/]+)$/);
  if (projectMatch) return projectEmbed(projectMatch[1], projectMatch[2], zoek);

  const jottemMatch = pad.match(/^\/jottem\/([0-9a-f-]{36})$/);
  if (jottemMatch) return jottemEmbed(jottemMatch[1], zoek);

  return fout(404, "Onbekende URL; alleen project- en jottempagina's van dit platform");
}
