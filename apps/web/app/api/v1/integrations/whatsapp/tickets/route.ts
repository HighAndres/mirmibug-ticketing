/**
 * POST /api/v1/integrations/whatsapp/tickets
 * Scope: tickets:write
 *
 * Body: { phone, title, description, external_message_id?, category_id?, priority? }
 * Crea un ticket a nombre del contacto. Idempotente por external_message_id:
 * si ya existe, 200 con el mismo ticket; si se crea, 201.
 */
import { enforcePhoneRateLimit } from "@/lib/integrations/auth";
import { requireVerifiedContact } from "@/lib/integrations/contacts";
import { jsonResponse } from "@/lib/integrations/http";
import { integrationRoute } from "@/lib/integrations/route";
import { optionalEnum, optionalString, readJsonBody, requireString } from "@/lib/integrations/validation";
import { createTicketFromWhatsapp, PRIORITIES, serializeTicket } from "@/lib/integrations/whatsapp-tickets";

export const POST = integrationRoute("tickets:write", async ({ req, apiKey }) => {
  const body = await readJsonBody(req);
  const phone = requireString(body, "phone");
  const title = requireString(body, "title", { max: 200 });
  const description = requireString(body, "description", { max: 5000 });
  const externalMessageId = optionalString(body, "external_message_id", { max: 128 });
  const categoryId = optionalString(body, "category_id");
  const priority = optionalEnum(body, "priority", PRIORITIES);

  const contact = await requireVerifiedContact(phone);
  const limited = enforcePhoneRateLimit(contact.whatsappPhone ?? phone);
  if (limited) return limited;

  const { ticket, created } = await createTicketFromWhatsapp({
    contact,
    title,
    description,
    externalMessageId,
    categoryId,
    priority,
    apiKeyId: apiKey.id,
  });

  return jsonResponse({ created, ticket: serializeTicket(ticket) }, { status: created ? 201 : 200 });
});
