import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  STATUS_CLASSES,
  PRIORITY_CLASSES,
} from "@/lib/tickets";

// ---------------------------------------------------------------------------
// Tipos de filtros via searchParams
// ---------------------------------------------------------------------------
type PageProps = {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    search?: string;
  }>;
};

export const metadata = { title: "Tickets" };

export default async function TicketsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  const params = await searchParams;

  const statusFilter = params.status;
  const priorityFilter = params.priority;
  const searchQuery = params.search?.trim();

  // Multitenencia: SUPERADMIN ve todo, el resto solo su cliente
  const clientFilter =
    user.roleKey === "SUPERADMIN"
      ? {}
      : { clientId: user.clientId ?? "__none__" };

  const where = {
    ...clientFilter,
    ...(statusFilter ? { status: statusFilter as "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED" } : {}),
    ...(priorityFilter ? { priority: priorityFilter as "LOW" | "MEDIUM" | "HIGH" | "URGENT" } : {}),
    ...(searchQuery
      ? {
          OR: [
            { title: { contains: searchQuery } },
            { folio: { contains: searchQuery } },
          ],
        }
      : {}),
  };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        client: true,
        category: true,
        requester: { select: { name: true } },
        assignee: { select: { name: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ]);

  const canCreate = ["SUPERADMIN", "CLIENT_ADMIN", "AGENT", "CLIENT_USER"].includes(
    user.roleKey
  );

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">

      {/* Header */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tickets</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {total} ticket{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
            </p>
          </div>
          {canCreate && (
            <Link
              href="/tickets/new"
              className="inline-flex items-center gap-2 rounded-xl bg-[#38d84e] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
            >
              + Nuevo ticket
            </Link>
          )}
        </div>
      </section>

      {/* Filtros */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-3">
        <div className="mx-auto max-w-7xl">
          <form method="GET" className="flex flex-wrap items-center gap-3">

            {/* Búsqueda */}
            <input
              name="search"
              defaultValue={searchQuery}
              placeholder="Buscar folio o título..."
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20 w-56"
            />

            {/* Estatus */}
            <select
              name="status"
              defaultValue={statusFilter ?? ""}
              className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50"
            >
              <option value="">Todos los estatus</option>
              {Object.entries(STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>

            {/* Prioridad */}
            <select
              name="priority"
              defaultValue={priorityFilter ?? ""}
              className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50"
            >
              <option value="">Todas las prioridades</option>
              {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>

            <button
              type="submit"
              className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
            >
              Filtrar
            </button>

            {(statusFilter || priorityFilter || searchQuery) && (
              <Link
                href="/tickets"
                className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
              >
                Limpiar
              </Link>
            )}
          </form>
        </div>
      </section>

      {/* Tabla */}
      <section className="mx-auto max-w-7xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-[#111111] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-zinc-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Folio</th>
                  <th className="px-5 py-3 font-medium">Título</th>
                  {user.roleKey === "SUPERADMIN" && (
                    <th className="px-5 py-3 font-medium">Cliente</th>
                  )}
                  <th className="px-5 py-3 font-medium">Categoría</th>
                  <th className="px-5 py-3 font-medium">Asignado a</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Prioridad</th>
                  <th className="px-5 py-3 font-medium text-center">Notas</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={user.roleKey === "SUPERADMIN" ? 8 : 7}
                      className="px-5 py-12 text-center text-zinc-500"
                    >
                      No hay tickets que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="border-t border-white/5 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/tickets/${ticket.id}`}
                          className="font-semibold text-[#7CFF8D] hover:underline"
                        >
                          {ticket.folio}
                        </Link>
                      </td>
                      <td className="px-5 py-3 max-w-xs">
                        <Link
                          href={`/tickets/${ticket.id}`}
                          className="text-white hover:text-[#7CFF8D] transition line-clamp-1"
                        >
                          {ticket.title}
                        </Link>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {ticket.requester.name}
                        </p>
                      </td>
                      {user.roleKey === "SUPERADMIN" && (
                        <td className="px-5 py-3 text-zinc-400 text-xs">
                          {ticket.client.name}
                        </td>
                      )}
                      <td className="px-5 py-3 text-zinc-400 text-xs">
                        {ticket.category.name}
                      </td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">
                        {ticket.assignee?.name ?? (
                          <span className="text-zinc-600 italic">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[ticket.status] ?? ""}`}>
                          {STATUS_LABELS[ticket.status] ?? ticket.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_CLASSES[ticket.priority] ?? ""}`}>
                          {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center text-xs text-zinc-500">
                        {ticket._count.comments}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
