import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createUser } from "@/lib/actions/admin";

export const metadata = { title: "Nuevo usuario" };

export default async function NewUserPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  if (!["SUPERADMIN", "CLIENT_ADMIN"].includes(user.roleKey)) redirect("/dashboard");

  const [roles, clients] = await Promise.all([
    prisma.role.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    user.roleKey === "SUPERADMIN"
      ? prisma.clientCompany.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [],
  ]);

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-3xl flex items-center gap-4">
          <Link
            href="/admin/users"
            className="text-zinc-500 hover:text-zinc-300 transition text-sm"
          >
            ← Usuarios
          </Link>
          <h1 className="text-2xl font-bold">Nuevo usuario</h1>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-8">
        <form action={createUser}>
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
                  placeholder="Nombre completo"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-400 mb-2">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="correo@empresa.com"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-400 mb-2">
                Contraseña <span className="text-red-400">*</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="roleId" className="block text-sm font-medium text-zinc-400 mb-2">
                  Rol <span className="text-red-400">*</span>
                </label>
                <select
                  id="roleId"
                  name="roleId"
                  required
                  className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm text-white outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
                >
                  <option value="">Selecciona un rol</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              {user.roleKey === "SUPERADMIN" && (
                <div>
                  <label
                    htmlFor="clientId"
                    className="block text-sm font-medium text-zinc-400 mb-2"
                  >
                    Cliente
                  </label>
                  <select
                    id="clientId"
                    name="clientId"
                    className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm text-white outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
                  >
                    <option value="">Sin cliente (global)</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                href="/admin/users"
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                className="rounded-xl bg-[#38d84e] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
              >
                Crear usuario
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
