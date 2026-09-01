import type { Plantilla } from "./tipos";

/** Sin sección de características: la ficha vive en el buybox y el desplegable. */
export const basica: Plantilla = {
  id: "basica",
  nombre: "Básica",
  para: "Accesorio o producto sin imágenes de contexto ni contenido editorial.",
  selectoresVariante: false,
  bloquesCaracteristicas: 0,
  imagenesEnCaracteristicas: false,
  desplegable: {
    descripcion: true,
    especificaciones: true,
    contenidoCaja: true,
    comparativa: false,
    accesorios: false,
  },
};
