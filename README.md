# OneClick Store — web-oneclick

Sitio web de **[OneClick](https://www.oneclickstore.com/)** (Apple Premium Reseller): catálogo público sincronizado con Odoo, carrito/checkout, páginas institucionales y panel de administración.

Repositorio: [contactoevolutia/weboneclick](https://github.com/contactoevolutia/weboneclick)

## Stack

- Next.js 16 (App Router, TypeScript, React 19)
- Prisma + MariaDB (`oneclickstore`)
- Auth.js (NextAuth v5) con Google OAuth (clientes del shop + admin)
- Sync de catálogo vía JSON-RPC a Odoo
- Imágenes de productos en filesystem (`uploads/`) y assets estáticos en `public/oneclick/`

## Requisitos locales

- Node.js 20+
- MariaDB en `localhost:3306`
- Credenciales OAuth de Google (login shop y panel admin)
- Acceso API a Odoo (opcional para sync; hay backup SQL en `db/`)

## Setup

1. Clonar e instalar:

```bash
git clone https://github.com/contactoevolutia/weboneclick.git
cd weboneclick
npm install
```

2. Variables de entorno:

```bash
cp .env.example .env
```

Editar `.env`:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | `mysql://root:root@localhost:3306/oneclickstore` |
| `AUTH_SECRET` | Secreto aleatorio (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Credenciales OAuth Google |
| `AUTH_URL` | `http://localhost:3000` en local |
| `AUTH_DEV_BYPASS` | `true` para saltar Google en local (se ignora en `production`) |
| `NEXT_PUBLIC_WHATSAPP_PHONE` | Número WhatsApp (ej. `54911...`) |
| `NEXT_PUBLIC_SITE_NAME` | Nombre del sitio (`OneClick`) |
| `UPLOADS_DIR` | Carpeta de imágenes (`uploads`) |
| `NEXT_PUBLIC_UPLOADS_BASE_URL` | Base pública de imágenes. Default `/api/uploads` |
| `SEED_ADMIN_EMAIL` | Mail Google del admin (debe coincidir con la cuenta OAuth) |
| `ODOO_URL` / `ODOO_DB` / `ODOO_UID` / `ODOO_API_KEY` | Sync de catálogo |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | GA4 (ej. `G-XXXX`). Opcional |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Pixel ID. Opcional |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | ID de conversión Ads (número, sin `AW-`). Opcional |
| `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL` | Etiqueta de conversión Purchase. Opcional |
| `GOOGLE_MERCHANT_FEED_TOKEN` | Token opcional del feed Merchant (`?token=`). Opcional |

### Google Merchant Center (feed)

Endpoint RSS 2.0 (Scheduled fetch): `/api/feeds/google-merchant`

1. En producción, abrir `https://TU-DOMINIO/api/feeds/google-merchant` y verificar XML.
2. Merchant Center → Productos → Fuentes de datos → Agregar productos → **Scheduled fetch**.
3. Pegar la URL (si usás token: `.../api/feeds/google-merchant?token=TU_TOKEN`).
4. Frecuencia diaria (o la que ofrezca el panel). Country/idioma: AR / español.
5. Revisar Diagnóstico tras el primer fetch.

Los `g:id` son `id_producto` (mismo valor que Meta Pixel `content_ids`).

3. Crear la base y cargar datos:

```bash
# En MariaDB:
# CREATE DATABASE oneclickstore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

npx prisma db push
npm run db:seed

# Opción A — restaurar backup incluido:
# mysql -u root -proot < db/oneclickstore.sql

# Opción B — sync desde Odoo (puede omitir imágenes/stock al inicio):
npm run sync:odoo
# npm run sync:odoo -- --skip-images --skip-stock
```

4. Arrancar:

```bash
npm run dev
```

Usar `npm run dev` (webpack + heap 8GB). Turbopack (`dev:turbo`) puede quedarse sin memoria en la home.

- Sitio: http://localhost:3000  
- Admin: http://localhost:3000/admin/login  
- Cuenta: http://localhost:3000/cuenta  

## Google OAuth

1. En [Google Cloud Console](https://console.cloud.google.com/) crear un proyecto.
2. APIs y servicios → Pantalla de consentimiento OAuth.
3. Credenciales → ID de cliente OAuth → Aplicación web.
4. Orígenes autorizados: `http://localhost:3000` (y el dominio de producción).
5. URI de redirección: `http://localhost:3000/api/auth/callback/google` (y el equivalente en producción).
6. Pegar Client ID y Secret en `.env`.

Cualquier cuenta Google puede iniciar sesión en el shop (se crea `usuario`/`cliente`).  
El **panel admin** solo admite `tipo_usuario = admin` y `activo = true`. El seed crea un admin con `SEED_ADMIN_EMAIL`.

## Odoo

- Productos publicados web: `x_studio_publicado_web = true`
- Precios: `sk.product.price.by.company` con `company_id = 1` (Oneclick Argentino SRL)
- Sync catálogo: `npm run sync:odoo` (flags: `--skip-images`, `--skip-stock`) o botón admin
- Credenciales en `.env` (`ODOO_URL`, `ODOO_DB`, `ODOO_UID`, `ODOO_API_KEY`)
- IDs de checkout (journals, tipo pedido, etc.): tabla `parametro` grupo `odoo` → `npm run seed:odoo-params`
- Checkout → venta Odoo: ver [docs/ODOO-CHECKOUT.md](docs/ODOO-CHECKOUT.md)
- Prueba sin Mercado Pago: `npm run test:checkout-odoo` / `-- --envio`

## Estructura principal

- `src/app/(shop)/` — Home, catálogo, producto, marcas, carrito, checkout, tiendas, institucionales
- `src/app/admin/` — Panel (productos, categorías, banners, **promociones**, marcas, tiendas, sync Odoo, ventas)
- `src/lib/odoo.ts` / `odoo-sync.ts` — Cliente y sync
- `src/lib/pricing.ts` — Descuento contado según `cuotas_max` + parámetros; sin impuestos (/1.105)
- `src/lib/parametros.ts` — Envíos gratis/precios y config descuento contado (grupo `precios`)
- `src/lib/nav.ts` — Mega-menú estilo OneClick (Promociones dinámicas desde DB)
- `src/lib/promos.ts` — Queries y badges de promociones de menú
- `src/lib/banners.ts` — Ubicaciones y URLs de banners de home
- `prisma/schema.prisma` — Modelo de datos
- `public/oneclick/` — Logo, hero, promos y banners de home
- `db/oneclickstore.sql` — Backup de la base

## Documentación

- [docs/ESTADO-PROYECTO.md](docs/ESTADO-PROYECTO.md) — estado actual, home, sync y dónde tocar
- [docs/ODOO-CHECKOUT.md](docs/ODOO-CHECKOUT.md) — checkout → Odoo (flujo, parámetros, almacenes, pruebas)
- [docs/PROMOCIONES.md](docs/PROMOCIONES.md) — promociones dinámicas del menú (schema, admin, listado, badges)
- [docs/BANNERS.md](docs/BANNERS.md) — banners de home (hero, secundario, triple, pie; HTML + admin)
- [docs/ETAPA-2-CARRITO.md](docs/ETAPA-2-CARRITO.md) — carrito, checkout, ventas
- [docs/FUTUROS-CAMBIOS.md](docs/FUTUROS-CAMBIOS.md) — guía para seguir desarrollando
- [DER.txt](DER.txt) — modelo de datos
- [db/README.md](db/README.md) — backup y restore

## Scripts útiles

```bash
npm run dev            # desarrollo (webpack)
npm run build          # build producción
npm run start          # start (respeta PORT)
npm run db:migrate     # migraciones en desarrollo
npm run db:deploy      # migraciones en producción
npm run db:seed        # seed inicial
npm run sync:odoo      # sync catálogo Odoo
npm run assets:download
```

## Despliegue (Hostinger / Node)

1. Crear base MariaDB y anotar host, usuario, password y nombre de DB.
2. Importar desde GitHub la app Node.js.
3. Comandos recomendados:
   - **Install:** `npm ci`
   - **Build:** `npm run build`
   - **Start:** `npm start` (usa `PORT` vía `scripts/start-server.mjs`)
   - **Node:** 20.x o 22.x
4. Variables de entorno (ejemplo):

```env
DATABASE_URL="mysql://USUARIO:PASSWORD@127.0.0.1:3306/NOMBRE_DB"
AUTH_URL="https://TU-DOMINIO"
AUTH_SECRET=...
AUTH_DEV_BYPASS=false
NEXT_PUBLIC_SITE_NAME="OneClick"
UPLOADS_DIR="uploads"
NEXT_PUBLIC_UPLOADS_BASE_URL="/api/uploads"
```

`AUTH_URL` debe ser **exactamente** el dominio canónico (con o sin `www`, no mezclar). La app redirige el host alternativo a ese origen para que las cookies de Auth.js no se pierdan.  
En Hostinger suele funcionar mejor `127.0.0.1` que `localhost` en `DATABASE_URL`.  
Encodeá caracteres especiales del password (`+`→`%2B`, `$`→`%24`).

5. Tras el deploy: `npx prisma migrate deploy` (o restaurar `db/oneclickstore.sql`) y sync Odoo si hace falta.
6. Google OAuth redirect: `https://TU-DOMINIO/api/auth/callback/google` (mismo host que `AUTH_URL`).

### Imágenes

Flujo de la app:

1. Admin sube imagen → disco (`UPLOADS_DIR`).
2. En DB queda path relativo, ej. `productos/uuid.jpg`.
3. URL pública: `{NEXT_PUBLIC_UPLOADS_BASE_URL}/productos/uuid.jpg`

No usar URLs del File Manager de Hostinger (`hstgr.io`); no son públicas para visitantes.

## Home (orden actual)

1. Hero Mac  
2. Barra utilidad + strip Mundial  
3. Destacados  
4. 3 promo cards (Mophie / asesores / servicio técnico)  
5. ¡Llevá la fiesta a donde quieras! (JBL)  
6. Banners Audio / Mochilas / Fundas  
7. Potenciá tu iPhone  

Detalle y pendientes: [docs/ESTADO-PROYECTO.md](docs/ESTADO-PROYECTO.md).
