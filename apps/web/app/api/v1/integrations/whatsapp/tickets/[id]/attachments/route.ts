/**
 * POST /api/v1/integrations/whatsapp/tickets/{id}/attachments
 * Scope: tickets:write
 *
 * Dos formas:
 *  - multipart/form-data: phone, file, external_media_id?
 *  - application/json: { phone, media_url, mime_type?, filename?, external_media_id? }
 *    (el servidor descarga media_url; debe ser https y pública)
 *
 * Valida tipo (lista de WhatsApp) y tamaño (ATTACHMENT_MAX_MB). Idempotente
 * por external_media_id dentro del mismo ticket.
 */
import { enforcePhoneRateLimit } from "@/lib/integrations/auth";
import { requireVerifiedContact } from "@/lib/integrations/contacts";
import { integrationErrors, jsonResponse } from "@/lib/integrations/http";
import { integrationRoute } from "@/lib/integrations/route";
import { optionalString, readJsonBody, requireString, type JsonObject } from "@/lib/integrations/validation";
import {
  addAttachmentFromWhatsapp,
  fetchMediaFromUrl,
  serializeAttachment,
  type IncomingFile,
} from "@/lib/integrations/whatsapp-tickets";

async function readMultipart(req: Request): Promise<{ fields: JsonObject; file: IncomingFile | null }> {
  const form = await req.formData();
  const fields: JsonObject = {};
  let file: IncomingFile | null = null;
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
    } else if (key === "file" && value.size > 0) {
      file = {
        buffer: Buffer.from(await value.arrayBuffer()),
        filename: value.name || "archivo",
        mimeType: value.type || "application/octet-stream",
      };
    }
  }
  return { fields, file };
}

export const POST = integrationRoute<{ id: string }>("tickets:write", async ({ req, params, apiKey }) => {
  const contentType = req.headers.get("content-type") ?? "";
  let fields: JsonObject;
  let file: IncomingFile | null = null;

  if (contentType.includes("multipart/form-data")) {
    ({ fields, file } = await readMultipart(req));
    if (!file) throw integrationErrors.validation('Falta el archivo en el campo "file".', { field: "file" });
  } else {
    fields = await readJsonBody(req);
  }

  const phone = requireString(fields, "phone");
  const externalMediaId = optionalString(fields, "external_media_id", { max: 128 });

  const contact = await requireVerifiedContact(phone);
  const limited = enforcePhoneRateLimit(contact.whatsappPhone ?? phone);
  if (limited) return limited;

  if (!file) {
    const mediaUrl = requireString(fields, "media_url");
    file = await fetchMediaFromUrl(mediaUrl, {
      mimeType: optionalString(fields, "mime_type"),
      filename: optionalString(fields, "filename", { max: 255 }),
    });
  }

  const { attachment, created } = await addAttachmentFromWhatsapp({
    contact,
    ticketId: params.id,
    file,
    externalMediaId,
    apiKeyId: apiKey.id,
  });

  return jsonResponse({ created, attachment: serializeAttachment(attachment) }, { status: created ? 201 : 200 });
});
