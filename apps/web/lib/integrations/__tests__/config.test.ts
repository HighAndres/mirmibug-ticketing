import { afterEach, describe, expect, it } from "vitest";
import { getIntegrationConfig, isWhatsappIntegrationEnabled } from "../config";

const KEYS = [
  "WHATSAPP_INTEGRATION_ENABLED",
  "INTEGRATION_RATE_LIMIT_PER_MIN",
  "ATTACHMENT_MAX_MB",
  "N8N_WEBHOOK_URL",
  "WHATSAPP_DEFAULT_CATEGORY",
  "OUTBOX_IMMEDIATE_DISPATCH",
];
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isWhatsappIntegrationEnabled", () => {
  it("acepta true/1/yes y nada más", () => {
    for (const v of ["true", "TRUE", "1", "yes"]) {
      process.env.WHATSAPP_INTEGRATION_ENABLED = v;
      expect(isWhatsappIntegrationEnabled()).toBe(true);
    }
    for (const v of ["false", "0", "no", "sí", ""]) {
      process.env.WHATSAPP_INTEGRATION_ENABLED = v;
      expect(isWhatsappIntegrationEnabled()).toBe(false);
    }
    delete process.env.WHATSAPP_INTEGRATION_ENABLED;
    expect(isWhatsappIntegrationEnabled()).toBe(false);
  });
});

describe("getIntegrationConfig", () => {
  it("usa los defaults cuando falta o no es válida la variable", () => {
    delete process.env.INTEGRATION_RATE_LIMIT_PER_MIN;
    delete process.env.ATTACHMENT_MAX_MB;
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.WHATSAPP_DEFAULT_CATEGORY;
    delete process.env.OUTBOX_IMMEDIATE_DISPATCH;
    const c = getIntegrationConfig();
    expect(c.apiKeyRateLimitPerMin).toBe(60);
    expect(c.attachmentMaxMb).toBe(16);
    expect(c.n8nWebhookUrl).toBeNull();
    expect(c.defaultCategoryName).toBe("Soporte técnico");
    expect(c.outboxImmediateDispatch).toBe(true);
    expect(c.whatsappWindowHours).toBe(24);

    process.env.INTEGRATION_RATE_LIMIT_PER_MIN = "abc";
    process.env.ATTACHMENT_MAX_MB = "-5";
    expect(getIntegrationConfig().apiKeyRateLimitPerMin).toBe(60);
    expect(getIntegrationConfig().attachmentMaxMb).toBe(16);
  });

  it("lee valores explícitos", () => {
    process.env.INTEGRATION_RATE_LIMIT_PER_MIN = " 120 ";
    process.env.N8N_WEBHOOK_URL = " https://n8n.test/hook ";
    process.env.WHATSAPP_DEFAULT_CATEGORY = "Redes";
    process.env.OUTBOX_IMMEDIATE_DISPATCH = "false";
    const c = getIntegrationConfig();
    expect(c.apiKeyRateLimitPerMin).toBe(120);
    expect(c.n8nWebhookUrl).toBe("https://n8n.test/hook");
    expect(c.defaultCategoryName).toBe("Redes");
    expect(c.outboxImmediateDispatch).toBe(false);
  });
});
