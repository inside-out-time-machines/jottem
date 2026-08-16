import type { Metadata } from "next";
import "./globals.css";
import InlogKnop from "./inlog-knop";

export const metadata: Metadata = {
  title: "Jottem",
  description:
    "Jottem is het participatieve erfgoedplatform van Inside Out Time Machines: " +
    "maak erfgoed van iedereen, door iedereen.",
  icons: { icon: "/favicon.ico" },
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
            <a href="/">jottem</a>
            <span className="proto">dev</span>
            <nav>
              <a href="/upload">Uploaden</a>
              <a href="/moderatie">Moderatie</a>
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
