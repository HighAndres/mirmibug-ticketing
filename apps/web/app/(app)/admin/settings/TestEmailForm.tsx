"use client";

import { useActionState } from "react";
import { sendTestEmail } from "@/lib/actions/settings";

export default function TestEmailForm({ defaultTo }: { defaultTo: string }) {
  const [state, formAction, pending] = useActionState(sendTestEmail, null);

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-xs text-zinc-500 mb-1">Correo de destino</label>
      <div className="flex gap-2">
        <input
          type="email"
          name="to"
          required
          defaultValue={defaultTo}
          placeholder="tu@correo.com"
          className="flex-1 rounded-xl border border-white/10 bg-[#15171c] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
        >
          {pending ? "Enviando…" : "Enviar prueba"}
        </button>
      </div>
      {state && (
        <p
          className={`text-sm rounded-lg px-3 py-2 ${
            state.ok
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "bg-red-500/10 text-red-400 border border-red-500/30"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
