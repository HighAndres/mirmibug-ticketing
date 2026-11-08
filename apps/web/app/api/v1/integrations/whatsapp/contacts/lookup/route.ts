/**
 * GET /api/v1/integrations/whatsapp/contacts/lookup?phone=
 * Scope: contacts:read
 *
 * Busca el contacto por teléfono normalizado. Es el único endpoint que
 * responde para contactos no verificados (n8n necesita saberlo para decidir
 * qué contestar). 404 si no existe o está inactivo.
 */
import { findContactByPhone, serializeContact } from "@/lib/integrations/contacts";
import { integrationErrors, jsonResponse } from "@/lib/integrations/http";
import { integrationRoute } from "@/lib/integrations/route";
import { requireString } from "@/lib/integrations/validation";

export const GET = integrationRoute("contacts:read", async ({ url }) => {
  const phone = requireString(url.searchParams, "phone");
  const contact = await findContactByPhone(phone);
  if (!contact || !contact.isActive) {
    throw integrationErrors.notFound("No hay un contacto con ese número de WhatsApp.");
  }
  return jsonResponse({
    contact: serializeContact(contact),
    client: contact.client,
    verified: contact.whatsappVerifiedAt !== null,
    opt_in: contact.whatsappOptIn,
  });
});
