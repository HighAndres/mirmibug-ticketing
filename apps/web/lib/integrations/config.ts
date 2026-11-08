/**
 * Configuración de la integración WhatsApp / n8n, leída del entorno.
 *
 * Toda la funcionalidad nueva queda detrás de WHATSAPP_INTEGRATION_ENABLED
 * (default false). Se leen en tiempo de ejecución (no al cargar el módulo)
 * para que los tests y PM2 puedan cambiarlas sin recompilar.
 *
 * Variables (ver .env.example):
 *   WHATSAPP_INTEGRATION_ENABLED, INTEGRATION_RATE_LIMIT_PER_MIN,
 *   WHATSAPP_PHONE_RATE_LIMIT_PER_MIN, ATTACHMENT_MAX_MB, TICKET_REOPEN_MAX_DAYS,
 *   WEBHOOK_TIMEOUT_SECONDS, N8N_WEBHOOK_URL, N8N_WEBHOOK_SECRET
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

/** Interruptor maestro de la integración. */
export function isWhatsappIntegrationEnabled(): boolean {
  return envBool("WHATSAPP_INTEGRATION_ENABLED", false);
}

export type IntegrationConfig = {
  enabled: boolean;
  /** Peticiones por minuto permitidas por API key en los endpoints de integración. */
  apiKeyRateLimitPerMin: number;
  /** Mensajes por minuto permitidos por teléfono en los endpoints de escritura. */
  phoneRateLimitPerMin: number;
  /** Tamaño máximo de un adjunto recibido por WhatsApp. */
  attachmentMaxMb: number;
  /** Días tras RESOLVED/CLOSED en los que el cliente aún puede reabrir. */
  ticketReopenMaxDays: number;
  /** Timeout del POST a cada webhook. */
  webhookTimeoutSeconds: number;
  /** Ventana de Meta para texto libre (fuera de ella hay que usar plantilla). */
  whatsappWindowHours: number;
  /** Endpoint y secreto iniciales de n8n (semilla del primer WebhookEndpoint). */
  n8nWebhookUrl: string | null;
  n8nWebhookSecret: string | null;
  /** Categoría para tickets creados por WhatsApp sin category_id. */
  defaultCategoryName: string;
  /** Cada cuántos segundos el scheduler revisa el outbox. */
  outboxPollIntervalSeconds: number;
  /** Eventos por pasada del dispatcher. */
  outboxBatchSize: number;
  /** Intentar entregar el evento justo después de la respuesta (after()). */
  outboxImmediateDispatch: boolean;
};

export function getIntegrationConfig(): IntegrationConfig {
  return {
    enabled: isWhatsappIntegrationEnabled(),
    apiKeyRateLimitPerMin: envInt("INTEGRATION_RATE_LIMIT_PER_MIN", 60),
    phoneRateLimitPerMin: envInt("WHATSAPP_PHONE_RATE_LIMIT_PER_MIN", 20),
    attachmentMaxMb: envInt("ATTACHMENT_MAX_MB", 16),
    ticketReopenMaxDays: envInt("TICKET_REOPEN_MAX_DAYS", 7),
    webhookTimeoutSeconds: envInt("WEBHOOK_TIMEOUT_SECONDS", 10),
    whatsappWindowHours: 24,
    n8nWebhookUrl: process.env.N8N_WEBHOOK_URL?.trim() || null,
    n8nWebhookSecret: process.env.N8N_WEBHOOK_SECRET?.trim() || null,
    defaultCategoryName: process.env.WHATSAPP_DEFAULT_CATEGORY?.trim() || "Soporte técnico",
    outboxPollIntervalSeconds: envInt("OUTBOX_POLL_INTERVAL_SECONDS", 30),
    outboxBatchSize: envInt("OUTBOX_BATCH_SIZE", 20),
    outboxImmediateDispatch: envBool("OUTBOX_IMMEDIATE_DISPATCH", true),
  };
}
