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
    sort?: string;
    period?: string;
    assigneeId?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 25;

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
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
  const sort = params.sort ?? "newest";
  const period = params.period ?? "all";
  const assigneeId = params.assigneeId;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));

  // ── Multitenencia ──────────────────────────────────────────────────────────
  // CLIENT_USER: solo sus propios tickets
  // Los demás roles del cliente: todos los tickets de su empresa
  // SUPERADMIN: todo
  const clientFilter =
    user.roleKey === "SUPERADMIN"
      ? {}
      : user.roleKey === "CLIENT_USER"
      ? { clientId: user.clientId ?? "__none__", requesterId: user.id }
      : { clientId: user.clientId ?? "__none__" };

  // ── Filtro de período ──────────────────────────────────────────────────────
  const now = new Date();
  let periodFilter: { gte: Date } | undefined;
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    periodFilter = { gte: start };
  } else if (period === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    periodFilter = { gte: start };
  } else if (period === "month") {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    periodFilter = { gte: start };
  }

  // ── Ordenamiento ───────────────────────────────────────────────────────────
  // "priority" se maneja post-fetch; el resto usa orderBy de Prisma
  const orderBy =
    sort === "oldest"
      ? { createdAt: "asc" as const }
      : sort === "updated"
      ? { updatedAt: "desc" as const }
      : { createdAt: "desc" as const }; // newest + priority default

  const where = {
    ...clientFilter,
    ...(statusFilter
      ? { status: statusFilter as "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED" }
      : {}),
    ...(priorityFilter
      ? { priority: priorityFilter as "LOW" | "MEDIUM" | "HIGH" | "URGENT" }
      : {}),
    ...(assigneeId === "unassigned"
      ? { assigneeId: null }
      : assigneeId
      ? { assigneeId }
      : {}),
    ...(periodFilter ? { createdAt: periodFilter } : {}),
    ...(searchQuery
      ? {
          OR: [
            { title: { contains: searchQuery } },
            { folio: { contains: searchQuery } },
          ],
        }
      : {}),
  };

  const [rawTickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        client: { select: { name: true } },
        category: { select: { name: true } },
        requester: { select: { name: true } },
        assignee: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ]);

  // Post-sort for priority
  const tickets =
    sort === "priority"
      ? [...rawTickets].sort(
          (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
        )
      : rawTickets;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Agentes disponibles para filtro (no para CLIENT_USER) ──────────────────
  const canFilterAssignee = user.roleKey !== "CLIENT_USER";
  const agents = canFilterAssignee
    ? await prisma.user.findMany({
        where:
          user.roleKey === "SUPERADMIN"
            ? { role: { key: { in: ["AGENT", "CLIENT_ADMIN", "SUPERADMIN"] } } }
            : { clientId: user.clientId ?? "__none__", role: { key: { in: ["AGENT", "CLIENT_ADMIN", "CLIENT_SUPERVISOR"] } } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const canCreate = ["SUPERADMIN", "CLIENT_ADMIN", "AGENT", "CLIENT_USER", "CLIENT_SUPERVISOR"].includes(
    user.roleKey
  );

  // ── Helpers para mantener filtros en links de paginación ──────────────────
  function buildQuery(overrides: Record<string, string | undefined>) {
    const merged = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
      ...(searchQuery ? { search: searchQuery } : {}),
      ...(sort !== "newest" ? { sort } : {}),
      ...(period !== "all" ? { period } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      page: String(page),
      ...overrides,
    };
    const qs = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v !== undefined && v !== "") as [string, string][]
    ).toString();
    return qs ? `/tickets?${qs}` : "/tickets";
  }

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
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20 w-52"
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

            {/* Período */}
            <select
              name="period"
              defaultValue={period}
              className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50"
            >
              <option value="all">Todo el tiempo</option>
              <option value="today">Hoy</option>
              <option value="week">Últimos 7 días</option>
              <option value="month">Últimos 30 días</option>
            </select>

            {/* Ordenar */}
            <select
              name="sort"
              defaultValue={sort}
              className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50"
            >
              <option value="newest">Más recientes</option>
              <option value="oldest">Más antiguos</option>
              <option value="updated">Actualización reciente</option>
              <option value="priority">Mayor prioridad</option>
            </select>

            {/* Asignado a (solo para roles que pueden ver) */}
            {canFilterAssignee && (
              <select
                name="assigneeId"
                defaultValue={assigneeId ?? ""}
                className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50"
              >
                <option value="">Cualquier asignado</option>
                <option value="unassigned">Sin asignar</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}

            <button
              type="submit"
              className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
            >
              Filtrar
            </button>

            {(statusFilter || priorityFilter || searchQuery || period !== "all" || sort !== "newest" || assigneeId) && (
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
                  <th className="px-5 py-3 font-medium">Creado</th>
                  <th className="px-5 py-3 font-medium text-center">Notas</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={user.roleKey === "SUPERADMIN" ? 9 : 8}
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
                      <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">
                        {new Intl.DateTimeFormat("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(ticket.createdAt))}
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

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
            <span>
              Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
            </span>
            <div className="flex items-center gap-2">
              {page > 1 && (
                <Link
                  href={buildQuery({ page: String(page - 1) })}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-400 transition hover:border-white/20 hover:text-white"
                >
                  ← Anterior
                </Link>
              )}
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                return (
                  <Link
                    key={p}
                    href={buildQuery({ page: String(p) })}
                    className={`rounded-lg border px-3 py-1.5 transition ${
                      p === page
                        ? "border-[#38d84e]/50 bg-[#38d84e]/10 text-[#38d84e]"
                        : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {p}
                  </Link>
                );
              })}
              {page < totalPages && (
                <Link
                  href={buildQuery({ page: String(page + 1) })}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-400 transition hover:border-white/20 hover:text-white"
                >
                  Siguiente →
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
