import crypto from "crypto";

/**
 * Cifrado simétrico para secretos guardados en BD (p. ej. contraseña SMTP).
 * AES-256-GCM. La llave se deriva (SHA-256) de SETTINGS_ENC_KEY para admitir
 * cualquier string como llave. Formato del payload: "iv:authTag:ciphertext" (base64).
 *
 * IMPORTANTE: si SETTINGS_ENC_KEY cambia, los valores ya cifrados dejan de
 * poder descifrarse.
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.SETTINGS_ENC_KEY;
  if (!raw) {
    throw new Error("SETTINGS_ENC_KEY no está configurada en el entorno");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB, tagB, dataB] = payload.split(":");
  if (!ivB || !tagB || !dataB) {
    throw new Error("Payload cifrado con formato inválido");
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}
