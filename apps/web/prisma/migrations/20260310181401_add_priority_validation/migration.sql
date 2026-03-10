-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folio" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "priorityValidated" BOOLEAN NOT NULL DEFAULT false,
    "priorityValidatedById" TEXT,
    "priorityValidatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "requesterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "categoryId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    CONSTRAINT "Ticket_priorityValidatedById_fkey" FOREIGN KEY ("priorityValidatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("assigneeId", "categoryId", "clientId", "createdAt", "description", "folio", "id", "priority", "requesterId", "status", "title", "updatedAt") SELECT "assigneeId", "categoryId", "clientId", "createdAt", "description", "folio", "id", "priority", "requesterId", "status", "title", "updatedAt" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_folio_key" ON "Ticket"("folio");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
