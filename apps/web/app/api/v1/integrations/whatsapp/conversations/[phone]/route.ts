/**
 * GET / PUT /api/v1/integrations/whatsapp/conversations/{phone}
 * Scope: conversations:write
 *
 * GET devuelve siempre 200: si no hay registro, el estado por defecto
 * (exists=false, state=IDLE) para que n8n no tenga que tratar el 404.
 * PUT es parcial: solo cambia lo que viene en el body.
 *   { state?, active_ticket_id? (null para quitar), context?, last_inbound_at?, expires_at? }
 */
import { findContactByPhone } from "@/lib/integrations/contacts";
import {
  CONVERSATION_STATES,
  getConversation,
  serializeConversation,
  upsertConversation,
} from "@/lib/integrations/conversations";
import { jsonResponse } from "@/lib/integrations/http";
import { normalizePhone } from "@/lib/integrations/phone";
import { integrationRoute } from "@/lib/integrations/route";
import type { ConversationContext } from "@/lib/integrations/types";
import {
  nullableString,
  optionalEnum,
  optionalIsoDate,
  optionalObject,
  readJsonBody,
} from "@/lib/integrations/validation";

function phoneFromParams(raw: string): string {
  // El "+" puede venir como %2B o como espacio si el cliente no lo codificó
  return normalizePhone(decodeURIComponent(raw).replace(/^\s/, "+"));
}

export const GET = integrationRoute<{ phone: string }>("conversations:write", async ({ params }) => {
  const phone = phoneFromParams(params.phone);
  const [row, contact] = await Promise.all([getConversation(phone), findContactByPhone(phone)]);
  return jsonResponse(await serializeConversation(phone, row, contact));
});

export const PUT = integrationRoute<{ phone: string }>("conversations:write", async ({ req, params }) => {
  const phone = phoneFromParams(params.phone);
  const body = await readJsonBody(req);

  const row = await upsertConversation(phone, {
    state: optionalEnum(body, "state", CONVERSATION_STATES),
    activeTicketId: nullableString(body, "active_ticket_id"),
    context: "context" in body ? ((optionalObject(body, "context") as ConversationContext | undefined) ?? null) : undefined,
    lastInboundAt: optionalIsoDate(body, "last_inbound_at"),
    expiresAt: "expires_at" in body && body.expires_at === null ? null : optionalIsoDate(body, "expires_at"),
  });

  const contact = await findContactByPhone(phone);
  return jsonResponse(await serializeConversation(phone, row, contact));
});
