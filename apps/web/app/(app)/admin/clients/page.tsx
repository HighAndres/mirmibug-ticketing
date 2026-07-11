import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { toggleClientActive, deleteClient } from "@/lib/actions/admin";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

export const metadata = { title: "Clientes" };

type PageProps = {
  searchParams: Promise<{ search?: string; status?: string }>;
};

export default async function ClientsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  if (user.roleKey !== "SUPERADMIN") redirect("/dashboard");

  const params = await searchParams;
  const search = params.search?.trim();
  const statusFilter = params.status; // "active" | "inactive" | undefined (all)

  const where = {
    ...(search ? { name: { contains: search } } : {}),
    ...(statusFilter === "active"
      ? { isActive: true }
      : statusFilter === "inactive"
      ? { isActive: false }
      : {}),
  };

  const clients = await prisma.clientCompany.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          users: true,
          tickets: true,
        },
      },
    },
  });

  // Get active ticket counts and latest ticket dates per client in parallel
  const clientIds = clients.map((c: (typeof clients)[number]) => c.id);

  const [activeTicketCounts, latestTickets] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["clientId"],
      where: {
        clientId: { in: clientIds },
        status: { in: ["OPEN", "IN_PROGRESS", "PENDING"] },
      },
      _count: { id: true },
    }),
    prisma.ticket.findMany({
      where: { clientId: { in: clientIds } },
      orderBy: { createdAt: "desc" },
      distinct: ["clientId"],
      select: { clientId: true, createdAt: true },
    }),
  ]);

  const activeCountMap = Object.fromEntries(
    activeTicketCounts.map((r: (typeof activeTicketCounts)[number]) => [r.clientId, r._count.id])
  );
  const latestTicketMap = Object.fromEntries(
    latestTickets.map((r: (typeof latestTickets)[number]) => [r.clientId, r.createdAt])
  );

  // Total counts for KPIs
  const totalClients = clients.length;
  const activeClients = clients.filter((c: (typeof clients)[number]) => c.isActive).length;
  const inactiveClients = totalClients - activeClients;
  const totalUsers = clients.reduce((sum: number, c: (typeof clients)[number]) => sum + c._count.users, 0);
  const totalTickets = clients.reduce((sum: number, c: (typeof clients)[number]) => sum + c._count.tickets, 0);

  const hasFilters = !!(search || statusFilter);

  return (
    <div className="min-h-full bg-[#15171c] text-white">
      <section className="border-b border-white/10 bg-[#1c1f26] px-6 py-6">
        <div className="mx-auto max-w-7xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Clientes</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Gestión de empresas y clientes del sistema
            </p>
          </div>
          <Link
            href="/admin/clients/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#38d84e] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
          >
            + Nuevo cliente
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-6 space-y-6">

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#22262e] p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Total clientes</p>
            <p className="mt-2 text-3xl font-bold text-white">{totalClients}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#22262e] p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Activos</p>
            <p className="mt-2 text-3xl font-bold text-emerald-400">{activeClients}</p>
            {inactiveClients > 0 && (
              <p className="mt-1 text-xs text-red-400">{inactiveClients} inactivo{inactiveClients !== 1 ? "s" : ""}</p>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#22262e] p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Total usuarios</p>
            <p className="mt-2 text-3xl font-bold text-sky-400">{totalUsers}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#22262e] p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Total tickets</p>
            <p className="mt-2 text-3xl font-bold text-amber-400">{totalTickets}</p>
          </div>
        </div>

        {/* Search & filters */}
        <div className="flex flex-wrap items-center gap-3">
          <form method="GET" className="flex flex-wrap items-center gap-3">
            <input
              name="search"
              defaultValue={search}
              placeholder="Buscar por nombre..."
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20 w-56"
            />
            <select
              name="status"
              defaultValue={statusFilter ?? ""}
              className="rounded-xl border border-white/10 bg-[#22262e] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50"
            >
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
            <button
              type="submit"
              className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
            >
              Filtrar
            </button>
            {hasFilters && (
              <Link
                href="/admin/clients"
                className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
              >
                Limpiar
              </Link>
            )}
          </form>
        </div>

        {/* Client table */}
        <div className="rounded-2xl border border-white/10 bg-[#22262e] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-zinc-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium text-center">Usuarios</th>
                  <th className="px-5 py-3 font-medium text-center">Tickets</th>
                  <th className="px-5 py-3 font-medium text-center">Activos</th>
                  <th className="px-5 py-3 font-medium">Última actividad</th>
                  <th className="px-5 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-zinc-500">
                      {hasFilters
                        ? "No hay clientes que coincidan con los filtros."
                        : "No hay clientes registrados."}
                    </td>
                  </tr>
                ) : (
                  clients.map((c: (typeof clients)[number]) => {
                    const activeCount = activeCountMap[c.id] ?? 0;
                    const lastActivity = latestTicketMap[c.id];

                    return (
                      <tr
                        key={c.id}
                        className="border-t border-white/5 transition hover:bg-white/[0.03]"
                      >
                        {/* Client name + slug + email */}
                        <td className="px-5 py-3">
                          <Link
                            href={`/admin/clients/${c.id}`}
                            className="font-medium text-white hover:text-[#7CFF8D] transition"
                          >
                            {c.name}
                          </Link>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-zinc-600 font-mono">{c.slug}</span>
                            {c.contactEmail && (
                              <>
                                <span className="text-zinc-700">·</span>
                                <span className="text-xs text-zinc-500">{c.contactEmail}</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3">
                          {c.isActive ? (
                            <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
                              Inactivo
                            </span>
                          )}
                        </td>

                        {/* Users */}
                        <td className="px-5 py-3 text-center">
                          <span className="text-sm font-semibold text-white">{c._count.users}</span>
                        </td>

                        {/* Total tickets */}
                        <td className="px-5 py-3 text-center">
                          <span className="text-sm font-semibold text-white">{c._count.tickets}</span>
                        </td>

                        {/* Active tickets */}
                        <td className="px-5 py-3 text-center">
                          {activeCount > 0 ? (
                            <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                              {activeCount}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-600">0</span>
                          )}
                        </td>

                        {/* Last activity */}
                        <td className="px-5 py-3">
                          {lastActivity ? (
                            <span className="text-xs text-zinc-400">
                              {new Intl.DateTimeFormat("es-MX", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              }).format(new Date(lastActivity))}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-600 italic">Sin actividad</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/admin/clients/${c.id}`}
                              className="text-xs text-[#7CFF8D] hover:text-[#38d84e] transition"
                            >
                              Ver
                            </Link>
                            <Link
                              href={`/admin/clients/${c.id}/edit`}
                              className="text-xs text-zinc-400 hover:text-white transition"
                            >
                              Editar
                            </Link>
                            <form action={toggleClientActive.bind(null, c.id)}>
                              <button
                                type="submit"
                                className={`text-xs transition ${
                                  c.isActive
                                    ? "text-red-400 hover:text-red-300"
                                    : "text-emerald-400 hover:text-emerald-300"
                                }`}
                              >
                                {c.isActive ? "Desactivar" : "Activar"}
                              </button>
                            </form>
                            <ConfirmDeleteButton
                              action={deleteClient.bind(null, c.id)}
                              confirmMessage={`¿Borrar permanentemente el cliente "${c.name}"? Se eliminarán también sus categorías. Esta acción no se puede deshacer.`}
                              disabledReason={
                                c._count.users === 0 && c._count.tickets === 0
                                  ? undefined
                                  : "No se puede borrar: tiene usuarios o tickets. Desactívalo en su lugar."
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
