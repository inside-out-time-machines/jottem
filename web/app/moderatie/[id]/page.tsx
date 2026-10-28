"use client";

import { use, useCallback, useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { kopVoetCss, projectStijl } from "@/lib/kleuren";
import BeheerInlog from "../../beheer-inlog";
import { Actiebalk, BeheerPagina, KaartSectie, StatusPil, Veld } from "../../beheer-ui";
import Licentie from "../../licentie";

// Wat de moderator ziet is meer dan de publiekspagina toont: die bestaat pas na
// goedkeuring, en laat de inzender alleen zien als die dat zelf heeft aangezet.
type Detail = {
  mediaId: string;
  titel: string;
  beschrijving: string | null;
  genre: string | null;
  licentie: string | null;
  status: string;
  organisatie: string;
  organisatieSlug: string;
  organisatieKleurPrimair: string | null;
  organisatieKleurSecundair: string | null;
  project: string;
  projectSlug: string;
  metadata: Record<string, string>;
  afbeeldingUrl: string | null;
  bron: string;
  bronUrl: string | null;
  gerelateerd: { mediaId: string; titel: string }[];
};

type Beoordeling = {
  detail: Detail;
  inzenderNaam: string;
  inzenderNaamPubliek: boolean;
  creatieDatum: string;
  herkenbaar: boolean | null;
  herkenbaarScore: number | null;
  toestemming: string;
  afkeurReden: string | null;
};

const BRONNAAM: Record<string, string> = {
  upload: "bestand of camera",
  iiif: "permalink uit een beeldbank",
  url: "foto-URL van een website",
};

// veldnamen zoals de inzender ze kent; de rest toont de sleutel zelf
const VELDNAAM: Record<string, string> = {
  adres: "Adres",
  datering: "Datering",
  jaarVan: "Van jaar",
  jaarTot: "Tot jaar",
  vervaardiger: "Vervaardiger",
  archiefbron: "Bron",
  persoon: "Persoon",
  gebouw: "Gebouw",
  bedrijf: "Bedrijf",
  gebeurtenis: "Gebeurtenis",
  plaats: "Plaats",
  steekwoord: "Steekwoorden",
};

export default function BeoordeelPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [beoordeling, setBeoordeling] = useState<Beoordeling | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [afkeuren, setAfkeuren] = useState(false);
  const [reden, setReden] = useState("");
  const [bezig, setBezig] = useState(false);
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);

  const laden = useCallback(() => {
    if (!isIngelogd()) return;
    fetch(`${API_PUBLIEK}/jottem/${id}/moderatie`, { headers: authHeaders() })
      .then(async (antwoord) => {
        if (!antwoord.ok) {
          throw new Error((await antwoord.json().catch(() => ({}))).detail ?? antwoord.statusText);
        }
        return antwoord.json();
      })
      .then((gegevens: Beoordeling) => { setBeoordeling(gegevens); setFout(null); })
      .catch((f) => setFout(f.message));
  }, [id]);

  useEffect(() => { setIngelogd(isIngelogd()); }, []);
  useEffect(laden, [laden]);

  async function beslis(besluit: "goedgekeurd" | "afgekeurd") {
    if (besluit === "afgekeurd" && !reden.trim()) return;
    setBezig(true);
    const antwoord = await fetch(`${API_PUBLIEK}/jottem/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ besluit, reden: besluit === "afgekeurd" ? reden.trim() : null }),
    });
    setBezig(false);
    if (!antwoord.ok) {
      setMelding(`Beoordelen mislukt: ${(await antwoord.json().catch(() => ({}))).detail ?? antwoord.statusText}`);
      return;
    }
    setAfkeuren(false);
    setMelding(besluit === "goedgekeurd"
      ? "Goedgekeurd en gepubliceerd. De inzender krijgt een mail."
      : "Afgekeurd. De inzender krijgt een mail met de reden en een link om het opnieuw in te dienen.");
    laden();
  }

  const detailOfNiets = beoordeling?.detail;
  const kleurStijl = projectStijl(detailOfNiets?.organisatieKleurPrimair,
                                  detailOfNiets?.organisatieKleurSecundair);
  const kopVoet = kopVoetCss(detailOfNiets?.organisatieKleurPrimair,
                             detailOfNiets?.organisatieKleurSecundair);
  const kopVoetBlok = kopVoet ? (
    <style href={`organisatiekleuren-${detailOfNiets?.organisatieSlug}`} precedence="high">
      {kopVoet}
    </style>
  ) : null;

  if (!ingelogd) {
    return <BeheerInlog titel="Beoordelen" terugNaar={`/moderatie/${id}`} rol="moderator" bekend={ingelogd === false} />;
  }
  if (fout) {
    return (
      <BeheerPagina kruimels={<a href="/moderatie">&larr; terug naar de wachtrij</a>} titel="Beoordelen lukt niet">
        <p className="memo memo-blok">{fout}</p>
      </BeheerPagina>
    );
  }
  if (!beoordeling) {
    return (
      <BeheerPagina kruimels={<a href="/moderatie">&larr; terug naar de wachtrij</a>} titel="Beoordelen">
        <p className="beheer-leeg">Bezig met laden&hellip;</p>
      </BeheerPagina>
    );
  }

  const { detail } = beoordeling;
  const steekwoorden = detail.metadata.steekwoord;
  const overig = Object.entries(detail.metadata)
    .filter(([veld]) => veld !== "steekwoord" && !veld.endsWith("termUri") && !veld.endsWith("Uri"));
  const ingediendOp = new Date(beoordeling.creatieDatum).toLocaleDateString("nl-NL",
    { day: "numeric", month: "long", year: "numeric" });

  return (
    <BeheerPagina
      kruimels={<><a href="/moderatie">Moderatie</a> · {detail.organisatie} · {detail.project}</>}
      titel={detail.titel}
      etiket={detail.status}
      stijl={kleurStijl}
      hoofd={kopVoetBlok}
      zijbalk={
        <Actiebalk
          samenvatting={[
            { label: "Status", waarde: <StatusPil soort={detail.status}>{detail.status}</StatusPil> },
            { label: "Inzender", waarde: <>{beoordeling.inzenderNaam}{!beoordeling.inzenderNaamPubliek && <span className="hint">naam blijft buiten de open data</span>}</> },
            { label: "Ingediend", waarde: ingediendOp },
            { label: "Herkenbaar", waarde: beoordeling.herkenbaar ? `ja, toestemming: ${beoordeling.toestemming}` : "nee" },
          ]}
          voet={detail.status === "goedgekeurd" ? <a href={`/jottem/${detail.mediaId}`}>Bekijk de publiekspagina</a> : undefined}
        >
          {detail.status === "nieuw" && (
            <>
              <button className="knop knop-primair" disabled={bezig} onClick={() => void beslis("goedgekeurd")}>
                Goedkeuren
              </button>
              <button className="knop knop-secundair" disabled={bezig} onClick={() => setAfkeuren(true)}>
                Afkeuren...
              </button>
            </>
          )}
          <a className="knop knop-secundair" href="/moderatie">Terug naar de wachtrij</a>
        </Actiebalk>
      }
    >
      {melding && <p className="memo memo-blok">{melding}</p>}

      {beoordeling.herkenbaar && (
        <p className="memo memo-blok">
          <strong>Mogelijk herkenbare personen op deze foto.</strong>{" "}
          {beoordeling.toestemming === "ja"
            ? "De inzender verklaart hun toestemming te hebben."
            : beoordeling.toestemming === "nee"
              ? "De inzender heeft géén toestemming. Weeg af of publicatie kan."
              : "De inzender heeft zich hier niet over uitgesproken."}
        </p>
      )}

      {detail.status === "nieuw" && afkeuren && (
        <KaartSectie
          titel="Afkeuren"
          intro="De inzender leest deze reden in de mail, met een link om het aan te passen en opnieuw in te dienen. Schrijf dus wat er nodig is om het wél te laten lukken."
        >
          <Veld label="Waarom keur je deze bijdrage af?" htmlFor="reden">
            <textarea id="reden" rows={3} value={reden} onChange={(e) => setReden(e.target.value)} autoFocus />
          </Veld>
          <div className="knoppenrij">
            <button className="knop knop-primair" disabled={bezig || !reden.trim()}
                    onClick={() => void beslis("afgekeurd")}>
              Afkeuren en mail sturen
            </button>
            <button className="knop knop-secundair" onClick={() => setAfkeuren(false)}>Annuleren</button>
          </div>
        </KaartSectie>
      )}

      <KaartSectie titel="De bijdrage" intro={<>Ingezonden door {beoordeling.inzenderNaam} op {ingediendOp}.</>}>
        {detail.afbeeldingUrl && (
          // geen IIIF-viewer: het derivaat bestaat pas na goedkeuring. Dit is het
          // origineel via een tijdelijke link, precies wat je wilt zien om te beslissen
          <p><img src={detail.afbeeldingUrl} alt={detail.titel} className="beoordeel-beeld" /></p>
        )}
        {detail.beschrijving && <p>{detail.beschrijving}</p>}
      </KaartSectie>

      <KaartSectie titel="Gegevens">
        <table className="lijst stapel">
          <tbody>
            <tr><td data-label="Categorie"><strong>Categorie</strong></td><td>{detail.genre ?? "geen"}</td></tr>
            {steekwoorden && (
              <tr><td data-label="Steekwoorden"><strong>Steekwoorden</strong></td><td>{steekwoorden}</td></tr>
            )}
            {overig.map(([veld, waarde]) => (
              <tr key={veld}>
                <td data-label={VELDNAAM[veld] ?? veld}><strong>{VELDNAAM[veld] ?? veld}</strong></td>
                <td>{waarde}</td>
              </tr>
            ))}
            <tr>
              <td data-label="Herkomst"><strong>Herkomst</strong></td>
              <td>
                {BRONNAAM[detail.bron] ?? detail.bron}
                {detail.bronUrl && <> &middot; <a href={detail.bronUrl} target="_blank" rel="noreferrer">bron openen</a></>}
              </td>
            </tr>
            <tr>
              <td data-label="Licentie"><strong>Licentie</strong></td>
              <td>{detail.licentie ? <Licentie url={detail.licentie} /> : "geen"}</td>
            </tr>
            {detail.gerelateerd.length > 0 && (
              <tr>
                <td data-label="Zelfde object"><strong>Zelfde object</strong></td>
                <td>{detail.gerelateerd.map((g) => (
                  <span key={g.mediaId}><a href={`/jottem/${g.mediaId}`}>{g.titel}</a> </span>
                ))}</td>
              </tr>
            )}
            {beoordeling.afkeurReden && (
              <tr>
                <td data-label="Eerder afgekeurd"><strong>Eerder afgekeurd</strong></td>
                <td>{beoordeling.afkeurReden}</td>
              </tr>
            )}
          </tbody>
        </table>
      </KaartSectie>
    </BeheerPagina>
  );
}
