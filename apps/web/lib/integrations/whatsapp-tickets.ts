/**
 * Operaciones sobre tickets que n8n ejecuta en nombre de un contacto de
 * WhatsApp. Replican las reglas de lib/actions/tickets.ts (auditoría,
 * timeline y correos) pero con el contacto como actor y canal WHATSAPP.
 *
 * Fase 4: aquí se insertan los eventos del outbox (ticket.created,
 * ticket.status_changed, ...) en la misma transacción que el cambio.
 */
import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateFolio, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/tickets";
import {
  notifyCollaboratorsNewComment,
  notifyCollaboratorsStatusChanged,
  notifyNewComment,
  notifyStatusChanged,
  notifyTicketCreated,
} from "@/lib/mailer";
import { saveAttachmentFile, WHATSAPP_ALLOWED_ATTACHMENT_TYPES } from "@/lib/uploads";
import { getIntegrationConfig } from "./config";
import { contactCanAccessTicket, ticketWhereForContact, type Contact } from "./contacts";
import { IntegrationError, integrationErrors } from "./http";
import { enqueueTicketEvent, scheduleImmediateDispatch } from "./outbox";

// ---------------------------------------------------------------------------
// Constantes y helpers
// ---------------------------------------------------------------------------
export const OPEN_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "PENDING", "RESOLVED"];
export const TICKET_LIST_FILTERS = ["open", "closed", "all"] as const;
export type TicketListFilter = (typeof TICKET_LIST_FILTERS)[number];
export const CUSTOMER_STATUS_ACTIONS = ["close", "reopen"] as const;
export type CustomerStatusAction = (typeof CUSTOMER_STATUS_ACTIONS)[number];
export const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function appUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function ticketUrl(ticketId: string): string {
  return `${appUrl()}/tickets/${ticketId}`;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function isUniqueViolation(err: unknown, field: string): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } };
  return e?.code === "P2002" && JSON.stringify(e.meta?.target ?? "").includes(field);
}

function auditMeta(apiKeyId: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ channel: "WHATSAPP", apiKeyId, ...extra });
}

// ---------------------------------------------------------------------------
// Selects y serializadores
// ---------------------------------------------------------------------------
const ticketSelect = {
  id: true,
  folio: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  lastCustomerActivityAt: true,
  sourceChannel: true,
  externalMessageId: true,
  clientId: true,
  requesterId: true,
  assigneeId: true,
  requester: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  category: { select: { id: true, name: true } },
  collaborators: { select: { user: { select: { id: true, name: true, email: true } } } },
} satisfies Prisma.TicketSelect;

export type TicketRow = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;

const commentSelect = {
  id: true,
  content: true,
  isInternal: true,
  channel: true,
  externalMessageId: true,
  createdAt: true,
  ticketId: true,
  author: { select: { id: true, name: true } },
} satisfies Prisma.CommentSelect;

export type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

const attachmentSelect = {
  id: true,
  filename: true,
  mimeType: true,
  size: true,
  source: true,
  externalMediaId: true,
  createdAt: true,
  ticketId: true,
} satisfies Prisma.AttachmentSelect;

export type AttachmentRow = Prisma.AttachmentGetPayload<{ select: typeof attachmentSelect }>;

export function serializeTicket(t: TicketRow) {
  return {
    id: t.id,
    folio: t.folio,
    title: t.title,
    description: t.description,
    status: t.status,
    status_label: STATUS_LABELS[t.status] ?? t.status,
    priority: t.priority,
    priority_label: PRIORITY_LABELS[t.priority] ?? t.priority,
    category: t.category.name,
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
    requester: { id: t.requester.id, name: t.requester.name },
    source_channel: t.sourceChannel,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
    last_customer_activity_at: t.lastCustomerActivityAt?.toISOString() ?? null,
    url: ticketUrl(t.id),
  };
}

export function serializeComment(c: CommentRow) {
  return {
    id: c.id,
    ticket_id: c.ticketId,
    body: c.content,
    channel: c.channel,
    is_internal: c.isInternal,
    external_message_id: c.externalMessageId,
    author: { id: c.author.id, name: c.author.name },
    created_at: c.createdAt.toISOString(),
  };
}

