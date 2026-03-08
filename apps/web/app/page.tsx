import { prisma } from "@/lib/prisma";

function getStatusLabel(status: string) {
  switch (status) {
    case "OPEN":
      return "Abierto";
    case "IN_PROGRESS":
      return "En progreso";
    case "PENDING":
      return "Pendiente";
    case "RESOLVED":
      return "Resuelto";
    case "CLOSED":
      return "Cerrado";
    default:
      return status;
  }
}

function getPriorityLabel(priority: string) {
  switch (priority) {
    case "LOW":
      return "Baja";
    case "MEDIUM":
      return "Media";
    case "HIGH":
      return "Alta";
    case "URGENT":
      return "Urgente";
    default:
      return priority;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "OPEN":
      return "bg-blue-500/15 text-blue-300 border border-blue-500/30";
    case "IN_PROGRESS":
      return "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30";
    case "PENDING":
      return "bg-orange-500/15 text-orange-300 border border-orange-500/30";
    case "RESOLVED":
      return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    case "CLOSED":
      return "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30";
  }
}

function getPriorityClasses(priority: string) {
  switch (priority) {
    case "LOW":
      return "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30";
    case "MEDIUM":
      return "bg-sky-500/15 text-sky-300 border border-sky-500/30";
    case "HIGH":
      return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    case "URGENT":
      return "bg-red-500/15 text-red-300 border border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30";
  }
}

export default async function Home() {
  const [
    totalUsers,
    totalTickets,
    totalClients,
    totalCategories,
    totalRoles,
    totalPermissions,
    totalAuditLogs,
    openTickets,
    inProgressTickets,
    resolvedTickets,
    latestTickets,
    latestUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.ticket.count(),
    prisma.clientCompany.count(),
    prisma.category.count(),
    prisma.role.count(),
    prisma.permission.count(),
    prisma.auditLog.count(),
    prisma.ticket.count({ where: { status: "OPEN" } }),
    prisma.ticket.count({ where: { status: "IN_PROGRESS" } }),
    prisma.ticket.count({ where: { status: "RESOLVED" } }),
    prisma.ticket.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        category: true,
        requester: {
          include: {
            role: true,
          },
        },
        assignee: {
          include: {
            role: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        role: true,
        client: true,
      },
    }),
  ]);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <section className="border-b border-white/10 bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0a0a0a]">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 inline-block rounded-full border border-[#38d84e]/30 bg-[#38d84e]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-[#7CFF8D]">
                Mirmibug IT Services
              </p>
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                Dashboard Superadmin
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-zinc-400 md:text-base">
                Vista global del sistema multiempresa, usuarios, roles, permisos,
                tickets y auditoría.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 shadow-lg shadow-black/20 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Estado del sistema
              </p>
              <p className="mt-2 text-lg font-semibold text-[#7CFF8D]">
                Seguridad base + control global listos
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <p className="text-sm text-zinc-400">Usuarios</p>
            <p className="mt-3 text-3xl font-bold">{totalUsers}</p>
            <p className="mt-2 text-xs text-zinc-500">Cuentas registradas</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <p className="text-sm text-zinc-400">Clientes</p>
            <p className="mt-3 text-3xl font-bold">{totalClients}</p>
            <p className="mt-2 text-xs text-zinc-500">Empresas activas</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <p className="text-sm text-zinc-400">Roles</p>
            <p className="mt-3 text-3xl font-bold">{totalRoles}</p>
            <p className="mt-2 text-xs text-zinc-500">Roles administrables</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <p className="text-sm text-zinc-400">Permisos</p>
            <p className="mt-3 text-3xl font-bold">{totalPermissions}</p>
            <p className="mt-2 text-xs text-zinc-500">Permisos granulares</p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-8 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
          <p className="text-sm text-zinc-400">Tickets totales</p>
          <p className="mt-3 text-4xl font-bold">{totalTickets}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
          <p className="text-sm text-zinc-400">Abiertos</p>
          <p className="mt-3 text-4xl font-bold text-blue-300">{openTickets}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
          <p className="text-sm text-zinc-400">En progreso</p>
          <p className="mt-3 text-4xl font-bold text-yellow-300">{inProgressTickets}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
          <p className="text-sm text-zinc-400">Auditorías</p>
          <p className="mt-3 text-4xl font-bold text-emerald-300">{totalAuditLogs}</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
            <h2 className="text-xl font-semibold">Resumen operativo</h2>
            <div className="mt-6 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Tickets abiertos</span>
                  <span className="text-blue-300">{openTickets}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5">
                  <div
                    className="h-2 rounded-full bg-blue-400"
                    style={{ width: `${totalTickets > 0 ? (openTickets / totalTickets) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-zinc-400">En progreso</span>
                  <span className="text-yellow-300">{inProgressTickets}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5">
                  <div
                    className="h-2 rounded-full bg-yellow-400"
                    style={{ width: `${totalTickets > 0 ? (inProgressTickets / totalTickets) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Resueltos</span>
                  <span className="text-emerald-300">{resolvedTickets}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5">
                  <div
                    className="h-2 rounded-full bg-emerald-400"
                    style={{ width: `${totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
            <h2 className="text-xl font-semibold">Usuarios recientes</h2>
            <div className="mt-4 space-y-3">
              {latestUsers.map((user) => (
                <div
                  key={user.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">{user.name}</p>
                      <p className="text-sm text-zinc-400">{user.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-[#7CFF8D]">{user.role.name}</p>
                      <p className="text-xs text-zinc-500">
                        {user.client?.name ?? "Global Mirmibug"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-12">
        <div className="rounded-2xl border border-white/10 bg-[#111111]">
          <div className="flex flex-col gap-2 border-b border-white/10 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Últimos tickets</h2>
              <p className="text-sm text-zinc-400">
                Vista general de tickets para control del superadmin
              </p>
            </div>

            <div className="text-sm text-zinc-500">
              Total mostrados: {latestTickets.length}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-zinc-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Folio</th>
                  <th className="px-6 py-4 font-medium">Título</th>
                  <th className="px-6 py-4 font-medium">Cliente</th>
                  <th className="px-6 py-4 font-medium">Solicitante</th>
                  <th className="px-6 py-4 font-medium">Asignado</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium">Prioridad</th>
                </tr>
              </thead>

              <tbody>
                {latestTickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                      No hay tickets registrados todavía.
                    </td>
                  </tr>
                ) : (
                  latestTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="border-t border-white/5 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-6 py-4 font-semibold text-[#7CFF8D]">
                        {ticket.folio}
                      </td>
                      <td className="px-6 py-4 text-white">{ticket.title}</td>
                      <td className="px-6 py-4 text-zinc-300">{ticket.client.name}</td>
                      <td className="px-6 py-4 text-zinc-300">
                        {ticket.requester.name} · {ticket.requester.role.key}
                      </td>
                      <td className="px-6 py-4 text-zinc-300">
                        {ticket.assignee
                          ? `${ticket.assignee.name} · ${ticket.assignee.role.key}`
                          : "Sin asignar"}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusClasses(ticket.status)}`}>
                          {getStatusLabel(ticket.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getPriorityClasses(ticket.priority)}`}>
                          {getPriorityLabel(ticket.priority)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}