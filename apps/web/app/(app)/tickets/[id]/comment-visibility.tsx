"use client";

import { useState } from "react";
import WhatsappIcon from "@/components/WhatsappIcon";

/**
 * Toggle "nota interna" del formulario de comentarios con una leyenda que
 * deja claro qué ve el cliente y por qué canales se le notifica.
 */
export default function CommentVisibilityToggle({
  canInternal,
  whatsappNotifies,
}: {
  /** CLIENT_USER no puede escribir notas internas */
  canInternal: boolean;
  /** El solicitante tiene WhatsApp con opt-in: un comentario público le llega por ahí */
  whatsappNotifies: boolean;
}) {
  const [internal, setInternal] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {canInternal && (
        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            name="isInternal"
            value="true"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            className="rounded border-white/20 bg-white/5 accent-amber-400"
          />
          Nota interna
        </label>
      )}
      <p
        className={`flex items-center gap-1.5 text-[11px] ${
          internal ? "text-amber-400/90" : whatsappNotifies ? "text-[#25D366]/90" : "text-zinc-500"
        }`}
      >
        {internal ? (
          <>Solo la ve el equipo. No se notifica al cliente por ningún canal.</>
        ) : whatsappNotifies ? (
          <>
            <WhatsappIcon size={11} />
            Comentario público: el cliente lo verá y recibirá aviso por WhatsApp.
          </>
        ) : (
          <>Comentario público: el cliente lo verá en el portal (y por correo si está activo).</>
        )}
      </p>
    </div>
  );
}
