import { apiServer } from "@/lib/api";

type Project = {
  projectId: string;
  naam: string;
  slug: string;
  oproep: string | null;
  datasetLicentie: string | null;
};
type Organisatie = {
  slug: string;
  naam: string;
  beschrijving: string | null;
  kleurPrimair: string | null;
  logoUrl: string | null;
  projecten: Project[];
};

export default async function Home() {
  let organisaties: Organisatie[] = [];
  try {
    organisaties = await apiServer<Organisatie[]>("/organisaties");
  } catch {
    // API nog niet beschikbaar: toon de lege staat
  }

  return (
    <main>
      <img
        src="/logo/jottem-woordmerk.svg"
        alt="Jottem"
        style={{ width: "min(340px, 70%)", height: "auto" }}
      />
      <h1 style={{ marginTop: "1.2rem", maxWidth: "22ch" }}>
        Maak erfgoed <em style={{ color: "var(--oranje)" }}>van</em> iedereen,{" "}
        <em style={{ color: "var(--oranje)" }}>door</em> iedereen.
      </h1>
      <p style={{ maxWidth: "42rem", marginTop: "1rem" }}>
        In elk huis staat wel een schoenendoos vol foto&apos;s. Deel ze, vertel
        erbij wat jij weet, en bewaar ze voor altijd. Dit is de
        ontwikkelomgeving van het Jottem-platform.
      </p>

      {organisaties.map((organisatie) => (
        <section key={organisatie.slug} style={{ marginTop: "2.5rem" }}>
          {/* PB-2: de organisatiehuisstijl (kleur + logo) over de Jottem-basislaag */}
          <h2 style={organisatie.kleurPrimair ? { color: organisatie.kleurPrimair } : undefined}>
            {organisatie.logoUrl && (
              <img
                src={organisatie.logoUrl}
                alt=""
                style={{ height: "1.6rem", width: "auto", marginRight: ".6rem", verticalAlign: "-0.2rem" }}
              />
            )}
            {organisatie.naam}
          </h2>
          {organisatie.beschrijving && <p>{organisatie.beschrijving}</p>}
          <div className="kaarten">
            {organisatie.projecten.map((project) => (
              <article
                className="kaart"
                key={project.projectId}
                style={organisatie.kleurPrimair ? { borderTopColor: organisatie.kleurPrimair } : undefined}
              >
                <h3>
                  <a href={`/organisatie/${organisatie.slug}/${project.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                    {project.naam}
                  </a>
                </h3>
                {project.oproep && <p style={{ fontSize: "1rem" }}>{project.oproep}</p>}
                <p style={{ marginTop: ".9rem", display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                  <a className="knop knop-secundair" href={`/organisatie/${organisatie.slug}/${project.slug}`}>
                    Bekijk de jottems
                  </a>
                  <a className="knop knop-primair" href={`/upload?project=${organisatie.slug}/${project.slug}`}>
                    Doe mee: upload je materiaal
                  </a>
                </p>
              </article>
            ))}
          </div>
        </section>
      ))}
      {organisaties.length === 0 && (
        <p className="memo" style={{ marginTop: "2rem" }}>
          De API is nog niet bereikbaar of niet geseed; start de stack en draai
          de seed.
        </p>
      )}
    </main>
  );
}
