"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";
import OrganisatieFormulier, { LEGE_ORGANISATIE } from "../organisatie-formulier";

export default function NieuweOrganisatiePagina() {
  const router = useRouter();
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const headers = { "Content-Type": "application/json", ...authHeaders() };

  useEffect(() => setIngelogd(isIngelogd()), []);
  if (ingelogd === null) return <main><h1>Nieuwe organisatie</h1></main>;
  if (!ingelogd) {
    return (
      <main>
        <h1>Nieuwe organisatie</h1>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin("/beheer/nieuw")}>
            Log in als platformbeheerder
          </button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p style={{ fontSize: ".95rem" }}><a href="/beheer">Platformbeheer</a></p>
      <h1 style={{ marginTop: ".3rem" }}>Nieuwe organisatie</h1>
      <p style={{ marginTop: ".5rem", maxWidth: "42rem" }}>
        Er wordt automatisch een eerste project bij aangemaakt; logo en favicon kun je
        na het aanmaken uploaden via Bewerken.
      </p>
      <section style={{ marginTop: "1.5rem" }}>
        <OrganisatieFormulier
          begin={{ ...LEGE_ORGANISATIE }}
          bewerkSlug={null}
          headers={headers}
          opslaanTekst="Organisatie aanmaken"
          onKlaar={(melding) => router.push(`/beheer?melding=${encodeURIComponent(melding)}`)}
        />
      </section>
    </main>
  );
}
