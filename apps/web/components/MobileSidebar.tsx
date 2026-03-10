"use client";

import { useState } from "react";

export function MobileMenuButton() {
  return (
    <button
      type="button"
      aria-label="Abrir menú"
      data-mobile-menu-toggle
      onClick={() => {
        document.getElementById("mobile-sidebar")?.classList.remove("translate-x-full");
        document.getElementById("mobile-overlay")?.classList.remove("hidden");
      }}
      className="rounded-lg border border-white/10 p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white lg:hidden"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 5h14M3 10h14M3 15h14" />
      </svg>
    </button>
  );
}

export function MobileSidebarWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Overlay */}
      <div
        id="mobile-overlay"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm hidden lg:hidden"
        onClick={() => {
          document.getElementById("mobile-sidebar")?.classList.add("translate-x-full");
          document.getElementById("mobile-overlay")?.classList.add("hidden");
        }}
      />

      {/* Sidebar deslizable desde la derecha en mobile */}
      <aside
        id="mobile-sidebar"
        className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-white/10 bg-[#0f0f0f] transition-transform duration-300 ease-in-out translate-x-full lg:hidden"
      >
        {/* Botón de cerrar */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-sm font-medium text-zinc-400">Menú</span>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => {
              document.getElementById("mobile-sidebar")?.classList.add("translate-x-full");
              document.getElementById("mobile-overlay")?.classList.add("hidden");
            }}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        </div>

        {children}
      </aside>
    </>
  );
}
