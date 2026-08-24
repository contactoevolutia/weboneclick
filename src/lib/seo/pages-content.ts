/**
 * Contenido SEO/GEO del documento OneClick (ago 2026).
 * path → title absoluto, meta description, h1 opcional, párrafo intro.
 */

export type SeoPageContent = {
  /** Title tag completo (usar absoluteTitle en metadata). */
  title: string;
  description: string;
  h1?: string;
  intro?: string;
};

export const SEO_PAGES: Record<string, SeoPageContent> = {
  "/": {
    title: "OneClick — Apple Premium Reseller Argentina | Tienda Oficial",
    description:
      "Tienda oficial Apple en Argentina. iPhone, Mac, iPad, AirPods y Apple Watch con garantía oficial, financiación y envío a todo el país. 6 sucursales.",
    h1: "OneClick — Apple Premium Reseller",
    intro:
      "OneClick es Apple Premium Reseller en Argentina, con más de 20 años de experiencia y 6 tiendas en Buenos Aires, Rosario y Córdoba. Ofrecemos el catálogo completo de productos Apple — iPhone, Mac, iPad, AirPods, Apple Watch y accesorios — con garantía oficial, servicio técnico autorizado con repuestos originales, y financiación en hasta 18 cuotas sin interés. Comprá online con envío a todo el país o visitanos en nuestras sucursales.",
  },
  "/iphone": {
    title: "iPhone — Comprá en OneClick | Apple Premium Reseller Argentina",
    description:
      "Comprá tu iPhone en OneClick, Apple Premium Reseller. iPhone 17 Pro, iPhone Air, iPhone 17e y más. Garantía oficial, cuotas sin interés y envío gratis.",
    h1: "iPhone",
    intro:
      "Explorá todos los modelos de iPhone disponibles en OneClick, Apple Premium Reseller en Argentina. Desde el iPhone 17 Pro con cámara profesional y chip de última generación, hasta el iPhone 17e pensado para quienes buscan la experiencia Apple a un precio accesible. Todos nuestros iPhone son liberados de fábrica, incluyen garantía oficial Apple de 1 año con cobertura internacional, y los podés financiar en hasta 18 cuotas sin interés.",
  },
  "/mac": {
    title: "Mac — MacBook, iMac y Mac Studio | OneClick Argentina",
    description:
      "Comprá tu Mac en OneClick. MacBook Air, MacBook Pro, iMac, Mac mini y Mac Studio con garantía oficial Apple. Financiación y envío a todo el país.",
    h1: "Mac",
    intro:
      "Encontrá la Mac ideal para tu trabajo o estudio en OneClick, Apple Premium Reseller en Argentina. Nuestra selección incluye MacBook Air y MacBook Pro para quienes necesitan portabilidad, iMac para espacios de escritorio, y Mac mini, Mac Studio y MacBook Neo para flujos creativos y profesionales exigentes. Todas las Mac incluyen garantía oficial Apple y las podés financiar en cuotas sin interés.",
  },
  "/ipad": {
    title: "iPad — iPad Pro, Air y Mini | Comprá en OneClick Argentina",
    description:
      "Comprá tu iPad en OneClick. iPad Pro, iPad Air, iPad mini con garantía oficial Apple, financiación en cuotas sin interés y envío a todo Argentina.",
    h1: "iPad",
    intro:
      "Descubrí toda la línea de iPad en OneClick, Apple Premium Reseller. El iPad Pro con chip M4 es ideal para profesionales creativos, el iPad Air combina rendimiento y versatilidad, y el iPad mini ofrece toda la potencia de Apple en el formato más compacto. Combiná tu iPad con Apple Pencil y Magic Keyboard para convertirlo en tu herramienta de trabajo completa. Garantía oficial y financiación disponible.",
  },
  "/airpods": {
    title: "AirPods — AirPods Pro, Max y AirPods 4 | OneClick Argentina",
    description:
      "Comprá AirPods en OneClick. AirPods Pro 3, AirPods Max y AirPods 4 con garantía oficial Apple. Cancelación de ruido, audio espacial y cuotas sin interés.",
    h1: "AirPods",
    intro:
      "Elegí tus AirPods en OneClick, Apple Premium Reseller en Argentina. Los AirPods Pro ofrecen cancelación activa de ruido y audio espacial personalizado, los AirPods Max son la opción premium over-ear con audio de alta fidelidad, y los AirPods 4 combinan comodidad y calidad de sonido para el uso diario. Todos incluyen garantía oficial Apple.",
  },
  "/watch": {
    title: "Apple Watch — Series, SE y Ultra | Comprá en OneClick Argentina",
    description:
      "Comprá tu Apple Watch en OneClick. Watch Series, Watch SE y Watch Ultra con garantía oficial. Seguimiento de salud, fitness y más. Cuotas sin interés.",
    h1: "Apple Watch",
    intro:
      "Encontrá el Apple Watch que se adapta a tu estilo de vida en OneClick. El Apple Watch Series es el compañero más completo para salud y productividad, el Apple Watch SE ofrece las funciones esenciales a un precio accesible, y el Apple Watch Ultra está diseñado para deportes extremos y aventura. Personalizá tu reloj con nuestra selección de correas oficiales Apple.",
  },
  "/apple-tv": {
    title: "Apple TV 4K — Comprá en OneClick | Apple Premium Reseller",
    description:
      "Comprá Apple TV 4K en OneClick. Streaming en 4K HDR, Dolby Atmos e integración total con tu ecosistema Apple. Garantía oficial y financiación.",
    h1: "Apple TV",
    intro:
      "El Apple TV 4K transforma tu televisor en un centro de entretenimiento con contenido en 4K HDR y audio Dolby Atmos. Se integra de forma nativa con iPhone, iPad y Mac para compartir fotos, hacer videollamadas con FaceTime y usar AirPlay. Disponible en OneClick con garantía oficial Apple.",
  },
  "/audio": {
    title: "Audio JBL y Harman Kardon — Parlantes y Auriculares | OneClick",
    description:
      "Parlantes y auriculares JBL y Harman Kardon en OneClick. Bluetooth, portátiles y profesionales. Distribuidor oficial con garantía y cuotas sin interés.",
    h1: "Audio",
    intro:
      "Descubrí nuestra selección de audio profesional y portátil en OneClick, distribuidor oficial JBL y Harman Kardon en Argentina. Encontrá parlantes Bluetooth para llevar a todos lados, auriculares con cancelación de ruido para concentrarte, y equipos de sonido premium para tu hogar. Todos los productos incluyen garantía oficial del fabricante.",
  },
  "/accesorios": {
    title: "Accesorios Apple y Compatibles — Fundas, Cargadores | OneClick",
    description:
      "Accesorios para iPhone, Mac, iPad y Apple Watch en OneClick. Fundas, cargadores, cables, AirTag, teclados y más. Originales Apple y marcas premium.",
    h1: "Accesorios",
    intro:
      "Completá tu experiencia Apple con accesorios originales y de marcas premium seleccionadas por OneClick. Encontrá fundas y cobertores para proteger tus dispositivos, cargadores MagSafe y cables certificados, correas para Apple Watch, teclados, mouse, Apple Pencil, AirTag y mucho más. Más de 480 productos disponibles con envío a todo el país.",
  },
  "/outlet": {
    title: "Outlet Apple — Productos con Descuento | OneClick Argentina",
    description:
      "Productos Apple con descuento en el Outlet de OneClick. Open box y últimas unidades de iPhone, Mac, iPad y accesorios con garantía oficial.",
    h1: "Outlet",
    intro:
      "Aprovechá precios especiales en productos Apple seleccionados. Nuestro Outlet incluye equipos open box, últimas unidades y modelos de generación anterior, todos con la misma garantía oficial y respaldo de OneClick como Apple Premium Reseller.",
  },
  "/servicio-tecnico": {
    title: "Servicio Técnico Apple Autorizado | OneClick Argentina",
    description:
      "Servicio técnico autorizado Apple en Argentina. Reparación de iPhone, Mac, iPad y Apple Watch con técnicos certificados y repuestos originales. 6 sucursales.",
    intro:
      "OneClick es Apple Authorized Service Provider en Argentina, con técnicos certificados por Apple y repuestos 100% originales. Reparamos iPhone, iPad, Mac, Apple Watch, AirPods y Apple TV — tanto equipos en garantía como fuera de ella. El proceso es simple: traé tu equipo a cualquiera de nuestras 6 sucursales o solicitá un turno online, recibí un diagnóstico oficial y seguí el estado de tu reparación en tiempo real. Línea gratuita: 0800-345-1663.",
  },
  "/tiendas": {
    title: "Tiendas OneClick — Sucursales en Buenos Aires, Rosario y Córdoba",
    description:
      "Visitá nuestras 6 tiendas Apple en Argentina: Palermo, Dot Baires, El Solar en Buenos Aires, 2 en Rosario y Córdoba. Horarios, direcciones y contacto.",
    h1: "Tiendas OneClick",
    intro:
      "OneClick tiene 6 tiendas Apple en Argentina donde podés ver, probar y comprar todos los productos del ecosistema Apple. Contamos con sucursales en Palermo Soho, Dot Baires Shopping y El Solar en Buenos Aires; Rosario Centro y Alto Rosario Shopping en Rosario; y Córdoba Shopping en Córdoba. En cada tienda encontrás atención personalizada, servicio técnico autorizado y la posibilidad de retirar tus compras online sin costo.",
  },
  "/nosotros": {
    title: "Nosotros — OneClick, Apple Premium Reseller en Argentina",
    description:
      "Conocé OneClick: más de 20 años como Apple Premium Reseller en Argentina. 6 tiendas, servicio técnico autorizado y el compromiso de acercarte la mejor tecnología.",
  },
  "/faqs": {
    title: "Preguntas Frecuentes — Envíos, Pagos y Garantía | OneClick",
    description:
      "Respuestas a las preguntas más comunes sobre compras en OneClick: medios de pago, cuotas sin interés, envíos, retiro en tienda, cambios y garantía Apple.",
  },
  "/contacto": {
    title: "Contacto — OneClick Apple Premium Reseller Argentina",
    description:
      "Contactá a OneClick por WhatsApp, teléfono o email. Atención de lunes a sábados. Línea gratuita 0800-345-1663. 6 tiendas en Buenos Aires, Rosario y Córdoba.",
  },
  "/empresas": {
    title: "Empresas — Soluciones Apple Corporativas | OneClick Argentina",
    description:
      "Equipá tu empresa con Apple. OneClick ofrece soluciones corporativas, facturación B2B, precios especiales y soporte técnico dedicado para empresas.",
  },
  "/promo": {
    title: "Promociones Apple — Ofertas y Cuotas sin Interés | OneClick",
    description:
      "Aprovechá las promociones de OneClick: descuentos en iPhone, Mac y iPad, cuotas sin interés con todos los bancos y ofertas exclusivas de temporada.",
  },
  "/seguimiento-de-envios": {
    title: "Seguimiento de Envíos — Rastreá tu Pedido | OneClick",
    description:
      "Seguí el estado de tu pedido en OneClick. Ingresá tu número de orden para conocer el progreso del envío a todo el país.",
  },
};

/** Lookup exact path or first segment category path (e.g. /iphone/iphone-17 → /iphone). */
export function getSeoPageContent(path: string): SeoPageContent | undefined {
  const clean = path.split("?")[0].replace(/\/$/, "") || "/";
  if (SEO_PAGES[clean]) return SEO_PAGES[clean];
  const parts = clean.split("/").filter(Boolean);
  if (parts.length > 1) {
    const root = `/${parts[0]}`;
    return SEO_PAGES[root];
  }
  return undefined;
}

/** Paths estáticos a incluir en sitemap (sin query). */
export const SITEMAP_STATIC_PATHS = Object.keys(SEO_PAGES);
