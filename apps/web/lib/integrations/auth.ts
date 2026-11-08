/**
 * Autenticación de la API de integración (n8n → ticketing).
 *
 * Header: X-Integration-Key: mbk_<token>
 *
 * Las keys se generan con 32 bytes aleatorios (base64url) y prefijo "mbk_";
 * se muestran una sola vez. En BD solo queda el SHA-256: la key tiene alta
 * entropía, así que un hash rápido sin sal es suficiente y la búsqueda por
 * hash es O(1) vía el índice único.
 *
 * Toda petición pasa por requireIntegrationScope(): flag maestro, key válida
 * y no revocada, scope, rate limit por key y actualización de lastUsedAt.
 */
import crypto from "crypto";
import type { NextResponse } from "next/server";
import { getIntegrationConfig, isWhatsappIntegrationEnabled } from "./config";
import { errorResponse, type IntegrationErrorBody } from "./http";
import { checkRateLimit, rateLimitHeaders } from "./rate-limit";
import { parseScopes, type IntegrationScope } from "./types";

export const API_KEY_HEADER = "X-Integration-Key";
export const API_KEY_PREFIX = "mbk_";
/** Caracteres de la key que se guardan en claro para identificarla en la UI. */
export const KEY_PREFIX_LENGTH = 8;
/** No escribir lastUsedAt más de una vez por minuto por key (SQLite agradece). */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Generación y hash
// ---------------------------------------------------------------------------
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

export type GeneratedApiKey = {
  /** Key completa: mostrarla UNA vez y no guardarla. */
  key: string;
  keyPrefix: string;
  keyHash: string;
};

export function generateApiKey(): GeneratedApiKey {
  const key = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return { key, keyPrefix: key.slice(0, KEY_PREFIX_LENGTH), keyHash: hashApiKey(key) };
}

// ---------------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------------
export type ApiKeyRecord = {
  id: string;
  name: string;
  scopesJson: string;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};

export type AuthenticatedApiKey = {
  id: string;
  name: string;
  scopes: IntegrationScope[];
};

export type IntegrationAuthFailure = {
  ok: false;
  status: 401 | 403 | 404 | 429;
  code: "UNAUTHORIZED" | "FORBIDDEN_SCOPE" | "NOT_FOUND" | "RATE_LIMITED";
  message: string;
  headers?: Record<string, string>;
};

export type IntegrationAuthResult = { ok: true; apiKey: AuthenticatedApiKey } | IntegrationAuthFailure;

/** Dependencias inyectables (los tests unitarios pasan fakes; producción usa Prisma). */
export type IntegrationAuthDeps = {
  isEnabled: () => boolean;
  findByHash: (keyHash: string) => Promise<ApiKeyRecord | null>;
  touchLastUsed: (id: string, at: Date) => Promise<void>;
  rateLimitPerMin: () => number;
  now: () => Date;
};

const prismaDeps: IntegrationAuthDeps = {
  isEnabled: isWhatsappIntegrationEnabled,
  async findByHash(keyHash) {
    const { prisma } = await import("@/lib/prisma");
    return prisma.integrationApiKey.findUnique({
      where: { keyHash },
      select: { id: true, name: true, scopesJson: true, revokedAt: true, lastUsedAt: true },
    });
  },
  async touchLastUsed(id, at) {
    const { prisma } = await import("@/lib/prisma");
    await prisma.integrationApiKey.update({ where: { id }, data: { lastUsedAt: at } });
  },
  rateLimitPerMin: () => getIntegrationConfig().apiKeyRateLimitPerMin,
  now: () => new Date(),
};

export async function authenticateIntegrationRequest(
  headers: Headers,
  scope: IntegrationScope,
  deps: IntegrationAuthDeps = prismaDeps
): Promise<IntegrationAuthResult> {
  // Flag maestro apagado: la API "no existe".
  if (!deps.isEnabled()) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Recurso no encontrado." };
  }

  const raw = headers.get(API_KEY_HEADER)?.trim();
  if (!raw || !raw.startsWith(API_KEY_PREFIX)) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "API key requerida o inválida." };
  }

  const record = await deps.findByHash(hashApiKey(raw));
  if (!record || record.revokedAt) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "API key requerida o inválida." };
  }

  const scopes = parseScopes(record.scopesJson);
  if (!scopes.includes(scope)) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN_SCOPE",
      message: `La API key no tiene el scope "${scope}".`,
    };
  }

  const now = deps.now();
  const limit = checkRateLimit(`apikey:${record.id}`, deps.rateLimitPerMin(), { now: now.getTime() });
  if (!limit.allowed) {
    return {
      ok: false,
      status: 429,
      code: "RATE_LIMITED",
      message: "Demasiadas peticiones para esta API key. Intenta más tarde.",
      headers: rateLimitHeaders(limit),
    };
  }

  const staleLastUsed =
    !record.lastUsedAt || now.getTime() - record.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS;
  if (staleLastUsed) {
    // Nunca bloquea ni rompe la petición
    await deps.touchLastUsed(record.id, now).catch((err: unknown) => {
      console.error("[integration-auth] No se pudo actualizar lastUsedAt:", err);
    });
  }

  return { ok: true, apiKey: { id: record.id, name: record.name, scopes } };
}

/**
 * Para Route Handlers: devuelve la key autenticada o la respuesta de error
 * lista para retornar.
 *
 *   const auth = await requireIntegrationScope(req, "tickets:write");
 *   if (!auth.ok) return auth.response;
 */
export async function requireIntegrationScope(
  req: Request,
  scope: IntegrationScope,
  deps?: IntegrationAuthDeps
): Promise<{ ok: true; apiKey: AuthenticatedApiKey } | { ok: false; response: NextResponse<IntegrationErrorBody> }> {
  const result = await authenticateIntegrationRequest(req.headers, scope, deps);
  if (result.ok) return result;
  return {
    ok: false,
    response: errorResponse(result.status, result.code, result.message, { headers: result.headers }),
  };
}

/**
 * Límite por teléfono para los endpoints de escritura (comentarios, tickets,
 * adjuntos). Devuelve la respuesta 429 o null si está permitido.
 */
export function enforcePhoneRateLimit(
  phoneE164: string,
  options: { limitPerMin?: number; now?: Date } = {}
): NextResponse<IntegrationErrorBody> | null {
  const limitPerMin = options.limitPerMin ?? getIntegrationConfig().phoneRateLimitPerMin;
  const result = checkRateLimit(`phone:${phoneE164}`, limitPerMin, { now: options.now?.getTime() });
  if (result.allowed) return null;
  return errorResponse(429, "RATE_LIMITED", "Demasiados mensajes desde este número. Intenta más tarde.", {
    headers: rateLimitHeaders(result),
  });
}
