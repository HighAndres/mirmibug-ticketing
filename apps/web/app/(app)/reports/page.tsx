import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { STATUS_LABELS, PRIORITY_LABELS, STATUS_CLASSES, PRIORITY_CLASSES } from "@/lib/tickets";

export const metadata = { title: "Reportes" };

export default async function ReportsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  if (!["SUPERADMIN", "CLIENT_ADMIN", "AGENT"].includes(user.roleKey)) redirect("/dashboard");

  const clientFilter =
    user.roleKey === "SUPERADMIN" ? {} : { clientId: user.clientId ?? "__none__" };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [byStatus, byPriority, totalTickets, activeTickets, resolvedToday] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], where: clientFilter, _count: { id: true } }),
    prisma.ticket.groupBy({ by: ["priority"], where: clientFilter, _count: { id: true } }),
    prisma.ticket.count({ where: clientFilter }),
    prisma.ticket.count({
      where: { ...clientFilter, status: { in: ["OPEN", "IN_PROGRESS", "PENDING"] } },
    }),
    prisma.ticket.count({
      where: {
        ...clientFilter,
        status: "RESOLVED",
        updatedAt: { gte: todayStart },
      },
    }),
  ]);

  const kpis = [
    { label: "Total tickets", value: totalTickets, color: "text-white" },
    { label: "Tickets activos", value: activeTickets, color: "text-amber-400" },
    { label: "Resueltos hoy", value: resolvedToday, color: "text-emerald-400" },
  ];

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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border border-white/10 bg-[#111111] p-5">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">{kpi.label}</p>
              <p className={`mt-2 text-4xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* By status */}
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Tickets por estado</h2>
            {byStatus.length === 0 ? (
              <p className="text-sm text-zinc-600 italic">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {byStatus.map((s) => (
                  <div key={s.status} className="flex items-center justify-between gap-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_CLASSES[s.status] ?? ""
                      }`}
                    >
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    <div className="flex flex-1 items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full bg-[#38d84e] rounded-full"
                          style={{
                            width: totalTickets
                              ? `${(s._count.id / totalTickets) * 100}%`
                              : "0%",
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-white w-6 text-right">
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
                {byPriority.map((p) => (
                  <div key={p.priority} className="flex items-center justify-between gap-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        PRIORITY_CLASSES[p.priority] ?? ""
                      }`}
                    >
                      {PRIORITY_LABELS[p.priority] ?? p.priority}
                    </span>
                    <div className="flex flex-1 items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full bg-[#38d84e] rounded-full"
                          style={{
                            width: totalTickets
                              ? `${(p._count.id / totalTickets) * 100}%`
                              : "0%",
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-white w-6 text-right">
                        {p._count.id}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
