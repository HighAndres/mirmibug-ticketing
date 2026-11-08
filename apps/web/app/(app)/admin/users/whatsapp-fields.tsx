import WhatsappIcon from "@/components/WhatsappIcon";

/**
 * Campos de WhatsApp del formulario de usuario (crear/editar).
 * El número se normaliza a E.164 en el servidor (lib/integrations/phone.ts);
 * aquí solo se captura. La verificación se hace con un botón aparte (edit page).
 */
export default function WhatsappFields({
  defaultPhone = null,
  defaultOptIn = false,
  verifiedAt = null,
  verifiedByName = null,
}: {
  defaultPhone?: string | null;
  defaultOptIn?: boolean;
  verifiedAt?: Date | null;
  verifiedByName?: string | null;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <WhatsappIcon size={13} className="text-[#25D366]" />
          WhatsApp
        </h3>
        {defaultPhone &&
          (verifiedAt ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
              title={`Verificado${verifiedByName ? ` por ${verifiedByName}` : ""} el ${new Date(verifiedAt).toLocaleDateString("es-MX")}`}
            >
              ✓ Verificado
            </span>
          ) : (
            <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              Sin verificar
            </span>
          ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="whatsappPhone" className="block text-sm font-medium text-zinc-400 mb-2">
            Número de WhatsApp
          </label>
          <input
            id="whatsappPhone"
            name="whatsappPhone"
            type="tel"
            inputMode="tel"
            defaultValue={defaultPhone ?? ""}
            placeholder="+52 55 1234 5678"
            autoComplete="off"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
          />
          <p className="mt-1 text-[11px] text-zinc-600">
            Se guarda en formato internacional (+52…). Para México basta con los 10 dígitos. Si cambias el
            número, habrá que verificarlo de nuevo.
          </p>
        </div>
        <div className="flex items-start pt-8">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              name="whatsappOptIn"
              type="checkbox"
              defaultChecked={defaultOptIn}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-[#38d84e]"
            />
            <span>
              <span className="block text-sm text-zinc-300">Acepta notificaciones por WhatsApp</span>
              <span className="block text-[11px] text-zinc-600">
                Sin opt-in no se le envían actualizaciones de sus tickets por este canal.
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
