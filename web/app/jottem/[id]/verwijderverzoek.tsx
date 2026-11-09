"use client";

import { useRef, useState } from "react";
import { API_PUBLIEK } from "@/lib/api";

// Verzoek om verwijdering (BE-4): kan zonder account. De indiener krijgt een
// ontvangstbevestiging (mail 6), de moderatoren een melding (mail 7); de uitkomst volgt
// binnen 30 dagen per mail (mail 8).
const veldStijl = {
  font: "inherit", padding: ".45rem .6rem", border: "1px solid var(--kartonrand)",
  borderRadius: ".3rem", width: "100%",
} as const;

export default function Verwijderverzoek({ mediaId }: { mediaId: string }) {
  const dialoog = useRef<HTMLDialogElement>(null);
  const [soort, setSoort] = useState("herkenbaar");
  const [reden, setReden] = useState("");
  const [email, setEmail] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [verstuurd, setVerstuurd] = useState(false);

  function open() {
    setMelding(null);
    setVerstuurd(false);
    dialoog.current?.showModal();
  }

  async function versturen(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch(`${API_PUBLIEK}/verwijderverzoek`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jottemId: mediaId, soort, reden, email }),
      });
      const inhoud = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMelding(r.status === 429
          ? "Even rustig aan; probeer het over een minuut opnieuw."
          : typeof inhoud.detail === "string" ? inhoud.detail : "Versturen is niet gelukt. Controleer je e-mailadres.");
        return;
      }
      setVerstuurd(true);
      setMelding(inhoud.melding ?? "Je verzoek is ontvangen.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <>
      <button type="button" className="knop-link" onClick={open}
              style={{ background: "none", border: 0, padding: 0, color: "var(--grijs)",
                       textDecoration: "underline", cursor: "pointer", font: "inherit", fontSize: ".9rem" }}>
        Sta je hierop, of is dit jouw materiaal? Vraag verwijdering aan
      </button>
      <dialog ref={dialoog} className="dialoog">
        {verstuurd ? (
          <div>
            <h3>Bedankt</h3>
            <p style={{ marginTop: ".6rem" }}>{melding}</p>
            <div className="dialoog-knoppen">
              <button className="knop knop-primair" type="button" onClick={() => dialoog.current?.close()}>Sluiten</button>
            </div>
          </div>
        ) : (
          <form onSubmit={versturen}>
            <h3>Verzoek om verwijdering</h3>
            <p style={{ marginTop: ".4rem", fontSize: ".95rem" }}>
              Een moderator van de organisatie beoordeelt je verzoek. Je krijgt binnen 30 dagen
              per e-mail de uitkomst. Hiervoor heb je geen account nodig.
            </p>
            <div className="veld" style={{ marginTop: ".8rem" }}>
              <label htmlFor="vv-soort">Waarom?</label>
              <select id="vv-soort" value={soort} onChange={(e) => setSoort(e.target.value)} style={veldStijl}>
                <option value="herkenbaar">Ik sta (herkenbaar) op deze foto</option>
                <option value="eigen-materiaal">Het is mijn materiaal en ik trek het in</option>
                <option value="auteursrecht">Er rust auteursrecht op</option>
                <option value="anders">Anders</option>
              </select>
            </div>
            <div className="veld">
              <label htmlFor="vv-reden">Toelichting</label>
              <textarea id="vv-reden" rows={3} required minLength={3} value={reden}
                        onChange={(e) => setReden(e.target.value)} style={veldStijl} />
            </div>
            <div className="veld">
              <label htmlFor="vv-email">Je e-mailadres (voor de uitkomst)</label>
              <input id="vv-email" type="email" required value={email}
                     onChange={(e) => setEmail(e.target.value)} style={veldStijl} />
            </div>
            {melding && <p className="memo" style={{ marginTop: ".6rem" }}>{melding}</p>}
            <div className="dialoog-knoppen">
              <button className="knop knop-primair" type="submit" disabled={bezig}>
                {bezig ? "Versturen..." : "Verstuur verzoek"}
              </button>
              <button className="knop knop-secundair" type="button" onClick={() => dialoog.current?.close()}>Annuleren</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
