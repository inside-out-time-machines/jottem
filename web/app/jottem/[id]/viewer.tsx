"use client";

import { useEffect, useRef } from "react";

// OpenSeadragon-viewer op de IIIF Image API (Cantaloupe via iiif.dev.iotm.nl).
// Geen externe assets: eigen knoppen in huisstijl, zoomen met scroll/dubbelklik/pinch.
export default function Viewer({ service, titel }: { service: string; titel: string }) {
  const houder = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{ destroy: () => void; viewport?: unknown } | null>(null);

  useEffect(() => {
    let gestopt = false;
    (async () => {
      const OpenSeadragon = (await import("openseadragon")).default;
      if (gestopt || !houder.current) return;
      viewerRef.current = OpenSeadragon({
        element: houder.current,
        tileSources: [`${service}/info.json`],
        showNavigationControl: false,
        gestureSettingsMouse: { scrollToZoom: true, dblClickToZoom: true },
        maxZoomPixelRatio: 2,
        visibilityRatio: 0.6,
        crossOriginPolicy: "Anonymous",
      });
    })();
    return () => {
      gestopt = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [service]);

  function zoom(factor: number) {
    const viewer = viewerRef.current as { viewport?: { zoomBy: (f: number) => void; applyConstraints: () => void } } | null;
    viewer?.viewport?.zoomBy(factor);
    viewer?.viewport?.applyConstraints();
  }

  function volledigScherm() {
    houder.current?.parentElement?.requestFullscreen?.();
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
