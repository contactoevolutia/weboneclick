import { StaticPage } from "@/components/static-page";
import { SeguimientoForm } from "@/components/seguimiento-form";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { SEO_PAGES } from "@/lib/seo/pages-content";

const seo = SEO_PAGES["/seguimiento-de-envios"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/seguimiento-de-envios",
});

export default function Page() {
  return (
    <StaticPage title="Seguimiento de envíos">
      <SeguimientoForm />
    </StaticPage>
  );
}
