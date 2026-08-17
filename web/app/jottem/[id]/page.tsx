import { apiServer } from "@/lib/api";
import Interactief, { Detail as InteractiefDetail } from "./interactief";

type Detail = InteractiefDetail & {
  beschrijving: string | null;
  genre: string | null;
  licentie: string | null;
  status: string;
  organisatie: string;
  organisatieSlug: string;
  project: string;
  projectSlug: string;
  metadata: Record<string, string>;
  iiifManifest: string | null;
  publicatieDatum: string | null;
};

export default async function JottemPagina({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let jottem: Detail;
  try {
    jottem = await apiServer<Detail>(`/jottem/${id}/detail`);
  } catch {
    return (
      <main>
        <h1>Jottem niet gevonden</h1>
        <p>Deze jottem bestaat niet of is nog niet gepubliceerd.</p>
      </main>
    );
  }

  return (
    <main>
      <p style={{ fontSize: ".9rem", color: "var(--grijs)" }}>
        <a href={`/organisatie/${jottem.organisatieSlug}`}>{jottem.organisatie}</a>
        {" · "}
        <a href={`/organisatie/${jottem.organisatieSlug}/${jottem.projectSlug}`}>{jottem.project}</a>
      </p>
      <h1>{jottem.titel}</h1>
      <p style={{ marginTop: ".3rem" }}>
        <span className={`status-pil status-${jottem.status}`}>{jottem.status}</span>
      </p>

      <Interactief detail={jottem} />

      {jottem.iiifManifest && (
        <p style={{ fontSize: ".85rem", color: "var(--grijs)", marginTop: "1rem" }}>
          Open data: <a href={jottem.iiifManifest}>IIIF-manifest</a>
          {jottem.annotatiesUrl && (
            <> · <a href={jottem.annotatiesUrl}>webannotaties (W3C)</a></>
          )}
        </p>
      )}
      {jottem.beschrijving && <p style={{ marginTop: "1.2rem", maxWidth: "42rem" }}>{jottem.beschrijving}</p>}
      <table className="lijst" style={{ maxWidth: "36rem" }}>
        <tbody>
          {jottem.genre && (
            <tr><th>Genre</th><td>{jottem.genre}</td></tr>
          )}
          {jottem.licentie && (
            <tr><th>Licentie</th><td><a href={jottem.licentie}>{jottem.licentie}</a></td></tr>
          )}
          {Object.entries(jottem.metadata).map(([veld, waarde]) => (
            <tr key={veld}><th>{veld}</th><td>{waarde}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
