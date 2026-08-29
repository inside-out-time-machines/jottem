// Opbouw van de inbedbare widget-HTML (hoofdstuk Deelbaarheid, D-1 t/m D-4).
// Zelfstandige documenten met minimale inline CSS: alleen lay-out, geen kleuren en
// geen fonts, zodat de widget bij script-inbedding de opmaak van de host erft. De
// enige uitzonderingen: de primaire organisatiekleur bij ?stijl=accent (D-3) en het
// Jottem-beeldmerk, dat volgens de merkgids niet herkleurd wordt.
import { SITE_URL } from "@/lib/api";

export type WidgetData = {
  naam: string;
  slug: string;
  organisatieSlug: string;
  organisatieNaam: string;
  kleurPrimair: string | null;
  logoUrl: string | null;
  beschrijving: string | null;
  oproep: string | null;
  aantalJottems: number;
  cta: { sleutel: string; cta: string } | null;
  jottems: { mediaId: string; titel: string; thumbnailUrl: string | null }[];
};

export function stijlKeuze(url: string): "accent" | "neutraal" {
  return new URL(url).searchParams.get("stijl") === "neutraal" ? "neutraal" : "accent";
}

function escapeHtml(tekst: string): string {
  return tekst
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// alleen een veilige hexkleur uit de database komt in de CSS terecht
function veiligeKleur(kleur: string | null): string | null {
  return kleur && /^#[0-9a-fA-F]{3,8}$/.test(kleur) ? kleur : null;
}

// het spraakwolk-O-beeldmerk (brand.iotm.nl, jottem-o.svg), meeschalend met de tekst
const BEELDMERK =
  '<svg viewBox="94 28 100 126" style="height:1.1em;width:auto;vertical-align:-.18em" aria-hidden="true">'
  + '<g transform="translate(-53.679 -39.514)" fill="#d85a30">'
  + '<path fill-rule="evenodd" d="M151.681 135.725c0 12.545 10.17 22.715 22.715 22.715h47.053c12.545 0 22.715-10.17 22.715-22.715V94.514c0-12.546-10.17-22.716-22.715-22.716h-47.053c-12.545 0-22.715 10.17-22.715 22.715zm22.553-6.003a9.41 9.41 0 0 0 9.41 9.41H212.2a9.41 9.41 0 0 0 9.41-9.41V98.517a9.41 9.41 0 0 0-9.41-9.41h-28.556a9.41 9.41 0 0 0-9.41 9.41z"/>'
  + '<path d="m178.452 148.705-20.281 38.129q-1.622 3.407 1.947 2.109l45.106-40.238z"/>'
  + "</g></svg>";

function projectUrl(data: WidgetData): string {
  return `${SITE_URL}/organisatie/${encodeURIComponent(data.organisatieSlug)}/${encodeURIComponent(data.slug)}`;
}

function omhulsel(titel: string, stijl: "accent" | "neutraal", kleur: string | null, binnen: string): string {
  const accent = stijl === "accent" ? veiligeKleur(kleur) : null;
  const rand = accent ? `border-top:3px solid ${accent};` : "";
  const linkstijl = accent ? `<style>.jottem-widget a{color:${accent}}</style>` : "";
  return (
    '<!doctype html>\n<html lang="nl"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="robots" content="noindex">'
    + `<title>${escapeHtml(titel)}</title></head><body style="margin:0">`
    + `<div class="jottem-widget" style="${rand}box-sizing:border-box;max-width:100%;padding:.75rem;line-height:1.45">`
    + linkstijl + binnen
    + "</div></body></html>"
  );
}

/** Projectinfo-widget: logo, titel, beschrijving en de oproep om mee te helpen. */
export function projectWidgetHtml(data: WidgetData, stijl: "accent" | "neutraal"): string {
  const url = projectUrl(data);
  const logo = stijl === "accent" && data.logoUrl
    ? `<img src="${escapeHtml(data.logoUrl)}" alt="" style="height:2.6em;width:auto;flex:none">`
    : "";
  const tekst = data.beschrijving ?? data.oproep;
  return omhulsel(`${data.naam} · Jottem`, stijl, data.kleurPrimair, (
    '<div style="display:flex;gap:.7em;align-items:center">'
    + logo
    + `<div><strong><a href="${url}" target="_top">${escapeHtml(data.naam)}</a></strong>`
    + `<br><small>${escapeHtml(data.organisatieNaam)}</small></div>`
    + "</div>"
    + (tekst ? `<p style="margin:.6em 0 0">${escapeHtml(tekst)}</p>` : "")
    + (data.oproep && data.beschrijving ? `<p style="margin:.4em 0 0">${escapeHtml(data.oproep)}</p>` : "")
    + `<p style="margin:.7em 0 0"><a href="${url}" target="_top">${BEELDMERK} Help mee op Jottem</a></p>`
  ));
}

/** Jottems-widget: thumbnails naast elkaar met daaronder een verrijkings-CTA (D-4). */
export function jottemsWidgetHtml(data: WidgetData, stijl: "accent" | "neutraal"): string {
  const url = projectUrl(data);
  const tegels = data.jottems
    .filter((jottem) => jottem.thumbnailUrl)
    .map((jottem) =>
      `<a href="${SITE_URL}/jottem/${jottem.mediaId}" target="_top" title="${escapeHtml(jottem.titel)}"`
      + ' style="flex:1 1 0;min-width:0">'
      + `<img src="${escapeHtml(jottem.thumbnailUrl as string)}" alt="${escapeHtml(jottem.titel)}"`
      + ' style="width:100%;height:7em;object-fit:cover;display:block"></a>')
    .join("");
  const oproep = data.cta?.cta ?? "Help mee op Jottem";
  const binnen = tegels
    ? `<div style="display:flex;gap:.5em">${tegels}</div>`
      + `<p style="margin:.6em 0 0"><a href="${url}" target="_top">${escapeHtml(oproep)}</a></p>`
    : `<p style="margin:0">Nog geen jottems.</p>`
      + `<p style="margin:.6em 0 0"><a href="${url}" target="_top">${BEELDMERK} Help mee op Jottem</a></p>`;
  return omhulsel(`${data.naam} · Jottem`, stijl, data.kleurPrimair, binnen);
}

export function foutHtml(melding: string): string {
  return (
    '<!doctype html>\n<html lang="nl"><head><meta charset="utf-8">'
    + '<meta name="robots" content="noindex"><title>Jottem</title></head>'
    + `<body style="margin:0"><div class="jottem-widget"><p>${escapeHtml(melding)}</p></div></body></html>`
  );
}

export function htmlAntwoord(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
