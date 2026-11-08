import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_KEY_HEADER,
  API_KEY_PREFIX,
  authenticateIntegrationRequest,
  generateApiKey,
  hashApiKey,
  KEY_PREFIX_LENGTH,
  requireIntegrationScope,
  type ApiKeyRecord,
  type IntegrationAuthDeps,
} from "../auth";
import { resetRateLimits } from "../rate-limit";
import { serializeScopes } from "../types";

const NOW = new Date("2026-11-07T18:00:00Z");

function makeDeps(records: ApiKeyRecord[], overrides: Partial<IntegrationAuthDeps> = {}) {
  const touched: { id: string; at: Date }[] = [];
  const deps: IntegrationAuthDeps = {
    isEnabled: () => true,
    findByHash: async (hash) => records.find((r) => hashApiKey(r.id) === hash) ?? null,
    touchLastUsed: async (id, at) => {
      touched.push({ id, at });
    },
    rateLimitPerMin: () => 60,
    now: () => NOW,
    ...overrides,
  };
  return { deps, touched };
}

/** Helper: la "key" de prueba es el id del registro; su hash es lo que se busca. */
function headersWithKey(key: string | null): Headers {
  const h = new Headers();
  if (key !== null) h.set(API_KEY_HEADER, key);
  return h;
}

const validKey = `${API_KEY_PREFIX}valid`;
const revokedKey = `${API_KEY_PREFIX}revoked`;
const readOnlyKey = `${API_KEY_PREFIX}readonly`;

const RECORDS: ApiKeyRecord[] = [
  {
    id: validKey,
    name: "n8n producción",
    scopesJson: serializeScopes(["contacts:read", "tickets:read", "tickets:write", "conversations:write"]),
    revokedAt: null,
    lastUsedAt: null,
  },
  {
    id: revokedKey,
    name: "vieja",
    scopesJson: serializeScopes(["tickets:write"]),
    revokedAt: new Date("2026-01-01T00:00:00Z"),
    lastUsedAt: null,
  },
  {
    id: readOnlyKey,
    name: "solo lectura",
    scopesJson: serializeScopes(["tickets:read"]),
    revokedAt: null,
    lastUsedAt: new Date(NOW.getTime() - 10_000),
  },
];

describe("generateApiKey / hashApiKey", () => {
  it("genera keys con prefijo, prefijo visible y hash SHA-256", () => {
    const k = generateApiKey();
    expect(k.key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(k.key.length).toBeGreaterThanOrEqual(API_KEY_PREFIX.length + 43);
    expect(k.keyPrefix).toBe(k.key.slice(0, KEY_PREFIX_LENGTH));
    expect(k.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(k.keyHash).toBe(hashApiKey(k.key));
  });

  it("genera keys distintas cada vez", () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key);
  });
});

describe("authenticateIntegrationRequest", () => {
  beforeEach(() => resetRateLimits());

  it("devuelve 404 cuando el flag está apagado", async () => {
    const { deps } = makeDeps(RECORDS, { isEnabled: () => false });
    const r = await authenticateIntegrationRequest(headersWithKey(validKey), "tickets:read", deps);
    expect(r).toMatchObject({ ok: false, status: 404, code: "NOT_FOUND" });
  });

  it("devuelve 401 sin header, con prefijo incorrecto o key desconocida", async () => {
    const { deps } = makeDeps(RECORDS);
    expect(await authenticateIntegrationRequest(headersWithKey(null), "tickets:read", deps)).toMatchObject({
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(await authenticateIntegrationRequest(headersWithKey("abc_xyz"), "tickets:read", deps)).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(
      await authenticateIntegrationRequest(headersWithKey(`${API_KEY_PREFIX}nope`), "tickets:read", deps)
    ).toMatchObject({ ok: false, status: 401 });
  });

  it("devuelve 401 con una key revocada", async () => {
    const { deps } = makeDeps(RECORDS);
    const r = await authenticateIntegrationRequest(headersWithKey(revokedKey), "tickets:write", deps);
    expect(r).toMatchObject({ ok: false, status: 401, code: "UNAUTHORIZED" });
  });

  it("devuelve 403 cuando falta el scope", async () => {
    const { deps } = makeDeps(RECORDS);
    const r = await authenticateIntegrationRequest(headersWithKey(readOnlyKey), "tickets:write", deps);
    expect(r).toMatchObject({ ok: false, status: 403, code: "FORBIDDEN_SCOPE" });
  });

  it("autentica y actualiza lastUsedAt cuando está vacío", async () => {
    const { deps, touched } = makeDeps(RECORDS);
    const r = await authenticateIntegrationRequest(headersWithKey(validKey), "tickets:write", deps);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.apiKey.name).toBe("n8n producción");
      expect(r.apiKey.scopes).toContain("tickets:write");
    }
    expect(touched).toEqual([{ id: validKey, at: NOW }]);
  });

  it("no reescribe lastUsedAt si se actualizó hace menos de un minuto", async () => {
    const { deps, touched } = makeDeps(RECORDS);
    const r = await authenticateIntegrationRequest(headersWithKey(readOnlyKey), "tickets:read", deps);
    expect(r.ok).toBe(true);
    expect(touched).toEqual([]);
  });

  it("no falla aunque falle la escritura de lastUsedAt", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = makeDeps(RECORDS, {
      touchLastUsed: async () => {
        throw new Error("db locked");
      },
    });
    const r = await authenticateIntegrationRequest(headersWithKey(validKey), "tickets:read", deps);
    expect(r.ok).toBe(true);
    spy.mockRestore();
  });

  it("aplica el rate limit por key (429 con Retry-After)", async () => {
    const { deps } = makeDeps(RECORDS, { rateLimitPerMin: () => 2 });
    expect((await authenticateIntegrationRequest(headersWithKey(validKey), "tickets:read", deps)).ok).toBe(true);
    expect((await authenticateIntegrationRequest(headersWithKey(validKey), "tickets:read", deps)).ok).toBe(true);
    const third = await authenticateIntegrationRequest(headersWithKey(validKey), "tickets:read", deps);
    expect(third).toMatchObject({ ok: false, status: 429, code: "RATE_LIMITED" });
    if (!third.ok) expect(third.headers?.["Retry-After"]).toBeDefined();
  });
});

describe("requireIntegrationScope", () => {
  beforeEach(() => resetRateLimits());

  it("devuelve una respuesta JSON estándar de error", async () => {
    const { deps } = makeDeps(RECORDS);
    const req = new Request("http://localhost/api/v1/integrations/whatsapp/tickets", {
      headers: { [API_KEY_HEADER]: readOnlyKey },
    });
    const r = await requireIntegrationScope(req, "tickets:write", deps);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      const body = await r.response.json();
      expect(body).toEqual({
        error: { code: "FORBIDDEN_SCOPE", message: expect.stringContaining("tickets:write") },
      });
    }
  });

  it("devuelve la key cuando todo es válido", async () => {
    const { deps } = makeDeps(RECORDS);
    const req = new Request("http://localhost/x", { headers: { [API_KEY_HEADER]: validKey } });
    const r = await requireIntegrationScope(req, "contacts:read", deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.apiKey.id).toBe(validKey);
  });
});
