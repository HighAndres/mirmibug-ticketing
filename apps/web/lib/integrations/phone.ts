/**
 * Normalización de teléfonos a E.164 (+52XXXXXXXXXX).
 *
 * Única función que debe usarse para teléfonos en formularios, API y búsquedas:
 * así `User.whatsappPhone` y `WhatsappConversation.phone` siempre comparan igual.
 *
 * Caso México: WhatsApp manda los números como 5215512345678 (con el "1" de
 * móvil anterior a 2019). Se normaliza a +525512345678 (10 dígitos tras el 52).
 */
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

export const DEFAULT_PHONE_REGION: CountryCode = "MX";

export class PhoneValidationError extends Error {
  readonly code = "INVALID_PHONE" as const;
  readonly input: string;

  constructor(message: string, input: string) {
    super(message);
    this.name = "PhoneValidationError";
    this.input = input;
  }
}

/** +521 + 10 dígitos → +52 + 10 dígitos (prefijo móvil antiguo de México). */
function stripMexicoMobileOne(candidate: string): string {
  const match = /^\+521(\d{10})$/.exec(candidate);
  return match ? `+52${match[1]}` : candidate;
}

/**
 * Devuelve el número en E.164 o lanza PhoneValidationError.
 * Acepta espacios, guiones, paréntesis, puntos, "+" y el prefijo "00".
 */
export function normalizePhone(raw: string, defaultRegion: CountryCode = DEFAULT_PHONE_REGION): string {
  const input = typeof raw === "string" ? raw : String(raw ?? "");
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PhoneValidationError("El teléfono es obligatorio.", input);
  }

  const hasInternationalPrefix = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/\D/g, "");
  if (hasInternationalPrefix && trimmed.startsWith("00")) digits = digits.slice(2);

  if (digits.length < 7 || digits.length > 15) {
    throw new PhoneValidationError(`Número de teléfono no válido: "${input}".`, input);
  }

  // Con "+" solo cabe la lectura internacional. Sin "+", primero se intenta como
  // nacional de la región por defecto y luego como internacional sin "+"
  // (formato en que WhatsApp entrega el remitente: 5215512345678).
  const candidates = hasInternationalPrefix ? [`+${digits}`] : [digits, `+${digits}`];

  for (const candidate of candidates) {
    const parsed = parsePhoneNumberFromString(stripMexicoMobileOne(candidate), defaultRegion);
    if (parsed?.isValid()) {
      return stripMexicoMobileOne(parsed.number);
    }
  }

  throw new PhoneValidationError(`Número de teléfono no válido: "${input}".`, input);
}

/** Igual que normalizePhone pero devuelve null en vez de lanzar. */
export function tryNormalizePhone(
  raw: string | null | undefined,
  defaultRegion: CountryCode = DEFAULT_PHONE_REGION
): string | null {
  if (raw == null) return null;
  try {
    return normalizePhone(raw, defaultRegion);
  } catch (err) {
    if (err instanceof PhoneValidationError) return null;
    throw err;
  }
}

/** ¿Representan el mismo número? (ambos se normalizan antes de comparar). */
export function isSamePhone(a: string, b: string, defaultRegion: CountryCode = DEFAULT_PHONE_REGION): boolean {
  const na = tryNormalizePhone(a, defaultRegion);
  const nb = tryNormalizePhone(b, defaultRegion);
  return na !== null && na === nb;
}
