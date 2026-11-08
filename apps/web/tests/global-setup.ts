/**
 * Global setup de vitest: crea una BD SQLite limpia en .vitest/test.db,
 * aplica todas las migraciones con `prisma migrate deploy` y carga los
 * fixtures. Corre una vez por ejecución de la suite.
 *
 * DATABASE_URL y el resto de variables las fija vitest.config.ts (test.env).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import { API_KEY_HASHES, CATEGORIES, CLIENTS, TICKETS, USERS } from "./fixtures";

const APP_DIR = path.resolve(__dirname, "..");
export const TEST_DIR = path.join(APP_DIR, ".vitest");
export const TEST_DB_PATH = path.join(TEST_DIR, "test.db");
export const TEST_DATABASE_URL = `file:${TEST_DB_PATH.replace(/\\/g, "/")}`;

const DAY_MS = 86_400_000;

export default async function globalSetup() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });

  execSync("npx prisma migrate deploy", {
    cwd: APP_DIR,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: TEST_DATABASE_URL }) });
  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function seed(prisma: PrismaClient) {
  const password = await bcrypt.hash("Test1234!", 4);

  const roles = ["SUPERADMIN", "CLIENT_ADMIN", "AGENT", "CLIENT_SUPERVISOR", "CLIENT_USER"];
  const roleIds: Record<string, string> = {};
  for (const key of roles) {
    const role = await prisma.role.create({ data: { key, name: key, isSystem: true } });
    roleIds[key] = role.id;
  }

  for (const client of Object.values(CLIENTS)) {
    await prisma.clientCompany.create({ data: { ...client } });
  }

  for (const category of Object.values(CATEGORIES)) {
    await prisma.category.create({ data: { ...category } });
  }

  for (const u of Object.values(USERS)) {
    await prisma.user.create({
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        password,
        roleId: roleIds[u.role],
        clientId: u.clientId,
        isActive: u.id !== USERS.inactive.id,
        whatsappPhone: u.phone,
        whatsappOptIn: u.optIn,
        whatsappVerifiedAt: u.verified ? new Date("2026-10-01T12:00:00Z") : null,
      },
    });
  }
  // Quién verificó (segunda pasada: el admin debe existir antes de referenciarlo)
  await prisma.user.updateMany({
    where: { whatsappVerifiedAt: { not: null } },
    data: { whatsappVerifiedById: USERS.clientAdmin.id },
  });
  // El agente atiende a Acme
  await prisma.userClient.create({ data: { userId: USERS.agent.id, clientId: CLIENTS.acme.id } });

  await prisma.integrationApiKey.createMany({
    data: [
      {
        id: "key-full",
        name: "n8n (todos los scopes)",
        keyPrefix: "mbk_test",
        keyHash: API_KEY_HASHES.full,
        scopesJson: JSON.stringify(["contacts:read", "tickets:read", "tickets:write", "conversations:write"]),
      },
      {
        id: "key-read",
        name: "solo lectura",
        keyPrefix: "mbk_test",
        keyHash: API_KEY_HASHES.readOnly,
        scopesJson: JSON.stringify(["tickets:read"]),
      },
      {
        id: "key-revoked",
        name: "revocada",
        keyPrefix: "mbk_test",
        keyHash: API_KEY_HASHES.revoked,
        scopesJson: JSON.stringify(["tickets:read", "tickets:write"]),
        revokedAt: new Date("2026-06-01T00:00:00Z"),
      },
    ],
  });

  const now = Date.now();
  const base = { description: "Descripción de prueba", categoryId: CATEGORIES.soporte.id };

  await prisma.ticket.create({
    data: { ...base, ...TICKETS.open, status: "OPEN", requesterId: USERS.clientUser.id, clientId: CLIENTS.acme.id },
  });
  await prisma.ticket.create({
    data: {
      ...base,
      ...TICKETS.pending,
      status: "PENDING",
      requesterId: USERS.clientUser.id,
      assigneeId: USERS.agent.id,
      clientId: CLIENTS.acme.id,
    },
  });
  await prisma.ticket.create({
    data: { ...base, ...TICKETS.adminOwned, status: "OPEN", requesterId: USERS.clientAdmin.id, clientId: CLIENTS.acme.id },
  });
  await prisma.ticket.create({
    data: {
      ...base,
      ...TICKETS.closedRecent,
      status: "CLOSED",
      requesterId: USERS.clientUser.id,
      clientId: CLIENTS.acme.id,
      activities: {
        create: {
          type: "STATUS_CHANGE",
          field: "status",
          oldValue: "RESOLVED",
          newValue: "CLOSED",
          actorId: USERS.agent.id,
          createdAt: new Date(now - 1 * DAY_MS),
        },
      },
    },
  });
  await prisma.ticket.create({
    data: {
      ...base,
      ...TICKETS.closedOld,
      status: "CLOSED",
      requesterId: USERS.clientUser.id,
      clientId: CLIENTS.acme.id,
      activities: {
        create: {
          type: "STATUS_CHANGE",
          field: "status",
          oldValue: "RESOLVED",
          newValue: "CLOSED",
          actorId: USERS.agent.id,
          createdAt: new Date(now - 30 * DAY_MS),
        },
      },
    },
  });
  await prisma.ticket.create({
    data: {
      ...base,
      ...TICKETS.resolved,
      status: "RESOLVED",
      requesterId: USERS.clientUser.id,
      assigneeId: USERS.agent.id,
      clientId: CLIENTS.acme.id,
      comments: {
        create: [
          { content: "Ya quedó instalado", authorId: USERS.agent.id, isInternal: false },
          { content: "Nota interna: licencia reutilizada", authorId: USERS.agent.id, isInternal: true },
        ],
      },
    },
  });
  await prisma.ticket.create({
    data: { ...base, ...TICKETS.otherCompany, status: "OPEN", requesterId: USERS.outsider.id, clientId: CLIENTS.otra.id },
  });
}
