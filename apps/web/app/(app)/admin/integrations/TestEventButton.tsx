"use client";

import { useActionState } from "react";
import { sendTestEvent, type ActionResult } from "@/lib/actions/integrations";

export default function TestEventButton({ endpointId }: { endpointId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(sendTestEvent, null);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="endpointId" value={endpointId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-sky-400 hover:text-sky-300 transition disabled:opacity-50"
      >
        {pending ? "Enviando…" : "Enviar evento de prueba"}
      </button>
      {state && (
        <span className={`max-w-xs text-right text-[11px] ${state.ok ? "text-emerald-400" : "text-red-400"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
