-- CreateTable
CREATE TABLE `productos_relacionados` (
    `id_producto` INTEGER NOT NULL,
    `id_producto_relacionado` INTEGER NOT NULL,
    `tipo_relacion` VARCHAR(50) NOT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,

    INDEX `productos_relacionados_id_producto_tipo_relacion_idx`(`id_producto`, `tipo_relacion`),
    PRIMARY KEY (`id_producto`, `id_producto_relacionado`, `tipo_relacion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `productos_relacionados` ADD CONSTRAINT `productos_relacionados_id_producto_fkey` FOREIGN KEY (`id_producto`) REFERENCES `producto`(`id_producto`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `productos_relacionados` ADD CONSTRAINT `productos_relacionados_id_producto_relacionado_fkey` FOREIGN KEY (`id_producto_relacionado`) REFERENCES `producto`(`id_producto`) ON DELETE CASCADE ON UPDATE CASCADE;
