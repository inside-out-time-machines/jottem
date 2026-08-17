"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet-geotag-photo/dist/Leaflet.GeotagPhoto.css";

export type Zichtveld = {
  lat: number; lon: number;              // camerastandpunt
  richting: number;                       // bearing in graden
  fov: number;                            // beeldhoek in graden
  doelLat: number; doelLon: number;       // doelpunt (waar de camera naar kijkt)
};

// Kaart met L.geotagPhoto.camera (Leaflet.GeotagPhoto, zoals in de Gouda Tijdmachine):
// versleep de camera en het doelpunt, knijp de beeldhoek; elke wijziging meldt het
// volledige zichtveld terug. De plugin verwacht een globale L, vandaar de dynamische
// importvolgorde.
export default function ZichtveldKiezer({
  begin,
  onWijzig,
}: {
  begin: Partial<Zichtveld> | null;
  onWijzig: (zichtveld: Zichtveld) => void;
}) {
  const houder = useRef<HTMLDivElement>(null);
  const kaartRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let gestopt = false;
    (async () => {
      const L = (await import("leaflet")).default;
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet-geotag-photo/dist/Leaflet.GeotagPhoto.js");
      if (gestopt || !houder.current || kaartRef.current) return;

      const camera: [number, number] = [begin?.lat ?? 52.0115, begin?.lon ?? 4.7104];
      const doel: [number, number] = [
        begin?.doelLat ?? camera[0],
        begin?.doelLon ?? camera[1] + 0.0006,
      ];

      const kaart = L.map(houder.current, { center: camera, zoom: 17, minZoom: 12, maxZoom: 19 });
      kaartRef.current = kaart;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap-bijdragers",
      }).addTo(kaart);

      const punten = {
        type: "Feature",
        properties: { angle: begin?.fov ?? 60 },
        geometry: {
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: [camera[1], camera[0]] },
            { type: "Point", coordinates: [doel[1], doel[0]] },
          ],
        },
      };

      const geotag = (L as unknown as {
        geotagPhoto: { camera: (f: unknown, o: unknown) => LeafletGeotagPhoto.Camera };
      }).geotagPhoto.camera(punten, {
        minAngle: 10,
        control: false,
        cameraIcon: L.icon({ iconUrl: "/geotag/camera.svg", iconSize: [38, 38], iconAnchor: [19, 19] }),
        targetIcon: L.icon({ iconUrl: "/geotag/marker.svg", iconSize: [32, 32], iconAnchor: [16, 16] }),
        angleIcon: L.icon({ iconUrl: "/geotag/marker.svg", iconSize: [32, 32], iconAnchor: [16, 16] }),
        controlCameraImg: "/geotag/camera-icon.svg",
        controlCrosshairImg: "/geotag/crosshair-icon.svg",
      }).addTo(kaart);

      const meld = () => {
        const veld = geotag.getFieldOfView();
        const cameraPunt = geotag.getCameraLatLng();
        const doelPunt = geotag.getTargetLatLng();
        onWijzig({
          lat: Number(cameraPunt.lat.toFixed(6)),
          lon: Number(cameraPunt.lng.toFixed(6)),
          richting: Math.round(((veld.properties.bearing % 360) + 360) % 360),
          fov: Math.round(veld.properties.angle),
          doelLat: Number(doelPunt.lat.toFixed(6)),
          doelLon: Number(doelPunt.lng.toFixed(6)),
        });
      };
      geotag.on("change", meld);
      geotag.on("input", meld);
      meld();
    })();
    return () => {
      gestopt = true;
      kaartRef.current?.remove();
      kaartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={houder}
      style={{ height: "min(56vh, 30rem)", borderRadius: ".35rem", border: "1px solid var(--kartonrand)" }}
    />
  );
}
