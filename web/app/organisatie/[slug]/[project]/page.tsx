import { API_PUBLIEK, apiServer } from "@/lib/api";
import { notFound } from "next/navigation";

type JottemTegel = {
  mediaId: string;
  titel: string;
  thumbnailUrl: string | null;
  publicatieDatum: string | null;
};
type ProjectPubliek = {
  projectId: string;
  naam: string;
  slug: string;
  organisatieSlug: string;
  organisatieNaam: string;
  kleurPrimair: string | null;
  logoUrl: string | null;
  beschrijving: string | null;
  oproep: string | null;
  periode: string | null;
  datasetLicentie: string | null;
  afbeeldingUrl: string | null;
  aantalJottems: number;
  jottems: JottemTegel[];
  pagina: number;
  paginas: number;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; project: string }>;
}) {
  const { slug, project: projectSlug } = await params;
  try {
    const project = await apiServer<ProjectPubliek>(
      `/organisatie/${slug}/project/${projectSlug}/publiek`,
    );
    const afbeelding = project.afbeeldingUrl ?? project.logoUrl;
    return {
      title: `${project.naam} · ${project.organisatieNaam}`,
      description: project.oproep ?? project.beschrijving ?? undefined,
      // de RSS-feed van dit project als alternate-link in de head
      alternates: {
        types: {
          "application/rss+xml": [{
            url: `${API_PUBLIEK}/project/${project.projectId}/rss`,
            title: `Nieuwe jottems in ${project.naam}`,
          }],
        },
      },
      openGraph: {
        type: "website",
        locale: "nl_NL",
        url: `/organisatie/${slug}/${projectSlug}`,
        title: `${project.naam} · ${project.organisatieNaam}`,
        description: project.oproep ?? project.beschrijving ?? undefined,
        images: afbeelding
          ? [{ url: afbeelding, alt: `${project.naam} (${project.organisatieNaam})` }]
          : undefined,   // zonder eigen beeld geldt het woordmerk uit de layout
      },
    };
  } catch {
    return {};
  }
}

// publieke projectpagina met alle gepubliceerde jottems (BE-1/BE-2): zonder account
export default async function ProjectPagina({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; project: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const { slug, project: projectSlug } = await params;
  const { pagina } = await searchParams;
  let project: ProjectPubliek;
  try {
    project = await apiServer<ProjectPubliek>(
      `/organisatie/${slug}/project/${projectSlug}/publiek?pagina=${Number(pagina) || 1}`,
    );
  } catch {
    notFound();
  }

  const kleur = project.kleurPrimair ?? "var(--oranje)";

  return (
    <main>
      {project.logoUrl && (
        <img src={project.logoUrl} alt="" className="organisatie-logo organisatie-logo-rechts" />
      )}
      <p style={{ fontSize: ".95rem" }}>
        <a href={`/organisatie/${project.organisatieSlug}`}>{project.organisatieNaam}</a>
      </p>
      <h1 style={{ color: kleur, marginTop: ".3rem" }}>{project.naam}</h1>
      {project.oproep && (
        <p style={{ maxWidth: "42rem", marginTop: ".8rem", fontSize: "1.1rem" }}>{project.oproep}</p>
      )}
      {project.beschrijving && (
        <p style={{ maxWidth: "42rem", marginTop: ".6rem" }}>{project.beschrijving}</p>
      )}
      <p style={{ fontSize: ".9rem", color: "var(--grijs)", marginTop: ".6rem" }}>
        {project.aantalJottems} gepubliceerde jottems
        {project.periode ? ` · periode ${project.periode}` : ""}
        {project.datasetLicentie ? (
          <> · licentie <a href={project.datasetLicentie}>{project.datasetLicentie.replace("https://creativecommons.org/licenses/", "CC ").replace("/4.0/", " 4.0").toUpperCase()}</a></>
        ) : null}
      </p>
      <p style={{ marginTop: "1rem" }}>
        <a className="knop knop-primair" href={`/upload?project=${project.organisatieSlug}/${project.slug}`}>
          Doe mee: upload je materiaal
        </a>
      </p>

      {project.jottems.length === 0 ? (
        <p className="memo" style={{ marginTop: "2rem" }}>
          Nog geen gepubliceerde jottems; wees de eerste en deel je materiaal!
        </p>
      ) : (
        <div className="kaarten" style={{ marginTop: "2rem" }}>
          {project.jottems.map((jottem) => (
            <a
              key={jottem.mediaId}
              href={`/jottem/${jottem.mediaId}`}
              className="kaart"
              style={{ textDecoration: "none", color: "inherit", borderTopColor: kleur }}
            >
              {jottem.thumbnailUrl && (
                <img
                  src={jottem.thumbnailUrl}
                  alt={jottem.titel}
                  style={{ width: "100%", height: "11rem", objectFit: "cover", borderRadius: ".3rem" }}
                />
              )}
              <h3 style={{ marginTop: ".6rem", fontSize: "1.05rem" }}>{jottem.titel}</h3>
              {jottem.publicatieDatum && (
                <p style={{ fontSize: ".85rem", color: "var(--grijs)" }}>
                  {new Date(jottem.publicatieDatum).toLocaleDateString("nl-NL")}
                </p>
              )}
            </a>
          ))}
        </div>
      )}

      <p style={{ fontSize: ".85rem", color: "var(--grijs)", marginTop: "2rem" }}>
        Open data:{" "}
        <a href={`${process.env.NEXT_PUBLIC_API_URL ?? "https://api.dev.iotm.nl"}/project/${project.projectId}/rss`}>RSS</a>
        {" · "}
        <a href={`${process.env.NEXT_PUBLIC_API_URL ?? "https://api.dev.iotm.nl"}/project/${project.projectId}/iiif/collection`}>IIIF-collectie</a>
        {" · "}
        <a href={`${process.env.NEXT_PUBLIC_DATA_URL ?? "https://data.dev.iotm.nl"}/project/${project.projectId}/dataset`}>datasetbeschrijving</a>
        {" · "}
        <a href={`${process.env.NEXT_PUBLIC_DATA_URL ?? "https://data.dev.iotm.nl"}/project/${project.projectId}/dump.nt.gz`}>datadump (RDF)</a>
      </p>

      {project.paginas > 1 && (
        <p style={{ marginTop: "1.5rem", display: "flex", gap: ".6rem" }}>
          {project.pagina > 1 && (
            <a className="knop knop-secundair" href={`?pagina=${project.pagina - 1}`}>Vorige</a>
          )}
          <span style={{ alignSelf: "center", fontSize: ".95rem" }}>
            Pagina {project.pagina} van {project.paginas}
          </span>
          {project.pagina < project.paginas && (
            <a className="knop knop-secundair" href={`?pagina=${project.pagina + 1}`}>Volgende</a>
          )}
        </p>
      )}
    </main>
  );
}
