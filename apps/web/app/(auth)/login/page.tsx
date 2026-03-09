"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

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
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm">

        {/* Logo / marca */}
        <div className="mb-8 text-center">
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
          className="rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-xl shadow-black/30"
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
            className="w-full rounded-xl bg-[#38d84e] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#2bc040] disabled:opacity-50 disabled:cursor-not-allowed"
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
