/**
 * Outbox: emisión desde la API de WhatsApp, reglas de gating y entrega a
 * webhooks (firma HMAC, reintentos con backoff, DEAD y reproceso) usando un
 * servidor HTTP local como destino.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { enqueueTicketEvent } from "@/lib/integrations/outbox";
import {
  dispatchEventById,
  dispatchPending,
  endpointSubscribedTo,
  ensureEnvWebhookEndpoint,
  MAX_ATTEMPTS,
  nextAttemptAfter,
  RETRY_DELAYS_MS,
  retryEvents,
} from "@/lib/integrations/outbox-dispatcher";
import { EVENT_ID_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyWebhookSignature } from "@/lib/integrations/signing";
import { parseOutboxPayload } from "@/lib/integrations/types";
import { POST as createTicket } from "@/app/api/v1/integrations/whatsapp/tickets/route";
import { POST as addComment } from "@/app/api/v1/integrations/whatsapp/tickets/[id]/comments/route";
import { POST as changeStatus } from "@/app/api/v1/integrations/whatsapp/tickets/[id]/status/route";
import { CATEGORIES, CLIENTS, TICKETS, USERS } from "../fixtures";
import { call } from "../helpers";

// ---------------------------------------------------------------------------
// Servidor HTTP local que hace de n8n
// ---------------------------------------------------------------------------
type Received = { headers: http.IncomingHttpHeaders; body: string };
let server: http.Server;
let serverUrl: string;
let received: Received[] = [];
let respondWith: () => number = () => 200;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.statusCode = respondWith();
      res.end(res.statusCode >= 400 ? "boom" : "ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // Los tickets creados aquí no deben alterar los listados que verifica
  // whatsapp-api.test.ts (el orden de archivos no está garantizado)
  await prisma.ticket.deleteMany({
    where: { OR: [{ id: "ticket-outbox-pending" }, { title: { in: ["Evento de prueba", "Sin opt-in"] } }] },
  });
});

beforeEach(async () => {
  received = [];
  respondWith = () => 200;
  await prisma.webhookEndpoint.deleteMany();
});

const SECRET = "secreto-n8n";

async function createEndpoint(overrides: { eventTypes?: string[]; isActive?: boolean; url?: string } = {}) {
  return prisma.webhookEndpoint.create({
    data: {
      name: "n8n local",
      url: overrides.url ?? serverUrl,
      secret: encryptSecret(SECRET),
      eventTypesJson: JSON.stringify(overrides.eventTypes ?? ["*"]),
      isActive: overrides.isActive ?? true,
    },
  });
}

async function eventsFor(ticketId: string) {
  return prisma.eventOutbox.findMany({ where: { aggregateId: ticketId }, orderBy: { createdAt: "asc" } });
}

const actorWeb = { id: USERS.agent.id, name: USERS.agent.name, channel: "WEB" as const };

// ---------------------------------------------------------------------------
describe("emisión desde la API de WhatsApp", () => {
  it("POST /tickets emite ticket.created con el payload estándar", async () => {
    // Conversación con mensaje reciente → ventana abierta
    await prisma.whatsappConversation.upsert({
      where: { phone: USERS.clientUser.phone },
      create: { phone: USERS.clientUser.phone, userId: USERS.clientUser.id, lastInboundAt: new Date() },
      update: { lastInboundAt: new Date() },
    });

    const r = await call(createTicket, "/tickets", {
      body: { phone: USERS.clientUser.phone, title: "Evento de prueba", description: "desc", external_message_id: "wamid.OUTBOX-1" },
    });
    expect(r.status).toBe(201);

    const events = await eventsFor(r.json.ticket.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: "ticket.created", status: "PENDING", attempts: 0 });

    const payload = parseOutboxPayload(events[0].payloadJson);
    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({
      event_id: events[0].id,
      event_type: "ticket.created",
      ticket: { id: r.json.ticket.id, folio: r.json.ticket.folio, status: "OPEN", previous_status: null, url: expect.stringContaining("/tickets/") },
      contact: { id: USERS.clientUser.id, name: USERS.clientUser.name, whatsapp_phone: USERS.clientUser.phone, opt_in: true },
      actor: { id: USERS.clientUser.id, channel: "WHATSAPP", is_customer: true },
      whatsapp: { within_24h_window: true },
    });
    expect(payload!.whatsapp.last_inbound_at).toBeTruthy();
    expect(payload!.occurred_at).toMatch(/Z$/);
  });

  it("no emite si el solicitante no tiene opt-in", async () => {
    const r = await call(createTicket, "/tickets", {
      body: { phone: USERS.outsider.phone, title: "Sin opt-in", description: "desc" },
    });
    expect(r.status).toBe(201);
    expect(await eventsFor(r.json.ticket.id)).toHaveLength(0);
  });

  it("el comentario del propio cliente no emite comment_added, pero PENDING→IN_PROGRESS sí emite status_changed", async () => {
    const ticket = await prisma.ticket.create({
      data: {
        id: "ticket-outbox-pending",
        folio: "ACM-0900",
        title: "Esperando al cliente",
        description: "d",
        status: "PENDING",
        requesterId: USERS.clientUser.id,
        assigneeId: USERS.agent.id,
        categoryId: CATEGORIES.soporte.id,
        clientId: CLIENTS.acme.id,
      },
    });

    const r = await call(addComment, "/x", { params: { id: ticket.id }, body: { phone: USERS.clientUser.phone, body: "Aquí estoy" } });
    expect(r.status).toBe(201);

    const events = await eventsFor(ticket.id);
    expect(events.map((e) => e.eventType)).toEqual(["ticket.status_changed"]);
    const payload = parseOutboxPayload(events[0].payloadJson)!;
    expect(payload.ticket).toMatchObject({ status: "IN_PROGRESS", previous_status: "PENDING" });
    expect(payload.actor.is_customer).toBe(true);
    expect(payload.comment).toBeUndefined();
  });

  it("un comentario de otro usuario (admin por WhatsApp) sí emite comment_added", async () => {
    const r = await call(addComment, "/x", {
      params: { id: "ticket-outbox-pending" },
      body: { phone: USERS.clientAdmin.phone, body: "Ya lo estamos viendo" },
    });
    expect(r.status).toBe(201);

    const events = await eventsFor("ticket-outbox-pending");
    const added = events.filter((e) => e.eventType === "ticket.comment_added");
    expect(added).toHaveLength(1);
    const payload = parseOutboxPayload(added[0].payloadJson)!;
    expect(payload.comment).toMatchObject({ body: "Ya lo estamos viendo", author_name: USERS.clientAdmin.name, channel: "WHATSAPP" });
    expect(payload.actor).toMatchObject({ id: USERS.clientAdmin.id, is_customer: false });
    expect(payload.contact.id).toBe(USERS.clientUser.id);
  });

  it("close por WhatsApp emite status_changed con previous_status", async () => {
    const r = await call(changeStatus, "/x", { params: { id: "ticket-outbox-pending" }, body: { phone: USERS.clientUser.phone, action: "close" } });
    expect(r.status).toBe(200);
    const events = await eventsFor("ticket-outbox-pending");
    const last = events[events.length - 1];
    expect(last.eventType).toBe("ticket.status_changed");
    expect(parseOutboxPayload(last.payloadJson)!.ticket).toMatchObject({ status: "CLOSED", previous_status: "IN_PROGRESS" });
  });
});

// ---------------------------------------------------------------------------
describe("enqueueTicketEvent: reglas de gating", () => {
  const ticket = { id: TICKETS.open.id, folio: TICKETS.open.folio, title: TICKETS.open.title, status: "OPEN" as const, requesterId: USERS.clientUser.id };

  it("un comentario interno no emite", async () => {
    const before = await prisma.eventOutbox.count();
    const id = await enqueueTicketEvent(prisma, {
      eventType: "ticket.comment_added",
      ticket,
      comment: { id: "c1", content: "nota", isInternal: true, channel: "WEB", author: { id: USERS.agent.id, name: USERS.agent.name } },
      actor: actorWeb,
    });
    expect(id).toBeNull();
    expect(await prisma.eventOutbox.count()).toBe(before);
  });

  it("un comentario público de un técnico sí emite, con el técnico como actor", async () => {
    const id = await enqueueTicketEvent(prisma, {
      eventType: "ticket.comment_added",
      ticket,
      comment: { id: "c2", content: "Ya lo revisé", isInternal: false, channel: "WEB", author: { id: USERS.agent.id, name: USERS.agent.name } },
      actor: actorWeb,
    });
    expect(id).toBeTruthy();
    const row = await prisma.eventOutbox.findUniqueOrThrow({ where: { id: id! } });
    const payload = parseOutboxPayload(row.payloadJson)!;
    expect(payload.actor).toMatchObject({ id: USERS.agent.id, is_customer: false, channel: "WEB" });
    expect(payload.comment?.author_name).toBe(USERS.agent.name);
  });

  it("ticket.assigned lleva al asignado (o null al desasignar)", async () => {
    const id = await enqueueTicketEvent(prisma, {
      eventType: "ticket.assigned",
      ticket: { ...ticket, status: "IN_PROGRESS" },
      previousStatus: "OPEN",
      assignee: { id: USERS.agent.id, name: USERS.agent.name },
      actor: actorWeb,
    });
    const payload = parseOutboxPayload((await prisma.eventOutbox.findUniqueOrThrow({ where: { id: id! } })).payloadJson)!;
    expect(payload.assignee).toEqual({ id: USERS.agent.id, name: USERS.agent.name });
    expect(payload.ticket.previous_status).toBe("OPEN");
  });

  it("no emite con el flag apagado ni para contactos sin teléfono", async () => {
    process.env.WHATSAPP_INTEGRATION_ENABLED = "false";
    try {
      expect(await enqueueTicketEvent(prisma, { eventType: "ticket.created", ticket, actor: actorWeb })).toBeNull();
    } finally {
      process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
    }
    // Ticket cuyo solicitante (el agente) no tiene WhatsApp
    expect(
      await enqueueTicketEvent(prisma, { eventType: "ticket.created", ticket: { ...ticket, requesterId: USERS.agent.id }, actor: actorWeb })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("dispatcher", () => {
  async function createEvent(overrides: Partial<{ attempts: number; status: "PENDING" | "FAILED" | "DEAD" | "PROCESSING"; nextAttemptAt: Date; lockedAt: Date }> = {}) {
    const id = await enqueueTicketEvent(prisma, {
      eventType: "ticket.status_changed",
      ticket: { id: TICKETS.open.id, folio: TICKETS.open.folio, title: TICKETS.open.title, status: "RESOLVED", requesterId: USERS.clientUser.id },
      previousStatus: "IN_PROGRESS",
      actor: actorWeb,
    });
    if (Object.keys(overrides).length) {
      await prisma.eventOutbox.update({ where: { id: id! }, data: overrides });
    }
    return prisma.eventOutbox.findUniqueOrThrow({ where: { id: id! } });
  }

  it("calcula el backoff 1m, 5m, 15m, 1h, 6h y DEAD tras el 5.º intento", () => {
    const now = new Date("2026-11-07T18:00:00Z");
    expect(RETRY_DELAYS_MS).toEqual([60_000, 300_000, 900_000, 3_600_000, 21_600_000]);
    expect(MAX_ATTEMPTS).toBe(5);
    expect(nextAttemptAfter(1, now)!.getTime() - now.getTime()).toBe(60_000);
    expect(nextAttemptAfter(4, now)!.getTime() - now.getTime()).toBe(3_600_000);
    expect(nextAttemptAfter(5, now)).toBeNull();
  });

  it("endpointSubscribedTo acepta lista explícita y comodín", () => {
    expect(endpointSubscribedTo({ eventTypesJson: '["ticket.created"]' }, "ticket.created")).toBe(true);
    expect(endpointSubscribedTo({ eventTypesJson: '["ticket.created"]' }, "ticket.assigned")).toBe(false);
    expect(endpointSubscribedTo({ eventTypesJson: '["*"]' }, "ticket.assigned")).toBe(true);
    expect(endpointSubscribedTo({ eventTypesJson: "basura" }, "ticket.assigned")).toBe(false);
  });

  it("entrega el evento firmado y lo marca DELIVERED", async () => {
    await createEndpoint();
    const event = await createEvent();

    const outcome = await dispatchEventById(event.id);
    expect(outcome).toMatchObject({ eventId: event.id, status: "DELIVERED", attempts: 1, error: null });

    const row = await prisma.eventOutbox.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe("DELIVERED");
    expect(row.deliveredAt).not.toBeNull();
    expect(row.lockedAt).toBeNull();

    expect(received).toHaveLength(1);
    const req = received[0];
    expect(req.body).toBe(event.payloadJson);
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.headers[EVENT_ID_HEADER.toLowerCase()]).toBe(event.id);
    const verification = verifyWebhookSignature(req.body, SECRET, {
      signature: req.headers[SIGNATURE_HEADER.toLowerCase()] as string,
      timestamp: req.headers[TIMESTAMP_HEADER.toLowerCase()] as string,
    });
    expect(verification).toEqual({ valid: true });
    expect(
      verifyWebhookSignature(req.body, "otro-secreto", {
        signature: req.headers[SIGNATURE_HEADER.toLowerCase()] as string,
        timestamp: req.headers[TIMESTAMP_HEADER.toLowerCase()] as string,
      }).valid
    ).toBe(false);
  });

  it("un webhook que falla queda FAILED con reintento en 1 min y luego se entrega", async () => {
    await createEndpoint();
    const event = await createEvent();
    const t0 = new Date();

    respondWith = () => 500;
    const first = await dispatchEventById(event.id, t0);
    expect(first).toMatchObject({ status: "FAILED", attempts: 1 });
    expect(first!.error).toContain("HTTP 500");

    const afterFail = await prisma.eventOutbox.findUniqueOrThrow({ where: { id: event.id } });
    expect(afterFail.nextAttemptAt.getTime() - t0.getTime()).toBe(RETRY_DELAYS_MS[0]);
    expect(afterFail.lastError).toContain("n8n local");

    // Aún no vence: no se reclama
    expect(await dispatchEventById(event.id, new Date(t0.getTime() + 30_000))).toBeNull();

    respondWith = () => 200;
    const second = await dispatchEventById(event.id, new Date(t0.getTime() + RETRY_DELAYS_MS[0] + 1));
    expect(second).toMatchObject({ status: "DELIVERED", attempts: 2, error: null });
    expect(received).toHaveLength(2);
  });

  it("tras el 5.º intento fallido pasa a DEAD y retryEvents lo regresa a PENDING", async () => {
    await createEndpoint();
    const event = await createEvent({ attempts: MAX_ATTEMPTS - 1, status: "FAILED" });

    respondWith = () => 503;
    const outcome = await dispatchEventById(event.id);
    expect(outcome).toMatchObject({ status: "DEAD", attempts: MAX_ATTEMPTS });

    expect(await retryEvents({ ids: [event.id] })).toBe(1);
    const row = await prisma.eventOutbox.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 0 });

    respondWith = () => 200;
    expect((await dispatchEventById(event.id))?.status).toBe("DELIVERED");
  });

  it("sin endpoints activos suscritos el evento queda DEAD con explicación", async () => {
    await createEndpoint({ isActive: false });
    await createEndpoint({ eventTypes: ["ticket.created"] }); // no suscrito a status_changed
    const event = await createEvent();
    const outcome = await dispatchEventById(event.id);
    expect(outcome).toMatchObject({ status: "DEAD" });
    expect(outcome!.error).toContain("No hay webhook endpoints");
    expect(received).toHaveLength(0);
  });

  it("timeout del webhook se registra como error", async () => {
    await createEndpoint();
    const event = await createEvent();
    const prev = process.env.WEBHOOK_TIMEOUT_SECONDS;
    process.env.WEBHOOK_TIMEOUT_SECONDS = "1";
    // El servidor "cuelga" más de un segundo
    const slow = http.createServer((_req, res) => setTimeout(() => res.end("late"), 1500));
    await new Promise<void>((resolve) => slow.listen(0, "127.0.0.1", resolve));
    await prisma.webhookEndpoint.updateMany({ data: { url: `http://127.0.0.1:${(slow.address() as AddressInfo).port}/slow` } });
    try {
      const outcome = await dispatchEventById(event.id);
      expect(outcome).toMatchObject({ status: "FAILED", attempts: 1 });
      expect(outcome!.error).toContain("timeout");
    } finally {
      process.env.WEBHOOK_TIMEOUT_SECONDS = prev;
      await new Promise<void>((resolve) => slow.close(() => resolve()));
    }
  });

  it("dispatchPending entrega los vencidos, respeta los futuros y recupera PROCESSING huérfanos", async () => {
    await createEndpoint();
    await prisma.eventOutbox.deleteMany({ where: { status: { in: ["PENDING", "FAILED", "PROCESSING"] } } });
    const now = new Date();
    const due = await createEvent();
    const future = await createEvent({ status: "FAILED", nextAttemptAt: new Date(now.getTime() + 3_600_000) });
    const stale = await createEvent({ status: "PROCESSING", lockedAt: new Date(now.getTime() - 10 * 60_000) });
    const fresh = await createEvent({ status: "PROCESSING", lockedAt: now });

    // Un segundo después: `due` ya venció (su nextAttemptAt es la hora de creación)
    const stats = await dispatchPending({ now: new Date(now.getTime() + 1000) });
    expect(stats.claimed).toBe(2);
    expect(stats.delivered).toBe(2);
    expect(received).toHaveLength(2);

    const states = Object.fromEntries(
      (await prisma.eventOutbox.findMany({ where: { id: { in: [due.id, future.id, stale.id, fresh.id] } } })).map((e) => [e.id, e.status])
    );
    expect(states[due.id]).toBe("DELIVERED");
    expect(states[stale.id]).toBe("DELIVERED");
    expect(states[future.id]).toBe("FAILED");
    expect(states[fresh.id]).toBe("PROCESSING");
  });

  it("ensureEnvWebhookEndpoint crea el endpoint de .env una sola vez", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.ejemplo.com/webhook/mirmibug";
    process.env.N8N_WEBHOOK_SECRET = "secreto-env";
    try {
      const first = await ensureEnvWebhookEndpoint();
      const second = await ensureEnvWebhookEndpoint();
      expect(first?.id).toBe(second?.id);
      expect(await prisma.webhookEndpoint.count({ where: { url: process.env.N8N_WEBHOOK_URL } })).toBe(1);
      expect(first?.secret).not.toContain("secreto-env");
    } finally {
      delete process.env.N8N_WEBHOOK_URL;
      delete process.env.N8N_WEBHOOK_SECRET;
    }
  });

  afterEach(() => {
    respondWith = () => 200;
  });
});
