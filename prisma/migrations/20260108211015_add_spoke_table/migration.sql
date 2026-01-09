-- CreateTable
CREATE TABLE "spoke" (
    "id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "domain_prod" VARCHAR(255) NOT NULL,
    "port_dev" INTEGER NOT NULL,
    "path" VARCHAR(100) NOT NULL,
    "attribute_name_1" VARCHAR(50),
    "attribute_default_1" VARCHAR(100),
    "attribute_storage_key_1" VARCHAR(100),
    "attribute_name_2" VARCHAR(50),
    "attribute_default_2" VARCHAR(100),
    "attribute_storage_key_2" VARCHAR(100),
    "attribute_name_3" VARCHAR(50),
    "attribute_default_3" VARCHAR(100),
    "attribute_storage_key_3" VARCHAR(100),
    "image_1" VARCHAR(255),
    "image_2" VARCHAR(255),
    "image_3" VARCHAR(255),
    "has_delivery" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spoke_pkey" PRIMARY KEY ("id")
);
