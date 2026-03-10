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

// ---------------------------------------------------------------------------
// Constantes de roles
// ---------------------------------------------------------------------------

/** Roles que pueden gestionar tickets de su tenant (asignar, cambiar estado, etc.) */
export const MANAGER_ROLES = ["SUPERADMIN", "CLIENT_ADMIN", "AGENT", "CLIENT_SUPERVISOR"] as const;

/** Roles que pueden administrar usuarios */
export const USER_ADMIN_ROLES = ["SUPERADMIN", "CLIENT_ADMIN"] as const;

/** Roles con acceso a reportes */
export const REPORT_ROLES = ["SUPERADMIN", "CLIENT_ADMIN", "AGENT", "CLIENT_SUPERVISOR"] as const;

/** Roles que no deben ser asignables por un CLIENT_ADMIN (roles globales / de nivel superior) */
const FORBIDDEN_ROLE_KEYS_FOR_CLIENT_ADMIN = ["SUPERADMIN"] as const;

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
 * ¿El usuario puede ver un ticket dado?
 *
 * Reglas:
 * - SUPERADMIN: acceso total
 * - CLIENT_ADMIN / AGENT / CLIENT_SUPERVISOR: mismo clientId
 * - CLIENT_USER: mismo clientId Y debe ser el solicitante (requesterId)
 */
export function canAccessTicket(user: SessionUser, ticket: TicketMinimal): boolean {
  if (user.roleKey === "SUPERADMIN") return true;

  // Distinto tenant → no
  if (user.clientId !== ticket.clientId) return false;

  // CLIENT_USER solo ve sus propios tickets
  if (user.roleKey === "CLIENT_USER") {
    return ticket.requesterId === user.id;
  }

  return true;
}

/**
 * ¿El usuario puede modificar un ticket? (cambiar estatus, comentar, etc.)
 * Misma lógica que canAccessTicket: si no puedes verlo, no puedes tocarlo.
 */
export function canModifyTicket(user: SessionUser, ticket: TicketMinimal): boolean {
  return canAccessTicket(user, ticket);
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
 */
export function isSameTenant(user: SessionUser, clientId: string): boolean {
  if (user.roleKey === "SUPERADMIN") return true;
  return user.clientId === clientId;
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
