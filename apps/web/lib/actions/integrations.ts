"use server";

/**
 * Acciones de Administración → Integraciones (solo SUPERADMIN):
 * API keys, webhook endpoints y log del outbox.
 */
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { generateApiKey } from "@/lib/integrations/auth";
import { getIntegrationConfig } from "@/lib/integrations/config";
import { dispatchEventById, retryEvents } from "@/lib/integrations/outbox-dispatcher";
import { buildWebhookHeaders } from "@/lib/integrations/signing";
import {
  isIntegrationScope,
  isOutboxEventType,
  serializeScopes,
  type IntegrationScope,
  type OutboxEventType,
} from "@/lib/integrations/types";

const PAGE = "/admin/integrations";

async function requireSuperadmin() {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado");
  if (session.user.roleKey !== "SUPERADMIN") throw new Error("Sin permisos");
  return session.user;
}

export type ActionResult = { ok: boolean; message: string; secret?: string };

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------
export async function createApiKey(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireSuperadmin();

  const name = ((formData.get("name") as string) ?? "").trim();
  const scopes = (formData.getAll("scopes") as string[]).filter(isIntegrationScope);
  if (!name) return { ok: false, message: "Ponle un nombre a la key (p. ej. n8n producción)." };
  if (scopes.length === 0) return { ok: false, message: "Selecciona al menos un scope." };

  const generated = generateApiKey();
  const record = await prisma.integrationApiKey.create({
    data: {
      name,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      scopesJson: serializeScopes(scopes as IntegrationScope[]),
      createdById: user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "CREATE",
      entityType: "IntegrationApiKey",
      entityId: record.id,
      description: `API key "${name}" creada (${generated.keyPrefix}…)`,
      actorId: user.id,
      metadataJson: JSON.stringify({ scopes }),
    },
  });

  revalidatePath(PAGE);
  return {
    ok: true,
    message: `Key "${name}" creada. Cópiala ahora: no se volverá a mostrar.`,
    secret: generated.key,
  };
}

export async function revokeApiKey(id: string) {
  const user = await requireSuperadmin();
  const key = await prisma.integrationApiKey.findUnique({ where: { id } });
  if (!key) throw new Error("API key no encontrada");
  if (key.revokedAt) return;

  await prisma.integrationApiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await prisma.auditLog.create({
    data: {
      action: "REVOKE_PERMISSION",
      entityType: "IntegrationApiKey",
      entityId: id,
      description: `API key "${key.name}" (${key.keyPrefix}…) revocada`,
      actorId: user.id,
    },
  });
  revalidatePath(PAGE);
}

// ---------------------------------------------------------------------------
// Webhook endpoints
// ---------------------------------------------------------------------------
function parseEventTypesFromForm(formData: FormData): string[] {
  if (formData.get("allEvents") === "on") return ["*"];
  return (formData.getAll("eventTypes") as string[]).filter(isOutboxEventType);
}

export async function createWebhookEndpoint(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireSuperadmin();

  const name = ((formData.get("name") as string) ?? "").trim();
  const url = ((formData.get("url") as string) ?? "").trim();
  let secret = ((formData.get("secret") as string) ?? "").trim();
  const eventTypes = parseEventTypesFromForm(formData);

  if (!name) return { ok: false, message: "Ponle un nombre al endpoint." };
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    return { ok: false, message: "La URL debe empezar con http:// o https://." };
  }
  if (eventTypes.length === 0) return { ok: false, message: "Selecciona al menos un tipo de evento." };

  const generated = !secret;
  if (generated) secret = crypto.randomBytes(32).toString("base64url");

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      name,
      url,
      secret: encryptSecret(secret),
      eventTypesJson: JSON.stringify(eventTypes),
      isActive: true,
      createdById: user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "CREATE",
      entityType: "WebhookEndpoint",
      entityId: endpoint.id,
      description: `Webhook "${name}" registrado → ${url}`,
      actorId: user.id,
      metadataJson: JSON.stringify({ eventTypes, generatedSecret: generated }),
    },
  });

  revalidatePath(PAGE);
  return {
    ok: true,
    message: generated
      ? `Endpoint "${name}" creado. Este es el secreto HMAC para configurarlo en n8n; no se volverá a mostrar.`
      : `Endpoint "${name}" creado con el secreto que indicaste.`,
    secret: generated ? secret : undefined,
  };
}

