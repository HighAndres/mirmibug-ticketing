"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type TenantBranding = {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  welcomeText: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
};

type LoginFormProps = {
  branding?: TenantBranding | null;
  callbackUrl?: string;
};

// ---------------------------------------------------------------------------
// Utilidades de color
// ---------------------------------------------------------------------------
function isValidHex(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)}`;
}

function darkenHex(hex: string, amount = 20): string {
  const h = hex.replace("#", "");
  const r = Math.max(0, parseInt(h.substring(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(h.substring(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(h.substring(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// LoginForm
// ---------------------------------------------------------------------------
export default function LoginForm({
  branding,
  callbackUrl = "/dashboard",
}: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inactivityLogout = searchParams.get("reason") === "inactivity";

  // Derivar colores con validación
  const primary =
    branding?.primaryColor && isValidHex(branding.primaryColor)
      ? branding.primaryColor
      : "#38d84e";
  const accent =
    branding?.accentColor && isValidHex(branding.accentColor)
      ? branding.accentColor
      : "#7CFF8D";
  const primaryRgb = hexToRgb(primary);
  const accentRgb = hexToRgb(accent);
  const primaryDark = darkenHex(primary);

  const brandName = branding?.name ?? "Mirmibug IT Services";
  const subtitle =
    branding?.welcomeText ?? "Ingresa tus credenciales para continuar";

  // State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Correo o contraseña incorrectos, o cuenta bloqueada.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#060606] px-4">

      {/* ---- Keyframes con colores dinámicos ---- */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes aurora-1 {
          0%, 100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(9%, 7%) scale(1.18); }
        }
        @keyframes aurora-2 {
          0%, 100% { transform: translate(0,0) scale(1.05); }
          50%      { transform: translate(-8%, -6%) scale(1.25); }
        }
        @keyframes aurora-3 {
          0%, 100% { transform: translate(-50%,-50%) scale(1);   opacity: .45; }
          50%      { transform: translate(-44%,-56%) scale(1.3); opacity: .8; }
        }
        @keyframes aurora-spin { to { transform: translate(-50%,-50%) rotate(360deg); } }
        @keyframes login-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(${primaryRgb},0.25), 0 0 70px rgba(${accentRgb},0.12); }
          50%      { box-shadow: 0 0 45px rgba(${primaryRgb},0.4),  0 0 100px rgba(${accentRgb},0.2); }
        }
        @keyframes login-rise {
          0%   { opacity: 0; transform: translateY(14px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes login-twinkle {
          0%, 100% { opacity: .2; transform: scale(1); }
          50%      { opacity: .9; transform: scale(1.8); }
        }
        .login-input {
          transition: border-color .2s, box-shadow .2s, background-color .2s;
        }
        .login-input:focus {
          border-color: ${primary}99 !important;
          box-shadow: 0 0 0 3px ${primary}26;
          background-color: rgba(255,255,255,0.06);
        }
        .login-btn { transition: transform .15s, box-shadow .25s, filter .2s; }
        .login-btn:hover:not(:disabled) {
          filter: brightness(1.05);
          box-shadow: 0 12px 28px -8px ${primary}80;
          transform: translateY(-1px);
        }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
      `,
        }}
      />

      {/* ============ Fondo Aurora ============ */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Base con tinte de marca */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(125% 120% at 50% 0%, rgba(${primaryRgb},0.10) 0%, #070707 45%, #060606 100%)`,
          }}
        />

        {/* Aurora 1 — primaria, arriba-izquierda */}
        <div
          className="absolute rounded-full"
          style={{
            top: "-18%",
            left: "-12%",
            width: "60vw",
            height: "60vw",
            background: `radial-gradient(circle, rgba(${primaryRgb},0.38) 0%, transparent 62%)`,
            filter: "blur(90px)",
            animation: "aurora-1 18s ease-in-out infinite",
          }}
        />

        {/* Aurora 2 — acento, abajo-derecha */}
        <div
          className="absolute rounded-full"
          style={{
            bottom: "-22%",
            right: "-14%",
            width: "58vw",
            height: "58vw",
            background: `radial-gradient(circle, rgba(${accentRgb},0.34) 0%, transparent 62%)`,
            filter: "blur(100px)",
            animation: "aurora-2 15s ease-in-out infinite",
          }}
        />

        {/* Aurora 3 — mezcla al centro */}
        <div
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: "42vw",
            height: "42vw",
            background: `radial-gradient(circle, rgba(${primaryRgb},0.22) 0%, rgba(${accentRgb},0.10) 45%, transparent 70%)`,
            filter: "blur(70px)",
            animation: "aurora-3 12s ease-in-out infinite",
          }}
        />

        {/* Barrido cónico muy sutil */}
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: "150vmax",
            height: "150vmax",
            transform: "translate(-50%,-50%)",
            background: `conic-gradient(from 0deg, transparent 0deg, rgba(${primaryRgb},0.05) 60deg, transparent 140deg, rgba(${accentRgb},0.05) 220deg, transparent 320deg)`,
            animation: "aurora-spin 44s linear infinite",
          }}
        />

        {/* Grid tenue */}
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.035,
            backgroundImage: `linear-gradient(rgba(${primaryRgb},0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(${primaryRgb},0.7) 1px, transparent 1px)`,
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse at center, #000 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, #000 30%, transparent 75%)",
          }}
        />

        {/* Destellos */}
        {[
          { top: "16%", left: "20%", size: 3, delay: "0s", dur: "5s" },
          { top: "26%", right: "16%", size: 4, delay: "1s", dur: "4s" },
          { bottom: "24%", left: "12%", size: 3, delay: "2s", dur: "6s" },
          { top: "62%", right: "24%", size: 2, delay: "0.5s", dur: "5s" },
          { top: "12%", right: "34%", size: 3, delay: "1.5s", dur: "4.5s" },
          { bottom: "16%", right: "30%", size: 4, delay: "3s", dur: "3.5s" },
        ].map((p, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              top: p.top,
              left: p.left,
              right: p.right,
              bottom: p.bottom,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: i % 2 === 0 ? primary : accent,
              boxShadow: `0 0 8px ${i % 2 === 0 ? primary : accent}`,
              animation: `login-twinkle ${p.dur} ease-in-out ${p.delay} infinite`,
            }}
          />
        ))}

        {/* Viñeta para enfocar la tarjeta */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at center, transparent 25%, rgba(6,6,6,0.85) 95%)",
          }}
        />
      </div>

      {/* ============ Contenido ============ */}
      <div
        className="relative z-10 w-full max-w-sm"
        style={{
          animation: mounted ? "login-rise 0.7s cubic-bezier(0.16,1,0.3,1) forwards" : "none",
          opacity: mounted ? 1 : 0,
        }}
      >
        {/* Logo / marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            className="relative mb-5 flex h-24 w-24 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl"
            style={{ animation: "login-glow 4.5s ease-in-out infinite" }}
          >
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={brandName}
                className="h-16 w-16 object-contain"
                style={{ filter: `drop-shadow(0 0 18px rgba(${primaryRgb},0.45))` }}
              />
            ) : (
              <Image
                src="/branding/mirmibug-logo-green_sfondo.png"
                alt="Mirmibug"
                width={64}
                height={64}
                className="object-contain"
                style={{ filter: `drop-shadow(0 0 18px rgba(${primaryRgb},0.45))` }}
                priority
              />
            )}
          </div>
          <p
            className="inline-block rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] backdrop-blur-sm"
            style={{
              border: `1px solid ${primary}40`,
              backgroundColor: `${primary}14`,
              color: accent,
            }}
          >
            {brandName}
          </p>
          <h1 className="mt-4 text-2xl font-bold text-white">
            Acceder al sistema
          </h1>
          <p className="mt-1.5 text-sm text-zinc-400">{subtitle}</p>
        </div>

        {/* Card de vidrio */}
        <form
          onSubmit={handleSubmit}
          className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.04] p-6 shadow-2xl shadow-black/50 backdrop-blur-2xl sm:p-7"
        >
          {/* Highlight superior */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${primary}66, transparent)`,
            }}
          />

          {/* Inactividad */}
          {inactivityLogout && !error && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              Tu sesión se cerró por inactividad. Ingresa de nuevo para continuar.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Email */}
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-zinc-300"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              className="login-input w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none"
            />
          </div>

          {/* Contraseña */}
          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-zinc-300"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="login-input w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none"
            />
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={loading}
            className="login-btn w-full rounded-xl px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: `linear-gradient(180deg, ${primary}, ${primaryDark})`,
            }}
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-zinc-600">
            Powered by <span style={{ color: accent }}>Mirmibug</span>
          </p>
          {branding && (branding.supportPhone || branding.supportEmail) && (
            <div className="mt-2 space-y-0.5 text-xs text-zinc-600">
              {branding.supportPhone && <p>Soporte: {branding.supportPhone}</p>}
              {branding.supportEmail && <p>{branding.supportEmail}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
