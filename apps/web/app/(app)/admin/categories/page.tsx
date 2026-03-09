import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { deleteCategory } from "@/lib/actions/admin";

export const metadata = { title: "Categorías" };

export default async function CategoriesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  if (!["SUPERADMIN", "CLIENT_ADMIN"].includes(user.roleKey)) redirect("/dashboard");

  const clientFilter =
    user.roleKey === "SUPERADMIN" ? {} : { clientId: user.clientId ?? "__none__" };

  const categories = await prisma.category.findMany({
    where: clientFilter,
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    include: {
      client: { select: { name: true } },
      _count: { select: { tickets: true } },
    },
  });

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Categorías</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {categories.length} categoría{categories.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/admin/categories/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#38d84e] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
          >
            + Nueva categoría
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
                  <th className="px-5 py-3 font-medium">Descripción</th>
                  {user.roleKey === "SUPERADMIN" && (
                    <th className="px-5 py-3 font-medium">Cliente</th>
                  )}
                  <th className="px-5 py-3 font-medium text-center">Tickets</th>
                  <th className="px-5 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td
                      colSpan={user.roleKey === "SUPERADMIN" ? 5 : 4}
                      className="px-5 py-12 text-center text-zinc-500"
                    >
                      No hay categorías registradas.
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => (
                    <tr
                      key={cat.id}
                      className="border-t border-white/5 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3 font-medium text-white">{cat.name}</td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">
                        {cat.description ?? <span className="text-zinc-600 italic">—</span>}
                      </td>
                      {user.roleKey === "SUPERADMIN" && (
                        <td className="px-5 py-3 text-zinc-400 text-xs">{cat.client.name}</td>
                      )}
                      <td className="px-5 py-3 text-center text-xs text-zinc-500">
                        {cat._count.tickets}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/admin/categories/${cat.id}/edit`}
                            className="text-xs text-zinc-400 hover:text-white transition"
                          >
                            Editar
                          </Link>
                          {cat._count.tickets === 0 && (
                            <form action={deleteCategory.bind(null, cat.id)}>
                              <button
                                type="submit"
                                className="text-xs text-red-400 hover:text-red-300 transition"
                              >
                                Eliminar
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
