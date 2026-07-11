"use client";

import { useState } from "react";
import Link from "next/link";
import { invalidateUserSessions, toggleUserActive, deleteUser } from "@/lib/actions/admin";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

type UserRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roleName: string;
  roleKey: string;
  clientName: string | null;
  clientId: string | null;
  ticketCount: number;
  deletable: boolean;
  assignedClientNames: string[];
};

type ClientOption = {
  id: string;
  name: string;
};

export default function UsersTable({
  users,
  clients,
  isSuperAdmin,
  currentUserId,
}: {
  users: UserRow[];
  clients: ClientOption[];
  isSuperAdmin: boolean;
  currentUserId: string;
}) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Filtrar usuarios según tab, búsqueda, rol y estado
  const filtered = users.filter((u) => {
    // Tab filter
    if (activeTab === "global" && u.clientId !== null) return false;
    if (activeTab !== "all" && activeTab !== "global" && u.clientId !== activeTab) {
      // Para agentes multi-cliente, verificar assignedClientNames por ID no es posible aquí
      // Pero podemos dejarlos pasar si son globales y el tab es un cliente
      if (u.clientId === null && u.roleKey === "AGENT") {
        // Solo mostramos agentes en tab de cliente si están asignados a ese cliente
        // No tenemos el ID aquí así que los dejamos en "global"
        return false;
      }
      return false;
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !u.name.toLowerCase().includes(q) &&
        !u.email.toLowerCase().includes(q)
      )
        return false;
    }

    // Role filter
    if (roleFilter !== "all" && u.roleKey !== roleFilter) return false;

    // Status filter
    if (statusFilter === "active" && !u.isActive) return false;
    if (statusFilter === "inactive" && u.isActive) return false;

    return true;
  });

  // Tabs: Todos, Globales, + cada cliente
  const globalCount = users.filter((u) => u.clientId === null).length;
  const clientCounts = clients.map((c) => ({
    ...c,
    count: users.filter((u) => u.clientId === c.id).length,
  }));

  // Roles únicos para el filtro
  const uniqueRoles = Array.from(
    new Map(users.map((u) => [u.roleKey, u.roleName])).entries()
  );

  return (
    <div>
      {/* Tabs */}
      {isSuperAdmin && (
        <div className="border-b border-white/10 px-6">
          <div className="mx-auto max-w-7xl flex items-center gap-1 overflow-x-auto py-0 -mb-px">
            <TabButton
              active={activeTab === "all"}
              onClick={() => setActiveTab("all")}
              count={users.length}
            >
              Todos
            </TabButton>
            <TabButton
              active={activeTab === "global"}
              onClick={() => setActiveTab("global")}
              count={globalCount}
            >
              Globales
            </TabButton>
            {clientCounts.map((c) => (
              <TabButton
                key={c.id}
                active={activeTab === c.id}
                onClick={() => setActiveTab(c.id)}
                count={c.count}
              >
                {c.name}
              </TabButton>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mx-auto max-w-7xl px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#38d84e]/50 focus:ring-1 focus:ring-[#38d84e]/20 w-64"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50"
          >
            <option value="all">Todos los roles</option>
            {uniqueRoles.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-[#38d84e]/50"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <span className="ml-auto text-xs text-zinc-500">
            {filtered.length} de {users.length} usuario{users.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="mx-auto max-w-7xl px-6 pb-6">
        <div className="rounded-2xl border border-white/10 bg-[#22262e] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-zinc-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  {isSuperAdmin && (
                    <th className="px-5 py-3 font-medium">Cliente</th>
                  )}
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium text-center">Tickets</th>
                  <th className="px-5 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isSuperAdmin ? 7 : 6}
                      className="px-5 py-12 text-center text-zinc-500"
                    >
                      No se encontraron usuarios.
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => (
                    <tr
                      key={u.id}
                      className="border-t border-white/5 transition hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-white">{u.name}</p>
                        {u.roleKey === "AGENT" && u.assignedClientNames.length > 0 && (
                          <p className="mt-0.5 text-[10px] text-zinc-600">
                            {u.assignedClientNames.join(", ")}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">{u.email}</td>
                      {isSuperAdmin && (
                        <td className="px-5 py-3 text-zinc-400 text-xs">
                          {u.clientName ?? (
                            <span className="text-zinc-600 italic">Global</span>
                          )}
                        </td>
                      )}
                      <td className="px-5 py-3">
                        <span className="inline-flex rounded-full border border-[#38d84e]/30 bg-[#38d84e]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#7CFF8D]">
                          {u.roleName}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {u.isActive ? (
                          <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center text-xs text-zinc-500">
                        {u.ticketCount}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/admin/users/${u.id}/edit`}
                            className="text-xs text-zinc-400 hover:text-white transition"
                          >
                            Editar
                          </Link>
                          {u.id !== currentUserId && (
                            <>
                              <form action={toggleUserActive.bind(null, u.id)}>
                                <button
                                  type="submit"
                                  className={`text-xs transition ${
                                    u.isActive
                                      ? "text-red-400 hover:text-red-300"
                                      : "text-emerald-400 hover:text-emerald-300"
                                  }`}
                                >
                                  {u.isActive ? "Desactivar" : "Activar"}
                                </button>
                              </form>
                              {u.isActive && (
                                <form action={invalidateUserSessions.bind(null, u.id)}>
                                  <button
                                    type="submit"
                                    className="text-xs text-amber-400 hover:text-amber-300 transition"
                                  >
                                    Cerrar sesión
                                  </button>
                                </form>
                              )}
                              {isSuperAdmin && (
                                <ConfirmDeleteButton
                                  action={deleteUser.bind(null, u.id)}
                                  confirmMessage={`¿Borrar permanentemente a "${u.name}" (${u.email})? Esta acción no se puede deshacer.`}
                                  disabledReason={
                                    u.deletable
                                      ? undefined
                                      : "No se puede borrar: tiene tickets, comentarios o actividad. Desactívalo en su lugar."
                                  }
                                />
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition ${
        active
          ? "border-[#38d84e] text-white"
          : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
      <span
        className={`ml-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] ${
          active
            ? "bg-[#38d84e]/20 text-[#7CFF8D]"
            : "bg-white/5 text-zinc-600"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
