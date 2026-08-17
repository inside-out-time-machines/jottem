import type { CSSProperties } from "react";

// Huisstijlkleuren van een organisatie doorgeven aan de CSS. De basislaag in
// globals.css draait op variabelen met de Jottem-kleuren als standaard; binnen een
// projectcontext zetten we die variabelen op de organisatiekleuren.

const INKT = "#1f1e1c";
const WIT = "#ffffff";
const PAPIER = "#faf6f1";   // paginagrond; iets donkerder dan wit, dus de strengste eis

function kanaal(waarde: number): number {
  const v = waarde / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Relatieve luminantie (WCAG) van een #rrggbb-kleur; null bij een onbekend formaat. */
export function luminantie(kleur: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(kleur.trim());
  if (!m) return null;
  const getal = parseInt(m[1], 16);
  return 0.2126 * kanaal((getal >> 16) & 255)
    + 0.7152 * kanaal((getal >> 8) & 255)
    + 0.0722 * kanaal(getal & 255);
}

/** Inkt of wit: de kleur die op dit vlak het beste contrast geeft. */
export function tekstOp(vlak: string | null | undefined): string | null {
  if (!vlak) return null;
  const l = luminantie(vlak);
  if (l === null) return null;
  // drempel uit de WCAG-contrastformule: hierboven wint donkere tekst
  return l > 0.179 ? INKT : WIT;
}

/** Contrastverhouding (WCAG) tussen twee #rrggbb-kleuren; null bij een onbekend formaat. */
export function contrast(voorgrond: string, achtergrond: string): number | null {
  const a = luminantie(voorgrond);
  const b = luminantie(achtergrond);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Dezelfde kleur, zo nodig donkerder gemaakt tot hij op de paginagrond leesbaar is
 * (4.5:1). Nodig voor tekst in een secundaire kleur: een lichte huisstijlkleur als
 * #00ccfe haalt op papier maar 1.8:1.
 */
export function leesbaarOpGrond(kleur: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(kleur.trim());
  if (!m) return kleur;
  let [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
  for (let stap = 0; stap < 20; stap++) {
    const hex = "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
    if ((contrast(hex, PAPIER) ?? 0) >= 4.5) return hex;
    [r, g, b] = [r, g, b].map((c) => Math.round(c * 0.85));
  }
  return INKT;
}

/**
 * Inline stijl met de projectvariabelen: primair kleurt de annotaties, secundair de
 * knoppen (achtergrond bij een primaire knop, rand en tekst bij een secundaire).
 * Ontbrekende kleuren worden weggelaten, zodat de Jottem-standaard blijft gelden.
 */
export function projectStijl(
  primair: string | null | undefined,
  secundair: string | null | undefined,
): CSSProperties {
  const stijl: Record<string, string> = {};
  if (primair) stijl["--project-primair"] = primair;
  if (secundair) {
    stijl["--knop-vlak"] = secundair;
    // de rand mag de kleur zelf zijn; tekst moet leesbaar blijven op wit
    stijl["--knop-tekst"] = leesbaarOpGrond(secundair);
    stijl["--knop-op-vlak"] = tekstOp(secundair) ?? WIT;
  }
  return stijl as CSSProperties;
}

/**
 * CSS voor de header (primaire kleur) en de footer (secundaire kleur) van een
 * publiekspagina binnen een organisatie. Komt als <style> in de pagina terecht, omdat
 * header en footer in de root-layout boven de pagina staan.
 */
export function kopVoetCss(
  primair: string | null | undefined,
  secundair: string | null | undefined,
): string | null {
  const regels: string[] = [];
  const kopTekst = tekstOp(primair);
  if (primair && kopTekst) {
    regels.push(`--kop-vlak:${primair}`, `--kop-tekst:${kopTekst}`);
    // het woordmerk in de header is wit; op een licht vlak maakt invert het zwart
    if (kopTekst === INKT) regels.push("--kop-logo-filter:invert(1)");
  }
  const voetTekst = tekstOp(secundair);
  if (secundair && voetTekst) {
    regels.push(`--voet-vlak:${secundair}`, `--voet-tekst:${voetTekst}`);
  }
  return regels.length ? `:root{${regels.join(";")}}` : null;
}
