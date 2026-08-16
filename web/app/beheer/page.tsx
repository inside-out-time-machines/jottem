"use client";

import { useCallback, useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";

type Organisatie = {
  organisatieId: number;
  naam: string;
  slug: string;
  beschrijving: string | null;
  website: string | null;
  kleurPrimair: string | null;
  kleurSecundair: string | null;
  kleurAchtergrond: string | null;
  logo: string | null;
  favicon: string | null;
  logoUrl: string | null;
};
type Lid = { gebruikersId: number; naam: string; email: string; rol: string; gekoppeld: boolean };

const LEEG = {
  naam: "", slug: "", beschrijving: "", website: "",
  kleurPrimair: "#d85a30", kleurSecundair: "#a2401f", kleurAchtergrond: "#faf6f1",
  logo: null as string | null, favicon: null as string | null,
};

export default function BeheerPagina() {
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [magBeheren, setMagBeheren] = useState<boolean | null>(null);
  const [organisaties, setOrganisaties] = useState<Organisatie[]>([]);
  const [vorm, setVorm] = useState({ ...LEEG });
  const [bewerkSlug, setBewerkSlug] = useState<string | null>(null);
  const [leden, setLeden] = useState<Record<string, Lid[]>>({});
  const [melding, setMelding] = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", ...authHeaders("dev-piet", "Piet Platformbeheerder") };

  const laden = useCallback(() => {
    fetch(`${API_PUBLIEK}/organisatie`, { headers })
      .then(async (r) => {
        if (r.status === 403) { setMagBeheren(false); return []; }
        if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
        setMagBeheren(true);
        return r.json();
      })
      .then((lijst: Organisatie[]) => {
        setOrganisaties(lijst);
        lijst.forEach((organisatie) => ledenLaden(organisatie.slug));
      })
      .catch((f) => setMelding(`Laden mislukt: ${f.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIngelogd(isIngelogd());
    if (isIngelogd()) laden();
  }, [laden]);

  async function ledenLaden(slug: string) {
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruikers?rol=organisatiebeheerder`, { headers });
    if (r.ok) {
      const lijst = await r.json();
      setLeden((oud) => ({ ...oud, [slug]: lijst }));
    }
  }

  async function huisstijlBestand(slug: string, soort: "logo" | "favicon", bestand: File) {
    const vraag = await fetch(`${API_PUBLIEK}/organisatie/${slug}/huisstijl-upload`, {
      method: "POST", headers,
      body: JSON.stringify({ soort, bestandsnaam: bestand.name, contentType: bestand.type }),
    });
    if (!vraag.ok) throw new Error("Upload-URL aanvragen mislukt");
    const { objectKey, uploadUrl } = await vraag.json();
    const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": bestand.type }, body: bestand });
    if (!put.ok) throw new Error("Upload mislukt");
    return objectKey as string;
  }

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    setMelding(null);
    try {
      const pad = bewerkSlug ? `/organisatie/${bewerkSlug}` : "/organisatie";
      const r = await fetch(`${API_PUBLIEK}${pad}`, {
        method: bewerkSlug ? "PUT" : "POST",
        headers,
        body: JSON.stringify({
          ...vorm,
          beschrijving: vorm.beschrijving || null,
          website: vorm.website || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      setMelding(bewerkSlug ? "Organisatie bijgewerkt." : "Organisatie aangemaakt, met automatisch een eerste project.");
      setVorm({ ...LEEG });
      setBewerkSlug(null);
      laden();
    } catch (f) {
      setMelding(`Opslaan mislukt: ${(f as Error).message}`);
    }
  }

  async function nodigUit(slug: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruikers`, {
      method: "POST", headers,
      body: JSON.stringify({ naam: data.get("naam"), email: data.get("email"), rol: "organisatiebeheerder" }),
    });
    setMelding(r.ok ? "Uitnodiging verstuurd; de rol staat klaar voor de eerste login." : `Uitnodigen mislukt: ${(await r.json()).detail ?? r.statusText}`);
    if (r.ok) {
      (e.target as HTMLFormElement).reset();
      ledenLaden(slug);
    }
  }

  async function trekIn(slug: string, lid: Lid) {
    if (!window.confirm(`Rol ${lid.rol} intrekken voor ${lid.naam}?`)) return;
    const r = await fetch(`${API_PUBLIEK}/organisatie/${slug}/gebruiker/${lid.gebruikersId}?rol=${lid.rol}`, {
      method: "DELETE", headers,
    });
    setMelding(r.ok ? "Rol ingetrokken." : "Intrekken mislukt.");
    ledenLaden(slug);
  }

  if (ingelogd === null) return <main><h1>Platformbeheer</h1></main>;
  if (!ingelogd) {
    return (
      <main>
        <h1>Platformbeheer</h1>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin("/beheer")}>
            Log in als platformbeheerder
          </button>
        </p>
      </main>
    );
  }
  if (magBeheren === false) {
    return (
      <main>
        <h1>Platformbeheer</h1>
        <p className="memo" style={{ marginTop: "1.2rem" }}>
          Je account heeft de rol platformbeheerder niet (of je sterke factor ontbreekt).
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Platformbeheer</h1>
      <p style={{ marginTop: ".5rem", maxWidth: "42rem" }}>
        Definieer organisatiejottems met hun huisstijl en nodig organisatiebeheerders uit.
      </p>
      {melding && <p className="memo" style={{ marginTop: "1rem" }}>{melding}</p>}

      <section style={{ marginTop: "2rem" }}>
        <h2>{bewerkSlug ? `Bewerk: ${vorm.naam}` : "Nieuwe organisatie"}</h2>
        <form className="formulier" onSubmit={opslaan}>
          <div className="veld">
            <label htmlFor="naam">Naam</label>
            <input id="naam" type="text" value={vorm.naam} onChange={(e) => setVorm({ ...vorm, naam: e.target.value })} />
          </div>
          <div className="veld">
            <label htmlFor="slug">Slug (voor de adressen, kleine letters en streepjes)</label>
            <input id="slug" type="text" value={vorm.slug} onChange={(e) => setVorm({ ...vorm, slug: e.target.value })} />
          </div>
          <div className="veld">
            <label htmlFor="beschrijving">Beschrijving (mag)</label>
            <textarea id="beschrijving" rows={2} value={vorm.beschrijving} onChange={(e) => setVorm({ ...vorm, beschrijving: e.target.value })} />
          </div>
          <div className="veld">
            <label htmlFor="website">Website (mag)</label>
            <input id="website" type="text" value={vorm.website} onChange={(e) => setVorm({ ...vorm, website: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
            {(["kleurPrimair", "kleurSecundair", "kleurAchtergrond"] as const).map((veld) => (
              <label key={veld} style={{ fontWeight: 600, fontSize: ".95rem" }}>
                {veld.replace("kleur", "")}<br />
                <input
                  type="color"
                  value={vorm[veld] ?? "#d85a30"}
                  onChange={(e) => setVorm({ ...vorm, [veld]: e.target.value })}
                  style={{ width: "4rem", height: "2.4rem", border: "1px solid var(--kartonrand)", borderRadius: ".3rem" }}
                />
              </label>
            ))}
          </div>
          {bewerkSlug && (
            <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
              {(["logo", "favicon"] as const).map((soort) => (
                <label key={soort} style={{ fontWeight: 600, fontSize: ".95rem" }}>
                  {soort} uploaden<br />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const bestand = e.target.files?.[0];
                      if (!bestand || !bewerkSlug) return;
                      try {
                        const sleutel = await huisstijlBestand(bewerkSlug, soort, bestand);
                        setVorm((oud) => ({ ...oud, [soort]: sleutel }));
                        setMelding(`${soort} geupload; klik op Opslaan om vast te leggen.`);
                      } catch (f) {
                        setMelding((f as Error).message);
                      }
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: ".7rem" }}>
            <button className="knop knop-primair" type="submit">
              {bewerkSlug ? "Opslaan" : "Organisatie aanmaken"}
            </button>
            {bewerkSlug && (
              <button type="button" className="knop knop-secundair" onClick={() => { setBewerkSlug(null); setVorm({ ...LEEG }); }}>
                Annuleren
              </button>
            )}
          </div>
        </form>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <h2>Organisaties</h2>
        <div className="kaarten">
          {organisaties.map((organisatie) => (
            <article
              className="kaart"
              key={organisatie.slug}
              style={{ borderTopColor: organisatie.kleurPrimair ?? "var(--oranje)" }}
            >
              {organisatie.logoUrl && (
                <img src={organisatie.logoUrl} alt="" style={{ maxHeight: "2.5rem", marginBottom: ".5rem" }} />
              )}
              <h3>{organisatie.naam}</h3>
              <p style={{ fontSize: ".9rem", color: "var(--grijs)" }}>
                {organisatie.slug}
                {organisatie.kleurPrimair && (
                  <span style={{
                    display: "inline-block", width: ".9rem", height: ".9rem", borderRadius: "50%",
                    background: organisatie.kleurPrimair, marginLeft: ".5rem", verticalAlign: "-0.1rem",
                  }} />
                )}
              </p>
              <p style={{ marginTop: ".7rem" }}>
                <button
                  className="knop knop-secundair"
                  onClick={() => {
                    setBewerkSlug(organisatie.slug);
                    setVorm({
                      naam: organisatie.naam, slug: organisatie.slug,
                      beschrijving: organisatie.beschrijving ?? "", website: organisatie.website ?? "",
                      kleurPrimair: organisatie.kleurPrimair ?? "#d85a30",
                      kleurSecundair: organisatie.kleurSecundair ?? "#a2401f",
                      kleurAchtergrond: organisatie.kleurAchtergrond ?? "#faf6f1",
                      logo: organisatie.logo, favicon: organisatie.favicon,
                    });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Bewerken
                </button>
              </p>
              <div style={{ marginTop: ".8rem", fontSize: ".92rem" }}>
                <strong>Organisatiebeheerders</strong>
                {(leden[organisatie.slug] ?? []).map((lid) => (
                  <p key={`${lid.gebruikersId}-${lid.rol}`} style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                    <span>
                      {lid.naam} ({lid.email})
                      {!lid.gekoppeld && <em style={{ color: "var(--grijs)" }}> · wacht op eerste login</em>}
                    </span>
                    <a href="#" onClick={(e) => { e.preventDefault(); trekIn(organisatie.slug, lid); }}>intrekken</a>
                  </p>
                ))}
                {(leden[organisatie.slug] ?? []).length === 0 && (
                  <p style={{ color: "var(--grijs)" }}>Nog geen organisatiebeheerders benoemd.</p>
                )}
                <form onSubmit={(e) => nodigUit(organisatie.slug, e)} style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".6rem" }}>
                  <input name="naam" type="text" placeholder="Naam" required style={{ font: "inherit", padding: ".35rem .5rem", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", flex: "1 1 8rem" }} />
                  <input name="email" type="email" placeholder="E-mailadres" required style={{ font: "inherit", padding: ".35rem .5rem", border: "1px solid var(--kartonrand)", borderRadius: ".3rem", flex: "2 1 12rem" }} />
                  <button className="knop knop-primair" type="submit">Benoem organisatiebeheerder</button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
