-- Cantidad vendida histórica para orden "Más vendidos" en listados
ALTER TABLE "producto" ADD COLUMN "cantidad_vendida" INTEGER NOT NULL DEFAULT 0;
