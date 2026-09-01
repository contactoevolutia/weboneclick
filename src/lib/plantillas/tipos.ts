/**
 * Definición de una plantilla de ficha de producto.
 *
 * Cada plantilla es un archivo en esta carpeta que declara qué componentes
 * muestra. La estructura es capacidad, no reflejo de lo cargado: si el
 * producto todavía no tiene el contenido, el componente se dibuja como hueco.
 */

export type PlantillaId =
  | "premium"
  | "premium-sin-comparativa"
  | "intermedia"
  | "basica";

export type Plantilla = {
  id: PlantillaId;
  nombre: string;
  /** Para qué tipo de producto está pensada. */
  para: string;
  /** Slots de color y almacenamiento en el buybox. */
  selectoresVariante: boolean;
  /** Bloques de la sección de características (0 = sin sección). */
  bloquesCaracteristicas: number;
  /** Cada bloque de características lleva imagen. */
  imagenesEnCaracteristicas: boolean;
  /** Items del desplegable del pie. */
  desplegable: {
    descripcion: boolean;
    especificaciones: boolean;
    contenidoCaja: boolean;
    comparativa: boolean;
    accesorios: boolean;
  };
};
