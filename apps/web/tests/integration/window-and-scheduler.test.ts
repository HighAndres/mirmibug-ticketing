/**
 * Cálculo de la ventana de 24 h de Meta y arranque/parada del scheduler del
 * outbox (requiere la BD de pruebas porque el scheduler toca Prisma al iniciar).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isWithin24hWindow } from "@/lib/integrations/conversations";
import { isWithinWindow } from "@/lib/integrations/outbox";
import { startOutboxScheduler, stopOutboxScheduler } from "@/lib/integrations/outbox-scheduler";

const NOW = new Date("2026-11-07T18:00:00Z");
const h = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

describe("ventana de 24 h", () => {
  it("abierta con un mensaje reciente, cerrada a las 24 h exactas o sin mensajes", () => {
    expect(isWithin24hWindow(h(0.5), NOW)).toBe(true);
    expect(isWithin24hWindow(h(23.99), NOW)).toBe(true);
    expect(isWithin24hWindow(h(24), NOW)).toBe(false);
    expect(isWithin24hWindow(h(48), NOW)).toBe(false);
    expect(isWithin24hWindow(null, NOW)).toBe(false);
    expect(isWithin24hWindow(undefined, NOW)).toBe(false);
  });

  it("el outbox usa el mismo cálculo", () => {
    expect(isWithinWindow(h(1), NOW)).toBe(isWithin24hWindow(h(1), NOW));
    expect(isWithinWindow(h(25), NOW)).toBe(false);
  });
});

describe("scheduler del outbox", () => {
  afterEach(() => {
    stopOutboxScheduler();
    vi.useRealTimers();
    process.env.WHATSAPP_INTEGRATION_ENABLED = "true";
  });

  it("no arranca con el flag apagado", () => {
    process.env.WHATSAPP_INTEGRATION_ENABLED = "false";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(startOutboxScheduler()).toBe(false);
    log.mockRestore();
  });

  it("arranca una sola vez con el flag encendido y se puede detener", () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(startOutboxScheduler()).toBe(true);
    expect(startOutboxScheduler()).toBe(false);
    stopOutboxScheduler();
    expect(startOutboxScheduler()).toBe(true);
    log.mockRestore();
  });
});
