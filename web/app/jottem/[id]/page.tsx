import { apiServer } from "@/lib/api";
import OpenGraph from "../../open-graph";
import Deelnemer from "../../deelnemer";
import { kopVoetCss, projectStijl } from "@/lib/kleuren";
import Interactief, { Detail as InteractiefDetail } from "./interactief";
import DeelKnop from "./deel-knop";
import { SITE_URL } from "@/lib/api";

type Detail = InteractiefDetail & {
  beschrijving: string | null;
  genre: string | null;
  licentie: string | null;
  status: string;
  organisatie: string;
  organisatieSlug: string;
  organisatieLogoUrl: string | null;
  project: string;
  projectSlug: string;
  metadata: Record<string, string>;
  iiifManifest: string | null;
  publicatieDatum: string | null;
  uploaderNaam: string | null;
  uploaderAfbeeldingUrl: string | null;
  bron: string;
  bronUrl: string | null;
  breedte: number | null;
  hoogte: number | null;
};

// IIIF-maat voor de socialpreview: verkleinen naar 1200 alleen als het bronbeeld
// daar groter dan is, anders `max`. `!1200,1200` op een kleinere bron is in IIIF 3
// namelijk een vergrotingsverzoek en levert een 400 (dat vraagt om `^`).
function iiifMaat(breedte: number | null, hoogte: number | null) {
  return Math.max(breedte ?? 0, hoogte ?? 0) > 1200 || !breedte || !hoogte
    ? "!1200,1200"
    : "max";
}

// De afmetingen die dat verzoek oplevert. Zonder bekende bronafmetingen laten we
// og:image:width/height weg; een gegokte maat is erger dan geen maat.
function beeldMaat(breedte: number | null, hoogte: number | null, viaIiif: boolean) {
  if (!breedte || !hoogte) return {};
  const schaal = viaIiif ? Math.min(1200 / breedte, 1200 / hoogte, 1) : 1;
  return { width: Math.round(breedte * schaal), height: Math.round(hoogte * schaal) };
}

// duurzame og:image: de (eigen of externe) IIIF-service of de bron-URL;
// presigned S3-URL's verlopen en zijn ongeschikt voor social previews
function ogBeeld(jottem: Detail) {
  const url = jottem.iiifService
    ? `${jottem.iiifService}/full/${iiifMaat(jottem.breedte, jottem.hoogte)}/0/default.jpg`
    : jottem.bron === "url"
      ? jottem.bronUrl
      : jottem.afbeeldingUrl;
  if (!url) return null;
  return {
    url,
    alt: jottem.titel,
    ...beeldMaat(jottem.breedte, jottem.hoogte, Boolean(jottem.iiifService)),
  };
}

// veldnamen zoals een bezoeker ze kent; onbekende sleutels tonen we ongewijzigd
const VELDNAAM: Record<string, string> = {
  steekwoord: "Steekwoorden",
  datering: "Datering",
  jaarVan: "Van jaar",
  jaarTot: "Tot jaar",
  vervaardiger: "Vervaardiger",
  adres: "Adres",
  archiefbron: "Bron",
  persoon: "Persoon",
  gebouw: "Gebouw",
  bedrijf: "Bedrijf",
  gebeurtenis: "Gebeurtenis",
  plaats: "Plaats",
};

/**
 * De metadatarijen die een bezoeker te zien krijgt.
 *
 * Term-URI's horen hier niet: ze staan naast het label dat ze beschrijven, dus op de
 * pagina zou "menukaarten" twee keer voorkomen, één keer als woord en één keer als
 * lange URL. In de RDF en het IIIF-manifest staan ze wél, met het label erbij; daar
 * zijn ze juist het punt. Ook de coördinaten laten we weg: die horen bij de kaart.
 */
function metadataRijen(metadata: Record<string, string>): [string, string][] {
  return Object.entries(metadata).filter(
    ([veld]) => !veld.endsWith("Uri") && !veld.endsWith("-termUri")
                && veld !== "lat" && veld !== "lon",
  );
}

function ogBeschrijving(jottem: Detail) {
  return jottem.beschrijving
    ?? `Een jottem uit het project ${jottem.project} van ${jottem.organisatie}.`;
}

// De oproep achter de titel in og:title en de Web Share-tekst: een willekeurige,
// binnen het project actieve verrijkings-CTA (D-5), zodat een gedeelde link meteen
// om een concrete bijdrage vraagt en per deelmoment varieert. Zonder actieve
// verrijkingen valt de oproep terug op de vaste tekst.
function deelOproep(jottem: Detail): string {
  const ctas = jottem.verrijkingen?.map((verrijking) => verrijking.cta) ?? [];
  return ctas.length ? ctas[Math.floor(Math.random() * ctas.length)] : "weet jij hier meer van?";
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const jottem = await apiServer<Detail>(`/jottem/${id}/detail`);
    if (jottem.status !== "goedgekeurd") return {};
    return {
      title: `${jottem.titel} · Jottem`,
      description: ogBeschrijving(jottem),
      alternates: { canonical: `/jottem/${id}` },
    };
  } catch {
    return {};
  }
}

