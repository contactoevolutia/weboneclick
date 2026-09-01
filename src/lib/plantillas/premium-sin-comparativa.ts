import type { Plantilla } from "./tipos";

/** La premium completa, sin la sección de comparación entre equipos. */
export const premiumSinComparativa: Plantilla = {
  id: "premium-sin-comparativa",
  nombre: "Premium sin comparativa",
  para: "Producto insignia que no tiene contra qué compararse dentro de la línea.",
  selectoresVariante: true,
  bloquesCaracteristicas: 6,
  imagenesEnCaracteristicas: true,
  desplegable: {
    descripcion: true,
    especificaciones: true,
    contenidoCaja: true,
    comparativa: false,
    accesorios: true,
  },
};
