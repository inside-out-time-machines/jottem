import type { Metadata } from "next";
import "./globals.css";
import { SITE_URL } from "@/lib/api";
import InlogKnop from "./inlog-knop";
import NavLinks from "./nav-links";

const BESCHRIJVING =
  "Jottem is het participatieve erfgoedplatform van Inside Out Time Machines: " +
  "maak erfgoed van iedereen, door iedereen.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Jottem",
  description: BESCHRIJVING,
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
  manifest: "/site.webmanifest",
  // sitebrede Open Graph-basis; pagina's met eigen inhoud (project, jottem)
  // overschrijven dit via generateMetadata
  openGraph: {
    siteName: "Jottem",
    type: "website",
    locale: "nl_NL",
    url: "/",
    title: "Jottem",
    description: BESCHRIJVING,
    images: [{ url: "/logo/jottem-woordmerk@2x.png", width: 1180, height: 300,
               alt: "Het Jottem-woordmerk: een oranje spraakwolk als O" }],
  },
};

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
            <span className="proto">dev</span>
            <nav>
              <NavLinks />
              <InlogKnop />
            </nav>
          </div>
        </header>
        {children}
        <footer>
          <div className="binnen">
            <p>
              <strong>Jottem</strong> is een initiatief van{" "}
              <strong>Inside Out Time Machines (IOTM)</strong>. Dit is de
              ontwikkelomgeving van de MVP; gegevens kunnen op elk moment
              verdwijnen. <a href="https://design.iotm.nl/">Ontwerp</a> ·{" "}
              <a href="https://brand.iotm.nl/">Merkgids</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
