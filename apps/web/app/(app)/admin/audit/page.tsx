import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = { title: "Auditoría" };

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
  ASSIGN: "Asignación",
  CHANGE_ROLE: "Cambio de rol",
  GRANT_PERMISSION: "Permiso otorgado",
  REVOKE_PERMISSION: "Permiso revocado",
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
};

const ACTION_CLASSES: Record<string, string> = {
  CREATE: "bg-emerald-500/10 text-emerald-400",
  UPDATE: "bg-blue-500/10 text-blue-400",
  DELETE: "bg-red-500/10 text-red-400",
  ASSIGN: "bg-violet-500/10 text-violet-400",
  CHANGE_ROLE: "bg-amber-500/10 text-amber-400",
  GRANT_PERMISSION: "bg-cyan-500/10 text-cyan-400",
  REVOKE_PERMISSION: "bg-orange-500/10 text-orange-400",
  LOGIN: "bg-zinc-500/10 text-zinc-400",
  LOGOUT: "bg-zinc-500/10 text-zinc-400",
};

type PageProps = { searchParams: Promise<{ page?: string }> };

export default async function AuditPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.roleKey !== "SUPERADMIN") redirect("/dashboard");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = 50;
  const skip = (page - 1) * pageSize;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count(),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-bold">Auditoría</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {total} registro{total !== 1 ? "s" : ""} en el log
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-[#111111] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-zinc-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Actor</th>
                  <th className="px-5 py-3 font-medium">Acción</th>
                  <th className="px-5 py-3 font-medium">Entidad</th>
                  <th className="px-5 py-3 font-medium">Descripción</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-zinc-500">
                      No hay registros de auditoría.
                    </td>
                  </tr>
                ) : (
                  logs.map((log: (typeof logs)[number]) => (
                    <tr
                      key={log.id}
                      className="border-t border-white/5 hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("es-MX", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-5 py-3 text-xs">
                        {log.actor ? (
                          <span className="text-white">{log.actor.name}</span>
                        ) : (
                          <span className="text-zinc-600 italic">Sistema</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            ACTION_CLASSES[log.action] ?? "bg-zinc-500/10 text-zinc-400"
                          }`}
                        >
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-400 font-mono">
                        {log.entityType}
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-400 max-w-xs truncate">
                        {log.description}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            {page > 1 && (
              <Link
                href={`?page=${page - 1}`}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
              >
                ← Anterior
              </Link>
            )}
            <span className="text-xs text-zinc-500">
              Página {page} de {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`?page=${page + 1}`}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
              >
                Siguiente →
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
