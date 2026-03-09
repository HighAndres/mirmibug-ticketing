"use client";

import { useRef, useState } from "react";
import { updateClientBranding, removeClientLogo } from "@/lib/actions/admin";
import Image from "next/image";

type Client = {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  welcomeText: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  address: string | null;
  timezone: string | null;
  slaHours: number | null;
};

const TIMEZONES = [
  "America/Mexico_City",
  "America/Monterrey",
  "America/Cancun",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/Madrid",
  "UTC",
];

export default function BrandingForm({ client }: { client: Client }) {
  const [logoPreview, setLogoPreview] = useState<string | null>(client.logoUrl);
  const [primaryColor, setPrimaryColor] = useState(client.primaryColor ?? "#38d84e");
  const [accentColor, setAccentColor] = useState(client.accentColor ?? "#7CFF8D");
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogoPreview(url);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      await updateClientBranding(client.id, fd);
    } finally {
      setPending(false);
    }
  }

  async function handleRemoveLogo() {
    if (!confirm("¿Eliminar el logo actual?")) return;
    await removeClientLogo(client.id);
    setLogoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20";
  const labelCls = "block text-sm font-medium text-zinc-400 mb-2";
  const sectionCls = "rounded-2xl border border-white/10 bg-[#111111] p-6 space-y-5";

  return (
    <form onSubmit={handleSubmit} encType="multipart/form-data" className="space-y-6">

      {/* ── Identidad visual ── */}
      <div className={sectionCls}>
        <h2 className="text-base font-semibold text-white">Identidad visual</h2>

        {/* Logo */}
        <div>
          <label className={labelCls}>Logo del cliente</label>
          <div className="flex items-start gap-6">
            {/* Preview box */}
            <div className="flex h-24 w-40 items-center justify-center rounded-xl border border-white/10 bg-[#0a0a0a] overflow-hidden flex-shrink-0">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <span className="text-xs text-zinc-600">Sin logo</span>
              )}
            </div>
            <div className="space-y-2 flex-1">
              <input
                ref={fileRef}
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                onChange={handleFileChange}
                className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-white/20 cursor-pointer"
              />
              <p className="text-xs text-zinc-600">PNG, JPG, WebP o SVG · máx 2 MB</p>
              {client.logoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="text-xs text-red-400 hover:text-red-300 transition"
                >
                  Eliminar logo actual
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Colors */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="primaryColor" className={labelCls}>
              Color primario
            </label>
            <div className="flex items-center gap-3">
              <input
                id="primaryColor"
                name="primaryColor"
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-14 rounded-lg border border-white/10 bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white font-mono outline-none focus:border-[#38d84e]/50"
                placeholder="#38d84e"
              />
              {/* hidden field that actually submits */}
              <input type="hidden" name="primaryColor" value={primaryColor} />
            </div>
            {/* Live preview swatch */}
            <div
              className="mt-2 h-8 rounded-lg flex items-center justify-center text-xs font-semibold"
              style={{ backgroundColor: primaryColor, color: "#000" }}
            >
              Color primario
            </div>
          </div>

          <div>
            <label htmlFor="accentColor" className={labelCls}>
              Color de acento
            </label>
            <div className="flex items-center gap-3">
              <input
                id="accentColor"
                name="accentColor"
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-14 rounded-lg border border-white/10 bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white font-mono outline-none focus:border-[#38d84e]/50"
                placeholder="#7CFF8D"
              />
              <input type="hidden" name="accentColor" value={accentColor} />
            </div>
            <div
              className="mt-2 h-8 rounded-lg flex items-center justify-center text-xs font-semibold"
              style={{ backgroundColor: accentColor, color: "#000" }}
            >
              Color de acento
            </div>
          </div>
        </div>

        {/* Brand preview card */}
        <div>
          <label className={labelCls}>Vista previa del sidebar</label>
          <div
            className="rounded-xl p-4 text-sm"
            style={{ backgroundColor: "#0f0f0f", border: `1px solid ${primaryColor}33` }}
          >
            <div className="flex items-center gap-3 mb-3">
              {logoPreview ? (
                <img src={logoPreview} alt="" className="h-8 w-8 object-contain rounded" />
              ) : (
                <div
                  className="h-8 w-8 rounded flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: primaryColor, color: "#000" }}
                >
                  {client.name.charAt(0)}
                </div>
              )}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: primaryColor }}>
                  {client.name}
                </p>
                <p className="text-[10px] text-zinc-500">IT Services Platform</p>
              </div>
            </div>
            <div className="space-y-1">
              {["Dashboard", "Tickets", "Usuarios"].map((item) => (
                <div
                  key={item}
                  className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition"
                  style={{}}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Texto de bienvenida ── */}
      <div className={sectionCls}>
        <h2 className="text-base font-semibold text-white">Mensaje de bienvenida</h2>
        <div>
          <label htmlFor="welcomeText" className={labelCls}>
            Texto en la pantalla de inicio de sesión{" "}
            <span className="text-zinc-600 text-xs">(opcional)</span>
          </label>
          <textarea
            id="welcomeText"
            name="welcomeText"
            rows={3}
            defaultValue={client.welcomeText ?? ""}
            placeholder="Bienvenido al portal de soporte de tu empresa..."
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none resize-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
          />
        </div>
      </div>

      {/* ── Información de contacto ── */}
      <div className={sectionCls}>
        <h2 className="text-base font-semibold text-white">Información de contacto</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="supportPhone" className={labelCls}>Teléfono de soporte</label>
            <input
              id="supportPhone"
              name="supportPhone"
              type="tel"
              defaultValue={client.supportPhone ?? ""}
              placeholder="+52 55 1234 5678"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="supportEmail" className={labelCls}>Email de soporte</label>
            <input
              id="supportEmail"
              name="supportEmail"
              type="email"
              defaultValue={client.supportEmail ?? ""}
              placeholder="soporte@empresa.com"
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label htmlFor="address" className={labelCls}>Dirección</label>
          <input
            id="address"
            name="address"
            type="text"
            defaultValue={client.address ?? ""}
            placeholder="Av. Insurgentes 1234, CDMX"
            className={inputCls}
          />
        </div>
      </div>

      {/* ── Configuración operativa ── */}
      <div className={sectionCls}>
        <h2 className="text-base font-semibold text-white">Configuración operativa</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="timezone" className={labelCls}>Zona horaria</label>
            <select
              id="timezone"
              name="timezone"
              defaultValue={client.timezone ?? "America/Mexico_City"}
              className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm text-white outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="slaHours" className={labelCls}>
              SLA de respuesta{" "}
              <span className="text-zinc-600 text-xs">(horas hábiles)</span>
            </label>
            <input
              id="slaHours"
              name="slaHours"
              type="number"
              min={1}
              max={720}
              defaultValue={client.slaHours ?? 8}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <a
          href="/admin/clients"
          className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
        >
          Cancelar
        </a>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[#38d84e] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040] disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar personalización"}
        </button>
      </div>
    </form>
  );
}
