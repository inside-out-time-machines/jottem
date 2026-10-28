"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { API_PUBLIEK, DEV_AUTH, authHeaders, isIngelogd } from "@/lib/api";
import { isActief } from "@/lib/actief";

// Rolbewuste menu-items: beheer- en moderatielinks alleen voor wie de rol heeft.
// In de dev-bypass tonen we alles (daar wissel je toch per verzoek van identiteit).
export default function NavLinks() {
  const [rollen, setRollen] = useState<string[]>([]);
  const pad = usePathname();
  // aria-current markeert de actieve pagina (toegankelijk; de topbar-CSS haakt erop in)
  const huidig = (href: string) => (isActief(pad, href) ? "page" : undefined);

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

  // Uploaden staat bewust niet in het menu: uploaden gaat altijd via een project
  // (de knoppen op de startpagina en de projectpagina's)
  return (
    <>
      {isModerator && <a href="/moderatie" aria-current={huidig("/moderatie")}>Moderatie</a>}
      {isOrganisatiebeheerder && <a href="/organisatiebeheer" aria-current={huidig("/organisatiebeheer")}>Organisatiebeheer</a>}
      {isPlatformbeheerder && <a href="/beheer" aria-current={huidig("/beheer")}>Platformbeheer</a>}
    </>
  );
}
