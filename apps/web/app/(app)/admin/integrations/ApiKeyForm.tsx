"use client";

import { useActionState } from "react";
import { createApiKey, type ActionResult } from "@/lib/actions/integrations";

const SCOPE_LABELS: Record<string, string> = {
  "contacts:read": "Buscar contactos por teléfono",
  "tickets:read": "Leer tickets y folios",
  "tickets:write": "Crear tickets, comentar, adjuntar y cerrar/reabrir",
  "conversations:write": "Guardar el estado de la conversación",
};

export default function ApiKeyForm({ scopes }: { scopes: string[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(createApiKey, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Nombre</label>
        <input
          name="name"
          required
          maxLength={80}
          placeholder="n8n producción"
          className="w-full rounded-xl border border-white/10 bg-[#15171c] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50"
        />
      </div>
      <div>
        <p className="text-xs text-zinc-500 mb-2">Scopes</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {scopes.map((scope) => (
            <label key={scope} className="flex items-start gap-2 cursor-pointer select-none rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <input
                type="checkbox"
                name="scopes"
                value={scope}
                defaultChecked
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-[#38d84e]"
              />
              <span>
                <span className="block font-mono text-xs text-zinc-200">{scope}</span>
                <span className="block text-[11px] text-zinc-500">{SCOPE_LABELS[scope] ?? ""}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[#38d84e] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040] disabled:opacity-50"
      >
        {pending ? "Creando…" : "Crear API key"}
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
