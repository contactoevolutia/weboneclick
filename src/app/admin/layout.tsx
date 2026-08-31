import Link from "next/link";
import { auth, signOut } from "@/auth";
import { canAccessAdminPanel, isAdmin } from "@/lib/auth-guard";

/** Evita prerender en build sin credenciales de DB. */
export const dynamic = "force-dynamic";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/ventas", label: "Ventas" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/secciones-productos", label: "Secciones productos" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/marcas", label: "Marcas" },
  { href: "/admin/menu", label: "Menú principal" },
  { href: "/admin/banners", label: "Banners" },
  { href: "/admin/promociones", label: "Promociones" },
  { href: "/admin/regalos", label: "Regalos" },
  { href: "/admin/descuentos", label: "Descuentos" },
  { href: "/admin/tiendas", label: "Tiendas" },
  { href: "/admin/constancias", label: "Constancias fiscales" },
  { href: "/admin/exclusiones", label: "Exclusiones retenciones" },
  { href: "/admin/envios", label: "Envíos" },
  { href: "/admin/parametros", label: "Parámetros" },
  { href: "/admin/beneficios", label: "Beneficios" },
  { href: "/admin/almacenes", label: "Almacenes" },
  { href: "/admin/caracteristicas", label: "Características" },
  { href: "/admin/newsletter", label: "Newsletter" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session || !canAccessAdminPanel(session.user.role)) {
    return <>{children}</>;
  }

  const visibleLinks = isAdmin(session.user.role)
    ? links
    : links.filter((l) => l.href === "/admin/ventas");

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <div className="brand">
          OneClick Admin
          <span>Panel</span>
        </div>
        {visibleLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
        <div className="admin-nav-meta">
          {session.user.email}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/admin/login" });
            }}
          >
            <button
              type="submit"
              className="btn btn-ghost"
              style={{ color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}
            >
              Salir
            </button>
          </form>
          <Link href="/">Ver sitio</Link>
        </div>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}
