/**
 * Utilidades centralizadas de autorización.
 *
 * Reducen los hardcodes de roleKey dispersos por la app y proveen
 * funciones reutilizables para las validaciones más comunes.
 *
 * NOTA: A futuro estas funciones pueden consultar los permisos almacenados
 * en la base de datos (RolePermission / UserPermission) para gobernarse
 * de forma dinámica. Hoy encapsulan las reglas de negocio que antes
 * estaban repetidas inline.
 */

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Constantes de roles
// ---------------------------------------------------------------------------

/** Roles que pueden gestionar tickets de su tenant (asignar, cambiar estado, etc.) */
export const MANAGER_ROLES = ["SUPERADMIN", "CLIENT_ADMIN", "AGENT", "CLIENT_SUPERVISOR"] as const;

/** Roles que pueden administrar usuarios */
export const USER_ADMIN_ROLES = ["SUPERADMIN", "CLIENT_ADMIN"] as const;

/** Roles con acceso a reportes */
export const REPORT_ROLES = ["SUPERADMIN", "CLIENT_ADMIN", "AGENT", "CLIENT_SUPERVISOR"] as const;

/**
 * Roles que no deben ser asignables por un CLIENT_ADMIN.
 * - SUPERADMIN: nivel superior global
 * - AGENT: rol global/multi-tenant sin empresa fija; un CLIENT_ADMIN
 *   no debería poder crear agentes globales, solo usuarios de su empresa.
 */
const FORBIDDEN_ROLE_KEYS_FOR_CLIENT_ADMIN = ["SUPERADMIN", "AGENT"] as const;

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type RoleKey = string;

interface SessionUser {
  id: string;
  roleKey: RoleKey;
  clientId: string | null;
}

interface TicketMinimal {
  clientId: string;
  requesterId: string;
}

// ---------------------------------------------------------------------------
// Funciones de autorización
// ---------------------------------------------------------------------------

/**
 * ¿El usuario puede gestionar tickets? (asignar, cambiar estatus completo,
 * cambiar prioridad, validar prioridad).
 */
export function canManageTickets(roleKey: RoleKey): boolean {
  return (MANAGER_ROLES as readonly string[]).includes(roleKey);
}

/**
 * Obtiene los IDs de clientes asignados a un agente vía la tabla UserClient.
 * Para roles de cliente, retorna [clientId]. Para SUPERADMIN, retorna [].
 */
export async function getUserClientIds(userId: string, roleKey: RoleKey, clientId: string | null): Promise<string[]> {
  if (roleKey === "SUPERADMIN") return [];
  if (roleKey === "AGENT") {
    const rows = await prisma.userClient.findMany({
      where: { userId },
      select: { clientId: true },
    });
    return rows.map((r: (typeof rows)[number]) => r.clientId);
  }
  // Roles de cliente: retornan su clientId directo
  return clientId ? [clientId] : [];
}

/**
 * ¿El usuario puede ver un ticket dado?
 *
 * Reglas:
 * - SUPERADMIN: acceso total
 * - CLIENT_ADMIN / CLIENT_SUPERVISOR: mismo clientId directo
 * - AGENT: mismo clientId directo O a través de userClients
 * - CLIENT_USER: mismo clientId Y debe ser el solicitante (requesterId)
 *
 * Para AGENT con múltiples clientes, pasar agentClientIds precargados.
 */
export function canAccessTicket(
  user: SessionUser,
  ticket: TicketMinimal,
  agentClientIds?: string[],
): boolean {
  if (user.roleKey === "SUPERADMIN") return true;

  // CLIENT_USER: mismo tenant Y debe ser el solicitante
  if (user.roleKey === "CLIENT_USER") {
    return user.clientId === ticket.clientId && ticket.requesterId === user.id;
  }

  // Roles de gestión: mismo clientId directo
  if (user.clientId === ticket.clientId) return true;

  // AGENT multi-cliente: verificar via tabla de asignaciones
  if (user.roleKey === "AGENT" && agentClientIds?.includes(ticket.clientId)) return true;

  return false;
}

