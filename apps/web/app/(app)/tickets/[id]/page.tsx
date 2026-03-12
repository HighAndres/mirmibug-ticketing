import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  STATUS_CLASSES,
  PRIORITY_CLASSES,
} from "@/lib/tickets";
import {
  changeTicketStatus,
  assignTicket,
  addComment,
  changeTicketPriority,
  validateTicketPriority,
} from "@/lib/actions/tickets";
import { canAccessTicket, canManageTickets } from "@/lib/permissions";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { folio: true, title: true },
  });
  return { title: ticket ? `${ticket.folio} — ${ticket.title}` : "Ticket" };
}

// ---------------------------------------------------------------------------
// Transiciones de estatus permitidas por rol
// ---------------------------------------------------------------------------
function getAllowedTransitions(
  currentStatus: string,
  roleKey: string
): string[] {
  if (roleKey === "CLIENT_USER") {
    // Solo puede cerrar tickets abiertos o en progreso
    return ["OPEN", "IN_PROGRESS", "PENDING"].includes(currentStatus)
      ? ["CLOSED"]
      : [];
  }

  // Agentes, admins y superadmin tienen transición libre
  const all = ["OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"];
  return all.filter((s) => s !== currentStatus);
}

export default async function TicketDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { user } = session;
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      client: true,
      category: true,
      requester: { include: { role: { select: { name: true } } } },
      assignee: { include: { role: { select: { name: true } } } },
      priorityValidatedBy: { select: { name: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { include: { role: { select: { key: true, name: true } } } },
        },
      },
    },
  });

  if (!ticket) notFound();

  // Autorización: multitenencia + CLIENT_USER solo ve sus propios tickets
  if (!canAccessTicket(user, ticket)) {
    notFound();
  }

  const canManage = canManageTickets(user.roleKey);

  // Agentes disponibles para asignar
  const agents = canManage
    ? await prisma.user.findMany({
        where: {
          isActive: true,
          role: { key: { in: ["SUPERADMIN", "AGENT", "CLIENT_ADMIN"] } },
          ...(user.roleKey !== "SUPERADMIN"
            ? {
                OR: [
                  { clientId: user.clientId },
                  { clientId: null },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, role: { select: { name: true } } },
        orderBy: { name: "asc" },
      })
    : [];

  const allowedTransitions = getAllowedTransitions(ticket.status, user.roleKey);
  const isClientUser = user.roleKey === "CLIENT_USER";

  // Visibilidad de comentarios: CLIENT_USER no ve notas internas
  const visibleComments = ticket.comments.filter(
    (c) => !c.isInternal || !isClientUser
  );

  return (
    <div className="min-h-full bg-[#0a0a0a] text-white">

      {/* Header */}
      <section className="border-b border-white/10 bg-[#0f0f0f] px-6 py-5">
        <div className="mx-auto max-w-6xl flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <Link
              href="/tickets"
              className="mt-1 text-zinc-500 hover:text-zinc-300 transition text-sm shrink-0"
            >
              ← Tickets
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-[#7CFF8D]">
                  {ticket.folio}
                </span>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[ticket.status] ?? ""}`}
                >
                  {STATUS_LABELS[ticket.status]}
                </span>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_CLASSES[ticket.priority] ?? ""}`}
                >
                  {PRIORITY_LABELS[ticket.priority]}
                </span>
                {!ticket.priorityValidated && (
                  <span className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                    Prioridad sin validar
                  </span>
                )}
                {ticket.priorityValidated && (
                  <span className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Prioridad validada
                  </span>
                )}
              </div>
              <h1 className="mt-1 text-xl font-semibold">{ticket.title}</h1>
            </div>
          </div>

          {/* Cambio de estatus */}
          {allowedTransitions.length > 0 && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {allowedTransitions.map((s: (typeof allowedTransitions)[number]) => (
                <form key={s} action={changeTicketStatus.bind(null, ticket.id, s)}>
                  <button
                    type="submit"
                    className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white"
                  >
                    → {STATUS_LABELS[s]}
                  </button>
                </form>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Cuerpo: descripción + sidebar */}
      <div className="mx-auto max-w-6xl px-6 py-6 grid gap-6 lg:grid-cols-3">

        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">

          {/* Descripción */}
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
              Descripción
            </h2>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {ticket.description}
            </p>
          </div>

          {/* Comentarios */}
          <div className="rounded-2xl border border-white/10 bg-[#111111]">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                Comentarios ({visibleComments.length})
              </h2>
            </div>

            {visibleComments.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-600">
                Sin comentarios todavía.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {visibleComments.map((comment: (typeof visibleComments)[number]) => {
                  const isInternal = comment.isInternal;
                  return (
                    <li
                      key={comment.id}
                      className={`px-5 py-4 ${isInternal ? "bg-amber-500/5 border-l-2 border-amber-500/40" : ""}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-white">
                          {comment.author.name}
                        </span>
                        <span className="text-xs text-zinc-600">
                          {comment.author.role.name}
                        </span>
                        {isInternal && (
                          <span className="text-[10px] font-medium uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Nota interna
                          </span>
                        )}
                        <span className="ml-auto text-xs text-zinc-600">
                          {new Date(comment.createdAt).toLocaleString("es-MX", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {comment.content}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Formulario de nuevo comentario */}
            {ticket.status !== "CLOSED" && (
              <div className="border-t border-white/10 px-5 py-4">
                <form action={addComment} className="space-y-3">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <textarea
                    name="content"
                    rows={3}
                    required
                    placeholder={
                      isClientUser
                        ? "Escribe una respuesta o actualización..."
                        : "Escribe un comentario o nota..."
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none resize-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
                  />
                  <div className="flex items-center justify-between">
                    {!isClientUser && (
                      <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          name="isInternal"
                          value="true"
                          className="rounded border-white/20 bg-white/5 accent-amber-400"
                        />
                        Nota interna (no visible al cliente)
                      </label>
                    )}
                    {isClientUser && <div />}
                    <button
                      type="submit"
                      className="rounded-xl bg-[#38d84e] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
                    >
                      Enviar
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar de metadatos */}
        <aside className="space-y-4">

          {/* Info del ticket */}
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-4">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Detalles
            </h2>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500 text-xs mb-1">Cliente</dt>
                <dd className="text-zinc-300">{ticket.client.name}</dd>
              </div>
              <div>
                <dt className="text-zinc-500 text-xs mb-1">Categoría</dt>
                <dd className="text-zinc-300">{ticket.category.name}</dd>
              </div>
              <div>
                <dt className="text-zinc-500 text-xs mb-1">Solicitante</dt>
                <dd className="text-zinc-300">
                  {ticket.requester.name}
                  <span className="ml-1 text-xs text-zinc-600">
                    ({ticket.requester.role.name})
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 text-xs mb-1">Creado</dt>
                <dd className="text-zinc-300">
                  {new Date(ticket.createdAt).toLocaleString("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 text-xs mb-1">Actualizado</dt>
                <dd className="text-zinc-300">
                  {new Date(ticket.updatedAt).toLocaleString("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            </dl>
          </div>

          {/* Prioridad */}
          {canManage && (
            <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-3">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Prioridad
              </h2>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_CLASSES[ticket.priority] ?? ""}`}
                >
                  {PRIORITY_LABELS[ticket.priority]}
                </span>
                {ticket.priorityValidated ? (
                  <span className="text-[10px] text-emerald-400">
                    Validada por {ticket.priorityValidatedBy?.name}
                  </span>
                ) : (
                  <span className="text-[10px] text-yellow-400">
                    Pendiente de validación
                  </span>
                )}
              </div>

              {/* Cambiar prioridad */}
              <form action={async (fd: FormData) => {
                "use server";
                const val = fd.get("priority") as string;
                if (val && val !== ticket.priority) {
                  await changeTicketPriority(ticket.id, val);
                }
              }}>
                <label className="block text-xs text-zinc-500 mb-1">Cambiar prioridad</label>
                <select
                  name="priority"
                  defaultValue={ticket.priority}
                  className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50 mb-2"
                >
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
                <button
                  type="submit"
                  className="w-full rounded-xl border border-white/10 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
                >
                  Actualizar prioridad
                </button>
              </form>

              {/* Validar prioridad actual */}
              {!ticket.priorityValidated && (
                <form action={validateTicketPriority.bind(null, ticket.id)}>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-emerald-600/20 border border-emerald-500/30 py-2 text-sm text-emerald-400 transition hover:bg-emerald-600/30 hover:text-emerald-300"
                  >
                    Validar prioridad actual
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Asignación */}
          {canManage && (
            <div className="rounded-2xl border border-white/10 bg-[#111111] p-5 space-y-3">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Asignado a
              </h2>
              <p className="text-sm text-zinc-300">
                {ticket.assignee
                  ? `${ticket.assignee.name} (${ticket.assignee.role.name})`
                  : <span className="italic text-zinc-600">Sin asignar</span>}
              </p>
              <form action={async (fd: FormData) => {
                "use server";
                const val = fd.get("assigneeId") as string;
                await assignTicket(ticket.id, val || null);
              }}>
                <select
                  name="assigneeId"
                  defaultValue={ticket.assigneeId ?? ""}
                  className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50 mb-2"
                >
                  <option value="">Sin asignar</option>
                  {agents.map((a: (typeof agents)[number]) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.role.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full rounded-xl border border-white/10 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
                >
                  Actualizar asignación
                </button>
              </form>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
