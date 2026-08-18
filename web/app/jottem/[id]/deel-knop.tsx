"use client";

import { useEffect, useState } from "react";

// Delen via de Web Share API (het deelmenu van het apparaat zelf). De knop verschijnt
// alleen als de client die API heeft; zonder ondersteuning tonen we niets, want dan
// valt er niets te delen zonder eigen deelmenu. De check staat in een effect, zodat
// server- en clientweergave gelijk starten (geen hydratatieverschil).
export default function DeelKnop({
  titel,
  tekst,
  url,
}: {
  titel: string;
  tekst?: string;
  url: string;
}) {
  const [kan, setKan] = useState(false);

  useEffect(() => {
    setKan(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  if (!kan) return null;

  return (
    <button
      type="button"
      className="knop knop-delen"
      onClick={() => { void navigator.share({ title: titel, text: tekst, url }).catch(() => {}); }}
    >
      <span aria-hidden="true" style={{ marginRight: ".4rem" }}>⇪</span>
      Deel deze jottem
    </button>
  );
}
