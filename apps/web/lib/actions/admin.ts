"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import fs from "fs/promises";
import path from "path";
import { validateRoleAssignment, filterAssignableRoles } from "@/lib/permissions";
import { isValidHexColor } from "@/lib/colors";
import { getPublicPath, getAppDir } from "@/lib/uploads";

// ── Guard helpers ─────────────────────────────────────────────────────────────

async function requireAdmin(minRole?: "SUPERADMIN") {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { user } = session;
  if (minRole === "SUPERADMIN" && user.roleKey !== "SUPERADMIN") {
    throw new Error("Solo el Superadmin puede realizar esta acción");
  }
  if (!["SUPERADMIN", "CLIENT_ADMIN"].includes(user.roleKey)) {
    throw new Error("No autorizado");
  }
  return session;
}

async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function createUser(formData: FormData) {
  const session = await requireAdmin();
  const actor = session.user;

  const name = (formData.get("name") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const password = (formData.get("password") as string).trim();
  const roleId = formData.get("roleId") as string;
  const rawClientId = formData.get("clientId") as string;
  const clientIds = formData.getAll("clientIds") as string[];

  if (!name || !email || !password || !roleId) {
    throw new Error("Nombre, email, contraseña y rol son requeridos");
  }

  // Validar que el actor puede asignar este rol (anti escalación)
  await validateRoleAssignment(roleId, actor.roleKey, prisma);

  // Determinar si es un agente multi-cliente
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { key: true } });
  const isAgentRole = role?.key === "AGENT";

  // Para agentes: clientId=null, se usan clientIds vía UserClient
  // Para otros roles: clientId directo
  const clientId = isAgentRole && clientIds.length > 0
    ? null
    : actor.roleKey === "SUPERADMIN" ? rawClientId || null : actor.clientId ?? null;

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password: hashed, roleId, clientId },
  });

  // Crear asignaciones de clientes para agentes multi-cliente
  if (isAgentRole && clientIds.length > 0) {
    await prisma.userClient.createMany({
      data: clientIds
        .filter((id: string) => id.trim())
        .map((id: string) => ({ userId: user.id, clientId: id })),
    });
  }

  await prisma.auditLog.create({
    data: {
      action: "CREATE",
      entityType: "User",
      entityId: user.id,
      description: `Usuario ${email} creado${isAgentRole && clientIds.length > 0 ? ` con ${clientIds.length} clientes asignados` : ""}`,
      actorId: actor.id,
    },
  });

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function updateUser(id: string, formData: FormData) {
  const session = await requireAdmin();
  const actor = session.user;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error("Usuario no encontrado");
  if (actor.roleKey === "CLIENT_ADMIN" && existing.clientId !== actor.clientId) {
    throw new Error("No autorizado");
  }

  const name = (formData.get("name") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();
  const rawPassword = (formData.get("password") as string).trim();
  const roleId = formData.get("roleId") as string;
  const rawClientId = formData.get("clientId") as string;
  const clientIds = formData.getAll("clientIds") as string[];
  // El checkbox "Usuario activo" NO se muestra al editar la propia cuenta,
  // así que el campo no llega en el form. Si es la propia cuenta, conservar
  // el estado actual (nunca desactivarse a sí mismo desde este formulario).
  const isActive = id === actor.id ? existing.isActive : formData.get("isActive") === "on";

  // Validar que el actor puede asignar este rol (anti escalación)
  await validateRoleAssignment(roleId, actor.roleKey, prisma);

  // Determinar si es un agente multi-cliente
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { key: true } });
  const isAgentRole = role?.key === "AGENT";

  // Para agentes con clientes asignados: clientId=null, se usa UserClient
  const clientId = isAgentRole && clientIds.length > 0
    ? null
    : actor.roleKey === "SUPERADMIN" ? rawClientId || null : existing.clientId;

  const data: Record<string, unknown> = {
    name,
    email,
    roleId,
    clientId: clientId || null,
    isActive,
  };
  if (rawPassword) {
    data.password = await bcrypt.hash(rawPassword, 10);
  }

  await prisma.user.update({ where: { id }, data });

  // Actualizar asignaciones de clientes para agentes
  if (isAgentRole && actor.roleKey === "SUPERADMIN") {
    // Borrar todas las asignaciones actuales y recrear
    await prisma.userClient.deleteMany({ where: { userId: id } });
    if (clientIds.length > 0) {
      await prisma.userClient.createMany({
        data: clientIds
          .filter((cid: string) => cid.trim())
          .map((cid: string) => ({ userId: id, clientId: cid })),
      });
    }
  } else if (!isAgentRole) {
    // Si cambió de AGENT a otro rol, limpiar UserClient
    await prisma.userClient.deleteMany({ where: { userId: id } });
  }

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "User",
      entityId: id,
      description: `Usuario ${email} actualizado`,
      actorId: actor.id,
    },
  });

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function toggleUserActive(id: string) {
  const session = await requireAdmin();
  const actor = session.user;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("Usuario no encontrado");
  if (actor.roleKey === "CLIENT_ADMIN" && user.clientId !== actor.clientId) {
    throw new Error("No autorizado");
  }
  if (user.id === actor.id) throw new Error("No puedes desactivar tu propia cuenta");

  const newActive = !user.isActive;
  await prisma.user.update({
    where: { id },
    data: {
      isActive: newActive,
      // Al desactivar, invalidar todas las sesiones activas
      ...(!newActive && { tokenInvalidatedAt: new Date() }),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "User",
      entityId: id,
      description: `Usuario ${user.email} ${newActive ? "activado" : "desactivado"}`,
      actorId: actor.id,
    },
  });

  revalidatePath("/admin/users");
}

