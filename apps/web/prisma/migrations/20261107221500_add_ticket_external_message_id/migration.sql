-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "externalMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_externalMessageId_key" ON "Ticket"("externalMessageId");

