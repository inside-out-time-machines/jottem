"use client";

import { useEffect, useRef, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { licentieInfo } from "@/lib/licenties";
import { startLogin } from "@/lib/oidc";
import CameraOpname from "./camera-opname";
import LocatieKiezer from "./locatie-kiezer";
import { kopVoetCss, projectStijl } from "@/lib/kleuren";

type Project = {
  projectId: string; naam: string; slug: string; datasetLicentie: string | null;
  uploadWijzen: string[];
};
type Organisatie = {
  naam: string; slug: string; projecten: Project[];
  kleurPrimair: string | null; kleurSecundair: string | null;
  // plaats van de organisatie (GeoNames via het Termennetwerk), startpunt van de kaart
  spatialLat: number | null; spatialLon: number | null;
};

// Waardelijst met term-URI (platformconfiguratie, zie de data-architectuur; audio volgt in
// fase 2). De URI gaat als metadata.genreUri mee en wordt schema:additionalType in de RDF.
// Vijf van de zeven hebben een nette term in de CHT of de AAT; voor krantenartikel en
// overig is er geen passende term, en een gedwongen benadering is slechter dan geen URI.
const GENRES: { waarde: string; uri?: string }[] = [
  { waarde: "foto", uri: "http://vocab.getty.edu/aat/300046300" },
  { waarde: "menukaart", uri: "https://data.cultureelerfgoed.nl/term/id/cht/b2a75fb6-ae8b-416a-a52c-ed7ace77aff7" },
  { waarde: "advertentie", uri: "https://data.cultureelerfgoed.nl/term/id/cht/b41e2448-298d-47e4-9b8f-44612deabeed" },
  { waarde: "folder", uri: "https://data.cultureelerfgoed.nl/term/id/cht/60f7e1bc-f01d-474a-95dd-79cfbb724179" },
  { waarde: "krantenartikel" },
  { waarde: "vergunning", uri: "http://vocab.getty.edu/aat/300027833" },
  { waarde: "overig" },
];

export default function UploadPagina() {
  const [organisaties, setOrganisaties] = useState<Organisatie[]>([]);
  const [bestand, setBestand] = useState<File | null>(null);
  const [titel, setTitel] = useState("");
  const [beschrijving, setBeschrijving] = useState("");
  const [genre, setGenre] = useState("foto");
  const [steekwoorden, setSteekwoorden] = useState("");
  const [locatie, setLocatie] = useState<{ lat: number; lon: number } | null>(null);
  const [toonKaart, setToonKaart] = useState(false);
  const [licentieAkkoord, setLicentieAkkoord] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [heeftCamera, setHeeftCamera] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [toestemmingsVraag, setToestemmingsVraag] = useState<{
    mediaId: string;
    betrouwbaarheid: number | null;
  } | null>(null);
  // externe fotobron (beeldbank-permalink of foto-URL): alleen verwijzing, geen upload
  const [externeBron, setExterneBron] = useState<{
    soort: "beeldbank" | "url"; url: string; bronUrl: string; previewUrl: string;
  } | null>(null);
  const [urlSoort, setUrlSoort] = useState<"beeldbank" | "url">("beeldbank");
  const [urlInvoer, setUrlInvoer] = useState("");
  const [urlFout, setUrlFout] = useState<string | null>(null);
  const [urlBezig, setUrlBezig] = useState(false);
  const bestandInput = useRef<HTMLInputElement>(null);
  const licentieDialoog = useRef<HTMLDialogElement>(null);
  const urlDialoog = useRef<HTMLDialogElement>(null);

  const [projectParam, setProjectParam] = useState<string | null>(null);
  // voorstellen van de suggestiedienst (V-10): de inzender kiest, wij vullen niets
  // ongevraagd in behalve een leeg veld. Blijft leeg als de dienst uitstaat of faalt.
  const [voorstel, setVoorstel] = useState<
    { titel: string | null; genre: string | null;
      steekwoorden: { label: string; uri: string | null }[] } | null>(null);
  // titel en beschrijving komen uit het manifest van de beeldbank; dat vermelden we,
  // zodat de inzender weet dat het niet zijn eigen tekst is
  const [uitBeeldbank, setUitBeeldbank] = useState(false);
  // datering, vervaardiger en adres uit datzelfde manifest; gaan mee als metadata
  const [bronMetadata, setBronMetadata] = useState<Record<string, string>>({});
  // het formulier loopt in twee stappen: eerst de foto, dan de gegevens erbij
  const [stap, setStap] = useState<1 | 2>(1);
  // een gekozen bestand gaat al aan het eind van stap 1 naar de opslag, zodat de
  // Herkenbaar-check loopt terwijl de inzender de gegevens invult
  const [geupload, setGeupload] = useState<
    { mediaId: string; herkenbaar: boolean | null; betrouwbaarheid: number | null } | null>(null);
  // koppeling: je voegt een foto toe van hetzelfde object als een bestaande jottem (V-9)
  const [koppelAan, setKoppelAan] = useState<
    { mediaId: string; titel: string; thumbnailUrl: string | null } | null>(null);

  useEffect(() => {
    setIngelogd(isIngelogd());
    // uploaden gaat altijd via een project: ?project=<organisatieslug>/<projectslug>
    // (knop op de startpagina of projectpagina); zonder project terug naar de start
    const param = new URLSearchParams(window.location.search).get("project");
    if (!param) {
      window.location.replace("/");
      return;
    }
    setProjectParam(param);
    const gerelateerd = new URLSearchParams(window.location.search).get("gerelateerdAan");
    if (gerelateerd) {
      fetch(`${API_PUBLIEK}/jottem/${gerelateerd}/detail`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setKoppelAan(
          { mediaId: d.mediaId, titel: d.titel, thumbnailUrl: d.thumbnailUrl }))
        .catch(() => {});
    }
    // cameradetectie: toon "Maak een foto" alleen als er echt een camera is
    navigator.mediaDevices?.enumerateDevices?.()
      .then((apparaten) => setHeeftCamera(apparaten.some((a) => a.kind === "videoinput")))
      .catch(() => setHeeftCamera(false));
  }, []);

  useEffect(() => {
    fetch(`${API_PUBLIEK}/organisaties`)
      .then((r) => r.json())
      .then(setOrganisaties)
      .catch(() => setMelding("De API is niet bereikbaar."));
  }, []);

  const projecten = organisaties.flatMap((o) =>
    o.projecten.map((p) => ({
      ...p, organisatie: o.naam, organisatieSlug: o.slug, pad: `${o.slug}/${p.slug}`,
      spatialLat: o.spatialLat, spatialLon: o.spatialLon,
      kleurPrimair: o.kleurPrimair, kleurSecundair: o.kleurSecundair,
    })),
  );
  const gekozen = projectParam
    ? projecten.find((p) => p.pad === projectParam || p.projectId === projectParam)
    : undefined;
  const licentie = licentieInfo(gekozen?.datasetLicentie ?? null);
  // per project ingeschakelde uploadwijzen (organisatiebeheerder); de server dwingt
  // ze bij het indienen ook af
  const wijzen = gekozen?.uploadWijzen ?? ["bestand", "camera", "beeldbank", "url"];
  const heeftEigenFoto = wijzen.includes("bestand") || wijzen.includes("camera");
  const heeftVerwijzing = wijzen.includes("beeldbank") || wijzen.includes("url");

  // een onbekend project (verlopen link, typefout) hoort ook terug naar de start
  useEffect(() => {
    if (projectParam && organisaties.length > 0 && !gekozen) window.location.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectParam, organisaties]);
  const headers = { "Content-Type": "application/json", ...authHeaders() };

  // voorbeeldweergave van een gekozen bestand (stap 2 toont waar het over gaat)
  const [bestandPreview, setBestandPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!bestand) { setBestandPreview(null); return; }
    const url = URL.createObjectURL(bestand);
    setBestandPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [bestand]);

  async function indienen(mediaId: string, toestemming: "ja" | "nee" | null) {
    const metadata: Record<string, string> = { ...bronMetadata };
    const genreUri = GENRES.find((g) => g.waarde === genre)?.uri;
    if (genreUri) metadata.genreUri = genreUri;
    if (locatie) {
      metadata.lat = String(locatie.lat);
      metadata.lon = String(locatie.lon);
    }
    const antwoord = await fetch(`${API_PUBLIEK}/jottem`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        mediaId,
        projectId: gekozen?.projectId,
        gerelateerdAan: koppelAan?.mediaId ?? null,
        titel,
        beschrijving: beschrijving || null,
        genre,
        licentieBevestigd: licentieAkkoord,
        steekwoorden: steekwoorden.split(",").map((w) => w.trim()).filter(Boolean),
        metadata,
        toestemming,
        externeBron: externeBron ? { soort: externeBron.soort, url: externeBron.url } : null,
      }),
    });
    if (!antwoord.ok) {
      const detail = (await antwoord.json()).detail ?? antwoord.statusText;
      // gezaghebbende Herkenbaar-check op de server: bij herkenbare personen
      // stelt de server de toestemmingsvraag via deze 422
      if (antwoord.status === 422 && String(detail).includes("herkenbare personen") && toestemming === null) {
        setToestemmingsVraag({ mediaId, betrouwbaarheid: null });
        return;
      }
      throw new Error(detail);
    }
    setMelding("Gelukt! Je jottem staat in de wachtrij voor de moderator. Jottem!");
    setToestemmingsVraag(null);
    setBestand(null);
    setExterneBron(null);
    setTitel("");
    setBeschrijving("");
    setSteekwoorden("");
    setLocatie(null);
    setLicentieAkkoord(false);
    setKoppelAan(null);
    setGeupload(null);
    setStap(1);
    setUitBeeldbank(false);
    setBronMetadata({});
    setVoorstel(null);
  }

  /** Stap 1 afronden: een gekozen bestand nu al uploaden en laten controleren. */
  async function naarStap2() {
    if (!bestand && !externeBron) {
      setMelding("Kies eerst een foto of geef een link.");
      return;
    }
    setMelding(null);
    // een externe bron staat al ergens anders; de server haalt hem zelf op bij het indienen
    if (externeBron) {
      setStap(2);
      return;
    }
    // hetzelfde bestand niet twee keer uploaden als de inzender heen en weer loopt
    if (geupload) {
      setStap(2);
      return;
    }
    setBezig(true);
    try {
      const urlAntwoord = await fetch(`${API_PUBLIEK}/upload-url`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          bestandsnaam: bestand!.name || "camera-foto.jpg",
          contentType: bestand!.type,
          grootte: bestand!.size,
        }),
      });
      if (!urlAntwoord.ok) throw new Error((await urlAntwoord.json()).detail ?? urlAntwoord.statusText);
      const { mediaId, uploadUrl } = await urlAntwoord.json();

      const putAntwoord = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": bestand!.type },
        body: bestand,
      });
      if (!putAntwoord.ok) throw new Error(`Upload naar opslag mislukt (${putAntwoord.status})`);

      // Herkenbaar-check: het antwoord bewaren, de vraag stellen we pas bij het indienen
      const checkAntwoord = await fetch(`${API_PUBLIEK}/herkenbaar-check`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mediaId }),
      });
      const check = checkAntwoord.ok ? await checkAntwoord.json() : { herkenbaar: null };
      setGeupload({
        mediaId,
        herkenbaar: check.herkenbaar ?? null,
        betrouwbaarheid: check.betrouwbaarheid ?? null,
      });
      setStap(2);
      // de analyse loopt terwijl de inzender stap 2 invult; niet op wachten, en een
      // storing blijft onzichtbaar (V-10)
      fetch(`${API_PUBLIEK}/suggesties`, {
        method: "POST", headers, body: JSON.stringify({ mediaId }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => {
          if (!v) return;
          setVoorstel(v);
          // een leeg veld vullen we alvast; wat de inzender zelf typte laten we staan
          setTitel((huidig) => huidig || v.titel || "");
        })
        .catch(() => {});
    } catch (fout) {
      setMelding(`Er ging iets mis: ${(fout as Error).message}`);
    } finally {
      setBezig(false);
    }
  }

  async function versturen(e: React.FormEvent) {
    e.preventDefault();
    if (!gekozen || !titel || !licentieAkkoord) {
      setMelding("Vul een titel in en bevestig de licentie.");
      return;
    }
    setBezig(true);
    setMelding(null);
    try {
      if (externeBron) {
        // externe bron: geen upload; de server valideert de URL opnieuw en doet de
        // Herkenbaar-check op een verkleinde download
        await indienen(crypto.randomUUID(), null);
        return;
      }
      if (!geupload) {
        setMelding("Je foto is nog niet geüpload; ga terug naar stap 1.");
        return;
      }
      if (geupload.herkenbaar === true) {
        setToestemmingsVraag({
          mediaId: geupload.mediaId,
          betrouwbaarheid: geupload.betrouwbaarheid,
        });
        return;
      }
      await indienen(geupload.mediaId, null);
    } catch (fout) {
      setMelding(`Er ging iets mis: ${(fout as Error).message}`);
    } finally {
      setBezig(false);
    }
  }

  function openUrlDialoog(soort: "beeldbank" | "url") {
    setUrlSoort(soort);
    setUrlInvoer("");
    setUrlFout(null);
    urlDialoog.current?.showModal();
  }

  async function urlControleren(e: React.FormEvent) {
    e.preventDefault();
    setUrlBezig(true);
    setUrlFout(null);
    try {
      const antwoord = await fetch(`${API_PUBLIEK}/upload/externe-bron`, {
        method: "POST",
        headers,
        body: JSON.stringify({ soort: urlSoort, url: urlInvoer.trim() }),
      });
      const inhoud = await antwoord.json();
      if (!antwoord.ok) {
        setUrlFout(typeof inhoud.detail === "string" ? inhoud.detail : "De URL kon niet worden gecontroleerd");
        return;
      }
      setExterneBron({
        soort: urlSoort, url: urlInvoer.trim(),
        bronUrl: inhoud.bronUrl, previewUrl: inhoud.previewUrl,
      });
      // de beeldbank heeft het materiaal al beschreven: die gegevens overnemen als
      // voorstel, zolang de inzender zelf nog niets heeft ingevuld
      if (inhoud.titel && !titel) { setTitel(inhoud.titel); setUitBeeldbank(true); }
      if (inhoud.beschrijving && !beschrijving) {
        setBeschrijving(inhoud.beschrijving);
        setUitBeeldbank(true);
      }
      setBronMetadata(inhoud.metadata ?? {});
      setBestand(null);
      urlDialoog.current?.close();
    } finally {
      setUrlBezig(false);
    }
  }

  // huisstijl van de organisatie achter het gekozen project: knoppen in de secundaire
  // kleur, header en footer (die in de root-layout staan) via een style-blok in de head
  const kleurStijl = projectStijl(gekozen?.kleurPrimair, gekozen?.kleurSecundair);
  const kopVoet = kopVoetCss(gekozen?.kleurPrimair, gekozen?.kleurSecundair);
  const kopVoetBlok = kopVoet ? (
    <style href={`organisatiekleuren-${gekozen?.organisatieSlug}`} precedence="high">
      {kopVoet}
    </style>
  ) : null;

  if (ingelogd === null) {
    return <main><h1>Deel je materiaal</h1></main>;
  }
  if (!ingelogd) {
    return (
      <main style={kleurStijl}>
        {kopVoetBlok}
        <h1>Deel je materiaal</h1>
        <p style={{ marginTop: "1rem", maxWidth: "40rem" }}>
          Om te uploaden heb je een account nodig. Zo weten we wie er bij een
          bijdrage hoort en kunnen we je een berichtje sturen zodra hij online staat.
        </p>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin(`/upload${window.location.search}`)}>
            Inloggen of registreren
          </button>
        </p>
      </main>
    );
  }

  if (toestemmingsVraag) {
    return (
      <main style={kleurStijl}>
        {kopVoetBlok}
        <h1>Staan er mensen op je foto?</h1>
        <p style={{ maxWidth: "40rem", marginTop: "1rem" }}>
          We zien mogelijk <strong>herkenbare personen</strong> op je foto. Vanwege het
          portretrecht en de privacy vragen we dan om toestemming van de mensen op de
          foto (of van hun nabestaanden).
        </p>
        <div style={{ display: "grid", gap: ".8rem", maxWidth: "34rem", marginTop: "1.5rem" }}>
          <button
            className="knop knop-primair"
            disabled={bezig}
            onClick={() => {
              setBezig(true);
              indienen(toestemmingsVraag.mediaId, "ja")
                .catch((f) => setMelding(`Er ging iets mis: ${(f as Error).message}`))
                .finally(() => setBezig(false));
            }}
          >
            Ja, ik verklaar dat ik toestemming heb
          </button>
          <button
            className="knop knop-secundair"
            disabled={bezig}
            onClick={() => {
              setBezig(true);
              indienen(toestemmingsVraag.mediaId, "nee")
                .catch((f) => setMelding(`Er ging iets mis: ${(f as Error).message}`))
                .finally(() => setBezig(false));
            }}
          >
            Nee, maar dien toch in (de moderator beoordeelt het)
          </button>
          <button
            className="knop knop-secundair"
            disabled={bezig}
            onClick={() => {
              setToestemmingsVraag(null);
              setMelding("Upload geannuleerd; je jottem is niet ingediend.");
            }}
          >
            Annuleren
          </button>
        </div>
        {melding && <p className="memo" style={{ marginTop: "1.2rem" }}>{melding}</p>}
      </main>
    );
  }

  return (
    <main style={kleurStijl}>
      {kopVoetBlok}
      <h1>Deel je materiaal</h1>
      <p style={{ maxWidth: "40rem", marginTop: ".8rem" }}>
        {heeftEigenFoto && heeftVerwijzing
          ? "Kies je foto (JPG, PNG of TIFF, tot 50 MB), of verwijs naar een foto in een beeldbank of op een website."
          : heeftEigenFoto
            ? "Kies je foto (JPG, PNG of TIFF, tot 50 MB)."
            : "Verwijs naar een foto in een beeldbank of op een website."}{" "}
        Vertel er kort iets bij. Een moderator bekijkt je bijdrage voordat hij
        online komt.
      </p>
      <form className="formulier" onSubmit={versturen}>
      {stap === 1 && (
        <>
        <p className="stap-teller">Stap 1 van 2: je foto</p>
        <div className="veld">
          <label>Je foto</label>
          <input
            ref={bestandInput}
            type="file"
            accept="image/jpeg,image/png,image/tiff"
            style={{ display: "none" }}
            onChange={(e) => { setGeupload(null); setVoorstel(null);
                               setBestand(e.target.files?.[0] ?? null); }}
          />
          <div className="bestand-knoppen">
            {wijzen.includes("bestand") && (
              <button
                type="button"
                className="knop knop-secundair"
                onClick={() => { setExterneBron(null); bestandInput.current?.click(); }}
              >
                <span className="icoon" aria-hidden="true">📁</span> Kies een bestand
              </button>
            )}
            {wijzen.includes("camera") && heeftCamera && (
              <button
                type="button"
                className="knop knop-secundair"
                onClick={() => { setExterneBron(null); setCameraOpen(true); }}
              >
                <span className="icoon" aria-hidden="true">📷</span> Of maak nu een foto
              </button>
            )}
            {wijzen.includes("beeldbank") && (
              <button
                type="button"
                className="knop knop-secundair"
                onClick={() => openUrlDialoog("beeldbank")}
              >
                <span className="icoon" aria-hidden="true">🏛️</span> Of geef een permalink uit een beeldbank
              </button>
            )}
            {wijzen.includes("url") && (
              <button
                type="button"
                className="knop knop-secundair"
                onClick={() => openUrlDialoog("url")}
              >
                <span className="icoon" aria-hidden="true">🔗</span> Of geef een foto-URL van een website
              </button>
            )}
          </div>
          {bestand && <span style={{ fontSize: ".9rem", color: "var(--grijs)" }}>Gekozen: {bestand.name || "camera-foto"}</span>}
          {externeBron && (
            <div style={{ marginTop: ".5rem" }}>
              <img
                src={externeBron.previewUrl}
                alt="Voorbeeld van de gekozen foto"
                style={{ maxHeight: "10rem", borderRadius: ".35rem", border: "1px solid var(--kartonrand)" }}
              />
              <div style={{ fontSize: ".9rem", color: "var(--grijs)", wordBreak: "break-all" }}>
                Gekozen: {externeBron.bronUrl}
                {externeBron.soort === "beeldbank" && " (IIIF, uit een beeldbank)"}
              </div>
            </div>
          )}
        </div>
        <div className="dialoog-knoppen" style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" type="button" disabled={bezig}
                  onClick={naarStap2}>
            {bezig ? "Bezig..." : "Verder"}
          </button>
        </div>
        </>
      )}

      {stap === 2 && (
        <>
        <p className="stap-teller">
          Stap 2 van 2: vertel erover
          <button className="annotatie-actie" type="button"
                  onClick={() => { setMelding(null); setStap(1); }}>
            terug naar je foto
          </button>
        </p>
        <div className="veld">
          <label>Je foto</label>
          {(externeBron?.previewUrl || bestandPreview) && (
            <img
              src={externeBron?.previewUrl || bestandPreview!}
              alt="De foto die je hebt gekozen"
              style={{ maxHeight: "8rem", borderRadius: ".35rem", border: "1px solid var(--kartonrand)" }}
            />
          )}
        </div>
        {koppelAan && (
          <div className="veld">
            <label>Je koppelt deze foto aan</label>
            <a className="gerelateerd" href={`/jottem/${koppelAan.mediaId}`}>
              {koppelAan.thumbnailUrl ? (
                <img src={koppelAan.thumbnailUrl} alt="" className="gerelateerd-foto" />
              ) : (
                <span className="gerelateerd-foto gerelateerd-leeg" aria-hidden="true" />
              )}
              <span>{koppelAan.titel}</span>
            </a>
            <p style={{ fontSize: ".85rem", color: "var(--grijs)", marginTop: ".4rem" }}>
              Jouw foto wordt een eigen bijdrage. Zodra de moderator hem goedkeurt, staan de
              twee foto&apos;s naar elkaar te verwijzen.
            </p>
          </div>
        )}

        <div className="veld">
          <label>Project</label>
          <p style={{ fontWeight: 600 }}>
            {gekozen ? `${gekozen.organisatie}: ${gekozen.naam}` : "Project wordt geladen..."}
          </p>
        </div>
        <div className="veld">
          <label htmlFor="titel">Titel</label>
          <input id="titel" type="text" value={titel}
                 onChange={(e) => { setUitBeeldbank(false); setTitel(e.target.value); }} />
          {uitBeeldbank && (
            <p style={{ fontSize: ".85rem", color: "var(--grijs)", marginTop: ".3rem" }}>
              Overgenomen uit de beeldbank. Je mag het aanpassen.
            </p>
          )}
          {!uitBeeldbank && voorstel?.titel && titel === voorstel.titel && (
            <p style={{ fontSize: ".85rem", color: "var(--grijs)", marginTop: ".3rem" }}>
              Voorgesteld door de computer aan de hand van je foto. Klopt het niet? Pas het aan.
            </p>
          )}
        </div>
        <div className="veld">
          <label htmlFor="genre">Wat voor iets is dit?</label>
          {voorstel?.genre && voorstel.genre !== genre && (
            <p className="voorstel">
              Voorstel:{" "}
              <button type="button" className="voorstel-knop"
                      onClick={() => setGenre(voorstel.genre!)}>
                {voorstel.genre}
              </button>
            </p>
          )}
          <select id="genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
            {GENRES.map((g) => (
              <option key={g.waarde} value={g.waarde}>{g.waarde}</option>
            ))}
          </select>
        </div>
        <div className="veld">
          <label htmlFor="beschrijving">Vertel er iets bij (mag)</label>
          <textarea
            id="beschrijving"
            rows={4}
            value={beschrijving}
            onChange={(e) => setBeschrijving(e.target.value)}
          />
        </div>
        <div className="veld">
          <label htmlFor="steekwoorden">Steekwoorden (mag, gescheiden door komma&apos;s)</label>
          <input
            id="steekwoorden"
            type="text"
            placeholder="bijv. restaurant, Markt, jaren zeventig"
            value={steekwoorden}
            onChange={(e) => setSteekwoorden(e.target.value)}
          />
          {(voorstel?.steekwoorden?.length ?? 0) > 0 && (
            <p className="voorstel">
              Voorstel:{" "}
              {voorstel!.steekwoorden
                .filter((s) => !steekwoorden.toLowerCase().includes(s.label.toLowerCase()))
                .map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className="voorstel-knop"
                    title={s.uri ? `term: ${s.uri}` : undefined}
                    onClick={() => {
                      setSteekwoorden((h) => (h.trim() ? `${h.replace(/,\s*$/, "")}, ${s.label}` : s.label));
                      // de term-URI bewaren onder de naam van het steekwoord zelf, zodat
                      // de RDF-mapping het paar terugvindt; de achtervoegselnaam laat de
                      // bestaande URL-validatie op de server zijn werk doen
                      if (s.uri) {
                        setBronMetadata((m) => ({ ...m, [`${s.label}-termUri`]: s.uri! }));
                      }
                    }}
                  >
                    {s.label}
                  </button>
                ))}
            </p>
          )}
        </div>
        <div className="veld">
          <label>Waar was dit? (mag)</label>
          {toonKaart ? (
            <>
              <LocatieKiezer
                onKies={(lat, lon) => setLocatie({ lat, lon })}
                begin={gekozen?.spatialLat != null && gekozen?.spatialLon != null
                  ? { lat: gekozen.spatialLat, lon: gekozen.spatialLon }
                  : null}
              />
              <span style={{ fontSize: ".9rem", color: "var(--grijs)" }}>
                {locatie
                  ? `Speld staat op ${locatie.lat}, ${locatie.lon}`
                  : "Klik op de kaart of versleep de speld."}
              </span>
            </>
          ) : (
            <button
              type="button"
              className="knop knop-secundair"
              style={{ justifySelf: "start" }}
              onClick={() => setToonKaart(true)}
            >
              Zet een speld op de kaart
            </button>
          )}
        </div>
        <label style={{ fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={licentieAkkoord}
            onChange={(e) => setLicentieAkkoord(e.target.checked)}
          />{" "}
          Ik ga akkoord met de licentie van dit project
          {licentie && (
            <>
              :{" "}
              <a
                href={gekozen?.datasetLicentie ?? "#"}
                onClick={(e) => {
                  e.preventDefault();
                  licentieDialoog.current?.showModal();
                }}
              >
                {licentie.naam}
              </a>
            </>
          )}
        </label>
        <button className="knop knop-primair" type="submit" disabled={bezig}>
          {bezig ? "Bezig..." : "Verstuur je jottem"}
        </button>
        </>
      )}
      </form>
      {melding && <p className="memo" style={{ marginTop: "1.2rem" }}>{melding}</p>}

      {licentie && (
        <dialog ref={licentieDialoog} className="dialoog">
          <h2>Wat betekent {licentie.naam}?</h2>
          <p>{licentie.uitleg}</p>
          <p style={{ marginTop: ".8rem", fontSize: ".95rem" }}>
            De volledige regels lees je in{" "}
            <a href={gekozen?.datasetLicentie ?? "#"} target="_blank" rel="noreferrer">
              de licentietekst ({licentie.naam})
            </a>.
          </p>
          <div className="dialoog-knoppen">
            <button
              type="button"
              className="knop knop-primair"
              onClick={() => licentieDialoog.current?.close()}
            >
              Duidelijk
            </button>
          </div>
        </dialog>
      )}

      <dialog ref={urlDialoog} className="dialoog">
        <form onSubmit={urlControleren}>
          <h2>
            {urlSoort === "beeldbank" ? "Foto uit een beeldbank" : "Foto-URL van een website"}
          </h2>
          <p style={{ marginTop: ".5rem", fontSize: ".95rem" }}>
            {urlSoort === "beeldbank"
              ? "Plak de permalink van de foto uit de beeldbank; we zoeken er de IIIF-versie bij en verwijzen daarnaar (we kopiëren niets). Op dit moment ondersteunen we de beeldbank van samh.nl en directe IIIF-links."
              : "Plak het adres van een foto op een website; we controleren of de link echt een afbeelding oplevert en verwijzen ernaar (we kopiëren niets)."}
          </p>
          <div className="veld" style={{ marginTop: ".8rem" }}>
            <label htmlFor="bron-url">URL</label>
            <input
              id="bron-url"
              type="url"
              required
              value={urlInvoer}
              placeholder={urlSoort === "beeldbank"
                ? "https://samh.nl/bronnen/beeldbank/detail/..."
                : "https://voorbeeld.nl/foto.jpg"}
              onChange={(e) => setUrlInvoer(e.target.value)}
              style={{ font: "inherit", padding: ".45rem .6rem", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", width: "100%" }}
            />
          </div>
          {urlFout && <p className="memo" style={{ marginTop: ".6rem" }}>{urlFout}</p>}
          <div className="dialoog-knoppen">
            <button className="knop knop-primair" type="submit" disabled={urlBezig}>
              {urlBezig ? "Controleren..." : "Controleer en gebruik"}
            </button>
            <button className="knop knop-secundair" type="button" onClick={() => urlDialoog.current?.close()}>
              Annuleren
            </button>
          </div>
        </form>
      </dialog>

      {cameraOpen && (
        <CameraOpname
          onFoto={(foto) => {
            setBestand(foto);
            setCameraOpen(false);
          }}
          onSluit={() => setCameraOpen(false)}
        />
      )}
    </main>
  );
}
