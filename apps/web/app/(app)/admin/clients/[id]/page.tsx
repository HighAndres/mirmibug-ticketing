import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  STATUS_CLASSES,
  PRIORITY_CLASSES,
} from "@/lib/tickets";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.clientCompany.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: client ? `${client.name} — Clientes` : "Cliente" };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.roleKey !== "SUPERADMIN") redirect("/dashboard");

  const { id } = await params;

  const client = await prisma.clientCompany.findUnique({
    where: { id },
    include: {
      _count: {
        select: { users: true, tickets: true, categories: true },
      },
    },
  });

  if (!client) notFound();

  // ── Queries paralelas ──────────────────────────────────────────────
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const [
    activeTickets,
    resolvedToday,
    unassignedTickets,
    thisWeekTickets,
    byStatus,
    byPriority,
    users,
    recentTickets,
  ] = await Promise.all([
    prisma.ticket.count({
      where: { clientId: id, status: { in: ["OPEN", "IN_PROGRESS", "PENDING"] } },
    }),
    prisma.ticket.count({
      where: { clientId: id, status: "RESOLVED", updatedAt: { gte: todayStart } },
    }),
    prisma.ticket.count({
      where: { clientId: id, assigneeId: null },
    }),
    prisma.ticket.count({
      where: { clientId: id, createdAt: { gte: weekStart } },
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      where: { clientId: id },
      _count: { id: true },
    }),
    prisma.ticket.groupBy({
      by: ["priority"],
      where: { clientId: id },
      _count: { id: true },
    }),
    prisma.user.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      include: { role: { select: { name: true, key: true } } },
    }),
    prisma.ticket.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        requester: { select: { name: true } },
        assignee: { select: { name: true } },
        category: { select: { name: true } },
      },
    }),
  ]);

  const totalTickets = client._count.tickets;

  // Role counts
  const roleCounts = users.reduce((acc: Record<string, number>, u: (typeof users)[number]) => {
    const key = u.role.key;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const ROLE_COLORS: Record<string, string> = {
    CLIENT_ADMIN: "text-purple-400 bg-purple-500/10",
    AGENT: "text-sky-400 bg-sky-500/10",
    CLIENT_SUPERVISOR: "text-amber-400 bg-amber-500/10",
    CLIENT_USER: "text-zinc-400 bg-zinc-500/10",
  };

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      {/* Header */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-3">
            <Link href="/admin/clients" className="hover:text-zinc-300 transition">
              Clientes
            </Link>
            <span>/</span>
            <span className="text-zinc-300">{client.name}</span>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {/* Logo or initials */}
              {client.logoUrl ? (
                <img
                  src={client.logoUrl}
                  alt={client.name}
                  className="h-12 w-12 rounded-xl object-contain bg-white/5 border border-white/10 p-1"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#38d84e]/10 border border-[#38d84e]/20 text-lg font-bold text-[#38d84e]">
                  {client.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{client.name}</h1>
                  {client.isActive ? (
                    <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
                      Inactivo
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                  <span className="font-mono">{client.slug}</span>
                  {client.contactEmail && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span>{client.contactEmail}</span>
                    </>
                  )}
                  {client.supportPhone && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span>{client.supportPhone}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/admin/clients/${id}/edit`}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
              >
                Editar
              </Link>
              <Link
                href={`/admin/clients/${id}/branding`}
                className="rounded-xl border border-[#38d84e]/30 px-4 py-2 text-sm text-[#7CFF8D] transition hover:bg-[#38d84e]/10"
              >
                Personalizar
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-6 space-y-6">

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Total tickets</p>
            <p className="mt-1 text-2xl font-bold text-white">{totalTickets}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Activos</p>
            <p className="mt-1 text-2xl font-bold text-amber-400">{activeTickets}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Resueltos hoy</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">{resolvedToday}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Sin asignar</p>
            <p className={`mt-1 text-2xl font-bold ${unassignedTickets > 0 ? "text-red-400" : "text-zinc-500"}`}>
              {unassignedTickets}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Esta semana</p>
            <p className="mt-1 text-2xl font-bold text-sky-400">{thisWeekTickets}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Usuarios</p>
            <p className="mt-1 text-2xl font-bold text-purple-400">{users.length}</p>
          </div>
        </div>

        {/* Status & Priority distributions */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* By status */}
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Tickets por estado</h2>
            {byStatus.length === 0 ? (
              <p className="text-sm text-zinc-600 italic">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {byStatus.map((s: (typeof byStatus)[number]) => (
                  <div key={s.status} className="flex items-center gap-3">
                    <span
                      className={`inline-flex w-28 flex-shrink-0 justify-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_CLASSES[s.status] ?? ""
                      }`}
                    >
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    <div className="flex flex-1 items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full bg-[#38d84e] rounded-full"
                          style={{
                            width: totalTickets
                              ? `${(s._count.id / totalTickets) * 100}%`
                              : "0%",
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-white w-8 text-right">
                        {s._count.id}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* By priority */}
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Tickets por prioridad</h2>
            {byPriority.length === 0 ? (
              <p className="text-sm text-zinc-600 italic">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {byPriority.map((p: (typeof byPriority)[number]) => (
                  <div key={p.priority} className="flex items-center gap-3">
                    <span
                      className={`inline-flex w-28 flex-shrink-0 justify-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        PRIORITY_CLASSES[p.priority] ?? ""
                      }`}
                    >
                      {PRIORITY_LABELS[p.priority] ?? p.priority}
                    </span>
                    <div className="flex flex-1 items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full bg-[#38d84e] rounded-full"
                          style={{
                            width: totalTickets
                              ? `${(p._count.id / totalTickets) * 100}%`
                              : "0%",
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-white w-8 text-right">
                        {p._count.id}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Users section */}
        <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-300">Usuarios del cliente</h2>
              <div className="flex items-center gap-2 mt-1">
                {Object.entries(roleCounts).map(([role, count]) => (
                  <span
                    key={role}
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role] ?? "text-zinc-400 bg-zinc-500/10"}`}
                  >
                    {count} {role.replace("CLIENT_", "").toLowerCase()}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {users.length === 0 ? (
            <p className="text-sm text-zinc-600 italic">No hay usuarios registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">Nombre</th>
                    <th className="pb-2 pr-4 font-medium">Email</th>
                    <th className="pb-2 pr-4 font-medium">Rol</th>
                    <th className="pb-2 pr-4 font-medium">Estado</th>
                    <th className="pb-2 font-medium">Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: (typeof users)[number]) => (
                    <tr
                      key={u.id}
                      className="border-t border-white/5"
                    >
                      <td className="py-2.5 pr-4 font-medium text-white">{u.name}</td>
                      <td className="py-2.5 pr-4 text-xs text-zinc-400">{u.email}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role.key] ?? "text-zinc-400 bg-zinc-500/10"}`}
                        >
                          {u.role.name}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {u.isActive ? (
                          <span className="text-xs text-emerald-400">Activo</span>
                        ) : (
                          <span className="text-xs text-red-400">Inactivo</span>
                        )}
                      </td>
                      <td className="py-2.5 text-xs text-zinc-500">
                        {new Intl.DateTimeFormat("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(u.createdAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent tickets */}
        <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300">Tickets recientes</h2>
            <Link
              href={`/tickets`}
              className="text-xs text-[#7CFF8D] hover:text-[#38d84e] transition"
            >
              Ver todos →
            </Link>
          </div>

          {recentTickets.length === 0 ? (
            <p className="text-sm text-zinc-600 italic">No hay tickets.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">Folio</th>
                    <th className="pb-2 pr-4 font-medium">Título</th>
                    <th className="pb-2 pr-4 font-medium">Categoría</th>
                    <th className="pb-2 pr-4 font-medium">Solicitante</th>
                    <th className="pb-2 pr-4 font-medium">Asignado</th>
                    <th className="pb-2 pr-4 font-medium">Estado</th>
                    <th className="pb-2 pr-4 font-medium">Prioridad</th>
                    <th className="pb-2 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTickets.map((t: (typeof recentTickets)[number]) => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="py-2.5 pr-4">
                        <Link
                          href={`/tickets/${t.id}`}
                          className="font-semibold text-[#7CFF8D] hover:underline"
                        >
                          {t.folio}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 max-w-[200px]">
                        <Link
                          href={`/tickets/${t.id}`}
                          className="text-white hover:text-[#7CFF8D] transition line-clamp-1"
                        >
                          {t.title}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-zinc-400">{t.category.name}</td>
                      <td className="py-2.5 pr-4 text-xs text-zinc-400">{t.requester.name}</td>
                      <td className="py-2.5 pr-4 text-xs text-zinc-400">
                        {t.assignee?.name ?? (
                          <span className="text-zinc-600 italic">Sin asignar</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[t.status] ?? ""}`}
                        >
                          {STATUS_LABELS[t.status] ?? t.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_CLASSES[t.priority] ?? ""}`}
                        >
                          {PRIORITY_LABELS[t.priority] ?? t.priority}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-zinc-500 whitespace-nowrap">
                        {new Intl.DateTimeFormat("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(t.createdAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Client info card */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Información del cliente</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Email de contacto</dt>
                <dd className="text-zinc-300">{client.contactEmail ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Teléfono de soporte</dt>
                <dd className="text-zinc-300">{client.supportPhone ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Email de soporte</dt>
                <dd className="text-zinc-300">{client.supportEmail ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Dirección</dt>
                <dd className="text-zinc-300">{client.address ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Zona horaria</dt>
                <dd className="text-zinc-300">{client.timezone ?? "America/Mexico_City"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">SLA (horas)</dt>
                <dd className="text-zinc-300">{client.slaHours ?? 8}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Configuración visual</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <dt className="text-zinc-500">Color primario</dt>
                <dd className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded-full border border-white/10"
                    style={{ backgroundColor: client.primaryColor ?? "#38d84e" }}
                  />
                  <span className="text-zinc-300 font-mono text-xs">
                    {client.primaryColor ?? "#38d84e"}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-zinc-500">Color acento</dt>
                <dd className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded-full border border-white/10"
                    style={{ backgroundColor: client.accentColor ?? "#7CFF8D" }}
                  />
                  <span className="text-zinc-300 font-mono text-xs">
                    {client.accentColor ?? "#7CFF8D"}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Logo</dt>
                <dd className="text-zinc-300">
                  {client.logoUrl ? "Configurado" : "Sin logo"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Texto de bienvenida</dt>
                <dd className="text-zinc-300 text-right max-w-[200px] truncate">
                  {client.welcomeText ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Categorías</dt>
                <dd className="text-zinc-300">{client._count.categories}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Creado</dt>
                <dd className="text-zinc-300">
                  {new Intl.DateTimeFormat("es-MX", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  }).format(new Date(client.createdAt))}
                </dd>
              </div>
            </dl>
          </div>
        </div>

      </section>
    </div>
  );
}
