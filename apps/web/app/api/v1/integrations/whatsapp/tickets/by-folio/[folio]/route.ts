/**
 * GET /api/v1/integrations/whatsapp/tickets/by-folio/{folio}?phone=
 * Scope: tickets:read
 *
 * Resumen de estatus. `phone` es obligatorio: el ticket debe ser visible
 * para ese contacto; si no, 404 (no se revela que existe).
 */
import { requireVerifiedContact } from "@/lib/integrations/contacts";
import { jsonResponse } from "@/lib/integrations/http";
import { integrationRoute } from "@/lib/integrations/route";
import { requireString } from "@/lib/integrations/validation";
import {
  publicCommentSummary,
  requireAccessibleTicket,
  serializeTicket,
} from "@/lib/integrations/whatsapp-tickets";

export const GET = integrationRoute<{ folio: string }>("tickets:read", async ({ url, params }) => {
  const phone = requireString(url.searchParams, "phone");
  const contact = await requireVerifiedContact(phone);

  const folio = decodeURIComponent(params.folio).trim().toUpperCase();
  const ticket = await requireAccessibleTicket(contact, { folio });
  const comments = await publicCommentSummary(ticket.id);

  return jsonResponse({ ticket: serializeTicket(ticket), ...comments });
});
