import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/actions/admin";

export const metadata = { title: "Nuevo cliente" };

export default async function NewClientPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.roleKey !== "SUPERADMIN") redirect("/dashboard");

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-3xl flex items-center gap-4">
          <Link
            href="/admin/clients"
            className="text-zinc-500 hover:text-zinc-300 transition text-sm"
          >
            ← Clientes
          </Link>
          <h1 className="text-2xl font-bold">Nuevo cliente</h1>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-8">
        <form action={createClient}>
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
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
                  placeholder="Nombre de la empresa"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
                />
              </div>
              <div>
                <label htmlFor="slug" className="block text-sm font-medium text-zinc-400 mb-2">
                  Slug <span className="text-red-400">*</span>
                </label>
                <input
                  id="slug"
                  name="slug"
                  type="text"
                  required
                  maxLength={50}
                  placeholder="empresa-sa"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none font-mono focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="contactEmail"
                className="block text-sm font-medium text-zinc-400 mb-2"
              >
                Email de contacto
              </label>
              <input
                id="contactEmail"
                name="contactEmail"
                type="email"
                placeholder="contacto@empresa.com"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                href="/admin/clients"
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                className="rounded-xl bg-[#38d84e] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
              >
                Crear cliente
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
