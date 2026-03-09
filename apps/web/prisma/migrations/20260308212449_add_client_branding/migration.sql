-- AlterTable
ALTER TABLE "ClientCompany" ADD COLUMN "accentColor" TEXT;
ALTER TABLE "ClientCompany" ADD COLUMN "address" TEXT;
ALTER TABLE "ClientCompany" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "ClientCompany" ADD COLUMN "primaryColor" TEXT;
ALTER TABLE "ClientCompany" ADD COLUMN "slaHours" INTEGER DEFAULT 8;
ALTER TABLE "ClientCompany" ADD COLUMN "supportEmail" TEXT;
ALTER TABLE "ClientCompany" ADD COLUMN "supportPhone" TEXT;
ALTER TABLE "ClientCompany" ADD COLUMN "timezone" TEXT DEFAULT 'America/Mexico_City';
ALTER TABLE "ClientCompany" ADD COLUMN "welcomeText" TEXT;