export async function invalidateUserSessions(id: string) {
  const session = await requireAdmin();
  const actor = session.user;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("Usuario no encontrado");
  if (actor.roleKey === "CLIENT_ADMIN" && user.clientId !== actor.clientId) {
    throw new Error("No autorizado");
  }
  if (user.id === actor.id) throw new Error("No puedes cerrar tu propia sesión desde aquí");

  await prisma.user.update({
    where: { id },
    data: { tokenInvalidatedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      action: "LOGOUT",
      entityType: "User",
      entityId: id,
      description: `Sesiones de ${user.email} invalidadas por administrador`,
      actorId: actor.id,
    },
  });

  revalidatePath("/admin/users");
}

export async function deleteUser(id: string) {
  const session = await requireAdmin("SUPERADMIN");
  const actor = session.user;

  if (id === actor.id) throw new Error("No puedes borrar tu propia cuenta");

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: { tickets: true, comments: true, ticketActivities: true, attachments: true },
      },
    },
  });
  if (!user) throw new Error("Usuario no encontrado");

  // Relaciones que impiden el borrado (FK Restrict). Las demás se limpian solas:
  // tickets asignados / prioridades validadas → null; userClients / permisos → cascade.
  const blocking =
    user._count.tickets +
    user._count.comments +
    user._count.ticketActivities +
    user._count.attachments;
  if (blocking > 0) {
    throw new Error(
      "No se puede borrar: el usuario tiene tickets, comentarios o actividad asociada. Desactívalo en su lugar."
    );
  }

  await prisma.user.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "User",
      entityId: id,
      description: `Usuario ${user.email} eliminado permanentemente`,
      actorId: actor.id,
    },
  });

  revalidatePath("/admin/users");
}

// ── Clients ───────────────────────────────────────────────────────────────────