export function serializeAttachment(a: AttachmentRow) {
  return {
    id: a.id,
    ticket_id: a.ticketId,
    filename: a.filename,
    mime_type: a.mimeType,
    size_bytes: a.size,
    source: a.source,
    external_media_id: a.externalMediaId,
    created_at: a.createdAt.toISOString(),
    url: `${appUrl()}/api/attachments/${a.id}`,
  };
}

/**
 * Filas para una lista interactiva de WhatsApp (máx. 10; título ≤ 24 y
 * descripción ≤ 72 caracteres según la API de Meta).
 */
export function whatsappListRows(tickets: TicketRow[]) {
  return tickets.slice(0, 10).map((t) => ({
    id: t.id,
    title: truncate(t.folio, 24),
    description: truncate(`${STATUS_LABELS[t.status] ?? t.status} · ${t.title}`, 72),
  }));
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/** Ticket accesible para el contacto o 404 (nunca 403). */
export async function requireAccessibleTicket(
  contact: Contact,
  where: { id: string } | { folio: string }
): Promise<TicketRow> {
  const ticket = await prisma.ticket.findUnique({ where, select: ticketSelect });
  if (!ticket || !(await contactCanAccessTicket(contact, ticket))) {
    throw integrationErrors.notFound("Ticket no encontrado.");
  }
  return ticket;
}

export async function listTicketsForContact(
  contact: Contact,
  filter: TicketListFilter = "open",
  limit = 10
): Promise<TicketRow[]> {
  const scope = await ticketWhereForContact(contact);
  const statusWhere: Prisma.TicketWhereInput =
    filter === "open" ? { status: { in: OPEN_STATUSES } } : filter === "closed" ? { status: "CLOSED" } : {};
  return prisma.ticket.findMany({
    where: { AND: [scope, statusWhere] },
    select: ticketSelect,
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

export async function publicCommentSummary(ticketId: string) {
  const [count, last] = await Promise.all([
    prisma.comment.count({ where: { ticketId, isInternal: false } }),
    prisma.comment.findFirst({
      where: { ticketId, isInternal: false },
      orderBy: { createdAt: "desc" },
      select: commentSelect,
    }),
  ]);
  return {
    public_comment_count: count,
    last_public_comment: last
      ? { ...serializeComment(last), body: truncate(last.content, 200) }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Crear ticket
// ---------------------------------------------------------------------------
async function resolveCategoryId(categoryId?: string): Promise<string> {
  if (categoryId) {
    const found = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!found) throw integrationErrors.validation("La categoría indicada no existe.", { field: "category_id" });
    return found.id;
  }
  const { defaultCategoryName } = getIntegrationConfig();
  const byName = await prisma.category.findUnique({ where: { name: defaultCategoryName }, select: { id: true } });
  if (byName) return byName.id;
  const first = await prisma.category.findFirst({ orderBy: { name: "asc" }, select: { id: true } });
  if (!first) throw new IntegrationError(500, "INTERNAL_ERROR", "No hay categorías configuradas en el sistema.");
  return first.id;
}

export type CreateTicketInput = {
  contact: Contact;
  title: string;
  description: string;
  externalMessageId?: string;
  categoryId?: string;
  priority?: TicketPriority;
  apiKeyId: string;
};

export async function createTicketFromWhatsapp(
  input: CreateTicketInput
): Promise<{ ticket: TicketRow; created: boolean }> {
  const { contact, title, description, externalMessageId, apiKeyId } = input;

  if (externalMessageId) {
    const existing = await prisma.ticket.findUnique({ where: { externalMessageId }, select: ticketSelect });
    if (existing) {
      if (existing.requesterId !== contact.id) {
        throw new IntegrationError(409, "CONFLICT", "external_message_id ya está asociado a otro ticket.");
      }
      return { ticket: existing, created: false };
    }
  }

  if (!contact.clientId) {
    throw integrationErrors.validation("El contacto no pertenece a ninguna empresa; no puede crear tickets.");
  }
  const clientId = contact.clientId;
  const categoryId = await resolveCategoryId(input.categoryId);
  const priority = input.priority ?? "MEDIUM";
  const now = new Date();

  // Dos creaciones simultáneas pueden calcular el mismo folio; se reintenta.
  for (let attempt = 0; ; attempt++) {
    const folio = await generateFolio(clientId);
    try {
      const ticket = await prisma.$transaction(async (tx) => {
        const created = await tx.ticket.create({
          data: {
            folio,
            title,
            description,
            priority,
            status: "OPEN",
            sourceChannel: "WHATSAPP",
            lastCustomerActivityAt: now,
            externalMessageId: externalMessageId ?? null,
            requesterId: contact.id,
            categoryId,
            clientId,
          },
          select: ticketSelect,
        });
        await tx.auditLog.create({
          data: {
            action: "CREATE",
            entityType: "Ticket",
            entityId: created.id,
            description: `Ticket ${created.folio} creado por WhatsApp: "${title}"`,
            actorId: contact.id,
            metadataJson: auditMeta(apiKeyId, { folio: created.folio, clientId, categoryId, externalMessageId }),
          },
        });
        await tx.ticketActivity.create({
          data: { type: "CREATED", ticketId: created.id, actorId: contact.id },
        });
        const eventId = await enqueueTicketEvent(tx, {
          eventType: "ticket.created",
          ticket: created,
          actor: { id: contact.id, name: contact.name, channel: "WHATSAPP" },
        });
        return { created, eventId };
      });

      notifyTicketCreated(contact.email, contact.name, ticket.created).catch(console.error);
      scheduleImmediateDispatch([ticket.eventId]);
      return { ticket: ticket.created, created: true };
    } catch (err) {
      if (externalMessageId && isUniqueViolation(err, "externalMessageId")) {
        const existing = await prisma.ticket.findUnique({ where: { externalMessageId }, select: ticketSelect });
        if (existing) return { ticket: existing, created: false };
      }
      if (isUniqueViolation(err, "folio") && attempt < 4) continue;
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Comentar
// ---------------------------------------------------------------------------
export type AddCommentInput = {
  contact: Contact;
  ticketId: string;
  body: string;
  externalMessageId?: string;
  apiKeyId: string;
};

export async function addCommentFromWhatsapp(
  input: AddCommentInput
): Promise<{ comment: CommentRow; ticket: TicketRow; created: boolean; statusChanged: boolean }> {
  const { contact, ticketId, body, externalMessageId, apiKeyId } = input;
  const ticket = await requireAccessibleTicket(contact, { id: ticketId });

  const findExisting = () =>
    externalMessageId
      ? prisma.comment.findUnique({ where: { externalMessageId }, select: commentSelect })
      : Promise.resolve(null);

  const existing = await findExisting();
  if (existing) {
    if (existing.ticketId !== ticket.id) {
      throw new IntegrationError(409, "CONFLICT", "external_message_id ya está asociado a otro ticket.");
    }
    return { comment: existing, ticket, created: false, statusChanged: false };
  }

  const now = new Date();
  // Si el ticket esperaba al cliente, su respuesta lo devuelve a "en proceso"
  const reactivate = ticket.status === "PENDING";

  let comment: CommentRow;
  const eventIds: Array<string | null> = [];
  try {
    comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          content: body,
          isInternal: false,
          channel: "WHATSAPP",
          externalMessageId: externalMessageId ?? null,
          ticketId: ticket.id,
          authorId: contact.id,
        },
        select: commentSelect,
      });
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { lastCustomerActivityAt: now, ...(reactivate ? { status: "IN_PROGRESS" } : {}) },
      });
      if (reactivate) {
        await tx.ticketActivity.create({
          data: {
            type: "STATUS_CHANGE",
            field: "status",
            oldValue: "PENDING",
            newValue: "IN_PROGRESS",
            ticketId: ticket.id,
            actorId: contact.id,
          },
        });
        await tx.auditLog.create({
          data: {
            action: "UPDATE",
            entityType: "Ticket",
            entityId: ticket.id,
            description: `Estatus de ${ticket.folio} cambiado a IN_PROGRESS por respuesta del cliente vía WhatsApp`,
            actorId: contact.id,
            metadataJson: auditMeta(apiKeyId, { from: "PENDING", to: "IN_PROGRESS", commentId: created.id }),
          },
        });
        eventIds.push(
          await enqueueTicketEvent(tx, {
            eventType: "ticket.status_changed",
            ticket: { ...ticket, status: "IN_PROGRESS" },
            previousStatus: "PENDING",
            actor: { id: contact.id, name: contact.name, channel: "WHATSAPP" },
          })
        );
      }
      // Solo emite si el autor no es el solicitante (p. ej. un CLIENT_ADMIN por WhatsApp)
      eventIds.push(
        await enqueueTicketEvent(tx, {
          eventType: "ticket.comment_added",
          ticket: { ...ticket, status: reactivate ? "IN_PROGRESS" : ticket.status },
          comment: {
            id: created.id,
            content: created.content,
            isInternal: created.isInternal,
            channel: created.channel,
            author: { id: contact.id, name: contact.name },
          },
          actor: { id: contact.id, name: contact.name, channel: "WHATSAPP" },
        })
      );
      return created;
    });
  } catch (err) {
    if (externalMessageId && isUniqueViolation(err, "externalMessageId")) {
      const dup = await findExisting();
      if (dup) return { comment: dup, ticket, created: false, statusChanged: false };
    }
    throw err;
  }
  scheduleImmediateDispatch(eventIds);

  const ticketBasic = {
    id: ticket.id,
    folio: ticket.folio,
    title: ticket.title,
    status: reactivate ? "IN_PROGRESS" : ticket.status,
    priority: ticket.priority,
  };
  // Correos: igual que addComment (el autor es el solicitante; no se le avisa a él)
  notifyNewComment(
    ticketBasic,
    contact.id,
    body,
    ticket.requester.email,
    ticket.requester.name,
    ticket.requester.id,
    ticket.assignee?.email,
    ticket.assignee?.name,
    ticket.assignee?.id
  ).catch(console.error);
  const notified = new Set([ticket.requester.id, ticket.assignee?.id, contact.id].filter(Boolean) as string[]);
  notifyCollaboratorsNewComment(
    ticketBasic,
    body,
    ticket.collaborators.map((c) => c.user).filter((u) => !notified.has(u.id))
  ).catch(console.error);

  return { comment, ticket, created: true, statusChanged: reactivate };
}

// ---------------------------------------------------------------------------
// Cerrar / reabrir
// ---------------------------------------------------------------------------
async function lastStatusChangeAt(ticketId: string): Promise<Date | null> {
  const row = await prisma.ticketActivity.findFirst({
    where: { ticketId, type: "STATUS_CHANGE", newValue: { in: ["RESOLVED", "CLOSED"] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

export type ChangeStatusInput = {
  contact: Contact;
  ticketId: string;
  action: CustomerStatusAction;
  apiKeyId: string;
};

export async function changeStatusFromWhatsapp(
  input: ChangeStatusInput
): Promise<{ ticket: TicketRow; previousStatus: TicketStatus }> {
  const { contact, ticketId, action, apiKeyId } = input;
  const ticket = await requireAccessibleTicket(contact, { id: ticketId });
  const previousStatus = ticket.status;

  let next: TicketStatus;
  if (action === "close") {
    if (!OPEN_STATUSES.includes(ticket.status)) {
      throw integrationErrors.invalidTransition("El ticket ya está cerrado.");
    }
    next = "CLOSED";
  } else {
    if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") {
      throw integrationErrors.invalidTransition("Solo se pueden reabrir tickets resueltos o cerrados.");
    }
    const { ticketReopenMaxDays } = getIntegrationConfig();
    const closedAt = (await lastStatusChangeAt(ticket.id)) ?? ticket.updatedAt;
    if (Date.now() - closedAt.getTime() > ticketReopenMaxDays * 86_400_000) {
      throw integrationErrors.invalidTransition(
        `El ticket se cerró hace más de ${ticketReopenMaxDays} días y ya no puede reabrirse. Crea un ticket nuevo.`
      );
    }
    next = ticket.assigneeId ? "IN_PROGRESS" : "OPEN";
  }

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: next, lastCustomerActivityAt: new Date() },
      select: ticketSelect,
    });
    await tx.ticketActivity.create({
      data: {
        type: "STATUS_CHANGE",
        field: "status",
        oldValue: previousStatus,
        newValue: next,
        ticketId: ticket.id,
        actorId: contact.id,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Ticket",
        entityId: ticket.id,
        description: `Estatus de ${ticket.folio} cambiado a ${next} por el cliente vía WhatsApp (${action})`,
        actorId: contact.id,
        metadataJson: auditMeta(apiKeyId, { from: previousStatus, to: next, action }),
      },
    });
    const eventId = await enqueueTicketEvent(tx, {
      eventType: "ticket.status_changed",
      ticket: t,
      previousStatus,
      actor: { id: contact.id, name: contact.name, channel: "WHATSAPP" },
    });
    return { t, eventId };
  }).then((r) => {
    scheduleImmediateDispatch([r.eventId]);
    return r.t;
  });

  const ticketBasic = { id: updated.id, folio: updated.folio, title: updated.title, status: next, priority: updated.priority };
  notifyStatusChanged(
    ticketBasic,
    previousStatus,
    updated.requester.email,
    updated.requester.name,
    updated.assignee?.email,
    updated.assignee?.name
  ).catch(console.error);
  const notified = new Set([updated.requester.id, updated.assignee?.id, contact.id].filter(Boolean) as string[]);
  notifyCollaboratorsStatusChanged(
    ticketBasic,
    previousStatus,
    updated.collaborators.map((c) => c.user).filter((u) => !notified.has(u.id))
  ).catch(console.error);

  return { ticket: updated, previousStatus };
}

