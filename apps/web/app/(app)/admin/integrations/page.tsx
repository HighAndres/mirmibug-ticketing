import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { OutboxStatus } from "@prisma/client";
import WhatsappIcon from "@/components/WhatsappIcon";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";
import { isWhatsappIntegrationEnabled } from "@/lib/integrations/config";
import { outboxSummary } from "@/lib/integrations/outbox-dispatcher";
import { INTEGRATION_SCOPES, OUTBOX_EVENT_TYPES, parseEventTypes, parseScopes } from "@/lib/integrations/types";
import {
  deleteWebhookEndpoint,
  retryAllDeadEvents,
  retryOutboxEvent,
  revokeApiKey,
  toggleWebhookEndpoint,
} from "@/lib/actions/integrations";
import ApiKeyForm from "./ApiKeyForm";
import WebhookForm from "./WebhookForm";
import TestEventButton from "./TestEventButton";

export const metadata = { title: "Integraciones" };

const STATUS_FILTERS: { key: OutboxStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "Todos" },
  { key: "PENDING", label: "Pendientes" },
  { key: "PROCESSING", label: "En proceso" },
  { key: "FAILED", label: "Con error" },
  { key: "DELIVERED", label: "Entregados" },
  { key: "DEAD", label: "Muertos" },
];

const STATUS_CLASSES: Record<OutboxStatus, string> = {
  PENDING: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  PROCESSING: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  FAILED: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  DELIVERED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  DEAD: "bg-red-500/15 text-red-300 border-red-500/30",
};

