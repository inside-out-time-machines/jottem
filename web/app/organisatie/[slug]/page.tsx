import { API_PUBLIEK, apiServer } from "@/lib/api";
import { notFound } from "next/navigation";
import OpenGraph from "../../open-graph";
import { kopVoetCss, projectStijl } from "@/lib/kleuren";

type OrganisatiePubliek = {
  naam: string;
  slug: string;
  beschrijving: string | null;
  website: string | null;
  kleurPrimair: string | null;
  kleurSecundair: string | null;
  kleurAchtergrond: string | null;
  logoUrl: string | null;
  projecten: {
    naam: string;
    slug: string;
    oproep: string | null;
    periode: string | null;
    afbeeldingUrl: string | null;
    aantalJottems: number;
  }[];
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const organisatie = await apiServer<OrganisatiePubliek>(`/organisatie/${slug}/publiek`);
    return {
      title: `${organisatie.naam} · Jottem`,
      description: organisatie.beschrijving ?? undefined,
      alternates: {
        canonical: `/organisatie/${slug}`,
        types: {
          "application/rss+xml": [{
            url: `${API_PUBLIEK}/organisatie/${slug}/rss`,
            title: `Nieuwe jottems van ${organisatie.naam}`,
          }],
        },
      },
    };
  } catch {
    return {};
  }
}

// publieke organisatiepagina (BE-1): leesbaar zonder account
export default async function OrganisatiePagina({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let organisatie: OrganisatiePubliek;
  try {
    organisatie = await apiServer<OrganisatiePubliek>(`/organisatie/${slug}/publiek`);
  } catch {
    notFound();
  }

  // header (primaire kleur) en footer (secundaire kleur) staan in de root-layout, dus
  // die kleuren we via CSS-variabelen; React hijst dit style-blok naar de head
  const kopVoet = kopVoetCss(organisatie.kleurPrimair, organisatie.kleurSecundair);

  return (
    <main style={projectStijl(organisatie.kleurPrimair, organisatie.kleurSecundair)}>
      {kopVoet && (
        <style href={`organisatiekleuren-${slug}`} precedence="high">{kopVoet}</style>
      )}
      <OpenGraph
        titel={`${organisatie.naam} · Jottem`}
        beschrijving={organisatie.beschrijving}
        pad={`/organisatie/${slug}`}
        beeld={organisatie.logoUrl ? { url: organisatie.logoUrl, alt: `Logo van ${organisatie.naam}` } : null}
      />
      <h1 style={organisatie.kleurPrimair ? { color: organisatie.kleurPrimair } : undefined}>
        {organisatie.logoUrl && (
          <img src={organisatie.logoUrl} alt="" className="organisatie-logo" />
        )}
        {organisatie.naam}
      </h1>
      {organisatie.beschrijving && (
        <p style={{ maxWidth: "42rem", marginTop: "1rem" }}>{organisatie.beschrijving}</p>
      )}
      {organisatie.website && (
        <p style={{ marginTop: ".5rem" }}>
          <a href={organisatie.website}>{organisatie.website}</a>
        </p>
      )}

      <h2 style={{ marginTop: "2rem" }}>Projecten</h2>
      <div className="kaarten" style={{ marginTop: "1rem" }}>
        {organisatie.projecten.map((project) => (
          <article
            className="kaart"
            key={project.slug}
            style={{
              ...projectStijl(organisatie.kleurPrimair, organisatie.kleurSecundair),
              ...(organisatie.kleurPrimair ? { borderTopColor: organisatie.kleurPrimair } : {}),
            }}
          >
            {project.afbeeldingUrl && (
              <img src={project.afbeeldingUrl} alt="" style={{ maxHeight: "6rem", borderRadius: ".3rem", marginBottom: ".5rem" }} />
            )}
            <h3>{project.naam}</h3>
            {project.oproep && <p style={{ fontSize: "1rem" }}>{project.oproep}</p>}
            <p style={{ fontSize: ".9rem", color: "var(--grijs)", marginTop: ".4rem" }}>
              {project.aantalJottems} jottems{project.periode ? ` · ${project.periode}` : ""}
            </p>
            <p style={{ marginTop: ".9rem" }}>
              <a className="knop knop-primair" href={`/organisatie/${organisatie.slug}/${project.slug}`}>
                Bekijk de jottems
              </a>
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
