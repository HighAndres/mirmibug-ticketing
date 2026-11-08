/**
 * Tests de integración de /api/v1/integrations/whatsapp/* contra la BD
 * SQLite de pruebas (tests/global-setup.ts). Se ejecutan en orden dentro del
 * archivo; algunos cambian el estado de los tickets fixture (se indica).
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetRateLimits } from "@/lib/integrations/rate-limit";
import { GET as lookup } from "@/app/api/v1/integrations/whatsapp/contacts/lookup/route";
import { GET as contactTickets } from "@/app/api/v1/integrations/whatsapp/contacts/[id]/tickets/route";
import { GET as byFolio } from "@/app/api/v1/integrations/whatsapp/tickets/by-folio/[folio]/route";
import { POST as createTicket } from "@/app/api/v1/integrations/whatsapp/tickets/route";
import { POST as addComment } from "@/app/api/v1/integrations/whatsapp/tickets/[id]/comments/route";
import { POST as changeStatus } from "@/app/api/v1/integrations/whatsapp/tickets/[id]/status/route";
import { POST as addAttachment } from "@/app/api/v1/integrations/whatsapp/tickets/[id]/attachments/route";
import { GET as getConversation, PUT as putConversation } from "@/app/api/v1/integrations/whatsapp/conversations/[phone]/route";
import { API_KEYS, CATEGORIES, RAW_PHONES, TICKETS, USERS } from "../fixtures";
import { call } from "../helpers";

const P = {
  user: USERS.clientUser.phone,
  admin: USERS.clientAdmin.phone,
  unverified: USERS.unverified.phone,
  outsider: USERS.outsider.phone,
  inactive: USERS.inactive.phone,
};

beforeEach(() => resetRateLimits());

// ---------------------------------------------------------------------------
describe("autenticación y flag", () => {
  it("401 sin API key", async () => {
    const r = await call(lookup, "/contacts/lookup", { apiKey: null, query: { phone: P.user } });
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
  });

  it("401 con key revocada", async () => {
    const r = await call(lookup, "/contacts/lookup", { apiKey: API_KEYS.revoked, query: { phone: P.user } });
    expect(r.status).toBe(401);
  });

  it("403 FORBIDDEN_SCOPE cuando la key no tiene el scope", async () => {
    const r = await call(createTicket, "/tickets", {
      apiKey: API_KEYS.readOnly,
      body: { phone: P.user, title: "x", description: "y" },
    });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("FORBIDDEN_SCOPE");
  });

  it("404 cuando el flag está apagado", async () => {
    process.env.WHATSAPP_INTEGRATION_ENABLED = "false";
    try {
      const r = await call(lookup, "/contacts/lookup", { query: { phone: P.user } });
      expect(r.status).toBe(404);
      expect(r.json.error.code).toBe("NOT_FOUND");
    } finally {
      process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
    }
  });
});

// ---------------------------------------------------------------------------
describe("GET /contacts/lookup", () => {
  it("encuentra al contacto verificado con el teléfono tal como lo manda Meta", async () => {
    const r = await call(lookup, "/contacts/lookup", { query: { phone: RAW_PHONES.clientUserMeta } });
    expect(r.status).toBe(200);
    expect(r.json.contact).toMatchObject({
      id: USERS.clientUser.id,
      name: USERS.clientUser.name,
      role: "CLIENT_USER",
      whatsapp_phone: P.user,
      verified: true,
      opt_in: true,
    });
    expect(r.json.client).toMatchObject({ id: USERS.clientUser.clientId, slug: "acme-test" });
    expect(r.json.verified).toBe(true);
    expect(r.json.opt_in).toBe(true);
  });

  it("normaliza un número nacional con espacios", async () => {
    const r = await call(lookup, "/contacts/lookup", { query: { phone: RAW_PHONES.clientUserPretty } });
    expect(r.status).toBe(200);
    expect(r.json.contact.id).toBe(USERS.clientUser.id);
  });

  it("devuelve verified=false para un contacto sin verificar (no 403)", async () => {
    const r = await call(lookup, "/contacts/lookup", { query: { phone: P.unverified } });
    expect(r.status).toBe(200);
    expect(r.json.verified).toBe(false);
    expect(r.json.contact.verified_at).toBeNull();
  });

  it("404 para número desconocido o usuario inactivo", async () => {
    expect((await call(lookup, "/contacts/lookup", { query: { phone: "+525599999999" } })).status).toBe(404);
    expect((await call(lookup, "/contacts/lookup", { query: { phone: P.inactive } })).status).toBe(404);
  });

  it("400 VALIDATION_ERROR con teléfono inválido o ausente", async () => {
    const bad = await call(lookup, "/contacts/lookup", { query: { phone: "abc" } });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatchObject({ code: "VALIDATION_ERROR", details: { field: "phone" } });
    const missing = await call(lookup, "/contacts/lookup");
    expect(missing.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe("GET /contacts/{id}/tickets", () => {
  it("CLIENT_USER solo ve sus tickets abiertos (incluye RESOLVED, excluye CLOSED y ajenos)", async () => {
    const r = await call(contactTickets, "/x", { params: { id: USERS.clientUser.id } });
    expect(r.status).toBe(200);
    const folios = r.json.tickets.map((t: { folio: string }) => t.folio).sort();
    expect(folios).toEqual([TICKETS.open.folio, TICKETS.pending.folio, TICKETS.resolved.folio].sort());
    expect(r.json.count).toBe(3);
    expect(r.json.filter).toBe("open");
    for (const row of r.json.whatsapp_rows) {
      expect(row.title.length).toBeLessThanOrEqual(24);
      expect(row.description.length).toBeLessThanOrEqual(72);
    }
    expect(r.json.tickets[0]).toMatchObject({ status_label: expect.any(String), url: expect.stringContaining("/tickets/") });
  });

  it("status=closed devuelve los cerrados", async () => {
    const r = await call(contactTickets, "/x", { params: { id: USERS.clientUser.id }, query: { status: "closed" } });
    const folios = r.json.tickets.map((t: { folio: string }) => t.folio).sort();
    expect(folios).toEqual([TICKETS.closedRecent.folio, TICKETS.closedOld.folio].sort());
  });

  it("CLIENT_ADMIN ve los de toda su empresa", async () => {
    const r = await call(contactTickets, "/x", { params: { id: USERS.clientAdmin.id }, query: { status: "all" } });
    const folios = r.json.tickets.map((t: { folio: string }) => t.folio);
    expect(folios).toContain(TICKETS.open.folio);
    expect(folios).toContain(TICKETS.adminOwned.folio);
    expect(folios).not.toContain(TICKETS.otherCompany.folio);
  });

  it("403 CONTACT_NOT_VERIFIED para un contacto sin verificar", async () => {
    const r = await call(contactTickets, "/x", { params: { id: USERS.unverified.id } });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("CONTACT_NOT_VERIFIED");
  });

  it("404 para un id inexistente y 400 para un filtro inválido", async () => {
    expect((await call(contactTickets, "/x", { params: { id: "nope" } })).status).toBe(404);
    const bad = await call(contactTickets, "/x", { params: { id: USERS.clientUser.id }, query: { status: "weird" } });
    expect(bad.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe("GET /tickets/by-folio/{folio}", () => {
  it("devuelve el resumen con comentarios públicos (sin internos)", async () => {
    const r = await call(byFolio, "/x", { params: { folio: TICKETS.resolved.folio }, query: { phone: P.user } });
    expect(r.status).toBe(200);
    expect(r.json.ticket).toMatchObject({ folio: TICKETS.resolved.folio, status: "RESOLVED", status_label: "Resuelto" });
    expect(r.json.public_comment_count).toBe(1);
    expect(r.json.last_public_comment.body).toBe("Ya quedó instalado");
  });

  it("acepta el folio en minúsculas", async () => {
    const r = await call(byFolio, "/x", { params: { folio: "acm-0001" }, query: { phone: P.user } });
    expect(r.status).toBe(200);
  });

  it("404 si el ticket es de otra empresa o de otro usuario (nunca 403)", async () => {
    expect((await call(byFolio, "/x", { params: { folio: TICKETS.open.folio }, query: { phone: P.outsider } })).status).toBe(404);
    expect((await call(byFolio, "/x", { params: { folio: TICKETS.adminOwned.folio }, query: { phone: P.user } })).status).toBe(404);
    // El admin sí ve el de su compañero de empresa
    expect((await call(byFolio, "/x", { params: { folio: TICKETS.open.folio }, query: { phone: P.admin } })).status).toBe(200);
  });

  it("400 sin phone y 403 si el contacto no está verificado", async () => {
    expect((await call(byFolio, "/x", { params: { folio: TICKETS.open.folio } })).status).toBe(400);
    const r = await call(byFolio, "/x", { params: { folio: TICKETS.open.folio }, query: { phone: P.unverified } });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("CONTACT_NOT_VERIFIED");
  });
});

// ---------------------------------------------------------------------------
describe("POST /tickets", () => {
  const wamid = "wamid.CREATE-0001";

  it("crea el ticket con canal WHATSAPP, folio del cliente, categoría default y auditoría", async () => {
    const r = await call(createTicket, "/tickets", {
      body: { phone: RAW_PHONES.clientUserMeta, title: "No tengo internet", description: "Desde las 9 am", external_message_id: wamid },
    });
    expect(r.status).toBe(201);
    expect(r.json.created).toBe(true);
    expect(r.json.ticket).toMatchObject({
      folio: expect.stringMatching(/^ACM-\d{4}$/),
      status: "OPEN",
      priority: "MEDIUM",
      source_channel: "WHATSAPP",
      category: CATEGORIES.soporte.name,
      requester: { id: USERS.clientUser.id },
    });

    const db = await prisma.ticket.findUniqueOrThrow({ where: { id: r.json.ticket.id } });
    expect(db.externalMessageId).toBe(wamid);
    expect(db.lastCustomerActivityAt).not.toBeNull();
    expect(await prisma.ticketActivity.count({ where: { ticketId: db.id, type: "CREATED", actorId: USERS.clientUser.id } })).toBe(1);
    const audit = await prisma.auditLog.findFirst({ where: { entityType: "Ticket", entityId: db.id, action: "CREATE" } });
    expect(audit?.metadataJson).toContain('"channel":"WHATSAPP"');
    expect(audit?.metadataJson).toContain('"apiKeyId":"key-full"');
  });

  it("es idempotente por external_message_id (200, mismo ticket)", async () => {
    const before = await prisma.ticket.count();
    const r = await call(createTicket, "/tickets", {
      body: { phone: P.user, title: "Otro título", description: "Otra desc", external_message_id: wamid },
    });
    expect(r.status).toBe(200);
    expect(r.json.created).toBe(false);
    expect(r.json.ticket.title).toBe("No tengo internet");
    expect(await prisma.ticket.count()).toBe(before);
  });

  it("acepta category_id y priority explícitos", async () => {
    const r = await call(createTicket, "/tickets", {
      body: { phone: P.user, title: "Switch caído", description: "Piso 2", category_id: CATEGORIES.otra.id, priority: "HIGH" },
    });
    expect(r.status).toBe(201);
    expect(r.json.ticket).toMatchObject({ category: CATEGORIES.otra.name, priority: "HIGH" });
  });

  it("valida campos: título faltante, categoría inexistente, prioridad inválida", async () => {
    const noTitle = await call(createTicket, "/tickets", { body: { phone: P.user, description: "x" } });
    expect(noTitle.status).toBe(400);
    expect(noTitle.json.error).toMatchObject({ code: "VALIDATION_ERROR", details: { field: "title" } });

    const badCat = await call(createTicket, "/tickets", { body: { phone: P.user, title: "a", description: "b", category_id: "nope" } });
    expect(badCat.status).toBe(400);
    expect(badCat.json.error.details).toEqual({ field: "category_id" });

    const badPrio = await call(createTicket, "/tickets", { body: { phone: P.user, title: "a", description: "b", priority: "ASAP" } });
    expect(badPrio.status).toBe(400);

    const badJson = await call(createTicket, "/tickets", { rawBody: "{not json", method: "POST", headers: { "content-type": "application/json" } });
    expect(badJson.status).toBe(400);
  });

  it("403 para contacto sin verificar y 404 para número desconocido", async () => {
    const r = await call(createTicket, "/tickets", { body: { phone: P.unverified, title: "a", description: "b" } });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("CONTACT_NOT_VERIFIED");
    const unknown = await call(createTicket, "/tickets", { body: { phone: "+525599999999", title: "a", description: "b" } });
    expect(unknown.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe("POST /tickets/{id}/comments", () => {
  const wamid = "wamid.COMMENT-0001";

  it("crea un comentario público con canal WHATSAPP y actualiza la actividad del cliente", async () => {
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: TICKETS.open.id } });
    const r = await call(addComment, "/x", {
      params: { id: TICKETS.open.id },
      body: { phone: P.user, body: "¿Alguna novedad?", external_message_id: wamid },
    });
    expect(r.status).toBe(201);
    expect(r.json.created).toBe(true);
    expect(r.json.comment).toMatchObject({
      ticket_id: TICKETS.open.id,
      body: "¿Alguna novedad?",
      channel: "WHATSAPP",
      is_internal: false,
      external_message_id: wamid,
      author: { id: USERS.clientUser.id },
    });
    expect(r.json.status_changed).toBe(false);
    expect(r.json.ticket_status).toBe("OPEN");

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: TICKETS.open.id } });
    expect(after.lastCustomerActivityAt).not.toBeNull();
    expect(after.lastCustomerActivityAt?.getTime() ?? 0).toBeGreaterThan(before.lastCustomerActivityAt?.getTime() ?? 0);
  });

  it("es idempotente por external_message_id (200, mismo comentario, sin duplicar)", async () => {
    const before = await prisma.comment.count({ where: { ticketId: TICKETS.open.id } });
    const r = await call(addComment, "/x", {
      params: { id: TICKETS.open.id },
      body: { phone: P.user, body: "texto distinto", external_message_id: wamid },
    });
    expect(r.status).toBe(200);
    expect(r.json.created).toBe(false);
    expect(r.json.comment.body).toBe("¿Alguna novedad?");
    expect(await prisma.comment.count({ where: { ticketId: TICKETS.open.id } })).toBe(before);
  });

  it("409 CONFLICT si el mismo external_message_id se usa en otro ticket", async () => {
    const r = await call(addComment, "/x", {
      params: { id: TICKETS.resolved.id },
      body: { phone: P.user, body: "x", external_message_id: wamid },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("CONFLICT");
  });

  it("un ticket PENDING pasa a IN_PROGRESS cuando el cliente responde (muta ticket-pending)", async () => {
    const r = await call(addComment, "/x", {
      params: { id: TICKETS.pending.id },
      body: { phone: P.user, body: "Ya probé reiniciar y sigue igual" },
    });
    expect(r.status).toBe(201);
    expect(r.json.status_changed).toBe(true);
    expect(r.json.ticket_status).toBe("IN_PROGRESS");

    const db = await prisma.ticket.findUniqueOrThrow({ where: { id: TICKETS.pending.id } });
    expect(db.status).toBe("IN_PROGRESS");
    const activity = await prisma.ticketActivity.findFirst({
      where: { ticketId: TICKETS.pending.id, type: "STATUS_CHANGE", oldValue: "PENDING", newValue: "IN_PROGRESS" },
    });
    expect(activity?.actorId).toBe(USERS.clientUser.id);
  });

  it("404 si el teléfono no tiene acceso al ticket (otra empresa u otro usuario)", async () => {
    expect((await call(addComment, "/x", { params: { id: TICKETS.open.id }, body: { phone: P.outsider, body: "hola" } })).status).toBe(404);
    expect((await call(addComment, "/x", { params: { id: TICKETS.adminOwned.id }, body: { phone: P.user, body: "hola" } })).status).toBe(404);
    expect((await call(addComment, "/x", { params: { id: "no-existe" }, body: { phone: P.user, body: "hola" } })).status).toBe(404);
    // El admin de la empresa sí puede comentar el ticket de su usuario
    expect((await call(addComment, "/x", { params: { id: TICKETS.open.id }, body: { phone: P.admin, body: "Lo reviso" } })).status).toBe(201);
  });

  it("400 sin body y 403 sin verificar", async () => {
    expect((await call(addComment, "/x", { params: { id: TICKETS.open.id }, body: { phone: P.user } })).status).toBe(400);
    expect((await call(addComment, "/x", { params: { id: TICKETS.open.id }, body: { phone: P.unverified, body: "x" } })).status).toBe(403);
  });

  it("aplica el rate limit por teléfono (429)", async () => {
    const prev = process.env.WHATSAPP_PHONE_RATE_LIMIT_PER_MIN;
    process.env.WHATSAPP_PHONE_RATE_LIMIT_PER_MIN = "2";
    resetRateLimits();
    try {
      const send = () => call(addComment, "/x", { params: { id: TICKETS.open.id }, body: { phone: RAW_PHONES.clientUserMeta, body: "spam" } });
      expect((await send()).status).toBe(201);
      expect((await send()).status).toBe(201);
      const third = await send();
      expect(third.status).toBe(429);
      expect(third.json.error.code).toBe("RATE_LIMITED");
      expect(third.headers.get("Retry-After")).toBeTruthy();
    } finally {
      process.env.WHATSAPP_PHONE_RATE_LIMIT_PER_MIN = prev;
      resetRateLimits();
    }
  });
});

// ---------------------------------------------------------------------------
describe("POST /tickets/{id}/status", () => {
  it("reopen de un ticket cerrado hace poco → OPEN (sin asignado) (muta ticket-closed-recent)", async () => {
    const r = await call(changeStatus, "/x", { params: { id: TICKETS.closedRecent.id }, body: { phone: P.user, action: "reopen" } });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ action: "reopen", previous_status: "CLOSED", ticket: { status: "OPEN" } });
    const activity = await prisma.ticketActivity.findFirst({
      where: { ticketId: TICKETS.closedRecent.id, oldValue: "CLOSED", newValue: "OPEN" },
    });
    expect(activity?.actorId).toBe(USERS.clientUser.id);
  });

  it("reopen de un ticket cerrado hace 30 días → 409 INVALID_TRANSITION", async () => {
    const r = await call(changeStatus, "/x", { params: { id: TICKETS.closedOld.id }, body: { phone: P.user, action: "reopen" } });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("INVALID_TRANSITION");
    expect(r.json.error.message).toContain("7 días");
  });

  it("close de un ticket RESOLVED → CLOSED y un segundo close → 409 (muta ticket-resolved)", async () => {
    const r = await call(changeStatus, "/x", { params: { id: TICKETS.resolved.id }, body: { phone: P.user, action: "close" } });
    expect(r.status).toBe(200);
    expect(r.json.ticket.status).toBe("CLOSED");
    const again = await call(changeStatus, "/x", { params: { id: TICKETS.resolved.id }, body: { phone: P.user, action: "close" } });
    expect(again.status).toBe(409);
  });

  it("reopen de un ticket cerrado con asignado → IN_PROGRESS", async () => {
    // ticket-resolved se acaba de cerrar y tiene asignado al agente
    const r = await call(changeStatus, "/x", { params: { id: TICKETS.resolved.id }, body: { phone: P.user, action: "reopen" } });
    expect(r.status).toBe(200);
    expect(r.json.ticket.status).toBe("IN_PROGRESS");
  });

  it("reopen de un ticket abierto → 409; acción desconocida → 400; ajeno → 404", async () => {
    expect((await call(changeStatus, "/x", { params: { id: TICKETS.open.id }, body: { phone: P.user, action: "reopen" } })).status).toBe(409);
    expect((await call(changeStatus, "/x", { params: { id: TICKETS.open.id }, body: { phone: P.user, action: "delete" } })).status).toBe(400);
    expect((await call(changeStatus, "/x", { params: { id: TICKETS.open.id }, body: { phone: P.outsider, action: "close" } })).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe("POST /tickets/{id}/attachments", () => {
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  );

  function multipart(fields: Record<string, string>, file?: { name: string; type: string; data: Buffer }) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    if (file) form.set("file", new Blob([new Uint8Array(file.data)], { type: file.type }), file.name);
    return form;
  }

  it("guarda un adjunto multipart con source WHATSAPP y el archivo en disco", async () => {
    const r = await call(addAttachment, "/x", {
      params: { id: TICKETS.open.id },
      method: "POST",
      rawBody: multipart({ phone: P.user, external_media_id: "media-001" }, { name: "foto.png", type: "image/png", data: PNG }),
    });
    expect(r.status).toBe(201);
    expect(r.json.created).toBe(true);
    expect(r.json.attachment).toMatchObject({
      ticket_id: TICKETS.open.id,
      filename: "foto.png",
      mime_type: "image/png",
      size_bytes: PNG.length,
      source: "WHATSAPP",
      external_media_id: "media-001",
      url: expect.stringContaining("/api/attachments/"),
    });

    const db = await prisma.attachment.findUniqueOrThrow({ where: { id: r.json.attachment.id } });
    expect(db.uploadedById).toBe(USERS.clientUser.id);
    const onDisk = path.join(process.env.APP_DIR!, "public", "uploads", "attachments", db.storedName);
    expect(fs.existsSync(onDisk)).toBe(true);
    expect(fs.readFileSync(onDisk).equals(PNG)).toBe(true);
  });

  it("es idempotente por external_media_id dentro del ticket", async () => {
    const r = await call(addAttachment, "/x", {
      params: { id: TICKETS.open.id },
      method: "POST",
      rawBody: multipart({ phone: P.user, external_media_id: "media-001" }, { name: "otra.png", type: "image/png", data: PNG }),
    });
    expect(r.status).toBe(200);
    expect(r.json.created).toBe(false);
    expect(r.json.attachment.filename).toBe("foto.png");
  });

  it("415 para un tipo no permitido y 413 si excede ATTACHMENT_MAX_MB", async () => {
    const exe = await call(addAttachment, "/x", {
      params: { id: TICKETS.open.id },
      method: "POST",
      rawBody: multipart({ phone: P.user }, { name: "virus.exe", type: "application/x-msdownload", data: PNG }),
    });
    expect(exe.status).toBe(415);
    expect(exe.json.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");

    const big = Buffer.alloc(1024 * 1024 + 1, 1);
    const tooBig = await call(addAttachment, "/x", {
      params: { id: TICKETS.open.id },
      method: "POST",
      rawBody: multipart({ phone: P.user }, { name: "grande.pdf", type: "application/pdf", data: big }),
    });
    expect(tooBig.status).toBe(413);
    expect(tooBig.json.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("400 sin archivo, 404 ticket ajeno, y media_url insegura rechazada", async () => {
    const noFile = await call(addAttachment, "/x", { params: { id: TICKETS.open.id }, method: "POST", rawBody: multipart({ phone: P.user }) });
    expect(noFile.status).toBe(400);

    const foreign = await call(addAttachment, "/x", {
      params: { id: TICKETS.otherCompany.id },
      method: "POST",
      rawBody: multipart({ phone: P.user }, { name: "a.png", type: "image/png", data: PNG }),
    });
    expect(foreign.status).toBe(404);

    const http = await call(addAttachment, "/x", { params: { id: TICKETS.open.id }, body: { phone: P.user, media_url: "http://example.com/a.png" } });
    expect(http.status).toBe(400);
    expect(http.json.error.details).toEqual({ field: "media_url" });

    const internal = await call(addAttachment, "/x", { params: { id: TICKETS.open.id }, body: { phone: P.user, media_url: "https://127.0.0.1/a.png" } });
    expect(internal.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe("GET / PUT /conversations/{phone}", () => {
  const phoneParam = encodeURIComponent(P.user);

  afterEach(() => resetRateLimits());

  it("GET de un número sin conversación devuelve el estado por defecto", async () => {
    const r = await call(getConversation, "/x", { params: { phone: encodeURIComponent("+525566666666") } });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      phone: "+525566666666",
      exists: false,
      state: "IDLE",
      context: {},
      active_ticket_id: null,
      contact_id: null,
      within_24h_window: false,
    });
  });

  it("PUT crea la conversación, liga el contacto y calcula la ventana de 24 h", async () => {
    const inbound = new Date().toISOString();
    const r = await call(putConversation, "/x", {
      params: { phone: phoneParam },
      method: "PUT",
      body: {
        state: "CHOOSING_TICKET",
        active_ticket_id: TICKETS.open.id,
        context: { offeredTicketIds: [TICKETS.open.id], pendingAction: "comment" },
        last_inbound_at: inbound,
      },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      phone: P.user,
      exists: true,
      state: "CHOOSING_TICKET",
      active_ticket_id: TICKETS.open.id,
      active_ticket: { folio: TICKETS.open.folio },
      contact_id: USERS.clientUser.id,
      last_inbound_at: inbound,
      within_24h_window: true,
      context: { offeredTicketIds: [TICKETS.open.id], pendingAction: "comment" },
    });

    const again = await call(getConversation, "/x", { params: { phone: RAW_PHONES.clientUserMeta } });
    expect(again.json.state).toBe("CHOOSING_TICKET");
  });

  it("PUT parcial solo toca lo enviado; active_ticket_id=null lo quita", async () => {
    const r = await call(putConversation, "/x", { params: { phone: phoneParam }, method: "PUT", body: { state: "IDLE", active_ticket_id: null } });
    expect(r.status).toBe(200);
    expect(r.json.state).toBe("IDLE");
    expect(r.json.active_ticket_id).toBeNull();
    expect(r.json.context).toEqual({ offeredTicketIds: [TICKETS.open.id], pendingAction: "comment" });
  });

  it("la ventana se cierra pasadas 24 h", async () => {
    const old = new Date(Date.now() - 25 * 3_600_000).toISOString();
    const r = await call(putConversation, "/x", { params: { phone: phoneParam }, method: "PUT", body: { last_inbound_at: old } });
    expect(r.json.within_24h_window).toBe(false);
  });

  it("404 si el ticket activo no es visible para el contacto; 400 con estado inválido", async () => {
    const foreign = await call(putConversation, "/x", { params: { phone: phoneParam }, method: "PUT", body: { active_ticket_id: TICKETS.otherCompany.id } });
    expect(foreign.status).toBe(404);
    const bad = await call(putConversation, "/x", { params: { phone: phoneParam }, method: "PUT", body: { state: "FLYING" } });
    expect(bad.status).toBe(400);
    expect(bad.json.error.details).toEqual({ field: "state" });
  });

  it("acepta números desconocidos (sin contacto) para guardar estado", async () => {
    const r = await call(putConversation, "/x", { params: { phone: encodeURIComponent("+525577777777") }, method: "PUT", body: { state: "AWAITING_CONFIRMATION" } });
    expect(r.status).toBe(200);
    expect(r.json.contact_id).toBeNull();
    expect(r.json.state).toBe("AWAITING_CONFIRMATION");
  });
});
