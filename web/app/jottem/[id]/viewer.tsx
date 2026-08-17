"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import "@annotorious/openseadragon/annotorious-openseadragon.css";

// Minimale typen voor de Annotorious-laag (W3C-adapter); de volledige typen zitten in
// het pakket maar dit houdt onze koppelvlakken expliciet.
export type OsdAnnotator = {
  setAnnotations: (annotaties: unknown[]) => void;
  clearAnnotations: () => void;
  setDrawingTool: (tool: string) => void;
  setDrawingEnabled: (aan: boolean) => void;
  setSelected: (id?: string) => void;
  fitBounds: (annotatie: unknown, opts?: unknown) => void;
  cancelSelected: () => void;
  removeAnnotation: (id: string) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  destroy: () => void;
};

type Vlak = { x: number; y: number; w: number; h: number };

// xywh-selector van een W3C-annotatie naar beeldcoördinaten
function vlakUit(annotatie: unknown): Vlak | null {
  const target = (annotatie as { target?: { selector?: { value?: string } | { value?: string }[] } })?.target;
  const selector = Array.isArray(target?.selector) ? target?.selector[0] : target?.selector;
  const m = /xywh=(?:pixel:)?([\d.]+),([\d.]+),([\d.]+),([\d.]+)/.exec(selector?.value ?? "");
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
}

