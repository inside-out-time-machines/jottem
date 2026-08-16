// Licentie-informatie voor de uploadflow: naam plus uitleg op B1-taalniveau.
// De projectlicentie is een URL (Project.datasetLicentie); onbekende URL's krijgen
// een generieke uitleg met de link naar de licentietekst zelf.

export type LicentieInfo = { naam: string; uitleg: string };

const LICENTIES: Record<string, LicentieInfo> = {
  "creativecommons.org/licenses/by/4.0": {
    naam: "CC BY 4.0",
    uitleg:
      "Iedereen mag jouw bijdrage bekijken, delen en hergebruiken. Ook in een boek, " +
      "een krant of op een website. Er is één regel: de naam van de maker moet erbij staan.",
  },
  "creativecommons.org/licenses/by-sa/4.0": {
    naam: "CC BY-SA 4.0",
    uitleg:
      "Iedereen mag jouw bijdrage delen en hergebruiken, als de naam van de maker erbij " +
      "staat. Maakt iemand er iets nieuws mee? Dan moet dat onder dezelfde regels worden gedeeld.",
  },
  "creativecommons.org/licenses/by-nc/4.0": {
    naam: "CC BY-NC 4.0",
    uitleg:
      "Iedereen mag jouw bijdrage delen en hergebruiken, maar niet om er geld mee te " +
      "verdienen. De naam van de maker moet er altijd bij staan.",
  },
  "creativecommons.org/publicdomain/zero/1.0": {
    naam: "CC0 (publiek domein)",
    uitleg:
      "Jouw bijdrage wordt van iedereen. Iedereen mag er alles mee doen, ook zonder " +
      "jouw naam erbij. Dat is de meest vrije keuze.",
  },
};

export function licentieInfo(url: string | null): LicentieInfo | null {
  if (!url) return null;
  for (const [sleutel, info] of Object.entries(LICENTIES)) {
    if (url.includes(sleutel)) return info;
  }
  return {
    naam: url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    uitleg:
      "Voor dit project geldt een eigen licentie. Klik op de link hieronder om de " +
      "regels te lezen.",
  };
}
