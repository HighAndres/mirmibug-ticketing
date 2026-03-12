import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const metadata = { title: "Roles y permisos" };

export default async function RolesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.roleKey !== "SUPERADMIN") redirect("/dashboard");

  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  });

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-bold">Roles y permisos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {roles.length} roles en el sistema
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-6 space-y-4">
        {roles.map((role: (typeof roles)[number]) => (
          <div key={role.id} className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-base font-semibold text-white">{role.name}</h2>
                  <span className="inline-flex rounded-full border border-[#38d84e]/30 bg-[#38d84e]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#7CFF8D]">
                    {role.key}
                  </span>
                  {role.isSystem && (
                    <span className="inline-flex rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                      Sistema
                    </span>
                  )}
                  {!role.isActive && (
                    <span className="inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
                      Inactivo
                    </span>
                  )}
                </div>
                {role.description && (
                  <p className="mt-1 text-sm text-zinc-500">{role.description}</p>
                )}
              </div>
              <span className="text-xs text-zinc-500 whitespace-nowrap">
                {role._count.users} usuario{role._count.users !== 1 ? "s" : ""}
              </span>
            </div>
            {role.rolePermissions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {role.rolePermissions.map((rp: (typeof role.rolePermissions)[number]) => (
                  <span
                    key={rp.id}
                    className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-xs text-zinc-400 font-mono"
                  >
                    {rp.permission.key}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-600 italic">Sin permisos asignados</p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
