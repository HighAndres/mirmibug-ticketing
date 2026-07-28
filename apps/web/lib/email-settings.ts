import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

/**
 * Acceso a la configuración de correo (fila única EmailSettings, id="singleton").
 *
 * - getEmailConfig(): config resuelta para el mailer (contraseña descifrada).
 *   Cacheada en memoria por unos segundos para no golpear la BD en cada envío.
 * - getEmailSettingsForForm(): valores para la UI (SIN contraseña; solo si está
 *   configurada o no).
 * - clearEmailConfigCache(): invalidar tras guardar.
 *
 * Precedencia: si hay host en BD se usa la config de BD; si no, se cae a las
 * variables de entorno SMTP_* (retrocompatibilidad).
 */

export const SETTINGS_ID = "singleton";

export type ToggleKey =
  | "onTicketCreated"
  | "onTicketAssigned"
  | "onStatusChanged"
  | "onNewComment"
  | "onCollaboratorAdded";

export type EmailConfig = {
  enabled: boolean;
  host: string | null;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
  secure: boolean;
  toggles: Record<ToggleKey, boolean>;
};

const DEFAULT_FROM = "Mirmibug <noreply@mirmibug.local>";

let _cache: { value: EmailConfig; at: number } | null = null;
const TTL_MS = 10_000;

export function clearEmailConfigCache() {
  _cache = null;
}

async function loadRow() {
  return prisma.emailSettings.findUnique({ where: { id: SETTINGS_ID } });
}

/** Config resuelta para el mailer. Descifra la contraseña (solo servidor). */
export async function getEmailConfig(force = false): Promise<EmailConfig> {
  if (!force && _cache && Date.now() - _cache.at < TTL_MS) {
    return _cache.value;
  }

  const row = await loadRow();

  // Host: BD tiene precedencia; si no hay, cae a env
  const dbHost = row?.smtpHost?.trim() || null;
  const host = dbHost ?? (process.env.SMTP_HOST?.trim() || null);

  let pass: string | null = null;
  if (dbHost && row?.smtpPass) {
    try {
      pass = decryptSecret(row.smtpPass);
    } catch (err) {
      console.error("[email-settings] No se pudo descifrar la contraseña SMTP:", err);
      pass = null;
    }
  } else if (!dbHost) {
    pass = process.env.SMTP_PASS ?? null;
  }

  const port = dbHost
    ? row?.smtpPort ?? 587
    : parseInt(process.env.SMTP_PORT ?? "587", 10);

  const config: EmailConfig = {
    enabled: row?.enabled ?? false,
    host,
    port,
    user: dbHost ? row?.smtpUser?.trim() || null : process.env.SMTP_USER ?? null,
    pass,
    secure: dbHost ? row?.smtpSecure ?? false : process.env.SMTP_PORT === "465",
    from: (dbHost ? row?.smtpFrom?.trim() : null) || process.env.SMTP_FROM || DEFAULT_FROM,
    toggles: {
      onTicketCreated: row?.onTicketCreated ?? true,
      onTicketAssigned: row?.onTicketAssigned ?? true,
      onStatusChanged: row?.onStatusChanged ?? true,
      onNewComment: row?.onNewComment ?? true,
      onCollaboratorAdded: row?.onCollaboratorAdded ?? true,
    },
  };

  _cache = { value: config, at: Date.now() };
  return config;
}

/** Valores para la UI (nunca expone la contraseña). */
export async function getEmailSettingsForForm() {
  const row = await loadRow();
  return {
    enabled: row?.enabled ?? false,
    smtpHost: row?.smtpHost ?? "",
    smtpPort: row?.smtpPort ?? 587,
    smtpUser: row?.smtpUser ?? "",
    smtpFrom: row?.smtpFrom ?? "",
    smtpSecure: row?.smtpSecure ?? false,
    hasPassword: !!row?.smtpPass,
    onTicketCreated: row?.onTicketCreated ?? true,
    onTicketAssigned: row?.onTicketAssigned ?? true,
    onStatusChanged: row?.onStatusChanged ?? true,
    onNewComment: row?.onNewComment ?? true,
    onCollaboratorAdded: row?.onCollaboratorAdded ?? true,
  };
}
