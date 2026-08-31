-- CreateTable
CREATE TABLE `newsletter_suscripcion` (
    `id_newsletter_suscripcion` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `estado` VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `exportado_en` DATETIME(3) NULL,

    UNIQUE INDEX `newsletter_suscripcion_email_key`(`email`),
    INDEX `newsletter_suscripcion_estado_idx`(`estado`),
    INDEX `newsletter_suscripcion_creado_en_idx`(`creado_en`),
    PRIMARY KEY (`id_newsletter_suscripcion`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
