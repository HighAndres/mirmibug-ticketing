"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

// ── Guard helper ──────────────────────────────────────────────────────────────

async function requireAdmin(minRole?: "SUPERADMIN") {
  const session = await auth();
  if (!session) redirect("/login");
  const { user } = session;
  if (minRole === "SUPERADMIN" && user.roleKey !== "SUPERADMIN") {
    throw new Error("Solo el Superadmin puede realizar esta acción");
  }
  if (!["SUPERADMIN", "CLIENT_ADMIN"].includes(user.roleKey)) {
    throw new Error("No autorizado");
  }
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
  const clientId =
    actor.roleKey === "SUPERADMIN" ? rawClientId || null : actor.clientId ?? null;

  if (!name || !email || !password || !roleId) {
    throw new Error("Nombre, email, contraseña y rol son requeridos");
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password: hashed, roleId, clientId },
  });

  await prisma.auditLog.create({
    data: {
      action: "CREATE",
      entityType: "User",
      entityId: user.id,
      description: `Usuario ${email} creado`,
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
  const clientId =
    actor.roleKey === "SUPERADMIN" ? rawClientId || null : existing.clientId;
  const isActive = formData.get("isActive") === "on";

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

  await prisma.user.update({ where: { id }, data: { isActive: !user.isActive } });

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "User",
      entityId: id,
      description: `Usuario ${user.email} ${!user.isActive ? "activado" : "desactivado"}`,
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
  if (actor.roleKey === "CLIENT_ADMIN" && existing.clientId !== actor.clientId) {
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
  if (actor.roleKey === "CLIENT_ADMIN" && cat.clientId !== actor.clientId) {
    throw new Error("No autorizado");
  }
  if (cat._count.tickets > 0) {
    throw new Error("No se puede eliminar una categoría con tickets asociados");
  }

  await prisma.category.delete({ where: { id } });

  revalidatePath("/admin/categories");
}
