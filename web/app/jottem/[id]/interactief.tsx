"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";
import Viewer, { OsdAnnotator } from "./viewer";
import ZichtveldKiezer from "./zichtveld-kiezer";

type Verrijking = { sleutel: string; label: string; cta: string; motivation: string; doel: string };
export type Detail = {
  mediaId: string;
  titel: string;
  afbeeldingUrl: string | null;
  iiifService: string | null;
  annotatiesUrl: string | null;
  canvas: string | null;
  projectId: string;
  metadata: Record<string, string>;
  verrijkingen: Verrijking[];
};

type W3CBody = { type?: string; value?: string; purpose?: string; format?: string; source?: string };
type W3CAnnotatie = {
  id: string;
  motivation?: string;
  target?: unknown;
  body?: W3CBody | W3CBody[];
  creator?: { id?: string; name?: string };
  created?: string;
  "jottem:verrijking"?: string;
  "jottem:aard"?: string;
};

const DEV_SUB = "dev-anna";
const DEV_NAAM = "Anna Uploader";

function bodies(a: W3CAnnotatie): W3CBody[] {
  if (!a.body) return [];
  return Array.isArray(a.body) ? a.body : [a.body];
}

function heeftVlak(a: W3CAnnotatie): boolean {
  const t = a.target as { selector?: unknown } | string | undefined;
  return typeof t === "object" && t !== null && "selector" in t;
}

function naamUitIri(iri: string): string {
  return iri.split("/").filter(Boolean).pop() ?? "";
}

