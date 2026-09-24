import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createCategory } from "@/lib/actions/admin";

export const metadata = { title: "Nueva categoría" };

export default async function NewCategoryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.roleKey !== "SUPERADMIN") redirect("/dashboard");

  return (
    <div className="min-h-full bg-[#15171c] text-white">
      <section className="border-b border-white/10 bg-[#1c1f26] px-6 py-6">
        <div className="mx-auto max-w-3xl flex items-center gap-4">
          <Link
            href="/admin/categories"
            className="text-zinc-500 hover:text-zinc-300 transition text-sm"
          >
            ← Categorías
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Nueva categoría</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Estará disponible para todos los clientes
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-8">
        <form action={createCategory}>
          <div className="rounded-2xl border border-white/10 bg-[#22262e] p-6 space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-zinc-400 mb-2">
                Nombre <span className="text-red-400">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                maxLength={100}
                placeholder="Ej. Redes, Servidores, Help Desk..."
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
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
                placeholder="Descripción opcional de la categoría"
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
                Crear categoría
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
