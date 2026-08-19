/**
 * Rooktest op de publiekspagina's: laadt elke pagina in een echte browser en controleert
 * statuscode, consolefouten en de aanwezigheid van de kernelementen. Bedoeld als
 * nulmeting rond een uplift: dezelfde uitkomst voor en na een versiewissel.
 *
 * Draaien:  node tests/e2e/smoke.mjs
 * Instelbaar: JOTTEM_SITE_URL, JOTTEM_API_URL, PUPPETEER_PAD
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PUPPETEER_PAD = process.env.PUPPETEER_PAD ?? "/home/http/queue/node_modules/puppeteer";
const puppeteer = require(PUPPETEER_PAD);

const SITE = (process.env.JOTTEM_SITE_URL ?? "https://dev.iotm.nl").replace(/\/$/, "");
const API = (process.env.JOTTEM_API_URL ?? "https://api.dev.iotm.nl").replace(/\/$/, "");

const uitkomsten = [];
function controle(naam, geslaagd, toelichting = "") {
  uitkomsten.push({ naam, geslaagd, toelichting });
}

// de te bezoeken pagina's komen uit de API, zodat de test niet op vaste id's leunt
async function vindDoelen() {
  const organisaties = await (await fetch(`${API}/organisaties`)).json();
  const org = organisaties.find((o) => o.projecten.some((p) => p.aantalJottems > 0));
  if (!org) throw new Error("geen organisatie met gepubliceerde jottems");
  const project = org.projecten.find((p) => p.aantalJottems > 0);
  const publiek = await (
    await fetch(`${API}/organisatie/${org.slug}/project/${project.slug}/publiek`)
  ).json();
  // liefst een jottem mét annotaties, zodat de annotatielijst echt getoetst wordt
  for (const tegel of publiek.jottems) {
    const detail = await (await fetch(`${API}/jottem/${tegel.mediaId}/detail`)).json();
    if (!detail.annotatiesUrl) continue;
    const container = await fetch(detail.annotatiesUrl,
      { headers: { Accept: "application/ld+json" } });
    if (!container.ok) continue;
    const body = await container.json();
    if ((body.first?.items ?? []).length > 0) {
      return { org, project, jottemId: tegel.mediaId };
    }
  }
  return { org, project, jottemId: publiek.jottems[0].mediaId };
}

async function open(browser, url) {
  const pagina = await browser.newPage();
  const fouten = [];
  pagina.on("console", (m) => { if (m.type() === "error") fouten.push(m.text()); });
  pagina.on("pageerror", (e) => fouten.push(String(e)));
  await pagina.setViewport({ width: 1200, height: 900 });
  const antwoord = await pagina.goto(url, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 3500));
  return { pagina, status: antwoord.status(), fouten };
}

const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
try {
  const { org, project, jottemId } = await vindDoelen();

  // 1. startpagina
  {
    const { pagina, status, fouten } = await open(browser, `${SITE}/`);
    controle("home: status 200", status === 200, `status ${status}`);
    controle("home: geen consolefouten", fouten.length === 0, fouten[0] ?? "");
    const meting = await pagina.evaluate(() => ({
      kaarten: document.querySelectorAll(".kaart").length,
      ogTitel: document.querySelector('meta[property="og:title"]')?.content,
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      twitter: document.querySelectorAll('meta[name^="twitter:"]').length,
    }));
    controle("home: projectkaarten aanwezig", meting.kaarten > 0, `${meting.kaarten}`);
    controle("home: og:title", Boolean(meting.ogTitel), meting.ogTitel ?? "");
    controle("home: canonical", Boolean(meting.canonical), meting.canonical ?? "");
    controle("home: geen twitter-tags", meting.twitter === 0, `${meting.twitter}`);
    await pagina.close();
  }

  // 2. organisatiepagina: huisstijl in header en footer
  {
    const { pagina, status, fouten } = await open(browser, `${SITE}/organisatie/${org.slug}`);
    controle("organisatie: status 200", status === 200, `status ${status}`);
    controle("organisatie: geen consolefouten", fouten.length === 0, fouten[0] ?? "");
    const kleuren = await pagina.evaluate(() => ({
      kop: getComputedStyle(document.querySelector(".topbar")).backgroundColor,
      voet: getComputedStyle(document.querySelector("footer")).backgroundColor,
      knop: getComputedStyle(document.querySelector(".knop-primair"))?.backgroundColor,
    }));
    const naarRgb = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    controle("organisatie: header in primaire kleur",
      !org.kleurPrimair || kleuren.kop === naarRgb(org.kleurPrimair), kleuren.kop);
    controle("organisatie: footer in secundaire kleur",
      !org.kleurSecundair || kleuren.voet === naarRgb(org.kleurSecundair), kleuren.voet);
    controle("organisatie: knop in secundaire kleur",
      !org.kleurSecundair || kleuren.knop === naarRgb(org.kleurSecundair), kleuren.knop ?? "");
    await pagina.close();
  }

  // 3. projectpagina
  {
    const url = `${SITE}/organisatie/${org.slug}/${project.slug}`;
    const { pagina, status, fouten } = await open(browser, url);
    controle("project: status 200", status === 200, `status ${status}`);
    controle("project: geen consolefouten", fouten.length === 0, fouten[0] ?? "");
    const meting = await pagina.evaluate(() => ({
      tegels: document.querySelectorAll(".kaarten .kaart").length,
      rss: document.querySelector('link[rel="alternate"][type="application/rss+xml"]')?.href,
      opendata: [...document.querySelectorAll("a")].filter((a) =>
        /IIIF-collectie|datadump|datasetbeschrijving/i.test(a.textContent)).length,
    }));
    controle("project: jottemtegels", meting.tegels > 0, `${meting.tegels}`);
    controle("project: RSS-alternate", Boolean(meting.rss), meting.rss ?? "");
    controle("project: open-datalinks", meting.opendata >= 3, `${meting.opendata}`);
    await pagina.close();
  }

  // 4. jottempagina: viewer, annotaties, CTA's, herkomstregel
  {
    const { pagina, status, fouten } = await open(browser, `${SITE}/jottem/${jottemId}`);
    controle("jottem: status 200", status === 200, `status ${status}`);
    controle("jottem: geen consolefouten", fouten.length === 0, fouten[0] ?? "");
    const meting = await pagina.evaluate(() => ({
      viewer: Boolean(document.querySelector(".iiif-viewer canvas")),
      ctas: document.querySelectorAll(".cta-knop").length,
      annotaties: document.querySelectorAll(".annotatie").length,
      deelnemer: document.querySelectorAll(".deelnemer").length,
      deelknoppen: document.querySelectorAll(".knop-delen").length,
      ogBeeld: document.querySelector('meta[property="og:image"]')?.content,
      ogBreedte: document.querySelector('meta[property="og:image:width"]')?.content,
      annotatieRand: document.querySelector(".annotatie")
        ? getComputedStyle(document.querySelector(".annotatie")).borderColor : null,
    }));
    controle("jottem: IIIF-viewer geladen", meting.viewer);
    controle("jottem: CTA-knoppen", meting.ctas > 0, `${meting.ctas}`);
    controle("jottem: annotaties zichtbaar", meting.annotaties > 0, `${meting.annotaties}`);
    controle("jottem: herkomstregel", meting.deelnemer > 0, `${meting.deelnemer}`);
    controle("jottem: og:image met afmetingen",
      Boolean(meting.ogBeeld) && Boolean(meting.ogBreedte), meting.ogBreedte ?? "");
    controle("jottem: geen deelknop zonder Share API", meting.deelknoppen === 0,
      `${meting.deelknoppen}`);
    await pagina.close();
  }

  // 5. uploadpagina zonder login
  {
    const url = `${SITE}/upload?project=${org.slug}/${project.slug}`;
    const { pagina, status, fouten } = await open(browser, url);
    controle("upload: status 200", status === 200, `status ${status}`);
    controle("upload: geen consolefouten", fouten.length === 0, fouten[0] ?? "");
    const inlog = await pagina.evaluate(() =>
      [...document.querySelectorAll("button")].some((b) => /inloggen/i.test(b.innerText)));
    controle("upload: vraagt om inloggen", inlog);
    await pagina.close();
  }
} finally {
  await browser.close();
}

const gezakt = uitkomsten.filter((u) => !u.geslaagd);
for (const u of uitkomsten) {
  console.log(`${u.geslaagd ? "ok  " : "FOUT"} ${u.naam}${u.toelichting ? `  (${u.toelichting})` : ""}`);
}
console.log(`\n${uitkomsten.length - gezakt.length}/${uitkomsten.length} geslaagd`);
process.exit(gezakt.length === 0 ? 0 : 1);
