import { ContactHelpBlock } from "@/components/contact-help-block";
import { pageMetadata } from "@/lib/seo/build-metadata";
import { SEO_PAGES } from "@/lib/seo/pages-content";

const seo = SEO_PAGES["/nosotros"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/nosotros",
});

const VALORES = [
  {
    title: "Sinceridad y calidez",
    text: "Fomentamos un trato transparente y humano.",
  },
  {
    title: "Amabilidad y cercanía",
    text: "Nos vinculamos con respeto y predisposición.",
  },
  {
    title: "Excelencia profesional",
    text: "Cada solución refleja nuestro compromiso.",
  },
  {
    title: "Proactividad y responsabilidad",
    text: "Actuamos rápido, resolvemos mejor.",
  },
  {
    title: "Empatía con el cliente",
    text: "Más que ventas, creamos vínculos.",
  },
];

export default function NosotrosPage() {
  return (
    <div className="oc-nosotros">
      <section className="oc-nosotros-intro">
        <div className="container">
          <h1>OneClick Apple Premium Reseller Argentina</h1>
          <p className="oc-nosotros-lead">
            En OneClick somos Apple Premium Reseller y Servicio Técnico Autorizado Apple en
            Argentina. Más de 20 años de experiencia ofreciendo productos, soporte oficial y
            soluciones tecnológicas con garantía Apple.
          </p>

          <h2>¿Quiénes Somos?</h2>
          <div className="oc-nosotros-about">
            <p>
              En OneClick, somos una cadena de tiendas Apple en Argentina, especialistas en la
              venta de productos Apple, JBL, accesorios oficiales y marcas premium compatibles.
              Además, contamos con <strong>Servicio Técnico Autorizado Apple</strong> con
              técnicos certificados y repuestos originales.
            </p>
            <p>
              Con más de 20 años de experiencia en el mercado, somos{" "}
              <strong>Apple Premium Reseller</strong> y{" "}
              <strong>Apple Authorized Service Provider</strong>, lo que nos permite ofrecerte
              garantía oficial Apple y la tranquilidad de estar en manos de expertos.
            </p>
          </div>
        </div>
      </section>

      <section className="oc-nosotros-pillars" aria-label="Visión, misión y valores">
        <div className="container oc-nosotros-pillars-grid">
          <article className="oc-nosotros-card">
            <h3>Visión</h3>
            <p>
              Brindar una experiencia única a cada cliente, con soluciones tecnológicas y un
              servicio de excelencia que fidelice y construya confianza. Queremos ser el referente
              Apple más importante de Argentina y la región.
            </p>
          </article>
          <article className="oc-nosotros-card">
            <h3>Misión</h3>
            <p>
              Proveer tecnología que mejore la vida de las personas, conectando innovación con
              experiencias reales que transformen su día a día.
            </p>
          </article>
          <article className="oc-nosotros-card">
            <h3>Valores</h3>
            <ul className="oc-nosotros-valores">
              {VALORES.map((v) => (
                <li key={v.title}>
                  <span aria-hidden>→</span>
                  <span>
                    <strong>{v.title}:</strong> {v.text}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="oc-nosotros-help">
        <div className="container">
          <ContactHelpBlock title="Estamos para ayudarte" showRule variant="nosotros" />
        </div>
      </section>
    </div>
  );
}
