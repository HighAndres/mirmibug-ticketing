/**
 * Estado de la conversación de WhatsApp por número.
 *
 * La máquina de estados la ejecuta n8n; aquí solo se persiste y se calcula
 * la ventana de 24 h de Meta a partir de lastInboundAt.
 */
import type { ConversationState, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getIntegrationConfig } from "./config";
import { findContactByPhone, type Contact } from "./contacts";
import { integrationErrors } from "./http";
import { normalizePhone } from "./phone";
import {
  parseConversationContext,
  serializeConversationContext,
  type ConversationContext,
} from "./types";
import { requireAccessibleTicket, serializeTicket } from "./whatsapp-tickets";

export const CONVERSATION_STATES: ConversationState[] = [
  "IDLE",
  "CHOOSING_TICKET",
  "CREATING_TICKET",
  "AWAITING_CONFIRMATION",
];

const conversationSelect = {
  id: true,
  phone: true,
  state: true,
  contextJson: true,
  lastInboundAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  activeTicketId: true,
} satisfies Prisma.WhatsappConversationSelect;

export type ConversationRow = Prisma.WhatsappConversationGetPayload<{ select: typeof conversationSelect }>;

/** ¿Hubo un mensaje entrante del cliente en las últimas 24 h? */
export function isWithin24hWindow(lastInboundAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const { whatsappWindowHours } = getIntegrationConfig();
  return now.getTime() - lastInboundAt.getTime() < whatsappWindowHours * 3_600_000;
}

export async function getConversation(rawPhone: string): Promise<ConversationRow | null> {
  const phone = normalizePhone(rawPhone);
  return prisma.whatsappConversation.findUnique({ where: { phone }, select: conversationSelect });
}

export type ConversationUpdate = {
  state?: ConversationState;
  /** null = quitar el ticket activo; undefined = no tocar */
  activeTicketId?: string | null;
  /** Reemplaza el contexto completo (null = vaciar) */
  context?: ConversationContext | null;
  lastInboundAt?: Date;
  expiresAt?: Date | null;
};

export async function upsertConversation(rawPhone: string, update: ConversationUpdate): Promise<ConversationRow> {
  const phone = normalizePhone(rawPhone);
  const contact = await findContactByPhone(phone);

  if (update.activeTicketId) {
    // El ticket activo debe existir y ser visible para el contacto del número.
    if (!contact) throw integrationErrors.notFound("Ticket no encontrado.");
    await requireAccessibleTicket(contact, { id: update.activeTicketId });
  }

  const data: Prisma.WhatsappConversationUncheckedUpdateInput = {
    userId: contact?.id ?? null,
  };
  if (update.state !== undefined) data.state = update.state;
  if (update.activeTicketId !== undefined) data.activeTicketId = update.activeTicketId;
  if (update.context !== undefined) data.contextJson = update.context ? serializeConversationContext(update.context) : null;
  if (update.lastInboundAt !== undefined) data.lastInboundAt = update.lastInboundAt;
  if (update.expiresAt !== undefined) data.expiresAt = update.expiresAt;

  return prisma.whatsappConversation.upsert({
    where: { phone },
    create: {
      phone,
      userId: contact?.id ?? null,
      state: update.state ?? "IDLE",
      activeTicketId: update.activeTicketId ?? null,
      contextJson: update.context ? serializeConversationContext(update.context) : null,
      lastInboundAt: update.lastInboundAt ?? null,
      expiresAt: update.expiresAt ?? null,
    },
    update: data,
    select: conversationSelect,
  });
}

export async function serializeConversation(
  phone: string,
  row: ConversationRow | null,
  contact: Contact | null,
  now: Date = new Date()
) {
  let activeTicket = null;
  if (row?.activeTicketId && contact) {
    try {
      activeTicket = serializeTicket(await requireAccessibleTicket(contact, { id: row.activeTicketId }));
    } catch {
      activeTicket = null; // el ticket dejó de ser visible; n8n debe limpiar el estado
    }
  }
  return {
    phone,
    exists: row !== null,
    state: row?.state ?? "IDLE",
    context: parseConversationContext(row?.contextJson),
    active_ticket_id: row?.activeTicketId ?? null,
    active_ticket: activeTicket,
    contact_id: row?.userId ?? contact?.id ?? null,
    last_inbound_at: row?.lastInboundAt?.toISOString() ?? null,
    within_24h_window: isWithin24hWindow(row?.lastInboundAt, now),
    expires_at: row?.expiresAt?.toISOString() ?? null,
    updated_at: row?.updatedAt.toISOString() ?? null,
  };
}