function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.roleKey !== "SUPERADMIN") redirect("/dashboard");

  const { status: statusParam } = await searchParams;
  const statusFilter = STATUS_FILTERS.some((f) => f.key === statusParam) ? (statusParam as OutboxStatus | "ALL") : "ALL";

  const [apiKeys, endpoints, events, summary] = await Promise.all([
    prisma.integrationApiKey.findMany({
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.webhookEndpoint.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.eventOutbox.findMany({
      where: statusFilter === "ALL" ? {} : { status: statusFilter },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    outboxSummary(),
  ]);

  const enabled = isWhatsappIntegrationEnabled();
  const card = "rounded-2xl border border-white/10 bg-[#22262e] p-5 space-y-4";
  const h2 = "text-xs font-semibold text-zinc-500 uppercase tracking-wide";

  return (
    <div className="min-h-full bg-[#15171c] text-white">
      <section className="border-b border-white/10 bg-[#1c1f26] px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <WhatsappIcon size={22} className="text-[#25D366]" />
            Integraciones
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            API keys para n8n, webhooks salientes y log de eventos de la integración con WhatsApp.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-6 space-y-6">
        {/* Estado del flag */}
        <div
          className={`rounded-2xl border p-4 text-sm ${
            enabled
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
              : "border-yellow-500/30 bg-yellow-500/5 text-yellow-300"
          }`}
        >
          {enabled
            ? "✓ Integración WhatsApp activa: la API responde y los eventos se emiten al outbox."
            : "⚠ Integración WhatsApp desactivada (WHATSAPP_INTEGRATION_ENABLED=false): la API responde 404 y no se emiten eventos. Puedes preparar keys y endpoints desde aquí."}
        </div>

        {/* API keys */}
        <div className={card}>
          <div className="flex items-center justify-between">
            <h2 className={h2}>API keys ({apiKeys.filter((k) => !k.revokedAt).length} activas)</h2>
            <span className="text-[11px] text-zinc-600">Header: X-Integration-Key</span>
          </div>

          {apiKeys.length === 0 ? (
            <p className="text-sm italic text-zinc-600">Aún no hay API keys.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-left text-xs text-zinc-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Nombre</th>
                    <th className="px-4 py-2 font-medium">Prefijo</th>
                    <th className="px-4 py-2 font-medium">Scopes</th>
                    <th className="px-4 py-2 font-medium">Último uso</th>
                    <th className="px-4 py-2 font-medium">Creada</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((k) => (
                    <tr key={k.id} className={`border-t border-white/5 ${k.revokedAt ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2 text-white">
                        {k.name}
                        {k.revokedAt && <span className="ml-2 text-[10px] text-red-400">revocada {fmt(k.revokedAt)}</span>}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-400">{k.keyPrefix}…</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {parseScopes(k.scopesJson).map((s) => (
                            <span key={s} className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-zinc-400">{fmt(k.lastUsedAt)}</td>
                      <td className="px-4 py-2 text-xs text-zinc-400">
                        {fmt(k.createdAt)}
                        {k.createdBy && <span className="block text-[10px] text-zinc-600">{k.createdBy.name}</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!k.revokedAt && (
                          <ConfirmDeleteButton
                            action={revokeApiKey.bind(null, k.id)}
                            label="Revocar"
                            confirmMessage={`¿Revocar la key "${k.name}"? n8n dejará de poder usarla de inmediato.`}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <details className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer text-sm text-zinc-300">+ Nueva API key</summary>
            <div className="mt-4">
              <ApiKeyForm scopes={[...INTEGRATION_SCOPES]} />
            </div>
          </details>
        </div>

        {/* Webhooks */}
        <div className={card}>
          <h2 className={h2}>Webhook endpoints ({endpoints.filter((e) => e.isActive).length} activos)</h2>

          {endpoints.length === 0 ? (
            <p className="text-sm italic text-zinc-600">
              Sin endpoints: los eventos quedarán como muertos hasta que registres uno (o configures N8N_WEBHOOK_URL).
            </p>
          ) : (
            <ul className="space-y-2">
              {endpoints.map((e) => {
                const types = e.eventTypesJson.includes('"*"') ? ["*"] : parseEventTypes(e.eventTypesJson);
                return (
                  <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm text-white">
                        {e.name}
                        <span
                          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                            e.isActive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-white/10 bg-white/5 text-zinc-500"
                          }`}
                        >
                          {e.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </p>
                      <p className="mt-0.5 break-all font-mono text-xs text-zinc-400">{e.url}</p>
                      <p className="mt-1 text-[11px] text-zinc-600">
                        Eventos: {types.map((t) => (t === "*" ? "todos" : t)).join(", ")} · creado {fmt(e.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <TestEventButton endpointId={e.id} />
                      <form action={toggleWebhookEndpoint.bind(null, e.id)}>
                        <button type="submit" className="text-xs text-zinc-400 hover:text-white transition">
                          {e.isActive ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                      <ConfirmDeleteButton
                        action={deleteWebhookEndpoint.bind(null, e.id)}
                        confirmMessage={`¿Eliminar el endpoint "${e.name}"?`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <details className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer text-sm text-zinc-300">+ Nuevo endpoint</summary>
            <div className="mt-4">
              <WebhookForm eventTypes={[...OUTBOX_EVENT_TYPES]} />
            </div>
          </details>
        </div>

        {/* Outbox */}
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={h2}>Eventos salientes (outbox)</h2>
            {summary.DEAD > 0 && (
              <form action={retryAllDeadEvents}>
                <button
                  type="submit"
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20"
                >
                  Reintentar los {summary.DEAD} muertos
                </button>
              </form>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => {
              const count = f.key === "ALL" ? Object.values(summary).reduce((a, b) => a + b, 0) : summary[f.key];
              const active = f.key === statusFilter;
              return (
                <Link
                  key={f.key}
                  href={f.key === "ALL" ? "/admin/integrations" : `/admin/integrations?status=${f.key}`}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    active ? "border-[#38d84e]/50 bg-[#38d84e]/10 text-[#7CFF8D]" : "border-white/10 text-zinc-400 hover:text-white"
                  }`}
                >
                  {f.label} <span className="ml-1 text-[10px] opacity-70">{count}</span>
                </Link>
              );
            })}
          </div>

          {events.length === 0 ? (
            <p className="text-sm italic text-zinc-600">No hay eventos con ese estado.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-left text-xs text-zinc-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Evento</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium text-center">Intentos</th>
                    <th className="px-4 py-2 font-medium">Creado</th>
                    <th className="px-4 py-2 font-medium">Próximo / entregado</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className="border-t border-white/5 align-top">
                      <td className="px-4 py-2">
                        <p className="font-mono text-xs text-white">{ev.eventType}</p>
                        <p className="text-[10px] text-zinc-600">
                          ticket <Link href={`/tickets/${ev.aggregateId}`} className="hover:text-zinc-300">{ev.aggregateId}</Link>
                        </p>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] text-zinc-500 hover:text-zinc-300">payload</summary>
                          <pre className="mt-1 max-h-48 max-w-md overflow-auto rounded-lg bg-black/40 p-2 text-[10px] text-zinc-300">
                            {JSON.stringify(JSON.parse(ev.payloadJson), null, 2)}
                          </pre>
                        </details>
                        {ev.lastError && <p className="mt-1 max-w-md break-words text-[11px] text-red-400">{ev.lastError}</p>}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASSES[ev.status]}`}>
                          {ev.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center text-xs text-zinc-400">{ev.attempts}</td>
                      <td className="px-4 py-2 text-xs text-zinc-400">{fmt(ev.createdAt)}</td>
                      <td className="px-4 py-2 text-xs text-zinc-400">
                        {ev.status === "DELIVERED" ? fmt(ev.deliveredAt) : ev.status === "DEAD" ? "—" : fmt(ev.nextAttemptAt)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {ev.status !== "DELIVERED" && ev.status !== "PROCESSING" && (
                          <form action={retryOutboxEvent.bind(null, ev.id)}>
                            <button type="submit" className="text-xs text-sky-400 hover:text-sky-300 transition">
                              Reintentar
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-zinc-600">
            Se muestran los 50 más recientes del filtro. Reintentos automáticos: 1 min, 5 min, 15 min, 1 h, 6 h; después el evento queda muerto.
          </p>
        </div>
      </section>
    </div>
  );
}
