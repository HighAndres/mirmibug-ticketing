import { describe, expect, it } from "vitest";
import { IntegrationError } from "../http";
import {
  nullableString,
  optionalEnum,
  optionalIsoDate,
  optionalObject,
  optionalString,
  readJsonBody,
  requireEnum,
  requireString,
} from "../validation";

function req(body: string, contentType = "application/json") {
  return new Request("http://x/", { method: "POST", body, headers: { "content-type": contentType } });
}

async function errorOf(fn: () => unknown | Promise<unknown>): Promise<IntegrationError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof IntegrationError) return err;
    throw err;
  }
  throw new Error("no lanzó");
}

describe("readJsonBody", () => {
  it("devuelve {} con body vacío y el objeto con JSON válido", async () => {
    expect(await readJsonBody(req(""))).toEqual({});
    expect(await readJsonBody(req("   "))).toEqual({});
    expect(await readJsonBody(req('{"a":1}'))).toEqual({ a: 1 });
  });

  it("400 VALIDATION_ERROR con JSON inválido o no-objeto", async () => {
    const bad = await errorOf(() => readJsonBody(req("{oops")));
    expect(bad.status).toBe(400);
    expect(bad.code).toBe("VALIDATION_ERROR");
    expect((await errorOf(() => readJsonBody(req("[1,2]")))).message).toContain("objeto");
    expect((await errorOf(() => readJsonBody(req("null")))).message).toContain("objeto");
  });
});

describe("strings", () => {
  it("optionalString recorta y acepta query strings", () => {
    expect(optionalString({ a: "  hola " }, "a")).toBe("hola");
    expect(optionalString({ a: "   " }, "a")).toBeUndefined();
    expect(optionalString({}, "a")).toBeUndefined();
    expect(optionalString(new URLSearchParams("a=x"), "a")).toBe("x");
    expect(optionalString(new URLSearchParams(""), "a")).toBeUndefined();
  });

  it("valida tipo y longitud con el campo en details", async () => {
    const notString = await errorOf(() => optionalString({ a: 5 }, "a"));
    expect(notString.details).toEqual({ field: "a" });
    const tooLong = await errorOf(() => optionalString({ a: "abcdef" }, "a", { max: 3 }));
    expect(tooLong.message).toContain("3 caracteres");
    const missing = await errorOf(() => requireString({}, "title"));
    expect(missing.details).toEqual({ field: "title" });
    expect(requireString({ title: "ok" }, "title")).toBe("ok");
  });
});

describe("enums, fechas, objetos y nullables", () => {
  it("optionalEnum / requireEnum", async () => {
    expect(optionalEnum({ s: "open" }, "s", ["open", "closed"] as const)).toBe("open");
    expect(optionalEnum({}, "s", ["open"] as const)).toBeUndefined();
    const bad = await errorOf(() => optionalEnum({ s: "x" }, "s", ["open", "closed"] as const));
    expect(bad.message).toContain("open, closed");
    const missing = await errorOf(() => requireEnum({}, "action", ["close", "reopen"] as const));
    expect(missing.message).toContain("close, reopen");
  });

  it("optionalIsoDate", async () => {
    expect(optionalIsoDate({ d: "2026-11-07T18:00:00Z" }, "d")?.toISOString()).toBe("2026-11-07T18:00:00.000Z");
    expect(optionalIsoDate({}, "d")).toBeUndefined();
    expect((await errorOf(() => optionalIsoDate({ d: "ayer" }, "d"))).message).toContain("ISO 8601");
  });

  it("optionalObject", async () => {
    expect(optionalObject({ c: { a: 1 } }, "c")).toEqual({ a: 1 });
    expect(optionalObject({ c: null }, "c")).toBeUndefined();
    expect((await errorOf(() => optionalObject({ c: [1] }, "c"))).message).toContain("objeto");
  });

  it("nullableString distingue ausente, null y valor", async () => {
    expect(nullableString({}, "t")).toBeUndefined();
    expect(nullableString({ t: null }, "t")).toBeNull();
    expect(nullableString({ t: "abc" }, "t")).toBe("abc");
    await expect(errorOf(() => nullableString({ t: "" }, "t"))).resolves.toBeInstanceOf(IntegrationError);
  });
});
