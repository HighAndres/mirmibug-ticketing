import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, rateLimitHeaders, resetRateLimits } from "../rate-limit";

const T0 = 1_700_000_000_000;

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("permite hasta el límite y bloquea el siguiente", () => {
    for (let i = 1; i <= 3; i++) {
      const r = checkRateLimit("apikey:a", 3, { now: T0 + i });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(3 - i);
    }
    const blocked = checkRateLimit("apikey:a", 3, { now: T0 + 10 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("reinicia la ventana al pasar el minuto", () => {
    checkRateLimit("apikey:a", 1, { now: T0 });
    expect(checkRateLimit("apikey:a", 1, { now: T0 + 59_000 }).allowed).toBe(false);
    expect(checkRateLimit("apikey:a", 1, { now: T0 + 60_000 }).allowed).toBe(true);
  });

  it("lleva contadores independientes por key", () => {
    checkRateLimit("phone:+525512345678", 1, { now: T0 });
    expect(checkRateLimit("phone:+525512345678", 1, { now: T0 + 1 }).allowed).toBe(false);
    expect(checkRateLimit("phone:+525587654321", 1, { now: T0 + 1 }).allowed).toBe(true);
    expect(checkRateLimit("apikey:a", 1, { now: T0 + 1 }).allowed).toBe(true);
  });

  it("acepta una ventana personalizada", () => {
    checkRateLimit("k", 1, { now: T0, windowMs: 1_000 });
    expect(checkRateLimit("k", 1, { now: T0 + 500, windowMs: 1_000 }).allowed).toBe(false);
    expect(checkRateLimit("k", 1, { now: T0 + 1_000, windowMs: 1_000 }).allowed).toBe(true);
  });
});

describe("rateLimitHeaders", () => {
  beforeEach(() => resetRateLimits());

  it("incluye Retry-After solo cuando se bloquea", () => {
    const ok = rateLimitHeaders(checkRateLimit("k", 1, { now: T0 }));
    expect(ok["RateLimit-Limit"]).toBe("1");
    expect(ok["RateLimit-Remaining"]).toBe("0");
    expect(ok["Retry-After"]).toBeUndefined();

    const blocked = rateLimitHeaders(checkRateLimit("k", 1, { now: T0 + 1 }));
    expect(blocked["Retry-After"]).toBe("60");
  });
});
