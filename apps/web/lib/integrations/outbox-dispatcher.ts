/**
 * Entrega de eventos del outbox a los WebhookEndpoint suscritos.
 *
 * SQLite no tiene SELECT ... FOR UPDATE SKIP LOCKED; el "claim" se hace con un
 * updateMany condicional por evento (PENDING/FAILED → PROCESSING): solo un
 * proceso consigue count=1. Un PROCESSING con lockedAt viejo (crash) se
 * vuelve a reclamar.
 *
 * Reintentos con backoff: 1 min, 5 min, 15 min, 1 h, 6 h. Tras el 5.º intento
 * fallido el evento pasa a DEAD y solo se reprocesa a mano
 * (scripts/outbox-retry-dead.ts o la UI de la Fase 5).
 *
 * Un evento se marca DELIVERED cuando TODOS los endpoints activos suscritos
 * respondieron 2xx. Si alguno falla se reintenta a todos (limitación conocida:
 * con un solo endpoint, el caso de n8n, no afecta).
 */
import type { EventOutbox, OutboxStatus, WebhookEndpoint } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getIntegrationConfig, isWhatsappIntegrationEnabled } from "./config";
import { buildWebhookHeaders } from "./signing";
import { OUTBOX_EVENT_TYPES, parseEventTypes, type OutboxEventType } from "./types";

/** Espera antes del reintento n (1-based). */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
/** Un PROCESSING más viejo que esto se considera huérfano (proceso caído). */
export const STALE_LOCK_MS = 5 * 60_000;
export const CLAIMABLE_STATUSES: OutboxStatus[] = ["PENDING", "FAILED"];

export type DeliveryOutcome = {
  eventId: string;
  status: OutboxStatus;
  attempts: number;
  error: string | null;
};

export type DispatchStats = {
  claimed: number;
  delivered: number;
  failed: number;
  dead: number;
  outcomes: DeliveryOutcome[];
};

