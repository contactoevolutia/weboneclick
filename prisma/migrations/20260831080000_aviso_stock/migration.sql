-- CreateTable
CREATE TABLE `aviso_stock` (
    `id_aviso_stock` INTEGER NOT NULL AUTO_INCREMENT,
    `id_producto` INTEGER NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notificado_en` DATETIME(3) NULL,

    INDEX `aviso_stock_estado_idx`(`estado`),
    INDEX `aviso_stock_creado_en_idx`(`creado_en`),
    UNIQUE INDEX `aviso_stock_id_producto_email_key`(`id_producto`, `email`),
    PRIMARY KEY (`id_aviso_stock`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `aviso_stock` ADD CONSTRAINT `aviso_stock_id_producto_fkey` FOREIGN KEY (`id_producto`) REFERENCES `producto`(`id_producto`) ON DELETE CASCADE ON UPDATE CASCADE;
