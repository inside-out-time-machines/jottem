// Minimale typen voor Leaflet.GeotagPhoto (het pakket levert er geen); de plugin
// registreert zich op de globale L als L.geotagPhoto.
declare module "leaflet-geotag-photo/dist/Leaflet.GeotagPhoto.js";

declare namespace LeafletGeotagPhoto {
  interface FieldOfView {
    type: "Feature";
    properties: { angle: number; bearing: number; distance?: number };
    geometry: {
      type: "GeometryCollection";
      geometries: { type: "Point"; coordinates: [number, number] }[];
    };
  }
  interface Camera {
    addTo(map: import("leaflet").Map): Camera;
    on(event: string, handler: () => void): Camera;
    getFieldOfView(): FieldOfView;
    getCameraLatLng(): import("leaflet").LatLng;
    getTargetLatLng(): import("leaflet").LatLng;
    remove(): void;
  }
}