// leesbare weergave per annotatie (V-2/V-4): tekst, links en een typelabel
function weergave(a: W3CAnnotatie, catalogus: Verrijking[]) {
  const sleutel = a["jottem:verrijking"];
  const uitCatalogus = catalogus.find((v) => v.sleutel === sleutel);
  let label = uitCatalogus?.label ?? (sleutel === "reactie" ? "Reactie" : a.motivation ?? "Annotatie");
  const teksten: string[] = [];
  const links: { label: string; url: string }[] = [];
  for (const b of bodies(a)) {
    if (b.type === "TextualBody" && b.value) {
      if (b.format === "application/geo+json") {
        try {
          const geo = JSON.parse(b.value) as { geometry?: { coordinates?: [number, number] }; properties?: { bearing?: number } };
          const [lon, lat] = geo.geometry?.coordinates ?? [];
          const eig = geo.properties as { bearing?: number; fov?: number } | undefined;
          teksten.push(
            `Standpunt: ${lat?.toFixed(5)}, ${lon?.toFixed(5)}`
            + (eig?.bearing !== undefined ? ` · kijkrichting ${eig.bearing}°` : "")
            + (eig?.fov !== undefined ? ` · beeldhoek ${eig.fov}°` : ""),
          );
        } catch { teksten.push(b.value); }
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
  return { label, teksten, links };
}

const LEEG_FORMULIER = {
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

export default function Interactief({ detail }: { detail: Detail }) {
  const [annotaties, setAnnotaties] = useState<W3CAnnotatie[]>([]);
  const [ingelogd, setIngelogd] = useState(false);
  const [publiekeId, setPubliekeId] = useState<string | null>(null);
  const [actie, setActie] = useState<string | null>(null);   // verrijking-sleutel | reactie | melding | login
  const [vorm, setVorm] = useState({ ...LEEG_FORMULIER });
  const [meldReden, setMeldReden] = useState("spam");
  const [meldToelichting, setMeldToelichting] = useState("");
  const [meldDoel, setMeldDoel] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [tekenen, setTekenen] = useState(false);
  const [zoekTekst, setZoekTekst] = useState("");
  const [zoekResultaten, setZoekResultaten] = useState<{ uri: string; label: string; bron: string | null }[]>([]);
  const annotatorRef = useRef<OsdAnnotator | null>(null);
  const dialoogRef = useRef<HTMLDialogElement>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders(DEV_SUB, DEV_NAAM) };

  const laadAnnotaties = useCallback(async () => {
    if (!detail.annotatiesUrl) return;
    try {
      const alles: W3CAnnotatie[] = [];
      const r = await fetch(detail.annotatiesUrl, { headers: { Accept: "application/ld+json" } });
      if (!r.ok) { setAnnotaties([]); return; }
      const collectie = await r.json();
      let pagina = collectie.first;
      while (pagina) {
        if (Array.isArray(pagina.items)) alles.push(...pagina.items);
        if (pagina.next) {
          const rp = await fetch(pagina.next, { headers: { Accept: "application/ld+json" } });
          pagina = rp.ok ? await rp.json() : null;
        } else pagina = null;
      }
      setAnnotaties(alles);
      // vlak-annotaties op de viewer tonen
      const vlakken = alles.filter(heeftVlak);
      annotatorRef.current?.setAnnotations(vlakken);
    } catch {
      setAnnotaties([]);
    }
  }, [detail.annotatiesUrl]);

  useEffect(() => {
    setIngelogd(isIngelogd());
    laadAnnotaties();
    if (isIngelogd()) {
      fetch(`${API_PUBLIEK}/mijn/profiel`, { headers: authHeaders(DEV_SUB, DEV_NAAM) })
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => setPubliekeId(p?.publiekeId ?? null))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laadAnnotaties]);

  // Termennetwerk-zoek met kleine debounce (OB-3: beperkt tot de projectbronnen)
  useEffect(() => {
    if (zoekTekst.length < 2) { setZoekResultaten([]); return; }
    const timer = setTimeout(() => {
      fetch(`${API_PUBLIEK}/termennetwerk/zoek?query=${encodeURIComponent(zoekTekst)}&project=${detail.projectId}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setZoekResultaten)
        .catch(() => setZoekResultaten([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [zoekTekst]);

  function annotatorKlaar(annotator: OsdAnnotator) {
    annotatorRef.current = annotator;
    annotator.setDrawingTool("rectangle");
    annotator.on("createAnnotation", (...args: unknown[]) => {
      const a = args[0] as W3CAnnotatie;
      // het getekende vak vertalen naar xywh en de dialoog openen; het tijdelijke
      // Annotorious-object verdwijnt weer (de server is de bron van waarheid)
      const target = a.target as { selector?: { value?: string } | { value?: string }[] };
      const selector = Array.isArray(target?.selector) ? target.selector[0] : target?.selector;
      const m = /xywh=(?:pixel:)?([\d.]+),([\d.]+),([\d.]+),([\d.]+)/.exec(selector?.value ?? "");
      annotator.removeAnnotation(a.id);
      annotator.setDrawingEnabled(false);
      setTekenen(false);
      if (m) {
        setVorm((oud) => ({ ...oud, vlak: {
          x: Math.round(Number(m[1])), y: Math.round(Number(m[2])),
          w: Math.round(Number(m[3])), h: Math.round(Number(m[4])),
        } }));
        openDialoog("vlak");
      }
    });
  }

  function openDialoog(soort: string) {
    setActie(soort);
    setMelding(null);
    dialoogRef.current?.showModal();
  }

  function sluitDialoog() {
    dialoogRef.current?.close();
    setActie(null);
    setVorm({ ...LEEG_FORMULIER });
    setZoekTekst("");
    setZoekResultaten([]);
    setMeldToelichting("");
  }

  function startVerrijking(v: Verrijking) {
    if (!ingelogd) { openDialoog("login"); return; }
    setVorm({ ...LEEG_FORMULIER });
    if (v.doel === "vlak") {
      if (!annotatorRef.current) { setMelding("De viewer is nog niet klaar; probeer zo weer."); return; }
      setTekenen(true);
      annotatorRef.current.setDrawingEnabled(true);
      return;
    }
    openDialoog(v.sleutel);
  }

  function startReactie(doel: W3CAnnotatie) {
    if (!ingelogd) { openDialoog("login"); return; }
    setVorm({ ...LEEG_FORMULIER, doelAnnotatie: doel.id });
    openDialoog("reactie");
  }

  function startMelding(doel: W3CAnnotatie) {
    setMeldDoel(doel.id);
    setMeldReden("spam");
    openDialoog("melding");
  }

  function startBewerken(a: W3CAnnotatie) {
    const sleutel = a["jottem:verrijking"] ?? "herinnering";
    const alleBodies = bodies(a);
    const tekstBody = alleBodies.find((b) => b.type === "TextualBody" && b.format !== "application/geo+json");
    const bron = alleBodies.find((b) => b.type === "SpecificResource");
    // zichtveld: de geo+json-body terugparsen zodat de camera op de kaart terugkomt
    let geoVorm: Partial<typeof LEEG_FORMULIER> = {};
    const geoBody = alleBodies.find((b) => b.format === "application/geo+json");
    if (sleutel === "zichtveld" && geoBody?.value) {
      try {
        const geo = JSON.parse(geoBody.value) as {
          geometry?: { coordinates?: [number, number] };
          properties?: { bearing?: number; fov?: number; target?: [number, number] };
        };
        const [lon, lat] = geo.geometry?.coordinates ?? [];
        geoVorm = {
          lat: lat ?? null, lon: lon ?? null,
          richting: geo.properties?.bearing ?? null,
          fov: geo.properties?.fov ?? null,
          doelLon: geo.properties?.target?.[0] ?? null,
          doelLat: geo.properties?.target?.[1] ?? null,
        };
      } catch { /* zonder parsebare geo start de kaart op de standaardpositie */ }
    }
    setVorm({
      ...LEEG_FORMULIER,
      ...geoVorm,
      bewerkNaam: naamUitIri(a.id),
      doelAnnotatie: sleutel === "reactie" ? (a.target as string) : null,
      tekst: tekstBody?.value ?? "",
      aard: a["jottem:aard"] ?? "",
      termUri: sleutel === "tag" || sleutel === "vlak" ? bron?.source ?? "" : "",
      bronUrl: sleutel === "bron" ? bron?.source ?? "" : "",
      jaarVan: sleutel === "periode" ? (tekstBody?.value ?? "").split("/")[0] : "",
      jaarTot: sleutel === "periode" ? (tekstBody?.value ?? "").split("/")[1] ?? "" : "",
      vlak: null,
    });
    openDialoog(sleutel);
  }

  async function verwijderAnnotatie(a: W3CAnnotatie) {
    if (!window.confirm("Weet je zeker dat je deze bijdrage wilt verwijderen?")) return;
    const r = await fetch(`${API_PUBLIEK}/annotation/${detail.mediaId}/${naamUitIri(a.id)}`, {
      method: "DELETE", headers,
    });
    if (!r.ok) setMelding("Verwijderen is niet gelukt");
    laadAnnotaties();
  }

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    setMelding(null);
    const invoer: Record<string, unknown> = { verrijking: actie === "vlak" && vorm.bewerkNaam ? "vlak" : actie };
    if (vorm.tekst) invoer.tekst = vorm.tekst;
    if (vorm.aard) invoer.aard = vorm.aard;
    if (vorm.termUri) { invoer.termUri = vorm.termUri; invoer.termLabel = vorm.termLabel || zoekTekst; }
    if (vorm.bronUrl) { invoer.bronUrl = vorm.bronUrl; invoer.bronLabel = vorm.bronLabel; }
    if (vorm.jaarVan) { invoer.jaarVan = vorm.jaarVan; if (vorm.jaarTot) invoer.jaarTot = vorm.jaarTot; }
    if (vorm.lat !== null && vorm.lon !== null) {
      invoer.geo = {
        lat: vorm.lat, lon: vorm.lon,
        richting: vorm.richting ?? undefined,
        fov: vorm.fov ?? undefined,
        doelLat: vorm.doelLat ?? undefined,
        doelLon: vorm.doelLon ?? undefined,
      };
    }
    if (vorm.vlak) invoer.vlak = vorm.vlak;
    if (vorm.doelAnnotatie) invoer.doelAnnotatie = vorm.doelAnnotatie;

    const pad = vorm.bewerkNaam
      ? `/annotation/${detail.mediaId}/${vorm.bewerkNaam}`
      : `/jottem/${detail.mediaId}/annotation`;
    const r = await fetch(`${API_PUBLIEK}${pad}`, {
      method: vorm.bewerkNaam ? "PUT" : "POST",
      headers,
      body: JSON.stringify(invoer),
    });
    if (!r.ok) {
      const fout = await r.json().catch(() => ({}));
      setMelding(typeof fout.detail === "string" ? fout.detail : "Opslaan is niet gelukt");
      return;
    }
    sluitDialoog();
    laadAnnotaties();
  }

  async function meldOpslaan(e: React.FormEvent) {
    e.preventDefault();
    if (!meldDoel) return;
    const r = await fetch(`${API_PUBLIEK}/annotation/${detail.mediaId}/${naamUitIri(meldDoel)}/melding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reden: meldReden, toelichting: meldToelichting || null }),
    });
    if (!r.ok) {
      setMelding(r.status === 429 ? "Even rustig aan; probeer het zo weer." : "Melden is niet gelukt");
      return;
    }
    sluitDialoog();
    setMelding("Bedankt voor je melding; een moderator kijkt ernaar.");
  }

  const hoofdannotaties = annotaties.filter((a) => a["jottem:verrijking"] !== "reactie");
  const reactiesOp = (id: string) =>
    annotaties.filter((a) => a["jottem:verrijking"] === "reactie" && a.target === id);
  const isEigen = (a: W3CAnnotatie) =>
    publiekeId !== null && a.creator?.id === `urn:uuid:${publiekeId}`;
  const catalogus = detail.verrijkingen;

  const veldStijl = { font: "inherit", padding: ".45rem .6rem", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", width: "100%" } as const;

  return (
    <>
      {detail.iiifService ? (
        <Viewer
          service={detail.iiifService}
          titel={detail.titel}
          canvas={detail.canvas ?? undefined}
          onAnnotator={annotatorKlaar}
        />
      ) : (
        detail.afbeeldingUrl && (
          <figure className="polaroid" style={{ marginTop: "1.4rem", maxWidth: "36rem" }}>
            <img src={detail.afbeeldingUrl} alt={detail.titel} />
            <figcaption>{detail.titel}</figcaption>
          </figure>
        )
      )}

      {tekenen && (
        <p className="memo" style={{ marginTop: ".8rem" }}>
          Teken een vak op de foto: klik en sleep.{" "}
          <button className="knop knop-secundair" onClick={() => {
            annotatorRef.current?.setDrawingEnabled(false);
            setTekenen(false);
          }}>Stop met tekenen</button>
        </p>
      )}

      {/* CTA-balk: alleen de voor dit project ingeschakelde verrijkingen (V-1/V-2) */}
      {catalogus.length > 0 && (
        <section style={{ marginTop: "1.6rem" }}>
          <h2 style={{ fontSize: "1.25rem" }}>Weet jij meer over deze jottem?</h2>
          <div className="cta-balk">
            {catalogus.map((v) => (
              <button key={v.sleutel} className="cta-knop" onClick={() => startVerrijking(v)}>
                {v.cta}
              </button>
            ))}
          </div>
        </section>
      )}

      {melding && <p className="memo" style={{ marginTop: "1rem" }}>{melding}</p>}

      {/* annotatielijst */}
      <section style={{ marginTop: "1.8rem" }}>
        <h2 style={{ fontSize: "1.25rem" }}>
          Verhalen en aanvullingen {hoofdannotaties.length > 0 && `(${hoofdannotaties.length})`}
        </h2>
        {hoofdannotaties.length === 0 && (
          <p style={{ marginTop: ".6rem", color: "var(--grijs)" }}>
            Nog geen bijdragen; deel jij als eerste wat je weet?
          </p>
        )}
        <div className="annotatie-lijst">
          {hoofdannotaties.map((a) => {
            const w = weergave(a, catalogus);
            const reacties = reactiesOp(a.id);
            return (
              <article className="annotatie" key={a.id} id={naamUitIri(a.id)}>
                <p className="annotatie-kop">
                  <span className="annotatie-type">{w.label}</span>
                  {a["jottem:aard"] && (
                    <span className={`aard-badge aard-${a["jottem:aard"]}`}>
                      {a["jottem:aard"] === "herinnering" ? "persoonlijke herinnering" : "vaststaand feit"}
                    </span>
                  )}
                  {heeftVlak(a) && (
                    <button
                      className="annotatie-actie"
                      onClick={() => { annotatorRef.current?.setSelected(a.id); }}
                    >toon op de foto</button>
                  )}
                </p>
                {w.teksten.map((t, i) => <p key={i} style={{ marginTop: ".3rem" }}>{t}</p>)}
                {w.links.map((l) => (
                  <p key={l.url} style={{ marginTop: ".3rem" }}>
                    <a href={l.url} rel="noopener noreferrer" target="_blank">{l.label}</a>
                  </p>
                ))}
                <p className="annotatie-voet">
                  {a.creator?.name ?? "Een deelnemer"}
                  {a.created && ` · ${new Date(a.created).toLocaleDateString("nl-NL")}`}
                  <button className="annotatie-actie" onClick={() => startReactie(a)}>reageer</button>
                  <button className="annotatie-actie" onClick={() => startMelding(a)}>meld</button>
                  {isEigen(a) && (
                    <>
                      <button className="annotatie-actie" onClick={() => startBewerken(a)}>bewerk</button>
                      <button className="annotatie-actie" onClick={() => verwijderAnnotatie(a)}>verwijder</button>
                    </>
                  )}
                </p>
                {reacties.map((reactie) => (
                  <div className="annotatie-reactie" key={reactie.id}>
                    {weergave(reactie, catalogus).teksten.map((t, i) => <p key={i}>{t}</p>)}
                    <p className="annotatie-voet">
                      {reactie.creator?.name ?? "Een deelnemer"}
                      {reactie.created && ` · ${new Date(reactie.created).toLocaleDateString("nl-NL")}`}
                      <button className="annotatie-actie" onClick={() => startMelding(reactie)}>meld</button>
                      {isEigen(reactie) && (
                        <button className="annotatie-actie" onClick={() => verwijderAnnotatie(reactie)}>verwijder</button>
                      )}
                    </p>
                  </div>
                ))}
              </article>
            );
          })}
        </div>
      </section>

      {/* dialoog voor alle acties */}
      <dialog
        ref={dialoogRef}
        className={actie === "zichtveld" ? "dialoog dialoog-groot" : "dialoog"}
        onClose={() => setActie(null)}
      >
        {actie === "login" && (
          <div>
            <h3>Log in om mee te doen</h3>
            <p style={{ marginTop: ".6rem" }}>
              Met een gratis account kun je herinneringen delen, personen aanwijzen en meer.
            </p>
            <div className="dialoog-knoppen">
              <button className="knop knop-primair" onClick={() => void startLogin(window.location.pathname)}>Inloggen of account maken</button>
              <button className="knop knop-secundair" onClick={sluitDialoog}>Annuleren</button>
            </div>
          </div>
        )}

        {actie === "melding" && (
          <form onSubmit={meldOpslaan}>
            <h3>Meld deze bijdrage</h3>
            <p style={{ marginTop: ".4rem", fontSize: ".95rem" }}>
              Een moderator van de organisatie beoordeelt je melding. Dit kan zonder account.
            </p>
            <div className="veld" style={{ marginTop: ".8rem" }}>
              <label>Reden</label>
              <select value={meldReden} onChange={(e) => setMeldReden(e.target.value)} style={veldStijl}>
                <option value="spam">Spam</option>
                <option value="reclame">Reclame</option>
                <option value="ongepast">Ongepast</option>
                <option value="onjuist">Onjuist</option>
                <option value="anders">Anders</option>
              </select>
            </div>
            <div className="veld"><label>Toelichting (mag)</label>
              <textarea rows={2} value={meldToelichting} onChange={(e) => setMeldToelichting(e.target.value)} style={veldStijl} /></div>
            <div className="dialoog-knoppen">
              <button className="knop knop-primair" type="submit">Verstuur melding</button>
              <button className="knop knop-secundair" type="button" onClick={sluitDialoog}>Annuleren</button>
            </div>
          </form>
        )}

        {actie && !["login", "melding"].includes(actie) && (
          <form onSubmit={opslaan}>
            <h3>
              {actie === "reactie"
                ? "Reageer op deze bijdrage"
                : catalogus.find((v) => v.sleutel === actie)?.cta ?? "Vertel het ons"}
            </h3>

            {(actie === "herinnering" || actie === "vraag" || actie === "begrip" || actie === "reactie" || actie === "vlak") && (
              <div className="veld" style={{ marginTop: ".8rem" }}>
                <label>
                  {actie === "vraag" ? "Je vraag" : actie === "vlak" ? "Wat zie je in het vak?" : "Je verhaal of aanvulling"}
                </label>
                <textarea rows={4} value={vorm.tekst} onChange={(e) => setVorm({ ...vorm, tekst: e.target.value })} style={veldStijl} />
              </div>
            )}

            {actie === "herinnering" && (
              <div className="veld">
                <label>Wat is dit? (verplicht)</label>
                <label style={{ fontWeight: 400 }}>
                  <input type="radio" name="aard" checked={vorm.aard === "herinnering"}
                    onChange={() => setVorm({ ...vorm, aard: "herinnering" })} /> Een persoonlijke herinnering
                </label>
                <label style={{ fontWeight: 400 }}>
                  <input type="radio" name="aard" checked={vorm.aard === "feit"}
                    onChange={() => setVorm({ ...vorm, aard: "feit" })} /> Een vaststaand feit (controleerbaar)
                </label>
              </div>
            )}

            {(actie === "tag" || actie === "vlak") && (
              <div className="veld">
                <label>{actie === "tag" ? "Zoek een term" : "Zoek een term (mag)"}</label>
                <input type="text" value={zoekTekst} placeholder="Bijv. bakkerij, gevel, bruiloft..."
                  onChange={(e) => { setZoekTekst(e.target.value); setVorm({ ...vorm, termUri: "", termLabel: "" }); }} style={veldStijl} />
                {vorm.termUri && <p style={{ fontSize: ".9rem", marginTop: ".3rem" }}>Gekozen: <strong>{vorm.termLabel}</strong></p>}
                {!vorm.termUri && zoekResultaten.length > 0 && (
                  <ul className="zoeklijst">
                    {zoekResultaten.map((t) => (
                      <li key={t.uri}>
                        <button type="button" onClick={() => { setVorm({ ...vorm, termUri: t.uri, termLabel: t.label }); setZoekResultaten([]); }}>
                          {t.label} {t.bron && <em>({t.bron})</em>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {actie === "bron" && (
              <>
                <div className="veld" style={{ marginTop: ".8rem" }}><label>Link naar de bron</label>
                  <input type="url" required value={vorm.bronUrl} placeholder="https://..."
                    onChange={(e) => setVorm({ ...vorm, bronUrl: e.target.value })} style={veldStijl} /></div>
                <div className="veld"><label>Waar gaat het over? (mag)</label>
                  <input type="text" value={vorm.bronLabel}
                    onChange={(e) => setVorm({ ...vorm, bronLabel: e.target.value })} style={veldStijl} /></div>
              </>
            )}

            {actie === "periode" && (
              <>
                <div className="veld" style={{ marginTop: ".8rem" }}><label>Jaartal (of begin), bijv. 1973 of 196X</label>
                  <input type="text" required value={vorm.jaarVan}
                    onChange={(e) => setVorm({ ...vorm, jaarVan: e.target.value })} style={veldStijl} /></div>
                <div className="veld"><label>Tot (mag)</label>
                  <input type="text" value={vorm.jaarTot}
                    onChange={(e) => setVorm({ ...vorm, jaarTot: e.target.value })} style={veldStijl} /></div>
                <div className="veld"><label>Hoe weet je dit? (mag)</label>
                  <input type="text" value={vorm.tekst}
                    onChange={(e) => setVorm({ ...vorm, tekst: e.target.value })} style={veldStijl} /></div>
              </>
            )}

            {actie === "zichtveld" && (
              <div className="veld" style={{ marginTop: ".8rem" }}>
                <label>
                  Versleep de camera naar waar de fotograaf stond, het rondje naar wat
                  er in beeld is, en knijp de hoek passend
                </label>
                <ZichtveldKiezer
                  begin={vorm.lat !== null ? {
                    lat: vorm.lat ?? undefined,
                    lon: vorm.lon ?? undefined,
                    richting: vorm.richting ?? undefined,
                    fov: vorm.fov ?? undefined,
                    doelLat: vorm.doelLat ?? undefined,
                    doelLon: vorm.doelLon ?? undefined,
                  } : (detail.metadata.lat && detail.metadata.lon
                    ? { lat: Number(detail.metadata.lat), lon: Number(detail.metadata.lon) }
                    : null)}
                  onWijzig={(z) => setVorm((oud) => ({
                    ...oud, lat: z.lat, lon: z.lon, richting: z.richting,
                    fov: z.fov, doelLat: z.doelLat, doelLon: z.doelLon,
                  }))}
                />
                {vorm.lat !== null && (
                  <p style={{ fontSize: ".9rem", marginTop: ".3rem" }}>
                    Camera: {vorm.lat}, {vorm.lon} · kijkrichting {vorm.richting ?? 0}° · beeldhoek {vorm.fov ?? 60}°
                  </p>
                )}
              </div>
            )}

            {melding && <p className="memo" style={{ marginTop: ".6rem" }}>{melding}</p>}
            <div className="dialoog-knoppen">
              <button className="knop knop-primair" type="submit">{vorm.bewerkNaam ? "Opslaan" : "Deel het met ons"}</button>
              <button className="knop knop-secundair" type="button" onClick={sluitDialoog}>Annuleren</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
