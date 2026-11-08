/**
 * POST /api/v1/integrations/whatsapp/tickets/{id}/comments
 * Scope: tickets:write
 *
 * Body: { phone, body, external_message_id? }
 * Agrega un comentario público del cliente. Idempotente por
 * external_message_id (200 con el comentario existente; 201 si se crea).
 * Si el ticket estaba PENDING pasa a IN_PROGRESS.
 */
import { enforcePhoneRateLimit } from "@/lib/integrations/auth";
import { requireVerifiedContact } from "@/lib/integrations/contacts";
import { jsonResponse } from "@/lib/integrations/http";
import { integrationRoute } from "@/lib/integrations/route";
import { optionalString, readJsonBody, requireString } from "@/lib/integrations/validation";
import { addCommentFromWhatsapp, serializeComment } from "@/lib/integrations/whatsapp-tickets";

export const POST = integrationRoute<{ id: string }>("tickets:write", async ({ req, params, apiKey }) => {
  const json = await readJsonBody(req);
  const phone = requireString(json, "phone");
  const body = requireString(json, "body", { max: 5000 });
  const externalMessageId = optionalString(json, "external_message_id", { max: 128 });

  const contact = await requireVerifiedContact(phone);
  const limited = enforcePhoneRateLimit(contact.whatsappPhone ?? phone);
  if (limited) return limited;

  const { comment, ticket, created, statusChanged } = await addCommentFromWhatsapp({
    contact,
    ticketId: params.id,
    body,
    externalMessageId,
    apiKeyId: apiKey.id,
  });

  return jsonResponse(
    {
      created,
      comment: serializeComment(comment),
      ticket_status: statusChanged ? "IN_PROGRESS" : ticket.status,
      status_changed: statusChanged,
    },
    { status: created ? 201 : 200 }
  );
});
