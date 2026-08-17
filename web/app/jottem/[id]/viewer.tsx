"use client";

import { useEffect, useRef } from "react";
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

// OpenSeadragon-viewer op de IIIF Image API (Cantaloupe via iiif.dev.iotm.nl), met een
// Annotorious-laag (W3C-formaat) voor het tonen en tekenen van vlak-annotaties (AN-2).
// Geen externe assets: eigen knoppen in huisstijl, zoomen met scroll/dubbelklik/pinch.
export default function Viewer({
  service,
  titel,
  canvas,
  onAnnotator,
}: {
  service: string;
  titel: string;
  canvas?: string;
  onAnnotator?: (annotator: OsdAnnotator) => void;
}) {
  const houder = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{ destroy: () => void; viewport?: unknown } | null>(null);
  const annotatorRef = useRef<OsdAnnotator | null>(null);

  useEffect(() => {
    let gestopt = false;
    (async () => {
      const OpenSeadragon = (await import("openseadragon")).default;
      if (gestopt || !houder.current) return;
      const viewer = OpenSeadragon({
        element: houder.current,
        tileSources: [`${service}/info.json`],
        showNavigationControl: false,
        gestureSettingsMouse: { scrollToZoom: true, dblClickToZoom: true },
        maxZoomPixelRatio: 2,
        visibilityRatio: 0.6,
        crossOriginPolicy: "Anonymous",
      });
      viewerRef.current = viewer;
      if (canvas && onAnnotator) {
        const { createOSDAnnotator, W3CImageFormat } = await import("@annotorious/openseadragon");
        if (gestopt) return;
        const annotator = createOSDAnnotator(viewer, {
          adapter: W3CImageFormat(canvas),
          drawingEnabled: false,
          style: { fill: "#d85a30", fillOpacity: 0.18, stroke: "#d85a30", strokeWidth: 2 },
        }) as unknown as OsdAnnotator;
        annotatorRef.current = annotator;
        onAnnotator(annotator);
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
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      houder.current?.parentElement?.requestFullscreen?.();
    }
  }

  return (
    <figure className="iiif-kader" aria-label={`Beeldviewer: ${titel}`}>
      <div ref={houder} className="iiif-viewer" />
      <div className="iiif-knoppen">
        <button type="button" className="knop knop-secundair" onClick={() => zoom(1.4)} aria-label="Inzoomen">+</button>
        <button type="button" className="knop knop-secundair" onClick={() => zoom(1 / 1.4)} aria-label="Uitzoomen">-</button>
        <button type="button" className="knop knop-secundair" onClick={volledigScherm} aria-label="Volledig scherm">⛶</button>
      </div>
      <figcaption>{titel}</figcaption>
    </figure>
  );
}
