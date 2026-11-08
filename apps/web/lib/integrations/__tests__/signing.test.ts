import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  buildWebhookHeaders,
  EVENT_ID_HEADER,
  sign,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyWebhookSignature,
} from "../signing";

const SECRET = "super-secreto";
const BODY = JSON.stringify({ event_type: "ticket.created", ticket: { folio: "MB-0001" } });
const NOW = new Date("2026-11-07T18:00:00Z");

describe("sign", () => {
  it("es HMAC-SHA256 de timestamp + '.' + body", () => {
    const ts = "1762538400";
    const expected = crypto.createHmac("sha256", SECRET).update(`${ts}.${BODY}`).digest("hex");
    expect(sign(BODY, SECRET, ts)).toBe(expected);
    expect(sign(Buffer.from(BODY), SECRET, ts)).toBe(expected);
  });

  it("cambia con el timestamp (anti replay)", () => {
    expect(sign(BODY, SECRET, "1")).not.toBe(sign(BODY, SECRET, "2"));
  });

  it("exige secreto", () => {
    expect(() => sign(BODY, "", "1")).toThrow();
  });
});

describe("buildWebhookHeaders / verifyWebhookSignature", () => {
  it("genera headers que verifican correctamente", () => {
    const headers = buildWebhookHeaders(BODY, SECRET, "evt-1", NOW);
    expect(headers[EVENT_ID_HEADER]).toBe("evt-1");
    expect(headers[TIMESTAMP_HEADER]).toBe(String(Math.floor(NOW.getTime() / 1000)));
    expect(headers[SIGNATURE_HEADER]).toMatch(/^sha256=[0-9a-f]{64}$/);

    const result = verifyWebhookSignature(
      BODY,
      SECRET,
      { signature: headers[SIGNATURE_HEADER], timestamp: headers[TIMESTAMP_HEADER] },
      { now: NOW }
    );
    expect(result).toEqual({ valid: true });
  });

  it("rechaza un body alterado", () => {
    const headers = buildWebhookHeaders(BODY, SECRET, "evt-1", NOW);
    const result = verifyWebhookSignature(
      BODY.replace("MB-0001", "MB-0002"),
      SECRET,
      { signature: headers[SIGNATURE_HEADER], timestamp: headers[TIMESTAMP_HEADER] },
      { now: NOW }
    );
    expect(result).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rechaza un secreto distinto", () => {
    const headers = buildWebhookHeaders(BODY, SECRET, "evt-1", NOW);
    const result = verifyWebhookSignature(
      BODY,
      "otro-secreto",
      { signature: headers[SIGNATURE_HEADER], timestamp: headers[TIMESTAMP_HEADER] },
      { now: NOW }
    );
    expect(result).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rechaza timestamps fuera de la tolerancia (replay)", () => {
    const headers = buildWebhookHeaders(BODY, SECRET, "evt-1", NOW);
    const later = new Date(NOW.getTime() + 10 * 60_000);
    const result = verifyWebhookSignature(
      BODY,
      SECRET,
      { signature: headers[SIGNATURE_HEADER], timestamp: headers[TIMESTAMP_HEADER] },
      { now: later }
    );
    expect(result).toEqual({ valid: false, reason: "expired" });

    const withinTolerance = verifyWebhookSignature(
      BODY,
      SECRET,
      { signature: headers[SIGNATURE_HEADER], timestamp: headers[TIMESTAMP_HEADER] },
      { now: later, toleranceSeconds: 900 }
    );
    expect(withinTolerance).toEqual({ valid: true });
  });

  it("rechaza headers ausentes o mal formados", () => {
    expect(verifyWebhookSignature(BODY, SECRET, { signature: null, timestamp: "1" })).toEqual({
      valid: false,
      reason: "missing_headers",
    });
    expect(
      verifyWebhookSignature(BODY, SECRET, { signature: "md5=abc", timestamp: "1" }, { now: NOW })
    ).toEqual({ valid: false, reason: "bad_format" });
    expect(
      verifyWebhookSignature(BODY, SECRET, { signature: "sha256=abc", timestamp: "ayer" }, { now: NOW })
    ).toEqual({ valid: false, reason: "bad_format" });
    expect(
      verifyWebhookSignature(
        BODY,
        SECRET,
        { signature: "sha256=abcd", timestamp: String(Math.floor(NOW.getTime() / 1000)) },
        { now: NOW }
      )
    ).toEqual({ valid: false, reason: "mismatch" });
  });
});
