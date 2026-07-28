import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEmailSettingsForForm } from "@/lib/email-settings";
import { updateEmailSettings } from "@/lib/actions/settings";
import TestEmailForm from "./TestEmailForm";

export const metadata = { title: "Configuración de correo" };

const TOGGLES: { name: string; label: string; hint: string }[] = [
  { name: "onTicketCreated", label: "Ticket creado", hint: "Al solicitante cuando registra un ticket" },
  { name: "onTicketAssigned", label: "Ticket asignado", hint: "Al agente cuando se le asigna" },
  { name: "onStatusChanged", label: "Cambio de estado", hint: "Al solicitante, asignado y colaboradores" },
  { name: "onNewComment", label: "Nuevo comentario", hint: "En comentarios públicos" },
  { name: "onCollaboratorAdded", label: "Colaborador agregado", hint: "Al agregar a alguien como colaborador" },
];

export default async function EmailSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.roleKey !== "SUPERADMIN") redirect("/dashboard");

  const s = await getEmailSettingsForForm();

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-[#15171c] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50";
  const labelClass = "block text-xs text-zinc-500 mb-1";

  return (
    <div className="min-h-full bg-[#15171c] text-white">
      <section className="border-b border-white/10 bg-[#1c1f26] px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold">Configuración de correo</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Servidor SMTP y notificaciones por correo del sistema.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-6 space-y-6">
        {/* Estado */}
        <div
          className={`rounded-2xl border p-4 text-sm ${
            s.enabled && s.smtpHost
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
              : "border-yellow-500/30 bg-yellow-500/5 text-yellow-300"
          }`}
        >
          {s.enabled && s.smtpHost
            ? "✓ Notificaciones activas y SMTP configurado."
            : !s.smtpHost
            ? "⚠ Sin servidor SMTP configurado — los correos no se envían (solo se registran en consola)."
            : "⚠ SMTP configurado pero el interruptor maestro está apagado — no se envían correos."}
        </div>

        {/* Formulario principal */}
        <form action={updateEmailSettings} className="space-y-6">
          {/* Interruptor maestro */}
          <div className="rounded-2xl border border-white/10 bg-[#22262e] p-5">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={s.enabled}
                className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[#38d84e]"
              />
              <span>
                <span className="text-sm font-medium text-white">Notificaciones por correo activadas</span>
                <span className="block text-xs text-zinc-500">Interruptor maestro. Si está apagado, no se envía ningún correo.</span>
              </span>
            </label>
          </div>

          {/* SMTP */}
          <div className="rounded-2xl border border-white/10 bg-[#22262e] p-5 space-y-4">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Servidor SMTP</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Host</label>
                <input name="smtpHost" defaultValue={s.smtpHost} placeholder="smtp.tuproveedor.com" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Puerto</label>
                <input name="smtpPort" type="number" defaultValue={s.smtpPort} placeholder="587" className={inputClass} />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="smtpSecure"
                    defaultChecked={s.smtpSecure}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[#38d84e]"
                  />
                  Conexión segura (SSL, puerto 465)
                </label>
              </div>
              <div>
                <label className={labelClass}>Usuario</label>
                <input name="smtpUser" defaultValue={s.smtpUser} placeholder="notificaciones@mirmiapps.com" className={inputClass} autoComplete="off" />
              </div>
              <div>
                <label className={labelClass}>
                  Contraseña {s.hasPassword && <span className="text-emerald-400">· configurada</span>}
                </label>
                <input
                  name="smtpPass"
                  type="password"
                  placeholder={s.hasPassword ? "•••••••• (dejar vacío para conservar)" : "••••••••"}
                  className={inputClass}
                  autoComplete="new-password"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Remitente (From)</label>
                <input name="smtpFrom" defaultValue={s.smtpFrom} placeholder="Mirmibug <notificaciones@mirmiapps.com>" className={inputClass} />
              </div>
            </div>
            <p className="text-[11px] text-zinc-600">
              La contraseña se guarda cifrada y nunca se muestra de vuelta. Déjala vacía para conservar la actual.
            </p>
          </div>

          {/* Toggles por tipo */}
          <div className="rounded-2xl border border-white/10 bg-[#22262e] p-5 space-y-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Tipos de notificación</h2>
            <div className="space-y-2">
              {TOGGLES.map((t) => (
                <label key={t.name} className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name={t.name}
                    defaultChecked={s[t.name as keyof typeof s] as boolean}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[#38d84e]"
                  />
                  <span>
                    <span className="text-sm text-zinc-300">{t.label}</span>
                    <span className="block text-xs text-zinc-600">{t.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="rounded-xl bg-[#38d84e] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
          >
            Guardar configuración
          </button>
        </form>

        {/* Prueba de correo */}
        <div className="rounded-2xl border border-white/10 bg-[#22262e] p-5 space-y-3">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Enviar correo de prueba</h2>
          <p className="text-[11px] text-zinc-600 -mt-1">
            Usa la configuración guardada e ignora el interruptor maestro. Guarda primero si cambiaste algo.
          </p>
          <TestEmailForm defaultTo={session.user.email ?? ""} />
        </div>
      </section>
    </div>
  );
}
