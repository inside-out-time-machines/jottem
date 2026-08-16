import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  async headers() {
    return [
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
