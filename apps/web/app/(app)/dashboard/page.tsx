import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Image from "next/image";

// ---------------------------------------------------------------------------
// Helpers de etiquetas y estilos (mismos que antes, centralizados aquí)
// ---------------------------------------------------------------------------
function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    OPEN: "Abierto",
    IN_PROGRESS: "En progreso",
    PENDING: "Pendiente",
    RESOLVED: "Resuelto",
    CLOSED: "Cerrado",
  };
  return map[status] ?? status;
}

function getPriorityLabel(priority: string) {
  const map: Record<string, string> = {
    LOW: "Baja",
    MEDIUM: "Media",
    HIGH: "Alta",
    URGENT: "Urgente",
  };
  return map[priority] ?? priority;
}

function getStatusClasses(status: string) {
  const map: Record<string, string> = {
    OPEN: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
    IN_PROGRESS: "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30",
    PENDING: "bg-orange-500/15 text-orange-300 border border-orange-500/30",
    RESOLVED: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    CLOSED: "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
  };
  return map[status] ?? "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30";
}

function getPriorityClasses(priority: string) {
  const map: Record<string, string> = {
    LOW: "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
    MEDIUM: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
    HIGH: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    URGENT: "bg-red-500/15 text-red-300 border border-red-500/30",
  };
  return map[priority] ?? "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30";
}

