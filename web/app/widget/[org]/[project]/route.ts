import { API_INTERN } from "@/lib/api";
import { foutHtml, htmlAntwoord, projectWidgetHtml, stijlKeuze, WidgetData } from "../../html";

// Projectinfo-widget (hoofdstuk Deelbaarheid, D-1): zelfstandige HTML, inbedbaar via
// iframe of widget.js. De frame- en CORS-headers staan in next.config.ts (D-2).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string; project: string }> },
) {
  const { org, project } = await params;
  const antwoord = await fetch(
    `${API_INTERN}/organisatie/${encodeURIComponent(org)}/project/${encodeURIComponent(project)}/widget?aantal=1`,
    { cache: "no-store" },
  );
  if (!antwoord.ok) {
    return htmlAntwoord(foutHtml("Dit project is niet gevonden op Jottem."), 404);
  }
  const data = (await antwoord.json()) as WidgetData;
  return htmlAntwoord(projectWidgetHtml(data, stijlKeuze(request.url)));
}
