"use client";

import { useState } from "react";

type Role = { id: string; key: string; name: string };
type Client = { id: string; name: string };

const MULTI_CLIENT_ROLES = ["AGENT"];

export default function RoleClientSelector({
  roles,
  clients,
  defaultRoleId,
  defaultClientId,
  defaultClientIds,
  isSuperAdmin,
}: {
  roles: Role[];
  clients: Client[];
  defaultRoleId?: string;
  defaultClientId?: string | null;
  defaultClientIds?: string[];
  isSuperAdmin: boolean;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState(defaultRoleId ?? "");
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(
    new Set(defaultClientIds ?? (defaultClientId ? [defaultClientId] : []))
  );

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const isMultiClient = selectedRole && MULTI_CLIENT_ROLES.includes(selectedRole.key);

  function toggleClient(clientId: string) {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-[#15171c] px-4 py-3 text-sm text-white outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="roleId" className="block text-sm font-medium text-zinc-400 mb-2">
          Rol <span className="text-red-400">*</span>
        </label>
        <select
          id="roleId"
          name="roleId"
          required
          value={selectedRoleId}
          onChange={(e) => {
            setSelectedRoleId(e.target.value);
            setSelectedClientIds(new Set());
          }}
          className={inputCls}
        >
          <option value="">Selecciona un rol</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {isSuperAdmin && (
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">
            {isMultiClient ? "Clientes asignados" : "Cliente"}
          </label>

          {isMultiClient ? (
            /* Multi-select con checkboxes para AGENT */
            <div className="rounded-xl border border-white/10 bg-[#15171c] p-3 max-h-48 overflow-y-auto space-y-1">
              {clients.length === 0 ? (
                <p className="text-xs text-zinc-600">No hay clientes activos</p>
              ) : (
                clients.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-300 hover:bg-white/5 cursor-pointer transition"
                  >
                    <input
                      type="checkbox"
                      name="clientIds"
                      value={c.id}
                      checked={selectedClientIds.has(c.id)}
                      onChange={() => toggleClient(c.id)}
                      className="rounded border-white/20 bg-white/5 accent-[#38d84e]"
                    />
                    {c.name}
                  </label>
                ))
              )}
            </div>
          ) : (
            /* Single select para otros roles */
            <select
              id="clientId"
              name="clientId"
              value={[...selectedClientIds][0] ?? ""}
              onChange={(e) =>
                setSelectedClientIds(e.target.value ? new Set([e.target.value]) : new Set())
              }
              className={inputCls}
            >
              <option value="">Sin cliente (global)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {isMultiClient && selectedClientIds.size > 0 && (
            <p className="mt-1 text-xs text-zinc-500">
              {selectedClientIds.size} cliente{selectedClientIds.size !== 1 ? "s" : ""} seleccionado{selectedClientIds.size !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
