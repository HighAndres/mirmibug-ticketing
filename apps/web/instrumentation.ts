/**
 * Hook de arranque de Next.js (se ejecuta una vez por instancia del servidor).
 * Arranca el scheduler del outbox solo en el runtime Node (no en edge ni
 * durante `next build`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startOutboxScheduler } = await import("./lib/integrations/outbox-scheduler");
  startOutboxScheduler();
}
