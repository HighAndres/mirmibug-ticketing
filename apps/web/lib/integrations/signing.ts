/**
 * Firma HMAC-SHA256 de los webhooks salientes (ticketing → n8n).
 *
 * La firma se calcula sobre `${timestamp}.${body}` para que un atacante no
 * pueda reenviar un payload capturado fuera de la ventana de tolerancia.
 *
 * Headers salientes:
 *   X-Mirmibug-Signature: sha256=<hex>
 *   X-Mirmibug-Timestamp: <unix seconds>
 *   X-Mirmibug-Event-Id:  <uuid del EventOutbox>
 *
 * verifyWebhookSignature() es la referencia para validar en n8n (nodo Code).
 */
import crypto from "crypto";

export const SIGNATURE_HEADER = "X-Mirmibug-Signature";
export const TIMESTAMP_HEADER = "X-Mirmibug-Timestamp";
export const EVENT_ID_HEADER = "X-Mirmibug-Event-Id";
export const SIGNATURE_PREFIX = "sha256=";
export const DEFAULT_TOLERANCE_SECONDS = 300;

/** HMAC-SHA256(secret, `${timestamp}.${payload}`) en hex. */
export function sign(payload: string | Buffer, secret: string, timestamp: string): string {
  if (!secret) throw new Error("Se requiere un secreto para firmar el webhook");
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.`, "utf8")
    .update(body)
    .digest("hex");
}

/** Headers completos para el POST saliente. */
export function buildWebhookHeaders(
  body: string,
  secret: string,
  eventId: string,
  now: Date = new Date()
): Record<string, string> {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  return {
    "Content-Type": "application/json",
    [SIGNATURE_HEADER]: `${SIGNATURE_PREFIX}${sign(body, secret, timestamp)}`,
    [TIMESTAMP_HEADER]: timestamp,
    [EVENT_ID_HEADER]: eventId,
  };
}

export type SignatureVerification =
  | { valid: true }
  | { valid: false; reason: "missing_headers" | "bad_format" | "expired" | "mismatch" };

/**
 * Verifica firma y antigüedad. Comparación en tiempo constante.
 * `toleranceSeconds` acota el replay (default 5 min).
 */
export function verifyWebhookSignature(
  body: string | Buffer,
  secret: string,
  headers: { signature: string | null | undefined; timestamp: string | null | undefined },
  options: { toleranceSeconds?: number; now?: Date } = {}
): SignatureVerification {
  const { signature, timestamp } = headers;
  if (!signature || !timestamp) return { valid: false, reason: "missing_headers" };
  if (!signature.startsWith(SIGNATURE_PREFIX) || !/^\d+$/.test(timestamp)) {
    return { valid: false, reason: "bad_format" };
  }

  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) {
    return { valid: false, reason: "expired" };
  }

  const expected = Buffer.from(sign(body, secret, timestamp), "hex");
  const received = Buffer.from(signature.slice(SIGNATURE_PREFIX.length), "hex");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { valid: false, reason: "mismatch" };
  }
  return { valid: true };
}
