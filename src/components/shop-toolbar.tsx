"use client";

import { useRouter } from "next/navigation";
import { buildShopHref, type ShopQuery } from "@/lib/shop-query";

const ORDER_OPTIONS = [
  { value: "mas-vendidos", label: "Más vendidos" },
  { value: "ultimos", label: "Ordenar por los últimos" },
  { value: "precio-asc", label: "Ordenar por precio: bajo a alto" },
  { value: "precio-desc", label: "Ordenar por precio: alto a bajo" },
  { value: "nombre", label: "Ordenar por nombre" },
] as const;

type Props = {
  query: ShopQuery;
  from: number;
  to: number;
  total: number;
  basePath?: string;
};

export function ShopToolbar({ query, from, to, total, basePath = "/shop" }: Props) {
  const router = useRouter();
  const orden = query.orden || "mas-vendidos";

  return (
    <div className="oc-shop-toolbar">
      <p className="oc-shop-result-count">
        {total === 0
          ? "No se encontraron resultados"
          : `Mostrando ${from}–${to} de ${total} resultados`}
      </p>
      <div className="oc-shop-sort">
        <label htmlFor="oc-shop-orden" className="sr-only">
          Ordenar
        </label>
        <select
          id="oc-shop-orden"
          value={orden}
          onChange={(e) => {
            router.push(buildShopHref(query, { orden: e.target.value }, basePath));
          }}
        >
          {ORDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
