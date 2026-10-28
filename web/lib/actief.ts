// Is deze menulink de actieve pagina? Gelijk aan het pad, of een subpagina ervan
// (prefix mét slash, zodat /beheer niet ook /organisatiebeheer... activeert).
export function isActief(pad: string | null, href: string): boolean {
  if (!pad) return false;
  return pad === href || pad.startsWith(`${href}/`);
}
