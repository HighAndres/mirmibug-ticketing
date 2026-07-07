import { prisma } from "@/lib/prisma";

/**
 * Genera el siguiente folio para un ticket.
 * Usa el prefijo personalizado del cliente (ticketPrefix) o "MB" por defecto.
 * Formato: PREFIX-NNNN (ej: DEMO-0001, ACME-0042)
 * El contador es independiente por prefijo para evitar colisiones.
 */
export async function generateFolio(clientId: string): Promise<string> {
  // Obtener el prefijo del cliente
  const client = await prisma.clientCompany.findUnique({
    where: { id: clientId },
    select: { ticketPrefix: true },
  });

  const prefix = client?.ticketPrefix?.toUpperCase().trim() || "MB";

  // Buscar el máximo numérico entre los folios con este prefijo.
  // No se puede ordenar por folio como texto: "MB-10000" < "MB-9999" alfabéticamente.
  const rows = await prisma.ticket.findMany({
    where: { folio: { startsWith: `${prefix}-` } },
    select: { folio: true },
  });

  let max = 0;
  for (const { folio } of rows) {
    const num = parseInt(folio.slice(prefix.length + 1), 10);
    if (!isNaN(num) && num > max) max = num;
  }

  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Helpers de presentación (reutilizados en lista y detalle)
// ---------------------------------------------------------------------------
export const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  PENDING: "Pendiente",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const STATUS_CLASSES: Record<string, string> = {
  OPEN: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  IN_PROGRESS: "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30",
  PENDING: "bg-orange-500/15 text-orange-300 border border-orange-500/30",
  RESOLVED: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  CLOSED: "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
};

export const PRIORITY_CLASSES: Record<string, string> = {
  LOW: "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
  MEDIUM: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  HIGH: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  URGENT: "bg-red-500/15 text-red-300 border border-red-500/30",
};
