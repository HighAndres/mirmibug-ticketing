import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { createTicket } from "@/lib/actions/tickets";
import Link from "next/link";

export const metadata = { title: "Nuevo ticket" };

export default async function NewTicketPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  const isSuperAdmin = user.roleKey === "SUPERADMIN";

  // Cargar categorías disponibles según el cliente del usuario
  const categories = await prisma.category.findMany({
    where: isSuperAdmin ? {} : { clientId: user.clientId ?? "__none__" },
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    include: { client: { select: { name: true, id: true } } },
  });

  // Para SUPERADMIN: lista de clientes activos
  const clients = isSuperAdmin
    ? await prisma.clientCompany.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">

      {/* Header */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-3xl flex items-center gap-4">
          <Link
            href="/tickets"
            className="text-zinc-500 hover:text-zinc-300 transition text-sm"
          >
            ← Tickets
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Nuevo ticket</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Se generará el folio automáticamente al guardar
            </p>
          </div>
        </div>
      </section>

      {/* Formulario */}
      <section className="mx-auto max-w-3xl px-6 py-8">
        <form action={createTicket}>
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-6 space-y-5">

            {/* Cliente (solo SUPERADMIN) */}
            {isSuperAdmin && (
              <div>
                <label htmlFor="clientId" className="block text-sm font-medium text-zinc-400 mb-2">
                  Cliente <span className="text-red-400">*</span>
                </label>
                <select
                  id="clientId"
                  name="clientId"
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
                >
                  <option value="">Selecciona un cliente</option>
                  {clients.map((c: (typeof clients)[number]) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Título */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-zinc-400 mb-2">
                Título <span className="text-red-400">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                maxLength={200}
                placeholder="Describe el problema brevemente"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
              />
            </div>

            {/* Descripción */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-zinc-400 mb-2">
                Descripción <span className="text-red-400">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={5}
                placeholder="Describe el problema con detalle: pasos para reproducir, mensajes de error, equipos afectados..."
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none resize-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
              />
            </div>

            {/* Categoría + Prioridad en grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="categoryId" className="block text-sm font-medium text-zinc-400 mb-2">
                  Categoría <span className="text-red-400">*</span>
                </label>
                <select
                  id="categoryId"
                  name="categoryId"
                  required
                  className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm text-white outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
                >
                  <option value="">Selecciona categoría</option>
                  {isSuperAdmin
                    ? // Agrupadas por cliente si es superadmin
                      Object.entries(
                        categories.reduce<Record<string, typeof categories>>(
                          (acc, cat) => {
                            const key = cat.client.name;
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(cat);
                            return acc;
                          },
                          {}
                        )
                      ).map(([clientName, cats]) => (
                        <optgroup key={clientName} label={clientName}>
                          {cats.map((cat) => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </optgroup>
                      ))
                    : categories.map((cat: (typeof categories)[number]) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                </select>
              </div>

              <div>
                <label htmlFor="priority" className="block text-sm font-medium text-zinc-400 mb-2">
                  Prioridad
                </label>
                <select
                  id="priority"
                  name="priority"
                  defaultValue="MEDIUM"
                  className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm text-white outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
                >
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                href="/tickets"
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                className="rounded-xl bg-[#38d84e] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
              >
                Crear ticket
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
