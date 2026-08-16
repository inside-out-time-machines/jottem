import { apiServer } from "@/lib/api";
import Viewer from "./viewer";

type Detail = {
  mediaId: string;
  titel: string;
  beschrijving: string | null;
  genre: string | null;
  licentie: string | null;
  status: string;
  organisatie: string;
  project: string;
  metadata: Record<string, string>;
  afbeeldingUrl: string | null;
  iiifService: string | null;
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
        {jottem.organisatie} · {jottem.project}
      </p>
      <h1>{jottem.titel}</h1>
      <p style={{ marginTop: ".3rem" }}>
        <span className={`status-pil status-${jottem.status}`}>{jottem.status}</span>
      </p>
      {jottem.iiifService ? (
        <Viewer service={jottem.iiifService} titel={jottem.titel} />
      ) : (
        jottem.afbeeldingUrl && (
          <figure className="polaroid" style={{ marginTop: "1.4rem", maxWidth: "36rem" }}>
            <img src={jottem.afbeeldingUrl} alt={jottem.titel} />
            <figcaption>{jottem.titel}</figcaption>
          </figure>
        )
      )}
      {jottem.iiifManifest && (
        <p style={{ fontSize: ".85rem", color: "var(--grijs)", marginTop: ".5rem" }}>
          Open data: <a href={jottem.iiifManifest}>IIIF-manifest</a>
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
