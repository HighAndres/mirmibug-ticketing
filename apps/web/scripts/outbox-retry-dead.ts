/**
 * Reprocesa eventos DEAD del outbox.
 *
 * Uso (desde apps/web, con DATABASE_URL y SETTINGS_ENC_KEY en .env):
 *   npx tsx scripts/outbox-retry-dead.ts                 # resumen + reprograma todos los DEAD
 *   npx tsx scripts/outbox-retry-dead.ts --dry-run       # solo muestra el resumen
 *   npx tsx scripts/outbox-retry-dead.ts --ids id1,id2   # solo esos eventos (DEAD o FAILED)
 *   npx tsx scripts/outbox-retry-dead.ts --dispatch      # además intenta entregarlos ahora mismo
 */
import "dotenv/config";

const DRY_RUN = process.argv.includes("--dry-run");
const DISPATCH = process.argv.includes("--dispatch");
const idsArg = process.argv.find((a) => a.startsWith("--ids="));
const ids = idsArg ? idsArg.slice("--ids=".length).split(",").map((s) => s.trim()).filter(Boolean) : undefined;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL no está definida. Ejecuta desde apps/web.");
    process.exit(1);
  }
  // Import dinámico para que .env ya esté cargado cuando se construya el cliente Prisma
  const { outboxSummary, retryEvents, dispatchPending } = await import("../lib/integrations/outbox-dispatcher");
  const { prisma } = await import("../lib/prisma");

  const before = await outboxSummary();
  console.log("Outbox:", before);

  const dead = await prisma.eventOutbox.findMany({
    where: ids ? { id: { in: ids } } : { status: "DEAD" },
    orderBy: { createdAt: "asc" },
    select: { id: true, eventType: true, aggregateId: true, attempts: true, lastError: true, createdAt: true },
  });
  for (const e of dead) {
    console.log(`- ${e.id} ${e.eventType} ticket=${e.aggregateId} intentos=${e.attempts} ${e.createdAt.toISOString()}`);
    if (e.lastError) console.log(`    último error: ${e.lastError}`);
  }

  if (DRY_RUN) {
    console.log("(dry-run: no se cambió nada)");
    await prisma.$disconnect();
    return;
  }

  const count = await retryEvents({ ids });
  console.log(`Reprogramados ${count} evento(s) a PENDING.`);

  if (DISPATCH && count > 0) {
    process.env.WHATSAPP_INTEGRATION_ENABLED ??= "true";
    const stats = await dispatchPending({ limit: count });
    console.log(`Entrega inmediata: entregados=${stats.delivered} fallidos=${stats.failed} dead=${stats.dead}`);
    for (const o of stats.outcomes) {
      if (o.error) console.log(`  ${o.eventId}: ${o.status} (${o.error})`);
    }
  }

  console.log("Outbox:", await outboxSummary());
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
