/**
 * GET /api/v1/integrations/whatsapp/contacts/{id}/tickets?status=open|closed|all
 * Scope: tickets:read
 *
 * Tickets visibles para el contacto con las reglas de su rol (propios para
 * CLIENT_USER, de su empresa para admin/supervisor). Máximo 10, más las
 * filas listas para una lista interactiva de WhatsApp.
 */
import { assertContactUsable, findContactById } from "@/lib/integrations/contacts";
import { jsonResponse } from "@/lib/integrations/http";
import { integrationRoute } from "@/lib/integrations/route";
import { optionalEnum } from "@/lib/integrations/validation";
import {
  listTicketsForContact,
  serializeTicket,
  TICKET_LIST_FILTERS,
  whatsappListRows,
} from "@/lib/integrations/whatsapp-tickets";

export const GET = integrationRoute<{ id: string }>("tickets:read", async ({ url, params }) => {
  const contact = await findContactById(params.id);
  assertContactUsable(contact);

  const filter = optionalEnum(url.searchParams, "status", TICKET_LIST_FILTERS) ?? "open";
  const tickets = await listTicketsForContact(contact, filter, 10);

  return jsonResponse({
    contact_id: contact.id,
    filter,
    count: tickets.length,
    tickets: tickets.map(serializeTicket),
    whatsapp_rows: whatsappListRows(tickets),
  });
});
