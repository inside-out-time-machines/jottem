// Licentie-informatie voor de weergave: korte naam, uitleg op B1-taalniveau en de link naar
// de licentietekst. Zie de merkgids (brand.iotm.nl, hoofdstuk Vormtaal, "Licenties tonen"):
// altijd de korte naam, nooit een kale URL, de naam is een link naar de tekst, en er staat
// een (i) achter met de kern in gewone taal.
//
// De opgeslagen waarde (Project.datasetLicentie, Media.licentie) is een URI en verandert
// hier niet: die gaat ongewijzigd naar RDF, het IIIF-manifest en de datasetbeschrijving.
// `tekstUrl` is puur de pagina waar een mens de regels leest, in het Nederlands waar die
// bestaat (Creative Commons deed.nl, RightsStatements ?language=nl).

// `bekend` is false als de opgeslagen URI niet in de tabel staat: dan hebben we wel een
// link, maar geen echte naam, en moeten teksten "deze licentie" zeggen in plaats van een
// naam die er geen is.
export type LicentieInfo = { naam: string; uitleg: string; tekstUrl: string; bekend: boolean };

const LICENTIES: Record<string, Omit<LicentieInfo, "bekend">> = {
  "creativecommons.org/licenses/by/4.0": {
    naam: "CC BY 4.0",
    tekstUrl: "https://creativecommons.org/licenses/by/4.0/deed.nl",
    uitleg:
      "Iedereen mag jouw bijdrage bekijken, delen en hergebruiken. Ook in een boek, " +
      "een krant of op een website. Er is één regel: de naam van de maker moet erbij staan.",
  },
  "creativecommons.org/licenses/by-sa/4.0": {
    naam: "CC BY-SA 4.0",
    tekstUrl: "https://creativecommons.org/licenses/by-sa/4.0/deed.nl",
    uitleg:
      "Iedereen mag jouw bijdrage delen en hergebruiken, als de naam van de maker erbij " +
      "staat. Maakt iemand er iets nieuws mee? Dan moet dat onder dezelfde regels worden gedeeld.",
  },
  "creativecommons.org/licenses/by-nc/4.0": {
    naam: "CC BY-NC 4.0",
    tekstUrl: "https://creativecommons.org/licenses/by-nc/4.0/deed.nl",
    uitleg:
      "Iedereen mag jouw bijdrage delen en hergebruiken, maar niet om er geld mee te " +
      "verdienen. De naam van de maker moet er altijd bij staan.",
  },
  "creativecommons.org/licenses/by-nd/4.0": {
    naam: "CC BY-ND 4.0",
    tekstUrl: "https://creativecommons.org/licenses/by-nd/4.0/deed.nl",
    uitleg:
      "Iedereen mag jouw bijdrage bekijken en delen, met de naam van de maker erbij. " +
      "Aanpassen mag niet: wat je deelt, blijft zoals het is.",
  },
  "creativecommons.org/licenses/by-nc-sa/4.0": {
    naam: "CC BY-NC-SA 4.0",
    tekstUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.nl",
    uitleg:
      "Iedereen mag jouw bijdrage delen en er iets nieuws mee maken, maar niet om er geld " +
      "mee te verdienen. De naam van de maker moet erbij, en het nieuwe werk moet onder " +
      "dezelfde regels worden gedeeld.",
  },
  "creativecommons.org/licenses/by-nc-nd/4.0": {
    naam: "CC BY-NC-ND 4.0",
    tekstUrl: "https://creativecommons.org/licenses/by-nc-nd/4.0/deed.nl",
    uitleg:
      "Iedereen mag jouw bijdrage bekijken en delen, met de naam van de maker erbij. " +
      "Aanpassen mag niet, en er geld mee verdienen ook niet.",
  },
  "creativecommons.org/publicdomain/zero/1.0": {
    naam: "CC0 1.0",
    tekstUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.nl",
    uitleg:
      "Jouw bijdrage wordt van iedereen. Iedereen mag er alles mee doen, ook zonder " +
      "jouw naam erbij. Dat is de meest vrije keuze.",
  },
  "creativecommons.org/publicdomain/mark/1.0": {
    naam: "PDM 1.0",
    tekstUrl: "https://creativecommons.org/publicdomain/mark/1.0/deed.nl",
    uitleg:
      "Op dit materiaal rust geen auteursrecht meer. Iedereen mag er alles mee doen, " +
      "ook zonder de naam van de maker erbij.",
  },
  "rightsstatements.org/vocab/inc/1.0": {
    naam: "InC 1.0",
    tekstUrl: "https://rightsstatements.org/page/InC/1.0/?language=nl",
    uitleg:
      "Op dit materiaal rust nog auteursrecht. Je mag het hier bekijken, maar wil je het " +
      "ergens anders gebruiken? Vraag dan eerst toestemming aan de rechthebbende.",
  },
  "rightsstatements.org/vocab/inc-edu/1.0": {
    naam: "InC-EDU 1.0",
    tekstUrl: "https://rightsstatements.org/page/InC-EDU/1.0/?language=nl",
    uitleg:
      "Op dit materiaal rust nog auteursrecht. Je mag het bekijken en gebruiken voor " +
      "onderwijs en onderzoek. Voor ander gebruik heb je toestemming nodig.",
  },
  "rightsstatements.org/vocab/noc-nc/1.0": {
    naam: "NoC-NC 1.0",
    tekstUrl: "https://rightsstatements.org/page/NoC-NC/1.0/?language=nl",
    uitleg:
      "Op dit materiaal rust geen auteursrecht meer. De organisatie die het bewaart vraagt " +
      "je wel om er geen geld mee te verdienen.",
  },
  "rightsstatements.org/vocab/cne/1.0": {
    naam: "CNE 1.0",
    tekstUrl: "https://rightsstatements.org/page/CNE/1.0/?language=nl",
    uitleg:
      "Niemand heeft nog uitgezocht of er auteursrecht op dit materiaal rust. Wil je het " +
      "gebruiken? Zoek dat dan eerst zelf uit, of vraag het aan de organisatie.",
  },
};

// Maakt van een licentie-URI een sleutel voor de tabel hierboven. Nodig omdat dezelfde
// licentie in verschillende vormen wordt opgeslagen: het IIIF-manifest eist http://, elders
// gebruiken we https://, RightsStatements heeft naast /vocab/ ook een /page/-variant, en een
// deed- of legalcode-achtervoegsel verwijst nog steeds naar dezelfde licentie.
function sleutel(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[?#]/)[0]
    .replace("/page/", "/vocab/")
    .replace(/\/(deed|legalcode)(\.[a-z-]+)?\/?$/, "")
    .replace(/\/+$/, "");
}

export function licentieInfo(url: string | null | undefined): LicentieInfo | null {
  if (!url) return null;
  const gevonden = LICENTIES[sleutel(url)];
  if (gevonden) return { ...gevonden, bekend: true };
  // Onbekende licentie: nooit de URL als naam tonen (regel 1 van de merkgids). De link
  // wijst dan naar de opgeslagen waarde zelf, want een andere tekst kennen we niet.
  return {
    naam: "Eigen licentie",
    bekend: false,
    tekstUrl: url,
    uitleg:
      "Voor dit project geldt een eigen licentie. Lees de regels in de licentietekst " +
      "hieronder.",
  };
}
