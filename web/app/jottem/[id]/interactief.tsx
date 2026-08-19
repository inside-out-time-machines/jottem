"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";
import Viewer, { OsdAnnotator, ViewerBesturing } from "./viewer";
import ZichtveldKiezer from "./zichtveld-kiezer";
import Deelnemer from "../../deelnemer";
import {
  LEEG_FORMULIER, bodies, heeftVlak, naamUitIri, parseZichtveld, weergave,
  type Verrijking, type W3CAnnotatie, type W3CBody,
} from "./annotatie-model";

export type Detail = {
  mediaId: string;
  titel: string;
  organisatieLat: number | null;   // plaats van de organisatie (GeoNames)
  organisatieLon: number | null;
  organisatieKleurPrimair: string | null;   // kleurt de annotaties (kaart, kader, popup)
  organisatieKleurSecundair: string | null;
  afbeeldingUrl: string | null;
  iiifService: string | null;
  annotatiesUrl: string | null;
  canvas: string | null;
  projectId: string;
  metadata: Record<string, string>;
  verrijkingen: Verrijking[];
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
  const [annotatorGereed, setAnnotatorGereed] = useState(false);
  const besturingRef = useRef<ViewerBesturing | null>(null);
  // profielfoto's bij de creator-IRI's van de annotaties op deze pagina
  const [fotos, setFotos] = useState<Record<string, string | null>>({});
  const dialoogRef = useRef<HTMLDialogElement>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders() };

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
    } catch {
      setAnnotaties([]);
    }
  }, [detail.annotatiesUrl]);

  useEffect(() => {
    setIngelogd(isIngelogd());
    laadAnnotaties();
    if (isIngelogd()) {
      fetch(`${API_PUBLIEK}/mijn/profiel`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => setPubliekeId(p?.publiekeId ?? null))
        .catch(() => {});
    }
     
  }, [laadAnnotaties]);

  // vlak-annotaties op de viewer tonen zodra beide er zijn (de laag is soms later
  // klaar dan de annotaties, en andersom)
  useEffect(() => {
    if (!annotatorGereed) return;
    annotatorRef.current?.setAnnotations(annotaties.filter(heeftVlak));
  }, [annotaties, annotatorGereed]);

  // wie heeft wat geplaatst: de foto's horen bij de gebruiker, niet bij de annotatie,
  // dus die halen we los op (alleen van deelnemers die hun naam publiek delen)
  useEffect(() => {
    const ids = [...new Set(annotaties
      .map((a) => a.creator?.id)
      .filter((id): id is string => Boolean(id?.startsWith("urn:uuid:")))
      .map((id) => id.replace("urn:uuid:", "")))];
    if (ids.length === 0) return;
    fetch(`${API_PUBLIEK}/deelnemers?ids=${ids.join(",")}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rijen: { publiekeId: string; afbeeldingUrl: string | null }[]) =>
        setFotos(Object.fromEntries(rijen.map((r) => [r.publiekeId, r.afbeeldingUrl]))))
      .catch(() => {});
  }, [annotaties]);

  const foto = (a: W3CAnnotatie) =>
    fotos[(a.creator?.id ?? "").replace("urn:uuid:", "")] ?? null;

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

  // wat er in de popup bij een aangeklikt kader komt: type, tekst, bronlinks en
  // de inzender, met een sprong naar de volledige bijdrage in de lijst eronder
  function popupInhoud(id: string) {
    const a = annotaties.find((x) => x.id === id);
    if (!a) return null;
    const w = weergave(a, detail.verrijkingen);
    return (
      <>
        <p className="annotatie-type">{w.label}</p>
        {w.teksten.map((tekst, i) => <p key={i}>{tekst}</p>)}
        {w.links.map((l) => (
          <p key={l.url}>
            <a href={l.url} rel="noopener noreferrer" target="_blank">{l.label}</a>
          </p>
        ))}
        <p className="kader-popup-voet">
          <Deelnemer naam={a.creator?.name} afbeeldingUrl={foto(a)} datum={a.created} />
          {" · "}
          <a href={`#${naamUitIri(a.id)}`}>lees verder</a>
        </p>
      </>
    );
  }

  function annotatorKlaar(annotator: OsdAnnotator) {
    annotatorRef.current = annotator;
    setAnnotatorGereed(true);
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

  const aanraakscherm = typeof window !== "undefined" && "ontouchstart" in window;

  function startVerrijking(v: Verrijking) {
    if (!ingelogd) { openDialoog("login"); return; }
    setVorm({ ...LEEG_FORMULIER });
    if (v.doel === "vlak") {
      if (!annotatorRef.current) { setMelding("De viewer is nog niet klaar; probeer zo weer."); return; }
      setTekenen(true);
      // desktop: tekenen alleen met SHIFT ingedrukt, zodat gewoon slepen/zoomen blijft
      // werken; aanraakschermen hebben geen SHIFT en tekenen direct
      annotatorRef.current.setDrawingEnabled(aanraakscherm);
      return;
    }
    openDialoog(v.sleutel);
  }

  // SHIFT houdt tekenen en navigeren uit elkaar (alleen actief in de tekenmodus)
  useEffect(() => {
    if (!tekenen || aanraakscherm) return;
    const toetsIn = (e: KeyboardEvent) => {
      if (e.key === "Shift") annotatorRef.current?.setDrawingEnabled(true);
    };
    const toetsUit = (e: KeyboardEvent) => {
      if (e.key === "Shift") annotatorRef.current?.setDrawingEnabled(false);
    };
    window.addEventListener("keydown", toetsIn);
    window.addEventListener("keyup", toetsUit);
    return () => {
      window.removeEventListener("keydown", toetsIn);
      window.removeEventListener("keyup", toetsUit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tekenen]);

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
    // dezelfde parser als de weergave gebruikt (annotatie-model.ts)
    const geoBody = alleBodies.find((b) => b.format === "application/geo+json");
    const gelezen = sleutel === "zichtveld" ? parseZichtveld(geoBody?.value) : null;
    const geoVorm: Partial<typeof LEEG_FORMULIER> = gelezen ?? {};
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
          onBesturing={(b) => { besturingRef.current = b; }}
          kleur={(detail.organisatieKleurPrimair as `#${string}` | null) ?? undefined}
          popupInhoud={popupInhoud}
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
          {aanraakscherm
            ? "Teken een vak op de foto: sleep met je vinger."
            : "Houd SHIFT ingedrukt en sleep een vak op de foto; zonder SHIFT kun je gewoon slepen en zoomen."}{" "}
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
                      onClick={() => {
                        // naar de viewer scrollen en daar het vlak in beeld brengen
                        // en selecteren, alsof je het kader had aangeklikt
                        document.querySelector(".iiif-kader")
                          ?.scrollIntoView({ behavior: "smooth", block: "center" });
                        besturingRef.current?.toonAnnotatie(a);
                      }}
                    >toon op de foto</button>
                  )}
                </p>
                {w.teksten.map((t, i) => <p key={i} style={{ marginTop: ".3rem" }}>{t}</p>)}
                {w.zichtveld && (
                  <div style={{ marginTop: ".5rem" }}>
                    <ZichtveldKiezer
                      begin={{
                        lat: w.zichtveld.lat ?? undefined,
                        lon: w.zichtveld.lon ?? undefined,
                        richting: w.zichtveld.richting ?? undefined,
                        fov: w.zichtveld.fov ?? undefined,
                        doelLat: w.zichtveld.doelLat ?? undefined,
                        doelLon: w.zichtveld.doelLon ?? undefined,
                      }}
                      readonly
                      hoogte="16rem"
                    />
                  </div>
                )}
                {w.links.map((l) => (
                  <p key={l.url} style={{ marginTop: ".3rem" }}>
                    <a href={l.url} rel="noopener noreferrer" target="_blank">{l.label}</a>
                  </p>
                ))}
                <p className="annotatie-voet">
                  <Deelnemer naam={a.creator?.name} afbeeldingUrl={foto(a)} datum={a.created} />
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
                      <Deelnemer naam={reactie.creator?.name} afbeeldingUrl={foto(reactie)}
                                 datum={reactie.created} />
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
                  } : detail.metadata.lat && detail.metadata.lon
                    // speld van de uploader, anders de plaats van de organisatie
                    ? { lat: Number(detail.metadata.lat), lon: Number(detail.metadata.lon) }
                    : detail.organisatieLat !== null && detail.organisatieLon !== null
                      ? { lat: detail.organisatieLat, lon: detail.organisatieLon }
                      : null}
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
