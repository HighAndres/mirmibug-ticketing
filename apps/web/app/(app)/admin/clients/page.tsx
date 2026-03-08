import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { toggleClientActive } from "@/lib/actions/admin";

export const metadata = { title: "Clientes" };

export default async function ClientsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  if (user.roleKey !== "SUPERADMIN") redirect("/dashboard");

  const clients = await prisma.clientCompany.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { users: true, tickets: true } },
    },
  });

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Clientes</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {clients.length} cliente{clients.length !== 1 ? "s" : ""}
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

      <section className="mx-auto max-w-7xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-[#111111] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-zinc-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Slug</th>
                  <th className="px-5 py-3 font-medium">Email de contacto</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium text-center">Usuarios</th>
                  <th className="px-5 py-3 font-medium text-center">Tickets</th>
                  <th className="px-5 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-zinc-500">
                      No hay clientes registrados.
                    </td>
                  </tr>
                ) : (
                  clients.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-white/5 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3 font-medium text-white">{c.name}</td>
                      <td className="px-5 py-3 text-zinc-400 text-xs font-mono">{c.slug}</td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">
                        {c.contactEmail ?? <span className="text-zinc-600 italic">—</span>}
                      </td>
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
                      <td className="px-5 py-3 text-center text-xs text-zinc-500">
                        {c._count.users}
                      </td>
                      <td className="px-5 py-3 text-center text-xs text-zinc-500">
                        {c._count.tickets}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
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
