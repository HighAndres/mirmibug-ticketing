import { describe, expect, it } from "vitest";
import { errorResponse, IntegrationError, integrationErrors, jsonResponse } from "../http";

describe("errorResponse / jsonResponse", () => {
  it("usa el formato estándar y respeta status y headers", async () => {
    const res = errorResponse(429, "RATE_LIMITED", "despacio", { headers: { "Retry-After": "60" } });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toEqual({ error: { code: "RATE_LIMITED", message: "despacio" } });

    const withDetails = errorResponse(400, "VALIDATION_ERROR", "x", { details: { field: "phone" } });
    expect((await withDetails.json()).error.details).toEqual({ field: "phone" });

    const ok = jsonResponse({ a: 1 }, { status: 201 });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ a: 1 });
    expect(jsonResponse({}).status).toBe(200);
  });
});

describe("IntegrationError", () => {
  it("se convierte en respuesta con su status y código", async () => {
    const err = new IntegrationError(409, "CONFLICT", "ya existe", { id: "x" });
    expect(err.name).toBe("IntegrationError");
    const res = err.toResponse();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "CONFLICT", message: "ya existe", details: { id: "x" } } });
  });

  it("los atajos producen los códigos esperados", () => {
    expect(integrationErrors.notFound()).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(integrationErrors.validation("m", { field: "f" })).toMatchObject({ status: 400, code: "VALIDATION_ERROR", details: { field: "f" } });
    expect(integrationErrors.contactNotVerified()).toMatchObject({ status: 403, code: "CONTACT_NOT_VERIFIED" });
    expect(integrationErrors.invalidTransition("m")).toMatchObject({ status: 409, code: "INVALID_TRANSITION" });
  });
});
