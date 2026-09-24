/**
 * Catálogo global de categorías y subcategorías.
 *
 * Idempotente: crea lo que falte, actualiza descripciones y fusiona las
 * categorías antiguas indicadas en MERGES reasignando sus tickets y
 * subcategorías. Nunca borra tickets ni comentarios.
 *
 * Uso (desde apps/web, con DATABASE_URL apuntando a la base deseada):
 *   npx tsx prisma/catalog.ts --dry-run   # solo reporta, no escribe
 *   npx tsx prisma/catalog.ts             # aplica los cambios
 */
import { PrismaClient, AuditAction } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const DRY_RUN = process.argv.includes("--dry-run");

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Catálogo objetivo
// ---------------------------------------------------------------------------
type CatalogEntry = { name: string; description: string; subs: string[] };

const CATALOG: CatalogEntry[] = [
  // Soporte y operación
  {
    name: "Soporte técnico",
    description: "Atención a usuarios: accesos, equipos, correo e impresión.",
    subs: ["Acceso y contraseñas", "Equipo de cómputo", "Correo y colaboración", "Impresión", "Consulta general"],
  },
  {
    name: "Infraestructura y redes",
    description: "Servidores, conectividad, respaldos y seguridad.",
    subs: ["Servidores", "Red y VPN", "Respaldos", "Seguridad"],
  },
  {
    name: "Aplicaciones",
    description: "Errores, integraciones y cambios en sistemas en operación.",
    subs: ["Error en sistema", "Falla de integración", "Solicitud de cambio", "Actualización de versión"],
  },
  // Desarrollo de proyectos (ciclo de vida)
  {
    name: "Kick-off",
    description: "Arranque de proyecto: alta, alcance y acuerdos iniciales.",
    subs: ["Alta de proyecto", "Alcance y objetivos", "Acuerdos y contactos"],
  },
  {
    name: "Requerimientos y análisis",
    description: "Levantamiento y definición de lo que se va a construir.",
    subs: ["Levantamiento", "Historias de usuario", "Cambio de alcance"],
  },
  {
    name: "Diseño",
    description: "Diseño de experiencia, arquitectura y datos.",
    subs: ["UX/UI", "Arquitectura", "Base de datos"],
  },
  {
    name: "Desarrollo",
    description: "Construcción de funcionalidad y corrección de defectos.",
    subs: ["Funcionalidad nueva", "Corrección de bug", "Integración", "Deuda técnica"],
  },
  {
    name: "Pruebas y QA",
    description: "Planes de prueba, hallazgos y aceptación del cliente.",
    subs: ["Plan de pruebas", "Hallazgo de QA", "Aceptación (UAT)"],
  },
  {
    name: "Despliegue y liberación",
    description: "Publicación en ambientes de prueba y producción.",
    subs: ["Ambiente de pruebas", "Producción", "Rollback"],
  },
  {
    name: "Documentación y capacitación",
    description: "Manuales y sesiones de capacitación.",
    subs: ["Manual técnico", "Manual de usuario", "Capacitación"],
  },
  {
    name: "Cierre y mantenimiento",
    description: "Entrega, garantía y mejoras posteriores a la liberación.",
    subs: ["Entrega", "Garantía", "Mejora post-liberación"],
  },
];

// ---------------------------------------------------------------------------
// Fusiones de categorías antiguas → nuevas
// ---------------------------------------------------------------------------
type Merge = {
  /** Nombres de categorías antiguas a absorber (si no existen, se omiten) */
  from: string[];
  /** Categoría destino (debe estar en CATALOG) */
  toCategory: string;
  /** Subcategoría destino para tickets que no tenían subcategoría (opcional) */
  toSubcategory?: string;
  /** Renombrar subcategorías antiguas al moverlas: { "nombre viejo": "nombre nuevo" } */
  subRenames?: Record<string, string>;
};

const MERGES: Merge[] = [
  {
    from: ["KICK - OFF", "KickOff"],
    toCategory: "Kick-off",
    subRenames: { "CREACION PROYECTO ABC": "Alta de proyecto" },
  },
  {
    from: ["Actualizaciones"],
    toCategory: "Aplicaciones",
    toSubcategory: "Actualización de versión",
  },
];

// ---------------------------------------------------------------------------

const changes: string[] = [];
function log(msg: string) {
  changes.push(msg);
  console.log((DRY_RUN ? "[dry-run] " : "") + msg);
}

async function audit(description: string, entityType: string, entityId: string | null) {
  if (DRY_RUN) return;
  await prisma.auditLog.create({
    data: {
      action: AuditAction.UPDATE,
      entityType,
      entityId,
      description,
      metadataJson: JSON.stringify({ source: "prisma/catalog.ts" }),
    },
  });
}

async function upsertCatalog() {
  for (const entry of CATALOG) {
    let cat = await prisma.category.findUnique({ where: { name: entry.name } });
    if (!cat) {
      log(`Crear categoría "${entry.name}"`);
      if (!DRY_RUN) {
        cat = await prisma.category.create({ data: { name: entry.name, description: entry.description } });
        await audit(`Categoría "${entry.name}" creada por catálogo`, "Category", cat.id);
      }
    } else if (cat.description !== entry.description) {
      log(`Actualizar descripción de "${entry.name}"`);
      if (!DRY_RUN) {
        await prisma.category.update({ where: { id: cat.id }, data: { description: entry.description } });
      }
    }
    if (!cat) continue; // dry-run sin categoría aún

    for (const subName of entry.subs) {
      const sub = await prisma.subcategory.findUnique({
        where: { categoryId_name: { categoryId: cat.id, name: subName } },
      });
      if (!sub) {
        log(`  Crear subcategoría "${subName}" en "${entry.name}"`);
        if (!DRY_RUN) {
          await prisma.subcategory.create({ data: { name: subName, categoryId: cat.id } });
        }
      }
    }
  }
}

