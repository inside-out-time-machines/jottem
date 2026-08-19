// ESLint stond wél in de code (er staan `eslint-disable`-regels in de componenten) maar
// was niet geïnstalleerd, dus die onderdrukkingen deden niets en het risico dat ze
// afdekken was nooit gecontroleerd. `npm run lint` draait de Next-regels nu echt.
import next from "eslint-config-next";

const configuratie = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...(Array.isArray(next) ? next : [next]),
  {
    linterOptions: {
      // een overbodige eslint-disable is zelf een fout: zo blijven er geen
      // onderdrukkingen achter die niets meer onderdrukken
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      // bewuste keuzes, daarom waarschuwing in plaats van fout:
      // 1. na hydratatie de clientstatus lezen (ingelogd, Share API) kan alleen in een
      //    effect; server en client moeten identiek starten
      "react-hooks/set-state-in-effect": "warn",
      // 2. beelden komen van de eigen IIIF-server of uit presigned URL's; de optimalisatie
      //    van next/image voegt daar niets toe en zou een extra proxy introduceren
      "@next/next/no-img-element": "warn",
    },
  },
];

export default configuratie;
