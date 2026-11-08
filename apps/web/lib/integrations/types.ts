/**
 * Tipos y parsers de los campos JSON de la integración WhatsApp / n8n.
 *
 * SQLite no tiene JSON nativo, así que IntegrationApiKey.scopesJson,
 * WebhookEndpoint.eventTypesJson, WhatsappConversation.contextJson y
 * EventOutbox.payloadJson guardan JSON serializado. Estos helpers son el
 * único punto de (de)serialización: nunca hacer JSON.parse a mano fuera de aquí.
 */

import type { Channel, ConversationState, OutboxStatus, TicketStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Scopes de las API keys
// ---------------------------------------------------------------------------
export const INTEGRATION_SCOPES = [
  "contacts:read",
  "tickets:read",
  "tickets:write",
  "conversations:write",
] as const;

export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

export function isIntegrationScope(value: unknown): value is IntegrationScope {
  return typeof value === "string" && (INTEGRATION_SCOPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Eventos salientes
// ---------------------------------------------------------------------------
export const OUTBOX_EVENT_TYPES = [
  "ticket.created",
  "ticket.status_changed",
  "ticket.comment_added",
  "ticket.assigned",
] as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];

export function isOutboxEventType(value: unknown): value is OutboxEventType {
  return typeof value === "string" && (OUTBOX_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Payload estándar que recibe n8n. `within24hWindow` le dice si puede mandar
 * texto libre o debe usar una plantilla aprobada por Meta.
 */
export type OutboxPayload = {
  event_id: string;
  event_type: OutboxEventType;
  occurred_at: string; // ISO 8601 UTC
  ticket: {
    id: string;
    folio: string;
    title: string;
    status: TicketStatus;
    previous_status?: TicketStatus | null;
    url: string;
  };
  contact: {
    id: string;
    name: string;
    whatsapp_phone: string;
    opt_in: boolean;
  };
  comment?: {
    id: string;
    body: string;
    author_name: string;
    channel: Channel;
  };
  assignee?: {
    id: string;
    name: string;
  } | null;
  /** Quién provocó el evento; `is_customer` permite a n8n no hacer eco al cliente. */
  actor: {
    id: string;
    name: string;
    channel: Channel;
    is_customer: boolean;
  };
  whatsapp: {
    last_inbound_at: string | null;
    within_24h_window: boolean;
  };
};

// ---------------------------------------------------------------------------
// Contexto de la conversación (datos temporales del flujo de n8n)
// ---------------------------------------------------------------------------
export type ConversationContext = {
  /** Borrador del ticket mientras el cliente lo dicta por WhatsApp. */
  draftTitle?: string;
  draftDescription?: string;
  /** Ids de tickets mostrados en la última lista interactiva, en orden. */
  offeredTicketIds?: string[];
  /** Acción pendiente de confirmación ("close", "reopen", "create"). */
  pendingAction?: string;
  /** Campo libre para que n8n guarde lo que necesite. */
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Parsers seguros (nunca lanzan; devuelven el valor neutro ante JSON corrupto)
// ---------------------------------------------------------------------------
function safeParse(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseStringArray(raw: string | null | undefined): string[] {
  const value = safeParse(raw);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function parseScopes(raw: string | null | undefined): IntegrationScope[] {
  return parseStringArray(raw).filter(isIntegrationScope);
}

export function serializeScopes(scopes: readonly IntegrationScope[]): string {
  return JSON.stringify(Array.from(new Set(scopes)));
}

export function parseEventTypes(raw: string | null | undefined): OutboxEventType[] {
  return parseStringArray(raw).filter(isOutboxEventType);
}

export function serializeEventTypes(types: readonly OutboxEventType[]): string {
  return JSON.stringify(Array.from(new Set(types)));
}

export function parseConversationContext(raw: string | null | undefined): ConversationContext {
  const value = safeParse(raw);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ConversationContext)
    : {};
}

export function serializeConversationContext(ctx: ConversationContext): string {
  return JSON.stringify(ctx);
}

export function parseOutboxPayload(raw: string): OutboxPayload | null {
  const value = safeParse(raw);
  if (!value || typeof value !== "object") return null;
  const p = value as Partial<OutboxPayload>;
  if (!isOutboxEventType(p.event_type) || !p.ticket || !p.contact) return null;
  return value as OutboxPayload;
}

// Re-export de enums de Prisma para que el resto del código importe desde aquí
export type { Channel, ConversationState, OutboxStatus };