// ---------------------------------------------------------------------------
// Adjuntos
// ---------------------------------------------------------------------------
export type IncomingFile = { buffer: Buffer; filename: string; mimeType: string };

export type AddAttachmentInput = {
  contact: Contact;
  ticketId: string;
  file: IncomingFile;
  externalMediaId?: string;
  apiKeyId: string;
};

export function assertAttachmentAllowed(file: { size: number; mimeType: string }) {
  const { attachmentMaxMb } = getIntegrationConfig();
  const mime = file.mimeType.split(";")[0].trim().toLowerCase();
  if (!WHATSAPP_ALLOWED_ATTACHMENT_TYPES.includes(mime)) {
    throw new IntegrationError(415, "UNSUPPORTED_MEDIA_TYPE", `Tipo de archivo no permitido: ${mime || "desconocido"}.`);
  }
  if (file.size === 0) throw integrationErrors.validation("El archivo está vacío.", { field: "file" });
  if (file.size > attachmentMaxMb * 1024 * 1024) {
    throw new IntegrationError(413, "PAYLOAD_TOO_LARGE", `El archivo excede el límite de ${attachmentMaxMb} MB.`);
  }
  return mime;
}

export async function addAttachmentFromWhatsapp(
  input: AddAttachmentInput
): Promise<{ attachment: AttachmentRow; created: boolean }> {
  const { contact, ticketId, file, externalMediaId, apiKeyId } = input;
  const ticket = await requireAccessibleTicket(contact, { id: ticketId });

  if (externalMediaId) {
    const existing = await prisma.attachment.findFirst({
      where: { ticketId: ticket.id, externalMediaId },
      select: attachmentSelect,
    });
    if (existing) return { attachment: existing, created: false };
  }

  const mime = assertAttachmentAllowed({ size: file.buffer.length, mimeType: file.mimeType });
  const storedName = await saveAttachmentFile(file.buffer, file.filename);

  const attachment = await prisma.$transaction(async (tx) => {
    const created = await tx.attachment.create({
      data: {
        filename: file.filename,
        storedName,
        mimeType: mime,
        size: file.buffer.length,
        source: "WHATSAPP",
        externalMediaId: externalMediaId ?? null,
        ticketId: ticket.id,
        uploadedById: contact.id,
      },
      select: attachmentSelect,
    });
    await tx.ticket.update({ where: { id: ticket.id }, data: { lastCustomerActivityAt: new Date() } });
    await tx.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "Attachment",
        entityId: created.id,
        description: `Adjunto "${file.filename}" agregado a ${ticket.folio} vía WhatsApp`,
        actorId: contact.id,
        metadataJson: auditMeta(apiKeyId, { ticketId: ticket.id, mimeType: mime, size: file.buffer.length, externalMediaId }),
      },
    });
    return created;
  });

  return { attachment, created: true };
}

