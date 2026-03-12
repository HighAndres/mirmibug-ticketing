import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata = { title: "Actividad" };

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

type PageProps = {
  searchParams: Promise<{ page?: string; actor?: string }>;
};

export default async function CompanyAuditPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;

  if (!["CLIENT_SUPERVISOR", "CLIENT_ADMIN"].includes(user.roleKey)) {
    redirect("/dashboard");
  }

  if (!user.clientId) redirect("/dashboard");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const actorFilter = params.actor;
  const pageSize = 40;
  const skip = (page - 1) * pageSize;

  // Filtrar logs por actores que pertenecen al cliente
  const baseWhere = {
    actor: { clientId: user.clientId },
    ...(actorFilter ? { actorId: actorFilter } : {}),
  };

  const [logs, total, teamMembers] = await Promise.all([
    prisma.auditLog.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where: baseWhere }),
    // Miembros del equipo para filtro
    prisma.user.findMany({
      where: { clientId: user.clientId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  function buildQuery(overrides: Record<string, string | undefined>) {
    const merged = {
      ...(actorFilter ? { actor: actorFilter } : {}),
      page: String(page),
      ...overrides,
    };
    const qs = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v !== undefined && v !== "") as [string, string][]
    ).toString();
    return qs ? `/company/audit?${qs}` : "/company/audit";
  }

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">

      {/* Header */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-bold">Actividad</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Registro de actividad de{" "}
            <span className="text-white">{user.clientName}</span>
          </p>
        </div>
      </section>

      {/* Filtros */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-3">
        <div className="mx-auto max-w-7xl">
          <form method="GET" className="flex flex-wrap items-center gap-3">
            <select
              name="actor"
              defaultValue={actorFilter ?? ""}
              className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50"
            >
              <option value="">Todos los miembros</option>
              {teamMembers.map((m: (typeof teamMembers)[number]) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            <button
              type="submit"
              className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
            >
              Filtrar
            </button>

            {actorFilter && (
              <Link
                href="/company/audit"
                className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
              >
                Limpiar
              </Link>
            )}

            <span className="ml-auto text-xs text-zinc-500">
              {total} registro{total !== 1 ? "s" : ""}
            </span>
          </form>
        </div>
      </section>

      {/* Table */}
      <section className="mx-auto max-w-7xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-[#111111] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-zinc-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Miembro</th>
                  <th className="px-5 py-3 font-medium">Acción</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Descripción</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-zinc-500">
                      No hay registros de actividad.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
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
                      <td className="px-5 py-3 text-xs text-zinc-400 max-w-sm truncate">
                        {log.description}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            {page > 1 && (
              <Link
                href={buildQuery({ page: String(page - 1) })}
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
                href={buildQuery({ page: String(page + 1) })}
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
