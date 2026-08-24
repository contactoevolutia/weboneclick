import { ONECLICK_TIENDAS } from "@/lib/tiendas-data";
import TiendasExplorer from "@/components/tiendas-explorer";
import { JsonLdScript } from "@/components/json-ld";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { localBusinessJsonLd } from "@/lib/seo/json-ld";
import { SEO_PAGES } from "@/lib/seo/pages-content";

const seo = SEO_PAGES["/tiendas"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/tiendas",
});

export default function TiendasPage() {
  const tiendas = [...ONECLICK_TIENDAS].sort((a, b) => a.orden_mapa - b.orden_mapa);

  return (
    <div className="oc-tiendas-page">
      <JsonLdScript data={tiendas.map(localBusinessJsonLd)} />
      <TiendasExplorer tiendas={tiendas} />
    </div>
  );
}