export default async function JottemPagina({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let jottem: Detail;
  try {
    jottem = await apiServer<Detail>(`/jottem/${id}/detail`);
  } catch {
    return (
      <main>
        <h1>Jottem niet gevonden</h1>
        <p>Deze jottem bestaat niet of is nog niet gepubliceerd.</p>
      </main>
    );
  }

  // header en footer staan in de root-layout: kleuren via CSS-variabelen in de head
  const kopVoet = kopVoetCss(jottem.organisatieKleurPrimair, jottem.organisatieKleurSecundair);
  // wat het deelmenu van het apparaat meekrijgt (zelfde oproep als in de preview)
  const deelUrl = `${SITE_URL}/jottem/${id}`;
  const oproep = deelOproep(jottem);
  const deelTekst = `${jottem.titel} - ${oproep}`;

  return (
    <main className="jottem-pagina"
          style={projectStijl(jottem.organisatieKleurPrimair, jottem.organisatieKleurSecundair)}>
      {kopVoet && (
        <style href={`organisatiekleuren-${jottem.organisatieSlug}`} precedence="high">
          {kopVoet}
        </style>
      )}
      {jottem.status === "goedgekeurd" && (
        <OpenGraph
          type="article"
          // uitnodigende titel in tijdlijnen: de jottem plus een verrijkings-CTA (D-5)
          titel={deelTekst}
          beschrijving={ogBeschrijving(jottem)}
          pad={`/jottem/${id}`}
          beeld={ogBeeld(jottem)}
        />
      )}
      <p style={{ fontSize: ".9rem", color: "var(--grijs)" }}>
        {jottem.organisatieLogoUrl && (
          <img src={jottem.organisatieLogoUrl} alt="" className="organisatie-logo-klein" />
        )}
        <a href={`/organisatie/${jottem.organisatieSlug}`}>{jottem.organisatie}</a>
        {" · "}
        <a href={`/organisatie/${jottem.organisatieSlug}/${jottem.projectSlug}`}>{jottem.project}</a>
      </p>
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start",
                    justifyContent: "space-between", flexWrap: "wrap" }}>
        <h1>{jottem.titel}</h1>
        <DeelKnop titel={jottem.titel} tekst={deelTekst} url={deelUrl} />
      </div>
      <p style={{ marginTop: ".3rem" }}>
        <span className={`status-pil status-${jottem.status}`}>{jottem.status}</span>
      </p>

      <Interactief detail={jottem} />

      {jottem.iiifManifest && (
        <p style={{ fontSize: ".85rem", color: "var(--grijs)", marginTop: "1rem" }}>
          Open data: <a href={jottem.iiifManifest}>IIIF-manifest</a>
          {jottem.annotatiesUrl && (
            <> · <a href={jottem.annotatiesUrl}>webannotaties (W3C)</a></>
          )}
        </p>
      )}
      {jottem.beschrijving && <p style={{ marginTop: "1.2rem", maxWidth: "42rem" }}>{jottem.beschrijving}</p>}
      <p style={{ marginTop: "1.2rem", fontSize: ".9rem", color: "var(--grijs)" }}>
        <Deelnemer
          naam={jottem.uploaderNaam}
          afbeeldingUrl={jottem.uploaderAfbeeldingUrl}
          datum={jottem.publicatieDatum}
          wat="deze jottem"
        />
      </p>
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start",
                    justifyContent: "space-between", flexWrap: "wrap" }}>
        <table className="lijst" style={{ maxWidth: "36rem", marginTop: ".6rem" }}>
          <tbody>
            {jottem.genre && (
              <tr><th>Genre</th><td>{jottem.genre}</td></tr>
            )}
            {jottem.licentie && (
              <tr><th>Licentie</th><td><a href={jottem.licentie}>{jottem.licentie}</a></td></tr>
            )}
            {jottem.bronUrl && (
              <tr><th>Bron</th><td>
              <a href={jottem.bronUrl} rel="noopener noreferrer" target="_blank">{jottem.bronUrl}</a>
              {jottem.bron === "iiif" && <span style={{ fontSize: ".85rem", color: "var(--grijs)" }}> (IIIF, uit een beeldbank)</span>}
            </td></tr>
          )}
            {metadataRijen(jottem.metadata).map(([veld, waarde]) => (
              <tr key={veld}><th>{VELDNAAM[veld] ?? veld}</th><td>{waarde}</td></tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: "1.2rem" }}>
          <DeelKnop titel={jottem.titel} tekst={deelTekst} url={deelUrl} />
        </p>
      </div>
    </main>
  );
}
