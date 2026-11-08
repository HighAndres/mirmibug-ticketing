import { describe, expect, it } from "vitest";
import { isSamePhone, normalizePhone, PhoneValidationError, tryNormalizePhone } from "../phone";

const MX = "+525512345678";

describe("normalizePhone", () => {
  it("acepta 10 dígitos nacionales de México", () => {
    expect(normalizePhone("5512345678")).toBe(MX);
  });

  it("acepta formato internacional con espacios", () => {
    expect(normalizePhone("+52 55 1234 5678")).toBe(MX);
  });

  it("quita el 1 de móvil antiguo que manda WhatsApp (sin +)", () => {
    expect(normalizePhone("5215512345678")).toBe(MX);
  });

  it("quita el 1 de móvil antiguo con +", () => {
    expect(normalizePhone("+5215512345678")).toBe(MX);
  });

  it("acepta 52 + 10 dígitos sin + (formato de la API de Meta)", () => {
    expect(normalizePhone("525512345678")).toBe(MX);
  });

  it("limpia paréntesis, guiones y puntos", () => {
    expect(normalizePhone("(55) 1234-5678")).toBe(MX);
    expect(normalizePhone("55.1234.5678")).toBe(MX);
    expect(normalizePhone("  +52 (55) 1234 5678  ")).toBe(MX);
  });

  it("acepta el prefijo internacional 00", () => {
    expect(normalizePhone("0052 55 1234 5678")).toBe(MX);
  });

  it("lanza PhoneValidationError con un número inválido", () => {
    expect(() => normalizePhone("12345")).toThrow(PhoneValidationError);
    expect(() => normalizePhone("abc")).toThrow(PhoneValidationError);
    expect(() => normalizePhone("")).toThrow(PhoneValidationError);
    expect(() => normalizePhone("   ")).toThrow(PhoneValidationError);
    expect(() => normalizePhone("+52 55 1234")).toThrow(PhoneValidationError);
  });

  it("expone código y entrada original en el error", () => {
    try {
      normalizePhone("abc");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PhoneValidationError);
      expect((err as PhoneValidationError).code).toBe("INVALID_PHONE");
      expect((err as PhoneValidationError).input).toBe("abc");
    }
  });

  it("normaliza números de otros países en E.164", () => {
    expect(normalizePhone("+34 612 345 678")).toBe("+34612345678");
    expect(normalizePhone("+44 7911 123456")).toBe("+447911123456");
  });

  it("respeta la región por defecto cuando se indica otra", () => {
    expect(normalizePhone("612 345 678", "ES")).toBe("+34612345678");
  });
});

describe("tryNormalizePhone", () => {
  it("devuelve null en vez de lanzar", () => {
    expect(tryNormalizePhone("abc")).toBeNull();
    expect(tryNormalizePhone(null)).toBeNull();
    expect(tryNormalizePhone(undefined)).toBeNull();
    expect(tryNormalizePhone("5512345678")).toBe(MX);
  });
});

describe("isSamePhone", () => {
  it("compara tras normalizar", () => {
    expect(isSamePhone("5512345678", "+52 55 1234 5678")).toBe(true);
    expect(isSamePhone("5215512345678", MX)).toBe(true);
    expect(isSamePhone("5512345678", "5512345679")).toBe(false);
    expect(isSamePhone("abc", "abc")).toBe(false);
  });
});