// ---------------------------------------------------------------------------
// Descarga de media por URL (alternativa al multipart)
// ---------------------------------------------------------------------------
const MEDIA_FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "text/plain": "txt",
};

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "[::1]") return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function assertSafeMediaUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw integrationErrors.validation("media_url no es una URL válida.", { field: "media_url" });
  }
  if (url.protocol !== "https:") {
    throw integrationErrors.validation("media_url debe usar https.", { field: "media_url" });
  }
  if (isPrivateHost(url.hostname)) {
    throw integrationErrors.validation("media_url apunta a una dirección no permitida.", { field: "media_url" });
  }
  return url;
}

/**
 * Descarga el archivo respetando ATTACHMENT_MAX_MB, con timeout y sin seguir
 * redirecciones a hosts privados. mimeType/filename explícitos tienen prioridad.
 */
export async function fetchMediaFromUrl(
  mediaUrl: string,
  hints: { mimeType?: string; filename?: string } = {}
): Promise<IncomingFile> {
  const { attachmentMaxMb } = getIntegrationConfig();
  const maxBytes = attachmentMaxMb * 1024 * 1024;

  let url = assertSafeMediaUrl(mediaUrl);
  let response: Response | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MEDIA_FETCH_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(url, { redirect: "manual", signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || hop === MAX_REDIRECTS) {
          throw integrationErrors.validation("No se pudo descargar media_url (demasiadas redirecciones).");
        }
        url = assertSafeMediaUrl(new URL(location, url).toString());
        continue;
      }
      break;
    }
    if (!response || !response.ok) {
      throw integrationErrors.validation(`No se pudo descargar media_url (HTTP ${response?.status ?? "sin respuesta"}).`, {
        field: "media_url",
      });
    }

    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > maxBytes) {
      throw new IntegrationError(413, "PAYLOAD_TOO_LARGE", `El archivo excede el límite de ${attachmentMaxMb} MB.`);
    }

    const chunks: Buffer[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (!reader) throw integrationErrors.validation("media_url devolvió un cuerpo vacío.", { field: "media_url" });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new IntegrationError(413, "PAYLOAD_TOO_LARGE", `El archivo excede el límite de ${attachmentMaxMb} MB.`);
      }
      chunks.push(Buffer.from(value));
    }

    const mimeType = (hints.mimeType ?? response.headers.get("content-type") ?? "application/octet-stream")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const fromPath = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const filename =
      hints.filename ??
      (fromPath && fromPath.includes(".") ? fromPath : `whatsapp-media.${MIME_EXTENSIONS[mimeType] ?? "bin"}`);

    return { buffer: Buffer.concat(chunks), filename, mimeType };
  } catch (err) {
    if (err instanceof IntegrationError) throw err;
    if ((err as Error).name === "AbortError") {
      throw integrationErrors.validation("Tiempo de espera agotado al descargar media_url.", { field: "media_url" });
    }
    throw integrationErrors.validation(`No se pudo descargar media_url: ${(err as Error).message}`, { field: "media_url" });
  } finally {
    clearTimeout(timer);
  }
}
