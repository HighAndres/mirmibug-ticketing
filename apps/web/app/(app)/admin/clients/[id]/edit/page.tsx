import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { updateClient } from "@/lib/actions/admin";

export const metadata = { title: "Editar cliente" };

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.roleKey !== "SUPERADMIN") redirect("/dashboard");

  const client = await prisma.clientCompany.findUnique({ where: { id } });
  if (!client) notFound();

  const updateAction = updateClient.bind(null, id);

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
          <div>
            <h1 className="text-2xl font-bold">Editar cliente</h1>
            <p className="mt-0.5 text-sm text-zinc-500">{client.name}</p>
          </div>
        </div>
        {/* Tab nav */}
        <div className="mt-4 flex gap-1">
          <span className="rounded-lg px-3 py-1.5 text-sm font-medium text-white bg-white/10">
            Datos generales
          </span>
          <Link
            href={`/admin/clients/${id}/branding`}
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition hover:bg-white/5"
          >
            Personalización
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-8">
        <form action={updateAction}>
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
                  defaultValue={client.name}
                  maxLength={100}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
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
                  defaultValue={client.slug}
                  maxLength={50}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none font-mono focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
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
                defaultValue={client.contactEmail ?? ""}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                defaultChecked={client.isActive}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-[#38d84e] focus:ring-[#38d84e]/20"
              />
              <label htmlFor="isActive" className="text-sm text-zinc-400">
                Cliente activo
              </label>
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
                Guardar cambios
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
