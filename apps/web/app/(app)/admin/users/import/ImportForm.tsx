"use client";

import { useActionState, useRef } from "react";
import { importUsers, type ImportResult } from "@/lib/actions/admin";
import Link from "next/link";

const CSV_TEMPLATE = `name,email,password,role,clientId
Ana López,ana@empresa.com,Temporal123!,CLIENT_USER,
Carlos Ruiz,carlos@empresa.com,Temporal123!,AGENT,
`;

const ROLE_KEYS = ["CLIENT_USER", "CLIENT_ADMIN", "CLIENT_SUPERVISOR", "AGENT", "SUPERADMIN"];

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_usuarios.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportForm({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [result, action, pending] = useActionState<ImportResult | null, FormData>(
    importUsers,
    null
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const sectionCls = "rounded-2xl border border-white/10 bg-[#111111] p-6";

  return (
    <div className="space-y-6">

      {/* Instructions */}
      <div className={sectionCls}>
        <h2 className="text-base font-semibold text-white mb-3">Formato del archivo CSV</h2>
        <p className="text-sm text-zinc-400 mb-4">
          El archivo debe tener las siguientes columnas en orden, con encabezado en la primera fila:
        </p>

        <div className="overflow-x-auto rounded-xl border border-white/10 mb-4">
          <table className="min-w-full text-xs">
            <thead className="bg-white/5 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">Columna</th>
                <th className="px-4 py-2 font-medium">Descripción</th>
                <th className="px-4 py-2 font-medium">Requerido</th>
              </tr>
            </thead>
            <tbody>
              {[
                { col: "name", desc: "Nombre completo del usuario", req: "Sí" },
                { col: "email", desc: "Correo electrónico (único)", req: "Sí" },
                { col: "password", desc: "Contraseña inicial", req: "Sí" },
                {
                  col: "role",
                  desc: `Clave del rol: ${ROLE_KEYS.join(", ")}`,
                  req: "Sí",
                },
                {
                  col: "clientId",
                  desc: isSuperAdmin
                    ? "ID del cliente (dejar vacío para global)"
                    : "Se asigna automáticamente a tu empresa",
                  req: "No",
                },
              ].map((r) => (
                <tr key={r.col} className="border-t border-white/5">
                  <td className="px-4 py-2 font-mono text-[#7CFF8D]">{r.col}</td>
                  <td className="px-4 py-2 text-zinc-400">{r.desc}</td>
                  <td className="px-4 py-2 text-zinc-400">{r.req}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
        >
          ↓ Descargar plantilla CSV
        </button>
      </div>

      {/* Upload form */}
      <form action={action} className={sectionCls}>
        <h2 className="text-base font-semibold text-white mb-4">Cargar archivo</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Archivo CSV
            </label>
            <input
              ref={fileRef}
              name="csv"
              type="file"
              accept=".csv,text/csv"
              required
              className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-white/20 cursor-pointer"
            />
            <p className="mt-1 text-xs text-zinc-600">Solo archivos .csv · máx 1 MB</p>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-[#38d84e] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040] disabled:opacity-50"
          >
            {pending ? "Importando..." : "Importar usuarios"}
          </button>
        </div>
      </form>

      {/* Results */}
      {result && (
        <div className={sectionCls}>
          <h2 className="text-base font-semibold text-white mb-4">Resultado de la importación</h2>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl bg-white/5 p-3 text-center">
              <p className="text-2xl font-bold text-white">{result.total}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Total filas</p>
            </div>
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-400">{result.success}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Creados</p>
            </div>
            <div className={`rounded-xl p-3 text-center ${result.errors > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-white/5"}`}>
              <p className={`text-2xl font-bold ${result.errors > 0 ? "text-red-400" : "text-zinc-500"}`}>{result.errors}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Errores</p>
            </div>
          </div>

          {/* Row details */}
          {result.rows.length > 0 && (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-white/5 text-left text-zinc-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-4 py-2 font-medium">Nombre</th>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.row} className="border-t border-white/5">
                      <td className="px-4 py-2 text-zinc-600">{row.row}</td>
                      <td className="px-4 py-2 text-zinc-300">{row.name || "—"}</td>
                      <td className="px-4 py-2 text-zinc-400">{row.email || "—"}</td>
                      <td className="px-4 py-2">
                        {row.status === "ok" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            ✓ Creado
                          </span>
                        ) : (
                          <span className="text-red-400">✗ {row.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.success > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <Link
                href="/admin/users"
                className="rounded-xl bg-[#38d84e] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#2bc040]"
              >
                Ver usuarios →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
