"use client";

import { startLogin } from "@/lib/oidc";

// Inlogpoort van de beheerpagina's: dezelfde kop als de pagina zelf, met de knop die
// na de OIDC-callback terugkeert naar `terugNaar`. `null` = inlogstatus nog onbekend
// (alleen de kop, zonder knop, zodat de pagina niet flikkert).
export default function BeheerInlog({
  titel,
  terugNaar,
  rol,
  bekend,
}: {
  titel: string;
  terugNaar: string;
  rol: string;
  bekend: boolean;
}) {
  return (
    <main className="beheer">
      <header className="beheer-kop">
        <h1>{titel}</h1>
        {bekend && (
          <p style={{ marginTop: "1.2rem" }}>
            <button className="knop knop-primair" onClick={() => void startLogin(terugNaar)}>
              Log in als {rol}
            </button>
          </p>
        )}
      </header>
    </main>
  );
}
