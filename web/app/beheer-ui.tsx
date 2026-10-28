import type { ReactNode } from "react";

// Bouwstenen voor de beheerpagina's (organisatiebeheer, platformbeheer, moderatie,
// profiel): twee kolommen met kaarten links en een plakkende actiebalk rechts, zie
// de klassen onder "beheerpagina's" in globals.css en de merkgids (brand.iotm.nl).

export function BeheerPagina({
  kruimels,
  titel,
  etiket,
  intro,
  zijbalk,
  children,
}: {
  kruimels?: ReactNode;
  titel: ReactNode;
  etiket?: ReactNode;
  intro?: ReactNode;
  zijbalk?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="beheer">
      <header className="beheer-kop">
        {kruimels && <p className="kruimels">{kruimels}</p>}
        <h1>
          {titel}
          {etiket && <span className="etiket">{etiket}</span>}
        </h1>
        {intro && <p className="beheer-intro">{intro}</p>}
      </header>
      <div className="beheer-inhoud">{children}</div>
      {zijbalk && <aside className="actiebalk">{zijbalk}</aside>}
    </main>
  );
}

export function KaartSectie({
  titel,
  intro,
  id,
  children,
}: {
  titel: ReactNode;
  intro?: ReactNode;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className="kaart-sectie" id={id}>
      <h2>{titel}</h2>
      {intro && <p className="kaart-intro">{intro}</p>}
      <div className="kaart-inhoud">{children}</div>
    </section>
  );
}

export type SamenvattingRegel = { label: string; waarde: ReactNode };

export function Actiebalk({
  samenvatting,
  voet,
  children,
}: {
  samenvatting?: SamenvattingRegel[];
  voet?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      {samenvatting && samenvatting.length > 0 && (
        <dl className="samenvatting">
          {samenvatting.map((regel) => (
            <div key={regel.label} style={{ display: "contents" }}>
              <dt>{regel.label}</dt>
              <dd>{regel.waarde}</dd>
            </div>
          ))}
        </dl>
      )}
      {children && <div className="actiebalk-knoppen">{children}</div>}
      {voet && <div className="actiebalk-voet">{voet}</div>}
    </>
  );
}

export function Veld({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="veld">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="veld-label">{label}</span>}
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function StatusPil({ soort, children }: { soort: string; children: ReactNode }) {
  return <span className={`status-pil status-${soort}`}>{children}</span>;
}