export async function createClient(formData: FormData) {
  const session = await requireAdmin("SUPERADMIN");
  const actor = session.user;

  const name = (formData.get("name") as string).trim();
  const slug = (formData.get("slug") as string)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const contactEmail = (formData.get("contactEmail") as string).trim() || null;

  if (!name || !slug) throw new Error("Nombre y slug son requeridos");

  const client = await prisma.clientCompany.create({
    data: { name, slug, contactEmail },
  });

  await prisma.auditLog.create({
    data: {
      action: "CREATE",
      entityType: "ClientCompany",
      entityId: client.id,
      description: `Cliente "${name}" creado`,
      actorId: actor.id,
    },
  });

  revalidatePath("/admin/clients");
  redirect("/admin/clients");
}

export async function updateClient(id: string, formData: FormData) {
  const session = await requireAdmin("SUPERADMIN");
  const actor = session.user;

  const name = (formData.get("name") as string).trim();
  const slug = (formData.get("slug") as string)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const contactEmail = (formData.get("contactEmail") as string).trim() || null;
  const isActive = formData.get("isActive") === "on";

  if (!name || !slug) throw new Error("Nombre y slug son requeridos");

  await prisma.clientCompany.update({
    where: { id },
    data: { name, slug, contactEmail, isActive },
  });

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "ClientCompany",
      entityId: id,
      description: `Cliente "${name}" actualizado`,
      actorId: actor.id,
    },
  });

  revalidatePath("/admin/clients");
  redirect("/admin/clients");
}

export async function toggleClientActive(id: string) {
  const session = await requireAdmin("SUPERADMIN");
  const actor = session.user;

  const client = await prisma.clientCompany.findUnique({ where: { id } });
  if (!client) throw new Error("Cliente no encontrado");

  await prisma.clientCompany.update({ where: { id }, data: { isActive: !client.isActive } });

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "ClientCompany",
      entityId: id,
      description: `Cliente "${client.name}" ${!client.isActive ? "activado" : "desactivado"}`,
      actorId: actor.id,
    },
  });

  revalidatePath("/admin/clients");
}

export async function deleteClient(id: string) {
  const session = await requireAdmin("SUPERADMIN");
  const actor = session.user;

  const client = await prisma.clientCompany.findUnique({
    where: { id },
    include: { _count: { select: { users: true, tickets: true } } },
  });
  if (!client) throw new Error("Cliente no encontrado");

  if (client._count.tickets > 0) {
    throw new Error(
      "No se puede borrar: el cliente tiene tickets. Desactívalo en su lugar."
    );
  }
  if (client._count.users > 0) {
    throw new Error(
      "No se puede borrar: el cliente tiene usuarios. Reasígnalos o bórralos primero."
    );
  }

  // Borrar el logo del disco si existe (las categorías se eliminan en cascada)
  if (client.logoUrl) {
    const storedPath = client.logoUrl.split("?")[0];
    await fs.unlink(path.join(getAppDir(), "public", storedPath)).catch(() => {});
  }

  await prisma.clientCompany.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "ClientCompany",
      entityId: id,
      description: `Cliente "${client.name}" eliminado permanentemente`,
      actorId: actor.id,
    },
  });

  revalidatePath("/admin/clients");
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function createCategory(formData: FormData) {
  const session = await requireAdmin();
  const actor = session.user;

  const name = (formData.get("name") as string).trim();
  const description = (formData.get("description") as string).trim() || null;
  const clientId =
    actor.roleKey === "SUPERADMIN"
      ? (formData.get("clientId") as string)
      : actor.clientId!;

  if (!name || !clientId) throw new Error("Nombre y cliente son requeridos");

  const category = await prisma.category.create({
    data: { name, description, clientId },
  });

  await prisma.auditLog.create({
    data: {
      action: "CREATE",
      entityType: "Category",
      entityId: category.id,
      description: `Categoría "${name}" creada`,
      actorId: actor.id,
    },
  });

  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

export async function updateCategory(id: string, formData: FormData) {
  const session = await requireAdmin();
  const actor = session.user;

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new Error("Categoría no encontrada");
  if (actor.roleKey !== "SUPERADMIN" && existing.clientId !== actor.clientId) {
    throw new Error("No autorizado");
  }

  const name = (formData.get("name") as string).trim();
  const description = (formData.get("description") as string).trim() || null;

  if (!name) throw new Error("El nombre es requerido");

  await prisma.category.update({ where: { id }, data: { name, description } });

  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

export async function deleteCategory(id: string) {
  const session = await requireAdmin();
  const actor = session.user;

  const cat = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { tickets: true } } },
  });
  if (!cat) throw new Error("Categoría no encontrada");
  if (actor.roleKey !== "SUPERADMIN" && cat.clientId !== actor.clientId) {
    throw new Error("No autorizado");
  }
  if (cat._count.tickets > 0) {
    throw new Error("No se puede eliminar una categoría con tickets asociados");
  }

  await prisma.category.delete({ where: { id } });

  revalidatePath("/admin/categories");
}

