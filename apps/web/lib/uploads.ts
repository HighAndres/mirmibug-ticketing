import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

/**
 * Directorio raíz de la app (donde vive /public).
 * En producción definir APP_DIR; como fallback se usa el CWD del proceso,
 * que en `next start` es la raíz de la app.
 */
export function getAppDir(): string {
  return process.env.APP_DIR ?? process.cwd();
}

/** Resuelve una ruta dentro de /public (ej. getPublicPath("uploads", "logos")). */
export function getPublicPath(...segments: string[]): string {
  return path.join(getAppDir(), "public", ...segments);
}

// ---------------------------------------------------------------------------
// Adjuntos de tickets
// ---------------------------------------------------------------------------

/** Tipos permitidos desde la web (formulario de adjuntos). */
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
];

/** Desde WhatsApp además llegan notas de voz, audio y video. */
export const WHATSAPP_ALLOWED_ATTACHMENT_TYPES = [
  ...ALLOWED_ATTACHMENT_TYPES,
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "video/mp4",
  "video/3gpp",
];

/** Límite del formulario web (el de WhatsApp es ATTACHMENT_MAX_MB). */
export const MAX_WEB_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export function getAttachmentDir(): string {
  return getPublicPath("uploads", "attachments");
}

/**
 * Guarda el archivo en disco con un nombre aleatorio y devuelve storedName.
 * La extensión se toma del nombre original (o "bin").
 */
export async function saveAttachmentFile(buffer: Buffer, originalName: string): Promise<string> {
  const ext = originalName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const storedName = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  const dir = getAttachmentDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, storedName), buffer);
  return storedName;
}
