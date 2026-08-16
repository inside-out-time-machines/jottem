"use client";

import { useEffect, useRef, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { licentieInfo } from "@/lib/licenties";
import { startLogin } from "@/lib/oidc";
import CameraOpname from "./camera-opname";
import LocatieKiezer from "./locatie-kiezer";

type Project = { projectId: string; naam: string; slug: string; datasetLicentie: string | null };
type Organisatie = { naam: string; slug: string; projecten: Project[] };

// CHT-waardelijst (platformconfiguratie, zie de data-architectuur; audio volgt in fase 2)
const GENRES = ["foto", "menukaart", "advertentie", "folder", "krantenartikel", "vergunning", "overig"];

export default function UploadPagina() {
  const [organisaties, setOrganisaties] = useState<Organisatie[]>([]);
  const [bestand, setBestand] = useState<File | null>(null);
  const [projectId, setProjectId] = useState("");
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
  const bestandInput = useRef<HTMLInputElement>(null);
  const licentieDialoog = useRef<HTMLDialogElement>(null);

  const [projectParam, setProjectParam] = useState<string | null>(null);

  useEffect(() => {
    setIngelogd(isIngelogd());
    // projectkeuze vanaf de homepage: ?project=<organisatieslug>/<projectslug>
    setProjectParam(new URLSearchParams(window.location.search).get("project"));
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
    o.projecten.map((p) => ({ ...p, organisatie: o.naam, pad: `${o.slug}/${p.slug}` })),
  );
  const vastProject = projectParam
    ? projecten.find((p) => p.pad === projectParam || p.projectId === projectParam)
    : undefined;
  const gekozen = vastProject ?? projecten.find((p) => p.projectId === projectId);
  const licentie = licentieInfo(gekozen?.datasetLicentie ?? null);
  const headers = { "Content-Type": "application/json", ...authHeaders("dev-anna", "Anna Uploader") };

  async function indienen(mediaId: string, toestemming: "ja" | "nee" | null) {
    const metadata: Record<string, string> = {};
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
        titel,
        beschrijving: beschrijving || null,
        genre,
        licentieBevestigd: licentieAkkoord,
        steekwoorden: steekwoorden.split(",").map((w) => w.trim()).filter(Boolean),
        metadata,
        toestemming,
      }),
    });
    if (!antwoord.ok) throw new Error((await antwoord.json()).detail ?? antwoord.statusText);
    setMelding("Gelukt! Je jottem staat in de wachtrij voor de moderator. Jottem!");
    setToestemmingsVraag(null);
    setBestand(null);
    setTitel("");
    setBeschrijving("");
    setSteekwoorden("");
    setLocatie(null);
    setLicentieAkkoord(false);
  }

  async function versturen(e: React.FormEvent) {
    e.preventDefault();
    if (!bestand || !gekozen || !titel || !licentieAkkoord) {
      setMelding("Vul alles in en bevestig de licentie.");
      return;
    }
    setBezig(true);
    setMelding(null);
    try {
      const urlAntwoord = await fetch(`${API_PUBLIEK}/upload-url`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          bestandsnaam: bestand.name || "camera-foto.jpg",
          contentType: bestand.type,
          grootte: bestand.size,
        }),
      });
      if (!urlAntwoord.ok) throw new Error((await urlAntwoord.json()).detail ?? urlAntwoord.statusText);
      const { mediaId, uploadUrl } = await urlAntwoord.json();

      const putAntwoord = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": bestand.type },
        body: bestand,
      });
      if (!putAntwoord.ok) throw new Error(`Upload naar opslag mislukt (${putAntwoord.status})`);

      // Herkenbaar-check: bij "ja" eerst de toestemmingsvraag stellen
      const checkAntwoord = await fetch(`${API_PUBLIEK}/herkenbaar-check`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mediaId }),
      });
      const check = checkAntwoord.ok ? await checkAntwoord.json() : { herkenbaar: null };
      if (check.herkenbaar === true) {
        setToestemmingsVraag({ mediaId, betrouwbaarheid: check.betrouwbaarheid });
        return;
      }
      await indienen(mediaId, null);
    } catch (fout) {
      setMelding(`Er ging iets mis: ${(fout as Error).message}`);
    } finally {
      setBezig(false);
    }
  }

  if (ingelogd === null) {
    return <main><h1>Deel je materiaal</h1></main>;
  }
  if (!ingelogd) {
    return (
      <main>
        <h1>Deel je materiaal</h1>
        <p style={{ marginTop: "1rem", maxWidth: "40rem" }}>
          Om te uploaden heb je een account nodig. Zo weten we wie er bij een
          bijdrage hoort en kunnen we je een berichtje sturen zodra hij online staat.
        </p>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin("/upload")}>
            Inloggen of registreren
          </button>
        </p>
      </main>
    );
  }

  if (toestemmingsVraag) {
    return (
      <main>
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
    <main>
      <h1>Deel je materiaal</h1>
      <p style={{ maxWidth: "40rem", marginTop: ".8rem" }}>
        Kies je foto (JPG, PNG of TIFF, tot 50 MB), vertel er kort iets bij en
        kies het project. Een moderator bekijkt je bijdrage voordat hij online komt.
      </p>
      <form className="formulier" onSubmit={versturen}>
        <div className="veld">
          <label>Je foto</label>
          <input
            ref={bestandInput}
            type="file"
            accept="image/jpeg,image/png,image/tiff"
            style={{ display: "none" }}
            onChange={(e) => setBestand(e.target.files?.[0] ?? null)}
          />
          <div className="bestand-knoppen">
            <button
              type="button"
              className="knop knop-secundair"
              onClick={() => bestandInput.current?.click()}
            >
              <span className="icoon" aria-hidden="true">📁</span> Kies een bestand
            </button>
            {heeftCamera && (
              <button
                type="button"
                className="knop knop-secundair"
                onClick={() => setCameraOpen(true)}
              >
                <span className="icoon" aria-hidden="true">📷</span> Of maak nu een foto
              </button>
            )}
          </div>
          {bestand && <span style={{ fontSize: ".9rem", color: "var(--grijs)" }}>Gekozen: {bestand.name || "camera-foto"}</span>}
        </div>
        <div className="veld">
          <label htmlFor="project">Project</label>
          {gekozen ? (
            <p style={{ fontWeight: 600 }}>
              {gekozen.organisatie}: {gekozen.naam}
            </p>
          ) : (
            <select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Kies een project</option>
              {projecten.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.organisatie}: {p.naam}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="veld">
          <label htmlFor="titel">Titel</label>
          <input id="titel" type="text" value={titel} onChange={(e) => setTitel(e.target.value)} />
        </div>
        <div className="veld">
          <label htmlFor="genre">Wat voor iets is dit?</label>
          <select id="genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
            {GENRES.map((g) => (
              <option key={g} value={g}>{g}</option>
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
        </div>
        <div className="veld">
          <label>Waar was dit? (mag)</label>
          {toonKaart ? (
            <>
              <LocatieKiezer onKies={(lat, lon) => setLocatie({ lat, lon })} />
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
