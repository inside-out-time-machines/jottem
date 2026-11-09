"use client";

import { useCallback, useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { kopVoetCss, projectStijl } from "@/lib/kleuren";
import BeheerInlog from "../beheer-inlog";
import { Actiebalk, BeheerPagina, KaartSectie, StatusPil, Veld } from "../beheer-ui";

type Jottem = {
  mediaId: string;
  titel: string;
  status: string;
  genre: string | null;
  creatieDatum: string;
  afkeurReden: string | null;
  duurzameUrl: string | null;
  herkenbaar: boolean | null;
  toestemming: string | null;
  gerelateerdAanTitel: string | null;
};

// De organisaties komen uit de rollen van de ingelogde moderator. Wie er meer dan één
// modereert, krijgt een keuzemenu: eerder pakte de pagina simpelweg de eerste rol uit de
// lijst, waardoor de wachtrij van de andere organisatie onbereikbaar was.
type Rolregel = { rol: string; organisatieId: number | null; organisatieSlug?: string | null };

// naam en huisstijl van de organisatie waarvoor je modereert: de moderatieomgeving
// hoort in dezelfde kleuren te staan als het project waar het materiaal in landt
type Organisatie = { naam: string; kleurPrimair: string | null; kleurSecundair: string | null };
type Keuze = { slug: string; naam: string };

type MeldingRij = {
  meldingId: number;
  mediaId: string | null;
  annotatieIri: string;
  reden: string;
  toelichting: string | null;
  status: string;
  creatieDatum: string;
  annotatie: {
    body?: { type?: string; value?: string; format?: string }[] | { type?: string; value?: string };
    creator?: { name?: string };
  } | null;
};

// verwijderverzoek (MO-5): depubliceren, wissen of afwijzen met toelichting
type VerzoekRij = {
  verzoekId: number;
  mediaId: string;
  jottemTitel: string;
  soort: string;
  reden: string;
  email: string;
  status: string;
  toelichting: string | null;
  creatieDatum: string;
  afhandelDatum: string | null;
};

const SOORT: Record<string, string> = {
  herkenbaar: "staat op de foto",
  "eigen-materiaal": "eigen materiaal, trekt in",
  auteursrecht: "auteursrecht",
  anders: "anders",
};

// vlak-annotatie bij een jottem met herkenbare personen die op vrijgave wacht (MO-7)
type WachtendeRij = {
  wachtendeAnnotatieId: number;
  mediaId: string;
  jottemTitel: string;
  status: string;
  creatieDatum: string;
  annotatie: MeldingRij["annotatie"];
};

function annotatieTekst(rij: { annotatie: MeldingRij["annotatie"] }): string {
  const body = rij.annotatie?.body;
  const lijst = Array.isArray(body) ? body : body ? [body] : [];
  const tekst = lijst.find((b) => b.type === "TextualBody" && b.value)?.value;
  return tekst ?? "(geen tekstinhoud)";
}

export default function ModeratiePagina() {
  const [jottems, setJottems] = useState<Jottem[]>([]);
  const [meldingen, setMeldingen] = useState<MeldingRij[]>([]);
  const [wachtende, setWachtende] = useState<WachtendeRij[]>([]);
  const [verzoeken, setVerzoeken] = useState<VerzoekRij[]>([]);
  const [melding, setMelding] = useState<string | null>(null);
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [organisatie, setOrganisatie] = useState<string | null>(null);
  const [mijnOrganisaties, setMijnOrganisaties] = useState<Keuze[]>([]);
  const [huisstijl, setHuisstijl] = useState<Organisatie | null>(null);

  // de keuze in de URL houden: deelbaar, en terug in de geschiedenis werkt
  function kiesOrganisatie(slug: string) {
    setOrganisatie(slug);
    const url = new URL(window.location.href);
    url.searchParams.set("organisatie", slug);
    window.history.replaceState(null, "", url);
  }

  useEffect(() => {
    setIngelogd(isIngelogd());
    if (!isIngelogd()) return;
    Promise.all([
      fetch(`${API_PUBLIEK}/mijn/profiel`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_PUBLIEK}/organisaties`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([profiel, publiek]: [{ rollen?: Rolregel[] } | null, { slug: string; naam: string }[]]) => {
        // de naam staat niet in de rollen, dus die halen we uit de publieke lijst;
        // een organisatie zonder naam daar tonen we op zijn slug
        const naam = new Map(publiek.map((o) => [o.slug, o.naam]));
        const slugs = (profiel?.rollen ?? [])
          .filter((r) => r.rol === "moderator" && r.organisatieSlug)
          .map((r) => r.organisatieSlug as string);
        const keuzes = [...new Set(slugs)].map((slug) => ({ slug, naam: naam.get(slug) ?? slug }));
        keuzes.sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
        setMijnOrganisaties(keuzes);

        // ?organisatie= wint, zodat een link naar een wachtrij deelbaar is; anders de
        // eerste op alfabet, en dat is een keuze en geen toeval zoals eerst
        const gevraagd = new URLSearchParams(window.location.search).get("organisatie");
        const gekozen = keuzes.find((k) => k.slug === gevraagd) ?? keuzes[0];
        if (gekozen) kiesOrganisatie(gekozen.slug);
      })
      .catch(() => {});
  }, []);


  useEffect(() => {
    if (!organisatie) return;
    fetch(`${API_PUBLIEK}/organisatie/${organisatie}/publiek`)
      .then((r) => (r.ok ? r.json() : null))
      .then((o: Organisatie | null) => setHuisstijl(o))
      .catch(() => {});
  }, [organisatie]);

  const headers = { "Content-Type": "application/json", ...authHeaders() };

  const laden = useCallback(() => {
    if (!isIngelogd() || !organisatie) return;
    fetch(`${API_PUBLIEK}/organisatie/${organisatie}/moderatie/jottems`, { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
        return r.json();
      })
      .then(setJottems)
      .catch((fout) => setMelding(`Wachtrij laden mislukt: ${fout.message}`));
    fetch(`${API_PUBLIEK}/organisatie/${organisatie}/meldingen`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then(setMeldingen)
      .catch(() => {});
    fetch(`${API_PUBLIEK}/organisatie/${organisatie}/wachtende-annotaties`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then(setWachtende)
      .catch(() => {});
    fetch(`${API_PUBLIEK}/organisatie/${organisatie}/verwijderverzoeken`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then(setVerzoeken)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisatie]);

  useEffect(laden, [laden]);

  async function beoordeel(mediaId: string, besluit: "goedgekeurd" | "afgekeurd") {
    let reden: string | null = null;
    if (besluit === "afgekeurd") {
      reden = window.prompt("Reden van afkeuring (verplicht):");
      if (!reden) return;
    }
    const antwoord = await fetch(`${API_PUBLIEK}/jottem/${mediaId}/status`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ besluit, reden }),
    });
    if (!antwoord.ok) {
      setMelding(`Beoordelen mislukt: ${(await antwoord.json()).detail ?? antwoord.statusText}`);
      return;
    }
    setMelding(besluit === "goedgekeurd" ? "Goedgekeurd en gepubliceerd." : "Afgekeurd; de uploader krijgt een mail met de reden.");
    laden();
  }

  async function besluitMelding(rij: MeldingRij, besluit: "verwijderd" | "verborgen" | "afgewezen") {
    const r = await fetch(`${API_PUBLIEK}/melding/${rij.meldingId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ besluit }),
    });
    if (!r.ok) {
      setMelding(`Afhandelen mislukt: ${(await r.json()).detail ?? r.statusText}`);
      return;
    }
    setMelding(
      besluit === "afgewezen"
        ? "Melding afgewezen; de bijdrage blijft staan."
        : "De bijdrage is uit de publieke weergave gehaald.",
    );
    laden();
  }

  async function besluitWachtend(rij: WachtendeRij, besluit: "vrijgegeven" | "afgewezen") {
    const r = await fetch(`${API_PUBLIEK}/wachtende-annotatie/${rij.wachtendeAnnotatieId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ besluit }),
    });
    if (!r.ok) {
      setMelding(`Afhandelen mislukt: ${(await r.json()).detail ?? r.statusText}`);
      return;
    }
    setMelding(
      besluit === "vrijgegeven"
        ? "Vrijgegeven; het vlak staat nu op de foto."
        : "Afgewezen; het vlak wordt niet openbaar.",
    );
    laden();
  }

  async function besluitVerzoek(rij: VerzoekRij, besluit: "depubliceren" | "wissen" | "afgewezen") {
    let toelichting: string | null = null;
    if (besluit === "afgewezen") {
      toelichting = window.prompt("Waarom wijs je dit verzoek af? De indiener krijgt deze toelichting per mail.");
      if (!toelichting || !toelichting.trim()) return;
    }
    if (besluit === "wissen" && !window.confirm(
      `"${rij.jottemTitel}" wissen? Het origineel, de metadata en alle annotaties worden definitief verwijderd. Dit kan niet ongedaan worden gemaakt.`)) return;
    const r = await fetch(`${API_PUBLIEK}/verwijderverzoek/${rij.verzoekId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ besluit, toelichting }),
    });
    if (!r.ok) {
      setMelding(`Afhandelen mislukt: ${(await r.json()).detail ?? r.statusText}`);
      return;
    }
    setMelding({
      depubliceren: "Gedepubliceerd; het origineel blijft als archiefexemplaar bewaard. De indiener krijgt de uitkomst per mail.",
      wissen: "Gewist; de jottem staat op de wislijst. De indiener krijgt de uitkomst per mail.",
      afgewezen: "Afgewezen; de indiener krijgt je toelichting per mail.",
    }[besluit]);
    laden();
  }

  const kleurStijl = projectStijl(huisstijl?.kleurPrimair, huisstijl?.kleurSecundair);
  const kopVoet = kopVoetCss(huisstijl?.kleurPrimair, huisstijl?.kleurSecundair);
  // Geen href/precedence hier: React hijst zo'n stijl naar de head en dedupliceert op
  // href, dus bij het wisselen van organisatie blijft het oude :root-blok staan en wint
  // de laatst ingevoegde. Zonder die attributen is er één blok dat gewoon meebeweegt.
  // (Op de andere pagina's kan de organisatie niet wisselen; daar is href juist goed.)
  const kopVoetBlok = kopVoet ? <style>{kopVoet}</style> : null;

  if (!ingelogd) {
    return <BeheerInlog titel="Moderatie" terugNaar="/moderatie" rol="moderator" bekend={ingelogd === false} />;
  }

  const wachtend = jottems.filter((j) => j.status === "nieuw").length;
  const openMeldingen = meldingen.filter((m) => m.status === "nieuw").length;
  const openVerzoeken = verzoeken.filter((v) => v.status === "open").length;

  return (
    <BeheerPagina
      titel="Moderatie"
      etiket={wachtend > 0 ? `${wachtend} in de wacht` : undefined}
      intro={mijnOrganisaties.length > 1
        ? "Kies rechts de organisatie waarvoor je modereert."
        : <>Alle jottems van <strong>{huisstijl?.naam ?? "je organisatie"}</strong>.</>}
      stijl={kleurStijl}
      hoofd={kopVoetBlok}
      zijbalk={
        <Actiebalk
          samenvatting={[
            { label: "Wachtrij", waarde: wachtend },
            { label: "Meldingen", waarde: openMeldingen },
            { label: "Vlakken", waarde: wachtende.length },
            { label: "Verwijderverzoeken", waarde: openVerzoeken },
            { label: "Totaal", waarde: jottems.length },
          ]}
          voet={organisatie ? <a href={`/organisatie/${organisatie}`} target="_blank" rel="noopener noreferrer">Publieke organisatiepagina</a> : undefined}
        >
          {mijnOrganisaties.length > 1 && (
            // alleen tonen als er iets te kiezen valt; bij één organisatie zou het menu
            // een keuze suggereren die er niet is
            <Veld label="Organisatie" htmlFor="moderatie-organisatie">
              <select
                id="moderatie-organisatie"
                value={organisatie ?? ""}
                onChange={(e) => kiesOrganisatie(e.target.value)}
              >
                {mijnOrganisaties.map((o) => (
                  <option key={o.slug} value={o.slug}>{o.naam}</option>
                ))}
              </select>
            </Veld>
          )}
          <a className="knop knop-secundair" href="#wachtrij">Naar de wachtrij</a>
          <a className="knop knop-secundair" href="#meldingen">Naar de meldingen</a>
          <a className="knop knop-secundair" href="#vlakken">Naar de vlakken</a>
          <a className="knop knop-secundair" href="#verwijderverzoeken">Naar de verwijderverzoeken</a>
        </Actiebalk>
      }
    >
      {melding && <p className="memo memo-blok">{melding}</p>}

      <KaartSectie id="wachtrij" titel="Wachtrij" intro="Nieuwe bijdragen beoordeel je het beste vanaf de beoordeelpagina (klik op de titel): daar zie je de foto op ware grootte en alle gegevens van de inzender.">
        <table className="lijst stapel">
          <thead>
            <tr>
              <th>Titel</th>
              <th>Status</th>
              <th>Ingediend</th>
              <th>Actie</th>
            </tr>
          </thead>
          <tbody>
            {jottems.map((jottem) => (
              <tr key={jottem.mediaId}>
                <td data-label="Titel">
                  <a href={`/moderatie/${jottem.mediaId}`}>{jottem.titel}</a>
                  {jottem.herkenbaar && (
                    <div>
                      <span
                        className={`status-pil ${jottem.toestemming === "ja" ? "status-goedgekeurd" : "status-afgekeurd"}`}
                        title="Signaal van de Herkenbaar API plus de verklaring van de uploader"
                      >
                        herkenbaar · toestemming: {jottem.toestemming}
                      </span>
                    </div>
                  )}
                  {jottem.gerelateerdAanTitel && (
                    <div className="hint">zelfde object als: {jottem.gerelateerdAanTitel}</div>
                  )}
                  {jottem.afkeurReden && (
                    <div className="hint">reden: {jottem.afkeurReden}</div>
                  )}
                </td>
                <td data-label="Status"><StatusPil soort={jottem.status}>{jottem.status}</StatusPil></td>
                <td data-label="Ingediend">{new Date(jottem.creatieDatum).toLocaleDateString("nl-NL")}</td>
                <td>
                  {jottem.status === "nieuw" && (
                    <span className="knoppenrij">
                      <button className="knop knop-primair" onClick={() => beoordeel(jottem.mediaId, "goedgekeurd")}>
                        Goedkeuren
                      </button>
                      <button className="knop knop-secundair" onClick={() => beoordeel(jottem.mediaId, "afgekeurd")}>
                        Afkeuren
                      </button>
                    </span>
                  )}
                  {jottem.duurzameUrl && <a href={jottem.duurzameUrl}>bekijk</a>}
                </td>
              </tr>
            ))}
            {jottems.length === 0 && (
              <tr><td colSpan={4} className="beheer-leeg">Geen jottems in de wachtrij.</td></tr>
            )}
          </tbody>
        </table>
      </KaartSectie>

      <KaartSectie
        id="verwijderverzoeken"
        titel="Verwijderverzoeken"
        intro="Handel elk verzoek binnen 30 dagen af. Depubliceren haalt de jottem overal weg maar bewaart het origineel; wissen verwijdert ook origineel, metadata en annotaties, definitief."
      >
        <table className="lijst stapel">
          <thead>
            <tr>
              <th>Jottem en verzoek</th>
              <th>Ingediend</th>
              <th>Status / actie</th>
            </tr>
          </thead>
          <tbody>
            {verzoeken.map((rij) => (
              <tr key={rij.verzoekId}>
                <td data-label="Jottem en verzoek" style={{ maxWidth: "26rem" }}>
                  <a href={`/moderatie/${rij.mediaId}`}>{rij.jottemTitel}</a>
                  <div className="hint">kenmerk {rij.verzoekId} · {SOORT[rij.soort] ?? rij.soort} · {rij.email}</div>
                  <div><em>&ldquo;{rij.reden.slice(0, 300)}&rdquo;</em></div>
                  {rij.toelichting && <div className="hint">besluit: {rij.toelichting}</div>}
                </td>
                <td data-label="Ingediend">{new Date(rij.creatieDatum).toLocaleDateString("nl-NL")}</td>
                <td>
                  {rij.status === "open" ? (
                    <span className="knoppenrij">
                      <button className="knop knop-secundair" onClick={() => besluitVerzoek(rij, "depubliceren")}>Depubliceer</button>
                      <button className="knop knop-secundair" onClick={() => besluitVerzoek(rij, "wissen")}>Wis</button>
                      <button className="knop knop-secundair" onClick={() => besluitVerzoek(rij, "afgewezen")}>Wijs af</button>
                    </span>
                  ) : (
                    <span className="status-pil status-gedepubliceerd">{rij.status}</span>
                  )}
                </td>
              </tr>
            ))}
            {verzoeken.length === 0 && (
              <tr><td colSpan={3} className="beheer-leeg">Geen verwijderverzoeken.</td></tr>
            )}
          </tbody>
        </table>
      </KaartSectie>

      <KaartSectie
        id="vlakken"
        titel="Vlakken op foto's met herkenbare personen"
        intro="Een vlak met een naam erbij kan iemand identificeren. Op foto's waarop herkenbare personen staan, verschijnt zo'n vlak pas als jij het vrijgeeft."
      >
        <table className="lijst stapel">
          <thead>
            <tr>
              <th>Bijdrage</th>
              <th>Jottem</th>
              <th>Geplaatst op</th>
              <th>Actie</th>
            </tr>
          </thead>
          <tbody>
            {wachtende.map((rij) => (
              <tr key={rij.wachtendeAnnotatieId}>
                <td data-label="Bijdrage" style={{ maxWidth: "22rem" }}>
                  <em>&ldquo;{annotatieTekst(rij).slice(0, 160)}&rdquo;</em>
                  {rij.annotatie?.creator?.name && (
                    <div className="hint">door {rij.annotatie.creator.name}</div>
                  )}
                </td>
                <td data-label="Jottem"><a href={`/moderatie/${rij.mediaId}`}>{rij.jottemTitel}</a></td>
                <td data-label="Geplaatst op">{new Date(rij.creatieDatum).toLocaleDateString("nl-NL")}</td>
                <td>
                  <span className="knoppenrij">
                    <button className="knop knop-primair" onClick={() => besluitWachtend(rij, "vrijgegeven")}>Geef vrij</button>
                    <button className="knop knop-secundair" onClick={() => besluitWachtend(rij, "afgewezen")}>Wijs af</button>
                  </span>
                </td>
              </tr>
            ))}
            {wachtende.length === 0 && (
              <tr><td colSpan={4} className="beheer-leeg">Geen vlakken die wachten.</td></tr>
            )}
          </tbody>
        </table>
      </KaartSectie>

      <KaartSectie
        id="meldingen"
        titel="Meldingen op annotaties en reacties"
        intro="Bezoekers kunnen bijdragen rapporteren (ook zonder account). Verbergen of verwijderen haalt de bijdrage uit de publieke weergave; alles wordt gelogd."
      >
        <table className="lijst stapel">
          <thead>
            <tr>
              <th>Bijdrage</th>
              <th>Reden</th>
              <th>Gemeld op</th>
              <th>Status / actie</th>
            </tr>
          </thead>
          <tbody>
            {meldingen.map((rij) => (
              <tr key={rij.meldingId}>
                <td data-label="Bijdrage" style={{ maxWidth: "22rem" }}>
                  <em>&ldquo;{annotatieTekst(rij).slice(0, 160)}&rdquo;</em>
                  {rij.annotatie?.creator?.name && (
                    <div className="hint">door {rij.annotatie.creator.name}</div>
                  )}
                  {rij.mediaId && (
                    <div className="hint"><a href={`/moderatie/${rij.mediaId}`}>bekijk de jottem</a></div>
                  )}
                </td>
                <td data-label="Reden">
                  {rij.reden}
                  {rij.toelichting && <div className="hint">{rij.toelichting}</div>}
                </td>
                <td data-label="Gemeld op">{new Date(rij.creatieDatum).toLocaleDateString("nl-NL")}</td>
                <td>
                  {rij.status === "nieuw" ? (
                    <span className="knoppenrij">
                      <button className="knop knop-secundair" onClick={() => besluitMelding(rij, "verborgen")}>Verberg</button>
                      <button className="knop knop-secundair" onClick={() => besluitMelding(rij, "verwijderd")}>Verwijder</button>
                      <button className="knop knop-secundair" onClick={() => besluitMelding(rij, "afgewezen")}>Wijs af</button>
                    </span>
                  ) : (
                    <span className="status-pil status-gedepubliceerd">{rij.status}</span>
                  )}
                </td>
              </tr>
            ))}
            {meldingen.length === 0 && (
              <tr><td colSpan={4} className="beheer-leeg">Geen meldingen.</td></tr>
            )}
          </tbody>
        </table>
      </KaartSectie>
    </BeheerPagina>
  );
}