/** Fecha del siguiente intento según el número de intentos ya hechos. */
export function nextAttemptAfter(attemptsDone: number, now: Date): Date | null {
  if (attemptsDone >= MAX_ATTEMPTS) return null;
  return new Date(now.getTime() + RETRY_DELAYS_MS[attemptsDone - 1]);
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------
export function endpointSubscribedTo(endpoint: Pick<WebhookEndpoint, "eventTypesJson">, eventType: string): boolean {
  const raw = endpoint.eventTypesJson;
  if (raw.includes('"*"')) return true;
  return (parseEventTypes(raw) as string[]).includes(eventType);
}

async function activeEndpointsFor(eventType: string): Promise<WebhookEndpoint[]> {
  const all = await prisma.webhookEndpoint.findMany({ where: { isActive: true } });
  return all.filter((e) => endpointSubscribedTo(e, eventType));
}

/**
 * Crea el endpoint de n8n a partir de N8N_WEBHOOK_URL / N8N_WEBHOOK_SECRET si
 * aún no existe uno con esa URL. Idempotente; se llama al arrancar el scheduler.
 */
export async function ensureEnvWebhookEndpoint(): Promise<WebhookEndpoint | null> {
  const { n8nWebhookUrl, n8nWebhookSecret } = getIntegrationConfig();
  if (!n8nWebhookUrl || !n8nWebhookSecret) return null;
  const existing = await prisma.webhookEndpoint.findFirst({ where: { url: n8nWebhookUrl } });
  if (existing) return existing;
  return prisma.webhookEndpoint.create({
    data: {
      name: "n8n (desde .env)",
      url: n8nWebhookUrl,
      secret: encryptSecret(n8nWebhookSecret),
      eventTypesJson: JSON.stringify([...OUTBOX_EVENT_TYPES]),
      isActive: true,
    },
  });
}

// ---------------------------------------------------------------------------
// POST firmado
// ---------------------------------------------------------------------------
async function postToEndpoint(endpoint: WebhookEndpoint, event: EventOutbox): Promise<{ ok: true } | { ok: false; error: string }> {
  const { webhookTimeoutSeconds } = getIntegrationConfig();
  let secret: string;
  try {
    secret = decryptSecret(endpoint.secret);
  } catch (err) {
    return { ok: false, error: `[${endpoint.name}] no se pudo descifrar el secreto: ${(err as Error).message}` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), webhookTimeoutSeconds * 1000);
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: buildWebhookHeaders(event.payloadJson, secret, event.id),
      body: event.payloadJson,
      signal: controller.signal,
    });
    if (res.ok) return { ok: true };
    const text = (await res.text().catch(() => "")).slice(0, 300);
    return { ok: false, error: `[${endpoint.name}] HTTP ${res.status}${text ? `: ${text}` : ""}` };
  } catch (err) {
    const reason = (err as Error).name === "AbortError" ? `timeout tras ${webhookTimeoutSeconds}s` : (err as Error).message;
    return { ok: false, error: `[${endpoint.name}] ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Claim y entrega
// ---------------------------------------------------------------------------
async function claim(eventId: string, now: Date): Promise<EventOutbox | null> {
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  const { count } = await prisma.eventOutbox.updateMany({
    where: {
      id: eventId,
      OR: [
        { status: { in: CLAIMABLE_STATUSES }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", lockedAt: { lt: staleBefore } },
      ],
    },
    data: { status: "PROCESSING", lockedAt: now },
  });
  if (count !== 1) return null;
  return prisma.eventOutbox.findUnique({ where: { id: eventId } });
}

async function deliverClaimed(event: EventOutbox, now: Date): Promise<DeliveryOutcome> {
  const attempts = event.attempts + 1;
  const endpoints = await activeEndpointsFor(event.eventType);

  if (endpoints.length === 0) {
    const error = `No hay webhook endpoints activos suscritos a ${event.eventType}`;
    await prisma.eventOutbox.update({
      where: { id: event.id },
      data: { status: "DEAD", attempts, lastError: error, lockedAt: null },
    });
    return { eventId: event.id, status: "DEAD", attempts, error };
  }

  const results = await Promise.all(endpoints.map((e) => postToEndpoint(e, event)));
  const errors = results.filter((r): r is { ok: false; error: string } => !r.ok).map((r) => r.error);

  if (errors.length === 0) {
    await prisma.eventOutbox.update({
      where: { id: event.id },
      data: { status: "DELIVERED", attempts, deliveredAt: now, lastError: null, lockedAt: null },
    });
    return { eventId: event.id, status: "DELIVERED", attempts, error: null };
  }

  const error = errors.join(" | ").slice(0, 1000);
  const next = nextAttemptAfter(attempts, now);
  const status: OutboxStatus = next ? "FAILED" : "DEAD";
  await prisma.eventOutbox.update({
    where: { id: event.id },
    data: { status, attempts, lastError: error, lockedAt: null, ...(next ? { nextAttemptAt: next } : {}) },
  });
  return { eventId: event.id, status, attempts, error };
}

/** Intenta entregar un evento concreto (entrega inmediata o "Reintentar" manual). */
export async function dispatchEventById(eventId: string, now: Date = new Date()): Promise<DeliveryOutcome | null> {
  const event = await claim(eventId, now);
  if (!event) return null;
  return deliverClaimed(event, now);
}

let running = false;

/** Una pasada del worker: reclama hasta `limit` eventos vencidos y los entrega. */
export async function dispatchPending(options: { limit?: number; now?: Date } = {}): Promise<DispatchStats> {
  const stats: DispatchStats = { claimed: 0, delivered: 0, failed: 0, dead: 0, outcomes: [] };
  if (running) return stats;
  running = true;
  try {
    const now = options.now ?? new Date();
    const limit = options.limit ?? getIntegrationConfig().outboxBatchSize;
    const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);

    const candidates = await prisma.eventOutbox.findMany({
      where: {
        OR: [
          { status: { in: CLAIMABLE_STATUSES }, nextAttemptAt: { lte: now } },
          { status: "PROCESSING", lockedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { nextAttemptAt: "asc" },
      take: limit,
      select: { id: true },
    });

    for (const { id } of candidates) {
      const event = await claim(id, now);
      if (!event) continue;
      stats.claimed += 1;
      const outcome = await deliverClaimed(event, now);
      stats.outcomes.push(outcome);
      if (outcome.status === "DELIVERED") stats.delivered += 1;
      else if (outcome.status === "DEAD") stats.dead += 1;
      else stats.failed += 1;
    }
    return stats;
  } finally {
    running = false;
  }
}

/**
 * Reprograma eventos DEAD (o los ids indicados) para un nuevo ciclo de
 * reintentos: vuelven a PENDING con attempts en 0.
 */
export async function retryEvents(options: { ids?: string[]; onlyDead?: boolean; now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const where = options.ids?.length
    ? { id: { in: options.ids }, ...(options.onlyDead === false ? {} : { status: { in: ["DEAD", "FAILED"] as OutboxStatus[] } }) }
    : { status: "DEAD" as OutboxStatus };
  const { count } = await prisma.eventOutbox.updateMany({
    where,
    data: { status: "PENDING", attempts: 0, nextAttemptAt: now, lockedAt: null },
  });
  return count;
}

/** Resumen por estado para la UI y el script. */
export async function outboxSummary(): Promise<Record<OutboxStatus, number>> {
  const rows = await prisma.eventOutbox.groupBy({ by: ["status"], _count: { _all: true } });
  const summary: Record<OutboxStatus, number> = { PENDING: 0, PROCESSING: 0, FAILED: 0, DELIVERED: 0, DEAD: 0 };
  for (const r of rows) summary[r.status] = r._count._all;
  return summary;
}

export function isOutboxEnabled(): boolean {
  return isWhatsappIntegrationEnabled();
}

export type { OutboxEventType };