async function applyMerges() {
  for (const merge of MERGES) {
    const target = await prisma.category.findUnique({
      where: { name: merge.toCategory },
      include: { subcategories: true },
    });
    if (!target) {
      log(`(!) Destino "${merge.toCategory}" no existe todavía; en dry-run se creará antes de fusionar`);
      continue;
    }

    const targetSub = merge.toSubcategory
      ? target.subcategories.find((s) => s.name === merge.toSubcategory) ?? null
      : null;
    if (merge.toSubcategory && !targetSub && !DRY_RUN) {
      throw new Error(`Subcategoría destino "${merge.toSubcategory}" no existe en "${merge.toCategory}"`);
    }

    for (const oldName of merge.from) {
      const old = await prisma.category.findUnique({
        where: { name: oldName },
        include: { subcategories: { include: { _count: { select: { tickets: true } } } }, _count: { select: { tickets: true } } },
      });
      if (!old) {
        log(`Categoría antigua "${oldName}" no existe, se omite`);
        continue;
      }
      if (old.id === target.id) continue;

      log(`Fusionar "${oldName}" (${old._count.tickets} tickets, ${old.subcategories.length} subcategorías) → "${merge.toCategory}"`);

      // 1) Subcategorías antiguas: mover (renombrando) o fusionar con una existente
      for (const oldSub of old.subcategories) {
        const newName = merge.subRenames?.[oldSub.name] ?? oldSub.name;
        const existing = await prisma.subcategory.findUnique({
          where: { categoryId_name: { categoryId: target.id, name: newName } },
        });
        if (existing) {
          log(`  Subcategoría "${oldSub.name}" → fusionar con "${merge.toCategory} / ${newName}" (${oldSub._count.tickets} tickets)`);
          if (!DRY_RUN) {
            await prisma.ticket.updateMany({
              where: { subcategoryId: oldSub.id },
              data: { subcategoryId: existing.id, categoryId: target.id },
            });
            await prisma.subcategory.delete({ where: { id: oldSub.id } });
          }
        } else {
          log(`  Subcategoría "${oldSub.name}" → mover como "${merge.toCategory} / ${newName}"`);
          if (!DRY_RUN) {
            await prisma.subcategory.update({
              where: { id: oldSub.id },
              data: { categoryId: target.id, name: newName },
            });
          }
        }
      }

      // 2) Tickets: reasignar categoría (y subcategoría destino a los que no tenían)
      if (!DRY_RUN) {
        const oldTicketIds = (
          await prisma.ticket.findMany({ where: { categoryId: old.id }, select: { id: true } })
        ).map((t) => t.id);
        await prisma.ticket.updateMany({
          where: { id: { in: oldTicketIds } },
          data: { categoryId: target.id },
        });
        if (targetSub) {
          await prisma.ticket.updateMany({
            where: { id: { in: oldTicketIds }, subcategoryId: null },
            data: { subcategoryId: targetSub.id },
          });
        }
      }
      log(`  ${old._count.tickets} tickets reasignados a "${merge.toCategory}"${targetSub ? ` / ${targetSub.name}` : ""}`);

      // 3) Borrar la categoría antigua (ya sin tickets ni subcategorías)
      if (!DRY_RUN) {
        const remaining = await prisma.category.findUnique({
          where: { id: old.id },
          include: { _count: { select: { tickets: true, subcategories: true } } },
        });
        if (remaining && (remaining._count.tickets > 0 || remaining._count.subcategories > 0)) {
          throw new Error(`"${oldName}" aún tiene referencias; se aborta`);
        }
        await prisma.category.delete({ where: { id: old.id } });
        await audit(
          `Categoría "${oldName}" fusionada en "${merge.toCategory}" (${old._count.tickets} tickets reasignados)`,
          "Category",
          old.id
        );
      }
      log(`  Categoría "${oldName}" eliminada`);
    }
  }
}

async function report(label: string) {
  const cats = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { tickets: true, subcategories: true } } },
  });
  const orphans = await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*) AS n FROM Ticket WHERE categoryId NOT IN (SELECT id FROM Category)`;
  const orphanSubs = await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*) AS n FROM Ticket WHERE subcategoryId IS NOT NULL AND subcategoryId NOT IN (SELECT id FROM Subcategory)`;
  const totalTickets = await prisma.ticket.count();
  console.log(`\n== ${label} ==`);
  for (const c of cats) console.log(`  ${c.name}: ${c._count.tickets} tickets, ${c._count.subcategories} subcategorías`);
  console.log(`  categorías: ${cats.length} | tickets: ${totalTickets} | tickets huérfanos: ${Number(orphans[0].n)} | subcat huérfanas: ${Number(orphanSubs[0].n)}`);
}

async function main() {
  console.log(DRY_RUN ? "Modo dry-run: no se escribirá nada.\n" : "Aplicando catálogo...\n");
  await report("Antes");
  await upsertCatalog();
  await applyMerges();
  await report("Después");
  console.log(`\n${changes.length} cambios ${DRY_RUN ? "detectados" : "aplicados"}.`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
