import { describe, expect, it } from "vitest";
import {
  isIntegrationScope,
  isOutboxEventType,
  parseConversationContext,
  parseEventTypes,
  parseOutboxPayload,
  parseScopes,
  serializeConversationContext,
  serializeEventTypes,
  serializeScopes,
} from "../types";

describe("scopes", () => {
  it("reconoce scopes válidos y descarta desconocidos o basura", () => {
    expect(isIntegrationScope("tickets:write")).toBe(true);
    expect(isIntegrationScope("admin:*")).toBe(false);
    expect(isIntegrationScope(42)).toBe(false);
    expect(parseScopes('["tickets:read","nope",3,"tickets:write"]')).toEqual(["tickets:read", "tickets:write"]);
    expect(parseScopes("{no es array}")).toEqual([]);
    expect(parseScopes(null)).toEqual([]);
  });

  it("serializa sin duplicados", () => {
    expect(JSON.parse(serializeScopes(["tickets:read", "tickets:read", "contacts:read"]))).toEqual([
      "tickets:read",
      "contacts:read",
    ]);
  });
});

describe("event types", () => {
  it("filtra y serializa", () => {
    expect(isOutboxEventType("ticket.created")).toBe(true);
    expect(isOutboxEventType("ticket.deleted")).toBe(false);
    expect(parseEventTypes('["ticket.created","ticket.deleted"]')).toEqual(["ticket.created"]);
    expect(JSON.parse(serializeEventTypes(["ticket.assigned", "ticket.assigned"]))).toEqual(["ticket.assigned"]);
  });
});

describe("conversation context", () => {
  it("devuelve {} ante null, basura o arrays", () => {
    expect(parseConversationContext(null)).toEqual({});
    expect(parseConversationContext("not json")).toEqual({});
    expect(parseConversationContext("[1,2]")).toEqual({});
  });

  it("hace round-trip", () => {
    const ctx = { draftTitle: "x", offeredTicketIds: ["a"], extra: 1 };
    expect(parseConversationContext(serializeConversationContext(ctx))).toEqual(ctx);
  });
});

describe("parseOutboxPayload", () => {
  it("acepta un payload con lo mínimo y rechaza los incompletos", () => {
    const ok = JSON.stringify({ event_type: "ticket.created", ticket: { id: "t" }, contact: { id: "c" } });
    expect(parseOutboxPayload(ok)?.event_type).toBe("ticket.created");
    expect(parseOutboxPayload(JSON.stringify({ event_type: "ticket.created" }))).toBeNull();
    expect(parseOutboxPayload(JSON.stringify({ event_type: "nope", ticket: {}, contact: {} }))).toBeNull();
    expect(parseOutboxPayload("x")).toBeNull();
    expect(parseOutboxPayload("null")).toBeNull();
  });
});
