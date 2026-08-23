"use client";

/**
 * Wachtscherm tussen de foto en het metadataformulier, terwijl de suggestiedienst naar
 * het beeld kijkt (drie tot vijf seconden).
 *
 * De vis is getekend naar het beeldmerk: de spraakwolk op zijn kant is het lijf, de staart
 * van de wolk is de staartvin en het venster in de wolk is het oog. Bewust nagetekend en
 * niet het logobestand gedraaid, want de merkgids verbiedt het kantelen van het merk; de
 * losse O mag wél als accent terugkomen, en een wachtscherm is zo'n zeldzaam moment.
 *
 * De beweging staat in globals.css als CSS-keyframes, zodat de bestaande regel voor
 * prefers-reduced-motion hem uitzet. Wie geen beweging wil, ziet een stilstaande vis en
 * dezelfde tekst: de animatie is nooit nodig om te begrijpen wat er gebeurt.
 */
export default function Wachtverzachter({ onOverslaan }: { onOverslaan: () => void }) {
  return (
    <div className="wachten">
      <svg
        className="vis"
        viewBox="0 0 210 120"
        width="210"
        height="120"
        role="img"
        aria-label="Een vis van het Jottem-beeldmerk zwemt rustig heen en weer"
      >
        {/* staartvin: de punt van de spraakwolk */}
        <path
          className="vis-staart"
          fill="var(--project-primair)"
          d="M136 60 L204 18q4-2 2.4 2.4L192 60l14.4 39.6q1.6 4.4-2.4 2.4z"
        />
        {/* lijf: de afgeronde spraakwolk, liggend */}
        <rect
          x="6" y="18" width="146" height="84" rx="42"
          fill="var(--project-primair)"
        />
        {/* oog: het venster in de wolk */}
        <circle cx="44" cy="52" r="10" fill="var(--papier)" />
      </svg>
      <p className="wachten-tekst">
        We kijken even naar je foto, zodat we een titel kunnen voorstellen.
      </p>
      <p>
        <button type="button" className="annotatie-actie" onClick={onOverslaan}>
          ga alvast verder
        </button>
      </p>
    </div>
  );
}
