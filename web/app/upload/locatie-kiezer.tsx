"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

// Locatiespeld op de kaart (MapLibre + OSM-raster): klik of versleep de speld;
// de coördinaten gaan als metadata (lat/lon) mee met de jottem. Geen geocoding
// in de MVP, conform het ontwerpbesluit "alleen speld op de kaart".
export default function LocatieKiezer({
  onKies,
  begin,
}: {
  onKies: (lat: number, lon: number) => void;
  // startpunt: de plaats van de organisatie; zonder dat valt de kaart terug op Gouda
  begin?: { lat: number; lon: number } | null;
}) {
  const houder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let kaart: { remove: () => void } | null = null;
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      if (!houder.current) return;
      const start: [number, number] = begin ? [begin.lon, begin.lat] : [4.7104, 52.0115];
      const m = new maplibre.Map({
        container: houder.current,
        center: start,
        zoom: 13,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap-bijdragers",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
      });
      kaart = m;
      const speld = new maplibre.Marker({ color: "#d85a30", draggable: true })
        .setLngLat(start)
        .addTo(m);
      const meld = () => {
        const { lat, lng } = speld.getLngLat();
        onKies(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
      };
      speld.on("dragend", meld);
      m.on("click", (e: { lngLat: { lat: number; lng: number } }) => {
        speld.setLngLat(e.lngLat);
        meld();
      });
    })();
    return () => kaart?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={houder} style={{ height: "16rem", borderRadius: ".35rem", border: "1px solid var(--kartonrand)" }} />;
}
