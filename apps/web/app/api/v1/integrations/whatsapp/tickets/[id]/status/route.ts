/**
 * POST /api/v1/integrations/whatsapp/tickets/{id}/status
 * Scope: tickets:write
 *
 * Body: { phone, action: "close" | "reopen" }
 * Solo las acciones del cliente. close → CLOSED desde cualquier estado
 * abierto. reopen → OPEN/IN_PROGRESS si se cerró hace menos de
 * TICKET_REOPEN_MAX_DAYS. Transición inválida → 409 INVALID_TRANSITION.
 */
import { requireVerifiedContact } from "@/lib/integrations/contacts";
import { jsonResponse } from "@/lib/integrations/http";
import { integrationRoute } from "@/lib/integrations/route";
import { readJsonBody, requireEnum, requireString } from "@/lib/integrations/validation";
import {
  changeStatusFromWhatsapp,
  CUSTOMER_STATUS_ACTIONS,
  serializeTicket,
} from "@/lib/integrations/whatsapp-tickets";

export const POST = integrationRoute<{ id: string }>("tickets:write", async ({ req, params, apiKey }) => {
  const body = await readJsonBody(req);
  const phone = requireString(body, "phone");
  const action = requireEnum(body, "action", CUSTOMER_STATUS_ACTIONS);

  const contact = await requireVerifiedContact(phone);
  const { ticket, previousStatus } = await changeStatusFromWhatsapp({
    contact,
    ticketId: params.id,
    action,
    apiKeyId: apiKey.id,
  });

  return jsonResponse({ action, previous_status: previousStatus, ticket: serializeTicket(ticket) });
});
