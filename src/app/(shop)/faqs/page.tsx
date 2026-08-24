import { FAQ_CATEGORIES } from "@/lib/faqs-data";
import { JsonLdScript } from "@/components/json-ld";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { faqPageJsonLd } from "@/lib/seo/json-ld";
import { SEO_PAGES } from "@/lib/seo/pages-content";

const seo = SEO_PAGES["/faqs"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/faqs",
});

export default function FaqsPage() {
  const faqItems = FAQ_CATEGORIES.flatMap((cat) =>
    cat.items.map((item) => ({ question: item.q, answer: item.a }))
  );

  return (
    <div className="container oc-inst-page oc-faqs-page">
      <JsonLdScript data={faqPageJsonLd(faqItems)} />
      <header className="oc-page-header" style={{ textAlign: "center" }}>
        <h1>Centro de ayuda y preguntas frecuentes</h1>
        <p className="oc-section-lead">En OneClick estamos para ayudarte.</p>
      </header>

      <div className="oc-faqs-sections">
        {FAQ_CATEGORIES.map((cat) => (
          <section key={cat.title} className="oc-faqs-cat">
            <h2>{cat.title}</h2>
            <div className="oc-faqs-list">
              {cat.items.map((item) => (
                <details key={item.q} className="oc-faq-item">
                  <summary>{item.q}</summary>
                  <div className="oc-faq-answer">
                    <p>{item.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