// ── Subcategories ─────────────────────────────────────────────────────────────

export async function createSubcategory(formData: FormData) {
  const session = await requireAdmin();
  const actor = session.user;

  const name = (formData.get("name") as string).trim();
  const description = (formData.get("description") as string).trim() || null;
  const categoryId = formData.get("categoryId") as string;

  if (!name || !categoryId) throw new Error("Nombre y categoría son requeridos");

  // Verificar que la categoría pertenece al cliente del usuario
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new Error("Categoría no encontrada");
  if (actor.roleKey !== "SUPERADMIN" && category.clientId !== actor.clientId) {
    throw new Error("No autorizado");
  }

  await prisma.subcategory.create({
    data: { name, description, categoryId },
  });

  await prisma.auditLog.create({
    data: {
      action: "CREATE",
      entityType: "Subcategory",
      entityId: categoryId,
      description: `Subcategoría "${name}" creada en categoría "${category.name}"`,
      actorId: actor.id,
    },
  });

  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

export async function deleteSubcategory(id: string) {
  const session = await requireAdmin();
  const actor = session.user;

  const sub = await prisma.subcategory.findUnique({
    where: { id },
    include: { category: true, _count: { select: { tickets: true } } },
  });
  if (!sub) throw new Error("Subcategoría no encontrada");
  if (actor.roleKey !== "SUPERADMIN" && sub.category.clientId !== actor.clientId) {
    throw new Error("No autorizado");
  }
  if (sub._count.tickets > 0) {
    throw new Error("No se puede eliminar una subcategoría con tickets asociados");
  }

  await prisma.subcategory.delete({ where: { id } });

  revalidatePath("/admin/categories");
}

// ── Client branding ───────────────────────────────────────────────────────────

export async function updateClientBranding(id: string, formData: FormData) {
  const session = await requireAdmin("SUPERADMIN");
  const actor = session.user;

  const client = await prisma.clientCompany.findUnique({ where: { id } });
  if (!client) throw new Error("Cliente no encontrado");

  // Text / config fields
  const primaryColor = (formData.get("primaryColor") as string).trim() || null;
  const accentColor = (formData.get("accentColor") as string).trim() || null;
  const welcomeText = (formData.get("welcomeText") as string).trim() || null;
  const supportPhone = (formData.get("supportPhone") as string).trim() || null;
  const supportEmail = (formData.get("supportEmail") as string).trim() || null;
  const address = (formData.get("address") as string).trim() || null;
  const timezone = (formData.get("timezone") as string).trim() || "America/Mexico_City";
  const slaHoursRaw = parseInt(formData.get("slaHours") as string, 10);
  const slaHours = isNaN(slaHoursRaw) ? null : slaHoursRaw;
  const ticketPrefixRaw = (formData.get("ticketPrefix") as string)?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
  const ticketPrefix = ticketPrefixRaw ? ticketPrefixRaw.slice(0, 10) : null;

  if (primaryColor && !isValidHexColor(primaryColor)) {
    throw new Error("El color primario debe ser un hex válido, ej. #38d84e");
  }
  if (accentColor && !isValidHexColor(accentColor)) {
    throw new Error("El color de acento debe ser un hex válido, ej. #7CFF8D");
  }
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    throw new Error("El email de soporte no es válido");
  }

  // El prefijo de folio debe ser único entre clientes (el contador es por prefijo)
  if (ticketPrefix) {
    const prefixTaken = await prisma.clientCompany.findFirst({
      where: { ticketPrefix, NOT: { id } },
      select: { name: true },
    });
    if (prefixTaken) {
      throw new Error(`El prefijo "${ticketPrefix}" ya lo usa el cliente "${prefixTaken.name}"`);
    }
  }

  // Logo upload (optional)
  let logoUrl = client.logoUrl;
  const logoFile = formData.get("logo") as File | null;

  if (logoFile && logoFile.size > 0) {
    // SVG excluido a propósito: puede contener scripts (XSS almacenado)
    const extByMime: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
    };
    const ext = extByMime[logoFile.type];
    if (!ext) {
      throw new Error("Formato de imagen no soportado. Usa PNG, JPG o WebP.");
    }
    if (logoFile.size > 2 * 1024 * 1024) {
      throw new Error("El logo no puede superar 2 MB.");
    }

    const filename = `${id}.${ext}`;
    const uploadDir = getPublicPath("uploads", "logos");
    await fs.mkdir(uploadDir, { recursive: true });

    const bytes = await logoFile.arrayBuffer();
    await fs.writeFile(path.join(uploadDir, filename), Buffer.from(bytes));

    // Borrar el archivo anterior si tenía otra extensión
    const previousPath = client.logoUrl?.split("?")[0];
    if (previousPath && previousPath !== `/uploads/logos/${filename}`) {
      await fs.unlink(path.join(getAppDir(), "public", previousPath)).catch(() => {});
    }

    // ?v= rompe la caché del navegador cuando se reemplaza el logo
    logoUrl = `/uploads/logos/${filename}?v=${Date.now()}`;
  }

  await prisma.clientCompany.update({
    where: { id },
    data: {
      logoUrl,
      primaryColor,
      accentColor,
      welcomeText,
      supportPhone,
      supportEmail,
      address,
      timezone,
      slaHours,
      ticketPrefix,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "ClientCompany",
      entityId: id,
      description: `Branding de cliente "${client.name}" actualizado`,
      actorId: actor.id,
    },
  });

  revalidatePath(`/admin/clients/${id}/branding`);
  revalidatePath("/admin/clients");
}

