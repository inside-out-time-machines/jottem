// Wie heeft dit geplaatst, en wanneer: profielfoto (of een neutraal poppetje) met een
// zin in de stijl van GitHub. Gebruikt bij een jottem, een annotatie en een reactie.

const ANONIEM = "Een Jottem-gebruiker";

/** "vandaag", "gisteren", "3 dagen geleden" of, vanaf een maand, de datum zelf. */
export function wanneer(datum: string | null | undefined): string | null {
  if (!datum) return null;
  const toen = new Date(datum);
  if (Number.isNaN(toen.getTime())) return null;
  const dag = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const dagen = Math.round((dag(new Date()) - dag(toen)) / 86400000);
  if (dagen <= 0) return "vandaag";
  if (dagen === 1) return "gisteren";
  if (dagen < 30) return `${dagen} dagen geleden`;
  return `op ${toen.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}`;
}

export default function Deelnemer({
  naam,
  afbeeldingUrl,
  datum,
  wat = "dit",
}: {
  naam?: string | null;
  afbeeldingUrl?: string | null;
  datum?: string | null;
  wat?: string;          // "dit", "deze jottem", ...
}) {
  const moment = wanneer(datum);
  // oudere annotaties bewaarden "Een deelnemer" als anonieme naam
  const label = !naam || naam === "Een deelnemer" ? ANONIEM : naam;
  return (
    <span className="deelnemer">
      {afbeeldingUrl ? (
        <img className="deelnemer-foto" src={afbeeldingUrl} alt="" />
      ) : (
        <span className="deelnemer-foto deelnemer-leeg" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.5-8 5.5V22h16v-2.5c0-3-3.6-5.5-8-5.5Z" />
          </svg>
        </span>
      )}
      <span>
        <strong>{label}</strong> heeft {wat}
        {moment ? ` ${moment}` : ""} geplaatst
      </span>
    </span>
  );
}
