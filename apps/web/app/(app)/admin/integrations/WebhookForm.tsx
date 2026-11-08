"use client";

import { useActionState, useState } from "react";
import { createWebhookEndpoint, type ActionResult } from "@/lib/actions/integrations";

export default function WebhookForm({ eventTypes }: { eventTypes: string[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(createWebhookEndpoint, null);
  const [allEvents, setAllEvents] = useState(true);

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-[#15171c] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50";

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Nombre</label>
          <input name="name" required maxLength={80} placeholder="n8n → WhatsApp" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">URL del webhook</label>
          <input name="url" required type="url" placeholder="https://n8n.tudominio.com/webhook/mirmibug" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-zinc-500 mb-1">
            Secreto HMAC <span className="text-zinc-600">(opcional: vacío = se genera uno y se muestra una sola vez)</span>
          </label>
          <input name="secret" type="password" autoComplete="new-password" placeholder="••••••••" className={inputClass} />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
          <input
            type="checkbox"
            name="allEvents"
            checked={allEvents}
            onChange={(e) => setAllEvents(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[#38d84e]"
          />
          Todos los eventos
        </label>
        {!allEvents && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {eventTypes.map((t) => (
              <label key={t} className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-300">
                <input type="checkbox" name="eventTypes" value={t} defaultChecked className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[#38d84e]" />
                <span className="font-mono">{t}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[#38d84e] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040] disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Registrar endpoint"}
      </button>

      {state && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            state.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-red-500/30 bg-red-500/5 text-red-300"
          }`}
        >
          <p>{state.message}</p>
          {state.secret && (
            <code className="mt-2 block select-all break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-white">
              {state.secret}
            </code>
          )}
        </div>
      )}
    </form>
  );
}
