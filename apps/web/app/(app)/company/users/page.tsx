import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const metadata = { title: "Equipo" };

export default async function CompanyUsersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;

  // Solo CLIENT_SUPERVISOR y CLIENT_ADMIN pueden acceder
  if (!["CLIENT_SUPERVISOR", "CLIENT_ADMIN"].includes(user.roleKey)) {
    redirect("/dashboard");
  }

  if (!user.clientId) redirect("/dashboard");

  const users = await prisma.user.findMany({
    where: { clientId: user.clientId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      role: { select: { name: true, key: true } },
      _count: { select: { tickets: true } },
    },
  });

  const activeCount = users.filter((u: (typeof users)[number]) => u.isActive).length;
  const inactiveCount = users.length - activeCount;

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">

      {/* Header */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-bold">Equipo</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Usuarios de <span className="text-white">{user.clientName}</span>
          </p>
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-zinc-400">
              <span className="font-semibold text-white">{users.length}</span> usuarios totales
            </span>
            <span className="text-emerald-400">
              <span className="font-semibold">{activeCount}</span> activos
            </span>
            {inactiveCount > 0 && (
              <span className="text-red-400">
                <span className="font-semibold">{inactiveCount}</span> inactivos
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="mx-auto max-w-7xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-[#111111] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-zinc-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium text-center">Tickets creados</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-zinc-500">
                      No hay usuarios en este equipo.
                    </td>
                  </tr>
                ) : (
                  users.map((u: (typeof users)[number]) => (
                    <tr
                      key={u.id}
                      className="border-t border-white/5 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-white">{u.name}</p>
                        {u.id === user.id && (
                          <span className="text-[10px] text-zinc-500">(tú)</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">{u.email}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex rounded-full border border-[#38d84e]/30 bg-[#38d84e]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#7CFF8D]">
                          {u.role.name}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {u.isActive ? (
                          <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center text-xs text-zinc-500">
                        {u._count.tickets}
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
