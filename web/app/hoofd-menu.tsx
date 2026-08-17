"use client";

import { useEffect, useState } from "react";
import InlogKnop from "./inlog-knop";
import NavLinks from "./nav-links";

// Topbar-menu: op brede schermen een gewone rij links; op kleine schermen een
// hamburgerknop die naar een X transformeert en het menu uitklapt (items onder
// elkaar, inclusief profielfoto/naam uit InlogKnop).
export default function HoofdMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const opToets = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", opToets);
    return () => document.removeEventListener("keydown", opToets);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`hamburger${open ? " open" : ""}`}
        aria-label={open ? "Menu sluiten" : "Menu openen"}
        aria-expanded={open}
        aria-controls="hoofdmenu"
        onClick={() => setOpen(!open)}
      >
        <span /><span /><span />
      </button>
      <nav
        id="hoofdmenu"
        className={open ? "menu-open" : undefined}
        onClick={(e) => {
          // klik op een link sluit het uitgeklapte menu
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <NavLinks />
        <InlogKnop />
      </nav>
    </>
  );
}
