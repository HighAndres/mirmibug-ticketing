/**
 * Emisión de eventos salientes (patrón outbox).
 *
 * enqueueTicketEvent() se llama DENTRO de la transacción del cambio de
 * negocio con el cliente de la transacción (`tx`), así el evento solo existe
 * si el cambio se confirmó. El dispatcher (outbox-dispatcher.ts) lo entrega
 * después.
 *
 * Reglas de emisión:
 *  - Flag WHATSAPP_INTEGRATION_ENABLED apagado → no se emite.
 *  - El destinatario es siempre el solicitante del ticket. Sin whatsappPhone o
 *    sin whatsappOptIn → no se emite (la auditoría ya queda en AuditLog y
 *    TicketActivity, el outbox se mantiene limpio).
 *  - ticket.comment_added solo para comentarios públicos cuyo autor NO es el
 *    solicitante (no se notifica al cliente su propio mensaje).
 */
import crypto from "crypto";
import type { Channel, Prisma, PrismaClient, TicketStatus } from "@prisma/client";
import { getIntegrationConfig, isWhatsappIntegrationEnabled } from "./config";
import type { OutboxEventType, OutboxPayload } from "./types";

/** Cliente de transacción o cliente normal: ambos sirven. */
export type OutboxDb = Prisma.TransactionClient | PrismaClient;

export type TicketEventInput = {
  eventType: OutboxEventType;
  ticket: { id: string; folio: string; title: string; status: TicketStatus; requesterId: string };
  previousStatus?: TicketStatus | null;
  comment?: {
    id: string;
    content: string;
    isInternal: boolean;
    channel: Channel;
    author: { id: string; name: string };
  };
  assignee?: { id: string; name: string } | null;
  actor: { id: string; name: string; channel: Channel };
  /** Para tests o relojes inyectados */
  now?: Date;
};

function appUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function isWithinWindow(lastInboundAt: Date | null | undefined, now: Date): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < getIntegrationConfig().whatsappWindowHours * 3_600_000;
}

/**
 * Inserta el evento si aplica. Devuelve el id del evento o null si no se
 * emitió (flag apagado, sin opt-in, comentario interno o del propio cliente).
 */
export async function enqueueTicketEvent(db: OutboxDb, input: TicketEventInput): Promise<string | null> {
  if (!isWhatsappIntegrationEnabled()) return null;

  const { eventType, ticket, comment } = input;
  if (eventType === "ticket.comment_added") {
    if (!comment || comment.isInternal || comment.author.id === ticket.requesterId) return null;
  }

  const requester = await db.user.findUnique({
    where: { id: ticket.requesterId },
    select: { id: true, name: true, whatsappPhone: true, whatsappOptIn: true, isActive: true },
  });
  if (!requester?.whatsappPhone || !requester.whatsappOptIn || !requester.isActive) return null;

  const conversation = await db.whatsappConversation.findUnique({
    where: { phone: requester.whatsappPhone },
    select: { lastInboundAt: true },
  });

  const now = input.now ?? new Date();
  const eventId = crypto.randomUUID();

  const payload: OutboxPayload = {
    event_id: eventId,
    event_type: eventType,
    occurred_at: now.toISOString(),
    ticket: {
      id: ticket.id,
      folio: ticket.folio,
      title: ticket.title,
      status: ticket.status,
      previous_status: input.previousStatus ?? null,
      url: `${appUrl()}/tickets/${ticket.id}`,
    },
    contact: {
      id: requester.id,
      name: requester.name,
      whatsapp_phone: requester.whatsappPhone,
      opt_in: requester.whatsappOptIn,
    },
    actor: {
      id: input.actor.id,
      name: input.actor.name,
      channel: input.actor.channel,
      is_customer: input.actor.id === ticket.requesterId,
    },
    whatsapp: {
      last_inbound_at: conversation?.lastInboundAt?.toISOString() ?? null,
      within_24h_window: isWithinWindow(conversation?.lastInboundAt, now),
    },
  };
  if (comment) {
    payload.comment = { id: comment.id, body: comment.content, author_name: comment.author.name, channel: comment.channel };
  }
  if (input.assignee !== undefined) {
    payload.assignee = input.assignee;
  }

  await db.eventOutbox.create({
    data: {
      id: eventId,
      eventType,
      aggregateId: ticket.id,
      payloadJson: JSON.stringify(payload),
      status: "PENDING",
      nextAttemptAt: now,
    },
  });

  return eventId;
}

/**
 * Programa la entrega inmediata tras la respuesta HTTP (Next `after()`).
 * Fuera de un request de Next (tests, scripts) cae a fire-and-forget, y con
 * OUTBOX_IMMEDIATE_DISPATCH=false no hace nada: el scheduler lo recogerá.
 */
export function scheduleImmediateDispatch(eventIds: Array<string | null | undefined>): void {
  const ids = eventIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ids.length === 0 || !getIntegrationConfig().outboxImmediateDispatch) return;

  const run = async () => {
    const { dispatchEventById } = await import("./outbox-dispatcher");
    for (const id of ids) {
      await dispatchEventById(id).catch((err: unknown) => console.error("[outbox] entrega inmediata falló:", err));
    }
  };

  import("next/server")
    .then(({ after }) => {
      try {
        after(run);
      } catch {
        void run();
      }
    })
    .catch(() => void run());
}
