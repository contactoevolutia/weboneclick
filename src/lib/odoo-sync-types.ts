/** Tipos compartidos de sync Odoo (seguros para client components). */

export type SyncType = "productos" | "imagenes" | "stock";

export type SyncStats = {
  categorias: { created: number; updated: number };
  almacenes: { created: number; updated: number };
  marcas: { created: number; updated: number };
  etiquetas: { created: number; updated: number };
  productos: { created: number; updated: number; deactivated: number; images: number };
  precios: { inserted: number };
  stock: { upserted: number };
  /** Productos principales a los que se les actualizó la lista de relaciones (accesorios). */
  relaciones: { updated: number };
  errors: string[];
  dryRun: boolean;
  /** true si el sync no corrió porque ya había otro en curso (lock). */
  skipped?: boolean;
};

export type SyncBatchResult = {
  type: SyncType;
  processed: number;
  total: number;
  done: boolean;
  nextOffset: number;
  message?: string;
  stats: SyncStats;
  errors: string[];
};

/** Resultado de sincronizar un producto puntual por SKU (datos + stock + imágenes). */
export type SyncProductoBySkuResult = {
  ok: boolean;
  sku: string;
  id_producto?: number;
  odoo_id?: number;
  titulo?: string;
  message: string;
  stats: SyncStats;
  errors: string[];
};
