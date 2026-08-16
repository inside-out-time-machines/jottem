"use client";

import { useCallback, useEffect, useState } from "react";
import { API_PUBLIEK, authHeaders, isIngelogd } from "@/lib/api";
import { startLogin } from "@/lib/oidc";

type Jottem = {
  mediaId: string;
  titel: string;
  status: string;
  genre: string | null;
  creatieDatum: string;
  afkeurReden: string | null;
  duurzameUrl: string | null;
  herkenbaar: boolean | null;
  toestemming: string | null;
};

const ORGANISATIE = "samh"; // fundament: één organisatie; later uit de ingelogde rol

export default function ModeratiePagina() {
  const [jottems, setJottems] = useState<Jottem[]>([]);
  const [melding, setMelding] = useState<string | null>(null);
  const [ingelogd, setIngelogd] = useState<boolean | null>(null);

  useEffect(() => {
    setIngelogd(isIngelogd());
  }, []);

  const headers = { "Content-Type": "application/json", ...authHeaders("dev-mona", "Mona Moderator") };

  const laden = useCallback(() => {
    if (!isIngelogd()) return;
    fetch(`${API_PUBLIEK}/organisatie/${ORGANISATIE}/moderatie/jottems`, { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
        return r.json();
      })
      .then(setJottems)
      .catch((fout) => setMelding(`Wachtrij laden mislukt: ${fout.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(laden, [laden]);

  async function beoordeel(mediaId: string, besluit: "goedgekeurd" | "afgekeurd") {
    let reden: string | null = null;
    if (besluit === "afgekeurd") {
      reden = window.prompt("Reden van afkeuring (verplicht):");
      if (!reden) return;
    }
    const antwoord = await fetch(`${API_PUBLIEK}/jottem/${mediaId}/status`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ besluit, reden }),
    });
    if (!antwoord.ok) {
      setMelding(`Beoordelen mislukt: ${(await antwoord.json()).detail ?? antwoord.statusText}`);
      return;
    }
    setMelding(besluit === "goedgekeurd" ? "Goedgekeurd en gepubliceerd." : "Afgekeurd; de uploader krijgt een mail met de reden.");
    laden();
  }

  if (ingelogd === null) {
    return <main><h1>Moderatie</h1></main>;
  }
  if (!ingelogd) {
    return (
      <main>
        <h1>Moderatie</h1>
        <p style={{ marginTop: "1.2rem" }}>
          <button className="knop knop-primair" onClick={() => void startLogin("/moderatie")}>
            Log in als moderator
          </button>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Moderatie</h1>
      <p style={{ marginTop: ".5rem" }}>
        Alle jottems van <strong>Streekarchief Midden-Holland</strong>.
      </p>
      {melding && <p className="memo" style={{ marginTop: "1rem" }}>{melding}</p>}
      <table className="lijst">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Status</th>
            <th>Ingediend</th>
            <th>Actie</th>
          </tr>
        </thead>
        <tbody>
          {jottems.map((jottem) => (
            <tr key={jottem.mediaId}>
              <td>
                <a href={`/jottem/${jottem.mediaId}`}>{jottem.titel}</a>
                {jottem.herkenbaar && (
                  <div>
                    <span
                      className={`status-pil ${jottem.toestemming === "ja" ? "status-goedgekeurd" : "status-afgekeurd"}`}
                      title="Signaal van de Herkenbaar API plus de verklaring van de uploader"
                    >
                      herkenbaar · toestemming: {jottem.toestemming}
                    </span>
                  </div>
                )}
                {jottem.afkeurReden && (
                  <div style={{ fontSize: ".85rem", color: "var(--grijs)" }}>
                    reden: {jottem.afkeurReden}
                  </div>
                )}
              </td>
              <td>
                <span className={`status-pil status-${jottem.status}`}>{jottem.status}</span>
              </td>
              <td>{new Date(jottem.creatieDatum).toLocaleDateString("nl-NL")}</td>
              <td>
                {jottem.status === "nieuw" && (
                  <span style={{ display: "flex", gap: ".5rem" }}>
                    <button className="knop knop-primair" onClick={() => beoordeel(jottem.mediaId, "goedgekeurd")}>
                      Goedkeuren
                    </button>
                    <button className="knop knop-secundair" onClick={() => beoordeel(jottem.mediaId, "afgekeurd")}>
                      Afkeuren
                    </button>
                  </span>
                )}
                {jottem.duurzameUrl && <a href={jottem.duurzameUrl}>bekijk</a>}
              </td>
            </tr>
          ))}
          {jottems.length === 0 && (
            <tr>
              <td colSpan={4}>Geen jottems in de wachtrij.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
