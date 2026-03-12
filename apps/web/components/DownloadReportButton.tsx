"use client";

import { useState } from "react";

interface Props {
  clients: { id: string; name: string }[];
  isSuperAdmin: boolean;
  defaultClientId: string | null;
}

export function DownloadReportButton({ clients, isSuperAdmin, defaultClientId }: Props) {
  const [selectedClient, setSelectedClient] = useState(defaultClientId ?? "all");
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedClient && selectedClient !== "all") {
        params.set("clientId", selectedClient);
      } else {
        params.set("clientId", "all");
      }

      const res = await fetch(`/api/reports/pdf?${params.toString()}`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        alert(err.error ?? "Error al generar el reporte");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Extract filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition");
      let filename = "reporte.pdf";
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading PDF:", err);
      alert("Error al descargar el reporte");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {isSuperAdmin && clients.length > 0 && (
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#111111] px-3 py-2 text-sm text-white focus:border-[#38d84e]/50 focus:outline-none focus:ring-1 focus:ring-[#38d84e]/30"
        >
          <option value="all">Todos los clientes</option>
          {clients.map((c: { id: string; name: string }) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <button
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-[#38d84e] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#2ec43e] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generando...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Descargar PDF
          </>
        )}
      </button>
    </div>
  );
}
