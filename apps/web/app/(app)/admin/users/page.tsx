import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { toggleUserActive } from "@/lib/actions/admin";

export const metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  if (!["SUPERADMIN", "CLIENT_ADMIN"].includes(user.roleKey)) redirect("/dashboard");

  const clientFilter =
    user.roleKey === "SUPERADMIN" ? {} : { clientId: user.clientId ?? "__none__" };

  const users = await prisma.user.findMany({
    where: clientFilter,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      role: { select: { name: true, key: true } },
      client: { select: { name: true } },
      _count: { select: { tickets: true } },
    },
  });

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      {/* Header */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Usuarios</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {users.length} usuario{users.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/users/import"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white"
            >
              ↑ Importar CSV
            </Link>
            <Link
              href="/admin/users/new"
              className="inline-flex items-center gap-2 rounded-xl bg-[#38d84e] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
            >
              + Nuevo usuario
            </Link>
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
                  {user.roleKey === "SUPERADMIN" && (
                    <th className="px-5 py-3 font-medium">Cliente</th>
                  )}
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium text-center">Tickets</th>
                  <th className="px-5 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={user.roleKey === "SUPERADMIN" ? 7 : 6}
                      className="px-5 py-12 text-center text-zinc-500"
                    >
                      No hay usuarios registrados.
                    </td>
                  </tr>
                ) : (
                  users.map((u: (typeof users)[number]) => (
                    <tr
                      key={u.id}
                      className="border-t border-white/5 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3 font-medium text-white">{u.name}</td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">{u.email}</td>
                      {user.roleKey === "SUPERADMIN" && (
                        <td className="px-5 py-3 text-zinc-400 text-xs">
                          {u.client?.name ?? (
                            <span className="text-zinc-600 italic">Global</span>
                          )}
                        </td>
                      )}
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
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/admin/users/${u.id}/edit`}
                            className="text-xs text-zinc-400 hover:text-white transition"
                          >
                            Editar
                          </Link>
                          {u.id !== user.id && (
                            <form action={toggleUserActive.bind(null, u.id)}>
                              <button
                                type="submit"
                                className={`text-xs transition ${
                                  u.isActive
                                    ? "text-red-400 hover:text-red-300"
                                    : "text-emerald-400 hover:text-emerald-300"
                                }`}
                              >
                                {u.isActive ? "Desactivar" : "Activar"}
                              </button>
                            </form>
                          )}
                        </div>
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