/**
 * ¿El usuario puede modificar un ticket? (cambiar estatus, comentar, etc.)
 * Misma lógica que canAccessTicket: si no puedes verlo, no puedes tocarlo.
 */
export function canModifyTicket(user: SessionUser, ticket: TicketMinimal, agentClientIds?: string[]): boolean {
  return canAccessTicket(user, ticket, agentClientIds);
}

/**
 * ¿El usuario puede escribir notas internas?
 * Solo roles de gestión, nunca CLIENT_USER.
 */
export function canWriteInternalNotes(roleKey: RoleKey): boolean {
  return roleKey !== "CLIENT_USER";
}

/**
 * ¿El usuario tiene acceso a reportes?
 */
export function canViewReports(roleKey: RoleKey): boolean {
  return (REPORT_ROLES as readonly string[]).includes(roleKey);
}

/**
 * ¿El usuario puede administrar otros usuarios? (crear, editar, toggle)
 */
export function canAdminUsers(roleKey: RoleKey): boolean {
  return (USER_ADMIN_ROLES as readonly string[]).includes(roleKey);
}

/**
 * ¿Es multitenencia global? (SUPERADMIN no tiene restricción de tenant)
 */
export function isSuperAdmin(roleKey: RoleKey): boolean {
  return roleKey === "SUPERADMIN";
}

/**
 * Verifica que el ticket pertenezca al mismo tenant del usuario.
 * SUPERADMIN no tiene restricción.
 * Para AGENT con múltiples clientes, pasar agentClientIds precargados.
 */
export function isSameTenant(user: SessionUser, clientId: string, agentClientIds?: string[]): boolean {
  if (user.roleKey === "SUPERADMIN") return true;
  if (user.clientId === clientId) return true;
  if (user.roleKey === "AGENT" && agentClientIds?.includes(clientId)) return true;
  return false;
}

/**
 * Versión async de isSameTenant que consulta la DB para agentes multi-cliente.
 */
export async function isSameTenantAsync(user: SessionUser, clientId: string): Promise<boolean> {
  if (user.roleKey === "SUPERADMIN") return true;
  if (user.clientId === clientId) return true;
  if (user.roleKey === "AGENT") {
    const assignment = await prisma.userClient.findFirst({
      where: { userId: user.id, clientId },
    });
    return !!assignment;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Validación de asignación de roles (anti escalación de privilegios)
// ---------------------------------------------------------------------------

/**
 * Filtra la lista de roles según lo que el actor puede asignar.
 * - SUPERADMIN: cualquier rol
 * - CLIENT_ADMIN: solo roles que no sean SUPERADMIN
 *
 * Usar tanto en frontend (filtrar el <select>) como en backend (validar el roleId).
 */
export function filterAssignableRoles<T extends { key: string }>(
  roles: T[],
  actorRoleKey: RoleKey
): T[] {
  if (actorRoleKey === "SUPERADMIN") return roles;

  return roles.filter(
    (r) => !(FORBIDDEN_ROLE_KEYS_FOR_CLIENT_ADMIN as readonly string[]).includes(r.key)
  );
}

/**
 * Valida que un roleId sea asignable por el actor.
 * Lanza error si detecta intento de escalación.
 */
export async function validateRoleAssignment(
  roleId: string,
  actorRoleKey: RoleKey,
  prismaInstance: { role: { findUnique: (args: { where: { id: string }; select: { key: boolean } }) => Promise<{ key: string } | null> } }
): Promise<void> {
  if (actorRoleKey === "SUPERADMIN") return; // puede asignar cualquier rol

  const role = await prismaInstance.role.findUnique({
    where: { id: roleId },
    select: { key: true },
  });

  if (!role) throw new Error("Rol no encontrado");

  if ((FORBIDDEN_ROLE_KEYS_FOR_CLIENT_ADMIN as readonly string[]).includes(role.key)) {
    throw new Error("No tienes permisos para asignar este rol");
  }
}
