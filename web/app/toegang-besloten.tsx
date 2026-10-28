"use client";

import { startLogin, uitloggen } from "@/lib/oidc";

// Melding op de project- en jottempagina van een besloten project (BE-8, GE-5):
// zonder login een inlogknop, met login maar zonder lidmaatschap de uitleg.
export default function ToegangBesloten({
  toegang,
  organisatieNaam,
  terugNaar,
}: {
  toegang: "inloggen" | "geen-lid";
  organisatieNaam: string;
  terugNaar: string;
}) {
  return (
    <div className="memo" style={{ marginTop: "2rem", maxWidth: "42rem" }}>
      <p>
        <strong>Dit project is besloten.</strong> Toegang tot de jottems is op uitnodiging van {organisatieNaam}.
      </p>
      {toegang === "inloggen" ? (
        <>
          <p style={{ marginTop: ".6rem" }}>
            Ben je uitgenodigd? Log in met het e-mailadres waarop je de uitnodiging ontving.
          </p>
          <p style={{ marginTop: ".8rem" }}>
            <button className="knop knop-primair" onClick={() => void startLogin(terugNaar)}>
              Inloggen
            </button>
          </p>
        </>
      ) : (
        <>
          <p style={{ marginTop: ".6rem" }}>
            Je bent ingelogd, maar dit account is geen lid van het project. Neem contact op
            met {organisatieNaam} als je een uitnodiging verwacht, of log in met een ander account.
          </p>
          <p style={{ marginTop: ".8rem" }}>
            <button className="knop knop-secundair" onClick={() => void uitloggen()}>
              Uitloggen
            </button>
          </p>
        </>
      )}
    </div>
  );
}
