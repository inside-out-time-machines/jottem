"use client";

import { useEffect, useState } from "react";
import { verwerkCallback } from "@/lib/oidc";

export default function CallbackPagina() {
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    verwerkCallback()
      .then((terug) => window.location.replace(terug))
      .catch((f) => setFout((f as Error).message));
  }, []);

  return (
    <main>
      <h1>Inloggen</h1>
      {fout ? (
        <p className="memo" style={{ marginTop: "1rem" }}>
          Inloggen is niet gelukt: {fout}. <a href="/">Terug naar de startpagina</a>
        </p>
      ) : (
        <p style={{ marginTop: "1rem" }}>Een ogenblik, je wordt ingelogd...</p>
      )}
    </main>
  );
}
