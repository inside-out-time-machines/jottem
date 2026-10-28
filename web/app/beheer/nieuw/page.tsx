"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authHeaders, isIngelogd } from "@/lib/api";
import BeheerInlog from "../../beheer-inlog";
import { Actiebalk, BeheerPagina } from "../../beheer-ui";
import OrganisatieFormulier, { LEGE_ORGANISATIE, ORGANISATIE_FORMULIER_ID } from "../organisatie-formulier";

export default function NieuweOrganisatiePagina() {
  const router = useRouter();
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const headers = { "Content-Type": "application/json", ...authHeaders() };

  useEffect(() => setIngelogd(isIngelogd()), []);
  if (!ingelogd) {
    return <BeheerInlog titel="Nieuwe organisatie" terugNaar="/beheer/nieuw"
                        rol="platformbeheerder" bekend={ingelogd === false} />;
  }

  return (
    <BeheerPagina
      kruimels={<a href="/beheer">Platformbeheer</a>}
      titel="Nieuwe organisatie"
      intro="Er wordt automatisch een eerste project bij aangemaakt; logo en favicon kun je na het aanmaken uploaden via Bewerken."
      zijbalk={
        <Actiebalk voet="Na het aanmaken kom je terug op het platformbeheer.">
          <button className="knop knop-primair" type="submit" form={ORGANISATIE_FORMULIER_ID}>Organisatie aanmaken</button>
          <a className="knop knop-secundair" href="/beheer">Annuleren</a>
        </Actiebalk>
      }
    >
      {melding && <p className="memo memo-blok">{melding}</p>}
      <OrganisatieFormulier
        begin={{ ...LEGE_ORGANISATIE }}
        bewerkSlug={null}
        headers={headers}
        onMelding={setMelding}
        onKlaar={(m) => router.push(`/beheer?melding=${encodeURIComponent(m)}`)}
      />
    </BeheerPagina>
  );
}