export async function toggleWebhookEndpoint(id: string) {
  const user = await requireSuperadmin();
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint) throw new Error("Endpoint no encontrado");
  await prisma.webhookEndpoint.update({ where: { id }, data: { isActive: !endpoint.isActive } });
  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "WebhookEndpoint",
      entityId: id,
      description: `Webhook "${endpoint.name}" ${endpoint.isActive ? "desactivado" : "activado"}`,
      actorId: user.id,
    },
  });
  revalidatePath(PAGE);
}

export async function deleteWebhookEndpoint(id: string) {
  const user = await requireSuperadmin();
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint) return;
  await prisma.webhookEndpoint.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "WebhookEndpoint",
      entityId: id,
      description: `Webhook "${endpoint.name}" eliminado (${endpoint.url})`,
      actorId: user.id,
    },
  });
  revalidatePath(PAGE);
}

/**
 * Envía un evento de prueba firmado directamente al endpoint (sin pasar por
 * el outbox). El payload tiene la forma real y `test: true`.
 */
export async function sendTestEvent(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireSuperadmin();
  const id = formData.get("endpointId") as string;
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint) return { ok: false, message: "Endpoint no encontrado." };

  let secret: string;
  try {
    secret = decryptSecret(endpoint.secret);
  } catch {
    return { ok: false, message: "No se pudo descifrar el secreto (¿cambió SETTINGS_ENC_KEY?)." };
  }

  const now = new Date();
  const eventId = crypto.randomUUID();
  const payload = {
    event_id: eventId,
    event_type: "ticket.created" as OutboxEventType,
    occurred_at: now.toISOString(),
    test: true,
    ticket: {
      id: "test",
      folio: "TEST-0000",
      title: "Evento de prueba desde Mirmibug",
      status: "OPEN",
      previous_status: null,
      url: `${(process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")}/tickets/test`,
    },
    contact: { id: "test", name: user.name ?? "Prueba", whatsapp_phone: "+525500000000", opt_in: true },
    actor: { id: user.id, name: user.name ?? "Prueba", channel: "WEB", is_customer: false },
    whatsapp: { last_inbound_at: null, within_24h_window: false },
  };
  const body = JSON.stringify(payload);
  const { webhookTimeoutSeconds } = getIntegrationConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), webhookTimeoutSeconds * 1000);

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: buildWebhookHeaders(body, secret, eventId, now),
      body,
      signal: controller.signal,
    });
    const text = (await res.text().catch(() => "")).slice(0, 200);
    return res.ok
      ? { ok: true, message: `El endpoint respondió HTTP ${res.status}.` }
      : { ok: false, message: `El endpoint respondió HTTP ${res.status}${text ? `: ${text}` : ""}` };
  } catch (err) {
    const reason = (err as Error).name === "AbortError" ? `timeout tras ${webhookTimeoutSeconds}s` : (err as Error).message;
    return { ok: false, message: `No se pudo entregar: ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------
export async function retryOutboxEvent(id: string) {
  await requireSuperadmin();
  await retryEvents({ ids: [id], onlyDead: false });
  await dispatchEventById(id).catch(console.error);
  revalidatePath(PAGE);
}

export async function retryAllDeadEvents() {
  await requireSuperadmin();
  const count = await retryEvents();
  if (count > 0) {
    const { dispatchPending } = await import("@/lib/integrations/outbox-dispatcher");
    await dispatchPending({ limit: count }).catch(console.error);
  }
  revalidatePath(PAGE);
}