export async function removeClientLogo(id: string) {
  const session = await requireAdmin("SUPERADMIN");
  const actor = session.user;

  const client = await prisma.clientCompany.findUnique({ where: { id } });
  if (!client) throw new Error("Cliente no encontrado");

  if (client.logoUrl) {
    // Quitar el query de cache-busting (?v=...) antes de resolver la ruta en disco
    const storedPath = client.logoUrl.split("?")[0];
    const filePath = path.join(getAppDir(), "public", storedPath);
    await fs.unlink(filePath).catch(() => {});
  }

  await prisma.clientCompany.update({ where: { id }, data: { logoUrl: null } });

  revalidatePath(`/admin/clients/${id}/branding`);
}

// ── Importar usuarios desde CSV ────────────────────────────────────────────────
// Formato esperado del CSV (con encabezado):
// name,email,password,role,clientId
// "Ana López",ana@empresa.com,Pass1234!,CLIENT_USER,<id opcional>

export type ImportRow = {
  row: number;
  name: string;
  email: string;
  status: "ok" | "error";
  error?: string;
};

export type ImportResult = {
  total: number;
  success: number;
  errors: number;
  rows: ImportRow[];
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export async function importUsers(
  _prev: ImportResult | null,
  formData: FormData
): Promise<ImportResult> {
  const session = await requireAdmin();
  const actor = session.user;

  const file = formData.get("csv") as File | null;
  if (!file || file.size === 0) {
    return { total: 0, success: 0, errors: 0, rows: [] };
  }

  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { total: 0, success: 0, errors: 1, rows: [{ row: 0, name: "", email: "", status: "error", error: "El archivo está vacío o solo contiene el encabezado." }] };
  }

  // Skip header row
  const dataLines = lines.slice(1);

  // Cache roles and clients for quick lookup.
  // Solo roles asignables por el actor (anti escalación: un CLIENT_ADMIN
  // no puede importar SUPERADMIN ni AGENT vía CSV).
  const allRoles = await prisma.role.findMany({ select: { id: true, key: true } });
  const roles = filterAssignableRoles(allRoles, actor.roleKey);
  const roleMap = Object.fromEntries(roles.map((r: (typeof roles)[number]) => [r.key.toUpperCase(), r.id]));

  const clients = actor.roleKey === "SUPERADMIN"
    ? await prisma.clientCompany.findMany({ select: { id: true, slug: true } })
    : [];
  // Acepta id o slug del cliente en la columna clientId del CSV
  const clientMap: Record<string, string> = {};
  for (const c of clients) {
    clientMap[c.id] = c.id;
    clientMap[c.slug] = c.id;
  }

  const rows: ImportRow[] = [];
  let success = 0;
  let errors = 0;

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = i + 2; // 1-indexed, +1 for header
    const parts = parseCsvLine(dataLines[i]);
    const [rawName, rawEmail, rawPassword, rawRole, rawClientId] = parts;

    const name = rawName?.trim() ?? "";
    const email = rawEmail?.trim().toLowerCase() ?? "";
    const password = rawPassword?.trim() ?? "";
    const roleKey = rawRole?.trim().toUpperCase() ?? "";
    const clientIdInput = rawClientId?.trim() ?? "";

    // Validation
    if (!name || !email || !password || !roleKey) {
      rows.push({ row: rowNum, name, email, status: "error", error: "Faltan campos requeridos (nombre, email, contraseña, rol)" });
      errors++;
      continue;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rows.push({ row: rowNum, name, email, status: "error", error: "Email inválido" });
      errors++;
      continue;
    }

    const roleId = roleMap[roleKey];
    if (!roleId) {
      rows.push({ row: rowNum, name, email, status: "error", error: `Rol desconocido: "${rawRole}". Valores válidos: ${Object.keys(roleMap).join(", ")}` });
      errors++;
      continue;
    }

    // Determine clientId
    let clientId: string | null = null;
    if (actor.roleKey === "SUPERADMIN") {
      if (clientIdInput) {
        clientId = clientMap[clientIdInput] ?? null;
        if (!clientId) {
          rows.push({ row: rowNum, name, email, status: "error", error: `Cliente no encontrado: "${clientIdInput}" (usa el id o el slug del cliente)` });
          errors++;
          continue;
        }
      }
    } else {
      clientId = actor.clientId ?? null;
    }

    try {
      await prisma.user.create({
        data: {
          name,
          email,
          password: await bcrypt.hash(password, 10),
          roleId,
          clientId,
        },
      });

      await prisma.auditLog.create({
        data: {
          action: "CREATE",
          entityType: "User",
          entityId: email,
          description: `Usuario ${email} importado desde CSV`,
          actorId: actor.id,
        },
      });

      rows.push({ row: rowNum, name, email, status: "ok" });
      success++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      const isDuplicate = msg.includes("Unique constraint") || msg.includes("unique");
      rows.push({
        row: rowNum,
        name,
        email,
        status: "error",
        error: isDuplicate ? "El email ya está registrado" : msg,
      });
      errors++;
    }
  }

  revalidatePath("/admin/users");

  return { total: dataLines.length, success, errors, rows };
}
