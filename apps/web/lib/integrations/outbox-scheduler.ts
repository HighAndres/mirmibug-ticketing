/**
 * Scheduler del outbox dentro del propio proceso de Next.
 *
 * No hay sistema de workers en el stack y producción es una sola instancia
 * bajo PM2 con SQLite, así que un bucle en el mismo proceso evita un segundo
 * escritor sobre la misma BD. Lo arranca instrumentation.ts (runtime nodejs).
 *
 * Se protege contra dobles arranques (HMR en dev) con una marca global y el
 * timer lleva unref() para no mantener vivo el proceso en scripts/tests.
 */
import { getIntegrationConfig, isWhatsappIntegrationEnabled } from "./config";
import { dispatchPending, ensureEnvWebhookEndpoint } from "./outbox-dispatcher";

const GLOBAL_KEY = Symbol.for("mirmibug.outboxScheduler");

type SchedulerState = { timer: NodeJS.Timeout | null; started: boolean };

function state(): SchedulerState {
  const g = globalThis as unknown as Record<symbol, SchedulerState | undefined>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { timer: null, started: false };
  return g[GLOBAL_KEY]!;
}

export function startOutboxScheduler(): boolean {
  const s = state();
  if (s.started) return false;
  if (!isWhatsappIntegrationEnabled()) {
    console.log("[outbox] integración WhatsApp desactivada; scheduler no iniciado");
    return false;
  }

  const { outboxPollIntervalSeconds } = getIntegrationConfig();
  s.started = true;

  const tick = async () => {
    try {
      const stats = await dispatchPending();
      if (stats.claimed > 0) {
        console.log(
          `[outbox] entregados=${stats.delivered} fallidos=${stats.failed} dead=${stats.dead} (reclamados ${stats.claimed})`
        );
      }
    } catch (err) {
      console.error("[outbox] error en la pasada del scheduler:", err);
    }
  };

  ensureEnvWebhookEndpoint()
    .then((ep) => {
      if (ep) console.log(`[outbox] webhook endpoint activo: ${ep.name} → ${ep.url}`);
    })
    .catch((err: unknown) => console.error("[outbox] no se pudo registrar el endpoint de .env:", err))
    .finally(() => void tick());

  s.timer = setInterval(() => void tick(), outboxPollIntervalSeconds * 1000);
  s.timer.unref?.();
  console.log(`[outbox] scheduler iniciado (cada ${outboxPollIntervalSeconds}s)`);
  return true;
}

export function stopOutboxScheduler(): void {
  const s = state();
  if (s.timer) clearInterval(s.timer);
  s.timer = null;
  s.started = false;
}
