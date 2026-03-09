import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { STATUS_LABELS, PRIORITY_LABELS, STATUS_CLASSES, PRIORITY_CLASSES } from "@/lib/tickets";

export const metadata = { title: "Reportes" };

export default async function ReportsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  if (!["SUPERADMIN", "CLIENT_ADMIN", "AGENT", "CLIENT_SUPERVISOR"].includes(user.roleKey)) {
    redirect("/dashboard");
  }

  const clientFilter =
    user.roleKey === "SUPERADMIN" ? {} : { clientId: user.clientId ?? "__none__" };

  // ── Rango de fechas ────────────────────────────────────────────────────────
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(thisWeekStart.getDate() - 7);

  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(lastWeekStart.getDate() - 14);
  const lastWeekEnd = new Date(thisWeekStart);

  // ── Queries paralelas ──────────────────────────────────────────────────────
  const [
    byStatus,
    byPriority,
    totalTickets,
    activeTickets,
    resolvedToday,
    unassignedTickets,
    thisWeekTickets,
    lastWeekTickets,
    byAssigneeRaw,
  ] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], where: clientFilter, _count: { id: true } }),
    prisma.ticket.groupBy({ by: ["priority"], where: clientFilter, _count: { id: true } }),
    prisma.ticket.count({ where: clientFilter }),
    prisma.ticket.count({
      where: { ...clientFilter, status: { in: ["OPEN", "IN_PROGRESS", "PENDING"] } },
    }),
    prisma.ticket.count({
      where: { ...clientFilter, status: "RESOLVED", updatedAt: { gte: todayStart } },
    }),
    prisma.ticket.count({
      where: { ...clientFilter, assigneeId: null },
    }),
    prisma.ticket.count({
      where: { ...clientFilter, createdAt: { gte: thisWeekStart } },
    }),
    prisma.ticket.count({
      where: { ...clientFilter, createdAt: { gte: lastWeekStart, lt: lastWeekEnd } },
    }),
    // Tickets por agente asignado (solo top 10)
    prisma.ticket.groupBy({
      by: ["assigneeId"],
      where: { ...clientFilter, assigneeId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
  ]);

  // Cargar nombres de los agentes
  const agentIds = byAssigneeRaw
    .map((r) => r.assigneeId)
    .filter(Boolean) as string[];

  const agentNames = agentIds.length
    ? await prisma.user.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true },
      })
    : [];

  const agentNameMap = Object.fromEntries(agentNames.map((a) => [a.id, a.name]));

  const byAssignee = byAssigneeRaw.map((r) => ({
    name: agentNameMap[r.assigneeId!] ?? "Desconocido",
    count: r._count.id,
  }));

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const weekDelta = thisWeekTickets - lastWeekTickets;
  const weekDeltaSign = weekDelta > 0 ? "+" : "";

  const kpis = [
    { label: "Total tickets", value: totalTickets, color: "text-white", sub: null },
    { label: "Tickets activos", value: activeTickets, color: "text-amber-400", sub: null },
    { label: "Resueltos hoy", value: resolvedToday, color: "text-emerald-400", sub: null },
    {
      label: "Sin asignar",
      value: unassignedTickets,
      color: unassignedTickets > 0 ? "text-red-400" : "text-zinc-400",
      sub: null,
    },
    {
      label: "Esta semana",
      value: thisWeekTickets,
      color: "text-sky-400",
      sub:
        lastWeekTickets > 0
          ? `${weekDeltaSign}${weekDelta} vs semana anterior`
          : null,
    },
    { label: "Semana anterior", value: lastWeekTickets, color: "text-zinc-400", sub: null },
  ];

  const maxAssigneeCount = byAssignee[0]?.count ?? 1;

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="mt-1 text-sm text-zinc-500">Resumen de operaciones de soporte</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-6 space-y-8">

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border border-white/10 bg-[#111111] p-5">
              <p className="text-xs text-zinc-500 uppercase tracking-wide leading-tight">{kpi.label}</p>
              <p className={`mt-2 text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
              {kpi.sub && (
                <p className={`mt-1 text-xs ${weekDelta >= 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {kpi.sub}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Charts row 1 */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* By status */}
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Tickets por estado</h2>
            {byStatus.length === 0 ? (
              <p className="text-sm text-zinc-600 italic">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {byStatus.map((s) => (
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
                      <span className="text-xs text-zinc-600 w-10 text-right">
                        {totalTickets ? Math.round((s._count.id / totalTickets) * 100) : 0}%
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
                {byPriority.map((p) => (
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
                      <span className="text-xs text-zinc-600 w-10 text-right">
                        {totalTickets ? Math.round((p._count.id / totalTickets) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* By assignee */}
        <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300">Tickets por agente</h2>
            {unassignedTickets > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-3 py-1 text-xs font-medium text-red-400">
                {unassignedTickets} sin asignar
              </span>
            )}
          </div>
          {byAssignee.length === 0 ? (
            <p className="text-sm text-zinc-600 italic">
              {unassignedTickets > 0
                ? "Todos los tickets están sin asignar."
                : "Sin datos de asignación."}
            </p>
          ) : (
            <div className="space-y-3">
              {byAssignee.map((a) => (
                <div key={a.name} className="flex items-center gap-3">
                  <span className="w-36 flex-shrink-0 text-sm text-zinc-300 truncate">{a.name}</span>
                  <div className="flex flex-1 items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-[#38d84e] rounded-full"
                        style={{ width: `${(a.count / maxAssigneeCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-white w-8 text-right">
                      {a.count}
                    </span>
                    <span className="text-xs text-zinc-600 w-10 text-right">
                      {totalTickets ? Math.round((a.count / totalTickets) * 100) : 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </section>
    </div>
  );
}
