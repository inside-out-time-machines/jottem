import type { Metadata } from "next";
import "./globals.css";
import { OMGEVING, SITE_URL } from "@/lib/api";
import HoofdMenu from "./hoofd-menu";

const BESCHRIJVING =
  "Jottem is het participatieve erfgoedplatform van Inside Out Time Machines: " +
  "maak erfgoed van iedereen, door iedereen.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Jottem",
  description: BESCHRIJVING,
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
  manifest: "/site.webmanifest",
};

// De Open Graph-tags staan niet in deze metadata maar in <OpenGraph> op de
// publiekspagina's: Next leidt uit een openGraph-blok automatisch twitter:-tags af.

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <header className="topbar">
          <div className="topbar-binnen">
            <a href="/">
              <img src="/logo/jottem-o-wit.svg" alt="Jottem" />
            </a>
            <a href="/">Jottem</a>
            {OMGEVING !== "productie" && <span className="proto">{OMGEVING}</span>}
            <HoofdMenu />
          </div>
        </header>
        {children}
        <footer>
          <div className="binnen">
            <p>
              <strong>Jottem</strong> is een initiatief van{" "}
              <strong>Inside Out Time Machines (IOTM)</strong>.{" "}
              {OMGEVING !== "productie" && (
                <>
                  Dit is de ontwikkelomgeving van de MVP; gegevens kunnen op elk
                  moment verdwijnen.{" "}
                </>
              )}
              <a href="https://design.iotm.nl/">Ontwerp</a> ·{" "}
              <a href="https://brand.iotm.nl/">Merkgids</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
