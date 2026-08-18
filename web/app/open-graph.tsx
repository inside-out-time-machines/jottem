import { SITE_URL } from "@/lib/api";

export type OgBeeld = {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
};

// Open Graph-tags die we zelf in de head zetten (React hijst <meta> uit de
// paginaboom naar de head). Bewuste keuze: de metadata-API van Next leidt uit een
// openGraph-blok automatisch twitter:-tags af, en die willen we niet.
export default function OpenGraph({
  titel,
  beschrijving,
  pad,
  type = "website",
  beeld,
}: {
  titel: string;
  beschrijving?: string | null;
  pad: string;                 // pad op de site, bijv. /jottem/{id}
  type?: "website" | "article";
  beeld?: OgBeeld | null;
}) {
  const absoluut = (url: string) => new URL(url, SITE_URL).toString();
  return (
    <>
      <meta property="og:site_name" content="Jottem" />
      <meta property="og:locale" content="nl_NL" />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={titel} />
      {beschrijving && <meta property="og:description" content={beschrijving} />}
      <meta property="og:url" content={absoluut(pad)} />
      {beeld && (
        <>
          <meta property="og:image" content={absoluut(beeld.url)} />
          {beeld.alt && <meta property="og:image:alt" content={beeld.alt} />}
          {beeld.width && <meta property="og:image:width" content={String(beeld.width)} />}
          {beeld.height && <meta property="og:image:height" content={String(beeld.height)} />}
        </>
      )}
    </>
  );
}
