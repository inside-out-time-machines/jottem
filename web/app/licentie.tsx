"use client";

import { useRef } from "react";
import { licentieInfo } from "@/lib/licenties";

// De licentie zoals de merkgids hem voorschrijft (brand.iotm.nl, "Licenties tonen"):
// de korte naam als link naar de licentietekst, met een (i) erachter die de dialoog opent
// met de kern op B1-niveau. Eén component, zodat elke plek in Jottem het gelijk toont.
//
// Let op: dit rendert een <dialog>, dus plaats het nooit binnen een <p>. Een alinea mag
// alleen tekst-inhoud bevatten; de browser sluit de <p> dan vroegtijdig en de hydratatie
// mislukt (React-fout #418). In een <td>, <div> of <label>-buur gaat het goed.
export default function Licentie({ url }: { url: string | null | undefined }) {
  const dialoog = useRef<HTMLDialogElement>(null);
  const info = licentieInfo(url);
  if (!info) return null;
  // bij een onbekende licentie is "Eigen licentie" geen naam om in een zin te zetten
  const vraag = info.bekend ? `Wat betekent ${info.naam}?` : "Wat betekent deze licentie?";
  const tekstLabel = info.bekend ? `de licentietekst (${info.naam})` : "de licentietekst";

  return (
    <>
      <a className="licentie-naam" href={info.tekstUrl} target="_blank" rel="noreferrer">
        {info.naam}
      </a>
      <button
        type="button"
        className="licentie-i"
        aria-label={vraag}
        onClick={() => dialoog.current?.showModal()}
      >
        i
      </button>
      <dialog ref={dialoog} className="dialoog">
        <h2>{vraag}</h2>
        <p>{info.uitleg}</p>
        <p style={{ marginTop: ".8rem", fontSize: ".95rem" }}>
          De volledige regels lees je in{" "}
          <a href={info.tekstUrl} target="_blank" rel="noreferrer">
            {tekstLabel}
          </a>
          .
        </p>
        <div className="dialoog-knoppen">
          {/* autofocus: anders landt de focusring bij het openen op de link erboven */}
          <button
            type="button"
            className="knop knop-primair"
            autoFocus
            onClick={() => dialoog.current?.close()}
          >
            Duidelijk
          </button>
        </div>
      </dialog>
    </>
  );
}
