-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "tokenInvalidatedAt" DATETIME,
    "clientId" TEXT,
    "roleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "whatsappPhone" TEXT,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
    "whatsappVerifiedAt" DATETIME,
    "whatsappVerifiedById" TEXT,
    CONSTRAINT "User_whatsappVerifiedById_fkey" FOREIGN KEY ("whatsappVerifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientCompany" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("clientId", "createdAt", "email", "failedLoginAttempts", "id", "isActive", "lastLoginAt", "lockedUntil", "name", "password", "roleId", "tokenInvalidatedAt", "updatedAt") SELECT "clientId", "createdAt", "email", "failedLoginAttempts", "id", "isActive", "lastLoginAt", "lockedUntil", "name", "password", "roleId", "tokenInvalidatedAt", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_whatsappPhone_key" ON "User"("whatsappPhone");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
