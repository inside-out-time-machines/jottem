"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";
import ProjectFormulier, { LEEG_PROJECT } from "../../project-formulier";

export default function NieuwProjectPagina() {
  const router = useRouter();
  const { org } = useParams<{ org: string }>();
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const headers = { "Content-Type": "application/json", ...authHeaders() };

  useEffect(() => setIngelogd(isIngelogd()), []);
  if (ingelogd === null) return <main><h1>Nieuw project</h1></main>;
  if (!ingelogd) {
    return (
      <main>
        <h1>Nieuw project</h1>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin(`/organisatiebeheer/${org}/nieuw`)}>
            Log in als organisatiebeheerder
          </button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p style={{ fontSize: ".95rem" }}><a href="/organisatiebeheer">Organisatiebeheer</a> · {org}</p>
      <h1 style={{ marginTop: ".3rem" }}>Nieuw project</h1>
      <p style={{ marginTop: ".5rem", maxWidth: "42rem" }}>
        De projectafbeelding kun je na het aanmaken uploaden via Bewerken.
      </p>
      <section style={{ marginTop: "1.5rem" }}>
        <ProjectFormulier
          begin={{ ...LEEG_PROJECT }}
          organisatieSlug={org}
          bewerkProjectId={null}
          headers={headers}
          opslaanTekst="Project aanmaken"
          onKlaar={(m) => router.push(`/organisatiebeheer?melding=${encodeURIComponent(m)}`)}
        />
      </section>
    </main>
  );
}
