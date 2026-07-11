"use client";

import { useState, useTransition } from "react";

/**
 * Botón de borrado con confirmación nativa.
 * Recibe la server action ya enlazada (ej. deleteUser.bind(null, id)).
 * Si `disabledReason` está presente, se muestra deshabilitado con tooltip
 * explicando por qué no se puede borrar.
 */
export default function ConfirmDeleteButton({
  action,
  confirmMessage,
  label = "Borrar",
  disabledReason,
}: {
  action: () => Promise<void>;
  confirmMessage: string;
  label?: string;
  disabledReason?: string;
}) {
  const [isPending, startTransition] = useTransition();

  if (disabledReason) {
    return (
      <span
        className="cursor-help text-xs text-zinc-700"
        title={disabledReason}
      >
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm(confirmMessage)) return;
        startTransition(async () => {
          try {
            await action();
          } catch (e) {
            alert(e instanceof Error ? e.message : "Error al borrar");
          }
        });
      }}
      className="text-xs text-red-500 transition hover:text-red-400 disabled:opacity-50"
    >
      {isPending ? "Borrando..." : label}
    </button>
  );
}
