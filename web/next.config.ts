import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      {
        // De naamsruimte is verhuisd naar de datahost, waar de API hem uitlevert. Dit pad
        // blijft permanent doorverwijzen: eerder gepubliceerde annotaties dragen IRI's
        // onder de oude host, en een naamsruimte-IRI hoort niet dood te gaan.
        source: "/ns/:pad*",
        destination: `${process.env.NEXT_PUBLIC_DATA_URL ?? "https://data.dev.iotm.nl"}/ns/:pad*`,
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Securityheaders voor de hele site. De OIDC-tokens staan in sessionStorage en de
        // pagina laadt drie externe viewerbundels (OpenSeadragon, Annotorious, MapLibre),
        // dus een script-injectie zou een geldig token kunnen wegsturen.
        // alles behalve de jottempagina's en de widgets: daar gelden de
        // uitzonderingen hieronder (widgets moeten juist wél in een iframe kunnen)
        source: "/:pad((?!jottem/|widget).*)",
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
              // MapLibre draait zijn tegelverwerking in een worker uit een blob-URL
              "worker-src 'self' blob:",
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
        // Jottempagina's: dezelfde CSP, maar met 'unsafe-eval' erbij. De annotatielaag
        // (Annotorious) tekent met PIXI, en dat compileert shaders via new Function;
        // zonder deze uitzondering blijft het kader op de foto onzichtbaar. Zodra
        // Annotorious @pixi/unsafe-eval meelevert, kan dit weer weg.
        source: "/jottem/:pad*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https:",
              "worker-src 'self' blob:",
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
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // de merkgids-fonts worden ook door Authentik (auth.dev.iotm.nl) geladen;
        // fonts zijn cross-origin en vereisen dus CORS (publiek, OFL-licentie)
        source: "/fonts/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      {
        // Inbedbare widgets (hoofdstuk Deelbaarheid, D-2): andere sites mogen deze
        // routes framen (dus géén X-Frame-Options en frame-ancestors *) en widget.js
        // mag de HTML cross-origin ophalen (ACAO *). De widget bevat geen scripts en
        // geen ingelogde context; de CSP blijft verder strak. Cache korter dan het
        // uurverloop van presigned logo-URL's uit de objectopslag.
        source: "/widget/:pad*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'none'",
              "style-src 'unsafe-inline'",
              "img-src 'self' data: https:",
              "frame-ancestors *",
              "base-uri 'none'",
              "form-action 'none'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=900" },
        ],
      },
    ];
  },
};

export default config;
