/**
 * Respuestas JSON estándar de la API de integración.
 *
 * Errores siempre con la forma { "error": { "code": "...", "message": "..." } }
 * para que n8n pueda enrutar por `code` sin parsear el mensaje.
 */
import { NextResponse } from "next/server";

export type IntegrationErrorCode =
  | "UNAUTHORIZED" // falta la API key, no existe o está revocada
  | "FORBIDDEN_SCOPE" // la key no tiene el scope requerido
  | "CONTACT_NOT_VERIFIED" // el contacto existe pero no tiene whatsappVerifiedAt
  | "NOT_FOUND" // recurso inexistente o fuera del alcance del teléfono (nunca 403)
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "INVALID_TRANSITION" // cambio de estado no permitido desde WhatsApp
  | "CONFLICT" // external_message_id ya usado en otro recurso
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INTERNAL_ERROR";

export type IntegrationErrorBody = {
  error: { code: IntegrationErrorCode; message: string; details?: unknown };
};

export function errorResponse(
  status: number,
  code: IntegrationErrorCode,
  message: string,
  options: { details?: unknown; headers?: Record<string, string> } = {}
): NextResponse<IntegrationErrorBody> {
  const body: IntegrationErrorBody = { error: { code, message } };
  if (options.details !== undefined) body.error.details = options.details;
  return NextResponse.json(body, { status, headers: options.headers });
}

export function jsonResponse<T>(data: T, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(data, { status: init.status ?? 200, headers: init.headers });
}

/**
 * Error de negocio que los servicios lanzan y el wrapper de rutas
 * (lib/integrations/route.ts) convierte en la respuesta JSON estándar.
 */
export class IntegrationError extends Error {
  readonly status: number;
  readonly code: IntegrationErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: IntegrationErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "IntegrationError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toResponse(): NextResponse<IntegrationErrorBody> {
    return errorResponse(this.status, this.code, this.message, { details: this.details });
  }
}

/** Atajos para los errores más comunes. */
export const integrationErrors = {
  notFound: (message = "Recurso no encontrado.") => new IntegrationError(404, "NOT_FOUND", message),
  validation: (message: string, details?: unknown) =>
    new IntegrationError(400, "VALIDATION_ERROR", message, details),
  contactNotVerified: () =>
    new IntegrationError(
      403,
      "CONTACT_NOT_VERIFIED",
      "El número de WhatsApp del contacto aún no ha sido verificado por un administrador."
    ),
  invalidTransition: (message: string) => new IntegrationError(409, "INVALID_TRANSITION", message),
};
