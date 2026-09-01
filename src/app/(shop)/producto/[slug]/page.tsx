import { Fragment, type CSSProperties, type ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import SplitText from "@/components/SplitText";
import { ViewItemTracker } from "@/components/funnel-trackers";
import { ProductAddToCart } from "@/components/product-add-to-cart";
import { ProductCard } from "@/components/product-card";
import { ProductGallery } from "@/components/product-gallery";
import { ProductAccordion } from "@/components/product-accordion";
import { ProductNeoVariantSelector } from "@/components/product-neo-variant-selector";
import { ProductPrice } from "@/components/product-price";
import { ProductReserveForm } from "@/components/product-reserve-form";
import { ProductBuyboxMeta } from "@/components/product-buybox-meta";
import {
  getActiveProducts,
  getProductBySlug,
  precioEfectivo,
  resolveStoreAvailability,
  sortProductImageLinks,
} from "@/lib/products";
import {
  DEFAULT_CUOTAS_MAX,
  formatPriceArs,
  precioSinImpuestos,
  productoCalificaDescuentoContado,
} from "@/lib/pricing";
import { getDescuentoContadoConfig, getValorEnvioGratis } from "@/lib/parametros";
import {
  extractBoxAndWarranty,
  getMacbookAirComparison,
  getMacbookNeoAccessories,
  getMacbookNeoFeatures,
  getMacbookNeoGalleryExtras,
  getMacbookNeoPageData,
  getMacbookNeoSpecs,
  parseCpuGpuCaption,
  parseSpecChips,
  type ProductFeature,
} from "@/lib/macbook-neo";
import {
  bloquesCaracteristicas,
  getPdpTemplate,
  mostrarAccesorios,
  mostrarComparativa,
  mostrarSelectoresVariante,
  usaPlantillaNueva,
} from "@/lib/plantillas";
import { parseProductDescription } from "@/lib/product-description";
import { splitSpecHighlights, type SpecHighlight } from "@/lib/spec-highlights";
import { uploadPublicUrl, whatsappUrl } from "@/lib/utils";

type Params = Promise<{ slug: string }>;

function WishlistLink() {
  return (
    <Link href="/lista-deseos" className="oc-pdp-wishlist">
      <span className="oc-pdp-wishlist-icon" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 20.5s-7.5-4.6-9.8-9.2C.6 7.8 2.3 4.5 5.7 4c2-.3 4 .6 5.1 2.3l1.2 1.8 1.2-1.8C14.3 4.6 16.3 3.7 18.3 4c3.4.5 5.1 3.8 3.5 7.3-2.3 4.6-9.8 9.2-9.8 9.2z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      Añadir a lista de deseos
    </Link>
  );
}

/** Specs destacadas en tarjeta (procesador, RAM + almacenamiento, batería). */
function SpecHighlightCards({ items }: { items: SpecHighlight[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="oc-pdp-spec-cards">
      {items.map((item) => (
        <li className="oc-pdp-spec-card" key={item.key}>
          <strong>{item.value}</strong>
          <span>{item.caption}</span>
        </li>
      ))}
    </ul>
  );
}

/** Slots de color y almacenamiento cuando el producto todavía no trae variantes. */
function SelectoresVarianteHueco() {
  return (
    <div className="oc-neo-variants">
      <div className="oc-neo-colors">
        <p className="oc-neo-variant-label oc-neo-variant-label-row">
          <span>Color</span>
          <span className="oc-neo-variant-label-value">Sin variantes cargadas</span>
        </p>
        <div className="oc-neo-colors-row">
          {[1, 2, 3].map((i) => (
            <span className="oc-neo-swatch oc-pdp-hueco-swatch" key={i}>
              <span className="oc-neo-swatch-dot" />
              <span className="oc-neo-swatch-label">Color {i}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="oc-neo-storages">
        <p className="oc-neo-variant-label oc-neo-variant-label-row">
          <span>Almacenamiento</span>
          <span className="oc-neo-variant-label-value">Sin variantes cargadas</span>
        </p>
        <div className="oc-neo-storages-row">
          {[1, 2].map((i) => (
            <span className="oc-neo-storage-btn oc-pdp-hueco-swatch" key={i}>
              <span className="oc-neo-storage-btn-label">Capacidad {i}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Características de las plantillas nuevas. Dibuja siempre la cantidad de
 * bloques que define la plantilla, con el mismo markup y las mismas clases que
 * los bloques de la MacBook Neo. Los bloques sin contenido cargado se ven como
 * hueco — imagen y texto de muestra — para poder revisar la maqueta completa
 * antes de tener los datos.
 */
function PlantillaFeatureBlocks({
  bloques,
  imagenes,
  cantidad,
  hidden,
}: {
  bloques: { title: string; html: string }[];
  imagenes: string[];
  cantidad: number;
  hidden?: boolean;
}) {
  if (cantidad === 0) return null;
  return (
    <section
      id="oc-pdp-caracteristicas"
      className="oc-neo-features"
      style={hidden ? { display: "none" } : undefined}
    >
      <div className="oc-neo-features-inner">
        {Array.from({ length: cantidad }, (_, i) => {
          const bloque = bloques[i];
          const imagen = imagenes[i];
          const derecha = i % 2 === 1;
          return (
            <div className="oc-neo-feature-block" key={`feature-${i}`}>
              <div className={`oc-neo-feature${derecha ? " image-right" : ""}`}>
                {imagen ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    className="oc-neo-feature-image oc-neo-feature-image-cover"
                    src={imagen}
                    alt={bloque?.title || ""}
                  />
                ) : (
                  <div className="oc-neo-feature-image oc-neo-feature-image-cover oc-pdp-hueco-imagen">
                    <span>Imagen {i + 1} de {cantidad}</span>
                  </div>
                )}
                <div className="oc-neo-feature-copy">
                  {bloque ? (
                    <>
                      {bloque.title && (
                        <SplitText
                          tag="h2"
                          text={bloque.title}
                          splitType="words"
                          delay={90}
                          duration={1.1}
                          ease="power3.out"
                          from={{ opacity: 0, y: 24 }}
                          to={{ opacity: 1, y: 0 }}
                          threshold={0.2}
                          rootMargin="-80px"
                          textAlign="left"
                        />
                      )}
                      <div
                        className="oc-pdp-rte"
                        dangerouslySetInnerHTML={{ __html: bloque.html }}
                      />
                    </>
                  ) : (
                    <div className="oc-pdp-hueco-texto">
                      <h2>Título del bloque {i + 1}</h2>
                      <span className="oc-pdp-hueco-linea" />
                      <span className="oc-pdp-hueco-linea" />
                      <span className="oc-pdp-hueco-linea is-corta" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type NeoFeatureBlockData = {
  key: string;
  eyebrow?: string;
  image: string;
  alt: string;
  title: string;
  text: ReactNode;
  extra?: ReactNode;
  layout?: "stacked";
  imageClassName?: string;
};

function NeoAlternatingFeature({
  block,
  imageSide,
}: {
  block: NeoFeatureBlockData;
  imageSide: "left" | "right";
}) {
  if (block.layout === "stacked") {
    return (
      <div className="oc-neo-feature-block">
        <div className="oc-neo-feature oc-neo-feature-stacked">
          <div className="oc-neo-feature-copy">
            {block.eyebrow && <div className="oc-neo-feature-eyebrow">{block.eyebrow}</div>}
            <SplitText
              tag="h2"
              text={block.title}
              splitType="words"
              delay={90}
              duration={1.1}
              ease="power3.out"
              from={{ opacity: 0, y: 24 }}
              to={{ opacity: 1, y: 0 }}
              threshold={0.2}
              rootMargin="-80px"
              textAlign="center"
            />
            <p>{block.text}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="oc-neo-feature-image oc-neo-feature-image-stacked"
            src={uploadPublicUrl(block.image)}
            alt={block.alt}
          />
        </div>
        {block.extra}
      </div>
    );
  }

  return (
    <div className="oc-neo-feature-block">
      <div className={`oc-neo-feature${imageSide === "right" ? " image-right" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`oc-neo-feature-image${block.imageClassName ? ` ${block.imageClassName}` : ""}`}
          src={uploadPublicUrl(block.image)}
          alt={block.alt}
        />
        <div className="oc-neo-feature-copy">
          {block.eyebrow && <div className="oc-neo-feature-eyebrow">{block.eyebrow}</div>}
          <SplitText
            tag="h2"
            text={block.title}
            splitType="words"
            delay={90}
            duration={1.1}
            ease="power3.out"
            from={{ opacity: 0, y: 24 }}
            to={{ opacity: 1, y: 0 }}
            threshold={0.2}
            rootMargin="-80px"
            textAlign="left"
          />
          {block.text && <p>{block.text}</p>}
          {block.extra}
        </div>
      </div>
    </div>
  );
}

function NeoFeatureBlocks({
  features,
  hidden,
  descripcionHtml,
  specRows,
  specHighlights,
  boxText,
  compareData,
  accessories,
  descuentoContado,
}: {
  features: ProductFeature[];
  hidden?: boolean;
  descripcionHtml: string;
  specRows: { key: string; label: string; value: string }[];
  specHighlights: SpecHighlight[];
  boxText: string;
  compareData: NeoCompareData | null;
  accessories: NeoAccessoryItems;
  descuentoContado: { umbralCuotas: number; porcentaje: number } | null;
}) {
  const [rendimiento, teclado, diseno] = features;

  const blocks: NeoFeatureBlockData[] = [
    ...(rendimiento
      ? [
          {
            key: "rendimiento",
            eyebrow: rendimiento.eyebrow,
            image: rendimiento.image,
            alt: rendimiento.title,
            title: rendimiento.title,
            text: rendimiento.text,
            imageClassName: "oc-neo-feature-image-cover",
          },
        ]
      : []),
    {
      key: "productividad",
      eyebrow: "Uso diario",
      image: "mock/macbook-neo/feature-daily-use.png",
      alt: "MacBook Neo en distintos colores, abiertas y cerradas",
      imageClassName: "oc-neo-feature-image-zoom",
      title: "Máxima productividad diaria",
      text: "",
      extra: (
        <div className="oc-neo-hero-feature-grid">
          <div className="oc-neo-hero-feature-item">
            <SplitText
              tag="h3"
              text="Un diez para estudiar"
              splitType="words"
              delay={70}
              duration={0.9}
              ease="power3.out"
              from={{ opacity: 0, y: 18 }}
              to={{ opacity: 1, y: 0 }}
              threshold={0.2}
              rootMargin="-80px"
              textAlign="left"
            />
            <p>
              La MacBook Neo es la compañera perfecta para prepararte para los exámenes, resumir
              apuntes con Apple Intelligence y crear presentaciones sobresalientes. Es
              toda una cerebrito.
            </p>
          </div>
          <div className="oc-neo-hero-feature-item">
            <SplitText
              tag="h3"
              text="Trabajo y placer a la vez"
              splitType="words"
              delay={70}
              duration={0.9}
              ease="power3.out"
              from={{ opacity: 0, y: 18 }}
              to={{ opacity: 1, y: 0 }}
              threshold={0.2}
              rootMargin="-80px"
              textAlign="left"
            />
            <p>
              Desde crear hojas de cálculo hasta administrar nóminas, la MacBook Neo lo hace.
              Trabajar con ella es todo menos aburrido.
            </p>
          </div>
          <div className="oc-neo-hero-feature-item">
            <SplitText
              tag="h3"
              text="Entretenimiento en primera fila"
              splitType="words"
              delay={70}
              duration={0.9}
              ease="power3.out"
              from={{ opacity: 0, y: 18 }}
              to={{ opacity: 1, y: 0 }}
              threshold={0.2}
              rootMargin="-80px"
              textAlign="left"
            />
            <p>
              La MacBook Neo tiene una brillante pantalla Liquid Retina y gráficos alucinantes.
              Cuando disfrutes tus películas, series, videos y juegos favoritos, los detalles
              serán siempre los protagonistas. Que empiece el show.
            </p>
          </div>
        </div>
      ),
    },
    ...(teclado
      ? [
          {
            key: "teclado",
            eyebrow: teclado.eyebrow,
            image: teclado.image,
            alt: teclado.title,
            title: teclado.title,
            text: teclado.text,
          },
        ]
      : []),
    {
      key: "apple-intelligence",
      eyebrow: "Apple Intelligence",
      image: "mock/macbook-neo/feature-apple-intelligence.png",
      alt: "Herramientas de Apple Intelligence en la MacBook Neo",
      title: "Diseñada para Apple Intelligence",
      text: (
        <>
          Apple Intelligence es un sistema de inteligencia personal que te ayuda a escribir,
          expresarte y hacer de todo. Y viene totalmente integrado en la MacBook Neo.
        </>
      ),
      layout: "stacked",
    },
    {
      key: "continuidad",
      eyebrow: "Continuidad",
      image: "mock/macbook-neo/feature-continuity-iphone-v3.png",
      alt: "Dock de macOS con apps de productividad, integrado con el iPhone",
      title: "Mejor juntos",
      text: "Se enlaza mágicamente con tu iPhone para desbloquear aún más funcionalidades.",
    },
    {
      key: "seguridad",
      eyebrow: "Privacidad y seguridad",
      image: "mock/macbook-neo/feature-security.png",
      alt: "Autocompletado seguro con Touch ID en la MacBook Neo",
      title: "Tu tranquilidad está blindada",
      text: "La MacBook Neo está diseñada con las funcionalidades de seguridad avanzadas que vienen de fábrica en todas las Mac. Con la encriptación automática de datos, las protecciones antivirus gratuitas y las actualizaciones de software periódicas, tus datos estarán siempre a salvo y podrás navegar por internet con toda tranquilidad.",
    },
    ...(diseno
      ? [
          {
            key: "diseno",
            eyebrow: diseno.eyebrow,
            image: diseno.image,
            alt: diseno.title,
            title: diseno.title,
            text: diseno.text,
          },
        ]
      : []),
  ];

  return (
    <section
      id="oc-pdp-caracteristicas"
      className="oc-neo-features"
      style={hidden ? { display: "none" } : undefined}
    >
      <div className="oc-neo-features-inner">
        {blocks.map((block, i) => (
          <NeoAlternatingFeature key={block.key} block={block} imageSide={i % 2 === 0 ? "left" : "right"} />
        ))}

        <ProductAccordion
          items={[
            {
              id: "descripcion",
              title: "Descripción",
              content: <div dangerouslySetInnerHTML={{ __html: descripcionHtml }} />,
            },
            {
              id: "especificaciones",
              title: "Especificaciones",
              content: (
                <>
                  <SpecHighlightCards items={specHighlights} />
                  <dl className="oc-pdp-specs-grid">
                    {specRows.map((row) => (
                      <div className="oc-pdp-specs-row" key={row.key}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ),
            },
            {
              id: "contenido-caja",
              title: "Contenido de la caja",
              content: <p>{boxText}</p>,
            },
            ...(compareData
              ? [
                  {
                    id: "comparativa",
                    title: "Comparativa",
                    content: <NeoCompareTableContent {...compareData} />,
                  },
                ]
              : []),
            ...(accessories.length > 0
              ? [
                  {
                    id: "accesorios",
                    title: "Accesorios",
                    content: (
                      <NeoAccessoriesGridContent
                        items={accessories}
                        descuentoContado={descuentoContado}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>
    </section>
  );
}

type NeoCompareData = {
  air: NonNullable<Awaited<ReturnType<typeof getMacbookAirComparison>>>;
  neoChip: string;
  neoRam: string;
  neoStorageLabel: string;
  neoPrice: number | null;
};

function NeoCompareTableContent({ air, neoChip, neoRam, neoStorageLabel, neoPrice }: NeoCompareData) {
  const airName = air.titulo.match(/^MacBook Air/)?.[0] ?? air.titulo.split(" - ")[0];
  const rows = [
    { label: "Chip", neo: neoChip, air: air.chip },
    { label: "RAM", neo: neoRam, air: air.ram },
    { label: "Almacenamiento", neo: neoStorageLabel, air: air.storage },
    { label: "Pantalla", neo: '13" Liquid Retina', air: air.screen },
    {
      label: "Precio desde",
      neo: neoPrice != null ? formatPriceArs(neoPrice) : "—",
      air: air.precio != null ? formatPriceArs(air.precio) : "—",
    },
  ];
  return (
    <>
      <h2>MacBook Neo vs. {airName}</h2>
      <div className="oc-neo-compare-table-wrap">
        <div className="oc-neo-compare-table">
          <div className="oc-neo-compare-cell oc-neo-compare-head">Característica</div>
          <div className="oc-neo-compare-cell oc-neo-compare-head">MacBook Neo</div>
          <div className="oc-neo-compare-cell oc-neo-compare-head">{airName}</div>
          {rows.map((r) => (
            <Fragment key={r.label}>
              <div className="oc-neo-compare-cell oc-neo-compare-label">{r.label}</div>
              <div className="oc-neo-compare-cell">{r.neo}</div>
              <div className="oc-neo-compare-cell">{r.air}</div>
            </Fragment>
          ))}
        </div>
      </div>
      <p className="oc-neo-compare-link">
        <Link href={`/producto/${air.slug}`}>Ver {airName} →</Link>
      </p>
    </>
  );
}

function NeoCompareTable({ hidden, ...data }: NeoCompareData & { hidden?: boolean }) {
  return (
    <section
      id="oc-pdp-comparativa"
      className="oc-neo-compare"
      style={hidden ? { display: "none" } : undefined}
    >
      <NeoCompareTableContent {...data} />
    </section>
  );
}

type NeoAccessoryItems = Awaited<ReturnType<typeof getMacbookNeoAccessories>>;

function NeoAccessoriesGridContent({
  items,
  descuentoContado,
}: {
  items: NeoAccessoryItems;
  descuentoContado: { umbralCuotas: number; porcentaje: number } | null;
}) {
  return (
    <div className="oc-product-grid">
      {items.map((item) => (
        <ProductCard key={item.slug} product={item} descuentoContado={descuentoContado} />
      ))}
    </div>
  );
}

function NeoAccessoriesGrid({
  items,
  hidden,
  descuentoContado,
}: {
  items: NeoAccessoryItems;
  hidden?: boolean;
  descuentoContado: { umbralCuotas: number; porcentaje: number } | null;
}) {
  if (items.length === 0) return null;
  return (
    <section
      id="oc-pdp-relacionados"
      className="oc-pdp-related oc-neo-accessories"
      style={hidden ? { display: "none" } : undefined}
    >
      <h2>Completá tu MacBook Neo</h2>
      <NeoAccessoriesGridContent items={items} descuentoContado={descuentoContado} />
    </section>
  );
}

export default async function ProductoPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const cuotas = product.cuotas_max ?? DEFAULT_CUOTAS_MAX;
  const venta = precioEfectivo(product.precio, product.precio_con_desc);
  const sinImp = precioSinImpuestos(venta);
  const descConfig = await getDescuentoContadoConfig();
  const valorEnvioGratis = await getValorEnvioGratis();
  const muestraContado = productoCalificaDescuentoContado(
    product.cuotas_max,
    descConfig.umbralCuotas,
  );
  const inStock = product.inStock;
  const storeAvailability = resolveStoreAvailability(product.stocks);
  const envioGratis = venta != null && Number(venta) >= valorEnvioGratis;
  const waReserve = whatsappUrl(product.titulo, product.id_producto, "reserva");
  const maxQty =
    product.stockTracked && product.stockTotal > 0
      ? Math.min(99, Math.floor(product.stockTotal))
      : 99;

  const neo = await getMacbookNeoPageData(product);
  const isMacbookNeo = neo.inCategory;
  const current = neo.current;
  const specChips = parseSpecChips(product.titulo);

  const imagenes = [
    ...sortProductImageLinks(
      product.archivos.map((a) => ({
        link: a.archivo.link,
        tipo: a.archivo.tipo,
        id_archivo: a.archivo.id_archivo,
      }))
    ),
    ...(isMacbookNeo ? getMacbookNeoGalleryExtras(current?.color ?? null) : []),
  ];

  const categoryId = product.categorias[0]?.id_categoria;
  const related =
    !isMacbookNeo && categoryId
      ? (
          await getActiveProducts({
            categoriaId: categoryId,
            take: 8,
          })
        ).items.filter((p) => p.id_producto !== product.id_producto).slice(0, 8)
      : [];

  const neoSpecs = isMacbookNeo && current ? getMacbookNeoSpecs(current) : [];
  const neoFeatures = isMacbookNeo ? getMacbookNeoFeatures(current?.color ?? null) : [];
  const airComparison = isMacbookNeo ? await getMacbookAirComparison() : null;
  const { box } = isMacbookNeo
    ? extractBoxAndWarranty(product.descripcion)
    : { box: null };
  const accessories = isMacbookNeo ? await getMacbookNeoAccessories() : [];

  const specRows = isMacbookNeo
    ? neoSpecs.map((s) => ({ key: s.label, label: s.label, value: s.value }))
    : product.caracteristicas.map((c) => ({
        key: String(c.id_caracteristica),
        label: c.caracteristica.nombre,
        value: c.valor,
      }));

  const template = getPdpTemplate(slug, isMacbookNeo);
  const plantillaNueva = usaPlantillaNueva(template);
  // Las plantillas nuevas arman el desplegable partiendo la descripción; el
  // resto del catálogo la sigue mostrando entera como hasta ahora.
  const parsed = plantillaNueva
    ? parseProductDescription(product.descripcion, { titulo: product.titulo })
    : null;
  // Un bloque sin subtítulo cubre el caso del texto suelto (cable, parlante).
  const featureBlocks = parsed
    ? parsed.features.length > 0
      ? parsed.features
      : parsed.introHtml
        ? [{ title: "", html: parsed.introHtml }]
        : []
    : [];
  const cantidadBloques = bloquesCaracteristicas(template);
  const featureImages = imagenes.slice(0, cantidadBloques).map(uploadPublicUrl);
  // El desplegable lleva los mismos items que la Neo (menos comparativa y
  // accesorios): la Descripción va completa, igual que en la premium.
  const descripcionCompleta = plantillaNueva ? product.descripcion : "";
  const parsedSpecRows = (parsed?.specs ?? []).map((sp) => ({
    key: sp.key,
    label: sp.label,
    value: sp.value,
  }));
  const {
    highlights: parsedHighlights,
    rest: parsedSpecList,
  } = splitSpecHighlights(parsedSpecRows);

  const { highlights: specHighlights, rest: specListRows } = splitSpecHighlights(specRows, {
    procesadorCaption:
      isMacbookNeo && current ? parseCpuGpuCaption(current.titulo) : undefined,
  });

  const sections = [
    ...(isMacbookNeo ? [{ id: "oc-pdp-caracteristicas", label: "Características" }] : []),
    { id: "oc-pdp-descripcion", label: "Descripción" },
    ...(specRows.length > 0
      ? [{ id: "oc-pdp-especificaciones", label: "Especificaciones" }]
      : []),
    ...(isMacbookNeo && airComparison
      ? [{ id: "oc-pdp-comparativa", label: "Comparativa" }]
      : []),
    ...(related.length > 0 || accessories.length > 0
      ? [{ id: "oc-pdp-relacionados", label: isMacbookNeo ? "Accesorios" : "Relacionados" }]
      : []),
  ];

  const defaultActiveSectionId = sections[0]?.id;
  // Sólo la MacBook Neo tiene acordeón propio para mostrar el resto de las
  // secciones. Sin él, ocultarlas las dejaba inalcanzables: "Productos
  // relacionados" se renderizaba con display:none en todo el catálogo.
  const hiddenSectionStyle = (id: string): CSSProperties | undefined =>
    isMacbookNeo && id !== defaultActiveSectionId ? { display: "none" } : undefined;

  return (
    <div className="container oc-pdp">
      <ViewItemTracker
        itemId={String(product.id_producto)}
        itemName={product.titulo}
        price={venta}
        itemCategory={product.categorias[0]?.categoria.nombre}
      />
      <div className="oc-page-header">
        <nav className="oc-breadcrumb">
          <Link href="/">Inicio</Link>
          <span>/</span>
          {product.categorias[0] && (
            <>
              <Link href={`/${product.categorias[0].categoria.slug}`}>
                {product.categorias[0].categoria.nombre}
              </Link>
              <span>/</span>
            </>
          )}
          <span>{product.titulo}</span>
        </nav>
      </div>

      <div className="oc-product-detail">
        <ProductGallery images={imagenes} alt={product.titulo} outOfStock={!inStock} />

        <div className="oc-pdp-buybox">
          {product.marca && (
            <p className="oc-pdp-brand">
              <Link href={`/marca/${product.marca.slug}`}>{product.marca.nombre}</Link>
            </p>
          )}
          <h1>{neo.displayTitle || product.titulo}</h1>
          {specChips.length > 0 && (
            <ul className="oc-pdp-spec-chips">
              {specChips.map((chip) => (
                <li key={chip}>{chip}</li>
              ))}
            </ul>
          )}
          <ProductPrice
            precio={product.precio}
            porcentaje_desc={product.porcentaje_desc}
            precio_con_desc={product.precio_con_desc}
          />

          {!isMacbookNeo && mostrarSelectoresVariante(template) && (
            <SelectoresVarianteHueco />
          )}

          {isMacbookNeo && current && (
            <ProductNeoVariantSelector
              variants={neo.variants}
              colors={neo.colors}
              storages={neo.storages}
              current={current}
            />
          )}

          {inStock ? (
            <>
              {muestraContado ? (
                <p className="oc-contado">
                  Pagando contado {descConfig.porcentaje}% de descuento
                </p>
              ) : null}
              {sinImp != null && (
                <p className="oc-sin-imp">Sin imp nacionales: {formatPriceArs(sinImp)}</p>
              )}

              <p className="oc-pdp-stock-badge oc-pdp-stock-badge--ok">
                <span className="oc-pdp-stock-dot" aria-hidden />
                Hay existencias
              </p>

              <ProductAddToCart idProducto={product.id_producto} maxQty={maxQty} />

              <WishlistLink />

              <ProductBuyboxMeta
                cuotas={cuotas}
                precio={venta != null ? Number(venta) : null}
                stores={storeAvailability}
                envioGratis={envioGratis}
              />
            </>
          ) : (
            <>
              <p className="oc-pdp-stock-badge oc-pdp-stock-badge--no">
                <span className="oc-pdp-stock-dot" aria-hidden />
                Sin existencias
              </p>
              <ProductReserveForm productTitle={product.titulo} productSku={product.sku} />
              <WishlistLink />

              <div className="oc-pdp-reserve-now">
                <h3>Reservá ahora</h3>
                <p>
                  Contactá a nuestros asesores para conocer las alternativas y/o reservar tu
                  producto.
                </p>
                <a
                  className="oc-btn oc-btn-dark oc-pdp-wa-btn"
                  href={waReserve}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir WhatsApp
                </a>
              </div>

              <ProductBuyboxMeta
                cuotas={cuotas}
                precio={venta != null ? Number(venta) : null}
                stores={storeAvailability}
                envioGratis={envioGratis}
              />
            </>
          )}
        </div>
      </div>

      {!plantillaNueva && (
        <section
          id="oc-pdp-descripcion"
          className="oc-pdp-description"
          style={hiddenSectionStyle("oc-pdp-descripcion")}
        >
          <h2>Descripción</h2>
          <div dangerouslySetInnerHTML={{ __html: product.descripcion }} />
        </section>
      )}

      {isMacbookNeo && (
        <NeoFeatureBlocks
          features={neoFeatures}
          hidden={defaultActiveSectionId !== "oc-pdp-caracteristicas"}
          descripcionHtml={product.descripcion}
          specRows={specListRows}
          specHighlights={specHighlights}
          boxText={box ?? "MacBook Neo, Adaptador de Corriente USB-C, Cable de carga USB-C."}
          compareData={
            airComparison && current
              ? {
                  air: airComparison,
                  neoChip: current.chip,
                  neoRam: current.ram,
                  neoStorageLabel: `${current.storageLabel} SSD`,
                  neoPrice: current.ventaEfectiva,
                }
              : null
          }
          accessories={accessories}
          descuentoContado={descConfig}
        />
      )}

      {plantillaNueva && !isMacbookNeo && (
        <PlantillaFeatureBlocks
          bloques={featureBlocks}
          imagenes={featureImages}
          cantidad={cantidadBloques}
        />
      )}

      {plantillaNueva && !isMacbookNeo && (
        <section className="oc-pdp-content">
          <ProductAccordion
            items={[
              {
                id: "descripcion",
                title: "Descripción",
                content: descripcionCompleta ? (
                  <div
                    className="oc-pdp-rte"
                    dangerouslySetInnerHTML={{ __html: descripcionCompleta }}
                  />
                ) : (
                  <p className="oc-pdp-hueco-nota">Sin descripción cargada.</p>
                ),
              },
              {
                id: "especificaciones",
                title: "Especificaciones",
                content:
                  parsedSpecRows.length > 0 ? (
                    <>
                      <SpecHighlightCards items={parsedHighlights} />
                      <dl className="oc-pdp-specs-grid">
                        {parsedSpecList.map((row) => (
                          <div className="oc-pdp-specs-row" key={row.key}>
                            <dt>{row.label}</dt>
                            <dd>{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                      {parsed?.specsExtraHtml ? (
                        <div
                          className="oc-pdp-rte"
                          dangerouslySetInnerHTML={{ __html: parsed.specsExtraHtml }}
                        />
                      ) : null}
                    </>
                  ) : (
                    <p className="oc-pdp-hueco-nota">
                      Sin especificaciones cargadas todavía.
                    </p>
                  ),
              },
              {
                id: "contenido-caja",
                title: "Contenido de la caja",
                content:
                  parsed && parsed.boxItems.length > 0 ? (
                    <ul className="oc-pdp-box-list">
                      {parsed.boxItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="oc-pdp-hueco-nota">
                      Sin contenido de la caja cargado.
                    </p>
                  ),
              },
              ...(mostrarComparativa(template)
                ? [
                    {
                      id: "comparativa",
                      title: "Comparativa",
                      content: (
                        <p className="oc-pdp-hueco-nota">
                          Sin comparativa configurada para este producto.
                        </p>
                      ),
                    },
                  ]
                : []),
              ...(mostrarAccesorios(template)
                ? [
                    {
                      id: "accesorios",
                      title: "Accesorios",
                      content:
                        related.length > 0 ? (
                          <div className="oc-product-grid">
                            {related.slice(0, 4).map((p) => (
                              <ProductCard
                                key={p.id_producto}
                                product={p}
                                descuentoContado={descConfig}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="oc-pdp-hueco-nota">
                            Sin accesorios asociados todavía.
                          </p>
                        ),
                    },
                  ]
                : []),
            ]}
          />
        </section>
      )}

      {!plantillaNueva && specRows.length > 0 && (
        <section
          id="oc-pdp-especificaciones"
          className="oc-pdp-specs-section"
          style={hiddenSectionStyle("oc-pdp-especificaciones")}
        >
          <h2>Ficha técnica</h2>
          <SpecHighlightCards items={specHighlights} />
          <dl className="oc-pdp-specs-grid">
            {specListRows.map((row) => (
              <div className="oc-pdp-specs-row" key={row.key}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {isMacbookNeo && airComparison && current && (
        <NeoCompareTable
          air={airComparison}
          neoChip={current.chip}
          neoRam={current.ram}
          neoStorageLabel={`${current.storageLabel} SSD`}
          neoPrice={current.ventaEfectiva}
          hidden={defaultActiveSectionId !== "oc-pdp-comparativa"}
        />
      )}

      {isMacbookNeo ? (
        <NeoAccessoriesGrid
          items={accessories}
          hidden={defaultActiveSectionId !== "oc-pdp-relacionados"}
          descuentoContado={descConfig}
        />
      ) : (
        related.length > 0 && !(plantillaNueva && mostrarAccesorios(template)) && (
          <section
            id="oc-pdp-relacionados"
            className="oc-pdp-related"
            style={hiddenSectionStyle("oc-pdp-relacionados")}
          >
            <h2>Productos relacionados</h2>
            <div className="oc-product-grid">
              {related.map((p) => (
                <ProductCard
                  key={p.id_producto}
                  product={p}
                  descuentoContado={descConfig}
                />
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}
