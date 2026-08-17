import { apiServer } from "@/lib/api";
import Interactief, { Detail as InteractiefDetail } from "./interactief";

type Detail = InteractiefDetail & {
  beschrijving: string | null;
  genre: string | null;
  licentie: string | null;
  status: string;
  organisatie: string;
  organisatieSlug: string;
  organisatieLogoUrl: string | null;
  project: string;
  projectSlug: string;
  metadata: Record<string, string>;
  iiifManifest: string | null;
  publicatieDatum: string | null;
  bron: string;
  bronUrl: string | null;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const jottem = await apiServer<Detail>(`/jottem/${id}/detail`);
    if (jottem.status !== "goedgekeurd") return {};
    // duurzame og:image: de (eigen of externe) IIIF-service of de bron-URL;
    // presigned S3-URL's verlopen en zijn ongeschikt voor social previews
    const beeld = jottem.iiifService
      ? `${jottem.iiifService}/full/!1200,1200/0/default.jpg`
      : jottem.bron === "url"
        ? jottem.bronUrl
        : jottem.afbeeldingUrl;
    const beschrijving = jottem.beschrijving
      ?? `Een jottem uit het project ${jottem.project} van ${jottem.organisatie}.`;
    return {
      title: `${jottem.titel} · Jottem`,
      description: beschrijving,
      openGraph: {
        type: "article",
        locale: "nl_NL",
        url: `/jottem/${id}`,
        title: jottem.titel,
        description: beschrijving,
        images: beeld ? [{ url: beeld, alt: jottem.titel }] : undefined,
      },
    };
  } catch {
    return {};
  }
}

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
        {jottem.organisatieLogoUrl && (
          <img src={jottem.organisatieLogoUrl} alt="" className="organisatie-logo-klein" />
        )}
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
          {jottem.bronUrl && (
            <tr><th>Bron</th><td>
              <a href={jottem.bronUrl} rel="noopener noreferrer" target="_blank">{jottem.bronUrl}</a>
              {jottem.bron === "iiif" && <span style={{ fontSize: ".85rem", color: "var(--grijs)" }}> (IIIF, uit een beeldbank)</span>}
            </td></tr>
          )}
          {Object.entries(jottem.metadata).map(([veld, waarde]) => (
            <tr key={veld}><th>{veld}</th><td>{waarde}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
