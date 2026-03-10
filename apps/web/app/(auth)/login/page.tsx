"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Image from "next/image";

// ---------------------------------------------------------------------------
// Formulario de login (necesita Suspense por useSearchParams)
// ---------------------------------------------------------------------------
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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

      {/* ---- Inyectar keyframes ---- */}
      <style dangerouslySetInnerHTML={{ __html: `
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
          0%, 100% { box-shadow: 0 0 30px rgba(56,216,78,0.1), 0 0 60px rgba(56,216,78,0.05); }
          50% { box-shadow: 0 0 40px rgba(56,216,78,0.2), 0 0 80px rgba(56,216,78,0.1); }
        }
      `}} />

      {/* ---- Fondo animado ---- */}

      {/* Grid sutil */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.04,
          backgroundImage:
            "linear-gradient(rgba(56,216,78,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(56,216,78,0.6) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Orbe 1 — grande, arriba izquierda */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          top: "-80px",
          left: "-80px",
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, rgba(56,216,78,0.12) 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "login-float-1 14s ease-in-out infinite",
        }}
      />

      {/* Orbe 2 — abajo derecha */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          bottom: "-60px",
          right: "-60px",
          width: "450px",
          height: "450px",
          background: "radial-gradient(circle, rgba(56,216,78,0.15) 0%, transparent 70%)",
          filter: "blur(50px)",
          animation: "login-float-2 11s ease-in-out infinite",
        }}
      />

      {/* Orbe 3 — centro, más tenue */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          top: "50%",
          left: "50%",
          width: "300px",
          height: "300px",
          background: "radial-gradient(circle, rgba(124,255,141,0.08) 0%, transparent 70%)",
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
          className="pointer-events-none absolute rounded-full bg-[#38d84e]"
          style={{
            top: p.top,
            left: p.left,
            right: p.right,
            bottom: p.bottom,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animation: `login-pulse ${p.dur} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}

      {/* Viñeta radial */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, #0a0a0a 75%)",
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
            style={{
              animation: "login-glow 4s ease-in-out infinite",
            }}
          >
            <Image
              src="/branding/mirmibug-logo-green_sfondo.png"
              alt="Mirmibug"
              fill
              className="object-contain drop-shadow-[0_0_25px_rgba(56,216,78,0.4)]"
              priority
            />
          </div>
          <p className="inline-block rounded-full border border-[#38d84e]/30 bg-[#38d84e]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-[#7CFF8D]">
            Mirmibug IT Services
          </p>
          <h1 className="mt-4 text-2xl font-bold text-white">
            Acceder al sistema
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Ingresa tus credenciales para continuar
          </p>
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
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/30"
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
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/30"
            />
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#38d84e] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#2bc040] hover:shadow-lg hover:shadow-[#38d84e]/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>

        {/* Footer de marca */}
        <p className="mt-6 text-center text-xs text-zinc-600">
          Powered by{" "}
          <span className="text-[#7CFF8D]">Mirmibug</span>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página exportada con Suspense para useSearchParams
// ---------------------------------------------------------------------------
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
