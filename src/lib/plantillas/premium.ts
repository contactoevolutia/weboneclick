import type { Plantilla } from "./tipos";

/** Todo lo que tiene la MacBook Neo. */
export const premium: Plantilla = {
  id: "premium",
  nombre: "Premium",
  para: "Producto insignia con contenido editorial propio y comparación contra otro modelo de la línea.",
  selectoresVariante: true,
  bloquesCaracteristicas: 6,
  imagenesEnCaracteristicas: true,
  desplegable: {
    descripcion: true,
    especificaciones: true,
    contenidoCaja: true,
    comparativa: true,
    accesorios: true,
  },
};
