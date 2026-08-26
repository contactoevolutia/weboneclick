/** Tipos de relación producto ↔ producto (cross-sell desde Odoo). */
export const TIPO_RELACION_ACCESORIO = "accesorio" as const;

export type TipoRelacionProducto = typeof TIPO_RELACION_ACCESORIO;
