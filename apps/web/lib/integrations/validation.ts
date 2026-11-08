/**
 * Validación mínima de cuerpos y query strings de la API de integración.
 *
 * El repo valida a mano (sin zod); estos helpers concentran los mensajes y
 * lanzan IntegrationError 400 VALIDATION_ERROR con el campo en `details`.
 * Las claves de la API son snake_case (phone, external_message_id, ...).
 */
import { integrationErrors } from "./http";

export type JsonObject = Record<string, unknown>;

function invalid(field: string, message: string): never {
  throw integrationErrors.validation(message, { field });
}

/** Lee y valida que el body sea un objeto JSON. Body vacío → {}. */
export async function readJsonBody(req: Request): Promise<JsonObject> {
  const text = await req.text();
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw integrationErrors.validation("El cuerpo debe ser JSON válido.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw integrationErrors.validation("El cuerpo debe ser un objeto JSON.");
  }
  return parsed as JsonObject;
}

export function optionalString(
  source: JsonObject | URLSearchParams,
  field: string,
  options: { max?: number } = {}
): string | undefined {
  const raw = source instanceof URLSearchParams ? source.get(field) : source[field];
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") invalid(field, `El campo "${field}" debe ser texto.`);
  const value = raw.trim();
  if (!value) return undefined;
  if (options.max && value.length > options.max) {
    invalid(field, `El campo "${field}" no puede exceder ${options.max} caracteres.`);
  }
  return value;
}

export function requireString(
  source: JsonObject | URLSearchParams,
  field: string,
  options: { max?: number } = {}
): string {
  const value = optionalString(source, field, options);
  if (value === undefined) invalid(field, `El campo "${field}" es obligatorio.`);
  return value;
}

export function optionalEnum<T extends string>(
  source: JsonObject | URLSearchParams,
  field: string,
  values: readonly T[]
): T | undefined {
  const value = optionalString(source, field);
  if (value === undefined) return undefined;
  if (!(values as readonly string[]).includes(value)) {
    invalid(field, `El campo "${field}" debe ser uno de: ${values.join(", ")}.`);
  }
  return value as T;
}

export function requireEnum<T extends string>(
  source: JsonObject | URLSearchParams,
  field: string,
  values: readonly T[]
): T {
  const value = optionalEnum(source, field, values);
  if (value === undefined) invalid(field, `El campo "${field}" es obligatorio (${values.join(", ")}).`);
  return value;
}

export function optionalIsoDate(source: JsonObject, field: string): Date | undefined {
  const value = optionalString(source, field);
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) invalid(field, `El campo "${field}" debe ser una fecha ISO 8601.`);
  return date;
}

/** Objeto JSON opcional (p. ej. `context` de la conversación). */
export function optionalObject(source: JsonObject, field: string): JsonObject | undefined {
  const raw = source[field];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) invalid(field, `El campo "${field}" debe ser un objeto.`);
  return raw as JsonObject;
}

/** null explícito distingue "borrar" de "no tocar" (PUT parcial). */
export function nullableString(source: JsonObject, field: string): string | null | undefined {
  if (!(field in source)) return undefined;
  if (source[field] === null) return null;
  return requireString(source, field);
}
