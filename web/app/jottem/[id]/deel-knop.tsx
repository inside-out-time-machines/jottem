"use client";

import { useEffect, useState } from "react";

// Delen via de Web Share API (het deelmenu van het apparaat zelf). Kent de browser die API
// niet, zoals veel desktopbrowsers, dan kopieert dezelfde knop de link naar het klembord
// (BE-6). De check staat in een effect, zodat server- en clientweergave gelijk starten
// (geen hydratatieverschil); tot dan toont de knop de kopieervariant.
export default function DeelKnop({
  titel,
  tekst,
  url,
}: {
  titel: string;
  tekst?: string;
  url: string;
}) {
  const [kanDelen, setKanDelen] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);

  useEffect(() => {
    setKanDelen(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function kopieer() {
    try {
      await navigator.clipboard.writeText(url);
      setGekopieerd(true);
      window.setTimeout(() => setGekopieerd(false), 2500);
    } catch {
      // geen klembordtoegang (bijv. geen https of geen toestemming): de link tonen
      window.prompt("Kopieer de link naar deze jottem:", url);
    }
  }

  return (
    <button
      type="button"
      className="knop knop-delen"
      onClick={() => {
        if (kanDelen) {
          void navigator.share({ title: titel, text: tekst, url }).catch(() => {});
        } else {
          void kopieer();
        }
      }}
    >
      <span aria-hidden="true" style={{ marginRight: ".4rem" }}>⇪</span>
      {kanDelen ? "Deel deze jottem" : gekopieerd ? "Link gekopieerd" : "Kopieer de link"}
      <span className="sr-only" aria-live="polite">{gekopieerd ? "De link is gekopieerd" : ""}</span>
    </button>
  );
}
