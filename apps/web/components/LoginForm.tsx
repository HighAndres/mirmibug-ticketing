"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
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
  const logoSrc = branding?.logoUrl ?? "/branding/mirmibug-logo-green_sfondo.png";

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
      setError("Correo o contrasena incorrectos, o cuenta bloqueada.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4 overflow-hidden">

      {/* ---- Keyframes inyectados con colores dinámicos ---- */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes login-float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, -30px) scale(1.05); }
          66% { transform: translate(-30px, 20px) scale(0.95); }
        }
        @keyframes login-float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-35px, 25px) scale(1.08); }
          66% { transform: translate(25px, -35px) scale(0.92); }
        }
        @keyframes login-float-3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.4; }
          50% { transform: translate(calc(-50% + 25px), calc(-50% - 20px)) scale(1.15); opacity: 0.7; }
        }
        @keyframes login-pulse {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 1; transform: scale(2); }
        }
        @keyframes login-fade-in {
          0% { opacity: 0; transform: translateY(10px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes login-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(${primaryRgb},0.1), 0 0 60px rgba(${primaryRgb},0.05); }
          50% { box-shadow: 0 0 40px rgba(${primaryRgb},0.2), 0 0 80px rgba(${primaryRgb},0.1); }
        }
        .login-input:focus {
          border-color: ${primary}80 !important;
          box-shadow: 0 0 0 1px ${primary}4d;
        }
        .login-btn:hover:not(:disabled) {
          background-color: ${primaryDark};
          box-shadow: 0 10px 15px -3px ${primary}33;
        }
      `,
        }}
      />

      {/* ---- Fondo animado ---- */}

      {/* Grid sutil */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.04,
          backgroundImage: `linear-gradient(rgba(${primaryRgb},0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(${primaryRgb},0.6) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Orbe 1 */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          top: "-80px",
          left: "-80px",
          width: "500px",
          height: "500px",
          background: `radial-gradient(circle, rgba(${primaryRgb},0.12) 0%, transparent 70%)`,
          filter: "blur(60px)",
          animation: "login-float-1 14s ease-in-out infinite",
        }}
      />

      {/* Orbe 2 */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          bottom: "-60px",
          right: "-60px",
          width: "450px",
          height: "450px",
          background: `radial-gradient(circle, rgba(${primaryRgb},0.15) 0%, transparent 70%)`,
          filter: "blur(50px)",
          animation: "login-float-2 11s ease-in-out infinite",
        }}
      />

      {/* Orbe 3 */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          top: "50%",
          left: "50%",
          width: "300px",
          height: "300px",
          background: `radial-gradient(circle, rgba(${accentRgb},0.08) 0%, transparent 70%)`,
          filter: "blur(40px)",
          animation: "login-float-3 8s ease-in-out infinite",
        }}
      />

      {/* Partículas flotantes */}
      {[
        { top: "12%", left: "18%", size: 3, delay: "0s", dur: "5s" },
        { top: "28%", right: "12%", size: 4, delay: "1s", dur: "4s" },
        { bottom: "22%", left: "8%", size: 3, delay: "2s", dur: "6s" },
        { top: "55%", right: "22%", size: 2, delay: "0.5s", dur: "5s" },
        { top: "8%", right: "30%", size: 3, delay: "1.5s", dur: "4.5s" },
        { bottom: "12%", right: "35%", size: 4, delay: "3s", dur: "3.5s" },
        { top: "75%", left: "25%", size: 2, delay: "2.5s", dur: "5.5s" },
        { top: "40%", left: "5%", size: 3, delay: "0.8s", dur: "4.2s" },
      ].map((p, i) => (
        <div
          key={i}
          className="pointer-events-none absolute rounded-full"
          style={{
            top: p.top,
            left: p.left,
            right: p.right,
            bottom: p.bottom,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: primary,
            animation: `login-pulse ${p.dur} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}

      {/* Viñeta radial */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, #0a0a0a 75%)",
        }}
      />

      {/* ---- Contenido ---- */}
      <div
        className="relative z-10 w-full max-w-sm"
        style={{
          animation: mounted ? "login-fade-in 0.6s ease-out forwards" : "none",
          opacity: mounted ? 1 : 0,
        }}
      >
        {/* Logo / marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            className="relative mb-4 h-24 w-24 rounded-full"
            style={{ animation: "login-glow 4s ease-in-out infinite" }}
          >
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={brandName}
                className="h-full w-full object-contain"
                style={{
                  filter: `drop-shadow(0 0 25px rgba(${primaryRgb},0.4))`,
                }}
              />
            ) : (
              <Image
                src="/branding/mirmibug-logo-green_sfondo.png"
                alt="Mirmibug"
                fill
                className="object-contain"
                style={{
                  filter: `drop-shadow(0 0 25px rgba(${primaryRgb},0.4))`,
                }}
                priority
              />
            )}
          </div>
          <p
            className="inline-block rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.2em]"
            style={{
              border: `1px solid ${primary}4d`,
              backgroundColor: `${primary}1a`,
              color: accent,
            }}
          >
            {brandName}
          </p>
          <h1 className="mt-4 text-2xl font-bold text-white">
            Acceder al sistema
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-[#111111]/80 p-6 shadow-xl shadow-black/30 backdrop-blur-sm"
        >
          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Email */}
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-zinc-400"
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
              className="login-input w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none transition"
            />
          </div>

          {/* Contraseña */}
          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-zinc-400"
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
              className="login-input w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none transition"
            />
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={loading}
            className="login-btn w-full rounded-xl px-4 py-3 text-sm font-semibold text-black transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: primary }}
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-zinc-600">
            Powered by{" "}
            <span style={{ color: accent }}>Mirmibug</span>
          </p>
          {branding &&
            (branding.supportPhone || branding.supportEmail) && (
              <div className="mt-2 space-y-0.5 text-xs text-zinc-600">
                {branding.supportPhone && (
                  <p>Soporte: {branding.supportPhone}</p>
                )}
                {branding.supportEmail && <p>{branding.supportEmail}</p>}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
