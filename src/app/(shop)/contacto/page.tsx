import { ContactHelpBlock } from "@/components/contact-help-block";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { SEO_PAGES } from "@/lib/seo/pages-content";

const seo = SEO_PAGES["/contacto"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/contacto",
});

export default function ContactoPage() {
  return (
    <div className="container oc-contacto">
      <header className="oc-contacto-hero">
        <h1>Contactate con nosotros.</h1>
        <p className="oc-contacto-sub">Estamos para ayudarte.</p>
      </header>
      <hr className="oc-contacto-rule" />
      <ContactHelpBlock />
    </div>
  );
}