// OpenSeadragon-viewer op de IIIF Image API (Cantaloupe via iiif.dev.iotm.nl), met een
// Annotorious-laag (W3C-formaat) voor het tonen en tekenen van vlak-annotaties (AN-2).
// Geen externe assets: eigen knoppen in huisstijl, zoomen met scroll/dubbelklik/pinch.
export default function Viewer({
  service,
  titel,
  canvas,
  onAnnotator,
  popupInhoud,
}: {
  service: string;
  titel: string;
  canvas?: string;
  onAnnotator?: (annotator: OsdAnnotator) => void;
  // inhoud van de popup bij een aangeklikt kader; null = geen popup tonen
  popupInhoud?: (id: string) => ReactNode;
}) {
  const houder = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{ destroy: () => void; viewport?: unknown } | null>(null);
  const annotatorRef = useRef<OsdAnnotator | null>(null);
  const [vol, setVol] = useState(false);   // volledig scherm actief (native of fallback)
  const [popup, setPopup] = useState<{ id: string; links: number; boven: number } | null>(null);
  const gekozenRef = useRef<{ id: string; vlak: Vlak } | null>(null);

  useEffect(() => {
    const bijWissel = () => setVol(Boolean(document.fullscreenElement));
    const opToets = (e: KeyboardEvent) => {
      const kader = houder.current?.parentElement;
      if (e.key === "Escape" && kader?.classList.contains("iiif-vol")) {
        kader.classList.remove("iiif-vol");
        setVol(false);
      }
    };
    document.addEventListener("fullscreenchange", bijWissel);
    document.addEventListener("keydown", opToets);
    return () => {
      document.removeEventListener("fullscreenchange", bijWissel);
      document.removeEventListener("keydown", opToets);
    };
  }, []);

  useEffect(() => {
    let gestopt = false;
    (async () => {
      const OpenSeadragon = (await import("openseadragon")).default;
      if (gestopt || !houder.current) return;
      const viewer = OpenSeadragon({
        element: houder.current,
        tileSources: [`${service}/info.json`],
        showNavigationControl: false,
        // klikken selecteert een annotatiekader (en opent de popup), dus daar mag de
        // viewer niet ook op inzoomen; zoomen gaat met scroll, dubbelklik, pinch en de knoppen
        gestureSettingsMouse: { scrollToZoom: true, clickToZoom: false, dblClickToZoom: true },
        gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true, pinchToZoom: true },
        maxZoomPixelRatio: 2,
        visibilityRatio: 0.6,
        crossOriginPolicy: "Anonymous",
      });
      viewerRef.current = viewer;
      if (canvas && onAnnotator) {
        const { createOSDAnnotator, UserSelectAction, W3CImageFormat } =
          await import("@annotorious/openseadragon");
        if (gestopt) return;
        const annotator = createOSDAnnotator(viewer, {
          adapter: W3CImageFormat(canvas),
          drawingEnabled: false,
          // drag: één beweging tekent het vak (met SHIFT ingedrukt op desktop, zie
          // interactief.tsx); zonder tekenmodus blijft slepen gewoon navigeren
          drawingMode: "drag",
          // bestaande kaders zijn alleen-lezen: aanklikken selecteert (en opent de
          // popup), maar je kunt ze niet verslepen of van formaat veranderen
          userSelectAction: UserSelectAction.SELECT,
          style: { fill: "#d85a30", fillOpacity: 0.18, stroke: "#d85a30", strokeWidth: 2 },
        }) as unknown as OsdAnnotator;
        annotatorRef.current = annotator;
        onAnnotator(annotator);

        // popup bij het kader: positie in schermcoördinaten, herberekend zodra de
        // gebruiker zoomt of pant, zodat het kaartje aan het kader vast blijft zitten
        const plaats = () => {
          const gekozen = gekozenRef.current;
          if (!gekozen) return;
          const { x, y, w, h } = gekozen.vlak;
          const punt = viewer.viewport.imageToViewerElementCoordinates(
            new OpenSeadragon.Point(x + w / 2, y + h),
          );
          setPopup({ id: gekozen.id, links: punt.x, boven: punt.y });
        };
        annotator.on("clickAnnotation", (...args: unknown[]) => {
          const a = args[0] as { id: string };
          const vlak = vlakUit(a);
          if (!vlak) return;
          gekozenRef.current = { id: a.id, vlak };
          plaats();
        });
        annotator.on("selectionChanged", (...args: unknown[]) => {
          const gekozenen = (args[0] as { id: string }[]) ?? [];
          if (gekozenen.length === 0) {
            gekozenRef.current = null;
            setPopup(null);
            return;
          }
          const vlak = vlakUit(gekozenen[0]);
          if (!vlak) return;
          gekozenRef.current = { id: gekozenen[0].id, vlak };
          plaats();
        });
        viewer.addHandler("update-viewport", plaats);
        viewer.addHandler("resize", plaats);
      }
    })();
    return () => {
      gestopt = true;
      annotatorRef.current?.destroy();
      annotatorRef.current = null;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, canvas]);

  function zoom(factor: number) {
    const viewer = viewerRef.current as { viewport?: { zoomBy: (f: number) => void; applyConstraints: () => void } } | null;
    viewer?.viewport?.zoomBy(factor);
    viewer?.viewport?.applyConstraints();
  }

  function volledigScherm() {
    const kader = houder.current?.parentElement;
    if (!kader) return;
    if (kader.requestFullscreen) {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void kader.requestFullscreen();
    } else {
      // iPhones kennen geen element-fullscreen: CSS-fallback die het kader
      // schermvullend fixeert (zie .iiif-vol in globals.css)
      kader.classList.toggle("iiif-vol");
      setVol(kader.classList.contains("iiif-vol"));
    }
  }

  return (
    <figure className="iiif-kader" aria-label={`Beeldviewer: ${titel}`}>
      <div ref={houder} className="iiif-viewer" />
      {popup && popupInhoud && (
        <div className="kader-popup" style={{ left: popup.links, top: popup.boven }} role="dialog">
          <button
            type="button"
            className="kader-popup-sluit"
            aria-label="Sluiten"
            onClick={() => {
              annotatorRef.current?.cancelSelected();
              gekozenRef.current = null;
              setPopup(null);
            }}
          >✕</button>
          {popupInhoud(popup.id)}
        </div>
      )}
      <div className="iiif-knoppen">
        <button type="button" className="knop knop-secundair" onClick={() => zoom(1.4)} aria-label="Inzoomen">+</button>
        <button type="button" className="knop knop-secundair" onClick={() => zoom(1 / 1.4)} aria-label="Uitzoomen">-</button>
        <button type="button" className="knop knop-secundair" onClick={volledigScherm}
                aria-label={vol ? "Volledig scherm sluiten" : "Volledig scherm"}>
          {vol ? "✕" : "⛶"}
        </button>
      </div>
      <figcaption>{titel}</figcaption>
    </figure>
  );
}