// ---------------------------------------------------------------------------
// Dashboard — datos filtrados por rol
// ---------------------------------------------------------------------------
export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  const isSuperAdmin = user.roleKey === "SUPERADMIN";

  // Filtro base: SUPERADMIN ve todo, los demás ven solo su cliente
  const clientFilter = isSuperAdmin
    ? {}
    : { clientId: user.clientId ?? "__none__" };

  const [
    totalTickets,
    openTickets,
    inProgressTickets,
    resolvedTickets,
    latestTickets,
    // Solo para SUPERADMIN
    totalUsers,
    totalClients,
    totalRoles,
    totalPermissions,
    totalAuditLogs,
    latestUsers,
  ] = await Promise.all([
    prisma.ticket.count({ where: clientFilter }),
    prisma.ticket.count({ where: { ...clientFilter, status: "OPEN" } }),
    prisma.ticket.count({ where: { ...clientFilter, status: "IN_PROGRESS" } }),
    prisma.ticket.count({ where: { ...clientFilter, status: "RESOLVED" } }),
    prisma.ticket.findMany({
      where: clientFilter,
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        category: true,
        requester: { include: { role: true } },
        assignee: { include: { role: true } },
      },
    }),
    // Solo SUPERADMIN
    isSuperAdmin ? prisma.user.count() : Promise.resolve(0),
    isSuperAdmin ? prisma.clientCompany.count() : Promise.resolve(0),
    isSuperAdmin ? prisma.role.count() : Promise.resolve(0),
    isSuperAdmin ? prisma.permission.count() : Promise.resolve(0),
    isSuperAdmin ? prisma.auditLog.count() : Promise.resolve(0),
    isSuperAdmin
      ? prisma.user.findMany({
          take: 6,
          orderBy: { createdAt: "desc" },
          include: { role: true, client: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">

      {/* Header de sección */}
      <section className="border-b border-white/10 bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0a0a0a]">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-5">
              <Image
                src="/branding/mirmibug-logo-green_sfondo.png"
                alt="Mirmibug"
                width={56}
                height={56}
                className="shrink-0 hidden md:block"
              />
              <div>
                <p className="mb-2 inline-block rounded-full border border-[#38d84e]/30 bg-[#38d84e]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-[#7CFF8D]">
                  {isSuperAdmin ? "Vista global" : user.clientName ?? "Mi empresa"}
                </p>
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Dashboard
                </h1>
                <p className="mt-2 text-sm text-zinc-400">
                  {isSuperAdmin
                    ? "Control global del sistema multiempresa"
                    : `Panel operativo — ${user.clientName}`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Métricas SUPERADMIN */}
      {isSuperAdmin && (
        <section className="mx-auto max-w-7xl px-6 pt-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Usuarios", value: totalUsers, sub: "Cuentas registradas" },
              { label: "Clientes", value: totalClients, sub: "Empresas activas" },
              { label: "Roles", value: totalRoles, sub: "Roles del sistema" },
              { label: "Permisos", value: totalPermissions, sub: "Permisos granulares" },
              { label: "Auditorías", value: totalAuditLogs, sub: "Registros de actividad" },
            ].map((stat: { label: string; value: number; sub: string }) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-[#111111] p-5"
              >
                <p className="text-sm text-zinc-400">{stat.label}</p>
                <p className="mt-3 text-3xl font-bold">{stat.value}</p>
                <p className="mt-1 text-xs text-zinc-500">{stat.sub}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Métricas de tickets */}
      <section className="mx-auto max-w-7xl px-6 pt-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Tickets totales", value: totalTickets, color: "text-white" },
            { label: "Abiertos", value: openTickets, color: "text-blue-300" },
            { label: "En progreso", value: inProgressTickets, color: "text-yellow-300" },
            { label: "Resueltos", value: resolvedTickets, color: "text-emerald-300" },
          ].map((stat: { label: string; value: number; color: string }) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/10 bg-[#111111] p-6"
            >
              <p className="text-sm text-zinc-400">{stat.label}</p>
              <p className={`mt-3 text-4xl font-bold ${stat.color}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Resumen operativo + Usuarios recientes (solo SUPERADMIN) */}
      <section className="mx-auto max-w-7xl px-6 pt-6">
        <div className={`grid gap-6 ${isSuperAdmin ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>

          {/* Barras de progreso */}
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
            <h2 className="text-lg font-semibold">Resumen operativo</h2>
            <div className="mt-6 space-y-4">
              {[
                { label: "Abiertos", value: openTickets, color: "bg-blue-400" },
                { label: "En progreso", value: inProgressTickets, color: "bg-yellow-400" },
                { label: "Resueltos", value: resolvedTickets, color: "bg-emerald-400" },
              ].map((bar: { label: string; value: number; color: string }) => (
                <div key={bar.label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-400">{bar.label}</span>
                    <span className="text-zinc-300">{bar.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5">
                    <div
                      className={`h-2 rounded-full ${bar.color}`}
                      style={{
                        width: `${totalTickets > 0 ? (bar.value / totalTickets) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Usuarios recientes — solo SUPERADMIN */}
          {isSuperAdmin && (
            <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
              <h2 className="text-lg font-semibold">Usuarios recientes</h2>
              <div className="mt-4 space-y-3">
                {latestUsers.map((u: (typeof latestUsers)[number]) => (
                  <div
                    key={u.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">{u.name}</p>
                        <p className="text-xs text-zinc-400">{u.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#7CFF8D]">{u.role.name}</p>
                        <p className="text-xs text-zinc-500">
                          {u.client?.name ?? "Global Mirmibug"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Tabla de últimos tickets */}
      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-2xl border border-white/10 bg-[#111111]">
          <div className="flex flex-col gap-2 border-b border-white/10 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Últimos tickets</h2>
              <p className="text-sm text-zinc-400">
                {isSuperAdmin
                  ? "Vista global de todos los clientes"
                  : "Tickets de tu organización"}
              </p>
            </div>
            <span className="text-sm text-zinc-500">
              Mostrando {latestTickets.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-zinc-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Folio</th>
                  <th className="px-6 py-4 font-medium">Título</th>
                  {isSuperAdmin && (
                    <th className="px-6 py-4 font-medium">Cliente</th>
                  )}
                  <th className="px-6 py-4 font-medium">Solicitante</th>
                  <th className="px-6 py-4 font-medium">Asignado</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium">Prioridad</th>
                </tr>
              </thead>

              <tbody>
                {latestTickets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isSuperAdmin ? 7 : 6}
                      className="px-6 py-8 text-center text-zinc-500"
                    >
                      No hay tickets registrados.
                    </td>
                  </tr>
                ) : (
                  latestTickets.map((ticket: (typeof latestTickets)[number]) => (
                    <tr
                      key={ticket.id}
                      className="border-t border-white/5 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-6 py-4 font-semibold text-[#7CFF8D]">
                        {ticket.folio}
                      </td>
                      <td className="px-6 py-4 text-white">{ticket.title}</td>
                      {isSuperAdmin && (
                        <td className="px-6 py-4 text-zinc-300">
                          {ticket.client.name}
                        </td>
                      )}
                      <td className="px-6 py-4 text-zinc-300">
                        {ticket.requester.name}
                      </td>
                      <td className="px-6 py-4 text-zinc-300">
                        {ticket.assignee?.name ?? "Sin asignar"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusClasses(ticket.status)}`}
                        >
                          {getStatusLabel(ticket.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getPriorityClasses(ticket.priority)}`}
                        >
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
    </div>
  );
}
