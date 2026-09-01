import type { Plantilla } from "./tipos";

/** Información valiosa pero sin producción propia: tres bloques con imagen. */
export const intermedia: Plantilla = {
  id: "intermedia",
  nombre: "Intermedia",
  para: "Producto con información de valor en la web, sin fotos ni textos producidos a medida.",
  selectoresVariante: false,
  bloquesCaracteristicas: 3,
  imagenesEnCaracteristicas: true,
  desplegable: {
    descripcion: true,
    especificaciones: true,
    contenidoCaja: true,
    comparativa: false,
    accesorios: false,
  },
};
