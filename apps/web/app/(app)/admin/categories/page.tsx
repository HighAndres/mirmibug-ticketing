import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { deleteCategory, deleteSubcategory } from "@/lib/actions/admin";
import ClientFilter from "./client-filter";
import { getUserClientIds } from "@/lib/permissions";

export const metadata = { title: "Categorías" };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  const isSuperAdmin = user.roleKey === "SUPERADMIN";
  const params = await searchParams;
  const filterClientId = params.clientId;

  const agentClientIds = user.roleKey === "AGENT"
    ? await getUserClientIds(user.id, user.roleKey, user.clientId)
    : [];

  // Filtro base por tenant
  const clientFilter = isSuperAdmin
    ? filterClientId
      ? { clientId: filterClientId }
      : {}
    : user.roleKey === "AGENT" && agentClientIds.length > 0
    ? { clientId: { in: agentClientIds } }
    : { clientId: user.clientId ?? "__none__" };

  const [categories, clients] = await Promise.all([
    prisma.category.findMany({
      where: clientFilter,
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
      include: {
        client: { select: { name: true } },
        subcategories: {
          orderBy: { name: "asc" },
          include: { _count: { select: { tickets: true } } },
        },
        _count: { select: { tickets: true } },
      },
    }),
    isSuperAdmin
      ? prisma.clientCompany.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Categorías</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {categories.length} categoría{categories.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isSuperAdmin && (
              <ClientFilter
                clients={clients}
                currentClientId={filterClientId ?? ""}
              />
            )}
            <Link
              href="/admin/categories/new"
              className="inline-flex items-center gap-2 rounded-xl bg-[#38d84e] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
            >
              + Nueva categoría
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-6 space-y-4">
        {categories.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#111111] px-5 py-12 text-center text-zinc-500">
            No hay categorías registradas.
          </div>
        ) : (
          categories.map((cat: (typeof categories)[number]) => (
            <div
              key={cat.id}
              className="rounded-2xl border border-white/10 bg-[#111111] overflow-hidden"
            >
              {/* Header de categoría */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div>
                  <h3 className="text-sm font-semibold text-white">{cat.name}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    {cat.description && (
                      <span className="text-xs text-zinc-500">{cat.description}</span>
                    )}
                    {isSuperAdmin && (
                      <span className="text-xs text-zinc-600">— {cat.client?.name ?? "Sin cliente"}</span>
                    )}
                    <span className="text-xs text-zinc-600">
                      {cat._count.tickets} ticket{cat._count.tickets !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/categories/${cat.id}/subcategories/new`}
                    className="text-xs text-[#38d84e] hover:text-[#2bc040] transition"
                  >
                    + Subcategoría
                  </Link>
                  <Link
                    href={`/admin/categories/${cat.id}/edit`}
                    className="text-xs text-zinc-400 hover:text-white transition"
                  >
                    Editar
                  </Link>
                  {cat._count.tickets === 0 && cat.subcategories.length === 0 && (
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
              </div>

              {/* Subcategorías */}
              {cat.subcategories.length > 0 && (
                <div className="divide-y divide-white/5">
                  {cat.subcategories.map((sub: (typeof cat.subcategories)[number]) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between px-5 py-3 pl-10"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-600">└</span>
                        <span className="text-sm text-zinc-300">{sub.name}</span>
                        <span className="text-xs text-zinc-600">
                          {sub._count.tickets} ticket{sub._count.tickets !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {sub._count.tickets === 0 && (
                        <form action={deleteSubcategory.bind(null, sub.id)}>
                          <button
                            type="submit"
                            className="text-xs text-red-400 hover:text-red-300 transition"
                          >
                            Eliminar
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
