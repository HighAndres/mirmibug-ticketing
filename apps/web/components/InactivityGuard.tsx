"use client";

import { useEffect, useRef, useCallback } from "react";
import { signOut } from "next-auth/react";

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"] as const;

export default function InactivityGuard() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = useCallback(() => {
    signOut({ callbackUrl: "/login?reason=inactivity" });
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(handleLogout, INACTIVITY_TIMEOUT_MS);
  }, [handleLogout]);

  useEffect(() => {
    // Iniciar timer
    resetTimer();

    // Escuchar actividad del usuario
    const handler = () => resetTimer();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handler, { passive: true });
    }

    // Sincronizar entre tabs usando storage events
    const storageHandler = (e: StorageEvent) => {
      if (e.key === "lastActivity") resetTimer();
    };
    window.addEventListener("storage", storageHandler);

    // Marcar actividad en localStorage para sync entre tabs
    const markActivity = () => {
      try {
        localStorage.setItem("lastActivity", Date.now().toString());
      } catch {
        // localStorage no disponible
      }
    };
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handler);
        window.removeEventListener(event, markActivity);
      }
      window.removeEventListener("storage", storageHandler);
    };
  }, [resetTimer]);

  return null;
}
