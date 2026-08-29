import { API_INTERN } from "@/lib/api";
import { foutHtml, htmlAntwoord, jottemsWidgetHtml, stijlKeuze, WidgetData } from "../../../../html";

// Jottems-widget (hoofdstuk Deelbaarheid, D-1): {aantal} thumbnails, recent of
// willekeurig, met daaronder een willekeurige actieve verrijkings-CTA (D-4).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string; project: string; volgorde: string; aantal: string }> },
) {
  const { org, project, volgorde, aantal } = await params;
  const n = Number(aantal);
  if ((volgorde !== "recent" && volgorde !== "willekeurig")
      || !Number.isInteger(n) || n < 1 || n > 12) {
    return htmlAntwoord(foutHtml("Deze widget bestaat niet; gebruik recent/1 tot en met willekeurig/12."), 404);
  }
  const antwoord = await fetch(
    `${API_INTERN}/organisatie/${encodeURIComponent(org)}/project/${encodeURIComponent(project)}/widget`
    + `?aantal=${n}&volgorde=${volgorde}`,
    { cache: "no-store" },
  );
  if (!antwoord.ok) {
    return htmlAntwoord(foutHtml("Dit project is niet gevonden op Jottem."), 404);
  }
  const data = (await antwoord.json()) as WidgetData;
  return htmlAntwoord(jottemsWidgetHtml(data, stijlKeuze(request.url)));
}
