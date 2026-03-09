import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { updateCategory } from "@/lib/actions/admin";

export const metadata = { title: "Editar categoría" };

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  if (!["SUPERADMIN", "CLIENT_ADMIN"].includes(user.roleKey)) redirect("/dashboard");

  const cat = await prisma.category.findUnique({
    where: { id },
    include: { client: { select: { name: true } } },
  });
  if (!cat) notFound();
  if (user.roleKey === "CLIENT_ADMIN" && cat.clientId !== user.clientId) notFound();

  const updateAction = updateCategory.bind(null, id);

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-3xl flex items-center gap-4">
          <Link
            href="/admin/categories"
            className="text-zinc-500 hover:text-zinc-300 transition text-sm"
          >
            ← Categorías
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Editar categoría</h1>
            <p className="mt-0.5 text-sm text-zinc-500">{cat.client.name}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-8">
        <form action={updateAction}>
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-6 space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-zinc-400 mb-2">
                Nombre <span className="text-red-400">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={cat.name}
                maxLength={100}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-zinc-400 mb-2"
              >
                Descripción
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={cat.description ?? ""}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none resize-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                href="/admin/categories"
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                className="rounded-xl bg-[#38d84e] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
