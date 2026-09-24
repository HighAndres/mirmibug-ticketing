-- Las categorías pasan a ser un catálogo global (ya no pertenecen a un cliente).
-- Se conserva el id de cada categoría, así los tickets y subcategorías existentes
-- siguen apuntando a la misma categoría. El nombre pasa a ser único globalmente:
-- si dos clientes tenían una categoría con el mismo nombre, hay que renombrar o
-- fusionar una antes de aplicar esta migración.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Category" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

