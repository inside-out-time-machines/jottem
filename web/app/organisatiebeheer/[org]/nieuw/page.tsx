"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authHeaders, isIngelogd } from "@/lib/api";
import BeheerInlog from "../../../beheer-inlog";
import { Actiebalk, BeheerPagina } from "../../../beheer-ui";
import ProjectFormulier, { LEEG_PROJECT, PROJECT_FORMULIER_ID } from "../../project-formulier";

export default function NieuwProjectPagina() {
  const router = useRouter();
  const { org } = useParams<{ org: string }>();
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const headers = { "Content-Type": "application/json", ...authHeaders() };

  useEffect(() => setIngelogd(isIngelogd()), []);
  if (!ingelogd) {
    return <BeheerInlog titel="Nieuw project" terugNaar={`/organisatiebeheer/${org}/nieuw`}
                        rol="organisatiebeheerder" bekend={ingelogd === false} />;
  }

  return (
    <BeheerPagina
      kruimels={<><a href="/organisatiebeheer">Organisatiebeheer</a> · {org}</>}
      titel="Nieuw project"
      intro="De projectafbeelding kun je na het aanmaken uploaden via Bewerken."
      zijbalk={
        <Actiebalk voet="Na het aanmaken kom je terug op het organisatiebeheer.">
          <button className="knop knop-primair" type="submit" form={PROJECT_FORMULIER_ID}>Project aanmaken</button>
          <a className="knop knop-secundair" href="/organisatiebeheer">Annuleren</a>
        </Actiebalk>
      }
    >
      {melding && <p className="memo memo-blok">{melding}</p>}
      <ProjectFormulier
        begin={{ ...LEEG_PROJECT }}
        organisatieSlug={org}
        bewerkProjectId={null}
        headers={headers}
        onMelding={setMelding}
        onKlaar={(m) => router.push(`/organisatiebeheer?melding=${encodeURIComponent(m)}`)}
      />
    </BeheerPagina>
  );
}
