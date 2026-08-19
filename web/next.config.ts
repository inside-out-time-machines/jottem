import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        // Securityheaders voor de hele site. De OIDC-tokens staan in sessionStorage en de
        // pagina laadt drie externe viewerbundels (OpenSeadragon, Annotorious, MapLibre),
        // dus een script-injectie zou een geldig token kunnen wegsturen.
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next injecteert inline bootstrap-scripts; 'unsafe-inline' blijft nodig
              // tot die van een nonce zijn voorzien (staat op de lijst voor fase 7)
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              // beelden komen van de eigen IIIF-server, de object storage, OSM-tegels
              // en externe beeldbanken waarnaar een jottem verwijst
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      {
        // de merkgids-fonts worden ook door Authentik (auth.dev.iotm.nl) geladen;
        // fonts zijn cross-origin en vereisen dus CORS (publiek, OFL-licentie)
        source: "/fonts/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default config;
