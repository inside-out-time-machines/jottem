"use client";

import { useEffect, useState } from "react";
import { API_PUBLIEK, DEV_AUTH, authHeaders, isIngelogd } from "@/lib/api";

// Rolbewuste menu-items: beheer- en moderatielinks alleen voor wie de rol heeft.
// In de dev-bypass tonen we alles (daar wissel je toch per verzoek van identiteit).
export default function NavLinks() {
  const [rollen, setRollen] = useState<string[]>([]);

  useEffect(() => {
    if (DEV_AUTH) {
      setRollen(["moderator", "organisatiebeheerder", "platformbeheerder"]);
      return;
    }
    if (!isIngelogd()) return;
    fetch(`${API_PUBLIEK}/mijn/profiel`, { headers: authHeaders("") })
      .then((r) => (r.ok ? r.json() : null))
      .then((profiel) => {
        if (profiel) setRollen(profiel.rollen.map((r: { rol: string }) => r.rol));
      })
      .catch(() => {});
  }, []);

  const isPlatformbeheerder = rollen.includes("platformbeheerder");
  const isOrganisatiebeheerder = rollen.includes("organisatiebeheerder") || isPlatformbeheerder;
  const isModerator = rollen.includes("moderator") || isPlatformbeheerder;

  return (
    <>
      <a href="/upload">Uploaden</a>
      {isModerator && <a href="/moderatie">Moderatie</a>}
      {isOrganisatiebeheerder && <a href="/organisatiebeheer">Organisatie</a>}
      {isPlatformbeheerder && <a href="/beheer">Platformbeheer</a>}
    </>
  );
}
